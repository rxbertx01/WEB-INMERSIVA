import { emit } from './bus.js';
import { S } from './state.js';
import {
  ETIQUETAS_ESTADO, FLUJO_PEDIDO, TRANSICIONES_PEDIDO, estadoDesdeLegacy
} from './models/constantes.js';
import * as pedidos from './services/pedidos.service.js';
import { actorActual } from './services/auth.service.js';

/** Display labels stay in Spanish; canonical states live in the service. */
export const STATUSES = FLUJO_PEDIDO.map(estado => ETIQUETAS_ESTADO[estado]);
export const TRANSITIONS = TRANSICIONES_PEDIDO;
export const estadoDe = pedidos.estadoDe;
export const estadoDesde = pedidos.estadoDesde;
export const canonizar = estadoDesdeLegacy;

export function loadOrders() {
  S.orders = pedidos.load();
}

export function createOrder({ items, total, user, email }) {
  const result = pedidos.crear({
    items,
    total,
    user,
    email,
    usuarioId: email || S.email || null
  });
  if (!result.ok) {
    return { ok: false, pedido: null, mensaje: result.mensaje, code: result.code };
  }
  emit('orders:change');
  return { ok: true, pedido: result.pedido, mensaje: result.mensaje, code: result.code };
}

/** Accepts the legacy numeric index or a canonical state string. */
export function updateOrderStatus(id, status) {
  const result = pedidos.cambiarEstado(id, status, actorActual());
  if (result.ok) emit('orders:change');
  return result;
}

export function ordersOf(email) {
  return pedidos.mios(email);
}
