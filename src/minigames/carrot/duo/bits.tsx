// Small shared pieces of the duo screens: avatars, meters, the connection chip, the camera switch, the mirrored mini-map, the toast
// stack, the aria-live regions, the countdown clock and the banner stack. Everything is scoped under .ct-duo (duo.css).
import { useEffect, useState } from 'react'
import type { ReactNode } from 'react'
import type { DuoController } from './useDuo'
import { useDuoSlice, useDuoUi } from './useDuo'
import type { CameraMode } from './contract'
import { inMatch, isEndless, partnerSeat } from './contract'
import { clockText } from './copy'

export const debugNet=()=>{try{return import.meta.env.DEV||new URLSearchParams(location.search).has('carrot-duo-debug')}catch{return false}}

export function Avatar({name,tone,size='md'}:{name:string;tone:'me'|'partner'|'empty';size?:'sm'|'md'|'lg'}){
 const initial=[...(name||'?').trim()][0]?.toUpperCase()||'?'
 return <span className={`ct-duo-avatar is-${size}`} data-tone={tone} aria-hidden="true">{tone==='empty'?'':initial}</span>
}
export function Meter({value,label,tone}:{value:number;label?:string;tone?:'me'|'partner'|'threat'|'accent'}){
 const v=Math.max(0,Math.min(1,Number.isFinite(value)?value:0))
 return <span className="ct-duo-meter" data-tone={tone} role={label?'progressbar':undefined} aria-label={label} aria-valuemin={label?0:undefined} aria-valuemax={label?100:undefined} aria-valuenow={label?Math.round(v*100):undefined}><i style={{transform:`scaleX(${v})`}}/></span>
}
export function Glyph({name}:{name:'duo'|'copy'|'link'|'check'|'eye'|'home'|'split'|'close'|'heart'|'coin'|'wave'|'signal'|'back'|'pencil'|'crown'}){
 const d:Record<string,string>={
  duo:'M8.5 11a3.5 3.5 0 1 0 0-7 3.5 3.5 0 0 0 0 7Zm7-1a3 3 0 1 0 0-6M2.5 20c0-3.6 2.7-6 6-6s6 2.4 6 6m2-6c2.8 0 5 2.1 5 5.4',
  copy:'M9 9h10v11H9zM5 15V4h10',link:'M10 14a4 4 0 0 0 5.7 0l3-3a4 4 0 0 0-5.7-5.7l-1 1M14 10a4 4 0 0 0-5.7 0l-3 3a4 4 0 0 0 5.7 5.7l1-1',
  check:'m5 12 4.5 4.5L19 7',eye:'M2 12s3.6-6.5 10-6.5S22 12 22 12s-3.6 6.5-10 6.5S2 12 2 12Zm10-3a3 3 0 1 0 0 6 3 3 0 0 0 0-6Z',
  home:'M4 11 12 4l8 7M6 9.5V20h12V9.5',split:'M4 5h16v14H4zM12 5v14',close:'m6 6 12 12M18 6 6 18',
  heart:'M12 20 4.2 12.4C.4 8.6 6.6 1.4 12 6.6c5.4-5.2 11.6 2 7.8 5.8L12 20Z',coin:'M12 3a9 9 0 1 0 0 18 9 9 0 0 0 0-18Zm0 4v10m3-8h-4.5a2 2 0 0 0 0 4h3a2 2 0 0 1 0 4H9',
  wave:'M3 14c2.5 0 2.5-4 5-4s2.5 4 5 4 2.5-4 5-4 2.5 4 3 4',signal:'M5 18v-3m5 3v-6m5 6V9m5 9V5',back:'m14 5-7 7 7 7',
  pencil:'M4 20h4L19 9l-4-4L4 16v4Zm9-13 4 4',crown:'m3 8 5 4 4-7 4 7 5-4-2 11H5L3 8Z',
 }
 return <svg className="ct-duo-glyph" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><path d={d[name]}/></svg>
}

/** "Direct · 38 ms" / "Relay · 120 ms" / "Reconnecting" / "Hiccup"; endless also shows the input delay in debug builds. */
export function ConnectionChip({ctl,showDelay=false}:{ctl:DuoController;showDelay?:boolean}){
 const s=useDuoSlice(ctl,s=>({path:s.path,rtt:Math.round(s.rttMs||0),delay:Math.round(s.inputDelayMs||0),ticks:s.stats?.delayTicks||0,hiccup:s.hiccup,reconnecting:s.reconnecting}))
 const state=s.reconnecting?'reconnecting':s.hiccup?'hiccup':s.path==='none'?'offline':'ok'
 const text=state==='reconnecting'?'Reconnecting':state==='hiccup'?'Hiccup':state==='offline'?'Offline':`${s.path==='p2p'?'Direct':'Relay'} · ${s.rtt} ms`
 const spoken=state==='ok'?`Connection: ${s.path==='p2p'?'direct':'through the relay'}, ${s.rtt} milliseconds`:`Connection: ${text.toLowerCase()}`
 return <span className="ct-duo-chip ct-duo-conn" data-state={state} role="img" aria-label={spoken}>
  <i aria-hidden="true"/><span aria-hidden="true">{text}</span>{showDelay&&debugNet()&&state==='ok'&&<small aria-hidden="true">D{s.ticks} · {s.delay} ms</small>}
 </span>
}

/**
 * My side / Both / Watch <name>: sent to Unity as Net camera messages (the choice is this device's own). On phones the rail shows one
 * button with the current view; it opens the three choices beside the rail and closes again after a pick, so the rail stays narrow.
 */
export function CameraSwitch({ctl,labels}:{ctl:DuoController;labels:Record<CameraMode,string>}){
 const [mode,setMode]=useState<CameraMode>('own')
 const [open,setOpen]=useState(false)
 const pick=(m:CameraMode)=>{setMode(m);ctl.camera(m);setOpen(false)}
 const icon:Record<CameraMode,'home'|'split'|'eye'>={own:'home',both:'split',partner:'eye'}
 return <div className="ct-duo-camera" data-open={open?'1':undefined} onKeyDown={e=>{if(e.key==='Escape'&&open){e.stopPropagation();setOpen(false)}}}>
  <button type="button" className="ct-duo-camera__toggle" aria-expanded={open} aria-label={`Camera: ${labels[mode]}. Change the view`} onClick={()=>setOpen(v=>!v)}><Glyph name={icon[mode]}/></button>
  <div className="ct-duo-camera__opts" role="group" aria-label="Camera">
   {(['own','both','partner'] as CameraMode[]).map(m=><button key={m} type="button" className="ct-duo-camera__btn" aria-pressed={mode===m} onClick={()=>pick(m)} title={labels[m]}><Glyph name={icon[m]}/><span>{labels[m]}</span></button>)}
  </div>
 </div>
}

/**
 * The mirrored double map as a thumbnail: west/east halves (or north/south for Asuna), the wall between them, your half lit in your
 * colour. Endless draws Twin Gates: two gates in the back corners, the wings meeting at the shared boulevard, your home wing lit.
 */
export function MiniMap({layout,side,endless,names}:{layout:'x'|'z';side:number;endless:boolean;names:[string,string]}){
 if(endless){
  // the real routes of Twin Gates (CarrotDuoMaps.Endless, grid gx 0..28 by gz 0..12, the back row at the top): each gate's wing
  // snakes to the front, the wings meet at the junction and the shared boulevard runs up to the carrot
  const west='M12.0 21 L62.3 21 L62.3 57 L30.9 57 L30.9 93 L74.9 93 L74.9 111 L100.0 111',east='M188.0 21 L137.7 21 L137.7 57 L169.1 57 L169.1 93 L125.1 93 L125.1 111 L100.0 111'
  const mine=side===0?west:east,theirs=side===0?east:west
  return <svg className="ct-duo-minimap" viewBox="0 0 200 130" role="img" aria-label={`Twin Gates. Your home wing is the ${side===0?'west':'east'} gate; the boulevard to the carrot is shared.`}>
   <rect x="4" y="6" width="192" height="118" rx="18" className="ct-duo-minimap__ground"/>
   <rect x={side===0?4:100} y="6" width="96" height="118" rx="18" className="ct-duo-minimap__mine"/>
   <path d={theirs} className="ct-duo-minimap__path is-partner"/><path d={mine} className="ct-duo-minimap__path is-me"/>
   <path d="M100.0 111 L100.0 39" className="ct-duo-minimap__path is-shared"/>
   <circle cx="100.0" cy="39" r="7" className="ct-duo-minimap__carrot"/>
   <circle cx={side===0?12.0:188.0} cy="21" r="6" className="ct-duo-minimap__gate is-me"/><circle cx={side===0?188.0:12.0} cy="21" r="6" className="ct-duo-minimap__gate"/>
  </svg>
 }
 const z=layout==='z'
 // halves: 0 = west (left) or north (top); the wall runs through the middle
 const half=(i:number)=>z?{x:6,y:i===0?6:68,w:188,h:56}:{x:i===0?6:104,y:6,w:90,h:118}
 const label=(i:number)=>{const h=half(i);return {x:h.x+h.w/2,y:h.y+h.h/2+5}}
 const me=side,them=side===0?1:0
 return <svg className="ct-duo-minimap" viewBox="0 0 200 130" role="img" aria-label={`Two mirrored gardens. You defend the ${z?(me===0?'north':'south'):(me===0?'west':'east')} half; ${names[1]} the other. A wall keeps them apart.`}>
  {[0,1].map(i=>{const h=half(i);return <rect key={i} x={h.x} y={h.y} width={h.w} height={h.h} rx="16" className={i===me?'ct-duo-minimap__mine':'ct-duo-minimap__theirs'}/>})}
  {z?<line x1="10" y1="65" x2="190" y2="65" className="ct-duo-minimap__wall"/>:<line x1="100" y1="10" x2="100" y2="120" className="ct-duo-minimap__wall"/>}
  <text {...label(me)} className="ct-duo-minimap__label is-me">{names[0]}</text>
  <text {...label(them)} className="ct-duo-minimap__label">{names[1]}</text>
 </svg>
}

/** Milliseconds until `at` (local epoch ms), refreshed a few times a second while it runs. */
export function useCountdown(at:number|null|undefined,step=100):number{
 const [now,setNow]=useState(()=>Date.now())
 useEffect(()=>{if(!at)return;setNow(Date.now());const t=setInterval(()=>setNow(Date.now()),step);return()=>clearInterval(t)},[at,step])
 return at?Math.max(0,at-now):0
}

/** The shared countdown over the board for wave 1 (go) and every resume; the start countdown lives in the side reveal. */
export function Countdown({ctl}:{ctl:DuoController}){
 const s=useDuoSlice(ctl,s=>({at:s.countdownAt,kind:s.countdownKind}))
 const left=useCountdown(s.kind&&s.kind!=='start'?s.at:null)
 if(!left||!s.kind||s.kind==='start')return null
 const n=Math.max(1,Math.ceil(left/1000))
 return <div className="ct-duo ct-duo-count" aria-hidden="true"><small>{s.kind==='go'?'Wave 1 in':'Resuming in'}</small><b key={n}>{n}</b></div>
}

export function Toasts({ctl}:{ctl:DuoController}){
 const toasts=useDuoUi(ctl,u=>u.toasts,(a,b)=>a===b)
 if(!toasts.length)return null
 return <div className="ct-duo ct-duo-toasts">{toasts.map(t=><p key={t.id} className="ct-duo-toast" data-tone={t.tone}>{t.text}</p>)}</div>
}
/** Partner events and every toast reach screen readers here (the toasts themselves are not live regions, so nothing is read twice). */
export function LiveRegion({ctl}:{ctl:DuoController}){
 const t=useDuoUi(ctl,u=>({polite:u.polite,assertive:u.assertive}))
 return <div className="ct-duo-sr"><p aria-live="polite" aria-atomic="true">{t.polite}</p><p aria-live="assertive" aria-atomic="true">{t.assertive}</p></div>
}

export type BannerSpec={key:string;text:ReactNode;tone?:'info'|'warn'|'good'|'threat';actions?:Array<{label:string;onClick:()=>void;primary?:boolean}>}
/** The one banner that matters most right now (paused by whom, away with the grace clock, hold, waiting to start...). */
export function Banners({ctl}:{ctl:DuoController}){
 const s=useDuoSlice(ctl,s=>({phase:s.phase,seat:s.seat,pausedBy:s.pausedBy,reason:s.pauseReason,away:s.partnerAway,hold:s.hold,waiting:s.waiting,pressed:s.pressedStart,restoring:s.restoring,solo:s.canContinueSolo,endless:isEndless(s),slowed:s.stats?.slowedFor??-1,countdown:s.countdownKind}),(a,b)=>JSON.stringify(a)===JSON.stringify(b))
 const awayLeft=useCountdown(s.away?s.away.since+s.away.graceMs:null,250)
 if(!inMatch(s.phase))return null
 const partner=ctl.partnerName(),me=s.seat??0,other=partnerSeat(s.seat)
 let b:BannerSpec|null=null
 if(s.restoring)b={key:'restore',text:s.restoring.seat===me?`Restoring your garden ${Math.round(s.restoring.progress*100)}%`:`Restoring ${partner}'s garden ${Math.round(s.restoring.progress*100)}%`,tone:'info'}
 else if(s.solo&&s.endless)b={key:'solo',text:`${partner} didn't come back.`,tone:'warn',actions:[{label:'Continue solo',onClick:ctl.continueSolo,primary:true},{label:'End run',onClick:ctl.endRun}]}
 else if(s.away)b={key:'away',text:<>{partner} stepped away <b className="ct-duo-num">{clockText(awayLeft)}</b></>,tone:'warn'}
 else if(s.phase==='paused'&&s.countdown!=='resume'){
  const text=s.reason==='silence'?`Connection lost. Waiting for ${partner}`:s.reason==='resync'?'Resyncing the gardens':s.reason==='restore'?`Restoring ${partner}'s garden`:s.pausedBy===other?`${partner} paused`:s.pausedBy===me?'You paused':'Paused'
  // the page's own paused card carries Resume (it goes through the filter); the banner says who paused
  b={key:'paused',text,tone:'info'}}
 else if(s.hold&&!s.endless)b={key:'hold',text:`Your garden is safe, waiting for ${partner}`,tone:'good'}
 else if(s.waiting)b={key:'waiting',text:`Waiting for ${partner}`,tone:'info'}
 else if(s.phase==='prep'&&s.pressed[me]&&!s.pressed[other])b={key:'prep',text:`Waiting for ${partner} to start`,tone:'info'}
 else if(s.phase==='prep'&&!s.pressed[me]&&s.pressed[other])b={key:'prep2',text:`${partner} is ready for wave 1`,tone:'good'}
 else if(s.slowed===other)b={key:'slowed',text:`Slowed for ${partner}`,tone:'info'}
 if(!b)return null
 return <div className="ct-duo ct-duo-banners"><div key={b.key} className="ct-duo-banner" data-tone={b.tone}>
  <span className="ct-duo-banner__text">{b.text}</span>
  {b.actions&&<span className="ct-duo-banner__actions">{b.actions.map(a=><button key={a.label} type="button" className={`ct-duo-btn ${a.primary?'ct-duo-btn--primary':''} is-sm`} onClick={a.onClick}>{a.label}</button>)}</span>}
 </div></div>
}
