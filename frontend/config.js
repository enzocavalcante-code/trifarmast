// Configuração do front-end (Vercel). Edite apenas este arquivo ao publicar.
window.TRIFARMAS_CONFIG = {
  // URL pública da API no Render (sem barra no final).
  // Em desenvolvimento local, aponta para o backend rodando na sua máquina.
  API_URL: ['localhost', '127.0.0.1'].includes(location.hostname)
    ? 'http://localhost:3000'
    : 'https://trifarmast.onrender.com',

  // Client ID do Google (Google Cloud Console > Credenciais > ID do cliente OAuth 2.0).
  // Lembre de adicionar a URL do Vercel em "Origens JavaScript autorizadas".
  GOOGLE_CLIENT_ID: '926034754304-3445g4kqdp62m6ukdda14t17ebml1v3s.apps.googleusercontent.com',
};
