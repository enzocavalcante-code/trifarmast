const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');
const config = require('./config');
const { HttpError } = require('./errors');

const MIN_PASSWORD = 8;
const MAX_PASSWORD_BYTES = 72;   // o bcrypt ignora o que passa disso
const MAX_NAME = 80;
const MAX_EMAIL = 254;

const hashPassword = plain => bcrypt.hash(plain, 10);
const checkPassword = (plain, hash) => (hash ? bcrypt.compare(plain, hash) : Promise.resolve(false));

const normalizeEmail = email => String(email || '').trim().toLowerCase();
const looksLikeEmail = email => email.length <= MAX_EMAIL && /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email);

// Regras de uma senha nova (cadastro e troca de senha).
function assertNewPassword(password) {
  if (password.length < MIN_PASSWORD) throw new HttpError(400, `A senha precisa ter pelo menos ${MIN_PASSWORD} caracteres.`);
  if (Buffer.byteLength(password) > MAX_PASSWORD_BYTES) throw new HttpError(400, 'A senha é longa demais. Use até 72 caracteres.');
}

function assertName(name) {
  if (name.length > MAX_NAME) throw new HttpError(400, `O nome pode ter no máximo ${MAX_NAME} caracteres.`);
}

// "v" é a versão da sessão: muda quando a senha é trocada (ver requireAuth).
const signToken = (userId, version = 0) =>
  jwt.sign({ sub: userId, v: version }, config.jwtSecret, { algorithm: 'HS256', expiresIn: '7d' });

// Middleware: exige "Authorization: Bearer <token>" e coloca req.userId.
async function requireAuth(req, res, next) {
  const expired = () => res.status(401).json({ error: 'Sessão expirada. Entre novamente.' });
  const header = req.get('authorization') || '';
  const token = header.startsWith('Bearer ') ? header.slice(7) : null;
  if (!token) return expired();
  let claims;
  try {
    claims = jwt.verify(token, config.jwtSecret, { algorithms: ['HS256'] });
  } catch {
    return expired();
  }
  try {
    // A conta precisa existir e o token ser da versão atual: trocar a senha
    // derruba na hora as sessões abertas em outros aparelhos.
    // (require aqui dentro porque db.js também importa este arquivo.)
    const { rows } = await require('./db').query('SELECT token_version FROM users WHERE id = $1', [claims.sub]);
    if (!rows[0] || rows[0].token_version !== (claims.v || 0)) return expired();
  } catch (err) {
    return next(err);
  }
  req.userId = claims.sub;
  next();
}

module.exports = {
  hashPassword, checkPassword, signToken, requireAuth,
  normalizeEmail, looksLikeEmail, assertNewPassword, assertName,
};
