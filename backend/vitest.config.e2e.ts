import { defineConfig } from 'vitest/config';
import tsconfigPaths from 'vite-tsconfig-paths';

export default defineConfig({
  plugins: [tsconfigPaths()],
  test: {
    globals: true,
    root: './',
    // A fixed, test-only key so credential encryption works without a local .env.
    env: { CREDENTIALS_ENCRYPTION_KEY: 'test-only-credentials-key-0123456789abcdef' },
    include: ['**/*.e2e-spec.ts'],
    // These suites share ONE real Postgres database (no mocks, by design —
    // that's the point of an e2e spec here) rather than each getting an
    // isolated instance. Running the files in parallel workers lets two
    // suites post a JournalEntry at the same moment and race on
    // generateDocumentNumber's count()-then-insert numbering (shared,
    // pre-existing infrastructure — see the Phase G/H e2e specs' own doc
    // comments), which is a real, reproducible failure, not a flaky
    // coincidence. Sequential execution is the correct way to run
    // integration tests against one shared live resource regardless; it
    // also happens to be what this numbering scheme requires.
    fileParallelism: false,
  },
});
