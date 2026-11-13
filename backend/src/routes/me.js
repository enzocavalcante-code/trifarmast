const express = require('express');
const { query } = require('../db');
const { hashPassword, checkPassword, signToken, normalizeEmail, looksLikeEmail, assertNewPassword, assertName } = require('../auth');
const { HttpError, asyncHandler } = require('../errors');
const { isValidAvatar } = require('../images');
const { attempts } = require('../security');
const serialize = require('../serializers');
const { DEMO_EMAIL } = require('../../db/seed');

const router = express.Router();

// Quem pegou um aparelho já logado não fica chutando a senha atual à vontade.
const passwordGuesses = attempts({ name: 'senha-atual', max: 10 });

async function loadUser(id) {
  const { rows } = await query('SELECT * FROM users WHERE id = $1', [id]);
  if (!rows[0]) throw new HttpError(401, 'Sessão expirada. Entre novamente.');
  return rows[0];
}

router.get('/', asyncHandler(async (req, res) => {
  res.json(serialize.user(await loadUser(req.userId)));
}));

// Atualiza nome, e-mail, foto e (opcionalmente) senha.
//  - avatar: foto escolhida manualmente (passa a ter prioridade sobre a do Google)
//  - resetAvatar: volta a usar a foto da Conta Google
//  - trocar o e-mail ou a senha exige a senha atual
router.patch('/', asyncHandler(async (req, res) => {
  const user = await loadUser(req.userId);
  const name = String(req.body.name ?? '').trim() || user.name;
  const email = normalizeEmail(req.body.email) || user.email;
  const currentPassword = String(req.body.currentPassword || '');
  const newPassword = String(req.body.newPassword || '');
  const confirmPassword = String(req.body.confirmPassword || '');
  let { avatar, avatar_custom: avatarCustom } = user;
  let passwordHash = user.password_hash;
  assertName(name);

  if (req.body.resetAvatar) {
    if (!user.google_picture) throw new HttpError(400, 'Sua conta não tem foto do Google.');
    avatar = user.google_picture;
    avatarCustom = false;
  } else if (req.body.avatar) {
    if (!isValidAvatar(req.body.avatar)) throw new HttpError(400, 'Imagem inválida ou muito grande.');
    avatar = req.body.avatar;
    avatarCustom = true;
  }

  const changingEmail = email !== user.email;
  const changingPassword = !!(newPassword || confirmPassword || (currentPassword && !changingEmail));
  if (changingEmail || changingPassword) {
    // A conta de demonstração tem a senha publicada na tela de login: se desse
    // para trocar, qualquer visitante tirava a conta do ar para todo mundo.
    if (user.email === DEMO_EMAIL) throw new HttpError(403, 'A conta de demonstração é pública: o e-mail e a senha dela não podem ser alterados.');
    if (!user.password_hash) throw new HttpError(400, 'Sua conta usa login do Google — o e-mail e a senha são os da sua Conta Google.');
    if (!currentPassword) throw new HttpError(400, 'Digite sua senha atual para confirmar a alteração.');
    passwordGuesses.take(user.id);
    if (!(await checkPassword(currentPassword, user.password_hash))) throw new HttpError(400, 'Senha atual incorreta. Tente novamente.');
    passwordGuesses.refund(user.id);
  }

  if (changingPassword) {
    if (!newPassword) throw new HttpError(400, 'Digite a nova senha que deseja usar.');
    assertNewPassword(newPassword);
    if (newPassword !== confirmPassword) throw new HttpError(400, 'A confirmação da nova senha não confere.');
    passwordHash = await hashPassword(newPassword);
  }

  if (changingEmail) {
    if (!looksLikeEmail(email)) throw new HttpError(400, 'Digite um e-mail válido.');
    const taken = await query('SELECT 1 FROM users WHERE email = $1 AND id <> $2', [email, user.id]);
    if (taken.rowCount) throw new HttpError(409, 'Este e-mail já está em uso por outra conta.');
  }

  // Senha nova = versão nova da sessão: os outros aparelhos saem da conta.
  // Este recebe um token novo na resposta e continua logado.
  const { rows } = await query(
    `UPDATE users SET name=$1, email=$2, avatar=$3, avatar_custom=$4, password_hash=$5,
            token_version = token_version + $6
      WHERE id=$7 RETURNING *`,
    [name, email, avatar, avatarCustom, passwordHash, changingPassword ? 1 : 0, user.id]
  );
  res.json({
    user: serialize.user(rows[0]),
    passwordChanged: changingPassword,
    ...(changingPassword && { token: signToken(rows[0].id, rows[0].token_version) }),
  });
}));

module.exports = router;
