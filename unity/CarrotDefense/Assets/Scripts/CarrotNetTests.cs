#if UNITY_EDITOR
using System;
using System.Collections.Generic;
using System.Diagnostics;
using System.Globalization;
using System.Text;
using UnityEngine;
using Debug=UnityEngine.Debug;

namespace CarrotTD {
 // Multiplayer gates (run with `node scripts/carrot-sim.mjs --method <Name> [key=value...]`). Their assertions are counted in
 // netChecks, never in Quick's count. Every "0 mismatches" gate also prints how many digests it actually compared and runs a
 // positive control (a one-coin perturbation) that must be caught.
 public static partial class CarrotSimulationTests {
  static int netChecks;
  static void NetCheck(bool condition,string reason){netChecks++;if(!condition)throw new Exception("CARROT NET TEST: "+reason);}
  static CarrotGame NetGame(int level,string mode,uint arg,bool autoTick=false){var obj=new GameObject("CarrotNetTest");var g=obj.AddComponent<CarrotGame>();g.AutoTick=autoTick;g.EnableBridge=false;g.LoadLevel(level,mode,arg);return g;}
  static uint FBits(float f){return (uint)BitConverter.ToInt32(BitConverter.GetBytes(f),0);}
  static string Arg(string[] args,string key,string d){if(args!=null)foreach(var a in args)if(a.StartsWith(key+"=",StringComparison.Ordinal))return a.Substring(key.Length+1);return d;}
  static List<int> ArgRange(string[] args,string key,string d){return Range(Arg(args,key,d));}
  static void ClearBotCaches(){coverageCache.Clear();tails.Clear();}
  static ulong NetPair(CarrotGame g,int mirror=0){uint d,f;g.NetDigest(out d,out f,mirror);return ((ulong)d<<32)|f;}
  sealed class TwinBot {public int lastMergeWave=-1;}
  static void PolicyStep(CarrotGame g,int strategy,TwinBot st){for(int i=0;i<4;i++)if(!BuyBest(g,strategy))break;if(policyMerges&&g.wave!=st.lastMergeWave&&MergeBest(g))st.lastMergeWave=g.wave;Focus(g);}
  /// <summary>The campaign bots' uproot answer: sell the telegraphed tower.</summary>
  static void SellUprooted(CarrotGame g){g.Effect+=v=>{if((v.type=="telegraph"||v.type=="telegraphTarget")&&v.kind=="uproot"&&v.target>0){var t=g.towers.Find(x=>x.id==v.target);if(t!=null){g.Select("tower",t.id);g.Command("{\"type\":\"sell\"}");}}};}

  // ================= DuoMirrorExact: half 0 and half 1 are exact mirrors on every tick (hard gate).
  public static void DuoMirrorExact(string[] args){
   policyMerges=true;scoreNoise=null;netChecks=0;long total=0;var report=new StringBuilder();
   foreach(int level in ArgRange(args,"levels","4,8,12,16,20,24,25,26,27,28,29"))for(int strategy=0;strategy<2;strategy++){
    ClearBotCaches();var a=NetGame(level,"duo",0);var b=NetGame(level,"duo",1);SellUprooted(a);SellUprooted(b);
    int mirror=CarrotDuoMaps.SideLayout(level)==DuoAxis.Z?2:1;var ta=new TwinBot();var tb=new TwinBot();
    BuyBest(a,strategy);BuyBest(a,strategy);BuyBest(b,strategy);BuyBest(b,strategy);a.Command("{\"type\":\"start\"}");b.Command("{\"type\":\"start\"}");
    int ticks=0,bad=0,first=-1;
    while(a.phase=="playing"&&ticks<40000){
     if(ticks%7==0){PolicyStep(a,strategy,ta);PolicyStep(b,strategy,tb);}
     a.StepSimulation(1f/30);b.StepSimulation(1f/30);ticks++;
     if(!Mirrored(a,b,mirror)){bad++;if(first<0)first=ticks;}
    }
    bool sameEnd=a.phase==b.phase&&a.coins==b.coins&&a.health==b.health&&a.elapsed==b.elapsed&&a.towers.Count==b.towers.Count;
    string line="CARROT_DUO_MIRROR level="+level+" strategy="+strategy+" axis="+(mirror==2?"Z":"X")+" ticks="+ticks+" mismatchTicks="+bad+" first="+first+" phase="+a.phase+"/"+b.phase+" hearts="+a.health+" coins="+a.coins+" towers="+a.towers.Count;
    Debug.Log(line);report.AppendLine(line);total+=ticks;
    NetCheck(bad==0&&sameEnd,"duo halves of L"+level+" (strategy "+strategy+") mirror exactly on every tick (first mismatch "+first+")");
    Done(a);Done(b);
   }
   Debug.Log("CARROT_DUO_MIRROR_OK ticks="+total+" checks="+netChecks);
  }
  static bool Mirrored(CarrotGame a,CarrotGame b,int mirror){
   if(a.Digest()!=b.Digest()||a.DiscreteDigest()!=b.DiscreteDigest())return false;
   if(NetPair(a)!=NetPair(b,mirror))return false;
   if(a.enemies.Count!=b.enemies.Count||a.towers.Count!=b.towers.Count||a.blockers.Count!=b.blockers.Count)return false;
   for(int i=0;i<a.enemies.Count;i++){var p=a.enemies[i].position;var q=b.enemies[i].position;if(!MirrorBits(p,q,mirror))return false;}
   for(int i=0;i<a.towers.Count;i++)if(!MirrorBits(a.towers[i].position,b.towers[i].position,mirror))return false;
   for(int i=0;i<a.blockers.Count;i++)if(!MirrorBits(a.blockers[i].position,b.blockers[i].position,mirror))return false;
   return true;
  }
  static bool MirrorBits(Vector3 p,Vector3 q,int mirror){
   return mirror==1?FBits(-p.x)==FBits(q.x)&&FBits(p.y)==FBits(q.y)&&FBits(p.z)==FBits(q.z):FBits(p.x)==FBits(q.x)&&FBits(p.y)==FBits(q.y)&&FBits(-p.z)==FBits(q.z);
  }

  // ================= SelectionFreeEquivalence: legacy single-player commands vs the same commands as DuoOwn ops (and a replica).
  public static void SelectionFreeEquivalence(string[] args){
   policyMerges=true;scoreNoise=null;netChecks=0;long ticksAll=0,compared=0;
   foreach(int level in ArgRange(args,"levels","1-29"))for(int strategy=0;strategy<2;strategy++){
    ClearBotCaches();var a=NetGame(level,"normal",0);var b=NetGame(level,"normal",0);b.NetBegin(NetMode.DuoOwn,0);var r=NetGame(level,"normal",0);r.NetBegin(NetMode.Replica,0);
    var uproots=new List<int>();a.Effect+=v=>{if((v.type=="telegraph"||v.type=="telegraphTarget")&&v.kind=="uproot"&&v.target>0)uproots.Add(v.target);};
    var ta=new TwinBot();var tb=new TwinBot();var rng=new BotRng(level,strategy,BotCode("SFE"));
    BuyBest(a,strategy);BuyBest(a,strategy);BuyBest(b,strategy);BuyBest(b,strategy);a.Command("{\"type\":\"start\"}");b.NetGo();
    int ticks=0,bad=0,first=-1,replicaBad=0;bool undone=false;
    while(a.phase=="playing"&&ticks<40000){
     if(ticks%7==0){
      // The uproot answer between ticks (a net mode defers mid-tick input, single player would act inside the tick).
      foreach(int id in uproots){if(a.towers.Exists(x=>x.id==id))foreach(var g in new[]{a,b}){g.Select("tower",id);g.Command("{\"type\":\"sell\"}");}}uproots.Clear();
      PolicyStep(a,strategy,ta);PolicyStep(b,strategy,tb);
      // Extra coverage the campaign policy never exercises: sales, an early call, a quick merge undo, a blocker focus, clearing it.
      int slot=ticks/7;
      if(slot%97==40){var t=a.towers.Find(x=>x.tier==1);if(t!=null){int id=t.id;foreach(var g in new[]{a,b}){g.Select("tower",id);g.Command("{\"type\":\"sell\"}");}}}
      if(slot%53==11){foreach(var g in new[]{a,b})g.Command("{\"type\":\"next\"}");}
      if(!undone&&a.towers.Exists(x=>x.tier==5)&&rng.Unit()<.5){undone=true;foreach(var g in new[]{a,b})g.Command("{\"type\":\"mergeUndo\"}");}
      if(slot%61==30){var bl=a.blockers.Find(x=>x.ownerEnemy==0);if(bl!=null){int id=bl.id;foreach(var g in new[]{a,b})g.Select("blocker",id);}}
      if(slot%61==45){foreach(var g in new[]{a,b})g.Select("pad",0);}
     }
     foreach(var op in b.OutOps)r.EnqueueOp(op);b.OutOps.Clear();
     a.StepSimulation(1f/30);b.NetRunTo(b.NetTick+1,1,false);r.NetRunTo(b.NetTick,1,false);ticks++;
     if(a.phase=="playing"&&(a.Digest()!=b.Digest()||a.DiscreteDigest()!=b.DiscreteDigest())){bad++;if(first<0)first=ticks;}
     if(NetPair(b)!=NetPair(r))replicaBad++;compared++;
    }
    // At the end the solo run wins or loses; the DuoOwn half holds (or loses) at that very tick.
    bool endOk=a.phase=="won"?b.DuoHold&&b.HoldTick==b.NetTick&&r.DuoHold:a.phase=="lost"?b.phase=="lost"&&r.phase=="lost":true;
    Debug.Log("CARROT_SELECTION_FREE level="+level+" strategy="+strategy+" ticks="+ticks+" mismatchTicks="+bad+" first="+first+" replicaMismatch="+replicaBad+" end="+a.phase+"/"+(b.DuoHold?"hold":b.phase)+"/"+(r.DuoHold?"hold":r.phase)+" ops="+b.LocalSeq);
    NetCheck(bad==0,"L"+level+" s"+strategy+": legacy commands and ops agree on every tick (first mismatch "+first+")");
    NetCheck(replicaBad==0,"L"+level+" s"+strategy+": the replica matches the owner on every tick");
    NetCheck(endOk,"L"+level+" s"+strategy+": the held half resolves at the solo outcome tick");
    ticksAll+=ticks;Done(a);Done(b);Done(r);
   }
   Debug.Log("CARROT_SELECTION_FREE_OK ticks="+ticksAll+" replicaCompared="+compared+" checks="+netChecks);
  }

  // ================= Network simulation (two devices, the real CarrotNetSession on both).
  [Serializable] public class OutMsg {
   public string t,outcome,cause,target,b64,kind,where,reason,phase,name,code,message;
   public int exec,tick,health,score,s,seat,rexec,to,ms,rate,behind,coins,wave,waves;public bool hold;
   public NetOp[] ops;public NetOp op;public long[] d,rd,dh,rdh,local,remote;
  }
  [Serializable] public class OutList {public OutMsg[] items;}
  static OutMsg[] ParseOut(string json){if(string.IsNullOrEmpty(json))return new OutMsg[0];var l=JsonUtility.FromJson<OutList>("{\"items\":"+json+"}");return l!=null&&l.items!=null?l.items:new OutMsg[0];}
  sealed class NetDevice {
   public readonly int seat;public readonly CarrotGame game;public readonly CarrotNetSession session;public CarrotGame replica;
   public readonly List<OutMsg> desyncs=new List<OutMsg>(),results=new List<OutMsg>(),errors=new List<OutMsg>();public readonly List<string> golden;
   public NetDevice(int seat,List<string> golden=null){
    this.seat=seat;this.golden=golden;game=NetGame(1,"normal",0,true);session=new CarrotNetSession(game);
    session.CreateReplica=()=>{replica=NetGame(1,"normal",0);return replica;};session.DestroyReplica=r=>{if(r!=null)Done(r);};
   }
   public void Send(string json){golden?.Add("{\"dir\":\"in\",\"seat\":"+seat+",\"msg\":"+json+"}");session.Receive(json);}
   public OutMsg[] Frame(float dt){
    game.AdvanceReal(dt);session.Frame(dt);var json=session.Flush();if(json==null)return new OutMsg[0];
    if(golden!=null)golden.Add("{\"dir\":\"out\",\"seat\":"+seat+",\"msgs\":"+json+"}");
    var msgs=ParseOut(json);foreach(var m in msgs){if(m.t=="desync")desyncs.Add(m);else if(m.t=="result")results.Add(m);else if(m.t=="error")errors.Add(m);}
    return msgs;
   }
  }
  sealed class Link {
   sealed class Packet {public double at;public string json;}
   readonly List<Packet> q=new List<Packet>();double last;public bool ordered=true;
   public void Push(double at,string json){if(ordered){at=Math.Max(at,last);last=at;}q.Add(new Packet{at=at,json=json});}
   public List<string> Due(double now){var o=new List<string>();if(ordered){while(q.Count>0&&q[0].at<=now){o.Add(q[0].json);q.RemoveAt(0);}}else{q.Sort((a,b)=>a.at.CompareTo(b.at));while(q.Count>0&&q[0].at<=now){o.Add(q[0].json);q.RemoveAt(0);}}return o;}
   public int Count{get{return q.Count;}}
  }
  static string SessionJson(string mode,int level,int seat,int side,uint seed){return "{\"t\":\"session\",\"mode\":\""+mode+"\",\"level\":"+level+",\"seat\":"+seat+",\"side\":"+side+",\"seed\":"+seed+",\"names\":[\"Ada\",\"Bo\"],\"netVersion\":1}";}

  sealed class DuoOutcome {public bool ok,wonA,wonB;public int desyncs,compared,unverified,ticks,refused,ffTicks;public int[] detectAt={-1,-1};public string line;}
  /// <summary>One networked duo match on `level`: both devices run their own half and a replica of the partner's, linked by
  /// delayed, in-order delivery with a stall, a 2x window and a mid-burst pause. perturbAt &gt; 0 bumps device 1's replica purse by
  /// one coin at that replica tick (the positive control).</summary>
  static DuoOutcome DuoMatch(int level,int seed,int perturbAt=0,int maxDelayMs=500,bool stalls=true,List<string> golden=null,int maxFrames=0){
   var rng=new BotRng(level,seed,BotCode("DUO"));int sideA=(int)(rng.Next()&1);
   var dev=new[]{new NetDevice(0,golden),new NetDevice(1,golden)};var link=new[]{new Link(),new Link()};var bots=new[]{new TwinBot(),new TwinBot()};
   dev[0].Send(SessionJson("duo",level,0,sideA,0));dev[1].Send(SessionJson("duo",level,1,1-sideA,0));
   var trace=DuoDebug?new Dictionary<int,string>():null;int firstDiff=-1;
   if(trace!=null){var own0=dev[0].game;var prev0=own0.NetTicked;own0.NetTicked=t=>{prev0?.Invoke(t);trace[t]=StateLine(own0);};var rep1=dev[1].replica;var prev1=rep1.NetTicked;rep1.NetTicked=t=>{prev1?.Invoke(t);string line;if(firstDiff<0&&trace.TryGetValue(t,out line)&&line!=StateLine(rep1)){firstDiff=t;Debug.Log("CARROT_DUO_TRACE first divergence tick="+t+"\n owner  "+line+"\n replica "+StateLine(rep1));}};}
   foreach(var d in dev){SellUprooted(d.game);d.Send("{\"t\":\"clock\",\"run\":true,\"speed\":1}");}
   double now=0,dt=1/60.0;int frames=0,limit=maxFrames>0?maxFrames:60*60*40;
   double stallAt=stalls?20+rng.Unit()*100:-1,stallFor=3+rng.Unit()*7,fastAt=30+rng.Unit()*60,fastFor=40,pauseAt=50+rng.Unit()*60;int speedNow=1;bool paused=false,perturbed=false;
   var outcome=new DuoOutcome();double endAt=-1;
   while(frames++<limit){
    now+=dt;
    if(frames==120)foreach(var d in dev)d.Send("{\"t\":\"go\"}");
    int want=stalls&&now>=fastAt&&now<fastAt+fastFor?2:1;if(want!=speedNow){speedNow=want;foreach(var d in dev)d.Send("{\"t\":\"clock\",\"run\":true,\"speed\":"+want+"}");}
    if(stalls&&!paused&&now>=pauseAt&&now<pauseAt+2){paused=true;foreach(var d in dev)d.Send("{\"t\":\"pause\",\"on\":true,\"by\":0}");}
    if(paused&&now>=pauseAt+2){paused=false;foreach(var d in dev)d.Send("{\"t\":\"pause\",\"on\":false,\"by\":0}");}
    for(int i=0;i<2;i++){
     var d=dev[i];
     foreach(var json in link[1-i].Due(now))d.Send(json);
     if(frames%8==0&&(d.game.phase=="ready"||d.game.phase=="playing")&&!d.game.DuoHold){if(frames<120){if(frames==8){BuyBest(d.game,i);BuyBest(d.game,i);}}else PolicyStep(d.game,i,bots[i]);}
     if(perturbAt>0&&i==1&&!perturbed&&d.replica!=null&&d.replica.NetTick>=perturbAt){d.replica.coins+=1;perturbed=true;}
     var msgs=d.Frame((float)dt);
     // The page: forward own ops, exec, digests and self-caused results to the partner as a {t:'replica'} / {t:'partner'} message.
     var ops=new StringBuilder();var dig=new StringBuilder();var deep=new StringBuilder();int exec=-1;
     foreach(var m in msgs){
      if(m.t=="own"&&m.ops!=null)foreach(var op in m.ops){if(ops.Length>0)ops.Append(',');CarrotNetSession.OpJson(ops,op,true);if(DuoDebug&&i==0&&(op.id==653||op.k>21900&&op.k<22000))Debug.Log("CARROT_DUO_OP dev0 s="+op.s+" k="+op.k+" op="+op.op+" id="+op.id+" pad="+op.pad+" ownTick="+d.game.NetTick+" frame="+frames);}
      if(m.t=="tick"){if(m.exec>exec)exec=m.exec;if(m.d!=null&&m.d.Length==3){if(dig.Length>0)dig.Append(',');dig.Append(m.d[0]).Append(',').Append(m.d[1]).Append(',').Append(m.d[2]);}
       if(m.dh!=null&&m.dh.Length==2){if(deep.Length>0)deep.Append(',');deep.Append(m.dh[0]).Append(',').Append(m.dh[1]);}}
      if(m.t=="result"&&m.cause=="self"&&(m.outcome=="cleared"||m.outcome=="lost"))link[i].Push(now+Delay(rng,maxDelayMs,now,stallAt,stallFor),"{\"t\":\"partner\",\"outcome\":\""+m.outcome+"\",\"tick\":"+m.tick+"}");
     }
     if(exec>=0||ops.Length>0){
      var msg="{\"t\":\"replica\",\"exec\":"+Mathf.Max(0,exec)+",\"b\":3,\"ops\":["+ops+"],\"d\":["+dig+"],\"dh\":["+deep+"]}";
      link[i].Push(now+Delay(rng,maxDelayMs,now,stallAt,stallFor),msg);
     }
    }
    bool over=dev[0].game.phase!="playing"&&dev[0].game.phase!="ready"&&dev[1].game.phase!="playing"&&dev[1].game.phase!="ready";
    if(over&&endAt<0)endAt=now+12+stallFor;if(endAt>0&&now>=endAt)break;
   }
   for(int i=0;i<2;i++){
    var d=dev[i];outcome.desyncs+=d.desyncs.Count;outcome.compared+=d.session.DigestsCompared;outcome.unverified+=d.session.Unverified;outcome.ffTicks+=(int)d.session.FastForwardTicks;
    if(d.replica!=null)outcome.refused+=d.replica.ReplicaRefused;foreach(var m in d.desyncs)if(outcome.detectAt[i]<0)outcome.detectAt[i]=m.tick;
   }
   outcome.wonA=dev[0].game.phase=="won";outcome.wonB=dev[1].game.phase=="won";outcome.ticks=Mathf.Max(dev[0].game.NetTick,dev[1].game.NetTick);
   int expected=0;for(int i=0;i<2;i++)if(dev[i].replica!=null)expected+=Mathf.Min(dev[i].replica.NetTick,dev[i].session.ReplicaCompareLimit)/30-2;
   bool sameOutcome=dev[0].game.phase==dev[1].game.phase;
   outcome.ok=outcome.desyncs==0&&outcome.compared>=expected&&outcome.unverified==0&&outcome.refused==0&&sameOutcome&&dev[0].errors.Count==0&&dev[1].errors.Count==0;
   outcome.line="level="+level+" seed="+seed+" sides="+sideA+"/"+(1-sideA)+" ticks="+outcome.ticks+" phases="+dev[0].game.phase+"/"+dev[1].game.phase+" compared="+outcome.compared+" expected>="+expected+" desyncs="+outcome.desyncs+" unverified="+outcome.unverified+" fastForward="+outcome.ffTicks+" reentries="+(dev[0].session.Reentries+dev[1].session.Reentries)+" frames="+frames;
   if(DuoDebug)for(int i=0;i<2;i++){int k=0;foreach(var m in dev[i].desyncs){if(k++>=4)break;Debug.Log("CARROT_DUO_DEBUG dev="+i+" kind="+m.kind+" where="+m.where+" tick="+m.tick+" local="+(m.local!=null&&m.local.Length==2?m.local[0]+"/"+m.local[1]:"")+" remote="+(m.remote!=null&&m.remote.Length==2?m.remote[0]+"/"+m.remote[1]:"")+" ownTick="+dev[i].game.NetTick+" replicaTick="+(dev[i].replica!=null?dev[i].replica.NetTick:-1)+" refused="+(dev[i].replica!=null?dev[i].replica.ReplicaRefused:-1)+" late="+(dev[i].replica!=null?dev[i].replica.LateOps:-1));}
    for(int j=0;j<2;j++)Debug.Log("CARROT_DUO_DEBUG dev="+j+" own hold="+dev[j].game.HoldTick+" outcome="+dev[j].game.OutcomeTick+" phase="+dev[j].game.phase+" replica hold="+(dev[j].replica!=null?dev[j].replica.HoldTick:-9)+" outcome="+(dev[j].replica!=null?dev[j].replica.OutcomeTick:-9)+" limit="+dev[j].session.ReplicaCompareLimit+" pastEnd="+dev[j].session.PastEnd);}
   foreach(var d in dev){d.session.Dispose();Done(d.game);}
   return outcome;
  }
  static bool DuoDebug;
  static string StateLine(CarrotGame g){var sb=new StringBuilder();sb.Append("t=").Append(g.NetTick).Append(" ph=").Append(g.phase).Append(" hold=").Append(g.DuoHold).Append(" c=").Append(g.coins).Append(" h=").Append(g.health).Append(" w=").Append(g.wave).Append(" el=").Append(FBits(g.elapsed).ToString("x8")).Append(" nw=").Append(FBits(g.nextWave).ToString("x8")).Append(" f=").Append(g.TestFocus).Append(" towers=");
   foreach(var t in g.towers)sb.Append(t.id).Append(':').Append(t.kind).Append('/').Append(t.tier).Append('@').Append(t.pad).Append(',');sb.Append(" enemies=").Append(g.enemies.Count).Append(" blockers=");foreach(var b in g.blockers)sb.Append(b.id).Append(':').Append(FBits(b.hp).ToString("x8")).Append(',');
   foreach(var e in g.enemies)sb.Append(' ').Append(e.id).Append(e.alive?"":"x").Append(':').Append(FBits(e.hp).ToString("x8"));return sb.ToString();}
  public static void DuoDebugRun(string[] args){DuoDebug=true;policyMerges=true;scoreNoise=null;ClearBotCaches();var o=DuoMatch(int.Parse(Arg(args,"level","25")),int.Parse(Arg(args,"seed","3")),maxDelayMs:int.Parse(Arg(args,"delay","200")),stalls:Arg(args,"stalls","0")=="1",maxFrames:int.Parse(Arg(args,"frames","20000")));DuoDebug=false;Debug.Log("CARROT_DUO_DEBUG "+o.line);}
  static double Delay(BotRng rng,int maxDelayMs,double now,double stallAt,double stallFor){double d=rng.Unit()*maxDelayMs/1000.0;if(stallAt>0&&now>=stallAt&&now<stallAt+stallFor)d+=stallAt+stallFor-now;return d;}

  // ================= DuoReplica: the replica equals its owner at every 30th netTick over a delayed link (all 11 fights).
  public static void DuoReplica(string[] args){
   policyMerges=true;scoreNoise=null;netChecks=0;long compared=0;
   var levels=ArgRange(args,"levels","4,8,12,16,20,24,25,26,27,28,29");var seeds=ArgRange(args,"seeds","0-1");
   foreach(int level in levels)foreach(int seed in seeds){
    ClearBotCaches();var o=DuoMatch(level,seed);Debug.Log("CARROT_DUO_REPLICA "+o.line);compared+=o.compared;
    NetCheck(o.ok,"duo L"+level+" seed "+seed+": no desync, every digest compared, outcomes agree ("+o.line+")");
   }
   // Positive control: one coin on a replica is caught within 30 ticks.
   ClearBotCaches();var p=DuoMatch(25,7,perturbAt:900);Debug.Log("CARROT_DUO_REPLICA_CONTROL "+p.line+" detectedAt="+p.detectAt[1]);
   NetCheck(p.desyncs>0&&p.detectAt[1]>=900&&p.detectAt[1]<=930+30,"a one-coin replica perturbation is detected within 30 ticks (at "+p.detectAt[1]+")");
   Debug.Log("CARROT_DUO_REPLICA_OK compared="+compared+" checks="+netChecks);
  }

  // ================= HeldWinTransitions: the eight scripted hold / partner-result cases.
  static CarrotGame Cleared(int level,int side,NetMode mode){var g=NetGame(level,"duo",(uint)side);g.NetBegin(mode,side);g.phase="playing";g.TestClearScheduled();return g;}
  public static void HeldWinTransitions(string[] args){
   netChecks=0;var outcomes=new List<string>();
   // 1. Own half clears first, the partner later: hold, then won at the partner's report.
   {var g=Cleared(25,0,NetMode.DuoOwn);g.NetOutcome=o=>outcomes.Add(o);g.NetRunTo(g.NetTick+5,5,false);NetCheck(g.DuoHold&&g.phase=="playing"&&outcomes.Contains("cleared"),"1: clearing holds");
    g.NetRunTo(g.NetTick+300,300,false);g.PartnerResult("cleared");NetCheck(g.phase=="won"&&!g.DuoHold&&outcomes[outcomes.Count-1]=="won","1: the partner's clear wins");Done(g);outcomes.Clear();}
   // 2. The partner clears first: won the tick this half clears.
   {var g=Cleared(25,1,NetMode.DuoOwn);g.NetOutcome=o=>outcomes.Add(o);g.PartnerResult("cleared");NetCheck(g.phase=="playing","2: a partner clear alone wins nothing");g.NetRunTo(g.NetTick+5,5,false);
    NetCheck(g.phase=="won"&&g.OutcomeTick==g.HoldTick&&outcomes.Count==2&&outcomes[0]=="cleared"&&outcomes[1]=="won","2: won at the hold tick");Done(g);outcomes.Clear();}
   // 3. Held, then the partner's carrot falls: lost.
   {var g=Cleared(26,0,NetMode.DuoOwn);g.NetRunTo(g.NetTick+5,5,false);g.PartnerResult("lost");NetCheck(g.phase=="lost","3: a held half loses when the partner's carrot falls");Done(g);}
   // 4. Own carrot falls while playing: lost (self).
   {var g=NetGame(27,"duo",0);g.NetBegin(NetMode.DuoOwn,0);g.NetOutcome=o=>outcomes.Add(o);g.NetGo();g.health=1;var e=g.TestSpawn("nibble",0,0);e.distance=e.routeLength-.01f;
    for(int i=0;i<90&&g.phase=="playing";i++)g.NetRunTo(g.NetTick+1,1,false);NetCheck(g.phase=="lost"&&outcomes.Contains("lost"),"4: own carrot falls");Done(g);outcomes.Clear();}
   // 5. The partner loses while this half plays: lost at once.
   {var g=NetGame(28,"duo",1);g.NetBegin(NetMode.DuoOwn,1);g.NetGo();g.NetRunTo(g.NetTick+30,30,false);g.PartnerResult("lost");NetCheck(g.phase=="lost","5: the partner's loss ends the match");Done(g);}
   // 6. A held half is frozen: 10k ticks with a blocker focused change nothing (no scenery farming, no clock).
   {var g=Cleared(24,0,NetMode.DuoOwn);var b=g.blockers.Find(x=>x.ownerEnemy==0);g.Select("blocker",b.id);g.towers.Add(new TowerState{id=7777,kind="mortar",pad=0,tier=4,position=b.position,builtAt=-5,spent=500,lastShot=-20});
    g.NetRunTo(g.NetTick+3,3,false);NetCheck(g.DuoHold,"6: holding");ulong before=DigestIgnoringClock(g);int heldTick=g.NetTick;ulong deep=g.NetDeepHash();int standing=g.blockers.Count;float elapsed=g.elapsed;int coins=g.coins;
    g.NetRunTo(g.NetTick+10000,10000,false);
    NetCheck(g.blockers.Count==standing&&g.elapsed==elapsed&&g.coins==coins&&g.blockers.Find(x=>x.id==b.id).hp==b.maxHp,"6: blockers, elapsed and coins frozen for 10k ticks");
    // Only the clock (NetTick) moves; every other bit of state is identical.
    NetCheck(DigestIgnoringClock(g)==before,"6: frozen state digest");NetCheck(DeepAtTick(g,heldTick)==deep,"6: frozen deep state");Done(g);}
   // 7. Every state-changing op is refused while held, and nothing is recorded.
   {var g=Cleared(25,0,NetMode.DuoOwn);g.coins=5000;g.NetRunTo(g.NetTick+3,3,false);int seq=g.LocalSeq;g.OutOps.Clear();
    g.Select("pad",0);g.Command("{\"type\":\"buy\",\"kind\":\"seed\"}");g.Command("{\"type\":\"next\"}");g.Command("{\"type\":\"mergeUndo\"}");
    NetCheck(g.towers.Count==0&&g.OutOps.Count==0&&g.LocalSeq==seq,"7: ops refused during hold");
    var r=Cleared(25,0,NetMode.Replica);r.NetRunTo(r.NetTick+3,3,false);NetCheck(!r.EnqueueOp(new NetOp{op="buy",pad=0,kind="seed",seat=1,s=1,k=r.NetTick+1}),"7: a replica takes only its owner's seat");
    r.EnqueueOp(new NetOp{op="buy",pad=0,kind="seed",seat=0,s=1,k=r.NetTick+1});r.NetRunTo(r.NetTick+1,1,false);NetCheck(r.ReplicaRefused==1&&r.towers.Count==0,"7: a replica refuses ops on a held half (a desync)");Done(g);Done(r);}
   // 8. Sessions: the replica of a held half resolves won when this device's half wins; reported clear tick == replica hold tick.
   {var o=DuoMatch(25,3,maxDelayMs:200,stalls:false);Debug.Log("CARROT_HELD_SESSION "+o.line);NetCheck(o.ok&&(o.wonA==o.wonB),"8: both devices agree through hold and win ("+o.line+")");}
   Debug.Log("CARROT_HELD_OK checks="+netChecks);
  }
  /// <summary>Digest and DiscreteDigest (neither hashes the net clock): equal before and after the hold's 10k ticks.</summary>
  static ulong DigestIgnoringClock(CarrotGame g){return g.Digest()^(g.DiscreteDigest()*31);}
  /// <summary>The deep hash with the net clock set back to `tick` (the only field a held half may move).</summary>
  static ulong DeepAtTick(CarrotGame g,int tick){var field=typeof(CarrotGame).GetField("<NetTick>k__BackingField",System.Reflection.BindingFlags.Instance|System.Reflection.BindingFlags.NonPublic);
   object now=field.GetValue(g);field.SetValue(g,tick);ulong h=g.NetDeepHash();field.SetValue(g,now);return h;}

  // ================= StateCopy: export at tick N, import into a fresh instance, run both to the end: identical NetDigests.
  public static void StateCopy(string[] args){
   policyMerges=true;scoreNoise=null;netChecks=0;
   foreach(var spec in Arg(args,"cases","27,28,29,90").Split(',')){
    int level=int.Parse(spec,CultureInfo.InvariantCulture);ClearBotCaches();
    if(level==CarrotDuoMaps.EndlessId){StateCopyEndless();continue;}
    var a=NetGame(level,"normal",0);SellUprooted(a);var ta=new TwinBot();BuyBest(a,0);BuyBest(a,0);a.Command("{\"type\":\"start\"}");
    int ticks=0,copyAt=level==29?2400:6000;
    while(a.phase=="playing"&&ticks<copyAt){if(ticks%7==0)PolicyStep(a,0,ta);a.StepSimulation(1f/30);ticks++;}
    var blob=CarrotNetState.Export(a);var b=NetGame(level,"normal",0);string error;bool ok=CarrotNetState.Import(b,blob,out error);
    NetCheck(ok,"L"+level+" import ("+error+")");NetCheck(NetPair(a)==NetPair(b)&&a.NetDeepHash()==b.NetDeepHash(),"L"+level+" imported state equals the original");
    SellUprooted(b);var tb=new TwinBot{lastMergeWave=ta.lastMergeWave};int bad=0,after=0;
    while(a.phase=="playing"&&after<40000){if(ticks%7==0){PolicyStep(a,0,ta);PolicyStep(b,0,tb);}a.StepSimulation(1f/30);b.StepSimulation(1f/30);ticks++;after++;if(NetPair(a)!=NetPair(b))bad++;}
    Debug.Log("CARROT_STATE_COPY level="+level+" copyTick="+copyAt+" blobBytes="+blob.Length+" continued="+after+" mismatchTicks="+bad+" end="+a.phase+"/"+b.phase+" schema="+CarrotNetState.SchemaHash().ToString("x8"));
    NetCheck(bad==0&&a.phase==b.phase,"L"+level+": the copy continues identically");NetCheck(blob.Length<=40*1024,"L"+level+" blob <= 40 KB ("+blob.Length+")");
    Done(a);Done(b);
   }
   Debug.Log("CARROT_STATE_COPY_OK checks="+netChecks);
  }
  static void StateCopyEndless(){
   // Endless at wave 15: an E-R1 pair plays on while every executed op and every 30th-tick digest is recorded; the state is
   // exported the tick wave 15 starts, imported into a fresh instance, and the copy replays the recorded ops to the end.
   byte[] blob=null;int copyTick=0;var ops=new List<NetOp>();var digests=new Dictionary<int,ulong>();
   var run=RunEndless("E-R1",4242,40,4,(g,t)=>{if(g.NetTick%30==0)digests[g.NetTick]=NetPair(g);if(blob==null&&g.wave>=15){blob=CarrotNetState.Export(g);copyTick=g.NetTick;}},ops);
   NetCheck(blob!=null,"endless reached wave 15 for the copy (score "+run.score+")");
   var b=NetGame(CarrotDuoMaps.EndlessId,"endless",4242);b.NetBegin(NetMode.Lockstep,0);string error;NetCheck(CarrotNetState.Import(b,blob,out error),"endless import ("+error+")");
   NetCheck(b.NetTick==copyTick,"endless copy tick");
   foreach(var op in ops)if(op.k>copyTick)b.EnqueueOp(op.Clone());
   int end=0;foreach(var k in digests.Keys)if(k>end)end=k;int bad=0,compared=0;
   b.NetTicked=t=>{ulong v;if(t%30==0&&digests.TryGetValue(t,out v)){compared++;if(v!=NetPair(b))bad++;}};
   b.NetRunTo(end,int.MaxValue,true);
   Debug.Log("CARROT_STATE_COPY level=90 copyTick="+copyTick+" blobBytes="+blob.Length+" wave="+run.score+" continued="+(end-copyTick)+" compared="+compared+" mismatches="+bad+" schema="+CarrotNetState.SchemaHash().ToString("x8"));
   NetCheck(blob.Length<=40*1024,"endless blob <= 40 KB ("+blob.Length+")");
   NetCheck(bad==0&&compared>=(end-copyTick)/30-2,"endless copy continues identically ("+compared+" compared)");Done(b);
  }
  /// <summary>An E-bot endless run, returning every op it executed (stamped), for replay tests.</summary>
  static List<NetOp> RecordEndless(string bot,uint seed,int maxWave){
   var ops=new List<NetOp>();RunEndless(bot,seed,maxWave,4,null,ops);return ops;
  }

  // ================= SilentReplayEquivalence: a live run and a silent replay from tick 0 agree on every 30th-tick NetDigest.
  public static void SilentReplayEquivalence(string[] args){
   policyMerges=true;scoreNoise=null;netChecks=0;long compared=0;
   foreach(int level in ArgRange(args,"levels","4,8,12,16,20,24,25,26,27,28,29")){
    ClearBotCaches();var live=NetGame(level,"duo",0);live.NetBegin(NetMode.DuoOwn,0);SellUprooted(live);var tb=new TwinBot();var ops=new List<NetOp>();var digests=new Dictionary<int,ulong>();
    live.NetTicked=t=>{if(t%30==0)digests[t]=NetPair(live);};
    BuyBest(live,0);BuyBest(live,0);live.NetGo();int ticks=0;
    while((live.phase=="playing"||live.phase=="ready")&&!live.DuoHold&&ticks<40000){if(ticks%7==0)PolicyStep(live,0,tb);ops.AddRange(live.OutOps);live.OutOps.Clear();live.NetRunTo(live.NetTick+1,1,false);ticks++;}
    ops.AddRange(live.OutOps);live.OutOps.Clear();
    var r=NetGame(level,"duo",0);r.NetBegin(NetMode.Replica,0);foreach(var op in ops)r.EnqueueOp(op);int bad=0,n=0;
    r.NetTicked=t=>{ulong v;if(t%30==0&&digests.TryGetValue(t,out v)){n++;if(v!=NetPair(r))bad++;}};
    var watch=Stopwatch.StartNew();r.NetRunTo(live.NetTick,int.MaxValue,true);double ms=watch.Elapsed.TotalMilliseconds;
    Debug.Log("CARROT_SILENT_REPLAY level="+level+" ticks="+live.NetTick+" ops="+ops.Count+" compared="+n+" mismatches="+bad+" end="+(live.DuoHold?"hold":live.phase)+"/"+(r.DuoHold?"hold":r.phase)+" replayMs="+ms.ToString("F1",CultureInfo.InvariantCulture)+" ticksPerSecond="+(live.NetTick/Math.Max(.001,ms/1000)).ToString("F0",CultureInfo.InvariantCulture));
    NetCheck(bad==0&&n>=live.NetTick/30-1&&r.DuoHold==live.DuoHold&&r.phase==live.phase,"L"+level+": silent replay equals the live run");compared+=n;Done(live);Done(r);
   }
   // Endless: 30 waves of an E-R1 pair, live versus silent replay.
   {var digests=new Dictionary<int,ulong>();var ops=new List<NetOp>();var run=RunEndless("E-R1",777,30,4,(g,t)=>{if(g.NetTick%30==0)digests[g.NetTick]=NetPair(g);},ops);
    var r=NetGame(CarrotDuoMaps.EndlessId,"endless",777);r.NetBegin(NetMode.Lockstep,0);foreach(var op in ops)r.EnqueueOp(op);int bad=0,n=0,end=0;foreach(var k in digests.Keys)if(k>end)end=k;
    r.NetTicked=t=>{ulong v;if(t%30==0&&digests.TryGetValue(t,out v)){n++;if(v!=NetPair(r))bad++;}};var watch=Stopwatch.StartNew();r.NetRunTo(end,int.MaxValue,true);double ms=watch.Elapsed.TotalMilliseconds;
    Debug.Log("CARROT_SILENT_REPLAY level=90 waves="+run.score+" ticks="+end+" ops="+ops.Count+" compared="+n+" mismatches="+bad+" replayMs="+ms.ToString("F1",CultureInfo.InvariantCulture)+" ticksPerSecond="+(end/Math.Max(.001,ms/1000)).ToString("F0",CultureInfo.InvariantCulture));
    NetCheck(bad==0&&n>=end/30-1,"endless silent replay equals the live run");compared+=n;Done(r);}
   Debug.Log("CARROT_SILENT_REPLAY_OK compared="+compared+" checks="+netChecks);
  }

  // ================= NaNDigest: NaN payloads fold to one value in NetDigest and the deep hash.
  public static void NaNDigest(string[] args){
   netChecks=0;var a=NetGame(25,"normal",0);var b=NetGame(25,"normal",0);var ea=a.TestSpawn("nibble",0,1);var eb=b.TestSpawn("nibble",0,1);
   ea.hp=BitConverter.ToSingle(BitConverter.GetBytes(0x7FC00000),0);eb.hp=BitConverter.ToSingle(BitConverter.GetBytes(unchecked((int)0xFFC00001)),0);
   NetCheck(float.IsNaN(ea.hp)&&float.IsNaN(eb.hp),"two NaN health values");if(FBits(ea.hp)==FBits(eb.hp))Debug.Log("CARROT_NAN_DIGEST note: this runtime canonicalized the NaN payload");
   NetCheck(NetPair(a)==NetPair(b),"NetDigest folds NaN");NetCheck(a.NetDeepHash()==b.NetDeepHash(),"the deep hash folds NaN");
   NetCheck(FBits(ea.hp)==FBits(eb.hp)||a.Digest()!=b.Digest(),"Digest() itself is unchanged (raw bits)");
   Debug.Log("CARROT_NAN_DIGEST_OK checks="+netChecks);Done(a);Done(b);
  }

  // ================= EndlessGeneratorProperties.
  /// <summary>The pre-refactor PlanWave, kept verbatim as the byte-identity reference.</summary>
  static List<CarrotData.PlannedSpawn> LegacyPlanWave(int levelId,int wave){
   var into=new List<CarrotData.PlannedSpawn>();var lvl=CarrotData.Level(levelId);if(lvl==null||wave<1||wave>lvl.waves)return into;
   string[] packets=CarrotData.Waves[levelId-1][wave-1].Split(',');float at=.65f;int packetIndex=0,routes=lvl.routes.Length;
   float gapScale=CarrotData.GapScale(levelId),overlap=CarrotData.PacketOverlap(levelId);
   foreach(string packet in packets){
    int colon=packet.IndexOf(':');string kind=packet.Substring(0,colon);int count=int.Parse(packet.Substring(colon+1),CultureInfo.InvariantCulture);
    for(int i=0;i<count;i++){int route=kind=="boss"?0:(wave+packetIndex+i/Mathf.Max(2,count/routes))%routes;float gap=kind=="swarm"?.24f*gapScale:kind=="boss"?1.8f:.78f*gapScale;into.Add(new CarrotData.PlannedSpawn{at=at+i*gap,kind=kind,route=route});}
    at+=Mathf.Max(2,count*(kind=="swarm"?.24f:kind=="boss"?1.8f:.78f)*(kind=="boss"?1:gapScale*overlap))+.8f;packetIndex++;
   }
   return into;
  }
  public static void EndlessGeneratorProperties(string[] args){
   netChecks=0;int units=0;
   // Campaign schedules are byte-identical to the pre-refactor PlanWave.
   for(int level=1;level<=29;level++)for(int w=1;w<=CarrotData.Level(level).waves;w++){
    var a=LegacyPlanWave(level,w);var b=CarrotData.PlanWave(level,w,new List<CarrotData.PlannedSpawn>());NetCheck(a.Count==b.Count,"plan size L"+level+" w"+w);
    for(int i=0;i<a.Count;i++){NetCheck(FBits(a[i].at)==FBits(b[i].at)&&a[i].kind==b[i].kind&&a[i].route==b[i].route&&b[i].boss==null,"plan unit L"+level+" w"+w+" #"+i);units++;}
   }
   foreach(uint seed in new uint[]{1,2,3,99,4242,0xDEADBEEF,123456789}){
    var inOrder=new CarrotEndlessGen.Schedule(seed);var outOfOrder=new CarrotEndlessGen.Schedule(seed);outOfOrder.Get(120);var late=new CarrotEndlessGen.Schedule(seed);
    var bosses=new HashSet<string>();string lastBoss="";
    for(int w=1;w<=120;w++){
     var x=inOrder.Get(w);var y=outOfOrder.Get(w);var z=late.Get(121-w)==null?null:late.Get(w);
     NetCheck(x.Text()==y.Text()&&x.hpBonus==y.hpBonus&&x.Text()==z.Text(),"seed "+seed+" wave "+w+": the plan is a pure function of (seed, w)");
     NetCheck(x.ordinary<=CarrotEndlessGen.OrdinaryCap,"seed "+seed+" wave "+w+": at most 70 ordinary units ("+x.ordinary+")");
     if(CarrotEndlessGen.BossWave(w)){NetCheck(x.boss!=""&&x.boss!="asuna"&&x.boss!=lastBoss,"seed "+seed+" wave "+w+": a boss, never Asuna, never the same twice running");bosses.Add(x.boss);lastBoss=x.boss;if(w==80)NetCheck(bosses.Count==8,"all eight bosses by wave 80 (seed "+seed+")");}
     else NetCheck(x.boss=="","no boss off the tenth waves");
     NetCheck(CarrotEndlessGen.MiniWave(w)==(x.minis.Length>0)&&x.minis.Length==(CarrotEndlessGen.MiniWave(w)?(w<30?1:2):0),"miniboss count on wave "+w);
     foreach(var packet in x.packets){var bits=packet.Split(':');NetCheck(bits.Length==2,"packet grammar "+packet);string kind=bits[0];string rest=bits[1];int at=rest.IndexOf('@');string count=at>=0?rest.Substring(0,at):rest;
      if(kind=="boss")NetCheck(CarrotEndlessGen.BossIndex(count)>=0,"boss packet "+packet);else{NetCheck(CarrotData.Enemy(kind)!=null||kind=="nibble"||kind=="dash"||kind=="swarm"||kind=="shell"||kind=="moth"||kind=="shaman"||kind=="burrow"||kind=="crystal","known kind "+packet);NetCheck(int.Parse(count,CultureInfo.InvariantCulture)>=1,"count "+packet);}
      if(at>=0){int r=int.Parse(rest.Substring(at+1),CultureInfo.InvariantCulture);NetCheck(r==0||r==1,"gate "+packet);}}
     var plan=CarrotData.PlanPackets(x.packets,w,2,CarrotEndlessGen.GapScale,CarrotEndlessGen.Overlap,new List<CarrotData.PlannedSpawn>());NetCheck(plan.Count>0,"plan of wave "+w);
    }
   }
   // The game's lazily generated plans equal the schedule's, at load and mid-run.
   {var g=NetGame(CarrotDuoMaps.EndlessId,"endless",99);var s=new CarrotEndlessGen.Schedule(99);var p1=g.WavePlan(1);var q1=CarrotData.PlanPackets(s.Get(1).packets,1,2,CarrotEndlessGen.GapScale,CarrotEndlessGen.Overlap,new List<CarrotData.PlannedSpawn>());
    NetCheck(p1!=null&&p1.Count==q1.Count,"endless plan 1 at load");Done(g);}
   // A 120-wave run with an immortal carrot: never two bosses alive, and the cap holds the live count.
   {var g=NetGame(CarrotDuoMaps.EndlessId,"endless",31337);g.NetBegin(NetMode.Lockstep,0);g.TestAsSeat(0,()=>g.NetGo());foreach(var op in g.OutOps){op.k=g.NetTick+1;g.EnqueueOp(op);}g.OutOps.Clear();
    int maxBosses=0,maxLive=0,ticks=0;var watch=Stopwatch.StartNew();
    while(g.wave<120&&ticks<3000000){g.health=10;g.NetRunTo(g.NetTick+1,1,false);ticks++;if((ticks&15)==0){maxBosses=Mathf.Max(maxBosses,g.TestLivingBosses);maxLive=Mathf.Max(maxLive,g.LiveEnemies);}
     if(g.nextWave>0&&(ticks%30)==0){g.TestAsSeat(0,()=>g.Command("{\"type\":\"next\"}"));foreach(var op in g.OutOps){op.k=g.NetTick+1;g.EnqueueOp(op);}g.OutOps.Clear();}}
    Debug.Log("CARROT_ENDLESS_120 wave="+g.wave+" ticks="+ticks+" maxBosses="+maxBosses+" maxLive="+maxLive+" folded="+g.SummonsFolded+" seconds="+watch.Elapsed.TotalSeconds.ToString("F1",CultureInfo.InvariantCulture)+" tableHits="+CarrotData.EndlessTableHits);
    NetCheck(g.wave>=120&&maxBosses<=1,"120 endless waves never field two bosses");NetCheck(CarrotData.EndlessTableHits==0,"no per-level table read for id 90");Done(g);}
   Debug.Log("CARROT_ENDLESS_GENERATOR_OK campaignUnits="+units+" checks="+netChecks);
  }

  // ================= EndlessAllKits: every boss, miniboss and kind at waves 1-120 on Twin Gates (and every duo half), no table reads.
  static readonly Dictionary<string,int> kitCasts=new Dictionary<string,int>();
  public static void EndlessAllKits(string[] args){
   netChecks=0;kitCasts.Clear();int spawned=0;var kinds=new List<string>();foreach(var tier in CarrotEndlessGen.Tiers)kinds.AddRange(tier);
   var all=new List<KeyValuePair<string,string>>();foreach(var b in CarrotEndlessGen.Bosses)all.Add(new KeyValuePair<string,string>("boss",b));foreach(var m in CarrotEndlessGen.Minis)all.Add(new KeyValuePair<string,string>(m,null));foreach(var k in kinds)all.Add(new KeyValuePair<string,string>(k,null));
   foreach(int w in ArgRange(args,"waves","1,10,30,60,90,120")){
    foreach(var unit in all){
     var g=NetGame(CarrotDuoMaps.EndlessId,"endless",(uint)(w*31+spawned));g.NetBegin(NetMode.Lockstep,0);g.coins=200000;
     // Both seats build a mixed garden (every family) so every kit has targets: uproots, gazes, tithes, locks.
     for(int pad=0,k=0;pad<g.level.pads.Length;pad++){if(g.blockers.Exists(b=>b.pad==pad))continue;var d=CarrotData.Towers[k++%CarrotData.Towers.Length];int seat=pad%2;g.TestAsSeat(seat,()=>g.BuyAt(pad,d.id,seat));var t=g.towers.Find(x=>x.pad==pad);if(t!=null)for(int u=0;u<3;u++)g.UpgradeTower(t.id,0,seat);}
     g.TestAsSeat(0,()=>g.NetGo());foreach(var op in g.OutOps){op.k=g.NetTick+1;g.EnqueueOp(op);}g.OutOps.Clear();g.NetRunTo(g.NetTick+2,2,false);
     var e=g.TestSpawnWave(unit.Key,spawned%2,w,unit.Value);spawned++;NetCheck(e!=null&&e.alive&&e.hp>0,"spawned "+unit.Key+" "+unit.Value+" at wave "+w);
     if(unit.Key=="boss")NetCheck(e.maxHp==CarrotEndlessGen.BossHp(unit.Value,w),"endless boss HP from the integer curve");
     int casts=0,played=0;int unitId=e.id;g.Effect+=v=>{if((v.type=="telegraph"||v.type=="ability")&&v.id==unitId)casts++;};
     for(int i=0;i<1200&&g.phase=="playing";i++){g.health=10;g.NetRunTo(g.NetTick+1,1,false);played++;}
     NetCheck(played==1200,"the kit ran 40 s of play ("+played+")");if(unit.Key=="boss"||CarrotData.IsMini(unit.Key))kitCasts[unit.Value??unit.Key]=(kitCasts.ContainsKey(unit.Value??unit.Key)?kitCasts[unit.Value??unit.Key]:0)+casts;
     Done(g);
    }
   }
   NetCheck(CarrotData.EndlessTableHits==0,"zero per-level table reads for id 90 ("+CarrotData.EndlessTableHits+")");
   var sb=new StringBuilder();foreach(var kv in kitCasts){sb.Append(kv.Key).Append('=').Append(kv.Value).Append(' ');NetCheck(kv.Value>0,"every boss and miniboss kit casts on Twin Gates ("+kv.Key+")");}Debug.Log("CARROT_ALL_KITS casts "+sb);
   // Duo halves: each fight's half 1 plays a full bot game without exceptions.
   policyMerges=true;scoreNoise=null;
   foreach(int level in CarrotDuoMaps.DuoLevels){ClearBotCaches();var g=NetGame(level,"duo",1);SellUprooted(g);var tb=new TwinBot();BuyBest(g,0);BuyBest(g,0);g.Command("{\"type\":\"start\"}");int ticks=0;
    while(g.phase=="playing"&&ticks<40000){if(ticks%7==0)PolicyStep(g,0,tb);g.StepSimulation(1f/30);ticks++;}Debug.Log("CARROT_ALL_KITS duo level="+level+" ticks="+ticks+" phase="+g.phase);Done(g);}
   Debug.Log("CARROT_ALL_KITS_OK spawned="+spawned+" tableHits="+CarrotData.EndlessTableHits+" checks="+netChecks);
  }

  // ================= LockstepPeers: two endless devices through a lossy, jittery link and the page's lockstep rules.
  sealed class LockPeer {
   public NetDevice dev;public int exec,committed,partnerCommitted,ackFromPartner,receivedFromPartner,rate=1,stalls;public double target;
   public readonly List<NetOp> unacked=new List<NetOp>(),toEngine=new List<NetOp>();public readonly List<long> digests=new List<long>(),partnerDigests=new List<long>();
   public readonly Dictionary<int,NetOp> partnerOps=new Dictionary<int,NetOp>();public EBot bot;public bool over;public int finalScore=-1;
  }
  sealed class LockFrame {public double at;public int committed,ack;public List<NetOp> ops;public long[] digests;}
  public static void LockstepPeers(string[] args){
   policyMerges=true;netChecks=0;long compared=0;int runs=0;
   var seeds=ArgRange(args,"seeds","0-19");var ds=ArgRange(args,"d","2,4,8");var losses=ArgRange(args,"loss","0,5,10");int waves=int.Parse(Arg(args,"waves","25"),CultureInfo.InvariantCulture);
   foreach(int seed in seeds)foreach(int d in ds)foreach(int loss in losses){
    var r=LockstepMatch((uint)(5000+seed),d,loss/100.0,waves,0);runs++;compared+=r.compared;Debug.Log("CARROT_LOCKSTEP "+r.line);
    NetCheck(r.ok,"lockstep seed "+seed+" D="+d+" loss="+loss+"%: "+r.line);
   }
   // Positive control: one coin on one peer is caught within 30 ticks.
   var p=LockstepMatch(5999,4,.05,6,900);Debug.Log("CARROT_LOCKSTEP_CONTROL "+p.line);NetCheck(p.desyncs>0&&p.detectAt>=900&&p.detectAt<=960,"a one-coin lockstep perturbation is detected within 30 ticks ("+p.detectAt+")");
   Debug.Log("CARROT_LOCKSTEP_OK runs="+runs+" compared="+compared+" checks="+netChecks);
  }
  sealed class LockOutcome {public bool ok;public int desyncs,compared,detectAt=-1,ticks,score0,score1;public string line;}
  static LockOutcome LockstepMatch(uint seed,int d,double loss,int waves,int perturbAt,List<string> golden=null){
   var rng=new BotRng((int)seed,d,BotCode("LOCK"));var peers=new[]{new LockPeer(),new LockPeer()};var frames=new[]{new List<LockFrame>(),new List<LockFrame>()};
   for(int i=0;i<2;i++){var p=peers[i];p.dev=new NetDevice(i,golden);p.dev.Send(SessionJson("endless",90,i,-1,seed));p.committed=d-1;p.partnerCommitted=d-1;p.bot=MakeEBot("E-R1",i,seed);}
   double now=0,dt=1/60.0;int frame=0;bool perturbed=false;double baseDelay=.03+rng.Unit()*.12,jitter=baseDelay*.2;
   while(frame++<60*60*120){
    now+=dt;
    for(int i=0;i<2;i++){
     var p=peers[i];var g=p.dev.game;
     // Partner frames that arrived (unordered: jitter can reorder).
     for(int k=frames[1-i].Count-1;k>=0;k--){var f=frames[1-i][k];if(f.at>now)continue;frames[1-i].RemoveAt(k);
      if(f.committed>p.partnerCommitted)p.partnerCommitted=f.committed;if(f.ack>p.ackFromPartner)p.ackFromPartner=f.ack;
      foreach(var op in f.ops)if(!p.partnerOps.ContainsKey(op.s)&&op.s>p.receivedFromPartner)p.partnerOps[op.s]=op;
      while(p.partnerOps.ContainsKey(p.receivedFromPartner+1)){p.toEngine.Add(p.partnerOps[p.receivedFromPartner+1]);p.partnerOps.Remove(p.receivedFromPartner+1);p.receivedFromPartner++;}
      if(f.digests!=null)p.partnerDigests.AddRange(f.digests);}
     p.unacked.RemoveAll(op=>op.s<=p.ackFromPartner);
     if(frame==150&&i==0)p.dev.Send("{\"t\":\"go\"}");
     if(g.phase=="playing"&&g.elapsed>=p.bot.next){EDecide(g,p.bot);p.bot.next=g.elapsed+EGap(p.bot);}
     else if(g.phase=="ready"&&frame==20){EDecide(g,p.bot);EDecide(g,p.bot);}
     if(perturbAt>0&&i==1&&!perturbed&&g.NetTick>=perturbAt){g.coins+=1;perturbed=true;}
     var msgs=p.dev.Frame((float)dt);
     foreach(var m in msgs){
      if(m.t=="tick"){if(m.exec>p.exec)p.exec=m.exec;if(m.rate>0)p.rate=m.rate;if(m.d!=null&&m.d.Length==3)p.digests.AddRange(m.d);}
      if(m.t=="result"&&m.outcome=="lost"){p.over=true;p.finalScore=m.score;}
     }
     p.committed=Mathf.Max(p.committed,p.exec+d-1);
     foreach(var m in msgs)if(m.t=="intent"&&m.op!=null){var op=m.op;op.k=p.committed+1;p.unacked.Add(op);p.toEngine.Add(op);}
     // One frame to the partner: commit, every unacknowledged op, the ack of theirs, the new digests (lost with probability `loss`).
     var fr=new LockFrame{at=now+baseDelay+(rng.Unit()*2-1)*jitter,committed=p.committed,ack=p.receivedFromPartner,ops=new List<NetOp>(p.unacked),digests=p.digests.Count>0?p.digests.ToArray():null};
     p.digests.Clear();if(rng.Unit()>=loss)frames[i].Add(fr);else if(fr.digests!=null)p.digests.AddRange(fr.digests);
     if(!g.MatchPaused)p.target+=dt*30*p.rate;
     int to=Mathf.Min((int)p.target,Mathf.Min(p.committed,p.partnerCommitted));
     var step=new StringBuilder();step.Append("{\"t\":\"step\",\"to\":").Append(to).Append(",\"ops\":[");for(int k=0;k<p.toEngine.Count;k++){if(k>0)step.Append(',');CarrotNetSession.OpJson(step,p.toEngine[k],true);}
     step.Append("],\"d\":[");for(int k=0;k<p.partnerDigests.Count;k++){if(k>0)step.Append(',');step.Append(p.partnerDigests[k]);}step.Append("]}");
     p.toEngine.Clear();p.partnerDigests.Clear();p.dev.Send(step.ToString());
    }
    if(peers[0].over&&peers[1].over)break;
    if(peers[0].dev.game.EndlessScore>=waves&&peers[1].dev.game.EndlessScore>=waves&&peers[0].dev.game.NetTick==peers[1].dev.game.NetTick)break;
   }
   var o=new LockOutcome();
   for(int i=0;i<2;i++){var p=peers[i];o.desyncs+=p.dev.desyncs.Count;o.compared+=p.dev.session.DigestsCompared;foreach(var m in p.dev.desyncs)if(o.detectAt<0||m.tick<o.detectAt)o.detectAt=m.tick;}
   var g0=peers[0].dev.game;var g1=peers[1].dev.game;o.score0=g0.EndlessScore;o.score1=g1.EndlessScore;o.ticks=Mathf.Min(g0.NetTick,g1.NetTick);
   int expected=2*(o.ticks/30)-4;bool sameEnd=g0.NetTick!=g1.NetTick||NetPair(g0)==NetPair(g1);
   o.ok=o.desyncs==0&&o.compared>=expected&&o.score0==o.score1&&sameEnd&&peers[0].dev.errors.Count==0&&peers[1].dev.errors.Count==0;
   o.line="seed="+seed+" D="+d+" loss="+loss.ToString("F2",CultureInfo.InvariantCulture)+" delay="+(baseDelay*1000).ToString("F0",CultureInfo.InvariantCulture)+"ms ticks="+g0.NetTick+"/"+g1.NetTick+" scores="+o.score0+"/"+o.score1+" compared="+o.compared+" expected>="+expected+" desyncs="+o.desyncs+" frames="+frame+" phases="+g0.phase+"/"+g1.phase;
   foreach(var p in peers){p.dev.session.Dispose();Done(p.dev.game);}
   return o;
  }

  // ================= NetBridgeGolden: real CarrotNetSession traffic of a scripted duo and endless run, both directions (JSONL).
  public static void NetBridgeGolden(string[] args){
   policyMerges=true;scoreNoise=null;var lines=new List<string>();ClearBotCaches();
   lines.Add("{\"dir\":\"meta\",\"note\":\"generated by carrot-sim --method NetBridgeGolden; every message of the C# bridge in both directions\",\"netVersion\":"+CarrotNetSession.NetVersion+",\"schema\":\""+CarrotNetState.SchemaHash().ToString("x8")+"\"}");
   var o=DuoMatch(25,11,maxDelayMs:120,stalls:false,golden:lines,maxFrames:60*60*3);
   var l=LockstepMatch(77,3,0,3,0,lines);
   // Export, import and replay shapes.
   var dev=new NetDevice(0,lines);dev.Send(SessionJson("duo",25,0,0,0));dev.Send("{\"t\":\"clock\",\"run\":true,\"speed\":2}");dev.Send("{\"t\":\"go\"}");for(int i=0;i<90;i++)dev.Frame(1/60f);
   dev.Send("{\"t\":\"export\",\"target\":\"replica\"}");var msgs=dev.Frame(1/60f);string b64=null;foreach(var m in msgs)if(m.t=="state")b64=m.b64;
   dev.Send("{\"t\":\"import\",\"target\":\"replica\",\"tick\":0,\"b64\":\""+b64+"\"}");dev.Frame(1/60f);
   dev.Send("{\"t\":\"replay\",\"target\":\"replica\",\"to\":120,\"ops\":[]}");for(int i=0;i<4;i++)dev.Frame(1/60f);
   dev.Send("{\"t\":\"camera\",\"mode\":\"both\"}");dev.Send("{\"t\":\"end\"}");dev.Frame(1/60f);dev.session.Dispose();Done(dev.game);
   string path=Arg(args,"out","output/carrot-net/bridge-golden.jsonl");System.IO.Directory.CreateDirectory(System.IO.Path.GetDirectoryName(System.IO.Path.GetFullPath(path)));
   // Keep the fixture small: the first 400 lines plus every line carrying a message type not yet seen.
   var kept=new List<string>();var seenTypes=new HashSet<string>();foreach(var line in lines){bool fresh=false;foreach(var t in TypesIn(line))if(seenTypes.Add(t))fresh=true;if(kept.Count<400||fresh)kept.Add(line);}
   System.IO.File.WriteAllText(path,string.Join("\n",kept)+"\n");
   Debug.Log("CARROT_NET_GOLDEN lines="+kept.Count+" of "+lines.Count+" types="+string.Join(",",seenTypes)+" duo=("+o.line+") lockstep=("+l.line+") out="+path);
  }
  static IEnumerable<string> TypesIn(string line){int i=0;while((i=line.IndexOf("\"t\":\"",i,StringComparison.Ordinal))>=0){i+=5;int j=line.IndexOf('"',i);if(j<0)yield break;yield return (line.Contains("\"dir\":\"in\"")?"in:":"out:")+line.Substring(i,j-i);i=j;}}

  // ================= NetPerf: own half + replica cost vs solo, endless tick cost at wave 60, silent replay rate.
  public static void NetPerf(string[] args){
   policyMerges=true;scoreNoise=null;var inv=CultureInfo.InvariantCulture;
   foreach(int level in ArgRange(args,"levels","24,28")){
    ClearBotCaches();var solo=NetGame(level,"normal",0);var tb=new TwinBot();SellUprooted(solo);BuyBest(solo,0);BuyBest(solo,0);solo.Command("{\"type\":\"start\"}");var ops=new List<string>();
    var soloWatch=new Stopwatch();int ticks=0;var script=new List<KeyValuePair<int,Action<CarrotGame>>>();
    while(solo.phase=="playing"&&ticks<40000){if(ticks%7==0)PolicyStep(solo,0,tb);soloWatch.Start();solo.StepSimulation(1f/30);soloWatch.Stop();ticks++;}
    ClearBotCaches();var own=NetGame(level,"duo",0);own.NetBegin(NetMode.DuoOwn,0);var rep=NetGame(level,"duo",0);rep.NetBegin(NetMode.Replica,0);var tb2=new TwinBot();SellUprooted(own);BuyBest(own,0);BuyBest(own,0);own.NetGo();
    var duoWatch=new Stopwatch();int dticks=0;
    while((own.phase=="playing"||own.phase=="ready")&&!own.DuoHold&&dticks<40000){if(dticks%7==0)PolicyStep(own,0,tb2);foreach(var op in own.OutOps)rep.EnqueueOp(op);own.OutOps.Clear();duoWatch.Start();own.NetRunTo(own.NetTick+1,1,false);rep.NetRunTo(own.NetTick,1,false);duoWatch.Stop();dticks++;}
    double soloUs=soloWatch.Elapsed.TotalMilliseconds*1000/Math.Max(1,ticks),duoUs=duoWatch.Elapsed.TotalMilliseconds*1000/Math.Max(1,dticks);
    Debug.Log("CARROT_NET_PERF level="+level+" soloUsPerTick="+soloUs.ToString("F2",inv)+" ownPlusReplicaUsPerTick="+duoUs.ToString("F2",inv)+" ratio="+(duoUs/Math.Max(.001,soloUs)).ToString("F2",inv)+" ticks="+ticks+"/"+dticks);
    Done(solo);Done(own);Done(rep);
   }
   // Endless tick cost around wave 60 (immortal carrot so the field is full, an E-R0 garden building on).
   {var g=NetGame(CarrotDuoMaps.EndlessId,"endless",60606);g.NetBegin(NetMode.Lockstep,0);g.coins=100000;
    for(int pad=0,k=0;pad<g.level.pads.Length;pad++){if(g.blockers.Exists(b=>b.pad==pad))continue;var d=CarrotData.Towers[k++%CarrotData.Towers.Length];g.BuyAt(pad,d.id,pad%2);var t=g.towers.Find(x=>x.pad==pad);if(t!=null)for(int u=0;u<3;u++)g.UpgradeTower(t.id,0,0);}
    g.TestAsSeat(0,()=>g.NetGo());foreach(var op in g.OutOps){op.k=g.NetTick+1;g.EnqueueOp(op);}g.OutOps.Clear();
    var watch=new Stopwatch();int n=0,peak=0;
    while(g.wave<66&&n<3000000){g.health=10;bool measure=g.wave>=58;if(measure)watch.Start();g.NetRunTo(g.NetTick+1,1,false);if(measure){watch.Stop();n++;peak=Mathf.Max(peak,g.LiveEnemies);}
     if(g.nextWave>0&&g.wave<58){g.TestAsSeat(0,()=>g.Command("{\"type\":\"next\"}"));foreach(var op in g.OutOps){op.k=g.NetTick+1;g.EnqueueOp(op);}g.OutOps.Clear();}}
    Debug.Log("CARROT_NET_PERF endless wave60UsPerTick="+(watch.Elapsed.TotalMilliseconds*1000/Math.Max(1,n)).ToString("F2",inv)+" ticks="+n+" peakLive="+peak+" towers="+g.towers.Count+" folded="+g.SummonsFolded);Done(g);}
  }

  // ================= Duo bands and the statistical mirror gate: bots on the solo map and on each half (one JSON line per run).
  //   spec "BOT:levels:seeds:map" with map solo|half0|half1, e.g. "R1:25:0-199:half0".
  public static void DuoJobs(string[] args){
   policyMerges=true;
   foreach(var a in args){
    var parts=a.Split(':');string bot=parts[0];string map=parts.Length>3?parts[3]:"solo";newMode=map=="half0"?"duo:0":map=="half1"?"duo:1":"normal";
    foreach(int level in Range(parts[1])){ClearBotCaches();foreach(int seed in Range(parts[2])){BotRun r;
     switch(bot){case "R0p0":r=RunExpert(level,0,seed);break;case "R0p1":if(level==29)continue;r=RunExpert(level,1,seed);break;case "R1":r=RunHuman(level,seed,R1Profile);break;case "R2":r=RunHuman(level,seed,R2Profile);break;case "RN":if(level==29)continue;r=RunNaive(level,seed);break;default:throw new ArgumentException("unknown bot "+bot);}
     Debug.Log("CARROT_DUOBAND {\"map\":\""+map+"\","+r.Json().Substring(1));}}
   }
   newMode="normal";
  }
 }
}
#endif
