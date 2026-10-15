import type { ChallengeBoss, GameDefinitions, GameState, LevelDefinition } from '../types'
import type { RunSummary } from '../hooks/runTracker'
import { BossPortrait, TowerPortrait } from '../art'
import { formatSeconds, par as challengePar, stars } from '../challenges'
import { gradeLetters } from '../progress'
import { Grade, Medals } from './kit'
import { parseComposition, traitsOf } from '../waves'
import Icon from '../Icon'

const starLabels=(boss:ChallengeBoss)=>['Cleared.','Carrot unharmed.',`Under ${formatSeconds(challengePar[boss])}.`]
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
  if(boss)out.push(`Wave ${w}: the guardian got through. Watch the boss bar and answer each cast.`)
  else if(air)out.push(`Wave ${w}: ${air.t.name}s fly. Air-capable towers cover them: ${airTowers(d,state.level).slice(0,3).join(', ')}.`)
  else if(armor)out.push(`Wave ${w}: ${armor.t.name}s are armored. Prism, Storm Bell and Thunderhead cut through.`)
  else if(shield)out.push(`Wave ${w}: ${shield.t.name}s carry shields. Slow them with Frost, then burst them.`)
  else if(fast)out.push(`Wave ${w}: ${fast.t.name}s are fast. Cover the last bend before the carrot.`)
  else if(parts.length)out.push(`Wave ${w}: ${parts.reduce((s,p)=>s+p.n,0)} creatures. Upgrade the towers that cover the most path.`)
 }
 return out
}
const adaptiveTips=['Upgrades usually beat new Tier I towers: a Tier III covers more path for the coins.','Build where two paths meet: one tower covers both routes.','Clear scenery early: it pays coins and opens new clearings.','Call waves early only when the last one died far from the carrot.']

export function Results({state,level,definitions,summary,grade,previousGrade,challengeBoss,losses,onNext,onRetry,onSelect,onChallenges}:{state:GameState;level:LevelDefinition|undefined;definitions:GameDefinitions|null;summary:RunSummary;grade:number;previousGrade:number;challengeBoss:ChallengeBoss|null;losses:number;onNext:()=>void;onRetry:()=>void;onSelect:()=>void;onChallenges:()=>void}){
 const won=state.phase==='won',seconds=typeof state.elapsed==='number'?state.elapsed:0
 const parTime=challengeBoss?challengePar[challengeBoss]:level?.par
 const medal=challengeBoss?stars({cleared:won,health:state.health,seconds:won?seconds:Infinity,towers:0},challengeBoss):won?1|(state.health===10?2:0)|(state.blockersRemaining===0?4:0):0
 const waves=state.waves,lost=Array.from({length:waves},(_,i)=>summary.lostByWave[i+1]||0),maxLost=Math.max(1,...lost)
 const dmg=(state.stats?.dmgKinds||[]).map((k,i)=>({k,v:state.stats!.dmgValues[i]||0})).sort((a,b)=>b.v-a.v).slice(0,5),maxDmg=Math.max(1,...dmg.map(x=>x.v))
 const leakKinds=(state.stats?.leakKinds||[]).map((k,i)=>({k,n:state.stats!.leakCounts[i]||0})).filter(x=>x.n>0).sort((a,b)=>b.n-a.n)
 const advice=won?[]:lossAdvice(state,level,definitions,summary.lostByWave)
 const tip=!won&&losses>=2?adaptiveTips[(state.level+losses)%adaptiveTips.length]:''
 const newBest=grade>previousGrade&&grade>0
 const title=challengeBoss?won?'Guardian down':'The guardian wins':won?state.level===24?'Every garden saved':'Stage clear':'Stage failed'
 return <section className={`ct-results ct-panel ${won?'is-won':'is-lost'}`} role="dialog" aria-modal="false" aria-labelledby="ct-results-title">
  <div className="ct-results__grade">{challengeBoss?<span className={`ct-results__boss ${won?'is-beaten':''}`}><BossPortrait kind={challengeBoss}/></span>:null}<Grade value={grade} size="xl" label={grade?`Grade ${gradeLetters[grade]}`:'No grade'}/>{newBest&&<span className="ct-tag is-best">New best</span>}</div>
  <div className="ct-results__body">
   <span className="ct-kicker">{String(state.level).padStart(2,'0')} · {state.name}</span>
   <h2 id="ct-results-title">{title}</h2>
   <div className="ct-results__medals"><Medals value={medal} labels={challengeBoss?starLabels(challengeBoss):undefined} icons={challengeBoss?['check','heart','star']:undefined}/></div>
   <dl className="ct-results__stats">
    <div><dt>Hearts</dt><dd>{state.health}<small>/10</small></dd></div>
    <div><dt>Time</dt><dd>{formatSeconds(seconds)}{parTime?<small> / par {formatSeconds(parTime)}</small>:null}</dd></div>
    <div><dt>Chain</dt><dd>×{summary.bestChain}</dd></div>
    <div><dt>Coins left</dt><dd>{state.coins.toLocaleString()}</dd></div>
   </dl>
   {waves>1&&<div className="ct-spark" role="img" aria-label={`Hearts lost per wave: ${lost.map((n,i)=>n?`wave ${i+1}, ${n}`:'').filter(Boolean).join('; ')||'none'}`}>
    <span className="ct-label">Hearts lost by wave</span>
    <span className="ct-spark__bars">{lost.map((n,i)=><i key={i} className={n?'is-lost':''} style={{height:n?`${30+70*n/maxLost}%`:undefined}} title={`Wave ${i+1}: ${n}`}/>)}</span>
   </div>}
   {leakKinds.length>0&&<p className="ct-results__line"><Icon name="warning"/>Leaks: {leakKinds.slice(0,4).map(x=>`${traitsOf(x.k,definitions?.enemies).name} ×${x.n}`).join(', ')}</p>}
   {dmg.length>0&&<ul className="ct-results__damage" aria-label="Top damage by tower">{dmg.map(x=><li key={x.k}><TowerPortrait kind={x.k}/><span>{towerName(definitions,x.k)}</span><i style={{transform:`scaleX(${(x.v/maxDmg).toFixed(3)})`}}/><b>{Math.round(x.v).toLocaleString()}</b></li>)}</ul>}
   {advice.length>0&&<ul className="ct-results__advice">{advice.map(a=><li key={a}>{a}</li>)}</ul>}
   {tip&&<p className="ct-results__tip"><b>Tip</b> {tip}</p>}
   <div className="ct-results__actions">
    {challengeBoss?<><button className="ct-cta" onClick={onChallenges}>Challenges<Icon name="arrow"/></button><button className="ct-ghost" onClick={onRetry}><Icon name="restart"/>Play again</button></>
    :won&&state.level<24?<><button className="ct-cta" onClick={onNext}>Next stage<Icon name="arrow"/></button><button className="ct-ghost" onClick={onRetry}><Icon name="restart"/>Retry</button><button className="ct-ghost" onClick={onSelect}><Icon name="levels"/>Stages</button></>
    :<><button className="ct-cta" onClick={onRetry}><Icon name="restart"/>{won?'Play again':'Retry'}</button><button className="ct-ghost" onClick={onSelect}><Icon name="levels"/>Stages</button></>}
   </div>
  </div>
 </section>
}
