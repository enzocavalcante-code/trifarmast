/* =============================================================
   Localização e mapa
   - GPS do aparelho (com nova tentativa em modo de menor precisão)
   - Busca por endereço ou CEP (ViaCEP + OpenStreetMap/Nominatim)
   - Farmácias reais ao redor (OpenStreetMap/Overpass) no mapa (Leaflet)
   - Distância real até a loja mais próxima de cada rede parceira
   ============================================================= */

const LOCATION_STORAGE_KEY = 'trifarmas-location';
const LOCATION_MAX_AGE_MS = 6 * 60 * 60 * 1000; // reaproveita a última localização por 6h
const DEFAULT_CENTER = { lat: -23.5505, lng: -46.6333 }; // São Paulo (usado só no mapa, sem localização)
const SEARCH_RADII_M = [3000, 8000];   // raio da lista de farmácias (amplia se houver poucas)
const CHAIN_RADIUS_M = 10000;           // raio para achar a loja mais próxima de cada rede parceira
const OVERPASS_ENDPOINTS = ['https://overpass-api.de/api/interpreter', 'https://overpass.kumi.systems/api/interpreter'];

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
  radiusKm: SEARCH_RADII_M[SEARCH_RADII_M.length - 1] / 1000,
  pharmacies: [],        // farmácias reais ao redor, ordenadas por distância
  pharmaciesStatus: 'idle', // idle | loading | done | error
  chainMatches: {},      // { p1: { km, street, lat, lng }, ... }
  requestId: 0,
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

async function fetchJson(url, { timeoutMs = 15000, ...options } = {}){
  const controller = new AbortController();
  const timer = setTimeout(()=> controller.abort(), timeoutMs);
  try{
    const res = await fetch(url, { ...options, signal: controller.signal });
    if(!res.ok) throw new Error(`HTTP ${res.status}`);
    return await res.json();
  }finally{
    clearTimeout(timer);
  }
}

function setLocStatus(text, tone = ''){
  const el = $('loc-status');
  if(!el) return;
  el.className = `loc-status ${tone}`;
  el.innerHTML = text;
}

const radiusLabel = () => `${String(loc.radiusKm).replace('.', ',')} km`;
const directionsUrl = (lat, lng) => `https://www.google.com/maps/dir/?api=1&destination=${lat},${lng}`;

/* Distância exibida nos cards de busca, carrinho e pagamento. */
function pharmacyDistance(pharm){
  if(!loc.coords) return { km: pharm.dist, label: 'Ative a localização para ver a distância' };
  const match = loc.chainMatches[pharm.id];
  if(match) return { km: match.km, label: `${formatKm(match.km)} de você${match.street ? ' · ' + escapeHtml(match.street) : ''}`, match };
  if(loc.pharmaciesStatus === 'loading') return { km: Infinity, label: 'Calculando distância…' };
  if(loc.pharmaciesStatus === 'error') return { km: Infinity, label: 'Distância indisponível no momento' };
  return { km: Infinity, label: `Nenhuma loja num raio de ${CHAIN_RADIUS_M / 1000} km` };
}

/* ---------------- obter localização ---------------- */

function getPosition(options){
  return new Promise((resolve, reject)=> navigator.geolocation.getCurrentPosition(resolve, reject, options));
}

// Tenta GPS preciso; se demorar ou falhar, tenta de novo com a localização aproximada (Wi-Fi/rede).
async function getBestPosition(){
  try{
    return await getPosition({ enableHighAccuracy: true, timeout: 10000, maximumAge: 0 });
  }catch(err){
    if(err.code === 1) throw err; // permissão negada: não adianta tentar de novo
    return getPosition({ enableHighAccuracy: false, timeout: 15000, maximumAge: 5 * 60 * 1000 });
  }
}

function geolocationErrorMessage(err){
  if(!window.isSecureContext) return 'A localização só funciona em sites com https. Digite seu endereço ou CEP acima.';
  if(err && err.code === 1) return 'Você não permitiu o acesso à localização. Libere nas configurações do navegador (ícone de cadeado ao lado do endereço do site) ou digite seu endereço/CEP acima.';
  if(err && err.code === 3) return 'Não foi possível obter a localização a tempo. Tente de novo em um local aberto ou digite seu endereço/CEP.';
  return 'Não foi possível obter sua localização. Verifique se o GPS está ligado ou digite seu endereço/CEP acima.';
}

async function requestMapLocation(userInitiated = false){
  if(!('geolocation' in navigator)){
    setLocStatus('Seu navegador não oferece localização. Digite seu endereço ou CEP acima.', 'warn');
    return;
  }
  setLocStatus('<span class="spinner"></span> Obtendo sua localização…');
  try{
    const pos = await getBestPosition();
    await setLocation({
      lat: pos.coords.latitude,
      lng: pos.coords.longitude,
      accuracy: pos.coords.accuracy,
      source: 'gps',
    });
    if(userInitiated && state.activeTab !== 'map') showToast('Localização atualizada! Distâncias recalculadas.');
  }catch(err){
    setLocStatus(geolocationErrorMessage(err), 'warn');
    if(userInitiated && state.activeTab !== 'map') showToast('Não foi possível obter sua localização. Tente pelo Mapa, digitando o endereço.');
    if(!loc.coords) showMapAt(DEFAULT_CENTER, 12);
  }
}

// Ao entrar no app: reaproveita a última localização e, se a permissão
// já foi dada antes, atualiza sem perguntar de novo.
async function initLocationSilently(){
  const saved = storage.get(LOCATION_STORAGE_KEY);
  if(saved && saved.coords && Date.now() - saved.savedAt < LOCATION_MAX_AGE_MS){
    setLocation({ ...saved.coords, accuracy: saved.accuracy, source: saved.source, address: saved.address }, { save: false });
  }
  try{
    if(navigator.permissions && 'geolocation' in navigator){
      const perm = await navigator.permissions.query({ name: 'geolocation' });
      if(perm.state === 'granted' && (!saved || saved.source === 'gps')) requestMapLocation(false);
    }
  }catch{ /* navegador sem Permissions API */ }
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
    reverseGeocode(lat, lng).then(addr=>{
      if(requestId !== loc.requestId || !addr) return;
      loc.address = addr;
      updateLocationStatus();
      persistLocation();
    });
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
  const where = loc.address ? escapeHtml(loc.address) : `${loc.coords.lat.toFixed(5)}, ${loc.coords.lng.toFixed(5)}`;
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
    <button class="link-btn" onclick="requestMapLocation(true)">Ativar</button>`;
  hint.classList.remove('hidden');
}

// Atualiza telas que mostram distância (busca, carrinho).
function refreshDistanceViews(){
  if(state.activeTab === 'home') renderResults();
  if(state.activeTab === 'map') renderPharmacyList();
  if(typeof refreshCheckoutIfOpen === 'function') refreshCheckoutIfOpen();
}

/* ---------------- endereço / CEP ---------------- */

async function reverseGeocode(lat, lng){
  try{
    const data = await fetchJson(`https://nominatim.openstreetmap.org/reverse?format=jsonv2&lat=${lat}&lon=${lng}&zoom=18&addressdetails=1&accept-language=pt-BR`);
    const a = data.address || {};
    const street = [a.road, a.house_number].filter(Boolean).join(', ');
    const area = a.suburb || a.neighbourhood || a.city_district || '';
    const city = a.city || a.town || a.village || a.municipality || '';
    return [street, area, city].filter(Boolean).join(' · ') || data.display_name || '';
  }catch{
    return '';
  }
}

async function searchAddress(){
  const raw = $('loc-input').value.trim();
  if(!raw){ $('loc-input').focus(); return; }
  setLocStatus('<span class="spinner"></span> Procurando endereço…');
  try{
    let queryText = raw;
    let label = raw;
    const cep = raw.replace(/\D/g, '');
    if(/^\d{8}$/.test(cep)){
      const via = await fetchJson(`https://viacep.com.br/ws/${cep}/json/`);
      if(via.erro) throw new Error('CEP não encontrado.');
      queryText = [via.logradouro, via.bairro, via.localidade, via.uf, 'Brasil'].filter(Boolean).join(', ');
      label = [via.logradouro, via.bairro, `${via.localidade}/${via.uf}`].filter(Boolean).join(' · ');
    }
    const results = await fetchJson(`https://nominatim.openstreetmap.org/search?format=jsonv2&limit=1&countrycodes=br&accept-language=pt-BR&q=${encodeURIComponent(queryText)}`);
    if(!results.length) throw new Error('Endereço não encontrado. Tente incluir o bairro e a cidade.');
    const place = results[0];
    await setLocation({
      lat: Number(place.lat),
      lng: Number(place.lon),
      source: 'address',
      address: label === raw ? place.display_name.split(',').slice(0, 3).join(',') : label,
    });
  }catch(e){
    setLocStatus(e.name === 'AbortError' ? 'A busca demorou demais. Tente novamente.' : (e.message.startsWith('HTTP') ? 'Não foi possível buscar o endereço agora. Tente novamente.' : e.message), 'warn');
  }
}

/* ---------------- farmácias reais ao redor ---------------- */

// Uma consulta traz: todas as farmácias no raio próximo + lojas das redes parceiras
// num raio maior (para calcular a distância até a loja mais próxima de cada rede).
const CHAIN_REGEX = 'raia|drogasil|pacheco|pague ?menos|ultrafarma|panvel';

async function queryOverpass(center, nearRadiusM){
  const around = r => `(around:${r},${center.lat},${center.lng})`;
  const query = `[out:json][timeout:25];
(
  nwr["amenity"="pharmacy"]${around(nearRadiusM)};
  nwr["amenity"="pharmacy"]["name"~"${CHAIN_REGEX}",i]${around(CHAIN_RADIUS_M)};
  nwr["amenity"="pharmacy"]["brand"~"${CHAIN_REGEX}",i]${around(CHAIN_RADIUS_M)};
);
out center tags 400;`;
  let lastError;
  for(const endpoint of OVERPASS_ENDPOINTS){
    try{
      const data = await fetchJson(`${endpoint}?data=${encodeURIComponent(query)}`, { timeoutMs: 25000 });
      return data.elements || [];
    }catch(err){
      lastError = err;
    }
  }
  throw lastError;
}

function toPharmacy(el, center){
  const lat = el.lat ?? (el.center && el.center.lat);
  const lng = el.lon ?? (el.center && el.center.lon);
  if(lat == null || lng == null) return null;
  const t = el.tags || {};
  const name = t.name || t.brand || 'Farmácia';
  const street = [t['addr:street'], t['addr:housenumber']].filter(Boolean).join(', ');
  const searchable = normalizeText(`${t.name || ''} ${t.brand || ''} ${t.operator || ''}`);
  const chainId = Object.keys(CHAIN_KEYWORDS).find(id => CHAIN_KEYWORDS[id].some(k => searchable.includes(k))) || null;
  return {
    id: `${el.type}/${el.id}`,
    name,
    street,
    suburb: t['addr:suburb'] || '',
    lat, lng,
    km: haversineKm(center, { lat, lng }),
    open24h: /24\/7/.test(t.opening_hours || ''),
    chainId,
  };
}

async function loadNearbyPharmacies(requestId){
  const center = loc.coords;
  try{
    let all = [];
    let near = [];
    for(const radius of SEARCH_RADII_M){
      const elements = await queryOverpass(center, radius);
      const unique = new Map();
      elements.map(el => toPharmacy(el, center)).filter(Boolean).forEach(p => unique.set(p.id, p));
      all = [...unique.values()].sort((a, b) => a.km - b.km);
      near = all.filter(p => p.km <= radius / 1000);
      loc.radiusKm = radius / 1000;
      if(near.length >= 5) break;
    }
    if(requestId !== loc.requestId) return;
    loc.pharmacies = near;
    loc.chainMatches = {};
    for(const p of all){
      if(p.chainId && !loc.chainMatches[p.chainId]) loc.chainMatches[p.chainId] = p;
    }
    loc.pharmaciesStatus = 'done';
  }catch{
    if(requestId !== loc.requestId) return;
    loc.pharmaciesStatus = 'error';
  }
  renderMapMarkers();
  refreshDistanceViews();
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
  leafletMap = L.map('leaflet-map', { zoomControl: true, scrollWheelZoom: false });
  L.tileLayer('https://tile.openstreetmap.org/{z}/{x}/{y}.png', {
    maxZoom: 19,
    attribution: '&copy; <a href="https://www.openstreetmap.org/copyright" target="_blank" rel="noopener">OpenStreetMap</a>',
  }).addTo(leafletMap);
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
    el.innerHTML = `<div class="empty-inline">Não foi possível carregar as farmácias agora.
      <button class="link-btn" onclick="setLocation({...loc.coords, accuracy: loc.accuracy, source: loc.source, address: loc.address})">Tentar de novo</button> ·
      <a class="link-btn" href="https://www.google.com/maps/search/farm%C3%A1cia/@${loc.coords.lat},${loc.coords.lng},15z" target="_blank" rel="noopener">Abrir no Google Maps</a></div>`;
    return;
  }
  if(!loc.pharmacies.length){
    el.innerHTML = `<div class="empty-inline">Nenhuma farmácia encontrada num raio de ${radiusLabel()}.
      <a class="link-btn" href="https://www.google.com/maps/search/farm%C3%A1cia/@${loc.coords.lat},${loc.coords.lng},14z" target="_blank" rel="noopener">Procurar no Google Maps</a></div>`;
    return;
  }
  title.textContent = `${loc.pharmacies.length} farmácias num raio de ${radiusLabel()}`;
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
