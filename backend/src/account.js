// Leitura dos dados da conta (pedidos, lembretes e pontos).
// Fica fora das rotas porque o login também devolve tudo isso de uma vez:
// assim o app entra na conta com UMA requisição, em vez de quatro.

const { query } = require('./db');
const serialize = require('./serializers');
const { listStocks } = require('./stocks');

const BOOTSTRAP_ORDERS = 20;   // os mais recentes bastam para abrir o app

// Carrega pedidos com itens e o nome do arquivo de receita (sem o conteúdo do arquivo).
async function loadOrders(db, userId, orderId = null, limit = null) {
  const { rows: orders } = await db.query(
    `SELECT * FROM orders
      WHERE user_id = $1 AND ($2::bigint IS NULL OR id = $2)
      ORDER BY created_at DESC
      LIMIT $3::int`,
    [userId, orderId, limit]
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

async function loadPoints(userId) {
  const [user, pending, coupons, history] = await Promise.all([
    query('SELECT points FROM users WHERE id = $1', [userId]),
    query('SELECT COALESCE(SUM(points_earned), 0)::int AS total FROM orders WHERE user_id = $1 AND NOT completed', [userId]),
    query('SELECT * FROM user_coupons WHERE user_id = $1 AND used_order_id IS NULL ORDER BY created_at', [userId]),
    query('SELECT delta, description, created_at FROM points_history WHERE user_id = $1 ORDER BY created_at DESC, id DESC LIMIT 30', [userId]),
  ]);
  return {
    points: user.rows[0] ? user.rows[0].points : 0,
    pending: pending.rows[0].total,
    coupons: coupons.rows.map(serialize.coupon),
    history: history.rows.map(h => ({ delta: h.delta, description: h.description, createdAt: h.created_at })),
  };
}

async function loadReminders(userId) {
  const { rows } = await query('SELECT * FROM reminders WHERE user_id = $1 ORDER BY id', [userId]);
  return rows.map(serialize.reminder);
}

// Tudo o que o app precisa logo depois de entrar, numa requisição só.
async function loadAccountData(userId) {
  const [orders, reminders, points, stocks] = await Promise.all([
    loadOrders({ query }, userId, null, BOOTSTRAP_ORDERS),
    loadReminders(userId),
    loadPoints(userId),
    listStocks(userId),
  ]);
  return { orders, reminders, points, stocks };
}

module.exports = { loadOrders, loadPoints, loadReminders, loadAccountData };
