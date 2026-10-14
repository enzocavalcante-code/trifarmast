const express = require('express');
const { OAuth2Client } = require('google-auth-library');
const config = require('../config');
const { query, transaction } = require('../db');
const { hashPassword, checkPassword, signToken, randomDigits, hashCode, sameCode } = require('../auth');
const { HttpError, asyncHandler } = require('../errors');
const { isValidAvatar } = require('../images');
const { rateLimit, clearLimit, minutes } = require('../security');
const { sendEmail } = require('../mailer');
const serialize = require('../serializers');

const router = express.Router();
const googleClient = new OAuth2Client(config.googleClientId);

const initialsAvatar = (seed, color) =>
  `https://api.dicebear.com/7.x/initials/svg?seed=${encodeURIComponent(seed)}&backgroundColor=${color}&textColor=ffffff`;

const normalizeEmail = email => String(email || '').trim().toLowerCase();

// Foto do Google em tamanho maior (o padrão vem com 96px).
const largeGooglePhoto = url => (url ? url.replace(/=s\d+(-c)?$/, '=s256-c') : null);

/* ---------------- proteção contra tentativas em massa ---------------- */

const MAX_FAILED_LOGINS = 5;              // erros na mesma conta antes do bloqueio
const LOCK_MINUTES = 15;                  // tempo de bloqueio da conta
const RESET_CODE_TTL_MINUTES = 15;        // validade do código de recuperação
const RESET_MAX_ATTEMPTS = 6;             // tentativas de digitar o código

const byEmail = req => normalizeEmail(req.body && req.body.email);

// Limites por IP (memória do processo) — somados ao bloqueio por conta no banco.
// O limite por IP é alto (várias pessoas podem usar a mesma internet); o freio
// de verdade é o limite por e-mail e o bloqueio da conta.
const limitLogin = rateLimit({ name: 'login', windowMs: 15 * 60 * 1000, max: 40 });
const limitLoginEmail = rateLimit({ name: 'login-email', windowMs: 15 * 60 * 1000, max: 8, by: byEmail });
// Cadastro: trava criação em massa, mas com folga para várias pessoas na mesma
// internet (uma sala de aula, por exemplo) criarem conta ao mesmo tempo.
const limitSignup = rateLimit({ name: 'signup', windowMs: 60 * 60 * 1000, max: 20, message: 'Muitas contas criadas desta internet. Tente novamente mais tarde.' });
const limitForgot = rateLimit({ name: 'forgot', windowMs: 15 * 60 * 1000, max: 5, message: 'Muitos pedidos de recuperação. Tente novamente em alguns minutos.' });
const limitReset = rateLimit({ name: 'reset', windowMs: 15 * 60 * 1000, max: 10 });

/* ---------------- sessão ---------------- */

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

// Login com Google: cria a conta na primeira vez; nas próximas, atualiza a foto
// do Google — a menos que o usuário tenha escolhido uma foto manualmente.
async function upsertGoogleUser({ name, email, picture }) {
  const updated = await query(
    `UPDATE users
        SET google_picture = COALESCE($2, google_picture),
            google_account = TRUE,
            failed_logins = 0,
            locked_until = NULL,
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

/* ---------------- login e cadastro ---------------- */

router.post('/login', limitLogin, limitLoginEmail, asyncHandler(async (req, res) => {
  const email = normalizeEmail(req.body.email);
  const password = String(req.body.password || '');
  if (!email || !password) throw new HttpError(400, 'Preencha e-mail e senha para continuar.');

  const { rows } = await query('SELECT * FROM users WHERE email = $1', [email]);
  const user = rows[0];

  if (user && user.locked_until && new Date(user.locked_until) > new Date()) {
    const left = minutes((new Date(user.locked_until) - Date.now()) / 1000);
    throw new HttpError(429, `Conta bloqueada por ${LOCK_MINUTES} min após várias tentativas erradas. Tente de novo em ${left} min ou use "Esqueci minha senha".`);
  }
  if (user && user.google_account && !user.password_hash) {
    throw new HttpError(401, 'Esta conta usa login do Google. Entre pelo botão do Google.');
  }
  if (!user || !(await checkPassword(password, user.password_hash))) {
    if (user) {
      // Conta o erro e bloqueia a conta por alguns minutos depois de várias tentativas.
      const { rows: [updated] } = await query(
        `UPDATE users
            SET failed_logins = failed_logins + 1,
                locked_until = CASE WHEN failed_logins + 1 >= $2 THEN NOW() + ($3 || ' minutes')::interval ELSE locked_until END
          WHERE id = $1
          RETURNING failed_logins, locked_until`,
        [user.id, MAX_FAILED_LOGINS, String(LOCK_MINUTES)]
      );
      if (updated.locked_until && new Date(updated.locked_until) > new Date()) {
        throw new HttpError(429, `Conta bloqueada por ${LOCK_MINUTES} min após ${MAX_FAILED_LOGINS} tentativas erradas. Use "Esqueci minha senha" se precisar entrar agora.`);
      }
      const left = MAX_FAILED_LOGINS - updated.failed_logins;
      if (left <= 2) throw new HttpError(401, `E-mail ou senha incorretos. ${left} ${left === 1 ? 'tentativa' : 'tentativas'} antes de a conta ser bloqueada por ${LOCK_MINUTES} min.`);
    }
    throw new HttpError(401, 'E-mail ou senha incorretos.');
  }

  if (user.failed_logins > 0 || user.locked_until) {
    await query('UPDATE users SET failed_logins = 0, locked_until = NULL WHERE id = $1', [user.id]);
  }
  clearLimit('login-email', req, email);
  await sendSession(res, user, false);
}));

router.post('/signup', limitSignup, asyncHandler(async (req, res) => {
  const name = String(req.body.name || '').trim();
  const email = normalizeEmail(req.body.email);
  const password = String(req.body.password || '');
  if (!name || !email || !password) throw new HttpError(400, 'Preencha todos os campos.');
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test(email)) throw new HttpError(400, 'Digite um e-mail válido.');
  if (name.length > 120) throw new HttpError(400, 'Nome muito longo.');
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

/* ---------------- recuperação de senha ---------------- */

// Pede o código. A resposta é sempre a mesma, exista a conta ou não (assim
// ninguém descobre quais e-mails estão cadastrados).
router.post('/password/forgot', limitForgot, asyncHandler(async (req, res) => {
  const email = normalizeEmail(req.body.email);
  if (!email) throw new HttpError(400, 'Digite o e-mail da sua conta.');

  const { rows: [user] } = await query('SELECT id, name, google_account, password_hash FROM users WHERE email = $1', [email]);
  const response = { sent: true, expiresInMinutes: RESET_CODE_TTL_MINUTES };

  if (!user) return res.json(response);

  if (user.google_account && !user.password_hash) {
    await sendEmail({
      to: email,
      subject: 'Trifarmas — entre com o Google',
      text: 'Sua conta do Trifarmas usa login com o Google. Para entrar, toque em "Entrar com o Google" no app. A senha dessa conta é gerenciada pela sua Conta Google.',
    });
    return res.json(response);
  }

  const code = randomDigits(6);
  await transaction(async client => {
    await client.query('UPDATE password_resets SET used_at = NOW() WHERE user_id = $1 AND used_at IS NULL', [user.id]);
    await client.query(
      `INSERT INTO password_resets (user_id, code_hash, expires_at)
       VALUES ($1, $2, NOW() + ($3 || ' minutes')::interval)`,
      [user.id, hashCode(code), String(RESET_CODE_TTL_MINUTES)]
    );
  });

  const firstName = String(user.name || '').split(' ')[0];
  const mail = await sendEmail({
    to: email,
    subject: `Trifarmas — seu código é ${code}`,
    text: `Olá, ${firstName}!\n\nSeu código para criar uma nova senha no Trifarmas é:\n\n${code}\n\nO código vale por ${RESET_CODE_TTL_MINUTES} minutos. Se não foi você que pediu, ignore este e-mail — sua senha atual continua valendo.`,
  });
  if (!mail.sent) console.log(`[recuperação de senha] ${email} -> código ${code} (válido por ${RESET_CODE_TTL_MINUTES} min)`);

  // Só para testes: PASSWORD_RESET_ECHO=true devolve o código na resposta.
  if (config.passwordResetEcho) response.code = code;
  res.json(response);
}));

// Troca a senha usando o código recebido e já devolve a sessão.
router.post('/password/reset', limitReset, asyncHandler(async (req, res) => {
  const email = normalizeEmail(req.body.email);
  const code = String(req.body.code || '').replace(/\D/g, '');
  const password = String(req.body.password || '');
  if (!email || !code) throw new HttpError(400, 'Digite o e-mail e o código recebido.');
  if (password.length < 6) throw new HttpError(400, 'A nova senha precisa ter pelo menos 6 caracteres.');

  const user = await transaction(async client => {
    const { rows: [found] } = await client.query('SELECT id FROM users WHERE email = $1', [email]);
    if (!found) throw new HttpError(400, 'Código inválido ou expirado. Peça um novo código.');

    const { rows: [reset] } = await client.query(
      `SELECT * FROM password_resets
        WHERE user_id = $1 AND used_at IS NULL AND expires_at > NOW()
        ORDER BY created_at DESC LIMIT 1 FOR UPDATE`,
      [found.id]
    );
    if (!reset) throw new HttpError(400, 'Código inválido ou expirado. Peça um novo código.');
    if (reset.attempts >= RESET_MAX_ATTEMPTS) {
      await client.query('UPDATE password_resets SET used_at = NOW() WHERE id = $1', [reset.id]);
      throw new HttpError(400, 'Muitas tentativas com este código. Peça um novo código.');
    }
    if (!sameCode(code, reset.code_hash)) {
      await client.query('UPDATE password_resets SET attempts = attempts + 1 WHERE id = $1', [reset.id]);
      throw new HttpError(400, 'Código incorreto. Confira o e-mail e tente novamente.');
    }

    await client.query('UPDATE password_resets SET used_at = NOW() WHERE id = $1', [reset.id]);
    const { rows: [updated] } = await client.query(
      `UPDATE users SET password_hash = $2, failed_logins = 0, locked_until = NULL WHERE id = $1 RETURNING *`,
      [found.id, await hashPassword(password)]
    );
    return updated;
  });

  clearLimit('login-email', req, email);
  await sendSession(res, user, false);
}));

/* ---------------- Google ---------------- */

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

  const { row, isNewUser } = await upsertGoogleUser({
    name: payload.name || payload.email.split('@')[0],
    email: normalizeEmail(payload.email),
    picture: largeGooglePhoto(payload.picture),
  });
  await sendSession(res, row, isNewUser);
}));

// "Usar conta demo" — só existe enquanto o login real do Google não estiver configurado.
// Usa sempre a mesma conta, para que dados e mensagem de boas-vindas se comportem como numa conta real.
router.post('/google-demo', asyncHandler(async (req, res) => {
  if (!config.allowDemoGoogle) throw new HttpError(403, 'Conta demo desativada.');
  const { row, isNewUser } = await upsertGoogleUser({
    name: 'Conta Demo Google',
    email: 'demo.google@trifarmas.app',
    picture: null,
  });
  await sendSession(res, row, isNewUser);
}));

module.exports = router;
