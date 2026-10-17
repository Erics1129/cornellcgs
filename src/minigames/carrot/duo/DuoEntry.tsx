
// self-contained (no shared bits): it is the only duo piece that loads with the page
/**
 * The way into multiplayer on the title screen: a floating glass pill. `compact` is the small variant (icon and one word) for a slot in
 * the redesigned lobby; the page shows it only when multiplayer is configured (VITE_ROOMS_URL, or the development overrides).
 */
export function DuoEntry({onOpen,onIntent,compact=false}:{onOpen:()=>void;onIntent?:()=>void;compact?:boolean}){
 return <button type="button" className={`ct-duo ct-duo-entry ${compact?'is-compact':''}`} onClick={onOpen} onPointerEnter={onIntent} onFocus={onIntent} onTouchStart={onIntent} aria-label="Play with a friend: two-player boss fights and endless">
  <span className="ct-duo-entry__icon"><svg className="ct-duo-glyph" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><path d="M8.5 11a3.5 3.5 0 1 0 0-7 3.5 3.5 0 0 0 0 7Zm7-1a3 3 0 1 0 0-6M2.5 20c0-3.6 2.7-6 6-6s6 2.4 6 6m2-6c2.8 0 5 2.1 5 5.4"/></svg></span>
  <span className="ct-duo-entry__text"><b>{compact?'Duo':'Play with a friend'}</b>{!compact&&<small>Boss fights · Endless</small>}</span>
 </button>
}
