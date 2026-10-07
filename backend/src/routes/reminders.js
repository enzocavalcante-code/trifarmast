const express = require('express');
const { query } = require('../db');
const { HttpError, asyncHandler } = require('../errors');
const serialize = require('../serializers');

const router = express.Router();

router.get('/', asyncHandler(async (req, res) => {
  const { rows } = await query('SELECT * FROM reminders WHERE user_id = $1 ORDER BY id', [req.userId]);
  res.json(rows.map(serialize.reminder));
}));

router.post('/', asyncHandler(async (req, res) => {
  const { med, time, day, month, year } = req.body;
  if (!String(med || '').trim() || !/^\d{2}:\d{2}$/.test(String(time || ''))) {
    throw new HttpError(400, 'Preencha o remédio e o horário.');
  }
  const { rows } = await query(
    `INSERT INTO reminders (user_id, medicine, time, day, month, year) VALUES ($1,$2,$3,$4,$5,$6) RETURNING *`,
    [req.userId, String(med).trim(), time, day, month, year]
  );
  res.status(201).json(serialize.reminder(rows[0]));
}));

// Marca lembretes como já disparados (a notificação é exibida pelo navegador).
router.post('/fired', asyncHandler(async (req, res) => {
  const ids = (Array.isArray(req.body.ids) ? req.body.ids : []).map(Number).filter(Number.isFinite);
  if (ids.length) await query('UPDATE reminders SET fired = TRUE WHERE user_id = $1 AND id = ANY($2::bigint[])', [req.userId, ids]);
  res.status(204).end();
}));

router.delete('/:id', asyncHandler(async (req, res) => {
  await query('DELETE FROM reminders WHERE id = $1 AND user_id = $2', [req.params.id, req.userId]);
  res.status(204).end();
}));

module.exports = router;
