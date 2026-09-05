import crypto from 'node:crypto'
import { promisify } from 'node:util'
import { ObjectId, type Db } from 'mongodb'

const scrypt = promisify(crypto.scrypt)
const SESSION_COOKIE = 'afro_session'
const SESSION_MAX_AGE_SECONDS = 60 * 60 * 24 * 7

export type UserRole = 'OWNER' | 'ADMIN' | 'AGENT' | 'VIEWER'
export type SessionUser = { userId: ObjectId; tenantId: ObjectId; role: UserRole; email: string; name: string }

type UserDocument = {
  _id: ObjectId
  firstName: string
  lastName: string
  email: string
  passwordHash: string
  passwordUpdatedAt?: Date
  platformAdmin?: boolean
  status: 'ACTIVE' | 'SUSPENDED'
  createdAt: Date
  updatedAt: Date
}

function base64url(value: string | Buffer) {
  return Buffer.from(value).toString('base64url')
}

function requiredSessionSecret() {
  const secret = process.env.SESSION_SECRET
  if (!secret || secret.length < 32) throw new Error('SESSION_SECRET must be configured with at least 32 characters')
  return secret
}

export async function hashPassword(password: string) {
  const salt = crypto.randomBytes(16).toString('hex')
  const derived = await scrypt(password, salt, 64) as Buffer
  return `scrypt$${salt}$${derived.toString('hex')}`
}

export async function verifyPassword(password: string, stored: string) {
  const [scheme, salt, hash] = stored.split('$')
  if (scheme !== 'scrypt' || !salt || !hash) return false
  const derived = await scrypt(password, salt, 64) as Buffer
  const expected = Buffer.from(hash, 'hex')
  return expected.length === derived.length && crypto.timingSafeEqual(expected, derived)
}

export function validatePassword(password: string) {
  if (password.length < 12) throw new Error('Use a password with at least 12 characters.')
}

export async function createPasswordResetToken(db: Db, emailInput: string) {
  const email = emailInput.trim().toLowerCase()
  const user = await db.collection<UserDocument>('users').findOne({ email, status: 'ACTIVE' }, { projection: { _id: 1, email: 1, firstName: 1 } })
  if (!user) return null
  const token = crypto.randomBytes(32).toString('base64url')
  const tokenHash = crypto.createHash('sha256').update(token).digest('hex')
  const now = new Date()
  const expiresAt = new Date(now.getTime() + 45 * 60 * 1000)
  await db.collection('passwordResetTokens').updateMany({ userId: user._id, usedAt: null }, { $set: { usedAt: now, invalidatedReason: 'replaced' } })
  await db.collection('passwordResetTokens').insertOne({ userId: user._id, tokenHash, expiresAt, usedAt: null, createdAt: now })
  return { token, tokenHash, expiresAt, user: { id: user._id, email: user.email, firstName: user.firstName } }
}

export async function consumePasswordResetToken(db: Db, token: string, password: string) {
  validatePassword(password)
  if (!/^[A-Za-z0-9_-]{40,}$/.test(token)) return false
  const tokenHash = crypto.createHash('sha256').update(token).digest('hex')
  const passwordHash = await hashPassword(password)
  const now = new Date()
  const reset = await db.collection('passwordResetTokens').findOneAndUpdate(
    { tokenHash, usedAt: null, expiresAt: { $gt: now } },
    { $set: { usedAt: now } },
    { returnDocument: 'after' },
  )
  if (!reset) return false
  const updated = await db.collection<UserDocument>('users').updateOne({ _id: reset.userId, status: 'ACTIVE' }, { $set: { passwordHash, passwordUpdatedAt: now, updatedAt: now } })
  if (!updated.modifiedCount) return false
  await db.collection('passwordResetTokens').updateMany({ userId: reset.userId, usedAt: null }, { $set: { usedAt: now, invalidatedReason: 'password_reset' } })
  await db.collection('auditLogs').insertOne({ userId: reset.userId, action: 'PASSWORD_RESET_COMPLETED', createdAt: now })
  return true
}

export function signSession(user: SessionUser) {
  const payload = base64url(JSON.stringify({ sub: String(user.userId), tid: String(user.tenantId), role: user.role, email: user.email, name: user.name, exp: Math.floor(Date.now() / 1000) + SESSION_MAX_AGE_SECONDS }))
  const signature = crypto.createHmac('sha256', requiredSessionSecret()).update(payload).digest('base64url')
  return `${payload}.${signature}`
}

export function readSession(token?: string): SessionUser | null {
  if (!token) return null
  const [payload, signature] = token.split('.')
  if (!payload || !signature) return null
  const expected = crypto.createHmac('sha256', requiredSessionSecret()).update(payload).digest('base64url')
  const actualBuffer = Buffer.from(signature)
  const expectedBuffer = Buffer.from(expected)
  if (actualBuffer.length !== expectedBuffer.length || !crypto.timingSafeEqual(actualBuffer, expectedBuffer)) return null
  try {
    const decoded = JSON.parse(Buffer.from(payload, 'base64url').toString('utf8')) as { sub?: string; tid?: string; role?: UserRole; email?: string; name?: string; exp?: number }
    if (!decoded.sub || !decoded.tid || !decoded.role || !decoded.email || !decoded.name || !decoded.exp || decoded.exp < Math.floor(Date.now() / 1000)) return null
    if (!ObjectId.isValid(decoded.sub) || !ObjectId.isValid(decoded.tid)) return null
    return { userId: new ObjectId(decoded.sub), tenantId: new ObjectId(decoded.tid), role: decoded.role, email: decoded.email, name: decoded.name }
  } catch {
    return null
  }
}

export function readCookie(header?: string) {
  const found = header?.split(';').map(value => value.trim()).find(value => value.startsWith(`${SESSION_COOKIE}=`))
  return found?.slice(SESSION_COOKIE.length + 1)
}

export function sessionCookie(token: string) {
  return `${SESSION_COOKIE}=${token}; Path=/; HttpOnly; SameSite=Lax; Max-Age=${SESSION_MAX_AGE_SECONDS}${process.env.NODE_ENV === 'production' ? '; Secure' : ''}`
}

export function expiredSessionCookie() {
  return `${SESSION_COOKIE}=; Path=/; HttpOnly; SameSite=Lax; Max-Age=0${process.env.NODE_ENV === 'production' ? '; Secure' : ''}`
}

function slugify(value: string) {
  return value.toLowerCase().trim().replace(/[^a-z0-9]+/g, '-').replace(/(^-|-$)/g, '').slice(0, 54) || 'workspace'
}

function normalizePhone(value: string) {
  const trimmed = value.trim()
  const normalized = trimmed.replace(/[^\d+]/g, '')
  if (!/^\+?\d{7,15}$/.test(normalized)) throw new Error('Enter a valid business phone number.')
  return normalized
}

export async function registerOwner(db: Db, input: { firstName: string; lastName: string; email: string; password: string; businessName: string; industry: string; country: string; businessPhone: string }) {
  const email = input.email.trim().toLowerCase()
  if (!/^\S+@\S+\.\S+$/.test(email)) throw new Error('Enter a valid business email address.')
  validatePassword(input.password)
  if (![input.firstName, input.lastName, input.businessName, input.industry, input.country, input.businessPhone].every(value => value.trim())) throw new Error('Complete every required registration field.')
  const businessPhone = normalizePhone(input.businessPhone)
  if (await db.collection<UserDocument>('users').findOne({ email })) throw new Error('An account already exists for that email address.')

  const now = new Date()
  const user: UserDocument = { _id: new ObjectId(), firstName: input.firstName.trim(), lastName: input.lastName.trim(), email, passwordHash: await hashPassword(input.password), status: 'ACTIVE', createdAt: now, updatedAt: now }
  const tenantId = new ObjectId()
  const baseSlug = slugify(input.businessName)
  let slug = baseSlug
  let suffix = 1
  while (await db.collection('tenants').findOne({ slug })) slug = `${baseSlug}-${++suffix}`
  try {
    await db.collection<UserDocument>('users').insertOne(user)
    const tenant = { _id: tenantId, name: input.businessName.trim(), slug, industry: input.industry.trim(), country: input.country.trim(), businessPhone, status: 'ACTIVE', createdAt: now, updatedAt: now }
    await db.collection('tenants').insertOne(tenant)
    await db.collection('tenantMemberships').insertOne({ tenantId, userId: user._id, role: 'OWNER' satisfies UserRole, createdAt: now, updatedAt: now })
    await db.collection('auditLogs').insertOne({ tenantId, userId: user._id, action: 'ACCOUNT_CREATED', createdAt: now, metadata: { source: 'public_registration' } })
    return { user, tenant, role: 'OWNER' as const }
  } catch (error) {
    await Promise.allSettled([
      db.collection<UserDocument>('users').deleteOne({ _id: user._id }),
      db.collection('tenants').deleteOne({ _id: tenantId }),
      db.collection('tenantMemberships').deleteMany({ tenantId }),
      db.collection('auditLogs').deleteMany({ tenantId }),
    ])
    throw error
  }
}

export async function loginUser(db: Db, emailInput: string, password: string) {
  const email = emailInput.trim().toLowerCase()
  const user = await db.collection<UserDocument>('users').findOne({ email })
  if (!user || user.status !== 'ACTIVE' || !(await verifyPassword(password, user.passwordHash))) return null
  const membership = await db.collection<{ tenantId: ObjectId; role: UserRole }>('tenantMemberships').findOne({ userId: user._id })
  if (!membership) return null
  await db.collection('auditLogs').insertOne({ tenantId: membership.tenantId, userId: user._id, action: 'LOGIN', createdAt: new Date() })
  return { user, tenantId: membership.tenantId, role: membership.role, platformAdmin: Boolean(user.platformAdmin) }
}

export async function ensureAuthIndexes(db: Db) {
  await Promise.all([
    db.collection('users').createIndex({ email: 1 }, { unique: true }),
    db.collection('tenants').createIndex({ slug: 1 }, { unique: true }),
    db.collection('tenantMemberships').createIndex({ tenantId: 1, userId: 1 }, { unique: true }),
    db.collection('tenantMemberships').createIndex({ userId: 1 }),
    db.collection('auditLogs').createIndex({ tenantId: 1, createdAt: -1 }),
  ])
}
