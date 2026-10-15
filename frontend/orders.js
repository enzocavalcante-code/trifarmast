/* =============================================================
   Pedidos e receitas médicas
   - O servidor calcula o status; aqui só agendamos a atualização da tela
     nos horários informados (order.timeline).
   - Pedidos com remédio que exige receita ficam em "Aguardando receita"
     até o usuário anexar o arquivo ou escolher mostrar na retirada.
   ============================================================= */

const STATUS = {
  RECEIVED: 'Pedido recebido',
  WAITING_RX: 'Aguardando receita',
  PREPARING: 'Em preparação',
  READY: 'Pronto para retirar',
  OUT: 'Saiu para entrega',
  ARRIVED: 'Motoboy chegou',
  DONE: 'Concluído',
  DELIVERED: 'Entregue',
};
const STATUS_BADGE_CLASS = {
  [STATUS.RECEIVED]: 'status-received',
  [STATUS.WAITING_RX]: 'status-waiting',
  [STATUS.PREPARING]: 'status-preparing',
  [STATUS.READY]: 'status-ready',
  [STATUS.OUT]: 'status-out',
  [STATUS.ARRIVED]: 'status-ready',
  [STATUS.DONE]: 'status-done',
  [STATUS.DELIVERED]: 'status-done',
};

// Pedido entregue por motoboy (o outro caso é retirada no balcão).
const orderIsDelivery = o => o.fulfillment === 'delivery';
const isFinalStatus = s => s === STATUS.DONE || s === STATUS.DELIVERED;
// Momento em que o usuário confirma: no balcão ou na porta de casa.
const isHandover = o => o.status === (orderIsDelivery(o) ? STATUS.ARRIVED : STATUS.READY);
const RX_MAX_BYTES = 8 * 1024 * 1024;
const RX_ACCEPT = 'application/pdf,image/jpeg,image/png,image/webp,image/heic,image/heif';

let orderTimers = [];
let uploadingOrderId = null;

/* ---------------- estado ---------------- */

const normalizeOrder = o => ({ ...o, createdAt: new Date(o.createdAt) });

function setOrders(list){
  stopOrderTimers();
  state.orders = list.map(normalizeOrder);
  state.orders.forEach(scheduleOrderProgress);
}

// Insere ou substitui um pedido vindo do servidor e reagenda os avanços de status.
function addOrder(order){
  const normalized = normalizeOrder(order);
  const idx = state.orders.findIndex(o => o.id === normalized.id);
  if(idx >= 0) state.orders[idx] = normalized;
  else state.orders.unshift(normalized);
  scheduleOrderProgress(normalized);
  updateOrdersBadge();
  if(state.activeTab === 'orders') renderOrders();
  return normalized;
}

function scheduleOrderProgress(order){
  const now = Date.now();
  (order.timeline || []).forEach(step => {
    const at = new Date(step.at).getTime();
    if(at > now) orderTimers.push(setTimeout(() => advanceOrder(order.id, step.status), at - now));
  });
}

function stopOrderTimers(){
  orderTimers.forEach(clearTimeout);
  orderTimers = [];
}

function advanceOrder(orderId, status){
  const order = state.orders.find(o => o.id === orderId);
  if(!order || isFinalStatus(order.status) || order.status === STATUS.WAITING_RX) return;
  order.status = status;
  if(state.activeTab === 'orders') renderOrders();
  updateOrdersBadge();
  if(status === STATUS.READY) showToast(`Pedido #${order.id} está pronto para retirar na ${order.pharmacyName}!`);
  if(status === STATUS.OUT) showToast(`${order.delivery.courier.name} saiu com seu pedido #${order.id}.`);
  if(status === STATUS.ARRIVED) showToast(`O motoboy chegou com o pedido #${order.id}! Confirme o recebimento.`);
}

// Badge na navegação: pedidos que precisam de uma ação do usuário.
function updateOrdersBadge(){
  const count = state.orders.filter(o => isHandover(o) || o.status === STATUS.WAITING_RX).length;
  document.querySelectorAll('[data-tab="orders"] .nav-badge, [data-tab="orders"] .bn-dot').forEach(el => el.remove());
  if(count === 0) return;
  const sideBtn = document.querySelector('.nav-item[data-tab="orders"]');
  if(sideBtn) sideBtn.insertAdjacentHTML('beforeend', `<span class="nav-badge">${count}</span>`);
  const bnBtn = document.querySelector('.bn-item[data-tab="orders"]');
  if(bnBtn) bnBtn.insertAdjacentHTML('beforeend', `<span class="bn-dot"></span>`);
}

/* ---------------- tela ---------------- */

// Etapas mostradas na linha do tempo (rótulos curtos para caber no celular).
function orderSteps(order){
  const steps = orderIsDelivery(order)
    ? [{ s: STATUS.RECEIVED, label: 'Recebido' }, { s: STATUS.PREPARING, label: 'Em preparação' },
       { s: STATUS.OUT, label: 'A caminho' }, { s: STATUS.DELIVERED, label: 'Entregue' }]
    : [{ s: STATUS.RECEIVED, label: 'Recebido' }, { s: STATUS.PREPARING, label: 'Em preparação' },
       { s: STATUS.READY, label: 'Pronto' }, { s: STATUS.DONE, label: 'Concluído' }];
  if(order.requiresPrescription) steps.splice(1, 0, { s: STATUS.WAITING_RX, label: 'Receita' });
  return steps;
}

function renderTracker(order){
  const steps = orderSteps(order);
  let doneIdx = steps.findIndex(s => s.s === order.status);
  let currentIdx = -1;
  if(order.status === STATUS.WAITING_RX){ doneIdx = 0; currentIdx = 1; }
  // "Motoboy chegou" acende a etapa "A caminho" e deixa "Entregue" piscando.
  if(order.status === STATUS.ARRIVED){
    doneIdx = steps.findIndex(s => s.s === STATUS.OUT);
    currentIdx = doneIdx + 1;
  }
  return `<div class="order-track">
    ${steps.map((s, i) => `
      <div class="otrack-step ${i <= doneIdx ? 'done' : ''} ${i === currentIdx ? 'current' : ''}">
        <div class="otrack-line"></div>
        <div class="otrack-dot"></div>
        <div class="otrack-label">${s.label}</div>
      </div>`).join('')}
  </div>`;
}

/* ---------------- entrega: motoboy a caminho (simulação) ---------------- */

const ICON_MOTO_SMALL = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><circle cx="5" cy="17" r="3"/><circle cx="19" cy="17" r="3"/><path d="M8 17h8l-3.5-6H16l-2-3h-3"/><path d="M5 17l3.5-6H6"/><path d="M14 8h4"/></svg>';
// Trajeto em forma de ruas (esquina a esquina) dentro do quadro de 320x180.
// (começa e termina um pouco antes dos pinos, para o motoboy não cobrir a farmácia nem a casa)
const DELIVERY_ROUTE = 'M 46 148 L 96 148 L 96 96 L 198 96 L 198 44 L 262 44';

let deliveryTicker = null;

// Em que ponto da simulação o pedido está: preparando, a caminho ou chegou.
function deliveryPhase(order){
  const d = order.delivery;
  if(!d || !d.dispatchedAt || !d.arrivesAt) return { phase: 'preparing', t: 0, minutesLeft: d ? d.minutes : 0 };
  const start = new Date(d.dispatchedAt).getTime();
  const end = new Date(d.arrivesAt).getTime();
  const now = Date.now();
  if(now < start) return { phase: 'preparing', t: 0, minutesLeft: d.minutes };
  if(now >= end) return { phase: 'arrived', t: 1, minutesLeft: 0 };
  const t = (now - start) / (end - start);
  return { phase: 'riding', t, minutesLeft: Math.max(1, Math.ceil(d.minutes * (1 - t))) };
}

function courierInitials(name){
  const parts = String(name || '?').trim().split(/\s+/);
  return ((parts[0] || '?')[0] + (parts.length > 1 ? parts[parts.length - 1][0] : '')).toUpperCase();
}

// Painel ao vivo: mapa simplificado, tempo restante e dados do motoboy.
function renderDeliveryTrack(order){
  if(!orderIsDelivery(order) || isFinalStatus(order.status)) return '';
  if(order.status === STATUS.WAITING_RX) return '';
  const d = order.delivery;
  const courier = d.courier || {};
  return `
  <div class="deliv-track" id="deliv-${order.id}">
    <div class="deliv-stage">
      <svg class="deliv-map" viewBox="0 0 320 180" role="img" aria-label="Mapa da entrega: motoboy a caminho do seu endereço">
        <rect class="dm-bg" x="0" y="0" width="320" height="180" rx="14"/>
        <g class="dm-blocks">
          <rect x="18" y="18" width="62" height="46" rx="6"/><rect x="112" y="18" width="70" height="46" rx="6"/>
          <rect x="214" y="62" width="62" height="46" rx="6"/><rect x="18" y="62" width="62" height="46" rx="6"/>
          <rect x="112" y="114" width="70" height="46" rx="6"/><rect x="214" y="114" width="62" height="46" rx="6"/>
        </g>
        <path class="dm-route-bg" d="${DELIVERY_ROUTE}"/>
        <path class="dm-route-done" id="deliv-path-${order.id}" d="${DELIVERY_ROUTE}"/>
        <g class="dm-point dm-store" transform="translate(30 148)">
          <circle r="11"/><path class="dm-point-icon" d="M-5 -2l1.5 -4h7L5 -2M-4 -2h8v5h-8z"/>
        </g>
        <g class="dm-point dm-home" transform="translate(290 44)">
          <circle r="11"/><path class="dm-point-icon" d="M-5 0l5 -4.5L5 0M-3.4 0v4.5h6.8V0"/>
        </g>
        <g id="deliv-rider-${order.id}" class="dm-rider" transform="translate(46 148)">
          <circle class="dm-rider-halo" r="16"/>
          <circle class="dm-rider-dot" r="11"/>
          <g class="dm-rider-icon" transform="translate(-7.2 -7.2) scale(0.6)">
            <circle cx="5" cy="17" r="3"/><circle cx="19" cy="17" r="3"/>
            <path d="M8 17h8l-3.5-6H16l-2-3h-3"/><path d="M5 17l3.5-6H6"/><path d="M14 8h4"/>
          </g>
        </g>
      </svg>
      <span class="deliv-tag">Simulação da entrega</span>
    </div>

    <div class="deliv-info">
      <div class="deliv-eta">
        <b id="deliv-eta-${order.id}">Calculando…</b>
        <span id="deliv-sub-${order.id}">Acompanhe o motoboy até a sua casa</span>
      </div>
      <div class="deliv-bar"><i id="deliv-bar-${order.id}"></i></div>
    </div>

    <div class="deliv-courier">
      <div class="courier-avatar">${escapeHtml(courierInitials(courier.name))}</div>
      <div class="courier-text">
        <b>${escapeHtml(courier.name || 'Entregador')}</b>
        <span>${[courier.vehicle, courier.plate].filter(Boolean).map(escapeHtml).join(' · ')}</span>
      </div>
      ${courier.rating ? `<div class="courier-rating" title="Avaliação do entregador">★ ${Number(courier.rating).toFixed(1).replace('.', ',')}</div>` : ''}
      <div class="courier-actions">
        <button class="icon-btn" title="Ligar para o motoboy" aria-label="Ligar para o motoboy" onclick="contactCourier(${order.id}, 'call')">
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M22 16.9v3a2 2 0 01-2.2 2 19.8 19.8 0 01-8.6-3.1 19.5 19.5 0 01-6-6A19.8 19.8 0 012.1 4.2 2 2 0 014.1 2h3a2 2 0 012 1.7c.1 1 .3 1.9.6 2.8a2 2 0 01-.5 2.1L8.1 9.8a16 16 0 006 6l1.2-1.1a2 2 0 012.1-.5c.9.3 1.8.5 2.8.6a2 2 0 011.8 2z"/></svg>
        </button>
        <button class="icon-btn" title="Mandar mensagem" aria-label="Mandar mensagem para o motoboy" onclick="contactCourier(${order.id}, 'chat')">
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M21 11.5a8.4 8.4 0 01-9 8.4 9 9 0 01-3.8-.8L3 21l1.9-5a8.4 8.4 0 01-.8-3.6 8.4 8.4 0 018.4-8.4h.5a8.4 8.4 0 018 8z"/></svg>
        </button>
      </div>
    </div>

    <div class="deliv-dest">
      <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M12 21s-7-6.2-7-11.5a7 7 0 0114 0C19 14.8 12 21 12 21z"/><circle cx="12" cy="9.5" r="2.5"/></svg>
      <span>${escapeHtml(d.address || 'Seu endereço')}${d.km != null ? ` · ${formatKm(d.km)} da farmácia` : ''}</span>
    </div>
  </div>`;
}

// Move o motoboy e atualiza o tempo restante (roda a cada 0,4 s).
function updateDeliveryView(order){
  const wrap = $(`deliv-${order.id}`);
  if(!wrap) return;
  const { phase, t, minutesLeft } = deliveryPhase(order);
  const path = $(`deliv-path-${order.id}`);
  const rider = $(`deliv-rider-${order.id}`);
  const eta = $(`deliv-eta-${order.id}`);
  const sub = $(`deliv-sub-${order.id}`);
  const bar = $(`deliv-bar-${order.id}`);

  if(path && rider && path.getTotalLength){
    const len = path.getTotalLength();
    const point = path.getPointAtLength(len * t);
    rider.setAttribute('transform', `translate(${point.x} ${point.y})`);
    path.style.strokeDasharray = len;
    path.style.strokeDashoffset = len * (1 - t);
  }
  wrap.dataset.phase = phase;
  if(bar) bar.style.width = `${Math.round((phase === 'preparing' ? 0.06 : t) * 100)}%`;
  if(!eta || !sub) return;
  if(phase === 'preparing'){
    eta.textContent = 'Saindo da farmácia em instantes';
    sub.textContent = `${order.pharmacyName} está separando seus remédios`;
  } else if(phase === 'riding'){
    eta.textContent = `Chega em ~${minutesLeft} min`;
    sub.textContent = `${(order.delivery.courier || {}).name || 'O motoboy'} está a caminho do seu endereço`;
  } else {
    eta.textContent = 'O motoboy chegou!';
    sub.textContent = 'Confirme o recebimento para finalizar o pedido';
  }
}

// Mantém um único cronômetro para todas as entregas em andamento.
function setupDeliveryViews(){
  tickDeliveries();
  if(!deliveryTicker) deliveryTicker = setInterval(tickDeliveries, 400);
}

function tickDeliveries(){
  const active = state.orders.filter(o => orderIsDelivery(o) && !isFinalStatus(o.status) && $(`deliv-${o.id}`));
  if(!active.length){
    clearInterval(deliveryTicker);
    deliveryTicker = null;
    return;
  }
  active.forEach(updateDeliveryView);
}

// Contato com o motoboy: simulado, como o restante da entrega.
function contactCourier(orderId, mode){
  const order = state.orders.find(o => o.id === orderId);
  const name = order && order.delivery && order.delivery.courier ? order.delivery.courier.name : 'o motoboy';
  showToast(mode === 'call'
    ? `Esta é uma simulação: a ligação para ${name} não é feita de verdade.`
    : `Esta é uma simulação: a mensagem para ${name} não é enviada de verdade.`);
}

function renderPrescriptionBox(order){
  if(!order.requiresPrescription) return '';
  const rxItems = order.items.filter(i => i.requiresPrescription).map(i => escapeHtml(i.name)).join(', ');

  if(order.status === STATUS.WAITING_RX){
    const uploading = uploadingOrderId === order.id;
    return `
    <div class="rx-box pending">
      <div class="rx-box-head">${ICON_RX}<b>Receita médica necessária</b></div>
      <p>${rxItems || 'Este pedido'} só pode ser vendido com receita. Escolha uma opção para o pedido seguir:</p>
      <div class="rx-actions">
        <label class="rx-action ${uploading ? 'busy' : ''}">
          <input type="file" accept="${RX_ACCEPT}" class="hidden" ${uploading ? 'disabled' : ''} onchange="uploadPrescription(${order.id}, this)">
          ${uploading
            ? '<span class="spinner"></span><span><b>Enviando receita…</b><small>Aguarde um instante</small></span>'
            : `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M21 15v4a2 2 0 01-2 2H5a2 2 0 01-2-2v-4M17 8l-5-5-5 5M12 3v12"/></svg>
               <span><b>Anexar receita</b><small>PDF ou foto, até 8 MB</small></span>`}
        </label>
        <button class="rx-action" ${uploading ? 'disabled' : ''} onclick="choosePrescriptionInPerson(${order.id})">
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M14 3H7a2 2 0 00-2 2v14a2 2 0 002 2h10a2 2 0 002-2V8z"/><path d="M14 3v5h5"/><circle cx="12" cy="14" r="2.5"/></svg>
          <span>${orderIsDelivery(order)
            ? '<b>Mostrar ao motoboy</b><small>Tenha a receita original em mãos na entrega</small>'
            : '<b>Mostrar na retirada</b><small>Leve a receita original à farmácia</small>'}</span>
        </button>
      </div>
    </div>`;
  }
  if(order.prescriptionChoice === 'upload'){
    return `<div class="rx-box ok">${ICON_CHECK}<span>Receita anexada e aprovada${order.prescriptionFileName ? ` · <button class="link-btn" onclick="viewPrescription(${order.id})">Ver ${escapeHtml(order.prescriptionFileName)}</button>` : ''}</span></div>`;
  }
  return `<div class="rx-box info">${ICON_RX}<span>${orderIsDelivery(order)
    ? `Tenha a <b>receita original</b> de ${rxItems} em mãos para mostrar ao motoboy.`
    : `Leve a <b>receita original</b> de ${rxItems} na retirada.`}</span></div>`;
}

function renderOrders(){
  const wrap = $('orders-list');
  if(state.orders.length === 0){
    wrap.innerHTML = `<div class="empty-state">
      <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.6"><path d="M4 8l8-4 8 4v8l-8 4-8-4V8z"/><path d="M4 8l8 4 8-4M12 12v8"/></svg>
      <p>Você ainda não fez nenhum pedido. Compare preços na aba Buscar e adicione remédios ao carrinho.</p>
    </div>`;
    return;
  }
  wrap.innerHTML = state.orders.map(o => {
    const dateStr = o.createdAt.toLocaleDateString('pt-BR', { day:'2-digit', month:'short', year:'numeric' });
    const timeStr = o.createdAt.toLocaleTimeString('pt-BR', { hour:'2-digit', minute:'2-digit' });
    const itemCount = o.items.reduce((n, i) => n + i.quantity, 0);
    const delivery = orderIsDelivery(o);
    return `
    <article class="order-card ${o.status === STATUS.WAITING_RX ? 'needs-action' : ''} ${o.status === STATUS.ARRIVED ? 'arrived' : ''}">
      <div class="order-top">
        <div>
          <h3>Pedido #${o.id}</h3>
          <div class="sub">${escapeHtml(o.pharmacyName)} · ${dateStr} às ${timeStr}</div>
          <div class="order-way">${delivery
            ? `${ICON_MOTO_SMALL} Entrega por motoboy`
            : '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M3 9l1.5-5h15L21 9M4 9h16v10a1 1 0 01-1 1H5a1 1 0 01-1-1V9z"/><path d="M9 20v-6h6v6"/></svg> Retirada na farmácia'}</div>
        </div>
        <span class="status-badge ${STATUS_BADGE_CLASS[o.status] || ''}">${o.status}</span>
      </div>

      ${renderPrescriptionBox(o)}
      ${renderDeliveryTrack(o)}
      ${renderTracker(o)}

      <ul class="order-items">
        ${o.items.map(i => `
          <li>
            <span class="oi-qty">${i.quantity}×</span>
            <span class="oi-name">${escapeHtml(i.name)}${i.presentation ? `<small>${escapeHtml(i.presentation)}</small>` : ''}</span>
            ${i.requiresPrescription ? `<span class="oi-rx" title="Exige receita">${ICON_RX}</span>` : ''}
            <span class="oi-price">${formatBRL(i.unitPrice * i.quantity)}</span>
          </li>`).join('')}
      </ul>

      <div class="order-payment">
        <div class="order-pay-row muted"><span>Subtotal (${itemCount} ${itemCount === 1 ? 'item' : 'itens'})</span><span>${formatBRL(o.subtotal)}</span></div>
        ${o.discount > 0 ? `<div class="order-pay-row muted"><span>Desconto${o.couponName ? ` (${escapeHtml(o.couponName)})` : ''}</span><span>−${formatBRL(o.discount)}</span></div>` : ''}
        ${delivery && o.delivery.fee > 0 ? `<div class="order-pay-row muted"><span>Entrega por motoboy</span><span>${formatBRL(o.delivery.fee)}</span></div>` : ''}
        <div class="order-pay-row"><span>Valor pago</span><b>${formatBRL(o.paidAmount)}</b></div>
        <div class="order-pay-row muted"><span>Pagamento</span><span>${escapeHtml(o.paymentMethod)}</span></div>
      </div>
      <div class="order-code">
        <span>${delivery ? 'Código de entrega (informe ao motoboy)' : 'Código de retirada'}</span>
        <b>${o.code}</b>
      </div>
      ${isHandover(o) ? `<button class="confirm-pickup-btn" onclick="confirmPickup(${o.id})">Confirmar ${delivery ? 'recebimento' : 'retirada'}${o.points > 0 ? ` e receber ${o.points} pts` : ''}</button>` : ''}
      ${isFinalStatus(o.status) && o.points > 0 ? `<div class="order-earned">+${o.points} pontos creditados</div>` : ''}
      ${!isFinalStatus(o.status) && !isHandover(o) && o.points > 0 ? `<div class="order-pending-points">+${o.points} pts ao ${delivery ? 'receber' : 'retirar'}</div>` : ''}
    </article>`;
  }).join('');

  setupDeliveryViews();
}

async function confirmPickup(orderId){
  const order = state.orders.find(o => o.id === orderId);
  if(!order || !isHandover(order)) return;
  const delivery = orderIsDelivery(order);
  try{
    const result = await api.confirmPickup(orderId);
    addOrder(result.order);
    state.points = result.points;
    await refreshPoints();
    const done = delivery ? 'Pedido recebido!' : 'Pedido concluído!';
    showToast(order.points > 0 ? `${done} +${order.points} pontos creditados.` : done);
  }catch(e){
    showToast(e.message);
  }
}

/* ---------------- receita ---------------- */

async function prescriptionFileToDataUrl(file){
  // Fotos são reduzidas (continuam legíveis) para o envio ser rápido no 4G.
  if(/^image\/(jpeg|png|webp)$/.test(file.type)){
    try{ return await resizeImage(file, 2000, { quality: 0.85 }); }catch{ /* envia o original */ }
  }
  return readFileAsDataURL(file);
}

async function uploadPrescription(orderId, input){
  const file = input.files && input.files[0];
  input.value = '';
  if(!file) return;
  const isAccepted = RX_ACCEPT.split(',').includes(file.type) || /\.(pdf|jpe?g|png|webp|heic|heif)$/i.test(file.name);
  if(!isAccepted){ showToast('Envie a receita em PDF ou imagem (JPG, PNG).'); return; }
  if(file.size > RX_MAX_BYTES){ showToast('Arquivo muito grande. Envie um arquivo de até 8 MB.'); return; }

  uploadingOrderId = orderId;
  renderOrders();
  try{
    const data = await prescriptionFileToDataUrl(file);
    const { order } = await api.sendPrescription(orderId, { choice: 'upload', file: data, fileName: file.name });
    uploadingOrderId = null;
    addOrder(order);
    showPrescriptionApproved();
  }catch(e){
    uploadingOrderId = null;
    renderOrders();
    showToast(e.message);
  }
}

function showPrescriptionApproved(){
  const back = document.createElement('div');
  back.className = 'modal-back';
  back.innerHTML = `
    <div class="modal-box approved" role="alertdialog" aria-modal="true" aria-labelledby="rx-approved-title">
      <div class="approved-check">
        <svg viewBox="0 0 52 52"><circle cx="26" cy="26" r="24"/><path d="M15 27l7 7 15-16"/></svg>
      </div>
      <h3 id="rx-approved-title">Receita aprovada!</h3>
      <p>Recebemos sua receita. Seu pedido seguiu para a preparação.</p>
      <div class="modal-actions"><button class="btn btn-primary">Continuar</button></div>
    </div>`;
  const close = () => back.remove();
  back.querySelector('button').onclick = close;
  back.onclick = e => { if(e.target === back) close(); };
  document.body.appendChild(back);
  back.querySelector('button').focus();
}

async function choosePrescriptionInPerson(orderId){
  try{
    const { order } = await api.sendPrescription(orderId, { choice: 'in_person' });
    addOrder(order);
    showToast('Combinado! Leve a receita original na retirada. Seu pedido seguiu para a preparação.');
  }catch(e){
    showToast(e.message);
  }
}

async function viewPrescription(orderId){
  // Abre a aba antes da requisição para o navegador não bloquear como pop-up.
  const tab = window.open('', '_blank');
  try{
    const file = await api.getPrescription(orderId);
    const blob = await (await fetch(file.data)).blob();
    const url = URL.createObjectURL(blob);
    if(tab) tab.location.href = url;
    else window.location.href = url;
  }catch(e){
    if(tab) tab.close();
    showToast(e.message);
  }
}
