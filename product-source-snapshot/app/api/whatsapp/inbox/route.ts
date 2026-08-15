import { NextResponse } from 'next/server'
import { getDb } from '@/lib/mongodb'
import { requireTenant } from '@/lib/server-auth'

export async function GET() {
  try {
    const { tenant } = await requireTenant()
    const db = await getDb()
    const conversations = await db.collection('whatsappConversations').find({ tenantId: tenant._id }).sort({ lastMessageAt: -1 }).limit(100).toArray()
    return NextResponse.json({ tenant: { id: String(tenant._id), name: tenant.name }, conversations })
  } catch {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }
}
