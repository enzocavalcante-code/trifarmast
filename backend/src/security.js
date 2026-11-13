// Proteções do servidor, sem dependências novas:
//  - cabeçalhos de segurança em todas as respostas;
//  - limites de tentativas, guardados na memória do processo.

const { HttpError } = require('./errors');

function securityHeaders(req, res, next) {
  res.setHeader('X-Content-Type-Options', 'nosniff');
  res.setHeader('X-Frame-Options', 'DENY');
  res.setHeader('Referrer-Policy', 'no-referrer');
  res.setHeader('Cross-Origin-Resource-Policy', 'cross-origin');
  res.setHeader('Permissions-Policy', 'geolocation=(), camera=(), microphone=()');
  // A API só responde JSON: nada de script, imagem ou frame vindo dela.
  res.setHeader('Content-Security-Policy', "default-src 'none'; frame-ancestors 'none'");
  // Dados de conta não ficam guardados em cache de navegador ou de rede
  // (o catálogo, que é público, troca este cabeçalho na própria rota).
  res.setHeader('Cache-Control', 'no-store');
  if (req.headers['x-forwarded-proto'] === 'https' || req.secure) {
    res.setHeader('Strict-Transport-Security', 'max-age=15552000; includeSubDomains');
  }
  next();
}

// IP de quem chamou. No Render o tráfego chega pela Cloudflare, que grava o IP
// real num cabeçalho que o visitante não consegue forjar. Nas outras hospedagens
// vale o req.ip do Express (ajustado por TRUST_PROXY). O X-Forwarded-For puro
// não serve: o visitante escreve nele o que quiser e escaparia de todo limite.
function clientIp(req) {
  const cloudflare = process.env.RENDER && req.get('cf-connecting-ip');
  return String(cloudflare || req.ip || '').trim();
}

/* ---------------- limite de tentativas ---------------- */

const MAX_BUCKETS = 100000;
const buckets = new Map();   // chave -> { count, resetAt }

function hit(key, windowMs, max) {
  const now = Date.now();
  const bucket = buckets.get(key);
  if (!bucket || bucket.resetAt <= now) {
    if (buckets.size >= MAX_BUCKETS) buckets.delete(buckets.keys().next().value);   // a memória não cresce sem fim
    buckets.set(key, { count: 1, resetAt: now + windowMs });
    return { allowed: true, retryAfter: 0 };
  }
  bucket.count += 1;
  if (bucket.count > max) {
    return { allowed: false, retryAfter: Math.ceil((bucket.resetAt - now) / 1000) };
  }
  return { allowed: true, retryAfter: 0 };
}

// Limpa chaves vencidas de vez em quando.
const cleanup = setInterval(() => {
  const now = Date.now();
  for (const [key, bucket] of buckets) if (bucket.resetAt <= now) buckets.delete(key);
}, 10 * 60 * 1000);
cleanup.unref();

const minutes = seconds => Math.max(1, Math.ceil(seconds / 60));

function tooMany(message, retryAfter) {
  const error = new HttpError(429, message || `Muitas tentativas. Tente novamente em ${minutes(retryAfter)} min.`);
  error.retryAfter = retryAfter;
  return error;
}

/* Middleware: conta todo pedido. `key` diz de quem é a conta (padrão: o IP). */
function rateLimit({ windowMs = 15 * 60 * 1000, max = 20, name = 'req', key = clientIp, message = null } = {}) {
  return (req, res, next) => {
    const { allowed, retryAfter } = hit(`${name}:${key(req)}`, windowMs, max);
    next(allowed ? undefined : tooMany(message, retryAfter));
  };
}

/* Para senhas e códigos: a tentativa é contada ANTES de conferir (pedidos
   simultâneos não furam o limite) e devolvida quando a pessoa acerta. */
function attempts({ windowMs = 15 * 60 * 1000, max = 10, name, message = null }) {
  return {
    take(id) {
      const { allowed, retryAfter } = hit(`${name}:${id}`, windowMs, max);
      if (!allowed) throw tooMany(message, retryAfter);
    },
    refund(id) {
      const bucket = buckets.get(`${name}:${id}`);
      if (bucket && bucket.count > 0) bucket.count -= 1;
    },
  };
}

module.exports = { securityHeaders, clientIp, rateLimit, attempts };
