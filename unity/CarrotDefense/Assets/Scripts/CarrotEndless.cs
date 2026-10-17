using System;
using System.Collections.Generic;
using System.Globalization;
using UnityEngine;

namespace CarrotTD {
 /// <summary>
 /// Two-player endless (level 90, "Twin Gates"): the wave generator. Wave w's plan is a pure function of (room seed, w),
 /// generated in order and cached (the lead-kind and miniboss no-repeat rules read the waves before it), so a plan made at
 /// load, mid-run or out of order is the same. All scaling is integer (parts per million / per mille) and rounded to whole HP
 /// and coins before it enters float state: no Pow, Exp or Log, so .NET, Chromium and WebKit agree to the bit.
 ///  Cycle of 10: waves ending 1-4 and 6-9 ordinary, 5 a miniboss wave (1 before wave 30, then 2, one per gate; escorts at
 ///  0.6 of the budget), 0 a boss wave (one boss, adds at 0.4). Budget B(w)=70+16w+floor(w^2/4) cost units over k=min(4,1+w/6)
 ///  kinds of the unlocked tiers; at most 70 ordinary units (the cap folds the rest into hpBonus, at most x2.5).
 ///  HP: ordinary base*H(w)*hpBonus, minibosses base*Hm(w), bosses BossBaseHp*H(w)/HPScale(home)*dial; H and Hm are integer
 ///  recurrences (constants below; t0 began at H(w)=1.05(1+.115(w-1))1.02^(w-1) with Hm within 1.7% of H^0.85).
 /// </summary>
 public static class CarrotEndlessGen {
  public const int OrdinaryCap=70,LiveCap=120,ScaleCap=300;
  public const float GapScale=.9f,Overlap=.9f;
  /// <summary>ebots-v1 tuning record: every constant below changes only through `carrot-sim --endless-bands` (docs/carrot-defense/duo/sim.md).</summary>
  public const string TuningVersion="endless-t1";
  public static readonly string[][] Tiers={
   new[]{"nibble","dash","swarm","mite"},new[]{"shell","beetle","moth","slug"},new[]{"shaman","wisp","bat","burrow"},
   new[]{"crystal","scarab","firefly","sporeling"},new[]{"tinyZombie","riftling","shardling","mimic"}};
  public static readonly int[] TierUnlock={1,5,9,13,17};
  static readonly string[] CostKinds={"nibble","dash","swarm","mite","shell","beetle","moth","slug","shaman","wisp","bat","burrow","crystal","scarab","firefly","sporeling","tinyZombie","riftling","shardling","mimic"};
  static readonly int[] Costs={6,5,3,3,14,11,9,12,15,8,7,10,16,15,8,11,10,10,10,17};
  public static int UnitCost(string kind){int i=Array.IndexOf(CostKinds,kind);return i>=0?Costs[i]:10;}
  /// <summary>The fifteen minibosses in intro order (Asuna's lane kit is never drawn).</summary>
  public static readonly string[] Minis={"warDrummer","frostHerald","witherPriest","stormWarden","graveCaller","mirrorKnight","riftStalker","mossGolem","emberBoar","venomQueen","ironSnail","lanternLeech","chronoMoth","thornBeast","portalSentinel"};
  /// <summary>The eight endless bosses as four kit-tier pairs: waves 10/20/30/40 pick one of each pair, 50-80 bring the other.</summary>
  public static readonly string[] Bosses={"garden","tornado","marsh","frost","zombie","orchard","eyeball","portal"};
  /// <summary>HPScale of each boss's home level in per mille (L4, L25, L8, L12, L26, L20, L27, L28): the campaign's boss-to-wave ratio.</summary>
  static readonly int[] HomePermille={1650,2620,2620,4030,6280,6280,8680,9250};
  /// <summary>Per-boss HP dials in per mille, tunable only within 600-1400 by the endless bands.</summary>
  /// <summary>endless-t1: garden 900, tornado 700, marsh 600, frost 600, zombie 900, orchard 600, eyeball 900, portal 900 (the kits that
  /// uproot, tithe or lock towers left the garden too weak for the next wave at 1000).</summary>
  public static readonly int[] BossDial={900,700,600,600,900,600,900,900};
  /// <summary>The curve's tunable constants (integers): H(w)=HLead/1000 (1+HLinear/1000 (w-1)) (HGrowth/1000)^(w-1), its miniboss twin,
  /// budget B(w)=BBase+BLinear w+w^2/BQuadDiv, the reward multiplier min(RewardCap, 1000+RewardSlope (w-1)) per mille and the
  /// stipend StipendBase+StipendSlope min(w, StipendCap); a boss wave's adds and a miniboss wave's escorts take BossAdds and
  /// MiniEscorts per mille of the budget. Only the bands change them (docs/carrot-defense/duo/sim.md).</summary>
  // endless-t1 (docs/carrot-defense/duo/sim.md): from t0 the late curve was flattened (HLinear 115 -> 240, HGrowth 1020 -> 1010: a
  // saturated garden no longer caps every bot near wave 42), boss and miniboss waves were put back on the pressure trend (adds
  // 400 -> 800, escorts 600 -> 850 per mille: their dips made the next wave the deadliest) and the miniboss lead fell 1042 -> 850.
  public static int HLead=1050,HLinear=240,HGrowth=1010,MLead=850,MLinear=95,MGrowth=10145,BBase=70,BLinear=16,BQuadDiv=4,RewardSlope=15,RewardCap=1600,StipendBase=20,StipendSlope=2,StipendCap=40,BossAdds=800,MiniEscorts=850;
  static long[] growH,growM;static int grownH,grownM;
  static void Grow(){
   if(growH!=null&&grownH==HGrowth&&grownM==MGrowth)return;var h=new long[ScaleCap+1];var m=new long[ScaleCap+1];h[1]=m[1]=1000000000L;
   for(int w=2;w<=ScaleCap;w++){h[w]=h[w-1]*HGrowth/1000;m[w]=m[w-1]*MGrowth/10000;}growH=h;growM=m;grownH=HGrowth;grownM=MGrowth;
  }
  static int ScaleWave(int w){return w<1?1:w>ScaleCap?ScaleCap:w;}
  /// <summary>H(w) in parts per million (1,050,000 at wave 1).</summary>
  public static long HPpm(int w){Grow();w=ScaleWave(w);return growH[w]/1000*((long)HLead*(1000+(long)HLinear*(w-1)))/1000000L;}
  /// <summary>Hm(w) in parts per million (the miniboss curve).</summary>
  public static long MiniPpm(int w){Grow();w=ScaleWave(w);return growM[w]/1000*((long)MLead*(1000+(long)MLinear*(w-1)))/1000000L;}
  public static int Budget(int w){return BBase+BLinear*w+w*w/Math.Max(1,BQuadDiv);}
  public static int RewardPermille(int w){return Math.Min(RewardCap,1000+RewardSlope*(Math.Max(1,w)-1));}
  public static int Reward(int baseReward,int w){return Math.Max(baseReward,(int)((long)baseReward*RewardPermille(w)/1000));}
  public static int Stipend(int w){return StipendBase+StipendSlope*Math.Min(Math.Max(1,w),StipendCap);}
  /// <summary>Bands only: set a curve constant by name (gen=Key:value,...).</summary>
  public static bool SetConstant(string key,int value){var f=typeof(CarrotEndlessGen).GetField(key);if(f==null||f.FieldType!=typeof(int)||f.IsLiteral||f.IsInitOnly)return false;f.SetValue(null,value);return true;}
  /// <summary>Breather before wave next: 6 s up to wave 10, 5 s up to 30, then 4 s.</summary>
  public static float Breather(int next){return next<=10?6f:next<=30?5f:4f;}
  public static bool BossWave(int w){return w>0&&w%10==0;}
  public static bool MiniWave(int w){return w>0&&w%10==5;}
  static int Rounded(long micro){return (int)Math.Min(int.MaxValue,(micro+500000)/1000000);}
  /// <summary>Whole HP of an ordinary unit (hpBonus in per mille) or a miniboss of wave w; summons ignore the bonus.</summary>
  public static int UnitHp(float baseHp,int w,bool mini,bool summoned,int bonusPermille){
   long b=(long)Math.Round(baseHp);long v=b*(mini?MiniPpm(w):HPpm(w));if(!mini&&!summoned&&bonusPermille>0&&bonusPermille!=1000)v=v/1000*bonusPermille;return Rounded(v);
  }
  public static int BossIndex(string id){return Array.IndexOf(Bosses,id);}
  /// <summary>Whole HP of boss `id` on wave w: BossBaseHp x H(w) / HPScale(home) x dial.</summary>
  public static int BossHp(string id,int w){
   int i=BossIndex(id);long b=(long)Math.Round(CarrotData.BossBaseHp(id));if(i<0)return (int)b;
   long v=b*HPpm(w)/1000;v=v*BossDial[i]/HomePermille[i];return (int)Math.Min(int.MaxValue,(v+500)/1000);
  }
  public static bool Air(string kind){return CarrotData.Traits(kind).air;}
  public static bool Shielded(string kind){return CarrotData.Traits(kind).shield;}
  static uint Next(ref uint x){x^=x<<13;x^=x>>17;x^=x<<5;return x;}
  /// <summary>Wave w's xorshift32: seed ^ (w * 0x9E3779B9), stepped four times before first use.</summary>
  public static uint WaveRng(uint seed,int w){uint x=unchecked(seed^((uint)w*0x9E3779B9u));if(x==0)x=0x6D2B79F5u;for(int i=0;i<4;i++)Next(ref x);return x;}

  /// <summary>One generated wave: the packet strings PlanPackets schedules, the hpBonus of its ordinary units, its boss and minibosses.</summary>
  public sealed class Wave {
   public int wave,hpBonus=1000,ordinary,budget,spent,bossGate=-1;public string boss="",lead="";public string[] packets,minis=new string[0],kinds=new string[0];public int[] counts=new int[0];
   public string Text(){return string.Join(",",packets);}
  }
  /// <summary>The cached, in-order schedule of one room seed.</summary>
  public sealed class Schedule {
   public readonly uint seed;readonly List<Wave> waves=new List<Wave>();readonly int[] firstPick=new int[4];
   public Schedule(uint seed){this.seed=seed;waves.Add(null);}
   public Wave Get(int w){if(w<1)return null;while(waves.Count<=w)waves.Add(Generate(waves.Count));return waves[w];}
   Wave Generate(int w){
    uint r=WaveRng(seed,w);var ew=new Wave{wave=w,budget=Budget(w)};
    bool bossWave=BossWave(w),miniWave=MiniWave(w);int ordinaryBudget=bossWave?ew.budget*BossAdds/1000:miniWave?ew.budget*MiniEscorts/1000:ew.budget;
    if(bossWave){int k=w/10;ew.boss=PickBoss(k,ref r);ew.bossGate=(k+(int)(seed&1))%2;}
    if(miniWave)ew.minis=PickMinis(w,ref r);
    PickKinds(w,ordinaryBudget,ew,ref r);
    // Packet order: the boss, the lead kind, the miniboss(es), then the rest by count (ties keep draw order).
    var packets=new List<string>();
    if(bossWave)packets.Add("boss:"+ew.boss+"@"+ew.bossGate);
    int lead=Array.IndexOf(ew.kinds,ew.lead);packets.Add(ew.lead+":"+ew.counts[lead].ToString(CultureInfo.InvariantCulture));
    for(int i=0;i<ew.minis.Length;i++){int gate=ew.minis.Length==1?(w/10+(int)(seed&1))%2:i;packets.Add(ew.minis[i]+":1@"+gate.ToString(CultureInfo.InvariantCulture));}
    var rest=new List<int>();for(int i=0;i<ew.kinds.Length;i++)if(i!=lead)rest.Add(i);
    rest.Sort((a,b)=>{int c=ew.counts[b].CompareTo(ew.counts[a]);return c!=0?c:a.CompareTo(b);});
    foreach(int i in rest)packets.Add(ew.kinds[i]+":"+ew.counts[i].ToString(CultureInfo.InvariantCulture));
    ew.packets=packets.ToArray();return ew;
   }
   static readonly string[][] Pairs={new[]{"garden","tornado"},new[]{"marsh","frost"},new[]{"zombie","orchard"},new[]{"eyeball","portal"}};
   string PickBoss(int k,ref uint r){
    if(k<=4){int pick=(int)(Next(ref r)%2);firstPick[k-1]=pick;return Pairs[k-1][pick];}
    if(k<=8){Get(10*(k-4));return Pairs[k-5][1-firstPick[k-5]];}
    string previous=Get(10*(k-1)).boss;var pool=new List<string>();foreach(var b in Bosses)if(b!=previous)pool.Add(b);
    return pool[(int)(Next(ref r)%(uint)pool.Count)];
   }
   string[] PickMinis(int w,ref uint r){
    int count=w<30?1:2,maxIntro=w<15?5:w<25?10:int.MaxValue;
    var previous=w>=15?Get(w-10).minis:new string[0];var pool=new List<string>();
    foreach(var m in Minis){var d=CarrotData.Enemy(m);if(d!=null&&d.intro<=maxIntro&&Array.IndexOf(previous,m)<0)pool.Add(m);}
    if(pool.Count<count)foreach(var m in Minis){var d=CarrotData.Enemy(m);if(d!=null&&d.intro<=maxIntro&&!pool.Contains(m))pool.Add(m);}
    var picked=new string[count];for(int i=0;i<count;i++){int j=(int)(Next(ref r)%(uint)pool.Count);picked[i]=pool[j];pool.RemoveAt(j);}
    return picked;
   }
   void PickKinds(int w,int budget,Wave ew,ref uint r){
    int newest=0;for(int t=0;t<TierUnlock.Length;t++)if(TierUnlock[t]<=w)newest=t;
    var pool=new List<string>();var weight=new List<int>();
    for(int t=0;t<=newest;t++)foreach(var kind in Tiers[t]){pool.Add(kind);weight.Add(t==newest&&(w==TierUnlock[t]||w==TierUnlock[t]+1)?3:1);}
    int k=Math.Min(4,1+w/6);k=Math.Min(k,pool.Count);
    string prev1=w>1?Get(w-1).lead:"",prev2=w>2?Get(w-2).lead:"";
    string[] kinds=null;int[] q=null;string lead="";
    for(int attempt=0;attempt<64;attempt++){
     kinds=new string[k];q=new int[k];var left=new List<int>();for(int i=0;i<pool.Count;i++)left.Add(i);
     for(int i=0;i<k;i++){int total=0;foreach(int j in left)total+=weight[j];int x=(int)(Next(ref r)%(uint)total),pick=left[0];foreach(int j in left){x-=weight[j];if(x<0){pick=j;break;}}left.Remove(pick);kinds[i]=pool[pick];}
     for(int i=0;i<k;i++)q[i]=2+(int)(Next(ref r)%4);
     int best=0;for(int i=1;i<k;i++)if(q[i]>q[best])best=i;lead=kinds[best];
     if(Valid(w,kinds,q,lead,prev1,prev2))break;
     if(attempt==63){kinds=Fallback(k,prev1,prev2,out q);lead=kinds[0];}
    }
    var n=new int[k];int sumQ=0;foreach(int v in q)sumQ+=v;int count=0;
    for(int i=0;i<k;i++){n[i]=Math.Max(2,budget*q[i]/sumQ/UnitCost(kinds[i]));count+=n[i];}
    int spent=0;for(int i=0;i<k;i++)spent+=n[i]*UnitCost(kinds[i]);
    if(count>OrdinaryCap){
     for(int i=0;i<k;i++)n[i]=Math.Max(1,n[i]*OrdinaryCap/count);
     for(int guard=0;guard<1000;guard++){int sum=0,big=0;for(int i=0;i<k;i++){sum+=n[i];if(n[i]>n[big])big=i;}if(sum<=OrdinaryCap)break;n[big]--;}
     spent=0;count=0;for(int i=0;i<k;i++){spent+=n[i]*UnitCost(kinds[i]);count+=n[i];}
     ew.hpBonus=Math.Min(2500,Math.Max(1000,budget*1000/Math.Max(1,spent)));
    }
    ew.kinds=kinds;ew.counts=n;ew.lead=lead;ew.ordinary=count;ew.spent=spent;
   }
   static bool Valid(int w,string[] kinds,int[] q,string lead,string prev1,string prev2){
    bool ground=false;int air=0,sum=0,shielded=0;
    for(int i=0;i<kinds.Length;i++){sum+=q[i];if(Air(kinds[i]))air+=q[i];else ground=true;if(Shielded(kinds[i]))shielded++;}
    if(!ground||shielded>2)return false;
    if(air*100>sum*(w<15?40:60))return false;
    if(prev1!=""&&prev1==prev2&&lead==prev1)return false;
    return true;
   }
   static string[] Fallback(int k,string prev1,string prev2,out int[] q){
    var list=new List<string>();foreach(var kind in new[]{"nibble","dash","shell","beetle"})if(list.Count<k&&!(prev1==prev2&&kind==prev1&&list.Count==0))list.Add(kind);
    while(list.Count<k)list.Add("mite");q=new int[list.Count];for(int i=0;i<q.Length;i++)q[i]=i==0?5:3;return list.ToArray();
   }
  }
 }

 public sealed partial class CarrotGame {
  bool isEndless;uint endlessSeed;CarrotEndlessGen.Schedule endlessSchedule;int endlessCleared;int[] endlessBonus,endlessUnits;
  /// <summary>Two-player endless (level 90) is running.</summary>
  public bool IsEndless {get{return isEndless;}}
  public uint EndlessSeed {get{return endlessSeed;}}
  /// <summary>Waves survived: the highest wave fully cleared.</summary>
  public int EndlessScore {get{return endlessCleared;}}
  /// <summary>The generated wave w of this run's seed (the HUD's preview reads the boss and minibosses ahead).</summary>
  public CarrotEndlessGen.Wave EndlessWave(int w){return isEndless&&endlessSchedule!=null&&w>=1&&w<=level.waves?endlessSchedule.Get(w):null;}
  void ResetEndless(bool on,uint seed){
   isEndless=on;endlessSeed=seed==0?1u:seed;endlessCleared=0;
   endlessSchedule=on?new CarrotEndlessGen.Schedule(endlessSeed):null;
   endlessBonus=on?new int[level.waves+1]:null;endlessUnits=on?new int[level.waves+1]:null;
  }
  /// <summary>Endless plans are generated lazily, at deterministic points only (load, and each BeginWave for the wave and the
  /// next), never from the snapshot or the view, so every peer's state sees them at the same tick.</summary>
  void EnsurePlan(int w){
   if(!isEndless||w<1||w>level.waves||wavePlans[w]!=null)return;var ew=endlessSchedule.Get(w);
   wavePlans[w]=CarrotData.PlanPackets(ew.packets,w,level.routes.Length,CarrotEndlessGen.GapScale,CarrotEndlessGen.Overlap,new List<CarrotData.PlannedSpawn>());
   endlessBonus[w]=ew.hpBonus;endlessUnits[w]=wavePlans[w].Count;
  }
  int WaveStipendHere(int w){return isEndless?CarrotEndlessGen.Stipend(w):CarrotData.WaveStipend(level.id);}
  float BreatherHere(int next){return isEndless?CarrotEndlessGen.Breather(next):CarrotData.Breather(level.id,next);}
  int[] LitPadsHere(){return isEndless?CarrotDuoMaps.EndlessLitPads:CarrotData.LitPads(level.id);}
  /// <summary>Lantern Flood / Moss Shield's grant cap: 130 x the level's HP scale (endless: x H of the current wave, whole HP).</summary>
  float MossShieldCap(){return isEndless?CarrotEndlessGen.UnitHp(130,Mathf.Max(1,wave),false,true,1000):130*CarrotData.HPScale(level.id);}
  void EndlessWavePaid(int w){
   if(!isEndless)return;if(w>endlessCleared)endlessCleared=w;
   // Clearing a boss wave restores two hearts (up to ten).
   if(CarrotEndlessGen.BossWave(w)&&health>0&&health<10){health=Mathf.Min(10,health+2);Emit("ability","heartsRestored",level.routes[0][level.routes[0].Length-1],value:health,duration:1);}
  }
  void UpdateEndlessProgress(){
   if(phase=="won"){progress=1;return;}if(wave<1||endlessUnits==null){progress=0;return;}
   int total=Mathf.Max(1,endlessUnits[wave]),left=Mathf.Max(0,wavePending[wave])+Mathf.Max(0,waveLiving[wave]);
   progress=Mathf.Clamp(1-left/(float)total,0,.99f);
  }
  // ---- Entity cap (lag guarantee): once 120 enemies are live or queued, every further summon is suppressed and folded into a
  // bounded HP bonus on its summoner (3% of its health per suppressed unit, at most +60%). Only endless: the campaign and duo
  // halves are untouched.
  bool SummonCapped(EnemyState summoner){
   if(!isEndless)return false;int live=extraSpawns.Count;for(int i=0;i<enemies.Count;i++)if(enemies[i].alive)live++;
   if(live<CarrotEndlessGen.LiveCap)return false;
   if(summoner!=null&&summoner.alive){var x=Extra(summoner);if(x.foldBase<=0)x.foldBase=summoner.maxHp;float room=x.foldBase*.6f-x.folded;if(room>0){float add=Mathf.Min(room,x.foldBase*.03f);x.folded+=add;summoner.hp+=add;summoner.maxHp+=add;}}
   SummonsFolded++;return true;
  }
  /// <summary>Summons suppressed by the endless entity cap this run (QA telemetry).</summary>
  public int SummonsFolded {get;private set;}
  public int LiveEnemies {get{int n=0;for(int i=0;i<enemies.Count;i++)if(enemies[i].alive)n++;return n;}}
 }
}
