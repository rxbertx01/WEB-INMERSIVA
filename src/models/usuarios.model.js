import { ROLES } from './constantes.js';

/** Account collection: role comes from the session token, never from the request body. */
export const usuarios = {
  name: 'usuarios',
  collection: 'vx_accts',
  timestamps: true,
  fields: {
    id: { type: 'string', required: true, unique: true },
    email: { type: 'string', required: true, unique: true },
    passwordHash: { type: 'string', required: true, select: false },
    nombre: { type: 'string', required: true },
    rol: { type: 'string', required: true, enum: ROLES, default: 'CLIENTE' },
    activo: { type: 'boolean', required: true, default: true }
  }
};
