import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import type { Command, EnemyDefinition, GameDefinitions, LevelDefinition } from '../types'
import type { SnapshotStore } from '../hooks/useSnapshot'
import { useSlice } from '../hooks/useSnapshot'
import { abilityText } from '../abilities'
import { AbilityGlyph, BossPortrait, SuperEmblem } from '../art'
import { waveHasAir } from '../waves'
import Icon from '../Icon'
import { glass } from './Glass'

/**
 * Pausing for a card. A v2 build takes the idempotent {type:'setPaused'}; a v1 build only has the 'pause' toggle (playing phase only),
 * so the page toggles only when the game is running and toggles back only if it is still paused by us.
 */
export function usePauseFor(store:SnapshotStore,send:(c:Command)=>void){
 const held=useRef<{by:'v2'|'toggle'|null}>({by:null})
 const hold=useCallback(()=>{const st=store.get();if(!st||held.current.by)return
  if(typeof st.v==='number'&&st.v>=2){if(!st.paused){send({type:'setPaused',value:1});held.current.by='v2'}}
  else if(st.phase==='playing'&&!st.paused){send({type:'pause'});held.current.by='toggle'}},[store,send])
 const release=useCallback(()=>{const st=store.get(),by=held.current.by;held.current.by=null
  if(by==='v2')send({type:'setPaused',value:0})
  else if(by==='toggle'&&st?.paused&&st.phase==='playing')send({type:'pause'})},[store,send])
 return useMemo(()=>({hold,release}),[hold,release])
}

// ---- Guided first level ----------------------------------------------------------------------------------------------------------
export type TutorialStep='pad'|'build'|'more'|'start'|'watch'|null
export function useTutorialStep(store:SnapshotStore,active:boolean):TutorialStep{
 const s=useSlice(store,st=>st?{phase:st.phase,sel:st.selection?.type||'',towers:st.towerCount||0,coins:st.coins,level:st.level}:null)
 if(!active||!s||s.level!==1)return null
 if(s.phase==='playing')return 'watch'
 if(s.phase!=='ready')return null
 if(s.sel==='pad')return 'build'
 if(s.towers>=3||(s.towers>0&&s.coins<80))return 'start'
 if(s.towers>0)return 'more'
 return 'pad'
}
const coachCopy:Record<Exclude<TutorialStep,null>,{title:string;body:string}>={
 pad:{title:'Build your first tower',body:'Tap a glowing clearing beside the path.'},
 build:{title:'Choose Seed, then Build',body:'Seed hits ground and air. The number is its cost.'},
 more:{title:'Cover the bends',body:'Two more towers where the paths turn. Three in all.'},
 start:{title:'Start the first wave',body:'The wave track shows what is coming. Creatures appear when they reach the line.'},
 watch:{title:'Towers fire on their own',body:'Tap a creature to make every tower target it.'},
}
export function Coach({step,towers,onSkip,onDone}:{step:TutorialStep;towers:number;onSkip:()=>void;onDone:()=>void}){
 const done=useRef(onDone);done.current=onDone
 useEffect(()=>{if(step!=='watch')return;const t=window.setTimeout(()=>done.current(),7000);return()=>clearTimeout(t)},[step])
 if(!step)return null
 const c=coachCopy[step]
 return <aside className={glass({depth:2,tone:'accent'},'ct-coach ct-panel')} role="status" aria-label="Tutorial">
  <span className="ct-coach__step">{['pad','build','more','start','watch'].indexOf(step)+1}<small>/5</small></span>
  <div><b>{c.title}{step==='more'&&<small> · {towers}/3</small>}</b><p>{c.body}</p></div>
  <button className="ct-ghost ct-coach__skip" onClick={step==='watch'?onDone:onSkip}>{step==='watch'?'Got it':'Skip tutorial'}</button>
 </aside>
}

// ---- Pre-fight briefing (Asuna, level 29) --------------------------------------------------------------------------------------------
/**
 * Asuna outruns any fixed line; the winning play is to move the defense with her. The card says so before the encounter starts
 * (the ready phase), and again for the first 25 s of the fight until it is dismissed.
 */
export function PrismBriefing({store,run}:{store:SnapshotStore;run:number}){
 const s=useSlice(store,st=>st&&st.level===29&&(st.phase==='ready'||(st.phase==='playing'&&(st.elapsed||0)<25))?st.phase:null)
 const [closed,setClosed]=useState(-1)
 if(!s||closed===run)return null
 return <aside className={glass({depth:2,tone:'super'},'ct-coach ct-briefing ct-panel')} role="note" aria-labelledby="ct-briefing-title">
  <span className="ct-coach__step"><Icon name="warning"/></span>
  <div><span className="ct-kicker">Before you start · Asuna</span><b id="ct-briefing-title">Asuna runs past fixed defenses</b>
   <ul><li>She dashes forward every few seconds, so towers behind her stop helping.</li><li>Sell the towers she has passed and rebuild on the clearings ahead of her.</li><li>You can sell and build while paused (Space).</li></ul></div>
  <button className="ct-ghost ct-coach__skip" onClick={()=>setClosed(run)}>Got it</button>
 </aside>
}

// ---- First-encounter cards ---------------------------------------------------------------------------------------------------------
type Card={id:string;source:'boss'|'mini';kind:string}
/** The first time a telegraph appears, the game pauses for one card (glyph + at most 12 words); afterwards only glyph + verb show. */
export function useEncounters(store:SnapshotStore,seen:string[],send:(c:Command)=>void,onSeen:(id:string)=>void,enabled:boolean){
 const [card,setCard]=useState<Card|null>(null),queued=useRef(new Set<string>()),pause=usePauseFor(store,send)
 const seenRef=useRef(seen);seenRef.current=seen
 useEffect(()=>{if(!enabled)return;return store.subscribe(()=>{const st=store.get();if(!st||st.phase!=='playing')return
  const offer=(id:string,source:Card['source'],kind:string)=>{if(!id||seenRef.current.includes(id)||queued.current.has(id)||!abilityText(id).card)return;setCard(c=>{if(c)return c;queued.current.add(id);return {id,source,kind}})}
  if(st.boss&&st.boss.ability&&st.boss.castRemaining>0)offer(st.boss.ability,'boss',st.boss.kind)
  for(const m of st.minibosses||[])if(m.ability&&m.castRemaining>0&&m.visible)offer(m.ability,'mini',m.kind)})},[store,enabled])
 useEffect(()=>{if(card)pause.hold()},[card,pause])
 const dismiss=useCallback(()=>{if(!card)return;onSeen(card.id);queued.current.delete(card.id);pause.release();setCard(null)},[card,onSeen,pause])
 return {card,dismiss}
}
export function EncounterCard({card,onDismiss}:{card:Card;onDismiss:()=>void}){
 const t=abilityText(card.id),button=useRef<HTMLButtonElement>(null)
 useEffect(()=>{button.current?.focus()},[])
 return <div className="ct-encounter" role="dialog" aria-modal="true" aria-labelledby="ct-encounter-title">
  <div className={glass({depth:3,tone:'threat',wash:true,pop:'sheet'},'ct-encounter__card ct-panel')}>
   <span className="ct-encounter__glyph">{card.source==='boss'?<BossPortrait kind={card.kind}/>:null}<AbilityGlyph ability={card.id}/>{!['blind','uproot','thornwall','tithe','whiteout','crowcurse','dusk'].includes(card.id)&&<Icon name={t.icon||'warning'}/>}</span>
   <div><span className="ct-kicker">New {card.source==='boss'?'guardian cast':'miniboss power'} · game paused</span><h3 id="ct-encounter-title">{t.name}</h3><p>{t.card}</p></div>
   <button ref={button} className="ct-cta" onClick={onDismiss}>Got it<Icon name="play"/></button>
  </div>
 </div>
}

// ---- Banners and toasts ------------------------------------------------------------------------------------------------------------
/** The warning band when a guardian enters (once per guardian per run). */
export function BossWarning({store,run}:{store:SnapshotStore;run:number}){
 const boss=useSlice(store,st=>st?.boss&&st.boss.hp>0&&st.phase==='playing'?{id:st.boss.id,kind:st.boss.kind,name:st.boss.name}:null)
 const [shown,setShown]=useState<{kind:string;name:string}|null>(null),last=useRef('')
 useEffect(()=>{if(!boss)return;const key=`${run}:${boss.id}`;if(key===last.current)return;last.current=key;setShown(boss);const t=window.setTimeout(()=>setShown(null),3400);return()=>clearTimeout(t)},[boss?.id,run])
 if(!shown)return null
 return <div className={`ct-warning ct-warning--${shown.kind}`} role="status"><span className="ct-warning__band" aria-hidden="true"/><BossPortrait kind={shown.kind}/><div><span><Icon name="warning"/>Guardian incoming</span><strong>{shown.name}</strong></div></div>
}
/** The snapshot's notices, minus the ones the HUD already shows (wave numbers are on the track; the load prompt is gone). */
const quiet=/^(Choose a place|Wave \d+|Defend the carrot)$/
/** Unity's flavour lines for a cast, in plain words (changing them in CarrotGame.cs would need a player rebuild). */
const plain:Record<string,string>={'Dusk falls':'It goes dark','The eye opens':'It goes dark','The lanterns gutter':'It goes dark','The Regent takes its tithe':'Tithe took some of your coins'}
export function NoticeToast({store,forged=''}:{store:SnapshotStore;forged?:string}){
 // once the stage is won the results card speaks; a notice chip there only sat on top of the guardian's death burst
 const notice=useSlice(store,st=>st&&st.phase!=='won'?st.notice||'':'')
 const [text,setText]=useState(''),timer=useRef(0)
 // Each new notice shows for 2.6 s. The timer lives outside the effect: Unity clears its notice after about 2 s, and an effect cleanup
 // tied to the notice would cancel the timer at that moment and leave the toast up for good.
 useEffect(()=>{if(!notice||quiet.test(notice))return
  const st=store.get()
  // the guardian band already names the guardian, and the forged toast names a new Super: a notice would be a second label there
  if(st?.boss&&notice===st.boss.name)return
  if(forged&&(st?.mergeUndo||0)>0&&notice.toLowerCase().includes(forged.toLowerCase())){clearTimeout(timer.current);setText('');return}
  setText(plain[notice]||notice);clearTimeout(timer.current);timer.current=window.setTimeout(()=>setText(''),2600)},[notice,forged,store])
 useEffect(()=>()=>clearTimeout(timer.current),[])
 if(!text)return null
 return <div className="ct-toast" role="status">{text}</div>
}
/** "Flying creatures next wave": shown while the next wave containing flyers is queued (the breather, or before the first wave). */
export function AirToast({store,level,enemies,definitions}:{store:SnapshotStore;level:LevelDefinition|undefined;enemies:EnemyDefinition[]|undefined;definitions:GameDefinitions|null}){
 const s=useSlice(store,st=>st?{phase:st.phase,wave:st.wave,breather:st.nextWave>0,lvl:st.level}:null)
 const [dismissed,setDismissed]=useState('')
 const next=s?(s.phase==='ready'?1:s.wave+1):0,key=s?`${s.lvl}:${next}`:''
 const visible=!!s&&!!level&&(s.phase==='ready'||(s.phase==='playing'&&s.breather))&&next<=level.waves&&waveHasAir(level,next,enemies)&&dismissed!==key
 // shown for six seconds from the moment it appears (the breathers are 3-5 s), then out of the way of the board
 useEffect(()=>{if(!visible)return;const t=window.setTimeout(()=>setDismissed(key),6000);return()=>clearTimeout(t)},[visible,key])
 if(!s||!level)return null
 if(!visible)return null
 const firstAir=!Array.from({length:next-1},(_,i)=>i+1).some(w=>waveHasAir(level,w,enemies))
 const air=(definitions?.towers||[]).filter(t=>t.air&&t.unlock<=s.lvl).slice(0,3).map(t=>t.name)
 return <div className={glass({depth:2,tone:'ally'},'ct-air-toast ct-panel')} role="status"><Icon name="wing"/><div><b>Flying creatures next wave</b>{firstAir&&<span>Ground-only towers can’t reach them. Try {air.join(', ')}.</span>}</div><button className="ct-icon-btn" aria-label="Dismiss" onClick={()=>setDismissed(key)}><Icon name="close"/></button></div>
}
/** Super forged: the emblem, the name and the 4-second undo. */
export function ForgeToast({store,name,kind,send}:{store:SnapshotStore;name:string;kind:string;send:(c:Command)=>void}){
 const undo=useSlice(store,st=>st&&st.phase!=='won'&&st.phase!=='lost'?Math.ceil(st.mergeUndo||0):0)
 if(undo<=0)return null
 return <div className={glass({depth:2,tone:'super'},'ct-forge ct-panel')} role="status"><SuperEmblem kind={kind||'seed'}/><span className="ct-forge__text"><small>Super forged</small><b>{name||'Super tower'}</b></span><button className="ct-ghost" onClick={()=>send({type:'mergeUndo'})}><Icon name="undo"/>Undo <small>{undo}s</small></button></div>
}
/** The merge lesson (once per device, on the first fully grown tower; CarrotPage decides when). */
export function MergeTip({onDismiss}:{onDismiss:()=>void}){
 return <div className={glass({depth:2,tone:'super'},'ct-teach ct-panel')} role="status"><Icon name="merge"/><p>Two fully grown towers of the same kind can merge into one Super tower. Drag one onto the other.</p><button className="ct-icon-btn" aria-label="Dismiss merge tip" onClick={onDismiss}><Icon name="close"/></button></div>
}
