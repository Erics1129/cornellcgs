import { useEffect, useRef } from 'react'
import type { Boss, Command, GameState, MiniBoss } from '../types'
import type { SnapshotStore } from '../hooks/useSnapshot'
import { useSlice } from '../hooks/useSnapshot'
import { AbilityGlyph, BossPortrait } from '../art'
import { abilityText } from '../abilities'
import { formatSeconds } from '../challenges'
import Icon from '../Icon'
import { miniBosses } from '../expansion'

/** Real phase thresholds per guardian (CarrotGame p2/p3), drawn as ticks on the bar. */
export const bossPhaseMarks:Record<string,number[]>={garden:[.25,.6],marsh:[.25,.55],frost:[.3,.65],orchard:[.3,.6],tornado:[.25,.6],zombie:[.3,.6],eyeball:[.3,.65],portal:[.3,.65],asuna:[.33,.66]}
const pct=(n:number)=>`${Math.max(0,Math.min(1,Number.isFinite(n)?n:0))*100}%`
const ratio=(a:number,b:number)=>b>0?Math.max(0,Math.min(1,a/b)):0

/** Remembers each cast's full windup (v2 reports it; against v1 the largest castRemaining seen for that cast stands in). */
function useWindup(boss:Pick<Boss,'id'|'ability'|'castRemaining'|'windup'>|null){
 const memo=useRef({key:'',max:0})
 if(!boss||!boss.ability||boss.castRemaining<=0){memo.current={key:'',max:0};return 0}
 const key=`${boss.id}:${boss.ability}`
 if(memo.current.key!==key||boss.castRemaining>memo.current.max+.05)memo.current={key,max:Math.max(boss.castRemaining,memo.current.key===key?memo.current.max:0)}
 return typeof boss.windup==='number'&&boss.windup>0?boss.windup:memo.current.max
}

export function BossBar({store,send,seenAbilities,superTargets,onSaved}:{store:SnapshotStore;send:(c:Command)=>void;seenAbilities:string[];superTargets:Set<number>;onSaved:()=>void}){
 const b=useSlice(store,st=>st&&st.boss&&st.boss.hp>0&&st.phase!=='won'&&st.phase!=='lost'?st.boss:null,(x,y)=>x===y||(!!x&&!!y&&x.hp===y.hp&&x.shield===y.shield&&x.ability===y.ability&&Math.round(x.castRemaining*10)===Math.round(y.castRemaining*10)&&x.phase===y.phase&&x.stage===y.stage&&x.abilityTarget===y.abilityTarget&&Math.round((x.routeFraction||0)*200)===Math.round((y.routeFraction||0)*200)&&Math.round(x.eta??-1)===Math.round(y.eta??-1)&&x.maxHp===y.maxHp&&x.maxShield===y.maxShield))
 const level=useSlice(store,st=>st?.level||0)
 const ring=useRef<HTMLSpanElement>(null),count=useRef<HTMLSpanElement>(null)
 const windup=useWindup(b)
 const pendingSell=useRef<number|null>(null)
 // the chip selects the marked tower; once the snapshot confirms it (and it is not a Super) the sale follows
 useEffect(()=>store.subscribe(()=>{const target=pendingSell.current;if(target===null)return;const st=store.get();const sel=st?.selection
  if(!st?.boss||st.boss.castRemaining<=0||st.boss.abilityTarget!==target){pendingSell.current=null;return}
  if(sel?.type==='tower'&&sel.id===target){pendingSell.current=null;if(sel.tier<5){send({type:'sell'});onSaved()}else superTargets.add(target)}}),[store,send,onSaved,superTargets])
 // countdown ring and seconds follow the game clock between publishes
 useEffect(()=>{if(!b||b.castRemaining<=0)return;let raf=0;const anchor=performance.now(),from=b.castRemaining
  const frame=()=>{raf=requestAnimationFrame(frame);const rate=store.clock().rate,left=Math.max(0,from-Math.min(.35,(performance.now()-anchor)/1000)*rate)
   ring.current?.style.setProperty('--p',String(windup>0?left/windup:0));if(count.current)count.current.textContent=left.toFixed(1)}
  frame();return()=>cancelAnimationFrame(raf)},[b?.castRemaining,b?.ability,windup,store])
 if(!b)return null
 const text=b.ability?abilityText(b.ability):null,casting=!!b.ability&&b.castRemaining>0
 const hp=ratio(b.hp,b.maxHp),shield=ratio(b.shield,b.maxShield)
 const target=typeof b.abilityTarget==='number'&&b.abilityTarget>=0?b.abilityTarget:null
 const challenge=level>=25,fraction=typeof b.routeFraction==='number'?Math.max(0,Math.min(1,b.routeFraction)):null
 const alert=fraction===null?'':fraction>=.9?'is-critical':fraction>=.75?'is-warn':''
 const eta=typeof b.eta==='number'&&Number.isFinite(b.eta)&&b.eta>=0?b.eta:null
 const seen=!!b.ability&&seenAbilities.includes(b.ability)
 const bonus=level===4?10:15
 return <section className={`ct-bossbar ct-panel ct-bossbar--${b.kind} ${casting?'is-casting':''}`} aria-label={`${b.name}, ${Math.ceil(b.hp).toLocaleString()} of ${Math.ceil(b.maxHp).toLocaleString()} health`}>
  <div className="ct-bossbar__head">
   <BossPortrait kind={b.kind}/>
   <strong>{b.name}</strong>
   <span className="ct-tag">{(b.stage||1)>1?`Life ${b.stage} · `:''}Phase {b.phase||1}</span>
   {challenge&&eta!==null&&<span className={`ct-bossbar__eta ${alert}`} aria-hidden="true"><Icon name="warning"/>{formatSeconds(eta)}</span>}
   <span className="ct-bossbar__hp"><b>{Math.ceil(b.hp).toLocaleString()}</b><small> / {Math.ceil(b.maxHp).toLocaleString()}</small></span>
  </div>
  <div className="ct-bossbar__bar" role="progressbar" aria-label="Guardian health" aria-valuemin={0} aria-valuemax={Math.ceil(b.maxHp)} aria-valuenow={Math.ceil(b.hp)}>
   <i className="ct-bossbar__trail" style={{transform:`scaleX(${hp})`}}/>
   <i className="ct-bossbar__main" style={{transform:`scaleX(${hp})`}}/>
   {shield>0&&<i className="ct-bossbar__shield" style={{transform:`scaleX(${shield})`}}/>}
   {(bossPhaseMarks[b.kind]||[]).map(m=><b key={m} style={{left:pct(m)}}/>)}
  </div>
  {challenge&&<div className={`ct-deadline ${alert} ${fraction===null?'is-textonly':''}`}>
   <span className="ct-deadline__text"><Icon name="warning"/>Guardian contact = defeat</span>
   {fraction!==null&&<span className="ct-deadline__bar" role="progressbar" aria-label="Guardian route to the carrot" aria-valuemin={0} aria-valuemax={100} aria-valuenow={Math.round(fraction*100)}><i style={{transform:`scaleX(${fraction})`}}/><b style={{left:'75%'}}/><b style={{left:'90%'}}/></span>}
   {eta!==null&&<b className="ct-deadline__eta">ETA {formatSeconds(eta)}</b>}
  </div>}
  {casting&&text&&<div className="ct-cast" role="status">
   <span className="ct-cast__ring" ref={ring} aria-hidden="true"><AbilityGlyph ability={b.ability}/>{!['blind','uproot','thornwall','tithe','whiteout','crowcurse','dusk'].includes(b.ability)&&<Icon name={text.icon||'warning'}/>}</span>
   <span className="ct-cast__what"><b>{text.name}</b><span>{seen?text.verb:text.hint}</span></span>
   <span className="ct-cast__time"><span ref={count}>{b.castRemaining.toFixed(1)}</span><small>s</small></span>
   {b.ability==='uproot'&&target!==null&&(superTargets.has(target)
    ?<span className="ct-chip is-info">Super drops to IV</span>
    :<button className="ct-chip is-action" onClick={()=>{pendingSell.current=target;send({type:'select',selectionType:'tower',id:target})}} aria-label={`Sell the marked tower now, keeping ${bonus}% more coins`}>Sell now <small>+{bonus}%</small></button>)}
   {text.action==='spend'&&<span className="ct-chip is-info"><Icon name="coin"/>Spend</span>}
   {text.action==='focus'&&b.ability==='root'&&<span className="ct-chip is-info"><Icon name="target"/>Focus</span>}
  </div>}

 </section>
}

/** Asuna's escalating reinforcements (level 29). */
export function Reinforcements({store}:{store:SnapshotStore}){
 const r=useSlice(store,st=>st&&st.level===29&&st.phase==='playing'&&st.boss&&st.boss.hp>0?{tier:st.reinforcementTier||1,next:Math.ceil(st.reinforcementIn||0)}:null)
 if(!r)return null
 return <div className="ct-reinforcements ct-panel" aria-label={`Reinforcements tier ${r.tier}. Next group in ${r.next} seconds`}>
  <span className="ct-label">Reinforcements <b>{['I','II','III','IV','V'][Math.max(0,Math.min(4,r.tier-1))]}</b></span>
  <strong>{r.next}<small>s</small></strong>
  <span className="ct-escalation" aria-hidden="true">{[1,2,3,4,5].map(t=><i key={t} className={t<=r.tier?'is-lit':''}/>)}</span>
 </div>
}

/** Miniboss bars float over the board; tapping one focuses it (selectionType 'enemy'). Only the bar itself (plus 8 px) takes taps. */
export function MiniBars({store,send}:{store:SnapshotStore;send:(c:Command)=>void}){
 const list=useSlice(store,st=>st&&st.phase!=='won'&&st.phase!=='lost'?(st.minibosses||[]).filter(m=>m.visible&&m.hp>0&&m.x>.02&&m.x<.98&&m.y>.04&&m.y<.98):[],
  (a,b)=>a.length===b.length&&a.every((m,i)=>{const o=b[i];return o.id===m.id&&Math.abs(o.x-m.x)<.001&&Math.abs(o.y-m.y)<.001&&o.hp===m.hp&&o.shield===m.shield&&o.ability===m.ability&&Math.round(o.castRemaining*10)===Math.round(m.castRemaining*10)}))
 return <div className="ct-minibars">{list.map((m:MiniBoss)=>{const casting=m.castRemaining>0&&!!m.ability,t=casting?abilityText(m.ability):null
  return <button key={m.id} className={`ct-minibar ${casting?'is-casting':''}`} style={{transform:`translate3d(${(m.x*100).toFixed(2)}cqw,${(m.y*100).toFixed(2)}cqh,0)`}} onClick={()=>send({type:'select',selectionType:'enemy',id:m.id})}
   aria-label={`${m.name}, ${Math.ceil(m.hp)} health. ${casting?`${t?.name} in ${m.castRemaining.toFixed(1)} seconds`:miniBosses.find(b=>b.id===m.kind)?.detail||''} Focus it.`}>
   <span className="ct-minibar__name">{casting?<><Icon name="warning"/>{t?.name}</>:m.name}{casting&&<small>{m.castRemaining.toFixed(1)}s</small>}</span>
   <span className="ct-minibar__bar"><i style={{transform:`scaleX(${ratio(m.hp,m.maxHp)})`}}/>{m.shield>0&&<i className="is-shield" style={{transform:`scaleX(${ratio(m.shield,m.maxShield)})`}}/>}</span>
  </button>})}</div>
}

/**
 * Ordinary monster HP bars, drawn by the page until the build reports `caps: ['worldBars']` (Unity's own instanced bars). Updated
 * imperatively from a small element pool: a publish moves bars without a React render.
 */
export function MonsterBars({store}:{store:SnapshotStore}){
 const root=useRef<HTMLDivElement>(null)
 useEffect(()=>{const host=root.current;if(!host)return;const pool:HTMLDivElement[]=[]
  const draw=()=>{const st:GameState|null=store.get();const show=!!st&&st.phase!=='won'&&st.phase!=='lost'&&!(st.caps||[]).includes('worldBars')
   const list=show?(st!.monsters||[]).filter(m=>m.visible&&m.hp>0&&m.x>0&&m.x<1&&m.y>0&&m.y<1):[]
   while(pool.length<list.length){const el=document.createElement('div');el.className='ct-monster-bar';el.innerHTML='<i></i><i class="is-shield"></i>';host.append(el);pool.push(el)}
   for(let i=0;i<pool.length;i++){const el=pool[i],m=list[i]
    if(!m){if(el.style.display!=='none')el.style.display='none';continue}
    el.style.display='';el.style.transform=`translate3d(${(m.x*100).toFixed(2)}cqw,${(m.y*100).toFixed(2)}cqh,0)`
    ;(el.children[0] as HTMLElement).style.transform=`scaleX(${ratio(m.hp,m.maxHp).toFixed(3)})`
    const sh=el.children[1] as HTMLElement;const s=m.shield>0?ratio(m.shield,m.maxShield):0;sh.style.transform=`scaleX(${s.toFixed(3)})`;sh.style.display=s>0?'':'none'}}
  draw();const off=store.subscribe(draw);return()=>{off();host.replaceChildren()}},[store])
 return <div className="ct-monster-bars" ref={root} aria-hidden="true"/>
}
