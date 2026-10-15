// Regras da entrega por motoboy (fonte única para o servidor).
//  - A taxa é calculada aqui, nunca vem do navegador.
//  - A distância é a informada pelo app (localização do usuário até a loja);
//    acima do limite o pedido só pode ser retirado na farmácia.
//  - Entregador, placa e tempos são simulados: não há motoboy de verdade.

const MAX_DELIVERY_KM = 15;

// Faixas de distância: até X km, taxa e prazo prometido ao cliente.
const BANDS = [
  { maxKm: 2,              fee: 6.90,  minutes: 25 },
  { maxKm: 5,              fee: 9.90,  minutes: 35 },
  { maxKm: 10,             fee: 12.90, minutes: 45 },
  { maxKm: MAX_DELIVERY_KM, fee: 15.90, minutes: 60 },
];

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

// Taxa e prazo da entrega. Lança erro de distância para fora da área.
function quoteDelivery(rawKm) {
  const km = parseDistanceKm(rawKm);
  if (km === null) return null;
  if (km > MAX_DELIVERY_KM) return { outOfRange: true, km };
  const band = BANDS.find(b => km <= b.maxKm) || BANDS[BANDS.length - 1];
  return { km, fee: band.fee, minutes: band.minutes, outOfRange: false };
}

// Horários da simulação, a partir do momento em que o pedido entra em preparação.
function deliverySchedule(baseMs) {
  return {
    preparingAt: baseMs + PREPARING_MS,
    dispatchedAt: baseMs + DISPATCH_MS,
    arrivesAt: baseMs + DISPATCH_MS + RIDE_MS,
  };
}

module.exports = {
  MAX_DELIVERY_KM, BANDS, PREPARING_MS, DISPATCH_MS, RIDE_MS,
  quoteDelivery, parseDistanceKm, randomCourier, deliverySchedule,
};
