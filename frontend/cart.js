/* =============================================================
   Carrinho e pagamento (tela cheia, em 2 etapas)
   - Vários remédios por pedido, retirados na mesma farmácia
   - Compara o total do carrinho em cada farmácia
   - Pagamento com cupom de pontos
   O carrinho fica salvo neste aparelho (por conta) até o pedido ser feito.
   ============================================================= */

const MAX_QTY = 10;
const PAYMENT_OPTIONS = [
  { id: 'Pix', title: 'Pix', desc: 'Aprovação na hora', icon: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M12 2l4.5 4.5-4.5 4.5-4.5-4.5zM12 13l4.5 4.5L12 22l-4.5-4.5zM2 12l4.5-4.5L11 12l-4.5 4.5zM13 12l4.5-4.5L22 12l-4.5 4.5z"/></svg>' },
  { id: 'Cartão de crédito', title: 'Cartão de crédito', desc: 'Visa, Mastercard, Elo', icon: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><rect x="2" y="5" width="20" height="14" rx="2"/><path d="M2 10h20M6 15h4"/></svg>' },
  { id: 'Dinheiro na retirada', title: 'Dinheiro', desc: 'Pague no balcão da farmácia', icon: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><rect x="2" y="6" width="20" height="12" rx="2"/><circle cx="12" cy="12" r="2.5"/><path d="M6 12h.01M18 12h.01"/></svg>' },
];

state.cart = { pharmacyId: null, items: [] };
// mode: 'single' = tudo numa farmácia | 'split' = dividido entre farmácias
const checkout = { open: false, step: 'cart', paymentMethod: 'Pix', couponId: null, submitting: false, mode: 'single' };

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
const cartHasRx = () => cartLines().some(i => i.med.rx);

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

function removeFromCart(medId){ changeQty(medId, -MAX_QTY); }

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
  checkout.mode = 'single';
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

function goToStep(step){
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

/* ---------------- dividir o carrinho entre farmácias ----------------
   Cada item vai para a farmácia onde ele está mais barato (em caso de empate,
   a mais perto). Vira um pedido por farmácia, cada um com seu código. */

function splitPlan(){
  const byPharmacy = new Map();
  for(const line of cartLines()){
    let bestId = null;
    let bestPrice = Infinity;
    let bestKm = Infinity;
    for(const [pharmId, price] of Object.entries(line.med.prices)){
      const pharm = pharmacyById(pharmId);
      if(!pharm) continue;
      const km = pharmacyDistance(pharm).km;
      if(price < bestPrice - 0.001 || (Math.abs(price - bestPrice) <= 0.001 && km < bestKm)){
        bestId = pharmId; bestPrice = price; bestKm = km;
      }
    }
    if(!bestId) continue;
    if(!byPharmacy.has(bestId)) byPharmacy.set(bestId, []);
    byPharmacy.get(bestId).push({ ...line, price: bestPrice });
  }

  const groups = [...byPharmacy.entries()]
    .map(([pharmId, lines]) => ({
      pharmacy: pharmacyById(pharmId),
      lines,
      total: Math.round(lines.reduce((sum, l) => sum + l.price * l.qty, 0) * 100) / 100,
    }))
    .sort((a, b) => b.total - a.total);

  return { groups, total: Math.round(groups.reduce((sum, g) => sum + g.total, 0) * 100) / 100 };
}

// Quanto o cliente economiza dividindo, comparado com a melhor farmácia única.
function splitSaving(){
  const singleId = cheapestPharmacyForCart();
  const single = singleId ? cartTotalAt(singleId) : null;
  const plan = splitPlan();
  if(single == null || plan.groups.length < 2) return null;
  const saving = Math.round((single - plan.total) * 100) / 100;
  return saving > 0.01 ? { plan, single, saving } : null;
}

// Total do pedido conforme o modo escolhido.
function checkoutSubtotal(){
  if(checkout.mode === 'split'){
    const option = splitSaving();
    if(option) return option.plan.total;
    checkout.mode = 'single';   // a divisão deixou de valer a pena
  }
  return cartTotalAt(state.cart.pharmacyId);
}

function setCheckoutMode(mode){
  checkout.mode = mode;
  renderCheckout();
}

// Preço de um item do carrinho no modo atual (dividido = onde está mais barato).
function cartItemPrice(line, isSplit, pharmId){
  if(!isSplit) return line.med.prices[pharmId];
  for(const group of splitPlan().groups){
    const found = group.lines.find(l => l.medId === line.medId);
    if(found) return found.price;
  }
  return line.med.prices[pharmId];
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
      <p>${rxNames.join(', ')} ${rxNames.length > 1 ? 'exigem' : 'exige'} receita. Depois do pagamento, na aba <b>Pedidos</b>, você escolhe entre anexar a receita (PDF ou foto) ou mostrá-la na retirada.</p>
    </div>
  </div>`;
}

// Bloco "tudo numa farmácia" x "dividir para economizar".
function splitChoiceHtml(){
  const option = splitSaving();
  if(!option) return '';
  const { plan, single, saving } = option;
  const isSplit = checkout.mode === 'split';
  return `
  <section class="co-section">
    <div class="co-section-head"><h4>Como retirar</h4><span class="co-hint">dividir sai mais barato</span></div>
    <div class="split-options">
      <label class="pharm-option ${isSplit ? '' : 'selected'}">
        <input type="radio" name="co-mode" ${isSplit ? '' : 'checked'} onchange="setCheckoutMode('single')">
        <span class="pharm-option-info">
          <b>Tudo numa farmácia só</b>
          <span>Uma viagem, um código de retirada</span>
        </span>
        <span class="pharm-option-price"><b>${formatBRL(single)}</b></span>
      </label>
      <label class="pharm-option ${isSplit ? 'selected' : ''}">
        <input type="radio" name="co-mode" ${isSplit ? 'checked' : ''} onchange="setCheckoutMode('split')">
        <span class="pharm-option-info">
          <b>Dividir em ${plan.groups.length} farmácias</b>
          <span>Cada remédio onde está mais barato</span>
        </span>
        <span class="pharm-option-price">
          <b>${formatBRL(plan.total)}</b>
          <em class="tag-best">economize ${formatBRL(saving)}</em>
        </span>
      </label>
    </div>
    ${isSplit ? `<div class="split-groups">
      ${plan.groups.map(group => `
        <div class="split-group">
          <div class="split-group-head">
            ${pharmacyLogoHtml(group.pharmacy)}
            <div><b>${escapeHtml(group.pharmacy.name)}</b><span>${pharmacyDistance(group.pharmacy).label}</span></div>
            <b class="split-group-total">${formatBRL(group.total)}</b>
          </div>
          <ul class="split-items">
            ${group.lines.map(l => `<li><span>${l.qty}× ${escapeHtml(l.med.name)}</span><span>${formatBRL(l.price * l.qty)}</span></li>`).join('')}
          </ul>
        </div>`).join('')}
      <p class="co-hint block">Você vai receber <b>${plan.groups.length} códigos de retirada</b>, um para cada farmácia.</p>
    </div>` : ''}
  </section>`;
}

function renderCartStep(lines){
  const isSplit = checkout.mode === 'split' && !!splitSaving();
  const pharmId = state.cart.pharmacyId;
  const pharm = pharmacyById(pharmId);
  const total = checkoutSubtotal();
  const count = lines.reduce((n, l) => n + l.qty, 0);

  const options = state.catalog.pharmacies
    .map(p => ({ ...p, total: cartTotalAt(p.id), ...pharmacyDistance(p) }))
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
            const price = cartItemPrice(l, isSplit, pharmId);
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
      ${splitChoiceHtml()}

      <section class="co-section ${isSplit ? 'hidden' : ''}">
        <div class="co-section-head"><h4>Onde retirar</h4><span class="co-hint">Total do carrinho em cada farmácia</span></div>
        <div class="pharm-options">
          ${options.map(o => `
            <label class="pharm-option ${o.id === pharmId ? 'selected' : ''}">
              <input type="radio" name="co-pharm" ${o.id === pharmId ? 'checked' : ''} onchange="selectCartPharmacy('${o.id}')">
              ${pharmacyLogoHtml(o)}
              <span class="pharm-option-info">
                <b>${escapeHtml(o.name)}</b>
                <span>${o.label}</span>
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
        <div class="sum-line muted"><span>Retirada</span><span>${isSplit ? `${splitPlan().groups.length} farmácias` : escapeHtml(pharm ? pharm.name : '—')}</span></div>
        <div class="sum-line total"><span>Total</span><b>${formatBRL(total)}</b></div>
        <button class="btn btn-primary desktop-only" onclick="goToStep('payment')">Continuar para pagamento</button>
      </div>
    </aside>
  </div></div>
  <footer class="checkout-footer">
    <div class="footer-total"><span>Total</span><b>${formatBRL(total)}</b></div>
    <button class="btn btn-primary" onclick="goToStep('payment')">Continuar</button>
  </footer>`;
}

function selectedCoupon(subtotal){
  const coupon = state.pointsInfo.coupons.find(c => c.id === checkout.couponId);
  return coupon && subtotal >= coupon.minOrder ? coupon : null;
}

// Pontos que o pedido vai render (1 ponto por R$1 pago, arredondado para baixo
// em cada pedido — igual ao cálculo do servidor).
function expectedEarn(isSplit, plan, discount, total){
  if(!isSplit) return Math.floor(total);
  const sorted = [...plan.groups].sort((a, b) => b.total - a.total);
  return sorted.reduce((sum, group, index) =>
    sum + Math.floor(Math.max(0, group.total - (index === 0 ? discount : 0))), 0);
}

function renderPaymentStep(lines){
  const isSplit = checkout.mode === 'split' && !!splitSaving();
  const plan = isSplit ? splitPlan() : null;
  const pharmId = state.cart.pharmacyId;
  const pharm = pharmacyById(pharmId);
  const distance = pharmacyDistance(pharm);
  const subtotal = checkoutSubtotal();
  // Dividido: o cupom entra no pedido mais caro (é assim que o servidor aplica),
  // então a compra mínima do cupom vale sobre esse pedido.
  const couponTarget = isSplit ? plan.groups.reduce((best, g) => (g.total > best.total ? g : best), plan.groups[0]) : null;
  const couponBase = isSplit ? couponTarget.total : subtotal;
  const coupon = selectedCoupon(couponBase);
  const discount = coupon ? Math.min(coupon.amount, couponBase) : 0;
  const total = Math.max(0, Math.round((subtotal - discount) * 100) / 100);
  const earn = expectedEarn(isSplit, plan, discount, total);
  const coupons = state.pointsInfo.coupons;

  return `
  <div class="checkout-scroll"><div class="checkout-layout">
    <div class="checkout-main">
      <section class="co-section">
        <div class="co-section-head"><h4>Forma de pagamento</h4></div>
        <div class="pay-options">
          ${PAYMENT_OPTIONS.map(o => `
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
            const eligible = couponBase >= c.minOrder;
            return `<label class="coupon-option ${coupon && coupon.id === c.id ? 'selected' : ''} ${eligible ? '' : 'disabled'}">
              <input type="radio" name="co-coupon" ${coupon && coupon.id === c.id ? 'checked' : ''} ${eligible ? '' : 'disabled'} onchange="checkout.couponId=${c.id}; renderCheckout()">
              <span><b>${escapeHtml(c.name)}</b><span>${eligible ? (c.minOrder ? `Compras a partir de ${formatBRL(c.minOrder)}` : 'Em qualquer compra') : `Faltam ${formatBRL(c.minOrder - couponBase)} para usar`}</span></span>
            </label>`;
          }).join('')}
        </div>${isSplit ? `<p class="co-hint block">Com o pedido dividido, o cupom entra no pedido da <b>${escapeHtml(couponTarget.pharmacy.name)}</b> (${formatBRL(couponTarget.total)}), que é o mais caro.</p>` : ''}`
        : `<div class="empty-inline">Você ainda não tem cupons. <button class="link-btn" onclick="closeCheckout(); switchTab('points')">Trocar pontos por cupom</button></div>`}
      </section>

      <section class="co-section">
        <div class="co-section-head"><h4>Retirada</h4><button class="link-btn subtle" onclick="goToStep('cart')">${isSplit ? 'Mudar a divisão' : 'Trocar farmácia'}</button></div>
        ${isSplit ? `<div class="split-groups">
          ${plan.groups.map(group => `
            <div class="split-group">
              <div class="split-group-head">
                ${pharmacyLogoHtml(group.pharmacy)}
                <div><b>${escapeHtml(group.pharmacy.name)}</b><span>${group.lines.reduce((n, l) => n + l.qty, 0)} ${group.lines.length === 1 ? 'item' : 'itens'} · ${pharmacyDistance(group.pharmacy).label}</span></div>
                <b class="split-group-total">${formatBRL(group.total)}</b>
              </div>
            </div>`).join('')}
        </div>` : `<div class="pickup-card">
          ${pharmacyLogoHtml(pharm)}
          <div><b>${escapeHtml(pharm.name)}</b><span>${distance.label}</span></div>
        </div>`}
        <p class="co-hint block">Depois do pagamento, ${isSplit ? `cada farmácia tem o seu código de retirada` : 'você recebe um código de retirada'} na aba Pedidos. Mostre o código no balcão: é a farmácia que confirma a entrega e libera seus pontos.</p>
      </section>

      ${rxNotice(lines)}
    </div>

    <aside class="checkout-aside">
      <div class="summary-card">
        <h4>Resumo do pedido</h4>
        <ul class="sum-items">
          ${isSplit
            ? plan.groups.map(group => `
                <li class="sum-group">${escapeHtml(group.pharmacy.name)}</li>
                ${group.lines.map(l => `<li><span>${l.qty}× ${escapeHtml(l.med.name)}</span><span>${formatBRL(l.price * l.qty)}</span></li>`).join('')}`).join('')
            : lines.map(l => `<li><span>${l.qty}× ${escapeHtml(l.med.name)}</span><span>${formatBRL(l.med.prices[pharmId] * l.qty)}</span></li>`).join('')}
        </ul>
        <div class="sum-line"><span>Subtotal</span><span>${formatBRL(subtotal)}</span></div>
        ${coupon ? `<div class="sum-line discount"><span>Cupom ${escapeHtml(coupon.name)}</span><span>−${formatBRL(discount)}</span></div>` : ''}
        <div class="sum-line total"><span>Total</span><b>${formatBRL(total)}</b></div>
        <div class="earn-note">${earn > 0 ? `Você ganha <b>+${earn} pts</b> ao retirar o pedido` : 'Pedidos pagos 100% com cupom não geram pontos'}</div>
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

  const isSplit = checkout.mode === 'split' && !!splitSaving();
  const plan = isSplit ? splitPlan() : null;
  // Mesma base do servidor para o cupom: no pedido dividido, vale o pedido mais caro.
  const couponBase = isSplit
    ? Math.max(...plan.groups.map(g => g.total))
    : cartTotalAt(state.cart.pharmacyId);
  const coupon = selectedCoupon(couponBase);

  checkout.submitting = true;
  renderCheckout();
  try{
    const created = isSplit
      ? (await api.createSplitOrders({
          paymentMethod: checkout.paymentMethod,
          couponId: coupon ? coupon.id : null,
          groups: plan.groups.map(group => ({
            pharmacyId: group.pharmacy.id,
            items: group.lines.map(l => ({ medicineId: l.medId, quantity: l.qty })),
          })),
        })).orders
      : [(await api.createOrder({
          pharmacyId: state.cart.pharmacyId,
          items: lines.map(l => ({ medicineId: l.medId, quantity: l.qty })),
          paymentMethod: checkout.paymentMethod,
          couponId: coupon ? coupon.id : null,
        })).order];

    clearCart();
    closeCheckout();
    created.forEach(addOrder);
    refreshPoints();
    showCheckoutDone(created);
  }catch(e){
    checkout.submitting = false;
    renderCheckout();
    showToast(e.message);
  }
}

// Confirmação do pagamento. Com o pedido dividido, mostra os códigos de cada farmácia.
function showCheckoutDone(orders){
  const needsRx = orders.some(o => o.requiresPrescription);
  const paid = orders.reduce((sum, o) => sum + o.paidAmount, 0);
  const points = orders.reduce((sum, o) => sum + o.points, 0);
  const method = escapeHtml(orders[0].paymentMethod);

  const body = orders.length === 1
    ? `Pedido <b>#${orders[0].id}</b> na ${escapeHtml(orders[0].pharmacyName)}. Você pagou <b>${formatBRL(paid)}</b> via ${method}.
       <span class="modal-code">Código de retirada <b>${orders[0].code}</b></span>`
    : `Criamos <b>${orders.length} pedidos</b>, um por farmácia. Você pagou <b>${formatBRL(paid)}</b> via ${method}.
       ${orders.map(o => `<span class="modal-code"><span>${escapeHtml(o.pharmacyName)} · ${formatBRL(o.paidAmount)}</span><b>${o.code}</b></span>`).join('')}`;

  const tail = needsRx
    ? `<span class="modal-rx">Tem remédio que exige receita. Na aba Pedidos, escolha entre <b>anexar a receita</b> ou <b>mostrar na retirada</b> para o pedido seguir.</span>`
    : `<span class="modal-note">Mostre o código no balcão. A farmácia confirma a entrega e os <b>+${points} pts</b> entram no seu saldo.</span>`;

  showModal(ICON_CHECK, 'Pagamento confirmado!', body + tail,
    [{ label: needsRx ? 'Informar receita agora' : 'Ver meus pedidos', primary: true, onClick: () => switchTab('orders') },
     { label: 'Continuar comprando' }]);
}
