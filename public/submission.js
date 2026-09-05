const submissionStyle=document.createElement('style')
submissionStyle.textContent=`.submission-panel{display:flex;align-items:center;justify-content:space-between;gap:20px;margin:18px 0;padding:16px;border:1px solid #bce6cd;border-radius:14px;background:#effbf3}.submission-panel b{display:block;color:#076c37;font-size:16px}.submission-panel p{margin:5px 0 0;color:#49685a;line-height:1.45}.submission-badge{border-radius:20px;background:#d4f7df;color:#08783d;padding:8px 10px;font-size:11px;font-weight:900;letter-spacing:.08em;white-space:nowrap}@media(max-width:600px){.submission-panel{align-items:flex-start;flex-direction:column}.submission-panel .button{width:100%;text-align:center}}`
document.head.append(submissionStyle)
async function refreshSubmissionPanel(){
  const card=document.querySelector('.documents-card');if(!card)return
  let panel=document.querySelector('#verification-submission-panel')
  if(!panel){panel=document.createElement('section');panel.id='verification-submission-panel';panel.className='submission-panel';card.querySelector('h3').insertAdjacentElement('afterend',panel)}
  const response=await fetch('/api/workspace/verification');if(!response.ok)return
  const data=await response.json(),documents=data.documents||[],profileComplete=Boolean(data.readiness?.businessProfile)
  panel.innerHTML=profileComplete
    ? `<div><b>Documents are optional.</b><p>${documents.length?`${documents.length} optional document${documents.length===1?' is':'s are'} available for AfroIntelligent's internal review.`:'You can connect WhatsApp Business without uploading documents.'} Meta handles its own authorization and verification requirements.</p></div><a class="button button-primary" href="#connection">Connect WhatsApp Business →</a>`
    : '<div><b>Complete your basic business profile.</b><p>Documents remain optional and are not required for Meta Embedded Signup.</p></div><span class="submission-badge">PROFILE REQUIRED</span>'
}
document.addEventListener('DOMContentLoaded',refreshSubmissionPanel)
window.addEventListener('hashchange',()=>{if(location.hash==='#setup')refreshSubmissionPanel()})
