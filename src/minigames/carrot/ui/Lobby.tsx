import { useEffect, useMemo, useRef, useState } from 'react'
import type { CSSProperties } from 'react'
import type { CampaignSave, GameDefinitions, RecordsSave } from '../types'
import { chapterArt, jacketArt, useImageAvailable } from '../art'
import { LevelCount } from '../progress'
import { miniBosses } from '../expansion'
import { actions, count, names } from '../copy'
import { Grade, Medals, Pips } from './kit'
import { bandTone, biomeNames, levelBand, levelPips } from './LevelSelect'
import { glass } from './Glass'
import { useLobbyDepth } from './useLobbyDepth'
import Icon from '../Icon'

const pad2=(n:number)=>String(n).padStart(2,'0')
const vars=(v:Record<string,string|number>)=>v as CSSProperties
/** The travelling glint on a glass rim (moved by useLobbyDepth; a masked ring, so it follows any radius). */
const RimLight=()=><span className="ct-rimlight" aria-hidden="true"><i/></span>
/** Light motes drifting up through the key art (pollen, fireflies, snow or embers by chapter). Fixed positions, so every visit looks the same. */
const motes=Array.from({length:18},(_,i)=>{
 const r=(k:number)=>{const s=Math.sin((i+1)*12.9898+k*78.233)*43758.5453;return s-Math.floor(s)}
 const near=r(3)
 return {x:4+r(1)*92,y:28+r(2)*66,size:2+near*near*7,dur:11+r(4)*13,delay:-r(5)*24,dx:(r(6)-.5)*140,dy:110+r(7)*240,o:.35+near*.55}
})

/**
 * The title screen. Back to front: the chapter's key art, its light and drifting motes, a scrim for the type; then the glass: the nav,
 * the title and the one primary action (Play for a new player, Continue after that), the ways into stage select and the boss
 * challenges, the next stage as a card, the game's numbers, and the footer (Field guide, Credits). The art is the chapter of the
 * next stage, so the screen follows the campaign. Depth and light follow a fine pointer (useLobbyDepth); the entrance is staggered
 * under 1.4 s and becomes short fades under reduced motion.
 */
export function Lobby({definitions,save,records,error,preview,qaLevel,onPlay,onSelect,onChallenges,onGuide,onHelp,onSettings,onCredits,reduced}:{definitions:GameDefinitions|null;save:CampaignSave;records:RecordsSave;error:string;preview:boolean;qaLevel:number;onPlay:(id:number)=>void;onSelect:()=>void;onChallenges:()=>void;onGuide:()=>void;onHelp:()=>void;onSettings:()=>void;onCredits:()=>void;reduced:boolean}){
 const root=useRef<HTMLElement>(null)
 const nextId=preview?qaLevel:Math.min(LevelCount,save.unlocked),next=definitions?.levels.find(l=>l.id===nextId)
 const fresh=save.unlocked<=1&&!Object.keys(save.medals).length
 const biome=next?.biome||'garden'
 const jacketOk=useImageAvailable(jacketArt(nextId))
 const challengeCount=definitions?.levels.filter(l=>l.challenge).length||5
 const cleared=Object.values(save.medals).filter(m=>m&1).length
 const band=next?levelBand(next):''
 // phones get one blurred surface (the stage card); the rest is the same glass without the blur
 const coarse=useMemo(()=>typeof matchMedia==='function'&&matchMedia('(pointer: coarse)').matches,[])
 const [leaving,setLeaving]=useState(false)
 useLobbyDepth(root,!reduced,next?.id)
 useEffect(()=>{if(!leaving)return;const t=window.setTimeout(()=>setLeaving(false),900);return()=>clearTimeout(t)},[leaving])
 // Play: the scene leans in and the glass clears for 260 ms, then the game takes over (instant under reduced motion)
 const play=()=>{if(!definitions||leaving)return;if(reduced){onPlay(nextId);return}setLeaving(true);window.setTimeout(()=>onPlay(nextId),260)}
 const stats:[number,string,string][]=[[LevelCount,'stages','flag'],[definitions?.towers.length||20,'towers','leaf'],[miniBosses.length,'minibosses','crown'],[challengeCount,'boss challenges','swords']]
 return <main ref={root} className={['ct-lobby',reduced?'':'is-animated',leaving?'is-leaving':''].filter(Boolean).join(' ')} data-biome={biome}>
  <div className="ct-lobby__stage" aria-hidden="true">
   <div className="ct-lobby__layer" data-depth="-16"><img className="ct-lobby__art" src={chapterArt(biome)} alt="" decoding="async" {...{fetchpriority:'high'}}/></div>
   <div className="ct-lobby__layer" data-depth="-24"><div className="ct-lobby__light"/></div>
   {!reduced&&<div className="ct-lobby__layer ct-lobby__motes" data-depth="-34">{motes.map((m,i)=><i key={i} style={vars({'--x':`${m.x}%`,'--y':`${m.y}%`,'--s':`${m.size.toFixed(1)}px`,'--t':`${m.dur.toFixed(1)}s`,'--d':`${m.delay.toFixed(1)}s`,'--dx':`${m.dx.toFixed(0)}px`,'--dy':`${(-m.dy).toFixed(0)}px`,'--o':m.o.toFixed(2)})}/>)}</div>}
   <div className="ct-lobby__scrim"/>
   <div className="ct-lobby__layer" data-depth="-28"><div className="ct-lobby__rays"/></div>
  </div>

  <nav className="ct-lobby__nav ct-in" style={vars({'--i':0})}>
   <a href="/minigames/" className="ct-ghost" data-light><RimLight/><Icon name="back"/>{names.allGames}</a>
   <span className="ct-lobby__brand">Cornell CGS</span>
   <span className={glass({depth:1,pill:true},'ct-lobby__icons')} data-light><RimLight/><button className="ct-icon-btn" onClick={onSettings} aria-label={names.settings}><Icon name="sliders"/></button><button className="ct-icon-btn" onClick={onHelp} aria-label={names.howToPlay}><Icon name="help"/></button></span>
  </nav>

  <section className="ct-lobby__hero" data-depth="5">
   <p className="ct-lobby__kicker ct-in" style={vars({'--i':1})}>Tower defense</p>
   <h1 className="ct-title"><span className="ct-title__line"><span className="ct-title__word" style={vars({'--i':0})}>Carrot</span></span><span className="ct-title__line"><span className="ct-title__word" style={vars({'--i':1})}>Defense</span><span className={glass({depth:1,pill:true},'ct-title__badge')} data-light><RimLight/>3D</span></span></h1>
   <p className="ct-lobby__cn ct-in" lang="zh-Hans" style={vars({'--i':4})}>保卫萝卜</p>
   <div className="ct-lobby__actions">
    <button className="ct-cta ct-cta--hero is-idle ct-lobby__play ct-in" style={vars({'--i':6})} disabled={!definitions} onClick={play}><span className="ct-lobby__play-disc"><Icon name="play"/></span><span className="ct-lobby__play-label">{fresh?actions.play:actions.continue}</span></button>
    <span className={glass({depth:1,pill:true,blur:!coarse},'ct-lobby__more ct-in')} style={vars({'--i':7})} data-light><RimLight/>
     <button className="ct-ghost" disabled={!definitions} onClick={onSelect}><Icon name="levels"/>{names.stageSelect}</button>
     <button className="ct-ghost" disabled={!definitions} onClick={onChallenges}><Icon name="swords"/>{names.challenges}</button>
    </span>
   </div>
   {error&&<p role="alert" className={glass({depth:2,tone:'leak',wash:true},'ct-error')}><Icon name="warning"/><span>{error}</span><button className="ct-ghost" onClick={()=>location.reload()}>{actions.tryAgain}</button></p>}
  </section>

  <div className="ct-lobby__stats-wrap" data-depth="4">
   <div className={glass({depth:1,blur:!coarse},'ct-lobby__stats ct-in')} style={vars({'--i':10})} data-light><RimLight/><ul>
    {stats.map(([n,label,icon])=><li key={label} className="gl-fill"><b className="gl-num"><Icon name={icon}/>{n}</b><span>{label}</span></li>)}
   </ul></div>
  </div>

  {next&&<div className="ct-lobby__card-wrap" data-depth="9">
   <button className={glass({depth:2,blur:true,interactive:true},'ct-lobby__next ct-in')} style={vars({'--i':9,'--gl-pad':'10px'})} data-tilt data-light onClick={play} aria-label={`${fresh?'Start':'Continue'} with stage ${next.id}, ${next.name}`}><RimLight/>
    <span className="gl-thumb ct-lobby__jacket"><img src={jacketOk?jacketArt(nextId):chapterArt(next.biome)} alt="" decoding="async" data-tilt-inner/><span className="ct-lobby__jacket-no gl-num">{pad2(next.id)}</span><span className="ct-lobby__jacket-go"><Icon name="play"/></span></span>
    <span className="ct-lobby__next-body">
     <span className="gl-label">{fresh?'First stage':'Up next'} · {biomeNames[next.biome]||next.biome}</span>
     <span className="ct-lobby__next-name">{next.name}</span>
     <span className="ct-lobby__next-meta"><span className={`ct-band is-${bandTone(band)}`}>{band}</span><Pips value={levelPips(next)}/><span className="ct-lobby__waves">{count(next.waves,'wave')}</span>{!!records.levels[String(next.id)]?.grade&&<Grade value={records.levels[String(next.id)].grade} size="sm"/>}{!!save.medals[next.id]&&<Medals value={save.medals[next.id]}/>}</span>
     {!fresh&&<span className="ct-lobby__progress"><span className="gl-meter"><i style={vars({'--v':Math.max(.02,cleared/LevelCount)})}/></span><span className="gl-num">{cleared}<small> of {LevelCount} cleared</small></span></span>}
    </span>
   </button>
  </div>}

  <footer className="ct-lobby__foot ct-in" style={vars({'--i':11})}>
   <span>Original maps &amp; artwork · Fan project</span>
   <span className="ct-lobby__links"><button className="ct-ghost" onClick={onGuide}><Icon name="leaf"/>{names.fieldGuide}</button><button className="ct-ghost" onClick={onCredits}><Icon name="star"/>Credits</button></span>
  </footer>
 </main>
}
