const express = require('express');
const { query, transaction } = require('../db');
const { HttpError, asyncHandler } = require('../errors');
const { parseDataUrl } = require('../images');
const { pointsForPayment } = require('../points');
const { randomDigits } = require('../auth');
const serialize = require('../serializers');

const router = express.Router();

const PAYMENT_METHODS = ['Pix', 'Cartão de crédito', 'Dinheiro na retirada'];
const MAX_ITEMS = 30;
const MAX_QUANTITY = 10;
const MAX_GROUPS = 6;          // no máximo uma retirada por farmácia parceira
const PRESCRIPTION_TYPES = ['application/pdf', 'image/jpeg', 'image/png', 'image/webp', 'image/heic', 'image/heif'];
const MAX_PRESCRIPTION_BYTES = 8 * 1024 * 1024;

// Carrega pedidos com itens e o nome do arquivo de receita (sem o conteúdo do arquivo).
async function loadOrders(db, userId, orderId = null) {
  const { rows: orders } = await db.query(
    `SELECT * FROM orders WHERE user_id = $1 AND ($2::bigint IS NULL OR id = $2) ORDER BY created_at DESC, id DESC`,
    [userId, orderId]
  );
  if (!orders.length) return [];
  const ids = orders.map(o => o.id);
  // Em sequência: dentro de uma transação a mesma conexão não deve rodar consultas em paralelo.
  const items = await db.query('SELECT * FROM order_items WHERE order_id = ANY($1::bigint[]) ORDER BY id', [ids]);
  const files = await db.query('SELECT order_id, file_name FROM prescriptions WHERE order_id = ANY($1::bigint[])', [ids]);
  const itemsByOrder = new Map();
  for (const item of items.rows) {
    const key = String(item.order_id);
    if (!itemsByOrder.has(key)) itemsByOrder.set(key, []);
    itemsByOrder.get(key).push(item);
  }
  const fileByOrder = new Map(files.rows.map(f => [String(f.order_id), f.file_name]));
  return orders.map(o => serialize.order(o, itemsByOrder.get(String(o.id)) || [], fileByOrder.get(String(o.id)) || null));
}

async function loadOrder(db, userId, orderId) {
  const [order] = await loadOrders(db, userId, orderId);
  if (!order) throw new HttpError(404, 'Pedido não encontrado.');
  return order;
}

// Junta itens repetidos e valida quantidades.
function normalizeItems(rawItems) {
  if (!Array.isArray(rawItems) || rawItems.length === 0) throw new HttpError(400, 'Seu carrinho está vazio.');
  const quantities = new Map();
  for (const item of rawItems) {
    const id = String(item && item.medicineId || '');
    const qty = Math.floor(Number(item && item.quantity));
    if (!id || !Number.isFinite(qty) || qty < 1) throw new HttpError(400, 'Item inválido no carrinho.');
    quantities.set(id, Math.min(MAX_QUANTITY, (quantities.get(id) || 0) + qty));
  }
  if (quantities.size > MAX_ITEMS) throw new HttpError(400, `O carrinho pode ter no máximo ${MAX_ITEMS} remédios diferentes.`);
  return quantities;
}

// Código de retirada de 6 números, único entre os pedidos em aberto (é por ele
// que a farmácia encontra o pedido no balcão).
async function generatePickupCode(client) {
  for (let attempt = 0; attempt < 12; attempt++) {
    const code = randomDigits(6);
    const { rowCount } = await client.query('SELECT 1 FROM orders WHERE pickup_code = $1 AND NOT completed', [code]);
    if (!rowCount) return code;
  }
  throw new HttpError(503, 'Não foi possível gerar o código de retirada. Tente novamente.');
}

// Busca a farmácia e os preços dos itens (os preços vêm sempre do banco).
async function priceGroup(client, pharmacyId, quantities) {
  const { rows: [pharmacy] } = await client.query('SELECT id, name FROM pharmacies WHERE id = $1', [pharmacyId]);
  if (!pharmacy) throw new HttpError(404, 'Farmácia não encontrada.');

  const { rows: meds } = await client.query(
    `SELECT m.id, m.name, m.presentation, m.requires_prescription, mp.price
       FROM medicines m
       JOIN medicine_prices mp ON mp.medicine_id = m.id AND mp.pharmacy_id = $1
      WHERE m.id = ANY($2::text[]) AND m.owner_id IS NULL`,
    [pharmacy.id, [...quantities.keys()]]
  );
  if (meds.length !== quantities.size) throw new HttpError(404, `Algum remédio do carrinho não está disponível na ${pharmacy.name}.`);

  const items = meds.map(m => ({ ...m, quantity: quantities.get(m.id), unitPrice: Number(m.price) }));
  const subtotal = +items.reduce((sum, i) => sum + i.unitPrice * i.quantity, 0).toFixed(2);
  return { pharmacy, items, subtotal };
}

// Grava um pedido (já com os preços conferidos) e devolve o id.
async function insertOrder(client, userId, { pharmacy, items, subtotal, paymentMethod, coupon, discount }) {
  const paidAmount = +(subtotal - discount).toFixed(2);
  const summary = items.length === 1 ? items[0].name : `${items[0].name} e mais ${items.length - 1}`;
  const code = await generatePickupCode(client);
  const requiresPrescription = items.some(i => i.requires_prescription);

  const { rows: [created] } = await client.query(
    `INSERT INTO orders (user_id, pharmacy_id, pharmacy_name, medicine_name, price, subtotal, discount, coupon_name,
                         paid_amount, payment_method, points_earned, pickup_code, requires_prescription)
     VALUES ($1,$2,$3,$4,$5,$5,$6,$7,$8,$9,$10,$11,$12) RETURNING id`,
    [userId, pharmacy.id, pharmacy.name, summary, subtotal, discount, coupon ? coupon.name : null,
     paidAmount, paymentMethod, pointsForPayment(paidAmount), code, requiresPrescription]
  );
  await client.query(
    `INSERT INTO order_items (order_id, medicine_id, name, presentation, quantity, unit_price, requires_prescription)
     SELECT $1::bigint, * FROM unnest($2::text[], $3::text[], $4::text[], $5::smallint[], $6::numeric[], $7::boolean[])`,
    [created.id, items.map(i => i.id), items.map(i => i.name), items.map(i => i.presentation),
     items.map(i => i.quantity), items.map(i => i.unitPrice), items.map(i => i.requires_prescription)]
  );
  return created.id;
}

// Cupom escolhido no pagamento (travado até o fim da transação).
async function takeCoupon(client, userId, couponId) {
  if (!couponId) return null;
  const { rows: [coupon] } = await client.query(
    'SELECT * FROM user_coupons WHERE id = $1 AND user_id = $2 AND used_order_id IS NULL FOR UPDATE',
    [couponId, userId]
  );
  if (!coupon) throw new HttpError(400, 'Cupom indisponível.');
  return coupon;
}

const couponMinimumError = coupon =>
  new HttpError(400, `Este cupom vale para compras a partir de R$ ${Number(coupon.min_order).toFixed(2).replace('.', ',')}.`);

function validatePaymentMethod(method) {
  if (!PAYMENT_METHODS.includes(method)) throw new HttpError(400, 'Escolha uma forma de pagamento.');
}

function parseCouponId(raw) {
  const couponId = raw ? Number(raw) : null;
  if (couponId !== null && !Number.isSafeInteger(couponId)) throw new HttpError(400, 'Cupom indisponível.');
  return couponId;
}

// IDs de pedido precisam ser numéricos (evita erro do banco com valores inválidos).
router.param('id', (req, res, next, id) => {
  if (!/^\d{1,15}$/.test(id)) return next(new HttpError(404, 'Pedido não encontrado.'));
  next();
});

router.get('/', asyncHandler(async (req, res) => {
  res.json(await loadOrders({ query }, req.userId));
}));

// Cria o pedido a partir do carrinho (uma farmácia).
router.post('/', asyncHandler(async (req, res) => {
  const { pharmacyId, paymentMethod } = req.body;
  const couponId = parseCouponId(req.body.couponId);
  validatePaymentMethod(paymentMethod);
  const quantities = normalizeItems(req.body.items);

  const order = await transaction(async client => {
    const group = await priceGroup(client, pharmacyId, quantities);
    const coupon = await takeCoupon(client, req.userId, couponId);
    if (coupon && group.subtotal < Number(coupon.min_order)) throw couponMinimumError(coupon);
    const discount = coupon ? Math.min(Number(coupon.amount), group.subtotal) : 0;

    const id = await insertOrder(client, req.userId, { ...group, paymentMethod, coupon, discount });
    if (coupon) {
      await client.query('UPDATE user_coupons SET used_order_id = $1, used_at = NOW() WHERE id = $2', [id, coupon.id]);
    }
    return loadOrder(client, req.userId, id);
  });
  res.status(201).json({ order });
}));

// Carrinho dividido: cada farmácia vira um pedido, com um código de retirada
// próprio. Tudo numa transação — ou todos os pedidos são criados, ou nenhum.
// O cupom (quando houver) é aplicado no pedido de maior valor.
router.post('/split', asyncHandler(async (req, res) => {
  const { paymentMethod } = req.body;
  const couponId = parseCouponId(req.body.couponId);
  validatePaymentMethod(paymentMethod);

  const rawGroups = Array.isArray(req.body.groups) ? req.body.groups : [];
  if (rawGroups.length < 2) throw new HttpError(400, 'Para dividir o pedido, escolha pelo menos duas farmácias.');
  if (rawGroups.length > MAX_GROUPS) throw new HttpError(400, `O pedido pode ser dividido em no máximo ${MAX_GROUPS} farmácias.`);

  const parsed = rawGroups.map(group => ({
    pharmacyId: String(group && group.pharmacyId || ''),
    quantities: normalizeItems(group && group.items),
  }));
  if (new Set(parsed.map(g => g.pharmacyId)).size !== parsed.length) {
    throw new HttpError(400, 'Cada farmácia pode aparecer uma vez só na divisão do pedido.');
  }

  const orders = await transaction(async client => {
    const priced = [];
    for (const group of parsed) priced.push(await priceGroup(client, group.pharmacyId, group.quantities));

    const coupon = await takeCoupon(client, req.userId, couponId);
    // O cupom entra no pedido mais caro (é onde o desconto costuma caber).
    const couponTarget = coupon
      ? priced.reduce((best, group) => (group.subtotal > best.subtotal ? group : best), priced[0])
      : null;
    if (coupon && couponTarget.subtotal < Number(coupon.min_order)) throw couponMinimumError(coupon);

    const created = [];
    for (const group of priced) {
      const usesCoupon = group === couponTarget;
      const discount = usesCoupon ? Math.min(Number(coupon.amount), group.subtotal) : 0;
      const id = await insertOrder(client, req.userId, {
        ...group, paymentMethod, coupon: usesCoupon ? coupon : null, discount,
      });
      if (usesCoupon) {
        await client.query('UPDATE user_coupons SET used_order_id = $1, used_at = NOW() WHERE id = $2', [id, coupon.id]);
      }
      created.push(id);
    }
    const list = [];
    for (const id of created) list.push(await loadOrder(client, req.userId, id));
    return list;
  });
  res.status(201).json({ orders });
}));

// Receita médica: o usuário escolhe anexar o arquivo (PDF ou foto) ou mostrar na retirada.
// Enquanto não escolher, o pedido fica em "Aguardando receita".
router.post('/:id/prescription', asyncHandler(async (req, res) => {
  const { choice } = req.body;
  if (!['upload', 'in_person'].includes(choice)) throw new HttpError(400, 'Escolha como vai apresentar a receita.');

  let file = null;
  if (choice === 'upload') {
    const parsed = parseDataUrl(req.body.file);
    if (!parsed || !PRESCRIPTION_TYPES.includes(parsed.mime)) throw new HttpError(400, 'Envie a receita em PDF ou imagem (JPG, PNG).');
    if (parsed.bytes > MAX_PRESCRIPTION_BYTES) throw new HttpError(400, 'Arquivo muito grande. Envie um arquivo de até 8 MB.');
    file = { mime: parsed.mime, data: req.body.file, name: String(req.body.fileName || 'receita').slice(0, 120) };
  }

  const order = await transaction(async client => {
    const { rows: [row] } = await client.query(
      'SELECT * FROM orders WHERE id = $1 AND user_id = $2 FOR UPDATE', [req.params.id, req.userId]
    );
    if (!row) throw new HttpError(404, 'Pedido não encontrado.');
    if (!row.requires_prescription) throw new HttpError(400, 'Este pedido não precisa de receita.');
    if (row.prescription_choice) throw new HttpError(400, 'A receita deste pedido já foi informada.');

    if (file) {
      await client.query(
        `INSERT INTO prescriptions (order_id, file_name, mime, data) VALUES ($1,$2,$3,$4)
         ON CONFLICT (order_id) DO UPDATE SET file_name = EXCLUDED.file_name, mime = EXCLUDED.mime, data = EXCLUDED.data, created_at = NOW()`,
        [row.id, file.name, file.mime, file.data]
      );
    }
    // Aprovação simulada: a receita é aceita na hora para o pedido seguir.
    await client.query(
      'UPDATE orders SET prescription_choice = $1, prescription_resolved_at = NOW() WHERE id = $2', [choice, row.id]
    );
    return loadOrder(client, req.userId, row.id);
  });
  res.json({ order });
}));

router.get('/:id/prescription', asyncHandler(async (req, res) => {
  const { rows: [file] } = await query(
    `SELECT p.file_name, p.mime, p.data FROM prescriptions p
       JOIN orders o ON o.id = p.order_id
      WHERE p.order_id = $1 AND o.user_id = $2`,
    [req.params.id, req.userId]
  );
  if (!file) throw new HttpError(404, 'Receita não encontrada.');
  res.json({ fileName: file.file_name, mime: file.mime, data: file.data });
}));

/* A retirada é confirmada pela farmácia, no painel do balcão
   (POST /api/pickups/confirm). O cliente não dá o pedido como retirado:
   é isso que impede ganhar pontos sem passar na farmácia. */

module.exports = router;
