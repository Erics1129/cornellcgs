import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import tailwindcss from '@tailwindcss/vite'
import { fileURLToPath, URL } from 'node:url'

const here = (p: string) => fileURLToPath(new URL(p, import.meta.url))

export default defineConfig({
  base: '/',
  plugins: [react(), tailwindcss()],
  build: {
    target: 'es2022',
    chunkSizeWarningLimit: 1200,
    rollupOptions: {
      // Two pages: the site, and the unlinked admin at /admin/
      input: {
        main: here('./index.html'),
        admin: here('./admin/index.html'),
      },
    },
  },
  server: {
    port: 5190,
    strictPort: true,
    // The content API is a Cloudflare Worker on the live domain. In dev it
    // runs locally (`npm run api` → wrangler dev on :8787) and is proxied here
    // so /api/* is same-origin, exactly as in production.
    proxy: {
      '/api': {
        target: 'http://127.0.0.1:8787',
        changeOrigin: false,
      },
    },
  },
})
