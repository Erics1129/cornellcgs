#if UNITY_EDITOR || CARROT_QA
using System;
using System.Collections;
using System.Collections.Generic;
using System.Globalization;
using System.Reflection;
using System.Runtime.CompilerServices;
using System.Text;
using UnityEngine;

namespace CarrotTD {
 /// <summary>
 /// QA-only determinism probe (editor, the standalone .NET simulation and CARROT_QA Web builds; release players never contain it).
 /// Runs one level from a tick-stamped command list with AutoTick off, so every input lands on an exact tick, and folds each
 /// tick's state into hashes that can be compared across runtimes bit for bit:
 ///  - digest: CarrotGame.Digest() every tick (integers and raw float bits of coins, health, wave, elapsed, enemies, towers, blockers)
 ///  - deep:   a reflective walk of every instance field of CarrotGame (all partial files) every `every` ticks and at wave starts,
 ///            excluding only presentation/real-time fields (snapshot text, JSON scratch, real clocks, time-scale requests, mute).
 /// Spec (text): first line "level=20 mode=normal ticks=27000 every=30 bot=1 coins=0", then one "tick<TAB>command json" per line.
 /// bot=1 ignores the listed commands and lets a fixed greedy policy issue commands (recorded in the result as a replayable script).
 /// </summary>
 public sealed class CarrotDetRunner {
  const ulong Offset=1469598103934665603UL,Prime=1099511628211UL;
  public CarrotGame game;
  public int level=1,maxTicks=27000,every=30,botCoins;public string mode="normal";public bool bot;
  readonly List<int> at=new List<int>();readonly List<string> cmds=new List<string>();int next;
  public int tick,applied,nanFloats,deepCount,lastWave;public bool done;
  ulong chainDigest=Offset,chainDiscrete=Offset,chainDeep=Offset;
  readonly StringBuilder perTick=new StringBuilder(1<<16),deepLog=new StringBuilder(1<<14),waveLog=new StringBuilder(512),recorded=new StringBuilder(1<<14);
  public string runtime="unknown";
  double deepSeconds;

  public static CarrotDetRunner Parse(string spec){
   var r=new CarrotDetRunner();var lines=(spec??"").Replace("\r","").Split('\n');
   foreach(var part in lines[0].Split(new[]{' '},StringSplitOptions.RemoveEmptyEntries)){
    int eq=part.IndexOf('=');if(eq<0)continue;string k=part.Substring(0,eq),v=part.Substring(eq+1);
    switch(k){case "level":r.level=int.Parse(v,CultureInfo.InvariantCulture);break;case "mode":r.mode=v;break;case "ticks":r.maxTicks=int.Parse(v,CultureInfo.InvariantCulture);break;
     case "every":r.every=Math.Max(1,int.Parse(v,CultureInfo.InvariantCulture));break;case "bot":r.bot=v=="1";break;case "coins":r.botCoins=int.Parse(v,CultureInfo.InvariantCulture);break;}
   }
   for(int i=1;i<lines.Length;i++){var l=lines[i];if(l.Length==0)continue;int tab=l.IndexOf('\t');if(tab<0)continue;r.at.Add(int.Parse(l.Substring(0,tab),CultureInfo.InvariantCulture));r.cmds.Add(l.Substring(tab+1));}
   return r;
  }
  public void Begin(CarrotGame g){
   game=g;g.AutoTick=false;g.LoadLevel(level,mode);tick=0;next=0;applied=0;done=false;lastWave=g.wave;
   if(bot)PlanPads();
   ulong d0=DeepHash(g);deepLog.Append("0:").Append(d0.ToString("x16")).Append(';');
  }
  void Apply(string json){game.Command(json);applied++;if(bot)recorded.Append(tick).Append('\t').Append(json).Append('\n');}
  public void Step(int n){
   for(int k=0;k<n&&!done;k++){
    if(bot)Bot();else while(next<at.Count&&at[next]<=tick){Apply(cmds[next]);next++;}
    game.StepSimulation(1f/30f);
    tick++;
    ulong d=game.Digest(),dd=game.DiscreteDigest();
    chainDigest=(chainDigest^d)*Prime;chainDiscrete=(chainDiscrete^dd)*Prime;
    perTick.Append(((uint)(d^(d>>32))).ToString("x8"));
    bool waveChanged=game.wave!=lastWave;lastWave=game.wave;
    if(tick%every==0||waveChanged){
     var started=DateTime.UtcNow;ulong deep=DeepHash(game);deepSeconds+=(DateTime.UtcNow-started).TotalSeconds;deepCount++;
     chainDeep=(chainDeep^deep)*Prime;deepLog.Append(tick).Append(':').Append(deep.ToString("x16")).Append(';');
     if(waveChanged)waveLog.Append(game.wave).Append('@').Append(tick).Append(':').Append(deep.ToString("x16")).Append(';');
    }
    if(game.phase=="won"||game.phase=="lost"||tick>=maxTicks)done=true;
   }
  }
  public string Result(){
   ulong deep=DeepHash(game);var inv=CultureInfo.InvariantCulture;var sb=new StringBuilder(perTick.Length+deepLog.Length+recorded.Length+2048);
   sb.Append("{\"runtime\":\"").Append(runtime).Append("\",\"level\":").Append(level).Append(",\"mode\":\"").Append(mode).Append("\",\"bot\":").Append(bot?1:0).Append(",\"coinsBonus\":").Append(botCoins)
    .Append(",\"ticks\":").Append(tick).Append(",\"elapsedBits\":\"").Append(BitConverter.ToInt32(BitConverter.GetBytes(game.elapsed),0).ToString("x8")).Append("\",\"elapsed\":").Append(game.elapsed.ToString("R",inv))
    .Append(",\"phase\":\"").Append(game.phase).Append("\",\"wave\":").Append(game.wave).Append(",\"health\":").Append(game.health).Append(",\"coins\":").Append(game.coins)
    .Append(",\"towers\":").Append(game.towers.Count).Append(",\"kills\":").Append(game.Kills).Append(",\"earned\":").Append(game.TotalEarned).Append(",\"commands\":").Append(applied)
    .Append(",\"finalDigest\":\"").Append(game.Digest().ToString("x16")).Append("\",\"finalDiscrete\":\"").Append(game.DiscreteDigest().ToString("x16")).Append("\",\"finalDeep\":\"").Append(deep.ToString("x16"))
    .Append("\",\"chainDigest\":\"").Append(chainDigest.ToString("x16")).Append("\",\"chainDiscrete\":\"").Append(chainDiscrete.ToString("x16")).Append("\",\"chainDeep\":\"").Append(chainDeep.ToString("x16"))
    .Append("\",\"dataHash\":\"").Append(DataHash().ToString("x16")).Append("\",\"schema\":\"").Append(SchemaHash().ToString("x16")).Append("\",\"deepFields\":").Append(lastFieldCount)
    .Append(",\"nanFloats\":").Append(nanFloats).Append(",\"deepCount\":").Append(deepCount).Append(",\"deepMsAvg\":").Append((deepCount>0?deepSeconds*1000/deepCount:0).ToString("F3",inv))
    .Append(",\"waves\":\"").Append(waveLog).Append("\",\"deepLog\":\"").Append(deepLog).Append("\",\"perTick\":\"").Append(perTick).Append('"');
   if(bot){sb.Append(",\"script\":\"");foreach(char c in recorded.ToString()){if(c=='"'||c=='\\')sb.Append('\\').Append(c);else if(c=='\n')sb.Append("\\n");else if(c=='\t')sb.Append("\\t");else sb.Append(c);}sb.Append('"');}
   sb.Append('}');return sb.ToString();
  }

  // ---- Math probe: libm and float-contraction fingerprints over 200k pseudo-random inputs (one hash per operation family).
  // sinD/powD/expD/logD/atanD/sqrtD hash the double results; *F hash the float casts the simulation actually keeps
  // (Mathf.Sin is (float)Math.Sin); madF hashes a*b+c in float (a fused multiply-add changes it); divF, mixF plain float ops.
  public static string MathProbe(){
   uint s=0x9E3779B9u;Func<uint> next=()=>{s^=s<<13;s^=s>>17;s^=s<<5;return s;};
   ulong sinD=Offset,sinF=Offset,powD=Offset,powF=Offset,expD=Offset,logD=Offset,atanD=Offset,sqrtD=Offset,madF=Offset,divF=Offset,mixF=Offset,vecF=Offset;
   for(int i=0;i<200000;i++){
    float a=(next()%2000000)/1000f-1000f,b=(next()%200000)/10000f-10f,c=(next()%2000000)/997f-1000f;double x=a*0.01;
    double sd=Math.Sin(x);Mix(ref sinD,(ulong)BitConverter.DoubleToInt64Bits(sd));Mix(ref sinF,(ulong)(uint)BitConverter.ToInt32(BitConverter.GetBytes(Mathf.Sin(a*.01f)),0));
    double pd=Math.Pow(.78,(i%7)+b*.1);Mix(ref powD,(ulong)BitConverter.DoubleToInt64Bits(pd));Mix(ref powF,(ulong)(uint)BitConverter.ToInt32(BitConverter.GetBytes((float)pd),0));
    Mix(ref expD,(ulong)BitConverter.DoubleToInt64Bits(Math.Exp(b)));Mix(ref logD,(ulong)BitConverter.DoubleToInt64Bits(Math.Log(Math.Abs(a)+1)));
    Mix(ref atanD,(ulong)BitConverter.DoubleToInt64Bits(Math.Atan2(b,a+.5)));Mix(ref sqrtD,(ulong)BitConverter.DoubleToInt64Bits(Math.Sqrt(Math.Abs(x))));
    float m=a*b+c;Mix(ref madF,(ulong)(uint)BitConverter.ToInt32(BitConverter.GetBytes(m),0));
    float q=a/(Math.Abs(b)+.001f);Mix(ref divF,(ulong)(uint)BitConverter.ToInt32(BitConverter.GetBytes(q),0));
    float k=(a-c)*(b+.5f)-a*c*.001f;Mix(ref mixF,(ulong)(uint)BitConverter.ToInt32(BitConverter.GetBytes(k),0));
    var v=new Vector3(a,b,c);float len=v.magnitude;var n=v.normalized;Mix(ref vecF,(ulong)(uint)BitConverter.ToInt32(BitConverter.GetBytes(len+n.x+Vector3.Dot(v,n)),0));
   }
   Func<ulong,string> hx=v=>v.ToString("x16");
   return "{\"sinD\":\""+hx(sinD)+"\",\"sinF\":\""+hx(sinF)+"\",\"powD\":\""+hx(powD)+"\",\"powF\":\""+hx(powF)+"\",\"expD\":\""+hx(expD)+"\",\"logD\":\""+hx(logD)+"\",\"atanD\":\""+hx(atanD)+"\",\"sqrtD\":\""+hx(sqrtD)+"\",\"madF\":\""+hx(madF)+"\",\"divF\":\""+hx(divF)+"\",\"mixF\":\""+hx(mixF)+"\",\"vecF\":\""+hx(vecF)+"\"}";
  }

  // ---- A fixed greedy policy (inputs only through Command json, so the recorded script replays exactly).
  int[] padOrder;int kindIndex,builds,merges,lastMergeTick=-99999;bool undone,sold;
  void PlanPads(){
   var lv=game.level;var score=new float[lv.pads.Length];
   foreach(var route in lv.routes){float len=CarrotData.RouteLength(route);for(float s=0;s<=len;s+=.5f){Vector3 dir;var p=CarrotData.RoutePoint(route,s,out dir);for(int i=0;i<lv.pads.Length;i++){float dx=lv.pads[i].x-p.x,dz=lv.pads[i].z-p.z;if(dx*dx+dz*dz<=9f)score[i]+=1;}}}
   var order=new List<int>();for(int i=0;i<score.Length;i++)order.Add(i);
   order.Sort((a,b)=>{int c=score[b].CompareTo(score[a]);return c!=0?c:a.CompareTo(b);});padOrder=order.ToArray();
  }
  string[] Unlocked(){var list=new List<string>();foreach(var t in CarrotData.Towers)if(t.unlock<=game.level.id)list.Add(t.id);return list.ToArray();}
  bool Occupied(int pad){foreach(var t in game.towers)if(t.pad==pad)return true;foreach(var b in game.blockers)if(b.pad==pad)return true;return false;}
  bool TryBuild(){
   var kinds=Unlocked();string kind=kinds[kindIndex%kinds.Length];var d=CarrotData.Tower(kind);if(game.coins<d.cost[0])return false;
   foreach(int p in padOrder){if(Occupied(p))continue;Apply("{\"type\":\"select\",\"selectionType\":\"pad\",\"id\":"+p+"}");Apply("{\"type\":\"buy\",\"kind\":\""+kind+"\"}");kindIndex++;builds++;return true;}
   return false;
  }
  bool TryUpgrade(){
   TowerState best=null;foreach(var t in game.towers)if(t.tier<4&&(best==null||t.tier<best.tier))best=t;if(best==null)return false;
   var d=CarrotData.Tower(best.kind);if(game.coins<d.cost[best.tier])return false;
   Apply("{\"type\":\"select\",\"selectionType\":\"tower\",\"id\":"+best.id+"}");Apply("{\"type\":\"upgrade\"}");return true;
  }
  bool TryMerge(){
   foreach(var a in game.towers){if(a.tier!=4)continue;foreach(var b in game.towers)if(b.id>a.id&&b.tier==4&&b.kind==a.kind){Apply("{\"type\":\"merge\",\"id\":"+b.id+",\"target\":"+a.id+"}");merges++;lastMergeTick=tick;return true;}}
   return false;
  }
  void Bot(){
   var g=game;
   if(tick==0&&botCoins>0)Apply("{\"type\":\"debugCoins\",\"value\":"+botCoins+"}");
   if(tick%15!=0)return;
   if(g.phase=="ready"){for(int i=0;i<3;i++)if(!TryBuild())break;Apply("{\"type\":\"start\"}");return;}
   if(g.phase!="playing")return;
   int slot=tick/15;
   // A pause/resume pair (paused ticks do not advance), one undo of the first merge, one sale, early calls and focus fire.
   if(tick==600||tick==660){Apply("{\"type\":\"pause\"}");return;}
   if(merges==1&&!undone&&tick-lastMergeTick>=15&&tick-lastMergeTick<=90){Apply("{\"type\":\"mergeUndo\"}");undone=true;return;}
   if(!sold&&tick>=1800){TowerState s=null;foreach(var t in g.towers)if(t.tier==1&&(s==null||t.id>s.id))s=t;if(s!=null){Apply("{\"type\":\"select\",\"selectionType\":\"tower\",\"id\":"+s.id+"}");Apply("{\"type\":\"sell\"}");sold=true;return;}}
   for(int a=0;a<3;a++){
    bool did=false;
    if(slot%20==0&&TryMerge())did=true;
    else if(g.towers.Count<4+builds/2||AllMaxed())did=TryBuild()||TryUpgrade();
    else did=TryUpgrade()||TryBuild();
    if(!did)break;
   }
   EnemyState boss=null;foreach(var e in g.enemies)if(e.alive&&!string.IsNullOrEmpty(e.boss)&&!e.hidden){boss=e;break;}
   if(boss!=null&&slot%6==0&&!(g.selectionType=="enemy"&&g.selectionId==boss.id))Apply("{\"type\":\"select\",\"selectionType\":\"enemy\",\"id\":"+boss.id+"}");
   else if(boss==null&&slot%30==0){foreach(var b in g.blockers)if(b.ownerEnemy==0||b.kind=="root"||b.kind=="grave"){if(!(g.selectionType=="blocker"&&g.selectionId==b.id))Apply("{\"type\":\"select\",\"selectionType\":\"blocker\",\"id\":"+b.id+"}");break;}}
   if(g.nextWave>0&&slot%8==0)Apply("{\"type\":\"next\"}");
  }
  bool AllMaxed(){foreach(var t in game.towers)if(t.tier<4)return false;return true;}

  // ---- Reflective hash of the authoritative state.
  static readonly HashSet<string> Skip=new HashSet<string>{
   "<LastSnapshot>k__BackingField","json","ordinary","hurtBars","walk","candidates","removeIds","leakOrder", // presentation text and scratch lists
   "accumulator","realClock","bridgeClock","backgrounded","timeScaleRequests","<TimeScaleRequestCount>k__BackingField","<TimeScaleReason>k__BackingField", // real-time only
   "muted","caps","EnableBridge","<RunId>k__BackingField","Effect","level","wavePlans","tailSamples", // view toggles and caps, the load counter, the event delegate, static level data (hashed separately by DataHash)
  };
  int lastFieldCount;int fieldCount;
  readonly Dictionary<Type,FieldInfo[]> fieldCache=new Dictionary<Type,FieldInfo[]>();
  readonly StringBuilder schema=new StringBuilder();
  readonly Dictionary<object,int> seen=new Dictionary<object,int>(new RefEq());
  sealed class RefEq : IEqualityComparer<object> {public new bool Equals(object a,object b){return ReferenceEquals(a,b);}public int GetHashCode(object o){return RuntimeHelpers.GetHashCode(o);}}
  FieldInfo[] Fields(Type t,bool declaredOnly){
   FieldInfo[] f;if(fieldCache.TryGetValue(t,out f))return f;
   var flags=BindingFlags.Instance|BindingFlags.Public|BindingFlags.NonPublic|(declaredOnly?BindingFlags.DeclaredOnly:0);
   var list=new List<FieldInfo>();
   for(var tt=t;tt!=null&&tt!=typeof(object);tt=declaredOnly?null:tt.BaseType)foreach(var fi in tt.GetFields(flags|BindingFlags.DeclaredOnly)){if(typeof(Delegate).IsAssignableFrom(fi.FieldType))continue;if(declaredOnly&&Skip.Contains(fi.Name))continue;list.Add(fi);}
   list.Sort((a,b)=>string.CompareOrdinal(a.Name,b.Name));f=list.ToArray();fieldCache[t]=f;
   schema.Append(t.Name).Append('{');foreach(var fi in f)schema.Append(fi.Name).Append(',');schema.Append('}');
   return f;
  }
  public ulong DeepHash(CarrotGame g){
   ulong h=Offset;seen.Clear();fieldCount=0;
   foreach(var f in Fields(typeof(CarrotGame),true)){fieldCount++;Value(ref h,f.GetValue(g),0);}
   lastFieldCount=fieldCount;return h;
  }
  public ulong DataHash(){ulong h=Offset;seen.Clear();Value(ref h,CarrotData.Levels,0);Value(ref h,CarrotData.Towers,0);return h;}
  ulong SchemaHash(){ulong h=Offset;foreach(char c in schema.ToString())Mix(ref h,c);return h;}
  public string Schema(){return schema.ToString();}
  static void Mix(ref ulong h,ulong v){h^=v;h*=Prime;}
  void Float(ref ulong h,float f){if(float.IsNaN(f)){nanFloats++;Mix(ref h,0x7fc00000UL);return;}Mix(ref h,(ulong)(uint)BitConverter.ToInt32(BitConverter.GetBytes(f),0));}
  void Value(ref ulong h,object v,int depth){
   if(v==null){Mix(ref h,0xA5A5UL);return;}
   switch(v){
    case float f:Float(ref h,f);return;
    case double d:if(double.IsNaN(d)){nanFloats++;Mix(ref h,0x7ff8000000000000UL);}else Mix(ref h,(ulong)BitConverter.DoubleToInt64Bits(d));return;
    case int i:Mix(ref h,(ulong)(long)i);return;
    case uint u:Mix(ref h,u);return;
    case long l:Mix(ref h,(ulong)l);return;
    case ulong ul:Mix(ref h,ul);return;
    case bool b:Mix(ref h,b?3UL:5UL);return;
    case string s:Mix(ref h,(ulong)s.Length);foreach(char c in s)Mix(ref h,c);return;
    case Vector3 p:Float(ref h,p.x);Float(ref h,p.y);Float(ref h,p.z);return;
   }
   var t=v.GetType();
   if(t.IsEnum){Mix(ref h,(ulong)Convert.ToInt64(v,CultureInfo.InvariantCulture));return;}
   if(t.IsPrimitive){Mix(ref h,(ulong)Convert.ToInt64(v,CultureInfo.InvariantCulture));return;}
   if(v is UnityEngine.Object||v is Delegate||v is StringBuilder){Mix(ref h,0x5EEDUL);return;}
   if(depth>8){Mix(ref h,0xDEE9UL);return;}
   if(!t.IsValueType){int mark;if(seen.TryGetValue(v,out mark)){Mix(ref h,0xB0B0UL+(ulong)mark);return;}seen[v]=seen.Count;}
   if(v is IDictionary dict){
    var keys=new List<object>();foreach(var k in dict.Keys)keys.Add(k);
    if(keys.Count>0&&keys[0] is int)keys.Sort((a,b)=>((int)a).CompareTo((int)b));
    Mix(ref h,(ulong)keys.Count);foreach(var k in keys){Value(ref h,k,depth+1);Value(ref h,dict[k],depth+1);}return;
   }
   if(v is IList list){Mix(ref h,(ulong)list.Count);for(int i=0;i<list.Count;i++)Value(ref h,list[i],depth+1);return;}
   if(v is IEnumerable seq){
    var items=new List<object>();foreach(var x in seq)items.Add(x);
    if(t.Name.StartsWith("HashSet",StringComparison.Ordinal)&&items.Count>0&&items[0] is int)items.Sort((a,b)=>((int)a).CompareTo((int)b));
    Mix(ref h,(ulong)items.Count);foreach(var x in items)Value(ref h,x,depth+1);return;
   }
   foreach(var f in Fields(t,false)){fieldCount++;Value(ref h,f.GetValue(v),depth+1);}
  }
 }

#if !UNITY_EDITOR && CARROT_QA
 /// <summary>Web QA builds: SendMessage('CarrotDet','Begin',spec) / ('CarrotDet','Step','n') / ('CarrotDet','Result','').
 /// Logs CARROT_DET_BEGIN, CARROT_DET_DONE and the result JSON in CARROT_DET_RESULT chunks (index/count, 7000 chars each).</summary>
 public sealed class CarrotDetProbe : MonoBehaviour {
  CarrotDetRunner run;
  [RuntimeInitializeOnLoadMethod(RuntimeInitializeLoadType.AfterSceneLoad)]
  static void Install(){var go=new GameObject("CarrotDet");DontDestroyOnLoad(go);go.AddComponent<CarrotDetProbe>();}
  public void Begin(string spec){
   var game=FindFirstObjectByType<CarrotGame>();if(game==null){Debug.Log("CARROT_DET_ERROR no CarrotGame");return;}
   run=CarrotDetRunner.Parse(spec);run.runtime="webgl-il2cpp "+Application.unityVersion;run.Begin(game);
   Debug.Log("CARROT_DET_BEGIN level="+run.level+" bot="+(run.bot?1:0)+" fields="+run.Schema().Length);
  }
  public void Step(string n){
   if(run==null||run.done)return;int count;if(!int.TryParse(n,NumberStyles.Integer,CultureInfo.InvariantCulture,out count))count=30;
   run.Step(count);if(run.done)Debug.Log("CARROT_DET_DONE level="+run.level+" ticks="+run.tick+" phase="+run.game.phase);
  }
  public void Result(string unused){
   if(run==null){Debug.Log("CARROT_DET_ERROR no run");return;}
   string json=run.Result();const int size=7000;/* the Web player truncates one log message at 8191 characters */int parts=(json.Length+size-1)/size;
   for(int i=0;i<parts;i++)Debug.Log("CARROT_DET_RESULT "+i+"/"+parts+" "+json.Substring(i*size,Math.Min(size,json.Length-i*size)));
  }
  public void Schema(string unused){if(run!=null)Debug.Log("CARROT_DET_SCHEMA "+run.Schema());}
  public void MathProbe(string unused){Debug.Log("CARROT_DET_MATH "+CarrotDetRunner.MathProbe());}
 }
#endif

#if UNITY_EDITOR
 public static partial class CarrotSimulationTests {
  /// <summary>Standalone (.NET) entry: carrot-sim --method DetRun specFile outFile [step].</summary>
  public static void DetRun(string[] args){
   string spec=System.IO.File.ReadAllText(args[0]);var run=CarrotDetRunner.Parse(spec);
#if CARROT_STANDALONE_TEST
   run.runtime="dotnet "+Environment.Version;
#else
   run.runtime="editor-mono "+Application.unityVersion;
#endif
   var obj=new GameObject("CarrotDetTest");var game=obj.AddComponent<CarrotGame>();game.AutoTick=false;game.EnableBridge=false;
   run.Begin(game);int step=args.Length>2?int.Parse(args[2],CultureInfo.InvariantCulture):60;while(!run.done)run.Step(step);
   System.IO.File.WriteAllText(args[1],run.Result());System.IO.File.WriteAllText(args[1]+".schema.txt",run.Schema());
   Debug.Log("CARROT_DET_DONE level="+run.level+" ticks="+run.tick+" phase="+game.phase+" out="+args[1]);
   UnityEngine.Object.DestroyImmediate(obj);
  }
  /// <summary>Standalone (.NET) entry: carrot-sim --method DetMath outFile.</summary>
  public static void DetMath(string[] args){System.IO.File.WriteAllText(args[0],CarrotDetRunner.MathProbe());Debug.Log("CARROT_DET_MATH "+CarrotDetRunner.MathProbe());}
  /// <summary>Editor batch entry (carrot-unity-build --method CarrotTD.CarrotSimulationTests.DetRunEditor): runs every
  /// "spec out" pair listed one per line in the file named by CARROT_DET_LIST.</summary>
  public static void DetRunEditor(){
   string list=Environment.GetEnvironmentVariable("CARROT_DET_LIST");
   foreach(var line in System.IO.File.ReadAllLines(list)){var parts=line.Split('\t');if(parts.Length<2)continue;DetRun(new[]{parts[0],parts[1]});}
   string math=Environment.GetEnvironmentVariable("CARROT_DET_MATH_OUT");if(!string.IsNullOrEmpty(math))System.IO.File.WriteAllText(math,CarrotDetRunner.MathProbe());
   Debug.Log("CARROT_DET_EDITOR_OK");
  }
 }
#endif
}
#endif
