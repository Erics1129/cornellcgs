// A scripted DuoSession for development and the UI tests (never shipped: loaded only in DEV with ?carrot-duo-mock). It walks every
// phase on timers the way the real session would and can be driven from a test through window.__duoMock (see scripts/carrot-duo-ui-qa).
// Join codes pick an outcome: ZZZZZ room-not-found, FFFFF room-full, PPPPP in-progress, VVVVV version-mismatch, NNNNN network,
// BBBBB busy; any other valid code joins Mia's room as the guest. The fake partner is "Ana" (or "Mia" when you are the guest).
import { ROOM_CODE_RE, START_DELAY_MS, GO_DELAY_MS, RESUME_DELAY_MS, GRACE_MS, errorCopy as protocolCopy, isLevelForMode, roomModeToNet } from '../net/protocol.ts'
import type { CameraMode, CreateSessionOptions, DuoResult, DuoSession, DuoSnapshot, ErrorCode, PageCommand, PauseReason, PeerInfo, Profile, RoomMode, Seat, SessionEvent, Side } from '../net/protocol.ts'
import { idleSnapshot } from './contract.ts'
import { normalizeCode } from './code.ts'

export type MockScript={
 /** ms before the fake partner joins a created room (null: never) */
 partnerJoinMs:number|null
 /** ms after joining before the partner is ready and loaded (null: never) */
 partnerReadyMs:number|null
 /** ms after you press Start in prep before the partner does (null: never) */
 partnerStartMs:number|null
 /** the side the room draws for seat 0 */
 side0:Side
 /** a fixed clock for tests (else Date.now) */
 now?:()=>number
 /** shorter delays for automated runs */
 fast?:boolean
}
export type MockControl={
 session:DuoSession
 script:MockScript
 /** merge into the snapshot and notify */
 set(patch:Partial<DuoSnapshot>):void
 emit(event:SessionEvent):void
 partnerJoin():void
 partnerReady(on?:boolean):void
 partnerStart():void
 partnerPause(on:boolean):void
 partnerAway(on:boolean):void
 result(result:DuoResult):void
 error(code:ErrorCode,detail?:string):void
 log:Array<{at:number;call:string;args:unknown[]}>
 camera:CameraMode|null
}
const defaults:MockScript={partnerJoinMs:900,partnerReadyMs:1400,partnerStartMs:1200,side0:0}

export function createMockSession(options:CreateSessionOptions,script:Partial<MockScript>={}):MockControl{
 const s:MockScript={...defaults,...script}
 const now=s.now||options.now||Date.now
 const scale=s.fast?.25:1
 let snap:DuoSnapshot=idleSnapshot()
 const subs=new Set<(x:DuoSnapshot)=>void>(),events=new Set<(e:SessionEvent)=>void>()
 const timers=new Set<ReturnType<typeof setTimeout>>()
 const later=(ms:number|null,fn:()=>void)=>{if(ms===null)return;const t=setTimeout(()=>{timers.delete(t);fn()},ms*scale);timers.add(t)}
 const clear=()=>{for(const t of timers)clearTimeout(t);timers.clear()}
 const set=(patch:Partial<DuoSnapshot>)=>{snap={...snap,...patch};for(const f of subs)f(snap)}
 const emit=(e:SessionEvent)=>{for(const f of events)f(e)}
 const log:MockControl['log']=[]
 const note=(call:string,...args:unknown[])=>{log.push({at:now(),call,args})}
 let profile:Profile={name:'',unlocked:[25],best:0}
 let partnerTicker:ReturnType<typeof setInterval>|null=null
 const mySeat=():Seat=>snap.seat??0
 const other=():Seat=>mySeat()===0?1:0
 const peer=(seat:Seat,p:Partial<PeerInfo>):PeerInfo=>({seat,name:'',ready:false,connected:true,loaded:0,unlocked:[25],best:0,startReady:false,me:seat===mySeat(),host:seat===0,away:false,...p})
 const withPeer=(seat:Seat,p:Partial<PeerInfo>)=>{const list=snap.peers.filter(x=>x.seat!==seat);const prev=snap.peers.find(x=>x.seat===seat);list.push({...(prev||peer(seat,{})),...p});list.sort((a,b)=>a.seat-b.seat);return list}
 const partnerName=()=>mySeat()===0?'Ana':'Mia'
 const fail=(code:ErrorCode,detail?:string)=>{clear();stopPartner();set({phase:'error',error:{code,message:protocolCopy(code,detail),retry:['network','busy','in-progress','not-ready','unavailable'].includes(code)}})}
 const startPartner=()=>{stopPartner();let t=0;partnerTicker=setInterval(()=>{t++;const p=snap.partner;if(!p||snap.phase==='paused')return
  const wave=Math.min(p.waves,1+Math.floor(t/40)),boss=wave>=p.waves?{name:'Giant Tornado',hp:Math.max(0,4000-t*20),maxHp:4000,phase:1+Math.min(2,Math.floor(t/80))}:null
  set({partner:{...p,wave,coins:p.coins+(t%4===0?5:0),exec:p.exec+8,behind:3,boss,health:Math.max(1,10-Math.floor(t/90))}})},250)}
 const stopPartner=()=>{if(partnerTicker)clearInterval(partnerTicker);partnerTicker=null}
 const engineLoad=()=>{const level=snap.level;const mode=roomModeToNet(snap.roomMode);options.engine.net(JSON.stringify({t:'session',mode,level,seat:mySeat(),side:snap.side??0,seed:12345,names:mySeat()===0?[profile.name||'Player 1',partnerName()]:[partnerName(),profile.name||'Player 2'],netVersion:1}));options.engine.send({type:'load',level})}
 const enterLobby=(seat:Seat,code:string,host:boolean)=>{
  set({phase:'lobby',code,seat,host,error:null,result:null,peers:[peer(seat,{name:profile.name,unlocked:profile.unlocked,best:profile.best,me:true,host})]})
 }
 const partnerJoin=()=>{const seat=other();set({peers:withPeer(seat,{name:partnerName(),me:false,host:seat===0,unlocked:seat===0?[4,8,12,25,26,29]:[25],best:seat===0?17:9,loaded:.2}),path:'p2p',rttMs:38})
  later(s.partnerReadyMs,()=>partnerReady(true))}
 const partnerReady=(on=true)=>set({peers:withPeer(other(),{ready:on,loaded:on?1:.6})})
 const goPlaying=()=>{set({phase:'playing',countdownAt:null,countdownKind:null,pausedBy:null,pauseReason:null});options.engine.send({type:'start'});startPartner()}
 const partnerStart=()=>{const pressed:[boolean,boolean]=[...snap.pressedStart] as [boolean,boolean];pressed[other()]=true;set({pressedStart:pressed});maybeGo()}
 const maybeGo=()=>{if(snap.phase!=='prep'||!snap.pressedStart[0]||!snap.pressedStart[1])return;set({countdownAt:now()+GO_DELAY_MS*scale,countdownKind:'go'});later(GO_DELAY_MS,goPlaying)}
 const pause=(on:boolean,by:Seat|-1,reason:PauseReason)=>{
  if(on){if(snap.phase!=='playing'&&snap.phase!=='paused')return;set({phase:'paused',pausedBy:by,pauseReason:reason,countdownAt:null,countdownKind:null});options.engine.send({type:'setPaused',value:1})}
  else if(snap.phase==='paused'){set({countdownAt:now()+RESUME_DELAY_MS*scale,countdownKind:'resume'});later(RESUME_DELAY_MS,()=>{set({phase:'playing',pausedBy:null,pauseReason:null,countdownAt:null,countdownKind:null});options.engine.send({type:'setPaused',value:0})})}
 }
 const finish=(result:DuoResult)=>{clear();stopPartner();set({phase:'results',result,countdownAt:null,countdownKind:null,pausedBy:null,partnerAway:null,hold:false})}
 const session:DuoSession={
  subscribe(fn){subs.add(fn);return()=>{subs.delete(fn)}},
  get:()=>snap,
  onEvent(fn){events.add(fn);return()=>{events.delete(fn)}},
  async create(p){note('create',p);profile=p;set({phase:'connecting',error:null});await new Promise(r=>later(250,()=>r(null)));if(snap.phase!=='connecting')return snap.code||'';enterLobby(0,'K7M2Q',true);later(s.partnerJoinMs,partnerJoin);return 'K7M2Q'},
  async join(code,p){note('join',code,p);profile=p;const c=normalizeCode(code).code
   if(!ROOM_CODE_RE.test(c)){fail('bad-code');return}
   set({phase:'connecting',code:c,error:null});await new Promise(r=>later(250,()=>r(null)));if(snap.phase!=='connecting')return
   const outcome:Record<string,ErrorCode>={ZZZZZ:'room-not-found',FFFFF:'room-full',PPPPP:'in-progress',VVVVV:'version-mismatch',NNNNN:'network',BBBBB:'busy'}
   if(outcome[c]){fail(outcome[c],c==='VVVVV'?'you':undefined);return}
   enterLobby(1,c,false);partnerJoin()},
  async resume(code,p){note('resume',code,p);return session.join(code,p)},
  setProfile(p){note('setProfile',p);profile=p;if(snap.seat!==null)set({peers:withPeer(snap.seat,{name:p.name,unlocked:p.unlocked,best:p.best})})},
  setLoaded(f){if(snap.seat!==null&&snap.peers.length)set({peers:withPeer(snap.seat,{loaded:Math.max(0,Math.min(1,f))})})},
  configure(mode:RoomMode,level:number,union=false){note('configure',mode,level,union);if(!snap.host||snap.phase!=='lobby')return;if(!isLevelForMode(mode,level)){emit({type:'notice',message:protocolCopy('bad-config')});return}
   set({roomMode:mode,mode:roomModeToNet(mode),level,union,peers:snap.peers.map(x=>({...x,ready:false}))});later(s.partnerReadyMs,()=>partnerReady(true))},
  setReady(on){note('setReady',on);if(snap.seat!==null)set({peers:withPeer(snap.seat,{ready:on})})},
  start(){note('start');const ok=snap.host&&snap.peers.length===2&&snap.peers.every(x=>x.ready&&x.connected&&x.loaded>=1)
   if(!ok){emit({type:'notice',message:protocolCopy('not-ready')});return}
   const sides:[Side,Side]=[s.side0,s.side0===0?1:0]
   set({phase:'starting',sides,side:sides[mySeat()],countdownAt:now()+START_DELAY_MS*scale,countdownKind:'start',pressedStart:[false,false],hold:false,partnerHold:false,result:null,solo:false,canContinueSolo:false,
    partner:{name:partnerName(),health:10,wave:0,waves:snap.mode==='endless'?999:10,coins:850,phase:'ready',exec:0,behind:0,boss:null}})
   engineLoad();later(START_DELAY_MS,()=>set({phase:'prep',countdownAt:null,countdownKind:null}))},
  pressStart(){note('pressStart');if(snap.phase!=='prep')return;const pressed:[boolean,boolean]=[...snap.pressedStart] as [boolean,boolean];pressed[mySeat()]=true;set({pressedStart:pressed});if(!pressed[other()])later(s.partnerStartMs,partnerStart);maybeGo()},
  send(cmd:PageCommand){note('send',cmd)
   if(cmd.type==='start'){session.pressStart();return true}
   if(cmd.type==='load')return true
   if(cmd.type==='pause'){session.pause(snap.phase!=='paused');return true}
   if(cmd.type==='setPaused')return true
   if(cmd.type==='speed'&&snap.mode==='duo'){const v=Number(cmd.value)>=1.5?2:1;set({speed:v});options.engine.send({type:'speed',value:v});return true}
   return false},
  pause(on,reason='manual'){note('pause',on,reason);pause(on,mySeat(),reason)},
  camera(mode){note('camera',mode);control.camera=mode;options.engine.net(JSON.stringify({t:'camera',mode}))},
  presence(pad,tower){note('presence',pad,tower)},
  continueSolo(){note('continueSolo');set({solo:true,canContinueSolo:false,partnerAway:null,phase:'playing',pausedBy:null,pauseReason:null});options.engine.send({type:'setPaused',value:0})},
  endRun(){note('endRun');finish({kind:'endless',waves:Math.max(0,(snap.partner?.wave||1)-1),tick:9000,solo:snap.solo,endedBy:'player'})},
  rematch(){note('rematch');clear();stopPartner();set({phase:'lobby',result:null,partner:null,sides:null,side:null,pressedStart:[false,false],peers:snap.peers.map(x=>({...x,ready:false}))});later(s.partnerReadyMs,()=>partnerReady(true))},
  leave(){note('leave');clear();stopPartner();snap=idleSnapshot();for(const f of subs)f(snap);options.engine.net(JSON.stringify({t:'end'}))},
  dispose(){note('dispose');clear();stopPartner();subs.clear();events.clear()},
 }
 const control:MockControl={session,script:s,set,emit,log,camera:null,
  partnerJoin,partnerReady,partnerStart,
  partnerPause(on){if(on)pause(true,other(),'manual');else pause(false,other(),'manual');emit(on?{type:'partnerPaused',by:other()}:{type:'partnerResumed',by:other()})},
  partnerAway(on){if(on){set({partnerAway:{since:now(),graceMs:GRACE_MS},peers:withPeer(other(),{away:true,connected:false})});pause(true,-1,'away');emit({type:'partnerAway'})}
   else{set({partnerAway:null,peers:withPeer(other(),{away:false,connected:true})});emit({type:'partnerBack'});pause(false,-1,'away')}},
  result:finish,
  error:fail,
 }
 return control
}
