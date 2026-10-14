/* =============================================================
   Tela do remédio, histórico de preço, genérico equivalente,
   avisos de queda de preço e central de avisos.
   ============================================================= */

const medScreen = { medId: null, loading: false };
const historyCache = new Map();   // medId -> histórico vindo da API

/* ---------------- avisos de preço ---------------- */

const isWatchingPrice = medId => state.priceAlerts.some(a => a.medicineId === medId);
const alertFor = medId => state.priceAlerts.find(a => a.medicineId === medId) || null;

// Sugestão de preço-alvo: 10% abaixo do menor preço de hoje.
function suggestedTarget(med){
  const lowest = lowestPrice(med);
  if(lowest === null) return '';
  return (Math.floor(lowest * 0.9 * 100) / 100).toFixed(2);
}

async function togglePriceAlert(medId, targetPrice = null){
  const med = medById(medId);
  if(!med) return;
  try{
    if(isWatchingPrice(medId)){
      await api.removePriceAlert(medId);
      state.priceAlerts = state.priceAlerts.filter(a => a.medicineId !== medId);
      showToast(`Você não vai mais receber avisos de ${med.name}.`);
    } else {
      const alert = await api.addPriceAlert(medId, targetPrice);
      state.priceAlerts = [alert, ...state.priceAlerts.filter(a => a.medicineId !== medId)];
      showToast(targetPrice
        ? `Pronto! Avisamos quando ${med.name} ficar abaixo de ${formatBRL(targetPrice)}.`
        : `Pronto! Avisamos quando o preço de ${med.name} baixar.`);
    }
    if(state.activeTab === 'home') renderResults();
    if(medScreen.medId === medId) renderMedicineScreen();
  }catch(e){
    showToast(e.message);
  }
}

// Cria/atualiza o aviso com o preço digitado na tela do remédio.
async function savePriceAlertFromScreen(medId){
  const input = $('alert-target');
  const raw = input ? input.value.replace(',', '.').trim() : '';
  const target = raw === '' ? null : Number(raw);
  if(raw !== '' && (!Number.isFinite(target) || target <= 0)){
    showToast('Digite um preço válido, como 8,90.');
    return;
  }
  if(isWatchingPrice(medId)) await api.removePriceAlert(medId).catch(()=>{});
  state.priceAlerts = state.priceAlerts.filter(a => a.medicineId !== medId);
  await togglePriceAlert(medId, target);
}

/* ---------------- gráfico do histórico ---------------- */

/* Desenho simples em SVG (sem biblioteca): linha do menor preço do dia.
   vector-effect mantém a espessura da linha mesmo com o SVG esticado. */
function priceChartSvg(days){
  const values = days.map(d => d.min);
  const lowest = Math.min(...values);
  const highest = Math.max(...values);
  const span = highest - lowest || 1;
  const width = 300;
  const height = 90;
  const padding = 8;

  const point = (value, index) => {
    const x = days.length === 1 ? width / 2 : (index / (days.length - 1)) * width;
    const y = padding + (1 - (value - lowest) / span) * (height - padding * 2);
    return [x, y];
  };
  const points = values.map(point);
  const line = points.map(([x, y]) => `${x.toFixed(1)},${y.toFixed(1)}`).join(' ');
  const area = `0,${height} ${line} ${width},${height}`;
  const lastIndex = points.length - 1;

  return `<svg class="price-chart" viewBox="0 0 ${width} ${height}" preserveAspectRatio="none" role="img" aria-label="Variação do menor preço por dia">
    <polygon class="price-chart-area" points="${area}"></polygon>
    <polyline class="price-chart-line" points="${line}" vector-effect="non-scaling-stroke"></polyline>
    <circle class="price-chart-dot" cx="${points[lastIndex][0].toFixed(1)}" cy="${points[lastIndex][1].toFixed(1)}" r="3.2" vector-effect="non-scaling-stroke"></circle>
  </svg>`;
}

const shortDate = iso => {
  const [year, month, day] = String(iso).split('-').map(Number);
  return new Date(year, (month || 1) - 1, day || 1).toLocaleDateString('pt-BR', { day: '2-digit', month: 'short' });
};

function historyBlock(history){
  if(!history) return `<div class="co-hint">Carregando histórico… <span class="spinner"></span></div>`;
  const days = history.days || [];
  if(days.length < 2){
    return `<div class="empty-inline">
      O histórico deste remédio começou a ser gravado agora. A partir de amanhã você vê aqui como o preço mudou dia a dia.
    </div>`;
  }
  const first = days[0];
  const last = days[days.length - 1];
  const change = last.min - first.min;
  const percent = first.min ? Math.round(Math.abs(change) / first.min * 100) : 0;
  const trend = percent < 1
    ? `<span class="trend flat">quase sem mudança desde ${shortDate(first.day)}</span>`
    : change < 0
      ? `<span class="trend down">${ICON_TREND_DOWN} baixou ${percent}% desde ${shortDate(first.day)}</span>`
      : `<span class="trend up">subiu ${percent}% desde ${shortDate(first.day)}</span>`;

  return `
    <div class="chart-head">
      <div><b>${formatBRL(last.min)}</b><span>menor preço hoje</span></div>
      ${trend}
    </div>
    <div class="chart-wrap">${priceChartSvg(days)}</div>
    <div class="chart-axis">
      <span>${shortDate(first.day)}</span>
      <span>mínimo ${formatBRL(history.lowest)} · máximo ${formatBRL(history.highest)}</span>
      <span>${shortDate(last.day)}</span>
    </div>`;
}

/* ---------------- tela do remédio ---------------- */

function openMedicine(medId){
  const med = medById(medId);
  if(!med) return;
  medScreen.medId = medId;
  if(!$('med-screen')){
    const screen = document.createElement('div');
    screen.className = 'checkout-screen med-screen';
    screen.id = 'med-screen';
    screen.setAttribute('role', 'dialog');
    screen.setAttribute('aria-modal', 'true');
    document.body.appendChild(screen);
    document.body.classList.add('no-scroll');
    document.addEventListener('keydown', onMedicineKeydown);
  }
  renderMedicineScreen();
  loadHistory(medId);
}

function closeMedicine(){
  const screen = $('med-screen');
  if(screen) screen.remove();
  medScreen.medId = null;
  document.removeEventListener('keydown', onMedicineKeydown);
  if(!checkout.open) document.body.classList.remove('no-scroll');
}

function onMedicineKeydown(e){
  if(e.key === 'Escape' && !document.querySelector('.modal-back')) closeMedicine();
}

async function loadHistory(medId){
  if(historyCache.has(medId)){ renderMedicineScreen(); return; }
  try{
    historyCache.set(medId, await api.priceHistory(medId));
  }catch{
    historyCache.set(medId, { days: [], lowest: null, highest: null });
  }
  if(medScreen.medId === medId) renderMedicineScreen();
}

function renderMedicineScreen(){
  const screen = $('med-screen');
  const med = medById(medScreen.medId);
  if(!screen || !med) return;

  const offers = pharmacyOffers(med);
  const best = offers[0];
  const alert = alertFor(med.id);
  const equivalents = equivalentsOf(med);
  const details = [med.presentation, med.ingredient].filter(Boolean).map(escapeHtml).join(' · ');

  screen.innerHTML = `
    <header class="checkout-topbar">
      <button class="icon-btn" onclick="closeMedicine()" aria-label="Voltar">
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M15 18l-6-6 6-6"/></svg>
      </button>
      <div class="checkout-title"><h3>Detalhes do remédio</h3></div>
      <button class="icon-btn" onclick="closeMedicine()" aria-label="Fechar">
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M18 6L6 18M6 6l12 12"/></svg>
      </button>
    </header>
    <div class="checkout-scroll"><div class="med-layout">
      <div class="checkout-main">
        <section class="co-section">
          <h2 class="med-title">${escapeHtml(med.name)}</h2>
          ${details ? `<p class="med-sub">${details}</p>` : ''}
          <div class="result-tags">
            ${med.rx ? rxBadge() : ''}
            ${med.generic ? '<span class="gen-tag">Genérico</span>' : ''}
            ${med.strength ? `<span class="info-tag">Dosagem ${escapeHtml(med.strength)}</span>` : ''}
          </div>
          <div class="med-price-row">
            <div><span>menor preço hoje</span><b>${formatBRL(best.price)}</b></div>
            ${med.units > 1 ? `<div><span>preço por ${escapeHtml(med.unitLabel)}</span><b>${formatBRL(pricePerUnit(med))}</b></div>` : ''}
            <div><span>na farmácia</span><b class="thin">${escapeHtml(best.name)}</b></div>
          </div>
          <button class="btn btn-primary" onclick="addToCart('${med.id}','${best.id}'); closeMedicine();">
            Adicionar na ${escapeHtml(best.name)} · ${formatBRL(best.price)}
          </button>
        </section>

        <section class="co-section">
          <div class="co-section-head"><h4>Histórico de preço</h4><span class="co-hint">menor preço do dia</span></div>
          ${historyBlock(historyCache.get(med.id))}
          <p class="co-hint block">Os preços deste app são simulados para teste e mudam um pouco a cada dia.</p>
        </section>

        <section class="co-section">
          <div class="co-section-head"><h4>Avise quando baixar</h4></div>
          ${alert ? `
            <div class="alert-active">
              ${ICON_BELL}
              <div>
                <b>Acompanhando este remédio</b>
                <span>${alert.targetPrice
                  ? `Avisamos quando ficar abaixo de ${formatBRL(alert.targetPrice)}.`
                  : `Avisamos quando ficar abaixo de ${formatBRL(alert.referencePrice)} (preço de quando você criou o aviso).`}</span>
              </div>
              <button class="btn-outline-sm" onclick="togglePriceAlert('${med.id}')">Remover</button>
            </div>` : `
            <p class="co-hint block">Escolha um preço e avisamos no app quando alguma farmácia chegar nele.</p>
            <div class="alert-form">
              <label class="alert-field">Me avise abaixo de
                <div class="alert-input"><span>R$</span><input id="alert-target" type="text" inputmode="decimal" value="${suggestedTarget(med)}" placeholder="0,00"></div>
              </label>
              <button class="btn btn-primary" onclick="savePriceAlertFromScreen('${med.id}')">Criar aviso</button>
            </div>`}
        </section>

        ${equivalents.length ? `
        <section class="co-section">
          <div class="co-section-head"><h4>Equivalentes</h4><span class="co-hint">mesmo princípio ativo e dosagem</span></div>
          <div class="equiv-list">
            ${equivalents.map(other => {
              const unit = pricePerUnit(other);
              const mine = pricePerUnit(med);
              const diff = mine ? Math.round((unit - mine) / mine * 100) : 0;
              return `
              <button class="equiv-item" onclick="openMedicine('${other.id}')">
                <div class="equiv-info">
                  <b>${escapeHtml(other.name)} ${other.generic ? '<span class="gen-tag">Genérico</span>' : ''}</b>
                  <span>${escapeHtml(other.presentation)} · ${formatBRL(lowestPrice(other))} a caixa</span>
                </div>
                <div class="equiv-unit">
                  <b>${formatBRL(unit)}</b>
                  <span>por ${escapeHtml(other.unitLabel)}</span>
                  ${diff < 0 ? `<em class="cheap">${Math.abs(diff)}% mais barato</em>` : diff > 0 ? `<em>${diff}% mais caro</em>` : '<em>mesmo preço</em>'}
                </div>
              </button>`;
            }).join('')}
          </div>
          <p class="co-hint block">Mesmo princípio ativo, mesma dosagem e mesma forma. <b>Confirme a troca com o farmacêutico</b> antes de mudar de remédio.</p>
        </section>` : ''}

        <section class="co-section">
          <div class="co-section-head"><h4>Preço em cada farmácia</h4><span class="co-hint">${offers.length} farmácias</span></div>
          <div class="pharm-list">
            ${offers.map(offer => `
              <div class="pharm-row ${offer.id === best.id ? 'top' : ''}">
                ${pharmacyLogoHtml(offer)}
                <div class="pharm-info">
                  <p class="pharm-name">${escapeHtml(offer.name)} ${offer.id === best.id ? '<span class="best-pill">Menor preço</span>' : ''}</p>
                  <p class="pharm-meta">${offer.label}</p>
                </div>
                <div class="price">${formatBRL(offer.price)}</div>
                <button class="pharm-buy-btn" onclick="addToCart('${med.id}','${offer.id}')" aria-label="Adicionar na ${escapeHtml(offer.name)}">
                  ${ICON_CART_PLUS}<span>Adicionar</span>
                </button>
              </div>`).join('')}
          </div>
        </section>
      </div>
    </div></div>`;
}

/* ---------------- central de avisos ---------------- */

function updateNotificationsBadge(){
  const badge = $('notif-count');
  const count = state.notifications.unread || 0;
  badge.textContent = count > 9 ? '9+' : count;
  badge.classList.toggle('hidden', count === 0);
}

async function refreshNotifications(){
  try{
    state.notifications = await api.notifications();
    updateNotificationsBadge();
  }catch{ /* mantém o que já está na tela */ }
}

function openNotifications(){
  const items = state.notifications.items || [];
  const alerts = state.priceAlerts;

  const back = document.createElement('div');
  back.className = 'sheet-back';
  back.innerHTML = `
    <div class="sheet-box" role="dialog" aria-modal="true" aria-label="Avisos">
      <header class="sheet-head">
        <h3>Avisos</h3>
        <button class="icon-btn" onclick="this.closest('.sheet-back').remove()" aria-label="Fechar">
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M18 6L6 18M6 6l12 12"/></svg>
        </button>
      </header>
      <div class="sheet-scroll">
        ${items.length ? `<div class="notif-list">
          ${items.map(item => `
            <div class="notif-item ${item.read ? '' : 'unread'}">
              <div class="notif-icon ${item.kind}">${item.kind === 'price_drop' ? ICON_TREND_DOWN : ICON_CHECK}</div>
              <div class="notif-text">
                <b>${escapeHtml(item.title)}</b>
                <p>${escapeHtml(item.body)}</p>
                <span>${new Date(item.createdAt).toLocaleString('pt-BR', { day:'2-digit', month:'short', hour:'2-digit', minute:'2-digit' })}</span>
              </div>
              ${item.medicineId && medById(item.medicineId)
                ? `<button class="btn-outline-sm" onclick="this.closest('.sheet-back').remove(); openMedicine('${item.medicineId}')">Ver</button>`
                : item.orderId
                  ? `<button class="btn-outline-sm" onclick="this.closest('.sheet-back').remove(); switchTab('orders')">Ver</button>`
                  : ''}
            </div>`).join('')}
        </div>` : `<div class="empty-inline">Nenhum aviso ainda. Quando o preço de um remédio que você acompanha baixar, ou quando a farmácia confirmar uma retirada, o aviso aparece aqui.</div>`}

        <h4 class="sheet-section">Acompanhando preço</h4>
        ${alerts.length ? `<div class="notif-list">
          ${alerts.map(alert => {
            const med = medById(alert.medicineId);
            const current = med ? lowestPrice(med) : alert.currentMin;
            return `
            <div class="notif-item">
              <div class="notif-icon watch">${ICON_BELL}</div>
              <div class="notif-text">
                <b>${escapeHtml(alert.medicineName)}</b>
                <p>Hoje: ${formatBRL(current)} · aviso ${alert.targetPrice ? `abaixo de ${formatBRL(alert.targetPrice)}` : `abaixo de ${formatBRL(alert.referencePrice)}`}</p>
              </div>
              <button class="btn-outline-sm" onclick="togglePriceAlert('${alert.medicineId}'); this.closest('.notif-item').remove();">Remover</button>
            </div>`;
          }).join('')}
        </div>` : `<div class="empty-inline">Você não está acompanhando nenhum preço. Em qualquer remédio, toque em <b>Avise quando baixar</b>.</div>`}
      </div>
    </div>`;
  back.onclick = e => { if(e.target === back) back.remove(); };
  document.body.appendChild(back);

  // Abrir a central marca os avisos como lidos.
  if(state.notifications.unread > 0){
    api.markNotificationsRead().catch(()=>{});
    state.notifications.unread = 0;
    state.notifications.items = items.map(item => ({ ...item, read: true }));
    updateNotificationsBadge();
  }
}
