// The duo boss-fight additions to the HUD. They sit on top of the stock HUD (which keeps showing your own half) and never replace it:
// a slim rail with the partner's chip (name, hearts, wave, coins, their boss), the camera switch (My side / Both / Watch <name>) and the
// connection chip, plus one banner at a time (hold, away with the grace clock, who paused, waiting to start). No backdrop-filter here.
import type { DuoController } from './useDuo'
import { useDuoSlice } from './useDuo'
import { partnerSeat } from './contract'
import { duoLayout } from './profile'
import { sideWord } from './copy'
import { Avatar, Banners, CameraSwitch, ConnectionChip, Glyph, Meter } from './bits'

export function DuoHud({ctl}:{ctl:DuoController}){
 const partner=ctl.partnerName()
 return <>
  <aside className="ct-duo ct-duo-rail" aria-label={`Your partner, ${partner}`}>
   <PartnerCard ctl={ctl}/>
   <CameraSwitch ctl={ctl} labels={{own:'My side',both:'Both',partner:`Watch ${partner}`}}/>
   <ConnectionChip ctl={ctl}/>
  </aside>
  <Banners ctl={ctl}/>
 </>
}

/** The partner's half at a glance, from Unity's partnerView (4 Hz). */
export function PartnerCard({ctl}:{ctl:DuoController}){
 const v=useDuoSlice(ctl,s=>{const p=s.partner;return {health:p?.health??10,wave:p?.wave??0,waves:p?.waves??0,coins:p?.coins??0,phase:p?.phase||'',behind:p?.behind??0,
  boss:p?.boss?`${p.boss.name}|${p.boss.hp}|${p.boss.maxHp}|${p.boss.phase}`:'',hold:s.partnerHold,away:!!s.partnerAway,side:s.sides?s.sides[partnerSeat(s.seat)]:(s.side===0?1:0),level:s.level}})
 const name=ctl.partnerName()
 const [bossName,hp,max,phase]=v.boss?v.boss.split('|'):['','0','0','0']
 const ratio=Number(max)>0?Number(hp)/Number(max):0
 const where=sideWord(duoLayout(v.level),v.side)
 const state=v.away?'Away':v.hold?'Garden safe':v.behind>60?'Catching up':''
 const spoken=`${name}, ${where} garden: ${v.health} ${v.health===1?'heart':'hearts'}, wave ${Math.max(1,v.wave)} of ${v.waves||'?'}, ${v.coins} coins${v.boss?`, ${bossName} at ${Math.round(ratio*100)}%`:''}${state?`, ${state.toLowerCase()}`:''}`
 return <section className="ct-duo-partner" role="group" aria-label={spoken} data-state={v.away?'away':v.hold?'hold':undefined}>
  <header className="ct-duo-partner__head" aria-hidden="true">
   <Avatar name={name} tone="partner" size="sm"/>
   <b className="ct-duo-partner__name">{name}</b>
   <span className="ct-duo-partner__side">{where}</span>
  </header>
  <dl className="ct-duo-partner__stats" aria-hidden="true">
   <div data-tone={v.health<=3?'threat':undefined}><dt><Glyph name="heart"/><span>Hearts</span></dt><dd>{v.health}</dd></div>
   <div><dt><Glyph name="wave"/><span>Wave</span></dt><dd>{Math.max(1,v.wave)}<small>/{v.waves||'–'}</small></dd></div>
   <div className="is-wide"><dt><Glyph name="coin"/><span>Coins</span></dt><dd>{v.coins}</dd></div>
  </dl>
  {v.boss&&<div className="ct-duo-partner__boss" aria-hidden="true"><span>{bossName}{Number(phase)>1?<small> · phase {phase}</small>:null}</span><Meter value={ratio} tone="threat"/></div>}
  {state&&<p className="ct-duo-partner__state" aria-hidden="true">{state}</p>}
 </section>
}
