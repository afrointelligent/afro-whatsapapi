import 'dotenv/config'
import crypto from 'node:crypto'
import { promisify } from 'node:util'
import { MongoClient, ObjectId } from 'mongodb'

const scrypt = promisify(crypto.scrypt)
const email = String(process.env.PLATFORM_ADMIN_EMAIL || '').trim().toLowerCase()
const password = String(process.env.PLATFORM_ADMIN_PASSWORD || '')
const uri = process.env.MONGODB_URI || process.env.MONGO_URL || process.env.DATABASE_URL
if (!uri || !email || password.length < 12) throw new Error('MONGODB_URI, PLATFORM_ADMIN_EMAIL, and a 12+ character PLATFORM_ADMIN_PASSWORD are required.')

const client = new MongoClient(uri)
await client.connect()
try {
  const db = client.db(process.env.MONGO_DB_NAME || 'afrointelligent')
  const now = new Date()
  let user = await db.collection('users').findOne({ email })
  if (!user) {
    const salt = crypto.randomBytes(16).toString('hex')
    const hash = Buffer.from(await scrypt(password, salt, 64)).toString('hex')
    user = { _id: new ObjectId(), firstName: 'Afro', lastName: 'Administrator', email, passwordHash: `scrypt$${salt}$${hash}`, status: 'ACTIVE', platformAdmin: true, createdAt: now, updatedAt: now }
    await db.collection('users').insertOne(user)
  } else {
    await db.collection('users').updateOne({ _id: user._id }, { $set: { platformAdmin: true, status: 'ACTIVE', updatedAt: now } })
  }
  let membership = await db.collection('tenantMemberships').findOne({ userId: user._id })
  if (!membership) {
    const tenantId = new ObjectId()
    await db.collection('tenants').insertOne({ _id: tenantId, name: 'Afro Intelligent Administration', slug: 'afro-intelligent-administration', industry: 'Software', country: 'South Africa', businessPhone: '', status: 'ACTIVE', createdAt: now, updatedAt: now })
    await db.collection('tenantMemberships').insertOne({ tenantId, userId: user._id, role: 'ADMIN', createdAt: now, updatedAt: now })
  }
  await db.collection('auditLogs').insertOne({ tenantId: membership?.tenantId || (await db.collection('tenantMemberships').findOne({ userId: user._id })).tenantId, userId: user._id, action: 'PLATFORM_ADMIN_PROVISIONED', createdAt: now })
  console.log('Platform admin provisioned.')
} finally { await client.close() }
