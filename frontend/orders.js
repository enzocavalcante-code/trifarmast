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
  DONE: 'Concluído',
};
const STATUS_BADGE_CLASS = {
  [STATUS.RECEIVED]: 'status-received',
  [STATUS.WAITING_RX]: 'status-waiting',
  [STATUS.PREPARING]: 'status-preparing',
  [STATUS.READY]: 'status-ready',
  [STATUS.DONE]: 'status-done',
};
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
  if(!order || order.status === STATUS.DONE || order.status === STATUS.WAITING_RX) return;
  order.status = status;
  if(state.activeTab === 'orders') renderOrders();
  updateOrdersBadge();
  if(status === STATUS.READY) showToast(`Pedido #${order.id} está pronto para retirar na ${order.pharmacyName}!`);
}

// Badge na navegação: pedidos que precisam de uma ação do usuário.
function updateOrdersBadge(){
  const count = state.orders.filter(o => o.status === STATUS.READY || o.status === STATUS.WAITING_RX).length;
  document.querySelectorAll('[data-tab="orders"] .nav-badge, [data-tab="orders"] .bn-dot').forEach(el => el.remove());
  if(count === 0) return;
  const sideBtn = document.querySelector('.nav-item[data-tab="orders"]');
  if(sideBtn) sideBtn.insertAdjacentHTML('beforeend', `<span class="nav-badge">${count}</span>`);
  const bnBtn = document.querySelector('.bn-item[data-tab="orders"]');
  if(bnBtn) bnBtn.insertAdjacentHTML('beforeend', `<span class="bn-dot"></span>`);
}

/* ---------------- tela ---------------- */

function orderSteps(order){
  return order.requiresPrescription
    ? [STATUS.RECEIVED, 'Receita', STATUS.PREPARING, STATUS.READY, STATUS.DONE]
    : [STATUS.RECEIVED, STATUS.PREPARING, STATUS.READY, STATUS.DONE];
}

function renderTracker(order){
  const steps = orderSteps(order);
  const doneIdx = order.status === STATUS.WAITING_RX ? 0 : steps.indexOf(order.status);
  const currentIdx = order.status === STATUS.WAITING_RX ? 1 : -1;
  return `<div class="order-track">
    ${steps.map((s, i) => `
      <div class="otrack-step ${i <= doneIdx ? 'done' : ''} ${i === currentIdx ? 'current' : ''}">
        <div class="otrack-line"></div>
        <div class="otrack-dot"></div>
        <div class="otrack-label">${s}</div>
      </div>`).join('')}
  </div>`;
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
          <span><b>Mostrar na retirada</b><small>Leve a receita original à farmácia</small></span>
        </button>
      </div>
    </div>`;
  }
  if(order.prescriptionChoice === 'upload'){
    return `<div class="rx-box ok">${ICON_CHECK}<span>Receita anexada e aprovada${order.prescriptionFileName ? ` · <button class="link-btn" onclick="viewPrescription(${order.id})">Ver ${escapeHtml(order.prescriptionFileName)}</button>` : ''}</span></div>`;
  }
  return `<div class="rx-box info">${ICON_RX}<span>Leve a <b>receita original</b> de ${rxItems} na retirada.</span></div>`;
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
    return `
    <article class="order-card ${o.status === STATUS.WAITING_RX ? 'needs-action' : ''}">
      <div class="order-top">
        <div>
          <h3>Pedido #${o.id}</h3>
          <div class="sub">${escapeHtml(o.pharmacyName)} · ${dateStr} às ${timeStr}</div>
        </div>
        <span class="status-badge ${STATUS_BADGE_CLASS[o.status] || ''}">${o.status}</span>
      </div>

      ${renderPrescriptionBox(o)}
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
        <div class="order-pay-row"><span>Valor pago</span><b>${formatBRL(o.paidAmount)}</b></div>
        <div class="order-pay-row muted"><span>Pagamento</span><span>${escapeHtml(o.paymentMethod)}</span></div>
      </div>
      <div class="order-code">
        <span>Código de retirada</span>
        <b>${o.code}</b>
      </div>
      ${o.status === STATUS.READY ? `<button class="confirm-pickup-btn" onclick="confirmPickup(${o.id})">Confirmar retirada${o.points > 0 ? ` e receber ${o.points} pts` : ''}</button>` : ''}
      ${o.status === STATUS.DONE && o.points > 0 ? `<div class="order-earned">+${o.points} pontos creditados</div>` : ''}
      ${o.status !== STATUS.DONE && o.status !== STATUS.READY && o.points > 0 ? `<div class="order-pending-points">+${o.points} pts ao retirar</div>` : ''}
    </article>`;
  }).join('');
}

async function confirmPickup(orderId){
  const order = state.orders.find(o => o.id === orderId);
  if(!order || order.status !== STATUS.READY) return;
  try{
    const result = await api.confirmPickup(orderId);
    addOrder(result.order);
    state.points = result.points;
    await refreshPoints();
    showToast(order.points > 0 ? `Pedido concluído! +${order.points} pontos creditados.` : 'Pedido concluído!');
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
