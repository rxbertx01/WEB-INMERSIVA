import { KEYS, read, write } from './storage.js';
import { normalizar, validar } from '../models/index.js';
import * as bitacora from './bitacora.service.js';
import { autorizarCatalogo } from './permisos.js';

const SEED = [
  { id: 'cat-outer', nombre: 'OUTERWEAR', slug: 'outer', descripcion: 'Bomber y abrigos del showroom.' },
  { id: 'cat-essential', nombre: 'ESSENTIALS', slug: 'essential', descripcion: 'Hoodies y cargo del showroom.' },
  { id: 'cat-accesorios', nombre: 'ACCESORIOS', slug: 'accesorios', descripcion: 'Reservado para la Fase 2.' }
];

const TYPE_SLUG = {
  bomber: 'outer',
  coat: 'outer',
  hoodie: 'essential',
  cargo: 'essential'
};

export const slugDeTipo = type => TYPE_SLUG[type] || 'essential';

/** Keeps the showroom filters and the explicit category collection in sync. */
export function listar() {
  const raw = read(KEYS.categorias, null);
  if (!Array.isArray(raw) || !raw.length) {
    const docs = SEED.map(c => normalizar('categorias', { ...c, activo: true }));
    write(KEYS.categorias, docs);
    return docs;
  }
  const docs = raw.map(c => normalizar('categorias', c)).filter(c => c.activo !== false);
  return docs.length ? docs : SEED.map(c => normalizar('categorias', { ...c, activo: true }));
}

export function categoryOf(g) {
  if (!g) return 'essential';
  if (g.categoriaId) {
    const cat = listar().find(c => c.id === g.categoriaId || c.slug === g.categoriaId);
    if (cat) return cat.slug;
  }
  return slugDeTipo(g.type);
}

export function idDeTipo(type) {
  const slug = slugDeTipo(type);
  return listar().find(c => c.slug === slug)?.id || `cat-${slug}`;
}

export function guardar(datos = {}, actor = {}) {
  const denegado = autorizarCatalogo(actor);
  if (denegado) return denegado;

  const actual = listar();
  const previo = actual.find(c => c.id === datos.id || c.slug === datos.slug);
  const doc = normalizar('categorias', {
    ...(previo || {}),
    ...datos,
    id: datos.id || previo?.id || 'cat-' + Date.now(),
    nombre: String(datos.nombre || previo?.nombre || '').toUpperCase(),
    slug: String(datos.slug || previo?.slug || '').toLowerCase()
  });
  if (validar('categorias', doc).length) {
    return { ok: false, mensaje: 'Categoría incompleta.', code: 400 };
  }
  const all = [...actual.filter(c => c.id !== doc.id), doc];
  if (!write(KEYS.categorias, all)) {
    return { ok: false, mensaje: 'No se pudo guardar la categoría.', code: 500 };
  }
  bitacora.registrar({
    accion: previo ? 'EDITAR' : 'CREAR',
    entidad: 'CATEGORIA',
    entidadId: doc.id,
    detalle: `${doc.nombre} / ${doc.slug}`
  }, actor);
  return { ok: true, categoria: doc };
}
