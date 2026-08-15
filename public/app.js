const demoButton = document.querySelector('#play-demo')
const heroDemoButton = document.querySelector('#hero-demo')
const heroVideoCard = document.querySelector('#hero-video-card')
const form = document.querySelector('#interest-form')
const note = document.querySelector('#form-note')
const videoModal = document.querySelector('#video-modal')
const videoClose = document.querySelector('#video-close')
const productVideo = document.querySelector('#product-video')

function openVideo() { videoModal?.classList.add('is-open'); productVideo?.play().catch(() => {}) }
function closeVideo() { videoModal?.classList.remove('is-open'); productVideo?.pause() }
async function renderSessionNavigation() { try { const response = await fetch('/api/auth/me'); if (!response.ok) return; const data = await response.json(); const target = document.querySelector('#header-actions'); if (!target) return; const destination = data.user?.platformAdmin ? '/admin' : '/app'; target.innerHTML = `<a class="signed-name" href="${destination}">${data.user?.name || 'Workspace'}</a><a class="button button-outline header-cta" href="${destination}">Open dashboard →</a><button class="nav-signout" type="button">Sign out</button>`; target.querySelector('.nav-signout').addEventListener('click', async () => { await fetch('/api/auth/logout', { method:'POST' }); location.reload() }) } catch {} }
demoButton?.addEventListener('click', openVideo)
heroDemoButton?.addEventListener('click', openVideo)
heroVideoCard?.addEventListener('click', openVideo)
videoClose?.addEventListener('click', closeVideo)
videoModal?.addEventListener('click', event => { if (event.target === videoModal) closeVideo() })
form?.addEventListener('submit', event => { event.preventDefault(); const email = new FormData(form).get('email'); note.textContent = `Thanks — we will use ${email} when workspace signup opens.`; form.reset() })
renderSessionNavigation()
