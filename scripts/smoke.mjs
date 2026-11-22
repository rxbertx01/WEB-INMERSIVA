// Smoke tests de la Fase 2. Sin dependencias: corre con `npm run smoke`.
import { readdirSync, readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import path from 'node:path';

const store = new Map();
globalThis.localStorage = {
  getItem: key => (store.has(key) ? store.get(key) : null),
  setItem: (key, value) => store.set(key, String(value)),
  removeItem: key => store.delete(key)
};

const services = new URL('../src/services/', import.meta.url);
const auth = await import(new URL('auth.service.js', services));
const pedidos = await import(new URL('pedidos.service.js', services));
const clientes = await import(new URL('clientes.service.js', services));
const productos = await import(new URL('productos.service.js', services));
const categorias = await import(new URL('categorias.service.js', services));
const bitacora = await import(new URL('bitacora.service.js', services));
const variantes = await import(new URL('variantes.service.js', services));
const permisos = await import(new URL('permisos.js', services));

const admin = { id: 'admin@vx.com', email: 'admin@vx.com', rol: 'ADMIN' };
const vendedor = { id: 'vendedor@vx.com', email: 'vendedor@vx.com', rol: 'VENDEDOR' };
const client = { id: 'cliente@vx.com', email: 'cliente@vx.com', rol: 'CLIENTE' };
const invitado = {};

let fallos = 0;
let total = 0;
function assert(condicion, etiqueta) {
  total++;
  if (condicion) console.log('OK   ' + etiqueta);
  else { fallos++; console.error('FALLO ' + etiqueta); }
}

// --- Permisos desde la sesión -------------------------------------------------
assert(auth.session().role === 'guest', 'sesión inicial invitado');
assert(auth.session().rol === 'INVITADO', 'rol modelo del invitado');

const login = await auth.login('cliente@vx.com', 'cliente123');
assert(login.ok && login.role === 'client' && login.rol === 'CLIENTE', 'login cliente demo');
assert(auth.actorActual().rol === 'CLIENTE', 'actorActual incluye el rol');

const loginAdmin = await auth.login('admin@vx.com', 'admin1234');
assert(loginAdmin.ok && loginAdmin.rol === 'ADMIN', 'login admin demo');

const loginVendedor = await auth.login('vendedor@vx.com', 'vendedor123');
assert(loginVendedor.ok && loginVendedor.rol === 'VENDEDOR', 'login vendedor demo');
assert(permisos.esGestor(vendedor) && permisos.esGestor('vendedor'), 'esGestor acepta actor y rol');
assert(permisos.esAdmin(admin) && !permisos.esAdmin(vendedor), 'esAdmin solo ADMIN');

const bad = await auth.login('cliente@vx.com', 'mal');
assert(!bad.ok && bad.mensaje === 'Contraseña incorrecta.', 'contraseña incorrecta');

const registered = await auth.registrar({
  email: 'nuevo@vx.com', password: 'nuevo123', nombre: 'NUEVO USER'
});
assert(registered.ok && registered.rol === 'CLIENTE', 'registro local');
const accts = JSON.parse(store.get('vx_accts'));
assert(accts['nuevo@vx.com']?.passwordHash && !('h' in accts['nuevo@vx.com']), 'cuenta canónica con hash');

await auth.logout();
assert(auth.session().rol === 'INVITADO', 'logout limpia sesión');
await auth.login('cliente@vx.com', 'cliente123');

// --- Pedidos y transiciones ---------------------------------------------------
const orders = pedidos.load();
assert(orders.length === 3, 'pedidos de ejemplo');
assert(orders[0].estado === 'ENVIADO' && orders[0].status === 2, 'estado canónico + espejo numérico');

const sinSesion = pedidos.cambiarEstado(orders[0].id, 'ENTREGADO', invitado);
assert(sinSesion.code === 401, 'cambiar estado sin sesión → 401');
const sinPermiso = pedidos.cambiarEstado(orders[0].id, 'ENTREGADO', client);
assert(sinPermiso.code === 403, 'cliente no puede cambiar estado → 403');

assert(variantes.skuDe('h1', 'M', 'ASH') === 'H1-M-ASH', 'SKU determinista');
assert(variantes.disponible('h1', 'M', 'ASH') === 12, 'stock base por talla/color');

const created = pedidos.crear({
  items: [{ g: { id: 'h1', name: 'Boxy Hoodie 01', price: 180, colour: 'ASH' }, z: 'M', q: 2 }],
  total: 360, user: 'ALEX CLIENT', email: 'cliente@vx.com'
});
assert(created.ok && created.pedido.estado === 'PENDIENTE', 'checkout crea pedido PENDIENTE');
assert(created.pedido.items[0].id === 'h1' && created.pedido.items[0].price === 180 && created.pedido.items[0].size === 'M', 'ítems del pedido canonizados desde el bag');
assert(variantes.disponible('h1', 'M', 'ASH') === 10, 'checkout descuenta stock');
const id = created.pedido.id;

const sinStock = pedidos.crear({
  items: [{ g: { id: 'h1', name: 'Boxy Hoodie 01', price: 180, colour: 'ASH' }, z: 'M', q: 99 }],
  total: 180 * 99, user: 'ALEX CLIENT', email: 'cliente@vx.com'
});
assert(!sinStock.ok && sinStock.code === 409, 'stock insuficiente → 409');
assert(variantes.disponible('h1', 'M', 'ASH') === 10, 'stock intacto tras 409');

assert(pedidos.cambiarEstado(id, 'PAGADO', admin).ok, 'PENDIENTE → PAGADO');
assert(pedidos.cambiarEstado(id, 'PAGADO', admin).sinCambio, 'estado repetido sin cambio');
const invalida = pedidos.cambiarEstado(id, 'ENTREGADO', admin);
assert(!invalida.ok && invalida.code === 409, 'PAGADO → ENTREGADO bloqueado → 409');
assert(pedidos.cambiarEstado(id, 'ENVIADO', admin).ok, 'PAGADO → ENVIADO');
assert(pedidos.cambiarEstado(id, 3, admin).ok, 'ENVIADO → ENTREGADO (legacy numérico)');
assert(pedidos.estadoDe(pedidos.mios('cliente@vx.com')[0]) === 'ENTREGADO', 'mios() filtra por email');
assert(pedidos.cambiarEstado(orders[0].id, 'ENTREGADO', vendedor).ok, 'vendedor gestiona estados de pedido');

// --- Categorías ---------------------------------------------------------------
const cats = categorias.listar();
assert(cats.length === 3 && cats.some(c => c.slug === 'outer'), 'seed de categorías');
assert(categorias.categoryOf({ type: 'bomber' }) === 'outer', 'categoryOf bomber');
assert(categorias.guardar({ nombre: 'acc', slug: 'accesorios' }, client).code === 403, 'cliente no edita categorías');
assert(categorias.guardar({ nombre: 'accesorios', slug: 'accesorios' }, vendedor).ok, 'vendedor edita categorías');
assert(categorias.guardar({ nombre: 'outer', slug: 'outer' }, admin).ok, 'admin edita categorías');

// --- Cliente y direcciones ----------------------------------------------------
const profile = clientes.obtener('cliente@vx.com', 'ALEX CLIENT');
assert(profile.addresses.length === 1 && profile.addresses[0].main, 'perfil demo con dirección principal');
assert(clientes.guardarPerfil('otro@vx.com', { name: 'X' }, client).code === 403, 'no se puede editar otro perfil');

const withAddr = clientes.agregarDireccion('cliente@vx.com', {
  label: 'work', street: 'Av. Insurgentes 1', city: 'CDMX', zip: '06000', country: 'MX'
}, client);
assert(withAddr.addresses.length === 2 && withAddr.addresses[1].label === 'WORK', 'agregar dirección');
clientes.fijarPrincipal('cliente@vx.com', withAddr.addresses[1].id, client);
const principal = clientes.obtener('cliente@vx.com').addresses.filter(a => a.main);
assert(principal.length === 1 && principal[0].label === 'WORK', 'una sola dirección principal');
clientes.eliminarDireccion('cliente@vx.com', withAddr.addresses[1].id, client);
assert(clientes.obtener('cliente@vx.com').addresses.length === 1, 'eliminar dirección');

// --- Productos, precios y baja ------------------------------------------------
const createdProduct = productos.crear({
  id: 'cTest', name: 'Test 360', price: 100, type: 'hoodie', stock: 4, sizes: ['M', 'L'],
  frames: ['data:image/webp;base64,AAA'], img: 'data:image/webp;base64,AAA', w: 1, h: 1
}, admin);
assert(createdProduct.ok && createdProduct.producto.frames.length === 1, 'publicar producto conserva frames 360°');
assert(productos.listarCustoms().some(g => g.id === 'cTest'), 'producto listado en catálogo');
assert(variantes.disponible('cTest', 'M', 'ATELIER') === 4, 'publicar crea variantes con stock');
assert(variantes.disponible('cTest', 'L', 'ATELIER') === 4, 'publicar crea variantes por talla');
assert(variantes.stockPorTalla('cTest') === 4, 'stock por talla no acumula tallas');
assert(variantes.stockPorTalla('b1') === 12, 'stock por talla del catálogo base');
assert(productos.listarCustoms().find(g => g.id === 'cTest')?.stock === 4, 'producto expone stock por talla');
assert(productos.crear({ id: 'cDenegado', name: 'X', price: 1 }, client).code === 403, 'cliente no publica productos');
assert(productos.crear({ id: 'cVendor', name: 'Vendor 360', price: 90, type: 'cargo', stock: 2 }, vendedor).ok, 'vendedor publica productos');

const price = productos.fijarPrecio('h1', 200, admin);
assert(price.ok && price.settings.prices.h1 === 200, 'fijar precio');
assert(productos.fijarPrecio('h1', 999, client).code === 403, 'cliente no cambia precios');
assert(productos.aplicarPrecios([{ id: 'h1', price: 180 }])[0].price === 200, 'override aplicado al catálogo');
assert(productos.ajustarPrecios(10, admin).ok, 'ajuste general de precios');
assert(productos.eliminar('cTest', admin).ok, 'baja/soft delete de producto');
assert(!productos.listarCustoms().some(g => g.id === 'cTest'), 'producto oculto tras baja');
assert(variantes.listar('cTest').length === 0, 'baja desactiva variantes');
assert(productos.eliminar('cVendor', admin).ok, 'baja de producto del vendedor');
assert(productos.estado('h1', 'AGOTADO', admin).ok, 'transición de producto válida');
assert(productos.estado('h1', 'EN_OFERTA', admin).code === 409, 'transición de producto inválida → 409');

// --- Bitácora ------------------------------------------------------------------
assert(bitacora.listar(client).code === 403, 'cliente no ve bitácora');
assert(bitacora.listar(vendedor).code === 403, 'vendedor no ve bitácora');
assert(bitacora.listar(invitado).code === 401, 'invitado no ve bitácora');
const log = bitacora.listar(admin);
const acciones = new Set(log.map(e => e.accion));
for (const accion of ['LOGIN', 'LOGOUT', 'CREAR', 'CAMBIAR_ESTADO', 'CAMBIAR_PRECIO', 'ELIMINAR', 'EDITAR']) {
  assert(acciones.has(accion), 'bitácora registra ' + accion);
}
const orderLogs = bitacora.deEntidad('PEDIDO', id, admin);
assert(orderLogs.some(e => e.estadoAnterior === 'PAGADO' && e.estadoNuevo === 'ENVIADO'), 'bitácora de transición con estados');

// --- Deuda técnica: acceso único a storage -------------------------------------
function walk(dir) {
  return readdirSync(dir, { withFileTypes: true }).flatMap(entry => {
    const ruta = path.join(dir, entry.name);
    return entry.isDirectory() ? walk(ruta) : [ruta];
  });
}
const src = fileURLToPath(new URL('../src/', import.meta.url));
const gateway = fileURLToPath(new URL('../src/services/storage.js', import.meta.url));
const directos = walk(src).filter(file =>
  file !== gateway && /localStorage\.(getItem|setItem|removeItem)/.test(readFileSync(file, 'utf8'))
);
assert(directos.length === 0, 'localStorage solo se usa en storage.js');

if (fallos) {
  console.error(`\nSMOKE FALLIDO: ${fallos} comprobación(es).`);
  process.exit(1);
}
console.log(`\nSMOKE PHASE 2 OK · ${total} comprobaciones`);
