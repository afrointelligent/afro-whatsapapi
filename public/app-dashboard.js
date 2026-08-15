let workspace = null
let inbox = []
let activeConversationId = null
let verification = null
const nav = document.querySelector('#workspace-nav')
const views = [...document.querySelectorAll('.workspace-view')]
const knownViews = new Set(['overview', 'setup', 'inbox', 'connection', 'flows'])

function showView() {
  const requested = location.hash.slice(1) || 'overview'
  const view = knownViews.has(requested) ? requested : 'empty'
  views.forEach(section => { section.hidden = section.dataset.view !== view })
  nav.querySelectorAll('a').forEach(link => link.classList.toggle('active', link.dataset.view === view))
  if (view === 'inbox') loadInbox()
  window.scrollTo({ top: 0, behavior: 'smooth' })
}

function updateChecklist() {
  const setup = workspace?.workspaceSetup
  document.querySelector('#profile-check').classList.toggle('complete', Boolean(setup?.businessDescription))
  document.querySelector('#services-check').classList.toggle('complete', Boolean(setup?.services?.length))
  document.querySelector('#hours-check').classList.toggle('complete', Boolean(setup?.hours))
  document.querySelector('#business-description').value = setup?.businessDescription || ''
  document.querySelector('#business-services').value = (setup?.services || []).join('\n')
  document.querySelector('#business-hours').value = setup?.hours || ''
}

function titleCase(value) { return String(value).replace(/([a-z])([A-Z])/g, '$1 $2').replaceAll('_', ' ').toLowerCase().replace(/\b\w/g, letter => letter.toUpperCase()) }
function renderReadiness(target, readiness) { target.innerHTML = Object.entries(readiness).map(([label, value]) => `<div><b>${titleCase(label)}</b><span class="${String(value).includes('COMPLETE') || String(value).includes('READY') || String(value).includes('APPROVED') || String(value).includes('SUBMITTED') || String(value).includes('CONNECTED') ? 'ready' : ''}">${titleCase(value === true ? 'Complete' : value === false ? 'Incomplete' : value)}</span></div>`).join('') }
function renderDocuments() { const target = document.querySelector('#verification-documents'); target.innerHTML = verification.documents?.length ? verification.documents.map(document => `<article><div><b>${escapeHtml(titleCase(document.type))}</b><span>${escapeHtml(document.filename)} · ${escapeHtml(titleCase(document.status))}</span></div><div><a href="/api/workspace/verification/documents/${document.id}/download">Download</a><button data-delete-document="${document.id}" type="button">Delete</button></div></article>`).join('') : '<p class="muted">No documents uploaded. Upload only what Meta requests or what you want prepared for onboarding.</p>'; target.querySelectorAll('[data-delete-document]').forEach(button => button.addEventListener('click', async () => { if (!confirm('Delete this private verification document?')) return; await fetch(`/api/workspace/verification/documents/${button.dataset.deleteDocument}`, { method: 'DELETE' }); await loadVerification() })) }
const verificationSteps = [
  { title: 'Business identity', helper: 'Tell Meta how your business is officially represented.', fields: ['legalBusinessName', 'displayName', 'tradingName', 'industry', 'country'] },
  { title: 'Contact details', helper: 'Use details that customers and Meta can verify.', fields: ['businessEmail', 'businessPhone', 'website', 'registeredAddress'] },
  { title: 'Business description', helper: 'Explain what your business does in plain language.', fields: ['businessDescription'] },
  { title: 'Meta details', helper: 'These are optional until Meta provides them during connection.', fields: ['metaBusinessPortfolioId', 'whatsappBusinessAccountId', 'whatsappPhoneNumberId', 'companyRegistrationNumber'] },
]
let verificationStep = 0
const setupSteps = [
  { title: 'What does your business do?', helper: 'Use a few words to describe what customers can come to you for.', field: 'business-description' },
  { title: 'What services can customers choose?', helper: 'Add one service per line or separate them with commas.', field: 'business-services' },
  { title: 'When are you open?', helper: 'Tell your assistant when customers can expect a response.', field: 'business-hours' },
]
let setupStep = 0
function renderSetupStep() { const current = setupSteps[setupStep]; document.querySelectorAll('#business-setup-form label').forEach(label => { label.hidden = label.querySelector(`#${current.field}`) === null }); document.querySelector('#setup-step-count').textContent = `STEP ${setupStep + 1} OF ${setupSteps.length}`; document.querySelector('#setup-question').textContent = current.title; document.querySelector('#setup-helper').textContent = current.helper; document.querySelector('#setup-progress').style.width = `${((setupStep + 1) / setupSteps.length) * 100}%`; document.querySelector('#setup-back').hidden = setupStep === 0; document.querySelector('#setup-next').textContent = setupStep === setupSteps.length - 1 ? 'Save business setup →' : 'Continue →'; const field = document.querySelector(`#${current.field}`); field.focus() }
function renderVerificationStep() { const form = document.querySelector('#verification-profile-form'); const current = verificationSteps[verificationStep]; form.querySelectorAll('.verification-grid label').forEach(label => { const field = label.querySelector('[name]'); label.hidden = !current.fields.includes(field.name) }); document.querySelector('#verification-step-count').textContent = `STEP ${verificationStep + 1} OF ${verificationSteps.length}`; document.querySelector('#verification-question').textContent = current.title; document.querySelector('#verification-helper').textContent = current.helper; document.querySelector('#verification-progress').style.width = `${((verificationStep + 1) / verificationSteps.length) * 100}%`; document.querySelector('#verification-back').hidden = verificationStep === 0; document.querySelector('#verification-next').textContent = verificationStep === verificationSteps.length - 1 ? 'Save verification information →' : 'Continue →' }
function validVerificationStep() { const current = verificationSteps[verificationStep]; for (const name of current.fields) { const field = document.querySelector(`#verification-profile-form [name="${name}"]`); if (field.required && !field.value.trim()) { field.focus(); return false } if (field.type === 'email' && field.value && !field.checkValidity()) { field.focus(); return false } } return true }
async function loadVerification() { const response = await fetch('/api/workspace/verification'); if (!response.ok) return; verification = await response.json(); const form = document.querySelector('#verification-profile-form'); for (const [key, value] of Object.entries(verification.profile || {})) { const field = form.elements.namedItem(key); if (field && typeof value === 'string') field.value = value }; renderReadiness(document.querySelector('#readiness-list'), verification.readiness); renderReadiness(document.querySelector('#connection-checklist'), verification.readiness); const connectionText = document.querySelector('#connection-readiness'), reviewStatus = verification.profile?.verificationSubmissionStatus, metaConnected = verification.readiness.metaBusinessConnection === 'CONNECTED', whatsappConnected = verification.readiness.whatsappNumber === 'CONNECTED'; connectionText.className = reviewStatus === 'APPROVED_FOR_META_ONBOARDING' || reviewStatus === 'SUBMITTED_TO_META' ? 'connection-approved' : ''; connectionText.textContent = metaConnected && whatsappConnected ? 'Your Meta Business and WhatsApp connection is active.' : reviewStatus === 'SUBMITTED_TO_META' ? 'Documents submitted to Meta. Messaging is still not connected; it becomes active only after Meta Business and the WhatsApp number are successfully connected.' : reviewStatus === 'APPROVED_FOR_META_ONBOARDING' ? 'Document review is complete. Next, connect Meta Business and validate an eligible WhatsApp number. Not Started and Pending will remain until that real connection succeeds.' : reviewStatus === 'MORE_INFORMATION_REQUIRED' ? 'Action needed: review and replace the document requested by Afro Intelligent.' : 'Complete your details and submit your documents for Afro Intelligent review.'; updateConnectionPill(reviewStatus, metaConnected && whatsappConnected); renderDocuments() }

function updateConnectionPill(reviewStatus, connected) {
  const pill = document.querySelector('.connection-pill')
  if (!pill) return
  pill.classList.toggle('connected', connected)
  pill.classList.toggle('docs-approved', !connected && (reviewStatus === 'APPROVED_FOR_META_ONBOARDING' || reviewStatus === 'SUBMITTED_TO_META'))
  pill.textContent = connected ? '● WHATSAPP CONNECTED' : reviewStatus === 'SUBMITTED_TO_META' ? '✓ WITH META · WHATSAPP NOT CONNECTED' : reviewStatus === 'APPROVED_FOR_META_ONBOARDING' ? '✓ DOCUMENTS APPROVED · WHATSAPP NOT CONNECTED' : '● MESSAGING NOT CONNECTED'
}

async function refreshVisibleReviewStatus() {
  try {
    const response = await fetch('/api/workspace/verification'); if (!response.ok) return
    const data = await response.json(), status = data.profile?.verificationSubmissionStatus
    let banner = document.querySelector('#verification-review-banner')
    if (!banner) { banner = document.createElement('section'); banner.id = 'verification-review-banner'; document.querySelector('.dashboard-main>header')?.insertAdjacentElement('afterend', banner) }
    banner.className = 'review-status-banner'
    if (status === 'APPROVED_FOR_META_ONBOARDING') { banner.innerHTML = '<div><b>✓ Documents approved for Meta onboarding</b><p>Afro Intelligent has completed its review. Your verification pack is ready for the next Meta step.</p></div><a href="#connection">View status →</a>'; banner.hidden = false }
    else if (status === 'SUBMITTED_TO_META') { banner.innerHTML = '<div><b>✓ Submitted to Meta</b><p>Meta is reviewing your verification information. We will update you when the status changes.</p></div><a href="#connection">View status →</a>'; banner.hidden = false }
    else if (status === 'MORE_INFORMATION_REQUIRED') { banner.classList.add('needs-info'); banner.innerHTML = '<div><b>More information required</b><p>Please open Business Setup and review the requested document replacement.</p></div><a href="#setup">Review documents →</a>'; banner.hidden = false }
    else banner.hidden = true
    if (verification && status !== verification.profile?.verificationSubmissionStatus) await loadVerification()
  } catch {}
}

function renderConversationList() {
  const list = document.querySelector('#conversation-list')
  list.innerHTML = inbox.length ? inbox.map(item => `<button class="conversation-item ${item.id === activeConversationId ? 'active' : ''}" data-id="${item.id}"><b>${escapeHtml(item.customerName || item.customerPhone)}</b><span>${escapeHtml(item.lastMessage || 'No messages yet')}</span><small>${item.unreadCount ? `${item.unreadCount} unread` : formatTime(item.lastMessageAt)}</small></button>`).join('') : '<div class="inbox-empty"><h3>No conversations yet</h3><p>A verified inbound WhatsApp message will appear here.</p></div>'
  list.querySelectorAll('[data-id]').forEach(button => button.addEventListener('click', () => openConversation(button.dataset.id)))
}

function escapeHtml(value) { const node = document.createElement('span'); node.textContent = value || ''; return node.innerHTML }
function formatTime(value) { return value ? new Date(value).toLocaleString() : '' }

async function loadInbox() {
  const status = document.querySelector('#inbox-status')
  try {
    const response = await fetch('/api/workspace/inbox')
    if (!response.ok) throw new Error('Inbox is unavailable.')
    const data = await response.json(); inbox = data.conversations || []
    status.textContent = data.connection?.connected ? 'Connected to WhatsApp. New messages update automatically.' : 'WhatsApp is not connected yet. Your inbox will be ready when a verified connection is active.'
    renderConversationList()
  } catch (error) { status.textContent = error.message || 'Inbox is unavailable.' }
}

async function openConversation(id) {
  const response = await fetch(`/api/workspace/inbox/${id}`)
  const data = await response.json()
  if (!response.ok) { document.querySelector('#reply-error').textContent = data.error || 'Could not open this conversation.'; return }
  activeConversationId = id; renderConversationList()
  document.querySelector('#conversation-empty').hidden = true; document.querySelector('#conversation-detail').hidden = false
  document.querySelector('#conversation-name').textContent = data.conversation.customerName || data.conversation.customerPhone
  document.querySelector('#conversation-phone').textContent = data.conversation.customerPhone
  const control = document.querySelector('#automation-toggle')
  control.textContent = data.conversation.automationMode === 'HUMAN_ACTIVE' ? 'Resume AI' : 'Take over'
  control.dataset.mode = data.conversation.automationMode === 'HUMAN_ACTIVE' ? 'AI_ACTIVE' : 'HUMAN_ACTIVE'
  document.querySelector('#message-list').innerHTML = data.messages.map(message => `<article class="message ${message.direction === 'outbound' ? 'outbound' : 'inbound'}"><p>${escapeHtml(message.content)}</p><small>${formatTime(message.timestamp)}</small></article>`).join('') || '<p class="muted">No saved messages.</p>'
  document.querySelector('#message-list').scrollTop = document.querySelector('#message-list').scrollHeight
}

async function loadWorkspace(){
  const response = await fetch('/api/auth/me')
  if(response.status === 401){ location.replace('/login'); return }
  const data = await response.json()
  if(!response.ok){ document.querySelector('#welcome').textContent = data.error || 'Workspace unavailable'; return }
  workspace = data.tenant; document.querySelector('#welcome').textContent = `Welcome, ${data.tenant?.name || data.user.name}.`
  updateChecklist(); await loadVerification(); renderVerificationStep(); renderSetupStep(); showView()
}

document.querySelector('#logout').addEventListener('click', async () => { await fetch('/api/auth/logout', { method:'POST' }); location.assign('/') })
window.addEventListener('hashchange', showView)
document.querySelector('#setup-back').addEventListener('click', () => { if (setupStep) { setupStep--; document.querySelector('#setup-error').textContent = ''; renderSetupStep() } })
document.querySelector('#business-setup-form').addEventListener('submit', async event => { event.preventDefault(); const error = document.querySelector('#setup-error'), success = document.querySelector('#setup-success'), current = document.querySelector(`#${setupSteps[setupStep].field}`); error.textContent = ''; success.textContent = ''; if (!current.value.trim()) { error.textContent = 'Complete this answer to continue.'; current.focus(); return } if (setupStep < setupSteps.length - 1) { setupStep++; renderSetupStep(); return } const services = document.querySelector('#business-services').value.split(/[\n,]/).map(value => value.trim()).filter(Boolean); const response = await fetch('/api/workspace/setup', { method:'PUT', headers:{ 'Content-Type':'application/json' }, body:JSON.stringify({ businessDescription:document.querySelector('#business-description').value, services, hours:document.querySelector('#business-hours').value }) }); const data = await response.json(); if(!response.ok){ error.textContent = data.error || 'We could not save your business setup.'; return } workspace.workspaceSetup = { businessDescription:document.querySelector('#business-description').value, services, hours:document.querySelector('#business-hours').value }; updateChecklist(); success.textContent = 'Business setup saved. Your workspace is ready for the next step.' })
document.querySelector('#verification-back').addEventListener('click', () => { if (verificationStep) { verificationStep--; document.querySelector('#verification-profile-error').textContent = ''; renderVerificationStep() } })
document.querySelector('#verification-profile-form').addEventListener('submit', async event => { event.preventDefault(); const form = event.currentTarget, error = document.querySelector('#verification-profile-error'), success = document.querySelector('#verification-profile-success'); error.textContent = ''; success.textContent = ''; if (!validVerificationStep()) { error.textContent = 'Complete the required answer to continue.'; return } if (verificationStep < verificationSteps.length - 1) { verificationStep++; renderVerificationStep(); return } const body = Object.fromEntries(new FormData(form).entries()); const response = await fetch('/api/workspace/verification/profile', { method: 'PUT', headers: { 'Content-Type':'application/json' }, body: JSON.stringify(body) }); const data = await response.json(); if (!response.ok) { error.textContent = data.error || 'Could not save verification information.'; return }; success.textContent = 'Verification information saved.'; await loadVerification() })
document.querySelector('#document-upload-form').addEventListener('submit', async event => { event.preventDefault(); const error = document.querySelector('#document-error'), success = document.querySelector('#document-success'); error.textContent = ''; success.textContent = ''; const form = event.currentTarget; const response = await fetch('/api/workspace/verification/documents', { method: 'POST', body: new FormData(form) }); let data; try { data = await response.json() } catch { data = {} } if (!response.ok) { error.textContent = data.error || 'Could not upload this document.'; return }; form.reset(); success.textContent = `${data.documents?.length || 1} document${data.documents?.length === 1 ? '' : 's'} uploaded securely.`; await loadVerification() })
document.querySelector('#automation-toggle').addEventListener('click', async event => { if (!activeConversationId) return; const button = event.currentTarget; const response = await fetch(`/api/workspace/inbox/${activeConversationId}/automation`, { method:'PATCH', headers:{ 'Content-Type':'application/json' }, body:JSON.stringify({ mode:button.dataset.mode }) }); const data = await response.json(); if (!response.ok) { document.querySelector('#reply-error').textContent = data.error || 'Could not change AI mode.'; return }; openConversation(activeConversationId) })
document.querySelector('#reply-form').addEventListener('submit', async event => { event.preventDefault(); if (!activeConversationId) return; const input = document.querySelector('#reply-content'), error = document.querySelector('#reply-error'); error.textContent = ''; const response = await fetch(`/api/workspace/inbox/${activeConversationId}/reply`, { method:'POST', headers:{ 'Content-Type':'application/json' }, body:JSON.stringify({ content:input.value }) }); const data = await response.json(); if (!response.ok) { error.textContent = data.error || 'WhatsApp could not send this reply.'; return }; input.value = ''; await openConversation(activeConversationId); await loadInbox() })
setInterval(() => { if ((location.hash || '#overview') === '#inbox') loadInbox() }, 4000)
setInterval(refreshVisibleReviewStatus, 5000)
loadWorkspace()
refreshVisibleReviewStatus()
