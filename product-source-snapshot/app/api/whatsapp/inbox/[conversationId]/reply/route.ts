import { NextResponse } from 'next/server'
import { ObjectId } from 'mongodb'
import { requireTenant } from '@/lib/server-auth'

type Context = { params: Promise<{ conversationId: string }> }

export async function POST(request: Request, { params }: Context) {
  try {
    const { conversationId } = await params
    const { tenant } = await requireTenant()
    const content = String((await request.json().catch(() => null))?.content || '').trim()
    if (!ObjectId.isValid(conversationId) || !content) return NextResponse.json({ error: 'A message is required.' }, { status: 400 })
    const baseUrl = process.env.WHATSAPP_API_URL || process.env.NEXT_PUBLIC_WHATSAPP_API_URL
    const key = process.env.WHATSAPP_INTERNAL_API_KEY
    if (!baseUrl || !key) return NextResponse.json({ error: 'Live WhatsApp replies are not configured yet.' }, { status: 503 })
    const response = await fetch(`${baseUrl.replace(/\/$/, '')}/api/tenants/${tenant._id}/conversations/${conversationId}/reply`, { method: 'POST', headers: { Authorization: `Bearer ${key}`, 'Content-Type': 'application/json' }, body: JSON.stringify({ content }), cache: 'no-store' })
    const payload = await response.json().catch(() => ({}))
    return NextResponse.json(payload, { status: response.status })
  } catch {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }
}
