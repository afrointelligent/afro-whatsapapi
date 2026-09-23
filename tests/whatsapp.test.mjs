import test from 'node:test'
import assert from 'node:assert/strict'
import crypto from 'node:crypto'
import { MongoMemoryReplSet } from 'mongodb-memory-server-core'
import { ObjectId } from 'mongodb'
import { io as connect } from 'socket.io-client'

test('WhatsApp: real MongoDB transactions, HTTP and Socket.IO', { timeout: 180000 }, async t => {
  const mongo = process.env.TEST_MONGODB_URI ? null : await MongoMemoryReplSet.create({ replSet: { count: 1 }, binary: { version: '7.0.14' } })
  const testDatabase = 'whatsapp_test_' + crypto.randomBytes(10).toString('hex')
  Object.assign(process.env, { NODE_ENV: 'test', MONGODB_URI: process.env.TEST_MONGODB_URI || mongo.getUri(), MONGO_DB_NAME: testDatabase, SESSION_SECRET: 'isolated-test-session-secret-at-least-32-characters', META_APP_SECRET: 'isolated-test-app-secret', WHATSAPP_VERIFY_TOKEN: 'isolated-test-verify-token', INTERNAL_API_KEY: 'isolated-test-internal-key', WHATSAPP_PHONE_NUMBER_ID: 'test-phone-a', WHATSAPP_BUSINESS_ACCOUNT_ID: 'test-waba-a', WHATSAPP_ACCESS_TOKEN: '', WHATSAPP_INTERNAL_TENANT_ID: '', LOCAL_FRONTEND_PROXY_ENABLED: 'false' })
  const { getDb, closeMongoClient } = await import('../dist/db.js')
  const { startServer } = await import('../dist/server.js')
  const { signSession } = await import('../dist/auth.js')
  const { provisionInternalTenant } = await import('../dist/whatsapp-store.js')
  const db = await getDb()
  t.after(async () => { if (!db.databaseName.startsWith('whatsapp_test_')) throw new Error('Unsafe test cleanup'); await db.dropDatabase(); await closeMongoClient(); if (mongo) await mongo.stop() })
  const a = new ObjectId(), b = new ObjectId(), ua = new ObjectId(), ub = new ObjectId()
  await db.collection('tenants').insertMany([{ _id: a, name: 'Afro Intelligent', slug: 'afro-intelligent', status: 'ACTIVE' }, { _id: b, name: 'Other client', slug: 'other-client', status: 'ACTIVE' }])
  await db.collection('users').insertMany([{ _id: ua, status: 'ACTIVE', email: 'a@example.test' }, { _id: ub, status: 'ACTIVE', email: 'b@example.test' }])
  await db.collection('tenantMemberships').insertMany([{ tenantId: a, userId: ua, role: 'OWNER' }, { tenantId: b, userId: ub, role: 'OWNER' }])
  process.env.WHATSAPP_INTERNAL_TENANT_ID = String(a)
  const { server, io } = await startServer(0)
  const base = `http://127.0.0.1:${server.address().port}`
  const cookie = (userId, tenantId) => `afro_session=${signSession({ userId, tenantId, role: 'OWNER', email: 'owner@example.test', name: 'Owner' })}`
  const ca = cookie(ua, a), cb = cookie(ub, b), sockets = []
  t.after(async () => { for (const socket of sockets) socket.disconnect(); await new Promise(resolve => io.close(resolve)) })
  const payload = (id = 'wamid.first', overrides = {}) => ({ object: 'whatsapp_business_account', entry: [{ id: 'test-waba-a', changes: [{ field: 'messages', value: { messaging_product: 'whatsapp', metadata: { phone_number_id: 'test-phone-a' }, contacts: [{ profile: { name: 'Test Customer' }, wa_id: '27820000000' }], messages: [{ from: '27820000000', id, timestamp: '1790000000', type: 'text', text: { body: 'Hello Afro Intelligent' }, ...overrides }] } }] }] })
  const send = (body, signature, raw) => { const text = raw ?? JSON.stringify(body); return fetch(`${base}/webhooks/whatsapp`, { method: 'POST', headers: { 'Content-Type': 'application/json', 'X-Hub-Signature-256': signature ?? `sha256=${crypto.createHmac('sha256', process.env.META_APP_SECRET).update(text).digest('hex')}` }, body: text }) }
  const get = (path, cookieValue) => fetch(base + path, { headers: cookieValue ? { cookie: cookieValue } : {} })
  const openSocket = async (cookieValue, tenantId) => {
    const socket = connect(base, { autoConnect: false, transports: ['websocket'], extraHeaders: cookieValue ? { Cookie: cookieValue } : {}, auth: { tenantId }, reconnection: false })
    sockets.push(socket)
    await new Promise((resolve, reject) => { socket.once('connect', resolve); socket.once('connect_error', reject); socket.connect() })
    return socket
  }
  let conversation
  await t.test('reuses Afro Intelligent identity and refuses reassignment', async () => {
    await provisionInternalTenant(db)
    assert.equal((await fetch(base + '/api/internal/meta-review/provision', { method: 'POST', headers: { Authorization: 'Bearer ' + process.env.INTERNAL_API_KEY } })).status, 409)
    assert.equal(await db.collection('tenants').countDocuments(), 2)
    assert.equal(String((await db.collection('whatsappConnections').findOne({ phoneNumberId: 'test-phone-a' })).tenantId), String(a))
    process.env.WHATSAPP_INTERNAL_TENANT_ID = String(b)
    await assert.rejects(provisionInternalTenant(db), /another tenant/)
    process.env.WHATSAPP_INTERNAL_TENANT_ID = String(a)
  })
  await t.test('verification echoes challenge and rejects wrong or missing tokens', async () => {
    const valid = await get('/webhooks/whatsapp?hub.mode=subscribe&hub.verify_token=isolated-test-verify-token&hub.challenge=12345')
    assert.equal(valid.status, 200); assert.equal(await valid.text(), '12345')
    assert.equal((await get('/webhooks/whatsapp?hub.mode=subscribe&hub.verify_token=wrong&hub.challenge=12345')).status, 403)
    const previous = process.env.WHATSAPP_VERIFY_TOKEN; delete process.env.WHATSAPP_VERIFY_TOKEN
    assert.equal((await get('/webhooks/whatsapp?hub.mode=subscribe&hub.challenge=x')).status, 403)
    process.env.WHATSAPP_VERIFY_TOKEN = previous
  })
  await t.test('rejects forged signatures, malformed JSON and malformed signed payloads', async () => {
    assert.equal((await send(payload(), 'sha256=bad')).status, 401)
    assert.equal((await send(null, undefined, '{bad')).status, 400)
    for (const bad of [null, {}, { object: 'whatsapp_business_account', entry: {} }, payload('bad-time', { timestamp: 'not-a-time' }), payload('bad-text', { text: { body: {} } })]) assert.equal((await send(bad)).status, 400)
    assert.equal(await db.collection('whatsappMessages').countDocuments(), 0)
  })
  await t.test('persists contact, conversation and message before ack; realtime is tenant-scoped', async () => {
    const sa = await openSocket(ca, String(a)), sb = await openSocket(cb, String(b))
    const foreign = []; sb.on('whatsapp.event', event => foreign.push(event))
    const event = new Promise((resolve, reject) => { const timer = setTimeout(() => reject(new Error('Realtime timeout')), 5000); sa.once('whatsapp.event', data => { clearTimeout(timer); resolve(data) }) })
    assert.equal((await send(payload())).status, 200)
    conversation = await db.collection('whatsappConversations').findOne({ tenantId: a })
    assert.equal(conversation.customerName, 'Test Customer'); assert.equal(conversation.unreadCount, 1)
    assert.equal(conversation.automationMode, 'HUMAN_ACTIVE')
    assert.equal(await db.collection('whatsappContacts').countDocuments({ tenantId: a }), 1)
    assert.equal(await db.collection('whatsappMessages').countDocuments({ tenantId: a, conversationId: conversation._id }), 1)
    const received = await event
    assert.equal(received.type, 'message.created'); assert.equal(received.tenantId, String(a)); assert.equal(foreign.length, 0)
  })
  await t.test('concurrent duplicate deliveries save and count a message once', async () => {
    assert.ok((await Promise.all(Array.from({ length: 6 }, () => send(payload())))).every(r => r.status === 200))
    assert.ok((await Promise.all(Array.from({ length: 4 }, () => send(payload('wamid.concurrent'))))).every(r => r.status === 200))
    assert.equal(await db.collection('whatsappMessages').countDocuments(), 2)
    assert.equal((await db.collection('whatsappConversations').findOne({ _id: conversation._id })).unreadCount, 2)
  })
  await t.test('failed transaction rolls back receipt and unread count; retry recovers', async () => {
    await db.command({ collMod: 'whatsappMessages', validator: { metaMessageId: { $ne: 'wamid.retry' } }, validationLevel: 'strict', validationAction: 'error' })
    assert.equal((await send(payload('wamid.retry'))).status, 503)
    assert.equal(await db.collection('processedWhatsAppEvents').countDocuments({ messageId: 'wamid.retry' }), 0)
    assert.equal((await db.collection('whatsappConversations').findOne({ _id: conversation._id })).unreadCount, 2)
    await db.command({ collMod: 'whatsappMessages', validator: {} })
    assert.equal((await send(payload('wamid.retry'))).status, 200)
    assert.equal(await db.collection('whatsappMessages').countDocuments({ metaMessageId: 'wamid.retry' }), 1)
  })
  await t.test('preserves media metadata and latest conversation for out-of-order deliveries', async () => {
    assert.equal((await send(payload('wamid.media', { type: 'image', text: undefined, image: { id: 'media-id', mime_type: 'image/jpeg' }, timestamp: '1789000000' }))).status, 200)
    const message = await db.collection('whatsappMessages').findOne({ metaMessageId: 'wamid.media' })
    assert.equal(message.content, '[image]'); assert.equal(message.payload.image.id, 'media-id')
    assert.equal((await db.collection('whatsappConversations').findOne({ _id: conversation._id })).lastMessage, 'Hello Afro Intelligent')
  })
  await t.test('status retries are idempotent and cannot regress read to delivered', async () => {
    const status = (state, time) => { const p = payload(); const v = p.entry[0].changes[0].value; delete v.messages; v.statuses = [{ id: 'wamid.first', status: state, timestamp: time, recipient_id: '27820000000' }]; return p }
    assert.equal((await send(status('read', '1790000010'))).status, 200)
    assert.equal((await send(status('read', '1790000010'))).status, 200)
    assert.equal((await send(status('delivered', '1790000020'))).status, 200)
    assert.equal((await db.collection('whatsappMessages').findOne({ metaMessageId: 'wamid.first' })).deliveryStatus, 'read')
    assert.equal(await db.collection('whatsappMessageStatuses').countDocuments(), 2)
  })
  await t.test('early status is reconciled when outbound is persisted and tenant ownership is enforced', async () => {
    const { recordOutboundMessage } = await import('../dist/db.js')
    const p = payload(); const v = p.entry[0].changes[0].value; delete v.messages
    v.statuses = [{ id: 'wamid.outbound', status: 'delivered', timestamp: '1790000030' }]
    assert.equal((await send(p)).status, 200)
    await recordOutboundMessage({ tenantId: a, conversationId: conversation._id, metaMessageId: 'wamid.outbound', content: 'Test-only stored reply' })
    assert.equal((await db.collection('whatsappMessages').findOne({ metaMessageId: 'wamid.outbound' })).deliveryStatus, 'delivered')
    await assert.rejects(recordOutboundMessage({ tenantId: b, conversationId: conversation._id, metaMessageId: 'wamid.foreign', content: 'Rejected' }), /does not belong/)
  })
  await t.test('the same provider ID on another tenant cannot collide with its receipt', async () => {
    await db.collection('whatsappConnections').insertOne({ tenantId: b, phoneNumberId: 'test-phone-b', wabaId: 'test-waba-b', status: 'CONNECTED' })
    const p = payload(); p.entry[0].id = 'test-waba-b'; p.entry[0].changes[0].value.metadata.phone_number_id = 'test-phone-b'
    assert.equal((await send(p)).status, 200)
    assert.equal(await db.collection('whatsappMessages').countDocuments({ metaMessageId: 'wamid.first' }), 2)
    assert.equal(await db.collection('whatsappContacts').countDocuments({ tenantId: b }), 1)
  })
  await t.test('inbound readiness requires the configured active internal tenant', async () => {
    const ready = await get('/readiness/whatsapp'); assert.equal(ready.status, 200)
    const data = await ready.json(); assert.ok(Object.values(data.checks).every(Boolean))
    assert.ok(!JSON.stringify(data).includes(process.env.META_APP_SECRET))
    const id = process.env.WHATSAPP_INTERNAL_TENANT_ID; process.env.WHATSAPP_INTERNAL_TENANT_ID = String(b)
    assert.equal((await get('/readiness/whatsapp')).status, 503)
    process.env.WHATSAPP_INTERNAL_TENANT_ID = id
  })
  await t.test('unknown phone or mismatched WABA is retryable and writes nothing', async () => {
    const unknown = payload('wamid.unknown'); unknown.entry[0].changes[0].value.metadata.phone_number_id = 'unknown-phone'
    assert.equal((await send(unknown)).status, 503)
    const mismatch = payload('wamid.mismatch'); mismatch.entry[0].id = 'foreign-waba'
    assert.equal((await send(mismatch)).status, 503)
    assert.equal(await db.collection('whatsappMessages').countDocuments({ metaMessageId: { $in: ['wamid.unknown', 'wamid.mismatch'] } }), 0)
  })
  await t.test('APIs enforce authorization, tenant isolation and message pagination', async () => {
    assert.equal((await get('/api/whatsapp/tenants')).status, 401)
    assert.deepEqual((await (await get('/api/whatsapp/tenants', ca)).json()).tenants.map(tenant => tenant._id), [String(a)])
    assert.equal((await get(`/api/whatsapp/tenants/${a}/conversations`, cb)).status, 403)
    assert.equal((await (await get(`/api/whatsapp/tenants/${a}/conversations`, ca)).json()).conversations.length, 1)
    const path = `/api/whatsapp/tenants/${a}/conversations/${conversation._id}/messages`
    assert.equal((await get(path, cb)).status, 403)
    const messages = await (await get(path + '?limit=2', ca)).json()
    assert.equal(messages.messages.length, 2); assert.ok(messages.nextCursor)
    assert.equal((await get(`/api/whatsapp/tenants/${b}/conversations/${conversation._id}/messages`, cb)).status, 404)
    assert.equal((await get(`/api/workspace/inbox/${conversation._id}`, cb)).status, 404)
    assert.equal((await get('/api/tenants')).status, 404)
    await db.collection('tenantMemberships').deleteOne({ userId: ub })
    assert.equal((await get('/api/whatsapp/tenants', cb)).status, 401)
  })
  await t.test('sockets reject anonymous clients and cross-tenant room requests', async () => {
    await assert.rejects(openSocket(undefined, String(a)), /Tenant access denied/)
    await assert.rejects(openSocket(ca, String(b)), /Tenant access denied/)
  })
})
