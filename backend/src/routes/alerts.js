// Alertas de preço: "avise quando baixar".
//
// O alerta guarda o menor preço do remédio no momento em que foi criado. Quando
// o catálogo é atualizado (a cada inicialização da API), quem pediu o aviso
// recebe uma notificação se o preço ficou abaixo do alvo — ou simplesmente
// abaixo do preço de quando o alerta foi criado.

const express = require('express');
const { query } = require('../db');
const { HttpError, asyncHandler } = require('../errors');

const router = express.Router();
const MAX_ALERTS = 40;

const serializeAlert = row => ({
  id: Number(row.id),
  medicineId: row.medicine_id,
  medicineName: row.medicine_name,
  targetPrice: row.target_price === null ? null : Number(row.target_price),
  referencePrice: Number(row.reference_price),
  currentMin: row.current_min === null ? null : Number(row.current_min),
  notified: !!row.notified_at,
  createdAt: row.created_at,
});

const LIST_SQL = `
  SELECT a.*, m.name AS medicine_name,
         (SELECT MIN(price) FROM medicine_prices p WHERE p.medicine_id = a.medicine_id) AS current_min
    FROM price_alerts a
    JOIN medicines m ON m.id = a.medicine_id`;

router.get('/', asyncHandler(async (req, res) => {
  const { rows } = await query(`${LIST_SQL} WHERE a.user_id = $1 ORDER BY a.created_at DESC`, [req.userId]);
  res.json(rows.map(serializeAlert));
}));

// Cria (ou atualiza) o alerta de um remédio.
router.post('/', asyncHandler(async (req, res) => {
  const medicineId = String(req.body.medicineId || '');
  const rawTarget = req.body.targetPrice;
  const targetPrice = rawTarget === null || rawTarget === undefined || rawTarget === ''
    ? null
    : Math.round(Number(rawTarget) * 100) / 100;
  if (targetPrice !== null && (!Number.isFinite(targetPrice) || targetPrice <= 0 || targetPrice > 100000)) {
    throw new HttpError(400, 'Digite um preço válido para o aviso.');
  }

  const { rows: [med] } = await query(
    `SELECT m.id, m.name, (SELECT MIN(price) FROM medicine_prices p WHERE p.medicine_id = m.id) AS min_price
       FROM medicines m WHERE m.id = $1 AND m.owner_id IS NULL`,
    [medicineId]
  );
  if (!med || med.min_price === null) throw new HttpError(404, 'Remédio não encontrado.');

  const { rows: [{ total }] } = await query(
    'SELECT COUNT(*)::int AS total FROM price_alerts WHERE user_id = $1 AND medicine_id <> $2', [req.userId, medicineId]
  );
  if (total >= MAX_ALERTS) throw new HttpError(400, `Você pode ter no máximo ${MAX_ALERTS} avisos de preço.`);

  const { rows: [created] } = await query(
    `INSERT INTO price_alerts (user_id, medicine_id, target_price, reference_price)
     VALUES ($1,$2,$3,$4)
     ON CONFLICT (user_id, medicine_id)
       DO UPDATE SET target_price = EXCLUDED.target_price, reference_price = EXCLUDED.reference_price,
                     notified_at = NULL, created_at = NOW()
     RETURNING id`,
    [req.userId, med.id, targetPrice, med.min_price]
  );
  const { rows } = await query(`${LIST_SQL} WHERE a.id = $1`, [created.id]);
  res.status(201).json(serializeAlert(rows[0]));
}));

router.delete('/:medicineId', asyncHandler(async (req, res) => {
  await query('DELETE FROM price_alerts WHERE user_id = $1 AND medicine_id = $2', [req.userId, req.params.medicineId]);
  res.status(204).end();
}));

module.exports = router;
