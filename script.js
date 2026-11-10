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
document.querySelectorAll('[data-modal]').forEach(button=>button.addEventListener('click',()=>{
  const kind=button.dataset.modal;
  modalTitle.textContent=kind==='link'?'LINK YOUR ACCOUNT':kind==='clan'?'JOIN A CLAN':'SIGN IN TO VANDAL';
  modalCopy.textContent=kind==='link'?'Account linking will be enabled after the game-account and backend integration is configured.':kind==='clan'?'Clan applications will be enabled when the VANDAL clan system is connected.':'Discord sign-in will be enabled after OAuth is configured for your VANDAL application.';
  modal.showModal();
}));
modal?.addEventListener('click',e=>{if(e.target===modal)modal.close();});
