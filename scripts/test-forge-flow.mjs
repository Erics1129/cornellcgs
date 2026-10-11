import assert from 'node:assert/strict'
import { act, createRun, flowNeed, flowDuration, odds, replay } from '../src/minigames/forge/engine.ts'
import { RULES } from '../src/minigames/forge/config.ts'

const seed=74623
const setup=()=>{let s=createRun(seed);for(const a of [{type:'move',id:1,to:'furnace'},{type:'heat',id:1},{type:'move',id:1,to:'anvil'}])s=act(s,a).state;return s}
let s=setup();s.stamina=0;s.knives[0].pips=flowNeed(s)
assert.equal(odds({...s.knives[0],level:20},s).shatter,0,'the odds board predicts the charged next hit')
let result=act(s,{type:'hit',id:1})
assert.equal(result.ok,true,'zero stamina never prevents a v2 strike')
assert.equal(result.event.flowStarted,true)
s=result.state
assert.equal(s.knives[0].flow,4)
assert.equal(s.knives[0].pips,0)
assert.equal(act(s,{type:'hit',id:1}).ok,false,'replay rejects impossible instant strikes')
for(let i=0;i<6;i++){
 s=act(s,{type:'tick',ms:500}).state
 const hit=act(s,{type:'hit',id:1});assert.equal(hit.ok,true);s=hit.state
 assert.notEqual(hit.event.outcome,'shatter','every rapid strike inside the window is protected')
}
assert.equal(s.totalHits,7,'Flow is not capped at the former three hits')
assert.equal(s.knives[0].flow,1)
s=act(s,{type:'tick',ms:1000}).state
assert.equal(s.knives[0].flow,0)
assert.ok(odds({...s.knives[0],level:20},s).shatter>0,'normal risk returns when time expires')
assert.equal(s.stamina,0,'unlimited forging does not consume or require energy')
assert.equal(act(s,{type:'tick',ms:0}).ok,false)
assert.equal(act(s,{type:'tick',ms:Infinity}).ok,false)
assert.equal(act(s,{type:'tick',ms:60001}).ok,false)

s=setup();s.charms=['rhythm','tide'];s.knives[0].pips=8
assert.equal(flowNeed(s),8);assert.equal(flowDuration(s),5)
s=act(s,{type:'flow',id:1}).state
assert.equal(s.knives[0].flow,5)
s=act(s,{type:'hit',id:1}).state
s=act(s,{type:'tick',ms:700}).state
s=act(s,{type:'use',item:'rewind'}).state
assert.equal(s.knives[0].flow,4.3,'Undo cannot rewind the Flow timer')

// A real pre-update replay must retain its knives, RNG, market, gold and day.
const oldActions=[{type:'move',id:1,to:'furnace'},{type:'heat',id:1},{type:'move',id:1,to:'anvil'},{type:'hit',id:1}]
const old=replay(seed,oldActions,1)
const migrated=replay(seed,[...oldActions,{type:'upgrade'}],1)
assert.deepEqual(migrated.knives,old.knives)
assert.equal(migrated.gold,old.gold);assert.equal(migrated.rng,old.rng);assert.equal(migrated.day,old.day)
assert.equal(migrated.version,RULES.version)
assert.equal(migrated.stock.stamina,undefined)
assert.equal(migrated.stock['charm:lungs'],undefined)
assert.equal(act(migrated,{type:'hit',id:1}).ok,true)
assert.deepEqual(replay(seed,[...oldActions,{type:'upgrade'},{type:'tick',ms:357},{type:'hit',id:1}],1),replay(seed,[...oldActions,{type:'upgrade'},{type:'tick',ms:357},{type:'hit',id:1}],1))
console.log('PASS timed Flow: automatic charge, seven rapid protected hits, expiry, unlimited energy, charms, non-rewinding timer, v1 migration and deterministic replay.')
