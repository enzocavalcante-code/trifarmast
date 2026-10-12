// Grava o catálogo no banco a cada inicialização (insere o que falta e
// atualiza o que mudou). Rodar várias vezes é seguro.

const { PHARMACIES, MEDICINES, REWARDS, priceFor } = require('./catalog');

// Conta de demonstração que já vem preenchida na tela de login.
const DEMO_USER = { name: 'Trifarmas', email: 'trifarmas@gmail.com', password: '123456', points: 340 };

async function seed(client, hashPassword) {
  await client.query(
    `INSERT INTO pharmacies (id, name, dist_km, domain)
     SELECT * FROM unnest($1::text[], $2::text[], $3::numeric[], $4::text[])
     ON CONFLICT (id) DO UPDATE SET name = EXCLUDED.name, dist_km = EXCLUDED.dist_km, domain = EXCLUDED.domain`,
    [PHARMACIES.map(p => p.id), PHARMACIES.map(p => p.name), PHARMACIES.map(p => p.dist), PHARMACIES.map(p => p.domain)]
  );

  const col = i => MEDICINES.map(m => m[i]);
  await client.query(
    `INSERT INTO medicines (id, name, presentation, active_ingredient, category, requires_prescription, popularity)
     SELECT * FROM unnest($1::text[], $2::text[], $3::text[], $4::text[], $5::text[], $6::boolean[], $7::int[])
     ON CONFLICT (id) DO UPDATE SET
       name = EXCLUDED.name, presentation = EXCLUDED.presentation, active_ingredient = EXCLUDED.active_ingredient,
       category = EXCLUDED.category, requires_prescription = EXCLUDED.requires_prescription, popularity = EXCLUDED.popularity`,
    [col(0), col(1), col(2), col(3), col(4), col(6), col(7)]
  );

  const priceRows = MEDICINES.flatMap(m => PHARMACIES.map(p => [m[0], p.id, priceFor(m, p)]));
  await client.query(
    `INSERT INTO medicine_prices (medicine_id, pharmacy_id, price)
     SELECT * FROM unnest($1::text[], $2::text[], $3::numeric[])
     ON CONFLICT (medicine_id, pharmacy_id) DO UPDATE SET price = EXCLUDED.price`,
    [priceRows.map(r => r[0]), priceRows.map(r => r[1]), priceRows.map(r => r[2])]
  );

  await client.query('DELETE FROM rewards WHERE id <> ALL($1::text[])', [REWARDS.map(r => r.id)]);
  for (const r of REWARDS) {
    await client.query(
      `INSERT INTO rewards (id, name, description, cost, amount, min_order) VALUES ($1,$2,$3,$4,$5,$6)
       ON CONFLICT (id) DO UPDATE SET name = EXCLUDED.name, description = EXCLUDED.description,
         cost = EXCLUDED.cost, amount = EXCLUDED.amount, min_order = EXCLUDED.min_order`,
      [r.id, r.name, r.desc, r.cost, r.amount, r.minOrder]
    );
  }

  const avatar = 'https://api.dicebear.com/7.x/initials/svg?seed=trifarmas&backgroundColor=2fa85e&textColor=ffffff';
  const { rows } = await client.query(
    `INSERT INTO users (name, email, password_hash, avatar, points) VALUES ($1,$2,$3,$4,$5)
     ON CONFLICT (email) DO NOTHING RETURNING id`,
    [DEMO_USER.name, DEMO_USER.email, await hashPassword(DEMO_USER.password), avatar, DEMO_USER.points]
  );
  if (rows[0]) {
    await client.query(
      `INSERT INTO points_history (user_id, delta, description) VALUES ($1,$2,'Saldo inicial da conta de teste')`,
      [rows[0].id, DEMO_USER.points]
    );
  }
}

module.exports = { seed };
