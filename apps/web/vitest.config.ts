import { fileURLToPath } from 'node:url';
import { defineConfig } from 'vitest/config';

/**
 * Mirrors the `@/*` path alias from tsconfig so modules that use it are
 * testable. Next resolves the alias through tsconfig paths; Vitest does not.
 */
export default defineConfig({
  // Next compiles JSX with the automatic runtime. Vitest's esbuild defaults to
  // the classic transform, which emits React.createElement and fails with
  // "React is not defined" when a component is rendered in a test.
  esbuild: { jsx: 'automatic' },
  resolve: {
    alias: {
      '@': fileURLToPath(new URL('./src', import.meta.url)),
    },
  },
  test: {
    environment: 'node',
    include: ['test/**/*.test.ts'],
  },
});
