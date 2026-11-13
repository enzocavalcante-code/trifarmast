const express = require('express');
const { query } = require('../db');
const { HttpError, asyncHandler } = require('../errors');
const serialize = require('../serializers');
const { consumeDoses } = require('../stocks');

const router = express.Router();

const MAX_REMINDERS = 1000;   // por conta (um tratamento longo cria um por dia)
const MAX_MED_LENGTH = 120;

const between = (value, min, max) => Number.isInteger(value) && value >= min && value <= max;

router.param('id', (req, res, next, id) => {
  if (!/^\d{1,15}$/.test(id)) return next(new HttpError(404, 'Lembrete não encontrado.'));
  next();
});

router.get('/', asyncHandler(async (req, res) => {
  const { rows } = await query('SELECT * FROM reminders WHERE user_id = $1 ORDER BY id', [req.userId]);
  res.json(rows.map(serialize.reminder));
}));

router.post('/', asyncHandler(async (req, res) => {
  const med = String(req.body.med || '').trim().slice(0, MAX_MED_LENGTH);
  const time = String(req.body.time || '');
  const { day, month, year } = req.body;
  if (!med || !/^([01]\d|2[0-3]):[0-5]\d$/.test(time)) throw new HttpError(400, 'Preencha o remédio e o horário.');
  if (!between(day, 1, 31) || !between(month, 0, 11) || !between(year, 2000, 2100)) throw new HttpError(400, 'Data do lembrete inválida.');

  const { rows: [{ total }] } = await query('SELECT COUNT(*)::int AS total FROM reminders WHERE user_id = $1', [req.userId]);
  if (total >= MAX_REMINDERS) throw new HttpError(400, 'Você chegou ao limite de lembretes. Apague os antigos para criar novos.');

  const { rows } = await query(
    `INSERT INTO reminders (user_id, medicine, time, day, month, year) VALUES ($1,$2,$3,$4,$5,$6) RETURNING *`,
    [req.userId, med, time, day, month, year]
  );
  res.status(201).json(serialize.reminder(rows[0]));
}));

// Marca lembretes como já disparados (a notificação é exibida pelo navegador)
// e dá baixa no estoque em casa: cada lembrete que toca é uma dose a menos.
router.post('/fired', asyncHandler(async (req, res) => {
  const ids = (Array.isArray(req.body.ids) ? req.body.ids : []).slice(0, MAX_REMINDERS).map(Number).filter(Number.isSafeInteger);
  if (!ids.length) return res.json({ stocks: [] });
  const { rows } = await query(
    `UPDATE reminders SET fired = TRUE
      WHERE user_id = $1 AND id = ANY($2::bigint[]) AND fired = FALSE
      RETURNING medicine`,
    [req.userId, ids]
  );
  const consume = req.body.consume !== false;   // lembrete muito atrasado não desconta
  const stocks = (consume && rows.length) ? await consumeDoses(req.userId, rows.map(r => r.medicine)) : [];
  res.json({ stocks });
}));

router.delete('/:id', asyncHandler(async (req, res) => {
  await query('DELETE FROM reminders WHERE id = $1 AND user_id = $2', [req.params.id, req.userId]);
  res.status(204).end();
}));

module.exports = router;
