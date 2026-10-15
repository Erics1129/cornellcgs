import { useEffect, useRef, useState } from 'react'
import type { ReactNode } from 'react'
import type { GameDefinitions, SuperSave } from '../types'
import { CreaturePortrait, TowerPortrait } from '../art'
import { miniBosses, regularMobs, towerTraits } from '../expansion'
import { towerReach } from './BuildMenu'
import Icon from '../Icon'
import type { Prefs } from '../prefs'
import type { Volumes } from '../volume'

export function Modal({title,children,onClose,className='',kicker}:{title:string;children:ReactNode;onClose:()=>void;className?:string;kicker?:string}){
 const ref=useRef<HTMLDialogElement>(null)
 useEffect(()=>{const el=ref.current;el?.showModal();return()=>el?.close()},[])
 return <dialog ref={ref} className={`ct-dialog ${className}`} onCancel={e=>{e.preventDefault();onClose()}} onClick={e=>{if(e.target===e.currentTarget)onClose()}} aria-label={title}>
  <div className="ct-dialog__inner ct-panel"><header>{kicker&&<span className="ct-kicker">{kicker}</span>}<h2>{title}</h2><button className="ct-icon-btn" onClick={onClose} aria-label={`Close ${title}`}><Icon name="close"/></button></header>{children}</div>
 </dialog>
}

export function HelpModal({onClose}:{onClose:()=>void}){
 return <Modal title="Protect the carrot" kicker="How to play" onClose={onClose} className="ct-help">
  <div className="ct-help-steps">
   <article><Icon name="leaf"/><h3>Plant</h3><p>Tap a clearing beside the path. Pick a tower, then Build. Mix kinds: four of one kind crowd the soil.</p></article>
   <article><Icon name="upgrade"/><h3>Grow</h3><p>Upgrade three times. Clear scenery for coins and space.</p></article>
   <article><Icon name="target"/><h3>Defend</h3><p>Cover every route. Tap a creature to focus your towers.</p></article>
   <article><Icon name="merge"/><h3>Merge</h3><p>Drag a Tier IV onto its twin to forge one Super tower.</p></article>
  </div>
  <section className="ct-help-track"><h3>Reading the wave track</h3><p>Each lane is a route. Creatures slide toward the bright line and spawn the moment they reach it; a long note is a group arriving over time. Badges mark <b><Icon name="wing"/>flying</b>, <b><Icon name="shield"/>armored</b>, <b><Icon name="hex"/>shielded</b>, <b><Icon name="cross"/>healing</b>, <b><Icon name="crown"/>minibosses</b> and the <b><Icon name="skull"/>guardian</b>. Flags on the progress bar show where guardians and minibosses arrive.</p>
   <p>Words such as <b>FLAWLESS</b> (a wave with no leaks) build your <b>chain</b>; a leak breaks it. Guardian casts hold the game at 1× while they wind up, so you always have time to answer.</p></section>
  <p className="ct-help-gestures">Pinch or scroll to zoom. Drag to look around. Hold a fully grown tower, then drag it onto its twin to merge.</p>
  <p className="ct-help-shortcuts"><kbd>Space</kbd> Start or pause <kbd>U</kbd> Upgrade <kbd>M</kbd> Merge <kbd>F</kbd> Faster <kbd>Esc</kbd> Close</p>
  <details><summary>Credits</summary><p>A fan-made carrot-defense game for Cornell CGS. Original maps and tower designs. Original modeled characters use animation foundations by Quaternius. Scanned materials and vegetation by Poly Haven; additional nature and sound effects by Kenney. Full music and asset credits are included with the game.</p><a href="/assets/minigames/carrot/credits.txt" target="_blank" rel="noreferrer">Asset credits ↗</a></details>
 </Modal>
}

export function FieldGuide({definitions,superSave,onClose}:{definitions:GameDefinitions|null;superSave:SuperSave;onClose:()=>void}){
 const [mode,setMode]=useState<'towers'|'creatures'>('towers')
 return <Modal title="Field guide" kicker="The garden" onClose={onClose} className="ct-collection">
  <nav className="ct-segment" aria-label="Field guide"><button onClick={()=>setMode('towers')} aria-pressed={mode==='towers'}>Defenses</button><button onClick={()=>setMode('creatures')} aria-pressed={mode==='creatures'}>Creatures</button></nav>
  {mode==='towers'?<div className="ct-guide-grid">{definitions?.towers.map(t=>{const forged=!!superSave.kinds[t.id],r=towerReach(t)
   return <article key={t.id} className={forged?'is-super':''}><TowerPortrait kind={t.id} tier={forged?5:4}/><div><h3>{forged&&t.superName?<>{t.superName}<small>{t.name}</small></>:t.name}</h3><p>{forged&&t.superTrait?t.superTrait:towerTraits[t.id]||t.role}</p>
    <span className="ct-badges"><span className={`ct-badge ${r.air?'is-air':''}`}><Icon name={r.air?'wing':'leaf'}/>{r.air?'Air':'Ground'}</span><span className="ct-badge"><Icon name={r.area?'splash':'target'}/>{r.area?'Area':'Single'}</span><span className="ct-badge">Lv {t.unlock}</span>{forged&&<span className="ct-badge is-super">Super</span>}</span></div></article>})}</div>
  :<div className="ct-guide-grid">{miniBosses.map(m=><article key={m.id}><CreaturePortrait kind={m.id}/><div><span className="ct-kicker">Miniboss · {m.power}</span><h3>{m.name}</h3><p>{m.detail}</p></div></article>)}{regularMobs.map(m=><article key={m.id}><CreaturePortrait kind={m.id}/><div><span className="ct-kicker">Creature</span><h3>{m.name}</h3><p>{m.power}</p></div></article>)}</div>}
 </Modal>
}

export function SettingsModal({prefs,volumes,sound,inGame,canFocusBoss,expanded,onPrefs,onVolumes,onSound,onFocusBoss,onRestart,onStages,onHelp,onFullscreen,onClose}:{prefs:Prefs;volumes:Volumes;sound:boolean;inGame:boolean;canFocusBoss:boolean;expanded?:boolean;onPrefs:(p:Partial<Prefs>)=>void;onVolumes:(v:Partial<Volumes>)=>void;onSound:()=>void;onFocusBoss:()=>void;onRestart?:()=>void;onStages?:()=>void;onHelp?:()=>void;onFullscreen?:()=>void;onClose:()=>void}){
 const slider=(id:keyof Volumes,label:string)=><label className="ct-slider"><span>{label}</span><input type="range" min={0} max={100} step={5} value={Math.round(volumes[id]*100)} disabled={!sound} onChange={e=>onVolumes({[id]:Number(e.target.value)/100})} aria-valuetext={`${Math.round(volumes[id]*100)}%`}/><b>{Math.round(volumes[id]*100)}</b></label>
 return <Modal title="Settings" kicker="Carrot Defense" onClose={onClose} className="ct-settings">
  <section><h3>Sound</h3>
   <label className="ct-switch"><input type="checkbox" checked={sound} onChange={onSound}/><span>Sound</span><small>{sound?'On':'Muted on this device'}</small></label>
   {slider('music','Music')}{slider('sfx','Effects')}{slider('ui','Interface')}
  </section>
  <section><h3>Display</h3>
   <label className="ct-switch"><input type="checkbox" checked={prefs.reducedEffects} onChange={e=>onPrefs({reducedEffects:e.target.checked})}/><span>Reduced effects</span><small>No shake, flashes or camera moves</small></label>
   <div className="ct-field"><span>HUD size</span><div className="ct-segment" role="group" aria-label="HUD size">{([90,100,115] as const).map(v=><button key={v} aria-pressed={prefs.hudScale===v} onClick={()=>onPrefs({hudScale:v})}>{v}%</button>)}</div></div>
  </section>
  {inGame&&<section><h3>Battle</h3><div className="ct-settings__row">
   {canFocusBoss&&<button className="ct-ghost" onClick={onFocusBoss}><Icon name="focus"/>Focus the guardian</button>}
   {onRestart&&<button className="ct-ghost" onClick={onRestart}><Icon name="restart"/>Restart stage</button>}
   {onStages&&<button className="ct-ghost" onClick={onStages}><Icon name="levels"/>Stage select</button>}
   {onHelp&&<button className="ct-ghost" onClick={onHelp}><Icon name="help"/>How to play</button>}
   {onFullscreen&&<button className="ct-ghost" onClick={onFullscreen}><Icon name="full"/>{expanded?'Exit full screen':'Full screen'}</button>}
  </div></section>}
 </Modal>
}

/** A small confirm step for Restart (it throws away the run). */
export function ConfirmModal({title,body,confirm,onConfirm,onClose}:{title:string;body:string;confirm:string;onConfirm:()=>void;onClose:()=>void}){
 return <Modal title={title} onClose={onClose} className="ct-confirm"><p>{body}</p><div className="ct-settings__row"><button className="ct-cta" onClick={onConfirm}>{confirm}</button><button className="ct-ghost" onClick={onClose}>Keep playing</button></div></Modal>
}
