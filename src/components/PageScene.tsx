import { useEffect, useId, useRef, useState } from 'react'
import type { CSSProperties, RefObject } from 'react'
import { PAGE_SCENES, sceneArtwork } from '../lib/pageScenes'
import type { PageSceneId } from '../lib/pageScenes'
import type { SceneImage } from '../effects/pageSceneImage'

type Playback = 'playing' | 'paused' | 'offscreen' | 'hidden' | 'reduced'
export function useScenePlayback(ref: RefObject<Element>, paused: boolean): Playback {
  const [visible,setVisible]=useState(false)
  const [hidden,setHidden]=useState(()=>document.hidden)
  const [reduced,setReduced]=useState(()=>matchMedia('(prefers-reduced-motion: reduce)').matches)
  useEffect(()=>{
    const media=matchMedia('(prefers-reduced-motion: reduce)')
    const motion=()=>setReduced(media.matches),visibility=()=>setHidden(document.hidden)
    const observer=new IntersectionObserver(([entry])=>setVisible(entry.isIntersecting),{threshold:0})
    if(ref.current)observer.observe(ref.current)
    media.addEventListener('change',motion);document.addEventListener('visibilitychange',visibility)
    return()=>{observer.disconnect();media.removeEventListener('change',motion);document.removeEventListener('visibilitychange',visibility)}
  },[ref])
  return reduced?'reduced':paused?'paused':hidden?'hidden':visible?'playing':'offscreen'
}

declare global {interface Window {__pageScene?: {renderAt:(time:number,x?:number,y?:number)=>void;resume:()=>void;snapshot:()=>unknown}}}

export default function PageScene({id,paused,onToggle,className=''}:{id:PageSceneId;paused:boolean;onToggle:()=>void;className?:string}) {
  const ref=useRef<HTMLElement>(null),stage=useRef<HTMLDivElement>(null),canvas=useRef<HTMLCanvasElement>(null)
  const playback=useScenePlayback(ref,paused)
  const current=useRef(playback);current.current=playback
  const sync=useRef<()=>void>(()=>{})
  const [renderer,setRenderer]=useState<'loading'|'webgl2'|'fallback'>('loading')
  const labelId=useId(),scene=PAGE_SCENES[id]

  useEffect(()=>{
    const host=ref.current!,box=stage.current!,el=canvas.current!
    let alive=true,world:SceneImage|null=null,raf=0,last=0,time=0,frames=0,manual=false,initializing=false,failed=false
    let x=0,y=0,tx=0,ty=0,pointer=false,cx=0,cy=0
    let bounds=box.getBoundingClientRect()
    const fine=matchMedia('(hover:hover) and (pointer:fine)')
    const state=()=>{host.dataset.playback=failed?'fallback':world?current.current:'loading'}
    const stop=()=>{cancelAnimationFrame(raf);raf=0;last=0}
    const paint=()=>{
      if(!world)return
      world.draw(time,x,y);frames++
      if(import.meta.env.DEV){el.dataset.frames=String(frames);el.dataset.time=time.toFixed(4);el.dataset.pointer=`${x.toFixed(4)},${y.toFixed(4)}`}
    }
    const tick=(now:number)=>{
      raf=0
      if(!alive||!world||failed||current.current!=='playing'||manual){last=0;return}
      const dt=last?Math.min(.05,(now-last)/1000):0;last=now;time+=dt
      // Exact exponential damping: fast reversals retarget the existing camera.
      const ease=1-Math.exp(-9*dt)
      x+=(tx-x)*ease;y+=(ty-y)*ease
      paint();raf=requestAnimationFrame(tick)
    }
    const update=()=>{
      stop();state()
      if(!world||failed)return
      if(current.current==='reduced'){time=0;x=y=tx=ty=0;pointer=false;paint()}
      else if(current.current==='playing'&&!manual)raf=requestAnimationFrame(tick)
    }
    sync.current=update
    const resize=()=>{bounds=box.getBoundingClientRect();world?.resize(bounds.width,bounds.height)}
    const pointerMove=(e:PointerEvent)=>{
      if(!fine.matches||e.pointerType==='touch'||current.current!=='playing')return
      pointer=true;cx=e.clientX;cy=e.clientY
      // Read geometry on entry/scroll/resize, never interleave frame writes.
      tx=Math.max(-1,Math.min(1,(e.clientX-bounds.left)/bounds.width*2-1))
      ty=Math.max(-1,Math.min(1,(e.clientY-bounds.top)/bounds.height*2-1))
    }
    const enter=(e:PointerEvent)=>{bounds=box.getBoundingClientRect();pointerMove(e)}
    const leave=()=>{pointer=false;tx=ty=0}
    const scroll=()=>{if(pointer){bounds=box.getBoundingClientRect();if(cx<bounds.left||cx>bounds.right||cy<bounds.top||cy>bounds.bottom)leave();else{tx=(cx-bounds.left)/bounds.width*2-1;ty=(cy-bounds.top)/bounds.height*2-1}}}
    const loss=(e:Event)=>{
      e.preventDefault();failed=true;stop()
      // Release the old handles while the context is lost. Deleting them after
      // restoration produces INVALID_OPERATION on the newly restored context.
      world?.dispose();world=null
      setRenderer('fallback');host.dataset.playback='fallback'
    }
    const initialize=async()=>{
      if(initializing||world||!alive)return;initializing=true
      try{
        const {createPageSceneImage}=await import('../effects/pageSceneImage')
        if(!alive)return
        const loaded=await createPageSceneImage(el,id,sceneArtwork(id))
        if(!alive){loaded.dispose();return}
        world=loaded;failed=false;resize();paint();setRenderer('webgl2');update()
      }catch(error){console.warn('Scene retains its generated still:',error);if(alive){failed=true;setRenderer('fallback');host.dataset.playback='fallback'}}
      finally{initializing=false}
    }
    const restore=()=>{failed=false;setRenderer('loading');void initialize()}
    const near=new IntersectionObserver(([entry])=>{if(entry.isIntersecting){void initialize();near.disconnect()}},{rootMargin:'240px'})
    near.observe(box)
    const ro=new ResizeObserver(resize);ro.observe(box)
    box.addEventListener('pointerenter',enter,{passive:true});box.addEventListener('pointermove',pointerMove,{passive:true})
    box.addEventListener('pointerleave',leave);box.addEventListener('pointercancel',leave)
    window.addEventListener('scroll',scroll,{passive:true});window.addEventListener('blur',leave)
    el.addEventListener('webglcontextlost',loss);el.addEventListener('webglcontextrestored',restore)
    const dev={
      renderAt(t:number,px=0,py=0){stop();manual=true;time=Math.max(0,t);x=Math.max(-1,Math.min(1,px));y=Math.max(-1,Math.min(1,py));paint()},
      resume(){manual=false;update()},
      snapshot:()=>({time,x,y,tx,ty,frames,pointer,playback:current.current,ready:!!world,stats:world?.stats()}),
    }
    if(import.meta.env.DEV)window.__pageScene=dev
    return()=>{alive=false;stop();near.disconnect();ro.disconnect();world?.dispose();sync.current=()=>{};box.removeEventListener('pointerenter',enter);box.removeEventListener('pointermove',pointerMove);box.removeEventListener('pointerleave',leave);box.removeEventListener('pointercancel',leave);window.removeEventListener('scroll',scroll);window.removeEventListener('blur',leave);el.removeEventListener('webglcontextlost',loss);el.removeEventListener('webglcontextrestored',restore);if(window.__pageScene===dev)delete window.__pageScene}
  },[id])
  useEffect(()=>sync.current(),[playback])
  const state=renderer==='fallback'?'fallback':renderer==='loading'?'loading':playback
  const still=playback==='reduced'
  return <figure ref={ref} className={`page-scene ${className}`} data-scene={id} data-renderer={renderer} data-playback={state} aria-labelledby={labelId} style={{'--scene-position':scene.position} as CSSProperties}>
    <div ref={stage} className="page-scene__window" role="img" aria-label={scene.description}>
      <div className="page-scene__fallback" aria-hidden="true" />
      <img className="page-scene__poster" src={sceneArtwork(id)} onError={e=>{const img=e.currentTarget;if(!img.dataset.fallback){img.dataset.fallback='true';img.src=`/assets/page-scenes/${id}/0.webp`}}} alt="" decoding="async" width={id==='events'?1536:1024} height={id==='events'?1024:1536} />
      <canvas ref={canvas} className="page-scene__canvas" aria-hidden="true" />
    </div>
    <figcaption className="page-scene__caption"><span id={labelId}>{scene.label}</span><button type="button" onClick={onToggle} disabled={still} aria-pressed={paused||still} aria-label={still?'Scene animation is static':paused?'Resume scene animation':'Pause scene animation'}><span aria-hidden="true">{still?'—':paused?'▷':'Ⅱ'}</span> {still?'Still':paused?'Resume':'Pause'}</button></figcaption>
  </figure>
}
