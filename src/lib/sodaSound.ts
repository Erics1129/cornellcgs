/**
 * Sound for the ice in soda film, synthesized in code with Web Audio. No files
 * are loaded: every sound is built from tiny bubble resonances, the way real
 * fizz works. A bubble rings at a pitch set by its size and rises as it
 * reaches the surface, so the fizz is thousands of short high chirps, the
 * cube's trailing air is a handful of low ones, and the plop is one big one.
 *
 * Sound is on by default. Browsers keep every page silent until the visitor
 * first taps, clicks, touches or presses a key, so the engine unlocks itself
 * on that first gesture anywhere on the page, without asking. Muting is
 * remembered.
 */
const MUTE_KEY = 'cgs-soda-sound'
export const SODA_SOUND_EVENT = 'cgs:soda-sound'

export function sodaMuted(): boolean {
  try {
    return localStorage.getItem(MUTE_KEY) === 'off'
  } catch {
    return false
  }
}

export function setSodaMuted(muted: boolean) {
  try {
    localStorage.setItem(MUTE_KEY, muted ? 'off' : 'on')
  } catch {
    /* private mode, this visit only */
  }
  window.dispatchEvent(new CustomEvent(SODA_SOUND_EVENT, { detail: { muted } }))
}

const sstep = (a: number, b: number, x: number) => {
  const t = Math.min(1, Math.max(0, (x - a) / (b - a)))
  return t * t * (3 - 2 * t)
}

/** a seeded random so the sounds are the same on every visit */
function rng(seed: number) {
  let s = seed >>> 0
  return () => {
    s = (s * 1664525 + 1013904223) >>> 0
    return s / 4294967296
  }
}

/** add one bubble ring into a channel: a decaying sine that rises in pitch */
function bubble(out: Float32Array, sr: number, at: number, f0: number, rise: number, tau: number, amp: number, wrap: boolean) {
  const n = Math.ceil(tau * 6 * sr)
  const start = Math.floor(at * sr)
  const fall = Math.exp(-1 / (tau * sr))
  const atk = sr * 0.0006
  let env = amp
  let phase = 0
  for (let i = 0; i < n; i++) {
    const f = f0 * (1 + (rise * i) / sr)
    phase += (2 * Math.PI * f) / sr
    const v = (i < atk ? i / atk : 1) * env * Math.sin(phase)
    env *= fall
    let k = start + i
    if (k >= out.length) {
      if (!wrap) break
      k -= out.length
    }
    out[k] += v
  }
}

/** scale a buffer so its loudest sample sits at peak */
function normalize(buf: AudioBuffer, peak: number) {
  let m = 0
  for (let ch = 0; ch < buf.numberOfChannels; ch++) for (const v of buf.getChannelData(ch)) m = Math.max(m, Math.abs(v))
  if (m <= 0) return buf
  const k = peak / m
  for (let ch = 0; ch < buf.numberOfChannels; ch++) {
    const d = buf.getChannelData(ch)
    for (let i = 0; i < d.length; i++) d[i] *= k
  }
  return buf
}

/** a seamless loop of carbonation: many tiny high chirps over a soft hiss */
function makeFizz(ctx: BaseAudioContext): AudioBuffer {
  const sr = ctx.sampleRate
  const len = Math.floor(sr * 4)
  const buf = ctx.createBuffer(2, len, sr)
  {
    const r = rng(11)
    const d = buf.getChannelData(0)
    // the hiss: white noise through a gentle high pass
    let lp = 0
    for (let i = 0; i < len; i++) {
      const w = r() * 2 - 1
      lp += (w - lp) * 0.12
      d[i] = (w - lp) * 0.018
    }
    // the bubbles, most tiny and quiet, a few bigger and louder
    const count = 1800
    for (let b = 0; b < count; b++) {
      const size = Math.pow(r(), 2.4)
      const f0 = 9000 - size * 6200 + r() * 600
      const amp = 0.01 + Math.pow(r(), 6) * 0.07 + size * 0.02
      bubble(d, sr, r() * 4, f0, 0.8 + r() * 2.5, 0.0012 + size * 0.004, amp, true)
    }
    // the right ear hears the same glass half a loop later, so it sounds wide
    const right = buf.getChannelData(1)
    const half = len >> 1
    for (let i = 0; i < len; i++) right[i] = d[(i + half) % len]
  }
  return normalize(buf, 0.3)
}

/** the cube going in: a thump, one big rising plunk, the splash and the crown raining back */
function makePlop(ctx: BaseAudioContext): AudioBuffer {
  const sr = ctx.sampleRate
  const len = Math.floor(sr * 1.8)
  const buf = ctx.createBuffer(2, len, sr)
  for (let ch = 0; ch < 2; ch++) {
    const r = rng(5 + ch * 31)
    const d = buf.getChannelData(ch)
    // body thump
    let ph = 0
    for (let i = 0; i < sr * 0.25; i++) {
      const t = i / sr
      ph += (2 * Math.PI * (95 - 40 * t)) / sr
      d[i] += Math.sin(ph) * Math.exp(-t / 0.05) * 0.55
    }
    // the plunk, the sound a drop of water is famous for, only deeper
    bubble(d, sr, 0.012, 240, 5.5, 0.07, 0.6, false)
    bubble(d, sr, 0.03, 410, 4, 0.045, 0.25, false)
    // the splash, band limited noise with a fast front and a long tail
    let a = 0
    let b = 0
    for (let i = 0; i < sr * 0.9; i++) {
      const t = i / sr
      const w = r() * 2 - 1
      a += (w - a) * 0.45
      b += (a - b) * 0.08
      const env = Math.min(1, t / 0.006) * Math.exp(-t / 0.16)
      d[i] += (a - b) * env * 0.65
    }
    // droplets from the crown falling back over the next second
    for (let k = 0; k < 70; k++) {
      const at = 0.12 + Math.pow(r(), 0.7) * 1.2
      const size = r()
      bubble(d, sr, at, 900 + (1 - size) * 2600, 3 + r() * 3, 0.004 + size * 0.012, 0.05 + size * 0.11 * Math.exp(-at), false)
    }
    // a few of the cube's first trapped bubbles letting go
    for (let k = 0; k < 6; k++) bubble(d, sr, 0.18 + r() * 0.5, 300 + r() * 380, 3 + r() * 2, 0.03 + r() * 0.03, 0.12, false)
  }
  return normalize(buf, 0.62)
}

/** single low bloops for the air the cube drags down, a handful of sizes */
function makeBloops(ctx: BaseAudioContext): AudioBuffer[] {
  const sr = ctx.sampleRate
  const r = rng(77)
  const out: AudioBuffer[] = []
  for (let k = 0; k < 8; k++) {
    const buf = ctx.createBuffer(1, Math.floor(sr * 0.5), sr)
    const d = buf.getChannelData(0)
    const f = 170 + k * 70 + r() * 40
    bubble(d, sr, 0.002, f, 2.4 + r() * 2, 0.04 + (7 - k) * 0.008, 0.45, false)
    if (r() > 0.5) bubble(d, sr, 0.02 + r() * 0.05, f * 1.7, 3, 0.02, 0.15, false)
    out.push(buf)
  }
  return out
}

export type SodaSound = {
  /** p is the film's scroll progress, vis how much of the section is on screen (0..1) */
  update: (p: number, vis: number) => void
  dispose: () => void
}

export function createSodaSound(): SodaSound {
  const AC: typeof AudioContext | undefined =
    typeof window === 'undefined' ? undefined : window.AudioContext ?? (window as unknown as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext
  if (!AC) return { update: () => {}, dispose: () => {} }

  let ctx: AudioContext | null = null
  let master: GainNode | null = null
  let fizzGain: GainNode | null = null
  let water: BiquadFilterNode | null = null
  let plop: AudioBuffer | null = null
  let bloops: AudioBuffer[] = []
  let muted = sodaMuted()
  let unlocked = false
  let disposed = false

  let lastP = -1
  let lastT = 0
  let vis = 0
  let armed = true
  let bloopDebt = 0

  const build = () => {
    if (ctx) return ctx
    ctx = new AC({ latencyHint: 'interactive' })
    master = ctx.createGain()
    master.gain.value = 0
    // a gentle limiter so a fast fling through the splash never clips
    const limit = ctx.createDynamicsCompressor()
    limit.threshold.value = -10
    limit.knee.value = 8
    limit.ratio.value = 8
    limit.attack.value = 0.003
    limit.release.value = 0.2
    master.connect(limit).connect(ctx.destination)
    // everything passes the water filter, which closes as the camera goes under
    water = ctx.createBiquadFilter()
    water.type = 'lowpass'
    water.frequency.value = 16000
    water.Q.value = 0.4
    water.connect(master)
    fizzGain = ctx.createGain()
    fizzGain.gain.value = 0
    fizzGain.connect(water)
    // the buffers take a moment to build, so do it just after the gesture
    // rather than inside it, and the first tap never stutters
    const c = ctx
    window.setTimeout(() => {
      if (disposed || !fizzGain) return
      plop = makePlop(c)
      bloops = makeBloops(c)
      window.setTimeout(() => {
        if (disposed || !fizzGain) return
        const fizz = c.createBufferSource()
        fizz.buffer = makeFizz(c)
        fizz.loop = true
        fizz.connect(fizzGain)
        fizz.start()
      }, 30)
    }, 0)
    return ctx
  }

  const level = () => (muted || !unlocked ? 0 : 0.7 * Math.min(1, vis * 1.4))

  const setMaster = () => {
    if (!ctx || !master) return
    master.gain.setTargetAtTime(level(), ctx.currentTime, 0.12)
  }

  // the first real gesture anywhere on the page wakes the audio, no prompt
  const GESTURES = ['pointerdown', 'pointerup', 'touchend', 'keydown', 'click'] as const
  const unlock = () => {
    if (disposed) return
    const c = build()
    const done = () => {
      if (c.state !== 'running') return
      unlocked = true
      GESTURES.forEach((g) => window.removeEventListener(g, unlock, true))
      setMaster()
    }
    if (c.state === 'running') done()
    else c.resume().then(done).catch(() => {})
  }
  GESTURES.forEach((g) => window.addEventListener(g, unlock, { capture: true, passive: true }))

  const onMute = (e: Event) => {
    muted = !!(e as CustomEvent<{ muted: boolean }>).detail?.muted
    if (!muted) unlock()
    setMaster()
  }
  window.addEventListener(SODA_SOUND_EVENT, onMute)

  const onHidden = () => {
    if (!ctx) return
    if (document.hidden) ctx.suspend().catch(() => {})
    else if (unlocked) ctx.resume().catch(() => {})
  }
  document.addEventListener('visibilitychange', onHidden)

  const playBloop = (gain: number) => {
    if (!ctx || !water || !bloops.length) return
    const src = ctx.createBufferSource()
    src.buffer = bloops[Math.floor(Math.random() * bloops.length)]
    src.playbackRate.value = 0.85 + Math.random() * 0.4
    const g = ctx.createGain()
    g.gain.value = gain
    const pan = ctx.createStereoPanner ? ctx.createStereoPanner() : null
    if (pan) {
      pan.pan.value = Math.random() * 0.8 - 0.4
      src.connect(g).connect(pan).connect(water)
    } else src.connect(g).connect(water)
    src.start(ctx.currentTime + Math.random() * 0.03)
  }

  const update = (p: number, v: number) => {
    vis = v
    const now = performance.now()
    const dt = Math.max(1, now - lastT) / 1000
    const dp = lastP < 0 ? 0 : p - lastP
    lastP = p
    lastT = now
    if (!ctx || !unlocked || muted) {
      // keep the splash armed correctly even while silent
      if (p < 0.2) armed = true
      if (p > 0.24) armed = false
      setMaster()
      return
    }
    setMaster()
    const t = ctx.currentTime
    // fizz: quiet at the start, livelier once the cube has stirred the cola
    fizzGain!.gain.setTargetAtTime(0.32 + 0.4 * sstep(0.22, 0.3, p) - 0.18 * sstep(0.85, 1, p), t, 0.15)
    // under the surface the world goes muffled
    const under = sstep(0.36, 0.55, p)
    water!.frequency.setTargetAtTime(16000 * Math.pow(1800 / 16000, under), t, 0.1)

    // the plop, once, the moment the cube meets the surface going forward
    if (p < 0.2) armed = true
    if (armed && p >= 0.235 && dp > 0) {
      armed = false
      if (!plop) return
      const src = ctx.createBufferSource()
      src.buffer = plop
      const g = ctx.createGain()
      // a fast fling gets a bigger splash
      g.gain.value = Math.min(1.25, 0.75 + Math.abs(dp / dt) * 0.8)
      src.connect(g).connect(master!)
      src.start()
    }

    // the plunge drags air down: bloops follow the scroll speed
    if (p > 0.25 && p < 0.97) {
      const zone = sstep(0.25, 0.32, p) * (1 - sstep(0.88, 0.97, p))
      bloopDebt += Math.min(6, Math.abs(dp / dt) * 22) * zone * dt + (p > 0.75 ? 0.6 * dt : 0)
      while (bloopDebt > 1) {
        bloopDebt -= 1
        playBloop(0.22 + Math.random() * 0.3)
      }
    } else bloopDebt = 0
  }

  return {
    update,
    dispose: () => {
      disposed = true
      GESTURES.forEach((g) => window.removeEventListener(g, unlock, true))
      window.removeEventListener(SODA_SOUND_EVENT, onMute)
      document.removeEventListener('visibilitychange', onHidden)
      ctx?.close().catch(() => {})
      ctx = null
    },
  }
}
