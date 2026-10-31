/* Testes da API do Trifarmas contra um PostgreSQL de verdade.
 *
 * Como rodar:
 *   createdb trifarmas_test
 *   DATABASE_URL=postgres://postgres@localhost:5432/trifarmas_test npm test
 *
 * O arquivo sobe o próprio servidor numa porta de teste, espera o /health e
 * conversa com a API por HTTP — do jeito que o app e o site conversam.
 */

const test = require('node:test');
const assert = require('node:assert/strict');
const { spawn } = require('node:child_process');
const path = require('node:path');

const PORT = Number(process.env.TEST_PORT) || 3999;
const BASE = `http://127.0.0.1:${PORT}`;
const PIN = '4321';
const DEMO = { email: 'trifarmas@gmail.com', password: '123456' };

let server;

/* ---------------- utilidades ---------------- */

async function call(method, path, { body, token, pin } = {}) {
  const headers = { 'Content-Type': 'application/json' };
  if (token) headers.Authorization = `Bearer ${token}`;
  if (pin) headers['x-pharmacy-pin'] = pin;
  const res = await fetch(BASE + path, {
    method,
    headers,
    body: body === undefined ? undefined : JSON.stringify(body),
  });
  const text = await res.text();
  let data = null;
  try { data = text ? JSON.parse(text) : null; } catch { data = text; }
  return { status: res.status, data, headers: res.headers };
}

const get = (path, options) => call('GET', path, options);
const post = (path, body, options) => call('POST', path, { body, ...options });
const del = (path, options) => call('DELETE', path, options);

const wait = ms => new Promise(resolve => setTimeout(resolve, ms));
const uniqueEmail = suffix => `teste.${Date.now()}.${suffix}@trifarmas.test`;

// Espera o pedido chegar em "Pronto para retirar" (o status avança com o tempo).
async function waitForReady(token, orderId, timeoutMs = 20000) {
  const deadline = Date.now() + timeoutMs;
  while (Date.now() < deadline) {
    const { data } = await get('/api/orders', { token });
    const order = data.find(o => o.id === orderId);
    if (order && order.status === 'Pronto para retirar') return order;
    await wait(700);
  }
  throw new Error(`O pedido ${orderId} não ficou pronto no tempo esperado.`);
}

/* ---------------- sobe e derruba a API ---------------- */

test.before(async () => {
  if (!process.env.DATABASE_URL) throw new Error('Defina DATABASE_URL apontando para um banco de testes.');
  server = spawn(process.execPath, ['src/server.js'], {
    cwd: path.join(__dirname, '..'),
    env: {
      ...process.env,
      PORT: String(PORT),
      JWT_SECRET: 'segredo-de-teste',
      DATABASE_SSL: process.env.DATABASE_SSL || 'false',
      PHARMACY_PIN: PIN,
      PASSWORD_RESET_ECHO: 'true',
      ALLOW_DEMO_GOOGLE: 'true',
      SIMULATE_DAILY_PRICES: 'true',
    },
    stdio: ['ignore', 'pipe', 'pipe'],
  });
  let log = '';
  server.stdout.on('data', chunk => { log += chunk; });
  server.stderr.on('data', chunk => { log += chunk; });

  const deadline = Date.now() + 60000;
  while (Date.now() < deadline) {
    if (server.exitCode !== null) throw new Error(`A API não subiu:\n${log}`);
    try {
      const res = await fetch(`${BASE}/health`);
      if (res.ok) return;
    } catch { /* ainda subindo */ }
    await wait(400);
  }
  throw new Error(`A API não respondeu /health:\n${log}`);
});

test.after(() => { if (server) server.kill(); });

/* ---------------- testes ---------------- */

test('health e cabeçalhos de segurança', async () => {
  const { status, data, headers } = await get('/health');
  assert.equal(status, 200);
  assert.deepEqual(data, { ok: true });
  assert.equal(headers.get('x-content-type-options'), 'nosniff');
  assert.equal(headers.get('x-frame-options'), 'DENY');
  assert.equal(headers.get('referrer-policy'), 'no-referrer');
});

test('rotas desconhecidas e sem sessão', async () => {
  assert.equal((await get('/api/nao-existe')).status, 404);
  assert.equal((await get('/api/orders')).status, 401);
  assert.equal((await get('/api/me')).status, 401);
  assert.equal((await get('/api/orders', { token: 'token-invalido' })).status, 401);
});

test('catálogo traz farmácias, remédios e dados de equivalência', async () => {
  const { status, data } = await get('/api/catalog');
  assert.equal(status, 200);
  assert.ok(data.pharmacies.length >= 6);
  assert.ok(data.medicines.length >= 150);
  assert.equal(data.rewards.length, 4);

  const generico = data.medicines.find(m => m.id === 'm2');   // Paracetamol 750mg
  const marca = data.medicines.find(m => m.id === 'm11');     // Tylenol 750mg
  assert.equal(generico.equivGroup, marca.equivGroup, 'genérico e marca ficam no mesmo grupo');
  assert.equal(generico.generic, true);
  assert.equal(marca.generic, false);
  assert.equal(generico.units, 20);
  assert.equal(generico.unitLabel, 'comprimido');
  assert.ok(Object.keys(generico.prices).length >= 6);

  // Remédio sem dosagem no nome não entra em nenhum grupo (não se afirma equivalência).
  assert.equal(data.medicines.find(m => m.id === 'm12').equivGroup, '');
});

test('histórico de preços de um remédio', async () => {
  const { status, data } = await get('/api/medicines/m1/history');
  assert.equal(status, 200);
  assert.ok(data.days.length >= 1);
  assert.ok(data.currentMin > 0);
  assert.ok(data.lowest <= data.currentMin + 0.001);
  assert.equal((await get('/api/medicines/nao-existe/history')).status, 404);
});

test('cadastro valida os dados e cria a conta', async () => {
  const email = uniqueEmail('cadastro');
  assert.equal((await post('/api/auth/signup', { name: 'A', email, password: '123' })).status, 400);
  assert.equal((await post('/api/auth/signup', { name: 'A', email: 'sem-arroba', password: '123456' })).status, 400);

  const { status, data } = await post('/api/auth/signup', { name: 'Maria Teste', email, password: 'senha123' });
  assert.equal(status, 200);
  assert.ok(data.token);
  assert.equal(data.user.points, 0, 'conta nova começa com 0 pontos');
  assert.equal(data.showWelcome, true, 'boas-vindas na primeira entrada');
  assert.equal(data.user.hasPassword, true);

  // E-mail repetido não cria outra conta, e as boas-vindas não voltam.
  assert.equal((await post('/api/auth/signup', { name: 'Outra', email, password: 'senha123' })).status, 409);
  const again = await post('/api/auth/login', { email, password: 'senha123' });
  assert.equal(again.data.showWelcome, false);
});

test('senha errada bloqueia a conta e a recuperação devolve o acesso', async () => {
  const email = uniqueEmail('bloqueio');
  await post('/api/auth/signup', { name: 'João Teste', email, password: 'senha123' });

  let last;
  for (let i = 0; i < 5; i++) last = await post('/api/auth/login', { email, password: 'errada' });
  assert.equal(last.status, 429, 'bloqueia depois de 5 tentativas erradas');
  assert.match(last.data.error, /bloqueada/i);

  // Mesmo com a senha certa, a conta continua bloqueada.
  const blocked = await post('/api/auth/login', { email, password: 'senha123' });
  assert.equal(blocked.status, 429);

  // Recuperação de senha: código por e-mail (devolvido na resposta só em teste).
  const forgot = await post('/api/auth/password/forgot', { email });
  assert.equal(forgot.status, 200);
  assert.equal(forgot.data.sent, true);
  assert.match(String(forgot.data.code), /^\d{6}$/);

  assert.equal((await post('/api/auth/password/reset', { email, code: '000000', password: 'nova123' })).status, 400);
  const reset = await post('/api/auth/password/reset', { email, code: forgot.data.code, password: 'nova123' });
  assert.equal(reset.status, 200, 'o código correto troca a senha');
  assert.ok(reset.data.token);

  // O mesmo código não serve duas vezes, e a nova senha entra normalmente.
  assert.equal((await post('/api/auth/password/reset', { email, code: forgot.data.code, password: 'outra123' })).status, 400);
  assert.equal((await post('/api/auth/login', { email, password: 'nova123' })).status, 200);
  assert.equal((await post('/api/auth/login', { email, password: 'senha123' })).status, 401);
});

test('recuperação não revela se o e-mail existe', async () => {
  const { status, data } = await post('/api/auth/password/forgot', { email: uniqueEmail('inexistente') });
  assert.equal(status, 200);
  assert.equal(data.sent, true);
  assert.equal(data.code, undefined, 'sem conta, nenhum código é criado');
});

test('pedido: criação, código de retirada e confirmação pela farmácia', async () => {
  const { data: session } = await post('/api/auth/login', DEMO);
  const token = session.token;
  const pointsBefore = session.user.points;

  const created = await post('/api/orders', {
    pharmacyId: 'p1',
    paymentMethod: 'Pix',
    items: [{ medicineId: 'm1', quantity: 2 }, { medicineId: 'm2', quantity: 1 }],
  }, { token });
  assert.equal(created.status, 201);
  const order = created.data.order;
  assert.match(order.code, /^\d{6}$/);
  assert.equal(order.items.length, 2);
  assert.ok(order.paidAmount > 0);
  assert.equal(order.points, Math.floor(order.paidAmount));
  assert.equal(order.status, 'Pedido recebido');

  // O painel da farmácia exige a senha do balcão.
  assert.equal((await post('/api/pickups/lookup', { code: order.code, pin: 'errado' })).status, 401);
  assert.equal((await post('/api/pickups/lookup', { code: '000000', pin: PIN })).status, 404);
  assert.equal((await post('/api/pickups/lookup', { code: '12', pin: PIN })).status, 400);

  const lookup = await post('/api/pickups/lookup', { code: order.code, pin: PIN });
  assert.equal(lookup.status, 200);
  assert.equal(lookup.data.order.id, order.id);
  assert.equal(lookup.data.order.items.length, 2);
  assert.equal(lookup.data.order.customerFirstName, 'Trifarmas');

  // Antes de ficar pronto, a farmácia não consegue confirmar.
  const early = await post('/api/pickups/confirm', { code: order.code, pin: PIN });
  assert.equal(early.status, 400);

  await waitForReady(token, order.id);
  const confirmed = await post('/api/pickups/confirm', { code: order.code, pin: PIN });
  assert.equal(confirmed.status, 200);
  assert.equal(confirmed.data.confirmed, true);
  assert.equal(confirmed.data.order.status, 'Concluído');

  // Pontos creditados, aviso criado e o código não serve mais.
  const { data: points } = await get('/api/points', { token });
  assert.equal(points.points, pointsBefore + order.points);
  const { data: notices } = await get('/api/notifications', { token });
  assert.ok(notices.items.some(n => n.orderId === order.id && n.kind === 'order'));
  assert.equal(notices.unread >= 1, true);
  assert.equal((await post('/api/pickups/confirm', { code: order.code, pin: PIN })).status, 404);

  const { data: list } = await get('/api/orders', { token });
  const saved = list.find(o => o.id === order.id);
  assert.equal(saved.pickupConfirmedBy, 'pharmacy');
});

test('pedido com receita fica parado até o usuário escolher como apresentá-la', async () => {
  const { data: session } = await post('/api/auth/login', DEMO);
  const token = session.token;

  const { data: catalog } = await get('/api/catalog');
  const rx = catalog.medicines.find(m => m.rx && m.prices.p1 != null);

  const { data: { order } } = await post('/api/orders', {
    pharmacyId: 'p1', paymentMethod: 'Cartão de crédito', items: [{ medicineId: rx.id, quantity: 1 }],
  }, { token });
  assert.equal(order.requiresPrescription, true);
  assert.equal(order.status, 'Aguardando receita');

  // Enquanto não escolher, a farmácia não entrega.
  const blocked = await post('/api/pickups/confirm', { code: order.code, pin: PIN });
  assert.equal(blocked.status, 400);
  assert.match(blocked.data.error, /receita/i);

  assert.equal((await post(`/api/orders/${order.id}/prescription`, { choice: 'nada' }, { token })).status, 400);
  const chosen = await post(`/api/orders/${order.id}/prescription`, { choice: 'in_person' }, { token });
  assert.equal(chosen.status, 200);
  assert.equal(chosen.data.order.status, 'Em preparação');
  // A escolha vale uma vez só.
  assert.equal((await post(`/api/orders/${order.id}/prescription`, { choice: 'upload' }, { token })).status, 400);
});

test('carrinho dividido cria um pedido por farmácia', async () => {
  const { data: session } = await post('/api/auth/login', DEMO);
  const token = session.token;

  const single = await post('/api/orders/split', {
    paymentMethod: 'Pix', groups: [{ pharmacyId: 'p1', items: [{ medicineId: 'm1', quantity: 1 }] }],
  }, { token });
  assert.equal(single.status, 400, 'dividir exige pelo menos duas farmácias');

  const repeated = await post('/api/orders/split', {
    paymentMethod: 'Pix',
    groups: [
      { pharmacyId: 'p1', items: [{ medicineId: 'm1', quantity: 1 }] },
      { pharmacyId: 'p1', items: [{ medicineId: 'm2', quantity: 1 }] },
    ],
  }, { token });
  assert.equal(repeated.status, 400, 'a mesma farmácia não aparece duas vezes');

  const { status, data } = await post('/api/orders/split', {
    paymentMethod: 'Pix',
    groups: [
      { pharmacyId: 'p1', items: [{ medicineId: 'm1', quantity: 1 }] },
      { pharmacyId: 'p5', items: [{ medicineId: 'm2', quantity: 2 }] },
    ],
  }, { token });
  assert.equal(status, 201);
  assert.equal(data.orders.length, 2);
  assert.notEqual(data.orders[0].code, data.orders[1].code, 'cada pedido tem seu código');
  assert.deepEqual(data.orders.map(o => o.pharmacyName).sort(), ['Droga Raia', 'Ultrafarma']);
});

test('preços e quantidades vêm do banco, não do navegador', async () => {
  const { data: session } = await post('/api/auth/login', DEMO);
  const token = session.token;

  assert.equal((await post('/api/orders', { pharmacyId: 'p1', paymentMethod: 'Pix', items: [] }, { token })).status, 400);
  assert.equal((await post('/api/orders', { pharmacyId: 'p1', paymentMethod: 'Boleto', items: [{ medicineId: 'm1', quantity: 1 }] }, { token })).status, 400);
  assert.equal((await post('/api/orders', { pharmacyId: 'nao-existe', paymentMethod: 'Pix', items: [{ medicineId: 'm1', quantity: 1 }] }, { token })).status, 404);
  assert.equal((await post('/api/orders', { pharmacyId: 'p1', paymentMethod: 'Pix', items: [{ medicineId: 'nao-existe', quantity: 1 }] }, { token })).status, 404);

  // Preço enviado pelo cliente é ignorado: vale o do catálogo.
  const { data: catalog } = await get('/api/catalog');
  const expected = catalog.medicines.find(m => m.id === 'm1').prices.p1;
  const { data } = await post('/api/orders', {
    pharmacyId: 'p1', paymentMethod: 'Pix',
    items: [{ medicineId: 'm1', quantity: 1, unitPrice: 0.01 }],
  }, { token });
  assert.equal(data.order.items[0].unitPrice, expected);
  assert.equal(data.order.paidAmount, expected);
});

test('cupom: troca por pontos, desconto no pedido e não serve duas vezes', async () => {
  const { data: session } = await post('/api/auth/login', DEMO);
  const token = session.token;

  const redeemed = await post('/api/points/rewards/r1/redeem', {}, { token });
  assert.equal(redeemed.status, 201);
  const coupon = redeemed.data.coupon;
  assert.equal(coupon.amount, 5);
  assert.equal(redeemed.data.points, session.user.points - 100);

  const { data: { order } } = await post('/api/orders', {
    pharmacyId: 'p1', paymentMethod: 'Pix', couponId: coupon.id,
    items: [{ medicineId: 'm1', quantity: 2 }],
  }, { token });
  assert.equal(order.discount, 5);
  assert.equal(order.paidAmount, +(order.subtotal - 5).toFixed(2));
  assert.equal(order.couponName, coupon.name);

  const reused = await post('/api/orders', {
    pharmacyId: 'p1', paymentMethod: 'Pix', couponId: coupon.id,
    items: [{ medicineId: 'm1', quantity: 1 }],
  }, { token });
  assert.equal(reused.status, 400);

  // Cupom de outra pessoa também não serve.
  const email = uniqueEmail('cupom');
  const { data: other } = await post('/api/auth/signup', { name: 'Outra Pessoa', email, password: 'senha123' });
  const stolen = await post('/api/orders', {
    pharmacyId: 'p1', paymentMethod: 'Pix', couponId: coupon.id,
    items: [{ medicineId: 'm1', quantity: 1 }],
  }, { token: other.token });
  assert.equal(stolen.status, 400);
});

test('cupom com compra mínima só vale acima do valor', async () => {
  const { data: session } = await post('/api/auth/login', DEMO);
  const token = session.token;
  const { data: points } = await get('/api/points', { token });
  if (points.points < 380) return; // saldo insuficiente nesta execução

  const { data } = await post('/api/points/rewards/r3/redeem', {}, { token }); // R$20, mínimo R$80
  const small = await post('/api/orders', {
    pharmacyId: 'p1', paymentMethod: 'Pix', couponId: data.coupon.id,
    items: [{ medicineId: 'm1', quantity: 1 }],
  }, { token });
  assert.equal(small.status, 400);
  assert.match(small.data.error, /a partir de/i);
});

test('avisos de preço: cria, lista e apaga', async () => {
  const email = uniqueEmail('alerta');
  const { data: session } = await post('/api/auth/signup', { name: 'Alerta Teste', email, password: 'senha123' });
  const token = session.token;

  assert.deepEqual((await get('/api/alerts', { token })).data, []);
  assert.equal((await post('/api/alerts', { medicineId: 'nao-existe' }, { token })).status, 404);
  assert.equal((await post('/api/alerts', { medicineId: 'm1', targetPrice: -5 }, { token })).status, 400);

  const created = await post('/api/alerts', { medicineId: 'm1', targetPrice: 8.5 }, { token });
  assert.equal(created.status, 201);
  assert.equal(created.data.targetPrice, 8.5);
  assert.ok(created.data.referencePrice > 0);

  // Criar de novo o mesmo remédio atualiza o aviso (não duplica).
  const again = await post('/api/alerts', { medicineId: 'm1', targetPrice: null }, { token });
  assert.equal(again.data.targetPrice, null);
  assert.equal((await get('/api/alerts', { token })).data.length, 1);

  assert.equal((await del('/api/alerts/m1', { token })).status, 204);
  assert.deepEqual((await get('/api/alerts', { token })).data, []);
});

test('lembretes: cria, marca como disparado e apaga', async () => {
  const email = uniqueEmail('lembrete');
  const { data: session } = await post('/api/auth/signup', { name: 'Lembrete Teste', email, password: 'senha123' });
  const token = session.token;

  assert.equal((await post('/api/reminders', { med: '', time: '08:00' }, { token })).status, 400);
  assert.equal((await post('/api/reminders', { med: 'Losartana', time: 'oito' }, { token })).status, 400);

  const { status, data } = await post('/api/reminders', { med: 'Losartana 50mg', time: '08:00', day: 20, month: 9, year: 2026 }, { token });
  assert.equal(status, 201);
  assert.equal(data.med, 'Losartana 50mg');
  assert.equal(data.fired, false);

  await post('/api/reminders/fired', { ids: [data.id] }, { token });
  assert.equal((await get('/api/reminders', { token })).data[0].fired, true);
  assert.equal((await del(`/api/reminders/${data.id}`, { token })).status, 204);
  assert.deepEqual((await get('/api/reminders', { token })).data, []);
});

test('perfil: troca de senha exige a senha atual', async () => {
  const email = uniqueEmail('perfil');
  const { data: session } = await post('/api/auth/signup', { name: 'Perfil Teste', email, password: 'senha123' });
  const token = session.token;

  assert.equal((await call('PATCH', '/api/me', { token, body: { newPassword: 'nova123', confirmPassword: 'nova123' } })).status, 400);
  assert.equal((await call('PATCH', '/api/me', { token, body: { currentPassword: 'errada', newPassword: 'nova123', confirmPassword: 'nova123' } })).status, 400);
  assert.equal((await call('PATCH', '/api/me', { token, body: { currentPassword: 'senha123', newPassword: 'nova123', confirmPassword: 'outra123' } })).status, 400);

  const ok = await call('PATCH', '/api/me', { token, body: { name: 'Perfil Novo', currentPassword: 'senha123', newPassword: 'nova123', confirmPassword: 'nova123' } });
  assert.equal(ok.status, 200);
  assert.equal(ok.data.passwordChanged, true);
  assert.equal(ok.data.user.name, 'Perfil Novo');
  assert.equal((await post('/api/auth/login', { email, password: 'nova123' })).status, 200);
});

test('LGPD: baixar meus dados e excluir a conta', async () => {
  const email = uniqueEmail('lgpd');
  const { data: session } = await post('/api/auth/signup', { name: 'Ana Exclusão', email, password: 'senha123' });
  const token = session.token;
  await post('/api/orders', { pharmacyId: 'p1', paymentMethod: 'Pix', items: [{ medicineId: 'm1', quantity: 1 }] }, { token });
  await post('/api/reminders', { med: 'Dipirona', time: '09:00', day: 5, month: 10, year: 2026 }, { token });

  const exported = await get('/api/me/export', { token });
  assert.equal(exported.status, 200);
  assert.equal(exported.data.conta.email, email);
  assert.equal(exported.data.pedidos.length, 1);
  assert.equal(exported.data.pedidos[0].itens.length, 1);
  assert.equal(exported.data.lembretes.length, 1);

  assert.equal((await del('/api/me', { token })).status, 400, 'exclusão pede a senha');
  assert.equal((await call('DELETE', '/api/me', { token, body: { password: 'errada' } })).status, 400);

  const removed = await call('DELETE', '/api/me', { token, body: { password: 'senha123' } });
  assert.equal(removed.status, 204);
  assert.equal((await post('/api/auth/login', { email, password: 'senha123' })).status, 401);
  assert.equal((await get('/api/me', { token })).status, 401, 'o token antigo não vale mais');
});

test('limite de tentativas por e-mail devolve 429', async () => {
  const email = uniqueEmail('limite');
  let blocked = false;
  for (let i = 0; i < 10 && !blocked; i++) {
    const { status } = await post('/api/auth/login', { email, password: 'qualquer' });
    blocked = status === 429;
  }
  assert.equal(blocked, true, 'depois de várias tentativas o IP/e-mail é barrado');
});
