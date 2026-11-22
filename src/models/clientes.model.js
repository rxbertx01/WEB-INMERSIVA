/** Buyer business data, separate from the account. Addresses are embedded. */
export const clientes = {
  name: 'clientes',
  collection: 'vx_profiles',
  timestamps: true,
  fields: {
    id: { type: 'string', required: true, unique: true },
    usuarioId: { type: 'string', required: true, ref: 'usuarios' },
    nombre: { type: 'string', required: true },
    email: { type: 'string', required: true, ref: 'usuarios' },
    telefono: { type: 'string', default: '' },
    direcciones: { type: 'array', default: () => [] },
    activo: { type: 'boolean', required: true, default: true }
  }
};
