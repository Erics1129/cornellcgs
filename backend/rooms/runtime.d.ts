/**
 * The subset of the Cloudflare Workers runtime this Worker uses, so `tsc -p backend/rooms` type-checks it with the site's own
 * TypeScript and no new dependency. Checked against the full `wrangler types` output (workerd 1.20261006.1, compatibility date
 * 2026-10-01): `node scripts/rooms-worker-build.mjs --check-types <worker-configuration.d.ts>` compiles the Worker against it.
 */
declare module 'cloudflare:workers' {
  export abstract class DurableObject<Env = unknown> {
    protected ctx: DurableObjectState
    protected env: Env
    constructor(ctx: DurableObjectState, env: Env)
  }
}
interface DurableObjectStorage {
  get<T = unknown>(key: string): Promise<T | undefined>
  put(key: string, value: unknown): Promise<void>
  deleteAll(): Promise<void>
  setAlarm(scheduledTime: number): Promise<void>
  deleteAlarm(): Promise<void>
}
interface DurableObjectState {
  readonly storage: DurableObjectStorage
  acceptWebSocket(ws: WebSocket, tags?: string[]): void
  getWebSockets(tag?: string): WebSocket[]
  setWebSocketAutoResponse(pair?: WebSocketRequestResponsePair): void
  blockConcurrencyWhile<T>(callback: () => Promise<T>): Promise<T>
}
interface DurableObjectId { toString(): string }
type DurableObjectRpc<T> = { [K in keyof T as T[K] extends (...args: never[]) => unknown ? K : never]: T[K] extends (...args: infer A) => infer R ? (...args: A) => Promise<Awaited<R>> : never }
type DurableObjectStub<T> = DurableObjectRpc<T> & { fetch(request: Request): Promise<Response> }
interface DurableObjectNamespace<T = unknown> {
  idFromName(name: string): DurableObjectId
  get(id: DurableObjectId): DurableObjectStub<T>
}
declare class WebSocketPair { 0: WebSocket; 1: WebSocket }
declare class WebSocketRequestResponsePair { constructor(request: string, response: string) }
interface WebSocket {
  accept(): void
  serializeAttachment(value: unknown): void
  deserializeAttachment(): unknown
}
interface ResponseInit { webSocket?: WebSocket | null }
