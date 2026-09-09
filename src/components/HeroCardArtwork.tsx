import { useId } from 'react'

/** Vector engraving stays sharp through a 3D turn on Retina displays. */
export default function HeroCardArtwork({ side }: { side: 'ace' | 'back' }) {
  const id = useId().replace(/[^a-zA-Z0-9]/g, '')
  const spade = 'M180 134C159 166 105 187 105 225C105 264 149 274 172 249C171 271 163 282 154 291H206C197 282 189 271 188 249C211 274 255 264 255 225C255 187 201 166 180 134Z'
  return <svg className="poker-artwork" viewBox="0 0 360 504" fill="none" aria-hidden="true">
    <defs>
      <linearGradient id={`${id}foil`} x1="65" y1="80" x2="286" y2="420" gradientUnits="userSpaceOnUse">
        <stop stopColor="var(--poker-foil)" /><stop offset=".36" stopColor="var(--poker-accent)" /><stop offset=".67" stopColor="var(--poker-second)" /><stop offset="1" stopColor="var(--poker-foil)" />
      </linearGradient>
      <linearGradient id={`${id}edge`} x1="12" y1="12" x2="340" y2="495" gradientUnits="userSpaceOnUse">
        <stop stopColor="var(--poker-foil)" stopOpacity=".8" /><stop offset=".32" stopColor="var(--poker-accent)" stopOpacity=".3" /><stop offset=".65" stopColor="var(--poker-second)" stopOpacity=".8" /><stop offset="1" stopColor="var(--poker-accent)" stopOpacity=".6" />
      </linearGradient>
      <pattern id={`${id}mesh`} width="24" height="24" patternUnits="userSpaceOnUse">
        <path d="M0 24 24 0M-6 6 6-6M18 30 30 18" stroke="var(--poker-accent)" strokeOpacity=".085" strokeWidth=".55" />
        <circle cx="12" cy="12" r=".7" fill="var(--poker-foil)" fillOpacity=".14" />
      </pattern>
      <clipPath id={`${id}spade`}><path d={spade} /></clipPath>
    </defs>
    <rect x="12" y="12" width="336" height="480" rx="18" stroke={`url(#${id}edge)`} strokeWidth="1.2" />
    <rect x="19" y="19" width="322" height="466" rx="12" stroke="var(--poker-accent)" strokeOpacity=".22" strokeWidth=".6" />
    <rect x="25" y="25" width="310" height="454" rx="8" fill={`url(#${id}mesh)`} />
    {side === 'ace' ? <>
      <g fill="var(--poker-foil)" className="poker-rank">
        <text x="39" y="64">A</text><text x="42" y="88" fontSize="22">♠</text>
        <g transform="rotate(180 180 252)"><text x="39" y="64">A</text><text x="42" y="88" fontSize="22">♠</text></g>
      </g>
      <path d="M91 121h55l34-31 34 31h55M91 337h55l34 31 34-31h55" stroke="var(--poker-accent)" strokeOpacity=".27" strokeWidth=".8" />
      <path d={spade} fill={`url(#${id}foil)`} />
      <g clipPath={`url(#${id}spade)`} stroke="var(--poker-face)" strokeWidth="1.3" opacity=".6">
        <path d="M125 173v58l23 23v54m-2-160v63l24 24v82m14-181v175m18-154v52l22 22v63m8-103v37l18 18" />
        <circle cx="125" cy="230" r="3.2" /><circle cx="146" cy="211" r="3.2" /><circle cx="202" cy="202" r="3.2" /><circle cx="184" cy="179" r="3.2" />
      </g>
      <path d={spade} stroke="var(--poker-foil)" strokeOpacity=".6" strokeWidth=".65" />
      <text x="180" y="410" textAnchor="middle" className="poker-signature" fill="var(--poker-foil)">CORNELL CGS</text>
      <path d="M133 428h32m30 0h32" stroke="var(--poker-accent)" strokeOpacity=".7" /><circle cx="180" cy="428" r="2" fill="var(--poker-accent)" />
    </> : <>
      <g stroke="var(--poker-accent)" strokeWidth=".65" opacity=".27">
        {Array.from({ length: 17 }, (_, i) => <path key={i} d={`M${43+i*7} 57Q${295-i*4} 126 ${317-i*7} 252Q${65+i*4} 377 ${43+i*7} 447M${317-i*7} 57Q${65+i*4} 126 ${43+i*7} 252Q${295-i*4} 377 ${317-i*7} 447`} />)}
      </g>
      <path d="m180 138 83 114-83 114-83-114Z" fill="var(--poker-face)" stroke={`url(#${id}foil)`} strokeWidth="1.3" />
      <path d="m180 149 74 103-74 103-74-103Z" stroke="var(--poker-accent)" strokeOpacity=".32" strokeWidth=".6" />
      <text x="180" y="266" textAnchor="middle" className="poker-monogram" fill={`url(#${id}foil)`}>CGS</text>
      <path d="M170 212h20M170 287h20" stroke="var(--poker-accent)" strokeOpacity=".8" />
      {[64,440].map(y => <g key={y} transform={`translate(180 ${y})`}><path d="m0-7 7 7-7 7-7-7Z" stroke="var(--poker-foil)" strokeOpacity=".7" /><circle r="2" fill="var(--poker-accent)" /></g>)}
    </>}
    <path d="M12 65V31q0-19 19-19h34M348 439v34q0 19-19 19h-34" stroke="var(--poker-foil)" strokeWidth="1.6" strokeLinecap="round" />
  </svg>
}
