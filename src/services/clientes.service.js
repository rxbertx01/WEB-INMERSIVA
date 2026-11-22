import { KEYS, read, write } from './storage.js';
import { normalizar } from '../models/index.js';
import * as bitacora from './bitacora.service.js';
import { autorizarCliente } from './permisos.js';

/** Stored docs are canonical; the views keep the camelCase shape the panel already uses. */
function direccionCanonica(a = {}) {
  return {
    id: a.id || 'a' + Date.now(),
    etiqueta: String(a.etiqueta ?? a.label ?? '').toUpperCase(),
    calle: a.calle ?? a.street ?? '',
    ciudad: a.ciudad ?? a.city ?? '',
    cp: String(a.cp ?? a.zip ?? ''),
    pais: a.pais ?? a.country ?? 'MX',
    principal: Boolean(a.principal ?? a.main ?? false)
  };
}

const direccionVista = a => ({
  id: a.id,
  label: a.etiqueta,
  street: a.calle,
  city: a.ciudad,
  zip: a.cp,
  country: a.pais,
  main: Boolean(a.principal)
});

function canonico(email, raw = {}, nombreFallback = '') {
  const direcciones = raw.direcciones || raw.addresses || [];
  return normalizar('clientes', {
    id: raw.id || email,
    usuarioId: raw.usuarioId || email,
    nombre: raw.nombre || raw.name || nombreFallback,
    email: raw.email || email,
    telefono: raw.telefono ?? raw.phone ?? '',
    direcciones: (Array.isArray(direcciones) ? direcciones : []).map(direccionCanonica),
    activo: raw.activo !== false,
    creadoEn: raw.creadoEn,
    actualizadoEn: raw.actualizadoEn
  });
}

const vista = doc => ({
  name: doc.nombre,
  email: doc.email,
  phone: doc.telefono || '',
  addresses: (doc.direcciones || []).map(direccionVista)
});

function cargar() {
  const raw = read(KEYS.profiles, {});
  const pares = Array.isArray(raw)
    ? raw.map(doc => [doc.email, doc])
    : Object.entries(raw || {});
  const out = {};
  let migrar = Array.isArray(raw);
  for (const [clave, value = {}] of pares) {
    const email = value.email || clave;
    if (!('direcciones' in value) || !('nombre' in value)) migrar = true;
    out[email] = canonico(email, value);
  }
  if (migrar) write(KEYS.profiles, out);
  return out;
}

function persistir(all) {
  if (!write(KEYS.profiles, all)) throw new Error('No se pudo guardar en este navegador.');
}

function actualizar(email, mutar, actor, detalle) {
  const all = cargar();
  const doc = all[email] || canonico(email, {}, email.split('@')[0]);
  mutar(doc);
  all[email] = normalizar('clientes', doc);
  persistir(all);
  if (detalle) {
    bitacora.registrar({
      accion: 'EDITAR', entidad: 'CLIENTE', entidadId: email, detalle
    }, actor);
  }
  return vista(all[email]);
}

export function obtener(email, nombreFallback = '') {
  const all = cargar();
  if (!all[email]) {
    // Same demo seed the account panel used before the service refactor.
    const semilla = email === 'cliente@vx.com'
      ? {
          id: email,
          usuarioId: email,
          nombre: nombreFallback || 'Alex Client',
          email,
          telefono: '+52 55 0102 0304',
          direcciones: [{
            id: 'a1', etiqueta: 'HOME', calle: 'Av. Revolución 12',
            ciudad: 'CDMX', cp: '03100', pais: 'MX', principal: true
          }],
          activo: true
        }
      : {};
    all[email] = canonico(email, semilla, nombreFallback || email.split('@')[0]);
    persistir(all);
  }
  return vista(all[email]);
}

export function guardarPerfil(email, { name, phone } = {}, actor = {}) {
  const denegado = autorizarCliente(actor, email);
  if (denegado) return denegado;
  return actualizar(email, doc => {
    if (name !== undefined) doc.nombre = String(name).trim() || doc.nombre;
    if (phone !== undefined) doc.telefono = String(phone).trim();
  }, actor, 'Perfil actualizado');
}

export function agregarDireccion(email, datos = {}, actor = {}) {
  const denegado = autorizarCliente(actor, email);
  if (denegado) return denegado;
  const actual = obtener(email);
  const direccion = direccionCanonica({
    ...datos,
    id: 'a' + Date.now(),
    principal: actual.addresses.length === 0
  });
  return actualizar(email, doc => {
    doc.direcciones = [...(doc.direcciones || []), direccion];
  }, actor, `Dirección agregada · ${direccion.etiqueta}`);
}

export function actualizarDireccion(email, id, datos = {}, actor = {}) {
  const denegado = autorizarCliente(actor, email);
  if (denegado) return denegado;
  const anterior = obtener(email).addresses.find(a => a.id === id);
  const direccion = direccionCanonica({ ...datos, id, main: anterior?.main });
  return actualizar(email, doc => {
    doc.direcciones = (doc.direcciones || []).map(a => a.id === id ? direccion : a);
  }, actor, `Dirección actualizada · ${direccion.etiqueta}`);
}

export function fijarPrincipal(email, id, actor = {}) {
  const denegado = autorizarCliente(actor, email);
  if (denegado) return denegado;
  return actualizar(email, doc => {
    doc.direcciones = (doc.direcciones || []).map(a => ({ ...a, principal: a.id === id }));
  }, actor, 'Dirección principal cambiada');
}

export function eliminarDireccion(email, id, actor = {}) {
  const denegado = autorizarCliente(actor, email);
  if (denegado) return denegado;
  return actualizar(email, doc => {
    const restantes = (doc.direcciones || []).filter(a => a.id !== id).map(a => ({ ...a }));
    if (restantes.length && !restantes.some(a => a.principal)) restantes[0].principal = true;
    doc.direcciones = restantes;
  }, actor, 'Dirección eliminada');
}

/** Namespace alias used by the view controllers. */
export const clientes = {
  obtener, guardarPerfil, agregarDireccion,
  actualizarDireccion, fijarPrincipal, eliminarDireccion
};
