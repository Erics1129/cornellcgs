/**
 * /minigames/: the list of mini games. Each game has its own page under it,
 * like /minigames/inkMaze/.
 */
import { minigames, pages, site } from '../content'
import { pagePath } from '../lib/router'
import GameCard from './GameCard'
import KnifePortrait from './forge/KnifePortrait'
import './forge/forge.css'
import MinigameShell from './MinigameShell'
import { artUrl } from './inkmaze/assets'
import type { Level } from './inkmaze/engine'
import { LEVELS } from './inkmaze/levels'
import { loadBests } from './inkmaze/progress'

const boardSize = (level: Level) => `${level.grid[0].length} × ${level.grid.length}`
const area = (level: Level) => level.grid[0].length * level.grid.length

/** The Ink Maze card's text, with its numbers taken from the levels themselves. */
const inkMazeSummary = minigames.inkMaze.summary({
  levels: LEVELS.length,
  first: boardSize(LEVELS[0]),
  largest: boardSize(LEVELS.reduce((a, b) => (area(b) > area(a) ? b : a))),
  last: boardSize(LEVELS[LEVELS.length - 1]),
  exact: LEVELS.filter((level) => level.ink === level.par).length,
})

export default function MinigamesPage() {
  const game = minigames.inkMaze
  const bests = loadBests()
  const cleared = LEVELS.filter((level) => bests[level.id]).length
  return <MinigameShell
    pageId="minigames"
    title={minigames.title}
    back={{ href: pagePath('what-we-do'), label: `Back to ${pages['what-we-do'].title}` }}
    skip={{ href: '#page-content', label: 'Skip to content' }}
    className="subpage--minigames">
    <main id="page-content" tabIndex={-1} className="sp-main mg-main" aria-labelledby="page-title">
      <header className="sp-intro">
        <p className="sp-eyebrow">{minigames.eyebrow} <span aria-hidden="true">·</span> {site.fullName}</p>
        <h1 id="page-title">{minigames.title}</h1>
        <p className="sp-lead">{minigames.lead}</p>
      </header>
      <ul className="mg-games">
        <li><GameCard href={pagePath('carrot-defense')} cover="/assets/minigames/carrot/01-garden-keyart.jpg" eyebrow="3D · Tower defense" title="Carrot Defense 3D" body="Twelve landscapes. Ten growing defenses. Protect a little carrot from three extraordinary guardians." cta="Enter the garden" /></li>
        <li><a className="sp-play-card" href={pagePath('forge-or-fold')}>
          <span className="sp-play-card__art ff-game-cover"><KnifePortrait knife={{id:0,metal:'damascus',family:4,level:12,heated:true,pips:0,flow:0,guard:false,sharpened:false,place:'rack'}} /></span>
          <span className="sp-play-card__copy"><span className="sp-eyebrow">3D · Push your luck</span><span className="sp-play-card__title">Forge or Fold</span><span className="sp-play-card__body">Ten days. A hot blade. One more hit? Build a knife worth keeping in a forge where every strike is a choice.</span><span className="sp-play-card__cta">Enter the forge<span aria-hidden="true">→</span></span></span>
        </a></li>
        <li>
          <GameCard
            href={pagePath('ink-maze')}
            cover={artUrl('cover')}
            eyebrow={`${LEVELS.length} levels`}
            title={game.title}
            body={inkMazeSummary}
            meta={cleared ? `You have cleared ${cleared} of ${LEVELS.length}.` : undefined}
            cta={game.cta} />
        </li>
      </ul>
    </main>
  </MinigameShell>
}
