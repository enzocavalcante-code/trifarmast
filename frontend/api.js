/* Cliente da API do Trifarmas (backend no Render).
   Toda comunicação com o banco de dados passa por aqui. */

const api = (() => {
  const BASE = window.TRIFARMAS_CONFIG.API_URL.replace(/\/$/, '') + '/api';
  let token = null;

  async function request(method, path, body) {
    const headers = { 'Content-Type': 'application/json' };
    if (token) headers.Authorization = `Bearer ${token}`;

    let res;
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), 60000); // a API gratuita pode levar ~50s para "acordar"
    try {
      res = await fetch(BASE + path, { method, headers, body: body === undefined ? undefined : JSON.stringify(body), signal: controller.signal });
    } catch {
      throw new Error('Não foi possível conectar ao servidor. Verifique sua internet e tente novamente.');
    } finally {
      clearTimeout(timer);
    }
    if (res.status === 204) return null;
    const data = await res.json().catch(() => ({}));
    if (!res.ok) {
      // Alguns erros trazem informação extra (ex.: conta Google sem cadastro).
      const error = new Error(data.error || 'Algo deu errado. Tente novamente.');
      error.code = data.code || null;
      error.status = res.status;
      error.data = data;
      throw error;
    }
    return data;
  }

  const get = path => request('GET', path);
  const post = (path, body = {}) => request('POST', path, body);
  const patch = (path, body) => request('PATCH', path, body);
  const del = path => request('DELETE', path);

  // "Acorda" a API gratuita do Render enquanto a pessoa ainda está na tela de
  // login: sem isso, o primeiro acesso do dia espera o servidor subir (~50 s).
  let warmingUp = null;
  function warmUp() {
    if (warmingUp) return warmingUp;
    const started = Date.now();
    warmingUp = fetch(`${BASE.replace(/\/api$/, '')}/health?warm=1`, { cache: 'no-store' })
      .then(() => ({ ok: true, ms: Date.now() - started }))
      .catch(() => ({ ok: false, ms: Date.now() - started }));
    return warmingUp;
  }

  return {
    setToken: t => { token = t; },
    warmUp,

    // Autenticação
    login: (email, password) => post('/auth/login', { email, password }),
    signup: data => post('/auth/signup', data),
    // mode: 'login' (tela inicial, só entra em conta existente) ou 'signup' (cria a conta)
    googleLogin: (credential, mode = 'login') => post('/auth/google', { credential, mode }),
    googleDemo: mode => post('/auth/google-demo', { mode }),

    // Perfil
    updateMe: data => patch('/me', data),

    // Catálogo
    catalog: () => get('/catalog'),

    // Pedidos
    orders: () => get('/orders'),
    createOrder: data => post('/orders', data),
    confirmPickup: id => post(`/orders/${id}/pickup`),
    sendPrescription: (id, data) => post(`/orders/${id}/prescription`, data),
    getPrescription: id => get(`/orders/${id}/prescription`),

    // Lembretes
    reminders: () => get('/reminders'),
    addReminder: data => post('/reminders', data),
    removeReminder: id => del(`/reminders/${id}`),
    // consume=false: lembrete vencido há horas, não desconta do estoque
    markRemindersFired: (ids, consume = true) => post('/reminders/fired', { ids, consume }),

    // Estoque em casa (quantas unidades a pessoa tem de cada remédio)
    stocks: () => get('/stocks'),
    saveStock: data => request('PUT', '/stocks', data),
    removeStock: key => del(`/stocks/${encodeURIComponent(key)}`),

    // Localização (farmácias próximas e endereços)
    nearbyPharmacies: (lat, lng) => get(`/places/pharmacies?lat=${lat}&lng=${lng}`),
    reverseGeocode: (lat, lng) => get(`/places/reverse?lat=${lat}&lng=${lng}`),
    geocode: q => get(`/places/search?q=${encodeURIComponent(q)}`),
    approximateLocation: () => get('/places/approximate'),

    // Pontos
    points: () => get('/points'),
    redeemReward: id => post(`/points/rewards/${id}/redeem`),
  };
})();
