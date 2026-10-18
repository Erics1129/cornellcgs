import { useEffect, useRef } from 'react'
import type { CSSProperties } from 'react'
import type { ChallengeBoss, GameDefinitions, GameState, LevelDefinition } from '../types'
import type { RunSummary } from '../hooks/runTracker'
import { BossPortrait, TowerPortrait } from '../art'
import { formatSeconds, par as challengePar, stars } from '../challenges'
import { gradeLetters } from '../progress'
import { actions, names } from '../copy'
import { Grade, Medals } from './kit'
import { glass } from './Glass'
import { parseComposition, traitsOf } from '../waves'
import Icon from '../Icon'

const starLabels=(boss:ChallengeBoss)=>['Cleared.','Carrot unharmed.',`Under ${formatSeconds(challengePar[boss])}.`]
/** Level names come from the game data; a dash in one (level 29 has an em dash) reads as a middle dot here. */
const plainName=(name:string)=>(name||'').replace(/\s*[\u2013\u2014]\s*/g,' · ')
const towerName=(d:GameDefinitions|null,id:string)=>d?.towers.find(t=>t.id===id)?.name||id
const airTowers=(d:GameDefinitions|null,level:number)=>(d?.towers||[]).filter(t=>t.air&&t.unlock<=level).map(t=>t.name)
/**
 * Why hearts were lost, in words the player can act on. v2 builds report lossCauses (kind, route, wave, whether no air tower covered it,
 * and a counter tower); against a v1 build the waves where hearts fell are read against their compositions.
 */
export function lossAdvice(state:GameState,level:LevelDefinition|undefined,d:GameDefinitions|null,lostByWave:number[]):string[]{
 const out:string[]=[],route=(r:number)=>'ABCDE'[r]||String(r+1)
 if(state.lossCauses?.length){
  for(const c of state.lossCauses.slice(0,2)){const name=traitsOf(c.kind,d?.enemies).name,plural=c.count>1?`${name}s`:name
   out.push(`${plural} on route ${route(c.route)}${c.airUncovered?': no air towers in range':''}. Try ${towerName(d,c.counter)}.`)}
  return out
 }
 const waves=lostByWave.map((n,w)=>({w,n:n||0})).filter(x=>x.n>0).sort((a,b)=>b.n-a.n).slice(0,2)
 for(const {w} of waves){
  const parts=parseComposition(level?.waveCompositions?.[w-1]),t=parts.map(p=>({...p,t:traitsOf(p.kind,d?.enemies,state.boss?.name)}))
  const air=t.find(p=>p.t.air),boss=t.find(p=>p.t.boss),armor=t.find(p=>p.t.armor),shield=t.find(p=>p.t.shield),fast=t.find(p=>p.t.fast)
  if(boss)out.push(`Wave ${w}: the guardian reached the carrot. Watch its casts on the boss bar.`)
  else if(air)out.push(`Wave ${w}: ${air.t.name}s fly. Air-capable towers cover them: ${airTowers(d,state.level).slice(0,3).join(', ')}.`)
  else if(armor)out.push(`Wave ${w}: ${armor.t.name}s are armored. Prism, Storm Bell and Thunderhead cut through.`)
  else if(shield)out.push(`Wave ${w}: ${shield.t.name}s carry shields. Slow them with Frost, then burst them.`)
  else if(fast)out.push(`Wave ${w}: ${fast.t.name}s are fast. Cover the last bend before the carrot.`)
  else if(parts.length)out.push(`Wave ${w}: ${parts.reduce((s,p)=>s+p.n,0)} creatures. Upgrade the towers that cover the most path.`)
 }
 return out
}
const adaptiveTips=['Upgrades usually beat new Tier I towers: a Tier III covers more path for the coins.','Build where two paths meet: one tower covers both routes.','Clear scenery early: it pays coins and opens new clearings.','Send waves early only when the last one was stopped far from the carrot.']

export function Results({state,level,definitions,summary,grade,previousGrade,challengeBoss,losses,onNext,onRetry,onSelect,onChallenges,onDock}:{state:GameState;level:LevelDefinition|undefined;definitions:GameDefinitions|null;summary:RunSummary;grade:number;previousGrade:number;challengeBoss:ChallengeBoss|null;losses:number;onNext:()=>void;onRetry:()=>void;onSelect:()=>void;onChallenges:()=>void;onDock?:(rect:DOMRect|null)=>void}){
 const card=useRef<HTMLElement>(null)
 // On open: the primary action takes focus (the card is a dialog), and the camera learns the card's rectangle so the victory shot
 // frames the carrot in the free space above it.
 useEffect(()=>{const node=card.current;if(!node)return;node.querySelector<HTMLButtonElement>('.ct-results__actions .ct-cta')?.focus({preventScroll:true});onDock?.(node.getBoundingClientRect());return()=>onDock?.(null)},[onDock])
 const won=state.phase==='won',seconds=typeof state.elapsed==='number'?state.elapsed:0
 const parTime=challengeBoss?challengePar[challengeBoss]:level?.par
 const medal=challengeBoss?stars({cleared:won,health:state.health,seconds:won?seconds:Infinity,towers:0},challengeBoss):won?1|(state.health===10?2:0)|(state.blockersRemaining===0?4:0):0
 const waves=state.waves,lost=Array.from({length:waves},(_,i)=>summary.lostByWave[i+1]||0),maxLost=Math.max(1,...lost)
 const dmg=(state.stats?.dmgKinds||[]).map((k,i)=>({k,v:state.stats!.dmgValues[i]||0})).sort((a,b)=>b.v-a.v).slice(0,5),maxDmg=Math.max(1,...dmg.map(x=>x.v))
 const leakKinds=(state.stats?.leakKinds||[]).map((k,i)=>({k,n:state.stats!.leakCounts[i]||0})).filter(x=>x.n>0).sort((a,b)=>b.n-a.n)
 const advice=won?[]:lossAdvice(state,level,definitions,summary.lostByWave)
 const tip=!won&&losses>=2?adaptiveTips[(state.level+losses)%adaptiveTips.length]:''
 // "New best" marks a better grade on a win; a failed run's grade is still recorded, without the tag
 const newBest=won&&grade>previousGrade&&grade>0
 const title=challengeBoss?won?'Guardian defeated':'Challenge failed':won?state.level===24?'Campaign complete':'Stage clear':'Stage failed'
 const letter=gradeLetters[grade]||''
 const heartsLost=lost.reduce((s,n)=>s+n,0)
 return <section ref={card} className={glass({depth:3,blur:true,tone:won?undefined:'leak'},'ct-results',won?'is-won':'is-lost')} role="dialog" aria-modal="false" aria-labelledby="ct-results-title">
  {won&&<i className="ct-results__sweep" aria-hidden="true"/>}
  <div className="ct-results__scroll">
   <div className="ct-results__hero">
    <div className={`ct-results__medal ${letter?`is-${letter.toLowerCase()}`:'is-none'}`}>
     <Grade value={grade} size="xl" label={grade?`Grade ${letter}`:'No grade'}/>
     {challengeBoss?<span className={`ct-results__boss ${won?'is-beaten':''}`} aria-hidden="true"><BossPortrait kind={challengeBoss}/>{won&&<Icon name="check"/>}</span>:null}
    </div>
    <div className="ct-results__head">
     <span className="gl-label ct-results__kicker"><b className="gl-num">{String(state.level).padStart(2,'0')}</b>{plainName(state.name)}</span>
     <h2 id="ct-results-title">{title}</h2>
     <div className="ct-results__medals"><Medals value={medal} labels={challengeBoss?starLabels(challengeBoss):undefined} icons={challengeBoss?['check','heart','star']:undefined}/>{newBest&&<span className="ct-tag is-best">New best</span>}</div>
    </div>
   </div>
   <dl className="ct-results__stats">
    <div className="gl-fill"><dt className="gl-label">Hearts</dt><dd className="gl-num">{state.health}<small>/10</small></dd></div>
    <div className="gl-fill"><dt className="gl-label">Time</dt><dd className="gl-num">{formatSeconds(seconds)}{parTime?<small className="ct-results__par">par {formatSeconds(parTime)}</small>:null}</dd></div>
    <div className="gl-fill"><dt className="gl-label">Chain</dt><dd className="gl-num">×{summary.bestChain}</dd></div>
    <div className="gl-fill"><dt className="gl-label">Coins left</dt><dd className="gl-num">{state.coins.toLocaleString()}</dd></div>
   </dl>
   {(waves>1||dmg.length>0)&&<div className="ct-results__detail">
    {waves>1&&<div className="ct-spark">
     <span className="gl-label">Hearts lost by wave{heartsLost?<b className="gl-num"> · {heartsLost}</b>:null}</span>
     <span className="ct-spark__bars gl-well" role="img" aria-label={`Hearts lost per wave: ${lost.map((n,i)=>n?`wave ${i+1}, ${n}`:'').filter(Boolean).join('; ')||'none'}`}>{lost.map((n,i)=><i key={i} className={n?'is-lost':''} style={{'--h':n?.3+.7*n/maxLost:0,'--i':i} as CSSProperties} title={`Wave ${i+1}: ${n}`}/>)}</span>
     {leakKinds.length>0&&<p className="ct-results__line"><Icon name="warning"/>Leaks: {leakKinds.slice(0,4).map(x=>`${traitsOf(x.k,definitions?.enemies).name} ×${x.n}`).join(', ')}</p>}
    </div>}
    {dmg.length>0&&<ul className="ct-results__damage" aria-label="Top damage by tower">{dmg.map((x,i)=><li key={x.k} style={{'--i':i} as CSSProperties}><TowerPortrait kind={x.k}/><span>{towerName(definitions,x.k)}</span><span className="gl-meter gl--ally"><i style={{'--v':(x.v/maxDmg).toFixed(3)} as CSSProperties}/></span><b className="gl-num">{Math.round(x.v).toLocaleString()}</b></li>)}</ul>}
   </div>}
   {advice.length>0&&<ul className="ct-results__advice">{advice.map(a=><li key={a} className="gl-fill"><span className="ct-results__advice-icon" aria-hidden="true"><Icon name="warning"/></span>{a}</li>)}</ul>}
   {tip&&<p className="ct-results__tip gl-fill"><b className="gl-label">Tip</b>{tip}</p>}
  </div>
  <div className="ct-results__actions">
   {challengeBoss?<><button className="ct-cta" onClick={onChallenges}>{names.challengesShort}<Icon name="arrow"/></button><button className="ct-ghost" onClick={onRetry}><Icon name="restart"/>{actions.playAgain}</button></>
   :won&&state.level<24?<><button className="ct-cta" onClick={onNext}>{actions.nextStage}<Icon name="arrow"/></button><button className="ct-ghost" onClick={onRetry}><Icon name="restart"/>{actions.retry}</button><button className="ct-ghost" onClick={onSelect}><Icon name="levels"/>{names.stages}</button></>
   :<><button className="ct-cta" onClick={onRetry}><Icon name="restart"/>{won?actions.playAgain:actions.retry}</button><button className="ct-ghost" onClick={onSelect}><Icon name="levels"/>{names.stages}</button></>}
  </div>
 </section>
}
