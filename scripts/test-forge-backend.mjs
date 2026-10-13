import assert from 'node:assert/strict'
import {DatabaseSync} from 'node:sqlite'
import {readFileSync} from 'node:fs'
import worker,{verifyRun} from '../backend/forge/worker.ts'
import {act,createRun,bestKnife} from '../src/minigames/forge/engine.ts'
import {RULES} from '../src/minigames/forge/config.ts'
const sql=new DatabaseSync(':memory:');sql.exec(readFileSync('backend/forge/schema.sql','utf8'))
class Statement{constructor(query,args=[]){this.query=query;this.args=args}bind(...args){return new Statement(this.query,args)}async first(){return sql.prepare(this.query).get(...this.args)||null}async all(){return {results:sql.prepare(this.query).all(...this.args)}}async run(){return {meta:{changes:Number(sql.prepare(this.query).run(...this.args).changes)}}}}
const DB={prepare:q=>new Statement(q),batch:async ss=>{sql.exec('BEGIN');try{const r=[];for(const s of ss)r.push(await s.run());sql.exec('COMMIT');return r}catch(e){sql.exec('ROLLBACK');throw e}}}
const env={DB,ALLOWED_ORIGIN:'https://cornellcgs.org'},id=crypto.randomUUID(),proof=crypto.randomUUID()+crypto.randomUUID()
const call=(path,body,origin='https://cornellcgs.org')=>worker.fetch(new Request('https://forge.test'+path,{method:body?'POST':'GET',headers:{Origin:origin,...(body?{'Content-Type':'application/json'}:{})},body:body?JSON.stringify(body):undefined}),env)
assert.equal((await call('/scores',null,'https://bad.test')).status,403)
let res=await call('/runs',{playerId:id,proof});assert.equal(res.status,200);const ticket=await res.json()
assert.equal((await call('/runs',{playerId:id,proof})).status,429)
assert.equal((await call('/runs',{playerId:id,proof:crypto.randomUUID()+crypto.randomUUID()})).status,403)
const actions=[{type:'move',id:1,to:'rack'},...Array.from({length:RULES.days},()=>({type:'end'}))]
assert.equal(RULES.days,10,'a world run lasts ten days')
let s=createRun(ticket.seed);for(const a of actions)s=act(s,a).state
const knife=bestKnife(s);assert.equal(verifyRun(ticket.seed,actions,knife).score,100)
assert.throws(()=>verifyRun(ticket.seed,actions,{...knife,level:99}),/does not match/)
assert.throws(()=>verifyRun(ticket.seed,actions.slice(0,-1),knife),/Finish all 10 days/)
assert.throws(()=>verifyRun(ticket.seed,actions.slice(0,8),knife),/Finish all/,'a seven-day log is not a finished run')
assert.throws(()=>verifyRun(ticket.seed,[...actions.slice(0,1),{type:'upgrade'},...actions.slice(1)],knife),/current rules/,'a current run cannot claim an upgrade')
assert.throws(()=>verifyRun(ticket.seed,[{type:'buy',key:'metal:auricite'},...actions],knife))
res=await call('/scores',{playerId:id,proof,runId:ticket.id,name:'<script> & SMITH',actions,knife});assert.equal(res.status,200,await res.clone().text())
const board=await(await call('/scores?playerId='+id)).json();assert.equal(board.scores[0].value,100);assert.equal(board.player.rank,1);assert.equal(board.scores[0].name,'script  SMITH')
assert.equal((await(await call('/scores',{playerId:id,proof,runId:ticket.id,name:'x',actions,knife})).json()).alreadySubmitted,true)
for(let i=0;i<55;i++){const uid=crypto.randomUUID();sql.prepare('INSERT INTO players(id,proof_hash) VALUES(?,?)').run(uid,'test');sql.prepare('INSERT INTO scores VALUES(?,?,?,?,?,?)').run(uid,'Other smith',200+i,1,JSON.stringify(knife),i)}
const bigger=await(await call('/scores?playerId='+id)).json();assert.equal(bigger.scores.length,50);assert.equal(bigger.player.rank,56)
assert.equal((await call('/scores',{playerId:id,proof,runId:crypto.randomUUID(),name:'x',actions,knife})).status,400)
assert.equal((await call('/scores',{padding:'x'.repeat(600001)})).status,413)
console.log('PASS world board: SQL schema, deterministic replay, tamper rejection, origin rules, player proof, atomic cooldown, one-use ticket, name cleaning, top 50 and rank 56.')
sql.close()
