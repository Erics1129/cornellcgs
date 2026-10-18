#if UNITY_EDITOR || CARROT_QA
using System;
using System.Collections.Generic;
using System.Globalization;
using System.Text;
using UnityEngine;

namespace CarrotTD {
 /// <summary>
 /// QA-only multiplayer determinism probe (editor, the standalone .NET simulation and CARROT_QA Web builds; never in a release
 /// player). Replays a recorded, tick-stamped op log through the real net seam and records NetDigest every 30 netTicks and the
 /// deep state hash every 300 and at wave starts, so a duo replica and a two-seat lockstep run can be compared across runtimes.
 /// Spec (text): first line "net=duo level=24 side=1 ticks=40000" or "net=endless seed=4242 ticks=60000" (add "silent=1" to measure
 /// the silent-replay rate: no Effect events), then one op JSON per line.
 ///  - duo: the half runs as a Replica (exactly what a partner's device does with the owner's ops).
 ///  - endless: lockstep with both seats' ops (what both devices execute).
 /// </summary>
 public sealed class CarrotNetDetRunner {
  public CarrotGame game;public string net="duo";public int level=25,side,maxTicks=40000;public uint seed=1;public bool done,silent;
  readonly List<NetOp> ops=new List<NetOp>();
  readonly StringBuilder log=new StringBuilder(1<<15),deep=new StringBuilder(1<<12);int lastWave,count,deepCount;public string runtime="unknown";ulong chain=1469598103934665603UL;
  public static CarrotNetDetRunner Parse(string spec){
   var r=new CarrotNetDetRunner();var lines=(spec??"").Replace("\r","").Split('\n');
   foreach(var part in lines[0].Split(new[]{' '},StringSplitOptions.RemoveEmptyEntries)){int eq=part.IndexOf('=');if(eq<0)continue;string k=part.Substring(0,eq),v=part.Substring(eq+1);
    switch(k){case "net":r.net=v;break;case "level":r.level=int.Parse(v,CultureInfo.InvariantCulture);break;case "side":r.side=int.Parse(v,CultureInfo.InvariantCulture);break;
     case "seed":r.seed=uint.Parse(v,CultureInfo.InvariantCulture);break;case "ticks":r.maxTicks=int.Parse(v,CultureInfo.InvariantCulture);break;case "silent":r.silent=v=="1";break;}}
   for(int i=1;i<lines.Length;i++){if(lines[i].Trim().Length==0)continue;var op=JsonUtility.FromJson<NetOp>(lines[i]);if(op!=null&&!string.IsNullOrEmpty(op.op))r.ops.Add(op);}
   return r;
  }
  public void Begin(CarrotGame g){
   game=g;g.AutoTick=false;
   if(net=="endless"){g.LoadLevel(CarrotDuoMaps.EndlessId,"endless",seed);g.NetBegin(NetMode.Lockstep,0);}
   else {g.LoadLevel(level,"duo",(uint)side);g.NetBegin(NetMode.Replica,side);}
   foreach(var op in ops){var c=op.Clone();if(net!="endless")c.seat=side;g.EnqueueOp(c);}
   lastWave=g.wave;done=false;count=0;
   g.NetTicked=Ticked;
  }
  void Ticked(int t){
   bool waveStart=game.wave!=lastWave;lastWave=game.wave;
   if(t%30==0){uint d,f;game.NetDigest(out d,out f);log.Append(d.ToString("x8")).Append(f.ToString("x8"));chain=(chain^(((ulong)d<<32)|f))*1099511628211UL;count++;}
   if(t%300==0||waveStart){deep.Append(t).Append(':').Append(game.NetDeepHash().ToString("x16")).Append(';');deepCount++;}
  }
  public void Step(int n){
   if(done)return;game.NetRunTo(Math.Min(maxTicks,game.NetTick+n),n,silent);
   bool over=game.phase=="won"||game.phase=="lost"||(net=="duo"&&game.DuoHold);
   if(over||game.NetTick>=maxTicks)done=true;
  }
  public string Result(){
   var sb=new StringBuilder(log.Length+deep.Length+512);
   sb.Append("{\"runtime\":\"").Append(runtime).Append("\",\"net\":\"").Append(net).Append("\",\"level\":").Append(game.level.id).Append(",\"side\":").Append(side).Append(",\"seed\":").Append(seed)
    .Append(",\"ticks\":").Append(game.NetTick).Append(",\"phase\":\"").Append(game.DuoHold?"hold":game.phase).Append("\",\"wave\":").Append(game.wave).Append(",\"coins\":").Append(game.coins).Append(",\"health\":").Append(game.health)
    .Append(",\"score\":").Append(game.EndlessScore).Append(",\"ops\":").Append(ops.Count).Append(",\"refused\":").Append(game.ReplicaRefused).Append(",\"late\":").Append(game.LateOps).Append(",\"digests\":").Append(count).Append(",\"deepCount\":").Append(deepCount)
    .Append(",\"chain\":\"").Append(chain.ToString("x16")).Append("\",\"schema\":\"").Append(CarrotNetState.SchemaHash().ToString("x8")).Append("\",\"deep\":\"").Append(deep).Append("\",\"digestLog\":\"").Append(log).Append("\"}");
   return sb.ToString();
  }
 }

#if !UNITY_EDITOR && CARROT_QA
 /// <summary>Web QA builds: SendMessage('CarrotNetDet','Begin',spec) / ('CarrotNetDet','Step','n') / ('CarrotNetDet','Result','').
 /// Logs CARROT_NETDET_BEGIN, CARROT_NETDET_DONE and the result in CARROT_NETDET_RESULT chunks (index/count, 7000 chars each).</summary>
 public sealed class CarrotNetDetProbe : MonoBehaviour {
  CarrotNetDetRunner run;
  [RuntimeInitializeOnLoadMethod(RuntimeInitializeLoadType.AfterSceneLoad)]
  static void Install(){var go=new GameObject("CarrotNetDet");DontDestroyOnLoad(go);go.AddComponent<CarrotNetDetProbe>();}
  public void Begin(string spec){
   var go=GameObject.Find("CarrotGame");var game=go!=null?go.GetComponent<CarrotGame>():null;if(game==null){Debug.Log("CARROT_NETDET_ERROR no CarrotGame");return;}
   run=CarrotNetDetRunner.Parse(spec);run.runtime="webgl-il2cpp "+Application.unityVersion;run.Begin(game);
   Debug.Log("CARROT_NETDET_BEGIN net="+run.net+" level="+run.level+" ops="+spec.Split('\n').Length);
  }
  public void Step(string n){
   if(run==null||run.done)return;int count;if(!int.TryParse(n,NumberStyles.Integer,CultureInfo.InvariantCulture,out count))count=90;
   run.Step(count);if(run.done)Debug.Log("CARROT_NETDET_DONE ticks="+run.game.NetTick+" phase="+run.game.phase);
  }
  public void Result(string unused){
   if(run==null){Debug.Log("CARROT_NETDET_ERROR no run");return;}
   string json=run.Result();const int size=7000;int parts=(json.Length+size-1)/size;
   for(int i=0;i<parts;i++)Debug.Log("CARROT_NETDET_RESULT "+i+"/"+parts+" "+json.Substring(i*size,Math.Min(size,json.Length-i*size)));
  }
 }
#endif

#if UNITY_EDITOR
 public static partial class CarrotSimulationTests {
  /// <summary>Standalone (.NET): carrot-sim --method NetDetSpecs outDir — records the duo and endless op logs (bot matches) as
  /// net-det specs and replays each on .NET into outDir/dotnet/*.json (the reference the browsers are compared with).</summary>
  public static void NetDetSpecs(string[] args){
   string dir=args.Length>0?args[0]:"output/carrot-net-det";System.IO.Directory.CreateDirectory(System.IO.Path.Combine(dir,"specs"));System.IO.Directory.CreateDirectory(System.IO.Path.Combine(dir,"dotnet"));
   policyMerges=true;scoreNoise=null;var specs=new List<KeyValuePair<string,string>>();
   foreach(var c in new[]{new{level=24,side=1},new{level=28,side=0},new{level=27,side=1},new{level=29,side=0}}){
    ClearBotCaches();var live=NetGame(c.level,"duo",(uint)c.side);live.NetBegin(NetMode.DuoOwn,c.side);SellUprooted(live);var tb=new TwinBot();var ops=new List<NetOp>();
    BuyBest(live,0);BuyBest(live,0);live.NetGo();int ticks=0;
    while((live.phase=="playing"||live.phase=="ready")&&!live.DuoHold&&ticks<40000){if(ticks%7==0)PolicyStep(live,0,tb);ops.AddRange(live.OutOps);live.OutOps.Clear();live.NetRunTo(live.NetTick+1,1,false);ticks++;}
    ops.AddRange(live.OutOps);
    var sb=new StringBuilder();sb.Append("net=duo level=").Append(c.level).Append(" side=").Append(c.side).Append(" ticks=").Append(live.NetTick).Append('\n');foreach(var op in ops){var j=new StringBuilder();CarrotNetSession.OpJson(j,op,true);sb.Append(j).Append('\n');}
    specs.Add(new KeyValuePair<string,string>("duo-l"+c.level+"s"+c.side,sb.ToString()));Done(live);
   }
   foreach(uint seed in new uint[]{4242,777}){
    var ops=new List<NetOp>();int end=0;RunEndless("E-R1",seed,15,4,(g,t)=>{end=g.NetTick;},ops);
    var sb=new StringBuilder();sb.Append("net=endless seed=").Append(seed).Append(" ticks=").Append(end).Append('\n');foreach(var op in ops){var j=new StringBuilder();CarrotNetSession.OpJson(j,op,true);sb.Append(j).Append('\n');}
    specs.Add(new KeyValuePair<string,string>("endless-"+seed,sb.ToString()));
   }
   foreach(var kv in specs){
    System.IO.File.WriteAllText(System.IO.Path.Combine(dir,"specs",kv.Key+".txt"),kv.Value);
    var run=CarrotNetDetRunner.Parse(kv.Value);run.runtime="dotnet "+Environment.Version;var obj=new GameObject("CarrotNetDetTest");var game=obj.AddComponent<CarrotGame>();game.EnableBridge=false;
    run.Begin(game);while(!run.done)run.Step(90);
    System.IO.File.WriteAllText(System.IO.Path.Combine(dir,"dotnet",kv.Key+".json"),run.Result());
    Debug.Log("CARROT_NETDET_SPEC "+kv.Key+" ticks="+game.NetTick+" phase="+(game.DuoHold?"hold":game.phase)+" wave="+game.wave+" score="+game.EndlessScore+" refused="+game.ReplicaRefused+" late="+game.LateOps);
    UnityEngine.Object.DestroyImmediate(obj);
   }
  }
 }
#endif
}
#endif
