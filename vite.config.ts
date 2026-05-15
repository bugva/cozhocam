import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import { VitePWA } from 'vite-plugin-pwa'

// https://vite.dev/config/
export default defineConfig({
  base: '/cozhocam/',
  plugins: [
    react(),
    VitePWA({
      registerType: 'autoUpdate',
      includeAssets: ['favicon.svg'],
      manifest: false,
      workbox: {
        globPatterns: ['**/*.{js,css,html,ico,png,svg,woff2,webmanifest}'],
        navigateFallback: '/cozhocam/index.html',
        navigateFallbackDenylist: [/^\/cozhocam\/api\//],
      },
      devOptions: {
        enabled: false,
      },
    }),
  ],
  define: {
    'process.env': {}
  },
  optimizeDeps: {
    force: true
  }
})
