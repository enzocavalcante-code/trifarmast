/* =============================================================
   Painel da farmácia (balcão).
   Quem atende digita o código de 6 números do cliente, confere o que entregar
   e confirma a entrega. É essa confirmação que conclui o pedido e credita os
   pontos — o cliente não consegue fazer isso sozinho pelo app.

   A senha do balcão é a variável PHARMACY_PIN no servidor. Ela fica guardada
   só neste aparelho (sessionStorage), até fechar a aba.
   ============================================================= */

const PIN_KEY = 'trifarmas-pharmacy-pin';
let pharmacyPin = '';
let currentOrder = null;

/* ---------------- utilidades ---------------- */

const el = id => document.getElementById(id);
const formatBRL = value => Number(value || 0).toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' });

function escapeHtml(str){
  return String(str ?? '').replace(/[&<>"']/g, c => ({ '&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;' }[c]));
}

let toastTimer = null;
function showToast(message){
  const toast = el('toast');
  toast.textContent = message;
  toast.classList.add('show');
  clearTimeout(toastTimer);
  toastTimer = setTimeout(()=> toast.classList.remove('show'), 3400);
}

function showError(boxId, message){
  const box = el(boxId);
  box.textContent = message;
  box.classList.remove('hidden');
}

const hideError = boxId => el(boxId).classList.add('hidden');

/* ---------------- entrar e sair ---------------- */

function initCounter(){
  // Mesmo tema e tamanho de texto escolhidos no app.
  try{
    const theme = JSON.parse(localStorage.getItem('trifarmas-theme'));
    if(theme === 'dark') document.body.setAttribute('data-theme', 'dark');
    const scale = Number(JSON.parse(localStorage.getItem('trifarmas-font-scale')));
    if(scale) document.documentElement.style.setProperty('--fs', scale);
  }catch{ /* primeira visita */ }

  const saved = sessionStorage.getItem(PIN_KEY);
  if(saved){
    pharmacyPin = saved;
    openCounter();
  } else {
    el('counter-pin').focus();
  }
}

function openCounter(){
  el('counter-login').classList.add('hidden');
  el('counter-main').classList.remove('hidden');
  el('counter-code').focus();
}

// Confere a senha fazendo uma consulta de teste: o servidor responde 401 se
// a senha estiver errada e 404 (código inexistente) se estiver certa.
async function enterCounter(){
  const pin = el('counter-pin').value.trim();
  if(!pin){ showError('counter-error', 'Digite a senha do balcão.'); return; }
  hideError('counter-error');
  try{
    await api.pickupLookup('000000', pin);
    acceptPin(pin);                       // improvável, mas o código existia
  }catch(e){
    // "Código não encontrado" significa que a senha passou.
    if(/não encontrado/i.test(e.message)) acceptPin(pin);
    else showError('counter-error', e.message);
  }
}

function acceptPin(pin){
  pharmacyPin = pin;
  sessionStorage.setItem(PIN_KEY, pin);
  el('counter-pin').value = '';
  openCounter();
}

function leaveCounter(){
  pharmacyPin = '';
  currentOrder = null;
  sessionStorage.removeItem(PIN_KEY);
  el('counter-result').innerHTML = '';
  el('counter-code').value = '';
  el('counter-main').classList.add('hidden');
  el('counter-login').classList.remove('hidden');
  el('counter-pin').focus();
}

/* ---------------- conferir e confirmar ---------------- */

function onCodeInput(input){
  input.value = input.value.replace(/\D/g, '').slice(0, 6);
  if(input.value.length === 6) lookupOrder();
}

async function lookupOrder(){
  const code = el('counter-code').value.replace(/\D/g, '');
  if(code.length !== 6){ showError('counter-lookup-error', 'O código tem 6 números.'); return; }
  hideError('counter-lookup-error');
  const button = el('counter-lookup-btn');
  button.disabled = true;
  button.textContent = 'Procurando…';
  el('counter-result').innerHTML = '';
  try{
    const { order } = await api.pickupLookup(code, pharmacyPin);
    currentOrder = order;
    renderOrder(order);
  }catch(e){
    currentOrder = null;
    showError('counter-lookup-error', e.message);
    if(/senha/i.test(e.message)) leaveCounter();
  }finally{
    button.disabled = false;
    button.textContent = 'Conferir pedido';
  }
}

const READY = 'Pronto para retirar';

function renderOrder(order){
  const itemCount = order.items.reduce((n, i) => n + i.quantity, 0);
  const ready = order.status === READY;

  el('counter-result').innerHTML = `
    <div class="counter-order">
      <div class="counter-order-head">
        <div>
          <h2>Pedido #${order.id}</h2>
          <span>${escapeHtml(order.customerFirstName)} · ${escapeHtml(order.pharmacyName)}</span>
        </div>
        <span class="status-badge ${ready ? 'status-ready' : 'status-preparing'}">${escapeHtml(order.status)}</span>
      </div>

      <ul class="order-items">
        ${order.items.map(item => `
          <li>
            <span class="oi-qty">${item.quantity}×</span>
            <span class="oi-name">${escapeHtml(item.name)}${item.presentation ? `<small>${escapeHtml(item.presentation)}</small>` : ''}</span>
            ${item.requiresPrescription ? '<span class="oi-rx" title="Exige receita">Rx</span>' : ''}
            <span class="oi-price">${formatBRL(item.unitPrice * item.quantity)}</span>
          </li>`).join('')}
      </ul>

      <div class="order-payment">
        <div class="order-pay-row"><span>${itemCount} ${itemCount === 1 ? 'item' : 'itens'}</span><b>${formatBRL(order.paidAmount)}</b></div>
        <div class="order-pay-row muted"><span>Pagamento</span><span>${escapeHtml(order.paymentMethod)}</span></div>
      </div>

      ${order.pendingPayment
        ? `<div class="counter-note warn"><b>Receber no balcão:</b> o cliente escolheu pagar ${formatBRL(order.paidAmount)} em dinheiro na retirada.</div>`
        : `<div class="counter-note ok">Pagamento já feito pelo app (${escapeHtml(order.paymentMethod)}).</div>`}

      ${order.requiresPrescription ? `
        <div class="counter-note ${order.prescriptionChoice === 'upload' ? 'ok' : 'warn'}">
          <b>Receita:</b> ${order.prescriptionChoice === 'upload'
            ? `o cliente anexou no app${order.prescriptionFileName ? ` (${escapeHtml(order.prescriptionFileName)})` : ''}. Confira a receita original quando a lei exigir.`
            : order.prescriptionChoice === 'in_person'
              ? 'o cliente vai apresentar a receita original agora, na retirada.'
              : 'ainda não informada no app — o pedido não pode ser entregue.'}
        </div>` : ''}

      ${ready
        ? `<button class="btn btn-primary" id="counter-confirm-btn" onclick="confirmOrder()">Confirmar entrega${order.points > 0 ? ` e liberar ${order.points} pts` : ''}</button>`
        : `<div class="counter-note warn">Este pedido ainda está em "${escapeHtml(order.status)}". Só é possível confirmar quando estiver <b>${READY}</b>.</div>`}
      <button class="btn btn-ghost" onclick="nextOrder()">Limpar</button>
    </div>`;
}

async function confirmOrder(){
  if(!currentOrder) return;
  const button = el('counter-confirm-btn');
  if(button){ button.disabled = true; button.textContent = 'Confirmando…'; }
  try{
    const { order } = await api.pickupConfirm(currentOrder.code, pharmacyPin);
    el('counter-result').innerHTML = `
      <div class="counter-done">
        <div class="approved-check">
          <svg viewBox="0 0 52 52"><circle cx="26" cy="26" r="24"/><path d="M15 27l7 7 15-16"/></svg>
        </div>
        <h2>Entrega confirmada</h2>
        <p>Pedido <b>#${order.id}</b> de ${escapeHtml(order.customerFirstName)}.
           ${order.points > 0 ? `O cliente recebeu <b>${order.points} pontos</b>.` : ''}</p>
        <button class="btn btn-primary" onclick="nextOrder()">Próximo cliente</button>
      </div>`;
    currentOrder = null;
  }catch(e){
    showError('counter-lookup-error', e.message);
    if(button){ button.disabled = false; button.textContent = 'Confirmar entrega'; }
  }
}

function nextOrder(){
  currentOrder = null;
  el('counter-result').innerHTML = '';
  hideError('counter-lookup-error');
  el('counter-code').value = '';
  el('counter-code').focus();
}
