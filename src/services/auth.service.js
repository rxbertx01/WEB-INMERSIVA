import { KEYS, read, write, remove } from './storage.js';
import { normalizar, validar } from '../models/index.js';
import { ROL_APP, ROL_MODELO } from '../models/constantes.js';
import { sha } from '../utils.js';
import * as bitacora from './bitacora.service.js';

/** Demo accounts keep working without a backend; registered ones live in vx_accts. */
export const DEMO = {
  client: { email: 'cliente@vx.com', pass: 'cliente123', name: 'ALEX CLIENT', role: 'client' },
  vendedor: { email: 'vendedor@vx.com', pass: 'vendedor123', name: 'VENDEDOR VX', role: 'vendedor' },
  admin: { email: 'admin@vx.com', pass: 'admin1234', name: 'ADMIN VX', role: 'admin' }
};

const demoDe = email => Object.values(DEMO).find(item => item.email === email) || null;

/** Accepts both the legacy `{ [email]: { n, h } }` map and canonical user docs. */
function accounts() {
  const raw = read(KEYS.accts, {});
  const entries = Array.isArray(raw)
    ? raw.map(acc => [acc.email, acc])
    : Object.entries(raw || {});
  const out = {};
  for (const [clave, value = {}] of entries) {
    const email = value.email || clave;
    out[email] = normalizar('usuarios', {
      id: value.id || email,
      email,
      passwordHash: value.passwordHash || value.h || '',
      nombre: value.nombre || value.n || email.split('@')[0],
      rol: value.rol || 'CLIENTE',
      activo: value.activo !== false,
      creadoEn: value.creadoEn,
      actualizadoEn: value.actualizadoEn
    });
  }
  return out;
}

const persistir = all => write(KEYS.accts, all);

function resultado(role, name, email, usuarioId = email) {
  return {
    ok: true,
    role,
    rol: ROL_MODELO[role] || 'INVITADO',
    name,
    email,
    usuarioId
  };
}

/** Current session in the shape the app controller needs. No side effects. */
export function session() {
  const email = read(KEYS.sess, '');
  if (!email) return { role: 'guest', rol: 'INVITADO', name: '', email: '', usuarioId: '' };

  const demo = demoDe(email);
  if (demo) return resultado(demo.role, demo.name, email);

  const acc = accounts()[email];
  if (!acc || acc.activo === false) return { role: 'guest', rol: 'INVITADO', name: '', email: '', usuarioId: '' };
  return resultado(ROL_APP[acc.rol] || 'client', acc.nombre, email, acc.id);
}

/** Minimal actor snapshot for guards and the audit log. */
export function actorActual() {
  const actual = session();
  return {
    id: actual.usuarioId || actual.email || 'sistema',
    email: actual.email,
    rol: actual.rol
  };
}

export async function login(email, password) {
  const demo = demoDe(email);
  if (demo) {
    if (password !== demo.pass) return { ok: false, mensaje: 'Contraseña incorrecta.' };
    write(KEYS.sess, email);
    bitacora.registrar({
      accion: 'LOGIN', entidad: 'USUARIO', entidadId: email,
      detalle: `Acceso demo ${demo.role}`
    }, { id: email, email });
    return resultado(demo.role, demo.name, email);
  }

  const acc = accounts()[email];
  if (!acc) return { ok: false, mensaje: 'No existe cuenta con ese email. Regístrate.' };
  if (acc.activo === false) return { ok: false, mensaje: 'Esta cuenta está inactiva.' };

  const coincide = acc.passwordHash === await sha(`${email}:${password}`);
  if (!coincide) return { ok: false, mensaje: 'Contraseña incorrecta.' };

  write(KEYS.sess, email);
  bitacora.registrar({
    accion: 'LOGIN', entidad: 'USUARIO', entidadId: email, detalle: 'Acceso local'
  }, { id: email, email });
  return resultado(ROL_APP[acc.rol] || 'client', acc.nombre, email, acc.id);
}

export async function registrar({ email, password, nombre }) {
  const all = accounts();
  if (all[email]) return { ok: false, mensaje: 'Ese email ya está registrado.' };

  const acc = normalizar('usuarios', {
    id: email,
    email,
    passwordHash: await sha(`${email}:${password}`),
    nombre: nombre || email.split('@')[0],
    rol: 'CLIENTE',
    activo: true
  });
  const errores = validar('usuarios', acc);
  if (errores.length) return { ok: false, mensaje: errores[0], error: 'VALIDACION' };

  all[email] = acc;
  if (!persistir(all)) {
    return { ok: false, mensaje: 'No se pudo guardar la cuenta en este navegador.', error: 'STORAGE' };
  }
  write(KEYS.sess, email);
  bitacora.registrar({
    accion: 'CREAR', entidad: 'USUARIO', entidadId: email, detalle: 'Registro local'
  }, { id: email, email });
  return resultado('client', acc.nombre, email, acc.id);
}

export function logout() {
  const actual = session();
  if (actual.role !== 'guest') {
    bitacora.registrar({
      accion: 'LOGOUT', entidad: 'USUARIO', entidadId: actual.email, detalle: 'Cierre de sesión'
    }, { id: actual.usuarioId || actual.email, email: actual.email });
  }
  remove(KEYS.sess);
  return { ok: true };
}
