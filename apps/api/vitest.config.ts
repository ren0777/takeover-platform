import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    exclude: ['test/integration/**', '**/node_modules/**', '**/dist/**'],
    // The first Fastify injection in a file has been measured at 6-13s under
    // parallel workspace load; scripts/smoke-api.mjs keeps its own 5s deadline
    // so genuine startup regressions are still caught.
    testTimeout: 20_000,
  },
});
