/**
 * Device-only preferences (localStorage `cgs-carrot-prefs-v1`, never synced): the last tower built this session's default, the HUD
 * scale and the "Reduced effects" toggle. Every access is wrapped: a private window or blocked storage just uses the defaults.
 */
export type Prefs={version:1;lastTower:string;hudScale:90|100|115;reducedEffects:boolean}
const key='cgs-carrot-prefs-v1'
const defaults=():Prefs=>({version:1,lastTower:'seed',hudScale:100,reducedEffects:false})
const listeners=new Set<(p:Prefs)=>void>()
let memory:Prefs|null=null
export function readPrefs():Prefs{
 if(memory)return memory
 let p=defaults()
 try{const raw=JSON.parse(localStorage.getItem(key)||'null');if(raw&&typeof raw==='object'&&raw.version===1)p={version:1,lastTower:typeof raw.lastTower==='string'&&/^[a-z]{2,16}$/.test(raw.lastTower)?raw.lastTower:'seed',hudScale:[90,100,115].includes(raw.hudScale)?raw.hudScale:100,reducedEffects:raw.reducedEffects===true}}catch{/* defaults */}
 memory=p;return p
}
export function writePrefs(patch:Partial<Omit<Prefs,'version'>>):Prefs{
 const next={...readPrefs(),...patch,version:1 as const};memory=next
 try{localStorage.setItem(key,JSON.stringify(next))}catch{/* the choice lasts for this visit */}
 for(const l of listeners)l(next)
 return next
}
export function subscribePrefs(l:(p:Prefs)=>void){listeners.add(l);return()=>{listeners.delete(l)}}
