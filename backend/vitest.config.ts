import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    include: ['tests/**/*.test.ts'],
    environment: 'node',
    env: {
      NODE_ENV: 'test',
      // Unit tests never connect; this only satisfies env validation.
      DATABASE_URL: 'postgres://unused:unused@127.0.0.1:1/unused',
    },
    // Integration tests share one database, so run files one at a time.
    fileParallelism: false,
    typecheck: { enabled: true, include: ['tests/**/*.test-d.ts'] },
  },
});
