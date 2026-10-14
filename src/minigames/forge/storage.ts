import { act, createRun, replay } from './engine.ts'
import type { Action, Run, Knife } from './engine.ts'
import { RULES, WORLD, METALS, FAMILIES } from './config.ts'
import { progress } from '../../lib/account/index.ts'
import { MERGES } from '../../lib/account/merges.ts'
export type Ticket={id:string;seed:number}
/** `initialVersion`: the rules version the action log replays from. `notice`: one line for the player after a rules migration. */
export type Session={state:Run;actions:Action[];ticket:Ticket|null;initialVersion?:number;notice?:string}
export type Score={playerId:string;name:string;value:number;level:number;knife:Knife|null;rank?:number}
/**
 * The stored run. `version` is the save format, written as the current rules version; `rules` is the version the
 * log replays from when it is older (a run started before an update, with its `upgrade` actions in the log).
 * Saves from before rules 3 have no `rules` field: their `version` is the replay version.
 */
export type SavedRun={version:number;rules?:number;seed:number;actions:Action[];ticket:Ticket|null}
const KEY='cgs-forge-run-v1'
// `import.meta.env` is Vite's (statically replaced, so production drops the fixtures); under plain node
// (scripts/test-forge-sync.mjs) it is undefined.
const DEV=typeof import.meta.env==='object'&&import.meta.env.DEV
const qaFixture=()=>DEV&&typeof location!=='undefined'?new URLSearchParams(location.search).get('forge-qa'):null
export function fresh(seed=crypto.getRandomValues(new Uint32Array(1))[0],ticket:Ticket|null=null):Session{return {state:createRun(seed),actions:[],ticket}}
/** The stored run if this build can replay it, else null: an unknown (newer) version, a broken shape or no save. Also the account module's `read`. */
export function readSave():SavedRun|null{
 try{const raw=JSON.parse(localStorage.getItem(KEY)||'null'),rules=raw?.rules??raw?.version
  const known=(v:unknown):v is number=>Number.isInteger(v)&&(v as number)>=1&&(v as number)<=RULES.version
  return raw&&typeof raw==='object'&&known(raw.version)&&known(rules)&&rules<=raw.version&&Number.isInteger(raw.seed)&&Array.isArray(raw.actions)?raw:null
 }catch{return null}
}
/** Which stored run this is (seed, log length, replay version): enough to tell another device's run or a longer log. */
export function saveSignature(s:SavedRun|null){return s?`${s.seed}:${s.actions.length}:${s.rules??s.version}`:''}
export function loadSession():Session{
 // Development-only replay fixtures exercise real rules without touching a player's save.
 const qa=qaFixture()
 if(qa){const actions:Action[]=[{type:'move',id:1,to:'furnace'},{type:'heat',id:1},{type:'move',id:1,to:'anvil'}];for(let i=0;i<10;i++)actions.push({type:'tick',ms:1000},{type:'hit',id:1});if(qa==='ended'){actions.push({type:'move',id:1,to:'rack'});for(let i=0;i<RULES.days;i++)actions.push({type:'end'})}if(qa==='empty')for(const k of replay(1,actions).knives)actions.push({type:'sell',id:k.id});return {state:replay(1,actions),actions,ticket:null}}
 try{const saved=readSave();if(saved){
  const rules=saved.rules??saved.version,actions:Action[]=[...saved.actions]
  let state=replay(saved.seed,actions,rules),ticket=saved.ticket||null,notice:string|undefined
  // An unfinished run from older rules continues under the current ones, one version per upgrade action.
  // World tickets belong to the rules they were issued for, so a migrated run becomes a local run.
  const from=state.version
  while(state.version<RULES.version&&!state.ended){const action:Action={type:'upgrade'},t=act(state,action);if(!t.ok)break;state=t.state;actions.push(action);ticket=null}
  if(from<3&&state.version>=3)notice=`Your saved run continues on day ${state.day}. Runs now last ${RULES.days} days.`
  else if(state.ended&&state.version<3)notice=`This run ended on day ${state.day} under the old rules. New runs last ${RULES.days} days.`
  return {state,actions,ticket,initialVersion:rules,notice}
 }}catch{/* corrupt or unavailable storage starts a clean run */}return fresh()}
export function saveSession(s:Session):boolean{
 if(qaFixture()!==null)return true
 const rules=s.initialVersion??RULES.version,saved:SavedRun={version:RULES.version,...(rules!==RULES.version?{rules}:{}),seed:s.state.seed,actions:s.actions,ticket:s.ticket}
 try{localStorage.setItem(KEY,JSON.stringify(saved));progress.touch('forge:run');return true}catch{return false}
}
export function identity():{playerId:string;proof:string;name:string}{try{const raw=JSON.parse(localStorage.getItem('cgs-forge-player')||'null');if(raw?.playerId&&raw?.proof)return raw}catch{/* defaults */}const id={playerId:crypto.randomUUID(),proof:crypto.randomUUID()+crypto.randomUUID(),name:''};try{localStorage.setItem('cgs-forge-player',JSON.stringify(id));progress.touch('forge:player')}catch{/* session only */}return id}
export function cleanName(s:string){return s.normalize('NFKC').replace(/[^\p{L}\p{N} _.-]/gu,'').trim().slice(0,WORLD.maxName)||'Anonymous smith'}
export function saveName(id:ReturnType<typeof identity>,name:string){id.name=cleanName(name);try{localStorage.setItem('cgs-forge-player',JSON.stringify(id));progress.touch('forge:player')}catch{/* optional */}}
export function localScores():Score[]{try{const a=JSON.parse(localStorage.getItem('cgs-forge-scores')||'[]');return Array.isArray(a)?a.filter(s=>s&&Number.isSafeInteger(s.value)&&s.value>=0&&typeof s.playerId==='string'&&typeof s.name==='string'&&Number.isInteger(s.level)&&s.level>=0&&(!s.knife||(s.knife.metal in METALS&&Number.isInteger(s.knife.family)&&s.knife.family>=0&&s.knife.family<FAMILIES.length&&Number.isInteger(s.knife.level)&&s.knife.level>=0))).slice(0,50):[]}catch{return []}}
export function recordLocal(score:Score){const all=localScores(),old=all.find(s=>s.playerId===score.playerId);if(!old||old.value<score.value){const rows=[...all.filter(s=>s.playerId!==score.playerId),score].sort((a,b)=>b.value-a.value).slice(0,WORLD.top);try{localStorage.setItem('cgs-forge-scores',JSON.stringify(rows));progress.touch('forge:scores')}catch{/* keep game playable */}}}
export const API=(typeof import.meta.env==='object'?import.meta.env.VITE_FORGE_API_URL as string|undefined:undefined)?.replace(/\/$/,'')||''
export async function api<T>(path:string,body?:unknown):Promise<T>{if(!API)throw new Error('World board offline — scores stay on this device.');const response=await fetch(API+path,{method:body?'POST':'GET',headers:body?{'Content-Type':'application/json'}:undefined,body:body?JSON.stringify(body):undefined,signal:AbortSignal.timeout(RULES.apiTimeoutMs)});const data=await response.json();if(!response.ok)throw new Error(data.error||'World board is unavailable.');return data}
// Signed in, progress follows the player's account (docs/accounts/HOOKS.md). The run touched most recently wins;
// `readSave` returns null for a save this build cannot replay, so a newer format from another device is frozen, not overwritten.
progress.register('forge:run',{key:KEY,read:readSave,merge:MERGES['forge:run']})
progress.register('forge:player',{key:'cgs-forge-player',merge:MERGES['forge:player']})   // one leaderboard identity per account (private)
progress.register('forge:scores',{key:'cgs-forge-scores',merge:MERGES['forge:scores']})   // union, best per player, top 50
