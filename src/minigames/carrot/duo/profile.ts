// What this player brings to a room (pure apart from the read-only save reads): the boss fights they have unlocked, their endless
// best and their display name. The saves are only ever read here; a duo win is recorded by the page's own award path.
import type { CampaignSave, ChallengeSave } from '../types'
import type { Profile } from '../net/protocol.ts'
import { readCampaign } from '../progress.ts'
import { challengeUnlocked, readChallenges } from '../challenges.ts'
import { DUO_LEVELS, ENDLESS_LEVEL, STORAGE_KEYS, duoLayout, isDuoLevel } from '../net/protocol.ts'
import { bestWaves, cleanName, readEndless } from './endlessRecord.ts'

/** Every boss fight that has a duo version: the six campaign guardians, then the five Challenges. */
export const DUO_FIGHTS=DUO_LEVELS
export const ENDLESS_ID=ENDLESS_LEVEL
export { duoLayout }
export const ENDLESS_NAME='Twin Gates'
export const CHALLENGE_FIRST=25
export type FightInfo={id:number;name:string;guardian:string;kind:'guardian'|'challenge';difficulty?:string;biome:string;layout:'x'|'z'}
/** Names for the list (game-data.json is the source; these are the fallback while it downloads). */
export const FIGHTS:FightInfo[]=[
 {id:4,name:'Hollow Oak',guardian:'Brambleback',kind:'guardian',biome:'garden',layout:'x'},
 {id:8,name:'Moonwell',guardian:'Lantern Regent',kind:'guardian',biome:'marsh',layout:'x'},
 {id:12,name:'Last Harvest',guardian:'Crown of Winter',kind:'guardian',biome:'frost',layout:'x'},
 {id:16,name:'Cider Gate',guardian:'Brambleback',kind:'guardian',biome:'orchard',layout:'x'},
 {id:20,name:'Scarecrow Field',guardian:'Old Hollowhead',kind:'guardian',biome:'orchard',layout:'x'},
 {id:24,name:'The Last Light',guardian:'Old Hollowhead',kind:'guardian',biome:'orchard',layout:'x'},
 {id:25,name:'Giant Tornado',guardian:'Giant Tornado',kind:'challenge',difficulty:'easy',biome:'arena',layout:'x'},
 {id:26,name:'Zombie',guardian:'Zombie',kind:'challenge',difficulty:'hard',biome:'arena',layout:'x'},
 {id:27,name:'Unknown Eyeball',guardian:'Unknown Eyeball',kind:'challenge',difficulty:'insane',biome:'arena',layout:'x'},
 {id:28,name:'Portal',guardian:'Portal',kind:'challenge',difficulty:'????',biome:'portal',layout:'x'},
 {id:29,name:'Asuna',guardian:'Asuna',kind:'challenge',difficulty:'insane',biome:'prism',layout:'z'},
]
export const fightInfo=(id:number):FightInfo|undefined=>FIGHTS.find(f=>f.id===id)
export const isDuoFight=isDuoLevel

/** The fights this save has open, by the single-player rules: a campaign guardian when id <= unlocked, a Challenge by challengeUnlocked(). */
export function unlockedFights(campaign:CampaignSave,challenges:ChallengeSave):number[]{
 return DUO_FIGHTS.filter(id=>id<CHALLENGE_FIRST?id<=campaign.unlocked:challengeUnlocked(id,campaign,challenges))
}
export type FightOffer={id:number;open:boolean;mine:boolean;theirs:boolean;
 /** the seats that have not unlocked it yet (the lobby shows "locked for Mia") */
 lockedFor:number[]}
/**
 * Which fights the host may pick. By default only fights BOTH players have unlocked (Giant Tornado is always open, so a fresh pair can
 * still play); with `union` (the host's toggle "Include fights only one of us has unlocked") any fight either player has. Before the
 * partner's profile arrives (theirs null) only the host's own unlocks count. `lockedFor` lists the seats that lack it.
 */
export function offerFights(mine:number[],theirs:number[]|null,union:boolean,mySeat=0):FightOffer[]{
 const partnerSeat=mySeat===0?1:0
 return DUO_FIGHTS.map(id=>{
  const a=mine.includes(id),b=theirs?theirs.includes(id):a
  const lockedFor=[...(a?[]:[mySeat]),...(b?[]:[partnerSeat])].sort()
  return {id,mine:a,theirs:b,open:union?(a||b):(a&&b),lockedFor}
 })
}

// ---- display name: cgs-carrot-duo-name (24 characters or fewer) ----
export const NAME_KEY=STORAGE_KEYS.name
export function readName():string{try{return cleanName(localStorage.getItem(NAME_KEY)||'')}catch{return ''}}
export function saveName(name:string):string{const clean=cleanName(name);try{if(clean)localStorage.setItem(NAME_KEY,clean);else localStorage.removeItem(NAME_KEY)}catch{/* storage blocked: the name lives for this visit */}return clean}
/** The name shown for a seat: what they chose, or "Player 1" / "Player 2". */
export const displayName=(name:string|undefined|null,seat:number)=>cleanName(name||'')||`Player ${seat+1}`

/** The profile sent to the room: name, unlocked boss fights, endless best (waves). */
export function readProfile(name=readName()):Profile{
 return {name:cleanName(name),unlocked:unlockedFights(readCampaign(),readChallenges()),best:bestWaves(readEndless())}
}
