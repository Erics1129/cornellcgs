using System;
using System.Collections;
using System.Collections.Generic;
using System.Runtime.InteropServices;
using UnityEngine;
using UnityEngine.Rendering;

/// Unused since pointer picking went (OldPointer is deleted); kept until hot-metal-vfx drops the knife BoxCollider and
/// this tag from MakeKnife (ForgeKnifeMesh.cs), then integration deletes it.
public class ForgeKnifeTag:MonoBehaviour { public int id; }

// Unity owns the scene, pointer physics and animation. The browser-free rules module
// remains the single authority, shared with score replay verification and simulations.
public partial class ForgeWorld:MonoBehaviour {
 [DllImport("__Internal")] static extern void ForgeSend(string json);
 class Body {public GameObject root,blade;public Renderer bladeRenderer; public Material metal;public Vector3 target,velocity;public ForgeKnife knife;public string signature;public float heat,evolution;public HeatState heatState;public KnifeMotion motion=new KnifeMotion();}
 readonly Dictionary<int,Body> bodies=new Dictionary<int,Body>();
 /// Station spots from the frozen layout (ForgeLayoutData).
 readonly Dictionary<string,Vector3> spots=Stations(ForgeLayout.Spot);
 static Dictionary<string,Vector3> Stations(Func<string,Vector3> at){var d=new Dictionary<string,Vector3>();foreach(var key in ForgeLayoutData.StationKeys)d[key]=at(key);return d;}
 string queuedSnapshot;
 Camera cam;Transform hammer,scalePan,fire,ring;Light furnaceLight,flash;Material fireMat,ringMat,wood,stone,iron,brass,leather,coal;ForgeSnapshot state;
 Vector3 cameraHome;int oldWidth,oldHeight; Cubemap environment;
 bool reduced,motionOff;float ringAge=10,scaleAge=10,elapsed;
 // Legacy pose path only (LegacyHammer).
 bool swinging;float swingTime,swingSpeed=1;
 bool Swinging=>LegacyHammer?swinging:strikes.Busy;

 void Start(){
  dynamicRoot=new GameObject("Dynamic objects").transform;
  // Uncapped: the browser's rAF paces the frames (a 60 cap would quantise contact to 16.7 ms on 120 Hz displays).
  Application.targetFrameRate=-1;
#if UNITY_WEBGL && !UNITY_EDITOR
  WebGLInput.captureAllKeyboardInput=false;
#endif
  boxMesh=RoundedBox();strikes.tuning=tuning.strike;arc.tuning=tuning.strike;
  MakeMaterials();MakeRoom();MakeBench();MakeFurnace();MakeAnvil();MakeCrate();MakeRack();MakeScale();MakeStall();MakeLantern();MakeHammer();MakeTongs();MakeLighting();MakeDressing();AtmosBuild();BatchRoom();FindRoomBellows();BakeWorkshopReflection();
  var cameraObject=new GameObject("Workshop camera");cam=cameraObject.AddComponent<Camera>();cam.nearClipPlane=.035f;cam.farClipPlane=65;cam.clearFlags=CameraClearFlags.SolidColor;cam.backgroundColor=C("111b19");cam.allowHDR=true;cameraObject.AddComponent<ForgeFinish>();cameraObject.AddComponent<ForgeCameraRig>().forge=this;
  AtmosCamera(cam);
  CreateSmith();Resize();if(queuedSnapshot!=null){var pending=queuedSnapshot;queuedSnapshot=null;Sync(pending);}Quick("focus");WarmShaders();Send("ready",0,"",ForgeContract.Protocol);
 }
 void Resize(){oldWidth=Screen.width;oldHeight=Screen.height;if(cameraHome==Vector3.zero){cameraHome=smith.position+Vector3.up*ForgeLayout.EyeHeight;cam.transform.position=cameraHome;}ResizeQuality();labelsDirty=true;}
 void Send(string type,int id=0,string spot="",float x=0,float y=0){var json=JsonUtility.ToJson(new ForgeMessage{type=type,id=id,spot=spot,x=x,y=y});
#if UNITY_WEBGL && !UNITY_EDITOR
  ForgeSend(json);
#else
  Debug.Log("FORGE_EVENT "+json);
#if UNITY_EDITOR
  QaSend?.Invoke(json);
#endif
#endif
  StrikeTelemetry(type,id,x);
 }
 void SendLabels(){if(cam==null)return;foreach(var spot in spots){var at=spot.Key=="anvil"&&AnvilBody() is Body b&&b.bladeRenderer!=null?b.bladeRenderer.bounds.center:spot.Value;var p=cam.WorldToViewportPoint(at);Send("label",0,spot.Key,p.x*100,(1-p.y)*100);}}
 public void Sync(string json){if(cam==null){queuedSnapshot=json;return;}var next=JsonUtility.FromJson<ForgeSnapshot>(json);if(next==null||next.knives==null)return;int previousDay=state!=null?state.day:next.day;state=next;
  // The Motion setting: 'reduced' and 'off' run the reduced-motion choreography; 'off' also removes the kicks.
  reduced=next.reduced||next.motion=="reduced"||next.motion=="off";motionOff=next.motion=="off";currentRisk=next.risk;
  var ids=new HashSet<int>();foreach(var k in next.knives)ids.Add(k.id);var removed=new List<int>();foreach(var pair in bodies)if(!ids.Contains(pair.Key))removed.Add(pair.Key);
  foreach(var id in removed){var removedBody=bodies[id];if(hearth!=null&&hearth.knifeId==id)AbortHearth(false);if(heldId==id)heldId=-1;if(carriedId==id)carriedId=-1;
   if(next.effect!=null&&next.effect.id==id&&next.effect.kind=="sell"){KeepSale(removedBody);StartGlance();}else{if(next.effect!=null&&next.effect.id==id&&next.effect.outcome=="shatter")BreakBlade(removedBody);DisposeBody(removedBody);}bodies.Remove(id);}
  int crateIndex=0,rackIndex=0;foreach(var k in next.knives){Body b;string was=null;bool fresh=false;
   if(!bodies.TryGetValue(k.id,out b)){b=MakeKnife(k);b.signature=KnifeSignature(k);b.knife=k;b.target=PlaceTarget(k,ref crateIndex,ref rackIndex);b.root.transform.position=b.target;bodies[k.id]=b;fresh=true;}
   else{was=b.knife.place;if(syncedOnce&&b.heatState!=null&&BeginsKeep(b,k))b.heatState.quenchHold=true;var sig=KnifeSignature(k,b);if(b.signature!=sig){KnifeRefresh(b,k);b.signature=sig;}b.knife=k;b.target=PlaceTarget(k,ref crateIndex,ref rackIndex);}
   if(b.root.transform.parent!=dynamicRoot)b.root.transform.SetParent(dynamicRoot,true);
   if(next.effect!=null&&next.effect.kind=="heat"&&next.effect.id==k.id)KnifeHeated(b);
   KnifeMoved(b,was,fresh,next.effect);
  }
  syncedOnce=true;
  foreach(var pair in bodies)TensionFx(pair.Value,pair.Value.knife.place=="anvil"?next.risk:0);
  // No knife on the anvil any more: strikes that have not landed are cancelled (settled x = -1).
  if(AnvilBody()==null&&hearth==null)CancelStrikes();
  if(next.effect!=null){var e=next.effect;if(e.kind=="hit")Impact(e);
   // The evolution ring only (Flow no longer triggers the world ring), at a quarter alpha.
   if(e.evolution&&bodies.TryGetValue(e.id,out var evolved)){ringAge=0;ring.position=new Vector3(lastContact.x,ForgeLayout.AnvilTopY+.012f,ForgeLayout.StrikePoint.z);ringMat.SetColor("_Color",new Color(1,.65f,.2f,K.ringAlpha));EvolutionFx(evolved);}}
  if(next.day!=previousDay){AtmosDay(next.day);DayFx(next.day);}
 }
 void DisposeBody(Body b){if(b.blade!=null)Destroy(b.blade.GetComponent<MeshFilter>().sharedMesh);if(b.metal!=null)Destroy(b.metal);Destroy(b.root);}
 public void Strike(string seqText){int seq;int.TryParse(seqText,out seq);StrikeTelemetry("press",seq,0);
  if(LegacyHammer){if(swinging){if(seq>0)Send("settled",seq,"",-1);return;}strikeSeq=seq;workFocus=true;carriedId=-1;if(Vector3.Distance(smith.position,approaches["anvil"])>.27f){GoTo("anvil","begin");return;}BeginLegacySwing();return;}
  if(smith==null||state==null||state.ended||pendingBegin!=0){if(seq>0)Send("settled",seq,"",-1);return;}
  workFocus=true;carriedId=-1;
  if(hearth==null&&Vector3.Distance(smith.position,approaches["anvil"])>.27f){if(strikes.Busy){if(seq>0)Send("settled",seq,"",-1);return;}pendingBegin=seq==0?-1:seq;GoTo("anvil","begin");return;}
  AcceptStrike(seq);
 }
 /// Arrived at the anvil for a strike sent from elsewhere ('begin' route).
 void BeginSwing(){if(LegacyHammer){BeginLegacySwing();return;}int seq=pendingBegin<0?0:pendingBegin;pendingBegin=0;AcceptStrike(seq);}
 public void Pointer(string json){PlayerPointer(JsonUtility.FromJson<ForgePointer>(json));}
 /// The page resolved a hit (re-entrant from Send('impact') on the contact frame).
 void Impact(ForgeEvent e){
  var k=K;string outcome=e.outcome??"good";bool evolution=e.evolution;
  // JsonUtility gives an empty 'after' for a Shatter: branch on the outcome.
  bool guarded=outcome!="shatter"&&e.before!=null&&e.after!=null&&e.before.guard&&!e.after.guard;
  bool flow=strikes.hasCurrent?strikes.current.flow:(e.before!=null&&e.before.flow>0);
  float hs=ForgeFeel.HitStopMs(k,outcome,evolution,guarded,flow,reduced);
  if(hs>0){clock.HitStop(hs/1000f,true);strikes.ResolveHitStop(hs);StrikeTelemetry("hitstop",strikes.hasCurrent?strikes.current.seq:strikeSeq,hs);}
  if(outcome=="shatter"&&!reduced)clock.SlowMo(k.shatterSlowScale,k.shatterSlowMs/1000f,k.shatterRampMs/1000f);
  CameraImpact(outcome,evolution,guarded);
  reboundLift=ForgeFeel.ReboundM(k,outcome,evolution);reboundSkew=outcome=="chip"?.01f*k.chipSkewCm:0;reboundTilt=outcome=="shatter"?k.shatterTiltDeg:0;
  var contact=lastContact;
  bodies.TryGetValue(e.id,out var b);AtmosImpact(e,contact,b!=null?KnifeTemperature(b):0);ImpactFx(e,b,contact);
  if(b!=null){StartJitter(hs);FeedAfterStrike();}
 }

 void Update(){
  if(cam==null)return;if(Screen.width!=oldWidth||Screen.height!=oldHeight)Resize();
  float raw=ForgeTime.Raw(Time.unscaledDeltaTime);UpdateQuality(raw);RewarmIfNeeded();
  // Time policy: the strike timeline, camera and input run on real time; hit-stop freezes the world (Time.timeScale 0),
  // which only this method writes (from ForgeTime, with its 600 ms watchdog).
  clock.Step(raw);float scale=clock.Watch(raw,clock.Scale);if(Time.timeScale!=scale)Time.timeScale=scale;
  float dt=Mathf.Min(raw,.04f),world=dt*scale;strikeNow+=raw*1000;elapsed+=world;
  UpdateSmith(dt,raw);UpdateChoreo(dt);
  UpdateFirstPersonHammer(dt);UpdateAnvilKnife(dt);UpdateTongs(dt);UpdateKnives(dt);
  foreach(var pair in bodies)KnifeVisual(pair.Value,world);
  UpdateAtmosphere(world);UpdateHearthSmoke(world);UpdateEffects(world);UpdateFragments(world);
  UpdateLighting(dt);UpdateSmithCamera(dt);
#if UNITY_EDITOR
  QaCameraOverride();
#endif
  ringAge+=world;ring.localScale=Vector3.one*(.2f+ringAge*3);var rc=ringMat.GetColor("_Color");rc.a=Mathf.Max(0,K.ringAlpha-ringAge*.9f*K.ringAlpha/.55f);ringMat.SetColor("_Color",rc);
  scaleAge+=world;scalePan.localPosition=spots["sell"]+Vector3.up*(.12f-Mathf.Sin(Mathf.Clamp01(scaleAge/.8f)*Mathf.PI)*.035f);
 }
 void OnDestroy(){DisposeEffects();foreach(var b in bodies.Values)if(b.metal)Destroy(b.metal);if(environment)Destroy(environment);}
}
