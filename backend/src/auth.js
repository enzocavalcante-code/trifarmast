const crypto = require('crypto');
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

/* Código numérico aleatório (recuperação de senha, código de retirada).
   Só o hash do código fica no banco. */
const randomDigits = length => Array.from(crypto.randomBytes(length))
  .map(byte => byte % 10).join('');

const hashCode = code => crypto.createHash('sha256').update(String(code)).digest('hex');

const sameCode = (code, hash) => {
  const a = Buffer.from(hashCode(code));
  const b = Buffer.from(String(hash || ''));
  return a.length === b.length && crypto.timingSafeEqual(a, b);
};

module.exports = { hashPassword, checkPassword, signToken, requireAuth, randomDigits, hashCode, sameCode };
