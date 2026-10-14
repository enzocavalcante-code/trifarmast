const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');
const config = require('./config');

const hashPassword = plain => bcrypt.hash(plain, 10);
const checkPassword = (plain, hash) => (hash ? bcrypt.compare(plain, hash) : Promise.resolve(false));

const signToken = userId => jwt.sign({ sub: userId }, config.jwtSecret, { expiresIn: '7d' });

// Middleware: exige "Authorization: Bearer <token>" e coloca req.userId.
function requireAuth(req, res, next) {
  const header = req.get('authorization') || '';
  const token = header.startsWith('Bearer ') ? header.slice(7) : null;
  if (!token) return res.status(401).json({ error: 'Sessão expirada. Entre novamente.' });
  try {
    req.userId = jwt.verify(token, config.jwtSecret).sub;
    next();
  } catch {
    res.status(401).json({ error: 'Sessão expirada. Entre novamente.' });
  }
}

module.exports = { hashPassword, checkPassword, signToken, requireAuth };
