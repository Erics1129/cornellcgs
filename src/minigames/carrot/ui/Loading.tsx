import { useEffect, useState } from 'react'
import type { CSSProperties } from 'react'
import type { GameDefinitions, LevelDefinition } from '../types'
import { TowerPortrait, chapterArt, jacketArt, useImageAvailable } from '../art'
import { Pips } from './kit'
import { bandTone, biomeNames, levelBand, levelPips } from './LevelSelect'
import { towerTraits } from '../expansion'
import { actions, count, loading } from '../copy'
import { glass } from './Glass'
import Icon from '../Icon'

const tips=['Ground-only towers can’t hit flying creatures. Look for the wing badge on the wave track.','Guardian casts hold the game at 1× while they wind up. Read the cast row under the boss bar.','Sell a tower marked by Uproot before the cast ends to keep more coins.','A Flawless wave (no leaks) adds to your chain. One leak breaks it.','Two Tier IV towers of one kind merge into a Super.','Clearing scenery pays coins and opens clearings.','Prism and Sun Blossom keep their reach in the dark.']
const mb=(n:number)=>(n/1048576).toFixed(1)
/**
 * The loading screen: the stage's own board, out of focus, behind one glass sheet with the stage (number, band, name, chapter), the
 * download in megabytes, a tip that changes every 4.5 s and one tower you can build there. The error state keeps the same sheet.
 */
export function Loading({level,definitions,progress,bytes,error,onRetry}:{level:LevelDefinition|undefined;definitions:GameDefinitions|null;progress:number;bytes:{done:number;total:number}|null;error:string;onRetry:()=>void}){
 const [tip,setTip]=useState(()=>Math.floor(Math.random()*tips.length))
 useEffect(()=>{const t=window.setInterval(()=>setTip(i=>(i+1)%tips.length),4500);return()=>clearInterval(t)},[])
 const towers=definitions?.towers.filter(t=>t.unlock<=(level?.id||1))||[],card=towers[(tip*7)%Math.max(1,towers.length)]
 const pct=Math.round(Math.max(0,Math.min(1,progress))*100)
 const jacket=useImageAvailable(jacketArt(level?.id||1)),band=level?levelBand(level):''
 const art=jacket&&level?jacketArt(level.id):chapterArt(level?.biome||'garden')
 return <div className={`ct-loading${error?' is-error':''}`}>
  <div className="ct-loading__scene" aria-hidden="true"><img src={art} alt="" decoding="async"/></div>
  <div className={glass({depth:3,blur:true,pop:'sheet'},'ct-loading__card')} style={{'--gl-pad':'12px'} as CSSProperties}>
   {level&&<span className="gl-thumb ct-loading__jacket"><img src={art} alt="" decoding="async"/><span className="ct-loading__no gl-num">{String(level.id).padStart(2,'0')}</span></span>}
   <div className="ct-loading__body">
    <span className="gl-label">{error?loading.failed:level?.challenge?loading.challenge:loading.stage}</span>
    <h2>{error?loading.failedTitle:level?.name||'Carrot Defense'}</h2>
    {level&&!error&&<div className="ct-loading__meta"><span className={`ct-band is-${bandTone(band)}`}>{band}</span><Pips value={levelPips(level)}/><span>{biomeNames[level.biome]||level.biome} · {count(level.waves,'wave')}</span></div>}
    {error?<div className="ct-loading__error"><p role="alert"><Icon name="warning"/>{error}</p><button className="ct-cta" onClick={onRetry}><Icon name="restart"/>{actions.tryAgain}</button></div>:<>
     <div className="ct-loading__progress">
      <div className="gl-meter ct-loading__bar" role="progressbar" aria-label={loading.bar} aria-valuemin={0} aria-valuemax={100} aria-valuenow={pct}><i style={{'--v':pct/100} as CSSProperties}/></div>
      <p className="ct-loading__bytes gl-num"><b>{pct}%</b>{bytes&&bytes.total>0?<span>{mb(bytes.done)} / {mb(bytes.total)} MB</span>:<span>{loading.preparing}</span>}</p>
     </div>
     <p className="ct-loading__tip gl-well" aria-live="polite"><span className="gl-label">Tip</span><span key={tip}>{tips[tip]}</span></p>
     {card&&<div className="ct-loading__tower gl-fill"><span className="gl-thumb"><TowerPortrait kind={card.id}/></span><div><b>{card.name}</b><span>{towerTraits[card.id]||card.role}</span></div></div>}
    </>}
   </div>
  </div>
 </div>
}
