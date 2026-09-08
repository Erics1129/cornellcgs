import './scopedMotion.css'

// Keep the content-facing vocabulary; design now styles accents instead of
// repeatedly replacing, splitting or blurring the words the visitor is reading.
export type HeadingDesign = 'flip' | 'scramble' | 'ticker' | 'wave' | 'weight' | 'outline' | 'glitch' | 'tilt' | 'converge' | 'typed'
export type BodyDesign = 'shimmer' | 'glow' | 'underline' | 'focus' | 'typed'

interface HeadingProps {
  text: string
  alt?: string
  className?: string
  as?: 'h1' | 'h2' | 'h3'
  caret?: string
}

export function LiveHeading({ design, text, alt, className = '', as: Tag = 'h2' }: HeadingProps & { design: HeadingDesign }) {
  return (
    <Tag className={`cgs-live-heading ${className}`} data-word-design={design} aria-label={text}>
      <span className="cgs-live-primary">{text}</span>
      {alt && alt !== text && <span className="cgs-live-alt">{alt}</span>}
    </Tag>
  )
}

export function LiveBody({ design, text, className = '' }: {
  design: BodyDesign
  text: string
  className?: string
  index?: number
  caret?: string
}) {
  return <p className={`cgs-live-body ${className}`} data-word-design={design}>{text}</p>
}
