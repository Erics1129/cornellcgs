import { minigames } from '../content'
import { pagePath } from '../lib/router'
import { artUrl } from './inkmaze/assets'
import GameCard from './GameCard'

/** The card on What We Do that leads to the mini games. */
export default function MinigamesCard() {
  const { card } = minigames
  return <GameCard href={pagePath('minigames')} cover={artUrl('cover')} eyebrow={card.eyebrow} title={card.title} body={card.body} cta={card.cta} />
}
