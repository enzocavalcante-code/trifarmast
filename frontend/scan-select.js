/* =============================================================
   Seleção dos remédios lidos numa foto (receita ou várias caixas)

   Quando a leitura acha mais de um remédio, o app não escolhe por você:
   abre esta tela com um bloco por remédio. Se a dosagem estava escrita, ela
   já vem marcada; se não estava, as dosagens daquele remédio aparecem lado a
   lado para você escolher.

   Um pedido é sempre de UMA farmácia só. Por isso a tela compara o total da
   receita inteira em cada farmácia e mostra os preços da farmácia escolhida —
   não adianta ver o dipirona mais barato numa loja e a losartana em outra.
   ============================================================= */

const scanSelect = {
  open: false,
  source: 'receita',
  groups: [],        // { key, read, label, options:[med], chosen, doseRead, expanded }
  pharmacyId: null,  // farmácia do pedido (null = a mais barata para a seleção)
  pinned: false,     // a pessoa escolheu a farmácia na mão
};

const SCAN_OPTIONS_MAX = 6;

/* As dosagens que entram na escolha: os remédios cujo nome tem a palavra lida
   ("dipirona" → Dipirona Sódica 500mg, Dipirona 1g, Dipirona Gotas…). Sem
   nenhum pelo nome, usa os do mesmo princípio ativo. */
function scanFamilyOptions(group){
  const withPrice = allMeds().filter(med => pharmacyOffers(med).length);
  const byName = withPrice.filter(med => ocrTokens(med.name).includes(group.read));
  const list = byName.length ? byName : withPrice.filter(med => medicineFamily(med) === group.key);
  // Com a dosagem lida, ela encabeça a lista. Sem dosagem, não há motivo para
  // o app preferir uma: vale a ordem do mais procurado.
  const first = group.doseMatch && group.med ? group.med.id : null;
  return list
    .sort((a, b) => {
      if(a.id === first) return -1;
      if(b.id === first) return 1;
      return (b.popularity || 0) - (a.popularity || 0) || a.name.localeCompare(b.name);
    })
    .slice(0, SCAN_OPTIONS_MAX);
}

// Nome curto do bloco: "Dipirona", "Losartana".
function scanGroupLabel(group){
  const word = group.read || group.key;
  return word.charAt(0).toUpperCase() + word.slice(1);
}

function openScanSelection(groups, source = 'receita'){
  scanSelect.source = source;
  scanSelect.groups = groups.map(group => {
    const options = scanFamilyOptions(group);
    const doseRead = !!group.doseMatch;
    return {
      key: group.key,
      read: group.read || group.key,
      label: scanGroupLabel(group),
      options,
      // Com a dosagem lida, já vem marcada. Sem ela, a escolha é da pessoa.
      chosen: doseRead && options.some(o => o.id === group.med.id) ? group.med.id : null,
      doseRead,
      expanded: !doseRead,
    };
  }).filter(group => group.options.length);

  if(scanSelect.groups.length < 2){
    // Sobrou um só: a folha normal da câmera já resolve.
    const only = scanSelect.groups[0];
    if(only) showScannedMedicine(medById(only.chosen) || only.options[0], source);
    return;
  }

  scanSelect.open = true;
  if(!$('scan-select-screen')){
    const screen = document.createElement('div');
    screen.className = 'checkout-screen scan-select-screen';
    screen.id = 'scan-select-screen';
    screen.setAttribute('role', 'dialog');
    screen.setAttribute('aria-modal', 'true');
    document.body.appendChild(screen);
    document.body.classList.add('no-scroll');
    document.addEventListener('keydown', onScanSelectKeydown);
  }
  renderScanSelection();
}

function closeScanSelection(){
  const screen = $('scan-select-screen');
  if(screen) screen.remove();
  scanSelect.open = false;
  scanSelect.groups = [];
  document.removeEventListener('keydown', onScanSelectKeydown);
  if(!checkout.open) document.body.classList.remove('no-scroll');
}

function onScanSelectKeydown(event){
  if(event.key === 'Escape' && !document.querySelector('.modal-back')) closeScanSelection();
}

/* ---------------- escolhas ---------------- */

function chooseScanOption(key, medId){
  const group = scanSelect.groups.find(g => g.key === key);
  if(!group) return;
  group.chosen = group.chosen === medId ? null : medId;   // tocar de novo desmarca
  renderScanSelection();
}

/* ---------------- a farmácia do pedido ----------------
   Como tudo sai de uma farmácia só, o que vale é o total da receita inteira
   em cada uma — e não o menor preço de cada remédio separado. */
function scanOrderPharmacies(){
  const meds = scanChosenMeds();
  return (state.catalog.pharmacies || []).map(pharm => {
    let total = 0, missing = 0;
    for(const med of meds){
      const price = med.prices[pharm.id];
      if(price == null) missing++;
      else total += price;
    }
    const near = typeof pharmacyDistance === 'function' ? pharmacyDistance(pharm) : null;
    return { pharm, total, missing, km: near && Number.isFinite(near.km) ? near.km : null };
  }).sort((a, b) => a.missing - b.missing || a.total - b.total);
}

// A farmácia em uso: a escolhida na mão ou a mais barata para o que está marcado.
function activeScanPharmacy(){
  const options = scanOrderPharmacies();
  if(scanSelect.pinned && scanSelect.pharmacyId){
    const pinned = options.find(o => o.pharm.id === scanSelect.pharmacyId);
    if(pinned) return pinned;
  }
  return options[0] || null;
}

function chooseScanPharmacy(pharmId){
  scanSelect.pharmacyId = pharmId;
  scanSelect.pinned = true;
  renderScanSelection();
}

function toggleScanGroup(key){
  const group = scanSelect.groups.find(g => g.key === key);
  if(!group) return;
  group.expanded = !group.expanded;
  renderScanSelection();
}

const scanChosenMeds = () => scanSelect.groups
  .map(group => medById(group.chosen))
  .filter(Boolean);

/* ---------------- tela ---------------- */

/* O preço mostrado é o da farmácia do pedido. O menor preço solto, numa loja
   onde o resto da receita não está, não ajuda ninguém. */
function scanOptionRow(group, med, order){
  const picked = group.chosen === med.id;
  const here = order ? med.prices[order.pharm.id] : null;
  const offers = pharmacyOffers(med);
  const cheapest = offers.length ? offers[0] : null;
  const saves = here != null && cheapest && here > cheapest.price + 0.009;
  return `
    <button class="scan-opt ${picked ? 'picked' : ''}" role="radio" aria-checked="${picked}"
            onclick="chooseScanOption('${group.key}','${med.id}')">
      <span class="scan-opt-mark" aria-hidden="true"></span>
      <span class="scan-opt-text">
        <b>${escapeHtml(med.name)}</b>
        <small>${escapeHtml(med.presentation || '')}${med.rx ? ' · exige receita' : ''}</small>
      </span>
      <span class="scan-opt-price">
        ${here != null
          ? `${priceTagOnly(here)}${saves ? `<small>${formatBRL(cheapest.price)} em outra</small>` : ''}`
          : '<b class="thin">não tem aqui</b>'}
      </span>
    </button>`;
}

// Faixa com o total da receita em cada farmácia: é por ela que a pessoa decide.
// Fica sempre na tela (mesmo sem nada marcado) para a lista não pular de lugar.
function scanPharmacyBar(order, hasChosen){
  const options = scanOrderPharmacies();
  if(!options.length) return '';
  const best = options[0];
  return `
    <section class="co-section scan-pharm">
      <div class="scan-group-head">
        <div>
          <h4>Farmácia do pedido</h4>
          <span>${hasChosen
            ? 'Um pedido sai de uma farmácia só — estes são os totais do que você marcou.'
            : 'Um pedido sai de uma farmácia só. Marque os remédios para ver o total de cada uma.'}</span>
        </div>
      </div>
      <div class="scan-pharm-row">
        ${options.map(option => {
          const active = order && option.pharm.id === order.pharm.id;
          const cheapest = option.pharm.id === best.pharm.id && !option.missing;
          return `
            <button class="scan-pharm-chip ${active ? 'active' : ''}" onclick="chooseScanPharmacy('${option.pharm.id}')">
              <b>${escapeHtml(option.pharm.name)}</b>
              <span>${!hasChosen ? '—'
                : option.missing ? `faltam ${option.missing} ${option.missing === 1 ? 'remédio' : 'remédios'}`
                : formatBRL(option.total)}</span>
              ${cheapest && hasChosen ? '<em>menor total</em>' : ''}
              ${option.km != null ? `<small>${formatKm(option.km)}</small>` : ''}
            </button>`;
        }).join('')}
      </div>
    </section>`;
}

function scanGroupBlock(group, order){
  const hidden = Math.max(0, group.options.length - 1);
  const visible = group.expanded ? group.options : group.options.filter(med => med.id === group.chosen);
  const chosenMed = medById(group.chosen);
  return `
    <section class="co-section scan-group ${group.chosen ? 'done' : ''}">
      <div class="scan-group-head">
        <div>
          <h4>${escapeHtml(group.label)}</h4>
          <span>${group.doseRead
            ? 'Dosagem lida na foto'
            : 'A dosagem não apareceu na foto — escolha qual é a sua'}</span>
        </div>
        <span class="scan-group-state">${group.chosen ? 'Selecionado' : 'Escolha um'}</span>
      </div>
      <div class="scan-opts" role="radiogroup" aria-label="${escapeHtml(group.label)}">
        ${visible.map(med => scanOptionRow(group, med, order)).join('')}
      </div>
      ${group.options.length > 1 && chosenMed ? `
        <button class="link-btn scan-more" onclick="toggleScanGroup('${group.key}')">
          ${group.expanded ? 'Mostrar só o escolhido' : (hidden === 1 ? 'Ver a outra dosagem' : `Ver as outras ${hidden} dosagens`)}
        </button>` : ''}
    </section>`;
}

function renderScanSelection(){
  const screen = $('scan-select-screen');
  if(!screen) return;
  // A tela é redesenhada a cada escolha: guarda onde a pessoa estava, senão a
  // lista volta para o começo a cada toque.
  const keepTop = (screen.querySelector('.checkout-scroll') || {}).scrollTop || 0;
  const keepLeft = (screen.querySelector('.scan-pharm-row') || {}).scrollLeft || 0;
  const chosen = scanChosenMeds();
  const order = activeScanPharmacy();
  const where = (SCAN_SOURCES[scanSelect.source] || SCAN_SOURCES.texto).where;
  const canBuy = chosen.length > 0 && order && !order.missing;

  screen.innerHTML = `
    <header class="checkout-topbar">
      <button class="icon-btn" onclick="closeScanSelection()" aria-label="Voltar">
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M15 18l-6-6 6-6"/></svg>
      </button>
      <div class="checkout-title">
        <h3>Remédios ${escapeHtml(where)}</h3>
        <span>${scanSelect.groups.length} remédios · escolha o que comprar</span>
      </div>
      <button class="icon-btn" onclick="closeScanSelection()" aria-label="Fechar">
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M18 6L6 18M6 6l12 12"/></svg>
      </button>
    </header>

    <div class="checkout-scroll">
      <div class="checkout-main">
        ${scanPharmacyBar(order, chosen.length > 0)}
        ${scanSelect.groups.map(group => scanGroupBlock(group, order)).join('')}
        <p class="co-hint block">Marque um de cada remédio. Os preços são os da farmácia escolhida acima, porque o pedido inteiro é retirado (ou entregue) por ela.</p>
      </div>
    </div>

    <footer class="checkout-footer scan-select-footer">
      <div class="scan-footer-sum">
        <b>${chosen.length} de ${scanSelect.groups.length} escolhidos</b>
        <span>${!chosen.length ? 'nada selecionado ainda'
          : order && order.missing ? `A ${escapeHtml(order.pharm.name)} não tem tudo — escolha outra farmácia`
          : `${formatBRL(order.total)} na ${escapeHtml(order.pharm.name)}`}</span>
      </div>
      <button class="btn btn-primary" ${canBuy ? '' : 'disabled'} onclick="confirmScanSelection()">
        ${canBuy && chosen.length > 1 ? 'Comprar os selecionados' : 'Comprar'}
      </button>
    </footer>`;

  const scroll = screen.querySelector('.checkout-scroll');
  if(scroll) scroll.scrollTop = keepTop;
  const row = screen.querySelector('.scan-pharm-row');
  if(row) row.scrollLeft = keepLeft;
}

/* ---------------- levar para o carrinho ---------------- */

function confirmScanSelection(){
  const meds = scanChosenMeds();
  const order = activeScanPharmacy();
  if(!meds.length || !order || order.missing) return;
  let added = 0;
  for(const med of meds){
    if(state.cart.items.find(item => item.medId === med.id)) continue;
    state.cart.items.push({ medId: med.id, qty: 1 });
    added++;
  }
  // O pedido vai para a farmácia escolhida na tela (uma só, como manda o app).
  state.cart.pharmacyId = order.pharm.id;
  saveCart();
  updateCartUI(true);
  closeScanSelection();
  showToast(added
    ? `${added} ${added === 1 ? 'remédio' : 'remédios'} no carrinho.`
    : 'Os remédios já estavam no carrinho.');
  openCart();
}
