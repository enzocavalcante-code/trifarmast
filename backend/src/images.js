// Validação de imagens/arquivos enviados como data URL.

const DATA_URL = /^data:([\w.+-]+\/[\w.+-]+);base64,([A-Za-z0-9+/]+={0,2})$/;

// Os primeiros bytes dizem o tipo real do arquivo, seja qual for o tipo declarado.
const text = (head, from, to) => head.toString('latin1', from, to);
const SIGNATURES = {
  'image/jpeg': head => head[0] === 0xFF && head[1] === 0xD8 && head[2] === 0xFF,
  'image/png': head => text(head, 0, 8) === '\x89PNG\r\n\x1a\n',
  'image/webp': head => text(head, 0, 4) === 'RIFF' && text(head, 8, 12) === 'WEBP',
  'image/heic': head => text(head, 4, 8) === 'ftyp',
  'image/heif': head => text(head, 4, 8) === 'ftyp',
  'application/pdf': head => text(head).includes('%PDF-'),
};

// Devolve o tipo e o tamanho, ou null se não for um arquivo dos tipos aceitos
// (com o conteúdo batendo com o tipo).
function parseDataUrl(value, allowedTypes) {
  const match = DATA_URL.exec(typeof value === 'string' ? value : '');
  if (!match) return null;
  const mime = match[1].toLowerCase();
  const head = Buffer.from(match[2].slice(0, 1368), 'base64');   // ~1 KB do começo do arquivo
  if (!allowedTypes.includes(mime) || !SIGNATURES[mime](head)) return null;
  return { mime, bytes: Math.floor(match[2].length * 3 / 4) };
}

const AVATAR_TYPES = ['image/jpeg', 'image/png', 'image/webp'];
const MAX_AVATAR_BYTES = 512 * 1024;

// Foto de perfil escolhida pela pessoa: só imagem de verdade, enviada pelo app.
// (Links não são aceitos: a foto do Google e a de iniciais são gravadas pelo servidor.)
function isValidAvatar(value) {
  const parsed = parseDataUrl(value, AVATAR_TYPES);
  return !!parsed && parsed.bytes <= MAX_AVATAR_BYTES;
}

module.exports = { parseDataUrl, isValidAvatar };
