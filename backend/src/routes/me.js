const express = require('express');
const { query } = require('../db');
const { hashPassword, checkPassword } = require('../auth');
const { HttpError, asyncHandler } = require('../errors');
const serialize = require('../serializers');

const router = express.Router();

async function loadUser(id) {
  const { rows } = await query('SELECT * FROM users WHERE id = $1', [id]);
  if (!rows[0]) throw new HttpError(401, 'Sessão expirada. Entre novamente.');
  return rows[0];
}

router.get('/', asyncHandler(async (req, res) => {
  res.json(serialize.user(await loadUser(req.userId)));
}));

// Atualiza nome, e-mail, foto e (opcionalmente) senha.
router.patch('/', asyncHandler(async (req, res) => {
  const user = await loadUser(req.userId);
  const name = String(req.body.name ?? '').trim() || user.name;
  const email = String(req.body.email ?? '').trim().toLowerCase() || user.email;
  const avatar = req.body.avatar || user.avatar;
  const { currentPassword, newPassword, confirmPassword } = req.body;
  let passwordHash = user.password_hash;

  if (newPassword || confirmPassword || currentPassword) {
    if (user.google_account) throw new HttpError(400, 'Sua conta usa login do Google — a senha é gerenciada pela sua Conta Google.');
    if (!currentPassword) throw new HttpError(400, 'Digite sua senha atual para confirmar a alteração.');
    if (!(await checkPassword(currentPassword, user.password_hash))) throw new HttpError(400, 'Senha atual incorreta. Tente novamente.');
    if (!newPassword) throw new HttpError(400, 'Digite a nova senha que deseja usar.');
    if (newPassword !== confirmPassword) throw new HttpError(400, 'A confirmação da nova senha não confere.');
    passwordHash = await hashPassword(newPassword);
  }

  if (email !== user.email) {
    const taken = await query('SELECT 1 FROM users WHERE email = $1 AND id <> $2', [email, user.id]);
    if (taken.rowCount) throw new HttpError(409, 'Este e-mail já está em uso por outra conta.');
  }

  const { rows } = await query(
    `UPDATE users SET name=$1, email=$2, avatar=$3, password_hash=$4 WHERE id=$5 RETURNING *`,
    [name, email, avatar, passwordHash, user.id]
  );
  res.json({ user: serialize.user(rows[0]), passwordChanged: passwordHash !== user.password_hash });
}));

// Marca que o usuário já viu o pop-up de boas-vindas (aparece só no primeiro login).
router.post('/welcome-seen', asyncHandler(async (req, res) => {
  await query('UPDATE users SET welcome_seen = TRUE WHERE id = $1', [req.userId]);
  res.status(204).end();
}));

module.exports = router;
