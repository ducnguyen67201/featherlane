import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import { fileURLToPath } from 'node:url';

export default defineConfig({
  plugins: [react()],
  resolve: {
    alias: {
      '@featherlane/contracts': fileURLToPath(
        new URL('../../packages/contracts/src/Index.ts', import.meta.url),
      ),
    },
  },
  server: { proxy: { '/v1': 'http://127.0.0.1:4318', '/health': 'http://127.0.0.1:4318' } },
});
