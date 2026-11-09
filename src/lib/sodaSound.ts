/**
 * Sound for the ice in soda film, made from real recordings (see
 * public/soda/sfx/CREDITS.md). Three files, all small:
 *   fizz.mp3     a glass of soda fizzing, looped under the whole film
 *   plop.mp3     the cube hitting the surface, played once on the way in
 *   bubbles.mp3  air bubbling up through water, looped, louder while the
 *                cube plunges and the camera is under
 *
 * Sound is on by default. Browsers keep every page silent until the visitor
 * first taps, clicks, touches or presses a key, so the engine unlocks itself
 * on that first gesture anywhere on the page, without asking. Muting is
 * remembered. A file that fails to load just stays silent.
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

const SFX = `${import.meta.env.BASE_URL}soda/sfx/`

async function load(ctx: BaseAudioContext, name: string): Promise<AudioBuffer | null> {
  try {
    const res = await fetch(SFX + name)
    if (!res.ok) return null
    const data = await res.arrayBuffer()
    // Safari still wants the callback form
    return await new Promise<AudioBuffer>((ok, bad) => ctx.decodeAudioData(data, ok, bad))
  } catch {
    return null
  }
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
  let bubbleGain: GainNode | null = null
  let plop: AudioBuffer | null = null
  let muted = sodaMuted()
  let unlocked = false
  let disposed = false

  let lastP = -1
  let lastT = 0
  let vis = 0
  let armed = true
  let churn = 0

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
    bubbleGain = ctx.createGain()
    bubbleGain.gain.value = 0
    bubbleGain.connect(water)
    // fetch and decode the recordings off the gesture, so the first tap never stutters
    const c = ctx
    const loop = (buf: AudioBuffer | null, into: GainNode | null) => {
      if (!buf || !into || disposed) return
      const src = c.createBufferSource()
      src.buffer = buf
      src.loop = true
      // start somewhere random so a revisit doesn't sound like a rerun
      src.start(0, Math.random() * buf.duration)
      src.connect(into)
    }
    load(c, 'fizz.mp3').then((b) => loop(b, fizzGain))
    load(c, 'bubbles.mp3').then((b) => loop(b, bubbleGain))
    load(c, 'plop.mp3').then((b) => {
      if (!disposed) plop = b
    })
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

  let settle = 0
  const playPlop = (gain: number) => {
    if (!ctx || !master || !plop) return
    const src = ctx.createBufferSource()
    src.buffer = plop
    // a hair of pitch spread so a second visit isn't identical
    src.playbackRate.value = 0.94 + Math.random() * 0.12
    const g = ctx.createGain()
    // a fast fling gets a bigger splash
    g.gain.value = gain
    src.connect(g).connect(master)
    src.start()
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
      if (plop) playPlop(Math.min(1.2, 0.8 + Math.abs(dp / dt) * 0.6))
    }

    // the plunge drags air down: bubbling swells with scroll speed, and a
    // little keeps rising on its own once the camera is under
    const zone = sstep(0.24, 0.3, p) * (1 - sstep(0.9, 0.98, p))
    const speed = Math.min(1, Math.abs(dp / dt) * 3)
    churn += (speed - churn) * Math.min(1, dt * 4)
    bubbleGain!.gain.setTargetAtTime(zone * (0.12 + 0.25 * under + 0.9 * churn), t, 0.08)
    // scrolling stopped: keep easing the bubbling back down to its resting level
    window.clearTimeout(settle)
    if (churn > 0.02) settle = window.setTimeout(() => update(lastP, vis), 100)
  }

  return {
    update,
    dispose: () => {
      disposed = true
      window.clearTimeout(settle)
      GESTURES.forEach((g) => window.removeEventListener(g, unlock, true))
      window.removeEventListener(SODA_SOUND_EVENT, onMute)
      document.removeEventListener('visibilitychange', onHidden)
      ctx?.close().catch(() => {})
      ctx = null
    },
  }
}
