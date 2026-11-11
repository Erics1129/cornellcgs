// MP4 "faststart" without ffmpeg: move the moov box in front of mdat and patch chunk offsets (stco/co64).
// usage: node faststart.mjs <in.mp4> <out.mp4>
import fs from 'node:fs'
const [src, dst] = process.argv.slice(2)
const buf = fs.readFileSync(src)
const boxes = []
for (let p = 0; p < buf.length;) { let size = buf.readUInt32BE(p); const type = buf.toString('latin1', p + 4, p + 8); if (size === 1) size = Number(buf.readBigUInt64BE(p + 8)); if (size === 0) size = buf.length - p; boxes.push({ type, start: p, size }); p += size }
const moovBox = boxes.find(b => b.type === 'moov'), mdatBox = boxes.find(b => b.type === 'mdat')
if (!moovBox || !mdatBox) throw new Error('not an mp4 with moov+mdat')
if (moovBox.start < mdatBox.start) { fs.copyFileSync(src, dst); console.log('already faststart'); process.exit(0) }
const moov = Buffer.from(buf.subarray(moovBox.start, moovBox.start + moovBox.size))
const shift = moov.length
const containers = new Set(['moov', 'trak', 'mdia', 'minf', 'stbl'])
let patched = 0
;(function walk(start, end) { for (let p = start; p + 8 <= end;) { const size = moov.readUInt32BE(p), type = moov.toString('latin1', p + 4, p + 8); if (size < 8) break
  if (containers.has(type)) walk(p + 8, p + size)
  else if (type === 'stco') { const n = moov.readUInt32BE(p + 12); for (let i = 0; i < n; i++) { const o = p + 16 + i * 4; moov.writeUInt32BE(moov.readUInt32BE(o) + shift, o) } patched += n }
  else if (type === 'co64') { const n = moov.readUInt32BE(p + 12); for (let i = 0; i < n; i++) { const o = p + 16 + i * 8; moov.writeBigUInt64BE(moov.readBigUInt64BE(o) + BigInt(shift), o) } patched += n }
  p += size } })(8, moov.length)
const parts = []
for (const b of boxes) { if (b.type === 'moov') continue; if (b === mdatBox) parts.push(moov); parts.push(buf.subarray(b.start, b.start + b.size)) }
// moov must come after ftyp but before mdat: boxes before mdat keep their order, so offsets shift by exactly moov.length
fs.writeFileSync(dst, Buffer.concat(parts)); console.log(`faststart ok: moved moov (${shift} bytes), patched ${patched} chunk offsets`)
