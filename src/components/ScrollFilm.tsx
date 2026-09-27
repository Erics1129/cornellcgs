import { useEffect, useRef } from 'react'
import gsap from 'gsap'
import { ScrollTrigger } from 'gsap/ScrollTrigger'

gsap.registerPlugin(ScrollTrigger)

/** Decode real captured/rendered frames. Scroll is the only playback clock. */
export default function ScrollFilm({src,poster}:{src:string;poster:string}) {
  const root=useRef<HTMLDivElement>(null),video=useRef<HTMLVideoElement>(null)
  useEffect(()=>{
    const host=root.current!,film=video.current!,section=host.closest('section')!
    host.dataset.ready='false'
    const media=matchMedia('(prefers-reduced-motion: reduce)')
    let alive=true,near=false,loaded=false,target=0,raf=0,last=0
    const seek=()=>{
      raf=0
      if(!alive||!near||document.hidden||media.matches||!loaded)return
      const now=performance.now()
      if(!film.seeking&&now-last>=30&&Math.abs(film.currentTime-target)>1/60){film.currentTime=target;last=now}
      if(film.seeking||Math.abs(film.currentTime-target)>1/60)raf=requestAnimationFrame(seek)
    }
    const request=()=>{if(!raf&&alive&&near&&!document.hidden&&!media.matches)raf=requestAnimationFrame(seek)}
    const trigger=ScrollTrigger.create({trigger:section,start:'top top',end:'bottom bottom',onUpdate:self=>{
      const duration=Number.isFinite(film.duration)?film.duration:8
      target=(Math.max(0,duration-.05))*self.progress
      request()
    }})
    const ready=()=>{loaded=true;target=(film.duration-.05)*trigger.progress;host.dataset.ready=String(!media.matches);request()}
    const error=()=>{loaded=false;host.dataset.ready='false';cancelAnimationFrame(raf);raf=0}
    const observer=new IntersectionObserver(([entry])=>{
      near=entry.isIntersecting
      if(near&&!film.src&&!media.matches){film.src=src;film.load()}
      if(near)request();else{cancelAnimationFrame(raf);raf=0}
    },{rootMargin:'30% 0px'})
    observer.observe(host)
    const preference=()=>{if(media.matches){cancelAnimationFrame(raf);raf=0;film.pause();host.dataset.ready='false'}else{if(near&&!film.src){film.src=src;film.load()}host.dataset.ready=String(loaded);request()}}
    const visibility=()=>{if(document.hidden){cancelAnimationFrame(raf);raf=0}else request()}
    const stopPlay=()=>film.pause()
    film.addEventListener('loadeddata',ready);film.addEventListener('error',error);film.addEventListener('seeked',request)
    film.addEventListener('play',stopPlay);media.addEventListener('change',preference);document.addEventListener('visibilitychange',visibility)
    return()=>{alive=false;host.dataset.ready='false';cancelAnimationFrame(raf);observer.disconnect();trigger.kill();film.removeEventListener('loadeddata',ready);film.removeEventListener('error',error);film.removeEventListener('seeked',request);film.removeEventListener('play',stopPlay);media.removeEventListener('change',preference);document.removeEventListener('visibilitychange',visibility);film.removeAttribute('src');film.load()}
  },[src])
  return <div ref={root} className="scroll-film" aria-hidden="true"><img src={poster} alt="" loading="lazy" decoding="async" /><video ref={video} muted playsInline preload="none" disablePictureInPicture tabIndex={-1} /></div>
}
