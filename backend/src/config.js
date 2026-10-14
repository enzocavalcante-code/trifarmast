require('dotenv').config();

function required(name) {
  const value = process.env[name];
  if (!value) throw new Error(`Variável de ambiente obrigatória ausente: ${name}`);
  return value;
}

const flag = (name, fallback) => (process.env[name] === undefined ? fallback : process.env[name] !== 'false');

module.exports = {
  port: Number(process.env.PORT) || 3000,
  databaseUrl: required('DATABASE_URL'),
  databaseSsl: process.env.DATABASE_SSL !== 'false',
  jwtSecret: required('JWT_SECRET'),
  googleClientId: process.env.GOOGLE_CLIENT_ID || '',
  // Origens autorizadas a chamar a API (URL do Vercel, localhost...), separadas por vírgula.
  corsOrigins: (process.env.CORS_ORIGINS || '').split(',').map(s => s.trim()).filter(Boolean),
  // Permite os botões "Usar conta demo" quando o login do Google não estiver configurado.
  allowDemoGoogle: flag('ALLOW_DEMO_GOOGLE', true),

  // Senha do painel da farmácia (/farmacia.html), onde o balcão valida o código de retirada.
  pharmacyPin: process.env.PHARMACY_PIN || '',
  // Preço do dia oscila um pouco (preços simulados). false congela o catálogo.
  simulateDailyPrices: flag('SIMULATE_DAILY_PRICES', true),

  // E-mail do código de recuperação de senha. Sem chave, o código vai para os
  // logs do servidor; com PASSWORD_RESET_ECHO=true a API também devolve o código
  // na resposta (use só para testar).
  resendApiKey: process.env.RESEND_API_KEY || '',
  mailFrom: process.env.MAIL_FROM || '',
  passwordResetEcho: process.env.PASSWORD_RESET_ECHO === 'true',
};
