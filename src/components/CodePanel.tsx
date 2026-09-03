import { useEffect, useRef } from 'react'
import gsap from 'gsap'
import { ScrollTrigger } from 'gsap/ScrollTrigger'
import { prefersReducedMotion } from '../lib/motion'

gsap.registerPlugin(ScrollTrigger)

/**
 * An editor panel that TYPES the club's CFR update under the reader's
 * scroll: each line is revealed by a clip that sweeps left → right, a caret
 * follows the last written line. Scrubbed against a caller-supplied range so
 * it can ride a chapter's pin. Clip-path and transform only.
 */

const KW = /\b(const|let|function|return|if|for|new|type|number|boolean)\b/g

/** Idle-life phase (seconds): siblings never move in lockstep. */
const life = (delay: number, dur?: number): React.CSSProperties => ({
  ['--life-delay' as string]: `${delay.toFixed(2)}s`,
  ...(dur ? { ['--life-dur' as string]: `${dur.toFixed(2)}s` } : {}),
})

/** Markdown: headings blue, the quote amber, bullets and links muted-bright. */
function MdLine({ text }: { text: string }) {
  if (/^#/.test(text)) return <span className="text-[var(--neon-mid)]">{text}</span>
  if (/^>/.test(text)) return <span className="text-[var(--accent-amber)]">{text}</span>
  if (/^- /.test(text))
    return (
      <>
        <span className="text-[var(--neon-mid)]">- </span>
        {text.slice(2)}
      </>
    )
  return <>{text}</>
}

/** Shell: the prompt in neon, output lines muted. */
function ShLine({ text }: { text: string }) {
  if (text.startsWith('$ '))
    return (
      <>
        <span className="text-[var(--neon-mid)]">$ </span>
        {text.slice(2)}
      </>
    )
  if (text.startsWith('>') || text.startsWith('✓')) return <span className="opacity-70">{text}</span>
  return <>{text}</>
}

function Line({ text }: { text: string }) {
  const c = text.indexOf('//')
  const code = c >= 0 ? text.slice(0, c) : text
  const comment = c >= 0 ? text.slice(c) : ''
  const parts: Array<{ t: string; k: 'str' | 'plain' }> = []
  const strRe = /'(?:\\.|[^'\\])*'/g
  let i = 0
  for (const m of code.matchAll(strRe)) {
    if (m.index! > i) parts.push({ t: code.slice(i, m.index), k: 'plain' })
    parts.push({ t: m[0], k: 'str' })
    i = m.index! + m[0].length
  }
  if (i < code.length) parts.push({ t: code.slice(i), k: 'plain' })
  return (
    <>
      {parts.map((p, j) =>
        p.k === 'plain' ? (
          <span key={j}>
            {p.t.split(KW).map((seg, k) =>
              k % 2 === 1 ? (
                <span key={k} className="text-[var(--neon-mid)]">
                  {seg}
                </span>
              ) : (
                seg
              ),
            )}
          </span>
        ) : (
          <span key={j} className="text-[var(--accent-amber)]">
            {p.t}
          </span>
        ),
      )}
      {comment && <span className="opacity-55">{comment}</span>}
    </>
  )
}

export default function CodePanel({
  trigger,
  lines,
  title,
  mode = 'ts',
  start = 'top top',
  end = '+=150%',
  from = 0.2,
  to = 0.95,
  small,
  className = '',
}: {
  /** element whose scroll range drives the typing (usually a pinned chapter) */
  trigger: React.RefObject<HTMLElement | null>
  lines: string[]
  title: string
  mode?: 'ts' | 'md' | 'sh'
  start?: string
  end?: string
  /** typing runs between these fractions of the range */
  from?: number
  to?: number
  /**
   * Under 768px the chapter usually doesn't pin (its content is taller than
   * the viewport), so the panel drives itself off its own element — or
   * whatever range the caller gives here.
   */
  small?: {
    trigger?: React.RefObject<HTMLElement | null>
    start?: string
    end?: string
    from?: number
    to?: number
  }
  className?: string
}) {
  const root = useRef<HTMLDivElement>(null)
  const caret = useRef<HTMLSpanElement>(null)

  // Passive effect on purpose: the trigger is the PARENT's ref, and a parent's
  // ref is attached after its children's layout effects — under a layout
  // effect it is still null on the first (only, in production) run.
  useEffect(() => {
    const el = root.current
    if (!el) return
    const rows = Array.from(el.querySelectorAll<HTMLElement>('[data-line]'))
    if (prefersReducedMotion()) {
      rows.forEach((r) => (r.style.clipPath = ''))
      el.style.opacity = ''
      el.style.transform = ''
      return
    }

    const total = lines.reduce((n, l) => n + Math.max(1, l.length), 0)
    const build = (trig: Element, s: string, e: string, lo: number, hi: number) => {
      rows.forEach((r) => (r.style.clipPath = 'inset(0 100% 0 0)'))
      const typing = { p: 0 }
      gsap.to(typing, {
        p: 1,
        ease: 'none',
        scrollTrigger: {
          trigger: trig,
          start: s,
          end: e,
          scrub: 0.3,
          invalidateOnRefresh: true,
        },
        onUpdate: () => {
          // map the range's [lo, hi] window onto 0..1 of the typing
          const q = Math.max(0, Math.min(1, (typing.p - lo) / (hi - lo)))
          // the panel itself rises in over the first slice of the window
          const a = Math.max(0, Math.min(1, q / 0.08))
          el.style.opacity = String(a)
          el.style.transform = `translateY(${((1 - a) * 24).toFixed(1)}px)`
          let budget = q * total
          let lastY = 0
          rows.forEach((row, i) => {
            const len = Math.max(1, lines[i].length)
            const f = Math.max(0, Math.min(1, budget / len))
            budget -= len
            row.style.clipPath = `inset(0 ${((1 - f) * 100).toFixed(2)}% 0 0)`
            if (f > 0) lastY = row.offsetTop
          })
          if (caret.current) caret.current.style.transform = `translateY(${lastY}px)`
        },
      })
    }

    const mm = gsap.matchMedia(el)
    mm.add('(min-width: 768px)', () => {
      const trig = trigger.current
      if (trig) build(trig, start, end, from, to)
    })
    mm.add('(max-width: 767px)', () => {
      // its own element by default: it types while it crosses the screen
      const trig = small?.trigger?.current ?? el
      build(trig, small?.start ?? 'top 88%', small?.end ?? 'bottom 45%', small?.from ?? 0.04, small?.to ?? 0.96)
    })
    return () => mm.revert()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  return (
    <div
      ref={root}
      aria-hidden="true"
      className={`overflow-hidden rounded-[0.875rem] border border-[rgba(201,205,214,0.16)] bg-[rgba(8,11,22,0.78)] shadow-[0_40px_90px_-2.5rem_rgba(0,0,0,0.8)] ${className}`}
      style={{ opacity: 0, transform: 'translateY(24px)' }}
    >
      <div className="flex items-center gap-2 border-b border-[rgba(201,205,214,0.1)] px-4 py-2.5">
        <span className="life-glow h-2.5 w-2.5 rounded-full bg-[#ff5f57]" style={life(-0.4, 3.6)} />
        <span className="life-glow h-2.5 w-2.5 rounded-full bg-[#febc2e]" style={life(-1.7, 4.2)} />
        <span className="life-glow h-2.5 w-2.5 rounded-full bg-[#28c840]" style={life(-2.9, 4.8)} />
        <span className="mono ml-3 text-[0.6875rem] tracking-[0.08em] text-[var(--muted)]">{title}</span>
      </div>
      {/* The root is written by the scrub (opacity/translate), so the float rides the editor body;
          the phase is keyed off `from` so stacked panels never move together */}
      <div className="life-float relative px-4 py-3" style={life(-from * 7, 6.4 + from * 2)}>
        <div className="mono relative text-[clamp(0.625rem,0.85vw,0.8125rem)] leading-[1.7] text-[var(--text)]">
          {lines.map((l, i) => (
            <div key={i} data-line className="whitespace-pre" style={{ clipPath: 'inset(0 100% 0 0)' }}>
              {mode !== 'sh' && (
                <span className="mr-4 inline-block w-6 select-none text-right opacity-35">{i + 1}</span>
              )}
              {mode === 'md' ? <MdLine text={l} /> : mode === 'sh' ? <ShLine text={l} /> : <Line text={l} />}
            </div>
          ))}
          <span
            ref={caret}
            className={`absolute top-0 h-[1.5em] w-[0.55em] bg-[var(--neon-mid)] [animation:cursor-blink_1s_steps(1,end)_infinite] ${mode === 'sh' ? 'left-0' : 'left-10'}`}
          />
        </div>
      </div>
    </div>
  )
}
