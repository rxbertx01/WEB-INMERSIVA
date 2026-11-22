import { KEYS, read, write } from './storage.js';
import { normalizar, validar } from '../models/index.js';
import { S } from '../state.js';
import { autorizarAdmin } from './permisos.js';

const MAX = 500;

const nuevoId = () => 'b' + Date.now().toString(36) + Math.random().toString(36).slice(2, 7);

function actorDe(actor = {}) {
  const email = actor.email || actor.usuarioEmail || S.email || '';
  return {
    usuarioId: actor.id || actor.usuarioId || email || 'sistema',
    usuarioEmail: email
  };
}

/**
 * Appends one audit entry. No update/delete is ever exposed.
 * Returns the stored entry, or null when the payload does not match the model.
 */
export function registrar(datos = {}, actor = {}) {
  const entrada = normalizar('bitacora', {
    id: nuevoId(),
    ...actorDe(actor),
    accion: datos.accion,
    entidad: datos.entidad,
    entidadId: String(datos.entidadId ?? ''),
    estadoAnterior: datos.estadoAnterior ?? null,
    estadoNuevo: datos.estadoNuevo ?? null,
    detalle: datos.detalle ?? '',
    fecha: datos.fecha || new Date().toISOString()
  });

  if (validar('bitacora', entrada).length) return null;
  const actual = read(KEYS.bitacora, []);
  const lista = Array.isArray(actual) ? actual : [];
  write(KEYS.bitacora, [entrada, ...lista].slice(0, MAX));
  return entrada;
}

export function listar(actor = {}) {
  const denegado = autorizarAdmin(actor);
  if (denegado) return denegado;
  const actual = read(KEYS.bitacora, []);
  return Array.isArray(actual) ? actual : [];
}

export function deEntidad(entidad, entidadId, actor = {}) {
  const entradas = listar(actor);
  if (!Array.isArray(entradas)) return entradas;
  return entradas.filter(entry => entry.entidad === entidad && entry.entidadId === entidadId);
}
