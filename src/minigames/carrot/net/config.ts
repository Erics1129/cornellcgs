/**
 * Where the rooms Worker lives and which build this page is. VITE_ROOMS_URL empty (the default) hides multiplayer entirely and
 * the site builds and runs unchanged. A development page can point at a local `wrangler dev` with ?carrot-rooms=<url>.
 */
import build from '../unity-build.json'
import { NET_VERSION } from './protocol.ts'

type Env = { VITE_ROOMS_URL?: string; DEV?: boolean }
const env = ((import.meta as unknown as { env?: Env }).env ?? {}) as Env

function query(key: string): string | null {
  try { return new URLSearchParams(location.search).get(key) } catch { return null }
}
/** The rooms Worker base URL, or '' when multiplayer is off for this build. */
export function roomsUrl(): string {
  const dev = env.DEV ? query('carrot-rooms') : null
  const url = (dev || env.VITE_ROOMS_URL || '').trim().replace(/\/+$/, '')
  return /^https?:\/\//.test(url) ? url : ''
}
/** The room version gate: the Unity build stamp plus the net protocol version (the QA player is 'prism-review'). */
export function netVer(): string {
  const qa = !!env.DEV && query('carrot-qa') !== null
  return `${qa ? 'prism-review' : build.version}+n${NET_VERSION}`
}
export function multiplayerAvailable(): boolean {
  return !!roomsUrl() && typeof WebSocket === 'function' && typeof fetch === 'function'
}
