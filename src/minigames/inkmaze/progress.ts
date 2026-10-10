/**
 * Ink Maze: best scores, kept in this browser (localStorage).
 *
 * A level's best is the least ink a win used; fewer moves breaks a tie.
 * Storage can be unavailable (private windows, blocked site data), so every
 * read and write is guarded and the game works without it.
 */

export type Best = { ink: number; moves: number }
export type Bests = Record<string, Best>

const KEY = 'cgs-inkmaze-best-v1'

export function loadBests(): Bests {
  try {
    const raw = localStorage.getItem(KEY)
    const parsed: unknown = raw ? JSON.parse(raw) : {}
    if (!parsed || typeof parsed !== 'object') return {}
    const out: Bests = {}
    for (const [id, value] of Object.entries(parsed as Record<string, unknown>)) {
      const best = value as Partial<Best>
      if (Number.isFinite(best?.ink) && Number.isFinite(best?.moves)) out[id] = { ink: best.ink!, moves: best.moves! }
    }
    return out
  } catch {
    return {}
  }
}

/** Is `run` better than `best`? */
export const beats = (run: Best, best: Best | undefined) => !best || run.ink < best.ink || (run.ink === best.ink && run.moves < best.moves)

/** Records a win if it is a new best; returns the bests as they now stand. */
export function recordWin(levelId: string, run: Best): Bests {
  const bests = loadBests()
  if (!beats(run, bests[levelId])) return bests
  bests[levelId] = run
  try {
    localStorage.setItem(KEY, JSON.stringify(bests))
  } catch {
    /* storage unavailable: the best lasts as long as the page */
  }
  return bests
}
