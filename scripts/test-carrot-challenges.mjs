import assert from 'node:assert/strict'
import {readChallenges,rawChallenges,awardChallenge,challengeUnlocked,stars,par,mergeCarrotChallenges,bossOfLevel,challengeLevels,formatSeconds} from '../src/minigames/carrot/challenges.ts'
const values=new Map([['cgs-carrot-defense-v1','{"version":1,"unlocked":3,"medals":{},"sound":true}']])
globalThis.localStorage={getItem:key=>values.get(key)||null,setItem:(key,value)=>values.set(key,value)}
const key='cgs-carrot-challenges-v1'
const campaign=(unlocked,medals={})=>({version:1,unlocked,medals,sound:true})
const fresh=readChallenges()
assert.deepEqual(fresh,{version:1,best:{}})
assert.equal(rawChallenges(),null,'no stored record reads as null for sync')
assert.equal(values.has(key),false,'reading never writes')
assert.equal(bossOfLevel(25),'tornado');assert.equal(bossOfLevel(27),'eyeball');assert.equal(bossOfLevel(24),null)
assert.deepEqual(challengeLevels,{tornado:25,zombie:26,eyeball:27})

// Unlock rules: Easy is open from a fresh save; Hard after the Tornado or campaign level 12; Insane after the Zombie or campaign level 24.
assert.equal(challengeUnlocked(25,campaign(1),fresh),true,'the Giant Tornado is open from a fresh save')
assert.equal(challengeUnlocked(26,campaign(1),fresh),false,'the Zombie waits on a fresh save')
assert.equal(challengeUnlocked(27,campaign(1),fresh),false,'the Eyeball waits on a fresh save')
assert.equal(challengeUnlocked(26,campaign(12),fresh),false,'reaching level 12 is not clearing it')
assert.equal(challengeUnlocked(26,campaign(13),fresh),true,'clearing Last Harvest (12) opens the Zombie')
assert.equal(challengeUnlocked(27,campaign(24),fresh),false,'reaching level 24 is not clearing it')
assert.equal(challengeUnlocked(27,campaign(24,{24:1}),fresh),true,'a level-24 medal opens the Eyeball')
assert.equal(challengeUnlocked(27,campaign(24,{24:6}),fresh),false,'only the cleared bit of the level-24 medal counts')
assert.equal(challengeUnlocked(24,campaign(24,{24:7}),fresh),false,'campaign levels are not challenges')

// Awards: only a won fight records; a slower replay keeps the faster time; better health replaces health.
assert.equal(awardChallenge(fresh,'tornado',0,120,4),fresh,'a loss never records')
assert.equal(awardChallenge(fresh,'tornado',11,120,4),fresh,'impossible health never records')
assert.equal(awardChallenge(fresh,'tornado',7,NaN,4),fresh,'a run without a time never records')
assert.equal(awardChallenge(fresh,'dragon',7,120,4),fresh,'unknown guardians never record')
let save=awardChallenge(fresh,'tornado',7,232.44,5)
assert.deepEqual(save,{version:1,best:{tornado:{cleared:true,health:7,seconds:232.4,towers:5}}})
assert.deepEqual(readChallenges(),save,'the record survives a reload');assert.deepEqual(rawChallenges(),save)
assert.equal(challengeUnlocked(26,campaign(1),save),true,'clearing the Tornado opens the Zombie')
assert.equal(challengeUnlocked(27,campaign(1),save),false,'the Tornado alone does not open the Eyeball')
save=awardChallenge(save,'tornado',10,300,9)
assert.deepEqual(save.best.tornado,{cleared:true,health:10,seconds:232.4,towers:5},'a slower replay keeps the faster time and its tower count but takes the better health')
save=awardChallenge(save,'tornado',4,200,3)
assert.deepEqual(save.best.tornado,{cleared:true,health:10,seconds:200,towers:3},'a faster replay replaces time and towers but never lowers health')
save=awardChallenge(save,'zombie',9,355,8)
assert.equal(challengeUnlocked(27,campaign(1),save),true,'clearing the Zombie opens the Eyeball')
assert.equal(values.get('cgs-carrot-defense-v1'),'{"version":1,"unlocked":3,"medals":{},"sound":true}','the campaign save is untouched')

// Stars: 1 cleared, 2 carrot unharmed, 4 under par (240/360/480 s).
assert.deepEqual(par,{tornado:240,zombie:360,eyeball:480})
assert.equal(stars(undefined,'tornado'),0)
assert.equal(stars({cleared:false,health:10,seconds:1,towers:1},'tornado'),0)
assert.equal(stars(save.best.tornado,'tornado'),7,'10 HP under par earns all three')
assert.equal(stars(save.best.zombie,'zombie'),5,'9 HP under par earns cleared and par')
assert.equal(stars({cleared:true,health:10,seconds:481,towers:2},'eyeball'),3,'over par loses the third star')
assert.equal(stars({cleared:true,health:10,seconds:480,towers:2},'eyeball'),7,'par exactly still counts')
assert.equal(formatSeconds(232.4),'3:52');assert.equal(formatSeconds(59.9),'0:59')

// Corrupt, odd and foreign storage.
values.set(key,'{corrupt')
assert.deepEqual(readChallenges(),fresh);assert.equal(rawChallenges(),null)
values.set(key,JSON.stringify({version:1,best:{tornado:{cleared:true,health:12,seconds:10,towers:1},zombie:{cleared:false,health:5,seconds:10,towers:1},eyeball:{cleared:true,health:3.9,seconds:'77.26',towers:-2},dragon:{cleared:true,health:5,seconds:5,towers:1}}}))
assert.deepEqual(readChallenges(),{version:1,best:{eyeball:{cleared:true,health:3,seconds:77.3,towers:0}}},'bad records are dropped and odd values cleaned')
values.set(key,JSON.stringify({version:2,best:{}}))
assert.deepEqual(readChallenges(),fresh,'an unknown version is not trusted');assert.equal(rawChallenges(),null)

// Pure merge for account sync.
const a={version:1,best:{tornado:{cleared:true,health:6,seconds:300,towers:7},zombie:{cleared:true,health:9,seconds:500,towers:12}}}
const b={version:1,best:{tornado:{cleared:true,health:10,seconds:280,towers:4},eyeball:{cleared:true,health:2,seconds:900,towers:14}}}
const merged={version:1,best:{tornado:{cleared:true,health:10,seconds:280,towers:4},zombie:{cleared:true,health:9,seconds:500,towers:12},eyeball:{cleared:true,health:2,seconds:900,towers:14}}}
assert.deepEqual(mergeCarrotChallenges(a,b),merged,'cleared OR, health max, seconds min, towers follow the faster run')
assert.deepEqual(mergeCarrotChallenges(b,a),merged,'mergeCarrotChallenges is symmetric')
assert.deepEqual(mergeCarrotChallenges(null,b),b);assert.deepEqual(mergeCarrotChallenges(a,undefined),a);assert.equal(mergeCarrotChallenges(null,null),null)
assert.deepEqual(mergeCarrotChallenges(a,{version:1}),a,'a side with no records adds nothing')
assert.deepEqual(mergeCarrotChallenges(a,{version:3,best:{}}),{version:3,best:{}},'a higher version wins outright')
assert.deepEqual(mergeCarrotChallenges({garbage:1},b),b,'an unusable side yields the other')

globalThis.localStorage={getItem(){throw new Error('blocked')},setItem(){throw new Error('blocked')}}
assert.deepEqual(readChallenges(),fresh,'blocked storage yields a fresh record');assert.equal(rawChallenges(),null)
assert.equal(awardChallenge(fresh,'eyeball',10,400,6).best.eyeball.health,10,'a win is still awarded in memory without storage')
assert.equal(challengeUnlocked(25,campaign(1),readChallenges()),true)
console.log('Carrot challenges: unlock rules, awards, stars, merge rule, corrupt and blocked storage pass.')
