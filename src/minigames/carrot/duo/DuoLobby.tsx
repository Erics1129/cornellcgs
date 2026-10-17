// The multiplayer lobby: one full-screen overlay with four screens (home: create or join; connecting; the room; an error), drawn as
// one soft glass sheet over a dim scrim. The room screen shows the code to share, both seats (name, host, ready, connected or away,
// loading, Direct or Relay with ping), the host's choice of mode and fight, and Ready / Start. It shows while Unity loads behind it.
import { useEffect, useMemo, useRef, useState } from 'react'
import type { KeyboardEvent as ReactKeyboardEvent } from 'react'
import type { GameDefinitions } from '../types'
import type { DuoController } from './useDuo'
import { useDuoSlice } from './useDuo'
import type { DuoSnapshot, PeerInfo, RoomMode } from './contract'
import { loadedFraction } from './contract'
import { CodeInput } from './CodeInput'
import type { CodeCheck } from './code'
import { normalizeCode, roomLink, spokenCode } from './code'
import { errorCopy } from './copy'
import { ENDLESS_ID, ENDLESS_NAME, displayName, fightInfo, offerFights, readName, readProfile } from './profile'
import type { FightOffer } from './profile'
import { Avatar, Glyph, Meter } from './bits'
import { chapterArt, jacketArt } from '../art'
import { NAME_MAX } from '../net/protocol.ts'

export function DuoLobby({ctl,definitions}:{ctl:DuoController;definitions:GameDefinitions|null}){
 const s=useDuoSlice(ctl,x=>x,Object.is)
 const sheet=useRef<HTMLElement>(null)
 const screen=s.phase==='error'?'error':s.phase==='connecting'?'connecting':s.phase==='lobby'?'room':'home'
 // each screen change moves focus to its heading, so a screen reader hears where it is; Tab stays inside the sheet
 useEffect(()=>{const h=sheet.current?.querySelector<HTMLElement>('[data-autofocus]')||sheet.current?.querySelector<HTMLElement>('h2');h?.focus({preventScroll:true})},[screen])
 const onKey=(e:ReactKeyboardEvent)=>{
  if(e.key==='Escape'&&(screen==='home'||screen==='error')){e.stopPropagation();ctl.close();return}
  if(e.key!=='Tab'||!sheet.current)return
  const items=[...sheet.current.querySelectorAll<HTMLElement>('button:not(:disabled),input:not(:disabled),a[href],[tabindex="0"]')].filter(n=>n.offsetParent!==null)
  if(!items.length)return
  const first=items[0],last=items[items.length-1]
  if(e.shiftKey&&document.activeElement===first){e.preventDefault();last.focus()}else if(!e.shiftKey&&document.activeElement===last){e.preventDefault();first.focus()}
 }
 const title=screen==='room'?(s.host?'Your room':'Room'):screen==='error'?'Multiplayer':'Play with a friend'
 return <div className="ct-duo ct-duo-lobby" onKeyDown={onKey}>
  <div className="ct-duo-lobby__scrim" aria-hidden="true"/>
  <section ref={sheet} className="ct-duo-sheet" role="dialog" aria-modal="true" aria-labelledby="ct-duo-title" data-screen={screen}>
   <header className="ct-duo-sheet__head">
    <div><p className="ct-duo-kicker">Multiplayer · 2 players</p><h2 id="ct-duo-title" tabIndex={-1}>{title}</h2></div>
    {screen==='room'?null:<button type="button" className="ct-duo-icon" aria-label="Close multiplayer" onClick={ctl.close}><Glyph name="close"/></button>}
   </header>
   {screen==='home'&&<Home ctl={ctl}/>}
   {screen==='connecting'&&<Connecting ctl={ctl} code={s.code}/>}
   {screen==='room'&&<Room ctl={ctl} s={s} definitions={definitions}/>}
   {screen==='error'&&<ErrorScreen ctl={ctl} s={s}/>}
  </section>
 </div>
}

function NameField({value,onChange,onCommit,id='ct-duo-name',placeholder='Shown to your friend'}:{value:string;onChange:(v:string)=>void;onCommit?:(v:string)=>void;id?:string;placeholder?:string}){
 return <div className="ct-duo-field">
  <label htmlFor={id} className="ct-duo-label">Your name</label>
  <input id={id} className="ct-duo-input" value={value} maxLength={NAME_MAX} autoComplete="nickname" spellCheck={false} placeholder={placeholder} onChange={e=>onChange(e.target.value)} onBlur={e=>onCommit?.(e.target.value)} onKeyDown={e=>{if(e.key==='Enter')(e.target as HTMLInputElement).blur()}}/>
 </div>
}

function Home({ctl}:{ctl:DuoController}){
 const [name,setName]=useState(readName)
 const [code,setCode]=useState<CodeCheck>({code:'',complete:false,error:null})
 const [tried,setTried]=useState(false)
 const join=()=>{setTried(true);const c=normalizeCode(code.code);if(!c.complete||c.error){setCode({...c,error:c.error||'Enter all five characters'});return}void ctl.join(c.code,name)}
 return <div className="ct-duo-sheet__body ct-duo-home">
  <NameField value={name} onChange={setName}/>
  <div className="ct-duo-home__choices">
   <section className="ct-duo-card ct-duo-home__card" aria-labelledby="ct-duo-host">
    <h3 id="ct-duo-host">Host a room</h3>
    <p>Choose the fight, then share a five-character code.</p>
    <button type="button" className="ct-duo-btn ct-duo-btn--primary" data-autofocus onClick={()=>void ctl.create(name)}>Create room</button>
   </section>
   <section className="ct-duo-card ct-duo-home__card" aria-labelledby="ct-duo-join">
    <h3 id="ct-duo-join">Join a friend</h3>
    <CodeInput value={code.code} error={tried||code.error?code.error:null} onChange={c=>{setCode(c);if(!c.error)setTried(false)}} onSubmit={join}/>
    <button type="button" className="ct-duo-btn" onClick={join} disabled={!code.code}>Join room</button>
   </section>
  </div>
  <ul className="ct-duo-home__modes">
   <li><b>Boss fights.</b> Each of you defends one half of a mirrored double map. Either carrot falling ends it; a win counts for both of you.</li>
   <li><b>Endless.</b> Twin Gates: one shared map and purse, both of you build anywhere, and the waves never stop.</li>
  </ul>
 </div>
}

function Connecting({ctl,code}:{ctl:DuoController;code:string|null}){
 return <div className="ct-duo-sheet__body ct-duo-wait" aria-busy="true">
  <span className="ct-duo-spinner" aria-hidden="true"><i/><i/><i/></span>
  <p data-autofocus tabIndex={-1}>{code?`Joining room ${code}…`:'Opening your room…'}</p>
  <button type="button" className="ct-duo-btn" onClick={ctl.back}>Cancel</button>
 </div>
}

function ErrorScreen({ctl,s}:{ctl:DuoController;s:DuoSnapshot}){
 const copy=errorCopy(s.error)
 return <div className="ct-duo-sheet__body ct-duo-error" role="alert">
  <span className="ct-duo-error__mark" aria-hidden="true">!</span>
  <h3 data-autofocus tabIndex={-1}>{copy.title}</h3>
  <p>{copy.body}</p>
  <div className="ct-duo-actions">
   {copy.retry&&<button type="button" className="ct-duo-btn ct-duo-btn--primary" onClick={ctl.retry}>Retry</button>}
   <button type="button" className="ct-duo-btn" onClick={ctl.back}><Glyph name="back"/>Back</button>
  </div>
 </div>
}

/** The fights the host may pick, with each seat's locks: intersection by default, union on the host's toggle. */
function useOffer(s:DuoSnapshot){
 return useMemo(()=>{
  const me=s.peers.find(p=>p.me),them=s.peers.find(p=>!p.me)
  const mine=me?.unlocked?.length?me.unlocked:readProfile().unlocked
  return offerFights(mine,them?them.unlocked||[]:null,s.union,s.seat??0)
 },[s.peers,s.union,s.seat])
}

function Room({ctl,s,definitions}:{ctl:DuoController;s:DuoSnapshot;definitions:GameDefinitions|null}){
 const me=s.peers.find(p=>p.me),them=s.peers.find(p=>!p.me)
 const offer=useOffer(s)
 const endless=s.roomMode==='endless2p'
 const choice=offer.find(o=>o.id===s.level)
 // the host never sits on a fight that is locked for the pair (a partner with fewer unlocks joined, or union was switched off)
 useEffect(()=>{if(!s.host||endless||!them)return;if(choice&&choice.open)return;const first=offer.find(o=>o.open);if(first&&first.id!==s.level)ctl.configure('duoBoss',first.id,s.union)},[s.host,endless,them,choice,offer,s.level,s.union,ctl])
 const bothReady=!!me&&!!them&&me.ready&&them.ready
 const loaded=(p?:PeerInfo)=>loadedFraction(p?.loaded)>=1
 const canStart=s.host&&bothReady&&!!me&&!!them&&me.connected&&them.connected&&loaded(me)&&loaded(them)&&(endless||!!choice?.open)
 const partnerName=them?displayName(them.name,them.seat):'your friend'
 const hint=!them?'Waiting for a friend to join':!me?.ready?'Press Ready when you are set':!them.ready?`Waiting for ${partnerName} to be ready`:!loaded(me)?`Your game is still loading (${Math.round(loadedFraction(me.loaded)*100)}%)`:!loaded(them)?`${partnerName} is still loading (${Math.round(loadedFraction(them.loaded)*100)}%)`:!them.connected?`${partnerName} is reconnecting`:s.host?'Everyone is ready':`Waiting for ${displayName(them.name,them.seat)} to start`
 const pick=(mode:RoomMode,level:number)=>ctl.configure(mode,level,s.union)
 return <>
  <div className="ct-duo-sheet__body ct-duo-room">
   <CodeCard ctl={ctl} code={s.code||''}/>
   <div className="ct-duo-seats" role="list" aria-label="Players">
    {[0,1].map(seat=>{const p=s.peers.find(x=>x.seat===seat);return p?<Seat key={seat} ctl={ctl} p={p} s={s}/>:<EmptySeat key={seat} code={s.code||''}/>})}
   </div>
   <section className="ct-duo-mode" aria-labelledby="ct-duo-mode-title">
    <div className="ct-duo-mode__head">
     <h3 id="ct-duo-mode-title">{s.host?'Choose the match':'The match'}</h3>
     {!s.host&&<span className="ct-duo-note">The host picks</span>}
    </div>
    <div className="ct-duo-seg" role="radiogroup" aria-label="Mode">
     {([['duoBoss','Boss fight'],['endless2p','Endless (2 players)']] as [RoomMode,string][]).map(([mode,label])=><button key={mode} type="button" role="radio" aria-checked={s.roomMode===mode} disabled={!s.host&&s.roomMode!==mode} aria-disabled={!s.host||undefined} className="ct-duo-seg__btn"
      onClick={()=>{if(!s.host||s.roomMode===mode)return;if(mode==='endless2p')pick(mode,ENDLESS_ID);else{const first=offer.find(o=>o.open);pick(mode,first?.id||25)}}}>{label}</button>)}
    </div>
    {endless?<EndlessCard s={s}/>:s.host?<FightList offer={offer} level={s.level} definitions={definitions} names={names(s)} onPick={id=>pick('duoBoss',id)}/>:<FightCard o={choice||{id:s.level,open:true,mine:true,theirs:true,lockedFor:[]}} selected definitions={definitions} names={names(s)} readOnly/>}
    {s.host&&!endless&&<label className="ct-duo-switch">
     <input type="checkbox" checked={s.union} onChange={e=>ctl.configure('duoBoss',s.level,e.target.checked)}/>
     <span><b>Include fights only one of us has unlocked</b><small>A win unlocks it for both of you</small></span>
    </label>}
   </section>
  </div>
  <footer className="ct-duo-sheet__foot">
   <p className="ct-duo-foot__hint" aria-live="polite">{hint}</p>
   <div className="ct-duo-actions">
    <button type="button" className="ct-duo-btn is-quiet" onClick={ctl.leave}>Leave</button>
    <button type="button" className={`ct-duo-btn ct-duo-ready ${me?.ready?'is-on':''}`} aria-pressed={!!me?.ready} onClick={()=>ctl.setReady(!me?.ready)}>{me?.ready?<><Glyph name="check"/>Ready</>:'I’m ready'}</button>
    {s.host&&<button type="button" className="ct-duo-btn ct-duo-btn--primary" disabled={!canStart} onClick={ctl.start}>Start match</button>}
   </div>
  </footer>
 </>
}
const names=(s:DuoSnapshot):[string,string]=>{const n:[string,string]=['Player 1','Player 2'];for(const p of s.peers)n[p.seat]=p.me?'you':displayName(p.name,p.seat);return n}

function CodeCard({ctl,code}:{ctl:DuoController;code:string}){
 const [copied,setCopied]=useState<''|'code'|'link'>('')
 useEffect(()=>{if(!copied)return;const t=setTimeout(()=>setCopied(''),2000);return()=>clearTimeout(t)},[copied])
 const copy=async(what:'code'|'link')=>{const text=what==='code'?code:roomLink(location.href,code);let ok=false
  try{await navigator.clipboard.writeText(text);ok=true}catch{/* fall back below */}
  if(!ok){try{const t=document.createElement('textarea');t.value=text;t.setAttribute('readonly','');t.style.position='fixed';t.style.opacity='0';document.body.append(t);t.select();ok=document.execCommand('copy');t.remove()}catch{ok=false}}
  if(ok){setCopied(what);ctl.copied(what)}}
 return <section className="ct-duo-codecard" aria-label="Room code">
  <span className="ct-duo-label">Room code</span>
  <p className="ct-duo-codecard__code" aria-label={`Room code ${spokenCode(code)}`} data-autofocus tabIndex={-1}>{[...code].map((ch,i)=><span key={i} aria-hidden="true">{ch}</span>)}</p>
  <div className="ct-duo-codecard__actions">
   <button type="button" className="ct-duo-btn is-sm" onClick={()=>void copy('code')}><Glyph name={copied==='code'?'check':'copy'}/>{copied==='code'?'Copied':'Copy code'}</button>
   <button type="button" className="ct-duo-btn is-sm" onClick={()=>void copy('link')}><Glyph name={copied==='link'?'check':'link'}/>{copied==='link'?'Copied':'Copy link'}</button>
  </div>
 </section>
}

function Seat({ctl,p,s}:{ctl:DuoController;p:PeerInfo;s:DuoSnapshot}){
 const [name,setName]=useState(p.name||'')
 const loaded=loadedFraction(p.loaded),pct=Math.round(loaded*100)
 const shown=displayName(p.name,p.seat)
 const status=p.away?'Away':p.connected?'Connected':'Connecting'
 const path=!p.me&&p.connected&&!p.away&&s.path!=='none'?`${s.path==='p2p'?'Direct':'Relay'} · ${Math.round(s.rttMs||0)} ms`:''
 return <article className="ct-duo-seat" role="listitem" data-me={p.me?'1':undefined} data-ready={p.ready?'1':undefined} data-away={p.away||!p.connected?'1':undefined}
  aria-label={`${p.me?'You':shown}${p.host?', host':''}: ${p.ready?'ready':'not ready'}, ${status.toLowerCase()}, ${loaded>=1?'loaded':`loading ${pct}%`}${path?`, ${path.replace('·',',')}`:''}`}>
  <div className="ct-duo-seat__top">
   <Avatar name={shown} tone={p.me?'me':'partner'}/>
   <div className="ct-duo-seat__who">
    {p.me?<NameField id={`ct-duo-seat-${p.seat}`} value={name} placeholder={displayName('',p.seat)} onChange={setName} onCommit={v=>setName(ctl.rename(v))}/>:<b>{shown}</b>}
    <span className="ct-duo-tags">{p.me&&<span className="ct-duo-tag">You</span>}{p.host&&<span className="ct-duo-tag is-host"><Glyph name="crown"/>Host</span>}</span>
   </div>
  </div>
  <ul className="ct-duo-seat__status" aria-hidden="true">
   <li data-ok={p.ready?'1':undefined}>{p.ready?<><Glyph name="check"/>Ready</>:'Not ready'}</li>
   <li data-warn={p.away||!p.connected?'1':undefined}>{status}</li>
   {path&&<li><Glyph name="signal"/>{path}</li>}
  </ul>
  <div className="ct-duo-seat__load" aria-hidden="true"><Meter value={loaded} tone={p.me?'me':'partner'}/><small>{loaded>=1?'Game loaded':`Loading ${pct}%`}</small></div>
 </article>
}
function EmptySeat({code}:{code:string}){
 return <article className="ct-duo-seat is-empty" role="listitem" aria-label="Empty seat: waiting for your friend">
  <div className="ct-duo-seat__top"><Avatar name="" tone="empty"/><div className="ct-duo-seat__who"><b>Waiting for your friend</b><small>Share the code {code}</small></div></div>
 </article>
}

function FightList({offer,level,definitions,names,onPick}:{offer:FightOffer[];level:number;definitions:GameDefinitions|null;names:[string,string];onPick:(id:number)=>void}){
 const list=useRef<HTMLDivElement>(null)
 // arrow keys move between the open fights (one radio group, one tab stop)
 const onKey=(e:ReactKeyboardEvent)=>{
  if(!['ArrowRight','ArrowDown','ArrowLeft','ArrowUp'].includes(e.key))return
  e.preventDefault();const open=offer.filter(o=>o.open);const i=open.findIndex(o=>o.id===level);const next=open[(i+(e.key==='ArrowRight'||e.key==='ArrowDown'?1:open.length-1))%open.length]
  if(next){onPick(next.id);requestAnimationFrame(()=>list.current?.querySelector<HTMLElement>(`[data-id="${next.id}"]`)?.focus())}
 }
 return <div ref={list} className="ct-duo-fights" role="radiogroup" aria-label="Boss fight" onKeyDown={onKey}>
  {offer.map(o=><FightCard key={o.id} o={o} selected={o.id===level} definitions={definitions} names={names} onPick={()=>onPick(o.id)}/>)}
 </div>
}
function lockText(o:FightOffer,names:[string,string]){
 if(!o.lockedFor.length)return ''
 if(o.lockedFor.length===2)return 'Locked for both'
 const n=names[o.lockedFor[0]]
 return o.open?`New for ${n}`:`Locked for ${n}`
}
function FightCard({o,selected,definitions,names,onPick,readOnly=false}:{o:FightOffer;selected:boolean;definitions:GameDefinitions|null;names:[string,string];onPick?:()=>void;readOnly?:boolean}){
 const info=fightInfo(o.id),def=definitions?.levels.find(l=>l.id===o.id)
 const name=(def?.name||info?.name||`Stage ${o.id}`).replace(/\s+—.*$/,'')
 const level=def?.challenge||info?.difficulty||''
 const sub=info?.kind==='challenge'?`Challenge · ${level.charAt(0).toUpperCase()}${level.slice(1)}`:`Guardian · ${info?.guardian||''}`
 const tag=lockText(o,names)
 const label=`${String(o.id).padStart(2,'0')} ${name}. ${sub}.${tag?` ${tag}.`:''}${!o.open?' Not available.':''}`
 const body=<>
  <span className="ct-duo-fight__art"><img src={jacketArt(o.id)} alt="" loading="lazy" decoding="async"/></span>
  <span className="ct-duo-fight__text"><span className="ct-duo-fight__name"><i>{String(o.id).padStart(2,'0')}</i>{name}</span><small>{sub}</small>{tag&&<span className={`ct-duo-tag ${o.open?'is-new':'is-locked'}`}>{tag}</span>}</span>
 </>
 if(readOnly)return <div className="ct-duo-fight is-readonly" data-selected="1" aria-label={label}>{body}</div>
 return <button type="button" role="radio" data-id={o.id} aria-checked={selected} aria-disabled={!o.open||undefined} tabIndex={selected?0:-1} className="ct-duo-fight" aria-label={label} onClick={()=>{if(o.open)onPick?.()}}>{body}</button>
}
function EndlessCard({s}:{s:DuoSnapshot}){
 const me=s.peers.find(p=>p.me),them=s.peers.find(p=>!p.me)
 const best=(n:number)=>n>0?`${n} ${n===1?'wave':'waves'}`:'none yet'
 return <div className="ct-duo-endless-card">
  <span className="ct-duo-endless-card__art" aria-hidden="true"><img src={chapterArt('orchard')} alt="" loading="lazy" decoding="async"/></span>
  <div className="ct-duo-endless-card__text">
   <span className="ct-duo-fight__name"><i>∞</i>{ENDLESS_NAME}</span>
   <p>Endless waves with random bosses and minibosses, harder every wave. One shared purse: both of you plant, upgrade, merge and sell anywhere.</p>
   <dl className="ct-duo-bests"><div><dt>Your best</dt><dd>{best(me?.best||0)}</dd></div>{them&&<div><dt>{displayName(them.name,them.seat)}'s best</dt><dd>{best(them.best||0)}</dd></div>}</dl>
  </div>
 </div>
}
