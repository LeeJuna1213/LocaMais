import { defineConfig } from 'vitest/config';

export default defineConfig({
  resolve: { tsconfigPaths: true },
  test: {
    globals: true,
    root: './',
    include: ['**/*.e2e-spec.ts'],
    setupFiles: ['./test/setup.ts'],
    // Um SQLite em memória por worker; os testes criam os próprios usuários.
    fileParallelism: false,
    // O boot do AppModule + seed do admin pode passar de 10s em máquinas
    // lentas, principalmente com as entidades relacionais carregadas.
    hookTimeout: 30000,
    testTimeout: 15000,
  },
});
