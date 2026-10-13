/* =============================================================
   Trifarmas — front-end (Vercel)
   Núcleo do app: login, navegação, busca, pontos, lembretes e perfil.
   Outros módulos: location.js (mapa), cart.js (carrinho e pagamento),
   orders.js (pedidos e receitas). Os dados ficam no backend (Render).
   ============================================================= */

const { GOOGLE_CLIENT_ID } = window.TRIFARMAS_CONFIG;

const LOGO_SRC = 'assets/logo.png';
const WELCOME_MESSAGE = 'Seja bem-vindo(a) ao Trifarmas! Estamos felizes em ajudar você a economizar e cuidar da sua saúde.';
const RESULTS_PAGE_SIZE = 10;

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
const ICON_RX = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M14 3H7a2 2 0 00-2 2v14a2 2 0 002 2h10a2 2 0 002-2V8z"/><path d="M14 3v5h5M9 13h6M9 17h4"/></svg>';
const ICON_CART_PLUS = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><circle cx="9" cy="20" r="1.4"/><circle cx="18" cy="20" r="1.4"/><path d="M2 3h3l2.6 12.2a1 1 0 001 .8h9.7a1 1 0 001-.8L21 7H6.2"/><path d="M13 9v4M11 11h4"/></svg>';

const state = {
  user:null,
  theme:'light',
  points:0,
  activeTab:'home',
  activeCat:'Todos',
  resultsLimit: RESULTS_PAGE_SIZE,
  expandedMeds: new Set(),
  reminders:[],
  orders:[],
  calMonth: new Date().getMonth(),
  calYear: new Date().getFullYear(),
  calSelectedDay: new Date().getDate(),
  catalog: { pharmacies: [], medicines: [], rewards: [] },
  pointsInfo: { pending: 0, coupons: [], history: [] },
};

/* ---------------- utilidades ---------------- */

const $ = id => document.getElementById(id);
const formatBRL = value => Number(value || 0).toLocaleString('pt-BR', { style:'currency', currency:'BRL' });
const formatKm = km => km < 1 ? `${Math.round(km * 1000)} m` : `${km.toFixed(1).replace('.', ',')} km`;

function escapeHtml(str){
  return String(str ?? '').replace(/[&<>"']/g, c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
}

// Remove acentos para buscas ("dipirona" encontra "Dipirona Sódica").
const normalizeText = s => String(s || '').normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase();

const storage = {
  get(key){ try{ return JSON.parse(localStorage.getItem(key)); }catch{ return null; } },
  set(key, value){ try{ localStorage.setItem(key, JSON.stringify(value)); }catch{ /* modo privado */ } },
};

function readFileAsDataURL(file){
  return new Promise((resolve, reject)=>{
    const reader = new FileReader();
    reader.onload = () => resolve(reader.result);
    reader.onerror = () => reject(new Error('Não foi possível ler o arquivo.'));
    reader.readAsDataURL(file);
  });
}

// Reduz a imagem antes de enviar (fotos de celular têm vários MB).
// square=true recorta no centro (usado na foto de perfil).
async function resizeImage(file, maxSize, { square = false, quality = 0.85 } = {}){
  const url = URL.createObjectURL(file);
  try{
    const img = await new Promise((resolve, reject)=>{
      const image = new Image();
      image.onload = () => resolve(image);
      image.onerror = () => reject(new Error('Formato de imagem não suportado. Use JPG ou PNG.'));
      image.src = url;
    });
    let sx = 0, sy = 0, sw = img.naturalWidth, sh = img.naturalHeight;
    if(square){
      const side = Math.min(sw, sh);
      sx = (sw - side) / 2; sy = (sh - side) / 2; sw = sh = side;
    }
    const scale = Math.min(1, maxSize / Math.max(sw, sh));
    const canvas = document.createElement('canvas');
    canvas.width = Math.round(sw * scale);
    canvas.height = Math.round(sh * scale);
    const ctx = canvas.getContext('2d');
    ctx.fillStyle = '#fff';
    ctx.fillRect(0, 0, canvas.width, canvas.height);
    ctx.drawImage(img, sx, sy, sw, sh, 0, 0, canvas.width, canvas.height);
    return canvas.toDataURL('image/jpeg', quality);
  }finally{
    URL.revokeObjectURL(url);
  }
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
    if(state.user) renderResults();
  }catch(e){
    showToast(e.message);
  }
}

const allMeds = () => state.catalog.medicines;
const medById = id => allMeds().find(m=>m.id===id);
const pharmacyById = id => state.catalog.pharmacies.find(p=>p.id===id);
const pharmacyLogo = pharm => `https://www.google.com/s2/favicons?domain=${pharm.domain}&sz=64`;

function pharmacyLogoHtml(pharm, extraClass = ''){
  const letter = escapeHtml(pharm.name.charAt(0));
  return `<img class="pharm-dot ${extraClass}" src="${pharmacyLogo(pharm)}" alt="" loading="lazy"
    onerror="this.onerror=null;this.replaceWith(Object.assign(document.createElement('div'),{className:'pharm-dot pharm-dot-fallback ${extraClass}',textContent:'${letter}'}));">`;
}

/* ---------------- foto de perfil ---------------- */

// Avatar com as iniciais, gerado no próprio navegador (não depende de serviço externo).
function initialsAvatar(name){
  const initials = String(name || 'T').trim().split(/\s+/).slice(0, 2).map(w => w.charAt(0).toUpperCase()).join('') || 'T';
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 64 64"><rect width="64" height="64" fill="#2fa85e"/><text x="50%" y="50%" dy=".35em" text-anchor="middle" font-family="Inter,Arial,sans-serif" font-size="26" font-weight="700" fill="#fff">${escapeHtml(initials)}</text></svg>`;
  return `data:image/svg+xml;charset=utf-8,${encodeURIComponent(svg)}`;
}

// Se a foto não carregar (link expirado, sem internet), mostra as iniciais.
function setAvatar(img, src){
  img.referrerPolicy = 'no-referrer'; // necessário para fotos do Google
  img.onerror = () => { img.onerror = null; img.src = initialsAvatar(state.user && state.user.name); };
  img.src = src || initialsAvatar(state.user && state.user.name);
}

let signupAvatarData = null;
async function pickSignupAvatar(input){
  const file = input.files && input.files[0];
  input.value = '';
  if(!file) return;
  try{
    signupAvatarData = await resizeImage(file, 320, { square:true });
    $('signup-avatar-preview').src = signupAvatarData;
  }catch(e){ showToast(e.message); }
}

// A foto escolhida manualmente substitui a do Google e fica salva na conta.
async function pickSettingsAvatar(input){
  const file = input.files && input.files[0];
  input.value = '';
  if(!file || !state.user) return;
  try{
    const avatar = await resizeImage(file, 320, { square:true });
    const { user } = await api.updateMe({ avatar });
    state.user = { ...state.user, ...user };
    refreshProfileUI();
    showToast('Foto atualizada!');
  }catch(e){ showToast(e.message); }
}

async function resetGooglePhoto(){
  try{
    const { user } = await api.updateMe({ resetAvatar: true });
    state.user = { ...state.user, ...user };
    refreshProfileUI();
    showToast('Voltamos a usar a foto da sua Conta Google.');
  }catch(e){ showToast(e.message); }
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

  const width = Math.min(320, Math.max(220, $('view-login').clientWidth - 100));
  const buttonOptions = { type:'standard', theme:'outline', size:'large', shape:'pill', width, logo_alignment:'left' };
  google.accounts.id.renderButton($('google-btn-login'), { ...buttonOptions, text:'signin_with' });
  google.accounts.id.renderButton($('google-btn-signup'), { ...buttonOptions, text:'signup_with' });

  googleSignInReady = true;
}

/* O Google devolve um ID Token (JWT) assinado. Ele é enviado ao backend,
   que valida a assinatura, cria/recupera a conta e atualiza a foto. */
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
    showToast('Entrou com a conta demo (configure o GOOGLE_CLIENT_ID para login real).');
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
    const session = await api.signup({ name, email, password, avatar: signupAvatarData || undefined });
    signupAvatarData = null;
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
  closeCheckout();
  state.user = null;
  state.orders = [];
  state.reminders = [];
  state.pointsInfo = { pending: 0, coupons: [], history: [] };
  $('app').classList.add('hidden');
  showView('login');
  $('login-pass').value='';
}

async function enterApp(session){
  api.setToken(session.token);
  state.user = session.user;
  state.points = session.user.points;
  state.resultsLimit = RESULTS_PAGE_SIZE;
  loadCart();

  // Carrega do banco os dados desta conta.
  try{
    const [orders, reminders, pointsInfo] = await Promise.all([
      api.orders(), api.reminders(), api.points(),
    ]);
    setOrders(orders);
    state.reminders = reminders;
    applyPointsInfo(pointsInfo);
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
  updateCartUI();
  startReminderEngine();
  switchTab('home');
  initLocationSilently();

  // Pop-up de boas-vindas: o servidor só libera na primeira entrada da conta.
  if(session.showWelcome) openWelcomePopup();
}

function refreshProfileUI(){
  const firstName = state.user.name.split(' ')[0];
  $('home-greeting').textContent = `Olá, ${firstName}! Pesquise um remédio e compare o preço nas farmácias perto de você.`;
  setAvatar($('settings-avatar'), state.user.avatar);
  setAvatar($('sidebar-avatar'), state.user.avatar);
  $('settings-name').value = state.user.name;
  $('settings-email').value = state.user.email;
  $('sidebar-name').textContent = state.user.name;
  $('reset-google-photo').classList.toggle('hidden', !(state.user.hasGooglePhoto && state.user.avatarCustom));
}

function openWelcomePopup(){
  $('welcome-popup-text').textContent = WELCOME_MESSAGE;
  $('welcome-overlay').classList.remove('hidden');
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
      <img id="sidebar-avatar" src="" alt="" referrerpolicy="no-referrer">
      <div>
        <p class="name" id="sidebar-name">—</p>
        <p class="role">Ver perfil</p>
      </div>
    </div>
  `;
  $('bottom-nav').innerHTML = NAV_ITEMS.map(it=>{
    if(it.center){
      return `<button class="bn-scan" data-tab="${it.id}" onclick="switchTab('${it.id}')" aria-label="${it.label}">${it.icon}</button>`;
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
  document.querySelector('.content').scrollTop = 0;

  if(id==='map') initMap();
  if(id==='scanner') startScanner();
  else stopScanner();
  if(id==='calendar'){ renderCalendar(); requestNotificationPermission(); }
  if(id==='orders') renderOrders();
  if(id==='points'){ renderPoints(); refreshPoints(); }
  if(id==='home') renderResults();
  updateCartUI();
}

function applyTheme(theme){
  state.theme = theme;
  document.body.setAttribute('data-theme', theme);
  $('settings-theme-switch').classList.toggle('on', theme==='dark');
  $('theme-icon').innerHTML = theme==='dark'
    ? '<path d="M21 12.8A9 9 0 1111.2 3a7 7 0 009.8 9.8z"/>'
    : '<circle cx="12" cy="12" r="4"/><path d="M12 2v2M12 20v2M4.9 4.9l1.4 1.4M17.7 17.7l1.4 1.4M2 12h2M20 12h2M4.9 19.1l1.4-1.4M17.7 6.3l1.4-1.4"/>';
}
// Tamanho do texto: multiplica todas as fontes do app (variável CSS --fs). Fica salvo neste aparelho.
const FONT_SCALES = [0.9, 1, 1.15, 1.3];
function applyFontScale(scale){
  const value = FONT_SCALES.includes(scale) ? scale : 1;
  document.documentElement.style.setProperty('--fs', value);
  document.querySelectorAll('#font-size-options button').forEach(b=>
    b.setAttribute('aria-checked', String(Number(b.dataset.scale) === value)));
}
function setFontScale(scale){
  applyFontScale(scale);
  storage.set('trifarmas-font-scale', scale);
}

function toggleTheme(){
  applyTheme(state.theme==='light' ? 'dark' : 'light');
  storage.set('trifarmas-theme', state.theme);
}

/* ---------------- busca ---------------- */

function buildChips(){
  const cats = ['Todos', ...new Set(state.catalog.medicines.map(m=>m.cat))];
  $('chip-row').innerHTML = cats.map(c=>
    `<button class="chip ${c===state.activeCat?'active':''}" data-cat="${escapeHtml(c)}" onclick="setCat(this.dataset.cat)">${escapeHtml(c)}</button>`
  ).join('');
}
function setCat(cat){
  state.activeCat = cat;
  state.resultsLimit = RESULTS_PAGE_SIZE;
  document.querySelectorAll('.chip').forEach(c=>c.classList.toggle('active', c.dataset.cat===cat));
  renderResults();
}

let searchDebounce = null;
function onSearchInput(){
  clearTimeout(searchDebounce);
  searchDebounce = setTimeout(()=>{ state.resultsLimit = RESULTS_PAGE_SIZE; renderResults(); }, 120);
}

function filteredMeds(){
  const q = normalizeText($('search-input').value.trim());
  let meds = allMeds();
  if(state.activeCat !== 'Todos') meds = meds.filter(m=>m.cat===state.activeCat);
  if(!q) return meds;
  const terms = q.split(/\s+/);
  return meds
    .map(m=>{
      const name = normalizeText(m.name);
      const haystack = `${name} ${normalizeText(m.ingredient)} ${normalizeText(m.cat)}`;
      if(!terms.every(t=>haystack.includes(t))) return null;
      return { m, score: (name.startsWith(terms[0]) ? 2 : 0) + (name.includes(q) ? 1 : 0) };
    })
    .filter(Boolean)
    .sort((a,b)=> b.score-a.score || (b.m.popularity||0)-(a.m.popularity||0))
    .map(x=>x.m);
}

function renderResults(){
  const rawQuery = $('search-input').value.trim();
  const meds = filteredMeds();
  const shown = meds.slice(0, state.resultsLimit);

  let meta = '';
  if(meds.length){
    meta = rawQuery
      ? `${meds.length} resultado${meds.length>1?'s':''} para "${escapeHtml(rawQuery)}"`
      : (state.activeCat==='Todos' ? 'Mais procurados' : escapeHtml(state.activeCat)) + ` · ${meds.length} remédios`;
  }
  $('results-meta').innerHTML = meta;

  let html = '';
  if(meds.length===0){
    html += `<div class="empty-state">
      <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.6"><circle cx="11" cy="11" r="7"/><path d="M21 21l-4.3-4.3"/></svg>
      <p>Nenhum remédio encontrado${rawQuery ? ` para "<strong>${escapeHtml(rawQuery)}</strong>"` : ''}.</p>
      <span>Confira a escrita ou busque pelo princípio ativo (ex.: "dipirona", "losartana").</span>
    </div>`;
  } else {
    html += shown.map(renderMedCard).join('');
    if(meds.length > shown.length){
      html += `<button class="btn btn-ghost load-more" onclick="showMoreResults()">Mostrar mais (${meds.length - shown.length})</button>`;
    }
  }

  $('results-wrap').innerHTML = html;
}

function showMoreResults(){
  state.resultsLimit += RESULTS_PAGE_SIZE;
  renderResults();
}

function toggleMedPharmacies(medId){
  if(state.expandedMeds.has(medId)) state.expandedMeds.delete(medId);
  else state.expandedMeds.add(medId);
  renderResults();
}

// Farmácias com preço para um remédio, ordenadas por preço e distância.
function pharmacyOffers(med){
  return Object.entries(med.prices)
    .map(([pid, price])=>{
      const pharm = pharmacyById(pid);
      return pharm ? { ...pharm, price, ...pharmacyDistance(pharm) } : null;
    })
    .filter(Boolean)
    .sort((a,b)=> a.price-b.price || a.km-b.km);
}

function rxBadge(){
  return `<span class="rx-badge" title="Precisa de receita médica">${ICON_RX}Exige receita</span>`;
}

function renderMedCard(med){
  const offers = pharmacyOffers(med);
  if(offers.length===0) return '';
  const best = offers[0];
  const expanded = state.expandedMeds.has(med.id);
  const shown = expanded ? offers : offers.slice(0, 4);
  const maxPrice = Math.max(...offers.map(e=>e.price));
  const savings = Math.round((1-best.price/maxPrice)*100);
  const inCart = cartQuantity(med.id);
  const details = [med.presentation, med.ingredient].filter(Boolean).map(escapeHtml).join(' · ');

  return `
  <article class="result-card">
    <div class="result-top">
      <div class="result-med">
        <h3>${escapeHtml(med.name)}</h3>
        ${details ? `<div class="sub">${details}</div>` : ''}
        <div class="result-tags">
          ${med.rx ? rxBadge() : ''}
          ${savings > 0 ? `<span class="best-tag">Economize até ${savings}%</span>` : ''}
          ${inCart ? `<span class="incart-tag">${inCart} no carrinho</span>` : ''}
        </div>
      </div>
      <div class="from-price"><span>a partir de</span><b>${formatBRL(best.price)}</b></div>
    </div>
    <div class="pharm-list">
      ${shown.map(e=>`
        <div class="pharm-row ${e.id===best.id?'top':''}">
          ${pharmacyLogoHtml(e)}
          <div class="pharm-info">
            <p class="pharm-name">${escapeHtml(e.name)} ${e.id===best.id?'<span class="best-pill">Menor preço</span>':''}</p>
            <p class="pharm-meta">${e.label}</p>
          </div>
          <div class="price">${formatBRL(e.price)}</div>
          <button class="pharm-buy-btn" onclick="addToCart('${med.id}','${e.id}')" aria-label="Adicionar ao carrinho na ${escapeHtml(e.name)}">
            ${ICON_CART_PLUS}<span>Adicionar</span>
          </button>
        </div>
      `).join('')}
    </div>
    ${offers.length > 4 ? `<button class="link-more" onclick="toggleMedPharmacies('${med.id}')">${expanded ? 'Ver menos farmácias' : `Ver todas as ${offers.length} farmácias`}</button>` : ''}
  </article>`;
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
  if(state.activeTab !== 'scanner'){ stopScanner(); return; }
  video.srcObject = scannerStream;
  status.textContent = 'Aponte para o código de barras ou a caixa do remédio.';
}
function stopScanner(){
  if(scannerStream){ scannerStream.getTracks().forEach(t=>t.stop()); scannerStream=null; }
}
function buildScannerMockList(){
  $('scanner-mock-list').innerHTML = state.catalog.medicines.slice(0,8).map(m=>
    `<button class="chip" onclick="scanResult('${m.id}')">${escapeHtml(m.name)}</button>`
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
  $('search-input').value = med.name;
  state.activeCat = 'Todos';
  buildChips();
  switchTab('home');
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
  if(state.calSelectedDay > daysInMonth) state.calSelectedDay = daysInMonth;
  let html = DOW.map(d=>`<div class="cal-dow">${d}</div>`).join('');
  for(let i=0;i<firstDow;i++) html += `<div class="cal-day muted"></div>`;
  for(let d=1; d<=daysInMonth; d++){
    const hasRem = state.reminders.some(r=> r.day===d && r.month===state.calMonth && r.year===state.calYear);
    const sel = state.calSelectedDay===d;
    html += `<button class="cal-day ${sel?'selected':''} ${hasRem?'has-rem':''}" onclick="calSelectDay(${d})">${d}</button>`;
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
      <button class="rem-del" onclick="removeReminder(${r.id})" aria-label="Excluir lembrete"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M3 6h18M8 6V4a1 1 0 011-1h6a1 1 0 011 1v2m2 0v14a1 1 0 01-1 1H7a1 1 0 01-1-1V6h12z"/></svg></button>
    </div>
  `).join('');
}

/* ---------------- pontos ----------------
   Regras (calculadas no servidor):
   - 1 ponto para cada R$1 pago, creditado ao confirmar a retirada.
   - Pontos são trocados por cupons de desconto, usados no pagamento. */

function applyPointsInfo(info){
  state.points = info.points;
  state.pointsInfo = { pending: info.pending, coupons: info.coupons, history: info.history };
}

async function refreshPoints(){
  try{
    applyPointsInfo(await api.points());
    updatePointsUI();
    if(state.activeTab==='points') renderPoints();
  }catch{ /* mantém os dados atuais */ }
}

function updatePointsUI(){
  $('topbar-points').textContent = state.points.toLocaleString('pt-BR');
  $('points-big').textContent = state.points.toLocaleString('pt-BR');
  const pending = state.pointsInfo.pending;
  $('points-pending').textContent = pending > 0
    ? `+${pending.toLocaleString('pt-BR')} pts a receber quando você retirar seus pedidos`
    : 'Compre pelo app para acumular pontos';

  const next = state.catalog.rewards.find(r=>r.cost > state.points);
  const bar = $('points-progress-bar');
  if(next){
    bar.style.width = `${Math.min(100, state.points / next.cost * 100)}%`;
    $('points-next').textContent = `Faltam ${(next.cost - state.points).toLocaleString('pt-BR')} pts para o cupom de ${next.name}`;
  } else {
    bar.style.width = '100%';
    $('points-next').textContent = state.catalog.rewards.length ? 'Você já pode trocar por qualquer cupom!' : '';
  }
}

function renderPoints(){
  updatePointsUI();
  $('reward-grid').innerHTML = state.catalog.rewards.map(r=>{
    const missing = r.cost - state.points;
    return `
    <div class="reward-card">
      <h4>${escapeHtml(r.name)}</h4>
      <p>${escapeHtml(r.desc)}</p>
      <div class="reward-cost">${r.cost.toLocaleString('pt-BR')} pts</div>
      <button class="reward-btn" ${missing>0?'disabled':''} onclick="redeem('${r.id}')">${missing>0 ? `Faltam ${missing.toLocaleString('pt-BR')} pts` : 'Trocar por cupom'}</button>
    </div>`;
  }).join('');

  const coupons = state.pointsInfo.coupons;
  $('coupon-list').innerHTML = coupons.length ? coupons.map(c=>`
    <div class="coupon-item">
      <div class="coupon-icon">%</div>
      <div><p>${escapeHtml(c.name)}</p><span>${c.minOrder>0 ? `Em compras a partir de ${formatBRL(c.minOrder)}` : 'Em qualquer compra'} · use na tela de pagamento</span></div>
    </div>`).join('')
    : `<div class="empty-inline">Você ainda não tem cupons. Troque seus pontos acima.</div>`;

  const history = state.pointsInfo.history;
  $('points-history').innerHTML = history.length ? history.map(h=>`
    <div class="history-item">
      <div><p>${escapeHtml(h.description)}</p><span>${new Date(h.createdAt).toLocaleDateString('pt-BR', {day:'2-digit', month:'short', year:'numeric'})}</span></div>
      <b class="${h.delta>=0?'pos':'neg'}">${h.delta>=0?'+':''}${h.delta.toLocaleString('pt-BR')} pts</b>
    </div>`).join('')
    : `<div class="empty-inline">Nenhuma movimentação ainda.</div>`;
}

async function redeem(id){
  const reward = state.catalog.rewards.find(x=>x.id===id);
  if(!reward || state.points<reward.cost) return;
  try{
    const result = await api.redeemReward(id);
    state.points = result.points;
    await refreshPoints();
    renderPoints();
    showToast(`Cupom de ${reward.name} liberado! Use na tela de pagamento.`);
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
  t.innerHTML = `${ICON_CHECK} <span>${escapeHtml(msg)}</span>`;
  t.classList.add('show');
  clearTimeout(toastTimer);
  toastTimer = setTimeout(()=> t.classList.remove('show'), 3400);
}

/* Modal no centro da tela. buttons: [{label, primary, onClick}] */
function showModal(iconSvg, title, bodyHtml, buttons = [{ label:'Entendi', primary:true }], { tone = '' } = {}){
  const back = document.createElement('div');
  back.className='modal-back';
  back.innerHTML = `<div class="modal-box ${tone}" role="dialog" aria-modal="true">
    <div class="icon-circle">${iconSvg}</div>
    <h3>${title}</h3>
    <p>${bodyHtml}</p>
    <div class="modal-actions"></div>
  </div>`;
  const actions = back.querySelector('.modal-actions');
  buttons.forEach(b=>{
    const btn = document.createElement('button');
    btn.className = b.primary ? 'btn btn-primary' : 'btn btn-ghost';
    btn.textContent = b.label;
    btn.onclick = ()=>{ back.remove(); if(b.onClick) b.onClick(); };
    actions.appendChild(btn);
  });
  back.onclick = (e)=>{ if(e.target===back) back.remove(); };
  document.body.appendChild(back);
  actions.querySelector('button').focus();
  return back;
}

/* ---------------- inicialização ---------------- */

function initApp(){
  applyLogo();
  buildNav();
  applyTheme(storage.get('trifarmas-theme') === 'dark' ? 'dark' : 'light');
  applyFontScale(Number(storage.get('trifarmas-font-scale')) || 1);
  showView('login');
  initGoogleSignIn();
  loadCatalog();
}
