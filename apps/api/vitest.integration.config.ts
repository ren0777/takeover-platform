import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    fileParallelism: false,
    maxWorkers: 1,
    testTimeout: 30_000,
    hookTimeout: 30_000,
    include: ['test/integration/**/*.test.ts'],
    setupFiles: ['./test/integration/setup.ts'],
  },
});
