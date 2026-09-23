import { MongoClient, type Db, type ObjectId } from 'mongodb'
import { ensureAuthIndexes } from './auth.js'
import { persistInbound, persistStatus, persistOutbound, type InboundMessage, type MessageStatus } from './whatsapp-store.js'

let clientPromise: Promise<MongoClient> | null = null

function mongoUri() {
  return process.env.MONGODB_URI || process.env.MONGO_URL || process.env.DATABASE_URL || ''
}

export async function getMongoClient(): Promise<MongoClient> {
  const uri = mongoUri()
  if (!uri) throw new Error('MONGODB_URI is required for durable WhatsApp processing')
  if (!clientPromise) {
    clientPromise = new MongoClient(uri, { maxPoolSize: 10, serverSelectionTimeoutMS: 8000 }).connect().catch(error => {
      clientPromise = null
      throw error
    })
  }
  return clientPromise
}

export async function getDb(): Promise<Db> {
  return (await getMongoClient()).db(process.env.MONGO_DB_NAME || 'afrointelligent')
}

export type WhatsAppConnection = {
  tenantId: ObjectId
  phoneNumberId: string
  wabaId?: string
  /** Tenant token is required for customer-owned live connections. The review
   * test number deliberately uses the Render-only fallback token. */
  accessToken?: string
  accessTokenEncrypted?: string
  businessId?: string
  displayPhoneNumber?: string
  verifiedName?: string
  onboardingStatus?: 'CONNECTED' | 'ERROR'
  connectionType?: 'META_TEST_NUMBER' | 'CUSTOMER_OWNED' | 'INTERNAL'
  status: 'CONNECTED' | 'DISCONNECTED' | 'ERROR'
  createdAt: Date
  updatedAt: Date
}

export async function getConnectionForPhoneId(phoneNumberId?: string) {
  if (!phoneNumberId) return null
  const db = await getDb()
  return db.collection<WhatsAppConnection>('whatsappConnections').findOne({ phoneNumberId, status: 'CONNECTED' })
}

export async function recordWebhookMessage(input: InboundMessage) {
  return persistInbound(await getMongoClient(), await getDb(), input)
}

export async function recordOutboundMessage(input: { tenantId: ObjectId; conversationId: ObjectId | null; metaMessageId: string; content: string; type?: string }) {
  return persistOutbound(await getMongoClient(), await getDb(), input)
}

export async function recordMessageStatus(input: MessageStatus) {
  return persistStatus(await getMongoClient(), await getDb(), input)
}

export async function ensureWhatsappIndexes() {
  const db = await getDb()
  await Promise.all([
    db.collection('whatsappConnections').createIndex({ phoneNumberId: 1 }, { unique: true }),
    db.collection('processedWhatsAppEvents').createIndex({ tenantId: 1, messageId: 1 }, { unique: true }),
    db.collection('whatsappContacts').createIndex({ tenantId: 1, phone: 1 }, { unique: true }),
    db.collection('whatsappMessageStatuses').createIndex({ tenantId: 1, metaMessageId: 1, status: 1, occurredAt: 1 }, { unique: true }),
    db.collection('whatsappRealtimeEvents').createIndex({ publishedAt: 1, _id: 1 }),
    db.collection('whatsappRealtimeEvents').createIndex({ publishedAt: 1 }, { expireAfterSeconds: 604800 }),
    db.collection('whatsappConversations').createIndex({ tenantId: 1, customerPhone: 1 }, { unique: true }),
    db.collection('whatsappMessages').createIndex({ tenantId: 1, conversationId: 1, timestamp: -1 }),
    db.collection('whatsappMessages').createIndex({ tenantId: 1, metaMessageId: 1 }),
    db.collection('passwordResetTokens').createIndex({ tokenHash: 1 }, { unique: true }),
    db.collection('passwordResetTokens').createIndex({ expiresAt: 1 }, { expireAfterSeconds: 0 }),
    db.collection('passwordResetRateLimits').createIndex({ key: 1 }, { unique: true }),
    db.collection('passwordResetRateLimits').createIndex({ expiresAt: 1 }, { expireAfterSeconds: 0 }),
    db.collection('verificationDocuments').createIndex({ tenantId: 1, uploadedAt: -1 }),
    ensureAuthIndexes(db),
  ])
  const oldReceiptIndex = (await db.collection('processedWhatsAppEvents').indexes()).find(index => index.name === 'messageId_1' && index.unique)
  if (oldReceiptIndex) await db.collection('processedWhatsAppEvents').dropIndex('messageId_1')
}

export async function closeMongoClient() {
  if (clientPromise) await (await clientPromise).close()
  clientPromise = null
}
