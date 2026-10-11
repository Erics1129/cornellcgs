/**
 * /minigames/: the list of mini games. Each game has its own page under it,
 * like /minigames/inkMaze/.
 */
import { minigames, pages, site } from '../content'
import { pagePath } from '../lib/router'
import GameCard from './GameCard'
import MinigameShell from './MinigameShell'
import { artUrl } from './inkmaze/assets'
import type { Level } from './inkmaze/engine'
import { LEVELS } from './inkmaze/levels'
import { loadBests } from './inkmaze/progress'

const boardSize = (level: Level) => `${level.grid[0].length} × ${level.grid.length}`

/** The Ink Maze card's text, with its numbers taken from the levels themselves. */
const inkMazeSummary = minigames.inkMaze.summary({
  levels: LEVELS.length,
  first: boardSize(LEVELS[0]),
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
