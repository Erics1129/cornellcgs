// Player accounts, client side: the merge rules per game, then the sync engine
// driven with a fake storage, a fake fetch and a fake clock. Plain node, no DOM.
import assert from 'node:assert/strict'
import {mergeCarrot,mergeCarrotSuper,mergeCarrotChallenges,CARROT_LEVEL_COUNT,mergeBests,localWins,laterWins,mergeForgeScores,mergeForgePlayer,higherVersion,MERGES,PRIVATE_RECORDS,KNOWN_KEYS} from '../src/lib/account/merges.ts'
import {createSync,META_KEY,DEBOUNCE_MS,MAX_WAIT_MS,PUT_FLOOR_MS,FRESH_PULL_MS} from '../src/lib/account/sync.ts'
import {SESSION_KEY,GZIP_FROM_BYTES} from '../src/lib/account/session.ts'

// ---- merge rules -----------------------------------------------------------
const meta=(localUpdated=0,remoteUpdated=0)=>({localUpdated,remoteUpdated})
const carrotA={version:1,unlocked:4,medals:{1:7,2:1,3:3},sound:false},carrotB={version:1,unlocked:6,medals:{2:6,3:4,5:1},sound:true}
assert.deepEqual(mergeCarrot(carrotA,carrotB,meta()),{version:1,unlocked:6,medals:{1:7,2:7,3:7,5:1},sound:false},'carrot: max unlocked, OR medals, this device sound')
assert.deepEqual(mergeCarrot(carrotB,carrotA,meta()),{version:1,unlocked:6,medals:{1:7,2:7,3:7,5:1},sound:true})
assert.equal(mergeCarrot(null,carrotB,meta()),carrotB);assert.equal(mergeCarrot(carrotA,null,meta()),carrotA);assert.equal(mergeCarrot(null,null,meta()),null)
assert.deepEqual(mergeCarrot({version:1,unlocked:2,medals:'nope',sound:true},{version:1,unlocked:1,medals:{1:1},sound:true},meta()),{version:1,unlocked:2,medals:{1:1},sound:true},'carrot: a broken medals field is tolerated')
const bestsA={'1':{ink:5,moves:9},'2':{ink:7,moves:4},'4':{ink:3,moves:3}},bestsB={'1':{ink:5,moves:8},'2':{ink:8,moves:1},'3':{ink:2,moves:2}}
assert.deepEqual(mergeBests(bestsA,bestsB,meta()),{'1':{ink:5,moves:8},'2':{ink:7,moves:4},'3':{ink:2,moves:2},'4':{ink:3,moves:3}},'ink maze: fewer ink, then fewer moves, union of levels')
assert.deepEqual(mergeBests(bestsB,bestsA,meta()),mergeBests(bestsA,bestsB,meta()),'ink maze: symmetric')
assert.equal(mergeBests(null,bestsB,meta()),bestsB);assert.equal(mergeBests(null,null,meta()),null)
assert.equal(localWins('off','on',meta()),'off');assert.equal(localWins(null,'on',meta()),'on');assert.equal(localWins('off',null,meta()),'off')
const runA={version:2,seed:1,actions:[1],ticket:null},runB={version:2,seed:2,actions:[1,2],ticket:null}
assert.equal(laterWins(runA,runB,meta(100,200)),runB,'forge run: the later copy wins');assert.equal(laterWins(runA,runB,meta(300,200)),runA);assert.equal(laterWins(runA,runB,meta(200,200)),runA,'ties keep local')
assert.equal(laterWins(null,runB,meta(0,0)),runB);assert.equal(laterWins(runA,null,meta(0,0)),runA);assert.equal(laterWins(runA,runB,meta(0,5)),runB,'legacy local data loses to a stamped remote run')
const scoresA=[{playerId:'p1',name:'A',value:50},{playerId:'p2',name:'B',value:70}],scoresB=[{playerId:'p1',name:'A',value:90},{playerId:'p3',name:'C',value:10}]
assert.deepEqual(mergeForgeScores(scoresA,scoresB,meta()),[{playerId:'p1',name:'A',value:90},{playerId:'p2',name:'B',value:70},{playerId:'p3',name:'C',value:10}],'forge scores: union, best per player, sorted')
const many=Array.from({length:60},(_,i)=>({playerId:'q'+i,name:'x',value:i}))
assert.equal(mergeForgeScores(many,[{playerId:'z',name:'z',value:1000}],meta()).length,50,'forge scores: capped at 50');assert.equal(mergeForgeScores(many,[{playerId:'z',name:'z',value:1000}],meta())[0].playerId,'z')
assert.deepEqual(mergeForgeScores([{playerId:'p1',value:1},'junk',{value:2}],null,meta()),[{playerId:'p1',value:1},'junk',{value:2}],'one side: returned as is');assert.deepEqual(mergeForgeScores([{playerId:'p1',value:1},'junk'],[{value:2}],meta()),[{playerId:'p1',value:1}],'both sides: junk rows dropped')
const idA={playerId:'a',proof:'pa',name:'Local'},idB={playerId:'b',proof:'pb',name:''}
assert.deepEqual(mergeForgePlayer(idA,idB,meta()),{playerId:'b',proof:'pb',name:'Local'},'forge identity: the account copy wins, a name is never replaced by an empty one')
assert.deepEqual(mergeForgePlayer(idA,{...idB,name:'Remote'},meta()),{playerId:'b',proof:'pb',name:'Remote'});assert.equal(mergeForgePlayer(idA,null,meta()),idA)
// the 24-level campaign: an unlocked:25 save (a challenge level, or a corrupt one) survives as 24 and level-24 medals are kept
assert.equal(CARROT_LEVEL_COUNT,24)
assert.deepEqual(mergeCarrot({version:1,unlocked:25,medals:{24:7,25:7},sound:true},{version:1,unlocked:13,medals:{13:1,24:1},sound:true},meta()),{version:1,unlocked:24,medals:{13:1,24:7},sound:true},'carrot: unlocked 25 -> 24, level 24 medals kept, 25 dropped')
// Carrot Super record: taught OR, merges max, kinds per-key max
assert.deepEqual(mergeCarrotSuper({version:1,taught:false,merges:1,kinds:{seed:1}},{version:1,taught:true,merges:3,kinds:{frost:2}},meta()),{version:1,taught:true,merges:3,kinds:{seed:1,frost:2}},'super: taught OR, merges max, kinds union')
assert.deepEqual(mergeCarrotSuper({version:1,taught:true,merges:5,kinds:{seed:4,frost:1}},{version:1,taught:false,merges:2,kinds:{seed:2,frost:3}},meta()),{version:1,taught:true,merges:5,kinds:{seed:4,frost:3}},'super: per-kind max')
assert.deepEqual(mergeCarrotSuper(null,{version:1,taught:true,merges:2,kinds:{seed:2}},meta()),{version:1,taught:true,merges:2,kinds:{seed:2}});assert.deepEqual(mergeCarrotSuper({version:1,taught:false,merges:0,kinds:{}},null,meta()),{version:1,taught:false,merges:0,kinds:{}});assert.equal(mergeCarrotSuper(null,null,meta()),null)
assert.deepEqual(mergeCarrotSuper({version:1,taught:'yes',merges:-3,kinds:{seed:2.7,'Bad Kind':1,'__proto__':{x:1}}},{version:1,taught:false,merges:'2',kinds:null},meta()),{version:1,taught:false,merges:2,kinds:{seed:2}},'super: junk fields cleaned')
{const v2={version:2,taught:true,merges:9,kinds:{},extra:1};assert.equal(mergeCarrotSuper({version:1,taught:false,merges:1,kinds:{seed:1}},v2,meta()),v2,'super: a newer format wins whole');assert.equal(mergeCarrotSuper(v2,{version:1,taught:false,merges:1,kinds:{seed:1}},meta()),v2)}
// Carrot challenge record: per boss cleared OR, health max, the faster time keeps its tower count
const chA={version:1,best:{tornado:{cleared:true,health:6,seconds:200,towers:9},zombie:{cleared:true,health:10,seconds:400,towers:12}}}
const chB={version:1,best:{tornado:{cleared:true,health:9,seconds:180.26,towers:7},eyeball:{cleared:true,health:3,seconds:500,towers:14}}}
assert.deepEqual(mergeCarrotChallenges(chA,chB,meta()),{version:1,best:{tornado:{cleared:true,health:9,seconds:180.3,towers:7},zombie:{cleared:true,health:10,seconds:400,towers:12},eyeball:{cleared:true,health:3,seconds:500,towers:14}}},'challenges: OR cleared, max health, min seconds with its towers, union of bosses')
assert.deepEqual(mergeCarrotChallenges(chB,chA,meta()),mergeCarrotChallenges(chA,chB,meta()),'challenges: symmetric')
assert.deepEqual(mergeCarrotChallenges({version:1,best:{tornado:{cleared:true,health:2,seconds:150,towers:3}}},{version:1,best:{tornado:{cleared:true,health:8,seconds:150,towers:5}}},meta()).best.tornado,{cleared:true,health:8,seconds:150,towers:3},'challenges: a time tie keeps the left tower count')
assert.deepEqual(mergeCarrotChallenges(null,chB,meta()),{version:1,best:{tornado:{cleared:true,health:9,seconds:180.3,towers:7},eyeball:{cleared:true,health:3,seconds:500,towers:14}}},'challenges: one side is returned cleaned (seconds rounded to a tenth)');assert.deepEqual(mergeCarrotChallenges(chA,null,meta()),chA);assert.equal(mergeCarrotChallenges(null,null,meta()),null)
assert.deepEqual(mergeCarrotChallenges({version:1,best:{tornado:{cleared:false,health:9,seconds:1,towers:1},dragon:{cleared:true,health:9,seconds:1,towers:1},zombie:{cleared:true,health:11,seconds:1,towers:1}}},{version:1,best:{eyeball:{cleared:true,health:5,seconds:-1,towers:1}}},meta()),{version:1,best:{}},'challenges: uncleared, unknown-boss and out-of-range records are dropped')
{const v2={version:2,best:{},runs:[]};assert.equal(mergeCarrotChallenges(chA,v2,meta()),v2,'challenges: a newer format wins whole');assert.equal(mergeCarrotChallenges(v2,chA,meta()),v2)}
assert.equal(KNOWN_KEYS['carrot:super'].key,'cgs-carrot-super-v1');assert.equal(KNOWN_KEYS['carrot:challenges'].key,'cgs-carrot-challenges-v1')
for(const id of ['carrot:campaign','carrot:super','carrot:challenges','inkmaze:best','inkmaze:sound','inkmaze:code','inkmaze:code-prefs','forge:run','forge:player','forge:scores'])assert.equal(typeof MERGES[id],'function',id)
assert.ok(PRIVATE_RECORDS.has('forge:player'),'the Forge identity is account-private')
// junk keys never reach the union; a '__proto__' key cannot poison the result
{
 const junkA=JSON.parse('{"version":1,"unlocked":2,"medals":{"1":1,"25":7,"__proto__":{"x":1},"constructor":7},"sound":true}')
 const junkB={version:1,unlocked:3,medals:{2:3,'0':7,'1.5':7,'-1':7},sound:true}
 const m=mergeCarrot(junkA,junkB,meta());assert.deepEqual(m,{version:1,unlocked:3,medals:{1:1,2:3},sound:true},'carrot: only levels 1-24 survive');assert.equal(Object.getPrototypeOf(m.medals),Object.prototype);assert.ok(!('x' in m.medals))
 assert.equal(mergeCarrot({version:1,unlocked:99,medals:{1:255},sound:true},{version:1,unlocked:1,medals:{},sound:true},meta()).unlocked,24,'unlock clamped to the 24-level campaign');assert.equal(mergeCarrot({version:1,unlocked:1,medals:{1:255},sound:true},{version:1,unlocked:1,medals:{},sound:true},meta()).medals[1],7,'medal bits clamped')
 const bj=mergeBests(JSON.parse('{"first-roll":{"ink":1,"moves":1},"__proto__":{"ink":0,"moves":0},"bad key!":{"ink":0,"moves":0}}'),{'doubling-back':{ink:2,moves:2},'':{ink:0,moves:0}},meta())
 assert.deepEqual(bj,{'doubling-back':{ink:2,moves:2},'first-roll':{ink:1,moves:1}},'ink maze: slug keys only');assert.equal(Object.getPrototypeOf(bj),Object.prototype)
}
// a save-format bump: the higher version wins unchanged, whichever side or stamp it is on
{
 const v1={version:1,unlocked:9,medals:{1:7},sound:true},v2={version:2,unlocked:2,medals:{},sound:false,chapters:['x']}
 assert.equal(mergeCarrot(v1,v2,meta()),v2,'carrot: a newer remote format is adopted whole');assert.equal(mergeCarrot(v2,v1,meta()),v2,'and kept when local');assert.equal(mergeCarrot(v1,{...v1},meta()).version,1)
 assert.deepEqual(laterWins({version:3,seed:1},{version:2,seed:2},meta(100,999)),{version:3,seed:1});assert.deepEqual(laterWins({version:2,seed:1},{version:3,seed:2},meta(999,100)),{version:3,seed:2})
 assert.equal(laterWins(runA,{...runB},meta(100,200)).seed,2,'same version: later wins as before')
 assert.equal(higherVersion({version:1},{version:1}),undefined);assert.equal(higherVersion({version:'2'},{version:1}),undefined);assert.equal(higherVersion([1],{version:1}),undefined)
 const bestsV2={version:2,levels:{}};assert.equal(mergeBests({version:1,'1':{ink:1,moves:1}},bestsV2,meta()),bestsV2,'ink maze: when both carry a version the higher one is passed through');assert.deepEqual(mergeBests(bestsA,bestsV2,meta()),bestsA,'an unversioned side is merged as plain bests (the newer object has no level entries)')
}

// ---- a fake browser ----------------------------------------------------------
function harness({responder,apiUrl:apiUrl_='https://acct.test/',seed={}}={}){
 const values=new Map(Object.entries(seed)),calls=[]
 const storage={getItem:k=>values.has(k)?values.get(k):null,setItem:(k,v)=>values.set(k,String(v)),removeItem:k=>values.delete(k)}
 let clock=1_000_000,timers=[],seq=0
 const setTimeout_=(fn,ms)=>{const t={id:++seq,at:clock+Math.max(0,ms),fn};timers.push(t);return t.id}
 const clearTimeout_=id=>{timers=timers.filter(t=>t.id!==id)}
 // microtasks, then a few real macrotask turns: gzip (CompressionStream) does its work off the microtask queue
 const settle=async()=>{for(let i=0;i<20;i++)await new Promise(r=>setImmediate(r));for(let i=0;i<4;i++)await new Promise(r=>setTimeout(r,0));for(let i=0;i<20;i++)await new Promise(r=>setImmediate(r))}
 const tick=async ms=>{const end=clock+ms;for(;;){const due=timers.filter(t=>t.at<=end).sort((a,b)=>a.at-b.at||a.id-b.id)[0];if(!due)break;clock=Math.max(clock,due.at);timers=timers.filter(t=>t!==due);due.fn();await settle()}clock=end;await settle()}
 let respond=responder||(()=>({status:200,body:{}}))
 const inflate=async bytes=>new Response(new Blob([bytes]).stream().pipeThrough(new DecompressionStream('gzip'))).text()
 const fetch_=async(url,init={})=>{const path=url.replace('https://acct.test',''),type=init.headers?.['Content-Type']||'',text=init.body==null?undefined:type==='application/gzip'?await inflate(init.body):init.body,body=text?JSON.parse(text):undefined,call={path,method:init.method||'GET',body,gzip:type==='application/gzip',wire:init.body==null?0:init.body.length,keepalive:!!init.keepalive,auth:init.headers?.Authorization||''};calls.push(call);const r=await respond(call);if(r instanceof Error)throw r;return new Response(JSON.stringify(r.body??{}),{status:r.status??200,headers:{'Content-Type':'application/json'}})}
 const warnings=[]
 const sync=createSync({apiUrl:apiUrl_,storage,fetch:fetch_,now:()=>clock,setTimeout:setTimeout_,clearTimeout:clearTimeout_,warn:m=>warnings.push(m)})
 const metaFile=()=>JSON.parse(values.get(META_KEY)||'{}')
 return {sync,values,calls,warnings,storage,tick,settle,now:()=>clock,setResponder:fn=>{respond=fn},puts:()=>calls.filter(c=>c.method==='PUT'),pulls:()=>calls.filter(c=>c.path==='/me'||c.path==='/progress'),metaOf:id=>(metaFile().records||{})[id],metaFile}
}
const session=(expires=Number.MAX_SAFE_INTEGER)=>JSON.stringify({token:'cgs1.tok',expires,name:'Ada',picture:'https://lh3.googleusercontent.com/a'})
const loginOk=(progress={},id='ada-id')=>({status:200,body:{session:'cgs1.fresh',expires:9e15,player:{id,name:'Ada',picture:'https://lh3.googleusercontent.com/a'},progress}})
const meOk=(progress={},id='ada-id')=>({status:200,body:{player:{id,name:'Ada',picture:''},progress}})

// touch while signed out: only the meta stamp, no network
{
 const h=harness();const {sync}=h
 h.values.set('cgs-carrot-defense-v1',JSON.stringify(carrotA))
 sync.progress.register('carrot:campaign',{key:'cgs-carrot-defense-v1',merge:mergeCarrot})
 assert.equal(sync.account.state.status,'out')
 sync.progress.touch('carrot:campaign');await h.tick(10_000)
 assert.deepEqual(h.metaOf('carrot:campaign'),{updated:1_000_000,dirty:true},'a touch stamps the record even while signed out')
 assert.equal(h.calls.length,0,'no network while signed out')
 assert.throws(()=>sync.progress.register('Bad Id',{key:'x',merge:localWins}))
}

// login: pull, merge, write, notify, push only what differs
{
 const h=harness();const {sync}=h
 h.values.set('cgs-carrot-defense-v1',JSON.stringify(carrotA));h.values.set('cgs-inkmaze-best-v1',JSON.stringify(bestsA));h.values.set('cgs-inkmaze-sound-v1','off')
 let notified=0
 sync.progress.register('carrot:campaign',{key:'cgs-carrot-defense-v1',merge:mergeCarrot});sync.progress.subscribe('carrot:campaign',()=>notified++)
 sync.progress.register('inkmaze:best',{key:'cgs-inkmaze-best-v1',merge:mergeBests})
 sync.progress.register('inkmaze:sound',{key:'cgs-inkmaze-sound-v1',read:()=>h.storage.getItem('cgs-inkmaze-sound-v1'),write:v=>h.storage.setItem('cgs-inkmaze-sound-v1',v),merge:localWins})
 const states=[];sync.account.onChange(s=>states.push(s.status))
 h.setResponder(c=>{if(c.path==='/login'){assert.equal(c.body.idToken,'google-id-token');assert.equal(c.auth,'','the login carries no bearer');return loginOk({'carrot:campaign':{data:carrotB,updated:500,version:3},'inkmaze:best':{data:bestsA,updated:600,version:1}})}if(c.method==='PUT')return {status:200,body:{stored:true,updated:c.body.updated,version:4}};return {status:404,body:{}}})
 await sync.account.login('google-id-token');await h.settle()
 assert.deepEqual(states,['loading','in'])
 assert.deepEqual(sync.account.state,{status:'in',name:'Ada',picture:'https://lh3.googleusercontent.com/a'})
 assert.equal(JSON.parse(h.values.get(SESSION_KEY)).token,'cgs1.fresh','the Worker session is stored, never the Google token')
 assert.deepEqual(JSON.parse(h.values.get('cgs-carrot-defense-v1')),{version:1,unlocked:6,medals:{1:7,2:7,3:7,5:1},sound:false},'the merged campaign is written locally')
 assert.equal(notified,1,'the page is told to re-read the campaign')
 assert.equal(h.values.get('cgs-inkmaze-sound-v1'),'off','a device preference stays')
 assert.deepEqual(h.metaOf('inkmaze:best'),{updated:600,dirty:false},'a record equal to the server adopts its stamp and is not pushed')
 assert.equal(h.metaOf('carrot:campaign').dirty,true)
 await h.tick(DEBOUNCE_MS+1)
 assert.equal(h.puts().length,2,'only the records that differ from the server are pushed: carrot and the sound the server never had')
 const put=h.puts().find(c=>c.path==='/progress/carrot:campaign')
 assert.deepEqual(put.body.data.medals,{1:7,2:7,3:7,5:1});assert.ok(put.body.updated>=500);assert.equal(put.auth,'Bearer cgs1.fresh')
 assert.equal(h.metaOf('carrot:campaign').dirty,false,'stored: clean')
 assert.equal(h.metaOf('inkmaze:sound').dirty,false)
}

// debounce, floor, and a touch during flight
{
 const h=harness();h.values.set(SESSION_KEY,session());const {sync}=h
 const save={...carrotA};h.values.set('cgs-carrot-defense-v1',JSON.stringify(save))
 h.setResponder(c=>c.path==='/me'?{status:200,body:{player:{name:'Ada',picture:''},progress:{}}}:c.method==='PUT'?{status:200,body:{stored:true,updated:c.body.updated,version:1}}:{status:404,body:{}})
 sync.account.start();assert.equal(sync.account.state.status,'in','a held session is adopted at once');await h.settle()
 assert.equal(h.calls[0].path,'/me')
 sync.progress.register('carrot:campaign',{key:'cgs-carrot-defense-v1',merge:mergeCarrot});await h.settle()
 const before=h.puts().length
 sync.progress.touch('carrot:campaign');await h.tick(500);sync.progress.touch('carrot:campaign');await h.tick(500);sync.progress.touch('carrot:campaign')
 await h.tick(DEBOUNCE_MS-1);assert.equal(h.puts().length,before,'still debouncing')
 await h.tick(2);assert.equal(h.puts().length,before+1,'three touches coalesce into one PUT')
 sync.progress.touch('carrot:campaign');await h.tick(DEBOUNCE_MS+1);assert.equal(h.puts().length,before+1,'the 2.5 s floor holds the second PUT')
 await h.tick(PUT_FLOOR_MS);assert.equal(h.puts().length,before+2,'and it goes once the floor passes')
 // a touch while a PUT is in flight
 let release;h.setResponder(c=>c.method==='PUT'?new Promise(r=>{release=()=>r({status:200,body:{stored:true,updated:c.body.updated,version:2}})}):{status:404,body:{}})
 await h.tick(PUT_FLOOR_MS);sync.progress.touch('carrot:campaign');await h.tick(DEBOUNCE_MS+1);assert.equal(h.puts().length,before+3);assert.ok(release)
 sync.progress.touch('carrot:campaign');release();await h.settle()
 assert.equal(h.metaOf('carrot:campaign').dirty,true,'touched during the flight: still dirty')
 h.setResponder(c=>c.method==='PUT'?{status:200,body:{stored:true,updated:c.body.updated,version:3}}:{status:404,body:{}})
 await h.tick(PUT_FLOOR_MS+DEBOUNCE_MS);assert.equal(h.puts().length,before+4,'and pushed again');assert.equal(h.metaOf('carrot:campaign').dirty,false)
}

// stored:false → merge the server's copy, write it, re-PUT once
{
 const h=harness();h.values.set(SESSION_KEY,session());const {sync}=h
 h.values.set('cgs-carrot-defense-v1',JSON.stringify(carrotA))
 const serverCopy={data:carrotB,updated:5_000_000,version:9};let puts=0
 h.setResponder(c=>c.path==='/me'?{status:200,body:{player:{name:'Ada',picture:''},progress:{}}}:c.method==='PUT'?(++puts===1?{status:200,body:{stored:false,current:serverCopy}}:{status:200,body:{stored:true,updated:c.body.updated,version:10}}):{status:404,body:{}})
 sync.account.start();await h.settle()
 let notified=0;sync.progress.subscribe('carrot:campaign',()=>notified++)
 sync.progress.register('carrot:campaign',{key:'cgs-carrot-defense-v1',merge:mergeCarrot});sync.progress.touch('carrot:campaign')
 await h.tick(DEBOUNCE_MS+1);assert.equal(puts,1)
 assert.deepEqual(JSON.parse(h.values.get('cgs-carrot-defense-v1')).medals,{1:7,2:7,3:7,5:1},'the newer server copy is merged in');assert.equal(notified,1)
 await h.tick(PUT_FLOOR_MS+DEBOUNCE_MS);assert.equal(puts,2,'one re-PUT');assert.equal(h.puts()[1].body.updated,5_000_000,'with the server stamp so it is accepted');assert.equal(h.metaOf('carrot:campaign').dirty,false)
 await h.tick(60_000);assert.equal(puts,2,'and no more')
}

// 401 → signed out, dirty kept; 400 → dropped with one warning; 429 → retried after retryAfter
{
 const h=harness();h.values.set(SESSION_KEY,session());const {sync}=h
 h.values.set('cgs-carrot-defense-v1',JSON.stringify(carrotA))
 h.setResponder(c=>c.path==='/me'?{status:200,body:{player:{name:'Ada',picture:''},progress:{}}}:c.method==='PUT'?{status:429,body:{error:'Slow down.',retryAfter:2}}:{status:404,body:{}})
 sync.account.start();await h.settle()
 sync.progress.register('carrot:campaign',{key:'cgs-carrot-defense-v1',merge:mergeCarrot});sync.progress.touch('carrot:campaign')
 await h.tick(DEBOUNCE_MS+1);assert.equal(h.puts().length,1)
 h.setResponder(c=>c.method==='PUT'?{status:200,body:{stored:true,updated:c.body.updated,version:1}}:{status:404,body:{}})
 await h.tick(1_999);assert.equal(h.puts().length,1);await h.tick(600);assert.equal(h.puts().length,2,'429: retried after retryAfter');assert.equal(h.metaOf('carrot:campaign').dirty,false)
 h.setResponder(c=>c.method==='PUT'?{status:413,body:{error:'Too big.'}}:{status:404,body:{}})
 sync.progress.touch('carrot:campaign');await h.tick(PUT_FLOOR_MS+DEBOUNCE_MS);assert.equal(h.puts().length,3);assert.equal(h.metaOf('carrot:campaign').dirty,false,'413: dropped');assert.equal(h.warnings.length,1)
 sync.progress.touch('carrot:campaign');await h.tick(PUT_FLOOR_MS+DEBOUNCE_MS);assert.equal(h.warnings.length,1,'warned once');assert.equal(h.puts().length,3,'a record of the same size is not sent again after a 413')
 h.values.set('cgs-carrot-defense-v1',JSON.stringify({...carrotA,medals:{}}))   // smaller than the refused one: tried again
 h.setResponder(c=>c.method==='PUT'?{status:401,body:{error:'Please sign in again.'}}:{status:404,body:{}})
 sync.progress.touch('carrot:campaign');await h.tick(PUT_FLOOR_MS+DEBOUNCE_MS);assert.equal(h.puts().length,4)
 assert.equal(sync.account.state.status,'out','401: signed out');assert.equal(h.values.has(SESSION_KEY),false);assert.equal(h.metaOf('carrot:campaign').dirty,true,'the change waits for the next login')
 sync.progress.touch('carrot:campaign');await h.tick(60_000);assert.equal(h.puts().length,4,'no more pushes without a session')
}

// network failure → backoff then success; /me failure keeps the optimistic session and is retried
{
 const h=harness();h.values.set(SESSION_KEY,session());const {sync}=h
 h.values.set('cgs-carrot-defense-v1',JSON.stringify(carrotA))
 let down=true,me=0
 h.setResponder(c=>{if(c.path==='/me'||c.path==='/progress'){me++;if(down)return new Error('offline');return meOk({})}if(c.method==='PUT')return down?new Error('offline'):{status:200,body:{stored:true,updated:c.body.updated,version:1}};return {status:404,body:{}}})
 sync.account.start();await h.settle();assert.equal(sync.account.state.status,'in','offline: stays signed in on the cached name');assert.equal(me,1)
 sync.progress.register('carrot:campaign',{key:'cgs-carrot-defense-v1',merge:mergeCarrot});sync.progress.touch('carrot:campaign')
 await h.tick(DEBOUNCE_MS+1);assert.equal(h.puts().length,0,'offline before the first pull: nothing is pushed yet');await h.tick(1_999);assert.equal(me,2,'the pull is retried after 2 s');await h.tick(4_000);assert.equal(me,3,'then 4 s')
 down=false;await h.tick(8_001);assert.ok(me>=4);await h.tick(DEBOUNCE_MS+1);assert.equal(h.puts().length,1,'back online: pulled, merged, pushed');assert.equal(h.metaOf('carrot:campaign').dirty,false)
 // the network drops again while playing: PUTs back off 2 s, 4 s, 8 s (held to the 2.5 s floor) and reset on success
 down=true;await h.tick(PUT_FLOOR_MS);sync.progress.touch('carrot:campaign');await h.tick(DEBOUNCE_MS+1);assert.equal(h.puts().length,2)
 await h.tick(2_490);assert.equal(h.puts().length,2);await h.tick(20);assert.equal(h.puts().length,3,'retry after 2 s, held to the 2.5 s floor')
 await h.tick(3_980);assert.equal(h.puts().length,3);await h.tick(20);assert.equal(h.puts().length,4,'then 4 s')
 down=false;await h.tick(8_001);assert.equal(h.puts().length,5);assert.equal(h.metaOf('carrot:campaign').dirty,false,'then success')
 sync.progress.touch('carrot:campaign');await h.tick(PUT_FLOOR_MS+DEBOUNCE_MS);assert.equal(h.puts().length,6,'backoff reset after success')
}

// flush(): every dirty record at once, with keepalive, ignoring the floor
{
 const h=harness();h.values.set(SESSION_KEY,session());const {sync}=h
 h.values.set('cgs-carrot-defense-v1',JSON.stringify(carrotA));h.values.set('cgs-inkmaze-best-v1',JSON.stringify(bestsA))
 h.setResponder(c=>c.path==='/me'?{status:200,body:{player:{name:'Ada',picture:''},progress:{}}}:c.method==='PUT'?{status:200,body:{stored:true,updated:c.body.updated,version:1}}:{status:404,body:{}})
 sync.account.start();await h.settle()
 sync.progress.register('carrot:campaign',{key:'cgs-carrot-defense-v1',merge:mergeCarrot});sync.progress.register('inkmaze:best',{key:'cgs-inkmaze-best-v1',merge:mergeBests})
 await h.tick(DEBOUNCE_MS+1);assert.equal(h.puts().length,2,'records the server never had are pushed after the first pull')
 sync.progress.touch('carrot:campaign');await h.tick(PUT_FLOOR_MS+DEBOUNCE_MS);assert.equal(h.puts().length,3)
 sync.progress.touch('carrot:campaign');sync.progress.touch('inkmaze:best')
 await sync.progress.flush();await h.settle()
 assert.equal(h.puts().length,5,'flush sends both dirty records at once, ignoring the floor');assert.ok(h.puts().slice(3).every(c=>c.keepalive),'with keepalive');assert.ok(h.puts().slice(0,3).every(c=>!c.keepalive))
 assert.equal(h.metaOf('carrot:campaign').dirty,false);assert.equal(h.metaOf('inkmaze:best').dirty,false)
}

// a late register merges against the last pull; a legacy local save with no stamp
{
 const h=harness();h.values.set(SESSION_KEY,session());const {sync}=h
 h.values.set('cgs-forge-run-v1',JSON.stringify(runA))
 h.setResponder(c=>c.path==='/me'?{status:200,body:{player:{name:'Ada',picture:''},progress:{'forge:run':{data:runB,updated:7_000,version:2},'inkmaze:best':{data:bestsB,updated:8_000,version:1}}}}:c.method==='PUT'?{status:200,body:{stored:true,updated:c.body.updated,version:1}}:{status:404,body:{}})
 sync.account.start();await h.settle()
 let adopted=0;sync.progress.subscribe('forge:run',()=>adopted++)
 sync.progress.register('forge:run',{key:'cgs-forge-run-v1',merge:laterWins})
 assert.deepEqual(JSON.parse(h.values.get('cgs-forge-run-v1')),runB,'a never-stamped local run loses to the signed-in one');assert.equal(adopted,1)
 assert.deepEqual(h.metaOf('forge:run'),{updated:7_000,dirty:false})
 sync.progress.register('inkmaze:best',{key:'cgs-inkmaze-best-v1',merge:mergeBests})
 assert.deepEqual(JSON.parse(h.values.get('cgs-inkmaze-best-v1')),bestsB,'a game page opened later still receives the pulled bests')
 await h.tick(DEBOUNCE_MS+1);assert.equal(h.puts().length,0,'nothing to push back')
 // a write made by the pull does not count as a touch
 const h2=harness();h2.values.set(SESSION_KEY,session())
 h2.setResponder(c=>c.path==='/me'?{status:200,body:{player:{name:'Ada',picture:''},progress:{'forge:run':{data:runB,updated:7_000,version:2}}}}:{status:404,body:{}})
 h2.sync.account.start();await h2.settle()
 h2.sync.progress.register('forge:run',{key:'cgs-forge-run-v1',read:()=>JSON.parse(h2.storage.getItem('cgs-forge-run-v1')||'null'),write:v=>{h2.storage.setItem('cgs-forge-run-v1',JSON.stringify(v));h2.sync.progress.touch('forge:run')},merge:laterWins})
 await h2.tick(DEBOUNCE_MS+1);assert.equal(h2.puts().length,0,'a game whose write() calls touch() does not echo the pull back');assert.deepEqual(h2.metaOf('forge:run'),{updated:7_000,dirty:false})
}

// sign out and delete: the token goes, the device keeps its saves, the pull is forgotten
{
 const h=harness();h.values.set(SESSION_KEY,session());const {sync}=h
 h.values.set('cgs-carrot-defense-v1',JSON.stringify(carrotA))
 h.setResponder(c=>c.path==='/me'?{status:200,body:{player:{name:'Ada',picture:''},progress:{}}}:c.path==='/logout'||c.path==='/account'?{status:200,body:{ok:true}}:{status:404,body:{}})
 sync.account.start();await h.settle();sync.progress.register('carrot:campaign',{key:'cgs-carrot-defense-v1',merge:mergeCarrot})
 await sync.account.logout();assert.equal(sync.account.state.status,'out');assert.equal(h.calls.at(-1).path,'/logout');assert.equal(h.values.has(SESSION_KEY),false)
 assert.deepEqual(JSON.parse(h.values.get('cgs-carrot-defense-v1')),carrotA,'local saves are kept')
 sync.progress.touch('carrot:campaign');await h.tick(10_000);assert.equal(h.puts().length,0)
 h.values.set(SESSION_KEY,session());sync.account.start();await h.settle();assert.equal(sync.account.state.status,'in')
 await sync.account.deleteAccount();assert.equal(h.calls.at(-1).path,'/account');assert.equal(h.calls.at(-1).method,'DELETE');assert.equal(sync.account.state.status,'out');assert.equal(h.values.has(SESSION_KEY),false)
 // an expired session is never adopted
 h.values.set(SESSION_KEY,session(h.now()-1));sync.account.start();assert.equal(sync.account.state.status,'out');assert.equal(h.values.has(SESSION_KEY),false)
 // a failed login reports and stays out
 h.setResponder(c=>c.path==='/login'?{status:401,body:{error:'Google sign-in could not be verified.'}}:{status:404,body:{}})
 await assert.rejects(sync.account.login('bad'));assert.equal(sync.account.state.status,'out');assert.equal(sync.account.state.error,'Google sign-in could not be verified.')
}

// a stale pull on return to the tab
{
 const h=harness();h.values.set(SESSION_KEY,session());const {sync}=h
 let pulls=0;h.setResponder(c=>{if(c.path==='/me'||c.path==='/progress'){pulls++;return {status:200,body:{player:{name:'Ada',picture:''},progress:{}}}}return {status:404,body:{}}})
 sync.account.start();await h.settle();assert.equal(pulls,1)
 sync.account.pullIfStale();await h.settle();assert.equal(pulls,1,'fresh: no pull')
 await h.tick(5*60_000+1);sync.account.pullIfStale();await h.settle();assert.equal(pulls,2,'older than five minutes: pulled');assert.equal(h.calls.at(-1).path,'/progress')
}

// LATE REGISTER vs a stale pull: the game page loads long after login; the server changed meanwhile
{
 const h=harness();h.values.set(SESSION_KEY,session());const {sync}=h
 const runC={version:2,seed:3,actions:[1,2,3],ticket:null}
 let server={'forge:run':{data:runB,updated:7_000,version:2}}
 h.setResponder(c=>c.path==='/me'||c.path==='/progress'?meOk(server):c.method==='PUT'?{status:200,body:{stored:true,updated:c.body.updated,version:9}}:{status:404,body:{}})
 sync.account.start();await h.settle();assert.equal(h.pulls().length,1)
 await h.tick(10*60_000)                                   // the list page sat open; another device played
 const T=h.now()-30_000;server={'forge:run':{data:runC,updated:T,version:5}}
 h.values.set('cgs-forge-run-v1',JSON.stringify(runA))    // this device's legacy run, never stamped
 sync.progress.register('forge:run',{key:'cgs-forge-run-v1',merge:laterWins})
 assert.deepEqual(JSON.parse(h.values.get('cgs-forge-run-v1')),runA,'not merged against the ten-minute-old snapshot')
 await h.settle();assert.equal(h.pulls().length,2);assert.equal(h.calls.at(-1).path,'/progress','a fresh pull was requested by the registration')
 assert.deepEqual(JSON.parse(h.values.get('cgs-forge-run-v1')),runC,'merged against the current server copy');assert.deepEqual(h.metaOf('forge:run'),{updated:T,dirty:false})
 sync.progress.touch('forge:run');await h.tick(DEBOUNCE_MS+1)
 assert.equal(h.puts().length,1);assert.deepEqual(h.puts()[0].body.data,runC,'the first PUT carries the newer run, not the stale one');assert.ok(h.puts()[0].body.updated>T)
 // the same with the pull held back: a touch before it lands pushes nothing; the merge happens first
 const h2=harness();h2.values.set(SESSION_KEY,session())
 let release=null;h2.setResponder(c=>c.path==='/me'?meOk({'forge:run':{data:runB,updated:7_000,version:2}}):c.path==='/progress'?new Promise(r=>{release=()=>r(meOk({'forge:run':{data:runC,updated:h2.now()-1000,version:5}}))}):c.method==='PUT'?{status:200,body:{stored:true,updated:c.body.updated,version:9}}:{status:404,body:{}})
 h2.sync.account.start();await h2.settle();await h2.tick(10*60_000)
 h2.values.set('cgs-forge-run-v1',JSON.stringify(runA));h2.sync.progress.register('forge:run',{key:'cgs-forge-run-v1',merge:laterWins});await h2.settle();assert.ok(release,'pull in flight')
 h2.sync.progress.touch('forge:run');await h2.tick(DEBOUNCE_MS+MAX_WAIT_MS);assert.equal(h2.puts().length,0,'no PUT before the record was merged with a current copy')
 await h2.sync.progress.flush();assert.equal(h2.puts().length,0,'not even on pagehide')
 release();await h2.settle();assert.deepEqual(JSON.parse(h2.values.get('cgs-forge-run-v1')),runC,'the fresher server run replaces the unstamped local one')
 await h2.tick(DEBOUNCE_MS+1);assert.equal(h2.puts().length,0,'nothing differs from the server now')
 // a register right after a pull merges against it without another request (coalesced)
 const h3=harness();h3.values.set(SESSION_KEY,session());h3.setResponder(c=>c.path==='/me'||c.path==='/progress'?meOk({'inkmaze:best':{data:bestsB,updated:8_000,version:1}}):{status:404,body:{}})
 h3.sync.account.start();await h3.settle();await h3.tick(FRESH_PULL_MS-1)
 h3.sync.progress.register('inkmaze:best',{key:'cgs-inkmaze-best-v1',merge:mergeBests});await h3.settle();assert.equal(h3.pulls().length,1,'fresh enough: no second pull');assert.deepEqual(JSON.parse(h3.values.get('cgs-inkmaze-best-v1')),bestsB)
 // a pull that keeps failing is retried with backoff, and the record still waits for it
 const h4=harness();h4.values.set(SESSION_KEY,session());let down=true
 h4.setResponder(c=>c.path==='/me'||c.path==='/progress'?(down?{status:503,body:{error:'unavailable'}}:meOk({})):c.method==='PUT'?{status:200,body:{stored:true,updated:c.body.updated,version:1}}:{status:404,body:{}})
 h4.sync.account.start();await h4.settle();h4.values.set('cgs-carrot-defense-v1',JSON.stringify(carrotA));h4.sync.progress.register('carrot:campaign',{key:'cgs-carrot-defense-v1',merge:mergeCarrot});h4.sync.progress.touch('carrot:campaign')
 await h4.tick(30_000);assert.equal(h4.puts().length,0,'server down: no push before a pull');assert.ok(h4.pulls().length>=3,'the pull is retried')
 down=false;await h4.tick(60_000);assert.equal(h4.puts().length,1,'server back: pulled, merged, pushed')
}

// SHARED DEVICE: account B signs in where account A's saves are; nothing crosses until the player chooses
{
 const forgeId={playerId:'a-uuid',proof:'a-proof',name:'Ada'}
 const seed=h=>{h.values.set('cgs-carrot-defense-v1',JSON.stringify(carrotA));h.values.set('cgs-forge-player',JSON.stringify(forgeId));h.values.set('cgs-inkmaze-best-v1',JSON.stringify(bestsA))}
 const reg=h=>{h.sync.progress.register('carrot:campaign',{key:'cgs-carrot-defense-v1',merge:mergeCarrot});h.sync.progress.register('forge:player',{key:'cgs-forge-player',merge:mergeForgePlayer});h.sync.progress.register('inkmaze:best',{key:'cgs-inkmaze-best-v1',merge:mergeBests})}
 const okPut=c=>({status:200,body:{stored:true,updated:c.body.updated,version:1}})
 // A signs in (first account on this device: the guest saves become A's), plays, signs out
 const h=harness();seed(h);reg(h)
 h.setResponder(c=>c.path==='/login'?loginOk({},'A'):c.method==='PUT'?okPut(c):c.path==='/logout'?{status:200,body:{ok:true}}:{status:404,body:{}})
 await h.sync.account.login('tok-a');await h.tick(DEBOUNCE_MS+1);assert.equal(h.puts().length,3,'A: the guest saves are pushed');assert.equal(h.metaFile().owner,'A')
 await h.sync.account.logout();assert.equal(h.sync.account.state.status,'out');assert.deepEqual(JSON.parse(h.values.get('cgs-forge-player')),forgeId,'plain sign-out keeps the saves')
 // B signs in: held
 const states=[];h.sync.account.onChange(s=>states.push(s.pending||s.status))
 h.setResponder(c=>c.path==='/login'?loginOk({'carrot:campaign':{data:carrotB,updated:500,version:1},'forge:player':{data:{playerId:'b-uuid',proof:'b-proof',name:'Bea'},updated:400,version:1}},'B'):c.method==='PUT'?okPut(c):c.path==='/logout'?{status:200,body:{ok:true}}:{status:404,body:{}})
 await h.sync.account.login('tok-b');await h.tick(DEBOUNCE_MS+MAX_WAIT_MS)
 assert.equal(h.sync.account.state.status,'in');assert.equal(h.sync.account.state.pending,'local-saves','B must choose');assert.deepEqual(states.at(-1),'local-saves')
 assert.deepEqual(JSON.parse(h.values.get('cgs-carrot-defense-v1')),carrotA,'nothing merged yet');assert.equal(h.puts().length,3,'nothing pushed');assert.equal(h.metaFile().owner,'A','owner unchanged while held')
 h.sync.progress.touch('carrot:campaign');await h.tick(DEBOUNCE_MS+MAX_WAIT_MS);await h.sync.progress.flush();assert.equal(h.puts().length,3,'play while held is not pushed either')
 // B chooses "use my account's progress": A's saves are gone, B's copies are in, B's identity is B's
 h.sync.account.resolveLocalSaves(false);await h.settle()
 assert.equal(h.sync.account.state.pending,undefined);assert.equal(h.metaFile().owner,'B')
 assert.deepEqual(JSON.parse(h.values.get('cgs-carrot-defense-v1')),carrotB,'B campaign replaces A');assert.deepEqual(JSON.parse(h.values.get('cgs-forge-player')),{playerId:'b-uuid',proof:'b-proof',name:'Bea'},'B identity, never A proof');assert.equal(h.values.has('cgs-inkmaze-best-v1'),false,'a save B does not have is removed, not inherited')
 await h.tick(DEBOUNCE_MS+1);assert.equal(h.puts().length,3,'nothing of A was pushed to B')
 // same again, B chooses to merge: progress unions, but the private Forge identity is still dropped
 const h2=harness({seed:{[META_KEY]:JSON.stringify({owner:'A',keys:{},records:{}})}});seed(h2);reg(h2)
 h2.setResponder(c=>c.path==='/login'?loginOk({'carrot:campaign':{data:carrotB,updated:500,version:1}},'B'):c.method==='PUT'?okPut(c):{status:404,body:{}})
 await h2.sync.account.login('tok-b');assert.equal(h2.sync.account.state.pending,'local-saves')
 h2.sync.account.resolveLocalSaves(true);await h2.tick(DEBOUNCE_MS+1)
 assert.deepEqual(JSON.parse(h2.values.get('cgs-carrot-defense-v1')).medals,{1:7,2:7,3:7,5:1},'merged');assert.equal(h2.values.has('cgs-forge-player'),false,'A forge identity dropped: identity() will mint a fresh one for B');assert.deepEqual(JSON.parse(h2.values.get('cgs-inkmaze-best-v1')),bestsA,'B inherits the bests by choice')
 assert.ok(!h2.puts().some(c=>c.path==='/progress/forge:player'),'A identity was never sent to B');assert.ok(h2.puts().some(c=>c.path==='/progress/carrot:campaign'))
 // a device that was A's but holds no saves any more: B is adopted silently (private keys known from earlier visits are dropped)
 const h3=harness({seed:{[META_KEY]:JSON.stringify({owner:'A',keys:{'forge:player':{key:'cgs-forge-player',private:true}},records:{}}),'cgs-forge-player':JSON.stringify(forgeId)}})
 h3.setResponder(c=>c.path==='/login'?loginOk({},'B'):{status:404,body:{}})
 h3.sync.progress.register('carrot:campaign',{key:'cgs-carrot-defense-v1',merge:mergeCarrot})
 await h3.sync.account.login('tok-b');assert.equal(h3.sync.account.state.pending,'local-saves','an identity from an earlier Forge visit counts as a save')
 h3.sync.account.resolveLocalSaves(true);assert.equal(h3.values.has('cgs-forge-player'),false,'the unregistered private key is dropped too');assert.equal(h3.metaFile().owner,'B')
 // the same account again: no prompt
 const h4=harness({seed:{[META_KEY]:JSON.stringify({owner:'A',keys:{},records:{}})}});seed(h4);reg(h4)
 h4.setResponder(c=>c.path==='/login'?loginOk({},'A'):c.method==='PUT'?okPut(c):{status:404,body:{}})
 await h4.sync.account.login('tok-a');assert.equal(h4.sync.account.state.pending,undefined,'A again: merged at once');await h4.tick(DEBOUNCE_MS+1);assert.equal(h4.puts().length,3)
 // sign out and clear this device: every registered key and every key seen before is removed, subscribers told, owner cleared
 const h5=harness({seed:{[META_KEY]:JSON.stringify({owner:'A',keys:{'inkmaze:sound':{key:'cgs-inkmaze-sound-v1',private:false}},records:{}}),[SESSION_KEY]:session(),'cgs-inkmaze-sound-v1':'off'}});seed(h5);reg(h5)
 let told=0;h5.sync.progress.subscribe('carrot:campaign',()=>told++)
 h5.setResponder(c=>c.path==='/me'?meOk({},'A'):c.path==='/logout'?{status:200,body:{ok:true}}:{status:404,body:{}})
 h5.sync.account.start();await h5.settle();await h5.sync.account.logout({clearDevice:true})
 for(const k of ['cgs-carrot-defense-v1','cgs-forge-player','cgs-inkmaze-best-v1','cgs-inkmaze-sound-v1'])assert.equal(h5.values.has(k),false,k+' removed')
 assert.equal(told,1,'the open page re-reads');assert.equal(h5.metaFile().owner,'');assert.deepEqual(h5.metaFile().records,{});assert.equal(h5.values.has(SESSION_KEY),false)
 // keys a game page never registered on this device are still known (KNOWN_KEYS): clear and replace cover them too
 // the 24-level campaign: an unlocked:25 save (a challenge level, or a corrupt one) survives as 24 and level-24 medals are kept
assert.equal(CARROT_LEVEL_COUNT,24)
assert.deepEqual(mergeCarrot({version:1,unlocked:25,medals:{24:7,25:7},sound:true},{version:1,unlocked:13,medals:{13:1,24:1},sound:true},meta()),{version:1,unlocked:24,medals:{13:1,24:7},sound:true},'carrot: unlocked 25 -> 24, level 24 medals kept, 25 dropped')
// Carrot Super record: taught OR, merges max, kinds per-key max
assert.deepEqual(mergeCarrotSuper({version:1,taught:false,merges:1,kinds:{seed:1}},{version:1,taught:true,merges:3,kinds:{frost:2}},meta()),{version:1,taught:true,merges:3,kinds:{seed:1,frost:2}},'super: taught OR, merges max, kinds union')
assert.deepEqual(mergeCarrotSuper({version:1,taught:true,merges:5,kinds:{seed:4,frost:1}},{version:1,taught:false,merges:2,kinds:{seed:2,frost:3}},meta()),{version:1,taught:true,merges:5,kinds:{seed:4,frost:3}},'super: per-kind max')
assert.deepEqual(mergeCarrotSuper(null,{version:1,taught:true,merges:2,kinds:{seed:2}},meta()),{version:1,taught:true,merges:2,kinds:{seed:2}});assert.deepEqual(mergeCarrotSuper({version:1,taught:false,merges:0,kinds:{}},null,meta()),{version:1,taught:false,merges:0,kinds:{}});assert.equal(mergeCarrotSuper(null,null,meta()),null)
assert.deepEqual(mergeCarrotSuper({version:1,taught:'yes',merges:-3,kinds:{seed:2.7,'Bad Kind':1,'__proto__':{x:1}}},{version:1,taught:false,merges:'2',kinds:null},meta()),{version:1,taught:false,merges:2,kinds:{seed:2}},'super: junk fields cleaned')
{const v2={version:2,taught:true,merges:9,kinds:{},extra:1};assert.equal(mergeCarrotSuper({version:1,taught:false,merges:1,kinds:{seed:1}},v2,meta()),v2,'super: a newer format wins whole');assert.equal(mergeCarrotSuper(v2,{version:1,taught:false,merges:1,kinds:{seed:1}},meta()),v2)}
// Carrot challenge record: per boss cleared OR, health max, the faster time keeps its tower count
const chA={version:1,best:{tornado:{cleared:true,health:6,seconds:200,towers:9},zombie:{cleared:true,health:10,seconds:400,towers:12}}}
const chB={version:1,best:{tornado:{cleared:true,health:9,seconds:180.26,towers:7},eyeball:{cleared:true,health:3,seconds:500,towers:14}}}
assert.deepEqual(mergeCarrotChallenges(chA,chB,meta()),{version:1,best:{tornado:{cleared:true,health:9,seconds:180.3,towers:7},zombie:{cleared:true,health:10,seconds:400,towers:12},eyeball:{cleared:true,health:3,seconds:500,towers:14}}},'challenges: OR cleared, max health, min seconds with its towers, union of bosses')
assert.deepEqual(mergeCarrotChallenges(chB,chA,meta()),mergeCarrotChallenges(chA,chB,meta()),'challenges: symmetric')
assert.deepEqual(mergeCarrotChallenges({version:1,best:{tornado:{cleared:true,health:2,seconds:150,towers:3}}},{version:1,best:{tornado:{cleared:true,health:8,seconds:150,towers:5}}},meta()).best.tornado,{cleared:true,health:8,seconds:150,towers:3},'challenges: a time tie keeps the left tower count')
assert.deepEqual(mergeCarrotChallenges(null,chB,meta()),{version:1,best:{tornado:{cleared:true,health:9,seconds:180.3,towers:7},eyeball:{cleared:true,health:3,seconds:500,towers:14}}},'challenges: one side is returned cleaned (seconds rounded to a tenth)');assert.deepEqual(mergeCarrotChallenges(chA,null,meta()),chA);assert.equal(mergeCarrotChallenges(null,null,meta()),null)
assert.deepEqual(mergeCarrotChallenges({version:1,best:{tornado:{cleared:false,health:9,seconds:1,towers:1},dragon:{cleared:true,health:9,seconds:1,towers:1},zombie:{cleared:true,health:11,seconds:1,towers:1}}},{version:1,best:{eyeball:{cleared:true,health:5,seconds:-1,towers:1}}},meta()),{version:1,best:{}},'challenges: uncleared, unknown-boss and out-of-range records are dropped')
{const v2={version:2,best:{},runs:[]};assert.equal(mergeCarrotChallenges(chA,v2,meta()),v2,'challenges: a newer format wins whole');assert.equal(mergeCarrotChallenges(v2,chA,meta()),v2)}
assert.equal(KNOWN_KEYS['carrot:super'].key,'cgs-carrot-super-v1');assert.equal(KNOWN_KEYS['carrot:challenges'].key,'cgs-carrot-challenges-v1')
for(const id of ['carrot:campaign','carrot:super','carrot:challenges','inkmaze:best','inkmaze:sound','forge:run','forge:player','forge:scores'])assert.equal(typeof KNOWN_KEYS[id]?.key,'string',id+' is a known key');assert.equal(KNOWN_KEYS['forge:player'].private,true)
 const h6=harness({seed:{[SESSION_KEY]:session(),'cgs-forge-player':JSON.stringify(forgeId),'cgs-forge-run-v1':JSON.stringify(runA),'cgs-inkmaze-best-v1':JSON.stringify(bestsA)}})
 h6.setResponder(c=>c.path==='/me'?meOk({},'A'):c.path==='/logout'?{status:200,body:{ok:true}}:{status:404,body:{}})
 h6.sync.account.start();await h6.settle();await h6.sync.account.logout({clearDevice:true})
 for(const k of ['cgs-forge-player','cgs-forge-run-v1','cgs-inkmaze-best-v1'])assert.equal(h6.values.has(k),false,k+' removed although never registered here')
 const h7=harness({seed:{[META_KEY]:JSON.stringify({owner:'A',keys:{},records:{}}),'cgs-forge-player':JSON.stringify(forgeId)}})
 h7.setResponder(c=>c.path==='/login'?loginOk({},'B'):{status:404,body:{}})
 await h7.sync.account.login('tok-b');assert.equal(h7.sync.account.state.pending,'local-saves','a Forge identity from before the feature counts as a save');h7.sync.account.resolveLocalSaves(true);assert.equal(h7.values.has('cgs-forge-player'),false,'and is dropped on merge, Forge page never opened')
}

// A NEWER SAVE FORMAT on the server: an older build must neither use it nor overwrite it
{
 const h=harness();h.values.set(SESSION_KEY,session());const {sync}=h
 const readV1=()=>{try{const raw=JSON.parse(h.storage.getItem('cgs-carrot-defense-v1')||'null');return raw&&raw.version===1?raw:null}catch{return null}}
 h.values.set('cgs-carrot-defense-v1',JSON.stringify(carrotA))
 const v99={version:99,unlocked:12,medals:{},sound:true,chapters:[1,2,3]}
 h.setResponder(c=>c.path==='/me'||c.path==='/progress'?meOk({'carrot:campaign':{data:v99,updated:5_000,version:7}}):c.method==='PUT'?{status:200,body:{stored:true,updated:c.body.updated,version:8}}:{status:404,body:{}})
 let notified=0;sync.progress.subscribe('carrot:campaign',()=>notified++)
 sync.progress.register('carrot:campaign',{key:'cgs-carrot-defense-v1',read:readV1,merge:mergeCarrot})
 sync.account.start();await h.settle()
 assert.deepEqual(JSON.parse(h.values.get('cgs-carrot-defense-v1')),carrotA,'the unreadable copy is reverted');assert.equal(notified,0,'the page is not told to re-read an unchanged value')
 assert.equal(h.metaOf('carrot:campaign').dirty,false);assert.equal(h.warnings.length,1);assert.match(h.warnings[0],/newer format/)
 sync.progress.touch('carrot:campaign');await h.tick(DEBOUNCE_MS+MAX_WAIT_MS);await sync.progress.flush();assert.equal(h.puts().length,0,'frozen: the old build never pushes over the newer record')
 await h.tick(10*60_000);sync.account.pullIfStale();await h.settle();assert.equal(h.puts().length,0);assert.equal(h.warnings.length,1,'warned once')
 // the server moves back to a readable copy (or the page was reloaded on a newer build): the record thaws
 h.setResponder(c=>c.path==='/progress'?meOk({'carrot:campaign':{data:carrotB,updated:6_000,version:9}}):c.method==='PUT'?{status:200,body:{stored:true,updated:c.body.updated,version:10}}:{status:404,body:{}})
 await h.tick(10*60_000);sync.account.pullIfStale();await h.settle();await h.tick(DEBOUNCE_MS+1)
 assert.deepEqual(JSON.parse(h.values.get('cgs-carrot-defense-v1')).medals,{1:7,2:7,3:7,5:1},'merged again');assert.equal(h.puts().length,1,'and pushed')
 // a remote the merge rule itself cannot read (no version field, custom read rejects it) is handled the same way, with no local copy
 const h2=harness();h2.values.set(SESSION_KEY,session())
 h2.setResponder(c=>c.path==='/me'?meOk({'carrot:campaign':{data:{version:3,unlocked:1,medals:{},sound:true},updated:5_000,version:7}}):{status:404,body:{}})
 h2.sync.progress.register('carrot:campaign',{key:'cgs-carrot-defense-v1',read:readV1,merge:mergeCarrot});h2.sync.account.start();await h2.settle()
 assert.equal(h2.values.has('cgs-carrot-defense-v1'),false,'nothing unreadable is left in storage');await h2.tick(DEBOUNCE_MS+1);assert.equal(h2.puts().length,0)
}

// MAX WAIT: continuous play (a touch every second) still pushes within 5 s of the first change
{
 const h=harness();h.values.set(SESSION_KEY,session());const {sync}=h
 h.values.set('cgs-forge-run-v1',JSON.stringify(runA))
 h.setResponder(c=>c.path==='/me'?meOk({}):c.method==='PUT'?{status:200,body:{stored:true,updated:c.body.updated,version:1}}:{status:404,body:{}})
 sync.account.start();await h.settle();sync.progress.register('forge:run',{key:'cgs-forge-run-v1',merge:laterWins});await h.tick(DEBOUNCE_MS+1);assert.equal(h.puts().length,1,'first push');await h.tick(PUT_FLOOR_MS)
 const t0=h.now();const putsBefore=h.puts().length
 for(let i=0;i<12;i++){sync.progress.touch('forge:run');await h.tick(1_000);if(h.puts().length>putsBefore)break}
 const first=h.puts()[putsBefore];assert.ok(first,'a PUT happened despite continuous touches');assert.ok(h.now()-t0<=MAX_WAIT_MS+1,'within the max wait (got '+(h.now()-t0)+' ms)')
 // and the trailing edge still works: one touch, 1.5 s later it goes
 await h.tick(PUT_FLOOR_MS+MAX_WAIT_MS);const n=h.puts().length;sync.progress.touch('forge:run');await h.tick(DEBOUNCE_MS-1);assert.equal(h.puts().length,n);await h.tick(2);assert.equal(h.puts().length,n+1)
}

// 413 remembered: no request until the record shrinks; large bodies go out gzipped
{
 const h=harness();h.values.set(SESSION_KEY,session());const {sync}=h
 const big={version:2,seed:1,actions:Array.from({length:3000},(_,i)=>({type:'hit',id:1+i%4})),ticket:null};assert.ok(JSON.stringify(big).length>GZIP_FROM_BYTES)
 h.values.set('cgs-forge-run-v1',JSON.stringify(big))
 h.setResponder(c=>c.path==='/me'?meOk({}):c.method==='PUT'?{status:413,body:{error:'Progress record too large.'}}:{status:404,body:{}})
 sync.account.start();await h.settle();sync.progress.register('forge:run',{key:'cgs-forge-run-v1',merge:laterWins});await h.tick(DEBOUNCE_MS+1)
 assert.equal(h.puts().length,1);assert.equal(h.puts()[0].gzip,true,'a large record is gzipped on the wire');assert.ok(h.puts()[0].wire<JSON.stringify(big).length/5,'and much smaller');assert.deepEqual(h.puts()[0].body.data,big,'the server sees the same JSON')
 assert.equal(h.warnings.length,1)
 for(let i=0;i<5;i++){sync.progress.touch('forge:run');await h.tick(PUT_FLOOR_MS+DEBOUNCE_MS)}
 assert.equal(h.puts().length,1,'the same-size record is not sent again after a 413')
 h.values.set('cgs-forge-run-v1',JSON.stringify({...big,actions:big.actions.slice(0,10)}));h.setResponder(c=>c.method==='PUT'?{status:200,body:{stored:true,updated:c.body.updated,version:1}}:{status:404,body:{}})
 sync.progress.touch('forge:run');await h.tick(PUT_FLOOR_MS+DEBOUNCE_MS);assert.equal(h.puts().length,2,'a smaller record is tried again');assert.equal(h.puts()[1].gzip,false,'a small body stays plain JSON');assert.equal(h.metaOf('forge:run').dirty,false)
 // the small PUTs of the earlier tests were plain
 assert.ok(h.puts().every(c=>c.gzip===(JSON.stringify({data:c.body.data,updated:c.body.updated}).length>=GZIP_FROM_BYTES)))
}

// FEATURE OFF (no API URL): nothing is fetched and no meta is written, even with a leftover session
{
 const h=harness({apiUrl:''});h.values.set(SESSION_KEY,session());const {sync}=h
 h.values.set('cgs-carrot-defense-v1',JSON.stringify(carrotA))
 sync.account.start();sync.progress.register('carrot:campaign',{key:'cgs-carrot-defense-v1',merge:mergeCarrot});sync.progress.touch('carrot:campaign')
 await h.tick(60_000);await sync.progress.flush();sync.account.pullIfStale();await h.settle()
 assert.equal(h.calls.length,0,'no network');assert.equal(h.values.has(META_KEY),false,'no meta file');assert.deepEqual(JSON.parse(h.values.get('cgs-carrot-defense-v1')),carrotA)
}

// the first meta format (a flat map of stamps) is still read
{
 const h=harness({seed:{[META_KEY]:JSON.stringify({'carrot:campaign':{updated:4_000,dirty:true}}),[SESSION_KEY]:session(),'cgs-carrot-defense-v1':JSON.stringify(carrotA)}})
 h.setResponder(c=>c.path==='/me'?meOk({}):c.method==='PUT'?{status:200,body:{stored:true,updated:c.body.updated,version:1}}:{status:404,body:{}})
 h.sync.account.start();await h.settle();h.sync.progress.register('carrot:campaign',{key:'cgs-carrot-defense-v1',merge:mergeCarrot});await h.tick(DEBOUNCE_MS+1)
 assert.equal(h.puts().length,1);assert.equal(h.puts()[0].body.updated,4_000,'the old stamp survives the format change');assert.deepEqual(h.metaFile().keys['carrot:campaign'],{key:'cgs-carrot-defense-v1',private:false})
}

console.log('PASS account sync: merge rules for Carrot, Ink Maze and Forge (junk keys, version bumps); signed-out stamps; login pull/merge/notify/push; debounce, floor, max wait and in-flight touches; stale re-PUT; 401/413/429 handling; backoff; flush with keepalive; late register against a fresh pull; shared-device owner check (replace, merge, private records, sign out and clear); unreadable newer formats frozen; gzip bodies; feature off; old meta format; sign-out, delete, expiry; stale re-pull.')
