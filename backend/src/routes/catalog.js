const express = require('express');
const { query } = require('../db');
const { HttpError, asyncHandler } = require('../errors');
const { priceHistory, HISTORY_DAYS } = require('../prices');

const router = express.Router();

// Agrupa as linhas (remédio x farmácia) no formato { id, name, ..., prices: { p1: 9.9, ... } }.
async function listMedicines(whereSql, params, orderSql) {
  const { rows } = await query(
    `SELECT m.id, m.name, m.category, m.presentation, m.active_ingredient, m.requires_prescription,
            m.popularity, m.strength, m.equiv_group, m.unit_count, m.unit_label, m.is_generic,
            mp.pharmacy_id, mp.price
       FROM medicines m
       JOIN medicine_prices mp ON mp.medicine_id = m.id
      WHERE ${whereSql}
      ORDER BY ${orderSql}`,
    params
  );
  const byId = new Map();
  for (const r of rows) {
    if (!byId.has(r.id)) {
      byId.set(r.id, {
        id: r.id,
        name: r.name,
        cat: r.category,
        presentation: r.presentation,
        ingredient: r.active_ingredient,
        rx: r.requires_prescription,
        popularity: r.popularity,
        // Equivalência genérico/marca: mesmo princípio ativo, mesma dosagem e mesma forma.
        strength: r.strength,
        equivGroup: r.equiv_group,
        units: r.unit_count,
        unitLabel: r.unit_label,
        generic: r.is_generic,
        prices: {},
      });
    }
    byId.get(r.id).prices[r.pharmacy_id] = Number(r.price);
  }
  return [...byId.values()];
}

// Catálogo público: farmácias, remédios e recompensas.
router.get('/catalog', asyncHandler(async (req, res) => {
  const [pharmacies, medicines, rewards] = await Promise.all([
    query('SELECT id, name, dist_km, domain FROM pharmacies ORDER BY dist_km'),
    listMedicines('m.owner_id IS NULL', [], 'm.popularity DESC, m.name'),
    query('SELECT id, name, description, cost, amount, min_order FROM rewards ORDER BY cost'),
  ]);
  res.json({
    pharmacies: pharmacies.rows.map(p => ({ id: p.id, name: p.name, dist: Number(p.dist_km), domain: p.domain })),
    medicines,
    rewards: rewards.rows.map(r => ({
      id: r.id, name: r.name, desc: r.description, cost: r.cost, amount: Number(r.amount), minOrder: Number(r.min_order),
    })),
  });
}));

// Histórico de preços de um remédio (menor preço do dia, entre as farmácias).
// O histórico começa no dia em que a API foi publicada — nada é inventado.
router.get('/medicines/:id/history', asyncHandler(async (req, res) => {
  const { rows: [med] } = await query('SELECT id, name FROM medicines WHERE id = $1 AND owner_id IS NULL', [req.params.id]);
  if (!med) throw new HttpError(404, 'Remédio não encontrado.');

  const [days, current] = await Promise.all([
    priceHistory({ query }, med.id),
    query('SELECT MIN(price) AS min_price FROM medicine_prices WHERE medicine_id = $1', [med.id]),
  ]);
  const values = days.map(d => d.min);
  res.json({
    medicineId: med.id,
    name: med.name,
    windowDays: HISTORY_DAYS,
    days,
    currentMin: current.rows[0].min_price === null ? null : Number(current.rows[0].min_price),
    lowest: values.length ? Math.min(...values) : null,
    highest: values.length ? Math.max(...values) : null,
  });
}));

module.exports = router;
