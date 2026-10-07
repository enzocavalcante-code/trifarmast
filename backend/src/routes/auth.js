const express = require('express');
const { OAuth2Client } = require('google-auth-library');
const config = require('../config');
const { query } = require('../db');
const { hashPassword, checkPassword, signToken } = require('../auth');
const { HttpError, asyncHandler } = require('../errors');
const serialize = require('../serializers');

const router = express.Router();
const googleClient = new OAuth2Client(config.googleClientId);

const WELCOME_BONUS_POINTS = 50;

const initialsAvatar = (seed, color) =>
  `https://api.dicebear.com/7.x/initials/svg?seed=${encodeURIComponent(seed)}&backgroundColor=${color}&textColor=ffffff`;

const normalizeEmail = email => String(email || '').trim().toLowerCase();

function sendSession(res, userRow, isNewUser) {
  res.json({ token: signToken(userRow.id), user: serialize.user(userRow), isNewUser });
}

// Login de conta Google: cria o usuário na primeira vez (com bônus) ou reaproveita o existente.
async function upsertGoogleUser({ name, email, avatar, initialPoints }) {
  const existing = await query('SELECT * FROM users WHERE email = $1', [email]);
  if (existing.rows[0]) return { row: existing.rows[0], isNewUser: false };
  const created = await query(
    `INSERT INTO users (name, email, google_account, avatar, points) VALUES ($1,$2,TRUE,$3,$4) RETURNING *`,
    [name, email, avatar, initialPoints]
  );
  return { row: created.rows[0], isNewUser: true };
}

router.post('/login', asyncHandler(async (req, res) => {
  const email = normalizeEmail(req.body.email);
  const password = String(req.body.password || '');
  if (!email || !password) throw new HttpError(400, 'Preencha e-mail e senha para continuar.');

  const { rows } = await query('SELECT * FROM users WHERE email = $1', [email]);
  const user = rows[0];
  if (user && user.google_account && !user.password_hash) {
    throw new HttpError(401, 'Esta conta usa login do Google. Entre pelo botão do Google.');
  }
  if (!user || !(await checkPassword(password, user.password_hash))) {
    throw new HttpError(401, 'E-mail ou senha incorretos.');
  }
  sendSession(res, user, false);
}));

router.post('/signup', asyncHandler(async (req, res) => {
  const name = String(req.body.name || '').trim();
  const email = normalizeEmail(req.body.email);
  const password = String(req.body.password || '');
  if (!name || !email || !password) throw new HttpError(400, 'Preencha todos os campos.');

  const exists = await query('SELECT 1 FROM users WHERE email = $1', [email]);
  if (exists.rowCount) throw new HttpError(409, 'Já existe uma conta com este e-mail.');

  const avatar = req.body.avatar || initialsAvatar(name, '2fa85e');
  const { rows } = await query(
    `INSERT INTO users (name, email, password_hash, avatar, points) VALUES ($1,$2,$3,$4,$5) RETURNING *`,
    [name, email, await hashPassword(password), avatar, WELCOME_BONUS_POINTS]
  );
  sendSession(res, rows[0], true);
}));

// Recebe o ID Token (JWT) do Google e valida a assinatura no servidor.
router.post('/google', asyncHandler(async (req, res) => {
  if (!config.googleClientId) throw new HttpError(503, 'Login com Google não configurado no servidor.');
  let payload;
  try {
    const ticket = await googleClient.verifyIdToken({ idToken: req.body.credential, audience: config.googleClientId });
    payload = ticket.getPayload();
  } catch {
    throw new HttpError(401, 'Não foi possível ler os dados da sua conta Google.');
  }
  if (!payload || !payload.email) throw new HttpError(401, 'Não foi possível ler os dados da sua conta Google.');

  const name = payload.name || payload.email.split('@')[0];
  const { row, isNewUser } = await upsertGoogleUser({
    name,
    email: normalizeEmail(payload.email),
    avatar: payload.picture || initialsAvatar(name || 'G', '4285F4'),
    initialPoints: WELCOME_BONUS_POINTS,
  });
  sendSession(res, row, isNewUser);
}));

// "Usar conta demo" — só existe enquanto o login real do Google não estiver configurado.
const DEMO_NAMES = ['Ana Beatriz Silva', 'Carlos Eduardo Souza', 'Marina Costa Lima', 'João Pedro Alves'];
router.post('/google-demo', asyncHandler(async (req, res) => {
  if (!config.allowDemoGoogle) throw new HttpError(403, 'Conta demo desativada.');
  const name = DEMO_NAMES[Math.floor(Math.random() * DEMO_NAMES.length)];
  const email = name.toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '').replace(/[^a-z]+/g, '.') + '@gmail.com';
  const { row, isNewUser } = await upsertGoogleUser({
    name,
    email,
    avatar: initialsAvatar(name, '4285F4'),
    initialPoints: req.body.mode === 'signup' ? WELCOME_BONUS_POINTS : 340,
  });
  sendSession(res, row, isNewUser);
}));

module.exports = router;
