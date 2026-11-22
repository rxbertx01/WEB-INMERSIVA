import { BASE, SIZES } from './config.js';
import { S } from './state.js';
import { $, money, esc } from './utils.js';
import { svg } from './svg.js';
import { openPanel, closePanel } from './ui.js';
import { focus, slotOf } from './scene3d.js';
import { mount360 } from './viewer360.js';
import { createOrder } from './orders.js';
import { settings } from './settings.js';
import { KEYS, read, write } from './services/storage.js';
import { categoryOf as categoriaDe } from './services/categorias.service.js';
import { esGestor } from './services/permisos.js';
import * as variantes from './services/variantes.service.js';
import { on, emit } from './bus.js';

const CATEGORY_LABEL = { bomber: 'OUTERWEAR', coat: 'OUTERWEAR', hoodie: 'ESSENTIALS', cargo: 'ESSENTIALS' };
let activeFilter = 'all';

export function categoryOf(g) {
  return categoriaDe(g);
}

function stockDe(g, z) {
  if (!g || ['AGOTADO', 'INACTIVO'].includes(g.estado)) return 0;
  return variantes.disponible(g.id, z, g.colour || g.colorNombre);
}

function collectionLabel(g) {
  if (g.collection) return g.collection;
  const category = /cuero/i.test(g.fabric || '') ? 'LEATHER' : (CATEGORY_LABEL[g.type] || 'ESSENTIALS');
  const index = BASE.findIndex(b => b.id === g.id);
  return `COLLECTION ${String(index >= 0 ? index + 1 : 1).padStart(2, '0')} / ${category}`;
}

function description(g) {
  if (g.desc) return g.desc;
  const names = { hoodie: 'hoodie', bomber: 'bomber', cargo: 'cargo', coat: 'coat' };
  return `A ${String(g.cut || 'regular fit').toLowerCase()} ${names[g.type] || 'piece'} in ${g.fabric || 'selected fabric'}, weighing ${g.gsm || 400} g/m².`;
}

function rackItems(side) {
  const fromSlots = S.slots.filter(slot => slot.side === side && slot.item).map(slot => slot.item);
  if (fromSlots.length) return fromSlots;
  // Sin WebGL (móvil o fallback) navegamos por la misma categoría del perchero.
  return [...S.garments, ...S.customs]
    .filter(g => categoryOf(g) === (side === 'left' ? 'outer' : 'essential'));
}

function stepProduct(delta) {
  const side = slotOf(S.current)?.side
    || (categoryOf(S.current) === 'outer' ? 'left' : 'right');
  const items = rackItems(side);
  const index = items.indexOf(S.current);
  if (index < 0 || items.length < 2) return;
  inspect(items[(index + delta + items.length) % items.length]);
}

export function filterCards(filter) {
  activeFilter = filter;
  let visibles = 0;
  document.querySelectorAll('.card').forEach(card => {
    const g = S.garments.find(item => item.id === card.dataset.id)
      || S.customs.find(item => item.id === card.dataset.id);
    const mostrar = filter === 'all' || (g && categoryOf(g) === filter);
    card.style.display = mostrar ? '' : 'none';
    if (mostrar) visibles++;
  });

  const empty = $('#carEmpty');
  if (empty) {
    empty.hidden = visibles > 0 || filter === 'all';
    const categoria = filter === 'all' ? '' : filter.toUpperCase();
    empty.textContent = `NO HAY PIEZAS EN ${categoria || 'ESTA CATEGORÍA'}.`;
  }
}

function saveBag() {
  write(KEYS.bag, S.bag);
}

function restoreBag() {
  const items = read(KEYS.bag, null);
  if (Array.isArray(items)) {
    S.bag = items
      .filter(x => x && x.g?.id && SIZES.includes(x.z) && x.q > 0)
      .map(x => ({ ...x, q: Math.min(x.q, Math.max(1, stockDe(x.g, x.z))) }))
      .filter(x => x.q > 0);
  }
}

export function addBag(g, z, qty = 1) {
  const found = S.bag.find(b => b.g.id === g.id && b.z === z);
  const enBag = found?.q || 0;
  const libre = Math.max(0, stockDe(g, z) - enBag);
  if (libre <= 0) return false;
  const q = Math.min(Math.max(1, Number(qty) || 1), libre);
  if (found) found.q += q;
  else S.bag.push({ g, z, q });
  renderBag();
  closePanel('insp');
  openPanel('bag');
  saveBag();
  return true;
}

export function renderBag() {
  const count = S.bag.reduce((a, b) => a + b.q, 0);
  $('#cnt').textContent = count;
  $('#pdBagCount').textContent = count;
  $('#sub').textContent = money(S.bag.reduce((a, b) => a + b.q * b.g.price, 0));
  $('#bagBody').innerHTML = S.bag.length
    ? S.bag.map((b, i) => `
      <div class="msg" style="cursor:default;display:flex;gap:10px;align-items:center">
        <div style="width:48px">${svg(b.g)}</div>
        <div style="flex:1">
          <b>${esc(b.g.name)}</b>
          <div class="mono" style="color:var(--mut)">Talla ${esc(b.z)} · ${b.q}× · ${esc(money(b.g.price))}</div>
          <div class="mono live">${stockDe(b.g, b.z) ? 'En stock' : 'Sin stock'} · Collection 01</div>
        </div>
        <button type="button" data-i="${i}">✕</button>
      </div>`).join('')
    : '<div class="mono" style="color:var(--mut)">Tu bag está vacía.</div>';

  $('#bagBody').querySelectorAll('[data-i]').forEach(btn => {
    btn.addEventListener('click', () => {
      S.bag.splice(Number(btn.dataset.i), 1);
      renderBag();
      saveBag();
    });
  });
}

export function inspect(g) {
  const sizes = Array.isArray(g.sizes) && g.sizes.length ? g.sizes : SIZES;
  const conStock = sizes.filter(z => stockDe(g, z) > 0);
  const defaultSize = conStock.includes('M') ? 'M' : (conStock[0] || (sizes.includes('M') ? 'M' : sizes[0]));
  S.current = g;
  S.size = defaultSize;
  S.qty = 1;
  focus(g);
  document.body.classList.add('inspecting');
  // El admin puede fijar una etiqueta global; si no, se usa la de la prenda.
  $('#pdKicker').textContent = settings.kicker && settings.kicker !== 'COLLECTION 00 / ATELIER'
    ? settings.kicker
    : collectionLabel(g);

  const side = slotOf(g)?.side
    || (categoryOf(g) === 'outer' ? 'left' : 'right');
  const rack = rackItems(side);
  const rackIndex = Math.max(0, rack.indexOf(g));
  const number = g.custom ? 'CU' : String(BASE.findIndex(b => b.id === g.id) + 1).padStart(2, '0');
  const price = money(g.price);
  const colour = g.colour || 'ATELIER';

  $('#iBody').innerHTML = `
    <div class="pd-index mono">${number} / ATELIER VX</div>
    <h2 class="pd-name" id="iName">${esc(g.name)}</h2>
    <div class="pd-price mono">${esc(price)}</div>
    <p class="pd-desc">${esc(description(g))}</p>

    <div class="pd-viewer" id="pdViewer"></div>

    <div class="pd-group">
      <div class="pd-colour mono">
        <span class="swatch" style="background:${esc(g.color || '#888888')}"></span>
        <span>COLOUR — ${esc(colour)}</span>
      </div>
    </div>

    <div class="pd-group">
      <div class="pd-label mono">SELECT SIZE</div>
      <div class="pd-sizes mono" id="pdSizes">
        ${sizes.map(z => {
          const stock = stockDe(g, z);
          return `<button type="button" data-z="${z}" class="${z === defaultSize ? 'on' : ''}" aria-label="Talla ${esc(z)}" aria-pressed="${z === defaultSize}" ${stock ? '' : 'disabled aria-disabled="true" title="Agotado"'}>${esc(z)}</button>`;
        }).join('')}
      </div>
      <div id="pdStock" class="pd-stock mono" aria-live="polite"></div>
    </div>

    <div class="pd-group">
      <div class="pd-label mono">QUANTITY</div>
      <div class="pd-qty">
        <button type="button" id="qtyMinus" aria-label="Restar">−</button>
        <input id="qtyValue" type="number" min="1" max="9" value="1" aria-label="Cantidad">
        <button type="button" id="qtyPlus" aria-label="Sumar">+</button>
      </div>
    </div>

    <button type="button" class="pd-buy mono" id="add">ADD TO BAG — <span id="pdBuyPrice">${esc(price)}</span></button>

    <div class="pd-extra" id="pdExtra" hidden>
      <table class="spec mono">
        <tr><td>Composición</td><td>${esc(g.fabric)}</td></tr>
        <tr><td>Gramaje</td><td>${esc(g.gsm)} g/m²</td></tr>
        <tr><td>Corte</td><td>${esc(g.cut)}</td></tr>
        <tr><td>Disponibilidad</td><td>Envío en 72h</td></tr>
      </table>
    </div>

    <div class="pd-foot">
      <button type="button" class="pd-link mono" id="viewDetails">VIEW DETAILS</button>
      <div class="pd-nav mono">
        <button type="button" id="pdPrev" aria-label="Prenda anterior">←</button>
        <span id="pdPos">${rackIndex + 1} / ${rack.length || 1}</span>
        <button type="button" id="pdNext" aria-label="Prenda siguiente">→</button>
      </div>
    </div>

    ${g.custom && esGestor(S.role)
      ? '<button type="button" id="del" class="pd-del mono">DELETE PIECE</button>' : ''}`;

  mount360($('#pdViewer'), g);

  const qtyInput = $('#qtyValue');
  const stockEl = $('#pdStock');
  const addBtn = $('#add');

  const syncStock = () => {
    const stock = stockDe(g, S.size);
    const tope = Math.max(1, Math.min(9, stock));
    qtyInput.max = String(tope);
    S.qty = Math.min(Math.max(1, S.qty), tope);
    qtyInput.value = String(S.qty);
    stockEl.textContent = stock
      ? `${stock} UNIDADES DISPONIBLES EN TALLA ${S.size}`
      : `AGOTADO EN TALLA ${S.size}`;
    stockEl.classList.toggle('agotado', !stock);
    addBtn.disabled = !stock;
    addBtn.setAttribute('aria-disabled', String(!stock));
    addBtn.title = stock ? '' : 'Talla agotada';
  };

  $('#iBody').querySelectorAll('[data-z]').forEach(btn => {
    btn.addEventListener('click', () => {
      if (btn.disabled) return;
      S.size = btn.dataset.z;
      $('#iBody').querySelectorAll('[data-z]').forEach(x => {
        x.classList.toggle('on', x === btn);
        x.setAttribute('aria-pressed', String(x === btn));
      });
      syncStock();
    });
  });

  const setQty = value => {
    const tope = Math.max(1, Math.min(9, stockDe(g, S.size)));
    S.qty = Math.max(1, Math.min(tope, Number(value) || 1));
    qtyInput.value = S.qty;
  };
  $('#qtyMinus').addEventListener('click', () => setQty(S.qty - 1));
  $('#qtyPlus').addEventListener('click', () => setQty(S.qty + 1));
  qtyInput.addEventListener('change', () => setQty(qtyInput.value));
  syncStock();

  addBtn.addEventListener('click', () => addBag(g, S.size, S.qty));

  $('#viewDetails').addEventListener('click', e => {
    const extra = $('#pdExtra');
    extra.hidden = !extra.hidden;
    e.currentTarget.textContent = extra.hidden ? 'VIEW DETAILS' : 'HIDE DETAILS';
  });

  $('#pdPrev').addEventListener('click', () => stepProduct(-1));
  $('#pdNext').addEventListener('click', () => stepProduct(1));

  $('#del')?.addEventListener('click', () => emit('custom:delete', g));

  openPanel('insp');
}

export function addCard(g) {
  const card = document.createElement('div');
  card.className = 'card glass';
  card.dataset.id = g.id;
  card.innerHTML = `
    ${svg(g)}
    <b>${esc(g.name)}</b>
    <div class="mono" style="color:var(--mut)">${esc(money(g.price))} · ${esc(g.fabric)}</div>
    <button type="button" class="pri">Ver prenda</button>`;
  card.querySelector('button').addEventListener('click', () => inspect(g));
  if (activeFilter !== 'all' && categoryOf(g) !== activeFilter) card.style.display = 'none';
  $('#car').appendChild(card);
}

export function removeCard(g) {
  [...document.querySelectorAll('.card')]
    .filter(card => card.dataset.id === g.id)
    .forEach(card => card.remove());
}

export function refreshCatalog() {
  $('#car').innerHTML = '';
  BASE.forEach(addCard);
  S.customs.forEach(addCard);
  filterCards(activeFilter);
}

export function initCatalog() {
  restoreBag();
  renderBag();
  BASE.forEach(addCard);

  on('garment:pick', inspect);
  on('catalog:refresh', refreshCatalog);
  on('customs:sync', ({ added, removed }) => {
    removed.forEach(removeCard);
    added.forEach(addCard);
    filterCards(activeFilter);
  });

  $('#bBag').addEventListener('click', () => openPanel('bag'));
  $('#buy').addEventListener('click', () => {
    if (!S.bag.length) return;
    const items = S.bag.map(b => ({ ...b }));
    const total = items.reduce((sum, b) => sum + b.q * b.g.price, 0);
    const result = createOrder({
      items,
      total,
      user: S.uname || 'Invitado',
      email: S.email
    });
    if (!result.ok) {
      $('#bagBody').innerHTML = `
        <div class="msg" style="cursor:default">
          <b style="color:var(--accent)">No se pudo confirmar el pedido</b>
          <div class="mono" style="margin-top:8px">${esc(result.mensaje || 'Revisa el stock y vuelve a intentar.')}</div>
          <div class="mono" style="margin-top:8px;color:var(--mut)">Tu bag se ha conservado.</div>
        </div>`;
      return;
    }
    const order = result.pedido;
    $('#bagBody').innerHTML = `
      <div class="msg" style="cursor:default">
        <b class="live">Pedido simulado confirmado</b>
        <div class="mono" style="margin-top:8px">
          ID ${esc(order.id)}<br>
          Tracking ${esc(order.tracking)}<br>
          Envío en 72h
        </div>
      </div>`;
    S.bag = [];
    $('#cnt').textContent = 0;
    $('#pdBagCount').textContent = 0;
    $('#sub').textContent = money(0);
    saveBag();
  });
}
