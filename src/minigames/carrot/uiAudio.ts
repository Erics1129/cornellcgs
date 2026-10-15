import { getAudioBus, getAudioPrefs, preferPlaybackSession } from './audioPrefs'

/**
 * Menu sounds before (and around) the Unity player, synthesised with Web Audio: no files, so nothing to download and
 * no Ogg that Safari cannot decode. Once the game has loaded, the sounds reuse Unity's own unlocked AudioContext (and
 * reach its master bus); before that, one lazy context is created on the first gesture and closed as soon as Unity's
 * exists, so iOS never runs two contexts at different sample rates.
 */
type Kind = 'click' | 'open' | 'close' | 'hover'
let own: AudioContext | undefined
let last = 0

function context(): AudioContext | null {
  const unity = getAudioBus().context
  if (unity) {
    if (own) { const c = own; own = undefined; void c.close().catch(() => {}) }
    return unity.state === 'closed' ? null : unity
  }
  if (!own) {
    const C = window.AudioContext || (window as unknown as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext
    if (!C) return null
    try { own = new C() } catch { return null }
  }
  if (own.state === 'suspended') void own.resume().catch(() => {})
  return own
}

/** One voice: a sine whose pitch glides from `from` to `to` Hz, linear attack and exponential decay. */
function chirp(ctx: AudioContext, out: AudioNode, at: number, from: number, to: number, glide: number, attack: number, decay: number, peak: number) {
  const osc = ctx.createOscillator(), env = ctx.createGain()
  osc.type = 'sine'
  osc.frequency.setValueAtTime(from, at)
  osc.frequency.exponentialRampToValueAtTime(to, at + glide)
  env.gain.setValueAtTime(0, at)
  env.gain.linearRampToValueAtTime(peak, at + attack)
  env.gain.exponentialRampToValueAtTime(0.0001, at + attack + decay)
  osc.connect(env); env.connect(out)
  osc.start(at); osc.stop(at + attack + decay + 0.02)
  osc.onended = () => { try { osc.disconnect(); env.disconnect() } catch { /* already gone */ } }
}

/** click: 1.2 -> 1.8 kHz in 30 ms (2 ms attack, 60 ms decay, peak 0.12); open: a two-note up-chirp; close: its mirror; hover: a soft tick. */
export function menuSound(kind: string = 'click') {
  const k: Kind = kind === 'open' || kind === 'close' || kind === 'hover' ? kind : 'click'
  const now = performance.now()
  if (now - last < (k === 'hover' ? 60 : 90)) return
  last = now
  const ui = getAudioPrefs().ui
  if (ui <= 0) return
  preferPlaybackSession()
  const ctx = context()
  if (!ctx) return
  const out = ctx.createGain()
  out.gain.value = ui
  out.connect(ctx.destination)
  const t = ctx.currentTime + 0.005
  if (k === 'click') chirp(ctx, out, t, 1200, 1800, 0.03, 0.002, 0.06, 0.12)
  else if (k === 'open') { chirp(ctx, out, t, 880, 990, 0.04, 0.002, 0.08, 0.1); chirp(ctx, out, t + 0.055, 1320, 1480, 0.04, 0.002, 0.11, 0.1) }
  else if (k === 'close') { chirp(ctx, out, t, 1320, 1180, 0.04, 0.002, 0.07, 0.09); chirp(ctx, out, t + 0.05, 880, 780, 0.04, 0.002, 0.09, 0.08) }
  else chirp(ctx, out, t, 2400, 2300, 0.01, 0.001, 0.015, 0.035)
  setTimeout(() => { try { out.disconnect() } catch { /* already gone */ } }, 400)
}

/** Leaving the page: release the pre-Unity context (Unity's own is never closed here). */
export function stopMenuSound() {
  if (own) { const c = own; own = undefined; void c.close().catch(() => {}) }
}
