import { memo, useEffect, useMemo, useRef } from 'react'
import type { EnemyDefinition, LevelDefinition } from '../types'
import type { SnapshotStore } from '../hooks/useSnapshot'
import { useSlice } from '../hooks/useSnapshot'
import { trackPlan, waveFlags } from '../waves'
import type { Note } from '../waves'
import { CreaturePortrait } from '../art'
import Icon from '../Icon'
import { formatSeconds } from '../challenges'
import { bandTone, levelBand } from './LevelSelect'

/** Game seconds the track shows ahead of the judgement line. */
export const TrackWindow=20
/** The judgement line's distance from the rail's left edge, and a note head's size (px; the CSS uses the same numbers). */
const JudgeOffset=18
const routeLetters='ABCDE'
/** The badges on a note: every colour on the track has an icon twin. */
function Badges({n}:{n:Note}){
 const t=n.traits
 return <span className="ct-note__badges">{t.boss&&<i className="is-boss" title="Guardian"><Icon name="skull"/></i>}{t.mini&&<i className="is-mini" title="Miniboss"><Icon name="crown"/></i>}{t.air&&<i className="is-air" title="Flying"><Icon name="wing"/></i>}{t.armor&&<i title="Armored"><Icon name="shield"/></i>}{t.shield&&<i title="Shielded"><Icon name="hex"/></i>}{t.heal&&<i title="Healer"><Icon name="cross"/></i>}</span>
}
const NoteView=memo(function NoteView({n,unseen,register}:{n:Note;unseen:boolean;register:(key:string,el:HTMLDivElement|null)=>void}){
 const t=n.traits
 return <div className={`ct-note ${t.air?'is-air':''} ${t.mini?'is-mini':''} ${t.boss?'is-boss':''} ${unseen?'is-new':''}`} data-route={n.route} data-kind={n.kind} data-key={n.key} ref={el=>register(n.key,el)}>
  <span className="ct-note__tail"/>
  <span className="ct-note__head">{t.boss?<Icon name="skull"/>:<CreaturePortrait kind={n.kind} fallback/>}</span>
  <span className="ct-note__label"><b>{n.n>1?`×${n.n}`:t.boss?'BOSS':t.mini?'MINI':'×1'}</b><Badges n={n}/></span>
  {unseen&&<span className="ct-note__new" title="New creature"/>}
 </div>
})

export function WaveTrack({store,level,enemies,seen,reduced,compact}:{store:SnapshotStore;level:LevelDefinition|undefined;enemies:EnemyDefinition[]|undefined;seen:string[];reduced:boolean;compact:boolean}){
 const s=useSlice(store,st=>st?{phase:st.phase,wave:st.wave,waves:st.waves,level:st.level,name:st.name,incomingKey:st.incoming?JSON.stringify(st.incoming):'',hasWaveElapsed:typeof st.waveElapsed==='number',breather:st.nextWave>0,bossName:st.boss?.name||level?.bossName||''}:null)
 const status=useSlice(store,st=>st?{next:st.nextWave>0?Math.ceil(st.nextWave):0,enemies:st.enemyCount,progress:Math.round((st.progress||0)*1000)/1000,elapsed:st.level===29?Math.floor(st.elapsed||0):0}:null)
 const plan=useMemo(()=>s?trackPlan({phase:s.phase,wave:s.wave,waves:s.waves,nextWave:s.breather?1:0,incoming:s.incomingKey?store.get()?.incoming:undefined,waveElapsed:s.hasWaveElapsed?0:undefined},level,enemies,s.bossName):null,
  // the plan only changes with the wave, the phase, the breather and the incoming list (compared by content)
  [s?.phase,s?.wave,s?.waves,s?.breather,s?.incomingKey,level,enemies,s?.bossName,s?.hasWaveElapsed,store])
 const flags=useMemo(()=>level?waveFlags(level,enemies):[],[level,enemies])
 const routes=Math.max(1,level?.routes?.length||1),lanes=compact?1:routes
 const rail=useRef<HTMLDivElement>(null),beats=useRef<HTMLDivElement>(null),hits=useRef<Array<HTMLElement|null>>([]),crossed=useRef(new Set<string>()),nodes=useRef(new Map<string,HTMLDivElement>()),shown=useRef(new Map<string,number>())
 const notes=useMemo(()=>plan?[...plan.current,...plan.next]:[],[plan])
 const nextKeys=useMemo(()=>new Set(plan?.next.map(n=>n.key)),[plan])
 const register=useMemo(()=>(key:string,el:HTMLDivElement|null)=>{if(el)nodes.current.set(key,el);else nodes.current.delete(key)},[])
 // a new run (the ready phase) replays its notes from scratch: forget which ones already pulsed the line and where they were drawn
 useEffect(()=>{if(s?.phase==='ready'){crossed.current.clear();shown.current.clear()}},[s?.phase,s?.level])
 // rAF: notes slide right to left and reach the judgement line at the moment their first creature spawns
 useEffect(()=>{
  let raf=0,HeadSize=0
  const resize=new ResizeObserver(()=>{HeadSize=0});if(rail.current)resize.observe(rail.current)
  const frame=()=>{
   raf=requestAnimationFrame(frame)
   const box=rail.current;if(!box)return
   if(!HeadSize)HeadSize=parseFloat(getComputedStyle(box).getPropertyValue('--head'))||28
   const width=box.clientWidth,clock=store.clock(),st=store.get();if(!st)return
   const judge=JudgeOffset,px=(width-judge)/TrackWindow,breather=st.nextWave>0
   // bar lines every 5 game seconds scroll with the clock (a static line under reduced motion)
   if(beats.current){const measure=5*px;beats.current.style.setProperty('--measure',`${measure.toFixed(1)}px`);beats.current.style.transform=reduced?'none':`translate3d(${(-((clock.elapsed%5)*px)+judge%measure).toFixed(1)}px,0,0)`}
   for(const n of notes){
    const el=nodes.current.get(n.key);if(!el)continue
    const isNext=nextKeys.has(n.key)
    // until the note's first spawn, in game seconds; queued notes (the ready phase, or a wave still in flight) park in view, unmoving
    const until=isNext?(breather?clock.nextWave+n.at:st.phase==='ready'?2.5+n.at:TrackWindow*.7+Math.min(n.at,16)*.32):n.at-clock.waveElapsed
    const target=until*px
    let x=shown.current.get(n.key)
    if(x===undefined||reduced||Math.abs(target-x)<1.5)x=target;else x+=(target-x)*.22
    shown.current.set(n.key,x)
    const tail=n.span*px,gone=judge+x+tail<-HeadSize,ahead=judge+x-HeadSize/2>width+4
    el.style.transform=`translate3d(${(judge+x-HeadSize/2).toFixed(1)}px,0,0)`
    el.style.setProperty('--tail',`${Math.max(0,tail).toFixed(1)}px`)
    const hidden=gone||ahead
    if(el.dataset.hidden!==(hidden?'1':'0')){el.dataset.hidden=hidden?'1':'0'}
    const live=x<=0&&!gone;if(el.dataset.live!==(live?'1':'0'))el.dataset.live=live?'1':'0'
    // a short pulse on the lane's judgement mark when the packet's first creature spawns (opacity only under reduced motion)
    if(x<=0&&!isNext&&!crossed.current.has(n.key)){crossed.current.add(n.key);if(x>-px*.5){const hit=hits.current[lanes>1?n.route%lanes:0];hit?.animate(reduced?[{opacity:.9},{opacity:0}]:[{opacity:1,transform:'scaleY(1.6)'},{opacity:0,transform:'scaleY(1)'}],{duration:reduced?200:320,easing:'ease-out'})}}
   }
  }
  raf=requestAnimationFrame(frame)
  return()=>{cancelAnimationFrame(raf);resize.disconnect()}
 },[notes,nextKeys,store,reduced,lanes])
 if(!s||!status)return null
 const asuna=s.level===29,label=asuna?`Encounter, ${formatSeconds(status.elapsed)}`:`Wave ${Math.max(0,s.wave)} of ${s.waves}`
 const upcoming=(plan?.next.length?plan.next:plan?.current||[]).slice(0,4).map(n=>`${n.n} ${n.traits.name}${n.traits.air?' (flying)':''}${n.traits.boss?' (guardian)':''} on route ${routeLetters[n.route]||n.route+1}`).join(', ')
 return <section className={`ct-track ct-panel ${compact?'is-compact':''}`} aria-label={`${s.name}. ${label}.${upcoming?` ${plan?.next.length?'Next':'Now'}: ${upcoming}.`:''}`} data-lanes={lanes}>
  <header className="ct-track__head">
   <span className="ct-track__no" aria-hidden="true">{String(s.level).padStart(2,'0')}</span>
   <strong className="ct-track__name">{s.name}</strong>
   {level&&<span className={`ct-band ct-track__band is-${bandTone(levelBand(level))}`}>{levelBand(level)}</span>}
   <span className="ct-track__wave" aria-hidden="true">{asuna?<><small>T+</small>{formatSeconds(status.elapsed)}</>:<><small>WAVE</small>{String(Math.max(1,s.wave)).padStart(2,'0')}<small>/{String(s.waves).padStart(2,'0')}</small></>}</span>
   <span className="ct-track__status" role="status">{s.phase==='ready'?'READY':status.next>0?<>NEXT <b>{status.next}s</b></>:s.phase==='playing'?<><b>{status.enemies}</b> ON PATH</>:''}</span>
  </header>
  <div className="ct-track__progress" tabIndex={0} role="progressbar" aria-label="Level progress" aria-valuemin={0} aria-valuemax={100} aria-valuenow={Math.round(status.progress*100)}>
   <i className="ct-track__fill" style={{transform:`scaleX(${status.progress})`}}/>
   {flags.map(f=><i key={f.wave} className={`ct-track__flag is-${f.kind}`} style={{left:`${f.at*100}%`}} title={f.kind==='boss'?`Guardian in wave ${f.wave}`:`Miniboss in wave ${f.wave}`}/>)}
  </div>
  <div className="ct-track__lanes" aria-hidden="true">
   {Array.from({length:lanes},(_,i)=><div className="ct-lane" key={i} data-route={i}><b className="ct-lane__tag">{compact?'◆':routeLetters[i]}</b></div>)}
   <div className="ct-track__rail" ref={rail}>
    <div className="ct-track__beats" ref={beats}/>
    {notes.map(n=><div className="ct-note-row" key={n.key} style={{top:`${(compact?0:n.route%lanes)*100/lanes}%`,height:`${100/lanes}%`}}><NoteView n={n} unseen={!n.traits.boss&&!seen.includes(n.kind)} register={register}/></div>)}
    <i className="ct-track__judge"/>
    {Array.from({length:lanes},(_,i)=><i key={i} className="ct-track__hit" data-route={i} ref={el=>{hits.current[i]=el}} style={{top:`${i*100/lanes}%`,height:`${100/lanes}%`}}/>)}
   </div>
  </div>
 </section>
}
