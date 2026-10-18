import type { SnapshotStore } from '../hooks/useSnapshot'
import { useSlice } from '../hooks/useSnapshot'
import { actions, names } from '../copy'
import { glass, jelly, useExit } from './Glass'
import Icon from '../Icon'

/**
 * Paused (the pause button, Space or a hidden tab): the board's edges dim softly (styles: ui/hud.css .ct-dim) and a low glass dock
 * (styles: ui/menus.css) holds Resume and the three places a paused player goes next (restart, the stage list, settings). It stays low
 * and small on purpose: the board keeps its zoom, pan and taps while paused, and selling or building still works, so the dock steps
 * aside (fades out) while a clearing, tower or creature is selected and the build menu has the space. The dim stays until play resumes.
 * (Its own class, ct-pause, apart from the HUD's names.)
 */
export function PauseMenu({store,send,challenge=false,onRestart,onStages,onSettings}:{store:SnapshotStore;send:(c:{type:string})=>void;challenge?:boolean;onRestart:()=>void;onStages:()=>void;onSettings:()=>void}){
 const s=useSlice(store,st=>!!st&&st.paused&&st.phase==='playing'?{busy:!!st.selection?.type}:null)
 const dim=useExit(!!s),dock=useExit(!!s&&!s.busy)
 if(!dim.mounted&&!dock.mounted)return null
 const stages=challenge?names.challenges:names.stageSelect
 return <>
  {dim.mounted&&<div className={['ct-dim',dim.leaving&&'is-leaving'].filter(Boolean).join(' ')} aria-hidden="true"/>}
  {dock.mounted&&<div className={glass({depth:2,pill:true,blur:true,pop:'rise'},'ct-pause',dock.leaving&&'is-leaving')} role="group" aria-label="Paused">
   <span className="ct-pause__state"><span className="ct-pause__glyph" aria-hidden="true"><Icon name="pause"/></span><span className="ct-pause__title">Paused</span></span>
   <button className={jelly({},'ct-cta ct-pause__resume')} onClick={()=>send({type:'pause'})} aria-keyshortcuts="Space">{actions.resume}<Icon name="play"/><kbd className="ct-pause__key" aria-hidden="true">Space</kbd></button>
   <span className="ct-pause__tools">
    <button className="ct-icon-btn" onClick={onRestart} aria-label="Restart stage" title="Restart stage"><Icon name="restart"/></button>
    <button className="ct-icon-btn" onClick={onStages} aria-label={stages} title={stages}><Icon name={challenge?'swords':'levels'}/></button>
    <button className="ct-icon-btn" onClick={onSettings} aria-label={names.settings} title={names.settings}><Icon name="sliders"/></button>
   </span>
  </div>}
 </>
}
