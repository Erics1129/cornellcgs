import { useEffect, useLayoutEffect, useRef, useState, type CSSProperties, type MouseEvent as ReactMouseEvent, type ReactNode } from 'react'
import MinigameShell from '../MinigameShell'
import { CHARMS, FAMILIES, ITEMS, METALS, RULES, WORLD } from './config'
import type { Charm, Item, Metal, Outcome } from './config'
import { act, bestKnife, bonus, expectedValue, flowDuration, flowNeed, knifeName, price, runDays, saleValue, value } from './engine'
import type { Action, Knife, Place } from './engine'
import { API, api, cleanName, fresh, identity, loadSession, localScores, readSave, recordLocal, saveName, saveSession, saveSignature } from './storage'
import type { Score, Session, Ticket } from './storage'
import { progress } from '../../lib/account/index.ts'
import { ForgeUnity } from './unity'
import { ForgeAudio } from './audio'
import { audioTuning } from './audio-spec'
import { anvilRisk, viewClass } from './bridge'
import type { Motion, ViewClass } from './bridge'
import { HeatClock, StrikeGate, adoptUnityTiming, bladePoint, coinFallback, coinStep, hapticPattern, hitHaptic, labelPlacement, nextRoll, oddsAtContact, outcomeLabel, prepareTarget, survival, tension, webTuning } from './feel'
import type { GateInput, OutcomeLabel, RefuseReason } from './feel'
import feelTuning from './feel-tuning.json'
import KnifePortrait from './KnifePortrait'
import ForgeIcon from './ForgeIcon'
import { GoldCounter, MarketBoard } from './TradeDetails'
import { panelShortcut } from './input'
import ChanceBar, { SurviveLine } from './ChanceBar'
import type { Roll } from './ChanceBar'
import './forge.css'

const format=(n:number)=>Math.round(n).toLocaleString('en-US')
const TUNING=webTuning((feelTuning as {web?:unknown}).web)
const AUDIO_TUNING=audioTuning(((feelTuning as {web?:{audio?:unknown}}).web||{}).audio)
const tutorial=[
 ['Forge','Press Space or tap the blade. New heats and places a blank for you. Each press is one strike: a press during the downswing is held and lands on the next beat.'],
 ['Read the risk','When the shatter odds reach 20%, wait for each result before the next strike. Presses that come too early are refused with a dry tick, never queued.'],
 ['Keep or sell','Sell cashes in the current blade in one tap. Trade shows every knife, daily prices, metal, tools, and charms.'],
 ['Explore','WASD or the touch pad moves your smith. Drag to look. E picks up and places objects. On a phone, the pad hides while you forge; touch the lower-left corner to bring it back.'],
 [`${RULES.days} days`,`Rest keeps your four best knives. Your best surviving knife after day ${RULES.days} is your score. Gold is only for supplies.`],
]
const itemIcons:Record<Item,string>={guard:'guard',rewind:'rewind',whetstone:'hammer',stamina:'bolt'}
const quickItems:Item[]=['guard','rewind','whetstone']
const itemNames:Record<Item,string>={guard:'Guard',rewind:'Undo',whetstone:'Hone',stamina:'Energy'}
const MOTIONS:Motion[]=['full','reduced','off']
const MOTION_LABELS:Record<Motion,string>={full:'Full',reduced:'Reduced',off:'Off'}
const canVibrate=typeof navigator!=='undefined'&&typeof navigator.vibrate==='function'
const isTouch=()=>matchMedia('(pointer: coarse)').matches||navigator.maxTouchPoints>0
const readSetting=<T extends string>(key:string,allowed:readonly T[],fallback:T):T=>{try{const v=localStorage.getItem(key) as T|null;return v&&allowed.includes(v)?v:fallback}catch{return fallback}}
const writeSetting=(key:string,v:string)=>{try{localStorage.setItem(key,v)}catch{/* settings are optional */}}
/** QA only (?forge-telemetry=1): every press decision, refusal, sent strike and lock change, for scripts/forge-qa/web.mjs. */
type QaEntry={t:number;kind:string;reason?:string;seq?:number;on?:boolean}
declare global{interface Window{__forgePresses?:QaEntry[]}}
const qaLog=(e:Omit<QaEntry,'t'>)=>{if(typeof window==='undefined'||!window.__forgePresses)return;window.__forgePresses.push({t:performance.now(),...e});if(window.__forgePresses.length>5000)window.__forgePresses.splice(0,1000)}
if(typeof window!=='undefined'&&new URLSearchParams(location.search).get('forge-telemetry')==='1')window.__forgePresses=[]
/**
 * Restart a one-shot CSS cue class without remounting (focus stays where it is). The class comes off after
 * `ms`, so reduced motion can show it as a short static ring instead of the shake or glow.
 */
const cueTimers=new WeakMap<HTMLElement,Map<string,ReturnType<typeof setTimeout>>>()
const restart=(el:HTMLElement|null,cls:string,ms=240)=>{if(!el)return;el.classList.remove(cls);void el.offsetWidth;el.classList.add(cls);let m=cueTimers.get(el);if(!m)cueTimers.set(el,m=new Map());clearTimeout(m.get(cls));m.set(cls,setTimeout(()=>el.classList.remove(cls),ms))}

/** Centered dialog, or a docked tray (Trade, Rest) that leaves the anvil in view. */
function Modal({title,close,children,accessory,tray=false}:{title:string;close:()=>void;children:ReactNode;accessory?:ReactNode;tray?:boolean}){
 const ref=useRef<HTMLDialogElement>(null)
 useEffect(()=>{const d=ref.current!;d.showModal();return()=>d.close()},[])
 return <dialog ref={ref} className={`ff-modal ${tray?'ff-tray':''}`} onCancel={e=>{e.preventDefault();close()}} onClick={e=>{if(e.target===e.currentTarget)close()}}>
  <div className="ff-modal-head"><h2>{title}</h2>{accessory}<button aria-label="Close dialog" onClick={close}>×</button></div>{children}
 </dialog>
}
type Callout={id:number;label:OutcomeLabel;x:number;y:number}
type Mark={id:number;x:number;y:number}
type Held={knife:Knife;value:number}
type SaleCount={from:number;amount:number;start:number;coins:boolean}

export default function ForgePage(){
 const [session,setSession]=useState(loadSession),sessionRef=useRef(session)
 const loadedSignature=useRef<string|null>(null);if(loadedSignature.current===null)loadedSignature.current=saveSignature(readSave())
 const [selected,setSelected]=useState<number|null>(()=>session.state.knives.find(n=>n.place==='anvil')?.id||session.state.knives[0]?.id||null),selectedRef=useRef(selected)
 const [ready,setReady]=useState(false)
 const [preparing,setPreparing]=useState<number|null>(null),prepareId=useRef<number|null>(null)
 const [trading,setTrading]=useState(false),tradeLock=useRef(false)
 const [tradeTab,setTradeTab]=useState<'buy'|'sell'>('buy'),[category,setCategory]=useState<'metal'|'tools'|'charms'>('metal')
 const [immersive,setImmersive]=useState(false)
 const [notice,setNotice]=useState('')
 const [receipt,setReceipt]=useState<{id:number;amount:number}|null>(null),receiptId=useRef(0)
 const [busy,setBusy]=useState(false)
 const [panel,setPanel]=useState<'shop'|'board'|'end'|'help'|'result'|null>(null),panelRef=useRef(panel);panelRef.current=panel
 const [sceneError,setSceneError]=useState(''),[saveError,setSaveError]=useState(false)
 const [scores,setScores]=useState<Score[]>(localScores),[myScore,setMyScore]=useState<Score|null>(null),[boardStatus,setBoardStatus]=useState(API?'Connecting to world board…':'World board offline · Local scores on this device'),[posting,setPosting]=useState(false)
 const [player]=useState(identity),[name,setName]=useState(player.name),[audio]=useState(()=>new ForgeAudio({tuning:AUDIO_TUNING})),[muted,setMuted]=useState(audio.muted)
 // Feel state: the strike gate, settings, view class, work focus, callouts, the Shatter hold, the sale count.
 const [gate]=useState(()=>new StrikeGate(TUNING.gate)),[heatClock]=useState(()=>new HeatClock())
 const [motion,setMotionState]=useState<Motion>(()=>readSetting('cgs-forge-motion',MOTIONS,'full'))
 const [haptics,setHapticsState]=useState(()=>readSetting('cgs-forge-haptics',['on','off'] as const,matchMedia('(prefers-reduced-motion: reduce)').matches?'off':'on')==='on'),hapticsRef=useRef(haptics);hapticsRef.current=haptics
 const [osReduced,setOsReduced]=useState(()=>matchMedia('(prefers-reduced-motion: reduce)').matches)
 const [view,setView]=useState<ViewClass>(()=>viewClass(innerWidth,innerHeight,isTouch()))
 const [workFocus,setWorkFocus]=useState(false),workFocusRef=useRef(workFocus);workFocusRef.current=workFocus
 const [callout,setCallout]=useState<Callout|null>(null),[mark,setMark]=useState<Mark|null>(null),markId=useRef(0)
 const [held,setHeld]=useState<Held|null>(null),holdTimers=useRef<ReturnType<typeof setTimeout>[]>([])
 const [history,setHistory]=useState<Outcome[]>([]),[roll,setRoll]=useState<Roll|null>(null)
 const [goldCount,setGoldCount]=useState<number|null>(null),saleCount=useRef<SaleCount|null>(null)
 const [flowPulse,setFlowPulse]=useState(0),lastPulse=useRef(-Infinity)
 const strikeKey=useRef<HTMLButtonElement>(null),lastHint=useRef(-Infinity)
 const [oddsOpen,setOddsOpen]=useState(false)
 const anvilLabel=useRef<{x:number;y:number}|undefined>(undefined)
 const dueTimer=useRef<ReturnType<typeof setTimeout>|undefined>(undefined),heatStart=useRef(0),impactSeq=useRef(0),flowStep=useRef(0)
 const calm=osReduced||motion!=='full'
 const root=useRef<HTMLDivElement>(null),mainRef=useRef<HTMLElement>(null),scene=useRef<ForgeUnity|null>(null),unlock=()=>audio.start()
 const immersiveRef=useRef(immersive);immersiveRef.current=immersive
 const maxScreen=async()=>{if(document.fullscreenElement){await document.exitFullscreen();setImmersive(false);return}if(immersiveRef.current){setImmersive(false);return}setImmersive(true);const game=root.current?.closest('.ff-page') as HTMLElement|null;try{await game?.requestFullscreen?.({navigationUI:'hide'})}catch{/* iPhone browsers use the viewport-filling layout */}}
 const s=session.state,k=s.knives.find(k=>k.id===selected),anvil=s.knives.find(k=>k.place==='anvil'),best=bestKnife(s),heating=s.knives.find(k=>k.place==='furnace'&&!k.heated)
 const choose=(id:number)=>{selectedRef.current=id;setSelected(id)}
 const sendRef=useRef<(a:Action)=>boolean>(()=>false)
 const saveTimer=useRef<ReturnType<typeof setTimeout>|undefined>(undefined)
 const saveSoon=()=>{if(saveTimer.current===undefined)saveTimer.current=setTimeout(()=>{saveTimer.current=undefined;setSaveError(!saveSession(sessionRef.current))},0)}
 const hitRef=useRef<()=>void>(()=>{})
 const clockMark=useRef(performance.now()),advanceRef=useRef<()=>void>(()=>{}),resetFeelRef=useRef<()=>void>(()=>{})
 const protocol=()=>scene.current?.protocol??0
 const legacy=()=>protocol()<2
 const vibrate=(pattern:number[])=>{if(hapticsRef.current&&canVibrate)try{navigator.vibrate(pattern)}catch{/* blocked */}}

 /** The gate's view of a press at `now`: risk and Flow at the predicted contact. */
 const gateInput=(now:number):GateInput=>{
  const st=sessionRef.current.state,knife=st.knives.find(n=>n.place==='anvil'),p=protocol()
  if(!knife?.heated)return {risk:0,flow:false,protocol:p,armed:false}
  const flowNow=knife.flow>0||knife.pips>=flowNeed(st)
  const ms=gate.predictContact(now,{flow:flowNow,protocol:p})-now
  const at=oddsAtContact(knife,st,ms)
  return {risk:at.odds.shatter,flow:flowNow&&!at.expiring,protocol:p,armed:true}
 }
 const busyRef=useRef(false)
 const refreshBusy=()=>{const on=gate.locked(performance.now());if(on!==busyRef.current){busyRef.current=on;qaLog({kind:'busy',on})}setBusy(on)}
 /** Refusal feedback: the Forge key shakes, a dry tick, a scene hint, and a short text hint at most every 1.8 s. */
 const refuse=(reason:RefuseReason)=>{
  const now=performance.now()
  restart(strikeKey.current,'is-refused',TUNING.hud.keyCueMs);audio.ui('refuse');scene.current?.refuse(reason);qaLog({kind:'feedback',reason})
  // In the scene too: a small ring on the blade, where the player is looking (not only on the key).
  if(reason==='risk'||reason==='hold'||reason==='cancelled'){const m=mainRef.current;if(m){const r=m.getBoundingClientRect(),p=bladePoint(anvilLabel.current,r.width,r.height,scene.current?.measureBands()||{top:0,bottom:0,left:0,right:0});setMark({id:++markId.current,x:Math.round(p.x),y:Math.round(p.y)})}}
  const hint=reason==='risk'?'High risk · watch each result first':reason==='heating'?'Still heating':reason==='cancelled'?'Swing cancelled':''
  if(hint&&now-lastHint.current>TUNING.hud.refuseHintMs){lastHint.current=now;setNotice(hint)}
 }
 const acknowledge=()=>restart(strikeKey.current,'is-queued',TUNING.hud.keyCueMs)
 const scheduleDue=()=>{
  clearTimeout(dueTimer.current)
  const now=performance.now(),p={protocol:protocol()},times=[gate.nextDue(p),gate.seatDeadline(p),gate.unlockAt(),gate.heatDeadline()].filter((t):t is number=>t!==null&&Number.isFinite(t))
  if(times.length)dueTimer.current=setTimeout(()=>checkDueRef.current(),Math.max(0,Math.min(...times)-now)+1)
 }
 const checkDueRef=useRef<()=>void>(()=>{})
 const fireRef=useRef<(now:number)=>void>(()=>{})
 checkDueRef.current=()=>{
  const now=performance.now(),input=gateInput(now)
  gate.watchdog(now)
  if(gate.heatWatchdog(now))refuse('heating')
  const r=gate.due(now,input)
  if(r==='fire')fireRef.current(now);else if(r==='drop')refuse('risk')
  const dl=gate.seatDeadline({protocol:protocol()});if(dl!==null&&now>=dl)gate.settleHeating(now,{protocol:protocol()})
  scheduleDue();refreshBusy()
 }
 const endShatterHold=()=>{
  holdTimers.current.forEach(clearTimeout);holdTimers.current=[];gate.endHold();setHeld(null)
  const st=sessionRef.current.state;if(!st.knives.some(n=>n.id===selectedRef.current))choose(st.knives.find(n=>n.place==='anvil')?.id||prepareTarget(st)?.id||st.knives[0]?.id||0)
 }
 /** Place the outcome callout above the blade, in the HUD-free band, clear of the blade centre. */
 const place=(label:OutcomeLabel,id:number)=>{
  const m=mainRef.current;if(!m)return
  const r=m.getBoundingClientRect(),bands=scene.current?.measureBands()||{top:0,bottom:0,left:0,right:0}
  const p=labelPlacement(anvilLabel.current,r.width,r.height,bands,label.kind==='shatter'?64:48,TUNING.hud)
  setCallout({id,label,x:p.x,y:p.y})
 }
 const send=(action:Action)=>{
  const clockAction=action.type==='tick'||action.type==='wait'
  if(!clockAction)advanceRef.current()
  if(['buy','sell','offer'].includes(action.type)&&(tradeLock.current||gate.locked(performance.now())||prepareId.current))return false
  const current=sessionRef.current
  // The honest roll needle: the strike's roll, read from the pre-hit state (display only).
  const hitKnife=action.type==='hit'?current.state.knives.find(n=>n.id===action.id):undefined,preRoll=hitKnife?nextRoll(hitKnife,current.state):null
  const result=act(current.state,action)
  if(!result.ok){setNotice(result.event.text);if(!clockAction)qaLog({kind:'engine-fail',reason:`${action.type}: ${result.event.text}`});return false}
  const actions=[...current.actions],last=actions.at(-1)
  if(action.type==='tick'&&last?.type==='tick'&&last.ms+action.ms<=RULES.maxWait*1000)actions[actions.length-1]={type:'tick',ms:last.ms+action.ms};else if(action.type==='wait'&&last?.type==='wait'&&last.seconds+action.seconds<=RULES.maxWait)actions[actions.length-1]={type:'wait',seconds:last.seconds+action.seconds};else actions.push(action)
  const next={...current,state:result.state,actions};sessionRef.current=next;setSession(next)
  if(action.type==='buy'||result.event.kind==='sell'){
   tradeLock.current=true;setTrading(true);const amount=result.state.gold-current.state.gold;setReceipt({id:++receiptId.current,amount});setNotice(`${amount>0?'Sold +':'Purchased −'}${format(Math.abs(amount))}`)
   if(amount>0){saleCount.current={from:current.state.gold,amount,start:performance.now(),coins:false};setGoldCount(current.state.gold);vibrate(hapticPattern('coins'));if(legacy())audio.ui('sell')}else audio.ui('buy')
  }
  if(!clockAction){
   const a=result.event,now=performance.now()
   if(action.type!=='buy'&&a.kind!=='sell')setNotice(action.type==='move'&&action.to==='rack'?'Kept':action.type==='use'?itemNames[action.item]:action.type==='flow'?'Flow active':'')
   // A strike resolves inside Unity's frame (its 'impact' event): its save, a log that grows to thousands of
   // actions, runs right after that frame instead. pagehide and unmount still save synchronously.
   if(a.kind==='hit')saveSoon();else setSaveError(!saveSession(next))
   if(a.kind==='hit'&&a.outcome&&a.before){
    const flowing=a.flowStarted||a.before.flow>0
    flowStep.current=a.flowStarted?1:flowing?flowStep.current+1:0
    audio.strike({outcome:a.outcome,metal:a.before.metal,level:a.after?.level??a.before.level,tempC:heatClock.tempC(a.before.id,now,TUNING.heat),flowStep:flowStep.current,evolution:!!a.evolution,seq:impactSeq.current})
    if(a.flowStarted)audio.ui('flow')
    const h=hitHaptic(a);if(h)vibrate(hapticPattern(h,flowing))
    const label=outcomeLabel(a,current.state,TUNING);if(label)place(label,result.state.totalHits)
    setHistory(list=>[...list,a.outcome!].slice(-TUNING.hud.historyLength))
    if(preRoll)setRoll({id:result.state.totalHits,u:preRoll.u,chances:preRoll.chances,sweepMs:TUNING.hud.rollSweepMs,holdMs:a.outcome==='shatter'?TUNING.gate.shatterHoldMs:TUNING.hud.rollHoldMs})
    if(flowing&&now-lastPulse.current>=TUNING.hud.flowPulseMs){lastPulse.current=now;setFlowPulse(n=>n+1)}
    if(a.outcome==='shatter'){
     // Hold the loss on screen: the broken knife's card for 1.5 s, the next knife chosen at 1.2 s.
     if(gate.shatter(now)){restart(strikeKey.current,'is-refused',TUNING.hud.keyCueMs);qaLog({kind:'feedback',reason:'hold'})}
     heatClock.left(a.before.id);setHeld({knife:a.before,value:value(a.before,current.state)})
     holdTimers.current.forEach(clearTimeout)
     holdTimers.current=[setTimeout(()=>{const st=sessionRef.current.state;if(!st.knives.some(n=>n.id===selectedRef.current))choose(st.knives.find(n=>n.place==='anvil')?.id||prepareTarget(st)?.id||st.knives[0]?.id||0)},TUNING.gate.shatterChooseMs),setTimeout(()=>{gate.endHold();setHeld(null)},TUNING.gate.shatterHoldMs)]
    }
   }else if(a.kind==='heat'){heatClock.heated(a.id!,result.state.knives.find(n=>n.id===a.id)!.metal,now);if(legacy()){audio.sfx('coals-out');audio.ui('heat')}}
   else if(a.kind==='move'&&action.type==='move'){
    const moved=result.state.knives.find(n=>n.id===action.id)
    if(moved?.place==='anvil'&&moved.heated)heatClock.arrived(moved.id,now,TUNING.heat);else if(moved)heatClock.left(moved.id)
    if(legacy()){if(action.to==='furnace')audio.sfx('coals-in');else setTimeout(()=>audio.sfx('place',action.to==='anvil'?0:action.to==='rack'?1:3),action.to==='anvil'?TUNING.gate.legacySeatMs:250)}
   }else if(a.kind==='sell'){if(a.id)heatClock.left(a.id)}
   else if(a.kind==='flow')audio.ui('flow')
   else if(a.kind==='use')audio.ui('use')
   else if(a.kind==='end'&&legacy())audio.sfx('dawn')
   if(a.id&&action.type!=='buy'&&result.state.knives.some(n=>n.id===a.id))choose(a.id)
   if(!result.state.knives.some(n=>n.id===selectedRef.current)&&!(a.kind==='hit'&&a.outcome==='shatter'))choose(result.state.knives.find(n=>n.place==='anvil')?.id||result.state.knives[0]?.id||0)
   if(action.type==='end'){choose(result.state.knives[0]?.id||0);setPanel(result.state.ended?'result':null)}
  }
  scene.current?.sync(result.state,selectedRef.current,result.event)
  return true
 }
 sendRef.current=send
 advanceRef.current=()=>{const now=performance.now(),ms=Math.round(now-clockMark.current);clockMark.current=now;if(ms>0&&!document.hidden&&!sessionRef.current.state.ended)sendRef.current({type:'tick',ms:Math.min(ms,RULES.maxWait*1000)})}
 const prepare=(id?:number)=>{
  if(gate.locked(performance.now())||prepareId.current||!ready||sessionRef.current.state.ended)return false
  const current=sessionRef.current.state
  const target=id?current.knives.find(n=>n.id===id):prepareTarget(current)
  if(!target){setNotice('No blanks. Open Trade to buy metal.');return false}
  unlock();choose(target.id);scene.current?.focus();setWorkFocus(true)
  const previous=current.knives.find(n=>n.place==='anvil'&&n.id!==target.id)
  if(previous&&!send({type:'move',id:previous.id,to:current.knives.filter(n=>n.place==='rack').length<RULES.rackSlots?'rack':'crate'}))return false
  if(target.heated)return target.place==='anvil'||send({type:'move',id:target.id,to:'anvil'})
  const furnace=sessionRef.current.state.knives.find(n=>n.place==='furnace'&&n.id!==target.id)
  if(furnace)send({type:'move',id:furnace.id,to:'crate'})
  const wasHeating=target.place==='furnace'
  if(!wasHeating&&!send({type:'move',id:target.id,to:'furnace'}))return false
  prepareId.current=target.id;setPreparing(target.id)
  const now=performance.now();gate.heatingStarted(now,wasHeating?Math.max(0,heatStart.current+RULES.heatSeconds*1000-now):RULES.heatSeconds*1000)
  scheduleDue();return true
 }
 const prepareRef=useRef(prepare);prepareRef.current=prepare
 /** Send one Strike for the knife on the anvil (a press the gate accepted, now or from the buffer). */
 const fire=(now:number)=>{
  const st=sessionRef.current.state,target=st.knives.find(n=>n.place==='anvil')
  if(!target?.heated){if(!prepareRef.current())refuse('busy');return}
  if(tradeLock.current||prepareId.current){refuse('busy');return}
  const input=gateInput(now)
  choose(target.id)
  // The gate learns the seq before the SendMessage: Unity answers inside it ('swing', or 'settled' x = -1).
  let accepted=true
  const seq=scene.current?.strike(()=>sendRef.current({type:'hit',id:target.id}),s=>{accepted=gate.sent(s,now,input);qaLog({kind:'sent',seq:s})})||0
  if(!seq){refuse('busy');return}
  if(!accepted)refuse('cancelled')
  setWorkFocus(true)
  if(legacy())audio.swingFoley(gate.predictContact(now,input)-now)
  scheduleDue();refreshBusy()
 }
 fireRef.current=fire
 /** Every strike press: Space, a tap on the blade (both through Unity's 'hit') or the Forge key. */
 const hit=()=>{
  unlock();advanceRef.current()
  if(!ready||sessionRef.current.state.ended)return
  if(tradeLock.current||panelRef.current){qaLog({kind:'refuse',reason:'busy'});refuse('busy');return}
  const now=performance.now(),d=gate.press(now,gateInput(now))
  qaLog({kind:d.kind,reason:'reason' in d?d.reason:'until' in d?d.until:undefined})
  if('endHold' in d&&d.endHold)endShatterHold()
  if(d.kind==='strike')fire(now)
  else if(d.kind==='prepare'){if(!prepareRef.current())refuse('busy')}
  else if(d.kind==='buffer'){acknowledge();scheduleDue()}
  else if(d.kind==='absorb')acknowledge()
  else refuse(d.reason)
  setWorkFocus(true);refreshBusy()
 }
 hitRef.current=hit
 /** Actions that a swing blocks keep full opacity (aria-disabled); a press is answered with a nudge. */
 const blockedNow=()=>gate.locked(performance.now())||tradeLock.current||prepareId.current!==null
 const guard=(fn:()=>void)=>(e:ReactMouseEvent<HTMLElement>)=>{if(blockedNow()){restart(e.currentTarget,'is-nudged');audio.ui('refuse');return}fn()}

 useEffect(()=>{const change=()=>setImmersive(!!document.fullscreenElement);document.addEventListener('fullscreenchange',change);return()=>document.removeEventListener('fullscreenchange',change)},[])
 useEffect(()=>{const mq=matchMedia('(prefers-reduced-motion: reduce)'),f=()=>setOsReduced(mq.matches);mq.addEventListener('change',f);const r=()=>setView(viewClass(innerWidth,innerHeight,isTouch()));addEventListener('resize',r);return()=>{mq.removeEventListener('change',f);removeEventListener('resize',r)}},[])
 useEffect(()=>{
  if(!root.current)return
  try{
   const g=new ForgeUnity(root.current,{
    ready:()=>{setReady(true);scene.current?.focus();audio.legacy=(scene.current?.protocol??0)<2},
    settled:(seq,latest,cancelled)=>{const now=performance.now();const dropped=gate.settled(seq,now,cancelled,latest);if(cancelled)audio.cancel(seq);audio.settled(seq);if(dropped)refuse('cancelled');checkDueRef.current()},
    swing:(seq,ms)=>{const now=performance.now();gate.swing(seq,now,ms,gateInput(now).flow);audio.preschedule(seq,ms)},
    impact:seq=>{impactSeq.current=seq;gate.impact(seq,performance.now());queueMicrotask(()=>checkDueRef.current())},
    seated:()=>{gate.seated(performance.now());checkDueRef.current()},
    sfx:(name,x,y)=>{audio.sfx(name,x,y);if(name==='coin-land'){const c=saleCount.current;if(c){c.coins=true;setGoldCount(coinStep(c.from,c.amount,x,y));if(y>0&&x+1>=y)saleCount.current=null}}},
    look:()=>setWorkFocus(false),
    touchZone:(x,y)=>{
     // The lower-left 30% of the HUD-free band (in landscape the canvas corner sits under the rail).
     if(!workFocusRef.current||viewClass(innerWidth,innerHeight,isTouch())==='desktop')return false
     const c=document.querySelector('.ff-unity-canvas')?.getBoundingClientRect(),b=scene.current?.measureBands();if(!c||!b)return false
     const px=x*c.width,py=y*c.height,bw=c.width-b.left-b.right,bh=c.height-b.top-b.bottom
     if(px>=b.left&&px<b.left+bw*TUNING.hud.padRevealX&&py>b.top+bh*TUNING.hud.padRevealY&&py<c.height-b.bottom){setWorkFocus(false);return true}
     return false
    },
    select:choose,
    drop:(id,spot)=>{if(['crate','rack','furnace','anvil'].includes(spot))sendRef.current({type:'move',id,to:spot as Place});else if(spot==='sell')sendRef.current({type:'sell',id})},
    hit:()=>hitRef.current(),
    spot:spot=>{if(spot==='shop')setPanel('shop');if(spot==='lantern')setPanel('end')},
    gesture:()=>audio.start(),
    // Unity's effective strike timing (after feel-tuning.json and its clamps) drives the gate's predictions.
    tuned:effective=>{const changed=adoptUnityTiming(gate.t,effective);if(changed.length)qaLog({kind:'tuned',reason:changed.join(',')})},
    labels:positions=>{const a=positions.anvil;if(a&&Number.isFinite(a.x)&&Number.isFinite(a.y))anvilLabel.current=a},
    error:setSceneError,context:()=>{},near:()=>{},notice:setNotice,
    command:(kind,id,key)=>{if(kind==='buy'&&key)sendRef.current({type:'buy',key});else if(kind==='end')setPanel('end');else if(kind==='flow')sendRef.current({type:'flow',id});else if(['guard','rewind','whetstone','stamina'].includes(kind))sendRef.current({type:'use',item:kind as Item,id:id||undefined})},
   })
   scene.current=g;g.setMotion(motion);g.sync(sessionRef.current.state,selectedRef.current)
   return()=>{g.dispose();scene.current=null}
  }catch{setSceneError('Unity could not start. Reload to try again; your saved run is safe.')}
 },[audio])
 useEffect(()=>{scene.current?.sync(sessionRef.current.state,selected)},[selected])
 useEffect(()=>{writeSetting('cgs-forge-motion',motion);scene.current?.setMotion(motion);scene.current?.sync(sessionRef.current.state,selectedRef.current)},[motion])
 useEffect(()=>{audio.setTension(tension(anvilRisk(s)))},[audio,s])
 useEffect(()=>{if(!heating)return;const id=heating.id;heatStart.current=performance.now();audio.setHeating(true);const t=setTimeout(()=>{
  sendRef.current({type:'heat',id})
  if(prepareId.current===id){
   const placed=sendRef.current({type:'move',id,to:'anvil'});prepareId.current=null;setPreparing(null);scene.current?.focus()
   if(placed)gate.heated(performance.now());else if(gate.cancelHeating())refuse('busy')
   checkDueRef.current()
  }
  audio.setHeating(false)
 },RULES.heatSeconds*1000);return()=>{
  clearTimeout(t);audio.setHeating(false)
  // The blank left the coals unheated (dragged out, or a new run): release Start instead of waiting forever.
  const left=sessionRef.current.state.knives.find(n=>n.id===id)
  if(prepareId.current===id&&!left?.heated&&left?.place!=='furnace'){prepareId.current=null;setPreparing(null);if(gate.cancelHeating())refuse('heating');refreshBusy()}
 }},[heating?.id,audio,gate])
 useEffect(()=>{if(!trading)return;const t=setTimeout(()=>{tradeLock.current=false;setTrading(false)},550);return()=>clearTimeout(t)},[trading])
 useEffect(()=>{if(!receipt)return;const t=setTimeout(()=>setReceipt(null),2600);return()=>clearTimeout(t)},[receipt])
 useEffect(()=>{if(!notice)return;const t=setTimeout(()=>setNotice(''),Math.max(2400,notice.length*70));return()=>clearTimeout(t)},[notice])
 useEffect(()=>{if(!callout)return;const t=setTimeout(()=>setCallout(null),callout.label.holdMs);return()=>clearTimeout(t)},[callout])
 useEffect(()=>{if(!mark)return;const t=setTimeout(()=>setMark(null),TUNING.hud.refuseMarkMs);return()=>clearTimeout(t)},[mark])
 useEffect(()=>{if(!roll)return;const t=setTimeout(()=>setRoll(null),roll.holdMs);return()=>clearTimeout(t)},[roll])
 // Sale count fallback when no coin-land events arrive: hold, then ease to the exact total by 1.1 s.
 useEffect(()=>{if(goldCount===null)return;let frame=0;const tick=()=>{const c=saleCount.current;if(!c){setGoldCount(null);return}const ms=performance.now()-c.start;if(c.coins){if(ms>TUNING.hud.coinFallbackEndMs*2.5){saleCount.current=null;setGoldCount(null);return}}else{setGoldCount(coinFallback(c.from,c.amount,ms,TUNING.hud));if(ms>=TUNING.hud.coinFallbackEndMs){saleCount.current=null;setGoldCount(null);return}}frame=requestAnimationFrame(tick)};frame=requestAnimationFrame(tick);return()=>cancelAnimationFrame(frame)},[goldCount===null])
 useEffect(()=>{if(!panel)return;if(gate.cancelBuffer())refuse('busy');scene.current?.control('clear',false);refreshBusy()
 },[panel])
 // Save when the page goes away, not when it comes back: a save stamps the run as this device's latest, and on
 // return the account module may be pulling a run played on another device in the meantime (adopted below).
 useEffect(()=>{const tick=setInterval(()=>advanceRef.current(),100);const exit=()=>{clockMark.current=performance.now();gate.cancelBuffer();clearTimeout(saveTimer.current);saveTimer.current=undefined;saveSession(sessionRef.current)};const visibility=()=>{if(document.hidden){exit();audio.suspend()}else{clockMark.current=performance.now();if(audio.started)audio.start()}};window.addEventListener('pagehide',exit);document.addEventListener('visibilitychange',visibility);return()=>{clearInterval(tick);clearTimeout(dueTimer.current);clearTimeout(saveTimer.current);saveTimer.current=undefined;holdTimers.current.forEach(clearTimeout);saveSession(sessionRef.current);window.removeEventListener('pagehide',exit);document.removeEventListener('visibilitychange',visibility);audio.dispose()}},[audio,gate])
 // Signed in, a run played on another device can arrive in storage (docs/accounts/HOOKS.md). Adopt it as newRun
 // does, or the next saveSession overwrites it and pushes this device's older run with a newer stamp. Not during a
 // swing, heating or a sale: the next save then re-pushes this device's run, which is the one being played.
 useEffect(()=>{const adopt=()=>{
  if(gate.locked(performance.now())||prepareId.current||tradeLock.current)return
  const stored=readSave()!==null,next=loadSession(),now=performance.now()
  for(const n of sessionRef.current.state.knives)heatClock.left(n.id)
  sessionRef.current=next;clockMark.current=now;resetFeelRef.current();setSession(next);setSaveError(false)
  const anvilKnife=next.state.knives.find(n=>n.place==='anvil');if(anvilKnife?.heated)heatClock.arrived(anvilKnife.id,now,TUNING.heat)
  choose(anvilKnife?.id||next.state.knives[0]?.id||0)
  if(panelRef.current==='end'||(panelRef.current==='result'&&!next.state.ended))setPanel(null)
  setNotice(next.notice||(stored?`Run from your account · day ${next.state.day}`:'New run'))
  scene.current?.sync(next.state,selectedRef.current)
 }
 // A pull that landed between the first render (loadSession) and this subscription is adopted now.
 const off=progress.subscribe('forge:run',adopt);if(saveSignature(readSave())!==loadedSignature.current)adopt();return off
 },[gate,heatClock])
 // After an update changed the rules, one line about what happened to the saved run, once the scene is up.
 useEffect(()=>{if(!ready||!sessionRef.current.notice)return;setNotice(sessionRef.current.notice);sessionRef.current={...sessionRef.current,notice:undefined}},[ready])
 // Unity frames the anvil inside the HUD-free band: re-send the bands whenever the HUD layout changes.
 useLayoutEffect(()=>{const f=requestAnimationFrame(()=>scene.current?.insets());return()=>cancelAnimationFrame(f)},[panel,view,ready,oddsOpen,workFocus,s.knives.length,s.ended,!!s.offer,!!held])
 useEffect(()=>{const key=(e:KeyboardEvent)=>{
  if(e.key==='Escape'){if(document.querySelector('dialog[open]'))return;setImmersive(false);setPanel(null);return}
  if(e.target instanceof HTMLElement&&(e.target.isContentEditable||/^(INPUT|TEXTAREA|SELECT)$/.test(e.target.tagName)))return
  const code=panelShortcut(e);if(!code)return
  if(document.querySelector('dialog[open]')){if(code==='KeyT')setPanel(p=>p==='shop'?null:p);return}
  e.preventDefault()
  if(code==='KeyT'){if(gate.locked(performance.now())){refuse('busy');return}setPanel('shop');setTradeTab('buy')}
  if(code==='KeyH')setPanel('help');if(code==='KeyL')setPanel('board');if(code==='KeyV')void maxScreen();if(code==='KeyN'&&sessionRef.current.state.ended)void newRun()
 };window.addEventListener('keydown',key);return()=>window.removeEventListener('keydown',key)
 },[])
 const refreshBoard=async()=>{if(!API){setScores(localScores());return}try{const data=await api<{scores:Score[];player:Score|null}>(`/scores?playerId=${encodeURIComponent(player.playerId)}`);setScores(data.scores);setMyScore(data.player);setBoardStatus('World board · Verified runs')}catch{setScores(localScores());setBoardStatus('World board offline · Local scores on this device')}}
 useEffect(()=>{if(panel!=='board')return;void refreshBoard();const t=setInterval(()=>void refreshBoard(),RULES.leaderboardRefreshMs);return()=>clearInterval(t)},[panel])
 const resetFeel=()=>{gate.reset();holdTimers.current.forEach(clearTimeout);holdTimers.current=[];setHeld(null);setCallout(null);setMark(null);setHistory([]);setRoll(null);flowStep.current=0;refreshBusy()}
 resetFeelRef.current=resetFeel
 const newRun=async()=>{setPosting(true);let next:Session;try{if(API){const ticket=await api<Ticket>('/runs',{playerId:player.playerId,proof:player.proof});next=fresh(ticket.seed,ticket)}else next=fresh()}catch(e){setNotice(`Starting locally. ${(e as Error).message}`);next=fresh()}sessionRef.current=next;clockMark.current=performance.now();resetFeel();setSession(next);choose(next.state.knives[0].id);saveSession(next);scene.current?.sync(next.state,next.state.knives[0].id);setPosting(false);setPanel(null)}
 const autoTicket=useRef<Promise<Ticket>|null>(null)
 useEffect(()=>{if(!API||sessionRef.current.ticket||sessionRef.current.actions.some(a=>a.type!=='wait'&&a.type!=='tick'))return;let active=true;if(!autoTicket.current)autoTicket.current=api<Ticket>('/runs',{playerId:player.playerId,proof:player.proof});void autoTicket.current.then(ticket=>{if(!active||sessionRef.current.ticket||sessionRef.current.actions.some(a=>a.type!=='wait'&&a.type!=='tick'))return;const next=fresh(ticket.seed,ticket);sessionRef.current=next;setSession(next);choose(next.state.knives[0].id);saveSession(next);scene.current?.sync(next.state,next.state.knives[0].id)}).catch(()=>{if(active)setBoardStatus('World board offline · Local scores on this device')});return()=>{active=false}},[player])
 const submit=async()=>{if(posting)return;setPosting(true);saveName(player,name);setName(player.name);const winner=bestKnife(sessionRef.current.state);const score:Score={playerId:player.playerId,name:cleanName(name),value:winner?value(winner,sessionRef.current.state):0,level:winner?.level||0,knife:winner||null};recordLocal(score)
  try{if(API&&session.ticket){await api('/scores',{playerId:player.playerId,proof:player.proof,name:score.name,runId:session.ticket.id,actions:session.actions,knife:winner||null});setBoardStatus('World score submitted.')}else setBoardStatus(API?'This was a local run. Start a new run to qualify for the world board.':'World board offline · Saved on this device')}catch(e){setBoardStatus(`Saved locally. ${(e as Error).message}`)}setScores(localScores());setPosting(false);setPanel('board')}
 const end=()=>{
  if(gate.locked(performance.now())||prepareId.current)return
  unlock();const current=sessionRef.current.state
  if(current.day<runDays(current)){
   const keep=[...current.knives].sort((a,b)=>value(b,current)-value(a,current)).slice(0,RULES.rackSlots)
   for(const n of current.knives.filter(n=>n.place==='rack'&&!keep.some(k=>k.id===n.id)))send({type:'move',id:n.id,to:'crate'})
   for(const n of keep)if(n.place!=='rack')send({type:'move',id:n.id,to:'rack'})
  }
  send({type:'end'})
 }
 const trade=(tab:'buy'|'sell')=>{unlock();setTradeTab(tab);setPanel('shop')}
 const keep=()=>{if(k&&!gate.locked(performance.now())&&!prepareId.current){unlock();send({type:'move',id:k.id,to:'rack'})}}
 const buy=(key:string,forge=false)=>{if(gate.locked(performance.now())||prepareId.current)return;unlock();const id=sessionRef.current.state.nextId;if(send({type:'buy',key})&&forge){setPanel(null);setTimeout(()=>prepareRef.current(id),0)}}
 const sell=(id:number)=>{if(gate.locked(performance.now())||prepareId.current)return;unlock();send({type:'sell',id})}
 const setMotion=(m:Motion)=>{unlock();setMotionState(m)}
 const setHaptics=(on:boolean)=>{setHapticsState(on);writeSetting('cgs-forge-haptics',on?'on':'off');if(on)vibrate([12])}
 const touchControl=(code:string,label:string,icon:string,className='')=>{const handle=code==='KeyE';return <button key={code} className={`ff-touch-key ${className}`} disabled={s.ended} aria-disabled={handle&&busy?true:undefined} aria-label={label} onPointerDown={e=>{e.preventDefault();if(handle&&busy)return;e.currentTarget.setPointerCapture(e.pointerId);if(!handle)setWorkFocus(false);scene.current?.control(code,true);e.currentTarget.dataset.pressed='true'}} onPointerUp={e=>{scene.current?.control(code,false);delete e.currentTarget.dataset.pressed;if(e.currentTarget.hasPointerCapture(e.pointerId))e.currentTarget.releasePointerCapture(e.pointerId)}} onPointerCancel={e=>{scene.current?.control(code,false);delete e.currentTarget.dataset.pressed}} onLostPointerCapture={e=>{scene.current?.control(code,false);delete e.currentTarget.dataset.pressed}}><span aria-hidden="true">{icon}</span><small>{label}</small></button>}

 // Transient locks (a swing, a sale, heating) keep full opacity; only truly unavailable actions dim.
 const blocked=busy||trading||preparing!==null
 const unavailable=s.ended||!ready
 const boardKnife=held?null:anvil||prepareTarget(s)||null
 const forgeKnife=held?held.knife:boardKnife
 const flowing=!s.ended&&!!boardKnife?.flow,flowReady=!s.ended&&!!boardKnife&&!flowing&&boardKnife.pips>=flowNeed(s)
 const buyerPrice=s.offer&&anvil?.id===s.offer.knifeId?Math.round(value(anvil,s)*s.offer.multiplier*(1+bonus(s,'buyer'))):null
 // Odds for the predicted contact time: Flow that ends before the hammer lands no longer protects it.
 const nowRender=performance.now()
 const contactMs=boardKnife&&boardKnife.place==='anvil'?Math.max(0,gate.predictContact(nowRender,{flow:boardKnife.flow>0||boardKnife.pips>=flowNeed(s),protocol:scene.current?.protocol??0})-nowRender):0
 const shown=boardKnife?oddsAtContact(boardKnife,s,contactMs):null
 const t=shown?.odds??null,ev=boardKnife?expectedValue(boardKnife,s):0
 const flowExpiring=!!shown?.expiring
 const survive=boardKnife?survival(boardKnife,s,TUNING.hud.surviveStrikes,{firstContactMs:contactMs,flowCycleMs:TUNING.gate.flowCycleMs}):1
 const phone=view!=='desktop'
 const lastDay=runDays(s),finalDay=s.day>=lastDay
 // The accessible name matches the visible text (WCAG 2.5.3).
 const strikeLabel=preparing?'Heating':!anvil?'Start forging':'Forge'
 return <MinigameShell pageId="forge-or-fold" title="Forge or Fold" back={{href:'/minigames/',label:'All games'}} skip={{href:'#forge-main',label:'Skip to forge'}} className={`ff-page view-${view} ${immersive?'is-immersive':''} ${calm?'is-calm':''}`}>
 <main id="forge-main" ref={mainRef} className={`ff-main ${workFocus?'is-work-focus':''} ${panel==='shop'||(panel==='end'&&!s.ended)?'is-tray-open':''} ${flowing?'is-flowing':flowReady?'is-flow-ready':''} ${oddsOpen?'is-odds-open':''}`} tabIndex={-1}>
  <div className="ff-scene" ref={root} data-testid="forge-scene"/>
  <div className="ff-vignette" aria-hidden="true"/>
  {flowing&&<div key={flowPulse} className="ff-flow-edge" aria-hidden="true"/>}
  {held&&<div key={held.knife.id} className="ff-shatter-vignette" aria-hidden="true"/>}
  <header className="ff-topbar">
   <a href="/minigames/" className="ff-icon-button" aria-label="Back to games"><ForgeIcon name="back"/></a>
   <h1>FORGE <span>/</span> FOLD</h1>
   <div className="ff-stats" aria-label="Run status"><span title="Day"><small>DAY</small><b>{s.day}<em>/{lastDay}</em></b></span><span title="Unlimited energy" aria-label="Unlimited energy"><ForgeIcon name="bolt"/><b>∞</b></span><span title="Gold"><GoldCounter value={s.gold} receipt={receipt} count={goldCount} coins={(scene.current?.protocol??0)<2}/></span></div>
   <nav className="ff-tools" aria-label="Game tools">
    <button className="ff-icon-button" aria-label="Scores" onClick={()=>setPanel('board')}><ForgeIcon name="trophy"/></button>
    <button className="ff-icon-button" aria-label="Help and settings" onClick={()=>setPanel('help')}><ForgeIcon name="help"/></button>
    <button className="ff-icon-button" aria-label={muted?'Unmute sound':'Mute sound'} onClick={()=>{unlock();audio.setMuted(!muted);setMuted(!muted)}}><ForgeIcon name={muted?'mute':'sound'}/></button>
    <button className="ff-icon-button ff-maximize" aria-label={immersive?'Exit full screen':'Enter full screen'} onClick={()=>void maxScreen()}><ForgeIcon name="full"/></button>
   </nav>
  </header>
  {sceneError&&<div className="ff-scene-error" role="alert">{sceneError}</div>}
  {ready&&<>
   <section className={`ff-blade-info ${held?'is-held':''}`} aria-label="Blade and exact odds" onClick={phone?()=>setOddsOpen(o=>!o):undefined} aria-expanded={phone?oddsOpen:undefined} role={phone?'button':undefined} tabIndex={phone?0:undefined} onKeyDown={phone?e=>{if(e.key==='Enter'||e.key===' '){e.preventDefault();setOddsOpen(o=>!o)}}:undefined}>
    <div className="ff-blade-title"><span>{forgeKnife?METALS[forgeKnife.metal].name:'The forge'}</span><b>{forgeKnife?FAMILIES[forgeKnife.family]:'Ready.'}</b>{forgeKnife&&<em>+{forgeKnife.level}</em>}</div>
    {held?<><div className="ff-blade-value ff-loss"><strong>−{format(held.value)}</strong><span>shattered</span></div>{roll&&<ChanceBar chances={roll.chances} roll={roll}/>}</>:boardKnife&&<>
     <div className="ff-blade-value"><strong>{format(value(boardKnife,s))}</strong><span>value</span><small title="Expected value after one more hit">Next avg. {format(ev)}</small></div>
     {t&&<ChanceBar chances={t} roll={roll&&boardKnife.place==='anvil'?roll:null}/>}
     {/* Phones: the next strike's shatter chance on the collapsed odds line (stronger from the 20% gate on). */}
     <b className={`ff-shatter-chip ${!t||t.shatter<=0?'is-zero':t.shatter>=TUNING.gate.riskGate?'is-high':''}`} aria-hidden="true" title="Shatter chance of the next strike">{t?`${Math.round(t.shatter*1000)/10}%`:'0%'}</b>
     <SurviveLine strikes={TUNING.hud.surviveStrikes} chance={survive} history={history}/>
     <div className="ff-status-marks">{boardKnife.guard&&<span><ForgeIcon name="guard"/>Guarded</span>}{boardKnife.flow>0&&<span className={flowExpiring?'is-expiring':''}><ForgeIcon name="bolt"/>{boardKnife.flow.toFixed(1)}s · {flowExpiring?'Ends before contact':'No shatter'}</span>}</div>
    </>}
   </section>
   <aside className="ff-quick-tools" aria-label="Forging tools">{quickItems.map(item=><button key={item} disabled={unavailable||!s.items[item]||(item==='rewind'&&!s.lastHit)||(!k&&item!=='stamina'&&item!=='rewind')} aria-disabled={blocked||undefined} aria-label={`${itemNames[item]} (${s.items[item]})`} title={`${itemNames[item]} · ${ITEMS[item].description}`} onClick={guard(()=>{unlock();send({type:'use',item,id:k?.id})})}><ForgeIcon name={itemIcons[item]}/><b>{s.items[item]}</b><small>{itemNames[item]}</small></button>)}{s.charms.length>0&&<button className="ff-charms-button" aria-label="View charms" onClick={guard(()=>{trade('buy');setCategory('charms')})}><span>◇</span><b>{s.charms.length}</b><small>Charms</small></button>}</aside>
   <div className="ff-feedback" role="status" aria-live="polite">
    {heating&&<span key={`heat-${heating.id}`} className="ff-heating"><ForgeIcon name="fire"/>Heating<span className="ff-heat-bar"/></span>}
    {callout&&<div key={`outcome-${callout.id}`} className={`ff-callout ff-outcome ff-outcome-${callout.label.kind}`} style={{left:callout.x,top:callout.y,'--hold':`${callout.label.holdMs}ms`} as CSSProperties}><b>{callout.label.title}</b><span>{callout.label.delta}</span>{callout.label.sub&&<small>{callout.label.sub}</small>}</div>}
    {notice&&<span className="ff-toast">{notice}</span>}
    {mark&&<i key={mark.id} className="ff-refuse-mark" aria-hidden="true" style={{left:mark.x,top:mark.y,'--hold':`${TUNING.hud.refuseMarkMs}ms`} as CSSProperties}/>}
   </div>
   <div className="ff-touch-controls" aria-label="Touch movement"><div className="ff-dpad">{touchControl('KeyW','Move forward','▲','ff-pad-up')}{touchControl('KeyA','Move left','◀','ff-pad-left')}<span className="ff-pad-center"/>{touchControl('KeyD','Move right','▶','ff-pad-right')}{touchControl('KeyS','Move backward','▼','ff-pad-down')}</div>{touchControl('KeyE','Handle','✋','ff-pad-handle')}</div>
   <div className="ff-control-hint"><kbd>WASD</kbd> Move <span>Drag to look</span><kbd>E</kbd> Handle</div>
   {s.offer&&anvil&&buyerPrice!==null&&<button className="ff-buyer" disabled={unavailable} aria-disabled={blocked||undefined} onClick={guard(()=>send({type:'offer',id:anvil.id}))}><ForgeIcon name="coin"/><span>Buyer <b>{format(buyerPrice)}</b></span><small>{Math.ceil(s.offer.remaining)}s</small><ForgeIcon name="sell"/></button>}
   <div className="ff-bottom">
    <section className="ff-knives" aria-label="Your knives">{s.knives.map(n=><button key={n.id} className={`ff-knife-card ${n.id===selected?'is-selected':''} ${n.place==='rack'?'is-kept':''}`} disabled={unavailable} aria-disabled={blocked||undefined} aria-label={`${METALS[n.metal].name} ${FAMILIES[n.family]}, level ${n.level}, ${n.place}`} aria-pressed={n.id===selected} title={`${knifeName(n)} · ${format(value(n,s))}`} onClick={guard(()=>prepare(n.id))}><span><b>+{n.level}</b>{n.place==='rack'&&<ForgeIcon name="keep"/>}</span><KnifePortrait knife={n}/><small>{METALS[n.metal].name}</small></button>)}<button className="ff-new" aria-label="Prepare new knife" disabled={unavailable} aria-disabled={blocked||undefined} onClick={guard(()=>prepare())}><ForgeIcon name="plus"/><span>New</span></button></section>
    <div className="ff-actionbar">
     <button className="ff-trade" disabled={unavailable} aria-disabled={blocked||undefined} onClick={guard(()=>trade('buy'))}><ForgeIcon name="shop"/><span>Trade</span><kbd>T</kbd></button>
     <button className="ff-keep" disabled={unavailable||!k||k.place==='rack'} aria-disabled={blocked||undefined} onClick={guard(keep)}><ForgeIcon name="keep"/><span>Keep</span></button>
     <button ref={strikeKey} className="ff-strike" disabled={unavailable} aria-disabled={trading||undefined} aria-label={strikeLabel} onClick={hit}><ForgeIcon name={preparing?'fire':'hammer'}/><span>{strikeLabel}</span><kbd>Space</kbd></button>
     <button className="ff-quick-sell" disabled={unavailable||!k} aria-disabled={blocked||undefined} aria-label={k?`Sell ${METALS[k.metal].name} ${FAMILIES[k.family]} for ${saleValue(s,k)} gold`:"Sell knife"} title="Sells this knife immediately" onClick={guard(()=>{if(k)sell(k.id)})}><ForgeIcon name="sell"/><span>Sell <b>{k?format(saleValue(s,k)):"—"}</b></span></button>
     <button className="ff-rest" disabled={unavailable} aria-disabled={blocked||undefined} onClick={guard(()=>setPanel('end'))}><ForgeIcon name="moon"/><span>Rest</span></button>
    </div>
    {s.ended&&<button className="ff-masterwork" onClick={()=>setPanel('result')}>View masterwork</button>}
    {boardKnife&&!s.ended&&<button className={`ff-flow ${flowing?'is-active':flowReady?'is-ready':''} ${flowExpiring?'is-expiring':''}`} disabled={!flowReady||boardKnife.place!=='anvil'} aria-disabled={blocked||undefined} onClick={guard(()=>send({type:'flow',id:boardKnife.id}))} aria-label={flowing?`Flow active, ${boardKnife.flow.toFixed(1)} seconds, no shatter`:flowReady?`Flow ready. Next strike starts ${flowDuration(s)} seconds with no shatter`:`Flow charge ${boardKnife.pips} of ${flowNeed(s)}`} title="Fill the bar. The next strike starts Flow."><ForgeIcon name="bolt"/><span>{flowing?'FLOW':flowReady?'FLOW READY':'Flow'}</span><div className="ff-flow-track">{flowing?<i className="ff-flow-time" style={{width:`${boardKnife.flow/flowDuration(s)*100}%`}}/>:Array.from({length:flowNeed(s)},(_,i)=><i key={i} className={i<boardKnife.pips?'is-filled':''}/>)}</div><b>{flowing?`${boardKnife.flow.toFixed(1)}s`:flowReady?'Strike to unleash':`${boardKnife.pips}/${flowNeed(s)}`}</b></button>}
   </div>
  </>}
  {saveError&&<p className="ff-warning" role="alert">Saving unavailable. Keep this tab open.</p>}
 </main>
 {panel==='shop'&&<Modal tray title="Trade" close={()=>setPanel(null)} accessory={<GoldCounter value={s.gold} receipt={receipt} count={goldCount}/>}>
  <div className="ff-tabs" role="tablist" aria-label="Trade"><button role="tab" aria-selected={tradeTab==='buy'} onClick={()=>setTradeTab('buy')}>Buy</button><button role="tab" aria-selected={tradeTab==='sell'} onClick={()=>setTradeTab('sell')}>Sell <small>{s.knives.length}</small></button></div>
  <MarketBoard run={s}/>
  {s.offer&&anvil&&buyerPrice!==null&&<div className="ff-trade-offer"><ForgeIcon name="coin"/><span><strong>Traveling buyer</strong><small>{buyerPrice>=saleValue(s,anvil)?'+':''}{Math.round((buyerPrice/saleValue(s,anvil)-1)*100)}% vs market · {Math.ceil(s.offer.remaining)}s</small></span><button disabled={unavailable} aria-disabled={blocked||undefined} aria-label={`Accept buyer offer for ${buyerPrice} gold`} onClick={guard(()=>{unlock();send({type:'offer',id:anvil.id})})}>Sell {format(buyerPrice)}</button></div>}
  {tradeTab==='buy'?<><div className="ff-categories">{(['metal','tools','charms'] as const).map(c=><button key={c} aria-pressed={category===c} onClick={()=>setCategory(c)}>{c==='metal'?'Metal':c==='tools'?'Tools':'Charms'}</button>)}</div><div className="ff-shop-grid">{Object.entries(s.stock).filter(([key])=>category==='metal'?key.startsWith('metal:'):category==='charms'?key.startsWith('charm:'):!key.includes(':')).map(([key,stock])=>{
   const metal=key.startsWith('metal:')?key.slice(6) as Metal:null,item=metal?METALS[metal]:key.startsWith('charm:')?CHARMS[key.slice(6) as Charm]:ITEMS[key as Item],cost=price(s,key),disabled=!stock||cost>s.gold||unavailable||(key.startsWith('charm:')&&s.charms.length>=RULES.charmSlots)
   return <article key={key} className={!stock?'is-sold-out':''}>{metal?<div className="ff-ingot" style={{'--metal-color':METALS[metal].color} as CSSProperties}/>:<ForgeIcon name={key.startsWith('charm:')?'guard':itemIcons[key as Item]}/>}<strong>{item.name}</strong><small>{'description'in item?item.description:`Base ${format(item.base)}`}</small><span className="ff-stock"><em>{stock?`${stock} left`:'Sold out'}</em>{cost>s.gold&&stock>0&&<small>Need {format(cost-s.gold)}</small>}</span><button disabled={disabled} aria-disabled={blocked||undefined} aria-label={`Buy ${item.name} for ${cost} gold`} onClick={guard(()=>buy(key))}><span>Buy</span><b>{format(cost)} <ForgeIcon name="coin"/></b></button>{metal&&<button className="ff-buy-forge" disabled={disabled} aria-disabled={blocked||undefined} aria-label={`Buy and forge ${item.name} for ${cost} gold`} onClick={guard(()=>buy(key,true))}><ForgeIcon name="hammer"/>Buy & forge</button>}</article>
  })}</div>{category==='charms'&&s.charms.length>0&&<div className="ff-owned-charms">{s.charms.map(c=><span title={CHARMS[c].description} key={c}>◇ {CHARMS[c].name}</span>)}</div>}</>:<><p className="ff-trade-note">One tap to sell. Kept blades count toward your score.</p><div className="ff-sell-list">{[...s.knives].sort((a,b)=>saleValue(s,b)-saleValue(s,a)||a.id-b.id).map(n=><div key={n.id} className={n.place==='rack'?'is-kept':''}><KnifePortrait knife={n}/><span><strong>{FAMILIES[n.family]} <b>+{n.level}</b></strong><small>{METALS[n.metal].name} · {Math.round(s.market[n.metal]*100)}% market</small>{n.place==='rack'&&<em><ForgeIcon name="keep"/>Kept</em>}</span><button disabled={unavailable} aria-disabled={blocked||undefined} aria-label={`Sell ${METALS[n.metal].name} ${FAMILIES[n.family]} level ${n.level} for ${saleValue(s,n)} gold`} onClick={guard(()=>sell(n.id))}><small>Sell</small><b>{format(saleValue(s,n))}</b><ForgeIcon name="coin"/></button></div>)}{!s.knives.length&&<div className="ff-empty-trade"><ForgeIcon name="shop"/><span>No blades left.</span><button onClick={()=>setTradeTab('buy')}>Buy metal</button></div>}</div></>}
  <div className="ff-trade-message" role="status">{notice||'Restocks each morning.'}</div><button className="ff-primary ff-return" onClick={()=>setPanel(null)}>Back to forge</button>
 </Modal>}
 {panel==='end'&&!s.ended&&<Modal tray title={finalDay?'Finish your run?':'Rest?'} close={()=>setPanel(null)}><p className="ff-dialog-lead">{finalDay?'Your best knife becomes your score.':`Keep your ${Math.min(RULES.rackSlots,s.knives.length)} best knives. Fresh metal and a new market.`}</p><div className="ff-rest-preview">{[...s.knives].sort((a,b)=>value(b,s)-value(a,s)).slice(0,finalDay?1:RULES.rackSlots).map(n=><div key={n.id}><KnifePortrait knife={n}/><b>+{n.level}</b></div>)}</div>{!finalDay&&s.knives.length>RULES.rackSlots&&<p className="ff-small">{s.knives.length-RULES.rackSlots} lower-value knives will be cleared.</p>}<div className="ff-modal-actions"><button onClick={()=>setPanel(null)}>Stay</button><button className="ff-primary" disabled={unavailable} aria-disabled={blocked||undefined} onClick={guard(end)}>{finalDay?'Finish':'Keep & rest'}</button></div></Modal>}
 {panel==='result'&&s.ended&&<Modal title="Your masterwork" close={()=>setPanel(null)}><div className="ff-pedestal">{best&&<KnifePortrait knife={best}/>}<h3>{best?knifeName(best):'A fresh start awaits.'}</h3><strong>{best?format(value(best,s)):'0'}</strong></div><label className="ff-name">Name<input maxLength={WORLD.maxName} value={name} onChange={e=>setName(e.target.value)} placeholder="Anonymous smith" autoComplete="nickname" onKeyDown={e=>{if(e.key==='Enter'){e.preventDefault();void submit()}}}/></label><p className="ff-small">{API&&session.ticket?'Verified world score':'Saved on this device'}</p><div className="ff-modal-actions"><button disabled={posting} onClick={()=>void newRun()}>New run</button><button className="ff-primary" disabled={posting} onClick={()=>void submit()}>{posting?'Saving…':'Save score'}</button></div></Modal>}
 {panel==='board'&&<Modal title="Best blades" close={()=>setPanel(null)}><p className="ff-board-status">{boardStatus}</p><ol className="ff-scores">{scores.length?scores.map((score,i)=><li key={score.playerId} className={score.playerId===player.playerId?'is-you':''}><span>{score.rank||i+1}</span>{score.knife&&<KnifePortrait knife={score.knife}/>}<div><strong>{score.name}{score.playerId===player.playerId?' · You':''}</strong><small>Level {score.level}</small></div><b>{format(score.value)}</b></li>):<li>Finish a run to set the first score.</li>}</ol>{myScore&&!scores.some(n=>n.playerId===player.playerId)&&<p>#{myScore.rank} · {format(myScore.value)}</p>}<div className="ff-modal-actions"><button onClick={()=>void refreshBoard()}>Refresh</button>{s.ended&&<button className="ff-primary" disabled={posting} onClick={()=>void newRun()}>New run</button>}</div></Modal>}
 {panel==='help'&&<Modal title="Make. Risk. Keep." close={()=>setPanel(null)}><div className="ff-rules">{tutorial.map(([title,text])=><div key={title}><h3>{title}</h3><p>{text}</p></div>)}
  <fieldset className="ff-settings"><legend>Settings</legend>
   <div className="ff-setting"><span>Sound</span><button aria-pressed={!muted} onClick={()=>{unlock();audio.setMuted(!muted);setMuted(!muted)}}>{muted?'Off':'On'}</button></div>
   <div className="ff-setting" role="radiogroup" aria-label="Motion"><span>Motion<small>{osReduced?'Your system asks for reduced motion.':'Reduced: no shake, hit-stop or camera turns. Off: no kicks either.'}</small></span><div className="ff-segmented">{MOTIONS.map(m=><button key={m} role="radio" aria-checked={motion===m} onClick={()=>setMotion(m)}>{MOTION_LABELS[m]}</button>)}</div></div>
   {canVibrate&&<div className="ff-setting"><span>Haptics<small>Short pulses on each strike.</small></span><button aria-pressed={haptics} onClick={()=>setHaptics(!haptics)}>{haptics?'On':'Off'}</button></div>}
  </fieldset>
  <div className="ff-modal-actions"><button onClick={()=>setPanel('board')}>Scores</button></div><details><summary>Odds & tools</summary><p>Perfect +2 levels. Good +1. Dull stays. Chip −1. Shatter loses the blade. The odds above the blade are exact, for the moment the hammer lands. Survive 3 more is the chance the blade lives through three more strikes at those odds.</p><p>Flow charges on the same blade. At full charge, the next hit begins four seconds with no shatter risk. Tap rapidly during the countdown: one press is held for the next beat. Chip and Dull can still happen. Energy is unlimited. Guard turns the next Shatter into Chip. Undo restores your last blade and stamina; the next roll is fresh. Hone adds 15% value.</p><p>1–3 use tools. F activates a charged Flow. T opens Trade. V fills the screen. Gold is imaginary. No real purchases.</p></details></div></Modal>}
 </MinigameShell>
}
