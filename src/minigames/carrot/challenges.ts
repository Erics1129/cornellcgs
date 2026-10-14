import type { CampaignSave, ChallengeBoss, ChallengeRecord, ChallengeSave } from './types'
import { progress } from '../../lib/account/index.ts'
// Same rule as progress.ts (kept local so the node test can import this module without a bundler): a record from a newer client is passed through untouched.
const newerVersion=(a:unknown,b:unknown):unknown=>{const v=(r:unknown)=>r&&typeof r==='object'&&Number.isInteger((r as {version?:unknown}).version)?(r as {version:number}).version:0;const va=v(a),vb=v(b);return va<=1&&vb<=1?null:va>=vb?a:b}
// Boss challenge record (record id `carrot:challenges`): best run per guardian. Separate from the campaign save, which stays untouched.
// This branch has no src/lib/account; the accounts package wires sync by adding, in its registry/merges module:
//   import { mergeCarrotChallenges } from '../minigames/carrot/challenges'
//   register('carrot:challenges', { key: 'cgs-carrot-challenges-v1', merge: mergeCarrotChallenges })
//   register('carrot:super', { key: 'cgs-carrot-super-v1', merge: mergeCarrotSuper })
const key='cgs-carrot-challenges-v1'
export const challengeBosses:ChallengeBoss[]=['tornado','zombie','eyeball']
export const challengeLevels:Record<ChallengeBoss,number>={tornado:25,zombie:26,eyeball:27}
export const challengeDifficulty:Record<ChallengeBoss,'easy'|'hard'|'insane'>={tornado:'easy',zombie:'hard',eyeball:'insane'}
export const challengeTitles:Record<ChallengeBoss,string>={tornado:'BossFight - Giant Tornado',zombie:'BossFight - Zombie',eyeball:'BossFight - Unknown Eyeball'}
/** Par times in seconds for the third star. */
export const par:Record<ChallengeBoss,number>={tornado:240,zombie:360,eyeball:480}
export const bossOfLevel=(id:number):ChallengeBoss|null=>(Object.keys(challengeLevels) as ChallengeBoss[]).find(b=>challengeLevels[b]===id)||null
const isBoss=(v:unknown):v is ChallengeBoss=>typeof v==='string'&&(challengeBosses as string[]).includes(v)
const cleanRecord=(raw:unknown):ChallengeRecord|null=>{
 if(!raw||typeof raw!=='object')return null
 const r=raw as Partial<ChallengeRecord>;const health=Math.floor(Number(r.health)),seconds=Number(r.seconds),towers=Math.floor(Number(r.towers))
 if(r.cleared!==true||!Number.isInteger(health)||health<1||health>10||!Number.isFinite(seconds)||seconds<0)return null
 return {cleared:true,health,seconds:Math.round(seconds*10)/10,towers:Number.isFinite(towers)&&towers>=0?towers:0}
}
function clean(raw:unknown):ChallengeSave|null {
 if(!raw||typeof raw!=='object'||(raw as ChallengeSave).version!==1)return null
 const best:ChallengeSave['best']={};const source=(raw as ChallengeSave).best
 if(source&&typeof source==='object')for(const [boss,record] of Object.entries(source)){const r=cleanRecord(record);if(isBoss(boss)&&r)best[boss]=r}
 return {version:1,best}
}
const fresh=():ChallengeSave=>({version:1,best:{}})
/** The stored record, or null when storage is blocked, empty or unusable (so a sync never overwrites a server copy with a blank). */
export function rawChallenges():ChallengeSave|null {try{return clean(JSON.parse(localStorage.getItem(key)||'null'))}catch{return null}}
export function readChallenges():ChallengeSave {return rawChallenges()||fresh()}
export function saveChallenges(save:ChallengeSave){try{localStorage.setItem(key,JSON.stringify(save))}catch{/* Play continues without storage. */}progress.touch('carrot:challenges')}
/** Only a won fight records: cleared OR, health max, seconds min, towers from the faster run. A loss (health 0) returns the save unchanged. */
export function awardChallenge(save:ChallengeSave,boss:ChallengeBoss,health:number,seconds:number,towers=0):ChallengeSave {
 if(!isBoss(boss)||!Number.isFinite(health)||health<=0||health>10||!Number.isFinite(seconds)||seconds<0)return save
 const run:ChallengeRecord={cleared:true,health:Math.floor(health),seconds:Math.round(seconds*10)/10,towers:Math.max(0,Math.floor(Number(towers)||0))}
 const previous=save.best[boss]
 const next:ChallengeSave={version:1,best:{...save.best,[boss]:previous?combine(previous,run):run}}
 saveChallenges(next);return next
}
function combine(a:ChallengeRecord,b:ChallengeRecord):ChallengeRecord {
 const faster=a.seconds<=b.seconds?a:b
 return {cleared:a.cleared||b.cleared,health:Math.max(a.health,b.health),seconds:faster.seconds,towers:faster.towers}
}
/** Star bits in the campaign medal order: 1 cleared, 2 carrot unharmed, 4 under par. */
export function stars(record:ChallengeRecord|undefined,boss:ChallengeBoss):number {
 if(!record?.cleared)return 0
 return 1|(record.health>=10?2:0)|(record.seconds<=par[boss]?4:0)
}
/** Easy is open from a fresh save; Hard after the Tornado or campaign level 12; Insane after the Zombie or campaign level 24. */
export function challengeUnlocked(id:number,campaign:CampaignSave,challenges:ChallengeSave):boolean {
 const boss=bossOfLevel(id);if(!boss)return false
 if(boss==='tornado')return true
 if(boss==='zombie')return campaign.unlocked>=13||!!challenges.best.tornado?.cleared
 return ((campaign.medals['24']||0)&1)===1||!!challenges.best.zombie?.cleared
}
export const lockCaption:Record<ChallengeBoss,string>={tornado:'',zombie:'Clear Last Harvest (12) or the Giant Tornado to unlock',eyeball:'Clear The Last Light (24) or the Zombie to unlock'}
/** Pure merge for account sync: either side null → the other; a higher version wins; per boss cleared OR, health max, seconds min over cleared sides, towers follow the faster run. */
export function mergeCarrotChallenges(a:ChallengeSave|null|undefined,b:ChallengeSave|null|undefined):ChallengeSave|null {
 const newer=newerVersion(a,b);if(newer)return newer as ChallengeSave
 const x=clean(a),y=clean(b)
 if(!x)return y;if(!y)return x
 const best:ChallengeSave['best']={}
 for(const boss of challengeBosses){const p=x.best[boss],q=y.best[boss];if(p&&q)best[boss]=combine(p,q);else if(p||q)best[boss]=(p||q) as ChallengeRecord}
 return {version:1,best}
}
export const formatSeconds=(s:number)=>`${Math.floor(s/60)}:${String(Math.floor(s%60)).padStart(2,'0')}`
/** The best run per boss follows a signed-in player: cleared OR, health max, the faster time with its tower count (docs/accounts/HOOKS.md). */
progress.register('carrot:challenges',{key,read:rawChallenges,merge:mergeCarrotChallenges})
