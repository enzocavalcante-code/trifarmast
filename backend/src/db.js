const fs = require('fs');
const path = require('path');
const { Pool } = require('pg');
const config = require('./config');
const { hashPassword } = require('./auth');
const { seed } = require('../db/seed');

const pool = new Pool({
  connectionString: config.databaseUrl,
  ssl: config.databaseSsl ? { rejectUnauthorized: false } : false,
});

// O PostgreSQL do Render fecha conexões paradas. Sem este tratador, o erro
// chega ao Node como exceção não capturada e o servidor inteiro cai.
pool.on('error', err => console.error('Conexão ociosa com o banco caiu:', err.message));

const query = (text, params) => pool.query(text, params);

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

async function migrate() {
  const schema = fs.readFileSync(path.join(__dirname, '../db/schema.sql'), 'utf8');
  await pool.query(schema);
  await transaction(client => seed(client, hashPassword));
}

module.exports = { query, transaction, migrate };
