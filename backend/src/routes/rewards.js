const express = require('express');
const { transaction } = require('../db');
const { HttpError, asyncHandler } = require('../errors');

const router = express.Router();

router.post('/:id/redeem', asyncHandler(async (req, res) => {
  const result = await transaction(async client => {
    const { rows: [reward] } = await client.query('SELECT * FROM rewards WHERE id = $1', [req.params.id]);
    if (!reward) throw new HttpError(404, 'Recompensa não encontrada.');
    const { rows: [user] } = await client.query('SELECT points FROM users WHERE id = $1 FOR UPDATE', [req.userId]);
    if (user.points < reward.cost) throw new HttpError(400, 'Pontos insuficientes.');
    const { rows: [updated] } = await client.query(
      'UPDATE users SET points = points - $1 WHERE id = $2 RETURNING points', [reward.cost, req.userId]
    );
    return { points: updated.points, reward: reward.name };
  });
  res.json(result);
}));

module.exports = router;
