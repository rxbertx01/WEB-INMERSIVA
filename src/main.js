import { initUI } from './ui.js';
import { initImmersive } from './immersive.js';
import { initScene } from './scene3d.js';
import { loadOrders } from './orders.js';
import { initSettings } from './settings.js';
import { initCatalog } from './catalog.js';
import { initAdmin } from './admin.js';
import { initAuth } from './auth.js';
import { initHero } from './hero.js';
import { initAccount } from './account.js';

initUI();        // cierre de paneles (incluido el de cuenta)
initImmersive(); // HUD ocultable + pantalla completa sin salir del showroom
initScene();     // escena, percheros y prendas base
loadOrders();    // pedidos de ejemplo + pedidos guardados
initSettings();  // apariencia y overrides de precio
initCatalog();   // carrusel, drawer 360°, bag y checkout
initAdmin();     // catálogo local publicado por el admin
initAuth();      // invitado / cliente / admin (credenciales demo)
initHero();      // titular y filtros del primer plano
initAccount();   // panel de cuenta: perfil, direcciones, pedidos y ajustes
