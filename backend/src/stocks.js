// Estoque de remédio em casa: quantas unidades a pessoa tem e quanto dura.
// A baixa acontece quando o lembrete toca (rota de lembretes "fired").

const { query } = require('./db');

const UNIT_LABELS = ['comprimidos', 'cápsulas', 'doses', 'ml', 'gotas'];
const MAX_UNITS = 9999;

// Chave de comparação: sem acento, sem espaços repetidos, em minúsculas.
const medKey = name => String(name || '')
  .normalize('NFD').replace(/[̀-ͯ]/g, '')
  .trim().replace(/\s+/g, ' ').toLowerCase();

const clampUnits = value => {
  const units = Number(value);
  if (!Number.isFinite(units) || units < 0) return null;
  return Math.min(MAX_UNITS, Math.round(units * 10) / 10);
};

const clampPerDose = value => {
  const perDose = Number(value);
  if (!Number.isFinite(perDose) || perDose <= 0) return 1;
  return Math.min(20, Math.round(perDose * 10) / 10);
};

const unitLabel = value => (UNIT_LABELS.includes(value) ? value : 'comprimidos');

function serializeStock(row) {
  return {
    med: row.medicine,
    key: row.med_key,
    units: Number(row.units),
    unitLabel: row.unit_label,
    perDose: Number(row.per_dose),
    updatedAt: row.updated_at,
  };
}

async function listStocks(userId) {
  const { rows } = await query('SELECT * FROM med_stocks WHERE user_id = $1 ORDER BY medicine', [userId]);
  return rows.map(serializeStock);
}

// Cria ou atualiza o estoque de um remédio.
async function saveStock(userId, { med, units, perDose, unitLabel: label }) {
  const name = String(med || '').trim().slice(0, 120);
  const key = medKey(name);
  const amount = clampUnits(units);
  if (!key || amount === null) return null;
  const { rows } = await query(
    `INSERT INTO med_stocks (user_id, medicine, med_key, units, unit_label, per_dose)
     VALUES ($1,$2,$3,$4,$5,$6)
     ON CONFLICT (user_id, med_key) DO UPDATE
       SET medicine = EXCLUDED.medicine, units = EXCLUDED.units,
           unit_label = EXCLUDED.unit_label, per_dose = EXCLUDED.per_dose, updated_at = NOW()
     RETURNING *`,
    [userId, name, key, amount, unitLabel(label), clampPerDose(perDose)]
  );
  return serializeStock(rows[0]);
}

// Dá baixa no estoque quando o lembrete toca (nunca fica negativo).
async function consumeDoses(userId, medicines) {
  const keys = [...new Set(medicines.map(medKey).filter(Boolean))];
  if (!keys.length) return [];
  const counts = keys.map(key => medicines.filter(m => medKey(m) === key).length);
  const { rows } = await query(
    `UPDATE med_stocks s
        SET units = GREATEST(0, s.units - (c.doses * s.per_dose)), updated_at = NOW()
       FROM unnest($2::text[], $3::int[]) AS c(key, doses)
      WHERE s.user_id = $1 AND s.med_key = c.key
      RETURNING s.*`,
    [userId, keys, counts]
  );
  return rows.map(serializeStock);
}


module.exports = { listStocks, saveStock, consumeDoses };
