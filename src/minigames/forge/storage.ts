import { createRun, replay } from './engine'
import type { Action, Run, Knife } from './engine'
import { RULES, WORLD, METALS, FAMILIES } from './config'
export type Ticket={id:string;seed:number}
export type Session={state:Run;actions:Action[];ticket:Ticket|null}
export type Score={playerId:string;name:string;value:number;level:number;knife:Knife|null;rank?:number}
const KEY='cgs-forge-run-v1'
export function fresh(seed=crypto.getRandomValues(new Uint32Array(1))[0],ticket:Ticket|null=null):Session{return {state:createRun(seed),actions:[],ticket}}
export function loadSession():Session{try{const saved=JSON.parse(localStorage.getItem(KEY)||'null');if(saved&&saved.version===RULES.version){const state=replay(saved.seed,saved.actions);return {state,actions:saved.actions,ticket:saved.ticket||null}}}catch{/* corrupt or unavailable storage starts a clean run */}return fresh()}
export function saveSession(s:Session):boolean{try{localStorage.setItem(KEY,JSON.stringify({version:RULES.version,seed:s.state.seed,actions:s.actions,ticket:s.ticket}));return true}catch{return false}}
export function identity():{playerId:string;proof:string;name:string}{try{const raw=JSON.parse(localStorage.getItem('cgs-forge-player')||'null');if(raw?.playerId&&raw?.proof)return raw}catch{/* defaults */}const id={playerId:crypto.randomUUID(),proof:crypto.randomUUID()+crypto.randomUUID(),name:''};try{localStorage.setItem('cgs-forge-player',JSON.stringify(id))}catch{/* session only */}return id}
export function cleanName(s:string){return s.normalize('NFKC').replace(/[^\p{L}\p{N} _.-]/gu,'').trim().slice(0,WORLD.maxName)||'Anonymous smith'}
export function saveName(id:ReturnType<typeof identity>,name:string){id.name=cleanName(name);try{localStorage.setItem('cgs-forge-player',JSON.stringify(id))}catch{/* optional */}}
export function localScores():Score[]{try{const a=JSON.parse(localStorage.getItem('cgs-forge-scores')||'[]');return Array.isArray(a)?a.filter(s=>s&&Number.isSafeInteger(s.value)&&s.value>=0&&typeof s.playerId==='string'&&typeof s.name==='string'&&Number.isInteger(s.level)&&s.level>=0&&(!s.knife||(s.knife.metal in METALS&&Number.isInteger(s.knife.family)&&s.knife.family>=0&&s.knife.family<FAMILIES.length&&Number.isInteger(s.knife.level)&&s.knife.level>=0))).slice(0,50):[]}catch{return []}}
export function recordLocal(score:Score){const all=localScores(),old=all.find(s=>s.playerId===score.playerId);if(!old||old.value<score.value){const rows=[...all.filter(s=>s.playerId!==score.playerId),score].sort((a,b)=>b.value-a.value).slice(0,WORLD.top);try{localStorage.setItem('cgs-forge-scores',JSON.stringify(rows))}catch{/* keep game playable */}}}
export const API=(import.meta.env.VITE_FORGE_API_URL as string|undefined)?.replace(/\/$/,'')||''
export async function api<T>(path:string,body?:unknown):Promise<T>{if(!API)throw new Error('World board offline — scores stay on this device.');const response=await fetch(API+path,{method:body?'POST':'GET',headers:body?{'Content-Type':'application/json'}:undefined,body:body?JSON.stringify(body):undefined,signal:AbortSignal.timeout(RULES.apiTimeoutMs)});const data=await response.json();if(!response.ok)throw new Error(data.error||'World board is unavailable.');return data}
