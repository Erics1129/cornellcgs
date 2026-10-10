import { EVOLUTIONS } from './config.ts'
import type { Knife } from './engine.ts'
/** Normalized blade profiles, shared by the 3D extrusion and score portraits. */
export const PROFILES: [number, number][][] = [
  [[0,-.14],[.85,-.13],[1.75,.02],[1.35,.26],[0,.21]],
  [[0,-.25],[1.3,-.26],[2.3,-.08],[1.8,.38],[.6,.53],[0,.5]],
  [[0,-.18],[1.8,-.18],[1.92,.58],[.15,.63],[0,.47]],
  [[0,-.2],[1.15,-.19],[2.15,.13],[1.78,.12],[1.35,.44],[0,.4]],
  [[0,0],[.6,-.28],[2.5,.03],[.6,.32],[0,.07]],
  [[0,-.15],[1.75,-.15],[2.12,.19],[1.8,.34],[0,.29]],
  [[0,-.14],[.7,-.06],[1.25,-.32],[2.1,-.14],[1.97,.3],[1.2,.53],[.52,.33],[0,.2]],
  [[0,-.13],[.65,-.08],[1.21,-.37],[1.55,-.82],[1.62,-.35],[1.38,.21],[.83,.4],[0,.18]],
]
export function profile(k: Pick<Knife,'family'|'level'>): [number,number][] {
  const stage = EVOLUTIONS.filter(l=>k.level>=l).length-1
  return PROFILES[k.family].map(([x,y])=>[x*(1+stage*.065),y*(1+stage*.085)])
}
export function svgPath(k: Pick<Knife,'family'|'level'>) { return profile(k).map(([x,y],i)=>`${i?'L':'M'}${(44+x*43).toFixed(2)},${(46-y*43).toFixed(2)}`).join(' ')+' Z' }
