import { useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react'
import type { CSSProperties } from 'react'
import type { Command, GameDefinitions, Selection, TowerDefinition } from '../types'
import type { SnapshotStore } from '../hooks/useSnapshot'
import { useSlice } from '../hooks/useSnapshot'
import { CreaturePortrait, SuperEmblem, TowerPortrait } from '../art'
import { miniBosses, towerTraits } from '../expansion'
import Icon from '../Icon'
import { readPrefs, writePrefs } from '../prefs'

const roman=['I','II','III','IV','S'],SuperTier=5,TopTier=4
/** Towers that hit more than one creature per attack (splash, chains, pierce, pulses); the rest strike a single target. */
const areaTowers=new Set(['mortar','storm','blossom','starfruit','gravity','thunder','bamboo','chili','magnet','mushroom','cactus','clockflower','dragonfruit'])
export const towerReach=(t:TowerDefinition)=>({air:t.air,area:areaTowers.has(t.id)})
const dps=(t:TowerDefinition)=>t.damage[0]/Math.max(.1,t.interval[0])
type Rect={x:number;y:number;w:number;h:number}
/** Where the HUD ends at the top and begins at the bottom (px). On phones some [data-top] parts sit at the bottom, so position decides. */
export function hudEdges(){
 const vh=innerHeight,top:number[]=[],bottom:number[]=[]
 for(const n of document.querySelectorAll<HTMLElement>('.ct-hud [data-top], .ct-hud [data-bottom]')){const r=n.getBoundingClientRect();if(!r.height||r.height>r.width*1.5)continue;if(r.top<vh/2)top.push(r.bottom);else bottom.push(r.top)}
 return {top:Math.max(0,...top),bottom:Math.min(vh,...bottom)}
}
const hit=(a:Rect,b:Rect)=>a.x<b.x+b.w&&b.x<a.x+a.w&&a.y<b.y+b.h&&b.y<a.y+a.h
const overlap=(a:Rect,b:Rect)=>Math.max(0,Math.min(a.x+a.w,b.x+b.w)-Math.max(a.x,b.x))*Math.max(0,Math.min(a.y+a.h,b.y+b.h)-Math.max(a.y,b.y))
export type PanelMode='anchored'|'sheet'|'side'
/** Phone portrait gets a bottom (or top) sheet, phone landscape a side sheet, everything else an anchored panel. */
export function panelMode():PanelMode{if(matchMedia('(max-height: 500px) and (orientation: landscape)').matches)return 'side';if(matchMedia('(max-width: 640px)').matches)return 'sheet';return 'anchored'}
/** The pad's own footprint on screen and the carrot's, so the panel can keep clear of both. */
export const padRect=(x:number,y:number):Rect=>({x:x-38,y:y-30,w:76,h:60})
export const carrotRect=(x:number,y:number):Rect=>({x:x-58,y:y-96,w:116,h:128})
/**
 * Places the panel once, when it opens: the candidate beside the pad (right, left, above, below and the four diagonals) that keeps
 * clear of the pad, the carrot, the nearest spawn gate and the HUD, preferring the side away from the carrot. Never re-placed while open.
 */
export function placePanel(size:{w:number;h:number},view:{w:number;h:number;top:number;bottom:number},pad:{x:number;y:number},carrot:{x:number;y:number}|null,spawns:Array<{x:number;y:number}>):{x:number;y:number}{
 const gap=46,margin=12,p=padRect(pad.x,pad.y),c=carrot?carrotRect(carrot.x,carrot.y):null
 const cands:Array<{x:number;y:number;pref:number}>=[
  {x:pad.x+gap,y:pad.y-size.h/2,pref:0},{x:pad.x-gap-size.w,y:pad.y-size.h/2,pref:0},
  {x:pad.x+gap*.6,y:pad.y-gap*.6-size.h,pref:12},{x:pad.x-gap*.6-size.w,y:pad.y-gap*.6-size.h,pref:12},
  {x:pad.x+gap*.6,y:pad.y+gap*.6,pref:12},{x:pad.x-gap*.6-size.w,y:pad.y+gap*.6,pref:12},
  {x:pad.x-size.w/2,y:pad.y-gap-size.h,pref:24},{x:pad.x-size.w/2,y:pad.y+gap,pref:24}]
 let best={x:margin,y:view.top,score:Infinity}
 for(const k of cands){
  const x=Math.max(margin,Math.min(view.w-size.w-margin,k.x)),y=Math.max(view.top,Math.min(view.bottom-size.h,k.y)),r={x,y,w:size.w,h:size.h}
  let score=k.pref+(Math.abs(x-k.x)+Math.abs(y-k.y))*.6
  if(hit(r,p))score+=100000+overlap(r,p)
  if(c&&hit(r,c))score+=5000+overlap(r,c)*.5
  if(c){const away=(x+size.w/2-pad.x)*(c.x-pad.x)<0;if(!away)score+=30}
  for(const s of spawns){const dx=Math.max(r.x-s.x,0,s.x-(r.x+r.w)),dy=Math.max(r.y-s.y,0,s.y-(r.y+r.h)),d=Math.hypot(dx,dy);if(d<110)score+=(110-d)*1.5}
  if(score<best.score)best={x,y,score}
 }
 return {x:Math.round(best.x),y:Math.round(best.y)}
}

type Props={store:SnapshotStore;definitions:GameDefinitions|null;send:(c:Command)=>void;reduced:boolean;onSafeArea:(panel:{rect:DOMRect|null;mode:PanelMode})=>void;onBuilt?:(kind:string)=>void;tutorialFocus?:string}
export function BuildMenu({store,definitions,send,reduced,onSafeArea,onBuilt,tutorialFocus}:Props){
 const sel=useSlice(store,st=>{const s=st?.selection;return st&&s&&['pad','tower','blocker','enemy'].includes(s.type)&&st.phase!=='won'&&st.phase!=='lost'?s:null},(a,b)=>a===b||(!!a&&!!b&&a.type===b.type&&a.id===b.id&&a.tier===b.tier&&a.refund===b.refund&&a.partners===b.partners&&Math.round(a.hp)===Math.round(b.hp)&&a.kind===b.kind))
 // Auto-close 0.8 s after Build or Upgrade, but only if the selection is still the tower that was just built or grown (a tap on
 // another pad in the meantime keeps its panel); pressing anything on the panel during those 0.8 s keeps it open.
 const arm=useRef<{id:number|null;timer:number}|null>(null),hover=useRef(false)
 useEffect(()=>store.subscribe(()=>{const a=arm.current;if(!a)return;const s=store.get()?.selection
  if(s?.type==='tower'&&a.id===null){a.id=s.id;return}
  if(!s||s.type!=='tower'||(a.id!==null&&s.id!==a.id)){if(s?.type!=='pad'){clearTimeout(a.timer);arm.current=null}}}),[store])
 useEffect(()=>()=>{if(arm.current)clearTimeout(arm.current.timer)},[])
 const closeSoon=(id:number|null)=>{if(arm.current)clearTimeout(arm.current.timer)
  hover.current=false
  const a={id,timer:0};a.timer=window.setTimeout(()=>{const s=store.get()?.selection;if(arm.current===a){arm.current=null;if(!hover.current&&s?.type==='tower'&&s.id===a.id)send({type:'clear'})}},800);arm.current=a}
 if(!sel||!definitions)return null
 return <Panel key={`${sel.type}-${sel.id}`} sel={sel} store={store} definitions={definitions} send={send} reduced={reduced} onSafeArea={onSafeArea} onBuilt={onBuilt} tutorialFocus={tutorialFocus} closeSoon={closeSoon} hover={hover}/>
}

function Panel({sel,store,definitions,send,reduced,onSafeArea,onBuilt,tutorialFocus,closeSoon,hover}:Props&{sel:Selection;definitions:GameDefinitions;closeSoon:(id:number|null)=>void;hover:React.MutableRefObject<boolean>}){
 const env=useSlice(store,st=>st?{coins:st.coins,level:st.level}:{coins:0,level:1})
 const el=useRef<HTMLElement>(null),[place,setPlace]=useState<{mode:PanelMode;style:CSSProperties;flip:boolean}|null>(null),[firstMode]=useState(panelMode)
 const towers=definitions.towers
 const available=useMemo(()=>{const open=towers.filter(t=>t.unlock<=env.level);const next=towers.filter(t=>t.unlock>env.level).sort((a,b)=>a.unlock-b.unlock)[0];return {open,next}},[towers,env.level])
 const [picked,setPicked]=useState(()=>{const last=readPrefs().lastTower;return available.open.some(t=>t.id===last)?last:available.open[0]?.id||'seed'})
 const pickedTower=towers.find(t=>t.id===picked)
 const maxDps=useMemo(()=>Math.max(...towers.map(dps)),[towers])
 useEffect(()=>{if(sel.type==='pad')send({type:'preview',kind:picked})},[picked,sel.type,send])
 // place once, when the panel opens
 useLayoutEffect(()=>{const node=el.current;if(!node)return
  const mode=firstMode,st=store.get(),vw=innerWidth,vh=innerHeight
  const edges=hudEdges(),top=edges.top+8,bottom=edges.bottom-8
  const pad={x:sel.x*vw,y:sel.y*vh},carrot=typeof st?.carrotX==='number'&&typeof st?.carrotY==='number'?{x:st.carrotX*vw,y:st.carrotY*vh}:null
  const spawnsPx=st?.spawnPoints?.map(s=>({x:s.x*vw,y:s.y*vh}))||[]
  if(mode==='sheet'){
   // the sheet docks above the bottom bar unless the pad (or the carrot) sits under it; then under the HUD; if both collide,
   // a compact panel anchored beside the pad takes over
   const r=node.getBoundingClientRect(),h=Math.min(200,r.height),p=padRect(pad.x,pad.y),c=carrot?carrotRect(carrot.x,carrot.y):null
   const low={x:r.x,y:r.y,w:r.width,h},high={x:r.x,y:top,w:r.width,h},bad=(q:Rect)=>hit(q,p)||(!!c&&hit(q,c))
   if(!bad(low))setPlace({mode,flip:false,style:{}})
   else if(!bad(high))setPlace({mode,flip:true,style:{top}})
   else{const w=Math.min(280,vw-24),at=placePanel({w,h:Math.min(h,190)},{w:vw,h:vh,top,bottom},pad,carrot,spawnsPx);setPlace({mode:'anchored',flip:false,style:{left:at.x,top:at.y,width:w}})}
  }else if(mode==='side'){
   const r=node.getBoundingClientRect(),w=r.width,right={x:r.x,y:top,w,h:vh-top},left={x:8,y:top,w,h:vh-top},p=padRect(pad.x,pad.y),c=carrot?carrotRect(carrot.x,carrot.y):null
   const bad=(r:Rect)=>(hit(r,p)?2:0)+(c&&hit(r,c)?1:0)
   const flip=bad(right)>bad(left)
   const sideTop=top
   if(bad(right)&&bad(left)){const h=Math.min(node.scrollHeight,vh-top-12),at=placePanel({w,h},{w:vw,h:vh,top,bottom:vh-12},pad,carrot,spawnsPx);setPlace({mode:'anchored',flip:false,style:{left:at.x,top:at.y,width:w,maxHeight:h}})}
   else setPlace({mode,flip,style:{'--side-top':`${sideTop}px`} as CSSProperties})
  }else{
   const at=placePanel({w:node.offsetWidth,h:node.offsetHeight},{w:vw,h:vh,top,bottom},pad,carrot,spawnsPx)
   setPlace({mode,flip:false,style:{left:at.x,top:at.y}})
  }
 },[])
 useEffect(()=>{if(!place)return;const node=el.current;onSafeArea({rect:node?node.getBoundingClientRect():null,mode:place.mode});return()=>onSafeArea({rect:null,mode:place.mode})},[place,onSafeArea])
 const build=()=>{if(!pickedTower)return;writePrefs({lastTower:pickedTower.id});send({type:'buy',kind:pickedTower.id});onBuilt?.(pickedTower.id);closeSoon(null)}
 const mode=place?.mode||firstMode
 const cls=`ct-build ct-panel ct-build--${mode} ${place?.flip?'is-flipped':''} ${place?'is-placed':''} ${reduced?'':'is-animated'}`
 const shared={ref:el as React.RefObject<HTMLElement>,className:cls,style:place?.style,onPointerDown:()=>{hover.current=true},onPointerLeave:()=>{hover.current=false}}
 const close=<button className="ct-icon-btn ct-build__close" aria-label="Close" onClick={()=>send({type:'clear'})}><Icon name="close"/></button>
 if(sel.type==='pad'){
  const t=pickedTower,locked=!!t&&t.unlock>env.level,short=t?Math.max(0,t.cost[0]-env.coins):0,reach=t?towerReach(t):null
  return <aside {...shared} aria-label="Choose a tower">
   <div className="ct-build__tiles" role="listbox" aria-label="Towers" aria-orientation={mode==='side'?'vertical':'horizontal'}>
    {available.open.map(d=>{const r=towerReach(d),cant=d.cost[0]>env.coins
     return <button key={d.id} role="option" aria-selected={picked===d.id} className={`ct-tile ${picked===d.id?'is-picked':''} ${cant?'is-short':''} ${tutorialFocus===d.id?'is-spotlight':''}`} onClick={()=>setPicked(d.id)} onDoubleClick={()=>{setPicked(d.id);if(!cant)build()}} aria-label={`${d.name}, ${d.cost[0]} coins, ${r.air?'hits air and ground':'ground only'}, ${r.area?'area':'single target'}`}>
      <TowerPortrait kind={d.id}/><span className="ct-tile__cost">{d.cost[0]}</span>{r.air&&<i className="ct-tile__air" aria-hidden="true"><Icon name="wing"/></i>}
     </button>})}
    {available.next&&<span className="ct-tile is-locked" aria-label={`${available.next.name} opens at level ${available.next.unlock}`}><TowerPortrait kind={available.next.id}/><span className="ct-tile__cost"><Icon name="lock"/>{available.next.unlock}</span></span>}
   </div>
   {t&&reach&&<div className="ct-build__info">
    <div className="ct-build__name"><b>{t.name}</b><span className="ct-badges"><span className={`ct-badge ${reach.air?'is-air':''}`}><Icon name={reach.air?'wing':'leaf'}/>{reach.air?'Air':'Ground'}</span><span className="ct-badge"><Icon name={reach.area?'splash':'target'}/>{reach.area?'Area':'Single'}</span></span></div>
    <p>{towerTraits[t.id]||t.role}</p>
    <div className="ct-dps" aria-label={`Damage per second ${dps(t).toFixed(0)}, reach ${t.range[0].toFixed(1)}`}><span className="ct-label">DPS</span><span className="ct-dps__bar"><i style={{transform:`scaleX(${(dps(t)/maxDps).toFixed(3)})`}}/></span><span className="ct-dps__reach"><Icon name="target"/>{t.range[0].toFixed(1)}</span></div>
   </div>}
   <div className="ct-build__actions">
    <button className={`ct-cta ct-build__go ${tutorialFocus==='build'?'is-spotlight':''}`} disabled={!t||locked||short>0} onClick={build}>{!t?'Choose':locked?`Opens at level ${t.unlock}`:short>0?<>Need <b>{short}</b> more</>:<>Build <span className="ct-cta__cost"><Icon name="coin"/>{t.cost[0]}</span></>}</button>
    {close}
   </div>
  </aside>
 }
 if(sel.type==='tower'){
  const d=towers.find(x=>x.id===sel.kind);if(!d)return null
  const tier=Math.max(1,Math.min(SuperTier,sel.tier||1)),isSuper=tier>=SuperTier,partners=sel.partners||0
  const canGrow=tier<TopTier&&d.damage.length>tier,cost=d.cost[tier]??0,short=Math.max(0,cost-env.coins)
  return <aside {...shared} aria-label="Selected defense">
   <div className="ct-build__tower">
    <TowerPortrait kind={d.id} tier={tier}/>
    <div><b>{isSuper?sel.superName||d.superName||d.name:d.name}</b><span className="ct-tag">{isSuper?`Super · ${d.name}`:`Tier ${roman[tier-1]}`}</span><p>{isSuper?d.superTrait||d.role:towerTraits[d.id]||d.role}</p></div>
   </div>
   <div className="ct-tiers" aria-label={`Tier ${tier} of 4${isSuper?', Super':''}`}>{roman.map((r,i)=>{const t=i+1,superCell=t===SuperTier,lockedSuper=superCell&&!isSuper&&partners===0
    return <span key={r} className={`${t===tier?'is-current':t<tier?'is-done':''} ${superCell?'is-super':''} ${lockedSuper?'is-locked':''}`}>{superCell?<SuperEmblem kind={d.id}/>:null}<b>{r}</b></span>})}</div>
   <div className="ct-stats"><span><small>Power</small><b>{d.damage[tier-1]}</b>{canGrow&&<span className="ct-next">→ {d.damage[tier]}</span>}</span><span><small>Reach</small><b>{d.range[tier-1].toFixed(1)}</b>{canGrow&&<span className="ct-next">→ {d.range[tier].toFixed(1)}</span>}</span></div>
   {tier===TopTier&&partners>0&&<p className="ct-helper">Drag onto its Tier IV twin, or press Merge.</p>}
   <div className="ct-build__actions">
    <button className="ct-sell" onClick={()=>send({type:'sell'})} aria-label={`Sell for ${sel.refund} coins`}><Icon name="sell"/><span>{sel.refund}</span></button>
    {isSuper?<span className="ct-chip is-info"><SuperEmblem kind={d.id}/>Super</span>
    :tier===TopTier?partners>0?<button className="ct-cta" onClick={()=>send({type:'mergeArm',id:sel.id})}>Merge<Icon name="merge"/></button>:<button className="ct-cta" disabled>Grow a twin</button>
    :<button className="ct-cta" disabled={short>0} onClick={()=>{send({type:'upgrade'});closeSoon(sel.id)}}>{short>0?<>Need <b>{short}</b></>:<>Upgrade <span className="ct-cta__cost"><Icon name="coin"/>{cost}</span></>}</button>}
    {close}
   </div>
  </aside>
 }
 const creature=sel.type==='enemy'?miniBosses.find(m=>m.id===sel.kind):undefined
 return <aside {...shared} aria-label={sel.type==='blocker'?'Scenery':'Focus target'}>
  <div className="ct-build__tower">
   {creature?<CreaturePortrait kind={creature.id}/>:<span className="ct-focus-icon"><Icon name={sel.type==='blocker'?'leaf':'target'}/></span>}
   <div><b>{creature?.name||sel.kind.replace(/([a-z])([A-Z])/g,'$1 $2')}</b><span className="ct-tag">{sel.type==='blocker'?'Towers clearing':'Towers focused'}</span>{creature&&<p>{creature.detail}</p>}</div>
  </div>
  <div className="ct-stats"><span className="ct-hpline"><span className="ct-minibar__bar"><i style={{transform:`scaleX(${sel.maxHp>0?Math.max(0,Math.min(1,sel.hp/sel.maxHp)):0})`}}/></span><b>{Math.ceil(sel.hp)}<small> / {Math.ceil(sel.maxHp)}</small></b></span></div>
  <div className="ct-build__actions">{close}</div>
 </aside>
}
