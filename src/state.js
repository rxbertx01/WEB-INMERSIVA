import { BASE } from './config.js';

// Estado único de la aplicación. Cualquier módulo lo importa y muta.
export const S = {
  garments: [...BASE],   // catálogo base
  customs: [],           // prendas publicadas por el admin (localStorage)
  bag: [],               // { g, z, q }
  slots: [],             // 12 posiciones: 2 percheros × 6 prendas
  rackMeshes: [],        // mallas susceptibles de raycast
  role: 'guest',         // guest | client | admin
  uname: '',
  email: '',
  orders: [],            // pedidos locales (clientes e invitados)
  has3D: true,
  current: null,
  size: 'M',
  qty: 1
};
