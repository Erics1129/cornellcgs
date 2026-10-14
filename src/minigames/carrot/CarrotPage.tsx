import { useCallback, useEffect, useRef, useState } from 'react'
import type { ReactNode } from 'react'
import { CarrotUnity } from './unity'
import { menuSound, stopMenuSound } from './uiAudio'
import { LevelCount, awardCampaign, readCampaign, readSuper, recordSuper, saveCampaign, teachSuper } from './progress'
import { awardChallenge, bossOfLevel, challengeDifficulty, challengeTitles, challengeUnlocked, formatSeconds, lockCaption, par, readChallenges, stars } from './challenges'
import { AbilityGlyph, BossPortrait, CarrotPortrait, RouteDrawing, SuperEmblem, TowerPortrait, challengeArt, chapterArt, meterStyle } from './art'
import Icon from './Icon'
import type { CampaignSave, ChallengeBoss, ChallengeSave, Command, GameDefinitions, GameState, LevelDefinition } from './types'
import './carrot.css'

// Chapters are four levels each by id: the harvest road (13-24) revisits earlier lands, so grouping by biome would file those reprises under chapters whose boss is already beaten.
// The seventh section lists the arena challenges (ids above LevelCount), which are not part of the campaign save.
const chapters=[{index:1,name:'Sunlit Garden',number:'01'},{index:2,name:'Moonlit Marsh',number:'02'},{index:3,name:'Frostglass Highlands',number:'03'},{index:4,name:'Harvest Road',number:'04'},{index:5,name:'Ember Orchard',number:'05'},{index:6,name:'The Last Light',number:'06'},{index:7,name:'Challenges',number:'07'}]
const biomeNames:Record<string,string>={garden:'Sunlit Garden',marsh:'Moonlit Marsh',frost:'Frostglass Highlands',orchard:'Ember Orchard',arena:'The Arena'}
// Five cells: four bought tiers and the Super, which is forged by merging two Tier IV twins (never bought).
const roman=['I','II','III','IV','S']
const SuperTier=roman.length,TopTier=SuperTier-1
const bossPhaseMarks:Record<string,number[]>={garden:[.25,.6],marsh:[.25,.55],frost:[.3,.65],orchard:[.3,.6],tornado:[.25,.6],zombie:[.3,.6],eyeball:[.3,.65]}
const abilityNames:Record<string,string>={blind:'Blindness',uproot:'Uproot',whiteout:'Whiteout',dusk:'Dusk',tithe:'Tithe',gust:'Gust',liftoff:'Lift-off',raise:'Raise Dead',gaze:'Gaze'}
// Telegraphed abilities get a toast under the boss bar with the counterplay; the simulation names them in boss.ability while castRemaining counts down.
const telegraphHints:Record<string,string>={blind:'Towers outside lantern light lose reach. Prism and Sun Blossom keep the dark lit.',uproot:'A tower is being pulled up. Sell it before the roots close to keep most of its coins.',tithe:'The guardian claims a share of your coins.',whiteout:'A frost gust freezes every shot in the air for a moment.',dusk:'Full dark, and crows. Clear the crows to win.',gust:'Seed shots near the tornado hit for half.',liftoff:'The tornado lifts off: mortars cannot reach it.',raise:'Fallen creatures rise again beside the Zombie.',gaze:'Your strongest tower is stunned for five seconds.'}
const friendly=(s:string)=>abilityNames[s]||s?.replace(/([a-z])([A-Z])/g,'$1 $2').replace(/[_-]/g,' ')||''
const pct=(n:number)=>`${Math.round(Math.max(0,Math.min(1,n))*100)}%`
const clampLevel=(value:unknown,count:number)=>Math.max(1,Math.min(count,Number(value)||1))

function Modal({title,children,onClose,className=''}:{title:string;children:ReactNode;onClose:()=>void;className?:string}){
 const ref=useRef<HTMLDialogElement>(null)
 useEffect(()=>{const el=ref.current;el?.showModal();return()=>el?.close()},[])
 return <dialog ref={ref} className={`ct-dialog ${className}`} onCancel={e=>{e.preventDefault();onClose()}} onClick={e=>{if(e.target===e.currentTarget)onClose()}} aria-label={title}>
  <div className="ct-dialog__inner"><header><h2>{title}</h2><button className="ct-icon" onClick={onClose} aria-label={`Close ${title}`}><Icon name="close"/></button></header>{children}</div>
 </dialog>
}
function Medals({value=0,labels=['Completed.','Carrot unharmed.','Scenery cleared.']}:{value?:number;labels?:string[]}){return <span className="ct-medals" aria-label={[1,2,4].map((v,i)=>value&v?labels[i]:'').filter(Boolean).join(' ')}>{[1,2,4].map((v,i)=><i className={value&v?'is-earned':''} key={v}><Icon name={['check','heart','leaf'][i]}/></i>)}</span>}
function LevelCard({level,save,choose,preview=false,subtitle}:{level:LevelDefinition;save:CampaignSave;choose:(level:number)=>void;preview?:boolean;subtitle?:string}){
 const locked=level.id>save.unlocked&&!preview
 return <button className={`ct-level ${locked?'is-locked':''}`} disabled={locked} onClick={()=>choose(level.id)} aria-label={`${level.id}. ${level.name}${subtitle?`, ${subtitle}`:''}${locked?', locked':''}`}>
  <span className="ct-level__scene" style={{backgroundImage:`url(${chapterArt(level.biome)})`}}><RouteDrawing routes={level.routes}/><b>{String(level.id).padStart(2,'0')}</b>{locked?<span className="ct-level__lock"><Icon name="lock"/></span>:level.boss?<span className="ct-level__boss"><BossPortrait kind={level.boss}/></span>:null}</span>
  <span className="ct-level__caption"><strong>{level.name}{subtitle&&<small> · {subtitle}</small>}</strong><Medals value={save.medals[level.id]}/></span>
 </button>
}
const starLabels=(boss:ChallengeBoss)=>['Cleared.','Carrot unharmed.',`Under ${formatSeconds(par[boss])}.`]
function ChallengeCard({level,save,challenges,choose,preview=false}:{level:LevelDefinition;save:CampaignSave;challenges:ChallengeSave;choose:(level:number)=>void;preview?:boolean}){
 const boss=bossOfLevel(level.id)||(level.boss as ChallengeBoss)
 const difficulty=level.challenge||challengeDifficulty[boss]||'easy',unlocked=preview||challengeUnlocked(level.id,save,challenges),record=challenges.best[boss]
 const title=challengeTitles[boss]||`BossFight - ${level.bossName||level.name}`
 const best=record?`Best ${record.health} HP · ${formatSeconds(record.seconds)}`:unlocked?'Not yet cleared':lockCaption[boss]||'Locked'
 return <button className={`ct-challenge ct-challenge--${difficulty} ${unlocked?'':'is-locked'}`} disabled={!unlocked} onClick={()=>choose(level.id)} style={{backgroundImage:`url(${challengeArt(boss)}), url(${chapterArt('arena')})`}} aria-label={`${title}, ${difficulty}. ${best}${unlocked?'':', locked'}`}>
  <span className="ct-challenge__top"><span className={`ct-badge ct-badge--${difficulty}`}>{difficulty}</span>{!unlocked&&<span className="ct-challenge__lock"><Icon name="lock"/></span>}</span>
  <span className="ct-challenge__portrait"><BossPortrait kind={boss}/></span>
  <span className="ct-challenge__body"><strong>{title}</strong><span className="ct-challenge__meta">{level.bossName||level.name} · {level.waves} waves</span><Medals value={stars(record,boss)} labels={starLabels(boss)}/><small>{best}</small></span>
 </button>
}

export default function CarrotPage(){
 const root=useRef<HTMLDivElement>(null),mount=useRef<HTMLDivElement>(null),engine=useRef<CarrotUnity|null>(null)
 const [definitions,setDefinitions]=useState<GameDefinitions|null>(null),[save,setSave]=useState(readCampaign),[superSave,setSuperSave]=useState(readSuper),[challenges,setChallenges]=useState(readChallenges)
 const [entered,setEntered]=useState(false),[ready,setReady]=useState(false),[loading,setLoading]=useState(0),[error,setError]=useState('')
 const [state,setState]=useState<GameState|null>(null),[level,setLevel]=useState(1),[picked,setPicked]=useState('seed')
 const [panel,setPanel]=useState<'campaign'|'help'|'collection'|'challenges'|null>(null),[expanded,setExpanded]=useState(false),[warning,setWarning]=useState<{kind:string;name:string}|null>(null),[result,setResult]=useState(false)
 const current=useRef(state),saved=useRef(save),challengesRef=useRef(challenges),superRef=useRef(superSave),wasPlaying=useRef(false),lastBoss=useRef(''),award=useRef(''),noticeTimer=useRef<number>(),warningTimer=useRef<number>(),teachTimer=useRef<number>()
 const teachPending=useRef(0),lastUndo=useRef(0),forged=useRef({kind:'',name:''}),knownSupers=useRef(new Set<number>())
 const [notice,setNotice]=useState(''),[teach,setTeach]=useState(false)
 const preview=import.meta.env.DEV&&new URLSearchParams(location.search).has('carrot-preview')
 const levelCount=definitions?.levels.length||LevelCount
 const qaLevel=preview?clampLevel(new URLSearchParams(location.search).get('carrot-preview'),levelCount):1
 current.current=state;saved.current=save;challengesRef.current=challenges;superRef.current=superSave
 const send=useCallback((command:Command)=>engine.current?.send(command),[])
 // Development preview only (tree-shaken from production): a QA harness can drive the level, read the live state, or inject a snapshot to review the HUD without the engine.
 useEffect(()=>{if(!preview)return;const w=window as unknown as {__carrot?:{send:(c:Command)=>void;state:()=>GameState|null;inject:(s:GameState|null)=>void;ready:()=>void}};w.__carrot={send:c=>engine.current?.send(c),state:()=>current.current,inject:s=>setState(s),ready:()=>{setError('');setReady(true)}};return()=>{delete w.__carrot}},[preview])
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
  if(state.phase==='won'&&award.current!==key){award.current=key;const boss=bossOfLevel(state.level)
   // Challenge records keep the fight's own clock (state.elapsed); a snapshot without it records nothing rather than a free par star. Campaign awards are skipped in the QA preview.
   if(boss)setChallenges(previous=>awardChallenge(previous,boss,state.health,typeof state.elapsed==='number'?state.elapsed:NaN,state.towerCount??0))
   else if(!preview)setSave(previous=>awardCampaign(previous,state.level,state.health,state.blockersRemaining===0))}
  return()=>clearTimeout(timer)
 },[state?.phase,state?.level])
 useEffect(()=>{if(state?.selection?.type==='pad'){setPicked('seed');send({type:'preview',kind:'seed'})}},[state?.selection?.type,state?.selection?.id,send])
 // A merge shows up as mergeUndo jumping to its 4 s window, or as a Super the page has not seen yet becoming the selection (a second merge
 // while the first window has not advanced, e.g. in the ready phase): remember the forged name for the undo notice and count the Super.
 useEffect(()=>{const undo=state?.mergeUndo||0,selection=state?.selection,superSelected=selection?.type==='tower'&&selection.tier>=SuperTier?selection:null
  const newSuper=!!superSelected&&!knownSupers.current.has(superSelected.id);if(superSelected)knownSupers.current.add(superSelected.id)
  if(undo>0&&(lastUndo.current<=0||undo>lastUndo.current+.3||newSuper)){const kind=selection?.type==='tower'?selection.kind:'';const tower=definitions?.towers.find(t=>t.id===kind);forged.current={kind,name:selection?.superName||tower?.superName||'Super tower'};if(kind)setSuperSave(previous=>recordSuper(previous,kind))}lastUndo.current=undo},[state?.mergeUndo,state?.selection?.id,state?.selection?.tier])
 useEffect(()=>{const selection=state?.selection;if(selection?.type==='tower'&&selection.tier>=SuperTier&&!superRef.current.kinds[selection.kind])setSuperSave(previous=>previous.kinds[selection.kind]?previous:recordSuper(previous,selection.kind))},[state?.selection?.id,state?.selection?.tier])
 // The merge lesson fires once per device, on the first fully grown tower, and waits for the ready phase or a breather (8 s at most) so it never lands mid-wave.
 useEffect(()=>{if(!state||teach||superRef.current.taught)return
  const selection=state.selection,reached=(selection?.type==='tower'&&selection.tier>=TopTier)||(state.superPairs||0)>0
  if(!teachPending.current&&reached)teachPending.current=performance.now()+8000
  if(teachPending.current&&(state.phase==='ready'||state.nextWave>0||state.enemyCount===0||performance.now()>teachPending.current)){teachPending.current=0;setTeach(true);setSuperSave(previous=>teachSuper(previous));clearTimeout(teachTimer.current);teachTimer.current=window.setTimeout(()=>setTeach(false),9000)}
 },[state,teach])
 useEffect(()=>{const visibility=()=>{if(document.hidden&&current.current&&!current.current.paused&&current.current.phase==='playing')send({type:'pause'})};document.addEventListener('visibilitychange',visibility);return()=>document.removeEventListener('visibilitychange',visibility)},[send])
 useEffect(()=>{const key=(e:KeyboardEvent)=>{if(e.repeat||e.metaKey||e.ctrlKey||e.altKey||panel||!entered||!ready||e.target instanceof HTMLInputElement||e.target instanceof HTMLTextAreaElement)return;
  const selection=current.current?.selection
  if(e.key==='Escape'){send({type:'clear'});return}if(e.code==='Space'&&!(e.target instanceof HTMLButtonElement)){e.preventDefault();send({type:current.current?.phase==='ready'?'start':'pause'})}
  if(e.key.toLowerCase()==='u'&&selection?.type==='tower'&&selection.tier<TopTier)send({type:'upgrade'})
  if(e.key.toLowerCase()==='m'&&selection?.type==='tower'&&selection.tier===TopTier&&(selection.partners||0)>0)send({type:'mergeArm',id:selection.id})};window.addEventListener('keydown',key);return()=>window.removeEventListener('keydown',key)},[entered,ready,panel,send])
 useEffect(()=>{const f=()=>setExpanded(!!document.fullscreenElement);document.addEventListener('fullscreenchange',f);return()=>document.removeEventListener('fullscreenchange',f)},[])
 useEffect(()=>()=>{clearTimeout(noticeTimer.current);clearTimeout(warningTimer.current);clearTimeout(teachTimer.current);stopMenuSound()},[])
 const isOpen=(id:number)=>preview||(id>LevelCount?challengeUnlocked(id,saved.current,challengesRef.current):id<=saved.current.unlocked)
 const choose=(id:number)=>{if(!isOpen(id))return;setPanel(null);setLevel(id);setResult(false);setWarning(null);lastBoss.current='';award.current='';lastUndo.current=0;knownSupers.current.clear();if(entered){send({type:'load',level:id})}else setEntered(true)}
 const openPanel=(value:typeof panel)=>{wasPlaying.current=!!current.current&&!current.current.paused&&current.current.phase==='playing';if(wasPlaying.current)send({type:'pause'});setPanel(value)}
 const closePanel=()=>{setPanel(null);if(wasPlaying.current&&current.current?.paused)send({type:'pause'});wasPlaying.current=false}
 const toggleSound=()=>{const next={...save,sound:!save.sound};setSave(next);saveCampaign(next);send({type:'mute',value:next.sound?0:1})}
 const fullscreen=async()=>{try{if(document.fullscreenElement)await document.exitFullscreen();else if(root.current?.requestFullscreen)await root.current.requestFullscreen();else setExpanded(v=>!v)}catch{setExpanded(v=>!v)}}
 const selection=state?.selection,selectedTower=selection?.type==='tower'?definitions?.towers.find(t=>t.id===selection.kind):undefined
 const buyTower=definitions?.towers.find(t=>t.id===picked),tier=Math.max(1,Math.min(SuperTier,selection?.tier||1)),isSuper=tier>=SuperTier,partners=selection?.partners||0
 const canGrow=!!selectedTower&&tier<SuperTier&&selectedTower.damage.length>tier&&selectedTower.range.length>tier
 const choiceOpen=!!state&&!!selection&&['pad','tower','blocker','enemy'].includes(selection.type)&&!result&&!panel
 const getHealth=(hp:number,max:number)=>max>0?hp/max:0
 const currentLevel=definitions?.levels.find(l=>l.id===level),challengeLevels=definitions?.levels.filter(l=>l.challenge)||[],challengeBoss=state?bossOfLevel(state.level):null
 const blind=(state?.blind||0)>0,undoOpen=(state?.mergeUndo||0)>0
 const telegraph=state?.boss&&state.boss.hp>0&&state.boss.castRemaining>0&&telegraphHints[state.boss.ability]?state.boss:null
 const uprootTarget=telegraph?.ability==='uproot'&&typeof telegraph.abilityTarget==='number'&&telegraph.abilityTarget>=0?telegraph.abilityTarget:null
 const won=state?.phase==='won'
 return <div className={`ct-page ${expanded?'is-expanded':''} ${blind?'is-blind':''} ${blind&&(state?.blindTint||0)>=.5?'is-blind-white':''}`} ref={root} onClickCapture={e=>{
  const button=(e.target as Element).closest('button:not(:disabled),a');if(!saved.current.sound||!button)return
  const label=button.getAttribute('aria-label')||button.textContent||''
  const kind=/^Close/.test(label)?'close':/Choose|Meet|How to|Boss challenges/.test(label)?'open':'click'
  if(ready)engine.current?.uiSound(kind);else menuSound(kind)
 }}>
  {!entered?<main className="ct-lobby" style={{backgroundImage:`url(${chapterArt('garden')})`}}>
   <nav className="ct-lobby-nav"><a href="/minigames/"><Icon name="back"/>All games</a><span>CORNELL CGS</span><button onClick={()=>openPanel('help')} className="ct-icon" aria-label="How to play"><Icon name="help"/></button></nav>
   <div className="ct-lobby-copy"><p className="ct-kicker">A little garden. A grand defense.</p><h1>Carrot<br/>Defense <em>3D</em></h1><p className="ct-chinese">保卫萝卜 · 3D</p><div className="ct-lobby-actions"><button className="ct-primary" disabled={!definitions} onClick={()=>choose(preview?qaLevel:save.unlocked)}>{save.unlocked>1?'Continue':'Enter the garden'}<Icon name="arrow"/></button><button className="ct-secondary" disabled={!definitions} onClick={()=>openPanel('campaign')}>Choose a level</button><button className="ct-secondary ct-secondary--challenge" disabled={!definitions} onClick={()=>openPanel('challenges')}><Icon name="swords"/>Boss challenges</button></div>{error&&<p role="alert" className="ct-error">{error} <button onClick={()=>location.reload()}>Retry</button></p>}<p className="ct-lobby-meta">{LevelCount} landscapes <i/> 10 towers <i/> 4 guardians <i/> 3 challenges</p></div>
   <footer className="ct-lobby-foot"><span>Original maps & artwork · Fan project</span><button onClick={()=>openPanel('collection')}>Meet your defenses<Icon name="arrow"/></button></footer>
  </main>:<main className="ct-game" aria-label="Carrot Defense battlefield">
   <div className="ct-scene" ref={mount}/>
   {(!ready||error)&&<div className="ct-loading" style={{backgroundImage:`url(${chapterArt(currentLevel?.biome||'garden')})`}}><div><span className="ct-kicker">{error?'A moment, please':currentLevel?.challenge?'The arena is waking':'Your garden is waking'}</span><h2>{error?'Couldn’t open the garden':currentLevel?.name||'Carrot Defense'}</h2>{error?<><p role="alert">{error}</p><button className="ct-primary" onClick={()=>location.reload()}>Try again</button></>:<><progress value={loading} max={1} aria-label="Loading the garden"/><span>{Math.round(loading*100)}%</span></>}</div></div>}
   {ready&&state&&<>
    <header className="ct-hud">
     <div className="ct-hud__left"><button className="ct-icon ct-glass" aria-label="Choose a level" onClick={()=>openPanel('campaign')}><Icon name="levels"/></button><div className="ct-wallet ct-glass" aria-label={`${state.coins} coins`}><Icon name="coin"/><b>{state.coins}</b></div><div className={`ct-life ct-glass ${state.health<4?'is-low':''}`} aria-label={`Carrot health ${state.health} of 10`}><CarrotPortrait pose={state.health<4?4:0}/><b>{state.health}<small>/10</small></b></div></div>
     <div className="ct-level-progress ct-glass"><div><strong>{state.name}</strong><span>{state.wave} <small>/ {state.waves}</small></span></div><div className="ct-meter" role="progressbar" aria-label="Level progress" aria-valuemin={0} aria-valuemax={100} aria-valuenow={Math.round(state.progress*100)} style={meterStyle(state.progress)}><i/></div></div>
     <div className="ct-hud__right"><button className="ct-icon ct-glass" onClick={toggleSound} aria-label={save.sound?'Mute sound':'Enable sound'}><Icon name={save.sound?'sound':'mute'}/></button><button className="ct-icon ct-glass ct-fullscreen" aria-label={expanded?'Exit full screen':'Full screen'} onClick={()=>void fullscreen()}><Icon name="full"/></button><button className="ct-icon ct-glass" aria-label={state.paused?'Resume':'Pause'} onClick={()=>send({type:'pause'})}><Icon name={state.paused?'play':'pause'}/></button></div>
    </header>
    {state.boss&&state.boss.hp>0&&<div className={`ct-boss ct-glass ct-boss--${state.boss.kind}`} aria-label={`${state.boss.name}, ${Math.ceil(state.boss.hp)} health remaining`}><BossPortrait kind={state.boss.kind}/><div className="ct-boss__body"><div><strong>{state.boss.name}</strong><span>{Math.ceil(state.boss.hp).toLocaleString()} <small>/ {Math.ceil(state.boss.maxHp).toLocaleString()}</small></span></div><div className="ct-meter ct-meter--boss" role="progressbar" aria-label="Boss health" aria-valuemin={0} aria-valuemax={state.boss.maxHp} aria-valuenow={Math.ceil(state.boss.hp)} style={meterStyle(getHealth(state.boss.hp,state.boss.maxHp))}><i/>{(bossPhaseMarks[state.boss.kind]||[]).map(mark=><b key={mark} style={{left:pct(mark)}}/>)}</div>{state.boss.shield>0&&<div className="ct-meter ct-meter--shield" aria-label={`Shield ${Math.ceil(state.boss.shield)}`} style={meterStyle(getHealth(state.boss.shield,state.boss.maxShield))}><i/></div>}<small className="ct-boss__ability">{state.boss.ability?friendly(state.boss.ability):`Phase ${state.boss.phase||1}`}{state.boss.castRemaining>0&&` · ${state.boss.castRemaining.toFixed(1)}s`}</small></div></div>}
    {telegraph&&!result&&<div className={`ct-telegraph ct-glass ct-telegraph--${telegraph.ability}`} role="status"><AbilityGlyph ability={telegraph.ability}/><div><strong>{friendly(telegraph.ability)} <small>{telegraph.castRemaining.toFixed(1)}s</small></strong><span>{telegraphHints[telegraph.ability]}</span></div>{uprootTarget!==null&&<button className="ct-primary ct-telegraph__sell" onClick={()=>{send({type:'select',id:uprootTarget});send({type:'sell'})}} aria-label="Sell the targeted tower">Sell<Icon name="sell"/></button>}</div>}
    <div className="ct-monster-bars" aria-hidden="true">{(state.monsters||[]).filter(m=>m.visible&&m.hp>0&&m.x>0&&m.x<1&&m.y>0&&m.y<1).map(m=><div key={m.id} className="ct-monster-bar" style={{left:pct(m.x),top:pct(m.y)}}><div className="ct-meter" style={meterStyle(getHealth(m.hp,m.maxHp))}><i/></div>{m.shield>0&&<div className="ct-meter ct-meter--shield" style={meterStyle(getHealth(m.shield,m.maxShield))}><i/></div>}</div>)}</div>
    {warning&&!result&&<div className={`ct-warning ct-warning--${warning.kind}`} role="status"><BossPortrait kind={warning.kind}/><div><span><Icon name="warning"/>Guardian approaching</span><strong>{warning.name}</strong></div></div>}
    {undoOpen&&!result?<div className="ct-forge ct-glass" role="status"><SuperEmblem kind={forged.current.kind||selection?.kind||'seed'}/><span>{forged.current.name||'Super tower'} forged</span><button onClick={()=>send({type:'mergeUndo'})}><Icon name="undo"/>Undo <small>{Math.ceil(state.mergeUndo||0)}s</small></button></div>
    :notice&&!warning&&<div className="ct-notice" role="status">{notice}</div>}
    {teach&&!result&&<div className="ct-teach ct-glass" role="status"><Icon name="merge"/><p>Two fully grown towers of the same kind can merge into one Super tower. Drag one onto the other.</p><button className="ct-icon" aria-label="Dismiss merge tip" onClick={()=>setTeach(false)}><Icon name="close"/></button></div>}
    {state.paused&&!panel&&!result&&<button className="ct-paused ct-glass" onClick={()=>send({type:'pause'})}><Icon name="play"/><span>Paused</span><small>Resume</small></button>}
    {choiceOpen&&selection&&<aside className={`ct-selection ct-glass ${selection.x>.52?'is-left':'is-right'}`} aria-label={selection.type==='pad'?'Choose a tower':'Selected defense'} key={`${selection.type}-${selection.id}`}>
     <header><span className="ct-kicker">{selection.type==='pad'?'Plant a defense':selection.type==='tower'?isSuper?'Super defense':'Your defense':selection.type==='blocker'?'Clear the way':'Focus target'}</span><button className="ct-icon" aria-label="Close selection" onClick={()=>send({type:'clear'})}><Icon name="close"/></button></header>
     {selection.type==='pad'&&buyTower&&<><div className="ct-tower-grid">{definitions?.towers.map(t=><button key={t.id} className={`ct-tower-option ${picked===t.id?'is-picked':''} ${t.unlock>state.level?'is-locked':''}`} onClick={()=>{setPicked(t.id);send({type:'preview',kind:t.id})}} aria-label={`${t.name}, ${t.cost[0]} coins${t.unlock>state.level?`, unlocks at level ${t.unlock}`:''}`} aria-pressed={picked===t.id}><TowerPortrait kind={t.id}/><span>{t.unlock>state.level?<><Icon name="lock"/>{t.unlock}</>:<><Icon name="coin"/>{t.cost[0]}</>}</span></button>)}</div><div className="ct-purchase-info"><div><h3>{buyTower.name}</h3><p>{buyTower.role}</p></div><span className="ct-range"><Icon name="target"/>{buyTower.range[0].toFixed(1)}</span></div><button className="ct-primary ct-build" disabled={buyTower.unlock>state.level||buyTower.cost[0]>state.coins} onClick={()=>send({type:'buy',kind:picked})}>{buyTower.unlock>state.level?`Opens at level ${buyTower.unlock}`:buyTower.cost[0]>state.coins?`Need ${buyTower.cost[0]-state.coins} more`:'Build'}<span><Icon name="coin"/>{buyTower.cost[0]}</span></button></>}
     {selection.type==='tower'&&selectedTower&&<><div className="ct-tower-detail"><TowerPortrait kind={selectedTower.id} tier={tier}/><div><h3>{isSuper?selection.superName||selectedTower.superName||selectedTower.name:selectedTower.name}</h3><p>{isSuper?selectedTower.superTrait||selectedTower.role:selectedTower.role}</p><span className="ct-tier-label">{isSuper?`Super · ${selectedTower.name}`:`Tier ${roman[tier-1]}`}</span></div></div>
      <div className="ct-tier-strip">{roman.map((r,i)=>{const t=i+1,superCell=t===SuperTier,locked=superCell&&!isSuper&&partners===0;return <div key={r} className={`${t===tier?'is-current':t<tier?'is-complete':''} ${superCell?'is-super':''} ${locked?'is-locked':''}`}>{superCell?<span className="ct-tier-strip__super"><SuperEmblem kind={selectedTower.id}/>{locked&&<i><Icon name="lock"/></i>}</span>:<TowerPortrait kind={selectedTower.id} tier={t}/>}<span>{r}</span></div>})}</div>
      <div className="ct-upgrade-stats"><span>Power <b>{selectedTower.damage[tier-1]}{canGrow&&<em> → {selectedTower.damage[tier]}</em>}</b></span><span>Reach <b>{selectedTower.range[tier-1].toFixed(1)}{canGrow&&<em> → {selectedTower.range[tier].toFixed(1)}</em>}</b></span></div>
      {tier===TopTier-1&&<p className="ct-helper">Next: fully grown. Twins can merge.</p>}
      {tier===TopTier&&partners>0&&<p className="ct-helper">Drag onto another Tier {roman[TopTier-1]} {selectedTower.name}, or tap Merge then a partner.</p>}
      <div className="ct-upgrade-actions"><button className="ct-sell" onClick={()=>send({type:'sell'})} aria-label={`Sell for ${selection.refund} coins`}><Icon name="sell"/><span>{selection.refund}</span></button>
       {isSuper?<span className="ct-super-note"><SuperEmblem kind={selectedTower.id}/>{selection.superName||selectedTower.superName||'Super'}</span>
       :tier===TopTier?partners>0?<button className="ct-primary ct-merge" onClick={()=>send({type:'mergeArm',id:selection.id})}>Merge<Icon name="merge"/></button>:<button className="ct-primary" disabled>Grow a twin to merge</button>
       :<button className="ct-primary" disabled={selectedTower.cost[tier]>state.coins} onClick={()=>send({type:'upgrade'})}>{selectedTower.cost[tier]>state.coins?`Need ${selectedTower.cost[tier]-state.coins} more`:'Upgrade'}<span><Icon name="coin"/>{selectedTower.cost[tier]}</span></button>}</div></>}
     {(selection.type==='blocker'||selection.type==='enemy')&&<div className="ct-focus-detail"><Icon name={selection.type==='blocker'?'leaf':'target'}/><div><h3>{friendly(selection.kind)}</h3><div className="ct-meter" style={meterStyle(getHealth(selection.hp,selection.maxHp))}><i/></div><p>{Math.ceil(selection.hp)} / {Math.ceil(selection.maxHp)}</p></div><span>{selection.type==='blocker'?'Towers clearing':'Towers focused'}</span></div>}
    </aside>}
    <footer className="ct-bottom"><button className="ct-icon ct-glass" aria-label="How to play" onClick={()=>openPanel('help')}><Icon name="help"/></button>{state.phase==='ready'?<div className="ct-ready"><span className="ct-glass">Tap a clearing to build</span><button className="ct-primary" onClick={()=>send({type:'start'})}>Start wave<Icon name="play"/></button></div>:state.phase==='playing'?<div className="ct-wave-actions ct-glass"><span>{state.nextWave>0?`Next wave ${Math.ceil(state.nextWave)}s`:`${state.enemyCount} on the paths`}</span>{state.nextWave>0&&<button onClick={()=>send({type:'next'})} aria-label="Send next wave early">Send<Icon name="arrow"/></button>}<button onClick={()=>send({type:'speed',value:state.speed===2?1:2})} aria-label={`Game speed ${state.speed} times. Change speed.`}>{state.speed}×</button></div>:null}<button className="ct-icon ct-glass ct-retry" aria-label={challengeBoss?'Boss challenges':'Restart level'} onClick={()=>openPanel(challengeBoss?'challenges':'campaign')}><Icon name={challengeBoss?'swords':'levels'}/></button></footer>
    {result&&<div className={`ct-outcome ct-outcome--${state.phase}`}><div className="ct-outcome__card ct-glass">{challengeBoss?<span className={`ct-outcome__boss ${won?'is-beaten':''}`}><BossPortrait kind={challengeBoss}/></span>:<CarrotPortrait pose={won?11:6}/>}<span className="ct-kicker">{state.name}</span><h2>{challengeBoss?won?'Guardian defeated':'The guardian wins':won?'Safe & sound.':'One more try?'}</h2>
     {won?challengeBoss?<><Medals value={stars({cleared:true,health:state.health,seconds:typeof state.elapsed==='number'?state.elapsed:Infinity,towers:0},challengeBoss)} labels={starLabels(challengeBoss)}/><p>{state.health}/10 carrot health{typeof state.elapsed==='number'&&` · ${formatSeconds(state.elapsed)}`}</p></>:<><Medals value={1|(state.health===10?2:0)|(state.blockersRemaining===0?4:0)}/><p>{state.level===LevelCount?'Every garden protected, to the last light.':`${state.health}/10 carrot health`}</p></>:<p>{challengeBoss?'Sell before the roots close, light the dark, cover both gates.':'Try another tower combination.'}</p>}
     {challengeBoss?<><button className="ct-primary" onClick={()=>openPanel('challenges')}>Back to challenges<Icon name="arrow"/></button><button className="ct-text-button" onClick={()=>choose(state.level)}>Play again</button></>
     :<><button className="ct-primary" onClick={()=>choose(won?Math.min(LevelCount,state.level+1):state.level)}>{won&&state.level<LevelCount?'Next landscape':'Play again'}<Icon name="arrow"/></button><button className="ct-text-button" onClick={()=>openPanel('campaign')}>Choose a level</button></>}</div></div>}
   </>}
  </main>}
  {panel==='campaign'&&<Modal title="Your journey" onClose={closePanel} className="ct-campaign"><div className="ct-campaign-chapters">{chapters.map(ch=>{if(ch.index===7)return challengeLevels.length?<section key={ch.index} className="ct-campaign-challenges"><header><span>{ch.number}</span><h3>{ch.name}</h3><small>The Arena</small></header><div>{challengeLevels.map(l=><ChallengeCard key={l.id} level={l} save={save} challenges={challenges} choose={choose} preview={preview}/>)}</div></section>:null
   const levels=definitions?.levels.filter(l=>l.id<=LevelCount&&Math.ceil(l.id/4)===ch.index)||[];if(!levels.length)return null;const mixed=levels.some(l=>biomeNames[l.biome]!==ch.name);return <section key={ch.index}><header><span>{ch.number}</span><h3>{ch.name}</h3>{mixed&&<small>Levels {levels[0].id}–{levels[levels.length-1].id}</small>}</header><div>{levels.map(l=><LevelCard key={l.id} level={l} save={save} choose={choose} preview={preview} subtitle={mixed&&biomeNames[l.biome]!==ch.name?biomeNames[l.biome]:undefined}/>)}</div></section>})}</div><a className="ct-back-link" href="/minigames/"><Icon name="back"/>All games</a></Modal>}
  {panel==='challenges'&&<Modal title="Boss challenges" onClose={closePanel} className="ct-challenges"><p className="ct-challenges__lead">One arena, three guardians. Each guardian arrives mid-fight and the remaining waves follow it in. Every tower is open.</p>{challengeLevels.length?<div className="ct-challenge-grid">{challengeLevels.map(l=><ChallengeCard key={l.id} level={l} save={save} challenges={challenges} choose={choose} preview={preview}/>)}</div>:<p className="ct-challenges__empty">The arena is still being built. Check back after the next update.</p>}<a className="ct-back-link" href="/minigames/"><Icon name="back"/>All games</a></Modal>}
  {panel==='collection'&&<Modal title="A defense for every danger" onClose={closePanel} className="ct-collection"><div>{definitions?.towers.map(t=>{const forgedKind=!!superSave.kinds[t.id];return <article key={t.id} className={forgedKind?'is-super':''}><TowerPortrait kind={t.id} tier={forgedKind?SuperTier:TopTier}/><h3>{forgedKind&&t.superName?<>{t.superName}<small>{t.name}</small></>:t.name}</h3><p>{forgedKind&&t.superTrait?t.superTrait:t.role}</p><small>Four forms{forgedKind?' · Super':''} · {t.air?'Ground + air':'Ground'}</small></article>})}</div></Modal>}
  {panel==='help'&&<Modal title="Protect the carrot" onClose={closePanel} className="ct-help"><div className="ct-help-steps"><article><Icon name="leaf"/><h3>Plant</h3><p>Tap a clearing. Choose your tower, then build.</p></article><article><Icon name="upgrade"/><h3>Grow</h3><p>Upgrade three times. Clear scenery for coins and space.</p></article><article><Icon name="target"/><h3>Defend</h3><p>Cover every path. Tap a monster to focus your towers.</p></article><article><Icon name="merge"/><h3>Merge</h3><p>Drag a Tier IV onto its twin: two fully grown towers of one kind forge a Super tower on the pad you keep.</p></article></div><p className="ct-help-gestures">Pinch or scroll to zoom. Drag to explore. Hold a fully grown tower, then drag it onto its twin to merge.</p><p className="ct-help-shortcuts"><kbd>Space</kbd> Pause <kbd>U</kbd> Upgrade <kbd>M</kbd> Merge <kbd>Esc</kbd> Close</p><details><summary>Credits</summary><p>A fan-made carrot-defense game for Cornell CGS. Original maps and tower designs. Original modeled characters use animation foundations by Quaternius. Scanned materials and vegetation by Poly Haven; additional nature and sound effects by Kenney. Full music and asset credits are included with the game.</p><a href="/assets/minigames/carrot/credits.txt" target="_blank" rel="noreferrer">Asset credits ↗</a></details></Modal>}
 </div>
}
