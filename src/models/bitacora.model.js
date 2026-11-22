const ACCIONES = [
  'LOGIN', 'LOGOUT', 'CREAR', 'EDITAR',
  'CAMBIAR_ESTADO', 'CAMBIAR_PRECIO', 'ELIMINAR'
];
const ENTIDADES = ['USUARIO', 'CLIENTE', 'CATEGORIA', 'PRODUCTO', 'VARIANTE', 'PEDIDO'];

/** Append-only audit log: no update or delete is exposed by any service. */
export const bitacora = {
  name: 'bitacora',
  collection: 'vx_bitacora',
  timestamps: true,
  fields: {
    id: { type: 'string', required: true, unique: true },
    usuarioId: { type: 'string', ref: 'usuarios', required: true, default: 'sistema' },
    usuarioEmail: { type: 'string', default: '' },
    accion: { type: 'string', required: true, enum: ACCIONES },
    entidad: { type: 'string', required: true, enum: ENTIDADES },
    entidadId: { type: 'string', required: true },
    estadoAnterior: { type: 'string', default: null },
    estadoNuevo: { type: 'string', default: null },
    detalle: { type: 'string', default: '' },
    fecha: { type: 'string', default: () => new Date().toISOString() }
  }
};
