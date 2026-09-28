import { useEffect, useRef } from 'react'
import '../styles/glass-title.css'

/** The letter highlights borrow light from the existing city decoder. */
export default function GlassTitle() {
  const root = useRef<HTMLHeadingElement>(null)
  useEffect(() => {
    const title = root.current!
    const section = title.closest('section')!
    const video = section.querySelector<HTMLVideoElement>('.code-city__video')
    if (!video) return
    const canvas = document.createElement('canvas')
    canvas.width = 64; canvas.height = 36
    const context = canvas.getContext('2d', { willReadFrequently: true })
    if (!context) return
    const reduced = matchMedia('(prefers-reduced-motion: reduce)')
    let alive = true, visible = false, failed = false, frame = 0, timer = 0, last = 0
    let bounds = { left: .05, right: .4, top: .25, bottom: .7 }
    let colors = [[181, 215, 244], [217, 234, 250], [173, 203, 236]]
    let light = 48
    const measure = () => {
      const text = title.getBoundingClientRect(), view = video.getBoundingClientRect()
      const scale = Math.max(view.width / (video.videoWidth || 1920), view.height / (video.videoHeight || 1080))
      const width = (video.videoWidth || 1920) * scale, height = (video.videoHeight || 1080) * scale
      const left = view.left + (view.width - width) / 2, top = view.top + (view.height - height) / 2
      bounds = { left: (text.left - left) / width, right: (text.right - left) / width,
        top: (text.top - top) / height, bottom: (text.bottom - top) / height }
    }
    const active = () => alive && visible && !failed && !document.hidden && !reduced.matches && !video.paused && !video.ended
    const cancel = () => {
      if (frame) video.cancelVideoFrameCallback?.(frame)
      clearTimeout(timer); frame = timer = 0
    }
    const sample = () => {
      if (video.readyState < 2) return
      try {
        context.drawImage(video, 0, 0, 64, 36)
        const pixels = context.getImageData(0, 0, 64, 36).data
        const clamp = (value: number, max: number) => Math.max(0, Math.min(max, Math.floor(value)))
        const x0 = clamp(bounds.left * 64, 63), x1 = Math.max(x0 + 1, clamp(bounds.right * 64, 64))
        const y0 = clamp(bounds.top * 36, 35), y1 = Math.max(y0 + 1, clamp(bounds.bottom * 36, 36))
        let weightedX = 0, weight = 0
        const bands = [[0, 0, 0, 0], [0, 0, 0, 0], [0, 0, 0, 0]]
        for (let y = y0; y < y1; y++) for (let x = x0; x < x1; x++) {
          const offset = (y * 64 + x) * 4
          const band = bands[Math.min(2, Math.floor((y - y0) / (y1 - y0) * 3))]
          const luminance = pixels[offset] * .21 + pixels[offset + 1] * .72 + pixels[offset + 2] * .07
          const influence = 1 + luminance / 32
          for (let c = 0; c < 3; c++) band[c] += pixels[offset + c] * influence
          band[3] += influence
          weightedX += (x - x0) / Math.max(1, x1 - x0) * luminance; weight += luminance
        }
        colors = bands.map((band, i) => {
          const rgb = band.slice(0, 3).map(channel => channel / Math.max(1, band[3]))
          const peak = Math.max(1, ...rgb)
          const next = rgb.map((channel, c) => colors[i][c] * .6 + (137 + 118 * channel / peak) * .4)
          title.style.setProperty(`--glass-${i}`, `rgb(${next.map(Math.round).join(' ')})`)
          return next
        })
        light = light * .7 + (32 + 34 * weightedX / Math.max(1, weight)) * .3
        title.style.setProperty('--glass-light', `${light.toFixed(2)}%`)
        title.dataset.reflection = video.currentTime.toFixed(2)
      } catch {
        // The readable pearlescent CSS finish also covers unavailable media.
        failed = true; cancel()
      }
    }
    const tick = (now: number) => {
      frame = timer = 0
      if (!active()) return
      if (now - last >= 160) { sample(); last = now }
      schedule()
    }
    const schedule = () => {
      if (!active() || frame || timer) return
      if ('requestVideoFrameCallback' in video) frame = video.requestVideoFrameCallback(tick)
      else timer = window.setTimeout(() => tick(performance.now()), 170)
    }
    const sync = () => {
      if (!active()) cancel()
      else schedule()
      title.dataset.glassMotion = active() ? 'running' : 'paused'
    }
    const resize = new ResizeObserver(measure); resize.observe(title); resize.observe(video)
    const intersection = new IntersectionObserver(([entry]) => { visible = entry.isIntersecting; measure(); sync() })
    intersection.observe(title)
    video.addEventListener('playing', sync); video.addEventListener('pause', sync)
    video.addEventListener('loadedmetadata', measure)
    document.addEventListener('visibilitychange', sync); reduced.addEventListener('change', sync)
    measure(); sync()
    return () => {
      alive = false; cancel(); resize.disconnect(); intersection.disconnect()
      video.removeEventListener('playing', sync); video.removeEventListener('pause', sync)
      video.removeEventListener('loadedmetadata', measure)
      document.removeEventListener('visibilitychange', sync); reduced.removeEventListener('change', sync)
    }
  }, [])
  return <h1 ref={root} className="hero-glass-title font-display pointer-events-auto text-[clamp(2.5rem,4.8vw,5.4rem)] md:text-[min(14.8cqw,5.4rem)] leading-[0.98] tracking-[-0.028em]">
    <span data-hero-line className="hero-glass-line"><span className="hero-glass-ink">Cornell</span></span>
    <span data-hero-line className="hero-glass-line"><span className="hero-glass-ink">Computational</span></span>
    <span data-hero-line className="hero-glass-line"><span className="hero-glass-ink">Game <em>Society</em></span></span>
  </h1>
}
