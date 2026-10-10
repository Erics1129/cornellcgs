import { METALS } from './config'
import type { GameEvent, Run } from './engine'
import { profile } from './knives'

type Hooks = { select: (id: number) => void; drop: (id: number, spot: string) => void; hit: () => void; spot: (spot: string) => void; gesture: () => void; labels: (positions: Record<string, { x: number; y: number }>) => void; error: (message: string) => void }
type UnityInstance = { SendMessage: (object: string, method: string, value: string) => void; Quit: () => Promise<void>; SetFullscreen: (value: number) => void }
type UnityFactory = (canvas: HTMLCanvasElement, config: Record<string, unknown>, progress: (value: number) => void) => Promise<UnityInstance>
declare global { interface Window { createUnityInstance?: UnityFactory } }
let loader: Promise<UnityFactory> | undefined
let lifetime: Promise<void> = Promise.resolve()
function loadUnity() {
  if (!loader) loader = new Promise<UnityFactory>((resolve, reject) => {
    if (window.createUnityInstance) { resolve(window.createUnityInstance); return }
    const script = document.createElement('script')
    script.src = '/unity/forge/Build/forge.loader.js'
    script.onload = () => window.createUnityInstance ? resolve(window.createUnityInstance) : reject(new Error('Unity loader did not initialize.'))
    script.onerror = () => { script.remove(); loader = undefined; reject(new Error('The Unity game could not be downloaded. Reload to try again.')) }
    document.head.append(script)
  })
  return loader
}
/** A lifecycle-managed bridge to the actual Unity Web player, never a second renderer. */
export class ForgeUnity {
  private root: HTMLElement
  private hooks: Hooks
  private canvas = document.createElement('canvas')
  private loading = document.createElement('div')
  private instance?: UnityInstance
  private latest?: string
  private disposed = false
  private impact?: () => void
  private release!: () => void
  private labels: Record<string, { x: number; y: number }> = {}
  private motion = matchMedia('(prefers-reduced-motion: reduce)')
  constructor(root: HTMLElement, hooks: Hooks) {
    this.root = root; this.hooks = hooks
    this.canvas.id = 'forge-unity-canvas'; this.canvas.className = 'ff-unity-canvas'; this.canvas.tabIndex = -1
    this.canvas.setAttribute('aria-label', 'Unity 3D workshop. Drag knives between stations. Equivalent keyboard controls are below.')
    this.loading.className = 'ff-unity-loading'; this.loading.setAttribute('role', 'status')
    this.loading.innerHTML = '<span>FORGE OR FOLD</span><strong>Opening the workshop.</strong><p>Loading the Unity game…</p><progress max="1" value="0"></progress>'
    root.replaceChildren(this.canvas, this.loading)
    this.canvas.addEventListener('forge-unity', this.receive)
    this.canvas.addEventListener('pointerdown', this.down); this.canvas.addEventListener('pointermove', this.move)
    this.canvas.addEventListener('pointerup', this.up); this.canvas.addEventListener('pointercancel', this.cancel)
    const previous = lifetime
    lifetime = new Promise<void>(resolve => { this.release = resolve })
    void this.boot(previous)
  }
  private async boot(previous: Promise<void>) {
    try {
      await previous
      if (this.disposed) { this.release(); return }
      const factory = await loadUnity()
      if (this.disposed) { this.release(); return }
      const instance = await factory(this.canvas, {
        dataUrl: '/unity/forge/Build/forge.data.unityweb',
        frameworkUrl: '/unity/forge/Build/forge.framework.js.unityweb',
        codeUrl: '/unity/forge/Build/forge.wasm.unityweb',
        streamingAssetsUrl: '/unity/forge/StreamingAssets',
        companyName: 'Cornell Computational Game Society', productName: 'Forge or Fold', productVersion: '1.0',
        devicePixelRatio: Math.min(devicePixelRatio, innerWidth < 700 ? 1 : 1.5),
        showBanner: (message: string, type: string) => { if (type === 'error') this.fail(message) },
      }, value => {
        const bar = this.loading.querySelector('progress'); if (bar) bar.value = value
        const text = this.loading.querySelector('p'); if (text) text.textContent = value < .9 ? `Loading the Unity game · ${Math.round(value * 100)}%` : 'Lighting the forge…'
      })
      if (this.disposed) { await instance.Quit(); this.release(); return }
      this.instance = instance
      this.root.dataset.renderer = 'unity'; this.loading.remove()
      if (this.latest) instance.SendMessage('Forge', 'Sync', this.latest)
    } catch (error) { if (!this.disposed) this.fail(error instanceof Error ? error.message : 'Unity could not start.'); this.release() }
  }
  private fail(message: string) {
    this.loading.replaceChildren(); const title = document.createElement('strong'); title.textContent = 'The workshop could not open.'
    const description = document.createElement('p'); description.textContent = 'Reload this page to retry. Your saved run is safe.'
    this.loading.append(title, description); this.hooks.error(message)
  }
  private receive = (event: Event) => {
    if (this.disposed) return
    const m = (event as CustomEvent<{ type: string; id: number; spot: string; x: number; y: number }>).detail
    if (m.type === 'select') this.hooks.select(m.id)
    if (m.type === 'drop') this.hooks.drop(m.id, m.spot)
    if (m.type === 'hit') this.hooks.hit()
    if (m.type === 'spot') this.hooks.spot(m.spot)
    if (m.type === 'gesture') this.hooks.gesture()
    if (m.type === 'impact') { const impact = this.impact; this.impact = undefined; impact?.() }
    if (m.type === 'hover') this.root.dataset.drop = m.spot
    if (m.type === 'stats') this.root.dataset.renderStats = JSON.stringify({fps: Math.round(m.x), knives: m.y, particles: m.id, renderer: 'Unity'})
    if (m.type === 'quality') this.root.dataset.quality = m.spot
    if (m.type === 'label') { this.labels[m.spot] = { x: m.x, y: m.y }; this.hooks.labels({ ...this.labels }) }
  }
  private pointer(event: PointerEvent, phase: string) {
    const r = this.canvas.getBoundingClientRect()
    this.instance?.SendMessage('Forge', 'Pointer', JSON.stringify({ phase, x: (event.clientX - r.left) / r.width, y: (event.clientY - r.top) / r.height }))
  }
  private down = (e: PointerEvent) => { if (e.button !== 0) return; this.hooks.gesture(); this.canvas.setPointerCapture(e.pointerId); this.pointer(e, 'down'); e.preventDefault() }
  private move = (e: PointerEvent) => { if (this.canvas.hasPointerCapture(e.pointerId)) { this.pointer(e, 'move'); e.preventDefault() } }
  private up = (e: PointerEvent) => { this.pointer(e, 'up'); if (this.canvas.hasPointerCapture(e.pointerId)) this.canvas.releasePointerCapture(e.pointerId) }
  private cancel = (e: PointerEvent) => { this.pointer(e, 'cancel'); if (this.canvas.hasPointerCapture(e.pointerId)) this.canvas.releasePointerCapture(e.pointerId) }
  get busy() { return !this.instance || !!this.impact }
  strike(impact: () => void) { if (this.busy) return false; this.impact = impact; this.instance!.SendMessage('Forge', 'Strike', ''); return true }
  sync(state: Run, selected: number | null, event?: GameEvent) {
    const payload = { knives: state.knives.map(k => ({ ...k, ...METALS[k.metal], rough: METALS[k.metal].roughness, metal: k.metal, profile: profile(k).map(([x, y]) => ({ x, y })) })), selected: selected || 0, day: state.day, ended: state.ended, reduced: this.motion.matches }
    this.latest = JSON.stringify(payload)
    if (this.instance) this.instance.SendMessage('Forge', 'Sync', JSON.stringify({ ...payload, effect: event?.kind === 'wait' ? undefined : event }))
  }
  dispose() {
    this.disposed = true; this.impact = undefined
    this.canvas.removeEventListener('forge-unity', this.receive)
    this.canvas.removeEventListener('pointerdown', this.down); this.canvas.removeEventListener('pointermove', this.move)
    this.canvas.removeEventListener('pointerup', this.up); this.canvas.removeEventListener('pointercancel', this.cancel)
    if (this.instance) { const instance = this.instance; this.instance = undefined; void instance.Quit().finally(this.release) }
    this.root.replaceChildren()
  }
}
