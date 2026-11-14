const pointsForPayment = paidAmount => Math.floor(paidAmount);

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
