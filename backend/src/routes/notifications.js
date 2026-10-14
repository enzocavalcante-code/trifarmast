// Central de avisos do app: queda de preço e retirada confirmada pela farmácia.

const express = require('express');
const { query } = require('../db');
const { asyncHandler } = require('../errors');

const router = express.Router();
const LIMIT = 50;

router.get('/', asyncHandler(async (req, res) => {
  const [list, unread] = await Promise.all([
    query(
      `SELECT id, kind, title, body, medicine_id, order_id, read_at, created_at
         FROM notifications WHERE user_id = $1 ORDER BY created_at DESC, id DESC LIMIT $2`,
      [req.userId, LIMIT]
    ),
    query('SELECT COUNT(*)::int AS total FROM notifications WHERE user_id = $1 AND read_at IS NULL', [req.userId]),
  ]);
  res.json({
    unread: unread.rows[0].total,
    items: list.rows.map(n => ({
      id: Number(n.id),
      kind: n.kind,
      title: n.title,
      body: n.body,
      medicineId: n.medicine_id,
      orderId: n.order_id === null ? null : Number(n.order_id),
      read: !!n.read_at,
      createdAt: n.created_at,
    })),
  });
}));

// Marca avisos como lidos (sem ids, marca todos).
router.post('/read', asyncHandler(async (req, res) => {
  const ids = (Array.isArray(req.body.ids) ? req.body.ids : []).map(Number).filter(Number.isFinite);
  if (ids.length) {
    await query('UPDATE notifications SET read_at = NOW() WHERE user_id = $1 AND id = ANY($2::bigint[]) AND read_at IS NULL', [req.userId, ids]);
  } else {
    await query('UPDATE notifications SET read_at = NOW() WHERE user_id = $1 AND read_at IS NULL', [req.userId]);
  }
  res.status(204).end();
}));

module.exports = router;
