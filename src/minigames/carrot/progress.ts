import type { CampaignSave } from './types'
import { progress } from '../../lib/account/index.ts'
import { mergeCarrot } from '../../lib/account/merges.ts'
const key='cgs-carrot-defense-v1'
// Saves stay version 1: a 12-level save is a valid 24-level save with fewer unlocks.
export const LevelCount=24
/** the account record this key syncs as (see src/lib/account) */
export const RECORD='carrot:campaign'
const fallback=():CampaignSave=>({version:1,unlocked:1,medals:{},sound:true})
/** The stored save, cleaned, or null when nothing usable is stored. */
export function rawCampaign():CampaignSave|null {
 try{const raw=JSON.parse(localStorage.getItem(key)||'null');if(!raw||raw.version!==1)return null;
  const medals:Record<string,number>={};for(const [id,value]of Object.entries(raw.medals||{}))if(/^([1-9]|1[0-9]|2[0-4])$/.test(id)&&typeof value==='number')medals[id]=Math.max(0,Math.min(7,Math.floor(value)))
  return {version:1,unlocked:Math.max(1,Math.min(LevelCount,Math.floor(Number(raw.unlocked)||1))),medals,sound:raw.sound!==false}
 }catch{return null}
}
export function readCampaign():CampaignSave {return rawCampaign()??fallback()}
/**
 * Stores the save, and tells the account module it changed (a no-op while signed out). The stored copy is
 * unioned in first (max unlock, every medal), so a save computed from stale React state can never erase
 * medals a sign-in or another device just wrote to storage. Returns what was stored.
 */
export function saveCampaign(save:CampaignSave):CampaignSave{
 const stored=mergeCarrot(save,rawCampaign())??save
 try{localStorage.setItem(key,JSON.stringify(stored))}catch{/* Play remains available when storage is restricted. */}
 progress.touch(RECORD);return stored
}
export function awardCampaign(save:CampaignSave,level:number,health:number,cleared=false):CampaignSave {
 if(!Number.isInteger(level)||level<1||level>LevelCount||!Number.isFinite(health)||health<=0||health>10)return save
 const medals=1|(health===10?2:0)|(cleared?4:0)
 const next={...save,unlocked:Math.max(save.unlocked,Math.min(LevelCount,level+1)),medals:{...save.medals,[level]:(save.medals[level]||0)|medals}}
 return saveCampaign(next)
}
// Signed in, the campaign follows the account: medals are OR-ed, the furthest unlock wins, sound stays this device's choice.
progress.register(RECORD,{key,read:rawCampaign,write:saveCampaign,merge:mergeCarrot})
