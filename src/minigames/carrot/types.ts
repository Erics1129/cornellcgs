// Tier arrays carry five entries once the Super tier ships (damage/interval/range); cost keeps four because a Super is merged, never bought.
export type TowerDefinition = { id:string; name:string; role:string; unlock:number; air:boolean; cost:number[]; damage:number[]; interval:number[]; range:number[]; superName?:string; superTrait?:string }
/** One spawn packet of a wave, as game-data.json `levels[].wavePlan[w]` publishes it: `at` and `span` are game seconds from the wave's start. */
export type WavePacket = { kind:string; n:number; route:number; at:number; span:number; boss?:boolean }
export type LevelDefinition = { id:number; name:string; biome:string; waves:number; startingGold:number; boss?:string; challenge?:'easy'|'hard'|'insane'|'????'; bossName?:string; routes?:Array<Array<{x:number;y?:number;z:number}|number[]>>; pads?:unknown[];
 /** "nibble:9,dash:4" per wave (always present in game-data.json). */
 waveCompositions?:string[]
 /** v2 (optional): the exact spawn schedule per wave, from CarrotData.WavePlan(). */
 wavePlan?:WavePacket[][]
 /** v2 (optional): expert-bot median seconds x 1.10. */
 par?:number
 /** v2 (optional): modes this level offers, for example ['normal','veteran']. */
 modes?:string[] }
export type EnemyDefinition = { id:string; name:string; trait:string; intro:number; hp:number; speed:number; armor:number; shield:number; reward:number; air:boolean; mini:boolean }
export type GameDefinitions = { version?:number; towers:TowerDefinition[]; levels:LevelDefinition[]; enemies?:EnemyDefinition[] }
// partners: same-kind tier-4 towers this tier-4 tower could merge with; spent: coins invested (a Super carries both halves).
export type Selection = { type:string; id:number; kind:string; tier:number; hp:number; maxHp:number; refund:number; x:number; y:number; partners?:number; superName?:string; spent?:number }
/**
 * abilityTarget: the tower a tower-targeting telegraph (uproot, gaze, tithe-like expansion casts) has chosen, -1 when none.
 * v2 additions are optional so the page keeps working against a v1 build: remaining (route units to the carrot), eta (seconds, -1 when
 * the boss is not moving), routeFraction (0..1 along its route), contactFatal (challenge guardians: contact ends the run),
 * windup (the cast's total telegraph seconds), actionable (the cast targets a tower or coins and has a counterplay button).
 */
export type Boss = { id:number;kind:string;name:string;hp:number;maxHp:number;shield:number;maxShield:number;phase:number;ability:string;castRemaining:number;abilityTarget?:number;stage?:number;
 remaining?:number;eta?:number;routeFraction?:number;contactFatal?:boolean;windup?:number;actionable?:boolean }
export type MiniBoss = Boss & { x:number;y:number;visible:boolean;castTotal?:number }
export type Monster = { id:number;kind:string;hp:number;maxHp:number;shield:number;maxShield:number;x:number;y:number;visible:boolean }
/** v2: one packet of the current or next wave (at/span: game seconds relative to waveElapsed of the wave it belongs to). */
export type Incoming = { kind:string;count:number;route:number;air:boolean;armor:boolean;shield:boolean;heal:boolean;mini:boolean;boss?:boolean;at:number;span:number;wave?:number;eta?:number }
/** v2: running counters; the parallel arrays stand in for dictionaries (JsonUtility cannot write them). */
export type Stats = { kills:number;leaks:number;earned:number;streak:number;bestStreak:number;perfectWaves:number;waveLeaks:number[];leakKinds:string[];leakCounts:number[];dmgKinds:string[];dmgValues:number[] }
export type JudgementKind = 'flawless'|'clear'|'leak'|'phaseBreak'|'superForged'|'saved'
export type Judgement = { seq:number;kind:JudgementKind|string;wave:number;value:number }
/** v2: the top causes of lost hearts with a suggested counter tower id. */
export type LossCause = { kind:string;route:number;wave:number;count:number;airUncovered:boolean;counter:string }
// blind: seconds of blindness left; blindTint 1 = white frost vignette, 0 = dark; blindAlpha: overlay strength 0..1; elapsed: level seconds for challenge records;
// superPairs: mergeable tier-4 pairs on the map; mergeUndo: seconds left to undo the last merge.
export type GameState = { level:number;name:string;biome:string;wave:number;waves:number;coins:number;health:number;progress:number;phase:'ready'|'playing'|'won'|'lost';paused:boolean;speed:number;nextWave:number;enemyCount:number;selection:Selection|null;boss:Boss|null;monsters:Monster[];minibosses?:MiniBoss[];notice:string;cleared?:number;blockersRemaining?:number;towerCount?:number;blind?:number;blindTint?:number;blindAlpha?:number;elapsed?:number;reinforcements?:number;reinforcementTier?:number;reinforcementIn?:number;superPairs?:number;mergeUndo?:number;mergeArmed?:number;muted?:boolean
 // ---- bridge contract v2 (all optional: a v1 build sends none of them and the page degrades) ----
 v?:number
 /** increments on every LoadLevel, so a restart resets per-run page state */
 runId?:number
 /** effective simulation rate: speed x hold x cinematic scale (0 while paused or in a time-stop) */
 timeScale?:number
 /** capabilities of the running build, for example 'worldBars', 'veteran' */
 caps?:string[]
 /** game seconds since the current wave began */
 waveElapsed?:number
 incoming?:Incoming[]
 speedHold?:boolean
 speedHoldReason?:string
 stats?:Stats
 judgement?:Judgement
 lossCauses?:LossCause[]
 mode?:'normal'|'veteran'|string
 /** viewport fractions, origin top-left */
 carrotX?:number;carrotY?:number
 spawnPoints?:Array<{x:number;y:number}> }
export type Command = {type:string;[key:string]:string|number|boolean}
export type CampaignSave = { version:1; unlocked:number; medals:Record<string,number>; sound:boolean }
export type SuperSave = { version:1; taught:boolean; merges:number; kinds:Record<string,number> }
export type ChallengeBoss = 'tornado'|'zombie'|'eyeball'|'portal'|'asuna'
export type ChallengeRecord = { cleared:boolean; health:number; seconds:number; towers:number }
export type ChallengeSave = { version:3; best:Partial<Record<ChallengeBoss,ChallengeRecord>> }
/** Per-level record: grade 0 none, 1 D, 2 C, 3 B, 4 A, 5 S; bestStreak: longest defense chain; bestSeconds: fastest win (0 = none); vgrade: Veteran grade. */
export type LevelRecord = { grade:number; bestStreak:number; bestSeconds:number; vgrade:number }
/** `cgs-carrot-records-v1` (account record `carrot:records`): grades, first encounters and the tutorial, all new in the giant update. */
export type RecordsSave = { version:1; levels:Record<string,LevelRecord>; seen:{abilities:string[];creatures:string[]}; tutorial:boolean }
