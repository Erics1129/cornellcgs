using System;
using System.Collections.Generic;
using System.Diagnostics;
using System.Globalization;
using System.Text;
using UnityEngine;

namespace CarrotTD {
 /// <summary>
 /// The C# end of the page's net bridge: every JS-to-Unity Net message, the replica's pacing, the lockstep driver, digests,
 /// results, state export/import and chunked replay. Pure simulation code (compiled by carrot-sim, so the Node tests run the
 /// real message handling); CarrotNetBridge.cs only hosts it in a MonoBehaviour and moves the bytes.
 ///  - Inbound: Receive(json). Re-entrant calls (a page handler answering synchronously from inside a flush) are counted and
 ///    deferred to the next frame, never applied mid-tick.
 ///  - Outbound: Flush() returns one JSON array per frame (null when empty), ordered own ops, rejects, ticks, results, the rest.
 /// </summary>
 public sealed class CarrotNetSession {
  public const int NetVersion=1,DigestEvery=30,DeepEvery=300;
  public readonly CarrotGame own;
  public CarrotGame replica {get;private set;}
  /// <summary>Creates the inactive partner object with its CarrotGame (the bridge's factory; tests use a plain object).</summary>
  public Func<CarrotGame> CreateReplica;
  public Action<CarrotGame> DestroyReplica;
  /// <summary>Called once the replica has loaded its half, before it is activated (view attach point).</summary>
  public Action<CarrotGame> ReplicaReady;
  public string mode="";public int level,seat,side=-1;public uint seed;public string[] names={"",""};
  public bool Active {get{return mode!="";}}
  public int Reentries {get;private set;}
  /// <summary>Sessions begun on this object (the bridge reconfigures the host view for every new match, not only the first).</summary>
  public int Begins {get;private set;}
  /// <summary>Duo: own ops this device has applied and handed to the page so far (the page's wire seqs are 1..this, in order).
  /// A DuoOwn op applies when it is issued and is stamped NetTick+1, so a state exported at T can already hold ops stamped T+1;
  /// the export reports this count so the partner re-sends exactly the ops after it.</summary>
  int ownOpsOut;
  public int DigestsCompared {get;private set;}
  public int DeepCompared {get;private set;}
  public int Mismatches {get;private set;}
  public int Unverified {get;private set;}
  /// <summary>Digests after the match ended on this device (not comparable, see ForceReplica).</summary>
  public int PastEnd {get;private set;}
  public int ReplicaCompareLimit {get{return replicaCompareLimit;}}
  public long FrameTicks,FastForwardTicks;

  readonly List<string> outOps=new List<string>(),outTicks=new List<string>(),outResults=new List<string>(),outMisc=new List<string>();
  readonly List<string> deferred=new List<string>();
  bool busy;
  // Replica pacing.
  int partnerExec,buffer=3,matchSpeed=1;float replicaAcc,viewClock;
  // Lockstep.
  int stepLimit;
  // Digest bookkeeping: own and replica digests by tick, and the partner's (remote) digests waiting for the local side.
  readonly Dictionary<int,ulong> ownDigests=new Dictionary<int,ulong>(),replicaDigests=new Dictionary<int,ulong>(),remoteDigests=new Dictionary<int,ulong>();
  readonly Dictionary<int,uint> ownDeep=new Dictionary<int,uint>(),replicaDeep=new Dictionary<int,uint>(),remoteDeep=new Dictionary<int,uint>();
  int lastOwnWave,lastReplicaWave;
  // Results.
  string partnerOutcome="",replicaOutcome="";int partnerOutcomeTick=-1,replicaOutcomeTick=-1;bool ownCausePartner;
  // Chunked replay.
  sealed class Replay {public string target;public int to;public Stopwatch watch;}
  Replay replay;

  public CarrotNetSession(CarrotGame game){own=game;CarrotNetHooks.ViewEvent+=OnViewEvent;}
  public void Dispose(){CarrotNetHooks.ViewEvent-=OnViewEvent;End();}
  void OnViewEvent(string kind){if(Active)outMisc.Add("{\"t\":\"view\",\"kind\":"+Q(kind)+"}");}

  [Serializable] public class NetIn {
   public string t,mode,outcome,target,b64;public int level,seat,side,exec,to,tick,b,by,pad,tower,netVersion,speed;public long seed;public bool run,on;
   public string[] names;public NetOp[] ops;public long[] d,dh;public int seq;
  }
  /// <summary>One JS-to-Unity message ({t:...}); unknown types are ignored and logged.</summary>
  public void Receive(string json){
   if(busy){Reentries++;deferred.Add(json);return;}
   NetIn m;try{m=JsonUtility.FromJson<NetIn>(json);}catch(Exception e){Log("bad message "+e.Message);return;}
   if(m==null||string.IsNullOrEmpty(m.t)){Log("message without t");return;}
   switch(m.t){
    case "session":Begin(m);break;
    case "clock":matchSpeed=m.speed>=2?2:1;own.SetMatchClock(m.run,matchSpeed);if(replica!=null)replica.speed=matchSpeed;break;
    case "go":own.NetGo();break;
    case "replica":if(replica==null)break;if(m.b>0)buffer=Mathf.Clamp(m.b,1,30);if(m.ops!=null)foreach(var op in m.ops){int late=replica.LateOps;if(!replica.EnqueueOp(op)&&replica.LateOps>late)Desync("late",replica.NetTick,0,0,"replica");}
     if(m.exec>partnerExec)partnerExec=m.exec;Remote(m.d,m.dh);break;
    case "partner":PartnerReport(m.outcome,m.tick);break;
    case "step":if(m.ops!=null)foreach(var op in m.ops){int late=own.LateOps;if(!own.EnqueueOp(op)&&own.LateOps>late)Desync("late",own.NetTick,0,0,"self");}
     if(m.to>stepLimit)stepLimit=m.to;Remote(m.d,m.dh);break;
    case "pause":own.SetMatchPaused(m.on,m.by);if(replica!=null)replica.SetMatchPaused(m.on,m.by);break;
    case "export":{var g=m.target=="replica"?replica:own;if(g!=null)outMisc.Add("{\"t\":\"state\",\"target\":"+Q(m.target=="replica"?"replica":"self")+",\"tick\":"+g.NetTick+(g==own&&mode=="duo"?",\"seq\":"+OwnOpsInState:"")+",\"b64\":"+Q(g.ExportStateBase64())+"}");break;}
    case "import":Import(m.target=="replica"?replica:own,m.target=="replica"?"replica":"self",m.tick,m.b64,m.seq);break;
    case "replay":StartReplay(m.target=="replica"?"replica":"self",m.ops,m.to);break;
    case "camera":CarrotNetHooks.Camera?.Invoke(m.mode=="partner"||m.mode=="both"?m.mode:"own");break;
    case "presence":CarrotNetHooks.Presence?.Invoke(m.seat,m.pad,m.tower);break;
    case "solo":own.SetLockstepSolo(m.on);break;
    case "end":End();break;
    default:Log("ignored message "+m.t);break;
   }
  }
  static void Log(string text){UnityEngine.Debug.Log("CARROT_NET "+text);}

  void Begin(NetIn m){
   End();
   if(m.netVersion!=0&&m.netVersion!=NetVersion){outMisc.Add("{\"t\":\"error\",\"code\":\"version-mismatch\"}");return;}
   seat=m.seat==1?1:0;names=m.names!=null&&m.names.Length>=2?new[]{m.names[0]??"",m.names[1]??""}:new[]{"",""};
   if(m.mode=="endless"){
    mode="endless";level=CarrotDuoMaps.EndlessId;seed=(uint)(m.seed&0xFFFFFFFFL);side=-1;
    own.LoadLevel(level,"endless",seed);own.NetBegin(NetMode.Lockstep,seat);
   } else if(m.mode=="duo"&&CarrotDuoMaps.IsDuoLevel(m.level)){
    mode="duo";level=m.level;side=m.side==1?1:0;
    own.LoadLevel(level,"duo",(uint)side);own.NetBegin(NetMode.DuoOwn,seat);
    replica=CreateReplica!=null?CreateReplica():null;
    if(replica!=null){replica.AutoTick=false;replica.EnableBridge=false;replica.SnapshotEnabled=false;replica.LoadLevel(level,"duo",(uint)(1-side));replica.NetBegin(NetMode.Replica,1-seat);replica.NetNames=names;replica.NetTicked=ReplicaTicked;replica.NetOutcome=ReplicaOutcome;ReplicaReady?.Invoke(replica);}
   } else {outMisc.Add("{\"t\":\"error\",\"code\":\"bad-session\"}");return;}
   own.NetNames=names;own.NetTicked=OwnTicked;own.NetOutcome=OwnOutcome;
   partnerExec=0;stepLimit=0;replicaAcc=0;lastOwnWave=0;lastReplicaWave=0;matchSpeed=1;
   ownDigests.Clear();replicaDigests.Clear();remoteDigests.Clear();ownDeep.Clear();replicaDeep.Clear();remoteDeep.Clear();
   partnerOutcome=replicaOutcome="";partnerOutcomeTick=replicaOutcomeTick=-1;ownCausePartner=false;replicaForced=false;refusedSeen=0;replicaCompareLimit=int.MaxValue;
   ownOpsOut=0;Begins++;
   outMisc.Add("{\"t\":\"loaded\",\"exec\":0}");
  }
  public void End(){
   if(!Active&&replica==null)return;
   own.NetTicked=null;own.NetOutcome=null;if(own.NetMode!=NetMode.None)own.NetEnd();
   if(replica!=null){replica.NetTicked=null;replica.NetOutcome=null;DestroyReplica?.Invoke(replica);replica=null;}
   mode="";replay=null;
  }

  /// <summary>One frame: replica pacing, the lockstep driver and chunked replay (the own duo clock runs in CarrotGame.AdvanceReal).</summary>
  public void Frame(float real){
   if(deferred.Count>0){var list=deferred.ToArray();deferred.Clear();foreach(var json in list)Receive(json);}
   if(!Active)return;busy=true;
   try{
    if(replay!=null){StepReplay();return;}
    if(own.NetMode==NetMode.Lockstep&&!own.LockstepSolo){
     int behind=stepLimit-own.NetTick;
     if(behind>60)FastForward(own,stepLimit);else FrameTicks+=own.NetRunTo(stepLimit,8,false);
    }
    if(replica!=null)PaceReplica(real);
    if(replica!=null){viewClock+=real;if(viewClock>=.25f){viewClock=0;PartnerView();}}
   }finally{busy=false;}
  }
  void PaceReplica(float real){
   int target=Mathf.Max(0,partnerExec-buffer),behind=target-replica.NetTick;
   if(behind>60){FastForward(replica,target);replicaAcc=0;return;}
   float rate=(replica.SpeedHold?1:matchSpeed)*(behind>1?1.1f:behind<-1?.9f:1f);
   if(replica.MatchPaused&&behind<=0)return;
   replicaAcc+=real*30*rate;int n=Mathf.Min(4,(int)replicaAcc);replicaAcc-=n;
   int limit=Mathf.Min(replica.NetTick+n,partnerExec);
   int done=replica.NetRunTo(limit,4,false);if(done<n)replicaAcc=0;FrameTicks+=done;
  }
  /// <summary>Silent catch-up (no Effect events, no snapshot) toward `limit`, at most 120 ticks and 8 ms per frame.</summary>
  void FastForward(CarrotGame g,int limit){
   var watch=Stopwatch.StartNew();int done=0;
   while(g.NetTick<limit&&done<120&&watch.Elapsed.TotalMilliseconds<8)done+=g.NetRunTo(Mathf.Min(limit,g.NetTick+10),10,true);
   FastForwardTicks+=done;
  }

  // ---- Digests.
  static ulong Pack(uint d,uint f){return ((ulong)d<<32)|f;}
  void OwnTicked(int t){
   bool waveStart=own.wave!=lastOwnWave;lastOwnWave=own.wave;
   if(t%DigestEvery==0){uint d,f;own.NetDigest(out d,out f);ownDigests[t]=Pack(d,f);outTicks.Add("{\"t\":\"tick\",\"exec\":"+t+",\"d\":["+t+","+d+","+f+"]}");if(mode=="endless")Compare(t,false,ownDigests,"self");Trim(ownDigests,t);}
   if(t%DeepEvery==0||waveStart){uint deep=(uint)own.NetDeepHash();ownDeep[t]=deep;outTicks.Add("{\"t\":\"tick\",\"exec\":"+t+",\"dh\":["+t+","+deep+"]}");if(mode=="endless")CompareDeep(t,ownDeep,"self");TrimDeep(ownDeep,t);}
  }
  void ReplicaTicked(int t){
   bool waveStart=replica.wave!=lastReplicaWave;lastReplicaWave=replica.wave;
   if(t%DigestEvery==0){uint d,f;replica.NetDigest(out d,out f);replicaDigests[t]=Pack(d,f);outTicks.Add("{\"t\":\"tick\",\"exec\":"+own.NetTick+",\"rd\":["+t+","+d+","+f+"]}");Compare(t,true,replicaDigests,"replica");Trim(replicaDigests,t);}
   if(t%DeepEvery==0||waveStart){uint deep=(uint)replica.NetDeepHash();replicaDeep[t]=deep;outTicks.Add("{\"t\":\"tick\",\"exec\":"+own.NetTick+",\"rdh\":["+t+","+deep+"]}");CompareDeep(t,replicaDeep,"replica");TrimDeep(replicaDeep,t);}
   // An op the owner accepted and this replica refused: a desync at once (not at the next digest).
   if(replica.ReplicaRefused>refusedSeen){refusedSeen=replica.ReplicaRefused;Desync("refused",t,0,0,"replica");}
  }
  int refusedSeen;bool replicaForced;
  /// <summary>The partner's digests ([tick, disc, float]...) and deep hashes ([tick, deep]...): duo for the replica, lockstep for self.</summary>
  void Remote(long[] d,long[] dh){
   var local=mode=="duo"?replicaDigests:ownDigests;var localDeep=mode=="duo"?replicaDeep:ownDeep;string where=mode=="duo"?"replica":"self";
   if(d!=null)for(int i=0;i+2<d.Length;i+=3){int t=(int)d[i];remoteDigests[t]=Pack((uint)d[i+1],(uint)d[i+2]);if(local.ContainsKey(t))Compare(t,mode=="duo",local,where);}
   if(dh!=null)for(int i=0;i+1<dh.Length;i+=2){int t=(int)dh[i];remoteDeep[t]=(uint)dh[i+1];if(localDeep.ContainsKey(t))CompareDeep(t,localDeep,where);}
   // Remote digests far behind the local clock that never met a local value are counted (never treated as a pass).
   int now=mode=="duo"&&replica!=null?replica.NetTick:own.NetTick;var stale=new List<int>();foreach(var kv in remoteDigests)if(kv.Key<now-2400)stale.Add(kv.Key);foreach(int t in stale){remoteDigests.Remove(t);Unverified++;}
  }
  void Compare(int t,bool isReplica,Dictionary<int,ulong> local,string where){
   ulong r,l;if(!remoteDigests.TryGetValue(t,out r)||!local.TryGetValue(t,out l))return;remoteDigests.Remove(t);
   if(where=="replica"&&t>replicaCompareLimit){PastEnd++;return;}DigestsCompared++;
   if(r!=l)Desync("digest",t,l,r,where);
  }
  void CompareDeep(int t,Dictionary<int,uint> local,string where){
   uint r,l;if(!remoteDeep.TryGetValue(t,out r)||!local.TryGetValue(t,out l))return;remoteDeep.Remove(t);if(where=="replica"&&t>replicaCompareLimit)return;DeepCompared++;
   if(r!=l)Desync("deep",t,((ulong)l)<<32,((ulong)r)<<32,where);
  }
  static void Trim(Dictionary<int,ulong> ring,int t){if(ring.Count<=80)return;var old=new List<int>();foreach(var k in ring.Keys)if(k<t-DigestEvery*64)old.Add(k);foreach(int k in old)ring.Remove(k);}
  static void TrimDeep(Dictionary<int,uint> ring,int t){if(ring.Count<=40)return;var old=new List<int>();foreach(var k in ring.Keys)if(k<t-DeepEvery*16)old.Add(k);foreach(int k in old)ring.Remove(k);}
  void Desync(string kind,int tick,ulong local,ulong remote,string where){
   Mismatches++;
   outMisc.Add("{\"t\":\"desync\",\"kind\":"+Q(kind)+",\"where\":"+Q(where)+",\"tick\":"+tick+",\"local\":["+(uint)(local>>32)+","+(uint)local+"],\"remote\":["+(uint)(remote>>32)+","+(uint)remote+"]}");
  }
  /// <summary>Lockstep and duo QA: the replica's or own digest at tick t, if still in the ring (tests).</summary>
  public bool DigestAt(bool isReplica,int t,out ulong value){return (isReplica?replicaDigests:ownDigests).TryGetValue(t,out value);}

  // ---- Results.
  void OwnOutcome(string outcome){
   int tick=outcome=="cleared"?own.HoldTick:own.OutcomeTick;
   string cause=outcome=="won"?"team":outcome=="lost"&&ownCausePartner?"partner":"self";
   outResults.Add("{\"t\":\"result\",\"outcome\":"+Q(outcome)+",\"cause\":"+Q(cause)+",\"tick\":"+tick+",\"health\":"+own.health+(own.IsEndless?",\"score\":"+own.EndlessScore:"")+"}");
   if(replica!=null){if(outcome=="won")ForceReplica("cleared");else if(outcome=="lost"&&!ownCausePartner){replicaForced=true;ForceReplica("lost");}}
  }
  /// <summary>The match ended on this device (its half lost, or the team won): the replica's half is ended here for the
  /// picture, at a tick its owner never sees, so its digests past this point are no longer comparable and are not compared.</summary>
  void ForceReplica(string outcome){if(replicaCompareLimit==int.MaxValue)replicaCompareLimit=replica.NetTick;replica.PartnerResult(outcome);}
  int replicaCompareLimit=int.MaxValue;
  /// <summary>The replica's own outcome must agree with what the owner reported (outcome and tick); a forced end (this half lost,
  /// or the team won) is presentation only.</summary>
  void ReplicaOutcome(string outcome){
   if(outcome=="won"||(outcome=="lost"&&replicaForced))return;
   replicaOutcome=outcome;replicaOutcomeTick=outcome=="cleared"?replica.HoldTick:replica.OutcomeTick;CheckOutcomes();
  }
  void PartnerReport(string outcome,int tick){
   if(outcome!="cleared"&&outcome!="lost")return;partnerOutcome=outcome;partnerOutcomeTick=tick;
   if(outcome=="lost")ownCausePartner=own.phase=="playing";
   own.PartnerResult(outcome);CheckOutcomes();
  }
  void CheckOutcomes(){
   if(partnerOutcome==""||replicaOutcome=="")return;
   if(partnerOutcome!=replicaOutcome||partnerOutcomeTick!=replicaOutcomeTick)Desync("outcome",Mathf.Max(partnerOutcomeTick,replicaOutcomeTick),(ulong)(uint)replicaOutcomeTick,(ulong)(uint)partnerOutcomeTick,"replica");
   partnerOutcome=replicaOutcome="";
  }

  void PartnerView(){
   var r=replica;EnemyState boss=null;foreach(var e in r.enemies)if(e.alive&&!string.IsNullOrEmpty(e.boss)){boss=e;break;}
   var sb=new StringBuilder(256);
   sb.Append("{\"t\":\"partnerView\",\"name\":").Append(Q(names[1-seat])).Append(",\"health\":").Append(r.health).Append(",\"wave\":").Append(r.wave).Append(",\"waves\":").Append(r.level.waves)
    .Append(",\"coins\":").Append(r.coins).Append(",\"phase\":").Append(Q(r.DuoHold?"hold":r.phase)).Append(",\"exec\":").Append(r.NetTick).Append(",\"behind\":").Append(Mathf.Max(0,partnerExec-r.NetTick)).Append(",\"boss\":");
   if(boss==null)sb.Append("null");else sb.Append("{\"name\":").Append(Q(CarrotData.BossName(boss.boss))).Append(",\"hp\":").Append(Mathf.RoundToInt(boss.hp)).Append(",\"maxHp\":").Append(Mathf.RoundToInt(boss.maxHp)).Append(",\"phase\":").Append(boss.phase).Append('}');
   sb.Append('}');outMisc.Add(sb.ToString());
  }

  // ---- Export, import, replay.
  /// <summary>Own ops inside the own half's state right now: those already handed to the page plus this frame's, not yet flushed.</summary>
  int OwnOpsInState {get{return ownOpsOut+(own.NetMode==NetMode.DuoOwn?own.OutOps.Count:0);}}
  void Import(CarrotGame g,string target,int tick,string b64,int seq){
   if(g==null){outMisc.Add("{\"t\":\"error\",\"code\":\"import\",\"message\":\"no "+target+"\"}");return;}
   string error;if(!g.ImportStateBase64(b64,out error)){outMisc.Add("{\"t\":\"error\",\"code\":\"import\",\"message\":"+Q(error)+"}");return;}
   // The partner's ops through `seq` are inside the imported state: queued copies of them must not apply a second time.
   if(g==replica&&seq>0)replica.DropQueuedThrough(replica.NetSeat,seq);
   if(tick>0&&g.NetTick!=tick)Log("import tick "+g.NetTick+" != "+tick);
   if(g==replica){replicaDigests.Clear();replicaDeep.Clear();lastReplicaWave=g.wave;replicaAcc=0;}else{ownDigests.Clear();ownDeep.Clear();lastOwnWave=g.wave;if(stepLimit<g.NetTick)stepLimit=g.NetTick;}
   remoteDigests.Clear();remoteDeep.Clear();
   outMisc.Add("{\"t\":\"replayed\",\"target\":"+Q(target)+",\"tick\":"+g.NetTick+",\"ms\":0,\"import\":true}");
  }
  void StartReplay(string target,NetOp[] ops,int to){
   var g=target=="replica"?replica:own;if(g==null)return;
   var keepMode=g.NetMode;int keepSeat=g.NetSeat;bool endless=mode=="endless";
   g.LoadLevel(level,endless?"endless":"duo",endless?seed:(uint)(g==replica?1-side:side));g.NetBegin(keepMode,keepSeat);g.NetNames=names;
   int maxSeq=0,mine=0;if(ops!=null)foreach(var op in ops){g.EnqueueOp(op);if(op.seat==keepSeat){mine++;if(op.s>maxSeq)maxSeq=op.s;}}
   if(g==own){own.LocalSeq=maxSeq;if(mode=="duo")ownOpsOut=mine;}
   if(g==replica){replicaDigests.Clear();lastReplicaWave=0;}else{ownDigests.Clear();lastOwnWave=0;}
   replay=new Replay{target=target,to=to,watch=Stopwatch.StartNew()};
  }
  void StepReplay(){
   var g=replay.target=="replica"?replica:own;if(g==null){replay=null;return;}
   // At most 30 ms of silent replay per frame; heartbeats keep flowing and the partner sees a progress bar.
   var frame=Stopwatch.StartNew();while(g.NetTick<replay.to&&frame.Elapsed.TotalMilliseconds<30)g.NetRunTo(Mathf.Min(replay.to,g.NetTick+30),30,true);
   if(g.NetTick<replay.to){outMisc.Add("{\"t\":\"progress\",\"target\":"+Q(replay.target)+",\"tick\":"+g.NetTick+",\"to\":"+replay.to+"}");return;}
   outMisc.Add("{\"t\":\"replayed\",\"target\":"+Q(replay.target)+",\"tick\":"+g.NetTick+",\"ms\":"+(int)replay.watch.Elapsed.TotalMilliseconds+"}");
   if(g==own&&stepLimit<g.NetTick)stepLimit=g.NetTick;replay=null;
  }
  public bool Replaying {get{return replay!=null;}}

  /// <summary>Everything queued this frame as one JSON array (null when nothing): own ops and intents first, then rejects,
  /// ticks (digests, then the final exec), results, and the rest. Nothing is dispatched mid-tick.</summary>
  public string Flush(){
   if(!Active&&outMisc.Count==0)return null;busy=true;
   try{
    if(Active){
     if(own.OutOps.Count>0){
      if(own.NetMode==NetMode.DuoOwn)ownOpsOut+=own.OutOps.Count;
      if(own.NetMode==NetMode.DuoOwn||own.LockstepSolo){var sb=new StringBuilder(64+own.OutOps.Count*48);sb.Append("{\"t\":\"own\",\"exec\":").Append(own.NetTick).Append(",\"ops\":[");for(int i=0;i<own.OutOps.Count;i++){if(i>0)sb.Append(',');OpJson(sb,own.OutOps[i],true);}sb.Append("]}");outOps.Add(sb.ToString());}
      else foreach(var op in own.OutOps){var sb=new StringBuilder(96);sb.Append("{\"t\":\"intent\",\"op\":");OpJson(sb,op,false);sb.Append('}');outOps.Add(sb.ToString());}
      own.OutOps.Clear();
     }
     foreach(var r in own.NetRejects)outOps.Add("{\"t\":\"reject\",\"seat\":"+r.seat+",\"s\":"+r.s+",\"reason\":"+Q(r.type)+"}");own.NetRejects.Clear();
     outTicks.Add("{\"t\":\"tick\",\"exec\":"+own.NetTick+(own.DuoHold?",\"hold\":true":"")+",\"rate\":"+(own.SpeedHold?1:own.MatchSpeed)+(replica!=null?",\"rexec\":"+replica.NetTick:"")+"}");
    }
    int n=outOps.Count+outTicks.Count+outResults.Count+outMisc.Count;if(n==0)return null;
    var all=new StringBuilder(256);all.Append('[');bool first=true;
    foreach(var list in new[]{outOps,outTicks,outResults,outMisc})foreach(var s in list){if(!first)all.Append(',');first=false;all.Append(s);}
    all.Append(']');outOps.Clear();outTicks.Clear();outResults.Clear();outMisc.Clear();return all.ToString();
   }finally{busy=false;}
  }
  /// <summary>{s, k, seat, op, ...} with only the fields the op uses (k omitted for an unstamped intent).</summary>
  public static void OpJson(StringBuilder sb,NetOp op,bool stamped){
   sb.Append("{\"s\":").Append(op.s);if(stamped)sb.Append(",\"k\":").Append(op.k);sb.Append(",\"seat\":").Append(op.seat).Append(",\"op\":").Append(Q(op.op));
   switch(op.op){
    case "buy":sb.Append(",\"pad\":").Append(op.pad).Append(",\"kind\":").Append(Q(op.kind));break;
    case "upgrade":case "sell":sb.Append(",\"id\":").Append(op.id).Append(",\"v\":").Append(op.v);break;
    case "merge":sb.Append(",\"id\":").Append(op.id).Append(",\"target\":").Append(op.target);break;
    case "mergeUndo":sb.Append(",\"id\":").Append(op.id);break;
    case "speed":sb.Append(",\"v\":").Append(op.v);break;
    case "focus":sb.Append(",\"type\":").Append(Q(op.type??"")).Append(",\"id\":").Append(op.id);break;
   }
   if(!stamped&&op.cost>0)sb.Append(",\"cost\":").Append(op.cost);
   sb.Append('}');
  }
  static string Q(string s){
   var sb=new StringBuilder((s?.Length??0)+2);sb.Append('"');
   if(s!=null)foreach(char c in s){if(c=='"'||c=='\\')sb.Append('\\').Append(c);else if(c<' ')sb.Append("\\u").Append(((int)c).ToString("x4",CultureInfo.InvariantCulture));else sb.Append(c);}
   return sb.Append('"').ToString();
  }
 }
}
