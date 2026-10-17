import { useEffect, useLayoutEffect, useRef } from 'react'
import Icon from '../Icon'
import { gradeLetters } from '../progress'
import { requestFlash } from '../flash'

/** The three medals (campaign) or stars (challenges): completed, carrot unharmed, scenery cleared / under par. */
export function Medals({value=0,labels=['Completed.','Carrot unharmed.','Scenery cleared.'],icons=['check','heart','leaf']}:{value?:number;labels?:string[];icons?:string[]}){
 const said=[1,2,4].map((v,i)=>value&v?labels[i]:'').filter(Boolean).join(' ')
 return <span className="ct-medals" role="img" aria-label={said||'No medals yet.'}>{[1,2,4].map((v,i)=><i className={value&v?'is-earned':''} key={v}><Icon name={icons[i]}/></i>)}</span>
}
/** A grade letter on the medal scale (S = every medal). */
export function Grade({value,size='md',label}:{value:number;size?:'sm'|'md'|'xl';label?:string}){
 const letter=gradeLetters[value]||''
 if(!letter)return <span className={`ct-grade ct-grade--${size} is-empty`} role="img" aria-label={label||'Not graded yet'}/>
 return <span className={`ct-grade ct-grade--${size} ct-grade--${letter.toLowerCase()}`} role="img" aria-label={label||`Grade ${letter}`}>{letter}</span>
}
export const difficultyLabel=(pips:number,challenge?:string)=>challenge?{easy:'EASY',hard:'HARD',insane:'INSANE','????':'????'}[challenge]||challenge.toUpperCase():pips>=5?'EXPERT':pips>=3?'HARD':'NORMAL'
export function Pips({value,max=5}:{value:number;max?:number}){return <span className="ct-pips" role="img" aria-label={`Difficulty ${value} of ${max}`}>{Array.from({length:max},(_,i)=><i key={i} className={i<value?'is-on':''}/>)}</span>}
/**
 * A rolling numeric counter with dim leading zeros (a score-counter look: 0340): the value rolls 250 ms OutQuint toward its target and
 * flashes white for 30 ms on a gain (through the flash governor). Digits never reflow: tabular figures.
 */
export function Counter({value,ghost='8888',className='',reduced=false,flashId}:{value:number;ghost?:string;className?:string;reduced?:boolean;flashId?:string}){
 const el=useRef<HTMLSpanElement>(null),shown=useRef(value),raf=useRef(0)
 // the digits are written imperatively (React renders no children here), so a re-render never cuts a roll short
 const write=(node:HTMLElement,v:number)=>{const digits=String(v),zeros=Math.max(0,ghost.length-digits.length);const z=node.previousElementSibling as HTMLElement|null;if(z)z.textContent='0'.repeat(zeros);node.textContent=digits}
 useLayoutEffect(()=>{if(el.current)write(el.current,shown.current)},[])
 useEffect(()=>{
  const node=el.current;if(!node)return
  const from=shown.current,to=value;if(from===to){write(node,to);return}
  cancelAnimationFrame(raf.current)
  if(flashId&&to>from&&!reduced&&requestFlash(flashId,40)==='start')node.animate([{color:'#fff'},{color:'#fff',offset:.09},{}],{duration:330,easing:'ease-out'})
  if(reduced){shown.current=to;write(node,to);return}
  const t0=performance.now(),ease=(t:number)=>1-Math.pow(1-t,5)
  const step=(now:number)=>{const k=Math.min(1,(now-t0)/250);const v=Math.round(from+(to-from)*ease(k));shown.current=v;write(node,v);if(k<1)raf.current=requestAnimationFrame(step)}
  raf.current=requestAnimationFrame(step)
  return()=>cancelAnimationFrame(raf.current)
 },[value,reduced,flashId])
 return <span className={`ct-counter ${className}`}><span className="ct-counter__ghost" aria-hidden="true"/><span className="ct-counter__value" ref={el}/></span>
}
