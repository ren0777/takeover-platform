import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    fileParallelism: false,
    include: ['test/integration/**/*.test.ts'],
    setupFiles: ['./test/integration/setup.ts'],
  },
});
