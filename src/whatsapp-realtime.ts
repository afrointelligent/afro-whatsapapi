import Pusher from 'pusher'
import type { Db } from 'mongodb'
import type { Server } from 'socket.io'

export function pusherConfigured() {
  return ['PUSHER_APP_ID', 'PUSHER_KEY', 'PUSHER_SECRET', 'PUSHER_CLUSTER'].every(key => Boolean(process.env[key]?.trim()))
}
let client: Pusher | undefined
export async function publishPusher(channel: string, event: string, data: object) {
  if (!pusherConfigured()) throw new Error('Pusher is not configured')
  client ||= new Pusher({ appId: process.env.PUSHER_APP_ID!, key: process.env.PUSHER_KEY!, secret: process.env.PUSHER_SECRET!, cluster: process.env.PUSHER_CLUSTER!, useTLS: true, timeout: 10000 })
  await client.trigger(channel, event, data)
}
export async function dispatchRealtime(db: Db, io: Pick<Server, 'to'>, publish = publishPusher, usePusher = pusherConfigured()) {
  const events = await db.collection('whatsappRealtimeEvents').find({ publishedAt: null }).sort({ _id: 1 }).limit(100).toArray()
  for (const event of events) {
    const payload = { id: String(event._id), type: event.type, tenantId: String(event.tenantId), conversationId: event.conversationId ? String(event.conversationId) : null, metaMessageId: event.metaMessageId, status: event.status }
    // Exactly one configured transport; a rejected publish stays in the durable outbox.
    if (usePusher) await publish(`private-whatsapp-${event.tenantId}`, 'whatsapp.event', payload)
    else io.to(`tenant:${event.tenantId}`).emit('whatsapp.event', payload)
    await db.collection('whatsappRealtimeEvents').updateOne({ _id: event._id, publishedAt: null }, { $set: { publishedAt: new Date() } })
  }
}
