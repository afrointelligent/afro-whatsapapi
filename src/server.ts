import 'dotenv/config'
import crypto from 'node:crypto'
import cors from 'cors'
import express, { type Request, type Response } from 'express'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { createProxyMiddleware } from 'http-proxy-middleware'
import { GridFSBucket, ObjectId } from 'mongodb'
import multer from 'multer'
import nodemailer from 'nodemailer'
import { ensureWhatsappIndexes, getConnectionForPhoneId, getDb, recordMessageStatus, recordOutboundMessage, recordWebhookMessage, type WhatsAppConnection } from './db.js'
import { consumePasswordResetToken, createPasswordResetToken, expiredSessionCookie, loginUser, readCookie, readSession, registerOwner, sessionCookie, signSession, verifyPassword } from './auth.js'

type AutomationMode = 'AI_ACTIVE' | 'HUMAN_ACTIVE'
type StoredMessage = { id: string; direction: 'inbound' | 'outbound'; content: string; timestamp: string; type: string }
type Conversation = { id: string; customerPhone: string; customerName: string; automationMode: AutomationMode; unreadCount: number; lastMessageAt: string; messages: StoredMessage[]; stage: 'NEW' | 'SERVICE' | 'TIME' | 'PAYMENT_PENDING' | 'CONFIRMED'; selectedTime?: string; paymentReference?: string; paymentStatus: 'NONE' | 'PENDING' | 'PAID'; bookingStatus: 'NONE' | 'RESERVED' | 'CONFIRMED' }
type Activity = { id: string; at: string; title: string; detail: string; tone: 'info' | 'success' }

const port = Number(process.env.PORT ?? 3001)
const projectDirectory = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..')
const apiVersion = process.env.META_API_VERSION ?? 'v22.0'
const serviceRelease = 'canonical-domain-2026-08-15.1'
const canonicalProductionOrigin = 'https://automate.afrointelligent.co.za'
const app = express()
const verificationUpload = multer({ storage: multer.memoryStorage(), limits: { fileSize: 10 * 1024 * 1024, files: 1 }, fileFilter: (_req, file, callback) => callback(null, ['application/pdf', 'image/jpeg', 'image/png'].includes(file.mimetype)) })
const conversations = new Map<string, Conversation>()
const processedMessageIds = new Set<string>()
const activities: Activity[] = []

function addActivity(title: string, detail: string, tone: Activity['tone'] = 'info') {
  activities.unshift({ id: crypto.randomUUID(), at: new Date().toISOString(), title, detail, tone })
  activities.splice(24)
}

function publicApplicationUrl() {
  return process.env.PUBLIC_API_URL || process.env.PRODUCT_BASE_URL || (process.env.NODE_ENV === 'production' ? canonicalProductionOrigin : `http://localhost:${port}`)
}

function credentialEncryptionKey() {
  const secret = process.env.CREDENTIAL_ENCRYPTION_KEY || process.env.SESSION_SECRET
  if (!secret || secret.length < 32) throw new Error('CREDENTIAL_ENCRYPTION_KEY must contain at least 32 characters')
  return crypto.createHash('sha256').update(secret).digest()
}

function encryptCredential(value: string) {
  if (!value) return ''
  const iv = crypto.randomBytes(12)
  const cipher = crypto.createCipheriv('aes-256-gcm', credentialEncryptionKey(), iv)
  const encrypted = Buffer.concat([cipher.update(value, 'utf8'), cipher.final()])
  return `${iv.toString('base64url')}.${cipher.getAuthTag().toString('base64url')}.${encrypted.toString('base64url')}`
}

function credentialHint(value: string) {
  const clean = value.trim()
  return clean.length <= 4 ? 'Configured' : `Ends in ${clean.slice(-4)}`
}

const forgotPasswordMessage = 'If an account exists for that email, we’ve sent password reset instructions.'

function passwordResetTransport() {
  const host = process.env.SMTP_HOST
  const user = process.env.SMTP_USER
  const pass = process.env.SMTP_PASS
  if (!host || !user || !pass) throw new Error('SMTP email delivery is not configured.')
  const port = Number(process.env.SMTP_PORT || 465)
  return nodemailer.createTransport({ host, port, secure: port === 465, auth: { user, pass } })
}

async function passwordResetAllowed(db: Awaited<ReturnType<typeof getDb>>, email: string, ip: string) {
  const now = new Date()
  const expiresAt = new Date(now.getTime() + 15 * 60 * 1000)
  const keys = [`email:${email}`, `ip:${ip}`].map(value => crypto.createHash('sha256').update(value).digest('hex'))
  for (const key of keys) {
    const current = await db.collection('passwordResetRateLimits').findOne({ key })
    if (!current || current.expiresAt <= now) {
      await db.collection('passwordResetRateLimits').updateOne({ key }, { $set: { count: 1, expiresAt, updatedAt: now } }, { upsert: true })
      continue
    }
    const updated = await db.collection('passwordResetRateLimits').findOneAndUpdate({ key, expiresAt: { $gt: now } }, { $inc: { count: 1 }, $set: { updatedAt: now } }, { returnDocument: 'after' })
    if (Number(updated?.count || 0) > 5) return false
  }
  return true
}

async function sendPasswordResetEmail(email: string, firstName: string | undefined, token: string) {
  const baseUrl = publicApplicationUrl().replace(/\/$/, '')
  const resetUrl = `${baseUrl}/reset-password?token=${encodeURIComponent(token)}`
  const from = process.env.SMTP_FROM || process.env.FROM_EMAIL || process.env.SMTP_USER
  await passwordResetTransport().sendMail({
    from,
    to: email,
    subject: 'Reset your AfroIntelligent password',
    text: `Hello${firstName ? ` ${firstName}` : ''},\n\nUse this link to reset your AfroIntelligent password. It expires in 45 minutes and can be used once:\n\n${resetUrl}\n\nIf you did not request this, you can ignore this email.`,
    html: `<p>Hello${firstName ? ` ${firstName}` : ''},</p><p>Use the button below to reset your AfroIntelligent password. This link expires in 45 minutes and can be used once.</p><p><a href="${resetUrl}" style="display:inline-block;padding:12px 18px;border-radius:999px;background:#168e4c;color:#fff;text-decoration:none;font-weight:700">Reset password</a></p><p>If you did not request this, you can ignore this email.</p>`,
  })
}

const configuredOrigins = process.env.FRONTEND_URL?.split(',').map(origin => origin.trim().replace(/\/$/, '')).filter(Boolean) ?? []
const productionOrigins = [...new Set([canonicalProductionOrigin, ...configuredOrigins])]
const localOrigins = [...new Set([...configuredOrigins, 'http://localhost:3001', 'http://127.0.0.1:3001', 'http://localhost:3000', 'http://localhost:3002'])]
app.use(cors({
  credentials: true,
  origin(origin, callback) {
    if (!origin) return callback(null, true)
    const trusted = process.env.NODE_ENV === 'production' ? productionOrigins : localOrigins
    if (trusted.includes(origin.replace(/\/$/, ''))) return callback(null, true)
    callback(new Error('Origin is not allowed by CORS'), false)
  },
}))
app.use(express.json({ verify: (req, _res, buf) => { (req as Request & { rawBody?: Buffer }).rawBody = buf } }))
app.use(express.static(path.join(projectDirectory, 'public')))

function requireSession(req: Request, res: Response) {
  try {
    const session = readSession(readCookie(req.header('cookie')))
    if (!session) { res.status(401).json({ error: 'Authentication required.' }); return null }
    return session
  } catch (error) {
    res.status(503).json({ error: error instanceof Error ? error.message : 'Authentication is unavailable.' }); return null
  }
}

async function requirePlatformAdmin(req: Request, res: Response) {
  const session = requireSession(req, res)
  if (!session) return null
  const user = await (await getDb()).collection('users').findOne({ _id: session.userId }, { projection: { platformAdmin: 1 } })
  if (!user?.platformAdmin) { res.status(403).json({ error: 'Platform administrator access is required.' }); return null }
  return session
}

function requireInternalKey(req: Request, res: Response) {
  const key = process.env.INTERNAL_API_KEY
  const received = req.header('authorization')?.replace(/^Bearer\s+/i, '')
  if (!key) { res.status(503).json({ error: 'Internal API key is not configured.' }); return false }
  if (!received) { res.status(404).end(); return false }
  const expected = Buffer.from(key)
  const actual = Buffer.from(received)
  if (actual.length !== expected.length || !crypto.timingSafeEqual(actual, expected)) { res.status(404).end(); return false }
  return true
}

app.post('/api/auth/register', async (req, res) => {
  try {
    const body = req.body ?? {}
    const record = await registerOwner(await getDb(), { firstName: String(body.firstName || ''), lastName: String(body.lastName || ''), email: String(body.email || ''), password: String(body.password || ''), businessName: String(body.businessName || ''), industry: String(body.industry || ''), country: String(body.country || ''), businessPhone: String(body.businessPhone || '') })
    const token = signSession({ userId: record.user._id, tenantId: record.tenant._id, role: record.role, email: record.user.email, name: `${record.user.firstName} ${record.user.lastName}` })
    res.setHeader('Set-Cookie', sessionCookie(token))
    res.status(201).json({ ok: true, redirectTo: '/app', tenant: { id: String(record.tenant._id), name: record.tenant.name } })
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Registration failed.'
    if (message.includes('MONGODB_URI') || message.includes('SESSION_SECRET')) {
      console.error('Workspace registration configuration error:', message)
      return res.status(503).json({ error: 'Workspace registration is temporarily unavailable. Please try again shortly.' })
    }
    res.status(400).json({ error: message })
  }
})

app.post('/api/auth/login', async (req, res) => {
  try {
    const record = await loginUser(await getDb(), String(req.body?.email || ''), String(req.body?.password || ''))
    if (!record) return res.status(401).json({ error: 'Invalid email or password.' })
    const token = signSession({ userId: record.user._id, tenantId: record.tenantId, role: record.role, email: record.user.email, name: `${record.user.firstName} ${record.user.lastName}` })
    res.setHeader('Set-Cookie', sessionCookie(token))
    res.json({ ok: true, redirectTo: record.platformAdmin ? '/admin' : '/app' })
  } catch (error) {
    res.status(503).json({ error: error instanceof Error ? error.message : 'Login is unavailable.' })
  }
})

app.post('/api/auth/logout', (_req, res) => { res.setHeader('Set-Cookie', expiredSessionCookie()); res.status(204).end() })
app.post('/api/auth/forgot-password', async (req, res) => {
  const email = String(req.body?.email || '').trim().toLowerCase()
  res.status(202)
  if (!/^\S+@\S+\.\S+$/.test(email)) return res.json({ message: forgotPasswordMessage })
  try {
    const db = await getDb()
    if (!(await passwordResetAllowed(db, email, req.ip || req.socket.remoteAddress || 'unknown'))) return res.json({ message: forgotPasswordMessage })
    const reset = await createPasswordResetToken(db, email)
    if (reset) {
      try { await sendPasswordResetEmail(reset.user.email, reset.user.firstName, reset.token) }
      catch (error) {
        await db.collection('passwordResetTokens').updateOne({ tokenHash: reset.tokenHash }, { $set: { usedAt: new Date(), invalidatedReason: 'delivery_failed' } })
        console.error('Password reset email delivery failed:', error instanceof Error ? error.message : 'unknown error')
      }
    }
  } catch (error) {
    console.error('Password reset request failed:', error instanceof Error ? error.message : 'unknown error')
  }
  res.json({ message: forgotPasswordMessage })
})

app.post('/api/auth/reset-password', async (req, res) => {
  const token = String(req.body?.token || '')
  const password = String(req.body?.password || '')
  const confirmPassword = String(req.body?.confirmPassword || '')
  if (password !== confirmPassword) return res.status(400).json({ error: 'Passwords do not match.' })
  try {
    const changed = await consumePasswordResetToken(await getDb(), token, password)
    if (!changed) return res.status(400).json({ error: 'This reset link is invalid, expired, or has already been used.' })
    res.setHeader('Set-Cookie', expiredSessionCookie())
    res.json({ ok: true, redirectTo: '/login?passwordReset=1' })
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Password could not be reset.'
    res.status(message.includes('12 characters') ? 400 : 503).json({ error: message })
  }
})
app.get('/api/auth/me', async (req, res) => {
  const session = requireSession(req, res)
  if (!session) return
  const db = await getDb()
  const [tenant, user] = await Promise.all([db.collection('tenants').findOne({ _id: session.tenantId }, { projection: { name: 1, industry: 1, country: 1, businessPhone: 1, status: 1, workspaceSetup: 1 } }), db.collection('users').findOne({ _id: session.userId }, { projection: { platformAdmin: 1 } })])
  res.json({ user: { id: String(session.userId), email: session.email, name: session.name, role: session.role, platformAdmin: Boolean(user?.platformAdmin) }, tenant: tenant ? { id: String(tenant._id), ...tenant } : null })
})

app.post('/api/internal/meta-review/provision', async (req, res) => {
  if (!requireInternalKey(req, res)) return
  const phoneNumberId = process.env.WHATSAPP_PHONE_NUMBER_ID
  if (!phoneNumberId) return res.status(503).json({ error: 'WHATSAPP_PHONE_NUMBER_ID is not configured.' })
  const db = await getDb()
  const now = new Date()
  const requestedTenantId = String(req.body?.tenantId || '').trim()
  let tenant
  if (requestedTenantId) {
    if (!ObjectId.isValid(requestedTenantId)) return res.status(400).json({ error: 'Invalid tenant id.' })
    tenant = await db.collection('tenants').findOne({ _id: new ObjectId(requestedTenantId) })
    if (!tenant) return res.status(404).json({ error: 'Tenant not found.' })
    await db.collection('tenants').updateOne(
      { _id: tenant._id },
      { $set: { reviewMode: true, industry: tenant.industry || 'Driving School', updatedAt: now } },
    )
  } else {
    const slug = 'afro-drive-academy-meta-review'
    await db.collection('tenants').updateOne(
      { slug },
      { $set: { name: 'Afro Drive Academy - Meta Review', slug, industry: 'Driving School', country: 'South Africa', status: 'ACTIVE', reviewMode: true, description: 'Controlled Meta App Review workspace using the approved Meta test number.', openingHours: 'Mon-Sat, 08:00-17:00', updatedAt: now }, $setOnInsert: { createdAt: now } },
      { upsert: true },
    )
    tenant = await db.collection('tenants').findOne({ slug })
  }
  if (!tenant) return res.status(500).json({ error: 'Review tenant could not be prepared.' })
  await db.collection('businessServices').updateOne(
    { tenantId: tenant._id, name: 'Driving Lesson' },
    { $set: { tenantId: tenant._id, name: 'Driving Lesson', description: '60-minute driving lesson', price: 450, durationMinutes: 60, active: true, bookingAllowed: true, updatedAt: now }, $setOnInsert: { createdAt: now } },
    { upsert: true },
  )
  await db.collection('whatsappConnections').updateOne(
    { phoneNumberId },
    { $set: { tenantId: tenant._id, phoneNumberId, wabaId: process.env.WHATSAPP_BUSINESS_ACCOUNT_ID || '', connectionType: 'META_TEST_NUMBER', status: 'CONNECTED', updatedAt: now }, $setOnInsert: { createdAt: now } },
    { upsert: true },
  )
  await db.collection('auditLogs').insertOne({ tenantId: tenant._id, action: 'META_REVIEW_TENANT_PROVISIONED', createdAt: now, metadata: { local: process.env.NODE_ENV !== 'production' } })
  res.json({ ok: true, tenantId: String(tenant._id), tenantName: tenant.name, phoneNumberIdConfigured: true })
})

app.delete('/api/workspace/account', async (req, res) => {
  const session = requireSession(req, res)
  if (!session) return
  if (session.role !== 'OWNER') return res.status(403).json({ error: 'Only the workspace owner can delete this account.' })
  const password = String(req.body?.password || '')
  const confirmation = String(req.body?.confirmation || '').trim().toUpperCase()
  if (confirmation !== 'DELETE MY WORKSPACE') return res.status(400).json({ error: 'Type DELETE MY WORKSPACE to confirm.' })
  const db = await getDb()
  const user = await db.collection('users').findOne({ _id: session.userId }, { projection: { passwordHash: 1 } })
  if (!user?.passwordHash || !(await verifyPassword(password, String(user.passwordHash)))) return res.status(401).json({ error: 'Your password is incorrect.' })

  const [memberships, verificationDocuments] = await Promise.all([
    db.collection('tenantMemberships').find({ tenantId: session.tenantId }, { projection: { userId: 1 } }).toArray(),
    db.collection('verificationDocuments').find({ tenantId: session.tenantId }, { projection: { fileId: 1 } }).toArray(),
  ])
  const requestedAt = new Date()
  await db.collection('auditLogs').insertOne({ tenantId: session.tenantId, userId: session.userId, action: 'WORKSPACE_DELETION_STARTED', createdAt: requestedAt })
  const bucket = new GridFSBucket(db, { bucketName: 'verificationFiles' })
  for (const document of verificationDocuments) {
    if (document.fileId instanceof ObjectId) await bucket.delete(document.fileId).catch(() => undefined)
  }

  const tenantCollections = ['whatsappConnections', 'whatsappConversations', 'whatsappMessages', 'processedWhatsAppEvents', 'verificationDocuments', 'paymentConnections', 'auditLogs']
  await Promise.all(tenantCollections.map(collection => db.collection(collection).deleteMany({ tenantId: session.tenantId })))
  await db.collection('tenantMemberships').deleteMany({ tenantId: session.tenantId })
  const memberUserIds = memberships.map(membership => membership.userId).filter((id): id is ObjectId => id instanceof ObjectId)
  const orphanedUserIds: ObjectId[] = []
  for (const userId of memberUserIds) {
    if (await db.collection('tenantMemberships').countDocuments({ userId }) === 0) orphanedUserIds.push(userId)
  }
  if (orphanedUserIds.length) await db.collection('users').deleteMany({ _id: { $in: orphanedUserIds }, platformAdmin: { $ne: true } })
  await db.collection('tenants').deleteOne({ _id: session.tenantId })
  await db.collection('privacyDeletionRecords').insertOne({ requestId: crypto.randomUUID(), tenantHash: crypto.createHash('sha256').update(String(session.tenantId)).digest('hex'), completedAt: new Date(), method: 'authenticated_owner_deletion' })
  res.setHeader('Set-Cookie', expiredSessionCookie())
  res.json({ ok: true, deleted: true })
})

app.put('/api/workspace/setup', async (req, res) => {
  const session = requireSession(req, res)
  if (!session) return
  const businessDescription = String(req.body?.businessDescription || '').trim()
  const services = Array.isArray(req.body?.services) ? req.body.services.map((value: unknown) => String(value).trim()).filter(Boolean).slice(0, 20) : []
  const hours = String(req.body?.hours || '').trim()
  if (!businessDescription || !services.length || !hours) return res.status(400).json({ error: 'Add a short description, at least one service, and your business hours.' })
  const now = new Date()
  await (await getDb()).collection('tenants').updateOne(
    { _id: session.tenantId },
    { $set: { workspaceSetup: { businessDescription, services, hours, completedAt: now }, updatedAt: now } },
  )
  await (await getDb()).collection('auditLogs').insertOne({ tenantId: session.tenantId, userId: session.userId, action: 'BUSINESS_SETUP_COMPLETED', createdAt: now })
  res.json({ ok: true })
})

type FlowNodeType = 'START' | 'MESSAGE' | 'QUESTION' | 'SERVICE_CHOICE' | 'DECISION' | 'BOOKING' | 'PAYMENT' | 'HANDOVER'
const flowNodeTypes: readonly FlowNodeType[] = ['START', 'MESSAGE', 'QUESTION', 'SERVICE_CHOICE', 'DECISION', 'BOOKING', 'PAYMENT', 'HANDOVER']
const paymentProviders = ['PAYFAST', 'YOCO', 'OZOW', 'PEACH_PAYMENTS', 'PAYGATE', 'STRIPE', 'PAYPAL', 'NETCASH', 'IKHOKHA', 'SNAPSCAN', 'ZAPPER', 'PAYFLEX', 'MOBICRED', 'PAYJUSTNOW', 'APPLE_PAY', 'GOOGLE_PAY', 'EFT', 'DEBIT_ORDER', 'MOBILE_MONEY', 'CASH', 'CARD_ON_SITE', 'INVOICE', 'CUSTOM_LINK', 'OTHER'] as const
const paymentAmountModes = ['FULL_AMOUNT', 'DEPOSIT', 'FIXED_AMOUNT', 'DYNAMIC_AMOUNT', 'INVOICE_TOTAL'] as const
function sanitiseFlowNodeConfig(node: any) {
  if (node?.type !== 'PAYMENT') return {}
  const provider = paymentProviders.includes(node?.config?.provider) ? node.config.provider : 'PAYFAST'
  const amountMode = paymentAmountModes.includes(node?.config?.amountMode) ? node.config.amountMode : 'DYNAMIC_AMOUNT'
  const amount = Math.max(0, Math.min(10_000_000, Number(node?.config?.amount) || 0))
  return {
    provider,
    amountMode,
    amount,
    currency: String(node?.config?.currency || 'ZAR').replace(/[^A-Z]/g, '').slice(0, 3) || 'ZAR',
    paymentLink: String(node?.config?.paymentLink || '').trim().slice(0, 500),
    instructions: String(node?.config?.instructions || '').trim().slice(0, 500),
  }
}

app.get('/api/workspace/flows', async (req, res) => {
  const session = requireSession(req, res)
  if (!session) return
  const tenant = await (await getDb()).collection('tenants').findOne({ _id: session.tenantId }, { projection: { automationFlows: 1 } })
  res.json({ flows: Array.isArray(tenant?.automationFlows) ? tenant.automationFlows : [] })
})

app.put('/api/workspace/flows/:flowId', async (req, res) => {
  const session = requireSession(req, res)
  if (!session) return
  if (!canManageVerification(session)) return res.status(403).json({ error: 'Only workspace owners and administrators can update flows.' })
  const name = String(req.body?.name || '').trim().slice(0, 100)
  const nodes = Array.isArray(req.body?.nodes) ? req.body.nodes.slice(0, 50).map((node: any, index: number) => ({
    id: String(node?.id || crypto.randomUUID()).slice(0, 80),
    type: flowNodeTypes.includes(node?.type) ? node.type : 'MESSAGE',
    label: String(node?.label || '').trim().slice(0, 280),
    x: Math.max(24, Math.min(2200, Number.isFinite(Number(node?.x)) ? Number(node.x) : 80 + (index % 3) * 260)),
    y: Math.max(24, Math.min(1600, Number.isFinite(Number(node?.y)) ? Number(node.y) : 70 + Math.floor(index / 3) * 180)),
    config: sanitiseFlowNodeConfig(node),
  })).filter((node: any) => node.label) : []
  if (!name || !nodes.length) return res.status(400).json({ error: 'Give the flow a name and add at least one step.' })
  const nodeIds = new Set(nodes.map((node: any) => node.id))
  const edges = Array.isArray(req.body?.edges) ? req.body.edges.slice(0, 100).map((edge: any) => ({
    id: String(edge?.id || crypto.randomUUID()).slice(0, 80),
    source: String(edge?.source || '').slice(0, 80),
    target: String(edge?.target || '').slice(0, 80),
    label: String(edge?.label || '').trim().slice(0, 40),
  })).filter((edge: any) => edge.source !== edge.target && nodeIds.has(edge.source) && nodeIds.has(edge.target)) : []
  const db = await getDb(); const now = new Date(); const flow = { id: req.params.flowId === 'new' ? crypto.randomUUID() : req.params.flowId, name, nodes, edges, version: 2, updatedAt: now }
  await db.collection('tenants').updateOne({ _id: session.tenantId }, { $set: { 'automationFlows': [flow], updatedAt: now } })
  await db.collection('auditLogs').insertOne({ tenantId: session.tenantId, userId: session.userId, action: 'AUTOMATION_FLOW_SAVED', createdAt: now, metadata: { flowId: flow.id, nodeCount: nodes.length, edgeCount: edges.length } })
  res.json({ ok: true, flow })
})

app.get('/api/workspace/payment-connections', async (req, res) => {
  const session = requireSession(req, res)
  if (!session) return
  const connections = await (await getDb()).collection('paymentConnections').find({ tenantId: session.tenantId }, { projection: { provider: 1, environment: 1, status: 1, credentialHints: 1, updatedAt: 1 } }).toArray()
  res.json({ connections: connections.map(connection => ({ id: String(connection._id), provider: connection.provider, environment: connection.environment, status: connection.status, credentialHints: connection.credentialHints || {}, updatedAt: connection.updatedAt })) })
})

app.put('/api/workspace/payment-connections/:provider', async (req, res) => {
  const session = requireSession(req, res)
  if (!session) return
  if (!canManageVerification(session)) return res.status(403).json({ error: 'Only workspace owners and administrators can configure payment connections.' })
  const provider = String(req.params.provider || '').toUpperCase()
  if (!paymentProviders.includes(provider as any) || ['EFT', 'CASH', 'CARD_ON_SITE', 'INVOICE', 'CUSTOM_LINK', 'OTHER'].includes(provider)) return res.status(400).json({ error: 'Choose a supported online payment provider.' })
  const environment = req.body?.environment === 'LIVE' ? 'LIVE' : 'TEST'
  const inputCredentials = req.body?.credentials && typeof req.body.credentials === 'object' ? req.body.credentials : {}
  const allowedFields = ['merchantId', 'merchantKey', 'accountId', 'siteCode', 'clientId', 'publicKey', 'secretKey', 'apiKey', 'passphrase', 'webhookSecret']
  const db = await getDb()
  const existing = await db.collection('paymentConnections').findOne({ tenantId: session.tenantId, provider }, { projection: { credentials: 1, credentialHints: 1 } })
  const credentials: Record<string, string> = { ...(existing?.credentials || {}) }
  const credentialHints: Record<string, string> = { ...(existing?.credentialHints || {}) }
  let suppliedCount = 0
  for (const field of allowedFields) {
    const value = String(inputCredentials[field] || '').trim().slice(0, 1000)
    if (!value) continue
    credentials[field] = encryptCredential(value)
    credentialHints[field] = credentialHint(value)
    suppliedCount += 1
  }
  if (!suppliedCount) return res.status(400).json({ error: 'Enter at least one merchant or API credential.' })
  const now = new Date()
  await db.collection('paymentConnections').updateOne({ tenantId: session.tenantId, provider }, { $set: { tenantId: session.tenantId, provider, environment, status: 'CONFIGURED_NOT_VERIFIED', credentials, credentialHints, updatedBy: session.userId, updatedAt: now }, $setOnInsert: { createdAt: now } }, { upsert: true })
  await db.collection('auditLogs').insertOne({ tenantId: session.tenantId, userId: session.userId, action: 'PAYMENT_CONNECTION_CONFIGURED', createdAt: now, metadata: { provider, environment, fields: Object.keys(credentials) } })
  res.json({ connection: { provider, environment, status: 'CONFIGURED_NOT_VERIFIED', credentialHints, updatedAt: now } })
})

app.delete('/api/workspace/payment-connections/:provider', async (req, res) => {
  const session = requireSession(req, res)
  if (!session) return
  if (!canManageVerification(session)) return res.status(403).json({ error: 'Only workspace owners and administrators can remove payment connections.' })
  const provider = String(req.params.provider || '').toUpperCase()
  const db = await getDb(); await db.collection('paymentConnections').deleteOne({ tenantId: session.tenantId, provider })
  await db.collection('auditLogs').insertOne({ tenantId: session.tenantId, userId: session.userId, action: 'PAYMENT_CONNECTION_REMOVED', createdAt: new Date(), metadata: { provider } })
  res.status(204).end()
})

const verificationStatuses = ['UPLOADED', 'READY_FOR_VERIFICATION', 'SUBMITTED_EXTERNALLY', 'ACCEPTED', 'REJECTED', 'REPLACEMENT_REQUIRED'] as const
const verificationDocumentTypes = ['COMPANY_REGISTRATION', 'INCORPORATION_CERTIFICATE', 'BUSINESS_LICENCE', 'BANK_STATEMENT', 'UTILITY_BILL', 'META_SUPPORTING_DOCUMENT'] as const
function canManageVerification(session: ReturnType<typeof requireSession>) { return session?.role === 'OWNER' || session?.role === 'ADMIN' }

app.get('/api/workspace/verification', async (req, res) => {
  const session = requireSession(req, res)
  if (!session) return
  const db = await getDb()
  const [tenant, documents, connection] = await Promise.all([
    db.collection('tenants').findOne({ _id: session.tenantId }, { projection: { legalBusinessName: 1, displayName: 1, tradingName: 1, industry: 1, workspaceSetup: 1, country: 1, registeredAddress: 1, businessEmail: 1, businessPhone: 1, website: 1, metaBusinessPortfolioId: 1, whatsappBusinessAccountId: 1, whatsappPhoneNumberId: 1, companyRegistrationNumber: 1, metaConnectionStatus: 1, verificationSubmissionStatus: 1, verificationSubmittedAt: 1 } }),
    db.collection('verificationDocuments').find({ tenantId: session.tenantId }).sort({ uploadedAt: -1 }).toArray(),
    db.collection<WhatsAppConnection>('whatsappConnections').findOne({ tenantId: session.tenantId, status: 'CONNECTED' }),
  ])
  const profile = (tenant || {}) as Record<string, any>
  const businessProfileComplete = Boolean(profile.legalBusinessName && profile.displayName && profile.industry && (profile.businessDescription || profile.workspaceSetup?.businessDescription))
  const documentReadiness = profile.verificationSubmissionStatus === 'SUBMITTED_TO_META' ? 'SUBMITTED_TO_META' : profile.verificationSubmissionStatus === 'APPROVED_FOR_META_ONBOARDING' ? 'APPROVED_FOR_ONBOARDING' : profile.verificationSubmissionStatus === 'MORE_INFORMATION_REQUIRED' ? 'MORE_INFORMATION_NEEDED' : documents.length ? 'READY_FOR_REVIEW' : 'MORE_INFORMATION_NEEDED'
  const readiness = { businessProfile: businessProfileComplete, businessEmail: Boolean(profile.businessEmail), businessWebsite: Boolean(profile.website), businessAddress: Boolean(profile.registeredAddress), phoneNumber: Boolean(profile.businessPhone), businessDocuments: documentReadiness, metaBusinessConnection: connection ? 'CONNECTED' : (profile.metaConnectionStatus || 'NOT_STARTED'), whatsappNumber: connection ? 'CONNECTED' : (profile.whatsappPhoneNumberId ? 'PENDING' : 'NOT_CONNECTED') }
  res.json({ profile, documents: documents.map(document => ({ id: String(document._id), type: document.type, filename: document.filename, purpose: document.purpose, status: document.status, uploadedAt: document.uploadedAt })), readiness, canManage: canManageVerification(session) })
})

app.post('/api/workspace/verification/submit', async (req, res) => {
  const session = requireSession(req, res)
  if (!session) return
  if (!canManageVerification(session)) return res.status(403).json({ error: 'Only workspace owners and administrators can submit a verification pack.' })
  const db = await getDb(); const [tenant, count] = await Promise.all([db.collection('tenants').findOne({ _id: session.tenantId }), db.collection('verificationDocuments').countDocuments({ tenantId: session.tenantId })])
  if (!tenant?.legalBusinessName || !tenant?.displayName || !tenant?.businessEmail || !tenant?.businessPhone || !tenant?.registeredAddress || !count) return res.status(400).json({ error: 'Complete your business profile and upload at least one verification document before submitting for review.' })
  const now = new Date()
  await Promise.all([
    db.collection('tenants').updateOne({ _id: session.tenantId }, { $set: { verificationSubmissionStatus: 'SUBMITTED_FOR_REVIEW', verificationSubmittedAt: now, updatedAt: now } }),
    db.collection('verificationDocuments').updateMany({ tenantId: session.tenantId, status: 'UPLOADED' }, { $set: { status: 'READY_FOR_VERIFICATION', updatedAt: now } }),
    db.collection('auditLogs').insertOne({ tenantId: session.tenantId, userId: session.userId, action: 'VERIFICATION_PACK_SUBMITTED_FOR_REVIEW', createdAt: now, metadata: { documentCount: count } }),
  ])
  res.json({ ok: true, status: 'SUBMITTED_FOR_REVIEW', submittedAt: now })
})

app.put('/api/workspace/verification/profile', async (req, res) => {
  const session = requireSession(req, res)
  if (!session) return
  if (!canManageVerification(session)) return res.status(403).json({ error: 'Only workspace owners and administrators can update verification information.' })
  const body = req.body || {}
  const fields = ['legalBusinessName', 'displayName', 'tradingName', 'industry', 'businessDescription', 'country', 'registeredAddress', 'businessEmail', 'businessPhone', 'website', 'metaBusinessPortfolioId', 'whatsappBusinessAccountId', 'whatsappPhoneNumberId', 'companyRegistrationNumber'] as const
  const update: Record<string, string | Date> = { updatedAt: new Date() }
  for (const field of fields) update[field] = String(body[field] || '').trim().slice(0, 1000)
  if (update.businessEmail && !/^\S+@\S+\.\S+$/.test(String(update.businessEmail))) return res.status(400).json({ error: 'Enter a valid business email address.' })
  await (await getDb()).collection('tenants').updateOne({ _id: session.tenantId }, { $set: update })
  await (await getDb()).collection('auditLogs').insertOne({ tenantId: session.tenantId, userId: session.userId, action: 'VERIFICATION_PROFILE_UPDATED', createdAt: new Date() })
  res.json({ ok: true })
})

app.post('/api/workspace/verification/documents', verificationUpload.array('document', 10), async (req, res) => {
  const session = requireSession(req, res)
  if (!session) return
  if (!canManageVerification(session)) return res.status(403).json({ error: 'Only workspace owners and administrators can upload verification documents.' })
  const files = (req.files || []) as Express.Multer.File[]
  if (!files.length) return res.status(400).json({ error: 'Upload one or more PDF, JPG, or PNG documents, up to 10 MB each.' })
  const type = String(req.body?.type || '')
  const purpose = String(req.body?.purpose || '').trim().slice(0, 500)
  if (!(verificationDocumentTypes as readonly string[]).includes(type) || !purpose) return res.status(400).json({ error: 'Choose a document type and tell us its verification purpose.' })
  const db = await getDb(); const bucket = new GridFSBucket(db, { bucketName: 'verificationFiles' }); const now = new Date(); const uploaded = []
  for (const file of files) {
    const safeFilename = file.originalname.replace(/[^a-zA-Z0-9._ -]/g, '_').slice(0, 180) || 'verification-document'
    const stream = bucket.openUploadStream(safeFilename, { contentType: file.mimetype, metadata: { tenantId: session.tenantId, uploadedBy: session.userId } })
    await new Promise<void>((resolve, reject) => { stream.on('error', reject); stream.on('finish', () => resolve()); stream.end(file.buffer) })
    const document = { tenantId: session.tenantId, fileId: stream.id, contentType: file.mimetype, type, filename: safeFilename, purpose, status: 'UPLOADED', uploadedBy: session.userId, uploadedAt: now, createdAt: now, updatedAt: now }
    await db.collection('verificationDocuments').insertOne(document)
    uploaded.push({ id: String(stream.id), type, filename: safeFilename, purpose, status: 'UPLOADED', uploadedAt: now })
  }
  await db.collection('auditLogs').insertOne({ tenantId: session.tenantId, userId: session.userId, action: 'VERIFICATION_DOCUMENT_UPLOADED', createdAt: now, metadata: { type, count: uploaded.length } })
  res.status(201).json({ ok: true, documents: uploaded })
})

app.get('/api/workspace/verification/documents/:documentId/download', async (req, res) => {
  const session = requireSession(req, res)
  if (!session) return
  if (!canManageVerification(session) || !ObjectId.isValid(req.params.documentId)) return res.status(403).json({ error: 'Not authorised.' })
  const db = await getDb(); const document = await db.collection('verificationDocuments').findOne({ _id: new ObjectId(req.params.documentId), tenantId: session.tenantId })
  if (!document) return res.status(404).json({ error: 'Document not found.' })
  res.setHeader('Content-Type', document.contentType || 'application/octet-stream'); res.setHeader('Content-Disposition', `attachment; filename="${String(document.filename).replace(/"/g, '')}"`); res.setHeader('Cache-Control', 'private, no-store')
  new GridFSBucket(db, { bucketName: 'verificationFiles' }).openDownloadStream(document.fileId).on('error', () => { if (!res.headersSent) res.status(404).end() }).pipe(res)
})

app.delete('/api/workspace/verification/documents/:documentId', async (req, res) => {
  const session = requireSession(req, res)
  if (!session) return
  if (!canManageVerification(session) || !ObjectId.isValid(req.params.documentId)) return res.status(403).json({ error: 'Not authorised.' })
  const db = await getDb(); const document = await db.collection('verificationDocuments').findOne({ _id: new ObjectId(req.params.documentId), tenantId: session.tenantId })
  if (!document) return res.status(404).json({ error: 'Document not found.' })
  await new GridFSBucket(db, { bucketName: 'verificationFiles' }).delete(document.fileId); await db.collection('verificationDocuments').deleteOne({ _id: document._id, tenantId: session.tenantId }); await db.collection('auditLogs').insertOne({ tenantId: session.tenantId, userId: session.userId, action: 'VERIFICATION_DOCUMENT_DELETED', createdAt: new Date(), metadata: { type: document.type, filename: document.filename } })
  res.status(204).end()
})

app.get('/api/admin/verification-documents', async (req, res) => {
  const admin = await requirePlatformAdmin(req, res)
  if (!admin) return
  const db = await getDb()
  const documents = await db.collection('verificationDocuments').aggregate([
    { $sort: { uploadedAt: -1 } }, { $limit: 300 },
    { $lookup: { from: 'tenants', localField: 'tenantId', foreignField: '_id', as: 'tenant' } }, { $unwind: '$tenant' },
    { $project: { filename: 1, type: 1, purpose: 1, status: 1, uploadedAt: 1, tenantId: 1, tenantName: '$tenant.name', tenantEmail: '$tenant.businessEmail', tenantVerificationStatus: '$tenant.verificationSubmissionStatus' } },
  ]).toArray()
  const summary = { total: documents.length, ready: documents.filter(document => document.tenantVerificationStatus === 'APPROVED_FOR_META_ONBOARDING').length, replacementRequired: documents.filter(document => document.status === 'REPLACEMENT_REQUIRED').length, submittedExternally: documents.filter(document => document.tenantVerificationStatus === 'SUBMITTED_TO_META').length, businesses: new Set(documents.map(document => String(document.tenantId))).size }
  res.json({ summary, documents: documents.map(document => ({ id: String(document._id), tenantId: String(document.tenantId), tenantName: document.tenantName, tenantEmail: document.tenantEmail, tenantVerificationStatus: document.tenantVerificationStatus, filename: document.filename, type: document.type, purpose: document.purpose, status: document.status, uploadedAt: document.uploadedAt })) })
})

app.patch('/api/admin/verification-documents/:documentId', async (req, res) => {
  const admin = await requirePlatformAdmin(req, res)
  if (!admin) return
  const status = String(req.body?.status || '')
  const allowed = ['READY_FOR_VERIFICATION', 'SUBMITTED_EXTERNALLY', 'REJECTED', 'REPLACEMENT_REQUIRED']
  if (!ObjectId.isValid(req.params.documentId) || !allowed.includes(status)) return res.status(400).json({ error: 'Choose a valid review status.' })
  const db = await getDb(); const document = await db.collection('verificationDocuments').findOneAndUpdate({ _id: new ObjectId(req.params.documentId) }, { $set: { status, reviewedBy: admin.userId, reviewedAt: new Date(), updatedAt: new Date() } }, { returnDocument: 'after' })
  if (!document) return res.status(404).json({ error: 'Document not found.' })
  if (status === 'READY_FOR_VERIFICATION') await db.collection('tenants').updateOne({ _id: document.tenantId }, { $set: { verificationSubmissionStatus: 'APPROVED_FOR_META_ONBOARDING', verificationApprovedAt: new Date(), updatedAt: new Date() } })
  if (status === 'SUBMITTED_EXTERNALLY') await db.collection('tenants').updateOne({ _id: document.tenantId }, { $set: { verificationSubmissionStatus: 'SUBMITTED_TO_META', verificationSubmittedToMetaAt: new Date(), updatedAt: new Date() } })
  if (status === 'REPLACEMENT_REQUIRED' || status === 'REJECTED') await db.collection('tenants').updateOne({ _id: document.tenantId }, { $set: { verificationSubmissionStatus: 'MORE_INFORMATION_REQUIRED', updatedAt: new Date() } })
  await db.collection('auditLogs').insertOne({ tenantId: document.tenantId, userId: admin.userId, action: 'VERIFICATION_DOCUMENT_REVIEWED', createdAt: new Date(), metadata: { documentId: String(document._id), status } })
  res.json({ ok: true, status })
})

app.get('/api/admin/verification-documents/:documentId/download', async (req, res) => {
  const admin = await requirePlatformAdmin(req, res)
  if (!admin || !ObjectId.isValid(req.params.documentId)) return
  const db = await getDb(); const document = await db.collection('verificationDocuments').findOne({ _id: new ObjectId(req.params.documentId) })
  if (!document) return res.status(404).json({ error: 'Document not found.' })
  res.setHeader('Content-Type', document.contentType || 'application/octet-stream'); res.setHeader('Content-Disposition', `attachment; filename="${String(document.filename).replace(/"/g, '')}"`); res.setHeader('Cache-Control', 'private, no-store')
  new GridFSBucket(db, { bucketName: 'verificationFiles' }).openDownloadStream(document.fileId).pipe(res)
})

app.get('/api/workspace/inbox', async (req, res) => {
  const session = requireSession(req, res)
  if (!session) return
  const db = await getDb()
  const [conversations, connection] = await Promise.all([
    db.collection('whatsappConversations').find({ tenantId: session.tenantId }).sort({ lastMessageAt: -1 }).limit(100).toArray(),
    db.collection<WhatsAppConnection>('whatsappConnections').findOne({ tenantId: session.tenantId, status: 'CONNECTED' }, { projection: { phoneNumberId: 1, status: 1, connectionType: 1 } }),
  ])
  res.json({ connection: connection ? { connected: true, phoneNumberId: connection.phoneNumberId, type: connection.connectionType } : { connected: false }, conversations: conversations.map(conversation => ({ id: String(conversation._id), customerPhone: conversation.customerPhone, customerName: conversation.customerName, lastMessage: conversation.lastMessage, lastMessageAt: conversation.lastMessageAt, unreadCount: conversation.unreadCount || 0, automationMode: conversation.automationMode })) })
})

app.get('/api/workspace/inbox/:conversationId', async (req, res) => {
  const session = requireSession(req, res)
  if (!session) return
  if (!ObjectId.isValid(req.params.conversationId)) return res.status(400).json({ error: 'Invalid conversation.' })
  const db = await getDb()
  const conversationId = new ObjectId(req.params.conversationId)
  const conversation = await db.collection('whatsappConversations').findOne({ _id: conversationId, tenantId: session.tenantId })
  if (!conversation) return res.status(404).json({ error: 'Conversation not found.' })
  const messages = await db.collection('whatsappMessages').find({ tenantId: session.tenantId, conversationId }).sort({ timestamp: 1 }).limit(300).toArray()
  await db.collection('whatsappConversations').updateOne({ _id: conversationId, tenantId: session.tenantId }, { $set: { unreadCount: 0 } })
  res.json({ conversation: { id: String(conversation._id), customerPhone: conversation.customerPhone, customerName: conversation.customerName, automationMode: conversation.automationMode }, messages: messages.map(message => ({ id: String(message._id), direction: message.direction, content: message.content, type: message.type, timestamp: message.timestamp })) })
})

app.patch('/api/workspace/inbox/:conversationId/automation', async (req, res) => {
  const session = requireSession(req, res)
  if (!session) return
  const mode = req.body?.mode
  if (!ObjectId.isValid(req.params.conversationId) || !['AI_ACTIVE', 'HUMAN_ACTIVE'].includes(mode)) return res.status(400).json({ error: 'Choose a valid automation mode.' })
  const result = await (await getDb()).collection('whatsappConversations').findOneAndUpdate({ _id: new ObjectId(req.params.conversationId), tenantId: session.tenantId }, { $set: { automationMode: mode, updatedAt: new Date() } }, { returnDocument: 'after' })
  if (!result) return res.status(404).json({ error: 'Conversation not found.' })
  res.json({ ok: true, automationMode: result.automationMode })
})

app.post('/api/workspace/inbox/:conversationId/reply', async (req, res) => {
  const session = requireSession(req, res)
  if (!session) return
  const content = String(req.body?.content || '').trim()
  if (!ObjectId.isValid(req.params.conversationId) || !content || content.length > 4096) return res.status(400).json({ error: 'Enter a message up to 4,096 characters.' })
  const db = await getDb()
  const conversationId = new ObjectId(req.params.conversationId)
  const [conversation, connection] = await Promise.all([
    db.collection('whatsappConversations').findOne({ _id: conversationId, tenantId: session.tenantId }),
    db.collection<WhatsAppConnection>('whatsappConnections').findOne({ tenantId: session.tenantId, status: 'CONNECTED' }),
  ])
  if (!conversation || !connection) return res.status(409).json({ error: 'Connect this workspace to WhatsApp before sending a reply.' })
  try {
    const sent = await sendWhatsAppTextMessage(conversation.customerPhone, content, connection)
    await recordOutboundMessage({ tenantId: session.tenantId, conversationId, metaMessageId: sent.messages?.[0]?.id || crypto.randomUUID(), content })
    res.json({ ok: true, metaMessageId: sent.messages?.[0]?.id || null })
  } catch (error) {
    res.status(502).json({ error: error instanceof Error ? error.message : 'WhatsApp could not send this reply.' })
  }
})

app.get(['/privacy', '/terms', '/data-deletion', '/acceptable-use', '/support'], (req, res) => {
  const page = req.path.slice(1)
  res.sendFile(path.join(projectDirectory, 'public', `${page}.html`))
})

app.get(['/register', '/login', '/forgot-password', '/reset-password', '/app', '/admin'], (req, res) => {
  const page = req.path === '/register' ? 'register.html' : req.path === '/login' ? 'login.html' : req.path === '/forgot-password' ? 'forgot-password.html' : req.path === '/reset-password' ? 'reset-password.html' : req.path === '/admin' ? 'admin.html' : 'app.html'
  res.sendFile(path.join(projectDirectory, 'public', page))
})

function requireInternalApi(req: Request, res: Response, next: () => void) {
  if (process.env.NODE_ENV !== 'production') return next()
  const key = process.env.INTERNAL_API_KEY
  const received = req.header('authorization')?.replace(/^Bearer\s+/i, '')
  if (!key || !received || received !== key) return res.status(404).end()
  next()
}

function publicConversation(conversation: Conversation) {
  return { ...conversation, messages: conversation.messages.slice(-50) }
}

function getConversation(phone: string) {
  const existing = conversations.get(phone)
  if (existing) return existing
  const conversation: Conversation = { id: crypto.randomUUID(), customerPhone: phone, customerName: phone, automationMode: 'AI_ACTIVE', unreadCount: 0, lastMessageAt: new Date().toISOString(), messages: [], stage: 'NEW', paymentStatus: 'NONE', bookingStatus: 'NONE' }
  conversations.set(phone, conversation)
  return conversation
}

function validSignature(req: Request) {
  const secret = process.env.META_APP_SECRET
  if (!secret) return process.env.NODE_ENV !== 'production'
  const received = req.header('x-hub-signature-256')
  if (!received || !(req as Request & { rawBody?: Buffer }).rawBody) return false
  const expected = `sha256=${crypto.createHmac('sha256', secret).update((req as Request & { rawBody: Buffer }).rawBody).digest('hex')}`
  const actual = Buffer.from(received)
  const wanted = Buffer.from(expected)
  return actual.length === wanted.length && crypto.timingSafeEqual(actual, wanted)
}

export async function sendWhatsAppTextMessage(to: string, message: string, connection?: Pick<WhatsAppConnection, 'accessToken' | 'phoneNumberId'>) {
  const token = connection?.accessToken || process.env.WHATSAPP_ACCESS_TOKEN
  const phoneNumberId = connection?.phoneNumberId || process.env.WHATSAPP_PHONE_NUMBER_ID
  if (!token || !phoneNumberId) throw new Error('WHATSAPP_ACCESS_TOKEN and WHATSAPP_PHONE_NUMBER_ID are required')
  const response = await fetch(`https://graph.facebook.com/${apiVersion}/${phoneNumberId}/messages`, { method: 'POST', headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' }, body: JSON.stringify({ messaging_product: 'whatsapp', to: to.replace(/\D/g, ''), type: 'text', text: { body: message } }) })
  const result = await response.json() as { error?: { message?: string }; messages?: Array<{ id: string }> }
  if (!response.ok) throw new Error(result.error?.message ?? 'Meta Cloud API rejected the request')
  return result
}

async function sendTenantReviewReply(connection: WhatsAppConnection, customerPhone: string, conversationId: import('mongodb').ObjectId | null, content: string) {
  if (connection.connectionType !== 'META_TEST_NUMBER') return
  const reply = content.trim().toLowerCase().includes('lesson')
    ? 'Thanks for your lesson enquiry. Afro Drive Academy offers a 60-minute driving lesson for R450. Reply BOOK to continue, or an agent can assist you.'
    : 'Thanks for messaging Afro Drive Academy. Reply LESSON for driving-lesson information, or an agent can assist you.'
  const sent = await sendWhatsAppTextMessage(customerPhone, reply, connection)
  await recordOutboundMessage({
    tenantId: connection.tenantId,
    conversationId,
    metaMessageId: sent.messages?.[0]?.id || crypto.randomUUID(),
    content: reply,
  })
}

async function sendWhatsAppChoiceButtons(to: string, body: string, choices: Array<{ id: string; title: string }>) {
  const token = process.env.WHATSAPP_ACCESS_TOKEN
  const phoneNumberId = process.env.WHATSAPP_PHONE_NUMBER_ID
  if (!token || !phoneNumberId) throw new Error('WHATSAPP_ACCESS_TOKEN and WHATSAPP_PHONE_NUMBER_ID are required')
  const response = await fetch(`https://graph.facebook.com/${apiVersion}/${phoneNumberId}/messages`, { method: 'POST', headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' }, body: JSON.stringify({ messaging_product: 'whatsapp', to: to.replace(/\D/g, ''), type: 'interactive', interactive: { type: 'button', body: { text: body }, action: { buttons: choices.map(choice => ({ type: 'reply', reply: choice })) } } }) })
  const result = await response.json() as { error?: { message?: string }; messages?: Array<{ id: string }> }
  if (!response.ok) throw new Error(result.error?.message ?? 'Meta Cloud API rejected the interactive message')
  return result
}

async function generateAIReply(text: string) {
  if (!process.env.DEEPSEEK_API_KEY) return 'Thanks for your message. I can help capture your enquiry and a team member will assist you shortly.'
  const response = await fetch('https://api.deepseek.com/chat/completions', { method: 'POST', headers: { Authorization: `Bearer ${process.env.DEEPSEEK_API_KEY}`, 'Content-Type': 'application/json' }, body: JSON.stringify({ model: 'deepseek-chat', messages: [{ role: 'system', content: 'You are Afro Intelligent, a concise South African business receptionist. Ask one useful question at a time. Never invent prices, hours, availability, addresses, policies, or financial details. Escalate uncertainty to a human.' }, { role: 'user', content: text }], max_tokens: 140, temperature: 0.3 }) })
  if (!response.ok) throw new Error('DeepSeek request failed')
  const result = await response.json() as { choices?: Array<{ message?: { content?: string } }> }
  return result.choices?.[0]?.message?.content?.trim() || 'Thanks. A team member will assist you shortly.'
}

function demoReply(conversation: Conversation, text: string) {
  const input = text.toLowerCase()
  if (conversation.stage === 'CONFIRMED' && input.includes('payment received')) return 'Payment received ✅ Your driving lesson is confirmed for Saturday at 11:00. We look forward to seeing you.'
  if (conversation.stage === 'PAYMENT_PENDING') {
    const baseUrl = publicApplicationUrl()
    if (input === 'pay_now' || input.includes('pay r450') || input.includes('pay now')) {
      return `Here is your secure payment link:\n${baseUrl}/pay/demo/${conversation.paymentReference}`
    }
    if (input === 'pay_later' || input.includes('pay later')) return `No problem. Your ${conversation.selectedTime ?? 'selected'} slot is held temporarily. Tap Pay R450 whenever you are ready to confirm.`
    return `Your booking is waiting for payment. Tap Pay R450 to confirm your ${conversation.selectedTime ?? 'selected'} slot.`
  }
  if (conversation.stage === 'NEW') {
    conversation.stage = 'SERVICE'
    addActivity('New WhatsApp enquiry', 'Driving lesson enquiry captured from customer')
    addActivity('AI replied instantly', 'Asked customer to choose a service')
    return 'Hi 👋 Welcome to Afro Drive Academy. Tap a service below to get started.'
  }
  if (conversation.stage === 'SERVICE' && (input === '1' || input.includes('driving') || input.includes('lesson'))) {
    conversation.stage = 'TIME'
    addActivity('Lead qualified', 'Customer selected Driving Lesson')
    return 'Great choice. Tap a time for Saturday.'
  }
  if (conversation.stage === 'TIME') {
    const selectedTime = input === '1' || input.includes('09:00') ? '09:00'
      : input === '2' || input === '11' || input.includes('11:00') ? '11:00'
      : input === '3' || input.includes('14:00') ? '14:00'
      : null
    if (!selectedTime) return 'Please tap one of the available times: 09:00, 11:00, or 14:00.'
    const reference = `AFRO-DEMO-${Math.floor(10000 + Math.random() * 89999)}`
    conversation.stage = 'PAYMENT_PENDING'
    conversation.selectedTime = selectedTime
    conversation.paymentReference = reference
    conversation.paymentStatus = 'PENDING'
    conversation.bookingStatus = 'RESERVED'
    const baseUrl = publicApplicationUrl()
    addActivity('Booking created', `Driving Lesson reserved for Saturday at ${selectedTime}`)
    addActivity('Payment request created', 'R450 demo payment link sent')
    return `Perfect. I’ve reserved Saturday at ${selectedTime} for you.\n\nDriving Lesson — R450.00\n\nTap the secure payment link to confirm your booking:\n${baseUrl}/pay/demo/${reference}`
  }
  return null
}

async function respondToCustomer(conversation: Conversation, text: string) {
  const stageBeforeReply = conversation.stage
  const reply = demoReply(conversation, text) ?? await generateAIReply(text)
  const sent = await sendWhatsAppTextMessage(conversation.customerPhone, reply)
  conversation.messages.push({ id: sent.messages?.[0]?.id ?? crypto.randomUUID(), direction: 'outbound', type: 'text', content: reply, timestamp: new Date().toISOString() })
  if (stageBeforeReply === 'NEW' && conversation.stage === 'SERVICE') {
    const buttons = await sendWhatsAppChoiceButtons(conversation.customerPhone, 'Choose a service', [{ id: '1', title: 'Driving Lesson' }, { id: '2', title: 'K53 Preparation' }, { id: '3', title: 'Refresher Lesson' }])
    conversation.messages.push({ id: buttons.messages?.[0]?.id ?? crypto.randomUUID(), direction: 'outbound', type: 'interactive', content: 'Tap a service: Driving Lesson · K53 Preparation · Refresher Lesson', timestamp: new Date().toISOString() })
  }
  if (stageBeforeReply === 'SERVICE' && conversation.stage === 'TIME') {
    const buttons = await sendWhatsAppChoiceButtons(conversation.customerPhone, 'Saturday availability', [{ id: '1', title: '09:00' }, { id: '2', title: '11:00' }, { id: '3', title: '14:00' }])
    conversation.messages.push({ id: buttons.messages?.[0]?.id ?? crypto.randomUUID(), direction: 'outbound', type: 'interactive', content: 'Tap a time: 09:00 · 11:00 · 14:00', timestamp: new Date().toISOString() })
  }
  if (stageBeforeReply === 'TIME' && conversation.stage === 'PAYMENT_PENDING') {
    const buttons = await sendWhatsAppChoiceButtons(conversation.customerPhone, 'Confirm your booking', [{ id: 'pay_now', title: 'Pay R450' }, { id: 'pay_later', title: 'Pay later' }])
    conversation.messages.push({ id: buttons.messages?.[0]?.id ?? crypto.randomUUID(), direction: 'outbound', type: 'interactive', content: 'Payment choices: Pay R450 · Pay later', timestamp: new Date().toISOString() })
  }
}

app.get('/health', (_req, res) => res.json({ status: 'ok', service: 'afro-intelligent-whatsapp', release: serviceRelease }))
app.get('/readiness', (_req, res) => {
  const checks = {
    mongoConfigured: Boolean(process.env.MONGODB_URI || process.env.MONGO_URL || process.env.DATABASE_URL),
    webhookVerifyTokenConfigured: Boolean(process.env.WHATSAPP_VERIFY_TOKEN),
    webhookSignatureConfigured: Boolean(process.env.META_APP_SECRET),
    testPhoneConfigured: Boolean(process.env.WHATSAPP_PHONE_NUMBER_ID && process.env.WHATSAPP_ACCESS_TOKEN),
    internalApiProtected: Boolean(process.env.INTERNAL_API_KEY),
  }
  const ready = Object.values(checks).every(Boolean)
  res.status(ready ? 200 : 503).json({ status: ready ? 'ready' : 'configuration_required', release: serviceRelease, checks })
})

app.get('/webhooks/whatsapp', (req, res) => {
  const { 'hub.mode': mode, 'hub.verify_token': token, 'hub.challenge': challenge } = req.query
  if (!mode && !token && !challenge) return res.json({ status: 'ready', service: 'afro-intelligent-whatsapp', message: 'Webhook is ready. Meta supplies verification parameters automatically.' })
  if (mode === 'subscribe' && typeof token === 'string' && token === process.env.WHATSAPP_VERIFY_TOKEN && typeof challenge === 'string') return res.status(200).type('text/plain').send(challenge)
  return res.status(403).json({ error: 'Webhook verification failed' })
})

app.post('/webhooks/whatsapp', async (req, res) => {
  if (!validSignature(req)) return res.status(401).json({ error: 'Invalid webhook signature' })
  res.status(200).json({ received: true })
  const values = req.body?.entry?.flatMap((entry: { changes?: Array<{ value?: unknown }> }) => entry.changes?.map(change => change.value) ?? []) ?? []
  for (const value of values) {
    const webhookValue = value as { metadata?: { phone_number_id?: string }; messages?: Array<{ id?: string; from?: string; timestamp?: string; type?: string; text?: { body?: string }; interactive?: { button_reply?: { id?: string; title?: string } } }>; statuses?: Array<{ id?: string; status?: string; timestamp?: string; recipient_id?: string; errors?: unknown[] }> }
    const connection = await getConnectionForPhoneId(webhookValue.metadata?.phone_number_id).catch(error => {
      console.error('Unable to resolve WhatsApp tenant connection:', error instanceof Error ? error.message : 'unknown error')
      return null
    })
    const messages = webhookValue.messages ?? []
    if (connection) {
      for (const status of webhookValue.statuses ?? []) {
        if (!status.id || !status.status) continue
        try {
          await recordMessageStatus({ tenantId: connection.tenantId, metaMessageId: status.id, status: status.status, timestamp: status.timestamp ? new Date(Number(status.timestamp) * 1000).toISOString() : new Date().toISOString(), recipientId: status.recipient_id, errors: status.errors })
        } catch (error) {
          console.error('Unable to persist WhatsApp delivery status:', error instanceof Error ? error.message : 'unknown error')
        }
      }
    }
    for (const incoming of messages) {
      if (!incoming.id || !incoming.from || processedMessageIds.has(incoming.id)) continue
      processedMessageIds.add(incoming.id)
      const content = incoming.text?.body ?? incoming.interactive?.button_reply?.id ?? incoming.interactive?.button_reply?.title
      if (!content) continue
      if (!connection) {
        console.error('Ignoring WhatsApp message because no connected tenant matches the recipient phone number')
        continue
      }
      const durableEvent = await recordWebhookMessage({
        tenantId: connection.tenantId,
        messageId: incoming.id,
        from: incoming.from,
        content,
        type: incoming.type ?? 'text',
        timestamp: incoming.timestamp ? new Date(Number(incoming.timestamp) * 1000).toISOString() : new Date().toISOString(),
      })
      if (durableEvent.duplicate) continue
      addActivity('New WhatsApp enquiry', content.slice(0, 80))
      if (durableEvent.automationMode !== 'AI_ACTIVE') continue
      try {
        await sendTenantReviewReply(connection, incoming.from, durableEvent.conversationId ?? null, content)
      } catch (error) {
        console.error('Unable to send tenant-scoped WhatsApp reply:', error instanceof Error ? error.message : 'unknown error')
      }
    }
  }
})

app.use(['/api/conversations', '/api/dashboard', '/api/tenants'], requireInternalApi)
app.patch('/api/tenants/:tenantId/conversations/:conversationId/automation', async (req, res) => {
  const { tenantId, conversationId } = req.params
  const mode = req.body?.mode
  if (!ObjectId.isValid(tenantId) || !ObjectId.isValid(conversationId) || !['AI_ACTIVE', 'HUMAN_ACTIVE'].includes(mode)) return res.status(400).json({ error: 'Invalid conversation or automation mode' })
  const db = await getDb()
  const result = await db.collection('whatsappConversations').findOneAndUpdate(
    { _id: new ObjectId(conversationId), tenantId: new ObjectId(tenantId) },
    { $set: { automationMode: mode, updatedAt: new Date() } },
    { returnDocument: 'after' },
  )
  if (!result) return res.status(404).json({ error: 'Conversation not found' })
  res.json({ conversation: result })
})
app.post('/api/tenants/:tenantId/conversations/:conversationId/reply', async (req, res) => {
  const { tenantId, conversationId } = req.params
  const content = String(req.body?.content || '').trim()
  if (!ObjectId.isValid(tenantId) || !ObjectId.isValid(conversationId) || !content) return res.status(400).json({ error: 'Invalid reply request' })
  const db = await getDb()
  const tenantObjectId = new ObjectId(tenantId)
  const conversationObjectId = new ObjectId(conversationId)
  const [conversation, connection] = await Promise.all([
    db.collection('whatsappConversations').findOne({ _id: conversationObjectId, tenantId: tenantObjectId }),
    db.collection<WhatsAppConnection>('whatsappConnections').findOne({ tenantId: tenantObjectId, status: 'CONNECTED' }),
  ])
  if (!conversation || !connection) return res.status(404).json({ error: 'Connected WhatsApp conversation not found' })
  try {
    const sent = await sendWhatsAppTextMessage(conversation.customerPhone, content, connection)
    await recordOutboundMessage({ tenantId: tenantObjectId, conversationId: conversationObjectId, metaMessageId: sent.messages?.[0]?.id || crypto.randomUUID(), content })
    res.json({ ok: true, metaMessageId: sent.messages?.[0]?.id || null })
  } catch (error) {
    res.status(502).json({ error: error instanceof Error ? error.message : 'Unable to send WhatsApp message' })
  }
})
app.get('/api/conversations', (_req, res) => res.json([...conversations.values()].sort((a, b) => b.lastMessageAt.localeCompare(a.lastMessageAt)).map(publicConversation)))
app.delete('/api/conversations/:phone', (req, res) => {
  const conversation = conversations.get(req.params.phone)
  if (!conversation) return res.status(404).json({ error: 'Conversation not found' })
  conversation.messages = []
  conversation.stage = 'NEW'
  conversation.paymentStatus = 'NONE'
  conversation.bookingStatus = 'NONE'
  conversation.selectedTime = undefined
  conversation.paymentReference = undefined
  conversation.unreadCount = 0
  addActivity('Conversation cleared', 'Dashboard demo history was reset')
  return res.json(publicConversation(conversation))
})
app.get('/api/dashboard', (_req, res) => {
  const all = [...conversations.values()]
  res.json({ businessName: 'Afro Drive Academy', metrics: { enquiries: 24 + all.length, leads: 18 + all.filter(c => c.stage !== 'NEW').length, bookings: 11 + all.filter(c => c.bookingStatus !== 'NONE').length, revenue: 8450 + all.filter(c => c.paymentStatus === 'PAID').length * 450, conversations: 63 + all.length }, activities, conversations: all.sort((a, b) => b.lastMessageAt.localeCompare(a.lastMessageAt)).map(publicConversation) })
})
app.post('/api/conversations/:phone/take-over', (req, res) => { const c = getConversation(req.params.phone); c.automationMode = 'HUMAN_ACTIVE'; res.json(publicConversation(c)) })
app.post('/api/conversations/:phone/resume-ai', (req, res) => { const c = getConversation(req.params.phone); c.automationMode = 'AI_ACTIVE'; res.json(publicConversation(c)) })
app.post('/api/dev/send-message', async (req, res) => {
  if (process.env.NODE_ENV === 'production') return res.status(404).end()
  const { to, message } = req.body ?? {}
  if (typeof to !== 'string' || typeof message !== 'string' || !to || !message) return res.status(400).json({ error: 'Provide { to, message }' })
  try { res.json(await sendWhatsAppTextMessage(to, message)) } catch (error) { res.status(502).json({ error: error instanceof Error ? error.message : 'Unable to send message' }) }
})

app.post('/api/dev/simulate', async (req, res) => {
  if (process.env.NODE_ENV === 'production') return res.status(404).end()
  const phone = process.env.WHATSAPP_TEST_RECIPIENT_PHONE || '27676087645'
  const text = typeof req.body?.message === 'string' ? req.body.message : 'Hi, I want a driving lesson.'
  const conversation = getConversation(phone)
  conversation.messages.push({ id: crypto.randomUUID(), direction: 'inbound', type: 'text', content: text, timestamp: new Date().toISOString() })
  try { await respondToCustomer(conversation, text); res.json(publicConversation(conversation)) } catch (error) { res.status(502).json({ error: error instanceof Error ? error.message : 'Unable to simulate message' }) }
})

app.post('/api/dev/reset', (_req, res) => {
  conversations.clear()
  processedMessageIds.clear()
  activities.splice(0)
  addActivity('Demo reset', 'Ready for a fresh customer conversation')
  res.json({ ok: true })
})

app.get('/pay/demo/:reference', (req, res) => {
  const conversation = [...conversations.values()].find(item => item.paymentReference === req.params.reference)
  if (!conversation) return res.status(404).send('Payment reference not found')
  res.type('html').send(`<!doctype html><html><head><meta name="viewport" content="width=device-width,initial-scale=1"><title>Afro Intelligent Secure Checkout</title><style>body{margin:0;background:#f4f8f6;font-family:Arial,sans-serif;color:#10231c}.card{max-width:520px;margin:8vh auto;background:#fff;border-radius:28px;padding:36px;box-shadow:0 20px 70px #123b2b22}.tag{color:#17844f;font-weight:bold;font-size:12px;letter-spacing:1.5px}.amount{font-size:42px;font-weight:800;margin:12px 0}button{width:100%;border:0;border-radius:14px;background:#17844f;color:#fff;padding:17px;font-size:16px;font-weight:700;cursor:pointer}.note{background:#fff7d9;padding:12px;border-radius:10px;font-size:13px;margin:22px 0}</style></head><body><main class="card"><p class="tag">AFRO INTELLIGENT SECURE CHECKOUT</p><h1>Demo payment</h1><p>Merchant: <b>Afro Drive Academy</b></p><p>Driving Lesson · Saturday · 11:00</p><p class="amount">R450.00</p><p>Reference: ${req.params.reference}</p><p class="note">DEMO TRANSACTION — no real money will be charged.</p><button onclick="pay()">Pay R450.00 — Demo</button><p id="status"></p></main><script>async function pay(){document.querySelector('button').disabled=true;document.getElementById('status').textContent='Processing secure payment…';await new Promise(r=>setTimeout(r,1100));let r=await fetch('/api/payments/${req.params.reference}/complete',{method:'POST'});document.getElementById('status').textContent=r.ok?'✓ Payment successful. Your booking is confirmed.':'Payment could not be completed.'}</script></body></html>`)
})

app.post('/api/payments/:reference/complete', async (req, res) => {
  const conversation = [...conversations.values()].find(item => item.paymentReference === req.params.reference)
  if (!conversation) return res.status(404).json({ error: 'Payment reference not found' })
  conversation.paymentStatus = 'PAID'; conversation.bookingStatus = 'CONFIRMED'; conversation.stage = 'CONFIRMED'
  addActivity('R450 payment received', 'Driving Lesson booking confirmed', 'success')
  try { await respondToCustomer(conversation, 'payment received') } catch { /* payment state remains confirmed even when Meta delivery is unavailable */ }
  res.json({ status: 'PAID', bookingStatus: 'CONFIRMED' })
})

// Local demos can share an ngrok URL. Production Render must never proxy the
// Vercel frontend or its authenticated routes.
if (process.env.LOCAL_FRONTEND_PROXY_ENABLED === 'true' && process.env.NODE_ENV !== 'production') {
  const frontendProxy = createProxyMiddleware({ target: process.env.FRONTEND_URL || 'http://localhost:3002', changeOrigin: true, ws: true, pathRewrite: (_path, req) => (req as unknown as { originalUrl?: string }).originalUrl ?? _path })
  app.use(['/whatsapp', '/_next', '/logo%20afrointelligent2.png', '/register', '/login', '/reset-password', '/api/auth', '/api/client'], frontendProxy)
}

app.use((error: Error, _req: Request, res: Response, _next: (error?: unknown) => void) => {
  if (error.message === 'Origin is not allowed by CORS') return res.status(403).json({ error: 'Origin is not allowed.' })
  console.error('Unhandled request error:', error.message)
  return res.status(500).json({ error: 'Internal server error.' })
})

app.listen(port, () => {
  ensureWhatsappIndexes().catch(error => console.error('Unable to ensure WhatsApp indexes:', error instanceof Error ? error.message : 'unknown error'))
  console.log(`Afro Intelligent WhatsApp API listening on :${port}; webhook available at /webhooks/whatsapp`)
})
