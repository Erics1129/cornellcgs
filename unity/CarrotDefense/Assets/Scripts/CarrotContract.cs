using System;
using System.Collections.Generic;
using System.Text;
using UnityEngine;

namespace CarrotTD {
 // Bridge contract v2 (frozen at T0; every field is additive and optional, so a v1 consumer keeps working):
 //  state: v, runId, mode, caps[], timeScale, speedHold, speedHoldReason, waveElapsed, incoming[], stats{}, judgement{},
 //         lossCauses[], carrotX, carrotY, spawnPoints[] (viewport fractions, origin top-left)
 //  boss:  abilityTarget (-1 when none), abilityTargetTier, abilityTargets[], remaining, eta (-1 when not moving),
 //         routeFraction, contactFatal, windup, actionable, thresholds[]   minibosses: castTotal
 //  effects: waveIncoming (kind air|ground|boss|mini, value count, target route, tier wave), judgement (kind, id seq,
 //         tier wave, value), bossDeadline (value .5|.75|.9), speedHold (value 1|0, kind = the cast), timeScale
 //  commands: load {level, mode?}, setPaused {value 1|0}; view messages SetSafeArea/FocusBoss/SetVolumes live on the view.
 // incoming[].at and span are game seconds on that wave's own clock (the clock waveElapsed reads for the current wave);
 // eta is game seconds from now until the group's first spawn, -1 while the wave's start is not yet scheduled.
 public sealed partial class CarrotGame {
  public const int BridgeVersion=2;
  public int RunId {get;private set;}
  /// <summary>"normal" or "veteran" (Veteran is offered only when CarrotData.VeteranShipped and the level is 1-24).</summary>
  public string Mode {get;private set;}="normal";
  readonly List<string> caps=new List<string>();
  /// <summary>Capabilities the running build advertises (e.g. "worldBars" once the view draws world-space bars).</summary>
  public void SetCap(string cap,bool on){if(string.IsNullOrEmpty(cap))return;int i=caps.IndexOf(cap);if(on&&i<0){caps.Add(cap);caps.Sort(string.CompareOrdinal);}else if(!on&&i>=0)caps.RemoveAt(i);}
  public bool HasCap(string cap){return caps.Contains(cap);}
#if UNITY_EDITOR
  /// <summary>Editor tests only: evaluate Veteran before it ships.</summary>
  public static bool AllowVeteranForTests;
#endif
  bool VeteranAllowed(int id){
   bool allowed=CarrotData.VeteranShipped;
#if UNITY_EDITOR
   allowed|=AllowVeteranForTests;
#endif
   return allowed&&id>=1&&id<=24;
  }
  bool Veteran {get{return Mode=="veteran";}}
  float SellRate {get{return Veteran?.6f:.7f;}}

  // ---- Time scale requests: presentation beats (time-stops, slow motion) slow the real-time accumulator only.
  struct TimeScaleRequest {public float scale,until;public string reason;}
  readonly List<TimeScaleRequest> timeScaleRequests=new List<TimeScaleRequest>();
  float realClock;
  public int TimeScaleRequestCount {get;private set;}
  public string TimeScaleReason {get;private set;}="";
  /// <summary>The active presentation time scale (the minimum live request, 1 when none). Read-only: use RequestTimeScale.</summary>
  public float CinematicScale {get{float s=1;for(int i=0;i<timeScaleRequests.Count;i++){var r=timeScaleRequests[i];if(r.until>realClock&&r.scale<s)s=r.scale;}return s;}}
  /// <summary>Slow (0..1) the real-time accumulator for realSeconds (at most 2 s) of unscaled time. Requests expire on
  /// their own, the minimum live one wins, and all are cleared on load, pause and outcome. StepSimulation is unaffected.</summary>
  public bool RequestTimeScale(float scale,float realSeconds,string reason){
   if(phase!="playing"||paused||float.IsNaN(scale)||float.IsNaN(realSeconds)||realSeconds<=0)return false;
   scale=Mathf.Clamp01(scale);realSeconds=Mathf.Min(realSeconds,2);
   timeScaleRequests.Add(new TimeScaleRequest{scale=scale,until=realClock+realSeconds,reason=reason??""});
   TimeScaleRequestCount++;TimeScaleReason=reason??"";Emit("timeScale",TimeScaleReason,Vector3.zero,value:scale,duration:realSeconds);return true;
  }
  void ClearTimeScale(){timeScaleRequests.Clear();}

  // ---- Speed hold: an actionable boss telegraph (it targets a tower or the purse) plays at 1x real time.
  public bool SpeedHold {get;private set;}
  public string SpeedHoldReason {get;private set;}="";
  /// <summary>Casts the player can answer during the windup: tower or coin targets. Their windup is at least 2.5 s.</summary>
  public static bool Actionable(string kind){
   switch(kind){case "uproot":case "tithe":case "gaze":case "glacierLance":case "portalStorm":case "stormLock":case "thornBind":case "coinLeech":case "prismLances":case "spectrumRain":case "prismBreak":return true;}
   return false;
  }
  public const float ActionableWindup=2.5f,PassiveWindup=1.2f;
  void UpdateSpeedHold(){
   bool hold=false;string reason="";
   if(phase=="playing")for(int i=0;i<enemies.Count;i++){var e=enemies[i];if(!e.alive||string.IsNullOrEmpty(e.boss))continue;Actor a;if(actors.TryGetValue(e.id,out a)&&a.cast!=""&&Actionable(a.cast)){hold=true;reason=a.cast;break;}}
   if(hold==SpeedHold){SpeedHoldReason=reason;return;}
   SpeedHold=hold;SpeedHoldReason=reason;Emit("speedHold",reason,Vector3.zero,value:hold?1:0);
  }
  /// <summary>The rate game time advances per real second: the chosen speed (held to 1x during actionable windups) times the presentation scale.</summary>
  public float EffectiveRate(){return (SpeedHold?Mathf.Min(speed,1):speed)*CinematicScale;}
  /// <summary>One real-time frame: the same accumulator path Update uses (public so tests can drive it at 2x).</summary>
  public void AdvanceReal(float real){
   if(float.IsNaN(real)||real<0)real=0;
   realClock+=real;for(int i=timeScaleRequests.Count-1;i>=0;i--)if(timeScaleRequests[i].until<=realClock)timeScaleRequests.RemoveAt(i);
   if(AutoTick&&!backgrounded&&!paused&&phase=="playing"){
    accumulator+=real*EffectiveRate();
    while(accumulator>=Step){
     bool held=SpeedHold;Tick(Step);accumulator-=Step;if(phase!="playing")break;
     // Time banked at 2x is dropped when a hold begins, so the whole windup plays at 1x.
     if(!held&&SpeedHold){accumulator=0;break;}
    }
   }
   bridgeClock+=real;if(bridgeClock>=.1f){bridgeClock=0;Publish();}
  }
  void SetPausedState(bool value){
   if(phase!="playing"&&phase!="ready")return;if(paused==value)return;
   paused=value;accumulator=0;if(paused)ClearTimeScale();Emit("pause",paused?"on":"off",Vector3.zero);
  }

  // ---- Wave plans (the exact BeginWave schedule) and the incoming preview.
  List<CarrotData.PlannedSpawn>[] wavePlans;
  float waveStartedAt;
  void BuildPlans(){wavePlans=new List<CarrotData.PlannedSpawn>[level.waves+1];for(int w=1;w<=level.waves;w++)wavePlans[w]=CarrotData.PlanWave(level.id,w,new List<CarrotData.PlannedSpawn>());}
  void EmitIncoming(int w){
   if(wavePlans==null||w<1||w>level.waves)return;var plan=wavePlans[w];
   // One cue per (category, route): air, ground, mini or boss.
   for(int c=0;c<4;c++)for(int r=0;r<level.routes.Length;r++){
    int n=0;foreach(var p in plan){if(p.route!=r)continue;string category=Category(p.kind);if(category==Categories[c])n++;}
    if(n>0)Emit("waveIncoming",Categories[c],level.routes[r][0],target:r,tier:w,value:n);
   }
  }
  static readonly string[] Categories={"boss","mini","air","ground"};
  string Category(string packetKind){if(packetKind=="boss")return "boss";var t=CarrotData.Traits(packetKind);return t.mini?"mini":t.air?"air":"ground";}
  public float WaveElapsed {get{return wave>0?Mathf.Max(0,elapsed-waveStartedAt):0;}}

  // ---- Stats, judgements and loss attribution.
  int statKills,statLeaks,statStreak,statBestStreak,statPerfect,judgeSeq,judgeWave;float judgeValue;string judgeKind="";
  int[] waveHearts,waveLeakCount;
  readonly List<string> leakKinds=new List<string>(),dmgKinds=new List<string>();
  readonly List<int> leakCounts=new List<int>();
  readonly List<float> dmgValues=new List<float>();
  sealed class LeakRecord {public int wave,route,count;public string kind,cast="";public bool air,airUncovered;}
  readonly List<LeakRecord> leakRecords=new List<LeakRecord>(),leakOrder=new List<LeakRecord>();
  List<Vector3>[] tailSamples;
  public int JudgementSeq {get{return judgeSeq;}}
  public string LastJudgement {get{return judgeKind;}}
  public int DefenseChain {get{return statStreak;}}
  public int Kills {get{return statKills;}}
  public int Leaks {get{return statLeaks;}}
  public int BestChain {get{return statBestStreak;}}
  public int PerfectWaves {get{return statPerfect;}}
  /// <summary>Hearts lost to enemies of wave w (1-based) and the number of bites they made.</summary>
  public int WaveHeartsLost(int w){return waveHearts!=null&&w>=1&&w<waveHearts.Length?waveHearts[w]:0;}
  public int WaveLeakCount(int w){return waveLeakCount!=null&&w>=1&&w<waveLeakCount.Length?waveLeakCount[w]:0;}
  /// <summary>The planned spawns of wave w (the same list BeginWave schedules); read-only for bots and the preview.</summary>
  public IReadOnlyList<CarrotData.PlannedSpawn> WavePlan(int w){return wavePlans!=null&&w>=1&&w<wavePlans.Length?wavePlans[w]:null;}
  void ResetStats(){
   statKills=statLeaks=statStreak=statBestStreak=statPerfect=judgeSeq=judgeWave=0;judgeValue=0;judgeKind="";
   waveHearts=new int[level.waves+1];waveLeakCount=new int[level.waves+1];leakKinds.Clear();leakCounts.Clear();dmgKinds.Clear();dmgValues.Clear();leakRecords.Clear();
   // The last 30% of every route, sampled every half unit: the stretch an air leak must have crossed.
   tailSamples=new List<Vector3>[level.routes.Length];
   for(int r=0;r<level.routes.Length;r++){var list=new List<Vector3>();float len=CarrotData.RouteLength(level.routes[r]);for(float d=len*.7f;d<=len;d+=.5f){Vector3 dir;list.Add(CarrotData.RoutePoint(level.routes[r],d,out dir));}tailSamples[r]=list;}
  }
  void Judge(string kind,float value,Vector3 at){judgeSeq++;judgeKind=kind;judgeWave=wave;judgeValue=value;Emit("judgement",kind,at,id:judgeSeq,tier:wave,value:value,duration:1.6f);}
  void ChainStep(){statStreak++;if(statStreak>statBestStreak)statBestStreak=statStreak;}
  static void AddCount(List<string> keys,List<int> counts,string key,int n){int i=keys.IndexOf(key);if(i<0){keys.Add(key);counts.Add(n);}else counts[i]+=n;}
  bool AirCovered(int route){
   if(tailSamples==null||route<0||route>=tailSamples.Length)return true;
   foreach(var t in towers){var d=CarrotData.Tower(t.kind);if(d==null||!d.air)continue;float range=d.range[t.tier-1];foreach(var p in tailSamples[route])if(FlatDistance(t.position,p)<=range)return true;}
   return false;
  }
  string ActiveBossCast(){foreach(var e in enemies)if(e.alive&&!string.IsNullOrEmpty(e.boss)){Actor a;if(actors.TryGetValue(e.id,out a)&&a.cast!="")return a.cast;}return "";}
  void RecordLeak(EnemyState e,Actor a,int hearts){
   statLeaks++;int w=Mathf.Clamp(a.wave,1,level.waves);waveHearts[w]+=hearts;bool first=waveLeakCount[w]==0;waveLeakCount[w]++;
   AddCount(leakKinds,leakCounts,e.kind,1);
   bool uncovered=e.air&&!AirCovered(e.route);string cast=ActiveBossCast();
   LeakRecord r=null;foreach(var x in leakRecords)if(x.kind==e.kind&&x.route==e.route){r=x;break;}
   if(r==null){r=new LeakRecord{kind=e.kind,route=e.route};leakRecords.Add(r);}
   r.count++;r.wave=w;r.air|=e.air;r.airUncovered|=uncovered;if(cast!="")r.cast=cast;
   statStreak=0;if(first)Judge("leak",w,e.position);
  }
  void WaveCleared(int w){
   if(waveLeakCount==null||w<1||w>=waveLeakCount.Length)return;
   if(waveLeakCount[w]==0){statPerfect++;ChainStep();Judge("flawless",w,level.routes[0][level.routes[0].Length-1]);}
   else Judge("clear",w,level.routes[0][level.routes[0].Length-1]);
  }
  void CreditDamage(int source,string kind,float amount){
   if(amount<=0||float.IsNaN(amount))return;string family=null;
   if(source>0)for(int i=0;i<towers.Count;i++)if(towers[i].id==source){family=towers[i].kind;break;}
   if(family==null)switch(kind){case "orchidPoison":family="orchid";break;case "cactusBleed":family="cactus";break;case "dreamBurst":family="mushroom";break;case "seedBurst":family="seed";break;default:family=CarrotData.Tower(kind)!=null?kind:null;break;}
   if(family==null)return;int idx=dmgKinds.IndexOf(family);if(idx<0){dmgKinds.Add(family);dmgValues.Add(amount);}else dmgValues[idx]+=amount;
  }
  // Suggested counters, picked among the towers unlocked on this level.
  static readonly string[] AirCounters={"starfruit","storm","prism","thunder","seed"},ArmorCounters={"prism","thunder","storm","magnet","seed"},ShieldCounters={"magnet","prism","moonflower","frost","seed"},
   SwarmCounters={"mortar","storm","starfruit","seed"},FastCounters={"frost","clockflower","book","seed"},HealerCounters={"prism","thunder","seed"},BossCounters={"frost","prism","thunder","seed"},DefaultCounters={"seed","frost","mortar"};
  public string Counter(string kind,bool air){
   var t=CarrotData.Traits(kind);string[] prefs;
   if(air||t.air)prefs=AirCounters;else if(!string.IsNullOrEmpty(CarrotData.BossName(kind)))prefs=BossCounters;else if(t.armor)prefs=ArmorCounters;else if(t.shield)prefs=ShieldCounters;
   else if(kind=="swarm"||kind=="mite")prefs=SwarmCounters;else if(kind=="dash"||kind=="bat"||kind=="riftling"||kind=="burrow")prefs=FastCounters;else if(t.heal)prefs=HealerCounters;else prefs=DefaultCounters;
   foreach(var p in prefs){var d=CarrotData.Tower(p);if(d!=null&&d.unlock<=level.id)return p;}
   return "seed";
  }
  static int CompareLeaks(LeakRecord a,LeakRecord b){int c=b.count.CompareTo(a.count);if(c==0)c=b.wave.CompareTo(a.wave);if(c==0)c=string.CompareOrdinal(a.kind,b.kind);if(c==0)c=a.route.CompareTo(b.route);return c;}
  static readonly Comparison<LeakRecord> LeakOrder=CompareLeaks;

  // ---- Deadlines: a challenge guardian's walk to the carrot is a visible, announced clock.
  void UpdateDeadline(EnemyState e,Actor a){
   if(!CarrotData.IsChallenge(level.id)||e.routeLength<=0)return;float f=e.distance/e.routeLength;
   for(int k=0;k<3;k++){int bit=1<<k;float mark=k==0?.5f:k==1?.75f:.9f;if(f>=mark&&(a.deadlineMask&bit)==0){a.deadlineMask|=bit;Emit("bossDeadline",e.boss,e.position,id:e.id,value:mark,duration:BossEta(e,a));}}
  }
  /// <summary>Game seconds until the boss reaches the carrot at its present pace; -1 while it is not moving.</summary>
  float BossEta(EnemyState e,Actor a){
   float remaining=Mathf.Max(0,e.routeLength-e.distance);
   if(e.boss=="asuna"&&prism!=null&&prism.id==e.id){float len=PrismDashLength(e),interval=e.phase==3?11:13;int dashes=Mathf.CeilToInt(remaining/Mathf.Max(.01f,len));if(dashes<=0)return 0;return Finite(Mathf.Max(0,prism.nextDash-elapsed)+1.25f+PrismDashSeconds+(dashes-1)*(interval+PrismDashSeconds),-1);}
   float pace=a.baseSpeed;if(pace<.01f)return -1;return Finite(remaining/pace,-1);
  }
  static float Finite(float v,float fallback){return float.IsNaN(v)||float.IsInfinity(v)?fallback:v;}

  // ---- Determinism digest: integers and raw float bits of the authoritative state (compared across runtimes).
  public ulong Digest(){
   ulong h=1469598103934665603UL;
   Mix(ref h,(ulong)coins);Mix(ref h,(ulong)health);Mix(ref h,(ulong)wave);Mix(ref h,Bits(elapsed));Mix(ref h,(ulong)phase.Length);
   foreach(var e in enemies){Mix(ref h,(ulong)e.id);Mix(ref h,Bits(e.hp));Mix(ref h,Bits(e.distance));Mix(ref h,Bits(e.shield));Mix(ref h,e.alive?1UL:0UL);}
   foreach(var t in towers){Mix(ref h,(ulong)t.id);Mix(ref h,(ulong)t.tier);Mix(ref h,(ulong)t.pad);Mix(ref h,Bits(t.cooldown));}
   foreach(var b in blockers){Mix(ref h,(ulong)b.id);Mix(ref h,Bits(b.hp));}
   return h;
  }
  /// <summary>The discrete state only (integers, ids, tiers, counts): what a 1-ulp float difference cannot move unless a
  /// decision actually flips. Unity's Mono JIT on ARM64 may fuse a*b+c into one rounding where .NET 6 rounds twice, so raw
  /// float bits can differ by an ulp between the editor and the standalone runtime while the game plays out identically.</summary>
  public ulong DiscreteDigest(){
   ulong h=1469598103934665603UL;
   Mix(ref h,(ulong)coins);Mix(ref h,(ulong)health);Mix(ref h,(ulong)wave);Mix(ref h,(ulong)phase.Length);Mix(ref h,(ulong)TotalEarned);Mix(ref h,(ulong)statKills);Mix(ref h,(ulong)projectiles.Count);Mix(ref h,(ulong)spawns.Count);
   foreach(var e in enemies){Mix(ref h,(ulong)e.id);Mix(ref h,e.alive?1UL:0UL);Mix(ref h,(ulong)e.phase);Mix(ref h,e.hidden?1UL:0UL);Mix(ref h,(ulong)(e.ability??"").Length);}
   foreach(var t in towers){Mix(ref h,(ulong)t.id);Mix(ref h,(ulong)t.tier);Mix(ref h,(ulong)t.pad);}
   foreach(var b in blockers)Mix(ref h,(ulong)b.id);
   return h;
  }
  static void Mix(ref ulong h,ulong v){h^=v;h*=1099511628211UL;}
  static ulong Bits(float f){return (ulong)(uint)BitConverter.ToInt32(BitConverter.GetBytes(f),0);}

  // ---- Snapshot: hand-written JSON (no NaN/Infinity can reach JSON.parse; fixed decimals keep it small).
  readonly JsonOut json=new JsonOut();
  readonly List<EnemyState> ordinary=new List<EnemyState>(),hurtBars=new List<EnemyState>();
  static int CompareRemaining(EnemyState a,EnemyState b){int c=(a.routeLength-a.distance).CompareTo(b.routeLength-b.distance);return c!=0?c:a.id.CompareTo(b.id);}
  static readonly Comparison<EnemyState> RemainingOrder=CompareRemaining;
  public const int WorldBarCap=32;
  public string Snapshot(){
   var view=GetComponent<CarrotView>();var j=json;j.Begin();
   j.Int("v",BridgeVersion);j.Int("runId",RunId);j.Str("mode",Mode);
   j.ArrayStart("caps");for(int i=0;i<caps.Count;i++)j.StrItem(caps[i]);j.ArrayEnd();
   j.Int("level",level.id);j.Str("name",level.name);j.Str("biome",level.biome);j.Int("wave",wave);j.Int("waves",level.waves);j.Int("coins",coins);j.Int("health",health);
   j.Num("progress",progress,4);j.Str("phase",phase);j.Bool("paused",paused);j.Num("speed",speed,2);j.Num("nextWave",nextWave,3);
   float rate=phase=="playing"&&!paused&&!backgrounded?EffectiveRate():0;j.Num("timeScale",rate,3);j.Bool("speedHold",SpeedHold);j.Str("speedHoldReason",SpeedHoldReason);
   j.Num("waveElapsed",WaveElapsed,3);
   // Selection.
   Vector3 at=Vector3.zero;string selKind="",superName="";int tier=0,refund=0,partners=0,spent=0;float hp=0,maxHp=0;
   if(selectionType=="pad"&&selectionId>=0&&selectionId<level.pads.Length){at=level.pads[selectionId];selKind="pad";}
   else if(selectionType=="tower"){var t=TowerById(selectionId);if(t!=null){at=t.position;selKind=t.kind;tier=t.tier;refund=Mathf.FloorToInt(t.spent*SellRate);spent=t.spent;partners=Partners(t);superName=t.tier==5?CarrotData.Tower(t.kind).superName:"";}}
   else if(selectionType=="enemy"){var e=EnemyById(selectionId);if(e!=null){at=e.position;selKind=e.kind;hp=e.hp;maxHp=e.maxHp;}}
   else if(selectionType=="blocker"){var b=BlockerById(selectionId);if(b!=null){at=b.position;selKind=b.kind;hp=b.hp;maxHp=b.maxHp;}}
   var sp=ScreenPoint(view,at+Vector3.up*.4f);
   j.ObjectStart("selection");j.Str("type",selectionType);j.Str("kind",selKind);j.Str("superName",superName);j.Int("id",selectionId);j.Int("tier",tier);j.Int("refund",refund);j.Int("partners",partners);j.Int("spent",spent);j.Num("hp",hp,2);j.Num("maxHp",maxHp,2);j.Num("x",sp.x,3);j.Num("y",sp.y,3);j.ObjectEnd();
   // Monsters, minibosses and the boss.
   EnemyState boss=null;int alive=0;ordinary.Clear();hurtBars.Clear();
   j.ArrayStart("minibosses");
   for(int i=0;i<enemies.Count;i++){var e=enemies[i];if(!e.alive)continue;alive++;
    if(!string.IsNullOrEmpty(e.boss)){boss=e;continue;}
    if(!string.IsNullOrEmpty(e.miniboss)){var p=ScreenPoint(view,view!=null?view.EnemyBarPosition(e):e.position+Vector3.up*1.7f);Actor a;actors.TryGetValue(e.id,out a);var def=CarrotData.Enemy(e.kind);
     j.ItemStart();j.Int("id",e.id);j.Int("phase",e.phase);j.Str("kind",e.kind);j.Str("name",def!=null?def.name:e.kind);j.Str("ability",e.ability??"");j.Num("hp",e.hp,2);j.Num("maxHp",e.maxHp,2);j.Num("shield",e.shield,2);j.Num("maxShield",e.maxShield,2);
     j.Num("castRemaining",e.castRemaining,3);j.Num("castTotal",a!=null&&a.cast!=""?a.castTotal:0,3);j.Num("x",p.x,3);j.Num("y",p.y,3);j.Bool("visible",!e.hidden&&p.x>=0&&p.x<=1&&p.y>=0&&p.y<=1);j.ItemEnd();continue;}
    ordinary.Add(e);
   }
   j.ArrayEnd();
   // HP bars: every hurt or shielded monster plus the 24 nearest the carrot (with world bars: at most 32, hurt first).
   ordinary.Sort(RemainingOrder);bool capped=HasCap("worldBars");int near=0,written=0;
   j.ArrayStart("monsters");
   if(capped){for(int i=0;i<ordinary.Count&&written<WorldBarCap;i++){var e=ordinary[i];if(e.hp<e.maxHp||e.shield>0){WriteMonster(j,view,e);written++;}}
    for(int i=0;i<ordinary.Count&&written<WorldBarCap;i++){var e=ordinary[i];if(!(e.hp<e.maxHp||e.shield>0)){WriteMonster(j,view,e);written++;}}}
   else for(int i=0;i<ordinary.Count;i++){var e=ordinary[i];bool hurt=e.hp<e.maxHp||e.shield>0;if(!hurt){if(near>=24)continue;near++;}WriteMonster(j,view,e);}
   j.ArrayEnd();
   j.Int("enemyCount",alive);j.Str("notice",notice);j.Bool("muted",muted);j.Int("towerCount",towers.Count);
   int standing=0;for(int i=0;i<blockers.Count;i++)if(blockers[i].ownerEnemy==0)standing++;
   j.Int("cleared",level.blockers.Length-standing);j.Int("blockersRemaining",standing);
   j.Num("elapsed",elapsed,3);j.Num("blind",Mathf.Max(0,blindUntil-elapsed),3);j.Num("blindTint",blindTint,3);j.Num("blindAlpha",elapsed<blindUntil?blindAlpha:0,3);
   j.Int("superPairs",SuperPairs());j.Num("mergeUndo",MergeUndoLeft(),3);j.Int("mergeArmed",mergeArmed);
   j.Int("reinforcements",prism!=null?prism.cohorts:0);j.Int("reinforcementTier",prism!=null&&boss!=null?1+Mathf.Clamp((int)((elapsed-prism.started)/85),0,4):0);j.Num("reinforcementIn",prism!=null&&boss!=null&&prism.cohorts<48?Mathf.Max(0,prism.nextCohort-elapsed):0,3);
   WriteIncoming(j);WriteStats(j);
   j.ObjectStart("judgement");j.Int("seq",judgeSeq);j.Str("kind",judgeKind);j.Int("wave",judgeWave);j.Num("value",judgeValue,2);j.ObjectEnd();
   WriteLossCauses(j);
   Vector3 goal=level.routes[0][level.routes[0].Length-1];var carrot=ScreenPoint(view,goal+Vector3.up*.6f);j.Num("carrotX",carrot.x,3);j.Num("carrotY",carrot.y,3);
   j.ArrayStart("spawnPoints");for(int r=0;r<level.routes.Length;r++){var p=ScreenPoint(view,level.routes[r][0]);j.ItemStart();j.Num("x",p.x,3);j.Num("y",p.y,3);j.ItemEnd();}j.ArrayEnd();
   if(boss==null)j.Null("boss");else WriteBoss(j,view,boss);
   return j.End();
  }
  void WriteMonster(JsonOut j,CarrotView view,EnemyState e){
   var p=ScreenPoint(view,view!=null?view.EnemyBarPosition(e):e.position+Vector3.up*1.2f);
   j.ItemStart();j.Int("id",e.id);j.Str("kind",e.kind);j.Num("hp",e.hp,2);j.Num("maxHp",e.maxHp,2);j.Num("shield",e.shield,2);j.Num("maxShield",e.maxShield,2);j.Num("x",p.x,3);j.Num("y",p.y,3);j.Bool("visible",!e.hidden&&p.x>=0&&p.x<=1&&p.y>=0&&p.y<=1);j.ItemEnd();
  }
  void WriteBoss(JsonOut j,CarrotView view,EnemyState e){
   Actor a;actors.TryGetValue(e.id,out a);string cast=a!=null?a.cast:"";
   int target=-1,targetTier=0;if(a!=null&&cast!=""&&a.targets.Count>0){var t=TowerById(a.targets[0]);if(t!=null){target=t.id;targetTier=t.tier;}}
   float p2,p3;Thresholds(e.boss,out p2,out p3);var p=ScreenPoint(view,e.position+Vector3.up*2.1f);
   j.ObjectStart("boss");j.Int("id",e.id);j.Int("phase",e.phase);j.Int("stage",e.stage);j.Str("kind",e.boss);j.Str("name",CarrotData.BossName(e.boss));j.Str("ability",e.ability??"");
   j.Num("hp",e.hp,2);j.Num("maxHp",e.maxHp,2);j.Num("shield",e.shield,2);j.Num("maxShield",e.maxShield,2);j.Num("castRemaining",e.castRemaining,3);
   j.Int("abilityTarget",target);j.Int("abilityTargetTier",targetTier);
   j.ArrayStart("abilityTargets");if(a!=null&&cast!="")for(int i=0;i<a.targets.Count;i++)if(TowerById(a.targets[i])!=null)j.IntItem(a.targets[i]);j.ArrayEnd();
   j.Num("remaining",Mathf.Max(0,e.routeLength-e.distance),3);j.Num("eta",a!=null?BossEta(e,a):-1,2);j.Num("routeFraction",e.routeLength>0?Mathf.Clamp01(e.distance/e.routeLength):0,4);
   j.Bool("contactFatal",CarrotData.IsChallenge(level.id));j.Num("windup",a!=null&&cast!=""?a.castTotal:0,3);j.Bool("actionable",cast!=""&&Actionable(cast));
   j.ArrayStart("thresholds");j.NumItem(p2,3);j.NumItem(p3,3);for(int i=0;i<PrismBreaks.Length&&e.boss=="asuna";i++)j.NumItem(PrismBreaks[i],3);j.ArrayEnd();
   j.Num("x",p.x,3);j.Num("y",p.y,3);j.ObjectEnd();
  }
  void WriteIncoming(JsonOut j){
   j.ArrayStart("incoming");
   if(wavePlans!=null){
    // The current wave's units still to spawn (actual schedule), then the whole next wave.
    if(wave>=1){string kind=null;int route=-1,n=0;float first=0,last=0;
     for(int i=0;i<spawns.Count;i++){var s=spawns[i];if(s.wave!=wave)continue;
      if(n>0&&(s.kind!=kind||s.route!=route)){WriteGroup(j,kind,n,route,first-waveStartedAt,last-first,wave,first-elapsed);n=0;}
      if(n==0){kind=s.kind;route=s.route;first=s.at;}last=s.at;n++;}
     if(n>0)WriteGroup(j,kind,n,route,first-waveStartedAt,last-first,wave,first-elapsed);}
    int next=wave+1;if(next<=level.waves){float start=phase=="playing"&&CurrentWaveResolved()&&nextWave>0?nextWave:-1;var plan=wavePlans[next];
     string kind=null;int route=-1,n=0;float first=0,last=0;
     for(int i=0;i<plan.Count;i++){var s=plan[i];if(n>0&&(s.kind!=kind||s.route!=route)){WriteGroup(j,kind,n,route,first,last-first,next,start<0?-1:start+first);n=0;}if(n==0){kind=s.kind;route=s.route;first=s.at;}last=s.at;n++;}
     if(n>0)WriteGroup(j,kind,n,route,first,last-first,next,start<0?-1:start+first);}
   }
   j.ArrayEnd();
  }
  void WriteGroup(JsonOut j,string packetKind,int count,int route,float at,float span,int w,float eta){
   string kind=packetKind=="boss"?level.boss:packetKind;var t=CarrotData.Traits(kind);
   j.ItemStart();j.Str("kind",kind);j.Int("count",count);j.Int("route",route);j.Bool("air",t.air);j.Bool("armor",t.armor);j.Bool("shield",t.shield);j.Bool("heal",t.heal);j.Bool("mini",t.mini);j.Bool("boss",packetKind=="boss");
   j.Num("at",at,2);j.Num("span",span,2);j.Int("wave",w);j.Num("eta",eta<0?-1:eta,2);j.ItemEnd();
  }
  void WriteStats(JsonOut j){
   j.ObjectStart("stats");j.Int("kills",statKills);j.Int("leaks",statLeaks);j.Int("earned",Mathf.Max(0,TotalEarned-level.startingGold));j.Int("streak",statStreak);j.Int("bestStreak",statBestStreak);j.Int("perfectWaves",statPerfect);
   j.ArrayStart("waveLeaks");if(waveHearts!=null)for(int w=1;w<waveHearts.Length;w++)j.IntItem(waveHearts[w]);j.ArrayEnd();
   j.ArrayStart("leakKinds");for(int i=0;i<leakKinds.Count;i++)j.StrItem(leakKinds[i]);j.ArrayEnd();
   j.ArrayStart("leakCounts");for(int i=0;i<leakCounts.Count;i++)j.IntItem(leakCounts[i]);j.ArrayEnd();
   j.ArrayStart("dmgKinds");for(int i=0;i<dmgKinds.Count;i++)j.StrItem(dmgKinds[i]);j.ArrayEnd();
   j.ArrayStart("dmgValues");for(int i=0;i<dmgValues.Count;i++)j.NumItem(dmgValues[i],0);j.ArrayEnd();
   j.ObjectEnd();
  }
  void WriteLossCauses(JsonOut j){
   j.ArrayStart("lossCauses");
   if(leakRecords.Count>0){leakOrder.Clear();leakOrder.AddRange(leakRecords);leakOrder.Sort(LeakOrder);
    for(int i=0;i<leakOrder.Count&&i<2;i++){var r=leakOrder[i];j.ItemStart();j.Str("kind",r.kind);j.Int("route",r.route);j.Int("wave",r.wave);j.Int("count",r.count);j.Bool("air",r.air);j.Bool("airUncovered",r.airUncovered);j.Str("cast",r.cast);j.Str("counter",Counter(r.kind,r.air));j.ItemEnd();}}
   j.ArrayEnd();
  }
  TowerState TowerById(int id){for(int i=0;i<towers.Count;i++)if(towers[i].id==id)return towers[i];return null;}
  EnemyState EnemyById(int id){for(int i=0;i<enemies.Count;i++)if(enemies[i].id==id)return enemies[i];return null;}
  BlockerState BlockerById(int id){for(int i=0;i<blockers.Count;i++)if(blockers[i].id==id)return blockers[i];return null;}
  Vector2 ScreenPoint(CarrotView view,Vector3 p){
   Camera cam=view!=null?view.GameCamera:null;
   if(cam==null)return new Vector2(Mathf.Clamp01((p.x+8)/16f),Mathf.Clamp01((p.z+6)/12f));
   var q=cam.WorldToViewportPoint(p);return new Vector2(q.x,1-q.y);
  }
 }

 /// <summary>Allocation-light JSON writer for the bridge: fixed decimals, never NaN or Infinity, ordinal escapes.</summary>
 public sealed class JsonOut {
  readonly StringBuilder sb=new StringBuilder(8192);bool first=true;
  static readonly long[] Pow10={1,10,100,1000,10000,100000,1000000};
  public void Begin(){sb.Length=0;sb.Append('{');first=true;}
  public string End(){sb.Append('}');return sb.ToString();}
  void Comma(){if(!first)sb.Append(',');first=false;}
  void Key(string k){Comma();sb.Append('"').Append(k).Append("\":");}
  public void Int(string k,int v){Key(k);AppendLong(v);}
  public void Num(string k,float v,int decimals){Key(k);AppendNum(v,decimals);}
  public void Bool(string k,bool v){Key(k);sb.Append(v?"true":"false");}
  public void Str(string k,string v){Key(k);AppendStr(v);}
  public void Null(string k){Key(k);sb.Append("null");}
  public void ObjectStart(string k){Key(k);sb.Append('{');first=true;}
  public void ObjectEnd(){sb.Append('}');first=false;}
  public void ArrayStart(string k){Key(k);sb.Append('[');first=true;}
  public void ArrayEnd(){sb.Append(']');first=false;}
  public void ItemStart(){Comma();sb.Append('{');first=true;}
  public void ItemEnd(){sb.Append('}');first=false;}
  public void IntItem(int v){Comma();AppendLong(v);}
  public void NumItem(float v,int decimals){Comma();AppendNum(v,decimals);}
  public void StrItem(string v){Comma();AppendStr(v);}
  void AppendLong(long v){
   if(v<0){sb.Append('-');v=-v;}if(v==0){sb.Append('0');return;}
   int start=sb.Length;while(v>0){sb.Append((char)('0'+(int)(v%10)));v/=10;}
   for(int a=start,b=sb.Length-1;a<b;a++,b--){char c=sb[a];sb[a]=sb[b];sb[b]=c;}
  }
  void AppendNum(float f,int decimals){
   double v=f;if(double.IsNaN(v)||double.IsInfinity(v))v=0;if(v>1e12)v=1e12;if(v<-1e12)v=-1e12;
   decimals=Mathf.Clamp(decimals,0,6);long p=Pow10[decimals];long n=(long)Math.Round(v*p,MidpointRounding.AwayFromZero);
   if(n<0){sb.Append('-');n=-n;}AppendLong(n/p);long frac=n%p;if(frac==0)return;
   sb.Append('.');int digits=decimals;while(frac%10==0){frac/=10;digits--;}
   long div=Pow10[digits-1];while(div>0){sb.Append((char)('0'+(int)(frac/div%10)));div/=10;}
  }
  void AppendStr(string s){
   sb.Append('"');if(s!=null)for(int i=0;i<s.Length;i++){char c=s[i];if(c=='"'||c=='\\'){sb.Append('\\').Append(c);}else if(c<' '){sb.Append("\\u00");sb.Append("0123456789abcdef"[c>>4]);sb.Append("0123456789abcdef"[c&15]);}else sb.Append(c);}
   sb.Append('"');
  }
 }
}
