import { defineConfig } from 'vitest/config'

export default defineConfig({
  test: {
    globals: true,
    include: ['tests/**/*.test.ts'],
    testTimeout: 10000,
    environmentMatchGlobs: [
      ['tests/unit/runtime/**', 'happy-dom'],
      ['tests/unit/smil/**', 'node'],
      ['tests/integration/**', 'happy-dom']
    ]
  }
})
