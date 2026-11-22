import { S } from '../state.js';
import { KEYS, read, write } from './storage.js';
import { normalizar, validar } from '../models/index.js';
import {
  ESTADOS_PEDIDO, ETIQUETAS_ESTADO, TRANSICIONES_PEDIDO,
  estadoDesdeLegacy, indiceFlujo
} from '../models/constantes.js';
import * as bitacora from './bitacora.service.js';
import { autorizarCatalogo } from './permisos.js';
import * as variantes from './variantes.service.js';

const ahora = () => new Date().toISOString();

// Pedidos de ejemplo: misma vista de siempre, ahora con estado canónico.
const SAMPLE = [
  {
    id: 'VX-482915', tracking: 'VX92847163',
    date: new Date(Date.now() - 2 * 86400000).toISOString(),
    user: 'ALEX CLIENT', email: 'cliente@vx.com', estado: 'ENVIADO', status: 2,
    items: [{ id: 'b1', name: 'Tech Bomber MA-2', price: 340, size: 'M', qty: 1, color: 'OLIVE' }],
    total: 340
  },
  {
    id: 'VX-730184', tracking: 'VX10482736',
    date: new Date(Date.now() - 21 * 86400000).toISOString(),
    user: 'ALEX CLIENT', email: 'cliente@vx.com', estado: 'ENTREGADO', status: 3,
    items: [
      { id: 'h1', name: 'Boxy Hoodie 01', price: 180, size: 'L', qty: 1, color: 'ASH' },
      { id: 'c2', name: 'Parachute Cargo', price: 190, size: 'M', qty: 1, color: 'SAND' }
    ],
    total: 370
  },
  {
    id: 'VX-118660', tracking: 'VX55619024',
    date: new Date(Date.now() - 5 * 86400000).toISOString(),
    user: 'ADMIN VX', email: 'admin@vx.com', estado: 'PAGADO', status: 1,
    items: [{ id: 'o2', name: 'Trench Obsidian', price: 560, size: 'M', qty: 1, color: 'OBSIDIAN' }],
    total: 560
  }
];

function itemCanonico(item = {}) {
  const cantidad = Number(item.q ?? item.qty ?? item.cantidad ?? 1) || 1;
  const precio = Number(item.g?.price ?? item.price ?? item.precioUnitario ?? 0) || 0;
  const productoId = item.g?.id || item.id || item.productoId || '';
  const nombre = item.g?.name || item.name || item.nombre || '';
  const talla = item.z || item.size || item.talla || 'M';
  return {
    productoId, nombre, talla,
    color: item.color || item.g?.colour || '',
    cantidad,
    precioUnitario: precio,
    subtotal: Number(item.subtotal ?? precio * cantidad),
    id: productoId, name: nombre, price: precio, size: talla, qty: cantidad
  };
}

function canonico(raw = {}) {
  const estado = estadoDesdeLegacy(raw.estado ?? raw.status);
  const fecha = raw.date || raw.creadoEn || ahora();
  return normalizar('pedidos', {
    ...raw,
    id: raw.id,
    clienteId: raw.clienteId ?? null,
    clienteEmail: raw.email || raw.clienteEmail || '',
    clienteNombre: raw.user || raw.clienteNombre || 'Invitado',
    items: (Array.isArray(raw.items) ? raw.items : []).map(itemCanonico),
    total: Number(raw.total ?? 0),
    estado,
    status: raw.status ?? indiceFlujo(estado),
    tracking: raw.tracking || 'VX' + Date.now().toString().slice(-8),
    direccion: raw.direccion ?? null,
    historial: Array.isArray(raw.historial) ? raw.historial : [],
    date: fecha,
    creadoEn: raw.creadoEn || fecha,
    user: raw.user || raw.clienteNombre || 'Invitado',
    email: raw.email || raw.clienteEmail || '',
    activo: raw.activo !== false
  });
}

/** Legacy `status`, `user` and `email` mirrors keep every existing view working. */
export function paraVista(doc = {}) {
  const estado = estadoDesde(doc.estado ?? doc.status);
  return {
    ...doc,
    id: doc.id,
    user: doc.clienteNombre || doc.user || 'Invitado',
    email: doc.clienteEmail || doc.email || '',
    date: doc.date || doc.creadoEn,
    estado,
    etiqueta: ETIQUETAS_ESTADO[estado],
    status: doc.status ?? indiceFlujo(estado),
    items: (doc.items || []).map(item => ({
      id: item.productoId || item.id,
      name: item.nombre || item.name,
      price: item.precioUnitario ?? item.price,
      size: item.talla || item.size,
      qty: item.cantidad ?? item.qty,
      color: item.color
    }))
  };
}

export function estadoDesde(value) {
  if (typeof value === 'number') return estadoDesdeLegacy(value);
  if (ESTADOS_PEDIDO.includes(value)) return value;
  const porEtiqueta = Object.fromEntries(
    Object.entries(ETIQUETAS_ESTADO).map(([estado, etiqueta]) => [etiqueta, estado])
  );
  return porEtiqueta[value] || estadoDesdeLegacy(value);
}

export const estadoDe = pedido => estadoDesde(pedido?.estado ?? pedido?.status);

function leerDocs() {
  const raw = read(KEYS.pedidos, null);
  if (Array.isArray(raw) && raw.length) return raw.map(canonico);
  const docs = SAMPLE.map(canonico);
  write(KEYS.pedidos, docs);
  return docs;
}

function sincronizar(docs) {
  S.orders = docs.map(paraVista);
}

export function vistas() {
  const docs = leerDocs();
  sincronizar(docs);
  return S.orders;
}

export function load() {
  return vistas();
}

export function todos() {
  return vistas();
}

export function mios(email) {
  return vistas().filter(order => email
    ? order.email === email
    : !order.email);
}

export function crear({ items = [], total = 0, user, email, usuarioId, direccion } = {}) {
  const docs = leerDocs();
  const fecha = ahora();
  const nombre = user || 'Invitado';
  const doc = normalizar('pedidos', {
    id: 'VX-' + Math.floor(Math.random() * 9e5 + 1e5),
    tracking: 'VX' + Date.now().toString().slice(-8),
    date: fecha,
    creadoEn: fecha,
    clienteId: usuarioId || email || null,
    clienteEmail: email || '',
    clienteNombre: nombre,
    items: items.map(itemCanonico),
    total: Number(total) || 0,
    estado: 'PENDIENTE',
    status: 0,
    direccion: direccion || null,
    historial: [{ estado: 'PENDIENTE', fecha, usuarioId: usuarioId || email || 'sistema' }],
    user: nombre,
    email: email || '',
    activo: true
  });

  const errores = validar('pedidos', doc);
  if (errores.length) return { ok: false, code: 400, mensaje: errores[0] };

  // Fase 2: stock is reserved before the order is written; 409 aborts the checkout.
  const reserva = variantes.descontar(items);
  if (!reserva.ok) return { ok: false, code: reserva.code, mensaje: reserva.mensaje };

  docs.unshift(doc);
  if (!write(KEYS.pedidos, docs)) {
    reserva.rollback();
    return { ok: false, code: 500, mensaje: 'No se pudo guardar el pedido en este navegador.' };
  }
  sincronizar(docs);
  bitacora.registrar({
    accion: 'CREAR', entidad: 'PEDIDO', entidadId: doc.id,
    detalle: `Pedido ${doc.id} · total ${doc.total}`
  }, { id: usuarioId || email, email });
  return { ok: true, pedido: paraVista(doc) };
}

/** Enforces the documented transition table; invalid changes return code 409. */
export function cambiarEstado(id, estadoEntrada, actor = {}) {
  const denegado = autorizarCatalogo(actor);
  if (denegado) return denegado;

  const docs = leerDocs();
  const indice = docs.findIndex(doc => doc.id === id);
  if (indice < 0) return { ok: false, code: 404, mensaje: 'Pedido no encontrado.' };

  const nuevo = estadoDesde(estadoEntrada);
  const anterior = estadoDe(docs[indice]);
  if (!ESTADOS_PEDIDO.includes(nuevo)) {
    return { ok: false, code: 400, mensaje: 'Estado de pedido no válido.' };
  }
  if (nuevo === anterior) {
    return { ok: true, pedido: paraVista(docs[indice]), sinCambio: true };
  }
  if (!TRANSICIONES_PEDIDO[anterior]?.includes(nuevo)) {
    return { ok: false, code: 409, mensaje: 'Transición de estado no permitida.' };
  }

  const fecha = ahora();
  const doc = normalizar('pedidos', {
    ...docs[indice],
    estado: nuevo,
    status: indiceFlujo(nuevo),
    historial: [
      ...(docs[indice].historial || []),
      { estado: nuevo, fecha, usuarioId: actor.id || actor.email || 'sistema' }
    ]
  });
  docs[indice] = doc;
  if (!write(KEYS.pedidos, docs)) {
    return { ok: false, code: 500, mensaje: 'No se pudo guardar el cambio de estado.' };
  }
  sincronizar(docs);
  bitacora.registrar({
    accion: 'CAMBIAR_ESTADO', entidad: 'PEDIDO', entidadId: doc.id,
    estadoAnterior: anterior, estadoNuevo: nuevo,
    detalle: `${ETIQUETAS_ESTADO[anterior]} → ${ETIQUETAS_ESTADO[nuevo]}`
  }, actor);
  return { ok: true, pedido: paraVista(doc) };
}

/** Namespace alias used by the view controllers. */
export const pedidos = {
  load, vistas, todos, mios, crear, cambiarEstado, estadoDe, estadoDesde, paraVista
};
