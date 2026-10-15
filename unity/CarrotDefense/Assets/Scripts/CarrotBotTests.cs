#if UNITY_EDITOR
using System;
using System.Collections.Generic;
using System.Globalization;
using System.Text;
using UnityEngine;
namespace CarrotTD {
 // Reference bots for the difficulty bands (docs/carrot-defense/giant-update/difficulty.md). Every bot issues only the
 // page's commands and spends only coins the simulation paid it. The parameters are pre-registered: BotsVersion and the
 // profiles below were committed (and their hash recorded) before any game retune; changing them invalidates every band.
 //  R0  expert: the two campaign policies; seed 0 is the canonical policy, seeds 1..19 jitter every candidate score by
 //      up to +-1% and draw each decision gap from 0.25-0.5 s.
 //  R1  median player: decides every lognormal(median 4 s, sigma .5) of game time at 1x; picks among affordable options
 //      by geometric rank (top choice 50%), build or upgrade 50/50; answers uproot/tithe telegraphs with p .6 within
 //      0.3-1.5 s; merges from level 13 with p .5 per wave; reads the preview (next wave has air, an air route's tail is
 //      uncovered: buys an air tower with p .7). R1F is R1 with the preview counter at p 1 (invariant f).
 //  R2  novice: telegraphs p .2, top choice 30%, keeps 25% of coins idle, ignores the preview, never merges.
 //  RN  naive-static: the live playtest bot (scratchpad playtest/lib.mjs playBot) at 2x: best-coverage pads, a fixed
 //      kind rotation, lowest tier first, no merges, focus, clearing or early calls; seeds jitter its 1 s cadence.
 //  RS  Asuna stack exploit: six strong towers on the pads nearest her spawn, upgraded to IV, refocused every 3 s.
 //  R3  poor coverage: one Seed on the worst pad (PoorCoverage).
 public static partial class CarrotSimulationTests {
  // bots-v2 (polish): the page now briefs Asuna's counter (sell plants she has passed; replant ahead), so on L29 the humans act on
  // it: R1 sells each passed plant with p .6 per decision and R2 with p .25, and with the same p a decision builds only ahead of her.
  // RNH and RM-<kind> join as difficulty ceilings. Every other decision is bots-v1 unchanged.
  public const string BotsVersion="bots-v2";
  sealed class Human {public string id;public float telegraphP,airP,mergeP,focusP,reserve,q,stopP,relocateP;public bool preview;public int maxActions;}
  static readonly Human R1Profile=new Human{id="R1",telegraphP=.6f,airP=.7f,mergeP=.5f,focusP=.5f,reserve=0,q=.5f,stopP=.35f,relocateP=.6f,preview=true,maxActions=3};
  static readonly Human R1FullProfile=new Human{id="R1F",telegraphP=.6f,airP=1f,mergeP=.5f,focusP=.5f,reserve=0,q=.5f,stopP=.35f,relocateP=.6f,preview=true,maxActions=3};
  static readonly Human R2Profile=new Human{id="R2",telegraphP=.2f,airP=0,mergeP=0,focusP=.25f,reserve=.25f,q=.7f,stopP=.5f,relocateP=.25f,preview=false,maxActions=2};

  /// <summary>xorshift64 seeded from (level, seed, bot); identical on Mono and .NET (System.Random is not used).</summary>
  sealed class BotRng {
   ulong s;
   public BotRng(int a,int b,int c){s=0x9E3779B97F4A7C15UL^((ulong)(uint)a*0xBF58476D1CE4E5B9UL)^((ulong)(uint)b*0x94D049BB133111EBUL)^((ulong)(uint)c*0xD6E8FEB86659FD93UL);if(s==0)s=1;for(int i=0;i<4;i++)Next();}
   public ulong Next(){s^=s<<13;s^=s>>7;s^=s<<17;return s;}
   public double Unit(){return (Next()>>11)*(1.0/9007199254740992.0);}
   public int Int(int n){return n<=1?0:(int)(Unit()*n);}
   public double Normal(){double u1=Math.Max(1e-12,Unit()),u2=Unit();return Math.Sqrt(-2*Math.Log(u1))*Math.Cos(2*Math.PI*u2);}
  }
  static int BotCode(string id){int h=17;foreach(char c in id)h=h*31+c;return h;}

  public sealed class BotRun {
   public string bot;public int level,seed,policy,health,lowest,wave,waves,idle,earned,towers,supers,decisions,answered,kills,leaks,bestChain;public bool won;public float seconds;public int[] hearts,bites;
   public string Json(){
    var sb=new StringBuilder(256);sb.Append("{\"bot\":\"").Append(bot).Append("\",\"step\":").Append(CarrotData.Pass2Step).Append(",\"level\":").Append(level).Append(",\"seed\":").Append(seed).Append(",\"policy\":").Append(policy).Append(",\"won\":").Append(won?"true":"false")
     .Append(",\"health\":").Append(health).Append(",\"lowest\":").Append(lowest).Append(",\"wave\":").Append(wave).Append(",\"waves\":").Append(waves).Append(",\"seconds\":").Append(seconds.ToString("F1",CultureInfo.InvariantCulture))
     .Append(",\"idle\":").Append(idle).Append(",\"earned\":").Append(earned).Append(",\"towers\":").Append(towers).Append(",\"supers\":").Append(supers).Append(",\"decisions\":").Append(decisions).Append(",\"answered\":").Append(answered)
     .Append(",\"kills\":").Append(kills).Append(",\"leaks\":").Append(leaks).Append(",\"bestChain\":").Append(bestChain).Append(",\"hearts\":[");
    for(int i=0;i<hearts.Length;i++){if(i>0)sb.Append(',');sb.Append(hearts[i]);}sb.Append("],\"bites\":[");for(int i=0;i<bites.Length;i++){if(i>0)sb.Append(',');sb.Append(bites[i]);}sb.Append("]}");return sb.ToString();
   }
  }
  static BotRun Collect(CarrotGame g,string bot,int seed,int policy,int lowest){
   var r=new BotRun{bot=bot,level=g.level.id,seed=seed,policy=policy,won=g.phase=="won",health=g.health,lowest=lowest,wave=g.wave,waves=g.level.waves,seconds=g.elapsed,idle=g.coins,earned=g.TotalEarned-g.level.startingGold,towers=g.towers.Count,kills=g.Kills,leaks=g.Leaks,bestChain=g.BestChain,hearts=new int[g.level.waves],bites=new int[g.level.waves]};
   foreach(var t in g.towers)if(t.tier==5)r.supers++;
   for(int w=1;w<=g.level.waves;w++){r.hearts[w-1]=g.WaveHeartsLost(w);r.bites[w-1]=g.WaveLeakCount(w);}
   return r;
  }

  // ---- R0: the campaign policies with seed variants.
  static BotRun RunExpert(int level,int policy,int seed){
   var noise=seed==0?null:new BotRng(level,seed,BotCode("R0")+policy);
   var r=level==29?RunPrismCampaign(policy,noise):RunCampaign(level,policy,noise);
   r.run.bot="R0";r.run.seed=seed;r.run.policy=policy;return r.run;
  }

  // ---- R1 / R2: humans.
  struct Cand {public bool up;public int id,pad;public string kind;public float score;public int cost;}
  static readonly List<Cand> upCands=new List<Cand>(),buildCands=new List<Cand>();
  static int CompareCand(Cand a,Cand b){int c=b.score.CompareTo(a.score);if(c==0)c=a.pad.CompareTo(b.pad);if(c==0)c=a.id.CompareTo(b.id);if(c==0)c=string.CompareOrdinal(a.kind,b.kind);return c;}
  static readonly Comparison<Cand> CandOrder=CompareCand;
  sealed class HumanState {public int lastMergeWave=-1,lastAirWave=-1,airWanted=-1,answered;}
  static BotRun RunHuman(int level,int seed,Human h){
   var rng=new BotRng(level,seed,BotCode(h.id));var g=New(level);int strategy=rng.Int(2);var st=new HumanState();
   var pending=new List<KeyValuePair<float,int>>();
   g.Effect+=v=>{
    if(v.type!="telegraph"&&v.type!="telegraphTarget")return;
    if(v.kind=="uproot"&&v.target>0){if(rng.Unit()<h.telegraphP){pending.Add(new KeyValuePair<float,int>(g.elapsed+.3f+(float)rng.Unit()*1.2f,v.target));}}
    else if(v.type=="telegraph"&&(v.kind=="tithe"||v.kind=="coinLeech")){if(rng.Unit()<h.telegraphP)pending.Add(new KeyValuePair<float,int>(g.elapsed+.3f+(float)rng.Unit()*1.2f,-1));}
   };
   HumanDecide(g,h,rng,strategy,st);HumanDecide(g,h,rng,strategy,st);
   g.Command("{\"type\":\"start\"}");int lowest=10,decisions=0;float next=g.elapsed+HumanGap(rng);
   while(g.phase=="playing"&&g.elapsed<1500){
    g.StepSimulation(.25f);lowest=Mathf.Min(lowest,g.health);if(g.phase!="playing")break;
    for(int i=pending.Count-1;i>=0;i--)if(pending[i].Key<=g.elapsed){int id=pending[i].Value;pending.RemoveAt(i);
     if(id>0){var t=g.towers.Find(x=>x.id==id);if(t!=null){g.Select("tower",id);g.Command("{\"type\":\"sell\"}");st.answered++;}}
     else{HumanSpend(g,h,rng,strategy,h.maxActions);st.answered++;}}
    if(g.elapsed>=next){HumanDecide(g,h,rng,strategy,st);decisions++;next=g.elapsed+HumanGap(rng);}
    Check(g.coins>=0,"human bots never spend unearned coins");
   }
   var r=Collect(g,h.id,seed,strategy,lowest);r.decisions=decisions;r.answered=st.answered;Done(g);return r;
  }
  static float HumanGap(BotRng rng){return Mathf.Clamp((float)(4*Math.Exp(.5*rng.Normal())),1,15);}
  static void HumanDecide(CarrotGame g,Human h,BotRng rng,int strategy,HumanState st){
   int level=g.level.id;
   if(h.mergeP>0&&level>=13&&g.wave!=st.lastMergeWave&&MergePairExists(g)){st.lastMergeWave=g.wave;if(rng.Unit()<h.mergeP)MergeBest(g);}
   if(h.preview){int nw=g.wave+1;
    if(nw<=g.level.waves&&nw!=st.lastAirWave){var routes=AirRoutes(g,nw);bool uncovered=false;foreach(int r in routes)if(!TailCovered(g,r))uncovered=true;
     if(uncovered){st.lastAirWave=nw;if(rng.Unit()<h.airP)st.airWanted=nw;}}
    if(st.airWanted>0&&(st.airWanted==g.wave+1||st.airWanted==g.wave)){if(BuyAirCounter(g,AirRoutes(g,st.airWanted),g.coins*(1-h.reserve)))st.airWanted=-1;}else st.airWanted=-1;
   }
   if(level==29&&h.relocateP>0)foreach(var t in g.towers.ToArray())if(g.PrismPassed(t)&&rng.Unit()<h.relocateP){g.Select("tower",t.id);g.Command("{\"type\":\"sell\"}");}
   HumanSpend(g,h,rng,strategy,h.maxActions);
   if(rng.Unit()<h.focusP)Focus(g);
  }
  static void HumanSpend(CarrotGame g,Human h,BotRng rng,int strategy,int max){
   for(int actions=0;actions<max;actions++){if(!HumanAct(g,h,rng,strategy,g.coins*(1-h.reserve)))break;if(rng.Unit()<h.stopP)break;}
  }
  static bool HumanAct(CarrotGame g,Human h,BotRng rng,int strategy,float budget){
   upCands.Clear();buildCands.Clear();int level=g.level.id;int count=g.towers.Count;
   foreach(var t in g.towers)if(t.tier<4){var d=CarrotData.Tower(t.kind);int cost=d.cost[t.tier];if(cost>budget)continue;
    float score=(Power(d,t.tier)-Power(d,t.tier-1))*Preference(d.id,strategy,level)*Coverage(g,t.position,d.range[t.tier])/cost*(count<5?.75f:1.1f);if(score>0)upCands.Add(new Cand{up=true,id=t.id,pad=t.pad,kind=t.kind,score=score,cost=cost});}
   bool control=false,aura=false,cleanse=false;foreach(var t in g.towers){if(t.kind=="frost"||t.kind=="gravity"||t.kind=="book"||t.kind=="clockflower"||t.kind=="mushroom")control=true;if(t.kind=="blossom"||t.kind=="clockflower")aura=true;if(t.kind=="lotus")cleanse=true;}
   float asunaX=float.NaN;if(level==29&&h.relocateP>0&&rng.Unit()<h.relocateP){var asuna=g.enemies.Find(e=>e.alive&&e.boss=="asuna"&&!e.clone);if(asuna!=null)asunaX=asuna.position.x;}
   for(int p=0;p<g.level.pads.Length;p++){if(PadTaken(g,p))continue;Vector3 at=g.level.pads[p];
    // L29 (bots-v2): only ahead of Asuna, the nearer stretch first.
    float ahead=1;if(!float.IsNaN(asunaX)){if(at.x<asunaX+.5f)continue;ahead=1+Mathf.Max(0,1-(at.x-asunaX)/10f);}
    foreach(var d in CarrotData.Towers){if(d.unlock>level||d.cost[0]>budget)continue;
     float overlap=0;foreach(var t in g.towers)if(Vector3.Distance(t.position,at)<3.2f)overlap+=.16f;
     float score=Power(d,0)*Preference(d.id,strategy,level)*Coverage(g,at,d.range[0])/d.cost[0]/(1+overlap+count*.05f);
     int family=0;foreach(var t in g.towers)if(t.kind==d.id)family++;score/=1+family*.55f;
     if(count>=3&&!control&&(d.id=="frost"||d.id=="clockflower"||d.id=="mushroom"))score*=1.8f;
     if(count>=5&&!aura&&(d.id=="blossom"||d.id=="clockflower"))score*=1.65f;
     if(count>=5&&d.id=="lotus"&&!cleanse)score*=1.65f;
     if(d.id=="frost"&&count<2)score*=.2f;
     score*=ahead;
     if(score>0)buildCands.Add(new Cand{up=false,id=0,pad=p,kind=d.id,score=score,cost=d.cost[0]});}}
   bool upgradeFirst=count>=2&&rng.Unit()<.5;var list=upgradeFirst?(upCands.Count>0?upCands:buildCands):(buildCands.Count>0?buildCands:upCands);
   if(list.Count==0)return false;list.Sort(CandOrder);
   int k=0;while(k<list.Count-1&&rng.Unit()<h.q)k++;var c=list[k];
   if(c.up){g.Select("tower",c.id);g.Command("{\"type\":\"upgrade\"}");}else{g.Select("pad",c.pad);g.Command("{\"type\":\"buy\",\"kind\":\""+c.kind+"\"}");}
   return true;
  }
  static bool PadTaken(CarrotGame g,int p){foreach(var t in g.towers)if(t.pad==p)return true;foreach(var b in g.blockers)if(b.pad==p)return true;return false;}
  static bool MergePairExists(CarrotGame g){for(int i=0;i<g.towers.Count;i++)for(int j=i+1;j<g.towers.Count;j++)if(g.towers[i].tier==4&&g.towers[j].tier==4&&g.towers[i].kind==g.towers[j].kind)return true;return false;}
  static readonly Dictionary<string,List<Vector3>> tails=new Dictionary<string,List<Vector3>>();
  static List<Vector3> Tail(CarrotGame g,int route){string key=g.level.id+"/"+route;List<Vector3> list;if(tails.TryGetValue(key,out list))return list;list=new List<Vector3>();var r=g.level.routes[route];float len=CarrotData.RouteLength(r);for(float d=len*.7f;d<=len;d+=.5f){Vector3 dir;list.Add(CarrotData.RoutePoint(r,d,out dir));}lock(tails)tails[key]=list;return list;}
  static List<int> AirRoutes(CarrotGame g,int w){var routes=new List<int>();var plan=g.WavePlan(w);if(plan==null)return routes;foreach(var p in plan)if(p.kind!="boss"&&CarrotData.Traits(p.kind).air&&!routes.Contains(p.route))routes.Add(p.route);return routes;}
  static bool TailCovered(CarrotGame g,int route){foreach(var t in g.towers){var d=CarrotData.Tower(t.kind);if(!d.air)continue;float range=d.range[t.tier-1];foreach(var p in Tail(g,route))if(Vector3.Distance(new Vector3(t.position.x,0,t.position.z),new Vector3(p.x,0,p.z))<=range)return true;}return false;}
  static bool BuyAirCounter(CarrotGame g,List<int> routes,float budget){
   int bestPad=-1;string bestKind=null;float best=0;
   for(int p=0;p<g.level.pads.Length;p++){if(PadTaken(g,p))continue;Vector3 at=g.level.pads[p];
    foreach(var d in CarrotData.Towers){if(!d.air||d.unlock>g.level.id||d.cost[0]>budget)continue;float cover=0;
     foreach(int r in routes){if(TailCovered(g,r))continue;var tail=Tail(g,r);int n=0;foreach(var q in tail)if(Vector3.Distance(at,q)<=d.range[0])n++;cover+=n/(float)Mathf.Max(1,tail.Count);}
     float score=cover*Power(d,0)/d.cost[0];if(score>best){best=score;bestPad=p;bestKind=d.id;}}}
   if(bestPad<0)return false;g.Select("pad",bestPad);g.Command("{\"type\":\"buy\",\"kind\":\""+bestKind+"\"}");return true;
  }

  // ---- RN: the live playtest bot.
  static readonly string[] NaiveMix={"seed","frost","mortar","starfruit","prism","storm","thunder","book"};
  sealed class NaiveTower {public int pad,id,tier;public string kind;}
  static BotRun RunNaive(int level,int seed){var mix=new List<string>();foreach(var k in NaiveMix)if(CarrotData.IsChallenge(level)||CarrotData.Tower(k).unlock<=level)mix.Add(k);return RunNaiveMix(level,seed,mix,"RN",false);}
  // RNH: RN's rotation at R1's human cadence (lognormal, median 4 s). RM-<kind>: the same spender restricted to one tower family
  // (the dominant-strategy gate). Both are upper limits on difficulty: a naive or one-family plan must not clear the campaign.
  static BotRun RunNaiveMix(int level,int seed,List<string> mix,string bot,bool human){
   var g=New(level);var rng=new BotRng(level,seed,BotCode(bot));
   // Pads by route samples (0.25 u along every segment of every route) within 3.2 u, best first; scenery pads stay "blocked".
   var score=new float[g.level.pads.Length];var order=new List<int>();var blocked=new HashSet<int>();foreach(var b in g.level.blockers)blocked.Add(b.pad);
   for(int p=0;p<g.level.pads.Length;p++){var at=g.level.pads[p];int n=0;foreach(var lane in g.level.routes)for(int i=0;i+1<lane.Length;i++){float ax=lane[i].x,az=lane[i].z,bx=lane[i+1].x,bz=lane[i+1].z;float len=Mathf.Sqrt((bx-ax)*(bx-ax)+(bz-az)*(bz-az));int m=Mathf.Max(1,Mathf.RoundToInt(len/.25f));for(int k=0;k<m;k++){float x=ax+(bx-ax)*k/m,z=az+(bz-az)*k/m;if(Mathf.Sqrt((x-at.x)*(x-at.x)+(z-at.z)*(z-at.z))<=3.2f)n++;}}score[p]=n*.25f;order.Add(p);}
   order.Sort((a,b)=>{int c=score[b].CompareTo(score[a]);return c!=0?c:a.CompareTo(b);});
   var mine=new List<NaiveTower>();int builds=0;
   NaiveSpend(g,mix,order,score,blocked,mine,ref builds);g.Command("{\"type\":\"start\"}");int lowest=10;
   while(g.phase=="playing"&&g.elapsed<1500){
    float step=human?HumanGap(rng):seed==0?1f:.75f+(float)rng.Unit()*.5f;g.StepSimulation(step);lowest=Mathf.Min(lowest,g.health);if(g.phase!="playing")break;
    mine.RemoveAll(m=>!g.towers.Exists(t=>t.id==m.id));foreach(var m in mine){var t=g.towers.Find(x=>x.id==m.id);m.tier=t.tier;}
    NaiveSpend(g,mix,order,score,blocked,mine,ref builds);
   }
   var r=Collect(g,bot,seed,0,lowest);Done(g);return r;
  }
  static void NaiveSpend(CarrotGame g,List<string> mix,List<int> order,float[] score,HashSet<int> blocked,List<NaiveTower> mine,ref int builds){
   if(g.phase!="ready"&&g.phase!="playing")return;
   for(int guard=0;guard<12;guard++){
    var open=new List<int>();foreach(int p in order)if(!blocked.Contains(p)&&!mine.Exists(m=>m.pad==p)&&score[p]>0)open.Add(p);
    int n=mine.Count;string nextKind=mix[n%mix.Count];int buildCost=CarrotData.Tower(nextKind).cost[0];
    var ups=new List<NaiveTower>();foreach(var m in mine)if(m.tier<4)ups.Add(m);
    ups.Sort((a,b)=>{int c=a.tier.CompareTo(b.tier);if(c==0)c=score[b.pad].CompareTo(score[a.pad]);return c!=0?c:mine.IndexOf(a).CompareTo(mine.IndexOf(b));});
    bool want=n<3||(open.Count>0&&(ups.Count==0||n<4+builds/2));int avail=g.coins;
    if(want&&open.Count>0&&avail>=buildCost){if(!NaiveBuy(g,open[0],nextKind,mine))break;builds++;continue;}
    var u=ups.Count>0?ups[0]:null;
    if(u!=null&&avail>=CarrotData.Tower(u.kind).cost[u.tier]){int before=g.coins;g.Select("pad",u.pad);g.Command("{\"type\":\"upgrade\"}");if(g.coins>=before)break;u.tier++;continue;}
    if(!want&&open.Count>0&&avail>=buildCost&&u==null){if(!NaiveBuy(g,open[0],nextKind,mine))break;builds++;continue;}
    break;
   }
   g.Select("",-1);
  }
  static bool NaiveBuy(CarrotGame g,int pad,string kind,List<NaiveTower> mine){g.Select("pad",pad);g.Command("{\"type\":\"buy\",\"kind\":\""+kind+"\"}");var t=g.towers.Find(x=>x.pad==pad);if(t==null||t.kind!=kind)return false;mine.Add(new NaiveTower{pad=pad,id=t.id,tier=1,kind=kind});return true;}

  // ---- RS: the Asuna stack.
  static readonly string[] StackPool={"prism","thunder","moonflower","bamboo","dragonfruit","chili","magnet"};
  static BotRun RunStack(int seed){
   var g=New(29);var rng=new BotRng(29,seed,BotCode("RS"));var kinds=new List<string>();
   if(seed==0)kinds.AddRange(new[]{"prism","thunder","moonflower","prism","thunder","moonflower"});else for(int i=0;i<6;i++)kinds.Add(StackPool[rng.Int(StackPool.Length)]);
   Vector3 start=g.level.routes[0][0];var pads=new List<int>();for(int p=0;p<g.level.pads.Length;p++)pads.Add(p);
   pads.Sort((a,b)=>{int c=Vector3.Distance(g.level.pads[a],start).CompareTo(Vector3.Distance(g.level.pads[b],start));return c!=0?c:a.CompareTo(b);});
   StackSpend(g,kinds,pads);g.Command("{\"type\":\"start\"}");int lowest=10;float refocus=0;
   while(g.phase=="playing"&&g.elapsed<900){g.StepSimulation(.5f);lowest=Mathf.Min(lowest,g.health);StackSpend(g,kinds,pads);
    if(g.elapsed>=refocus){refocus=g.elapsed+3;var boss=g.enemies.Find(e=>e.alive&&e.boss=="asuna");if(boss!=null)g.Select("enemy",boss.id);}}
   var r=Collect(g,"RS",seed,0,lowest);Done(g);return r;
  }
  static void StackSpend(CarrotGame g,List<string> kinds,List<int> pads){
   int focus=g.selectionType=="enemy"?g.selectionId:-1;bool changed=false;
   for(int i=0;i<6;i++){int pad=pads[i];var t=g.towers.Find(x=>x.pad==pad);if(t==null){var d=CarrotData.Tower(kinds[i]);if(g.coins>=d.cost[0]){g.Select("pad",pad);g.Command("{\"type\":\"buy\",\"kind\":\""+kinds[i]+"\"}");changed=true;}}}
   for(int tier=1;tier<4;tier++)for(int i=0;i<6;i++){var t=g.towers.Find(x=>x.pad==pads[i]);if(t==null||t.tier!=tier)continue;var d=CarrotData.Tower(t.kind);if(g.coins>=d.cost[t.tier]){g.Select("tower",t.id);g.Command("{\"type\":\"upgrade\"}");changed=true;}}
   if(changed&&focus>0)g.Select("enemy",focus);
  }

  // ---- Job runner: one JSON line per run. Spec "BOT:levels:seeds", e.g. "R1:1-29:0-199", "R0p1:1-28:0-19", "RS:29:0-99".
  public static void BandJobs(string[] args){
   policyMerges=true;
   foreach(var a in args){if(a.StartsWith("step=",StringComparison.Ordinal)){CarrotData.Pass2Step=int.Parse(a.Substring(5));continue;}
    // mute=<cast>: that boss cast keeps its telegraph but changes nothing (invariant d).
    if(a.StartsWith("mute=",StringComparison.Ordinal)){CarrotGame.MutedCast=a.Substring(5);continue;}
    // mode=veteran: every level of this job loads in Veteran (the shipping gate for the mode).
    if(a.StartsWith("mode=",StringComparison.Ordinal)){newMode=a.Substring(5);CarrotGame.AllowVeteranForTests=newMode=="veteran";continue;}
    // dial=L:v[,L:v]: a Pressure-dial override for this job (the dial fit), never used by the shipped game.
    if(a.StartsWith("dial=",StringComparison.Ordinal)){foreach(var pair in a.Substring(5).Split(',')){var kv=pair.Split(':');CarrotData.Pressure[int.Parse(kv[0])-1]=float.Parse(kv[1],CultureInfo.InvariantCulture);}continue;}
    var parts=a.Split(':');string bot=parts[0];var levels=Range(parts[1]);var seeds=Range(parts[2]);
    foreach(int level in levels)foreach(int seed in seeds){BotRun r;
     switch(bot){
      case "R0p0":r=RunExpert(level,0,seed);break;case "R0p1":if(level==29)continue;r=RunExpert(level,1,seed);break;
      case "R1":r=RunHuman(level,seed,R1Profile);break;case "R1F":r=RunHuman(level,seed,R1FullProfile);break;case "R2":r=RunHuman(level,seed,R2Profile);break;
      case "RN":r=RunNaive(level,seed);break;case "RS":if(level!=29)continue;r=RunStack(seed);break;
      case "R3":{var p=PoorRun(level);r=p;break;}
      case "RNH":{if(level>28)continue;var mix=new List<string>();foreach(var k in NaiveMix)if(CarrotData.IsChallenge(level)||CarrotData.Tower(k).unlock<=level)mix.Add(k);r=RunNaiveMix(level,seed,mix,"RNH",true);break;}
      default:
       if(bot.StartsWith("RM-",StringComparison.Ordinal)){string kind=bot.Substring(3);if(CarrotData.Tower(kind)==null)throw new ArgumentException("unknown family "+kind);if(level>28||(!CarrotData.IsChallenge(level)&&CarrotData.Tower(kind).unlock>level))continue;r=RunNaiveMix(level,seed,new List<string>{kind},bot,true);break;}
       throw new ArgumentException("unknown bot "+bot);
     }
     Debug.Log("CARROT_BAND "+r.Json());}
   }
  }
  static List<int> Range(string spec){var list=new List<int>();foreach(var part in spec.Split(',')){var b=part.Split('-');int a=int.Parse(b[0]),z=b.Length>1?int.Parse(b[1]):a;for(int i=a;i<=z;i++)list.Add(i);}return list;}
  static BotRun PoorRun(int level){var g=New(level);int poor=-1;float score=float.MaxValue;
   for(int pad=0;pad<g.level.pads.Length;pad++)if(!g.blockers.Exists(b=>b.pad==pad)){float value=Coverage(g,g.level.pads[pad],3);if(value<score){score=value;poor=pad;}}
   g.Select("pad",poor);g.Command("{\"type\":\"buy\",\"kind\":\"seed\"}");g.Command("{\"type\":\"start\"}");int lowest=10;
   for(float time=0;time<1200&&g.phase=="playing";time+=.25f){if(g.towers.Count>0){g.Select("tower",g.towers[0].id);g.Command("{\"type\":\"upgrade\"}");}g.StepSimulation(.25f);lowest=Mathf.Min(lowest,g.health);}
   var r=Collect(g,"R3",0,0,lowest);Done(g);return r;}

  /// <summary>Unity fallback (directional only): 8 R1 and 4 R2 seeds per level plus the gates' bots.</summary>
  public static void Bands(){BandJobs(new[]{"R0p0:1-29:0-1","R0p1:1-28:0-1","R1:1-29:0-7","R2:1-29:0-3","RN:1-29:0","RS:29:0-3"});Debug.Log("CARROT_BANDS_DONE directional (Unity fallback; not a certification)");}

  /// <summary>The authoritative gates that fit in a Unity run: RN wins L1-L8 and leaks late, RS loses, a 4-seed R1 smoke.</summary>
  static void ReferenceGates(){
   int leakWaves=0,lateWaves=0,early=0,total=0;
   for(int level=1;level<=24;level++){var r=RunNaive(level,0);Debug.Log("CARROT_GATE RN level="+level+" won="+r.won+" health="+r.health+" wave="+r.wave+" idle="+r.idle);
    if(level<=8&&!r.won)failures.Add("RN must win level "+level+" (lost on wave "+r.wave+")");
    for(int w=0;w<r.wave&&w<r.hearts.Length;w++){total+=r.hearts[w];if(w<2)early+=r.hearts[w];if(level>=4&&w>=2){lateWaves++;if(r.bites[w]>0)leakWaves++;}}}
   Debug.Log("CARROT_GATE RN lateLeakShare="+(lateWaves>0?leakWaves/(float)lateWaves:0).ToString("F3")+" earlyHeartShare="+(total>0?early/(float)total:0).ToString("F3"));
   int stackWins=0;for(int seed=0;seed<4;seed++){var r=RunStack(seed);if(r.won)stackWins++;Debug.Log("CARROT_GATE RS seed="+seed+" won="+r.won+" health="+r.health);}
   if(stackWins>0)failures.Add("the Asuna stack exploit won "+stackWins+" of 4 seeds");
   foreach(int level in new[]{1,8,16,24})for(int seed=0;seed<4;seed++){var r=RunHuman(level,seed,R1Profile);Check(r.decisions>10,"R1 smoke makes decisions on "+level);Debug.Log("CARROT_GATE R1 level="+level+" seed="+seed+" won="+r.won+" health="+r.health+" wave="+r.wave);}
  }
 }
}
#endif
