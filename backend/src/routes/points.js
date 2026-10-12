const express = require('express');
const { query, transaction } = require('../db');
const { HttpError, asyncHandler } = require('../errors');
const { addPoints } = require('../points');
const serialize = require('../serializers');

const router = express.Router();

// Resumo do programa de pontos: saldo, pontos a receber, cupons e extrato.
router.get('/', asyncHandler(async (req, res) => {
  const [user, pending, coupons, history] = await Promise.all([
    query('SELECT points FROM users WHERE id = $1', [req.userId]),
    query('SELECT COALESCE(SUM(points_earned), 0)::int AS total FROM orders WHERE user_id = $1 AND NOT completed', [req.userId]),
    query('SELECT * FROM user_coupons WHERE user_id = $1 AND used_order_id IS NULL ORDER BY created_at', [req.userId]),
    query('SELECT delta, description, created_at FROM points_history WHERE user_id = $1 ORDER BY created_at DESC, id DESC LIMIT 30', [req.userId]),
  ]);
  res.json({
    points: user.rows[0].points,
    pending: pending.rows[0].total,
    coupons: coupons.rows.map(serialize.coupon),
    history: history.rows.map(h => ({ delta: h.delta, description: h.description, createdAt: h.created_at })),
  });
}));

// Troca pontos por um cupom de desconto.
router.post('/rewards/:id/redeem', asyncHandler(async (req, res) => {
  const result = await transaction(async client => {
    const { rows: [reward] } = await client.query('SELECT * FROM rewards WHERE id = $1', [req.params.id]);
    if (!reward) throw new HttpError(404, 'Recompensa não encontrada.');
    const { rows: [user] } = await client.query('SELECT points FROM users WHERE id = $1 FOR UPDATE', [req.userId]);
    if (user.points < reward.cost) throw new HttpError(400, 'Pontos insuficientes.');

    const points = await addPoints(client, req.userId, -reward.cost, `Troca: cupom ${reward.name}`);
    const { rows: [coupon] } = await client.query(
      `INSERT INTO user_coupons (user_id, name, amount, min_order) VALUES ($1,$2,$3,$4) RETURNING *`,
      [req.userId, reward.name, reward.amount, reward.min_order]
    );
    return { points, coupon: serialize.coupon(coupon) };
  });
  res.status(201).json(result);
}));

module.exports = router;
