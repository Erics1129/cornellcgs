/** The Carrot Defense multiplayer net layer: what the lobby and duo UI (duo/**) import. */
export { createDuoSession, normalizeCode } from './session.ts'
export type { SessionDeps } from './session.ts'
export { createUnityLink, parseNetOut } from './bridge.ts'
export type { NetUnity, UnityLink } from './bridge.ts'
export { roomsUrl, netVer, multiplayerAvailable } from './config.ts'
export { sessionError } from './rooms.ts'
export * from './protocol.ts'
