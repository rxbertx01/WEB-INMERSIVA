import { ESTADOS_PEDIDO } from './constantes.js';

/** Order with snapshot items, canonical state, tracking and transition history. */
export const pedidos = {
  name: 'pedidos',
  collection: 'vx_orders',
  timestamps: true,
  fields: {
    id: { type: 'string', required: true, unique: true },
    clienteId: { type: 'string', ref: 'clientes', default: null },
    clienteEmail: { type: 'string', default: '' },
    clienteNombre: { type: 'string', required: true, default: 'Invitado' },
    items: { type: 'array', required: true, default: () => [] },
    total: { type: 'number', required: true, default: 0 },
    estado: { type: 'string', required: true, enum: ESTADOS_PEDIDO, default: 'PENDIENTE' },
    tracking: { type: 'string', required: true },
    direccion: { type: 'object', default: null },
    historial: { type: 'array', default: () => [] },
    // Legacy mirrors kept so existing views keep working during the migration.
    date: { type: 'string', default: () => new Date().toISOString() },
    status: { type: 'number', default: 0 },
    activo: { type: 'boolean', required: true, default: true }
  }
};
