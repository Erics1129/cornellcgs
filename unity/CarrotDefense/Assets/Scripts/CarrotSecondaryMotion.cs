using System.Collections.Generic;
using UnityEngine;

namespace CarrotTD {
 /// <summary>
 /// Secondary motion for the living miniatures: damped angular springs on named bones (ears, antennae, wings, heads, jaws, arms,
 /// leaves) that lag behind the acceleration of their pivot. It runs after animation sampling (LateUpdate, execution order 100) and
 /// only adds an offset on top of whatever the clip or the view wrote this frame, so native transforms are never replaced.
 /// Links are discovered and serialized by CarrotModels.Prepare. On the Low tier only the 40 actors nearest the camera update.
 /// Allocation-free per frame.
 /// </summary>
 [DefaultExecutionOrder(100)]
 public sealed class CarrotSecondaryMotion : MonoBehaviour {
  public const byte Tilt=0,Hinge=1;
  [System.Serializable] public struct Link {
   public Transform bone;
   [Tooltip("Largest offset in degrees.")] public float maxDegrees;
   [Tooltip("Degrees of lean per unit/s^2 of pivot acceleration at rest.")] public float lean;
   [Tooltip("0 = tilt away from horizontal acceleration, 1 = hinge about local X from vertical acceleration (jaws).")] public byte mode;
   [Tooltip("Follow the bone's own pivot (appendages riding an animated head or body) instead of the actor root.")] public bool trackSelf;
  }
  public Link[] links=new Link[0];
  public float stiffness=120,damping=12;

  Vector3 lastPosition,lastVelocity;Vector3[] linkPosition,linkVelocity;Vector2[] tilt,tiltVel;Quaternion[] written,baseRot;bool primed,allowed=true,wasAllowed=true;

  // Frame statistics for QA (read by the character studio and QA telemetry).
  public static float LastFrameMs{get;private set;}
  public static float LastFrameMaxDegrees{get;private set;}
  public static int LastFrameLinks{get;private set;}
  public static int LowTierBudget=40;
  /// <summary>Mean and worst per-frame cost (ms) and the largest offset (degrees) since the last ResetStats, for QA.</summary>
  public static float MeanMs=>statFrames>0?(float)(statTotalMs/statFrames):0;
  public static float WorstMs{get;private set;}
  public static float WorstDegrees{get;private set;}
  public static int StatFrames=>statFrames;
  static double statTotalMs;static int statFrames;
  public static void ResetStats(){statTotalMs=0;statFrames=0;WorstMs=0;WorstDegrees=0;}
  static float accumMs,accumDeg;static int accumLinks,accumFrame=-1,rankedFrame=-1;
  static readonly List<CarrotSecondaryMotion> all=new List<CarrotSecondaryMotion>();
  static CarrotSecondaryMotion[] nearest=new CarrotSecondaryMotion[64];static float[] nearestDistance=new float[64];

  void Awake(){int n=links.Length;linkPosition=new Vector3[n];linkVelocity=new Vector3[n];tilt=new Vector2[n];tiltVel=new Vector2[n];written=new Quaternion[n];baseRot=new Quaternion[n];}
  void OnEnable(){all.Add(this);primed=false;}
  void OnDisable(){all.Remove(this);Release();}

  static void Rank(int frame){
   rankedFrame=frame;
   bool low=CarrotQuality.Tier==CarrotQuality.LowTier;var cam=low?Camera.main:null;
   if(!low||cam==null||all.Count<=LowTierBudget){for(int i=0;i<all.Count;i++)all[i].allowed=true;return;}
   // Keep the LowTierBudget nearest (insertion into a small sorted buffer; no allocation).
   int budget=Mathf.Min(LowTierBudget,nearest.Length),count=0;Vector3 eye=cam.transform.position;
   for(int i=0;i<all.Count;i++){
    var m=all[i];m.allowed=false;float d=(m.transform.position-eye).sqrMagnitude;
    if(count<budget){int j=count++;while(j>0&&nearestDistance[j-1]>d){nearest[j]=nearest[j-1];nearestDistance[j]=nearestDistance[j-1];j--;}nearest[j]=m;nearestDistance[j]=d;}
    else if(d<nearestDistance[count-1]){int j=count-1;while(j>0&&nearestDistance[j-1]>d){nearest[j]=nearest[j-1];nearestDistance[j]=nearestDistance[j-1];j--;}nearest[j]=m;nearestDistance[j]=d;}
   }
   for(int i=0;i<count;i++)nearest[i].allowed=true;
  }

  /// <summary>Hands untouched bones back their base rotation (when culled or disabled), so a frozen offset never lingers.</summary>
  void Release(){
   if(!primed)return;
   for(int i=0;i<links.Length;i++){var b=links[i].bone;if(b!=null&&Quaternion.Dot(b.localRotation,written[i])>.9999995f)b.localRotation=baseRot[i];tilt[i]=tiltVel[i]=Vector2.zero;}
   primed=false;
  }

  void LateUpdate(){
   int frame=Time.frameCount;
   if(frame!=accumFrame){
    if(accumFrame>=0&&accumLinks>0){statTotalMs+=accumMs;statFrames++;if(accumMs>WorstMs)WorstMs=accumMs;if(accumDeg>WorstDegrees)WorstDegrees=accumDeg;}
    LastFrameMs=accumMs;LastFrameMaxDegrees=accumDeg;LastFrameLinks=accumLinks;accumMs=accumDeg=0;accumLinks=0;accumFrame=frame;}
   if(frame!=rankedFrame)Rank(frame);
   if(!allowed){if(wasAllowed)Release();wasAllowed=false;return;}
   wasAllowed=true;
   float dt=Mathf.Min(Time.deltaTime,.05f);if(dt<=0||links.Length==0)return;
   long start=System.Diagnostics.Stopwatch.GetTimestamp();
   float k=stiffness,c=damping;
   // One pivot per actor: the model root carries the view's path motion, bob, jolt and squash, which is what the appendages trail.
   Vector3 p=transform.position;Vector3 v=primed?(p-lastPosition)/dt:Vector3.zero;Vector3 accel=primed?(v-lastVelocity)/dt:Vector3.zero;
   lastPosition=p;lastVelocity=v;if(accel.sqrMagnitude>900)accel=accel.normalized*30;
   for(int i=0;i<links.Length;i++){
    var link=links[i];var b=link.bone;if(b==null)continue;
    // Base pose: the clip (or the view) rewrote the bone this frame unless it still holds exactly what we wrote last frame.
    var local=b.localRotation;
    if(primed&&Quaternion.Dot(local,written[i])>.9999995f)local=baseRot[i];else baseRot[i]=local;
    Vector3 a=accel;
    if(link.trackSelf){
     // Appendages trail their own pivot, which includes the clip's head bob and body sway, so ears and antennae flop with every step.
     Vector3 q=b.position;Vector3 lv=primed?(q-linkPosition[i])/dt:Vector3.zero;a=primed?(lv-linkVelocity[i])/dt:Vector3.zero;linkPosition[i]=q;linkVelocity[i]=lv;
     if(a.sqrMagnitude>900)a=a.normalized*30;
    }
    Quaternion offset;
    if(link.mode==Hinge){
     // Jaws drop as the head lifts: a scalar spring on vertical acceleration, opening only.
     float target=Mathf.Clamp(a.y*link.lean,-link.maxDegrees,link.maxDegrees);
     float f=(target-tilt[i].x)*k-tiltVel[i].x*c;tiltVel[i].x+=f*dt;tilt[i].x+=tiltVel[i].x*dt;
     float angle=Mathf.Clamp(tilt[i].x,0,link.maxDegrees);if(angle>accumDeg)accumDeg=angle;
     offset=Quaternion.identity;b.localRotation=written[i]=local*Quaternion.Euler(angle,0,0);
    }else{
     // Lean opposite the pivot's horizontal acceleration (the tip trails), under-damped so ears and antennae overshoot once.
     Vector2 target=new Vector2(-a.x,-a.z)*link.lean;
     Vector2 f=(target-tilt[i])*k-tiltVel[i]*c;tiltVel[i]+=f*dt;tilt[i]+=tiltVel[i]*dt;
     float mag=tilt[i].magnitude;if(mag>link.maxDegrees){tilt[i]*=link.maxDegrees/mag;tiltVel[i]*=.5f;mag=link.maxDegrees;}
     if(mag>accumDeg)accumDeg=mag;
     if(mag<.001f){b.localRotation=written[i]=local;}
     else{
      Vector3 axis=new Vector3(tilt[i].y,0,-tilt[i].x)/mag;
      offset=Quaternion.AngleAxis(mag,axis);var parent=b.parent;Quaternion pr=parent!=null?parent.rotation:Quaternion.identity;
      b.localRotation=written[i]=Quaternion.Inverse(pr)*offset*pr*local;
     }
    }
    accumLinks++;
   }
   primed=true;
   accumMs+=(System.Diagnostics.Stopwatch.GetTimestamp()-start)*1000f/System.Diagnostics.Stopwatch.Frequency;
  }
 }
}
