// usage: node sheet.mjs <dir> <prefix> <out.jpg> <cols> [thumbWidth]
import { chromium } from '/Users/eric/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/node_modules/playwright/index.mjs'
import fs from 'node:fs'; import path from 'node:path'
const [dir, prefix, out, cols, tw = '360'] = process.argv.slice(2)
const files = fs.readdirSync(dir).filter(f => f.startsWith(prefix) && /\.(jpg|png)$/.test(f)).sort()
const html = `<body style="margin:0;background:#111;display:grid;grid-template-columns:repeat(${cols},${tw}px);gap:2px;font:11px monospace;color:#fff">` + files.map(f => `<div style="position:relative"><img src="file://${path.resolve(dir, f)}" style="width:${tw}px;display:block"><span style="position:absolute;left:2px;top:2px;background:#000a;padding:1px 3px">${f.replace(/\.(jpg|png)$/, '')}</span></div>`).join('') + '</body>'
const b = await chromium.launch(); const p = await b.newPage({ viewport: { width: cols * (+tw + 2), height: 400 } })
fs.writeFileSync(out + '.html', html); await p.goto('file://' + path.resolve(out + '.html')); await p.waitForTimeout(500)
await p.screenshot({ path: out, fullPage: true, type: 'jpeg', quality: 72 }); await b.close(); console.log(files.length, '->', out)
