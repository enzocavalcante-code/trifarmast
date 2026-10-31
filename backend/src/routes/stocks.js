const express = require('express');
const { HttpError, asyncHandler } = require('../errors');
const { listStocks, saveStock } = require('../stocks');

const router = express.Router();

router.get('/', asyncHandler(async (req, res) => {
  res.json(await listStocks(req.userId));
}));

// Informa (ou corrige) quantas unidades a pessoa tem em casa.
router.put('/', asyncHandler(async (req, res) => {
  const stock = await saveStock(req.userId, req.body);
  if (!stock) throw new HttpError(400, 'Informe o remédio e quantas unidades você tem.');
  res.json({ stock });
}));

module.exports = router;
