import { esc, shade } from './utils.js';

export const PATHS = {
  hoodie: 'M70 30 Q100 10 130 30 L172 46 L190 150 L162 156 L158 120 L158 230 L42 230 L42 120 L38 156 L10 150 L28 46Z',
  bomber: 'M72 28 L100 22 L128 28 L176 44 L194 160 L166 164 L160 128 L160 214 L40 214 L40 128 L34 164 L6 160 L24 44Z',
  coat: 'M74 24 L100 38 L126 24 L168 40 L186 170 L160 172 L158 100 L152 290 L48 290 L42 100 L40 172 L14 170 L32 40Z',
  cargo: 'M52 20 H148 L156 110 L168 290 H110 L100 120 L90 290 H32 L44 110Z'
};

function details(g) {
  if (g.type === 'hoodie') return '<path d="M70 30 Q100 70 130 30" fill="none" stroke="#0006" stroke-width="3"/><rect x="62" y="150" width="76" height="30" rx="4" fill="#0003"/>';
  if (g.type === 'bomber') return '<rect x="94" y="24" width="12" height="190" fill="#ffffff22"/><rect x="40" y="200" width="120" height="14" fill="#0004"/>';
  if (g.type === 'coat') return '<path d="M100 38 L100 290" stroke="#0005" stroke-width="2"/><circle cx="92" cy="110" r="3" fill="#fff6"/><circle cx="92" cy="160" r="3" fill="#fff6"/><circle cx="92" cy="210" r="3" fill="#fff6"/>';
  return '<rect x="40" y="70" width="26" height="40" fill="#0003"/><rect x="134" y="70" width="26" height="40" fill="#0003"/><path d="M100 20V120" stroke="#0005"/>';
}

export function svg(g) {
  if (g.img) return `<img src="${esc(g.img)}" alt="${esc(g.name || 'Prenda')}">`;
  const c = esc(g.color || '#888888');
  const id = 'g' + Math.random().toString(36).slice(2, 7);
  const texture = /cuero/i.test(g.fabric || '')
    ? '<path d="M20 60 L180 200 M40 40 L190 150 M10 120 L120 250" stroke="#fff" opacity=".07" stroke-width="1"/>'
    : '';
  const path = PATHS[g.type] || PATHS.hoodie;
  return `<svg viewBox="0 0 200 300" xmlns="http://www.w3.org/2000/svg">
    <defs><linearGradient id="${id}" x1="0" y1="0" x2="1" y2="1">
      <stop offset="0" stop-color="${shade(c, 1.5)}"/>
      <stop offset=".5" stop-color="${c}"/>
      <stop offset="1" stop-color="${shade(c, .45)}"/>
    </linearGradient></defs>
    <path d="${path}" fill="url(#${id})" stroke="#ffffff30"/>
    ${details(g)}${texture}
    <ellipse cx="100" cy="296" rx="70" ry="4" fill="#000" opacity=".5"/>
  </svg>`;
}
