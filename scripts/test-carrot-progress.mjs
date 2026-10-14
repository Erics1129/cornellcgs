import assert from 'node:assert/strict'
import {readCampaign,awardCampaign,readSuper,recordSuper,teachSuper,mergeCarrotSuper,readRecords,rawRecords,awardRecord,markSeen,finishTutorial,mergeCarrotRecords,gradeRun,gradeLetters} from '../src/minigames/carrot/progress.ts'
import {mergeCarrotRecords as accountMergeRecords,MERGES,KNOWN_KEYS} from '../src/lib/account/merges.ts'
import {run as saveCases} from './fixtures/carrot-saves-cases.mjs'
import {readFileSync} from 'node:fs'
const values=new Map([['cgs-forge-v1','untouched forge save'],['ink-maze-v1','untouched maze save']])
globalThis.localStorage={getItem:key=>values.get(key)||null,setItem:(key,value)=>values.set(key,value)}
const key='cgs-carrot-defense-v1'
const initial=readCampaign()
assert.equal(initial.unlocked,1)
let campaign=awardCampaign(initial,1,7)
assert.equal(campaign.unlocked,2)
assert.equal(campaign.medals[1],1)
campaign=awardCampaign(campaign,1,10,true)
assert.equal(campaign.medals[1],7,'a better replay earns the remaining medals')
campaign=awardCampaign(campaign,1,2,false)
assert.equal(campaign.medals[1],7,'a weaker replay never erases previous medals')
assert.deepEqual(readCampaign(),campaign,'progress survives a reload')
assert.equal(awardCampaign(campaign,2,0),campaign,'a loss cannot award progress')
assert.equal(awardCampaign(campaign,25,10),campaign,'no phantom twenty-fifth level')
assert.equal(awardCampaign(campaign,2,NaN),campaign)
assert.equal(awardCampaign(campaign,12,10).unlocked,13,'winning level 12 unlocks the harvest road')
// saveCampaign unions with what is stored, so the stored unlock is now 13 and a level-13 win moves it to 14
assert.equal(awardCampaign(campaign,13,10).unlocked,14,'the harvest road continues past level 12')
assert.equal(awardCampaign(campaign,24,10).unlocked,24,'the finale caps the unlock at 24')
assert.equal(awardCampaign(campaign,23,10).medals[23],3,'a flawless win on a new level earns its medals')
assert.equal(values.get('cgs-forge-v1'),'untouched forge save')
assert.equal(values.get('ink-maze-v1'),'untouched maze save')
values.set(key,'{corrupt')
assert.deepEqual(readCampaign(),initial)
values.set(key,JSON.stringify({version:1,unlocked:2.9,medals:{1:19,2:-2,13:7,25:7},sound:false}))
assert.deepEqual(readCampaign(),{version:1,unlocked:2,medals:{1:7,2:0,13:7},sound:false})
values.set(key,JSON.stringify({version:1,unlocked:12,medals:{},sound:true}))
assert.equal(readCampaign().unlocked,12,'an older twelve-level save loads unchanged')
assert.equal(awardCampaign(readCampaign(),12,8).unlocked,13,'winning level 12 from an older save opens exactly level 13')

// Super record: cgs-carrot-super-v1, separate from the campaign save.
const superKey='cgs-carrot-super-v1'
const freshSuper=readSuper()
assert.deepEqual(freshSuper,{version:1,taught:false,merges:0,kinds:{}},'a fresh Super record has nothing taught and no merges')
assert.equal(values.has(superKey),false,'reading never writes')
let sup=recordSuper(freshSuper,'seed')
sup=recordSuper(sup,'seed')
sup=recordSuper(sup,'frost')
assert.deepEqual(sup,{version:1,taught:false,merges:3,kinds:{seed:2,frost:1}},'recordSuper counts merges and per-kind forges')
assert.deepEqual(readSuper(),sup,'the Super record survives a reload')
assert.equal(recordSuper(sup,'Not a kind'),sup,'an invalid kind is ignored')
sup=teachSuper(sup)
assert.equal(sup.taught,true)
assert.equal(teachSuper(sup),sup,'teaching twice returns the same record')
assert.equal(readSuper().taught,true,'taught is persisted so the toast fires once per device')
assert.equal(values.get(key),JSON.stringify(readCampaign()),'the campaign save is untouched by Super writes')
values.set(superKey,'{corrupt')
assert.deepEqual(readSuper(),freshSuper,'corrupt Super JSON falls back to a fresh record')
values.set(superKey,JSON.stringify({version:1,taught:'yes',merges:-4,kinds:{seed:2.7,'bad key':3,frost:'x'}}))
assert.deepEqual(readSuper(),{version:1,taught:false,merges:0,kinds:{seed:2}},'odd values are cleaned')
values.set(superKey,JSON.stringify({version:2,taught:true,merges:9,kinds:{}}))
assert.deepEqual(readSuper(),freshSuper,'an unknown version is not trusted')
// Pure merge for account sync.
const a={version:1,taught:true,merges:2,kinds:{seed:2}},b={version:1,taught:false,merges:5,kinds:{seed:1,storm:3}}
const merged={version:1,taught:true,merges:5,kinds:{seed:2,storm:3}}
assert.deepEqual(mergeCarrotSuper(a,b),merged,'taught OR, merges max, kinds per-key max')
assert.deepEqual(mergeCarrotSuper(b,a),merged,'mergeCarrotSuper is symmetric')
assert.deepEqual(mergeCarrotSuper(null,b),b);assert.deepEqual(mergeCarrotSuper(a,undefined),a);assert.equal(mergeCarrotSuper(null,null),null)
assert.deepEqual(mergeCarrotSuper(a,{version:3,taught:false,merges:0,kinds:{}}),{version:3,taught:false,merges:0,kinds:{}},'a higher version wins outright')
assert.deepEqual(mergeCarrotSuper(a,{corrupt:true}),a,'an unusable side yields the other')
globalThis.localStorage={getItem(){throw new Error('blocked')},setItem(){throw new Error('blocked')}}
assert.deepEqual(readCampaign(),initial)
assert.equal(awardCampaign(initial,1,10).unlocked,2,'play works without browser storage')
assert.deepEqual(readSuper(),freshSuper,'blocked storage yields a fresh Super record')
assert.equal(recordSuper(freshSuper,'book').merges,1,'merging works without browser storage')
console.log('Carrot progression: replay medals, unlocks, Super record, save isolation, corrupt and blocked storage pass.')

// ---- Records (cgs-carrot-records-v1): grades, chains, fastest wins, first encounters, tutorial ----
{
 const store=new Map([['cgs-carrot-defense-v1','{"version":1,"unlocked":5,"medals":{"1":7},"sound":true}']])
 globalThis.localStorage={getItem:k=>store.has(k)?store.get(k):null,setItem:(k,v)=>store.set(k,String(v))}
 const rkey='cgs-carrot-records-v1'
 assert.deepEqual(readRecords(),{version:1,levels:{},seen:{abilities:[],creatures:[]},tutorial:false},'a fresh records save is empty')
 assert.equal(rawRecords(),null,'nothing stored reads as null for sync');assert.equal(store.has(rkey),false,'reading never writes')
 assert.deepEqual(readCampaign(),{version:1,unlocked:5,medals:{1:7},sound:true},'a v1-only campaign save loads unchanged next to the new record')
 // grades: S needs every medal (and par when known); A >=8 hearts; B >=5; C won; D a loss past half way
 assert.equal(gradeRun({won:true,health:10,progress:1,scenery:true}),5)
 assert.equal(gradeRun({won:true,health:10,progress:1,scenery:false}),4,'scenery left standing caps the grade at A')
 assert.equal(gradeRun({won:true,health:10,progress:1,scenery:true,seconds:300,par:280}),4,'over par is not an S')
 assert.equal(gradeRun({won:true,health:10,progress:1,challenge:true,seconds:200,par:240}),5,'a flawless challenge under par is an S')
 assert.equal(gradeRun({won:true,health:8,progress:1}),4);assert.equal(gradeRun({won:true,health:5,progress:1}),3);assert.equal(gradeRun({won:true,health:1,progress:1}),2)
 assert.equal(gradeRun({won:false,health:0,progress:.62}),1);assert.equal(gradeRun({won:false,health:0,progress:.3}),0)
 assert.deepEqual(gradeLetters,['','D','C','B','A','S'])
 let r=awardRecord(readRecords(),3,{grade:3,streak:4,seconds:301.27,won:true})
 assert.deepEqual(r.levels['3'],{grade:3,bestStreak:4,bestSeconds:301.3,vgrade:0})
 r=awardRecord(r,3,{grade:2,streak:6,seconds:250,won:true})
 assert.deepEqual(r.levels['3'],{grade:3,bestStreak:6,bestSeconds:250,vgrade:0},'a weaker replay keeps the grade, a longer chain and a faster time still count')
 r=awardRecord(r,3,{grade:1,streak:1,seconds:100,won:false})
 assert.equal(r.levels['3'].bestSeconds,250,'a loss never records a time')
 r=awardRecord(r,29,{grade:4,streak:2,seconds:340,won:true});assert.equal(r.levels['29'].grade,4,'challenge levels keep records too')
 r=awardRecord(r,8,{grade:3,won:true,seconds:500,veteran:true});assert.deepEqual(r.levels['8'],{grade:0,bestStreak:0,bestSeconds:0,vgrade:3},'Veteran fills vgrade only')
 assert.equal(awardRecord(r,30,{grade:5}),r,'no phantom level 30');assert.equal(awardRecord(r,0,{grade:5}),r)
 assert.equal(awardRecord(r,4,{grade:0,streak:0}),r,'an empty run stores nothing')
 r=markSeen(r,{abilities:['uproot','blind'],creatures:['moth']})
 assert.deepEqual(r.seen,{abilities:['blind','uproot'],creatures:['moth']},'seen ids are sorted')
 assert.equal(markSeen(r,{abilities:['uproot']}),r,'seeing twice changes nothing')
 r=finishTutorial(r);assert.equal(r.tutorial,true);assert.equal(finishTutorial(r),r)
 assert.deepEqual(readRecords(),r,'records survive a reload')
 assert.equal(store.get('cgs-carrot-defense-v1'),'{"version":1,"unlocked":5,"medals":{"1":7},"sound":true}','the campaign save is untouched by records')
 // stale React copies never lower what is stored
 const stale={version:1,levels:{3:{grade:1,bestStreak:0,bestSeconds:900,vgrade:0}},seen:{abilities:[],creatures:[]},tutorial:false}
 assert.equal(awardRecord(stale,5,{grade:2,won:true,seconds:400}).levels['3'].grade,3,'the stored grade wins over a stale copy')
 // cleaning
 store.set(rkey,'{corrupt');assert.deepEqual(readRecords(),{version:1,levels:{},seen:{abilities:[],creatures:[]},tutorial:false});assert.equal(rawRecords(),null)
 store.set(rkey,JSON.stringify({version:1,levels:{1:{grade:9,bestStreak:-3,bestSeconds:'61.26',vgrade:2.8},30:{grade:5},x:{grade:1},2:{grade:0},__proto__:{grade:5}},seen:{abilities:['uproot','bad id!',7,'uproot'],creatures:'moth'},tutorial:'yes'}))
 assert.deepEqual(readRecords(),{version:1,levels:{1:{grade:5,bestStreak:0,bestSeconds:61.3,vgrade:2}},seen:{abilities:['uproot'],creatures:[]},tutorial:false},'odd values are cleaned, junk levels dropped')
 store.set(rkey,JSON.stringify({version:2,levels:{}}));assert.equal(rawRecords(),null,'the reader rejects a newer format so sync freezes')
 // merge rules
 const A={version:1,levels:{1:{grade:4,bestStreak:3,bestSeconds:200,vgrade:0},5:{grade:2,bestStreak:1,bestSeconds:0,vgrade:1}},seen:{abilities:['uproot'],creatures:['moth']},tutorial:true}
 const B={version:1,levels:{1:{grade:5,bestStreak:2,bestSeconds:240,vgrade:3},7:{grade:3,bestStreak:5,bestSeconds:410,vgrade:0}},seen:{abilities:['blind','uproot'],creatures:[]},tutorial:false}
 const AB={version:1,levels:{1:{grade:5,bestStreak:3,bestSeconds:200,vgrade:3},5:{grade:2,bestStreak:1,bestSeconds:0,vgrade:1},7:{grade:3,bestStreak:5,bestSeconds:410,vgrade:0}},seen:{abilities:['blind','uproot'],creatures:['moth']},tutorial:true}
 assert.deepEqual(mergeCarrotRecords(A,B),AB,'grade/chain/vgrade max, fastest positive time, sorted seen union, tutorial OR')
 assert.deepEqual(mergeCarrotRecords(B,A),AB)
 assert.equal(mergeCarrotRecords(null,null),null);assert.deepEqual(mergeCarrotRecords(null,B),B);assert.deepEqual(mergeCarrotRecords({garbage:1},A),A)
 for(const future of [{version:2,levels:{1:{grade:'S+'}},seasons:[1]},{version:99,custom:true}]){assert.equal(mergeCarrotRecords(A,future),future,'a future format passes through untouched');assert.equal(mergeCarrotRecords(future,A),future)}
 // properties over random pairs: commutative, associative, idempotent (and the account copy is the same function)
 let seed=7;const rand=()=>(seed=(seed*1103515245+12345)&0x7fffffff)/0x7fffffff
 const pick=a=>a[Math.floor(rand()*a.length)],ids=['uproot','blind','tithe','gust','rally','moth','bat','wisp','prismDash','gaze','Bad id','x']
 const randomRecord=()=>{const levels={};for(let i=0;i<6;i++)levels[1+Math.floor(rand()*31)]={grade:Math.floor(rand()*7),bestStreak:Math.floor(rand()*20),bestSeconds:rand()<.3?0:Math.round(rand()*9000)/10,vgrade:Math.floor(rand()*6)};return {version:1,levels,seen:{abilities:Array.from({length:Math.floor(rand()*5)},()=>pick(ids)),creatures:Array.from({length:Math.floor(rand()*5)},()=>pick(ids))},tutorial:rand()<.5}}
 for(let i=0;i<200;i++){
  const a=randomRecord(),b=randomRecord(),c=randomRecord()
  const ab=mergeCarrotRecords(a,b)
  assert.deepEqual(ab,mergeCarrotRecords(b,a),'commutative');assert.deepEqual(mergeCarrotRecords(ab,c),mergeCarrotRecords(a,mergeCarrotRecords(b,c)),'associative')
  assert.deepEqual(mergeCarrotRecords(ab,ab),ab,'idempotent');assert.deepEqual(accountMergeRecords(a,b,{localUpdated:0,remoteUpdated:0}),ab,'merges.ts runs the same rule')
 }
 // the seen lists cap at 128 each, and a full 29-level record stays small
 const many=Array.from({length:300},(_,i)=>'ability'+String(i).padStart(3,'0'))
 const capped=mergeCarrotRecords({version:1,levels:{},seen:{abilities:many.slice(0,200),creatures:[]},tutorial:false},{version:1,levels:{},seen:{abilities:many.slice(100),creatures:[]},tutorial:false})
 assert.equal(capped.seen.abilities.length,128);assert.deepEqual(capped.seen.abilities,many.slice(0,128))
 const full={version:1,levels:Object.fromEntries(Array.from({length:29},(_,i)=>[i+1,{grade:5,bestStreak:9999,bestSeconds:86399.9,vgrade:5}])),seen:{abilities:many.slice(0,128).map(s=>s.padEnd(32,'x').slice(0,32)),creatures:many.slice(128,256).map(s=>'c'+s.slice(0,31))},tutorial:true}
 const bytes=JSON.stringify(mergeCarrotRecords(full,full)).length
 assert.ok(bytes<=8192+1024*5,'sanity');assert.ok(JSON.stringify({version:1,levels:full.levels,seen:{abilities:[],creatures:[]},tutorial:true}).length<=8192,'29 levels fit in 8 KB')
 const typical={version:1,levels:full.levels,seen:{abilities:many.slice(0,48).map(s=>s.slice(0,14)),creatures:many.slice(0,27).map(s=>s.slice(0,12))},tutorial:true}
 assert.ok(JSON.stringify(mergeCarrotRecords(typical,typical)).length<=8192,'a full 29-level record with every real ability and creature is at most 8 KB')
 assert.equal(KNOWN_KEYS['carrot:records'].key,rkey);assert.equal(typeof MERGES['carrot:records'],'function')
 // the records block in merges.ts is a verbatim copy of the page's
 const block=f=>{const t=readFileSync(new URL(f,import.meta.url),'utf8');return t.slice(t.indexOf('// >>> carrot records'),t.indexOf('// <<< carrot records'))}
 assert.equal(block('../src/lib/account/merges.ts'),block('../src/minigames/carrot/progress.ts'),'merges.ts carries the same records block as progress.ts')
 // blocked storage
 globalThis.localStorage={getItem(){throw new Error('blocked')},setItem(){throw new Error('blocked')}}
 assert.deepEqual(readRecords().levels,{});assert.equal(awardRecord(readRecords(),1,{grade:4,won:true,seconds:90}).levels['1'].grade,4,'records work in memory without storage')
}
// ---- The campaign v1, Super v1 and challenge v3 code paths are byte-identical to the pre-update code (48d1336) ----
{
 const golden=JSON.parse(readFileSync(new URL('./fixtures/carrot-saves-golden.json',import.meta.url),'utf8'))
 const now=await saveCases(new URL('../src',import.meta.url).pathname)
 assert.equal(now.length,golden.length)
 for(let i=0;i<golden.length;i++)assert.deepEqual(now[i],golden[i],`${golden[i][0]} ${golden[i][1]} is byte-identical to 48d1336`)
}
console.log('Carrot records: grades, chains, fastest wins, seen/tutorial, cleaning, future formats, 200-pair merge laws, 8 KB budget; legacy save paths byte-identical.')
