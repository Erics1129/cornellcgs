/**
 * Player accounts: Google Identity Services (the "Sign in with Google" button).
 *
 * The GIS script loads once, from https://accounts.google.com/gsi/client, only
 * when a sign-in control is on the page. It hands back a Google ID token, which
 * goes to the account Worker exactly once at login; the browser never keeps it.
 * No One Tap prompt is shown unasked: `prompt()` runs only when the player asks.
 */
export const GIS_SRC = 'https://accounts.google.com/gsi/client'

export type GisButtonOptions = { type?: 'standard' | 'icon'; theme?: 'outline' | 'filled_blue' | 'filled_black'; size?: 'large' | 'medium' | 'small'; shape?: 'rectangular' | 'pill' | 'circle' | 'square'; text?: 'signin_with' | 'signup_with' | 'continue_with' | 'signin'; logo_alignment?: 'left' | 'center'; width?: number }
export type GoogleId = {
  initialize(config: Record<string, unknown>): void
  renderButton(parent: HTMLElement, options: GisButtonOptions): void
  prompt(listener?: (notification: unknown) => void): void
  disableAutoSelect(): void
}
declare global {
  interface Window { google?: { accounts?: { id?: GoogleId } } }
}

let loading: Promise<GoogleId> | null = null

/** Loads the GIS script once; rejects when it is blocked (an ad blocker, no network). */
export function loadGis(): Promise<GoogleId> {
  const existing = typeof window !== 'undefined' ? window.google?.accounts?.id : undefined
  if (existing) return Promise.resolve(existing)
  if (!loading) loading = new Promise<GoogleId>((resolve, reject) => {
    if (typeof document === 'undefined') return reject(new Error('No document.'))
    const fail = (why: string) => { loading = null; reject(new Error(why)) }
    const script = document.createElement('script')
    script.src = GIS_SRC
    script.async = true
    script.defer = true
    script.onload = () => { const id = window.google?.accounts?.id; if (id) resolve(id); else fail('Google sign-in did not initialise.') }
    script.onerror = () => fail('Google sign-in could not load.')
    document.head.appendChild(script)
  })
  return loading
}

export type Google = {
  /** loaded and initialised with the client id (once) */
  ensure(): Promise<GoogleId>
  /** renders the official button into `el`; `compact` draws the icon-only variant */
  renderButton(el: HTMLElement, compact?: boolean): Promise<void>
  /** the on-demand prompt (One Tap / FedCM); the button is the primary path */
  prompt(): Promise<void>
  disableAutoSelect(): void
}

export function createGoogle(clientId: string, onCredential: (idToken: string) => void): Google {
  let ready: Promise<GoogleId> | null = null
  const ensure = () => {
    if (!ready) ready = loadGis().then((id) => {
      id.initialize({
        client_id: clientId,
        callback: (response: { credential?: string }) => { if (typeof response?.credential === 'string' && response.credential) onCredential(response.credential) },
        ux_mode: 'popup',
        auto_select: false,
        itp_support: true,
        use_fedcm_for_prompt: true,
        cancel_on_tap_outside: true,
      })
      return id
    }).catch((e) => { ready = null; throw e })
    return ready
  }
  return {
    ensure,
    async renderButton(el, compact = false) {
      const id = await ensure()
      el.replaceChildren()
      id.renderButton(el, compact ? { type: 'icon', theme: 'outline', size: 'medium', shape: 'circle' } : { type: 'standard', theme: 'outline', size: 'medium', shape: 'pill', text: 'signin_with', logo_alignment: 'left' })
    },
    async prompt() { (await ensure()).prompt() },
    disableAutoSelect() { try { window.google?.accounts?.id?.disableAutoSelect() } catch { /* not loaded */ } },
  }
}
