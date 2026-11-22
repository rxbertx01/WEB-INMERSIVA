import { S } from './state.js';
import { $, esc, money } from './utils.js';
import { svg } from './svg.js';
import { openPanel, closePanel } from './ui.js';
import { on, emit } from './bus.js';
import { settings, saveSettings, setPrice, adjustPrices } from './settings.js';
import { removeCustom, addFormHTML, bindAddForm } from './admin.js';
import * as bitacora from './services/bitacora.service.js';
import * as variantes from './services/variantes.service.js';
import * as cuenta from './services/cuenta.service.js';
import {
  ESTADOS_PEDIDO, FLUJO_PEDIDO, ETIQUETAS_ESTADO, TRANSICIONES_PEDIDO
} from './models/constantes.js';
import { clientes } from './services/clientes.service.js';
import { pedidos } from './services/pedidos.service.js';
import { actorActual } from './services/auth.service.js';

let editingAddress = null;
let current = null;
let orderTab = 'active';
let orderQuery = '';
let orderPeriod = '3m';

const profileFor = email => clientes.obtener(email, S.uname || email.split('@')[0]);
const stockDe = g => variantes.stockPorTalla(g.id);
const DEFAULT_SECTION = { client: 'ped', admin: 'agregar', vendedor: 'agregar' };

function mostrarError(err) {
  const el = $('#accountMsg');
  if (el) el.textContent = err?.mensaje || err?.message || 'No se pudo guardar en este navegador.';
}

const dateOf = iso => new Date(iso).toLocaleDateString('es-ES', {
  day: '2-digit', month: 'short', year: 'numeric'
});

const longDate = iso => new Date(iso).toLocaleDateString('es-ES', {
  day: '2-digit', month: 'long', year: 'numeric'
});

function statusPill(o) {
  const estado = pedidos.estadoDe(o);
  return `<span class="acc2-pill ${estado === 'ENTREGADO' ? 'done' : ''}">${esc(ETIQUETAS_ESTADO[estado])}</span>`;
}

function thumbFor(item) {
  const g = [...S.garments, ...S.customs].find(x => x.id === item.id);
  if (g?.img) return `<img class="acc-thumb" src="${esc(g.img)}" alt="">`;
  const fallback = g || { type: 'bomber', color: '#555555', name: item.name };
  return `<span class="acc-thumb acc-thumb-svg" aria-hidden="true">${svg(fallback)}</span>`;
}

function tracker(o) {
  const estado = pedidos.estadoDe(o);
  const paso = FLUJO_PEDIDO.indexOf(estado);
  return `
    <div class="acc-steps">
      ${FLUJO_PEDIDO.map((s, i) => `
        <div class="acc-step ${i <= paso ? 'on' : ''}">
          <span class="mono">${String(i + 1).padStart(2, '0')}</span>
          <b class="mono">${esc(ETIQUETAS_ESTADO[s])}</b>
        </div>`).join('')}
    </div>
    <div class="mono acc2-muted">TRACKING · ${esc(o.tracking)} &nbsp;|&nbsp; TOTAL · ${esc(money(o.total))}</div>`;
}

/* ---- Navegación: cada perfil ve solo lo que puede usar ---- */
const cerrar = {
  label: '',
  items: [{ id: 'logout', label: 'CERRAR SESIÓN / LOG OUT ✕', out: true }]
};

function navGroups() {
  if (S.role === 'client') {
    return [
      {
        label: 'MI PERFIL',
        items: [
          { id: 'perfil', label: 'Datos personales' },
          { id: 'direcciones', label: 'Direcciones' }
        ]
      },
      { label: 'MIS COMPRAS', items: [{ id: 'ped', label: 'Seguimiento e historial de compras' }] },
      {
        label: '',
        items: [
          { id: 'fav', label: 'Favoritos', chevron: true },
          cerrar.items[0]
        ]
      }
    ];
  }

  const esAdmin = S.role === 'admin';
  const grupos = [
    {
      label: esAdmin ? 'PERFIL ADMIN' : 'PERFIL VENDEDOR',
      items: [{ id: 'info', label: esAdmin ? 'Información del administrador' : 'Información del vendedor' }]
    },
    {
      label: 'GESTIÓN DE CATÁLOGO',
      items: [
        { id: 'agregar', label: 'Subir prenda al catálogo' },
        { id: 'prendas', label: 'Administrar prendas' }
      ]
    }
  ];

  if (esAdmin) {
    grupos.push({
      label: 'GESTIÓN DE TIENDA',
      items: [{ id: 'pagina', label: 'Modificar la página' }]
    });
  }

  grupos.push({ label: 'VENTAS', items: [{ id: 'ventas', label: 'Pedidos de los clientes' }] });

  if (esAdmin) {
    grupos.push({ label: 'AUDITORÍA', items: [{ id: 'bitacora', label: 'Bitácora' }] });
  }

  grupos.push(cerrar);
  return grupos;
}

const allItems = () => navGroups().flatMap(g => g.items);
const findItem = id => allItems().find(i => i.id === id);

function accountHTML() {
  const item = findItem(current) || { label: 'MI CUENTA' };
  const name = S.uname || 'ATELIER VX';
  const greeting = S.role === 'admin' ? 'Admin' : S.role === 'vendedor' ? 'Equipo' : 'Hola';
  const badge = S.role === 'admin' ? 'ADMINISTRADOR' : S.role === 'vendedor' ? 'VENDEDOR' : 'CLIENTE';

  const nav = navGroups().map(group => `
    ${group.label ? `<div class="acc2-group mono">${esc(group.label)}</div>` : ''}
    ${group.items.map(i => `
      <button type="button" class="acc2-item ${i.out ? 'acc2-out' : ''} ${current === i.id ? 'on' : ''}"
        ${i.id === 'logout' ? 'id="logoutBtn"' : ''} data-sec="${i.id}"
        ${current === i.id ? 'aria-current="page"' : ''}>
        <span>${esc(i.label)}</span>${i.chevron ? '<span aria-hidden="true">›</span>' : ''}
      </button>`).join('')}
  `).join('');

  return `
    <aside class="acc2-side">
      <div class="acc2-head">
        <div class="acc2-av mono" aria-hidden="true">${esc(name.trim()[0]?.toUpperCase() || 'V')}</div>
        <div class="acc2-who">
          <div class="acc2-greeting">${greeting}, <b>${esc(name)}</b></div>
          <div class="mono acc2-sub">${badge} · ${esc(S.email || '')}</div>
        </div>
      </div>
      <nav class="acc2-nav" aria-label="Navegación de cuenta">${nav}</nav>
    </aside>
    <section class="acc2-main">
      <div class="acc2-crumb mono">MI CUENTA <span>›</span> <b>${esc(item.label.toUpperCase())}</b></div>
      <div class="acc2-main-head"><h2>${esc(item.label)}</h2></div>
      <div id="accountMsg" class="mono acc2-status" role="status" aria-live="polite"></div>
      <div class="acc2-body">${contentFor(current)}</div>
    </section>`;
}

/* ---- Pedidos: tarjetas compactas, con filtros y seguimiento ---- */
function ordersBrowser({ manager = false } = {}) {
  const orders = manager ? pedidos.todos() : pedidos.mios(S.email);
  const tabs = manager ? '' : `
    <div class="acc2-tabs mono" role="tablist" aria-label="Filtro de pedidos">
      <button type="button" role="tab" data-tab="active" aria-selected="${orderTab === 'active'}" class="${orderTab === 'active' ? 'on' : ''}">Pedidos activos</button>
      <button type="button" role="tab" data-tab="history" aria-selected="${orderTab === 'history'}" class="${orderTab === 'history' ? 'on' : ''}">Historial completo</button>
    </div>`;
  const selector = !manager && orders.length ? `
    <label class="f mono">SELECCIONA UN PEDIDO
      <select id="trackSelect">
        ${orders.map(o => `<option value="${esc(o.id)}">${esc(o.id)} · ${dateOf(o.date)}</option>`).join('')}
      </select>
    </label>
    <div id="trackBody">${tracker(orders[0])}</div>` : '';

  return `${selector ? `<div class="acc2-tracker">${selector}</div>` : ''}
    <div class="acc2-toolbar">
      ${tabs}
      <label class="acc2-search">
        <span aria-hidden="true">⌕</span>
        <input id="accSearch" type="search" placeholder="Buscar por número de orden" value="${esc(orderQuery)}" aria-label="Buscar por número de orden">
      </label>
      <label class="acc2-period">MOSTRAR POR
        <select id="accPeriod" aria-label="Periodo">
          <option value="3m" ${orderPeriod === '3m' ? 'selected' : ''}>Últimos 3 meses</option>
          <option value="6m" ${orderPeriod === '6m' ? 'selected' : ''}>Últimos 6 meses</option>
          <option value="all" ${orderPeriod === 'all' ? 'selected' : ''}>Todo el historial</option>
        </select>
      </label>
    </div>
    <div id="accOrderList" class="acc2-list" data-manager="${manager}"></div>`;
}

function orderCard(o, manager = false) {
  const estado = pedidos.estadoDe(o);
  const permitidos = TRANSICIONES_PEDIDO[estado] || [];
  const items = o.items.map(i => `
    <div class="acc2-line">
      ${thumbFor(i)}
      <div class="mono">
        <b>${esc(i.name)}</b>
        <div class="acc2-muted">${esc(i.color || '')} · TALLA ${esc(i.size)} · ×${i.qty}</div>
      </div>
      <b class="mono">${esc(money(i.price * i.qty))}</b>
    </div>`).join('');

  return `
    <article class="acc2-msg">
      <div class="acc2-msg-top"><b>${esc(o.id)}</b>${statusPill(o)}</div>
      <div class="mono acc2-muted">${longDate(o.date)} · ${esc(o.user)} · ${esc(o.tracking)}</div>
      ${items}
      <div class="mono acc2-total"><b>${esc(money(o.total))}</b><span class="acc2-live">${esc(ETIQUETAS_ESTADO[estado])}</span></div>
      <div class="acc2-actions">
        <button type="button" class="pri mono acc-track" data-track="${esc(o.id)}" aria-expanded="false">SEGUIMIENTO</button>
        <button type="button" class="mono acc-receipt" data-receipt="${esc(o.id)}">COMPROBANTE</button>
      </div>
      <div class="acc2-timeline" hidden>${tracker(o)}</div>
      ${manager ? `
        <label class="f mono">ESTADO DEL PEDIDO
          <select data-order="${esc(o.id)}">
            ${ESTADOS_PEDIDO.map(s => `<option value="${s}" ${s === estado ? 'selected' : ''} ${s !== estado && !permitidos.includes(s) ? 'disabled' : ''}>${esc(ETIQUETAS_ESTADO[s])}</option>`).join('')}
          </select>
        </label>` : ''}
    </article>`;
}

function renderOrderList() {
  const host = $('#accOrderList');
  if (!host) return;
  const manager = host.dataset.manager === 'true';
  let orders = manager ? pedidos.todos() : pedidos.mios(S.email);

  if (!manager) {
    orders = orders.filter(o => {
      const fin = ['ENTREGADO', 'CANCELADO'].includes(pedidos.estadoDe(o));
      return orderTab === 'history' ? fin : !fin;
    });
  }
  if (orderQuery.trim()) {
    const q = orderQuery.trim().toLowerCase();
    orders = orders.filter(o => o.id.toLowerCase().includes(q) || (o.user || '').toLowerCase().includes(q));
  }
  if (orderPeriod !== 'all') {
    const months = orderPeriod === '3m' ? 3 : 6;
    const limit = Date.now() - months * 30 * 86400000;
    orders = orders.filter(o => new Date(o.date).getTime() >= limit);
  }

  host.innerHTML = orders.length
    ? orders.map(o => orderCard(o, manager)).join('')
    : `<div class="mono acc2-muted">${manager ? 'Todavía no hay pedidos.'
      : orderTab === 'history' ? 'Todavía no hay compras anteriores.' : 'No tienes pedidos activos.'}</div>`;
}

function downloadReceipt(o) {
  const lines = [
    'ATELIER / VX — COMPROBANTE DE COMPRA',
    '----------------------------------------',
    `ORDEN: ${o.id}`,
    `FECHA: ${longDate(o.date)}`,
    `ESTADO: ${ETIQUETAS_ESTADO[pedidos.estadoDe(o)]}`,
    `CLIENTE: ${o.user}`,
    `TRACKING: ${o.tracking}`,
    '',
    ...o.items.map(i => `${i.qty} × ${i.name} (${i.size}) · ${money(i.price * i.qty)}`),
    '',
    `TOTAL: ${money(o.total)}`
  ];
  const url = URL.createObjectURL(new Blob([lines.join('\n')], { type: 'text/plain;charset=utf-8' }));
  const a = document.createElement('a');
  a.href = url;
  a.download = `comprobante-${o.id}.txt`;
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}

/* ---- Secciones del contenido ---- */
function perfilSection() {
  const p = profileFor(S.email);
  return `
    <form id="fd" class="acc2-form">
      <label class="f mono">NOMBRE<input name="name" value="${esc(p.name)}"></label>
      <label class="f mono">EMAIL<input value="${esc(p.email)}" disabled></label>
      <label class="f mono">TELÉFONO<input name="phone" value="${esc(p.phone)}" placeholder="+52 55 0000 0000"></label>
      <button id="saveProfile" class="pri" type="submit">GUARDAR</button>
    </form>`;
}

function direccionesSection() {
  const p = profileFor(S.email);
  const edit = p.addresses.find(a => a.id === editingAddress);
  const val = (name, fallback) => esc(edit?.[name] ?? fallback);
  return `
    ${p.addresses.length ? p.addresses.map(a => `
      <div class="acc2-msg">
        <div class="mono"><b>${esc(a.label)}</b> ${a.main ? '<span class="acc2-pill done">PRINCIPAL</span>' : ''}
          <div class="acc2-muted">${esc(a.street)} · ${esc(a.city)} ${esc(a.zip)} · ${esc(a.country)}</div>
        </div>
        <div class="acc2-actions">
          <button type="button" data-addr="main" data-id="${esc(a.id)}">PRINCIPAL</button>
          <button type="button" data-addr="edit" data-id="${esc(a.id)}">EDITAR</button>
          <button type="button" data-addr="del" data-id="${esc(a.id)}">✕</button>
        </div>
      </div>`).join('') : '<div class="mono acc2-muted">Sin direcciones guardadas.</div>'}
    <form id="addrForm" class="acc2-form">
      <label class="f mono">ETIQUETA<input name="label" value="${val('label', '')}" placeholder="HOME / WORK" required></label>
      <label class="f mono">CALLE Y NÚMERO<input name="street" value="${val('street', '')}" required></label>
      <div class="acc2-row">
        <label class="f mono">CIUDAD<input name="city" value="${val('city', '')}" required></label>
        <label class="f mono">C.P.<input name="zip" value="${val('zip', '')}" required></label>
      </div>
      <label class="f mono">PAÍS<input name="country" value="${val('country', 'MX')}"></label>
      <button class="pri" type="submit">${editingAddress ? 'ACTUALIZAR DIRECCIÓN' : 'AÑADIR DIRECCIÓN'}</button>
      ${editingAddress ? '<button type="button" id="cancelAddr">CANCELAR</button>' : ''}
    </form>`;
}

function favoritosSection() {
  const favs = cuenta.listar().favoritos;
  const prendas = [...S.garments, ...S.customs];
  const lista = favs.map(id => prendas.find(g => g.id === id)).filter(Boolean);
  return `
    ${lista.length ? lista.map(g => `
      <div class="acc2-msg acc2-fav" data-open="${esc(g.id)}" style="cursor:pointer">
        <span>${esc(g.name)}</span>
        <span class="mono acc2-live">${esc(money(g.price))}</span>
        <button type="button" data-favdel="${esc(g.id)}">✕</button>
      </div>`).join('') : '<div class="mono acc2-muted">Aún no tienes favoritos.</div>'}
    <form id="favForm" class="acc2-form">
      <label class="f mono">AÑADIR PRENDA
        <select name="producto">
          ${prendas.map(g => `<option value="${esc(g.id)}">${esc(g.name)}</option>`).join('')}
        </select>
      </label>
      <button class="pri" type="submit">AGREGAR A FAVORITOS</button>
    </form>`;
}

function infoSection() {
  const role = S.role === 'admin' ? 'ADMINISTRADOR' : 'VENDEDOR';
  return `
    <div class="acc2-msg"><span class="mono">NOMBRE</span><b>${esc(S.uname)}</b></div>
    <div class="acc2-msg"><span class="mono">EMAIL</span><b>${esc(S.email)}</b></div>
    <div class="acc2-msg"><span class="mono">ROL</span><b class="acc2-live">${role}</b></div>`;
}

function agregarSection() {
  return `
    <div class="acc2-form">${addFormHTML('acc', 'accountMsg')}</div>
    <button type="button" id="openAdd">ABRIR FORMULARIO AMPLIADO ↗</button>`;
}

function prendasSection() {
  const garments = [...S.garments, ...S.customs];
  return `
    <div class="acc2-msg">
      <label class="f mono">AJUSTE GENERAL (%)<input id="pricePct" type="number" value="10" step="5"></label>
      <div class="acc2-actions">
        <button type="button" data-pct="-1">−10%</button>
        <button type="button" data-pct="1">+10%</button>
        <button type="button" id="applyPct" class="pri">APLICAR</button>
      </div>
    </div>
    ${garments.map(g => `
      <div class="acc2-msg acc2-prenda">
        ${thumbFor({ id: g.id, name: g.name })}
        <div class="mono acc2-prenda-info">
          <b>${esc(g.name)}</b>
          <div class="acc2-muted">${esc(g.collection || g.type)} · STOCK ${stockDe(g)}</div>
        </div>
        <div class="acc2-actions">
          <button type="button" data-price="${esc(g.id)}" data-delta="-10" aria-label="Bajar precio">−</button>
          <span class="mono">${esc(money(g.price))}</span>
          <button type="button" data-price="${esc(g.id)}" data-delta="10" aria-label="Subir precio">+</button>
          ${g.custom ? `<button type="button" data-del="${esc(g.id)}">ELIMINAR</button>` : ''}
        </div>
      </div>`).join('')}`;
}

function paginaSection() {
  return `
    <form id="siteForm" class="acc2-form">
      <label class="f mono">TITULAR<input name="heroLead" value="${esc(settings.heroLead)}"></label>
      <label class="f mono">DESTACADO<input name="heroAccent" value="${esc(settings.heroAccent)}"></label>
      <label class="f mono">ETIQUETA IZQ.<input name="edition" value="${esc(settings.edition)}"></label>
      <label class="f mono">ETIQUETA DER.<input name="hint" value="${esc(settings.hint)}"></label>
      <label class="f mono">KICKER<input name="kicker" value="${esc(settings.kicker)}"></label>
      <label class="f mono">COLOR DE ACENTO<input name="accent" type="color" value="${esc(settings.accent)}"></label>
      <button class="pri" type="submit">GUARDAR APARIENCIA</button>
    </form>`;
}

function bitacoraSection() {
  const entradas = bitacora.listar(actorActual());
  if (!Array.isArray(entradas)) {
    return `<div class="mono acc2-muted">${esc(entradas.mensaje || 'No se pudo consultar la bitácora.')}</div>`;
  }
  return entradas.length ? entradas.map(e => `
    <div class="acc2-msg mono">
      <div><b>${esc(e.accion)}</b> · ${esc(e.entidad)} ${esc(e.entidadId)}</div>
      <div class="acc2-muted">${dateOf(e.fecha)} · ${esc(e.usuarioEmail || e.usuarioId)}</div>
      <div class="acc2-muted">${esc(e.detalle || '')}</div>
    </div>`).join('') : '<div class="mono acc2-muted">Sin movimientos registrados.</div>';
}

function contentFor(id) {
  switch (id) {
    case 'perfil': return perfilSection();
    case 'direcciones': return direccionesSection();
    case 'ped': return ordersBrowser();
    case 'fav': return favoritosSection();
    case 'info': return infoSection();
    case 'agregar': return agregarSection();
    case 'prendas': return prendasSection();
    case 'pagina': return paginaSection();
    case 'ventas': return ordersBrowser({ manager: true });
    case 'bitacora': return bitacoraSection();
    default: return '';
  }
}

/* ---- Render y eventos (delegados sobre #accountBody) ---- */
function render() {
  const body = $('#accountBody');
  if (!body) return;
  if (!allItems().some(i => i.id === current && i.id !== 'logout')) {
    current = DEFAULT_SECTION[S.role] || 'perfil';
  }
  body.className = 'pb acc2';
  body.innerHTML = accountHTML();
  bind();
  renderOrderList();
}

function openAccount() {
  if (S.role === 'guest') return;
  editingAddress = null;
  current = DEFAULT_SECTION[S.role] || 'perfil';
  orderTab = 'active';
  render();
  openPanel('account');
}

function onClick(e) {
  const el = e.target.closest(
    '[data-sec],[data-tab],[data-track],[data-receipt],[data-addr],' +
    '[data-price],[data-del],[data-pct],[data-favdel],[data-open],' +
    '#cancelAddr,#openAdd,#applyPct'
  );
  if (!el) return;

  if (el.dataset.sec) {
    if (el.dataset.sec === 'logout') { emit('auth:logout'); return; }
    current = el.dataset.sec;
    editingAddress = null;
    render();
    return;
  }
  if (el.dataset.tab) {
    orderTab = el.dataset.tab;
    document.querySelectorAll('#accountBody [data-tab]').forEach(b => {
      const on = b.dataset.tab === orderTab;
      b.classList.toggle('on', on);
      b.setAttribute('aria-selected', String(on));
    });
    renderOrderList();
    return;
  }
  if (el.dataset.track) {
    const timeline = el.closest('.acc2-msg')?.querySelector('.acc2-timeline');
    if (!timeline) return;
    timeline.hidden = !timeline.hidden;
    el.setAttribute('aria-expanded', String(!timeline.hidden));
    el.textContent = timeline.hidden ? 'SEGUIMIENTO' : 'OCULTAR SEGUIMIENTO';
    return;
  }
  if (el.dataset.receipt) {
    const o = S.orders.find(x => x.id === el.dataset.receipt);
    if (o) downloadReceipt(o);
    return;
  }
  if (el.dataset.addr) {
    const id = el.dataset.id;
    if (el.dataset.addr === 'edit') { editingAddress = id; render(); return; }
    const resultado = el.dataset.addr === 'main'
      ? clientes.fijarPrincipal(S.email, id, actorActual())
      : clientes.eliminarDireccion(S.email, id, actorActual());
    if (resultado?.ok === false) { mostrarError(resultado); return; }
    editingAddress = null;
    render();
    return;
  }
  if (el.dataset.price) {
    const g = [...S.garments, ...S.customs].find(item => item.id === el.dataset.price);
    if (!g) return;
    if (!setPrice(g.id, g.price + Number(el.dataset.delta), actorActual())) {
      mostrarError({ mensaje: 'No se pudo guardar el precio.' });
      return;
    }
    render();
    return;
  }
  if (el.dataset.del) {
    const g = S.customs.find(item => item.id === el.dataset.del);
    if (g) { removeCustom(g); render(); }
    return;
  }
  if (el.dataset.pct) {
    if (!adjustPrices(Number(el.dataset.pct) * 10, actorActual())) {
      mostrarError({ mensaje: 'No se pudieron guardar los precios.' });
      return;
    }
    render();
    return;
  }
  if (el.dataset.favdel) {
    cuenta.alternarFavorito(el.dataset.favdel);
    render();
    return;
  }
  if (el.dataset.open) {
    const g = [...S.garments, ...S.customs].find(item => item.id === el.dataset.open);
    if (g) { closePanel('account'); emit('garment:pick', g); }
    return;
  }
  if (el.id === 'cancelAddr') { editingAddress = null; render(); return; }
  if (el.id === 'openAdd') { closePanel('account'); openPanel('addP'); return; }
  if (el.id === 'applyPct') {
    if (!adjustPrices($('#pricePct').value, actorActual())) {
      mostrarError({ mensaje: 'No se pudieron guardar los precios.' });
      return;
    }
    render();
  }
}

function onChange(e) {
  const el = e.target;
  if (el.id === 'accPeriod') { orderPeriod = el.value; renderOrderList(); return; }
  if (el.dataset.order) {
    const resultado = pedidos.cambiarEstado(el.dataset.order, el.value, actorActual());
    if (!resultado.ok) {
      render();
      $('#accountMsg').textContent = resultado.mensaje || 'No se pudo cambiar el estado.';
      return;
    }
    emit('orders:change');
    return;
  }
  if (el.id === 'trackSelect') {
    const o = S.orders.find(item => item.id === el.value);
    if (o && $('#trackBody')) $('#trackBody').innerHTML = tracker(o);
  }
}

function onSubmit(e) {
  const f = e.target;
  if (f.dataset.addForm === 'acc') return; // lo gestiona bindAddForm() de admin.js
  e.preventDefault();

  if (f.id === 'fd') {
    const data = Object.fromEntries(new FormData(f));
    try {
      const actualizado = clientes.guardarPerfil(S.email, {
        name: data.name?.trim(), phone: data.phone?.trim()
      }, actorActual());
      if (actualizado?.ok === false) { mostrarError(actualizado); return; }
      S.uname = actualizado.name;
      $('#bUser').textContent = S.uname.toUpperCase() + ' ✕';
      render();
      $('#accountMsg').textContent = 'Perfil actualizado ✓';
    } catch (err) { mostrarError(err); }
    return;
  }

  if (f.id === 'addrForm') {
    const data = Object.fromEntries(new FormData(f));
    try {
      const resultado = editingAddress
        ? clientes.actualizarDireccion(S.email, editingAddress, data, actorActual())
        : clientes.agregarDireccion(S.email, data, actorActual());
      if (resultado?.ok === false) { mostrarError(resultado); return; }
      editingAddress = null;
      render();
    } catch (err) { mostrarError(err); }
    return;
  }

  if (f.id === 'favForm') {
    cuenta.alternarFavorito(new FormData(f).get('producto'));
    render();
    return;
  }

  if (f.id === 'siteForm') {
    Object.assign(settings, Object.fromEntries(new FormData(f)));
    saveSettings();
    $('#accountMsg').textContent = 'Apariencia actualizada ✓';
  }
}

function bind() {
  const root = $('#accountBody');
  if (!root || root.dataset.bound) return;
  root.dataset.bound = '1';
  root.addEventListener('click', onClick);
  root.addEventListener('change', onChange);
  root.addEventListener('input', e => {
    if (e.target.id === 'accSearch') { orderQuery = e.target.value; renderOrderList(); }
  });
  root.addEventListener('submit', onSubmit);
  bindAddForm(root, 'acc');
}

export function initAccount() {
  on('account:open', openAccount);
  on('auth:change', ({ role }) => { if (role === 'guest') closePanel('account'); });
  on('orders:change', () => {
    if ($('#account')?.classList.contains('open')) render();
  });
  on('customs:sync', () => {
    if ($('#account')?.classList.contains('open') && current === 'prendas') render();
  });
}
