import 'dotenv/config'
import assert from 'node:assert/strict'

const origin = process.argv[2] || 'https://automate.afrointelligent.co.za'
const expectedRelease = process.env.EXPECTED_RELEASE || ''
const tenantId = process.env.WHATSAPP_INTERNAL_TENANT_ID || '6a80099b0c85c7272328824d'

function safeError(body) {
  return body && typeof body === 'object'
    ? { code: body.code || body.error?.code, metaCode: body.metaCode || body.error?.metaCode, metaSubcode: body.metaSubcode || body.error?.metaSubcode, upstreamStatus: body.upstreamStatus, traceId: body.traceId }
    : {}
}

try {
  const health = await fetch(new URL('/health', origin))
  assert.equal(health.status, 200, 'Health endpoint must return HTTP 200')
  const healthBody = await health.json()
  assert.equal(healthBody.service, 'afro-intelligent-whatsapp', 'Unexpected service at production URL')
  assert.ok(typeof healthBody.release === 'string' && healthBody.release.length > 0, 'Health response is missing release')
  if (expectedRelease) assert.equal(healthBody.release, expectedRelease, `Expected release ${expectedRelease}, got ${healthBody.release}`)
  console.log(`PASS: health (${healthBody.release})`)

  const ready = await fetch(new URL('/readiness/whatsapp', origin))
  const readyBody = await ready.json().catch(() => ({}))
  assert.equal(ready.status, 200, `WhatsApp readiness failed: ${JSON.stringify(readyBody.checks || {})}`)
  console.log(`PASS: readiness (${readyBody.features?.realtime || 'unknown'} realtime; automation ${readyBody.features?.automation ? 'on' : 'off'})`)

  if (process.env.WHATSAPP_VERIFY_TOKEN) {
    const callback = new URL('/webhooks/whatsapp', origin)
    callback.searchParams.set('hub.mode', 'subscribe')
    callback.searchParams.set('hub.verify_token', process.env.WHATSAPP_VERIFY_TOKEN)
    callback.searchParams.set('hub.challenge', 'afro-deployment-verification')
    const response = await fetch(callback)
    assert.equal(response.status, 200, 'Verify token did not match the deployment')
    assert.equal(await response.text(), 'afro-deployment-verification')
    console.log('PASS: webhook verification')
  } else console.log('SKIP: webhook verify-token check (WHATSAPP_VERIFY_TOKEN not available locally)')

  if (process.env.INTERNAL_API_KEY) {
    const credential = await fetch(new URL(`/api/tenants/${tenantId}/whatsapp/send-credentials`, origin), { headers: { Authorization: `Bearer ${process.env.INTERNAL_API_KEY}` } })
    const body = await credential.json().catch(() => ({}))
    assert.equal(credential.status, 200, `Outbound credential failed: ${JSON.stringify(safeError(body))}`)
    assert.equal(body.credentialAccepted, true, 'Meta did not accept the production sending credential')
    assert.equal(body.phoneMatched, true, 'Meta credential does not resolve to the configured phone number')
    console.log('PASS: outbound Meta credential accepted')
  } else console.log('SKIP: outbound Render credential check (INTERNAL_API_KEY not available locally)')

  console.log('PASS: deployment checks complete; no WhatsApp message was sent.')
} catch (error) {
  console.error(error instanceof assert.AssertionError ? error.message : 'Deployment check failed; inspect Render/Meta configuration')
  process.exitCode = 1
}
