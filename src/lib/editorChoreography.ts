export type EditorAction = 'idle' | 'type' | 'move' | 'select' | 'replace' | 'backspace' | 'copy' | 'paste'
export type EditorFrame = {
  text: string
  caret: number
  action: EditorAction
  selection: { from: number; to: number } | null
  pointer: { offset: number; pressed: boolean } | null
  phrase?: number
}
type Beat = { start: number; end: number; frame: EditorFrame; travel?: { from: number; to: number; drag: boolean } }

/** Content-seeded variation stays identical when the reader scrubs backward. */
function createCadence(source: readonly string[]) {
  let seed = 2166136261
  for (const char of source.join('\n')) seed = Math.imul(seed ^ char.codePointAt(0)!, 16777619)
  const random = () => {
    seed ^= seed << 13
    seed ^= seed >>> 17
    seed ^= seed << 5
    return (seed >>> 0) / 4294967296
  }
  let burst = 0
  let pace = 1
  return (char: string) => {
    if (burst-- <= 0) {
      burst = 3 + Math.floor(random() * 7)
      pace = .72 + random() * .5
    }
    const hesitation = random() < .035 ? 1.4 + random() : 0
    const boundary = char === '\n' ? 2.6 : /[\s,;{}.!?]/.test(char) ? 1.25 : 1
    return (.6 + random() * .55) * pace * boundary + hesitation
  }
}

function sampleBeat(beats: Beat[], target: number): EditorFrame {
  let lo = 0
  let hi = beats.length - 1
  while (lo < hi) {
    const mid = (lo + hi) >>> 1
    if (beats[mid].end <= target) lo = mid + 1
    else hi = mid
  }
  const current = beats[lo]
  if (!current.travel) return current.frame
  const { from, to, drag: pressed } = current.travel
  const t = Math.max(0, Math.min(1, (target - current.start) / (current.end - current.start)))
  const eased = t * t * (3 - 2 * t)
  const offset = from + (to - from) * eased
  return {
    ...current.frame,
    caret: pressed ? Math.round(offset) : current.frame.caret,
    selection: pressed ? { from: Math.min(from, Math.round(offset)), to: Math.max(from, Math.round(offset)) } : current.frame.selection,
    pointer: { offset, pressed },
  }
}

/** Immutable score: seeking never depends on which edits have already played. */
export function createEditorChoreography(lines: readonly string[], mode: 'ts' | 'md' | 'sh' = 'ts') {
  const beats: Beat[] = []
  let text = ''
  let caret = 0
  let time = 0
  const cadence = createCadence(lines)
  let corrected = false
  let replaced = false
  let copied = false
  let maxColumns = Math.max(0, ...lines.map(line => line.length))

  const beat = (duration: number, action: EditorAction, selection: EditorFrame['selection'] = null,
    pointer: EditorFrame['pointer'] = null, travel?: Beat['travel']) => {
    beats.push({ start: time, end: time + duration, frame: { text, caret, action, selection, pointer }, travel })
    time += duration
  }
  const insert = (value: string, action: EditorAction = 'type') => {
    // Small typing bursts, boundary pauses and occasional thought pauses.
    for (const char of value) {
      text = text.slice(0, caret) + char + text.slice(caret)
      caret += char.length
      beat(cadence(char), action)
    }
  }
  const drag = (from: number, to: number) => {
    beat(12, 'move', null, { offset: caret, pressed: false }, { from: caret, to: from, drag: false })
    caret = from
    beat(5, 'select', { from, to: from }, { offset: from, pressed: true })
    beat(24, 'select', { from, to: from }, { offset: from, pressed: true }, { from, to, drag: true })
    caret = to
    beat(12, 'select', { from, to }, { offset: to, pressed: false })
  }
  const replace = (from: number, to: number, value: string) => {
    drag(from, to)
    text = text.slice(0, from) + text.slice(to)
    caret = from
    insert(value, 'replace')
    beat(8, 'idle')
  }

  beat(5, 'idle')
  lines.forEach((line, row) => {
    if (row) insert('\n')
    const start = caret
    const previous = lines[row - 1]
    let prefix = 0
    let suffix = 0
    if (previous && previous !== line) {
      while (prefix < Math.min(previous.length, line.length) && previous[prefix] === line[prefix]) prefix++
      while (suffix < Math.min(previous.length, line.length) - prefix && previous.at(-1 - suffix) === line.at(-1 - suffix)) suffix++
    }
    // Reuse an actual earlier line (e.g. "let win = 0" -> "let tie = 0").
    // The simulated clipboard is only this local string; no browser clipboard API.
    if (!copied && previous && prefix >= 4 && suffix >= 2 && prefix + suffix > Math.max(previous.length, line.length) * .6) {
      const from = start - previous.length - 1
      drag(from, from + previous.length)
      beat(18, 'copy', { from, to: from + previous.length }, { offset: from + previous.length, pressed: false })
      beat(12, 'move', null, { offset: caret, pressed: false }, { from: caret, to: start, drag: false })
      caret = start
      text += previous
      caret += previous.length
      beat(20, 'paste')
      replace(start + prefix, start + previous.length - suffix, line.slice(prefix, line.length - suffix))
      caret = text.length
      copied = true
      return
    }

    // A draft value is selected and replaced after the rest of its line exists.
    const number = !replaced && mode === 'ts' && !line.trimStart().startsWith('//') ? /\b[1-9]\d*(?:e\d+)?\b/.exec(line) : null
    const draft = number ? line.slice(0, number.index) + (number[0][0] === '1' ? '2' : '1') + number[0].slice(1) + line.slice(number.index + number[0].length) : line
    const word = !corrected && !/^\s*(\/\/|#)/.test(line) ? /[a-zA-Z]{5,}/.exec(draft) : null
    if (word) {
      const end = word.index + word[0].length
      insert(draft.slice(0, end))
      insert(word[0].slice(-2))
      maxColumns = Math.max(maxColumns, line.length + 2)
      beat(12, 'idle')
      for (let n = 0; n < 2; n++) {
        text = text.slice(0, caret - 1) + text.slice(caret)
        caret--
        beat(5, 'backspace')
      }
      beat(6, 'idle')
      insert(draft.slice(end))
      corrected = true
    } else {
      insert(draft)
    }
    if (number) {
      replace(start + number.index, start + number.index + number[0].length, number[0])
      caret = text.length
      replaced = true
    }
    beat(line.trim() ? 3 : 7, 'idle')
  })
  beat(14, 'idle')

  const empty: EditorFrame = { text: '', caret: 0, action: 'idle', selection: null, pointer: null }
  const complete: EditorFrame = { text: lines.join('\n'), caret: text.length, action: 'idle', selection: null, pointer: null }
  const at = (progress: number): EditorFrame => {
    const p = Number.isFinite(progress) ? Math.max(0, Math.min(1, progress)) : 0
    if (p === 0) return empty
    if (p === 1) return complete
    return sampleBeat(beats, p * time)
  }
  return { at, maxColumns }
}

export type TextChoreography = {
  at: (elapsed: number) => EditorFrame
  duration: number
  loopFrom: number | null
  reduced: EditorFrame
}

/** Timed, illustrated edits for headings. Copy/paste refers only to score text. */
export function createTextChoreography(phrases: readonly string[], hold = 2600, edits = true): TextChoreography {
  const beats: Beat[] = []
  let text = ''
  let caret = 0
  let phrase = 0
  let time = 0
  const cadence = createCadence(phrases)
  const beat = (ms: number, action: EditorAction, selection: EditorFrame['selection'] = null,
    pointer: EditorFrame['pointer'] = null, travel?: Beat['travel']) => {
    beats.push({ start: time, end: time + ms, frame: { text, caret, action, selection, pointer, phrase }, travel })
    time += ms
  }
  const insert = (value: string, action: EditorAction = 'type') => {
    for (const char of value) {
      text = text.slice(0, caret) + char + text.slice(caret)
      caret += char.length
      beat(edits ? 72 * cadence(char) : 12, action)
    }
  }
  const drag = (from: number, to: number) => {
    beat(320, 'move', null, { offset: caret, pressed: false }, { from: caret, to: from, drag: false })
    caret = from
    beat(140, 'select', { from, to: from }, { offset: from, pressed: true })
    beat(650, 'select', { from, to: from }, { offset: from, pressed: true }, { from, to, drag: true })
    caret = to
    beat(260, 'select', { from, to }, { offset: to, pressed: false })
  }
  const first = phrases[0] ?? ''
  beat(120, 'idle')
  if (edits && first.length >= 5) {
    const word = /[a-zA-Z]{4,}/.exec(first)
    const end = word ? word.index + word[0].length : 0
    insert(first.slice(0, end))
    if (end) {
      insert(first.slice(end - 1, end))
      beat(240, 'idle')
      text = text.slice(0, --caret)
      beat(160, 'backspace')
    }
    insert(first.slice(end))
  } else insert(first)
  const loopFrom = phrases.length > 1 ? time : null
  beat(Math.max(0, Number.isFinite(hold) ? hold : 2600), 'idle')
  for (let i = 1; i < phrases.length; i++) {
    const next = phrases[i]
    // Keep common leading words; select only the words being revised.
    let from = 0
    if (i > 1) {
      while (from < Math.min(text.length, next.length) && text[from] === next[from]) from++
      from = next.lastIndexOf(' ', from - 1) + 1
    }
    drag(from, text.length)
    if (i === 1) beat(450, 'copy', { from: 0, to: text.length }, { offset: text.length, pressed: false })
    text = text.slice(0, from)
    caret = from
    phrase = i
    insert(next.slice(from), 'replace')
    beat(Math.max(0, Number.isFinite(hold) ? hold : 2600), 'idle')
  }
  if (phrases.length > 1) {
    drag(0, text.length)
    text = first // paste the first phrase that was copied above
    caret = text.length
    phrase = 0
    beat(450, 'paste')
  }
  const reduced: EditorFrame = { text: first, caret: first.length, action: 'idle', selection: null, pointer: null, phrase: 0 }
  return { at: elapsed => sampleBeat(beats, Number.isFinite(elapsed) ? Math.max(0, Math.min(time, elapsed)) : 0), duration: time, loopFrom, reduced }
}
