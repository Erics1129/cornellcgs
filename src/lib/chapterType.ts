import gsap from 'gsap'
import '../styles/chapter-type.css'

export type ChapterTreatment = 'rise' | 'sweep' | 'slide' | 'gather'

/** Add type to its scene's existing clock so seeking and reverse scroll agree.
 * The timeline is normally a latched reveal's (lib/reveal.ts): reverting it restores
 * the fully visible HTML when reduced motion is enabled or the scene unmounts.
 * Split glyphs remain presentational; the heading owns the accessible name. */
export function chapterType(
  timeline: gsap.core.Timeline,
  heading: HTMLElement | null,
  treatment: ChapterTreatment,
  at = 0,
  duration = 0.5,
) {
  if (!heading || window.matchMedia('(prefers-reduced-motion: reduce)').matches) return timeline
  const glyphs = Array.from(heading.querySelectorAll<HTMLElement>('[data-chapter-glyph]'))
  const targets = glyphs.length ? glyphs : [heading]
  const stagger = glyphs.length ? Math.min(0.035, 0.18 / glyphs.length) : 0

  switch (treatment) {
    case 'sweep':
      return timeline.fromTo(heading,
        { clipPath: 'inset(-12% 100% -12% -3%)' },
        { clipPath: 'inset(-12% -3% -12% -3%)', duration, ease: 'power2.out' }, at)
    case 'slide':
      return timeline.fromTo(heading, { x: 24, opacity: 0 },
        { x: 0, opacity: 1, duration, ease: 'power2.out' }, at)
    case 'gather':
      // fromTo renders every letter's start state at once, so a delayed letter
      // never shows its finished DOM style before its turn.
      return timeline.fromTo(targets, {
        x: (i: number) => (i - (targets.length - 1) / 2) * 7,
        yPercent: (i: number) => i % 2 ? 12 : -12,
        opacity: 0,
      }, { x: 0, yPercent: 0, opacity: 1, duration, stagger, ease: 'power2.out' }, at)
    case 'rise':
      return timeline.fromTo(targets, { yPercent: 105 }, { yPercent: 0, duration, stagger, ease: 'power3.out' }, at)
  }
}
