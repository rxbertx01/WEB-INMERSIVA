import { $ } from './utils.js';
import { home } from './scene3d.js';
import { destroy360 } from './viewer360.js';

const PANELS = ['insp', 'bag', 'addP', 'account'];

// Solo un panel lateral a la vez: al abrir uno se cierran los demás.
export function openPanel(id) {
  PANELS.forEach(panel => { if (panel !== id) closePanel(panel); });
  $('#' + id).classList.add('open');
}

export function closePanel(id) {
  $('#' + id).classList.remove('open');
  if (id === 'insp') {
    destroy360();
    home();
    document.body.classList.remove('inspecting');
  }
}

export function note(id, message) {
  const el = $('#' + id);
  if (el) el.textContent = message;
}

export function initUI() {
  $('#xInsp').addEventListener('click', () => closePanel('insp'));
  $('#xBag').addEventListener('click', () => closePanel('bag'));
  $('#xAccount').addEventListener('click', () => closePanel('account'));
}
