const menuButton=document.querySelector('.menu-toggle');
const nav=document.querySelector('.main-nav');
menuButton?.addEventListener('click',()=>{const open=nav.classList.toggle('open');menuButton.setAttribute('aria-expanded',String(open));});

function showPage(name){
  document.querySelectorAll('[data-page-panel]').forEach(p=>p.classList.toggle('active',p.dataset.pagePanel===name));
  document.querySelectorAll('.main-nav [data-page]').forEach(a=>a.classList.toggle('active',a.dataset.page===name));
  nav?.classList.remove('open');menuButton?.setAttribute('aria-expanded','false');
  if(location.hash!==`#${name}`) history.replaceState(null,'',`#${name}`);
  window.scrollTo({top:0,behavior:'smooth'});
}
document.querySelectorAll('[data-page]').forEach(el=>el.addEventListener('click',e=>{e.preventDefault();showPage(el.dataset.page);}));
const initial=(location.hash||'#home').slice(1);
showPage(document.querySelector(`[data-page-panel="${initial}"]`)?initial:'home');

const storeTabs=document.querySelectorAll('[data-store]');
storeTabs.forEach(tab=>tab.addEventListener('click',()=>{
  storeTabs.forEach(t=>t.classList.toggle('selected',t===tab));
  document.querySelectorAll('[data-store-panel]').forEach(p=>p.classList.toggle('hidden',p.dataset.storePanel!==tab.dataset.store));
}));
document.querySelectorAll('.period-tab').forEach(tab=>tab.addEventListener('click',()=>{
  document.querySelectorAll('.period-tab').forEach(t=>t.classList.toggle('active',t===tab));
}));
const inventoryNames={free:'FREE KITS',booster:'BOOSTER KITS',purchased:'RANKS & PACKS'};
document.querySelectorAll('[data-inventory]').forEach(tab=>tab.addEventListener('click',()=>{
  document.querySelectorAll('[data-inventory]').forEach(t=>t.classList.toggle('active',t===tab));
  document.querySelector('#inventory-title').textContent=inventoryNames[tab.dataset.inventory];
}));
document.querySelectorAll('.purchase-switch').forEach(group=>group.querySelectorAll('button').forEach(b=>b.addEventListener('click',()=>{
  group.querySelectorAll('button').forEach(x=>x.classList.toggle('chosen',x===b));
})));

let cart=[];
document.querySelectorAll('.product-add').forEach(btn=>btn.addEventListener('click',()=>{
  cart.push(btn.dataset.product);
  document.querySelector('#cart-count').textContent=`(${cart.length})`;
  const box=document.querySelector('.cart-items');
  box.classList.remove('empty-state');
  box.innerHTML=`<div class="cart-list">${cart.map((name,i)=>`<div class="cart-line"><span>${name}</span><button data-remove="${i}" aria-label="Remove ${name}">REMOVE</button></div>`).join('')}</div><p class="cart-note">Checkout will be enabled when payments are connected.</p>`;
  box.querySelectorAll('[data-remove]').forEach(remove=>remove.addEventListener('click',()=>{
    cart.splice(Number(remove.dataset.remove),1);
    document.querySelector('#cart-count').textContent=cart.length?`(${cart.length})`:'';
    if(!cart.length){box.classList.add('empty-state');box.innerHTML='<div class="empty-icon">🛒</div><h3>Your cart is empty</h3><p>Products you add will appear here.</p>';}
    else box.querySelectorAll('[data-remove]').forEach((b)=>b.closest('.cart-line').remove());
  }));
  document.querySelector('[data-store="cart"]').click();
}));

const modal=document.querySelector('#site-modal');
const modalTitle=document.querySelector('#modal-title');
const modalCopy=document.querySelector('#modal-copy');
modal?.addEventListener('click',e=>{if(e.target===modal)modal.close();});

// Account menu and signed-in display name.
const accountTrigger=document.querySelector('#account-trigger');
const accountDropdown=document.querySelector('#account-dropdown');
accountTrigger?.addEventListener('click',e=>{if(accountTrigger.dataset.signedIn==='true'){e.preventDefault();accountDropdown.classList.toggle('hidden');}});
document.addEventListener('click',e=>{if(!e.target.closest('#account-menu'))accountDropdown?.classList.add('hidden');});
document.querySelector('#account-logout')?.addEventListener('click',async()=>{try{await fetch('/auth/logout',{method:'POST',credentials:'same-origin'});}finally{location.href='/';}});
let currentMe=null;
fetch('/api/me',{credentials:'same-origin'}).then(r=>r.ok?r.json():null).then(me=>{
  currentMe=me;
  if(!me||!me.signedIn)return;
  const name=me.displayName||me.user.username;
  accountTrigger.dataset.signedIn='true';
  accountTrigger.removeAttribute('data-modal');
  accountTrigger.innerHTML=`<span class="account-avatar">${me.user.avatar?`<img src="https://cdn.discordapp.com/avatars/${encodeURIComponent(me.user.id)}/${encodeURIComponent(me.user.avatar)}.png?size=64" alt="">`:'♙'}</span><span id="account-trigger-name"></span>⌄`;
  accountTrigger.querySelector('#account-trigger-name').textContent=name;
  document.querySelector('#account-menu-name').textContent=name;
  if(me.isAdmin)document.querySelector('#account-admin-link')?.classList.remove('hidden');
  const loginAction=document.querySelector('#discord-login-action');
  if(loginAction)loginAction.classList.add('hidden');
}).catch(()=>{});

// The home-page link button opens a real gamertag form for signed-in users.
document.querySelectorAll('[data-modal]').forEach(button=>button.addEventListener('click',()=>{
  const kind=button.dataset.modal;
  // Signed-in account controls lose data-modal after /api/me resolves.
  // Ignore this handler when no modal is currently assigned.
  if(!kind)return;
  const form=document.querySelector('#link-account-form');
  const login=document.querySelector('#discord-login-action');
  const note=document.querySelector('#link-account-notice');
  if(kind==='link'){
    modalTitle.textContent='LINK YOUR RUST ACCOUNT';
    modalCopy.textContent=currentMe?.signedIn?'Enter the console gamertag you use in Rust.':'Sign in with Discord first, then you can link your console gamertag.';
    form.classList.toggle('hidden',!currentMe?.signedIn);
    login.classList.toggle('hidden',Boolean(currentMe?.signedIn));
    document.querySelector('#modal-footnote').textContent='Gamertag linking is saved to your Discord account.';
    note.textContent='';
  } else {
    modalTitle.textContent='VANDAL ACCOUNT';
    modalCopy.textContent='Sign in securely with Discord to access your VANDAL profile.';
    form.classList.add('hidden'); login.classList.remove('hidden');
  }
  if(!modal.open)modal.showModal();
}));
document.querySelector('#link-account-form')?.addEventListener('submit',async e=>{
  e.preventDefault(); const input=document.querySelector('#gamertag-input'); const note=document.querySelector('#link-account-notice');
  note.textContent='Linking…';
  try{const response=await fetch('/api/account/link',{method:'POST',headers:{'Content-Type':'application/json'},credentials:'same-origin',body:JSON.stringify({gamertag:input.value})});const data=await response.json();if(!response.ok)throw new Error(data.error||'Could not link account.');note.textContent='Gamertag saved! Your profile will now display '+data.displayName+'.';setTimeout(()=>location.href='/profile',900);}catch(err){note.textContent=err.message;}
});
