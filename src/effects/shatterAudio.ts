/**
 * Procedural glass-tick synthesis for the shatter layer (§5.6). No audio
 * assets: each tick is a burst of bandpass-filtered noise (the chip) plus two
 * or three inharmonic sine partials (the ring of a small shard). The
 * AudioContext is created lazily on the first *enabled* break event — always
 * downstream of a pointer gesture, so autoplay policy is satisfied — and the
 * footer toggle's SOUND_EVENT suspends/resumes it so a muted context costs
 * nothing.
 */
import { SOUND_EVENT, soundEnabled } from '../lib/motion'

let ctx: AudioContext | null = null
let noiseBuf: AudioBuffer | null = null
let wired = false

function wireToggle() {
  if (wired) return
  wired = true
  window.addEventListener(SOUND_EVENT, (e) => {
    const on = (e as CustomEvent<{ on: boolean }>).detail?.on ?? soundEnabled()
    if (!ctx) return
    if (on) void ctx.resume()
    else void ctx.suspend()
  })
}

function ensureContext(): AudioContext | null {
  if (!ctx) {
    const AC =
      window.AudioContext ??
      (window as unknown as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext
    if (!AC) return null
    try {
      ctx = new AC()
    } catch {
      return null
    }
  }
  if (ctx.state === 'suspended') void ctx.resume()
  return ctx
}

function noise(ac: AudioContext): AudioBuffer {
  if (!noiseBuf) {
    const len = Math.floor(ac.sampleRate * 0.09)
    noiseBuf = ac.createBuffer(1, len, ac.sampleRate)
    const d = noiseBuf.getChannelData(0)
    for (let i = 0; i < len; i++) d[i] = Math.random() * 2 - 1
  }
  return noiseBuf
}

/** Play one tiny glass tick. intensity 0..1 scales level, body and decay. */
export function playGlassTick(intensity: number): void {
  wireToggle()
  if (!soundEnabled()) return
  const ac = ensureContext()
  if (!ac) return
  const t = ac.currentTime
  const k = Math.min(1, Math.max(0, intensity))

  const master = ac.createGain()
  master.gain.setValueAtTime(0.05 + 0.11 * k, t)
  master.connect(ac.destination)

  // Chipped-edge noise burst through a narrow bandpass.
  const src = ac.createBufferSource()
  src.buffer = noise(ac)
  const bp = ac.createBiquadFilter()
  bp.type = 'bandpass'
  bp.frequency.setValueAtTime(3400 + Math.random() * 2600 - k * 900, t)
  bp.Q.value = 9
  const ng = ac.createGain()
  ng.gain.setValueAtTime(1, t)
  ng.gain.exponentialRampToValueAtTime(0.001, t + 0.055 + 0.04 * k)
  src.connect(bp).connect(ng).connect(master)
  src.start(t)
  src.stop(t + 0.12)

  // Two or three inharmonic partials, slightly detuning as they die.
  const partials = 2 + (Math.random() < 0.5 ? 1 : 0)
  for (let i = 0; i < partials; i++) {
    const osc = ac.createOscillator()
    osc.type = 'sine'
    const f = 2200 + Math.random() * 5200 - k * 600
    osc.frequency.setValueAtTime(f, t)
    osc.frequency.exponentialRampToValueAtTime(f * 0.94, t + 0.12)
    const og = ac.createGain()
    og.gain.setValueAtTime(0.0001, t)
    og.gain.linearRampToValueAtTime(0.12 / (i + 1), t + 0.004)
    og.gain.exponentialRampToValueAtTime(0.001, t + 0.07 + 0.05 * k + i * 0.02)
    osc.connect(og).connect(master)
    osc.start(t)
    osc.stop(t + 0.22)
  }
}
