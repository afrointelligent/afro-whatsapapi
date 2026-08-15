import { MongoClient, type Collection, type Db, type ObjectId } from 'mongodb'
import { ensureAuthIndexes } from './auth.js'

let clientPromise: Promise<MongoClient> | null = null

function mongoUri() {
  return process.env.MONGODB_URI || process.env.MONGO_URL || process.env.DATABASE_URL || ''
}

export async function getDb(): Promise<Db> {
  const uri = mongoUri()
  if (!uri) throw new Error('MONGODB_URI is required for durable WhatsApp processing')
  if (!clientPromise) {
    clientPromise = new MongoClient(uri, { maxPoolSize: 10, serverSelectionTimeoutMS: 8000 }).connect().catch(error => {
      clientPromise = null
      throw error
    })
  }
  return (await clientPromise).db(process.env.MONGO_DB_NAME || 'afrointelligent')
}

export type WhatsAppConnection = {
  tenantId: ObjectId
  phoneNumberId: string
  wabaId?: string
  /** Tenant token is required for customer-owned live connections. The review
   * test number deliberately uses the Render-only fallback token. */
  accessToken?: string
  connectionType?: 'META_TEST_NUMBER' | 'CUSTOMER_OWNED'
  status: 'CONNECTED' | 'DISCONNECTED' | 'ERROR'
  createdAt: Date
  updatedAt: Date
}

export async function getConnectionForPhoneId(phoneNumberId?: string) {
  if (!phoneNumberId) return null
  const db = await getDb()
  return db.collection<WhatsAppConnection>('whatsappConnections').findOne({ phoneNumberId, status: 'CONNECTED' })
}

export async function recordWebhookMessage(input: {
  tenantId: ObjectId
  messageId: string
  from: string
  content: string
  type: string
  timestamp: string
}) {
  const db = await getDb()
  const now = new Date()
  const processed: Collection<{ messageId: string; tenantId: ObjectId; createdAt: Date }> = db.collection('processedWhatsAppEvents')
  try {
    await processed.insertOne({ messageId: input.messageId, tenantId: input.tenantId, createdAt: now })
  } catch (error: unknown) {
    if (typeof error === 'object' && error && 'code' in error && error.code === 11000) return { duplicate: true, conversationId: null, automationMode: null }
    throw error
  }

  const conversations = db.collection('whatsappConversations')
  const conversation = await conversations.findOneAndUpdate(
    { tenantId: input.tenantId, customerPhone: input.from },
    { $set: { lastMessage: input.content, lastMessageAt: new Date(input.timestamp), updatedAt: now }, $setOnInsert: { tenantId: input.tenantId, customerPhone: input.from, customerName: input.from, automationMode: 'AI_ACTIVE', unreadCount: 0, createdAt: now } },
    { upsert: true, returnDocument: 'after' },
  )
  const conversationId = conversation?._id
  await db.collection('whatsappMessages').insertOne({ tenantId: input.tenantId, conversationId, metaMessageId: input.messageId, direction: 'inbound', content: input.content, type: input.type, timestamp: new Date(input.timestamp), createdAt: now })
  await conversations.updateOne({ _id: conversationId }, { $inc: { unreadCount: 1 } })
  return { duplicate: false, conversationId, automationMode: String(conversation?.automationMode || 'AI_ACTIVE') }
}

export async function recordOutboundMessage(input: { tenantId: ObjectId; conversationId: ObjectId | null; metaMessageId: string; content: string; type?: string }) {
  const db = await getDb()
  const now = new Date()
  await db.collection('whatsappMessages').insertOne({ tenantId: input.tenantId, conversationId: input.conversationId, metaMessageId: input.metaMessageId, direction: 'outbound', content: input.content, type: input.type || 'text', timestamp: now, createdAt: now })
  if (input.conversationId) await db.collection('whatsappConversations').updateOne({ _id: input.conversationId, tenantId: input.tenantId }, { $set: { lastMessage: input.content, lastMessageAt: now, updatedAt: now } })
}

export async function recordMessageStatus(input: { tenantId: ObjectId; metaMessageId: string; status: string; timestamp: string; recipientId?: string; errors?: unknown[] }) {
  const db = await getDb()
  const status = input.status.toLowerCase()
  const occurredAt = new Date(input.timestamp)
  await db.collection('whatsappMessages').updateOne(
    { tenantId: input.tenantId, metaMessageId: input.metaMessageId },
    {
      $set: {
        deliveryStatus: status,
        deliveryStatusAt: Number.isNaN(occurredAt.getTime()) ? new Date() : occurredAt,
        recipientId: input.recipientId || null,
        deliveryErrors: Array.isArray(input.errors) ? input.errors.slice(0, 5) : [],
        updatedAt: new Date(),
      },
    },
  )
}

export async function ensureWhatsappIndexes() {
  const db = await getDb()
  await Promise.all([
    db.collection('whatsappConnections').createIndex({ phoneNumberId: 1 }, { unique: true }),
    db.collection('processedWhatsAppEvents').createIndex({ messageId: 1 }, { unique: true }),
    db.collection('whatsappConversations').createIndex({ tenantId: 1, customerPhone: 1 }, { unique: true }),
    db.collection('whatsappMessages').createIndex({ tenantId: 1, conversationId: 1, timestamp: -1 }),
    db.collection('whatsappMessages').createIndex({ tenantId: 1, metaMessageId: 1 }),
    db.collection('verificationDocuments').createIndex({ tenantId: 1, uploadedAt: -1 }),
    ensureAuthIndexes(db),
  ])
}
