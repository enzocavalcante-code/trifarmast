const express = require('express');
const { query } = require('../db');
const { asyncHandler } = require('../errors');

const router = express.Router();

// Agrupa as linhas (remédio x farmácia) no formato { id, name, ..., prices: { p1: 9.9, ... } }.
async function listMedicines(whereSql, params, orderSql) {
  const { rows } = await query(
    `SELECT m.id, m.name, m.category, m.presentation, m.active_ingredient, m.requires_prescription,
            m.popularity, mp.pharmacy_id, mp.price
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

module.exports = router;
