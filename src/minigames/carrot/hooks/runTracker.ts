import type { GameState, JudgementKind } from '../types'
import type { SnapshotStore } from './useSnapshot'

/**
 * Per-run page state derived from the snapshots: the judgement stream (FLAWLESS / CLEAR / LEAK / PHASE BREAK / SUPER FORGED / SAVED),
 * the defense chain (consecutive leak-free waves and boss phases; it breaks on a leak) and the hearts lost in each wave for the results.
 * A v2 build reports `judgement` itself; against a v1 build the same words are inferred: a lost heart is a leak (once per wave), a wave
 * whose breather begins without a lost heart is flawless, a boss phase step is a phase break, the merge-undo window opening is a Super.
 */
export type JudgementEvent={id:number;kind:JudgementKind;wave:number;value:number;at:number}
export type RunSummary={lostByWave:number[];flawless:number;resolved:number;leaks:number;chain:number;bestChain:number;startedAt:number}
export type RunTracker={
 subscribe(listener:()=>void):()=>void
 judgement():JudgementEvent|null
 chain():{value:number;best:number;brokeAt:number;bumpedAt:number}
 summary():RunSummary
 /** a page-initiated judgement (the SELL NOW chip saved a tower against a v1 build) */
 emit(kind:JudgementKind,wave:number,value?:number):void
 /** starts following the store; returns the stop function (call from an effect, so StrictMode's remount re-attaches) */
 attach():()=>void
}
const kinds:JudgementKind[]=['flawless','clear','leak','phaseBreak','superForged','saved']
export function createRunTracker(store:SnapshotStore):RunTracker{
 const listeners=new Set<()=>void>()
 let run=-1,prev:GameState|null=null,last:JudgementEvent|null=null,seq=0,v2seq=-1
 let chain=0,best=0,brokeAt=0,bumpedAt=0,lost:number[]=[],leaked=new Set<number>(),healthAtWave=new Map<number,number>(),flawless=0,resolved=0,leaks=0,startedAt=0
 const notify=()=>{for(const l of listeners)l()}
 const reset=()=>{prev=null;last=null;v2seq=-1;chain=0;best=0;brokeAt=0;bumpedAt=0;lost=[];leaked=new Set();healthAtWave=new Map();flawless=0;resolved=0;leaks=0;startedAt=performance.now()}
 const push=(kind:JudgementKind,wave:number,value=0)=>{
  last={id:++seq,kind,wave,value,at:performance.now()}
  if(kind==='flawless'||kind==='phaseBreak'){chain++;best=Math.max(best,chain);bumpedAt=last.at}
  if(kind==='leak'&&chain>0){chain=0;brokeAt=last.at}
  if(kind==='flawless')flawless++
  if(kind==='flawless'||kind==='clear')resolved++
 }
 const onState=()=>{
  const next=store.get();if(!next)return
  if(store.run()!==run){run=store.run();reset()}
  const p=prev;prev=next
  let changed=false
  if(!healthAtWave.has(next.wave))healthAtWave.set(next.wave,next.health)
  if(p&&next.health<p.health){
   const n=p.health-next.health;lost[next.wave]=(lost[next.wave]||0)+n;leaks+=n
   if(!next.judgement&&!leaked.has(next.wave)){leaked.add(next.wave);push('leak',next.wave,n);changed=true}
  }
  if(next.judgement&&typeof next.judgement.seq==='number'){
   // bridge v2: the simulation names its own judgements; the first one seen in a run only sets the baseline
   const j=next.judgement
   if(v2seq<0)v2seq=j.seq
   else if(j.seq>v2seq){v2seq=j.seq;if((kinds as string[]).includes(j.kind)){push(j.kind as JudgementKind,j.wave,j.value);changed=true}}
  }else if(p&&next.phase==='playing'){
   if(p.nextWave<=0&&next.nextWave>0){const w=next.wave,clean=(healthAtWave.get(w)??next.health)<=next.health&&!lost[w];push(clean?'flawless':'clear',w);changed=true}
   if(p.boss&&next.boss&&p.boss.id===next.boss.id&&(next.boss.phase||1)>(p.boss.phase||1)){push('phaseBreak',next.wave,next.boss.phase);changed=true}
   if((next.mergeUndo||0)>3.5&&(p.mergeUndo||0)<(next.mergeUndo||0)-.5){push('superForged',next.wave);changed=true}
  }
  if(changed)notify()
 }
 return {
  subscribe(l){listeners.add(l);return()=>{listeners.delete(l)}},
  judgement:()=>last,
  chain:()=>({value:chain,best,brokeAt,bumpedAt}),
  summary:()=>({lostByWave:lost.slice(),flawless,resolved,leaks,chain,bestChain:best,startedAt}),
  emit(kind,wave,value=0){push(kind,wave,value);notify()},
  attach(){return store.subscribe(onState)},
 }
}
