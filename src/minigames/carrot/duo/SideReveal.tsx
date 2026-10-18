// The side reveal: the room's crypto draw shown as a mirrored mini-map with your half (or home wing) lit, the sentence that says which
// garden is yours, and the shared 3-2-1 against the room's startAt. Reduced motion: the numbers change by opacity only.
import type { DuoController } from './useDuo'
import { useDuoSlice } from './useDuo'
import { isEndless } from './contract'
import { duoLayout, fightInfo, ENDLESS_NAME } from './profile'
import { sideLine, sideWord, wingLine } from './copy'
import { MiniMap, useCountdown } from './bits'

export function SideReveal({ctl}:{ctl:DuoController}){
 const s=useDuoSlice(ctl,x=>({side:x.side??0,level:x.level,endless:isEndless(x),at:x.countdownAt,kind:x.countdownKind,seat:x.seat}))
 const left=useCountdown(s.kind==='start'?s.at:null)
 const n=Math.max(1,Math.min(3,Math.ceil(left/1000)))
 const layout=s.endless?'x':duoLayout(s.level)
 const partner=ctl.partnerName()
 const other=s.side===0?1:0
 const fight=fightInfo(s.level)
 return <div className="ct-duo ct-duo-reveal">
  <div className="ct-duo-lobby__scrim" aria-hidden="true"/>
  <section className="ct-duo-reveal__card" role="dialog" aria-modal="true" aria-labelledby="ct-duo-reveal-title" aria-describedby="ct-duo-reveal-line">
   <p className="ct-duo-kicker">{s.endless?`${ENDLESS_NAME} · Endless`:fight?.kind==='challenge'?`${fight.name} · Challenge`:`${fight?.name||'Boss fight'} · ${fight?.guardian||'Guardian'}`}</p>
   <MiniMap layout={layout} side={s.side} endless={s.endless} names={['You',partner]}/>
   <h2 id="ct-duo-reveal-title" tabIndex={-1}>{s.endless?wingLine(s.side):sideLine(layout,s.side)}</h2>
   <p id="ct-duo-reveal-line" className="ct-duo-reveal__line">{s.endless?`${partner} starts at the ${other===0?'WEST':'EAST'} gate. Both of you can build anywhere.`:`${partner} defends the ${sideWord(layout,other)} garden. Nothing crosses the wall, and either carrot falling ends the match.`}</p>
   <div className="ct-duo-reveal__count" aria-hidden="true"><b key={n}>{left>0?n:'Go'}</b></div>
  </section>
 </div>
}
