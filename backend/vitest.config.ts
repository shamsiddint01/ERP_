import { defineConfig } from 'vitest/config';
import tsconfigPaths from 'vite-tsconfig-paths';

export default defineConfig({
  // Resolves the path aliases declared in tsconfig.json, including the ones
  // added by `nest g library`.
  plugins: [tsconfigPaths()],
  test: {
    globals: true,
    root: './',
    // A fixed, test-only key so credential encryption works without a local .env.
    env: { CREDENTIALS_ENCRYPTION_KEY: 'test-only-credentials-key-0123456789abcdef' },
    include: ['**/*.spec.ts'],
  },
});
