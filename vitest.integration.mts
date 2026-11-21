import { fileURLToPath } from 'node:url';
import { defineConfig } from 'vitest/config';

/**
 * DB-backed tests. They run against TEST_DATABASE_URL (default: the hotel_os_test database) after
 * `npm run test:integration` has reset and seeded it. Never point this at real data.
 */
const url = process.env.TEST_DATABASE_URL ?? 'postgresql://hotel:hotel@localhost:5432/hotel_os_test';
if (!/_test\b|test_/.test(url)) throw new Error(`Refusing to run integration tests against ${url}: use a *_test database.`);

export default defineConfig({
  resolve: {
    alias: {
      '@': fileURLToPath(new URL('./src', import.meta.url)),
      'server-only': fileURLToPath(new URL('./tests/server-only-stub.ts', import.meta.url)),
    },
  },
  test: {
    include: ['tests/integration/**/*.test.ts'],
    environment: 'node',
    env: { DATABASE_URL: url, AUTH_SECRET: 'integration-tests-secret-integration-tests-secret' },
    testTimeout: 30_000,
    hookTimeout: 60_000,
    fileParallelism: false,
  },
});
