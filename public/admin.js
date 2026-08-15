function escapeHtml(value){const node=document.createElement('span');node.textContent=value||'';return node.innerHTML}

async function reviewDocument(button){
  const label=button.textContent
  button.disabled=true;button.textContent='Updating…'
  const response=await fetch(`/api/admin/verification-documents/${button.dataset.review}`,{method:'PATCH',headers:{'Content-Type':'application/json'},body:JSON.stringify({status:button.dataset.value})})
  if(!response.ok){button.disabled=false;button.textContent=label;alert('Could not update review status.');return}
  await loadAdmin()
}

async function loadAdmin(){
  const response=await fetch('/api/admin/verification-documents')
  if(response.status===401){location.replace('/login');return}
  if(response.status===403){document.querySelector('#admin-status').textContent='This account is not a platform administrator.';return}
  const data=await response.json(),items=data.documents||[],summary=data.summary||{}
  document.querySelector('#admin-status').textContent=`${items.length} private verification document${items.length===1?'':'s'} available for review.`
  let summaryNode=document.querySelector('#admin-summary')
  if(!summaryNode){summaryNode=document.createElement('div');summaryNode.id='admin-summary';summaryNode.className='admin-summary';document.querySelector('#admin-documents').insertAdjacentElement('beforebegin',summaryNode)}
  summaryNode.innerHTML=`<article><b>${summary.businesses||0}</b><span>Businesses</span></article><article><b>${summary.ready||0}</b><span>Approved for onboarding</span></article><article><b>${summary.replacementRequired||0}</b><span>Need replacement</span></article><article><b>${summary.submittedExternally||0}</b><span>Submitted to Meta</span></article>`
  document.querySelector('#admin-documents').innerHTML=items.length?items.map(item=>{
    const tenantStatus=item.tenantVerificationStatus
    const displayStatus=tenantStatus==='APPROVED_FOR_META_ONBOARDING'?'APPROVED_FOR_ONBOARDING':tenantStatus==='SUBMITTED_TO_META'?'SUBMITTED_TO_META':item.status
    const approved=tenantStatus==='APPROVED_FOR_META_ONBOARDING'
    const submitted=tenantStatus==='SUBMITTED_TO_META'
    return `<article><div class="document-info"><div class="document-heading"><p class="tenant">${escapeHtml(item.tenantName||'Workspace')}</p><span class="status-pill status-${escapeHtml(displayStatus.toLowerCase())}">${escapeHtml(displayStatus.replaceAll('_',' '))}</span></div><h2>${escapeHtml(item.filename)}</h2><p>${escapeHtml(item.type.replaceAll('_',' '))} · ${escapeHtml(item.purpose)}</p><small>${new Date(item.uploadedAt).toLocaleString()}</small></div><div class="review-actions"><a href="/api/admin/verification-documents/${item.id}/download">↓ Download securely</a><div class="review-buttons"><button class="approve" data-review="${item.id}" data-value="READY_FOR_VERIFICATION" type="button" ${approved||submitted?'disabled':''}>${approved?'✓ Approved':submitted?'✓ Reviewed':'✓ Approve'}</button><button class="meta" data-review="${item.id}" data-value="SUBMITTED_EXTERNALLY" type="button" ${submitted?'disabled':''}>${submitted?'✓ Submitted to Meta':'Send to Meta →'}</button><button class="replace" data-review="${item.id}" data-value="REPLACEMENT_REQUIRED" type="button">Request replacement</button><button class="reject" data-review="${item.id}" data-value="REJECTED" type="button">Reject</button></div></div></article>`
  }).join(''):'<div class="empty">No uploaded documents yet.</div>'
  document.querySelectorAll('[data-review]').forEach(button=>button.addEventListener('click',()=>reviewDocument(button)))
}

document.querySelector('#admin-logout').addEventListener('click',async()=>{await fetch('/api/auth/logout',{method:'POST'});location.assign('/')})
loadAdmin()
