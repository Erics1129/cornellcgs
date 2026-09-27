import { useEffect, useId, useRef, useState } from 'react'
import type { CSSProperties, RefObject } from 'react'
import { PAGE_SCENES, sceneArtwork, sceneFilm } from '../lib/pageScenes'
import type { PageSceneId } from '../lib/pageScenes'

type Playback = 'playing' | 'paused' | 'offscreen' | 'hidden' | 'reduced'
export function useScenePlayback(ref: RefObject<Element>, paused: boolean): Playback {
  const [visible,setVisible]=useState(false)
  const [hidden,setHidden]=useState(()=>document.hidden)
  const [reduced,setReduced]=useState(()=>matchMedia('(prefers-reduced-motion: reduce)').matches)
  useEffect(()=>{
    const media=matchMedia('(prefers-reduced-motion: reduce)')
    const motion=()=>setReduced(media.matches),visibility=()=>setHidden(document.hidden)
    const observer=new IntersectionObserver(([entry])=>setVisible(entry.isIntersecting&&entry.intersectionRatio>=.1),{threshold:[0,.1]})
    if(ref.current)observer.observe(ref.current)
    media.addEventListener('change',motion);document.addEventListener('visibilitychange',visibility)
    return()=>{observer.disconnect();media.removeEventListener('change',motion);document.removeEventListener('visibilitychange',visibility)}
  },[ref])
  return reduced?'reduced':paused?'paused':hidden?'hidden':visible?'playing':'offscreen'
}

declare global {interface Window {__pageScene?: {renderAt:(time:number,x?:number,y?:number)=>void;resume:()=>void;snapshot:()=>unknown}}}
type MediaNavigator = Navigator & {deviceMemory?:number;connection?:{saveData?:boolean}}

/** A real object-animation film. Scrolling takes over its playhead; release
 * resumes from that exact pose. A single hardware decoder owns playback. */
export default function PageScene({id,paused,onToggle,className=''}:{id:PageSceneId;paused:boolean;onToggle:()=>void;className?:string}) {
  const ref=useRef<HTMLElement>(null),stage=useRef<HTMLDivElement>(null),video=useRef<HTMLVideoElement>(null)
  const playback=useScenePlayback(stage,paused),current=useRef(playback);current.current=playback
  const sync=useRef<()=>void>(()=>{}),labelId=useId(),scene=PAGE_SCENES[id]
  const [renderer,setRenderer]=useState<'loading'|'video'|'fallback'>('loading')

  useEffect(()=>{
    const host=ref.current!,box=stage.current!,film=video.current!
    const nav=navigator as MediaNavigator, fine=matchMedia('(hover:hover) and (pointer:fine)')
    const compact=matchMedia('(max-width:767px)').matches||nav.connection?.saveData===true||(nav.deviceMemory!==undefined&&nav.deviceMemory<=4)
    // Select one stream once, before requesting media. Never download all tiers.
    const physicalWidth=box.clientWidth*Math.min(devicePixelRatio||1,2)
    const quality=compact?'mobile':physicalWidth>1100?'4k':'1080'
    let alive=true,attached=false,ready=false,failed=false,manual=false,pending=false,playRequest=0
    let scrubbing=false,settling=false,target=0,raf=0,last=0,lastScroll=window.scrollY,resumeTimer=0
    let x=0,y=0,tx=0,ty=0,bounds=box.getBoundingClientRect(),lastSeek=0
    const moving=()=>alive&&current.current==='playing'&&!manual&&!failed
    const wrap=(t:number)=>{const duration=Number.isFinite(film.duration)&&film.duration>0?film.duration:8;return ((t%duration)+duration)%duration}
    const seekTarget=()=>Math.max(0,Math.min(film.duration-.035,target))
    const stop=()=>{++playRequest;pending=false;film.pause()}
    const paint=()=>{film.style.transform=`translate3d(${x.toFixed(3)}px,${y.toFixed(3)}px,0)`}
    const seek=()=>{
      if(!ready||film.seeking||Math.abs(film.currentTime-seekTarget())<1/60)return
      const now=performance.now();if(now-lastSeek<32)return
      lastSeek=now;film.currentTime=seekTarget()
    }
    const tick=(now:number)=>{
      raf=0;if(!alive)return
      if(!moving()){last=0;return}
      const dt=last?Math.min(.05,(now-last)/1000):1/60;last=now
      const ease=1-Math.exp(-11*dt);x+=(tx-x)*ease;y+=(ty-y)*ease;paint()
      if(scrubbing){seek();finishScrub()}
      if(scrubbing||Math.abs(tx-x)+Math.abs(ty-y)>.015)raf=requestAnimationFrame(tick)
      else last=0
    }
    const request=()=>{if(!raf&&moving())raf=requestAnimationFrame(tick)}
    const status=()=>{host.dataset.playback=failed?'fallback':current.current!=='playing'?current.current:!ready?'loading':scrubbing?'scrubbing':'playing'}
    const play=()=>{
      if(!moving()||scrubbing||pending||!film.paused)return
      pending=true;const token=++playRequest
      film.play().then(()=>{if(!alive||token!==playRequest){if(!moving())film.pause();return}pending=false;status()}).catch(error=>{
        if(token!==playRequest||!alive)return
        pending=false
        if(error?.name!=='AbortError'){host.dataset.playback='blocked';setRenderer('fallback')}
      })
    }
    const finishScrub=()=>{
      if(!settling||!scrubbing||!moving()||film.seeking||Math.abs(film.currentTime-seekTarget())>=1/60)return
      // The newest target is decoded. Only now hand the playhead back to video.
      scrubbing=false;settling=false;status();play()
    }
    const update=()=>{
      lastScroll=window.scrollY;status()
      if(!moving()){
        stop();clearTimeout(resumeTimer);resumeTimer=0;scrubbing=false;settling=false
        cancelAnimationFrame(raf);raf=0;last=0;tx=ty=x=y=0;paint();status();return
      }
      if(!attached){attached=true;film.src=sceneFilm(id,quality);film.load()}
      play()
    }
    sync.current=update
    film.muted=true;film.defaultMuted=true;host.dataset.quality=quality
    const onReady=()=>{ready=true;failed=false;setRenderer('video');status();if(manual){film.currentTime=Math.min(target,film.duration-.035)}else if(scrubbing){seek();request()}else update()}
    const onError=()=>{if(!attached||!alive)return;failed=true;stop();setRenderer('fallback');status()}
    const onPlaying=()=>{if(!moving()||scrubbing)stop();else{ready=true;setRenderer('video');status()}}
    const onSeeked=()=>{if(scrubbing){finishScrub();request()}}
    const onScroll=()=>{
      const now=window.scrollY,delta=now-lastScroll;lastScroll=now
      bounds=box.getBoundingClientRect()
      if(!moving()||!ready||Math.abs(delta)<.1||bounds.bottom<=0||bounds.top>=innerHeight)return
      if(!scrubbing){target=film.currentTime;scrubbing=true;stop()}
      settling=false
      target=wrap(target+delta/Math.max(520,innerHeight)*5.5)
      status();seek();request();clearTimeout(resumeTimer)
      resumeTimer=window.setTimeout(()=>{
        resumeTimer=0;if(!moving())return
        // A previous seek can still be decoding. Keep applying the newest
        // target, and let seeked/frame completion perform the playback handoff.
        settling=true;seek();finishScrub();request()
      },220)
    }
    const pointer=(event:PointerEvent)=>{
      if(!moving()||!fine.matches||event.pointerType==='touch')return
      tx=-9*Math.max(-1,Math.min(1,(event.clientX-bounds.left)/Math.max(1,bounds.width)*2-1))
      ty=-7*Math.max(-1,Math.min(1,(event.clientY-bounds.top)/Math.max(1,bounds.height)*2-1));request()
    }
    const enter=(event:PointerEvent)=>{bounds=box.getBoundingClientRect();pointer(event)}
    const leave=()=>{tx=ty=0;request()}
    const resize=()=>{bounds=box.getBoundingClientRect();lastScroll=window.scrollY}
    const ro=new ResizeObserver(resize);ro.observe(box)
    film.addEventListener('loadeddata',onReady);film.addEventListener('error',onError);film.addEventListener('playing',onPlaying);film.addEventListener('seeked',onSeeked)
    box.addEventListener('pointerenter',enter);box.addEventListener('pointermove',pointer,{passive:true});box.addEventListener('pointerleave',leave);box.addEventListener('pointercancel',leave)
    window.addEventListener('scroll',onScroll,{passive:true});window.addEventListener('blur',leave)
    const dev={renderAt(t:number,px=0,py=0){manual=true;stop();clearTimeout(resumeTimer);scrubbing=false;settling=false;cancelAnimationFrame(raf);raf=0;target=wrap(t);if(ready)film.currentTime=seekTarget();x=-9*Math.max(-1,Math.min(1,px));y=-7*Math.max(-1,Math.min(1,py));paint()},resume(){manual=false;update()},snapshot:()=>({time:film.currentTime,target,x,y,ready,playback:host.dataset.playback,stats:{source:film.currentSrc,width:film.videoWidth,height:film.videoHeight,quality,period:film.duration,renderer:'native-video',textures:0}})}
    if(import.meta.env.DEV)window.__pageScene=dev
    update()
    return()=>{alive=false;stop();clearTimeout(resumeTimer);cancelAnimationFrame(raf);ro.disconnect();sync.current=()=>{};film.removeEventListener('loadeddata',onReady);film.removeEventListener('error',onError);film.removeEventListener('playing',onPlaying);film.removeEventListener('seeked',onSeeked);box.removeEventListener('pointerenter',enter);box.removeEventListener('pointermove',pointer);box.removeEventListener('pointerleave',leave);box.removeEventListener('pointercancel',leave);window.removeEventListener('scroll',onScroll);window.removeEventListener('blur',leave);film.removeAttribute('src');film.load();if(window.__pageScene===dev)delete window.__pageScene}
  },[id])
  useEffect(()=>sync.current(),[playback])
  const still=playback==='reduced'
  return <figure ref={ref} className={`page-scene ${className}`} data-scene={id} data-renderer={renderer} aria-labelledby={labelId} style={{'--scene-position':scene.position} as CSSProperties}>
    <div ref={stage} className="page-scene__window" role="img" aria-label={scene.description}>
      <div className="page-scene__fallback" aria-hidden="true" />
      <img className="page-scene__poster" src={sceneArtwork(id)} onError={e=>{const img=e.currentTarget;if(!img.dataset.fallback){img.dataset.fallback='true';img.src=`/assets/page-scenes/${id}/cinematic-v2.webp`}}} alt="" decoding="async" />
      <video ref={video} className="page-scene__film" muted loop playsInline preload="none" disablePictureInPicture disableRemotePlayback tabIndex={-1} aria-hidden="true" />
    </div>
    <figcaption className="page-scene__caption"><span id={labelId}>{scene.label}{id==='world'&&<> · <a href="https://science.nasa.gov/earth/earth-observatory/blue-marble-next-generation/" target="_blank" rel="noreferrer">NASA imagery ↗</a></>}</span><button type="button" onClick={onToggle} disabled={still} aria-pressed={paused||still} aria-label={still?'Scene animation is static':paused?'Resume scene animation':'Pause scene animation'}><span aria-hidden="true">{still?'—':paused?'▷':'Ⅱ'}</span> {still?'Still':paused?'Resume':'Pause'}</button></figcaption>
  </figure>
}
