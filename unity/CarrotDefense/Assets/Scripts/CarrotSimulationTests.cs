#if UNITY_EDITOR
using System;
using System.Collections.Generic;
using UnityEngine;
using UnityEditor;
namespace CarrotTD {
 public static class CarrotSimulationTests {
  static int assertions;
  static void Check(bool condition,string reason){assertions++;if(!condition)throw new Exception("CARROT TEST: "+reason);}
  static CarrotGame New(int level){var obj=new GameObject("CarrotSimulationTest");var game=obj.AddComponent<CarrotGame>();game.AutoTick=false;game.EnableBridge=false;game.LoadLevel(level);return game;}
  static void Done(CarrotGame game){UnityEngine.Object.DestroyImmediate(game.gameObject);}
  [MenuItem("Carrot/Run simulation checks")]
  public static void Run(){
   assertions=0;Geometry();Shopping();ContactsAndOutcomes();Bosses();PresentationEvents();Powers();Campaign();PoorCoverage();
   Debug.Log("CARROT_TESTS_OK "+assertions+" assertions; "+(2*CarrotData.Levels.Length)+" campaign victories with earned coins; all ten powers, four bosses and poor-coverage losses checked.");
  }
  public static void Geometry(){
   Check(CarrotData.Towers.Length==10,"ten tower families");
   foreach(var d in CarrotData.Towers){Check(d.cost.Length==4&&d.damage.Length==4&&d.interval.Length==4&&d.range.Length==4,"four tiers "+d.id);for(int i=0;i<4;i++)Check(d.cost[i]>0&&d.damage[i]>0&&d.interval[i]>0&&d.range[i]>0,"positive tuning "+d.id);}
   foreach(var l in CarrotData.Levels){
    Check(l.routes.Length>=2&&l.routes.Length<=3,"multiple routes in "+l.id);Vector3 goal=l.routes[0][l.routes[0].Length-1];
    foreach(var r in l.routes){Check((r[r.Length-1]-goal).sqrMagnitude<.001f,"shared goal "+l.id);Check(CarrotData.RouteLength(r)>=25,"fair approach length "+l.id);
     for(int i=1;i<r.Length;i++)Check(Mathf.Abs(r[i].x-r[i-1].x)<.001f||Mathf.Abs(r[i].z-r[i-1].z)<.001f,"clear orthogonal lane "+l.id);
     foreach(var p in l.pads)Check(CarrotData.DistanceToRoute(p,r)>=.85f,"pad off lane "+l.id);
    }
    var used=new HashSet<int>();foreach(var b in l.blockers){Check(b.pad>=0&&b.pad<l.pads.Length&&used.Add(b.pad),"legal unique blocker "+l.id);}
    Check(l.pads.Length-l.blockers.Length>=4,"at least four opening positions "+l.id);
    Check(CarrotData.Waves[l.id-1].Length==l.waves,"wave counts "+l.id);
   }
  }
  static void Shopping(){
   var g=New(12);g.coins=100000;
   foreach(var d in CarrotData.Towers){int pad=FreePad(g);g.Select("pad",pad);int before=g.coins;g.Command("{\"type\":\"buy\",\"kind\":\""+d.id+"\"}");var t=g.towers.Find(x=>x.pad==pad);Check(t!=null&&t.tier==1,"purchase "+d.id);int spent=d.cost[0];Check(g.coins==before-spent,"buy cost "+d.id);
    for(int tier=2;tier<=4;tier++){g.Command("{\"type\":\"upgrade\"}");spent+=d.cost[tier-1];Check(t.tier==tier&&t.spent==spent&&g.coins==before-spent,"upgrade "+d.id+" "+tier);}
    int atMax=g.coins;g.Command("{\"type\":\"upgrade\"}");Check(g.coins==atMax&&t.tier==4,"no fifth tier "+d.id);g.Command("{\"type\":\"sell\"}");Check(g.coins==before-spent+Mathf.FloorToInt(spent*.7f)&&!g.towers.Contains(t),"correct sell "+d.id);
   }
   g.LoadLevel(1);int p=FreePad(g);g.Select("pad",p);g.Command("{\"type\":\"buy\",\"kind\":\"thunder\"}");Check(g.towers.Count==0&&g.coins==240,"locked purchase rejected");
   g.coins=0;g.Command("{\"type\":\"buy\",\"kind\":\"seed\"}");Check(g.towers.Count==0&&g.coins==0,"unaffordable purchase rejected");
   g.Select("pad",g.blockers[0].pad);g.coins=240;g.Command("{\"type\":\"buy\",\"kind\":\"seed\"}");Check(g.towers.Count==0,"occupied pad rejected");Done(g);
  }
  static int FreePad(CarrotGame g){for(int i=0;i<g.level.pads.Length;i++)if(!g.towers.Exists(t=>t.pad==i)&&!g.blockers.Exists(b=>b.pad==i))return i;return -1;}
  static void ContactsAndOutcomes(){
   foreach(int hearts in new[]{1,2}){var g=New(1);g.phase="playing";g.TestClearScheduled();g.health=hearts;var e=g.TestSpawn("nibble",0,CarrotData.RouteLength(g.level.routes[0])-.01f);g.StepSimulation(1);Check(g.health==hearts-1&&g.CarrotContacts==1,"one contact one health");Check(g.phase==(hearts==1?"lost":"won"),"last contact outcome precedence");g.StepSimulation(3);Check(g.CarrotContacts==1,"no repeated contact");Done(g);}
   var boss=New(4);boss.phase="playing";boss.TestClearScheduled();boss.TestSpawn("boss",0,CarrotData.RouteLength(boss.level.routes[0])-.01f,true);boss.StepSimulation(1);Check(boss.health==7&&boss.CarrotContacts==1&&boss.phase=="won","boss arrival deals three once");Done(boss);
   var paused=New(1);paused.Command("{\"type\":\"start\"}");paused.StepSimulation(1);float elapsed=paused.elapsed;paused.Command("{\"type\":\"pause\"}");paused.StepSimulation(5);Check(paused.elapsed==elapsed,"pause freezes game timers");paused.Command("{\"type\":\"pause\"}");paused.StepSimulation(1);Check(paused.elapsed>elapsed,"resume continues timers");paused.Command("{\"type\":\"speed\",\"value\":2}");Check(paused.speed==2,"two-times mode accepted");Done(paused);
  }
  static void QuietTowers(CarrotGame g){int i=0;foreach(var p in g.level.pads)g.towers.Add(new TowerState{id=10000+i++,pad=i-1,kind="seed",position=p,tier=1,cooldown=1000});}
  static void Bosses(){
   var garden=New(4);garden.phase="playing";garden.TestClearScheduled();QuietTowers(garden);var b=garden.TestSpawn("boss",0,0,true);b.hp=b.maxHp*.5f;garden.StepSimulation(15);Check(garden.blockers.Exists(x=>x.ownerEnemy==b.id),"root creates real focusable weakpoint");Check(garden.towers.Exists(x=>x.slowFor>0),"root slows real towers");var knot=garden.blockers.Find(x=>x.ownerEnemy==b.id);garden.TestDamageScenery(knot.id,100);Check(!garden.towers.Exists(x=>x.slowFor>0),"breaking root releases snare");Done(garden);
   var marsh=New(8);marsh.phase="playing";marsh.TestClearScheduled();var m=marsh.TestSpawn("boss",0,0,true);m.hp=m.maxHp*.5f;marsh.StepSimulation(16);Check(marsh.enemies.Exists(x=>x.summoned&&x.alive),"marsh summons real finite enemies");marsh.TestDamage(m.id,100000);marsh.StepSimulation(.1f);Check(marsh.phase=="playing","boss death with living adds is not victory");foreach(var add in marsh.enemies.ToArray())if(add.alive)marsh.TestDamage(add.id,100000);marsh.StepSimulation(.2f);Check(marsh.phase=="won"&&marsh.PendingSummons==0,"victory waits for summons");Done(marsh);
   var frost=New(12);frost.phase="playing";frost.TestClearScheduled();QuietTowers(frost);var f=frost.TestSpawn("boss",0,0,true);f.hp=f.maxHp*.5f;frost.StepSimulation(8);Check(f.shield==360,"mantle grants exact shield");float hp=f.hp;frost.TestDamage(f.id,100,"prism");Check(Mathf.Abs(f.shield-260)<.01f&&Mathf.Abs(f.hp-(hp-25))<.01f,"prism damages shield with health bypass");frost.StepSimulation(10);Check(frost.towers.Exists(x=>x.disabledFor>0),"breath affects real tower cadence");f.hp=f.maxHp*.25f;frost.StepSimulation(5);Check(f.shield==0&&frost.enemies.Exists(x=>x.kind=="fragment"&&x.summoned),"last phase trades shield for finite shards");Done(frost);
   // Brambleback returns on level 16 scaled from its home level and still casts bark and root.
   var cider=New(16);cider.phase="playing";cider.TestClearScheduled();QuietTowers(cider);var back=cider.TestSpawn("boss",0,0,true);var backCasts=new List<string>();cider.Effect+=e=>{if(e.type=="ability"&&e.id==back.id)backCasts.Add(e.kind);};
   Check(back.boss=="garden"&&Mathf.Abs(back.maxHp-1800*CarrotData.BossScale(16,"garden"))<.01f&&back.maxHp>1800*2.5f,"returning Brambleback scales from its home level");
   back.hp=back.maxHp*.5f;cider.StepSimulation(15);Check(backCasts.Contains("bark")&&backCasts.Contains("root")&&cider.blockers.Exists(x=>x.ownerEnemy==back.id)&&cider.towers.Exists(x=>x.slowFor>0),"returning Brambleback still casts bark and roots real towers");Done(cider);
   // Old Hollowhead: Harvest Rush, Flock and Straw Heap through the shared telegraph/ability path.
   var field=New(20);field.phase="playing";field.TestClearScheduled();QuietTowers(field);var h=field.TestSpawn("boss",0,0,true);var casts=new List<string>();field.Effect+=e=>{if(e.id==h.id&&(e.type=="ability"||e.type=="telegraph"))casts.Add(e.type+":"+e.kind);};
   Check(h.boss=="orchard"&&Mathf.Abs(h.maxHp-7000)<.01f&&CarrotData.BossName(h.boss)=="Old Hollowhead","Old Hollowhead spawns with its authored health");
   field.StepSimulation(7.1f);var rallied=Durable(field,"nibble",h.distance+.5f);field.StepSimulation(.2f);
   Check(casts.Contains("telegraph:rush")&&casts.Contains("ability:rush"),"harvest rush is telegraphed then committed");
   Check(h.speed>.34f*2&&rallied.speed>.9f*1.4f,"rush more than doubles the boss and rallies an ally within three units");
   field.StepSimulation(2.6f);Check(Mathf.Abs(h.speed-.34f)<.01f&&Mathf.Abs(rallied.speed-.9f)<.01f,"rush ends after 2.5 s");
   h.hp=h.maxHp*.5f;field.StepSimulation(1.9f);Check(h.phase==2&&h.ability=="flock"&&field.PendingSummons==3,"flock reserves three summons during its windup");
   field.StepSimulation(.8f);Check(field.enemies.FindAll(x=>x.kind=="moth"&&x.summoned&&x.air&&x.alive).Count==3&&field.PendingSummons==0,"flock spawns exactly three summoned air moths and releases the reservation");
   field.StepSimulation(.9f);Check(h.hidden&&casts.Contains("ability:heap"),"straw heap hides the boss");float heapHp=h.hp;field.TestDamage(h.id,500);Check(h.hp==heapHp,"a heaped boss takes no damage");
   field.StepSimulation(2.1f);Check(!h.hidden&&casts.Contains("ability:emerge"),"straw heap ends after two seconds");
   field.TestDamage(h.id,100000);field.StepSimulation(.1f);Check(field.phase=="playing","Hollowhead death with living flock adds is not victory");foreach(var add in field.enemies.ToArray())if(add.alive)field.TestDamage(add.id,100000);field.StepSimulation(.2f);Check(field.phase=="won"&&field.PendingSummons==0,"victory waits for the flock");Done(field);
   var near=New(20);near.phase="playing";near.TestClearScheduled();QuietTowers(near);var hn=near.TestSpawn("boss",0,0,true);var nearCasts=new List<string>();near.Effect+=e=>{if(e.type=="ability"&&e.id==hn.id)nearCasts.Add(e.kind);};
   near.StepSimulation(13.2f);Check(hn.hidden,"first-phase straw heap follows the rush");hn.distance=hn.routeLength-1.9f;near.StepSimulation(.1f);Check(!hn.hidden&&nearCasts.Contains("emerge"),"a heaped boss reappears within two units of the carrot");Done(near);
   var last=New(20);last.phase="playing";last.TestClearScheduled();QuietTowers(last);var hl=last.TestSpawn("boss",0,0,true);var lastCasts=new List<string>();last.Effect+=e=>{if(e.type=="ability"&&e.id==hl.id)lastCasts.Add(e.kind);};
   last.StepSimulation(12.3f);Check(hl.ability=="heap"&&hl.castRemaining>0,"straw heap windup in progress");hl.hp=hl.maxHp*.25f;last.StepSimulation(.1f);Check(hl.phase==3&&hl.castRemaining==0&&!hl.hidden,"phase 3 cancels a pending straw heap");
   last.StepSimulation(1.5f);Check(!hl.hidden&&!lastCasts.Contains("heap")&&Mathf.Abs(hl.speed-.46f)<.02f,"phase 3 drops the heap and walks at .46");Done(last);
  }
  static CarrotGame Arena(){var g=New(12);g.phase="playing";g.TestClearScheduled();return g;}
  static void PresentationEvents(){
   foreach(int level in new[]{4,12}){
    string kind=level==4?"root":"breath";int count=level==4?2:3;
    var g=New(level);g.phase="playing";g.TestClearScheduled();var boss=g.TestSpawn("boss",0,5,true);boss.hp=boss.maxHp*.5f;
    for(int i=0;i<count;i++){var tower=TestTower(g,"seed",boss.position+new Vector3(0,0,1+i*.3f));tower.cooldown=1000;}
    var warnings=new List<CarrotEvent>();var commits=new List<CarrotEvent>();int sourceWarnings=0,sourceCommits=0;
    g.Effect+=e=>{if(e.kind!=kind)return;if(e.type=="telegraph"||e.type=="telegraphTarget"){warnings.Add(e);if(e.type=="telegraph")sourceWarnings++;}if(e.type=="ability"||e.type=="abilityTarget"){commits.Add(e);if(e.type=="ability")sourceCommits++;}};
    g.elapsed=11;g.StepSimulation(2);
    Check(warnings.Count==count&&commits.Count==count,"every locked "+kind+" target receives warning and contact");
    Check(sourceWarnings==1&&sourceCommits==1,"one source cue per "+kind+" cast");
    var warned=new HashSet<int>();foreach(var e in warnings){warned.Add(e.target);var tower=g.towers.Find(t=>t.id==e.target);Check(tower!=null&&(tower.position-e.to).sqrMagnitude<.001f&&e.duration>=1.2f,"actual target and readable windup "+kind);}
    Check(warned.Count==count,"distinct locked warning targets "+kind);foreach(var e in commits)Check(warned.Contains(e.target),"no unannounced committed target "+kind);Done(g);
   }
   var wave=New(1);Vector3 warnedEntrance=Vector3.zero;wave.Effect+=e=>{if(e.type=="wave")warnedEntrance=e.position;};wave.Command("{\"type\":\"start\"}");wave.StepSimulation(.7f);Check(wave.enemies.Count>0&&(warnedEntrance-wave.level.routes[wave.enemies[0].route][0]).sqrMagnitude<.001f,"wave entrance matches first actual spawn");Done(wave);
   var bars=Arena();var normal=Durable(bars);Check(bars.Snapshot().Contains("\"visible\":true"),"unhurt distant visible monster has an HP bar");normal.hidden=true;Check(!bars.Snapshot().Contains("\"visible\":true"),"burrowing monster does not reveal its hidden HP position");Done(bars);
   foreach(string kind in new[]{"starfruit","thunder"}){
    var g=Arena();for(int i=0;i<5;i++)Durable(g,distance:5+i*.15f);var focused=g.enemies[0];g.Select("enemy",focused.id);TestTower(g,kind,focused.position+new Vector3(0,0,1));
    var launched=new HashSet<int>();g.Effect+=e=>{if(e.type=="shot"&&e.kind==kind)launched.Add(e.target);};g.StepSimulation(.1f);
    Check(launched.Count==3&&launched.Contains(focused.id),kind+" includes the selected enemy among three distinct targets");g.StepSimulation(.7f);
    Check(focused.hp<focused.maxHp&&g.enemies.FindAll(e=>e.hp<e.maxHp).Count==3,kind+" focus resolves damage on exactly three real targets");Done(g);
   }
  }
  static EnemyState Durable(CarrotGame g,string kind="nibble",float distance=5){var e=g.TestSpawn(kind,0,distance);e.hp=e.maxHp=10000;return e;}
  static TowerState TestTower(CarrotGame g,string kind,Vector3 at,int tier=1){var t=new TowerState{id=9000+g.towers.Count,kind=kind,position=at,tier=tier};g.towers.Add(t);return t;}
  static void Powers(){
   var seed=Arena();var a=Durable(seed);var b=Durable(seed,distance:5.5f);float hp=a.hp;
   for(int i=0;i<3;i++)seed.TestFire("seed",1,a.id,a.position+Vector3.up);
   Check(hp-a.hp>30&&b.hp<b.maxHp,"seed marks produce a damaging burst and ricochet");Done(seed);
   var frost=Arena();var f=Durable(frost);int frozen=0;frost.Effect+=e=>{if(e.kind=="crystallize")frozen++;};
   frost.TestFire("frost",4,f.id,f.position);frost.StepSimulation(.1f);Check(f.speed==0&&f.slowFactor>=.5f,"frost briefly freezes with bounded slow");
   for(int i=0;i<5;i++){frost.StepSimulation(.2f);frost.TestFire("frost",4,f.id,f.position);}
   Check(frozen==1&&f.speed>0,"repeated frost cannot create permanent freeze");Done(frost);
   var mortar=Arena();var m=Durable(mortar);var fly=Durable(mortar,"moth");mortar.TestFire("mortar",4,m.id,m.position);float after=m.hp;mortar.StepSimulation(1);
   Check(m.hp<after&&fly.hp==fly.maxHp,"mortar burning ground persists and leaves air untouched");Done(mortar);
   var prism=Arena();var p=Durable(prism,"crystal");float before=p.hp,shield=p.shield;prism.TestFire("prism",1,p.id,p.position);
   Check(p.shield<shield&&p.hp<before,"prism pierces a live shield");var pt=TestTower(prism,"prism",p.position+new Vector3(0,0,1));var ramp=new List<float>();prism.Effect+=e=>{if(e.type=="ability"&&e.kind=="prismFocus")ramp.Add(e.value);};for(int i=0;i<5;i++){pt.cooldown=0;prism.StepSimulation(.25f);}Check(ramp.Count>=4&&ramp[ramp.Count-1]>ramp[0],"prism focus ramps on the same real enemy");Done(prism);
   var storm=Arena();var sa=Durable(storm);var sb=Durable(storm,distance:5.3f);var sc=Durable(storm,distance:5.6f);storm.TestFire("storm",1,sa.id,sa.position);
   Check(sa.hp<sa.maxHp&&sb.hp<sb.maxHp&&sc.hp<sc.maxHp,"storm damages three different chained enemies");float sh=sa.hp;storm.TestFire("thunder",1,sa.id,sa.position);Check(sh-sa.hp>70,"conductive mark increases thunder damage");Done(storm);
   var blossom=Arena();var ba=Durable(blossom);var ally=TestTower(blossom,"seed",ba.position+new Vector3(.5f,0,0));ally.cooldown=100;blossom.TestFire("blossom",4,ba.id,ba.position);blossom.StepSimulation(.05f);
   Check(ally.buff>=.19f&&ba.hp<ba.maxHp,"sun blossom harms enemies and gives a real cadence aura");Done(blossom);
   var stars=Arena();for(int i=0;i<6;i++)Durable(stars,distance:5+i*.05f);TestTower(stars,"starfruit",stars.enemies[0].position+new Vector3(0,0,1));stars.StepSimulation(.8f);
   Check(stars.enemies.FindAll(e=>e.hp<e.maxHp).Count==3&&stars.enemies.Exists(e=>e.maxHp-e.hp>=22),"base starfruit strikes three targets with returning damage");Done(stars);
   var gravity=Arena();var ga=Durable(gravity);var gb=Durable(gravity,distance:5.4f);float gd=gb.distance;gravity.TestFire("gravity",4,ga.id,ga.position);Check(gb.distance<gd&&gb.hp<gb.maxHp,"black hole damages and pulls nearby route positions backward");float once=gb.distance;gravity.TestFire("gravity",4,ga.id,ga.position);Check(gb.distance==once,"black-hole displacement respects per-enemy cooldown");Done(gravity);
   var book=Arena();var bk=Durable(book);float start=bk.distance;book.TestFire("book",1,bk.id,bk.position);book.StepSimulation(.5f);float reverse=bk.distance;
   Check(reverse<start,"spellbook reverses actual movement along the route");book.StepSimulation(1);Check(bk.distance>reverse,"spellbook resumes forward movement");for(int i=0;i<10;i++){book.TestFire("book",1,bk.id,bk.position);book.StepSimulation(.2f);}Check(bk.distance>start,"spellbook cooldown prevents rewind lock");Done(book);
   var thunder=Arena();for(int i=0;i<5;i++)Durable(thunder,distance:5+i*.05f);TestTower(thunder,"thunder",thunder.enemies[0].position+new Vector3(0,0,1));thunder.StepSimulation(1);
   Check(thunder.enemies.FindAll(e=>e.maxHp-e.hp>=70).Count==3,"thunder charges and damages three distinct targets");Done(thunder);
  }
  static void PoorCoverage(){
   foreach(int level in new[]{1,4,8,12,16,20,24}){var g=New(level);int poor=-1;float score=float.MaxValue;
    for(int pad=0;pad<g.level.pads.Length;pad++)if(!g.blockers.Exists(b=>b.pad==pad)){float value=Coverage(g,g.level.pads[pad],3);if(value<score){score=value;poor=pad;}}
    g.Select("pad",poor);g.Command("{\"type\":\"buy\",\"kind\":\"seed\"}");g.Command("{\"type\":\"start\"}");
    for(float time=0;time<600&&g.phase=="playing";time+=.25f){if(g.towers.Count>0){g.Select("tower",g.towers[0].id);g.Command("{\"type\":\"upgrade\"}");}g.StepSimulation(.25f);}
    Debug.Log("CARROT_POOR_COVERAGE level="+level+" result="+g.phase+" hearts="+g.health+" invested="+(g.towers.Count>0?g.towers[0].spent:0));
    Check(g.phase=="lost"&&g.CarrotContacts>0,"poor single-position coverage is punished on "+level);Done(g);
   }
  }
  public static void Campaign(){
   for(int strategy=0;strategy<2;strategy++)for(int level=1;level<=CarrotData.Levels.Length;level++){
    var g=New(level);if(strategy==1&&level==1){g.Select("pad",0);g.Command("{\"type\":\"buy\",\"kind\":\"seed\"}");g.Select("pad",1);g.Command("{\"type\":\"buy\",\"kind\":\"frost\"}");}BuyBest(g,strategy);BuyBest(g,strategy);g.Command("{\"type\":\"start\"}");float limit=0;
    while(g.phase=="playing"&&limit<900){for(int i=0;i<4;i++)if(!BuyBest(g,strategy))break;var knot=g.blockers.Find(x=>x.ownerEnemy>0);if(knot!=null&&g.selectionId!=knot.id)g.Select("blocker",knot.id);g.StepSimulation(.25f);limit+=.25f;Check(g.coins>=0,"never spend nonexistent coins "+level);}
    string roster="";foreach(var t in g.towers)roster+=t.kind+"/"+t.tier+",";
    Debug.Log("CARROT_CAMPAIGN strategy="+strategy+" level="+level+" result="+g.phase+" hearts="+g.health+" seconds="+g.elapsed.ToString("F1")+" towers="+g.towers.Count+" earned="+g.TotalEarned+" roster="+roster);
    Check(g.phase=="won","strategy "+strategy+" level "+level+" viable with earned coins ("+g.phase+", wave "+g.wave+")");Check(g.progress==1,"complete progress "+level);
    Done(g);
   }
  }

  // A deterministic policy buys only legal unlocked towers with earned money; no outcome shortcuts.
  static bool BuyBest(CarrotGame g,int strategy=0){
   float best=0;int selected=-1;string kind=null;bool upgrading=false;
   foreach(var t in g.towers)if(t.tier<4&&g.towers.Count>=3){var d=CarrotData.Tower(t.kind);{float old=Power(d,t.tier-1)*Preference(d.id,strategy),next=Power(d,t.tier)*Preference(d.id,strategy);float score=(next-old)*Coverage(g,t.position,d.range[t.tier])/d.cost[t.tier]*(g.towers.Count<5?.75f:1.1f);if(score>best){best=score;selected=t.id;upgrading=true;}}}
   for(int p=0;p<g.level.pads.Length;p++)if(!g.towers.Exists(t=>t.pad==p)&&!g.blockers.Exists(b=>b.pad==p))foreach(var d in CarrotData.Towers)if(d.unlock<=g.level.id&&(g.towers.Count>=2||d.cost[0]<=g.coins)){
    float overlap=0;foreach(var t in g.towers)if(Vector3.Distance(t.position,g.level.pads[p])<3.2f)overlap+=.16f;
    float score=Power(d,0)*Preference(d.id,strategy)*Coverage(g,g.level.pads[p],d.range[0])/d.cost[0]/(1+overlap+g.towers.Count*.05f);
    int family=g.towers.FindAll(t=>t.kind==d.id).Count;score/=1+family*.55f;
    if(strategy==0&&g.level.id==1&&d.id=="frost")score=0;
    if(d.id=="frost"&&(g.towers.Count<2||g.towers.Exists(t=>t.kind=="frost"&&Vector3.Distance(t.position,g.level.pads[p])<5)))score*=.2f;
    
    if(score>best){best=score;selected=p;kind=d.id;upgrading=false;}
   }
   if(selected<0)return false;
   if(upgrading&&CarrotData.Tower(g.towers.Find(t=>t.id==selected).kind).cost[g.towers.Find(t=>t.id==selected).tier]>g.coins)return false;
   if(!upgrading&&CarrotData.Tower(kind).cost[0]>g.coins)return false;
   if(upgrading){g.Select("tower",selected);g.Command("{\"type\":\"upgrade\"}");}else{g.Select("pad",selected);g.Command("{\"type\":\"buy\",\"kind\":\""+kind+"\"}");}return true;
  }
  static float Preference(string id,int strategy){
   if(strategy==0){switch(id){case "seed":return 1.2f;case "prism":return 1.2f;case "storm":return 1.3f;case "frost":return 1.1f;case "starfruit":return .7f;case "mortar":return .8f;default:return 1;}}
   switch(id){case "starfruit":return 1.5f;case "mortar":return .95f;case "blossom":return 1.3f;case "gravity":return 1.25f;case "thunder":return .8f;case "prism":return .8f;default:return 1;}
  }
  static float Power(TowerDef d,int tier){float power=d.damage[tier]/d.interval[tier];switch(d.id){case "frost":return power+8;case "mortar":return power*1.6f;case "storm":return power*1.9f;case "blossom":return power*2;case "starfruit":return power*(4.0f+tier*.65f);case "gravity":return power*1.6f+10;case "book":return power*1.25f;case "thunder":return power*2.6f;default:return power;}}
  static readonly Dictionary<string,float> coverageCache=new Dictionary<string,float>();
  static float Coverage(CarrotGame g,Vector3 p,float range){string key=g.level.id+"/"+p.x+"/"+p.z+"/"+range;if(coverageCache.TryGetValue(key,out float cached))return cached;float sum=0;foreach(var route in g.level.routes){float covered=0,len=CarrotData.RouteLength(route);for(float d=0;d<len;d+=.75f){Vector3 dir;var at=CarrotData.RoutePoint(route,d,out dir);if(Vector3.Distance(p,at)<=range)covered+=.75f;}sum+=covered/len;}float result=sum/g.level.routes.Length;coverageCache[key]=result;return result;}
 }
}
#endif
