#if UNITY_EDITOR
using System;
using System.Collections.Generic;
using UnityEngine;
namespace CarrotTD {
 public static partial class CarrotSimulationTests {
  public static void RebirthRegression(){
   foreach(string power in new[]{"orchid","cactus"}){var g=Arena(27);var e=g.TestSpawn("boss",0,5,true);Still(e);g.elapsed=20;g.TestFire(power,1,e.id,e.position);e.hp=.01f;bool reborn=false,interrupted=false;g.Effect+=v=>{if(v.id!=e.id)return;if(v.type=="telegraph"&&v.kind=="reincarnate")reborn=true;else if(reborn&&v.type=="telegraph")interrupted=true;};g.StepSimulation(.6f);Check(reborn&&e.stage==2&&e.hidden,"DOT triggers actual Eye rebirth "+power);Check(!interrupted&&e.ability=="reincarnate"&&e.castRemaining>1.9f,"DOT rebirth owns the rest of its tick and cannot restart a legacy cast "+power);g.StepSimulation(2.2f);Check(!e.hidden&&e.alive&&e.stage==2,"DOT rebirth completes normally "+power);Done(g);}Debug.Log("REBIRTH_REGRESSION_OK");
  }
  public static void FreezeRegression(){
   var g=Arena(24);var a=g.TestSpawn("frostHerald",0,3);Still(a);var t=TestTower(g,"seed",a.position+Vector3.forward);t.cooldown=1000;var commits=new List<float>();g.Effect+=v=>{if(v.type=="ability"&&v.kind=="fieldFreeze")commits.Add(g.elapsed);};g.StepSimulation(.7f);var b=g.TestSpawn("frostHerald",1,3);Still(b);g.StepSimulation(10);Check(commits.Count==1,"overlapping Herald windups share one committed freeze during recovery");Check(t.stunnedFor==0,"the deferred Herald does not extend field freeze");g.StepSimulation(6);Check(commits.Count>=2&&commits[1]-commits[0]>=5,"second Herald re-warns after global recovery");Done(g);Debug.Log("FREEZE_REGRESSION_OK");
  }
  public static void ShieldRegression(){
   foreach(string shield in new[]{"mossShield","lanternFlood"}){var g=Arena(shield=="mossShield"?24:8);var giver=g.TestSpawn(shield=="mossShield"?"mossGolem":"boss",0,4,shield!="mossShield");Still(giver);var e=g.TestSpawn("crystal",0,4.2f);Still(e);float innate=e.shield;g.Command("{\"type\":\"debugCast\",\"id\":"+giver.id+",\"kind\":\""+shield+"\"}");g.StepSimulation(6);Check(Mathf.Abs(e.shield-innate)<.001f,"temporary "+shield+" expiry preserves a larger innate shield");Done(g);}
   for(int mode=0;mode<4;mode++){var g=Arena(24);var giver=g.TestSpawn("mossGolem",0,4);Still(giver);var e=g.TestSpawn("crystal",0,4.2f);Still(e);e.shield=20;float capacity=e.maxShield;g.Command("{\"type\":\"debugCast\",\"id\":"+giver.id+",\"kind\":\"mossShield\"}");g.StepSimulation(1.9f);float bonus=e.shield-20;Check(bonus>30,"test ward actually strengthens the damaged innate shield");float amount=mode==1?bonus*.5f:mode==2?bonus+5:0;if(amount>0)g.TestDamage(e.id,amount,"seed");if(mode==3)g.TestFire("magnet",1,e.id,e.position);g.StepSimulation(4.4f);Check(Mathf.Abs(e.shield-(mode==2?15:20))<.01f&&Mathf.Abs(e.maxShield-capacity)<.01f,"ward expiry removes only unspent bonus and never restores absorbed innate shield: "+mode);Done(g);}
   Debug.Log("SHIELD_REGRESSION_OK");
  }
  public static void ExpansionTune(){assertions=0;failures.Clear();policyMerges=true;foreach(int l in new[]{19,25,26,27,28})for(int policy=0;policy<2;policy++){var r=RunCampaign(l,policy);Debug.Log("EXPANSION_TUNE level="+l+" policy="+policy+" result="+r.phase+" hearts="+r.health+" wave="+r.wave+" seconds="+r.seconds+" bossHp="+r.bossHp+" bossGap="+r.bossGap+" roster="+r.roster);}}
  public static void PairTune(){assertions=0;failures.Clear();policyMerges=true;foreach(int l in new[]{20,21,22,23,24}){var r=RunCampaign(l,1);Debug.Log("PAIR_TUNE level="+l+" result="+r.phase+" hearts="+r.health+" supers="+r.supers+" roster="+r.roster);}}
  static void ExpansionReviewCommands(){
   {var g=New(1);var ids=new HashSet<int>();int gold=g.coins;for(int group=0;group<2;group++)for(int tier=1;tier<=5;tier++){g.Command("{\"type\":\"debugGarden\",\"value\":"+group+",\"tier\":"+tier+"}");Check(g.towers.Count==10&&g.coins==gold&&g.level.id==1,"QA gallery keeps real map and currency while displaying ten forms");var pads=new HashSet<int>();foreach(var t in g.towers){Check(ids.Add(t.id)&&pads.Add(t.pad)&&!g.blockers.Exists(b=>b.pad==t.pad),"QA replacement uses fresh IDs and valid unblocked pads");Check(t.tier==tier&&Array.FindIndex(CarrotData.Towers,d=>d.id==t.kind)/10==group,"QA gallery uses requested family group and form");}Check(g.selectionId<0&&g.mergeArmed==0&&g.TestProjectiles==0,"QA replacement clears stale selections and projectiles");}Done(g);}
   {var g=New(1);g.Command("{\"type\":\"debugEncounter\",\"kind\":\"eyeball\"}");var e=g.enemies.Find(x=>x.boss=="eyeball");int gold=g.coins;g.Command("{\"type\":\"debugBossDamage\",\"value\":20000}");Check(e.stage==2&&e.hidden&&e.alive&&g.coins==gold&&g.phase=="playing","QA boss damage follows actual rebirth and does not force victory");float hp=e.hp;g.Command("{\"type\":\"debugBossDamage\",\"value\":20000}");Check(e.hp==hp&&e.stage==2,"QA damage respects untargetable reforming state");Done(g);}
   foreach(string kind in new[]{"garden","marsh","frost","orchard","tornado","zombie","eyeball","portal"}){
    var g=New(1);g.Command("{\"type\":\"debugEncounter\",\"kind\":\""+kind+"\"}");var e=g.enemies.Find(x=>x.boss==kind);Check(g.level.id==CarrotData.BossHome(kind)&&g.phase=="playing"&&e!=null&&e.distance==0&&e.route==0,"QA encounter starts at its real entrance "+kind);g.StepSimulation(.2f);Check(g.enemies.Count==1,"QA review suppresses unrelated scheduled waves");int count=g.enemies.Count;g.Command("{\"type\":\"debugMini\",\"kind\":\"not-a-profile\"}");Check(g.enemies.Count==count,"QA rejects unknown profiles");Done(g);
   }
   foreach(var def in CarrotData.AddedEnemies)if(def.mini){var g=New(24);g.Command("{\"type\":\"debugMini\",\"kind\":\""+def.id+"\",\"route\":999}");var e=g.enemies.Find(x=>x.kind==def.id);Check(e!=null&&e.distance==0&&e.route>=0&&e.route<g.level.routes.Length,"QA mini uses a valid entrance "+def.id);bool warned=false;g.Effect+=v=>{if(v.type=="telegraph"&&v.kind==def.trait)warned=true;};g.Command("{\"type\":\"debugCast\",\"id\":"+e.id+",\"kind\":\"portalSummon\"}");Check(e.ability!="portalSummon","QA cannot assign another creature's kit");g.Command("{\"type\":\"debugCast\",\"id\":"+e.id+",\"kind\":\""+def.trait+"\"}");Check(warned&&e.castRemaining>0,"QA cast uses the actual warned cast path "+def.id);Done(g);}
   {var g=Arena(24);var target=Durable(g,distance:5);var locked=target.position;var collateral=Durable(g,distance:5);float hp=target.hp,other=collateral.hp;target.position+=Vector3.forward*3;Vector3 impact=target.position;g.Effect+=v=>{if(v.type=="impact"&&v.kind=="dragonfruit")impact=v.position;};g.TestLockedImpact("dragonfruit",target.id,locked+new Vector3(1,0,0),locked);Check(target.hp==hp&&collateral.hp<other&&Vector3.Distance(impact,locked)<.001f,"meteor damage and visual impact share the locked ground point");Done(g);}
  }
  static void ExpansionConsequences(){
   foreach(var def in CarrotData.AddedEnemies)if(def.mini){
    var g=Arena(24);g.coins=500;var e=g.TestSpawn(def.id,0,4);Still(e);float start=e.distance;var ally=Durable(g,distance:4.3f);Still(ally);var t=TestTower(g,"seed",e.position+new Vector3(0,0,1));t.cooldown=1000;var t2=TestTower(g,"seed",e.position+new Vector3(0,0,1.5f));t2.cooldown=1000;
    bool committed=false,consequence=false;g.Effect+=v=>{if(v.id!=e.id||v.type!="ability"||v.kind!=def.trait)return;committed=true;
     switch(def.id){
      case "warDrummer":consequence=ally.rushUntil>g.elapsed;break;
      case "frostHerald":case "stormWarden":consequence=t.stunnedFor>0;break;
      case "witherPriest":case "venomQueen":consequence=t.weakenUntil>g.elapsed&&t.weakenFactor<1;break;
      case "graveCaller":case "mirrorKnight":consequence=g.PendingSummons>0;break;
      case "riftStalker":consequence=e.distance>start&&e.distance-start<=1.21f;break;
      case "mossGolem":consequence=ally.shield>0;break;
      case "emberBoar":consequence=e.rushUntil>g.elapsed&&t.slowFor>0;break;
      case "ironSnail":{float hp=e.hp;g.TestFire("seed",1,e.id,e.position);consequence=hp-e.hp<CarrotData.Tower("seed").damage[0]*.4f;break;}
      case "lanternLeech":consequence=g.coins<500;break;
      case "chronoMoth":case "thornBeast":consequence=t.slowFor>0;break;
      case "portalSentinel":consequence=e.shield>0&&g.PendingSummons>0&&e.distance>start;break;
     }};
    g.StepSimulation(8);Check(committed&&consequence,"ability changes real gameplay state: "+def.id);
    if(def.id=="lanternLeech"){g.TestDamage(e.id,1e6f);Check(g.coins==500+e.reward,"defeated leech returns the stolen purse");}
    if(def.id=="warDrummer"){ally.rushUntil=0;g.TestDamage(e.id,1e6f);Check(ally.rushUntil>g.elapsed,"drummer death rallies surviving enemies");}
    Done(g);
   }
   {var g=Arena(27);var boss=g.TestSpawn("boss",0,2,true);Still(boss);g.TestDamage(boss.id,1e6f);g.StepSimulation(2.4f);float warned=-1,previous=-100;int blackouts=0;
    g.Effect+=v=>{if(v.id!=boss.id)return;if(v.type=="telegraph"&&v.kind=="blackout"){warned=g.elapsed;Check(v.duration>=2,"full blackout gives a readable warning");}if(v.type=="ability"&&v.kind=="blackout"){Check(warned>=0&&g.elapsed-warned>=2.1f,"blackout does not start before its warning");Check(g.blindKind=="blackout"&&g.blindAlpha==1&&g.blindUntil-g.elapsed<=1.26f,"blackout is full black but brief");Check(g.elapsed-previous>=18,"blackouts have a global recovery window");previous=g.elapsed;blackouts++;}};
    for(int i=0;i<1400&&g.phase=="playing";i++){g.StepSimulation(.1f);foreach(var add in g.enemies.ToArray())if(add.alive&&add.id!=boss.id)g.TestDamage(add.id,1e6f);}Check(blackouts>=1&&blackouts<=3,"staged eye actually uses bounded blackouts");Done(g);
   }
   {var g=Arena(28);var boss=g.TestSpawn("boss",0,CarrotData.RouteLength(g.level.routes[0])-.01f,true);g.StepSimulation(1);Check(g.phase=="lost"&&g.health==0,"challenge cannot be won by letting its guardian reach carrot");Done(g);}
  }
  public static void Expansion(){
   Check(Array.FindAll(CarrotData.AddedEnemies,e=>e.mini).Length==15,"fifteen miniboss profiles");Check(Array.FindAll(CarrotData.AddedEnemies,e=>!e.mini).Length==12,"twelve added ordinary profiles");
   foreach(var d in CarrotData.AddedEnemies){
    bool taught=false;for(int l=0;l<24;l++)foreach(string w in CarrotData.Waves[l])if(w.Contains(d.id+":"))taught=true;Check(taught,"campaign teaches "+d.id);
    var g=Arena(24);var e=g.TestSpawn(d.id,0,3);Check(e.kind==d.id&&e.maxHp>0&&e.speed>0&&Mathf.Abs(e.speed-d.speed*CarrotData.MovementScale)<.001f,"profile and slowed motion "+d.id);
    Check((e.miniboss==d.id)==d.mini&&e.boss=="","miniboss is not encounter boss "+d.id);Check(e.air==d.air,"flight classification "+d.id);
    if(d.mini){QuietTowers(g);Still(e);var warnings=new List<string>();var casts=new List<string>();g.Effect+=v=>{if(v.id!=e.id)return;if(v.type=="telegraph")warnings.Add(v.kind);if(v.type=="ability")casts.Add(v.kind);};g.StepSimulation(8);Check(warnings.Contains(d.trait)&&casts.Contains(d.trait),"warned real miniboss cast "+d.id);Check(g.Snapshot().Contains("\"minibosses\":[{"),"miniboss health data "+d.id);g.TestDamage(e.id,1e6f);for(int i=0;i<80&&g.phase=="playing";i++){foreach(var add in g.enemies.ToArray())if(add.alive)g.TestDamage(add.id,1e6f);g.StepSimulation(.5f);}Check(g.PendingSummons==0&&g.phase=="won","miniboss summons resolve and permit victory "+d.id);}
    Done(g);
   }
   foreach(var d in CarrotData.Towers)if(Array.IndexOf(new[]{"seed","frost","mortar","prism","storm","blossom","starfruit","gravity","book","thunder"},d.id)<0){
    for(int tier=1;tier<=5;tier++){var g=Arena(24);var a=Durable(g,distance:5);var b=Durable(g,distance:5.2f);Still(a);Still(b);float before=a.hp+b.hp;g.TestFire(d.id,tier,a.id,a.position-new Vector3(0,0,.5f));g.StepSimulation(2);Check(a.hp+b.hp<before,"new tower damages actual enemies "+d.id+" tier"+tier);Done(g);}
   }
   // Lotus can cleanse itself while disabled. Independent cooldown prevents a permanent immunity loop.
   {var g=Arena();var e=Durable(g);Still(e);var t=TestTower(g,"lotus",e.position,5);var ally=TestTower(g,"seed",e.position+Vector3.forward);t.stunnedFor=ally.stunnedFor=4;ally.weakenUntil=20;ally.weakenFactor=.5f;g.StepSimulation(.1f);Check(t.stunnedFor==0&&ally.stunnedFor==0&&ally.weakenUntil==0,"lotus cleanses real control and wither while stunned");ally.stunnedFor=3;g.StepSimulation(.1f);Check(ally.stunnedFor>2,"cleanse has bounded cooldown");Done(g);}
   // Clock and Blossom never multiply; poison stacks, sleep and rewinds have per-enemy caps.
   {var g=Arena();var e=Durable(g);Still(e);var t=TestTower(g,"seed",e.position);t.cooldown=100;g.TestFire("clockflower",5,e.id,e.position);g.TestFire("blossom",5,e.id,e.position);g.StepSimulation(.1f);Check(t.buff<=.301f&&t.buff>=.29f,"tempo and sun auras cap at thirty percent");Done(g);}
   // Each existing boss gets an additional cast; Portal cycles all four explicit skills.
   string[] upgrades={"brambleSurge","lanternFlood","glacierLance","harvestMoon","cycloneCall","graveMarch","eyeClones","portalSummon"};int[] levels={4,8,12,20,25,26,27,28};
   for(int i=0;i<levels.Length;i++){var g=Arena(levels[i]);QuietTowers(g);var e=g.TestSpawn("boss",0,3,true);Still(e);var casts=Casts(g,e.id);g.StepSimulation(38);Check(casts.Contains(upgrades[i]),"upgraded boss really commits "+upgrades[i]);Done(g);}
   // Portal moves bounded path distances, warns every tower it actually stuns, and does not teleport into the carrot.
   {var g=Arena(28);QuietTowers(g);var e=g.TestSpawn("boss",0,4,true);Still(e);var casts=Casts(g,e.id);var warned=new HashSet<int>();int moves=0;g.Effect+=v=>{if(v.kind=="portalStorm"&&(v.type=="telegraph"||v.type=="telegraphTarget"))warned.Add(v.target);if(v.kind=="portalStorm"&&(v.type=="ability"||v.type=="abilityTarget")&&v.target!=0)Check(warned.Contains(v.target),"portal stun was individually warned");if(v.type=="abilityTarget"&&(v.kind=="portalBlink"||v.kind=="portalShift")){moves++;Check((v.to-v.position).magnitude<=1.31f,"bounded portal displacement");}};g.StepSimulation(42);Check(casts.Contains("portalBlink")&&casts.Contains("portalShift")&&casts.Contains("portalStorm")&&moves>0,"portal has all four meaningful actions");Check(e.distance<=e.routeLength-6,"portal preserves final approach");Check(g.enemies.FindAll(x=>x.alive&&x.summoned).Count<=22&&g.PendingSummons<=22,"summon caps hold");Done(g);}
   // The eye revives twice at lower maximum HP; neither transition gives gold or an early win.
   {var g=Arena(27);var e=g.TestSpawn("boss",0,0,true);Still(e);int gold=g.coins;float max=e.maxHp;g.TestDamage(e.id,1e6f);Check(e.alive&&e.stage==2&&e.maxHp<max&&g.coins==gold&&g.phase=="playing","eye stage2 is lower HP without premature reward");g.StepSimulation(2.4f);float max2=e.maxHp;g.TestDamage(e.id,1e6f);Check(e.alive&&e.stage==3&&e.maxHp<max2,"eye stage3 is lower again");g.StepSimulation(2.4f);g.TestDamage(e.id,1e6f);g.StepSimulation(.1f);Check(!e.alive&&g.coins==gold+e.reward+30&&g.phase=="won","eye reward and victory only after final life");Done(g);}
   ExpansionConsequences();
   ExpansionReviewCommands();
   RebirthRegression();FreezeRegression();ShieldRegression();
   Debug.Log("CARROT_EXPANSION_OK "+assertions+" assertions so far");
  }
 }
}
#endif
