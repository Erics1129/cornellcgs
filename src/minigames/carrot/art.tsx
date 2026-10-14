import { useEffect, useState } from 'react'
import type { CSSProperties } from 'react'
import { expansionTowers, miniBosses, regularMobs } from './expansion'
const base='/assets/minigames/carrot/'
const sheets:Record<string,string>={seed:'05-seed-tiers',frost:'06-frost-tiers',mortar:'07-mortar-tiers',prism:'08-prism-tiers',storm:'09-storm-tiers',blossom:'10-blossom-tiers',starfruit:'18-starfruit-tiers',gravity:'19-gravity-tiers',book:'20-book-tiers',thunder:'21-thunder-tiers'}
// The Super plates (26 forms, 27 emblems) are 5x2 grids in this kind order.
const superOrder=['seed','frost','mortar','prism','storm','blossom','starfruit','gravity','book','thunder']
const challengeBossRow:Record<string,number>={tornado:0,zombie:1,eyeball:2}
// Key art ships as WebP (q80, at most 1600 px wide) next to the original JPGs, which stay for the site card and social image.
export const chapterArt=(biome:string)=>base+({garden:'01-garden-keyart',marsh:'03-marsh-keyart',frost:'04-frost-keyart',orchard:'23-orchard-keyart',arena:'31-arena-keyart',portal:'40-portal-keyart',prism:'45-prism-keyart'}[biome]||'01-garden-keyart')+'.webp'
export const challengeArt=(boss:string)=>{const name={tornado:'28-tornado-keyart',zombie:'29-zombie-keyart',eyeball:'30-eyeball-keyart',portal:'40-portal-keyart',asuna:'45-prism-keyart'}[boss];return name?base+name+'.webp':chapterArt('arena')}
/** Per-level jacket art: a ready-frame capture of the level's own board (scripts/carrot-ui-qa/jackets.mjs, provenance in ui.md). */
export const jacketArt=(id:number)=>`${base}jackets/${String(id).padStart(2,'0')}.webp`
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
// ---- portraits.json (rendered from the real in-game models by the characters stream) -------------------------------------------
// {kind:{tier:[sheet,x,y,w,h]}} in sheet pixels; when present it wins over the painted sheets below, which remain the fallback.
type Cell=[string,number,number,number,number]
type PortraitMap=Record<string,Record<string,Cell>>
let portraitMap:PortraitMap|null|undefined,portraitWaiters:Array<(m:PortraitMap|null)=>void>|null=null
const sheetSizes=new Map<string,{w:number;h:number}|null>()
function loadPortraits(done:(m:PortraitMap|null)=>void){
 if(portraitMap!==undefined){done(portraitMap);return}
 if(portraitWaiters){portraitWaiters.push(done);return}
 portraitWaiters=[done]
 const settle=(m:PortraitMap|null)=>{portraitMap=m;const w=portraitWaiters||[];portraitWaiters=null;for(const f of w)f(m)}
 fetch(base+'portraits/portraits.json').then(r=>r.ok?r.json():null).then(m=>settle(m&&typeof m==='object'?m as PortraitMap:null)).catch(()=>settle(null))
}
function useSheet(url:string|null){
 const [size,setSize]=useState(()=>url?sheetSizes.get(url)??null:null)
 useEffect(()=>{if(!url||sheetSizes.has(url)){setSize(url?sheetSizes.get(url)??null:null);return}let live=true;const image=new Image();image.onload=()=>{sheetSizes.set(url,{w:image.naturalWidth,h:image.naturalHeight});if(live)setSize(sheetSizes.get(url)!)};image.onerror=()=>{sheetSizes.set(url,null)};image.src=url;return()=>{live=false}},[url])
 return size
}
/** The portraits.json cell for a kind (and tier), or null while unknown or absent. */
export function usePortraitCell(kind:string,tier=1):{url:string;style:CSSProperties}|null{
 const [map,setMap]=useState<PortraitMap|null>(()=>portraitMap??null)
 useEffect(()=>{let live=true;loadPortraits(m=>{if(live)setMap(m)});return()=>{live=false}},[])
 const entry=map?.[kind],cell=entry?(entry[String(tier)]||entry['1']||Object.values(entry)[0]):undefined
 const url=cell?base+'portraits/'+cell[0]:null,size=useSheet(url)
 if(!cell||!url||!size)return null
 const [,x,y,w,h]=cell
 return {url,style:{backgroundImage:`url(${url})`,backgroundSize:`${size.w/w*100}% ${size.h/h*100}%`,backgroundPosition:`${size.w>w?x/(size.w-w)*100:0}% ${size.h>h?y/(size.h-h)*100:0}%`}}
}
export function TowerPortrait({kind,tier=1,className=''}:{kind:string;tier?:number;className?:string}){
 const superOk=useImageAvailable(superForms)
 const real=usePortraitCell(kind,tier)
 if(real)return <span aria-hidden="true" className={`ct-portrait ct-portrait--real ${tier>=5?'ct-portrait--super':''} ${className}`} style={real.style}/>
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
 const real=usePortraitCell(kind==='asuna'?'':kind)
 if(real)return <span aria-hidden="true" className={`ct-portrait ct-portrait--boss ct-portrait--real ${className}`} style={real.style}/>
 if(kind==='asuna')return <span aria-hidden="true" className={`ct-portrait ct-portrait--boss ct-portrait--asuna ${className}`} style={{backgroundImage:`url(${base}46-asuna-portrait.png)`}}/>
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
export function CreaturePortrait({kind,className='',fallback=false}:{kind:string;className?:string;fallback?:boolean}){
 const real=usePortraitCell(kind)
 const mini=miniBosses.findIndex(m=>m.id===kind),mob=regularMobs.findIndex(m=>m.id===kind)
 if(real)return <span aria-hidden="true" className={`ct-portrait ct-portrait--creature ct-portrait--real ${className}`} style={real.style}/>
 if(mini<0&&mob<0)return fallback?<CreatureGlyph kind={kind} className={className}/>:null
 return <span aria-hidden="true" className={`ct-portrait ct-portrait--creature ${className}`} style={{backgroundImage:`url(${base}${mini>=0?'41-minibosses':'42-new-creatures'}.jpg)`,...(mini>=0?plateCell(mini,5,1536,1024,[0,1024/3,2048/3,1024]):plateCell(mob,4,1254,1254,[0,418,836,1254]))}}/>
}
export function RouteDrawing({routes}: {routes?:Array<Array<{x:number;y?:number;z:number}|number[]>>}) {
 if(!routes?.length)return null
 const points=routes.flatMap(r=>r.map(p=>Array.isArray(p)?{x:p[0],z:p[1]}:p))
 const minX=Math.min(...points.map(p=>p.x)),maxX=Math.max(...points.map(p=>p.x)),minZ=Math.min(...points.map(p=>p.z)),maxZ=Math.max(...points.map(p=>p.z))
 const extended=maxX-minX>16||maxZ-minZ>12,world=points.some(p=>p.x<0)
 const scale=extended?Math.min(14/Math.max(1,maxX-minX),10/Math.max(1,maxZ-minZ)):1
 const point=(p:{x:number;z:number}|number[])=>{const x=Array.isArray(p)?p[0]:p.x,z=Array.isArray(p)?p[1]:p.z;return extended?`${8+(x-(minX+maxX)/2)*scale},${6+(z-(minZ+maxZ)/2)*scale}`:`${x+(world?7.5:.5)},${z+(world?5.5:.5)}`}
 return <svg className="ct-route-drawing" viewBox="0 0 16 12" aria-hidden="true">{routes.map((r,i)=><polyline key={i} points={r.map(point).join(' ')} fill="none" stroke="currentColor" strokeWidth=".25" strokeLinecap="round" strokeLinejoin="round" opacity={Math.max(.25,1-i*.2)}/> )}</svg>
}
export const meterStyle=(ratio:number)=>({'--fill':`${Math.max(0,Math.min(1,Number.isFinite(ratio)?ratio:0))*100}%`} as CSSProperties)

/**
 * Silhouette glyphs for the eight original creatures (no painted portrait exists for them; portraits.json replaces these when it ships).
 * Drawn for this page as filled 24 px shapes so a 28 px wave-track note stays legible.
 */
const creatureShapes:Record<string,string>={
 nibble:'M4 12a8 6 0 0 1 16 0H4Zm4 0v6a2 2 0 0 0 2 2h4a2 2 0 0 0 2-2v-6H8Z',
 dash:'M8 3c1 0 2 3 2 6h4c0-3 1-6 2-6s1 4 0 7c2 1 3 3 3 5a7 7 0 0 1-14 0c0-2 1-4 3-5-1-3-1-7 0-7Z',
 shell:'M12 4c5 0 8 3 8 7v2H4v-2c0-4 3-7 8-7Zm-7 10h14l-2 5H7l-2-5Z',
 swarm:'M7 9a3 3 0 1 1 0 6 3 3 0 0 1 0-6Zm10-3a3 3 0 1 1 0 6 3 3 0 0 1 0-6Zm-2 8a3 3 0 1 1 0 6 3 3 0 0 1 0-6Z',
 moth:'M12 6c1 0 2 2 2 5v7c0 1-1 2-2 2s-2-1-2-2v-7c0-3 1-5 2-5Zm-3 3C5 6 1 7 2 11c1 3 4 4 7 3V9Zm6 0c4-3 8-2 7 2-1 3-4 4-7 3V9Z',
 shaman:'M12 2a6 4 0 0 1 6 4H6a6 4 0 0 1 6-4ZM8 7h8v6a4 4 0 0 1-8 0V7Zm10 0h2v15h-2V7Z',
 burrow:'M3 18a9 7 0 0 1 18 0H3Zm5-7 1-3 2 2m2 0 2-2 1 3',
 crystal:'M12 2l4 6-1 9-3 5-3-5-1-9 4-6Zm-7 8 3 2-1 6-3-3 1-5Zm14 0-1 5-3 3-1-6 5-2Z',
 fragment:'M12 4l4 6-2 8h-4l-2-8 4-6Z',
 boss:'M12 2a9 9 0 0 0-7 15v4h14v-4a9 9 0 0 0-7-15Zm-3.5 9a1.5 1.5 0 1 1 0 3 1.5 1.5 0 0 1 0-3Zm7 0a1.5 1.5 0 1 1 0 3 1.5 1.5 0 0 1 0-3Z',
}
export function CreatureGlyph({kind,className=''}:{kind:string;className?:string}){
 return <span aria-hidden="true" className={`ct-creature-glyph ${className}`}><svg viewBox="0 0 24 24"><path d={creatureShapes[kind]||creatureShapes.nibble} fill="currentColor"/></svg></span>
}
