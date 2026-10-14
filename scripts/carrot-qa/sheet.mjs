// Contact sheet: node scripts/carrot-qa/sheet.mjs out.jpg cols width file1 file2 ... (labels from file names)
const RT = '/Users/eric/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/node_modules'
const sharp = (await import(RT + '/sharp/dist/index.cjs')).default
const [, , out, colsArg, widthArg, ...files] = process.argv
const cols = Number(colsArg) || 4, w = Number(widthArg) || 480
const metas = await Promise.all(files.map(f => sharp(f).metadata()))
const h = Math.round(w * metas[0].height / metas[0].width)
const tiles = await Promise.all(files.map(async (f, i) => {
  const label = f.split('/').pop().replace(/\.(png|jpg)$/, '')
  const svg = Buffer.from(`<svg width="${w}" height="${h}"><rect x="0" y="0" width="${Math.min(w, 12 + label.length * 9)}" height="22" fill="rgba(0,0,0,.6)"/><text x="6" y="16" font-family="Helvetica" font-size="14" fill="#fff">${label}</text></svg>`)
  return { input: await sharp(f).resize(w, h).composite([{ input: svg, top: 0, left: 0 }]).toBuffer(), left: (i % cols) * w, top: Math.floor(i / cols) * h }
}))
const rows = Math.ceil(files.length / cols)
await sharp({ create: { width: cols * w, height: rows * h, channels: 3, background: '#111' } }).composite(tiles).jpeg({ quality: 82 }).toFile(out)
console.log(out, cols * w, 'x', rows * h)
