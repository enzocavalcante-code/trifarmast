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
  stocks:[],          // quantas unidades a pessoa tem em casa, por remédio
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

/* ---------------- ver a senha ----------------
   Cada campo de senha tem um botão de olho ao lado. Mostrar a senha ajuda
   muita gente a não errar a digitação — principalmente no celular. */

const ICON_EYE = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M2 12s3.6-7 10-7 10 7 10 7-3.6 7-10 7-10-7-10-7z"/><circle cx="12" cy="12" r="3"/></svg>';
const ICON_EYE_OFF = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M10.6 6.2A9.8 9.8 0 0112 6c6.4 0 10 7 10 7a17 17 0 01-3.2 4M6.6 6.6A17 17 0 002 13s3.6 7 10 7a9.7 9.7 0 005.4-1.6"/><path d="M9.9 9.9a3 3 0 004.2 4.2"/><path d="M3 3l18 18"/></svg>';

function togglePassword(button){
  const input = $(button.dataset.for);
  if(!input) return;
  const show = input.type === 'password';
  input.type = show ? 'text' : 'password';
  button.innerHTML = show ? ICON_EYE_OFF : ICON_EYE;
  button.classList.toggle('on', show);
  const label = show ? 'Ocultar senha' : 'Mostrar senha';
  button.setAttribute('aria-label', label);
  button.setAttribute('title', label);
  // volta o cursor para o fim do que já foi digitado
  input.focus();
  try{ input.setSelectionRange(input.value.length, input.value.length); }catch{ /* alguns navegadores não permitem */ }
}

// Desenha o olho em todos os campos de senha ao abrir o app.
function setupPasswordToggles(){
  document.querySelectorAll('.pass-toggle').forEach(button=>{
    button.innerHTML = ICON_EYE;
    button.classList.remove('on');
    const input = $(button.dataset.for);
    if(input) input.type = 'password';
  });
}

function showView(name){
  $('view-login').classList.toggle('hidden', name!=='login');
  $('view-signup').classList.toggle('hidden', name!=='signup');
  $('login-error').classList.add('hidden');
  // Voltando para a tela inicial, o convite do Google não faz mais sentido.
  if(name !== 'signup' && typeof hideGoogleInvite === 'function') hideGoogleInvite();
  renderGoogleButtons();
}

/* ---------------- catálogo (vem do banco) ----------------
   O catálogo muda raramente. Guardamos uma cópia no aparelho para a busca
   funcionar na hora, e buscamos a versão nova em segundo plano. */

const CATALOG_KEY = 'trifarmas-catalog';
const CATALOG_MAX_AGE_MS = 24 * 60 * 60 * 1000;

function useCatalog(catalog){
  state.catalog = catalog;
  buildChips();
  if(state.user) renderResults();
}

function loadCachedCatalog(){
  const saved = storage.get(CATALOG_KEY);
  if(!saved || !saved.catalog || !Array.isArray(saved.catalog.medicines) || !saved.catalog.medicines.length) return false;
  if(Date.now() - saved.savedAt > CATALOG_MAX_AGE_MS) return false;
  useCatalog(saved.catalog);
  return true;
}

async function loadCatalog({ silent = false } = {}){
  try{
    const catalog = await api.catalog();
    useCatalog(catalog);
    storage.set(CATALOG_KEY, { catalog, savedAt: Date.now() });
  }catch(e){
    if(!silent) showToast(e.message);
  }
}

const allMeds = () => state.catalog.medicines;
const medById = id => allMeds().find(m=>m.id===id);
const pharmacyById = id => state.catalog.pharmacies.find(p=>p.id===id);
const faviconUrl = domain => `https://www.google.com/s2/favicons?domain=${encodeURIComponent(domain)}&sz=64`;

// Logo da farmácia (ícone do site da rede). Sem site conhecido, ou se o ícone não
// carregar, mostra a inicial do nome num quadrado colorido.
function pharmacyLogoHtml(pharm, extraClass = ''){
  const letter = escapeHtml((pharm.name || '?').trim().charAt(0).toUpperCase());
  const hue = [...(pharm.name || '')].reduce((h, c) => (h * 31 + c.charCodeAt(0)) % 360, 140);
  if(!pharm.domain){
    return `<div class="pharm-dot pharm-dot-fallback ${extraClass}" style="--logo-hue:${hue}">${letter}</div>`;
  }
  return `<img class="pharm-dot ${extraClass}" src="${faviconUrl(pharm.domain)}" alt="" loading="lazy"
    data-letter="${letter}" data-hue="${hue}" onerror="logoFallback(this)">`;
}

function logoFallback(img){
  const div = document.createElement('div');
  div.className = img.className + ' pharm-dot-fallback';
  div.style.setProperty('--logo-hue', img.dataset.hue);
  div.textContent = img.dataset.letter;
  img.replaceWith(div);
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

  googleSignInReady = true;
  renderGoogleButtons();
}

/* Botão oficial do Google, com a mesma largura do botão "Entrar" e a cor do tema do app. */
function renderGoogleButtons(){
  if(!googleSignInReady) return;
  const card = document.querySelector('#view-login:not(.hidden) .auth-card, #view-signup:not(.hidden) .auth-card');
  const inner = card ? card.clientWidth - parseFloat(getComputedStyle(card).paddingLeft) * 2 : 320;
  const width = Math.round(Math.min(400, Math.max(200, inner)));
  const buttonOptions = {
    type:'standard', size:'large', shape:'pill', width, logo_alignment:'center',
    theme: 'outline', // sempre branco, também no tema escuro
  };
  $('google-btn-login').innerHTML = '';
  $('google-btn-signup').innerHTML = '';
  google.accounts.id.renderButton($('google-btn-login'), { ...buttonOptions, text:'signin_with' });
  google.accounts.id.renderButton($('google-btn-signup'), { ...buttonOptions, text:'signup_with' });
}

const ICON_GOOGLE_G = '<svg viewBox="0 0 48 48" width="18" height="18" aria-hidden="true"><path fill="#FFC107" d="M43.6 20.5H42V20H24v8h11.3C33.7 32.6 29.3 35.5 24 35.5c-6.4 0-11.7-4.6-12.8-10.8-.2-1-.2-2 0-3C12.3 15.6 17.6 11 24 11c3.1 0 5.9 1.2 8 3.1l6-6C34.6 4.9 29.6 3 24 3 12.4 3 3 12.4 3 24s9.4 21 21 21 21-9.4 21-21c0-1.2-.1-2.3-.4-3.5z"/><path fill="#FF3D00" d="M6.3 14.7l6.6 4.8C14.6 15.7 18.9 13 24 13c3.1 0 5.9 1.2 8 3.1l6-6C34.6 6.9 29.6 5 24 5c-7.6 0-14.1 4.3-17.7 9.7z"/><path fill="#4CAF50" d="M24 45c5.5 0 10.4-1.8 14.2-4.9l-6.6-5.5C29.6 36.4 26.9 37.5 24 37.5c-5.3 0-9.7-2.9-11.3-7.4l-6.6 5.1C9.7 41 16.3 45 24 45z"/><path fill="#1976D2" d="M43.6 20.5H42V20H24v8h11.3c-.8 2.3-2.3 4.2-4.2 5.6l6.6 5.5C38.9 40.8 45 35.5 45 24c0-1.2-.1-2.3-.4-3.5z"/></svg>';

// Conta Google que tentou entrar sem ter cadastro (fica guardada até criar a conta).
let pendingGoogleSignup = null;

const isSignupView = () => !$('view-signup').classList.contains('hidden');

/* O Google devolve um ID Token (JWT) assinado. Ele é enviado ao backend,
   que valida a assinatura, recupera (ou cria, no cadastro) a conta e atualiza a foto. */
async function handleGoogleCredential(response){
  // Botão da tela inicial: só entra em conta que já existe. Botão da tela de cadastro: cria.
  const mode = isSignupView() ? 'signup' : 'login';
  try{
    const session = await api.googleLogin(response.credential, mode);
    const firstName = session.user.name.split(' ')[0];
    showToast(session.isNewUser
      ? 'Conta criada com o Google! Bem-vindo(a) ao Trifarmas.'
      : `Login com Google realizado! Bem-vindo(a) de volta, ${firstName}.`);
    await enterApp(session);
  }catch(e){
    if(e.code === 'google_account_missing'){
      inviteGoogleSignup(e.data.profile, { credential: response.credential });
      return;
    }
    showToast(e.message);
  }
}

/* Sem conta no Trifarmas: leva para a tela de criar conta, já com os dados do Google. */
function inviteGoogleSignup(profile, { credential = null, demo = false } = {}){
  pendingGoogleSignup = { profile, credential, demo };
  showView('signup');
  $('signup-name').value = profile.name || '';
  $('signup-email').value = profile.email || '';

  const box = $('google-invite');
  box.innerHTML = `
    <div class="gi-head">
      ${ICON_GOOGLE_G}
      <b>Você ainda não tem conta no Trifarmas</b>
    </div>
    <p>A Conta Google <b>${escapeHtml(profile.email)}</b> ainda não tem cadastro aqui. Crie a sua agora, em um toque:</p>
    <button class="btn btn-primary gi-btn" onclick="confirmGoogleSignup()">${ICON_GOOGLE_G} Criar conta com o Google</button>
    <p class="gi-or">Ou preencha os campos abaixo para criar uma conta com e-mail e senha.</p>`;
  box.classList.remove('hidden');
  box.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
}

function hideGoogleInvite(){
  pendingGoogleSignup = null;
  const box = $('google-invite');
  if(box){ box.classList.add('hidden'); box.innerHTML = ''; }
}

/* Cria a conta com o mesmo acesso do Google que a pessoa acabou de usar. */
async function confirmGoogleSignup(){
  if(!pendingGoogleSignup) return;
  const { credential, demo } = pendingGoogleSignup;
  const button = document.querySelector('#google-invite .gi-btn');
  if(button){ button.disabled = true; button.textContent = 'Criando sua conta…'; }
  try{
    const session = demo ? await api.googleDemo('signup') : await api.googleLogin(credential, 'signup');
    hideGoogleInvite();
    showToast('Conta criada com o Google! Bem-vindo(a) ao Trifarmas.');
    await enterApp(session);
  }catch(e){
    if(button){ button.disabled = false; button.innerHTML = `${ICON_GOOGLE_G} Criar conta com o Google`; }
    // O acesso do Google vale por pouco tempo: se expirar, é só tocar no botão do Google de novo.
    showToast(e.status === 401
      ? 'O acesso do Google expirou. Toque no botão “Inscrever-se com o Google” aqui embaixo.'
      : e.message);
  }
}

/* "Usar conta demo" — aparece só enquanto o GOOGLE_CLIENT_ID não estiver configurado. */
async function googleAuthDemo(mode){
  try{
    const session = await api.googleDemo(mode);
    showToast(session.isNewUser
      ? 'Conta demo criada (configure o GOOGLE_CLIENT_ID para login real).'
      : 'Entrou com a conta demo (configure o GOOGLE_CLIENT_ID para login real).');
    await enterApp(session);
  }catch(e){
    if(e.code === 'google_account_missing'){
      inviteGoogleSignup(e.data.profile, { demo: true });
      return;
    }
    showToast(e.message);
  }
}

/* ---------------- login / cadastro ---------------- */

/* Desliga o botão enquanto a conta carrega, para não enviar duas vezes.
   O texto do botão não muda. */
async function withAuthButton(selector, task){
  const button = document.querySelector(selector);
  if(button) button.disabled = true;
  try{
    return await task();
  }finally{
    if(button) button.disabled = false;
  }
}

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
    await withAuthButton('#view-login .btn-primary', async () => {
      await enterApp(await api.login(email, pass));
    });
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
    await withAuthButton('#view-signup .btn-primary', async () => {
      const session = await api.signup({ name, email, password });
      showToast('Conta criada! Bem-vindo(a) ao Trifarmas.');
      await enterApp(session);
    });
  }catch(e){
    showToast(e.message);
  }
}

function doLogout(){
  api.setToken(null);
  if(ocrWorker){ try{ ocrWorker.terminate(); }catch{ /* já encerrado */ } ocrWorker = null; ocrWorkerPromise = null; }
  stopOrderTimers();
  if(typeof stopRefining === 'function') stopRefining();
  loc.manualAddress = false;
  if(reminderCheckInterval){ clearInterval(reminderCheckInterval); reminderCheckInterval=null; }
  closeCheckout();
  state.user = null;
  state.orders = [];
  state.reminders = [];
  state.stocks = [];
  state.pointsInfo = { pending: 0, coupons: [], history: [] };
  updateOrdersBadge();
  updateRemindersBadge();
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

  // Os dados da conta já vêm junto com o login (uma requisição só). Contas que
  // entrarem por uma versão antiga da API seguem buscando em segundo plano.
  const hasData = applyAccountData(session.data);

  $('view-login').classList.add('hidden');
  $('view-signup').classList.add('hidden');
  $('app').classList.remove('hidden');
  hideGoogleInvite();

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

  // Nada bloqueia a tela: se os dados não vieram no login, chegam agora.
  if(!hasData) refreshAccountData();
}

// Pedidos, lembretes e pontos que vieram junto com o login.
function applyAccountData(data){
  if(!data) return false;
  setOrders(data.orders || []);
  state.reminders = data.reminders || [];
  state.stocks = data.stocks || [];
  if(data.points) applyPointsInfo(data.points);
  return true;
}

// Busca os mesmos dados pelas rotas separadas (plano B).
async function refreshAccountData(){
  try{
    const [orders, reminders, pointsInfo, stocks] = await Promise.all([
      api.orders(), api.reminders(), api.points(), api.stocks(),
    ]);
    setOrders(orders);
    state.reminders = reminders;
    state.stocks = stocks;
    applyPointsInfo(pointsInfo);
    updatePointsUI();
    updateOrdersBadge();
    updateRemindersBadge();
    if(state.activeTab === 'orders') renderOrders();
    if(state.activeTab === 'calendar') renderReminders();
    if(state.activeTab === 'points') renderPoints();
  }catch(e){
    showToast(e.message);
  }
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
  if(id==='calendar') renderReminders();
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
  let meds = allMeds();
  if(state.activeCat !== 'Todos') meds = meds.filter(m=>m.cat===state.activeCat);
  return medsMatchingQuery($('search-input').value, meds);
}

// Mesma busca que a tela de resultados usa. Fica separada para que a leitura da
// câmera possa contar e precificar exatamente o que a pesquisa vai mostrar.
function medsMatchingQuery(query, meds = allMeds()){
  const q = normalizeText(String(query || '').trim());
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

/* A câmera é a parte mais frágil do app: pode estar sem permissão, em uso por
   outro aplicativo ou parar sozinha quando o celular é bloqueado. Por isso a
   tela sempre mostra em que pé está e dá um caminho de saída — nunca fica
   parada numa imagem congelada. */

let scannerStream = null;
let scannerStarting = false;
let scannerTimer = null;

const ICON_CAMERA = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8"><path d="M3 8a2 2 0 012-2h2.5l1.2-2h6.6l1.2 2H20a2 2 0 012 2v9a2 2 0 01-2 2H5a2 2 0 01-2-2z"/><circle cx="12" cy="12.5" r="3.5"/></svg>';
const ICON_CAMERA_OFF = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8"><path d="M3 8a2 2 0 012-2h2M10 6h4.3l1.2 2H20a2 2 0 012 2v7M3 12v5a2 2 0 002 2h12"/><path d="M3 3l18 18"/></svg>';

const SCANNER_STATES = {
  off: {
    icon: ICON_CAMERA,
    text: 'A câmera fica desligada até você pedir.',
    button: 'Ligar a câmera',
    caption: 'A câmera só liga quando você pedir.',
  },
  loading: {
    icon: ICON_CAMERA,
    text: 'Abrindo a câmera…',
    button: '',
    caption: 'Se o navegador perguntar, toque em "Permitir".',
  },
  live: { icon: '', text: '', button: '', caption: 'Deixe o nome e a dosagem dentro da moldura.' },
};

function setScannerUI(stateName, custom = {}){
  const frame = $('scanner-frame');
  if(!frame) return;
  const preset = { ...(SCANNER_STATES[stateName] || SCANNER_STATES.off), ...custom };
  const live = stateName === 'live';
  frame.dataset.state = stateName;
  $('scan-overlay').classList.toggle('hidden', live);
  $('scan-guide').classList.toggle('hidden', !live);
  // O botão continua à vista, mas só funciona com a câmera no ar.
  const stop = $('scanner-stop');
  stop.hidden = false;
  stop.disabled = !live;
  $('scan-overlay-icon').innerHTML = preset.icon || '';
  $('scan-overlay-text').textContent = preset.text || '';
  const button = $('scan-overlay-btn');
  button.textContent = preset.button || '';
  button.classList.toggle('hidden', !preset.button);
  $('scanner-status').textContent = preset.caption || '';
}

// Mensagem clara para cada motivo de a câmera não abrir.
function scannerErrorMessage(error){
  const name = error && error.name;
  if(name === 'NotAllowedError' || name === 'SecurityError'){
    return 'Câmera bloqueada. Libere no cadeado ao lado do endereço.';
  }
  if(name === 'NotFoundError' || name === 'DevicesNotFoundError'){
    return 'Nenhuma câmera neste aparelho.';
  }
  if(name === 'NotReadableError' || name === 'TrackStartError'){
    return 'A câmera está em uso por outro app.';
  }
  return 'Não consegui abrir a câmera.';
}

function showScannerError(message){
  stopScannerStream();
  setScannerUI('error', {
    icon: ICON_CAMERA_OFF,
    text: message,
    button: 'Tentar de novo',
    caption: 'Ou escolha um remédio na lista abaixo.',
  });
}

// Tenta a câmera traseira (celular); se não houver, usa qualquer câmera.
async function requestCamera(){
  try{
    return await navigator.mediaDevices.getUserMedia({ video: { facingMode: { ideal: 'environment' } } });
  }catch(error){
    if(error && (error.name === 'OverconstrainedError' || error.name === 'NotFoundError')){
      return navigator.mediaDevices.getUserMedia({ video: true });
    }
    throw error;
  }
}

/* userAsked=false acontece ao abrir a aba: só liga sozinho se a permissão da
   câmera já tiver sido dada antes. */
async function startScanner(userAsked = false){
  buildScannerMockList();
  if(scannerStream || scannerStarting) return;

  if(!navigator.mediaDevices || !navigator.mediaDevices.getUserMedia || !window.isSecureContext){
    setScannerUI('error', {
      icon: ICON_CAMERA_OFF,
      text: 'Este navegador não libera a câmera.',
      button: '',
      caption: 'Escolha um remédio na lista abaixo.',
    });
    return;
  }

  if(!userAsked && !(await cameraAlreadyAllowed())){
    setScannerUI('off');
    return;
  }

  scannerStarting = true;
  setScannerUI('loading');
  let stream;
  try{
    stream = await requestCamera();
  }catch(error){
    scannerStarting = false;
    showScannerError(scannerErrorMessage(error));
    return;
  }
  scannerStarting = false;

  // O usuário pode ter saído da aba enquanto a permissão era pedida.
  if(state.activeTab !== 'scanner'){
    stream.getTracks().forEach(track => track.stop());
    setScannerUI('off');
    return;
  }

  scannerStream = stream;
  const video = $('scanner-video');
  video.srcObject = stream;
  video.onplaying = () => {
    clearTimeout(scannerTimer);
    setScannerUI('live');
  };
  // Se a câmera for interrompida (bloqueio de tela, outro app), avisa.
  stream.getVideoTracks().forEach(track => { track.onended = () => showScannerError('A câmera foi interrompida.'); });

  try{
    await video.play();
  }catch{ /* alguns navegadores só liberam depois de um toque — o botão já é um toque */ }

  if(video.readyState >= 2) setScannerUI('live');
  clearTimeout(scannerTimer);
  scannerTimer = setTimeout(()=>{
    if(scannerStream && video.readyState < 2) showScannerError('A câmera não respondeu. Tente de novo.');
  }, 10000);
}

// Já autorizada antes? Então pode abrir sozinha ao entrar na aba.
async function cameraAlreadyAllowed(){
  try{
    if(!navigator.permissions || !navigator.permissions.query) return false;
    const status = await navigator.permissions.query({ name: 'camera' });
    return status.state === 'granted';
  }catch{
    return false; // navegador sem essa consulta (Safari): espera o toque
  }
}

function stopScannerStream(){
  hideScanProgress();
  clearTimeout(scannerTimer);
  scannerStarting = false;
  if(scannerStream){
    scannerStream.getVideoTracks().forEach(track => { track.onended = null; });
    scannerStream.getTracks().forEach(track => track.stop());
    scannerStream = null;
  }
  const video = $('scanner-video');
  if(video){
    video.onplaying = null;
    video.pause();
    // sem limpar o srcObject, o último quadro fica congelado na tela
    video.srcObject = null;
    video.removeAttribute('src');
    video.load();
  }
}

function stopScanner(userAsked = false){
  const wasOn = !!scannerStream || scannerStarting;
  stopScannerStream();
  if(!$('scanner-frame')) return;
  // Só avisa que desligou se havia algo ligado.
  if(userAsked && wasOn) setScannerUI('off', { caption: 'Câmera desligada. Ligue de novo quando quiser.' });
  else if(wasOn || state.activeTab !== 'scanner') setScannerUI('off');
}

/* Ao voltar para o app, o vídeo costuma ficar parado no último quadro:
   manda tocar de novo (ou avisa, se a câmera foi encerrada pelo sistema). */
document.addEventListener('visibilitychange', ()=>{
  if(document.hidden || !scannerStream) return;
  const video = $('scanner-video');
  const live = scannerStream.getVideoTracks().some(track => track.readyState === 'live');
  if(!live){ showScannerError('A câmera parou enquanto o app estava em segundo plano.'); return; }
  if(video && video.paused) video.play().catch(()=>{});
});
function buildScannerMockList(){
  $('scanner-mock-list').innerHTML = state.catalog.medicines.slice(0,8).map(m=>
    `<button class="chip" onclick="scanResult('${m.id}')">${escapeHtml(m.name)}</button>`
  ).join('');
}

function scanResult(medId){
  const med = state.catalog.medicines.find(m=>m.id===medId);
  if(!med) return;
  showToast(`Identificado: ${med.name}`);
  searchForTerm(med.name);
}

// Leva para a tela de compra com o remédio já pesquisado (preços por farmácia,
// ordenados pela distância de onde a pessoa está).
function searchForTerm(term){
  $('search-input').value = term;
  state.activeCat = 'Todos';
  state.resultsLimit = RESULTS_PAGE_SIZE;
  buildChips();
  switchTab('home');
  renderResults();
  setTimeout(()=>{
    const results = $('results-wrap');
    if(results) results.scrollIntoView({ behavior: 'smooth', block: 'start' });
  }, 120);
}

/* ---------------- ler o texto da caixa (OCR) ----------------
   A câmera tira uma foto do que está na frente dela, o Tesseract lê as letras
   e o app procura esse texto no catálogo. Funciona com a caixa do remédio, a
   receita ou um papel escrito à mão em letra de forma. */

const TESSERACT_URL = 'https://cdn.jsdelivr.net/npm/tesseract.js@5.1.1/dist/tesseract.min.js';
let ocrWorker = null;
let ocrWorkerPromise = null;
let ocrRunning = false;

function loadScript(src){
  return new Promise((resolve, reject)=>{
    const tag = document.createElement('script');
    tag.src = src;
    tag.async = true;
    tag.onload = resolve;
    tag.onerror = () => reject(new Error('falha ao baixar o leitor de texto'));
    document.head.appendChild(tag);
  });
}

// O leitor é baixado na primeira leitura (~2 MB) e fica pronto para as próximas.
async function getOcrWorker(onProgress){
  if(ocrWorker) return ocrWorker;
  if(ocrWorkerPromise) return ocrWorkerPromise;
  ocrWorkerPromise = (async () => {
    if(typeof Tesseract === 'undefined') await loadScript(TESSERACT_URL);
    const worker = await Tesseract.createWorker('por', 1, {
      logger: m => {
        if(m.status === 'recognizing text') onProgress(0.4 + m.progress * 0.6, 'Lendo o que está escrito…');
        else onProgress(Math.min(0.35, (m.progress || 0) * 0.35), 'Preparando o leitor…');
      },
    });
    ocrWorker = worker;
    return worker;
  })();
  try{
    return await ocrWorkerPromise;
  }catch(error){
    ocrWorkerPromise = null;
    throw error;
  }
}

/* Só o pedaço dentro da moldura amarela vira foto. Ler a imagem inteira
   trazia tudo o que estava em volta — e era daí que saíam as "palavras" que
   faziam o app achar remédio em qualquer coisa. */
function guideCrop(video){
  const full = { x: 0, y: 0, width: video.videoWidth, height: video.videoHeight };
  const frame = $('scanner-frame');
  const guide = $('scan-guide');
  if(!frame || !guide) return full;
  const box = frame.getBoundingClientRect();
  const area = guide.getBoundingClientRect();
  if(!box.width || !box.height || !area.width || !area.height) return full;

  // O vídeo preenche a moldura cortando as sobras (object-fit: cover).
  const scale = Math.max(box.width / video.videoWidth, box.height / video.videoHeight);
  const hiddenX = (video.videoWidth * scale - box.width) / 2;
  const hiddenY = (video.videoHeight * scale - box.height) / 2;
  const margin = 0.06;                                   // uma folga, para não cortar letra
  const left = (area.left - box.left + hiddenX) / scale - video.videoWidth * margin;
  const top = (area.top - box.top + hiddenY) / scale - video.videoHeight * margin;
  const width = area.width / scale + video.videoWidth * margin * 2;
  const height = area.height / scale + video.videoHeight * margin * 2;

  const x = Math.max(0, Math.min(video.videoWidth - 1, left));
  const y = Math.max(0, Math.min(video.videoHeight - 1, top));
  const crop = {
    x, y,
    width: Math.min(width, video.videoWidth - x),
    height: Math.min(height, video.videoHeight - y),
  };
  return (crop.width >= 80 && crop.height >= 80) ? crop : full;
}

// Foto do que a câmera está vendo, em tons de cinza e com contraste reforçado
// (a leitura fica bem melhor do que na imagem crua).
function grabCameraFrame(){
  const video = $('scanner-video');
  if(!video || !video.videoWidth) return null;
  const crop = guideCrop(video);
  const maxWidth = 1400;
  const scale = Math.min(2, maxWidth / crop.width);          // recorte pequeno: amplia um pouco
  const canvas = document.createElement('canvas');
  canvas.width = Math.round(crop.width * scale);
  canvas.height = Math.round(crop.height * scale);
  const ctx = canvas.getContext('2d');
  ctx.drawImage(video, crop.x, crop.y, crop.width, crop.height, 0, 0, canvas.width, canvas.height);
  const image = ctx.getImageData(0, 0, canvas.width, canvas.height);
  const data = image.data;
  for(let i = 0; i < data.length; i += 4){
    const gray = 0.299 * data[i] + 0.587 * data[i + 1] + 0.114 * data[i + 2];
    const boosted = Math.max(0, Math.min(255, (gray - 128) * 1.45 + 128));
    data[i] = data[i + 1] = data[i + 2] = boosted;
  }
  ctx.putImageData(image, 0, 0);
  return canvas;
}

function setScanProgress(fraction, text){
  const overlay = $('scan-progress');
  if(!overlay) return;
  overlay.classList.remove('hidden');
  $('scan-progress-text').textContent = text;
  $('scan-progress-bar').style.width = `${Math.round(Math.max(0.04, fraction) * 100)}%`;
}

function hideScanProgress(){
  const overlay = $('scan-progress');
  if(overlay) overlay.classList.add('hidden');
}

/* Botão "Ler o remédio": tira a foto, lê o texto e abre a tela de compra. */
async function captureAndRead(){
  if(ocrRunning) return;
  if(!state.catalog.medicines.length){ showToast('O catálogo ainda está carregando. Tente em instantes.'); return; }

  const canvas = grabCameraFrame();
  if(!canvas){
    showToast('Ligue a câmera (ou envie uma foto) para eu ler o nome do remédio.');
    return;
  }
  await readImage(canvas);
}

/* Mesma leitura, a partir de uma foto escolhida no aparelho. */
async function readPhoto(input){
  const file = input.files && input.files[0];
  input.value = '';
  if(!file) return;
  if(!/^image\//.test(file.type)){ showToast('Escolha uma foto da caixa do remédio.'); return; }
  const url = URL.createObjectURL(file);
  try{
    const image = await new Promise((resolve, reject)=>{
      const img = new Image();
      img.onload = () => resolve(img);
      img.onerror = () => reject(new Error('não consegui abrir a foto'));
      img.src = url;
    });
    await readImage(image);
  }catch(e){
    showToast(e.message);
  }finally{
    URL.revokeObjectURL(url);
  }
}

async function readImage(source){
  ocrRunning = true;
  hideScanOutcome();
  setScanProgress(0.05, 'Preparando o leitor…');
  try{
    const worker = await getOcrWorker(setScanProgress);
    // "blocks" traz cada palavra com a confiança e o tamanho das letras: é o que
    // permite jogar fora leitura embaralhada e saber se é caixa ou papel escrito.
    const result = await worker.recognize(source, {}, { text: true, blocks: true });
    hideScanProgress();
    handleScannedText(buildReading(result && result.data, source));
  }catch(error){
    hideScanProgress();
    showScanReadError(error);
  }finally{
    ocrRunning = false;
  }
}

function showScanReadError(error){
  const offline = /baixar|network|fetch|load/i.test(error && error.message || '');
  showScanOutcome({
    tone: 'warn',
    eyebrow: 'Não deu para ler',
    title: offline ? 'Sem internet para o leitor' : 'Não consegui ler agora',
    body: offline
      ? 'O leitor precisa de internet na primeira vez.'
      : 'Tente de novo com a caixa mais perto e com boa luz.',
    buttons: [{ label: 'Ler de novo', primary: true, onClick: 'captureAndRead()' }],
  });
}

/* ---- do texto lido para o remédio do catálogo ---- */

// Distância de edição, para aguentar erro de leitura ("D1PIRONA" → "dipirona").
function editDistance(a, b){
  if(a === b) return 0;
  if(Math.abs(a.length - b.length) > 2) return 99;
  const prev = Array.from({ length: b.length + 1 }, (_, i) => i);
  for(let i = 1; i <= a.length; i++){
    let last = prev[0];
    prev[0] = i;
    for(let j = 1; j <= b.length; j++){
      const current = prev[j];
      prev[j] = Math.min(
        prev[j] + 1,
        prev[j - 1] + 1,
        last + (a[i - 1] === b[j - 1] ? 0 : 1)
      );
      last = current;
    }
  }
  return prev[b.length];
}

const ocrTokens = text => normalizeText(text)
  .replace(/(\d)\s*(mg|ml|g|mcg)\b/g, '$1$2')     // "500 mg" → "500mg"
  .split(/[^a-z0-9]+/)
  .filter(Boolean);

/* O leitor devolve cada palavra com uma confiança de 0 a 100 e o retângulo onde
   ela está. Guardamos isso junto com o texto: é o que separa uma leitura de
   verdade de um amontoado de letras que a câmera inventou ao mirar em qualquer
   coisa — antes bastava uma palavra parecida para o app "achar" um remédio. */
const OCR_CONF = {
  word: 62,     // palavra confiável
  exact: 66,    // mínimo para valer como nome igualzinho
  fuzzy: 80,    // para aceitar o nome com uma letra errada
  best: 70,     // a melhor palavra da foto; abaixo disso a foto não presta
};

function buildReading(data, source){
  const text = (data && data.text) || '';
  const imageHeight = (source && (source.height || source.naturalHeight || source.videoHeight)) || 0;
  let words = collectOcrWords(data)
    .map(w => ({
      text: String((w && w.text) || '').trim(),
      conf: w && Number.isFinite(Number(w.confidence)) ? Number(w.confidence) : null,
      height: w && w.bbox ? Math.abs((w.bbox.y1 || 0) - (w.bbox.y0 || 0)) : 0,
    }))
    .filter(w => w.text);
  // Leitor sem detalhe por palavra: seguimos só com o texto, como antes.
  if(!words.length){
    words = text.split(/\s+/).filter(Boolean).map(t => ({ text: t, conf: null, height: 0 }));
  }
  return { text, words, imageHeight };
}

// O Tesseract v5 entrega as palavras dentro de blocos → parágrafos → linhas.
function collectOcrWords(data){
  if(!data) return [];
  if(Array.isArray(data.words) && data.words.length) return data.words;
  const found = [];
  const walk = node => {
    if(!node || typeof node !== 'object') return;
    if(Array.isArray(node.words)) found.push(...node.words);
    ['blocks', 'paragraphs', 'lines'].forEach(key => {
      if(Array.isArray(node[key])) node[key].forEach(walk);
    });
  };
  (Array.isArray(data.blocks) ? data.blocks : []).forEach(walk);
  return found;
}

// Separa o que dá para confiar. Sem confiança por palavra (leitor antigo),
// trabalhamos com o texto inteiro, como antes.
function readingQuality(reading){
  // Vale tudo com dois caracteres de verdade: palavra ("mg"), número ("500")
  // e as misturas que fazem parte do nome ("D3", "T4", "B12").
  const words = (reading.words || []).filter(w => (String(w.text).match(/[a-z0-9à-ú]/gi) || []).length >= 2);
  const scored = words.filter(w => w.conf != null);
  const mean = scored.length ? scored.reduce((sum, w) => sum + w.conf, 0) / scored.length : null;
  // A melhor palavra vale mais que a média: numa caixa, o miolo da bula sai
  // mal lido e derruba a média mesmo quando o nome do remédio saiu perfeito.
  const strongest = scored.length ? Math.max(...scored.map(w => w.conf)) : null;
  const reliable = scored.length ? scored.filter(w => w.conf >= OCR_CONF.word) : words;
  return { words, scored, reliable, mean, strongest, hasConfidence: scored.length > 0 };
}

// Palavras lidas, já quebradas em pedaços comparáveis com o catálogo.
function scanWords(reading){
  const quality = readingQuality(reading);
  const list = [];
  const source = quality.reliable.length ? quality.reliable : quality.words;
  source.forEach(w => ocrTokens(w.text).forEach(token => list.push({ token, conf: w.conf })));
  if(!list.length) ocrTokens(reading.text || '').forEach(token => list.push({ token, conf: null }));
  return mergeDoseTokens(list);
}

// O leitor entrega "500" e "mg" separados; o catálogo guarda "500mg".
function mergeDoseTokens(list){
  const out = [];
  list.forEach((word, i) => {
    out.push(word);
    const next = list[i + 1];
    if(next && /^\d+$/.test(word.token) && /^(mg|ml|mcg|g|ui)$/.test(next.token)){
      const confs = [word.conf, next.conf].filter(c => c != null);
      out.push({ token: word.token + next.token, conf: confs.length ? Math.min(...confs) : null });
    }
  });
  return out;
}

/* ---- dosagem: 500 mg é diferente de 1 g ----
   Comparar texto não resolvia ("1g" e "1.000 mg" são a mesma coisa, "500mg" e
   "500mg/ml" não são), então a dose vira número antes de comparar. */

// Letras que o leitor troca por número quando está lendo uma dosagem ("SOO mg").
const DIGIT_LOOKALIKE = { o: '0', q: '0', l: '1', i: '1', s: '5', b: '8', z: '2' };
const UNIT_RE = /^(mg|mcg|ug|g|ui|ml)(?:\s*\/\s*(ml|g|dose))?[.,;:]?$/;

// "SOO" → "500", mas só em pedaço curto que vai antes de uma unidade: assim
// "paracetamol" nunca vira número.
function doseNumber(raw, allowLetters){
  const text = String(raw).toLowerCase();
  if(!/\d/.test(text) && !(allowLetters && text.length <= 4)) return null;
  const digits = text.replace(/[a-z]/g, c => DIGIT_LOOKALIKE[c] || 'x');
  if(/x/.test(digits)) return null;
  // "1.000" é mil; "0,21" é fração.
  const normalized = digits.replace(/[.\s](?=\d{3}(\D|$))/g, '').replace(',', '.');
  const value = parseFloat(normalized);
  return Number.isFinite(value) && value > 0 ? value : null;
}

function pushDose(found, value, unit, per){
  if(value == null) return;
  if(per) found.push({ cls: `${unit}/${per}`, value });                   // concentração
  else if(unit === 'g') found.push({ cls: 'mg', value: value * 1000 });
  else if(unit === 'mg') found.push({ cls: 'mg', value });
  else if(unit === 'mcg' || unit === 'ug') found.push({ cls: 'mg', value: value / 1000 });
  else found.push({ cls: unit, value });                                  // ui, ml
}

/* Todas as dosagens de um texto, em miligramas quando dá para converter.
   Trabalha palavra por palavra — "500 mg", "500mg", "1 g" e "SOO mg" caem
   todas no mesmo número, e o que está no meio de uma palavra é ignorado. */
function parseDoses(text){
  const words = normalizeText(text)
    .replace(/\bmiligramas?\b/g, 'mg').replace(/\bgramas?\b/g, 'g')
    .replace(/\bmicrogramas?\b/g, 'mcg').replace(/\bmililitros?\b/g, 'ml')
    .split(/\s+/).filter(Boolean);
  const found = [];
  for(let i = 0; i < words.length; i++){
    const word = words[i];
    // tudo junto: "500mg", "500mg/ml"
    const glued = word.match(/^([0-9a-z.,]+?)(mg|mcg|ug|g|ui|ml)(?:\s*\/\s*(ml|g|dose))?[.,;:]?$/);
    if(glued){
      const value = doseNumber(glued[1], glued[1].length <= 4);
      if(value != null){ pushDose(found, value, glued[2], glued[3]); continue; }
    }
    // separado: "500" + "mg"
    const next = words[i + 1] && words[i + 1].match(UNIT_RE);
    if(next){
      const value = doseNumber(word, true);
      if(value != null){ pushDose(found, value, next[1], next[2]); i++; }
    }
  }
  return found;
}

const sameDose = (a, b) => a.cls === b.cls && Math.abs(a.value - b.value) <= Math.max(a.value, b.value) * 0.02;

// A dosagem que o próprio catálogo declara (fica guardada no remédio).
function medicineDoses(med){
  if(!med.__doses) med.__doses = parseDoses(`${med.name} ${med.presentation || ''}`);
  return med.__doses;
}

// Quantidade da caixa: "20 comprimidos", "30 cápsulas", "1 unidade".
function packSize(text){
  const match = normalizeText(text).match(/(\d{1,3})\s*(comprimid|capsul|drage|envelope|sache|unidade|adesivo|ampola)/);
  return match ? Number(match[1]) : null;
}

/* Palavras do catálogo que também são palavras do dia a dia (ou termos
   químicos que se repetem em dezenas de remédios): sozinhas não provam nada.
   É o que evitava "teste" virar "Teste de Gravidez". */
const WEAK_TOKENS = new Set([
  'teste', 'rapido', 'agua', 'soro', 'oral', 'ultra', 'plus', 'forte', 'total', 'extra',
  'brasil', 'moura', 'ciclo', 'complexo', 'vitamina', 'calcio', 'ferro', 'zinco', 'oleo',
  'creme', 'pomada', 'spray', 'colirio', 'xarope', 'gotas', 'frasco', 'solucao', 'infantil',
  'adulto', 'composto', 'simples', 'unidade', 'noite', 'sono', 'mulher', 'homem', 'pele',
  'cabelo', 'olhos', 'sodica', 'sodico', 'potassica', 'potassico', 'calcica', 'acido',
  'cloridrato', 'sulfato', 'fosfato', 'fumarato', 'maleato', 'besilato', 'nitrato',
  'bromidrato', 'dipropionato', 'monoidratada', 'micronizada', 'revestido', 'revestidos',
  // produtos de cuidado: o nome é palavra comum e aparece em qualquer embalagem
  'algodao', 'gaze', 'mascara', 'luvas', 'luva', 'curativo', 'adesivo', 'esparadrapo',
  'termometro', 'preservativo', 'fralda', 'sabonete', 'repelente', 'compressa', 'bolsa',
  'alcool', 'oxigenada', 'protetor', 'solar', 'hidratante', 'locao', 'xampu', 'teste',
  'medidor', 'digital', 'lancetas', 'agulhas', 'descartavel', 'descartaveis', 'estereis',
]);

// Uma palavra do remédio aparece na leitura? Devolve como ela apareceu.
function tokenHit(token, words){
  let best = null;
  for(const word of words){
    if(word.token === token){
      if(word.conf == null || word.conf >= OCR_CONF.exact) return { kind: 'exact', conf: word.conf };
      continue;
    }
    // Uma letra errada só é aceita em palavra comprida e bem lida.
    if(token.length >= 7 && Math.abs(word.token.length - token.length) <= 1
       && editDistance(word.token, token) <= 1
       && (word.conf == null || word.conf >= OCR_CONF.fuzzy)){
      if(!best || (word.conf || 0) > (best.conf || 0)) best = { kind: 'fuzzy', conf: word.conf };
    }
  }
  return best;
}

// Mantida para quem só tem o texto (testes e leitores sem confiança).
function tokenInText(token, textTokens){
  return !!tokenHit(token, textTokens.map(t => ({ token: t, conf: null })));
}

/* Procura no catálogo o remédio que combina com a leitura. Para um remédio ser
   aceito não basta uma palavra parecida: ou duas partes do nome batem, ou a
   palavra que bateu é específica daquele remédio (nada de "teste", "água"). */
function scoreMedicine(med, words, readDoses = [], readPack = null, readText = ''){
  const nameTokens = [...new Set(ocrTokens(med.name))];
  const ingredientTokens = [...new Set(ocrTokens(med.ingredient || ''))];
  const wordTokens = nameTokens.filter(t => !/\d/.test(t) && t.length >= 4);
  // "pistas" conta palavras diferentes: o nome e o princípio ativo repetidos
  // ("Dipirona" / "Dipirona sódica") somam pontos, mas valem como uma pista só.
  const matched = new Set(), strongTokens = new Set();
  let score = 0, nameHits = 0;

  for(const token of nameTokens){
    if(/^\d/.test(token)) continue;                          // dosagem é comparada por número
    // "D3", "T4", "B12" são curtas mas fazem parte do nome: valem como apoio.
    const short = token.length < 4;
    if(short && !(token.length >= 2 && /\d/.test(token))) continue;
    const hit = tokenHit(token, words);
    if(!hit) continue;
    nameHits++;
    matched.add(token);
    if(short){ score += hit.kind === 'exact' ? 2 : 0; continue; }
    score += hit.kind === 'exact' ? 4 : 2;
    if(hit.kind === 'exact' && token.length >= 5 && !WEAK_TOKENS.has(token)) strongTokens.add(token);
  }

  // O nome inteiro aparece escrito ("complexo b", "teste de gravidez").
  const phrase = normalizeText(med.name).replace(/\s*\d.*$/, '').trim();
  if(phrase.length >= 6 && phrase.includes(' ') && readText.includes(phrase)){
    matched.add(`frase:${phrase}`);
    strongTokens.add(`frase:${phrase}`);
    score += 5;
  }
  for(const token of ingredientTokens){
    if(token.length < 6) continue;
    const hit = tokenHit(token, words);
    if(!hit) continue;
    matched.add(token);
    score += hit.kind === 'exact' ? 3 : 1;
    if(hit.kind === 'exact' && !WEAK_TOKENS.has(token)) strongTokens.add(token);
  }
  /* A dosagem decide entre as apresentações: "Dipirona 1g" e "Dipirona Sódica
     500mg" têm o mesmo nome, então quem bate a dose sobe e quem contraria a
     dose cai. Só compara o que é comparável (mg com mg, UI com UI). */
  const medDoses = medicineDoses(med);
  const classes = new Set(medDoses.map(d => d.cls));
  const comparable = readDoses.filter(r => classes.has(r.cls));
  const doseMatch = comparable.some(r => medDoses.some(d => sameDose(d, r)));
  const doseConflict = comparable.length > 0 && !doseMatch;
  if(matched.size){
    if(doseMatch) score += 4;
    else if(doseConflict) score -= 4;
  }
  // "20 comprimidos" na caixa conferindo com a apresentação ajuda um pouco.
  if(matched.size && readPack && packSize(med.presentation || '') === readPack) score += 2;

  const hits = matched.size, strong = strongTokens.size;
  // O nome do remédio é uma palavra só ("Dorflex", "Yasmin") e ela foi lida inteira.
  const wholeName = wordTokens.length === 1 && nameHits === 1 && strong > 0;
  const ok = hits > 0 && (hits >= 2 || strong > 0) && score >= 4;
  // Confiante = duas pistas diferentes, a dosagem junto, ou o nome inteiro —
  // e nunca quando a dosagem lida briga com a do remédio.
  const sure = ok && strong > 0 && !doseConflict && (hits >= 2 || doseMatch || wholeName);
  return { med, score, hits, strong, sure, ok, doseMatch, doseConflict };
}

function matchMedicines(input){
  const words = typeof input === 'string'
    ? ocrTokens(input).map(token => ({ token, conf: null }))
    : scanWords(input);
  if(!words.length) return [];
  // A dosagem é lida do texto confiável, com "500" e "mg" ainda separados.
  const readText = typeof input === 'string' ? input : scanText(input);
  const readDoses = parseDoses(readText);
  const readPack = packSize(readText);
  const flat = normalizeText(readText).replace(/\s+/g, ' ');
  return state.catalog.medicines
    .map(med => scoreMedicine(med, words, readDoses, readPack, flat))
    .filter(r => r.ok)
    .sort((a, b) => b.score - a.score || a.med.name.localeCompare(b.med.name));
}

// O texto só com as palavras em que dá para confiar.
function scanText(reading){
  const quality = readingQuality(reading);
  const list = quality.reliable.length ? quality.reliable : quality.words;
  return list.length ? list.map(w => w.text).join(' ') : String(reading.text || '');
}

/* ---- caixa de remédio ou papel escrito? ----
   A caixa tem letra grande, maiúscula e palavras de embalagem ("genérico",
   "comprimidos", "VENDA SOB PRESCRIÇÃO"). A receita tem muitas linhas, letra
   miúda e palavras de consultório ("paciente", "tomar", "CRM"). */
const SCAN_SOURCES = {
  caixa:   { eyebrow: 'Lido na caixa',   where: 'na caixa' },
  receita: { eyebrow: 'Lido na receita', where: 'na receita' },
  texto:   { eyebrow: 'Lido no texto',   where: 'no texto' },
};

function classifyScanSource(reading){
  const raw = String((reading && reading.text) || '');
  const text = normalizeText(raw);
  const letters = raw.replace(/[^A-Za-zÀ-ÿ]/g, '');
  const upper = letters ? (raw.match(/[A-ZÀ-Þ]/g) || []).length / letters.length : 0;
  const lines = raw.split('\n').map(l => l.trim()).filter(l => l.length > 1);
  const words = (reading && reading.words) || [];
  const heights = words.map(w => w.height).filter(h => h > 0).sort((a, b) => a - b);
  const median = heights.length ? heights[Math.floor(heights.length / 2)] : 0;
  const tallest = heights.length ? heights[heights.length - 1] : 0;
  const bigLetters = reading && reading.imageHeight
    ? tallest / reading.imageHeight >= 0.11
    : (median ? tallest / median >= 2.4 : false);

  let box = 0, paper = 0;
  if(/venda sob prescri|medicamento generico|\bgenerico\b|\bsimilar\b/.test(text)) box += 3;
  if(/comprimid|capsul|drage|envelope|frasco|ampola|\d\s?(mg|ml|mcg|g)\b/.test(text)) box += 2;
  if(/anvisa|registro ms|\bms\b *\d|lote|\bval\b|fabricado|laborat|industria|farmaceutic/.test(text)) box += 2;
  if(upper >= 0.55) box += 2;
  if(bigLetters) box += 2;
  if(lines.length <= 4) box += 1;

  const prescription = /receitu|paciente|\bcrm\b|carimbo|assinatura|posologia|uso continuo|prescrevo|consultorio|\bclinica\b|\bdr\.?a?\b/.test(text);
  if(prescription) paper += 4;
  if(/tomar|administrar|ao dia|de \d+ em \d+ ?h|\d+ ?x ao dia|via oral|em jejum|por \d+ dias/.test(text)) paper += 3;
  if(lines.length >= 6) paper += 2;
  if(upper < 0.35 && !bigLetters) paper += 2;
  if(words.length >= 25) paper += 1;

  if(prescription && paper >= box) return 'receita';
  // Só chamamos de caixa quando a embalagem se anuncia: letra grande, maiúscula
  // ou as palavras que só existem em rótulo. Na dúvida, "texto".
  return (box >= 4 && box > paper) ? 'caixa' : 'texto';
}

function scanEyebrow(source, fallback = 'Lido no texto'){
  return (SCAN_SOURCES[source] || {}).eyebrow || fallback;
}

// Primeira palavra do nome ("Dipirona Sódica 500mg" → "dipirona"): serve para
// saber se dois resultados são o mesmo remédio em apresentações diferentes.
function mainNameToken(med){
  return ocrTokens(med.name).find(token => token.length >= 4 && !/\d/.test(token)) || '';
}

/* Palavra mais provável de ser o nome do remédio, quando não achamos no
   catálogo. Só aceita palavra que PARECE palavra e que foi lida com
   segurança — senão o app oferecia procurar por "=modo" e coisas assim. */
const IGNORE_WORDS = ['comprimidos', 'comprimido', 'revestidos', 'capsulas', 'generico', 'medicamento',
  'similar', 'farmacia', 'drogaria', 'contem', 'oral', 'adulto', 'infantil', 'prescricao', 'medica',
  'venda', 'embalagem', 'posologia', 'receita', 'paciente', 'validade', 'fabricacao'];

function looksLikeWord(word){
  if(!/^[a-z]{5,16}$/.test(word)) return false;
  const vowels = (word.match(/[aeiou]/g) || []).length;
  if(vowels < 2 || vowels > word.length - 2) return false;     // precisa de vogal e de consoante
  if(/(.)\1\1/.test(word)) return false;                       // "aaa" não é palavra
  if(/[qwxz]{2}|[bcdfgjklmnpqrstvwxz]{4}/.test(word)) return false;   // monte de consoantes
  return true;
}

function bestGuessTerm(input){
  // Só palavras bem lidas entram no chute.
  const words = typeof input === 'string'
    ? ocrTokens(input).map(token => ({ token, conf: null }))
    : scanWords(input).filter(w => w.conf == null || w.conf >= 78);
  const useful = words
    .map(w => w.token)
    .filter(token => looksLikeWord(token) && !IGNORE_WORDS.includes(token));
  return (useful.sort((a, b) => b.length - a.length)[0] || '').trim();
}

function handleScannedText(input){
  // Aceita tanto a leitura completa quanto só o texto.
  const reading = typeof input === 'string' ? { text: input, words: [], imageHeight: 0 } : (input || { text: '' });
  const clean = String(reading.text || '').replace(/\s+/g, ' ').trim();
  const quality = readingQuality(reading);

  // Nada legível, letras embaralhadas ou objeto qualquer: a mensagem é a mesma,
  // curta e sem mostrar o rabisco que o leitor achou que era texto.
  const unreadable = clean.length < 3 || !quality.words.length
    || (quality.hasConfidence && (!quality.reliable.length || quality.strongest < OCR_CONF.best));
  if(unreadable){
    showNoMedicineFound();
    return;
  }

  const source = classifyScanSource(reading);
  const matches = matchMedicines(reading);
  if(matches.length){
    const best = matches[0];
    const clear = matches.length === 1 || best.score >= matches[1].score + 2;
    // Achou com folga: mostra o remédio e o menor preço para confirmar.
    if(clear && best.sure){
      showScannedMedicine(best.med, source);
      return;
    }
    // Empate entre apresentações do mesmo remédio (500mg, 750mg, gotas…):
    // mostra o nome e deixa a pessoa escolher a dosagem na busca.
    const tied = matches.filter(m => m.score >= best.score - 1);
    const shared = mainNameToken(best.med);
    if(!clear && shared && tied.every(m => mainNameToken(m.med) === shared)){
      // Sem a dosagem na foto, o app não tem como escolher entre 500mg e 1g.
      const doseRead = matches.some(m => m.doseMatch || m.doseConflict);
      showScannedTerm(shared, tied.map(m => m.med), source, doseRead);
      return;
    }
    // Leu pouco (uma pista só): pergunta antes de abrir a compra.
    if(clear){
      showUncertainMedicine(best.med, clean, source);
      return;
    }
    // Remédios diferentes no mesmo papel: deixa a pessoa escolher.
    showScanOutcome({
      eyebrow: `Mais de um remédio ${(SCAN_SOURCES[source] || SCAN_SOURCES.texto).where}`,
      title: 'Qual destes é o seu?',
      buttons: matches.slice(0, 3).map((m, i) => ({
        label: m.med.name, primary: i === 0, onClick: `scanResult('${m.med.id}')`,
      })),
      footer: '<button class="link-btn" onclick="captureAndRead()">Ler de novo</button>',
    });
    return;
  }

  showNoMedicineFound(bestGuessTerm(reading));
}

/* Uma mensagem só para "não achei remédio nenhum", venha de foto ruim, de
   objeto qualquer ou de um remédio fora do catálogo. Nunca mostra o texto
   cru da leitura: era de lá que saíam os "=modo..." na tela. */
function showNoMedicineFound(guess = ''){
  showScanOutcome({
    tone: 'warn',
    eyebrow: 'Leitura',
    title: 'Não consegui identificar nenhum remédio',
    body: guess
      ? `Li “${escapeHtml(guess)}”, que não está no catálogo. Quer procurar assim mesmo?`
      : 'Deixe o nome e a dosagem dentro da moldura, com o aparelho parado.',
    buttons: [
      ...(guess ? [{ label: `Procurar “${guess}”`, primary: true, onClick: `searchForTerm('${guess.replace(/'/g, "\\'")}')` }] : []),
      { label: 'Ler de novo', primary: !guess, onClick: 'captureAndRead()' },
    ],
  });
}

/* Folha de resultado: sobe por cima da câmera com o que foi lido, o menor
   preço e o caminho para a tela de compra. */

// Menor preço e em quantas farmácias o remédio tem preço. Usa a mesma lista de
// ofertas da tela de busca, para a etiqueta amarela bater com o "a partir de".
function medPriceSummary(med){
  const offers = med ? pharmacyOffers(med) : [];
  return {
    cheapest: offers.length ? offers[0].price : null,
    pharmacies: offers.length,
  };
}

// O que a busca por este texto vai mostrar: os remédios (só os que têm preço em
// alguma farmácia) e quantas farmácias aparecem no total.
function searchPreview(term){
  const meds = medsMatchingQuery(term).filter(m => pharmacyOffers(m).length);
  const pharmacies = new Set();
  meds.forEach(m => pharmacyOffers(m).forEach(o => pharmacies.add(o.id)));
  return { meds, pharmacies: pharmacies.size };
}

function countLabel(n, one, many){
  return `${n} ${n === 1 ? one : many}`;
}

function priceTagHtml(value){
  if(value == null) return '';
  const [reais, centavos] = formatBRL(value).replace(/^R\$\s*/, '').split(',');
  return `<div class="ss-price">
    <small>a partir de</small>
    <span class="price-tag"><span class="pt-cur">R$</span><span class="pt-val">${reais},${centavos}</span></span>
  </div>`;
}

function medSheetLine(med){
  const { pharmacies } = medPriceSummary(med);
  return [med.presentation, pharmacies ? `em ${countLabel(pharmacies, 'farmácia', 'farmácias')}` : '']
    .filter(Boolean).join(' · ');
}

// Resultado da leitura, numa folha branca sobre a câmera.
function showScanOutcome({ tone = 'ok', eyebrow = 'Lido na caixa', title, body = '', price = null, note = '', buttons = [], footer = '' }){
  const box = $('scan-outcome');
  if(!box) return;
  box.className = `scan-sheet ${tone}`;
  box.innerHTML = `
    <div class="ss-read"><i></i> ${escapeHtml(eyebrow)}</div>
    <div class="ss-top">
      <div class="ss-title">
        <h3>${title}</h3>
        ${body ? `<p>${body}</p>` : ''}
      </div>
      ${price != null ? priceTagHtml(price) : ''}
    </div>
    ${note ? `<p class="ss-note">${escapeHtml(note)}</p>` : ''}
    <div class="ss-actions">
      ${buttons.map(b => `<button class="${b.primary ? 'btn btn-primary' : 'btn btn-ghost'}" onclick="${b.onClick}">${escapeHtml(b.label)}</button>`).join('')}
    </div>
    ${footer ? `<p class="ss-foot">${footer}</p>` : ''}`;
  box.classList.remove('hidden');
}

// Remédio reconhecido: mostra o menor preço e leva para a comparação.
function showScannedMedicine(med, source = 'caixa'){
  const { cheapest } = medPriceSummary(med);
  showScanOutcome({
    eyebrow: scanEyebrow(source, 'Lido na caixa'),
    title: escapeHtml(med.name),
    body: escapeHtml(medSheetLine(med)),
    price: cheapest,
    buttons: [{ label: 'Ver os preços', primary: true, onClick: `scanResult('${med.id}')` }],
    footer: 'Não é este remédio? <button class="link-btn" onclick="captureAndRead()">Ler de novo</button>',
  });
}

/* Combinou, mas com uma letra errada ou uma pista só: em vez de abrir a compra
   do remédio errado, pergunta antes. */
function showUncertainMedicine(med, text, source = 'texto'){
  const { cheapest } = medPriceSummary(med);
  showScanOutcome({
    tone: 'warn',
    eyebrow: 'Leitura incerta',
    title: `${escapeHtml(med.name)}?`,
    body: `Li pouca coisa ${escapeHtml((SCAN_SOURCES[source] || SCAN_SOURCES.texto).where)}. É este remédio?`,
    price: cheapest,
    buttons: [
      { label: 'Sim, ver os preços', primary: true, onClick: `scanResult('${med.id}')` },
      { label: 'Não, ler de novo', onClick: 'captureAndRead()' },
    ],
  });
}

// Vários tamanhos do mesmo remédio: abre a busca com todos.
function showScannedTerm(term, meds, source = 'caixa', doseRead = true){
  // A etiqueta mostra o mesmo preço que vai aparecer no topo da pesquisa, e a
  // linha conta quantas apresentações e farmácias a pesquisa realmente tem.
  const preview = searchPreview(term);
  const list = preview.meds.length ? preview.meds : (meds || []);
  const cheapest = medPriceSummary(list[0]).cheapest;
  const name = term.charAt(0).toUpperCase() + term.slice(1);
  showScanOutcome({
    eyebrow: scanEyebrow(source, 'Lido na caixa'),
    title: escapeHtml(name),
    body: [
      countLabel(list.length, 'opção', 'opções'),
      preview.pharmacies ? `em ${countLabel(preview.pharmacies, 'farmácia', 'farmácias')}` : '',
    ].filter(Boolean).join(' · '),
    price: cheapest,
    note: doseRead ? '' : 'Não consegui ler a dosagem — escolha a sua na próxima tela.',
    buttons: [{ label: 'Ver os preços', primary: true, onClick: `searchForTerm('${term.replace(/'/g, "\\'")}')` }],
    footer: 'Não é este remédio? <button class="link-btn" onclick="captureAndRead()">Ler de novo</button>',
  });
}

function hideScanOutcome(){
  const box = $('scan-outcome');
  if(box){ box.classList.add('hidden'); box.innerHTML = ''; }
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
  // Espera o pop-up de boas-vindas sair antes de falar de reposição.
  setTimeout(checkRefillWarnings, 1500);
  reminderCheckInterval = setInterval(() => { checkDueReminders(); checkRefillWarnings(); }, 20000);
}

// Horário que passou faz mais de 2h (ex.: marcar "08:00" às 22h) não avisa nem
// desconta do estoque — só fica marcado como vencido.
const STALE_REMINDER_MS = 2 * 60 * 60 * 1000;

function checkDueReminders(){
  if(!state.user) return;
  const now = Date.now();
  const firedIds = [];
  const staleIds = [];
  state.reminders.forEach(r=>{
    if(r.fired) return;
    const [hh, mm] = (r.time||'00:00').split(':').map(Number);
    const at = new Date(r.year, r.month, r.day, hh, mm, 0, 0).getTime();
    if(at > now) return;
    r.fired = true;
    if(now - at > STALE_REMINDER_MS){
      staleIds.push(r.id);
      return;
    }
    firedIds.push(r.id);
    fireReminderNotification(r);
  });
  if(staleIds.length) api.markRemindersFired(staleIds, false).catch(()=>{});
  if(firedIds.length){
    // O servidor marca como avisado e desconta as doses do estoque em casa.
    api.markRemindersFired(firedIds).then(result => {
      if(!result || !result.stocks || !result.stocks.length) return;
      result.stocks.forEach(stock => {
        const idx = state.stocks.findIndex(s => s.key === stock.key);
        if(idx >= 0) state.stocks[idx] = stock; else state.stocks.push(stock);
      });
      if(state.activeTab === 'calendar') renderReminders();
      updateRemindersBadge();
      checkRefillWarnings();
    }).catch(()=>{});
    if(state.activeTab==='calendar') renderCalendar();
  }
}

function fireReminderNotification(r){
  notify('Hora do remédio', `${r.med} — ${r.time}`);
}

// Notificação do navegador; se estiver bloqueada, avisa dentro do app.
function notify(title, body){
  if('Notification' in window && Notification.permission === 'granted'){
    try{
      new Notification(title, { body, icon: 'assets/favicon.png' });
      return;
    }catch{ /* cai no aviso interno abaixo */ }
  }
  showToast(`${title}: ${body}`);
}

/* ---------------- aviso de remédio acabando ----------------
   Quem agenda um tratamento (7, 15, 30 dias) precisa comprar de novo antes
   de acabar. Nos últimos dias de lembrete o app avisa para repor: um cartão
   na aba Lembretes, um ponto na navegação e um aviso por dia. */

const REFILL_WARNING_DAYS = 5;   // começa a avisar faltando 5 dias
const REFILL_MIN_DAYS = 3;       // só vale para tratamento (não para um lembrete solto)

/* ---- estoque em casa ---- */

// Mesma regra do servidor para comparar nomes de remédio.
const medKeyOf = name => normalizeText(name).trim().replace(/\s+/g, ' ');
const stockFor = med => state.stocks.find(s => s.key === medKeyOf(med)) || null;

// Quantas doses por dia este remédio tem marcadas (1 se não houver lembrete futuro).
function dosesPerDay(med){
  const key = medKeyOf(med);
  const today = startOfToday();
  const byDay = new Map();
  for(const r of state.reminders){
    if(medKeyOf(r.med) !== key) continue;
    const date = new Date(r.year, r.month, r.day);
    if(dayDiff(today, date) < 0) continue;
    const dayKey = `${r.year}-${r.month}-${r.day}`;
    byDay.set(dayKey, (byDay.get(dayKey) || 0) + 1);
  }
  if(!byDay.size) return 1;
  const total = [...byDay.values()].reduce((sum, n) => sum + n, 0);
  return Math.max(1, Math.round(total / byDay.size));
}

// Para quantos dias dá o que tem em casa.
function stockDaysLeft(med){
  const stock = stockFor(med);
  if(!stock) return null;
  const perDay = dosesPerDay(med) * (stock.perDose || 1);
  if(perDay <= 0) return null;
  return Math.floor(stock.units / perDay);
}

const unitsPhrase = stock =>
  `${Number(stock.units) % 1 === 0 ? stock.units : Number(stock.units).toFixed(1).replace('.', ',')} ${stock.unitLabel}`;

// Guarda (ou corrige) a quantidade que a pessoa tem em casa.
async function saveStock(med, units, perDose, unitLabel){
  try{
    const { stock } = await api.saveStock({ med, units, perDose, unitLabel: unitLabel || guessUnitLabel(med) });
    const idx = state.stocks.findIndex(s => s.key === stock.key);
    if(idx >= 0) state.stocks[idx] = stock; else state.stocks.push(stock);
    return stock;
  }catch(e){
    showToast(e.message);
    return null;
  }
}

// Comprimido, dose ou ml — tirado da apresentação do remédio no catálogo.
function guessUnitLabel(med){
  const found = state.catalog.medicines.find(m => medKeyOf(m.name) === medKeyOf(med));
  const text = normalizeText(found ? `${found.name} ${found.presentation}` : med);
  if(/gota/.test(text)) return 'gotas';
  if(/ml|xarope|suspensao|solucao|frasco/.test(text)) return 'ml';
  if(/capsula/.test(text)) return 'cápsulas';
  if(/ampola|injet|dose/.test(text)) return 'doses';
  return 'comprimidos';
}

// Caixa para informar/corrigir a quantidade (botões grandes + campo numérico).
function askStock(med, { onSaved = null } = {}){
  const stock = stockFor(med);
  const label = stock ? stock.unitLabel : guessUnitLabel(med);
  const perDose = stock ? stock.perDose : 1;
  const options = [10, 20, 30, 60];
  // O modal se fecha antes do clique ser tratado: guardamos o campo para ler o valor depois.
  let input = null;
  const back = showModal(ICON_RX, `Quantos ${label} de ${escapeHtml(med)} você tem?`,
    `<span class="stock-ask">
       <span class="stock-chips">
         ${options.map(n => `<button type="button" class="rem-chip" data-units="${n}">${n}</button>`).join('')}
       </span>
       <label class="stock-field">
         <span>Outra quantidade</span>
         <input id="stock-units" type="number" min="0" max="9999" step="1" inputmode="numeric" value="${stock ? stock.units : ''}" placeholder="0">
       </label>
     </span>`,
    [
      { label: 'Salvar', primary: true, onClick: async () => {
        const value = Number(input ? input.value : NaN);
        if(!Number.isFinite(value) || value < 0 || (input && input.value === '')){
          showToast('Digite quantas unidades você tem.');
          return;
        }
        const saved = await saveStock(med, value, perDose, label);
        if(saved){
          showToast(`Anotado: ${unitsPhrase(saved)} de ${med} em casa.`);
          renderReminders();
          checkRefillWarnings();
          if(onSaved) onSaved(saved);
        }
      }},
      { label: 'Cancelar' },
    ]);
  input = back.querySelector('#stock-units');
  if(input) input.focus();
  // Os botões de atalho preenchem o campo.
  back.querySelectorAll('[data-units]').forEach(button => {
    button.onclick = () => {
      if(input) input.value = button.dataset.units;
      back.querySelectorAll('[data-units]').forEach(b => b.classList.toggle('active', b === button));
    };
  });
}

const refillKey = () => `trifarmas-refill:${state.user ? state.user.email : ''}`;
const todayStamp = () => {
  const d = new Date();
  return `${d.getFullYear()}-${d.getMonth() + 1}-${d.getDate()}`;
};

// Todos os remédios com lembrete, com o que importa para avisar sobre reposição.
function treatmentSummary(){
  const today = startOfToday();
  const byMed = new Map();
  for(const r of state.reminders){
    const date = new Date(r.year, r.month, r.day);
    const key = medKeyOf(r.med);
    const entry = byMed.get(key) || { med: r.med.trim(), lastDate: null, dosesLeft: 0, days: new Set() };
    entry.days.add(`${r.year}-${r.month}-${r.day}`);
    if(dayDiff(today, date) >= 0){
      entry.dosesLeft++;
      if(!entry.lastDate || date > entry.lastDate) entry.lastDate = date;
    }
    byMed.set(key, entry);
  }
  return [...byMed.values()].map(e => {
    const stock = stockFor(e.med);
    return {
      med: e.med,
      lastDate: e.lastDate,
      dosesLeft: e.dosesLeft,
      totalDays: e.days.size,
      scheduleDays: e.lastDate ? dayDiff(today, e.lastDate) : null,
      perDay: dosesPerDay(e.med),
      stock,
      stockDays: stockDaysLeft(e.med),
    };
  });
}

// Quem precisa de aviso: ou o estoque de casa está acabando, ou os lembretes
// estão no fim. O estoque manda, quando a pessoa informou quantos tem.
function treatmentsEndingSoon(){
  return treatmentSummary()
    .filter(t => {
      if(t.stock) return t.stockDays <= REFILL_WARNING_DAYS;
      return t.lastDate && t.totalDays >= REFILL_MIN_DAYS && t.scheduleDays <= REFILL_WARNING_DAYS;
    })
    .map(t => ({ ...t, daysLeft: t.stock ? t.stockDays : t.scheduleDays, reason: t.stock ? 'estoque' : 'agenda' }))
    .sort((a, b) => a.daysLeft - b.daysLeft);
}

// Frase principal do aviso, conforme o motivo.
function refillPhrase(item){
  if(typeof item === 'number') item = { daysLeft: item, reason: 'agenda' };
  const days = item.daysLeft;
  if(item.reason === 'estoque'){
    if(item.stock && Number(item.stock.units) <= 0) return 'o remédio acabou em casa';
    if(days <= 0) return 'o que tem em casa acaba hoje';
    if(days === 1) return 'o que tem em casa dura só mais 1 dia';
    return `o que tem em casa dura mais ${days} dias`;
  }
  if(days <= 0) return 'o último lembrete é hoje';
  if(days === 1) return 'o último lembrete é amanhã';
  return `faltam só ${days} dias de lembrete`;
}

// Detalhe do estoque: "12 comprimidos · 2 por dia".
function stockDetail(item){
  if(!item.stock) return '';
  const perDay = item.perDay * (item.stock.perDose || 1);
  return `${unitsPhrase(item.stock)} em casa · ${perDay} por dia`;
}

// Cartão no topo da aba Lembretes.
function renderRefillAlert(){
  const box = $('refill-alert');
  if(!box) return;
  const ending = treatmentsEndingSoon();
  if(!ending.length){
    box.classList.add('hidden');
    box.innerHTML = '';
    return;
  }
  box.innerHTML = `
    <div class="refill-head">
      <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M12 9v4M12 17h.01M10.3 3.9L2.8 17a2 2 0 001.7 3h15a2 2 0 001.7-3L13.7 3.9a2 2 0 00-3.4 0z"/></svg>
      <b>${ending.length === 1 ? 'Seu remédio está acabando' : 'Seus remédios estão acabando'}</b>
    </div>
    <p>Compre antes de terminar para não ficar sem tomar.</p>
    ${ending.map(item => {
      const arg = `'${escapeHtml(item.med).replace(/'/g, "\\'")}'`;
      const detail = [
        stockDetail(item),
        item.lastDate ? `lembretes até ${dayName(item.lastDate)}` : '',
      ].filter(Boolean).join(' · ');
      return `
      <div class="refill-item">
        <div class="refill-text">
          <b>${escapeHtml(item.med)}</b>
          <span><b class="refill-when">${refillPhrase(item)}</b>${detail ? ` · ${detail}` : ''}</span>
        </div>
        <div class="refill-actions">
          <button class="btn btn-primary" onclick="buyAgain(${arg})">Comprar de novo</button>
          <button class="btn-outline-sm" onclick="askStock(${arg})">${item.stock ? 'Atualizar quantidade' : 'Tenho em casa'}</button>
          ${item.scheduleDays !== null && item.scheduleDays <= REFILL_WARNING_DAYS
            ? `<button class="btn-outline-sm" onclick="extendTreatment(${arg})">Agendar mais dias</button>` : ''}
        </div>
      </div>`;
    }).join('')}`;
  box.classList.remove('hidden');
}

// Ponto na navegação (aba Lembretes), igual ao dos pedidos.
function updateRemindersBadge(){
  const count = treatmentsEndingSoon().length;
  document.querySelectorAll('[data-tab="calendar"] .nav-badge, [data-tab="calendar"] .bn-dot').forEach(el => el.remove());
  if(!count) return;
  const sideBtn = document.querySelector('.nav-item[data-tab="calendar"]');
  if(sideBtn) sideBtn.insertAdjacentHTML('beforeend', `<span class="nav-badge">${count}</span>`);
  const bnBtn = document.querySelector('.bn-item[data-tab="calendar"]');
  if(bnBtn) bnBtn.insertAdjacentHTML('beforeend', '<span class="bn-dot"></span>');
}

// Avisa uma vez por dia para cada remédio (notificação + aviso na tela).
function checkRefillWarnings(){
  if(!state.user) return;
  updateRemindersBadge();
  const seen = storage.get(refillKey()) || {};
  const today = todayStamp();
  const pending = treatmentsEndingSoon().filter(item => seen[item.med.toLowerCase()] !== today);
  if(!pending.length) return;

  pending.forEach(item => { seen[item.med.toLowerCase()] = today; });
  storage.set(refillKey(), seen);
  pending.forEach(item => notify('Remédio acabando', `${item.med}: ${refillPhrase(item)}. Reponha para não ficar sem.`));

  const first = pending[0];
  const others = pending.length - 1;
  showModal(ICON_RX, 'Está na hora de repor',
    `<b>${escapeHtml(first.med)}</b>: ${refillPhrase(first)}${first.stock ? ` (${unitsPhrase(first.stock)} em casa)` : (first.lastDate ? ` (termina ${dayName(first.lastDate)})` : '')}.` +
    (others > 0 ? ` Outro${others > 1 ? 's' : ''} ${others} remédio${others > 1 ? 's' : ''} também ${others > 1 ? 'estão' : 'está'} acabando.` : '') +
    ' Quer comparar o preço e comprar agora?',
    [
      { label: 'Comprar de novo', primary: true, onClick: () => buyAgain(first.med) },
      { label: 'Ver meus lembretes', onClick: () => switchTab('calendar') },
      { label: 'Agora não' },
    ]);
}

// Leva para a busca já procurando o remédio que está acabando.
function buyAgain(med){
  switchTab('home');
  const input = $('search-input');
  input.value = med;
  onSearchInput();
  setTimeout(() => { $('results-wrap').scrollIntoView({ behavior: 'smooth', block: 'start' }); }, 120);
}

// Continua o tratamento: abre o formulário já preenchido, a partir do dia seguinte ao último.
function extendTreatment(med){
  const item = treatmentsEndingSoon().find(t => t.med.toLowerCase() === med.toLowerCase());
  switchTab('calendar');
  $('rem-med').value = med;
  reminderForm.date = addDays(item ? item.lastDate : startOfToday(), 1);
  reminderForm.repeatDays = 7;
  renderReminders();
  $('rem-med').scrollIntoView({ behavior: 'smooth', block: 'center' });
  showToast('Escolha o horário e confirme para continuar o tratamento.');
}

/* ---------------- tela de lembretes ----------------
   Pensada para quem não tem intimidade com celular: três perguntas curtas,
   botões grandes, horários e dias prontos para tocar, e um resumo em
   português antes de confirmar. Quem toma o remédio todo dia cria todos os
   lembretes de uma vez (7, 15 ou 30 dias). */

const TIME_PRESETS = [
  { label: 'Manhã',  hint: '08:00', time: '08:00' },
  { label: 'Almoço', hint: '12:00', time: '12:00' },
  { label: 'Tarde',  hint: '18:00', time: '18:00' },
  { label: 'Noite',  hint: '22:00', time: '22:00' },
];
const REPEAT_OPTIONS = [
  { label: 'Só este dia', days: 1 },
  { label: '7 dias',      days: 7 },
  { label: '15 dias',     days: 15 },
  { label: '30 dias',     days: 30 },
];

const UNIT_PRESETS = [10, 20, 30, 60];
const PER_DOSE_OPTIONS = [
  { label: '1 por vez', value: 1 },
  { label: '2 por vez', value: 2 },
  { label: '3 por vez', value: 3 },
];

const reminderForm = {
  time: '08:00', date: null, repeatDays: 1, calendarOpen: false, saving: false,
  units: null,      // quantidade em casa informada no passo 4 (null = não informou)
  perDose: 1,
};

const startOfToday = () => { const d = new Date(); d.setHours(0,0,0,0); return d; };
const addDays = (date, days) => { const d = new Date(date); d.setDate(d.getDate() + days); d.setHours(0,0,0,0); return d; };
const dayDiff = (from, to) => Math.round((addDays(to,0) - addDays(from,0)) / 86400000);
const timeToMinutes = time => Number(time.slice(0,2)) * 60 + Number(time.slice(3,5));
const minutesToTime = minutes => {
  const total = ((minutes % 1440) + 1440) % 1440;
  return `${String(Math.floor(total/60)).padStart(2,'0')}:${String(total%60).padStart(2,'0')}`;
};
const periodOfDay = time => {
  const hour = Number(time.slice(0,2));
  if(hour < 12) return 'da manhã';
  if(hour < 18) return 'da tarde';
  return 'da noite';
};
function dayName(date){
  const diff = dayDiff(startOfToday(), date);
  if(diff === 0) return 'hoje';
  if(diff === 1) return 'amanhã';
  return `${date.getDate()} de ${MONTHS[date.getMonth()].toLowerCase()}`;
}

/* ---- escolhas do formulário ---- */

function setReminderMed(name){
  $('rem-med').value = name;
  closeMedSuggestions();
  renderReminderChips();
  renderReminderSummary();
}
function onReminderMedInput(){
  openMedSuggestions();
  renderReminderChips();
  renderReminderSummary();
}

/* ---- sugestões enquanto digita o remédio ----
   Uma lista curta embaixo do campo, como a barra de busca do navegador:
   poucas opções para não tomar a tela do celular. */
const MED_SUGGEST_MAX = 4;   // lista curta: não pode tomar a tela do celular
let medSuggestIndex = -1;
let medSuggestItems = [];

function medSuggestions(typed){
  const query = typed.trim();
  if(query.length >= 2) return medsMatchingQuery(query).slice(0, MED_SUGGEST_MAX);
  // Campo vazio: oferece o que a pessoa já comprou e, depois, os mais procurados.
  const bought = [...new Set(state.orders.flatMap(o => o.items.map(i => i.name)))];
  const recent = bought.map(name => state.catalog.medicines.find(m => m.name === name)).filter(Boolean);
  const list = [...recent, ...state.catalog.medicines.filter(m => !recent.includes(m))];
  return list.slice(0, 4);
}

function openMedSuggestions(){
  const input = $('rem-med'), box = $('rem-med-suggest');
  if(!input || !box) return;
  const typed = input.value;
  medSuggestItems = medSuggestions(typed);
  medSuggestIndex = -1;
  if(!medSuggestItems.length){ closeMedSuggestions(); return; }
  box.innerHTML = medSuggestItems.map((med, i) => `
    <button type="button" class="rem-suggest-item" role="option" data-med="${escapeHtml(med.name)}" data-index="${i}">
      <span class="rs-name">${escapeHtml(med.name)}</span>
      ${med.presentation ? `<span class="rs-sub">${escapeHtml(med.presentation)}</span>` : ''}
    </button>`).join('');
  box.classList.remove('hidden');
  input.setAttribute('aria-expanded', 'true');
}

function closeMedSuggestions(delayed = false){
  const close = () => {
    const box = $('rem-med-suggest');
    if(box) box.classList.add('hidden');
    const input = $('rem-med');
    if(input) input.setAttribute('aria-expanded', 'false');
    medSuggestIndex = -1;
  };
  // No clique, o blur vem antes: espera um instante para a escolha valer.
  if(delayed) setTimeout(close, 160);
  else close();
}

function highlightMedSuggestion(index){
  const box = $('rem-med-suggest');
  if(!box || !medSuggestItems.length) return;
  const total = medSuggestItems.length;
  medSuggestIndex = (index + total) % total;
  [...box.querySelectorAll('.rem-suggest-item')].forEach((el, i) =>
    el.classList.toggle('active', i === medSuggestIndex));
}

function onReminderMedKey(event){
  const open = !$('rem-med-suggest').classList.contains('hidden');
  if(event.key === 'ArrowDown' || event.key === 'ArrowUp'){
    event.preventDefault();
    if(!open) return openMedSuggestions();
    highlightMedSuggestion(medSuggestIndex + (event.key === 'ArrowDown' ? 1 : -1));
    return;
  }
  if(event.key === 'Escape'){ closeMedSuggestions(); return; }
  if(event.key === 'Enter'){
    if(open && medSuggestIndex >= 0){
      event.preventDefault();
      setReminderMed(medSuggestItems[medSuggestIndex].name);
      return;
    }
    closeMedSuggestions();
    addReminder();
  }
}
function setReminderTime(time){
  if(!/^\d{2}:\d{2}$/.test(time)) return;
  reminderForm.time = time;
  $('rem-time').value = time;
  renderReminderTime();
  renderReminderSummary();
}
function shiftReminderTime(minutes){
  setReminderTime(minutesToTime(timeToMinutes(reminderForm.time) + minutes));
}
function setReminderDate(date){
  reminderForm.date = date;
  reminderForm.calendarOpen = false;
  state.calMonth = date.getMonth();
  state.calYear = date.getFullYear();
  state.calSelectedDay = date.getDate();
  renderReminders();
}
function toggleReminderCalendar(){
  reminderForm.calendarOpen = !reminderForm.calendarOpen;
  renderReminders();
}
// Passo 4: quantas unidades a pessoa tem em casa (e quantas toma por vez).
function setReminderUnits(value, fromInput = false){
  const units = value === '' || value === null ? null : Number(value);
  reminderForm.units = Number.isFinite(units) && units >= 0 ? units : null;
  if(!fromInput){
    const input = $('rem-units');
    if(input) input.value = reminderForm.units === null ? '' : reminderForm.units;
  }
  renderReminderChips();
  renderReminderSummary();
}

function setReminderPerDose(perDose){
  reminderForm.perDose = perDose;
  renderReminderChips();
  renderReminderSummary();
}

function setReminderRepeat(days){
  reminderForm.repeatDays = days;
  renderReminderChips();
  renderReminderSummary();
}

/* ---- desenho da tela ---- */

function renderReminders(){
  renderRefillAlert();
  updateRemindersBadge();
  if(!reminderForm.date) reminderForm.date = startOfToday();
  renderReminderTime();
  renderReminderChips();
  $('rem-calendar').classList.toggle('hidden', !reminderForm.calendarOpen);
  if(reminderForm.calendarOpen) renderCalendar();
  renderReminderSummary();
  renderReminderList();
}

function renderReminderTime(){
  $('rem-time-label').textContent = reminderForm.time;
  $('rem-time-period').textContent = periodOfDay(reminderForm.time);
  $('rem-time').value = reminderForm.time;
}

const chip = (label, active, attr, hint = '') =>
  `<button class="rem-chip ${active ? 'active' : ''}" ${attr}>${escapeHtml(label)}${hint ? `<small>${escapeHtml(hint)}</small>` : ''}</button>`;

function renderReminderChips(){
  $('rem-time-chips').innerHTML = TIME_PRESETS
    .map(preset => chip(preset.label, reminderForm.time === preset.time, `data-time="${preset.time}"`, preset.hint))
    .join('');

  const chosen = reminderForm.date || startOfToday();
  const diff = dayDiff(startOfToday(), chosen);
  $('rem-day-chips').innerHTML = [
    chip('Hoje', diff === 0, 'data-day="0"'),
    chip('Amanhã', diff === 1, 'data-day="1"'),
    chip(diff > 1 ? dayName(chosen) : 'Outro dia', diff > 1, 'data-day="pick"'),
  ].join('');

  $('rem-units-chips').innerHTML = UNIT_PRESETS
    .map(n => chip(String(n), reminderForm.units === n, `data-units="${n}"`))
    .join('') + chip('Não sei agora', reminderForm.units === null, 'data-units="nao-sei"');
  $('rem-perdose-chips').innerHTML = PER_DOSE_OPTIONS
    .map(option => chip(option.label, reminderForm.perDose === option.value, `data-perdose="${option.value}"`))
    .join('');

  $('rem-repeat-chips').innerHTML = REPEAT_OPTIONS
    .map(option => chip(option.label, reminderForm.repeatDays === option.days, `data-repeat="${option.days}"`))
    .join('');
}

function renderReminderSummary(){
  const med = $('rem-med').value.trim();
  const start = reminderForm.date || startOfToday();
  const days = reminderForm.repeatDays;
  const name = med ? `<b>${escapeHtml(med)}</b>` : 'seu remédio';
  const when = days === 1
    ? `${dayName(start)}`
    : `todos os dias, de ${dayName(start)} até ${dayName(addDays(start, days - 1))}`;
  // Com a quantidade informada, já mostra para quantos dias dá o que tem em casa.
  let stockLine = '';
  if(reminderForm.units !== null){
    const label = guessUnitLabel(med || 'remédio');
    const perDay = reminderForm.perDose;   // 1 lembrete por dia neste formulário
    const lasts = Math.floor(reminderForm.units / Math.max(1, perDay));
    stockLine = ` Você tem <b>${reminderForm.units} ${label}</b> em casa: dá para <b>${lasts} ${lasts === 1 ? 'dia' : 'dias'}</b>`
      + (lasts <= REFILL_WARNING_DAYS ? ' — vamos avisar para comprar mais.' : ', e avisamos quando estiver acabando.');
  }
  $('rem-summary').innerHTML =
    `Vamos avisar você de tomar ${name} às <b>${reminderForm.time}</b> ${periodOfDay(reminderForm.time)}, ${when}.${stockLine}`;
  $('rem-save').textContent = days === 1 ? 'Criar lembrete' : `Criar ${days} lembretes`;
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
  const chosen = reminderForm.date || startOfToday();
  let html = DOW.map(d=>`<div class="cal-dow">${d}</div>`).join('');
  for(let i=0;i<firstDow;i++) html += `<div class="cal-day muted"></div>`;
  for(let d=1; d<=daysInMonth; d++){
    const hasRem = state.reminders.some(r=> r.day===d && r.month===state.calMonth && r.year===state.calYear);
    const sel = chosen.getDate()===d && chosen.getMonth()===state.calMonth && chosen.getFullYear()===state.calYear;
    html += `<button class="cal-day ${sel?'selected':''} ${hasRem?'has-rem':''}" onclick="calSelectDay(${d})">${d}</button>`;
  }
  $('cal-grid').innerHTML = html;
}
function calSelectDay(d){
  setReminderDate(new Date(state.calYear, state.calMonth, d));
}

/* ---- criar e apagar ---- */

async function addReminder(){
  const med = $('rem-med').value.trim();
  if(!med){
    showToast('Escreva o nome do remédio no passo 1.');
    $('rem-med').focus();
    return;
  }
  if(reminderForm.saving) return;
  requestNotificationPermission();

  const button = $('rem-save');
  const total = reminderForm.repeatDays;
  const start = reminderForm.date || startOfToday();
  reminderForm.saving = true;
  button.disabled = true;

  let created = 0;
  for(let i = 0; i < total; i++){
    const date = addDays(start, i);
    button.textContent = total > 1 ? `Criando… ${i + 1} de ${total}` : 'Criando…';
    try{
      const reminder = await api.addReminder({
        med, time: reminderForm.time,
        day: date.getDate(), month: date.getMonth(), year: date.getFullYear(),
      });
      state.reminders.push(reminder);
      created++;
    }catch(e){
      showToast(e.message);
      break;
    }
  }

  // Guarda quantas unidades a pessoa disse ter em casa (passo 4).
  if(created && reminderForm.units !== null){
    await saveStock(med, reminderForm.units, reminderForm.perDose);
    reminderForm.units = null;
    const unitsInput = $('rem-units');
    if(unitsInput) unitsInput.value = '';
  }

  reminderForm.saving = false;
  button.disabled = false;
  if(created){
    $('rem-med').value = '';
    // Quem acabou de agendar não precisa do pop-up de reposição agora.
    const seen = storage.get(refillKey()) || {};
    seen[med.trim().toLowerCase()] = todayStamp();
    storage.set(refillKey(), seen);
    showToast(created === 1
      ? `Pronto! Vamos avisar às ${reminderForm.time}.`
      : `Pronto! ${created} lembretes criados às ${reminderForm.time}.`);
  }
  renderReminders();
  checkDueReminders();
}

async function removeReminder(id){
  try{
    await api.removeReminder(id);
    state.reminders = state.reminders.filter(r=>r.id!==id);
    renderReminders();
  }catch(e){
    showToast(e.message);
  }
}

// Apagar um lembrete repetido tira todos os dias de uma vez (com confirmação).
function removeReminderGroup(ids){
  const first = state.reminders.find(r => r.id === ids[0]);
  if(!first) return;
  if(ids.length === 1){ removeReminder(ids[0]); return; }
  showModal(ICON_RX, 'Apagar estes lembretes?',
    `Você vai apagar os <b>${ids.length} lembretes</b> de ${escapeHtml(first.med)} às ${first.time}.`,
    [
      { label: `Apagar os ${ids.length}`, primary: true, onClick: async () => {
        for(const id of ids){
          try{ await api.removeReminder(id); }catch{ /* segue apagando os outros */ }
        }
        state.reminders = state.reminders.filter(r => !ids.includes(r.id));
        renderReminders();
        showToast('Lembretes apagados.');
      }},
      { label: 'Cancelar' },
    ]);
}

/* ---- lista ---- */

// Junta dias seguidos do mesmo remédio no mesmo horário num item só.
function groupedReminders(){
  const sorted = [...state.reminders].sort((a, b) => {
    const dateA = new Date(a.year, a.month, a.day);
    const dateB = new Date(b.year, b.month, b.day);
    return dateA - dateB || a.time.localeCompare(b.time);
  });
  const groups = [];
  for(const reminder of sorted){
    const date = new Date(reminder.year, reminder.month, reminder.day);
    const last = groups[groups.length - 1];
    const follows = last && last.med === reminder.med && last.time === reminder.time
      && dayDiff(last.dates[last.dates.length - 1], date) === 1;
    if(follows){
      last.dates.push(date);
      last.ids.push(reminder.id);
      last.pending = last.pending || !reminder.fired;
    } else {
      groups.push({ med: reminder.med, time: reminder.time, dates: [date], ids: [reminder.id], pending: !reminder.fired });
    }
  }
  // os que ainda vão acontecer primeiro
  return groups.sort((a, b) => Number(b.pending) - Number(a.pending) || a.dates[0] - b.dates[0]);
}

function renderReminderList(){
  const el = $('rem-list');
  const groups = groupedReminders();
  if(!groups.length){
    el.innerHTML = `<div class="empty-inline">Você ainda não tem lembretes. Crie o primeiro aí em cima — são três toques.</div>`;
    return;
  }
  el.innerHTML = groups.map(group => {
    const first = group.dates[0];
    const last = group.dates[group.dates.length - 1];
    const when = group.dates.length === 1
      ? `${dayName(first).charAt(0).toUpperCase()}${dayName(first).slice(1)}`
      : `De ${first.getDate()} a ${last.getDate()} de ${MONTHS[last.getMonth()].toLowerCase()} · ${group.dates.length} dias`;
    const stock = stockFor(group.med);
    const daysLeft = stockDaysLeft(group.med);
    const arg = `'${escapeHtml(group.med).replace(/'/g, "\\'")}'`;
    const stockLine = stock
      ? `<button class="rem-stock ${daysLeft !== null && daysLeft <= REFILL_WARNING_DAYS ? 'low' : ''}" onclick="askStock(${arg})">
           ${unitsPhrase(stock)} em casa${daysLeft !== null ? ` · dá para ${daysLeft} ${daysLeft === 1 ? 'dia' : 'dias'}` : ''}
         </button>`
      : `<button class="rem-stock add" onclick="askStock(${arg})">Informar quantos tem em casa</button>`;
    return `
    <div class="rem-item ${group.pending ? '' : 'done'}">
      <div class="rem-time">${group.time}</div>
      <div class="rem-info">
        <p>${escapeHtml(group.med)}</p>
        <span>${when}${group.pending ? '' : ' · já avisado'}</span>
        ${stockLine}
      </div>
      <button class="rem-del" onclick="removeReminderGroup([${group.ids.join(',')}])" aria-label="Apagar lembrete">
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M3 6h18M8 6V4a1 1 0 011-1h6a1 1 0 011 1v2m2 0v14a1 1 0 01-1 1H7a1 1 0 01-1-1V6h12z"/></svg>
      </button>
    </div>`;
  }).join('');
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

let googleResizeTimer = null;
window.addEventListener('resize', ()=>{
  clearTimeout(googleResizeTimer);
  googleResizeTimer = setTimeout(()=>{ if(!state.user) renderGoogleButtons(); }, 250);
});

// Os botões de remédio/horário/dia/repetição são desenhados por JS: um único
// ouvinte por grupo cuida dos toques.
function bindReminderChips(){
  $('rem-med-suggest').addEventListener('mousedown', event => {
    const button = event.target.closest('[data-med]');
    if(!button) return;
    event.preventDefault();          // não deixa o campo perder o foco antes do clique
    setReminderMed(button.dataset.med);
  });
  $('rem-time-chips').addEventListener('click', event => {
    const button = event.target.closest('[data-time]');
    if(button) setReminderTime(button.dataset.time);
  });
  $('rem-day-chips').addEventListener('click', event => {
    const button = event.target.closest('[data-day]');
    if(!button) return;
    if(button.dataset.day === 'pick') toggleReminderCalendar();
    else setReminderDate(addDays(startOfToday(), Number(button.dataset.day)));
  });
  $('rem-repeat-chips').addEventListener('click', event => {
    const button = event.target.closest('[data-repeat]');
    if(button) setReminderRepeat(Number(button.dataset.repeat));
  });
  $('rem-units-chips').addEventListener('click', event => {
    const button = event.target.closest('[data-units]');
    if(button) setReminderUnits(button.dataset.units === 'nao-sei' ? null : Number(button.dataset.units));
  });
  $('rem-perdose-chips').addEventListener('click', event => {
    const button = event.target.closest('[data-perdose]');
    if(button) setReminderPerDose(Number(button.dataset.perdose));
  });
}

function initApp(){
  applyLogo();
  buildNav();
  setupPasswordToggles();
  bindReminderChips();
  applyTheme(storage.get('trifarmas-theme') === 'dark' ? 'dark' : 'light');
  applyFontScale(Number(storage.get('trifarmas-font-scale')) || 1);
  showView('login');
  initGoogleSignIn();

  // 1) catálogo guardado no aparelho entra na hora; 2) o servidor é acordado
  // enquanto a pessoa digita a senha; 3) a versão nova do catálogo chega depois.
  const hadCache = loadCachedCatalog();
  api.warmUp();
  loadCatalog({ silent: hadCache });
}
