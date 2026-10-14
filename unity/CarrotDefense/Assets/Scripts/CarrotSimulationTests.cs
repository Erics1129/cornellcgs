#if UNITY_EDITOR
using System;
using System.Collections.Generic;
using UnityEngine;
using UnityEditor;
namespace CarrotTD {
 public static partial class CarrotSimulationTests {
  static int assertions;
  static readonly List<string> failures=new List<string>();
  static void Check(bool condition,string reason){assertions++;if(!condition)throw new Exception("CARROT TEST: "+reason);}
  static CarrotGame New(int level){var obj=new GameObject("CarrotSimulationTest");var game=obj.AddComponent<CarrotGame>();game.AutoTick=false;game.EnableBridge=false;game.LoadLevel(level);return game;}
  static void Done(CarrotGame game){UnityEngine.Object.DestroyImmediate(game.gameObject);}
  static void Units(){Geometry();Shopping();ContactsAndOutcomes();Bosses();PresentationEvents();Powers();Super();SuperPowers();SuperBudget();Blindness();Whiteout();Dusk();Uproot();Tithe();Challenges();Expansion();SummonRewardRegression();PrismEncounter();PrismBoundaryRegression();PrismBalance();Contract();
#if !CARROT_STANDALONE_TEST
   CarrotAudio.MusicTransitionRegression();
#endif
  }
  static void Finish(string scope){
   if(failures.Count>0){foreach(var f in failures)Debug.LogError("CARROT_CAMPAIGN_FAILURE "+f);throw new Exception("CARROT TEST: "+failures.Count+" campaign failures ("+scope+"); first: "+failures[0]);}
   Debug.Log("CARROT_TESTS_OK "+assertions+" assertions; "+(2*CarrotData.Levels.Length-1)+" campaign victories with earned coins ("+scope+"); all twenty powers and Supers, nine bosses and fifteen minibosses, blindness, uproot, challenges and poor-coverage losses checked.");
  }
  [MenuItem("Carrot/Run simulation checks")]
  public static void Run(){
   assertions=0;failures.Clear();CarrotGame.LegacyKits=false;Units();Campaign();PoorCoverage();ReferenceGates();Determinism();Finish("full");
  }
  /// <summary>Retune loop: only the bot campaigns, never throwing, so the driver can read every level's result in one run.</summary>
  public static void Tune(){assertions=0;failures.Clear();CarrotGame.LegacyKits=false;Campaign();Debug.Log("CARROT_TUNE_DONE failures="+failures.Count);}
  /// <summary>Diagnostic: replay one policy on one level (CARROT_PROBE="level,strategy") and log the opening every two seconds.</summary>
  public static void Probe(){
   var spec=(Environment.GetEnvironmentVariable("CARROT_PROBE")??"12,0").Split(',');int level=int.Parse(spec[0]),strategy=int.Parse(spec[1]);
   var g=New(level);policyMerges=true;BuyBest(g,strategy);BuyBest(g,strategy);g.Command("{\"type\":\"start\"}");float limit=0,next=0;int leaks=0,lastMergeWave=-1;
   g.Effect+=e=>{if(e.type=="carrotHit")leaks++;};
   while(g.phase=="playing"&&limit<900){for(int i=0;i<4;i++)if(!BuyBest(g,strategy))break;if(g.wave!=lastMergeWave&&MergeBest(g))lastMergeWave=g.wave;Focus(g);g.StepSimulation(.25f);limit+=.25f;
    if(limit>=next){next+=2;string roster="";foreach(var t in g.towers)roster+=t.kind+"/"+t.tier+"@"+t.pad+",";int alive=0;foreach(var e in g.enemies)if(e.alive)alive++;
     Debug.Log("CARROT_PROBE t="+g.elapsed.ToString("F1")+" wave="+g.wave+" health="+g.health+" leaks="+leaks+" coins="+g.coins+" earned="+g.TotalEarned+" alive="+alive+" towers="+roster);}}
   Debug.Log("CARROT_PROBE_END phase="+g.phase+" t="+g.elapsed.ToString("F1"));Done(g);
  }
  /// <summary>Everything except the long bot campaigns: a two-minute pre-flight for the simulation rules.</summary>
  public static void Quick(){assertions=0;failures.Clear();CarrotGame.LegacyKits=false;Units();Debug.Log("CARROT_QUICK_OK "+assertions+" assertions");}
  /// <summary>Stage-1/2 record: the merging bots against the pre-pass boss kits (legacy) and then against the full kits, on whatever waves are checked in.</summary>
  public static void Baselines(){
   assertions=0;failures.Clear();CarrotGame.LegacyKits=false;Units();
   CarrotGame.LegacyKits=true;CampaignRuns("CARROT_BASELINE_CAMPAIGN kits=legacy",24,true,false);
   CarrotGame.LegacyKits=false;Campaign();PoorCoverage();Finish("baselines");
  }
  public static void Geometry(){
   Check(CarrotData.Towers.Length==20,"twenty tower families");
   foreach(var d in CarrotData.Towers){Check(d.cost.Length==4&&d.damage.Length==5&&d.interval.Length==5&&d.range.Length==5,"four paid tiers and one merged tier "+d.id);for(int i=0;i<5;i++)Check((i==4||d.cost[i]>0)&&d.damage[i]>0&&d.interval[i]>0&&d.range[i]>0,"positive tuning "+d.id);
    Check(Mathf.Abs(d.range[4]-d.range[3])<.0001f,"a Super gains no range "+d.id);Check(d.damage[4]>d.damage[3]&&d.interval[4]<=d.interval[3],"a Super hits harder "+d.id);Check(!string.IsNullOrEmpty(d.superName)&&!string.IsNullOrEmpty(d.superTrait),"super name and trait "+d.id);}
   Check(CarrotData.Levels.Length==29&&CarrotData.Waves.Length==29,"twenty-four campaign levels and five challenges");
   foreach(var l in CarrotData.Levels){
    Check(l.id==29?l.routes.Length==1:l.routes.Length>=2&&l.routes.Length<=3,"authored route count in "+l.id);Vector3 goal=l.routes[0][l.routes[0].Length-1];
    foreach(var r in l.routes){Check((r[r.Length-1]-goal).sqrMagnitude<.001f,"shared goal "+l.id);Check(CarrotData.RouteLength(r)>=25,"fair approach length "+l.id);
     for(int i=1;i<r.Length;i++)Check(Mathf.Abs(r[i].x-r[i-1].x)<.001f||Mathf.Abs(r[i].z-r[i-1].z)<.001f,"clear orthogonal lane "+l.id);
     foreach(var p in l.pads)Check(CarrotData.DistanceToRoute(p,r)>=.85f,"pad off lane "+l.id);
    }
    var used=new HashSet<int>();foreach(var b in l.blockers){Check(b.pad>=0&&b.pad<l.pads.Length&&used.Add(b.pad),"legal unique blocker "+l.id);}
    Check(l.pads.Length-l.blockers.Length>=4,"at least four opening positions "+l.id);
    Check(CarrotData.Waves[l.id-1].Length==l.waves,"wave counts "+l.id);
    Check(CarrotData.IsChallenge(l.id)==(l.biome=="arena"||l.biome=="prism"),"challenge-specific battlefield "+l.id);
    if(CarrotData.IsChallenge(l.id)){Check(!string.IsNullOrEmpty(l.boss)&&CarrotData.BossHome(l.boss)==l.id&&Mathf.Abs(CarrotData.BossScale(l.id,l.boss)-1)<.0001f,"challenge boss at home "+l.id);Check(CarrotData.ChallengeDifficulty(l.id)!="","challenge difficulty "+l.id);foreach(int pad in CarrotData.LitPads(l.id))Check(pad>=0&&pad<l.pads.Length&&!Array.Exists(l.blockers,b=>b.pad==pad),"lantern pads are open pads "+l.id);}
    else Check(CarrotData.LitPads(l.id).Length==0&&CarrotData.ChallengeDifficulty(l.id)=="","no lantern pads on the campaign "+l.id);
    int peak=0;foreach(string wave in CarrotData.Waves[l.id-1]){int total=0;foreach(string packet in wave.Split(',')){var bits=packet.Split(':');Check(Array.IndexOf(Kinds,bits[0])>=0||CarrotData.Enemy(bits[0])!=null,"known packet kind "+bits[0]+" on "+l.id);total+=int.Parse(bits[1]);}peak=Mathf.Max(peak,total);}
    Check(peak<=110,"peak enemies per wave on "+l.id);
    Check(string.IsNullOrEmpty(l.boss)==!CarrotData.Waves[l.id-1][l.waves-1].Contains("boss:")||CarrotData.IsChallenge(l.id),"boss levels end with the boss "+l.id);
    
    Check(CarrotData.PressureScale(l.id)>=.65f&&CarrotData.PressureScale(l.id)<=1.6f,"pressure dial within [0.65,1.60] on "+l.id);
   }
   Check(CarrotData.HPScale(25)<CarrotData.HPScale(12)&&CarrotData.HPScale(12)<CarrotData.HPScale(26)&&CarrotData.HPScale(26)<CarrotData.HPScale(24)&&CarrotData.HPScale(24)<CarrotData.HPScale(27),"challenge HP anchors between the campaign's chapters");
   foreach(string boss in new[]{"garden","marsh","frost","orchard","tornado","zombie","eyeball"})Check(CarrotData.BossBaseHp(boss)>=2600&&CarrotData.BossName(boss)!="","boss base health and name "+boss);
   foreach(var row in new[]{new{boss="garden",hp=2600f},new{boss="marsh",hp=5000f},new{boss="frost",hp=8200f},new{boss="orchard",hp=10500f},new{boss="tornado",hp=4500f},new{boss="zombie",hp=9000f},new{boss="eyeball",hp=16000f}})Check(CarrotData.BossBaseHp(row.boss)==row.hp,"boss base health of "+row.boss+" ("+CarrotData.BossBaseHp(row.boss)+" vs "+row.hp+")");
   foreach(string kind in new[]{"seed","frost","mortar","prism","storm","blossom","starfruit","gravity","book","thunder"}){var g=Arena();var e=Durable(g);g.TestFire(kind,5,e.id,e.position+new Vector3(0,0,1));g.StepSimulation(.1f);Check(e.hp<e.maxHp,"Super "+kind+" resolves a hit");Done(g);}
   Difficulty();
  }
  // Difficulty invariants of the retune (scripts/carrot-waves.mjs): frozen pre-retune pressure/stream arrays from `--baseline`, the HPScale table, the introduction packets and the boss escorts.
  static readonly float[] BaselinePressure={42,50,70,81,94,113,132,145,202,223,240,279,236,254,280,276,316,334,352,366,377,396,413,428};
  static readonly float[] BaselineStream={72,106,121,154,161,203,175,226,212,258,250,302,231,243,280,283,303,335,350,370,396,449,459,477};
  static readonly float[] OldHPScale={1f,1.15f,1.3f,1.45f,1.55f,1.75f,1.95f,2.15f,2.3f,2.55f,2.8f,3.1f,3.25f,3.4f,3.55f,3.7f,3.85f,4.0f,4.15f,4.3f,4.45f,4.6f,4.75f,4.9f};
  static readonly float[] NewHPScale={1.05f,1.23f,1.35f,1.65f,1.67f,1.93f,2.18f,2.62f,2.67f,3.01f,3.36f,4.03f,4.03f,4.28f,4.54f,5.11f,5.08f,5.36f,5.64f,6.28f,6.23f,6.53f,6.84f,7.55f,2.62f,6.28f,8.68f};
  static readonly Dictionary<string,float> BaseHp=new Dictionary<string,float>{{"nibble",55},{"dash",38},{"shell",125},{"swarm",24},{"moth",65},{"shaman",130},{"burrow",80},{"crystal",180}};
  static float StreamSeconds(int l){float s=0;var waves=CarrotData.Waves[l-1];foreach(var w in waves)foreach(var packet in w.Split(',')){var b=packet.Split(':');int n=int.Parse(b[1]);s+=Mathf.Max(2,b[0]=="boss"?1.8f*n:n*(b[0]=="swarm"?.24f:.78f)*CarrotData.GapScale(l)*CarrotData.PacketOverlap(l))+.8f;}return s+(waves.Length-1)*CarrotData.Breather(l);}
  // Pressure = HP-weighted spawn work per stream second (ordinary enemies; crystal counts its shield), the retune's metric.
  static float Pressure(int l){float work=0;foreach(var w in CarrotData.Waves[l-1])foreach(var packet in w.Split(',')){var b=packet.Split(':');if(b[0]=="boss")continue;work+=BaseHp[b[0]]*int.Parse(b[1])*CarrotData.HPScale(l);}return work/StreamSeconds(l);}
  static void Difficulty(){
   foreach(var e in CarrotData.AddedEnemies)BaseHp[e.id]=e.hp+e.shield;
   for(int l=1;l<=27;l++)Check(Mathf.Abs(CarrotData.HPScale(l)-NewHPScale[l-1])<.001f,"HPScale table entry on level "+l+" ("+CarrotData.HPScale(l)+" vs "+NewHPScale[l-1]+")");
   for(int l=1;l<=24;l++){
    Check(CarrotData.HPScale(l)>OldHPScale[l-1],"HPScale above the old curve on level "+l);
    Check(Pressure(l)*CarrotData.MovementScale/.72f>=1.08f*BaselinePressure[l-1],"pressure adjusted for movement and reduced plant output at least 1.08x baseline on level "+l+" ("+Pressure(l).ToString("F1")+" vs "+BaselinePressure[l-1]+")");
    Check(StreamSeconds(l)<=1.32f*BaselineStream[l-1],"stream time within 1.32x the baseline on level "+l+" ("+StreamSeconds(l).ToString("F1")+" vs "+BaselineStream[l-1]+")");
   }
   for(int c=0;c<6;c++){int first=c*4+1;float peak=0;for(int l=first;l<first+4;l++)peak=Mathf.Max(peak,Pressure(l));
    Check(Pressure(first+3)>=peak*.87f,"the boss level remains within thirteen percent of its chapter pressure maximum (chapter "+c+", level "+(first+3)+")");
    Check(Pressure(first+2)>=1.1f*Pressure(first),"the pre-boss level is at least 1.1x the chapter opener (level "+(first+2)+")");}
   Check(CarrotData.Waves[2][3].StartsWith("shell:3,")&&CarrotData.Waves[4][0].StartsWith("moth:4,")&&CarrotData.Waves[6][0].StartsWith("shaman:1,")&&CarrotData.Waves[8][0].StartsWith("crystal:3,")&&CarrotData.Waves[10][0].StartsWith("burrow:3,"),"the five introduction packets stay verbatim");
   foreach(int l in new[]{4,8,12,16,20,24}){string final=CarrotData.Waves[l-1][CarrotData.Waves[l-1].Length-1];Check(final.StartsWith("boss:1,")&&final.Split(',').Length-1>=3,"the boss wave carries at least three escort kinds on "+l);Check(CarrotData.Waves[l-1][CarrotData.Waves[l-1].Length-3].Contains("swarm:"),"the swarm surge sits two waves before the boss on "+l);}
   float[] gaps={1f,.95f,.9f,.85f,.8f,.78f};for(int l=1;l<=24;l++){int c=(l-1)/4,p=(l-1)%4;Check(CarrotData.GapScale(l)>=gaps[c]-.001f&&CarrotData.GapScale(l)<=gaps[c]+.151f,"gap scale by chapter (plus at most three fallback steps) on "+l);Check(Mathf.Abs(CarrotData.PacketOverlap(l)-(p>=2&&l>=5?.85f:1f))<.001f,"packet overlap on "+l);Check(Mathf.Abs(CarrotData.Breather(l)-(c<2?5:c==2?4:3))<.001f,"breather by chapter on "+l);}
   for(int l=1;l<=27;l++){Check(Mathf.Abs(CarrotData.OpeningScale(l,3)-1)<.0001f&&CarrotData.OpeningScale(l,1)<=1&&CarrotData.OpeningScale(l,2)>=CarrotData.OpeningScale(l,1),"the pass phases in by wave 3 on "+l);if(l<5)Check(Mathf.Abs(CarrotData.OpeningScale(l,1)-1)<.0001f,"chapter 0 has no opening grace "+l);else Check(Mathf.Abs(CarrotData.OpeningScale(l,1)*CarrotData.HPScale(l)-(l<=24?OldHPScale[l-1]:new float[]{2.15f,4.3f,5.635f}[l-25]))<.01f,"wave 1 is played at the pre-pass health on "+l);}
   Pass2Shape();
   Check(Mathf.Abs(CarrotData.GapScale(25)-.95f)<.001f&&Mathf.Abs(CarrotData.GapScale(26)-.85f)<.001f&&Mathf.Abs(CarrotData.GapScale(27)-.8f)<.001f&&CarrotData.Breather(25)==5&&CarrotData.Breather(26)==4&&CarrotData.Breather(27)==3,"challenge cadence tables");
  }
  static readonly string[] Kinds={"nibble","dash","shell","swarm","moth","shaman","burrow","crystal","boss"};
  // Pass 2 (scripts/carrot-waves.mjs): opening caps, the smoothed first 60%, the derived ramp and the teaching waves.
  static float WaveWork(string wave){float work=0;foreach(var packet in wave.Split(',')){var b=packet.Split(':');if(b[0]=="boss")continue;work+=BaseHp[b[0]]*int.Parse(b[1]);}return work;}
  static void Pass2Shape(){
   Check(CarrotData.GeneratedStep==6,"the shipped waves carry every pass-2 step");
   for(int l=1;l<=28;l++){var waves=CarrotData.Waves[l-1];
    for(int w=0;w<2&&w<waves.Length;w++)foreach(var packet in waves[w].Split(',')){var b=packet.Split(':');int n=int.Parse(b[1]);
     if(b[0]=="swarm")Check(n<=(l<=4?8:12),"opening swarm cap on "+l+" wave "+(w+1)+" ("+n+")");
     if(CarrotData.Traits(b[0]).air&&!CarrotData.Traits(b[0]).mini)Check(n<=(l>=13&&l<=24?5:10),"opening air cap on "+l+" wave "+(w+1)+" ("+b[0]+":"+n+")");}
    if(l<=24){int W=waves.Length,E=waves[W-1].Contains("boss:")?W-1:W,S=Mathf.Min(E,Mathf.CeilToInt(.6f*W));
     for(int w=2;w<S;w++)Check(WaveWork(waves[w])<=1.35f*WaveWork(waves[w-1])+1,"no early cliff: wave "+(w+1)+" of "+l+" within 1.35x the wave before");}
    for(int w=1;w<=waves.Length;w++){float r=CarrotData.WaveRamp(l,w,false);Check(r>=.4f&&r<=2.7f,"ramp entry in range on "+l+" wave "+w+" ("+r+")");if(w<=2)Check(r*CarrotData.PressureScale(l)<=1.001f,"waves 1-2 teach: never above pass-1 health on "+l+" wave "+w);}}
   foreach(var line in CarrotData.Waves[2][0].Split(','))if(line.StartsWith("swarm:"))Check(int.Parse(line.Substring(6))<=8,"L3 wave 1 swarm is at most 8");
   Check(CarrotData.WaveRamp(29,1,false)==1,"Asuna's encounter is not ramped");
  }
  static void Shopping(){
   var g=New(12);g.coins=100000;
   foreach(var d in CarrotData.Towers){int pad=FreePad(g);g.Select("pad",pad);int before=g.coins;g.Command("{\"type\":\"buy\",\"kind\":\""+d.id+"\"}");var t=g.towers.Find(x=>x.pad==pad);Check(t!=null&&t.tier==1,"purchase "+d.id);int spent=d.cost[0];Check(g.coins==before-spent,"buy cost "+d.id);
    for(int tier=2;tier<=4;tier++){g.Command("{\"type\":\"upgrade\"}");spent+=d.cost[tier-1];Check(t.tier==tier&&t.spent==spent&&g.coins==before-spent,"upgrade "+d.id+" "+tier);}
    int atMax=g.coins;g.Command("{\"type\":\"upgrade\"}");Check(g.coins==atMax&&t.tier==4,"no paid fifth tier "+d.id);g.Command("{\"type\":\"sell\"}");Check(g.coins==before-spent+Mathf.FloorToInt(spent*.7f)&&!g.towers.Contains(t),"correct sell "+d.id);
   }
   // Merge arithmetic: two fully grown Seeds (465 each) become one Super holding 930 spent; coins do not move; selling returns floor(930 x .7) = 651.
   var a=Grow(g,"seed");var b=Grow(g,"seed");int coins=g.coins;Check(a.spent==465&&b.spent==465,"two grown seeds cost 465 each");
   g.Command("{\"type\":\"merge\",\"id\":"+b.id+",\"target\":"+a.id+"}");Check(a.tier==5&&a.spent==930&&a.mergedSpent==465&&!g.towers.Contains(b)&&g.coins==coins,"merge keeps the target, sums spent and moves no coins");
   g.Command("{\"type\":\"upgrade\"}");Check(a.tier==5&&g.coins==coins,"no paid upgrade past Super");
   g.Select("tower",a.id);g.Command("{\"type\":\"sell\"}");Check(g.coins==coins+651&&!g.towers.Contains(a),"selling a Super refunds the combined spend (651)");
   g.LoadLevel(1);int p=FreePad(g);g.Select("pad",p);g.Command("{\"type\":\"buy\",\"kind\":\"thunder\"}");Check(g.towers.Count==0&&g.coins==240,"locked purchase rejected");
   g.coins=0;g.Command("{\"type\":\"buy\",\"kind\":\"seed\"}");Check(g.towers.Count==0&&g.coins==0,"unaffordable purchase rejected");
   g.Select("pad",g.blockers[0].pad);g.coins=240;g.Command("{\"type\":\"buy\",\"kind\":\"seed\"}");Check(g.towers.Count==0,"occupied pad rejected");Done(g);
  }
  static TowerState Grow(CarrotGame g,string kind,int tier=4){int pad=FreePad(g);g.Select("pad",pad);g.Command("{\"type\":\"buy\",\"kind\":\""+kind+"\"}");var t=g.towers.Find(x=>x.pad==pad);for(int i=1;i<tier;i++)g.Command("{\"type\":\"upgrade\"}");Check(t!=null&&t.tier==tier,"grown "+kind);return t;}
  static int FreePad(CarrotGame g){for(int i=0;i<g.level.pads.Length;i++)if(!g.towers.Exists(t=>t.pad==i)&&!g.blockers.Exists(b=>b.pad==i))return i;return -1;}
  static void ContactsAndOutcomes(){
   foreach(int hearts in new[]{1,2}){var g=New(1);g.phase="playing";g.TestClearScheduled();g.health=hearts;var e=g.TestSpawn("nibble",0,CarrotData.RouteLength(g.level.routes[0])-.01f);g.StepSimulation(1);Check(g.health==hearts-1&&g.CarrotContacts==1,"one contact one health");Check(g.phase==(hearts==1?"lost":"won"),"last contact outcome precedence");g.StepSimulation(3);Check(g.CarrotContacts==1,"no repeated contact");Done(g);}
   var boss=New(4);boss.phase="playing";boss.TestClearScheduled();boss.TestSpawn("boss",0,CarrotData.RouteLength(boss.level.routes[0])-.01f,true);boss.StepSimulation(1);Check(boss.health==7&&boss.CarrotContacts==1&&boss.phase=="won","boss arrival deals three once");Done(boss);
   var paused=New(1);paused.Command("{\"type\":\"start\"}");paused.StepSimulation(1);float elapsed=paused.elapsed;paused.Command("{\"type\":\"pause\"}");paused.StepSimulation(5);Check(paused.elapsed==elapsed,"pause freezes game timers");paused.Command("{\"type\":\"pause\"}");paused.StepSimulation(1);Check(paused.elapsed>elapsed,"resume continues timers");paused.Command("{\"type\":\"speed\",\"value\":2}");Check(paused.speed==2,"two-times mode accepted");Done(paused);
  }
  static void QuietTowers(CarrotGame g){int i=0;foreach(var p in g.level.pads)g.towers.Add(new TowerState{id=10000+i++,pad=i-1,kind="seed",position=p,tier=1,cooldown=1000,builtAt=-5,spent=80});}
  static void Still(EnemyState e){e.slowFactor=0;e.slowUntil=1e9f;}
  static List<string> Casts(CarrotGame g,int id,string type="ability"){var list=new List<string>();g.Effect+=e=>{if(e.id==id&&e.type==type)list.Add(e.kind);};return list;}
  static void Bosses(){
   var garden=New(4);garden.phase="playing";garden.TestClearScheduled();QuietTowers(garden);var b=garden.TestSpawn("boss",0,0,true);Check(Mathf.Abs(b.maxHp-2600)<.01f,"Brambleback carries 2,600 HP");b.hp=b.maxHp*.5f;garden.StepSimulation(15);Check(garden.blockers.Exists(x=>x.ownerEnemy==b.id),"root creates real focusable weakpoint");Check(garden.towers.Exists(x=>x.slowFor>0),"root slows real towers");var knot=garden.blockers.Find(x=>x.ownerEnemy==b.id);garden.TestDamageScenery(knot.id,100);Check(!garden.towers.Exists(x=>x.slowFor>0),"breaking root releases snare");Done(garden);
   var marsh=New(8);marsh.phase="playing";marsh.TestClearScheduled();var m=marsh.TestSpawn("boss",0,0,true);Check(Mathf.Abs(m.maxHp-5000)<.01f,"Lantern Regent carries 5,000 HP");m.hp=m.maxHp*.5f;marsh.StepSimulation(18);Check(marsh.enemies.Exists(x=>x.summoned&&x.alive),"marsh summons real finite enemies");marsh.TestDamage(m.id,100000);marsh.StepSimulation(.1f);Check(marsh.phase=="playing","boss death with living adds is not victory");foreach(var add in marsh.enemies.ToArray())if(add.alive)marsh.TestDamage(add.id,100000);marsh.StepSimulation(.2f);Check(marsh.phase=="won"&&marsh.PendingSummons==0,"victory waits for summons");Done(marsh);
   var frost=New(12);frost.phase="playing";frost.TestClearScheduled();QuietTowers(frost);var f=frost.TestSpawn("boss",0,0,true);var frostCasts=Casts(frost,f.id);Check(Mathf.Abs(f.maxHp-8200)<.01f,"Crown of Winter carries 8,200 HP");f.hp=f.maxHp*.5f;frost.StepSimulation(8);Check(f.shield==360,"mantle grants exact shield");float hp=f.hp;frost.TestDamage(f.id,100,"prism");Check(Mathf.Abs(f.shield-260)<.01f&&Mathf.Abs(f.hp-(hp-25))<.01f,"prism damages shield with health bypass");frost.StepSimulation(12);Check(frostCasts.Contains("breath")&&frost.towers.Exists(x=>x.disabledFor>0||frostCasts.Contains("breath")),"breath affects real tower cadence by 20 s");f.hp=f.maxHp*.25f;frost.StepSimulation(8);Check(f.shield==0&&frost.enemies.Exists(x=>x.kind=="fragment"&&x.summoned),"last phase trades shield for finite shards");Done(frost);
   // Brambleback returns on level 16 scaled from its home level and still casts bark and root.
   var cider=New(16);cider.phase="playing";cider.TestClearScheduled();QuietTowers(cider);var back=cider.TestSpawn("boss",0,0,true);var backCasts=new List<string>();cider.Effect+=e=>{if(e.type=="ability"&&e.id==back.id)backCasts.Add(e.kind);};
   Check(back.boss=="garden"&&Mathf.Abs(back.maxHp-2600*CarrotData.BossScale(16,"garden"))<.01f&&back.maxHp>2600*2.5f,"returning Brambleback scales from its home level");
   back.hp=back.maxHp*.5f;cider.StepSimulation(15);Check(backCasts.Contains("bark")&&backCasts.Contains("root")&&cider.blockers.Exists(x=>x.ownerEnemy==back.id)&&cider.towers.Exists(x=>x.slowFor>0),"returning Brambleback still casts bark and roots real towers");Done(cider);
   // Old Hollowhead: Harvest Rush, Flock and Straw Heap through the shared telegraph/ability path.
   var field=New(20);field.phase="playing";field.TestClearScheduled();QuietTowers(field);var h=field.TestSpawn("boss",0,0,true);var casts=new List<string>();field.Effect+=e=>{if(e.id==h.id&&(e.type=="ability"||e.type=="telegraph"))casts.Add(e.type+":"+e.kind);};
   Check(h.boss=="orchard"&&Mathf.Abs(h.maxHp-10500)<.01f&&CarrotData.BossName(h.boss)=="Old Hollowhead","Old Hollowhead spawns with its authored health");
   field.StepSimulation(7.1f);var rallied=Durable(field,"nibble",h.distance+.5f);field.StepSimulation(.2f);
   Check(casts.Contains("telegraph:rush")&&casts.Contains("ability:rush"),"harvest rush is telegraphed then committed");
   Check(h.speed>.34f*CarrotData.MovementScale*2&&rallied.speed>.9f*CarrotData.MovementScale*1.4f,"rush more than doubles the boss and rallies an ally within three units");
   field.StepSimulation(2.6f);Check(Mathf.Abs(h.speed-.34f*CarrotData.MovementScale)<.01f&&Mathf.Abs(rallied.speed-.9f*CarrotData.MovementScale)<.01f,"rush ends after 2.5 s");
   h.hp=h.maxHp*.5f;field.StepSimulation(1.9f);Check(h.phase==2&&h.ability=="flock"&&field.PendingSummons==3,"flock reserves three summons during its windup");
   field.StepSimulation(.8f);Check(field.enemies.FindAll(x=>x.kind=="moth"&&x.summoned&&x.air&&x.alive).Count==3&&field.PendingSummons==0,"flock spawns exactly three summoned air moths and releases the reservation");
   field.StepSimulation(1.2f);Check(h.hidden&&casts.Contains("ability:heap"),"straw heap hides the boss after its 1.2 s telegraph floor");float heapHp=h.hp;field.TestDamage(h.id,500);Check(h.hp==heapHp,"a heaped boss takes no damage");
   field.StepSimulation(2.1f);Check(!h.hidden&&casts.Contains("ability:emerge"),"straw heap ends after two seconds");
   field.TestDamage(h.id,100000);field.StepSimulation(.1f);Check(field.phase=="playing","Hollowhead death with living flock adds is not victory");foreach(var add in field.enemies.ToArray())if(add.alive)field.TestDamage(add.id,100000);field.StepSimulation(.2f);Check(field.phase=="won"&&field.PendingSummons==0,"victory waits for the flock");Done(field);
   var near=New(20);near.phase="playing";near.TestClearScheduled();QuietTowers(near);var hn=near.TestSpawn("boss",0,0,true);var nearCasts=new List<string>();near.Effect+=e=>{if(e.type=="ability"&&e.id==hn.id)nearCasts.Add(e.kind);};
   near.StepSimulation(13.5f);Check(hn.hidden,"first-phase straw heap follows the rush");hn.distance=hn.routeLength-1.9f;near.StepSimulation(.1f);Check(!hn.hidden&&nearCasts.Contains("emerge"),"a heaped boss reappears within two units of the carrot");Done(near);
   var last=New(20);last.phase="playing";last.TestClearScheduled();QuietTowers(last);var hl=last.TestSpawn("boss",0,0,true);var lastCasts=new List<string>();last.Effect+=e=>{if(e.type=="ability"&&e.id==hl.id)lastCasts.Add(e.kind);};
   last.StepSimulation(12.3f);Check(hl.ability=="heap"&&hl.castRemaining>0,"straw heap windup in progress");hl.hp=hl.maxHp*.25f;last.StepSimulation(.1f);Check(hl.phase==3&&hl.castRemaining==0&&!hl.hidden,"phase 3 cancels a pending straw heap");
   last.StepSimulation(1.5f);Check(!hl.hidden&&!lastCasts.Contains("heap")&&Mathf.Abs(hl.speed-.46f*CarrotData.MovementScale)<.02f,"phase 3 drops the heap and walks at .46");Done(last);
  }
  static CarrotGame Arena(int level=12){var g=New(level);g.phase="playing";g.TestClearScheduled();return g;}
  static void PresentationEvents(){
   foreach(var spec in new[]{new{level=4,kind="root",count=2,start=11f,span=2f},new{level=12,kind="breath",count=3,start=11f,span=2f},new{level=4,kind="uproot",count=1,start=17f,span=4f}}){
    string kind=spec.kind;int count=spec.count;
    var g=New(spec.level);g.phase="playing";g.TestClearScheduled();var boss=g.TestSpawn("boss",0,5,true);boss.hp=boss.maxHp*.5f;
    int towers=kind=="uproot"?3:count;for(int i=0;i<towers;i++){var tower=TestTower(g,"seed",boss.position+new Vector3(0,0,1+i*.3f));tower.cooldown=1000;}
    var warnings=new List<CarrotEvent>();var commits=new List<CarrotEvent>();int sourceWarnings=0,sourceCommits=0;
    g.Effect+=e=>{if(e.kind!=kind)return;if(e.type=="telegraph"||e.type=="telegraphTarget"){warnings.Add(e);if(e.type=="telegraph")sourceWarnings++;}if(e.type=="ability"||e.type=="abilityTarget"){commits.Add(e);if(e.type=="ability")sourceCommits++;}};
    g.elapsed=spec.start;var before=new List<int>();foreach(var t in g.towers)before.Add(t.id);g.StepSimulation(spec.span);
    Check(warnings.Count==count&&commits.Count==count,"every locked "+kind+" target receives warning and contact ("+warnings.Count+"/"+commits.Count+")");
    Check(sourceWarnings==1&&sourceCommits==1,"one source cue per "+kind+" cast");
    var warned=new HashSet<int>();foreach(var e in warnings){warned.Add(e.target);Vector3 at=Vector3.zero;bool known=false;int index=before.IndexOf(e.target);if(index>=0){known=true;at=g.level.pads[0];}var tower=g.towers.Find(t=>t.id==e.target);if(tower!=null)at=tower.position;Check(known&&(tower==null||(tower.position-e.to).sqrMagnitude<.001f)&&e.duration>=1.2f,"actual target and readable windup "+kind);}
    Check(warned.Count==count,"distinct locked warning targets "+kind);foreach(var e in commits)Check(warned.Contains(e.target),"no unannounced committed target "+kind);
    if(kind=="uproot")Check(g.towers.Count==2&&!g.towers.Exists(t=>t.id==commits[0].target),"the warned tower is the one torn out");
    Done(g);
   }
   var wave=New(1);Vector3 warnedEntrance=Vector3.zero;wave.Effect+=e=>{if(e.type=="wave")warnedEntrance=e.position;};wave.Command("{\"type\":\"start\"}");wave.StepSimulation(.7f);Check(wave.enemies.Count>0&&(warnedEntrance-wave.level.routes[wave.enemies[0].route][0]).sqrMagnitude<.001f,"wave entrance matches first actual spawn");Done(wave);
   var bars=Arena();var normal=Durable(bars);Check(bars.Snapshot().Contains("\"visible\":true"),"unhurt distant visible monster has an HP bar");normal.hidden=true;Check(!bars.Snapshot().Contains("\"visible\":true"),"burrowing monster does not reveal its hidden HP position");Done(bars);
   var many=Arena();for(int i=0;i<40;i++)Durable(many,distance:3+i*.2f);many.TestDamage(many.enemies[0].id,10);string crowd=many.Snapshot();int bars2=crowd.Split(new[]{"\"visible\""},StringSplitOptions.None).Length-1;Check(bars2==25,"HP bars cap at the 24 nearest plus every hurt monster ("+bars2+")");Done(many);
   foreach(string kind in new[]{"starfruit","thunder"}){
    var g=Arena();for(int i=0;i<5;i++)Durable(g,distance:5+i*.15f);var focused=g.enemies[0];g.Select("enemy",focused.id);TestTower(g,kind,focused.position+new Vector3(0,0,1));
    var launched=new HashSet<int>();g.Effect+=e=>{if(e.type=="shot"&&e.kind==kind)launched.Add(e.target);};g.StepSimulation(.1f);
    Check(launched.Count==3&&launched.Contains(focused.id),kind+" includes the selected enemy among three distinct targets");g.StepSimulation(.7f);
    Check(focused.hp<focused.maxHp&&g.enemies.FindAll(e=>e.hp<e.maxHp).Count==3,kind+" focus resolves damage on exactly three real targets");Done(g);
   }
  }
  static float NearestOnRoute(CarrotGame g,Vector3 p){var route=g.level.routes[0];float len=CarrotData.RouteLength(route),best=float.MaxValue,at=0;for(float d=0;d<=len;d+=.05f){Vector3 dir;float dist=Vector3.Distance(CarrotData.RoutePoint(route,d,out dir),p);if(dist<best){best=dist;at=d;}}return at;}
  static EnemyState Durable(CarrotGame g,string kind="nibble",float distance=5){var e=g.TestSpawn(kind,0,distance);e.hp=e.maxHp=10000;return e;}
  static TowerState TestTower(CarrotGame g,string kind,Vector3 at,int tier=1,int pad=-1){var t=new TowerState{id=9000+g.towers.Count,kind=kind,position=at,tier=tier,builtAt=-5,pad=pad>=0?pad:g.towers.Count,spent=CarrotData.Tower(kind).cost[0]};g.towers.Add(t);return t;}
  static void Powers(){
   var seed=Arena();var a=Durable(seed);var b=Durable(seed,distance:5.5f);float hp=a.hp;
   for(int i=0;i<3;i++)seed.TestFire("seed",1,a.id,a.position+Vector3.up);
   Check(hp-a.hp>3*CarrotData.Tower("seed").damage[0]&&b.hp<b.maxHp,"seed marks produce a damaging burst and ricochet");Done(seed);
   var frost=Arena();var f=Durable(frost);int frozen=0;frost.Effect+=e=>{if(e.kind=="crystallize")frozen++;};
   frost.TestFire("frost",4,f.id,f.position);frost.StepSimulation(.1f);Check(f.speed==0&&f.slowFactor>=.5f,"frost briefly freezes with bounded slow");
   for(int i=0;i<5;i++){frost.StepSimulation(.2f);frost.TestFire("frost",4,f.id,f.position);}
   Check(frozen==1&&f.speed>0,"repeated frost cannot create permanent freeze");Done(frost);
   var mortar=Arena();var m=Durable(mortar);var fly=Durable(mortar,"moth");mortar.TestFire("mortar",4,m.id,m.position);float after=m.hp;mortar.StepSimulation(1);
   Check(m.hp<after&&fly.hp==fly.maxHp,"mortar burning ground persists and leaves air untouched");Done(mortar);
   var prism=Arena();var p=Durable(prism,"crystal");float before=p.hp,shield=p.shield;prism.TestFire("prism",1,p.id,p.position);
   Check(p.shield<shield&&p.hp<before,"prism pierces a live shield");var pt=TestTower(prism,"prism",p.position+new Vector3(0,0,1));var ramp=new List<float>();prism.Effect+=e=>{if(e.type=="ability"&&e.kind=="prismFocus")ramp.Add(e.value);};for(int i=0;i<5;i++){pt.cooldown=0;prism.StepSimulation(.25f);}Check(ramp.Count>=4&&ramp[ramp.Count-1]>ramp[0],"prism focus ramps on the same real enemy");Done(prism);
   var storm=Arena();var sa=Durable(storm);var sb=Durable(storm,distance:5.3f);var sc=Durable(storm,distance:5.6f);storm.TestFire("storm",1,sa.id,sa.position);
   Check(sa.hp<sa.maxHp&&sb.hp<sb.maxHp&&sc.hp<sc.maxHp,"storm damages three different chained enemies");float sh=sa.hp;storm.TestFire("thunder",1,sa.id,sa.position);Check(sh-sa.hp>CarrotData.Tower("thunder").damage[0],"conductive mark increases thunder damage");Done(storm);
   var blossom=Arena();var ba=Durable(blossom);var ally=TestTower(blossom,"seed",ba.position+new Vector3(.5f,0,0));ally.cooldown=100;blossom.TestFire("blossom",4,ba.id,ba.position);blossom.StepSimulation(.05f);
   Check(ally.buff>=.19f&&ba.hp<ba.maxHp,"sun blossom harms enemies and gives a real cadence aura");Done(blossom);
   var stars=Arena();for(int i=0;i<6;i++)Durable(stars,distance:5+i*.05f);TestTower(stars,"starfruit",stars.enemies[0].position+new Vector3(0,0,1));stars.StepSimulation(.8f);
   Check(stars.enemies.FindAll(e=>e.hp<e.maxHp).Count==3&&stars.enemies.Exists(e=>e.maxHp-e.hp>=CarrotData.Tower("starfruit").damage[0]*1.49f),"base starfruit strikes three targets with returning damage");Done(stars);
   var gravity=Arena();var ga=Durable(gravity);var gb=Durable(gravity,distance:5.4f);float gd=gb.distance;gravity.TestFire("gravity",4,ga.id,ga.position);Check(gb.distance<gd&&gb.hp<gb.maxHp,"black hole damages and pulls nearby route positions backward");float once=gb.distance;gravity.TestFire("gravity",4,ga.id,ga.position);Check(gb.distance==once,"black-hole displacement respects per-enemy cooldown");Done(gravity);
   var book=Arena();var bk=Durable(book);float start=bk.distance;book.TestFire("book",1,bk.id,bk.position);book.StepSimulation(.5f);float reverse=bk.distance;
   Check(reverse<start,"spellbook reverses actual movement along the route");book.StepSimulation(1);Check(bk.distance>reverse,"spellbook resumes forward movement");for(int i=0;i<10;i++){book.TestFire("book",1,bk.id,bk.position);book.StepSimulation(.2f);}Check(bk.distance>start,"spellbook cooldown prevents rewind lock");Done(book);
   var thunder=Arena();for(int i=0;i<5;i++)Durable(thunder,distance:5+i*.05f);TestTower(thunder,"thunder",thunder.enemies[0].position+new Vector3(0,0,1));thunder.StepSimulation(1);
   Check(thunder.enemies.FindAll(e=>e.maxHp-e.hp>=CarrotData.Tower("thunder").damage[0]-.01f).Count==3,"thunder charges and damages three distinct targets");Done(thunder);
  }
  // The merge contract: rejections, the single merge event, the undo window and the snapshot fields.
  static void Super(){
   var g=New(12);g.coins=100000;var merges=new List<CarrotEvent>();g.Effect+=e=>{if(e.type=="merge"||e.type=="mergeUndo")merges.Add(e);};
   var seedA=Grow(g,"seed");var seedB=Grow(g,"seed");var frost=Grow(g,"frost");var young=Grow(g,"seed",3);int coins=g.coins,count=g.towers.Count;
   g.Command("{\"type\":\"merge\",\"id\":"+frost.id+",\"target\":"+seedA.id+"}");Check(g.towers.Count==count&&seedA.tier==4&&frost.tier==4&&g.coins==coins&&g.notice=="Only two fully grown Frosts can merge","mixed kinds are rejected with a notice");
   g.Command("{\"type\":\"merge\",\"id\":"+young.id+",\"target\":"+seedA.id+"}");Check(g.towers.Count==count&&seedA.tier==4&&young.tier==3&&g.notice=="Only two fully grown Seeds can merge","a tier-3 partner is rejected with a notice");
   g.notice="";g.Command("{\"type\":\"merge\",\"id\":"+seedA.id+",\"target\":"+seedA.id+"}");Check(g.towers.Count==count&&seedA.tier==4&&g.notice=="","a drop on itself is silent");
   Check(merges.Count==0,"rejections emit no merge event");
   g.Select("tower",seedA.id);Check(g.Snapshot().Contains("\"partners\":1")&&g.Snapshot().Contains("\"superPairs\":1"),"snapshot reports partners and pairs");
   int spentA=seedA.spent,spentB=seedB.spent,padB=seedB.pad,idB=seedB.id;
   g.Command("{\"type\":\"merge\",\"id\":"+seedB.id+",\"target\":"+seedA.id+"}");
   Check(merges.Count==1&&merges[0].type=="merge"&&merges[0].id==seedA.id&&merges[0].target==idB&&merges[0].tier==5&&merges[0].kind=="seed","exactly one merge event naming target and source");
   Check(seedA.tier==5&&seedA.spent==spentA+spentB&&seedA.mergedSpent==spentB&&!g.towers.Exists(t=>t.id==idB)&&g.coins==coins&&g.selectionId==seedA.id&&g.notice=="Harvest Cannon","merge forges the Super on the target pad");
   string snap=g.Snapshot();Check(snap.Contains("\"tier\":5")&&snap.Contains("\"superName\":\"Harvest Cannon\"")&&snap.Contains("\"spent\":"+(spentA+spentB))&&snap.Contains("\"superPairs\":0")&&snap.Contains("\"mergeUndo\":"),"snapshot shows the Super, its spend and the undo window");
   g.Command("{\"type\":\"mergeUndo\"}");Check(merges.Count==2&&merges[1].type=="mergeUndo"&&seedA.tier==4&&seedA.spent==spentA&&seedA.mergedSpent==0,"undo returns the target to tier 4");
   var restored=g.towers.Find(t=>t.id==idB);Check(restored!=null&&restored.pad==padB&&restored.spent==spentB&&restored.tier==4&&g.towers.Count==count,"undo restores the source with its id, pad and spend");
   // No undo after the Super has fired.
   g.Command("{\"type\":\"merge\",\"id\":"+idB+",\"target\":"+seedA.id+"}");Check(seedA.tier==5,"second merge");g.phase="playing";g.TestClearScheduled();var e=Durable(g,"nibble",NearestOnRoute(g,seedA.position));Still(e);Check(Vector3.Distance(e.position,seedA.position)<=3.6f,"an enemy stands within the Super's range");g.StepSimulation(1);
   Check(seedA.lastShot>0,"the Super fired");g.Command("{\"type\":\"mergeUndo\"}");Check(seedA.tier==5&&!g.towers.Exists(t=>t.id==idB),"undo refused after a shot");
   // Phase won/lost: silent rejection.
   var c=Grow(g,"frost");g.phase="won";int before=g.towers.Count;g.Command("{\"type\":\"merge\",\"id\":"+c.id+",\"target\":"+frost.id+"}");Check(g.towers.Count==before&&frost.tier==4&&c.tier==4,"no merge after the outcome");Done(g);
   // The undo window closes after four seconds of game time.
   var w=New(12);w.coins=100000;var x=Grow(w,"prism");var y=Grow(w,"prism");w.phase="playing";w.TestClearScheduled();w.Command("{\"type\":\"merge\",\"id\":"+y.id+",\"target\":"+x.id+"}");w.StepSimulation(4.2f);w.Command("{\"type\":\"mergeUndo\"}");Check(x.tier==5,"undo expires after four seconds");Done(w);
   // Tap-tap arming is cleared by a selection.
   var arm=New(12);arm.coins=100000;var s1=Grow(arm,"seed");var s2=Grow(arm,"seed");arm.Command("{\"type\":\"mergeArm\",\"id\":"+s1.id+"}");Check(arm.mergeArmed==s1.id,"mergeArm arms a tower with a partner");arm.Select("pad",FreePad(arm));Check(arm.mergeArmed==0,"selection disarms");var lone=Grow(arm,"book");arm.Command("{\"type\":\"mergeArm\",\"id\":"+lone.id+"}");Check(arm.mergeArmed==0,"a tower without a partner never arms");Done(arm);
  }
  static void SuperPowers(){
   var seed=Arena();var a=Durable(seed);var b=Durable(seed,distance:5.4f);TestTower(seed,"seed",a.position+new Vector3(0,0,1),5);seed.StepSimulation(.8f);Check(a.hp<a.maxHp&&b.hp<b.maxHp,"Harvest Cannon fires at a second target");Done(seed);
   var frost=Arena();var f=Durable(frost);frost.TestFire("frost",5,f.id,f.position);frost.StepSimulation(.9f);Check(f.speed==0&&Mathf.Abs(f.slowFactor-.5f)<.001f,"Glacier Bloom freezes a full second with a 50% slow");frost.StepSimulation(.2f);Check(f.speed>0,"the freeze ends");Done(frost);
   var mortar=Arena();var m=Durable(mortar);var m2=Durable(mortar,distance:5.9f);mortar.TestFire("mortar",5,m.id,m.position);float after=m.hp;Check(m2.hp<m2.maxHp,"Pumpkin Howitzer's 1.5 u blast reaches a neighbour");mortar.StepSimulation(1.5f);float mid=m.hp;Check(mid<after,"burn ticks");mortar.StepSimulation(.4f);Check(m.hp<mid,"burn still ticking late in its window");Done(mortar);
   var prism=Arena();var p=Durable(prism);var pt=TestTower(prism,"prism",p.position+new Vector3(0,0,1),5);var ramp=new List<float>();prism.Effect+=e=>{if(e.type=="ability"&&e.kind=="prismFocus")ramp.Add(e.value);};for(int i=0;i<6;i++){pt.cooldown=0;prism.StepSimulation(.1f);}Check(ramp.Count>=5&&Mathf.Abs(ramp[ramp.Count-1]-.8f)<.001f,"Sunfocus Crystal ramps to +80%");Done(prism);
   var storm=Arena();for(int i=0;i<8;i++)Durable(storm,distance:5+i*.3f);storm.TestFire("storm",5,storm.enemies[0].id,storm.enemies[0].position);Check(storm.enemies.FindAll(e=>e.hp<e.maxHp).Count==6,"Tempest Bell chains across six enemies");Done(storm);
   var blossom=Arena();var ba=Durable(blossom);var moth=Durable(blossom,"moth",5.2f);var ally=TestTower(blossom,"seed",ba.position+new Vector3(.5f,0,0));ally.cooldown=100;blossom.TestFire("blossom",5,ba.id,ba.position);blossom.StepSimulation(.05f);Check(ally.buff>=.29f&&moth.hp==moth.maxHp&&ba.hp<ba.maxHp,"Solar Blossom gives a .3 aura and stays ground-only");blossom.StepSimulation(3.5f);Check(ally.buff>=.29f,"the Super aura holds four seconds");Done(blossom);
   var stars=Arena();for(int i=0;i<8;i++)Durable(stars,distance:5+i*.05f);TestTower(stars,"starfruit",stars.enemies[0].position+new Vector3(0,0,1),5);var shot=new HashSet<int>();stars.Effect+=e=>{if(e.type=="shot"&&e.kind=="starfruit")shot.Add(e.target);};stars.StepSimulation(.1f);Check(shot.Count==7,"Constellation launches at seven targets");Done(stars);
   var gravity=Arena();var ga=Durable(gravity);var gb=Durable(gravity,distance:5.4f);var boss=gravity.TestSpawn("boss",0,5.6f,true);float gd=gb.distance,bd=boss.distance;gravity.TestFire("gravity",5,ga.id,ga.position);Check(Mathf.Abs((gd-gb.distance)-1)<.001f&&boss.distance==bd,"Event Horizon pulls an ordinary enemy a full unit and never a boss");Done(gravity);
   var book=Arena();var bk=Durable(book);var bk2=Durable(book,distance:5.5f);float s1=bk.distance,s2=bk2.distance;book.TestFire("book",5,bk.id,bk.position);book.StepSimulation(.5f);Check(bk.distance<s1&&bk2.distance<s2,"Grimoire rewinds the target and its nearest neighbour");Done(book);
   var thunder=Arena();for(int i=0;i<5;i++)Durable(thunder,distance:5+i*.05f);TestTower(thunder,"thunder",thunder.enemies[0].position+new Vector3(0,0,1),5);thunder.StepSimulation(1);Check(thunder.enemies.FindAll(e=>e.maxHp-e.hp>=CarrotData.Tower("thunder").damage[0]-.01f).Count==4,"Stormcrown strikes four targets");Done(thunder);
  }
  // Rule B: a Super equals roughly two tier-4s on one pad (trait-inclusive), never more than 1.08x the pair; measured as total damage over 20 s against eight stationary targets with one helper Seed beside it.
  static float BudgetDamage(string kind,bool super){
   var g=Arena();Vector3 at=Vector3.zero;var targets=new List<EnemyState>();
   for(int i=0;i<8;i++){var e=Durable(g,distance:5+i*.1f);Still(e);targets.Add(e);if(i==0)at=e.position+new Vector3(0,0,1);}
   if(super)TestTower(g,kind,at,5);else{TestTower(g,kind,at,4);TestTower(g,kind,at,4);}
   TestTower(g,"seed",at+new Vector3(.3f,0,0),4);
   g.StepSimulation(20);float total=0;foreach(var e in targets)total+=e.maxHp-e.hp;Done(g);return total;
  }
  static void SuperBudget(){
   foreach(var d in CarrotData.Towers){float pair=BudgetDamage(d.id,false),one=BudgetDamage(d.id,true);float ratio=one/Mathf.Max(1,pair);
    Debug.Log("CARROT_SUPER_BUDGET kind="+d.id+" super="+one.ToString("F0")+" pair="+pair.ToString("F0")+" ratio="+ratio.ToString("F3"));
    Check(ratio<=1.08f&&ratio>=.75f,"Super "+d.id+" throughput within 0.75-1.08x two tier-4s (ratio "+ratio.ToString("F3")+")");}
  }
  static float BlindLeft(CarrotGame g){string s=g.Snapshot();int i=s.IndexOf("\"blind\":")+8;int j=i;while(j<s.Length&&(char.IsDigit(s[j])||s[j]=='.'||s[j]=='-'||s[j]=='e'||s[j]=='E'))j++;return float.Parse(s.Substring(i,j-i),System.Globalization.CultureInfo.InvariantCulture);}
  static void Blindness(){
   var g=New(8);g.phase="playing";g.TestClearScheduled();g.coins=1000;var boss=g.TestSpawn("boss",0,0,true);Still(boss);
   var casts=new List<string>();float warned=-1,dark=-1,warnDuration=0;g.Effect+=e=>{if(e.id!=boss.id)return;if(e.type=="telegraph"&&e.kind=="blind"){warned=g.elapsed;warnDuration=e.duration;}if(e.type=="ability"&&e.kind=="blind"){dark=g.elapsed;casts.Add(e.kind);}};
   var target=Durable(g,"nibble",5);Still(target);
   var unlit=TestTower(g,"seed",target.position+new Vector3(2.7f,0,0));var lit=TestTower(g,"seed",target.position+new Vector3(-2.7f,0,0));var prism=TestTower(g,"prism",target.position+new Vector3(0,0,3.96f));
   var shots=new Dictionary<int,int>();g.Effect+=e=>{if(e.type=="shot"){shots.TryGetValue(e.id,out int n);shots[e.id]=n+1;}};
   while(dark<0&&g.elapsed<30)g.StepSimulation(.1f);
   Check(dark>0&&warned>0&&Mathf.Abs(warnDuration-1.5f)<.01f&&Mathf.Abs(dark-warned-1.5f)<.15f,"Lantern Snuff is telegraphed 1.5 s before the dark");
   Check(shots.ContainsKey(unlit.id)&&shots[unlit.id]>0,"the unlit Seed fired at 90% range before the dark");
   Check(BlindLeft(g)>2.5f&&g.Snapshot().Contains("\"blindTint\":0"),"snapshot carries the remaining dark time and a black tint");
   shots.Clear();g.TestFire("blossom",4,target.id,lit.position);unlit.cooldown=lit.cooldown=prism.cooldown=0;g.StepSimulation(1);
   Check(!shots.ContainsKey(unlit.id),"an unlit Seed loses 40% range in the dark");Check(shots.ContainsKey(lit.id)&&shots[lit.id]>0,"a Blossom-lit Seed keeps hitting");Check(shots.ContainsKey(prism.id)&&shots[prism.id]>0,"a Prism keeps hitting");
   int pad=FreePad(g);int towers=g.towers.Count;g.Select("pad",pad);g.Command("{\"type\":\"buy\",\"kind\":\"seed\"}");Check(g.towers.Count==towers+1,"buying works in the dark");var bought=g.towers.Find(t=>t.pad==pad);g.Select("tower",bought.id);Check(g.selectionId==bought.id,"selecting works in the dark");g.Command("{\"type\":\"sell\"}");Check(g.towers.Count==towers,"selling works in the dark");
   g.StepSimulation(2.2f);Check(BlindLeft(g)==0&&!(g.Snapshot().Contains("\"blindAlpha\":0.985")),"the dark lifts after three seconds");shots.Clear();unlit.cooldown=0;g.StepSimulation(.5f);Check(shots.ContainsKey(unlit.id),"range returns after the dark");
   while(g.elapsed<dark+21.5f)g.StepSimulation(.5f);Check(casts.Count==1&&g.TestCasts(boss.id,"blind")==1,"no recast before 22 s");
   g.blindUntil=g.elapsed+5;g.TestDamage(boss.id,100000);g.TestDamage(target.id,100000);for(int cleanup=0;cleanup<10&&g.phase=="playing";cleanup++){foreach(var add in g.enemies.ToArray())if(add.alive)g.TestDamage(add.id,100000);g.StepSimulation(.25f);}Check(g.phase=="won"&&g.blindUntil==0,"the outcome clears any dark");Done(g);
  }
  static void Whiteout(){
   var g=New(12);g.phase="playing";g.TestClearScheduled();var boss=g.TestSpawn("boss",0,0,true);Still(boss);boss.hp=boss.maxHp*.5f;
   float warned=-1,committed=-1;g.Effect+=e=>{if(e.id!=boss.id)return;if(e.type=="telegraph"&&e.kind=="whiteout")warned=g.elapsed;if(e.type=="ability"&&e.kind=="whiteout")committed=g.elapsed;};
   var target=Durable(g,"nibble",8);Still(target);TowerState thunder=null;
   while(committed<0&&g.elapsed<40){g.StepSimulation(1f/30);if(warned>0&&thunder==null&&g.elapsed>=warned+1.3f-.25f){thunder=TestTower(g,"thunder",target.position+new Vector3(0,0,1),4);thunder.cooldown=0;}}
   Check(committed>0&&thunder!=null&&g.TestProjectiles>0,"a thunder bolt was in flight when the Whiteout landed");
   Check(g.TestLongestFlight>.95f,"projectiles in flight hang for 0.6 s");Check(g.blindTint==1&&BlindLeft(g)>2.3f&&g.blindAlpha>.8f,"Whiteout is a white 2.5 s vignette");Done(g);
  }
  static void Dusk(){
   var g=New(20);g.phase="playing";g.TestClearScheduled();var boss=g.TestSpawn("boss",0,0,true);Still(boss);var casts=Casts(g,boss.id);boss.hp=boss.maxHp*.25f;
   g.StepSimulation(2.5f);Check(casts.Contains("phase")&&boss.ability=="dusk"&&g.PendingSummons==3,"Dusk winds up two seconds into phase 3 with three crows reserved");
   g.StepSimulation(1.2f);Check(casts.FindAll(c=>c=="dusk").Count==1&&BlindLeft(g)>2.5f&&g.enemies.FindAll(e=>e.kind=="moth"&&e.summoned&&e.alive).Count==3&&g.PendingSummons==0,"Dusk darkens the field and summons three crows");
   g.TestDamage(boss.id,100000);g.StepSimulation(.1f);Check(g.phase=="playing","the crows block victory");foreach(var crow in g.enemies.ToArray())if(crow.alive)g.TestDamage(crow.id,100000);g.StepSimulation(.2f);Check(g.phase=="won","victory after the crows");
   Done(g);
   var once=New(20);once.phase="playing";once.TestClearScheduled();var h=once.TestSpawn("boss",0,0,true);Still(h);var dusks=Casts(once,h.id);h.hp=h.maxHp*.25f;once.StepSimulation(60);Check(dusks.FindAll(c=>c=="dusk").Count==1,"Dusk casts once");Done(once);
  }
  static CarrotGame UprootArena(int level,float hpFraction,out EnemyState boss,int towers,int superIndex=-1){
   var g=New(level);g.phase="playing";g.TestClearScheduled();boss=g.TestSpawn("boss",0,5,true);Still(boss);boss.hp=boss.maxHp*hpFraction;
   for(int i=0;i<towers;i++){var t=TestTower(g,"seed",boss.position+new Vector3(1+i*.6f,0,1),i==superIndex?5:1);t.cooldown=1000;t.spent=i==superIndex?930:80;if(i==superIndex)t.mergedSpent=465;}
   return g;}
  static void Uproot(){
   // Brambleback on level 4: a random tower within 4.5 u after a 2.5 s telegraph naming its id and position; refund 60%.
   int firstPick=-1;
   for(int run=0;run<2;run++){EnemyState boss;var g=UprootArena(4,.5f,out boss,3);var warnings=new List<CarrotEvent>();var commits=new List<CarrotEvent>();g.Effect+=e=>{if(e.kind!="uproot")return;if(e.type=="telegraph")warnings.Add(e);if(e.type=="ability")commits.Add(e);};
    int coins=g.coins;g.StepSimulation(17.5f);Check(warnings.Count==1&&commits.Count==0&&boss.ability=="uproot","Root-Tear telegraphs at 17 s");var target=g.towers.Find(t=>t.id==warnings[0].target);Check(target!=null&&(target.position-warnings[0].to).sqrMagnitude<.001f&&Mathf.Abs(warnings[0].duration-CarrotGame.ActionableWindup)<.01f,"the telegraph names the tower and its position with a 2.5 s windup");
    g.StepSimulation(2.5f);Check(commits.Count==1&&g.towers.Count==2&&!g.towers.Contains(target)&&commits[0].target==target.id,"exactly one tower within 4.5 u is torn out");Check(g.coins==coins+Mathf.FloorToInt(80*.6f)&&Mathf.Abs(commits[0].value-48)<.01f,"the refund is floor(spent x .6) on level 4");
    if(run==0)firstPick=target.id;else Check(firstPick==target.id,"two runs pick the same tower");Done(g);}
   // Selling during the windup cancels the hit.
   {EnemyState boss;var g=UprootArena(4,.5f,out boss,3);int warnedId=-1;g.Effect+=e=>{if(e.kind=="uproot"&&e.type=="telegraph")warnedId=e.target;};g.StepSimulation(17.5f);Check(warnedId>0,"warned");int coins=g.coins;g.Select("tower",warnedId);g.Command("{\"type\":\"sell\"}");Check(g.coins==coins+Mathf.FloorToInt(80*.7f)&&g.towers.Count==2,"selling the warned tower refunds 70%");g.StepSimulation(2.5f);Check(g.towers.Count==2,"nothing else is torn out after the sale");Done(g);}
   // A Super is demoted to tier 4 with 55% of the merged partner's spend refunded.
   {EnemyState boss;var g=UprootArena(4,.5f,out boss,2,0);g.towers[1].builtAt=1000;int coins=g.coins;var super=g.towers[0];var commits=new List<CarrotEvent>();g.Effect+=e=>{if(e.kind=="uproot"&&e.type=="ability")commits.Add(e);};g.StepSimulation(20);
    Check(commits.Count==1&&commits[0].target==super.id&&commits[0].tier==5&&g.towers.Contains(super)&&super.tier==4&&super.spent==465&&super.mergedSpent==0&&g.coins==coins+Mathf.FloorToInt(465*.55f),"a Super is demoted, not destroyed, and refunds 55% of the merged spend");Done(g);}
   // A single tower is never targeted.
   {EnemyState boss;var g=UprootArena(4,.5f,out boss,1);var casts=Casts(g,boss.id,"telegraph");g.StepSimulation(40);Check(!casts.Contains("uproot")&&g.towers.Count==1,"a lone tower is never torn out");Done(g);}
   // Old Hollowhead on 24 in phase 3 takes two towers with one ability and one abilityTarget.
   {EnemyState boss;var g=UprootArena(24,.25f,out boss,3);int abilities=0,extra=0;g.Effect+=e=>{if(e.kind!="uproot")return;if(e.type=="ability")abilities++;if(e.type=="abilityTarget")extra++;};g.StepSimulation(11);Check(abilities==1&&extra==1&&g.towers.Count==1,"Reap takes two towers on The Last Light");Done(g);}
  }
  static void Tithe(){
   var g=New(8);g.phase="playing";g.TestClearScheduled();var boss=g.TestSpawn("boss",0,0,true);Still(boss);boss.hp=boss.maxHp*.5f;g.coins=500;var casts=Casts(g,boss.id);float taken=0;g.Effect+=e=>{if(e.id==boss.id&&e.type=="ability"&&e.kind=="tithe")taken=e.value;};
   g.StepSimulation(20);Check(casts.Contains("tithe")&&g.coins==400&&taken==100,"the Regent takes 20% of a 500-coin purse");Done(g);
   var poor=New(8);poor.phase="playing";poor.TestClearScheduled();var b2=poor.TestSpawn("boss",0,0,true);Still(b2);b2.hp=b2.maxHp*.5f;poor.coins=500;bool warned=false;poor.Effect+=e=>{if(e.id==b2.id&&e.type=="telegraph"&&e.kind=="tithe"&&!warned){warned=true;poor.coins=20;}};
   poor.StepSimulation(20);Check(warned&&poor.coins==0,"spending before the commit shrinks the tithe to the remaining purse");Done(poor);
  }
  static void Challenges(){
   // Wave gate: the next wave begins while the boss lives; no victory until the boss and every add resolve.
   {var g=New(25);g.coins=100000;g.phase="playing";g.TestBeginWave(4);EnemyState boss=null;float limit=0;
    while(limit<60&&g.wave<5&&g.phase=="playing"){g.StepSimulation(.25f);limit+=.25f;foreach(var e in g.enemies.ToArray())if(e.alive){if(!string.IsNullOrEmpty(e.boss)){if(boss==null){boss=e;Still(e);}}else g.TestDamage(e.id,1e6f);}}
    Check(boss!=null&&boss.alive&&g.wave==5&&g.phase=="playing","wave 5 begins while the Giant Tornado lives");
    while(limit<200&&g.phase=="playing"&&g.wave<6){g.StepSimulation(.25f);limit+=.25f;foreach(var e in g.enemies.ToArray())if(e.alive&&string.IsNullOrEmpty(e.boss))g.TestDamage(e.id,1e6f);}
    Check(g.wave==6&&g.phase=="playing","the final wave arrives with the boss still walking");
    float until=limit+60;while(limit<until&&g.phase=="playing"){g.StepSimulation(.25f);limit+=.25f;foreach(var e in g.enemies.ToArray())if(e.alive&&string.IsNullOrEmpty(e.boss))g.TestDamage(e.id,1e6f);}
    Check(g.phase=="playing"&&boss.alive,"no victory while the boss lives after the final wave");g.TestDamage(boss.id,1e6f);g.StepSimulation(.25f);foreach(var e in g.enemies.ToArray())if(e.alive)g.TestDamage(e.id,1e6f);g.StepSimulation(1);Check(g.phase=="won","victory once the boss and its adds are dead");Done(g);}
   // Gust halves a seed hit within 3 u of the funnel and never a mortar hit.
   {var g=New(25);g.phase="playing";g.TestClearScheduled();var boss=g.TestSpawn("boss",0,5,true);Still(boss);var near=Durable(g,"nibble",5.5f);Still(near);var far=Durable(g,"nibble",20);Still(far);Check(Vector3.Distance(far.position,boss.position)>3.5f,"the far target is outside the Gust radius");bool gust=false;g.Effect+=e=>{if(e.id==boss.id&&e.type=="ability"&&e.kind=="gust")gust=true;};
    while(!gust&&g.elapsed<20)g.StepSimulation(.1f);Check(gust&&g.PendingSummons==0&&g.enemies.FindAll(e=>e.kind=="swarm"&&e.summoned&&e.alive).Count==4,"Gust lands with four debris swarms");
    float hp=near.hp;g.TestFire("seed",1,near.id,near.position);Check(Mathf.Abs((hp-near.hp)-CarrotData.Tower("seed").damage[0]*.5f)<.01f,"a seed hit within 3 u deals half during Gust");float fhp=far.hp;g.TestFire("seed",1,far.id,far.position);Check(Mathf.Abs((fhp-far.hp)-CarrotData.Tower("seed").damage[0])<.01f,"a seed hit far from the funnel is untouched");
    hp=near.hp;g.TestFire("mortar",1,near.id,near.position);Check(Mathf.Abs((hp-near.hp)-CarrotData.Tower("mortar").damage[0])<.01f,"a mortar hit ignores Gust");g.StepSimulation(3);hp=near.hp;g.TestFire("seed",1,near.id,near.position);Check(Mathf.Abs((hp-near.hp)-CarrotData.Tower("seed").damage[0])<.01f,"the Gust window closes after 2.5 s");Done(g);}
   // Lift-off blocks a Mortar while a Seed keeps firing.
   {var g=New(25);g.phase="playing";g.TestClearScheduled();var boss=g.TestSpawn("boss",0,5,true);Still(boss);boss.hp=boss.maxHp*.5f;var mortar=TestTower(g,"mortar",boss.position+new Vector3(0,0,1.5f),4);var seed=TestTower(g,"seed",boss.position+new Vector3(0,0,-1.5f),4);
    bool lifted=false;var shots=new Dictionary<string,int>();g.Effect+=e=>{if(e.id==boss.id&&e.type=="ability"&&e.kind=="liftoff"){lifted=true;shots.Clear();}if(e.type=="shot"){shots.TryGetValue(e.kind,out int n);shots[e.kind]=n+1;}};
    g.StepSimulation(3);Check(shots.ContainsKey("mortar")&&shots.ContainsKey("seed"),"both towers fire before Lift-off");while(!lifted&&g.elapsed<20)g.StepSimulation(.1f);Check(lifted&&boss.air,"Lift-off makes the tornado airborne");
    g.StepSimulation(2);Check(!shots.ContainsKey("mortar")&&shots.ContainsKey("seed")&&shots["seed"]>0,"the ground-only Mortar cannot hit the airborne funnel while the Seed fires");g.StepSimulation(2.5f);Check(!boss.air,"Lift-off ends after four seconds");Done(g);}
   // Raise Dead revives the recorded kinds at full HP beside the Zombie.
   {var g=New(26);g.phase="playing";g.TestClearScheduled();var boss=g.TestSpawn("boss",0,3,true);Still(boss);var shell=g.TestSpawn("shell",0,12);var crystal=g.TestSpawn("crystal",0,12.5f);g.TestDamage(shell.id,1e6f);g.TestDamage(crystal.id,1e6f);
    var raised=new List<string>();g.Effect+=e=>{if(e.id==boss.id&&e.type=="ability"&&e.kind=="raise")raised.Add(e.kind);};g.StepSimulation(17);
    var adds=g.enemies.FindAll(e=>e.summoned&&e.alive&&string.IsNullOrEmpty(e.boss));Check(raised.Count==1&&adds.Count==3&&adds.Exists(e=>e.kind=="shell")&&adds.Exists(e=>e.kind=="crystal")&&adds.Exists(e=>e.kind=="nibble"),"Raise Dead returns the recorded shell and crystal plus a nibble");
    foreach(var add in adds)Check(add.reward==(add.kind=="nibble"?2:0)&&Mathf.Abs(add.maxHp-(add.kind=="shell"?125:add.kind=="crystal"?110:55)*CarrotData.HPScale(26)*CarrotData.PressureScale(26))<.01f&&Vector3.Distance(add.position,boss.position)<=.5f,"raised bodies retain full health; only the newly created nibble pays a reduced bounty");
    g.TestDamage(boss.id,1e6f);g.StepSimulation(.1f);Check(g.phase=="playing","boss death with living raised adds is not victory");Done(g);}
   // The Zombie's uproot leaves a grave blocker that Buy rejects and that clears with reward 0; the boss's death clears it too.
   {var g=New(26);g.phase="playing";g.TestClearScheduled();g.coins=100000;var boss=g.TestSpawn("boss",0,8,true);Still(boss);boss.hp=boss.maxHp*.5f;
    var pads=new List<int>();for(int i=0;i<g.level.pads.Length&&pads.Count<3;i++)if(!g.blockers.Exists(b=>b.pad==i)&&Vector3.Distance(g.level.pads[i],boss.position)<=4.5f)pads.Add(i);Check(pads.Count==3,"three open pads within 4.5 u of the Zombie");
    foreach(int pad in pads){var t=TestTower(g,"seed",g.level.pads[pad],1,pad);t.cooldown=1000;}
    int torn=-1;g.Effect+=e=>{if(e.id==boss.id&&e.type=="ability"&&e.kind=="uproot")torn=e.target;};g.StepSimulation(8);Check(torn>0&&g.towers.Count==2,"the Zombie tears out one tower");
    var grave=g.blockers.Find(b=>b.kind=="grave");Check(grave!=null&&grave.ownerEnemy==boss.id&&grave.reward==0&&Mathf.Abs(grave.maxHp-157.5f)<.01f&&pads.Contains(grave.pad)&&!g.towers.Exists(t=>t.pad==grave.pad),"a grave knot owned by the Zombie sits on the freed pad");
    g.Select("pad",grave.pad);g.Command("{\"type\":\"buy\",\"kind\":\"seed\"}");Check(g.towers.Count==2&&g.selectionType=="blocker","Buy rejects the grave's pad");
    int coins=g.coins;float cleared=-1;g.Effect+=e=>{if(e.type=="clear"&&e.id==grave.id)cleared=e.value;};g.TestDamageScenery(grave.id,1000);Check(!g.blockers.Contains(grave)&&g.coins==coins&&cleared==0,"shooting the grave clears it with reward 0");
    g.StepSimulation(20);for(int wait=0;wait<40&&!g.blockers.Exists(b=>b.kind=="grave");wait++)g.StepSimulation(.25f);var second=g.blockers.Find(b=>b.kind=="grave");Check(second!=null,"a second uproot leaves a second grave");g.TestDamage(boss.id,1e6f);g.StepSimulation(.1f);Check(!g.blockers.Exists(b=>b.kind=="grave"),"the Zombie's death releases its graves");Done(g);}
   // Gaze stuns the tier-5 tower first for 5 s.
   {var g=New(27);g.phase="playing";g.TestClearScheduled();var boss=g.TestSpawn("boss",0,3,true);Still(boss);var super=TestTower(g,"seed",boss.position+new Vector3(2,0,1),5);var grown=TestTower(g,"seed",boss.position+new Vector3(1,0,1),4);var prism=TestTower(g,"prism",boss.position+new Vector3(0,0,1.5f),4);foreach(var t in g.towers)t.cooldown=1000;
    int gazed=-1;g.Effect+=e=>{if(e.id==boss.id&&e.type=="ability"&&e.kind=="gaze")gazed=e.target;};g.StepSimulation(10.7f);Check(gazed==super.id&&Mathf.Abs(super.stunnedFor-(5-(g.elapsed-10.5f)))<.1f&&grown.stunnedFor==0&&prism.stunnedFor==0,"Gaze locks the Super first for five seconds");
    super.cooldown=0;var target=Durable(g,"nibble",NearestOnRoute(g,super.position));Still(target);Check(Vector3.Distance(target.position,super.position)<=3.6f,"a target stands within the gazed Super's range");int shots=0;g.Effect+=e=>{if(e.type=="shot"&&e.id==super.id)shots++;};g.StepSimulation(1);Check(shots==0,"a gazed tower fires nothing");g.StepSimulation(4.5f);Check(super.stunnedFor==0,"the stun ends");Done(g);}
   // The eyeball's three blind forms and the windup shave.
   foreach(var form in new[]{new{hp=1f,seconds=2f,alpha=.55f,range=.8f},new{hp=.5f,seconds=3f,alpha=.85f,range=.6f},new{hp=.25f,seconds=3.5f,alpha=.92f,range=.6f}}){
    var g=New(27);g.phase="playing";g.TestClearScheduled();var boss=g.TestSpawn("boss",0,0,true);Still(boss);boss.hp=boss.maxHp*form.hp;float dark=0;g.Effect+=e=>{if(e.id==boss.id&&e.type=="ability"&&e.kind=="blind")dark=e.value;};
    while(dark==0&&g.elapsed<40)g.StepSimulation(.1f);Check(Mathf.Abs(dark-form.seconds)<.01f&&Mathf.Abs(g.blindAlpha-form.alpha)<.001f&&Mathf.Abs(g.blindRange-form.range)<.001f&&BlindLeft(g)>form.seconds-.15f,"blind form at "+form.hp+" HP lasts "+form.seconds+" s");Done(g);}
   {var g=New(27);g.phase="playing";g.TestClearScheduled();var boss=g.TestSpawn("boss",0,0,true);Still(boss);boss.hp=boss.maxHp*.25f;float dark=0;bool hurt=false;g.Effect+=e=>{if(e.id!=boss.id)return;if(e.type=="telegraph"&&e.kind=="blind"&&!hurt){hurt=true;g.TestDamage(boss.id,boss.maxHp*.08f);}if(e.type=="ability"&&e.kind=="blind")dark=e.value;};
    while(dark==0&&g.elapsed<40)g.StepSimulation(.1f);Check(hurt&&Mathf.Abs(dark-1.5f)<.02f&&Mathf.Abs(g.TestShave(boss.id)-2)<.02f,"8% of the eye's health during the windup shaves two seconds off Void");Done(g);}
   {var g=New(27);g.phase="playing";g.TestClearScheduled();var boss=g.TestSpawn("boss",0,0,true);Still(boss);boss.hp=boss.maxHp*.25f;float dark=0;bool hurt=false;g.Effect+=e=>{if(e.id!=boss.id)return;if(e.type=="telegraph"&&e.kind=="blind"&&!hurt){hurt=true;g.TestDamage(boss.id,boss.maxHp*.2f);}if(e.type=="ability"&&e.kind=="blind")dark=e.value;};
    while(dark==0&&g.elapsed<40)g.StepSimulation(.1f);Check(hurt&&Mathf.Abs(dark-1.2f)<.02f,"the shave floors at 1.2 s");Done(g);}
   // Cast caps and kit purity over 150 s runs.
   foreach(var kit in new[]{new{level=25,kinds=new[]{"gust","liftoff"},caps=new[]{99,2}},new{level=26,kinds=new[]{"uproot","raise"},caps=new[]{3,4}},new{level=27,kinds=new[]{"blind","gaze"},caps=new[]{6,8}},new{level=8,kinds=new[]{"mist","summon","blind","tithe"},caps=new[]{99,3,3,2}},new{level=12,kinds=new[]{"mantle","breath","shatter","whiteout"},caps=new[]{3,99,2,2}},new{level=4,kinds=new[]{"bark","root","uproot"},caps=new[]{99,99,2}},new{level=20,kinds=new[]{"rush","flock","heap","uproot","dusk","emerge"},caps=new[]{99,3,3,3,1,99}}}){
    var g=New(kit.level);g.phase="playing";g.TestClearScheduled();g.coins=100000;QuietTowers(g);var boss=g.TestSpawn("boss",0,0,true);Still(boss);boss.hp=boss.maxHp*.28f;var casts=Casts(g,boss.id);g.StepSimulation(150);
    var allowed=new HashSet<string>(kit.kinds){"phase","brambleSurge","lanternFlood","glacierLance","harvestMoon","cycloneCall","graveMarch","eyeClones","blackout","reincarnate"};foreach(var c in casts)Check(allowed.Contains(c),"boss "+boss.boss+" emits only its own cast kinds ("+c+")");
    for(int i=0;i<kit.kinds.Length;i++){int n=casts.FindAll(c=>c==kit.kinds[i]).Count;Check(n<=kit.caps[i],"cast cap "+kit.kinds[i]+" on "+kit.level+" ("+n+")");}
    Check(casts.Count>2,"the "+boss.boss+" keeps casting");Done(g);}
  }
  static void PoorCoverage(){
   foreach(int level in new[]{1,4,8,12,16,20,24,25,27,28}){var g=New(level);int poor=-1;float score=float.MaxValue;
    for(int pad=0;pad<g.level.pads.Length;pad++)if(!g.blockers.Exists(b=>b.pad==pad)){float value=Coverage(g,g.level.pads[pad],3);if(value<score){score=value;poor=pad;}}
    g.Select("pad",poor);g.Command("{\"type\":\"buy\",\"kind\":\"seed\"}");g.Command("{\"type\":\"start\"}");
    for(float time=0;time<1200&&g.phase=="playing";time+=.25f){if(g.towers.Count>0){g.Select("tower",g.towers[0].id);g.Command("{\"type\":\"upgrade\"}");}g.StepSimulation(.25f);}
    Debug.Log("CARROT_POOR_COVERAGE level="+level+" result="+g.phase+" hearts="+g.health+" invested="+(g.towers.Count>0?g.towers[0].spent:0));
    Check(g.phase=="lost"&&g.CarrotContacts>0,"poor single-position coverage is punished on "+level);Done(g);
   }
  }
  static bool policyMerges=true;
  public static void Campaign(){
   CampaignRuns("CARROT_CAMPAIGN",CarrotData.Levels.Length,true,true);
   // Fairness contract: merging is optional through Last Harvest, so the bots with merges off must still win the boss levels 4, 8 and 12 (16, 20, 24 are logged).
   policyMerges=false;
   foreach(int level in new[]{4,8,12,16,20,24})for(int strategy=0;strategy<2;strategy++){var r=RunCampaign(level,strategy);Debug.Log("CARROT_CAMPAIGN merges=off strategy="+strategy+" level="+level+" result="+r.phase+" hearts="+r.health+" lowest="+r.lowest+" seconds="+r.seconds.ToString("F1")+" wave="+r.wave+" towers="+r.towers);
    if(level<=12&&r.phase!="won")failures.Add("merges-off strategy "+strategy+" level "+level+" must still win ("+r.phase+", wave "+r.wave+")");}
   policyMerges=true;
  }
  class Result {public string phase;public int health,lowest,wave,towers,supers,earned;public float seconds,bossHp,bossGap;public string roster;public BotRun run;}
  static void CampaignRuns(string tag,int levels,bool merges,bool assertSupers){
   policyMerges=merges;var supers=new int[2];
   for(int strategy=0;strategy<2;strategy++)for(int level=1;level<=levels;level++){
    // Asuna has one independently verified moving-defense policy; do not label the brittle alternate mix a victory.
    if(level==29&&strategy==1)continue;
    var r=RunCampaign(level,strategy);if(r.supers>0)supers[strategy]++;
    Debug.Log(tag+" strategy="+strategy+" level="+level+" result="+r.phase+" hearts="+r.health+" lowest="+r.lowest+" seconds="+r.seconds.ToString("F1")+" wave="+r.wave+" towers="+r.towers+" supers="+r.supers+" earned="+r.earned+" roster="+r.roster);
    if(r.phase!="won")failures.Add(tag+" strategy "+strategy+" level "+level+" viable with earned coins ("+r.phase+", wave "+r.wave+", lowest "+r.lowest+")");
    else{Check(r.health>=1&&r.seconds<=1200,"won with hearts and inside the time cap "+level);}
   }
   if(assertSupers)for(int strategy=0;strategy<2;strategy++)if(supers[strategy]<4)failures.Add(tag+" policy "+strategy+" fields a Super in only "+supers[strategy]+" runs");
  }
  static Result RunCampaign(int level,int strategy,BotRng noise=null){
   if(level==29)return RunPrismCampaign(strategy,noise);
   scoreNoise=noise;
   var g=New(level);float bossGap=-1;g.Effect+=v=>{if(v.type=="death"){var fallen=g.enemies.Find(e=>e.id==v.id);if(fallen!=null&&!string.IsNullOrEmpty(fallen.boss))bossGap=fallen.routeLength-fallen.distance;}if((v.type=="telegraph"||v.type=="telegraphTarget")&&v.kind=="uproot"&&v.target>0){var t=g.towers.Find(x=>x.id==v.target);if(t!=null){g.Select("tower",t.id);g.Command("{\"type\":\"sell\"}");}}};if(strategy==1&&level==1){g.Select("pad",0);g.Command("{\"type\":\"buy\",\"kind\":\"seed\"}");g.Select("pad",1);g.Command("{\"type\":\"buy\",\"kind\":\"frost\"}");}BuyBest(g,strategy);BuyBest(g,strategy);g.Command("{\"type\":\"start\"}");float limit=0;int lowest=10,lastMergeWave=-1,merges=0;
   float validateAt=0;
   while(g.phase=="playing"&&limit<1200){for(int i=0;i<4;i++)if(!BuyBest(g,strategy))break;if(policyMerges&&g.wave!=lastMergeWave&&MergeBest(g)){lastMergeWave=g.wave;merges++;}Focus(g);float step=noise==null?.25f:.25f+(float)noise.Unit()*.25f;g.StepSimulation(step);limit+=step;lowest=Mathf.Min(lowest,g.health);Check(g.coins>=0,"never spend nonexistent coins "+level);
    // Every bot run doubles as a bridge-contract run: the published snapshot must always parse.
    if(limit>=validateAt){validateAt+=15;ValidateSnapshot(g.LastSnapshot,"campaign "+level);}}
   ValidateSnapshot(g.Snapshot(),"campaign end "+level);
   string roster="";int supers=0;foreach(var t in g.towers){roster+=t.kind+"/"+t.tier+",";if(t.tier==5)supers++;}
   var r=new Result{phase=g.phase,health=g.health,lowest=lowest,wave=g.wave,towers=g.towers.Count,supers=Mathf.Max(supers,merges),earned=g.TotalEarned,seconds=g.elapsed,bossHp=g.enemies.Find(e=>!string.IsNullOrEmpty(e.boss))?.hp??0,bossGap=bossGap,roster=roster};
   r.run=Collect(g,"R0",0,strategy,lowest);r.run.supers=r.supers;scoreNoise=null;
   if(g.phase=="won")Check(g.progress==1,"complete progress "+level);Done(g);return r;
  }
  // Bots focus Brambleback's root knots; on challenge levels they shoot a grave once they field four towers.
  static void Focus(CarrotGame g){var knot=g.blockers.Find(x=>x.kind=="root");if(knot==null&&CarrotData.IsChallenge(g.level.id)&&g.towers.Count>=4)knot=g.blockers.Find(x=>x.kind=="grave");if(knot!=null){if(g.selectionId!=knot.id)g.Select("blocker",knot.id);return;}
   if(CarrotData.IsChallenge(g.level.id)){EnemyState boss=g.enemies.Find(e=>e.alive&&!string.IsNullOrEmpty(e.boss));bool crisis=g.enemies.Exists(e=>e.alive&&string.IsNullOrEmpty(e.boss)&&e.distance/e.routeLength>.87f);if(boss!=null&&boss.distance/boss.routeLength>.42f&&!crisis){if(g.selectionId!=boss.id)g.Select("enemy",boss.id);}else if(g.selectionType=="enemy")g.Select("",-1);}
  }
  // Replays policy 0 on Scarecrow Field and a scripted level-8 command list twice; every tick's snapshot must match.
  public static void Determinism(){
   string[] a=Replay(20),b=Replay(20);Check(a.Length==b.Length&&a.Length>1000,"replays run the same number of ticks");for(int i=0;i<a.Length;i++)Check(a[i]==b[i],"policy-0 replay on level 20 diverges at tick "+i);
   string[] c=Scripted(),d=Scripted();Check(c.Length==d.Length,"scripted replays run the same number of ticks");for(int i=0;i<c.Length;i++)Check(c[i]==d[i],"scripted level-8 replay diverges at tick "+i);
   Debug.Log("CARROT_DETERMINISM ticks="+a.Length+" scripted="+c.Length);
   Digest();
  }
  /// <summary>Cross-runtime proof: the level-20 policy-0 replay folded into one hash of every tick's canonical digest
  /// (integers and raw float bits). Unity's log and `node scripts/carrot-sim.mjs --digest` must print the same line.</summary>
  public static void Digest(){
   var g=New(20);policyMerges=true;BuyBest(g,0);BuyBest(g,0);g.Command("{\"type\":\"start\"}");int lastMergeWave=-1,ticks=0;float limit=0;ulong chain=1469598103934665603UL,raw=chain;
   while(g.phase=="playing"&&limit<1200){for(int i=0;i<4;i++)if(!BuyBest(g,0))break;if(g.wave!=lastMergeWave&&MergeBest(g))lastMergeWave=g.wave;Focus(g);for(int t=0;t<7;t++){g.StepSimulation(1f/30);chain=(chain^g.DiscreteDigest())*1099511628211UL;raw=(raw^g.Digest())*1099511628211UL;ticks++;}limit+=7f/30;}
   Debug.Log("CARROT_DIGEST level=20 policy=0 ticks="+ticks+" phase="+g.phase+" health="+g.health+" coins="+g.coins+" hash="+chain.ToString("x16")+" floatBits="+raw.ToString("x16"));Done(g);
  }
  /// <summary>Diagnostic: the first tick at which the digest chain moves, every 500 ticks (compare two runtimes' logs).</summary>
  public static void DigestTrace(){
   var g=New(20);policyMerges=true;BuyBest(g,0);BuyBest(g,0);g.Command("{\"type\":\"start\"}");int lastMergeWave=-1,ticks=0;float limit=0;
   while(g.phase=="playing"&&limit<1200){for(int i=0;i<4;i++)if(!BuyBest(g,0))break;if(g.wave!=lastMergeWave&&MergeBest(g))lastMergeWave=g.wave;Focus(g);for(int t=0;t<7;t++){g.StepSimulation(1f/30);ticks++;if(ticks<=40||ticks%500==0)Debug.Log("CARROT_TRACE tick="+ticks+" digest="+g.Digest().ToString("x16")+" coins="+g.coins+" elapsed="+BitConverter.ToInt32(BitConverter.GetBytes(g.elapsed),0)+" enemies="+g.enemies.Count+" towers="+g.towers.Count);}limit+=7f/30;}
   Done(g);
  }
  static string[] Replay(int level){
   var g=New(level);policyMerges=true;BuyBest(g,0);BuyBest(g,0);g.Command("{\"type\":\"start\"}");var snaps=new List<string>();int lastMergeWave=-1;float limit=0;
   while(g.phase=="playing"&&limit<1200){for(int i=0;i<4;i++)if(!BuyBest(g,0))break;if(g.wave!=lastMergeWave&&MergeBest(g))lastMergeWave=g.wave;Focus(g);for(int t=0;t<7;t++){g.StepSimulation(1f/30);snaps.Add(g.Snapshot());}limit+=7f/30;}
   Done(g);return snaps.ToArray();
  }
  static string[] Scripted(){
   var g=New(8);g.coins=3000;var snaps=new List<string>();var script=new List<KeyValuePair<float,string>>{new KeyValuePair<float,string>(0,"buy seed 0"),new KeyValuePair<float,string>(0,"buy seed 1"),new KeyValuePair<float,string>(0,"buy prism 2"),new KeyValuePair<float,string>(5,"upgrade 0"),new KeyValuePair<float,string>(10,"upgrade 0"),new KeyValuePair<float,string>(15,"upgrade 0"),new KeyValuePair<float,string>(20,"upgrade 1"),new KeyValuePair<float,string>(25,"upgrade 1"),new KeyValuePair<float,string>(30,"upgrade 1"),new KeyValuePair<float,string>(35,"merge 1 0"),new KeyValuePair<float,string>(36,"mergeUndo"),new KeyValuePair<float,string>(40,"merge 1 0"),new KeyValuePair<float,string>(60,"sell 2"),new KeyValuePair<float,string>(61,"buy thunder 2"),new KeyValuePair<float,string>(70,"upgrade 2")};
   var pads=new List<int>();for(int i=0;i<g.level.pads.Length;i++)if(!g.blockers.Exists(b=>b.pad==i))pads.Add(i);
   foreach(var step in script)if(step.Key==0)Apply(g,step.Value,pads);g.Command("{\"type\":\"start\"}");int next=0;while(script[next].Key==0)next++;
   while(g.phase=="playing"&&g.elapsed<150){while(next<script.Count&&g.elapsed>=script[next].Key){Apply(g,script[next].Value,pads);next++;}g.StepSimulation(1f/30);snaps.Add(g.Snapshot());}
   Done(g);return snaps.ToArray();
  }
  static void Apply(CarrotGame g,string line,List<int> pads){
   var bits=line.Split(' ');
   switch(bits[0]){
    case "buy":g.Select("pad",pads[int.Parse(bits[2])]);g.Command("{\"type\":\"buy\",\"kind\":\""+bits[1]+"\"}");break;
    case "upgrade":{var t=g.towers.Find(x=>x.pad==pads[int.Parse(bits[1])]);if(t!=null){g.Select("tower",t.id);g.Command("{\"type\":\"upgrade\"}");}break;}
    case "sell":{var t=g.towers.Find(x=>x.pad==pads[int.Parse(bits[1])]);if(t!=null){g.Select("tower",t.id);g.Command("{\"type\":\"sell\"}");}break;}
    case "merge":{var s=g.towers.Find(x=>x.pad==pads[int.Parse(bits[1])]);var t=g.towers.Find(x=>x.pad==pads[int.Parse(bits[2])]);if(s!=null&&t!=null)g.Command("{\"type\":\"merge\",\"id\":"+s.id+",\"target\":"+t.id+"}");break;}
    case "mergeUndo":g.Command("{\"type\":\"mergeUndo\"}");break;
   }
  }

  // R0 seed variants perturb every candidate score by up to +-1% (null: the canonical policy, bit for bit).
  static BotRng scoreNoise;
  static float Jitter(){return scoreNoise==null?1f:1f+(float)(scoreNoise.Unit()*2-1)*.01f;}
  // A deterministic policy buys only legal unlocked towers with earned money; no outcome shortcuts.
  static bool BuyBest(CarrotGame g,int strategy=0){
   if(policyMerges&&strategy==1&&g.level.id>=20&&g.level.id<=24&&g.wave>=7&&g.health>=8&&g.towers.Count>=8&&!g.towers.Exists(t=>t.tier==5)&&InvestInPair(g))return true;
   if(CarrotData.IsChallenge(g.level.id)&&g.towers.Count>=3){string counter=!g.towers.Exists(t=>t.kind=="frost")?"frost":!g.towers.Exists(t=>t.kind=="lotus")?"lotus":null;
    if(counter!=null&&g.coins>=CarrotData.Tower(counter).cost[0]){int pad=-1;float coverage=0;for(int i=0;i<g.level.pads.Length;i++)if(!g.towers.Exists(t=>t.pad==i)&&!g.blockers.Exists(b=>b.pad==i)){float score=Coverage(g,g.level.pads[i],CarrotData.Tower(counter).range[0]);if(score>coverage){coverage=score;pad=i;}}if(pad>=0){g.Select("pad",pad);g.Command("{\"type\":\"buy\",\"kind\":\""+counter+"\"}");return true;}}
   }
   float best=0,bestAffordable=0;int selected=-1,affordable=-1;string kind=null,affordableKind=null;bool upgrading=false,affordableUpgrade=false;
   int minTowers=CarrotData.IsChallenge(g.level.id)?5:3;foreach(var t in g.towers)if(t.tier<4&&g.towers.Count>=minTowers){var d=CarrotData.Tower(t.kind);{float old=Power(d,t.tier-1)*Preference(d.id,strategy,g.level.id),next=Power(d,t.tier)*Preference(d.id,strategy,g.level.id);float score=(next-old)*Coverage(g,t.position,d.range[t.tier])/d.cost[t.tier]*(g.towers.Count<5?.75f:1.1f)*Jitter();if(score>best){best=score;selected=t.id;upgrading=true;}if(d.cost[t.tier]<=g.coins&&score>bestAffordable){bestAffordable=score;affordable=t.id;affordableUpgrade=true;}}}
   for(int p=0;p<g.level.pads.Length;p++)if(!g.towers.Exists(t=>t.pad==p)&&!g.blockers.Exists(b=>b.pad==p))foreach(var d in CarrotData.Towers)if(d.unlock<=g.level.id&&(g.towers.Count>=2||d.cost[0]<=g.coins)){
    float overlap=0;foreach(var t in g.towers)if(Vector3.Distance(t.position,g.level.pads[p])<3.2f)overlap+=.16f;
    float score=Power(d,0)*Preference(d.id,strategy,g.level.id)*Coverage(g,g.level.pads[p],d.range[0])/d.cost[0]/(1+overlap+g.towers.Count*.05f);
    int family=g.towers.FindAll(t=>t.kind==d.id).Count;score/=1+family*(strategy==1&&g.level.id>=20?.4f:.55f);
    bool control=g.towers.Exists(t=>t.kind=="frost"||t.kind=="gravity"||t.kind=="book"||t.kind=="clockflower"||t.kind=="mushroom");
    if(g.towers.Count>=3&&!control&&(d.id=="frost"||d.id=="clockflower"||d.id=="mushroom"))score*=1.8f;
    if(g.towers.Count>=5&&!g.towers.Exists(t=>t.kind=="blossom"||t.kind=="clockflower")&&(d.id=="blossom"||d.id=="clockflower"))score*=1.65f;
    if(g.towers.Count>=5&&d.id=="lotus"&&!g.towers.Exists(t=>t.kind=="lotus"))score*=1.65f;
    if(strategy==0&&g.level.id==1&&d.id=="frost")score=0;
    if(d.id=="frost"&&(g.towers.Count<2||g.towers.Exists(t=>t.kind=="frost"&&Vector3.Distance(t.position,g.level.pads[p])<5)))score*=.2f;
    score*=Jitter();
    if(score>best){best=score;selected=p;kind=d.id;upgrading=false;}
    if(d.cost[0]<=g.coins&&score>bestAffordable){bestAffordable=score;affordable=p;affordableKind=d.id;affordableUpgrade=false;}
   }
   if(selected<0)return false;
   bool unaffordable=upgrading?CarrotData.Tower(g.towers.Find(t=>t.id==selected).kind).cost[g.towers.Find(t=>t.id==selected).tier]>g.coins:CarrotData.Tower(kind).cost[0]>g.coins;
   if(unaffordable){
    // Fill a small opening roster, then save for useful coverage even after leaks. Panic-spending
    // below seven hearts made tiny legitimate summon payouts reorder low-value upgrades on level 19.
    if(affordable<0||bestAffordable<best*.68f&&g.towers.Count>=4)return false;
    selected=affordable;kind=affordableKind;upgrading=affordableUpgrade;
   }
   if(upgrading){g.Select("tower",selected);g.Command("{\"type\":\"upgrade\"}");}else{g.Select("pad",selected);g.Command("{\"type\":\"buy\",\"kind\":\""+kind+"\"}");}return true;
  }
  // Once broad coverage is established, the second policy deliberately grows one safe merge pair.
  // It spends only earned gold and requires the same ninety-percent union-coverage rule as merging.
  static bool InvestInPair(CarrotGame g){
   foreach(var target in g.towers)if(target.tier==4){var d=CarrotData.Tower(target.kind);float range=d.range[4];
    foreach(var source in g.towers)if(source.id!=target.id&&source.kind==target.kind&&source.tier<4&&Coverage(g,target.position,range)>=UnionCoverage(g,source.position,target.position,range)*.9f&&g.coins>=d.cost[source.tier]){g.Select("tower",source.id);g.Command("{\"type\":\"upgrade\"}");return true;}
    if(g.towers.Exists(t=>t.id!=target.id&&t.kind==target.kind)||g.coins<d.cost[0])continue;
    for(int p=0;p<g.level.pads.Length;p++)if(!g.towers.Exists(t=>t.pad==p)&&!g.blockers.Exists(b=>b.pad==p)&&Coverage(g,target.position,range)>=UnionCoverage(g,g.level.pads[p],target.position,range)*.9f){g.Select("pad",p);g.Command("{\"type\":\"buy\",\"kind\":\""+target.kind+"\"}");return true;}
   }return false;
  }
  // Union-coverage rule: merge a same-kind tier-4 pair only when the target alone keeps at least 90% of what the pair covered together; best ratio wins, at most once per wave.
  static bool MergeBest(CarrotGame g){
   if(g.phase!="playing"&&g.phase!="ready")return false;float best=.9f;TowerState source=null,target=null;
   for(int i=0;i<g.towers.Count;i++)for(int j=0;j<g.towers.Count;j++){var s=g.towers[i];var t=g.towers[j];if(i==j||s.kind!=t.kind||s.tier!=4||t.tier!=4)continue;
    float range=CarrotData.Tower(t.kind).range[4];float union=UnionCoverage(g,s.position,t.position,range);if(union<=0)continue;float ratio=Coverage(g,t.position,range)/union;if(ratio>=best){best=ratio;source=s;target=t;}}
   if(source==null)return false;g.Command("{\"type\":\"merge\",\"id\":"+source.id+",\"target\":"+target.id+"}");return target.tier==5;
  }
  static float Preference(string id,int strategy,int level=0){
   if(level>=25&&strategy==1){switch(id){case "prism":return 1.35f;case "thunder":return 1.2f;case "moonflower":return 1.5f;case "dragonfruit":return .9f;case "starfruit":return 1.25f;}}
   if(strategy==0){switch(id){case "bamboo":return .8f;case "cactus":return 1.15f;case "magnet":return 1.3f;case "moonflower":return 1.2f;case "lotus":return 1.1f;case "seed":return 1.2f;case "prism":return 1.2f;case "storm":return 1.3f;case "frost":return 1.1f;case "starfruit":return .7f;case "mortar":return .8f;default:return 1;}}
   switch(id){case "chili":return 1.3f;case "orchid":return 1.3f;case "mushroom":return 1.2f;case "clockflower":return 1.25f;case "dragonfruit":return 1.15f;case "bamboo":return .75f;case "starfruit":return 1.35f;case "mortar":return .95f;case "blossom":return 1.3f;case "gravity":return 1.25f;case "thunder":return .8f;case "prism":return .8f;default:return 1;}
  }
  static float Power(TowerDef d,int tier){float power=d.damage[tier]/d.interval[tier];switch(d.id){case "frost":return power+8;case "mortar":return power*1.6f;case "storm":return power*1.9f;case "blossom":return power*2;case "starfruit":return power*(4.0f+tier*.65f);case "gravity":return power*1.6f+10;case "book":return power*1.25f;case "thunder":return power*2.6f;case "bamboo":return power*1.15f;case "chili":return power*2;case "lotus":return power*2+5;case "magnet":return power*2;case "orchid":return power*2.6f;case "mushroom":return power*2+7;case "cactus":return power*2;case "clockflower":return power*2.3f+6;case "dragonfruit":return power*4;case "moonflower":return power*1.2f;default:return power;}}
  static readonly Dictionary<string,float> coverageCache=new Dictionary<string,float>();
  static float Coverage(CarrotGame g,Vector3 p,float range){string key=g.level.id+"/"+p.x+"/"+p.z+"/"+range;if(coverageCache.TryGetValue(key,out float cached))return cached;float sum=0;foreach(var route in g.level.routes){float covered=0,len=CarrotData.RouteLength(route);for(float d=0;d<len;d+=.75f){Vector3 dir;var at=CarrotData.RoutePoint(route,d,out dir);if(Vector3.Distance(p,at)<=range)covered+=.75f;}sum+=covered/len;}float result=sum/g.level.routes.Length;coverageCache[key]=result;return result;}
  static float UnionCoverage(CarrotGame g,Vector3 a,Vector3 b,float range){string key=g.level.id+"/"+a.x+"/"+a.z+"/"+b.x+"/"+b.z+"/"+range+"/u";if(coverageCache.TryGetValue(key,out float cached))return cached;float sum=0;foreach(var route in g.level.routes){float covered=0,len=CarrotData.RouteLength(route);for(float d=0;d<len;d+=.75f){Vector3 dir;var at=CarrotData.RoutePoint(route,d,out dir);if(Vector3.Distance(a,at)<=range||Vector3.Distance(b,at)<=range)covered+=.75f;}sum+=covered/len;}float result=sum/g.level.routes.Length;coverageCache[key]=result;return result;}
 }
}
#endif
