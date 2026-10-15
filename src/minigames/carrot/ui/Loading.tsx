import { useEffect, useState } from 'react'
import type { GameDefinitions, LevelDefinition } from '../types'
import { TowerPortrait, chapterArt, jacketArt, useImageAvailable } from '../art'
import { Pips } from './kit'
import { bandTone, levelBand, levelPips } from './LevelSelect'
import { towerTraits } from '../expansion'

const tips=['Flying creatures ignore ground-only towers: watch for the wing badge on the wave track.','Guardian casts hold the game at 1× while they wind up. Read the cast row under the boss bar.','Sell a tower marked by Uproot before the roots close: you keep more coins.','A FLAWLESS wave grows your chain. One leak breaks it.','Two Tier IV towers of one kind merge into a Super.','Clearing scenery pays coins and opens clearings.','Prism and Sun Blossom keep their reach in the dark.']
const mb=(n:number)=>(n/1048576).toFixed(1)
/** The loading screen: byte-accurate progress (MB of MB), a cycling tip and one tower card. */
export function Loading({level,definitions,progress,bytes,error,onRetry}:{level:LevelDefinition|undefined;definitions:GameDefinitions|null;progress:number;bytes:{done:number;total:number}|null;error:string;onRetry:()=>void}){
 const [tip,setTip]=useState(()=>Math.floor(Math.random()*tips.length))
 useEffect(()=>{const t=window.setInterval(()=>setTip(i=>(i+1)%tips.length),4500);return()=>clearInterval(t)},[])
 const towers=definitions?.towers.filter(t=>t.unlock<=(level?.id||1))||[],card=towers[(tip*7)%Math.max(1,towers.length)]
 const pct=Math.round(Math.max(0,Math.min(1,progress))*100)
 const jacket=useImageAvailable(jacketArt(level?.id||1)),band=level?levelBand(level):''
 return <div className="ct-loading" style={{backgroundImage:`url(${jacket&&level?jacketArt(level.id):chapterArt(level?.biome||'garden')})`}}>
  <div className="ct-loading__card ct-panel">
   <span className="ct-kicker">{error?'A moment, please':level?.challenge?'The arena is waking':'Your garden is waking'}</span>
   {level&&!error&&<div className="ct-loading__stage"><b>{String(level.id).padStart(2,'0')}</b><span className={`ct-band is-${bandTone(band)}`}>{band}</span><Pips value={levelPips(level)}/></div>}
   <h2>{error?'Couldn’t open the garden':level?.name||'Carrot Defense'}</h2>
   {error?<><p role="alert">{error}</p><button className="ct-cta" onClick={onRetry}>Try again</button></>:<>
    <div className="ct-loading__bar" role="progressbar" aria-label="Loading the garden" aria-valuemin={0} aria-valuemax={100} aria-valuenow={pct}><i style={{transform:`scaleX(${pct/100})`}}/></div>
    <p className="ct-loading__bytes"><b>{pct}%</b>{bytes&&bytes.total>0?<span>{mb(bytes.done)} / {mb(bytes.total)} MB</span>:<span>Preparing</span>}</p>
    <p className="ct-loading__tip" aria-live="polite">{tips[tip]}</p>
    {card&&<div className="ct-loading__tower"><TowerPortrait kind={card.id}/><div><b>{card.name}</b><span>{towerTraits[card.id]||card.role}</span></div></div>}
   </>}
  </div>
 </div>
}
