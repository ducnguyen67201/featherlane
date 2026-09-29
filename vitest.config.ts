import { defineConfig } from 'vitest/config';
import { fileURLToPath } from 'node:url';

export default defineConfig({
  resolve: {
    alias: {
      '@featherlane/contracts/access-values': fileURLToPath(
        new URL('./packages/contracts/src/AccessValues.ts', import.meta.url),
      ),
      '@featherlane/contracts': fileURLToPath(
        new URL('./packages/contracts/src/Index.ts', import.meta.url),
      ),
      '@featherlane/client': fileURLToPath(
        new URL('./packages/client/src/Index.ts', import.meta.url),
      ),
    },
  },
  test: { include: ['tests/**/*.test.ts'], testTimeout: 10000 },
});
