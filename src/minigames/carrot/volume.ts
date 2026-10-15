/**
 * Volumes for the settings sliders: music, sfx and ui, 0..1 each, stored under `cgs-carrot-audio-v1` (bridge contract v2). The audio
 * stream owns that key through src/minigames/carrot/audioPrefs.ts; when that module is present its functions are used, otherwise this
 * file reads and writes the same key itself, so the sliders work either way. campaign.sound stays the master mute: these only scale
 * under it and never write `sound`.
 */
export type Volumes={music:number;sfx:number;ui:number}
type AudioPrefsModule={getAudioPrefs?:()=>Partial<Volumes>;setAudioPrefs?:(v:Partial<Volumes>)=>unknown;subscribeAudioPrefs?:(l:(v:Volumes)=>void)=>()=>void;
 get?:()=>Partial<Volumes>;set?:(v:Partial<Volumes>)=>unknown;subscribe?:(l:(v:Volumes)=>void)=>()=>void}
const modules=import.meta.glob<AudioPrefsModule>('./audioPrefs.ts',{eager:true})
const owner:AudioPrefsModule|undefined=Object.values(modules)[0]
const key='cgs-carrot-audio-v1'
const defaults:Volumes={music:.8,sfx:.8,ui:.6}
const unit=(v:unknown,d:number)=>{const n=Number(v);return Number.isFinite(n)?Math.max(0,Math.min(1,n)):d}
const clean=(raw:Partial<Volumes>|null|undefined):Volumes=>({music:unit(raw?.music,defaults.music),sfx:unit(raw?.sfx,defaults.sfx),ui:unit(raw?.ui,defaults.ui)})
const listeners=new Set<(v:Volumes)=>void>()
export function readVolumes():Volumes{
 try{const get=owner?.getAudioPrefs||owner?.get;if(get)return clean(get())}catch{/* fall through */}
 try{return clean(JSON.parse(localStorage.getItem(key)||'null'))}catch{return {...defaults}}
}
export function writeVolumes(patch:Partial<Volumes>):Volumes{
 const next=clean({...readVolumes(),...patch})
 const set=owner?.setAudioPrefs||owner?.set
 if(set){try{set(next)}catch{/* keep going */}}
 else{try{localStorage.setItem(key,JSON.stringify(next))}catch{/* this visit only */}}
 for(const l of listeners)l(next)
 return next
}
export function subscribeVolumes(l:(v:Volumes)=>void){
 listeners.add(l);const sub=owner?.subscribeAudioPrefs||owner?.subscribe;let off:(()=>void)|undefined
 if(sub){try{off=sub(v=>l(clean(v)))}catch{/* local listeners still fire */}}
 return()=>{listeners.delete(l);off?.()}
}
/** The audio bus the HUD's beat glow reads (window.carrotAudioBus, published by the audio stream); null-safe before Unity loads. */
export type AudioBus={bpm:number|null;beatPhase:()=>number;level:()=>number}
export function audioBus():AudioBus|null{
 const bus=(window as unknown as {carrotAudioBus?:Partial<AudioBus>}).carrotAudioBus
 if(!bus||typeof bus.beatPhase!=='function'||!bus.bpm)return null
 return bus as AudioBus
}
