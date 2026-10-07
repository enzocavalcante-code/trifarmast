require('dotenv').config();

function required(name) {
  const value = process.env[name];
  if (!value) throw new Error(`Variável de ambiente obrigatória ausente: ${name}`);
  return value;
}

module.exports = {
  port: Number(process.env.PORT) || 3000,
  databaseUrl: required('DATABASE_URL'),
  databaseSsl: process.env.DATABASE_SSL !== 'false',
  jwtSecret: required('JWT_SECRET'),
  googleClientId: process.env.GOOGLE_CLIENT_ID || '',
  // Origens autorizadas a chamar a API (URL do Vercel, localhost...), separadas por vírgula.
  corsOrigins: (process.env.CORS_ORIGINS || '').split(',').map(s => s.trim()).filter(Boolean),
  // Permite os botões "Usar conta demo" quando o login do Google não estiver configurado.
  allowDemoGoogle: process.env.ALLOW_DEMO_GOOGLE !== 'false',
};
