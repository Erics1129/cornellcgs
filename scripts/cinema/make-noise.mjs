// Film grain tile for the lens (src/effects/FilmLens.tsx). No dependencies: Node's zlib only.
//   node scripts/cinema/make-noise.mjs [size=256] [seed=0xC65F11A] [out=public/assets/film/grain-256.png]
// Output: an indexed PNG (4 bit, 16 palette entries with alpha): black or white speckle whose alpha is the
// noise amplitude. Drawn with normal blending at --grain opacity it shows on black (white specks), on ivory
// (black specks) and dithers dark CSS gradients. Pure white noise, so the tile has no visible seam or period.
import zlib from 'node:zlib'
import fs from 'node:fs'

const size = Number(process.argv[2] ?? 256)
const seed = Number(process.argv[3] ?? 0xc65f11a)
const out = process.argv[4] ?? 'public/assets/film/grain-256.png'

// mulberry32
let s = seed >>> 0
const rnd = () => {
  s = (s + 0x6d2b79f5) >>> 0
  let t = s
  t = Math.imul(t ^ (t >>> 15), t | 1)
  t ^= t + Math.imul(t ^ (t >>> 7), t | 61)
  return ((t ^ (t >>> 14)) >>> 0) / 4294967296
}
// triangular-ish gaussian (sum of four uniforms), sigma about 0.29, range -1..1
const gauss = () => (rnd() + rnd() + rnd() + rnd() - 2) / 2

const LEVELS = 8
const idx = new Uint8Array(size * size)
for (let i = 0; i < idx.length; i++) {
  const n = gauss() * 1.9
  const a = Math.min(LEVELS - 1, Math.round(Math.min(1, Math.abs(n)) ** 1.15 * (LEVELS - 1)))
  idx[i] = (n > 0 ? LEVELS : 0) + a
}

const crcTable = new Int32Array(256).map((_, n) => {
  let c = n
  for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1
  return c
})
const crc = (buf) => {
  let c = -1
  for (const b of buf) c = crcTable[(c ^ b) & 255] ^ (c >>> 8)
  return (c ^ -1) >>> 0
}
const chunk = (type, data) => {
  const len = Buffer.alloc(4)
  len.writeUInt32BE(data.length)
  const body = Buffer.concat([Buffer.from(type, 'ascii'), data])
  const sum = Buffer.alloc(4)
  sum.writeUInt32BE(crc(body))
  return Buffer.concat([len, body, sum])
}

const ihdr = Buffer.alloc(13)
ihdr.writeUInt32BE(size, 0)
ihdr.writeUInt32BE(size, 4)
ihdr[8] = 4 // bit depth
ihdr[9] = 3 // indexed colour
const plte = Buffer.alloc(16 * 3)
const trns = Buffer.alloc(16)
for (let i = 0; i < 16; i++) {
  const white = i >= LEVELS
  plte.fill(white ? 255 : 0, i * 3, i * 3 + 3)
  // dark speckle is held at 60%: on ivory stock and inside white letterforms the grain stays quiet
  trns[i] = Math.round(((i % LEVELS) / (LEVELS - 1)) * 255 * (white ? 1 : 0.6))
}
const stride = size / 2 + 1
const raw = Buffer.alloc(stride * size)
for (let y = 0; y < size; y++) {
  for (let x = 0; x < size; x += 2) raw[y * stride + 1 + x / 2] = (idx[y * size + x] << 4) | idx[y * size + x + 1]
}
const png = Buffer.concat([
  Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]),
  chunk('IHDR', ihdr), chunk('PLTE', plte), chunk('tRNS', trns),
  chunk('IDAT', zlib.deflateSync(raw, { level: 9 })), chunk('IEND', Buffer.alloc(0)),
])
fs.writeFileSync(out, png)
console.log(`${out}: ${size}x${size}, seed 0x${seed.toString(16)}, ${png.length} bytes`)
