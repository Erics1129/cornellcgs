import { useState } from 'react'
import type { CSSProperties } from 'react'
import type { GameDefinitions, SuperSave } from '../types'
import { CreatureGlyph, CreaturePortrait, TowerPortrait } from '../art'
import { miniBosses, regularMobs, towerTraits } from '../expansion'
import { names } from '../copy'
import { towerReach } from './BuildMenu'
import Icon from '../Icon'
import { Modal } from './Dialog'
import type { Prefs } from '../prefs'
import type { Volumes } from '../volume'

const vars=(v:Record<string,string|number>)=>v as CSSProperties
const steps=[
 {icon:'leaf',title:'Build',body:'Tap a clearing beside the path, pick a tower, then press Build. Mix kinds: from the 4th tower of one kind, that kind deals less damage.'},
 {icon:'upgrade',title:'Upgrade',body:'Each tower upgrades three times. Clear scenery for coins and more clearings.'},
 {icon:'target',title:'Defend',body:'Cover every route. Tap a creature to make every tower target it.'},
 {icon:'merge',title:'Merge',body:'Drag a Tier IV onto its twin to forge one Super tower.'},
]
const keys:[string,string][]=[['Space','Start or pause'],['U','Upgrade'],['M','Merge'],['F','Faster'],['Esc','Close']]

/** A drawing of the wave track (two routes, creatures sliding toward the line, a group as a long bar); the notes drift under full motion. */
function TrackSketch(){
 const notes=[{lane:0,at:22,kind:'nibble'},{lane:0,at:58,kind:'dash',badge:'wing'},{lane:1,at:36,kind:'shell',badge:'shield',group:30},{lane:1,at:80,kind:'boss',boss:true}]
 return <div className="ct-sketch" aria-hidden="true">
  {['A','B'].map((l,i)=><div key={l} className="ct-sketch__lane"><span className="ct-sketch__route">{l}</span><span className="ct-sketch__rail">{notes.filter(n=>n.lane===i).map(n=><span key={n.kind} className={`ct-sketch__note${n.boss?' is-boss':''}`} style={vars({'--at':`${n.at}%`,'--group':`${n.group||0}%`})}>{!!n.group&&<i className="ct-sketch__tail"/>}<CreatureGlyph kind={n.kind}/>{n.badge&&<b><Icon name={n.badge}/></b>}</span>)}</span></div>)}
 </div>
}

/** Who made what: the same list in Credits and at the bottom of How to play. Facts from public/assets/minigames/carrot/credits.txt. */
function CreditsList(){
 return <>
  <ul className="ct-credits__list">
   <li className="gl-fill"><span className="gl-label">Game</span><p>A fan-made carrot-defense game for Cornell CGS. Original maps and tower designs.</p></li>
   <li className="gl-fill"><span className="gl-label">Characters</span><p>Original modeled characters use animation foundations by Quaternius.</p></li>
   <li className="gl-fill"><span className="gl-label">Materials and plants</span><p>Scanned materials and vegetation by Poly Haven.</p></li>
   <li className="gl-fill"><span className="gl-label">Nature and sound</span><p>Additional nature and sound effects by Kenney.</p></li>
   <li className="gl-fill"><span className="gl-label">Music</span><p>Fantasy Orchestral Theme by Joth, A Legend Will Rise by CodeManu, Determined Pursuit by Emma_MA and The Ancient Legend by Vitalezzz (CC0, OpenGameArt).</p></li>
  </ul>
  <p className="ct-credits__more">Full music and asset credits are included with the game. <a href="/assets/minigames/carrot/credits.txt" target="_blank" rel="noreferrer">Asset credits ↗</a></p>
 </>
}

export function HelpModal({onClose}:{onClose:()=>void}){
 return <Modal title={names.howToPlay} onClose={onClose} className="ct-help">
  <div className="ct-help-steps">{steps.map((s,i)=><article key={s.title} className="gl-fill" style={vars({'--gl-pad':'0px'})}><span className="ct-help-steps__icon"><Icon name={s.icon}/></span><span className="ct-help-steps__no gl-num" aria-hidden="true">{i+1}</span><h3>{s.title}</h3><p>{s.body}</p></article>)}</div>
  <section className="ct-help-track gl-well">
   <TrackSketch/>
   <div className="ct-help-track__copy">
    <h3>Reading the wave track</h3>
    <p>Each lane is a route. Creatures slide toward the bright line and appear when they reach it. A long bar is a group that arrives over time. Badges mark <b><Icon name="wing"/>flying</b>, <b><Icon name="shield"/>armored</b>, <b><Icon name="hex"/>shielded</b>, <b><Icon name="cross"/>healing</b>, <b><Icon name="crown"/>minibosses</b> and the <b><Icon name="skull"/>guardian</b>. Flags on the progress bar show where guardians and minibosses arrive.</p>
    <p>Flawless (a wave with no leaks) adds to your <b>chain</b>. A leak breaks it. Guardian casts hold the game at 1× while they wind up, so you have time to react.</p>
   </div>
  </section>
  <section className="ct-help-controls">
   <p className="ct-help-gestures"><Icon name="target"/>Pinch or scroll to zoom. Drag to look around. Hold a fully grown tower, then drag it onto its twin to merge.</p>
   <ul className="ct-help-keys">{keys.map(([k,label])=><li key={k}><kbd>{k}</kbd><span>{label}</span></li>)}</ul>
  </section>
  <details className="ct-help-credits"><summary><span>Credits</span><Icon name="arrow"/></summary><CreditsList/></details>
 </Modal>
}

export function CreditsModal({onClose}:{onClose:()=>void}){
 return <Modal title="Credits" onClose={onClose} className="ct-credits"><CreditsList/></Modal>
}

export function FieldGuide({definitions,superSave,onClose}:{definitions:GameDefinitions|null;superSave:SuperSave;onClose:()=>void}){
 const [mode,setMode]=useState<'towers'|'creatures'>('towers')
 return <Modal title={names.fieldGuide} onClose={onClose} className="ct-collection">
  <nav className="ct-segment" aria-label={names.fieldGuide}><button onClick={()=>setMode('towers')} aria-pressed={mode==='towers'}>Towers</button><button onClick={()=>setMode('creatures')} aria-pressed={mode==='creatures'}>Creatures</button></nav>
  {mode==='towers'?<div className="ct-guide-grid" key="towers">{definitions?.towers.map((t,i)=>{const forged=!!superSave.kinds[t.id],r=towerReach(t)
   return <article key={t.id} className={`gl-fill${forged?' is-super':''}`} style={vars({'--i':i})}><span className="gl-thumb ct-guide-grid__art"><TowerPortrait kind={t.id} tier={forged?5:4}/></span><div><h3>{forged&&t.superName?<>{t.superName}<small>{t.name}</small></>:t.name}</h3><p>{forged&&t.superTrait?t.superTrait:towerTraits[t.id]||t.role}</p>
    <span className="ct-badges"><span className={`ct-badge ${r.air?'is-air':''}`}><Icon name={r.air?'wing':'leaf'}/>{r.air?'Air':'Ground'}</span><span className="ct-badge"><Icon name={r.area?'splash':'target'}/>{r.area?'Area':'Single'}</span><span className="ct-badge">Stage {t.unlock}</span>{forged&&<span className="ct-badge is-super">Super</span>}</span></div></article>})}</div>
  :<div className="ct-guide-grid" key="creatures">{miniBosses.map((m,i)=><article key={m.id} className="gl-fill is-mini" style={vars({'--i':i})}><span className="gl-thumb ct-guide-grid__art"><CreaturePortrait kind={m.id}/></span><div><span className="gl-label">Miniboss · {m.power}</span><h3>{m.name}</h3><p>{m.detail}</p></div></article>)}{regularMobs.map((m,i)=><article key={m.id} className="gl-fill" style={vars({'--i':miniBosses.length+i})}><span className="gl-thumb ct-guide-grid__art"><CreaturePortrait kind={m.id}/></span><div><span className="gl-label">Creature</span><h3>{m.name}</h3><p>{m.power}</p></div></article>)}</div>}
 </Modal>
}

export function SettingsModal({prefs,volumes,sound,inGame,canFocusBoss,expanded,onPrefs,onVolumes,onSound,onFocusBoss,onRestart,onStages,onHelp,onFullscreen,onClose}:{prefs:Prefs;volumes:Volumes;sound:boolean;inGame:boolean;canFocusBoss:boolean;expanded?:boolean;onPrefs:(p:Partial<Prefs>)=>void;onVolumes:(v:Partial<Volumes>)=>void;onSound:()=>void;onFocusBoss:()=>void;onRestart?:()=>void;onStages?:()=>void;onHelp?:()=>void;onFullscreen?:()=>void;onClose:()=>void}){
 const slider=(id:keyof Volumes,label:string)=><label className="ct-slider"><span>{label}</span><input type="range" min={0} max={100} step={5} value={Math.round(volumes[id]*100)} style={vars({'--v':`${Math.round(volumes[id]*100)}%`})} disabled={!sound} onChange={e=>onVolumes({[id]:Number(e.target.value)/100})} aria-valuetext={`${Math.round(volumes[id]*100)}%`}/><b className="gl-num">{Math.round(volumes[id]*100)}</b></label>
 return <Modal title={names.settings} onClose={onClose} className="ct-settings">
  <section><h3>Sound</h3><div className="ct-settings__group">
   <label className="ct-switch"><input type="checkbox" checked={sound} onChange={onSound}/><span>Sound</span><small>{sound?'On':'Muted on this device'}</small></label>
   {slider('music','Music')}{slider('sfx','Effects')}{slider('ui','Interface')}
  </div></section>
  <section><h3>Display</h3><div className="ct-settings__group">
   <label className="ct-switch"><input type="checkbox" checked={prefs.reducedEffects} onChange={e=>onPrefs({reducedEffects:e.target.checked})}/><span>Reduced effects</span><small>No shake, flashes, camera moves or see-through panels</small></label>
   <div className="ct-field"><span>HUD size</span><div className="ct-segment" role="group" aria-label="HUD size">{([90,100,115] as const).map(v=><button key={v} aria-pressed={prefs.hudScale===v} onClick={()=>onPrefs({hudScale:v})}>{v}%</button>)}</div></div>
  </div></section>
  {inGame&&<section><h3>Battle</h3><div className="ct-settings__actions">
   {canFocusBoss&&<button className="ct-ghost" onClick={onFocusBoss}><Icon name="focus"/>Show the guardian</button>}
   {onRestart&&<button className="ct-ghost" onClick={onRestart}><Icon name="restart"/>Restart stage</button>}
   {onStages&&<button className="ct-ghost" onClick={onStages}><Icon name="levels"/>{names.stageSelect}</button>}
   {onHelp&&<button className="ct-ghost" onClick={onHelp}><Icon name="help"/>{names.howToPlay}</button>}
   {onFullscreen&&<button className="ct-ghost" onClick={onFullscreen}><Icon name="full"/>{expanded?'Exit full screen':'Full screen'}</button>}
  </div></section>}
 </Modal>
}
