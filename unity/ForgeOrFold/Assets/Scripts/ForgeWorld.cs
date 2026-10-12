using System;
using System.Collections;
using System.Collections.Generic;
using System.Runtime.InteropServices;
using UnityEngine;
using UnityEngine.Rendering;

public class ForgeKnifeTag:MonoBehaviour { public int id; }

// Unity owns the scene, pointer physics and animation. The browser-free rules module
// remains the single authority, shared with score replay verification and simulations.
public partial class ForgeWorld:MonoBehaviour {
 [DllImport("__Internal")] static extern void ForgeSend(string json);
 class Body {public GameObject root,blade;public Renderer bladeRenderer; public Material metal;public Vector3 target,velocity;public ForgeKnife knife;public string signature;public float heat,evolution;public HeatState heatState;}
 readonly Dictionary<int,Body> bodies=new Dictionary<int,Body>();
 readonly Dictionary<string,Vector3> spots=new Dictionary<string,Vector3>{{"crate",new Vector3(-1.8f,.94f,-.2f)},{"furnace",new Vector3(-2.45f,1.08f,.65f)},{"anvil",new Vector3(0,1.015f,-.4f)},{"rack",new Vector3(1.8f,1.03f,1.1f)},{"sell",new Vector3(1.65f,1.015f,-.25f)},{"shop",new Vector3(2.8f,1.0f,.65f)},{"lantern",new Vector3(.87f,.96f,.85f)}};
 string queuedSnapshot;
 Camera cam;Transform hammer,scalePan,fire,ring;Light furnaceLight,flash;Material fireMat,ringMat,wood,stone,iron,brass,leather,coal;ForgeSnapshot state;
 Vector3 cameraHome,dragTarget;Plane carryPlane=new Plane(Vector3.up,new Vector3(0,1.85f,0));int dragging=-1;Vector2 pointerDown;bool dragMoved,swinging,reduced;float swingTime,swingSpeed=1,shake,ringAge=10,scaleAge=10,elapsed;int oldWidth,oldHeight; Cubemap environment;

 void Start(){
  dynamicRoot=new GameObject("Dynamic objects").transform;
  Application.targetFrameRate=60;
#if UNITY_WEBGL && !UNITY_EDITOR
  WebGLInput.captureAllKeyboardInput=false;
#endif
  boxMesh=RoundedBox();
  MakeMaterials();MakeRoom();MakeBench();MakeFurnace();MakeAnvil();MakeCrate();MakeRack();MakeScale();MakeStall();MakeLantern();MakeHammer();MakeLighting();MakeDressing();AtmosBuild();BatchRoom();BakeWorkshopReflection();
  var cameraObject=new GameObject("Workshop camera");cam=cameraObject.AddComponent<Camera>();cam.nearClipPlane=.035f;cam.farClipPlane=65;cam.clearFlags=CameraClearFlags.SolidColor;cam.backgroundColor=C("111b19");cam.allowHDR=true;cameraObject.AddComponent<ForgeFinish>();
  AtmosCamera(cam);
  CreateSmith();Resize();if(queuedSnapshot!=null){var pending=queuedSnapshot;queuedSnapshot=null;Sync(pending);}Quick("focus");Send("ready",0,"",ForgeContract.Protocol);
 }
 void Resize(){oldWidth=Screen.width;oldHeight=Screen.height;cam.fieldOfView=Narrow?68:60;if(cameraHome==Vector3.zero){cameraHome=smith.position+Vector3.up*1.62f;cam.transform.position=cameraHome;}ResizeQuality();SendLabels();}
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
 void SendLabels(){foreach(var spot in spots){var p=cam.WorldToViewportPoint(spot.Value);Send("label",0,spot.Key,p.x*100,(1-p.y)*100);}}
 public void Sync(string json){if(cam==null){queuedSnapshot=json;return;}var next=JsonUtility.FromJson<ForgeSnapshot>(json);if(next==null||next.knives==null)return;int previousDay=state!=null?state.day:next.day;state=next;reduced=next.reduced;currentRisk=next.risk;var ids=new HashSet<int>();foreach(var k in next.knives)ids.Add(k.id);var removed=new List<int>();foreach(var pair in bodies)if(!ids.Contains(pair.Key))removed.Add(pair.Key);foreach(var id in removed){var removedBody=bodies[id];if(next.effect!=null&&next.effect.id==id&&next.effect.kind=="sell")KeepSale(removedBody);else{if(next.effect!=null&&next.effect.id==id&&next.effect.outcome=="shatter")BreakBlade(removedBody);DisposeBody(removedBody);}bodies.Remove(id);}
  int crateIndex=0,rackIndex=0;foreach(var k in next.knives){var sig=KnifeSignature(k);Body b;string was=null;if(!bodies.TryGetValue(k.id,out b)){b=MakeKnife(k);b.signature=sig;b.root.transform.position=spots.ContainsKey(k.place)?spots[k.place]:Vector3.zero;bodies[k.id]=b;}else{was=b.knife.place;if(b.signature!=sig){KnifeRefresh(b,k);b.signature=sig;}}b.knife=k;b.target=spots[k.place];if(k.place=="crate"){b.target+=new Vector3(-.2f,.02f+(crateIndex/3)*.035f,-.18f+(crateIndex%3)*.15f);crateIndex++;}if(k.place=="rack"){b.target+=new Vector3(-.36f+rackIndex*.24f,.04f,-.08f);rackIndex++;}if(k.place=="anvil")b.target=new Vector3(-.2f,1.035f,-.4f);if(k.place=="furnace")b.target+=new Vector3(-.2f,0,-.05f);
   if(next.effect!=null&&next.effect.kind=="heat"&&next.effect.id==k.id)KnifeHeated(b);
   if(was!=k.place){if(k.place=="furnace")KnifeInCoals(b,true);else if(was=="furnace")KnifeInCoals(b,false);}
  }
  foreach(var pair in bodies)TensionFx(pair.Value,pair.Value.knife.place=="anvil"?next.risk:0);
  if(next.effect!=null){var e=next.effect;if(e.kind=="hit")Impact(e);if(e.kind=="flow"||e.flowStarted){ringAge=0;ringMat.SetColor("_Color",new Color(.3f,.95f,.9f,.55f));}if(e.kind=="buy"&&bodies.TryGetValue(e.id,out var purchase)){purchase.root.transform.position=spots["shop"]+Vector3.up*.25f;purchase.root.transform.localScale=Vector3.one*KnifeRootScale;purchase.velocity=Vector3.up*.5f;}if(e.evolution&&bodies.TryGetValue(e.id,out var evolved)){ringAge=0;EvolutionFx(evolved);}}
  if(next.day!=previousDay){AtmosDay(next.day);DayFx(next.day);}
 }
 void DisposeBody(Body b){if(b.blade!=null)Destroy(b.blade.GetComponent<MeshFilter>().sharedMesh);if(b.metal!=null)Destroy(b.metal);Destroy(b.root);}
 public void Strike(string seqText){int seq;int.TryParse(seqText,out seq);StrikeTelemetry("press",seq,0);if(swinging){if(seq>0)Send("settled",seq,"",-1);return;}strikeSeq=seq;workFocus=true;carriedId=-1;if(Vector3.Distance(smith.position,approaches["anvil"])>.27f){GoTo("anvil","begin");return;}BeginSwing();}
 void BeginSwing(){FaceStation("anvil");swinging=true;swingTime=0;swingSpeed=1;if(state!=null)foreach(var k in state.knives)if(k.place=="anvil"&&(k.flow>0||k.pips>=state.flowNeed))swingSpeed=state.flowSpeed;Send("swing",strikeSeq,"",.34f/swingSpeed*1000);}
 public void Pointer(string json){PlayerPointer(JsonUtility.FromJson<ForgePointer>(json));}
 void OldPointer(string json){if(cam==null||state==null||state.ended||swinging)return;var p=JsonUtility.FromJson<ForgePointer>(json);var ray=cam.ViewportPointToRay(new Vector3(p.x,1-p.y));if(p.phase=="down"){Send("gesture");if(Physics.Raycast(ray,out var hit,50)){var tag=hit.collider.GetComponent<ForgeKnifeTag>();if(tag!=null){dragging=tag.id;pointerDown=new Vector2(p.x,p.y);dragMoved=false;dragTarget=bodies[dragging].root.transform.position;Send("select",dragging);return;}}if(carryPlane.Raycast(ray,out var t)){var near=Nearest(ray.GetPoint(t));if(near=="shop"||near=="lantern")Send("spot",0,near);}}
  else if(p.phase=="move"&&dragging>=0){if(Vector2.Distance(pointerDown,new Vector2(p.x,p.y))>.009f)dragMoved=true;if(carryPlane.Raycast(ray,out var t)){dragTarget=ray.GetPoint(t);var spot=Nearest(dragTarget);if(spot!=""){var target=spots[spot];target.y=dragTarget.y;if(Vector3.Distance(target,dragTarget)<.85f)dragTarget=Vector3.Lerp(dragTarget,target,.35f);}Send("hover",dragging,spot);}}
  else if((p.phase=="up"||p.phase=="cancel")&&dragging>=0){int id=dragging;dragging=-1;Send("hover");if(p.phase=="cancel")return;if(dragMoved){if(carryPlane.Raycast(ray,out var t)){var spot=Nearest(ray.GetPoint(t));if(spot!="")Send("drop",id,spot);}}else if(bodies.TryGetValue(id,out var body)&&body.knife.place=="anvil")Send("hit",id);}
 }
 string Nearest(Vector3 at){string best="";float distance=1.45f;foreach(var s in spots){float d=Vector2.Distance(new Vector2(at.x,at.z),new Vector2(s.Value.x,s.Value.z));if(d<distance){distance=d;best=s.Key;}}return best;}
 void Impact(ForgeEvent e){if(!reduced){clock.HitStop(.06f);shake=e.outcome=="shatter"?.07f:e.outcome=="perfect"?.048f:e.outcome=="dull"?.008f:.025f;}
  var contact=new Vector3(.12f,1.065f,-.4f);lastContact=contact;
  bodies.TryGetValue(e.id,out var b);AtmosImpact(e,contact,b!=null?KnifeTemperature(b):0);ImpactFx(e,b,contact);
  if(b!=null)b.velocity+=Vector3.up*(e.outcome=="chip"?.32f:.12f);
 }

 void Update(){
  if(cam==null)return;if(Screen.width!=oldWidth||Screen.height!=oldHeight)Resize();float raw=ForgeTime.Raw(Time.unscaledDeltaTime);UpdateQuality(raw);
  float dt=Mathf.Min(raw,.04f);bool held=clock.Step(raw);float scale=clock.Watch(raw,clock.Scale);if(Time.timeScale!=scale)Time.timeScale=scale;if(held)return;elapsed+=dt;UpdateSmith(dt,raw);UpdateAtmosphere(dt);UpdateHearthSmoke(dt);UpdateEffects(dt);
  UpdateFirstPersonHammer(raw);
  foreach(var pair in bodies){var b=pair.Value;bool drag=dragging==pair.Key&&dragMoved;var target=carriedId==pair.Key?CarryPoint():drag?dragTarget:b.target;b.velocity+=(target-b.root.transform.position)*dt*105;b.velocity*=Mathf.Exp(-dt*13);b.root.transform.position+=b.velocity*dt;float size=KnifeRootScale;b.root.transform.localScale=Vector3.Lerp(b.root.transform.localScale,Vector3.one*(drag?size*1.16f:size),1-Mathf.Exp(-dt*10));float yaw=carriedId==pair.Key?smith.eulerAngles.y+90:b.knife.place=="rack"?90:0;b.root.transform.rotation=Quaternion.Slerp(b.root.transform.rotation,Quaternion.Euler(drag?b.velocity.z*3:0,yaw,drag?-b.velocity.x*3:0),1-Mathf.Exp(-dt*12));KnifeVisual(b,dt);}
  UpdateFragments(dt);
  UpdateLighting(dt);shake*=Mathf.Exp(-dt*12);UpdateSmithCamera(dt);cam.transform.position=cameraHome+(reduced?Vector3.zero:new Vector3(Mathf.Sin(elapsed*83),Mathf.Cos(elapsed*97),0)*shake);ringAge+=dt;ring.localScale=Vector3.one*(.2f+ringAge*3);var rc=ringMat.GetColor("_Color");rc.a=Mathf.Max(0,.55f-ringAge*.9f);ringMat.SetColor("_Color",rc);scaleAge+=dt;scalePan.localPosition=spots["sell"]+Vector3.up*(.12f-Mathf.Sin(Mathf.Clamp01(scaleAge/.8f)*Mathf.PI)*.035f);
 }
 void OnDestroy(){DisposeEffects();foreach(var b in bodies.Values)if(b.metal)Destroy(b.metal);if(environment)Destroy(environment);}
}
