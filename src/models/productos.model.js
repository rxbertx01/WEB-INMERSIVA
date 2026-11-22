import { ESTADOS_PRODUCTO, TALLAS } from './constantes.js';

/** Garment collection. atributos3d keeps the 3D showroom and 360° viewer working. */
export const productos = {
  name: 'productos',
  collection: 'vx_productos',
  timestamps: true,
  fields: {
    id: { type: 'string', required: true, unique: true },
    nombre: { type: 'string', required: true },
    descripcion: { type: 'string', default: '' },
    precio: { type: 'number', required: true, default: 0 },
    categoriaId: { type: 'string', required: true, ref: 'categorias' },
    imagenes: { type: 'array', default: () => [] },
    color: { type: 'string', default: '#888888' },
    colorNombre: { type: 'string', default: 'ATELIER' },
    tallas: { type: 'array', valores: TALLAS, default: () => ['M'] },
    estado: { type: 'string', required: true, enum: ESTADOS_PRODUCTO, default: 'DISPONIBLE' },
    atributos3d: { type: 'object', default: () => ({ img: null, w: 1, h: 1, frames: [], velocidadGiro: 14, rack: 'right' }) },
    variantes: { type: 'array', default: () => [] },
    activo: { type: 'boolean', required: true, default: true }
  }
};
