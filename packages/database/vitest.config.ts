import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    exclude: ['test/phase3*.test.ts', 'test/integration/**', '**/node_modules/**', '**/dist/**'],
    maxWorkers: 2,
  },
});
