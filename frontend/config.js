// Configuração do front-end (Vercel). Edite apenas este arquivo ao publicar.
window.TRIFARMAS_CONFIG = {
  // URL pública da API no Render (sem barra no final).
  // Em desenvolvimento local, aponta para o backend rodando na sua máquina.
  API_URL: ['localhost', '127.0.0.1'].includes(location.hostname)
    ? 'http://localhost:3000'
    : 'https://trifarmast.onrender.com',

  // Client ID do Google (Google Cloud Console > Credenciais > ID do cliente OAuth 2.0).
  // Precisa ser o mesmo valor da variável GOOGLE_CLIENT_ID no Render.
  GOOGLE_CLIENT_ID: '798411665059-b1fhn4gfljnsi3efm3o9lacudd11a4f2.apps.googleusercontent.com',
};
