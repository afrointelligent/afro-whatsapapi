import test from 'node:test'
import assert from 'node:assert/strict'
import { sendMetaText, WhatsAppSendError } from '../dist/whatsapp-outbound.js'
const connection = { phoneNumberId: 'account-phone-id', accessToken: ' private-test-token ', apiVersion: 'v25.0' }

test('outbound uses the tenant phone and server-only Authorization header', async () => {
  let called = false
  const result = await sendMetaText(connection, '+27 82 000 0000', 'Authorized reply', async (url, options) => {
    called = true
    assert.equal(url, 'https://graph.facebook.com/v25.0/account-phone-id/messages')
    assert.equal(options.headers.Authorization, 'Bearer private-test-token')
    const body = JSON.parse(options.body)
    assert.equal(body.to, '27820000000'); assert.equal(body.text.body, 'Authorized reply')
    assert.equal(options.body.includes('private-test-token'), false)
    return new Response(JSON.stringify({ messages: [{ id: 'wamid.accepted' }] }), { status: 200 })
  })
  assert.ok(called); assert.equal(result.messages[0].id, 'wamid.accepted')
})

test('expired Meta credential is distinguished from admin login and preserves safe trace details', async () => {
  await assert.rejects(sendMetaText(connection, '27820000000', 'reply', async () => new Response(JSON.stringify({ error: { code: 190, error_subcode: 463, message: 'token secret-value expired', fbtrace_id: 'meta-trace' } }), { status: 401 })), error => {
    assert.ok(error instanceof WhatsAppSendError); assert.equal(error.code, 'META_AUTHENTICATION_FAILED')
    assert.equal(error.details.metaCode, 190); assert.equal(error.details.metaSubcode, 463)
    assert.equal(error.details.traceId, 'meta-trace'); assert.ok(!JSON.stringify(error).includes('secret-value')); return true
  })
})

test('generic Meta Authentication Error is classified without hiding the failure', async () => {
  await assert.rejects(sendMetaText(connection, '27820000000', 'reply', async () => new Response(JSON.stringify({ error: { message: 'Authentication Error', code: 0 } }), { status: 400 })), { code: 'META_AUTHENTICATION_FAILED' })
})

test('closed reply window and insufficient permission are different errors', async () => {
  for (const [code, expected] of [[131047, 'WHATSAPP_REPLY_WINDOW_CLOSED'], [200, 'META_PERMISSION_DENIED']]) {
    await assert.rejects(sendMetaText(connection, '27820000000', 'reply', async () => new Response(JSON.stringify({ error: { code } }), { status: 400 })), { code: expected })
  }
})

test('missing credential and missing Meta receipt cannot be reported as success', async () => {
  await assert.rejects(sendMetaText({ ...connection, accessToken: '' }, '27820000000', 'reply'), { code: 'WHATSAPP_SENDING_NOT_CONFIGURED' })
  await assert.rejects(sendMetaText(connection, '27820000000', 'reply', async () => new Response('{}', { status: 200 })), { code: 'META_SEND_UNCONFIRMED' })
})

test('credential diagnostic is read-only and uses the same server credential', async () => {
  const { inspectMetaCredential } = await import('../dist/whatsapp-outbound.js')
  const result = await inspectMetaCredential(connection, async (url, options) => {
    assert.equal(url, 'https://graph.facebook.com/v25.0/account-phone-id?fields=id')
    assert.equal(options.method, undefined); assert.equal(options.body, undefined)
    assert.equal(options.headers.Authorization, 'Bearer private-test-token')
    return new Response(JSON.stringify({ id: 'account-phone-id' }), { status: 200 })
  })
  assert.deepEqual(result, { credentialAccepted: true, phoneMatched: true })
})
