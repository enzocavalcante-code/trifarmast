// Envio de e-mail sem dependências: usa a API HTTP do Resend quando as
// variáveis RESEND_API_KEY e MAIL_FROM estão configuradas no servidor.
// Sem elas, o e-mail não é enviado e o conteúdo aparece nos logs do servidor
// (suficiente para testar; em produção configure o Resend ou outro serviço).

const config = require('./config');

const isConfigured = () => !!(config.resendApiKey && config.mailFrom);

async function sendEmail({ to, subject, text }) {
  if (!isConfigured()) {
    console.log(`[e-mail não configurado] Para: ${to} | ${subject}\n${text}`);
    return { sent: false, reason: 'not_configured' };
  }
  try {
    const res = await fetch('https://api.resend.com/emails', {
      method: 'POST',
      headers: { Authorization: `Bearer ${config.resendApiKey}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({ from: config.mailFrom, to: [to], subject, text }),
      signal: AbortSignal.timeout(10000),
    });
    if (!res.ok) {
      console.error('Falha ao enviar e-mail:', res.status, (await res.text()).slice(0, 300));
      return { sent: false, reason: 'provider_error' };
    }
    return { sent: true };
  } catch (err) {
    console.error('Falha ao enviar e-mail:', err.message);
    return { sent: false, reason: 'network_error' };
  }
}

module.exports = { sendEmail, isConfigured };
