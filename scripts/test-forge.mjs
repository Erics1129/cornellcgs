import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { act, createRun, odds, value, replay, expectedValue, flowNeed, bestKnife, runDays } from '../src/minigames/forge/engine.ts'
import { METALS, RULES } from '../src/minigames/forge/config.ts'
const seed = 74623
const setup = () => { let s = createRun(seed,1); for (const a of [{type:'move',id:1,to:'furnace'},{type:'heat',id:1},{type:'move',id:1,to:'anvil'}]) s=act(s,a).state;return s }
for(let l=0;l<=500;l++) {
  const s=setup(), k={...s.knives[0],level:l}
  for(const charms of [[],['steady','ember','shelter','rhythm','patience']]) {
    s.charms=charms
    for(const mode of [{},{guard:true},{flow:3}]) { const p=odds({...k,...mode},s); assert.ok(Math.abs(Object.values(p).reduce((a,b)=>a+b,0)-1)<1e-10);assert.ok(Object.values(p).every(x=>x>=0&&x<=1)) }
  }
}
const s=setup(), k=s.knives[0]
assert.equal(value(k),100); assert.equal(value({...k,level:8}),2563);assert.equal(value({...k,sharpened:true}),115)
assert.equal(expectedValue(k,s),.12*225+.63*150+.25*100)
assert.equal(odds({...k,level:30},s).shatter,.6)
let found=false
for(let n=1;n<200;n++) { let a=setup();a.rng=n;a.knives[0].level=12;const raw=act(a,{type:'hit',id:1}); if(raw.event.outcome!=='shatter')continue
  a.knives[0].guard=true;const b=act(a,{type:'hit',id:1});assert.equal(b.event.outcome,'chip');assert.equal(b.state.knives[0].level,11);assert.equal(b.state.knives[0].guard,false)
  const rew=act(b.state,{type:'use',item:'rewind'}).state;assert.deepEqual(rew.knives.find(k=>k.id===1),a.knives[0]);assert.equal(rew.stamina,a.stamina);assert.notEqual(rew.rng,a.rng);found=true;break }
assert.ok(found,'guard test reaches raw shatter')
let a=setup();a.knives[0].pips=flowNeed(a);a=act(a,{type:'flow',id:1}).state
for(let i=0;i<3;i++){assert.equal(odds(a.knives[0],a).shatter,0);a=act(a,{type:'hit',id:1}).state;assert.ok(a.knives.some(k=>k.id===1))}
assert.equal(a.knives[0].flow,0);assert.equal(a.knives[0].pips,0)
const actions=[{type:'move',id:1,to:'furnace'},{type:'heat',id:1},{type:'move',id:1,to:'anvil'},{type:'hit',id:1},{type:'hit',id:1},{type:'use',item:'rewind'},{type:'hit',id:1}]
assert.deepEqual(replay(seed,actions,1),replay(seed,actions,1));assert.deepEqual(createRun(seed,1),createRun(seed,1))
assert.equal(act(createRun(seed,1),{type:'hit',id:1}).ok,false)
let r=setup();r=act(r,{type:'move',id:1,to:'rack'}).state;r=act(r,{type:'end'}).state;assert.equal(r.knives.length,4);assert.equal(r.stamina,20)
for(let day=2;day<=7;day++)r=act(r,{type:'end'}).state
assert.equal(r.ended,true);assert.equal(r.day,7,'a version 1 run still lasts seven days');assert.equal(bestKnife(r).id,1);assert.equal(act(r,{type:'end'}).ok,false)
// Rules 3: ten days. Day 9 rests like any other day; day 10 ends the run and scores every knife still owned.
{let t=createRun(seed);assert.equal(t.version,3);assert.equal(runDays(t),10);assert.equal(runDays({version:2}),7);t=act(t,{type:'move',id:1,to:'rack'}).state
 for(let day=1;day<10;day++){const e=act(t,{type:'end'});assert.equal(e.ok,true);t=e.state;assert.equal(t.day,day+1);assert.equal(t.ended,false);assert.equal(t.knives.filter(k=>k.place==='crate').length,RULES.dailyBlanks,'fresh blanks every morning')}
 const last=act(t,{type:'end'});assert.equal(last.ok,true);assert.equal(last.state.ended,true);assert.equal(last.state.day,10);assert.equal(last.event.text,'Ten days. One knife. Yours.');assert.equal(last.state.knives.length,t.knives.length,'the last day keeps every knife for the score');assert.equal(act(last.state,{type:'end'}).ok,false)
 assert.equal(replay(seed,[{type:'move',id:1,to:'rack'},...Array(7).fill({type:'end'})],2).ended,true,'a version 2 log still ends on day 7')}
const sold=act(setup(),{type:'sell',id:1}).state;assert.ok(!sold.knives.some(k=>k.id===1));assert.equal(sold.lastHit,null)
assert.throws(()=>replay(seed,[{type:'buy',key:'made-up'}]));assert.equal(act(s,{type:'wait',seconds:-1}).ok,false)
for(const file of ['engine','config'])assert.doesNotMatch(readFileSync(new URL(`../src/minigames/forge/${file}.ts`,import.meta.url),'utf8'),/\b(window|document|localStorage|Math\.random|setTimeout)\b/)
console.log('PASS Forge: 501 levels of normalized odds, value/EV, guard, exact rewind, fresh RNG, Flow, deterministic replay, days, sales, invalid actions.')
