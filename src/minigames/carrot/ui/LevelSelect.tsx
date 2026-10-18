import { useEffect, useMemo, useRef, useState } from 'react'
import type { CSSProperties } from 'react'
import type { CampaignSave, ChallengeBoss, ChallengeSave, GameDefinitions, LevelDefinition, RecordsSave } from '../types'
import { BossPortrait, CreaturePortrait, RouteDrawing, chapterArt, challengeArt, jacketArt, useImageAvailable } from '../art'
import { levelKinds, parseComposition, traitsOf, workOf } from '../waves'
import type { EnemyDefinition } from '../types'
import { bossOfLevel, challengeDifficulty, challengeTitles, challengeUnlocked, formatSeconds, lockCaption, par as challengePar, stars } from '../challenges'
import { LevelCount, gradeLetters } from '../progress'
import { measuredR2 } from '../difficulty'
import { names, noneYet } from '../copy'
import { Grade, Medals, Pips, difficultyLabel } from './kit'
import { glass, jelly } from './Glass'
import Icon from '../Icon'

export type Chapter={index:number;name:string;number:string;from:number;to:number;road?:string;challenges?:boolean;biome:string}
// Four chapters by level id (the harvest road reprises earlier lands with Ember Orchard), then the arena challenges.
export const chapters:Chapter[]=[{index:1,name:'Sunlit Garden',number:'01',from:1,to:4,biome:'garden'},{index:2,name:'Moonlit Marsh',number:'02',from:5,to:8,biome:'marsh'},{index:3,name:'Frostglass Highlands',number:'03',from:9,to:12,biome:'frost'},{index:4,name:'Harvest Road',number:'04',from:13,to:24,road:'Ember Orchard',biome:'orchard'},{index:5,name:'Challenges',number:'05',from:LevelCount+1,to:Infinity,challenges:true,biome:'arena'}]
export const biomeNames:Record<string,string>={garden:'Sunlit Garden',marsh:'Moonlit Marsh',frost:'Frostglass Highlands',orchard:'Ember Orchard',arena:'The Arena',portal:'Shattered Observatory',prism:'Prismatic Causeway'}
const challengePips:Record<ChallengeBoss,number>={tornado:3,zombie:4,eyeball:5,portal:5,asuna:5}
const r2Of=(id:number)=>measuredR2[id-1]??.5
export function levelPips(l:LevelDefinition){const b=bossOfLevel(l.id);if(b)return challengePips[b];const r=r2Of(l.id);return r>=.9?1:r>=.75?2:r>=.55?3:r>=.4?4:5}
export function levelBand(l:LevelDefinition){
 const b=bossOfLevel(l.id);if(b)return difficultyLabel(0,l.challenge||challengeDifficulty[b])
 const r=r2Of(l.id);return r>=.6?'NORMAL':r>=.4?'HARD':'EXPERT'
}
export const bandTone=(band:string)=>({NORMAL:'normal',EASY:'normal',HARD:'hard',EXPERT:'expert',INSANE:'insane','????':'unknown'}[band]||'normal')

const two=(n:number)=>String(n).padStart(2,'0')
const starIcons=['check','heart','star']
/** An empty record: a muted dot with an accessible name (no dash glyphs). */
const None=()=><span className="ct-none" role="img" aria-label={noneYet}/>

/**
 * The stage's "chart": one bar per wave, its height the wave's work (a guardian counts 8, a miniboss 4), like a rhythm game's note
 * density graph. Waves with flying creatures carry a dot under the bar, guardian and miniboss waves their colour; then the creatures
 * the stage sends (a dot marks the ones the player has not met yet).
 */
function StageChart({level,enemies,seen}:{level:LevelDefinition;enemies:EnemyDefinition[]|undefined;seen:string[]}){
 const waves=(level.waveCompositions||[]).map(c=>{const parts=parseComposition(c);const t=parts.map(p=>traitsOf(p.kind,enemies));return {work:parts.reduce((s,p)=>s+p.n*workOf(p.kind,enemies),0),air:t.some(x=>x.air),boss:t.some(x=>x.boss),mini:t.some(x=>x.mini)}})
 const max=Math.max(1,...waves.map(w=>w.work)),kinds=levelKinds(level).slice(0,12)
 if(!waves.length)return null
 const air=waves.map((w,i)=>w.air?i+1:0).filter(Boolean)
 return <div className="ct-chart">
  {waves.length>1&&<div className="ct-chart__bars gl-well" role="img" aria-label={`${waves.length} waves; ${air.length?`flying creatures in waves ${air.join(', ')}`:'no flying creatures'}${waves.some(w=>w.boss)?`; the guardian arrives in wave ${waves.findIndex(w=>w.boss)+1}`:''}`}>
   {waves.map((w,i)=><span key={i} className={`ct-chart__bar ${w.boss?'is-boss':w.mini?'is-mini':''} ${w.air?'is-air':''}`} style={{'--h':Math.max(.1,w.work/max),'--i':i} as CSSProperties}><i/></span>)}
  </div>}
  <div className="ct-chart__kinds" aria-label={`Creatures: ${kinds.map(k=>traitsOf(k,enemies).name).join(', ')}`}>{kinds.map(k=><span key={k} className={`ct-chart__kind ${seen.includes(k)?'':'is-new'}`} title={traitsOf(k,enemies).name}><CreaturePortrait kind={k} fallback/></span>)}</div>
 </div>
}

/**
 * Images that crossfade: a new source is laid over the last one that finished loading and fades in once it has loaded itself, so
 * moving the focus never flashes the empty frame between two pictures (a source that fails to load simply never shows).
 */
function Crossfade({src}:{src:string}){
 const [layers,setLayers]=useState([{src,id:0,ready:false}])
 useEffect(()=>{setLayers(l=>{const top=l[l.length-1];return top.src===src?l:[...l.filter(x=>x.ready).slice(-1),{src,id:top.id+1,ready:false}]})},[src])
 return <>{layers.map(l=><img key={l.id} src={l.src} alt="" decoding="async" className={l.ready?'is-ready':''} onLoad={()=>setLayers(all=>all.map(x=>x.id===l.id?{...x,ready:true}:x))}/>)}</>
}
/** The full-screen backdrop: the focused stage's land (or the guardian's key art), dimmed, with a light in the land's colour. */
function Backdrop({src}:{src:string}){
 return <div className="ct-select__backdrop" aria-hidden="true"><Crossfade src={src}/><i className="ct-select__shade"/></div>
}

type Props={definitions:GameDefinitions;save:CampaignSave;challenges:ChallengeSave;records:RecordsSave;current:number;preview:boolean;veteranAvailable:boolean;veteran:boolean;onVeteran:(on:boolean)=>void;onPlay:(id:number)=>void;onClose:()=>void;startChallenges?:boolean;reduced:boolean}
export function LevelSelect({definitions,save,challenges,records,current,preview,veteranAvailable,veteran,onVeteran,onPlay,onClose,startChallenges,reduced}:Props){
 const ref=useRef<HTMLDialogElement>(null),list=useRef<HTMLOListElement>(null)
 const levels=definitions.levels
 const isOpen=(id:number)=>preview||(id>LevelCount?challengeUnlocked(id,save,challenges):id<=save.unlocked)
 const initial=startChallenges?(levels.find(l=>l.id>LevelCount)?.id||current):Math.min(current,LevelCount)
 const [focus,setFocus]=useState(initial)
 const chapterOf=(id:number)=>chapters.find(c=>id>=c.from&&id<=c.to)||chapters[0]
 const [chapter,setChapter]=useState(chapterOf(initial).index)
 const ch=chapters.find(c=>c.index===chapter)||chapters[0]
 const rows=useMemo(()=>levels.filter(l=>l.id>=ch.from&&l.id<=ch.to),[levels,ch])
 const level=levels.find(l=>l.id===focus)||rows[0]
 // Play takes the first focus without scrolling the dialog (autoFocus scrolled it on short WebKit screens)
 useEffect(()=>{const el=ref.current;el?.showModal();el?.querySelector<HTMLElement>('.ct-jacket__play')?.focus({preventScroll:true});if(el)el.scrollTop=0;return()=>el?.close()},[])
 // Scroll only the track list: scrollIntoView also scrolls the dialog itself, which pushed Back and the chapters off a short screen.
 useEffect(()=>{const box=list.current,row=box?.querySelector<HTMLElement>(`[data-id="${focus}"]`);if(!box||!row)return
  const r=row.getBoundingClientRect(),b=box.getBoundingClientRect(),pad=14
  if(r.top<b.top+pad)box.scrollTop-=b.top+pad-r.top;else if(r.bottom>b.bottom-pad)box.scrollTop+=r.bottom-b.bottom+pad
  if(ref.current&&ref.current.scrollTop)ref.current.scrollTop=0},[focus,chapter])
 // the current chapter tab stays in view on narrow screens (the tabs scroll sideways there)
 useEffect(()=>{const tab=ref.current?.querySelector<HTMLElement>('.ct-chapter.is-current'),box=tab?.parentElement;if(!tab||!box||box.scrollWidth<=box.clientWidth)return
  const t=tab.offsetLeft,w=tab.offsetWidth;if(t<box.scrollLeft+16)box.scrollLeft=t-16;else if(t+w>box.scrollLeft+box.clientWidth-16)box.scrollLeft=t+w-box.clientWidth+16},[chapter])
 const pickChapter=(i:number)=>{const c=chapters.find(x=>x.index===i);if(!c)return;setChapter(i);const ls=levels.filter(l=>l.id>=c.from&&l.id<=c.to);const open=ls.filter(l=>isOpen(l.id));setFocus((open[open.length-1]||ls[0])?.id||c.from)}
 const keys=(e:React.KeyboardEvent)=>{
  const i=rows.findIndex(r=>r.id===focus)
  if(e.key==='ArrowDown'||e.key==='ArrowUp'){e.preventDefault();const n=rows[Math.max(0,Math.min(rows.length-1,i+(e.key==='ArrowDown'?1:-1)))];if(n){setFocus(n.id);list.current?.querySelector<HTMLElement>(`[data-id="${n.id}"]`)?.focus({preventScroll:true})}}
  if(e.key==='ArrowRight'||e.key==='ArrowLeft'){if((e.target as HTMLElement).closest('input'))return;e.preventDefault();pickChapter(Math.max(1,Math.min(chapters.length,chapter+(e.key==='ArrowRight'?1:-1))))}
 }
 const totalMedals=Object.values(save.medals).reduce((s,m)=>s+((m&1)+((m>>1)&1)+((m>>2)&1)),0),cleared=Object.values(save.medals).filter(m=>m&1).length
 const boss=level?bossOfLevel(level.id):null
 const rec=level?records.levels[String(level.id)]:undefined
 const best=boss?challenges.best[boss]:undefined
 const medal=level?(boss?stars(best,boss):save.medals[level.id]||0):0
 const open=level?isOpen(level.id):false,band=level?levelBand(level):'NORMAL'
 const jacketOk=useImageAvailable(jacketArt(level?.id||1))
 const cover=level?(jacketOk?jacketArt(level.id):boss?challengeArt(boss):chapterArt(level.biome)):chapterArt('garden')
 // the backdrop is the land itself (high-resolution key art), or the guardian's key art in the challenges
 const scene=boss?challengeArt(boss):chapterArt(level?.biome||ch.biome)
 const title=ch.challenges?names.challenges:names.stageSelect
 const guardian=boss||level?.boss||''
 const fastest=boss&&best?formatSeconds(best.seconds):rec?.bestSeconds?formatSeconds(rec.bestSeconds):''
 return <dialog ref={ref} className={`ct-select ${reduced?'':'is-animated'} ${ch.challenges?'is-arena':''}`} aria-labelledby="ct-select-title" onCancel={e=>{e.preventDefault();onClose()}} onKeyDown={keys} data-biome={level?.biome||'garden'}>
  <Backdrop src={scene}/>
  <header className="ct-select__top">
   <button className="ct-icon-btn ct-select__back" onClick={onClose} aria-label="Back"><Icon name="back"/></button>
   <h2 id="ct-select-title">{title}</h2>
   <p className={glass({depth:1,pill:true},'ct-select__total')}><span><b className="gl-num">{cleared}</b> of {LevelCount} cleared</span><i aria-hidden="true"/><span><b className="gl-num">{totalMedals}</b> medals</span></p>
  </header>
  <nav className={glass({depth:1,pill:true},'ct-chapters')} aria-label="Chapters"><div className="ct-chapters__scroll">{chapters.map(c=>{const ls=levels.filter(l=>l.id>=c.from&&l.id<=c.to);if(!ls.length)return null;const done=c.challenges?ls.filter(l=>{const b=bossOfLevel(l.id);return b&&challenges.best[b]?.cleared}).length:ls.filter(l=>(save.medals[l.id]||0)&1).length
   return <button key={c.index} className={`ct-chapter gl--press ${c.index===chapter?'is-current':''}`} aria-pressed={c.index===chapter} onClick={()=>pickChapter(c.index)} data-biome={c.biome} aria-label={`${c.name}, ${done} of ${ls.length} cleared`}>
    <span className="ct-chapter__ring" style={{'--ring':done/ls.length} as CSSProperties} aria-hidden="true"><img src={chapterArt(c.biome)} alt="" loading="lazy" decoding="async"/></span>
    <span className="ct-chapter__text"><span className="ct-chapter__name">{c.name}</span><span className="ct-chapter__done gl-num">{done}/{ls.length}</span></span>
   </button>})}</div></nav>
  <div className="ct-select__main">
   {level&&<article className={glass({depth:3,blur:true},'ct-jacket',open?'':'is-locked')}>
    <div className="ct-jacket__art gl-thumb">
     <Crossfade src={cover}/>
     {!jacketOk&&level.routes&&<RouteDrawing routes={level.routes}/>}
     <span className="ct-jacket__no gl-num" aria-hidden="true">{two(level.id)}</span>
     {guardian?<span className="ct-jacket__boss" aria-hidden="true"><BossPortrait kind={guardian}/></span>:null}
     {!open&&<span className="ct-jacket__locked" aria-hidden="true"><Icon name="lock"/></span>}
    </div>
    <div className="ct-jacket__body" key={level.id}>
     <div className="ct-jacket__meta">
      <span className={`ct-band is-${bandTone(band)}`}>{band}</span><Pips value={levelPips(level)}/>
      <span className="ct-jacket__waves">{boss==='asuna'?'Endurance':`${level.waves} waves`} · {level.routes?.length||1} {(level.routes?.length||1)>1?'routes':'route'}</span>
     </div>
     <h3>{boss?challengeTitles[boss]:level.name}</h3>
     <p className="ct-jacket__sub">{boss?`${biomeNames[level.biome]||biomeNames.arena} · Par ${formatSeconds(challengePar[boss])}`:`${biomeNames[level.biome]||level.biome}${level.boss?' · Guardian stage':''}`}</p>
     <dl className="ct-jacket__best">
      <div className="gl-fill"><dt className="gl-label">Best</dt><dd><Grade value={rec?.grade||0} size="md"/></dd></div>
      <div className="gl-fill"><dt className="gl-label">{boss?'Stars':'Medals'}</dt><dd><Medals value={medal} icons={boss?starIcons:undefined} labels={boss?['Cleared.','Carrot unharmed.',`Under ${formatSeconds(challengePar[boss])}.`]:undefined}/></dd></div>
      <div className="gl-fill"><dt className="gl-label">Fastest</dt><dd className="gl-num">{fastest||<None/>}</dd></div>
      <div className="gl-fill"><dt className="gl-label">Chain</dt><dd className="gl-num">{rec?.bestStreak?`×${rec.bestStreak}`:<None/>}</dd></div>
     </dl>
     <StageChart level={level} enemies={definitions.enemies} seen={records.seen.creatures}/>
     {veteranAvailable&&!boss&&<label className="ct-switch ct-jacket__veteran"><input type="checkbox" checked={veteran} onChange={e=>onVeteran(e.target.checked)}/><span>Veteran</span><small>Tougher creatures, 60% refunds</small></label>}
    </div>
    <div className="ct-jacket__go">
     {open?<button className={jelly({size:'lg'},'ct-cta ct-jacket__play')} onClick={()=>onPlay(level.id)}>Play<Icon name="play"/></button>
     :<p className="ct-jacket__lock gl-fill"><Icon name="lock"/>{boss?lockCaption[boss]||'Locked':`Clear stage ${two(level.id-1)} to unlock`}</p>}
    </div>
   </article>}
   <ol className="ct-tracklist" ref={list} aria-label={`${ch.name} stages`}>
    {rows.map((l,i)=>{const b=bossOfLevel(l.id),r=records.levels[String(l.id)],m=b?stars(challenges.best[b],b):save.medals[l.id]||0,o=isOpen(l.id),bd=levelBand(l),on=l.id===focus,best=b?challenges.best[b]:undefined
     const fresh=!b&&o&&!(m&1)&&l.id===save.unlocked&&!preview
     const sub=b?(best?`Best: ${best.health} hearts · ${formatSeconds(best.seconds)}`:o?`Par ${formatSeconds(challengePar[b])}`:'Locked'):biomeNames[l.biome]!==ch.name&&!ch.challenges?biomeNames[l.biome]:l.boss?'Guardian':`${l.waves} waves`
     return <li key={l.id} style={{'--i':i} as CSSProperties}><button data-id={l.id} className={glass({depth:2,interactive:true,selected:on},'ct-trackrow',on&&'is-focus',!o&&'is-locked',b&&'is-challenge')} aria-current={on} onClick={()=>{if(on&&o)onPlay(l.id);else setFocus(l.id)}} onKeyUp={e=>{if(e.key==='Tab')setFocus(l.id)}} onDoubleClick={()=>o&&onPlay(l.id)}
      aria-label={`${l.id}. ${b?challengeTitles[b]:l.name}. ${bd}${o?'':'. Locked'}${r?.grade?`. Grade ${gradeLetters[r.grade]}`:''}`}>
      <span className="ct-trackrow__no gl-num">{two(l.id)}</span>
      <span className="ct-trackrow__art" aria-hidden="true"><span className="ct-trackrow__thumb gl-thumb"><img src={jacketArt(l.id)} alt="" loading="lazy" decoding="async" onError={e=>{(e.target as HTMLImageElement).style.visibility='hidden'}}/></span>{b&&<span className="ct-trackrow__boss"><BossPortrait kind={b}/></span>}</span>
      <span className="ct-trackrow__name"><b><span className="ct-trackrow__title">{b?challengeTitles[b]:l.name}</span>{fresh&&<span className="ct-trackrow__new">New</span>}</b><small>{sub}</small></span>
      <span className={`ct-band is-${bandTone(bd)}`}>{bd}</span>
      <Medals value={m} icons={b?starIcons:undefined}/>
      {o?<Grade value={r?.grade||0} size="sm"/>:<span className="ct-trackrow__lock"><Icon name="lock"/></span>}
     </button></li>})}
   </ol>
  </div>
 </dialog>
}
