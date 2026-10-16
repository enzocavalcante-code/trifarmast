const express = require('express');
const { query, transaction } = require('../db');
const { HttpError, asyncHandler } = require('../errors');
const { addPoints } = require('../points');
const serialize = require('../serializers');
const { loadPoints } = require('../account');

const router = express.Router();

// Resumo do programa de pontos: saldo, pontos a receber, cupons e extrato.
router.get('/', asyncHandler(async (req, res) => {
  res.json(await loadPoints(req.userId));
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
