#if UNITY_EDITOR
using System;
using System.Collections.Generic;
using System.Globalization;
using System.Text;
using UnityEngine;

namespace CarrotTD {
 // ebots-v1: the two-player endless reference bots. Pre-registered (committed and hash-recorded in docs/carrot-defense/duo/sim.md)
 // before any endless dial was tuned; changing them invalidates every endless band.
 //  Two bot seats share the purse and act only through the page's commands on one lockstep instance (NetMode Lockstep): every
 //  command becomes an intent checked against the provisional state and executes D=4 ticks later, exactly as on two devices.
 //  Each seat prefers its home wing and the centre (seat 0: x <= 2, seat 1: x >= -2) with p .8 per decision.
 //  E-R0 expert: decides every 0.25-0.5 s, takes the best option, merges, answers every telegraph, reads the preview.
 //  E-R1 median: the R1 human (lognormal 4 s cadence, geometric rank q .5, telegraphs p .6, merges p .5, preview p .7).
 //  E-R2 novice: the R2 human (telegraphs p .2, q .7, keeps 25% idle, no preview, never merges).
 //  E-solo: one E-R1 seat alone on the whole map (the "Continue solo" score).
 public static partial class CarrotSimulationTests {
  public const string EndlessBotsVersion="ebots-v1";
  sealed class EBot {public string id;public int seat;public Human h;public bool expert,solo;public BotRng rng;public float next;public int lastMergeWave=-1,lastAirWave=-1,airWanted=-1;}
  sealed class EndlessRun {
   public string bot;public uint seed;public int score,wave,kills,leaks,peakLive,folded,decisions,towers,seats;public float seconds;public int[] gateLeaks=new int[2];public bool capped;
   public readonly List<int> waveHearts=new List<int>();
   public string Json(){
    var sb=new StringBuilder(256);var inv=CultureInfo.InvariantCulture;
    sb.Append("{\"bot\":\"").Append(bot).Append("\",\"version\":\"").Append(EndlessBotsVersion).Append("\",\"tuning\":\"").Append(CarrotEndlessGen.TuningVersion).Append("\",\"seed\":").Append(seed).Append(",\"score\":").Append(score)
     .Append(",\"wave\":").Append(wave).Append(",\"seconds\":").Append(seconds.ToString("F1",inv)).Append(",\"kills\":").Append(kills).Append(",\"leaks\":").Append(leaks).Append(",\"gateLeaks\":[").Append(gateLeaks[0]).Append(',').Append(gateLeaks[1])
     .Append("],\"peakLive\":").Append(peakLive).Append(",\"folded\":").Append(folded).Append(",\"decisions\":").Append(decisions).Append(",\"towers\":").Append(towers).Append(",\"capped\":").Append(capped?"true":"false").Append(",\"waveHearts\":[");
    for(int i=0;i<waveHearts.Count;i++){if(i>0)sb.Append(',');sb.Append(waveHearts[i]);}sb.Append("]}");return sb.ToString();
   }
  }
  static readonly Human ER0Profile=new Human{id="E-R0",telegraphP=1,airP=1,mergeP=1,focusP=1,reserve=0,q=0,stopP=0,relocateP=0,preview=true,maxActions=4};
  static EBot MakeEBot(string id,int seat,uint seed){
   var h=id=="E-R0"?ER0Profile:id=="E-R2"?R2Profile:R1Profile;
   return new EBot{id=id,seat=seat,h=h,expert=id=="E-R0",solo=id=="E-solo",rng=new BotRng((int)(seed&0x7FFFFFFF),seat,BotCode(id))};
  }
  static float EGap(EBot b){return b.expert?.25f+(float)b.rng.Unit()*.25f:HumanGap(b.rng);}
  static bool HomePad(CarrotGame g,int seat,int pad){float x=g.level.pads[pad].x;return seat==0?x<=2:x>=-2;}

  /// <summary>One endless run: two bot seats (or one for E-solo) through a simulated lockstep (intents execute D ticks later).</summary>
  static EndlessRun RunEndless(string bot,uint seed,int maxWave=150,int d=4,Action<CarrotGame,int> perTick=null,List<NetOp> record=null){
   var g=NetGame(CarrotDuoMaps.EndlessId,"endless",seed);g.NetBegin(NetMode.Lockstep,0);
   var bots=new List<EBot>{MakeEBot(bot=="E-solo"?"E-R1":bot,0,seed)};if(bot!="E-solo")bots.Add(MakeEBot(bot,1,seed));else bots[0].solo=true;
   var run=new EndlessRun{bot=bot,seed=seed,seats=bots.Count};
   var pending=new List<KeyValuePair<float,int>>[2]{new List<KeyValuePair<float,int>>(),new List<KeyValuePair<float,int>>()};
   g.Effect+=v=>{
    if(v.type=="carrotHit"){var e=g.enemies.Find(x=>x.id==v.id);if(e!=null&&e.route>=0&&e.route<2)run.gateLeaks[e.route]++;run.leaks++;}
    if(v.type!="telegraph"&&v.type!="telegraphTarget")return;
    foreach(var b in bots){
     if(v.kind=="uproot"&&v.target>0){if(b.rng.Unit()<b.h.telegraphP)pending[b.seat].Add(new KeyValuePair<float,int>(g.elapsed+.3f+(float)b.rng.Unit()*(b.expert?.2f:1.2f),v.target));}
     else if(v.type=="telegraph"&&(v.kind=="tithe"||v.kind=="coinLeech")){if(b.rng.Unit()<b.h.telegraphP)pending[b.seat].Add(new KeyValuePair<float,int>(g.elapsed+.3f+(float)b.rng.Unit()*(b.expert?.2f:1.2f),-1));}
    }
   };
   // Prep: two decisions each, then the host's start.
   foreach(var b in bots){EDecide(g,b);EDecide(g,b);}
   g.TestAsSeat(0,()=>g.NetGo());
   int ticks=0;
   while(g.phase!="lost"&&g.phase!="won"&&ticks<200000){
    // Drain intents: stamp E+D (the simulated lockstep), exactly what the page would do.
    foreach(var op in g.OutOps){op.k=g.NetTick+d;var copy=op.Clone();g.EnqueueOp(copy);record?.Add(copy);}g.OutOps.Clear();
    g.NetRunTo(g.NetTick+1,1,false);ticks++;perTick?.Invoke(g,ticks);
    if(g.phase!="playing"&&g.phase!="ready")break;
    if((ticks&7)==0){int live=g.LiveEnemies;if(live>run.peakLive)run.peakLive=live;}
    if(g.wave>maxWave||g.EndlessScore>=maxWave){run.capped=true;break;}
    if(g.phase!="playing")continue;
    foreach(var b in bots){
     var list=pending[b.seat];
     for(int i=list.Count-1;i>=0;i--)if(list[i].Key<=g.elapsed){int id=list[i].Value;list.RemoveAt(i);
      if(id>0){var t=g.towers.Find(x=>x.id==id);if(t!=null)g.TestAsSeat(b.seat,()=>{g.Select("tower",id);g.Command("{\"type\":\"sell\"}");});}
      else ESpend(g,b,b.h.maxActions);}
     if(g.elapsed>=b.next){EDecide(g,b);run.decisions++;b.next=g.elapsed+EGap(b);}
    }
   }
   run.score=g.EndlessScore;run.wave=g.wave;run.seconds=g.elapsed;run.kills=g.Kills;run.folded=g.SummonsFolded;run.towers=g.towers.Count;
   for(int w=1;w<=Mathf.Min(g.wave,g.level.waves);w++)run.waveHearts.Add(g.WaveHeartsLost(w));
   Done(g);return run;
  }
  static void EDecide(CarrotGame g,EBot b){
   var h=b.h;
   if(h.mergeP>0&&g.wave!=b.lastMergeWave&&g.wave>=10&&MergePairExists(g)){b.lastMergeWave=g.wave;if(b.rng.Unit()<h.mergeP)g.TestAsSeat(b.seat,()=>MergeBest(g));}
   if(h.preview){int nw=g.wave+1;
    if(nw!=b.lastAirWave){var routes=AirRoutes(g,nw);bool uncovered=false;foreach(int r in routes)if(!TailCovered(g,r))uncovered=true;if(uncovered){b.lastAirWave=nw;if(b.rng.Unit()<h.airP)b.airWanted=nw;}}
    if(b.airWanted>0&&(b.airWanted==g.wave+1||b.airWanted==g.wave)){bool bought=false;g.TestAsSeat(b.seat,()=>bought=BuyAirCounter(g,AirRoutes(g,b.airWanted),g.ProvisionalCoins*(1-h.reserve)));if(bought)b.airWanted=-1;}else b.airWanted=-1;
   }
   ESpend(g,b,h.maxActions);
   if(b.rng.Unit()<h.focusP)g.TestAsSeat(b.seat,()=>EFocus(g));
   // Early calls: the expert calls the next wave when the field is clear and the purse is spent.
   if(b.expert&&g.nextWave>0&&g.LiveEnemies==0&&g.ProvisionalCoins<60)g.TestAsSeat(b.seat,()=>g.Command("{\"type\":\"next\"}"));
  }
  static void EFocus(CarrotGame g){
   EnemyState boss=g.enemies.Find(e=>e.alive&&!string.IsNullOrEmpty(e.boss)&&!e.hidden);bool crisis=g.enemies.Exists(e=>e.alive&&string.IsNullOrEmpty(e.boss)&&e.distance/e.routeLength>.87f);
   if(boss!=null&&boss.distance/boss.routeLength>.45f&&!crisis){if(!(g.FocusType=="enemy"&&g.FocusId==boss.id))g.Select("enemy",boss.id);}
   else if(boss==null&&g.FocusType==""){var b=g.blockers.Find(x=>x.ownerEnemy==0||x.kind=="root"||x.kind=="grave");if(b!=null&&g.towers.Count>=6)g.Select("blocker",b.id);}
  }
  static void ESpend(CarrotGame g,EBot b,int max){
   for(int actions=0;actions<max;actions++){bool acted=false;g.TestAsSeat(b.seat,()=>acted=EAct(g,b,g.ProvisionalCoins*(1-b.h.reserve)));if(!acted)break;if(b.rng.Unit()<b.h.stopP)break;}
  }
  static int EPendingUpgrades(CarrotGame g,int id){int n=0;foreach(var p in g.PendingOps)if(p.op=="upgrade"&&p.id==id)n++;return n;}
  static bool EPendingPad(CarrotGame g,int pad){foreach(var p in g.PendingOps)if(p.op=="buy"&&p.pad==pad)return true;return false;}
  /// <summary>R1/R2's HumanAct on the shared map: provisional tiers and purse, pads with a pending build skipped, home wing first.</summary>
  static bool EAct(CarrotGame g,EBot b,float budget){
   upCands.Clear();buildCands.Clear();int count=g.towers.Count;bool home=!b.solo&&b.rng.Unit()<.8;
   foreach(var t in g.towers){int tier=t.tier+EPendingUpgrades(g,t.id);if(tier>=4)continue;if(home&&!HomePad(g,b.seat,t.pad))continue;var d=CarrotData.Tower(t.kind);int cost=d.cost[tier];if(cost>budget)continue;
    float score=(Power(d,tier)-Power(d,tier-1))*Preference(d.id,0,20)*Coverage(g,t.position,d.range[tier])/cost*(count<5?.75f:1.1f);if(score>0)upCands.Add(new Cand{up=true,id=t.id,pad=t.pad,kind=t.kind,score=score,cost=cost});}
   bool control=false,aura=false,cleanse=false;foreach(var t in g.towers){if(t.kind=="frost"||t.kind=="gravity"||t.kind=="book"||t.kind=="clockflower"||t.kind=="mushroom")control=true;if(t.kind=="blossom"||t.kind=="clockflower")aura=true;if(t.kind=="lotus")cleanse=true;}
   for(int p=0;p<g.level.pads.Length;p++){if(PadTaken(g,p)||EPendingPad(g,p))continue;if(home&&!HomePad(g,b.seat,p))continue;Vector3 at=g.level.pads[p];
    foreach(var d in CarrotData.Towers){if(d.cost[0]>budget)continue;
     float overlap=0;foreach(var t in g.towers)if(Vector3.Distance(t.position,at)<3.2f)overlap+=.16f;
     float score=Power(d,0)*Preference(d.id,0,20)*Coverage(g,at,d.range[0])/d.cost[0]/(1+overlap+count*.05f);
     int family=0;foreach(var t in g.towers)if(t.kind==d.id)family++;score/=1+family*.55f;
     if(count>=3&&!control&&(d.id=="frost"||d.id=="clockflower"||d.id=="mushroom"))score*=1.8f;
     if(count>=5&&!aura&&(d.id=="blossom"||d.id=="clockflower"))score*=1.65f;
     if(count>=5&&d.id=="lotus"&&!cleanse)score*=1.65f;
     if(d.id=="frost"&&count<2)score*=.2f;
     if(score>0)buildCands.Add(new Cand{up=false,id=0,pad=p,kind=d.id,score=score,cost=d.cost[0]});}}
   bool upgradeFirst=count>=2&&b.rng.Unit()<.5;var list=upgradeFirst?(upCands.Count>0?upCands:buildCands):(buildCands.Count>0?buildCands:upCands);
   if(list.Count==0)return false;list.Sort(CandOrder);
   int k=0;while(k<list.Count-1&&b.rng.Unit()<b.h.q)k++;var c=list[k];int before=g.PendingOps.Count;
   if(c.up){g.Select("tower",c.id);g.Command("{\"type\":\"upgrade\"}");}else{g.Select("pad",c.pad);g.Command("{\"type\":\"buy\",\"kind\":\""+c.kind+"\"}");}
   g.Select("",-1);return g.PendingOps.Count>before;
  }

  /// <summary>Band jobs: spec "BOT:seeds", e.g. "E-R1:0-49"; args may add wave=N (cap) and d=N (lockstep delay). One CARROT_EBAND line per run.</summary>
  public static void EndlessJobs(string[] args){
   policyMerges=true;int maxWave=150,d=4;
   foreach(var a in args){
    if(a.StartsWith("wave=",StringComparison.Ordinal)){maxWave=int.Parse(a.Substring(5),CultureInfo.InvariantCulture);continue;}
    if(a.StartsWith("d=",StringComparison.Ordinal)){d=int.Parse(a.Substring(2),CultureInfo.InvariantCulture);continue;}
    if(a.StartsWith("dial=",StringComparison.Ordinal)){foreach(var pair in a.Substring(5).Split(',')){var kv=pair.Split(':');int i=CarrotEndlessGen.BossIndex(kv[0]);if(i>=0)CarrotEndlessGen.BossDial[i]=int.Parse(kv[1],CultureInfo.InvariantCulture);}continue;}
    var parts=a.Split(':');string bot=parts[0];foreach(int s in Range(parts[1])){var r=RunEndless(bot,(uint)(1000+s),maxWave,d);Debug.Log("CARROT_EBAND "+r.Json());}
   }
  }
 }
}
#endif
