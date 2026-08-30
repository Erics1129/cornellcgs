/** Card corner index — rank over suit, like the corner of a real card (§3). */
export default function SectionIndex({ rank, suit = '♠' }: { rank: string; suit?: string }) {
  return (
    <div className="card-index" aria-hidden="true">
      <span className="rank">{rank}</span>
      <span className="suit">{suit}</span>
    </div>
  )
}
