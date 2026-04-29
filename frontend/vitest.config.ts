import path from 'path'
import { defineConfig } from 'vitest/config'
import react from '@vitejs/plugin-react'

export default defineConfig({
  plugins: [react()],
  resolve: {
    alias: { '@': path.resolve(__dirname, './src') },
  },
  test: {
    globals: true,
    environment: 'node',
    setupFiles: ['allure-vitest/setup', './src/test/vitest-localstorage.ts'],
    reporters: ['default', 'allure-vitest/reporter'],
    include: ['src/**/*.unit.test.ts', 'src/**/*.unit.test.tsx', 'src/**/*.dom.test.ts'],
    exclude: ['node_modules/**', 'src/__tests__/ct/**'],
  },
})
