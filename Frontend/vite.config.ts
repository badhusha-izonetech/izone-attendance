import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

export default defineConfig({
  plugins: [react()],
  build: {
    target: 'esnext',
    rollupOptions: {
      output: {
        manualChunks(id) {
          if (id.includes('node_modules')) {
            if (id.includes('xlsx')) return 'xlsx'
            if (id.includes('react') || id.includes('react-dom') || id.includes('react-router-dom')) return 'react-vendor'
            return 'vendor'
          }
        },
      },
    },
  },
})
