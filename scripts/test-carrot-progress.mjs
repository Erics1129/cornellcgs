import assert from 'node:assert/strict'
import {readCampaign,awardCampaign} from '../src/minigames/carrot/progress.ts'
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
assert.equal(awardCampaign(campaign,13,10),campaign,'no phantom thirteenth level')
assert.equal(awardCampaign(campaign,2,NaN),campaign)
assert.equal(awardCampaign(campaign,12,10).unlocked,12)
assert.equal(values.get('cgs-forge-v1'),'untouched forge save')
assert.equal(values.get('ink-maze-v1'),'untouched maze save')
values.set(key,'{corrupt')
assert.deepEqual(readCampaign(),initial)
values.set(key,JSON.stringify({version:1,unlocked:2.9,medals:{1:19,2:-2,13:7},sound:false}))
assert.deepEqual(readCampaign(),{version:1,unlocked:2,medals:{1:7,2:0},sound:false})
globalThis.localStorage={getItem(){throw new Error('blocked')},setItem(){throw new Error('blocked')}}
assert.deepEqual(readCampaign(),initial)
assert.equal(awardCampaign(initial,1,10).unlocked,2,'play works without browser storage')
console.log('Carrot progression: replay medals, unlocks, save isolation, corrupt and blocked storage pass.')
