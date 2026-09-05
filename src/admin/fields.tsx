/**
 * A generic editor for the content document: every string, number, list and
 * object in `src/content.ts` becomes a field by its shape, so a new piece of
 * copy needs no new admin code. Photo fields (a `photo` key, or a value that
 * points at a picture) take a dropped or chosen file, crop it square and
 * upload it. Everything here is written for a board member who has never
 * seen the code.
 */
import { useEffect, useId, useRef, useState } from 'react'
import type { ChangeEvent, DragEvent, ReactNode } from 'react'
import { api, ApiError } from './api'
import { EMPHASIS_HEADINGS, isHiddenPath } from '../lib/liveContent'
import { anchorLabels, hashedName, loadBitmap, shapeOf, squareCrop, type Anchor, type Shape } from './image'

export type Path = Array<string | number>
export type Update = (path: Path, value: unknown) => void

/* ------------------------------------------------------------------ labels */

const LABELS: Record<string, string> = {
  href: 'Link (web address)',
  url: 'Website (web address)',
  cta: 'Button',
  ctaPrimary: 'Main button',
  ctaSecondary: 'Second button',
  alt: 'Second heading (the heading swaps between the two)',
  tail: 'Typed words',
  blurb: 'Blurb',
  n: 'Step number (01, 02 …)',
  bio: 'Bio',
  photo: 'Photo',
  scrollHint: 'Scroll hint',
  credit: 'Credit line (the last line of every page)',
  major: 'Major',
  role: 'Role',
  next: 'What comes next (one line each)',
  pairs: 'Typed lines',
  threads: 'Cards (the board is designed for five)',
  steps: 'Steps (designed for five)',
  items: 'Events (the fan is designed for five)',
  leaders: 'Cards (one per board seat, designed for four)',
  people: 'People',
  counters: 'Counters (designed for four; empty = TBA)',
  paragraphs: 'Paragraphs',
  sections: 'Sections',
  link: 'Button under the text',
  experience: 'Experience (one line each)',
  skills: 'Skills (one each)',
  heading: 'Heading',
  address: 'Email address',
  email: 'Email address',
  rank: 'Card corner (A, K, Q, J, 10)',
  suit: 'Suit symbol',
  date: 'Date (any words, e.g. Oct 12)',
  value: 'Number',
  label: 'Label',
  title: 'Title',
  text: 'Text',
  body: 'Text',
  noSeparator: 'Show the number without a thousands separator',
}

/** The info pages, named as the site names them */
const PAGE_NAMES: Record<string, string> = {
  'who-we-are': 'Who We Are',
  'what-we-do': 'What We Do',
  'ml-process': 'Our ML Process',
  events: 'Events',
  world: 'World',
  people: 'Our Team',
  advisors: 'Advisors',
  join: 'Join CGS',
  contact: 'Contact Us',
}

export function humanize(key: string): string {
  return key
    .replace(/([a-z])([A-Z])/g, '$1 $2')
    .replace(/[-_]/g, ' ')
    .replace(/^./, (c) => c.toUpperCase())
}

/** The label for a field, from where it sits, not only from its key. */
export function labelFor(path: Path, value?: unknown): string {
  const key = path[path.length - 1]
  if (key === undefined) return ''
  if (typeof key === 'number') return `#${key + 1}`
  if (path[0] === 'pages' && path.length === 2) {
    const t = value && typeof value === 'object' ? (value as { title?: unknown }).title : undefined
    return PAGE_NAMES[key] ?? (typeof t === 'string' && t ? t : humanize(key))
  }
  if (key === 'lead') return path[0] === 'typing' ? 'Lead (the words that stay)' : 'Intro line'
  if (key === 'title' && path[0] === 'pages') return 'Page title (the big heading)'
  if (key === 'heading' && path.length === 2 && EMPHASIS_HEADINGS.has(String(path[0]))) {
    return 'Heading (*asterisks* make a word italic)'
  }
  return LABELS[key] ?? humanize(key)
}

/* ------------------------------------------------------------------ shapes */

const PHOTO_KEYS = new Set(['photo', 'image', 'avatar', 'portrait'])
const isPhoto = (path: Path, v: unknown) =>
  typeof v === 'string' &&
  (PHOTO_KEYS.has(String(path[path.length - 1])) || /^\/(assets|api\/image)\/.*\.(jpe?g|png|webp)$/i.test(v))

const LONG_KEYS = new Set(['body', 'text', 'bio', 'lead', 'blurb', 'paragraphs', 'next'])
const isLong = (path: Path, v: string) =>
  v.includes('\n') ||
  v.length > 90 ||
  LONG_KEYS.has(String(path[path.length - 1])) ||
  (typeof path[path.length - 1] === 'number' && LONG_KEYS.has(String(path[path.length - 2])))

/** What a new list item looks like, by the list's key */
const TEMPLATES: Record<string, Record<string, unknown>> = {
  leaders: { name: '', role: '', major: '', photo: '', experience: [], skills: [] },
  people: { name: '', major: '' },
  team: { label: '', alt: '', people: [] },
  items: { title: '', date: 'Date TBA', blurb: '' },
  threads: { rank: '', suit: '♠', title: '', text: '' },
  steps: { n: '', title: '', text: '' },
  sections: { heading: '', alt: '', body: '' },
  pairs: { lead: '', tail: '' },
  counters: { label: '', value: null },
  advisors: { name: '', role: '', title: '', bio: '', photo: '', url: '' },
}

function emptyLike(v: unknown): unknown {
  if (Array.isArray(v)) return []
  if (typeof v === 'string') return ''
  if (typeof v === 'number' || v === null) return null
  if (typeof v === 'boolean') return false
  if (v && typeof v === 'object') {
    return Object.fromEntries(Object.entries(v).map(([k, x]) => [k, emptyLike(x)]))
  }
  return ''
}

function newItem(path: Path, items: unknown[]): unknown {
  const key = String(path[path.length - 1])
  if (key in TEMPLATES) return structuredClone(TEMPLATES[key])
  if (items.length) return emptyLike(items[0])
  return ''
}

/** An object item shown with every field its siblings have — an empty seat still gets a photo box */
function completed(path: Path, item: Record<string, unknown>): Record<string, unknown> {
  const key = String(path[path.length - 1])
  const template = TEMPLATES[key]
  return template ? { ...structuredClone(template), ...item } : item
}

/** The line that names a list item in its card header */
function itemTitle(v: unknown, i: number): string {
  if (typeof v === 'string') return v || `#${i + 1}`
  if (v && typeof v === 'object') {
    const o = v as Record<string, unknown>
    for (const k of ['name', 'title', 'heading', 'label', 'lead']) {
      if (typeof o[k] === 'string' && o[k]) return o[k] as string
    }
  }
  return `#${i + 1}`
}

const spansRow = (path: Path, v: unknown) =>
  !(typeof v === 'string' && !isPhoto(path, v) && !isLong(path, v)) &&
  !(typeof v === 'number' || v === null || typeof v === 'boolean')

let nextKey = 1
const freshKey = () => `k${nextKey++}`

/* ------------------------------------------------------------------ fields */

export function Field({
  path,
  value,
  onChange,
  label,
  bare,
}: {
  path: Path
  value: unknown
  onChange: Update
  label?: string
  /** objects: no header of their own (the page already shows one) */
  bare?: boolean
}) {
  if (isHiddenPath(path)) return null
  const name = label ?? labelFor(path, value)
  if (isPhoto(path, value)) return <PhotoField path={path} value={value as string} onChange={onChange} label={name} />
  if (typeof value === 'string') return <TextField path={path} value={value} onChange={onChange} label={name} />
  if (typeof value === 'number' || value === null) {
    return <NumberField path={path} value={value} onChange={onChange} label={name} />
  }
  if (typeof value === 'boolean') return <BoolField path={path} value={value} onChange={onChange} label={name} />
  if (Array.isArray(value)) return <ListField path={path} value={value} onChange={onChange} label={name} />
  if (value && typeof value === 'object') {
    return <ObjectField path={path} value={value as Record<string, unknown>} onChange={onChange} label={name} bare={bare} />
  }
  return null
}

function Labeled({ id, label, children }: { id: string; label: string; children: ReactNode }) {
  return (
    <div>
      <label htmlFor={id} className="a-label">
        {label}
      </label>
      {children}
    </div>
  )
}

function TextField({ path, value, onChange, label }: { path: Path; value: string; onChange: Update; label: string }) {
  const id = useId()
  // decided once, so the box never changes shape under a moving caret
  const [long] = useState(() => isLong(path, value))
  return (
    <Labeled id={id} label={label}>
      {long ? (
        <textarea
          id={id}
          className="a-input"
          rows={Math.min(8, Math.max(2, Math.ceil(value.length / 80) + (value.match(/\n/g)?.length ?? 0)))}
          value={value}
          onChange={(e) => onChange(path, e.target.value)}
        />
      ) : (
        <input id={id} className="a-input" type="text" value={value} onChange={(e) => onChange(path, e.target.value)} />
      )}
    </Labeled>
  )
}

function NumberField({ path, value, onChange, label }: { path: Path; value: number | null; onChange: Update; label: string }) {
  const id = useId()
  return (
    <Labeled id={id} label={label}>
      <div className="flex items-center gap-3">
        <input
          id={id}
          className="a-input"
          type="number"
          placeholder="TBA"
          value={value ?? ''}
          onChange={(e) => onChange(path, e.target.value === '' ? null : Number(e.target.value))}
        />
        <label className="flex shrink-0 items-center gap-1.5 text-sm text-[#3e5680]">
          <input type="checkbox" checked={value === null} onChange={(e) => onChange(path, e.target.checked ? null : 0)} />
          TBA
        </label>
      </div>
    </Labeled>
  )
}

function BoolField({ path, value, onChange, label }: { path: Path; value: boolean; onChange: Update; label: string }) {
  const id = useId()
  return (
    <label htmlFor={id} className="flex items-center gap-2 pt-6 text-sm font-semibold text-[#3e5680]">
      <input id={id} type="checkbox" checked={value} onChange={(e) => onChange(path, e.target.checked)} />
      {label}
    </label>
  )
}

function ObjectField({
  path,
  value,
  onChange,
  label,
  bare,
}: {
  path: Path
  value: Record<string, unknown>
  onChange: Update
  label: string
  bare?: boolean
}) {
  const entries = Object.entries(value).filter(([k]) => !isHiddenPath([...path, k]))
  const body = (
    <div className="grid gap-4 sm:grid-cols-2">
      {entries.map(([k, v]) => (
        <div key={k} className={spansRow([...path, k], v) ? 'sm:col-span-2' : ''}>
          <Field path={[...path, k]} value={v} onChange={onChange} />
        </div>
      ))}
    </div>
  )
  if (bare) return body
  return (
    <fieldset className="a-card p-4">
      <legend className="a-label px-1">{label}</legend>
      {body}
    </fieldset>
  )
}

function ListField({ path, value, onChange, label }: { path: Path; value: unknown[]; onChange: Update; label: string }) {
  const strings = value.every((v) => typeof v === 'string')
  const objects = value.every((v) => v && typeof v === 'object' && !Array.isArray(v))

  // Stable keys per item, kept in step with the list — so a card's own state
  // (a half-cropped photo) travels with the card when the list is reordered
  const [keys, setKeys] = useState<string[]>(() => value.map(freshKey))
  if (keys.length !== value.length) setKeys(value.map((_, i) => keys[i] ?? freshKey()))

  const lastRef = useRef<HTMLDivElement>(null)
  const scrollToLast = useRef(false)
  useEffect(() => {
    if (!scrollToLast.current) return
    scrollToLast.current = false
    const el = lastRef.current
    if (!el) return
    el.scrollIntoView({ block: 'center', behavior: 'smooth' })
    el.querySelector<HTMLElement>('input, textarea')?.focus({ preventScroll: true })
  })

  const move = (i: number, d: number) => {
    const j = i + d
    if (j < 0 || j >= value.length) return
    const copy = value.slice()
    ;[copy[i], copy[j]] = [copy[j], copy[i]]
    const k = keys.slice()
    ;[k[i], k[j]] = [k[j], k[i]]
    setKeys(k)
    onChange(path, copy)
  }
  const remove = (i: number) => {
    if (objects && !window.confirm(`Remove "${itemTitle(value[i], i)}"? You can still press Discard to undo everything unpublished.`)) return
    setKeys(keys.filter((_, k) => k !== i))
    onChange(path, value.filter((_, k) => k !== i))
  }
  const add = () => {
    setKeys([...keys, freshKey()])
    scrollToLast.current = true
    onChange(path, [...value, newItem(path, value)])
  }

  const controls = (i: number) => (
    <div className="flex shrink-0 items-center gap-1">
      <button type="button" className="a-btn a-btn-icon" title="Move up" aria-label="Move up" onClick={() => move(i, -1)} disabled={i === 0}>
        ↑
      </button>
      <button
        type="button"
        className="a-btn a-btn-icon"
        title="Move down"
        aria-label="Move down"
        onClick={() => move(i, 1)}
        disabled={i === value.length - 1}
      >
        ↓
      </button>
      <button type="button" className="a-btn a-btn-icon a-btn-danger ml-2" title="Remove" aria-label="Remove" onClick={() => remove(i)}>
        ✕
      </button>
    </div>
  )
  const addButton = (
    <button type="button" className="a-btn" onClick={add}>
      + Add
    </button>
  )

  return (
    <div>
      <div className="mb-2 flex items-center justify-between gap-3">
        <span className="a-label !mb-0">
          {label} <span className="font-normal opacity-60">· {value.length}</span>
        </span>
        {addButton}
      </div>
      {value.length === 0 && <p className="text-sm text-[#3e5680]">Nothing here yet — press + Add.</p>}
      {strings ? (
        <div className="grid gap-2">
          {(value as string[]).map((v, i) => (
            <div key={keys[i]} ref={i === value.length - 1 ? lastRef : undefined} className="flex items-start gap-2">
              {isLong([...path, i], v) ? (
                <textarea
                  className="a-input"
                  rows={2}
                  value={v}
                  aria-label={`${label} ${i + 1}`}
                  onChange={(e) => onChange([...path, i], e.target.value)}
                />
              ) : (
                <input
                  className="a-input"
                  type="text"
                  value={v}
                  aria-label={`${label} ${i + 1}`}
                  onChange={(e) => onChange([...path, i], e.target.value)}
                />
              )}
              {controls(i)}
            </div>
          ))}
        </div>
      ) : (
        <div className="grid gap-3">
          {value.map((v, i) => (
            <div key={keys[i]} ref={i === value.length - 1 ? lastRef : undefined} className="a-card p-4">
              <div className="mb-3 flex items-center justify-between gap-3">
                <span className="truncate font-semibold">{itemTitle(v, i)}</span>
                {controls(i)}
              </div>
              {v && typeof v === 'object' && !Array.isArray(v) ? (
                <ObjectField
                  path={[...path, i]}
                  value={completed(path, v as Record<string, unknown>)}
                  onChange={onChange}
                  label=""
                  bare
                />
              ) : (
                <Field path={[...path, i]} value={v} onChange={onChange} />
              )}
            </div>
          ))}
        </div>
      )}
      {value.length > 2 && <div className="mt-3 flex justify-end">{addButton}</div>}
    </div>
  )
}

/* ------------------------------------------------------------------- photo */

function PhotoField({ path, value, onChange, label }: { path: Path; value: string; onChange: Update; label: string }) {
  const id = useId()
  const input = useRef<HTMLInputElement>(null)
  const bitmap = useRef<ImageBitmap | null>(null)
  /** the url this field itself uploaded — anything else came from outside */
  const uploaded = useRef<string | null>(null)
  const [over, setOver] = useState(false)
  const [busy, setBusy] = useState<string | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [source, setSource] = useState<{ base: string; shape: Shape; anchor: Anchor } | null>(null)
  const [saved, setSaved] = useState(false)
  const [touch] = useState(() => typeof window !== 'undefined' && window.matchMedia('(pointer: coarse)').matches)

  // A photo set from outside (Discard, Reset, a card moved here) is not ours
  // to re-crop: drop the source and the anchor buttons.
  useEffect(() => {
    if (value === uploaded.current) return
    setSource(null)
    setSaved(false)
    bitmap.current?.close()
    bitmap.current = null
  }, [value])
  useEffect(() => () => bitmap.current?.close(), [])

  const cropAndUpload = async (base: string, anchor: Anchor) => {
    const bmp = bitmap.current
    if (!bmp) return
    setError(null)
    setBusy('Cropping…')
    try {
      const blob = await squareCrop(bmp, anchor)
      const name = await hashedName(base, blob)
      setBusy('Saving…')
      const { url } = await api.upload(name, blob)
      uploaded.current = url
      onChange(path, url)
      setSaved(true)
    } catch (e) {
      const err = e as ApiError
      setError(
        err.status === 401
          ? 'Your session ended — sign in again, then add the photo once more.'
          : err.message || 'Could not save the photo.',
      )
    } finally {
      setBusy(null)
    }
  }

  const take = async (file: File | undefined) => {
    if (!file) return
    const heic = /heic|heif/i.test(file.type) || /\.(heic|heif)$/i.test(file.name)
    if (!file.type.startsWith('image/') && !/\.(jpe?g|png|webp|gif|bmp|heic|heif)$/i.test(file.name)) {
      setError('That is not a picture file.')
      return
    }
    setError(null)
    setBusy('Reading…')
    try {
      const bmp = await loadBitmap(file)
      bitmap.current?.close()
      bitmap.current = bmp
      const shape = shapeOf(bmp)
      // faces sit high in a portrait photo — start from the top
      const anchor: Anchor = shape === 'portrait' ? 'start' : 'middle'
      const base = file.name.replace(/\.[^.]+$/, '')
      setSource({ base, shape, anchor })
      await cropAndUpload(base, anchor)
    } catch {
      setBusy(null)
      setError(
        heic
          ? 'iPhone HEIC photos cannot be read here. Export it as a JPEG first (Photos → File → Export), then try again.'
          : 'Could not read that picture. Try a JPEG or PNG.',
      )
    }
  }

  const onDrop = (e: DragEvent) => {
    e.preventDefault()
    setOver(false)
    void take(e.dataTransfer.files?.[0])
  }
  const onPick = (e: ChangeEvent<HTMLInputElement>) => {
    void take(e.target.files?.[0])
    e.target.value = ''
  }
  const reAnchor = (anchor: Anchor) => {
    if (!source) return
    setSource({ ...source, anchor })
    void cropAndUpload(source.base, anchor)
  }
  const labels = source ? anchorLabels(source.shape) : null

  return (
    <div>
      <span className="a-label">{label}</span>
      <div
        className="a-drop flex cursor-pointer flex-wrap items-center gap-4 p-4"
        data-over={over}
        role="button"
        tabIndex={0}
        aria-label={`${label}: ${touch ? 'tap to choose a photo' : 'drop a photo here or click to choose one'}`}
        onClick={() => !busy && input.current?.click()}
        onKeyDown={(e) => {
          if (e.key === 'Enter' || e.key === ' ') {
            e.preventDefault()
            input.current?.click()
          }
        }}
        onDragOver={(e) => {
          e.preventDefault()
          setOver(true)
        }}
        onDragLeave={() => setOver(false)}
        onDrop={onDrop}
      >
        <div className="grid h-24 w-24 shrink-0 place-items-center overflow-hidden rounded-full bg-[#dfe8f7]">
          {value ? (
            <img src={value} alt="" className="h-full w-full object-cover" />
          ) : (
            <span className="text-xs font-semibold text-[#3e5680]">no photo</span>
          )}
        </div>
        <div className="min-w-0 flex-1 basis-48">
          <p className="text-sm">
            <span className="font-semibold">{touch ? 'Tap here to choose a photo.' : 'Drop a photo here, or click to choose one.'}</span>{' '}
            It is cropped to a square and shown in a circle.
          </p>
          <input ref={input} id={id} type="file" accept="image/*" className="hidden" onChange={onPick} onClick={(e) => e.stopPropagation()} />
          {source && labels && source.shape !== 'square' && (
            <div className="mt-2 flex flex-wrap items-center gap-1.5 text-sm" onClick={(e) => e.stopPropagation()}>
              <span className="text-[#3e5680]">Keep the</span>
              {(['start', 'middle', 'end'] as Anchor[]).map((a) => (
                <button
                  key={a}
                  type="button"
                  className={`a-btn a-btn-icon ${source.anchor === a ? 'a-btn-primary' : ''}`}
                  onClick={() => reAnchor(a)}
                  disabled={!!busy}
                >
                  {labels[a]}
                </button>
              ))}
              <span className="text-[#3e5680]">of the picture</span>
            </div>
          )}
          <div className="mt-2 flex flex-wrap items-center gap-2 text-xs text-[#3e5680]" onClick={(e) => e.stopPropagation()}>
            {busy && <span className="font-semibold text-[#1e5eff]">{busy}</span>}
            {!busy && saved && <span className="font-semibold text-[#1a7f37]">Photo saved ✓ — it goes live when you Publish.</span>}
            {!busy && value && (
              <button type="button" className="a-btn a-btn-icon a-btn-danger" onClick={() => onChange(path, '')}>
                Remove photo
              </button>
            )}
          </div>
          {error && <p className="mt-1 text-sm font-semibold text-[#a32020]">{error}</p>}
        </div>
      </div>
    </div>
  )
}
