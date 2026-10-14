// Proteções do servidor, sem dependências novas:
//  - cabeçalhos de segurança em todas as respostas;
//  - limite de tentativas por IP (memória do processo) para login, cadastro,
//    recuperação de senha e validação de código no balcão.

const { HttpError } = require('./errors');

function securityHeaders(req, res, next) {
  res.setHeader('X-Content-Type-Options', 'nosniff');
  res.setHeader('X-Frame-Options', 'DENY');
  res.setHeader('Referrer-Policy', 'no-referrer');
  res.setHeader('Cross-Origin-Resource-Policy', 'cross-origin');
  res.setHeader('Permissions-Policy', 'geolocation=(), camera=(), microphone=()');
  // A API só responde JSON: nada de script, imagem ou frame vindo dela.
  res.setHeader('Content-Security-Policy', "default-src 'none'; frame-ancestors 'none'");
  if (req.headers['x-forwarded-proto'] === 'https' || req.secure) {
    res.setHeader('Strict-Transport-Security', 'max-age=15552000; includeSubDomains');
  }
  next();
}

/* ---------------- limite de tentativas ---------------- */

const buckets = new Map();   // chave -> { count, resetAt }

function hit(key, windowMs, max) {
  const now = Date.now();
  const bucket = buckets.get(key);
  if (!bucket || bucket.resetAt <= now) {
    buckets.set(key, { count: 1, resetAt: now + windowMs });
    return { allowed: true, retryAfter: 0 };
  }
  bucket.count += 1;
  if (bucket.count > max) {
    return { allowed: false, retryAfter: Math.ceil((bucket.resetAt - now) / 1000) };
  }
  return { allowed: true, retryAfter: 0 };
}

// Limpa chaves vencidas de vez em quando (o processo não cresce sem parar).
const cleanup = setInterval(() => {
  const now = Date.now();
  for (const [key, bucket] of buckets) if (bucket.resetAt <= now) buckets.delete(key);
}, 10 * 60 * 1000);
cleanup.unref();

const minutes = seconds => Math.max(1, Math.ceil(seconds / 60));

/* Middleware de limite. `by` monta a chave (padrão: IP). */
function rateLimit({ windowMs = 15 * 60 * 1000, max = 20, name = 'req', by = null, message = null } = {}) {
  return (req, res, next) => {
    const extra = by ? by(req) : '';
    const { allowed, retryAfter } = hit(`${name}:${req.ip}:${extra}`, windowMs, max);
    if (allowed) return next();
    res.setHeader('Retry-After', String(retryAfter));
    next(new HttpError(429, message || `Muitas tentativas. Tente novamente em ${minutes(retryAfter)} min.`));
  };
}

// Zera o limite depois de uma tentativa bem-sucedida (ex.: login correto).
function clearLimit(name, req, extra = '') {
  buckets.delete(`${name}:${req.ip}:${extra}`);
}

module.exports = { securityHeaders, rateLimit, clearLimit, minutes };
