import { lazy, Suspense, useEffect, useRef, useState } from 'react'
import type { MouseEvent, RefObject } from 'react'
import { advisors, pages, site, team } from '../content'
import type { SubPageDef } from '../content'
import { pagePath } from '../lib/router'
import { PAGE_ORDER, PAGE_SCENES } from '../lib/pageScenes'
import type { PageSceneId } from '../lib/pageScenes'
import PageScene from './PageScene'
import Dice from './Dice'
import PageNavigator from './PageNavigator'
import type { Algo } from './GraphAlgo'
import '../styles/subpages.css'

const CHAPTER: Record<string, string> = { advisors: 'people', contact: 'join' }
const GraphAlgo = lazy(() => import('./GraphAlgo'))
const NetworkFlow = lazy(() => import('./NetworkFlow'))
const ALGO: Record<string, Algo> = { 'what-we-do': 'dijkstra', 'ml-process': 'astar', world: 'kruskal', people: 'prim' }
type Section = SubPageDef['sections'][number]

/** Once-only entrances enhance visible DOM; leaving mid-reveal cancels to the
 * fully visible base style, so a fast fling or preference change cannot hide copy. */
function usePageEntrances(root: RefObject<HTMLDivElement>, id: string) {
  useEffect(() => {
    if (!root.current) return
    const media = matchMedia('(prefers-reduced-motion: reduce)')
    const seen = new WeakSet<Element>()
    const active = new Map<Element, Animation>()
    const stop = () => { active.forEach(animation => animation.cancel()); active.clear() }
    const observer = new IntersectionObserver(entries => {
      for (const entry of entries) {
        if (!entry.isIntersecting) { active.get(entry.target)?.cancel(); active.delete(entry.target); continue }
        if (seen.has(entry.target)) continue
        seen.add(entry.target)
        if (media.matches || document.hidden) continue
        const intro = entry.target.classList.contains('sp-intro')
        const from = intro && id === 'events' ? 'translate3d(-18px,0,0)' : intro && id === 'contact' ? 'translate3d(18px,0,0)' : 'translate3d(0,20px,0)'
        const animation = entry.target.animate([{ opacity: 0, transform: from }, { opacity: 1, transform: 'translate3d(0,0,0)' }], { duration: intro ? 780 : 650, easing: 'cubic-bezier(.16,1,.3,1)' })
        active.set(entry.target, animation)
        animation.onfinish = () => active.delete(entry.target)
      }
    }, { threshold: 0 })
    root.current.querySelectorAll('.sp-intro, .sp-section, .sp-roster__group, .sp-advisor').forEach(element => observer.observe(element))
    const motion = () => { if (media.matches) stop() }
    const visibility = () => { if (document.hidden) stop() }
    media.addEventListener('change', motion)
    document.addEventListener('visibilitychange', visibility)
    return () => { observer.disconnect(); stop(); media.removeEventListener('change', motion); document.removeEventListener('visibilitychange', visibility) }
  }, [root, id])
}

/** Keep published prose intact while making every address actionable. */
function Copy({ text }: { text: string }) {
  return <>{text.split(/([A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,})/gi).map((part, index) =>
    /^[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}$/i.test(part)
      ? <a key={index} className="sp-email" href={`mailto:${part}`}>{part}</a>
      : part,
  )}</>
}

function ContentSection({ section, index, numbered = false }: { section: Section; index: number; numbered?: boolean }) {
  const external = !!section.link && /^https?:\/\//i.test(section.link.href)
  return (
    <section className="sp-section" data-content-section={index} aria-labelledby={`section-${index}`}>
      {numbered && <span className="sp-ordinal" aria-hidden="true">{String(index + 1).padStart(2, '0')}</span>}
      <div className="sp-section__copy">
        <h2 id={`section-${index}`} title={section.alt}>{section.heading}</h2>
        <p className="sp-body"><Copy text={section.body} /></p>
        {section.link && <a className="sp-action" href={section.link.href} target={external ? '_blank' : undefined} rel={external ? 'noreferrer' : undefined}>{section.link.label}<span aria-hidden="true">{external ? '↗' : '→'}</span></a>}
      </div>
    </section>
  )
}

function Title({ def, index }: { def: SubPageDef; index: number }) {
  return <header className="sp-intro"><p className="sp-eyebrow"><span aria-hidden="true">{String(index + 1).padStart(2, '0')} / </span>{site.fullName}</p><h1 id="page-title">{def.title}</h1><p className="sp-lead"><Copy text={def.lead} /></p></header>
}

function Portrait({ advisor }: { advisor: (typeof advisors)[number] }) {
  const [failed, setFailed] = useState(false)
  const initials = advisor.name.trim().split(/\s+/).filter(Boolean).map(part => part[0]).filter((_, i, parts) => i === 0 || i === parts.length - 1).join('')
  return advisor.photo && !failed
    ? <img className="sp-advisor__photo" src={advisor.photo} alt={advisor.name} width="360" height="420" loading="lazy" onError={() => setFailed(true)} />
    : <div className="sp-advisor__photo sp-advisor__initials" role="img" aria-label={advisor.name}>{initials}</div>
}

/** Only the current page's matching study loads, just before it comes into view. */
function PageStudy({ id, paused }: { id: string; paused: boolean }) {
  const ref = useRef<HTMLDivElement>(null)
  const [mounted, setMounted] = useState(false)
  useEffect(() => {
    const observer = new IntersectionObserver(([entry]) => {
      if (entry.isIntersecting) { setMounted(true); observer.disconnect() }
    }, { rootMargin: '240px' })
    if (ref.current) observer.observe(ref.current)
    return () => observer.disconnect()
  }, [])
  return <div ref={ref} className="sp-study" data-study={id} data-paused={paused}>
    {mounted && <Suspense fallback={<div className="sp-study__loading" />}>
      {id === 'advisors' ? <NetworkFlow paused={paused} className="sp-study__canvas" /> : <GraphAlgo algo={ALGO[id]} paused={paused} className="sp-study__canvas" />}
    </Suspense>}
  </div>
}

export default function SubPage({ id }: { id: string }) {
  const [paused, setPaused] = useState(false)
  const def = pages[id]
  const sceneId = id as PageSceneId
  const index = PAGE_ORDER.indexOf(sceneId)
  const root = useRef<HTMLDivElement>(null)
  usePageEntrances(root, id)
  useEffect(() => {
    if (!def || !root.current) return
    const html = document.documentElement
    const previous = { background: html.style.background, colorScheme: html.style.colorScheme, title: document.title }
    const style = getComputedStyle(root.current)
    html.style.background = style.backgroundColor
    html.style.colorScheme = style.colorScheme
    document.title = `${def.title} — ${site.name}`
    return () => { html.style.background = previous.background; html.style.colorScheme = previous.colorScheme; document.title = previous.title }
  }, [def])
  if (!def || !PAGE_SCENES[sceneId]) return null
  const back = `/#${CHAPTER[id] ?? id}`
  // Direct deck visits use their history entry and bfcache. Cross-page journeys
  // follow the deck URL; scroll.ts consumes the existing cgs-return bookmark.
  const goBack = (event: MouseEvent<HTMLAnchorElement>) => {
    if (event.button !== 0 || event.metaKey || event.ctrlKey || event.shiftKey || event.altKey) return
    try {
      const referrer = new URL(document.referrer)
      if (referrer.origin === location.origin && referrer.pathname === '/' && history.length > 1) { event.preventDefault(); history.back() }
    } catch { /* A direct visit follows the chapter href. */ }
  }
  const title = <Title def={def} index={index} />
  const scene = <PageScene key={id} id={sceneId} paused={paused} onToggle={() => setPaused(value => !value)} />
  const sections = (numbered = false) => def.sections.map((section, i) => <ContentSection key={i} section={section} index={i} numbered={numbered} />)
  let composition
  switch (id) {
    case 'who-we-are':
      composition = <><div className="sp-editorial">{title}{scene}</div><div className="sp-principles">{sections(true)}</div></>
      break
    case 'what-we-do':
      composition = <>{title}<div className="sp-workshop">{scene}<div className="sp-workshop__notes">{sections(true)}</div></div></>
      break
    case 'ml-process':
      composition = <>{title}<div className="sp-process">{scene}<div className="sp-process__steps">{sections()}</div></div></>
      break
    case 'events':
      composition = <><div className="sp-program-cover">{title}{scene}</div><div className="sp-program">{sections(true)}</div></>
      break
    case 'world':
      composition = <>{title}<div className="sp-horizon">{scene}</div><div className="sp-world-notes">{sections()}</div></>
      break
    case 'people':
      composition = <><div className="sp-team-cover">{title}{scene}</div><div className="sp-roster">{team.map((group, gi) => <section className="sp-roster__group" key={gi} aria-labelledby={`roster-${gi}`}><div><h2 id={`roster-${gi}`} title={group.alt}>{group.label}</h2></div><ul>{group.people.map((person, pi) => <li key={pi}><p className="sp-roster__name">{person.name}</p><p className="sp-roster__major">{person.major}</p></li>)}</ul></section>)}</div><div className="sp-team-notes">{sections()}<a className="sp-action" href={pagePath('advisors')}>{pages.advisors.title}<span aria-hidden="true">↗</span></a></div></>
      break
    case 'advisors':
      composition = <><div className="sp-advisors-cover">{title}{scene}</div><section className="sp-faculty" aria-label="Faculty advisors">{advisors.map((advisor, i) => <article className="sp-advisor" key={`${advisor.name}-${i}`}><Portrait advisor={advisor} /><div><p className="sp-eyebrow">{advisor.role}</p><h2><a href={advisor.url} target="_blank" rel="noreferrer">{advisor.name}<span aria-hidden="true"> ↗</span></a></h2><p className="sp-advisor__title">{advisor.title}</p><p className="sp-body"><Copy text={advisor.bio} /></p></div></article>)}</section><PageStudy id="advisors" paused={paused} /><div className="sp-advisors-notes">{sections()}</div></>
      break
    case 'join':
      composition = <><div className="sp-invitation">{scene}{title}</div><div className="sp-join-notes">{sections(true)}</div></>
      break
    case 'contact':
      composition = <><div className="sp-contact-cover">{title}{scene}</div><div className="sp-directory">{sections(true)}</div></>
      break
  }
  const next = PAGE_ORDER[(index + 1) % PAGE_ORDER.length]
  const previous = PAGE_ORDER[(index + PAGE_ORDER.length - 1) % PAGE_ORDER.length]
  return <div ref={root} className={`subpage subpage--${id}`} data-subpage={id} data-paused={paused}>
    <a className="sp-skip" href="#page-content">Skip to content</a>
    <header className="sp-bar"><nav className="sp-bar__inner" aria-label="Page navigation">
      <a className="sp-back" href={back} onClick={goBack}><span aria-hidden="true">←</span> Back</a>
      <a className="sp-brand" href="/"><Dice size={24} paused={paused} /><span>{site.name}</span></a>
      <PageNavigator currentId={id} />
    </nav></header>
    <main id="page-content" tabIndex={-1} className="sp-main" aria-labelledby="page-title">{composition}{ALGO[id] && <PageStudy id={id} paused={paused} />}</main>
    <footer className="sp-footer"><nav className="sp-footer__routes" aria-label="Continue exploring"><a href={pagePath(previous)}><span>Previous</span>{pages[previous].title}<span aria-hidden="true">↖</span></a><a href={pagePath(next)}><span>Next</span>{pages[next].title}<span aria-hidden="true">↗</span></a></nav><div className="sp-footer__bottom"><a href={back} onClick={goBack}>Back to the main page <span aria-hidden="true">↗</span></a><p>{site.credit}</p><span>{site.domain}</span></div></footer>
  </div>
}
