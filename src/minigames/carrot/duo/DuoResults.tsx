// The results card for every multiplayer outcome (it replaces the page's own Results while a room is active): a duo win with both
// sides' hearts, the team time and kills, and "Win recorded for both players"; a duo loss naming whose carrot fell and on which wave;
// an unfinished match ("Nothing was recorded"); and endless (waves survived, a new best, who built and spent what). Rematch keeps the
// fight and marks you ready; Change fight returns to the room; Leave goes back to the multiplayer home screen.
import { useEffect, useRef, useState } from 'react'
import type { GameDefinitions } from '../types'
import { useSlice } from '../hooks/useSnapshot'
import { formatSeconds } from '../challenges'
import type { DuoController } from './useDuo'
import { useDuoSlice, useDuoUi } from './useDuo'
import type { DuoResult, NetBlock } from './contract'
import { partnerSeat, seatCounters } from './contract'
import { resultCopy } from './copy'
import { ENDLESS_NAME, fightInfo } from './profile'
import { Avatar, Glyph } from './bits'

export function DuoResults({ctl,definitions}:{ctl:DuoController;definitions:GameDefinitions|null}){
 const s=useDuoSlice(ctl,x=>({result:x.result,seat:x.seat??0,host:x.host,level:x.level,partnerHealth:x.partner?.health??null}))
 const ui=useDuoUi(ctl,u=>({endless:u.endless,own:u.own}))
 const own=useSlice(ctl.args.store,st=>{const net=(st as {net?:NetBlock}|null)?.net;return {health:st?.health??0,seconds:typeof st?.elapsed==='number'?st.elapsed:0,kills:st?.stats?.kills??0,towers:st?.towerCount??0,wave:st?.wave??0,seats:seatCounters(net)?JSON.stringify(seatCounters(net)):''}})
 const [collapsed,setCollapsed]=useState(false)
 const primary=useRef<HTMLButtonElement>(null)
 useEffect(()=>{if(!collapsed)primary.current?.focus({preventScroll:true})},[collapsed,s.result])
 const r=s.result
 if(!r)return null
 const partner=ctl.partnerName()
 const names:[string,string]=s.seat===0?['You',partner]:[partner,'You']
 const copy=resultCopy(r,names,s.seat,{newBest:ui.endless?.newBest,best:ui.endless?.best})
 const fight=fightInfo(s.level),def=definitions?.levels.find(l=>l.id===s.level)
 const where=r.kind==='endless'?ENDLESS_NAME:(def?.name||fight?.name||'Boss fight').replace(/\s+—.*$/,'')
 const stats=statsFor(r,{own,partner,partnerHealth:s.partnerHealth,best:ui.endless?.best||0,previous:ui.endless?.previous||0,newBest:!!ui.endless?.newBest,seat:s.seat})
 const people=r.kind==='endless'?peopleFor(own.seats,s.seat,partner,ui.own):[]
 const partnerFell=r.kind==='duoLoss'&&r.fell===partnerSeat(s.seat)
 if(collapsed)return <div className="ct-duo ct-duo-results-pill"><button type="button" className="ct-duo-btn ct-duo-btn--primary" onClick={()=>setCollapsed(false)}>Show results<span className="ct-duo-sr"> for {where}</span></button></div>
 return <div className="ct-duo ct-duo-results-wrap">
  <section className="ct-duo-results" role="dialog" aria-modal="false" aria-labelledby="ct-duo-results-title" aria-describedby="ct-duo-results-line" data-tone={copy.tone}>
   <header className="ct-duo-results__head">
    <p className="ct-duo-kicker">{where} · {r.kind==='endless'?'Endless':'Boss fight'}</p>
    <h2 id="ct-duo-results-title">{copy.title}</h2>
    <p id="ct-duo-results-line" className="ct-duo-results__line">{copy.line}</p>
   </header>
   {stats.length>0&&<dl className="ct-duo-results__stats">{stats.map(x=><div key={x.label} data-tone={x.tone}><dt>{x.label}</dt><dd>{x.value}</dd></div>)}</dl>}
   {people.length>0&&<ul className="ct-duo-results__people" aria-label="Who built what">{people.map(p=><li key={p.name} data-tone={p.tone}><Avatar name={p.name} tone={p.tone} size="sm"/><b>{p.name}</b><span>{p.text}</span></li>)}</ul>}
   <p className="ct-duo-results__recorded" data-tone={copy.tone}><Glyph name={r.kind==='unfinished'?'close':'check'}/>{copy.recorded}</p>
   <div className="ct-duo-actions ct-duo-results__actions">
    <button ref={primary} type="button" className="ct-duo-btn ct-duo-btn--primary" onClick={()=>ctl.rematch(true)}>Rematch</button>
    <button type="button" className="ct-duo-btn" onClick={()=>ctl.rematch(false)}>{s.host?'Change fight':'Back to room'}</button>
    <button type="button" className="ct-duo-btn is-quiet" onClick={ctl.leave}>Leave</button>
    <button type="button" className="ct-duo-btn is-quiet" onClick={()=>{if(partnerFell)ctl.camera('partner');setCollapsed(true)}}><Glyph name="eye"/>{partnerFell?`Watch ${partner}'s side`:'View the garden'}</button>
   </div>
  </section>
 </div>
}

type Stat={label:string;value:string;tone?:'me'|'partner'|'good'|'threat'}
function statsFor(r:DuoResult,x:{own:{health:number;seconds:number;kills:number;towers:number;wave:number;seats:string};partner:string;partnerHealth:number|null;best:number;previous:number;newBest:boolean;seat:number}):Stat[]{
 const time=x.own.seconds>0?formatSeconds(x.own.seconds):'–'
 const hearts=(n:number|null)=>n===null?'–':String(Math.max(0,n))
 switch(r.kind){
  case 'duoWin':return [{label:'Your hearts',value:hearts(r.health),tone:'me'},{label:`${x.partner}'s hearts`,value:hearts(r.partnerHealth),tone:'partner'},{label:'Team time',value:time},{label:'Your kills',value:x.own.kills.toLocaleString()}]
  case 'duoLoss':return [{label:'Fell on wave',value:String(r.wave||x.own.wave||'–'),tone:'threat'},{label:'Your hearts',value:hearts(r.fell===x.seat?0:x.own.health),tone:'me'},{label:`${x.partner}'s hearts`,value:hearts(r.fell===x.seat?x.partnerHealth:0),tone:'partner'},{label:'Time',value:time}]
  case 'unfinished':return x.own.wave>0?[{label:'Reached wave',value:String(x.own.wave)},{label:'Time',value:time}]:[]
  case 'endless':{
   const list:Stat[]=[{label:'Waves survived',value:String(r.waves),tone:x.newBest?'good':undefined},x.newBest?{label:'Previous best',value:x.previous>0?String(x.previous):'none'}:{label:'Best on this device',value:String(x.best||r.waves)},{label:'Time',value:time},{label:'Team kills',value:x.own.kills.toLocaleString()}]
   return list}
 }
 return []
}

/** Endless: who built and spent what (the sim's per-seat counters when it publishes them, else what this device counted for itself). */
function peopleFor(seatsJson:string,seat:number,partner:string,ownCount:{built:number;spent:number}):Array<{name:string;tone:'me'|'partner';text:string}>{
 const seats=seatsJson?(JSON.parse(seatsJson) as Array<{built?:number;spent?:number;damage?:number}>):null
 const me=seats?.[seat],them=seats?.[seat===0?1:0]
 const total=(me?.damage||0)+(them?.damage||0)
 const line=(c:{built?:number;spent?:number;damage?:number}|undefined,fallback?:{built:number;spent:number})=>{const built=c?.built??fallback?.built,spent=c?.spent??fallback?.spent??0
  return `${built!==undefined?`${built} ${built===1?'tower':'towers'} · `:''}${spent.toLocaleString()} coins${total>0&&c?` · ${Math.round((c.damage||0)/total*100)}% of the damage`:''}`}
 const list:Array<{name:string;tone:'me'|'partner';text:string}>=[{name:'You',tone:'me',text:line(me,ownCount)}]
 if(them)list.push({name:partner,tone:'partner',text:line(them)})
 return list
}
