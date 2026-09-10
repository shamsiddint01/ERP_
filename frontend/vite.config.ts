import react from '@vitejs/plugin-react'
import { defineConfig } from 'vite'

// https://vite.dev/config/
export default defineConfig({
  plugins: [react()],
  server: {
    port: 5173,
    proxy: {
      // Dev-only: forwards /api to the local backend. In production the app
      // makes relative /api/v1 requests and a reverse proxy routes them.
      '/api': {
        target: 'http://localhost:3001',
        changeOrigin: true,
      },
    },
  },
  build: {
    // Split the heavy, rarely-changing vendor libraries out of the app bundle
    // so browsers cache them across deploys and the initial parse is smaller.
    // Pure build-config change — no application code is affected.
    rollupOptions: {
      output: {
        manualChunks(id: string) {
          if (!id.includes('node_modules')) return
          if (id.includes('/antd/') || id.includes('@ant-design/') || id.includes('rc-')) return 'antd-vendor'
          if (id.includes('recharts') || id.includes('/d3-') || id.includes('victory-vendor')) return 'chart-vendor'
          if (id.includes('react-router') || id.includes('/react-dom/') || id.includes('/react/') || id.includes('/scheduler/')) return 'react-vendor'
          if (id.includes('@tanstack') || id.includes('/axios/') || id.includes('/zustand/') || id.includes('/dayjs/')) return 'data-vendor'
          return 'vendor'
        },
      },
    },
  },
})
