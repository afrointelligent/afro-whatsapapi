import { MongoClient } from 'mongodb'
import dotenv from 'dotenv'

dotenv.config()
dotenv.config({ path: '../../.env.local', override: false })

const uri = process.env.MONGODB_URI || process.env.MONGO_URL || process.env.DATABASE_URL
if (!uri) throw new Error('Set MONGODB_URI or MONGO_URL before provisioning the Meta Review tenant.')
const phoneNumberId = process.env.WHATSAPP_PHONE_NUMBER_ID
if (!phoneNumberId) throw new Error('WHATSAPP_PHONE_NUMBER_ID is required.')

const client = new MongoClient(uri)
await client.connect()
const db = client.db(process.env.MONGO_DB_NAME || 'afrointelligent')
const now = new Date()
const slug = 'afro-drive-academy-meta-review'
await db.collection('tenants').updateOne(
  { slug },
  { $set: { name: 'Afro Drive Academy — Meta Review', slug, industry: 'Driving School', country: 'South Africa', status: 'ACTIVE', reviewMode: true, description: 'Controlled Meta App Review workspace using the approved Meta test number.', openingHours: 'Mon–Sat, 08:00–17:00', updatedAt: now }, $setOnInsert: { createdAt: now } },
  { upsert: true },
)
const tenant = await db.collection('tenants').findOne({ slug })
if (!tenant) throw new Error('Review tenant could not be created.')
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
console.log(JSON.stringify({ ok: true, tenantId: tenant._id.toString(), slug, phoneNumberId }))
await client.close()
