// The page's one handle on multiplayer. useDuo() keeps the session OUT of CarrotPage's React state: the page re-renders only when a
// coarse value changes (available, lobby open, active, phase); every finer value (seats, ping, partner view, toasts) is read by the
// duo components through their own subscriptions. The controller also owns the page-command filter: while a room exists every page
// command passes through filter() first (pause policy, sell confirm, blocked level loads), then through the session.
import { useEffect, useMemo, useState, useSyncExternalStore } from 'react'
import type { MutableRefObject } from 'react'
import build from '../unity-build.json'
import type { CarrotUnity } from '../unity'
import type { Command, GameState, Selection } from '../types'
import type { SnapshotStore } from '../hooks/useSnapshot'
import { LevelCount, readCampaign } from '../progress'
import { NET_VERSION, PAUSE_COOLDOWN_MS, PRESENCE_HZ, errorCopy as protocolCopy } from '../net/protocol.ts'
import type { CameraMode, CreateSessionOptions, DuoSession, DuoSnapshot, EngineLink, NetOut, PageCommand, Profile, RoomMode, SessionEvent, SessionPhase } from './contract'
import { idleSnapshot, inMatch, isEndless, loadedFraction, partnerSeat, peerAt } from './contract'
import { displayName, isDuoFight, readProfile, saveName, ENDLESS_ID } from './profile'
import { readEndless, recordEndlessRun } from './endlessRecord'
import { roomFromHash } from './code'
import { rejectLine } from './copy'

/** The slice of CarrotUnity the net layer drives (net/bridge.ts NetUnity): setSendFilter's filter returns true to let a command through. */
type NetUnity={net(json:string):void;send(cmd:PageCommand):void;setSendFilter?(filter?:(cmd:PageCommand)=>boolean):void;quality?(setting:string):void}
/** EngineLink plus intercept(fn): fn sees every page command first and returns true when it consumed it (net/bridge.ts UnityLink). */
type InterceptLink=EngineLink&{intercept(fn:(cmd:PageCommand)=>boolean):()=>void;dispose?():void}
type NetModule={createDuoSession?:(options:CreateSessionOptions)=>DuoSession;createUnityLink?:(unity:NetUnity,target?:EventTarget,isReady?:()=>boolean)=>InterceptLink;roomsUrl?:()=>string;netVer?:()=>string}
type MockModule=typeof import('./mockSession')
// The net layer is optional at build time: with no net/index.ts the glob is empty and multiplayer stays hidden (and nothing of it is
// downloaded by single-player visitors: the session code is a separate chunk, loaded when the lobby first opens).
const netModules=import.meta.glob<NetModule>('../net/index.ts')
const mockModules:Record<string,()=>Promise<MockModule>>=import.meta.env.DEV?import.meta.glob<MockModule>('./mockSession.ts'):{}

export type UseDuoArgs={store:SnapshotStore;engine:MutableRefObject<CarrotUnity|null>;ready:boolean;entered:boolean;enter:()=>void;loading?:number}
export type Toast={id:number;text:string;tone:'info'|'warn'|'good';at:number;until:number}
export type UiState={open:boolean;toasts:Toast[];polite:string;assertive:string;
 /** the endless run just recorded on this device */
 endless:{key:string;newBest:boolean;best:number;previous:number}|null
 /** counted locally for endless (the snapshot has no per-seat counters): towers this seat built, coins it spent */
 own:{built:number;spent:number}
 copied:string}
type Coarse={available:boolean;isOpen:boolean;active:boolean;phase:SessionPhase}
/** What the page reads: the coarse state, plus the contract's handles (open, send, snapshot) and ctl for the duo components. */
export type DuoState=Coarse&{ctl:DuoController;open:()=>void;send:(cmd:Command)=>void;snapshot:()=>DuoSnapshot}

const params=()=>{try{return new URLSearchParams(location.search)}catch{return new URLSearchParams()}}
const roomsUrl=()=>{const env=String(import.meta.env.VITE_ROOMS_URL||'').trim();if(env)return env;if(import.meta.env.DEV)return params().get('carrot-rooms')||'';return ''}
const mockWanted=()=>import.meta.env.DEV&&params().has('carrot-duo-mock')
const reviewBuild=()=>import.meta.env.DEV&&params().has('carrot-qa')
/** The room's version gate: both peers must run the same Unity build and the same wire protocol. */
export const roomVersion=()=>`${reviewBuild()?'prism-review':build.version}+n${NET_VERSION}`
export const multiplayerConfigured=()=>mockWanted()||(!!roomsUrl()&&Object.keys(netModules).length>0)

type Listener=()=>void
class Store<T>{private v:T;private ls=new Set<Listener>();constructor(v:T){this.v=v}
 get=()=>this.v
 set=(v:T)=>{if(Object.is(v,this.v))return;this.v=v;for(const l of [...this.ls])l()}
 subscribe=(l:Listener)=>{this.ls.add(l);return()=>{this.ls.delete(l)}}}

export class DuoController{
 args:UseDuoArgs
 readonly snap=new Store<DuoSnapshot>(idleSnapshot())
 readonly ui=new Store<UiState>({open:false,toasts:[],polite:'',assertive:'',endless:null,own:{built:0,spent:0},copied:''})
 readonly coarse:Store<Coarse>
 session:DuoSession|null=null
 private pendingSession:Promise<DuoSession|null>|null=null
 private offSession:(()=>void)[]=[]
 private passFilter:((cmd:PageCommand)=>boolean)|undefined
 private filterOn:CarrotUnity|null=null
 private unwrap:(()=>void)|null=null
 private offIntercept:(()=>void)|null=null
 private lastResume=-1e9
 private sellArm:{id:number;at:number}|null=null
 private toastId=0
 private toastTimer:ReturnType<typeof setTimeout>|null=null
 private loadOnReady=0
 private readyOnLobby=false
 private lastLoaded=-1
 private loadedNow=0
 private loadedResent=0
 private lastPresence=''
 private presenceTimer:ReturnType<typeof setTimeout>|null=null
 private idle=false
 private lastPartnerHealth=-1
 private lastPartnerHit=0
 private recorded=''
 private pendingOwn=new Map<number,{op:string;cost:number}>()
 private mock:{session:DuoSession}|null=null
 constructor(args:UseDuoArgs){
  this.args=args
  this.coarse=new Store<Coarse>({available:multiplayerConfigured(),isOpen:false,active:false,phase:'idle'})
 }
 // ---------------------------------------------------------------- engine link (the net layer's view of Unity)
 private game=()=>this.args.engine.current
 /**
  * The player as the net layer sees it, for the controller's whole life: the page creates a new CarrotUnity whenever it enters the
  * game, so every call goes to whichever one is current, and the send filter is re-installed on each new one (attach()).
  */
 private unity:NetUnity={
  net:json=>this.netOut(json),
  send:cmd=>{this.game()?.send(cmd as Command)},
  setSendFilter:filter=>{this.passFilter=filter;this.filterOn=null;this.attach()},
  quality:setting=>{this.game()?.quality(setting)},
 }
 /**
  * Net messages to Unity keep their order and are never lost: while the player is still loading (a reload rejoining a running
  * match, a guest whose garden is still downloading) they wait here and go out, in order, the moment it is ready.
  */
 private netQueue:string[]=[]
 private netOut(json:string){
  const g=this.game() as unknown as {net?:(json:string)=>void}|null
  if(!g?.net||!this.args.ready||this.netQueue.length){if(this.netQueue.length<20000)this.netQueue.push(json);return}
  g.net(json)
 }
 private flushNet(){
  if(!this.netQueue.length||!this.args.ready)return
  const g=this.game() as unknown as {net?:(json:string)=>void}|null;if(!g?.net)return
  const list=this.netQueue.splice(0)
  for(const json of list)g.net(json)
 }
 /** Until the net layer's own link loads (or in the mock), the same contract: intercept() routes page commands, send() bypasses it. */
 private fallbackLink():InterceptLink{
  let bypass=false
  return {
   net:json=>this.unity.net(json),
   onNet:fn=>{const h=(e:Event)=>{const d=(e as CustomEvent).detail;let m:unknown=d;if(typeof d==='string'){try{m=JSON.parse(d)}catch{return}}if(m&&typeof m==='object'&&typeof (m as {t?:unknown}).t==='string')fn(m as NetOut)}
    window.addEventListener('carrot-net',h);return()=>window.removeEventListener('carrot-net',h)},
   send:cmd=>{bypass=true;try{this.unity.send(cmd)}finally{bypass=false}},
   ready:()=>this.args.ready,
   intercept:fn=>{this.unity.setSendFilter?.(cmd=>bypass||!fn(cmd));return()=>this.unity.setSendFilter?.(undefined)},
  }
 }
 private link:InterceptLink=this.fallbackLink()
 private useLink(link:InterceptLink){this.offIntercept?.();if(this.link!==link)this.link.dispose?.();this.link=link;this.offIntercept=link.intercept(this.filter)}
 /** A page command straight to Unity, never filtered (the post-leave stage load). */
 rawSend=(cmd:Command)=>this.link.send(cmd)
 /**
  * Installs the pass filter on the running player: CarrotUnity.setSendFilter (net layer, unity.ts), or on a build without it by
  * wrapping that one instance's send. Re-run whenever the engine object changes.
  */
 attach(){
  const g=this.game()
  if(g&&g===this.filterOn)return
  this.unwrap?.();this.unwrap=null;this.filterOn=null
  if(!g||!this.passFilter)return
  const pass=this.passFilter
  const native=g as unknown as {setSendFilter?:(f?:(c:Command)=>boolean)=>void}
  if(typeof native.setSendFilter==='function'){native.setSendFilter(pass);this.unwrap=()=>native.setSendFilter?.(undefined)}
  else{const own=g as unknown as {send:(c:Command)=>void};const original=own.send;own.send=(c:Command)=>{if(pass(c))original.call(g,c)};this.unwrap=()=>{own.send=original}}
  this.filterOn=g
 }
 detach(){this.unwrap?.();this.unwrap=null;this.filterOn=null}

 // ---------------------------------------------------------------- the page-command filter
 /** True when the command was consumed here or by the session (it must not reach Unity as is). */
 filter=(cmd:PageCommand):boolean=>{
  const s=this.snap.get(),phase=s.phase
  const view=['select','clear','preview','mute'].includes(cmd.type)
  // no room yet (home, connecting or error screen): the overlay covers the board, so only view commands go through
  if(!this.session||phase==='idle'||phase==='error'||phase==='connecting')return !view&&(this.ui.get().open||phase==='error')
  const now=Date.now()
  switch(cmd.type){
   // a room never switches stages from the page (stage select, restart, results)
   case 'load':if(inMatch(phase))this.toast('Leave the room to play another stage','info');return true
   // first-encounter cards are non-blocking in multiplayer: they never pause the match
   case 'setPaused':return true
   case 'pause':return this.pauseToggle(now)
   case 'sell':if(this.confirmSell(now))return true;break
  }
  // the lobby, the side reveal and the results cover the board: nothing reaches the stage behind them but view commands
  if(!inMatch(phase)&&!view)return true
  return this.session.send(cmd)
 }
 /** The page's pause is a toggle; the match pause is explicit, rate-limited, and owned by the session for hidden tabs. */
 private pauseToggle(now:number):boolean{
  const s=this.snap.get(),session=this.session
  if(!session)return false
  // a hidden tab: the session's away logic pauses both players (the page's visibility handler must not toggle anything)
  if(typeof document!=='undefined'&&document.hidden)return true
  if(s.phase==='paused'){if(s.countdownKind==='resume')return true;session.pause(false,'manual');this.lastResume=now;return true}
  if(s.phase!=='playing')return true
  const wait=this.lastResume+PAUSE_COOLDOWN_MS-now
  if(wait>0){this.toast(`You can pause again in ${Math.ceil(wait/1000)} s`,'info');return true}
  session.pause(true,'manual');return true
 }
 /** Endless: selling a tower the partner built needs a second tap within 4 s. */
 private confirmSell(now:number):boolean{
  const s=this.snap.get();if(!isEndless(s)||s.seat===null)return false
  const sel=this.args.store.get()?.selection as (Selection&{builder?:number})|null|undefined
  if(!sel||sel.type!=='tower'||typeof sel.builder!=='number'||sel.builder<0||sel.builder===s.seat)return false
  if(this.sellArm&&this.sellArm.id===sel.id&&now-this.sellArm.at<4000){this.sellArm=null;return false}
  this.sellArm={id:sel.id,at:now}
  this.toast(`Built by ${this.name(sel.builder)}, tap again to sell`,'warn')
  return true
 }

 // ---------------------------------------------------------------- session lifecycle
 private async loadFactory():Promise<((o:CreateSessionOptions)=>{session:DuoSession;mock?:boolean})|null>{
  if(mockWanted()){const load=Object.values(mockModules)[0];if(!load)return null;const m=await load()
   // ?carrot-duo-fast: quarter-length timers; ?carrot-duo-manual: the fake partner never readies or presses Start by itself
   const manual=params().has('carrot-duo-manual')
   return o=>{const control=m.createMockSession(o,{fast:params().has('carrot-duo-fast'),...(manual?{partnerReadyMs:null,partnerStartMs:null}:{})});(window as unknown as {__duoMock?:unknown}).__duoMock=control;return {session:control.session,mock:true}}}
  const load=Object.values(netModules)[0];if(!load||!roomsUrl())return null
  const m=await load();if(typeof m.createDuoSession!=='function')return null
  if(typeof m.createUnityLink==='function'){try{this.useLink(m.createUnityLink(this.unity,window,()=>this.args.ready))}catch{/* keep the fallback link */}}
  if(typeof m.roomsUrl==='function'&&!m.roomsUrl())return null
  const create=m.createDuoSession
  // the net layer's own reading of the rooms URL and the version gate win over this file's copies
  return o=>({session:create({...o,roomsUrl:m.roomsUrl?.()||o.roomsUrl,ver:m.netVer?.()||o.ver})})
 }
 ensureSession():Promise<DuoSession|null>{
  if(this.session)return Promise.resolve(this.session)
  if(this.pendingSession)return this.pendingSession
  this.pendingSession=(async()=>{
   try{
    const factory=await this.loadFactory()
    if(!factory){this.snap.set({...idleSnapshot(),phase:'error',error:{code:'unavailable',message:protocolCopy('unavailable'),retry:false}});this.sync();return null}
    if(!this.offIntercept)this.useLink(this.link)
    const {session,mock}=factory({engine:this.link,roomsUrl:roomsUrl(),ver:roomVersion()})
    if(mock)this.mock={session}
    this.session=session
    this.offSession.push(session.subscribe(snap=>this.onSnapshot(snap)),session.onEvent(e=>this.onEvent(e)))
    this.onSnapshot(session.get())
    return session
   }catch{this.snap.set({...idleSnapshot(),phase:'error',error:{code:'network',message:protocolCopy('network'),retry:true}});this.sync();return null}
   finally{this.pendingSession=null}
  })()
  return this.pendingSession
 }
 private disposeSession(){this.netQueue=[];for(const off of this.offSession.splice(0))off();this.session?.dispose();this.session=null;this.mock=null;this.snap.set(idleSnapshot());this.sync()}

 // ---------------------------------------------------------------- what the lobby and HUD call
 open=()=>{this.setUi({open:true});void this.ensureSession()}
 /** Close the overlay (from the home or error screen): back to the title screen, or to the player's own stage when the game is open. */
 close=()=>{
  const s=this.snap.get()
  if(s.phase!=='idle'&&s.phase!=='error'&&this.session){this.session.leave()}
  this.disposeSession();this.setUi({open:false});this.clearHash();this.backToSolo()
 }
 private profile(name?:string):Profile{return readProfile(name===undefined?undefined:saveName(name))}
 create=async(name:string)=>{const session=await this.ensureSession();if(!session)return;this.args.enter();try{const code=await session.create(this.profile(name));if(code)this.setHash(code)}catch{/* the session reports its own error */}}
 join=async(code:string,name:string)=>{const session=await this.ensureSession();if(!session)return;this.args.enter();try{await session.join(code,this.profile(name));const c=this.snap.get().code;if(c)this.setHash(c)}catch{/* reported by the session */}}
 resume=async(code:string)=>{const session=await this.ensureSession();if(!session)return;this.args.enter();try{await session.resume(code,this.profile())}catch{/* reported by the session */}}
 rename=(name:string)=>{const clean=saveName(name);this.session?.setProfile(this.profile(clean));return clean}
 configure=(mode:RoomMode,level:number,union:boolean)=>this.session?.configure(mode,level,union)
 setReady=(on:boolean)=>this.session?.setReady(on)
 start=()=>this.session?.start()
 pause=(on:boolean)=>{const now=Date.now();if(on){const wait=this.lastResume+PAUSE_COOLDOWN_MS-now;if(wait>0){this.toast(`You can pause again in ${Math.ceil(wait/1000)} s`,'info');return}}else this.lastResume=now;this.session?.pause(on,'manual')}
 camera=(mode:CameraMode)=>this.session?.camera(mode)
 continueSolo=()=>this.session?.continueSolo()
 endRun=()=>this.session?.endRun()
 /** Back to the room with the same choice; `ready` marks this player ready again (Rematch), false leaves the choice open (Change fight). */
 rematch=(ready=false)=>{this.readyOnLobby=ready;this.session?.rematch()}
 /** Leave the room: back to the duo home screen (create or join), the overlay stays open. */
 leave=()=>{this.session?.leave();this.clearHash();this.setUi({open:true,endless:null})}
 /** From the error screen: try the last action again (a deep link or the code the player typed is kept by the lobby). */
 retry=()=>{const s=this.snap.get();const code=s.code;this.disposeSession();this.setUi({open:true});if(code)void this.resume(code);else void this.ensureSession()}
 back=()=>{this.disposeSession();this.setUi({open:true});void this.ensureSession()}
 copied=(what:string)=>{this.setUi({copied:what});this.announce(what==='link'?'Room link copied':'Room code copied')}
 dismissToast=(id:number)=>this.setUi({toasts:this.ui.get().toasts.filter(t=>t.id!==id)})
 name=(seat:number)=>{const s=this.snap.get();const p=peerAt(s,seat as 0|1);if(p&&p.me)return 'You';return displayName(p?.name||(seat===partnerSeat(s.seat)?s.partner?.name:''),seat)}
 partnerName=()=>{const s=this.snap.get();const seat=partnerSeat(s.seat);return displayName(peerAt(s,seat)?.name||s.partner?.name||'',seat)}

 // ---------------------------------------------------------------- reactions to the session
 private onSnapshot(next:DuoSnapshot){
  const prev=this.snap.get()
  this.snap.set(next)
  if(next.phase!==prev.phase)this.onPhase(prev,next)
  // the room learns this player's loading progress even when it was reported before the seat existed
  const mine=next.peers.find(p=>p.me)
  if(mine&&Math.abs(loadedFraction(mine.loaded)-this.loadedNow)>=.02&&Date.now()-this.loadedResent>1000){this.loadedResent=Date.now();queueMicrotask(()=>this.session?.setLoaded(this.loadedNow))}
  if(next.result&&next.result!==prev.result)this.onResult(next)
  if(next.hold&&!prev.hold)this.announce(`Your garden is safe. Waiting for ${this.partnerName()}.`)
  if(next.partnerHold&&!prev.partnerHold)this.announce(`${this.partnerName()}'s garden is safe.`)
  if(next.partnerAway&&!prev.partnerAway)this.announce(`${this.partnerName()} stepped away. The match is paused.`,true)
  if(!next.partnerAway&&prev.partnerAway&&inMatch(next.phase))this.announce(`${this.partnerName()} is back.`)
  if(inMatch(next.phase)&&next.path!==prev.path&&prev.path!=='none'&&next.path!=='none')this.announce(next.path==='relay'?'Connection switched to the relay.':'Direct connection restored.')
  // the room lobby: a friend joining or leaving is shown and announced (their name from before they left)
  if(next.phase==='lobby'&&prev.phase==='lobby'){
   const was=prev.peers.find(p=>!p.me),now=next.peers.find(p=>!p.me)
   if(was&&!now)this.toast(`${displayName(was.name,was.seat)} left the room`,'info')
   else if(!was&&now)this.announce(`${displayName(now.name,now.seat)} joined the room.`)
  }
  const h=next.partner?.health??-1
  if(h>=0&&this.lastPartnerHealth>=0&&h<this.lastPartnerHealth&&inMatch(next.phase)){const t=Date.now();if(t-this.lastPartnerHit>6000){this.lastPartnerHit=t;this.announce(`${this.partnerName()}'s carrot was hit: ${h} ${h===1?'heart':'hearts'} left.`)}}
  this.lastPartnerHealth=h
  this.sync()
 }
 private onPhase(prev:DuoSnapshot,next:DuoSnapshot){
  if(next.phase==='lobby'&&prev.phase==='connecting')this.announce(next.host?`Room ${next.code} is open. Share the code with your friend.`:`Joined room ${next.code}.`)
  if(next.phase==='starting')this.announce('The match is starting.',true)
  if(next.phase==='playing'&&prev.phase==='prep')this.announce('Wave 1. Defend your garden.')
  if(next.phase==='error'){this.setUi({open:true});this.announce(next.error?.message||'Connection problem.',true)}
  if(next.phase==='lobby'&&(prev.phase==='results'||inMatch(prev.phase))){this.setUi({open:true,endless:null});if(this.readyOnLobby)queueMicrotask(()=>this.session?.setReady(true));this.readyOnLobby=false}
  if(next.phase==='idle'&&prev.phase!=='idle'){this.lastPartnerHealth=-1;this.setUi({own:{built:0,spent:0}})}
  if(next.phase==='starting'){this.lastResume=-1e9;this.setUi({own:{built:0,spent:0},endless:null});this.pendingOwn.clear()}
 }
 private onResult(s:DuoSnapshot){
  const r=s.result;if(!r)return
  if(r.kind==='endless'){
   const key=`${s.code}:${r.tick}:${r.waves}`;if(this.recorded===key)return;this.recorded=key
   const st=this.args.store.get(),seconds=typeof st?.elapsed==='number'?st.elapsed:0,kills=st?.stats?.kills||0
   const out=recordEndlessRun(readEndless(),{waves:r.waves,seconds,kills,partner:this.partnerName(),solo:r.solo})
   this.setUi({endless:{key,newBest:out.newBest,best:out.record.best?.waves||0,previous:out.previous?.waves||0}})
   this.session?.setProfile(this.profile())
   this.announce(`${r.waves} ${r.waves===1?'wave':'waves'} survived${out.newBest?'. New best':''}.`,true)
  }else if(r.kind==='duoWin')this.announce('Both gardens held. Win recorded for both players.',true)
  else if(r.kind==='duoLoss')this.announce(r.fell===s.seat?'Your carrot fell. The match is over.':`${this.partnerName()}'s carrot fell. The match is over.`,true)
  else this.announce('The match ended early. Nothing was recorded.',true)
 }
 private onEvent(e:SessionEvent){
  const partner=this.partnerName()
  switch(e.type){
   case 'partnerTap':this.toast(`That's ${partner}'s side`,'info',1000);break
   case 'resynced':this.toast('Resynced','good');break
   case 'reject':this.rejected(e.s);this.toast(rejectLine(e.reason,partner),'warn');break
   case 'partnerPaused':this.announce(`${partner} paused the match.`);break
   case 'partnerResumed':this.announce(`${partner} resumed. Three, two, one.`);break
   case 'partnerLeft':this.announce(`${partner} left the room.`,true);break
   case 'partnerResult':if(e.outcome==='cleared')this.announce(`${partner}'s garden is safe.`);break
   case 'notice':this.toast(e.message,'info');break
   default:break
  }
 }
 // ---------------------------------------------------------------- page bookkeeping
 /** After every page render (an effect, never during render): the filter follows the engine object, loading progress reaches the room. */
 effects(){
  const args=this.args
  if(args.engine.current!==this.filterOn)this.attach()
  this.flushNet()
  if(args.ready&&this.loadOnReady){const id=this.loadOnReady;this.loadOnReady=0;this.rawSend({type:'load',level:id})}
  const loaded=args.ready?1:Math.max(0,Math.min(.99,args.loading||0))
  this.loadedNow=loaded
  if(this.session&&(Math.abs(loaded-this.lastLoaded)>=.02||(loaded===1&&this.lastLoaded!==1))){this.lastLoaded=loaded;this.session.setLoaded(loaded)}
  this.sync()
 }
 /** After leaving multiplayer with the game open: the player's own next stage (the room's level is not a solo run). */
 private backToSolo(){
  if(!this.args.entered)return
  // the game was opened for the room: whatever it holds now (the page's default stage, a duo half, Twin Gates) is not the player's run
  const st=this.args.store.get(),id=Math.min(LevelCount,readCampaign().unlocked)
  const netLevel=!!st&&(st.level===ENDLESS_ID||(isDuoFight(st.level)&&(st.mode==='duo'||!!(st as GameState&{net?:unknown}).net)))
  if(st&&!netLevel&&st.level===id)return
  if(this.args.ready)this.rawSend({type:'load',level:id});else this.loadOnReady=id
 }
 /** Endless presence: the pad or tower this player has selected, for the partner's ring (the session rate-limits it). */
 presenceFrom(st:GameState|null){
  const s=this.snap.get();if(!this.session||!isEndless(s)||!inMatch(s.phase))return
  const sel=st?.selection,pad=sel?.type==='pad'?sel.id:-1,tower=sel?.type==='tower'?sel.id:-1,key=`${pad}/${tower}`
  if(key===this.lastPresence)return;this.lastPresence=key;this.session.presence(pad,tower)
  // the session drops a change that comes within its 5 Hz window: send the latest once more just after it
  if(this.presenceTimer)clearTimeout(this.presenceTimer)
  this.presenceTimer=setTimeout(()=>{this.presenceTimer=null;if(this.lastPresence===key)this.session?.presence(pad,tower)},1000/PRESENCE_HZ+20)
 }
 /** Own pending ops leave the snapshot's pending list when they execute or are rejected (rejections arrive as events first). */
 ownFrom(st:GameState|null){
  const net=(st as GameState&{net?:{pending?:Array<{s:number;op:string;cost:number}>}}|null)?.net
  const s=this.snap.get();if(!net||!isEndless(s))return
  const pending=net.pending||[],seen=new Set(pending.map(p=>p.s))
  for(const p of pending)if(!this.pendingOwn.has(p.s))this.pendingOwn.set(p.s,{op:p.op,cost:Math.max(0,Number(p.cost)||0)})
  let {built,spent}=this.ui.get().own,changed=false
  for(const [seq,p] of this.pendingOwn)if(!seen.has(seq)){this.pendingOwn.delete(seq);if(p.op==='buy'||p.op==='upgrade'){spent+=p.cost;if(p.op==='buy')built++;changed=true}}
  if(changed)this.setUi({own:{built,spent}})
 }
 rejected(s:number){this.pendingOwn.delete(s)}
 // ---------------------------------------------------------------- UI store helpers
 private setUi(patch:Partial<UiState>){this.ui.set({...this.ui.get(),...patch});this.sync()}
 toast(text:string,tone:Toast['tone']='info',dedupeMs=1500){
  const now=Date.now(),list=this.ui.get().toasts.filter(t=>t.until>now)
  if(list.some(t=>t.text===text&&t.at>now-dedupeMs))return
  const toast={id:++this.toastId,text,tone,at:now,until:now+3200}
  this.setUi({toasts:[...list,toast].slice(-3)})
  this.announce(text)
  if(this.toastTimer)clearTimeout(this.toastTimer)
  this.toastTimer=setTimeout(()=>{this.toastTimer=null;const t=Date.now();this.setUi({toasts:this.ui.get().toasts.filter(x=>x.until>t)})},3300)
 }
 private announceFlip=false
 announce(text:string,assertive=false){this.announceFlip=!this.announceFlip;const t=text+(this.announceFlip?' ':'');this.setUi(assertive?{assertive:t}:{polite:t})}
 private sync(){
  const s=this.snap.get(),ui=this.ui.get(),c=this.coarse.get()
  const isOpen=ui.open||s.phase==='error'
  // active: a room exists, or the overlay covers the page (after leaving a finished match the page's own Results stay hidden too)
  const active=(!!this.session&&s.phase!=='idle'&&s.phase!=='error'&&s.phase!=='connecting')||isOpen
  // the lobby covers the whole canvas: Unity may drop to a low frame rate (EngineLink.idle, when the bridge offers it)
  const idle=this.args.ready&&isOpen&&!inMatch(s.phase)&&s.phase!=='starting'&&s.phase!=='results'
  if(idle!==this.idle){this.idle=idle;try{this.link.idle?.(idle)}catch{/* optional */}}
  if(c.active!==active||c.isOpen!==isOpen||c.phase!==s.phase)this.coarse.set({...c,active,isOpen,phase:s.phase})
 }
 private setHash(code:string){try{history.replaceState(history.state,'',`${location.pathname}${location.search}#room=${code}`)}catch{/* sandboxed: the code is still on screen */}}
 private clearHash(){try{if(roomFromHash(location.hash))history.replaceState(history.state,'',`${location.pathname}${location.search}`)}catch{/* ignore */}}
 /** The deep link this page was opened with (#room=CODE), once. */
 deepLink(){const code=roomFromHash(typeof location==='undefined'?'':location.hash);if(!code||!this.coarse.get().available)return;this.setUi({open:true});void this.resume(code)}
 dispose(){this.disposeSession();if(this.toastTimer)clearTimeout(this.toastTimer);if(this.presenceTimer)clearTimeout(this.presenceTimer)}
 /** A page command from a duo component: through the same filter as the page's own, then to Unity unless it was consumed. */
 send=(cmd:Command)=>{if(!this.filter(cmd))this.rawSend(cmd)}
}

/**
 * Multiplayer for CarrotPage: `available` (show the entry), `isOpen` (the lobby overlay), `active` (a room exists or the overlay is
 * open: the page's own Results stay hidden), `phase`, the contract's open/send/snapshot, and `ctl` for the duo components. Page
 * commands go through the controller's filter whenever a session exists (installed on CarrotUnity through the net layer's link).
 */
export function useDuo(args:UseDuoArgs):DuoState{
 const [ctl]=useState(()=>new DuoController(args))
 ctl.args=args
 useEffect(()=>{ctl.effects()})
 // the #room=CODE deep link opens straight into the room (deferred a tick so a development double-mount cancels the first one)
 useEffect(()=>{const t=setTimeout(()=>ctl.deepLink(),0);return()=>clearTimeout(t)},[ctl])
 useEffect(()=>()=>ctl.dispose(),[ctl])
 // endless: presence and the own-spend count follow the snapshot (no React state per publish)
 useEffect(()=>args.store.subscribe(()=>{const st=args.store.get();ctl.presenceFrom(st);ctl.ownFrom(st)}),[ctl,args.store])
 const coarse=useSyncExternalStore(ctl.coarse.subscribe,ctl.coarse.get)
 return useMemo(()=>({...coarse,ctl,open:ctl.open,send:ctl.send,snapshot:ctl.snap.get}),[coarse,ctl])
}
/** A slice of the session snapshot (re-renders only when the selected value changes). */
export function useDuoSlice<T>(ctl:DuoController,select:(s:DuoSnapshot)=>T,equal:(a:T,b:T)=>boolean=shallow):T{return useSelect(ctl.snap,select,equal)}
export function useDuoUi<T>(ctl:DuoController,select:(s:UiState)=>T,equal:(a:T,b:T)=>boolean=shallow):T{return useSelect(ctl.ui,select,equal)}
function useSelect<S,T>(store:Store<S>,select:(s:S)=>T,equal:(a:T,b:T)=>boolean):T{
 const cache=useMemo(()=>({has:false,value:undefined as unknown as T}),[store])
 const get=()=>{const v=select(store.get());if(cache.has&&equal(cache.value,v))return cache.value;cache.has=true;cache.value=v;return v}
 return useSyncExternalStore(store.subscribe,get)
}
export function shallow(a:unknown,b:unknown):boolean{
 if(Object.is(a,b))return true
 if(!a||!b||typeof a!=='object'||typeof b!=='object'||Array.isArray(a)!==Array.isArray(b))return false
 const ka=Object.keys(a),kb=Object.keys(b);if(ka.length!==kb.length)return false
 for(const k of ka)if(!Object.is((a as Record<string,unknown>)[k],(b as Record<string,unknown>)[k]))return false
 return true
}
