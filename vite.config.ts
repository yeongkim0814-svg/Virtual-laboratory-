import { defineConfig } from 'vitest/config';

export default defineConfig({
  // GitHub Pages는 /<repo>/ 하위 경로로 서빙되므로 상대 경로로 빌드한다.
  base: './',
  test: {
    environment: 'node',
    include: ['tests/**/*.test.ts'],
  },
});
