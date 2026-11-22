export const $ = sel => document.querySelector(sel);

export const money = n => '$' + Number(n || 0).toLocaleString('en-US', {
  minimumFractionDigits: 2, maximumFractionDigits: 2
});

const ENTITIES = { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' };

// Escapa cualquier texto que vaya a parar a un innerHTML.
export const esc = value => String(value ?? '').replace(/[&<>"']/g, ch => ENTITIES[ch]);

export function shade(hex, k) {
  const h = /^#[0-9a-f]{6}$/i.test(hex || '') ? hex : '#888888';
  const n = parseInt(h.slice(1), 16);
  const r = n >> 16, g = n >> 8 & 255, b = n & 255;
  const f = x => Math.max(0, Math.min(255, Math.round(x * k)));
  return '#' + ((1 << 24) + (f(r) << 16) + (f(g) << 8) + f(b)).toString(16).slice(1);
}

export async function sha(text) {
  if (!globalThis.crypto?.subtle) {
    throw new Error('El acceso requiere HTTPS o localhost (crypto.subtle no disponible).');
  }
  const bytes = new TextEncoder().encode(text);
  const digest = await globalThis.crypto.subtle.digest('SHA-256', bytes);
  return [...new Uint8Array(digest)].map(b => b.toString(16).padStart(2, '0')).join('');
}

// Comprime una imagen a WebP en base64, con tope de tamaño para localStorage.
export function loadImg(file, { max = 640, quality = .78, limit = 180000 } = {}) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onerror = () => reject(new Error('No se pudo leer el archivo'));
    reader.onload = () => {
      const im = new Image();
      im.onerror = () => reject(new Error('No se pudo leer la imagen'));
      im.onload = () => {
        let size = max, q = quality, out;
        do {
          const scale = Math.min(1, size / Math.max(im.width, im.height));
          const canvas = document.createElement('canvas');
          canvas.width = Math.round(im.width * scale);
          canvas.height = Math.round(im.height * scale);
          canvas.getContext('2d').drawImage(im, 0, 0, canvas.width, canvas.height);
          out = { img: canvas.toDataURL('image/webp', q), w: canvas.width, h: canvas.height };
          size *= .8;
          q -= .06;
        } while (out.img.length > limit && size > 140 && q > .3);
        if (out.img.length > limit) return reject(new Error('Imagen demasiado pesada'));
        resolve(out);
      };
      im.src = reader.result;
    };
    reader.readAsDataURL(file);
  });
}
