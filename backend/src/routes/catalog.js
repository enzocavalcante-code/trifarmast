const express = require('express');
const { query, transaction } = require('../db');
const { requireAuth } = require('../auth');
const { HttpError, asyncHandler } = require('../errors');

const router = express.Router();

// Agrupa as linhas (remédio x farmácia) no formato { id, name, cat, prices: { p1: 9.9, ... } }.
async function listMedicines(whereSql, params) {
  const { rows } = await query(
    `SELECT m.id, m.name, m.category, mp.pharmacy_id, mp.price
       FROM medicines m
       JOIN medicine_prices mp ON mp.medicine_id = m.id
      WHERE ${whereSql}
      ORDER BY m.created_at, m.id`,
    params
  );
  const byId = new Map();
  for (const r of rows) {
    if (!byId.has(r.id)) byId.set(r.id, { id: r.id, name: r.name, cat: r.category, prices: {} });
    byId.get(r.id).prices[r.pharmacy_id] = Number(r.price);
  }
  return [...byId.values()];
}

// Catálogo público: farmácias, remédios e recompensas.
router.get('/catalog', asyncHandler(async (req, res) => {
  const [pharmacies, medicines, rewards] = await Promise.all([
    query('SELECT id, name, dist_km, domain FROM pharmacies ORDER BY dist_km'),
    listMedicines('m.owner_id IS NULL', []),
    query('SELECT id, name, description, cost FROM rewards ORDER BY id'),
  ]);
  res.json({
    pharmacies: pharmacies.rows.map(p => ({ id: p.id, name: p.name, dist: Number(p.dist_km), domain: p.domain })),
    medicines,
    rewards: rewards.rows.map(r => ({ id: r.id, name: r.name, desc: r.description, cost: r.cost })),
  });
}));

// Remédios que o próprio usuário adicionou pela busca.
router.get('/medicines/custom', requireAuth, asyncHandler(async (req, res) => {
  res.json(await listMedicines('m.owner_id = $1', [req.userId]));
}));

router.post('/medicines/custom', requireAuth, asyncHandler(async (req, res) => {
  const name = String(req.body.name || '').trim();
  if (!name) throw new HttpError(400, 'Digite o nome do remédio.');

  const med = await transaction(async client => {
    const id = `custom-${req.userId}-${Date.now()}`;
    await client.query(`INSERT INTO medicines (id, name, category, owner_id) VALUES ($1,$2,'Outros',$3)`, [id, name, req.userId]);
    const { rows: pharmacies } = await client.query('SELECT id FROM pharmacies');
    const prices = {};
    // Preço simulado em cada farmácia (sem restringir faixa de preço).
    for (const p of pharmacies) {
      prices[p.id] = +(8 + Math.random() * 90).toFixed(2);
      await client.query(`INSERT INTO medicine_prices (medicine_id, pharmacy_id, price) VALUES ($1,$2,$3)`, [id, p.id, prices[p.id]]);
    }
    return { id, name, cat: 'Outros', prices };
  });
  res.status(201).json(med);
}));

module.exports = router;
