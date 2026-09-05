/**
 * /admin/ — the board's editor for every word and portrait on cornellcgs.org.
 *
 * Unlinked from the site, behind a passcode the API checks (the session is
 * an HttpOnly cookie). The document edited here is exactly the set of
 * exports in src/content.ts that are words or pictures (lib/liveContent);
 * "Publish" stores it through the API and the site applies it on its next
 * load. Nothing here can change code or design.
 */
import { useCallback, useEffect, useMemo, useState } from 'react'
import type { FormEvent } from 'react'
import { api, ApiError } from './api'
import { Field, type Path } from './fields'
import { EDITABLE, TITLES, applyOverrides, snapshot, type EditableKey } from '../lib/liveContent'

type Doc = Record<EditableKey, unknown>

/** The compiled defaults — captured before any published document is applied. */
const DEFAULTS: Doc = snapshot()

const HINTS: Partial<Record<EditableKey, string>> = {
  people:
    'The poker cards on the home page — one per board seat. The front shows the photo, name and role; the back lists major, experience and skills, sized to fit. Keep lines short so the type stays readable.',
  team: 'The Our Team page: groups of name + major only, so the whole club fits on one screen.',
  pages: 'The info pages (Who We Are, What We Do, …). A heading swaps between its two lines; a *word* in asterisks turns italic.',
  typing: 'The hero types each line: the lead stays, the typed words are erased and replaced.',
  whoWeAre: 'Counters left empty show as TBA.',
  site: 'Names and the credit line. The nav, ranks and page addresses are part of the design and stay as they are.',
  advisors: 'Faculty advisors on the Advisors page.',
  memberCountries: 'Country names lit on the globe.',
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
  const [saved, setSaved] = useState('')
  const [active, setActive] = useState<EditableKey>('people')
  const [busy, setBusy] = useState(false)
  const [note, setNote] = useState<Note | null>(null)

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

  // The document = defaults + what is published
  const load = useCallback(async () => {
    try {
      const published = await api.content()
      applyOverrides(published)
    } catch {
      /* no published document yet — defaults it is */
    }
    const snap = snapshot()
    setDoc(snap)
    setSaved(JSON.stringify(snap))
  }, [])

  useEffect(() => {
    if (phase === 'open') void load()
  }, [phase, load])

  const dirty = useMemo(() => (doc ? JSON.stringify(doc) !== saved : false), [doc, saved])

  useEffect(() => {
    if (!dirty) return
    const warn = (e: BeforeUnloadEvent) => {
      e.preventDefault()
    }
    window.addEventListener('beforeunload', warn)
    return () => window.removeEventListener('beforeunload', warn)
  }, [dirty])

  const update = useCallback((path: Path, value: unknown) => {
    setDoc((d) => (d ? (setIn(d, path, value) as Doc) : d))
  }, [])

  const publish = async () => {
    if (!doc) return
    setBusy(true)
    setNote(null)
    try {
      await api.publish(doc)
      setSaved(JSON.stringify(doc))
      setNote({ kind: 'ok', text: 'Published. The site shows it on its next load.' })
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
    if (!saved) return
    setDoc(JSON.parse(saved) as Doc)
    setNote({ kind: 'info', text: 'Edits discarded.' })
  }

  const resetSection = () => {
    if (!doc) return
    setDoc({ ...doc, [active]: structuredClone(DEFAULTS[active]) })
    setNote({ kind: 'info', text: `${TITLES[active]} set back to the compiled default — publish to make it live.` })
  }

  const resetAll = async () => {
    if (!window.confirm('Reset EVERYTHING to the compiled defaults and publish that? Uploaded photos stay stored.')) return
    setBusy(true)
    try {
      await api.reset()
      const d = structuredClone(DEFAULTS)
      applyOverrides(d)
      setDoc(d)
      setSaved(JSON.stringify(d))
      setNote({ kind: 'ok', text: 'Back to the defaults.' })
    } catch (e) {
      setNote({ kind: 'err', text: `Could not reset: ${(e as ApiError).message}` })
    } finally {
      setBusy(false)
    }
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
        <div className="mx-auto flex max-w-6xl flex-wrap items-center gap-3 px-5 py-3">
          <div className="mr-auto">
            <div className="text-xs font-bold uppercase tracking-[0.12em] text-[#3e5680]">Cornell CGS</div>
            <h1 className="text-lg font-bold leading-tight">Admin</h1>
          </div>
          <span className={`text-sm ${dirty ? 'font-semibold text-[#b86e00]' : 'text-[#3e5680]'}`}>
            {dirty ? 'Unpublished changes' : 'Everything published'}
          </span>
          <button type="button" className="a-btn" onClick={discard} disabled={!dirty || busy}>
            Discard
          </button>
          <button type="button" className="a-btn a-btn-primary" onClick={publish} disabled={!dirty || busy}>
            {busy ? 'Publishing…' : 'Publish'}
          </button>
          <a className="a-btn" href="/" target="_blank" rel="noreferrer">
            Open site ↗
          </a>
          <button type="button" className="a-btn" onClick={signOut}>
            Sign out
          </button>
        </div>
        {note && (
          <div
            role="status"
            className={`a-fade-in mx-auto max-w-6xl px-5 pb-3 text-sm font-semibold ${
              note.kind === 'ok' ? 'text-[#1a7f37]' : note.kind === 'err' ? 'text-[#a32020]' : 'text-[#3e5680]'
            }`}
          >
            {note.text}
          </div>
        )}
      </header>

      <div className="mx-auto grid max-w-6xl gap-6 px-5 py-6 md:grid-cols-[14rem_1fr]">
        <nav aria-label="Sections" className="md:sticky md:top-24 md:self-start">
          <ul className="grid gap-0.5">
            {EDITABLE.map((key) => (
              <li key={key}>
                <button type="button" className="a-nav-item" aria-current={active === key ? 'true' : undefined} onClick={() => setActive(key)}>
                  <span>{TITLES[key]}</span>
                  {doc && JSON.stringify(doc[key]) !== JSON.stringify(DEFAULTS[key]) && (
                    <span className="text-[10px] opacity-70" title="differs from the compiled default">
                      ●
                    </span>
                  )}
                </button>
              </li>
            ))}
          </ul>
          <button type="button" className="a-btn a-btn-danger mt-4 w-full justify-center text-sm" onClick={resetAll} disabled={busy}>
            Reset all to defaults
          </button>
        </nav>

        <main className="min-w-0">
          {doc ? (
            <section key={active} className="a-fade-in">
              <div className="mb-4 flex flex-wrap items-start justify-between gap-3">
                <div>
                  <h2 className="text-2xl font-bold leading-tight">{TITLES[active]}</h2>
                  {HINTS[active] && <p className="mt-1 max-w-2xl text-sm text-[#3e5680]">{HINTS[active]}</p>}
                </div>
                <button type="button" className="a-btn text-sm" onClick={resetSection}>
                  Reset this section
                </button>
              </div>
              <Field path={[active]} value={doc[active]} onChange={update} label={TITLES[active]} bare />
            </section>
          ) : (
            <p className="text-sm text-[#3e5680]">Loading the published content…</p>
          )}
        </main>
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
          inputMode="numeric"
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
        {apiNote && <p className="mt-3 text-sm text-[#3e5680]">{apiNote}</p>}
        <button type="submit" className="a-btn a-btn-primary mt-5 w-full justify-center" disabled={busy || !code}>
          {busy ? 'Checking…' : 'Enter'}
        </button>
      </form>
    </main>
  )
}
