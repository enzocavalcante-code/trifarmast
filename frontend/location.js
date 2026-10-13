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

// Como cada rede parceira aparece no OpenStreetMap (nome ou marca).
const CHAIN_KEYWORDS = {
  p1: ['raia'],
  p2: ['drogasil'],
  p3: ['pacheco'],
  p4: ['pague menos', 'paguemenos'],
  p5: ['ultrafarma'],
  p6: ['panvel'],
};

const loc = {
  coords: null,          // { lat, lng }
  accuracy: null,        // metros (GPS)
  source: null,          // 'gps' | 'address'
  address: '',
  radiusKm: 4,
  pharmacies: [],        // farmácias reais ao redor, ordenadas por distância
  pharmaciesStatus: 'idle', // idle | loading | done | error
  pharmaciesError: '',
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
  if(match) return { km: match.km, label: `${formatKm(match.km)} de você${match.street ? ' · ' + escapeHtml(match.street) : ''}`, match };
  if(loc.pharmaciesStatus === 'loading') return { km: Infinity, label: 'Calculando distância…' };
  if(loc.pharmaciesStatus === 'error') return { km: Infinity, label: 'Distância indisponível no momento' };
  return { km: Infinity, label: `Nenhuma loja num raio de ${radiusLabel()}` };
}

/* ---------------- localização do aparelho ---------------- */

function getPosition(options){
  return new Promise((resolve, reject)=> navigator.geolocation.getCurrentPosition(resolve, reject, options));
}

// 1ª tentativa: GPS preciso (aceita uma leitura de até 1 min atrás).
// 2ª tentativa: localização aproximada por Wi-Fi/rede, que costuma funcionar em computadores.
async function getBestPosition(){
  try{
    return await getPosition({ enableHighAccuracy: true, timeout: 9000, maximumAge: 60 * 1000 });
  }catch(err){
    if(err.code === 1) throw err; // permissão negada: não adianta tentar de novo
    setLocStatus('<span class="spinner"></span> GPS sem sinal, tentando localização aproximada…');
    return getPosition({ enableHighAccuracy: false, timeout: 12000, maximumAge: 10 * 60 * 1000 });
  }
}

async function permissionState(){
  try{
    if(navigator.permissions) return (await navigator.permissions.query({ name: 'geolocation' })).state;
  }catch{ /* navegador sem Permissions API */ }
  return 'prompt';
}

function geolocationErrorMessage(err){
  if(!window.isSecureContext) return 'A localização do aparelho só funciona em sites com https. Digite seu endereço ou CEP acima.';
  if(err && err.code === 1) return '<b>Localização bloqueada.</b> Toque no cadeado ao lado do endereço do site e permita "Localização", ou digite seu endereço/CEP acima.';
  if(err && err.code === 3) return 'Não foi possível obter a localização a tempo. Tente de novo ou digite seu endereço/CEP acima.';
  return 'Não foi possível obter sua localização. Verifique se a localização do aparelho está ligada ou digite seu endereço/CEP acima.';
}

async function requestMapLocation(userInitiated = false){
  if(loc.locating) return;
  if(!('geolocation' in navigator)){
    setLocStatus('Seu navegador não oferece localização. Digite seu endereço ou CEP acima.', 'warn');
    return;
  }
  if(await permissionState() === 'denied'){
    setLocStatus(geolocationErrorMessage({ code: 1 }), 'warn');
    if(userInitiated && state.activeTab !== 'map') showToast('A localização está bloqueada no navegador. Libere ou digite seu CEP na aba Mapa.');
    if(!loc.coords) showMapAt(DEFAULT_CENTER, 12);
    return;
  }
  loc.locating = true;
  setGpsButtonBusy(true);
  setLocStatus('<span class="spinner"></span> Obtendo sua localização… se o navegador perguntar, toque em <b>Permitir</b>.');
  try{
    const pos = await getBestPosition();
    loc.locating = false;
    setGpsButtonBusy(false);
    $('loc-input').value = '';
    await setLocation({
      lat: pos.coords.latitude,
      lng: pos.coords.longitude,
      accuracy: pos.coords.accuracy,
      source: 'gps',
    });
    if(userInitiated && state.activeTab !== 'map') showToast('Localização atualizada! Distâncias recalculadas.');
  }catch(err){
    loc.locating = false;
    setGpsButtonBusy(false);
    setLocStatus(geolocationErrorMessage(err), 'warn');
    if(userInitiated && state.activeTab !== 'map') showToast('Não foi possível obter sua localização. Tente pela aba Mapa, digitando o CEP.');
    if(!loc.coords) showMapAt(DEFAULT_CENTER, 12);
  }
}

function setGpsButtonBusy(busy){
  const btn = document.querySelector('.loc-gps');
  if(btn) btn.disabled = busy;
}

// Ao entrar no app: reaproveita a última localização e, se a permissão
// já foi dada antes, atualiza sem perguntar de novo.
async function initLocationSilently(){
  const saved = storage.get(LOCATION_STORAGE_KEY);
  if(saved && saved.coords && Date.now() - saved.savedAt < LOCATION_MAX_AGE_MS){
    setLocation({ ...saved.coords, accuracy: saved.accuracy, source: saved.source, address: saved.address }, { save: false });
  }
  if('geolocation' in navigator && await permissionState() === 'granted' && (!saved || saved.source === 'gps')){
    requestMapLocation(false);
  }
  updateLocationHint();
}

async function setLocation({ lat, lng, accuracy = null, source, address = '' }, { save = true } = {}){
  const requestId = ++loc.requestId;
  loc.coords = { lat, lng };
  loc.accuracy = accuracy;
  loc.source = source;
  loc.address = address;
  loc.pharmacies = [];
  loc.chainMatches = {};
  loc.pharmaciesStatus = 'loading';

  updateLocationStatus();
  updateLocationHint();
  showMapAt(loc.coords, 15);
  refreshDistanceViews();

  if(!address){
    api.reverseGeocode(lat, lng).then(({ label })=>{
      if(requestId !== loc.requestId || !label) return;
      loc.address = label;
      updateLocationStatus();
      persistLocation();
    }).catch(()=>{});
  }
  if(save) persistLocation();

  await loadNearbyPharmacies(requestId);
}

function persistLocation(){
  if(!loc.coords) return;
  storage.set(LOCATION_STORAGE_KEY, {
    coords: loc.coords, accuracy: loc.accuracy, source: loc.source, address: loc.address, savedAt: Date.now(),
  });
}

function updateLocationStatus(){
  if(!loc.coords) return;
  const where = loc.address ? escapeHtml(loc.address) : 'sua localização atual';
  const precision = loc.source === 'gps' && loc.accuracy
    ? ` <span class="loc-precision">precisão de ~${loc.accuracy < 1000 ? Math.round(loc.accuracy) + ' m' : formatKm(loc.accuracy / 1000)}</span>`
    : '';
  const prefix = loc.source === 'gps' ? 'Você está em' : 'Mostrando farmácias perto de';
  setLocStatus(`${prefix}: <b>${where}</b>${precision}`, 'ok');
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
    await setLocation({ lat: place.lat, lng: place.lng, source: 'address', address: place.label || raw });
  }catch(e){
    setLocStatus(escapeHtml(e.message), 'warn');
  }
}

/* ---------------- farmácias reais ao redor ---------------- */

function chainOf(p){
  const searchable = normalizeText(`${p.name || ''} ${p.brand || ''}`);
  return Object.keys(CHAIN_KEYWORDS).find(id => CHAIN_KEYWORDS[id].some(k => searchable.includes(k))) || null;
}

async function loadNearbyPharmacies(requestId){
  const center = loc.coords;
  try{
    const data = await api.nearbyPharmacies(center.lat, center.lng);
    if(requestId !== loc.requestId) return;
    loc.radiusKm = data.radiusKm;
    loc.pharmacies = data.pharmacies
      .map(p => ({ ...p, km: haversineKm(center, p), chainId: chainOf(p) }))
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
        showMapAt(loc.coords, 15);
        renderMapMarkers();
      } else {
        requestMapLocation(false);
      }
    }
    renderPharmacyList();
  }, 0);
}

function ensureMap(){
  if(leafletMap || !window.L || $('tab-map').classList.contains('hidden')) return;
  leafletMap = L.map('leaflet-map', { zoomControl: true, scrollWheelZoom: false, tap: true });
  // Imagens do mapa: CARTO (principal) e OpenStreetMap (reserva, se várias imagens falharem).
  const attribution = '&copy; <a href="https://www.openstreetmap.org/copyright" target="_blank" rel="noopener">OpenStreetMap</a> &copy; <a href="https://carto.com/attributions" target="_blank" rel="noopener">CARTO</a>';
  let tiles = L.tileLayer('https://{s}.basemaps.cartocdn.com/rastertiles/voyager/{z}/{x}/{y}{r}.png', { maxZoom: 19, subdomains: 'abcd', attribution }).addTo(leafletMap);
  let tileErrors = 0;
  tiles.on('tileerror', ()=>{
    if(++tileErrors !== 4) return;
    leafletMap.removeLayer(tiles);
    tiles = L.tileLayer('https://tile.openstreetmap.org/{z}/{x}/{y}.png', { maxZoom: 19, attribution: '&copy; OpenStreetMap' }).addTo(leafletMap);
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
        <span class="near-dot ${p.chainId ? 'partner' : ''}"></span>
        <span class="near-text">
          <b>${escapeHtml(p.name)}</b>
          <span>${[p.street, p.suburb].filter(Boolean).map(escapeHtml).join(' · ') || 'Endereço não informado'}</span>
        </span>
        <span class="near-km">${formatKm(p.km)}${p.open24h ? '<em>24h</em>' : ''}</span>
      </button>
      <a class="near-route" href="${directionsUrl(p.lat, p.lng)}" target="_blank" rel="noopener" aria-label="Rota até ${escapeHtml(p.name)}">
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M3 11l19-9-9 19-2-8-8-2z"/></svg>
      </a>
    </div>`).join('');
}
