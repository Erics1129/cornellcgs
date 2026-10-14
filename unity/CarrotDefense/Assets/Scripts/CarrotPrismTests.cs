#if UNITY_EDITOR
using System;
using System.Collections.Generic;
using UnityEngine;
namespace CarrotTD {
 public static partial class CarrotSimulationTests {
  public static void PrismBoundaryRegression(){
   var g=Arena(29);var boss=g.TestSpawn("boss",0,2,true);boss.hp=boss.maxHp*.4f;g.StepSimulation(.1f);
   Vector3 warned=Vector3.zero,arrival=Vector3.zero;int warnings=0,dashes=0;
   g.Effect+=v=>{if(v.id!=boss.id||v.kind!="prismDash")return;if(v.type=="telegraph"){warned=v.to;warnings++;}if(v.type=="abilityTarget"){arrival=v.to;dashes++;}};
   g.Command("{\"type\":\"debugCast\",\"id\":"+boss.id+",\"kind\":\"prismDash\"}");
   g.TestDamage(boss.id,boss.maxHp*.11f);g.StepSimulation(2.4f);
   Check(boss.phase==3&&warnings==1&&dashes==1,"Asuna crosses into phase 3 during one warned dash");
   Check((warned-arrival).sqrMagnitude<.00001f,"dash arrival stays at its warned endpoint across a phase transition");Done(g);
   g=New(29);int entries=0,casts=0;float enteredAt=-1;g.Effect+=v=>{if(v.type=="bossEnter"&&v.kind=="asuna"){entries++;enteredAt=g.elapsed;}if(v.type=="telegraph"&&v.kind=="prismLances")casts++;};
   Check(entries==0,"loading the Asuna map does not emit a boss music onset");g.Command("{\"type\":\"start\"}");g.StepSimulation(.5f);Check(entries==0,"entry waits for actual boss spawn");g.StepSimulation(.2f);
   Check(entries==1&&enteredAt>=.65f&&enteredAt<.71f,"one Asuna music onset is emitted at the actual opening spawn");boss=g.enemies.Find(e=>e.boss=="asuna");g.TestDamage(boss.id,boss.maxHp*.71f);g.StepSimulation(4);
   Check(boss.phase==3&&entries==1&&casts==1,"phase changes retain the original score onset and the normal opening cast");Done(g);
   Debug.Log("PRISM_BOUNDARY_REGRESSION_OK");
  }
  public static void PrismEncounter(){
   var def=CarrotData.Level(29);Check(def!=null&&def.biome=="prism"&&def.boss=="asuna"&&CarrotData.ChallengeDifficulty(29)=="insane","Prism is a distinct Insane challenge");
   Check(def.routes.Length==1&&def.routes[0].Length==2&&CarrotData.RouteLength(def.routes[0])==40,"one genuinely long straight route");
   var g=Arena(29);QuietTowers(g);var boss=g.TestSpawn("boss",0,0,true);var seen=new HashSet<string>();var warnings=new Dictionary<string,float>();var targets=new HashSet<string>();float lastDash=-100;int stopped=0,moving=0,cohorts=0,maxCohort=0;bool shielded=false,stunned=false;
   g.Effect+=v=>{
    if(v.id!=boss.id)return;
    if(v.type=="telegraph"){warnings[v.kind]=g.elapsed;if(v.target>0)targets.Add(v.kind+":"+v.target);}
    if(v.type=="telegraphTarget")targets.Add(v.kind+":"+v.target);
    if(v.type=="ability"&&Array.IndexOf(new[]{"prismDash","prismLances","prismaticAegis","spectrumRain","mirrorRush","prismOverdrive"},v.kind)>=0){Check(warnings.ContainsKey(v.kind)&&g.elapsed-warnings[v.kind]>=1.2f,"Asuna cast follows a readable warning: "+v.kind);seen.Add(v.kind);if(v.kind=="prismaticAegis")shielded=boss.shield>0;if(v.kind=="mirrorRush")Check(g.PendingSummons<=2,"mirror rush reserves at most two decoys");}
    if(v.type=="abilityTarget"&&v.kind=="prismDash"){Check(g.elapsed-lastDash>=10,"dashes remain spaced apart");lastDash=g.elapsed;Check(v.value>0&&v.value<=1.6f&&v.to.x>v.position.x&&Mathf.Abs(v.to.z-v.position.z)<.001f,"dash is a short forward displacement on the lane");Check(Mathf.Abs(v.duration-.45f)<.001f,"dash motion and effect share real duration");}
    if(v.type=="abilityTarget"&&(v.kind=="prismLances"||v.kind=="spectrumRain")){Check(targets.Contains(v.kind+":"+v.target),"each actual spear/rain hit was individually warned");var tower=g.towers.Find(t=>t.id==v.target);if(tower!=null&&tower.stunnedFor>0)stunned=true;}
    if(v.type=="ability"&&v.kind=="prismReinforce"){cohorts++;maxCohort=Mathf.Max(maxCohort,(int)v.value);}
   };
   for(int i=0;i<1700&&g.phase=="playing";i++){
    float before=boss.distance;g.StepSimulation(.1f);Check(boss.distance>=before&&boss.distance-before<=.37f,"boss never walks backwards or teleports an entire lane");if(boss.distance==before)stopped++;else moving++;
    Check(g.enemies.FindAll(e=>e.alive&&e.summoned).Count+g.PendingSummons<=22,"global summon cap includes pending creatures");
    foreach(var add in g.enemies.ToArray())if(add.alive&&add.id!=boss.id){if(add.clone)Check(add.reward==0&&add.maxHp<boss.maxHp*.1f,"mirror decoys have lower HP and no bounty");g.TestDamage(add.id,1000000);}
   }
   Check(seen.Count==6&&shielded&&stunned,"all six authored abilities have real consequences");Check(stopped>moving*10,"Asuna rests between brief dashes");Check(cohorts>=10&&maxCohort>=3,"cohorts become denser with elapsed encounter time");
   float distance=boss.distance,time=g.elapsed;g.paused=true;g.StepSimulation(10);Check(g.elapsed==time&&boss.distance==distance,"pause freezes dashes and summons");g.paused=false;Done(g);
   {g=Arena(29);boss=g.TestSpawn("boss",0,2,true);var add=g.TestSpawn("nibble",0,3);Still(add);g.TestDamage(boss.id,1000000);g.StepSimulation(1.5f);Check(g.phase=="playing"&&g.progress==.99f&&g.PendingSummons==0,"boss defeat stops reinforcement reservations but waits for survivors");g.TestDamage(add.id,1000000);g.StepSimulation(.1f);Check(g.phase=="won"&&g.progress==1,"Asuna encounter finishes after the boss and survivors resolve");Done(g);}
   {g=Arena(29);boss=g.TestSpawn("boss",0,2,true);g.Command("{\"type\":\"debugCast\",\"id\":"+boss.id+",\"kind\":\"mirrorRush\"}");g.StepSimulation(1.85f);Check(g.PendingSummons==2,"queued mirror promise exists before boss defeat");g.TestDamage(boss.id,1000000);g.StepSimulation(.2f);Check(g.PendingSummons==0&&g.phase=="won","boss death cancels its queued decoys without orphaning victory");Done(g);}
   {g=Arena(29);boss=g.TestSpawn("boss",0,0,true);while(g.phase=="playing"&&g.elapsed<650){g.StepSimulation(.1f);foreach(var add in g.enemies.ToArray())if(add.alive&&add.id!=boss.id)g.TestDamage(add.id,1000000);}Check(g.phase=="lost"&&g.health==0&&g.elapsed>300&&g.elapsed<650,"ignored boss has a slow but finite route deadline");Debug.Log("PRISM_ROUTE_DEADLINE seconds="+g.elapsed.ToString("F1"));Done(g);}
   Debug.Log("PRISM_ENCOUNTER_OK");
  }
  public static void PrismTune(){policyMerges=true;foreach(int level in new[]{29,8,12,20,25,26,27,28})for(int strategy=0;strategy<2;strategy++){var r=RunCampaign(level,strategy);Debug.Log("PRISM_BALANCE level="+level+" policy="+strategy+" result="+r.phase+" hearts="+r.health+" seconds="+r.seconds.ToString("F1")+" earned="+r.earned+" bossHp="+r.bossHp.ToString("F1")+" bossGap="+r.bossGap.ToString("F1")+" roster="+r.roster);}}
  public static void PrismBalance(){
   for(int strategy=0;strategy<1;strategy++){
    var r=RunPrismCampaign(strategy);Check(r.phase=="won"&&r.health>0&&r.seconds<360,"earned-coin Asuna strategy completes within the encounter par: "+strategy);
    Check(r.earned>4500&&r.earned<6000,"reduced summon income stays bounded for Asuna strategy: "+strategy);
    Debug.Log("PRISM_BALANCED policy="+strategy+" hearts="+r.health+" seconds="+r.seconds.ToString("F1")+" earned="+r.earned+" bossGap="+r.bossGap.ToString("F1")+" roster="+r.roster);
   }
   var g=New(29);var mix=new[]{"prism","thunder","moonflower","frost","lotus"};for(int i=0;i<30&&BuyPrism(g,mix);i++){}g.Command("{\"type\":\"start\"}");
   while(g.phase=="playing"&&g.elapsed<650)g.StepSimulation(.25f);
   Check(g.phase=="lost"&&g.health==0,"the same fully funded opening left stationary loses; long-lane relocation matters");Debug.Log("PRISM_STATIC_LOSS seconds="+g.elapsed.ToString("F1"));Done(g);
  }
  public static void PrismOnly(){for(int strategy=0;strategy<2;strategy++){var r=RunPrismCampaign(strategy);Debug.Log("PRISM_POLICY policy="+strategy+" result="+r.phase+" hearts="+r.health+" seconds="+r.seconds.ToString("F1")+" earned="+r.earned+" bossHp="+r.bossHp.ToString("F1")+" bossGap="+r.bossGap.ToString("F1")+" roster="+r.roster);}}
  static Result RunPrismCampaign(int strategy,BotRng noise=null){
   var g=New(29);int lowest=10,relocations=0;float bossGap=-1;
   string[] mix=strategy==0?new[]{"prism","thunder","moonflower","frost","lotus"}:new[]{"prism","chili","magnet","frost","lotus"};
   g.Effect+=v=>{if(v.type=="death"){var e=g.enemies.Find(x=>x.id==v.id);if(e!=null&&e.boss=="asuna")bossGap=e.routeLength-e.distance;}};
   for(int i=0;i<30&&BuyPrism(g,mix);i++){}g.Command("{\"type\":\"start\"}");
   while(g.phase=="playing"&&g.elapsed<650){
    var boss=g.enemies.Find(e=>e.alive&&e.boss=="asuna");
    var front=boss;if(boss==null){foreach(var e in g.enemies)if(e.alive&&(front==null||e.distance>front.distance))front=e;}
    if(front!=null){foreach(var tower in g.towers.ToArray())if(tower.position.x+CarrotData.Tower(tower.kind).range[tower.tier-1]<front.position.x-.5f){g.Select("tower",tower.id);g.Command("{\"type\":\"sell\"}");relocations++;}}
    for(int i=0;i<4&&BuyPrism(g,mix);i++){}if(boss!=null&&!g.enemies.Exists(e=>e.alive&&e.id!=boss.id&&!e.clone&&e.distance>boss.distance+7))g.Select("enemy",boss.id);else g.Select("",-1);g.StepSimulation(noise==null?.25f:.25f+(float)noise.Unit()*.25f);lowest=Mathf.Min(lowest,g.health);Check(g.coins>=0,"Asuna policy never spends unearned coins");
    if(Mathf.Repeat(g.elapsed,10)<.25f)ValidateSnapshot(g.LastSnapshot,"asuna campaign");
   }
   string roster="";foreach(var t in g.towers)roster+=t.kind+"/"+t.tier+"@"+t.pad+",";
   Debug.Log("PRISM_RELOCATIONS policy="+strategy+" count="+relocations+" coins="+g.coins);
   var r=new Result{phase=g.phase,health=g.health,lowest=lowest,wave=g.wave,towers=g.towers.Count,earned=g.TotalEarned,seconds=g.elapsed,bossHp=g.enemies.Find(e=>e.boss=="asuna")?.hp??0,bossGap=bossGap,roster=roster};r.run=Collect(g,"R0",0,strategy,lowest);Done(g);return r;
  }
  static bool BuyPrism(CarrotGame g,string[] mix){
   var boss=g.enemies.Find(e=>e.alive&&e.boss=="asuna");if(boss==null){foreach(var e in g.enemies)if(e.alive&&(boss==null||e.distance>boss.distance))boss=e;}float x=boss?.position.x??g.level.routes[0][0].x;
   foreach(string kind in mix)if(!g.towers.Exists(t=>t.kind==kind)){
    var def=CarrotData.Tower(kind);if(g.coins<def.cost[0])return false;int pad=-1;float best=float.MaxValue;
    for(int i=0;i<g.level.pads.Length;i++)if(!g.towers.Exists(t=>t.pad==i)&&!g.blockers.Exists(b=>b.pad==i)){
     var at=g.level.pads[i];float score=Mathf.Abs(at.x-(x+2))*.7f+Mathf.Abs(at.z)*2f;if(at.x<x)score+=10;if(score<best){pad=i;best=score;}}
    if(pad<0)return false;g.Select("pad",pad);g.Command("{\"type\":\"buy\",\"kind\":\""+kind+"\"}");return true;
   }
   // Damage grows before support. Every purchase/upgrade uses the same commands as the page.
   foreach(int targetTier in new[]{2,3,4})for(int i=0;i<mix.Length;i++){
    int cap=i<3?4:2;if(targetTier>cap)continue;var t=g.towers.Find(p=>p.kind==mix[i]);if(t==null||t.tier>=targetTier)continue;
    var d=CarrotData.Tower(t.kind);if(g.coins<d.cost[t.tier])return false;g.Select("tower",t.id);g.Command("{\"type\":\"upgrade\"}");return true;
   }
   return false;
  }
  public static void SummonRewardRegression(){
   var g=Arena(8);var boss=g.TestSpawn("boss",0,3,true);Still(boss);
   var ordinary=g.TestSpawn("nibble",0,2);int before=g.coins;
   g.TestDamage(ordinary.id,1000000);Check(g.coins==before+8,"ordinary kill retains its normal eight coins");
   g.Command("{\"type\":\"debugCast\",\"id\":"+boss.id+",\"kind\":\"summon\"}");g.StepSimulation(2);
   var summoned=g.enemies.Find(e=>e.alive&&e.summoned&&e.kind=="nibble");Check(summoned!=null,"real boss cast creates a living summon");
   before=g.coins;int earned=g.TotalEarned;g.TestDamage(summoned.id,1000000);
   Check(g.coins==before+2&&g.TotalEarned==earned+2,"real summoned nibble kill pays reduced bounty: expected 2, got "+(g.coins-before));
   g.TestDamage(summoned.id,1000000);Check(g.coins==before+2,"duplicate damage cannot pay a second bounty");Done(g);
   foreach(var row in new[]{new{kind="swarm",normal=4,pay=1},new{kind="moth",normal=11,pay=3},new{kind="shell",normal=15,pay=5},new{kind="portalSentinel",normal=85,pay=29},new{kind="fragment",normal=6,pay=2}}){
    g=Arena(28);boss=g.TestSpawn("boss",0,0,true);Still(boss);ordinary=g.TestSpawn(row.kind,0,2);before=g.coins;g.TestDamage(ordinary.id,1000000);Check(g.coins==before+row.normal,"normal bounty "+row.kind);
    summoned=g.TestSpawn(row.kind,0,2,false,true);before=g.coins;g.TestDamage(summoned.id,1000000);Check(g.coins==before+row.pay,"reduced summon bounty "+row.kind);g.TestDamage(summoned.id,1000000);Check(g.coins==before+row.pay,"no duplicate summon bounty "+row.kind);
    var clone=g.TestSpawn(row.kind,0,2,false,true,true);before=g.coins;g.TestDamage(clone.id,1000000);Check(g.coins==before,"decoy never pays "+row.kind);
    var leaked=g.TestSpawn(row.kind,0,CarrotData.RouteLength(g.level.routes[0]),false,true);before=g.coins;g.StepSimulation(.8f);Check(!leaked.alive&&g.coins==before,"leaked summon never pays "+row.kind);Done(g);
   }
   {g=Arena(26);boss=g.TestSpawn("boss",0,3,true);Still(boss);var fallen=g.TestSpawn("shell",0,2);g.TestDamage(fallen.id,1000000);g.Command("{\"type\":\"debugCast\",\"id\":"+boss.id+",\"kind\":\"raise\"}");g.StepSimulation(2);var raised=g.enemies.Find(e=>e.alive&&e.summoned&&e.kind=="shell");Check(raised!=null,"Raise Dead returns the killed shell");before=g.coins;g.TestDamage(raised.id,1000000);Check(g.coins==before,"already-paid grave resurrection gives no second reward");Done(g);}
   {g=Arena(24);var anchor=Durable(g);Still(anchor);var caller=g.TestSpawn("graveCaller",0,3);Still(caller);g.Command("{\"type\":\"debugCast\",\"id\":"+caller.id+",\"kind\":\"graveCall\"}");g.StepSimulation(2.4f);var adds=g.enemies.FindAll(e=>e.alive&&e.summoned);Check(adds.Count==3,"grave caller creates real timed summons");foreach(var add in adds)Still(add);g.TestDamage(caller.id,1000000);before=g.coins;g.StepSimulation(27);Check(adds.TrueForAll(e=>!e.alive)&&g.coins==before,"timed-out summons resolve without kill bounty");Done(g);}
   {g=Arena(24);var anchor=Durable(g);Still(anchor);var zombie=g.TestSpawn("tinyZombie",0,2);before=g.coins;g.TestDamage(zombie.id,1000000);Check(zombie.alive&&g.coins==before,"first rootling life pays no reward");g.TestDamage(zombie.id,1000000);Check(!zombie.alive&&g.coins==before+11,"rootling only pays after its final life");Done(g);}
   Debug.Log("SUMMON_REWARD_REGRESSION_OK");
  }
 }
}
#endif
