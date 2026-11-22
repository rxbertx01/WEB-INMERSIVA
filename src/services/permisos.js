/** Service-level guards: the role always comes from the session, never from the view. */
const GESTORES_CATALOGO = ['ADMIN', 'VENDEDOR'];

const denegar = (code, mensaje, error) => ({ ok: false, code, mensaje, error });

/** Returns null when allowed, or an error result ready to return from the service. */
export function autorizar(actor, roles) {
  if (!actor?.email || actor.rol === 'INVITADO') {
    return denegar(401, 'Inicia sesión para continuar.', 'UNAUTHORIZED');
  }
  if (!roles.includes(actor.rol)) {
    return denegar(403, 'No tienes permisos para esta acción.', 'FORBIDDEN');
  }
  return null;
}

export const autorizarCatalogo = actor => autorizar(actor, GESTORES_CATALOGO);
export const autorizarAdmin = actor => autorizar(actor, ['ADMIN']);

/** Accepts either an app role string or an actor with a canonical/model role. */
export function esGestor(actorORol) {
  const rol = typeof actorORol === 'string' ? actorORol : actorORol?.rol;
  return ['ADMIN', 'VENDEDOR', 'admin', 'vendedor'].includes(rol);
}

export const esAdmin = actorORol => {
  const rol = typeof actorORol === 'string' ? actorORol : actorORol?.rol;
  return rol === 'ADMIN' || rol === 'admin';
};

/** A client may only touch their own profile; ADMIN can touch any. */
export function autorizarCliente(actor, email) {
  const sesion = autorizar(actor, ['CLIENTE', 'ADMIN', 'VENDEDOR']);
  if (sesion) return sesion;
  if (actor.rol !== 'ADMIN' && actor.email !== email) {
    return denegar(403, 'No puedes modificar otro perfil.', 'FORBIDDEN');
  }
  return null;
}
