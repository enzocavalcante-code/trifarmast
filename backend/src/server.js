const express = require('express');
const cors = require('cors');
const config = require('./config');
const { migrate } = require('./db');
const { requireAuth } = require('./auth');
const { securityHeaders, rateLimit } = require('./security');
const { HttpError } = require('./errors');

const app = express();
app.disable('x-powered-by');
// A hospedagem fica na frente da API. Confiar no X-Forwarded-For inteiro ("true")
// deixaria qualquer um inventar o próprio IP; aqui só vale o trecho escrito
// pelos servidores da hospedagem.
app.set('trust proxy', config.trustProxy);
app.use(securityHeaders);

app.use(cors({
  // Sem CORS_ORIGINS configurado, libera qualquer origem (útil em desenvolvimento).
  origin: config.corsOrigins.length ? config.corsOrigins : true,
}));

// Usado também para "acordar" o serviço gratuito do Render enquanto a pessoa
// digita a senha: com ?warm=1 abre uma conexão com o banco antes do login.
app.get('/health', async (req, res) => {
  if (req.query.warm) {
    try { await require('./db').query('SELECT 1'); } catch { /* responde ok mesmo assim */ }
  }
  res.json({ ok: true });
});

// Teto geral por IP: segura enxurradas de pedidos sem atrapalhar o uso normal.
app.use('/api', rateLimit({ name: 'geral', windowMs: 5 * 60 * 1000, max: 1500 }));

// Corpo dos pedidos: 100 KB bastam para quase tudo. Só a foto de perfil e a
// receita aceitam mais — e só depois de conferida a sessão, para ninguém de
// fora despejar megabytes no servidor.
const corpo = limite => {
  const ler = express.json({ limit: limite });
  return (req, res, next) => (req.body ? next() : ler(req, res, next));
};
const corpoPequeno = corpo('100kb');
const temArquivo = req => req.path === '/api/me' || /^\/api\/orders\/\d+\/prescription$/.test(req.path);
app.use((req, res, next) => (temArquivo(req) ? next() : corpoPequeno(req, res, next)));

// Enquanto o banco não termina de preparar, a API responde "tente de novo"
// em vez de dar erro feio. O /health acima continua respondendo desde o início.
let bancoPronto = false;
app.use('/api', (req, res, next) => {
  if (bancoPronto) return next();
  res.status(503).json({ error: 'Estamos ligando o servidor. Tente de novo em alguns segundos.' });
});

app.use('/api/auth', require('./routes/auth'));
app.use('/api', require('./routes/catalog'));
app.use('/api/me', requireAuth, corpo('1mb'), require('./routes/me'));
app.use('/api/orders', requireAuth, corpo('12mb'), require('./routes/orders'));
app.use('/api/reminders', requireAuth, require('./routes/reminders'));
app.use('/api/stocks', requireAuth, require('./routes/stocks'));
app.use('/api/points', requireAuth, require('./routes/points'));
app.use('/api/places', requireAuth, require('./routes/places'));
app.use('/api/pickups', require('./routes/pickups'));   // balcão da farmácia: autentica pelo PIN, não por conta

app.use((req, res) => res.status(404).json({ error: 'Rota não encontrada.' }));

// eslint-disable-next-line no-unused-vars
app.use((err, req, res, next) => {
  if (err instanceof HttpError) {
    if (err.retryAfter) res.setHeader('Retry-After', String(err.retryAfter));
    return res.status(err.status).json({ error: err.message });
  }
  if (err.type === 'entity.too.large') return res.status(413).json({ error: 'Arquivo muito grande. Envie um arquivo de até 8 MB.' });
  if (err.type === 'entity.parse.failed') return res.status(400).json({ error: 'Não entendi os dados enviados.' });
  console.error(err);
  res.status(500).json({ error: 'Erro interno. Tente novamente em instantes.' });
});

// Abre a porta ANTES de falar com o banco: é isso que o Render espera para dar
// o deploy como bem-sucedido. Se o banco demorar ou estiver fora do ar, o
// serviço continua de pé e tenta de novo sozinho, em vez de derrubar o deploy.
app.listen(config.port, '0.0.0.0', () => console.log(`Trifarmas API rodando na porta ${config.port}`));

async function prepararBanco(tentativa = 1) {
  try {
    await migrate();
    bancoPronto = true;
    console.log('Banco de dados pronto.');
  } catch (err) {
    const espera = Math.min(5 * tentativa, 60);
    console.error(`Falha ao preparar o banco (tentativa ${tentativa}): ${err.message}. Nova tentativa em ${espera}s.`);
    setTimeout(() => prepararBanco(tentativa + 1), espera * 1000);
  }
}
prepararBanco();
