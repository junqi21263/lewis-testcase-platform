import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import path from 'path'

export default defineConfig({
  plugins: [react()],
  resolve: {
    alias: {
      '@': path.resolve(__dirname, './src'),
    },
  },
  build: {
    rollupOptions: {
      output: {
        manualChunks(id) {
          if (id.includes('node_modules')) {
            if (id.includes('@tiptap')) return 'tiptap'
            if (id.includes('@tanstack/react-table')) return 'tanstack-table'
          }
        },
      },
    },
  },
  server: {
    port: 5173,
    proxy: {
      // 流式 SSE：须先于 /api 匹配；拉长超时，避免本地代理过早断开
      '/api/ai/generate/stream': {
        target: 'http://localhost:3000',
        changeOrigin: true,
        timeout: 3_600_000,
        proxyTimeout: 3_600_000,
      },
      '/api': {
        target: 'http://localhost:3000',
        changeOrigin: true,
        timeout: 600_000,
        proxyTimeout: 600_000,
      },
    },
  },
})
