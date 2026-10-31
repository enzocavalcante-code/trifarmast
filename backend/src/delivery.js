// Regras da entrega por motoboy (fonte única para o servidor).
//  - A taxa é calculada aqui, nunca vem do navegador.
//  - A distância é medida entre o endereço informado pela pessoa e a farmácia;
//    sem endereço não existe taxa.
//  - Entregador, placa e tempos são simulados: não há motoboy de verdade.
//
// Preço: o mercado de delivery no Brasil cobra por faixa de distância —
// cerca de R$ 5 até 2 km, R$ 8 de 3 a 5 km e R$ 12 de 6 a 8 km
// (https://saipos.com/sistema/delivery/como-calcular-frete-delivery).
// A conta abaixo reproduz essa tabela: base até 2 km + valor por km rodado.

const MAX_DELIVERY_KM = 15;
const BASE_FEE = 5.00;     // taxa mínima, já cobre os 2 primeiros km
const BASE_KM = 2;
const FEE_PER_KM = 1.50;   // por km iniciado acima dos 2 km

// Tempo prometido: preparo + trajeto (~20 km/h no trânsito urbano).
const PREP_MINUTES = 12;
const MINUTES_PER_KM = 3;
const MIN_MINUTES = 20;
const MAX_MINUTES = 60;

// Simulação acelerada: o trajeto do motoboy dura estes segundos na tela,
// representando os "minutes" prometidos acima.
const PREPARING_MS = 3500;
const DISPATCH_MS = 9000;   // quando o motoboy sai da farmácia
const RIDE_MS = 40000;      // quanto o trajeto leva na simulação

const COURIER_NAMES = [
  'Carlos Eduardo', 'Marcos Vinícius', 'Jonatas Ribeiro', 'Patrícia Nunes',
  'Rafael Albuquerque', 'Diego Martins', 'Aline Souza', 'Wesley Camargo',
  'Fernanda Lopes', 'Gustavo Prado',
];
const COURIER_VEHICLES = [
  'Honda CG 160 vermelha', 'Yamaha Factor 150 preta', 'Honda Biz 125 branca',
  'Honda Pop 110 azul', 'Yamaha Crosser 150 prata', 'Shineray Jet 50 vermelha',
];

const pick = list => list[Math.floor(Math.random() * list.length)];
const letter = () => String.fromCharCode(65 + Math.floor(Math.random() * 26));
const digit = () => Math.floor(Math.random() * 10);

// Placa no padrão Mercosul (ABC1D23).
const randomPlate = () => `${letter()}${letter()}${letter()}${digit()}${letter()}${digit()}${digit()}`;

function randomCourier() {
  return {
    name: pick(COURIER_NAMES),
    vehicle: pick(COURIER_VEHICLES),
    plate: randomPlate(),
    rating: (4.5 + Math.random() * 0.5).toFixed(1), // 4.5 a 5.0
  };
}

// Distância informada pelo app, em km. Entrega só dentro da área atendida.
function parseDistanceKm(value) {
  const km = Number(value);
  if (!Number.isFinite(km) || km < 0) return null;
  return Math.round(km * 100) / 100;
}

// Taxa e prazo da entrega. Lança "fora da área" acima do limite atendido.
function quoteDelivery(rawKm) {
  const km = parseDistanceKm(rawKm);
  if (km === null) return null;
  if (km > MAX_DELIVERY_KM) return { outOfRange: true, km };
  const extraKm = Math.max(0, Math.ceil(km - BASE_KM));   // por km iniciado
  const fee = Math.round((BASE_FEE + extraKm * FEE_PER_KM) * 100) / 100;
  const minutes = Math.min(MAX_MINUTES, Math.max(MIN_MINUTES, Math.round(PREP_MINUTES + km * MINUTES_PER_KM)));
  return { km, fee, minutes, extraKm, baseFee: BASE_FEE, baseKm: BASE_KM, perKm: FEE_PER_KM, outOfRange: false };
}

// Tabela enviada ao app, para ele mostrar a mesma conta do servidor.
const priceTable = () => ({
  maxKm: MAX_DELIVERY_KM, baseFee: BASE_FEE, baseKm: BASE_KM, perKm: FEE_PER_KM,
  prepMinutes: PREP_MINUTES, minutesPerKm: MINUTES_PER_KM, minMinutes: MIN_MINUTES, maxMinutes: MAX_MINUTES,
});

// Horários da simulação, a partir do momento em que o pedido entra em preparação.
function deliverySchedule(baseMs) {
  return {
    preparingAt: baseMs + PREPARING_MS,
    dispatchedAt: baseMs + DISPATCH_MS,
    arrivesAt: baseMs + DISPATCH_MS + RIDE_MS,
  };
}

module.exports = {
  MAX_DELIVERY_KM, PREPARING_MS,
  quoteDelivery, randomCourier, deliverySchedule, priceTable,
};
