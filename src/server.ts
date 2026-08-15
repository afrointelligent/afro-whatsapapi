import 'dotenv/config'
import crypto from 'node:crypto'
import cors from 'cors'
import express, { type Request, type Response } from 'express'
import { createProxyMiddleware } from 'http-proxy-middleware'
import { ensureWhatsappIndexes, getConnectionForPhoneId, recordWebhookMessage, type WhatsAppConnection } from './db.js'

type AutomationMode = 'AI_ACTIVE' | 'HUMAN_ACTIVE'
type StoredMessage = { id: string; direction: 'inbound' | 'outbound'; content: string; timestamp: string; type: string }
type Conversation = { id: string; customerPhone: string; customerName: string; automationMode: AutomationMode; unreadCount: number; lastMessageAt: string; messages: StoredMessage[]; stage: 'NEW' | 'SERVICE' | 'TIME' | 'PAYMENT_PENDING' | 'CONFIRMED'; selectedTime?: string; paymentReference?: string; paymentStatus: 'NONE' | 'PENDING' | 'PAID'; bookingStatus: 'NONE' | 'RESERVED' | 'CONFIRMED' }
type Activity = { id: string; at: string; title: string; detail: string; tone: 'info' | 'success' }

const port = Number(process.env.PORT ?? 3001)
const apiVersion = process.env.META_API_VERSION ?? 'v22.0'
const app = express()
const conversations = new Map<string, Conversation>()
const processedMessageIds = new Set<string>()
const activities: Activity[] = []

function addActivity(title: string, detail: string, tone: Activity['tone'] = 'info') {
  activities.unshift({ id: crypto.randomUUID(), at: new Date().toISOString(), title, detail, tone })
  activities.splice(24)
}

const allowedOrigins = process.env.FRONTEND_URL?.split(',').map(origin => origin.trim()).filter(Boolean) ?? []
app.use(cors({ origin: process.env.NODE_ENV === 'production' ? allowedOrigins : (allowedOrigins.length ? allowedOrigins : true) }))
app.use(express.json({ verify: (req, _res, buf) => { (req as Request & { rawBody?: Buffer }).rawBody = buf } }))

function requireInternalApi(req: Request, res: Response, next: () => void) {
  if (process.env.NODE_ENV !== 'production') return next()
  const key = process.env.INTERNAL_API_KEY
  const received = req.header('authorization')?.replace(/^Bearer\s+/i, '')
  if (!key || !received || received !== key) return res.status(404).end()
  next()
}

function publicConversation(conversation: Conversation) {
  return { ...conversation, messages: conversation.messages.slice(-50) }
}

function getConversation(phone: string) {
  const existing = conversations.get(phone)
  if (existing) return existing
  const conversation: Conversation = { id: crypto.randomUUID(), customerPhone: phone, customerName: phone, automationMode: 'AI_ACTIVE', unreadCount: 0, lastMessageAt: new Date().toISOString(), messages: [], stage: 'NEW', paymentStatus: 'NONE', bookingStatus: 'NONE' }
  conversations.set(phone, conversation)
  return conversation
}

function validSignature(req: Request) {
  const secret = process.env.META_APP_SECRET
  if (!secret) return process.env.NODE_ENV !== 'production'
  const received = req.header('x-hub-signature-256')
  if (!received || !(req as Request & { rawBody?: Buffer }).rawBody) return false
  const expected = `sha256=${crypto.createHmac('sha256', secret).update((req as Request & { rawBody: Buffer }).rawBody).digest('hex')}`
  const actual = Buffer.from(received)
  const wanted = Buffer.from(expected)
  return actual.length === wanted.length && crypto.timingSafeEqual(actual, wanted)
}

export async function sendWhatsAppTextMessage(to: string, message: string, connection?: Pick<WhatsAppConnection, 'accessToken' | 'phoneNumberId'>) {
  const token = connection?.accessToken || process.env.WHATSAPP_ACCESS_TOKEN
  const phoneNumberId = connection?.phoneNumberId || process.env.WHATSAPP_PHONE_NUMBER_ID
  if (!token || !phoneNumberId) throw new Error('WHATSAPP_ACCESS_TOKEN and WHATSAPP_PHONE_NUMBER_ID are required')
  const response = await fetch(`https://graph.facebook.com/${apiVersion}/${phoneNumberId}/messages`, { method: 'POST', headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' }, body: JSON.stringify({ messaging_product: 'whatsapp', to: to.replace(/\D/g, ''), type: 'text', text: { body: message } }) })
  const result = await response.json() as { error?: { message?: string }; messages?: Array<{ id: string }> }
  if (!response.ok) throw new Error(result.error?.message ?? 'Meta Cloud API rejected the request')
  return result
}

async function sendWhatsAppChoiceButtons(to: string, body: string, choices: Array<{ id: string; title: string }>) {
  const token = process.env.WHATSAPP_ACCESS_TOKEN
  const phoneNumberId = process.env.WHATSAPP_PHONE_NUMBER_ID
  if (!token || !phoneNumberId) throw new Error('WHATSAPP_ACCESS_TOKEN and WHATSAPP_PHONE_NUMBER_ID are required')
  const response = await fetch(`https://graph.facebook.com/${apiVersion}/${phoneNumberId}/messages`, { method: 'POST', headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' }, body: JSON.stringify({ messaging_product: 'whatsapp', to: to.replace(/\D/g, ''), type: 'interactive', interactive: { type: 'button', body: { text: body }, action: { buttons: choices.map(choice => ({ type: 'reply', reply: choice })) } } }) })
  const result = await response.json() as { error?: { message?: string }; messages?: Array<{ id: string }> }
  if (!response.ok) throw new Error(result.error?.message ?? 'Meta Cloud API rejected the interactive message')
  return result
}

async function generateAIReply(text: string) {
  if (!process.env.DEEPSEEK_API_KEY) return 'Thanks for your message. I can help capture your enquiry and a team member will assist you shortly.'
  const response = await fetch('https://api.deepseek.com/chat/completions', { method: 'POST', headers: { Authorization: `Bearer ${process.env.DEEPSEEK_API_KEY}`, 'Content-Type': 'application/json' }, body: JSON.stringify({ model: 'deepseek-chat', messages: [{ role: 'system', content: 'You are Afro Intelligent, a concise South African business receptionist. Ask one useful question at a time. Never invent prices, hours, availability, addresses, policies, or financial details. Escalate uncertainty to a human.' }, { role: 'user', content: text }], max_tokens: 140, temperature: 0.3 }) })
  if (!response.ok) throw new Error('DeepSeek request failed')
  const result = await response.json() as { choices?: Array<{ message?: { content?: string } }> }
  return result.choices?.[0]?.message?.content?.trim() || 'Thanks. A team member will assist you shortly.'
}

function demoReply(conversation: Conversation, text: string) {
  const input = text.toLowerCase()
  if (conversation.stage === 'CONFIRMED' && input.includes('payment received')) return 'Payment received ✅ Your driving lesson is confirmed for Saturday at 11:00. We look forward to seeing you.'
  if (conversation.stage === 'PAYMENT_PENDING') {
    const baseUrl = process.env.PUBLIC_API_URL || `http://localhost:${port}`
    if (input === 'pay_now' || input.includes('pay r450') || input.includes('pay now')) {
      return `Here is your secure payment link:\n${baseUrl}/pay/demo/${conversation.paymentReference}`
    }
    if (input === 'pay_later' || input.includes('pay later')) return `No problem. Your ${conversation.selectedTime ?? 'selected'} slot is held temporarily. Tap Pay R450 whenever you are ready to confirm.`
    return `Your booking is waiting for payment. Tap Pay R450 to confirm your ${conversation.selectedTime ?? 'selected'} slot.`
  }
  if (conversation.stage === 'NEW') {
    conversation.stage = 'SERVICE'
    addActivity('New WhatsApp enquiry', 'Driving lesson enquiry captured from customer')
    addActivity('AI replied instantly', 'Asked customer to choose a service')
    return 'Hi 👋 Welcome to Afro Drive Academy. Tap a service below to get started.'
  }
  if (conversation.stage === 'SERVICE' && (input === '1' || input.includes('driving') || input.includes('lesson'))) {
    conversation.stage = 'TIME'
    addActivity('Lead qualified', 'Customer selected Driving Lesson')
    return 'Great choice. Tap a time for Saturday.'
  }
  if (conversation.stage === 'TIME') {
    const selectedTime = input === '1' || input.includes('09:00') ? '09:00'
      : input === '2' || input === '11' || input.includes('11:00') ? '11:00'
      : input === '3' || input.includes('14:00') ? '14:00'
      : null
    if (!selectedTime) return 'Please tap one of the available times: 09:00, 11:00, or 14:00.'
    const reference = `AFRO-DEMO-${Math.floor(10000 + Math.random() * 89999)}`
    conversation.stage = 'PAYMENT_PENDING'
    conversation.selectedTime = selectedTime
    conversation.paymentReference = reference
    conversation.paymentStatus = 'PENDING'
    conversation.bookingStatus = 'RESERVED'
    const baseUrl = process.env.PUBLIC_API_URL || `http://localhost:${port}`
    addActivity('Booking created', `Driving Lesson reserved for Saturday at ${selectedTime}`)
    addActivity('Payment request created', 'R450 demo payment link sent')
    return `Perfect. I’ve reserved Saturday at ${selectedTime} for you.\n\nDriving Lesson — R450.00\n\nTap the secure payment link to confirm your booking:\n${baseUrl}/pay/demo/${reference}`
  }
  return null
}

async function respondToCustomer(conversation: Conversation, text: string) {
  const stageBeforeReply = conversation.stage
  const reply = demoReply(conversation, text) ?? await generateAIReply(text)
  const sent = await sendWhatsAppTextMessage(conversation.customerPhone, reply)
  conversation.messages.push({ id: sent.messages?.[0]?.id ?? crypto.randomUUID(), direction: 'outbound', type: 'text', content: reply, timestamp: new Date().toISOString() })
  if (stageBeforeReply === 'NEW' && conversation.stage === 'SERVICE') {
    const buttons = await sendWhatsAppChoiceButtons(conversation.customerPhone, 'Choose a service', [{ id: '1', title: 'Driving Lesson' }, { id: '2', title: 'K53 Preparation' }, { id: '3', title: 'Refresher Lesson' }])
    conversation.messages.push({ id: buttons.messages?.[0]?.id ?? crypto.randomUUID(), direction: 'outbound', type: 'interactive', content: 'Tap a service: Driving Lesson · K53 Preparation · Refresher Lesson', timestamp: new Date().toISOString() })
  }
  if (stageBeforeReply === 'SERVICE' && conversation.stage === 'TIME') {
    const buttons = await sendWhatsAppChoiceButtons(conversation.customerPhone, 'Saturday availability', [{ id: '1', title: '09:00' }, { id: '2', title: '11:00' }, { id: '3', title: '14:00' }])
    conversation.messages.push({ id: buttons.messages?.[0]?.id ?? crypto.randomUUID(), direction: 'outbound', type: 'interactive', content: 'Tap a time: 09:00 · 11:00 · 14:00', timestamp: new Date().toISOString() })
  }
  if (stageBeforeReply === 'TIME' && conversation.stage === 'PAYMENT_PENDING') {
    const buttons = await sendWhatsAppChoiceButtons(conversation.customerPhone, 'Confirm your booking', [{ id: 'pay_now', title: 'Pay R450' }, { id: 'pay_later', title: 'Pay later' }])
    conversation.messages.push({ id: buttons.messages?.[0]?.id ?? crypto.randomUUID(), direction: 'outbound', type: 'interactive', content: 'Payment choices: Pay R450 · Pay later', timestamp: new Date().toISOString() })
  }
}

app.get('/health', (_req, res) => res.json({ status: 'ok', service: 'afro-intelligent-whatsapp-api' }))

app.get('/webhooks/whatsapp', (req, res) => {
  const { 'hub.mode': mode, 'hub.verify_token': token, 'hub.challenge': challenge } = req.query
  if (!mode && !token && !challenge) return res.json({ status: 'ready', service: 'afro-intelligent-whatsapp-api', message: 'Webhook is ready. Meta supplies verification parameters automatically.' })
  if (mode === 'subscribe' && typeof token === 'string' && token === process.env.WHATSAPP_VERIFY_TOKEN && typeof challenge === 'string') return res.status(200).type('text/plain').send(challenge)
  return res.status(403).json({ error: 'Webhook verification failed' })
})

app.post('/webhooks/whatsapp', async (req, res) => {
  if (!validSignature(req)) return res.status(401).json({ error: 'Invalid webhook signature' })
  res.status(200).json({ received: true })
  const values = req.body?.entry?.flatMap((entry: { changes?: Array<{ value?: unknown }> }) => entry.changes?.map(change => change.value) ?? []) ?? []
  for (const value of values) {
    const webhookValue = value as { metadata?: { phone_number_id?: string }; messages?: Array<{ id?: string; from?: string; timestamp?: string; type?: string; text?: { body?: string }; interactive?: { button_reply?: { id?: string; title?: string } } }> }
    const connection = await getConnectionForPhoneId(webhookValue.metadata?.phone_number_id).catch(error => {
      console.error('Unable to resolve WhatsApp tenant connection:', error instanceof Error ? error.message : 'unknown error')
      return null
    })
    const messages = webhookValue.messages ?? []
    for (const incoming of messages) {
      if (!incoming.id || !incoming.from || processedMessageIds.has(incoming.id)) continue
      processedMessageIds.add(incoming.id)
      const content = incoming.text?.body ?? incoming.interactive?.button_reply?.id ?? incoming.interactive?.button_reply?.title
      if (!content) continue
      if (!connection) {
        console.error('Ignoring WhatsApp message because no connected tenant matches the recipient phone number')
        continue
      }
      const durableEvent = await recordWebhookMessage({
        tenantId: connection.tenantId,
        messageId: incoming.id,
        from: incoming.from,
        content,
        type: incoming.type ?? 'text',
        timestamp: incoming.timestamp ? new Date(Number(incoming.timestamp) * 1000).toISOString() : new Date().toISOString(),
      })
      if (durableEvent.duplicate) continue
      const conversation = getConversation(incoming.from)
      conversation.unreadCount += 1
      conversation.lastMessageAt = new Date().toISOString()
      conversation.messages.push({ id: incoming.id, direction: 'inbound', type: incoming.type ?? 'text', content, timestamp: incoming.timestamp ?? conversation.lastMessageAt })
      addActivity('New WhatsApp enquiry', content.slice(0, 80))
      if (conversation.automationMode !== 'AI_ACTIVE') continue
      // The old demo engine is intentionally not allowed to respond to a live
      // tenant. Live replies are enabled only once a tenant-scoped flow engine
      // is configured, preventing one business's rules from serving another.
      console.info(`Persisted inbound WhatsApp message for tenant ${connection.tenantId.toString()}; automation awaits published tenant flow`)
    }
  }
})

app.use(['/api/conversations', '/api/dashboard'], requireInternalApi)
app.get('/api/conversations', (_req, res) => res.json([...conversations.values()].sort((a, b) => b.lastMessageAt.localeCompare(a.lastMessageAt)).map(publicConversation)))
app.delete('/api/conversations/:phone', (req, res) => {
  const conversation = conversations.get(req.params.phone)
  if (!conversation) return res.status(404).json({ error: 'Conversation not found' })
  conversation.messages = []
  conversation.stage = 'NEW'
  conversation.paymentStatus = 'NONE'
  conversation.bookingStatus = 'NONE'
  conversation.selectedTime = undefined
  conversation.paymentReference = undefined
  conversation.unreadCount = 0
  addActivity('Conversation cleared', 'Dashboard demo history was reset')
  return res.json(publicConversation(conversation))
})
app.get('/api/dashboard', (_req, res) => {
  const all = [...conversations.values()]
  res.json({ businessName: 'Afro Drive Academy', metrics: { enquiries: 24 + all.length, leads: 18 + all.filter(c => c.stage !== 'NEW').length, bookings: 11 + all.filter(c => c.bookingStatus !== 'NONE').length, revenue: 8450 + all.filter(c => c.paymentStatus === 'PAID').length * 450, conversations: 63 + all.length }, activities, conversations: all.sort((a, b) => b.lastMessageAt.localeCompare(a.lastMessageAt)).map(publicConversation) })
})
app.post('/api/conversations/:phone/take-over', (req, res) => { const c = getConversation(req.params.phone); c.automationMode = 'HUMAN_ACTIVE'; res.json(publicConversation(c)) })
app.post('/api/conversations/:phone/resume-ai', (req, res) => { const c = getConversation(req.params.phone); c.automationMode = 'AI_ACTIVE'; res.json(publicConversation(c)) })
app.post('/api/dev/send-message', async (req, res) => {
  if (process.env.NODE_ENV === 'production') return res.status(404).end()
  const { to, message } = req.body ?? {}
  if (typeof to !== 'string' || typeof message !== 'string' || !to || !message) return res.status(400).json({ error: 'Provide { to, message }' })
  try { res.json(await sendWhatsAppTextMessage(to, message)) } catch (error) { res.status(502).json({ error: error instanceof Error ? error.message : 'Unable to send message' }) }
})

app.post('/api/dev/simulate', async (req, res) => {
  if (process.env.NODE_ENV === 'production') return res.status(404).end()
  const phone = process.env.WHATSAPP_TEST_RECIPIENT_PHONE || '27676087645'
  const text = typeof req.body?.message === 'string' ? req.body.message : 'Hi, I want a driving lesson.'
  const conversation = getConversation(phone)
  conversation.messages.push({ id: crypto.randomUUID(), direction: 'inbound', type: 'text', content: text, timestamp: new Date().toISOString() })
  try { await respondToCustomer(conversation, text); res.json(publicConversation(conversation)) } catch (error) { res.status(502).json({ error: error instanceof Error ? error.message : 'Unable to simulate message' }) }
})

app.post('/api/dev/reset', (_req, res) => {
  conversations.clear()
  processedMessageIds.clear()
  activities.splice(0)
  addActivity('Demo reset', 'Ready for a fresh customer conversation')
  res.json({ ok: true })
})

app.get('/pay/demo/:reference', (req, res) => {
  const conversation = [...conversations.values()].find(item => item.paymentReference === req.params.reference)
  if (!conversation) return res.status(404).send('Payment reference not found')
  res.type('html').send(`<!doctype html><html><head><meta name="viewport" content="width=device-width,initial-scale=1"><title>Afro Intelligent Secure Checkout</title><style>body{margin:0;background:#f4f8f6;font-family:Arial,sans-serif;color:#10231c}.card{max-width:520px;margin:8vh auto;background:#fff;border-radius:28px;padding:36px;box-shadow:0 20px 70px #123b2b22}.tag{color:#17844f;font-weight:bold;font-size:12px;letter-spacing:1.5px}.amount{font-size:42px;font-weight:800;margin:12px 0}button{width:100%;border:0;border-radius:14px;background:#17844f;color:#fff;padding:17px;font-size:16px;font-weight:700;cursor:pointer}.note{background:#fff7d9;padding:12px;border-radius:10px;font-size:13px;margin:22px 0}</style></head><body><main class="card"><p class="tag">AFRO INTELLIGENT SECURE CHECKOUT</p><h1>Demo payment</h1><p>Merchant: <b>Afro Drive Academy</b></p><p>Driving Lesson · Saturday · 11:00</p><p class="amount">R450.00</p><p>Reference: ${req.params.reference}</p><p class="note">DEMO TRANSACTION — no real money will be charged.</p><button onclick="pay()">Pay R450.00 — Demo</button><p id="status"></p></main><script>async function pay(){document.querySelector('button').disabled=true;document.getElementById('status').textContent='Processing secure payment…';await new Promise(r=>setTimeout(r,1100));let r=await fetch('/api/payments/${req.params.reference}/complete',{method:'POST'});document.getElementById('status').textContent=r.ok?'✓ Payment successful. Your booking is confirmed.':'Payment could not be completed.'}</script></body></html>`)
})

app.post('/api/payments/:reference/complete', async (req, res) => {
  const conversation = [...conversations.values()].find(item => item.paymentReference === req.params.reference)
  if (!conversation) return res.status(404).json({ error: 'Payment reference not found' })
  conversation.paymentStatus = 'PAID'; conversation.bookingStatus = 'CONFIRMED'; conversation.stage = 'CONFIRMED'
  addActivity('R450 payment received', 'Driving Lesson booking confirmed', 'success')
  try { await respondToCustomer(conversation, 'payment received') } catch { /* payment state remains confirmed even when Meta delivery is unavailable */ }
  res.json({ status: 'PAID', bookingStatus: 'CONFIRMED' })
})

// Local demos can share an ngrok URL. Production Render must never proxy the
// Vercel frontend or its authenticated routes.
if (process.env.LOCAL_FRONTEND_PROXY_ENABLED === 'true' && process.env.NODE_ENV !== 'production') {
  const frontendProxy = createProxyMiddleware({ target: process.env.FRONTEND_URL || 'http://localhost:3002', changeOrigin: true, ws: true, pathRewrite: (_path, req) => (req as unknown as { originalUrl?: string }).originalUrl ?? _path })
  app.use(['/whatsapp', '/_next', '/logo%20afrointelligent2.png', '/register', '/login', '/reset-password', '/api/auth', '/api/client'], frontendProxy)
}

app.listen(port, () => {
  ensureWhatsappIndexes().catch(error => console.error('Unable to ensure WhatsApp indexes:', error instanceof Error ? error.message : 'unknown error'))
  console.log(`Afro Intelligent WhatsApp API listening on :${port}; webhook available at /webhooks/whatsapp`)
})
