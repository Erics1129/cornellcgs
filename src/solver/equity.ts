/**
 * Pot equity by Monte Carlo: the code on the home page's Source chapter.
 *
 * The chapter's editor types the `#region potEquity` block of this file
 * verbatim (effects/codeSnippets reads it with Vite's `?raw`), and its
 * terminal runs the same file for real:
 *
 *   npm run equity -- As Ks        (scripts/equity.mjs)
 *
 * so every number the terminal shows was computed by the code above it.
 * Only erasable TypeScript is used, so Node runs this file directly.
 */

/** A card: rank 2..14 (ace high), suit 0..3 */
export type Card = { r: number; s: number }

export const RANKS = '23456789TJQKA'
export const SUITS = 'shdc'
export const SUIT_GLYPHS = '♠♥♦♣'

export const DECK: Card[] = []
for (let s = 0; s < 4; s++) for (let r = 2; r <= 14; r++) DECK.push({ r, s })

/** A card's identity as a number, so a Set can hold the seen cards */
export const key = (c: Card) => c.r * 4 + c.s

/** "As" → ace of spades; "Td" → ten of diamonds */
export function parse(text: string): Card {
  const r = RANKS.indexOf(text[0]?.toUpperCase()) + 2
  const s = SUITS.indexOf(text[1]?.toLowerCase())
  if (r < 2 || s < 0 || text.length !== 2) throw new Error(`not a card: ${text}`)
  return { r, s }
}

export const label = (c: Card) => `${RANKS[c.r - 2]}${SUIT_GLYPHS[c.s]}`

const CATEGORY_SHIFT = 20

/** The highest straight in a rank bitmask (bit r set for rank r), or 0 */
function straightHigh(mask: number): number {
  const m = mask | (mask & (1 << 14) ? 1 << 1 : 0) // the ace also plays low
  for (let top = 14; top >= 5; top--) {
    const run = 0b11111 << (top - 4)
    if ((m & run) === run) return top
  }
  return 0
}

/** Pack a category and up to five tiebreak ranks into one comparable number */
function score(category: number, ranks: number[]): number {
  let v = category << CATEGORY_SHIFT
  for (let i = 0; i < 5; i++) v |= (ranks[i] ?? 0) << (16 - i * 4)
  return v
}

/**
 * The best five-card hand among hole + board (up to seven cards), as a
 * number: higher is better, equal is a split. Categories: 8 straight flush,
 * 7 quads, 6 full house, 5 flush, 4 straight, 3 trips, 2 two pair, 1 pair,
 * 0 high card.
 */
export function best7(hole: Card[], board: Card[]): number {
  const cards = hole.concat(board)
  const counts = new Array<number>(15).fill(0)
  const suitMask = [0, 0, 0, 0]
  const suitCount = [0, 0, 0, 0]
  let mask = 0
  for (const c of cards) {
    counts[c.r]++
    suitMask[c.s] |= 1 << c.r
    suitCount[c.s]++
    mask |= 1 << c.r
  }

  // Flushes first: a straight flush beats everything
  const flushSuit = suitCount.findIndex((n) => n >= 5)
  if (flushSuit >= 0) {
    const sf = straightHigh(suitMask[flushSuit])
    if (sf) return score(8, [sf])
  }

  // Ranks grouped by how many of each we hold, larger groups first
  const quads: number[] = []
  const trips: number[] = []
  const pairs: number[] = []
  const singles: number[] = []
  for (let r = 14; r >= 2; r--) {
    if (counts[r] === 4) quads.push(r)
    else if (counts[r] === 3) trips.push(r)
    else if (counts[r] === 2) pairs.push(r)
    else if (counts[r] === 1) singles.push(r)
  }

  if (quads.length) {
    const kicker = Math.max(...trips, ...pairs, ...singles, 0)
    return score(7, [quads[0], kicker])
  }
  if (trips.length && (trips.length > 1 || pairs.length)) {
    const pair = Math.max(trips[1] ?? 0, pairs[0] ?? 0)
    return score(6, [trips[0], pair])
  }
  if (flushSuit >= 0) {
    const ranks: number[] = []
    for (let r = 14; r >= 2 && ranks.length < 5; r--) if (suitMask[flushSuit] & (1 << r)) ranks.push(r)
    return score(5, ranks)
  }
  const st = straightHigh(mask)
  if (st) return score(4, [st])
  if (trips.length) return score(3, [trips[0], ...singles.slice(0, 2)])
  if (pairs.length >= 2) {
    const kicker = Math.max(pairs[2] ?? 0, singles[0] ?? 0)
    return score(2, [pairs[0], pairs[1], kicker])
  }
  if (pairs.length) return score(1, [pairs[0], ...singles.slice(0, 3)])
  return score(0, singles.slice(0, 5))
}

/** Positive when a wins, negative when b wins, zero for a split */
export const compare = (a: number, b: number) => a - b

// #region potEquity
// Pot equity by Monte Carlo — deal the unseen, count wins
function potEquity(hole: Card[], board: Card[], n = 2e4) {
  const seen = new Set([...hole, ...board].map(key))
  const deck = DECK.filter((c) => !seen.has(key(c)))
  let win = 0
  let tie = 0
  for (let t = 0; t < n; t++) {
    shuffle(deck)
    const vill = deck.slice(0, 2)
    const need = 5 - board.length
    const run = board.concat(deck.slice(2, 2 + need))
    const cmp = compare(best7(hole, run), best7(vill, run))
    if (cmp > 0) win++
    else if (cmp === 0) tie++
  }
  return (win + tie / 2) / n // share of the pot
}

function shuffle<T>(a: T[]) {
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1))
    ;[a[i], a[j]] = [a[j], a[i]]
  }
}
// #endregion

export { potEquity, shuffle }

/** One step of a run: after `deals` deals, the pot share so far */
export type Checkpoint = { deals: number; equity: number }

/**
 * A run of `batches × batchSize` deals, recorded after every batch so the
 * estimate can be watched converging. Each batch is one real potEquity call;
 * the running figure is their deal-weighted mean.
 */
export function equityRun(hole: Card[], board: Card[] = [], batches = 40, batchSize = 500): Checkpoint[] {
  const out: Checkpoint[] = []
  let sum = 0
  for (let b = 1; b <= batches; b++) {
    sum += potEquity(hole, board, batchSize)
    out.push({ deals: b * batchSize, equity: sum / b })
  }
  return out
}

/** Half-width of the 95% interval around an equity measured over n deals */
export const margin95 = (equity: number, n: number) => 1.96 * Math.sqrt((equity * (1 - equity)) / Math.max(1, n))
