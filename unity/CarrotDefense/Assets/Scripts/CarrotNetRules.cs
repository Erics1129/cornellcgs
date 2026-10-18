using System;
using System.Collections.Generic;
using UnityEngine;

namespace CarrotTD {
 // The net seam (multiplayer rules on top of the unchanged single-player simulation).
 //  Tick model: a netTick is one fixed 1/30 s Step of the match clock. Before netTick T executes, every op stamped T is applied
 //  in canonical order (seat 0 first on even T, seat 1 first on odd T, then by seq); then the sim advances one Step if the
 //  phase is "playing" and the half is not held. The clock also runs in prep ("ready"), so prep builds are stamped too.
 //  - DuoOwn: this device's half. A state-changing command applies at once (zero input lag) and is recorded as an op stamped
 //    NetTick+1, which is exactly "before the next tick": the partner's replica applies it at the same state point. Refused
 //    commands are never recorded or sent.
 //  - Replica: the partner's half, rebuilt from their stamped ops (never input, never the bridge, never a snapshot). An op the
 //    owner accepted but the replica refuses is a desync the moment it happens.
 //  - Lockstep: two-player endless. A command becomes an intent (PendingOps, provisional purse and tiers), the page stamps it
 //    E+D and both peers execute it at that tick.
 //  Op validation reads only replicated sim state (never paused, focus of the window, selection, preview or real clocks).
 public sealed partial class CarrotGame {
  public int DuoSideIndex {get;private set;}=-1;
  /// <summary>The netTick a duo half entered its hold, or reached its outcome (-1 before).</summary>
  public int HoldTick {get;private set;}=-1;
  public int OutcomeTick {get;private set;}=-1;
  bool partnerCleared,silentRun,lockSolo;
  int noticeSeat=-1,localSeq,netSpeed=1;
  bool netClockRun;float netAccumulator;
  readonly int[] spentBySeat=new int[2];
  readonly List<NetOp> netQueue=new List<NetOp>(),tickOps=new List<NetOp>();
  readonly HashSet<long> seenOps=new HashSet<long>();
  /// <summary>Display names by seat (the builder toast).</summary>
  public string[] NetNames={"",""};
  /// <summary>Match pause (mutual, from the page's control): the clock stops; mirrored into `paused` for the HUD.</summary>
  public bool MatchPaused {get;private set;}
  public int PausedBy {get;private set;}=-1;
  /// <summary>Ops this device issued and the bridge has not sent yet: applied own ops (DuoOwn) or intents (Lockstep).</summary>
  public readonly List<NetOp> OutOps=new List<NetOp>();
  /// <summary>Executed ops of the local seat that were refused at their tick (lockstep), for the {t:'reject'} event.</summary>
  public readonly List<NetOp> NetRejects=new List<NetOp>();
  /// <summary>Replica only: ops the owner accepted that this replica refused (each one is a desync).</summary>
  public int ReplicaRefused {get;private set;}
  /// <summary>Ops that arrived for a tick already executed (protocol violations; each one is a desync).</summary>
  public int LateOps {get;private set;}
  /// <summary>Called after every executed netTick with the tick number (digest rings, results).</summary>
  public Action<int> NetTicked;
  /// <summary>Called on hold, outcome and partner results (the bridge's {t:'result'}).</summary>
  public Action<string> NetOutcome;
  public bool Silent {get{return silentRun;}}
  // A command or selection that arrives while a net tick is running (an Effect handler reacting mid-tick) waits until the tick
  // ends: it then applies and is stamped NetTick+1, the state point every peer applies it at.
  bool inTick;readonly List<Action> deferredInput=new List<Action>();
  bool DeferInput(Action action){if(NetMode==NetMode.None||!inTick)return false;deferredInput.Add(action);return true;}
  void RunDeferred(){if(deferredInput.Count==0)return;var list=deferredInput.ToArray();deferredInput.Clear();foreach(var a in list)a();}
  public int SpentBySeat(int seat){return seat==0||seat==1?spentBySeat[seat]:0;}
  public int QueuedOps {get{return netQueue.Count;}}
  void Spent(int seat,int cost){if(seat==0||seat==1)spentBySeat[seat]+=cost;}

  void ResetNet(){
   NetTick=0;DuoHold=false;HoldTick=-1;OutcomeTick=-1;partnerCleared=false;noticeSeat=-1;netQueue.Clear();tickOps.Clear();seenOps.Clear();PendingOps.Clear();
   spentBySeat[0]=spentBySeat[1]=0;netAccumulator=0;LastReject="";MatchPaused=false;PausedBy=-1;OutOps.Clear();NetRejects.Clear();ReplicaRefused=0;LateOps=0;
  }
  /// <summary>Enter a net mode on the level already loaded (LoadLevel(id,"duo",side) or LoadLevel(90,"endless",seed)).</summary>
  public void NetBegin(NetMode mode,int seat){
   NetMode=mode;NetSeat=seat==1?1:0;localSeq=0;noticeSeat=-1;netClockRun=false;netSpeed=1;netAccumulator=0;lockSolo=false;
   if(mode!=NetMode.None){paused=false;accumulator=0;ClearTimeScale();backgrounded=false;}
  }
  /// <summary>Leave net mode (the match ended or the player left); the page loads a level next.</summary>
  public void NetEnd(){NetMode=NetMode.None;netClockRun=false;lockSolo=false;MatchPaused=false;PausedBy=-1;PendingOps.Clear();netQueue.Clear();}
  /// <summary>The next seq this device will stamp (reconnect: continue after a replayed log).</summary>
  public int LocalSeq {get{return localSeq;}set{localSeq=Mathf.Max(localSeq,value);}}
  /// <summary>Duo own-half clock ({t:'clock'}): run and speed (1|2; shared by both halves).</summary>
  public void SetMatchClock(bool run,int speedSetting){netClockRun=run;netSpeed=speedSetting>=2?2:1;if(NetMode==NetMode.DuoOwn)speed=netSpeed;if(!run)netAccumulator=0;}
  public bool MatchClockRunning {get{return netClockRun&&!MatchPaused;}}
  public int MatchSpeed {get{return NetMode==NetMode.Lockstep?(speed>=1.5f?2:1):netSpeed;}}
  /// <summary>Lockstep "Continue solo": this device stamps its own ops NetTick+1 and runs its own clock (the partner is gone).</summary>
  public void SetLockstepSolo(bool on){lockSolo=on&&NetMode==NetMode.Lockstep;netClockRun=lockSolo;netAccumulator=0;}
  public bool LockstepSolo {get{return lockSolo;}}
  public void SetMatchPaused(bool on,int by){
   MatchPaused=on;PausedBy=on?by:-1;netAccumulator=0;
   if(paused!=on){paused=on;if(on)ClearTimeScale();Emit("pause",on?"on":"off",Vector3.zero);}
  }

  // ---- The match clock (DuoOwn own half, lockstep solo). The lockstep and replica clocks are paced by the bridge.
  void NetAdvance(float real){
   bool own=NetMode==NetMode.DuoOwn||(NetMode==NetMode.Lockstep&&lockSolo);
   if(!own||!netClockRun||MatchPaused)return;
   int rateSetting=NetMode==NetMode.Lockstep?(speed>=1.5f?2:1):netSpeed;
   netAccumulator+=real*(SpeedHold?Mathf.Min(rateSetting,1):rateSetting);
   for(int n=0;netAccumulator>=Step&&n<8;n++){
    bool held=SpeedHold;NetRunTo(NetTick+1,1,false);netAccumulator-=Step;
    // Time banked at 2x is dropped when a hold begins, so the whole windup plays at 1x (as in single player).
    if(!held&&SpeedHold){netAccumulator=0;break;}
   }
   if(netAccumulator>Step*8)netAccumulator=Step*8;
  }
  /// <summary>Execute netTicks NetTick+1 .. limit, at most maxTicks of them; silent suppresses every Effect event (fast-forward,
  /// replay). Returns the ticks executed.</summary>
  public int NetRunTo(int limit,int maxTicks,bool silent){
   int n=0;bool was=silentRun;silentRun=silent;
   try{
    while(NetTick<limit&&n<maxTicks){
     int t=NetTick+1;ApplyOpsFor(t);NetTick=t;
     if(phase=="playing"&&!DuoHold){inTick=true;try{Tick(Step);}finally{inTick=false;}}
     // The tick's digest first (the state at the end of tick t), then deferred input, which is stamped t+1.
     n++;NetTicked?.Invoke(t);RunDeferred();
    }
   }finally{silentRun=was;}
   return n;
  }
  /// <summary>Queue a stamped op (validated shape; duplicates by (seat, seq) are dropped). False for malformed or late ops.</summary>
  public bool EnqueueOp(NetOp op){
   if(op==null)return false;int code=NetOpCode.Code(op.op);if(!NetOpCode.Executable(code)||(op.seat!=0&&op.seat!=1))return false;
   if(NetMode==NetMode.Replica&&op.seat!=NetSeat)return false;
   long key=((long)op.seat<<32)|(uint)op.s;if(seenOps.Contains(key))return true;
   if(op.k<=NetTick){LateOps++;return false;}
   // Bounds before anything reaches the rules: the Web build only throws explicit exceptions, so a bad index must never be read.
   switch(code){
    case NetOpCode.Buy:if(op.pad<0||op.pad>=level.pads.Length||CarrotData.Tower(op.kind)==null)return false;break;
    case NetOpCode.Upgrade:case NetOpCode.Sell:if(op.id<=0||op.v<0||op.v>5)return false;break;
    case NetOpCode.Merge:if(op.id<=0||op.target<=0)return false;break;
    case NetOpCode.Speed:if(op.v!=1&&op.v!=2)return false;break;
    case NetOpCode.Focus:if(op.type!=""&&op.type!="enemy"&&op.type!="blocker")return false;break;
   }
   seenOps.Add(key);netQueue.Add(op);return true;
  }
  void ApplyOpsFor(int t){
   if(netQueue.Count==0)return;tickOps.Clear();
   for(int i=netQueue.Count-1;i>=0;i--)if(netQueue[i].k<=t){tickOps.Add(netQueue[i]);netQueue.RemoveAt(i);}
   if(tickOps.Count==0)return;int first=(t&1)==0?0:1;
   tickOps.Sort((a,b)=>{int x=a.seat==first?0:1,y=b.seat==first?0:1;if(x!=y)return x.CompareTo(y);int c=a.s.CompareTo(b.s);return c!=0?c:a.seat.CompareTo(b.seat);});
   for(int i=0;i<tickOps.Count;i++){
    var op=tickOps[i];LastReject="";bool ok=ExecuteOp(op);
    if(NetMode==NetMode.Lockstep){bool mine=false;for(int p=PendingOps.Count-1;p>=0;p--)if(PendingOps[p].s==op.s&&PendingOps[p].seat==op.seat){PendingOps.RemoveAt(p);mine=true;}if(!ok&&mine){var r=op.Clone();r.type=LastReject;NetRejects.Add(r);}}
    if(!ok&&NetMode==NetMode.Replica)ReplicaRefused++;
   }
   tickOps.Clear();
  }
  /// <summary>Apply one op through the selection-free entry points. The local seat's own buy/sell/merge/undo moves the local
  /// selection only while the player still points at what it acted on (a partner's op never touches it).</summary>
  bool ExecuteOp(NetOp op){
   bool local=op.seat==NetSeat&&NetMode!=NetMode.Replica;
   // A duo half's own op runs the moment it is issued: it moves the selection exactly as single player does.
   bool now=local&&(NetMode==NetMode.DuoOwn||lockSolo);
   switch(op.op){
    case "buy":return BuyAt(op.pad,op.kind,op.seat,now||local&&selectionType=="pad"&&selectionId==op.pad);
    case "upgrade":return UpgradeTower(op.id,op.v,op.seat);
    case "sell":return SellTower(op.id,op.v,op.seat,now||local&&selectionType=="tower"&&selectionId==op.id);
    case "merge":return MergeTowers(op.id,op.target,op.seat,now||local&&(selectionType==""||selectionType=="tower"&&(selectionId==op.id||selectionId==op.target)));
    case "mergeUndo":return MergeUndoBy(op.seat,op.id,now||local&&(selectionType==""||selectionType=="tower"&&selectionId==op.id));
    case "next":return CallNext(op.seat);
    case "speed":if(NetMode!=NetMode.Lockstep)return Refuse("mode");speed=op.v>=2?2:1;return true;
    case "start":return StartMatch();
    case "focus":return SetFocus(op.type,op.id);
   }
   return Refuse("op");
  }
  bool StartMatch(){
   if(phase!="ready"||DuoHold)return Refuse("phase");
   phase="playing";SetNotice("Defend the carrot",2);BeginWave();Emit("start",level.biome,Vector3.zero);return true;
  }
  /// <summary>Call the next wave early (pays the breather seconds skipped). Net modes never read the pause flag: it is not replicated.</summary>
  bool CallNext(int seat){
   if(phase=="playing"&&!DuoHold&&wave<level.waves&&nextWave>0&&CurrentWaveResolved()){int bonus=CarrotData.EarlyCallBonus(nextWave);coins+=bonus;TotalEarned+=bonus;BeginWave();return true;}
   return Refuse("wave");
  }
  /// <summary>Focus fire: an alive enemy, a standing blocker, or "" to clear.</summary>
  public bool SetFocus(string type,int id){
   if(phase!="ready"&&phase!="playing"||DuoHold)return Refuse("phase");
   if(string.IsNullOrEmpty(type)){focusType="";focusId=-1;return true;}
   if(type=="enemy"){var e=EnemyById(id);if(e==null||!e.alive)return Refuse("target");}
   else if(type=="blocker"){if(BlockerById(id)==null)return Refuse("target");}
   else return Refuse("target");
   focusType=type;focusId=id;return true;
  }

  // ---- Page commands in a net mode.
  void NetCommand(string type,string kind,string selType,int id,int target,float value){
   switch(type){
    // Match-level controls belong to the page's session (start arrives as {t:'go'}, pause as {t:'pause'}); a load would
    // abandon the match, so it is refused until {t:'end'}.
    case "load":case "start":case "pause":case "setPaused":return;
    case "speed":if(NetMode==NetMode.Lockstep)IssueOp(new NetOp{op="speed",v=value>=1.5f?2:1});return;
    case "next":IssueOp(new NetOp{op="next"});return;
    case "preview":if(CarrotData.Tower(kind)!=null){PreviewKind=kind;Emit("preview",kind,Vector3.zero);}return;
    case "buy":if(selectionType=="pad"&&CarrotData.Tower(kind)!=null)IssueOp(new NetOp{op="buy",pad=selectionId,kind=kind});return;
    case "upgrade":if(selectionType=="tower")IssueOp(new NetOp{op="upgrade",id=selectionId});return;
    case "sell":if(selectionType=="tower")IssueOp(new NetOp{op="sell",id=selectionId});return;
    case "merge":IssueOp(new NetOp{op="merge",id=id,target=target});return;
    case "mergeArm":{var t=towers.Find(x=>x.id==id);mergeArmed=t!=null&&t.tier==4&&Partners(t)>0?t.id:0;return;}
    case "mergeUndo":IssueOp(new NetOp{op="mergeUndo",id=lastMerge!=null?lastMerge.targetId:0});return;
    case "select":Select(selType,id);return;
    case "clear":Select("",-1);return;
    case "mute":{muted=value>0;var view=GetComponent<CarrotView>();if(view!=null)view.SetMuted(muted);return;}
#if UNITY_EDITOR || DEVELOPMENT_BUILD || CARROT_QA
    // QA: a local, unrecorded purse change is the desync positive control (the digests must catch it).
    case "debugCoins":if(CanManage()){coins=Mathf.Max(0,coins+Mathf.RoundToInt(value));}return;
#endif
   }
  }
  /// <summary>DuoOwn: the selection moved the focus (the single-player rule); apply it now and send it as a focus op.</summary>
  void NetFocusOp(string type,int id){
   if(phase!="ready"&&phase!="playing"||DuoHold)return;
   focusType=type;focusId=id;var op=new NetOp{op="focus",type=type,id=id,seat=NetSeat,s=++localSeq,k=NetTick+1};
   seenOps.Add(((long)op.seat<<32)|(uint)op.s);OutOps.Add(op);
  }
  void NetSelectFocus(string type,int id){
   bool clear=focusType==type&&focusId==id;
   if(clear)SetSelection("",-1);else SetSelection(type,id);
   IssueOp(new NetOp{op="focus",type=clear?"":type,id=clear?-1:id});
  }
  /// <summary>The local seat's op: DuoOwn applies it now (recorded only if accepted); Lockstep checks it against the provisional
  /// state (purse minus pending costs, tiers plus pending upgrades, pads with pending builds) and sends it as an intent.</summary>
  void IssueOp(NetOp op){
   op.seat=NetSeat;
   if(NetMode==NetMode.DuoOwn||(NetMode==NetMode.Lockstep&&lockSolo)){
    if(op.op=="upgrade"||op.op=="sell"){var t=TowerById(op.id);if(t==null)return;op.v=t.tier;}
    // The seq is taken before the op runs, so a focus op it causes (its selection move) follows it; a refused op returns it.
    op.s=++localSeq;op.k=NetTick+1;LastReject="";int outBefore=OutOps.Count;
    if(!ExecuteOp(op)){if(OutOps.Count==outBefore)localSeq--;return;}
    seenOps.Add(((long)op.seat<<32)|(uint)op.s);OutOps.Insert(outBefore,op);return;
   }
   if(NetMode!=NetMode.Lockstep)return;
   if(!Provisional(op))return;
   op.s=++localSeq;op.k=0;PendingOps.Add(op);OutOps.Add(op);
  }
  /// <summary>The purse after every pending intent of this seat.</summary>
  public int ProvisionalCoins {get{int c=coins;for(int i=0;i<PendingOps.Count;i++)c-=PendingOps[i].cost;return c;}}
  int PendingUpgrades(int id){int n=0;for(int i=0;i<PendingOps.Count;i++)if(PendingOps[i].op=="upgrade"&&PendingOps[i].id==id)n++;return n;}
  bool Provisional(NetOp op){
   int purse=ProvisionalCoins;
   switch(op.op){
    case "buy":{var d=CarrotData.Tower(op.kind);if(d==null||d.unlock>level.id||!CanManage())return false;
     if(op.pad<0||op.pad>=level.pads.Length||towers.Exists(x=>x.pad==op.pad)||blockers.Exists(x=>x.pad==op.pad))return false;
     foreach(var p in PendingOps)if(p.op=="buy"&&p.pad==op.pad)return false;
     if(purse<d.cost[0]){SeatNotice(NetSeat,"More coins needed",1.6f);return false;}op.cost=d.cost[0];return true;}
    case "upgrade":{var t=TowerById(op.id);if(t==null||!CanManage())return false;int tier=t.tier+PendingUpgrades(t.id);if(tier>=4)return false;
     int cost=CarrotData.Tower(t.kind).cost[tier];if(purse<cost){SeatNotice(NetSeat,"More coins needed",1.6f);return false;}op.v=tier;op.cost=cost;return true;}
    case "sell":{var t=TowerById(op.id);if(t==null||!CanManage())return false;op.v=t.tier+PendingUpgrades(t.id);return true;}
    case "merge":{var a=TowerById(op.id);var b=TowerById(op.target);return a!=null&&b!=null&&a.id!=b.id&&a.kind==b.kind&&a.tier+PendingUpgrades(a.id)==4&&b.tier+PendingUpgrades(b.id)==4&&CanManage();}
    case "mergeUndo":return lastMerge!=null&&lastMerge.seat==NetSeat&&op.id>0;
    case "next":return phase=="playing"&&wave<level.waves&&nextWave>0&&CurrentWaveResolved();
    case "focus":case "speed":case "start":return true;
   }
   return false;
  }
  /// <summary>Lockstep {t:'go'}: the host's seat issues the start intent (both peers execute it at its stamped tick).
  /// DuoOwn: the own start op applies now.</summary>
#if UNITY_EDITOR
  /// <summary>Tests and the endless bots: issue a page command or selection as `seat` (two bot seats on one lockstep instance).</summary>
  public void TestAsSeat(int seat,Action action){int keep=NetSeat;NetSeat=seat==1?1:0;try{action();}finally{NetSeat=keep;}}
#endif
  public void NetGo(){if(NetMode==NetMode.DuoOwn||lockSolo||(NetMode==NetMode.Lockstep&&NetSeat==0))IssueOp(new NetOp{op="start"});}

  // ---- Duo hold and results.
  bool DuoHolds(){return NetMode==NetMode.DuoOwn||NetMode==NetMode.Replica;}
  /// <summary>The half cleared its final wave and boss: freeze it (no Tick runs, every state-changing op is refused) so the award
  /// inputs (hearts, scenery, towers, elapsed) are exactly the clear tick's. A solo player's run ends at this very tick.</summary>
  void EnterHold(){
   if(DuoHold||phase!="playing")return;DuoHold=true;HoldTick=NetTick;nextWave=0;
   if(SpeedHold){SpeedHold=false;SpeedHoldReason="";Emit("speedHold","",Vector3.zero,value:0);}
   SetNotice("Your garden is safe",4);Emit("hold",level.biome,level.routes[0][level.routes[0].Length-1],value:health,duration:1);
   NetOutcome?.Invoke("cleared");
   if(partnerCleared)ResolveTeamWin();
  }
  void ResolveTeamWin(){if(phase!="playing")return;SetOutcome(true);}
  /// <summary>The partner's half reported its outcome: "cleared" wins the match once this half holds too; "lost" loses it at once.</summary>
  public void PartnerResult(string outcome){
   if(outcome=="cleared"){partnerCleared=true;if(DuoHold)ResolveTeamWin();}
   else if(outcome=="lost"&&phase=="playing")SetOutcome(false);
  }
  public bool PartnerCleared {get{return partnerCleared;}}
  /// <summary>A partner sold or merged a tower this seat built: the builder hears about it (griefing is visible, never blocked).</summary>
  void PartnerActed(int seat,int builder,string verb,string kind,int refund){
   var d=CarrotData.Tower(kind);string who=NetNames!=null&&seat>=0&&seat<NetNames.Length&&!string.IsNullOrEmpty(NetNames[seat])?NetNames[seat]:"Your partner";
   SeatNotice(builder,who+" "+verb+" your "+(d!=null?d.name:kind)+(refund>0?", +"+refund:""),2.4f);
   Emit("partnerActed",kind,Vector3.zero,id:seat,target:builder,value:refund);
  }
  string VisibleNotice(){return noticeSeat<0||noticeSeat==NetSeat?notice:"";}

  // ---- Digests: NetDigest extends Digest/DiscreteDigest (which stay byte-for-byte as they were) with the rng, ids, the clock,
  // the schedule, projectiles, summons, focus and the wave arrays; NaN is folded to one value. Selection, notice text,
  // mergeArmed and the preview are local and never hashed.
  public void NetDigest(out uint discrete,out uint floats){NetDigest(out discrete,out floats,0);}
  /// <summary>mirror 1 hashes -x and 2 hashes -z of every position: a duo half compared with its mirror twin (negation is exact).</summary>
  public void NetDigest(out uint discrete,out uint floats,int mirror){
   ulong h=1469598103934665603UL,f=h;float sx=mirror==1?-1:1,sz=mirror==2?-1:1;
   Mix(ref h,(ulong)coins);Mix(ref h,(ulong)health);Mix(ref h,(ulong)wave);Mix(ref h,Str(phase));Mix(ref h,(ulong)TotalEarned);Mix(ref h,(ulong)statKills);
   Mix(ref h,rng);Mix(ref h,(ulong)nextId);Mix(ref h,(ulong)NetTick);Mix(ref h,(ulong)pendingSummons);Mix(ref h,(ulong)unresolvedContacts);Mix(ref h,DuoHold?1UL:0UL);
   Mix(ref h,Str(focusType));Mix(ref h,(ulong)(long)focusId);Mix(ref h,(ulong)extraSpawns.Count);Mix(ref h,(ulong)graves.Count);if(NetMode==NetMode.Lockstep)Mix(ref h,(ulong)(speed>=1.5f?2:1));
   Mix(ref h,(ulong)spentBySeat[0]);Mix(ref h,(ulong)spentBySeat[1]);Mix(ref h,lastMerge!=null?(ulong)lastMerge.targetId:0UL);Mix(ref h,(ulong)resolvedWork);
   Mix(ref f,NetBits(elapsed));Mix(ref f,NetBits(nextWave));Mix(ref f,NetBits(blindUntil));
   foreach(var e in enemies){Mix(ref h,(ulong)e.id);Mix(ref h,e.alive?1UL:0UL);Mix(ref h,(ulong)e.phase);Mix(ref h,(ulong)e.stage);Mix(ref h,e.hidden?1UL:0UL);Mix(ref h,Str(e.ability));Mix(ref h,Str(e.kind));Mix(ref h,(ulong)e.route);
    Mix(ref f,NetBits(e.hp));Mix(ref f,NetBits(e.distance));Mix(ref f,NetBits(e.shield));Mix(ref f,NetBits(e.position.x*sx));Mix(ref f,NetBits(e.position.z*sz));Mix(ref f,NetBits(e.speed));}
   foreach(var t in towers){Mix(ref h,(ulong)t.id);Mix(ref h,(ulong)t.tier);Mix(ref h,(ulong)t.pad);Mix(ref h,(ulong)t.spent);Mix(ref h,(ulong)(long)t.builder);Mix(ref h,Str(t.kind));
    Mix(ref f,NetBits(t.cooldown));Mix(ref f,NetBits(t.slowFor));Mix(ref f,NetBits(t.disabledFor));Mix(ref f,NetBits(t.stunnedFor));}
   foreach(var b in blockers){Mix(ref h,(ulong)b.id);Mix(ref h,(ulong)(long)b.pad);Mix(ref h,Str(b.kind));Mix(ref f,NetBits(b.hp));}
   foreach(var s in spawns){Mix(ref h,(ulong)s.wave);Mix(ref h,(ulong)s.route);Mix(ref h,Str(s.kind));Mix(ref f,NetBits(s.at));}
   foreach(var p in projectiles){Mix(ref h,(ulong)p.source);Mix(ref h,(ulong)(long)p.target);Mix(ref h,(ulong)p.tier);Mix(ref f,NetBits(p.remaining));Mix(ref f,NetBits(p.damage));}
   int top=Mathf.Min(level.waves,wave+1);
   for(int w=1;w<=top;w++){Mix(ref h,(ulong)(long)waveLiving[w]);Mix(ref h,(ulong)(long)wavePending[w]);Mix(ref h,(ulong)(long)waveBoss[w]);Mix(ref h,waveStarted[w]?1UL:0UL);Mix(ref h,wavePaid[w]?1UL:0UL);}
   discrete=(uint)(h^(h>>32));floats=(uint)(f^(f>>32));
  }
  static ulong Str(string s){if(s==null)return 0xA5A5UL;ulong h=(ulong)s.Length;for(int i=0;i<s.Length;i++)h=h*31+s[i];return h;}
  static ulong NetBits(float v){if(float.IsNaN(v))return 0x7FC00000UL;return Bits(v);}

  // ---- Snapshot block (bridge contract v2, additive): net {mode, netMode, seat, side, hold, netTick, matchPaused, pausedBy, pending[], score?, ...}.
  void WriteNet(JsonOut j){
   j.ObjectStart("net");j.Str("mode",Mode);j.Str("netMode",NetMode==NetMode.DuoOwn?"duo":NetMode==NetMode.Lockstep?"lockstep":NetMode==NetMode.Replica?"replica":"none");
   j.Int("seat",NetSeat);j.Int("side",DuoSideIndex);j.Bool("hold",DuoHold);j.Bool("partnerCleared",partnerCleared);j.Int("netTick",NetTick);j.Bool("matchPaused",MatchPaused);j.Int("pausedBy",PausedBy);j.Int("speed",MatchSpeed);
   j.ArrayStart("pending");for(int i=0;i<PendingOps.Count;i++){var p=PendingOps[i];j.ItemStart();j.Int("s",p.s);j.Str("op",p.op);j.Int("pad",p.pad);j.Str("kind",p.kind??"");j.Int("id",p.id);j.Int("cost",p.cost);j.ItemEnd();}j.ArrayEnd();
   j.ArrayStart("spent");j.IntItem(spentBySeat[0]);j.IntItem(spentBySeat[1]);j.ArrayEnd();
   if(isEndless){
    j.Int("score",endlessCleared);j.Int("provisionalCoins",ProvisionalCoins);j.Int("liveEnemies",LiveEnemies);
    // The seeded preview: the next boss and miniboss waves (the HUD's "boss in N waves").
    int bw=(wave/10+1)*10,mw=wave%10<5?wave/10*10+5:(wave/10+1)*10+5;var b=EndlessWave(bw);var m=EndlessWave(mw);
    j.Int("bossWave",bw);j.Str("bossKind",b!=null?b.boss:"");j.Str("bossName",b!=null?CarrotData.BossName(b.boss):"");
    j.Int("miniWave",mw);j.ArrayStart("minis");if(m!=null)foreach(var k in m.minis)j.StrItem(k);j.ArrayEnd();
   }
   j.ObjectEnd();
  }
 }
}
