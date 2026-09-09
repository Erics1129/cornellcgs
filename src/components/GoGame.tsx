import { useEffect, useRef, useState, type RefObject } from 'react'
import { GO_SEED, GO_STEPS, goFrame, goPoint, type GoColor } from '../effects/goGame'
import { BOOTED_EVENT } from '../lib/motion'

type Projection = { clipMatrix: number[]; cameraRight: number[]; cameraUp: number[]; width: number; height: number; spriteWorldSize: number }
type Point = { x: number; y: number }

/** A real board position advances on a visible-only clock. Nothing is attached
 * to the page's global shake event; this camera can only move its own chapter. */
export default function GoGame({ camera, paused }: { camera: RefObject<HTMLDivElement | null>; paused: boolean }) {
  const host = useRef<HTMLDivElement>(null)
  const canvas = useRef<HTMLCanvasElement>(null)
  const pause = useRef(paused)
  pause.current = paused
  const [ready, setReady] = useState(false)

  useEffect(() => {
    const root = host.current, el = canvas.current, section = root?.closest('section')
    const ctx = el?.getContext('2d', { alpha: true })
    if (!root || !el || !section || !ctx) return
    const reduced = matchMedia('(prefers-reduced-motion: reduce)')
    const compact = matchMedia('(max-width:767px)')
    const cache = document.createElement('canvas'), cached = cache.getContext('2d')!
    const black = new Image(), white = new Image(), board = new Image()
    let projection: Projection | null = null, loaded = false, alive = true, started = false
    let raf = 0, last = 0, clock = 0, watched = false, width = 1, height = 1, dpr = 1
    let scale = 1, offsetX = 0, offsetY = 0, cachedKey = '', seenLanding = GO_SEED-1, seenCycle = 0
    let impactAt = -100, impacts = 0, frames = 0
    const abort = new AbortController()
    const nav = document.querySelector('.cgs-nav-panel')

    function clearImpact() {
      impactAt = -100
      if (camera.current) camera.current.style.removeProperty('transform')
      root!.dataset.impact = '0'
    }
    function isWatched() {
      if (document.hidden || nav?.getAttribute('data-open') === 'true') return false
      if (!(window as unknown as { __cgsShown?: boolean }).__cgsShown) return false
      // Read live geometry, not a potentially stale IntersectionObserver entry.
      const r = section!.getBoundingClientRect(), ceiling = Math.min(80, innerHeight*.10)
      const visible = Math.max(0, Math.min(r.bottom, innerHeight)-Math.max(r.top, ceiling))
      return visible / Math.min(r.height, innerHeight-ceiling) > .72 && r.top < innerHeight*.28 && r.bottom > innerHeight*.68
    }
    function stop() { cancelAnimationFrame(raf); raf = 0; last = 0; clearImpact() }
    function request() { if (alive && loaded && !raf) raf = requestAnimationFrame(tick) }
    function sync() {
      watched = isWatched()
      root!.dataset.playback = reduced.matches ? 'reduced' : pause.current ? 'paused' : watched ? 'playing' : 'offscreen'
      if (!watched || pause.current || reduced.matches) {
        stop()
        if (loaded && watched) draw()
      } else request()
    }
    function project(x: number, y: number, z: number): Point {
      const m = projection!.clipMatrix
      const divisor = m[12]*x + m[13]*y + m[14]*z + m[15]
      return {
        x: offsetX + ((m[0]*x+m[1]*y+m[2]*z+m[3])/divisor*.5+.5)*projection!.width*scale,
        y: offsetY + (.5-(m[4]*x+m[5]*y+m[6]*z+m[7])/divisor*.5)*projection!.height*scale,
      }
    }
    function resize() {
      const rect = root!.getBoundingClientRect()
      width = Math.max(1,rect.width); height = Math.max(1,rect.height)
      dpr = Math.min(devicePixelRatio||1, 1.6, 1680/width)
      el!.width = cache.width = Math.round(width*dpr); el!.height = cache.height = Math.round(height*dpr)
      const iw = projection?.width || 1536, ih = projection?.height || 1024
      scale = compact.matches ? Math.max(width/1250,height*.70/ih) : Math.max(width/iw,height/ih)
      offsetX = compact.matches ? width*.5-iw*scale*.68 : (width-iw*scale)*.65
      offsetY = compact.matches ? height*.68-ih*scale*.58 : (height-ih*scale)*.60
      root!.style.setProperty('--go-image-width', `${iw*scale}px`)
      root!.style.setProperty('--go-image-height', `${ih*scale}px`)
      root!.style.setProperty('--go-image-x', `${offsetX}px`)
      root!.style.setProperty('--go-image-y', `${offsetY}px`)
      cachedKey = ''
      if (loaded) draw()
      sync()
    }
    function stone(c: CanvasRenderingContext2D, at: number, color: GoColor, lift = 0, opacity = 1, tilt = 0) {
      const [gx,gy] = goPoint(at), x=gx*.42, y=gy*.42
      const ground = project(x,y,.224), vx=project(x+.24,y,.224), vy=project(x,y+.24,.224)
      c.save()
      c.transform(vx.x-ground.x,vx.y-ground.y,vy.x-ground.x,vy.y-ground.y,ground.x,ground.y)
      const shadow = c.createRadialGradient(.12,-.06,.08,.12,-.06,1.5+lift*.6)
      shadow.addColorStop(0,`rgba(0,0,0,${.65*opacity/(1+lift*2)})`); shadow.addColorStop(1,'rgba(0,0,0,0)')
      c.fillStyle=shadow; c.beginPath(); c.arc(.12,-.06,1.5+lift*.6,0,Math.PI*2); c.fill(); c.restore()
      const p=project(x,y,.308+lift), right=projection!.cameraRight, size=projection!.spriteWorldSize||.52
      const edge=project(x+right[0]*size,y+right[1]*size,.308+lift+right[2]*size)
      const pixels=Math.hypot(edge.x-p.x,edge.y-p.y)
      c.save(); c.globalAlpha=opacity; c.translate(p.x,p.y); c.rotate(tilt)
      c.drawImage(color===1?black:white,-pixels/2,-pixels/2,pixels,pixels); c.restore()
    }
    function ring(at: number, age: number) {
      if (age<0 || age>.78 || reduced.matches) return
      const [gx,gy]=goPoint(at), x=gx*.42, y=gy*.42
      for (const delay of [0,.09]) {
        const t=(age-delay)/.69
        if(t<0||t>1)continue
        const radius=.12+1.2*(1-Math.pow(1-t,2)), alpha=Math.pow(1-t,2)*.55
        ctx!.beginPath()
        for(let i=0;i<=56;i++){
          const a=i/56*Math.PI*2, p=project(x+Math.cos(a)*radius,y+Math.sin(a)*radius,.226)
          if(i===0)ctx!.moveTo(p.x,p.y);else ctx!.lineTo(p.x,p.y)
        }
        ctx!.strokeStyle=`rgba(175,208,255,${alpha})`;ctx!.lineWidth=delay? .65:1.4;ctx!.stroke()
      }
    }
    function draw() {
      if (!loaded || !projection) return
      const state=goFrame(clock,reduced.matches), key=`${state.last}-${state.cycle}-${width}-${height}`
      const current=GO_STEPS[state.last]
      if(cachedKey!==key){
        cached.setTransform(dpr,0,0,dpr,0,0);cached.clearRect(0,0,width,height)
        const occupied=Array.from(current.board.entries()).filter(([,color])=>color)
        occupied.sort(([a],[b])=>{const [ax,ay]=goPoint(a),[bx,by]=goPoint(b);return project(ax*.42,ay*.42,.308).y-project(bx*.42,by*.42,.308).y})
        for(const [at,color] of occupied)stone(cached,at,color as GoColor)
        cachedKey=key
      }
      ctx!.setTransform(dpr,0,0,dpr,0,0);ctx!.clearRect(0,0,width,height)
      ctx!.globalAlpha=state.alpha;ctx!.drawImage(cache,0,0,width,height)
      if(state.falling){
        const next=GO_STEPS[state.pending]
        const lift=.93*(1-state.drop*state.drop)
        stone(ctx!,next.at,next.color,lift,state.alpha*Math.min(1,state.drop*7),.065*(1-state.drop)*(next.color===1?1:-1))
      }
      if(state.contact<.24 && current.captured.length){
        for(const at of current.captured)stone(ctx!,at,current.color===1?2:1,state.contact*.5,1-state.contact/.24)
      }
      ring(current.at,state.contact)
      // A small mark identifies the most recent move after the shockwave settles.
      if(state.last>=GO_SEED && state.contact>.8){
        const [x,y]=current.move,p=project(x*.42,y*.42,.404)
        ctx!.beginPath();ctx!.arc(p.x,p.y,compact.matches?1.8:2.4,0,Math.PI*2)
        ctx!.fillStyle=current.color===1?'#b6d5ff':'#31496b';ctx!.fill()
      }
      ctx!.globalAlpha=1
      const elapsed=clock-impactAt, strength=elapsed>=0&&elapsed<.29 ? Math.exp(-elapsed*18)*Math.sin(elapsed*80) : 0
      if(camera.current){
        if(Math.abs(strength)>.003 && watched && !reduced.matches && !pause.current){
          const amount=compact.matches?1.25:2.5
          camera.current.style.transform=`translate3d(${strength*amount*.32}px,${strength*amount}px,0)`
        } else camera.current.style.removeProperty('transform')
      }
      root!.dataset.impact=String(Math.abs(strength)>.003&&watched&&!reduced.matches&&!pause.current?1:0)
      root!.dataset.moves=String(state.last+1)
      if(import.meta.env.DEV){root!.dataset.clock=clock.toFixed(3);root!.dataset.impacts=String(impacts);root!.dataset.frames=String(++frames);root!.dataset.contact=state.contact.toFixed(3)}
    }
    function tick(now: number){
      raf=0
      if(!alive||!loaded)return
      watched=isWatched()
      if(!watched||pause.current||reduced.matches){sync();return}
      root!.dataset.playback='playing'
      clock+=last?Math.min(.04,Math.max(0,(now-last)/1000)):0;last=now
      const frame=goFrame(clock)
      if(frame.cycle!==seenCycle){seenCycle=frame.cycle;seenLanding=GO_SEED-1;clearImpact()}
      if(frame.last>seenLanding){
        seenLanding=frame.last
        const move=GO_STEPS[frame.last], p=project(move.move[0]*.42,move.move[1]*.42,.308)
        const r=root!.getBoundingClientRect()
        // Only a just-landed stone actually inside the visible camera can shake.
        if(frame.contact<.08 && p.x>16&&p.x<width-16&&r.top+p.y>90&&r.top+p.y<innerHeight-20){impactAt=clock;impacts++}
      }
      draw();request()
    }
    async function load(){
      if(started)return
      started=true
      const loadImage=(image:HTMLImageElement,src:string)=>new Promise<void>((resolve,reject)=>{image.onload=()=>resolve();image.onerror=()=>reject(new Error('Go material unavailable'));image.src=src})
      try{
        const [data]=await Promise.all([
          fetch('/assets/scenes/go-play-projection.json',{signal:abort.signal}).then(r=>{if(!r.ok)throw new Error('Go projection unavailable');return r.json()}),
          loadImage(board,'/assets/scenes/go-play-board.webp'),loadImage(black,'/assets/scenes/go-play-black.webp'),loadImage(white,'/assets/scenes/go-play-white.webp'),
        ])
        if(!alive)return
        if(data.clipMatrix?.length!==16||!data.clipMatrix.every(Number.isFinite))throw new Error('Invalid Go projection')
        projection=data;loaded=true;setReady(true);resize();sync()
      }catch{if(alive)root!.dataset.playback='fallback'}
    }
    const io=new IntersectionObserver(entries=>{if(entries[0].isIntersecting)void load();sync()},{rootMargin:'100% 0px'})
    io.observe(section)
    const ro=new ResizeObserver(resize);ro.observe(root)
    const menuObserver=new MutationObserver(sync)
    if(nav)menuObserver.observe(nav,{attributes:true,attributeFilter:['data-open']})
    window.addEventListener('scroll',sync,{passive:true})
    window.addEventListener(BOOTED_EVENT,sync)
    window.addEventListener('pagehide',stop)
    window.addEventListener('pageshow',sync)
    document.addEventListener('visibilitychange',sync)
    reduced.addEventListener('change',resize)
    root.addEventListener('go-playback',sync)
    resize()
    return()=>{
      alive=false;stop();abort.abort();io.disconnect();ro.disconnect();menuObserver.disconnect()
      window.removeEventListener('scroll',sync);document.removeEventListener('visibilitychange',sync)
      window.removeEventListener(BOOTED_EVENT,sync);window.removeEventListener('pagehide',stop);window.removeEventListener('pageshow',sync)
      reduced.removeEventListener('change',resize);root.removeEventListener('go-playback',sync)
      for(const image of [board,black,white]){image.onload=null;image.onerror=null}
    }
  },[camera])
  useEffect(()=>{host.current?.dispatchEvent(new Event('go-playback'))},[paused])

  return <div ref={host} data-go-image className="go-play" data-ready={ready} data-playback="loading">
    <img className="go-play-fallback" src="/assets/scenes/go-study.webp" alt="" width="1536" height="1024" loading="lazy" decoding="async" />
    {ready&&<img className="go-play-board" src="/assets/scenes/go-play-board.webp" alt="" width="1536" height="1024" decoding="async" />}
    <canvas ref={canvas} className="go-play-stones" />
  </div>
}
