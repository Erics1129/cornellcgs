// Minimal UnityEngine surface for the standalone Carrot simulation (scripts/carrot-sim.mjs).
// Only what CarrotGame, CarrotData, CarrotExpansion, CarrotPrism, CarrotTypes and the three test files use.
// Arithmetic mirrors UnityCsReference (Vector3.cs, Mathf.cs) so float results match the editor bit for bit:
// every operation is single precision, square roots and trigonometry go through System.Math in double.
using System;
using System.Collections;
using System.Collections.Generic;
using System.Globalization;
using System.Reflection;
using System.Text;
using System.Text.Json;

namespace UnityEngine {
 public struct Vector2 {
  public float x,y;
  public Vector2(float x,float y){this.x=x;this.y=y;}
  public static Vector2 zero=>new Vector2(0,0);
  public static Vector2 operator+(Vector2 a,Vector2 b)=>new Vector2(a.x+b.x,a.y+b.y);
  public static Vector2 operator-(Vector2 a,Vector2 b)=>new Vector2(a.x-b.x,a.y-b.y);
  public static Vector2 operator*(Vector2 a,float d)=>new Vector2(a.x*d,a.y*d);
  public static implicit operator Vector2(Vector3 v)=>new Vector2(v.x,v.y);
  public static implicit operator Vector3(Vector2 v)=>new Vector3(v.x,v.y,0);
  public override string ToString()=>"("+x.ToString("F2",CultureInfo.InvariantCulture)+", "+y.ToString("F2",CultureInfo.InvariantCulture)+")";
 }
 public struct Vector3 : IEquatable<Vector3> {
  public const float kEpsilon=0.00001F;
  public float x,y,z;
  public Vector3(float x,float y,float z){this.x=x;this.y=y;this.z=z;}
  public Vector3(float x,float y){this.x=x;this.y=y;this.z=0;}
  public static Vector3 zero=>new Vector3(0,0,0);
  public static Vector3 one=>new Vector3(1,1,1);
  public static Vector3 up=>new Vector3(0,1,0);
  public static Vector3 down=>new Vector3(0,-1,0);
  public static Vector3 forward=>new Vector3(0,0,1);
  public static Vector3 back=>new Vector3(0,0,-1);
  public static Vector3 right=>new Vector3(1,0,0);
  public static Vector3 left=>new Vector3(-1,0,0);
  public float magnitude=>(float)Math.Sqrt(x*x+y*y+z*z);
  public float sqrMagnitude=>x*x+y*y+z*z;
  public Vector3 normalized=>Normalize(this);
  public static float Magnitude(Vector3 v)=>(float)Math.Sqrt(v.x*v.x+v.y*v.y+v.z*v.z);
  public static Vector3 Normalize(Vector3 value){float mag=Magnitude(value);if(mag>kEpsilon)return value/mag;return zero;}
  public static float Dot(Vector3 a,Vector3 b)=>a.x*b.x+a.y*b.y+a.z*b.z;
  public static float Distance(Vector3 a,Vector3 b){float dx=a.x-b.x,dy=a.y-b.y,dz=a.z-b.z;return (float)Math.Sqrt(dx*dx+dy*dy+dz*dz);}
  public static Vector3 Lerp(Vector3 a,Vector3 b,float t){t=Mathf.Clamp01(t);return new Vector3(a.x+(b.x-a.x)*t,a.y+(b.y-a.y)*t,a.z+(b.z-a.z)*t);}
  public static Vector3 ClampMagnitude(Vector3 v,float maxLength){float sqrmag=v.sqrMagnitude;if(sqrmag>maxLength*maxLength){float mag=(float)Math.Sqrt(sqrmag);float nx=v.x/mag,ny=v.y/mag,nz=v.z/mag;return new Vector3(nx*maxLength,ny*maxLength,nz*maxLength);}return v;}
  public static Vector3 Cross(Vector3 a,Vector3 b)=>new Vector3(a.y*b.z-a.z*b.y,a.z*b.x-a.x*b.z,a.x*b.y-a.y*b.x);
  public static Vector3 operator+(Vector3 a,Vector3 b)=>new Vector3(a.x+b.x,a.y+b.y,a.z+b.z);
  public static Vector3 operator-(Vector3 a,Vector3 b)=>new Vector3(a.x-b.x,a.y-b.y,a.z-b.z);
  public static Vector3 operator-(Vector3 a)=>new Vector3(-a.x,-a.y,-a.z);
  public static Vector3 operator*(Vector3 a,float d)=>new Vector3(a.x*d,a.y*d,a.z*d);
  public static Vector3 operator*(float d,Vector3 a)=>new Vector3(a.x*d,a.y*d,a.z*d);
  public static Vector3 operator/(Vector3 a,float d)=>new Vector3(a.x/d,a.y/d,a.z/d);
  public static bool operator==(Vector3 l,Vector3 r){float dx=l.x-r.x,dy=l.y-r.y,dz=l.z-r.z;float sq=dx*dx+dy*dy+dz*dz;return sq<kEpsilon*kEpsilon;}
  public static bool operator!=(Vector3 l,Vector3 r)=>!(l==r);
  public bool Equals(Vector3 o)=>x==o.x&&y==o.y&&z==o.z;
  public override bool Equals(object o)=>o is Vector3 v&&Equals(v);
  public override int GetHashCode()=>x.GetHashCode()^(y.GetHashCode()<<2)^(z.GetHashCode()>>2);
  public override string ToString()=>"("+x.ToString("F2",CultureInfo.InvariantCulture)+", "+y.ToString("F2",CultureInfo.InvariantCulture)+", "+z.ToString("F2",CultureInfo.InvariantCulture)+")";
 }
 public struct Rect {
  public float x,y,width,height;
  public Rect(float x,float y,float width,float height){this.x=x;this.y=y;this.width=width;this.height=height;}
  public static Rect MinMaxRect(float xmin,float ymin,float xmax,float ymax)=>new Rect(xmin,ymin,xmax-xmin,ymax-ymin);
  public float xMin=>x;public float yMin=>y;public float xMax=>x+width;public float yMax=>y+height;
  public Vector2 center=>new Vector2(x+width/2f,y+height/2f);
  public bool Contains(Vector2 p)=>p.x>=xMin&&p.x<xMax&&p.y>=yMin&&p.y<yMax;
  public bool Contains(Vector3 p)=>p.x>=xMin&&p.x<xMax&&p.y>=yMin&&p.y<yMax;
 }
 public struct Quaternion {public float x,y,z,w;public static Quaternion identity=>new Quaternion{w=1};}
 public struct Color {public float r,g,b,a;public Color(float r,float g,float b,float a=1){this.r=r;this.g=g;this.b=b;this.a=a;}}
 public static class Mathf {
  public const float PI=(float)Math.PI;
  public const float Infinity=float.PositiveInfinity,NegativeInfinity=float.NegativeInfinity;
  public const float Epsilon=float.Epsilon;
  public static float Sin(float f)=>(float)Math.Sin(f);
  public static float Cos(float f)=>(float)Math.Cos(f);
  public static float Sqrt(float f)=>(float)Math.Sqrt(f);
  public static float Pow(float f,float p)=>(float)Math.Pow(f,p);
  public static float Exp(float p)=>(float)Math.Exp(p);
  public static float Log(float f)=>(float)Math.Log(f);
  public static float Abs(float f)=>Math.Abs(f);
  public static int Abs(int v)=>Math.Abs(v);
  public static float Min(float a,float b)=>a<b?a:b;
  public static float Min(params float[] v){int n=v.Length;if(n==0)return 0;float m=v[0];for(int i=1;i<n;i++)if(v[i]<m)m=v[i];return m;}
  public static int Min(int a,int b)=>a<b?a:b;
  public static int Min(params int[] v){int n=v.Length;if(n==0)return 0;int m=v[0];for(int i=1;i<n;i++)if(v[i]<m)m=v[i];return m;}
  public static float Max(float a,float b)=>a>b?a:b;
  public static float Max(params float[] v){int n=v.Length;if(n==0)return 0;float m=v[0];for(int i=1;i<n;i++)if(v[i]>m)m=v[i];return m;}
  public static int Max(int a,int b)=>a>b?a:b;
  public static int Max(params int[] v){int n=v.Length;if(n==0)return 0;int m=v[0];for(int i=1;i<n;i++)if(v[i]>m)m=v[i];return m;}
  public static float Floor(float f)=>(float)Math.Floor(f);
  public static float Ceil(float f)=>(float)Math.Ceiling(f);
  public static float Round(float f)=>(float)Math.Round(f);
  public static int FloorToInt(float f)=>(int)Math.Floor(f);
  public static int CeilToInt(float f)=>(int)Math.Ceiling(f);
  public static int RoundToInt(float f)=>(int)Math.Round(f);
  public static float Sign(float f)=>f>=0F?1F:-1F;
  public static float Clamp(float value,float min,float max){if(value<min)value=min;else if(value>max)value=max;return value;}
  public static int Clamp(int value,int min,int max){if(value<min)value=min;else if(value>max)value=max;return value;}
  public static float Clamp01(float value){if(value<0F)return 0F;else if(value>1F)return 1F;else return value;}
  public static float Lerp(float a,float b,float t)=>a+(b-a)*Clamp01(t);
  public static float InverseLerp(float a,float b,float value)=>a!=b?Clamp01((value-a)/(b-a)):0f;
  public static float MoveTowards(float current,float target,float maxDelta){if(Abs(target-current)<=maxDelta)return target;return current+Sign(target-current)*maxDelta;}
  public static bool Approximately(float a,float b)=>Abs(b-a)<Max(0.000001f*Max(Abs(a),Abs(b)),Epsilon*8);
  public static float Repeat(float t,float length)=>Clamp(t-Floor(t/length)*length,0.0f,length);
 }
 public static class Time {public static float unscaledDeltaTime=1f/60;public static float deltaTime=1f/60;public static float time,unscaledTime,realtimeSinceStartup;}
 public static class Debug {
  public static readonly object Gate=new object();
  public static bool Quiet;
  public static void Log(object message){if(Quiet)return;lock(Gate)Console.Out.WriteLine(message);}
  public static void LogWarning(object message){lock(Gate)Console.Out.WriteLine("WARNING "+message);}
  public static void LogError(object message){lock(Gate)Console.Out.WriteLine("ERROR "+message);}
 }
 public class Object {
  public string name="";
  public static void DestroyImmediate(Object o){if(o is GameObject g)g.Destroyed=true;}
  public static void Destroy(Object o){DestroyImmediate(o);}
  public static implicit operator bool(Object o)=>o!=null;
 }
 public class Component : Object {
  public GameObject gameObject;
  public T GetComponent<T>() where T:class{return gameObject!=null?gameObject.GetComponent<T>():null;}
 }
 public class Behaviour : Component {public bool enabled=true;}
 public class MonoBehaviour : Behaviour {}
 public sealed class GameObject : Object {
  readonly List<Component> components=new List<Component>();
  public bool Destroyed;
  public GameObject(string name){this.name=name;}
  public T AddComponent<T>() where T:Component,new(){var c=new T();c.gameObject=this;components.Add(c);return c;}
  public T GetComponent<T>() where T:class{foreach(var c in components)if(c is T t)return t;return null;}
 }
 public class Camera : Behaviour {
  public Vector3 WorldToViewportPoint(Vector3 p)=>new Vector3(Mathf.Clamp01((p.x+8)/16f),1-Mathf.Clamp01((p.z+6)/12f),10);
 }
 [AttributeUsage(AttributeTargets.Field)] public sealed class SerializeField : Attribute {}
 [AttributeUsage(AttributeTargets.Field)] public sealed class HideInInspector : Attribute {}
 [AttributeUsage(AttributeTargets.Class)] public sealed class DefaultExecutionOrder : Attribute {public DefaultExecutionOrder(int order){}}

 // Reflection JsonUtility over public instance fields, as Unity's: FromJson fills a fresh object and ignores unknown keys;
 // ToJson writes [Serializable] classes, arrays and List<T>. Floats are written in round-trip form.
 public static class JsonUtility {
  public static T FromJson<T>(string json){
   if(string.IsNullOrEmpty(json))return default(T);
   using var doc=JsonDocument.Parse(json);
   return (T)Read(doc.RootElement,typeof(T));
  }
  static object Read(JsonElement e,Type t){
   if(t==typeof(string))return e.ValueKind==JsonValueKind.String?e.GetString():e.ValueKind==JsonValueKind.Null?null:e.ToString();
   if(t==typeof(int))return e.ValueKind==JsonValueKind.Number?(e.TryGetInt32(out int i)?i:(int)e.GetDouble()):0;
   if(t==typeof(long))return e.ValueKind==JsonValueKind.Number?(e.TryGetInt64(out long l)?l:(long)e.GetDouble()):0L;
   if(t==typeof(uint))return e.ValueKind==JsonValueKind.Number?(e.TryGetUInt32(out uint u)?u:(uint)e.GetDouble()):0u;
   if(t==typeof(float))return e.ValueKind==JsonValueKind.Number?(float)e.GetDouble():0f;
   if(t==typeof(double))return e.ValueKind==JsonValueKind.Number?e.GetDouble():0d;
   if(t==typeof(bool))return e.ValueKind==JsonValueKind.True||(e.ValueKind==JsonValueKind.Number&&e.GetDouble()!=0);
   if(t.IsArray){var et=t.GetElementType();if(e.ValueKind!=JsonValueKind.Array)return Array.CreateInstance(et,0);var arr=Array.CreateInstance(et,e.GetArrayLength());int k=0;foreach(var x in e.EnumerateArray())arr.SetValue(Read(x,et),k++);return arr;}
   if(e.ValueKind!=JsonValueKind.Object)return t.IsValueType?Activator.CreateInstance(t):null;
   var o=Activator.CreateInstance(t,true);
   foreach(var f in t.GetFields(BindingFlags.Public|BindingFlags.Instance))if(e.TryGetProperty(f.Name,out var v)){try{f.SetValue(o,Read(v,f.FieldType));}catch{}}
   return o;
  }
  public static string ToJson(object o){var sb=new StringBuilder();Write(sb,o);return sb.ToString();}
  static void Write(StringBuilder sb,object o){
   if(o==null){sb.Append("{}");return;}
   var t=o.GetType();
   if(o is string s){sb.Append('"');foreach(char c in s){if(c=='"'||c=='\\'){sb.Append('\\').Append(c);}else if(c<' ')sb.Append("\\u").Append(((int)c).ToString("x4"));else sb.Append(c);}sb.Append('"');return;}
   if(o is bool b){sb.Append(b?"true":"false");return;}
   if(o is int i){sb.Append(i.ToString(CultureInfo.InvariantCulture));return;}
   if(o is float f){sb.Append(((double)f).ToString("R",CultureInfo.InvariantCulture));return;}
   if(o is double d){sb.Append(d.ToString("R",CultureInfo.InvariantCulture));return;}
   if(o is IList list&&!(o is string)){sb.Append('[');for(int k=0;k<list.Count;k++){if(k>0)sb.Append(',');Write(sb,list[k]);}sb.Append(']');return;}
   if(o is Vector3 v){sb.Append("{\"x\":");Write(sb,v.x);sb.Append(",\"y\":");Write(sb,v.y);sb.Append(",\"z\":");Write(sb,v.z);sb.Append('}');return;}
   sb.Append('{');bool first=true;
   foreach(var field in t.GetFields(BindingFlags.Public|BindingFlags.Instance)){if(!first)sb.Append(',');first=false;sb.Append('"').Append(field.Name).Append("\":");var value=field.GetValue(o);
    if(value==null){var ft=field.FieldType;if(ft==typeof(string))sb.Append("\"\"");else if(ft.IsArray||typeof(IList).IsAssignableFrom(ft))sb.Append("[]");else Write(sb,Activator.CreateInstance(ft,true));}
    else Write(sb,value);}
   sb.Append('}');
  }
 }
}
namespace UnityEditor {
 [AttributeUsage(AttributeTargets.Method)] public sealed class MenuItem : Attribute {public MenuItem(string path){}public MenuItem(string path,bool validate){}public MenuItem(string path,bool validate,int priority){}}
}
namespace CarrotTD {
 using UnityEngine;
 // The presentation layer is not part of the simulation build; tests never attach it.
 public sealed class CarrotView : MonoBehaviour {
  public Camera GameCamera=>null;
  public Vector3 EnemyBarPosition(EnemyState e)=>e.position+Vector3.up*1.2f;
  public void SetMuted(bool muted){}
  public void PrepareReviewLevel(){}
 }
}
