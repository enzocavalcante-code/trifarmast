const express = require('express');
const { OAuth2Client } = require('google-auth-library');
const config = require('../config');
const { query, transaction } = require('../db');
const { hashPassword, checkPassword, signToken } = require('../auth');
const { HttpError, asyncHandler } = require('../errors');
const { isValidAvatar } = require('../images');
const serialize = require('../serializers');

const router = express.Router();
const googleClient = new OAuth2Client(config.googleClientId);

const initialsAvatar = (seed, color) =>
  `https://api.dicebear.com/7.x/initials/svg?seed=${encodeURIComponent(seed)}&backgroundColor=${color}&textColor=ffffff`;

const normalizeEmail = email => String(email || '').trim().toLowerCase();

// Foto do Google em tamanho maior (o padrão vem com 96px).
const largeGooglePhoto = url => (url ? url.replace(/=s\d+(-c)?$/, '=s256-c') : null);

// Responde com a sessão. A mensagem de boas-vindas só é liberada uma vez por
// conta: o mesmo comando que a libera já marca como vista no banco.
async function sendSession(res, userRow, isNewUser) {
  const { rowCount } = await query(
    'UPDATE users SET welcome_seen = TRUE WHERE id = $1 AND welcome_seen = FALSE', [userRow.id]
  );
  res.json({
    token: signToken(userRow.id),
    user: serialize.user(userRow),
    isNewUser,
    showWelcome: rowCount === 1,
  });
}

async function createUser(client, { name, email, passwordHash = null, googleAccount = false, avatar, avatarCustom = false, googlePicture = null }) {
  const { rows: [user] } = await client.query(
    `INSERT INTO users (name, email, password_hash, google_account, avatar, avatar_custom, google_picture)
     VALUES ($1,$2,$3,$4,$5,$6,$7) RETURNING *`,
    [name, email, passwordHash, googleAccount, avatar, avatarCustom, googlePicture]
  );
  return user;
}

// Pelo botão da tela inicial (mode 'login') o Google só entra em conta que já existe:
// sem cadastro, o app leva a pessoa para a tela de criar conta. Pelo botão da tela de
// cadastro (mode 'signup') a conta é criada.
function requireExistingAccount(mode) {
  return mode !== 'signup';
}

async function findUserByEmail(email) {
  const { rows } = await query('SELECT 1 FROM users WHERE email = $1', [email]);
  return rows.length > 0;
}

// Resposta de "ainda não tem conta": o app usa os dados para abrir o cadastro já preenchido.
function sendNeedsSignup(res, profile) {
  res.status(404).json({
    error: 'Você ainda não tem conta no Trifarmas com esta Conta Google.',
    code: 'google_account_missing',
    profile,
  });
}

// Login com Google: cria a conta na primeira vez; nas próximas, atualiza a foto
// do Google — a menos que o usuário tenha escolhido uma foto manualmente.
async function upsertGoogleUser({ name, email, picture }) {
  const updated = await query(
    `UPDATE users
        SET google_picture = COALESCE($2, google_picture),
            avatar = CASE WHEN avatar_custom OR $2::text IS NULL THEN avatar ELSE $2 END
      WHERE email = $1
      RETURNING *`,
    [email, picture]
  );
  if (updated.rows[0]) return { row: updated.rows[0], isNewUser: false };

  const row = await transaction(client => createUser(client, {
    name,
    email,
    googleAccount: true,
    avatar: picture || initialsAvatar(name, '4285F4'),
    googlePicture: picture,
  }));
  return { row, isNewUser: true };
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
  await sendSession(res, user, false);
}));

router.post('/signup', asyncHandler(async (req, res) => {
  const name = String(req.body.name || '').trim();
  const email = normalizeEmail(req.body.email);
  const password = String(req.body.password || '');
  if (!name || !email || !password) throw new HttpError(400, 'Preencha todos os campos.');
  if (password.length < 6) throw new HttpError(400, 'A senha precisa ter pelo menos 6 caracteres.');

  const exists = await query('SELECT 1 FROM users WHERE email = $1', [email]);
  if (exists.rowCount) throw new HttpError(409, 'Já existe uma conta com este e-mail.');

  const chosePhoto = req.body.avatar && isValidAvatar(req.body.avatar);
  const user = await transaction(async client => createUser(client, {
    name,
    email,
    passwordHash: await hashPassword(password),
    avatar: chosePhoto ? req.body.avatar : initialsAvatar(name, '2fa85e'),
    avatarCustom: !!chosePhoto,
  }));
  await sendSession(res, user, true);
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

  const profile = {
    name: payload.name || payload.email.split('@')[0],
    email: normalizeEmail(payload.email),
    picture: largeGooglePhoto(payload.picture),
  };
  // Veio da tela inicial e não existe conta: manda criar a conta em vez de criar sozinho.
  if (requireExistingAccount(req.body.mode) && !(await findUserByEmail(profile.email))) {
    return sendNeedsSignup(res, profile);
  }

  const { row, isNewUser } = await upsertGoogleUser(profile);
  await sendSession(res, row, isNewUser);
}));

// "Usar conta demo" — só existe enquanto o login real do Google não estiver configurado.
// Usa sempre a mesma conta, para que dados e mensagem de boas-vindas se comportem como numa conta real.
router.post('/google-demo', asyncHandler(async (req, res) => {
  if (!config.allowDemoGoogle) throw new HttpError(403, 'Conta demo desativada.');
  const profile = { name: 'Conta Demo Google', email: 'demo.google@trifarmas.app', picture: null };
  // Mesma regra do login real: pela tela inicial, sem conta criada, vai para o cadastro.
  if (requireExistingAccount(req.body.mode) && !(await findUserByEmail(profile.email))) {
    return sendNeedsSignup(res, profile);
  }
  const { row, isNewUser } = await upsertGoogleUser(profile);
  await sendSession(res, row, isNewUser);
}));

module.exports = router;
