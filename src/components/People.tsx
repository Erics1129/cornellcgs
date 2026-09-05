import { useEffect, useLayoutEffect, useRef, useState } from 'react'
import gsap from 'gsap'
import { ScrollTrigger } from 'gsap/ScrollTrigger'
import SectionIndex from './SectionIndex'
import { people } from '../content'
import { EASE } from '../lib/eases'
import { prefersReducedMotion } from '../lib/motion'
import { dealCard, flipCard, shadowStyle } from '../lib/cardMotion'
import { useSectionReveals, useSectionDepth } from '../lib/reveal'

gsap.registerPlugin(ScrollTrigger)

function renderEmphasis(text: string) {
  const parts = text.split('*')
  return parts.map((p, i) => (i % 2 === 1 ? <em key={i}>{p}</em> : <span key={i}>{p}</span>))
}

function initials(name: string) {
  return name
    .split(' ')
    .map((w) => w[0])
    .join('')
}

/** Same corner radius as .card-face-surface / .card-back-surface, for the overlays. */
const RADIUS = 'rounded-[clamp(10px,1.2vw,18px)]'

/** Every element one card's motion touches. */
type Parts = {
  shadow: HTMLDivElement | null
  card: HTMLButtonElement | null
  inner: HTMLSpanElement | null
  front: HTMLSpanElement | null
  back: HTMLSpanElement | null
  edge: HTMLSpanElement | null
  sheen: HTMLSpanElement | null
}

const emptyParts = (): Parts => ({
  shadow: null,
  card: null,
  inner: null,
  front: null,
  back: null,
  edge: null,
  sheen: null,
})

/**
 * People (8♠) — the team as playing cards. The grid is dealt from a deck
 * above and to the left of the table (parabolic flight, spin, landing bounce,
 * a shadow that separates while the card is in the air); a card turns over
 * to its bio with real depth (lift at the edge-on moment, edge shade, sheen)
 * under the pointer on fine-pointer devices and on tap / Enter / Space.
 * Reduced motion: no deal, no 3D — the cards fade in at rest and the faces
 * trade places by opacity. TODO real people.
 */
export default function People() {
  const root = useRef<HTMLElement>(null)
  const grid = useRef<HTMLDivElement>(null)
  useSectionReveals(root)
  useSectionDepth(root)

  const parts = useRef<Parts[]>([])
  const part = (i: number) => (parts.current[i] ??= emptyParts())
  /** imperative truth for the flips; `flipped` state only feeds aria-pressed */
  const faceUp = useRef<boolean[]>([])
  const flips = useRef<(gsap.core.Timeline | undefined)[]>([])
  /** the deal has landed — until then the flip leaves the shadow to the deal */
  const dealt = useRef(false)
  const pointerType = useRef('')
  const [flipped, setFlipped] = useState<Set<number>>(new Set())
  /** a portrait that fails to load falls back to the initials badge */
  const [noPhoto, setNoPhoto] = useState<Set<number>>(new Set())
  /** the back's copy, per card — its type size is measured down until it fits */
  const backText = useRef<(HTMLElement | null)[]>([])

  // A card back holds as much as the member wrote, so the type size is found
  // by measurement, not guessed: shrink until nothing overflows the face.
  useLayoutEffect(() => {
    let alive = true
    let retried = false
    // One binary search for every card at once — all the writes, then all
    // the reads — so each step costs one layout flush, not one per card.
    const fitAll = () => {
      if (!alive) return
      const els = backText.current.filter((e): e is HTMLElement => !!e)
      const ready = els.filter((e) => e.clientHeight >= 8)
      if (!ready.length) {
        // nothing laid out yet (a hidden grid) — measure again next frame, once
        if (!retried) {
          retried = true
          requestAnimationFrame(fitAll)
        }
        return
      }
      // Bounds in rem (6–15px at the 16px reference) so the search scales
      // with the design scale on every device class
      const lo = ready.map(() => 0.375)
      const hi = ready.map(() => 0.9375)
      for (let k = 0; k < 8; k++) {
        ready.forEach((el, i) => (el.style.fontSize = `${(lo[i] + hi[i]) / 2}rem`))
        ready.forEach((el, i) => {
          const mid = (lo[i] + hi[i]) / 2
          if (el.scrollHeight <= el.clientHeight) lo[i] = mid
          else hi[i] = mid
        })
      }
      ready.forEach((el, i) => (el.style.fontSize = `${lo[i].toFixed(4)}rem`))
    }
    fitAll()
    // Safe to observe the grid: the cards are aspect-ratio locked and both
    // faces are absolutely positioned, so a type-size change inside a card
    // can never resize the grid (no feedback loop). Only a width change can
    // move the card box, so height-only notifications are ignored.
    let lastW = -1
    const ro = new ResizeObserver((entries) => {
      const w = entries[0]?.contentRect.width ?? 0
      if (Math.abs(w - lastW) < 0.5) return
      lastW = w
      fitAll()
    })
    if (grid.current) ro.observe(grid.current)
    // web fonts land after the first measure and change every metric
    document.fonts?.ready.then(fitAll).catch(() => {})
    return () => {
      alive = false
      ro.disconnect()
    }
  }, [])

  // The deal. Cards wait hidden (visibility too, so nothing in the wings is
  // hoverable or focusable) and fly in once the grid reaches 85% of the
  // viewport; flights are built up front with immediate:false so the start
  // state paints on the first tick, not at build.
  useLayoutEffect(() => {
    const gridEl = grid.current
    if (!gridEl) return
    const all = parts.current.filter((p) => p.card && p.shadow)
    const cards = all.map((p) => p.card as HTMLButtonElement)
    const shadows = all.map((p) => p.shadow as HTMLDivElement)
    if (!cards.length) return

    const ctx = gsap.context(() => {
      const reduced = prefersReducedMotion()
      gsap.set([...cards, ...shadows], { autoAlpha: 0 })

      if (reduced) {
        // No 3D: the back face sits flat over the front and starts hidden
        all.forEach((p) => {
          if (p.back) gsap.set(p.back, { rotationY: 0, backfaceVisibility: 'visible', autoAlpha: 0 })
        })
      }

      const master = gsap.timeline({ paused: true, onComplete: () => (dealt.current = true) })
      master.set([...cards, ...shadows], { visibility: 'inherit' }, 0)

      if (reduced) {
        master.fromTo(
          cards,
          { opacity: 0 },
          { opacity: 1, duration: 0.5, ease: EASE.out, stagger: 0.05, immediateRender: false },
          0,
        )
        master.set(shadows, { opacity: 0.55 }, 0)
      } else {
        // The deck sits above-left of the table: column n travels n·0.8 card
        // widths right and half a viewport down, spinning off a −35° throw.
        const first = cards[0]
        const cardWidth = first.offsetWidth || 160
        const rowTop = (el: HTMLElement) => (el.parentElement as HTMLElement).offsetTop
        const cols = Math.max(1, cards.filter((c) => rowTop(c) === rowTop(first)).length)
        cards.forEach((card, i) => {
          master.add(
            dealCard(card, {
              from: { x: -(i % cols) * cardWidth * 0.8, y: -window.innerHeight * 0.5, rotation: -35 },
              rotation: 0,
              duration: 0.8,
              lift: -36,
              air: 1.06,
              shadow: shadows[i],
              immediate: false,
            }),
            i * 0.07,
          )
        })
      }

      ScrollTrigger.create({
        trigger: gridEl,
        start: 'top 85%',
        once: true,
        fastScrollEnd: true,
        animation: master,
      })
    }, root)

    return () => ctx.revert()
  }, [])

  // Flip timelines live outside the context — kill them on unmount
  useEffect(
    () => () => {
      flips.current.forEach((tl) => tl?.kill())
    },
    [],
  )

  const setFace = (i: number, up: boolean) => {
    if (faceUp.current[i] === up) return
    faceUp.current[i] = up
    setFlipped((prev) => {
      const next = new Set(prev)
      if (up) next.add(i)
      else next.delete(i)
      return next
    })
    const p = parts.current[i]
    if (!p?.inner) return
    // Interruptible: a turn that reverses mid-way continues from where it is
    flips.current[i]?.kill()
    if (prefersReducedMotion()) {
      const tl = gsap.timeline()
      if (p.front) tl.to(p.front, { autoAlpha: up ? 0 : 1, duration: 0.3, ease: EASE.out }, 0)
      if (p.back) tl.to(p.back, { autoAlpha: up ? 1 : 0, duration: 0.3, ease: EASE.out }, 0)
      flips.current[i] = tl
      return
    }
    flips.current[i] = flipCard(p.inner, up, {
      duration: 0.85,
      edge: p.edge,
      sheen: p.sheen,
      shadow: dealt.current ? p.shadow : null,
    })
  }

  const toggle = (i: number) => setFace(i, !faceUp.current[i])

  return (
    <section ref={root} id="people" className="section">
      <SectionIndex rank="8" />
      <div className="container-site">
        <h2 data-reveal="heading" className="h-section mb-10 max-w-[16ch] md:mb-14">
          {renderEmphasis(people.heading)}
        </h2>
        <div
          ref={grid}
          data-depth="16"
          className="grid grid-cols-2 gap-4 sm:grid-cols-3 lg:grid-cols-4 lg:gap-5"
          data-interactive
        >
          {people.leaders.map((m, i) => (
            <div
              key={i}
              className="life-float relative"
              style={{ ['--life-dur' as string]: `${6.4 + (i % 4) * 0.7}s`, ['--life-delay' as string]: `${-(i * 1.3) % 7}s` }}
            >
              {/* Ground shadow — a sibling under the card, never box-shadow */}
              <div
                ref={(el) => {
                  part(i).shadow = el
                }}
                aria-hidden="true"
                style={shadowStyle()}
              />
              {/* The dealt element: x / y / rotation / scale; carries the perspective for the turn */}
              <button
                ref={(el) => {
                  part(i).card = el
                }}
                type="button"
                aria-label={`${m.name}, ${m.role} — show details`}
                aria-describedby={`card-back-${i}`}
                aria-pressed={flipped.has(i)}
                className="relative block aspect-[5/7] w-full cursor-pointer [perspective:68.75rem]"
                onPointerEnter={(e) => {
                  // A mouse hovers; touch and pen tap
                  if (e.pointerType === 'mouse') setFace(i, true)
                }}
                onPointerLeave={(e) => {
                  if (e.pointerType === 'mouse') setFace(i, false)
                }}
                onPointerDown={(e) => {
                  pointerType.current = e.pointerType
                }}
                onClick={(e) => {
                  // detail 0 = Enter / Space; a mouse click leaves the flip to hover
                  const keyboard = e.detail === 0
                  if (!keyboard && pointerType.current === 'mouse') return
                  toggle(i)
                }}
              >
                {/* The turning element: rotationY, with lift at the edge-on moment */}
                <span
                  ref={(el) => {
                    part(i).inner = el
                  }}
                  className="absolute inset-0 block [transform-style:preserve-3d]"
                >
                  {/* Front — portrait side */}
                  <span
                    ref={(el) => {
                      part(i).front = el
                    }}
                    className="card-face-surface neon absolute inset-0 flex flex-col justify-between overflow-hidden p-3 [backface-visibility:hidden] md:p-4"
                  >
                    <span className="flex flex-col items-start leading-none" aria-hidden="true">
                      <span className="font-display text-base text-[var(--ink)] md:text-xl">8</span>
                      <span className="text-xs text-[var(--ink)] md:text-sm">♠</span>
                    </span>
                    {m.photo && !noPhoto.has(i) ? (
                      <img
                        src={m.photo}
                        alt=""
                        width={160}
                        height={160}
                        onError={() => setNoPhoto((s) => new Set(s).add(i))}
                        className="mx-auto h-16 w-16 rounded-full object-cover shadow-[0_6px_14px_-6px_rgba(0,0,0,0.6)] sm:h-20 sm:w-20 md:h-24 md:w-24"
                      />
                    ) : (
                      <span className="mx-auto flex h-12 w-12 items-center justify-center rounded-full bg-[radial-gradient(circle_at_35%_30%,#1c2c52,#0b0b0f)] sm:h-14 sm:w-14 md:h-16 md:w-16">
                        <span className="font-display text-sm text-[var(--ivory)] sm:text-base md:text-lg">
                          {m.name === 'To be added' ? '♠' : initials(m.name)}
                        </span>
                      </span>
                    )}
                    <span className="block text-center">
                      <span className="h-card block text-[0.95rem]! leading-tight text-[var(--ink)] sm:text-[1rem]! md:text-[1.1rem]!">
                        {m.name}
                      </span>
                      <span className="mono mt-0.5 block text-[0.6875rem]! text-[color-mix(in_srgb,var(--ink)_65%,#7a6a4a)] sm:text-[0.75rem]! md:text-[0.75rem]!">
                        {m.role}
                      </span>
                    </span>
                  </span>
                  {/* Back — what they bring; the type size is measured to fit */}
                  <span
                    ref={(el) => {
                      part(i).back = el
                    }}
                    className="card-back-surface absolute inset-0 flex [transform:rotateY(180deg)] flex-col overflow-hidden p-3 [backface-visibility:hidden] md:p-4"
                  >
                    <span aria-hidden="true" className="block text-center text-base text-[var(--silver)] md:text-lg">
                      ♠
                    </span>
                    <span
                      id={`card-back-${i}`}
                      ref={(el) => {
                        backText.current[i] = el
                      }}
                      className="mt-1.5 block min-h-0 flex-1 overflow-hidden leading-[1.35] text-[var(--silver)]"
                    >
                      <span className="h-card block text-[1.25em]! leading-tight text-[var(--ivory)]">{m.name}</span>
                      <span className="mono mt-[0.15em] block text-[0.85em]! uppercase tracking-[0.1em] text-[color-mix(in_srgb,var(--silver)_70%,transparent)]">
                        {m.role}
                      </span>
                      {m.major && <span className="mt-[0.15em] block text-[0.95em]">{m.major}</span>}
                      {m.experience?.length ? (
                        <span className="mt-[0.7em] block">
                          <span className="mono block text-[0.8em]! uppercase tracking-[0.14em] text-[var(--gold)]">
                            Experience
                          </span>
                          {m.experience.map((x) => (
                            <span key={x} className="mt-[0.2em] block">
                              {x}
                            </span>
                          ))}
                        </span>
                      ) : null}
                      {m.skills?.length ? (
                        <span className="mt-[0.7em] block">
                          <span className="mono block text-[0.8em]! uppercase tracking-[0.14em] text-[var(--gold)]">
                            Skills
                          </span>
                          <span className="mt-[0.2em] block">{m.skills.join(' · ')}</span>
                        </span>
                      ) : null}
                      {!m.major && !m.experience?.length && !m.skills?.length && (
                        <span className="mt-[0.7em] block">Bio to be added.</span>
                      )}
                    </span>
                  </span>
                  {/* Edge shade — coplanar with the faces (both sides), so the face
                      falls into shadow as it turns through the light */}
                  <span
                    ref={(el) => {
                      part(i).edge = el
                    }}
                    aria-hidden="true"
                    className={`pointer-events-none absolute inset-0 z-[2] block opacity-0 ${RADIUS} bg-[linear-gradient(100deg,rgba(4,6,14,0.95),rgba(4,6,14,0.5))]`}
                  />
                  {/* Sheen — the lit side sweeping across as the card comes round; clipped to the face */}
                  <span
                    aria-hidden="true"
                    className={`pointer-events-none absolute inset-0 z-[2] block overflow-hidden ${RADIUS}`}
                  >
                    <span
                      ref={(el) => {
                        part(i).sheen = el
                      }}
                      className="absolute -inset-y-[20%] left-0 block w-full opacity-0 bg-[linear-gradient(105deg,rgba(255,255,255,0)_30%,rgba(255,255,255,0.55)_50%,rgba(255,255,255,0)_70%)]"
                    />
                  </span>
                </span>
              </button>
            </div>
          ))}
        </div>
      </div>
    </section>
  )
}
