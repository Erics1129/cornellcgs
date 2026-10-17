// Two-player endless additions to the HUD: the wave and the score (waves survived) in place of the stock "Wave 3 of 999", the next
// miniboss or boss, the shared purse with who spent what, the presence legend (your colour, your partner's), the camera switch and the
// connection chip (with the lockstep input delay in debug builds). The stock HUD keeps showing coins, hearts and the wave track.
import type { GameDefinitions, GameState } from '../types'
import { useSlice } from '../hooks/useSnapshot'
import type { DuoController } from './useDuo'
import { useDuoSlice, useDuoUi } from './useDuo'
import type { NetBlock } from './contract'
import { partnerSeat } from './contract'
import { nextSpecial, specialLine } from './copy'
import { ENDLESS_NAME } from './profile'
import { Banners, CameraSwitch, ConnectionChip, Glyph } from './bits'

const bossNames:Record<string,string>={garden:'Brambleback',marsh:'Lantern Regent',frost:'Crown of Winter',orchard:'Old Hollowhead',tornado:'Giant Tornado',zombie:'Zombie',eyeball:'Unknown Eyeball',portal:'Portal'}
/** Waves survived: the snapshot's net.score, else the highest wave fully cleared (a breather means the current wave is done). */
export function endlessScore(st:GameState|null):number{
 if(!st)return 0
 const net=(st as GameState&{net?:NetBlock}).net
 if(net&&typeof net.score==='number')return Math.max(0,Math.floor(net.score))
 const cleared=st.phase==='playing'&&(st.nextWave>0||st.enemyCount===0)?st.wave:st.wave-1
 return Math.max(0,cleared)
}

export function EndlessHud({ctl,definitions}:{ctl:DuoController;definitions:GameDefinitions|null}){
 const store=ctl.args.store
 const g=useSlice(store,st=>{
  const wave=Math.max(0,st?.wave||0),special=nextSpecial(st?.phase==='ready'?0:wave)
  const next=(st?.incoming||[]).find(n=>(n.wave??wave)===special.wave&&(special.kind==='boss'?n.boss:n.mini))
  const net=(st as GameState&{net?:NetBlock}|null)?.net
  return {wave,score:endlessScore(st),coins:st?.coins||0,phase:st?.phase||'ready',special:specialLine(special),specialKind:special.kind,specialIn:special.in,nextKind:next?.kind||'',spent:net?.seats?net.seats.map(x=>x?.spent||0).join(','):''}
 })
 const own=useDuoUi(ctl,u=>u.own)
 const seat=useDuoSlice(ctl,s=>s.seat??0)
 const partner=ctl.partnerName()
 const nextName=g.nextKind?(g.specialKind==='boss'?bossNames[g.nextKind]:definitions?.enemies?.find(e=>e.id===g.nextKind)?.name)||'':''
 const spentSeats=g.spent?g.spent.split(',').map(Number):null
 const mine=spentSeats?spentSeats[seat]||0:own.spent,theirs=spentSeats?spentSeats[partnerSeat(seat)]||0:null
 const total=mine+(theirs||0)
 const special=`${g.special}${nextName?`: ${nextName}`:''}`
 return <>
  <aside className="ct-duo ct-duo-rail is-endless" aria-label={`${ENDLESS_NAME} with ${partner}`}>
   <section className="ct-duo-endless" role="group" aria-label={`${ENDLESS_NAME}. Wave ${Math.max(1,g.wave)}. Score: ${g.score} ${g.score===1?'wave':'waves'} survived. ${special}. Shared purse ${g.coins} coins.`}>
    <div className="ct-duo-endless__top" aria-hidden="true">
     <span className="ct-duo-kicker">{ENDLESS_NAME}</span>
     <b className="ct-duo-endless__wave"><small>Wave</small>{Math.max(1,g.wave)}</b>
     <span className="ct-duo-endless__score"><small>Score</small>{g.score}</span>
    </div>
    <p className="ct-duo-endless__next" data-kind={g.specialKind} data-soon={g.specialIn<=1?'1':undefined} aria-hidden="true"><Glyph name="crown"/>{special}</p>
    <div className="ct-duo-purse" aria-hidden="true">
     <span className="ct-duo-purse__head"><Glyph name="coin"/><span>Shared purse</span><b>{g.coins}</b></span>
     {total>0&&theirs!==null&&<span className="ct-duo-purse__split"><i data-tone="me" style={{flexGrow:Math.max(.02,mine/total)}}/><i data-tone="partner" style={{flexGrow:Math.max(.02,theirs/total)}}/></span>}
     <span className="ct-duo-purse__who"><span data-tone="me">You spent {mine}</span>{theirs!==null&&<span data-tone="partner">{partner} {theirs}</span>}</span>
    </div>
    <ul className="ct-duo-legend" aria-label="Colours on the map"><li data-tone="me">You</li><li data-tone="partner">{partner}</li></ul>
   </section>
   <CameraSwitch ctl={ctl} labels={{own:'My wing',both:'Whole map',partner:`${partner}'s wing`}}/>
   <ConnectionChip ctl={ctl} showDelay/>
  </aside>
  <Banners ctl={ctl}/>
 </>
}
