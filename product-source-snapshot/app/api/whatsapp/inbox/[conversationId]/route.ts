import { NextResponse } from 'next/server'
import { ObjectId } from 'mongodb'
import { getDb } from '@/lib/mongodb'
import { requireTenant } from '@/lib/server-auth'

type Context = { params: Promise<{ conversationId: string }> }

export async function GET(_request: Request, { params }: Context) {
  try {
    const { conversationId } = await params
    const { tenant } = await requireTenant()
    if (!ObjectId.isValid(conversationId)) return NextResponse.json({ error: 'Invalid conversation' }, { status: 400 })
    const db = await getDb()
    const _id = new ObjectId(conversationId)
    const [conversation, messages] = await Promise.all([
      db.collection('whatsappConversations').findOne({ _id, tenantId: tenant._id }),
      db.collection('whatsappMessages').find({ tenantId: tenant._id, conversationId: _id }).sort({ timestamp: 1 }).limit(250).toArray(),
    ])
    if (!conversation) return NextResponse.json({ error: 'Not found' }, { status: 404 })
    return NextResponse.json({ conversation, messages })
  } catch {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }
}

export async function PATCH(request: Request, { params }: Context) {
  try {
    const { conversationId } = await params
    const { tenant } = await requireTenant()
    const mode = (await request.json().catch(() => null))?.mode
    if (!ObjectId.isValid(conversationId) || !['AI_ACTIVE', 'HUMAN_ACTIVE'].includes(mode)) return NextResponse.json({ error: 'Invalid update' }, { status: 400 })
    const db = await getDb()
    const result = await db.collection('whatsappConversations').findOneAndUpdate({ _id: new ObjectId(conversationId), tenantId: tenant._id }, { $set: { automationMode: mode, updatedAt: new Date() } }, { returnDocument: 'after' })
    if (!result) return NextResponse.json({ error: 'Not found' }, { status: 404 })
    return NextResponse.json({ conversation: result })
  } catch {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }
}
