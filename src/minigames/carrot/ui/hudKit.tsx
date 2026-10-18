import { useEffect, useState } from 'react'

/** The HUD's phone layouts (the same queries as hud.css). */
export const PhonePortrait='(max-width: 640px)',PhoneLandscape='(max-height: 500px) and (orientation: landscape)'

export const unit=(v:number)=>Math.max(0,Math.min(1,Number.isFinite(v)?v:0))
/**
 * A fill that changes often (health, progress, the guardian's route): scaleX from the left inside a rounded groove that clips both ends
 * round. Its box never leaves the groove (translateX would push it off screen) and the transition stays on the compositor in every
 * engine (a clip-path transition repaints on the main thread in WebKit).
 */
export const fill=(v:number)=>({transform:`scaleX(${unit(v).toFixed(4)})`})
/** A fill that rarely changes (the build menu's DPS): a rounded inset clip, so its leading end is round too. */
export const meter=(v:number)=>({clipPath:`inset(0 ${((1-unit(v))*100).toFixed(2)}% 0 0 round 999px)`})

/** A media query as state (kept in sync on resize and rotation). */
export function useMedia(query:string){
 const [on,setOn]=useState(()=>typeof matchMedia==='function'&&matchMedia(query).matches)
 useEffect(()=>{const m=matchMedia(query);const f=()=>setOn(m.matches);f();m.addEventListener('change',f);return()=>m.removeEventListener('change',f)},[query])
 return on
}

/**
 * The carrot's face in the hearts pill, cropped from the twelve-pose sheet (02-carrot-animation, 4 x 3 cells, row-major):
 * 0 smiling, 2 glancing, 4 worried, 5 bitten, 7 bitten and cross, 6 wincing. The crop zooms in on the face so the orange fills the circle.
 */
const Sheet='/assets/minigames/carrot/02-carrot-animation.webp',Zoom=2.5
const faceAt:Record<number,[number,number]>={0:[.48,.56],2:[.44,.57],4:[.48,.57],5:[.49,.53],6:[.49,.52],7:[.51,.58]}
export function carrotPose(health:number,bitten:boolean){return bitten?5:health<=0?6:health<=3?7:health<=6?4:health<=9?2:0}
export function CarrotFace({pose}:{pose:number}){
 const [fx,fy]=faceAt[pose]||faceAt[0],c=pose%4,r=Math.floor(pose/4)
 const x=((c+fx)*Zoom-.5)/(4*Zoom-1)*100,y=((r+fy)*Zoom-.5)/(3*Zoom-1)*100
 return <span className="ct-face" aria-hidden="true" style={{backgroundImage:`url(${Sheet})`,backgroundSize:`${4*Zoom*100}% ${3*Zoom*100}%`,backgroundPosition:`${x.toFixed(2)}% ${y.toFixed(2)}%`}}/>
}
