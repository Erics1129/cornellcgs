import { Suspense, lazy, useCallback, useEffect, useMemo, useRef, useState } from 'react'
import type { CSSProperties } from 'react'
import { CarrotUnity } from './unity'
import build from './unity-build.json'
import { CarrotReview } from './CarrotReview'
import { menuSound, stopMenuSound } from './uiAudio'
import { LevelCount, RECORD, RECORDS, awardCampaign, awardRecord, finishTutorial, gradeRun, markSeen, readCampaign, readRecords, readSuper, recordSuper, saveCampaign, teachSuper } from './progress'
import { progress } from '../../lib/account/index.ts'
import { awardChallenge, bossOfLevel, challengeUnlocked, par as challengePar, readChallenges } from './challenges'
import type { Command, GameDefinitions, GameState } from './types'
import { createSnapshotStore, useSlice } from './hooks/useSnapshot'
import { createRunTracker } from './hooks/runTracker'
import { readPrefs, subscribePrefs, writePrefs } from './prefs'
import type { Prefs } from './prefs'
import { readVolumes, subscribeVolumes, writeVolumes } from './volume'
import type { Volumes } from './volume'
import { levelKinds } from './waves'
import { Lobby } from './ui/Lobby'
import { LevelSelect } from './ui/LevelSelect'
import { Loading } from './ui/Loading'
import { WaveTrack } from './ui/WaveTrack'
import { BottomBar, Controls, Judgement, PausedCard, StatusPanel, Vignette, useBeatGlow } from './ui/Hud'
import { BossBar, MiniBars, MonsterBars, Reinforcements } from './ui/BossBar'
import { BuildMenu } from './ui/BuildMenu'
import { hudEdges } from './ui/BuildMenu'
import type { PanelMode } from './ui/BuildMenu'
import { Results } from './ui/Results'
import { CreditsModal, FieldGuide, HelpModal, SettingsModal } from './ui/Modals'
import { ConfirmModal } from './ui/Dialog'
import { useGlassTier, usePointerLight } from './ui/Glass'
import { errors } from './copy'
import { AirToast, BossWarning, Coach, EncounterCard, ForgeToast, MergeTip, NoticeToast, PrismBriefing, useEncounters, useTutorialStep } from './ui/Onboarding'
import './ui/glass.css'
import './ui/entry.css'
import './ui/hud.css'
import './ui/menus.css'

const SuperTier=5,TopTier=4
const clampLevel=(value:unknown,count:number)=>Math.max(1,Math.min(count,Number(value)||1))
type Panel='select'|'challenges'|'guide'|'help'|'settings'|'credits'|'restart'|null
const lossCounts=new Map<number,number>()

/** The local review panel follows every publish (development preview only; the page itself re-renders only on slice changes). */
function LiveReview({store,...rest}:{store:ReturnType<typeof createSnapshotStore>}&Omit<Parameters<typeof CarrotReview>[0],'state'>){
 const state=useSlice(store,s=>s,(a,b)=>a===b)
 return state?<CarrotReview state={state} {...rest}/>:null
}

// Development only (tree-shaken from production): ?carrot-glass-lab renders every glass primitive over chosen backdrops for QA.
const GlassLab=import.meta.env.DEV?lazy(()=>import('./ui/GlassLab')):null
export default function CarrotRoute(){
 if(GlassLab&&new URLSearchParams(location.search).has('carrot-glass-lab'))return <Suspense fallback={null}><GlassLab/></Suspense>
 return <CarrotPage/>
}

function CarrotPage(){
 const root=useRef<HTMLDivElement>(null),mount=useRef<HTMLDivElement>(null),engine=useRef<CarrotUnity|null>(null),hud=useRef<HTMLDivElement>(null),trackBox=useRef<HTMLDivElement>(null)
 const store=useMemo(()=>createSnapshotStore(),[]),tracker=useMemo(()=>createRunTracker(store),[store])
 useEffect(()=>tracker.attach(),[tracker])
 const [definitions,setDefinitions]=useState<GameDefinitions|null>(null)
 const [save,setSave]=useState(readCampaign),[superSave,setSuperSave]=useState(readSuper),[challenges,setChallenges]=useState(readChallenges),[records,setRecords]=useState(readRecords)
 const [prefs,setPrefs]=useState<Prefs>(readPrefs),[volumes,setVolumes]=useState<Volumes>(readVolumes)
 const [entered,setEntered]=useState(false),[ready,setReady]=useState(false),[loading,setLoading]=useState(0),[bytes,setBytes]=useState<{done:number;total:number}|null>(null),[error,setError]=useState('')
 const [level,setLevel]=useState(1),[veteran,setVeteran]=useState(false)
 const [panel,setPanel]=useState<Panel>(null),[expanded,setExpanded]=useState(false),[result,setResult]=useState(false),[teach,setTeach]=useState(false)
 const [osReduced,setOsReduced]=useState(()=>matchMedia('(prefers-reduced-motion: reduce)').matches)
 const [forged,setForged]=useState({kind:'',name:''}),[forgeBeat,setForgeBeat]=useState(false),forgeTimer=useRef(0),[resultInfo,setResultInfo]=useState({grade:0,previous:0,losses:0})
 const saved=useRef(save),challengesRef=useRef(challenges),superRef=useRef(superSave),recordsRef=useRef(records),definitionsRef=useRef(definitions),wasPlaying=useRef(false),award=useRef(''),teachPending=useRef(0),teachTimer=useRef(0),lastUndo=useRef(0),knownSupers=useRef(new Set<number>()),superTargets=useRef(new Set<number>())
 saved.current=save;challengesRef.current=challenges;superRef.current=superSave;recordsRef.current=records;definitionsRef.current=definitions
 const reduced=osReduced||prefs.reducedEffects
 const preview=import.meta.env.DEV&&['carrot-preview','carrot-qa'].some(key=>new URLSearchParams(location.search).has(key))
 const levelCount=definitions?.levels.length||LevelCount
 const qaLevel=preview?clampLevel(new URLSearchParams(location.search).get('carrot-preview'),levelCount):1
 const send=useCallback((command:Command)=>engine.current?.send(command),[])
 const page=useSlice(store,st=>st?{level:st.level,biome:st.biome,phase:st.phase,v:st.v||1,blind:(st.blind||0)>0,blackout:(st.blind||0)>0&&(st.blindAlpha||0)>=.995&&(st.blindTint||0)<.5,white:(st.blind||0)>0&&(st.blindTint||0)>=.5,boss:!!st.boss&&st.boss.hp>0,caps:(st.caps||[]).join(','),veteranCap:(st.caps||[]).includes('veteran'),towers:st.towerCount||0}:null)
 const run=useSlice(store,()=>store.run())
 // Glass tier (ui/Glass.tsx): no backdrop blur while a wave runs; solid under Reduced effects and the transparency/contrast preferences.
 const live=useSlice(store,st=>!!st&&st.phase==='playing'&&!st.paused)
 const glassTier=useGlassTier({reducedEffects:prefs.reducedEffects,live:entered&&ready&&live,still:!entered})
 usePointerLight(root)
 const v2=!!page&&page.v>=2
 const currentLevel=definitions?.levels.find(l=>l.id===(page?.level||level))
 // the entry page shows the chapter of the stage it offers next, so its art and accent follow the campaign
 const lobbyBiome=definitions?.levels.find(l=>l.id===(preview?qaLevel:Math.min(LevelCount,save.unlocked)))?.biome
 const challengeBoss=page?bossOfLevel(page.level):null
 // the guided first level: a fresh player on level 1 (the dev preview opts in with ?carrot-tutorial)
 const tutorialActive=(!preview||new URLSearchParams(location.search).has('carrot-tutorial'))&&!records.tutorial&&save.unlocked<=1&&!Object.keys(save.medals).length&&(page?.level||level)===1
 const step=useTutorialStep(store,tutorialActive&&ready&&!panel)
 const veteranAvailable=!!page?.veteranCap||!!definitions?.levels.some(l=>l.modes?.includes('veteran'))

 // Development preview only (tree-shaken from production): a QA harness can drive the level, read the live state, or inject a snapshot.
 useEffect(()=>{if(!preview)return;const w=window as unknown as {__carrot?:{send:(c:Command)=>void;state:()=>GameState|null;inject:(s:GameState|null)=>void;ready:()=>void}};w.__carrot={send:c=>engine.current?.send(c),state:()=>store.get(),inject:s=>store.set(s),ready:()=>{setError('');setReady(true)}};return()=>{delete w.__carrot}},[preview,store])
 useEffect(()=>{let active=true;fetch(`/assets/minigames/carrot/game-data.json?v=${build.version}`).then(r=>{if(!r.ok)throw new Error(errors.gameData);return r.json()}).then((d:GameDefinitions)=>{if(active&&Array.isArray(d.towers)&&Array.isArray(d.levels))setDefinitions(d)}).catch(e=>{if(active)setError(e.message)});return()=>{active=false}},[])
 useEffect(()=>{const oldTitle=document.title;document.title='Carrot Defense 3D · Cornell CGS';document.documentElement.classList.add('ct-document');return()=>{document.title=oldTitle;document.documentElement.classList.remove('ct-document')}},[])
 useEffect(()=>{const m=matchMedia('(prefers-reduced-motion: reduce)');const f=()=>setOsReduced(m.matches);m.addEventListener('change',f);return()=>m.removeEventListener('change',f)},[])
 useEffect(()=>subscribePrefs(setPrefs),[])
 useEffect(()=>subscribeVolumes(setVolumes),[])
 useEffect(()=>{engine.current?.setReducedEffects(prefs.reducedEffects)},[prefs.reducedEffects])
 useEffect(()=>{
  if(!entered||!mount.current)return
  setReady(false);setError('');setBytes(null)
  const game=new CarrotUnity(mount.current,{state:s=>store.set(s),progress:setLoading,ready:()=>setReady(true),error:setError,bytes:(done,total)=>setBytes({done,total})},level,!saved.current.sound,{reducedEffects:readPrefs().reducedEffects,mode:veteran?'veteran':undefined});engine.current=game
  return()=>{game.dispose();if(engine.current===game)engine.current=null}
 },[entered])
 // bridge v2 builds take volumes as soon as they report v>=2 (an older player has no receiver for the message)
 useEffect(()=>{if(v2&&!saved.current.sound)return;if(v2)engine.current?.setVolumes(volumes)},[v2,volumes])
 useBeatGlow(trackBox,reduced,ready&&!!page&&page.phase==='playing')

 // ---- per-run reactions to the snapshot stream (no React state per publish) ----
 useEffect(()=>store.subscribe(()=>{
  const st=store.get();if(!st)return
  const d=definitionsRef.current
  // outcome: awards once per run, the results card after the victory beat (1.5 s; 0.3 s with reduced motion)
  if(st.phase==='won'||st.phase==='lost'){const key=`${store.run()}:${st.level}:${st.phase}`
   if(award.current!==key){award.current=key
    const boss=bossOfLevel(st.level),summary=tracker.summary(),seconds=typeof st.elapsed==='number'?st.elapsed:NaN
    const def=d?.levels.find(l=>l.id===st.level),won=st.phase==='won'
    const grade=gradeRun({won,health:st.health,progress:st.progress,seconds,par:boss?challengePar[boss]:def?.par,scenery:st.blockersRemaining===0,challenge:!!boss})
    const previous=(st.mode==='veteran'?recordsRef.current.levels[String(st.level)]?.vgrade:recordsRef.current.levels[String(st.level)]?.grade)||0
    if(!won)lossCounts.set(st.level,(lossCounts.get(st.level)||0)+1)
    setResultInfo({grade,previous,losses:lossCounts.get(st.level)||0})
    if(!preview){
     if(won&&boss)setChallenges(p=>awardChallenge(p,boss,st.health,seconds,st.towerCount??0))
     else if(won)setSave(p=>awardCampaign(p,st.level,st.health,st.blockersRemaining===0))
     setRecords(p=>awardRecord(p,st.level,{grade,streak:summary.bestChain,seconds,won,veteran:st.mode==='veteran'}))
    }
    window.setTimeout(()=>{if(award.current===key)setResult(true)},reduced?300:1500)
   }
  }else if(award.current&&!award.current.startsWith(`${store.run()}:`)){award.current='';setResult(false)}
  // Supers: the merge-undo window opening, or a Super the page has not seen becoming the selection
  const undo=st.mergeUndo||0,sel=st.selection,superSel=sel?.type==='tower'&&sel.tier>=SuperTier?sel:null
  const newSuper=!!superSel&&!knownSupers.current.has(superSel.id);if(superSel)knownSupers.current.add(superSel.id)
  if(!preview&&undo>0&&(lastUndo.current<=0||undo>lastUndo.current+.3||newSuper)){const kind=sel?.type==='tower'?sel.kind:'';const t=d?.towers.find(x=>x.id===kind);setForged({kind,name:sel?.superName||t?.superName||'Super tower'});if(kind)setSuperSave(p=>recordSuper(p,kind))
   // the forge beat: the judgement word is read first; the new Super's panel and the other toasts wait 1.3 s
   setForgeBeat(true);clearTimeout(forgeTimer.current);forgeTimer.current=window.setTimeout(()=>setForgeBeat(false),1300)}
  lastUndo.current=undo
  if(!preview&&superSel&&!superRef.current.kinds[superSel.kind])setSuperSave(p=>p.kinds[superSel.kind]?p:recordSuper(p,superSel.kind))
  // the merge lesson: once per device, on the first fully grown tower, in the ready phase or a breather (8 s at most)
  if(!preview&&!superRef.current.taught){const reached=(sel?.type==='tower'&&sel.tier>=TopTier)||(st.superPairs||0)>0
   if(!teachPending.current&&reached)teachPending.current=performance.now()+8000
   if(teachPending.current&&(st.phase==='ready'||st.nextWave>0||st.enemyCount===0||performance.now()>teachPending.current)){teachPending.current=0;setTeach(true);setSuperSave(p=>teachSuper(p));clearTimeout(teachTimer.current);teachTimer.current=window.setTimeout(()=>setTeach(false),9000)}}
 }),[store,tracker,preview,reduced])
 useEffect(()=>{setResult(false);superTargets.current.clear();knownSupers.current.clear();lastUndo.current=0},[run])
 // creatures met: the wave track's NEW tags stop once a level that sends them was played
 useEffect(()=>{if(preview||!page||page.phase!=='playing'||!currentLevel)return;const kinds=levelKinds(currentLevel).filter(k=>/^[A-Za-z][A-Za-z0-9]{1,31}$/.test(k));const t=window.setTimeout(()=>setRecords(r=>markSeen(r,{creatures:kinds})),20000);return()=>clearTimeout(t)},[page?.phase,currentLevel,preview])
 const encounters=useEncounters(store,records.seen.abilities,send,useCallback((id:string)=>{if(!preview)setRecords(r=>markSeen(r,{abilities:[id]}));else setRecords(r=>({...r,seen:{...r.seen,abilities:[...r.seen.abilities,id]}}))},[preview]),ready&&!panel)

 useEffect(()=>{const visibility=()=>{const st=store.get();if(document.hidden&&st&&!st.paused&&st.phase==='playing')send({type:'pause'})};document.addEventListener('visibilitychange',visibility);return()=>document.removeEventListener('visibilitychange',visibility)},[send,store])
 useEffect(()=>{const key=(e:KeyboardEvent)=>{if(e.repeat||e.metaKey||e.ctrlKey||e.altKey||panel||encounters.card||!entered||!ready||e.target instanceof HTMLInputElement||e.target instanceof HTMLTextAreaElement)return
  const st=store.get(),selection=st?.selection
  if(e.key==='Escape'){send({type:'clear'});return}
  if(e.code==='Space'&&!(e.target instanceof HTMLButtonElement)){e.preventDefault();send({type:st?.phase==='ready'?'start':'pause'})}
  if(e.key.toLowerCase()==='f'&&st?.phase==='playing')send({type:'speed',value:st.speed>1?1:2})
  if(e.key.toLowerCase()==='u'&&selection?.type==='tower'&&selection.tier<TopTier)send({type:'upgrade'})
  if(e.key.toLowerCase()==='m'&&selection?.type==='tower'&&selection.tier===TopTier&&(selection.partners||0)>0)send({type:'mergeArm',id:selection.id})}
  window.addEventListener('keydown',key);return()=>window.removeEventListener('keydown',key)},[entered,ready,panel,send,store,encounters.card])
 useEffect(()=>{const f=()=>setExpanded(!!document.fullscreenElement);document.addEventListener('fullscreenchange',f);return()=>document.removeEventListener('fullscreenchange',f)},[])
 useEffect(()=>()=>{clearTimeout(teachTimer.current);clearTimeout(forgeTimer.current);stopMenuSound()},[])
 // Signing in (or another device playing) can change the stored records: adopt them, or the next award overwrites them.
 useEffect(()=>progress.subscribe(RECORD,()=>setSave(readCampaign())),[])
 useEffect(()=>progress.subscribe('carrot:challenges',()=>setChallenges(readChallenges())),[])
 useEffect(()=>progress.subscribe('carrot:super',()=>setSuperSave(readSuper())),[])
 useEffect(()=>progress.subscribe(RECORDS,()=>setRecords(readRecords())),[])

 // The camera keeps the selected pad and the carrot clear of the HUD and the open panel (bridge v2: SetSafeArea, sent once per change).
 const sentArea=useRef('')
 const onSafeArea=useCallback((p:{rect:DOMRect|null;mode:PanelMode})=>{
  if(!v2||!engine.current)return
  const vw=innerWidth,vh=innerHeight,edges=hudEdges()
  const area={top:edges.top/vh,bottom:(vh-edges.bottom)/vh,left:0,right:0}
  if(p.rect){const r=p.rect;if(p.mode==='sheet'){if(r.top>vh/2)area.bottom=Math.max(area.bottom,(vh-r.top)/vh);else area.top=Math.max(area.top,r.bottom/vh)}else if(r.left+r.width/2<vw/2)area.left=r.right/vw;else area.right=(vw-r.left)/vw}
  const round=(n:number)=>Math.round(Math.max(0,Math.min(.9,n))*1000)/1000,next={top:round(area.top),bottom:round(area.bottom),left:round(area.left),right:round(area.right)},key=JSON.stringify(next)
  if(key!==sentArea.current){sentArea.current=key;engine.current.setSafeArea(next)}
 },[v2])
 // The results card docks at the bottom: the camera keeps the carrot above it (the victory orbit reads the safe area's bottom).
 const onResultsDock=useCallback((rect:DOMRect|null)=>{
  if(!rect){onSafeArea({rect:null,mode:'anchored'});return}
  if(!v2||!engine.current)return
  const vh=innerHeight,edges=hudEdges(),round=(n:number)=>Math.round(Math.max(0,Math.min(.6,n))*1000)/1000
  const next={top:round(edges.top/vh),bottom:round((vh-rect.top)/vh),left:0,right:0},key=JSON.stringify(next)
  if(key!==sentArea.current){sentArea.current=key;engine.current.setSafeArea(next)}
 },[v2,onSafeArea])
 useEffect(()=>{if(!v2||!ready)return;const f=()=>onSafeArea({rect:null,mode:'anchored'});const t=window.setTimeout(f,400);addEventListener('resize',f);return()=>{clearTimeout(t);removeEventListener('resize',f)}},[v2,ready,onSafeArea,page?.boss])

 const isOpen=(id:number)=>preview||(id>LevelCount?challengeUnlocked(id,saved.current,challengesRef.current):id<=saved.current.unlocked)
 const choose=(id:number)=>{if(!isOpen(id))return;setPanel(null);setLevel(id);setResult(false);award.current='';if(entered){send(veteran&&id<=LevelCount?{type:'load',level:id,mode:'veteran'}:{type:'load',level:id})}else setEntered(true)}
 const openPanel=(value:Panel)=>{const st=store.get();wasPlaying.current=!!st&&!st.paused&&st.phase==='playing';if(wasPlaying.current)send({type:'pause'});setPanel(value)}
 const closePanel=()=>{setPanel(null);if(wasPlaying.current&&store.get()?.paused)send({type:'pause'});wasPlaying.current=false}
 const toggleSound=()=>{const next=saveCampaign({...save,sound:!save.sound});setSave(next);send({type:'mute',value:next.sound?0:1})}
 const fullscreen=async()=>{try{if(document.fullscreenElement)await document.exitFullscreen();else if(root.current?.requestFullscreen)await root.current.requestFullscreen();else setExpanded(v=>!v)}catch{setExpanded(v=>!v)}}
 const restart=()=>{setPanel(null);wasPlaying.current=false;const id=store.get()?.level||level;setResult(false);award.current='';send(veteran&&id<=LevelCount?{type:'load',level:id,mode:'veteran'}:{type:'load',level:id})}
 const onSaved=useCallback(()=>{const st=store.get();if(!st?.judgement)tracker.emit('saved',st?.wave||0)},[store,tracker])

 const st=store.get()
 const pageClass=['ct-page',page?.biome==='prism'?'is-prism':'',expanded?'is-expanded':'',page?.blind?'is-blind':'',page?.blackout?'is-blackout':'',page?.white?'is-blind-white':'',result?'has-result':''].filter(Boolean).join(' ')
 return <div className={pageClass} ref={root} data-biome={page?.biome||(entered?currentLevel?.biome:lobbyBiome)||'garden'} data-boss={challengeBoss||undefined} data-motion={reduced?'reduce':'full'} data-glass={glassTier} style={{'--hud-scale':prefs.hudScale/100} as CSSProperties} onClickCapture={e=>{
  const button=(e.target as Element).closest('button:not(:disabled),a');if(!saved.current.sound||!button)return
  const label=button.getAttribute('aria-label')||button.textContent||''
  const kind=/^Close|^Back/.test(label)?'close':/Stage select|^Stages|Choose|How to|[Cc]hallenges|Settings|Field guide/.test(label)?'open':'click'
  if(ready&&entered)engine.current?.uiSound(kind);else menuSound(kind)
 }}>
  {!entered?<Lobby definitions={definitions} save={save} records={records} error={error} preview={preview} qaLevel={qaLevel} reduced={reduced} onPlay={choose} onSelect={()=>openPanel('select')} onChallenges={()=>openPanel('challenges')} onGuide={()=>openPanel('guide')} onHelp={()=>openPanel('help')} onSettings={()=>openPanel('settings')} onCredits={()=>openPanel('credits')}/>
  :<main className="ct-game" aria-label="Carrot Defense battlefield">
   <div className="ct-scene" ref={mount}/>
   {(!ready||error)&&<Loading level={currentLevel} definitions={definitions} progress={loading} bytes={bytes} error={error} onRetry={()=>location.reload()}/>}
   {ready&&st&&<>
    {import.meta.env.DEV&&preview&&<LiveReview store={store} send={send} quality={value=>engine.current?.quality(value)} onEncounter={id=>{setLevel(id);setResult(false)}}/>}
    {page?.blackout&&<div className="ct-blackout" aria-hidden="true"/>}
    <MonsterBars store={store}/>
    <MiniBars store={store} send={send}/>
    <Vignette store={store} reduced={reduced}/>
    <div className="ct-hud" ref={hud}>
     <div className="ct-hud__status" data-top><StatusPanel store={store} reduced={reduced} tracker={tracker}/></div>
     <div className="ct-hud__track" data-top ref={trackBox}><WaveTrack store={store} level={currentLevel} enemies={definitions?.enemies} seen={records.seen.creatures} reduced={reduced} compact={false}/></div>
     <Controls store={store} send={send} sound={save.sound} expanded={expanded} onSound={toggleSound} onFullscreen={()=>void fullscreen()} onSettings={()=>openPanel('settings')} onStages={()=>openPanel(challengeBoss?'challenges':'select')}/>
     <div className="ct-hud__boss" data-top><BossBar store={store} send={send} seenAbilities={records.seen.abilities} superTargets={superTargets.current} onSaved={onSaved}/><Reinforcements store={store}/></div>
     <BottomBar store={store} send={send} onHelp={()=>openPanel('help')} startSpotlight={step==='start'}/>
    </div>
    <Judgement tracker={tracker} reduced={reduced} waves={currentLevel?.waves||0}/>
    <div className="ct-toasts">
     {!result&&<BossWarning store={store} run={run}/>}
     {!result&&<ForgeToast store={store} name={forged.name} kind={forged.kind} send={send}/>}
     {!result&&!forgeBeat&&<AirToast store={store} level={currentLevel} enemies={definitions?.enemies} definitions={definitions}/>}
     {!result&&<NoticeToast store={store} forged={forged.name}/>}
     {teach&&!result&&!forgeBeat&&<MergeTip onDismiss={()=>setTeach(false)}/>}
    </div>
    {!result&&!panel&&!forgeBeat&&<BuildMenu store={store} definitions={definitions} send={send} reduced={reduced} onSafeArea={onSafeArea} tutorialFocus={step==='build'?'seed':undefined}/>}
    {!result&&!panel&&!encounters.card&&<PausedCard store={store} send={send}/>}
    {!result&&!step&&<PrismBriefing store={store} run={run}/>}
    {step&&!result&&<Coach step={step} towers={page?.towers||0} onSkip={()=>setRecords(r=>finishTutorial(r))} onDone={()=>setRecords(r=>finishTutorial(r))}/>}
    {encounters.card&&!result&&<EncounterCard card={encounters.card} onDismiss={encounters.dismiss}/>}
    {result&&st&&(st.phase==='won'||st.phase==='lost')&&<Results state={st} level={currentLevel} definitions={definitions} summary={tracker.summary()} grade={resultInfo.grade} previousGrade={resultInfo.previous} challengeBoss={challengeBoss} losses={resultInfo.losses}
     onNext={()=>choose(Math.min(LevelCount,st.level+1))} onRetry={()=>choose(st.level)} onSelect={()=>openPanel('select')} onChallenges={()=>openPanel('challenges')} onDock={onResultsDock}/>}
   </>}
  </main>}
  {(panel==='select'||panel==='challenges')&&definitions&&<LevelSelect definitions={definitions} save={save} challenges={challenges} records={records} current={page?.level||save.unlocked} preview={preview} veteranAvailable={veteranAvailable} veteran={veteran} onVeteran={setVeteran} onPlay={choose} onClose={closePanel} startChallenges={panel==='challenges'} reduced={reduced}/>}
  {panel==='guide'&&<FieldGuide definitions={definitions} superSave={superSave} onClose={closePanel}/>}
  {panel==='help'&&<HelpModal onClose={closePanel}/>}
  {panel==='credits'&&<CreditsModal onClose={closePanel}/>}
  {panel==='settings'&&<SettingsModal prefs={prefs} volumes={volumes} sound={save.sound} inGame={entered&&ready} canFocusBoss={v2&&!!page?.boss} onPrefs={p=>writePrefs(p)} onVolumes={v=>writeVolumes(v)} onSound={toggleSound} onFocusBoss={()=>{closePanel();engine.current?.focusBoss()}} onRestart={entered&&ready?()=>setPanel('restart'):undefined} expanded={expanded} onStages={entered&&ready?()=>setPanel(challengeBoss?'challenges':'select'):undefined} onHelp={entered&&ready?()=>setPanel('help'):undefined} onFullscreen={entered&&ready?()=>void fullscreen():undefined} onClose={closePanel}/>}
  {panel==='restart'&&<ConfirmModal title="Restart this stage?" body="The current run ends and the stage starts again from wave 1." confirm="Restart" onConfirm={restart} onClose={closePanel}/>}
 </div>
}
