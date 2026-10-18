// The boundary this UI codes against: the frozen DuoSession contract in net/protocol.ts (owned by the net layer). Re-exported here so
// every duo/* file imports one place, plus the few UI helpers derived from it. Fields the UI would like but the contract does not carry
// are read as optional extras (see docs/carrot-defense/duo/ui.md, "Fields the UI reads") and the UI degrades without them.
import type { DuoSnapshot, PeerInfo, Seat, SessionPhase, SnapshotNet } from '../net/protocol.ts'
export type { CameraMode, CountdownKind, CreateSessionOptions, DuoResult, DuoSession, DuoSnapshot, EngineLink, ErrorCode, NetOut, PageCommand, PartnerView, PathKind, PeerInfo, Profile, RoomMode, Seat, SessionError, SessionEvent, SessionPhase, Side, SnapshotNet } from '../net/protocol.ts'

/** The match phases: the own half or the shared map is on screen and the lobby is closed. */
export const inMatch=(phase:SessionPhase)=>phase==='prep'||phase==='playing'||phase==='paused'
/** The lobby overlay's phases (the room screens and the error screen). */
export const inLobby=(phase:SessionPhase)=>phase==='idle'||phase==='connecting'||phase==='lobby'||phase==='error'
export const isEndless=(s:Pick<DuoSnapshot,'mode'|'roomMode'>)=>s.mode==='endless'||s.roomMode==='endless2p'
export const partnerSeat=(seat:Seat|null):Seat=>seat===1?0:1
export const peerAt=(s:Pick<DuoSnapshot,'peers'>,seat:Seat):PeerInfo|undefined=>s.peers.find(p=>p.seat===seat)
export const loadedFraction=(v:unknown)=>typeof v==='boolean'?(v?1:0):Math.max(0,Math.min(1,Number(v)||0))

/**
 * Per-seat counters for endless (towers built, coins spent, damage): not in the frozen snapshot. Read when Unity's net block carries
 * them as `seats` (an additive field the sim may publish); otherwise the UI shows only what it can count for the local seat.
 */
export type SeatCounters={built?:number;spent?:number;damage?:number}
export type NetBlock=SnapshotNet&{seats?:SeatCounters[];spent?:number[]}
/** The per-seat counters: `seats` when the sim publishes them, else the coins each seat spent (Unity's net.spent, [seat0, seat1]). */
export const seatCounters=(net:NetBlock|null|undefined):SeatCounters[]|undefined=>net?.seats??(Array.isArray(net?.spent)&&net.spent.length===2?net.spent.map(v=>({spent:Math.max(0,Number(v)||0)})):undefined)
export const idleSnapshot=():DuoSnapshot=>({phase:'idle',code:null,seat:null,host:false,roomMode:'duoBoss',mode:'duo',level:25,union:false,side:null,sides:null,countdownAt:null,countdownKind:null,peers:[],path:'none',rttMs:0,inputDelayMs:0,pausedBy:null,pauseReason:null,partnerAway:null,hiccup:false,waiting:false,reconnecting:false,pressedStart:[false,false],hold:false,partnerHold:false,partner:null,restoring:null,canContinueSolo:false,solo:false,speed:1,result:null,error:null,resyncs:0,
 stats:{path:'none',rttMs:0,inputDelayMs:0,delayTicks:0,replicaBehind:0,stalls20s:0,bytesOutPerSec:0,bytesInPerSec:0,framesOut:0,framesIn:0,digestsCompared:0,unverified:0,resyncs:0,pathSwitches:0,slowedFor:-1,rate:1}})
