using System;
using System.Collections.Generic;
using System.Globalization;
using System.Runtime.InteropServices;
using UnityEngine;

namespace CarrotTD {
 // Authoritative simulation. Presentation listens to Effect; it never resolves combat.
 public sealed partial class CarrotGame : MonoBehaviour {
  public LevelDef level;
  public List<TowerState> towers=new List<TowerState>();
  public List<EnemyState> enemies=new List<EnemyState>();
  public List<BlockerState> blockers=new List<BlockerState>();
  public int coins,health,wave;
  public float elapsed,progress,nextWave,speed=1;
  public bool paused,AutoTick=true,EnableBridge=true;
  /// <summary>Builds and publishes the bridge snapshot (off for the duo replica, which has no page).</summary>
  [NonSerialized] public bool SnapshotEnabled=true;
  /// <summary>What Awake loads (0: nothing; the duo replica is loaded and configured before it is activated).</summary>
  [NonSerialized] public int AwakeLevel=1;[NonSerialized] public string AwakeMode="normal";[NonSerialized] public uint AwakeArg;
  public string phase="ready",selectionType="",notice="";
  public int selectionId=-1;
  // Blindness: while elapsed<blindUntil every tower that is not lit loses range (x blindRange). Nothing is locked.
  public string blindKind="";
  public float blindUntil,blindTint,blindAlpha,blindRange=.6f;
  // Tap-tap merging: the view merges on the next tap of a valid partner while this is the armed tower id (0 = disarmed).
  public int mergeArmed;
  public event Action<CarrotEvent> Effect;
  public string LastSnapshot {get;private set;}
  public string PreviewKind {get;private set;}="seed";
  public int ResolvedEnemies {get;private set;}
  public int TotalEarned {get;private set;}
  public int CarrotContacts {get;private set;}
  public int PendingSummons {get{return pendingSummons;}}
  const float Step=1f/30f;
  float accumulator,bridgeClock,noticeUntil,gustUntil;
  int nextId=1,pendingSummons,unresolvedContacts,totalWork,resolvedWork,gustBoss;
  uint rng;
  bool backgrounded,muted;
  int[] waveLiving,wavePending,waveBoss;
  bool[] waveStarted,wavePaid;
  readonly List<SpawnJob> spawns=new List<SpawnJob>();
  readonly List<Projectile> projectiles=new List<Projectile>();
  readonly List<BurnZone> burns=new List<BurnZone>();
  readonly Dictionary<int,FocusState> focusStates=new Dictionary<int,FocusState>();
  readonly Dictionary<int,Aura> auras=new Dictionary<int,Aura>();
  readonly Dictionary<int,Actor> actors=new Dictionary<int,Actor>();
  readonly List<int> removeIds=new List<int>();
  // Reusable scratch lists: the enemy walk (boss summons extend the authoritative collection mid-tick) and candidate sorting.
  readonly List<EnemyState> walk=new List<EnemyState>();
  readonly List<TowerState> candidates=new List<TowerState>();
  readonly List<Grave> graves=new List<Grave>();
  MergeRecord lastMerge;
  [DllImport("__Internal")] static extern void CarrotSend(string json);

  class SpawnJob {public float at;public string kind,boss;public int route,wave;}
  class Projectile {public string kind;public int source,target,tier;public float damage,remaining;public Vector3 position,to;public bool returning;}
  class BurnZone {public int source,tier;public Vector3 position;public float radius,dps,remaining,tick;}
  class FocusState {public int target,hits;}
  class Aura {public float until,strength;}
  class Grave {public string kind;public int route;public float distance;}
  class MergeRecord {public int sourceId,sourcePad,sourceSpent,targetId,seat;public float at,lastShot;public Vector3 position;}
  class Actor {
   public int wave,phase=1,bogCalls,mantles,shatters,flocks,heaps,reserved,seedMarks;
   public int uproots,blinds,tithes,whiteouts,dusks,gusts,lifts,raises,gazes;
   public float seedBurstAt,freezeAt,conductiveUntil,rewindUntil,rewindReady,gravityReady,pullUntil,rushMult=1,liftUntil,castHp,castShave;
   public Vector3 pullCenter;
   public float baseSpeed,armor,armorUntil,veilUntil,shieldUntil,healAt,burrowAt,emergeAt,abilityA=6,abilityB=11,abilityC=12,abilityD=float.MaxValue,abilityE=float.MaxValue,abilityF=float.MaxValue,castEnd,castTotal,activeUntil,stunUntil,contactEnd;
   public int deadlineMask,breaks;
   public bool contactApplied,work=true;
   public string cast="";
   public Vector3 castDirection;
   public List<int> targets=new List<int>();
   public List<int> uprooted=new List<int>();
  }
  [Serializable] class InputCommand {public string type,kind,selectionType,mode;public int id,level,target,route,tier;public float value;}
#if UNITY_EDITOR
  // Editor tests only: run the campaign bots against the pre-difficulty-pass boss kits (no blind/uproot/tithe/whiteout/dusk) for the recorded baselines.
  public static bool LegacyKits;
#endif

  void Awake(){if(AwakeLevel>0)LoadLevel(AwakeLevel,AwakeMode,AwakeArg);}
  void Update(){AdvanceReal(Mathf.Min(Time.unscaledDeltaTime,.1f));}
  void OnApplicationFocus(bool focused){backgrounded=!focused;accumulator=0;}
  void OnApplicationPause(bool value){backgrounded=value;accumulator=0;}

  public void LoadLevel(int id){LoadLevel(id,"normal");}
  public void LoadLevel(int id,string mode){
   // "duo:<side>" and "endless:<seed>" are the one-string forms of the multiplayer modes (tests and QA scaffolds).
   if(mode!=null){int colon=mode.IndexOf(':');uint value;if(colon>0&&uint.TryParse(mode.Substring(colon+1),NumberStyles.Integer,CultureInfo.InvariantCulture,out value)){LoadLevel(id,mode.Substring(0,colon),value);return;}}
   LoadLevel(id,mode,0u);
  }
  /// <summary>mode "normal" | "veteran" | "duo" (arg = side 0|1: that level's mirrored half, CarrotDuoMaps.Half) | "endless"
  /// (level 90, arg = the room seed). Duo halves keep the level's id, so every per-level table, kit and award applies.</summary>
  public void LoadLevel(int id,string mode,uint arg){
   bool duo=mode=="duo",endless=mode=="endless"||id==CarrotDuoMaps.EndlessId;if(endless)id=CarrotDuoMaps.EndlessId;int side=arg==1?1:0;
   var def=duo?CarrotDuoMaps.Half(id,side):CarrotData.Level(id);if(def==null)return;RunId++;
   Mode=duo?"duo":endless?"endless":mode=="veteran"&&VeteranAllowed(id)?"veteran":"normal";SetCap("veteran",VeteranAllowed(1));DuoSideIndex=duo?side:-1;
   ClearTimeScale();SpeedHold=false;SpeedHoldReason="";waveStartedAt=0;
   level=def;towers.Clear();enemies.Clear();blockers.Clear();spawns.Clear();projectiles.Clear();actors.Clear();burns.Clear();focusStates.Clear();auras.Clear();graves.Clear();walk.Clear();PreviewKind="seed";
   ResetExpansion();coins=def.startingGold;health=10;wave=0;elapsed=0;progress=0;nextWave=0;paused=false;speed=1;phase="ready";
   nextId=1;pendingSummons=0;unresolvedContacts=0;resolvedWork=0;totalWork=0;ResolvedEnemies=0;TotalEarned=coins;CarrotContacts=0;
   blindKind="";blindUntil=0;blindTint=0;blindAlpha=0;blindRange=.6f;gustBoss=0;gustUntil=0;mergeArmed=0;lastMerge=null;
   // Deterministic xorshift stream seeded by the level id: random picks (uproot targets) replay identically for identical command lists.
   rng=unchecked((uint)level.id*2654435761u)^0x9E3779B9u;if(rng==0)rng=0x9E3779B9u;
   // Endless: the room seed is the only source of randomness (both peers derive the same stream).
   if(endless){uint seed=arg==0?1u:arg;rng=unchecked(seed*2654435761u)^0x85EBCA6Bu;if(rng==0)rng=0x85EBCA6Bu;}
   selectionType="";selectionId=-1;focusType="";focusId=-1;accumulator=0;notice="";noticeUntil=0;
   waveLiving=new int[level.waves+1];wavePending=new int[level.waves+1];waveBoss=new int[level.waves+1];waveStarted=new bool[level.waves+1];wavePaid=new bool[level.waves+1];
   ResetEndless(endless,arg);ResetNet();
   if(!endless)for(int w=0;w<level.waves;w++)foreach(string part in CarrotData.Waves[level.id-1][w].Split(',')){
    string[] bits=part.Split(':');int n=int.Parse(bits[1],CultureInfo.InvariantCulture);totalWork+=n*CarrotData.Work(bits[0]);wavePending[w+1]+=n;
   }
   BuildPlans();ResetStats();
   float hpScale=new float[]{1f,1.5f,2f,2.25f}[CarrotData.BiomeTier(level.biome)];
   foreach(var seed in level.blockers){
    int rank=seed.kind=="hedge"?0:seed.kind=="stump"?1:2;float hp=(rank==0?70:rank==1?160:300)*hpScale;
    blockers.Add(new BlockerState{id=nextId++,pad=seed.pad,kind=seed.kind,position=level.pads[seed.pad],hp=hp,maxHp=hp,reward=rank==0?15:rank==1?30:50});
   }
   Emit("level",level.biome,Vector3.zero);EmitIncoming(1);Publish();
  }
  int NextInt(int n){if(n<=1)return 0;rng^=rng<<13;rng^=rng>>17;rng^=rng<<5;return (int)(rng%(uint)n);}
  public void Command(string json){
   InputCommand c;try{c=JsonUtility.FromJson<InputCommand>(json);}catch{ return; }
   if(c==null||string.IsNullOrEmpty(c.type))return;
   // Multiplayer: state-changing commands become tick-stamped ops (CarrotNetRules); local ones stay local.
   if(NetMode!=NetMode.None){if(DeferInput(()=>Command(json)))return;NetCommand(c.type,c.kind,c.selectionType,c.id,c.target,c.value);Publish();return;}
   switch(c.type){
    case "load":LoadLevel(c.level,c.mode);break;
    case "start":StartMatch();break;
    // Calling the next wave early pays for the breather seconds skipped (CarrotData.EarlyCallBonus).
    case "next":if(!paused)CallNext(NetSeat);break;
    case "preview":if(CarrotData.Tower(c.kind)!=null){PreviewKind=c.kind;Emit("preview",c.kind,Vector3.zero);}break;
    case "buy":Buy(c.kind);break;
    case "upgrade":Upgrade();break;
    case "sell":Sell();break;
    case "merge":Merge(c.id,c.target);break;
    case "mergeArm":{var t=towers.Find(x=>x.id==c.id);mergeArmed=t!=null&&t.tier==4&&Partners(t)>0?t.id:0;break;}
    case "mergeUndo":MergeUndo();break;
    case "pause":if(phase=="playing")SetPausedState(!paused);break;
    // Idempotent pause for modals and first-encounter cards (accepted in ready and playing).
    case "setPaused":SetPausedState(c.value>=.5f);break;
    case "speed":speed=c.value>=1.5f?2:1;break;
    case "select":Select(c.selectionType,c.id);break;
    case "clear":Select("",-1);break;
    case "mute":muted=c.value>0;var view=GetComponent<CarrotView>();if(view!=null)view.SetMuted(muted);break;
#if UNITY_EDITOR || DEVELOPMENT_BUILD || CARROT_QA
    case "debugEncounter":DebugEncounter(c.kind);break;
    case "debugMini":DebugMini(c.kind,c.route);break;
    case "debugCast":DebugCast(c.id,c.kind);break;
    case "debugGarden":DebugGarden(c.value>=.5f?1:0,c.tier);break;
    case "debugBossDamage":DebugBossDamage(c.value);break;
    case "debugCoins":if(CanManage()){coins=Mathf.Max(0,coins+Mathf.RoundToInt(c.value));}break;
#endif
   }
   Publish();
  }
  public void Select(string type,int id){
   if(DeferInput(()=>Select(type,id)))return;
   mergeArmed=0;
   if(type=="pad"){
    if(id<0||id>=level.pads.Length)return;
    var t=towers.Find(x=>x.pad==id);if(t!=null){type="tower";id=t.id;}
    else {var b=blockers.Find(x=>x.pad==id);if(b!=null){type="blocker";id=b.id;}}
   }
   if(type=="tower"&&towers.Find(x=>x.id==id)==null)return;
   if(type=="enemy"&&enemies.Find(x=>x.id==id&&x.alive)==null)return;
   if(type=="blocker"&&blockers.Find(x=>x.id==id)==null)return;
   if(type!="pad"&&type!="tower"&&type!="enemy"&&type!="blocker"){type="";id=-1;}
   // Two-player endless: focus is shared, so picking an enemy or blocker is an explicit focus op and a pad or tower is only this
   // player's selection. A duo half has one player: the single-player rule below applies and SetSelection sends the focus change.
   if(NetMode==NetMode.Lockstep&&(type=="enemy"||type=="blocker")){NetSelectFocus(type,id);Publish();return;}
   if((type=="enemy"||type=="blocker")&&selectionType==type&&selectionId==id)SetSelection("",-1);else SetSelection(type,id);
   Publish();
  }
  /// <summary>Every selection the simulation assigns goes through here. Single player mirrors it into the focus (an enemy or
  /// blocker focuses, anything else clears), which is exactly the old "towers prefer the selection" rule; in multiplayer the
  /// selection is local and the focus moves only through focus ops.</summary>
  void SetSelection(string type,int id){
   selectionType=type;selectionId=id;if(NetMode!=NetMode.None&&NetMode!=NetMode.DuoOwn)return;
   string ft=type=="enemy"||type=="blocker"?type:"";int fid=ft==""?-1:id;
   if(NetMode==NetMode.None){focusType=ft;focusId=fid;}else if(ft!=focusType||fid!=focusId)NetFocusOp(ft,fid);
  }
  /// <summary>Building, upgrading, merging and selling are allowed in prep and play, never on a frozen (held) duo half.</summary>
  bool CanManage(){return (phase=="ready"||phase=="playing")&&!DuoHold;}
  // ---- Selection-free entry points: the single-player commands resolve the selection and call these; multiplayer ops call them
  // directly. Each returns whether it changed the state; a refusal leaves a reason in LastReject (and a notice for the seat).
  // `select` moves the local selection the way the single-player command always has (net modes: only for the local seat's op,
  // and only while the player is still pointing at what the op acted on).
  public string LastReject {get;private set;}="";
  bool Refuse(string reason){LastReject=reason;return false;}
  void Buy(string kind){if(selectionType!="pad")return;BuyAt(selectionId,kind,NetSeat,true);}
  public bool BuyAt(int pad,string kind,int seat){return BuyAt(pad,kind,seat,false);}
  bool BuyAt(int p,string kind,int seat,bool select){
   var d=CarrotData.Tower(kind);if(!CanManage())return Refuse("phase");if(d==null||d.unlock>level.id)return Refuse("locked");
   if(p<0||p>=level.pads.Length||towers.Exists(x=>x.pad==p)||blockers.Exists(x=>x.pad==p))return Refuse("pad");
   if(coins<d.cost[0]){SeatNotice(seat,"More coins needed",1.6f);return Refuse("coins");}
   coins-=d.cost[0];var t=new TowerState{id=nextId++,kind=kind,pad=p,tier=1,spent=d.cost[0],position=level.pads[p],cooldown=.15f,lastShot=-20,builtAt=elapsed,builder=NetMode==NetMode.Lockstep?seat:-1};
   towers.Add(t);if(select)SetSelection("tower",t.id);Spent(seat,d.cost[0]);Emit("build",kind,t.position,id:t.id,tier:1,duration:.7f);return true;
  }
  void Upgrade(){if(!CanManage()||selectionType!="tower")return;UpgradeTower(selectionId,0,NetSeat);}
  /// <summary>fromTier &gt; 0 is a precondition (the tower must still be at that tier): two players upgrading the same tower in the
  /// same tick pay once, never twice.</summary>
  public bool UpgradeTower(int id,int fromTier,int seat){
   if(!CanManage())return Refuse("phase");var t=towers.Find(x=>x.id==id);if(t==null||t.tier>=4)return Refuse("tower");if(fromTier>0&&t.tier!=fromTier)return Refuse("tier");
   var d=CarrotData.Tower(t.kind);int cost=d.cost[t.tier];if(coins<cost){SeatNotice(seat,"More coins needed",1.6f);return Refuse("coins");}
   coins-=cost;t.spent+=cost;t.tier++;Spent(seat,cost);Emit("upgrade",t.kind,t.position,id:t.id,tier:t.tier,duration:.7f);return true;
  }
  void Sell(){if(!CanManage()||selectionType!="tower")return;var t=towers.Find(x=>x.id==selectionId);if(t==null)return;SellTower(t.id,0,NetSeat,true);}
  public bool SellTower(int id,int tier,int seat){return SellTower(id,tier,seat,false);}
  bool SellTower(int id,int tier,int seat,bool select){
   if(!CanManage())return Refuse("phase");var t=towers.Find(x=>x.id==id);if(t==null)return Refuse("tower");if(tier>0&&t.tier!=tier)return Refuse("tier");
   // Selling the tower an uproot telegraph has locked keeps 70% instead of the 55-60% refund: the save is judged.
   bool saved=false;foreach(var e in enemies)if(e.alive&&!string.IsNullOrEmpty(e.boss)){Actor a;if(actors.TryGetValue(e.id,out a)&&a.cast=="uproot"&&a.targets.Contains(t.id))saved=true;}
   int refund=Mathf.FloorToInt(t.spent*SellRate);coins+=refund;RemoveTower(t);Emit("sell",t.kind,t.position,id:t.id,tier:t.tier,value:refund);if(select)SetSelection("pad",t.pad);
   if(saved)Judge("saved",refund,t.position);
   if(NetMode==NetMode.Lockstep&&t.builder>=0&&t.builder!=seat)PartnerActed(seat,t.builder,"sold",t.kind,refund);
   return true;
  }
  void RemoveTower(TowerState t){towers.Remove(t);focusStates.Remove(t.id);auras.Remove(t.id);if(mergeArmed==t.id)mergeArmed=0;if(lastMerge!=null&&(lastMerge.targetId==t.id))lastMerge=null;if(selectionType=="tower"&&selectionId==t.id)SetSelection("",-1);}
  // Valid merge partners: other fully grown towers of the same kind.
  int Partners(TowerState t){if(t.tier!=4)return 0;int n=0;foreach(var o in towers)if(o.id!=t.id&&o.kind==t.kind&&o.tier==4)n++;return n;}
  // Super tier: free, created only by dragging a tier-4 tower onto another tier-4 of the same kind; the target keeps its pad and id.
  void Merge(int sourceId,int targetId){MergeTowers(sourceId,targetId,NetSeat,true);}
  public bool MergeTowers(int sourceId,int targetId,int seat){return MergeTowers(sourceId,targetId,seat,false);}
  bool MergeTowers(int sourceId,int targetId,int seat,bool select){
   if(!CanManage())return Refuse("phase");var source=towers.Find(x=>x.id==sourceId);var target=towers.Find(x=>x.id==targetId);
   if(source==null||target==null||source.id==target.id)return Refuse("tower");
   if(source.kind!=target.kind||source.tier!=4||target.tier!=4){SeatNotice(seat,"Only two fully grown "+CarrotData.Tower(source.kind).name+"s can merge",1.6f);return Refuse("tier");}
   lastMerge=new MergeRecord{sourceId=source.id,sourcePad=source.pad,sourceSpent=source.spent,targetId=target.id,seat=seat,at=elapsed,lastShot=target.lastShot,position=source.position};
   target.spent+=source.spent;target.mergedSpent=source.spent;target.tier=5;target.cooldown=.5f;
   towers.Remove(source);focusStates.Remove(source.id);auras.Remove(source.id);if(NetMode==NetMode.None||mergeArmed==source.id||mergeArmed==target.id)mergeArmed=0;
   if(select)SetSelection("tower",target.id);
   Emit("merge",target.kind,target.position,source.position,target.id,source.id,5,duration:.9f);
   SetNotice(CarrotData.Tower(target.kind).superName,2);Judge("superForged",5,target.position);
   if(NetMode==NetMode.Lockstep){if(source.builder>=0&&source.builder!=seat)PartnerActed(seat,source.builder,"merged",source.kind,0);else if(target.builder>=0&&target.builder!=seat)PartnerActed(seat,target.builder,"merged",target.kind,0);}
   return true;
  }
  // Undo within four seconds of game time, only while the Super has not fired and the freed pad is still empty.
  void MergeUndo(){MergeUndoBy(NetSeat,0,true);}
  /// <summary>Undo the last merge: only by the seat that made it, and (mergeTarget &gt; 0) only that merge.</summary>
  public bool MergeUndoBy(int seat,int mergeTarget){return MergeUndoBy(seat,mergeTarget,false);}
  bool MergeUndoBy(int seat,int mergeTarget,bool select){
   if(!CanManage())return Refuse("phase");if(lastMerge==null)return Refuse("merge");var m=lastMerge;if(m.seat!=seat||(mergeTarget>0&&m.targetId!=mergeTarget))return Refuse("merge");var target=towers.Find(x=>x.id==m.targetId);
   if(target==null||target.tier!=5||elapsed-m.at>4||target.lastShot!=m.lastShot||towers.Exists(x=>x.pad==m.sourcePad)||blockers.Exists(x=>x.pad==m.sourcePad)){return Refuse("merge");}
   target.tier=4;target.spent-=m.sourceSpent;target.mergedSpent=0;
   var source=new TowerState{id=m.sourceId,kind=target.kind,pad=m.sourcePad,tier=4,spent=m.sourceSpent,position=m.position,cooldown=.5f,lastShot=-20,builtAt=elapsed,builder=NetMode==NetMode.Lockstep?seat:-1};
   towers.Add(source);lastMerge=null;if(select)SetSelection("tower",source.id);
   Emit("mergeUndo",target.kind,target.position,source.position,target.id,source.id,4,duration:.5f);return true;
  }
  float MergeUndoLeft(){if(lastMerge==null)return 0;var t=towers.Find(x=>x.id==lastMerge.targetId);if(t==null||t.tier!=5||t.lastShot!=lastMerge.lastShot)return 0;return Mathf.Max(0,4-(elapsed-lastMerge.at));}
  void SetNotice(string value,float duration){notice=value;noticeUntil=elapsed+duration;noticeSeat=-1;}
  /// <summary>A notice for one seat only (a refused op is news to its issuer, not to the partner); global in single player.</summary>
  void SeatNotice(int seat,string value,float duration){SetNotice(value,duration);if(NetMode==NetMode.Lockstep)noticeSeat=seat;}
  void Emit(string type,string kind,Vector3 at,Vector3 to=default(Vector3),int id=0,int target=0,int tier=1,float value=0,float duration=0){if(silentRun)return;Effect?.Invoke(new CarrotEvent(type,kind,at,to,id,target,tier,value,duration));}

  void BeginWave(){
   if(wave>=level.waves)return;wave++;nextWave=0;waveStarted[wave]=true;waveStartedAt=elapsed;SetNotice(wave==level.waves?"Final wave":"Wave "+wave,2);
   // The shared CarrotData.PlanWave schedule (also exported to the web as levels[].wavePlan and shown as incoming).
   if(isEndless){EnsurePlan(wave);EnsurePlan(wave+1);wavePending[wave]=wavePlans[wave].Count;}
   var plan=wavePlans[wave];int firstRoute=plan.Count>0?plan[0].route:0;
   foreach(var p in plan)spawns.Add(new SpawnJob{at=elapsed+p.at,kind=p.kind,boss=p.boss,route=p.route,wave=wave});
   Emit("wave",level.biome,level.routes[Mathf.Max(0,firstRoute)][0],value:wave,duration:2);EmitIncoming(wave+1);Publish();
  }
  // Challenge levels gate waves on ordinary enemies only: the boss arrives mid-level and the remaining waves spawn as adds while it walks; the final wave still needs the boss, every add and every reserved summon dead.
  bool CurrentWaveResolved(){
   if(wave<=0||wavePending[wave]!=0||unresolvedContacts!=0)return false;
   if(!CarrotData.IsChallenge(level.id)||wave==level.waves)return waveLiving[wave]==0&&pendingSummons==0&&(!CarrotData.IsChallenge(level.id)||LivingBosses()==0);
   return waveLiving[wave]-waveBoss[wave]==0;
  }
  int LivingBosses(){int n=0;foreach(var e in enemies)if(e.alive&&!string.IsNullOrEmpty(e.boss))n++;return n;}

  // Public deterministic stepping lets Editor tests exercise exactly the shipped simulation.
  public void StepSimulation(float seconds){
   if(paused||phase!="playing")return;
   for(float left=seconds;left>0.00001f&&phase=="playing";){float dt=Mathf.Min(Step,left);Tick(dt);left-=dt;}
  }
  void Tick(float dt){
   elapsed+=dt;TickExpansion();if(elapsed>=noticeUntil)notice="";
   for(int i=spawns.Count-1;i>=0;i--)if(spawns[i].at<=elapsed){var s=spawns[i];spawns.RemoveAt(i);wavePending[s.wave]--;Spawn(s.kind,s.route,s.wave,false,0,bossId:s.boss);}
   // Walk a reusable scratch copy because boss summons can extend the authoritative enemy collection.
   walk.Clear();walk.AddRange(enemies);for(int i=0;i<walk.Count;i++)TickEnemy(walk[i],dt);
   for(int i=blockers.Count-1;i>=0;i--){var b=blockers[i];if(b.ownerEnemy<=0)continue;var owner=enemies.Find(x=>x.id==b.ownerEnemy&&x.alive);
    if(b.kind=="root"){if(owner==null||elapsed>=actors[b.ownerEnemy].activeUntil)ClearBlocker(b,false);else b.position=owner.position;}
    else if(owner==null)ClearBlocker(b,false);}
   for(int i=projectiles.Count-1;i>=0;i--){var p=projectiles[i];p.remaining-=dt;if(p.remaining<=0){projectiles.RemoveAt(i);ResolveProjectile(p);}}
   for(int i=burns.Count-1;i>=0;i--){var zone=burns[i];float alive=Mathf.Min(zone.remaining,dt);zone.remaining-=dt;zone.tick+=alive;
    if(zone.tick>=.25f||zone.remaining<=0){foreach(var e in enemies)if(Eligible(e,false)&&FlatDistance(e.position,zone.position)<=zone.radius)Damage(e,zone.dps*zone.tick,true,"burn",zone.source);zone.tick=0;}
    if(zone.remaining<=0)burns.RemoveAt(i);
   }
   foreach(var t in towers)TickTower(t,dt);
   for(int i=enemies.Count-1;i>=0;i--){var e=enemies[i];if(e.alive)continue;e.deadFor+=dt;
    if(actors.TryGetValue(e.id,out var a)&&a.contactEnd>0&&elapsed>=a.contactEnd){a.contactEnd=0;unresolvedContacts=Mathf.Max(0,unresolvedContacts-1);}
    if(e.deadFor>=.8f){enemies.RemoveAt(i);actors.Remove(e.id);}
   }
   for(int w=1;w<=wave;w++)if(waveStarted[w]&&!wavePaid[w]&&wavePending[w]==0&&waveLiving[w]==0){wavePaid[w]=true;int pay=WaveStipendHere(w);coins+=pay;TotalEarned+=pay;Emit("coins","wave",level.routes[0][level.routes[0].Length-1],value:pay);WaveCleared(w);EndlessWavePaid(w);}
   if(phase!="playing")return;
   if(CurrentWaveResolved()){
    // A networked duo half that clears holds, frozen, until the partner's half clears too (CarrotNetRules.EnterHold).
    if(wave==level.waves){if(DuoHolds())EnterHold();else SetOutcome(true);}
    else {if(nextWave<=0)nextWave=BreatherHere(wave+1);else {nextWave-=dt;if(nextWave<=0)BeginWave();}}
   }
   UpdateProgress();UpdateSpeedHold();
  }
  EnemyState Spawn(string kind,int route,int fromWave,bool summoned,float distance,bool clone=false,int owner=0,string bossId=null){
   bool boss=kind=="boss";string id=boss?(string.IsNullOrEmpty(bossId)?level.boss:bossId):kind;float hp=55,velocity=.9f;int reward=8;float armor=0,shield=0;
   switch(id){
    case "dash":hp=38;velocity=1.65f;reward=9;break;
    case "shell":hp=125;velocity=.62f;reward=15;armor=.4f;break;
    case "swarm":hp=24;velocity=1.08f;reward=4;break;
    case "moth":hp=65;velocity=1.1f;reward=11;break;
    case "shaman":hp=130;velocity=.7f;reward=18;break;
    case "burrow":hp=80;velocity=.9f;reward=12;break;
    case "crystal":hp=110;shield=70;velocity=.7f;reward=17;break;
    case "fragment":hp=90;velocity=.75f;reward=6;break;
    case "garden":velocity=.36f;reward=120;break;
    case "marsh":velocity=.32f;reward=180;break;
    case "frost":velocity=.3f;reward=250;break;
    case "orchard":velocity=.34f;reward=320;break;
    case "tornado":velocity=.26f;reward=200;break;
    case "zombie":velocity=.24f;reward=300;break;
    case "eyeball":velocity=.22f;reward=400;break;
    case "portal":velocity=.18f;reward=600;break;
    case "asuna":velocity=0;reward=650;break;
   }
   var added=CarrotData.Enemy(id);if(added!=null){hp=added.hp;velocity=added.speed;reward=added.reward;armor=added.armor;shield=added.shield;}
   if(clone&&id=="eyeball"){hp=240;velocity=.5f;shield=0;reward=0;}
   if(clone&&id=="asuna"){hp=75;velocity=.8f;shield=0;reward=0;}
   velocity*=CarrotData.MovementScale*(boss||isEndless?1:CarrotData.Pace(level.id));
   if(isEndless){
    // Endless: whole HP from the integer curve of the unit's own wave (CarrotEndlessGen); rewards grow to x1.6 by wave 41.
    int w=Mathf.Max(1,fromWave);bool mini=added!=null&&added.mini;int bonus=endlessBonus!=null&&w<endlessBonus.Length&&endlessBonus[w]>0?endlessBonus[w]:1000;
    if(boss)hp=CarrotEndlessGen.BossHp(id,w);else if(id!="fragment"){shield=CarrotEndlessGen.UnitHp(shield,w,mini,summoned,bonus);hp=CarrotEndlessGen.UnitHp(hp,w,mini,summoned,bonus);}
    reward=CarrotEndlessGen.Reward(reward,w);
   }
   else {
   if(!boss&&id!="fragment"){float scale=CarrotData.HPScale(level.id)*CarrotData.PressureScale(level.id)*CarrotData.OpeningScale(level.id,fromWave)*(summoned?1:CarrotData.WaveRamp(level.id,fromWave,added!=null&&added.mini))*(Veteran?1.1f:1);hp*=scale;shield*=scale;}
   // Bosses start from the authored base table; returning and new bosses past level 12 keep pace with the ordinary curve (BossScale is 1 on levels 1-12 and on a boss's home level).
   if(boss)hp=CarrotData.BossBaseHp(id)*CarrotData.BossScale(level.id,id)*CarrotData.BossPressure(level.id);
   }
   // On challenge levels summons belong to the wave that is current when they appear, so the next wave waits for them but not for the boss.
   if(summoned&&CarrotData.IsChallenge(level.id)&&wave>0)fromWave=wave;
   route=Mathf.Clamp(route,0,level.routes.Length-1);
   // Real summoned creatures pay a small bounty; illusions and already-paid resurrections never do.
   if(clone)reward=0;else if(summoned&&reward>0)reward=Mathf.Max(1,Mathf.FloorToInt(reward*.35f));
   var e=new EnemyState{id=nextId++,kind=id,boss=boss?id:"",route=route,hp=hp,maxHp=hp,shield=shield,maxShield=shield,speed=velocity,distance=distance,routeLength=CarrotData.RouteLength(level.routes[route]),air=id=="moth"||(added!=null&&added.air),summoned=summoned,reward=reward,hitAt=-10,phase=1,slowFactor=1};
   e.position=CarrotData.RoutePoint(level.routes[route],distance,out e.direction);enemies.Add(e);waveLiving[fromWave]++;if(boss)waveBoss[fromWave]++;
   var a=new Actor{wave=fromWave,baseSpeed=velocity,armor=armor,work=!summoned,healAt=elapsed+7,burrowAt=elapsed+7,abilityA=elapsed+(id=="marsh"?7:6),abilityB=elapsed+(id=="marsh"?12:11),abilityC=elapsed+12};
   actors[e.id]=a;InitExpansion(e,clone,owner);InitPrism(e);if(boss&&isEndless)Extra(e).bossBase=hp;
   if(boss){
    switch(id){
     case "garden":a.abilityD=elapsed+17;break;            // Root-Tear (uproot) from phase 2
     case "marsh":a.abilityD=elapsed+10;a.abilityE=elapsed+14;break; // Lantern Snuff (blind), Tithe from phase 2
     case "eyeball":a.abilityD=elapsed+9;a.abilityE=elapsed+8;break; // Blindness forms, Gaze
     case "zombie":a.abilityE=elapsed+15;break;            // Raise Dead; Uproot is set on the phase-2 entry
    }
    SetNotice(CarrotData.BossName(id),4);Emit("bossEnter",id,e.position,id:e.id,value:hp,duration:3);
   }
   else Emit("spawn",id,e.position,id:e.id);
   return e;
  }
  void TickEnemy(EnemyState e,float dt){
   if(!e.alive)return;var a=actors[e.id];e.age+=dt;
   if(e.hp<=0){ResolveEnemy(e,true);return;}
   if(!TickEnemyExpansion(e,a,dt))return;
   if(e.biteRemaining>0){e.biteRemaining-=dt;if(!a.contactApplied&&e.biteRemaining<=.32f){a.contactApplied=true;int bite=string.IsNullOrEmpty(e.boss)?1:CarrotData.IsChallenge(level.id)?10:3,lost=Mathf.Min(health,bite);health=Mathf.Max(0,health-bite);CarrotContacts++;RecordLeak(e,a,lost);Emit("carrotHit",e.kind,e.position,id:e.id,value:health,duration:.45f);ResolveEnemy(e,false);if(health==0)SetOutcome(false);}return;}
   if(!string.IsNullOrEmpty(e.boss))TickBoss(e,a,dt);
   if(!e.alive||phase!="playing")return;
   if(e.kind=="shaman"&&elapsed>=a.healAt){
    if(a.cast!="heal"){a.cast="heal";a.castEnd=elapsed+1;e.ability="heal";Emit("telegraph","heal",e.position,id:e.id,duration:1);}
    else if(elapsed>=a.castEnd){foreach(var ally in enemies)if(ally.id!=e.id&&ally.alive&&string.IsNullOrEmpty(ally.boss)&&!ally.hidden&&FlatDistance(e.position,ally.position)<=1.7f){float amount=Mathf.Min(ally.maxHp-ally.hp,ally.maxHp*.08f);ally.hp+=amount;if(amount>0)Emit("heal",ally.kind,ally.position,id:e.id,target:ally.id,value:amount,duration:.5f);}a.cast="";e.ability="";a.healAt=elapsed+7;}
   }
   if(e.kind=="burrow"){
    if(e.hidden&&elapsed>=a.emergeAt){e.hidden=false;e.ability="";a.burrowAt=elapsed+7;Emit("ability","emerge",e.position,id:e.id,duration:.3f);}
    if(!e.hidden&&e.routeLength-e.distance>4&&elapsed>=a.burrowAt){
     if(a.cast!="burrow"){a.cast="burrow";a.castEnd=elapsed+.7f;e.ability="burrow";Emit("telegraph","burrow",e.position,id:e.id,duration:.7f);}
     else if(elapsed>=a.castEnd){a.cast="";e.hidden=true;a.emergeAt=elapsed+1.8f;Emit("ability","burrow",e.position,id:e.id,duration:1.8f);}
    }
    if(e.routeLength-e.distance<=2)e.hidden=false;
   }
   // Straw Heap: the orchard boss walks on untargetable, then reappears at the end of the window or within two units of the carrot (the burrow rule).
   if(e.boss=="orchard"&&e.hidden&&(elapsed>=a.activeUntil||e.routeLength-e.distance<=2)){e.hidden=false;e.ability="";a.activeUntil=elapsed;e.abilityRemaining=0;Emit("ability","emerge",e.position,id:e.id,duration:.3f);}
   ExpireNativeShield(e,a);
   float slow=elapsed<e.slowUntil?e.slowFactor:1;e.speed=a.baseSpeed*slow;
   if(elapsed<e.rushUntil)e.speed*=a.rushMult;
   if(elapsed<a.stunUntil)e.speed=0;
   bool rewind=elapsed<a.rewindUntil&&string.IsNullOrEmpty(e.boss);
   if(e.boss=="asuna")MovePrismBoss(e,dt);
   else {e.distance=Mathf.Clamp(e.distance+e.speed*dt*(rewind?-1:1),0,e.routeLength);e.position=CarrotData.RoutePoint(level.routes[e.route],e.distance,out e.direction);if(rewind)e.direction=-e.direction;}
   if(elapsed<a.pullUntil){float blend=Mathf.Sin(Mathf.Clamp01((a.pullUntil-elapsed)/.65f)*Mathf.PI);Vector3 offset=a.pullCenter-e.position;e.position+=Vector3.ClampMagnitude(offset,1.1f)*blend*.75f;}
   if(!string.IsNullOrEmpty(e.boss))UpdateDeadline(e,a);
   if(e.distance>=e.routeLength){e.hidden=false;e.biteRemaining=.65f;e.ability="bite";unresolvedContacts++;a.contactEnd=elapsed+.65f;CancelCast(e,a);Emit("bite",e.kind,e.position,id:e.id,value:string.IsNullOrEmpty(e.boss)?1:CarrotData.IsChallenge(level.id)?10:3,duration:.65f);}
  }
  void ResolveEnemy(EnemyState e,bool killed){
   if(!e.alive)return;if(ExpansionDeath(e,killed))return;e.alive=false;e.deadFor=0;var a=actors[e.id];CancelCast(e,a);ResolvePrism(e,killed);
   waveLiving[a.wave]=Mathf.Max(0,waveLiving[a.wave]-1);if(!string.IsNullOrEmpty(e.boss))waveBoss[a.wave]=Mathf.Max(0,waveBoss[a.wave]-1);ResolvedEnemies++;if(a.work)resolvedWork+=string.IsNullOrEmpty(e.boss)?CarrotData.Work(e.kind):8;
   if(killed){coins+=e.reward;TotalEarned+=e.reward;statKills++;Emit("death",e.kind,e.position,id:e.id,value:e.reward,duration:.8f);
    // Raise Dead reads the newest twelve ordinary kills (kind, route, distance).
    if((level.boss=="zombie"||isEndless)&&string.IsNullOrEmpty(e.boss)&&!e.summoned){if(graves.Count>=12)graves.RemoveAt(0);graves.Add(new Grave{kind=e.kind,route=e.route,distance=e.distance});}}
   // The focus clears by rule (every peer at the same tick), then the selection: no focus op is ever sent from inside a tick.
   if(focusType=="enemy"&&focusId==e.id){focusType="";focusId=-1;}
   if(selectionType=="enemy"&&selectionId==e.id)SetSelection("",-1);
   for(int i=blockers.Count-1;i>=0;i--)if(blockers[i].ownerEnemy==e.id)ClearBlocker(blockers[i],false);
   if(gustBoss==e.id){gustBoss=0;gustUntil=0;}
   UpdateProgress();
  }
  static void Thresholds(string boss,out float p2,out float p3){
   switch(boss){
    case "garden":p2=.6f;p3=.25f;break;case "marsh":p2=.55f;p3=.25f;break;case "orchard":p2=.6f;p3=.3f;break;
    case "tornado":p2=.6f;p3=.25f;break;case "zombie":p2=.6f;p3=.3f;break;case "eyeball":p2=.65f;p3=.3f;break;
    default:p2=.65f;p3=.3f;break;
   }
  }
  void TickBoss(EnemyState e,Actor a,float dt){
   float fraction=e.hp/e.maxHp;float p2,p3;Thresholds(e.boss,out p2,out p3);int newPhase=fraction<=p3?3:fraction<=p2?2:1;
   if(newPhase>a.phase){
    int from=a.phase;a.phase=newPhase;e.phase=newPhase;Emit("ability","phase",e.position,id:e.id,value:newPhase,duration:.9f);ChainStep();Judge("phaseBreak",newPhase,e.position);
    if(from<2){
     // First phase-2 entry: arm the abilities that only begin once the boss is hurt.
     switch(e.boss){case "frost":a.abilityD=elapsed+8;break;case "orchard":a.abilityD=elapsed+5;break;case "tornado":a.abilityD=elapsed+4;break;case "zombie":a.abilityD=elapsed+5;break;}
    }
    if(newPhase==3){
     a.baseSpeed=e.boss=="asuna"?0:e.boss=="garden"?.48f:e.boss=="marsh"?.46f:e.boss=="orchard"?.46f:e.boss=="tornado"?.36f:e.boss=="zombie"?.34f:e.boss=="eyeball"?.32f:e.boss=="portal"?.28f:.42f;
     a.baseSpeed*=CarrotData.MovementScale;
     if(e.boss=="garden"){a.armorUntil=0;if(a.cast=="bark")CancelCast(e,a);}
     if(e.boss=="marsh"&&a.cast=="summon")CancelCast(e,a);
     if(e.boss=="frost"){e.shield=0;a.shieldUntil=0;ClearGrantedShield(e);if(a.cast=="mantle")CancelCast(e,a);a.abilityC=elapsed+3;}
     if(e.boss=="orchard"){if(a.cast=="heap"||a.cast=="flock")CancelCast(e,a);if(e.hidden){e.hidden=false;a.activeUntil=elapsed;e.abilityRemaining=0;Emit("ability","emerge",e.position,id:e.id,duration:.3f);}a.abilityA=Mathf.Min(a.abilityA,elapsed+3);a.abilityE=elapsed+2;}
    }
   }
   ExpireNativeShield(e,a);
   if(e.boss=="tornado"&&e.air&&elapsed>=a.liftUntil)e.air=false;
   e.abilityRemaining=Mathf.Max(0,a.activeUntil-elapsed);
   if(!string.IsNullOrEmpty(a.cast)){
    e.castRemaining=Mathf.Max(0,a.castEnd-elapsed);
    if(elapsed>=a.castEnd)CommitAbility(e,a);
    return;
   }
   e.castRemaining=0;if(elapsed<a.activeUntil)return;e.ability="";
   ScheduleBoss(e,a);
  }
  // Per-boss kits in priority order; an unregistered boss id is a test failure, not a silent no-op.
  void ScheduleBoss(EnemyState e,Actor a){
   if(e.boss=="asuna"){SchedulePrismBoss(e,a);return;}
   bool far=e.routeLength-e.distance>4,kits=true;
#if UNITY_EDITOR
   kits=!LegacyKits;
#endif
   if(kits&&ScheduleExpansionBoss(e,a))return;
   switch(e.boss){
    case "portal":break;
    case "garden":
     if(kits&&a.phase>=2&&elapsed>=a.abilityD&&a.uproots<(level.id==4?2:3)&&UprootReady(a))BeginCast(e,a,"uproot",level.id==4?2.4f:1.8f,0);
     else if(a.phase>=2&&elapsed>=a.abilityB&&towers.Count>0)BeginCast(e,a,"root",1.3f,3.5f);
     else if(a.phase<3&&elapsed>=a.abilityA)BeginCast(e,a,"bark",1.2f,5);
     break;
    case "marsh":
     if(a.phase==2&&elapsed>=a.abilityB&&a.bogCalls<3&&far)BeginCast(e,a,"summon",1.5f,0);
     else if(kits&&elapsed>=a.abilityD&&a.blinds<3)BeginCast(e,a,"blind",1.5f,a.phase==3?3.5f:3);
     else if(kits&&a.phase>=2&&elapsed>=a.abilityE&&a.tithes<2&&coins>0)BeginCast(e,a,"tithe",1.6f,0);
     else if(elapsed>=a.abilityA)BeginCast(e,a,"mist",1.4f,a.phase==3?3:5);
     break;
    case "frost":
     if(a.phase==3&&elapsed>=a.abilityC&&a.shatters<2&&far)BeginCast(e,a,"shatter",1.2f,0);
     else if(a.phase>=2&&elapsed>=a.abilityB&&towers.Count>0)BeginCast(e,a,"breath",1.5f,4);
     else if(kits&&a.phase>=2&&elapsed>=a.abilityD&&a.whiteouts<2)BeginCast(e,a,"whiteout",1.3f,2.5f);
     else if(a.phase<3&&elapsed>=a.abilityA&&a.mantles<3&&e.shield<=0)BeginCast(e,a,"mantle",1.5f,7);
     break;
    case "orchard":
     // Old Hollowhead: Dusk (phase 3, once) > Reap (phase 2+) > Flock (phase 2, three casts) > Straw Heap (phases 1-2, three casts) > Harvest Rush (always).
     if(kits&&a.phase==3&&elapsed>=a.abilityE&&a.dusks<1)BeginCast(e,a,"dusk",1.3f,3);
     else if(kits&&a.phase>=2&&elapsed>=a.abilityD&&a.uproots<3&&UprootReady(a))BeginCast(e,a,"uproot",1.8f,0);
     else if(a.phase==2&&elapsed>=a.abilityB&&a.flocks<3&&far)BeginCast(e,a,"flock",1.4f,0);
     else if(a.phase<3&&elapsed>=a.abilityC&&a.heaps<3&&far)BeginCast(e,a,"heap",.9f,2);
     else if(elapsed>=a.abilityA)BeginCast(e,a,"rush",1.2f,2.5f);
     break;
    case "tornado":
     if(a.phase>=2&&elapsed>=a.abilityD&&a.lifts<2)BeginCast(e,a,"liftoff",1.2f,4);
     else if(elapsed>=a.abilityA)BeginCast(e,a,"gust",1.1f,2.5f);
     break;
    case "zombie":
     if(a.phase>=2&&elapsed>=a.abilityD&&a.uproots<3&&UprootReady(a))BeginCast(e,a,"uproot",1.8f,0);
     else if(elapsed>=a.abilityE&&a.raises<4)BeginCast(e,a,"raise",1.5f,0);
     break;
    case "eyeball":
     if(elapsed>=a.abilityD&&a.blinds<6)BeginCast(e,a,"blind",1.8f,a.phase==3?3.5f:a.phase==2?3:2);
     else if(elapsed>=a.abilityE&&a.gazes<8&&towers.Count>0)BeginCast(e,a,"gaze",1.5f,a.phase==3?6:5);
     break;
    default:Debug.LogError("unknown boss kit "+e.boss);a.activeUntil=float.MaxValue;break;
   }
  }
  // Uproot only ever targets a tower that has stood for a second, has not been hit this fight, and never the player's only tower.
  bool UprootReady(Actor a){if(towers.Count<2)return false;foreach(var t in towers)if(elapsed-t.builtAt>=1&&!a.uprooted.Contains(t.id))return true;return false;}
  void BeginCast(EnemyState e,Actor a,string kind,float windup,float duration){
   // Telegraph floors: a cast that targets a tower or the purse winds up at least 2.5 s (held at 1x for bosses), any other at least 1.2 s.
   windup=Mathf.Max(windup,Actionable(kind)?ActionableWindup:PassiveWindup);
   a.cast=kind;a.castEnd=elapsed+windup;a.castTotal=windup;e.ability=kind;e.castRemaining=windup;a.targets.Clear();a.castHp=e.hp;
   if(kind=="root"||kind=="breath"||kind=="gaze"){
    candidates.Clear();candidates.AddRange(towers);candidates.Sort((x,y)=>Nearer(e.position,x,y));
    if(kind=="root"){foreach(var t in candidates)if(FlatDistance(e.position,t.position)<=4&&a.targets.Count<2)a.targets.Add(t.id);}
    else if(kind=="gaze"){
     // Gaze locks the highest-tier tower within 4.5 u (a Super first, ties nearest); two towers in phase 3.
     int want=a.phase==3?2:1;for(int tier=5;tier>=1&&a.targets.Count<want;tier--)foreach(var t in candidates)if(t.tier==tier&&FlatDistance(e.position,t.position)<=4.5f&&a.targets.Count<want)a.targets.Add(t.id);
    }
    else if(candidates.Count>0){a.castDirection=(candidates[0].position-e.position).normalized;foreach(var t in candidates){Vector3 delta=t.position-e.position;if(delta.magnitude<=3&&Vector3.Dot(a.castDirection,delta.normalized)>.72f&&a.targets.Count<3)a.targets.Add(t.id);}}
   }
   if(kind=="uproot"){
    // Shared "destroy a random plant" rule: candidates stood >= 1 s and were not hit yet; the pool is everything within 4.5 u of the boss (so the telegraph is on screen), else the single nearest.
    candidates.Clear();foreach(var t in towers)if(elapsed-t.builtAt>=1&&!a.uprooted.Contains(t.id))candidates.Add(t);
    candidates.Sort((x,y)=>Nearer(e.position,x,y));
    int picks=e.boss=="orchard"&&a.phase==3&&level.id==24?2:1;
    for(int n=0;n<picks&&candidates.Count>0;n++){
     int near=0;foreach(var t in candidates)if(FlatDistance(e.position,t.position)<=4.5f)near++;
     int pick=near>0?NextInt(near):0;var chosen=candidates[pick];a.targets.Add(chosen.id);candidates.RemoveAt(pick);
    }
   }
   if(kind=="summon"||kind=="shatter"||kind=="flock"||kind=="dusk"){a.reserved=3;pendingSummons+=3;}
   if(kind=="gust"){a.reserved=4;pendingSummons+=4;}
   if(kind=="raise"){a.reserved=a.phase==3?4:3;pendingSummons+=a.reserved;}
   PrepareExpansionCast(e,a,kind);
   PreparePrismCast(e,a,kind);
   Vector3 target=e.position;int targetId=0;if(a.targets.Count>0){var t=towers.Find(x=>x.id==a.targets[0]);if(t!=null){target=t.position;targetId=t.id;}}
   // Harvest Rush and Gust warn along the lane: the telegraph's `to` is the route point three units ahead.
   if(kind=="rush"||kind=="gust"){Vector3 ahead;target=CarrotData.RoutePoint(level.routes[e.route],Mathf.Min(e.routeLength,e.distance+3),out ahead);}
   if(kind=="prismDash"){Vector3 ahead;target=CarrotData.RoutePoint(level.routes[e.route],prism.warnedDashTo,out ahead);}
   Emit("telegraph",kind,e.position,target,e.id,targetId,duration:windup,value:duration);
   // Secondary target events add warnings without replaying the cast's source burst or audio.
   for(int i=1;i<a.targets.Count;i++){var t=towers.Find(x=>x.id==a.targets[i]);if(t!=null)Emit("telegraphTarget",kind,e.position,t.position,e.id,t.id,duration:windup,value:duration);}
  }
  void CancelCast(EnemyState e,Actor a){if(a.reserved>0){pendingSummons=Mathf.Max(0,pendingSummons-a.reserved);a.reserved=0;}a.cast="";e.castRemaining=0;}
  void ReleaseReserved(Actor a){pendingSummons=Mathf.Max(0,pendingSummons-a.reserved);a.reserved=0;}
  bool muting;
#if UNITY_EDITOR
  /// <summary>Editor tests only (invariant d): the one boss cast kind whose consequences are switched off.</summary>
  public static string MutedCast="";
  static bool Muted(string kind){return MutedCast!=""&&kind==MutedCast;}
#else
  static bool Muted(string kind){return false;}
#endif
  void StartBlind(float seconds,float tint,float alpha,float range){if(muting)return;blindKind=tint>0?"whiteout":"blind";blindUntil=elapsed+seconds;blindTint=tint;blindAlpha=alpha;blindRange=range;}
  void CommitAbility(EnemyState e,Actor a){
   // A second Herald may have begun its warning before the first one committed.
   // Recheck the global recovery at commit, then make the deferred Herald warn again.
   if(a.cast=="fieldFreeze"&&elapsed<freezeReady){CancelCast(e,a);e.ability="";Extra(e).next=freezeReady;return;}
   string kind=a.cast;a.cast="";e.castRemaining=0;float duration=0,value=0;Vector3 target=e.position;int targetId=0,tier=1;
   // Invariant (d) harness: a muted cast keeps its telegraph and cooldowns but changes nothing (editor tests only).
   muting=Muted(kind);if(muting)a.targets.Clear();
   bool extra=CommitPrism(e,a,kind,out duration,out value,out target,out targetId);
   if(!extra)extra=CommitExpansion(e,a,kind,out duration,out value,out target,out targetId);
   if(!extra)switch(kind){
    case "bark":duration=5;if(!muting)a.armorUntil=elapsed+duration;a.abilityA=elapsed+duration+14;break;
    case "root":
     duration=3.5f;foreach(int id in a.targets){var t=towers.Find(x=>x.id==id);if(t!=null){if(!Ward(t))t.slowFor=Mathf.Max(t.slowFor,duration);if(targetId==0){target=t.position;targetId=t.id;}}}
     if(a.targets.Count>0)blockers.Add(new BlockerState{id=nextId++,pad=-1,kind="root",position=e.position,hp=70,maxHp=70,ownerEnemy=e.id});
     a.abilityB=elapsed+duration+(a.phase==3?10:13);break;
    case "mist":duration=a.phase==3?3:5;if(!muting)a.veilUntil=elapsed+duration;a.abilityA=elapsed+duration+(a.phase>=2?14:16);break;
    case "summon":
     a.bogCalls++;for(int i=0;i<3&&!muting;i++)if(!SummonCapped(e))Spawn("nibble",e.route,a.wave,true,Mathf.Min(e.distance,Mathf.Max(0,e.routeLength-4)));
     ReleaseReserved(a);a.abilityB=elapsed+17;break;
    case "mantle":duration=7;a.mantles++;var ward=Extra(e);if(!muting){e.shield=360+ward.grantedShield;e.maxShield=e.shield;if(ward.grantUntil>0)ward.shieldMaxBefore=360;a.shieldUntil=elapsed+duration;}a.abilityA=elapsed+duration+18;break;
    case "breath":
     duration=4;foreach(int id in a.targets){var t=towers.Find(x=>x.id==id);if(t!=null){if(!Ward(t))t.disabledFor=Mathf.Max(t.disabledFor,duration);if(targetId==0){target=t.position;targetId=t.id;}}}
     a.abilityB=elapsed+duration+15;break;
    case "shatter":
     a.shatters++;for(int i=0;i<3&&!muting;i++)if(!SummonCapped(e))Spawn("fragment",e.route,a.wave,true,Mathf.Min(e.distance+.4f+i*.35f,Mathf.Max(0,e.routeLength-3)));
     ReleaseReserved(a);a.abilityC=elapsed+12;break;
    case "rush":
     // The boss charges at 2.2x for 2.5 s and rallies every ordinary ally within three units to 1.5x; slows and stuns still apply on top.
     duration=2.5f;if(!muting){e.rushUntil=elapsed+duration;a.rushMult=2.2f;}Vector3 dir;target=CarrotData.RoutePoint(level.routes[e.route],Mathf.Min(e.routeLength,e.distance+3),out dir);
     foreach(var ally in enemies)if(!muting&&ally.id!=e.id&&ally.alive&&string.IsNullOrEmpty(ally.boss)&&FlatDistance(e.position,ally.position)<=3){ally.rushUntil=elapsed+duration;actors[ally.id].rushMult=1.5f;}
     a.abilityA=elapsed+duration+(a.phase==3?9:14);break;
    case "flock":
     a.flocks++;for(int i=0;i<3&&!muting;i++)if(!SummonCapped(e))Spawn("moth",e.route,a.wave,true,Mathf.Min(e.distance+.3f*i,Mathf.Max(0,e.routeLength-4)));
     ReleaseReserved(a);a.abilityB=elapsed+16;break;
    case "heap":
     duration=2;a.heaps++;if(!muting)e.hidden=true;a.abilityC=elapsed+duration+15;break;
    // Blindness (boss-agnostic): full dark on the Lantern Regent and Old Hollowhead's Dusk; the Unknown Eyeball's three forms shorten when it is hurt during the windup.
    case "blind":{
     a.blinds++;float seconds,alpha,range;
     if(e.boss=="eyeball"){seconds=a.phase==3?3.5f:a.phase==2?3:2;alpha=a.phase==3?.92f:a.phase==2?.85f:.55f;range=a.phase==1?.8f:.6f;a.castShave=Mathf.Max(0,a.castHp-e.hp)/(e.maxHp*.04f);seconds=Mathf.Max(1.2f,seconds-a.castShave);a.abilityD=elapsed+(a.phase==3?14:20);SetNotice("The eye opens",2);}
     else {seconds=a.phase==3?3.5f:3;alpha=.985f;range=.6f;a.abilityD=elapsed+22;SetNotice("The lanterns gutter",2);}
     StartBlind(seconds,0,alpha,range);duration=.6f;value=seconds;break;}
    case "whiteout":
     // Crown of Winter: a white frost vignette; every projectile in flight hangs for 0.6 s.
     a.whiteouts++;StartBlind(2.5f,1,.85f,.6f);foreach(var p in projectiles)if(!muting)p.remaining+=.6f;a.abilityD=elapsed+20;duration=2.5f;value=2.5f;SetNotice("Whiteout",2);break;
    case "dusk":
     // Old Hollowhead's phase-3 Dusk: three seconds of dark and three summoned crows that block victory.
     a.dusks++;StartBlind(3,0,.985f,.6f);for(int i=0;i<3&&!muting;i++)if(!SummonCapped(e))Spawn("moth",e.route,a.wave,true,Mathf.Min(e.distance+.3f*i,Mathf.Max(0,e.routeLength-4)));
     ReleaseReserved(a);duration=.6f;value=3;SetNotice("Dusk falls",2);break;
    case "uproot":{
     // One shared commit path (Brambleback, Old Hollowhead, the Zombie): a Super is demoted to tier 4, anything else is torn out with a refund; selling before the commit already removed the target.
     a.uproots++;float refundRate=level.id==4?.6f:.55f;int refunded=0;
     foreach(int id in a.targets){var t=towers.Find(x=>x.id==id);if(t==null)continue;a.uprooted.Add(t.id);int refund,eventTier=t.tier;
      if(t.tier==5){refund=Mathf.FloorToInt(t.mergedSpent*.55f);t.spent-=t.mergedSpent;t.mergedSpent=0;t.tier=4;if(lastMerge!=null&&lastMerge.targetId==t.id)lastMerge=null;}
      else {refund=Mathf.FloorToInt(t.spent*refundRate);RemoveTower(t);
       if(e.boss=="zombie"){float hp=70*2.25f;blockers.Add(new BlockerState{id=nextId++,pad=t.pad,kind="grave",position=t.position,hp=hp,maxHp=hp,reward=0,ownerEnemy=e.id});}}
      coins+=refund;TotalEarned+=refund;refunded+=refund;
      if(targetId==0){target=t.position;targetId=t.id;tier=eventTier;}else Emit("abilityTarget",kind,e.position,t.position,e.id,t.id,eventTier,refund,.45f);
     }
     value=refunded;duration=.45f;a.abilityD=elapsed+(e.boss=="garden"?22:18);break;}
    case "tithe":{
     // The Regent takes max(30, 20 % of the purse), or everything under 30; spending before the commit shrinks it.
     a.tithes++;int amount=muting?0:coins<30?coins:Mathf.Max(30,Mathf.FloorToInt(coins*.2f));coins-=amount;value=amount;a.abilityE=elapsed+18;SetNotice("The Regent takes its tithe",2);duration=.6f;break;}
    case "gust":
     // Giant Tornado: for 2.5 s every projectile except mortar, burn and thunder that hits within 3 u of the funnel deals half; four debris swarms lift off ahead of it.
     a.gusts++;duration=2.5f;if(!muting){gustBoss=e.id;gustUntil=elapsed+duration;}for(int i=0;i<4&&!muting;i++)if(!SummonCapped(e))Spawn("swarm",e.route,a.wave,true,Mathf.Min(e.distance+.5f*i,Mathf.Max(0,e.routeLength-3)));
     ReleaseReserved(a);a.abilityA=elapsed+duration+(a.phase==3?8:12);Vector3 gustDir;target=CarrotData.RoutePoint(level.routes[e.route],Mathf.Min(e.routeLength,e.distance+3),out gustDir);value=3;break;
    case "liftoff":
     a.lifts++;duration=4;if(!muting){e.air=true;a.liftUntil=elapsed+duration;e.rushUntil=elapsed+duration;a.rushMult=1.3f;}a.abilityD=elapsed+duration+20;value=.6f;break;
    case "raise":{
     // Raise Dead: the newest recorded kills return at the zombie's position with full health as a slow horde around it.
     a.raises++;int want=a.phase==3?4:3;var pick=new List<Grave>();
     for(int pass=0;pass<2&&pick.Count<want;pass++)for(int i=graves.Count-1;i>=0&&pick.Count<want;i--){var g=graves[i];bool elite=g.kind=="shell"||g.kind=="crystal"||g.kind=="shaman";if((pass==0)==elite&&!pick.Contains(g))pick.Add(g);}
     foreach(var g in pick)graves.Remove(g);
     for(int i=0;i<want&&!muting;i++){if(SummonCapped(e))continue;var raised=Spawn(i<pick.Count?pick[i].kind:"nibble",e.route,a.wave,true,e.distance);if(i<pick.Count)raised.reward=0;actors[raised.id].baseSpeed=.34f*CarrotData.MovementScale;raised.speed=actors[raised.id].baseSpeed;Emit("abilityTarget",kind,e.position,raised.position,e.id,raised.id,duration:.6f);}
     ReleaseReserved(a);a.abilityE=elapsed+(a.phase==3?10:15);value=want;duration=.6f;break;}
    case "gaze":{
     // Gaze stuns the locked tower fully (rate 0, unlike Breath's half cadence).
     a.gazes++;duration=a.phase==3?6:5;foreach(int id in a.targets){var t=towers.Find(x=>x.id==id);if(t!=null){if(!Ward(t))t.stunnedFor=Mathf.Max(t.stunnedFor,duration);if(targetId==0){target=t.position;targetId=t.id;}}}
     a.abilityE=elapsed+13;value=duration;duration=.6f;break;}
   }
   muting=false;a.activeUntil=elapsed+duration;e.ability=kind;e.abilityRemaining=duration;
   Emit("ability",kind,e.position,target,e.id,targetId,tier,value,Mathf.Max(.6f,duration));
   if(kind=="root"||kind=="breath"||kind=="gaze")foreach(int id in a.targets)if(id!=targetId){var t=towers.Find(x=>x.id==id);if(t!=null)Emit("abilityTarget",kind,e.position,t.position,e.id,t.id,duration:duration);}
  }
  // Lit towers keep full sight in the dark: the light tower, a tower under a live Sun Blossom aura, or a tower on a lantern pad.
  bool Lit(TowerState t){
   if(t.kind=="prism"||t.kind=="moonflower")return true;
   if(auras.TryGetValue(t.id,out var aura)&&elapsed<aura.until)return true;
   foreach(int pad in LitPadsHere())if(pad==t.pad)return true;
   return false;
  }
  void TickTower(TowerState t,float dt){
   TickTowerExpansion(t);
   t.slowFor=Mathf.Max(0,t.slowFor-dt);t.disabledFor=Mathf.Max(0,t.disabledFor-dt);t.stunnedFor=Mathf.Max(0,t.stunnedFor-dt);t.buff=0;
   if(auras.TryGetValue(t.id,out var aura)&&elapsed<aura.until)t.buff=aura.strength;
   if(t.stunnedFor>0)return;
   float rate=(t.disabledFor>0?.5f:t.slowFor>0?.6f:1)*(1+t.buff);t.cooldown-=dt*rate;if(t.cooldown>0)return;
   var d=CarrotData.Tower(t.kind);int tier=t.tier-1;float range=d.range[tier];EnemyState target=null;BlockerState obstacle=null;
   if(elapsed<blindUntil&&!Lit(t))range*=blindRange;
   if(focusType=="enemy"){var focused=enemies.Find(x=>x.id==focusId);if(Eligible(focused,d.air)&&FlatDistance(t.position,focused.position)<=range)target=focused;}
   if(focusType=="blocker"){var focused=blockers.Find(x=>x.id==focusId);if(focused!=null&&FlatDistance(t.position,focused.position)<=range)obstacle=focused;}
   if(target==null&&obstacle==null){
    // First in line: the eligible enemy with the least route left to the carrot (ties keep list order).
    float best=float.MaxValue;foreach(var e in enemies)if(Eligible(e,d.air)&&FlatDistance(t.position,e.position)<=range){float left=TargetKey(e);if(left<best){best=left;target=e;}}
   }
   if(target==null&&obstacle==null)return;
   Vector3 point=target!=null?target.position:obstacle.position;t.aim=point;t.lastShot=elapsed;t.cooldown=d.interval[tier];
   float output=(t.weakenUntil>elapsed?t.weakenFactor:1)*Crowding(t.kind);
   if(FireExpansion(t,target,range,d.damage[tier]*output))return;
   if(t.kind=="starfruit"&&target!=null){
    var hits=new List<EnemyState>();foreach(var e in enemies)if(Eligible(e,true)&&FlatDistance(t.position,e.position)<=range)hits.Add(e);
    SortTargets(hits,focusType=="enemy"?target.id:-1);
    // Fairness pass (polish): 3/3/4/5 stars (Constellation six) with a little falloff past the first two targets (100/90/75%)
    // and a 40% returning star: Starfruit stays the crowd answer, without being the whole plan (see Crowding below).
    int cap=StarfruitTargets[tier];for(int i=0;i<Mathf.Min(cap,hits.Count);i++)Launch(t,hits[i].id,hits[i].position,d.damage[tier]*output*(i==0?1:i==1?.9f:.75f),false);
   }else if(t.kind=="thunder"&&target!=null){
    var targets=new List<EnemyState>();foreach(var e in enemies)if(Eligible(e,true)&&FlatDistance(t.position,e.position)<=range)targets.Add(e);SortTargets(targets,focusType=="enemy"?target.id:-1);
    int cap=tier>=4?4:3;for(int i=0;i<Mathf.Min(cap,targets.Count);i++)Launch(t,targets[i].id,targets[i].position,d.damage[tier]*output,false);
   }else{
    float amount=d.damage[tier]*output;if(t.kind=="prism"&&target!=null){if(!focusStates.TryGetValue(t.id,out var focus)){focus=new FocusState();focusStates[t.id]=focus;}if(focus.target!=target.id){focus.target=target.id;focus.hits=0;}float ramp=tier>=4?Mathf.Min(.8f,focus.hits*.2f):Mathf.Min(.5f,focus.hits*(.1f+tier*.025f));amount*=1+ramp;focus.hits++;Emit("ability","prismFocus",t.position,target.position,t.id,target.id,t.tier,ramp,.2f);}
    Launch(t,target!=null?target.id:-obstacle.id,point,amount,false);
    // Harvest Cannon: a second seed at the next-best eligible target for half damage (it does not add marks).
    if(t.kind=="seed"&&tier>=4&&target!=null){EnemyState second=null;float best=float.MaxValue;foreach(var e in enemies)if(e.id!=target.id&&Eligible(e,d.air)&&FlatDistance(t.position,e.position)<=range){float left=TargetKey(e);if(left<best){best=left;second=e;}}
     if(second!=null)Launch(t,second.id,second.position,amount*.5f,true);}
   }
  }
  static bool Eligible(EnemyState e,bool air){return e!=null&&e.alive&&!e.hidden&&e.biteRemaining<=0&&(!e.air||air);}
  // A total order (focused first, then least route left, then id) so every runtime's sort agrees.
  static void SortTargets(List<EnemyState> targets,int focusedId){targets.Sort((a,b)=>{if(a.id==b.id)return 0;if(a.id==focusedId)return -1;if(b.id==focusedId)return 1;int c=TargetKey(a).CompareTo(TargetKey(b));return c!=0?c:a.id.CompareTo(b.id);});}
  // Lower is first in line: route units left (pass 2) or, before it, the negated route fraction.
  static float TargetKey(EnemyState e){return CarrotData.RemainingTargeting?e.routeLength-e.distance:-(e.distance/Mathf.Max(1,e.routeLength));}
  static int Nearer(Vector3 from,TowerState x,TowerState y){int c=FlatDistance(from,x.position).CompareTo(FlatDistance(from,y.position));return c!=0?c:x.id.CompareTo(y.id);}
  static float FlatDistance(Vector3 a,Vector3 b){float x=a.x-b.x,z=a.z-b.z;return Mathf.Sqrt(x*x+z*z);}
  void Launch(TowerState t,int target,Vector3 to,float damage,bool returning){
   float travel=t.kind=="prism"?.16f:t.kind=="storm"?.14f:t.kind=="blossom"?.2f:t.kind=="thunder"?.7f:Mathf.Clamp(FlatDistance(t.position,to)/10,.18f,.7f);
   if(t.kind=="mortar")travel=.65f;
   if(t.kind=="dragonfruit"){travel=.95f;Emit("telegraph","meteor",to,to,t.id,target,t.tier,duration:travel);}
   projectiles.Add(new Projectile{kind=t.kind,source=t.id,target=target,tier=t.tier,damage=damage,remaining=travel,position=t.position,to=to,returning=returning});
   Emit("shot",t.kind,t.position,to,t.id,target,t.tier,damage,travel);
  }
  /// <summary>Crowded soil (polish fairness pass): plants of one kind share their soil. The first three of a family fight at full
  /// strength; each one past the third costs every plant of that family 10% of its damage, down to 60% (a Super counts as one plant).
  /// One family alone no longer clears the campaign, while any mixed garden (every reference bot's) is untouched.</summary>
  public static float CrowdingFor(int count){return count<=3?1f:Mathf.Max(.4f,1f-.12f*(count-3));}
  public int FamilyCount(string kind){int n=0;for(int i=0;i<towers.Count;i++)if(towers[i].kind==kind)n++;return n;}
  float Crowding(string kind){return CrowdingFor(FamilyCount(kind));}
  static readonly int[] StarfruitTargets={3,3,4,5,6};const float StarReturn=.4f;
  static readonly float[] MortarRadius={.75f,.9f,1.05f,1.2f,1.5f},FrostRadius={0,.45f,.6f,.8f,1.05f},FrostSlow={.3f,.36f,.42f,.48f,.5f};
  void ResolveProjectile(Projectile p){
   var target=p.target>0?enemies.Find(x=>x.id==p.target):null;
   var obstacle=p.target<0?blockers.Find(x=>x.id==-p.target):null;
   int tier=p.tier-1;var def=CarrotData.Tower(p.kind);
   if(ResolveExpansionProjectile(p,target,obstacle))return;
   if(p.kind=="mortar"){
    float radius=MortarRadius[tier],inner=tier>=4?.65f:.5f;
    foreach(var e in enemies)if(Eligible(e,false)){float d=FlatDistance(e.position,p.to);if(d<=radius)Damage(e,p.damage*(d<=radius*inner?1:.65f),false,p.kind,p.source);}
    if(obstacle!=null)DamageBlocker(obstacle,p.damage,p.kind,p.source);
    burns.Add(new BurnZone{source=p.source,tier=p.tier,position=p.to,radius=radius,dps=p.damage*(.1f+tier*.02f),remaining=2});
    Emit("ability","burn",p.to,p.to,p.source,p.target,p.tier,radius,2);
    Emit("impact",p.kind,p.to,p.to,p.source,p.target,p.tier,p.damage,.65f);return;
   }
   if(p.kind=="blossom"){
    foreach(var e in enemies)if(Eligible(e,false)&&FlatDistance(e.position,p.position)<=def.range[tier])Damage(e,p.damage,true,p.kind,p.source);
    for(int i=blockers.Count-1;i>=0;i--){var b=blockers[i];if(FlatDistance(b.position,p.position)<=def.range[tier])DamageBlocker(b,p.damage*.5f,p.kind,p.source);}
    float strength=tier>=4?.3f:.1f+tier/3f*.1f,hold=tier>=4?4:3,reach=tier>=4?1.2f:.8f;foreach(var t in towers)if(t.id!=p.source&&FlatDistance(t.position,p.position)<=def.range[tier]+reach){if(!auras.TryGetValue(t.id,out var aura)){aura=new Aura();auras[t.id]=aura;}if(aura.until<elapsed||strength>=aura.strength){aura.strength=strength;aura.until=elapsed+hold;}}
    Emit("ability","blossomBuff",p.position,p.position,p.source,tier:p.tier,value:strength,duration:hold);
    Emit("impact",p.kind,p.position,p.position,p.source,p.target,p.tier,def.range[tier],.55f);return;
   }
   if(obstacle!=null){DamageBlocker(obstacle,p.damage*(p.kind=="frost"?.25f:1),p.kind,p.source);Emit("impact",p.kind,p.to,p.to,p.source,p.target,p.tier,p.damage,.35f);return;}
   if(!Eligible(target,def.air))return;
   Vector3 hit=target.position;
   if(p.kind=="storm"){
    var struck=new HashSet<int>();EnemyState current=target;float damage=p.damage;int count=tier<2?3:tier+2;float falloff=tier>=4?.85f:.8f;
    for(int hop=0;hop<count&&current!=null;hop++){
     Vector3 at=current.position;struck.Add(current.id);Damage(current,damage,true,p.kind,p.source);actors[current.id].conductiveUntil=elapsed+2.5f+tier*.5f;Emit("ability","conductive",at,at,p.source,current.id,p.tier,.15f,2.5f+tier*.5f);
     Emit("impact",p.kind,at,at,p.source,current.id,p.tier,damage,.3f);
     EnemyState next=null;float best=1.5f+tier*.1f;foreach(var e in enemies)if(Eligible(e,true)&&!struck.Contains(e.id)){float d=FlatDistance(e.position,at);if(d<best){best=d;next=e;}}
     if(next!=null)Emit("shot",p.kind,at,next.position,p.source,next.id,p.tier,damage*falloff,.12f);
     current=next;damage*=falloff;
    }
    return;
   }
   if(p.kind=="gravity"){
    float radius=1.1f+tier*.2f,pull=tier>=4?1:.35f+tier*.15f;foreach(var e in enemies)if(Eligible(e,false)&&FlatDistance(e.position,hit)<=radius){Damage(e,p.damage,true,p.kind,p.source);ApplySlow(e,.3f+tier*.05f,2.2f);var actor=actors[e.id];if(e.alive&&string.IsNullOrEmpty(e.boss)&&elapsed>=actor.gravityReady){e.distance=Mathf.Max(0,e.distance-pull);actor.gravityReady=elapsed+4;actor.pullCenter=hit;actor.pullUntil=elapsed+.65f;}}
    Emit("ability","gravity",hit,hit,p.source,p.target,p.tier,radius,1.2f);
   }else if(p.kind=="thunder"){
    Damage(target,p.damage,true,p.kind,p.source);
    if(string.IsNullOrEmpty(target.boss)&&target.alive)actors[target.id].stunUntil=elapsed+(tier>=4?.35f:.2f);
   }else if(p.kind=="frost"){
    float radius=FrostRadius[tier];
    foreach(var e in enemies)if(Eligible(e,false)&&(e.id==target.id||(radius>0&&FlatDistance(e.position,hit)<=radius))){Damage(e,p.damage,true,p.kind,p.source);ApplySlow(e,FrostSlow[tier],1.6f+tier*.2f);var actor=actors[e.id];if(e.alive&&string.IsNullOrEmpty(e.boss)&&elapsed>=actor.freezeAt){float hold=tier>=4?1:.4f+tier*.08f;actor.stunUntil=Mathf.Max(actor.stunUntil,elapsed+hold);actor.freezeAt=elapsed+4.5f;Emit("ability","crystallize",e.position,e.position,p.source,e.id,p.tier,0,hold);}}
   }else{
    Damage(target,p.damage,p.kind=="prism"||p.kind=="book",p.kind,p.source);
    if(p.kind=="seed"&&!p.returning&&target.alive){var a=actors[target.id];a.seedMarks++;if(a.seedMarks>=3&&elapsed>=a.seedBurstAt){a.seedMarks=0;a.seedBurstAt=elapsed+1.2f;Damage(target,p.damage*(.45f+Mathf.Min(tier,3)*.1f),false,"seedBurst",p.source);EnemyState bounce=null;float best=1.7f+tier*.1f;foreach(var e in enemies)if(e.id!=target.id&&Eligible(e,true)){float distance=FlatDistance(hit,e.position);if(distance<best){best=distance;bounce=e;}}if(bounce!=null){Damage(bounce,p.damage*.5f,false,"seedBurst",p.source);Emit("shot","seed",hit,bounce.position,p.source,bounce.id,p.tier,p.damage*.5f,.16f);}Emit("ability","seedBurst",hit,hit,p.source,target.id,p.tier,0,.4f);}}
    if(p.kind=="book"&&target.alive){var a=actors[target.id];if(string.IsNullOrEmpty(target.boss)&&elapsed>=a.rewindReady){Rewind(target,a,p);
      // Grimoire: the rune also catches the nearest other ordinary enemy within 0.8 u.
      if(tier>=4){EnemyState other=null;float best=.8f;foreach(var e in enemies)if(e.id!=target.id&&Eligible(e,true)&&string.IsNullOrEmpty(e.boss)){float d=FlatDistance(hit,e.position);if(d<best){best=d;other=e;}}if(other!=null&&elapsed>=actors[other.id].rewindReady)Rewind(other,actors[other.id],p);}
     }else if(!string.IsNullOrEmpty(target.boss))ApplySlow(target,.1f,.8f);}
    if(p.kind=="starfruit"&&!p.returning&&target.alive){
     projectiles.Add(new Projectile{kind=p.kind,source=p.source,target=p.target,tier=p.tier,damage=p.damage*StarReturn,remaining=.3f,position=p.position,to=hit,returning=true});
     Emit("shot",p.kind,hit,p.position,p.source,p.target,p.tier,p.damage*StarReturn,.3f);
    }
   }
   Emit("impact",p.kind,hit,hit,p.source,p.target,p.tier,p.damage,.45f);
  }
  void Rewind(EnemyState target,Actor a,Projectile p){a.rewindUntil=elapsed+1;a.rewindReady=elapsed+6;Vector3 direction;Vector3 end=CarrotData.RoutePoint(level.routes[target.route],Mathf.Max(0,target.distance-a.baseSpeed),out direction);Emit("ability","rewind",target.position,end,p.source,target.id,p.tier,1,1);}
  void ApplySlow(EnemyState e,float amount,float duration){
   if(!e.alive)return;amount=Mathf.Min(amount,string.IsNullOrEmpty(e.boss)?.5f:.2f);float factor=1-amount;
   if(elapsed>=e.slowUntil){e.slowFactor=factor;e.slowUntil=elapsed+duration;}
   else if(factor<e.slowFactor){e.slowFactor=factor;e.slowUntil=elapsed+duration;}
   else if(Mathf.Abs(factor-e.slowFactor)<.001f)e.slowUntil=Mathf.Max(e.slowUntil,elapsed+duration);
  }
  void Damage(EnemyState e,float amount,bool elemental,string kind,int source){
   if(!e.alive||e.hidden||e.biteRemaining>0)return;var a=actors[e.id];
   if(elemental&&(kind=="storm"||kind=="thunder")&&elapsed<a.conductiveUntil)amount*=1.15f;
   var extra=Extra(e);if(elapsed<extra.exposedUntil&&elapsed>=a.armorUntil)amount*=1+extra.exposed;
   if(!elemental){float armor=a.armor;if(elapsed<a.armorUntil)armor=Mathf.Max(armor,e.kind=="ironSnail"?.7f:.35f);if(elapsed<extra.shredUntil)armor=Mathf.Max(0,armor-extra.shred);amount*=1-armor;}
   // Gust: light projectiles lose half their bite within three units of the funnel; the mortar's committed impact, burning ground and Thunderhead ignore it.
   if(gustBoss>0&&elapsed<gustUntil&&kind!="mortar"&&kind!="burn"&&kind!="thunder"){var funnel=enemies.Find(x=>x.id==gustBoss&&x.alive);if(funnel!=null&&FlatDistance(e.position,funnel.position)<=3)amount*=.5f;}
   // Veils: ordinary allies near the Lantern Regent's mist (30 %, while active) or the Zombie (25 %, always) take less damage.
   if(string.IsNullOrEmpty(e.boss))foreach(var boss in enemies)if(boss.alive&&!string.IsNullOrEmpty(boss.boss)){
    if(boss.boss=="marsh"&&actors[boss.id].veilUntil>elapsed&&FlatDistance(e.position,boss.position)<=1.7f){amount*=.7f;break;}
    if(boss.boss=="zombie"&&FlatDistance(e.position,boss.position)<=2){amount*=.75f;break;}
   }
   float oldShield=e.shield,hpDamage=amount,hpBefore=e.hp,soaked=0;
   if(oldShield>0){float absorbed=Mathf.Min(oldShield,amount);e.shield-=absorbed;ConsumeGrantedShield(e,absorbed);hpDamage=amount-absorbed;soaked=absorbed;if(kind=="prism"||kind=="moonflower")hpDamage+=amount*.25f;}
   e.hp=Mathf.Max(0,e.hp-hpDamage);e.hitAt=elapsed;CreditDamage(source,kind,soaked+(hpBefore-e.hp));
   Emit("hit",kind,e.position,e.position,source,e.id,value:amount,duration:.16f);
   if(oldShield>0&&e.shield<=0){Emit("ability","shieldBreak",e.position,id:e.id,duration:.45f);if(e.kind=="crystal"){a.baseSpeed=1.2f*CarrotData.MovementScale;a.stunUntil=elapsed+.35f;}}
   if(e.hp<=0)ResolveEnemy(e,true);
  }
  void DamageBlocker(BlockerState b,float damage,string kind,int source){
   if(b==null||b.hp<=0)return;b.hp=Mathf.Max(0,b.hp-damage);Emit("hit",kind,b.position,b.position,source,-b.id,value:damage,duration:.12f);if(b.hp<=0)ClearBlocker(b,true);
  }
  void ClearBlocker(BlockerState b,bool reward){
   if(!blockers.Remove(b))return;if(reward){coins+=b.reward;TotalEarned+=b.reward;}
   if(b.kind=="root")foreach(var t in towers)t.slowFor=0;
   if(focusType=="blocker"&&focusId==b.id){focusType="";focusId=-1;}
   if(selectionType=="blocker"&&selectionId==b.id)SetSelection("",-1);
   Emit("clear",b.kind,b.position,id:b.id,value:reward?b.reward:0,duration:.6f);
  }
  void UpdateProgress(){
   if(isEndless){UpdateEndlessProgress();return;}
   if(level.id==29){var guardian=enemies.Find(e=>e.boss=="asuna");progress=phase=="won"?1:prism!=null&&prism.defeated?.99f:guardian==null?0:guardian.alive?Mathf.Clamp01((1-guardian.hp/guardian.maxHp)*.97f):.99f;return;}
   float done=resolvedWork;foreach(var e in enemies)if(e.alive&&!string.IsNullOrEmpty(e.boss)&&actors[e.id].work)done+=8*(e.boss=="eyeball"?Mathf.Clamp01(((e.stage==1?0:e.stage==2?1:1.42f)+(e.maxHp-e.hp)/CarrotData.BossBaseHp("eyeball"))/1.64f):1-e.hp/e.maxHp);
   progress=phase=="won"?1:Mathf.Clamp(done/Mathf.Max(1,totalWork),0,.99f);
  }
  void SetOutcome(bool won){
   if(phase!="playing")return;phase=won?"won":"lost";paused=false;nextWave=0;progress=won?1:progress;SetSelection("",-1);focusType="";focusId=-1;blindUntil=0;mergeArmed=0;lastMerge=null;gustBoss=0;
   if(DuoHold)DuoHold=false;OutcomeTick=NetTick;
   ClearTimeScale();if(SpeedHold){SpeedHold=false;SpeedHoldReason="";Emit("speedHold","",Vector3.zero,value:0);}
   foreach(var e in enemies)if(e.alive)CancelCast(e,actors[e.id]);
   notice=won?(CarrotData.IsChallenge(level.id)?"Guardian defeated":"Garden protected"):(CarrotData.IsChallenge(level.id)?"The guardian wins":"Try again");noticeUntil=float.MaxValue;
   Emit(won?"victory":"defeat",level.biome,level.routes[0][level.routes[0].Length-1],value:health,duration:1.4f);Publish();
   if(NetMode!=NetMode.None)NetOutcome?.Invoke(phase);
  }

  int SuperPairs(){int pairs=0;foreach(var d in CarrotData.Towers){int n=0;foreach(var t in towers)if(t.kind==d.id&&t.tier==4)n++;pairs+=n*(n-1)/2;}return pairs;}
  void Publish(){if(level==null||!SnapshotEnabled)return;LastSnapshot=Snapshot();
#if UNITY_WEBGL && !UNITY_EDITOR
   if(EnableBridge)CarrotSend(LastSnapshot);
#endif
  }
#if UNITY_EDITOR
  public EnemyState TestSpawn(string kind,int route=0,float distance=0,bool boss=false,bool summoned=false,bool clone=false){if(wave==0){wave=1;waveStarted[1]=true;}return Spawn(boss?"boss":kind,route,wave,summoned,distance,clone);}
  public void TestDamage(int id,float amount,string kind="prism"){var e=enemies.Find(x=>x.id==id);if(e!=null)Damage(e,amount,true,kind,0);}
  public void TestFire(string kind,int tier,int target,Vector3 from){var e=enemies.Find(x=>x.id==target);if(e!=null)ResolveProjectile(new Projectile{kind=kind,tier=tier,target=target,source=999,position=from,to=e.position,damage=CarrotData.Tower(kind).damage[tier-1]});}
  public void TestLockedImpact(string kind,int target,Vector3 from,Vector3 to){ResolveProjectile(new Projectile{kind=kind,tier=1,target=target,source=999,position=from,to=to,damage=CarrotData.Tower(kind).damage[0]});}
  public void TestDamageScenery(int id,float amount){var b=blockers.Find(x=>x.id==id);if(b!=null)DamageBlocker(b,amount,"prism",0);}
  public void TestClearScheduled(){spawns.Clear();for(int i=1;i<wavePending.Length;i++)wavePending[i]=0;wave=level.waves;waveStarted[wave]=true;}
  /// <summary>Jump the schedule to the start of wave w (earlier waves count as resolved) so a test can watch that wave spawn.</summary>
  public void TestBeginWave(int w){spawns.Clear();for(int i=1;i<w;i++)wavePending[i]=0;wave=w-1;BeginWave();}
  public int TestProjectiles{get{return projectiles.Count;}}
  public float TestLongestFlight{get{float best=0;foreach(var p in projectiles)best=Mathf.Max(best,p.remaining);return best;}}
  public int TestCasts(int enemyId,string kind){Actor a;if(!actors.TryGetValue(enemyId,out a))return 0;switch(kind){case "uproot":return a.uproots;case "blind":return a.blinds;case "tithe":return a.tithes;case "whiteout":return a.whiteouts;case "dusk":return a.dusks;case "gust":return a.gusts;case "liftoff":return a.lifts;case "raise":return a.raises;case "gaze":return a.gazes;}return 0;}
  public float TestShave(int enemyId){Actor a;return actors.TryGetValue(enemyId,out a)?a.castShave:0;}
  /// <summary>Net tests: spawn `kind` (or the boss `bossId` when kind is "boss") as a unit of wave w (endless scaling applies).</summary>
  public EnemyState TestSpawnWave(string kind,int route,int w,string bossId=null){if(wave==0){wave=1;waveStarted[1]=true;}w=Mathf.Clamp(w,1,level.waves);return Spawn(kind,route,w,false,0,bossId:bossId);}
  public int TestLivingBosses{get{return LivingBosses();}}
  public int TestSpawnsQueued{get{return spawns.Count;}}
  public string TestFocus{get{return focusType+":"+focusId;}}
  public void TestNetSeat(int seat){NetSeat=seat==1?1:0;}
#endif
 }
}
