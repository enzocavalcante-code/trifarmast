/* =============================================================
   Carrinho e pagamento (tela cheia, em 2 etapas)
   - Vários remédios por pedido, retirados na mesma farmácia
   - Compara o total do carrinho em cada farmácia
   - Pagamento com cupom de pontos
   O carrinho fica salvo neste aparelho (por conta) até o pedido ser feito.
   ============================================================= */

const MAX_QTY = 10;
const ICON_PIX = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M12 2l4.5 4.5-4.5 4.5-4.5-4.5zM12 13l4.5 4.5L12 22l-4.5-4.5zM2 12l4.5-4.5L11 12l-4.5 4.5zM13 12l4.5-4.5L22 12l-4.5 4.5z"/></svg>';
const ICON_CARD = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><rect x="2" y="5" width="20" height="14" rx="2"/><path d="M2 10h20M6 15h4"/></svg>';
const ICON_CASH = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><rect x="2" y="6" width="20" height="12" rx="2"/><circle cx="12" cy="12" r="2.5"/><path d="M6 12h.01M18 12h.01"/></svg>';
const ICON_STORE = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M3 9l1.5-5h15L21 9M4 9h16v10a1 1 0 01-1 1H5a1 1 0 01-1-1V9z"/><path d="M9 20v-6h6v6"/></svg>';
const ICON_MOTO = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><circle cx="5" cy="17" r="3"/><circle cx="19" cy="17" r="3"/><path d="M8 17h8l-3.5-6H16l-2-3h-3"/><path d="M5 17l3.5-6H6"/><path d="M14 8h4"/></svg>';

// Formas de pagamento (a opção em dinheiro muda conforme entrega ou retirada).
function paymentOptions(){
  const delivery = checkout.fulfillment === 'delivery';
  return [
    { id: 'Pix', title: 'Pix', desc: 'Aprovação na hora', icon: ICON_PIX },
    { id: 'Cartão de crédito', title: 'Cartão de crédito', desc: 'Visa, Mastercard, Elo', icon: ICON_CARD },
    delivery
      ? { id: 'Dinheiro na entrega', title: 'Dinheiro', desc: 'Pague ao motoboy na porta', icon: ICON_CASH }
      : { id: 'Dinheiro na retirada', title: 'Dinheiro', desc: 'Pague no balcão da farmácia', icon: ICON_CASH },
  ];
}

state.cart = { pharmacyId: null, items: [] };
const checkout = {
  open: false, step: 'cart', paymentMethod: 'Pix', couponId: null, submitting: false,
  fulfillment: 'pickup',   // 'pickup' = retirar na farmácia | 'delivery' = motoboy
  address: '', complement: '',
  addressPoint: null,      // { lat, lng, label, source } do endereço confirmado
  addressStatus: 'idle',   // idle | loading | ok | error
  addressFrom: 'none',     // none | saved | gps | typed — de onde veio o texto do campo
  addressError: '',
};

/* ---------------- entrega por motoboy ----------------
   A taxa só existe depois que a pessoa informa o endereço: é a distância entre
   esse endereço e a farmácia que define o preço (base até 2 km + valor por km),
   a mesma conta que o servidor refaz na hora de criar o pedido. */

// Usada enquanto o catálogo não carregou (o servidor manda a tabela oficial).
const DEFAULT_DELIVERY_RULES = {
  maxKm: 15, baseFee: 5, baseKm: 2, perKm: 1.5,
  prepMinutes: 12, minutesPerKm: 3, minMinutes: 20, maxMinutes: 60,
};
const deliveryRules = () => (state.catalog.delivery && state.catalog.delivery.perKm)
  ? state.catalog.delivery : DEFAULT_DELIVERY_RULES;

// Distância do endereço informado até a loja. Sem endereço confirmado, null.
function deliveryDistanceKm(pharm){
  if(!pharm || !checkout.addressPoint) return null;
  const point = checkout.addressPoint;
  const match = typeof loc !== 'undefined' && loc.chainMatches ? loc.chainMatches[pharm.id] : null;
  // Só mede a distância real quando conhecemos os dois pontos no mapa.
  if(Number.isFinite(point.lat) && match && Number.isFinite(match.lat) && typeof haversineKm === 'function'){
    return Math.round(haversineKm(point, match) * 100) / 100;
  }
  // Sem a loja real no mapa: usa a distância aproximada do catálogo.
  return Number.isFinite(pharm.dist) ? pharm.dist : null;
}

// Taxa e prazo da entrega nesta farmácia (mesma conta do servidor).
function deliveryQuote(pharm){
  const rules = deliveryRules();
  const km = deliveryDistanceKm(pharm);
  if(km == null) return null;                       // ainda sem endereço
  if(km > rules.maxKm) return { km, outOfRange: true, maxKm: rules.maxKm };
  const extraKm = Math.max(0, Math.ceil(km - rules.baseKm));   // por km iniciado
  const fee = Math.round((rules.baseFee + extraKm * rules.perKm) * 100) / 100;
  const minutes = Math.min(rules.maxMinutes,
    Math.max(rules.minMinutes, Math.round(rules.prepMinutes + km * rules.minutesPerKm)));
  return { km, fee, minutes, extraKm, baseFee: rules.baseFee, baseKm: rules.baseKm, perKm: rules.perKm, outOfRange: false };
}

// Explicação da conta, para a taxa não parecer um número tirado do nada.
function deliveryFeeBreakdown(quote){
  if(!quote || quote.outOfRange) return '';
  const rules = deliveryRules();
  const base = `${formatBRL(rules.baseFee)} até ${rules.baseKm} km`;
  return quote.extraKm > 0
    ? `${base} + ${quote.extraKm} km × ${formatBRL(rules.perKm)}`
    : base;
}

const isDelivery = () => checkout.fulfillment === 'delivery';
const deliveryFee = () => {
  if(!isDelivery()) return 0;
  const quote = deliveryQuote(pharmacyById(state.cart.pharmacyId));
  return quote && !quote.outOfRange ? quote.fee : 0;
};

const addressKey = () => `trifarmas-address:${state.user ? state.user.email : ''}`;

// Endereço completo que vai para o pedido (endereço + complemento).
function fullDeliveryAddress(){
  const address = (checkout.address || '').trim();
  const complement = (checkout.complement || '').trim();
  return complement ? `${address} — ${complement}` : address;
}

function setFulfillment(mode){
  if(checkout.fulfillment === mode) return;
  checkout.fulfillment = mode;
  // Endereço de uma compra anterior já pode ser calculado; o que veio do GPS
  // espera a pessoa confirmar.
  if(mode === 'delivery' && !checkout.addressPoint && checkout.addressFrom === 'saved'
     && checkout.address.trim().length >= 8){
    locateDeliveryAddress();
  }
  // A opção "Dinheiro" muda de nome: mantém a escolha válida nos dois casos.
  if(/^Dinheiro/.test(checkout.paymentMethod)){
    checkout.paymentMethod = mode === 'delivery' ? 'Dinheiro na entrega' : 'Dinheiro na retirada';
  }
  renderCheckout();
}

let addressDebounce = null;

function onAddressInput(field, value){
  checkout[field] = value;
  if(field === 'address') checkout.addressFrom = 'typed';
  storage.set(addressKey(), { address: checkout.address, complement: checkout.complement });
  const warn = $('co-address-warn');
  if(warn && fullDeliveryAddress().trim().length >= 8) warn.classList.add('hidden');
  if(field !== 'address') return;

  // Endereço mudou: a taxa antiga não vale mais.
  checkout.addressPoint = null;
  checkout.addressStatus = 'idle';
  checkout.addressError = '';
  renderDeliveryQuoteLine();
  clearTimeout(addressDebounce);
  if(checkout.address.trim().length >= 8){
    addressDebounce = setTimeout(() => locateDeliveryAddress(), 900);
  }
}

// Procura o endereço no mapa para medir a distância até a farmácia.
async function locateDeliveryAddress({ silent = true } = {}){
  const address = checkout.address.trim();
  clearTimeout(addressDebounce);
  if(address.length < 8){
    checkout.addressStatus = 'idle';
    renderDeliveryQuoteLine();
    return null;
  }
  const requested = address;
  checkout.addressStatus = 'loading';
  checkout.addressError = '';
  renderDeliveryQuoteLine();
  try{
    const place = await api.geocode(address);
    if(checkout.address.trim() !== requested) return null;     // já digitou outra coisa
    checkout.addressPoint = { lat: place.lat, lng: place.lng, label: place.label || address, source: 'address' };
    checkout.addressStatus = 'ok';
  }catch(e){
    if(checkout.address.trim() !== requested) return null;
    // Sem achar o endereço no mapa, calcula pela distância aproximada da farmácia
    // (melhor do que travar a compra), avisando que é estimativa.
    checkout.addressPoint = { lat: null, lng: null, label: address, source: 'estimate' };
    checkout.addressStatus = 'error';
    checkout.addressError = e.message;
    if(!silent) showToast(e.message);
  }
  renderCheckout();
  return checkout.addressPoint;
}

// Atualiza só a linha da taxa (não redesenha a tela enquanto a pessoa digita).
function renderDeliveryQuoteLine(){
  const line = $('co-delivery-quote');
  if(!line) return;
  line.outerHTML = deliveryQuoteLineHtml();
}

function deliveryQuoteLineHtml(){
  const pharm = pharmacyById(state.cart.pharmacyId);
  const quote = deliveryQuote(pharm);
  if(checkout.addressStatus === 'loading'){
    return `<div id="co-delivery-quote" class="deliv-quote loading"><span class="spinner"></span> Calculando a taxa de entrega…</div>`;
  }
  if(!quote){
    const typed = checkout.address.trim().length >= 8;
    return `<div id="co-delivery-quote" class="deliv-quote empty">
      <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><circle cx="12" cy="12" r="9"/><path d="M12 8v5M12 16h.01"/></svg>
      <span>${typed
        ? 'Confirme o endereço para calcular o valor da entrega.'
        : 'Escreva o endereço acima para calcular o valor da entrega.'}</span>
      ${typed ? `<button type="button" class="btn-outline-sm" onclick="locateDeliveryAddress({ silent: false })">Calcular entrega</button>` : ''}
    </div>`;
  }
  if(quote.outOfRange){
    return `<div id="co-delivery-quote" class="deliv-quote out">
      Este endereço está a ${formatKm(quote.km)} da ${escapeHtml(pharm.name)} — entregamos em até ${quote.maxKm} km.
      Escolha outra farmácia ou retire no balcão.
    </div>`;
  }
  const estimated = checkout.addressPoint && checkout.addressPoint.source === 'estimate';
  return `<div id="co-delivery-quote" class="deliv-quote ok">
    <div class="dq-top"><b>Entrega: ${formatBRL(quote.fee)}</b><span>${formatKm(quote.km)} · chega em ~${quote.minutes} min</span></div>
    <span class="dq-calc">${deliveryFeeBreakdown(quote)}${estimated ? ' · distância aproximada (não achamos o endereço no mapa)' : ''}</span>
  </div>`;
}

// Preenche o endereço pelo GPS. Se a localização ainda não foi lida, lê na hora.
async function useMyLocationAddress(){
  if(typeof loc === 'undefined') return;
  if(!loc.coords || loc.source === 'ip'){
    showToast('Procurando sua localização… toque em Permitir se o navegador perguntar.');
    if(typeof requestMapLocation === 'function') await requestMapLocation(true);
  }
  if(!loc.coords){
    showToast('Não consegui pegar sua localização. Veja o aviso na aba Farmácias ou digite o endereço aqui.');
    return;
  }
  let address = loc.address;
  if(!address){
    try{ address = (await api.reverseGeocode(loc.coords.lat, loc.coords.lng)).label; }catch{ /* segue sem endereço */ }
  }
  if(!address){
    showToast('Não consegui transformar sua localização em endereço. Digite a rua e o número.');
    return;
  }
  checkout.address = address;
  // A localização já dá o ponto exato: a taxa sai na hora, sem procurar o endereço.
  checkout.addressPoint = { lat: loc.coords.lat, lng: loc.coords.lng, label: address, source: 'gps' };
  checkout.addressStatus = 'ok';
  checkout.addressError = '';
  storage.set(addressKey(), { address: checkout.address, complement: checkout.complement });
  renderCheckout();
  showToast(loc.source === 'gps' && loc.accuracy && loc.accuracy <= 30
    ? 'Endereço preenchido pelo GPS.'
    : 'Endereço preenchido — confira o número da casa.');
}

/* ---------------- dados do carrinho ---------------- */

const cartKey = () => `trifarmas-cart:${state.user ? state.user.email : ''}`;

function loadCart(){
  const saved = storage.get(cartKey());
  state.cart = saved && Array.isArray(saved.items) ? saved : { pharmacyId: null, items: [] };
}
function saveCart(){ storage.set(cartKey(), state.cart); }

// Itens válidos (remédios que ainda existem no catálogo).
function cartLines(){
  return state.cart.items
    .map(i => ({ ...i, med: medById(i.medId) }))
    .filter(i => i.med);
}
const cartQuantity = medId => (state.cart.items.find(i => i.medId === medId) || {}).qty || 0;
const cartCount = () => cartLines().reduce((n, i) => n + i.qty, 0);

// Total do carrinho numa farmácia (null se algum item não tiver preço lá).
function cartTotalAt(pharmId){
  let total = 0;
  for(const line of cartLines()){
    const price = line.med.prices[pharmId];
    if(price == null) return null;
    total += price * line.qty;
  }
  return Math.round(total * 100) / 100;
}

function addToCart(medId, pharmId){
  const cart = state.cart;
  if(cart.items.length && cart.pharmacyId && cart.pharmacyId !== pharmId){
    const current = pharmacyById(cart.pharmacyId);
    const next = pharmacyById(pharmId);
    showModal(ICON_CART_PLUS, 'Seu carrinho está em outra farmácia',
      `Todos os itens de um pedido são retirados na mesma farmácia. Seu carrinho está na <b>${escapeHtml(current.name)}</b>.`,
      [
        { label: `Mover carrinho para ${next.name}`, primary: true, onClick: () => { cart.pharmacyId = pharmId; putInCart(medId); } },
        { label: `Adicionar na ${current.name}`, onClick: () => putInCart(medId) },
      ]);
    return;
  }
  cart.pharmacyId = pharmId;
  putInCart(medId);
}

function putInCart(medId){
  const med = medById(medId);
  const line = state.cart.items.find(i => i.medId === medId);
  if(line){
    if(line.qty >= MAX_QTY){ showToast(`Máximo de ${MAX_QTY} unidades por remédio.`); return; }
    line.qty++;
  } else {
    state.cart.items.push({ medId, qty: 1 });
  }
  saveCart();
  updateCartUI(true);
  if(state.activeTab === 'home') renderResults();
  showToast(`${med.name} adicionado ao carrinho.`);
}

function changeQty(medId, delta){
  const line = state.cart.items.find(i => i.medId === medId);
  if(!line) return;
  line.qty = Math.min(MAX_QTY, line.qty + delta);
  if(line.qty <= 0) state.cart.items = state.cart.items.filter(i => i.medId !== medId);
  if(!state.cart.items.length) state.cart.pharmacyId = null;
  saveCart();
  updateCartUI();
  renderCheckout();
}

function selectCartPharmacy(pharmId){
  state.cart.pharmacyId = pharmId;
  saveCart();
  updateCartUI();
  renderCheckout();
}

function clearCart(){
  state.cart = { pharmacyId: null, items: [] };
  saveCart();
  updateCartUI();
}

function updateCartUI(bump = false){
  if(!state.user) return;
  const count = cartCount();
  const badge = $('cart-count');
  badge.textContent = count;
  badge.classList.toggle('hidden', count === 0);
  if(bump){
    badge.classList.remove('bump');
    void badge.offsetWidth;
    badge.classList.add('bump');
  }
  const total = state.cart.pharmacyId ? cartTotalAt(state.cart.pharmacyId) : null;
  $('cart-bar-count').textContent = count;
  $('cart-bar-total').textContent = total != null ? formatBRL(total) : '';
  $('cart-bar').classList.toggle('hidden', count === 0 || state.activeTab !== 'home' || checkout.open);
}

/* ---------------- tela cheia: carrinho → pagamento ---------------- */

function openCart(){
  if(!state.cart.pharmacyId || cartTotalAt(state.cart.pharmacyId) == null){
    state.cart.pharmacyId = cheapestPharmacyForCart();
  }
  checkout.open = true;
  checkout.step = 'cart';
  checkout.couponId = null;
  checkout.submitting = false;
  // Reaproveita o último endereço usado neste aparelho; senão, o da localização.
  const saved = storage.get(addressKey()) || {};
  if(!checkout.address){
    checkout.address = saved.address || (typeof loc !== 'undefined' && loc.address) || '';
    checkout.addressFrom = saved.address ? 'saved' : (checkout.address ? 'gps' : 'none');
  }
  if(!checkout.complement) checkout.complement = saved.complement || '';
  if(!$('checkout-screen')){
    const screen = document.createElement('div');
    screen.className = 'checkout-screen';
    screen.id = 'checkout-screen';
    screen.setAttribute('role', 'dialog');
    screen.setAttribute('aria-modal', 'true');
    document.body.appendChild(screen);
    document.body.classList.add('no-scroll');
    document.addEventListener('keydown', onCheckoutKeydown);
  }
  renderCheckout();
  updateCartUI();
}

function closeCheckout(){
  const screen = $('checkout-screen');
  if(screen) screen.remove();
  checkout.open = false;
  document.body.classList.remove('no-scroll');
  document.removeEventListener('keydown', onCheckoutKeydown);
  updateCartUI();
  if(state.user && state.activeTab === 'home') renderResults();
}

function onCheckoutKeydown(e){
  if(e.key === 'Escape' && !document.querySelector('.modal-back')) checkoutBack();
}

function checkoutBack(){
  if(checkout.step === 'payment') goToStep('cart');
  else closeCheckout();
}

async function goToStep(step){
  // Sem endereço não dá para seguir: o motoboy precisa saber onde entregar,
  // e é a distância até ele que define o valor da entrega.
  if(step === 'payment' && isDelivery()){
    if(fullDeliveryAddress().trim().length < 8){
      const warn = $('co-address-warn');
      if(warn) warn.classList.remove('hidden');
      const input = $('co-address');
      if(input){ input.focus(); input.scrollIntoView({ behavior: 'smooth', block: 'center' }); }
      showToast('Informe o endereço de entrega.');
      return;
    }
    if(!checkout.addressPoint) await locateDeliveryAddress({ silent: false });
    const quote = deliveryQuote(pharmacyById(state.cart.pharmacyId));
    if(quote && quote.outOfRange){
      showToast(`Esta farmácia entrega em até ${quote.maxKm} km. Escolha outra farmácia ou retire no balcão.`);
      return;
    }
  }
  checkout.step = step;
  renderCheckout();
  const scroller = document.querySelector('.checkout-scroll');
  if(scroller) scroller.scrollTop = 0;
}

function refreshCheckoutIfOpen(){
  if(checkout.open) renderCheckout();
}

function cheapestPharmacyForCart(){
  const options = state.catalog.pharmacies
    .map(p => ({ id: p.id, total: cartTotalAt(p.id) }))
    .filter(o => o.total != null)
    .sort((a, b) => a.total - b.total);
  return options.length ? options[0].id : null;
}

function renderCheckout(){
  const screen = $('checkout-screen');
  if(!screen) return;
  const lines = cartLines();
  const isPayment = checkout.step === 'payment' && lines.length > 0;

  screen.innerHTML = `
    <header class="checkout-topbar">
      <button class="icon-btn" onclick="checkoutBack()" aria-label="Voltar">
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M15 18l-6-6 6-6"/></svg>
      </button>
      <div class="checkout-title">
        <h3>${isPayment ? 'Pagamento' : 'Meu carrinho'}</h3>
        ${lines.length ? `<ol class="stepper">
          <li class="${isPayment ? 'done' : 'active'}"><span>1</span>Carrinho</li>
          <li class="${isPayment ? 'active' : ''}"><span>2</span>Pagamento</li>
        </ol>` : ''}
      </div>
      <button class="icon-btn" onclick="closeCheckout()" aria-label="Fechar">
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M18 6L6 18M6 6l12 12"/></svg>
      </button>
    </header>
    ${lines.length === 0 ? renderEmptyCart() : (isPayment ? renderPaymentStep(lines) : renderCartStep(lines))}`;
}

function renderEmptyCart(){
  return `<div class="checkout-scroll"><div class="cart-empty">
    <div class="icon-circle">${ICON_CART_PLUS}</div>
    <h3>Seu carrinho está vazio</h3>
    <p>Busque um remédio e toque em <b>Adicionar</b> na farmácia que preferir.</p>
    <button class="btn btn-primary" onclick="closeCheckout(); switchTab('home'); setTimeout(()=>$('search-input').focus(), 50);">Buscar remédios</button>
  </div></div>`;
}

function rxNotice(lines){
  const rxNames = lines.filter(l => l.med.rx).map(l => escapeHtml(l.med.name));
  if(!rxNames.length) return '';
  return `<div class="rx-notice">
    <div class="rx-notice-icon">${ICON_RX}</div>
    <div><b>Receita médica necessária</b>
      <p>${rxNames.join(', ')} ${rxNames.length > 1 ? 'exigem' : 'exige'} receita. ${isDelivery()
        ? 'Na entrega, a receita precisa ser <b>anexada no app</b> (PDF ou foto), na aba <b>Pedidos</b>, depois do pagamento — o motoboy não confere receita.'
        : 'Depois do pagamento, na aba <b>Pedidos</b>, você escolhe entre anexar a receita (PDF ou foto) ou mostrá-la na retirada.'}</p>
    </div>
  </div>`;
}

/* Escolha entre retirar na farmácia e receber por motoboy. */
function renderFulfillmentStep(pharm){
  const quote = deliveryQuote(pharm);
  const delivery = isDelivery();
  const unavailable = quote && quote.outOfRange;
  // Sem endereço não há valor: o preço depende da distância até a sua casa.
  const deliveryNote = checkout.addressStatus === 'loading' ? 'Calculando a taxa…'
    : !quote ? 'Informe seu endereço para ver o valor'
    : unavailable ? `Seu endereço fica a ${formatKm(quote.km)} (entregamos em até ${quote.maxKm} km)`
    : `${formatBRL(quote.fee)} · ${formatKm(quote.km)} · chega em ~${quote.minutes} min`;

  return `
  <section class="co-section">
    <div class="co-section-head"><h4>Como você quer receber?</h4></div>
    <div class="ful-options">
      <button type="button" class="ful-option ${delivery ? '' : 'selected'}" onclick="setFulfillment('pickup')" aria-pressed="${!delivery}">
        <span class="ful-icon">${ICON_STORE}</span>
        <span class="ful-text"><b>Retirar na farmácia</b><span>Grátis · fica pronto em alguns minutos</span></span>
        <span class="radio-dot"></span>
      </button>
      <button type="button" class="ful-option ${delivery ? 'selected' : ''} ${unavailable ? 'out' : ''}"
              onclick="setFulfillment('delivery')" aria-pressed="${delivery}">
        <span class="ful-icon">${ICON_MOTO}</span>
        <span class="ful-text"><b>Entrega por motoboy</b><span>${deliveryNote}</span></span>
        <span class="radio-dot"></span>
      </button>
    </div>
    ${delivery ? renderAddressBox() : ''}
  </section>`;
}

// Linha que mostra de onde veio o endereço: GPS exato, GPS fraco ou sem localização.
function addressSourceHint(){
  if(typeof loc === 'undefined' || !loc.coords) return '';
  const pin = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M12 21s-7-6.2-7-11.5a7 7 0 0114 0C19 14.8 12 21 12 21z"/><circle cx="12" cy="9.5" r="2.5"/></svg>';
  if(loc.source !== 'gps'){
    return `<div class="deliv-gps weak">${pin} Localização só aproximada (pela internet) — confira a rua e o número.</div>`;
  }
  const exact = loc.accuracy && loc.accuracy <= 30;
  const precision = loc.accuracy ? formatAccuracy(loc.accuracy) : '?';
  return `<div class="deliv-gps ${exact ? '' : 'weak'}">${pin} ${exact
    ? `Endereço pelo GPS, precisão de ~${precision}`
    : `GPS com precisão de ~${precision} — confira a rua e o número`}</div>`;
}

function renderAddressBox(){
  const locationKnown = typeof loc !== 'undefined' && !!loc.address;
  return `
  <div class="deliv-address">
    <div class="field">
      <label for="co-address">Endereço de entrega</label>
      <input id="co-address" type="text" autocomplete="street-address" placeholder="Rua, número e bairro"
             value="${escapeHtml(checkout.address)}" oninput="onAddressInput('address', this.value)"
             onblur="locateDeliveryAddress()">
    </div>
    <div class="field">
      <label for="co-complement">Complemento e referência <span class="co-optional">(opcional)</span></label>
      <input id="co-complement" type="text" autocomplete="off" placeholder="Apto 42, bloco B, portão azul"
             value="${escapeHtml(checkout.complement)}" oninput="onAddressInput('complement', this.value)">
    </div>
    <div id="co-address-warn" class="deliv-warn hidden">Escreva a rua, o número e o bairro para o motoboy achar sua casa.</div>
    ${deliveryQuoteLineHtml()}
    ${addressSourceHint()}
    <button type="button" class="btn-outline-sm" onclick="useMyLocationAddress()">
      <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" width="16" height="16"><circle cx="12" cy="12" r="3"/><path d="M12 2v3M12 19v3M2 12h3M19 12h3"/><circle cx="12" cy="12" r="7"/></svg>
      ${locationKnown ? 'Usar minha localização' : 'Ativar localização'}
    </button>
  </div>`;
}

function renderCartStep(lines){
  const pharmId = state.cart.pharmacyId;
  const pharm = pharmacyById(pharmId);
  const total = cartTotalAt(pharmId);
  const count = lines.reduce((n, l) => n + l.qty, 0);
  const fee = deliveryFee();
  const delivery = isDelivery();

  const options = state.catalog.pharmacies
    .map(p => ({ ...p, total: cartTotalAt(p.id), quote: deliveryQuote(p), ...pharmacyDistance(p) }))
    .filter(o => o.total != null)
    .sort((a, b) => a.total - b.total || a.km - b.km);
  const cheapest = options.length ? options[0].total : 0;

  return `
  <div class="checkout-scroll"><div class="checkout-layout">
    <div class="checkout-main">
      <section class="co-section">
        <div class="co-section-head"><h4>Itens (${count})</h4><button class="link-btn subtle" onclick="closeCheckout()">+ Adicionar mais</button></div>
        <div class="cart-items">
          ${lines.map(l => {
            const price = l.med.prices[pharmId];
            return `
            <div class="cart-item">
              <div class="cart-item-info">
                <p class="cart-item-name">${escapeHtml(l.med.name)}</p>
                <p class="cart-item-sub">${[l.med.presentation, formatBRL(price) + ' cada'].filter(Boolean).map(escapeHtml).join(' · ')}</p>
                ${l.med.rx ? rxBadge() : ''}
              </div>
              <div class="cart-item-side">
                <b>${formatBRL(price * l.qty)}</b>
                <div class="qty">
                  <button onclick="changeQty('${l.medId}',-1)" aria-label="Diminuir">${l.qty === 1 ? '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M3 6h18M8 6V4h8v2m2 0v14H6V6"/></svg>' : '−'}</button>
                  <span>${l.qty}</span>
                  <button onclick="changeQty('${l.medId}',1)" ${l.qty >= MAX_QTY ? 'disabled' : ''} aria-label="Aumentar">+</button>
                </div>
              </div>
            </div>`;
          }).join('')}
        </div>
      </section>

      ${rxNotice(lines)}

      ${renderFulfillmentStep(pharm)}

      <section class="co-section">
        <div class="co-section-head"><h4>${delivery ? 'Farmácia que vai separar o pedido' : 'Onde retirar'}</h4><span class="co-hint">Total do carrinho em cada farmácia</span></div>
        <div class="pharm-options">
          ${options.map(o => `
            <label class="pharm-option ${o.id === pharmId ? 'selected' : ''}">
              <input type="radio" name="co-pharm" ${o.id === pharmId ? 'checked' : ''} onchange="selectCartPharmacy('${o.id}')">
              ${pharmacyLogoHtml(o)}
              <span class="pharm-option-info">
                <b>${escapeHtml(o.name)}</b>
                <span>${o.label}</span>
                ${delivery ? `<span class="pharm-option-deliv">${!o.quote
                  ? `${ICON_MOTO} entrega calculada pelo endereço`
                  : o.quote.outOfRange
                    ? `${ICON_MOTO} longe demais para entregar (${formatKm(o.quote.km)})`
                    : `${ICON_MOTO} entrega ${formatBRL(o.quote.fee)} · ~${o.quote.minutes} min`}</span>` : ''}
              </span>
              <span class="pharm-option-price">
                <b>${formatBRL(o.total)}</b>
                ${o.total === cheapest ? '<em class="tag-best">Mais barato</em>' : `<em>+${formatBRL(o.total - cheapest)}</em>`}
              </span>
            </label>`).join('')}
        </div>
      </section>
    </div>

    <aside class="checkout-aside">
      <div class="summary-card">
        <h4>Resumo</h4>
        <div class="sum-line"><span>Subtotal (${count} ${count === 1 ? 'item' : 'itens'})</span><b>${formatBRL(total)}</b></div>
        ${delivery
          ? `<div class="sum-line"><span>Entrega por motoboy</span><span>${deliveryQuote(pharm) ? formatBRL(fee) : '<em class="sum-pending">informe o endereço</em>'}</span></div>
             <div class="sum-line muted"><span>Sai de</span><span>${escapeHtml(pharm ? pharm.name : '—')}</span></div>`
          : `<div class="sum-line muted"><span>Retirada</span><span>${escapeHtml(pharm ? pharm.name : '—')}</span></div>`}
        <div class="sum-line total"><span>Total</span><b>${formatBRL(total + fee)}</b></div>
        <button class="btn btn-primary desktop-only" onclick="goToStep('payment')">Continuar para pagamento</button>
      </div>
    </aside>
  </div></div>
  <footer class="checkout-footer">
    <div class="footer-total"><span>Total</span><b>${formatBRL(total + fee)}</b></div>
    <button class="btn btn-primary" onclick="goToStep('payment')">Continuar</button>
  </footer>`;
}

function selectedCoupon(subtotal){
  const coupon = state.pointsInfo.coupons.find(c => c.id === checkout.couponId);
  return coupon && subtotal >= coupon.minOrder ? coupon : null;
}

function renderPaymentStep(lines){
  const pharmId = state.cart.pharmacyId;
  const pharm = pharmacyById(pharmId);
  const distance = pharmacyDistance(pharm);
  const subtotal = cartTotalAt(pharmId);
  const coupon = selectedCoupon(subtotal);
  const discount = coupon ? Math.min(coupon.amount, subtotal) : 0;
  const merchandise = Math.max(0, Math.round((subtotal - discount) * 100) / 100);
  const delivery = isDelivery();
  const quote = delivery ? deliveryQuote(pharm) : null;
  const fee = deliveryFee();
  const total = Math.round((merchandise + fee) * 100) / 100;
  // A taxa de entrega não vira pontos: só o valor dos remédios.
  const earn = Math.floor(merchandise);
  const coupons = state.pointsInfo.coupons;

  return `
  <div class="checkout-scroll"><div class="checkout-layout">
    <div class="checkout-main">
      <section class="co-section">
        <div class="co-section-head"><h4>Forma de pagamento</h4></div>
        <div class="pay-options">
          ${paymentOptions().map(o => `
            <label class="pay-option ${checkout.paymentMethod === o.id ? 'selected' : ''}">
              <input type="radio" name="co-pay" ${checkout.paymentMethod === o.id ? 'checked' : ''} onchange="checkout.paymentMethod='${o.id}'; renderCheckout()">
              <span class="pay-icon">${o.icon}</span>
              <span class="pay-text"><b>${o.title}</b><span>${o.desc}</span></span>
              <span class="radio-dot"></span>
            </label>`).join('')}
        </div>
      </section>

      <section class="co-section">
        <div class="co-section-head"><h4>Cupom de desconto</h4><span class="co-hint">Você tem ${state.points.toLocaleString('pt-BR')} pts</span></div>
        ${coupons.length ? `<div class="coupon-options">
          <label class="coupon-option ${!coupon ? 'selected' : ''}">
            <input type="radio" name="co-coupon" ${!coupon ? 'checked' : ''} onchange="checkout.couponId=null; renderCheckout()">
            <span><b>Sem cupom</b></span>
          </label>
          ${coupons.map(c => {
            const eligible = subtotal >= c.minOrder;
            return `<label class="coupon-option ${coupon && coupon.id === c.id ? 'selected' : ''} ${eligible ? '' : 'disabled'}">
              <input type="radio" name="co-coupon" ${coupon && coupon.id === c.id ? 'checked' : ''} ${eligible ? '' : 'disabled'} onchange="checkout.couponId=${c.id}; renderCheckout()">
              <span><b>${escapeHtml(c.name)}</b><span>${eligible ? (c.minOrder ? `Compras a partir de ${formatBRL(c.minOrder)}` : 'Em qualquer compra') : `Faltam ${formatBRL(c.minOrder - subtotal)} para usar`}</span></span>
            </label>`;
          }).join('')}
        </div>` : `<div class="empty-inline">Você ainda não tem cupons. <button class="link-btn" onclick="closeCheckout(); switchTab('points')">Trocar pontos por cupom</button></div>`}
      </section>

      <section class="co-section">
        <div class="co-section-head">
          <h4>${delivery ? 'Entrega' : 'Retirada'}</h4>
          <button class="link-btn subtle" onclick="goToStep('cart')">${delivery ? 'Trocar endereço' : 'Trocar farmácia'}</button>
        </div>
        ${delivery ? `
          <div class="pickup-card deliv">
            <span class="ful-icon">${ICON_MOTO}</span>
            <div>
              <b>${escapeHtml(fullDeliveryAddress())}</b>
              <span>Chega em ~${quote ? quote.minutes : 40} min · ${formatBRL(fee)} de entrega</span>
            </div>
          </div>
          <div class="pickup-card">
            ${pharmacyLogoHtml(pharm)}
            <div><b>Sai da ${escapeHtml(pharm.name)}</b><span>${distance.label}</span></div>
          </div>
          <p class="co-hint block">Depois do pagamento você acompanha o motoboy no mapa, na aba Pedidos.</p>
        ` : `
          <div class="pickup-card">
            ${pharmacyLogoHtml(pharm)}
            <div><b>${escapeHtml(pharm.name)}</b><span>${distance.label}</span></div>
          </div>
          <p class="co-hint block">Após o pagamento você recebe um código de retirada na aba Pedidos.</p>
        `}
      </section>

      ${rxNotice(lines)}
    </div>

    <aside class="checkout-aside">
      <div class="summary-card">
        <h4>Resumo do pedido</h4>
        <ul class="sum-items">
          ${lines.map(l => `<li><span>${l.qty}× ${escapeHtml(l.med.name)}</span><span>${formatBRL(l.med.prices[pharmId] * l.qty)}</span></li>`).join('')}
        </ul>
        <div class="sum-line"><span>Subtotal</span><span>${formatBRL(subtotal)}</span></div>
        ${coupon ? `<div class="sum-line discount"><span>Cupom ${escapeHtml(coupon.name)}</span><span>−${formatBRL(discount)}</span></div>` : ''}
        ${delivery ? `<div class="sum-line"><span>Entrega${quote ? ` (${formatKm(quote.km)})` : ''}</span><span>${formatBRL(fee)}</span></div>` : ''}
        <div class="sum-line total"><span>Total</span><b>${formatBRL(total)}</b></div>
        <div class="earn-note">${earn > 0 ? `Você ganha <b>+${earn} pts</b> ao ${delivery ? 'receber' : 'retirar'} o pedido` : 'Pedidos pagos 100% com cupom não geram pontos'}</div>
        <button class="btn btn-primary desktop-only" ${checkout.submitting ? 'disabled' : ''} onclick="confirmCheckout()">${checkout.submitting ? 'Processando…' : `Pagar ${formatBRL(total)}`}</button>
        <p class="secure-note"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><rect x="4" y="11" width="16" height="10" rx="2"/><path d="M8 11V7a4 4 0 018 0v4"/></svg> Pagamento simulado para testes</p>
      </div>
    </aside>
  </div></div>
  <footer class="checkout-footer">
    <div class="footer-total"><span>Total</span><b>${formatBRL(total)}</b></div>
    <button class="btn btn-primary" ${checkout.submitting ? 'disabled' : ''} onclick="confirmCheckout()">${checkout.submitting ? 'Processando…' : 'Pagar'}</button>
  </footer>`;
}

async function confirmCheckout(){
  if(checkout.submitting) return;
  const lines = cartLines();
  if(!lines.length) return;
  const subtotal = cartTotalAt(state.cart.pharmacyId);
  const coupon = selectedCoupon(subtotal);

  const delivery = isDelivery();
  checkout.submitting = true;
  renderCheckout();
  try{
    const { order } = await api.createOrder({
      pharmacyId: state.cart.pharmacyId,
      items: lines.map(l => ({ medicineId: l.medId, quantity: l.qty })),
      paymentMethod: checkout.paymentMethod,
      couponId: coupon ? coupon.id : null,
      fulfillment: checkout.fulfillment,
      deliveryAddress: delivery ? fullDeliveryAddress() : null,
      distanceKm: delivery ? deliveryDistanceKm(pharmacyById(state.cart.pharmacyId)) : null,
      // (o servidor refaz a conta da taxa com essa distância)
    });
    clearCart();
    closeCheckout();
    addOrder(order);
    refreshPoints();

    const needsRx = order.requiresPrescription;
    const handover = order.fulfillment === 'delivery' ? 'receber o pedido' : 'confirmar a retirada';
    showModal(ICON_CHECK, 'Pagamento confirmado!',
      `Pedido <b>#${order.id}</b> na ${escapeHtml(order.pharmacyName)}. Você pagou <b>${formatBRL(order.paidAmount)}</b> via ${escapeHtml(order.paymentMethod)}.` +
      (needsRx
        ? `<span class="modal-rx">Este pedido tem remédio que exige receita. ${order.fulfillment === 'delivery'
            ? 'Na aba Pedidos, <b>anexe a receita</b> (PDF ou foto) para o motoboy poder sair com o pedido.'
            : 'Na aba Pedidos, escolha entre <b>anexar a receita</b> ou <b>mostrar na retirada</b> para o pedido seguir.'}</span>`
        : (order.fulfillment === 'delivery'
            ? ` O motoboy <b>${escapeHtml(order.delivery.courier.name)}</b> sai da farmácia em instantes — acompanhe no mapa. Os <b>+${order.points} pts</b> entram no seu saldo quando você ${handover}.`
            : ` Os <b>+${order.points} pts</b> entram no seu saldo quando você ${handover}.`)),
      [{ label: needsRx ? 'Informar receita agora' : (order.fulfillment === 'delivery' ? 'Acompanhar entrega' : 'Acompanhar pedido'), primary: true, onClick: () => switchTab('orders') },
       { label: 'Continuar comprando' }]);
  }catch(e){
    checkout.submitting = false;
    renderCheckout();
    showToast(e.message);
  }
}
