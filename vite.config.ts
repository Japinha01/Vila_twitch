import { defineConfig } from 'vite';

// ES2022: o main.ts usa import() dinâmico com await no topo para carregar o visual 3D só quando pedido
export default defineConfig({ build: { target: 'es2022' } });
