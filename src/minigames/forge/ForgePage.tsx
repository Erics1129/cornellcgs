import { useEffect, useRef, useState, type ReactNode } from 'react'
import MinigameShell from '../MinigameShell'
import { CHARMS, FAMILIES, ITEMS, METALS, RESULT_LABELS, RULES, WORLD } from './config'
import type { Charm, Item, Metal } from './config'
import { act, bestKnife, bonus, expectedValue, flowNeed, knifeName, odds, price, saleValue, value } from './engine'
import type { Action, GameEvent, Place } from './engine'
import { API, api, cleanName, fresh, identity, loadSession, localScores, recordLocal, saveName, saveSession } from './storage'
import type { Score, Session, Ticket } from './storage'
import { ForgeUnity } from './unity'
import { ForgeAudio } from './audio'
import KnifePortrait from './KnifePortrait'
import ForgeIcon from './ForgeIcon'
import './forge.css'
const format=(n:number)=>Math.round(n).toLocaleString('en-US')
const tutorial=[['Forge','Press Space or tap the blade. New heats and places a blank for you.'],['Keep or sell','Keep saves a blade on the rack. Trade buys metal and sells any knife, from anywhere.'],['Explore','WASD or the touch pad moves your smith. Drag to look. E picks up and places objects.'],['Seven days','Rest keeps your four best knives. Your best surviving knife after day seven is your score. Gold is only for supplies.']]
const itemIcons:Record<Item,string>={guard:'guard',rewind:'rewind',whetstone:'hammer',stamina:'bolt'}
const itemNames:Record<Item,string>={guard:'Guard',rewind:'Undo',whetstone:'Hone',stamina:'Energy'}
function Modal({title,close,children}:{title:string;close:()=>void;children:ReactNode}){const ref=useRef<HTMLDialogElement>(null);useEffect(()=>{const d=ref.current!;d.showModal();return()=>d.close()},[]);return <dialog ref={ref} className="ff-modal" onCancel={e=>{e.preventDefault();close()}} onClick={e=>{if(e.target===e.currentTarget)close()}}><div className="ff-modal-head"><h2>{title}</h2><button aria-label="Close dialog" onClick={close}>×</button></div>{children}</dialog>}
export default function ForgePage(){
 const [session,setSession]=useState(loadSession),sessionRef=useRef(session)
 const [selected,setSelected]=useState<number|null>(()=>session.state.knives.find(n=>n.place==='anvil')?.id||session.state.knives[0]?.id||null),selectedRef=useRef(selected)
 const [ready,setReady]=useState(false)
 const [preparing,setPreparing]=useState<number|null>(null),prepareId=useRef<number|null>(null),busyLock=useRef(false)
 const [tradeTab,setTradeTab]=useState<'buy'|'sell'>('buy'),[category,setCategory]=useState<'metal'|'tools'|'charms'>('metal')
 const [immersive,setImmersive]=useState(false)
 const [notice,setNotice]=useState('')
 const [event,setEvent]=useState<GameEvent|null>(null),[busy,setBusy]=useState(false)
 const [panel,setPanel]=useState<'shop'|'board'|'end'|'help'|null>(null)
 const [sceneError,setSceneError]=useState(''),[saveError,setSaveError]=useState(false)
 const [scores,setScores]=useState<Score[]>(localScores),[myScore,setMyScore]=useState<Score|null>(null),[boardStatus,setBoardStatus]=useState(API?'Connecting to world board…':'World board offline · Local scores on this device'),[posting,setPosting]=useState(false)
 const [player]=useState(identity),[name,setName]=useState(player.name),[audio]=useState(()=>new ForgeAudio()),[muted,setMuted]=useState(audio.muted)
 const root=useRef<HTMLDivElement>(null),scene=useRef<ForgeUnity|null>(null),unlock=()=>audio.start()
 const immersiveRef=useRef(immersive);immersiveRef.current=immersive
 const maxScreen=async()=>{if(document.fullscreenElement){await document.exitFullscreen();setImmersive(false);return}if(immersiveRef.current){setImmersive(false);return}setImmersive(true);const game=root.current?.closest('.ff-page') as HTMLElement|null;try{await game?.requestFullscreen?.({navigationUI:'hide'})}catch{/* iPhone browsers use the viewport-filling layout */}}
 const touchControl=(code:string,label:string,icon:string,className='')=><button key={code} className={`ff-touch-key ${className}`} disabled={s.ended||(busy&&(code==='KeyE'||code==='Space'))} aria-label={label} onPointerDown={e=>{e.preventDefault();e.currentTarget.setPointerCapture(e.pointerId);scene.current?.control(code,true);e.currentTarget.dataset.pressed='true'}} onPointerUp={e=>{scene.current?.control(code,false);delete e.currentTarget.dataset.pressed;if(e.currentTarget.hasPointerCapture(e.pointerId))e.currentTarget.releasePointerCapture(e.pointerId)}} onPointerCancel={e=>{scene.current?.control(code,false);delete e.currentTarget.dataset.pressed}} onLostPointerCapture={e=>{scene.current?.control(code,false);delete e.currentTarget.dataset.pressed}}><span aria-hidden="true">{icon}</span><small>{label}</small></button>
 useEffect(()=>{const change=()=>setImmersive(!!document.fullscreenElement);document.addEventListener('fullscreenchange',change);return()=>document.removeEventListener('fullscreenchange',change)},[])
 const s=session.state,k=s.knives.find(k=>k.id===selected),anvil=s.knives.find(k=>k.place==='anvil'),best=bestKnife(s),heating=s.knives.find(k=>k.place==='furnace'&&!k.heated)
 const choose=(id:number)=>{selectedRef.current=id;setSelected(id)}
 const sendRef=useRef<(a:Action)=>void>(()=>{})
 const hitRef=useRef<()=>void>(()=>{})
 const send=(action:Action)=>{
  const current=sessionRef.current,result=act(current.state,action)
  if(!result.ok){setNotice(result.event.text);return false}
  const actions=[...current.actions],last=actions.at(-1)
  if(action.type==='wait'&&last?.type==='wait'&&last.seconds+action.seconds<=RULES.maxWait)actions[actions.length-1]={type:'wait',seconds:last.seconds+action.seconds};else actions.push(action)
  const next={...current,state:result.state,actions};sessionRef.current=next;setSession(next)
  if(action.type!=='wait'){setEvent(result.event);setNotice(action.type==='buy'?'Purchased':action.type==='sell'?'Sold':action.type==='move'&&action.to==='rack'?'Kept':action.type==='use'?itemNames[action.item]:action.type==='flow'?'Flow ready':'');setSaveError(!saveSession(next));const a=result.event;if(a.kind!=='hit')audio.play(a.kind);else{audio.play(a.outcome!,a.after?.level||0);if(a.evolution)audio.play('evolution');if(!matchMedia('(prefers-reduced-motion: reduce)').matches)navigator.vibrate?.(a.outcome==='shatter'?[20,30,30]:12)}
   if(a.id&&action.type!=='buy'&&result.state.knives.some(n=>n.id===a.id))choose(a.id)
   if(!result.state.knives.some(n=>n.id===selectedRef.current))choose(result.state.knives.find(n=>n.place==='anvil')?.id||result.state.knives[0]?.id||0)
   if(action.type==='end'){choose(result.state.knives[0]?.id||0);setPanel(null)}
  }
  scene.current?.sync(result.state,selectedRef.current,result.event)
  return true
 }
 sendRef.current=send
 const prepare=(id?:number)=>{
  if(busyLock.current||prepareId.current||!ready||sessionRef.current.state.ended)return
  const current=sessionRef.current.state
  const target=id?current.knives.find(n=>n.id===id):current.knives.find(n=>n.place==='furnace')||current.knives.find(n=>n.place==='crate'&&!n.heated)||current.knives.find(n=>n.place==='crate')
  if(!target){setPanel('shop');setTradeTab('buy');return}
  unlock();choose(target.id);scene.current?.focus()
  const previous=current.knives.find(n=>n.place==='anvil'&&n.id!==target.id)
  if(previous&&!send({type:'move',id:previous.id,to:current.knives.filter(n=>n.place==='rack').length<RULES.rackSlots?'rack':'crate'}))return
  if(target.heated){if(target.place!=='anvil')send({type:'move',id:target.id,to:'anvil'});return}
  const furnace=sessionRef.current.state.knives.find(n=>n.place==='furnace'&&n.id!==target.id)
  if(furnace)send({type:'move',id:furnace.id,to:'crate'})
  prepareId.current=target.id;setPreparing(target.id)
  if(target.place!=='furnace')send({type:'move',id:target.id,to:'furnace'})
 }
 const prepareRef=useRef(prepare);prepareRef.current=prepare
 const hit=()=>{
  unlock();if(busyLock.current||prepareId.current||!ready)return
  const current=sessionRef.current.state,target=current.knives.find(n=>n.place==='anvil')
  if(!target?.heated){prepareRef.current();return}
  if(current.stamina<=0){setPanel('end');return}
  choose(target.id);busyLock.current=true;setBusy(true)
  const started=scene.current?.strike(()=>sendRef.current({type:'hit',id:target.id}))
  if(!started){busyLock.current=false;setBusy(false)}
 }
 hitRef.current=hit
 useEffect(()=>{
  if(!root.current)return
  try{const g=new ForgeUnity(root.current,{ready:()=>{setReady(true);scene.current?.focus()},settled:()=>{busyLock.current=false;setBusy(false)},select:choose,drop:(id,spot)=>{if(['crate','rack','furnace','anvil'].includes(spot))sendRef.current({type:'move',id,to:spot as Place});else if(spot==='sell')sendRef.current({type:'sell',id})},hit:()=>hitRef.current(),spot:spot=>{if(spot==='shop')setPanel('shop');if(spot==='lantern')setPanel('end')},gesture:()=>audio.start(),labels:()=>{},error:setSceneError,context:()=>{},near:()=>{},notice:setNotice,command:(kind,id,key)=>{if(kind==='buy'&&key)sendRef.current({type:'buy',key});else if(kind==='end')setPanel('end');else if(kind==='flow')sendRef.current({type:'flow',id});else if(['guard','rewind','whetstone','stamina'].includes(kind))sendRef.current({type:'use',item:kind as Item,id:id||undefined})}});scene.current=g;g.sync(sessionRef.current.state,selectedRef.current);return()=>{g.dispose();scene.current=null}}
  catch{setSceneError('Unity could not start. Reload to try again; your saved run is safe.')}
 },[audio])
 useEffect(()=>{scene.current?.sync(sessionRef.current.state,selected)},[selected])
 useEffect(()=>{if(!heating)return;const id=heating.id,t=setTimeout(()=>{
  sendRef.current({type:'heat',id})
  if(prepareId.current===id){sendRef.current({type:'move',id,to:'anvil'});prepareId.current=null;setPreparing(null);scene.current?.focus()}
 },RULES.heatSeconds*1000);return()=>clearTimeout(t)},[heating?.id])
 useEffect(()=>{if(!notice)return;const t=setTimeout(()=>setNotice(''),2400);return()=>clearTimeout(t)},[notice])
 useEffect(()=>{if(!panel)return;scene.current?.control('clear',false)},[panel])
 useEffect(()=>{const tick=setInterval(()=>{if(!document.hidden&&!sessionRef.current.state.ended)sendRef.current({type:'wait',seconds:1})},1000);const save=()=>{saveSession(sessionRef.current);if(document.hidden)audio.suspend()};window.addEventListener('pagehide',save);document.addEventListener('visibilitychange',save);return()=>{clearInterval(tick);saveSession(sessionRef.current);window.removeEventListener('pagehide',save);document.removeEventListener('visibilitychange',save);audio.dispose()}},[audio])
 useEffect(()=>{const key=(e:KeyboardEvent)=>{if(e.key==='Escape'){setImmersive(false);setPanel(null)}if(e.target instanceof HTMLElement&&['INPUT','TEXTAREA'].includes(e.target.tagName))return;if(e.code==='KeyT'){setPanel(p=>p==='shop'?null:'shop');setTradeTab('buy')}if(e.code==='KeyH')setPanel('help');if(e.code==='KeyL')setPanel('board');if(e.code==='KeyV')void maxScreen();if(e.code==='KeyN'&&sessionRef.current.state.ended)void newRun()};window.addEventListener('keydown',key);return()=>window.removeEventListener('keydown',key)},[])
 const refreshBoard=async()=>{if(!API){setScores(localScores());return}try{const data=await api<{scores:Score[];player:Score|null}>(`/scores?playerId=${encodeURIComponent(player.playerId)}`);setScores(data.scores);setMyScore(data.player);setBoardStatus('World board · Verified runs')}catch{setScores(localScores());setBoardStatus('World board offline · Local scores on this device')}}
 useEffect(()=>{if(panel!=='board')return;void refreshBoard();const t=setInterval(()=>void refreshBoard(),RULES.leaderboardRefreshMs);return()=>clearInterval(t)},[panel])
 const newRun=async()=>{setPosting(true);let next:Session;try{if(API){const ticket=await api<Ticket>('/runs',{playerId:player.playerId,proof:player.proof});next=fresh(ticket.seed,ticket)}else next=fresh()}catch(e){setNotice(`Starting locally. ${(e as Error).message}`);next=fresh()}sessionRef.current=next;setSession(next);choose(next.state.knives[0].id);setEvent(null);saveSession(next);scene.current?.sync(next.state,next.state.knives[0].id);setPosting(false);setPanel(null)}
 const autoTicket=useRef<Promise<Ticket>|null>(null)
 useEffect(()=>{if(!API||sessionRef.current.ticket||sessionRef.current.actions.some(a=>a.type!=='wait'))return;let active=true;if(!autoTicket.current)autoTicket.current=api<Ticket>('/runs',{playerId:player.playerId,proof:player.proof});void autoTicket.current.then(ticket=>{if(!active||sessionRef.current.ticket||sessionRef.current.actions.some(a=>a.type!=='wait'))return;const next=fresh(ticket.seed,ticket);sessionRef.current=next;setSession(next);choose(next.state.knives[0].id);saveSession(next);scene.current?.sync(next.state,next.state.knives[0].id)}).catch(()=>{if(active)setBoardStatus('World board offline · Local scores on this device')});return()=>{active=false}},[player])
 const submit=async()=>{if(posting)return;setPosting(true);saveName(player,name);setName(player.name);const winner=bestKnife(sessionRef.current.state);const score:Score={playerId:player.playerId,name:cleanName(name),value:winner?value(winner,sessionRef.current.state):0,level:winner?.level||0,knife:winner||null};recordLocal(score)
  try{if(API&&session.ticket){await api('/scores',{playerId:player.playerId,proof:player.proof,name:score.name,runId:session.ticket.id,actions:session.actions,knife:winner||null});setBoardStatus('World score submitted.')}else setBoardStatus(API?'This was a local run. Start a new run to qualify for the world board.':'World board offline · Saved on this device')}catch(e){setBoardStatus(`Saved locally. ${(e as Error).message}`)}setScores(localScores());setPosting(false);setPanel('board')}
 const end=()=>{
  if(busyLock.current||prepareId.current)return
  unlock();const current=sessionRef.current.state
  if(current.day<7){
   const keep=[...current.knives].sort((a,b)=>value(b,current)-value(a,current)).slice(0,RULES.rackSlots)
   for(const n of current.knives.filter(n=>n.place==='rack'&&!keep.some(k=>k.id===n.id)))send({type:'move',id:n.id,to:'crate'})
   for(const n of keep)if(n.place!=='rack')send({type:'move',id:n.id,to:'rack'})
  }
  send({type:'end'})
 }
 const trade=(tab:'buy'|'sell')=>{unlock();setTradeTab(tab);setPanel('shop')}
 const keep=()=>{if(k&&!busyLock.current&&!prepareId.current){unlock();send({type:'move',id:k.id,to:'rack'})}}
 const buy=(key:string)=>{unlock();send({type:'buy',key})}
 const locked=busy||preparing!==null||s.ended||!ready
 const forgeKnife=anvil||k
 const riskKnife=forgeKnife

 const t=riskKnife?odds(riskKnife,s):null,ev=riskKnife?expectedValue(riskKnife,s):0
 return <MinigameShell pageId="forge-or-fold" title="Forge or Fold" back={{href:'/minigames/',label:'All games'}} skip={{href:'#forge-main',label:'Skip to forge'}} className={`ff-page ${immersive?'is-immersive':''}`}>
 <main id="forge-main" className="ff-main" tabIndex={-1}>
  <div className="ff-scene" ref={root} data-testid="forge-scene"/>
  <div className="ff-vignette" aria-hidden="true"/>
  <header className="ff-topbar">
   <a href="/minigames/" className="ff-icon-button" aria-label="Back to games"><ForgeIcon name="back"/></a>
   <h1>FORGE <span>/</span> FOLD</h1>
   <div className="ff-stats" aria-label="Run status"><span title="Day"><small>DAY</small><b>{s.day}<em>/7</em></b></span><span title="Strikes remaining"><ForgeIcon name="bolt"/><b>{s.stamina}</b></span><span title="Gold"><ForgeIcon name="coin"/><b>{format(s.gold)}</b></span></div>
   <nav className="ff-tools" aria-label="Game tools">
    <button className="ff-icon-button" aria-label="Scores" onClick={()=>setPanel('board')}><ForgeIcon name="trophy"/></button>
    <button className="ff-icon-button" aria-label="Help" onClick={()=>setPanel('help')}><ForgeIcon name="help"/></button>
    <button className="ff-icon-button" aria-label={muted?'Unmute sound':'Mute sound'} onClick={()=>{unlock();audio.setMuted(!muted);setMuted(!muted)}}><ForgeIcon name={muted?'mute':'sound'}/></button>
    <button className="ff-icon-button ff-maximize" aria-label={immersive?'Exit full screen':'Enter full screen'} onClick={()=>void maxScreen()}><ForgeIcon name="full"/></button>
   </nav>
  </header>
  {sceneError&&<div className="ff-scene-error" role="alert">{sceneError}</div>}
  {ready&&<>
   <section className="ff-blade-info" aria-label="Blade and exact odds">
    <div className="ff-blade-title"><span>{forgeKnife?METALS[forgeKnife.metal].name:'The forge'}</span><b>{forgeKnife?FAMILIES[forgeKnife.family]:'Ready.'}</b>{forgeKnife&&<em>+{forgeKnife.level}</em>}</div>
    {riskKnife&&<><div className="ff-blade-value"><strong>{format(value(riskKnife,s))}</strong><span>value</span><small title="Expected value after one more hit">Next avg. {format(ev)}</small></div>
     <div className="ff-risk" aria-label="Exact odds for the next hit">{t&&Object.entries(t).map(([key,p])=><span className={`ff-prob-${key}`} key={key} title={RESULT_LABELS[key as keyof typeof RESULT_LABELS]}><b>{Math.round(p*100)}%</b><small>{RESULT_LABELS[key as keyof typeof RESULT_LABELS]}</small></span>)}</div>
     <div className="ff-status-marks">{riskKnife.guard&&<span><ForgeIcon name="guard"/>Guarded</span>}{riskKnife.flow>0&&<span><ForgeIcon name="bolt"/>{riskKnife.flow} safe hits</span>}</div>
    </>}
   </section>
   <aside className="ff-quick-tools" aria-label="Forging tools">{(Object.keys(ITEMS) as Item[]).map(item=><button key={item} disabled={locked||!s.items[item]||(item==='rewind'&&!s.lastHit)||(!k&&item!=='stamina'&&item!=='rewind')} aria-label={`${itemNames[item]} (${s.items[item]})`} title={`${itemNames[item]} · ${ITEMS[item].description}`} onClick={()=>{unlock();send({type:'use',item,id:k?.id})}}><ForgeIcon name={itemIcons[item]}/><b>{s.items[item]}</b><small>{itemNames[item]}</small></button>)}{s.charms.length>0&&<button className="ff-charms-button" aria-label="View charms" onClick={()=>{trade('buy');setCategory('charms')}}><span>◇</span><b>{s.charms.length}</b><small>Charms</small></button>}</aside>
   <div className="ff-feedback" role="status" aria-live="polite">{heating?<span key={heating.id} className="ff-heating"><ForgeIcon name="fire"/>Heating<span className="ff-heat-bar"/></span>:event?.kind==='hit'?<div key={s.totalHits} className={`ff-outcome ff-outcome-${event.outcome}`}><b>{event.evolution?'Evolved':RESULT_LABELS[event.outcome!]}</b><span>{event.outcome==='perfect'?'+2':event.outcome==='good'?'+1':event.outcome==='chip'?'−1':event.outcome==='shatter'?'Gone':'—'}</span></div>:null}{notice&&<span className="ff-toast">{notice}</span>}</div>
   <div className="ff-touch-controls" aria-label="Touch movement"><div className="ff-dpad">{touchControl('KeyW','Move forward','▲','ff-pad-up')}{touchControl('KeyA','Move left','◀','ff-pad-left')}<span className="ff-pad-center"/>{touchControl('KeyD','Move right','▶','ff-pad-right')}{touchControl('KeyS','Move backward','▼','ff-pad-down')}</div>{touchControl('KeyE','Handle','✋','ff-pad-handle')}</div>
   <div className="ff-control-hint"><kbd>WASD</kbd> Move <span>Drag to look</span><kbd>E</kbd> Handle</div>
   {s.offer&&anvil?.id===s.offer.knifeId&&<button className="ff-buyer" disabled={locked} onClick={()=>send({type:'offer',id:anvil.id})}><ForgeIcon name="coin"/><span>Buyer <b>{format(Math.round(value(anvil,s)*s.offer.multiplier*(1+bonus(s,'buyer'))))}</b></span><small>{s.offer.remaining}s</small><ForgeIcon name="sell"/></button>}
   <div className="ff-bottom">
    <section className="ff-knives" aria-label="Your knives">{s.knives.map(n=><button key={n.id} className={`ff-knife-card ${n.id===selected?'is-selected':''} ${n.place==='rack'?'is-kept':''}`} disabled={locked} aria-label={`${METALS[n.metal].name} ${FAMILIES[n.family]}, level ${n.level}, ${n.place}`} aria-pressed={n.id===selected} title={`${knifeName(n)} · ${format(value(n,s))}`} onClick={()=>prepare(n.id)}><span><b>+{n.level}</b>{n.place==='rack'&&<ForgeIcon name="keep"/>}</span><KnifePortrait knife={n}/><small>{METALS[n.metal].name}</small></button>)}<button className="ff-new" aria-label="Prepare new knife" disabled={locked} onClick={()=>prepare()}><ForgeIcon name="plus"/><span>New</span></button></section>
    <div className="ff-actionbar">
     <button disabled={locked} onClick={()=>trade('buy')}><ForgeIcon name="shop"/><span>Trade</span><kbd>T</kbd></button>
     <button disabled={locked||!k||k.place==='rack'} onClick={keep}><ForgeIcon name="keep"/><span>Keep</span></button>
     <button className="ff-strike" disabled={locked} aria-label={preparing?'Heating':!anvil?'Prepare and forge':'Forge'} onClick={hit}><ForgeIcon name={preparing?'fire':'hammer'}/><span>{preparing?'Heating':!anvil?'Start forging':'Forge'}</span><kbd>Space</kbd></button>
     <button disabled={locked||!k} onClick={()=>trade('sell')}><ForgeIcon name="sell"/><span>Sell</span></button>
     <button disabled={locked} onClick={()=>setPanel('end')}><ForgeIcon name="moon"/><span>Rest</span></button>
    </div>
    {riskKnife&&<button className={`ff-flow ${riskKnife.flow?'is-active':''}`} disabled={locked||riskKnife.pips<flowNeed(s)||!!riskKnife.flow} onClick={()=>send({type:'flow',id:riskKnife.id})} title="Three hits with no shatter risk"><ForgeIcon name="bolt"/><span>Flow</span><div>{Array.from({length:flowNeed(s)},(_,i)=><i key={i} className={i<riskKnife.pips||riskKnife.flow?'is-filled':''}/>)}</div><b>{riskKnife.flow||`${riskKnife.pips}/${flowNeed(s)}`}</b></button>}
   </div>
  </>}
  {saveError&&<p className="ff-warning" role="alert">Saving unavailable. Keep this tab open.</p>}
 </main>
 {panel==='shop'&&<Modal title="Trade" close={()=>setPanel(null)}>
  <div className="ff-trade-art"><img src="/assets/forge/generated/trade-v2.png" alt=""/><span><ForgeIcon name="coin"/>{format(s.gold)}</span></div>
  <div className="ff-tabs" role="tablist" aria-label="Trade"><button role="tab" aria-selected={tradeTab==='buy'} onClick={()=>setTradeTab('buy')}>Buy</button><button role="tab" aria-selected={tradeTab==='sell'} onClick={()=>setTradeTab('sell')}>Sell <small>{s.knives.length}</small></button></div>
  {tradeTab==='buy'?<><div className="ff-categories">{(['metal','tools','charms'] as const).map(c=><button key={c} aria-pressed={category===c} onClick={()=>setCategory(c)}>{c==='metal'?'Metal':c==='tools'?'Tools':'Charms'}</button>)}</div><div className="ff-shop-grid">{Object.entries(s.stock).filter(([key])=>category==='metal'?key.startsWith('metal:'):category==='charms'?key.startsWith('charm:'):!key.includes(':')).map(([key,stock])=>{const metal=key.startsWith('metal:')?key.slice(6) as Metal:null;const item=metal?METALS[metal]:key.startsWith('charm:')?CHARMS[key.slice(6) as Charm]:ITEMS[key as Item];return <button key={key} disabled={!stock||price(s,key)>s.gold||s.ended||busy||preparing!==null||(key.startsWith('charm:')&&s.charms.length>=RULES.charmSlots)} aria-label={`Buy ${item.name} for ${price(s,key)} gold`} onClick={()=>buy(key)}>{metal?<div className="ff-ingot" style={{'--metal-color':METALS[metal].color} as React.CSSProperties}/>:<ForgeIcon name={key.startsWith('charm:')?'guard':itemIcons[key as Item]}/>}<strong>{item.name}</strong><small>{'description'in item?item.description:`Base ${format(item.base)}`}</small><span><b>{format(price(s,key))} <ForgeIcon name="coin"/></b><em>{stock} left</em></span></button>})}</div>{category==='charms'&&s.charms.length>0&&<div className="ff-owned-charms">{s.charms.map(c=><span title={CHARMS[c].description} key={c}>◇ {CHARMS[c].name}</span>)}</div>}</>:<><p className="ff-trade-note">Sold knives leave your score.</p><div className="ff-sell-list">{s.knives.map(n=><div key={n.id}><KnifePortrait knife={n}/><span><strong>{METALS[n.metal].name} +{n.level}</strong><small>{n.place==='rack'?'Kept':FAMILIES[n.family]}</small></span><button disabled={busy||preparing!==null||s.ended} aria-label={`Sell ${METALS[n.metal].name} level ${n.level} for ${saleValue(s,n)} gold`} onClick={()=>{unlock();send({type:'sell',id:n.id})}}>{format(saleValue(s,n))}<ForgeIcon name="coin"/><ForgeIcon name="sell"/></button></div>)}{!s.knives.length&&<p>No knives to sell.</p>}</div></>}
  <div className="ff-trade-message" role="status">{notice||' '}</div><button className="ff-primary ff-return" onClick={()=>setPanel(null)}>Back to forge</button>
 </Modal>}
 {panel==='end'&&!s.ended&&<Modal title={s.day===7?'Finish your run?':'Rest?'} close={()=>setPanel(null)}><p className="ff-dialog-lead">{s.day===7?'Your best knife becomes your score.':`Keep your ${Math.min(RULES.rackSlots,s.knives.length)} best knives. Refill energy. Three fresh blanks.`}</p><div className="ff-rest-preview">{[...s.knives].sort((a,b)=>value(b,s)-value(a,s)).slice(0,s.day===7?1:RULES.rackSlots).map(n=><div key={n.id}><KnifePortrait knife={n}/><b>+{n.level}</b></div>)}</div>{s.day<7&&s.knives.length>4&&<p className="ff-small">{s.knives.length-4} lower-value knives will be cleared.</p>}<div className="ff-modal-actions"><button onClick={()=>setPanel(null)}>Stay</button><button className="ff-primary" disabled={locked} onClick={end}>{s.day===7?'Finish':'Keep & rest'}</button></div></Modal>}
 {s.ended&&panel!=='board'&&<Modal title="Your masterwork" close={()=>setPanel('board')}><div className="ff-pedestal">{best&&<KnifePortrait knife={best}/>}<h3>{best?knifeName(best):'A fresh start awaits.'}</h3><strong>{best?format(value(best,s)):'0'}</strong></div><label className="ff-name">Name<input maxLength={WORLD.maxName} value={name} onChange={e=>setName(e.target.value)} placeholder="Anonymous smith" autoComplete="nickname" onKeyDown={e=>{if(e.key==='Enter'){e.preventDefault();void submit()}}}/></label><p className="ff-small">{API&&session.ticket?'Verified world score':'Saved on this device'}</p><div className="ff-modal-actions"><button disabled={posting} onClick={()=>void newRun()}>New run</button><button className="ff-primary" disabled={posting} onClick={()=>void submit()}>{posting?'Saving…':'Save score'}</button></div></Modal>}
 {panel==='board'&&<Modal title="Best blades" close={()=>setPanel(null)}><p className="ff-board-status">{boardStatus}</p><ol className="ff-scores">{scores.length?scores.map((score,i)=><li key={score.playerId} className={score.playerId===player.playerId?'is-you':''}><span>{score.rank||i+1}</span>{score.knife&&<KnifePortrait knife={score.knife}/>}<div><strong>{score.name}{score.playerId===player.playerId?' · You':''}</strong><small>Level {score.level}</small></div><b>{format(score.value)}</b></li>):<li>Finish a run to set the first score.</li>}</ol>{myScore&&!scores.some(n=>n.playerId===player.playerId)&&<p>#{myScore.rank} · {format(myScore.value)}</p>}<div className="ff-modal-actions"><button onClick={()=>void refreshBoard()}>Refresh</button>{s.ended&&<button className="ff-primary" disabled={posting} onClick={()=>void newRun()}>New run</button>}</div></Modal>}
 {panel==='help'&&<Modal title="Make. Risk. Keep." close={()=>setPanel(null)}><div className="ff-rules">{tutorial.map(([title,text])=><div key={title}><h3>{title}</h3><p>{text}</p></div>)}<div className="ff-modal-actions"><button onClick={()=>{unlock();audio.setMuted(!muted);setMuted(!muted)}}>{muted?'Sound on':'Sound off'}</button><button onClick={()=>setPanel('board')}>Scores</button></div><details><summary>Odds & tools</summary><p>Perfect +2 levels. Good +1. Dull stays. Chip −1. Shatter loses the blade. The odds above the blade are exact.</p><p>Flow protects three hits. Guard turns the next Shatter into Chip. Undo restores your last blade and stamina; the next roll is fresh. Hone adds 15% value. Energy restores five strikes.</p><p>1–4 use tools. F activates Flow. T opens Trade. V fills the screen. Gold is imaginary. No real purchases.</p></details></div></Modal>}
 </MinigameShell>
}
