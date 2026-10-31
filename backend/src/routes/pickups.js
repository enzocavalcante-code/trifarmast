// Painel da farmácia (frontend/farmacia.html).
//
// Quem está no balcão digita o código do pedido para conferir o que entregar e
// confirmar a retirada. É essa confirmação que credita os pontos do cliente —
// o próprio cliente não consegue mais dar o pedido como retirado.
//
// O acesso é protegido por uma senha única (PHARMACY_PIN). Num sistema real,
// cada farmácia teria sua própria conta; aqui a senha é a mesma para todas.

const express = require('express');
const config = require('../config');
const { query, transaction } = require('../db');
const { HttpError, asyncHandler } = require('../errors');
const { addPoints } = require('../points');
const { rateLimit } = require('../security');
const serialize = require('../serializers');

const router = express.Router();

const limitPickup = rateLimit({
  name: 'pickup', windowMs: 10 * 60 * 1000, max: 30,
  message: 'Muitas tentativas de código. Aguarde alguns minutos.',
});

function requirePin(req) {
  if (!config.pharmacyPin) {
    throw new HttpError(503, 'Painel da farmácia não configurado neste servidor (defina PHARMACY_PIN).');
  }
  const pin = String(req.body && req.body.pin || req.get('x-pharmacy-pin') || '');
  if (pin !== config.pharmacyPin) throw new HttpError(401, 'Senha do painel incorreta.');
}

const cleanCode = value => String(value || '').replace(/\D/g, '');

// Busca um pedido em aberto pelo código (os códigos são únicos entre os pedidos em aberto).
async function findOpenOrder(db, code) {
  const { rows: [order] } = await db.query(
    `SELECT o.*, u.name AS customer_name
       FROM orders o JOIN users u ON u.id = o.user_id
      WHERE o.pickup_code = $1 AND NOT o.completed
      LIMIT 1`,
    [code]
  );
  return order || null;
}

async function orderDetails(db, order) {
  const { rows: items } = await db.query(
    'SELECT * FROM order_items WHERE order_id = $1 ORDER BY id', [order.id]
  );
  const { rows: [file] } = await db.query(
    'SELECT file_name FROM prescriptions WHERE order_id = $1', [order.id]
  );
  return {
    id: Number(order.id),
    code: order.pickup_code,
    customerFirstName: String(order.customer_name || '').split(' ')[0],
    pharmacyName: order.pharmacy_name,
    status: serialize.orderStatus(order),
    createdAt: order.created_at,
    paidAmount: Number(order.paid_amount),
    paymentMethod: order.payment_method,
    pendingPayment: order.payment_method === 'Dinheiro na retirada',
    requiresPrescription: order.requires_prescription,
    prescriptionChoice: order.prescription_choice,
    prescriptionFileName: file ? file.file_name : null,
    points: order.points_earned,
    items: items.map(i => ({
      name: i.name, presentation: i.presentation, quantity: i.quantity,
      unitPrice: Number(i.unit_price), requiresPrescription: i.requires_prescription,
    })),
  };
}

// Confere o código e mostra o pedido, sem confirmar a retirada.
router.post('/lookup', limitPickup, asyncHandler(async (req, res) => {
  requirePin(req);
  const code = cleanCode(req.body.code);
  if (code.length !== 6) throw new HttpError(400, 'O código tem 6 números.');

  const order = await findOpenOrder({ query }, code);
  if (!order) throw new HttpError(404, 'Código não encontrado. Confira os números ou se o pedido já foi retirado.');
  res.json({ order: await orderDetails({ query }, order) });
}));

// Confirma a entrega: conclui o pedido, credita os pontos e avisa o cliente.
router.post('/confirm', limitPickup, asyncHandler(async (req, res) => {
  requirePin(req);
  const code = cleanCode(req.body.code);
  if (code.length !== 6) throw new HttpError(400, 'O código tem 6 números.');

  const result = await transaction(async client => {
    const order = await findOpenOrder(client, code);
    if (!order) throw new HttpError(404, 'Código não encontrado. Confira os números ou se o pedido já foi retirado.');

    // Trava a linha para dois atendentes não confirmarem o mesmo pedido.
    const { rows: [locked] } = await client.query('SELECT * FROM orders WHERE id = $1 FOR UPDATE', [order.id]);
    if (locked.completed) throw new HttpError(409, 'Este pedido já foi retirado.');

    const status = serialize.orderStatus(locked);
    if (status === serialize.STATUS.WAITING_RX) {
      throw new HttpError(400, 'O cliente ainda não informou a receita deste pedido no app.');
    }
    if (status !== serialize.STATUS.READY) {
      throw new HttpError(400, `O pedido ainda está em "${status}". Aguarde a separação ficar pronta.`);
    }

    await client.query(
      `UPDATE orders SET completed = TRUE, pickup_validated_at = NOW(), pickup_validated_by = 'pharmacy' WHERE id = $1`,
      [locked.id]
    );
    if (locked.points_earned > 0) {
      await addPoints(client, locked.user_id, locked.points_earned, `Pedido #${locked.id} retirado na ${locked.pharmacy_name}`);
    }
    return orderDetails(client, { ...locked, customer_name: order.customer_name, completed: true });
  });

  res.json({ order: result, confirmed: true });
}));

module.exports = router;
