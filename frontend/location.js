/* =============================================================
   Localização e mapa
   - Localização atual do aparelho (GPS / Wi-Fi), com nova tentativa
   - Busca por endereço ou CEP
   - Farmácias reais ao redor no mapa (Leaflet + OpenStreetMap)
   - Distância real até a loja mais próxima de cada rede parceira
   As buscas de farmácias e endereços passam pela API do Trifarmas (Render),
   que tenta vários servidores de mapas e guarda os resultados em cache.
   ============================================================= */

const LOCATION_STORAGE_KEY = 'trifarmas-location';
const LOCATION_MAX_AGE_MS = 6 * 60 * 60 * 1000; // reaproveita a última localização por 6h
const DEFAULT_CENTER = { lat: -23.5505, lng: -46.6333 }; // São Paulo (usado só no mapa, sem localização)

// Redes conhecidas: palavras do nome/marca no OpenStreetMap → site (para o logo).
// "partner" liga a loja à farmácia parceira do catálogo, para calcular a distância real.
const PHARMACY_BRANDS = [
  { keys: ['droga raia', 'drogaraia', 'raia'],               domain: 'drogaraia.com.br',          partner: 'p1' },
  { keys: ['drogasil'],                                       domain: 'drogasil.com.br',           partner: 'p2' },
  { keys: ['pacheco'],                                        domain: 'drogariaspacheco.com.br',   partner: 'p3' },
  { keys: ['pague menos', 'paguemenos'],                      domain: 'paguemenos.com.br',         partner: 'p4' },
  { keys: ['ultrafarma'],                                     domain: 'ultrafarma.com.br',         partner: 'p5' },
  { keys: ['panvel'],                                         domain: 'panvel.com',                partner: 'p6' },
  { keys: ['drogaria sao paulo', 'drogarias sao paulo'],      domain: 'drogariasaopaulo.com.br' },
  { keys: ['onofre'],                                         domain: 'onofre.com.br' },
  { keys: ['ultra popular'],                                  domain: 'ultrapopular.com.br' },
  { keys: ['nissei'],                                         domain: 'farmaciasnissei.com.br' },
  { keys: ['extrafarma'],                                     domain: 'extrafarma.com.br' },
  { keys: ['venancio'],                                       domain: 'drogariavenancio.com.br' },
  { keys: ['araujo'],                                         domain: 'araujo.com.br' },
  { keys: ['sao joao'],                                       domain: 'saojoaofarmacias.com.br' },
  { keys: ['drogal'],                                         domain: 'drogal.com.br' },
  { keys: ['farmacia indiana', 'drogaria indiana'],           domain: 'farmaciaindiana.com.br' },
  { keys: ['catarinense'],                                    domain: 'drogariacatarinense.com.br' },
  { keys: ['drogaria rosario', 'drogarias rosario'],          domain: 'drogariarosario.com.br' },
  { keys: ['drogarias globo', 'drogaria globo'],              domain: 'drogariasglobo.com.br' },
  { keys: ['poupafarma'],                                     domain: 'poupafarma.com.br' },
  { keys: ['big ben'],                                        domain: 'bigben.com.br' },
  { keys: ['farmacias associadas'],                           domain: 'farmaciasassociadas.com.br' },
];
// Palavra inteira: "raia" não pode casar com "Praia".
const BRAND_MATCHERS = PHARMACY_BRANDS.map(b => ({
  ...b,
  re: new RegExp(`(^|[^a-z0-9])(${b.keys.map(k => k.replace(/ /g, '\\s*')).join('|')})($|[^a-z0-9])`),
}));

function brandOf(p){
  const text = normalizeText(`${p.name || ''} ${p.brand || ''}`);
  return BRAND_MATCHERS.find(b => b.re.test(text)) || null;
}

function domainFromWebsite(url){
  try{ return new URL(/^https?:/i.test(url) ? url : `https://${url}`).hostname.replace(/^www\./, ''); }
  catch{ return null; }
}

const loc = {
  coords: null,          // { lat, lng }
  accuracy: null,        // metros (GPS)
  source: null,          // 'gps' | 'address'
  address: '',
  radiusKm: 4,
  pharmacies: [],        // farmácias reais ao redor, ordenadas por distância
  pharmaciesStatus: 'idle', // idle | loading | done | error
  pharmaciesError: '',
  gpsError: '',
  manualAddress: false,  // a pessoa digitou um endereço nesta visita
  chainMatches: {},      // { p1: { km, street, lat, lng }, ... }
  requestId: 0,
  locating: false,
};

let leafletMap = null;
let mapLayers = null;
const pharmacyMarkers = new Map();

/* ---------------- utilidades ---------------- */

function haversineKm(a, b){
  const R = 6371;
  const toRad = d => d * Math.PI / 180;
  const dLat = toRad(b.lat - a.lat);
  const dLng = toRad(b.lng - a.lng);
  const h = Math.sin(dLat/2)**2 + Math.cos(toRad(a.lat)) * Math.cos(toRad(b.lat)) * Math.sin(dLng/2)**2;
  return 2 * R * Math.asin(Math.sqrt(h));
}

function setLocStatus(text, tone = ''){
  const el = $('loc-status');
  if(!el) return;
  el.className = `loc-status ${tone}`;
  el.innerHTML = text;
}

const radiusLabel = () => `${String(loc.radiusKm).replace('.', ',')} km`;
const directionsUrl = (lat, lng) => `https://www.google.com/maps/dir/?api=1&destination=${lat},${lng}`;
const googleMapsSearchUrl = c => `https://www.google.com/maps/search/farm%C3%A1cia/@${c.lat},${c.lng},15z`;

/* Distância exibida nos cards de busca, carrinho e pagamento. */
function pharmacyDistance(pharm){
  if(!loc.coords) return { km: pharm.dist, label: 'Ative a localização para ver a distância' };
  const match = loc.chainMatches[pharm.id];
  if(match){
    const dist = loc.source === 'ip' ? `~${formatKm(match.km)} (aprox.)` : `${formatKm(match.km)} de você`;
    return { km: match.km, label: `${dist}${match.street ? ' · ' + escapeHtml(match.street) : ''}`, match };
  }
  if(loc.pharmaciesStatus === 'loading') return { km: Infinity, label: 'Calculando distância…' };
  if(loc.pharmaciesStatus === 'error') return { km: Infinity, label: 'Distância indisponível no momento' };
  return { km: Infinity, label: `Nenhuma loja num raio de ${radiusLabel()}` };
}

/* ---------------- localização do aparelho ---------------- */

// Metas de precisão (em metros) e tempos de espera do GPS.
const GPS = {
  exactM: 30,            // "na porta de casa": para de procurar ao chegar nisso
  goodM: 100,            // já serve para a entrega
  firstTimeoutMs: 30000, // o GPS do celular pode levar ~20 s para a primeira leitura exata
  networkTimeoutMs: 12000,
  refineMs: 45000,       // continua melhorando em segundo plano depois da 1ª leitura
};

let gpsWatchId = null;
function stopGpsWatch(){
  if(gpsWatchId !== null){ navigator.geolocation.clearWatch(gpsWatchId); gpsWatchId = null; }
}

// Acompanha o GPS e entrega CADA leitura melhor que a anterior (onReading), em vez de
// esperar a melhor de todas: o mapa já mostra a posição e vai se ajustando sozinho.
// Só termina quando chega na precisão pedida, quando o tempo acaba ou quando dá erro.
function trackPosition({ highAccuracy, timeoutMs, stopAtM, onReading }){
  return new Promise((resolve, reject)=>{
    let best = null, lastError = null, done = false, graceTimer = null;
    const finish = err => {
      if(done) return;
      done = true;
      clearTimeout(timer); clearTimeout(graceTimer);
      stopGpsWatch();
      best ? resolve(best) : reject(err || lastError || { code: 3 });
    };
    const timer = setTimeout(()=> finish(), timeoutMs);
    stopGpsWatch();
    gpsWatchId = navigator.geolocation.watchPosition(pos=>{
      clearTimeout(graceTimer);
      graceTimer = null;
      if(best && pos.coords.accuracy >= best.coords.accuracy) return; // ignora leituras piores
      best = pos;
      onReading(pos);
      if(pos.coords.accuracy <= stopAtM) finish();
    }, err=>{
      lastError = err;
      if(best) return finish();       // já temos uma posição: fica com ela
      if(err.code === 1) return finish(err); // permissão negada: não adianta insistir
      // "Posição indisponível" pode ser o GPS esquentando: espera um pouco antes de desistir
      // (sem isso, computador sem GPS ficaria 30 s travado antes de tentar pela rede).
      if(!graceTimer) graceTimer = setTimeout(()=> finish(), 8000);
    }, { enableHighAccuracy: highAccuracy, maximumAge: 0, timeout: timeoutMs });
  });
}

// Depois da primeira leitura, continua ouvindo o GPS por alguns segundos:
// é assim que a precisão cai de "~800 m" para "~10 m" sem a pessoa fazer nada.
let refineWatchId = null;
function refineGpsInBackground(){
  stopRefining();
  if(!loc.accuracy || loc.accuracy <= GPS.exactM) return;
  const stopAt = Date.now() + GPS.refineMs;
  refineWatchId = navigator.geolocation.watchPosition(pos=>{
    if(Date.now() > stopAt || loc.source !== 'gps') return stopRefining();
    // Vale qualquer leitura 15% melhor que a atual (antes exigia metade: quase nunca acontecia).
    if(pos.coords.accuracy < loc.accuracy * 0.85){
      setLocation({ lat: pos.coords.latitude, lng: pos.coords.longitude, accuracy: pos.coords.accuracy, source: 'gps' });
      if(pos.coords.accuracy <= GPS.exactM) stopRefining();
    }
  }, ()=> stopRefining(), { enableHighAccuracy: true, maximumAge: 0, timeout: GPS.refineMs });
  setTimeout(stopRefining, GPS.refineMs + 1000);
}
function stopRefining(){
  if(refineWatchId !== null){ navigator.geolocation.clearWatch(refineWatchId); refineWatchId = null; }
}

async function permissionState(){
  try{
    if(navigator.permissions) return (await navigator.permissions.query({ name: 'geolocation' })).state;
  }catch{ /* navegador sem Permissions API */ }
  return 'prompt';
}

// Motivo de o GPS não ter funcionado, no idioma de quem está usando o app.
function geolocationErrorMessage(err){
  if(!window.isSecureContext){
    return 'O navegador só libera a localização exata em endereços <b>https</b> (ou em <b>localhost</b>). ' +
           'Abrindo o app pelo número de IP da máquina (http://192.168…), o Chrome bloqueia o GPS sem nem perguntar.';
  }
  if(err && err.code === 1) return 'A localização está bloqueada para este site. Toque no <b>cadeado</b> ao lado do endereço → Permissões → Localização → Permitir.';
  if(err && err.code === 3) return 'O GPS demorou demais para responder. Em lugar fechado o sinal pode não chegar: tente perto de uma janela ou na rua.';
  if(/Android/.test(navigator.userAgent)) return 'O aparelho não informou a localização. Puxe a barra de cima e veja se a <b>Localização</b> do Android está ligada.';
  if(/iPhone|iPad/.test(navigator.userAgent)) return 'O aparelho não informou a localização. Veja em <b>Ajustes → Privacidade → Serviços de Localização</b> se o seu navegador tem permissão.';
  if(/Windows/.test(navigator.userAgent)) return 'O computador não informou a localização. Ative em <b>Configurações do Windows → Privacidade e segurança → Localização</b> (computador sem GPS costuma errar bastante).';
  if(/Mac OS X/.test(navigator.userAgent)) return 'O computador não informou a localização. Ative em <b>Ajustes do Sistema → Privacidade e Segurança → Serviços de Localização</b>.';
  return 'O aparelho não informou a localização. Verifique se a localização (GPS) está ligada.';
}

// Linha técnica embaixo do aviso: ajuda a entender por que falhou.
function locationFailureDetails(err){
  const codes = { 1: 'permissão negada', 2: 'posição indisponível', 3: 'tempo esgotado' };
  const parts = [];
  if(err && err.code) parts.push(`erro ${err.code} (${codes[err.code] || 'desconhecido'})`);
  if(err && err.message) parts.push(escapeHtml(String(err.message).slice(0, 80)));
  parts.push(window.isSecureContext ? 'conexão segura' : 'conexão sem https');
  return parts.join(' · ');
}

// Aviso de GPS indisponível, com o que fazer e um botão para tentar de novo.
function showGpsProblem(err){
  setLocStatus(`<span>${loc.gpsError}</span>
    <span class="loc-tip">Enquanto isso, digite seu <b>endereço ou CEP</b> no campo acima — a entrega usa esse endereço.</span>
    <span class="loc-detail">${locationFailureDetails(err)}</span>
    <button class="btn-outline-sm" onclick="requestMapLocation(true)">Tentar o GPS de novo</button>`, 'warn');
}

async function requestMapLocation(userInitiated = false){
  if(loc.locating) return;
  if(!('geolocation' in navigator)){
    loc.gpsError = 'Seu navegador não oferece localização.';
    return useApproximateLocation({ code: 2, message: 'navegador sem geolocalização' });
  }
  // Sem https o navegador nem pergunta: explica em vez de insistir.
  if(!window.isSecureContext){
    loc.gpsError = geolocationErrorMessage(null);
    showGpsProblem({ code: 1, message: 'contexto não seguro' });
    if(!loc.coords) await useApproximateLocation();
    return;
  }
  // Automático (sem clique): se o navegador já informa bloqueio, nem tenta o GPS.
  // Com clique no botão, tenta sempre — alguns navegadores informam "bloqueado" sem estar.
  if(!userInitiated && await permissionState() === 'denied'){
    loc.gpsError = geolocationErrorMessage({ code: 1 });
    return useApproximateLocation({ code: 1, message: 'bloqueada nas permissões do site' });
  }

  loc.locating = true;
  setGpsButtonBusy(true);
  stopRefining();
  setLocStatus('<span class="spinner"></span> Procurando sua localização… se o navegador perguntar, toque em <b>Permitir</b>.');

  let got = false;
  // Cada leitura melhor já entra no mapa, com a precisão à vista.
  const apply = async pos => {
    got = true;
    loc.gpsError = '';
    $('loc-input').value = '';
    loc.manualAddress = false;
    await setLocation({
      lat: pos.coords.latitude,
      lng: pos.coords.longitude,
      accuracy: pos.coords.accuracy,
      source: 'gps',
    });
    if(loc.locating && pos.coords.accuracy > GPS.exactM){
      setLocStatus(`<span class="spinner"></span> Precisão de ~${formatAccuracy(pos.coords.accuracy)} — procurando um sinal melhor…`);
    }
  };

  let lastError = null;
  try{
    await trackPosition({ highAccuracy: true, timeoutMs: GPS.firstTimeoutMs, stopAtM: GPS.exactM, onReading: apply });
  }catch(err){
    lastError = err;
    // Sem nenhuma leitura do GPS, tenta pela rede/Wi-Fi (é assim que funciona em computadores).
    if(!got && !(err && err.code === 1)){
      setLocStatus('<span class="spinner"></span> GPS sem sinal. Tentando pela rede Wi-Fi…');
      try{
        await trackPosition({ highAccuracy: false, timeoutMs: GPS.networkTimeoutMs, stopAtM: GPS.goodM, onReading: apply });
        lastError = null;
      }catch(err2){ lastError = err2; }
    }
  }
  loc.locating = false;
  setGpsButtonBusy(false);

  if(got){
    updateLocationStatus();
    refineGpsInBackground();   // continua afinando a precisão sozinho
    if(userInitiated && state.activeTab !== 'map') showToast('Localização atualizada! Distâncias recalculadas.');
    return;
  }

  loc.gpsError = geolocationErrorMessage(lastError);
  if(userInitiated && state.activeTab !== 'map') showToast('Não foi possível usar o GPS. Veja a aba Farmácias.');
  if(!loc.coords || loc.source === 'ip') await useApproximateLocation(lastError);
  else showGpsProblem(lastError);
}

// Sem GPS: estima a localização pela conexão de internet (nível de bairro/cidade),
// para o mapa já mostrar farmácias. A pessoa pode refinar digitando o CEP.
async function useApproximateLocation(err = null){
  setLocStatus('<span class="spinner"></span> Buscando sua localização aproximada…');
  try{
    const place = await api.approximateLocation();
    await setLocation({ lat: place.lat, lng: place.lng, source: 'ip', address: place.label });
  }catch{
    // Nem GPS nem estimativa pela internet: mostra o motivo e deixa o endereço como saída.
    if(loc.gpsError) showGpsProblem(err);
    else setLocStatus('Não consegui descobrir sua localização automaticamente. Digite seu <b>endereço ou CEP</b> acima.', 'warn');
    if(!loc.coords) showMapAt(DEFAULT_CENTER, 12);
    return;
  }
  // Deixa claro que é a aproximada e por que o GPS não entrou.
  if(loc.gpsError) updateLocationStatus(err);
}

function setGpsButtonBusy(busy){
  const btn = document.querySelector('.loc-gps');
  if(btn) btn.disabled = busy;
}

// Ao entrar no app: mostra a última localização salva enquanto busca a atual.
// Se a localização já está autorizada, o GPS é consultado sempre, automaticamente.
let permissionWatcherSet = false;
async function initLocationSilently(){
  const saved = storage.get(LOCATION_STORAGE_KEY);
  if(saved && saved.coords && saved.source !== 'ip' && Date.now() - saved.savedAt < LOCATION_MAX_AGE_MS){
    setLocation({ ...saved.coords, accuracy: saved.accuracy, source: saved.source, address: saved.address }, { save: false });
  }
  if('geolocation' in navigator && await permissionState() === 'granted') requestMapLocation(false);
  watchPermissionChanges();
  updateLocationHint();
}

// Se a pessoa liberar a localização nas configurações do navegador, atualiza sozinho.
async function watchPermissionChanges(){
  if(permissionWatcherSet || !navigator.permissions) return;
  try{
    const status = await navigator.permissions.query({ name: 'geolocation' });
    permissionWatcherSet = true;
    status.onchange = ()=>{
      if(status.state === 'granted' && state.user && !loc.manualAddress) requestMapLocation(false);
    };
  }catch{ /* navegador sem Permissions API */ }
}

let lastNearbyCenter = null;   // ponto em que as farmácias ao redor foram buscadas
let lastAddressPoint = null;   // ponto do último endereço lido pelo mapa

async function setLocation({ lat, lng, accuracy = null, source, address = '' }, { save = true } = {}){
  const requestId = ++loc.requestId;
  const point = { lat, lng };
  loc.coords = point;
  loc.accuracy = accuracy;
  loc.source = source;
  if(address){
    loc.address = address;
    lastAddressPoint = point;
  }

  // O GPS manda várias leituras seguidas enquanto afina a precisão: só vale buscar
  // as farmácias de novo quando a posição realmente mudou de lugar (mais de 250 m).
  // (se a busca falhou, não insiste a cada leitura: fica o botão "Tentar de novo")
  const moved = !lastNearbyCenter || haversineKm(lastNearbyCenter, point) > 0.25;
  const reload = moved || loc.pharmaciesStatus === 'idle';

  if(reload){
    loc.pharmacies = [];
    loc.chainMatches = {};
    loc.pharmaciesStatus = 'loading';
  } else {
    rescoreNearbyPharmacies();   // mesma lista, distâncias recalculadas
  }

  updateLocationStatus();
  updateLocationHint();
  showMapAt(point, source === 'ip' ? 13 : zoomForAccuracy(accuracy));
  renderMapMarkers();
  refreshDistanceViews();

  // Endereço legível: só busca de novo se andou mais de 40 m (ou se ainda não tem).
  const needsAddress = !address && (!loc.address || !lastAddressPoint || haversineKm(lastAddressPoint, point) > 0.04);
  if(needsAddress){
    lastAddressPoint = point;
    api.reverseGeocode(lat, lng).then(({ label })=>{
      if(requestId !== loc.requestId || !label) return;
      loc.address = label;
      updateLocationStatus();
      persistLocation();
    }).catch(()=>{});
  }
  if(save) persistLocation();

  if(reload){
    lastNearbyCenter = point;
    await loadNearbyPharmacies(requestId);
  }
}

// Zoom conforme a precisão: leitura exata mostra a rua; leitura grosseira, o bairro.
function zoomForAccuracy(accuracy){
  if(!accuracy) return 16;
  if(accuracy <= 30) return 18;
  if(accuracy <= 100) return 17;
  if(accuracy <= 500) return 15;
  return 14;
}

// Recalcula as distâncias da lista já carregada quando a posição muda pouco.
function rescoreNearbyPharmacies(){
  if(!loc.coords || !loc.pharmacies.length) return;
  loc.pharmacies = loc.pharmacies
    .map(p => ({ ...p, km: haversineKm(loc.coords, p) }))
    .sort((a, b) => a.km - b.km);
  loc.chainMatches = {};
  for(const p of loc.pharmacies){
    if(p.chainId && !loc.chainMatches[p.chainId]) loc.chainMatches[p.chainId] = p;
  }
}

function persistLocation(){
  if(!loc.coords || loc.source === 'ip') return; // a aproximada pela internet não é guardada
  storage.set(LOCATION_STORAGE_KEY, {
    coords: loc.coords, accuracy: loc.accuracy, source: loc.source, address: loc.address, savedAt: Date.now(),
  });
}

const formatAccuracy = m => (m < 1000 ? `${Math.round(m)} m` : formatKm(m / 1000));

function updateLocationStatus(err = null){
  if(!loc.coords) return;
  const where = loc.address ? escapeHtml(loc.address) : 'sua localização atual';

  if(loc.source === 'ip'){
    setLocStatus(`<span>Esta é a localização <b>aproximada</b> pela sua internet: <b>${where}</b>. Pode errar por vários quilômetros.</span>
      ${loc.gpsError ? `<span class="loc-tip">${loc.gpsError}</span>` : ''}
      <span class="loc-tip">Digite seu <b>endereço ou CEP</b> acima para acertar o ponto — é esse endereço que a entrega usa.</span>
      ${loc.gpsError ? `<span class="loc-detail">${locationFailureDetails(err)}</span>` : ''}
      <button class="btn-outline-sm" onclick="requestMapLocation(true)">Tentar o GPS de novo</button>`, 'warn');
    return;
  }
  if(loc.source !== 'gps'){
    setLocStatus(`Mostrando farmácias perto de: <b>${where}</b>`, 'ok');
    return;
  }

  const exact = loc.accuracy && loc.accuracy <= GPS.exactM;
  const precision = loc.accuracy
    ? ` <span class="loc-precision ${exact ? 'exact' : ''}">precisão de ~${formatAccuracy(loc.accuracy)}</span>`
    : '';
  // Precisão ruim: oferece melhorar sem ter que procurar o botão lá em cima.
  const improve = loc.accuracy && loc.accuracy > GPS.goodM
    ? `<span class="loc-tip">O sinal ainda está fraco. Perto de uma janela ou na rua a precisão melhora.</span>
       <button class="btn-outline-sm" onclick="requestMapLocation(true)">Melhorar precisão</button>`
    : '';
  setLocStatus(`<span>Você está em: <b>${where}</b>${precision}</span>${improve}`, 'ok');
}

function updateLocationHint(){
  const hint = $('location-hint');
  if(!hint) return;
  if(loc.coords){
    hint.classList.add('hidden');
    return;
  }
  hint.innerHTML = `
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M12 21s-7-6.2-7-11.5a7 7 0 0114 0C19 14.8 12 21 12 21z"/><circle cx="12" cy="9.5" r="2.5"/></svg>
    <span>Ative sua localização para ver a distância real até cada farmácia.</span>
    <button class="link-btn" onclick="requestMapLocation(true)">Ativar</button>
    <button class="link-btn" onclick="switchTab('map'); setTimeout(()=>$('loc-input').focus(), 80)">Digitar CEP</button>`;
  hint.classList.remove('hidden');
}

// Atualiza telas que mostram distância (busca, carrinho).
function refreshDistanceViews(){
  if(state.activeTab === 'home') renderResults();
  if(state.activeTab === 'map') renderPharmacyList();
  if(typeof refreshCheckoutIfOpen === 'function') refreshCheckoutIfOpen();
}

/* ---------------- endereço / CEP ---------------- */

async function searchAddress(){
  const raw = $('loc-input').value.trim();
  if(raw.length < 3){ $('loc-input').focus(); return; }
  $('loc-input').blur(); // fecha o teclado no celular
  setLocStatus('<span class="spinner"></span> Procurando endereço…');
  try{
    const place = await api.geocode(raw);
    loc.manualAddress = true;
    stopRefining();
    await setLocation({ lat: place.lat, lng: place.lng, source: 'address', address: place.label || raw });
  }catch(e){
    setLocStatus(escapeHtml(e.message), 'warn');
  }
}

/* ---------------- farmácias reais ao redor ---------------- */

async function loadNearbyPharmacies(requestId){
  const center = loc.coords;
  try{
    const data = await api.nearbyPharmacies(center.lat, center.lng);
    if(requestId !== loc.requestId) return;
    loc.radiusKm = data.radiusKm;
    loc.pharmacies = data.pharmacies
      .map(p => {
        const brand = brandOf(p);
        return {
          ...p,
          km: haversineKm(center, p),
          chainId: brand && brand.partner || null,
          domain: (brand && brand.domain) || (p.website && domainFromWebsite(p.website)) || null,
        };
      })
      .sort((a, b) => a.km - b.km);
    loc.chainMatches = {};
    for(const p of loc.pharmacies){
      if(p.chainId && !loc.chainMatches[p.chainId]) loc.chainMatches[p.chainId] = p;
    }
    loc.pharmaciesStatus = 'done';
  }catch(e){
    if(requestId !== loc.requestId) return;
    loc.pharmaciesStatus = 'error';
    loc.pharmaciesError = e.message;
  }
  renderMapMarkers();
  refreshDistanceViews();
}

function retryPharmacies(){
  if(!loc.coords) return;
  loc.pharmaciesStatus = 'loading';
  renderPharmacyList();
  loadNearbyPharmacies(loc.requestId);
}

/* ---------------- mapa ---------------- */

let mapInitialized = false;

function initMap(){
  setTimeout(()=>{
    ensureMap();
    if(leafletMap) leafletMap.invalidateSize();
    if(!mapInitialized){
      mapInitialized = true;
      if(loc.coords){
        updateLocationStatus();
        showMapAt(loc.coords, loc.source === 'ip' ? 13 : 15);
        renderMapMarkers();
      }
      // Busca a localização exata, a menos que ela já tenha vindo do GPS
      // ou que a pessoa tenha digitado um endereço nesta visita.
      if(loc.source !== 'gps' && !loc.manualAddress && !loc.locating) requestMapLocation(false);
    }
    renderPharmacyList();
  }, 0);
}

function ensureMap(){
  if(leafletMap || !window.L || $('tab-map').classList.contains('hidden')) return;
  leafletMap = L.map('leaflet-map', { zoomControl: true, scrollWheelZoom: false, tap: true });
  // Imagens do mapa: OpenStreetMap (gratuito, sem chave). Se várias imagens falharem,
  // troca para o servidor do OpenStreetMap França (estilo Humanitarian).
  const osmAttribution = '&copy; <a href="https://www.openstreetmap.org/copyright" target="_blank" rel="noopener">OpenStreetMap</a>';
  let tiles = L.tileLayer('https://tile.openstreetmap.org/{z}/{x}/{y}.png', { maxZoom: 19, attribution: osmAttribution }).addTo(leafletMap);
  let tileErrors = 0;
  tiles.on('tileerror', ()=>{
    if(++tileErrors !== 4) return;
    leafletMap.removeLayer(tiles);
    tiles = L.tileLayer('https://{s}.tile.openstreetmap.fr/hot/{z}/{x}/{y}.png', { maxZoom: 19, subdomains: 'abc', attribution: osmAttribution }).addTo(leafletMap);
  });
  mapLayers = L.layerGroup().addTo(leafletMap);
  leafletMap.setView([DEFAULT_CENTER.lat, DEFAULT_CENTER.lng], 12);
}

// Sem a biblioteca do mapa (bloqueada ou offline), usa o Google Maps embutido.
function showMapAt(center, zoom){
  ensureMap();
  if(leafletMap){
    leafletMap.setView([center.lat, center.lng], zoom);
    return;
  }
  if($('tab-map').classList.contains('hidden')) return;
  const frame = $('gmap-frame');
  $('leaflet-map').classList.add('hidden');
  frame.classList.remove('hidden');
  frame.src = `https://www.google.com/maps?q=farm%C3%A1cia&ll=${center.lat},${center.lng}&z=${zoom}&output=embed`;
}

function pinIcon(kind){
  return L.divIcon({ className: '', html: `<div class="map-pin ${kind}"></div>`, iconSize: [22, 22], iconAnchor: [11, 22], popupAnchor: [0, -20] });
}

function pharmacyPopup(p){
  return `<div class="map-popup">
    <b>${escapeHtml(p.name)}</b>
    ${p.street ? `<span>${escapeHtml(p.street)}</span>` : ''}
    <span>${formatKm(p.km)} de distância${p.open24h ? ' · 24 horas' : ''}</span>
    <a href="${directionsUrl(p.lat, p.lng)}" target="_blank" rel="noopener">Como chegar</a>
  </div>`;
}

function renderMapMarkers(){
  ensureMap();
  if(!leafletMap || !loc.coords) return;
  mapLayers.clearLayers();
  pharmacyMarkers.clear();

  if(loc.source === 'gps' && loc.accuracy && loc.accuracy < 2000){
    L.circle([loc.coords.lat, loc.coords.lng], { radius: loc.accuracy, color: '#2b7de1', weight: 1, fillOpacity: 0.08 }).addTo(mapLayers);
  }
  L.marker([loc.coords.lat, loc.coords.lng], { icon: pinIcon('me'), zIndexOffset: 1000 })
    .bindPopup('<div class="map-popup"><b>Você está aqui</b></div>').addTo(mapLayers);

  const bounds = [[loc.coords.lat, loc.coords.lng]];
  // Farmácias próximas + loja mais próxima de cada rede parceira (mesmo se estiver mais longe).
  const onMap = new Map(loc.pharmacies.map(p => [p.id, p]));
  Object.values(loc.chainMatches).forEach(p => onMap.set(p.id, p));
  [...onMap.values()].sort((a, b) => a.km - b.km).forEach((p, i)=>{
    const marker = L.marker([p.lat, p.lng], { icon: pinIcon(p.chainId ? 'partner' : 'pharmacy') })
      .bindPopup(pharmacyPopup(p)).addTo(mapLayers);
    pharmacyMarkers.set(p.id, marker);
    if(i < 8) bounds.push([p.lat, p.lng]);
  });
  if(bounds.length > 1) leafletMap.fitBounds(bounds, { padding: [30, 30], maxZoom: 16 });
}

function focusPharmacy(id){
  const p = loc.pharmacies.find(x => x.id === id) || Object.values(loc.chainMatches).find(x => x.id === id);
  if(!p) return;
  const marker = pharmacyMarkers.get(id);
  if(leafletMap && marker){
    leafletMap.setView([p.lat, p.lng], 17);
    marker.openPopup();
    $('map-wrap').scrollIntoView({ behavior: 'smooth', block: 'center' });
  } else {
    window.open(directionsUrl(p.lat, p.lng), '_blank', 'noopener');
  }
}

function renderPharmacyList(){
  const el = $('pharmacy-list');
  if(!el) return;
  const title = $('pharmacy-list-title');
  if(!loc.coords){
    title.textContent = 'Mais perto de você';
    el.innerHTML = `<div class="empty-inline">Permita a localização ou digite um endereço para ver as farmácias ao redor.</div>`;
    return;
  }
  if(loc.pharmaciesStatus === 'loading'){
    el.innerHTML = `<div class="empty-inline"><span class="spinner"></span> Procurando farmácias ao redor…</div>`;
    return;
  }
  if(loc.pharmaciesStatus === 'error'){
    el.innerHTML = `<div class="empty-inline">${escapeHtml(loc.pharmaciesError || 'Não foi possível carregar as farmácias agora.')}
      <div class="inline-actions">
        <button class="btn-outline-sm" onclick="retryPharmacies()">Tentar de novo</button>
        <a class="btn-outline-sm" href="${googleMapsSearchUrl(loc.coords)}" target="_blank" rel="noopener">Ver no Google Maps</a>
      </div></div>`;
    return;
  }
  if(!loc.pharmacies.length){
    el.innerHTML = `<div class="empty-inline">Nenhuma farmácia encontrada num raio de ${radiusLabel()}.
      <a class="link-btn" href="${googleMapsSearchUrl(loc.coords)}" target="_blank" rel="noopener">Procurar no Google Maps</a></div>`;
    return;
  }
  title.textContent = `Farmácias perto de você (${loc.pharmacies.length})`;
  el.innerHTML = loc.pharmacies.slice(0, 20).map(p=>`
    <div class="near-item">
      <button class="near-main" onclick="focusPharmacy('${p.id}')">
        ${pharmacyLogoHtml(p, 'near-logo')}
        <span class="near-text">
          <b>${escapeHtml(p.name)}${p.chainId ? '<em class="partner-tag">Parceira</em>' : ''}</b>
          <span>${[p.street, p.suburb].filter(Boolean).map(escapeHtml).join(' · ') || 'Endereço não informado'}</span>
        </span>
        <span class="near-km">${formatKm(p.km)}${p.open24h ? '<em>24h</em>' : ''}</span>
      </button>
      <a class="near-route" href="${directionsUrl(p.lat, p.lng)}" target="_blank" rel="noopener" aria-label="Rota até ${escapeHtml(p.name)}">
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M3 11l19-9-9 19-2-8-8-2z"/></svg>
      </a>
    </div>`).join('');
}
