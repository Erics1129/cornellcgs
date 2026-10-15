import type { CampaignSave, GameDefinitions, RecordsSave } from '../types'
import { chapterArt, jacketArt, useImageAvailable } from '../art'
import { LevelCount } from '../progress'
import { Grade, Pips } from './kit'
import { bandTone, levelBand, levelPips } from './LevelSelect'
import Icon from '../Icon'

/** The title screen: key art, one PLAY/CONTINUE call to action, and the way into stage select, challenges, the guide and settings. */
export function Lobby({definitions,save,records,error,preview,qaLevel,onPlay,onSelect,onChallenges,onGuide,onHelp,onSettings,reduced}:{definitions:GameDefinitions|null;save:CampaignSave;records:RecordsSave;error:string;preview:boolean;qaLevel:number;onPlay:(id:number)=>void;onSelect:()=>void;onChallenges:()=>void;onGuide:()=>void;onHelp:()=>void;onSettings:()=>void;reduced:boolean}){
 const nextId=preview?qaLevel:Math.min(LevelCount,save.unlocked),next=definitions?.levels.find(l=>l.id===nextId)
 const fresh=save.unlocked<=1&&!Object.keys(save.medals).length
 const jacketOk=useImageAvailable(jacketArt(nextId))
 const challengeCount=definitions?.levels.filter(l=>l.challenge).length||5
 return <main className={`ct-lobby ${reduced?'':'is-animated'}`}>
  <div className="ct-lobby__art" aria-hidden="true"><img src={chapterArt('garden')} alt="" decoding="async" {...{fetchpriority:'high'}}/></div>
  <nav className="ct-lobby__nav ct-enter" style={{'--i':0} as React.CSSProperties}>
   <a href="/minigames/" className="ct-ghost"><Icon name="back"/>All games</a><span className="ct-lobby__brand">CORNELL CGS</span>
   <span className="ct-lobby__icons"><button className="ct-icon-btn" onClick={onSettings} aria-label="Settings"><Icon name="sliders"/></button><button className="ct-icon-btn" onClick={onHelp} aria-label="How to play"><Icon name="help"/></button></span>
  </nav>
  <section className="ct-lobby__copy">
   <p className="ct-kicker ct-enter" style={{'--i':1} as React.CSSProperties}>Neon Harvest update</p>
   <h1 className="ct-enter" style={{'--i':2} as React.CSSProperties}>Carrot<br/>Defense <span className="ct-lobby__3d">3D</span></h1>
   <p className="ct-lobby__cn ct-enter" style={{'--i':3} as React.CSSProperties}>保卫萝卜 · 3D</p>
   <div className="ct-lobby__actions ct-enter" style={{'--i':4} as React.CSSProperties}>
    <button className="ct-cta ct-cta--hero" disabled={!definitions} onClick={()=>onPlay(nextId)}>{fresh?'Play':'Continue'}<Icon name="play"/></button>
    <button className="ct-ghost" disabled={!definitions} onClick={onSelect}><Icon name="levels"/>Stage select</button>
    <button className="ct-ghost" disabled={!definitions} onClick={onChallenges}><Icon name="swords"/>Boss challenges</button>
   </div>
   {error&&<p role="alert" className="ct-error">{error} <button onClick={()=>location.reload()}>Retry</button></p>}
   <p className="ct-lobby__meta ct-enter" style={{'--i':5} as React.CSSProperties}><span><b>{LevelCount}</b> landscapes</span><span><b>{definitions?.towers.length||20}</b> plant families</span><span><b>15</b> minibosses</span><span><b>{challengeCount}</b> guardian challenges</span></p>
  </section>
  {next&&<button className="ct-lobby__next ct-panel ct-enter" style={{'--i':6} as React.CSSProperties} onClick={()=>onPlay(nextId)} aria-label={`${fresh?'Start':'Continue'} with stage ${next.id}, ${next.name}`}>
   <span className="ct-lobby__jacket">{jacketOk?<img src={jacketArt(nextId)} alt="" loading="lazy" decoding="async"/>:<img src={chapterArt(next.biome)} alt="" loading="lazy" decoding="async"/>}</span>
   <span className="ct-lobby__next-copy"><span className="ct-label">{fresh?'First stage':'Up next'}</span><b><i>{String(next.id).padStart(2,'0')}</i>{next.name}</b><span className="ct-lobby__next-meta"><span className={`ct-band is-${bandTone(levelBand(next))}`}>{levelBand(next)}</span><Pips value={levelPips(next)}/><Grade value={records.levels[String(next.id)]?.grade||0} size="sm"/></span></span>
  </button>}
  <footer className="ct-lobby__foot ct-enter" style={{'--i':7} as React.CSSProperties}><span>Original maps &amp; artwork · Fan project</span><button className="ct-ghost" onClick={onGuide}>Field guide<Icon name="arrow"/></button></footer>
 </main>
}
