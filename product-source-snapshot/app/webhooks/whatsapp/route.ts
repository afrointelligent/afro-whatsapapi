import { NextRequest, NextResponse } from 'next/server'

export const runtime = 'nodejs'

export function GET(request: NextRequest) {
  const params = request.nextUrl.searchParams
  const mode = params.get('hub.mode')
  const token = params.get('hub.verify_token')
  const challenge = params.get('hub.challenge')

  if (mode === 'subscribe' && token && token === process.env.WHATSAPP_VERIFY_TOKEN && challenge) {
    return new NextResponse(challenge, { status: 200, headers: { 'content-type': 'text/plain' } })
  }
  return NextResponse.json({ error: 'Webhook verification failed' }, { status: 403 })
}

export async function POST(request: NextRequest) {
  try {
    const payload = await request.json()
    const changes = payload?.entry?.flatMap((entry: { changes?: unknown[] }) => entry.changes ?? []) ?? []
    console.info('WhatsApp webhook received', { entries: payload?.entry?.length ?? 0, changes: changes.length })
    return NextResponse.json({ received: true })
  } catch {
    return NextResponse.json({ error: 'Invalid webhook payload' }, { status: 400 })
  }
}
