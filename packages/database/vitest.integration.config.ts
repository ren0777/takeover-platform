import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    include: ['test/phase3*.test.ts', 'test/integration/**/*.test.ts'],
    setupFiles: ['./test/integration/setup.ts'],
    fileParallelism: false,
    maxWorkers: 1,
  },
});
