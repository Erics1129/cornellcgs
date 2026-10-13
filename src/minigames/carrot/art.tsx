import type { CSSProperties } from 'react'
const base='/assets/minigames/carrot/'
const sheets:Record<string,string>={seed:'05-seed-tiers',frost:'06-frost-tiers',mortar:'07-mortar-tiers',prism:'08-prism-tiers',storm:'09-storm-tiers',blossom:'10-blossom-tiers',starfruit:'18-starfruit-tiers',gravity:'19-gravity-tiers',book:'20-book-tiers',thunder:'21-thunder-tiers'}
export const chapterArt=(biome:string)=>base+({garden:'01-garden-keyart',marsh:'03-marsh-keyart',frost:'04-frost-keyart',orchard:'23-orchard-keyart'}[biome]||'01-garden-keyart')+'.jpg'
export function TowerPortrait({kind,tier=1,className=''}:{kind:string;tier?:number;className?:string}){
 return <span aria-hidden="true" className={`ct-portrait ${className}`} style={{backgroundImage:`url(${base}${sheets[kind]||sheets.seed}.jpg)`,backgroundPosition:`${(Math.max(1,Math.min(4,tier))-1)*100/3}% 0%`}} />
}
export function BossPortrait({kind,className=''}:{kind:string;className?:string}){
 if(kind==='orchard')return <span aria-hidden="true" className={`ct-portrait ct-portrait--boss ct-portrait--plate ${className}`} style={{backgroundImage:`url(${base}25-hollowhead-menacing.jpg)`}}/>
 return <span aria-hidden="true" className={`ct-portrait ct-portrait--boss ${className}`} style={{backgroundImage:`url(${base}22-bosses-menacing.jpg)`,backgroundPosition:`0% ${kind==='marsh'?50:kind==='frost'?100:0}%`}}/>}
export function CarrotPortrait({pose=0,className=''}:{pose?:number;className?:string}){return <span aria-hidden="true" className={`ct-portrait ${className}`} style={{backgroundImage:`url(${base}02-carrot-animation.jpg)`,backgroundPosition:`${pose%4*100/3}% ${Math.floor(pose/4)*50}%`}}/>}
export function RouteDrawing({routes}: {routes?:Array<Array<{x:number;y?:number;z:number}|number[]>>}) {
 if(!routes?.length)return null
 const world=routes.some(r=>r.some(p=>!Array.isArray(p)&&p.x<0))
 return <svg className="ct-route-drawing" viewBox="0 0 16 12" aria-hidden="true">{routes.map((r,i)=><polyline key={i} points={r.map(p=>Array.isArray(p)?`${p[0]+.5},${p[1]+.5}`:`${p.x+(world?7.5:.5)},${p.z+(world?5.5:.5)}`).join(' ')} fill="none" stroke="currentColor" strokeWidth=".25" strokeLinecap="round" strokeLinejoin="round" opacity={1-i*.2}/> )}</svg>
}
export const meterStyle=(ratio:number)=>({'--fill':`${Math.max(0,Math.min(1,Number.isFinite(ratio)?ratio:0))*100}%`} as CSSProperties)
