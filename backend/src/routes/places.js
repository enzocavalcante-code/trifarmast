const express = require('express');
const { HttpError, asyncHandler } = require('../errors');
const geo = require('../geo');

const router = express.Router();

function readCoords(q) {
  const lat = Number(q.lat);
  const lng = Number(q.lng);
  if (!Number.isFinite(lat) || !Number.isFinite(lng) || Math.abs(lat) > 90 || Math.abs(lng) > 180) {
    throw new HttpError(400, 'Localização inválida.');
  }
  return { lat, lng };
}

// Farmácias reais ao redor de um ponto.
router.get('/pharmacies', asyncHandler(async (req, res) => {
  const { lat, lng } = readCoords(req.query);
  try {
    res.json(await geo.nearbyPharmacies(lat, lng));
  } catch (err) {
    console.error('Busca de farmácias falhou:', err.message);
    throw new HttpError(503, 'Mapa indisponível agora. Tente de novo em instantes.');
  }
}));

// Endereço legível a partir de coordenadas.
router.get('/reverse', asyncHandler(async (req, res) => {
  const { lat, lng } = readCoords(req.query);
  try {
    res.json(await geo.reverseGeocode(lat, lng));
  } catch {
    res.json({ label: '' });
  }
}));

// Endereço ou CEP → coordenadas.
router.get('/search', asyncHandler(async (req, res) => {
  const q = String(req.query.q || '').trim();
  if (q.length < 3) throw new HttpError(400, 'Digite um endereço ou CEP.');
  const place = await geo.geocode(q);
  if (!place) throw new HttpError(404, 'Endereço não encontrado. Tente com o bairro e a cidade, ou o CEP.');
  res.json(place);
}));

// Localização aproximada pela conexão de internet (quando o GPS não está disponível).
router.get('/approximate', asyncHandler(async (req, res) => {
  const ip = String(req.ip || '').replace(/^::ffff:/, '');
  let place = null;
  try {
    place = await geo.approximateLocation(ip);
  } catch (err) {
    console.error('Localização por IP falhou:', err.message);
  }
  if (!place) throw new HttpError(404, 'Não consegui sua localização. Digite o endereço ou CEP.');
  res.json(place);
}));

module.exports = router;
