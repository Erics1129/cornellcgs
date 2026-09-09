/** Complete TypeScript programs, formatted at token boundaries for the small
 * reflected editor. Desktop and compact variants implement the same functions. */
const PROGRAMS = [
  {
    file: 'regret.ts',
    desktop: [
      'function strategy(',
      '  regret: number[]',
      ') {',
      '  const pos =',
      '    regret.map(r =>',
      '      Math.max(0, r)',
      '    )',
      '  const n = pos.length',
      '  if (!n) return []',
      '  const sum =',
      '    pos.reduce(',
      '      (s, r) => s + r, 0',
      '    )',
      '  return pos.map(r =>',
      '    sum ? r / sum',
      '        : 1 / n',
      '  )',
      '}',
    ],
    compact: [
      'function strategy(',
      '  r: number[]',
      ') {',
      '  const p = r.map(',
      '    n => Math.max(',
      '      0, n',
      '    )',
      '  )',
      '  const n =',
      '    p.length',
      '  if (!n)',
      '    return []',
      '  const s =',
      '    p.reduce(',
      '      (a, b) =>',
      '        a + b, 0',
      '    )',
      '  return p.map(',
      '    x => s',
      '      ? x / s',
      '      : 1 / n',
      '  )',
      '}',
    ],
  },
  {
    file: 'sample.ts',
    desktop: [
      'function choose(',
      '  probs: number[],',
      '  unit: number',
      ') {',
      '  let edge = 0',
      '  for (let i = 0;',
      '    i < probs.length;',
      '    i++) {',
      '    edge += probs[i]',
      '    if (unit < edge)',
      '      return i',
      '  }',
      '  return probs.length-1',
      '}',
    ],
    compact: [
      'function choose(',
      '  p: number[],',
      '  unit: number',
      ') {',
      '  let edge = 0',
      '  for (let i = 0;',
      '    i < p.length;',
      '    i++) {',
      '    edge += p[i]',
      '    if (',
      '      unit < edge',
      '    ) return i',
      '  }',
      '  return (',
      '    p.length - 1',
      '  )',
      '}',
    ],
  },
  {
    file: 'legal.ts',
    desktop: [
      'function simulate(',
      '  board: number[],',
      '  player: number',
      ') {',
      '  return board.flatMap(',
      '    (cell, i) => {',
      '      if (cell !== 0)',
      '        return []',
      '      const next = [',
      '        ...board',
      '      ]',
      '      next[i] = player',
      '      return [next]',
      '    }',
      '  )',
      '}',
    ],
    compact: [
      'function simulate(',
      '  b: number[],',
      '  p: number',
      ') {',
      '  const step = (',
      '    cell: number,',
      '    i: number',
      '  ) => {',
      '    if (cell)',
      '      return []',
      '    const next =',
      '      b.slice()',
      '    next[i] = p',
      '    return [next]',
      '  }',
      '  return b',
      '    .flatMap(step)',
      '}',
    ],
  },
]

const INK = {
  plain: '#dbf5ff', keyword: '#c4adff', type: '#90d8ff', number: '#82edff',
  operator: '#a1c1ff', selection: '#163d70', background: '#030c1c',
}
const CHARS_PER_MS = 0.034
const READ_MS = 180
const REPLACE_MS = 240

type Token = { text: string; column: number; color: string }
type Prepared = {
  file: string; lines: string[]; tokens: Token[][]; starts: number[]
  length: number; seed: number; typingMs: number; duration: number
}
type Layout = { programs: Prepared[]; period: number; rows: number; font: number; leading: number; cell: number }

function tokenize(line: string): Token[] {
  return Array.from(line.matchAll(/\s+|[A-Za-z_$][\w$]*|\d+(?:\.\d+)?|[^\w\s]/g), (match) => {
    const text = match[0]
    const color = /^(function|const|let|return|if|for)$/.test(text) ? INK.keyword
      : /^(number|Math)$/.test(text) ? INK.type
      : /^\d/.test(text) ? INK.number
      : /^[^\w\s]+$/.test(text) ? INK.operator : INK.plain
    return { text, column: match.index!, color }
  })
}

/** No playback state: seeking or repeating a timestamp produces the same
 * editor. The existing consumer supplies the clock and its 25Hz paint budget. */
export class CodeReflection {
  canvas = document.createElement('canvas')
  private ctx: CanvasRenderingContext2D
  private layouts = new Map<boolean, Layout>()

  constructor() {
    this.canvas.width = 800
    this.canvas.height = 500
    this.ctx = this.canvas.getContext('2d')!
  }

  private layout(compact: boolean): Layout {
    const cached = this.layouts.get(compact)
    if (cached) return cached
    const rows = compact ? 4 : 5
    const font = compact ? 62 : 48
    this.ctx.font = `600 ${font}px monospace`
    const cell = this.ctx.measureText('M').width
    const programs = PROGRAMS.map((program): Prepared => {
      const lines = compact ? program.compact : program.desktop
      let length = 0
      const starts = lines.map((line) => { const start = length; length += line.length + 1; return start })
      length-- // No artificial trailing empty line in the visible editor.
      // Arrive with several complete lines and a partly typed next line.
      const seedRow = rows - 1
      const seed = starts[seedRow] + Math.max(1, Math.floor(lines[seedRow].length * .35))
      const typingMs = (length - seed) / CHARS_PER_MS
      return { file: program.file, lines, tokens: lines.map(tokenize), starts, length, seed, typingMs, duration: typingMs + READ_MS + REPLACE_MS }
    })
    const layout = { programs, period: programs.reduce((sum, program) => sum + program.duration, 0), rows, font, leading: compact ? 99 : 80, cell }
    this.layouts.set(compact, layout)
    return layout
  }

  paint(now: number, compact = false) {
    const c = this.ctx
    const layout = this.layout(compact)
    const time = Number.isFinite(now) ? now : 0
    let local = ((time % layout.period) + layout.period) % layout.period
    let program = layout.programs[0]
    for (const candidate of layout.programs) {
      program = candidate
      if (local < candidate.duration) break
      local -= candidate.duration
    }
    const count = Math.min(program.length, program.seed + Math.floor(local * CHARS_PER_MS))
    const replacing = local >= program.typingMs + READ_MS
    let current = 0
    while (current + 1 < program.lines.length && program.starts[current + 1] <= count) current++
    const first = Math.max(0, current - layout.rows + 1)
    const left = 36
    const top = 76

    c.fillStyle = INK.background
    c.fillRect(0, 0, 800, 500)
    c.fillStyle = '#0b1b33'
    c.fillRect(0, 0, 800, 56)
    c.font = '600 25px monospace'
    c.fillStyle = '#a4cfff'
    c.fillText(program.file, left, 37)
    c.fillStyle = '#bba8ff'
    c.fillRect(left, 53, 134, 3)

    c.save()
    c.beginPath()
    c.rect(20, top, 760, 424)
    c.clip()
    c.font = `600 ${layout.font}px monospace`
    for (let lineIndex = first; lineIndex <= current; lineIndex++) {
      const row = lineIndex - first
      const y = top + row * layout.leading
      const baseline = y + layout.font
      const visible = Math.max(0, Math.min(program.lines[lineIndex].length, count - program.starts[lineIndex]))
      if (replacing || lineIndex === current) {
        c.fillStyle = replacing ? INK.selection : '#0a2038'
        c.fillRect(left - 8, y + 2, replacing ? Math.max(layout.cell, visible * layout.cell) + 16 : 736, layout.leading - 5)
      }
      for (const token of program.tokens[lineIndex]) {
        if (token.column >= visible) break
        if (!token.text.trim()) continue
        c.fillStyle = token.color
        c.fillText(token.text.slice(0, visible - token.column), left + token.column * layout.cell, baseline)
      }
      if (lineIndex === current && !replacing) {
        c.fillStyle = '#b4edff'
        c.fillRect(left + visible * layout.cell + 3, y + 8, compact ? 8 : 6, layout.font)
      }
    }
    c.restore()
  }
}
