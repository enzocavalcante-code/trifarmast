/* Cliente da API do Trifarmas (backend no Render).
   Toda comunicação com o banco de dados passa por aqui. */

const api = (() => {
  const BASE = window.TRIFARMAS_CONFIG.API_URL.replace(/\/$/, '') + '/api';
  let token = null;

  async function request(method, path, body) {
    const headers = { 'Content-Type': 'application/json' };
    if (token) headers.Authorization = `Bearer ${token}`;

    let res;
    try {
      res = await fetch(BASE + path, { method, headers, body: body === undefined ? undefined : JSON.stringify(body) });
    } catch {
      throw new Error('Não foi possível conectar ao servidor. Verifique sua internet e tente novamente.');
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

    // Perfil
    updateMe: data => patch('/me', data),

    // Catálogo
    catalog: () => get('/catalog'),
    customMeds: () => get('/medicines/custom'),
    addCustomMed: name => post('/medicines/custom', { name }),

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
    markRemindersFired: ids => post('/reminders/fired', { ids }),

    // Pontos
    points: () => get('/points'),
    redeemReward: id => post(`/points/rewards/${id}/redeem`),
  };
})();
