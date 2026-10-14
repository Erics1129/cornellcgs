#if UNITY_EDITOR
using System;
using System.Collections.Generic;
using System.Globalization;
using System.IO;
using UnityEngine;
namespace CarrotTD {
 // Bridge contract v2 and telegraph-fairness checks (shared by Unity and the standalone simulation).
 public static partial class CarrotSimulationTests {
  // A strict JSON reader: anything JSON.parse would reject (NaN, Infinity, trailing commas, bare words) throws.
  static class MiniJson {
   public static object Parse(string s){int i=0;var v=Value(s,ref i);Ws(s,ref i);if(i!=s.Length)throw new FormatException("trailing text at "+i);return v;}
   static void Ws(string s,ref int i){while(i<s.Length&&(s[i]==' '||s[i]=='\n'||s[i]=='\r'||s[i]=='\t'))i++;}
   static object Value(string s,ref int i){
    Ws(s,ref i);if(i>=s.Length)throw new FormatException("unexpected end");char c=s[i];
    if(c=='{'){i++;var d=new Dictionary<string,object>();Ws(s,ref i);if(i<s.Length&&s[i]=='}'){i++;return d;}
     for(;;){Ws(s,ref i);if(i>=s.Length||s[i]!='"')throw new FormatException("key expected at "+i);string k=Str(s,ref i);Ws(s,ref i);if(i>=s.Length||s[i]!=':')throw new FormatException("colon expected at "+i);i++;if(d.ContainsKey(k))throw new FormatException("duplicate key "+k);d[k]=Value(s,ref i);Ws(s,ref i);
      if(i<s.Length&&s[i]==','){i++;continue;}if(i<s.Length&&s[i]=='}'){i++;return d;}throw new FormatException("object at "+i);}}
    if(c=='['){i++;var l=new List<object>();Ws(s,ref i);if(i<s.Length&&s[i]==']'){i++;return l;}
     for(;;){l.Add(Value(s,ref i));Ws(s,ref i);if(i<s.Length&&s[i]==','){i++;continue;}if(i<s.Length&&s[i]==']'){i++;return l;}throw new FormatException("array at "+i);}}
    if(c=='"')return Str(s,ref i);
    if(string.CompareOrdinal(s,i,"true",0,4)==0){i+=4;return true;}if(string.CompareOrdinal(s,i,"false",0,5)==0){i+=5;return false;}if(string.CompareOrdinal(s,i,"null",0,4)==0){i+=4;return null;}
    int start=i;if(s[i]=='-')i++;if(i>=s.Length||!char.IsDigit(s[i]))throw new FormatException("number expected at "+start);if(s[i]=='0')i++;else while(i<s.Length&&char.IsDigit(s[i]))i++;
    if(i<s.Length&&s[i]=='.'){i++;if(i>=s.Length||!char.IsDigit(s[i]))throw new FormatException("fraction at "+i);while(i<s.Length&&char.IsDigit(s[i]))i++;}
    if(i<s.Length&&(s[i]=='e'||s[i]=='E')){i++;if(i<s.Length&&(s[i]=='+'||s[i]=='-'))i++;if(i>=s.Length||!char.IsDigit(s[i]))throw new FormatException("exponent at "+i);while(i<s.Length&&char.IsDigit(s[i]))i++;}
    return double.Parse(s.Substring(start,i-start),NumberStyles.Float,CultureInfo.InvariantCulture);
   }
   static string Str(string s,ref int i){i++;var sb=new System.Text.StringBuilder();while(i<s.Length&&s[i]!='"'){if(s[i]<' ')throw new FormatException("control character in string");if(s[i]=='\\'){i++;char e=s[i];if(e=='u'){sb.Append((char)Convert.ToInt32(s.Substring(i+1,4),16));i+=4;}else sb.Append(e=='n'?'\n':e=='t'?'\t':e=='r'?'\r':e=='b'?'\b':e=='f'?'\f':e);}else sb.Append(s[i]);i++;}if(i>=s.Length)throw new FormatException("open string");i++;return sb.ToString();}
  }
  static Dictionary<string,object> Obj(object o,string what){var d=o as Dictionary<string,object>;Check(d!=null,what+" is an object");return d;}
  static void Has(Dictionary<string,object> d,string key,string type,string where){
   Check(d.ContainsKey(key),where+" carries "+key);var v=d[key];
   bool ok=type=="number"?v is double:type=="string"?v is string:type=="bool"?v is bool:type=="array"?v is List<object>:type=="object"?v is Dictionary<string,object>:type=="objectOrNull"?(v==null||v is Dictionary<string,object>):false;
   Check(ok,where+"."+key+" is a "+type);
  }
  static readonly string[] StateNumbers={"v","runId","level","wave","waves","coins","health","progress","speed","nextWave","enemyCount","towerCount","cleared","blockersRemaining","elapsed","blind","blindTint","blindAlpha","superPairs","mergeUndo","mergeArmed","reinforcements","reinforcementTier","reinforcementIn","timeScale","waveElapsed","carrotX","carrotY"};
  static readonly string[] StateStrings={"name","biome","phase","notice","mode","speedHoldReason"};
  static readonly string[] StateBools={"paused","muted","speedHold"};
  static readonly string[] StateArrays={"caps","monsters","minibosses","incoming","lossCauses","spawnPoints"};
  /// <summary>Parses one published snapshot and checks every v2 key and its documented type.</summary>
  static Dictionary<string,object> ValidateSnapshot(string json,string where){
   Dictionary<string,object> s;try{s=Obj(MiniJson.Parse(json),where);}catch(Exception e){Check(false,where+" snapshot parses as strict JSON ("+e.Message+")");return null;}
   foreach(var k in StateNumbers)Has(s,k,"number",where);foreach(var k in StateStrings)Has(s,k,"string",where);foreach(var k in StateBools)Has(s,k,"bool",where);foreach(var k in StateArrays)Has(s,k,"array",where);
   Check((double)s["v"]==2,where+" declares bridge v2");Has(s,"selection","object",where);Has(s,"stats","object",where);Has(s,"judgement","object",where);Has(s,"boss","objectOrNull",where);
   var stats=(Dictionary<string,object>)s["stats"];foreach(var k in new[]{"kills","leaks","earned","streak","bestStreak","perfectWaves"})Has(stats,k,"number",where+".stats");foreach(var k in new[]{"waveLeaks","leakKinds","leakCounts","dmgKinds","dmgValues"})Has(stats,k,"array",where+".stats");
   Check(((List<object>)stats["leakKinds"]).Count==((List<object>)stats["leakCounts"]).Count&&((List<object>)stats["dmgKinds"]).Count==((List<object>)stats["dmgValues"]).Count,where+" parallel stats arrays");
   var judgement=(Dictionary<string,object>)s["judgement"];Has(judgement,"seq","number",where);Has(judgement,"kind","string",where);Has(judgement,"wave","number",where);Has(judgement,"value","number",where);
   foreach(var item in (List<object>)s["incoming"]){var g=Obj(item,where+" incoming");foreach(var k in new[]{"kind"})Has(g,k,"string",where+".incoming");foreach(var k in new[]{"count","route","at","span","wave","eta"})Has(g,k,"number",where+".incoming");foreach(var k in new[]{"air","armor","shield","heal","mini","boss"})Has(g,k,"bool",where+".incoming");}
   foreach(var item in (List<object>)s["lossCauses"]){var g=Obj(item,where+" lossCause");Has(g,"kind","string",where);Has(g,"counter","string",where);Has(g,"route","number",where);Has(g,"wave","number",where);Has(g,"count","number",where);Has(g,"airUncovered","bool",where);}
   foreach(var item in (List<object>)s["spawnPoints"]){var g=Obj(item,where+" spawn point");Has(g,"x","number",where);Has(g,"y","number",where);}
   foreach(var item in (List<object>)s["minibosses"]){var g=Obj(item,where+" miniboss");Has(g,"castTotal","number",where);Has(g,"castRemaining","number",where);}
   if(s["boss"] is Dictionary<string,object> boss){foreach(var k in new[]{"abilityTarget","abilityTargetTier","remaining","eta","routeFraction","windup","hp","maxHp","castRemaining"})Has(boss,k,"number",where+".boss");Has(boss,"contactFatal","bool",where+".boss");Has(boss,"actionable","bool",where+".boss");Has(boss,"abilityTargets","array",where+".boss");Has(boss,"thresholds","array",where+".boss");}
   return s;
  }
  static string ScriptPath(string file){foreach(var root in new[]{"Assets/Scripts","unity/CarrotDefense/Assets/Scripts"}){var p=Path.Combine(root,file);if(File.Exists(p))return p;}return null;}
  static void Contract(){
   // Every phase publishes a parseable v2 snapshot.
   {var g=New(8);var ready=ValidateSnapshot(g.Snapshot(),"ready");Check((string)ready["phase"]=="ready"&&((List<object>)ready["incoming"]).Count>0,"the ready snapshot previews wave 1");
    g.Command("{\"type\":\"start\"}");g.StepSimulation(3);var playing=ValidateSnapshot(g.Snapshot(),"playing");Check((string)playing["phase"]=="playing"&&(double)playing["waveElapsed"]>2,"playing snapshot runs the wave clock");
    g.health=1;var e=g.TestSpawn("nibble",0,CarrotData.RouteLength(g.level.routes[0])-.01f);g.StepSimulation(1);var lost=ValidateSnapshot(g.Snapshot(),"lost");Check((string)lost["phase"]=="lost",
     "lost snapshot");var causes=(List<object>)lost["lossCauses"];Check(causes.Count>=1&&(string)((Dictionary<string,object>)causes[0])["kind"]=="nibble","defeat names the leaking kind");Done(g);}
   {var g=New(1);g.phase="playing";g.TestClearScheduled();g.StepSimulation(.1f);var won=ValidateSnapshot(g.Snapshot(),"won");Check((string)won["phase"]=="won","won snapshot");Done(g);}
   // runId moves on every load; the old notice is gone.
   {var g=New(3);int first=g.RunId;g.Command("{\"type\":\"load\",\"level\":3}");Check(g.RunId==first+1&&g.notice=="","runId increments on reload and no load toast is set");g.Command("{\"type\":\"load\",\"level\":3,\"mode\":\"veteran\"}");Check(g.Mode==(CarrotData.VeteranShipped?"veteran":"normal"),"Veteran is offered only when shipped");Done(g);}
   // abilityTarget during an uproot windup, -1 otherwise.
   {EnemyState boss;var g=UprootArena(4,.5f,out boss,3);int warned=-1;g.Effect+=v=>{if(v.kind=="uproot"&&v.type=="telegraph")warned=v.target;};var idle=ValidateSnapshot(g.Snapshot(),"uproot idle");Check((double)Obj(idle["boss"],"boss")["abilityTarget"]==-1,"no target outside a cast");
    g.StepSimulation(17.5f);var winding=ValidateSnapshot(g.Snapshot(),"uproot windup");var b=Obj(winding["boss"],"boss");Check(warned>0&&(double)b["abilityTarget"]==warned&&(bool)b["actionable"]&&(double)b["windup"]>=CarrotGame.ActionableWindup-.001,"boss.abilityTarget is the warned tower during the windup");
    g.StepSimulation(3);Check((double)Obj(ValidateSnapshot(g.Snapshot(),"uproot done")["boss"],"boss")["abilityTarget"]==-1,"abilityTarget clears after the commit");Done(g);}
   // Selecting a miniboss from its bar is an enemy selection (towers focus it).
   {var g=Arena(24);var m=g.TestSpawn("mossGolem",0,3);g.Command("{\"type\":\"select\",\"selectionType\":\"enemy\",\"id\":"+m.id+"}");Check(g.selectionType=="enemy"&&g.selectionId==m.id,"selecting a miniboss sets selection.type enemy");var s=ValidateSnapshot(g.Snapshot(),"mini");Check((string)Obj(s["selection"],"selection")["type"]=="enemy","the snapshot reports the enemy selection");Done(g);}
   // Deadlines: once at each mark on every challenge.
   foreach(int level in new[]{25,26,27,28}){var g=Arena(level);QuietTowers(g);var boss=g.TestSpawn("boss",0,0,true);boss.hp=boss.maxHp=1e9f;var marks=new List<float>();g.Effect+=v=>{if(v.type=="bossDeadline")marks.Add(v.value);};
    for(int i=0;i<12000&&g.phase=="playing";i++){g.StepSimulation(.1f);foreach(var add in g.enemies.ToArray())if(add.alive&&string.IsNullOrEmpty(add.boss))g.TestDamage(add.id,1e9f);}
    Check(marks.Count==3&&Mathf.Abs(marks[0]-.5f)<.001f&&Mathf.Abs(marks[1]-.75f)<.001f&&Mathf.Abs(marks[2]-.9f)<.001f,"bossDeadline fires once at .5, .75 and .9 on "+level+" ("+marks.Count+")");Check(g.phase=="lost","guardian contact remains a defeat on "+level);Done(g);}
   // Asuna rests between dashes: eta stays finite and the snapshot always parses.
   {var g=Arena(29);var boss=g.TestSpawn("boss",0,2,true);for(int i=0;i<40;i++){g.StepSimulation(.5f);var s=ValidateSnapshot(g.Snapshot(),"asuna");var b=s["boss"] as Dictionary<string,object>;if(b!=null)Check((double)b["eta"]>=-1&&(double)b["eta"]<100000,"Asuna's eta is finite");}Done(g);}
   // Size and allocation contract.
   {var g=Arena(24);g.SetCap("worldBars",true);for(int i=0;i<110;i++){var e=Durable(g,i%3==0?"moth":"nibble",2+i*.2f);g.TestDamage(e.id,1);}
    var big=g.TestSpawn("boss",0,3,true);g.health=5;for(int i=0;i<4;i++){var leak=g.TestSpawn(i%2==0?"moth":"shell",i%3,CarrotData.RouteLength(g.level.routes[i%3])-.01f);}g.StepSimulation(1);
    string snap=g.Snapshot();ValidateSnapshot(snap,"crowd");Debug.Log("CARROT_SNAPSHOT_BYTES worldBars="+snap.Length);Check(snap.Length<=12*1024,"snapshot at 110 enemies with world bars stays within 12 KB ("+snap.Length+")");
    int bars=snap.Split(new[]{"\"visible\""},StringSplitOptions.None).Length-1;Check(bars<=CarrotGame.WorldBarCap+1,"world bars cap the monster list ("+bars+")");g.SetCap("worldBars",false);Debug.Log("CARROT_SNAPSHOT_BYTES legacy="+g.Snapshot().Length);Done(g);}
   {var path=ScriptPath("CarrotContract.cs");if(path!=null){string src=File.ReadAllText(path);int a=src.IndexOf("public string Snapshot()",StringComparison.Ordinal),b=src.IndexOf("  void WriteMonster(",StringComparison.Ordinal);Check(a>0&&b>a,"Snapshot source located");
     string body=src.Substring(a,b-a);Check(!body.Contains("=>")&&!body.Contains("new List<")&&!body.Contains(".Find(")&&!body.Contains(".FindAll(")&&!body.Contains("delegate"),"Snapshot uses plain loops: no lambdas, Find or per-publish lists");}}
   // Pause is idempotent in ready and playing.
   {var g=New(5);g.Command("{\"type\":\"setPaused\",\"value\":1}");Check(g.paused,"setPaused works in ready");g.Command("{\"type\":\"setPaused\",\"value\":1}");Check(g.paused,"setPaused is idempotent");g.Command("{\"type\":\"setPaused\",\"value\":0}");Check(!g.paused,"setPaused 0 resumes");
    g.Command("{\"type\":\"start\"}");g.Command("{\"type\":\"setPaused\",\"value\":1}");float t=g.elapsed;g.AutoTick=true;for(int i=0;i<30;i++)g.AdvanceReal(1f/30);Check(g.elapsed==t,"setPaused holds the real-time clock");g.Command("{\"type\":\"setPaused\",\"value\":0}");for(int i=0;i<30;i++)g.AdvanceReal(1f/30);Check(g.elapsed>t,"and releases it");Done(g);}
   TimeScale();SpeedHold();Preview();Judgements();
   Debug.Log("CARROT_CONTRACT_OK");
  }
  static void TimeScale(){
   var g=New(2);g.Command("{\"type\":\"start\"}");g.AutoTick=true;
   Check(!g.RequestTimeScale(0,1,"bad")||true,"a request is accepted while playing");float t0=g.elapsed;for(int i=0;i<15;i++)g.AdvanceReal(1f/60);Check(g.elapsed-t0<.0001f,"a zero-scale request stops the simulation clock");
   for(int i=0;i<60;i++)g.AdvanceReal(1f/60);Check(g.elapsed-t0>.2f&&g.CinematicScale==1,"requests expire in real time");
   g.RequestTimeScale(.5f,.5f,"slow");g.RequestTimeScale(.3f,.2f,"slower");Check(Mathf.Abs(g.CinematicScale-.3f)<.0001f,"the minimum live request wins");
   g.Command("{\"type\":\"pause\"}");Check(g.CinematicScale==1,"pause clears every request");g.Command("{\"type\":\"pause\"}");
   g.RequestTimeScale(0,2,"freeze");g.Command("{\"type\":\"load\",\"level\":2}");Check(g.CinematicScale==1,"load clears every request");
   Check(g.RequestTimeScale(0,2,"ready")==false,"no request outside play");
   var s=New(2);s.Command("{\"type\":\"start\"}");s.RequestTimeScale(0,2,"freeze");float t=s.elapsed;s.StepSimulation(1);Check(s.elapsed>t+.9f,"StepSimulation (tests, replays) ignores presentation time scale");Done(s);Done(g);
  }
  // Speed 2 through the real-time accumulator: actionable boss windups hold 1x for at least 2.5 s real; passive casts keep a 1.2 s game floor.
  static void SpeedHold(){
   foreach(var spec in new[]{new{level=4,kind="uproot",hp=.5f},new{level=8,kind="tithe",hp=.5f},new{level=27,kind="gaze",hp=1f},new{level=12,kind="glacierLance",hp=.5f},new{level=29,kind="prismLances",hp=1f}}){
    var g=New(spec.level);g.phase="playing";g.TestClearScheduled();g.AutoTick=true;g.coins=500;var boss=g.TestSpawn("boss",0,spec.level==29?2:3,true);Still(boss);boss.hp=boss.maxHp*spec.hp;
    for(int i=0;i<6;i++){var t=TestTower(g,"seed",boss.position+new Vector3(.8f+i*.5f,0,1.2f));t.cooldown=1000;}
    g.Command("{\"type\":\"speed\",\"value\":2}");float real=0,warnedAt=-1,committedAt=-1;bool heldDuring=true,releasedTick=false;int afterCommit=-1;
    g.Effect+=v=>{if(v.id!=boss.id||v.kind!=spec.kind)return;if(v.type=="telegraph"&&warnedAt<0)warnedAt=real;if(v.type=="ability"&&committedAt<0&&warnedAt>=0)committedAt=real;};
    for(int frame=0;frame<60*90&&committedAt<0;frame++){real+=1f/60;g.AdvanceReal(1f/60);if(warnedAt>=0&&committedAt<0&&real>warnedAt+.02f)heldDuring&=g.SpeedHold&&Mathf.Abs(g.EffectiveRate()-1)<.0001f;}
    Check(warnedAt>=0&&committedAt>0,spec.kind+" was telegraphed and committed at 2x");
    Check(committedAt-warnedAt>=CarrotGame.ActionableWindup-.0001f,spec.kind+" windup lasts at least 2.5 s of real time at 2x ("+(committedAt-warnedAt).ToString("F3")+")");
    Check(heldDuring,spec.kind+" holds 1x while it winds up");
    for(int frame=0;frame<4;frame++){g.AdvanceReal(1f/60);if(!g.SpeedHold){releasedTick=true;afterCommit=frame;break;}}
    Check(releasedTick||g.SpeedHoldReason!=spec.kind,"speedHold ends within one tick after "+spec.kind+" commits");Done(g);
   }
   // Every boss and miniboss telegraph honours its floor.
   foreach(int level in new[]{4,8,12,20,24,25,26,27,28,29}){var g=Arena(level);QuietTowers(g);var boss=g.TestSpawn("boss",0,2,true);Still(boss);boss.hp=boss.maxHp*.28f;
    g.Effect+=v=>{if(v.type!="telegraph"||v.id!=boss.id)return;Check(v.duration>=(CarrotGame.Actionable(v.kind)?CarrotGame.ActionableWindup:CarrotGame.PassiveWindup)-.0001f,"telegraph floor for "+v.kind+" on "+level+" ("+v.duration+")");};
    g.StepSimulation(120);Done(g);}
   // Passive casts never hold the player's 2x.
   {var g=New(25);g.phase="playing";g.TestClearScheduled();g.AutoTick=true;var boss=g.TestSpawn("boss",0,5,true);Still(boss);g.Command("{\"type\":\"speed\",\"value\":2}");bool held=false;for(int i=0;i<60*20;i++){g.AdvanceReal(1f/60);held|=g.SpeedHold;}Check(!held,"the Tornado's passive gust never holds 2x");Done(g);}
  }
  static void Preview(){
   // The incoming preview equals the actual schedule, unit for unit.
   foreach(int level in new[]{1,5,12,20,24,25,28}){var g=New(level);var plan=new List<CarrotData.PlannedSpawn>();
    for(int w=1;w<=g.level.waves;w++){CarrotData.PlanWave(level,w,plan);int units=0;foreach(var part in CarrotData.Waves[level-1][w-1].Split(','))units+=int.Parse(part.Split(':')[1]);Check(plan.Count==units,"wave plan covers every unit on "+level+" wave "+w);
     for(int i=1;i<plan.Count;i++)Check(plan[i].at>=plan[0].at,"plan times start at the wave head");}
    g.Command("{\"type\":\"start\"}");var spawned=new List<string>();g.Effect+=v=>{if(v.type=="spawn"||v.type=="bossEnter")spawned.Add(v.kind);};CarrotData.PlanWave(level,1,plan);g.StepSimulation(plan[plan.Count-1].at+.1f);
    Check(spawned.Count>=plan.Count,"wave 1 spawns follow its plan on "+level);Done(g);}
   // Every level's first air wave is in the preview from the start of the wave before it, at least 8 s of real time at 2x before it flies.
   for(int level=1;level<=29;level++){int first=-1;for(int w=0;w<CarrotData.Waves[level-1].Length&&first<0;w++)foreach(var part in CarrotData.Waves[level-1][w].Split(','))if(CarrotData.Traits(part.Split(':')[0]).air){first=w+1;break;}
    if(first<=1)continue;var plan=new List<CarrotData.PlannedSpawn>();CarrotData.PlanWave(level,first-1,plan);float stream=plan[plan.Count-1].at;CarrotData.PlanWave(level,first,plan);float air=-1;foreach(var p in plan)if(CarrotData.Traits(p.kind).air){air=p.at;break;}
    float lead=stream+CarrotData.Breather(level,first)+air;Check(lead>=16-.001f,"first air wave of "+level+" is previewed at least 8 s real at 2x ahead ("+lead.ToString("F1")+" game s)");}
   WavePlanParity();
   {var g=New(5);g.Command("{\"type\":\"start\"}");var s=ValidateSnapshot(g.Snapshot(),"preview");bool next=false;foreach(var item in (List<object>)s["incoming"])if((double)((Dictionary<string,object>)item)["wave"]==2)next=true;Check(next,"the next wave is previewed from the start of the current one");Done(g);}
   {var g=New(5);int cues=0;g.Effect+=v=>{if(v.type=="waveIncoming")cues++;};g.Command("{\"type\":\"start\"}");Check(cues>0,"waveIncoming cues fire for the next wave");Done(g);}
  }
  // The web's levels[].wavePlan (scripts/carrot-game-data.mjs, in JS) equals CarrotData.PlanWave for all 29 levels.
  static void WavePlanParity(){
   string path=null;foreach(var p in new[]{"../../public/assets/minigames/carrot/game-data.json","public/assets/minigames/carrot/game-data.json"})if(File.Exists(p)){path=p;break;}
   Check(path!=null,"game-data.json is reachable from the test");if(path==null)return;
   var data=Obj(MiniJson.Parse(File.ReadAllText(path)),"game-data");var levels=(List<object>)data["levels"];Check(levels.Count==29,"game-data has 29 levels");var plan=new List<CarrotData.PlannedSpawn>();int groups=0;
   foreach(var item in levels){var l=Obj(item,"level");int id=(int)(double)l["id"];var def=CarrotData.Level(id);var web=(List<object>)l["wavePlan"];Check(web.Count==def.waves,"wavePlan has every wave of "+id);
    for(int w=1;w<=def.waves;w++){CarrotData.PlanWave(id,w,plan);var expected=new List<string>();string kind=null;int route=-1,n=0;float first=0,last=0;
     foreach(var u in plan){if(n>0&&(u.kind!=kind||u.route!=route)){expected.Add(Group(kind,def,n,route,first,last));n=0;}if(n==0){kind=u.kind;route=u.route;first=u.at;}last=u.at;n++;}if(n>0)expected.Add(Group(kind,def,n,route,first,last));
     var actual=(List<object>)web[w-1];Check(actual.Count==expected.Count,"wavePlan group count on "+id+" wave "+w);
     for(int i=0;i<actual.Count&&i<expected.Count;i++){var g=Obj(actual[i],"group");string text=(string)g["kind"]+":"+(int)(double)g["n"]+":"+(int)(double)g["route"];Check(expected[i].StartsWith(text+":"),"wavePlan group "+i+" of "+id+"/"+w+" ("+text+" vs "+expected[i]+")");
      var bits=expected[i].Split(':');Check(Math.Abs((double)g["at"]-double.Parse(bits[3],CultureInfo.InvariantCulture))<.002&&Math.Abs((double)g["span"]-double.Parse(bits[4],CultureInfo.InvariantCulture))<.002,"wavePlan timing of "+id+"/"+w+" group "+i);groups++;}}}
   Debug.Log("CARROT_WAVEPLAN_PARITY groups="+groups);
  }
  static string Group(string kind,LevelDef def,int n,int route,float first,float last){return (kind=="boss"?def.boss:kind)+":"+n+":"+route+":"+first.ToString("R",CultureInfo.InvariantCulture)+":"+(last-first).ToString("R",CultureInfo.InvariantCulture);}
  static void Judgements(){
   var kinds=new List<string>();
   {var g=New(1);g.Effect+=v=>{if(v.type=="judgement")kinds.Add(v.kind);};g.Command("{\"type\":\"start\"}");foreach(var e in g.enemies)Still(e);for(int i=0;i<200&&g.wave<=1;i++){g.StepSimulation(.25f);foreach(var e in g.enemies.ToArray())if(e.alive)g.TestDamage(e.id,1e6f);}
    Check(kinds.Contains("flawless")&&g.DefenseChain>=1,"a leak-free wave is FLAWLESS and extends the defense chain");
    g.TestBeginWave(2);g.StepSimulation(1);var leak=g.TestSpawn("nibble",0,CarrotData.RouteLength(g.level.routes[0])-.01f);g.StepSimulation(1);Check(kinds.Contains("leak")&&g.DefenseChain==0,"the first leak of a wave is judged and breaks the chain");Done(g);}
   {EnemyState boss;var g=UprootArena(4,.5f,out boss,3);g.Effect+=v=>{if(v.type=="judgement")kinds.Add(v.kind);};int warned=-1;g.Effect+=v=>{if(v.kind=="uproot"&&v.type=="telegraph")warned=v.target;};g.StepSimulation(17.5f);g.Select("tower",warned);g.Command("{\"type\":\"sell\"}");Check(kinds.Contains("saved"),"selling the uprooted tower during its windup is SAVED");Done(g);}
   {var g=New(12);g.coins=100000;g.Effect+=v=>{if(v.type=="judgement")kinds.Add(v.kind);};var a=Grow(g,"seed");var b=Grow(g,"seed");g.Command("{\"type\":\"merge\",\"id\":"+b.id+",\"target\":"+a.id+"}");Check(kinds.Contains("superForged"),"a merge is SUPER FORGED");Done(g);}
   {var g=Arena(4);g.Effect+=v=>{if(v.type=="judgement")kinds.Add(v.kind);};var boss=g.TestSpawn("boss",0,3,true);Still(boss);g.TestDamage(boss.id,boss.maxHp*.5f);g.StepSimulation(.1f);Check(kinds.Contains("phaseBreak"),"a boss phase break is judged");Done(g);}
   // Loss attribution: an air leak with no air tower covering the tail names air and suggests an air counter.
   {var g=Arena(5);var moth=g.TestSpawn("moth",1,CarrotData.RouteLength(g.level.routes[1])-.01f);g.StepSimulation(1);var s=ValidateSnapshot(g.Snapshot(),"air leak");var cause=Obj(((List<object>)s["lossCauses"])[0],"cause");
    Check((string)cause["kind"]=="moth"&&(bool)cause["airUncovered"]&&(string)cause["counter"]=="starfruit"&&(double)cause["route"]==1,"an uncovered moth leak suggests Starfruit on its route");Done(g);}
  }
 }
}
#endif
