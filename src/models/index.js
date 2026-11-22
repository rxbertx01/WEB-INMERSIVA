import { usuarios } from './usuarios.model.js';
import { clientes } from './clientes.model.js';
import { categorias } from './categorias.model.js';
import { productos } from './productos.model.js';
import { variantes } from './variantes.model.js';
import { pedidos } from './pedidos.model.js';
import { bitacora } from './bitacora.model.js';

/** Registry of every declarative schema (Mongoose-like, without the driver). */
export const MODELOS = { usuarios, clientes, categorias, productos, variantes, pedidos, bitacora };

export const getModel = nombre => MODELOS[nombre] || null;

const ahora = () => new Date().toISOString();

/** Applies defaults and timestamps without dropping legacy fields. */
export function normalizar(nombre, datos = {}) {
  const modelo = getModel(nombre);
  if (!modelo) return { ...datos };
  const out = { ...datos };
  for (const [campo, def] of Object.entries(modelo.fields)) {
    if (out[campo] !== undefined && out[campo] !== null) continue;
    if (typeof def.default === 'function') out[campo] = def.default();
    else if ('default' in def) out[campo] = def.default;
  }
  if (modelo.timestamps) {
    out.creadoEn = out.creadoEn || ahora();
    out.actualizadoEn = ahora();
  }
  return out;
}

/** Returns validation errors; an empty array means the document is valid. */
export function validar(nombre, datos = {}) {
  const modelo = getModel(nombre);
  if (!modelo) return ['Modelo desconocido'];
  const errores = [];
  for (const [campo, def] of Object.entries(modelo.fields)) {
    const valor = datos[campo];
    const vacio = valor === undefined || valor === null || valor === '';
    if (def.required && vacio) {
      errores.push(`${campo} es obligatorio`);
      continue;
    }
    if (vacio) continue;
    if (def.enum && !def.enum.includes(valor)) {
      errores.push(`${campo} debe ser uno de: ${def.enum.join(', ')}`);
    }
    if (def.type === 'number' && (Number.isNaN(Number(valor)) || Number(valor) < 0)) {
      errores.push(`${campo} debe ser un número mayor o igual a 0`);
    }
    if (def.type === 'array' && !Array.isArray(valor)) {
      errores.push(`${campo} debe ser una lista`);
    }
  }
  return errores;
}

/** Removes fields declared with select:false (e.g. passwordHash). */
export function publico(nombre, datos = {}) {
  const modelo = getModel(nombre);
  if (!modelo) return { ...datos };
  const out = { ...datos };
  for (const [campo, def] of Object.entries(modelo.fields)) {
    if (def.select === false) delete out[campo];
  }
  return out;
}
