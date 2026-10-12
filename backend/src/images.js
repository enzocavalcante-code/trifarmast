// Validação de imagens/arquivos enviados como data URL.

const DATA_URL = /^data:([\w.+-]+\/[\w.+-]+);base64,([A-Za-z0-9+/=\s]+)$/;

function parseDataUrl(value) {
  const match = DATA_URL.exec(String(value || ''));
  if (!match) return null;
  const base64 = match[2].replace(/\s/g, '');
  return { mime: match[1].toLowerCase(), bytes: Math.floor(base64.length * 3 / 4) };
}

// Foto de perfil: aceita data URL de imagem (até 2 MB) ou um link https.
function isValidAvatar(value) {
  if (typeof value !== 'string') return false;
  if (/^https:\/\/\S+$/.test(value) && value.length < 2048) return true;
  const parsed = parseDataUrl(value);
  return !!parsed && parsed.mime.startsWith('image/') && parsed.bytes <= 2 * 1024 * 1024;
}

module.exports = { parseDataUrl, isValidAvatar };
