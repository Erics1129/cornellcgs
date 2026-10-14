import {build} from 'esbuild'
await build({entryPoints:['backend/account/worker.ts'],outfile:'output/account-worker/worker.js',bundle:true,format:'esm',platform:'browser',target:'es2022',minify:false})
console.log('Worker bundle ready: output/account-worker/worker.js (no keys needed; SESSION_SECRET is set in the Cloudflare dashboard).')
