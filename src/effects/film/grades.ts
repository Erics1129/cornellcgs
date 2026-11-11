/**
 * film/grades.ts — one grade per scene. Numbers are ASC CDL in linear light.
 * The card table is the anchor (ivory stock, felt, brass, a warm lamp): steel
 * blue and deep-space scenes are graded toward it, never the reverse.
 */
import type { ChapterId, ChapterState } from '../../lib/deck'

export interface Grade {
  exposure: number
  slope: [number, number, number]
  offset: [number, number, number]
  power: [number, number, number]
  sat: number
  /** 0 AgX, 1 Khronos Neutral, 2 none (display-referred plates and photographs) */
  tone: 0 | 1 | 2
}

const grade = (g: Partial<Grade>): Grade => ({
  exposure: 1, slope: [1, 1, 1], offset: [0, 0, 0], power: [1, 1, 1], sat: 1, tone: 2, ...g,
})

/** Identity: what a plate scene must measure against before a grade is trusted. */
export const NEUTRAL: Grade = grade({})

export type SceneGrade = 'city' | 'globe' | 'travel' | 'universe' | 'eye' | 'table'

export const SCENE_GRADES: Record<SceneGrade, Grade> = {
  // Hero city: a rendered plate. The old CSS filter chain is baked into the shader; this only trims.
  city: grade({ slope: [0.99, 1.0, 1.02], sat: 0.96 }),
  // Dotted globe: warm key, a touch of lift so the night side never sits at pure #000.
  globe: grade({ slope: [1.03, 1.0, 0.96], offset: [0.0012, 0.001, 0.0008] }),
  // Six photographs through one stock: saturation ceiling, slightly warm whites, cool-neutral blacks.
  travel: grade({ exposure: 0.94, slope: [1.0, 0.99, 0.955], power: [1.03, 1.03, 1.0], sat: 0.88 }),
  // Synthetic deep space in linear light: AgX, slightly rich.
  universe: grade({ exposure: 1.15, slope: [1.05, 1.0, 0.94], power: [1.06, 1.06, 1.04], sat: 1.07, tone: 0 }),
  // Rendered eye: warm kicker so the steel blue sits in the house palette.
  eye: grade({ slope: [1.045, 1.0, 0.95], offset: [0.0015, 0.0008, 0], sat: 0.93 }),
  // The lit table (GradientBG): AgX keeps the lamp pool from clipping.
  table: grade({ tone: 0 }),
}

/** Chapter to scene grade, for scenes that are addressed by chapter. */
export const GRADES: Partial<Record<ChapterId, Grade>> = {
  top: SCENE_GRADES.city,
  world: SCENE_GRADES.travel,
  universe: SCENE_GRADES.universe,
  vision: SCENE_GRADES.eye,
}

/**
 * The grade a chapter's canvas should use this frame. The lean toward the
 * neighbour's grade while a chapter enters or leaves is deferred (P2): for now
 * every chapter holds its own grade and the seams carry the blend.
 */
export function gradeFor(state: ChapterState | null | undefined, fallback: Grade = NEUTRAL): Grade {
  return (state && GRADES[state.id]) || fallback
}
