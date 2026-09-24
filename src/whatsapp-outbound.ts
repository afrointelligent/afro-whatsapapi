export type MetaConnection = { phoneNumberId: string; accessToken: string; apiVersion: string }
export type MetaSendResult = { messages?: Array<{ id: string }> }
type MetaErrorBody = { error?: { code?: number; error_subcode?: number; type?: string; fbtrace_id?: string; message?: string } }

export class WhatsAppSendError extends Error {
  constructor(public code: string, message: string, public details: { upstreamStatus?: number; metaCode?: number; metaSubcode?: number; traceId?: string } = {}) { super(message) }
}

export function metaSendError(status: number, body: MetaErrorBody) {
  const meta = body.error || {}
  const details = { upstreamStatus: status, metaCode: meta.code, metaSubcode: meta.error_subcode, traceId: meta.fbtrace_id }
  if (status === 401 || meta.code === 190 || /authentication error|access token/i.test(meta.message || '')) {
    return new WhatsAppSendError('META_AUTHENTICATION_FAILED', 'Meta rejected the WhatsApp access token. Update WHATSAPP_ACCESS_TOKEN in Render with a valid token for this account, then retry.', details)
  }
  if (meta.code === 10 || meta.code === 200) return new WhatsAppSendError('META_PERMISSION_DENIED', 'The Meta token does not have permission to send for this WhatsApp account. Check its account access and whatsapp_business_messaging permission.', details)
  if (meta.code === 131047) return new WhatsAppSendError('WHATSAPP_REPLY_WINDOW_CLOSED', 'The WhatsApp reply window has closed. Ask the customer to send a new message before replying.', details)
  return new WhatsAppSendError('META_SEND_REJECTED', 'Meta rejected this reply. Check the outbound request details in the Render logs.', details)
}

export async function sendMetaText(connection: MetaConnection, to: string, content: string, fetcher: typeof fetch = fetch): Promise<MetaSendResult> {
  return sendMetaPayload(connection, to, { type: 'text', text: { body: content } }, fetcher)
}

export async function sendMetaButtons(connection: MetaConnection, to: string, content: string, choices: Array<{ id: string; title: string }>, fetcher: typeof fetch = fetch) {
  if (!choices.length || choices.length > 3 || choices.some(choice => choice.title.length > 20)) throw new Error('Invalid reply buttons')
  return sendMetaPayload(connection, to, { type: 'interactive', interactive: { type: 'button', body: { text: content }, action: { buttons: choices.map(reply => ({ type: 'reply', reply })) } } }, fetcher)
}

async function sendMetaPayload(connection: MetaConnection, to: string, payload: object, fetcher: typeof fetch): Promise<MetaSendResult> {
  const accessToken = connection.accessToken.trim()
  if (!accessToken || !connection.phoneNumberId) throw new WhatsAppSendError('WHATSAPP_SENDING_NOT_CONFIGURED', 'The server-side WhatsApp sending credential is not configured.')
  const response = await fetcher(`https://graph.facebook.com/${connection.apiVersion}/${connection.phoneNumberId}/messages`, {
    method: 'POST', headers: { Authorization: `Bearer ${accessToken}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({ messaging_product: 'whatsapp', to: to.replace(/\D/g, ''), ...payload }),
    signal: AbortSignal.timeout(20000),
  })
  const body = await response.json().catch(() => ({})) as MetaErrorBody & MetaSendResult
  if (!response.ok) throw metaSendError(response.status, body)
  if (!body.messages?.[0]?.id) throw new WhatsAppSendError('META_SEND_UNCONFIRMED', 'Meta did not return a message receipt. Check delivery before retrying.', { upstreamStatus: response.status })
  return body
}

/** Read-only credential probe; never creates a WhatsApp message. */
export async function inspectMetaCredential(connection: MetaConnection, fetcher: typeof fetch = fetch) {
  if (!connection.accessToken.trim()) throw new WhatsAppSendError('WHATSAPP_SENDING_NOT_CONFIGURED', 'The server-side WhatsApp sending credential is not configured.')
  const response = await fetcher(`https://graph.facebook.com/${connection.apiVersion}/${connection.phoneNumberId}?fields=id`, { headers: { Authorization: `Bearer ${connection.accessToken.trim()}` }, signal: AbortSignal.timeout(15000) })
  const body = await response.json().catch(() => ({}))
  if (!response.ok) throw metaSendError(response.status, body)
  return { credentialAccepted: true, phoneMatched: body.id === connection.phoneNumberId }
}
