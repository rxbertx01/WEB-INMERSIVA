import { SIZES } from '../config.js';

/** Domain constants shared by models and services. UI labels stay in Spanish. */
export const TALLAS = [...SIZES];

export const ROLES = ['INVITADO', 'CLIENTE', 'VENDEDOR', 'ADMIN'];

/** Maps the app role (S.role) to the persisted model role and back. */
export const ROL_MODELO = {
  guest: 'INVITADO',
  client: 'CLIENTE',
  vendedor: 'VENDEDOR',
  admin: 'ADMIN'
};
export const ROL_APP = Object.fromEntries(
  Object.entries(ROL_MODELO).map(([app, modelo]) => [modelo, app])
);

export const ESTADOS_PRODUCTO = ['DISPONIBLE', 'AGOTADO', 'EN_OFERTA', 'INACTIVO'];
export const TRANSICIONES_PRODUCTO = {
  DISPONIBLE: ['AGOTADO', 'EN_OFERTA', 'INACTIVO'],
  AGOTADO: ['DISPONIBLE'],
  EN_OFERTA: ['DISPONIBLE', 'INACTIVO'],
  INACTIVO: ['DISPONIBLE', 'AGOTADO']
};

export const ESTADOS_PEDIDO = ['PENDIENTE', 'PAGADO', 'ENVIADO', 'ENTREGADO', 'CANCELADO'];
export const FLUJO_PEDIDO = ['PENDIENTE', 'PAGADO', 'ENVIADO', 'ENTREGADO'];
export const TRANSICIONES_PEDIDO = {
  PENDIENTE: ['PAGADO', 'CANCELADO'],
  PAGADO: ['ENVIADO', 'CANCELADO'],
  ENVIADO: ['ENTREGADO'],
  ENTREGADO: [],
  CANCELADO: []
};

/** Display labels: canonical states are unaccented, the UI keeps the old wording. */
export const ETIQUETAS_ESTADO = {
  PENDIENTE: 'Confirmado',
  PAGADO: 'En preparación',
  ENVIADO: 'En camino',
  ENTREGADO: 'Entregado',
  CANCELADO: 'Cancelado'
};

const LEGACY_PEDIDO = ['PENDIENTE', 'PAGADO', 'ENVIADO', 'ENTREGADO'];

/** Converts legacy numeric states (0..3) into canonical uppercase states. */
export function estadoDesdeLegacy(value) {
  if (typeof value === 'number') return LEGACY_PEDIDO[value] || 'PENDIENTE';
  return ESTADOS_PEDIDO.includes(value) ? value : 'PENDIENTE';
}

/** Index of a state inside the four-step tracking flow, or -1 if cancelled. */
export function indiceFlujo(estado) {
  const index = FLUJO_PEDIDO.indexOf(estado);
  return index < 0 ? -1 : index;
}
