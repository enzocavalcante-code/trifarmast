// Dados iniciais do catálogo (antes ficavam fixos no app.js do front-end).
// Inseridos apenas se ainda não existirem — rodar várias vezes é seguro.

const PHARMACIES = [
  { id: 'p1', name: 'Droga Raia',        dist: 0.4, domain: 'drogaraia.com.br' },
  { id: 'p2', name: 'Drogasil',          dist: 0.7, domain: 'drogasil.com.br' },
  { id: 'p3', name: 'Drogaria Pacheco',  dist: 0.9, domain: 'drogariaspacheco.com.br' },
  { id: 'p4', name: 'Pague Menos',       dist: 1.3, domain: 'paguemenos.com.br' },
  { id: 'p5', name: 'Ultrafarma',        dist: 1.6, domain: 'ultrafarma.com.br' },
  { id: 'p6', name: 'Panvel Farmácias',  dist: 2.1, domain: 'panvel.com' },
];

const MEDICINES = [
  { id: 'm1', name: 'Dipirona Sódica 500mg',    cat: 'Analgésico',     prices: { p1: 9.90,  p2: 14.50, p3: 11.20, p4: 18.00, p5: 10.40, p6: 13.30 } },
  { id: 'm2', name: 'Paracetamol 750mg',        cat: 'Analgésico',     prices: { p1: 7.50,  p2: 8.90,  p3: 12.00, p4: 7.10,  p5: 9.90,  p6: 6.80 } },
  { id: 'm3', name: 'Amoxicilina 500mg',        cat: 'Antibiótico',    prices: { p1: 22.00, p2: 19.90, p3: 31.50, p4: 24.00, p5: 18.40, p6: 20.10 } },
  { id: 'm4', name: 'Losartana Potássica 50mg', cat: 'Cardiovascular', prices: { p1: 15.90, p2: 12.40, p3: 29.90, p4: 14.00, p5: 13.20, p6: 16.70 } },
  { id: 'm5', name: 'Omeprazol 20mg',           cat: 'Gastro',         prices: { p1: 11.30, p2: 9.80,  p3: 17.60, p4: 10.90, p5: 8.70,  p6: 12.10 } },
  { id: 'm6', name: 'Ibuprofeno 400mg',         cat: 'Analgésico',     prices: { p1: 13.40, p2: 11.90, p3: 19.00, p4: 12.30, p5: 14.60, p6: 10.50 } },
  { id: 'm7', name: 'Loratadina 10mg',          cat: 'Alergia',        prices: { p1: 8.20,  p2: 7.40,  p3: 13.90, p4: 9.10,  p5: 6.90,  p6: 8.60 } },
  { id: 'm8', name: 'Metformina 850mg',         cat: 'Diabetes',       prices: { p1: 16.50, p2: 21.90, p3: 14.20, p4: 19.00, p5: 15.80, p6: 17.30 } },
];

const REWARDS = [
  { id: 'r1', name: 'R$5 de desconto',  desc: 'Em qualquer analgésico',         cost: 100 },
  { id: 'r2', name: 'R$10 de desconto', desc: 'Em qualquer antibiótico',        cost: 200 },
  { id: 'r3', name: '15% off',          desc: 'Em produtos de dermocosmética',  cost: 280 },
  { id: 'r4', name: 'Frete grátis',     desc: 'Na retirada expressa',           cost: 80 },
  { id: 'r5', name: 'R$20 de desconto', desc: 'Em compras acima de R$100',      cost: 400 },
];

// Conta de demonstração que já vinha preenchida na tela de login.
const DEMO_USER = { name: 'Trifarmas', email: 'trifarmas@gmail.com', password: '123456', points: 340 };

async function seed(client, hashPassword) {
  for (const p of PHARMACIES) {
    await client.query(
      `INSERT INTO pharmacies (id, name, dist_km, domain) VALUES ($1,$2,$3,$4) ON CONFLICT (id) DO NOTHING`,
      [p.id, p.name, p.dist, p.domain]
    );
  }
  for (const m of MEDICINES) {
    await client.query(
      `INSERT INTO medicines (id, name, category) VALUES ($1,$2,$3) ON CONFLICT (id) DO NOTHING`,
      [m.id, m.name, m.cat]
    );
    for (const [pid, price] of Object.entries(m.prices)) {
      await client.query(
        `INSERT INTO medicine_prices (medicine_id, pharmacy_id, price) VALUES ($1,$2,$3) ON CONFLICT DO NOTHING`,
        [m.id, pid, price]
      );
    }
  }
  for (const r of REWARDS) {
    await client.query(
      `INSERT INTO rewards (id, name, description, cost) VALUES ($1,$2,$3,$4) ON CONFLICT (id) DO NOTHING`,
      [r.id, r.name, r.desc, r.cost]
    );
  }
  const avatar = `https://api.dicebear.com/7.x/initials/svg?seed=trifarmas&backgroundColor=2fa85e&textColor=ffffff`;
  await client.query(
    `INSERT INTO users (name, email, password_hash, avatar, points) VALUES ($1,$2,$3,$4,$5)
     ON CONFLICT (email) DO NOTHING`,
    [DEMO_USER.name, DEMO_USER.email, await hashPassword(DEMO_USER.password), avatar, DEMO_USER.points]
  );
}

module.exports = { seed };
