import { $ } from './utils.js';

// Modo inmersivo: retira el HUD y deja la escena 3D a pantalla completa.
// El drawer sigue disponible: solo se ocultan los elementos decorativos del showroom.
const CLS = 'immersive';
let active = false;

export function isImmersive() {
  return active;
}

export function setImmersive(next, { fullscreen = true } = {}) {
  const value = Boolean(next);
  if (value === active) return;
  active = value;

  document.body.classList.toggle(CLS, active);

  const exit = $('#xImmersive');
  const enter = $('#bImmersive');
  if (exit) exit.hidden = !active;
  if (enter) enter.setAttribute('aria-pressed', String(active));

  if (!fullscreen || !document.documentElement.requestFullscreen) return;
  if (active) {
    document.documentElement.requestFullscreen?.().catch(() => {});
  } else if (document.fullscreenElement) {
    document.exitFullscreen?.().catch(() => {});
  }
}

export function initImmersive() {
  $('#bImmersive')?.addEventListener('click', () => setImmersive(!active));
  $('#xImmersive')?.addEventListener('click', () => setImmersive(false));

  addEventListener('keydown', e => {
    if (e.key !== 'Escape' || !active || document.fullscreenElement) return;
    // Sin Fullscreen API (o si se denegó), ESC sigue siendo la salida.
    setImmersive(false);
  });

  document.addEventListener('fullscreenchange', () => {
    // El navegador ya gestiona ESC dentro de fullscreen: sincronizamos el estado.
    if (!document.fullscreenElement && active) setImmersive(false, { fullscreen: false });
  });
}
