/**
 * /admin/ — the board's editor for every word and portrait on cornellcgs.org.
 *
 * Unlinked from the site, behind a passcode the API checks (the session is
 * an HttpOnly cookie). The document edited here is exactly the set of
 * exports in src/content.ts that are words or pictures (lib/liveContent);
 * "Publish" stores it through the API and the site applies it on its next
 * load; "Preview" shows the site with the unpublished edits first. Nothing
 * here can change code or design.
 */
import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import type { FormEvent } from 'react'
import { api, ApiError } from './api'
import { Field, type Path } from './fields'
import {
  DRAFT_URL,
  DRAFT_WINDOW_NAME,
  EDITABLE,
  TITLES,
  answerDraftRequests,
  applyOverrides,
  snapshot,
  type EditableKey,
} from '../lib/liveContent'

type Doc = Record<EditableKey, unknown>

/** The compiled defaults — captured before any published document is applied. */
const DEFAULTS: Doc = snapshot()

/** where unpublished edits wait in this browser */
const DRAFT_KEY = 'cgs-admin-draft'

const same = (a: unknown, b: unknown) => JSON.stringify(a) === JSON.stringify(b)

const HINTS: Partial<Record<EditableKey, string>> = {
  people:
    'The poker cards on the home page, one per board seat (the row is designed for four). The front shows the photo, name and role; the back lists major, experience and skills, sized to fit — keep lines short. A new member also belongs in the Our Team roster.',
  team: 'The Our Team page: groups of name + major only. Board members here should match their cards.',
  events: 'The fan of event cards on the home page (designed for five). Dates are plain words.',
  pages: 'The info pages (Who We Are, What We Do, …). Each heading swaps between its two lines. The name shown in the browser tab is fixed.',
  join: 'The Join chapter on the home page. The Join info page is under Info pages.',
  vision: 'The eye chapter at the very end: its title and the three lines.',
  advisors: 'Faculty advisors on the Advisors page.',
  typing: 'The hero types each line: the lead stays, the typed words are erased and replaced.',
  whoWeAre: 'The two hole cards and the four counters (an empty counter shows TBA).',
  whatWeDo: 'The board of five cards.',
  mlProcess: 'The five steps that appear after the black hole.',
  world: 'The globe chapter: heading and line.',
  contact: 'The email shown in the footer.',
  hero: 'The two buttons under the title. They always scroll to Join and What we do.',
  site: 'The credit line at the very end of every page.',
}

function setIn(obj: unknown, path: Path, value: unknown): unknown {
  if (path.length === 0) return value
  const [head, ...rest] = path
  if (Array.isArray(obj)) {
    const copy = obj.slice()
    copy[head as number] = setIn(obj[head as number], rest, value)
    return copy
  }
  const o = (obj ?? {}) as Record<string, unknown>
  return { ...o, [head as string]: setIn(o[head as string], rest, value) }
}

type Phase = 'checking' | 'locked' | 'open'
type Note = { kind: 'ok' | 'err' | 'info'; text: string }

export default function AdminApp() {
  const [phase, setPhase] = useState<Phase>('checking')
  const [apiNote, setApiNote] = useState<string | null>(null)
  const [doc, setDoc] = useState<Doc | null>(null)
  const [saved, setSaved] = useState<Doc | null>(null)
  const [active, setActive] = useState<EditableKey>('people')
  const [busy, setBusy] = useState(false)
  const [note, setNote] = useState<Note | null>(null)
  const [previewing, setPreviewing] = useState(false)
  /** the version of the published document this page loaded — sent back on Publish */
  const [etag, setEtag] = useState('')

  // Is there a session already?
  useEffect(() => {
    api
      .session()
      .then(() => setPhase('open'))
      .catch((e: ApiError) => {
        if (e.status !== 401) setApiNote(e.message)
        setPhase('locked')
      })
  }, [])

  // The document = defaults + what is published. Loaded once: signing in
  // again after the session ended must not throw away unpublished edits.
  const load = useCallback(async () => {
    // start from the compiled defaults every time, so nothing stale survives
    applyOverrides(structuredClone(DEFAULTS))
    try {
      const { doc: published, etag: tag } = await api.content()
      applyOverrides(published)
      setEtag(tag)
    } catch {
      /* no published document yet — defaults it is */
    }
    const snap = snapshot()
    setSaved(snap)
    // Edits left unpublished last time (a phone tab put to sleep, a closed
    // laptop) come back, unless what is published has moved on since.
    let restored: Doc | null = null
    try {
      const raw = localStorage.getItem(DRAFT_KEY)
      const kept = raw ? (JSON.parse(raw) as { base: string; doc: Doc }) : null
      if (kept && kept.base === JSON.stringify(snap) && !same(kept.doc, snap)) restored = kept.doc
    } catch {
      /* storage unavailable */
    }
    setDoc(restored ?? snap)
    if (restored) setNote({ kind: 'info', text: 'Your unpublished edits from last time are back. Publish them, or Discard.' })
  }, [])

  useEffect(() => {
    if (phase === 'open' && doc === null) void load()
  }, [phase, doc, load])

  const dirty = useMemo(() => (doc && saved ? !same(doc, saved) : false), [doc, saved])
  const changed = useMemo(() => {
    const set = new Set<EditableKey>()
    if (doc && saved) for (const k of EDITABLE) if (!same(doc[k], saved[k])) set.add(k)
    return set
  }, [doc, saved])

  useEffect(() => {
    if (!dirty) return
    const warn = (e: BeforeUnloadEvent) => {
      e.preventDefault()
    }
    window.addEventListener('beforeunload', warn)
    return () => window.removeEventListener('beforeunload', warn)
  }, [dirty])

  // Mirror unpublished edits to this browser, keyed to the published version
  // they were made on top of; cleared as soon as everything is published.
  useEffect(() => {
    try {
      if (dirty && doc && saved) localStorage.setItem(DRAFT_KEY, JSON.stringify({ base: JSON.stringify(saved), doc }))
      else localStorage.removeItem(DRAFT_KEY)
    } catch {
      /* storage unavailable */
    }
  }, [doc, saved, dirty])

  // A picture dropped anywhere but on a photo box must not navigate the tab away
  useEffect(() => {
    const swallow = (e: Event) => e.preventDefault()
    window.addEventListener('dragover', swallow)
    window.addEventListener('drop', swallow)
    return () => {
      window.removeEventListener('dragover', swallow)
      window.removeEventListener('drop', swallow)
    }
  }, [])

  const update = useCallback((path: Path, value: unknown) => {
    setDoc((d) => (d ? (setIn(d, path, value) as Doc) : d))
  }, [])

  const docRef = useRef<Doc | null>(null)
  docRef.current = doc

  const publish = async () => {
    if (!doc) return
    setBusy(true)
    setNote(null)
    try {
      // Only the sections that differ from the built-in words are published;
      // an untouched section keeps following the code, and "Use the built-in
      // words" simply takes a section out of the document again.
      const diff = Object.fromEntries(EDITABLE.filter((k) => !same(doc[k], DEFAULTS[k])).map((k) => [k, doc[k]]))
      const { etag: tag } = await api.publish(diff, etag)
      setEtag(tag)
      setSaved(doc)
      setNote({ kind: 'ok', text: 'Published ✓ The site shows it on its next load — a tab that is already open keeps the old words until it reloads.' })
    } catch (e) {
      const err = e as ApiError
      if (err.status === 401) {
        setPhase('locked')
        setNote({ kind: 'err', text: 'Your session ended. Sign in again — your edits are still here.' })
      } else {
        setNote({ kind: 'err', text: `Could not publish: ${err.message}` })
      }
    } finally {
      setBusy(false)
    }
  }

  const discard = () => {
    if (!saved || !dirty) return
    if (!window.confirm('Throw away every unpublished edit and go back to what is published?')) return
    setDoc(saved)
    setNote({ kind: 'info', text: 'Edits discarded.' })
  }

  const resetSection = () => {
    if (!doc) return
    if (!window.confirm(`Put "${TITLES[active]}" back to the built-in words? Nothing changes on the site until you Publish.`)) return
    setDoc({ ...doc, [active]: structuredClone(DEFAULTS[active]) })
    setNote({ kind: 'info', text: `${TITLES[active]} is back to the built-in words. Publish to make that live.` })
  }

  const resetAll = () => {
    if (!doc) return
    if (!window.confirm('Put EVERY section back to the built-in words? Nothing changes on the site until you Publish.')) return
    setDoc(structuredClone(DEFAULTS))
    setNote({ kind: 'info', text: 'Everything is back to the built-in words. Publish to make that live, or Discard to undo.' })
  }

  const signOut = async () => {
    await api.logout().catch(() => undefined)
    setPhase('locked')
  }

  if (phase === 'checking') {
    return <main className="grid min-h-screen place-items-center text-sm text-[#3e5680]">Checking your session…</main>
  }
  if (phase === 'locked') {
    return (
      <Gate
        apiNote={apiNote}
        note={note}
        onOpen={() => {
          setNote(null)
          setPhase('open')
        }}
      />
    )
  }

  return (
    <div className="min-h-screen">
      <header className="sticky top-0 z-10 border-b border-[#d8e2f3] bg-[#eef3fb]/90 backdrop-blur">
        <div className="mx-auto flex max-w-6xl flex-wrap items-center gap-2 px-4 py-3 sm:gap-3 sm:px-5">
          <div className="mr-auto hidden sm:block">
            <div className="text-xs font-bold uppercase tracking-[0.12em] text-[#3e5680]">Cornell CGS</div>
            <h1 className="text-lg font-bold leading-tight">Admin</h1>
          </div>
          <h1 className="sr-only sm:hidden">Cornell CGS Admin</h1>
          <span className={`mr-auto text-sm sm:mr-0 ${dirty ? 'font-semibold text-[#b86e00]' : 'text-[#3e5680]'}`}>
            <span className="sm:hidden">{dirty ? 'Unsaved' : 'Published'}</span>
            <span className="hidden sm:inline">{dirty ? 'Unpublished changes' : 'Everything published'}</span>
          </span>
          <button type="button" className="a-btn" onClick={discard} disabled={!dirty || busy}>
            Discard
          </button>
          <button type="button" className="a-btn" onClick={() => setPreviewing(true)} disabled={!doc} title="See the site with your unpublished edits">
            Preview
          </button>
          <button type="button" className="a-btn a-btn-primary" onClick={publish} disabled={!dirty || busy}>
            {busy ? 'Publishing…' : 'Publish'}
          </button>
          <a className="a-btn hidden sm:inline-flex" href="/" target="_blank" rel="noreferrer" title="The live site as everyone sees it">
            Live site ↗
          </a>
          <button type="button" className="a-btn hidden sm:inline-flex" onClick={signOut}>
            Sign out
          </button>
        </div>
        {note && (
          <div
            role="status"
            className={`a-fade-in mx-auto max-w-6xl px-4 pb-3 text-sm font-semibold sm:px-5 ${
              note.kind === 'ok' ? 'text-[#1a7f37]' : note.kind === 'err' ? 'text-[#a32020]' : 'text-[#3e5680]'
            }`}
          >
            {note.text}
          </div>
        )}
      </header>

      <div className="mx-auto grid max-w-6xl gap-6 px-4 py-6 sm:px-5 md:grid-cols-[14rem_1fr]">
        {/* Sections: a dropdown on small screens, a list beside the form on wide ones */}
        <nav aria-label="Sections" className="md:sticky md:top-24 md:self-start">
          {/* wrapped: .a-label's own display rule would outrank the hidden utility */}
          <div className="md:hidden">
            <label htmlFor="section" className="a-label">
              Section
            </label>
            <select id="section" className="a-input" value={active} onChange={(e) => setActive(e.target.value as EditableKey)}>
              {EDITABLE.map((key) => (
                <option key={key} value={key}>
                  {TITLES[key]}
                  {changed.has(key) ? ' ●' : ''}
                </option>
              ))}
            </select>
          </div>
          <ul className="hidden gap-0.5 md:grid">
            {EDITABLE.map((key) => (
              <li key={key}>
                <button type="button" className="a-nav-item" aria-current={active === key ? 'true' : undefined} onClick={() => setActive(key)}>
                  <span>{TITLES[key]}</span>
                  {changed.has(key) && (
                    <span className="text-[10px] text-[#b86e00]" title="has unpublished edits" aria-label="has unpublished edits">
                      ●
                    </span>
                  )}
                </button>
              </li>
            ))}
          </ul>
        </nav>

        <main className="min-w-0">
          <ol className="mb-5 flex flex-wrap gap-x-5 gap-y-1 text-sm text-[#3e5680]" aria-label="How it works">
            {['Pick a section', 'Change the words or add a photo', 'Preview to see it on the site', 'Publish when it looks right'].map(
              (step, i) => (
                <li key={step} className="flex items-center gap-2">
                  <span className="grid h-5 w-5 place-items-center rounded-full bg-[#0a1e3f] text-[11px] font-bold text-white">{i + 1}</span>
                  {step}
                </li>
              ),
            )}
          </ol>
          {doc ? (
            <section key={active} className="a-fade-in">
              <div className="mb-4 flex flex-wrap items-start justify-between gap-3">
                <div>
                  <h2 className="text-2xl font-bold leading-tight">{TITLES[active]}</h2>
                  {HINTS[active] && <p className="mt-1 max-w-2xl text-sm text-[#3e5680]">{HINTS[active]}</p>}
                </div>
                <button type="button" className="a-btn text-sm" onClick={resetSection} title="Back to the words built into the site">
                  Use the built-in words
                </button>
              </div>
              <Field path={[active]} value={doc[active]} onChange={update} label={TITLES[active]} bare />
            </section>
          ) : (
            <p className="text-sm text-[#3e5680]">Loading the published content…</p>
          )}

          {doc && (
            <details className="mt-12 text-sm text-[#3e5680]">
              <summary className="cursor-pointer font-semibold">More</summary>
              <div className="mt-3 flex flex-wrap items-center gap-3 sm:hidden">
                <a className="a-btn" href="/" target="_blank" rel="noreferrer">
                  Live site ↗
                </a>
                <button type="button" className="a-btn" onClick={signOut}>
                  Sign out
                </button>
              </div>
              <div className="mt-3 flex flex-wrap items-center gap-3">
                <button type="button" className="a-btn a-btn-danger" onClick={resetAll} disabled={busy}>
                  Put every section back to the built-in words
                </button>
                <span>Nothing changes on the site until you Publish; Discard undoes it.</span>
              </div>
            </details>
          )}
        </main>
      </div>

      {previewing && (
        <Preview
          getDoc={() => docRef.current}
          dirty={dirty}
          busy={busy}
          onPublish={publish}
          onClose={() => setPreviewing(false)}
        />
      )}
    </div>
  )
}

/* ----------------------------------------------------------------- preview */

function Preview({
  getDoc,
  dirty,
  busy,
  onPublish,
  onClose,
}: {
  getDoc: () => unknown
  dirty: boolean
  busy: boolean
  onPublish: () => void
  onClose: () => void
}) {
  const [loaded, setLoaded] = useState(false)

  useEffect(() => answerDraftRequests(getDoc), [getDoc])

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose()
    }
    window.addEventListener('keydown', onKey)
    const prev = document.body.style.overflow
    document.body.style.overflow = 'hidden'
    return () => {
      window.removeEventListener('keydown', onKey)
      document.body.style.overflow = prev
    }
  }, [onClose])

  return (
    <div role="dialog" aria-label="Preview of the site with your edits" className="a-fade-in fixed inset-0 z-50 flex flex-col bg-[#0a1e3f]">
      <div className="flex flex-wrap items-center gap-3 px-4 py-2.5 text-sm text-white">
        <span className="font-bold">Preview</span>
        <span className="opacity-80">
          <span className="sm:hidden">{dirty ? 'Your edits · not published yet' : 'All published'}</span>
          <span className="hidden sm:inline">
            This is the site with your edits. {dirty ? 'Nothing is published yet.' : 'Everything shown is published.'}
          </span>
        </span>
        <div className="ml-auto flex items-center gap-2">
          {dirty && (
            <button type="button" className="a-btn" onClick={onPublish} disabled={busy}>
              {busy ? 'Publishing…' : 'Publish'}
            </button>
          )}
          <button type="button" className="a-btn !border-white/50 !bg-transparent !text-white hover:!bg-white/10" onClick={onClose}>
            Back to editing
          </button>
        </div>
      </div>
      <div className="relative min-h-0 flex-1 bg-black">
        {!loaded && (
          <div className="absolute inset-0 grid place-items-center text-sm text-white/70">Loading the site…</div>
        )}
        <iframe
          title="The site with your edits"
          name={DRAFT_WINDOW_NAME}
          src={DRAFT_URL}
          className="h-full w-full border-0"
          onLoad={() => setLoaded(true)}
        />
      </div>
    </div>
  )
}

/* -------------------------------------------------------------------- gate */

function Gate({ apiNote, note, onOpen }: { apiNote: string | null; note: Note | null; onOpen: () => void }) {
  const [code, setCode] = useState('')
  const [error, setError] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)

  const submit = async (e: FormEvent) => {
    e.preventDefault()
    if (!code) return
    setBusy(true)
    setError(null)
    try {
      await api.login(code)
      setCode('')
      onOpen()
    } catch (err) {
      setError((err as ApiError).message)
    } finally {
      setBusy(false)
    }
  }

  return (
    <main className="grid min-h-screen place-items-center p-6">
      <form onSubmit={submit} className="a-card a-fade-in w-full max-w-sm p-7">
        <div className="text-xs font-bold uppercase tracking-[0.12em] text-[#3e5680]">Cornell CGS</div>
        <h1 className="mt-1 text-2xl font-bold leading-tight">Admin</h1>
        <p className="mt-2 text-sm text-[#3e5680]">Edit the words and photos on cornellcgs.org.</p>
        <label htmlFor="passcode" className="a-label mt-6">
          Passcode
        </label>
        <input
          id="passcode"
          className="a-input a-mono text-lg tracking-[0.3em]"
          type="password"
          autoComplete="current-password"
          autoFocus
          value={code}
          onChange={(e) => setCode(e.target.value)}
        />
        {(error || note) && (
          <p role="alert" className="mt-3 text-sm font-semibold text-[#a32020]">
            {error ?? note?.text}
          </p>
        )}
        {apiNote && apiNote !== error && <p className="mt-3 text-sm text-[#3e5680]">{apiNote}</p>}
        <button type="submit" className="a-btn a-btn-primary mt-5 w-full justify-center" disabled={busy || !code}>
          {busy ? 'Checking…' : 'Enter'}
        </button>
      </form>
    </main>
  )
}
