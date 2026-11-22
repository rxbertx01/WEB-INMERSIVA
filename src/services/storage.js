import { MODELOS } from '../models/index.js';

/** localStorage keys kept unchanged so existing demo data keeps working. */
export const KEYS = {
  sess: 'vx_sess',
  accts: 'vx_accts',
  profiles: 'vx_profiles',
  categorias: 'vx_categorias',
  customs: 'vx_customs',
  productos: 'vx_productos',
  variantes: 'vx_variantes',
  pedidos: 'vx_orders',
  bitacora: 'vx_bitacora',
  settings: 'vx_settings',
  bag: 'vx_bag',
  cuenta: 'vx_cuenta'
};

/** Single gateway to storage: every module reads and writes through here. */
export function read(key, fallback = null) {
  try {
    const raw = localStorage.getItem(key);
    if (raw === null) return fallback;
    try { return JSON.parse(raw); }
    catch {
      // Legacy sessions were stored as a plain, unquoted string.
      return typeof fallback === 'string' ? raw : fallback;
    }
  } catch {
    return fallback;
  }
}

/** Returns false on quota/private-mode failures so callers can react. */
export function write(key, value) {
  try {
    localStorage.setItem(key, JSON.stringify(value));
    return true;
  } catch {
    return false;
  }
}

export function remove(key) {
  try { localStorage.removeItem(key); return true; } catch { return false; }
}

export const readModel = (nombre, fallback = null) => read(MODELOS[nombre]?.collection, fallback);
export const writeModel = (nombre, value) => write(MODELOS[nombre]?.collection, value);
