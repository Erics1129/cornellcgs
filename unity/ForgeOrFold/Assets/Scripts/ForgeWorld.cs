using System;
using System.Collections;
using System.Collections.Generic;
using System.Runtime.InteropServices;
using UnityEngine;
using UnityEngine.Rendering;

[Serializable] public class ForgeKnife { public int id,level,family,pips,flow; public string metal,place,displayName;public int saleValue,heldValue; public bool heated,guard,sharpened; public string color,glow; public float rough; public Vector2[] profile; }
[Serializable] public class ForgeEvent { public string kind,outcome; public int id; public bool evolution; }
[Serializable] public class ForgeSnapshot { public ForgeKnife[] knives; public int selected,day; public bool ended,reduced; public ForgeEvent effect; public ForgeOffer[] offers; }
[Serializable] public class ForgePointer { public float x,y; public string phase; }
[Serializable] public class ForgeMessage { public string type,spot; public int id; public float x,y; }
public class ForgeKnifeTag:MonoBehaviour { public int id; }

// Unity owns the scene, pointer physics and animation. The browser-free rules module
// remains the single authority, shared with score replay verification and simulations.
public partial class ForgeWorld:MonoBehaviour {
 [DllImport("__Internal")] static extern void ForgeSend(string json);
 class Body {public GameObject root,blade;public Renderer bladeRenderer; public Material metal;public Vector3 target,velocity;public ForgeKnife knife;public string signature;public float heat,evolution;}
 class Fragment {public GameObject root;public Renderer renderer;public Vector3 velocity,spin;public float life,maxLife,size;public bool coin;public TrailRenderer trail;}
 readonly Dictionary<int,Body> bodies=new Dictionary<int,Body>();
 readonly Dictionary<string,Vector3> spots=new Dictionary<string,Vector3>{{"crate",new Vector3(-1.8f,.94f,-.2f)},{"furnace",new Vector3(-2.45f,1.08f,.65f)},{"anvil",new Vector3(0,1.015f,-.4f)},{"rack",new Vector3(1.8f,1.03f,1.1f)},{"sell",new Vector3(1.65f,1.015f,-.25f)},{"shop",new Vector3(2.8f,1.0f,.65f)},{"lantern",new Vector3(.87f,.96f,.85f)}};
 readonly List<Fragment> fragments=new List<Fragment>();
 readonly Stack<Fragment> fragmentPool=new Stack<Fragment>();
 string queuedSnapshot;
 Camera cam;Transform hammer,scalePan,fire,ring;Light furnaceLight,flash;Material fireMat,ringMat,wood,stone,iron,brass,leather,coal;ForgeSnapshot state;
 Vector3 cameraHome,dragTarget;Plane carryPlane=new Plane(Vector3.up,new Vector3(0,1.85f,0));int dragging=-1;Vector2 pointerDown;bool dragMoved,swinging,reduced;float swingTime,freeze,shake,ringAge=10,scaleAge=10,elapsed,qualityTime;int oldWidth,oldHeight,frameCount;float frameTotal; Mesh boxMesh; Cubemap environment; Material particleGold,particleIron,particleAsh,particleHot,sparkTrail;

 void Start(){
  Application.targetFrameRate=60;
#if UNITY_WEBGL && !UNITY_EDITOR
  WebGLInput.captureAllKeyboardInput=false;
#endif
  boxMesh=RoundedBox();
  MakeMaterials();MakeRoom();MakeBench();MakeFurnace();MakeAnvil();MakeCrate();MakeRack();MakeScale();MakeStall();MakeLantern();MakeHammer();MakeLighting();MakeDressing();BatchRoom();BakeWorkshopReflection();
  var cameraObject=new GameObject("Workshop camera");cam=cameraObject.AddComponent<Camera>();cam.nearClipPlane=.035f;cam.farClipPlane=65;cam.clearFlags=CameraClearFlags.SolidColor;cam.backgroundColor=C("111b19");cam.allowHDR=true;cameraObject.AddComponent<ForgeFinish>();
  CreateSmith();Resize();if(queuedSnapshot!=null){var pending=queuedSnapshot;queuedSnapshot=null;Sync(pending);}Quick("focus");Send("ready");
 }
 static Color C(string hex){ColorUtility.TryParseHtmlString(hex.StartsWith("#")?hex:"#"+hex,out var c);return c;}
 Material Mat(string name,string color,float metal=0,float smooth=.3f){var m=new Material(Shader.Find("Forge/Surface")){name=name,color=C(color)};m.SetFloat("_Metallic",metal);m.SetFloat("_Glossiness",smooth);return m;}
 void MakeMaterials(){
  wood=Mat("Smoked oak","cdb99c",0,.26f);wood.mainTexture=Resources.Load<Texture2D>("Forge/WoodV3");
  stone=Mat("Soot blackened masonry","a2917e",0,.08f);stone.mainTexture=Resources.Load<Texture2D>("Forge/BrickV3");
  iron=Mat("Forged iron","505c61",.87f,.46f);brass=Mat("Aged brass","b59957",.8f,.57f);leather=Mat("Wrapped leather","352b25",0,.29f);coal=Mat("Coal","191c1a",.1f,.1f);
  wood.SetFloat("_Scale",1.6f);stone.SetFloat("_Scale",1.3f);iron.mainTexture=Resources.Load<Texture2D>("Forge/IronV3");iron.SetFloat("_Scale",1.8f);iron.color=C("676d70");iron.SetFloat("_BumpStrength",.0018f);leather.mainTexture=Resources.Load<Texture2D>("Forge/LeatherV3");leather.color=C("b1a394");leather.SetFloat("_Scale",2);wood.SetFloat("_BumpStrength",.0025f);stone.SetFloat("_BumpStrength",.003f);
  sparkTrail=new Material(Shader.Find("Forge/Spark"));sparkTrail.SetColor("_Color",new Color(1,.68f,.23f,1));
  particleGold=Mat("Golden impact","fbc987",.75f,.7f);particleIron=Mat("Metal shards","9ba5ac",.9f,.6f);particleAsh=Mat("Dust","878778",0,.1f);particleHot=Mat("White orange embers","ffc680",.45f,.6f);
  foreach(var m in new[]{particleGold,particleHot}){m.EnableKeyword("_EMISSION");m.SetColor("_EmissionColor",m.color*2);}
 }
 GameObject Box(string name,Vector3 p,Vector3 s,Material m,Transform parent=null){var go=new GameObject(name);go.transform.SetParent(parent,false);go.transform.localPosition=p;go.transform.localScale=s;go.AddComponent<MeshFilter>().sharedMesh=boxMesh;go.AddComponent<MeshRenderer>().sharedMaterial=m;return go;}
 GameObject Primitive(string name,PrimitiveType type,Vector3 p,Vector3 s,Material m,Transform parent=null){var go=GameObject.CreatePrimitive(type);Destroy(go.GetComponent<Collider>());go.name=name;go.transform.SetParent(parent,false);go.transform.localPosition=p;go.transform.localScale=s;go.GetComponent<Renderer>().sharedMaterial=m;return go;}
 Transform Group(string name,Vector3 p){var g=new GameObject(name);g.transform.position=p;return g.transform;}
 void Resize(){oldWidth=Screen.width;oldHeight=Screen.height;cam.fieldOfView=Screen.width<700?68:60;if(cameraHome==Vector3.zero){cameraHome=smith.position+Vector3.up*1.62f;cam.transform.position=cameraHome;}QualitySettings.shadows=ShadowQuality.All;SendLabels();}
 void Send(string type,int id=0,string spot="",float x=0,float y=0){var json=JsonUtility.ToJson(new ForgeMessage{type=type,id=id,spot=spot,x=x,y=y});
#if UNITY_WEBGL && !UNITY_EDITOR
  ForgeSend(json);
#else
  Debug.Log("FORGE_EVENT "+json);
#endif
 }
 void SendLabels(){foreach(var spot in spots){var p=cam.WorldToViewportPoint(spot.Value);Send("label",0,spot.Key,p.x*100,(1-p.y)*100);}}
 public void Sync(string json){if(cam==null){queuedSnapshot=json;return;}var next=JsonUtility.FromJson<ForgeSnapshot>(json);if(next==null||next.knives==null)return;state=next;reduced=next.reduced;var ids=new HashSet<int>();foreach(var k in next.knives)ids.Add(k.id);var removed=new List<int>();foreach(var pair in bodies)if(!ids.Contains(pair.Key))removed.Add(pair.Key);foreach(var id in removed){DisposeBody(bodies[id]);bodies.Remove(id);}
  int crateIndex=0,rackIndex=0;foreach(var k in next.knives){var sig=k.metal+":"+k.family+":"+Mathf.Min(5,k.level/3);Body b;if(!bodies.TryGetValue(k.id,out b)||b.signature!=sig){var old=b;var pos=old!=null?old.root.transform.position:spots.ContainsKey(k.place)?spots[k.place]:Vector3.zero;float heat=old!=null?old.heat:0;if(old!=null)DisposeBody(old);b=MakeKnife(k);b.signature=sig;b.root.transform.position=pos;b.heat=heat;bodies[k.id]=b;}b.knife=k;b.target=spots[k.place];if(k.place=="crate"){b.target+=new Vector3(-.2f,.02f+(crateIndex/3)*.035f,-.18f+(crateIndex%3)*.15f);crateIndex++;}if(k.place=="rack"){b.target+=new Vector3(-.36f+rackIndex*.24f,.04f,-.08f);rackIndex++;}if(k.place=="anvil")b.target=new Vector3(-.2f,1.035f,-.4f);if(k.place=="furnace")b.target+=new Vector3(-.2f,0,-.05f);
   if(next.effect!=null&&next.effect.kind=="heat"&&next.effect.id==k.id)b.heat=1;
  }
  if(next.effect!=null){var e=next.effect;if(e.kind=="hit")Impact(e);if(e.kind=="flow"){ringAge=0;ringMat.SetColor("_Color",new Color(.3f,.95f,.9f,.55f));}if(e.kind=="sell"){Burst(spots["sell"]+Vector3.up*.5f,25,"coin");scaleAge=0;}if(e.evolution&&bodies.TryGetValue(e.id,out var evolved)){evolved.evolution=1.5f;ringAge=0;Burst(evolved.target,65,"perfect");}}
 }
 void DisposeBody(Body b){if(b.blade!=null)Destroy(b.blade.GetComponent<MeshFilter>().sharedMesh);if(b.metal!=null)Destroy(b.metal);Destroy(b.root);}
 Body MakeKnife(ForgeKnife k){int stage=Mathf.Min(5,k.level/3);var root=new GameObject("Knife "+k.id);var profile=k.profile;var metal=new Material(Shader.Find("Forge/Blade")){name=k.metal+" blade",color=C(string.IsNullOrEmpty(k.color)?"b7c5ca":k.color)};metal.SetTexture("_MainTex",Resources.Load<Texture2D>("Forge/SteelV2"));metal.SetFloat("_Metallic",k.metal=="obsidian"?.25f:.94f);metal.SetFloat("_Glossiness",1-Mathf.Clamp(k.rough,.05f,.85f));metal.SetFloat("_Kind",Array.IndexOf(new[]{"iron","bronze","steel","silver","damascus","obsidian","meteor","auricite"},k.metal));metal.SetFloat("_Stage",stage);metal.SetColor("_GlowColor",C(k.glow));
  var blade=MeshObject("Beveled blade",BladeMesh(profile,.055f),metal);blade.transform.SetParent(root.transform,false);
  // Profiles come from the shared eight-family model. Their length evolves with level.
  Box("Blade bolster",new Vector3(-.055f,0,0),new Vector3(.12f,.13f,.24f),brass,root.transform);
  Box("Contoured handle",new Vector3(-.53f,0,0),new Vector3(.78f,.16f,.21f),leather,root.transform);
  for(int i=0;i<8;i++)Box("Leather wrap",new Vector3(-.86f+i*.09f,.002f,0),new Vector3(.016f,.169f,.22f),i%3==0?brass:leather,root.transform);
  Box("Pommel",new Vector3(-.97f,0,0),new Vector3(.13f,.18f,.25f),brass,root.transform);
  if(stage>=1)Box("Guard",new Vector3(-.09f,.01f,0),new Vector3(.09f,.18f,.42f+stage*.055f),brass,root.transform);
  if(stage>=2)Box("Fuller",new Vector3(.58f,.033f,-.025f),new Vector3(.85f,.005f,.028f),iron,root.transform);
  if(stage>=3){var gem=Primitive("Guard gemstone",PrimitiveType.Sphere,new Vector3(-.09f,.12f,0),new Vector3(.14f,.09f,.14f),metal,root.transform);gem.transform.Rotate(0,45,0);for(int i=0;i<4;i++){var rune=Box("Inlaid engraving",new Vector3(.22f+i*.18f,.034f,-.05f),new Vector3(.07f,.005f,.012f),brass,root.transform);rune.transform.Rotate(0,45,0);}}
  if(stage>=4){var edge=Box("Luminous spine",new Vector3(.78f,.01f,-.14f),new Vector3(1.05f,.025f,.018f),particleHot,root.transform);edge.transform.Rotate(0,2,0);}
  if(k.metal=="damascus")for(int i=0;i<10;i++){var wave=Box("Folded steel band",new Vector3(.22f+i*.1f,.032f,0),new Vector3(.008f,.004f,.18f),iron,root.transform);wave.transform.Rotate(0,18+Mathf.Sin(i)*10,0);}
  var collider=root.AddComponent<BoxCollider>();collider.center=new Vector3(.45f,0,0);collider.size=new Vector3(3.1f,.3f,.8f);root.AddComponent<ForgeKnifeTag>().id=k.id;
  return new Body{root=root,blade=blade,bladeRenderer=blade.GetComponent<Renderer>(),metal=metal,knife=k};
 }
 public void Strike(string unused){if(swinging)return;workFocus=true;carriedId=-1;if(Vector3.Distance(smith.position,approaches["anvil"])>.27f){GoTo("anvil","begin");return;}BeginSwing();}
 void BeginSwing(){FaceStation("anvil");swinging=true;swingTime=0;}
 public void Pointer(string json){PlayerPointer(JsonUtility.FromJson<ForgePointer>(json));}
 void OldPointer(string json){if(cam==null||state==null||state.ended||swinging)return;var p=JsonUtility.FromJson<ForgePointer>(json);var ray=cam.ViewportPointToRay(new Vector3(p.x,1-p.y));if(p.phase=="down"){Send("gesture");if(Physics.Raycast(ray,out var hit,50)){var tag=hit.collider.GetComponent<ForgeKnifeTag>();if(tag!=null){dragging=tag.id;pointerDown=new Vector2(p.x,p.y);dragMoved=false;dragTarget=bodies[dragging].root.transform.position;Send("select",dragging);return;}}if(carryPlane.Raycast(ray,out var t)){var near=Nearest(ray.GetPoint(t));if(near=="shop"||near=="lantern")Send("spot",0,near);}}
  else if(p.phase=="move"&&dragging>=0){if(Vector2.Distance(pointerDown,new Vector2(p.x,p.y))>.009f)dragMoved=true;if(carryPlane.Raycast(ray,out var t)){dragTarget=ray.GetPoint(t);var spot=Nearest(dragTarget);if(spot!=""){var target=spots[spot];target.y=dragTarget.y;if(Vector3.Distance(target,dragTarget)<.85f)dragTarget=Vector3.Lerp(dragTarget,target,.35f);}Send("hover",dragging,spot);}}
  else if((p.phase=="up"||p.phase=="cancel")&&dragging>=0){int id=dragging;dragging=-1;Send("hover");if(p.phase=="cancel")return;if(dragMoved){if(carryPlane.Raycast(ray,out var t)){var spot=Nearest(ray.GetPoint(t));if(spot!="")Send("drop",id,spot);}}else if(bodies.TryGetValue(id,out var body)&&body.knife.place=="anvil")Send("hit",id);}
 }
 string Nearest(Vector3 at){string best="";float distance=1.45f;foreach(var s in spots){float d=Vector2.Distance(new Vector2(at.x,at.z),new Vector2(s.Value.x,s.Value.z));if(d<distance){distance=d;best=s.Key;}}return best;}
 void Impact(ForgeEvent e){if(!reduced){freeze=.06f;shake=e.outcome=="shatter"?.07f:e.outcome=="perfect"?.048f:.025f;flash.intensity=e.outcome=="perfect"?7:3.8f;}
  Burst(new Vector3(.12f,1.065f,-.4f),e.outcome=="shatter"?78:e.outcome=="perfect"?95:e.outcome=="dull"?16:48,e.outcome);
  if(bodies.TryGetValue(e.id,out var b)){b.velocity+=Vector3.up*(e.outcome=="chip"?.32f:.12f);b.heat=Mathf.Max(b.heat,e.outcome=="perfect"?.62f:.32f);}
 }
 void BatchRoom(){var objects=new List<GameObject>();foreach(var renderer in FindObjectsByType<MeshRenderer>(FindObjectsSortMode.None)){var t=renderer.transform;if(t.name=="Drifting forge dust"||t.IsChildOf(hammer)||t.IsChildOf(scalePan)||t==fire||t==ring)continue;objects.Add(renderer.gameObject);}StaticBatchingUtility.Combine(objects.ToArray(),gameObject);}
 void Burst(Vector3 at,int count,string type){for(int i=0;i<count&&fragments.Count<220;i++){bool shard=type=="shatter"||type=="chip",coin=type=="coin";float size=shard?UnityEngine.Random.Range(.016f,.065f):coin?.055f:UnityEngine.Random.Range(.003f,.009f);Fragment p;if(fragmentPool.Count>0){p=fragmentPool.Pop();p.root.SetActive(true);}else{var go=Box("Pooled impact fragment",Vector3.zero,Vector3.one,particleHot);p=new Fragment{root=go,renderer=go.GetComponent<Renderer>()};p.trail=go.AddComponent<TrailRenderer>();p.trail.sharedMaterial=sparkTrail;p.trail.time=.16f;p.trail.minVertexDistance=.045f;p.trail.startWidth=.008f;p.trail.endWidth=0;p.trail.shadowCastingMode=ShadowCastingMode.Off;p.trail.receiveShadows=false;}p.trail.emitting=false;p.trail.Clear();p.root.transform.position=at;p.trail.emitting=!reduced&&!shard&&!coin&&type!="dull";p.root.transform.rotation=UnityEngine.Random.rotation;p.root.transform.localScale=new Vector3(size,coin?size*.14f:shard?size*.2f:size*2.5f,size);p.renderer.sharedMaterial=type=="dull"?particleAsh:shard?particleIron:coin||type=="perfect"?particleGold:particleHot;var vel=UnityEngine.Random.onUnitSphere*UnityEngine.Random.Range(.5f,2.7f);vel.y=Mathf.Abs(vel.y)+.25f;p.velocity=vel;p.spin=UnityEngine.Random.insideUnitSphere*430;p.life=UnityEngine.Random.Range(.65f,1.5f);p.maxLife=p.life;p.size=size;p.coin=coin;fragments.Add(p);}}

 void Update(){
  if(cam==null)return;if(Screen.width!=oldWidth||Screen.height!=oldHeight)Resize();float raw=Time.unscaledDeltaTime;frameTotal+=raw;frameCount++;qualityTime+=raw;if(qualityTime>5){float average=frameTotal/Mathf.Max(1,frameCount);Send("stats",fragments.Count,"fps",1/Mathf.Max(.001f,average),bodies.Count);if(average>.028f){QualitySettings.shadows=ShadowQuality.Disable;Send("quality",0,"low");}frameTotal=0;frameCount=0;qualityTime=0;}
  float dt=Mathf.Min(raw,.04f);if(freeze>0){freeze-=raw;return;}elapsed+=dt;UpdateSmith(dt,raw);UpdateAtmosphere(dt);
  UpdateFirstPersonHammer(raw);
  foreach(var pair in bodies){var b=pair.Value;bool drag=dragging==pair.Key&&dragMoved;var target=carriedId==pair.Key?CarryPoint():drag?dragTarget:b.target;b.velocity+=(target-b.root.transform.position)*dt*105;b.velocity*=Mathf.Exp(-dt*13);b.root.transform.position+=b.velocity*dt;float size=.28f;b.root.transform.localScale=Vector3.Lerp(b.root.transform.localScale,Vector3.one*(drag?size*1.16f:size),1-Mathf.Exp(-dt*10));float yaw=carriedId==pair.Key?smith.eulerAngles.y+90:b.knife.place=="rack"?90:0;b.root.transform.rotation=Quaternion.Slerp(b.root.transform.rotation,Quaternion.Euler(drag?b.velocity.z*3:0,yaw,drag?-b.velocity.x*3:0),1-Mathf.Exp(-dt*12));b.heat=Mathf.Max(0,b.heat-dt*.04f);b.evolution=Mathf.Max(0,b.evolution-dt);float lift=b.evolution>0?Mathf.Sin(b.evolution/1.5f*Mathf.PI):0;b.root.transform.position+=Vector3.up*lift*dt*2.4f;b.metal.SetFloat("_Heat",b.heat);b.metal.SetColor("_EmissionColor",Color.white*lift*2+(b.knife.flow>0?new Color(.08f,.25f,.3f):Color.black));if(b.knife.level>=15&&UnityEngine.Random.value<dt*6)Burst(b.root.transform.position+Vector3.right*.7f,1,"perfect");}
  for(int i=fragments.Count-1;i>=0;i--){var p=fragments[i];p.life-=dt;if(p.life<=0){p.trail.emitting=false;p.trail.Clear();p.root.SetActive(false);fragmentPool.Push(p);fragments.RemoveAt(i);continue;}if(p.coin&&p.life<.55f)p.velocity=Vector3.Lerp(p.velocity,new Vector3(0,6,-4),dt*7);else p.velocity.y-=dt*8;p.root.transform.position+=p.velocity*dt;var pos=p.root.transform.position;float ground=Mathf.Abs(pos.x)<.7f&&Mathf.Abs(pos.z+.4f)<.32f?1.025f:(pos.z>-.65f?.91f:.015f);if(pos.y<ground){pos.y=ground;p.root.transform.position=pos;p.velocity.y=Mathf.Abs(p.velocity.y)*.3f;p.velocity.x*=.76f;p.velocity.z*=.76f;}p.root.transform.Rotate(p.spin*dt);if(p.life<.3f)p.root.transform.localScale*=Mathf.Exp(-dt*7);}
  float flicker=reduced?1:1+Mathf.Sin(elapsed*12)*.08f+Mathf.Sin(elapsed*21)*.06f;furnaceLight.intensity=2.6f*flicker;fireMat.SetFloat("_Frame",reduced?0:Mathf.Floor(elapsed*14)%16);flash.intensity*=Mathf.Exp(-dt*12);shake*=Mathf.Exp(-dt*12);UpdateSmithCamera(dt);cam.transform.position=cameraHome+(reduced?Vector3.zero:new Vector3(Mathf.Sin(elapsed*83),Mathf.Cos(elapsed*97),0)*shake);ringAge+=dt;ring.localScale=Vector3.one*(.2f+ringAge*3);var rc=ringMat.GetColor("_Color");rc.a=Mathf.Max(0,.55f-ringAge*.9f);ringMat.SetColor("_Color",rc);scaleAge+=dt;scalePan.localPosition=spots["sell"]+Vector3.up*(.12f-Mathf.Sin(Mathf.Clamp01(scaleAge/.8f)*Mathf.PI)*.035f);
 }
 static GameObject MeshObject(string name,Mesh mesh,Material mat){var go=new GameObject(name);go.AddComponent<MeshFilter>().sharedMesh=mesh;go.AddComponent<MeshRenderer>().sharedMaterial=mat;return go;}
 static Mesh RoundedBox(){var verts=new List<Vector3>();var tris=new List<int>();var uv=new List<Vector2>();var normals=new List<Vector3>();int steps=3;foreach(var normal in new[]{Vector3.right,Vector3.left,Vector3.up,Vector3.down,Vector3.forward,Vector3.back}){var u=normal.y!=0?Vector3.right:Vector3.up;var v=Vector3.Cross(normal,u);int start=verts.Count;for(int y=0;y<=steps;y++)for(int x=0;x<=steps;x++){var p=normal*.5f+u*(x/(float)steps-.5f)+v*(y/(float)steps-.5f);var inner=new Vector3(Mathf.Clamp(p.x,-.455f,.455f),Mathf.Clamp(p.y,-.455f,.455f),Mathf.Clamp(p.z,-.455f,.455f));var n=(p-inner).normalized;verts.Add(inner+n*.045f);normals.Add(n);uv.Add(new Vector2(x/(float)steps,y/(float)steps));}for(int y=0;y<steps;y++)for(int x=0;x<steps;x++){int a=start+y*(steps+1)+x;tris.AddRange(new[]{a,a+1,a+steps+2,a,a+steps+2,a+steps+1});}}var mesh=new Mesh{name="Beveled box"};mesh.SetVertices(verts);mesh.SetNormals(normals);mesh.SetUVs(0,uv);mesh.SetTriangles(tris,0);mesh.RecalculateBounds();mesh.RecalculateTangents();return mesh;}
 static List<int> Triangulate(Vector2[] p){var remaining=new List<int>();float area=0;for(int i=0;i<p.Length;i++)area+=p[i].x*p[(i+1)%p.Length].y-p[(i+1)%p.Length].x*p[i].y;if(area>0)for(int i=0;i<p.Length;i++)remaining.Add(i);else for(int i=p.Length-1;i>=0;i--)remaining.Add(i);var result=new List<int>();int safe=0;while(remaining.Count>2&&safe++<p.Length*p.Length){bool cut=false;for(int i=0;i<remaining.Count;i++){int a=remaining[(i+remaining.Count-1)%remaining.Count],b=remaining[i],c=remaining[(i+1)%remaining.Count];if(Cross(p[b]-p[a],p[c]-p[b])<=.000001f)continue;bool contains=false;foreach(int j in remaining){if(j==a||j==b||j==c)continue;if(Cross(p[b]-p[a],p[j]-p[a])>=0&&Cross(p[c]-p[b],p[j]-p[b])>=0&&Cross(p[a]-p[c],p[j]-p[c])>=0){contains=true;break;}}if(contains)continue;result.AddRange(new[]{a,b,c});remaining.RemoveAt(i);cut=true;break;}if(!cut)break;}return result;}
 static float Cross(Vector2 a,Vector2 b){return a.x*b.y-a.y*b.x;}
 static Mesh Extrude(Vector2[] profile,float depth){int n=profile.Length;var vertices=new List<Vector3>();var tris=new List<int>();var uv=new List<Vector2>();for(int side=0;side<2;side++)foreach(var p in profile){vertices.Add(new Vector3(p.x,p.y,(side==0?-.5f:.5f)*depth));uv.Add(p);}var flat=Triangulate(profile);for(int i=0;i<flat.Count;i+=3){tris.AddRange(new[]{flat[i+2],flat[i+1],flat[i],flat[i]+n,flat[i+1]+n,flat[i+2]+n});}for(int i=0;i<n;i++){int j=(i+1)%n;tris.AddRange(new[]{i,j,j+n,i,j+n,i+n});}var mesh=new Mesh();mesh.SetVertices(vertices);mesh.SetTriangles(tris,0);mesh.SetUVs(0,uv);mesh.RecalculateNormals();mesh.RecalculateBounds();return Flat(mesh);}
 static Mesh Flat(Mesh source){var input=source.vertices;var old=source.triangles;var vertices=new Vector3[old.Length];var triangles=new int[old.Length];for(int i=0;i<old.Length;i++){vertices[i]=input[old[i]];triangles[i]=i;}source.Clear();source.vertices=vertices;source.triangles=triangles;source.RecalculateNormals();source.RecalculateBounds();return source;}
 static Mesh BladeMesh(Vector2[] p,float depth){if(p==null||p.Length<3)p=new[]{new Vector2(0,-.15f),new Vector2(1.6f,-.13f),new Vector2(2,0),new Vector2(1.4f,.2f),new Vector2(0,.22f)};int n=p.Length;var center=Vector2.zero;foreach(var v in p)center+=v;center/=n;var vertices=new List<Vector3>();var triangles=new List<int>();foreach(var v in p){var inside=Vector2.Lerp(v,center,.065f);vertices.Add(new Vector3(inside.x,depth/2,inside.y));}foreach(var v in p){var inside=Vector2.Lerp(v,center,.065f);vertices.Add(new Vector3(inside.x,-depth/2,inside.y));}foreach(var v in p)vertices.Add(new Vector3(v.x,0,v.y));var flat=Triangulate(p);for(int i=0;i<flat.Count;i+=3){triangles.AddRange(new[]{flat[i+2],flat[i+1],flat[i],flat[i]+n,flat[i+1]+n,flat[i+2]+n});}for(int i=0;i<n;i++){int j=(i+1)%n;triangles.AddRange(new[]{i,j+2*n,i+2*n,i,j,j+2*n,i+n,i+2*n,j+2*n,i+n,j+2*n,j+n});}var mesh=new Mesh{name="Procedural beveled blade"};mesh.SetVertices(vertices);mesh.SetTriangles(triangles,0);return Flat(mesh);}

 static Mesh RingMesh(){var v=new List<Vector3>();var t=new List<int>();for(int i=0;i<=64;i++){float a=i*Mathf.PI*2/64;v.Add(new Vector3(Mathf.Cos(a),0,Mathf.Sin(a))*.94f);v.Add(new Vector3(Mathf.Cos(a),0,Mathf.Sin(a)));if(i<64){int n=i*2;t.AddRange(new[]{n,n+2,n+1,n+1,n+2,n+3});}}var m=new Mesh();m.SetVertices(v);m.SetTriangles(t,0);m.RecalculateNormals();return m;}
 void OnDestroy(){foreach(var b in bodies.Values)if(b.metal)Destroy(b.metal);if(environment)Destroy(environment);}
}
