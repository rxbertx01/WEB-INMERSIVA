import { $, esc } from './utils.js';
import { svg } from './svg.js';

// Visor 360°: giro automático lento, arrastre manual y pausa/reanudación.
const SPEED = 14; // grados por segundo → una vuelta en ~26 s

let ctx = null;

export function destroy360() {
  if (!ctx) return;
  cancelAnimationFrame(ctx.raf);
  ctx.stage?.removeEventListener('pointerdown', ctx.down);
  removeEventListener('pointermove', ctx.move);
  removeEventListener('pointerup', ctx.up);
  ctx = null;
}

export function mount360(host, g) {
  destroy360();
  const frames = Array.isArray(g.frames) ? g.frames.filter(Boolean) : [];

  host.innerHTML = `
    <div class="v360">
      <div class="v360-stage" id="v360Stage">
        ${frames.length
          ? `<img id="v360Img" src="${esc(frames[0])}" alt="Vista 360° de ${esc(g.name)}" draggable="false">`
          : `<div class="v360-model" id="v360Model">${svg(g)}</div>`}
        <span class="v360-mark mono">360°</span>
      </div>
      <div class="v360-bar mono">
        <span>${frames.length ? frames.length + ' FRAMES' : 'STUDIO ROTATION'}</span>
        <span class="v360-controls">
          <span id="v360Angle">000°</span>
          <button type="button" id="v360Toggle">PAUSE</button>
        </span>
      </div>
      <div class="v360-hint mono">DRAG TO ROTATE · TAP TO PAUSE</div>
    </div>`;

  const stage = $('#v360Stage');
  const img = $('#v360Img');
  const model = $('#v360Model');
  const angleLabel = $('#v360Angle');
  const toggle = $('#v360Toggle');

  let angle = 0;
  let playing = true;
  let dragging = false;
  let lastX = 0;
  let lastTime = performance.now();
  let lastIndex = -1;

  const render = () => {
    angle = ((angle % 360) + 360) % 360;
    if (frames.length) {
      const index = Math.floor(angle / 360 * frames.length) % frames.length;
      if (index !== lastIndex) {
        img.src = frames[index];
        lastIndex = index;
      }
    } else if (model) {
      model.style.transform = `perspective(700px) rotateY(${angle}deg)`;
    }
    angleLabel.textContent = String(Math.round(angle)).padStart(3, '0') + '°';
  };

  const tick = now => {
    const delta = Math.min(.05, (now - lastTime) / 1000);
    lastTime = now;
    if (playing && !dragging) {
      angle += SPEED * delta;
      render();
    }
    ctx.raf = requestAnimationFrame(tick);
  };

  const down = e => {
    dragging = true;
    lastX = e.clientX;
    stage.setPointerCapture?.(e.pointerId);
    stage.classList.add('dragging');
  };
  const move = e => {
    if (!dragging) return;
    angle -= (e.clientX - lastX) * .55;
    lastX = e.clientX;
    render();
  };
  const up = () => {
    dragging = false;
    stage.classList.remove('dragging');
  };

  stage.addEventListener('pointerdown', down);
  addEventListener('pointermove', move);
  addEventListener('pointerup', up);
  toggle.addEventListener('click', () => {
    playing = !playing;
    toggle.textContent = playing ? 'PAUSE' : 'PLAY';
  });

  ctx = { raf: 0, stage, down, move, up };
  render();
  ctx.raf = requestAnimationFrame(tick);
}
