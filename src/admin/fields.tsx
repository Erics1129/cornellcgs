/**
 * A generic editor for the content document: every string, number, list and
 * object in `src/content.ts` becomes a field by its shape, so a new piece of
 * copy needs no new admin code. Photo fields (a `photo` key, or a value that
 * points at a picture) take a dropped file, crop it square and upload it.
 */
import { useEffect, useId, useRef, useState } from 'react'
import type { ChangeEvent, DragEvent, ReactNode } from 'react'
import { api, ApiError } from './api'
import { hashedName, loadBitmap, squareCrop, type Anchor } from './image'

export type Path = Array<string | number>
export type Update = (path: Path, value: unknown) => void

const LABELS: Record<string, string> = {
  href: 'Link (URL)',
  url: 'Website (URL)',
  cta: 'Button',
  ctaPrimary: 'Main button',
  ctaSecondary: 'Second button',
  alt: 'Alternate heading (the heading swaps between the two)',
  lead: 'Lead',
  tail: 'Typed words',
  blurb: 'Blurb',
  n: 'Step number',
  bio: 'Bio',
  photo: 'Photo',
  instagramUrl: 'Instagram (URL)',
  wechat: 'WeChat',
  noSeparator: 'Show without a thousands separator',
  scrollHint: 'Scroll hint',
  eyebrow: 'Eyebrow line',
  fullName: 'Full name',
  credit: 'Credit line (last line of every page)',
  major: 'Major',
  role: 'Role',
  next: 'What comes next',
  pairs: 'Typed lines',
  threads: 'Cards',
  steps: 'Steps',
  items: 'Events',
  leaders: 'Cards (one per board seat)',
  people: 'People',
  inboxes: 'Inboxes',
  counters: 'Counters (empty = TBA)',
  paragraphs: 'Paragraphs',
  photoPlaceholder: 'Photo placeholder note',
  sections: 'Sections',
  link: 'Button under the text',
  experience: 'Experience (one line each)',
  skills: 'Skills (one each)',
  heading: 'Heading (*asterisks* make a word italic)',
  address: 'Email address',
}

export function humanize(key: string | number | undefined): string {
  if (key === undefined) return ''
  if (typeof key === 'number') return `#${key + 1}`
  if (LABELS[key]) return LABELS[key]
  return key
    .replace(/([a-z])([A-Z])/g, '$1 $2')
    .replace(/[-_]/g, ' ')
    .replace(/^./, (c) => c.toUpperCase())
}

const PHOTO_KEYS = new Set(['photo', 'image', 'avatar', 'portrait'])
const isPhoto = (path: Path, v: unknown) =>
  typeof v === 'string' &&
  (PHOTO_KEYS.has(String(path[path.length - 1])) || /^\/(assets|api\/image)\/.*\.(jpe?g|png|webp)$/i.test(v))

const LONG_KEYS = new Set(['body', 'text', 'bio', 'lead', 'blurb', 'paragraphs'])
const isLong = (path: Path, v: string) =>
  v.length > 70 || v.includes('\n') || LONG_KEYS.has(String(path[path.length - 1])) || LONG_KEYS.has(String(path[path.length - 2]))

/** What a new list item looks like, by the list's key */
const TEMPLATES: Record<string, unknown> = {
  leaders: { name: '', role: '', major: '', photo: '', experience: [], skills: [] },
  people: { name: '', major: '' },
  team: { label: '', alt: '', people: [] },
  items: { title: '', date: 'Date TBA', blurb: '' },
  threads: { rank: '', suit: '♠', title: '', text: '' },
  steps: { n: '', title: '', text: '' },
  sections: { heading: '', alt: '', body: '' },
  pairs: { lead: '', tail: '' },
  counters: { label: '', value: null },
  inboxes: { label: '', address: '' },
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
  !(typeof v === 'string' && !isPhoto(path, v) && !isLong(path, v)) && !(typeof v === 'number' || v === null || typeof v === 'boolean')

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
  const name = label ?? humanize(path[path.length - 1])
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
  const long = isLong(path, value)
  return (
    <Labeled id={id} label={label}>
      {long ? (
        <textarea
          id={id}
          className="a-input"
          rows={Math.min(8, Math.max(2, Math.ceil(value.length / 70) + (value.match(/\n/g)?.length ?? 0)))}
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
  const body = (
    <div className="grid gap-4 sm:grid-cols-2">
      {Object.entries(value).map(([k, v]) => (
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
  const move = (i: number, d: number) => {
    const j = i + d
    if (j < 0 || j >= value.length) return
    const copy = value.slice()
    ;[copy[i], copy[j]] = [copy[j], copy[i]]
    onChange(path, copy)
  }
  const remove = (i: number) => onChange(path, value.filter((_, k) => k !== i))
  const add = () => onChange(path, [...value, newItem(path, value)])

  const controls = (i: number) => (
    <div className="flex shrink-0 items-center gap-1">
      <button type="button" className="a-btn a-btn-icon" title="Move up" onClick={() => move(i, -1)} disabled={i === 0}>
        ↑
      </button>
      <button type="button" className="a-btn a-btn-icon" title="Move down" onClick={() => move(i, 1)} disabled={i === value.length - 1}>
        ↓
      </button>
      <button type="button" className="a-btn a-btn-icon a-btn-danger" title="Remove" onClick={() => remove(i)}>
        ✕
      </button>
    </div>
  )

  return (
    <div>
      <div className="mb-2 flex items-center justify-between gap-3">
        <span className="a-label !mb-0">
          {label} <span className="font-normal opacity-60">· {value.length}</span>
        </span>
        <button type="button" className="a-btn" onClick={add}>
          + Add
        </button>
      </div>
      {value.length === 0 && <p className="text-sm text-[#3e5680]">Nothing here yet.</p>}
      {strings ? (
        <div className="grid gap-2">
          {(value as string[]).map((v, i) => (
            <div key={i} className="flex items-center gap-2">
              <input
                className="a-input"
                type="text"
                value={v}
                aria-label={`${label} ${i + 1}`}
                onChange={(e) => onChange([...path, i], e.target.value)}
              />
              {controls(i)}
            </div>
          ))}
        </div>
      ) : (
        <div className="grid gap-3">
          {value.map((v, i) => (
            <div key={i} className="a-card p-4">
              <div className="mb-3 flex items-center justify-between gap-3">
                <span className="truncate font-semibold">{itemTitle(v, i)}</span>
                {controls(i)}
              </div>
              {v && typeof v === 'object' && !Array.isArray(v) ? (
                <ObjectField path={[...path, i]} value={v as Record<string, unknown>} onChange={onChange} label="" bare />
              ) : (
                <Field path={[...path, i]} value={v} onChange={onChange} />
              )}
            </div>
          ))}
        </div>
      )}
    </div>
  )
}

/* ------------------------------------------------------------------- photo */

function PhotoField({ path, value, onChange, label }: { path: Path; value: string; onChange: Update; label: string }) {
  const id = useId()
  const input = useRef<HTMLInputElement>(null)
  const [over, setOver] = useState(false)
  const [busy, setBusy] = useState<string | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [source, setSource] = useState<{ bmp: ImageBitmap; base: string; anchor: Anchor } | null>(null)

  useEffect(() => () => source?.bmp.close(), [source])

  const cropAndUpload = async (bmp: ImageBitmap, base: string, anchor: Anchor) => {
    setError(null)
    setBusy('Cropping…')
    try {
      const blob = await squareCrop(bmp, anchor)
      const name = await hashedName(base, blob)
      setBusy('Uploading…')
      const { url } = await api.upload(name, blob)
      onChange(path, url)
    } catch (e) {
      const err = e as ApiError
      setError(err.status === 401 ? 'Your session ended — sign in again, then drop the photo once more.' : err.message)
    } finally {
      setBusy(null)
    }
  }

  const take = async (file: File | undefined) => {
    if (!file) return
    if (!/^image\/(jpeg|png|webp|heic|heif|gif|bmp|tiff)$/i.test(file.type) && !/\.(jpe?g|png|webp|heic)$/i.test(file.name)) {
      setError('That is not a picture file.')
      return
    }
    setError(null)
    setBusy('Reading…')
    try {
      const bmp = await loadBitmap(file)
      const base = file.name.replace(/\.[^.]+$/, '')
      // faces sit high in a portrait photo — start from the top
      const anchor: Anchor = bmp.height > bmp.width * 1.15 ? 'top' : 'middle'
      source?.bmp.close()
      setSource({ bmp, base, anchor })
      await cropAndUpload(bmp, base, anchor)
    } catch {
      setBusy(null)
      setError('Could not read that picture (HEIC from an iPhone? export it as JPEG first).')
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
    void cropAndUpload(source.bmp, source.base, anchor)
  }

  return (
    <div>
      <span className="a-label">{label}</span>
      <div
        className="a-drop flex flex-wrap items-center gap-4 p-4"
        data-over={over}
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
        <div className="min-w-0 flex-1">
          <p className="text-sm">
            Drop a photo here, or{' '}
            <button type="button" className="font-semibold underline" onClick={() => input.current?.click()}>
              choose a file
            </button>
            . It is cropped to a square and shown in a circle.
          </p>
          <input ref={input} id={id} type="file" accept="image/*" className="hidden" onChange={onPick} />
          {source && (
            <div className="mt-2 flex flex-wrap items-center gap-1.5 text-sm">
              <span className="text-[#3e5680]">Keep the</span>
              {(['top', 'middle', 'bottom'] as Anchor[]).map((a) => (
                <button
                  key={a}
                  type="button"
                  className={`a-btn a-btn-icon ${source.anchor === a ? 'a-btn-primary' : ''}`}
                  onClick={() => reAnchor(a)}
                  disabled={!!busy}
                >
                  {a}
                </button>
              ))}
              <span className="text-[#3e5680]">of the picture</span>
            </div>
          )}
          <div className="mt-2 flex flex-wrap items-center gap-2 text-xs text-[#3e5680]">
            {busy && <span className="font-semibold text-[#1e5eff]">{busy}</span>}
            {!busy && value && <span className="a-mono truncate">{value}</span>}
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
