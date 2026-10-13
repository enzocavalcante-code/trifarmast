// Busca de farmácias e endereços (OpenStreetMap), feita pelo servidor.
//
// Por que no servidor: os servidores públicos do OpenStreetMap ficam sobrecarregados
// com frequência. Aqui dá para tentar vários servidores, usar uma segunda fonte se
// todos falharem, identificar o app corretamente e guardar resultados em cache.

const USER_AGENT = 'Trifarmas/1.0 (app de comparacao de precos de farmacias)';

const OVERPASS_ENDPOINTS = [
  'https://overpass-api.de/api/interpreter',
  'https://overpass.private.coffee/api/interpreter',
  'https://overpass.kumi.systems/api/interpreter',
  'https://maps.mail.ru/osm/tools/overpass/api/interpreter',
];
const NOMINATIM = 'https://nominatim.openstreetmap.org';
const PHOTON = 'https://photon.komoot.io';

const NEAR_RADII_M = [4000, 8000];     // amplia a busca se houver poucas farmácias
const MIN_RESULTS = 5;
const CACHE_TTL_MS = 30 * 60 * 1000;
const CACHE_MAX = 500;

/* ---------------- utilidades ---------------- */

const cache = new Map();
function cached(key, ttl, producer) {
  const hit = cache.get(key);
  if (hit && hit.expires > Date.now()) return hit.promise;
  const promise = producer().catch(err => { cache.delete(key); throw err; });
  cache.set(key, { promise, expires: Date.now() + ttl });
  if (cache.size > CACHE_MAX) cache.delete(cache.keys().next().value);
  return promise;
}

async function fetchJson(url, { timeoutMs = 10000, ...options } = {}) {
  const res = await fetch(url, {
    ...options,
    headers: { 'User-Agent': USER_AGENT, 'Accept': 'application/json', 'Accept-Language': 'pt-BR,pt;q=0.9', ...(options.headers || {}) },
    signal: AbortSignal.timeout(timeoutMs),
  });
  if (!res.ok) throw new Error(`HTTP ${res.status} em ${new URL(url).host}`);
  return res.json();
}

function haversineKm(a, b) {
  const R = 6371;
  const toRad = d => d * Math.PI / 180;
  const dLat = toRad(b.lat - a.lat);
  const dLng = toRad(b.lng - a.lng);
  const h = Math.sin(dLat / 2) ** 2 + Math.cos(toRad(a.lat)) * Math.cos(toRad(b.lat)) * Math.sin(dLng / 2) ** 2;
  return 2 * R * Math.asin(Math.sqrt(h));
}

const round = (n, digits) => Number(n).toFixed(digits);

/* ---------------- farmácias próximas ---------------- */

function fromOverpass(el) {
  const lat = el.lat ?? (el.center && el.center.lat);
  const lng = el.lon ?? (el.center && el.center.lon);
  if (lat == null || lng == null) return null;
  const t = el.tags || {};
  return {
    id: `${el.type}/${el.id}`,
    name: t.name || t.brand || 'Farmácia',
    brand: [t.brand, t.operator].filter(Boolean).join(' '),
    street: [t['addr:street'], t['addr:housenumber']].filter(Boolean).join(', '),
    suburb: t['addr:suburb'] || t['addr:city'] || '',
    lat, lng,
    open24h: /24\/7/.test(t.opening_hours || ''),
  };
}

async function overpassPharmacies(center, radiusM, deadline) {
  const query = `[out:json][timeout:15];nwr["amenity"="pharmacy"](around:${radiusM},${center.lat},${center.lng});out center 300;`;
  let lastError = new Error('Overpass indisponível');
  for (const endpoint of OVERPASS_ENDPOINTS) {
    const remaining = deadline - Date.now();
    if (remaining < 2000) break;
    try {
      const data = await fetchJson(endpoint, {
        method: 'POST',
        headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
        body: `data=${encodeURIComponent(query)}`,
        timeoutMs: Math.min(12000, remaining),
      });
      if (!Array.isArray(data.elements)) throw new Error('Resposta inválida do Overpass');
      return data.elements.map(fromOverpass).filter(Boolean);
    } catch (err) {
      lastError = err;
    }
  }
  throw lastError;
}

// Segunda fonte: busca de "farmácia" no Nominatim dentro de um retângulo ao redor do ponto.
async function nominatimPharmacies(center, radiusM) {
  const dLat = radiusM / 111000;
  const dLng = radiusM / (111000 * Math.cos(center.lat * Math.PI / 180));
  const viewbox = [center.lng - dLng, center.lat + dLat, center.lng + dLng, center.lat - dLat].map(n => n.toFixed(5)).join(',');
  const url = `${NOMINATIM}/search?format=jsonv2&amenity=pharmacy&viewbox=${viewbox}&bounded=1&limit=50&addressdetails=1&extratags=1`;
  const results = await fetchJson(url, { timeoutMs: 9000 });
  return results.map(r => {
    const a = r.address || {};
    return {
      id: `${r.osm_type}/${r.osm_id}`,
      name: r.name || (r.display_name || 'Farmácia').split(',')[0],
      brand: (r.extratags && (r.extratags.brand || r.extratags.operator)) || '',
      street: [a.road, a.house_number].filter(Boolean).join(', '),
      suburb: a.suburb || a.neighbourhood || a.city_district || '',
      lat: Number(r.lat),
      lng: Number(r.lon),
      open24h: /24\/7/.test((r.extratags && r.extratags.opening_hours) || ''),
    };
  });
}

async function findPharmacies(center) {
  const deadline = Date.now() + 22000;
  let list = [];
  let radiusM = NEAR_RADII_M[0];
  let source = 'overpass';
  for (const r of NEAR_RADII_M) {
    try {
      list = await overpassPharmacies(center, r, deadline);
      radiusM = r;
      if (list.length >= MIN_RESULTS) break;
    } catch {
      break; // mantém o que já encontrou no raio menor
    }
  }
  if (!list.length) {
    source = 'nominatim';
    radiusM = NEAR_RADII_M[NEAR_RADII_M.length - 1];
    list = await nominatimPharmacies(center, radiusM);
  }
  const unique = new Map();
  for (const p of list) {
    p.km = Math.round(haversineKm(center, p) * 1000) / 1000;
    if (p.km * 1000 <= radiusM * 1.5) unique.set(p.id, p);
  }
  return {
    source,
    radiusKm: radiusM / 1000,
    pharmacies: [...unique.values()].sort((a, b) => a.km - b.km).slice(0, 80),
  };
}

// Arredonda a posição (~100 m) para reaproveitar o cache entre pessoas próximas.
function nearbyPharmacies(lat, lng) {
  const center = { lat: Number(round(lat, 3)), lng: Number(round(lng, 3)) };
  return cached(`pharm:${center.lat},${center.lng}`, CACHE_TTL_MS, () => findPharmacies(center));
}

/* ---------------- endereço ---------------- */

function labelFromAddress(a, fallback) {
  const street = [a.road || a.street, a.house_number || a.housenumber].filter(Boolean).join(', ');
  const area = a.suburb || a.neighbourhood || a.district || a.city_district || '';
  const city = a.city || a.town || a.village || a.municipality || '';
  return [street, area, city].filter(Boolean).join(' · ') || fallback || '';
}

async function reverseGeocode(lat, lng) {
  const key = `rev:${round(lat, 4)},${round(lng, 4)}`;
  return cached(key, CACHE_TTL_MS, async () => {
    try {
      const data = await fetchJson(`${NOMINATIM}/reverse?format=jsonv2&lat=${lat}&lon=${lng}&zoom=18&addressdetails=1`, { timeoutMs: 8000 });
      return { label: labelFromAddress(data.address || {}, data.display_name) };
    } catch {
      const data = await fetchJson(`${PHOTON}/reverse?lat=${lat}&lon=${lng}&limit=1`, { timeoutMs: 8000 });
      const props = (data.features && data.features[0] && data.features[0].properties) || {};
      return { label: labelFromAddress(props, props.name) };
    }
  });
}

// Aceita CEP (com ou sem hífen) ou endereço livre. Tenta ViaCEP → Nominatim → Photon.
async function geocode(text) {
  const raw = String(text || '').trim().slice(0, 200);
  const key = `geo:${raw.toLowerCase()}`;
  return cached(key, CACHE_TTL_MS, async () => {
    let queryText = raw;
    let label = null;
    let postal = null;
    const cep = raw.replace(/\D/g, '');
    if (/^\d{8}$/.test(cep) && /^[\d\s.-]+$/.test(raw)) {
      postal = `${cep.slice(0, 5)}-${cep.slice(5)}`;
      try {
        const via = await fetchJson(`https://viacep.com.br/ws/${cep}/json/`, { timeoutMs: 6000 });
        if (via.erro) return null;
        queryText = [via.logradouro, via.bairro, via.localidade, via.uf].filter(Boolean).join(', ');
        label = [via.logradouro, via.bairro, `${via.localidade}/${via.uf}`].filter(Boolean).join(' · ');
      } catch { /* segue só com o CEP */ }
    }

    const attempts = [];
    attempts.push(async () => {
      const r = await fetchJson(`${NOMINATIM}/search?format=jsonv2&limit=1&countrycodes=br&addressdetails=1&q=${encodeURIComponent(queryText)}`, { timeoutMs: 8000 });
      return r[0] && { lat: Number(r[0].lat), lng: Number(r[0].lon), label: label || labelFromAddress(r[0].address || {}, r[0].display_name) };
    });
    if (postal) {
      attempts.push(async () => {
        const r = await fetchJson(`${NOMINATIM}/search?format=jsonv2&limit=1&countrycodes=br&addressdetails=1&postalcode=${postal}`, { timeoutMs: 8000 });
        return r[0] && { lat: Number(r[0].lat), lng: Number(r[0].lon), label: label || labelFromAddress(r[0].address || {}, r[0].display_name) };
      });
    }
    attempts.push(async () => {
      // Photon: viés para o centro do Brasil, filtra resultados do país.
      const r = await fetchJson(`${PHOTON}/api/?q=${encodeURIComponent(queryText + ', Brasil')}&limit=5&lat=-15.8&lon=-47.9`, { timeoutMs: 8000 });
      const f = (r.features || []).find(x => (x.properties.countrycode || '').toUpperCase() === 'BR');
      return f && { lat: f.geometry.coordinates[1], lng: f.geometry.coordinates[0], label: label || labelFromAddress(f.properties, f.properties.name) };
    });

    for (const attempt of attempts) {
      try {
        const found = await attempt();
        if (found) return found;
      } catch { /* tenta a próxima fonte */ }
    }
    return null;
  });
}

/* ---------------- localização aproximada pela internet (IP) ---------------- */

// Usada quando o GPS do aparelho está bloqueado ou indisponível. Precisão de bairro/cidade.
function isPublicIp(ip) {
  if (!ip) return false;
  if (/^(10\.|127\.|192\.168\.|169\.254\.|172\.(1[6-9]|2\d|3[01])\.|0\.)/.test(ip)) return false;
  if (/^(::1$|fc|fd|fe80)/i.test(ip)) return false;
  return /^[\d.]+$/.test(ip) || /^[0-9a-f:]+$/i.test(ip);
}

async function approximateLocation(ip) {
  if (!isPublicIp(ip)) return null;
  return cached(`ip:${ip}`, 6 * 60 * 60 * 1000, async () => {
    const providers = [
      async () => {
        const d = await fetchJson(`https://ipwho.is/${ip}?lang=pt-BR`, { timeoutMs: 6000 });
        return d.success && { lat: d.latitude, lng: d.longitude, city: d.city, region: d.region_code || d.region, country: d.country_code };
      },
      async () => {
        const d = await fetchJson(`https://freeipapi.com/api/json/${ip}`, { timeoutMs: 6000 });
        return d.latitude && { lat: d.latitude, lng: d.longitude, city: d.cityName, region: d.regionName, country: d.countryCode };
      },
      async () => {
        const d = await fetchJson(`https://ipapi.co/${ip}/json/`, { timeoutMs: 6000 });
        return d.latitude && { lat: d.latitude, lng: d.longitude, city: d.city, region: d.region_code || d.region, country: d.country_code };
      },
    ];
    for (const provider of providers) {
      try {
        const found = await provider();
        if (found && Number.isFinite(Number(found.lat)) && Number.isFinite(Number(found.lng))) {
          return {
            lat: Number(found.lat),
            lng: Number(found.lng),
            label: [found.city, found.region].filter(Boolean).join(', '),
            country: found.country || '',
          };
        }
      } catch { /* tenta o próximo serviço */ }
    }
    throw new Error('Serviços de localização por IP indisponíveis');
  });
}

module.exports = { nearbyPharmacies, reverseGeocode, geocode, approximateLocation };
