/* =============================================================
   Trifarmas — front-end (Vercel)
   Os dados (usuários, pedidos, pontos, lembretes, catálogo) ficam
   no banco do backend (Render). Este arquivo só cuida da interface
   e conversa com a API através de api.js.
   ============================================================= */

const { GOOGLE_CLIENT_ID } = window.TRIFARMAS_CONFIG;

const LOGO_SRC = 'assets/logo.png';
const WELCOME_MESSAGE = 'Seja bem-vindo(a) ao Trifarmas! Estamos felizes em ajudar você a economizar e cuidar da sua saúde.';
const POINT_VALUE = 0.05; // 1 ponto = R$0,05 de desconto

const NAV_ITEMS = [
  {id:'home', label:'Buscar', icon:'<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><circle cx="11" cy="11" r="7"/><path d="M21 21l-4.3-4.3"/></svg>'},
  {id:'map', label:'Mapa', icon:'<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M9 20l-6-3V4l6 3 6-3 6 3v13l-6-3-6 3z"/><path d="M9 7v13M15 4v13"/></svg>'},
  {id:'orders', label:'Pedidos', icon:'<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M4 8l8-4 8 4v8l-8 4-8-4V8z"/><path d="M4 8l8 4 8-4M12 12v8"/></svg>'},
  {id:'scanner', label:'Scanner', icon:'<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M4 7V5a1 1 0 011-1h2M20 7V5a1 1 0 00-1-1h-2M4 17v2a1 1 0 001 1h2M20 17v2a1 1 0 01-1 1h-2M4 12h16"/></svg>', center:true},
  {id:'calendar', label:'Lembretes', icon:'<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><rect x="3" y="5" width="18" height="16" rx="2"/><path d="M16 3v4M8 3v4M3 10h18"/></svg>'},
  {id:'points', label:'Pontos', icon:'<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M12 2l2.9 6.3 6.9.7-5.2 4.7 1.5 6.8L12 17l-6.1 3.5 1.5-6.8L2.2 9l6.9-.7z"/></svg>'},
  {id:'settings', label:'Perfil', icon:'<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><circle cx="12" cy="8" r="4"/><path d="M4 21c0-4 3.6-7 8-7s8 3 8 7"/></svg>'},
];

const ICON_CHECK = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M20 6L9 17l-5-5"/></svg>';

let state = {
  user:null,
  theme:'light',
  points:0,
  activeTab:'home',
  activeCat:'Todos',
  reminders:[],
  orders:[],
  calMonth: new Date().getMonth(),
  calYear: new Date().getFullYear(),
  calSelectedDay: new Date().getDate(),
  customMeds: [], // remédios digitados pelo usuário que não estão no catálogo
  catalog: { pharmacies: [], medicines: [], rewards: [] },
};

/* ---------------- utilidades ---------------- */

const $ = id => document.getElementById(id);
const formatBRL = value => 'R$ ' + value.toFixed(2).replace('.',',');

function escapeHtml(str){
  return String(str).replace(/[&<>"']/g, c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
}

function applyLogo(){
  document.querySelectorAll('.app-logo-img').forEach(img=> img.src = LOGO_SRC);
}

function showView(name){
  $('view-login').classList.toggle('hidden', name!=='login');
  $('view-signup').classList.toggle('hidden', name!=='signup');
  $('login-error').classList.add('hidden');
}

/* ---------------- catálogo (vem do banco) ---------------- */

async function loadCatalog(){
  try{
    state.catalog = await api.catalog();
    buildChips();
  }catch(e){
    showToast(e.message);
  }
}

const allMeds = () => [...state.catalog.medicines, ...state.customMeds];
const pharmacyById = id => state.catalog.pharmacies.find(p=>p.id===id);
const pharmacyLogo = pharm => `https://logo.clearbit.com/${pharm.domain}?size=80`;

/* ---------------- foto de perfil ---------------- */

function previewAvatar(input, targetId, isSettings){
  if(!input.files || !input.files[0]) return;
  const reader = new FileReader();
  reader.onload = async e => {
    $(targetId).src = e.target.result;
    if(isSettings && state.user){
      // A foto escolhida aqui substitui a do Google e fica salva na conta.
      try{
        const { user } = await api.updateMe({ avatar: e.target.result });
        state.user = { ...state.user, ...user };
        $('sidebar-avatar').src = state.user.avatar;
      }catch(err){
        showToast(err.message);
      }
    }
  };
  reader.readAsDataURL(input.files[0]);
}

/* ---------------- login com Google ---------------- */

function isGoogleConfigured(){
  return !!GOOGLE_CLIENT_ID
    && GOOGLE_CLIENT_ID.endsWith('.apps.googleusercontent.com')
    && !GOOGLE_CLIENT_ID.includes('SEU_CLIENT_ID_AQUI');
}

let googleSignInReady = false;

/* Chamado pelo atributo onload da tag <script> do Google (accounts.google.com/gsi/client) */
function onGsiLoad(){
  initGoogleSignIn();
}

function initGoogleSignIn(){
  if(googleSignInReady) return;

  if(!isGoogleConfigured()){
    $('google-btn-login').classList.add('hidden');
    $('google-btn-signup').classList.add('hidden');
    $('google-warning-login').classList.remove('hidden');
    $('google-warning-signup').classList.remove('hidden');
    return;
  }

  // A biblioteca do Google ainda não carregou; onGsiLoad() chamará de novo quando carregar.
  if(typeof google === 'undefined' || !google.accounts || !google.accounts.id) return;

  google.accounts.id.initialize({
    client_id: GOOGLE_CLIENT_ID,
    callback: handleGoogleCredential,
    auto_select: false,
    cancel_on_tap_outside: true
  });

  $('google-warning-login').classList.add('hidden');
  $('google-warning-signup').classList.add('hidden');
  $('google-btn-login').classList.remove('hidden');
  $('google-btn-signup').classList.remove('hidden');

  const buttonOptions = { type:'standard', theme:'outline', size:'large', shape:'pill', width:320, logo_alignment:'left' };
  google.accounts.id.renderButton($('google-btn-login'), { ...buttonOptions, text:'signin_with' });
  google.accounts.id.renderButton($('google-btn-signup'), { ...buttonOptions, text:'signup_with' });

  googleSignInReady = true;
}

/* O Google devolve um ID Token (JWT) assinado. Ele é enviado ao backend,
   que valida a assinatura e cria/recupera a conta no banco. */
async function handleGoogleCredential(response){
  try{
    const session = await api.googleLogin(response.credential);
    const firstName = session.user.name.split(' ')[0];
    showToast(session.isNewUser
      ? 'Conta Google conectada! Você ganhou 50 pontos de boas-vindas.'
      : `Login com Google realizado! Bem-vindo(a) de volta, ${firstName}.`);
    await enterApp(session);
  }catch(e){
    showToast(e.message);
  }
}

/* "Usar conta demo" — aparece só enquanto o GOOGLE_CLIENT_ID não estiver configurado. */
async function googleAuthDemo(mode){
  try{
    const session = await api.googleDemo(mode);
    showToast(mode==='signup'
      ? 'Conta demo criada! (configure o GOOGLE_CLIENT_ID para login real)'
      : 'Login demo realizado! (configure o GOOGLE_CLIENT_ID para login real)');
    await enterApp(session);
  }catch(e){
    showToast(e.message);
  }
}

/* ---------------- login / cadastro ---------------- */

async function doLogin(){
  const email = $('login-email').value.trim();
  const pass = $('login-pass').value;
  const err = $('login-error');
  if(!email || !pass){
    err.textContent = 'Preencha e-mail e senha para continuar.';
    err.classList.remove('hidden');
    return;
  }
  try{
    await enterApp(await api.login(email, pass));
  }catch(e){
    err.textContent = e.message;
    err.classList.remove('hidden');
  }
}

async function doSignup(){
  const name = $('signup-name').value.trim();
  const email = $('signup-email').value.trim();
  const password = $('signup-pass').value;
  if(!name || !email || !password){ showToast('Preencha todos os campos.'); return; }
  try{
    const session = await api.signup({ name, email, password, avatar: $('signup-avatar-preview').src });
    showToast('Conta criada! Você ganhou 50 pontos de boas-vindas.');
    await enterApp(session);
  }catch(e){
    showToast(e.message);
  }
}

function doLogout(){
  api.setToken(null);
  stopOrderTimers();
  if(reminderCheckInterval){ clearInterval(reminderCheckInterval); reminderCheckInterval=null; }
  state.user = null;
  state.orders = [];
  state.reminders = [];
  state.customMeds = [];
  $('app').classList.add('hidden');
  showView('login');
  $('login-pass').value='';
}

async function enterApp(session){
  api.setToken(session.token);
  state.user = session.user;
  state.points = session.user.points;

  // Carrega do banco os dados desta conta.
  try{
    const [orders, reminders, customMeds] = await Promise.all([api.orders(), api.reminders(), api.customMeds()]);
    state.orders = orders.map(o => ({ ...o, createdAt: new Date(o.createdAt) }));
    state.reminders = reminders;
    state.customMeds = customMeds;
  }catch(e){
    showToast(e.message);
  }

  $('view-login').classList.add('hidden');
  $('view-signup').classList.add('hidden');
  $('app').classList.remove('hidden');

  refreshProfileUI();
  $('settings-pass-section').classList.toggle('hidden', !!state.user.googleAccount);
  $('settings-pass-google-note').classList.toggle('hidden', !state.user.googleAccount);
  updatePointsUI();
  updateOrdersBadge();
  state.orders.forEach(scheduleOrderProgress);
  startReminderEngine();
  switchTab('home');

  // Pop-up de boas-vindas: apenas no primeiro login da conta.
  if(!state.user.welcomeSeen) openWelcomePopup();
}

function refreshProfileUI(){
  const firstName = state.user.name.split(' ')[0];
  $('home-greeting').textContent = `Olá, ${firstName}! Pesquise um remédio e veja as farmácias mais perto de você.`;
  $('settings-avatar').src = state.user.avatar;
  $('settings-name').value = state.user.name;
  $('settings-email').value = state.user.email;
  $('sidebar-avatar').src = state.user.avatar;
  $('sidebar-name').textContent = state.user.name;
}

/* Pop-up de boas-vindas com blur sobre a tela inicial. */
function openWelcomePopup(){
  $('welcome-popup-text').textContent = WELCOME_MESSAGE;
  $('welcome-overlay').classList.remove('hidden');
  state.user.welcomeSeen = true;
  api.markWelcomeSeen().catch(()=>{});
}
function closeWelcomePopup(){
  $('welcome-overlay').classList.add('hidden');
}

/* ---------------- navegação ---------------- */

function buildNav(){
  $('sidebar-nav').innerHTML = NAV_ITEMS.map(it=>`
    <button class="nav-item" data-tab="${it.id}" onclick="switchTab('${it.id}')">${it.icon}<span>${it.label}</span></button>
  `).join('') + `
    <div class="sidebar-foot" onclick="switchTab('settings')" style="cursor:pointer;">
      <img id="sidebar-avatar" src="" alt="">
      <div>
        <p class="name" id="sidebar-name">—</p>
        <p class="role">Ver perfil</p>
      </div>
    </div>
  `;
  $('bottom-nav').innerHTML = NAV_ITEMS.map(it=>{
    if(it.center){
      return `<button class="bn-scan" data-tab="${it.id}" onclick="switchTab('${it.id}')">${it.icon}</button>`;
    }
    return `<button class="bn-item" data-tab="${it.id}" onclick="switchTab('${it.id}')">${it.icon}<span>${it.label}</span></button>`;
  }).join('');
}

function switchTab(id){
  state.activeTab = id;
  document.querySelectorAll('.content-inner > section').forEach(s=>s.classList.add('hidden'));
  $('tab-'+id).classList.remove('hidden');
  document.querySelectorAll('.nav-item').forEach(b=>b.classList.toggle('active', b.dataset.tab===id));
  document.querySelectorAll('.bn-item').forEach(b=>b.classList.toggle('active', b.dataset.tab===id));

  if(id==='map') initMap();
  if(id==='scanner') startScanner();
  else stopScanner();
  if(id==='calendar'){ renderCalendar(); requestNotificationPermission(); }
  if(id==='orders') renderOrders();
  if(id==='points') renderPoints();
  if(id==='home') renderResults();
}

function toggleTheme(){
  state.theme = state.theme==='light' ? 'dark' : 'light';
  document.body.setAttribute('data-theme', state.theme);
  $('settings-theme-switch').classList.toggle('on', state.theme==='dark');
  $('theme-icon').innerHTML = state.theme==='dark'
    ? '<path d="M21 12.8A9 9 0 1111.2 3a7 7 0 009.8 9.8z"/>'
    : '<circle cx="12" cy="12" r="4"/><path d="M12 2v2M12 20v2M4.9 4.9l1.4 1.4M17.7 17.7l1.4 1.4M2 12h2M20 12h2M4.9 19.1l1.4-1.4M17.7 6.3l1.4-1.4"/>';
}

/* ---------------- busca: qualquer remédio, qualquer farmácia ---------------- */

function buildChips(){
  const cats = ['Todos', ...new Set(state.catalog.medicines.map(m=>m.cat))];
  $('chip-row').innerHTML = cats.map(c=>
    `<button class="chip ${c===state.activeCat?'active':''}" data-cat="${c}" onclick="setCat('${c}')">${c}</button>`
  ).join('');
}
function setCat(cat){
  state.activeCat = cat;
  document.querySelectorAll('.chip').forEach(c=>c.classList.toggle('active', c.dataset.cat===cat));
  renderResults();
}

function renderResults(){
  const rawQuery = $('search-input').value.trim();
  const q = rawQuery.toLowerCase();
  let meds = allMeds();
  if(state.activeCat !== 'Todos') meds = meds.filter(m=>m.cat===state.activeCat);
  if(q) meds = meds.filter(m=>m.name.toLowerCase().includes(q));

  let html = '';

  if(meds.length===0){
    html += `<div class="empty-state">
      <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.6"><circle cx="11" cy="11" r="7"/><path d="M21 21l-4.3-4.3"/></svg>
      <p>Nenhum remédio encontrado na nossa base ainda.</p>
    </div>`;
  } else {
    html += meds.map(renderMedCard).join('');
  }

  // Se o usuário digitou algo que não existe na base, permite adicionar e comprar mesmo assim.
  if(q && !meds.some(m=>m.name.toLowerCase()===q)){
    const safe = escapeHtml(rawQuery);
    html += `
    <div class="custom-med-card">
      <p>Não encontrou "<strong>${safe}</strong>" na nossa lista? Você pode adicioná-lo e comprar mesmo assim, independente do preço.</p>
      <button class="btn btn-primary" onclick="addCustomMed()">Adicionar "${safe}" e ver farmácias</button>
    </div>`;
  }

  $('results-wrap').innerHTML = html;
}

function renderMedCard(med){
  const entries = Object.entries(med.prices)
    .map(([pid,price])=>({...pharmacyById(pid), price}))
    .filter(e=>e.id)
    .sort((a,b)=> a.price-b.price || a.dist-b.dist);
  if(entries.length===0) return '';
  const best = entries[0];
  const nearest = [...entries].sort((a,b)=>a.dist-b.dist).slice(0,4);
  const shown = nearest.some(e=>e.id===best.id) ? nearest : [best, ...nearest.slice(0,3)];
  const savings = Math.round((1-best.price/Math.max(...entries.map(e=>e.price)))*100);

  return `
  <div class="result-card">
    <div class="result-top">
      <div class="result-med">
        <h3>${escapeHtml(med.name)}</h3>
        <div class="sub">${escapeHtml(med.cat)} · a partir de <strong>R$ ${best.price.toFixed(2)}</strong></div>
      </div>
      <span class="best-tag">Economize até ${savings}%</span>
    </div>
    <div class="pharm-list">
      ${shown.map(e=>`
        <div class="pharm-row ${e.id===best.id?'top':''}">
          <div class="pharm-info">
            <img class="pharm-dot" src="${pharmacyLogo(e)}" alt="${e.name}" onerror="this.onerror=null;this.replaceWith(Object.assign(document.createElement('div'),{className:'pharm-dot pharm-dot-fallback',textContent:'${e.name.charAt(0)}'}));">
            <div>
              <p class="pharm-name">${e.name} ${e.id===best.id?'<span class="best-pill">Melhor preço</span>':''}</p>
              <p class="pharm-meta">${e.dist.toFixed(1)} km de você</p>
            </div>
          </div>
          <div class="pharm-price">
            <div class="price">R$ ${e.price.toFixed(2)}</div>
            <button class="pharm-buy-btn" onclick="openCheckout('${med.id}','${e.id}')">Comprar aqui</button>
          </div>
        </div>
      `).join('')}
    </div>
  </div>`;
}

async function addCustomMed(){
  const name = $('search-input').value.trim();
  if(!name) return;
  try{
    const med = await api.addCustomMed(name);
    state.customMeds.push(med);
    renderResults();
    showToast(`"${name}" adicionado! Escolha a farmácia que preferir, independente do preço.`);
  }catch(e){
    showToast(e.message);
  }
}

/* ---------------- checkout / pagamento (tela cheia) ---------------- */

function openCheckout(medId, pharmId){
  const med = allMeds().find(m=>m.id===medId);
  const pharm = pharmacyById(pharmId);
  if(!med || !pharm) return;
  const price = med.prices[pharmId];
  const maxPointsUsable = Math.max(0, Math.min(state.points, Math.floor(price / POINT_VALUE)));

  const screen = document.createElement('div');
  screen.className = 'checkout-screen';
  screen.id = 'checkout-screen';
  screen.innerHTML = `
    <header class="checkout-topbar">
      <button class="icon-btn" onclick="closeCheckout()" title="Voltar" aria-label="Voltar">
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M15 18l-6-6 6-6"/></svg>
      </button>
      <h3>Finalizar compra</h3>
      <span class="checkout-topbar-spacer"></span>
    </header>
    <div class="checkout-scroll">
      <div class="checkout-box">
        <div class="checkout-summary">
          <p class="co-med">${escapeHtml(med.name)}</p>
          <p class="co-pharm">${escapeHtml(pharm.name)} · ${pharm.dist.toFixed(1)} km de você</p>
        </div>
        <div class="checkout-line"><span>Valor do produto</span><b>${formatBRL(price)}</b></div>
        <div class="checkout-points">
          <label>Usar pontos para desconto (você tem ${state.points} pts)</label>
          <input type="range" id="co-points-range" min="0" max="${maxPointsUsable}" value="0" ${maxPointsUsable===0?'disabled':''} oninput="updateCheckoutTotal(${price})">
          <div class="checkout-points-val"><span id="co-points-used">0</span> pts usados = <span id="co-discount">R$ 0,00</span> de desconto</div>
        </div>
        <div class="checkout-line total"><span>Total a pagar</span><b id="co-total">${formatBRL(price)}</b></div>
        <div class="field">
          <label>Forma de pagamento</label>
          <select id="co-payment-method">
            <option value="Cartão de crédito">Cartão de crédito</option>
            <option value="Pix">Pix</option>
            <option value="Dinheiro na retirada">Dinheiro na retirada</option>
          </select>
        </div>
        <button class="btn btn-primary" id="co-confirm-btn" onclick="confirmCheckout('${medId}','${pharmId}')">Confirmar pagamento</button>
        <button class="btn-outline-sm checkout-cancel" onclick="closeCheckout()">Cancelar</button>
      </div>
    </div>`;
  document.body.appendChild(screen);
  document.addEventListener('keydown', onCheckoutKeydown);
}

function onCheckoutKeydown(e){
  if(e.key==='Escape') closeCheckout();
}

function closeCheckout(){
  const screen = $('checkout-screen');
  if(screen) screen.remove();
  document.removeEventListener('keydown', onCheckoutKeydown);
}

function updateCheckoutTotal(price){
  const range = $('co-points-range');
  const pointsUsed = range ? +range.value : 0;
  const discount = pointsUsed * POINT_VALUE;
  $('co-points-used').textContent = pointsUsed;
  $('co-discount').textContent = formatBRL(discount);
  $('co-total').textContent = formatBRL(Math.max(0, price - discount));
}

async function confirmCheckout(medId, pharmId){
  const btn = $('co-confirm-btn');
  if(btn.disabled) return;
  btn.disabled = true;

  const range = $('co-points-range');
  const pointsUsed = range ? +range.value : 0;
  const paymentMethod = $('co-payment-method').value;

  try{
    const result = await api.createOrder({ medicineId: medId, pharmacyId: pharmId, pointsUsed, paymentMethod });
    const order = { ...result.order, createdAt: new Date(result.order.createdAt) };
    state.orders.unshift(order);
    state.points = result.points;
    updatePointsUI();
    updateOrdersBadge();
    closeCheckout();
    scheduleOrderProgress(order);

    showModal(
      ICON_CHECK,
      'Pagamento confirmado!',
      `${escapeHtml(order.medName)} reservado na ${escapeHtml(order.pharmName)}. Você pagou <strong>${formatBRL(order.paidAmount)}</strong>${order.pointsUsed>0?` (com ${order.pointsUsed} pts de desconto)`:''} via ${order.paymentMethod}. Acompanhe o status na aba <strong>Pedidos</strong> — os <strong>+${order.points} pontos</strong> de cashback só são creditados quando você confirmar a retirada.`
    );
  }catch(e){
    btn.disabled = false;
    showToast(e.message);
  }
}

/* ---------------- pedidos ---------------- */

// O backend calcula o status pelo horário do pedido; aqui só atualizamos a tela nos mesmos momentos.
const ORDER_STEPS = ['Pedido recebido','Em preparação','Pronto para retirar','Concluído'];
const ORDER_STEP_DELAYS = [['Em preparação', 3500], ['Pronto para retirar', 8000]];
let orderTimers = [];

function scheduleOrderProgress(order){
  if(order.status==='Concluído') return;
  const elapsed = Date.now() - order.createdAt.getTime();
  ORDER_STEP_DELAYS.forEach(([status, delay])=>{
    if(ORDER_STEPS.indexOf(status) <= ORDER_STEPS.indexOf(order.status)) return;
    orderTimers.push(setTimeout(()=> advanceOrder(order.id, status), Math.max(0, delay - elapsed)));
  });
}

function stopOrderTimers(){
  orderTimers.forEach(clearTimeout);
  orderTimers = [];
}

function advanceOrder(orderId, status){
  const order = state.orders.find(o=>o.id===orderId);
  if(!order || order.status==='Concluído') return;
  order.status = status;
  if(state.activeTab==='orders') renderOrders();
  updateOrdersBadge();
  if(status==='Pronto para retirar') showToast(`${order.medName} está pronto para retirar na ${order.pharmName}!`);
}

async function confirmPickup(orderId){
  const order = state.orders.find(o=>o.id===orderId);
  if(!order || order.status !== 'Pronto para retirar') return;
  try{
    const result = await api.confirmPickup(orderId);
    order.status = result.order.status;
    state.points = result.points;
    updatePointsUI();
    renderOrders();
    updateOrdersBadge();
    showToast(`Pedido concluído! +${order.points} pontos creditados.`);
  }catch(e){
    showToast(e.message);
  }
}

function updateOrdersBadge(){
  const readyCount = state.orders.filter(o=>o.status==='Pronto para retirar').length;
  document.querySelectorAll('[data-tab="orders"] .nav-badge, [data-tab="orders"] .bn-dot').forEach(el=>el.remove());
  if(readyCount===0) return;
  const sideBtn = document.querySelector('.nav-item[data-tab="orders"]');
  if(sideBtn) sideBtn.insertAdjacentHTML('beforeend', `<span class="nav-badge">${readyCount}</span>`);
  const bnBtn = document.querySelector('.bn-item[data-tab="orders"]');
  if(bnBtn) bnBtn.insertAdjacentHTML('beforeend', `<span class="bn-dot"></span>`);
}

const STATUS_BADGE_CLASS = {
  'Pedido recebido':'status-received', 'Em preparação':'status-preparing',
  'Pronto para retirar':'status-ready', 'Concluído':'status-done'
};

function renderOrders(){
  const wrap = $('orders-list');
  if(state.orders.length===0){
    wrap.innerHTML = `<div class="empty-state">
      <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.6"><path d="M4 8l8-4 8 4v8l-8 4-8-4V8z"/><path d="M4 8l8 4 8-4M12 12v8"/></svg>
      <p>Você ainda não fez nenhum pedido. Compare preços na aba Buscar e reserve seu remédio.</p>
    </div>`;
    return;
  }
  wrap.innerHTML = state.orders.map(o=>{
    const stepIdx = ORDER_STEPS.indexOf(o.status);
    const dateStr = o.createdAt.toLocaleDateString('pt-BR', {day:'2-digit', month:'short', year:'numeric'});
    const timeStr = o.createdAt.toLocaleTimeString('pt-BR', {hour:'2-digit', minute:'2-digit'});
    return `
    <div class="order-card">
      <div class="order-top">
        <div>
          <h3>${escapeHtml(o.medName)}</h3>
          <div class="sub">${escapeHtml(o.pharmName)} · ${dateStr} às ${timeStr}</div>
        </div>
        <span class="status-badge ${STATUS_BADGE_CLASS[o.status]}">${o.status}</span>
      </div>
      <div class="order-track">
        ${ORDER_STEPS.map((s,i)=>`
          <div class="otrack-step ${i<=stepIdx?'done':''}">
            <div class="otrack-line"></div>
            <div class="otrack-dot"></div>
            <div class="otrack-label">${s}</div>
          </div>
        `).join('')}
      </div>
      <div class="order-payment">
        <div class="order-pay-row"><span>Valor pago</span><b>${formatBRL(o.paidAmount)}</b></div>
        ${o.pointsUsed ? `<div class="order-pay-row muted"><span>Desconto com pontos</span><span>-${formatBRL(o.discount)} (${o.pointsUsed} pts)</span></div>` : ''}
        ${o.paymentMethod ? `<div class="order-pay-row muted"><span>Pagamento</span><span>${o.paymentMethod}</span></div>` : ''}
        <div class="order-pay-row muted"><span>Data e horário</span><span>${dateStr} · ${timeStr}</span></div>
      </div>
      <div class="order-code">
        <span>Código de retirada</span>
        <b>${o.code}</b>
      </div>
      ${o.status==='Pronto para retirar' ? `<button class="confirm-pickup-btn" onclick="confirmPickup(${o.id})">Confirmar retirada e receber pontos</button>` : ''}
      ${o.status==='Concluído' ? `<div class="order-earned">+${o.points} pontos creditados</div>` : ''}
    </div>`;
  }).join('');
}

/* ---------------- scanner ---------------- */

let scannerStream = null;
async function startScanner(){
  const video = $('scanner-video');
  const status = $('scanner-status');
  buildScannerMockList();
  if(!navigator.mediaDevices || !navigator.mediaDevices.getUserMedia){
    status.textContent = 'Este navegador não permite acesso à câmera — escolha um remédio abaixo.';
    return;
  }
  try{
    // Tenta a câmera traseira (celular) primeiro; se não existir (ex: notebook), usa a câmera padrão.
    scannerStream = await navigator.mediaDevices.getUserMedia({video:{facingMode:{ideal:'environment'}}});
  }catch{
    try{
      scannerStream = await navigator.mediaDevices.getUserMedia({video:true});
    }catch{
      status.textContent = 'Não foi possível acessar sua câmera — verifique a permissão do navegador ou escolha um remédio abaixo.';
      return;
    }
  }
  video.srcObject = scannerStream;
  status.textContent = 'Aponte para o código de barras ou a caixa do remédio.';
}
function stopScanner(){
  if(scannerStream){ scannerStream.getTracks().forEach(t=>t.stop()); scannerStream=null; }
}
function buildScannerMockList(){
  $('scanner-mock-list').innerHTML = state.catalog.medicines.slice(0,6).map(m=>
    `<button class="chip" onclick="scanResult('${m.id}')">${m.name.split(' ')[0]}</button>`
  ).join('');
}
function mockCapture(){
  const meds = state.catalog.medicines;
  if(meds.length===0) return;
  scanResult(meds[Math.floor(Math.random()*meds.length)].id);
}
function scanResult(medId){
  const med = state.catalog.medicines.find(m=>m.id===medId);
  showToast(`Identificado: ${med.name}`);
  switchTab('home');
  $('search-input').value = med.name;
  setCat('Todos');
  renderResults();
}

/* ---------------- mapa real (Google Maps) ---------------- */

const DEFAULT_MAP_CENTER = [-23.5505, -46.6333]; // São Paulo
let mapInitialized = false;

function initMap(){
  if(!mapInitialized){
    mapInitialized = true;
    requestMapLocation();
  }
}

function loadMapAt(lat, lng){
  $('gmap-frame').src = `https://www.google.com/maps?q=farm%C3%A1cia&ll=${lat},${lng}&z=15&output=embed`;
}

function requestMapLocation(){
  const status = $('map-status');
  status.textContent = 'Obtendo sua localização…';
  status.classList.remove('hidden');
  const useFallback = message => {
    status.textContent = message;
    loadMapAt(...DEFAULT_MAP_CENTER);
    setTimeout(()=> status.classList.add('hidden'), 2500);
  };
  if(!('geolocation' in navigator)){
    useFallback('Localização indisponível — mostrando região padrão.');
    return;
  }
  navigator.geolocation.getCurrentPosition(
    pos=>{
      loadMapAt(pos.coords.latitude, pos.coords.longitude);
      status.textContent = 'Localização encontrada!';
      setTimeout(()=> status.classList.add('hidden'), 1800);
    },
    ()=> useFallback('Não foi possível obter sua localização — mostrando região padrão.'),
    {enableHighAccuracy:true, timeout:8000}
  );
}

/* ---------------- calendário / lembretes ---------------- */

const DOW = ['D','S','T','Q','Q','S','S'];
const MONTHS = ['Janeiro','Fevereiro','Março','Abril','Maio','Junho','Julho','Agosto','Setembro','Outubro','Novembro','Dezembro'];

/* Os lembretes ficam salvos no banco, por conta. Um verificador roda a cada 20s
   comparando com a hora real do dispositivo e dispara uma notificação nativa
   do navegador (ou um aviso dentro do app, se notificações estiverem bloqueadas).
   Funciona enquanto esta aba estiver aberta. */

let reminderCheckInterval = null;

function requestNotificationPermission(){
  if('Notification' in window && Notification.permission === 'default'){
    Notification.requestPermission().then(perm=>{
      if(perm==='granted') showToast('Notificações ativadas! Você será avisado na hora do remédio.');
      else showToast('Notificações bloqueadas — os avisos vão aparecer aqui dentro do app.');
    });
  }
}

function startReminderEngine(){
  if(reminderCheckInterval) clearInterval(reminderCheckInterval);
  checkDueReminders();
  reminderCheckInterval = setInterval(checkDueReminders, 20000);
}

function checkDueReminders(){
  if(!state.user) return;
  const now = Date.now();
  const firedIds = [];
  state.reminders.forEach(r=>{
    if(r.fired) return;
    const [hh, mm] = (r.time||'00:00').split(':').map(Number);
    if(new Date(r.year, r.month, r.day, hh, mm, 0, 0).getTime() <= now){
      r.fired = true;
      firedIds.push(r.id);
      fireReminderNotification(r);
    }
  });
  if(firedIds.length){
    api.markRemindersFired(firedIds).catch(()=>{});
    if(state.activeTab==='calendar') renderCalendar();
  }
}

function fireReminderNotification(r){
  const title = 'Hora do remédio';
  const body = `${r.med} — ${r.time}`;
  if('Notification' in window && Notification.permission === 'granted'){
    try{
      new Notification(title, {body, icon: 'assets/favicon.png'});
      return;
    }catch{ /* cai no aviso interno abaixo */ }
  }
  showToast(`${title}: ${body}`);
}

function calShiftMonth(delta){
  state.calMonth += delta;
  if(state.calMonth<0){ state.calMonth=11; state.calYear--; }
  if(state.calMonth>11){ state.calMonth=0; state.calYear++; }
  renderCalendar();
}

function renderCalendar(){
  $('cal-month-label').textContent = `${MONTHS[state.calMonth]} ${state.calYear}`;
  const firstDow = new Date(state.calYear, state.calMonth, 1).getDay();
  const daysInMonth = new Date(state.calYear, state.calMonth+1, 0).getDate();
  let html = DOW.map(d=>`<div class="cal-dow">${d}</div>`).join('');
  for(let i=0;i<firstDow;i++) html += `<div class="cal-day muted"></div>`;
  for(let d=1; d<=daysInMonth; d++){
    const hasRem = state.reminders.some(r=> r.day===d && r.month===state.calMonth && r.year===state.calYear);
    const sel = state.calSelectedDay===d;
    html += `<div class="cal-day ${sel?'selected':''} ${hasRem?'has-rem':''}" onclick="calSelectDay(${d})">${d}</div>`;
  }
  $('cal-grid').innerHTML = html;
  renderReminderList();
}
function calSelectDay(d){ state.calSelectedDay = d; renderCalendar(); }

async function addReminder(){
  const med = $('rem-med').value.trim();
  const time = $('rem-time').value;
  if(!med || !time){ showToast('Preencha o remédio e o horário.'); return; }
  requestNotificationPermission();
  try{
    const reminder = await api.addReminder({
      med, time, day: state.calSelectedDay, month: state.calMonth, year: state.calYear
    });
    state.reminders.push(reminder);
    $('rem-med').value='';
    renderCalendar();
    checkDueReminders();
    showToast('Lembrete definido! Você será avisado na hora certa, pela hora do seu dispositivo.');
  }catch(e){
    showToast(e.message);
  }
}
async function removeReminder(id){
  try{
    await api.removeReminder(id);
    state.reminders = state.reminders.filter(r=>r.id!==id);
    renderCalendar();
  }catch(e){
    showToast(e.message);
  }
}
function renderReminderList(){
  const list = state.reminders
    .filter(r=>r.month===state.calMonth && r.year===state.calYear)
    .sort((a,b)=> a.day-b.day || a.time.localeCompare(b.time));
  const el = $('rem-list');
  if(list.length===0){ el.innerHTML = `<div class="empty-state" style="padding:24px 10px;"><p>Nenhum lembrete este mês ainda.</p></div>`; return; }
  el.innerHTML = list.map(r=>`
    <div class="rem-item">
      <div class="rem-time">${r.time}</div>
      <div class="rem-info"><p>${escapeHtml(r.med)}</p><span>Dia ${r.day} de ${MONTHS[r.month]}</span></div>
      <button class="rem-del" onclick="removeReminder(${r.id})"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M3 6h18M8 6V4a1 1 0 011-1h6a1 1 0 011 1v2m2 0v14a1 1 0 01-1 1H7a1 1 0 01-1-1V6h12z"/></svg></button>
    </div>
  `).join('');
}

/* ---------------- pontos ---------------- */

function updatePointsUI(){
  $('topbar-points').textContent = state.points;
  $('points-big').textContent = state.points;
  $('points-value').textContent = (state.points*POINT_VALUE).toFixed(2).replace('.',',');
}
function renderPoints(){
  updatePointsUI();
  $('reward-grid').innerHTML = state.catalog.rewards.map(r=>`
    <div class="reward-card">
      <h4>${r.name}</h4>
      <p>${r.desc}</p>
      <div class="reward-cost">${r.cost} pts</div>
      <button class="reward-btn" ${state.points<r.cost?'disabled':''} onclick="redeem('${r.id}')">Resgatar</button>
    </div>
  `).join('');
}
async function redeem(id){
  const reward = state.catalog.rewards.find(x=>x.id===id);
  if(!reward || state.points<reward.cost) return;
  try{
    const result = await api.redeemReward(id);
    state.points = result.points;
    renderPoints();
    showToast(`Resgatado: ${reward.name}!`);
  }catch(e){
    showToast(e.message);
  }
}

/* ---------------- configurações / senha ---------------- */

async function saveSettings(){
  const errBox = $('settings-pass-error');
  errBox.classList.add('hidden');

  const currentPassword = $('settings-pass-current').value;
  const newPassword = $('settings-pass').value;
  const confirmPassword = $('settings-pass-confirm').value;

  try{
    const { user, passwordChanged } = await api.updateMe({
      name: $('settings-name').value.trim(),
      email: $('settings-email').value.trim(),
      currentPassword, newPassword, confirmPassword,
    });
    state.user = { ...state.user, ...user };
    $('settings-pass-current').value='';
    $('settings-pass').value='';
    $('settings-pass-confirm').value='';
    refreshProfileUI();
    showToast(passwordChanged ? 'Senha alterada com sucesso!' : 'Dados atualizados com sucesso!');
  }catch(e){
    errBox.textContent = e.message;
    errBox.classList.remove('hidden');
  }
}

/* ---------------- toasts / modais ---------------- */

let toastTimer=null;
function showToast(msg){
  const t = $('toast');
  t.innerHTML = `${ICON_CHECK} ${msg}`;
  t.classList.add('show');
  clearTimeout(toastTimer);
  toastTimer = setTimeout(()=> t.classList.remove('show'), 3200);
}
function showModal(iconSvg, title, bodyHtml){
  const back = document.createElement('div');
  back.className='modal-back';
  back.innerHTML = `<div class="modal-box">
    <div class="icon-circle">${iconSvg}</div>
    <h3>${title}</h3>
    <p>${bodyHtml}</p>
    <button class="btn btn-primary" style="max-width:100%;">Entendi</button>
  </div>`;
  back.querySelector('button').onclick = ()=> back.remove();
  back.onclick = (e)=>{ if(e.target===back) back.remove(); };
  document.body.appendChild(back);
}

/* ---------------- inicialização ---------------- */

applyLogo();
buildNav();
showView('login');
initGoogleSignIn();
loadCatalog();
