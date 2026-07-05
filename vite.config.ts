import { defineConfig } from 'vitest/config';
import preact from '@preact/preset-vite';
import { VitePWA } from 'vite-plugin-pwa';

export default defineConfig({
  css: {
    modules: {
      generateScopedName: 'pr_[hash:base64:8]'
    }
  },
  plugins: [
    preact(),
    VitePWA({
      injectRegister: null,
      workbox: {
        globPatterns: ['**/*.{css,html,js,png,svg,webmanifest,woff,woff2}']
      },
      manifest: {
        name: 'Pin Reveal',
        short_name: 'Pin Reveal',
        description:
          'Reveal deterministic PINs from a passphrase, identity, and label.',
        start_url: '/',
        scope: '/',
        display: 'standalone',
        background_color: '#0f172a',
        theme_color: '#f8fafc',
        icons: [
          {
            src: '/icons/pin-reveal-icon-192.png',
            sizes: '192x192',
            type: 'image/png'
          },
          {
            src: '/icons/pin-reveal-icon-512.png',
            sizes: '512x512',
            type: 'image/png'
          },
          {
            src: '/icons/pin-reveal-maskable-512.png',
            sizes: '512x512',
            type: 'image/png',
            purpose: 'maskable'
          }
        ]
      }
    })
  ],
  test: {
    environment: 'jsdom',
    globals: true,
    setupFiles: './src/test/setup.ts'
  }
});
