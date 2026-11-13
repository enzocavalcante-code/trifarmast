require('dotenv').config();

function required(name) {
  const value = process.env[name];
  if (!value) throw new Error(`Variável de ambiente obrigatória ausente: ${name}`);
  return value;
}

const config = {
  port: Number(process.env.PORT) || 3000,
  databaseUrl: required('DATABASE_URL'),
  databaseSsl: process.env.DATABASE_SSL !== 'false',
  jwtSecret: required('JWT_SECRET'),
  googleClientId: process.env.GOOGLE_CLIENT_ID || '',
  // Origens autorizadas a chamar a API (URL do Vercel, localhost...), separadas por vírgula.
  corsOrigins: (process.env.CORS_ORIGINS || '').split(',').map(s => s.trim()).filter(Boolean),
  // Senha única do painel do balcão (frontend/pharmacy.html).
  pharmacyPin: process.env.PHARMACY_PIN || '',
  // Quantos servidores intermediários ficam na frente da API (o padrão das
  // hospedagens é 1). É daí que sai o IP de quem chamou — ver security.js.
  trustProxy: Number(process.env.TRUST_PROXY ?? 1) || 0,
};

// "Usar conta demo" só existe enquanto o login real do Google não está configurado.
config.allowDemoGoogle = !config.googleClientId && process.env.ALLOW_DEMO_GOOGLE !== 'false';

// Configuração fraca não derruba o site, mas fica avisada nos logs.
const avisos = [
  config.jwtSecret.length < 32 && 'JWT_SECRET curto: troque por um valor aleatório de 32 caracteres ou mais.',
  !config.corsOrigins.length && 'CORS_ORIGINS vazio: qualquer site consegue chamar a API. Preencha com a URL do site.',
  config.pharmacyPin && config.pharmacyPin.length < 6 && 'PHARMACY_PIN curto: use 6 caracteres ou mais.',
].filter(Boolean);
avisos.forEach(aviso => console.warn(`[segurança] ${aviso}`));

module.exports = config;
