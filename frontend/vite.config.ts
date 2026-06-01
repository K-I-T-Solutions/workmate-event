import { defineConfig, type Plugin } from 'vite'
import react from '@vitejs/plugin-react'
import { VitePWA } from 'vite-plugin-pwa'

async function devPlugins(): Promise<Plugin[]> {
  if (process.env.NODE_ENV === 'production') return []
  const { default: basicSsl } = await import('@vitejs/plugin-basic-ssl')
  return [basicSsl() as Plugin]
}

export default defineConfig(async () => ({
  plugins: [
    react(),
    ...(await devPlugins()),
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
}))
