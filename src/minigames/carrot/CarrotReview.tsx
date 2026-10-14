import { useState } from 'react'
import type { Command, GameState } from './types'
import { miniBosses } from './expansion'

const encounters:Record<string,{level:number;abilities:string[]}>= {
 garden:{level:4,abilities:['brambleSurge','uproot']},marsh:{level:8,abilities:['lanternFlood','blind']},
 frost:{level:12,abilities:['glacierLance','whiteout']},orchard:{level:24,abilities:['harvestMoon','dusk']},
 tornado:{level:25,abilities:['cycloneCall','gust','liftoff']},zombie:{level:26,abilities:['graveMarch','raise']},
 eyeball:{level:27,abilities:['eyeClones','blackout','gaze']},portal:{level:28,abilities:['portalBlink','portalShift','portalStorm','portalSummon']},
}

/** Visible controls for reviewing the real simulation, only rendered in a local development preview. */
export function CarrotReview({state,send,onEncounter,quality}:{state:GameState;send:(c:Command)=>void;onEncounter:(level:number)=>void;quality:(tier:string)=>void}){
 const [kind,setKind]=useState('portal'),[mini,setMini]=useState('portalSentinel'),[tier,setTier]=useState(4)
 return <details className="ct-review" style={{position:'absolute',right:12,bottom:92,zIndex:20,width:245,maxHeight:'70vh',overflowY:'auto',color:'#fff',background:'#12202eea',border:'1px solid #7792a8',borderRadius:12,padding:12,fontSize:12}}>
  <summary>Local encounter review</summary>
  <div style={{display:'grid',gap:8,paddingTop:10}}>
   <label>Encounter <select aria-label="Review encounter" value={kind} onChange={e=>setKind(e.target.value)}>{Object.keys(encounters).map(k=><option key={k}>{k}</option>)}</select></label>
   <button onClick={()=>{onEncounter(encounters[kind].level);send({type:'debugEncounter',kind})}}>Stage encounter</button>
   <label>Miniboss <select aria-label="Review miniboss" value={mini} onChange={e=>setMini(e.target.value)}>{miniBosses.map(m=><option key={m.id} value={m.id}>{m.name}</option>)}</select></label>
   <button onClick={()=>send({type:'debugMini',kind:mini,route:0})}>Stage miniboss</button>
   <button onClick={()=>send({type:'debugCoins',value:10000})}>Add review coins</button>
   <label>Model tier <select aria-label="Review model tier" value={tier} onChange={e=>setTier(Number(e.target.value))}>{[1,2,3,4,5].map(t=><option key={t}>{t}</option>)}</select></label>
   <button onClick={()=>send({type:'debugGarden',value:1,tier})}>Plant expansion gallery</button>
   <button onClick={()=>send({type:'debugGarden',value:0,tier})}>Plant original gallery</button>
   <button onClick={()=>quality('high')}>High detail</button><button onClick={()=>quality('low')}>Low detail</button>
   {state.boss&&<button onClick={()=>send({type:'debugBossDamage',value:100000})}>Defeat current boss life</button>}
   {state.boss&&encounters[state.boss.kind]?.abilities.map(ability=><button key={ability} onClick={()=>send({type:'debugCast',id:state.boss!.id,kind:ability})}>Cast {ability}</button>)}
   <output>Level {state.level} · {state.enemyCount} creatures · {state.elapsed?.toFixed(1)}s</output>
  </div>
 </details>
}
