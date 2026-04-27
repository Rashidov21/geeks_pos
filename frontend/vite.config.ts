import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

const API = 'http://127.0.0.1:8000'

// https://vite.dev/config/
export default defineConfig({
  plugins: [react()],
  build: {
    sourcemap: false,
    rollupOptions: {
      output: {
        manualChunks(id) {
          if (id.includes('node_modules')) {
            if (id.includes('react-router-dom')) return 'router'
            if (id.includes('react-i18next') || id.includes('i18next')) return 'i18n'
            if (id.includes('lucide-react')) return 'icons'
            return 'vendor'
          }
          if (id.includes('/src/pages/')) return 'pages'
          if (id.includes('/src/components/')) return 'components'
          return undefined
        },
      },
    },
  },
  server: {
    proxy: {
      '/api': {
        target: API,
        changeOrigin: true,
      },
    },
  },
})
