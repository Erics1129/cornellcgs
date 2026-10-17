import { forwardRef, useEffect, useState } from 'react'
import type { ButtonHTMLAttributes, ComponentPropsWithoutRef, ElementType, ForwardedRef, ReactElement, Ref, RefObject } from 'react'

/**
 * The glass primitives (styles: ui/glass.css; full API and rules: docs/carrot-defense/glass-ui.md).
 *
 *   <Glass depth={1|2|3} tone="threat" pill clear blur interactive selected wash pop as="section">   a glass surface
 *   <Jelly size="sm|md|lg" tone="threat" idle>                                                         the primary action
 *   glass({...}) / jelly({...})        the same class strings, for native elements and other components
 *   useGlassTier({...})                'real' | 'lite' | 'solid' for the page root's data-glass
 *   usePointerLight(rootRef)           the light that follows the pointer on pressable glass
 *   useExit(open)                      keeps a surface mounted for its 180 ms exit (.is-leaving)
 */
export type GlassDepth = 1 | 2 | 3
export type GlassTone = 'accent' | 'ally' | 'coin' | 'grow' | 'threat' | 'leak' | 'super'
export type GlassTier = 'real' | 'lite' | 'solid'
export type GlassOptions = {
 /** 1 thin (HUD chips and controls, tint .66), 2 panel (cards, build menu, toasts, .72; the default), 3 sheet (dialogs, results, stage select). */
 depth?: GlassDepth
 /** Light colour in the rim bounce, the inner glow, the wash, the selected ring and a nested Jelly. Default: the biome accent. */
 tone?: GlassTone
 /** Clear glass (tint .50): icon-only controls and bold glyphs. Never put text on it. */
 clear?: boolean
 /** Fully round ends (anything 56 px tall or less). */
 pill?: boolean
 /** Ask for real backdrop blur. Honoured only in the 'real' tier, which the page never uses during live play. At most 3 on screen (1 on phones). */
 blur?: boolean
 /** Pressable: scale .97 on press, a light that follows the pointer, a bloom under the finger. Use on buttons and links. */
 interactive?: boolean
 /** Selected (tabs, tiles, rows): a ring and a soft glow in the tone colour. */
 selected?: boolean
 /** A faint tone-coloured wash in the tint (guardian warnings, encounter cards). */
 wash?: boolean
 /** Materialize on mount: scale .96 and a fade (240 ms); 'rise' adds an 8 px rise, 'sheet' uses the 360 ms sheet curve. */
 pop?: boolean | 'rise' | 'sheet'
}

const cx = (...parts: Array<string | false | null | undefined>) => parts.filter(Boolean).join(' ')

/** The class string for a glass surface. Extra classes are appended (falsy ones dropped). */
export function glass(o: GlassOptions = {}, ...extra: Array<string | false | null | undefined>): string {
 return cx('gl', `gl--${o.depth || 2}`, o.tone && `gl--${o.tone}`, o.clear && 'gl--clear', o.pill && 'gl--pill', o.blur && 'gl--blur',
  o.interactive && 'gl--press', o.selected && 'gl--on', o.wash && 'gl--wash', o.pop && (o.pop === true ? 'gl-pop' : `gl-pop--${o.pop}`), ...extra)
}

export type JellyOptions = { size?: 'sm' | 'md' | 'lg'; tone?: GlassTone; idle?: boolean }
/** The class string for the primary action. `idle` adds the slow shine (entry page only; it stops under reduced motion). */
export function jelly(o: JellyOptions = {}, ...extra: Array<string | false | null | undefined>): string {
 return cx('gl-jelly', o.size && o.size !== 'md' && `gl-jelly--${o.size}`, o.tone && `gl--${o.tone}`, o.idle && 'is-idle', ...extra)
}

// ---- DEV only: the blur budget (every blurred surface is its own render pass; the count matters more than the area) ----
const blurred = new Set<symbol>()
function useBlurBudget(on: boolean) {
 useEffect(() => {
  if (!import.meta.env.DEV || !on) return
  const id = Symbol('blur'); blurred.add(id)
  const limit = matchMedia('(pointer: coarse)').matches ? 1 : 3
  if (blurred.size > limit) console.warn(`[glass] ${blurred.size} blurred surfaces are mounted; the budget is ${limit}. Drop blur from the smaller ones.`)
  return () => { blurred.delete(id) }
 }, [on])
}

type GlassOwnProps<T extends ElementType> = GlassOptions & { as?: T; className?: string }
export type GlassProps<T extends ElementType = 'div'> = GlassOwnProps<T> & Omit<ComponentPropsWithoutRef<T>, keyof GlassOwnProps<T>>

function GlassImpl<T extends ElementType = 'div'>({ as, depth, tone, clear, pill, blur, interactive, selected, wash, pop, className, ...rest }: GlassProps<T>, ref: ForwardedRef<Element>) {
 useBlurBudget(!!blur)
 const Tag = (as || 'div') as ElementType
 return <Tag ref={ref} className={glass({ depth, tone, clear, pill, blur, interactive, selected, wash, pop }, className)} {...rest} />
}
/** A glass surface. Every prop of the underlying element passes through; `as` picks the element (default div). */
export const Glass = forwardRef(GlassImpl) as <T extends ElementType = 'div'>(props: GlassProps<T> & { ref?: Ref<Element> }) => ReactElement | null

export type JellyProps = JellyOptions & ButtonHTMLAttributes<HTMLButtonElement>
/** The primary action: a tinted jelly pill (dark text at about 10:1). One per screen. */
export const Jelly = forwardRef<HTMLButtonElement, JellyProps>(function Jelly({ size, tone, idle, className, type = 'button', ...rest }, ref) {
 return <button ref={ref} type={type} className={jelly({ size, tone, idle }, className)} {...rest} />
})

// ---- the tier ------------------------------------------------------------------------------------------------------------------------
type Device = 'real' | 'lite' | 'phone'
let device: Device | null = null
/**
 * What the device allows, decided once: 'lite' without backdrop-filter support or on a weak device (4 GB or less where Chromium
 * reports memory, or 2 cores or less), 'phone' for a coarse pointer on a screen under 600 px on its short side, otherwise 'real'.
 */
export function glassDevice(): Device {
 if (device) return device
 const css = typeof CSS !== 'undefined' && typeof CSS.supports === 'function'
 const blur = css && (CSS.supports('backdrop-filter', 'blur(1px)') || CSS.supports('-webkit-backdrop-filter', 'blur(1px)'))
 const nav = navigator as Navigator & { deviceMemory?: number }
 const weak = (nav.deviceMemory || 8) <= 4 || (nav.hardwareConcurrency || 8) <= 2
 const phone = matchMedia('(pointer: coarse)').matches && Math.min(screen.width, screen.height) < 600
 device = !blur || weak ? 'lite' : phone ? 'phone' : 'real'
 return device
}
/**
 * The tier as a pure function (tests use it):
 *   solid  the page's Reduced effects toggle, prefers-reduced-transparency, prefers-contrast: more, forced colors
 *   lite   live play (a wave running and not paused) on every device; weak devices always; phones whenever the Unity board renders
 *   real   everything else (menus, the entry page, paused, results), so .gl--blur surfaces blur
 */
export function glassTier(o: { reducedEffects: boolean; live: boolean; still: boolean; device: Device; prefersSolid: boolean }): GlassTier {
 if (o.reducedEffects || o.prefersSolid) return 'solid'
 if (o.device === 'lite' || o.live) return 'lite'
 if (o.device === 'phone' && !o.still) return 'lite'
 return 'real'
}
const solidQueries = ['(prefers-reduced-transparency: reduce)', '(prefers-contrast: more)', '(forced-colors: active)']
/**
 * The page tier for data-glass on .ct-page. `live`: a wave is running and the game is not paused. `still`: the backdrop is a still
 * image (the entry page, before the Unity board exists), which keeps blur cheap even on phones.
 */
export function useGlassTier({ reducedEffects, live, still }: { reducedEffects: boolean; live: boolean; still: boolean }): GlassTier {
 const [prefersSolid, setPrefersSolid] = useState(() => solidQueries.some(q => matchMedia(q).matches))
 useEffect(() => {
  const lists = solidQueries.map(q => matchMedia(q)), f = () => setPrefersSolid(lists.some(m => m.matches))
  for (const m of lists) m.addEventListener('change', f)
  return () => { for (const m of lists) m.removeEventListener('change', f) }
 }, [])
 return glassTier({ reducedEffects, live, still, device: glassDevice(), prefersSolid })
}

// ---- the light ------------------------------------------------------------------------------------------------------------------------
/** The elements the light follows. */
export const PressSelector = '.gl--press, .ct-icon-btn, .ct-ghost, .gl-jelly, .ct-cta'
/**
 * One delegated listener on the page root writes --gl-mx/--gl-my onto the pressable under the pointer, once per frame, and onto that
 * element only (the properties do not inherit, so nothing below it restyles). Fine pointers get the hover light and the rim hot spot;
 * every pointer gets the press bloom under the finger. Touch clears it after the release.
 */
export function usePointerLight(root: RefObject<HTMLElement | null>, enabled = true) {
 useEffect(() => {
  const host = root.current
  if (!host || !enabled) return
  const fine = matchMedia('(hover: hover) and (pointer: fine)').matches
  let lit: HTMLElement | null = null, k = 1, left = 0, top = 0, x = 0, y = 0, raf = 0, timer = 0
  const clear = () => { if (lit) { lit.style.removeProperty('--gl-mx'); lit.style.removeProperty('--gl-my') } lit = null }
  const paint = () => { raf = 0; if (lit) { lit.style.setProperty('--gl-mx', `${x}px`); lit.style.setProperty('--gl-my', `${y}px`) } }
  const measure = (t: HTMLElement) => { const r = t.getBoundingClientRect(); left = r.left; top = r.top; k = r.width > 0 ? t.offsetWidth / r.width : 1 } // k undoes HUD zoom and press scale
  const track = (e: PointerEvent) => {
   if (e.type === 'pointermove' && e.pointerType === 'touch') return
   const t = (e.target instanceof Element ? e.target.closest(PressSelector) : null) as HTMLElement | null
   if (t !== lit) { clear(); lit = t; if (t) measure(t) } else if (t && e.type === 'pointerdown') measure(t)
   if (!t) return
   clearTimeout(timer)
   x = Math.round((e.clientX - left) * k); y = Math.round((e.clientY - top) * k)
   if (!raf) raf = requestAnimationFrame(paint)
  }
  const release = (e: PointerEvent) => { if (e.pointerType !== 'mouse') { clearTimeout(timer); timer = window.setTimeout(clear, 260) } }
  const leave = () => { cancelAnimationFrame(raf); raf = 0; clear() }
  if (fine) host.addEventListener('pointermove', track, { passive: true })
  host.addEventListener('pointerdown', track, { passive: true })
  host.addEventListener('pointerup', release, { passive: true })
  host.addEventListener('pointercancel', release, { passive: true })
  host.addEventListener('pointerleave', leave)
  return () => {
   host.removeEventListener('pointermove', track); host.removeEventListener('pointerdown', track)
   host.removeEventListener('pointerup', release); host.removeEventListener('pointercancel', release); host.removeEventListener('pointerleave', leave)
   clearTimeout(timer); leave()
  }
 }, [root, enabled])
}

// ---- exits ----------------------------------------------------------------------------------------------------------------------------
/**
 * Keeps a surface mounted for its exit. `mounted` stays true for `ms` after `open` turns false, with `leaving` true meanwhile:
 *   const {mounted,leaving}=useExit(open); return mounted?<Glass pop className={leaving?'is-leaving':''}>...</Glass>:null
 */
export function useExit(open: boolean, ms = 180) {
 const [shown, setShown] = useState(open)
 useEffect(() => {
  if (open) { setShown(true); return }
  const t = window.setTimeout(() => setShown(false), ms)
  return () => clearTimeout(t)
 }, [open, ms])
 return { mounted: open || shown, leaving: !open && shown }
}
