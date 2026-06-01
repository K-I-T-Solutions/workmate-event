import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import { VitePWA } from 'vite-plugin-pwa'
import basicSsl from '@vitejs/plugin-basic-ssl'

export default defineConfig({
  plugins: [
    react(),
    basicSsl(),
    VitePWA({
      registerType: 'autoUpdate',
      workbox: { globPatterns: ['**/*.{js,css,html,ico,png,svg}'] },
      manifest: {
        name: 'Workmate Event',
        short_name: 'WM Event',
        description: 'K.I.T. Solutions – Event Management',
        theme_color: '#232223',
        background_color: '#232223',
        display: 'standalone',
        orientation: 'portrait',
        start_url: '/',
        icons: [
          { src: '/icon-192.png', sizes: '192x192', type: 'image/png' },
          { src: '/icon-512.png', sizes: '512x512', type: 'image/png' }
        ]
      }
    })
  ],
  server: {
    port: 3090,
    proxy: {
      '/api': { target: 'http://localhost:8091', changeOrigin: true },
      '/ws':  { target: 'ws://localhost:8091',  ws: true },
      '/program': { target: 'http://localhost:8091', changeOrigin: true }
    }
  }
})
