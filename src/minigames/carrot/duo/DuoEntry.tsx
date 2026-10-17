import { Glyph } from './bits'

/**
 * The way into multiplayer on the title screen: a floating glass pill. `compact` is the small variant (icon and one word) for a slot in
 * the redesigned lobby; the page shows it only when multiplayer is configured (VITE_ROOMS_URL, or the development overrides).
 */
export function DuoEntry({onOpen,compact=false}:{onOpen:()=>void;compact?:boolean}){
 return <button type="button" className={`ct-duo ct-duo-entry ${compact?'is-compact':''}`} onClick={onOpen} aria-label="Play with a friend: two-player boss fights and endless">
  <span className="ct-duo-entry__icon"><Glyph name="duo"/></span>
  <span className="ct-duo-entry__text"><b>{compact?'Duo':'Play with a friend'}</b>{!compact&&<small>Boss fights · Endless</small>}</span>
 </button>
}
