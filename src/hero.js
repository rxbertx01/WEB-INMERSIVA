import { $, esc } from './utils.js';
import { home, focusRack } from './scene3d.js';
import { filterCards } from './catalog.js';
import { listar as listarCategorias } from './services/categorias.service.js';

// Barra rápida del primer plano: filtra el carrusel y acerca la cámara al perchero.
export function initHero() {
  const host = $('#filters');
  const categorias = listarCategorias();
  host.innerHTML = [
    '<button type="button" data-filter="all" class="on">ALL PIECES</button>',
    ...categorias.map(c => `<button type="button" data-filter="${esc(c.slug)}">${esc(c.nombre)}</button>`)
  ].join('');

  const buttons = [...host.querySelectorAll('[data-filter]')];
  buttons.forEach(button => {
    button.addEventListener('click', () => {
      buttons.forEach(b => b.classList.toggle('on', b === button));
      const filter = button.dataset.filter;
      filterCards(filter);
      if (filter === 'outer') focusRack('left');
      else if (filter === 'essential') focusRack('right');
      else home();
    });
  });
}
