import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import { VitePWA } from 'vite-plugin-pwa'

// Railway and other hosts set PORT; bind on all interfaces so the container is reachable.
const portFromEnv = Number(process.env.PORT)
const usePlatformPort =
  Number.isFinite(portFromEnv) && portFromEnv > 0 ? portFromEnv : null

// https://vite.dev/config/
export default defineConfig({
  server: {
    host: true,
    port: usePlatformPort ?? 5173,
    strictPort: usePlatformPort !== null,
  },
  preview: {
    host: true,
    port: usePlatformPort ?? 4173,
    strictPort: usePlatformPort !== null,
    allowedHosts: ['slideshowbob-production.up.railway.app'],
  },
  plugins: [
    react(),
    VitePWA({
      registerType: 'prompt',
      // PWA configuration will be added later when we implement offline features
      workbox: {
        globPatterns: ['**/*.{js,css,html,ico,png,svg}']
      },
      manifest: {
        name: 'SlideShowBob',
        short_name: 'SlideShowBob',
        description: 'Modern slideshow application',
        theme_color: '#242424',
        icons: [
          {
            src: 'vite.svg',
            sizes: 'any',
            type: 'image/svg+xml'
          }
        ]
      }
    })
  ],
  test: {
    environment: 'jsdom',
    setupFiles: './src/test/setup.ts',
    globals: true
  }
})

