// Everything multiplayer draws, in one layer at the page root (so the lobby also shows while Unity loads). Only the entry pill and
// the page-root marks load with the page; the screens (DuoScreens: lobby, reveal, HUD, results) are a separate chunk fetched the
// first time multiplayer opens (or prefetched when the pill is hovered or focused), so single-player visitors never download them.
// The marks (data-duo, data-duo-phase, data-duo-entry on .ct-page) let duo-base.css adjust the stock HUD without touching its files.
import { Suspense, lazy, useEffect, useRef, useState } from 'react'
import type { GameDefinitions } from '../types'
import type { DuoState } from './useDuo'
import { useDuoSlice, useDuoUi } from './useDuo'
import { inMatch, isEndless } from './contract'
import { DuoEntry } from './DuoEntry'
import './duo-base.css'

const loadScreens=()=>import('./DuoScreens')
const DuoScreens=lazy(loadScreens)

export function DuoLayer({duo,entered,definitions}:{duo:DuoState;entered:boolean;definitions:GameDefinitions|null;reduced?:boolean}){
 const {ctl,phase}=duo
 const ref=useRef<HTMLDivElement>(null)
 const endless=useDuoSlice(ctl,s=>isEndless(s))
 const match=inMatch(phase)
 const showEntry=!entered&&duo.available&&!duo.isOpen&&phase==='idle'
 // the screens chunk stays unloaded until multiplayer is first used, then stays mounted
 const [wanted,setWanted]=useState(false)
 const needed=duo.isOpen||phase!=='idle'
 useEffect(()=>{if(needed)setWanted(true)},[needed])
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
  {showEntry&&<DuoEntry onOpen={ctl.open} onIntent={()=>{void loadScreens()}}/>}
  {(wanted||needed)&&<Suspense fallback={null}><DuoScreens duo={duo} definitions={definitions}/></Suspense>}
  {duo.available&&<LiveRegion duo={duo}/>}
 </div>
}
/**
 * Partner events and every toast reach screen readers here (the toasts themselves are not live regions, so nothing is read twice).
 * Mounted with the page, before anything is announced, as screen readers expect of a live region.
 */
function LiveRegion({duo}:{duo:DuoState}){
 const t=useDuoUi(duo.ctl,u=>({polite:u.polite,assertive:u.assertive}))
 return <div className="ct-duo ct-duo-sr"><p aria-live="polite" aria-atomic="true">{t.polite}</p><p aria-live="assertive" aria-atomic="true">{t.assertive}</p></div>
}
