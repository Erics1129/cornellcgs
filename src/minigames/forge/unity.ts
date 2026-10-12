import type { GameEvent, Run } from './engine'
import unityBuild from './unity-build.json'
import feelTuning from './feel-tuning.json'
import { ForgePointerGesture } from './input'
import { PROTOCOL, QA_MODES, StrikeLedger, forgeView, snapshotPayload, unityEffect } from './bridge'
import type { ForgeView } from './bridge'

type Hooks = { ready: () => void; settled: (seq: number, latest: boolean, cancelled: boolean) => void; select: (id: number) => void; drop: (id: number, spot: string) => void; hit: () => void; spot: (spot: string) => void; gesture: () => void; labels: (positions: Record<string, { x: number; y: number }>) => void; error: (message: string) => void; context: (hint: string) => void; near: (spot: string) => void; command: (kind: string, id: number, key?: string) => void; notice: (text: string) => void }
type UnityInstance = { SendMessage: (object: string, method: string, value: string) => void; Quit: () => Promise<void>; SetFullscreen: (value: number) => void }
type UnityFactory = (canvas: HTMLCanvasElement, config: Record<string, unknown>, progress: (value: number) => void) => Promise<UnityInstance>
declare global { interface Window { createUnityInstance?: UnityFactory } }
let loader: Promise<UnityFactory> | undefined
let lifetime: Promise<void> = Promise.resolve()
function loadUnity() {
  if (!loader) loader = new Promise<UnityFactory>((resolve, reject) => {
    if (window.createUnityInstance) { resolve(window.createUnityInstance); return }
    const script = document.createElement('script')
    script.src = '/unity/forge/Build/forge.loader.js?v='+unityBuild.version
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
  private engineReady = false
  private strikes = new StrikeLedger()
  private protocol = 0
  private greeted = false
  private renderDpr = 1
  private bandsObserver?: ResizeObserver
  private gesture = new ForgePointerGesture()
  private release!: () => void
  private labels: Record<string, { x: number; y: number }> = {}
  private motion = matchMedia('(prefers-reduced-motion: reduce)')
  constructor(root: HTMLElement, hooks: Hooks) {
    this.root = root; this.hooks = hooks
    this.clearState()
    this.canvas.id = 'forge-unity-canvas'; this.canvas.className = 'ff-unity-canvas'; this.canvas.tabIndex = -1
    this.canvas.setAttribute('aria-label', 'First-person Unity workshop. Move with WASD or the touch pad, handle objects with E, and hammer with Space. Drag to look around.')
    this.loading.className = 'ff-unity-loading'; this.loading.setAttribute('role', 'status')
    this.loading.innerHTML = '<span>FORGE / FOLD</span><strong>Lighting the forge</strong><p></p><progress max="1" value="0"></progress>'
    root.replaceChildren(this.canvas, this.loading)
    this.canvas.addEventListener('forge-unity', this.receive)
    this.canvas.addEventListener('pointerdown', this.down); this.canvas.addEventListener('pointermove', this.move)
    window.addEventListener('keydown', this.keyDown); window.addEventListener('keyup', this.keyUp); window.addEventListener('blur', this.clearKeys); document.addEventListener('visibilitychange', this.clearKeys)
    this.canvas.addEventListener('pointerup', this.up); this.canvas.addEventListener('pointercancel', this.cancel)
    this.canvas.addEventListener('lostpointercapture', this.cancel)
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
        dataUrl: '/unity/forge/Build/forge.data.unityweb?v='+unityBuild.version,
        frameworkUrl: '/unity/forge/Build/forge.framework.js.unityweb?v='+unityBuild.version,
        codeUrl: '/unity/forge/Build/forge.wasm.unityweb?v='+unityBuild.version,
        streamingAssetsUrl: '/unity/forge/StreamingAssets',
        companyName: 'Cornell Computational Game Society', productName: 'Forge or Fold', productVersion: '1.0',
        devicePixelRatio: this.renderDpr = Math.min(devicePixelRatio, innerWidth < 700 ? 1 : 1.5),
        showBanner: (message: string, type: string) => { if (type === 'error') this.fail(message) },
      }, value => {
        const bar = this.loading.querySelector('progress'); if (bar) bar.value = value
        const text = this.loading.querySelector('p'); if (text) text.textContent = value < .9 ? ` ${Math.round(value * 100)}%` : 'Lighting the forge…'
      })
      if (this.disposed) { await instance.Quit(); this.release(); return }
      this.instance = instance
      this.root.dataset.renderer = 'unity'; this.loading.remove()
      if (this.latest) instance.SendMessage('Forge', 'Sync', this.latest)
      this.greet()
      if(this.engineReady)this.hooks.ready()
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
    if (m.type === 'ready') { this.engineReady=true;this.protocol=m.x||0;this.greet();if(this.instance)this.hooks.ready() }
    if (m.type === 'settled') { const latest=this.strikes.settle(m.id);this.hooks.settled(m.id,latest,m.x<0) }
    if (m.type === 'context') this.hooks.context(m.spot)
    if (m.type === 'near') { this.root.dataset.station = m.spot; this.hooks.near(m.spot) }
    if (m.type === 'position') this.root.dataset.player = JSON.stringify({x:m.x,z:m.y,carrying:m.id,near:m.spot})
    if (m.type === 'command') this.hooks.command(m.spot, m.id)
    if (m.type === 'purchase') this.hooks.command('buy', 0, m.spot)
    if (m.type === 'notice') this.hooks.notice(m.spot)
    if (m.type === 'select') this.hooks.select(m.id)
    if (m.type === 'drop') this.hooks.drop(m.id, m.spot)
    if (m.type === 'hit') this.hooks.hit()
    if (m.type === 'spot') this.hooks.spot(m.spot)
    if (m.type === 'gesture') this.hooks.gesture()
    if (m.type === 'impact') this.strikes.impact(m.id)
    if (m.type === 'tuned') this.root.dataset.tuning = m.spot
    if (m.type === 'hover') this.root.dataset.drop = m.spot
    if (m.type === 'stats') this.root.dataset.renderStats = JSON.stringify({fps: Math.round(m.x), knives: m.y, particles: m.id, renderer: 'Unity'})
    if (m.type === 'quality') this.root.dataset.quality = m.spot
    if (m.type === 'label') { this.labels[m.spot] = { x: m.x, y: m.y }; this.hooks.labels({ ...this.labels }) }
  }
  private pointer(event: PointerEvent, phase: string) {
    const r = this.canvas.getBoundingClientRect()
    this.instance?.SendMessage('Forge', 'Pointer', JSON.stringify({ phase, x: (event.clientX - r.left) / r.width, y: (event.clientY - r.top) / r.height }))
  }
  private point(e: PointerEvent) { const r=this.canvas.getBoundingClientRect();return { x:(e.clientX-r.left)/r.width, y:(e.clientY-r.top)/r.height } }
  private down = (e: PointerEvent) => { const p=this.point(e);if(e.button!==0||!this.gesture.begin(e.pointerId,p.x,p.y))return;this.hooks.gesture();this.canvas.setPointerCapture(e.pointerId);this.pointer(e,'down');e.preventDefault() }
  private move = (e: PointerEvent) => { const p=this.point(e);if(this.gesture.move(e.pointerId,p.x,p.y)){this.pointer(e,'move');e.preventDefault()} }
  private up = (e: PointerEvent) => { const p=this.point(e),phase=this.gesture.end(e.pointerId,p.x,p.y);if(phase)this.pointer(e,phase);if(this.canvas.hasPointerCapture(e.pointerId))this.canvas.releasePointerCapture(e.pointerId) }
  private cancel = (e: PointerEvent) => { if(this.gesture.cancel(e.pointerId))this.pointer(e,'cancel');if(this.canvas.hasPointerCapture(e.pointerId))this.canvas.releasePointerCapture(e.pointerId) }
  focus() { this.instance?.SendMessage('Forge','Quick','focus') }
  control(key: string, down: boolean) { if(down)this.hooks.gesture();this.instance?.SendMessage('Forge','Control',JSON.stringify({key,down})) }
  private isControl(code: string) { return /^(Key[WASDEQRF]|Arrow(Left|Right|Up|Down)|Space|ShiftLeft|Digit[1-4])$/.test(code) }
  private keyDown = (event: KeyboardEvent) => { if (!this.isControl(event.code) || event.repeat || document.querySelector('dialog[open]') || (event.target instanceof HTMLElement && /^(INPUT|TEXTAREA|SELECT)$/.test(event.target.tagName))) return; event.preventDefault(); this.hooks.gesture(); this.instance?.SendMessage('Forge', 'Control', JSON.stringify({key:event.code,down:true})) }
  private keyUp = (event: KeyboardEvent) => { if (this.isControl(event.code)) this.instance?.SendMessage('Forge', 'Control', JSON.stringify({key:event.code,down:false})) }
  private clearKeys = () => { this.gesture.cancel();this.instance?.SendMessage('Forge', 'Control', JSON.stringify({key:'clear',down:false})) }
  private clearState() { for (const key of ['renderer','player','renderStats','station','drop','quality','tuning']) delete this.root.dataset[key] }
  /** Contract handshake, once the instance exists and Unity said 'ready' with protocol >= 2: Tune, Insets, Qa. */
  private greet() {
    if (this.greeted || !this.instance || !this.engineReady || this.protocol < PROTOCOL) return
    this.greeted = true
    this.instance.SendMessage('Forge', 'Tune', JSON.stringify(feelTuning))
    const params = new URLSearchParams(location.search)
    const modes = [...(params.get('forge-telemetry') ? ['telemetry'] : []), ...(params.get('forge-unity-qa') || '').split(',')]
    for (const mode of modes) if ((QA_MODES as readonly string[]).includes(mode)) this.instance.SendMessage('Forge', 'Qa', mode)
    this.insets()
    this.bandsObserver = new ResizeObserver(() => this.insets()); this.bandsObserver.observe(this.canvas)
    requestAnimationFrame(() => this.insets())
  }
  /** Send Insets (ForgeView): the view class and the HUD bands over the canvas. Call again after HUD layout changes. */
  insets(bands: Partial<Pick<ForgeView, 'top' | 'right' | 'bottom' | 'left' | 'goldX' | 'goldY' | 'panel'>> = {}) {
    if (!this.instance || !this.greeted) return
    const c = this.canvas.getBoundingClientRect(), main = this.root.parentElement
    const edge = (selector: string, side: 'top' | 'bottom') => { let v = 0; for (const e of main?.querySelectorAll(selector) || []) { const r = e.getBoundingClientRect(); if (!r.width || !r.height) continue; v = Math.max(v, side === 'top' ? r.bottom - c.top : c.bottom - r.top) } return Math.max(0, Math.min(c.height, v)) }
    const gold = main?.querySelector('.ff-stats [title=Gold]')?.getBoundingClientRect()
    const touch = matchMedia('(pointer: coarse)').matches || navigator.maxTouchPoints > 0
    const view = forgeView(c.width, c.height, this.renderDpr, touch, { top: edge('.ff-topbar, .ff-blade-info', 'top'), bottom: edge('.ff-bottom', 'bottom'), goldX: gold ? gold.left + gold.width / 2 - c.left : 0, goldY: gold ? gold.top + gold.height / 2 - c.top : 0, panel: !!document.querySelector('dialog[open]'), ...bands })
    this.instance.SendMessage('Forge', 'Insets', JSON.stringify(view))
  }
  get busy() { return !this.instance || this.strikes.inFlight > 0 }
  /** Start a strike; returns its seq (0 when busy). onImpact runs on that seq's 'impact' only. */
  strike(onImpact: () => void): number { if (this.busy) return 0; const seq = this.strikes.begin(onImpact); this.instance!.SendMessage('Forge', 'Strike', String(seq)); return seq }
  get latestStrike() { return this.strikes.latest }
  sync(state: Run, selected: number | null, event?: GameEvent) {
    const payload = snapshotPayload(state, selected, { reduced: this.motion.matches })
    this.latest = JSON.stringify(payload)
    if (this.instance) this.instance.SendMessage('Forge', 'Sync', JSON.stringify({ ...payload, effect: unityEffect(event) }))
  }
  dispose() {
    this.clearKeys(); window.removeEventListener('keydown',this.keyDown);window.removeEventListener('keyup',this.keyUp);window.removeEventListener('blur',this.clearKeys);document.removeEventListener('visibilitychange',this.clearKeys)
    this.disposed = true; this.strikes.clear(); this.bandsObserver?.disconnect()
    this.clearState()
    this.canvas.removeEventListener('forge-unity', this.receive)
    this.canvas.removeEventListener('pointerdown', this.down); this.canvas.removeEventListener('pointermove', this.move)
    this.canvas.removeEventListener('pointerup', this.up); this.canvas.removeEventListener('pointercancel', this.cancel)
    this.canvas.removeEventListener('lostpointercapture', this.cancel)
    if (this.instance) { const instance = this.instance; this.instance = undefined; void instance.Quit().finally(this.release) }
    this.root.replaceChildren()
  }
}
