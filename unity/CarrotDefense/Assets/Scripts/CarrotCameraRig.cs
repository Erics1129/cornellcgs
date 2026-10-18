using System;
using System.Reflection;
using UnityEngine;

namespace CarrotTD {
 /// <summary>
 /// Camera rig of the play view (giant update): zoom toward the cursor or pinch centre, a pan clamp over the real route and pad
 /// bounds plus 3 u, panning that works while paused, Focus boss and Recenter, the HUD safe area, and the trauma shake model.
 ///
 /// Fairness rules: no automatic camera motion while a pointer is down, while a pad or tower is selected (beyond the single damped
 /// safe-area nudge when the page opens its build panel), while a merge is armed or during an actionable boss windup. The boss
 /// follow-cam runs only after Focus boss. Shake: shake = trauma^2, trauma decays 1.0/s, roll at most 1.5 degrees, translation at
 /// most 0.6% of the screen height; routine events add no trauma, and none is applied for 150 ms after a pointer goes down or while
 /// placement or a merge is armed. Reduced motion (OS setting or the page's toggle) removes shake, hit-stop, FOV punches and camera
 /// moves entirely.
 /// </summary>
 public sealed partial class CarrotView {
  float trauma,shakeClock,pointerDownAt=-9,lastHitStopAt=-9;
  Vector4 safeArea;bool safeAreaDirty;int safeAreaSelection=-2;string safeAreaSelectionType="";
  int followBoss=-1;Vector3 routeMin,routeMax;bool panNudged;
  public bool ReducedMotion=>reducedMotion;

  // ---- simulation time scale (true time-stops) ----------------------------------------------------------------------------------
  // CarrotGame.RequestTimeScale(scale, realSeconds, reason) belongs to the balance stream's bridge contract. It is resolved by
  // reflection so this view compiles against either side of the merge; link.xml preserves CarrotTD.* for IL2CPP. When it exists,
  // every presentation slow-down (hit-stop, slow motion, the Super and boss beats) also slows the simulation by the same factor,
  // so what is drawn never runs ahead of or behind what is simulated.
  static MethodInfo timeScaleMethod;static bool timeScaleResolved;
  public static bool SimulationTimeScaleAvailable{get{ResolveTimeScale();return timeScaleMethod!=null;}}
  static void ResolveTimeScale(){if(timeScaleResolved)return;timeScaleResolved=true;try{timeScaleMethod=typeof(CarrotGame).GetMethod("RequestTimeScale",BindingFlags.Public|BindingFlags.Instance,null,new[]{typeof(float),typeof(float),typeof(string)},null);}catch(Exception){timeScaleMethod=null;}}
  bool RequestSimTimeScale(float scale,float realSeconds,string reason){
   // Duo and endless: hit-stop and slow motion are view-only (the match clock never slows); a spectator never asks at all.
   if(duoOn){CarrotQa.Count(Spectator?"spectator.timeScale":"duo.timeScaleRefused",1);return false;}
   ResolveTimeScale();if(timeScaleMethod==null||game==null)return false;
   try{timeScaleMethod.Invoke(game,new object[]{Mathf.Clamp01(scale),Mathf.Max(0,realSeconds),reason});CarrotQa.Count("timeScale."+reason,1);return true;}catch(Exception){return false;}
  }

  // CarrotGame.SetCap(cap, on) (balance contract v2): the snapshot's caps[] tells the page what this build draws itself.
  static MethodInfo setCapMethod;static bool setCapResolved;
  void AdvertiseCap(string cap,bool on){
   if(!setCapResolved){setCapResolved=true;try{setCapMethod=typeof(CarrotGame).GetMethod("SetCap",BindingFlags.Public|BindingFlags.Instance,null,new[]{typeof(string),typeof(bool)},null);}catch(Exception){setCapMethod=null;}}
   if(setCapMethod==null||game==null)return;try{setCapMethod.Invoke(game,new object[]{cap,on});}catch(Exception){}
  }
  /// <summary>Hit-stop and slow motion from the effects recipes. Only importance 8+ beats reach here (the Super forge, a boss phase
  /// break, a boss death, the boss entrance slow-motion); two stops are at least 2 s apart, and reduced motion removes them.</summary>
  void BeatTime(float stop,float scale,float slow){
   if(reducedMotion){CarrotQa.Count("hitstop.suppressed",1);return;}
   float now=Time.unscaledTime;
   if(stop>0){if(now-lastHitStopAt<2){stop=0;CarrotQa.Count("hitstop.spaced",1);}else{lastHitStopAt=now;hitStop=Mathf.Max(hitStop,CarrotQuality.Rich?stop:Mathf.Min(stop,.06f));RequestSimTimeScale(0,stop,"hitstop");CarrotQa.Count("hitstop",1);sound.Duck(.6f);}}
   if(slow>0){slowMo=Mathf.Max(slowMo,slow);slowScale=scale;RequestSimTimeScale(scale,slow,"slowmo");CarrotQa.Count("slowmo",1);}
  }

  // ---- trauma shake ------------------------------------------------------------------------------------------------------------
  /// <summary>Adds camera trauma (0..1). Callers pass the event's trauma from the intensity table, never a routine shot or impact.</summary>
  void Impulse(Vector3 at,float force,int shape){
   if(reducedMotion||force<=0){if(force>0)CarrotQa.Count("impulse.suppressed",1);return;}
   if(ShakeSuppressed()){CarrotQa.Count("impulse.suppressed",1);return;}
   trauma=Mathf.Min(1,trauma+Mathf.Clamp(force,0,.6f));CarrotQa.Count("impulse",1);
  }
  bool ShakeSuppressed(){return Time.unscaledTime-pointerDownAt<.15f||pointerDown||mergeDrag||holdArmed||game!=null&&(game.mergeArmed>0||game.selectionType=="pad");}
  /// <summary>Applied after the Cinemachine brain has written the camera: translation and roll from trauma squared on smooth noise.</summary>
  void ApplyShake(float raw){
   if(trauma<=0||GameCamera==null)return;trauma=Mathf.Max(0,trauma-raw*1f);if(reducedMotion){trauma=0;return;}
   shakeClock+=raw;float s=trauma*trauma;
   float nx=Mathf.PerlinNoise(shakeClock*24,1.7f)*2-1,ny=Mathf.PerlinNoise(4.3f,shakeClock*24)*2-1,nr=Mathf.PerlinNoise(shakeClock*18,9.1f)*2-1;
   var t=GameCamera.transform;float distance=Mathf.Max(1,Vector3.Distance(t.position,cameraTarget+pan));float worldHeight=2*distance*Mathf.Tan(GameCamera.fieldOfView*Mathf.Deg2Rad*.5f);
   float translate=.006f*worldHeight*s;t.position+=t.right*nx*translate+t.up*ny*translate;t.rotation=t.rotation*Quaternion.Euler(0,0,1.5f*s*nr);
  }

  // ---- page receivers -------------------------------------------------------------------------------------------------------
  [Serializable] class SafeAreaDTO {public float top,bottom,left,right;}
  /// <summary>Viewport fractions of the HUD and the build panel ({top,bottom,left,right}). Sent once when the page opens or closes a
  /// panel; the camera then nudges (damped) so the selected pad and the carrot stay outside those rectangles.</summary>
  public void SetSafeArea(string json){
   SafeAreaDTO d=null;try{d=JsonUtility.FromJson<SafeAreaDTO>(json);}catch(Exception){d=null;}if(d==null)return;
   safeArea=new Vector4(Mathf.Clamp(d.top,0,.6f),Mathf.Clamp(d.bottom,0,.6f),Mathf.Clamp(d.left,0,.6f),Mathf.Clamp(d.right,0,.6f));safeAreaDirty=true;
   // Panel closed at the fitted zoom: the nudge is undone and the landscape view recentres.
   if(safeArea.x+safeArea.y+safeArea.z+safeArea.w<.001f&&panNudged&&targetZoom<=1.015f&&followBoss<0){panNudged=false;targetPan=Vector3.zero;safeAreaDirty=false;}
  }
  /// <summary>Frames the boss and the next 8 u of its lane until the player pans, zooms, recentres or the boss leaves.</summary>
  public void FocusBoss(string unused=""){
   if(game==null)return;foreach(var e in game.enemies)if(!string.IsNullOrEmpty(e.boss)&&e.alive&&!e.clone){followBoss=e.id;CarrotQa.Count("focusBoss",1);return;}
   followBoss=-1;
  }
  /// <summary>Back to the fitted framing (the page's recentre button).</summary>
  public void Recenter(string unused=""){followBoss=-1;panNudged=false;targetZoom=1;targetPan=Vector3.zero;if(duoOn)netCameraMode="own";}

  // ---- geometry -----------------------------------------------------------------------------------------------------------
  void MeasureRouteBounds(){
   routeMin=new Vector3(float.MaxValue,0,float.MaxValue);routeMax=new Vector3(float.MinValue,0,float.MinValue);
   foreach(var route in game.level.routes)foreach(var p in route){routeMin=Vector3.Min(routeMin,p);routeMax=Vector3.Max(routeMax,p);}
   foreach(var p in game.level.pads){routeMin=Vector3.Min(routeMin,p);routeMax=Vector3.Max(routeMax,p);}
   routeMin.y=routeMax.y=0;
  }
  /// <summary>Ground point (y = 0) under a screen point for a camera at the rig's target pan and zoom (not the damped live camera).</summary>
  bool TargetGroundPoint(Vector2 screen,Vector3 atPan,float atZoom,out Vector3 point){
   point=Vector3.zero;if(GameCamera==null)return false;
   Vector3 position=cameraTarget+atPan-(cameraAngle*Vector3.forward)*(fitDistance/Mathf.Max(.01f,atZoom));
   float w=Mathf.Max(1,Screen.width),h=Mathf.Max(1,Screen.height);float x=screen.x/w*2-1,y=screen.y/h*2-1;
   float tan=Mathf.Tan(vcamPlay.m_Lens.FieldOfView*Mathf.Deg2Rad*.5f);
   Vector3 dir=cameraAngle*new Vector3(x*tan*(w/h),y*tan,1);if(dir.y>-.0001f)return false;
   point=position+dir*(-position.y/dir.y);return true;
  }
  /// <summary>Zoom toward a screen point: the ground point under it stays put once the damped camera settles.</summary>
  void ZoomAt(Vector2 screen,float zoomTo){
   float maxZoom=portraitCamera?2.5f:2.1f;zoomTo=Mathf.Clamp(zoomTo,MinZoom,maxZoom);if(Mathf.Abs(zoomTo-targetZoom)<.0001f)return;
   followBoss=-1;
   if(TargetGroundPoint(screen,targetPan,targetZoom,out var before)&&TargetGroundPoint(screen,targetPan,zoomTo,out var after)){targetZoom=zoomTo;targetPan+=before-after;}
   else targetZoom=zoomTo;
   ClampPan();
  }
  /// <summary>Viewport point of a world position for the camera at the target pan and zoom (x right, y up, 0..1).</summary>
  Vector2 TargetViewport(Vector3 world){
   Vector3 position=cameraTarget+targetPan-(cameraAngle*Vector3.forward)*(fitDistance/Mathf.Max(.01f,targetZoom));
   Vector3 local=Quaternion.Inverse(cameraAngle)*(world-position);if(local.z<=.01f)return new Vector2(.5f,.5f);
   float tan=Mathf.Tan(vcamPlay.m_Lens.FieldOfView*Mathf.Deg2Rad*.5f),aspect=Mathf.Max(.3f,GameCamera.aspect);
   return new Vector2(local.x/(local.z*tan*aspect)*.5f+.5f,local.y/(local.z*tan)*.5f+.5f);
  }

  // ---- per frame ------------------------------------------------------------------------------------------------------------
  void UpdateRig(float raw){
   if(game==null||game.level==null)return;
   if(followBoss>=0){
    EnemyState boss=null;foreach(var e in game.enemies)if(e.id==followBoss){boss=e;break;}
    if(boss==null||!boss.alive||game.phase!="playing"&&game.phase!="ready"){followBoss=-1;}
    else if(!pointerDown){
     // Frame the boss plus the next 8 u of its lane: centre between them, zoom so that span fills about half the view.
     Vector3 ahead=boss.position+boss.direction.normalized*4;ahead.y=0;Vector3 centre=(boss.position+ahead)*.5f;centre.y=0;
     float want=Mathf.Clamp(PrismStage?1.9f:1.75f,1,portraitCamera?2.5f:2.1f);targetZoom=Mathf.Lerp(targetZoom,want,1-Mathf.Exp(-raw*3));
     Vector3 desired=centre-new Vector3(cameraTarget.x,0,cameraTarget.z);targetPan=Vector3.Lerp(targetPan,desired,1-Mathf.Exp(-raw*3));ClampPan();
    }
   }
   // Safe area: one damped nudge when the page reports new HUD/panel rectangles or the selection changes while they are up.
   int selection=game.selectionId;string kind=game.selectionType??"";
   if(selection!=safeAreaSelection||kind!=safeAreaSelectionType){safeAreaSelection=selection;safeAreaSelectionType=kind;if(safeArea!=Vector4.zero)safeAreaDirty=true;}
   if(safeAreaDirty&&!pointerDown){safeAreaDirty=false;NudgeIntoSafeArea();}
  }
  void NudgeIntoSafeArea(){
   Vector3 focus;if(!SelectedPoint(out focus))return;
   // Keep the pad (and the carrot, when it fits) inside the free rectangle with a small margin.
   float l=safeArea.z+.04f,r=1-safeArea.w-.04f,b=safeArea.y+.05f,t=1-safeArea.x-.05f;if(r-l<.15f||t-b<.15f)return;
   for(int pass=0;pass<2;pass++){
    Vector2 v=TargetViewport(focus);float dx=v.x<l?v.x-l:v.x>r?v.x-r:0,dy=v.y<b?v.y-b:v.y>t?v.y-t:0;if(dx==0&&dy==0)return;
    // Convert the viewport offset to a ground offset at the focus depth.
    Vector3 position=cameraTarget+targetPan-(cameraAngle*Vector3.forward)*(fitDistance/Mathf.Max(.01f,targetZoom));
    float depth=Mathf.Max(1,(Quaternion.Inverse(cameraAngle)*(focus-position)).z);float tan=Mathf.Tan(vcamPlay.m_Lens.FieldOfView*Mathf.Deg2Rad*.5f),aspect=Mathf.Max(.3f,GameCamera.aspect);
    Vector3 right=cameraAngle*Vector3.right;right.y=0;right.Normalize();Vector3 forward=cameraAngle*Vector3.forward;forward.y=0;forward.Normalize();
    float sinPitch=Mathf.Max(.3f,Mathf.Sin(cameraAngle.eulerAngles.x*Mathf.Deg2Rad));
    targetPan+=right*(dx*2*depth*tan*aspect)+forward*(dy*2*depth*tan/sinPitch);ClampPan(true);
   }
   CarrotQa.Count("safeAreaNudge",1);
  }
  bool SelectedPoint(out Vector3 p){
   p=Vector3.zero;if(game.selectionType=="pad"&&game.selectionId>=0&&game.selectionId<game.level.pads.Length){p=game.level.pads[game.selectionId];return true;}
   if(game.selectionType=="tower")foreach(var t in game.towers)if(t.id==game.selectionId){p=t.position;return true;}
   return false;
  }
 }

 /// <summary>QA counters and samples (giant update T0). Calls compile away outside the editor and CARROT_QA builds, so any stream can
 /// count from shipping code; CarrotQaTelemetry reports them with its CARROT_QA_DUMP lines.</summary>
 public static class CarrotQa {
  public static readonly System.Collections.Generic.Dictionary<string,double> Counts=new System.Collections.Generic.Dictionary<string,double>();
  public static readonly System.Collections.Generic.Dictionary<string,System.Collections.Generic.List<float>> Samples=new System.Collections.Generic.Dictionary<string,System.Collections.Generic.List<float>>();
  [System.Diagnostics.Conditional("UNITY_EDITOR"),System.Diagnostics.Conditional("CARROT_QA")]
  public static void Count(string key,double value){Counts.TryGetValue(key,out var v);Counts[key]=v+value;}
  [System.Diagnostics.Conditional("UNITY_EDITOR"),System.Diagnostics.Conditional("CARROT_QA")]
  public static void Max(string key,double value){if(!Counts.TryGetValue(key,out var v)||value>v)Counts[key]=value;}
  [System.Diagnostics.Conditional("UNITY_EDITOR"),System.Diagnostics.Conditional("CARROT_QA")]
  public static void Sample(string key,float ms){if(!Samples.TryGetValue(key,out var list)){list=new System.Collections.Generic.List<float>(256);Samples[key]=list;}if(list.Count>=4096)list.RemoveAt(0);list.Add(ms);}
  [System.Diagnostics.Conditional("UNITY_EDITOR"),System.Diagnostics.Conditional("CARROT_QA")]
  public static void Reset(){Counts.Clear();Samples.Clear();sectionTotals.Clear();sectionFrames=0;}
  // Per-frame section timing: FrameStart() then Section(name) after each block; QaDump reports the mean ms per frame of each.
  static long sectionMark;static int sectionFrames;public static readonly System.Collections.Generic.Dictionary<string,double> sectionTotals=new System.Collections.Generic.Dictionary<string,double>();
  public static int SectionFrames=>sectionFrames;
  [System.Diagnostics.Conditional("UNITY_EDITOR"),System.Diagnostics.Conditional("CARROT_QA")]
  public static void FrameStart(){sectionMark=System.Diagnostics.Stopwatch.GetTimestamp();sectionFrames++;}
  [System.Diagnostics.Conditional("UNITY_EDITOR"),System.Diagnostics.Conditional("CARROT_QA")]
  public static void Section(string name){long now=System.Diagnostics.Stopwatch.GetTimestamp();double ms=(now-sectionMark)*1000.0/System.Diagnostics.Stopwatch.Frequency;sectionMark=now;sectionTotals.TryGetValue(name,out var t);sectionTotals[name]=t+ms;}
 }
}
