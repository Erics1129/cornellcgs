// Minimal MP4 box walker: frames, keyframes (stss), duration, coded size, codec. No ffprobe on this Mac.
import fs from 'node:fs'
const containers = new Set(['moov','trak','mdia','minf','stbl','edts'])
function walk(buf, start, end, out, depth = 0) {
  let p = start
  while (p + 8 <= end) {
    let size = buf.readUInt32BE(p); const type = buf.toString('latin1', p + 4, p + 8); let head = 8
    if (size === 1) { size = Number(buf.readBigUInt64BE(p + 8)); head = 16 } else if (size === 0) size = end - p
    if (size < head) break
    const body = p + head
    if (containers.has(type)) walk(buf, body, p + size, out, depth + 1)
    else if (type === 'mvhd') { const v = buf[body]; const ts = buf.readUInt32BE(body + (v ? 20 : 12)); const dur = v ? Number(buf.readBigUInt64BE(body + 24)) : buf.readUInt32BE(body + 16); out.duration = dur / ts }
    else if (type === 'stss') out.keyframes = buf.readUInt32BE(body + 4)
    else if (type === 'stsz') { const n = buf.readUInt32BE(body + 8); if (!out.isVideoPending) out.samplesAny = n; out.lastStsz = n }
    else if (type === 'stsd') { const fmt = buf.toString('latin1', body + 12, body + 16); out.lastFmt = fmt; if (['avc1','hvc1','hev1','av01','vp09'].includes(fmt)) { out.codec = fmt; out.w = buf.readUInt16BE(body + 8 + 32); out.h = buf.readUInt16BE(body + 8 + 34); out.videoStbl = true } else out.videoStbl = false }
    else if (type === 'ctts') out.hasCtts = true
    if (type === 'stbl') { if (out.videoStbl) { out.frames = out.lastStsz; out.kf = out.keyframes ?? 'none(stss absent = all sync)'; out.bframes = !!out.hasCtts } out.keyframes = undefined; out.hasCtts = false }
    p += size
  }
}
for (const f of process.argv.slice(2)) {
  const fd = fs.openSync(f, 'r'); const st = fs.fstatSync(fd)
  // find moov: scan top-level boxes
  let p = 0; const head = Buffer.alloc(16); let moov = null
  while (p < st.size) { fs.readSync(fd, head, 0, 16, p); let size = head.readUInt32BE(0); const type = head.toString('latin1', 4, 8); if (size === 1) size = Number(head.readBigUInt64BE(8)); if (size === 0) size = st.size - p; if (type === 'moov') { moov = Buffer.alloc(size); fs.readSync(fd, moov, 0, size, p); break } p += size }
  const out = { moovAt: p }
  if (moov) walk(moov, 8, moov.length, out)
  const name = f.split('/public/')[1]
  console.log([name, (st.size / 1e6).toFixed(1) + 'MB', out.codec, `${out.w}x${out.h}`, `${out.duration?.toFixed(2)}s`, `frames=${out.frames}`, `keyframes=${out.kf}`, `fps=${(out.frames / out.duration).toFixed(1)}`, `bframes(ctts)=${out.bframes}`, `faststart=${out.moovAt < 1000}`, `Mbps=${(st.size * 8 / out.duration / 1e6).toFixed(1)}`].join(' | '))
}
