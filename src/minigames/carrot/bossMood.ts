// BOSS MOOD (page): the HUD's share of the boss-level despair. It mirrors the Unity curve (bossMoodCurve.ts) from the 10 Hz snapshot
// and writes, imperatively and at most four times a second, a few attributes and quantised custom properties on the page root:
//   data-boss-mood="<profile>", data-boss-mood-stage="foreboding|held|arrival|advance|release|post|won|lost",
//   --mood-d (De, .02 steps), --mood-panel, --mood-ink, --mood-warm (the release, .05 steps) with --mood-warm-tint, --mood-breath,
//   --mood-gl-tint (the same panel shift as "r g b" channels, for a glass HUD that tints with --gl-tint).
// boss-mood.css turns them into a colder, dimmer chrome, a heavier boss name and a slow boss-bar breath. Nothing here sends a command,
// and the signal tokens (--threat, --leak, --coin, --ally, --super, --accent), the boss warning, menus and results are never touched.
// QA: window.__carrotMood = { d, de, stage, profile, force } (force: a number 0..1 pins D; undefined follows the curve).
import { useEffect, useRef } from 'react'
import type { RefObject } from 'react'
import type { GameDefinitions } from './types'
import type { SnapshotStore } from './hooks/useSnapshot'
import { MoodTracker, checkMoodTable, moodGate, moodTarget } from './bossMoodCurve'
import type { MoodProfile, MoodStage } from './bossMoodCurve'
import './boss-mood.css'

type MoodQa={d:number;de:number;stage:MoodStage|'';profile:string;force?:number}
const TICK_MS=250,SUB_STEP=.05

/** sRGB channels of an oklch() colour mixed in OKLab from a base sRGB colour (for the glass HUD's --gl-tint). */
function oklabOf(r:number,g:number,b:number){const lin=(c:number)=>{c/=255;return c<=.04045?c/12.92:Math.pow((c+.055)/1.055,2.4)};const R=lin(r),G=lin(g),B=lin(b)
 const l=Math.cbrt(.4122214708*R+.5363325363*G+.0514459929*B),m=Math.cbrt(.2119034982*R+.6806995451*G+.1073969566*B),s=Math.cbrt(.0883024619*R+.2817188376*G+.6299787005*B)
 return [.2104542553*l+.793617785*m-.0040720468*s,1.9779984951*l-2.428592205*m+.4505937099*s,.0259040371*l+.7827717662*m-.808675766*s]}
function srgbOf(L:number,a:number,b:number){const l=Math.pow(L+.3963377774*a+.2158037573*b,3),m=Math.pow(L-.1055613458*a-.0638541728*b,3),s=Math.pow(L-.0894841775*a-1.291485548*b,3)
 const R=4.0767416621*l-3.3077115913*m+.2309699292*s,G=-1.2684380046*l+2.6097574011*m-.3413193965*s,B=-.0041960863*l-.7034186147*m+1.707614701*s
 const enc=(c:number)=>{c=Math.max(0,Math.min(1,c));return Math.round(255*(c<=.0031308?12.92*c:1.055*Math.pow(c,1/2.4)-.055))};return `${enc(R)} ${enc(G)} ${enc(B)}`}
function oklchParts(css:string){const m=/oklch\(\s*([\d.]+)\s+([\d.]+)\s+([\d.]+)\s*\)/.exec(css);if(!m)return [0,0,0];const L=+m[1],C=+m[2],h=+m[3]*Math.PI/180;return [L,C*Math.cos(h),C*Math.sin(h)]}
const GLASS_BASE=oklabOf(12,18,32)
function glassTint(p:MoodProfile,de:number){const t=oklchParts(p.panel),k=.35*de;return srgbOf(GLASS_BASE[0]+(t[0]-GLASS_BASE[0])*k,GLASS_BASE[1]+(t[1]-GLASS_BASE[1])*k,GLASS_BASE[2]+(t[2]-GLASS_BASE[2])*k)}

/** BOSS MOOD hook: call once in CarrotPage (store, the .ct-page ref, reduced effects, game-data definitions). */
export function useBossMood(store:SnapshotStore,root:RefObject<HTMLElement|null>,reduced:boolean,definitions:GameDefinitions|null){
 const reducedRef=useRef(reduced);reducedRef.current=reduced
 useEffect(()=>{if(!definitions)return;const warn=checkMoodTable(definitions.levels);if(warn)console.warn(warn)},[definitions])
 useEffect(()=>{
  const tracker=new MoodTracker(),qa:MoodQa={d:0,de:0,stage:'',profile:''},w=window as unknown as {__carrotMood?:MoodQa}
  w.__carrotMood=qa
  let profile:MoodProfile|null=null,d=0,held=0,lastPhase='',run=-1,timer=0,warmAt=-1,lastTick=-1
  const written=new Map<string,string>()
  const write=(key:string,value:string|null)=>{const el=root.current;if(!el)return;if((written.get(key)??null)===value)return
   if(value===null){written.delete(key);if(key.startsWith('--'))el.style.removeProperty(key);else el.removeAttribute(key)}else{written.set(key,value);if(key.startsWith('--'))el.style.setProperty(key,value);else el.setAttribute(key,value)}}
  const clear=()=>{for(const k of [...written.keys()])write(k,null);qa.stage='';qa.profile='';qa.d=qa.de=0}
  const observe=()=>{
   const st=store.get(),next=moodGate(st)
   if(!st||!next){if(profile){profile=null;stop();clear()}return}
   if(store.run()!==run||next!==profile){run=store.run();tracker.reset(st.level);d=moodTarget(tracker.input(st,0));held=0;warmAt=-1;lastTick=-1;lastPhase=st.phase}
   if(!profile||next!==profile){profile=next;start()}
   tracker.observe(st,performance.now())
   // the stage attribute follows each snapshot (a stage changes a few times a level; the colours stay on the 4 Hz tick)
   if(timer)write('data-boss-mood-stage',tracker.stage(st))
   if(st.phase==='lost'&&lastPhase!=='lost')held=d
   lastPhase=st.phase
  }
  const tick=()=>{
   const st=store.get();if(!st||!profile)return
   // two clocks: the tracker's windows (advanced on every snapshot and tick) and this follower's own step, both stopped while paused
   const now=performance.now(),paused=!!st.paused||document.hidden;tracker.time(now,paused)
   const dt=lastTick<0||paused?0:Math.min(1,(now-lastTick)/1000),stage=tracker.stage(st);lastTick=now
   for(let left=dt;left>1e-6;left-=SUB_STEP)d=tracker.step(st,d,held,Math.min(SUB_STEP,left))
   const force=typeof qa.force==='number'&&Number.isFinite(qa.force)?Math.max(0,Math.min(1,qa.force)):null
   const D=force??d,de=D*profile.intensity
   // the release tint: up over 1.2 s from the guardian's fall (or the win), back over 6 s (8 s on the finale); a 1.5 s crossfade
   // with reduced effects. A challenge with waves left gets none: the aftershock is still coming.
   const warmStart=(stage==='release'&&!(profile.challenge&&st.wave<profile.waves))||stage==='won'
   if(warmStart&&warmAt<0)warmAt=now;if(!warmStart&&stage!=='post')warmAt=-1
   const quiet=reducedRef.current,age=warmAt<0?-1:(now-warmAt)/1000,rise=quiet?.75:1.2,fall=quiet?.75:profile.id==='hollowhead-finale'?8:6
   const warm=age<0?0:age<rise?age/rise:Math.max(0,1-(age-rise)/fall)
   qa.d=D;qa.de=de;qa.stage=stage;qa.profile=profile.id
   write('data-boss-mood',profile.id);write('data-boss-mood-stage',stage)
   write('--mood-d',(Math.round(de*50)/50).toFixed(2));write('--mood-warm',(Math.round(warm*20)/20).toFixed(2))
   write('--mood-panel',profile.panel);write('--mood-ink',profile.ink);write('--mood-warm-tint',profile.warm);write('--mood-breath',`${profile.breath}s`)
   write('--mood-gl-tint',glassTint(profile,Math.round(de*50)/50))
  }
  const start=()=>{stop();timer=window.setInterval(tick,TICK_MS);tick()}
  const stop=()=>{if(timer){clearInterval(timer);timer=0}}
  const unsubscribe=store.subscribe(observe);observe()
  return()=>{unsubscribe();stop();clear();if(w.__carrotMood===qa)delete w.__carrotMood}
 },[store,root])
}
