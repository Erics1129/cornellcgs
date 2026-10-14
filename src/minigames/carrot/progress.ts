import type { CampaignSave, LevelRecord, RecordsSave, SuperSave } from './types'
import { progress } from '../../lib/account/index.ts'
import { mergeCarrot } from '../../lib/account/merges.ts'
const key='cgs-carrot-defense-v1'
// Saves stay version 1: a 12-level save is a valid 24-level save with fewer unlocks.
export const LevelCount=24
/** the account record this key syncs as (see src/lib/account) */
export const RECORD='carrot:campaign'
const fallback=():CampaignSave=>({version:1,unlocked:1,medals:{},sound:true})
/** The stored save, cleaned, or null when nothing usable is stored. */
export function rawCampaign():CampaignSave|null {
 try{const raw=JSON.parse(localStorage.getItem(key)||'null');if(!raw||raw.version!==1)return null;
  const medals:Record<string,number>={};for(const [id,value]of Object.entries(raw.medals||{}))if(/^([1-9]|1[0-9]|2[0-4])$/.test(id)&&typeof value==='number')medals[id]=Math.max(0,Math.min(7,Math.floor(value)))
  return {version:1,unlocked:Math.max(1,Math.min(LevelCount,Math.floor(Number(raw.unlocked)||1))),medals,sound:raw.sound!==false}
 }catch{return null}
}
export function readCampaign():CampaignSave {return rawCampaign()??fallback()}
/**
 * Stores the save, and tells the account module it changed (a no-op while signed out). The stored copy is
 * unioned in first (max unlock, every medal), so a save computed from stale React state can never erase
 * medals a sign-in or another device just wrote to storage. Returns what was stored.
 */
export function saveCampaign(save:CampaignSave):CampaignSave{
 const stored=mergeCarrot(save,rawCampaign())??save
 try{localStorage.setItem(key,JSON.stringify(stored))}catch{/* Play remains available when storage is restricted. */}
 progress.touch(RECORD);return stored
}
export function awardCampaign(save:CampaignSave,level:number,health:number,cleared=false):CampaignSave {
 if(!Number.isInteger(level)||level<1||level>LevelCount||!Number.isFinite(health)||health<=0||health>10)return save
 const medals=1|(health===10?2:0)|(cleared?4:0)
 const next={...save,unlocked:Math.max(save.unlocked,Math.min(LevelCount,level+1)),medals:{...save.medals,[level]:(save.medals[level]||0)|medals}}
 return saveCampaign(next)
}

// Super record (record id `carrot:super` once the accounts package registers it): whether the merge lesson was shown, how many Supers were forged and which kinds.
const superKey='cgs-carrot-super-v1'
const freshSuper=():SuperSave=>({version:1,taught:false,merges:0,kinds:{}})
const cleanKinds=(raw:unknown)=>{const kinds:Record<string,number>={};if(raw&&typeof raw==='object')for(const [kind,value] of Object.entries(raw as Record<string,unknown>))if(/^[a-z]{2,16}$/.test(kind)&&typeof value==='number'&&Number.isFinite(value)&&value>0)kinds[kind]=Math.floor(value);return kinds}
function cleanSuper(raw:unknown):SuperSave|null {
 if(!raw||typeof raw!=='object'||(raw as SuperSave).version!==1)return null
 const r=raw as Partial<SuperSave>
 return {version:1,taught:r.taught===true,merges:Math.max(0,Math.floor(Number(r.merges)||0)),kinds:cleanKinds(r.kinds)}
}
/** A record from a newer client (version above this code's 1) is passed through untouched rather than merged by rules it may have outgrown. */
export function newerVersion(a:unknown,b:unknown):unknown {
 const v=(r:unknown)=>r&&typeof r==='object'&&Number.isInteger((r as {version?:unknown}).version)?(r as {version:number}).version:0
 const va=v(a),vb=v(b);if(va<=1&&vb<=1)return null
 return va>=vb?a:b
}
export function readSuper():SuperSave {try{return cleanSuper(JSON.parse(localStorage.getItem(superKey)||'null'))||freshSuper()}catch{return freshSuper()}}
export function saveSuper(save:SuperSave){try{localStorage.setItem(superKey,JSON.stringify(save))}catch{/* Storage may be blocked; merging still works. */}progress.touch('carrot:super')}
export function recordSuper(save:SuperSave,kind:string):SuperSave {
 if(!/^[a-z]{2,16}$/.test(kind))return save
 const next:SuperSave={...save,merges:save.merges+1,kinds:{...save.kinds,[kind]:(save.kinds[kind]||0)+1}}
 saveSuper(next);return next
}
export function teachSuper(save:SuperSave):SuperSave {if(save.taught)return save;const next={...save,taught:true};saveSuper(next);return next}
/** Pure merge for account sync: taught OR, merges max, kinds per-key max, a higher version wins outright. */
export function mergeCarrotSuper(a:SuperSave|null|undefined,b:SuperSave|null|undefined):SuperSave|null {
 const newer=newerVersion(a,b);if(newer)return newer as SuperSave
 const x=cleanSuper(a),y=cleanSuper(b)
 if(!x)return y;if(!y)return x
 const kinds:Record<string,number>={...x.kinds};for(const [kind,value] of Object.entries(y.kinds))kinds[kind]=Math.max(kinds[kind]||0,value)
 return {version:1,taught:x.taught||y.taught,merges:Math.max(x.merges,y.merges),kinds}
}
// Signed in, the campaign follows the account: medals are OR-ed, the furthest unlock wins, sound stays this device's choice.
progress.register(RECORD,{key,read:rawCampaign,write:saveCampaign,merge:mergeCarrot})
/** The Super record syncs too: taught OR, merges max, kinds per-kind max (see docs/accounts/HOOKS.md). */
progress.register('carrot:super',{key:superKey,read:()=>{try{return cleanSuper(JSON.parse(localStorage.getItem(superKey)||'null'))}catch{return null}},merge:mergeCarrotSuper})

// ---- Records (giant update): `cgs-carrot-records-v1`, account record `carrot:records` ---------------------------------------------
// Grades, the longest defense chain and the fastest win per level (1-29, challenges included), the abilities and creatures the player
// has already been introduced to, and whether the guided first level was finished or skipped. Everything here is new; the campaign,
// Super and challenge records above are untouched. See docs/carrot-defense/giant-update/ui.md.
export const RECORDS='carrot:records'
const recordsKey='cgs-carrot-records-v1'
export const freshRecords=():RecordsSave=>({version:1,levels:{},seen:{abilities:[],creatures:[]},tutorial:false})
/** Grades on one scale with the medals: 0 none, 1 D, 2 C, 3 B, 4 A, 5 S. */
export const gradeLetters=['','D','C','B','A','S']
/**
 * The grade of a finished run (also in ui.md):
 *  S  won with every medal: 10 hearts, all scenery cleared (challenges: no scenery), and within par when a par is known;
 *  A  won with at least 8 hearts;  B  won with at least 5 hearts;  C  won;
 *  D  lost after reaching half of the level's progress;  0 (no grade) for an earlier loss.
 */
export function gradeRun(run:{won:boolean;health:number;progress:number;seconds?:number;par?:number;scenery?:boolean;challenge?:boolean}):number{
 if(!run.won)return run.progress>=.5?1:0
 const inPar=!(typeof run.par==='number'&&run.par>0)||(typeof run.seconds==='number'&&run.seconds<=run.par)
 if(run.health>=10&&(run.challenge||run.scenery)&&inPar)return 5
 return run.health>=8?4:run.health>=5?3:2
}
// The block below is copied verbatim into src/lib/account/merges.ts; keep both identical.
// >>> carrot records (shared with merges.ts)
const RECORD_LEVEL=/^([1-9]|1[0-9]|2[0-9])$/,SEEN_ID=/^[A-Za-z][A-Za-z0-9]{1,31}$/,SEEN_CAP=128
const recordNumber=(v:unknown,max:number)=>{const n=Number(v);return Number.isFinite(n)&&n>0?Math.min(max,n):0}
function cleanLevelRecord(raw:unknown):LevelRecord|null{
 if(!raw||typeof raw!=='object')return null
 const r=raw as Partial<LevelRecord>
 const out:LevelRecord={grade:Math.floor(recordNumber(r.grade,5)),bestStreak:Math.floor(recordNumber(r.bestStreak,9999)),bestSeconds:Math.round(recordNumber(r.bestSeconds,86400)*10)/10,vgrade:Math.floor(recordNumber(r.vgrade,5))}
 return out.grade||out.bestStreak||out.bestSeconds||out.vgrade?out:null
}
const cleanSeen=(raw:unknown)=>Array.isArray(raw)?[...new Set(raw.filter((v):v is string=>typeof v==='string'&&SEEN_ID.test(v)))].sort().slice(0,SEEN_CAP):[]
function cleanRecords(raw:unknown):RecordsSave|null{
 if(!raw||typeof raw!=='object'||(raw as {version?:unknown}).version!==1)return null
 const r=raw as Partial<RecordsSave>,levels:Record<string,LevelRecord>={}
 if(r.levels&&typeof r.levels==='object')for(const [id,value] of Object.entries(r.levels)){const v=RECORD_LEVEL.test(id)?cleanLevelRecord(value):null;if(v)levels[id]=v}
 const seen=r.seen&&typeof r.seen==='object'?r.seen:{abilities:[],creatures:[]}
 return {version:1,levels,seen:{abilities:cleanSeen((seen as {abilities?:unknown}).abilities),creatures:cleanSeen((seen as {creatures?:unknown}).creatures)},tutorial:r.tutorial===true}
}
/** A record from a newer client (version above 1) is passed through untouched rather than merged by rules it may have outgrown. */
const newerRecordsVersion=(a:unknown,b:unknown):unknown=>{const v=(r:unknown)=>r&&typeof r==='object'&&Number.isInteger((r as {version?:unknown}).version)?(r as {version:number}).version:0;const va=v(a),vb=v(b);return va<=1&&vb<=1?null:va>=vb?a:b}
const minPositive=(a:number,b:number)=>a>0&&b>0?Math.min(a,b):a>0?a:b
/** Pure merge for account sync: per level grade, chain and Veteran grade max, the fastest positive time; seen is a sorted union (128 each); tutorial OR. */
export function mergeCarrotRecords(a:unknown,b:unknown):RecordsSave|null{
 const newer=newerRecordsVersion(a,b);if(newer)return newer as RecordsSave
 const x=cleanRecords(a),y=cleanRecords(b)
 if(!x)return y;if(!y)return x
 const levels:Record<string,LevelRecord>={}
 for(const id of [...new Set([...Object.keys(x.levels),...Object.keys(y.levels)])].sort((p,q)=>Number(p)-Number(q))){
  const p=x.levels[id],q=y.levels[id]
  levels[id]=p&&q?{grade:Math.max(p.grade,q.grade),bestStreak:Math.max(p.bestStreak,q.bestStreak),bestSeconds:minPositive(p.bestSeconds,q.bestSeconds),vgrade:Math.max(p.vgrade,q.vgrade)}:{...(p||q) as LevelRecord}
 }
 const union=(p:string[],q:string[])=>[...new Set([...p,...q])].sort().slice(0,SEEN_CAP)
 return {version:1,levels,seen:{abilities:union(x.seen.abilities,y.seen.abilities),creatures:union(x.seen.creatures,y.seen.creatures)},tutorial:x.tutorial||y.tutorial}
}
// <<< carrot records
export {cleanRecords}
/** The stored record, or null when nothing usable is stored (so a sync never overwrites a server copy with a blank). */
export function rawRecords():RecordsSave|null{try{return cleanRecords(JSON.parse(localStorage.getItem(recordsKey)||'null'))}catch{return null}}
export function readRecords():RecordsSave{return rawRecords()??freshRecords()}
/** Stores the record unioned with what is stored (a stale React copy can never lower a grade a sign-in just wrote) and returns it. */
export function saveRecords(save:RecordsSave):RecordsSave{
 const stored=mergeCarrotRecords(save,rawRecords()) as RecordsSave|null??save
 try{localStorage.setItem(recordsKey,JSON.stringify(stored))}catch{/* Play continues without storage. */}
 progress.touch(RECORDS);return stored
}
/** Records one finished run: the grade (Veteran runs fill vgrade), the defense chain, and a win's time. Returns the stored record. */
export function awardRecord(save:RecordsSave,level:number,run:{grade:number;streak?:number;seconds?:number;won?:boolean;veteran?:boolean}):RecordsSave{
 if(!Number.isInteger(level)||level<1||level>29)return save
 const grade=Math.max(0,Math.min(5,Math.floor(run.grade)||0)),streak=Math.max(0,Math.floor(run.streak||0)),seconds=run.won&&Number.isFinite(run.seconds)&&(run.seconds||0)>0?Math.round((run.seconds as number)*10)/10:0
 const entry:LevelRecord={grade:run.veteran?0:grade,bestStreak:streak,bestSeconds:run.veteran?0:seconds,vgrade:run.veteran?grade:0}
 if(!entry.grade&&!entry.bestStreak&&!entry.bestSeconds&&!entry.vgrade)return save
 return saveRecords(mergeCarrotRecords(save,{version:1,levels:{[level]:entry},seen:{abilities:[],creatures:[]},tutorial:false}) as RecordsSave)
}
/** Marks abilities or creatures as introduced (first-encounter cards show once per account). */
export function markSeen(save:RecordsSave,seen:{abilities?:string[];creatures?:string[]}):RecordsSave{
 const abilities=(seen.abilities||[]).filter(a=>!save.seen.abilities.includes(a)),creatures=(seen.creatures||[]).filter(c=>!save.seen.creatures.includes(c))
 if(!abilities.length&&!creatures.length)return save
 return saveRecords(mergeCarrotRecords(save,{version:1,levels:{},seen:{abilities,creatures},tutorial:false}) as RecordsSave)
}
export function finishTutorial(save:RecordsSave):RecordsSave{return save.tutorial?save:saveRecords({...save,tutorial:true})}
/** Records sync like the others: grade max, fastest time, seen union, tutorial OR (docs/carrot-defense/giant-update/ui.md). */
progress.register(RECORDS,{key:recordsKey,read:rawRecords,merge:mergeCarrotRecords})
