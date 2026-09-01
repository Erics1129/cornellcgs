import gsap from 'gsap'
import { CustomEase } from 'gsap/CustomEase'

/**
 * The site's motion signature. Two curves, used everywhere — GSAP through
 * these names, CSS through var(--ease-out) / var(--ease-in-out) which MUST
 * stay numerically identical (global.css).
 *
 *   site.out    cubic-bezier(0.16, 1, 0.3, 1)  — every reveal, hover, arrival
 *   site.inOut  cubic-bezier(0.83, 0, 0.17, 1) — moves that leave AND arrive
 */
gsap.registerPlugin(CustomEase)

CustomEase.create('site.out', '0.16, 1, 0.3, 1')
CustomEase.create('site.inOut', '0.83, 0, 0.17, 1')

export const EASE = {
  out: 'site.out',
  inOut: 'site.inOut',
} as const
