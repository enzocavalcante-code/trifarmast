const express = require('express');
const cors = require('cors');
const config = require('./config');
const { migrate } = require('./db');
const { requireAuth } = require('./auth');
const { HttpError } = require('./errors');

const app = express();
// O Render fica na frente da API: confia no cabeçalho X-Forwarded-For para saber o IP real do usuário.
app.set('trust proxy', true);

app.use(cors({
  // Sem CORS_ORIGINS configurado, libera qualquer origem (útil em desenvolvimento).
  origin: config.corsOrigins.length ? config.corsOrigins : true,
}));
app.use(express.json({ limit: '12mb' })); // fotos de perfil e receitas chegam como data URL

app.get('/health', (req, res) => res.json({ ok: true }));

app.use('/api/auth', require('./routes/auth'));
app.use('/api', require('./routes/catalog'));
app.use('/api/me', requireAuth, require('./routes/me'));
app.use('/api/orders', requireAuth, require('./routes/orders'));
app.use('/api/reminders', requireAuth, require('./routes/reminders'));
app.use('/api/points', requireAuth, require('./routes/points'));
app.use('/api/places', requireAuth, require('./routes/places'));

app.use((req, res) => res.status(404).json({ error: 'Rota não encontrada.' }));

// eslint-disable-next-line no-unused-vars
app.use((err, req, res, next) => {
  if (err instanceof HttpError) return res.status(err.status).json({ error: err.message });
  if (err.type === 'entity.too.large') return res.status(413).json({ error: 'Arquivo muito grande. Envie um arquivo de até 8 MB.' });
  console.error(err);
  res.status(500).json({ error: 'Erro interno. Tente novamente em instantes.' });
});

migrate()
  .then(() => app.listen(config.port, () => console.log(`Trifarmas API rodando na porta ${config.port}`)))
  .catch(err => {
    console.error('Falha ao preparar o banco de dados:', err);
    process.exit(1);
  });
