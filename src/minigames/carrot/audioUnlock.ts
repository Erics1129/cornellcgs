import { getAudioBus, preferPlaybackSession } from './audioPrefs'

/**
 * Safari (macOS and iOS) starts Web Audio only inside a user gesture. Unity builds its AudioContext in _JS_Sound_Init,
 * seconds after Play and outside any gesture, so Safari kept the game silent until a later click on the board, and on
 * iPhone a board tap (touch, no mousedown) never reached Unity's own unlock at all. So the first gesture on the page
 * starts a context and hands it to the next `new AudioContext()`, which is Unity's; every later gesture resumes a
 * suspended or interrupted context and keeps the iOS playback session (sound with the ringer switch off).
 */
type Ctor = typeof AudioContext
type Win = { AudioContext?: Ctor; webkitAudioContext?: Ctor }
const win: Win | undefined = typeof window !== 'undefined' ? window as unknown as Win : undefined
const nativeStd: Ctor | undefined = win?.AudioContext
const nativeWebkit: Ctor | undefined = win?.webkitAudioContext
/** The browser's own constructor, for page audio that must never take the context meant for Unity. */
export const NativeAudioContext: Ctor | undefined = nativeStd || nativeWebkit

let primed: AudioContext | null = null
const ticked = new WeakSet<AudioContext>()

function restore() {
  if (!win) return
  if (nativeStd) win.AudioContext = nativeStd
  if (nativeWebkit) win.webkitAudioContext = nativeWebkit
}

/** Resume inside the gesture, and on iOS start a one-sample silent buffer, which finishes the unlock. */
function wake(ctx: AudioContext | null | undefined) {
  if (!ctx || ctx.state === 'closed') return
  if (ctx.state !== 'running') void ctx.resume().catch(() => {})
  if (ticked.has(ctx)) return
  try {
    const source = ctx.createBufferSource()
    source.buffer = ctx.createBuffer(1, 1, ctx.sampleRate)
    source.connect(ctx.destination)
    source.start(0)
    ticked.add(ctx)
  } catch { /* closed meanwhile */ }
}

function prime() {
  const Native = NativeAudioContext
  const unity = getAudioBus().context
  if (primed || !win || !Native || (unity && unity.state !== 'closed')) return
  let ctx: AudioContext
  try { ctx = new Native() } catch { return }
  primed = ctx
  const Handoff = function (options?: AudioContextOptions) {
    restore()
    if (primed !== ctx || ctx.state === 'closed') return new Native(options)
    primed = null
    // Unity counts its context as running only after an onstatechange to "running", which a context that already
    // runs never sends. Unity assigns the handler right after construction, so call it once that script has finished.
    queueMicrotask(() => { if (ctx.state === 'running') ctx.onstatechange?.call(ctx, new Event('statechange')) })
    return ctx
  } as unknown as Ctor
  Handoff.prototype = Native.prototype
  win.AudioContext = Handoff
  if (nativeWebkit) win.webkitAudioContext = Handoff
}

function onGesture() {
  preferPlaybackSession()
  prime()
  wake(primed)
  wake(getAudioBus().context)
}

// Activation-triggering events (touchstart is not one, so a tap counts at touchend). Capture phase, so nothing on the
// page can stop the unlock from seeing the gesture.
const events = ['pointerdown', 'pointerup', 'mousedown', 'touchend', 'keydown', 'click'] as const

/** Installs the unlock for the Carrot page; the returned cleanup restores the browser's constructor. */
export function installAudioUnlock(): () => void {
  if (!win) return () => {}
  for (const type of events) window.addEventListener(type, onGesture, { capture: true, passive: true })
  return () => {
    for (const type of events) window.removeEventListener(type, onGesture, { capture: true })
    restore()
    if (primed) { void primed.close().catch(() => {}); primed = null }
  }
}
