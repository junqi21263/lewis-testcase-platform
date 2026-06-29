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
    setupFiles: ['allure-vitest/setup', './src/test/vitest-localstorage.ts', './src/test/vitest-setup.ts'],
    reporters: ['default', 'allure-vitest/reporter'],
    include: ['src/**/*.unit.test.ts', 'src/**/*.unit.test.tsx', 'src/**/*.dom.test.ts', 'src/**/*.dom.test.tsx'],
    exclude: ['node_modules/**', 'src/__tests__/ct/**'],
    coverage: {
      provider: 'v8',
      reporter: ['text', 'json-summary'],
      include: [
        'src/utils/aiAnalysisInput.ts',
        'src/utils/aiAnalysisRecovery.ts',
        'src/utils/aiAnalysisRuntime.ts',
        'src/utils/analysisReviewSummary.ts',
      ],
      thresholds: {
        lines: 80,
        functions: 80,
        branches: 80,
        statements: 80,
      },
    },
  },
})
