import { useEffect, useLayoutEffect, useRef, useState, type CSSProperties } from 'react'
import './dice.css'
const POSTER = '/assets/brand/voxel-cube.webp'
const MOTION = '/assets/brand/voxel-cube-motion.webp'

/** Shared CGS identity: independently animated metallic blocks rendered in 3D. */
export default function Dice({ size = 28, className = '', paused = false }: {
  size?: number; className?: string; paused?: boolean
}) {
  const root = useRef<HTMLSpanElement>(null)
  const [playing, setPlaying] = useState(false)
  const [failed, setFailed] = useState(false)
  const [ready, setReady] = useState(false)
  useEffect(() => {
    const mark = root.current!
    const motion = matchMedia('(prefers-reduced-motion: reduce)')
    const connection = (navigator as Navigator & { connection?: { saveData?: boolean } }).connection
    let visible = false
    const sync = () => {
      const active = visible && !document.hidden && !motion.matches && !connection?.saveData && !paused
      mark.dataset.motion = motion.matches ? 'reduced' : active ? 'running' : 'paused'
      setPlaying(active)
    }
    const observer = new IntersectionObserver(([entry]) => { visible = entry.isIntersecting; sync() })
    observer.observe(mark)
    motion.addEventListener('change', sync); document.addEventListener('visibilitychange', sync); sync()
    return () => { observer.disconnect(); motion.removeEventListener('change', sync); document.removeEventListener('visibilitychange', sync) }
  }, [paused])
  const animated = playing && !failed
  const source = size <= 64 ? '/assets/brand/voxel-cube-motion-small.webp' : MOTION
  useLayoutEffect(() => setReady(false), [animated, source])
  return <span ref={root} aria-hidden="true" className={`cgs-brand-die cgs-voxel-mark ${className}`}
    data-motion="paused" data-ready={ready && animated} style={{ '--voxel-size': `${Number.isFinite(size) ? Math.max(0, size) : 28}px` } as CSSProperties}>
    <img className="cgs-voxel-poster" src={size <= 64 ? '/assets/brand/voxel-cube-small.webp' : POSTER} alt="" decoding="async" draggable={false} />
    {animated && <img className="cgs-voxel-motion" src={source} alt="" decoding="async" draggable={false}
      data-ready={ready} onLoad={() => setReady(true)} onError={() => setFailed(true)} />}
  </span>
}
