// Converte linhas do banco no formato que o front-end espera.

const delivery = require('./delivery');

const STATUS = {
  RECEIVED: 'Pedido recebido',
  WAITING_RX: 'Aguardando receita',
  PREPARING: 'Em preparação',
  READY: 'Pronto para retirar',
  OUT: 'Saiu para entrega',
  ARRIVED: 'Motoboy chegou',
  DONE: 'Concluído',
  DELIVERED: 'Entregue',
};

const isDelivery = row => row.fulfillment === 'delivery';
// Último passo antes de o usuário confirmar (retirada no balcão ou recebimento em casa).
const handoverStatus = row => (isDelivery(row) ? STATUS.ARRIVED : STATUS.READY);
const finalStatus = row => (isDelivery(row) ? STATUS.DELIVERED : STATUS.DONE);

function user(row) {
  return {
    name: row.name,
    email: row.email,
    googleAccount: row.google_account,
    avatar: row.avatar,
    avatarCustom: row.avatar_custom,
    hasGooglePhoto: !!row.google_picture,
    points: row.points,
  };
}

// O pedido avança sozinho com o tempo (simulação da farmácia). Pedidos com
// remédio que exige receita ficam parados até o usuário escolher como apresentá-la.
function orderTimeline(row) {
  if (row.completed) return [];
  const withPrescription = row.requires_prescription;
  if (withPrescription && !row.prescription_choice) return [];
  // Com receita, a contagem recomeça quando a receita é resolvida.
  const base = new Date(withPrescription ? row.prescription_resolved_at : row.created_at).getTime();
  const start = withPrescription
    ? [{ status: STATUS.PREPARING, at: base }]
    : [{ status: STATUS.RECEIVED, at: base }, { status: STATUS.PREPARING, at: base + 3500 }];

  if (isDelivery(row)) {
    const ride = delivery.deliverySchedule(withPrescription ? base - delivery.PREPARING_MS : base);
    return [
      ...start,
      { status: STATUS.OUT, at: ride.dispatchedAt },
      { status: STATUS.ARRIVED, at: ride.arrivesAt },
    ];
  }
  return [...start, { status: STATUS.READY, at: withPrescription ? base + 6000 : base + 8000 }];
}

function orderStatus(row, now = Date.now()) {
  if (row.completed) return finalStatus(row);
  if (row.requires_prescription && !row.prescription_choice) return STATUS.WAITING_RX;
  const timeline = orderTimeline(row);
  let current = timeline[0].status;
  for (const step of timeline) if (step.at <= now) current = step.status;
  return current;
}

// Dados da entrega enviados ao app: taxa, endereço, motoboy e horários da simulação.
function orderDelivery(row) {
  if (!isDelivery(row)) return null;
  const timeline = orderTimeline(row);
  const step = status => (timeline.find(s => s.status === status) || {}).at || null;
  return {
    fee: Number(row.delivery_fee),
    address: row.delivery_address,
    km: row.delivery_km === null ? null : Number(row.delivery_km),
    minutes: row.delivery_minutes,
    courier: {
      name: row.courier_name,
      vehicle: row.courier_vehicle,
      plate: row.courier_plate,
      rating: row.courier_rating === null ? null : Number(row.courier_rating),
    },
    dispatchedAt: step(STATUS.OUT) ? new Date(step(STATUS.OUT)).toISOString() : null,
    arrivesAt: step(STATUS.ARRIVED) ? new Date(step(STATUS.ARRIVED)).toISOString() : null,
  };
}

function orderItem(row) {
  return {
    medicineId: row.medicine_id,
    name: row.name,
    presentation: row.presentation,
    quantity: row.quantity,
    unitPrice: Number(row.unit_price),
    requiresPrescription: row.requires_prescription,
  };
}

function order(row, itemRows = [], prescriptionFileName = null) {
  // Pedidos antigos (antes do carrinho) têm um único remédio nas colunas legadas.
  const items = itemRows.length
    ? itemRows.map(orderItem)
    : [{ medicineId: null, name: row.medicine_name || 'Pedido', presentation: '', quantity: 1, unitPrice: Number(row.price ?? row.paid_amount), requiresPrescription: false }];
  return {
    id: Number(row.id),
    pharmacyName: row.pharmacy_name,
    items,
    subtotal: Number(row.subtotal ?? row.price ?? row.paid_amount),
    discount: Number(row.discount),
    fulfillment: row.fulfillment || 'pickup',
    delivery: orderDelivery(row),
    couponName: row.coupon_name || (row.points_used ? `${row.points_used} pts` : null),
    paidAmount: Number(row.paid_amount),
    paymentMethod: row.payment_method,
    points: row.points_earned,
    code: row.pickup_code,
    requiresPrescription: row.requires_prescription,
    prescriptionChoice: row.prescription_choice,
    prescriptionFileName,
    status: orderStatus(row),
    timeline: orderTimeline(row).map(s => ({ status: s.status, at: new Date(s.at).toISOString() })),
    createdAt: row.created_at,
  };
}

function reminder(row) {
  return {
    id: Number(row.id),
    med: row.medicine,
    time: row.time,
    day: row.day,
    month: row.month,
    year: row.year,
    fired: row.fired,
  };
}

function coupon(row) {
  return {
    id: Number(row.id),
    name: row.name,
    amount: Number(row.amount),
    minOrder: Number(row.min_order),
    createdAt: row.created_at,
  };
}

module.exports = { STATUS, user, order, orderStatus, handoverStatus, finalStatus, isDelivery, reminder, coupon };
