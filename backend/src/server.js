const express = require('express');
const cors = require('cors');
const config = require('./config');
const { migrate } = require('./db');
const { requireAuth } = require('./auth');
const { securityHeaders } = require('./security');
const { HttpError } = require('./errors');

const app = express();
// O Render fica na frente da API: confia no cabeçalho X-Forwarded-For para saber o IP real do usuário.
app.set('trust proxy', true);
app.use(securityHeaders);

app.use(cors({
  // Sem CORS_ORIGINS configurado, libera qualquer origem (útil em desenvolvimento).
  origin: config.corsOrigins.length ? config.corsOrigins : true,
}));
app.use(express.json({ limit: '12mb' })); // fotos de perfil e receitas chegam como data URL

// Usado também para "acordar" o serviço gratuito do Render enquanto a pessoa
// digita a senha: com ?warm=1 abre uma conexão com o banco antes do login.
app.get('/health', async (req, res) => {
  if (req.query.warm) {
    try { await require('./db').query('SELECT 1'); } catch { /* responde ok mesmo assim */ }
  }
  res.json({ ok: true });
});

// Enquanto o banco não termina de preparar, a API responde "tente de novo"
// em vez de dar erro feio. O /health acima continua respondendo desde o início.
let bancoPronto = false;
app.use('/api', (req, res, next) => {
  if (bancoPronto) return next();
  res.status(503).json({ error: 'Estamos ligando o servidor. Tente de novo em alguns segundos.' });
});

app.use('/api/auth', require('./routes/auth'));
app.use('/api', require('./routes/catalog'));
app.use('/api/me', requireAuth, require('./routes/me'));
app.use('/api/orders', requireAuth, require('./routes/orders'));
app.use('/api/reminders', requireAuth, require('./routes/reminders'));
app.use('/api/stocks', requireAuth, require('./routes/stocks'));
app.use('/api/points', requireAuth, require('./routes/points'));
app.use('/api/places', requireAuth, require('./routes/places'));
app.use('/api/pickups', require('./routes/pickups'));   // balcão da farmácia: autentica pelo PIN, não por conta

app.use((req, res) => res.status(404).json({ error: 'Rota não encontrada.' }));

// eslint-disable-next-line no-unused-vars
app.use((err, req, res, next) => {
  if (err instanceof HttpError) return res.status(err.status).json({ error: err.message });
  if (err.type === 'entity.too.large') return res.status(413).json({ error: 'Arquivo muito grande. Envie um arquivo de até 8 MB.' });
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
