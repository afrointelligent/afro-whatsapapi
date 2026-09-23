import { type Db, type MongoClient, type ObjectId } from 'mongodb'

export type InboundMessage = {
  tenantId: ObjectId; messageId: string; from: string; content: string; type: string
  timestamp: string; customerName?: string; payload?: Record<string, unknown>
}

/** The duplicate receipt must commit with the message, never before it. */
export async function persistInbound(client: MongoClient, db: Db, input: InboundMessage) {
  const session = client.startSession()
  try {
    return await session.withTransaction(async () => {
      const now = new Date()
      const timestamp = new Date(input.timestamp)
      const receipt = { tenantId: input.tenantId, messageId: input.messageId }
      if (await db.collection('processedWhatsAppEvents').findOne(receipt, { session })) return { duplicate: true, conversationId: null, automationMode: null }
      await db.collection('processedWhatsAppEvents').insertOne({ ...receipt, createdAt: now }, { session })
      const contact = await db.collection('whatsappContacts').findOneAndUpdate(
        { tenantId: input.tenantId, phone: input.from },
        { $set: { name: input.customerName || input.from, updatedAt: now }, $max: { lastMessageAt: timestamp }, $setOnInsert: { createdAt: now } },
        { upsert: true, returnDocument: 'after', session },
      )
      const conversations = db.collection('whatsappConversations')
      const conversation = await conversations.findOneAndUpdate(
        { tenantId: input.tenantId, customerPhone: input.from },
        { $set: { contactId: contact!._id, customerName: input.customerName || input.from, updatedAt: now }, $inc: { unreadCount: 1 }, $setOnInsert: { automationMode: 'HUMAN_ACTIVE', createdAt: now } },
        { upsert: true, returnDocument: 'after', session },
      )
      const conversationId = conversation!._id
      await conversations.updateOne(
        { _id: conversationId, tenantId: input.tenantId, $or: [{ lastMessageAt: { $exists: false } }, { lastMessageAt: { $lte: timestamp } }] },
        { $set: { lastMessage: input.content, lastMessageAt: timestamp } }, { session },
      )
      await db.collection('whatsappMessages').insertOne({ tenantId: input.tenantId, conversationId, contactId: contact!._id, metaMessageId: input.messageId, direction: 'inbound', content: input.content, type: input.type, timestamp, payload: input.payload, createdAt: now }, { session })
      await db.collection('whatsappRealtimeEvents').insertOne({ tenantId: input.tenantId, conversationId, metaMessageId: input.messageId, type: 'message.created', createdAt: now, publishedAt: null }, { session })
      return { duplicate: false, conversationId, automationMode: String(conversation!.automationMode) }
    })
  } catch (error) {
    // A simultaneous delivery may have won the unique receipt insert.
    if (typeof error === 'object' && error && 'code' in error && error.code === 11000 && await db.collection('processedWhatsAppEvents').findOne({ tenantId: input.tenantId, messageId: input.messageId })) return { duplicate: true, conversationId: null, automationMode: null }
    throw error
  } finally { await session.endSession() }
}

export type MessageStatus = { tenantId: ObjectId; metaMessageId: string; status: string; timestamp: string; recipientId?: string; errors?: unknown[] }

export async function persistStatus(client: MongoClient, db: Db, input: MessageStatus) {
  const session = client.startSession()
  try {
    await session.withTransaction(async () => {
      const now = new Date()
      const occurredAt = new Date(input.timestamp)
      const key = { tenantId: input.tenantId, metaMessageId: input.metaMessageId, status: input.status, occurredAt }
      if (await db.collection('whatsappMessageStatuses').findOne(key, { session })) return
      await db.collection('whatsappMessageStatuses').insertOne({ ...key, recipientId: input.recipientId, errors: input.errors?.slice(0, 5), createdAt: now }, { session })
      const filter = { tenantId: input.tenantId, metaMessageId: input.metaMessageId }
      const message = await db.collection('whatsappMessages').findOne(filter, { session })
      // Keep receipts even if the outbound message has not been saved yet.
      const ranks: Record<string, number> = { sent: 1, failed: 1, delivered: 2, read: 3 }
      if (message && (!message.deliveryStatusAt || (occurredAt >= message.deliveryStatusAt && (ranks[input.status] || 0) >= (ranks[message.deliveryStatus] || 0)))) {
        await db.collection('whatsappMessages').updateOne(filter, { $set: { deliveryStatus: input.status, deliveryStatusAt: occurredAt, recipientId: input.recipientId, deliveryErrors: input.errors?.slice(0, 5) || [], updatedAt: now } }, { session })
      }
      await db.collection('whatsappRealtimeEvents').insertOne({ tenantId: input.tenantId, conversationId: message?.conversationId, metaMessageId: input.metaMessageId, type: 'message.status', status: input.status, createdAt: now, publishedAt: null }, { session })
    })
  } catch (error) {
    if (!(typeof error === 'object' && error && 'code' in error && error.code === 11000 && await db.collection('whatsappMessageStatuses').findOne({ tenantId: input.tenantId, metaMessageId: input.metaMessageId, status: input.status, occurredAt: new Date(input.timestamp) }))) throw error
  } finally { await session.endSession() }
}

export async function provisionInternalTenant(db: Db) {
  const phoneNumberId = process.env.WHATSAPP_PHONE_NUMBER_ID
  const wabaId = process.env.WHATSAPP_BUSINESS_ACCOUNT_ID
  const tenantId = process.env.WHATSAPP_INTERNAL_TENANT_ID
  if (!tenantId) return null // Explicitly bind the existing client; never guess ownership.
  const { ObjectId } = await import('mongodb')
  if (!ObjectId.isValid(tenantId) || !phoneNumberId || !wabaId) throw new Error('Internal WhatsApp tenant configuration is incomplete')
  const id = new ObjectId(tenantId)
  const tenant = await db.collection('tenants').findOne({ _id: id, status: 'ACTIVE' })
  if (!tenant) throw new Error('Configured internal WhatsApp tenant does not exist or is inactive')
  const existing = await db.collection('whatsappConnections').findOne({ phoneNumberId })
  if (existing && !existing.tenantId.equals(id)) throw new Error('WhatsApp phone is already assigned to another tenant')
  await db.collection('whatsappConnections').updateOne({ phoneNumberId, tenantId: id }, {
    $set: { wabaId, connectionType: 'INTERNAL', status: 'CONNECTED', updatedAt: new Date() },
    $setOnInsert: { createdAt: new Date() },
  }, { upsert: true })
  return tenant
}

export async function persistOutbound(client: MongoClient, db: Db, input: { tenantId: ObjectId; conversationId: ObjectId | null; metaMessageId: string; content: string; type?: string }) {
  const session = client.startSession()
  try {
    await session.withTransaction(async () => {
      const now = new Date()
      if (input.conversationId && !await db.collection('whatsappConversations').findOne({ _id: input.conversationId, tenantId: input.tenantId }, { session })) throw new Error('Conversation does not belong to tenant')
      const filter = { tenantId: input.tenantId, metaMessageId: input.metaMessageId }
      if (await db.collection('whatsappMessages').findOne(filter, { session })) return
      const statuses = await db.collection('whatsappMessageStatuses').find(filter, { session }).toArray()
      const ranks: Record<string, number> = { sent: 1, failed: 1, delivered: 2, read: 3 }
      const latest = statuses.sort((a, b) => (ranks[b.status] || 0) - (ranks[a.status] || 0) || b.occurredAt.getTime() - a.occurredAt.getTime())[0]
      await db.collection('whatsappMessages').insertOne({ ...filter, conversationId: input.conversationId, direction: 'outbound', content: input.content, type: input.type || 'text', timestamp: now, createdAt: now, ...(latest ? { deliveryStatus: latest.status, deliveryStatusAt: latest.occurredAt, deliveryErrors: latest.errors || [], recipientId: latest.recipientId } : {}) }, { session })
      if (input.conversationId) await db.collection('whatsappConversations').updateOne({ _id: input.conversationId, tenantId: input.tenantId }, { $set: { lastMessage: input.content, lastMessageAt: now, updatedAt: now } }, { session })
      await db.collection('whatsappRealtimeEvents').insertOne({ tenantId: input.tenantId, conversationId: input.conversationId, metaMessageId: input.metaMessageId, type: 'message.created', createdAt: now, publishedAt: null }, { session })
    })
  } finally { await session.endSession() }
}
