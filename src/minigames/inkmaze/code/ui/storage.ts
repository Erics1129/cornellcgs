/**
 * Ink Maze coding level: what this browser remembers (localStorage).
 *
 * The code per language, the chosen language, the playback speed and the
 * map's seed. Storage can be missing or full (private windows, blocked site
 * data), so every read and write is guarded and the level works without it.
 */
import { DEFAULT_LANGUAGE, LANGUAGES, isRunLanguage } from '../contract.ts'
import type { Language, RunLanguage } from '../contract.ts'

const SOURCES_KEY = 'cgs-inkmaze-code-v1'
const PREFS_KEY = 'cgs-inkmaze-code-prefs-v1'

/** playback speeds the game screen offers */
export const SPEEDS = [0.5, 1, 2, 4] as const
export type Speed = (typeof SPEEDS)[number]

export type Prefs = {
  language: Language
  speed: Speed
  /** the visible map's seed (problem.randomBoard), null before the first one */
  seed: number | null
}

function read(key: string): unknown {
  try {
    const raw = localStorage.getItem(key)
    return raw ? JSON.parse(raw) : null
  } catch {
    return null
  }
}

function write(key: string, value: unknown): boolean {
  try {
    localStorage.setItem(key, JSON.stringify(value))
    return true
  } catch {
    return false // storage unavailable or full: it lasts as long as the page
  }
}

function sources(): Record<string, string> {
  const value = read(SOURCES_KEY)
  if (!value || typeof value !== 'object') return {}
  const out: Record<string, string> = {}
  for (const [key, text] of Object.entries(value as Record<string, unknown>)) if (isRunLanguage(key) && typeof text === 'string') out[key] = text
  return out
}

/** The saved code for a language, or null when there is none. */
export function loadSource(language: RunLanguage): string | null {
  return sources()[language] ?? null
}

/** Saves a language's code; code equal to the starter code is forgotten (so a newer starter shows). Returns whether it was stored. */
export function saveSource(language: RunLanguage, source: string, starter: string): boolean {
  const all = sources()
  if (source === starter) delete all[language]
  else all[language] = source
  return write(SOURCES_KEY, all)
}

export function loadPrefs(): Prefs {
  const value = read(PREFS_KEY) as Partial<Record<keyof Prefs, unknown>> | null
  const language = (LANGUAGES as readonly unknown[]).includes(value?.language) ? (value!.language as Language) : DEFAULT_LANGUAGE
  const speed = (SPEEDS as readonly unknown[]).includes(value?.speed) ? (value!.speed as Speed) : 1
  const seed = Number.isInteger(value?.seed) ? (value!.seed as number) : null
  return { language, speed, seed }
}

export function savePrefs(patch: Partial<Prefs>) {
  write(PREFS_KEY, { ...loadPrefs(), ...patch })
}
