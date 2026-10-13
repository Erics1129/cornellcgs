// Forge or Fold saves: the ten-day rules migration and the account hooks (docs/accounts/HOOKS.md), in plain node.
// storage.ts reads the global localStorage, so a Map-backed fake stands in for it and for the sync engine's storage.
import assert from 'node:assert/strict'
const values=new Map()
globalThis.localStorage={getItem:k=>values.has(k)?values.get(k):null,setItem:(k,v)=>values.set(k,String(v)),removeItem:k=>values.delete(k)}
const {loadSession,saveSession,readSave,fresh}=await import('../src/minigames/forge/storage.ts')
const {act,replay}=await import('../src/minigames/forge/engine.ts')
const {RULES}=await import('../src/minigames/forge/config.ts')
const {MERGES}=await import('../src/lib/account/merges.ts')
const {createSync}=await import('../src/lib/account/sync.ts')
const KEY='cgs-forge-run-v1'
const store=v=>values.set(KEY,JSON.stringify(v)),stored=()=>JSON.parse(values.get(KEY))
const seed=74623,opening=[{type:'move',id:1,to:'furnace'},{type:'heat',id:1},{type:'move',id:1,to:'anvil'},{type:'tick',ms:900},{type:'hit',id:1},{type:'move',id:1,to:'rack'}]

// A run saved by the seven-day build, still in progress on day 3: it continues under ten days.
{
 const actions=[...opening,{type:'end'},{type:'end'}],before=replay(seed,actions,2)
 store({version:2,seed,actions,ticket:{id:'old-ticket',seed}})
 const s=loadSession()
 assert.equal(s.state.version,3);assert.equal(s.state.day,3);assert.equal(s.initialVersion,2)
 assert.deepEqual({...s.state,version:2},before,'knives, gold, market and clock carry over')
 assert.deepEqual(s.actions.at(-1),{type:'upgrade'},'the upgrade is in the log, so replay is exact');assert.equal(s.actions.length,actions.length+1)
 assert.equal(s.ticket,null,'a world ticket belongs to the old rules');assert.match(s.notice,/continues on day 3\. Runs now last 10 days\./)
 assert.ok(saveSession(s));assert.deepEqual(Object.keys(stored()),['version','rules','seed','actions','ticket'])
 assert.equal(stored().version,RULES.version,'written as the current save format, so the account merge compares stamps, not versions');assert.equal(stored().rules,2)
 const again=loadSession();assert.deepEqual(again.state,s.state,'reload replays the same run');assert.equal(again.actions.length,s.actions.length,'no second upgrade');assert.equal(again.notice,undefined)
 let t=again.state;for(let d=3;d<10;d++)t=act(t,{type:'end'}).state;assert.equal(t.ended,false);assert.equal(act(t,{type:'end'}).state.ended,true,'and ends on day 10')
}
// A finished seven-day run stays finished (its score was already taken) with a one-line notice; New run starts ten days.
{
 const actions=[...opening,...Array(7).fill({type:'end'})]
 store({version:2,seed,actions,ticket:null})
 const s=loadSession();assert.equal(s.state.ended,true);assert.equal(s.state.day,7);assert.equal(s.state.version,2);assert.equal(s.actions.length,actions.length)
 assert.equal(s.notice,'This run ended on day 7 under the old rules. New runs last 10 days.')
 saveSession(s);assert.equal(loadSession().state.ended,true)
 assert.equal(fresh().state.version,3)
}
// The original rules (v1, stamina) migrate twice, one upgrade action per version.
{
 store({version:1,seed,actions:[{type:'move',id:1,to:'furnace'},{type:'heat',id:1},{type:'move',id:1,to:'anvil'},{type:'hit',id:1}],ticket:null})
 const s=loadSession();assert.equal(s.state.version,3);assert.equal(s.actions.filter(a=>a.type==='upgrade').length,2);assert.equal(s.initialVersion,1)
 saveSession(s);assert.equal(stored().rules,1);assert.deepEqual(loadSession().state,s.state)
}
// Unknown or broken saves are not readable: the account module freezes them, and the page starts a fresh run.
for(const bad of [{version:4,seed,actions:[],ticket:null},{version:3,rules:4,seed,actions:[],ticket:null},{version:2,rules:3,seed,actions:[],ticket:null},{version:3,seed:'x',actions:[]},{version:3,seed}])
 {store(bad);assert.equal(readSave(),null,JSON.stringify(bad));const s=loadSession();assert.equal(s.actions.length,0);assert.equal(s.state.version,3)}
values.set(KEY,'{nope');assert.equal(readSave(),null)
store({version:3,seed,actions:opening,ticket:null});assert.equal(readSave().version,3)

// The forge:run merge: two current-format saves compete on their stamps (the later run wins), whichever was migrated.
{
 const migrated={version:3,rules:2,seed:1,actions:[1],ticket:null},current={version:3,seed:2,actions:[1,2],ticket:null},merge=MERGES['forge:run']
 assert.equal(merge(migrated,current,{localUpdated:200,remoteUpdated:100}),migrated,'a migrated run played later is kept');assert.equal(merge(migrated,current,{localUpdated:100,remoteUpdated:200}),current)
 assert.equal(merge({version:2,seed:1,actions:[],ticket:null},current,{localUpdated:999,remoteUpdated:1}),current,'a raw seven-day save never overwrites a current one')
}

// The sync engine with this registration: a later run from another device is written and announced, so the page can
// adopt it; a newer format than this build reads is frozen and never pushed.
const harness=progress=>{
 let clock=1_000_000,timers=[],n=0;const calls=[],warnings=[]
 values.set('cgs-account-session-v1',JSON.stringify({token:'cgs1.tok',expires:9e15,name:'Ada',picture:''}))
 const fetch_=async(url,init={})=>{const path=url.replace('https://acct.test',''),call={path,method:init.method||'GET',body:init.body};calls.push(call)
  const r=path==='/me'||path==='/progress'?{status:200,body:{player:{name:'Ada',picture:''},progress}}:init.method==='PUT'?{status:200,body:{stored:true,updated:clock,version:1}}:{status:404,body:{}}
  return new Response(JSON.stringify(r.body),{status:r.status,headers:{'Content-Type':'application/json'}})}
 const sync=createSync({apiUrl:'https://acct.test',storage:globalThis.localStorage,fetch:fetch_,now:()=>clock,setTimeout:(fn,ms)=>{timers.push({id:++n,at:clock+ms,fn});return n},clearTimeout:id=>{timers=timers.filter(t=>t.id!==id)},warn:m=>warnings.push(m)})
 const settle=async()=>{for(let i=0;i<30;i++)await new Promise(r=>setImmediate(r))}
 const tick=async ms=>{const end=clock+ms;for(;;){const due=timers.filter(t=>t.at<=end).sort((a,b)=>a.at-b.at)[0];if(!due)break;clock=due.at;timers=timers.filter(t=>t!==due);due.fn();await settle()}clock=end;await settle()}
 return {sync,calls,warnings,settle,tick,puts:()=>calls.filter(c=>c.method==='PUT')}
}
{
 const local=[...opening],remote=[...opening,{type:'end'},{type:'end'},{type:'end'},{type:'end'}]
 values.clear();store({version:3,seed,actions:local,ticket:null})
 const h=harness({'forge:run':{data:{version:3,seed,actions:remote,ticket:null},updated:1_000_000-60_000,version:7}})
 h.sync.account.start();await h.settle()
 let page=loadSession(),adopted=0
 // ForgePage's subscriber, reduced to its effect on the session it plays from.
 h.sync.progress.subscribe('forge:run',()=>{adopted++;page=loadSession()})
 h.sync.progress.register('forge:run',{key:KEY,read:readSave,merge:MERGES['forge:run']});await h.settle()
 assert.equal(adopted,1,'the page is told');assert.equal(page.state.day,5,'and plays the pulled day-5 run');assert.deepEqual(stored().actions,remote)
 // The page's next save extends the pulled run instead of overwriting it with the stale local one.
 const next=act(page.state,{type:'tick',ms:500}).state;page={...page,state:next,actions:[...page.actions,{type:'tick',ms:500}]};saveSession(page);h.sync.progress.touch('forge:run')
 await h.tick(5_000);const put=h.puts().at(-1);assert.ok(put,'pushed');assert.deepEqual(JSON.parse(put.body).data.actions,[...remote,{type:'tick',ms:500}])
}
{
 values.clear();store({version:3,seed,actions:opening,ticket:null});const before=values.get(KEY)
 const h=harness({'forge:run':{data:{version:4,seed,actions:[],ticket:null,future:true},updated:2_000_000,version:9}})
 h.sync.account.start();await h.settle()
 let adopted=0;h.sync.progress.subscribe('forge:run',()=>adopted++)
 h.sync.progress.register('forge:run',{key:KEY,read:readSave,merge:MERGES['forge:run']});await h.settle()
 assert.equal(values.get(KEY),before,'the local run is untouched');assert.equal(adopted,0);assert.match(h.warnings.join(),/newer format/)
 h.sync.progress.touch('forge:run');await h.tick(10_000);assert.equal(h.puts().length,0,'a frozen record is never pushed over the newer one')
}
console.log('PASS Forge saves: seven-day runs continue under ten days (v1 and v2 logs, exact replay, one-line notice), finished runs stay finished, unreadable saves are frozen, the later run wins across devices, and a pulled run is adopted and extended rather than overwritten.')
