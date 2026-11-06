import { defineConfig } from 'vite';

export default defineConfig({
  base: './',
  test: {
    include: ['tests/**/*.test.ts'],
    // 何年分も回すテストがあるので、遅いマシン（GitHub の検査）でも止まらないよう長めにする
    testTimeout: 60000,
  },
});
