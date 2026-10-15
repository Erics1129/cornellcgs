/**
 * Device-only audio preferences (never synced): music, effects and interface levels in 0..1, stored under
 * `cgs-carrot-audio-v1`. The campaign record's `sound` flag stays the one master mute; these levels only scale
 * underneath it and never write it. Every storage access is wrapped, so private windows and blocked storage fall back
 * to the defaults.
 */
export type AudioPrefs = { music: number; sfx: number; ui: number }
export const AudioPrefsKey = 'cgs-carrot-audio-v1'
export const DefaultAudioPrefs: Readonly<AudioPrefs> = Object.freeze({ music: 1, sfx: 1, ui: 1 })

type Listener = (prefs: AudioPrefs) => void
const listeners = new Set<Listener>()
let cached: AudioPrefs | null = null

const level = (value: unknown, fallback: number) => typeof value === 'number' && Number.isFinite(value) ? Math.min(1, Math.max(0, value)) : fallback

/** Parses a stored record; anything unreadable becomes the defaults. Unknown future versions keep their known fields. */
export function cleanAudioPrefs(raw: unknown): AudioPrefs {
  const r = raw && typeof raw === 'object' ? raw as Record<string, unknown> : {}
  return { music: level(r.music, DefaultAudioPrefs.music), sfx: level(r.sfx, DefaultAudioPrefs.sfx), ui: level(r.ui, DefaultAudioPrefs.ui) }
}

export function getAudioPrefs(): AudioPrefs {
  if (cached) return { ...cached }
  let value: unknown
  try { const text = localStorage.getItem(AudioPrefsKey); value = text ? JSON.parse(text) : null } catch { value = null }
  cached = cleanAudioPrefs(value)
  return { ...cached }
}

export function setAudioPrefs(patch: Partial<AudioPrefs>): AudioPrefs {
  const next = cleanAudioPrefs({ ...getAudioPrefs(), ...patch })
  cached = next
  try { localStorage.setItem(AudioPrefsKey, JSON.stringify({ version: 1, ...next })) } catch { /* storage blocked: keep the session value */ }
  for (const fn of listeners) { try { fn({ ...next }) } catch { /* a listener must not break the others */ } }
  return { ...next }
}

export function subscribeAudioPrefs(fn: Listener): () => void {
  listeners.add(fn)
  return () => { listeners.delete(fn) }
}

/** The JSON CarrotAudio.SetVolumes expects (`SendMessage('CarrotGame', 'SetVolumes', json)`). */
export function volumesJson(prefs: AudioPrefs = getAudioPrefs()): string {
  return JSON.stringify({ music: prefs.music, sfx: prefs.sfx, ui: prefs.ui })
}

// Another tab changed the levels: drop the cache and tell this tab's listeners.
if (typeof window !== 'undefined') {
  try {
    window.addEventListener('storage', event => {
      if (event.key !== AudioPrefsKey) return
      cached = null
      const prefs = getAudioPrefs()
      for (const fn of listeners) { try { fn(prefs) } catch { /* ignore */ } }
    })
  } catch { /* no window events (tests) */ }
}

/** Read-only view of the game's master bus, filled in by CarrotMusic.jslib once Unity has loaded. */
export type CarrotAudioBus = {
  analyser: AnalyserNode | null
  context: AudioContext | null
  /** Tempo of the playing track when its analysis is stable, else null (the HUD beat glow stays off). */
  bpm: number | null
  track?: string | null
  /** 0..1 position inside the current beat; 0 without a stable tempo. */
  beatPhase(): number
  /** RMS level of the final mix, 0..1. */
  level(): number
  /** Recent cues: [performance.now() ms, name, value]. */
  cues: [number, string, number][]
}

declare global {
  interface Window { carrotAudioBus?: CarrotAudioBus }
}

/** Always returns a usable bus object: null-safe defaults until the Unity player publishes the real one. */
export function getAudioBus(): CarrotAudioBus {
  const w = typeof window !== 'undefined' ? window : undefined
  const existing = w?.carrotAudioBus
  if (existing && typeof existing === 'object' && typeof existing.beatPhase === 'function' && typeof existing.level === 'function') return existing
  const bus: CarrotAudioBus = { analyser: null, context: null, bpm: null, track: null, beatPhase: () => 0, level: () => 0, cues: [], ...(existing || {}) }
  if (typeof bus.beatPhase !== 'function') bus.beatPhase = () => 0
  if (typeof bus.level !== 'function') bus.level = () => 0
  if (w) w.carrotAudioBus = bus
  return bus
}

/** iOS: let the game's Web Audio play with the ringer switch off, where Safari exposes the Audio Session API. */
export function preferPlaybackSession(): void {
  try {
    const session = (navigator as unknown as { audioSession?: { type: string } }).audioSession
    if (session && session.type !== 'playback') session.type = 'playback'
  } catch { /* not supported */ }
}

// Install the defaults as soon as the page module loads, before Unity exists.
getAudioBus()
