// Histórico de preços e alertas "avise quando baixar".

const HISTORY_DAYS = 60;

// Cria um aviso para cada alerta cujo preço-alvo foi atingido e marca o alerta
// como avisado. Roda a cada inicialização, depois de atualizar os preços.
async function checkPriceAlerts(db) {
  const { rows } = await db.query(`
    WITH low AS (
      SELECT medicine_id, MIN(price) AS min_price FROM medicine_prices GROUP BY medicine_id
    ), hits AS (
      SELECT a.id, a.user_id, a.medicine_id, m.name, low.min_price
        FROM price_alerts a
        JOIN medicines m ON m.id = a.medicine_id
        JOIN low ON low.medicine_id = a.medicine_id
       WHERE a.notified_at IS NULL
         AND low.min_price <= COALESCE(a.target_price, a.reference_price - 0.01)
    ), marked AS (
      UPDATE price_alerts SET notified_at = NOW() WHERE id IN (SELECT id FROM hits) RETURNING id
    )
    INSERT INTO notifications (user_id, kind, title, body, medicine_id)
    SELECT user_id, 'price_drop', 'O preço de ' || name || ' baixou',
           'Agora sai por R$ ' || replace(to_char(min_price, 'FM999990.00'), '.', ',') ||
           ' na farmácia mais barata. Toque para ver as ofertas.',
           medicine_id
      FROM hits
    RETURNING id`);
  return rows.length;
}

// Menor preço por dia (entre todas as farmácias) para o gráfico do remédio.
async function priceHistory(db, medicineId) {
  const { rows } = await db.query(
    `SELECT day, MIN(price) AS min_price, MAX(price) AS max_price
       FROM price_history
      WHERE medicine_id = $1 AND day >= CURRENT_DATE - $2::int
      GROUP BY day ORDER BY day`,
    [medicineId, HISTORY_DAYS]
  );
  return rows.map(r => ({
    day: r.day instanceof Date ? r.day.toISOString().slice(0, 10) : String(r.day).slice(0, 10),
    min: Number(r.min_price),
    max: Number(r.max_price),
  }));
}

module.exports = { checkPriceAlerts, priceHistory, HISTORY_DAYS };
