// Bus de eventos-minúsculo para desacoplar módulos sin importaciones circulares.
const listeners = new Map();

export function on(type, fn) {
  if (!listeners.has(type)) listeners.set(type, new Set());
  listeners.get(type).add(fn);
  return () => listeners.get(type)?.delete(fn);
}

export function emit(type, detail) {
  listeners.get(type)?.forEach(fn => {
    try { fn(detail); } catch (err) { console.error(`[bus:${type}]`, err); }
  });
}
