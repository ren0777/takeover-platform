import nextPlugin from '@next/eslint-plugin-next';
import baseConfig from '@takeover/config/eslint/base';

export default [
  ...baseConfig,
  {
    files: ['**/*.{js,mjs,ts,tsx}'],
    plugins: {
      '@next/next': nextPlugin,
    },
    rules: {
      ...nextPlugin.configs.recommended.rules,
      ...nextPlugin.configs['core-web-vitals'].rules,
    },
  },
  {
    ignores: ['.next/**', 'coverage/**', 'next-env.d.ts'],
  },
];
