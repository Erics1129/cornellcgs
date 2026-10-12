import type { CampaignSave } from './types'
const key='cgs-carrot-defense-v1'
export function readCampaign():CampaignSave {
 const fallback:CampaignSave={version:1,unlocked:1,medals:{},sound:true}
 try{const raw=JSON.parse(localStorage.getItem(key)||'null');if(!raw||raw.version!==1)return fallback;
  const medals:Record<string,number>={};for(const [id,value]of Object.entries(raw.medals||{}))if(/^([1-9]|1[0-2])$/.test(id)&&typeof value==='number')medals[id]=Math.max(0,Math.min(7,Math.floor(value)))
  return {version:1,unlocked:Math.max(1,Math.min(12,Math.floor(Number(raw.unlocked)||1))),medals,sound:raw.sound!==false}
 }catch{return fallback}
}
export function saveCampaign(save:CampaignSave){try{localStorage.setItem(key,JSON.stringify(save))}catch{/* Play remains available when storage is restricted. */}}
export function awardCampaign(save:CampaignSave,level:number,health:number,cleared=false):CampaignSave {
 if(!Number.isInteger(level)||level<1||level>12||!Number.isFinite(health)||health<=0||health>10)return save
 const medals=1|(health===10?2:0)|(cleared?4:0)
 const next={...save,unlocked:Math.max(save.unlocked,Math.min(12,level+1)),medals:{...save.medals,[level]:(save.medals[level]||0)|medals}}
 saveCampaign(next);return next
}
