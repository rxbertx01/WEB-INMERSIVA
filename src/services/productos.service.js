import { BASE } from '../config.js';
import { KEYS, read, write } from './storage.js';
import { normalizar, validar } from '../models/index.js';
import { TRANSICIONES_PRODUCTO, ESTADOS_PRODUCTO } from '../models/constantes.js';
import { idDeTipo } from './categorias.service.js';
import * as bitacora from './bitacora.service.js';
import { autorizarCatalogo } from './permisos.js';
import * as variantes from './variantes.service.js';

/** Legacy garments and canonical product docs share the vx_customs key during Fase 1. */
function docDesdePrenda(g = {}) {
  const a = g.atributos3d || {};
  const img = a.img ?? g.img ?? null;
  const nombre = g.nombre || g.name || '';
  const precio = Number(g.precio ?? g.price ?? 0);
  return normalizar('productos', {
    ...g,
    id: g.id || 'c' + Date.now(),
    nombre,
    descripcion: g.descripcion ?? g.desc ?? '',
    precio,
    categoriaId: g.categoriaId || idDeTipo(g.type),
    imagenes: Array.isArray(g.imagenes) ? g.imagenes : (img ? [{ url: img, orden: 0 }] : []),
    color: g.color || '#888888',
    colorNombre: g.colorNombre || g.colour || 'ATELIER',
    tallas: g.tallas || g.sizes || ['M'],
    estado: ESTADOS_PRODUCTO.includes(g.estado) ? g.estado : 'DISPONIBLE',
    atributos3d: {
      img,
      w: a.w ?? g.w ?? 1,
      h: a.h ?? g.h ?? 1,
      frames: Array.isArray(a.frames) ? a.frames : (g.frames || []),
      velocidadGiro: a.velocidadGiro ?? 14,
      rack: a.rack || g.rack || 'right'
    },
    variantes: Array.isArray(g.variantes) ? g.variantes : [],
    activo: g.activo !== false,
    // Mirrors consumed by scene3d.js, viewer360.js and the existing cards.
    type: g.type,
    collection: g.collection,
    fabric: g.fabric,
    gsm: g.gsm,
    cut: g.cut,
    days: g.days,
    custom: g.custom ?? true,
    name: g.name || nombre,
    desc: g.desc ?? g.descripcion ?? '',
    price: precio,
    colour: g.colour || g.colorNombre || 'ATELIER',
    sizes: g.sizes || g.tallas || ['M'],
    img,
    w: a.w ?? g.w ?? 1,
    h: a.h ?? g.h ?? 1,
    frames: Array.isArray(a.frames) ? a.frames : (g.frames || []),
    rack: a.rack || g.rack
  });
}

export function prendaDesdeDoc(doc = {}) {
  const a = doc.atributos3d || {};
  return {
    id: doc.id,
    name: doc.nombre || doc.name,
    desc: doc.descripcion || doc.desc || '',
    price: Number(doc.precio ?? doc.price ?? 0),
    type: doc.type,
    collection: doc.collection,
    fabric: doc.fabric || 'Tejido seleccionado',
    gsm: doc.gsm ?? 400,
    cut: doc.cut || 'Regular fit',
    days: doc.days ?? 3,
    custom: doc.custom ?? true,
    color: doc.color || '#888888',
    colour: doc.colorNombre || doc.colour || 'ATELIER',
    sizes: Array.isArray(doc.tallas) && doc.tallas.length ? doc.tallas : (doc.sizes || ['M']),
    img: a.img ?? doc.img ?? null,
    w: a.w ?? doc.w ?? 1,
    h: a.h ?? doc.h ?? 1,
    frames: Array.isArray(a.frames) ? a.frames : (doc.frames || []),
    rack: a.rack || doc.rack,
    categoriaId: doc.categoriaId,
    estado: doc.estado || 'DISPONIBLE',
    activo: doc.activo !== false,
    stock: variantes.stockPorTalla(doc.id)
  };
}

function leerDocs() {
  const raw = read(KEYS.customs, []);
  const items = Array.isArray(raw) ? raw : [];
  const docs = items.map(docDesdePrenda);
  if (items.some(g => !g.atributos3d || !g.nombre)) write(KEYS.customs, docs);
  return docs;
}

const escribirDocs = docs => write(KEYS.customs, docs);

export function listarCustoms() {
  return leerDocs()
    .filter(doc => doc.activo !== false)
    .map(prendaDesdeDoc);
}

export function crear(prenda = {}, actor = {}) {
  const denegado = autorizarCatalogo(actor);
  if (denegado) return denegado;

  const docs = leerDocs();
  const doc = docDesdePrenda({ ...prenda, custom: true });
  const errores = validar('productos', doc);
  if (errores.length) return { ok: false, code: 400, mensaje: errores[0] };

  const anteriores = [...docs];
  docs.push(doc);
  if (!escribirDocs(docs)) {
    return { ok: false, code: 500, mensaje: 'Sin espacio en el navegador: usa menos fotos o menos frames.' };
  }
  if (!variantes.crearParaProducto(doc, prenda.stock).ok) {
    escribirDocs(anteriores);
    return { ok: false, code: 500, mensaje: 'No se pudo guardar el stock del producto.' };
  }
  bitacora.registrar({
    accion: 'CREAR', entidad: 'PRODUCTO', entidadId: doc.id,
    estadoNuevo: doc.estado, detalle: `Prenda publicada · ${doc.nombre}`
  }, actor);
  return { ok: true, producto: prendaDesdeDoc(doc) };
}

/** Soft delete: the garment disappears from the showroom but stays in storage. */
export function eliminar(id, actor = {}) {
  const denegado = autorizarCatalogo(actor);
  if (denegado) return denegado;

  const docs = leerDocs();
  const doc = docs.find(item => item.id === id);
  if (!doc) return { ok: false, code: 404, mensaje: 'Prenda no encontrada.' };

  const anterior = doc.estado || 'DISPONIBLE';
  const snapshot = variantes.todas();
  doc.activo = false;
  doc.estado = 'INACTIVO';
  if (!escribirDocs(docs)) {
    return { ok: false, code: 500, mensaje: 'No se pudo eliminar la prenda.' };
  }
  if (!variantes.bajaProducto(id).ok) {
    doc.activo = true;
    doc.estado = anterior;
    escribirDocs(docs);
    variantes.restaurar(snapshot);
    return { ok: false, code: 500, mensaje: 'No se pudo dar de baja el stock.' };
  }
  bitacora.registrar({
    accion: 'ELIMINAR', entidad: 'PRODUCTO', entidadId: id,
    estadoAnterior: anterior, estadoNuevo: 'INACTIVO', detalle: `Baja de ${doc.nombre}`
  }, actor);
  return { ok: true };
}

export function precios() {
  const doc = read(KEYS.settings, {}) || {};
  return { ...(doc.prices || {}) };
}

function precioBase(id) {
  const prenda = [...BASE, ...listarCustoms()].find(g => g.id === id);
  return Number(prenda?.price ?? 0);
}

export function aplicarPrecios(prendas = []) {
  const prices = precios();
  prendas.forEach(g => {
    if (typeof prices[g.id] === 'number') g.price = prices[g.id];
  });
  return prendas;
}

export function fijarPrecio(id, valor, actor = {}) {
  const denegado = autorizarCatalogo(actor);
  if (denegado) return denegado;

  const doc = read(KEYS.settings, {}) || {};
  const prices = { ...(doc.prices || {}) };
  const precio = Math.max(0, Math.round(Number(valor) || 0));
  const anterior = typeof prices[id] === 'number' ? prices[id] : precioBase(id);
  if (anterior === precio) return { ok: true, settings: doc, cambio: false };

  prices[id] = precio;
  const next = { ...doc, prices };
  if (!write(KEYS.settings, next)) {
    return { ok: false, code: 500, mensaje: 'No se pudo guardar el precio.' };
  }
  bitacora.registrar({
    accion: 'CAMBIAR_PRECIO', entidad: 'PRODUCTO', entidadId: id,
    detalle: `precio ${anterior} → ${precio}`
  }, actor);
  return { ok: true, settings: next, cambio: true };
}

export function ajustarPrecios(percent, actor = {}) {
  const denegado = autorizarCatalogo(actor);
  if (denegado) return denegado;

  const pct = Number(percent) || 0;
  const doc = read(KEYS.settings, {}) || {};
  const prices = { ...(doc.prices || {}) };
  const cambios = [];

  [...BASE, ...listarCustoms()].forEach(g => {
    const anterior = typeof prices[g.id] === 'number' ? prices[g.id] : Number(g.price || 0);
    const nuevo = Math.max(0, Math.round(anterior * (1 + pct / 100)));
    if (nuevo === anterior) return;
    prices[g.id] = nuevo;
    cambios.push({ id: g.id, anterior, nuevo });
  });

  if (!cambios.length) return { ok: true, settings: doc, cambios: [] };
  const next = { ...doc, prices };
  if (!write(KEYS.settings, next)) {
    return { ok: false, code: 500, mensaje: 'No se pudieron guardar los precios.' };
  }
  cambios.forEach(({ id, anterior, nuevo }) => bitacora.registrar({
    accion: 'CAMBIAR_PRECIO', entidad: 'PRODUCTO', entidadId: id,
    detalle: `ajuste ${pct}% · precio ${anterior} → ${nuevo}`
  }, actor));
  return { ok: true, settings: next, cambios };
}

/** Validated product transitions, ready for the Fase 2 catalog controls. */
export function estado(id, nuevo, actor = {}) {
  const denegado = autorizarCatalogo(actor);
  if (denegado) return denegado;
  if (!ESTADOS_PRODUCTO.includes(nuevo)) {
    return { ok: false, code: 400, mensaje: 'Estado de producto no válido.' };
  }
  const docs = leerDocs();
  const doc = docs.find(item => item.id === id);
  if (doc) {
    const anterior = doc.estado || 'DISPONIBLE';
    if (!TRANSICIONES_PRODUCTO[anterior]?.includes(nuevo)) {
      return { ok: false, code: 409, mensaje: 'Transición de producto no permitida.' };
    }
    doc.estado = nuevo;
    if (!escribirDocs(docs)) return { ok: false, code: 500, mensaje: 'No se pudo guardar el estado.' };
    bitacora.registrar({
      accion: 'CAMBIAR_ESTADO', entidad: 'PRODUCTO', entidadId: id,
      estadoAnterior: anterior, estadoNuevo: nuevo
    }, actor);
    return { ok: true, producto: prendaDesdeDoc(doc) };
  }

  const overrides = read(KEYS.productos, []);
  const lista = Array.isArray(overrides) ? overrides : [];
  const indice = lista.findIndex(item => item.id === id);
  const anterior = indice >= 0 ? lista[indice].estado : 'DISPONIBLE';
  if (!TRANSICIONES_PRODUCTO[anterior]?.includes(nuevo)) {
    return { ok: false, code: 409, mensaje: 'Transición de producto no permitida.' };
  }
  if (indice >= 0) lista[indice] = { ...lista[indice], estado: nuevo };
  else lista.push({ id, estado: nuevo });
  if (!write(KEYS.productos, lista)) return { ok: false, code: 500, mensaje: 'No se pudo guardar el estado.' };
  bitacora.registrar({
    accion: 'CAMBIAR_ESTADO', entidad: 'PRODUCTO', entidadId: id,
    estadoAnterior: anterior, estadoNuevo: nuevo
  }, actor);
  return { ok: true, producto: { id, estado: nuevo } };
}
