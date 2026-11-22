/** Catalog categories. slug matches the showroom filters (outer / essential). */
export const categorias = {
  name: 'categorias',
  collection: 'vx_categorias',
  timestamps: true,
  fields: {
    id: { type: 'string', required: true, unique: true },
    nombre: { type: 'string', required: true, unique: true },
    slug: { type: 'string', required: true, unique: true },
    descripcion: { type: 'string', default: '' },
    activo: { type: 'boolean', required: true, default: true }
  }
};
