import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import tailwindcss from '@tailwindcss/vite'
import { fileURLToPath, URL } from 'node:url'
import { filmShell } from './scripts/vite-film-shell.mjs'

const here = (p: string) => fileURLToPath(new URL(p, import.meta.url))

export default defineConfig({
  base: '/',
  // filmShell: index.html is the film site's page (scripts/vite-film-shell.mjs)
  plugins: [react(), tailwindcss(), filmShell({ repo: here('.') })],
  build: {
    target: 'es2022',
    chunkSizeWarningLimit: 1200,
    rollupOptions: {
      // Three pages: the film site (every address but the games; the deploy looks for assets/main-*.js), the mini
      // games' page (scripts/stubs.mjs writes /minigames/ and each game from it), and the unlinked admin at /admin/
      input: {
        main: here('./index.html'),
        game: here('./game-shell.html'),
        admin: here('./admin/index.html'),
      },
    },
  },
  server: {
    port: 5190,
    strictPort: true,
    // Ignore Editor caches, while watching public/unity for newly built media.
    watch: { ignored: [here('./unity') + '/**', '**/output/**', '**/.pages-publish/**'] },
  },
})
