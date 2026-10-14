// Tier arrays carry five entries once the Super tier ships (damage/interval/range); cost keeps four because a Super is merged, never bought.
export type TowerDefinition = { id:string; name:string; role:string; unlock:number; air:boolean; cost:number[]; damage:number[]; interval:number[]; range:number[]; superName?:string; superTrait?:string }
export type LevelDefinition = { id:number; name:string; biome:string; waves:number; startingGold:number; boss?:string; challenge?:'easy'|'hard'|'insane'; bossName?:string; routes?:Array<Array<{x:number;y?:number;z:number}|number[]>>; pads?:unknown[] }
export type GameDefinitions = { towers:TowerDefinition[]; levels:LevelDefinition[] }
// partners: same-kind tier-4 towers this tier-4 tower could merge with; spent: coins invested (a Super carries both halves).
export type Selection = { type:string; id:number; kind:string; tier:number; hp:number; maxHp:number; refund:number; x:number; y:number; partners?:number; superName?:string; spent?:number }
// abilityTarget: the tower an uproot telegraph has chosen (sell it before the commit to keep most of the coins).
export type Boss = { id:number;kind:string;name:string;hp:number;maxHp:number;shield:number;maxShield:number;phase:number;ability:string;castRemaining:number;abilityTarget?:number }
export type Monster = { id:number;kind:string;hp:number;maxHp:number;shield:number;maxShield:number;x:number;y:number;visible:boolean }
// blind: seconds of blindness left; blindTint 1 = white frost vignette, 0 = dark; blindAlpha: overlay strength 0..1; elapsed: level seconds for challenge records;
// superPairs: mergeable tier-4 pairs on the map; mergeUndo: seconds left to undo the last merge.
export type GameState = { level:number;name:string;biome:string;wave:number;waves:number;coins:number;health:number;progress:number;phase:'ready'|'playing'|'won'|'lost';paused:boolean;speed:number;nextWave:number;enemyCount:number;selection:Selection|null;boss:Boss|null;monsters:Monster[];notice:string;cleared?:number;blockersRemaining?:number;towerCount?:number;blind?:number;blindTint?:number;blindAlpha?:number;elapsed?:number;superPairs?:number;mergeUndo?:number }
export type Command = {type:string;[key:string]:string|number|boolean}
export type CampaignSave = { version:1; unlocked:number; medals:Record<string,number>; sound:boolean }
export type SuperSave = { version:1; taught:boolean; merges:number; kinds:Record<string,number> }
export type ChallengeBoss = 'tornado'|'zombie'|'eyeball'
export type ChallengeRecord = { cleared:boolean; health:number; seconds:number; towers:number }
export type ChallengeSave = { version:1; best:Partial<Record<ChallengeBoss,ChallengeRecord>> }
