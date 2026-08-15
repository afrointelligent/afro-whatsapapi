const flowTypes = {
  START: ['Start', '▶', 'Where the conversation begins'],
  MESSAGE: ['Message', '✦', 'Send information or a greeting'],
  QUESTION: ['Question', '?', 'Ask the customer for an answer'],
  SERVICE_CHOICE: ['Service choice', '▦', 'Let the customer choose a service'],
  DECISION: ['Decision', '◆', 'Split the journey using a condition'],
  BOOKING: ['Booking', '□', 'Offer an available date or time'],
  PAYMENT: ['Payment', 'R', 'Send a secure payment request'],
  HANDOVER: ['Human handover', '↗', 'Pause AI and notify a team member'],
}

const paymentProviders = {
  PAYFAST: 'PayFast', YOCO: 'Yoco', OZOW: 'Ozow', PEACH_PAYMENTS: 'Peach Payments', PAYGATE: 'PayGate', STRIPE: 'Stripe', PAYPAL: 'PayPal', NETCASH: 'Netcash', IKHOKHA: 'iKhokha',
  SNAPSCAN: 'SnapScan', ZAPPER: 'Zapper', PAYFLEX: 'Payflex', MOBICRED: 'Mobicred', PAYJUSTNOW: 'PayJustNow', APPLE_PAY: 'Apple Pay', GOOGLE_PAY: 'Google Pay',
  EFT: 'EFT / bank transfer', DEBIT_ORDER: 'Debit order', MOBILE_MONEY: 'Mobile money', CASH: 'Cash', CARD_ON_SITE: 'Card on site',
  INVOICE: 'Invoice', CUSTOM_LINK: 'Custom payment link', OTHER: 'Other payment method',
}
const paymentAmountModes = { FULL_AMOUNT: 'Full service amount', DEPOSIT: 'Deposit', FIXED_AMOUNT: 'Fixed amount', DYNAMIC_AMOUNT: 'Dynamic amount from booking', INVOICE_TOTAL: 'Invoice total' }
const gatewayCredentialFields = {
  PAYFAST: [['merchantId', 'Merchant ID'], ['merchantKey', 'Merchant key'], ['passphrase', 'Security passphrase']],
  YOCO: [['publicKey', 'Public key'], ['secretKey', 'Secret key'], ['webhookSecret', 'Webhook secret']],
  OZOW: [['siteCode', 'Site code'], ['apiKey', 'API key'], ['secretKey', 'Private key']],
  PEACH_PAYMENTS: [['accountId', 'Entity / account ID'], ['secretKey', 'Access token'], ['webhookSecret', 'Webhook secret']],
  PAYGATE: [['merchantId', 'PayGate ID'], ['secretKey', 'Encryption key']],
  STRIPE: [['publicKey', 'Publishable key'], ['secretKey', 'Secret key'], ['webhookSecret', 'Webhook signing secret']],
  PAYPAL: [['clientId', 'Client ID'], ['secretKey', 'Client secret'], ['webhookSecret', 'Webhook ID / secret']],
  NETCASH: [['accountId', 'Service key / account ID'], ['secretKey', 'Secret key']],
  IKHOKHA: [['merchantId', 'Merchant ID'], ['apiKey', 'API key'], ['secretKey', 'API secret']],
  SNAPSCAN: [['merchantId', 'Merchant ID'], ['apiKey', 'API key']], ZAPPER: [['merchantId', 'Merchant ID'], ['apiKey', 'API key']],
  PAYFLEX: [['merchantId', 'Merchant ID'], ['apiKey', 'API key'], ['secretKey', 'API secret']], MOBICRED: [['merchantId', 'Merchant ID'], ['secretKey', 'Merchant key']],
  PAYJUSTNOW: [['merchantId', 'Merchant ID'], ['apiKey', 'API key']], APPLE_PAY: [['merchantId', 'Merchant ID'], ['secretKey', 'Merchant certificate / key reference']],
  GOOGLE_PAY: [['merchantId', 'Merchant ID'], ['publicKey', 'Gateway public key']], DEBIT_ORDER: [['accountId', 'Collection account ID'], ['apiKey', 'API key'], ['secretKey', 'API secret']],
  MOBILE_MONEY: [['merchantId', 'Merchant ID'], ['apiKey', 'API key'], ['secretKey', 'API secret']],
}
let paymentConnections = {}

const makeId = () => crypto.randomUUID()
const node = (type, label, x, y) => ({ id: makeId(), type, label, x, y, config: type === 'PAYMENT' ? { provider: 'PAYFAST', amountMode: 'DYNAMIC_AMOUNT', amount: 0, currency: 'ZAR', paymentLink: '', instructions: '' } : {} })
const edge = (source, target, label = '') => ({ id: makeId(), source, target, label })

function bookingPreset() {
  const start = node('START', 'Customer sends a message', 420, 35)
  const service = node('SERVICE_CHOICE', 'Choose a service', 420, 190)
  const decision = node('DECISION', 'Is the requested service available?', 420, 355)
  const booking = node('BOOKING', 'Choose an available date and time', 150, 535)
  const handover = node('HANDOVER', 'Notify the team to assist', 690, 535)
  const payment = node('PAYMENT', 'Send a secure payment link', 420, 715)
  const confirm = node('MESSAGE', 'Confirm the booking and payment', 420, 890)
  return { name: 'Booking and payment', nodes: [start, service, decision, booking, handover, payment, confirm], edges: [edge(start.id, service.id), edge(service.id, decision.id), edge(decision.id, booking.id, 'Yes'), edge(decision.id, handover.id, 'No'), edge(booking.id, payment.id), edge(handover.id, payment.id, 'Continue'), edge(payment.id, confirm.id)] }
}

function leadPreset() {
  const start = node('START', 'New WhatsApp enquiry', 420, 35)
  const need = node('QUESTION', 'What does the customer need?', 420, 190)
  const qualified = node('DECISION', 'Is this a qualified lead?', 420, 355)
  const details = node('QUESTION', 'Collect name and contact details', 150, 535)
  const answer = node('MESSAGE', 'Share a helpful response', 690, 535)
  const handover = node('HANDOVER', 'Send the conversation to the team', 420, 715)
  return { name: 'Lead qualification', nodes: [start, need, qualified, details, answer, handover], edges: [edge(start.id, need.id), edge(need.id, qualified.id), edge(qualified.id, details.id, 'Yes'), edge(qualified.id, answer.id, 'No'), edge(details.id, handover.id), edge(answer.id, handover.id)] }
}

function supportPreset() {
  const start = node('START', 'Customer asks for help', 420, 35)
  const question = node('QUESTION', 'Ask what the customer needs', 420, 190)
  const known = node('DECISION', 'Can the assistant answer confidently?', 420, 355)
  const reply = node('MESSAGE', 'Send the approved answer', 150, 535)
  const handover = node('HANDOVER', 'Transfer to a team member', 690, 535)
  const close = node('MESSAGE', 'Confirm the enquiry is resolved', 420, 715)
  return { name: 'Customer support', nodes: [start, question, known, reply, handover, close], edges: [edge(start.id, question.id), edge(question.id, known.id), edge(known.id, reply.id, 'Yes'), edge(known.id, handover.id, 'No'), edge(reply.id, close.id), edge(handover.id, close.id)] }
}

const flowPresets = { booking: bookingPreset, lead: leadPreset, support: supportPreset }
let activeFlow = { id: 'new', ...bookingPreset() }
let selectedNodeId = null
let connectingFromId = null
let dragState = null
let paletteDragState = null
let edgeDragState = null
let reconnectEdgeState = null
const flowEscape = value => { const element = document.createElement('span'); element.textContent = value || ''; return element.innerHTML }

function createFlowBuilder() {
  const nav = document.querySelector('#workspace-nav')
  if (!nav || document.querySelector('[data-view="flows"]')) return
  const link = document.createElement('a')
  link.href = '#flows'; link.dataset.view = 'flows'; link.innerHTML = '<i>⑂</i>Flow Builder'
  nav.querySelector('[data-view="connection"]')?.insertAdjacentElement('beforebegin', link)

  const section = document.createElement('section')
  section.className = 'workspace-view flow-view'; section.dataset.view = 'flows'; section.hidden = true
  section.innerHTML = `<div class="page-intro"><p class="eyebrow"><span></span> CUSTOMER JOURNEY</p><h2>Build a real conversation flow.</h2><p>Create branches, merge paths and decide exactly what happens after every customer answer.</p></div>
    <section class="flow-builder">
      <div class="flow-presets"><p>Start with a working flow</p><div><button data-preset="booking" type="button"><b>Booking &amp; payment</b><small>Includes a decision and merged paths</small></button><button data-preset="lead" type="button"><b>Lead qualification</b><small>Qualify, respond or hand over</small></button><button data-preset="support" type="button"><b>Customer support</b><small>Answer or escalate safely</small></button></div></div>
      <div class="flow-toolbar"><label>Flow name<input id="flow-name" maxlength="100" value="Booking and payment"></label><div class="flow-toolbar-actions"><button id="fit-flow" type="button">Fit diagram</button><button class="button button-primary" id="save-flow" type="button">Save flow →</button></div></div>
      <div class="flow-workspace">
        <aside class="flow-palette"><h3>Flow blocks</h3><p>Drag any block onto the canvas, or click to add it.</p><div>${Object.entries(flowTypes).map(([type, info]) => `<button data-add-flow="${type}" type="button"><span>${info[1]}</span><b>${info[0]}</b><small>${info[2]}</small></button>`).join('')}</div><div class="flow-help"><b>Connect blocks</b><p>Press <strong>Connect</strong> on a block, then select its destination. A block can connect to several paths and several paths can join one block.</p></div></aside>
        <div class="flow-stage-shell"><div class="flow-canvas-head"><div><span>LIVE DIAGRAM</span><h3 id="flow-title">Booking and payment</h3></div><small id="flow-mode">Drag blocks or connect a path</small></div><div class="flow-stage-scroll"><div id="flow-stage" class="flow-stage"><svg id="flow-edges" aria-hidden="true"><defs><marker id="arrowhead" markerWidth="10" markerHeight="10" refX="8" refY="3" orient="auto"><path d="M0,0 L0,6 L9,3 z"></path></marker></defs><g id="flow-edge-lines"></g></svg><div id="flow-nodes"></div></div></div></div>
      </div>
      <div id="flow-inspector" class="flow-inspector" hidden></div>
      <p id="flow-status" class="form-success" role="status"></p>
    </section>`
  document.querySelector('.dashboard-main')?.append(section)
  section.querySelectorAll('[data-preset]').forEach(button => button.addEventListener('click', () => usePreset(button.dataset.preset)))
  section.querySelectorAll('[data-add-flow]').forEach(button => button.addEventListener('click', () => { if (button.dataset.suppressClick === 'true') return; addFlowNode(button.dataset.addFlow) }))
  section.querySelectorAll('[data-add-flow]').forEach(button => button.addEventListener('pointerdown', startPalettePointerDrag))
  const stage = section.querySelector('#flow-stage')
  section.querySelector('#flow-name').addEventListener('input', event => { activeFlow.name = event.target.value; section.querySelector('#flow-title').textContent = event.target.value || 'Untitled flow' })
  section.querySelector('#save-flow').addEventListener('click', saveFlow)
  section.querySelector('#fit-flow').addEventListener('click', fitDiagram)
  window.addEventListener('hashchange', syncFlowView)
  window.addEventListener('resize', renderEdges)
  syncFlowView(); loadFlow()
}

function syncFlowView() {
  const flowView = document.querySelector('[data-view="flows"].flow-view')
  if (!flowView) return
  const active = location.hash === '#flows'
  flowView.hidden = !active
  if (active) {
    document.querySelectorAll('.workspace-view:not(.flow-view)').forEach(view => { view.hidden = true })
    document.querySelectorAll('#workspace-nav a').forEach(link => link.classList.toggle('active', link.dataset.view === 'flows'))
    window.scrollTo({ top: 0, behavior: 'smooth' })
    requestAnimationFrame(renderEdges)
  }
}

function usePreset(key) {
  const preset = flowPresets[key]?.(); if (!preset) return
  activeFlow = { id: activeFlow.id || 'new', ...preset }
  selectedNodeId = null; connectingFromId = null
  document.querySelector('#flow-name').value = preset.name
  document.querySelector('#flow-title').textContent = preset.name
  renderFlow()
}

function addFlowNode(type, dropX, dropY) {
  const info = flowTypes[type] || flowTypes.MESSAGE
  if (type === 'START' && activeFlow.nodes.some(item => item.type === 'START')) {
    selectedNodeId = activeFlow.nodes.find(item => item.type === 'START').id
    document.querySelector('#flow-status').textContent = 'This flow already has a Start block.'
    renderFlow(); showInspector(selectedNodeId); return
  }
  const count = activeFlow.nodes.length
  const newNode = node(type, info[2], Number.isFinite(dropX) ? Math.max(12, Math.min(1030, dropX)) : 80 + (count % 3) * 270, Number.isFinite(dropY) ? Math.max(12, Math.min(1320, dropY)) : 110 + Math.floor(count / 3) * 175)
  activeFlow.nodes.push(newNode); selectedNodeId = newNode.id
  renderFlow(); showInspector(newNode.id)
}

function migrateFlow(flow) {
  const nodes = (flow.nodes || []).map((item, index) => ({ ...item, config: item.type === 'PAYMENT' ? { provider: 'PAYFAST', amountMode: 'DYNAMIC_AMOUNT', amount: 0, currency: 'ZAR', paymentLink: '', instructions: '', ...(item.config || {}) } : (item.config || {}), x: Number.isFinite(Number(item.x)) ? Number(item.x) : 420, y: Number.isFinite(Number(item.y)) ? Number(item.y) : 190 + index * 165 }))
  const hadSavedEdges = Array.isArray(flow.edges)
  const edges = hadSavedEdges ? [...flow.edges] : nodes.slice(0, -1).map((item, index) => edge(item.id, nodes[index + 1].id))
  if (nodes.length && !nodes.some(item => item.type === 'START')) {
    const first = nodes[0], start = node('START', 'Customer starts the conversation', first.x, 35)
    nodes.unshift(start); edges.unshift(edge(start.id, first.id))
  }
  return { ...flow, nodes, edges }
}

function renderFlow() {
  const target = document.querySelector('#flow-nodes'); if (!target) return
  target.innerHTML = activeFlow.nodes.map(item => {
    const info = flowTypes[item.type] || flowTypes.MESSAGE
    const selected = item.id === selectedNodeId ? ' selected' : ''
    const connecting = item.id === connectingFromId ? ' connecting' : ''
    const paymentCaption = item.type === 'PAYMENT' ? `<em>${flowEscape(paymentProviders[item.config?.provider] || 'Choose payment method')} · ${flowEscape(paymentAmountModes[item.config?.amountMode] || 'Dynamic amount')}</em>` : ''
    return `<article class="graph-node type-${item.type.toLowerCase()}${selected}${connecting}" data-node-id="${item.id}" style="left:${item.x}px;top:${item.y}px"><button class="node-port node-port-in" data-input-port="${item.id}" type="button" aria-label="Incoming connection point"></button><button class="node-port node-port-out" data-output-port="${item.id}" type="button" aria-label="Drag to create a connection"></button><button class="node-drag" data-drag-node="${item.id}" type="button" aria-label="Drag ${flowEscape(info[0])}"><span>${flowEscape(info[1])}</span></button><div class="graph-node-copy"><small>${flowEscape(info[0])}</small><b>${flowEscape(item.label)}</b>${paymentCaption}</div><div class="graph-node-actions"><button data-connect-node="${item.id}" type="button">Add path</button><button data-edit-node="${item.id}" type="button" aria-label="Edit block">✎</button></div></article>`
  }).join('')
  target.querySelectorAll('[data-node-id]').forEach(element => element.addEventListener('click', event => handleNodeClick(event, element.dataset.nodeId)))
  target.querySelectorAll('[data-node-id]').forEach(element => element.addEventListener('pointerdown', event => startDrag(event, element.dataset.nodeId)))
  target.querySelectorAll('[data-output-port]').forEach(port => port.addEventListener('pointerdown', startNewEdgeDrag))
  target.querySelectorAll('[data-connect-node]').forEach(button => button.addEventListener('click', event => { event.stopPropagation(); beginConnection(button.dataset.connectNode) }))
  target.querySelectorAll('[data-edit-node]').forEach(button => button.addEventListener('click', event => { event.stopPropagation(); selectedNodeId = button.dataset.editNode; showInspector(selectedNodeId); renderFlow() }))
  requestAnimationFrame(renderEdges)
}

function handleNodeClick(event, id) {
  if (event.target.closest('button')) return
  if (reconnectEdgeState) { finishContextReconnect(id); return }
  if (connectingFromId && connectingFromId !== id) { finishConnection(id); return }
  selectedNodeId = id; showInspector(id); renderFlow()
}

function beginConnection(id) {
  connectingFromId = connectingFromId === id ? null : id
  document.querySelector('#flow-mode').textContent = connectingFromId ? 'Now select the destination block' : 'Drag blocks or connect a path'
  renderFlow()
}

function finishConnection(targetId) {
  const source = activeFlow.nodes.find(item => item.id === connectingFromId)
  const exists = activeFlow.edges.some(item => item.source === connectingFromId && item.target === targetId)
  if (!exists) {
    const outgoing = activeFlow.edges.filter(item => item.source === connectingFromId)
    const label = source?.type === 'DECISION' ? (outgoing.length === 0 ? 'Yes' : outgoing.length === 1 ? 'No' : `Path ${outgoing.length + 1}`) : ''
    activeFlow.edges.push(edge(connectingFromId, targetId, label))
  }
  connectingFromId = null
  document.querySelector('#flow-mode').textContent = 'Path connected. Multiple paths may join the same block.'
  renderFlow()
}

function showInspector(id) {
  const item = activeFlow.nodes.find(nodeItem => nodeItem.id === id), inspector = document.querySelector('#flow-inspector')
  if (!item || !inspector) { if (inspector) inspector.hidden = true; return }
  const incoming = activeFlow.edges.filter(edgeItem => edgeItem.target === id)
  const outgoing = activeFlow.edges.filter(edgeItem => edgeItem.source === id)
  const config = item.config || (item.config = {})
  const paymentSettings = item.type === 'PAYMENT' ? `<section class="payment-settings"><div class="payment-settings-head"><div><small>PAYMENT CONFIGURATION</small><h3>How should this customer pay?</h3></div><span>Flow settings</span></div><div class="payment-grid"><label>Provider or method<select data-payment-config="provider">${Object.entries(paymentProviders).map(([value, label]) => `<option value="${value}" ${config.provider === value ? 'selected' : ''}>${flowEscape(label)}</option>`).join('')}</select></label><label>Amount type<select data-payment-config="amountMode">${Object.entries(paymentAmountModes).map(([value, label]) => `<option value="${value}" ${config.amountMode === value ? 'selected' : ''}>${flowEscape(label)}</option>`).join('')}</select></label><label>Currency<select data-payment-config="currency"><option value="ZAR" ${config.currency === 'ZAR' ? 'selected' : ''}>ZAR · South African rand</option><option value="USD" ${config.currency === 'USD' ? 'selected' : ''}>USD · US dollar</option><option value="EUR" ${config.currency === 'EUR' ? 'selected' : ''}>EUR · Euro</option><option value="GBP" ${config.currency === 'GBP' ? 'selected' : ''}>GBP · Pound sterling</option></select></label><label>Fixed amount (optional)<input data-payment-config="amount" type="number" min="0" step="0.01" value="${Number(config.amount) || ''}" placeholder="0.00"></label><label class="wide">Payment link (optional)<input data-payment-config="paymentLink" type="url" maxlength="500" value="${flowEscape(config.paymentLink || '')}" placeholder="https://secure-payment-page.example"></label><label class="wide">Instructions for the customer<textarea data-payment-config="instructions" maxlength="500" placeholder="For EFT, add the reference they should use. Do not place API keys here.">${flowEscape(config.instructions || '')}</textarea></label></div>${renderPaymentConnectionForm(config.provider)}<p>Credentials are encrypted separately and are never saved in the diagram, returned to the browser, or included in logs.</p></section>` : ''
  inspector.hidden = false
  inspector.innerHTML = `<div><span class="inspector-icon">${flowEscape(flowTypes[item.type]?.[1] || '✦')}</span><div><small>EDIT BLOCK</small><h3>${flowEscape(flowTypes[item.type]?.[0] || 'Step')}</h3></div></div><label>Instruction<input id="inspector-label" maxlength="280" value="${flowEscape(item.label)}"></label><div class="inspector-paths"><b>Connections</b>${outgoing.length ? outgoing.map(path => { const destination = activeFlow.nodes.find(candidate => candidate.id === path.target); return `<div><input data-edge-label="${path.id}" maxlength="40" value="${flowEscape(path.label)}" placeholder="Path label"><span>→ ${flowEscape(destination?.label || 'Block')}</span><button data-delete-edge="${path.id}" type="button">Remove</button></div>` }).join('') : '<p>No outgoing path yet. Use Connect on the block.</p>'}<small>${incoming.length} incoming · ${outgoing.length} outgoing</small></div><button class="delete-node" id="delete-selected-node" type="button">Delete this block</button>${paymentSettings}`
  inspector.querySelector('#inspector-label').addEventListener('change', event => { item.label = event.target.value; renderFlow(); showInspector(id) })
  inspector.querySelectorAll('[data-edge-label]').forEach(input => input.addEventListener('input', () => { const path = activeFlow.edges.find(edgeItem => edgeItem.id === input.dataset.edgeLabel); if (path) path.label = input.value; renderEdges() }))
  inspector.querySelectorAll('[data-payment-config]').forEach(field => field.addEventListener('change', () => { const key = field.dataset.paymentConfig; item.config[key] = key === 'amount' ? Number(field.value) || 0 : field.value; renderFlow(); showInspector(id) }))
  inspector.querySelector('#save-payment-connection')?.addEventListener('click', () => savePaymentConnection(item.config.provider, id))
  inspector.querySelector('#remove-payment-connection')?.addEventListener('click', () => removePaymentConnection(item.config.provider, id))
  inspector.querySelectorAll('[data-delete-edge]').forEach(button => button.addEventListener('click', () => { activeFlow.edges = activeFlow.edges.filter(path => path.id !== button.dataset.deleteEdge); renderFlow(); showInspector(id) }))
  inspector.querySelector('#delete-selected-node').addEventListener('click', () => { if (item.type === 'START' && activeFlow.nodes.filter(candidate => candidate.type === 'START').length === 1) { alert('Every flow needs a Start block.'); return } activeFlow.nodes = activeFlow.nodes.filter(candidate => candidate.id !== id); activeFlow.edges = activeFlow.edges.filter(path => path.source !== id && path.target !== id); selectedNodeId = null; inspector.hidden = true; renderFlow() })
}

function renderPaymentConnectionForm(provider) {
  const fields = gatewayCredentialFields[provider]
  if (!fields) return `<div class="offline-payment-note"><b>No gateway credentials required here.</b><span>Add customer instructions above for ${flowEscape(paymentProviders[provider] || 'this payment method')}.</span></div>`
  const connection = paymentConnections[provider]
  return `<div class="gateway-connection"><div class="gateway-title"><div><b>Secure ${flowEscape(paymentProviders[provider])} connection</b><span>${connection ? `${flowEscape(connection.status.replaceAll('_', ' '))} · ${flowEscape(connection.environment)}` : 'Not configured'}</span></div><label>Environment<select id="gateway-environment"><option value="TEST" ${connection?.environment !== 'LIVE' ? 'selected' : ''}>Test / sandbox</option><option value="LIVE" ${connection?.environment === 'LIVE' ? 'selected' : ''}>Live</option></select></label></div><div class="gateway-fields">${fields.map(([key, label]) => `<label>${flowEscape(label)}<input data-gateway-credential="${key}" type="password" autocomplete="new-password" placeholder="${flowEscape(connection?.credentialHints?.[key] || 'Enter securely')}"></label>`).join('')}</div><div class="gateway-actions"><button class="button button-primary" id="save-payment-connection" type="button">Encrypt &amp; save connection</button>${connection ? '<button id="remove-payment-connection" type="button">Remove connection</button>' : ''}</div><p id="gateway-status" role="status"></p></div>`
}

async function loadPaymentConnections() {
  try {
    const response = await fetch('/api/workspace/payment-connections'); if (!response.ok) return
    const data = await response.json(); paymentConnections = Object.fromEntries((data.connections || []).map(connection => [connection.provider, connection]))
  } catch {}
}

async function savePaymentConnection(provider, nodeId) {
  const status = document.querySelector('#gateway-status'), button = document.querySelector('#save-payment-connection')
  const credentials = Object.fromEntries([...document.querySelectorAll('[data-gateway-credential]')].map(field => [field.dataset.gatewayCredential, field.value.trim()]).filter(([, value]) => value))
  if (!Object.keys(credentials).length) { status.textContent = 'Enter at least one merchant or API credential.'; status.className = 'form-error'; return }
  button.disabled = true; button.textContent = 'Encrypting…'; status.textContent = ''
  const response = await fetch(`/api/workspace/payment-connections/${encodeURIComponent(provider)}`, { method: 'PUT', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ environment: document.querySelector('#gateway-environment').value, credentials }) })
  const data = await response.json().catch(() => ({})); button.disabled = false
  if (!response.ok) { status.textContent = data.error || 'Could not save this connection.'; status.className = 'form-error'; button.textContent = 'Encrypt & save connection'; return }
  paymentConnections[provider] = data.connection; showInspector(nodeId)
}

async function removePaymentConnection(provider, nodeId) {
  if (!confirm(`Remove the saved ${paymentProviders[provider]} credentials?`)) return
  const response = await fetch(`/api/workspace/payment-connections/${encodeURIComponent(provider)}`, { method: 'DELETE' })
  if (response.ok) { delete paymentConnections[provider]; showInspector(nodeId) }
}

function startDrag(event, explicitId) {
  if (reconnectEdgeState || event.button !== 0 || event.target.closest('.graph-node-actions,.node-port')) return
  event.preventDefault(); event.stopPropagation()
  const id = explicitId || event.currentTarget.dataset.dragNode, item = activeFlow.nodes.find(candidate => candidate.id === id), stage = document.querySelector('#flow-stage')
  if (!item || !stage) return
  selectedNodeId = id
  dragState = { id, startX: event.clientX, startY: event.clientY, nodeX: item.x, nodeY: item.y, moved: false }
  window.addEventListener('pointermove', dragNode, { passive: false })
  window.addEventListener('pointerup', stopDrag, { once: true })
}

function dragNode(event) {
  if (!dragState) return
  event.preventDefault()
  const item = activeFlow.nodes.find(candidate => candidate.id === dragState.id); if (!item) return
  dragState.moved = dragState.moved || Math.abs(event.clientX - dragState.startX) > 3 || Math.abs(event.clientY - dragState.startY) > 3
  item.x = Math.max(12, Math.min(1030, dragState.nodeX + event.clientX - dragState.startX))
  item.y = Math.max(12, Math.min(1320, dragState.nodeY + event.clientY - dragState.startY))
  const element = document.querySelector(`[data-node-id="${item.id}"]`)
  if (element) { element.style.left = `${item.x}px`; element.style.top = `${item.y}px` }
  renderEdges()
}

function stopDrag() {
  window.removeEventListener('pointermove', dragNode)
  const id = dragState?.id
  dragState = null
  if (id) showInspector(id)
}

function startPalettePointerDrag(event) {
  if (event.button !== 0) return
  const button = event.currentTarget
  paletteDragState = { button, type: button.dataset.addFlow, startX: event.clientX, startY: event.clientY, moved: false, ghost: null }
  window.addEventListener('pointermove', movePalettePointerDrag, { passive: false })
  window.addEventListener('pointerup', finishPalettePointerDrag, { once: true })
}

function movePalettePointerDrag(event) {
  if (!paletteDragState) return
  const distance = Math.hypot(event.clientX - paletteDragState.startX, event.clientY - paletteDragState.startY)
  if (distance < 6 && !paletteDragState.moved) return
  event.preventDefault(); paletteDragState.moved = true
  if (!paletteDragState.ghost) {
    const info = flowTypes[paletteDragState.type]
    const ghost = document.createElement('div'); ghost.className = 'flow-drag-ghost'; ghost.innerHTML = `<span>${flowEscape(info[1])}</span><b>${flowEscape(info[0])}</b>`
    document.body.append(ghost); paletteDragState.ghost = ghost; paletteDragState.button.classList.add('dragging')
  }
  paletteDragState.ghost.style.left = `${event.clientX + 12}px`; paletteDragState.ghost.style.top = `${event.clientY + 12}px`
  document.querySelector('#flow-stage')?.classList.toggle('drop-ready', pointInsideStage(event.clientX, event.clientY))
}

function pointInsideStage(clientX, clientY) {
  const stage = document.querySelector('#flow-stage'); if (!stage) return false
  const bounds = stage.getBoundingClientRect()
  return clientX >= bounds.left && clientX <= bounds.right && clientY >= bounds.top && clientY <= bounds.bottom
}

function finishPalettePointerDrag(event) {
  window.removeEventListener('pointermove', movePalettePointerDrag)
  const state = paletteDragState; paletteDragState = null
  document.querySelector('#flow-stage')?.classList.remove('drop-ready')
  if (!state) return
  state.ghost?.remove(); state.button.classList.remove('dragging')
  if (!state.moved) return
  state.button.dataset.suppressClick = 'true'; setTimeout(() => delete state.button.dataset.suppressClick, 0)
  if (!pointInsideStage(event.clientX, event.clientY)) return
  const bounds = document.querySelector('#flow-stage').getBoundingClientRect()
  addFlowNode(state.type, event.clientX - bounds.left - 120, event.clientY - bounds.top - 44)
}

function renderEdges() {
  const stage = document.querySelector('#flow-stage'), svg = document.querySelector('#flow-edges'), group = document.querySelector('#flow-edge-lines')
  if (!stage || !svg || !group) return
  svg.setAttribute('viewBox', `0 0 ${stage.clientWidth} ${stage.clientHeight}`)
  group.innerHTML = activeFlow.edges.map(path => {
    const source = document.querySelector(`[data-node-id="${path.source}"]`), target = document.querySelector(`[data-node-id="${path.target}"]`)
    if (!source || !target) return ''
    const x1 = source.offsetLeft + source.offsetWidth / 2, y1 = source.offsetTop + source.offsetHeight
    const x2 = target.offsetLeft + target.offsetWidth / 2, y2 = target.offsetTop
    const middleY = y1 + (y2 - y1) / 2
    const points = `${x1},${y1} ${x1},${middleY} ${x2},${middleY} ${x2},${y2}`
    const labelX = (x1 + x2) / 2, labelY = middleY - 7
    return `<polyline data-edge-id="${path.id}" points="${points}" marker-end="url(#arrowhead)"></polyline><circle class="edge-handle edge-handle-source" data-edge-endpoint="source" data-edge-id="${path.id}" cx="${x1}" cy="${y1}" r="7"></circle><circle class="edge-handle edge-handle-target" data-edge-endpoint="target" data-edge-id="${path.id}" cx="${x2}" cy="${y2}" r="7"></circle>${path.label ? `<g class="edge-label"><rect x="${labelX - 25}" y="${labelY - 12}" width="50" height="22" rx="11"></rect><text x="${labelX}" y="${labelY + 3}" text-anchor="middle">${flowEscape(path.label)}</text></g>` : ''}`
  }).join('')
  group.querySelectorAll('polyline[data-edge-id]').forEach(line => {
    line.addEventListener('pointerdown', startEdgeDrag)
    line.addEventListener('contextmenu', showEdgeContextMenu)
  })
  group.querySelectorAll('[data-edge-endpoint]').forEach(handle => handle.addEventListener('pointerdown', startEdgeEndpointDrag))
}

function startEdgeDrag(event) {
  if (event.button !== 0) return
  startExistingEdgeDrag(event, event.currentTarget.dataset.edgeId, 'target')
}

function startNewEdgeDrag(event) {
  if (event.button !== 0) return
  event.preventDefault(); event.stopPropagation()
  const sourceId = event.currentTarget.dataset.outputPort
  const source = document.querySelector(`[data-node-id="${sourceId}"]`)
  if (!source) return
  edgeDragState = { mode: 'new', source: sourceId, fixedX: source.offsetLeft + source.offsetWidth / 2, fixedY: source.offsetTop + source.offsetHeight }
  beginEdgePointerTracking(event, 'Drag the arrow to an input port or block')
}

function startEdgeEndpointDrag(event) {
  if (event.button !== 0) return
  startExistingEdgeDrag(event, event.currentTarget.dataset.edgeId, event.currentTarget.dataset.edgeEndpoint)
}

function startExistingEdgeDrag(event, id, endpoint) {
  event.preventDefault(); event.stopPropagation()
  const path = activeFlow.edges.find(item => item.id === id)
  if (!path) return
  const fixedNodeId = endpoint === 'source' ? path.target : path.source
  const fixedNode = document.querySelector(`[data-node-id="${fixedNodeId}"]`)
  if (!fixedNode) return
  edgeDragState = {
    mode: 'endpoint', id, endpoint,
    fixedX: fixedNode.offsetLeft + fixedNode.offsetWidth / 2,
    fixedY: endpoint === 'source' ? fixedNode.offsetTop : fixedNode.offsetTop + fixedNode.offsetHeight,
  }
  beginEdgePointerTracking(event, `Pull the ${endpoint} endpoint onto the correct block`)
}

function beginEdgePointerTracking(event, message) {
  closeEdgeContextMenu()
  document.querySelector('#flow-mode').textContent = message
  drawEdgePreview(event)
  window.addEventListener('pointermove', drawEdgePreview, { passive: false })
  window.addEventListener('pointerup', finishEdgeDrag, { once: true })
}

function stagePoint(event) {
  const bounds = document.querySelector('#flow-stage').getBoundingClientRect()
  return { x: event.clientX - bounds.left, y: event.clientY - bounds.top }
}

function drawEdgePreview(event) {
  if (!edgeDragState) return
  event.preventDefault()
  const group = document.querySelector('#flow-edge-lines'), point = stagePoint(event)
  let preview = document.querySelector('#edge-drag-preview')
  if (!preview) {
    preview = document.createElementNS('http://www.w3.org/2000/svg', 'line')
    preview.id = 'edge-drag-preview'; preview.classList.add('edge-preview'); preview.setAttribute('marker-end', 'url(#arrowhead)'); group.append(preview)
  }
  const movingSource = edgeDragState.mode === 'endpoint' && edgeDragState.endpoint === 'source'
  preview.setAttribute('x1', movingSource ? point.x : edgeDragState.fixedX)
  preview.setAttribute('y1', movingSource ? point.y : edgeDragState.fixedY)
  preview.setAttribute('x2', movingSource ? edgeDragState.fixedX : point.x)
  preview.setAttribute('y2', movingSource ? edgeDragState.fixedY : point.y)
}

function finishEdgeDrag(event) {
  const state = edgeDragState; edgeDragState = null
  window.removeEventListener('pointermove', drawEdgePreview)
  document.querySelector('#edge-drag-preview')?.remove()
  if (!state) return
  const destination = document.elementFromPoint(event.clientX, event.clientY)?.closest('[data-node-id]')
  const nodeId = destination?.dataset.nodeId
  let changed = false
  if (state.mode === 'new' && nodeId && nodeId !== state.source && !activeFlow.edges.some(item => item.source === state.source && item.target === nodeId)) {
    const source = activeFlow.nodes.find(item => item.id === state.source), outgoing = activeFlow.edges.filter(item => item.source === state.source)
    const label = source?.type === 'DECISION' ? (outgoing.length === 0 ? 'Yes' : outgoing.length === 1 ? 'No' : `Path ${outgoing.length + 1}`) : ''
    activeFlow.edges.push(edge(state.source, nodeId, label)); changed = true
  } else if (state.mode === 'endpoint' && nodeId) {
    const path = activeFlow.edges.find(item => item.id === state.id)
    if (path && state.endpoint === 'target' && nodeId !== path.source) { path.target = nodeId; changed = true }
    if (path && state.endpoint === 'source' && nodeId !== path.target) { path.source = nodeId; changed = true }
  }
  document.querySelector('#flow-mode').textContent = changed ? 'Connection updated' : 'Connection unchanged'
  renderFlow()
}

function showEdgeContextMenu(event) {
  event.preventDefault(); event.stopPropagation(); closeEdgeContextMenu()
  const path = activeFlow.edges.find(item => item.id === event.currentTarget.dataset.edgeId)
  if (!path) return
  const source = activeFlow.nodes.find(item => item.id === path.source), target = activeFlow.nodes.find(item => item.id === path.target)
  const menu = document.createElement('div'); menu.className = 'edge-context-menu'
  menu.style.left = `${Math.min(event.clientX, window.innerWidth - 270)}px`; menu.style.top = `${Math.min(event.clientY, window.innerHeight - 260)}px`
  menu.innerHTML = `<small>CONNECTION</small><b>${flowEscape(source?.label || 'Block')} → ${flowEscape(target?.label || 'Block')}</b><label>Line label<input data-edge-menu-label maxlength="40" value="${flowEscape(path.label)}" placeholder="Optional label"></label><button data-edge-reconnect="source" type="button">Reconnect source</button><button data-edge-reconnect="target" type="button">Reconnect destination</button><button class="danger" data-edge-menu-delete type="button">Delete connection</button><p>Tip: drag either round endpoint on the line.</p>`
  document.body.append(menu)
  menu.querySelector('[data-edge-menu-label]').addEventListener('input', inputEvent => { path.label = inputEvent.target.value; renderEdges() })
  menu.querySelectorAll('[data-edge-reconnect]').forEach(button => button.addEventListener('click', () => { reconnectEdgeState = { id: path.id, endpoint: button.dataset.edgeReconnect }; closeEdgeContextMenu(); document.querySelector('#flow-mode').textContent = `Select the new ${button.dataset.edgeReconnect} block` }))
  menu.querySelector('[data-edge-menu-delete]').addEventListener('click', () => { activeFlow.edges = activeFlow.edges.filter(item => item.id !== path.id); closeEdgeContextMenu(); renderFlow(); document.querySelector('#flow-mode').textContent = 'Connection deleted' })
  setTimeout(() => window.addEventListener('pointerdown', dismissEdgeContextMenu), 0)
}

function finishContextReconnect(nodeId) {
  const state = reconnectEdgeState; reconnectEdgeState = null
  const path = activeFlow.edges.find(item => item.id === state?.id)
  if (!path) return
  if (state.endpoint === 'source' && nodeId !== path.target) path.source = nodeId
  if (state.endpoint === 'target' && nodeId !== path.source) path.target = nodeId
  document.querySelector('#flow-mode').textContent = 'Connection updated'
  renderFlow()
}

function dismissEdgeContextMenu(event) { if (!event.target.closest('.edge-context-menu')) closeEdgeContextMenu() }
function closeEdgeContextMenu() { document.querySelector('.edge-context-menu')?.remove(); window.removeEventListener('pointerdown', dismissEdgeContextMenu) }

function fitDiagram() {
  const scroll = document.querySelector('.flow-stage-scroll'); if (!scroll) return
  scroll.scrollTo({ top: 0, left: Math.max(0, (scroll.scrollWidth - scroll.clientWidth) / 2), behavior: 'smooth' })
}

async function loadFlow() {
  await loadPaymentConnections()
  try { const response = await fetch('/api/workspace/flows'); if (!response.ok) return; const data = await response.json(); if (data.flows?.length) { activeFlow = migrateFlow(data.flows[0]); document.querySelector('#flow-name').value = activeFlow.name; document.querySelector('#flow-title').textContent = activeFlow.name; renderFlow() } else usePreset('booking') } catch { usePreset('booking') }
}

async function saveFlow() {
  const status = document.querySelector('#flow-status'), button = document.querySelector('#save-flow')
  status.className = 'form-success'; status.textContent = ''
  activeFlow.name = document.querySelector('#flow-name').value.trim()
  if (!activeFlow.name || !activeFlow.nodes.length) { status.className = 'form-error'; status.textContent = 'Add a flow name and at least one block.'; return }
  if (!activeFlow.nodes.some(item => item.type === 'START')) { status.className = 'form-error'; status.textContent = 'Add a Start block before saving.'; return }
  button.disabled = true; button.textContent = 'Saving…'
  const response = await fetch(`/api/workspace/flows/${encodeURIComponent(activeFlow.id || 'new')}`, { method: 'PUT', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(activeFlow) })
  const data = await response.json().catch(() => ({})); button.disabled = false; button.textContent = 'Save flow →'
  if (!response.ok) { status.className = 'form-error'; status.textContent = data.error || 'Could not save this flow.'; return }
  activeFlow = migrateFlow(data.flow); status.textContent = `Flow saved with ${activeFlow.nodes.length} blocks and ${activeFlow.edges.length} paths.`; renderFlow()
}

createFlowBuilder()
