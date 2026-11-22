import { KEYS, read, write } from './storage.js';

/** Preferencias locales del panel de cuenta. Nunca guarda números completos. */
const VACIO = () => ({ favoritos: [], tarjetas: [], banco: [] });

function leer() {
  const raw = read(KEYS.cuenta, {}) || {};
  return {
    favoritos: Array.isArray(raw.favoritos) ? raw.favoritos.slice() : [],
    tarjetas: Array.isArray(raw.tarjetas) ? raw.tarjetas.slice() : [],
    banco: Array.isArray(raw.banco) ? raw.banco.slice() : []
  };
}

function guardar(datos) {
  if (!write(KEYS.cuenta, datos)) throw new Error('No se pudo guardar en este navegador.');
  return datos;
}

const ultimos4 = value => String(value ?? '').replace(/\D/g, '').slice(-4);
const id = prefijo => prefijo + Date.now();

export function listar() {
  return leer();
}

export function alternarFavorito(productoId) {
  const clave = String(productoId || '');
  if (!clave) return leer().favoritos;
  const datos = leer();
  datos.favoritos = datos.favoritos.includes(clave)
    ? datos.favoritos.filter(x => x !== clave)
    : [...datos.favoritos, clave];
  return guardar(datos).favoritos;
}

export function agregarTarjeta({ alias, ultimos } = {}) {
  const nombre = String(alias || '').trim().toUpperCase();
  const digits = ultimos4(ultimos);
  if (!nombre || digits.length !== 4) {
    return { ok: false, mensaje: 'Escribe un alias y los últimos 4 dígitos.' };
  }
  const datos = leer();
  datos.tarjetas.push({ id: id('t'), alias: nombre, ultimos: digits });
  guardar(datos);
  return { ok: true };
}

export function eliminarTarjeta(idTarjeta) {
  const datos = leer();
  datos.tarjetas = datos.tarjetas.filter(t => t.id !== idTarjeta);
  guardar(datos);
  return { ok: true };
}

export function agregarBanco({ titular, ultimos } = {}) {
  const nombre = String(titular || '').trim().toUpperCase();
  const digits = ultimos4(ultimos);
  if (!nombre || digits.length !== 4) {
    return { ok: false, mensaje: 'Escribe el titular y los últimos 4 dígitos.' };
  }
  const datos = leer();
  datos.banco.push({ id: id('b'), titular: nombre, ultimos: digits });
  guardar(datos);
  return { ok: true };
}

export function eliminarBanco(idBanco) {
  const datos = leer();
  datos.banco = datos.banco.filter(b => b.id !== idBanco);
  guardar(datos);
  return { ok: true };
}

export const cuenta = {
  listar, alternarFavorito,
  agregarTarjeta, eliminarTarjeta,
  agregarBanco, eliminarBanco
};
