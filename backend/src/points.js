// Regras do programa de pontos (fonte única para o servidor).
//  - Ganha: 1 ponto para cada R$1 pago, creditado ao confirmar a retirada.
//  - Contas novas começam com 0 pontos (não há bônus de cadastro).
//  - Usa: pontos são trocados por cupons de desconto (tabela rewards).

const pointsForPayment = paidAmount => Math.floor(paidAmount);

// Soma (ou subtrai) pontos e registra no extrato. Retorna o novo saldo.
async function addPoints(client, userId, delta, description) {
  const { rows: [user] } = await client.query(
    'UPDATE users SET points = points + $1 WHERE id = $2 RETURNING points', [delta, userId]
  );
  await client.query(
    'INSERT INTO points_history (user_id, delta, description) VALUES ($1,$2,$3)', [userId, delta, description]
  );
  return user.points;
}

module.exports = { pointsForPayment, addPoints };
