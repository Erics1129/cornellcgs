using System;
using System.Collections;
using System.Collections.Generic;
using System.IO;
using System.Reflection;
using System.Text;
using UnityEngine;

namespace CarrotTD {
 /// <summary>
 /// Full-state export and import of one CarrotGame (resync after a desync, reconnect beyond the op-log cap) and the deep
 /// consistency hash. One reflective walk over every instance field of CarrotGame (all partial files), sorted by name, in three
 /// sinks: a binary writer (floats as raw bits, lossless), a reader, and an FNV hash with NaN folded to one value. The exclusion
 /// list is the determinism probe's (presentation, real clocks, time-scale requests, snapshot text, JSON scratch, static level
 /// data) plus the multiplayer locals (selection, notice, preview, merge arm, the op queue, intents, clock pacing).
 /// The blob is base64 for the bridge; the page compresses it (CompressionStream) before it travels.
 /// </summary>
 public sealed partial class CarrotGame {
  /// <summary>Ops stamped at or below this tick are already part of an imported state and are dropped quietly.</summary>
  int importedThrough=-1;
  public string ExportStateBase64(){return Convert.ToBase64String(CarrotNetState.Export(this));}
  public bool ImportStateBase64(string b64,out string error){
   byte[] data;try{data=Convert.FromBase64String(b64??"");}catch(Exception e){error="base64: "+e.Message;return false;}
   return CarrotNetState.Import(this,data,out error);
  }
  internal void AfterImport(int tick){
   importedThrough=tick;for(int i=netQueue.Count-1;i>=0;i--)if(netQueue[i].k<=tick)netQueue.RemoveAt(i);
   if(isEndless){EnsurePlan(wave);EnsurePlan(wave+1);}
   if(selectionType=="tower"&&TowerById(selectionId)==null)SetSelection("",-1);
   if(selectionType=="enemy"&&EnemyById(selectionId)==null)SetSelection("",-1);
   if(selectionType=="blocker"&&BlockerById(selectionId)==null)SetSelection("",-1);
   if(mergeArmed>0&&TowerById(mergeArmed)==null)mergeArmed=0;
   UpdateProgress();Publish();
  }
  public ulong NetDeepHash(){return CarrotNetState.DeepHash(this);}
  internal uint NetArg {get{return isEndless?endlessSeed:(uint)Mathf.Max(0,DuoSideIndex);}}
 }

 public static class CarrotNetState {
  const uint Magic=0x31534E43; // "CNS1"
  /// <summary>Fields that are not shared simulation state.</summary>
  static readonly HashSet<string> Skip=new HashSet<string>{
   "<LastSnapshot>k__BackingField","json","ordinary","hurtBars","walk","candidates","removeIds","leakOrder","tickOps",
   "accumulator","realClock","bridgeClock","backgrounded","timeScaleRequests","<TimeScaleRequestCount>k__BackingField","<TimeScaleReason>k__BackingField",
   "muted","caps","EnableBridge","AutoTick","SnapshotEnabled","AwakeLevel","AwakeMode","AwakeArg","<RunId>k__BackingField","Effect","level","wavePlans","tailSamples",
   "selectionType","selectionId","mergeArmed","<PreviewKind>k__BackingField","notice","noticeUntil","noticeSeat","paused","speed",
   "<NetMode>k__BackingField","<NetSeat>k__BackingField","NetNames","netQueue","seenOps","PendingOps","OutOps","NetRejects","<ReplicaRefused>k__BackingField","<LateOps>k__BackingField",
   "NetTicked","NetOutcome","localSeq","netClockRun","netAccumulator","netSpeed","lockSolo","silentRun","<MatchPaused>k__BackingField","<PausedBy>k__BackingField","<LastReject>k__BackingField",
   "endlessSchedule","<SummonsFolded>k__BackingField","partnerCleared","importedThrough","muting",
  };
  static readonly Dictionary<Type,FieldInfo[]> cache=new Dictionary<Type,FieldInfo[]>();
  static FieldInfo[] Fields(Type t){
   lock(cache){
    FieldInfo[] f;if(cache.TryGetValue(t,out f))return f;
    var list=new List<FieldInfo>();bool top=t==typeof(CarrotGame);
    foreach(var fi in t.GetFields(BindingFlags.Instance|BindingFlags.Public|BindingFlags.NonPublic|BindingFlags.DeclaredOnly)){
     if(typeof(Delegate).IsAssignableFrom(fi.FieldType)||fi.IsNotSerialized&&!top)continue;if(top&&Skip.Contains(fi.Name))continue;list.Add(fi);}
    list.Sort((a,b)=>string.CompareOrdinal(a.Name,b.Name));f=list.ToArray();cache[t]=f;return f;
   }
  }
  /// <summary>The field list (types and names) the blob follows: two builds can exchange states only when it matches.</summary>
  public static string Schema(){var sb=new StringBuilder();var seen=new HashSet<Type>();SchemaOf(typeof(CarrotGame),sb,seen);return sb.ToString();}
  static void SchemaOf(Type t,StringBuilder sb,HashSet<Type> seen){
   if(!seen.Add(t))return;sb.Append(t.Name).Append('{');var nested=new List<Type>();
   foreach(var f in Fields(t)){sb.Append(f.FieldType.Name).Append(' ').Append(f.Name).Append(';');Collect(f.FieldType,nested);}
   sb.Append('}');foreach(var n in nested)SchemaOf(n,sb,seen);
  }
  static void Collect(Type t,List<Type> into){
   if(t.IsArray){Collect(t.GetElementType(),into);return;}
   if(t.IsGenericType){foreach(var a in t.GetGenericArguments())Collect(a,into);return;}
   if(t.IsClass&&t!=typeof(string)&&!t.IsPrimitive&&t.Namespace=="CarrotTD")into.Add(t);
  }
  static uint schemaHash;
  public static uint SchemaHash(){if(schemaHash==0){uint h=2166136261u;foreach(char c in Schema()){h^=c;h*=16777619u;}schemaHash=h==0?1:h;}return schemaHash;}

  // ---- Sinks.
  abstract class Sink {public abstract void I(int v);public abstract void U(uint v);public abstract void L(long v);public abstract void F(float v);public abstract void B(bool v);public abstract void S(string v);}
  sealed class WriteSink : Sink {
   public readonly BinaryWriter w;public WriteSink(Stream s){w=new BinaryWriter(s,Encoding.UTF8);}
   public override void I(int v){w.Write(v);}public override void U(uint v){w.Write(v);}public override void L(long v){w.Write(v);}public override void F(float v){w.Write(v);}public override void B(bool v){w.Write(v);}
   public override void S(string v){w.Write(v!=null);if(v!=null)w.Write(v);}
  }
  sealed class HashSink : Sink {
   public ulong h=1469598103934665603UL;void M(ulong v){h^=v;h*=1099511628211UL;}
   public override void I(int v){M((ulong)(long)v);}public override void U(uint v){M(v);}public override void L(long v){M((ulong)v);}public override void B(bool v){M(v?3UL:5UL);}
   public override void F(float v){M(float.IsNaN(v)?0x7FC00000UL:(ulong)(uint)BitConverter.ToInt32(BitConverter.GetBytes(v),0));}
   public override void S(string v){if(v==null){M(0xA5A5UL);return;}M((ulong)v.Length);for(int i=0;i<v.Length;i++)M(v[i]);}
  }

  public static byte[] Export(CarrotGame g){
   using var ms=new MemoryStream(16384);var s=new WriteSink(ms);
   s.U(Magic);s.U(SchemaHash());s.I(g.level.id);s.S(g.Mode);s.U(g.NetArg);s.I(g.speed>=1.5f?2:1);s.I(g.NetTick);
   var seen=new HashSet<object>(RefEq.Instance);
   foreach(var f in Fields(typeof(CarrotGame)))Write(s,f.FieldType,f.GetValue(g),seen);
   s.w.Flush();return ms.ToArray();
  }
  public static ulong DeepHash(CarrotGame g){
   var s=new HashSink();s.I(g.level.id);var seen=new HashSet<object>(RefEq.Instance);
   foreach(var f in Fields(typeof(CarrotGame)))Write(s,f.FieldType,f.GetValue(g),seen);
   if(g.NetMode==NetMode.Lockstep)s.I(g.speed>=1.5f?2:1);
   return s.h;
  }
  sealed class RefEq : IEqualityComparer<object> {public static readonly RefEq Instance=new RefEq();public new bool Equals(object a,object b){return ReferenceEquals(a,b);}public int GetHashCode(object o){return System.Runtime.CompilerServices.RuntimeHelpers.GetHashCode(o);}}

  static void Write(Sink s,Type t,object v,HashSet<object> seen){
   if(t==typeof(int)){s.I((int)v);return;}if(t==typeof(float)){s.F((float)v);return;}if(t==typeof(bool)){s.B((bool)v);return;}
   if(t==typeof(string)){s.S((string)v);return;}if(t==typeof(uint)){s.U((uint)v);return;}if(t==typeof(long)){s.L((long)v);return;}
   if(t==typeof(Vector3)){var p=(Vector3)v;s.F(p.x);s.F(p.y);s.F(p.z);return;}
   if(t.IsEnum){s.I(Convert.ToInt32(v));return;}
   if(t.IsValueType&&!t.IsPrimitive){foreach(var f in Fields(t))Write(s,f.FieldType,f.GetValue(v),seen);return;}
   if(v==null){s.I(-1);return;}
   if(!seen.Add(v))throw new InvalidOperationException("CarrotNetState: shared reference in "+t.Name);
   if(t.IsArray){var a=(Array)v;var et=t.GetElementType();s.I(a.Length);for(int i=0;i<a.Length;i++)Write(s,et,a.GetValue(i),seen);return;}
   if(t.IsGenericType){
    var def=t.GetGenericTypeDefinition();var args=t.GetGenericArguments();
    if(def==typeof(List<>)){var l=(IList)v;s.I(l.Count);for(int i=0;i<l.Count;i++)Write(s,args[0],l[i],seen);return;}
    if(def==typeof(Dictionary<,>)){var d=(IDictionary)v;var keys=new List<int>();foreach(var k in d.Keys)keys.Add((int)k);keys.Sort();s.I(keys.Count);foreach(int k in keys){s.I(k);Write(s,args[1],d[k],seen);}return;}
    if(def==typeof(HashSet<>)){var items=new List<long>();foreach(var x in (IEnumerable)v)items.Add(Convert.ToInt64(x));items.Sort();s.I(items.Count);foreach(long x in items)s.L(x);return;}
    throw new InvalidOperationException("CarrotNetState: unsupported "+t.Name);
   }
   s.I(1);foreach(var f in Fields(t))Write(s,f.FieldType,f.GetValue(v),seen);
  }

  public static bool Import(CarrotGame g,byte[] data,out string error){
   error="";
   try{
    using var ms=new MemoryStream(data);var r=new BinaryReader(ms,Encoding.UTF8);
    if(r.ReadUInt32()!=Magic){error="not a Carrot state";return false;}
    if(r.ReadUInt32()!=SchemaHash()){error="schema mismatch (different builds)";return false;}
    int id=r.ReadInt32();string mode=r.ReadBoolean()?r.ReadString():"normal";uint arg=r.ReadUInt32();int speed=r.ReadInt32();int tick=r.ReadInt32();
    if(g.level==null||g.level.id!=id||g.Mode!=mode||g.NetArg!=arg){var keepMode=g.NetMode;int keepSeat=g.NetSeat;g.LoadLevel(id,mode,arg);if(keepMode!=NetMode.None)g.NetBegin(keepMode,keepSeat);}
    foreach(var f in Fields(typeof(CarrotGame))){
     var current=f.GetValue(g);var value=Read(r,f.FieldType,current);
     if(!ReferenceEquals(value,current)||f.FieldType.IsValueType)f.SetValue(g,value);
    }
    if(g.NetMode==NetMode.Lockstep)g.speed=speed;
    if(ms.Position!=ms.Length){error="trailing bytes";return false;}
    g.AfterImport(tick);return true;
   }catch(Exception e){error=e.GetType().Name+": "+e.Message;return false;}
  }
  /// <summary>Reads a value of type t; collections and objects are refilled in place when `current` is one (readonly fields).</summary>
  static object Read(BinaryReader r,Type t,object current){
   if(t==typeof(int))return r.ReadInt32();if(t==typeof(float))return r.ReadSingle();if(t==typeof(bool))return r.ReadBoolean();
   if(t==typeof(string))return r.ReadBoolean()?r.ReadString():null;if(t==typeof(uint))return r.ReadUInt32();if(t==typeof(long))return r.ReadInt64();
   if(t==typeof(Vector3))return new Vector3(r.ReadSingle(),r.ReadSingle(),r.ReadSingle());
   if(t.IsEnum)return Enum.ToObject(t,r.ReadInt32());
   if(t.IsValueType&&!t.IsPrimitive){object box=Activator.CreateInstance(t);foreach(var f in Fields(t))f.SetValue(box,Read(r,f.FieldType,null));return box;}
   int n=r.ReadInt32();if(n<0)return null;
   if(t.IsArray){var et=t.GetElementType();var a=current is Array c&&c.Length==n?c:Array.CreateInstance(et,n);for(int i=0;i<n;i++)a.SetValue(Read(r,et,null),i);return a;}
   if(t.IsGenericType){
    var def=t.GetGenericTypeDefinition();var args=t.GetGenericArguments();
    if(def==typeof(List<>)){var l=(IList)(current??Activator.CreateInstance(t));l.Clear();for(int i=0;i<n;i++)l.Add(Read(r,args[0],null));return l;}
    if(def==typeof(Dictionary<,>)){var d=(IDictionary)(current??Activator.CreateInstance(t));d.Clear();for(int i=0;i<n;i++){int k=r.ReadInt32();d[k]=Read(r,args[1],null);}return d;}
    if(def==typeof(HashSet<>)){var set=current??Activator.CreateInstance(t);t.GetMethod("Clear").Invoke(set,null);var add=t.GetMethod("Add");bool isInt=args[0]==typeof(int);
     for(int i=0;i<n;i++){long x=r.ReadInt64();add.Invoke(set,new object[]{isInt?(object)(int)x:(object)x});}return set;}
    throw new InvalidOperationException("CarrotNetState: unsupported "+t.Name);
   }
   object o=current??Activator.CreateInstance(t,true);
   foreach(var f in Fields(t)){var cur=f.GetValue(o);var value=Read(r,f.FieldType,cur);if(!ReferenceEquals(value,cur)||f.FieldType.IsValueType)f.SetValue(o,value);}
   return o;
  }
 }
}
