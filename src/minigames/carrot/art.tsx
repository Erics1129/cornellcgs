import { useEffect, useState } from 'react'
import type { CSSProperties } from 'react'
import { expansionTowers, miniBosses, regularMobs } from './expansion'
const base='/assets/minigames/carrot/'
const sheets:Record<string,string>={seed:'05-seed-tiers',frost:'06-frost-tiers',mortar:'07-mortar-tiers',prism:'08-prism-tiers',storm:'09-storm-tiers',blossom:'10-blossom-tiers',starfruit:'18-starfruit-tiers',gravity:'19-gravity-tiers',book:'20-book-tiers',thunder:'21-thunder-tiers'}
// The Super plates (26 forms, 27 emblems) are 5x2 grids in this kind order.
const superOrder=['seed','frost','mortar','prism','storm','blossom','starfruit','gravity','book','thunder']
const challengeBossRow:Record<string,number>={tornado:0,zombie:1,eyeball:2}
export const chapterArt=(biome:string)=>base+({garden:'01-garden-keyart',marsh:'03-marsh-keyart',frost:'04-frost-keyart',orchard:'23-orchard-keyart',arena:'31-arena-keyart',portal:'40-portal-keyart'}[biome]||'01-garden-keyart')+'.jpg'
export const challengeArt=(boss:string)=>{const name={tornado:'28-tornado-keyart',zombie:'29-zombie-keyart',eyeball:'30-eyeball-keyart',portal:'40-portal-keyart'}[boss];return name?base+name+'.jpg':chapterArt('arena')}
export const superForms=base+'26-super-forms.jpg',superEmblems=base+'27-super-emblems.png',abilityGlyphs=base+'33-ability-glyphs.png'

// Optional plates: a sheet that 404s falls back to the painted tier-4 cell or a typographic mark, so the HUD never shows a blank square.
const imageStatus=new Map<string,boolean>(),waiters=new Map<string,Set<(ok:boolean)=>void>>()
function probe(url:string,notify:(ok:boolean)=>void){
 const known=imageStatus.get(url);if(known!==undefined){notify(known);return()=>{}}
 let set=waiters.get(url);if(!set){set=new Set();waiters.set(url,set);const image=new Image();const settle=(ok:boolean)=>{imageStatus.set(url,ok);for(const w of waiters.get(url)||[])w(ok);waiters.delete(url)};image.onload=()=>settle(true);image.onerror=()=>settle(false);image.src=url}
 set.add(notify);return()=>{waiters.get(url)?.delete(notify)}
}
export function useImageAvailable(url:string){
 const [ok,setOk]=useState(()=>imageStatus.get(url)??true)
 useEffect(()=>probe(url,setOk),[url])
 return ok
}
const grid=(index:number,columns:number,rows:number)=>({backgroundSize:`${columns*100}% ${rows*100}%`,backgroundPosition:`${columns>1?(index%columns)*100/(columns-1):0}% ${rows>1?Math.floor(index/columns)*100/(rows-1):0}%`})
// Generated plate rows have slightly different gutters. Crop square cells without
// stretching the creatures or showing a sliver of the next family at the bottom.
function plateCell(index:number,columns:number,width:number,height:number,bounds:number[]){
 const row=Math.floor(index/columns),cellWidth=width/columns,top=bounds[row],bottom=bounds[row+1]
 const side=Math.min(cellWidth,bottom-top)-4,x=(index%columns+.5)*cellWidth-side/2,y=(top+bottom-side)/2
 return {backgroundSize:`${width/side*100}% ${height/side*100}%`,backgroundPosition:`${x/(width-side)*100}% ${y/(height-side)*100}%`}
}
export function TowerPortrait({kind,tier=1,className=''}:{kind:string;tier?:number;className?:string}){
 const superOk=useImageAvailable(superForms)
 const expanded=expansionTowers.indexOf(kind)
 if(expanded>=0)return <span aria-hidden="true" className={`ct-portrait ct-portrait--expansion ${tier>=5?'ct-portrait--super':''} ${className}`} style={{backgroundImage:`url(${base}${expanded<5?'43-expansion-tiers-a':'44-expansion-tiers-b'}.jpg)`,...plateCell(expanded%5*5+Math.max(0,Math.min(4,tier-1)),5,1254,1254,expanded<5?[0,252,506,741,980,1254]:[0,252,502,754,982,1254])}}/>
 const index=superOrder.indexOf(kind)
 if(tier>=5&&superOk&&index>=0)return <span aria-hidden="true" className={`ct-portrait ct-portrait--super ${className}`} style={{backgroundImage:`url(${superForms})`,...grid(index,5,2)}}/>
 return <span aria-hidden="true" className={`ct-portrait ${className}`} style={{backgroundImage:`url(${base}${sheets[kind]||sheets.seed}.jpg)`,backgroundPosition:`${(Math.max(1,Math.min(4,tier))-1)*100/3}% 0%`}} />
}
/** Round golden sigil of a kind's Super form; a typographic crown stands in when the sprite sheet is missing. */
export function SuperEmblem({kind,className=''}:{kind:string;className?:string}){
 const ok=useImageAvailable(superEmblems)
 if(expansionTowers.includes(kind))return <TowerPortrait kind={kind} tier={5} className={`ct-emblem ct-emblem--portrait ${className}`}/>
 const index=superOrder.indexOf(kind)
 if(ok&&index>=0)return <span aria-hidden="true" className={`ct-emblem ${className}`} style={{backgroundImage:`url(${superEmblems})`,...grid(index,5,2)}}/>
 return <span aria-hidden="true" className={`ct-emblem ct-emblem--text ${className}`}><b>S</b></span>
}
export function BossPortrait({kind,className=''}:{kind:string;className?:string}){
 if(kind==='portal')return <span aria-hidden="true" className={`ct-portrait ct-portrait--boss ct-portrait--portal ${className}`} style={{backgroundImage:`url(${base}40-portal-keyart.jpg)`}}/>
 if(kind==='orchard')return <span aria-hidden="true" className={`ct-portrait ct-portrait--boss ct-portrait--plate ${className}`} style={{backgroundImage:`url(${base}25-hollowhead-menacing.jpg)`}}/>
 const row=challengeBossRow[kind]
 // 32 is a vertical stack of three 4-pose sheets (1024x2049): the first panel of each row, cropped to the upper body.
 if(row!==undefined)return <span aria-hidden="true" className={`ct-portrait ct-portrait--boss ct-portrait--challenge ${className}`} style={{backgroundImage:`url(${base}32-challenge-bosses-menacing.jpg)`,backgroundSize:'400% 800.4%',backgroundPosition:`0% ${[7.9,45.9,84][row]}%`}}/>
 return <span aria-hidden="true" className={`ct-portrait ct-portrait--boss ${className}`} style={{backgroundImage:`url(${base}22-bosses-menacing.jpg)`,backgroundPosition:`0% ${kind==='marsh'?50:kind==='frost'?100:0}%`}}/>}
const glyphIndex:Record<string,number>={blind:0,uproot:1,thornwall:2,tithe:3,whiteout:4,crowcurse:5,dusk:5}
/** Optional ability glyph (33 is a 3x2 grid); null when the ability has no glyph or the sheet is missing, so the caller falls back to text. */
export function AbilityGlyph({ability,className=''}:{ability:string;className?:string}){
 const ok=useImageAvailable(abilityGlyphs)
 const index=glyphIndex[ability]
 if(!ok||index===undefined)return null
 return <span aria-hidden="true" className={`ct-glyph ${className}`} style={{backgroundImage:`url(${abilityGlyphs})`,...grid(index,3,2)}}/>
}
export function CarrotPortrait({pose=0,className=''}:{pose?:number;className?:string}){return <span aria-hidden="true" className={`ct-portrait ${className}`} style={{backgroundImage:`url(${base}02-carrot-animation.jpg)`,backgroundPosition:`${pose%4*100/3}% ${Math.floor(pose/4)*50}%`}}/>}
export function CreaturePortrait({kind,className=''}:{kind:string;className?:string}){
 const mini=miniBosses.findIndex(m=>m.id===kind),mob=regularMobs.findIndex(m=>m.id===kind)
 if(mini<0&&mob<0)return null
 return <span aria-hidden="true" className={`ct-portrait ct-portrait--creature ${className}`} style={{backgroundImage:`url(${base}${mini>=0?'41-minibosses':'42-new-creatures'}.jpg)`,...(mini>=0?plateCell(mini,5,1536,1024,[0,1024/3,2048/3,1024]):plateCell(mob,4,1254,1254,[0,418,836,1254]))}}/>
}
export function RouteDrawing({routes}: {routes?:Array<Array<{x:number;y?:number;z:number}|number[]>>}) {
 if(!routes?.length)return null
 const world=routes.some(r=>r.some(p=>!Array.isArray(p)&&p.x<0))
 return <svg className="ct-route-drawing" viewBox="0 0 16 12" aria-hidden="true">{routes.map((r,i)=><polyline key={i} points={r.map(p=>Array.isArray(p)?`${p[0]+.5},${p[1]+.5}`:`${p.x+(world?7.5:.5)},${p.z+(world?5.5:.5)}`).join(' ')} fill="none" stroke="currentColor" strokeWidth=".25" strokeLinecap="round" strokeLinejoin="round" opacity={1-i*.2}/> )}</svg>
}
export const meterStyle=(ratio:number)=>({'--fill':`${Math.max(0,Math.min(1,Number.isFinite(ratio)?ratio:0))*100}%`} as CSSProperties)
