import 'dotenv/config'
import assert from 'node:assert/strict'

const origin = process.argv[2] || 'https://automate.afrointelligent.co.za'
const expectedRelease = 'whatsapp-foundation-2026-09-22.1'
try {
  const health = await fetch(new URL('/health', origin))
  assert.equal(health.status, 200, 'Health endpoint must return HTTP 200')
  assert.equal((await health.json()).release, expectedRelease, 'Deploy the new webhook release before proceeding')
  const ready = await fetch(new URL('/readiness/whatsapp', origin))
  assert.equal(ready.status, 200, 'Inbound readiness must return HTTP 200; inspect its configuration flags')
  assert.ok(process.env.WHATSAPP_VERIFY_TOKEN, 'WHATSAPP_VERIFY_TOKEN is required locally')
  const callback = new URL('/webhooks/whatsapp', origin)
  callback.searchParams.set('hub.mode', 'subscribe')
  callback.searchParams.set('hub.verify_token', process.env.WHATSAPP_VERIFY_TOKEN)
  callback.searchParams.set('hub.challenge', 'afro-deployment-verification')
  const response = await fetch(callback)
  assert.equal(response.status, 200, 'Verify token did not match the deployment')
  assert.equal(await response.text(), 'afro-deployment-verification')
  console.log('PASS: release, inbound readiness and webhook verification. No messages sent.')
} catch (error) {
  console.error(error instanceof assert.AssertionError ? error.message : 'Deployment check failed; check network and configuration')
  process.exitCode = 1
}
