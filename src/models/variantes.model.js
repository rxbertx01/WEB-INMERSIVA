import { TALLAS } from './constantes.js';

/** Size/colour stock for a product. Embedded today, splittable into its own store later. */
export const variantes = {
  name: 'variantes',
  collection: 'vx_variantes',
  timestamps: true,
  fields: {
    sku: { type: 'string', required: true, unique: true },
    productoId: { type: 'string', required: true, ref: 'productos' },
    talla: { type: 'string', required: true, enum: TALLAS },
    color: { type: 'string', default: '' },
    stock: { type: 'number', required: true, default: 0 },
    precio: { type: 'number', default: 0 },
    activo: { type: 'boolean', required: true, default: true }
  }
};
