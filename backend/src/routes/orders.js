const express = require('express');
const { query, transaction } = require('../db');
const { HttpError, asyncHandler } = require('../errors');
const serialize = require('../serializers');

const router = express.Router();

const POINT_VALUE = 0.05; // 1 ponto = R$0,05 de desconto
const PAYMENT_METHODS = ['Cartão de crédito', 'Pix', 'Dinheiro na retirada'];

router.get('/', asyncHandler(async (req, res) => {
  const { rows } = await query('SELECT * FROM orders WHERE user_id = $1 ORDER BY created_at DESC', [req.userId]);
  res.json(rows.map(serialize.order));
}));

// Cria o pedido: o preço é sempre lido do banco (nunca confiado ao navegador).
router.post('/', asyncHandler(async (req, res) => {
  const { medicineId, pharmacyId, paymentMethod } = req.body;
  const pointsRequested = Math.max(0, Math.floor(Number(req.body.pointsUsed) || 0));
  if (!PAYMENT_METHODS.includes(paymentMethod)) throw new HttpError(400, 'Forma de pagamento inválida.');

  const result = await transaction(async client => {
    const { rows: [item] } = await client.query(
      `SELECT m.name AS med_name, p.name AS pharm_name, mp.price
         FROM medicine_prices mp
         JOIN medicines m ON m.id = mp.medicine_id
         JOIN pharmacies p ON p.id = mp.pharmacy_id
        WHERE mp.medicine_id = $1 AND mp.pharmacy_id = $2
          AND (m.owner_id IS NULL OR m.owner_id = $3)`,
      [medicineId, pharmacyId, req.userId]
    );
    if (!item) throw new HttpError(404, 'Remédio ou farmácia não encontrado.');

    const { rows: [user] } = await client.query('SELECT points FROM users WHERE id = $1 FOR UPDATE', [req.userId]);
    const price = Number(item.price);
    const maxPointsUsable = Math.max(0, Math.min(user.points, Math.floor(price / POINT_VALUE)));
    if (pointsRequested > maxPointsUsable) throw new HttpError(400, 'Pontos insuficientes para este desconto.');

    const discount = +(pointsRequested * POINT_VALUE).toFixed(2);
    const paidAmount = Math.max(0, +(price - discount).toFixed(2));
    const pointsEarned = Math.max(5, Math.round(paidAmount));
    const code = Math.floor(100000 + Math.random() * 899999).toString();

    const { rows: [userAfter] } = await client.query(
      'UPDATE users SET points = points - $1 WHERE id = $2 RETURNING points', [pointsRequested, req.userId]
    );
    const { rows: [order] } = await client.query(
      `INSERT INTO orders (user_id, medicine_name, pharmacy_name, price, points_used, discount, paid_amount,
                           payment_method, points_earned, pickup_code)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10) RETURNING *`,
      [req.userId, item.med_name, item.pharm_name, price, pointsRequested, discount, paidAmount, paymentMethod, pointsEarned, code]
    );
    return { order: serialize.order(order), points: userAfter.points };
  });
  res.status(201).json(result);
}));

// Confirma a retirada e credita o cashback.
router.post('/:id/pickup', asyncHandler(async (req, res) => {
  const result = await transaction(async client => {
    const { rows: [order] } = await client.query(
      'SELECT * FROM orders WHERE id = $1 AND user_id = $2 FOR UPDATE', [req.params.id, req.userId]
    );
    if (!order) throw new HttpError(404, 'Pedido não encontrado.');
    if (serialize.orderStatus(order) !== 'Pronto para retirar') throw new HttpError(400, 'O pedido ainda não está pronto para retirada.');

    const { rows: [updated] } = await client.query('UPDATE orders SET completed = TRUE WHERE id = $1 RETURNING *', [order.id]);
    const { rows: [user] } = await client.query(
      'UPDATE users SET points = points + $1 WHERE id = $2 RETURNING points', [order.points_earned, req.userId]
    );
    return { order: serialize.order(updated), points: user.points };
  });
  res.json(result);
}));

module.exports = router;
