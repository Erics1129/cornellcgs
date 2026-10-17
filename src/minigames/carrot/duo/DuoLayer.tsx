// Everything multiplayer draws, in one layer at the page root (so the lobby also shows while Unity loads): the entry pill on the title
// screen, the lobby, the side reveal, the duo or endless HUD additions with the shared countdown, the results, the toasts and the
// aria-live regions. It also marks the page root (data-duo) so duo.css can adjust the stock HUD without touching its files.
import { useEffect, useRef } from 'react'
import type { GameDefinitions } from '../types'
import type { DuoState } from './useDuo'
import { useDuoSlice } from './useDuo'
import { inLobby, inMatch, isEndless } from './contract'
import { DuoEntry } from './DuoEntry'
import { DuoLobby } from './DuoLobby'
import { SideReveal } from './SideReveal'
import { DuoHud } from './DuoHud'
import { EndlessHud } from './EndlessHud'
import { DuoResults } from './DuoResults'
import { Countdown, LiveRegion, Toasts } from './bits'
import './duo.css'

export function DuoLayer({duo,entered,definitions}:{duo:DuoState;entered:boolean;definitions:GameDefinitions|null;reduced?:boolean}){
 const {ctl,phase}=duo
 const ref=useRef<HTMLDivElement>(null)
 const endless=useDuoSlice(ctl,s=>isEndless(s))
 const match=inMatch(phase)
 const showEntry=!entered&&duo.available&&!duo.isOpen&&phase==='idle'
 const mark=match||phase==='results'?(endless?'endless':'duo'):phase==='starting'?'starting':duo.isOpen?'lobby':''
 useEffect(()=>{
  const root=ref.current?.closest<HTMLElement>('.ct-page');if(!root)return
  if(mark)root.dataset.duo=mark;else delete root.dataset.duo
  if(mark&&phase!=='idle')root.dataset.duoPhase=phase;else delete root.dataset.duoPhase
  if(showEntry)root.dataset.duoEntry='1';else delete root.dataset.duoEntry
  return()=>{delete root.dataset.duo;delete root.dataset.duoPhase;delete root.dataset.duoEntry}
 },[mark,phase,showEntry])
 // endless: the stock wave track reads "Wave 3 of 999"; EndlessHud carries the wave and score, so the track leaves the accessibility tree
 useEffect(()=>{
  const game=ref.current?.closest('.ct-page')?.querySelector('.ct-game');if(!game||mark!=='endless')return
  const apply=()=>game.querySelector('.ct-hud__track')?.setAttribute('aria-hidden','true')
  apply();const watch=new MutationObserver(apply);watch.observe(game,{childList:true})
  const hud=game.querySelector('.ct-hud');if(hud)watch.observe(hud,{childList:true})
  return()=>{watch.disconnect();game.querySelector('.ct-hud__track')?.removeAttribute('aria-hidden')}
 },[mark,entered])
 return <div className="ct-duo-layer" ref={ref}>
  {showEntry&&<DuoEntry onOpen={ctl.open}/>}
  {duo.isOpen&&inLobby(phase)&&<DuoLobby ctl={ctl} definitions={definitions}/>}
  {phase==='starting'&&<SideReveal ctl={ctl}/>}
  {match&&(endless?<EndlessHud ctl={ctl} definitions={definitions}/>:<DuoHud ctl={ctl}/>)}
  {match&&<Countdown ctl={ctl}/>}
  {phase==='results'&&<DuoResults ctl={ctl} definitions={definitions}/>}
  <Toasts ctl={ctl}/>
  <LiveRegion ctl={ctl}/>
 </div>
}
