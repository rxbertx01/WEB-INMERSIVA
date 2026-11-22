import { S } from './state.js';
import { $, esc, loadImg } from './utils.js';
import { openPanel, closePanel, note } from './ui.js';
import { hang, unhang, slotOf } from './scene3d.js';
import { on, emit } from './bus.js';
import { applyPriceOverrides } from './settings.js';
import { actorActual } from './services/auth.service.js';
import { esGestor } from './services/permisos.js';
import * as productos from './services/productos.service.js';
import * as variantes from './services/variantes.service.js';

const MAX = 16;
const stockDe = g => variantes.stockPorTalla(g.id);

// Un único formulario de alta, reutilizable en el modal y en el panel de cuenta.
export function addFormHTML(prefix, msgId) {
  const id = name => `${prefix}${name}`;
  return `
    <form id="${prefix === 'modal' ? 'addForm' : id('Form')}" class="admin-form"
          data-add-form="${prefix}" data-msg="${msgId}">
      <label class="f mono">NOMBRE DE LA PRENDA<input data-field="name" id="${id('Name')}" required placeholder="ARC MOTO JACKET"></label>
      <div class="f-row">
        <label class="f mono">CATEGORÍA
          <select data-field="type" id="${id('Type')}">
            <option value="bomber">OUTERWEAR / BOMBER</option>
            <option value="coat">OUTERWEAR / COAT</option>
            <option value="hoodie">ESSENTIALS / HOODIE</option>
            <option value="cargo">ESSENTIALS / CARGO</option>
          </select>
        </label>
        <label class="f mono">COLECCIÓN<input data-field="collection" id="${id('Collection')}" placeholder="LEATHER / 01"></label>
      </div>
      <div class="f-row">
        <label class="f mono">PRECIO USD<input data-field="price" id="${id('Price')}" type="number" min="0" step="1" placeholder="640"></label>
        <label class="f mono">STOCK POR TALLA<input data-field="stock" id="${id('Stock')}" type="number" min="0" step="1" value="10"></label>
      </div>
      <label class="f mono">COLOR<input data-field="color" id="${id('Color')}" type="color" value="#1c1f1a"></label>
      <label class="f mono">NOMBRE DEL COLOR<input data-field="colour" id="${id('Colour')}" placeholder="BLACK"></label>
      <div class="f mono">
        <span>TALLAS DISPONIBLES</span>
        <div class="size-picks">
          <label><input type="checkbox" data-size="XS">XS</label>
          <label><input type="checkbox" data-size="S">S</label>
          <label><input type="checkbox" data-size="M" checked>M</label>
          <label><input type="checkbox" data-size="L" checked>L</label>
          <label><input type="checkbox" data-size="XL">XL</label>
        </div>
      </div>
      <label class="f mono">DESCRIPCIÓN / DETALLES<textarea data-field="desc" id="${id('Desc')}" placeholder="Sculptural leather jacket with architectural seams…"></textarea></label>
      <label class="f mono">IMAGEN PRINCIPAL<input data-field="photo" id="${id('Photo')}" type="file" accept="image/*"></label>
      <label class="f mono">SECUENCIA 360° (HASTA 12 FOTOS)<input data-field="frames" id="${id('Frames')}" type="file" accept="image/*" multiple></label>
      <button class="pri" type="submit">PUBLISH TO SHOWROOM</button>
    </form>`;
}

export function bindAddForm(root, prefix) {
  const form = root.querySelector(`form[data-add-form="${prefix}"]`);
  if (!form || form.dataset.bound) return;
  form.dataset.bound = '1';
  form.addEventListener('submit', e => publish(e, form));
}

function loadCustoms() {
  S.customs = productos.listarCustoms().slice(0, MAX).map(g => ({ ...g, custom: true }));
}

// Cuelga la prenda; si no queda hueco, sustituye la más antigua subida por el admin.
function place(g) {
  if (!S.has3D) return null;
  let slot = hang(g);
  if (!slot) {
    const oldest = S.customs.find(item => item !== g && slotOf(item));
    if (oldest) {
      const free = slotOf(oldest);
      unhang(oldest);
      slot = hang(g, free);
    }
  }
  return slot;
}

export function renderAdminList() {
  const list = $('#adminList');
  if (!list) return;
  list.innerHTML = S.customs.length
    ? S.customs.map(g => `
      <div class="msg" style="cursor:default;display:flex;gap:10px;align-items:center">
        <div style="flex:1">
          <b>${esc(g.name)}</b>
          <div class="mono" style="color:var(--mut)">${esc(g.collection || g.type)} · ${g.frames?.length ? g.frames.length + ' frames 360°' : 'imagen'} · ${esc('$' + Number(g.price || 0).toFixed(2))} · STOCK ${stockDe(g)}</div>
        </div>
        <button type="button" data-del="${esc(g.id)}" aria-label="Eliminar ${esc(g.name)}">✕</button>
      </div>`).join('')
    : '<div class="mono" style="color:var(--mut)">Sin prendas publicadas.</div>';
  list.querySelectorAll('[data-del]').forEach(btn => {
    btn.addEventListener('click', () => {
      const g = S.customs.find(item => item.id === btn.dataset.del);
      if (g) removeCustom(g);
    });
  });
}

export function removeCustom(g) {
  const result = productos.eliminar(g.id, actorActual());
  if (!result.ok) {
    note('addMsg', result.mensaje || 'No se pudo eliminar la prenda.');
    return;
  }
  unhang(g);
  S.customs = S.customs.filter(item => item.id !== g.id);
  emit('catalog:refresh');
  renderAdminList();
  emit('customs:sync', { added: [], removed: [g] });
  closePanel('insp');
}

async function publish(e, form) {
  e.preventDefault();
  const msgId = form.dataset.msg || 'addMsg';
  const field = name => form.querySelector(`[data-field="${name}"]`);
  if (!esGestor(S.role)) { note(msgId, 'Solo ADMIN o VENDEDOR puede publicar.'); return; }
  if (S.customs.length >= MAX) { note(msgId, 'Catálogo lleno (máx. 16 prendas).'); return; }

  const name = field('name').value.trim();
  if (!name) { note(msgId, 'Escribe el nombre de la prenda.'); return; }

  const photo = field('photo').files[0];
  const frameFiles = [...field('frames').files].slice(0, 12);
  note(msgId, 'Procesando imágenes…');

  try {
    const image = photo ? await loadImg(photo) : {};
    const frames = [];
    for (const file of frameFiles) {
      const frame = await loadImg(file, { max: 420, quality: .7, limit: 65000 });
      frames.push(frame.img);
    }

    const sizes = [...form.querySelectorAll('[data-size]:checked')].map(x => x.value);
    const stock = Math.max(0, Math.round(Number(field('stock').value) || 10));
    const g = {
      id: 'c' + Date.now(),
      custom: true,
      stock,
      type: field('type').value,
      collection: field('collection').value.trim().toUpperCase() || 'COLLECTION 01',
      name,
      price: Math.max(0, Number(field('price').value) || 0),
      color: field('color').value || '#1c1f1a',
      colour: field('colour').value.trim().toUpperCase() || 'ATELIER',
      fabric: 'Tejido seleccionado',
      gsm: 400,
      cut: 'Regular fit',
      desc: field('desc').value.trim() || `Pieza ${name} de la colección Atelier VX.`,
      sizes: sizes.length ? sizes : ['M'],
      img: frames[0] || image.img || null,
      w: image.w || 1,
      h: image.h || 1,
      frames
    };

    const result = productos.crear(g, actorActual());
    if (!result.ok) {
      note(msgId, result.mensaje || 'No se pudo publicar la prenda.');
      return;
    }
    place(g);
    S.customs.push(g);
    emit('catalog:refresh');
    renderAdminList();
    emit('customs:sync', { added: [g], removed: [] });
    form.reset();
    field('color').value = '#1c1f1a';
    note(msgId, 'Prenda publicada en el showroom ✓');
    if (form.dataset.addForm === 'modal') closePanel('addP');
  } catch (err) {
    note(msgId, err?.message || 'No se pudo publicar la prenda.');
  }
}

export function initAdmin() {
  loadCustoms();
  applyPriceOverrides();
  S.customs.forEach(g => place(g));
  renderAdminList();
  emit('catalog:refresh');

  const syncRole = ({ role }) => { $('#bAdd').hidden = !esGestor(role); };
  syncRole({ role: S.role });
  on('auth:change', syncRole);
  on('custom:delete', removeCustom);

  $('#bAdd').addEventListener('click', () => {
    renderAdminList();
    openPanel('addP');
  });
  $('#xAdd').addEventListener('click', () => closePanel('addP'));

  const host = $('#addFormHost');
  if (host) {
    host.innerHTML = addFormHTML('modal', 'addMsg');
    bindAddForm(host, 'modal');
  }
}
