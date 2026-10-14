import type { CampaignSave, ChallengeBoss, ChallengeRecord, ChallengeSave } from './types'
import { progress } from '../../lib/account/index.ts'
// Version 3 adds Asuna. Older clients drop unknown bosses, so advancing the format
// activates their existing sync freeze. Versions 1–3 migrate below; future formats
// pass through untouched. Keep this aligned with account/merges.ts.
const newerChallengeVersion=(a:unknown,b:unknown):unknown=>{const v=(r:unknown)=>r&&typeof r==='object'&&Number.isInteger((r as {version?:unknown}).version)?(r as {version:number}).version:0;const va=v(a),vb=v(b);return va<=3&&vb<=3?null:va>=vb?a:b}
// Boss challenge record (record id `carrot:challenges`): best run per guardian. Separate from the campaign save, which stays untouched.
// Keep the legacy key and account record id so existing wins are migrated in place.
const key='cgs-carrot-challenges-v1'
export const challengeBosses:ChallengeBoss[]=['tornado','zombie','eyeball','portal','asuna']
export const challengeLevels:Record<ChallengeBoss,number>={tornado:25,zombie:26,eyeball:27,portal:28,asuna:29}
export const challengeDifficulty:Record<ChallengeBoss,'easy'|'hard'|'insane'|'????'>={tornado:'easy',zombie:'hard',eyeball:'insane',portal:'????',asuna:'insane'}
export const challengeTitles:Record<ChallengeBoss,string>={tornado:'BossFight - Giant Tornado',zombie:'BossFight - Zombie',eyeball:'BossFight - Unknown Eyeball',portal:'BossFight - Portal',asuna:'BossFight - Asuna'}
/** Par times in seconds for the third star. */
export const par:Record<ChallengeBoss,number>={tornado:240,zombie:360,eyeball:480,portal:720,asuna:360}
export const bossOfLevel=(id:number):ChallengeBoss|null=>(Object.keys(challengeLevels) as ChallengeBoss[]).find(b=>challengeLevels[b]===id)||null
const isBoss=(v:unknown):v is ChallengeBoss=>typeof v==='string'&&(challengeBosses as string[]).includes(v)
const cleanRecord=(raw:unknown):ChallengeRecord|null=>{
 if(!raw||typeof raw!=='object')return null
 const r=raw as Partial<ChallengeRecord>;const health=Math.floor(Number(r.health)),seconds=Number(r.seconds),towers=Math.floor(Number(r.towers))
 if(r.cleared!==true||!Number.isInteger(health)||health<1||health>10||!Number.isFinite(seconds)||seconds<0)return null
 return {cleared:true,health,seconds:Math.round(seconds*10)/10,towers:Number.isFinite(towers)&&towers>=0?towers:0}
}
function clean(raw:unknown):ChallengeSave|null {
 if(!raw||typeof raw!=='object')return null
 const version=(raw as {version?:unknown}).version
 if(version!==1&&version!==2&&version!==3)return null
 const best:ChallengeSave['best']={};const source=(raw as ChallengeSave).best
 if(source&&typeof source==='object')for(const [boss,record] of Object.entries(source)){const r=cleanRecord(record);if(isBoss(boss)&&r)best[boss]=r}
 return {version:3,best}
}
const fresh=():ChallengeSave=>({version:3,best:{}})
/** The stored record, or null when storage is blocked, empty or unusable (so a sync never overwrites a server copy with a blank). */
export function rawChallenges():ChallengeSave|null {try{return clean(JSON.parse(localStorage.getItem(key)||'null'))}catch{return null}}
export function readChallenges():ChallengeSave {return rawChallenges()||fresh()}
export function saveChallenges(save:ChallengeSave){try{localStorage.setItem(key,JSON.stringify(save))}catch{/* Play continues without storage. */}progress.touch('carrot:challenges')}
/** Only a won fight records: cleared OR, health max, seconds min, towers from the faster run. A loss (health 0) returns the save unchanged. */
export function awardChallenge(save:ChallengeSave,boss:ChallengeBoss,health:number,seconds:number,towers=0):ChallengeSave {
 if(!isBoss(boss)||!Number.isFinite(health)||health<=0||health>10||!Number.isFinite(seconds)||seconds<0)return save
 const run:ChallengeRecord={cleared:true,health:Math.floor(health),seconds:Math.round(seconds*10)/10,towers:Math.max(0,Math.floor(Number(towers)||0))}
 const previous=save.best[boss]
 const next:ChallengeSave={version:3,best:{...save.best,[boss]:previous?combine(previous,run):run}}
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
/** Asuna is open from the start. Existing gates, including Portal, are unchanged. */
export function challengeUnlocked(id:number,campaign:CampaignSave,challenges:ChallengeSave):boolean {
 const boss=bossOfLevel(id);if(!boss)return false
 if(boss==='tornado'||boss==='asuna')return true
 if(boss==='zombie')return campaign.unlocked>=13||!!challenges.best.tornado?.cleared
 if(boss==='portal')return !!challenges.best.eyeball?.cleared
 return ((campaign.medals['24']||0)&1)===1||!!challenges.best.zombie?.cleared
}
export const lockCaption:Record<ChallengeBoss,string>={tornado:'',asuna:'',zombie:'Clear Last Harvest (12) or the Giant Tornado to unlock',eyeball:'Clear The Last Light (24) or the Zombie to unlock',portal:'Defeat the Unknown Eyeball to open the rift'}
/** Pure merge for account sync: v1/v2 migrate to v3, formats above v3 pass through; per boss cleared OR, health max, seconds min over cleared sides, towers follow the faster run. */
export function mergeCarrotChallenges(a:unknown,b:unknown):ChallengeSave|null {
 const newer=newerChallengeVersion(a,b);if(newer)return newer as ChallengeSave
 const x=clean(a),y=clean(b)
 if(!x)return y;if(!y)return x
 const best:ChallengeSave['best']={}
 for(const boss of challengeBosses){const p=x.best[boss],q=y.best[boss];if(p&&q)best[boss]=combine(p,q);else if(p||q)best[boss]=(p||q) as ChallengeRecord}
 return {version:3,best}
}
export const formatSeconds=(s:number)=>`${Math.floor(s/60)}:${String(Math.floor(s%60)).padStart(2,'0')}`
/** The best run per boss follows a signed-in player: cleared OR, health max, the faster time with its tower count (docs/accounts/HOOKS.md). */
progress.register('carrot:challenges',{key,read:rawChallenges,merge:mergeCarrotChallenges})
