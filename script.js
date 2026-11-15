const menuButton=document.querySelector('.menu-toggle');
const nav=document.querySelector('.main-nav');
menuButton?.addEventListener('click',()=>{const open=nav.classList.toggle('open');menuButton.setAttribute('aria-expanded',String(open));});
const serversTrigger=document.querySelector('#servers-trigger');
const serversDropdown=document.querySelector('#servers-dropdown');
serversTrigger?.addEventListener('click',()=>{
  const open=serversDropdown.classList.toggle('hidden')===false;
  serversTrigger.setAttribute('aria-expanded',String(open));
});
document.addEventListener('click',event=>{
  if(!event.target.closest('.servers-menu')){
    serversDropdown?.classList.add('hidden');
    serversTrigger?.setAttribute('aria-expanded','false');
  }
  const serverLink=event.target.closest('[data-server-target]');
  if(serverLink){
    if(!document.querySelector('[data-page-panel="home"]')?.classList.contains('active'))showPage('home');
    setTimeout(()=>document.getElementById(serverLink.dataset.serverTarget)?.scrollIntoView({behavior:'smooth',block:'center'}),40);
    serversDropdown?.classList.add('hidden');
    serversTrigger?.setAttribute('aria-expanded','false');
  }
});

function showPage(name){
  document.querySelectorAll('[data-page-panel]').forEach(p=>p.classList.toggle('active',p.dataset.pagePanel===name));
  document.querySelectorAll('.main-nav [data-page]:not(.mobile-servers-link)').forEach(a=>a.classList.toggle('active',a.dataset.page===name));
  nav?.classList.remove('open');menuButton?.setAttribute('aria-expanded','false');
  if(location.hash!==`#${name}`) history.replaceState(null,'',`#${name}`);
  window.scrollTo({top:0,behavior:'smooth'});
}
document.querySelectorAll('[data-page]').forEach(el=>el.addEventListener('click',e=>{
  e.preventDefault();showPage(el.dataset.page);
  if(el.dataset.scrollServers)setTimeout(()=>document.querySelector('#servers')?.scrollIntoView({behavior:'smooth'}),40);
}));
const initial=(location.hash||'#home').slice(1);
showPage(document.querySelector(`[data-page-panel="${initial}"]`)?initial:'home');

async function loadPublicServers(){
  const grid=document.querySelector('#server-grid');
  if(!grid)return;
  try{
    const response=await fetch('/api/servers',{cache:'no-store'});
    if(!response.ok)throw new Error('Server status unavailable');
    const servers=await response.json();
    const menuList=document.querySelector('#servers-dropdown-list');
    if(menuList){
      if(servers.length){
        menuList.replaceChildren();
        servers.forEach(server=>{
          const option=document.createElement('button');option.type='button';option.setAttribute('role','menuitem');
          option.dataset.serverTarget=`public-server-${server.id}`;
          option.append(document.createTextNode(server.name));
          const details=document.createElement('small');
          details.textContent=`${server.region||'Server'} · ${server.online?'Online':'Offline'} · Players ${server.playerCount??'--'} · Queue ${server.queue??'--'}`;
          option.append(details);menuList.append(option);
        });
      }else menuList.innerHTML='<span class="servers-dropdown-empty">No servers configured yet.</span>';
    }
    if(!servers.length){
      grid.innerHTML='<div class="server-empty">Server population will appear here once a server is configured.</div>';
      document.querySelector('#total-online').textContent='—';
      return;
    }
    let total=0, known=false;
    grid.replaceChildren();
    servers.forEach(server=>{
      if(Number.isFinite(server.playerCount)){total+=server.playerCount;known=true;}
      const card=document.createElement('article');card.className='server-card';card.id=`public-server-${server.id}`;
      const region=document.createElement('div');region.className='server-region';region.textContent=server.region||'—';
      const main=document.createElement('div');main.className='server-main';
      const titleRow=document.createElement('div');titleRow.className='server-title-row';
      const title=document.createElement('h3');title.textContent=server.name;
      const status=document.createElement('span');status.className=`status ${server.online?'online':'offline'}`;
      const dot=document.createElement('i');dot.setAttribute('aria-hidden','true');
      status.append(dot,document.createTextNode(server.online?' Online':' Offline'));
      titleRow.append(title,status);
      const location=document.createElement('div');location.className='server-location';location.textContent=server.region||'Game server';
      const playersRow=document.createElement('div');playersRow.className='players-row';
      const label=document.createElement('span');label.textContent='Players';
      const population=document.createElement('strong');
      const count=document.createElement('b');count.textContent=server.playerCount??'--';
      const max=document.createElement('em');max.textContent=server.maxPlayers==null?'':`/${server.maxPlayers}`;
      population.append(count,max);
      const queue=document.createElement('span');queue.className='queue-count';queue.textContent=`Queue ${server.queue??'--'}`;
      playersRow.append(label,population,queue);
      const progress=document.createElement('div');progress.className='progress';
      const fill=document.createElement('span');
      const percent=server.playerCount!=null&&server.maxPlayers>0?Math.min(100,(server.playerCount/server.maxPlayers)*100):0;
      fill.style.width=`${percent}%`;progress.append(fill);
      main.append(titleRow,location,playersRow,progress);
      card.append(region,main);grid.append(card);
    });
    document.querySelector('#total-online').textContent=known?total.toLocaleString():'—';
  }catch{
    if(!grid.children.length)grid.innerHTML='<div class="server-empty">Live server status could not be loaded.</div>';
    document.querySelector('#total-online').textContent='—';
  }
}
loadPublicServers();
setInterval(loadPublicServers,15000);

document.addEventListener('click',event=>{
  const tab=event.target.closest('[data-store]');
  if(!tab)return;
  document.querySelectorAll('[data-store]').forEach(t=>t.classList.toggle('selected',t===tab));
  document.querySelectorAll('[data-store-panel]').forEach(panel=>panel.classList.toggle('hidden',panel.dataset.storePanel!==tab.dataset.store));
});
document.querySelectorAll('.period-tab').forEach(tab=>tab.addEventListener('click',()=>{
  document.querySelectorAll('.period-tab').forEach(t=>t.classList.toggle('active',t===tab));
}));
const inventoryNames={free:'FREE KITS',booster:'BOOSTER KITS',purchased:'PURCHASED KITS'};
async function loadPurchasedKits(){
  const target=document.querySelector('#inventory-items');
  if(!target)return;
  target.className='empty-state compact';
  target.innerHTML='<p>Loading your purchased kits…</p>';
  try{
    const response=await fetch('/api/inventory',{credentials:'same-origin',cache:'no-store'});
    if(response.status===401)throw new Error('Sign in with Discord to view your purchased kits.');
    const body=await response.json();
    if(!response.ok)throw new Error(body.error||'Could not load your inventory.');
    const kits=Array.isArray(body.purchasedKits)?body.purchasedKits:[];
    if(!kits.length){target.innerHTML='<div class="empty-icon">▱</div><h3>No purchased kits yet</h3><p>Kits granted to your linked account by an admin will appear here.</p>';return;}
    target.className='inventory-kit-list';
    target.replaceChildren();
    kits.slice().reverse().forEach(kit=>{
      const card=document.createElement('article');card.className='inventory-kit-card';
      const title=document.createElement('h3');title.textContent=kit.name||'Store Kit';
      const details=document.createElement('p');details.textContent=`In-game kit: ${kit.gameKit||'—'} · Server: ${kit.serverId||'—'}`;
      const date=document.createElement('small');
      const parsed=kit.grantedAt?new Date(kit.grantedAt):null;
      date.textContent=parsed&&Number.isFinite(parsed.getTime())?`Granted ${parsed.toLocaleString()}`:'Grant date unavailable';
      card.append(title,details,date);target.append(card);
    });
  }catch(error){target.innerHTML='';const message=document.createElement('p');message.textContent=error.message;target.append(message);}
}
document.querySelectorAll('[data-inventory]').forEach(tab=>tab.addEventListener('click',()=>{
  document.querySelectorAll('[data-inventory]').forEach(t=>t.classList.toggle('active',t===tab));
  document.querySelector('#inventory-title').textContent=inventoryNames[tab.dataset.inventory];
  if(tab.dataset.inventory==='purchased')loadPurchasedKits();
  else if(tab.dataset.inventory==='booster'){
    const target=document.querySelector('#inventory-items');
    if(target){target.className='empty-state compact';target.innerHTML='<div class="empty-icon">🚀</div><h3>Booster inventory</h3><p>Your Discord role gives you access to this tab. Booster kit claiming is not connected to the website yet.</p>';}
  }
}));
document.querySelectorAll('.purchase-switch').forEach(group=>group.querySelectorAll('button').forEach(b=>b.addEventListener('click',()=>{
  group.querySelectorAll('button').forEach(x=>x.classList.toggle('chosen',x===b));
})));

let cart=[];
function renderCart(){
  const box=document.querySelector('.cart-items');
  const count=document.querySelector('#cart-count');
  count.textContent=cart.length?`(${cart.length})`:'';
  if(!cart.length){
    box.classList.add('empty-state');
    box.innerHTML='<div class="empty-icon">🛒</div><h3>Your cart is empty</h3><p>Products you add will appear here.</p>';
    return;
  }
  box.classList.remove('empty-state');
  box.replaceChildren();
  const list=document.createElement('div');list.className='cart-list';
  cart.forEach((name,index)=>{
    const line=document.createElement('div');line.className='cart-line';
    const label=document.createElement('span');label.textContent=name;
    const remove=document.createElement('button');remove.dataset.remove=String(index);remove.textContent='REMOVE';remove.setAttribute('aria-label',`Remove ${name}`);
    line.append(label,remove);list.append(line);
  });
  const note=document.createElement('p');note.className='cart-note';note.textContent='Checkout will be enabled when payments are connected.';
  box.append(list,note);
}
function addToCart(name){
  cart.push(name);renderCart();document.querySelector('[data-store="cart"]').click();
}
document.addEventListener('click',event=>{
  const add=event.target.closest('.product-add');
  if(add){addToCart(add.dataset.product||'Store item');return;}
  const remove=event.target.closest('[data-remove]');
  if(remove){cart.splice(Number(remove.dataset.remove),1);renderCart();}
});

async function loadManagedProducts(){
  const root=document.querySelector('#store-categories');
  if(!root)return;
  try{
    const [response, meResponse]=await Promise.all([fetch('/api/products',{cache:'no-store'}),fetch('/api/me',{credentials:'same-origin',cache:'no-store'})]);
    if(!response.ok)return;
    const products=await response.json();
    const me=meResponse.ok?await meResponse.json():{signedIn:false,roles:[]};
    const roles=Array.isArray(me.roles)?me.roles:[];
    const grouped=new Map();
    products.forEach(product=>{const category=String(product.category||'Other').trim()||'Other';if(!grouped.has(category))grouped.set(category,[]);grouped.get(category).push(product);});
    root.replaceChildren();
    const tabs=document.querySelector('#store-tabs');
    tabs.querySelectorAll('[data-generated-store]').forEach(node=>node.remove());
    [...grouped.keys()].forEach((category,index)=>{
      const key=`category-${index}`;
      const tab=document.createElement('button');tab.className='subtab';tab.dataset.store=key;tab.dataset.generatedStore='true';tab.textContent=category.toUpperCase();
      tabs.insertBefore(tab,tabs.querySelector('[data-store="cart"]'));
      const section=document.createElement('section');section.className='store-category hidden';section.dataset.storePanel=key;
      const heading=document.createElement('div');heading.className='category-title';const h2=document.createElement('h2');h2.textContent=category.toUpperCase();heading.append(h2);
      const grid=document.createElement('div');grid.className='product-grid managed-products';
      grouped.get(category).forEach(product=>{
        const card=document.createElement('article');card.className='product-card';
        const title=document.createElement('h3');title.textContent=product.name;
        const description=document.createElement('p');description.textContent=product.description||'Available from the VANDAL store.';
        const billing=document.createElement('p');billing.textContent=product.billingType==='subscription'?'Subscription':'Lifetime / one-time';
        const priceLabel=document.createElement('div');priceLabel.className='price-label';priceLabel.textContent='PRICE';
        const price=document.createElement('strong');price.className='price';price.textContent=(product.monthlyPrice && product.lifetimePrice)?`Subscription: ${product.monthlyPrice} · Lifetime: ${product.lifetimePrice}`:(product.billingType==='subscription'?(product.monthlyPrice||product.price):(product.lifetimePrice||product.price));
        card.append(title,description,billing);
        if(product.contentFile){const contents=document.createElement('button');contents.className='contents-button';contents.type='button';contents.textContent='◉  View Contents';contents.addEventListener('click',()=>window.open(`/api/product-content/${encodeURIComponent(product.id)}`,'_blank','noopener'));card.append(contents);}
        if(product.requiredRoleId){const roleNote=document.createElement('small');roleNote.textContent='Requires a specific Discord role';card.append(roleNote);}
        card.append(priceLabel,price);
        const button=document.createElement('button');button.className='btn product-add';button.dataset.product=product.name;button.textContent='ADD TO CART';
        const hasRole=!product.requiredRoleId || roles.includes(product.requiredRoleId);
        if(!hasRole){button.disabled=true;button.textContent='ROLE REQUIRED';button.title='You need the required Discord role to access this product.';}
        card.append(button);grid.append(card);
      });
      section.append(heading,grid);root.append(section);
    });
    if(!products.length)root.innerHTML='<div class="empty-state compact"><h3>No products available yet</h3><p>Store products configured by staff will appear here.</p></div>';
    const firstTab=tabs.querySelector('[data-generated-store]');
    if(firstTab){document.querySelectorAll('[data-store]').forEach(t=>t.classList.toggle('selected',t===firstTab));document.querySelectorAll('[data-store-panel]').forEach(p=>p.classList.toggle('hidden',p.dataset.storePanel!==firstTab.dataset.store));}
  }catch{root.innerHTML='<div class="empty-state compact"><h3>Store products could not be loaded.</h3></div>';}
}
loadManagedProducts();

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
  const boosterTab=document.querySelector('[data-inventory=booster]');
  if(boosterTab)boosterTab.classList.toggle('hidden',!me?.signedIn || Boolean(me.boosterRoleId && (!Array.isArray(me.roles) || !me.roles.includes(me.boosterRoleId))));
  if(!me||!me.signedIn)return;
  const name=me.displayName||me.user.username;
  accountTrigger.dataset.signedIn='true';
  accountTrigger.removeAttribute('data-modal');
  accountTrigger.innerHTML=`<span class="account-avatar">${me.user.avatar?`<img src="https://cdn.discordapp.com/avatars/${encodeURIComponent(me.user.id)}/${encodeURIComponent(me.user.avatar)}.png?size=64" alt="">`: '♙'}</span><span id="account-trigger-name"></span><span class="account-caret" aria-hidden="true">⌄</span>`;
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
