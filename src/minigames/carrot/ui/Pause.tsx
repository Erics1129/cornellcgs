import type { SnapshotStore } from '../hooks/useSnapshot'
import { useSlice } from '../hooks/useSnapshot'
import { actions, names } from '../copy'
import { glass, jelly, useExit } from './Glass'
import Icon from '../Icon'

/**
 * The pause dock (styles: ui/menus.css): a low glass bar with Resume and the three places a paused player goes next (restart, the
 * stage list, settings). It stays low and small on purpose: the board keeps its zoom, pan and taps while paused, and selling or
 * building still works, so the dock steps aside (fades out) while a clearing, tower or creature is selected and the build menu
 * has the space. (Its own class, ct-pause: the HUD's .ct-paused rules would otherwise style it.)
 */
export function PauseMenu({store,send,challenge=false,onRestart,onStages,onSettings}:{store:SnapshotStore;send:(c:{type:string})=>void;challenge?:boolean;onRestart:()=>void;onStages:()=>void;onSettings:()=>void}){
 const s=useSlice(store,st=>!!st&&st.paused&&st.phase==='playing'?{busy:!!st.selection?.type}:null)
 const {mounted,leaving}=useExit(!!s&&!s.busy)
 if(!mounted)return null
 const stages=challenge?names.challenges:names.stageSelect
 return <div className={glass({depth:2,pill:true,blur:true,pop:'rise'},'ct-pause',leaving&&'is-leaving')} role="group" aria-label="Paused">
  <span className="ct-pause__state"><span className="ct-pause__glyph" aria-hidden="true"><Icon name="pause"/></span><span className="ct-pause__title">Paused</span></span>
  <button className={jelly({},'ct-cta ct-pause__resume')} onClick={()=>send({type:'pause'})}>{actions.resume}<Icon name="play"/></button>
  <span className="ct-pause__tools">
   <button className="ct-icon-btn" onClick={onRestart} aria-label="Restart stage" title="Restart stage"><Icon name="restart"/></button>
   <button className="ct-icon-btn" onClick={onStages} aria-label={stages} title={stages}><Icon name={challenge?'swords':'levels'}/></button>
   <button className="ct-icon-btn" onClick={onSettings} aria-label={names.settings} title={names.settings}><Icon name="sliders"/></button>
  </span>
 </div>
}
