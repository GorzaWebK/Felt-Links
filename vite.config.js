import { defineConfig } from 'vite';

// Served from https://gorzawebk.github.io/Felt-Links/ in production (and by
// `npm run preview`). The dev server stays at the root: http://localhost:5173/
export default defineConfig(({ command, isPreview }) => ({
  base: command === 'build' || isPreview ? '/Felt-Links/' : '/',
  build: { target: 'es2020', chunkSizeWarningLimit: 900 },
  worker: { format: 'es' },
}));
