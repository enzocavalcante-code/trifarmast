const express = require('express');
const { query, transaction } = require('../db');
const { hashPassword, checkPassword } = require('../auth');
const { HttpError, asyncHandler } = require('../errors');
const { isValidAvatar } = require('../images');
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
//  - avatar: foto escolhida manualmente (passa a ter prioridade sobre a do Google)
//  - resetAvatar: volta a usar a foto da Conta Google
router.patch('/', asyncHandler(async (req, res) => {
  const user = await loadUser(req.userId);
  const name = String(req.body.name ?? '').trim() || user.name;
  const email = String(req.body.email ?? '').trim().toLowerCase() || user.email;
  let { avatar, avatar_custom: avatarCustom } = user;
  const { currentPassword, newPassword, confirmPassword } = req.body;
  let passwordHash = user.password_hash;

  if (req.body.resetAvatar) {
    if (!user.google_picture) throw new HttpError(400, 'Sua conta não tem foto do Google.');
    avatar = user.google_picture;
    avatarCustom = false;
  } else if (req.body.avatar) {
    if (!isValidAvatar(req.body.avatar)) throw new HttpError(400, 'Imagem inválida ou muito grande.');
    avatar = req.body.avatar;
    avatarCustom = true;
  }

  if (newPassword || confirmPassword || currentPassword) {
    if (!user.password_hash) throw new HttpError(400, 'Sua conta usa login do Google — a senha é gerenciada pela sua Conta Google.');
    if (!currentPassword) throw new HttpError(400, 'Digite sua senha atual para confirmar a alteração.');
    if (!(await checkPassword(currentPassword, user.password_hash))) throw new HttpError(400, 'Senha atual incorreta. Tente novamente.');
    if (!newPassword) throw new HttpError(400, 'Digite a nova senha que deseja usar.');
    if (newPassword.length < 6) throw new HttpError(400, 'A nova senha precisa ter pelo menos 6 caracteres.');
    if (newPassword !== confirmPassword) throw new HttpError(400, 'A confirmação da nova senha não confere.');
    passwordHash = await hashPassword(newPassword);
  }

  if (email !== user.email) {
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test(email)) throw new HttpError(400, 'Digite um e-mail válido.');
    const taken = await query('SELECT 1 FROM users WHERE email = $1 AND id <> $2', [email, user.id]);
    if (taken.rowCount) throw new HttpError(409, 'Este e-mail já está em uso por outra conta.');
  }

  const { rows } = await query(
    `UPDATE users SET name=$1, email=$2, avatar=$3, avatar_custom=$4, password_hash=$5 WHERE id=$6 RETURNING *`,
    [name, email, avatar, avatarCustom, passwordHash, user.id]
  );
  res.json({ user: serialize.user(rows[0]), passwordChanged: passwordHash !== user.password_hash });
}));

/* ---------------- LGPD: baixar e excluir meus dados ---------------- */

// Tudo o que a conta tem no banco, para o usuário guardar ou levar embora.
router.get('/export', asyncHandler(async (req, res) => {
  const user = await loadUser(req.userId);
  const [orders, items, coupons, points, reminders, alerts, notices, prescriptions] = await Promise.all([
    query('SELECT * FROM orders WHERE user_id = $1 ORDER BY created_at', [req.userId]),
    query('SELECT i.* FROM order_items i JOIN orders o ON o.id = i.order_id WHERE o.user_id = $1 ORDER BY i.id', [req.userId]),
    query('SELECT * FROM user_coupons WHERE user_id = $1 ORDER BY created_at', [req.userId]),
    query('SELECT delta, description, created_at FROM points_history WHERE user_id = $1 ORDER BY created_at', [req.userId]),
    query('SELECT * FROM reminders WHERE user_id = $1 ORDER BY id', [req.userId]),
    query(`SELECT a.*, m.name AS medicine_name FROM price_alerts a JOIN medicines m ON m.id = a.medicine_id
            WHERE a.user_id = $1 ORDER BY a.created_at`, [req.userId]),
    query('SELECT kind, title, body, created_at, read_at FROM notifications WHERE user_id = $1 ORDER BY created_at', [req.userId]),
    query(`SELECT p.order_id, p.file_name, p.mime, p.created_at FROM prescriptions p
             JOIN orders o ON o.id = p.order_id WHERE o.user_id = $1`, [req.userId]),
  ]);

  const itemsByOrder = new Map();
  for (const item of items.rows) {
    const key = String(item.order_id);
    if (!itemsByOrder.has(key)) itemsByOrder.set(key, []);
    itemsByOrder.get(key).push({
      name: item.name, presentation: item.presentation, quantity: item.quantity,
      unitPrice: Number(item.unit_price), requiresPrescription: item.requires_prescription,
    });
  }

  res.json({
    geradoEm: new Date().toISOString(),
    conta: {
      nome: user.name, email: user.email, pontos: user.points,
      contaGoogle: user.google_account, criadaEm: user.created_at,
    },
    pedidos: orders.rows.map(o => ({
      id: Number(o.id), farmacia: o.pharmacy_name, criadoEm: o.created_at,
      subtotal: Number(o.subtotal ?? o.paid_amount), desconto: Number(o.discount),
      cupom: o.coupon_name, valorPago: Number(o.paid_amount), formaDePagamento: o.payment_method,
      pontosGanhos: o.points_earned, codigoDeRetirada: o.pickup_code,
      retiradaConfirmadaEm: o.pickup_validated_at, concluido: o.completed,
      itens: itemsByOrder.get(String(o.id)) || [],
    })),
    receitasAnexadas: prescriptions.rows.map(p => ({
      pedido: Number(p.order_id), arquivo: p.file_name, tipo: p.mime, enviadoEm: p.created_at,
    })),
    cupons: coupons.rows.map(c => ({
      nome: c.name, valor: Number(c.amount), compraMinima: Number(c.min_order),
      criadoEm: c.created_at, usadoEm: c.used_at,
    })),
    extratoDePontos: points.rows.map(p => ({ pontos: p.delta, descricao: p.description, data: p.created_at })),
    lembretes: reminders.rows.map(r => ({
      remedio: r.medicine, horario: r.time, dia: r.day, mes: r.month + 1, ano: r.year, disparado: r.fired,
    })),
    alertasDePreco: alerts.rows.map(a => ({
      remedio: a.medicine_name, precoAlvo: a.target_price === null ? null : Number(a.target_price),
      precoQuandoCriado: Number(a.reference_price), criadoEm: a.created_at, avisadoEm: a.notified_at,
    })),
    avisos: notices.rows.map(n => ({ tipo: n.kind, titulo: n.title, texto: n.body, data: n.created_at, lidoEm: n.read_at })),
  });
}));

// Exclui a conta e tudo o que está ligada a ela (pedidos, receitas, pontos,
// cupons, lembretes e alertas saem por cascata no banco).
router.delete('/', asyncHandler(async (req, res) => {
  const user = await loadUser(req.userId);
  const password = String(req.body && req.body.password || '');
  const confirm = String(req.body && req.body.confirm || '').trim().toUpperCase();

  if (user.password_hash) {
    if (!password) throw new HttpError(400, 'Digite sua senha para confirmar a exclusão da conta.');
    if (!(await checkPassword(password, user.password_hash))) throw new HttpError(400, 'Senha incorreta. A conta não foi excluída.');
  } else if (confirm !== 'EXCLUIR') {
    throw new HttpError(400, 'Para confirmar, digite EXCLUIR.');
  }

  await transaction(async client => {
    // Receitas são apagadas junto com os pedidos (ON DELETE CASCADE).
    await client.query('DELETE FROM users WHERE id = $1', [user.id]);
  });
  res.status(204).end();
}));

module.exports = router;
