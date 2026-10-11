/**
 * Ink Maze: sound effects, made in code with the Web Audio API (no audio files).
 *
 * The game is a glass marble on a wooden board, so the sounds aim for a quiet
 * wooden toy rather than arcade beeps: a low rumble while the ball rolls (louder
 * and brighter when it is fast), a small wet tick as each block takes ink, a
 * wooden knock when the ball hits a wall or the rim, and a few marimba notes
 * when a level is won.
 *
 * Browsers only start audio after a click or a key press, so no AudioContext
 * exists until unlock(), which the page calls from those events. Every method
 * is safe to call before unlock() and after destroy(), and none of them throw:
 * sound must never break the game. Nothing here changes what a move does.
 */
import type { ViewEvent } from './view.ts'

export interface InkMazeSound {
  /** Call from a user gesture (pointerdown or keydown): creates or resumes the AudioContext. */
  unlock(): void
  readonly muted: boolean
  /** Fades the sound out or in, and remembers the choice in this browser. */
  setMuted(muted: boolean): void
  /** View events: 'cell' ticks, 'impact' knocks, 'roll' drives the rolling noise, 'settled' stops it. */
  event(e: ViewEvent): void
  /** A roll over `blocks` blocks begins. */
  rollStart(blocks: number): void
  /** The ball knocks an adjacent wall and stays put. */
  bump(): void
  win(perfect: boolean): void
  lose(): void
  undo(): void
  restart(): void
  /** A level opens. */
  level(): void
  destroy(): void
}

const STORAGE_KEY = 'cgs-inkmaze-sound-v1'
const MASTER_GAIN = 0.35
/** Loudness of the rolling noise at full speed, before the master gain. */
const ROLL_LEVEL = 0.42
/** How long a gesture may take to resume a suspended context before sounds are dropped (ms). */
const RESUME_GRACE_MS = 250

/** One AudioContext and the parts every voice shares. */
type Audio = {
  ctx: BaseAudioContext
  /** An OfflineAudioContext (tests): always ready, never suspended or closed by us. */
  offline: boolean
  /** Every voice connects here; the mute fade happens on this gain. */
  master: GainNode
  /** 1.5 s of white noise for clicks, blots and brushes. */
  white: AudioBuffer
  /** 2 s of brown noise that loops without a seam, for the rolling ball. */
  brown: AudioBuffer
  primed: boolean
}

/** The rolling loop: brown noise through a low filter, with a slow wobble in its loudness. */
type Roll = {
  ctx: BaseAudioContext
  src: AudioBufferSourceNode
  lowpass: BiquadFilterNode
  wobble: OscillatorNode
  wobble2: OscillatorNode
  out: GainNode
}

type Mode = [ratio: number, level: number, decay: number]
/** A wooden block's ringing modes: inharmonic, the higher ones dying faster. */
const WALL_MODES: Mode[] = [
  [1, 1, 0.055],
  [2.32, 0.42, 0.028],
  [3.88, 0.22, 0.016],
  [5.61, 0.1, 0.01],
]
/** The rim is a longer, softer piece of wood: fewer and weaker high modes. */
const RIM_MODES: Mode[] = [
  [1, 1, 0.065],
  [2.21, 0.3, 0.026],
  [3.7, 0.1, 0.014],
]

const NOTE = { B3: 246.94, E4: 329.63, G4: 392, C5: 523.25, E5: 659.25 }

const clamp01 = (x: number) => (x > 1 ? 1 : x > 0 ? x : 0)
const num = (x: unknown, fallback: number) => (typeof x === 'number' && Number.isFinite(x) ? x : fallback)
/** A factor near 1, so repeated sounds are never quite identical. */
const vary = (amount: number) => 1 + (Math.random() * 2 - 1) * amount
const nowMs = () => (typeof performance !== 'undefined' ? performance.now() : Date.now())
const visible = () => typeof document === 'undefined' || !document.hidden

/** Swallows a promise rejection, if the call returned a promise at all (old Safari did not). */
function quietly(result: unknown) {
  if (result && typeof (result as Promise<unknown>).then === 'function') (result as Promise<unknown>).then(undefined, () => {})
}

function readMuted(): boolean {
  try {
    return localStorage.getItem(STORAGE_KEY) === 'off'
  } catch {
    return false
  }
}

function writeMuted(muted: boolean) {
  try {
    localStorage.setItem(STORAGE_KEY, muted ? 'off' : 'on')
  } catch {
    /* storage unavailable: the choice lasts as long as the page */
  }
}

function contextClass(): (new () => AudioContext) | null {
  if (typeof window === 'undefined') return null
  const w = window as unknown as { AudioContext?: new () => AudioContext; webkitAudioContext?: new () => AudioContext }
  return w.AudioContext ?? w.webkitAudioContext ?? null
}

function whiteNoise(ctx: BaseAudioContext, seconds: number): AudioBuffer {
  const length = Math.floor(ctx.sampleRate * seconds)
  const buffer = ctx.createBuffer(1, length, ctx.sampleRate)
  const data = buffer.getChannelData(0)
  for (let i = 0; i < length; i++) data[i] = Math.random() * 2 - 1
  return buffer
}

/** Leaky-integrated white noise (a low rumble), its tail cross-faded into its head so it loops cleanly. */
function brownNoise(ctx: BaseAudioContext, seconds: number): AudioBuffer {
  const length = Math.floor(ctx.sampleRate * seconds)
  const fade = Math.floor(ctx.sampleRate * 0.12)
  const raw = new Float32Array(length + fade)
  const leak = 1 - 120 / ctx.sampleRate // about a 120 Hz corner at any sample rate
  let last = 0
  for (let i = 0; i < raw.length; i++) {
    last = last * leak + (Math.random() * 2 - 1) * (1 - leak) * 4
    raw[i] = last
  }
  const buffer = ctx.createBuffer(1, length, ctx.sampleRate)
  const data = buffer.getChannelData(0)
  for (let i = 0; i < length; i++) {
    if (i < fade) {
      const w = (i / fade) * (Math.PI / 2)
      data[i] = raw[i] * Math.sin(w) + raw[length + i] * Math.cos(w)
    } else {
      data[i] = raw[i]
    }
  }
  let mean = 0
  for (let i = 0; i < length; i++) mean += data[i]
  mean /= length
  let peak = 0
  for (let i = 0; i < length; i++) peak = Math.max(peak, Math.abs(data[i] - mean))
  const scale = peak > 0 ? 1 / peak : 0
  for (let i = 0; i < length; i++) data[i] = (data[i] - mean) * scale
  return buffer
}

function createAudio(muted: boolean): Audio | null {
  const Context = contextClass()
  if (!Context) return null
  const ctx: BaseAudioContext = new Context()
  const offline = typeof OfflineAudioContext !== 'undefined' && ctx instanceof OfflineAudioContext
  const master = ctx.createGain()
  master.gain.value = muted ? 0 : MASTER_GAIN
  // A limiter after the master: overlapping knocks get pressed down instead of clipping.
  const limiter = ctx.createDynamicsCompressor()
  limiter.threshold.value = -8
  limiter.knee.value = 4
  limiter.ratio.value = 20
  limiter.attack.value = 0.002
  limiter.release.value = 0.12
  master.connect(limiter)
  limiter.connect(ctx.destination)
  return { ctx, offline, master, white: whiteNoise(ctx, 1.5), brown: brownNoise(ctx, 2), primed: false }
}

/** Gain envelope: a quick rise to `peak`, an optional hold, then an exponential fall with time constant `decay`. */
function envelope(param: AudioParam, at: number, peak: number, attack: number, decay: number, hold = 0) {
  param.setValueAtTime(0, at)
  param.linearRampToValueAtTime(peak, at + attack)
  if (hold > 0) param.setValueAtTime(peak, at + attack + hold)
  param.setTargetAtTime(0, at + attack + hold, decay)
  return at + attack + hold + decay * 7 // about -60 dB
}

type ToneOptions = {
  at: number
  freq: number
  gain: number
  decay: number
  attack?: number
  /** Start here and glide to `freq` over `glide` seconds. */
  from?: number
  glide?: number
}

function tone(a: Audio, o: ToneOptions) {
  const { ctx } = a
  const osc = ctx.createOscillator()
  const env = ctx.createGain()
  osc.type = 'sine'
  osc.frequency.setValueAtTime(o.from ?? o.freq, o.at)
  if (o.from !== undefined) osc.frequency.exponentialRampToValueAtTime(o.freq, o.at + (o.glide ?? 0.02))
  const end = envelope(env.gain, o.at, o.gain, o.attack ?? 0.002, o.decay)
  osc.connect(env)
  env.connect(a.master)
  osc.onended = () => {
    osc.disconnect()
    env.disconnect()
  }
  osc.start(o.at)
  osc.stop(end)
}

type NoiseOptions = {
  at: number
  gain: number
  decay: number
  attack?: number
  hold?: number
  filter: BiquadFilterType
  freq: number
  /** Sweep the filter to this frequency over the sound's length. */
  toFreq?: number
  q?: number
}

function noise(a: Audio, o: NoiseOptions) {
  const { ctx } = a
  const src = ctx.createBufferSource()
  src.buffer = a.white
  const filter = ctx.createBiquadFilter()
  filter.type = o.filter
  filter.Q.value = o.q ?? 0.8
  const env = ctx.createGain()
  const end = envelope(env.gain, o.at, o.gain, o.attack ?? 0.001, o.decay, o.hold ?? 0)
  filter.frequency.setValueAtTime(o.freq, o.at)
  if (o.toFreq !== undefined) filter.frequency.exponentialRampToValueAtTime(o.toFreq, end)
  src.connect(filter)
  filter.connect(env)
  env.connect(a.master)
  src.onended = () => {
    src.disconnect()
    filter.disconnect()
    env.disconnect()
  }
  src.start(o.at, Math.random() * 0.5)
  src.stop(end)
}

/** A wooden knock: a few damped modes, the glass ball's click, and a low thump from the board on hard hits. */
function knock(a: Audio, at: number, strength: number, dull: boolean, pitch = 1) {
  const s = clamp01(strength)
  const amp = 0.05 + 0.45 * Math.pow(s, 1.1)
  const f0 = (dull ? 196 : 232) * (1.12 - 0.3 * s) * pitch * vary(0.025) // harder hits sound lower
  for (const [ratio, level, decay] of dull ? RIM_MODES : WALL_MODES) {
    const f = f0 * ratio
    tone(a, { at, freq: f, from: f * 1.035, glide: 0.014, gain: amp * level * 0.7, attack: 0.0012, decay: decay * (0.75 + 0.5 * s) })
  }
  noise(a, {
    at,
    gain: amp * (dull ? 0.3 : 0.45),
    attack: 0.0004,
    decay: dull ? 0.0035 : 0.0025,
    filter: dull ? 'lowpass' : 'bandpass',
    freq: dull ? 2400 : 3400,
    q: 0.9,
  })
  if (s > 0.25) tone(a, { at, freq: 92 * pitch, from: 112 * pitch, glide: 0.03, gain: amp * 0.6 * (s - 0.2), attack: 0.003, decay: 0.045 })
}

/** A small wet tick as a block takes ink; a little higher the further along the roll. */
function blot(a: Audio, at: number, step: number, of: number) {
  const along = clamp01(step / Math.max(1, of))
  const f = 540 * Math.pow(2, along * 0.5) * vary(0.03)
  tone(a, { at, freq: f, from: f * 0.7, glide: 0.022, gain: 0.1, attack: 0.002, decay: 0.016 })
  noise(a, { at, gain: 0.07, attack: 0.001, decay: 0.009, filter: 'bandpass', freq: (1500 + 900 * along) * vary(0.05), q: 1.4 })
}

/** A marimba-like bar: the fundamental, the bar's fourth-harmonic overtone, and the mallet's soft thud. */
function marimba(a: Audio, at: number, freq: number, gain: number, soft = false) {
  tone(a, { at, freq, gain, attack: soft ? 0.008 : 0.003, decay: 0.3 * Math.sqrt(330 / freq) })
  tone(a, { at, freq: freq * 3.99, gain: gain * (soft ? 0.07 : 0.2), attack: 0.002, decay: 0.03 })
  if (!soft) tone(a, { at, freq: freq * 9.8, gain: gain * 0.04, attack: 0.001, decay: 0.01 })
  noise(a, { at, gain: gain * (soft ? 0.12 : 0.25), attack: 0.001, decay: 0.006, filter: 'lowpass', freq: 900 })
}

/** A sound that swells and stops short, like a tick played backwards. */
function reverseTick(a: Audio, at: number) {
  const { ctx } = a
  const rise = 0.065
  const end = at + rise + 0.008
  const shape = (param: AudioParam, peak: number) => {
    param.setValueAtTime(0.0001, at)
    param.exponentialRampToValueAtTime(peak, at + rise)
    param.linearRampToValueAtTime(0, end)
  }
  const src = ctx.createBufferSource()
  src.buffer = a.white
  const filter = ctx.createBiquadFilter()
  filter.type = 'bandpass'
  filter.Q.value = 1.3
  filter.frequency.setValueAtTime(2300, at)
  filter.frequency.exponentialRampToValueAtTime(1300, end)
  const hiss = ctx.createGain()
  shape(hiss.gain, 0.16)
  src.connect(filter)
  filter.connect(hiss)
  hiss.connect(a.master)
  src.onended = () => {
    src.disconnect()
    filter.disconnect()
    hiss.disconnect()
  }
  src.start(at, Math.random() * 0.5)
  src.stop(end + 0.01)

  const osc = ctx.createOscillator()
  osc.frequency.setValueAtTime(780, at)
  osc.frequency.exponentialRampToValueAtTime(520, end)
  const body = ctx.createGain()
  shape(body.gain, 0.12)
  osc.connect(body)
  body.connect(a.master)
  osc.onended = () => {
    osc.disconnect()
    body.disconnect()
  }
  osc.start(at)
  osc.stop(end + 0.01)
}

function startRoll(a: Audio): Roll {
  const { ctx } = a
  const at = ctx.currentTime
  const src = ctx.createBufferSource()
  src.buffer = a.brown
  src.loop = true
  const rumbleFloor = ctx.createBiquadFilter() // drop what a speaker cannot play anyway
  rumbleFloor.type = 'highpass'
  rumbleFloor.frequency.value = 45
  const board = ctx.createBiquadFilter() // the hollow of the wooden board
  board.type = 'peaking'
  board.frequency.value = 150
  board.Q.value = 1.2
  board.gain.value = 4
  const lowpass = ctx.createBiquadFilter() // brighter when the ball is faster
  lowpass.type = 'lowpass'
  lowpass.Q.value = 0.6
  lowpass.frequency.value = 200
  const wobbleGain = ctx.createGain() // the ball is never perfectly smooth: a slow, uneven wobble
  wobbleGain.gain.value = 0.72
  const wobble = ctx.createOscillator()
  wobble.frequency.value = 8
  const depth = ctx.createGain()
  depth.gain.value = 0.18
  const wobble2 = ctx.createOscillator()
  wobble2.frequency.value = 5
  const depth2 = ctx.createGain()
  depth2.gain.value = 0.1
  const out = ctx.createGain()
  out.gain.value = 0
  src.connect(rumbleFloor)
  rumbleFloor.connect(board)
  board.connect(lowpass)
  lowpass.connect(wobbleGain)
  wobble.connect(depth)
  depth.connect(wobbleGain.gain)
  wobble2.connect(depth2)
  depth2.connect(wobbleGain.gain)
  wobbleGain.connect(out)
  out.connect(a.master)
  src.onended = () => {
    for (const node of [src, rumbleFloor, board, lowpass, wobbleGain, wobble, depth, wobble2, depth2, out]) node.disconnect()
  }
  src.start(at, Math.random() * a.brown.duration)
  wobble.start(at)
  wobble2.start(at)
  return { ctx, src, lowpass, wobble, wobble2, out }
}

/** Glide the rolling loop toward `speed` (0..1) with time constant `glide`. */
function steerRoll(r: Roll, speed: number, at: number, glide: number) {
  const s = clamp01(speed)
  const set = (param: AudioParam, value: number) => {
    param.cancelScheduledValues(at)
    param.setTargetAtTime(value, at, glide)
  }
  set(r.out.gain, ROLL_LEVEL * Math.pow(s, 1.3))
  set(r.lowpass.frequency, 170 + 950 * s * s)
  set(r.wobble.frequency, 4 + 16 * s)
  set(r.wobble2.frequency, 2.5 + 9 * s)
}

export function createInkMazeSound(): InkMazeSound {
  let muted = readMuted()
  let destroyed = false
  let audio: Audio | null = null
  let roll: Roll | null = null
  let rollTimer: ReturnType<typeof setTimeout> | undefined
  let resumeUntil = 0
  let listening = false
  let lastBlot = -1
  let lastKnock = -1

  /** The audio to play into right now, or null when nothing should play. */
  function ready(): Audio | null {
    const a = audio
    if (!a || destroyed || muted) return null
    if (a.offline) return a
    if (!visible()) return null
    const state = a.ctx.state as string
    if (state === 'running') return a
    // Just unlocked: resume() is still settling, and sounds scheduled now start the moment it does.
    if (state !== 'closed' && nowMs() < resumeUntil) return a
    return null
  }

  /** Runs `play` with ready audio and its current time; drops it otherwise. Never throws. */
  function play(fn: (a: Audio, at: number) => void) {
    try {
      const a = ready()
      if (a) fn(a, a.ctx.currentTime)
    } catch {
      /* sound never breaks the game */
    }
  }

  function stopRoll(glide = 0.05) {
    clearTimeout(rollTimer)
    rollTimer = undefined
    const r = roll
    roll = null
    if (!r) return
    try {
      const at = r.ctx.currentTime
      r.out.gain.cancelScheduledValues(at)
      r.out.gain.setTargetAtTime(0, at, glide)
      const end = at + glide * 8
      r.src.stop(end)
      r.wobble.stop(end)
      r.wobble2.stop(end)
    } catch {
      /* the context is already closed */
    }
  }

  /** Stop the rolling loop if nothing keeps it going for `seconds`: a fallback for a missing 'settled'. */
  function stopRollAfter(seconds: number) {
    clearTimeout(rollTimer)
    rollTimer = setTimeout(() => stopRoll(), seconds * 1000)
  }

  function rollFor(a: Audio): Roll {
    if (!roll || roll.ctx !== a.ctx) roll = startRoll(a)
    return roll
  }

  function onVisibility() {
    const a = audio
    if (!a || destroyed || a.offline) return
    try {
      const ctx = a.ctx as AudioContext
      if (!visible()) {
        stopRoll(0.01)
        if (typeof ctx.suspend === 'function') quietly(ctx.suspend())
      } else if (typeof ctx.resume === 'function') {
        quietly(ctx.resume())
      }
    } catch {
      /* ignore */
    }
  }

  /** iOS Safari only lets a context make sound after something is started inside a gesture. */
  function prime(a: Audio) {
    if (a.primed) return
    a.primed = true
    const src = a.ctx.createBufferSource()
    src.buffer = a.ctx.createBuffer(1, 1, a.ctx.sampleRate)
    src.connect(a.ctx.destination)
    src.onended = () => src.disconnect()
    src.start(0)
  }

  return {
    get muted() {
      return muted
    },

    unlock() {
      if (destroyed) return
      try {
        if (!audio) audio = createAudio(muted)
        const a = audio
        if (!a || a.offline) return
        if (!listening && typeof document !== 'undefined') {
          document.addEventListener('visibilitychange', onVisibility)
          listening = true
        }
        const ctx = a.ctx as AudioContext
        if (ctx.state !== 'running' && visible() && typeof ctx.resume === 'function') {
          resumeUntil = nowMs() + RESUME_GRACE_MS
          quietly(ctx.resume()) // Safari: must be called inside the gesture itself
        }
        prime(a)
      } catch {
        /* no Web Audio here: the game stays silent */
      }
    },

    setMuted(next: boolean) {
      muted = !!next
      writeMuted(muted)
      if (muted) stopRoll(0.03)
      const a = audio
      if (!a || destroyed) return
      try {
        const gain = a.master.gain
        const at = a.ctx.currentTime
        gain.cancelScheduledValues(at)
        gain.setTargetAtTime(muted ? 0 : MASTER_GAIN, at, 0.04)
      } catch {
        /* ignore */
      }
    },

    event(e: ViewEvent) {
      if (!e || typeof e !== 'object') return
      switch (e.type) {
        case 'cell':
          play((a, at) => {
            if (at - lastBlot < 0.012) return // a burst of late events: one tick is enough
            lastBlot = at
            blot(a, at, num(e.step, 1), num(e.of, 1))
          })
          break
        case 'impact':
          play((a, at) => {
            if (at - lastKnock < 0.03) return
            lastKnock = at
            knock(a, at, num(e.strength, 0.5), e.surface === 'rim')
            if (roll) steerRoll(roll, 0.12, at, 0.03) // the ball has all but stopped
          })
          break
        case 'roll':
          play((a, at) => {
            const speed = clamp01(num(e.speed, 0))
            if (!roll && speed < 0.02) return
            steerRoll(rollFor(a), speed, at, 0.045) // events come about 15 times a second: glide between them
            stopRollAfter(0.3)
          })
          break
        case 'settled':
          stopRoll()
          break
      }
    },

    rollStart(blocks: number) {
      play((a, at) => {
        const n = Math.max(1, Math.min(16, Math.round(num(blocks, 1))))
        const duration = Math.min(0.72, 0.09 + 0.058 * n) // the canvas roll's length
        const speed = Math.min(1, 0.45 + 0.04 * n) // longer rolls leave faster
        const r = rollFor(a)
        steerRoll(r, speed, at, 0.012)
        // Rolls ease out, fast then slow. Follow that until 'roll' events take over.
        r.out.gain.setTargetAtTime(ROLL_LEVEL * Math.pow(speed * 0.15, 1.3), at + 0.05, duration * 0.4)
        r.lowpass.frequency.setTargetAtTime(190, at + 0.05, duration * 0.4)
        stopRollAfter(duration + 0.12)
      })
    },

    bump() {
      play((a, at) => {
        if (at - lastKnock < 0.03) return
        lastKnock = at
        knock(a, at, 0.22, false, 1.12)
      })
    },

    win(perfect: boolean) {
      play((a, at) => {
        marimba(a, at, NOTE.E4, 0.21)
        marimba(a, at + 0.105, NOTE.G4, 0.21)
        marimba(a, at + 0.21, NOTE.C5, 0.24)
        if (perfect) marimba(a, at + 0.34, NOTE.E5, 0.21)
      })
    },

    lose() {
      play((a, at) => {
        marimba(a, at, NOTE.E4, 0.18, true)
        marimba(a, at + 0.2, NOTE.B3, 0.2, true)
      })
    },

    undo() {
      play((a, at) => reverseTick(a, at))
    },

    restart() {
      play((a, at) => {
        // a few light clacks, like pieces swept back into place, over a soft brush
        const times = [0, 0.045, 0.1, 0.14, 0.2]
        times.forEach((dt, i) => knock(a, at + dt + Math.random() * 0.012, 0.2 - i * 0.025, false, 1.3 + Math.random() * 0.5))
        noise(a, { at, gain: 0.06, attack: 0.06, hold: 0.08, decay: 0.05, filter: 'bandpass', freq: 700, toFreq: 1800, q: 0.9 })
      })
    },

    level() {
      play((a, at) => marimba(a, at, NOTE.G4, 0.18, true))
    },

    destroy() {
      if (destroyed) return
      stopRoll(0.01)
      destroyed = true
      if (listening && typeof document !== 'undefined') document.removeEventListener('visibilitychange', onVisibility)
      listening = false
      const a = audio
      audio = null
      if (!a || a.offline) return
      try {
        const ctx = a.ctx as AudioContext
        if (typeof ctx.close === 'function') quietly(ctx.close())
      } catch {
        /* ignore */
      }
    },
  }
}
