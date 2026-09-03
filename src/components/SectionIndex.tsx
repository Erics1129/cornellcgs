/** Card corner index — rank over suit, like the corner of a real card (§3). */
export default function SectionIndex({ rank, suit = '♠' }: { rank: string; suit?: string }) {
  return (
    <div className="card-index" aria-hidden="true">
      <span
        className="rank life-bob"
        style={{ ['--life-dur' as string]: '6.4s', ['--life-delay' as string]: '-1.3s' }}
      >
        {rank}
      </span>
      <span
        className="suit life-bob"
        style={{ ['--life-dur' as string]: '7.6s', ['--life-delay' as string]: '-4.2s' }}
      >
        {/* Two lives need two boxes — the bob above, the glow here */}
        <span
          className="life-glow"
          style={{ ['--life-dur' as string]: '4.4s', ['--life-delay' as string]: '-2.1s' }}
        >
          {suit}
        </span>
      </span>
    </div>
  )
}
