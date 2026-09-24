import crypto from 'node:crypto'
import { dispatchRealtime, pusherConfigured } from './whatsapp-realtime.js'
import { Router, type Request, type Response } from 'express'
import { ObjectId } from 'mongodb'
import { Server } from 'socket.io'
import type { Server as HttpServer } from 'node:http'
import { getDb, getMongoClient, getConnectionForPhoneId } from './db.js'
import { readCookie, readSession } from './auth.js'
import { persistInbound, persistStatus } from './whatsapp-store.js'

export function secretsEqual(actual: unknown, expected: string | undefined) {
  if (typeof actual !== 'string' || !expected) return false
  const a = Buffer.from(actual), b = Buffer.from(expected)
  return a.length === b.length && crypto.timingSafeEqual(a, b)
}

export function validWebhookSignature(raw: Buffer | undefined, signature: unknown, secret = process.env.META_APP_SECRET) {
  return Boolean(raw && secret && secretsEqual(signature, `sha256=${crypto.createHmac('sha256', secret).update(raw).digest('hex')}`))
}

function object(value: unknown): value is Record<string, any> { return Boolean(value && typeof value === 'object' && !Array.isArray(value)) }
function requiredString(value: unknown): value is string { return typeof value === 'string' && value.length > 0 }
function timestamp(value: unknown) {
  if (typeof value !== 'string' || !/^\d+$/.test(value)) throw new Error('Invalid timestamp')
  const date = new Date(Number(value) * 1000)
  if (!Number.isFinite(date.getTime())) throw new Error('Invalid timestamp')
  return date.toISOString()
}

/** Validate the whole batch before any write; preserve non-text message metadata. */
export function parseWebhook(body: unknown) {
  if (!object(body) || body.object !== 'whatsapp_business_account' || !Array.isArray(body.entry)) throw new Error('Invalid WhatsApp envelope')
  const batches = []
  for (const entry of body.entry) {
    if (!object(entry) || !requiredString(entry.id) || !Array.isArray(entry.changes)) throw new Error('Invalid WhatsApp entry')
    for (const change of entry.changes) {
      if (!object(change) || !requiredString(change.field)) throw new Error('Invalid change')
      if (change.field !== 'messages') continue
      const value = change.value
      if (!object(value) || value.messaging_product !== 'whatsapp' || !object(value.metadata) || !requiredString(value.metadata.phone_number_id)) throw new Error('Missing recipient phone ID')
      if (value.messages !== undefined && !Array.isArray(value.messages)) throw new Error('Invalid messages')
      if (value.statuses !== undefined && !Array.isArray(value.statuses)) throw new Error('Invalid statuses')
      if (value.contacts !== undefined && !Array.isArray(value.contacts)) throw new Error('Invalid contacts')
      const messages = (value.messages || []).map((message: unknown) => {
        if (!object(message) || !requiredString(message.id) || !requiredString(message.from) || !requiredString(message.type)) throw new Error('Invalid message')
        if (message.type === 'text' && (!object(message.text) || typeof message.text.body !== 'string')) throw new Error('Invalid text message')
        const contact = value.contacts?.find((c: any) => object(c) && c.wa_id === message.from)
        const content = message.text?.body ?? message.interactive?.button_reply?.title ?? message.interactive?.list_reply?.title ?? message.button?.text ?? message[message.type]?.caption ?? `[${message.type}]`
        if (typeof content !== 'string') throw new Error('Invalid message content')
        return { messageId: message.id, from: message.from, type: message.type, content, timestamp: timestamp(message.timestamp), customerName: typeof contact?.profile?.name === 'string' ? contact.profile.name : undefined, payload: message }
      })
      const statuses = (value.statuses || []).map((status: unknown) => {
        if (!object(status) || !requiredString(status.id) || !['sent', 'delivered', 'read', 'failed', 'deleted'].includes(status.status)) throw new Error('Invalid status')
        return { metaMessageId: status.id, status: status.status as string, timestamp: timestamp(status.timestamp), recipientId: typeof status.recipient_id === 'string' ? status.recipient_id : undefined, errors: Array.isArray(status.errors) ? status.errors : undefined }
      })
      batches.push({ wabaId: entry.id, phoneNumberId: value.metadata.phone_number_id as string, messages, statuses })
    }
  }
  return batches
}

export const webhookRouter = Router()
webhookRouter.get('/', (req, res) => {
  const { 'hub.mode': mode, 'hub.verify_token': token, 'hub.challenge': challenge } = req.query
  if (mode === 'subscribe' && secretsEqual(token, process.env.WHATSAPP_VERIFY_TOKEN) && typeof challenge === 'string') return res.type('text/plain').send(challenge)
  if (!mode && !token && !challenge) return res.json({ status: 'available', service: 'afro-intelligent-whatsapp' })
  return res.status(403).json({ error: 'Webhook verification failed' })
})
webhookRouter.post('/', async (req, res) => {
  if (!process.env.META_APP_SECRET) return res.status(503).json({ error: 'Webhook signature secret is not configured' })
  if (!validWebhookSignature((req as Request & { rawBody?: Buffer }).rawBody, req.header('x-hub-signature-256'))) return res.status(401).json({ error: 'Invalid webhook signature' })
  let batches: ReturnType<typeof parseWebhook>
  try { batches = parseWebhook(req.body) } catch { return res.status(400).json({ error: 'Malformed WhatsApp webhook' }) }
  try {
    for (const batch of batches) {
      const connection = await getConnectionForPhoneId(batch.phoneNumberId)
      // Unconfigured accounts must be fixed and retried, not silently acknowledged.
      if (!connection || (connection.wabaId && connection.wabaId !== batch.wabaId)) return res.status(503).json({ error: 'Recipient WhatsApp account is not configured' })
      const db = await getDb()
      if (!await db.collection('tenants').findOne({ _id: connection.tenantId, status: 'ACTIVE' })) return res.status(503).json({ error: 'Recipient workspace is inactive' })
      const client = await getMongoClient()
      for (const message of batch.messages) await persistInbound(client, db, { ...message, tenantId: connection.tenantId })
      for (const status of batch.statuses) await persistStatus(client, db, { ...status, tenantId: connection.tenantId })
    }
    return res.json({ received: true })
  } catch {
    console.error('WhatsApp webhook persistence failed; returning retryable HTTP 503')
    return res.status(503).json({ error: 'Webhook storage temporarily unavailable' })
  }
})

type Principal = { platform: boolean; tenantId?: ObjectId }
export async function authenticateWhatsApp(cookie?: string, authorization?: string): Promise<Principal | null> {
  const bearer = authorization?.replace(/^Bearer\s+/i, '')
  if (secretsEqual(bearer, process.env.INTERNAL_API_KEY)) return { platform: true }
  const session = readSession(readCookie(cookie))
  if (!session) return null
  const db = await getDb()
  const user = await db.collection('users').findOne({ _id: session.userId, status: 'ACTIVE' })
  if (!user) return null
  // Match the signed identity to current membership, never trust a requested tenant ID.
  const member = await db.collection('tenantMemberships').findOne({ tenantId: session.tenantId, userId: session.userId })
  if (!member && !user.platformAdmin) return null
  const tenant = await db.collection('tenants').findOne({ _id: session.tenantId, status: 'ACTIVE' })
  if (!tenant && !user.platformAdmin) return null
  return { platform: Boolean(user.platformAdmin), tenantId: session.tenantId }
}

function permitted(principal: Principal, tenantId: string) { return principal.platform || principal.tenantId?.equals(tenantId) }
export const whatsappApi = Router()
whatsappApi.use(async (req, res, next) => {
  try {
    const principal = await authenticateWhatsApp(req.header('cookie'), req.header('authorization'))
    if (!principal) return res.status(401).json({ error: 'Authentication required' })
    res.locals.principal = principal
    next()
  } catch { res.status(503).json({ error: 'Authentication unavailable' }) }
})
whatsappApi.get('/tenants', async (_req, res) => {
  const principal = res.locals.principal as Principal
  const db = await getDb()
  const tenants = await db.collection('tenants').find(principal.platform ? {} : { _id: principal.tenantId }, { projection: { name: 1, slug: 1, status: 1 } }).sort({ name: 1 }).limit(200).toArray()
  const ids = tenants.map(tenant => tenant._id)
  const [connections, summaries] = await Promise.all([
    db.collection('whatsappConnections').find({ tenantId: { $in: ids } }, { projection: { tenantId: 1, status: 1, connectionType: 1 } }).toArray(),
    db.collection('whatsappConversations').aggregate([{ $match: { tenantId: { $in: ids } } }, { $group: { _id: '$tenantId', totalConversations: { $sum: 1 }, unreadConversations: { $sum: { $cond: [{ $gt: ['$unreadCount', 0] }, 1, 0] } }, lastActivityAt: { $max: '$lastMessageAt' }, automatedConversations: { $sum: { $cond: [{ $eq: ['$automationMode', 'AI_ACTIVE'] }, 1, 0] } } } }]).toArray(),
  ])
  res.json({ tenants: tenants.map(tenant => {
    const connectionsForTenant = connections.filter(connection => connection.tenantId.equals(tenant._id))
    const summary = summaries.find(row => row._id.equals(tenant._id))
    return { ...tenant, isInternal: connectionsForTenant.some(connection => connection.connectionType === 'INTERNAL'), connectionStatus: connectionsForTenant.some(connection => connection.status === 'CONNECTED') ? 'CONNECTED' : 'NOT_CONNECTED', totalConversations: summary?.totalConversations || 0, unreadConversations: summary?.unreadConversations || 0, lastActivityAt: summary?.lastActivityAt || null, automationStatus: summary?.automatedConversations ? 'ACTIVE' : 'MANUAL' }
  }) })
})
whatsappApi.use('/tenants/:tenantId', (req, res, next) => {
  if (!ObjectId.isValid(req.params.tenantId)) return res.status(400).json({ error: 'Invalid tenant ID' })
  if (!permitted(res.locals.principal, req.params.tenantId)) return res.status(403).json({ error: 'Tenant access denied' })
  res.locals.tenantId = new ObjectId(req.params.tenantId)
  next()
})
export function issueRealtimeTicket(tenantId: string) {
  const key = process.env.INTERNAL_API_KEY
  if (!key) throw new Error('Realtime signing key unavailable')
  const payload = Buffer.from(JSON.stringify({ tenantId, aud: 'whatsapp-realtime', exp: Date.now() + 300_000 })).toString('base64url')
  return `${payload}.${crypto.createHmac('sha256', key).update(payload).digest('base64url')}`
}
export function readRealtimeTicket(ticket: unknown): Principal | null {
  try {
    if (typeof ticket !== 'string' || !process.env.INTERNAL_API_KEY) return null
    const [payload, signature, extra] = ticket.split('.')
    if (extra || !payload || !secretsEqual(signature, crypto.createHmac('sha256', process.env.INTERNAL_API_KEY).update(payload).digest('base64url'))) return null
    const data = JSON.parse(Buffer.from(payload, 'base64url').toString())
    if (data.aud !== 'whatsapp-realtime' || typeof data.exp !== 'number' || data.exp <= Date.now() || !ObjectId.isValid(data.tenantId)) return null
    return { platform: false, tenantId: new ObjectId(data.tenantId) }
  } catch { return null }
}
whatsappApi.post('/tenants/:tenantId/realtime-token', async (_req, res) => {
  const tenantId = res.locals.tenantId as ObjectId
  if (!await (await getDb()).collection('tenants').findOne({ _id: tenantId, status: 'ACTIVE' })) return res.status(404).json({ error: 'Active tenant not found' })
  res.setHeader('Cache-Control', 'no-store')
  res.json({ token: issueRealtimeTicket(String(tenantId)), expiresIn: 300 })
})
whatsappApi.post('/tenants/:tenantId/conversations/:conversationId/read', async (req, res) => {
  if (!ObjectId.isValid(req.params.conversationId)) return res.status(400).json({ error: 'Invalid conversation ID' })
  // Only mark the version the client displayed, so a racing inbound message stays unread.
  const date = new Date(req.body?.lastMessageAt)
  if (!Number.isFinite(date.getTime())) return res.status(400).json({ error: 'Invalid message timestamp' })
  const db = await getDb(), session = (await getMongoClient()).startSession()
  try {
    const read = await session.withTransaction(async () => {
      const conversationId = new ObjectId(req.params.conversationId)
      const result = await db.collection('whatsappConversations').updateOne({ _id: conversationId, tenantId: res.locals.tenantId, lastMessageAt: date }, { $set: { unreadCount: 0 } }, { session })
      if (result.modifiedCount) await db.collection('whatsappRealtimeEvents').insertOne({ tenantId: res.locals.tenantId, conversationId, type: 'conversation.read', createdAt: new Date(), publishedAt: null }, { session })
      return result.matchedCount > 0
    })
    res.json({ read })
  } finally { await session.endSession() }
})
function pageSize(req: Request) { return Math.min(100, Math.max(1, Number(req.query.limit) || 50)) }
whatsappApi.get('/tenants/:tenantId/conversations', async (req, res) => {
  const conversations = await (await getDb()).collection('whatsappConversations').find({ tenantId: res.locals.tenantId }).sort({ lastMessageAt: -1 }).limit(pageSize(req)).toArray()
  res.json({ conversations })
})
whatsappApi.get('/tenants/:tenantId/conversations/:conversationId/messages', async (req, res) => {
  if (!ObjectId.isValid(req.params.conversationId)) return res.status(400).json({ error: 'Invalid conversation ID' })
  const tenantId = res.locals.tenantId as ObjectId
  const conversationId = new ObjectId(req.params.conversationId)
  const db = await getDb()
  if (!await db.collection('whatsappConversations').findOne({ tenantId, _id: conversationId })) return res.status(404).json({ error: 'Conversation not found' })
  if (req.query.before && (typeof req.query.before !== 'string' || !ObjectId.isValid(req.query.before))) return res.status(400).json({ error: 'Invalid cursor' })
  const messages = await db.collection('whatsappMessages').find({ tenantId, conversationId, ...(req.query.before ? { _id: { $lt: new ObjectId(String(req.query.before)) } } : {}) }).sort({ _id: -1 }).limit(pageSize(req)).toArray()
  const nextCursor = messages.length === pageSize(req) ? String(messages.at(-1)!._id) : null
  res.json({ messages: messages.reverse(), nextCursor })
})

/** Transactional outbox: reconnecting clients refetch the inbox; event IDs deduplicate retries. */
export async function publishPendingEvents(io: Server) {
  await dispatchRealtime(await getDb(), io)
}

export function attachWhatsAppRealtime(server: HttpServer, origins: string[]) {
  const io = new Server(server, {
    cors: { origin: origins, credentials: true },
    // Cross-origin WebSocket clients must present a short-lived tenant ticket below.
    connectTimeout: 10_000,
  })
  io.use(async (socket, next) => {
    if (pusherConfigured()) return next(new Error('Use the configured Pusher connection'))
    try {
      const authorization = socket.handshake.headers.authorization
      const ticket = readRealtimeTicket(socket.handshake.auth?.token)
      const origin = socket.handshake.headers.origin
      if (origin && !origins.includes(origin) && !ticket) return next(new Error('Tenant access denied'))
      const principal = ticket || await authenticateWhatsApp(socket.handshake.headers.cookie, authorization)
      const id = socket.handshake.auth?.tenantId || String(principal?.tenantId || '')
      if (!principal || typeof id !== 'string' || !ObjectId.isValid(id) || !permitted(principal, id)) return next(new Error('Tenant access denied'))
      if (!await (await getDb()).collection('tenants').findOne({ _id: new ObjectId(id), status: 'ACTIVE' })) return next(new Error('Tenant access denied'))
      socket.data.tenantId = id
      next()
    } catch { next(new Error('Authentication unavailable')) }
  })
  io.on('connection', socket => {
    socket.join(`tenant:${socket.data.tenantId}`)
    socket.emit('whatsapp.ready', { tenantId: socket.data.tenantId, refetch: true })
    // Revalidate membership and account suspension for long-lived connections.
    const authTimer = setInterval(async () => {
      try {
        const principal = socket.handshake.auth?.token ? readRealtimeTicket(socket.handshake.auth.token) : await authenticateWhatsApp(socket.handshake.headers.cookie, socket.handshake.headers.authorization)
        if (!principal || !permitted(principal, socket.data.tenantId)) socket.disconnect(true)
      } catch { socket.disconnect(true) }
    }, 60_000)
    authTimer.unref()
    socket.on('disconnect', () => clearInterval(authTimer))
  })
  let publishing = false
  const timer = setInterval(async () => {
    if (publishing) return
    publishing = true
    try { await publishPendingEvents(io) } catch { console.error('WhatsApp realtime delivery will retry') } finally { publishing = false }
  }, 500)
  timer.unref()
  server.on('close', () => clearInterval(timer))
  return io
}
