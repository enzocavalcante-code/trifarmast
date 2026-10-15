const express = require('express');
const { query, transaction } = require('../db');
const { HttpError, asyncHandler } = require('../errors');
const { parseDataUrl } = require('../images');
const { pointsForPayment, addPoints } = require('../points');
const { quoteDelivery, randomCourier, MAX_DELIVERY_KM } = require('../delivery');
const serialize = require('../serializers');

const router = express.Router();

const PAYMENT_METHODS = ['Pix', 'Cartão de crédito', 'Dinheiro na retirada', 'Dinheiro na entrega'];
const FULFILLMENTS = ['pickup', 'delivery'];
const MAX_ADDRESS_LENGTH = 200;
const MAX_ITEMS = 30;
const MAX_QUANTITY = 10;
const PRESCRIPTION_TYPES = ['application/pdf', 'image/jpeg', 'image/png', 'image/webp', 'image/heic', 'image/heif'];
const MAX_PRESCRIPTION_BYTES = 8 * 1024 * 1024;

// Carrega pedidos com itens e o nome do arquivo de receita (sem o conteúdo do arquivo).
async function loadOrders(db, userId, orderId = null) {
  const { rows: orders } = await db.query(
    `SELECT * FROM orders WHERE user_id = $1 AND ($2::bigint IS NULL OR id = $2) ORDER BY created_at DESC`,
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

// IDs de pedido precisam ser numéricos (evita erro do banco com valores inválidos).
router.param('id', (req, res, next, id) => {
  if (!/^\d{1,15}$/.test(id)) return next(new HttpError(404, 'Pedido não encontrado.'));
  next();
});

router.get('/', asyncHandler(async (req, res) => {
  res.json(await loadOrders({ query }, req.userId));
}));

// Cria o pedido a partir do carrinho. Preços sempre vêm do banco (nunca do navegador).
router.post('/', asyncHandler(async (req, res) => {
  const { pharmacyId, paymentMethod } = req.body;
  const couponId = req.body.couponId ? Number(req.body.couponId) : null;
  if (couponId !== null && !Number.isSafeInteger(couponId)) throw new HttpError(400, 'Cupom indisponível.');
  if (!PAYMENT_METHODS.includes(paymentMethod)) throw new HttpError(400, 'Escolha uma forma de pagamento.');
  const quantities = normalizeItems(req.body.items);

  // Entrega por motoboy ou retirada no balcão. A taxa é calculada no servidor.
  const fulfillment = FULFILLMENTS.includes(req.body.fulfillment) ? req.body.fulfillment : 'pickup';
  const isDelivery = fulfillment === 'delivery';
  if (paymentMethod === 'Dinheiro na entrega' && !isDelivery) throw new HttpError(400, 'Escolha uma forma de pagamento.');
  if (paymentMethod === 'Dinheiro na retirada' && isDelivery) throw new HttpError(400, 'Escolha uma forma de pagamento.');

  let delivery = null;
  if (isDelivery) {
    const address = String(req.body.deliveryAddress || '').trim().replace(/\s+/g, ' ');
    if (address.length < 8) throw new HttpError(400, 'Informe o endereço de entrega (rua, número e bairro).');
    const quote = quoteDelivery(req.body.distanceKm);
    if (!quote) throw new HttpError(400, 'Não foi possível calcular a entrega. Ative sua localização e tente de novo.');
    if (quote.outOfRange) throw new HttpError(400, `Esta farmácia entrega em até ${MAX_DELIVERY_KM} km. Escolha outra farmácia ou retire no balcão.`);
    delivery = { ...quote, address: address.slice(0, MAX_ADDRESS_LENGTH), courier: randomCourier() };
  }

  const order = await transaction(async client => {
    const { rows: [pharmacy] } = await client.query('SELECT id, name FROM pharmacies WHERE id = $1', [pharmacyId]);
    if (!pharmacy) throw new HttpError(404, 'Farmácia não encontrada.');

    const { rows: meds } = await client.query(
      `SELECT m.id, m.name, m.presentation, m.requires_prescription, mp.price
         FROM medicines m
         JOIN medicine_prices mp ON mp.medicine_id = m.id AND mp.pharmacy_id = $1
        WHERE m.id = ANY($2::text[]) AND m.owner_id IS NULL`,
      [pharmacy.id, [...quantities.keys()]]
    );
    if (meds.length !== quantities.size) throw new HttpError(404, 'Algum remédio do carrinho não está disponível nesta farmácia.');

    const items = meds.map(m => ({ ...m, quantity: quantities.get(m.id), unitPrice: Number(m.price) }));
    const subtotal = +items.reduce((sum, i) => sum + i.unitPrice * i.quantity, 0).toFixed(2);
    const requiresPrescription = items.some(i => i.requires_prescription);

    let discount = 0;
    let coupon = null;
    if (couponId) {
      ({ rows: [coupon] } = await client.query(
        'SELECT * FROM user_coupons WHERE id = $1 AND user_id = $2 AND used_order_id IS NULL FOR UPDATE',
        [couponId, req.userId]
      ));
      if (!coupon) throw new HttpError(400, 'Cupom indisponível.');
      if (subtotal < Number(coupon.min_order)) {
        throw new HttpError(400, `Este cupom vale para compras a partir de R$ ${Number(coupon.min_order).toFixed(2).replace('.', ',')}.`);
      }
      discount = Math.min(Number(coupon.amount), subtotal);
    }

    const deliveryFee = delivery ? delivery.fee : 0;
    const merchandise = +(subtotal - discount).toFixed(2);
    const paidAmount = +(merchandise + deliveryFee).toFixed(2);
    const summary = items.length === 1 ? items[0].name : `${items[0].name} e mais ${items.length - 1}`;
    const code = Math.floor(100000 + Math.random() * 900000).toString();

    const { rows: [created] } = await client.query(
      `INSERT INTO orders (user_id, pharmacy_id, pharmacy_name, medicine_name, price, subtotal, discount, coupon_name,
                           paid_amount, payment_method, points_earned, pickup_code, requires_prescription,
                           fulfillment, delivery_fee, delivery_address, delivery_km, delivery_minutes,
                           courier_name, courier_vehicle, courier_plate, courier_rating)
       VALUES ($1,$2,$3,$4,$5,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,$16,$17,$18,$19,$20,$21) RETURNING id`,
      // Os pontos saem do valor dos remédios: a taxa de entrega não gera pontos.
      [req.userId, pharmacy.id, pharmacy.name, summary, subtotal, discount, coupon ? coupon.name : null,
       paidAmount, paymentMethod, pointsForPayment(merchandise), code, requiresPrescription,
       fulfillment, deliveryFee, delivery ? delivery.address : null, delivery ? delivery.km : null,
       delivery ? delivery.minutes : null, delivery ? delivery.courier.name : null,
       delivery ? delivery.courier.vehicle : null, delivery ? delivery.courier.plate : null,
       delivery ? delivery.courier.rating : null]
    );
    await client.query(
      `INSERT INTO order_items (order_id, medicine_id, name, presentation, quantity, unit_price, requires_prescription)
       SELECT $1::bigint, * FROM unnest($2::text[], $3::text[], $4::text[], $5::smallint[], $6::numeric[], $7::boolean[])`,
      [created.id, items.map(i => i.id), items.map(i => i.name), items.map(i => i.presentation),
       items.map(i => i.quantity), items.map(i => i.unitPrice), items.map(i => i.requires_prescription)]
    );
    if (coupon) {
      await client.query('UPDATE user_coupons SET used_order_id = $1, used_at = NOW() WHERE id = $2', [created.id, coupon.id]);
    }
    return loadOrder(client, req.userId, created.id);
  });
  res.status(201).json({ order });
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
    // Em pedidos com entrega a receita só vale anexada: não há conferência com o motoboy.
    if (choice === 'in_person' && serialize.isDelivery(row)) {
      throw new HttpError(400, 'Em pedidos com entrega, a receita precisa ser anexada no app.');
    }

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

// Confirma a retirada no balcão (ou o recebimento em casa) e credita os pontos.
router.post('/:id/pickup', asyncHandler(async (req, res) => {
  const result = await transaction(async client => {
    const { rows: [row] } = await client.query(
      'SELECT * FROM orders WHERE id = $1 AND user_id = $2 FOR UPDATE', [req.params.id, req.userId]
    );
    if (!row) throw new HttpError(404, 'Pedido não encontrado.');
    if (serialize.orderStatus(row) !== serialize.handoverStatus(row)) {
      throw new HttpError(400, serialize.isDelivery(row)
        ? 'O motoboy ainda não chegou no seu endereço.'
        : 'O pedido ainda não está pronto para retirada.');
    }

    await client.query('UPDATE orders SET completed = TRUE WHERE id = $1', [row.id]);
    const description = serialize.isDelivery(row)
      ? `Pedido #${row.id} entregue (${row.pharmacy_name})`
      : `Pedido #${row.id} retirado na ${row.pharmacy_name}`;
    const points = row.points_earned > 0
      ? await addPoints(client, req.userId, row.points_earned, description)
      : (await client.query('SELECT points FROM users WHERE id = $1', [req.userId])).rows[0].points;
    return { order: await loadOrder(client, req.userId, row.id), points };
  });
  res.json(result);
}));

module.exports = router;
