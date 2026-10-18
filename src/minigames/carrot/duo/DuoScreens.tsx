// Every multiplayer screen past the entry pill, as one chunk loaded the first time multiplayer opens (DuoLayer): the lobby, the side
// reveal, the duo or endless HUD additions with the shared countdown, the results, the toasts and the aria-live regions.
import type { GameDefinitions } from '../types'
import type { DuoState } from './useDuo'
import { useDuoSlice } from './useDuo'
import { inLobby, inMatch, isEndless } from './contract'
import { DuoLobby } from './DuoLobby'
import { SideReveal } from './SideReveal'
import { DuoHud } from './DuoHud'
import { EndlessHud } from './EndlessHud'
import { DuoResults } from './DuoResults'
import { Countdown, Toasts } from './bits'
import './duo.css'

export default function DuoScreens({duo,definitions}:{duo:DuoState;definitions:GameDefinitions|null}){
 const {ctl,phase}=duo
 const endless=useDuoSlice(ctl,s=>isEndless(s))
 const match=inMatch(phase)
 return <>
  {duo.isOpen&&inLobby(phase)&&<DuoLobby ctl={ctl} definitions={definitions}/>}
  {phase==='starting'&&<SideReveal ctl={ctl}/>}
  {match&&(endless?<EndlessHud ctl={ctl} definitions={definitions}/>:<DuoHud ctl={ctl}/>)}
  {match&&<Countdown ctl={ctl}/>}
  {phase==='results'&&<DuoResults ctl={ctl} definitions={definitions}/>}
  <Toasts ctl={ctl}/>
 </>
}
