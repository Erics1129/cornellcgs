import type { CampaignSave, SuperSave } from './types'
const key='cgs-carrot-defense-v1'
// Saves stay version 1: a 12-level save is a valid 24-level save with fewer unlocks.
export const LevelCount=24
export function readCampaign():CampaignSave {
 const fallback:CampaignSave={version:1,unlocked:1,medals:{},sound:true}
 try{const raw=JSON.parse(localStorage.getItem(key)||'null');if(!raw||raw.version!==1)return fallback;
  const medals:Record<string,number>={};for(const [id,value]of Object.entries(raw.medals||{}))if(/^([1-9]|1[0-9]|2[0-4])$/.test(id)&&typeof value==='number')medals[id]=Math.max(0,Math.min(7,Math.floor(value)))
  return {version:1,unlocked:Math.max(1,Math.min(LevelCount,Math.floor(Number(raw.unlocked)||1))),medals,sound:raw.sound!==false}
 }catch{return fallback}
}
export function saveCampaign(save:CampaignSave){try{localStorage.setItem(key,JSON.stringify(save))}catch{/* Play remains available when storage is restricted. */}}
export function awardCampaign(save:CampaignSave,level:number,health:number,cleared=false):CampaignSave {
 if(!Number.isInteger(level)||level<1||level>LevelCount||!Number.isFinite(health)||health<=0||health>10)return save
 const medals=1|(health===10?2:0)|(cleared?4:0)
 const next={...save,unlocked:Math.max(save.unlocked,Math.min(LevelCount,level+1)),medals:{...save.medals,[level]:(save.medals[level]||0)|medals}}
 saveCampaign(next);return next
}

// Super record (record id `carrot:super` once the accounts package registers it): whether the merge lesson was shown, how many Supers were forged and which kinds.
const superKey='cgs-carrot-super-v1'
const freshSuper=():SuperSave=>({version:1,taught:false,merges:0,kinds:{}})
const cleanKinds=(raw:unknown)=>{const kinds:Record<string,number>={};if(raw&&typeof raw==='object')for(const [kind,value] of Object.entries(raw as Record<string,unknown>))if(/^[a-z]{2,16}$/.test(kind)&&typeof value==='number'&&Number.isFinite(value)&&value>0)kinds[kind]=Math.floor(value);return kinds}
function cleanSuper(raw:unknown):SuperSave|null {
 if(!raw||typeof raw!=='object'||(raw as SuperSave).version!==1)return null
 const r=raw as Partial<SuperSave>
 return {version:1,taught:r.taught===true,merges:Math.max(0,Math.floor(Number(r.merges)||0)),kinds:cleanKinds(r.kinds)}
}
/** A record from a newer client (version above this code's 1) is passed through untouched rather than merged by rules it may have outgrown. */
export function newerVersion(a:unknown,b:unknown):unknown {
 const v=(r:unknown)=>r&&typeof r==='object'&&Number.isInteger((r as {version?:unknown}).version)?(r as {version:number}).version:0
 const va=v(a),vb=v(b);if(va<=1&&vb<=1)return null
 return va>=vb?a:b
}
export function readSuper():SuperSave {try{return cleanSuper(JSON.parse(localStorage.getItem(superKey)||'null'))||freshSuper()}catch{return freshSuper()}}
export function saveSuper(save:SuperSave){try{localStorage.setItem(superKey,JSON.stringify(save))}catch{/* Storage may be blocked; merging still works. */}}
export function recordSuper(save:SuperSave,kind:string):SuperSave {
 if(!/^[a-z]{2,16}$/.test(kind))return save
 const next:SuperSave={...save,merges:save.merges+1,kinds:{...save.kinds,[kind]:(save.kinds[kind]||0)+1}}
 saveSuper(next);return next
}
export function teachSuper(save:SuperSave):SuperSave {if(save.taught)return save;const next={...save,taught:true};saveSuper(next);return next}
/** Pure merge for account sync: taught OR, merges max, kinds per-key max, a higher version wins outright. */
export function mergeCarrotSuper(a:SuperSave|null|undefined,b:SuperSave|null|undefined):SuperSave|null {
 const newer=newerVersion(a,b);if(newer)return newer as SuperSave
 const x=cleanSuper(a),y=cleanSuper(b)
 if(!x)return y;if(!y)return x
 const kinds:Record<string,number>={...x.kinds};for(const [kind,value] of Object.entries(y.kinds))kinds[kind]=Math.max(kinds[kind]||0,value)
 return {version:1,taught:x.taught||y.taught,merges:Math.max(x.merges,y.merges),kinds}
}
