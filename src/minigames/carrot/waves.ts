/**
 * The wave track's data: which packets spawn on which route and when, and what each creature is (air, armor, shield, heal, mini, boss).
 * Pure functions, no DOM: scripts/carrot-ui-qa and node tests import this file directly.
 *
 * Source of truth, in order: the snapshot's `incoming` (bridge v2), then game-data.json `levels[].wavePlan` (v2, exported from
 * CarrotData.WavePlan()), then a reconstruction from `waveCompositions` with the BeginWave route and gap formulas. The fallback tables
 * below are a copy of CarrotData's GapScaleTable and PacketOverlapTable at 48d1336; they are only read when no wavePlan is published.
 */
import type { EnemyDefinition, GameState, Incoming, LevelDefinition, WavePacket } from './types'

const GapScaleTable=[1,1,1,1,.95,.95,.95,.95,1,.9,.9,.9,.85,.85,.85,.85,.8,.8,.8,.8,.78,.78,.78,.78,.95,.85,.8,.82,.88]
const PacketOverlapTable=[1,1,1,1,1,1,.85,.85,1,1,.85,.85,1,1,.85,.85,1,1,.85,.85,1,1,.85,.85,1,1,1,1,1]
const table=(t:number[],level:number)=>t[Math.max(0,Math.min(t.length-1,level-1))]

/** The eight original creatures are not in game-data's `enemies` (it lists the 27 added kinds); their traits come from CarrotGame.Spawn. */
const originals:Record<string,{name:string;air?:boolean;armor?:boolean;shield?:boolean;heal?:boolean;fast?:boolean}>={
 nibble:{name:'Nibble'},dash:{name:'Dash',fast:true},shell:{name:'Shell',armor:true},swarm:{name:'Swarm'},moth:{name:'Moth',air:true},
 shaman:{name:'Shaman',heal:true},burrow:{name:'Burrow'},crystal:{name:'Crystal',shield:true},fragment:{name:'Fragment'},
}
export type Traits={air:boolean;armor:boolean;shield:boolean;heal:boolean;mini:boolean;boss:boolean;fast:boolean;name:string}
export function traitsOf(kind:string,enemies:EnemyDefinition[]|undefined,bossName=''):Traits{
 if(kind==='boss')return {air:false,armor:false,shield:false,heal:false,mini:false,boss:true,fast:false,name:bossName||'Guardian'}
 const o=originals[kind]
 if(o)return {air:!!o.air,armor:!!o.armor,shield:!!o.shield,heal:!!o.heal,mini:false,boss:false,fast:!!o.fast,name:o.name}
 const e=enemies?.find(x=>x.id===kind)
 if(!e)return {air:false,armor:false,shield:false,heal:false,mini:false,boss:false,fast:false,name:kind}
 return {air:e.air,armor:e.armor>0,shield:e.shield>0,heal:e.trait==='Heal',mini:e.mini,boss:false,fast:e.speed>=1.2,name:e.name}
}
export function parseComposition(text:string|undefined):Array<{kind:string;n:number}>{
 if(!text)return []
 return text.split(',').map(part=>{const [kind,n]=part.split(':');return {kind:kind.trim(),n:Math.max(0,Math.floor(Number(n)||0))}}).filter(p=>p.kind&&p.n>0)
}
/** Work units per creature, as CarrotData.Work: a boss 8, a miniboss 4, anything else 1. Progress (state.progress) is resolved work over total work. */
export function workOf(kind:string,enemies:EnemyDefinition[]|undefined){return kind==='boss'?8:enemies?.find(e=>e.id===kind)?.mini?4:1}

/** One note on the track: a packet's units on one route, `at` the first spawn and `span` to the last, in game seconds from its wave's start. */
export type Note={key:string;wave:number;kind:string;n:number;route:number;at:number;span:number;traits:Traits}

/** The spawn schedule of wave `w` (1-based): game-data's wavePlan when published, otherwise rebuilt with BeginWave's formulas. */
export function wavePackets(level:LevelDefinition,w:number):WavePacket[]{
 const plan=level.wavePlan?.[w-1]
 if(Array.isArray(plan)&&plan.length)return plan.filter(p=>p&&typeof p.kind==='string'&&Number.isFinite(p.at))
 const packets=parseComposition(level.waveCompositions?.[w-1]),routes=Math.max(1,level.routes?.length||1)
 const gapScale=table(GapScaleTable,level.id),overlap=table(PacketOverlapTable,level.id)
 const out:WavePacket[]=[];let at=.65,packetIndex=0
 for(const {kind,n} of packets){
  const gap=kind==='swarm'?.24*gapScale:kind==='boss'?1.8:.78*gapScale
  const block=Math.max(2,Math.floor(n/routes))
  // units grouped by route: first and last spawn on that route
  const byRoute=new Map<number,{n:number;first:number;last:number}>()
  for(let i=0;i<n;i++){
   const route=kind==='boss'?0:(w+packetIndex+Math.floor(i/block))%routes,t=at+i*gap
   const r=byRoute.get(route);if(r){r.n++;r.last=t}else byRoute.set(route,{n:1,first:t,last:t})
  }
  for(const [route,r] of byRoute)out.push({kind,n:r.n,route,at:r.first,span:r.last-r.first})
  at+=Math.max(2,n*(kind==='swarm'?.24:kind==='boss'?1.8:.78)*(kind==='boss'?1:gapScale*overlap))+.8;packetIndex++
 }
 return out
}
export function waveNotes(level:LevelDefinition,w:number,enemies:EnemyDefinition[]|undefined,bossName=''):Note[]{
 return wavePackets(level,w).map((p,i)=>({key:`${w}:${i}:${p.kind}:${p.route}`,wave:w,kind:p.kind,n:p.n,route:p.route,at:p.at,span:Math.max(0,p.span||0),traits:traitsOf(p.kind,enemies,bossName)}))
}
/** Notes from the snapshot's v2 `incoming` list; `at` there is on the current wave's clock (untilSpawn = at - waveElapsed). */
export function incomingNotes(incoming:Incoming[],wave:number,enemies:EnemyDefinition[]|undefined,bossName=''):Note[]{
 return incoming.filter(p=>p&&typeof p.kind==='string'&&Number.isFinite(p.at)).map((p,i)=>{const t=traitsOf(p.kind,enemies,bossName);return {key:`i${p.wave??wave}:${i}:${p.kind}:${p.route}`,wave:p.wave??wave,kind:p.kind,n:Math.max(0,p.count|0),route:p.route|0,at:p.at,span:Math.max(0,p.span||0),traits:{...t,air:p.air??t.air,armor:p.armor??t.armor,shield:p.shield??t.shield,heal:p.heal??t.heal,mini:p.mini??t.mini}}})
}
/** Where each wave starts and ends on the progress bar (0..1), from the work weights; the last entry is 1. */
export function waveBounds(level:LevelDefinition,enemies:EnemyDefinition[]|undefined):number[]{
 const work=(level.waveCompositions||[]).map(c=>parseComposition(c).reduce((s,p)=>s+p.n*workOf(p.kind,enemies),0))
 const total=work.reduce((a,b)=>a+b,0)||1;let run=0
 return work.map(w=>(run+=w)/total)
}
/** Boss and miniboss flags on the progress bar: the fraction where that wave begins. */
export function waveFlags(level:LevelDefinition,enemies:EnemyDefinition[]|undefined):Array<{wave:number;at:number;kind:'boss'|'mini'|'air'}>{
 const bounds=waveBounds(level,enemies),out:Array<{wave:number;at:number;kind:'boss'|'mini'|'air'}>=[]
 ;(level.waveCompositions||[]).forEach((c,i)=>{const parts=parseComposition(c),start=i?bounds[i-1]:0
  if(parts.some(p=>p.kind==='boss'))out.push({wave:i+1,at:start,kind:'boss'})
  else if(parts.some(p=>traitsOf(p.kind,enemies).mini))out.push({wave:i+1,at:start,kind:'mini'})})
 return out
}
/** The first wave (1-based) that contains a flying creature, so the page can warn before it. 0 when none. */
export function firstAirWave(level:LevelDefinition,enemies:EnemyDefinition[]|undefined){
 const i=(level.waveCompositions||[]).findIndex(c=>parseComposition(c).some(p=>traitsOf(p.kind,enemies).air));return i+1
}
export function waveHasAir(level:LevelDefinition,w:number,enemies:EnemyDefinition[]|undefined){return parseComposition(level.waveCompositions?.[w-1]).some(p=>traitsOf(p.kind,enemies).air)}
/** Every creature kind a level sends, for first-encounter records. */
export function levelKinds(level:LevelDefinition){const s=new Set<string>();for(const c of level.waveCompositions||[])for(const p of parseComposition(c))if(p.kind!=='boss')s.add(p.kind);return [...s]}

/**
 * What the track shows right now. `current` is the wave in flight (its clock is waveElapsed); `next` the following wave and the game
 * seconds until it starts (null while unknown: the ready phase waits for the player, a wave still in flight has no countdown yet).
 */
export function trackPlan(state:Pick<GameState,'phase'|'wave'|'waves'|'nextWave'|'incoming'|'waveElapsed'>,level:LevelDefinition|undefined,enemies:EnemyDefinition[]|undefined,bossName=''):{current:Note[];next:Note[];nextWave:number;nextIn:number|null}{
 if(!level)return {current:[],next:[],nextWave:0,nextIn:null}
 const nextWave=state.phase==='ready'?1:state.wave+1
 if(Array.isArray(state.incoming)&&state.incoming.length&&typeof state.waveElapsed==='number'){
  const notes=incomingNotes(state.incoming,state.wave,enemies,bossName)
  return {current:notes.filter(n=>n.wave<=state.wave),next:notes.filter(n=>n.wave>state.wave),nextWave,nextIn:state.nextWave>0?state.nextWave:null}
 }
 const current=state.phase==='playing'&&state.wave>0?waveNotes(level,state.wave,enemies,bossName):[]
 const next=nextWave<=state.waves&&state.phase!=='won'&&state.phase!=='lost'?waveNotes(level,nextWave,enemies,bossName):[]
 return {current,next,nextWave,nextIn:state.phase==='playing'&&state.nextWave>0?state.nextWave:null}
}
