/**
 * FROZEN web side of the Unity bridge contract (unity/ForgeOrFold/Assets/Scripts/ForgeContract.cs).
 * Pure: no DOM, importable from Node (scripts/test-forge-bridge.mjs, scripts/forge-snapshots.mjs).
 * Changing a name or field here needs every feel stream to agree.
 */
import { METALS, CHARMS, ITEMS, RULES } from './config.ts'
import { price, value, saleValue, knifeName, flowNeed, odds } from './engine.ts'
import type { GameEvent, Run } from './engine.ts'
import { profile } from './knives.ts'

/** Protocol version. Unity's 'ready' carries it in x; pre-contract builds send 0. */
export const PROTOCOL = 2
export type ViewClass = 'desktop' | 'phone-portrait' | 'phone-landscape'
/** The HUD Motion setting. 'reduced' runs the reduced-motion choreography; 'off' also drops kicks, FOV punch and turns. */
export type Motion = 'full' | 'reduced' | 'off'
/** Unity -> web message (ForgeMessage). */
export type UnityMessage = { type: string; id: number; spot: string; x: number; y: number }
/** Unity -> web sfx names (Send('sfx', id, name, x, y)). */
export const SFX = ['swing', 'whoosh', 'step', 'tongs', 'coals-in', 'coals-out', 'bellows', 'place', 'quench', 'flake-land', 'chip-land', 'shard-land', 'coin-land', 'dawn'] as const
/** QA modes for Unity's Qa(mode). */
export const QA_MODES = ['telemetry', 'steady', 'void', 'swatch'] as const

/**
 * View class from the canvas size in CSS pixels. Below 700 px wide is the old 'Screen.width < 700'
 * phone layout (now immune to the DPR); a touch screen whose short side is under 500 px is a phone too.
 */
export function viewClass(cssW: number, cssH: number, touch: boolean): ViewClass {
  if (cssW < 700) return cssH >= cssW ? 'phone-portrait' : 'phone-landscape'
  if (touch && Math.min(cssW, cssH) < 500) return cssH > cssW ? 'phone-portrait' : 'phone-landscape'
  return 'desktop'
}
/**
 * Insets payload (ForgeView). Lengths are CSS pixels of the canvas: top/right/bottom/left are the
 * HUD-covered bands at each edge, goldX/goldY the gold counter centre from the canvas top-left,
 * panel = a tray or dialog is open.
 */
export type ForgeView = { view: ViewClass; cssW: number; cssH: number; dpr: number; touch: boolean; top: number; right: number; bottom: number; left: number; goldX: number; goldY: number; panel: boolean }
export function forgeView(cssW: number, cssH: number, dpr: number, touch: boolean, bands: Partial<Omit<ForgeView, 'view' | 'cssW' | 'cssH' | 'dpr' | 'touch'>> = {}): ForgeView {
  return { view: viewClass(cssW, cssH, touch), cssW, cssH, dpr, touch, top: 0, right: 0, bottom: 0, left: 0, goldX: 0, goldY: 0, panel: false, ...bands }
}

/** Next-hit shatter probability of the anvil knife, Flow and Guard included (0 with no anvil knife). */
export function anvilRisk(state: Run): number { const k = state.knives.find(n => n.place === 'anvil'); return k ? odds(k, state).shatter : 0 }
export type SnapshotOptions = { reduced: boolean; motion?: Motion; shake?: number }
/** The Sync payload (ForgeSnapshot) without its effect. Field order is part of the contract: new fields go last. */
export function snapshotPayload(state: Run, selected: number | null, options: SnapshotOptions) {
  return { flowNeed:flowNeed(state),flowSpeed:RULES.flowSpeed,knives: state.knives.map(k => ({ ...k, ...METALS[k.metal], heldValue:value(k,state),saleValue:saleValue(state,k),displayName:knifeName(k),rough: METALS[k.metal].roughness, metal: k.metal, profile: profile(k).map(([x, y]) => ({ x, y })) })), selected: selected || 0, day: state.day, ended: state.ended, reduced: options.reduced, offers: Object.entries(state.stock).filter(([,stock])=>stock>0).map(([key,stock])=>({key,stock,price:price(state,key),label:key.startsWith('metal:')?METALS[key.slice(6) as keyof typeof METALS].name:key.startsWith('charm:')?CHARMS[key.slice(6) as keyof typeof CHARMS].name:ITEMS[key as keyof typeof ITEMS].name})),
    risk: anvilRisk(state), totalHits: state.totalHits, shake: options.shake ?? 1, motion: options.motion ?? 'full' }
}
/** The effect sent with a Sync: the transition's GameEvent, except clock events. */
export function unityEffect(event?: GameEvent) { return event?.kind === 'wait' || event?.kind === 'tick' ? undefined : event }

/**
 * Strike sequence ids end to end: Strike(seq) leads to swing, impact and settled with id = seq.
 * Each impact resolves only its own seq, and a late 'settled' clears only its own seq, so an
 * overlapping swing can never lose its engine hit. Pre-contract Unity builds send id 0: an impact
 * then resolves the oldest pending strike and a settled clears everything (the old behaviour).
 */
export class StrikeLedger {
  private next = 0
  private pending = new Map<number, () => void>()
  /** The latest seq handed out (0 before the first strike). */
  get latest() { return this.next }
  get inFlight() { return this.pending.size }
  has(seq: number) { return this.pending.has(seq) }
  /** Reserve the next seq for a Strike and remember its impact callback. */
  begin(onImpact: () => void): number { const seq = ++this.next; this.pending.set(seq, onImpact); return seq }
  /** Unity 'impact': run that seq's callback once. Returns false when nothing was pending for it. */
  impact(id: number): boolean {
    const seq = id || this.pending.keys().next().value
    if (seq === undefined) return false
    const callback = this.pending.get(seq); if (!callback) return false
    this.pending.delete(seq); callback(); return true
  }
  /** Unity 'settled': clear only its own seq (id 0 clears all). Returns true when it settles the latest strike. */
  settle(id: number): boolean { if (id) this.pending.delete(id); else this.pending.clear(); return !id || id === this.next }
  clear() { this.pending.clear() }
}
