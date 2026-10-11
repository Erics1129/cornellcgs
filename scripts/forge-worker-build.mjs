import {build} from 'esbuild'
await build({entryPoints:['backend/forge/worker.ts'],outfile:'output/forge-worker/worker.js',bundle:true,format:'esm',platform:'browser',target:'es2022',minify:false})
console.log('Worker bundle ready: output/forge-worker/worker.js (no keys needed).')
