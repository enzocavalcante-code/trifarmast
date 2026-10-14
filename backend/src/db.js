const fs = require('fs');
const path = require('path');
const { Pool } = require('pg');
const config = require('./config');
const { hashPassword } = require('./auth');
const { checkPriceAlerts } = require('./prices');
const { seed } = require('../db/seed');

const pool = new Pool({
  connectionString: config.databaseUrl,
  ssl: config.databaseSsl ? { rejectUnauthorized: false } : false,
});

const query = (text, params) => pool.query(text, params);

// Executa uma função dentro de uma transação (BEGIN / COMMIT / ROLLBACK).
async function transaction(fn) {
  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    const result = await fn(client);
    await client.query('COMMIT');
    return result;
  } catch (err) {
    await client.query('ROLLBACK');
    throw err;
  } finally {
    client.release();
  }
}

// Cria as tabelas (se não existirem), popula o catálogo e avisa quem estava
// esperando um preço mais baixo.
async function migrate() {
  const schema = fs.readFileSync(path.join(__dirname, '../db/schema.sql'), 'utf8');
  await pool.query(schema);
  await transaction(client => seed(client, hashPassword, { simulateDailyPrices: config.simulateDailyPrices }));
  const alerts = await checkPriceAlerts(pool);
  if (alerts) console.log(`Alertas de preço disparados: ${alerts}`);
}

module.exports = { pool, query, transaction, migrate };
