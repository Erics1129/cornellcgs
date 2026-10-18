// BOSS MOOD (page): the despair curve D, mirrored from unity/CarrotDefense/Assets/Scripts/CarrotBossMoodCurve.cs (the frozen
// contract; same table, same Target/TargetLight/Step/Fear, same fixture A-X to 1e-4). Pure: no DOM, no React, so plain node tests it
// (scripts/carrot-ui-qa/boss-mood.mjs). Presentation only: the page reads the snapshot, it never sends a command for the mood.
import type { GameState } from './types'

/** Per boss level: the contract's table (profile, boss wave, waves, intensity) plus the HUD's own colours. panel/ink are what the
 * HUD chrome mixes toward (panels 35% x De, ink 30% x De); warm is the release tint; breath the boss-bar breathing period in seconds. */
export type MoodProfile = { level:number; id:string; bossWave:number; waves:number; challenge:boolean; intensity:number; panel:string; ink:string; warm:string; breath:number }
export const MOOD_PROFILES:readonly MoodProfile[]=[
 { level:4, id:'brambleback', bossWave:8, waves:8, challenge:false, intensity:.75, panel:'oklch(0.20 0.03 150)', ink:'oklch(0.92 0.02 120)', warm:'oklch(0.27 0.05 95)', breath:4 },
 { level:8, id:'lantern', bossWave:10, waves:10, challenge:false, intensity:.85, panel:'oklch(0.19 0.035 195)', ink:'oklch(0.92 0.02 180)', warm:'oklch(0.27 0.05 85)', breath:4 },
 { level:12, id:'winter', bossWave:12, waves:12, challenge:false, intensity:.9, panel:'oklch(0.26 0.02 245)', ink:'oklch(0.96 0.01 240)', warm:'oklch(0.28 0.045 70)', breath:4 },
 { level:16, id:'brambleback-autumn', bossWave:12, waves:12, challenge:false, intensity:.85, panel:'oklch(0.20 0.03 95)', ink:'oklch(0.92 0.02 85)', warm:'oklch(0.27 0.05 75)', breath:4 },
 { level:20, id:'hollowhead', bossWave:14, waves:14, challenge:false, intensity:.9, panel:'oklch(0.19 0.04 330)', ink:'oklch(0.92 0.02 40)', warm:'oklch(0.27 0.05 80)', breath:4 },
 { level:24, id:'hollowhead-finale', bossWave:16, waves:16, challenge:false, intensity:1, panel:'oklch(0.17 0.045 335)', ink:'oklch(0.91 0.025 40)', warm:'oklch(0.26 0.05 80)', breath:4 },
 { level:25, id:'tornado', bossWave:4, waves:6, challenge:true, intensity:.9, panel:'oklch(0.21 0.02 250)', ink:'oklch(0.93 0.01 245)', warm:'oklch(0.26 0.04 80)', breath:4 },
 { level:26, id:'zombie', bossWave:6, waves:9, challenge:true, intensity:.95, panel:'oklch(0.19 0.035 150)', ink:'oklch(0.92 0.02 140)', warm:'oklch(0.26 0.04 85)', breath:4 },
 { level:27, id:'eyeball', bossWave:7, waves:11, challenge:true, intensity:1, panel:'oklch(0.16 0.04 300)', ink:'oklch(0.92 0.02 300)', warm:'oklch(0.26 0.045 75)', breath:10 },
 { level:28, id:'portal', bossWave:4, waves:12, challenge:true, intensity:.8, panel:'oklch(0.16 0.04 265)', ink:'oklch(0.93 0.015 260)', warm:'oklch(0.26 0.04 80)', breath:4 },
 { level:29, id:'asuna', bossWave:1, waves:1, challenge:true, intensity:.9, panel:'oklch(0.24 0.03 290)', ink:'oklch(0.94 0.015 290)', warm:'oklch(0.28 0.045 75)', breath:4 },
]
export const moodProfile=(level:number)=>MOOD_PROFILES.find(p=>p.level===level)||null
export const challengeLevel=(level:number)=>level>=25&&level<=29
const clamp01=(x:number)=>x<0?0:x>1?1:x

/** One frame of read-only state. boss: 0 none, 1 alive, 2 hidden, 3 dead, 4 leaked. Ages in game seconds (1e9 = never). */
export type MoodInput={ level:number; wave:number; waves:number; hearts:number; boss:0|1|2|3|4; phase:string; nextWave:number; route:number; reliefAge:number; dawnAge:number; held:number; rebirths:number; minis:number; deathWave:number }
export const moodInput=(level:number,over:Partial<MoodInput>={}):MoodInput=>({ level, wave:0, waves:moodProfile(level)?.waves||0, hearts:10, boss:0, phase:'ready', nextWave:0, route:0, reliefAge:1e9, dawnAge:1e9, held:0, rebirths:0, minis:0, deathWave:0, ...over })

/** Despair a wave before the guardian: De reaches at least .30 there (D = max(.30, .30/I), capped at .45). */
export function moodTop(level:number){const p=moodProfile(level);const I=p?p.intensity:0;return I<=0?.30:Math.min(.45,Math.max(.30,.30/I))}
const S=(x:number)=>{const t=clamp01((x-.10)/.80);return t*t*(3-2*t)}
/** Target D (colour, world, sound; the HUD follows it). light=true: the light channel (no false dawn, flat .15 after a challenge guardian). */
export function moodTarget(i:MoodInput,light=false):number{
 const p=moodProfile(i.level);if(!p)return 0;const challenge=challengeLevel(i.level),bw=p.bossWave
 if(i.phase==='lost')return clamp01(i.held)
 if(i.phase==='won')return 0
 if(i.boss===3){if(!challenge)return 0;if(light)return .15;const dw=i.deathWave>0?i.deathWave:bw;return Math.min(.45,.15+.25*clamp01((i.wave-dw)/Math.max(1,i.waves-dw))+.04*i.minis)}
 if(i.boss===4)return .45
 if(i.boss===1||i.boss===2){
  let t=.55+.30*S(i.route)+.05*i.rebirths
  if(challenge){if(i.route>=.5)t+=.03;if(i.route>=.75)t+=.03;if(i.route>=.9)t+=.03}
  if(!light&&i.dawnAge<2.2)t-=.20;else if(!light&&i.dawnAge<3.0)t=Math.max(t,.9)
  return clamp01(t)
 }
 const top=moodTop(i.level)
 if(bw>=2&&i.wave===bw-1&&i.nextWave>0)return clamp01(top+.05)
 if(bw<=1)return .20
 return clamp01(.08+(top-.08)*clamp01((Math.max(i.wave,1)-1)/Math.max(1,bw-2)))
}
/** Exponential follower (tau .8 s rising in the entrance window, 2.5 s rising, 1.5 s falling); outside the entrance and release
 * windows at most .11 per second. dt in real seconds (the caller sub-steps at .05 s or less; 0 while paused). */
export function moodStep(d:number,target:number,dt:number,entrance:boolean,release:boolean):number{
 const tau=target>d?(entrance?.8:2.5):1.5;let n=d+(target-d)*(1-Math.exp(-dt/tau))
 if(!entrance&&!release){const m=.11*dt;n=Math.max(d-m,Math.min(d+m,n))}
 return n
}
/** Health-tied fear (sound privation and the carrot only; the HUD never darkens because the player is losing). */
export const moodFear=(hearts:number)=>.08*clamp01(1-hearts/10)

/** The table against the published wave plans: '' when every boss wave and wave count matches, else a CARROT_MOOD_WARN text. */
export function checkMoodTable(levels:Array<{id:number;waves:number;boss?:string;wavePlan?:Array<Array<{kind:string;boss?:boolean}>>}>):string{
 const bad:string[]=[]
 for(const p of MOOD_PROFILES){const l=levels.find(x=>x.id===p.level);if(!l){bad.push(`L${p.level} missing`);continue}
  const bw=l.wavePlan?l.wavePlan.findIndex(w=>w.some(k=>k.boss||k.kind==='boss'))+1:-1
  if(!l.boss||l.waves!==p.waves||(bw>=0&&bw!==p.bossWave))bad.push(`L${p.level} table=${p.bossWave}/${p.waves} data=${bw}/${l.waves}`)}
 for(const l of levels)if(!moodProfile(l.id)&&l.boss&&l.id<=29&&(l.wavePlan||[]).some(w=>w.some(k=>k.boss||k.kind==='boss')))bad.push(`L${l.id} boss level without a profile`)
 return bad.length?'CARROT_MOOD_WARN '+bad.join(' '):''
}

export type MoodStage='foreboding'|'held'|'arrival'|'advance'|'release'|'post'|'won'|'lost'
export const STAGES:readonly MoodStage[]=['foreboding','held','arrival','advance','release','post','won','lost']
/** Seconds of the arrival window (the entrance) and of the release window, as the view's stages. */
export const ARRIVAL_SECONDS=2.6,RELEASE_SECONDS=9

/**
 * The page's read-only tracker, the snapshot twin of CarrotMoodTracker and of the view's stage machine: it follows the real guardian
 * (the snapshot's boss is never a clone), tells a death from a leak by the boss kind's own leak record (a guardian bite costs 10 hearts
 * on a challenge and 3 elsewhere, so hearts alone cannot), counts Eyeball rebirths from its life stage and its false dawn from the
 * reincarnate cast, and counts miniboss arrivals after the guardian fell. Its clock is real seconds that stop while the game is paused
 * (the view's windows run on the same clock): the arrival window is 2.6 s, the release window 9 s.
 */
export class MoodTracker{
 level=0;bossId=-1;bossKind='';state:0|1|2|3|4=0;route=0;rebirths=0;deathWave=0;dawnAt=-1e9;reformAt=-1e9;arrivalAt=-1e9;deathAt=-1e9;leakBase=0;lastStage=1;lastAbility='';lastAtDeath=false
 clock=0;private lastNow=-1
 readonly minis=new Set<number>()
 reset(level:number){this.level=level;this.bossId=-1;this.bossKind='';this.state=0;this.route=0;this.rebirths=0;this.deathWave=0;this.dawnAt=this.reformAt=this.arrivalAt=this.deathAt=-1e9;this.leakBase=0;this.lastStage=1;this.lastAbility='';this.lastAtDeath=false;this.clock=0;this.lastNow=-1;this.minis.clear()}
 /** Advances the tracker clock to now (ms) unless paused; returns the real seconds advanced. */
 time(now:number,paused:boolean){const dt=this.lastNow<0?0:Math.max(0,Math.min(1,(now-this.lastNow)/1000));this.lastNow=now;if(paused)return 0;this.clock+=dt;return dt}
 static leaks(st:GameState,kind:string){const s=st.stats;if(!s||!Array.isArray(s.leakKinds))return 0;const i=s.leakKinds.indexOf(kind);return i>=0?Number(s.leakCounts?.[i])||0:0}
 observe(st:GameState,now:number){
  if(st.level!==this.level)this.reset(st.level)
  this.time(now,!!st.paused)
  const b=st.boss&&st.boss.hp>0?st.boss:null,elapsed=st.elapsed||0
  if(b&&(this.bossId<0||this.state>=3)&&(this.bossId<0||b.id!==this.bossId)){this.bossId=b.id;this.bossKind=b.kind;this.state=1;this.arrivalAt=this.clock;this.lastStage=b.stage||1;this.lastAbility='';this.minis.clear()}
  if(b&&b.id===this.bossId){
   this.state=1;if(typeof b.routeFraction==='number'&&Number.isFinite(b.routeFraction))this.route=clamp01(b.routeFraction);else if(this.route===0)this.route=.5
   const stage=b.stage||1;if(stage>this.lastStage){this.rebirths+=stage-this.lastStage;this.reformAt=elapsed}this.lastStage=stage
   if(b.ability==='reincarnate'&&this.lastAbility!=='reincarnate')this.dawnAt=elapsed
   this.lastAbility=b.ability||''
   this.leakBase=MoodTracker.leaks(st,b.kind)
  }else if(this.bossId>=0&&(this.state===1||this.state===2)&&st.phase!=='lost'){
   if(MoodTracker.leaks(st,this.bossKind)>this.leakBase)this.state=4
   else{this.state=3;this.deathAt=this.clock;this.deathWave=st.wave;this.lastAtDeath=(st.enemyCount||0)===0;this.minis.clear()}
  }
  if(this.state===3)for(const m of st.minibosses||[])if(m&&m.hp>0)this.minis.add(m.id)
 }
 input(st:GameState,held:number):MoodInput{
  const dawnAge=this.reformAt>=this.dawnAt&&this.reformAt>-1e8?2.2+((st.elapsed||0)-this.reformAt):this.dawnAt>-1e8?(st.elapsed||0)-this.dawnAt:1e9
  return moodInput(st.level,{ wave:st.wave, waves:st.waves||moodProfile(st.level)?.waves||0, hearts:st.health, boss:this.state, phase:st.phase, nextWave:st.nextWave||0, route:this.route, dawnAge, held, rebirths:this.rebirths, minis:this.minis.size, deathWave:this.deathWave })
 }
 /** Seconds since the guardian fell (-1 before), on the tracker clock. */
 releaseAge(){return this.state===3?this.clock-this.deathAt:-1}
 /** The view's release shape: D follows with tau .6 s after a delay of .15 s when the board is won by the kill (a campaign guardian
 * that was the last enemy alive), else .6 s. */
 releaseDelay(st:GameState){return (!challengeLevel(st.level)||st.phase==='won')&&this.lastAtDeath?.15:.6}
 stage(st:GameState):MoodStage{
  if(st.phase==='won')return 'won'
  if(st.phase==='lost')return 'lost'
  if(this.state===3)return this.clock-this.deathAt<RELEASE_SECONDS||!challengeLevel(st.level)?'release':'post'
  if(this.state===1||this.state===2)return this.clock-this.arrivalAt<ARRIVAL_SECONDS?'arrival':'advance'
  if(this.state===4)return 'advance'
  const p=moodProfile(st.level)
  return p&&p.bossWave>=2&&st.wave===p.bossWave-1&&(st.nextWave||0)>0?'held':'foreboding'
 }
 /** One follower step of D for this frame, the view's rules: Step (entrance window: the arrival and the dawn snap; no rate limit in the
 * false dawn), except in the release window, where D follows with tau .6 s after the delay. */
 step(st:GameState,d:number,held:number,dt:number){
  const input=this.input(st,held),t=moodTarget(input),stage=this.stage(st),age=this.releaseAge()
  if(age>=0&&age<RELEASE_SECONDS&&st.phase!=='won'&&st.phase!=='lost'){if(age>=this.releaseDelay(st))d+=(t-d)*(1-Math.exp(-dt/.6));return d}
  const entrance=stage==='arrival'||input.dawnAge>=2.2&&input.dawnAge<3,dawn=input.dawnAge<2.2
  return moodStep(d,t,dt,entrance,dawn)
 }
}

/** The page shows the mood only for a solo run of a boss level: normal or Veteran (v1 builds send no mode); never duo or endless. */
export function moodGate(st:GameState|null):MoodProfile|null{
 if(!st)return null;const p=moodProfile(st.level);if(!p)return null
 const mode=st.mode||'normal';return mode==='normal'||mode==='veteran'?p:null
}
