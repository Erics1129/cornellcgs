/**
 * Player accounts: the small control on the right of the mini-game bar.
 *
 * Renders nothing while the feature is unconfigured. Signed out it holds the
 * official "Sign in with Google" button (icon-only on narrow screens); signed
 * in, a round avatar that opens a menu with the name, Sign out, Sign out and
 * clear this device, and Delete account. While a login is in flight the avatar
 * slot shows a dot. When the device's saves came from another account, a small
 * panel asks whether to merge them in or use the account's copy.
 */
import { useEffect, useId, useRef, useState } from 'react'
import { account } from './index.ts'
import type { AccountState } from './index.ts'
import './account.css'

const COMPACT = '(max-width: 700px)'

export default function SignIn() {
  const [state, setState] = useState<AccountState>(account.state)
  const [open, setOpen] = useState(false)
  const [busy, setBusy] = useState(false)
  const [blocked, setBlocked] = useState(false)
  const [compact, setCompact] = useState(() => typeof matchMedia === 'function' && matchMedia(COMPACT).matches)
  const slot = useRef<HTMLDivElement>(null)
  const root = useRef<HTMLDivElement>(null)
  const trigger = useRef<HTMLButtonElement>(null)
  const menuId = useId()

  useEffect(() => { if (!account.enabled) return; account.start(); return account.onChange(setState) }, [])
  useEffect(() => {
    if (!account.enabled || typeof matchMedia !== 'function') return
    const query = matchMedia(COMPACT)
    const update = () => setCompact(query.matches)
    query.addEventListener('change', update)
    return () => query.removeEventListener('change', update)
  }, [])
  useEffect(() => {
    if (!account.enabled || state.status !== 'out' || !slot.current) return
    const el = slot.current
    let active = true
    setBlocked(false)
    account.renderButton(el, compact).catch(() => { if (active) setBlocked(true) })
    return () => { active = false; el.replaceChildren() }
  }, [state.status, compact])
  useEffect(() => {
    if (!open) return
    const outside = (event: PointerEvent) => { if (event.target instanceof Node && !root.current?.contains(event.target)) setOpen(false) }
    const escape = (event: KeyboardEvent) => { if (event.key === 'Escape') { event.preventDefault(); setOpen(false); trigger.current?.focus() } }
    document.addEventListener('pointerdown', outside)
    document.addEventListener('keydown', escape)
    return () => { document.removeEventListener('pointerdown', outside); document.removeEventListener('keydown', escape) }
  }, [open])

  if (!account.enabled) return null

  const run = async (action: () => Promise<void>) => {
    setBusy(true)
    try { await action() } catch { /* the account state carries any message */ } finally { setBusy(false); setOpen(false) }
  }
  const signOut = () => run(() => account.signOut())
  const signOutAndClear = () => {
    if (!confirm('Sign out and remove every game save from this device? Your progress stays in your account.')) return
    void run(() => account.signOut({ clearDevice: true }))
  }
  const remove = () => {
    if (!confirm('Delete your account? The copy of your progress on the server is removed right away. The saves on this device are kept.')) return
    void run(() => account.deleteAccount())
  }

  if (state.status === 'loading') return <div className="acct" data-status="loading"><span className="acct__dot" role="status" aria-label="Signing in" /></div>

  if (state.status === 'out') return <div className="acct" data-status="out">
    <div ref={slot} className={`acct__slot ${compact ? 'is-compact' : ''}`} aria-label="Sign in with Google" />
    {blocked && <button type="button" className="acct__fallback" onClick={() => void account.signIn()}>Sign in</button>}
    {state.error && <span className="acct__error" role="status">{state.error}</span>}
  </div>

  const initial = (state.name || '?').trim().charAt(0).toUpperCase() || '?'
  return <div ref={root} className="acct" data-status="in" data-open={open}
    onBlur={(event) => { if (!event.currentTarget.contains(event.relatedTarget as Node | null)) setOpen(false) }}>
    <button ref={trigger} type="button" className="acct__avatar" title={state.name || 'Signed in'} aria-label={`Account menu for ${state.name || 'your account'}`}
      aria-expanded={open} aria-controls={menuId} aria-haspopup="menu" onClick={() => setOpen((v) => !v)}>
      {state.picture ? <img src={state.picture} alt="" referrerPolicy="no-referrer" width={28} height={28} /> : <span aria-hidden="true">{initial}</span>}
    </button>
    <div id={menuId} className="acct__menu" role="menu" aria-hidden={!open}>
      <p className="acct__name">{state.name || 'Signed in'}</p>
      <p className="acct__hint">Progress in every game follows this account.</p>
      <button type="button" role="menuitem" tabIndex={open ? 0 : -1} disabled={busy} onClick={signOut}>Sign out</button>
      <button type="button" role="menuitem" tabIndex={open ? 0 : -1} disabled={busy} onClick={signOutAndClear}>Sign out and clear this device…</button>
      <button type="button" role="menuitem" tabIndex={open ? 0 : -1} disabled={busy} className="acct__danger" onClick={remove}>Delete account…</button>
    </div>
    {state.pending === 'local-saves' && <div className="acct__choice" role="dialog" aria-labelledby={`${menuId}-choice`}>
      <p id={`${menuId}-choice`}>This device holds game saves from a different account.</p>
      <button type="button" onClick={() => account.resolveLocalSaves(false)}>Use my account’s progress</button>
      <button type="button" onClick={() => account.resolveLocalSaves(true)}>Merge this device’s saves in</button>
      <small>Until you choose, nothing is sent to your account.</small>
    </div>}
  </div>
}
