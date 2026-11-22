import { S } from './state.js';
import { $, esc } from './utils.js';
import { emit } from './bus.js';
import { setAccent } from './scene3d.js';
import { KEYS, read, write } from './services/storage.js';
import { actorActual } from './services/auth.service.js';
import * as productos from './services/productos.service.js';

const DEFAULTS = {
  heroLead: 'EXPLORE THE',
  heroAccent: 'COLLECTION',
  edition: 'FLAGSHIP / 00 SHOWROOM',
  hint: 'CLICK A RACK TO EXPLORE · DRAG TO ORBIT',
  kicker: 'COLLECTION 00 / ATELIER',
  accent: '#FF2D2D',
  prices: {}
};

export const settings = { ...DEFAULTS, prices: {} };

export function applyPriceOverrides() {
  productos.aplicarPrecios([...S.garments, ...S.customs]);
}

export function applySettings() {
  document.documentElement.style.setProperty('--accent', settings.accent);
  const title = $('.hero-title');
  if (title) title.innerHTML = `${esc(settings.heroLead)} <em>${esc(settings.heroAccent)}</em>`;
  const edition = $('#edition');
  if (edition) edition.textContent = settings.edition;
  const hint = $('#hint');
  if (hint) hint.textContent = settings.hint;
  setAccent(settings.accent);
}

export function saveSettings() {
  write(KEYS.settings, settings);
  applySettings();
  emit('settings:change');
}

export function initSettings() {
  const doc = read(KEYS.settings, {}) || {};
  Object.assign(settings, doc);
  settings.prices = { ...productos.precios(), ...(doc.prices || {}) };
  applyPriceOverrides();
  applySettings();
}

export function setPrice(id, price, actor = actorActual()) {
  const result = productos.fijarPrecio(id, price, actor);
  if (!result.ok) return false;
  Object.assign(settings, result.settings);
  settings.prices = { ...(result.settings.prices || {}) };
  const g = [...S.garments, ...S.customs].find(item => item.id === id);
  if (g) g.price = Math.max(0, Math.round(Number(price) || 0));
  applySettings();
  emit('settings:change');
  emit('catalog:refresh');
  return true;
}

export function adjustPrices(percent, actor = actorActual()) {
  const result = productos.ajustarPrecios(percent, actor);
  if (!result.ok) return false;
  Object.assign(settings, result.settings);
  settings.prices = { ...(result.settings.prices || {}) };
  applyPriceOverrides();
  applySettings();
  emit('settings:change');
  emit('catalog:refresh');
  return true;
}
