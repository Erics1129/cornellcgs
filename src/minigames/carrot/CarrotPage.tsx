import { useCallback, useEffect, useRef, useState } from 'react'
import type { ReactNode } from 'react'
import { CarrotUnity } from './unity'
import { menuSound, stopMenuSound } from './uiAudio'
import { awardCampaign, readCampaign, saveCampaign } from './progress'
import { BossPortrait, CarrotPortrait, RouteDrawing, TowerPortrait, chapterArt, meterStyle } from './art'
import Icon from './Icon'
import type { CampaignSave, Command, GameDefinitions, GameState, LevelDefinition } from './types'
import './carrot.css'

const chapters=[{id:'garden',name:'Sunlit Garden',number:'01'},{id:'marsh',name:'Moonlit Marsh',number:'02'},{id:'frost',name:'Frostglass Highlands',number:'03'}]
const roman=['I','II','III','IV']
const bossPhaseMarks:Record<string,number[]>={garden:[.25,.6],marsh:[.25,.55],frost:[.3,.65]}
const friendly=(s:string)=>s?.replace(/([a-z])([A-Z])/g,'$1 $2').replace(/[_-]/g,' ')||''
const pct=(n:number)=>`${Math.round(Math.max(0,Math.min(1,n))*100)}%`

function Modal({title,children,onClose,className=''}:{title:string;children:ReactNode;onClose:()=>void;className?:string}){
 const ref=useRef<HTMLDialogElement>(null)
 useEffect(()=>{const el=ref.current;el?.showModal();return()=>el?.close()},[])
 return <dialog ref={ref} className={`ct-dialog ${className}`} onCancel={e=>{e.preventDefault();onClose()}} onClick={e=>{if(e.target===e.currentTarget)onClose()}} aria-label={title}>
  <div className="ct-dialog__inner"><header><h2>{title}</h2><button className="ct-icon" onClick={onClose} aria-label={`Close ${title}`}><Icon name="close"/></button></header>{children}</div>
 </dialog>
}
function Medals({value=0}:{value?:number}){return <span className="ct-medals" aria-label={`${value&1?'Completed. ':''}${value&2?'Carrot unharmed. ':''}${value&4?'Scenery cleared.':''}`}>{[1,2,4].map((v,i)=><i className={value&v?'is-earned':''} key={v}><Icon name={['check','heart','leaf'][i]}/></i>)}</span>}
function LevelCard({level,save,choose,preview=false}:{level:LevelDefinition;save:CampaignSave;choose:(level:number)=>void;preview?:boolean}){
 const locked=level.id>save.unlocked&&!preview
 return <button className={`ct-level ${locked?'is-locked':''}`} disabled={locked} onClick={()=>choose(level.id)} aria-label={`${level.id}. ${level.name}${locked?', locked':''}`}>
  <span className="ct-level__scene" style={{backgroundImage:`url(${chapterArt(level.biome)})`}}><RouteDrawing routes={level.routes}/><b>{String(level.id).padStart(2,'0')}</b>{locked?<span className="ct-level__lock"><Icon name="lock"/></span>:level.boss?<span className="ct-level__boss"><BossPortrait kind={level.boss}/></span>:null}</span>
  <span className="ct-level__caption"><strong>{level.name}</strong><Medals value={save.medals[level.id]}/></span>
 </button>
}

export default function CarrotPage(){
 const root=useRef<HTMLDivElement>(null),mount=useRef<HTMLDivElement>(null),engine=useRef<CarrotUnity|null>(null)
 const [definitions,setDefinitions]=useState<GameDefinitions|null>(null),[save,setSave]=useState(readCampaign)
 const [entered,setEntered]=useState(false),[ready,setReady]=useState(false),[loading,setLoading]=useState(0),[error,setError]=useState('')
 const [state,setState]=useState<GameState|null>(null),[level,setLevel]=useState(1),[picked,setPicked]=useState('seed')
 const [panel,setPanel]=useState<'campaign'|'help'|'collection'|null>(null),[expanded,setExpanded]=useState(false),[warning,setWarning]=useState<{kind:string;name:string}|null>(null),[result,setResult]=useState(false)
 const current=useRef(state),saved=useRef(save),wasPlaying=useRef(false),lastBoss=useRef(''),award=useRef(''),noticeTimer=useRef<number>(),warningTimer=useRef<number>()
 const [notice,setNotice]=useState('')
 const preview=import.meta.env.DEV&&new URLSearchParams(location.search).has('carrot-preview')
 const qaLevel=preview?Math.max(1,Math.min(12,Number(new URLSearchParams(location.search).get('carrot-preview'))||1)):1
 current.current=state;saved.current=save
 const send=useCallback((command:Command)=>engine.current?.send(command),[])
 useEffect(()=>{let active=true;fetch('/assets/minigames/carrot/game-data.json').then(r=>{if(!r.ok)throw new Error('The garden guide could not download. Please retry.');return r.json()}).then((d:GameDefinitions)=>{if(active&&Array.isArray(d.towers)&&Array.isArray(d.levels))setDefinitions(d)}).catch(e=>{if(active)setError(e.message)});return()=>{active=false}},[])
 useEffect(()=>{const oldTitle=document.title;document.title='Carrot Defense 3D · Cornell CGS';document.documentElement.classList.add('ct-document');return()=>{document.title=oldTitle;document.documentElement.classList.remove('ct-document')}},[])
 useEffect(()=>{
  if(!entered||!mount.current)return
  setReady(false);setError('');const game=new CarrotUnity(mount.current,{state:setState,progress:setLoading,ready:()=>setReady(true),error:setError},level,!saved.current.sound);engine.current=game
  return()=>{game.dispose();if(engine.current===game)engine.current=null}
 },[entered])
 useEffect(()=>{if(!state)return;const key=state.boss?`${state.level}:${state.boss.id}`:'';if(key&&key!==lastBoss.current){lastBoss.current=key;setWarning({kind:state.boss!.kind,name:state.boss!.name});clearTimeout(warningTimer.current);warningTimer.current=window.setTimeout(()=>setWarning(null),3600)}},[state?.boss?.id,state?.level])
 useEffect(()=>{if(!state?.notice)return;setNotice(state.notice);clearTimeout(noticeTimer.current);noticeTimer.current=window.setTimeout(()=>setNotice(''),2800)},[state?.notice])
 useEffect(()=>{setResult(false);if(state?.phase!=='won'&&state?.phase!=='lost')return;const timer=window.setTimeout(()=>setResult(true),state.phase==='won'?2200:1100);const key=`${state.level}:${state.phase}`;
  if(state.phase==='won'&&award.current!==key&&!preview){award.current=key;setSave(previous=>awardCampaign(previous,state.level,state.health,state.blockersRemaining===0))}return()=>clearTimeout(timer)
 },[state?.phase,state?.level])
 useEffect(()=>{if(state?.selection?.type==='pad'){setPicked('seed');send({type:'preview',kind:'seed'})}},[state?.selection?.type,state?.selection?.id,send])
 useEffect(()=>{const visibility=()=>{if(document.hidden&&current.current&&!current.current.paused&&current.current.phase==='playing')send({type:'pause'})};document.addEventListener('visibilitychange',visibility);return()=>document.removeEventListener('visibilitychange',visibility)},[send])
 useEffect(()=>{const key=(e:KeyboardEvent)=>{if(e.repeat||e.metaKey||e.ctrlKey||e.altKey||panel||!entered||!ready||e.target instanceof HTMLInputElement||e.target instanceof HTMLTextAreaElement)return;
  if(e.key==='Escape'){send({type:'clear'});return}if(e.code==='Space'&&!(e.target instanceof HTMLButtonElement)){e.preventDefault();send({type:current.current?.phase==='ready'?'start':'pause'})}if(e.key.toLowerCase()==='u'&&current.current?.selection?.type==='tower')send({type:'upgrade'})};window.addEventListener('keydown',key);return()=>window.removeEventListener('keydown',key)},[entered,ready,panel,send])
 useEffect(()=>{const f=()=>setExpanded(!!document.fullscreenElement);document.addEventListener('fullscreenchange',f);return()=>document.removeEventListener('fullscreenchange',f)},[])
 useEffect(()=>()=>{clearTimeout(noticeTimer.current);clearTimeout(warningTimer.current);stopMenuSound()},[])
 const choose=(id:number)=>{if(id>saved.current.unlocked&&!preview)return;setPanel(null);setLevel(id);setResult(false);setWarning(null);lastBoss.current='';award.current='';if(entered){send({type:'load',level:id})}else setEntered(true)}
 const openPanel=(value:typeof panel)=>{wasPlaying.current=!!current.current&&!current.current.paused&&current.current.phase==='playing';if(wasPlaying.current)send({type:'pause'});setPanel(value)}
 const closePanel=()=>{setPanel(null);if(wasPlaying.current&&current.current?.paused)send({type:'pause'});wasPlaying.current=false}
 const toggleSound=()=>{const next={...save,sound:!save.sound};setSave(next);saveCampaign(next);send({type:'mute',value:next.sound?0:1})}
 const fullscreen=async()=>{try{if(document.fullscreenElement)await document.exitFullscreen();else if(root.current?.requestFullscreen)await root.current.requestFullscreen();else setExpanded(v=>!v)}catch{setExpanded(v=>!v)}}
 const selection=state?.selection,selectedTower=selection?.type==='tower'?definitions?.towers.find(t=>t.id===selection.kind):undefined
 const buyTower=definitions?.towers.find(t=>t.id===picked),tier=Math.max(1,Math.min(4,selection?.tier||1))
 const choiceOpen=!!state&&!!selection&&['pad','tower','blocker','enemy'].includes(selection.type)&&!result&&!panel
 const getHealth=(hp:number,max:number)=>max>0?hp/max:0
 return <div className={`ct-page ${expanded?'is-expanded':''}`} ref={root} onClickCapture={e=>{
  const button=(e.target as Element).closest('button:not(:disabled),a');if(!saved.current.sound||!button)return
  const label=button.getAttribute('aria-label')||button.textContent||''
  const kind=/^Close/.test(label)?'close':/Choose|Meet|How to/.test(label)?'open':'click'
  if(ready)engine.current?.uiSound(kind);else menuSound(kind)
 }}>
  {!entered?<main className="ct-lobby" style={{backgroundImage:`url(${chapterArt('garden')})`}}>
   <nav className="ct-lobby-nav"><a href="/minigames/"><Icon name="back"/>All games</a><span>CORNELL CGS</span><button onClick={()=>openPanel('help')} className="ct-icon" aria-label="How to play"><Icon name="help"/></button></nav>
   <div className="ct-lobby-copy"><p className="ct-kicker">A little garden. A grand defense.</p><h1>Carrot<br/>Defense <em>3D</em></h1><p className="ct-chinese">保卫萝卜 · 3D</p><div className="ct-lobby-actions"><button className="ct-primary" disabled={!definitions} onClick={()=>choose(preview?qaLevel:save.unlocked)}>{save.unlocked>1?'Continue':'Enter the garden'}<Icon name="arrow"/></button><button className="ct-secondary" disabled={!definitions} onClick={()=>openPanel('campaign')}>Choose a level</button></div>{error&&<p role="alert" className="ct-error">{error} <button onClick={()=>location.reload()}>Retry</button></p>}<p className="ct-lobby-meta">12 landscapes <i/> 10 towers <i/> 3 guardians</p></div>
   <footer className="ct-lobby-foot"><span>Original maps & artwork · Fan project</span><button onClick={()=>openPanel('collection')}>Meet your defenses<Icon name="arrow"/></button></footer>
  </main>:<main className="ct-game" aria-label="Carrot Defense battlefield">
   <div className="ct-scene" ref={mount}/>
   {(!ready||error)&&<div className="ct-loading" style={{backgroundImage:`url(${chapterArt(definitions?.levels.find(l=>l.id===level)?.biome||'garden')})`}}><div><span className="ct-kicker">{error?'A moment, please':'Your garden is waking'}</span><h2>{error?'Couldn’t open the garden':definitions?.levels.find(l=>l.id===level)?.name||'Carrot Defense'}</h2>{error?<><p role="alert">{error}</p><button className="ct-primary" onClick={()=>location.reload()}>Try again</button></>:<><progress value={loading} max={1} aria-label="Loading the garden"/><span>{Math.round(loading*100)}%</span></>}</div></div>}
   {ready&&state&&<>
    <header className="ct-hud">
     <div className="ct-hud__left"><button className="ct-icon ct-glass" aria-label="Choose a level" onClick={()=>openPanel('campaign')}><Icon name="levels"/></button><div className="ct-wallet ct-glass" aria-label={`${state.coins} coins`}><Icon name="coin"/><b>{state.coins}</b></div><div className={`ct-life ct-glass ${state.health<4?'is-low':''}`} aria-label={`Carrot health ${state.health} of 10`}><CarrotPortrait pose={state.health<4?4:0}/><b>{state.health}<small>/10</small></b></div></div>
     <div className="ct-level-progress ct-glass"><div><strong>{state.name}</strong><span>{state.wave} <small>/ {state.waves}</small></span></div><div className="ct-meter" role="progressbar" aria-label="Level progress" aria-valuemin={0} aria-valuemax={100} aria-valuenow={Math.round(state.progress*100)} style={meterStyle(state.progress)}><i/></div></div>
     <div className="ct-hud__right"><button className="ct-icon ct-glass" onClick={toggleSound} aria-label={save.sound?'Mute sound':'Enable sound'}><Icon name={save.sound?'sound':'mute'}/></button><button className="ct-icon ct-glass ct-fullscreen" aria-label={expanded?'Exit full screen':'Full screen'} onClick={()=>void fullscreen()}><Icon name="full"/></button><button className="ct-icon ct-glass" aria-label={state.paused?'Resume':'Pause'} onClick={()=>send({type:'pause'})}><Icon name={state.paused?'play':'pause'}/></button></div>
    </header>
    {state.boss&&state.boss.hp>0&&<div className={`ct-boss ct-glass ct-boss--${state.boss.kind}`} aria-label={`${state.boss.name}, ${Math.ceil(state.boss.hp)} health remaining`}><BossPortrait kind={state.boss.kind}/><div className="ct-boss__body"><div><strong>{state.boss.name}</strong><span>{Math.ceil(state.boss.hp).toLocaleString()} <small>/ {Math.ceil(state.boss.maxHp).toLocaleString()}</small></span></div><div className="ct-meter ct-meter--boss" role="progressbar" aria-label="Boss health" aria-valuemin={0} aria-valuemax={state.boss.maxHp} aria-valuenow={Math.ceil(state.boss.hp)} style={meterStyle(getHealth(state.boss.hp,state.boss.maxHp))}><i/>{(bossPhaseMarks[state.boss.kind]||[]).map(mark=><b key={mark} style={{left:pct(mark)}}/>)}</div>{state.boss.shield>0&&<div className="ct-meter ct-meter--shield" aria-label={`Shield ${Math.ceil(state.boss.shield)}`} style={meterStyle(getHealth(state.boss.shield,state.boss.maxShield))}><i/></div>}<small className="ct-boss__ability">{state.boss.ability?friendly(state.boss.ability):`Phase ${state.boss.phase||1}`}{state.boss.castRemaining>0&&` · ${state.boss.castRemaining.toFixed(1)}s`}</small></div></div>}
    <div className="ct-monster-bars" aria-hidden="true">{(state.monsters||[]).filter(m=>m.visible&&m.hp>0&&m.x>0&&m.x<1&&m.y>0&&m.y<1).map(m=><div key={m.id} className="ct-monster-bar" style={{left:pct(m.x),top:pct(m.y)}}><div className="ct-meter" style={meterStyle(getHealth(m.hp,m.maxHp))}><i/></div>{m.shield>0&&<div className="ct-meter ct-meter--shield" style={meterStyle(getHealth(m.shield,m.maxShield))}><i/></div>}</div>)}</div>
    {warning&&!result&&<div className={`ct-warning ct-warning--${warning.kind}`} role="status"><BossPortrait kind={warning.kind}/><div><span><Icon name="warning"/>Guardian approaching</span><strong>{warning.name}</strong></div></div>}
    {notice&&!warning&&<div className="ct-notice" role="status">{notice}</div>}
    {state.paused&&!panel&&!result&&<button className="ct-paused ct-glass" onClick={()=>send({type:'pause'})}><Icon name="play"/><span>Paused</span><small>Resume</small></button>}
    {choiceOpen&&selection&&<aside className={`ct-selection ct-glass ${selection.x>.52?'is-left':'is-right'}`} aria-label={selection.type==='pad'?'Choose a tower':'Selected defense'} key={`${selection.type}-${selection.id}`}>
     <header><span className="ct-kicker">{selection.type==='pad'?'Plant a defense':selection.type==='tower'?'Your defense':selection.type==='blocker'?'Clear the way':'Focus target'}</span><button className="ct-icon" aria-label="Close selection" onClick={()=>send({type:'clear'})}><Icon name="close"/></button></header>
     {selection.type==='pad'&&buyTower&&<><div className="ct-tower-grid">{definitions?.towers.map(t=><button key={t.id} className={`ct-tower-option ${picked===t.id?'is-picked':''} ${t.unlock>state.level?'is-locked':''}`} onClick={()=>{setPicked(t.id);send({type:'preview',kind:t.id})}} aria-label={`${t.name}, ${t.cost[0]} coins${t.unlock>state.level?`, unlocks at level ${t.unlock}`:''}`} aria-pressed={picked===t.id}><TowerPortrait kind={t.id}/><span>{t.unlock>state.level?<><Icon name="lock"/>{t.unlock}</>:<><Icon name="coin"/>{t.cost[0]}</>}</span></button>)}</div><div className="ct-purchase-info"><div><h3>{buyTower.name}</h3><p>{buyTower.role}</p></div><span className="ct-range"><Icon name="target"/>{buyTower.range[0].toFixed(1)}</span></div><button className="ct-primary ct-build" disabled={buyTower.unlock>state.level||buyTower.cost[0]>state.coins} onClick={()=>send({type:'buy',kind:picked})}>{buyTower.unlock>state.level?`Opens at level ${buyTower.unlock}`:buyTower.cost[0]>state.coins?`Need ${buyTower.cost[0]-state.coins} more`:'Build'}<span><Icon name="coin"/>{buyTower.cost[0]}</span></button></>}
     {selection.type==='tower'&&selectedTower&&<><div className="ct-tower-detail"><TowerPortrait kind={selectedTower.id} tier={tier}/><div><h3>{selectedTower.name}</h3><p>{selectedTower.role}</p><span className="ct-tier-label">Tier {roman[tier-1]}</span></div></div><div className="ct-tier-strip">{roman.map((r,i)=><div key={r} className={i+1===tier?'is-current':i+1<tier?'is-complete':''}><TowerPortrait kind={selectedTower.id} tier={i+1}/><span>{r}</span></div>)}</div><div className="ct-upgrade-stats"><span>Power <b>{selectedTower.damage[tier-1]}{tier<4&&<em> → {selectedTower.damage[tier]}</em>}</b></span><span>Reach <b>{selectedTower.range[tier-1].toFixed(1)}{tier<4&&<em> → {selectedTower.range[tier].toFixed(1)}</em>}</b></span></div><div className="ct-upgrade-actions"><button className="ct-sell" onClick={()=>send({type:'sell'})} aria-label={`Sell for ${selection.refund} coins`}><Icon name="sell"/><span>{selection.refund}</span></button><button className="ct-primary" disabled={tier===4||selectedTower.cost[tier]>state.coins} onClick={()=>send({type:'upgrade'})}>{tier===4?'Fully grown':selectedTower.cost[tier]>state.coins?`Need ${selectedTower.cost[tier]-state.coins} more`:'Upgrade'}{tier<4&&<span><Icon name="coin"/>{selectedTower.cost[tier]}</span>}</button></div></>}
     {(selection.type==='blocker'||selection.type==='enemy')&&<div className="ct-focus-detail"><Icon name={selection.type==='blocker'?'leaf':'target'}/><div><h3>{friendly(selection.kind)}</h3><div className="ct-meter" style={meterStyle(getHealth(selection.hp,selection.maxHp))}><i/></div><p>{Math.ceil(selection.hp)} / {Math.ceil(selection.maxHp)}</p></div><span>{selection.type==='blocker'?'Towers clearing':'Towers focused'}</span></div>}
    </aside>}
    <footer className="ct-bottom"><button className="ct-icon ct-glass" aria-label="How to play" onClick={()=>openPanel('help')}><Icon name="help"/></button>{state.phase==='ready'?<div className="ct-ready"><span className="ct-glass">Tap a clearing to build</span><button className="ct-primary" onClick={()=>send({type:'start'})}>Start wave<Icon name="play"/></button></div>:state.phase==='playing'?<div className="ct-wave-actions ct-glass"><span>{state.nextWave>0?`Next wave ${Math.ceil(state.nextWave)}s`:`${state.enemyCount} on the paths`}</span>{state.nextWave>0&&<button onClick={()=>send({type:'next'})} aria-label="Send next wave early">Send<Icon name="arrow"/></button>}<button onClick={()=>send({type:'speed',value:state.speed===2?1:2})} aria-label={`Game speed ${state.speed} times. Change speed.`}>{state.speed}×</button></div>:null}<button className="ct-icon ct-glass ct-retry" aria-label="Restart level" onClick={()=>openPanel('campaign')}><Icon name="levels"/></button></footer>
    {result&&<div className={`ct-outcome ct-outcome--${state.phase}`}><div className="ct-outcome__card ct-glass"><CarrotPortrait pose={state.phase==='won'?11:6}/><span className="ct-kicker">{state.name}</span><h2>{state.phase==='won'?'Safe & sound.':'One more try?'}</h2>{state.phase==='won'?<><Medals value={1|(state.health===10?2:0)|(state.blockersRemaining===0?4:0)}/><p>{state.level===12?'Every garden protected.':`${state.health}/10 carrot health`}</p></>:<p>Try another tower combination.</p>}<button className="ct-primary" onClick={()=>choose(state.phase==='won'?Math.min(12,state.level+1):state.level)}>{state.phase==='won'&&state.level<12?'Next landscape':'Play again'}<Icon name="arrow"/></button><button className="ct-text-button" onClick={()=>openPanel('campaign')}>Choose a level</button></div></div>}
   </>}
  </main>}
  {panel==='campaign'&&<Modal title="Your journey" onClose={closePanel} className="ct-campaign"><div className="ct-campaign-chapters">{chapters.map(ch=><section key={ch.id}><header><span>{ch.number}</span><h3>{ch.name}</h3></header><div>{definitions?.levels.filter(l=>l.biome===ch.id).map(l=><LevelCard key={l.id} level={l} save={save} choose={choose} preview={preview}/>)}</div></section>)}</div><a className="ct-back-link" href="/minigames/"><Icon name="back"/>All games</a></Modal>}
  {panel==='collection'&&<Modal title="A defense for every danger" onClose={closePanel} className="ct-collection"><div>{definitions?.towers.map(t=><article key={t.id}><TowerPortrait kind={t.id} tier={4}/><h3>{t.name}</h3><p>{t.role}</p><small>Four forms · {t.air?'Ground + air':'Ground'}</small></article>)}</div></Modal>}
  {panel==='help'&&<Modal title="Protect the carrot" onClose={closePanel} className="ct-help"><div className="ct-help-steps"><article><Icon name="leaf"/><h3>Plant</h3><p>Tap a clearing. Choose your tower, then build.</p></article><article><Icon name="upgrade"/><h3>Grow</h3><p>Upgrade three times. Clear scenery for coins and space.</p></article><article><Icon name="target"/><h3>Defend</h3><p>Cover every path. Tap a monster to focus your towers.</p></article></div><p className="ct-help-gestures">Pinch or scroll to zoom. Drag to explore.</p><p className="ct-help-shortcuts"><kbd>Space</kbd> Pause <kbd>U</kbd> Upgrade <kbd>Esc</kbd> Close</p><details><summary>Credits</summary><p>A fan-made carrot-defense game for Cornell CGS. Original maps and tower designs. Original modeled characters use animation foundations by Quaternius. Scanned materials and vegetation by Poly Haven; additional nature and sound effects by Kenney. Full music and asset credits are included with the game.</p><a href="/assets/minigames/carrot/credits.txt" target="_blank" rel="noreferrer">Asset credits ↗</a></details></Modal>}
 </div>
}
