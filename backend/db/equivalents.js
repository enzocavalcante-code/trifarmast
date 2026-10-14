// Equivalência entre genérico e marca.
//
// Dois remédios são tratados como equivalentes quando têm o MESMO princípio
// ativo, a MESMA dosagem e a mesma forma (comprimido, ml, g...). Só nesse caso
// o app compara o preço por unidade e sugere o mais barato — sempre com o aviso
// de confirmar a troca com o farmacêutico, que é quem decide a substituição.

const normalize = text => String(text || '')
  .normalize('NFD').replace(/[̀-ͯ]/g, '')
  .toLowerCase().trim();

// Dosagens escritas no nome: "500mg", "500/30mg", "200mg/ml", "10mg/g", "50mcg", "1g".
const DOSE = /(\d+(?:[.,]\d+)?(?:\/\d+(?:[.,]\d+)?)*)\s?(mcg|mg|g|ml|ui|%)(\s?\/\s?(ml|g|dose))?/gi;

function strengthOf(name) {
  const found = [];
  for (const match of String(name || '').matchAll(DOSE)) {
    const amount = match[1].replace(/,/g, '.');
    const per = match[3] ? `/${match[4].toLowerCase()}` : '';
    found.push(`${amount}${match[2].toLowerCase()}${per}`);
  }
  return found.join('+');
}

// Forma farmacêutica a partir da apresentação ("20 comprimidos", "Frasco 15 ml").
const FORMS = [
  [/comprimido|capsula|cápsula|dragea|drágea|pastilha|envelope|sache|sachê/i, 'solido'],
  [/\bml\b/i, 'ml'],
  [/\bg\b/i, 'g'],
  [/dose/i, 'dose'],
  [/tira/i, 'tira'],
];

function formOf(presentation) {
  const found = FORMS.find(([pattern]) => pattern.test(presentation || ''));
  return found ? found[1] : 'un';
}

// Nome da unidade no singular, para textos como "R$ 1,34 por comprimido".
const UNIT_LABELS = {
  comprimido: /comprimido/i,
  cápsula: /capsula|cápsula/i,
  drágea: /dragea|drágea/i,
  pastilha: /pastilha/i,
  envelope: /envelope|sache|sachê/i,
  dose: /dose/i,
  tira: /tira/i,
  ml: /\bml\b/i,
  g: /\bg\b/i,
};

function unitLabelOf(presentation) {
  const found = Object.entries(UNIT_LABELS).find(([, pattern]) => pattern.test(presentation || ''));
  return found ? found[0] : 'unidade';
}

// Quantidade da caixa: "20 comprimidos" = 20, "Frasco 15 ml" = 15.
function unitCountOf(presentation) {
  const match = /(\d+)/.exec(String(presentation || ''));
  const value = match ? Number(match[1]) : 1;
  return value > 0 && value <= 32000 ? value : 1;
}

// Chave do grupo de equivalentes. Vazia quando o nome não traz dosagem:
// sem dosagem não é possível afirmar equivalência (ex.: Dorflex, Neosaldina).
function equivGroupOf({ name, presentation, ingredient }) {
  const strength = strengthOf(name);
  if (!strength || !normalize(ingredient)) return '';
  return `${normalize(ingredient)}|${strength}|${formOf(presentation)}`;
}

// Genérico = o nome é o próprio princípio ativo (Paracetamol 750mg, Metformina
// 500mg); marca = nome comercial (Tylenol, Glifage). Basta uma palavra do nome
// aparecer no princípio ativo — assim "Metformina" casa com "Cloridrato de
// metformina" e "Tylenol" não casa com "Paracetamol".
function isGenericName({ name, ingredient }) {
  const active = normalize(ingredient);
  if (!active) return false;
  return normalize(name)
    .replace(DOSE, ' ')
    .split(/[^a-z]+/)
    .filter(word => word.length >= 5)
    .some(word => active.includes(word));
}

// Dados calculados de um remédio do catálogo.
function describe({ name, presentation, ingredient }) {
  return {
    strength: strengthOf(name),
    equivGroup: equivGroupOf({ name, presentation, ingredient }),
    unitCount: unitCountOf(presentation),
    unitLabel: unitLabelOf(presentation),
    isGeneric: isGenericName({ name, ingredient }),
  };
}

module.exports = { describe, strengthOf, equivGroupOf, unitCountOf, unitLabelOf, isGenericName, normalize };
