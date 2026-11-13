/* Testes de segurança da API do Trifarmas (mesmo esquema do api.test.js):
 *   DATABASE_URL=postgres://postgres@localhost:5432/trifarmas_test node --test test/
 *
 * Cada teste tenta um ataque e confere que o servidor recusa.
 */

const test = require('node:test');
const assert = require('node:assert/strict');
const crypto = require('node:crypto');
const { spawn } = require('node:child_process');
const path = require('node:path');

const PORT = Number(process.env.TEST_PORT_SECURITY) || 3998;
const BASE = `http://127.0.0.1:${PORT}`;
const PIN = 'balcao-teste-2026';
const SECRET = 'segredo-de-teste-bem-comprido-0123456789';
const SITE = 'https://trifarmas.vercel.app';
const DEMO = { email: 'trifarmas@gmail.com', password: '123456' };

let server;

/* ---------------- utilidades ---------------- */

// `network` simula a rede de quem chama: é o IP que a hospedagem anota no fim
// do X-Forwarded-For. `forged` é o que um atacante escreveria no começo dele.
async function call(method, route, { body, raw, token, network, forged, origin } = {}) {
  const headers = { 'Content-Type': 'application/json' };
  if (token) headers.Authorization = `Bearer ${token}`;
  if (network) headers['X-Forwarded-For'] = forged ? `${forged}, ${network}` : network;
  if (origin) headers.Origin = origin;
  const res = await fetch(BASE + route, {
    method, headers,
    body: raw !== undefined ? raw : (body === undefined ? undefined : JSON.stringify(body)),
  });
  const text = await res.text();
  let data = null;
  try { data = text ? JSON.parse(text) : null; } catch { data = text; }
  return { status: res.status, data, headers: res.headers };
}
const get = (route, options) => call('GET', route, options);
const post = (route, body, options) => call('POST', route, { body, ...options });
const patch = (route, body, options) => call('PATCH', route, { body, ...options });

const wait = ms => new Promise(resolve => setTimeout(resolve, ms));
let counter = 0;
const uniqueEmail = tag => `seg.${Date.now()}.${++counter}.${tag}@trifarmas.test`;
const newNetwork = () => `203.0.${Math.floor(++counter / 250)}.${counter % 250 + 1}`;

async function newAccount(tag, password = 'senha-forte-1') {
  const email = uniqueEmail(tag);
  const { status, data } = await post('/api/auth/signup', { name: 'Teste Segurança', email, password }, { network: newNetwork() });
  assert.equal(status, 200, JSON.stringify(data));
  return { email, password, token: data.token };
}

const b64url = value => Buffer.from(value).toString('base64url');
function forgeToken(payload, { alg = 'HS256', secret = SECRET } = {}) {
  const head = `${b64url(JSON.stringify({ alg, typ: 'JWT' }))}.${b64url(JSON.stringify({ iat: Math.floor(Date.now() / 1000), exp: Math.floor(Date.now() / 1000) + 3600, ...payload }))}`;
  if (alg === 'none') return `${head}.`;
  const hash = { HS256: 'sha256', HS512: 'sha512' }[alg];
  return `${head}.${crypto.createHmac(hash, secret).update(head).digest('base64url')}`;
}
const tokenPayload = token => JSON.parse(Buffer.from(token.split('.')[1], 'base64url'));

const dataUrl = (mime, bytes) => `data:${mime};base64,${Buffer.from(bytes).toString('base64')}`;
const JPEG_HEAD = [0xFF, 0xD8, 0xFF, 0xE0, 0x00, 0x10, 0x4A, 0x46, 0x49, 0x46];
const jpeg = (size = 2000) => dataUrl('image/jpeg', Buffer.concat([Buffer.from(JPEG_HEAD), Buffer.alloc(size, 7)]));

/* ---------------- sobe e derruba a API ---------------- */

test.before(async () => {
  if (!process.env.DATABASE_URL) throw new Error('Defina DATABASE_URL apontando para um banco de testes.');
  server = spawn(process.execPath, ['src/server.js'], {
    cwd: path.join(__dirname, '..'),
    env: {
      ...process.env,
      PORT: String(PORT),
      JWT_SECRET: SECRET,
      DATABASE_SSL: process.env.DATABASE_SSL || 'false',
      PHARMACY_PIN: PIN,
      CORS_ORIGINS: SITE,
      GOOGLE_CLIENT_ID: 'cliente-de-teste',
      ALLOW_DEMO_GOOGLE: 'true',
      RENDER: '',
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
      const res = await fetch(`${BASE}/api/catalog`);
      if (res.ok) return;
    } catch { /* ainda subindo */ }
    await wait(400);
  }
  throw new Error(`A API não ficou pronta:\n${log}`);
});

test.after(() => { if (server) server.kill(); });

/* ---------------- cabeçalhos e origem ---------------- */

test('respostas não entregam a tecnologia do servidor nem ficam em cache', async () => {
  const account = await newAccount('cabecalho');
  const me = await get('/api/me', { token: account.token });
  assert.equal(me.status, 200);
  assert.equal(me.headers.get('x-powered-by'), null);
  assert.equal(me.headers.get('cache-control'), 'no-store');
  assert.equal(me.headers.get('x-frame-options'), 'DENY');
  assert.match((await get('/api/catalog')).headers.get('cache-control'), /public/);
});

test('só o site autorizado recebe permissão do navegador para chamar a API', async () => {
  const fromSite = await get('/api/catalog', { origin: SITE });
  assert.equal(fromSite.headers.get('access-control-allow-origin'), SITE);
  const fromElsewhere = await get('/api/catalog', { origin: 'https://site-malicioso.example' });
  assert.equal(fromElsewhere.headers.get('access-control-allow-origin'), null);
});

/* ---------------- sessão (token) ---------------- */

test('token forjado, sem assinatura ou com outro algoritmo é recusado', async () => {
  const account = await newAccount('token');
  const { sub, v } = tokenPayload(account.token);
  assert.equal((await get('/api/me', { token: forgeToken({ sub, v }) })).status, 200, 'o forjador de teste gera tokens válidos');

  assert.equal((await get('/api/me', { token: forgeToken({ sub, v }, { alg: 'none' }) })).status, 401);
  assert.equal((await get('/api/me', { token: forgeToken({ sub, v }, { secret: 'chute-do-atacante' }) })).status, 401);
  assert.equal((await get('/api/me', { token: forgeToken({ sub, v }, { alg: 'HS512' }) })).status, 401);
  assert.equal((await get('/api/me', { token: forgeToken({ sub, v, exp: 1000 }) })).status, 401, 'vencido');
  assert.equal((await get('/api/me', { token: forgeToken({ sub: 987654321, v: 0 }) })).status, 401, 'conta que não existe');
  assert.equal((await get('/api/me', { token: account.token.slice(0, -3) + 'abc' })).status, 401);
});

test('trocar a senha derruba as sessões abertas em outros aparelhos', async () => {
  const account = await newAccount('sessao');
  const other = await post('/api/auth/login', { email: account.email, password: account.password });
  assert.equal(other.status, 200);

  const changed = await patch('/api/me', { currentPassword: account.password, newPassword: 'senha-nova-22', confirmPassword: 'senha-nova-22' }, { token: account.token });
  assert.equal(changed.status, 200);
  assert.ok(changed.data.token, 'quem trocou a senha recebe um token novo');

  assert.equal((await get('/api/me', { token: other.data.token })).status, 401, 'o outro aparelho sai da conta');
  assert.equal((await get('/api/orders', { token: account.token })).status, 401, 'o token antigo deste aparelho também');
  assert.equal((await get('/api/me', { token: changed.data.token })).status, 200);
  assert.equal((await post('/api/auth/login', { email: account.email, password: account.password })).status, 401);
});

/* ---------------- conta ---------------- */

test('cadastro recusa senha fraca, senha gigante, nome gigante e e-mail torto', async () => {
  const network = newNetwork();
  const base = { name: 'Maria', email: uniqueEmail('cadastro'), password: 'senha-forte-1' };
  const signup = change => post('/api/auth/signup', { ...base, ...change }, { network });
  assert.equal((await signup({ password: '1234567' })).status, 400);
  assert.equal((await signup({ password: 'a'.repeat(73) })).status, 400);
  assert.equal((await signup({ name: 'N'.repeat(81) })).status, 400);
  assert.equal((await signup({ email: `${'e'.repeat(250)}@x.com` })).status, 400);
  assert.equal((await signup({ email: 'a@b' })).status, 400);
  assert.equal((await signup({ password: ['lista'] })).status, 400, 'tipos estranhos viram erro de validação, não erro interno');
  assert.equal((await signup({})).status, 200);
});

test('trocar o e-mail exige a senha atual e um e-mail válido', async () => {
  const account = await newAccount('email');
  const newEmail = uniqueEmail('email-novo');
  assert.equal((await patch('/api/me', { email: newEmail }, { token: account.token })).status, 400);
  assert.equal((await patch('/api/me', { email: newEmail, currentPassword: 'errada-1234' }, { token: account.token })).status, 400);
  assert.equal((await patch('/api/me', { email: 'nao-e-email', currentPassword: account.password }, { token: account.token })).status, 400);
  assert.equal((await patch('/api/me', { email: DEMO.email, currentPassword: account.password }, { token: account.token })).status, 409);
  assert.equal((await get('/api/me', { token: account.token })).data.email, account.email, 'nada mudou até aqui');

  const ok = await patch('/api/me', { email: newEmail, currentPassword: account.password }, { token: account.token });
  assert.equal(ok.status, 200);
  assert.equal(ok.data.user.email, newEmail);
  assert.equal(ok.data.passwordChanged, false);
  assert.equal((await patch('/api/me', { name: 'Só o nome' }, { token: account.token })).status, 200, 'nome continua livre');
});

test('chutes na senha atual (aparelho já logado) são limitados', async () => {
  const account = await newAccount('chute');
  let blocked = false;
  for (let i = 0; i < 12 && !blocked; i++) {
    const { status } = await patch('/api/me', { currentPassword: `chute-${i}-xxxx`, newPassword: 'outra-senha-1', confirmPassword: 'outra-senha-1' }, { token: account.token });
    blocked = status === 429;
  }
  assert.equal(blocked, true);
});

test('conta de demonstração: ninguém troca a senha ou o e-mail dela', async () => {
  const { data: session } = await post('/api/auth/login', DEMO);
  const token = session.token;
  const password = await patch('/api/me', { currentPassword: DEMO.password, newPassword: 'tomei-a-conta-1', confirmPassword: 'tomei-a-conta-1' }, { token });
  assert.equal(password.status, 403);
  const email = await patch('/api/me', { email: uniqueEmail('roubo'), currentPassword: DEMO.password }, { token });
  assert.equal(email.status, 403);
  assert.equal((await post('/api/auth/login', DEMO)).status, 200, 'a senha publicada continua valendo');
  assert.equal((await patch('/api/me', { name: 'Trifarmas' }, { token })).status, 200);
});

test('login do Google recusa credencial inválida, e a conta demo fica desligada', async () => {
  assert.equal((await post('/api/auth/google', { credential: 'lixo', mode: 'signup' })).status, 401);
  assert.equal((await post('/api/auth/google', { mode: 'signup' })).status, 401);
  assert.equal((await post('/api/auth/google-demo', { mode: 'signup' })).status, 403, 'com o Google configurado não existe conta demo');
});

/* ---------------- arquivos e tamanho dos pedidos ---------------- */

test('foto de perfil: só imagem de verdade, pequena e enviada pelo app', async () => {
  const account = await newAccount('foto');
  const send = avatar => patch('/api/me', { avatar }, { token: account.token });
  assert.equal((await send('https://rastreador.example/pixel.png')).status, 400, 'link externo');
  assert.equal((await send('https://x.example/a.png" onerror="alert(1)')).status, 400);
  assert.equal((await send(dataUrl('image/svg+xml', '<svg xmlns="http://www.w3.org/2000/svg" onload="alert(1)"/>'))).status, 400, 'SVG pode carregar script');
  assert.equal((await send(dataUrl('image/png', '<script>alert(1)</script>'))).status, 400, 'conteúdo não bate com o tipo');
  assert.equal((await send(dataUrl('text/html', '<h1>oi</h1>'))).status, 400);
  assert.equal((await send(jpeg(600 * 1024))).status, 400, 'acima de 512 KB');
  const ok = await send(jpeg());
  assert.equal(ok.status, 200);
  assert.equal(ok.data.user.avatarCustom, true);
});

test('pedidos grandes demais são cortados, e arquivo só entra com sessão', async () => {
  const big = size => JSON.stringify({ email: 'a@b.com', password: 'x'.repeat(size) });
  assert.equal((await call('POST', '/api/auth/login', { raw: big(200 * 1024) })).status, 413, 'login não aceita 200 KB');
  assert.equal((await call('POST', '/api/auth/signup', { raw: big(200 * 1024), network: newNetwork() })).status, 413);

  const account = await newAccount('tamanho');
  assert.equal((await call('PATCH', '/api/me', { raw: JSON.stringify({ avatar: jpeg(3 * 1024 * 1024) }) })).status, 401, 'sem sessão nem lê o arquivo');
  assert.equal((await call('PATCH', '/api/me', { raw: JSON.stringify({ avatar: jpeg(3 * 1024 * 1024) }), token: account.token })).status, 413);
  assert.equal((await call('POST', '/api/reminders', { raw: JSON.stringify({ med: 'x'.repeat(300 * 1024), time: '08:00' }), token: account.token })).status, 413);
  assert.equal((await call('POST', '/api/orders/1/prescription', { raw: JSON.stringify({ choice: 'upload', file: 'x'.repeat(13 * 1024 * 1024) }), token: account.token })).status, 413);
  assert.equal((await call('POST', '/api/orders/1/prescription', { raw: JSON.stringify({ choice: 'upload', file: 'x'.repeat(13 * 1024 * 1024) }) })).status, 401);
});

test('dados malformados viram erro 400, não erro interno', async () => {
  const account = await newAccount('malformado');
  assert.equal((await call('POST', '/api/auth/login', { raw: '{"email": ' })).status, 400);
  assert.equal((await call('POST', '/api/auth/login', { raw: '"texto solto"' })).status, 400);
  assert.equal((await post('/api/auth/login', { email: { $ne: '' }, password: { $ne: '' } })).status, 400);
  assert.equal((await post('/api/auth/login', { email: "a'or'1'='1'--@x.com", password: "' OR '1'='1" })).status, 401, 'injeção de SQL é só um e-mail que não existe');
  assert.equal((await call('DELETE', "/api/reminders/1;DROP TABLE users", { token: account.token })).status, 404);
  assert.equal((await post('/api/reminders', { med: 'Losartana', time: '08:00', day: 40, month: 1, year: 2026 }, { token: account.token })).status, 400);
  assert.equal((await post('/api/reminders', { med: 'Losartana', time: '25:99', day: 4, month: 1, year: 2026 }, { token: account.token })).status, 400);
  const long = await post('/api/reminders', { med: 'L'.repeat(5000), time: '08:00', day: 4, month: 1, year: 2026 }, { token: account.token });
  assert.equal(long.status, 201);
  assert.equal(long.data.med.length, 120);
  assert.equal((await get('/api/places/pharmacies?lat=1&lng=2')).status, 401, 'mapa só para quem está logado');
});

test('receita: o conteúdo do arquivo precisa bater com o tipo; código de retirada tem 6 dígitos', async () => {
  const account = await newAccount('receita');
  const { data: catalog } = await get('/api/catalog');
  const rx = catalog.medicines.find(m => m.rx);
  const pharmacyId = Object.keys(rx.prices)[0];
  const created = await post('/api/orders', { pharmacyId, paymentMethod: 'Pix', items: [{ medicineId: rx.id, quantity: 1 }] }, { token: account.token });
  assert.equal(created.status, 201, JSON.stringify(created.data));
  const { order } = created.data;
  assert.match(order.code, /^\d{6}$/);

  const send = file => post(`/api/orders/${order.id}/prescription`, { choice: 'upload', file, fileName: 'receita.pdf' }, { token: account.token });
  assert.equal((await send(dataUrl('application/pdf', 'MZ\x90\x00 programa disfarçado'))).status, 400);
  assert.equal((await send(dataUrl('application/x-msdownload', 'MZ\x90\x00'))).status, 400);
  assert.equal((await send(dataUrl('text/html', '<script>alert(1)</script>'))).status, 400);
  assert.equal((await send(dataUrl('application/pdf', '%PDF-1.7\n1 0 obj'))).status, 200);

  // Outra conta não enxerga nem mexe neste pedido.
  const stranger = await newAccount('estranho');
  assert.equal((await get(`/api/orders/${order.id}/prescription`, { token: stranger.token })).status, 404);
  assert.equal((await post(`/api/orders/${order.id}/pickup`, {}, { token: stranger.token })).status, 404);
  assert.equal((await get('/api/orders', { token: stranger.token })).data.length, 0);
});

/* ---------------- força bruta ---------------- */

test('IP inventado no X-Forwarded-For não escapa do limite de senha', async () => {
  const account = await newAccount('ip-falso');
  const network = newNetwork();
  let blocked = false;
  for (let i = 0; i < 12 && !blocked; i++) {
    const { status } = await post('/api/auth/login', { email: account.email, password: `chute-${i}` }, { network, forged: `198.51.100.${i + 1}` });
    blocked = status === 429;
  }
  assert.equal(blocked, true, 'o servidor usa o IP anotado pela hospedagem, não o que o atacante escreveu');
});

test('trocar de rede a cada chute também não adianta: a conta trava depois de 30 erros', async () => {
  const account = await newAccount('redes');
  let tries = 0;
  let blocked = false;
  while (tries < 40 && !blocked) {
    tries += 1;
    const { status } = await post('/api/auth/login', { email: account.email, password: `chute-${tries}` }, { network: newNetwork() });
    blocked = status === 429;
  }
  assert.equal(blocked, true);
  assert.ok(tries <= 31, `travou na tentativa ${tries}`);
  const right = await post('/api/auth/login', { email: account.email, password: account.password }, { network: newNetwork() });
  assert.equal(right.status, 429, 'enquanto está travada, nem a senha certa entra (senão o chute certo passaria)');
});

test('chutes simultâneos não furam o limite', async () => {
  const account = await newAccount('rajada');
  const network = newNetwork();
  const results = await Promise.all(Array.from({ length: 40 }, (_, i) =>
    post('/api/auth/login', { email: account.email, password: `chute-${i}` }, { network })));
  const checked = results.filter(r => r.status === 401).length;
  assert.equal(checked, 8, 'só 8 senhas chegaram a ser conferidas');
});

test('quem acerta a senha não gasta tentativa', async () => {
  const account = await newAccount('acerto');
  const network = newNetwork();
  for (let i = 0; i < 20; i++) {
    const { status } = await post('/api/auth/login', { email: account.email, password: account.password }, { network });
    assert.equal(status, 200);
  }
});

test('cadastros em massa da mesma rede são barrados', async () => {
  const network = newNetwork();
  let created = 0;
  let blocked = false;
  while (created < 40 && !blocked) {
    const { status } = await post('/api/auth/signup', { name: 'Robô', email: uniqueEmail('robo'), password: 'senha-forte-1' }, { network });
    blocked = status === 429;
    if (!blocked) created += 1;
  }
  assert.equal(blocked, true);
  assert.equal(created, 30);
});

test('IP de quem chama: no Render vale o cabeçalho da Cloudflare, fora dele não', () => {
  const { clientIp } = require('../src/security');
  const req = headers => ({ ip: '10.0.0.1', get: name => headers[name.toLowerCase()] });
  const before = process.env.RENDER;
  process.env.RENDER = 'true';
  assert.equal(clientIp(req({ 'cf-connecting-ip': '200.1.2.3' })), '200.1.2.3');
  assert.equal(clientIp(req({})), '10.0.0.1');
  process.env.RENDER = '';
  assert.equal(clientIp(req({ 'cf-connecting-ip': '200.1.2.3' })), '10.0.0.1', 'fora do Render qualquer um escreveria esse cabeçalho');
  process.env.RENDER = before || '';
});

/* ---------------- painel da farmácia (por último: trava o painel) ---------------- */

test('senha do balcão: 10 erros travam a rede, a senha certa não gasta tentativa', async () => {
  const lookup = (pin, network) => post('/api/pickups/lookup', { code: '000000', pin }, { network });
  const staff = newNetwork();
  for (let i = 0; i < 15; i++) assert.equal((await lookup(PIN, staff)).status, 404, 'senha certa + código inexistente');

  const attacker = newNetwork();
  const statuses = [];
  for (let i = 0; i < 12; i++) statuses.push((await lookup(`chute-${i}`, attacker)).status);
  assert.deepEqual(statuses.slice(0, 10), Array(10).fill(401));
  assert.deepEqual(statuses.slice(10), [429, 429]);
  assert.equal((await lookup(PIN, attacker)).status, 429, 'rede travada não testa nem a senha certa');
  assert.equal((await lookup(PIN, staff)).status, 404, 'o balcão de verdade continua funcionando');
  assert.equal((await lookup('', newNetwork())).status, 401);
});

test('senha do balcão: trocar de rede a cada chute trava o painel depois de 100 erros', async () => {
  const lookup = (pin, network) => post('/api/pickups/lookup', { code: '000000', pin }, { network });
  let tries = 0;
  let blocked = false;
  while (tries < 120 && !blocked) {
    tries += 1;
    blocked = (await lookup(`chute-${tries}`, newNetwork())).status === 429;
  }
  assert.equal(blocked, true);
  assert.ok(tries <= 101, `travou na tentativa ${tries}`);
});
