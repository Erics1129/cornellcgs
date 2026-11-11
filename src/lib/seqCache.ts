/**
 * seqCache.ts — a frame sequence you can scrub without keeping it all decoded.
 *
 * Three levels:
 *   1. every frame as a compressed Blob (the files themselves, a few MB);
 *   2. a small window of decoded ImageBitmaps around the playhead, biased in
 *      the direction of travel, closed again as the playhead moves on;
 *   3. one proxy atlas holding every frame at thumbnail size, so there is a
 *      picture for any frame at once (after a teleport, or while flying).
 *
 * Nothing is decoded while the page is flying, and release() closes every
 * bitmap (the blobs stay, so coming back costs decodes, not downloads).
 */
export interface SequenceOptions {
  count: number
  url: (index: number) => string
  /** atlas of all frames, row-major */
  proxy?: { url: string; cols: number; rows: number }
  /** decoded frames kept around the playhead */
  window: number
  /** decode at half size (phones); needs frameSize */
  halfRes: boolean
  /** pixel size of one frame file */
  frameSize?: { w: number; h: number }
  /** called when a frame or the proxy became drawable */
  onFrame: () => void
}

export interface ProxyCell { image: ImageBitmap; sx: number; sy: number; sw: number; sh: number }

export interface Sequence {
  /** start downloading: the frame under the playhead first, then a coarse pass, then the rest */
  load(at: number): void
  /** move the playhead; decodes the window unless `flying` */
  seek(frame: number, direction: 1 | -1, flying: boolean): void
  /** the decoded frame, or null */
  get(index: number): ImageBitmap | null
  /** the nearest decoded frame at or beyond `index` in `direction`, or -1 */
  nearest(index: number, direction: 1 | -1): number
  cell(index: number): ProxyCell | null
  /** close every bitmap; blobs are kept */
  release(): void
  dispose(): void
  readonly decoded: number
}

const hasBitmap = typeof createImageBitmap === 'function'

export function createSequence(opts: SequenceOptions): Sequence {
  const { count } = opts
  const blobs: (Blob | null)[] = new Array(count).fill(null)
  const bitmaps: (ImageBitmap | null)[] = new Array(count).fill(null)
  const decoding = new Set<number>()
  let proxy: ImageBitmap | null = null
  let proxyAsked = false
  let started = false
  let disposed = false
  let playhead = 0
  let direction: 1 | -1 = 1
  let size: { w: number; h: number } | null = opts.frameSize ?? null
  let generation = 0

  const wanted = (): number[] => {
    // More frames ahead of the playhead than behind it.
    const ahead = Math.ceil(opts.window * 0.65)
    const behind = Math.max(1, opts.window - ahead - 1)
    const centre = Math.round(playhead)
    const list = [centre, centre + direction]
    for (let k = 2; k <= ahead; k++) list.push(centre + direction * k)
    for (let k = 1; k <= behind; k++) list.push(centre - direction * k)
    return list.filter((i, n) => i >= 0 && i < count && list.indexOf(i) === n)
  }

  const decode = (i: number) => {
    const blob = blobs[i]
    if (!blob || bitmaps[i] || decoding.has(i) || disposed || !hasBitmap) return
    decoding.add(i)
    const mine = generation
    const half = opts.halfRes && size
    const job = half
      ? createImageBitmap(blob, { resizeWidth: Math.round(size!.w / 2), resizeHeight: Math.round(size!.h / 2), resizeQuality: 'medium' })
      : createImageBitmap(blob)
    job
      .then((bitmap) => {
        decoding.delete(i)
        if (disposed || mine !== generation || !wanted().includes(i)) return bitmap.close()
        if (!size) size = { w: bitmap.width, h: bitmap.height }
        bitmaps[i] = bitmap
        opts.onFrame()
      })
      .catch(() => decoding.delete(i))
  }

  const fill = () => {
    const keep = wanted()
    for (let i = 0; i < count; i++) {
      if (bitmaps[i] && !keep.includes(i)) {
        bitmaps[i]!.close()
        bitmaps[i] = null
      }
    }
    // At most three decodes in flight: the playhead first.
    for (const i of keep) {
      if (decoding.size >= 3) break
      decode(i)
    }
  }

  const fetchOne = async (i: number) => {
    if (blobs[i] || disposed) return
    try {
      const res = await fetch(opts.url(i))
      if (!res.ok) return
      blobs[i] = await res.blob()
      if (!disposed && wanted().includes(i)) fill()
    } catch {
      /* a missing frame: its neighbours and the proxy cover for it */
    }
  }

  const fetchProxy = async () => {
    if (!opts.proxy || proxyAsked || !hasBitmap) return
    proxyAsked = true
    try {
      const res = await fetch(opts.proxy.url)
      if (!res.ok) return
      const bitmap = await createImageBitmap(await res.blob())
      if (disposed) return bitmap.close()
      proxy = bitmap
      opts.onFrame()
    } catch {
      proxyAsked = false
    }
  }

  return {
    load(at) {
      if (started || disposed) return
      started = true
      playhead = at
      void fetchProxy()
      const order: number[] = [Math.max(0, Math.min(count - 1, Math.round(at)))]
      for (const step of [16, 8, 4, 2, 1]) for (let i = 0; i < count; i += step) if (!order.includes(i)) order.push(i)
      if (!order.includes(count - 1)) order.push(count - 1)
      let next = 0
      const worker = async () => {
        while (next < order.length && !disposed) await fetchOne(order[next++])
      }
      void Promise.all([worker(), worker(), worker(), worker()])
    },
    seek(frame, dir, flying) {
      playhead = frame
      direction = dir
      if (!proxy) void fetchProxy()
      if (!flying) fill()
    },
    get: (i) => bitmaps[i] ?? null,
    nearest(index, dir) {
      for (let k = index; k >= 0 && k < count; k += dir) if (bitmaps[k]) return k
      return -1
    },
    cell(index) {
      if (!proxy || !opts.proxy) return null
      const { cols, rows } = opts.proxy
      const sw = proxy.width / cols
      const sh = proxy.height / rows
      const i = Math.max(0, Math.min(count - 1, index))
      // half a texel in, so a scaled-up cell never bleeds into its neighbour
      return { image: proxy, sx: (i % cols) * sw + 0.5, sy: Math.floor(i / cols) * sh + 0.5, sw: sw - 1, sh: sh - 1 }
    },
    release() {
      generation++
      decoding.clear()
      for (let i = 0; i < count; i++) {
        bitmaps[i]?.close()
        bitmaps[i] = null
      }
    },
    dispose() {
      disposed = true
      this.release()
      proxy?.close()
      proxy = null
      blobs.fill(null)
    },
    get decoded() {
      return bitmaps.reduce((n, b) => n + (b ? 1 : 0), 0)
    },
  }
}
