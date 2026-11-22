import { BASE, SIZES } from '../config.js';
import { KEYS, read, write } from './storage.js';
import { normalizar, validar } from '../models/index.js';

const STOCK_BASE = 12;
const STOCK_CUSTOM = 10;

/** SKUs are deterministic so legacy stock can be regenerated from the catalog. */
export function skuDe(productoId, talla, color = 'VX') {
  const limpio = String(color || 'VX').replace(/[^a-z0-9]/gi, '').toUpperCase() || 'VX';
  return `${productoId}-${talla}-${limpio}`.toUpperCase();
}

function leer() {
  const raw = read(KEYS.variantes, []);
  return Array.isArray(raw) ? raw : [];
}

const escribir = docs => write(KEYS.variantes, docs);

function docVariante(productoId, talla, color, stock, precio) {
  return normalizar('variantes', {
    sku: skuDe(productoId, talla, color),
    productoId,
    talla,
    color: String(color || 'VX'),
    stock: Math.max(0, Math.round(Number(stock) || 0)),
    precio: Number(precio) || 0,
    activo: true
  });
}

function upsert(docs, doc) {
  const indice = docs.findIndex(item => item.sku === doc.sku);
  if (indice >= 0) docs[indice] = { ...docs[indice], ...doc, activo: true };
  else docs.push(doc);
}

/** Seeds base garments and legacy customs on first use. */
export function sembrar() {
  const docs = leer();
  if (docs.length) return docs;

  const creados = [];
  BASE.forEach(g => {
    const tallas = Array.isArray(g.sizes) && g.sizes.length ? g.sizes : SIZES;
    tallas.forEach(talla => creados.push(docVariante(g.id, talla, g.colour, STOCK_BASE, g.price)));
  });

  const customs = read(KEYS.customs, []);
  if (Array.isArray(customs)) {
    customs.forEach(g => {
      if (!g || g.activo === false) return;
      const tallas = g.tallas || g.sizes || ['M'];
      tallas.forEach(talla => creados.push(
        docVariante(g.id, talla, g.colorNombre || g.colour, STOCK_CUSTOM, g.price)
      ));
    });
  }

  escribir(creados);
  return creados;
}

export function todas() {
  return sembrar().map(doc => ({ ...doc }));
}

/** Restores a raw snapshot; used to roll back a failed catalog write. */
export function restaurar(docs = []) {
  return escribir(docs.map(doc => ({ ...doc })));
}

export function listar(productoId) {
  const docs = sembrar().filter(doc => doc.activo !== false);
  return productoId ? docs.filter(doc => doc.productoId === productoId) : docs;
}

export function disponible(productoId, talla, color = 'VX') {
  if (!productoId) return 0;
  const sku = skuDe(productoId, talla || 'M', color);
  const doc = sembrar().find(item => item.sku === sku && item.activo !== false);
  return doc ? Number(doc.stock) || 0 : 0;
}

export function totalProducto(productoId) {
  return listar(productoId).reduce((suma, doc) => suma + (Number(doc.stock) || 0), 0);
}

/** Stock shown in management panels: one size, not the sum across all sizes. */
export function stockPorTalla(productoId) {
  const stocks = listar(productoId).map(doc => Number(doc.stock) || 0);
  return stocks.length ? Math.max(...stocks) : 0;
}

/** Creates/updates the variants of a newly published product. */
export function crearParaProducto(producto = {}, stock = STOCK_CUSTOM) {
  const docs = sembrar();
  const tallas = Array.isArray(producto.tallas) && producto.tallas.length ? producto.tallas : ['M'];
  tallas.forEach(talla => upsert(docs, docVariante(
    producto.id, talla, producto.colorNombre || 'VX', stock, producto.precio
  )));
  return { ok: escribir(docs), variantes: listar(producto.id) };
}

/** Soft delete keeps the stock history but hides the variants. */
export function bajaProducto(productoId) {
  const docs = sembrar().map(doc => doc.productoId === productoId
    ? { ...doc, activo: false }
    : doc);
  return { ok: escribir(docs) };
}

function aplicarCambios(docs, cambios, signo) {
  cambios.forEach(({ sku, qty }) => {
    const doc = docs.find(item => item.sku === sku);
    if (doc) doc.stock = Math.max(0, (Number(doc.stock) || 0) + signo * qty);
  });
  return escribir(docs);
}

function aplicar(items = [], signo) {
  const docs = sembrar();
  const resumen = new Map();

  for (const item of items) {
    const productoId = item.g?.id || item.productoId || item.id;
    const talla = item.z || item.size || item.talla || 'M';
    const color = item.g?.colour || item.color || 'VX';
    const qty = Math.max(0, Number(item.q ?? item.qty ?? item.cantidad ?? 1));
    const sku = skuDe(productoId, talla, color);
    const actual = resumen.get(sku) || { sku, productoId, talla, qty: 0 };
    actual.qty += qty;
    resumen.set(sku, actual);
  }

  const cambios = [];
  for (const cambio of resumen.values()) {
    const doc = docs.find(v => v.sku === cambio.sku && v.activo !== false);

    if (!doc) {
      return { ok: false, code: 404, mensaje: `Sin variante para ${cambio.productoId} talla ${cambio.talla}.` };
    }
    if (signo < 0 && (Number(doc.stock) || 0) < cambio.qty) {
      return {
        ok: false,
        code: 409,
        mensaje: `Stock insuficiente para ${cambio.productoId} talla ${cambio.talla}.`
      };
    }
    cambios.push({ sku: cambio.sku, qty: cambio.qty });
  }

  if (!aplicarCambios(docs, cambios, signo)) {
    return { ok: false, code: 500, mensaje: 'No se pudo actualizar el stock.' };
  }
  return { ok: true, cambios };
}

/** Reserves stock for a checkout and exposes a rollback for failed writes. */
export function descontar(items = []) {
  const resultado = aplicar(items, -1);
  if (!resultado.ok) return resultado;
  return {
    ok: true,
    cambios: resultado.cambios,
    rollback: () => aplicarCambios(sembrar(), resultado.cambios, +1)
  };
}

/** Test/admin helper: validates a document against the variantes schema. */
export function validarVariante(doc = {}) {
  return validar('variantes', normalizar('variantes', doc));
}
