import type { ReactElement } from 'react'

/**
 * Each standalone info page wears ONE motion personality. Same white/navy
 * Citadel palette everywhere — only the texture behind the page and the way
 * its content arrives change. Modules live in src/components/themes/.
 */
export type ThemeName = 'technical' | 'organic' | 'kinetic' | 'cinematic'

export interface PageTheme {
  name: ThemeName
  /** Absolutely-positioned atmosphere behind the page content (or null). */
  Backdrop: () => ReactElement | null
  /**
   * Choreograph the page's arrival. `root` is the page root; the content
   * blocks to reveal carry [data-page-item] (eyebrow, h1, lead, sections,
   * navy band) and the h1 carries [data-page-title]. Returns cleanup.
   */
  enter: (root: HTMLElement) => () => void
}

export const PAGE_THEME: Record<string, ThemeName> = {
  'what-we-do': 'technical',
  'ml-process': 'technical',
  people: 'organic',
  advisors: 'organic',
  world: 'organic',
  events: 'kinetic',
  join: 'kinetic',
  'who-we-are': 'cinematic',
  contact: 'cinematic',
}
