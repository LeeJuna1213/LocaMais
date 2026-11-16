import { defineConfig } from 'vitest/config';

export default defineConfig({
  resolve: { tsconfigPaths: true },
  test: {
    globals: true,
    root: './',
    include: ['test/**/*.redis-integration-spec.ts'],
    setupFiles: ['./test/redis-integration.setup.ts'],
    fileParallelism: false,
    hookTimeout: 60000,
    testTimeout: 30000,
  },
});
