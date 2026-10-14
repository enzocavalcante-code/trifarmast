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
    if (!res.ok) throw new Error(data.error || 'Algo deu errado. Tente novamente.');
    return data;
  }

  const get = path => request('GET', path);
  const post = (path, body = {}) => request('POST', path, body);
  const patch = (path, body) => request('PATCH', path, body);
  const del = path => request('DELETE', path);

  return {
    setToken: t => { token = t; },

    // Autenticação
    login: (email, password) => post('/auth/login', { email, password }),
    signup: data => post('/auth/signup', data),
    googleLogin: credential => post('/auth/google', { credential }),
    googleDemo: mode => post('/auth/google-demo', { mode }),
    forgotPassword: email => post('/auth/password/forgot', { email }),
    resetPassword: data => post('/auth/password/reset', data),

    // Perfil
    updateMe: data => patch('/me', data),
    exportMyData: () => get('/me/export'),
    deleteAccount: data => request('DELETE', '/me', data),

    // Catálogo
    catalog: () => get('/catalog'),
    priceHistory: medicineId => get(`/medicines/${encodeURIComponent(medicineId)}/history`),

    // Pedidos
    orders: () => get('/orders'),
    createOrder: data => post('/orders', data),
    createSplitOrders: data => post('/orders/split', data),
    sendPrescription: (id, data) => post(`/orders/${id}/prescription`, data),
    getPrescription: id => get(`/orders/${id}/prescription`),

    // Avisos e alertas de preço
    notifications: () => get('/notifications'),
    markNotificationsRead: (ids = []) => post('/notifications/read', { ids }),
    priceAlerts: () => get('/alerts'),
    addPriceAlert: (medicineId, targetPrice = null) => post('/alerts', { medicineId, targetPrice }),
    removePriceAlert: medicineId => del(`/alerts/${encodeURIComponent(medicineId)}`),

    // Painel da farmácia (usa a senha do balcão, não a sessão do cliente)
    pickupLookup: (code, pin) => post('/pickups/lookup', { code, pin }),
    pickupConfirm: (code, pin) => post('/pickups/confirm', { code, pin }),

    // Lembretes
    reminders: () => get('/reminders'),
    addReminder: data => post('/reminders', data),
    removeReminder: id => del(`/reminders/${id}`),
    markRemindersFired: ids => post('/reminders/fired', { ids }),

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
