import { useEffect, useRef, useState, useSyncExternalStore } from 'react'
import type { SnapshotStore } from '../hooks/useSnapshot'
import { useSlice } from '../hooks/useSnapshot'
import type { RunTracker, JudgementEvent } from '../hooks/runTracker'
import { Counter } from './kit'
import { glass } from './Glass'
import { CarrotFace, PhonePortrait, carrotPose, useMedia } from './hudKit'
import Icon from '../Icon'
import { abilityText } from '../abilities'
import { actions } from '../copy'
import { flashActiveUntil, requestFlash } from '../flash'
import { audioBus } from '../volume'

const cx=(...parts:Array<string|false|null|undefined>)=>parts.filter(Boolean).join(' ')

/**
 * Coins, the carrot's ten hearts and the chain, each a glass pill (one shared pill on phone portrait). A bitten heart flashes #FF9393
 * then #FF5D5D and empties after 500 ms, and the carrot's face winces for the same 500 ms.
 */
export function StatusPanel({store,reduced,tracker}:{store:SnapshotStore;reduced:boolean;tracker:RunTracker}){
 const s=useSlice(store,st=>st?{coins:st.coins,health:Math.max(0,Math.min(10,st.health))}:null)
 const phone=useMedia(PhonePortrait)
 const [delta,setDelta]=useState<{n:number;id:number}|null>(null),last=useRef<number|null>(null),acc=useRef({n:0,at:0,id:0}),chip=useRef<HTMLSpanElement>(null)
 const [hit,setHit]=useState<number[]>([]),prevHealth=useRef<number|null>(null)
 useEffect(()=>{if(!s)return
  if(last.current!==null&&s.coins!==last.current){const now=performance.now(),d=s.coins-last.current
   // one chip at a time: changes within 600 ms add up instead of stacking chips
   if(now-acc.current.at<600&&Math.sign(acc.current.n)===Math.sign(d))acc.current={n:acc.current.n+d,at:now,id:acc.current.id};else acc.current={n:d,at:now,id:acc.current.id+1}
   setDelta({n:acc.current.n,id:acc.current.id})}
  last.current=s.coins},[s?.coins])
 useEffect(()=>{const el=chip.current;if(!el||!delta)return
  el.getAnimations().forEach(a=>a.cancel())
  el.animate(reduced?[{opacity:1},{opacity:0}]:[{opacity:0,transform:'translateY(5px) scale(.9)'},{opacity:1,transform:'none',offset:.18},{opacity:0,transform:'translateY(-9px)'}],{duration:reduced?250:760,easing:'cubic-bezier(.23,1,.32,1)',fill:'forwards'})
 },[delta?.id,delta?.n,reduced])
 useEffect(()=>{if(!s)return;const before=prevHealth.current;prevHealth.current=s.health
  if(before!==null&&s.health<before){const lost=Array.from({length:before-s.health},(_,i)=>s.health+i);setHit(lost);const t=window.setTimeout(()=>setHit([]),reduced?0:500);return()=>clearTimeout(t)}
 },[s?.health,reduced])
 if(!s)return null
 // each pill catches its own coloured light (the rim's lower bounce and the glow from below): gold, green, red when the carrot is low
 const low=s.health<=3,pill=(tone:'coin'|'grow'|'leak')=>glass({depth:1,pill:true,tone})
 return <div className={cx('ct-status',low&&'is-low',phone&&pill('coin'))}>
  <div className={cx('ct-stat ct-stat--coins',!phone&&pill('coin'))} aria-label={`${s.coins} coins`} role="group">
   <i className="ct-coin" aria-hidden="true"><Icon name="coin"/></i>
   <Counter value={s.coins} ghost="0000" className="ct-counter--coins" reduced={reduced} flashId="coins"/>
   <span className={cx('ct-delta',delta&&delta.n<0&&'is-spend')} ref={chip} aria-hidden="true">{delta?(delta.n>0?'+':'−')+Math.abs(delta.n):''}</span>
  </div>
  <div className={cx('ct-stat ct-stat--hearts',!phone&&pill(low?'leak':'grow'))} role="img" aria-label={`Carrot health ${s.health} of 10`}>
   <CarrotFace pose={carrotPose(s.health,hit.length>0)}/>
   <span className="ct-hp" aria-hidden="true">{Array.from({length:10},(_,i)=><i key={i} className={i<s.health?'is-full':hit.includes(i)?'is-hit':''}/>)}</span>
   <b className="ct-hp-num" aria-hidden="true">{s.health}</b>
   {low&&<i className="ct-stat__alarm" aria-hidden="true"/>}
  </div>
  <Chain tracker={tracker} reduced={reduced}/>
 </div>
}

/** The chain: consecutive leak-free waves and guardian phases. It pops only when it grows and runs a 2 s break when a leak ends it. */
export function Chain({tracker,reduced}:{tracker:RunTracker;reduced:boolean}){
 const chain=useSyncExternalStore(tracker.subscribe,()=>tracker.chain().value)
 const best=useSyncExternalStore(tracker.subscribe,()=>tracker.chain().best)
 const el=useRef<HTMLSpanElement>(null),prev=useRef(chain)
 useEffect(()=>{const node=el.current;const before=prev.current;prev.current=chain;if(!node||before===chain)return
  if(chain>before&&!reduced)node.animate([{transform:'scale(1.25)'},{transform:'scale(1)'}],{duration:520,easing:'cubic-bezier(.23,1,.32,1)'})
  if(chain<before&&before>0)node.animate(reduced?[{opacity:.4},{opacity:1}]:[{color:'#FF8F8F',transform:'scale(.82)'},{color:'#FF8F8F',offset:.15},{transform:'scale(1)'}],{duration:reduced?250:2000,easing:'cubic-bezier(.23,1,.32,1)'})
 },[chain,reduced])
 return <div className={glass({depth:1,pill:true},'ct-chain',chain>0&&'is-live')} aria-label={`Defense chain ${chain}. Best ${best}.`} role="group">
  <Icon name="chain"/><span className="ct-chain__label" aria-hidden="true">Chain</span><span className="ct-chain__value" ref={el} aria-hidden="true"><small>×</small><b>{chain}</b></span>
 </div>
}

const judgementWords:Record<string,{word:string;tone:string;sub:(j:JudgementEvent)=>string}>={
 flawless:{word:'Flawless',tone:'flawless',sub:j=>`Wave ${j.wave} · no leaks`},
 clear:{word:'Clear',tone:'clear',sub:j=>`Wave ${j.wave} cleared`},
 leak:{word:'Leak',tone:'leak',sub:j=>j.value>1?`Carrot bitten ×${j.value}`:'Carrot bitten'},
 phaseBreak:{word:'Phase break',tone:'phase',sub:j=>`Guardian phase ${Math.max(2,j.value||2)}`},
 superForged:{word:'Super forged',tone:'super',sub:()=>'Two towers merged'},
 saved:{word:'Saved',tone:'saved',sub:()=>'Sold before Uproot landed'},
}
/**
 * One judgement slot: a new word replaces the old. osu! Argon timing (1.6 to 1 in 100 ms, then a slow grow and fade); the word is a
 * glossy, tone-tinted display word with its own soft shadow, and the line under it is a small glass pill.
 */
export function Judgement({tracker,reduced,waves=0}:{tracker:RunTracker;reduced:boolean;waves?:number}){
 const j=useSyncExternalStore(tracker.subscribe,()=>tracker.judgement())
 const word=useRef<HTMLSpanElement>(null),sub=useRef<HTMLSpanElement>(null),[spoken,setSpoken]=useState(""),lastSpoken=useRef(-Infinity)
 const shownId=useRef(j?.id||0),fadeTimer=useRef(0),holdTimer=useRef(0)
 useEffect(()=>()=>{clearTimeout(fadeTimer.current);clearTimeout(holdTimer.current)},[])
 useEffect(()=>{if(!j||j.id===shownId.current)return;shownId.current=j.id
  const w=word.current,s=sub.current;if(!w||!s)return
  for(const a of [...w.getAnimations(),...s.getAnimations()])a.cancel()
  clearTimeout(fadeTimer.current);clearTimeout(holdTimer.current)
  // The last wave's word waits 400 ms: the guardian's death burst (or the final clear) is read first, then the verdict.
  const finale=!reduced&&waves>0&&j.wave>=waves&&(j.kind==='flawless'||j.kind==='clear')
  if(finale){w.style.opacity='0';s.style.opacity='0';holdTimer.current=window.setTimeout(()=>{w.style.opacity='';s.style.opacity='';play()},400)}else play()
  function play(){if(!w||!s)return
  if(reduced){
   // reduced motion: opacity only, each change 250 ms or less
   for(const n of [w,s])n.animate([{opacity:0},{opacity:1}],{duration:200,fill:'forwards'})
   fadeTimer.current=window.setTimeout(()=>{for(const n of [w,s])n.animate([{opacity:1},{opacity:0}],{duration:250,fill:'forwards'})},1200)
  }
  else{
   w.animate([{transform:'scale(1.6)',opacity:0},{transform:'scale(1)',opacity:1,offset:.055,easing:'cubic-bezier(.22,1,.36,1)'},{transform:'scale(1.06)',opacity:1,offset:.55},{transform:'scale(1.16)',opacity:0}],{duration:1800,easing:'linear',fill:'forwards'})
   s.animate([{opacity:0,transform:'translateY(8px) scale(.94)'},{opacity:1,transform:'none',offset:.16},{opacity:1,offset:.62},{opacity:0,transform:'translateY(-4px)'}],{duration:1600,easing:'cubic-bezier(.23,1,.32,1)',fill:'forwards'})
  }
  }
  // screen readers hear at most one judgement every 2 s
  const now=performance.now();if(now-lastSpoken.current>=2000){lastSpoken.current=now;setSpoken(judgementWords[j.kind]?.word||'')}
 },[j,reduced,waves])
 const meta=j?judgementWords[j.kind]:null
 return <div className={`ct-judge is-${meta?.tone||'clear'}`} aria-hidden={false}>
  <span className="ct-judge__word" ref={word} data-word={meta?.word||''} aria-hidden="true">{meta?.word||''}</span>
  <span className={glass({depth:1,pill:true},'ct-judge__sub')} ref={sub} aria-hidden="true">{j&&meta?meta.sub(j):''}</span>
  <span className="ct-sr" aria-live="polite">{spoken}</span>
 </div>
}

/**
 * Edge-only red vignette on a bite (never full screen): 600 ms, and a retrigger while lit extends it instead of strobing. A request the
 * governor caps (three large flashes already started this second) never plays. Reduced motion: a steady low tint (35%, no rise) held
 * at least 900 ms, so a run of bites reads as one lasting glow, never as more flashes than full motion.
 */
export function Vignette({store,reduced}:{store:SnapshotStore;reduced:boolean}){
 const health=useSlice(store,st=>st?.health??10),prev=useRef(health),el=useRef<HTMLDivElement>(null),raf=useRef(0)
 useEffect(()=>{const before=prev.current;prev.current=health;if(health>=before)return
  const node=el.current;if(!node)return
  const mode=requestFlash('vignette',reduced?900:600,true)
  // 'extend': either the running glow reads the later end on its next frame, or the governor capped this one; neither starts a flash
  if(mode==='extend')return
  cancelAnimationFrame(raf.current)
  const t0=performance.now(),rise=reduced?0:90,peak=reduced?.35:.9,fade=reduced?250:420
  const step=(now:number)=>{const until=flashActiveUntil('vignette')
   const a=now-t0<rise?(now-t0)/rise:now<until-fade?1:Math.max(0,(until-now)/fade)
   node.style.opacity=String(a*peak);if(now<until)raf.current=requestAnimationFrame(step);else{node.style.opacity='0';raf.current=0}}
  raf.current=requestAnimationFrame(step)
 },[health,reduced])
 useEffect(()=>()=>cancelAnimationFrame(raf.current),[])
 return <div className="ct-vignette" ref={el} aria-hidden="true"/>
}

/**
 * The wave track's lights breathe with the music's beat when the audio bus reports a stable tempo (off under reduced motion). The
 * value goes only onto the few [data-beat] lights inside the target, never onto the target itself, so a beat restyles those leaves and
 * not the whole track.
 */
export function useBeatGlow(target:React.RefObject<HTMLElement|null>,reduced:boolean,active:boolean){
 useEffect(()=>{if(reduced||!active)return;let raf=0,timer=0,last=-1,live=true
  const lights=()=>[...(target.current?.querySelectorAll<HTMLElement>('[data-beat]')||[])]
  const write=(v:number)=>{for(const n of lights())n.style.setProperty('--beat',String(v))}
  const frame=()=>{if(!live)return;const bus=audioBus(),node=target.current
   // no bus (or no stable tempo): look again in a second instead of running a frame loop
   if(!bus||!node){if(last!==0&&node){write(0);last=0}timer=window.setTimeout(frame,1000);return}
   const v=Math.round((1-Math.min(1,bus.beatPhase()*2.5))*15)/100
   if(v!==last){last=v;write(v)}
   raf=requestAnimationFrame(frame)}
  frame();return()=>{live=false;cancelAnimationFrame(raf);clearTimeout(timer);write(0)}},[target,reduced,active])
}

/**
 * Top-right controls in two glass docks: the game (speed, pause) and the page (sound, full screen, stages, settings). Phone landscape
 * stacks them in the right rail; phone portrait keeps speed, pause and settings beside the coins. Speed reads "1× Held" (a pill) while
 * a guardian cast holds the game at 1×.
 */
export function Controls({store,send,sound,expanded,onSound,onFullscreen,onSettings,onStages}:{store:SnapshotStore;send:(c:{type:string;[k:string]:string|number|boolean})=>void;sound:boolean;expanded:boolean;onSound:()=>void;onFullscreen:()=>void;onSettings:()=>void;onStages:()=>void}){
 const s=useSlice(store,st=>st?{paused:st.paused,speed:st.speed,hold:!!st.speedHold,reason:st.speedHoldReason||'',phase:st.phase}:null)
 if(!s)return null
 const playing=s.phase==='playing',why=s.reason?abilityText(s.reason).name:'a guardian cast'
 const dock=glass({depth:1,pill:true},'ct-dock')
 return <div className="ct-controls" data-top>
  <div className={dock}>
   <button className={cx('ct-icon-btn ct-speed',s.hold&&'is-hold',s.speed>1&&'is-fast')} disabled={!playing} onClick={()=>send({type:'speed',value:s.speed>1?1:2})} aria-label={s.hold?`Speed held at 1× while ${why} winds up. Selected ${s.speed}×.`:`Game speed ${s.speed}×. Change speed.`}>
    {s.hold?<><b>1×</b><small>Held</small></>:<b>{s.speed>1?'2×':'1×'}</b>}
   </button>
   <button className="ct-icon-btn" disabled={!playing} onClick={()=>send({type:'pause'})} aria-label={s.paused?'Resume':'Pause'}><Icon name={s.paused?'play':'pause'}/></button>
  </div>
  <div className={cx(dock,'ct-dock--page')}>
   <button className="ct-icon-btn is-wide-only" onClick={onSound} aria-label={sound?'Mute sound':'Enable sound'}><Icon name={sound?'sound':'mute'}/></button>
   <button className="ct-icon-btn is-wide-only ct-fullscreen" onClick={onFullscreen} aria-label={expanded?'Exit full screen':'Full screen'}><Icon name="full"/></button>
   <button className="ct-icon-btn is-wide-only" onClick={onStages} aria-label="Stage select"><Icon name="levels"/></button>
   <button className="ct-icon-btn" onClick={onSettings} aria-label="Settings"><Icon name="sliders"/></button>
  </div>
 </div>
}

/** Bottom of the board: Start wave (ready), Send now during a breather, and help. */
export function BottomBar({store,send,onHelp,startSpotlight,earlyBonusCap=6}:{store:SnapshotStore;send:(c:{type:string;[k:string]:string|number|boolean})=>void;onHelp:()=>void;startSpotlight:boolean;earlyBonusCap?:number}){
 const s=useSlice(store,st=>st?{phase:st.phase,next:st.nextWave>0?Math.floor(st.nextWave):-1,level:st.level,paused:st.paused}:null)
 if(!s)return null
 const bonus=Math.max(0,Math.min(earlyBonusCap,s.next))
 return <div className="ct-bottom" data-bottom>
  <button className="ct-icon-btn ct-help-btn is-wide-only" onClick={onHelp} aria-label="How to play"><Icon name="help"/></button>
  <div className="ct-bottom__center">
   {s.phase==='ready'&&<><span className={glass({depth:1,pill:true},'ct-hint')}><Icon name="tap"/>Tap a clearing to build</span><button className={cx('ct-cta ct-start',startSpotlight&&'is-spotlight')} onClick={()=>send({type:'start'})}>{s.level===29?actions.startFight:actions.startWave}<Icon name="play"/></button></>}
   {s.phase==='playing'&&s.next>=0&&!s.paused&&<button className="ct-ghost ct-send" onClick={()=>send({type:'next'})} aria-label={`Send the next wave now${bonus?` for ${bonus} bonus coins`:''}`}>{actions.sendNow}{bonus>0&&<span className="ct-send__bonus"><Icon name="coin"/>+{bonus}</span>}<Icon name="fast"/></button>}
  </div>
 </div>
}
