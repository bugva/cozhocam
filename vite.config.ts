import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

// https://vite.dev/config/
export default defineConfig({
  base: '/cozhocam/',
  plugins: [react()],
  define: {
    'process.env': {}
  },
  optimizeDeps: {
    force: true
  }
})
