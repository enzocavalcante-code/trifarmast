// Converte linhas do banco no formato que o front-end espera.

const ORDER_PREPARING_AFTER_MS = 3500;
const ORDER_READY_AFTER_MS = 8000;

function user(row) {
  return {
    name: row.name,
    email: row.email,
    googleAccount: row.google_account,
    avatar: row.avatar,
    points: row.points,
    welcomeSeen: row.welcome_seen,
  };
}

// O status do pedido avança sozinho com o tempo (simulação da farmácia),
// até o usuário confirmar a retirada.
function orderStatus(row, now = Date.now()) {
  if (row.completed) return 'Concluído';
  const elapsed = now - new Date(row.created_at).getTime();
  if (elapsed >= ORDER_READY_AFTER_MS) return 'Pronto para retirar';
  if (elapsed >= ORDER_PREPARING_AFTER_MS) return 'Em preparação';
  return 'Pedido recebido';
}

function order(row) {
  return {
    id: Number(row.id),
    medName: row.medicine_name,
    pharmName: row.pharmacy_name,
    price: Number(row.price),
    pointsUsed: row.points_used,
    discount: Number(row.discount),
    paidAmount: Number(row.paid_amount),
    paymentMethod: row.payment_method,
    points: row.points_earned,
    code: row.pickup_code,
    status: orderStatus(row),
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

module.exports = { user, order, orderStatus, reminder, ORDER_READY_AFTER_MS };
