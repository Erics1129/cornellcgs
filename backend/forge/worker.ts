import { bestKnife, replay, value } from '../../src/minigames/forge/engine.ts'
import type { Action, Knife } from '../../src/minigames/forge/engine.ts'
import { RULES, WORLD } from '../../src/minigames/forge/config.ts'
interface Statement { bind(...args:unknown[]):Statement; first<T>():Promise<T|null>; all<T>():Promise<{results:T[]}>; run():Promise<{meta:{changes:number}}> }
interface Database { prepare(sql:string):Statement; batch(statements:Statement[]):Promise<unknown[]> }
type Env={DB:Database;ALLOWED_ORIGIN:string}
type Row={player_id:string;name:string;value:number;level:number;knife:string|null;updated:number}
const clean=(s:string)=>s.normalize('NFKC').replace(/[^\p{L}\p{N} _.-]/gu,'').trim().slice(0,WORLD.maxName)||'Anonymous smith'
const hash=async(s:string)=>Array.from(new Uint8Array(await crypto.subtle.digest('SHA-256',new TextEncoder().encode(s)))).map(b=>b.toString(16).padStart(2,'0')).join('')
const uuid=(s:unknown):s is string=>typeof s==='string'&&/^[a-f0-9-]{36}$/.test(s)
function equalKnife(a:unknown,b:Knife|undefined){if(!b)return a===null;if(!a||typeof a!=='object')return false;return (Object.keys(b) as (keyof Knife)[]).every(key=>(a as Knife)[key]===b[key])}
/** CPU-bounded replay validates ownership, resources and the surviving best knife, not a claimed price. */
export function verifyRun(seed:number,actions:unknown,knife:unknown){
 if(!Array.isArray(actions)||actions.length>RULES.maxActions)throw new Error('Invalid action log.')
 for(const a of actions){if(!a||typeof a!=='object'||typeof a.type!=='string'||JSON.stringify(a).length>180)throw new Error('Invalid action.');if('id'in a&&(!Number.isSafeInteger(a.id)||a.id<1))throw new Error('Invalid knife id.')}
 const run=replay(seed,actions as Action[])
 if(!run.ended||run.day!==RULES.days)throw new Error(`Finish all ${RULES.days} days first.`)
 const best=bestKnife(run)
 if(!equalKnife(knife,best))throw new Error('This knife does not match your finished run.')
 const score=best?value(best,run):0
 if(!Number.isSafeInteger(score)||score<0)throw new Error('Score cannot be represented safely.')
 return {score,knife:best||null,level:best?.level||0,hits:run.totalHits}
}
export default {
 async fetch(request:Request,env:Env):Promise<Response>{
  const url=new URL(request.url),origin=request.headers.get('Origin')||''
  const allowed=env.ALLOWED_ORIGIN.split(',').map(s=>s.trim()).filter(Boolean)
  const headers=new Headers({'Content-Type':'application/json; charset=utf-8','Cache-Control':'no-store','Vary':'Origin','X-Content-Type-Options':'nosniff'})
  if(allowed.includes(origin)){headers.set('Access-Control-Allow-Origin',origin);headers.set('Access-Control-Allow-Methods','GET, POST, OPTIONS');headers.set('Access-Control-Allow-Headers','Content-Type');headers.set('Access-Control-Max-Age','3600')}
  const json=(data:unknown,status=200)=>new Response(JSON.stringify(data),{status,headers})
  if(origin&&!allowed.includes(origin))return json({error:'Origin not allowed.'},403)
  if(request.method==='OPTIONS')return new Response(null,{status:204,headers})
  const now=Date.now()
  try{
   if(request.method==='GET'&&url.pathname==='/scores'){
    const top=await env.DB.prepare('SELECT * FROM scores ORDER BY value DESC, updated ASC, player_id ASC LIMIT ?').bind(WORLD.top).all<Row>()
    const map=(r:Row,rank:number)=>({playerId:r.player_id,name:r.name,value:r.value,level:r.level,knife:r.knife?JSON.parse(r.knife):null,rank})
    let player=null;const id=url.searchParams.get('playerId')
    if(uuid(id)){const own=await env.DB.prepare('SELECT * FROM scores WHERE player_id=?').bind(id).first<Row>();if(own){const rank=await env.DB.prepare('SELECT COUNT(*) AS n FROM scores WHERE value > ? OR (value = ? AND updated < ?) OR (value = ? AND updated = ? AND player_id < ?)').bind(own.value,own.value,own.updated,own.value,own.updated,own.player_id).first<{n:number}>();player=map(own,(rank?.n||0)+1)}}
    return json({scores:top.results.map((r,i)=>map(r,i+1)),player})
   }
   if(request.method!=='POST'||!['/runs','/scores'].includes(url.pathname))return json({error:'Not found.'},404)
   if(Number(request.headers.get('Content-Length')||0)>WORLD.maxBodyBytes)return json({error:'Request too large.'},413)
   // Stream with a hard limit as Content-Length is not a trustworthy bound.
   const reader=request.body?.getReader();if(!reader)return json({error:'Missing body.'},400)
   const chunks:Uint8Array[]=[];let bytes=0
   while(true){const {done,value:chunk}=await reader.read();if(done)break;bytes+=chunk.length;if(bytes>WORLD.maxBodyBytes){await reader.cancel();return json({error:'Request too large.'},413)}chunks.push(chunk)}
   const bodyBytes=new Uint8Array(bytes);let offset=0;for(const chunk of chunks){bodyBytes.set(chunk,offset);offset+=chunk.length}
   const body=JSON.parse(new TextDecoder().decode(bodyBytes)) as Record<string,unknown>
   if(!uuid(body.playerId)||typeof body.proof!=='string'||!/^[a-f0-9-]{72}$/.test(body.proof))return json({error:'Invalid player identity.'},400)
   const id=body.playerId,proofHash=await hash(body.proof)
   if(url.pathname==='/runs')await env.DB.prepare('INSERT OR IGNORE INTO players(id,proof_hash) VALUES(?,?)').bind(id,proofHash).run()
   const player=await env.DB.prepare('SELECT proof_hash FROM players WHERE id=?').bind(id).first<{proof_hash:string}>()
   if(!player||player.proof_hash!==proofHash)return json({error:'Player identity does not match.'},403)
   if(url.pathname==='/runs'){
    const reserve=await env.DB.prepare('UPDATE players SET last_start=? WHERE id=? AND last_start <= ?').bind(now,id,now-WORLD.startCooldown*1000).run()
    if(!reserve.meta.changes)return json({error:'Wait a minute before starting another world run.'},429)
    const seed=crypto.getRandomValues(new Uint32Array(1))[0],runId=crypto.randomUUID()
    await env.DB.batch([env.DB.prepare('INSERT INTO runs(id,player_id,seed,version,started) VALUES(?,?,?,?,?)').bind(runId,id,seed,RULES.version,now),env.DB.prepare('DELETE FROM runs WHERE started < ?').bind(now-RULES.maxRunSeconds*1000)])
    return json({id:runId,seed})
   }
   if(!uuid(body.runId)||typeof body.name!=='string'||body.name.length>200)return json({error:'Invalid score submission.'},400)
   const entry=await env.DB.prepare('SELECT * FROM runs WHERE id=? AND player_id=?').bind(body.runId,id).first<{seed:number;started:number;version:number;used:number}>()
   if(!entry||entry.version!==RULES.version||now-entry.started>RULES.maxRunSeconds*1000)return json({error:'Run ticket is missing, expired, or from an old rules version.'},400)
   if(entry.used)return json({accepted:true,alreadySubmitted:true})
   const limit=await env.DB.prepare('UPDATE players SET last_submit=? WHERE id=? AND last_submit <= ?').bind(now,id,now-WORLD.submitCooldown*1000).run()
   if(!limit.meta.changes)return json({error:'Wait a minute before posting again.'},429)
   let checked:ReturnType<typeof verifyRun>;try{checked=verifyRun(entry.seed,body.actions,body.knife)}catch(e){return json({error:(e as Error).message},400)}
   if(now-entry.started<checked.hits*RULES.replayMinHitMs)return json({error:'Run completed faster than the forge can strike.'},400)
   // The insert reads the unconsumed ticket in the same transaction that consumes it.
   await env.DB.batch([
    env.DB.prepare('INSERT INTO scores(player_id,name,value,level,knife,updated) SELECT ?,?,?,?,?,? FROM runs WHERE id=? AND used=0 ON CONFLICT(player_id) DO UPDATE SET name=excluded.name,value=excluded.value,level=excluded.level,knife=excluded.knife,updated=excluded.updated WHERE excluded.value > scores.value').bind(id,clean(body.name),checked.score,checked.level,checked.knife?JSON.stringify(checked.knife):null,now,body.runId),
    env.DB.prepare('UPDATE runs SET used=1 WHERE id=? AND player_id=?').bind(body.runId,id)
   ])
   return json({accepted:true,value:checked.score})
  }catch{return json({error:'The world board is unavailable. Your score is safe locally.'},503)}
 }
}
