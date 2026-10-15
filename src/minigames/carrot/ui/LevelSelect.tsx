import { useEffect, useMemo, useRef, useState } from 'react'
import type { CampaignSave, ChallengeBoss, ChallengeSave, GameDefinitions, LevelDefinition, RecordsSave } from '../types'
import { BossPortrait, CreaturePortrait, RouteDrawing, chapterArt, challengeArt, jacketArt, useImageAvailable } from '../art'
import { levelKinds, parseComposition, traitsOf, workOf } from '../waves'
import type { EnemyDefinition } from '../types'
import { bossOfLevel, challengeDifficulty, challengeTitles, challengeUnlocked, formatSeconds, lockCaption, par as challengePar, stars } from '../challenges'
import { LevelCount } from '../progress'
import { Grade, Medals, Pips, difficultyLabel } from './kit'
import Icon from '../Icon'

export type Chapter={index:number;name:string;number:string;from:number;to:number;road?:string;challenges?:boolean;biome:string}
// Four chapters by level id (the harvest road reprises earlier lands with Ember Orchard), then the arena challenges.
export const chapters:Chapter[]=[{index:1,name:'Sunlit Garden',number:'01',from:1,to:4,biome:'garden'},{index:2,name:'Moonlit Marsh',number:'02',from:5,to:8,biome:'marsh'},{index:3,name:'Frostglass Highlands',number:'03',from:9,to:12,biome:'frost'},{index:4,name:'Harvest Road',number:'04',from:13,to:24,road:'Ember Orchard',biome:'orchard'},{index:5,name:'Challenges',number:'05',from:LevelCount+1,to:Infinity,challenges:true,biome:'arena'}]
export const biomeNames:Record<string,string>={garden:'Sunlit Garden',marsh:'Moonlit Marsh',frost:'Frostglass Highlands',orchard:'Ember Orchard',arena:'The Arena',portal:'Shattered Observatory',prism:'Prismatic Causeway'}
/** Difficulty pips 1-5 per campaign level (the bands in docs/carrot-defense/giant-update/difficulty.md), and per challenge. */
const campaignPips=[1,1,2,2,2,2,3,3,3,3,3,4,3,3,4,4,4,4,4,5,4,5,5,5]
const challengePips:Record<ChallengeBoss,number>={tornado:3,zombie:4,eyeball:5,portal:5,asuna:5}
export function levelPips(l:LevelDefinition){const b=bossOfLevel(l.id);return b?challengePips[b]:campaignPips[l.id-1]||3}
/** Campaign band labels: NORMAL for the openers, HARD for mid-chapter and pre-boss stages, EXPERT on the boss stages. */
export function levelBand(l:LevelDefinition){
 const b=bossOfLevel(l.id);if(b)return difficultyLabel(0,l.challenge||challengeDifficulty[b])
 if(l.id<=3||[5,9,13,17,21].includes(l.id))return 'NORMAL'
 if([8,12,16,20,24].includes(l.id))return 'EXPERT'
 return 'HARD'
}
/**
 * The stage's "chart": one bar per wave, its height the wave's work (a guardian counts 8, a miniboss 4), like a rhythm game's note
 * density graph. Waves with flyers carry a wing tick, guardian and miniboss waves their colour; then the creatures the stage sends.
 */
function StageChart({level,enemies,seen}:{level:LevelDefinition;enemies:EnemyDefinition[]|undefined;seen:string[]}){
 const waves=(level.waveCompositions||[]).map(c=>{const parts=parseComposition(c);const t=parts.map(p=>traitsOf(p.kind,enemies));return {work:parts.reduce((s,p)=>s+p.n*workOf(p.kind,enemies),0),air:t.some(x=>x.air),boss:t.some(x=>x.boss),mini:t.some(x=>x.mini)}})
 const max=Math.max(1,...waves.map(w=>w.work)),kinds=levelKinds(level).slice(0,12)
 if(!waves.length)return null
 return <div className="ct-chart">
  <div className="ct-chart__bars" role="img" aria-label={`${waves.length} waves; flyers in waves ${waves.map((w,i)=>w.air?i+1:0).filter(Boolean).join(', ')||'none'}${waves.some(w=>w.boss)?`; the guardian arrives in wave ${waves.findIndex(w=>w.boss)+1}`:''}`}>
   {waves.map((w,i)=><i key={i} className={`${w.boss?'is-boss':w.mini?'is-mini':''} ${w.air?'is-air':''}`} style={{height:`${Math.max(8,w.work/max*100)}%`}}/>)}
  </div>
  <div className="ct-chart__kinds" aria-label={`Creatures: ${kinds.map(k=>traitsOf(k,enemies).name).join(', ')}`}>{kinds.map(k=><span key={k} className={`ct-chart__kind ${seen.includes(k)?'':'is-new'}`} title={traitsOf(k,enemies).name}><CreaturePortrait kind={k} fallback/></span>)}</div>
 </div>
}

export const bandTone=(band:string)=>({NORMAL:'normal',EASY:'normal',HARD:'hard',EXPERT:'expert',INSANE:'insane','????':'unknown'}[band]||'normal')

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
 useEffect(()=>{const el=ref.current;el?.showModal();return()=>el?.close()},[])
 useEffect(()=>{list.current?.querySelector<HTMLElement>(`[data-id="${focus}"]`)?.scrollIntoView({block:'nearest'})},[focus,chapter])
 const pickChapter=(i:number)=>{const c=chapters.find(x=>x.index===i);if(!c)return;setChapter(i);const ls=levels.filter(l=>l.id>=c.from&&l.id<=c.to);const open=ls.filter(l=>isOpen(l.id));setFocus((open[open.length-1]||ls[0])?.id||c.from)}
 const keys=(e:React.KeyboardEvent)=>{
  const i=rows.findIndex(r=>r.id===focus)
  if(e.key==='ArrowDown'||e.key==='ArrowUp'){e.preventDefault();const n=rows[Math.max(0,Math.min(rows.length-1,i+(e.key==='ArrowDown'?1:-1)))];if(n){setFocus(n.id);list.current?.querySelector<HTMLElement>(`[data-id="${n.id}"]`)?.focus()}}
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
 return <dialog ref={ref} className={`ct-select ${reduced?'':'is-animated'}`} aria-label="Stage select" onCancel={e=>{e.preventDefault();onClose()}} onKeyDown={keys} data-biome={level?.biome||'garden'}>
  <div className="ct-select__backdrop" aria-hidden="true"><img key={cover} src={cover} alt="" decoding="async"/></div>
  <header className="ct-select__top">
   <button className="ct-icon-btn" onClick={onClose} aria-label="Back"><Icon name="back"/></button>
   <h2>Stage select</h2>
   <span className="ct-select__total"><b>{cleared}</b>/{LevelCount} cleared <i/> <b>{totalMedals}</b> medals</span>
  </header>
  <nav className="ct-chapters" aria-label="Chapters">{chapters.map(c=>{const ls=levels.filter(l=>l.id>=c.from&&l.id<=c.to);if(!ls.length)return null;const done=c.challenges?ls.filter(l=>{const b=bossOfLevel(l.id);return b&&challenges.best[b]?.cleared}).length:ls.filter(l=>(save.medals[l.id]||0)&1).length
   return <button key={c.index} className={`ct-chapter ${c.index===chapter?'is-current':''}`} aria-pressed={c.index===chapter} onClick={()=>pickChapter(c.index)} data-biome={c.biome}><span className="ct-chapter__no">{c.number}</span><span className="ct-chapter__name">{c.name}</span><span className="ct-chapter__done">{done}/{ls.length}</span></button>})}</nav>
  <div className="ct-select__main">
   {level&&<article className={`ct-jacket ${open?'':'is-locked'}`} key={level.id}>
    <div className="ct-jacket__art"><img src={cover} alt="" loading="lazy" decoding="async"/><span className="ct-jacket__no">{String(level.id).padStart(2,'0')}</span>{!jacketOk&&level.routes&&<RouteDrawing routes={level.routes}/>}{boss||level.boss?<span className="ct-jacket__boss"><BossPortrait kind={boss||level.boss||''}/></span>:null}</div>
    <div className="ct-jacket__meta">
     <span className={`ct-band is-${bandTone(band)}`}>{band}</span><Pips value={levelPips(level)}/>
     <span className="ct-jacket__waves">{boss==='asuna'?'Endurance':`${level.waves} waves`} · {level.routes?.length||1} {(level.routes?.length||1)>1?'routes':'route'}</span>
    </div>
    <h3>{boss?challengeTitles[boss]?.replace('BossFight - ',''):level.name}</h3>
    <p className="ct-jacket__sub">{boss?`${level.bossName||level.name} · The Arena`:`${biomeNames[level.biome]||level.biome}${level.boss?' · Guardian stage':''}`}</p>
    <dl className="ct-jacket__best">
     <div><dt>Best</dt><dd><Grade value={rec?.grade||0} size="md"/></dd></div>
     <div><dt>{boss?'Stars':'Medals'}</dt><dd><Medals value={medal} icons={boss?['check','heart','star']:undefined} labels={boss?['Cleared.','Carrot unharmed.',`Under ${formatSeconds(challengePar[boss])}.`]:undefined}/></dd></div>
     <div><dt>Fastest</dt><dd>{boss&&best?formatSeconds(best.seconds):rec?.bestSeconds?formatSeconds(rec.bestSeconds):'–'}</dd></div>
     <div><dt>Chain</dt><dd>{rec?.bestStreak?`×${rec.bestStreak}`:'–'}</dd></div>
    </dl>
    <StageChart level={level} enemies={definitions.enemies} seen={records.seen.creatures}/>
    {veteranAvailable&&!boss&&<label className="ct-switch"><input type="checkbox" checked={veteran} onChange={e=>onVeteran(e.target.checked)}/><span>Veteran</span><small>Tougher creatures, 60% refunds</small></label>}
    {open?<button className="ct-cta ct-jacket__play" onClick={()=>onPlay(level.id)} autoFocus>Play<Icon name="play"/></button>:<p className="ct-jacket__lock"><Icon name="lock"/>{boss?lockCaption[boss]||'Locked':`Clear stage ${String(level.id-1).padStart(2,'0')} to open`}</p>}
   </article>}
   <ol className="ct-tracklist" ref={list} aria-label={`${ch.name} stages`}>
    {rows.map(l=>{const b=bossOfLevel(l.id),r=records.levels[String(l.id)],m=b?stars(challenges.best[b],b):save.medals[l.id]||0,o=isOpen(l.id),bd=levelBand(l)
     return <li key={l.id}><button data-id={l.id} className={`ct-trackrow ${l.id===focus?'is-focus':''} ${o?'':'is-locked'}`} aria-current={l.id===focus} onClick={()=>{if(l.id===focus&&o)onPlay(l.id);else setFocus(l.id)}} onKeyUp={e=>{if(e.key==='Tab')setFocus(l.id)}} onDoubleClick={()=>o&&onPlay(l.id)}
      aria-label={`${l.id}. ${b?challengeTitles[b]:l.name}. ${bd}${o?'':'. Locked'}${r?.grade?`. Grade ${['','D','C','B','A','S'][r.grade]}`:''}`}>
      <span className="ct-trackrow__no">{String(l.id).padStart(2,'0')}</span>
      <span className="ct-trackrow__thumb" aria-hidden="true"><img src={jacketArt(l.id)} alt="" loading="lazy" decoding="async" onError={e=>{(e.target as HTMLImageElement).style.visibility='hidden'}}/></span>
      <span className="ct-trackrow__name"><b>{b?challengeTitles[b]?.replace('BossFight - ',''):l.name}</b><small>{b?(challenges.best[b]?`Best ${challenges.best[b]!.health} HP · ${formatSeconds(challenges.best[b]!.seconds)}`:o?`Par ${formatSeconds(challengePar[b])}`:'Locked'):biomeNames[l.biome]!==ch.name&&!ch.challenges?biomeNames[l.biome]:l.boss?'Guardian':`${l.waves} waves`}</small></span>
      <span className={`ct-band is-${bandTone(bd)}`}>{bd}</span>
      <Medals value={m} icons={b?['check','heart','star']:undefined}/>
      {o?<Grade value={r?.grade||0} size="sm"/>:<span className="ct-trackrow__lock"><Icon name="lock"/></span>}
     </button></li>})}
   </ol>
  </div>
 </dialog>
}
