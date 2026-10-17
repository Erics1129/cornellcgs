// Every sentence the duo screens show, as pure functions (tested in scripts/test-carrot-duo-ui.mjs). The error bodies are the
// protocol's own copy (net/protocol.ts errorCopy); this file adds a short headline and whether Retry makes sense. Names are passed in
// already cleaned (profile.displayName); nothing here reads the DOM or storage.
import { errorCopy as protocolCopy } from '../net/protocol.ts'
import type { DuoResult, ErrorCode, SessionError } from '../net/protocol.ts'

export type ErrorCopy={title:string;body:string;retry:boolean}
// headlines name the situation; the body (the protocol's copy) says what to do, so the two never repeat each other
const titles:Record<string,string>={
 'room-not-found':'Room not found','room-full':'Room full','in-progress':'Match in progress',
 'version-mismatch':'Update needed','network':"Can't reach the server",'busy':'Daily limit reached','partner-left':'Room closed',
 'desync':'Match stopped','origin':'Not available here','bad-code':'Check the code','not-ready':'Not everyone is ready','not-host':'Host only',
 'bad-config':'Pick another fight','pause-cooldown':'Pause cooling down','unavailable':'Multiplayer is unavailable',
}
const retryable=new Set(['network','busy','in-progress','not-ready','unavailable'])
/** The screen for a session error: a headline, the protocol's copy (or the session's own message) and whether Retry is offered. */
export function errorCopy(error:Partial<SessionError>|null|undefined):ErrorCopy{
 const code=(error?.code||'network') as ErrorCode
 return {title:titles[code]||titles.network,body:error?.message||protocolCopy(code),retry:typeof error?.retry==='boolean'?error.retry:retryable.has(code)}
}

/** "WEST" / "EAST" for the x-split fights, "NORTH" / "SOUTH" for Asuna (L29). */
export const sideWord=(layout:'x'|'z',side:number)=>layout==='z'?(side===0?'NORTH':'SOUTH'):(side===0?'WEST':'EAST')
export const sideLine=(layout:'x'|'z',side:number)=>`You defend the ${sideWord(layout,side)} garden`
export const wingLine=(side:number)=>`You start at the ${side===0?'WEST':'EAST'} gate`

export type ResultCopy={title:string;line:string;recorded:string;tone:'win'|'loss'|'neutral'}
/**
 * The results card's headline, its one line and what was recorded. `names` is indexed by seat; `mySeat` is this player's seat.
 * `newBest` and `best` only matter for endless.
 */
export function resultCopy(result:DuoResult,names:[string,string],mySeat:number,extra:{newBest?:boolean;best?:number}={}):ResultCopy{
 const partner=names[mySeat===0?1:0]
 switch(result.kind){
  case 'duoWin':return {title:'Both gardens held',line:`You and ${partner} cleared every wave and both guardians.`,recorded:'Win recorded for both players',tone:'win'}
  case 'duoLoss':{
   const fell:number=typeof result.fell==='number'?result.fell:-1
   const who=fell===mySeat?'Your carrot fell':fell===0||fell===1?`${names[fell]||result.fellName}'s carrot fell`:'A carrot fell'
   const at=typeof result.wave==='number'&&result.wave>0?`On wave ${result.wave}. `:''
   return {title:who,line:`${at}Either carrot falling ends the match.`,recorded:'Counted like a solo loss: your records only keep bests',tone:'loss'}}
  case 'unfinished':{
   const line=result.reason==='desync'?"Connection problem: this match can't continue.":result.reason==='left'?(result.by===mySeat?'You left the match.':`${partner} left the match.`):result.reason==='grace'?`${partner} didn't come back in time.`:'The match ended early.'
   return {title:'Match unfinished',line,recorded:'Nothing was recorded',tone:'neutral'}}
  case 'endless':{
   const waves=Math.max(0,Math.floor(result.waves||0))
   const title=`${waves} ${waves===1?'wave':'waves'} survived`
   const line=result.endedBy==='connection'?'Ended by a connection problem: scored up to the last verified wave.':result.solo?'Finished solo after your partner left.':result.endedBy==='player'?`You ended the run with ${partner}.`:`With ${partner} at Twin Gates.`
   const recorded=extra.newBest?'New best on this device':extra.best&&extra.best>0?`Best on this device: ${extra.best} ${extra.best===1?'wave':'waves'}`:'Recorded on this device'
   return {title,line,recorded,tone:extra.newBest?'win':'neutral'}}
 }
 return {title:'Match over',line:'',recorded:'',tone:'neutral'}
}

/** "0:42" for a countdown in milliseconds (never negative; rounds up so 0:00 means done). */
export const clockText=(ms:number)=>{const s=Math.max(0,Math.ceil(ms/1000));return `${Math.floor(s/60)}:${String(s%60).padStart(2,'0')}`}
/** Endless: the next miniboss (waves ending in 5) or boss (ending in 0) after `wave`, and how many waves away it is. */
export function nextSpecial(wave:number):{kind:'boss'|'miniboss';in:number;wave:number}{
 const w=Math.max(0,Math.floor(wave))
 for(let k=1;k<=10;k++){const n=w+k;if(n%10===0)return {kind:'boss',in:k,wave:n};if(n%10===5)return {kind:'miniboss',in:k,wave:n}}
 return {kind:'boss',in:10,wave:w+10}
}
export const specialLine=(s:{kind:'boss'|'miniboss';in:number})=>`${s.kind==='boss'?'Boss':'Miniboss'} ${s.in===1?'next wave':`in ${s.in} waves`}`
/** A lockstep rejection, as the issuer reads it (only the issuer ever sees it). */
export function rejectLine(reason:string,partner:string):string{
 switch(reason){
  case 'pad':case 'padTaken':case 'occupied':return `Pad taken by ${partner}`
  case 'coins':case 'gold':case 'funds':return 'More coins needed'
  case 'tier':case 'changed':case 'stale':return `${partner} changed that tower first`
  case 'gone':case 'missing':return `${partner} sold that tower first`
  default:return 'That action did not go through'
 }
}
