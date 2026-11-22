# ATELIER/VX — Showroom

Showroom 3D de moda en módulos ES + Vite: galería oscura de concreto mate, marco frontal retroiluminado en rojo neón, dos percheros laterales, HUD perimetral y un drawer de detalle con visor 360°.

Todo funciona en local: **sin backend**. El catálogo base son 8 prendas en `src/config.js`; cuentas, carrito, pedidos, direcciones, ajustes, categorías, stock por talla y prendas publicadas se guardan en `localStorage`. Desde la Fase 1, **todo acceso a `localStorage` pasa por `src/services/storage.js`** y las reglas viven en `src/services/*.service.js` con esquemas declarativos en `src/models/`. El detalle está en `docs/ARQUITECTURA.md`.

## Arrancar en local

Requiere Node 18+ (verificado con Node 26).

```powershell
npm install
npm run dev
```

Abre **http://localhost:5174**. Se usa el puerto 5174 porque 5173 suele estar ocupado por otros proyectos.

```powershell
npm run build
npm run preview
npm run smoke   # servicios + guards + detector de localStorage directo
npm run verify  # build + smoke
```

> Usa `localhost` y no `file://`: los módulos ES necesitan HTTP y el hash de contraseñas usa `crypto.subtle` (secure context).

## Cuentas de prueba

| Rol | Email | Contraseña | Permisos |
|---|---|---|---|
| Cliente | `cliente@vx.com` | `cliente123` | Perfil, direcciones, pedidos, seguimiento y compra |
| Vendedor | `vendedor@vx.com` | `vendedor123` | Catálogo, stock, precios y pedidos (sin apariencia ni bitácora) |
| Admin | `admin@vx.com` | `admin1234` | Lo anterior + apariencia de la página y bitácora |

También puedes crear una cuenta de cliente desde «LOGIN → Regístrate». El header muestra `LOGIN` Invitado, el nombre del usuario en sesión, y `ADD CLOTHES` para ADMIN y VENDEDOR.

**Al hacer clic en tu nombre en el header NO se cierra la sesión**: se abre el panel de cuenta. El cierre de sesión solo ocurre al pulsar el botón explícito `LOG OUT ✕` dentro de ese panel (o `CLOSE ✕` para volver al showroom).

Hay pedidos de ejemplo precargados la primera vez: uno `En camino`, uno `Entregado` (historial del cliente) y uno `En preparación` del admin, para que todas las secciones tengan datos desde el inicio.

## Arquitectura de estados

El estado vive en `S` (`src/state.js`) y los cambios se difunden con el bus (`src/bus.js`):

- **Invitado** (`role: 'guest'`): ve el showroom y el drawer con visor 360°; puede comprar como invitado, pero no tiene panel de cuenta ni `ADD CLOTHES`.
- **Cliente** (`role: 'client'`): `auth.js` guarda la sesión en `vx_sess`. Al pulsar su nombre se abre `#account`, un panel lateral estrecho de una sola columna (ver § «Cuenta — panel lateral»): perfil, direcciones, pedidos activos, historial y seguimiento con estados `Confirmado → En preparación → En camino → Entregado` + código de rastreo.
- **Vendedor** (`role: 'vendedor'`): el mismo panel con datos y rol, gestión de catálogo (agregar desde el panel, eliminar, precios) y pedidos, **sin** formulario de apariencia ni bitácora.
- **Admin** (`role: 'admin'`): el mismo panel con datos y rol, formulario de apariencia, gestión de catálogo (agregar desde el panel o `ADD CLOTHES`, eliminar, subir/bajar precio), todos los pedidos de clientes con selector de estado y la **bitácora** de movimientos.
- **Modal ADD CLOTHES**: panel `#addP` con nombre, categoría/colección, precio, **stock por talla**, color, tallas, descripción, imagen principal y secuencia de hasta 12 fotos para el 360°. `customs:sync` sincroniza carrusel y catálogo.
- **Visor 360°**: `viewer360.js` se monta dentro del drawer al abrir una prenda. Gira solo a 14°/s (~26 s por vuelta), permite arrastrar con ratón/dedo y tiene `PAUSE/PLAY`. Con frames usa las fotos subidas; si no, rota el SVG con perspectiva 3D. Se destruye al cerrar el drawer.

### Fase 1 — disciplina de datos (sin cambios visuales)

- **Modelos** (`src/models/*.model.js`): `usuarios`, `clientes`, `categorias`, `productos`, `variantes`, `pedidos` y `bitacora`, con `required`, `enum`, `default`, `select: false` y `timestamps`.
- **Servicios** (`src/services/*.service.js`): `auth`, `clientes`, `categorias`, `productos`, `pedidos`, `bitacora` y `cuenta` (favoritos; tarjetas y datos de reembolso quedan aparcados sin interfaz). Los controladores de vista (`auth.js`, `account.js`, `admin.js`, `catalog.js`, `settings.js`, `orders.js`) solo delegan en ellos.
- **Estados canónicos**: pedidos `PENDIENTE | PAGADO | ENVIADO | ENTREGADO | CANCELADO`; productos `DISPONIBLE | AGOTADO | EN_OFERTA | INACTIVO`. La UI sigue mostrando `Confirmado`, `En preparación`, `En camino`, `Entregado`, `Cancelado`.
- **Transiciones inválidas**: devuelven `409` y se muestran en `#accountMsg`; no se aplican cambios.
- **Bitácora**: `vx_bitacora` guarda accesos, creación de pedidos/productos, cambios de precio y de estado. Es solo de escritura desde los servicios.
- **Fase 1.5**: los servicios validan el rol desde la sesión (`src/services/permisos.js`): catálogo y estados de pedido requieren `ADMIN`/`VENDEDOR`, los perfiles solo los puede editar su dueño o un ADMIN, y la bitácora solo ADMIN. Sin sesión → `401`; rol insuficiente → `403`.
- **Selector de estados**: el panel admin deshabilita las transiciones inválidas; el servicio mantiene el `409` como red de seguridad.
- **Pruebas**: `npm run smoke` (71 comprobaciones, sin dependencias) y `npm run verify` (build + smoke).

### Fase 2 — stock, categorías y roles (sin cambios en la escena 3D)

- **Stock por talla y color**: `src/services/variantes.service.js` siembra `vx_variantes` con SKU determinista `${productoId}-${talla}-${COLOR}` (p. ej. `B1-M-OLIVE`). Stock base `12` en el catálogo y `10` en prendas publicadas; se puede fijar en `#cStock`.
- **Drawer con stock**: las tallas agotadas aparecen tachadas y deshabilitadas, `#pdStock` muestra las unidades disponibles y `ADD TO BAG` se bloquea si no hay stock. La cantidad se limita al stock de la talla.
- **Checkout con reserva**: `pedidos.crear()` descuenta el stock **antes** de escribir el pedido; stock insuficiente o SKU duplicado → `409`. Si falla la escritura, se revierte la reserva. Si falla el checkout, el bag se conserva y se muestra el motivo en `#bagBody`.
- **Categorías dinámicas**: los filtros del hero se renderizan desde `vx_categorias` (`listar()`); las categorías sin prendas muestran un estado vacío en `#carEmpty`.
- **Auditoría**: solo ADMIN ve `05 / BITÁCORA` con fecha, acción, entidad, actor y detalle. VENDEDOR gestiona catálogo y pedidos sin acceso a la bitácora ni a la apariencia.
- **Claves activas**: `vx_productos` y `vx_variantes` dejan de estar reservadas: la creación y baja de productos mantienen ambas colecciones sincronizadas, con rollback si falla alguna escritura. `vx_customs` sigue siendo la fuente visible de prendas publicadas.
- **Paneles de gestores**: muestran el stock **por talla** (no la suma de todas), calculado desde `vx_variantes`, así que reflejan el descuento del checkout sin depender de un campo guardado.
- **E2E**: verificación headless con Edge CDP sobre una copia temporal de `index.html`: 53 comprobaciones de UI real (stock, checkout, publicar/borrar, direcciones, roles, bitácora y accesibilidad). El archivo temporal se elimina al terminar.

### Inmersión — modo cinematográfico (sin backend ni migración)

- **INMERSIVO ⛶** en el header retira el HUD decorativo (header, hero, pistas y edición) y pide pantalla completa al documento. El canvas 3D y el drawer siguen interactivos; `ESC` o el control `ESC · SALIR ✕` restauran la vista. Si el navegador deniega el fullscreen, el modo sigue funcionando dentro de la pestaña.
- **Vida ambiente**: `scene3d.js` añade polvo en suspensión, respiración sutil del halo/neón y un parallax mínimo que acompaña al puntero. No cambia el concreto, los percheros, el giro del 360° ni los controles; todo se desactiva con `prefers-reduced-motion: reduce`.
- **Verificación**: `npm run verify` (44 módulos, 71/71) y comprobaciones E2E con Edge CDP sobre la UI real (entrada/salida, ARIA, WebGL y visor 360°).

### Cuenta — panel lateral (sin tocar la escena)

- Al pulsar tu nombre en el header se abre **MI CUENTA** (nunca cierra sesión). El panel mide `min(920px, 96vw)` con grid `290px | 1fr`: **menú vertical a la izquierda** (cabecera, avatar circular de 54 px con saludo, grupos con divisores e ítem activo con barra de acento roja de 3 px) y **contenido a la derecha** en tarjetas compactas. El cierre solo ocurre con `CERRAR SESIÓN / LOG OUT ✕` al final del menú. Por debajo de 760 px las columnas se apilan.
- **Cada perfil ve solo su menú**: cliente (`MI PERFIL`, `MIS COMPRAS`, `Favoritos`), vendedor (`PERFIL VENDEDOR`, `GESTIÓN DE CATÁLOGO`, `VENTAS`) y admin (además `GESTIÓN DE TIENDA` y `AUDITORÍA`). No se muestran opciones de otros roles.
- **Cliente**: `Datos personales`, `Direcciones`, `Seguimiento e historial de compras` (activo por defecto) y `Favoritos ›`. Los pedidos incluyen pestañas `Pedidos activos / Historial completo`, buscador por número de orden, selector de periodo, miniatura, línea de tiempo desplegable y comprobante descargable. El título de la sección va en el flujo normal (máx. 22 px) para no tapar la cabecera `MI CUENTA`.
- **Aparcado por ahora**: tarjetas y datos bancarios para reembolso. El servicio `src/services/cuenta.service.js` conserva esas funciones sin interfaz, y `vx_cuenta` sigue guardando solo favoritos mientras no se reactiven.
- **Admin/Vendedor**: mismo panel con `Información`, `Subir prenda al catálogo`, `Administrar prendas` (subir/bajar precio y eliminar), `Pedidos de los clientes` con selector de estado y, solo ADMIN, `Modificar la página` y `Bitácora`. El formulario de alta se comparte con el modal `ADD CLOTHES` mediante `addFormHTML()` en `src/admin.js`.
- Verificado con **44 comprobaciones E2E** (cliente, admin y vendedor, 1440 px); el modal `ADD CLOTHES` sigue intacto.

### Eventos del bus

| Evento | Origen | Efecto |
|---|---|---|
| `account:open` | `auth.js` | Abre `#account` con la vista según rol |
| `auth:logout` | `account.js` | Cierra sesión y el panel |
| `auth:change` | `auth.js` | Muestra/oculta `ADD CLOTHES`, cierra cuenta al volver a invitado |
| `catalog:refresh` | `settings.js`, `admin.js` | Reconstruye el carrusel con precios/prendas actualizados |
| `customs:sync` | `admin.js` | Sincroniza tarjetas al publicar/borrar |
| `orders:change` | `orders.js` | Refresca el panel de cuenta si está abierto |
| `settings:change` | `settings.js` | Notifica cambios de apariencia/precios |

Solo un panel lateral puede estar abierto a la vez: `openPanel()` cierra los demás.

## Estructura

```
docs/
  ARQUITECTURA.md       Modelos, servicios, transiciones y fases
scripts/
  smoke.mjs             Pruebas de servicios y guards
index.html              Markup: header, drawer, cuenta, ADD CLOTHES, bag y login
styles/
  base.css              Variables, reset, botones
  layout.css            Header, paneles, modal, responsive, fallback sin WebGL
  components.css        Tarjetas, drawer, visor 360°, formularios y estilos .acc-*
src/
  main.js               Bootstrap de los init* en orden
  immersive.js          Modo cinematográfico: HUD ocultable + Fullscreen API
  config.js             Catálogo base y tallas
  state.js              Estado compartido (S)
  bus.js                Eventos entre módulos
  utils.js              $, money, esc, shade, sha, loadImg
  svg.js                Dibujo SVG de las prendas
  models/               Esquemas declarativos + constantes de estado
  services/             storage.js (único gateway), permisos.js y servicios de negocio
                        variantes.service.js genera SKU, siembra stock y reserva con rollback
  scene3d.js            Three.js: escena, percheros, cámara, raycast, setAccent + vida ambiente
  viewer360.js          Visor rotatorio del drawer
  orders.js             Fachada compatible de pedidos
  settings.js           Apariencia y overrides de precios
  auth.js               Login/registro local y roles (cliente, vendedor, admin)
  admin.js              Publicación y borrado de prendas por gestores
  catalog.js            Drawer, tallas con stock, cantidad, carrito y checkout
  cuenta.service.js     Favoritos (tarjetas y reembolsos aparcados)
  account.js            Panel de cuenta: menú a la izquierda, contenido a la derecha
  hero.js               Titular y filtros dinámicos desde categorías.service.js
```

## Claves en localStorage

| Clave | Contenido |
|---|---|
| `vx_sess` | Email de la sesión activa |
| `vx_accts` | Cuentas registradas (nombre + hash SHA-256; el hash nunca se renderiza) |
| `vx_profiles` | Perfiles y direcciones por email |
| `vx_orders` | Pedidos, estado canónico y espejo `status` numérico |
| `vx_settings` | Textos, acento y precios overrides |
| `vx_customs` | Prendas publicadas (fuente visible del catálogo, con `atributos3d`) |
| `vx_bag` | Carrito |
| `vx_bitacora` | Registro append-only de login/logout, pedidos, precios y estados |
| `vx_categorias` | Categorías del showroom (`outer`, `essential`, `accesorios`); alimentan los filtros |
| `vx_productos` | Documentos canónicos de productos (estado, categoría, precios) |
| `vx_variantes` | Stock por SKU (`producto-talla-color`), con baja y reserva en checkout |

## Dónde cambiar cada cosa

| Quieres cambiar… | Archivo |
|---|---|
| Prendas base, precios, descripciones | `src/config.js` → `BASE` |
| Credenciales demo | `src/services/auth.service.js` → `DEMO` |
| Stock base y SKU | `src/services/variantes.service.js` → `STOCK_BASE`, `STOCK_CUSTOM`, `skuDe()` |
| Categorías de los filtros | `src/services/categorias.service.js` → `SEED` |
| Pedidos de ejemplo | `src/services/pedidos.service.js` → `SAMPLE` |
| Perfil de ejemplo de cliente | `src/services/clientes.service.js` → `obtener()` |
| Campos de ADD CLOTHES | `index.html` → `#addP` y `src/admin.js` → `publish()` |
| Campos del panel de cuenta | `src/account.js` → `navGroups()` y `contentFor()` |
| Ancho del panel de cuenta | `styles/layout.css` → `#account` (`min(920px, 96vw)`) |
| Favoritos (reembolsos aparcados) | `src/services/cuenta.service.js` |
| Estados de seguimiento | `src/models/constantes.js` → `FLUJO_PEDIDO` / `ETIQUETAS_ESTADO` |
| Modo inmersivo / salida | `src/immersive.js` y `styles/layout.css` → `.immersive` |
| Velocidad del giro 360° | `src/viewer360.js` → `SPEED` |
| Ancho del drawer y estilo del visor | `styles/components.css` → `.v360` |

## Notas

El archivo original `ATELIER_VX — Showroom.html` se conserva como referencia. Vite solo sirve `index.html`.

El checkout es **simulado**, no realiza cobros ni envíos. Las contraseñas se hashean con SHA-256 y se guardan en `localStorage` solo para la demo: no es un sistema de autenticación apto para producción.
