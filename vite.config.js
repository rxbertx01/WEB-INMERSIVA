import { defineConfig } from 'vite';

export default defineConfig({
  // Three.js ocupa ~570 kB; el aviso por defecto de 500 kB no aporta aquí.
  build: { chunkSizeWarningLimit: 700 }
});
