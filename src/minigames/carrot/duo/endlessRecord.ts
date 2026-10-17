// The two-player endless record, `cgs-carrot-endless2p-v1` (this device only; no account sync, see docs/carrot-defense/duo/ui.md):
//   {version:1, best:{waves, seconds, kills, partner (24 chars or fewer), solo, at (ISO)}|null, runs}
// More waves wins; a tie keeps the earlier record. Reads survive blocked storage and corrupt JSON (a fresh record); writes are unioned
// with what is stored first, so a copy computed from stale React state can never lower a best another tab just wrote.
import { NAME_MAX, STORAGE_KEYS } from '../net/protocol.ts'
export const ENDLESS_KEY=STORAGE_KEYS.endlessBest
export { NAME_MAX }
export type EndlessBest={waves:number;seconds:number;kills:number;partner:string;solo:boolean;at:string}
export type EndlessRecord={version:1;best:EndlessBest|null;runs:number}
export type EndlessRun={waves:number;seconds?:number;kills?:number;partner?:string;solo?:boolean;at?:string}

export const freshEndless=():EndlessRecord=>({version:1,best:null,runs:0})
const int=(v:unknown,max:number)=>{const n=Math.floor(Number(v));return Number.isFinite(n)&&n>0?Math.min(max,n):0}
/** A display name as stored: control characters dropped, whitespace collapsed, at most 24 characters. */
export function cleanName(v:unknown):string{
 if(typeof v!=='string')return ''
 // control, zero-width and bidi-override characters never reach a name another player sees
 const kept=[...v.replace(/[\t\n\r]/g,' ')].filter(ch=>{const c=ch.codePointAt(0)||0;return !(c<0x20||(c>=0x7f&&c<=0x9f)||(c>=0x200b&&c<=0x200f)||(c>=0x2028&&c<=0x202e)||(c>=0x2066&&c<=0x2069))}).join('')
 return [...kept.replace(/\s+/g,' ').trim()].slice(0,NAME_MAX).join('').trim()
}
const cleanAt=(v:unknown)=>{if(typeof v!=='string'||v.length>40)return '';const t=Date.parse(v);return Number.isFinite(t)?new Date(t).toISOString():''}
function cleanBest(raw:unknown):EndlessBest|null{
 if(!raw||typeof raw!=='object')return null
 const r=raw as Partial<EndlessBest>,waves=int(r.waves,100000)
 if(!waves)return null
 const seconds=Number(r.seconds)
 return {waves,seconds:Number.isFinite(seconds)&&seconds>0?Math.round(Math.min(seconds,864000)*10)/10:0,kills:int(r.kills,10000000),partner:cleanName(r.partner),solo:r.solo===true,at:cleanAt(r.at)}
}
/** The stored shape, cleaned; null for anything that is not a version-1 record. */
export function cleanEndless(raw:unknown):EndlessRecord|null{
 if(!raw||typeof raw!=='object'||(raw as {version?:unknown}).version!==1)return null
 const r=raw as Partial<EndlessRecord>
 return {version:1,best:cleanBest(r.best),runs:int(r.runs,10000000)}
}
const storage=():Storage|null=>{try{return typeof localStorage==='undefined'?null:localStorage}catch{return null}}
/** The stored record, or null when storage is blocked, empty or unusable. */
export function rawEndless():EndlessRecord|null{try{const s=storage();return s?cleanEndless(JSON.parse(s.getItem(ENDLESS_KEY)||'null')):null}catch{return null}}
export function readEndless():EndlessRecord{return rawEndless()??freshEndless()}

/** True when `a` should replace `b` as the best: more waves; on a tie the earlier run (an unknown time counts as later). */
function better(a:EndlessBest,b:EndlessBest|null):boolean{
 if(!b)return true
 if(a.waves!==b.waves)return a.waves>b.waves
 const ta=Date.parse(a.at),tb=Date.parse(b.at)
 if(Number.isFinite(ta)&&Number.isFinite(tb))return ta<tb
 return false
}
/** Pure merge: the better best (more waves, a tie keeps the earlier), runs max. Either side may be null or junk. */
export function mergeEndless(a:unknown,b:unknown):EndlessRecord|null{
 const x=cleanEndless(a),y=cleanEndless(b)
 if(!x)return y;if(!y)return x
 const best=x.best&&y.best?(better(y.best,x.best)?y.best:x.best):(x.best||y.best)
 return {version:1,best,runs:Math.max(x.runs,y.runs)}
}
/** Stores the record unioned with what is stored and returns what was stored (storage may be blocked: play goes on). */
export function saveEndless(save:EndlessRecord):EndlessRecord{
 const stored=mergeEndless(save,rawEndless())??save
 try{storage()?.setItem(ENDLESS_KEY,JSON.stringify(stored))}catch{/* blocked or full: the record lives for this page only */}
 return stored
}
/**
 * Records one finished run: runs+1 and, when it beats the best, the new best. Returns the stored record, whether this run is the
 * new best and the best it replaced. A run of zero waves still counts as a run.
 */
export function recordEndlessRun(save:EndlessRecord,run:EndlessRun,now:Date=new Date()):{record:EndlessRecord;newBest:boolean;previous:EndlessBest|null}{
 const base=mergeEndless(save,rawEndless())??freshEndless()
 const entry=cleanBest({waves:run.waves,seconds:run.seconds,kills:run.kills,partner:run.partner,solo:run.solo,at:run.at||now.toISOString()})
 // a run that only ties the best is later than it, so the earlier record stays
 const newBest=!!entry&&(!base.best||entry.waves>base.best.waves)
 const record:EndlessRecord={version:1,best:newBest?entry:base.best,runs:base.runs+1}
 return {record:saveEndless(record),newBest,previous:base.best}
}
/** The best waves for the room profile ("best" in the lobby): 0 when none. */
export const bestWaves=(save:EndlessRecord|null|undefined)=>save?.best?.waves||0
