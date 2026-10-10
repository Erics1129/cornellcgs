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
 class Fragment {public GameObject root;public Renderer renderer;public Vector3 velocity,spin;public float life,maxLife,size;public bool coin;}
 readonly Dictionary<int,Body> bodies=new Dictionary<int,Body>();
 readonly Dictionary<string,Vector3> spots=new Dictionary<string,Vector3>{{"crate",new Vector3(-3.7f,1.14f,-.4f)},{"furnace",new Vector3(-3.8f,1.65f,2.9f)},{"anvil",new Vector3(0,1.47f,-.8f)},{"rack",new Vector3(3.7f,1.42f,2.7f)},{"sell",new Vector3(3.8f,1.08f,-.5f)},{"shop",new Vector3(1.8f,1.55f,4.1f)},{"lantern",new Vector3(-1.85f,1.58f,1.1f)}};
 readonly List<Fragment> fragments=new List<Fragment>();
 readonly Stack<Fragment> fragmentPool=new Stack<Fragment>();
 Camera cam;Transform hammer,scalePan,fire,ring;Light furnaceLight,flash;Material fireMat,ringMat,wood,stone,iron,brass,leather,coal;ForgeSnapshot state;
 Vector3 cameraHome,dragTarget;Plane carryPlane=new Plane(Vector3.up,new Vector3(0,1.85f,0));int dragging=-1;Vector2 pointerDown;bool dragMoved,swinging,reduced;float swingTime,freeze,shake,ringAge=10,scaleAge=10,elapsed,qualityTime;int oldWidth,oldHeight,frameCount;float frameTotal; Mesh boxMesh; Cubemap environment; Material particleGold,particleIron,particleAsh,particleHot;

 void Start(){
  Application.targetFrameRate=60;
#if UNITY_WEBGL && !UNITY_EDITOR
  WebGLInput.captureAllKeyboardInput=false;
#endif
  boxMesh=RoundedBox();
  MakeMaterials();MakeRoom();MakeBench();MakeFurnace();MakeAnvil();MakeCrate();MakeRack();MakeScale();MakeStall();MakeLantern();MakeHammer();MakeLighting();BatchRoom();
  var cameraObject=new GameObject("Workshop camera");cam=cameraObject.AddComponent<Camera>();cam.nearClipPlane=.1f;cam.farClipPlane=65;cam.clearFlags=CameraClearFlags.SolidColor;cam.backgroundColor=C("111b19");cam.allowHDR=false;
  CreateSmith();Resize();Send("ready");
 }
 static Color C(string hex){ColorUtility.TryParseHtmlString(hex.StartsWith("#")?hex:"#"+hex,out var c);return c;}
 Material Mat(string name,string color,float metal=0,float smooth=.3f){var m=new Material(Shader.Find("Standard")){name=name,color=C(color)};m.SetFloat("_Metallic",metal);m.SetFloat("_Glossiness",smooth);return m;}
 void MakeMaterials(){
  wood=Mat("Smoked oak","88735a",0,.22f);wood.mainTexture=Resources.Load<Texture2D>("Forge/Wood");
  stone=Mat("Soot blackened masonry","777d79",0,.12f);stone.mainTexture=Resources.Load<Texture2D>("Forge/Stone");
  iron=Mat("Forged iron","505c61",.87f,.46f);brass=Mat("Aged brass","b59957",.8f,.57f);leather=Mat("Wrapped leather","352b25",0,.29f);coal=Mat("Coal","191c1a",.1f,.1f);
  particleGold=Mat("Golden impact","fbc987",.75f,.7f);particleIron=Mat("Metal shards","9ba5ac",.9f,.6f);particleAsh=Mat("Dust","878778",0,.1f);particleHot=Mat("White orange embers","ffc680",.45f,.6f);
  foreach(var m in new[]{particleGold,particleHot}){m.EnableKeyword("_EMISSION");m.SetColor("_EmissionColor",m.color*2);}
 }
 GameObject Box(string name,Vector3 p,Vector3 s,Material m,Transform parent=null){var go=new GameObject(name);go.transform.SetParent(parent,false);go.transform.localPosition=p;go.transform.localScale=s;go.AddComponent<MeshFilter>().sharedMesh=boxMesh;go.AddComponent<MeshRenderer>().sharedMaterial=m;return go;}
 GameObject Primitive(string name,PrimitiveType type,Vector3 p,Vector3 s,Material m,Transform parent=null){var go=GameObject.CreatePrimitive(type);Destroy(go.GetComponent<Collider>());go.name=name;go.transform.SetParent(parent,false);go.transform.localPosition=p;go.transform.localScale=s;go.GetComponent<Renderer>().sharedMaterial=m;return go;}
 Transform Group(string name,Vector3 p){var g=new GameObject(name);g.transform.position=p;return g.transform;}
 void MakeRoom(){
  Box("Stone floor",new Vector3(0,-.13f,2),new Vector3(24,.2f,22),stone);
  Box("Rear masonry",new Vector3(0,3.5f,7.2f),new Vector3(22,9,.6f),stone);
  Box("Left wall",new Vector3(-9,3.5f,1),new Vector3(.6f,9,13),stone);Box("Right wall",new Vector3(9,3.5f,1),new Vector3(.6f,9,13),stone);
  for(int i=-2;i<=2;i++){Box("Oak roof beam",new Vector3(i*4,6.5f,1),new Vector3(.34f,.48f,15),wood);Box("Rear timber",new Vector3(i*4,3,6.82f),new Vector3(.26f,7,.3f),wood);}
  Box("Cross beam",new Vector3(0,5.3f,6.78f),new Vector3(19,.38f,.42f),wood);
  var window=Mat("Cold daylight","9fbbc5");window.EnableKeyword("_EMISSION");window.SetColor("_EmissionColor",C("809da9")*1.4f);
  Box("Window light",new Vector3(-6,3.25f,6.84f),new Vector3(2.8f,3,.06f),window);
  for(int i=-1;i<=1;i++)Box("Window mullion",new Vector3(-6+i*.91f,3.25f,6.73f),new Vector3(.085f,3.1f,.12f),iron);
  for(int i=-1;i<=1;i++)Box("Window mullion",new Vector3(-6,3.25f+i,6.71f),new Vector3(2.95f,.09f,.15f),iron);
  Box("Window sill",new Vector3(-6,1.68f,6.55f),new Vector3(3.2f,.23f,.65f),stone);
  for(int shelf=0;shelf<2;shelf++) {Box("Rear shelf",new Vector3(3.1f,2.4f+shelf*1.4f,6.3f),new Vector3(4,.18f,1.1f),wood);for(int i=0;i<7;i++)Box("Stored ingot",new Vector3(1.7f+i*.42f,2.65f+shelf*1.4f,6.28f),new Vector3(.3f,.27f,.53f),i%3==0?brass:iron);}
  Box("Tool rail",new Vector3(.3f,3.55f,6.63f),new Vector3(4,.16f,.2f),wood);
  for(int i=0;i<6;i++){var tool=Group("Hanging tools",new Vector3(-1.2f+i*.57f,2.9f,6.4f));Box("Handle",Vector3.zero,new Vector3(.075f,.7f,.075f),wood,tool);Box("Forged head",new Vector3(0,.32f,0),new Vector3(.31f,.18f,.13f),iron,tool);tool.localRotation=Quaternion.Euler(0,0,(i%2==0?1:-1)*8);}
  for(int i=0;i<5;i++)Box("Stacked fuel",new Vector3(-6.2f+(i%2)*.65f,-.68f+(i/2)*.28f,3.2f),new Vector3(.65f,.28f,1.7f),wood);
 }
 void MakeBench(){
  for(int i=0;i<8;i++)Box("Solid oak workbench",new Vector3(0,.9f,-.6f+i*.51f),new Vector3(10.8f,.28f,.5f),wood);
  for(int x=-1;x<=1;x+=2)for(int z=-1;z<=1;z+=2){Box("Bench leg",new Vector3(x*4.5f,-.08f,1.1f+z*1.65f),new Vector3(.3f,1.9f,.3f),wood);Box("Iron leg collar",new Vector3(x*4.5f,.45f,1.1f+z*1.65f),new Vector3(.34f,.2f,.34f),iron);}
  Box("Front apron",new Vector3(0,.55f,-.85f),new Vector3(10.6f,.45f,.12f),wood);Box("Bench lower brace",new Vector3(0,-.55f,-.65f),new Vector3(9.2f,.21f,.16f),wood);
  for(int i=-4;i<=4;i++)Primitive("Rivet",PrimitiveType.Sphere,new Vector3(i,.58f,-.92f),new Vector3(.05f,.05f,.025f),iron);
  // Hand-worked scratches catch a different reflection along the working surface.
  for(int i=0;i<12;i++){var scratch=Box("Bench scar",new Vector3(-1.1f+(i%4)*.43f,1.047f,.7f+(i/4)*.09f),new Vector3(.4f,.001f,.006f),leather);scratch.transform.Rotate(0,i*17,0);}
 }
 void MakeFurnace(){
  var p=spots["furnace"];Box("Furnace base",new Vector3(p.x,1.17f,3.05f),new Vector3(2.65f,.37f,2.1f),stone);
  Box("Furnace back",new Vector3(p.x,2.02f,3.85f),new Vector3(2.6f,1.7f,.35f),stone);
  for(int side=-1;side<=1;side+=2)Box("Firebrick pillar",new Vector3(p.x+side*1.1f,2.05f,3),new Vector3(.42f,1.7f,1.9f),stone);
  Box("Lintel",new Vector3(p.x,2.87f,3.05f),new Vector3(2.6f,.5f,2.05f),stone);
  Box("Chimney",new Vector3(p.x,4.35f,3.5f),new Vector3(1.5f,2.65f,1.05f),stone);
  var ember=Mat("Ember bed","7b2917",.1f,.3f);ember.EnableKeyword("_EMISSION");ember.SetColor("_EmissionColor",C("ff571e")*1.6f);
  for(int i=0;i<32;i++){float x=(i%8)*.23f- .82f,z=(i/8)*.3f;Primitive("Live coal",PrimitiveType.Sphere,new Vector3(p.x+x,1.43f+(i%3)*.025f,2.65f+z),new Vector3(.22f,.13f,.2f),i%3==0?coal:ember);}
  var flame=GameObject.CreatePrimitive(PrimitiveType.Quad);Destroy(flame.GetComponent<Collider>());flame.name="Animated generated fire";fire=flame.transform;fire.position=new Vector3(p.x,2.08f,2.57f);fire.localScale=new Vector3(1.9f,1.6f,1);
  fireMat=new Material(Shader.Find("Forge/Fire"));fireMat.mainTexture=Resources.Load<Texture2D>("Forge/Fire");flame.GetComponent<Renderer>().sharedMaterial=fireMat;
  for(int i=0;i<3;i++)Box("Forging tongs",new Vector3(p.x-1.5f+i*.16f,1.11f,1.6f),new Vector3(.055f,.04f,1.3f),iron);
 }
 void MakeAnvil(){
  // A full extruded silhouette gives the horn and heel a continuous forged shape.
  var stand=Primitive("Oak anvil block",PrimitiveType.Cylinder,new Vector3(0,.08f,-.7f),new Vector3(1.65f,1.01f,1.5f),wood);stand.transform.Rotate(0,12,0);
  for(float y=-.55f;y<.8f;y+=1.1f)Primitive("Anvil stump band",PrimitiveType.Cylinder,new Vector3(0,y,-.7f),new Vector3(1.68f,.055f,1.53f),iron);
  var shape=new[]{new Vector2(-1.25f,0),new Vector2(1.04f,0),new Vector2(1.05f,.18f),new Vector2(.63f,.3f),new Vector2(.52f,.55f),new Vector2(.94f,.72f),new Vector2(1.1f,.8f),new Vector2(1.62f,.85f),new Vector2(1.22f,1.05f),new Vector2(-1.35f,1.05f),new Vector2(-1.35f,.79f),new Vector2(-.63f,.69f),new Vector2(-.46f,.48f),new Vector2(-.55f,.27f),new Vector2(-1.23f,.2f)};
  var anvil=MeshObject("Forged anvil",Extrude(shape,.7f),iron);anvil.transform.position=new Vector3(0,.44f,-.8f);
  var face=Mat("Polished anvil face","68767c",.95f,.79f);Box("Working face",new Vector3(-.1f,1.493f,-.8f),new Vector3(2.45f,.065f,.72f),face);
  Box("Hardy hole",new Vector3(-1.12f,1.53f,-.15f),new Vector3(.15f,.005f,.16f),coal);
  for(int i=0;i<7;i++){var mark=Box("Strike marks",new Vector3(-.75f+i*.22f,1.528f,-.1f+(i%3)*.06f),new Vector3(.12f,.003f,.008f),iron);mark.transform.Rotate(0,i*19,0);}
 }
 void MakeCrate(){var p=spots["crate"];Box("Blank crate floor",new Vector3(p.x,1.08f,p.z),new Vector3(1.9f,.1f,1.2f),wood);for(int side=-1;side<=1;side+=2){Box("Blank crate edge",new Vector3(p.x+side*.95f,1.27f,p.z),new Vector3(.1f,.38f,1.28f),wood);Box("Blank crate edge",new Vector3(p.x,1.27f,p.z+side*.6f),new Vector3(2,.38f,.09f),wood);} }
 void MakeRack(){var p=spots["rack"];Box("Rack back",new Vector3(p.x,1.42f,p.z+.23f),new Vector3(2.45f,.65f,.16f),wood);Box("Rack base",new Vector3(p.x,1.1f,p.z),new Vector3(2.5f,.14f,.85f),wood);for(int i=0;i<5;i++)Box("Blade divider",new Vector3(p.x-1.12f+i*.56f,1.37f,p.z-.07f),new Vector3(.07f,.48f,.58f),leather);}
 void MakeScale(){var p=spots["sell"];Box("Counter plinth",new Vector3(p.x,1.08f,p.z),new Vector3(1.8f,.12f,1.1f),wood);Primitive("Scale base",PrimitiveType.Cylinder,new Vector3(p.x,1.19f,p.z),new Vector3(1,.08f,.85f),brass);Box("Scale stem",new Vector3(p.x,1.5f,p.z+.13f),new Vector3(.08f,.6f,.08f),brass);scalePan=Group("Balance pan",new Vector3(p.x,1.57f,p.z));Primitive("Scale dish",PrimitiveType.Cylinder,Vector3.zero,new Vector3(1.45f,.035f,.85f),brass,scalePan);}
 void MakeStall(){var p=spots["shop"];Box("Shop display",new Vector3(p.x,1.3f,p.z),new Vector3(2.3f,.42f,1.1f),wood);for(int i=0;i<6;i++)Box("Shop ingots",new Vector3(p.x-.85f+(i%3)*.53f,1.58f+(i/3)*.2f,p.z),new Vector3(.46f,.18f,.6f),i%2==0?brass:iron);Box("Stall sign",new Vector3(p.x,2.18f,p.z+.33f),new Vector3(2,.5f,.07f),wood);}
 void MakeLantern(){var p=spots["lantern"];Box("Lantern foot",p,new Vector3(.45f,.07f,.45f),brass);var glow=Mat("Lantern glow","cbaa63");glow.EnableKeyword("_EMISSION");glow.SetColor("_EmissionColor",C("ffc56b")*1.3f);Box("Warm lantern",p+Vector3.up*.25f,new Vector3(.28f,.44f,.28f),glow);for(int x=-1;x<=1;x+=2)for(int z=-1;z<=1;z+=2)Box("Lantern cage",p+new Vector3(x*.18f,.25f,z*.18f),new Vector3(.035f,.5f,.035f),iron);Box("Lantern roof",p+Vector3.up*.54f,new Vector3(.5f,.09f,.5f),brass);}
 void MakeHammer(){hammer=Group("Hammer",new Vector3(1.48f,1.11f,-.8f));Box("Hickory handle",new Vector3(0,.48f,0),new Vector3(.11f,1.03f,.12f),wood,hammer);Box("Steel hammer head",new Vector3(0,1.03f,0),new Vector3(.64f,.29f,.32f),iron,hammer);Box("Polished hammer face",new Vector3(-.33f,1.03f,0),new Vector3(.055f,.3f,.33f),brass,hammer);hammer.rotation=Quaternion.Euler(0,0,-58);}
 void MakeLighting(){
  RenderSettings.ambientMode=AmbientMode.Trilight;RenderSettings.ambientSkyColor=C("738e98")*.62f;RenderSettings.ambientEquatorColor=C("666e64")*.45f;RenderSettings.ambientGroundColor=C("211b15");RenderSettings.fog=true;RenderSettings.fogMode=FogMode.ExponentialSquared;RenderSettings.fogDensity=.024f;RenderSettings.fogColor=C("1e2827");
  var sun=new GameObject("Window key").AddComponent<Light>();sun.type=LightType.Directional;sun.color=C("d4e9f2");sun.intensity=1.55f;sun.transform.rotation=Quaternion.Euler(43,-38,0);sun.shadows=LightShadows.Soft;sun.shadowStrength=.7f;sun.shadowBias=.04f;
  var fill=new GameObject("Warm ceiling bounce").AddComponent<Light>();fill.type=LightType.Directional;fill.color=C("ecc797");fill.intensity=.42f;fill.transform.rotation=Quaternion.Euler(55,145,0);
  furnaceLight=new GameObject("Furnace light").AddComponent<Light>();furnaceLight.type=LightType.Point;furnaceLight.color=C("ff9a47");furnaceLight.intensity=3.2f;furnaceLight.range=9;furnaceLight.transform.position=new Vector3(-3.8f,2.1f,2.1f);furnaceLight.renderMode=LightRenderMode.ForcePixel;
  flash=new GameObject("Hammer contact flash").AddComponent<Light>();flash.type=LightType.Point;flash.color=C("ffe7ae");flash.range=5;flash.intensity=0;flash.transform.position=new Vector3(0,1.9f,-.2f);
  // A lightweight code-made studio environment keeps metal reflections readable on WebGL.
  environment=new Cubemap(64,TextureFormat.RGBA32,true);for(int f=0;f<6;f++){var pixels=new Color[4096];for(int y=0;y<64;y++)for(int x=0;x<64;x++){float strip=Mathf.Pow(Mathf.Max(0,Mathf.Cos((x-22)*.09f)),18);Color baseColor=Color.Lerp(C("172221"),C("a7b7b9"),y/63f*.52f);if(f==0||f==4)baseColor+=C("dce7e5")*strip*.9f;if(f==1)baseColor+=C("c38849")*strip*.65f;pixels[y*64+x]=baseColor;}environment.SetPixels(pixels,(CubemapFace)f);}environment.Apply();RenderSettings.defaultReflectionMode=DefaultReflectionMode.Custom;RenderSettings.customReflection=environment;RenderSettings.reflectionIntensity=.9f;
  var ringObj=new GameObject("Impact ring");ring=ringObj.transform;ring.gameObject.AddComponent<MeshFilter>().sharedMesh=RingMesh();ringMat=new Material(Shader.Find("Forge/Glow"));ringMat.SetColor("_Color",new Color(1,.65f,.2f,0));ringObj.AddComponent<MeshRenderer>().sharedMaterial=ringMat;ring.position=new Vector3(0,1.55f,-.8f);
 }
 void Resize(){oldWidth=Screen.width;oldHeight=Screen.height;bool phone=Screen.width<700||Screen.width/(float)Mathf.Max(1,Screen.height)<.85f;cam.fieldOfView=phone?58:45;cameraHome=phone?new Vector3(0,6.8f,-13.5f):new Vector3(0,4.7f,-10.9f);cam.transform.position=cameraHome;cam.transform.LookAt(new Vector3(0,1.6f,1.35f));QualitySettings.shadows=phone?ShadowQuality.Disable:ShadowQuality.All;SendLabels();}
 void Send(string type,int id=0,string spot="",float x=0,float y=0){var json=JsonUtility.ToJson(new ForgeMessage{type=type,id=id,spot=spot,x=x,y=y});
#if UNITY_WEBGL && !UNITY_EDITOR
  ForgeSend(json);
#else
  Debug.Log("FORGE_EVENT "+json);
#endif
 }
 void SendLabels(){foreach(var spot in spots){var p=cam.WorldToViewportPoint(spot.Value);Send("label",0,spot.Key,p.x*100,(1-p.y)*100);}}
 public void Sync(string json){var next=JsonUtility.FromJson<ForgeSnapshot>(json);if(next==null||next.knives==null)return;state=next;reduced=next.reduced;var ids=new HashSet<int>();foreach(var k in next.knives)ids.Add(k.id);var removed=new List<int>();foreach(var pair in bodies)if(!ids.Contains(pair.Key))removed.Add(pair.Key);foreach(var id in removed){DisposeBody(bodies[id]);bodies.Remove(id);}
  int crateIndex=0,rackIndex=0;foreach(var k in next.knives){var sig=k.metal+":"+k.family+":"+Mathf.Min(5,k.level/3);Body b;if(!bodies.TryGetValue(k.id,out b)||b.signature!=sig){var old=b;var pos=old!=null?old.root.transform.position:spots.ContainsKey(k.place)?spots[k.place]:Vector3.zero;float heat=old!=null?old.heat:0;if(old!=null)DisposeBody(old);b=MakeKnife(k);b.signature=sig;b.root.transform.position=pos;b.heat=heat;bodies[k.id]=b;}b.knife=k;b.target=spots[k.place];if(k.place=="crate"){b.target+=new Vector3(-.36f,.22f+(crateIndex/3)*.09f,-.34f+(crateIndex%3)*.3f);crateIndex++;}if(k.place=="rack"){b.target+=new Vector3(-.78f+rackIndex*.52f,.16f,-.15f);rackIndex++;}if(k.place=="anvil")b.target=new Vector3(-.57f,1.56f,-.8f);if(k.place=="furnace")b.target+=new Vector3(-.42f,-.1f,-.05f);
   if(next.effect!=null&&next.effect.kind=="heat"&&next.effect.id==k.id)b.heat=1;
  }
  if(next.effect!=null){var e=next.effect;if(e.kind=="hit")Impact(e);if(e.kind=="flow"){ringAge=0;ringMat.SetColor("_Color",new Color(.3f,.95f,.9f,.55f));}if(e.kind=="sell"){Burst(spots["sell"]+Vector3.up*.5f,25,"coin");scaleAge=0;}if(e.evolution&&bodies.TryGetValue(e.id,out var evolved)){evolved.evolution=1.5f;ringAge=0;Burst(evolved.target,65,"perfect");}}
 }
 void DisposeBody(Body b){if(b.blade!=null)Destroy(b.blade.GetComponent<MeshFilter>().sharedMesh);if(b.metal!=null)Destroy(b.metal);Destroy(b.root);}
 Body MakeKnife(ForgeKnife k){int stage=Mathf.Min(5,k.level/3);var root=new GameObject("Knife "+k.id);var profile=k.profile;var metal=new Material(Shader.Find("Forge/Blade")){name=k.metal+" blade",color=C(string.IsNullOrEmpty(k.color)?"b7c5ca":k.color)};metal.SetFloat("_Metallic",k.metal=="obsidian"?.25f:.94f);metal.SetFloat("_Glossiness",1-Mathf.Clamp(k.rough,.05f,.85f));metal.SetFloat("_Kind",Array.IndexOf(new[]{"iron","bronze","steel","silver","damascus","obsidian","meteor","auricite"},k.metal));metal.SetFloat("_Stage",stage);metal.SetColor("_GlowColor",C(k.glow));
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
 public void Strike(string unused){if(swinging)return;swinging=true;swingTime=0;}
 public void Pointer(string json){PlayerPointer(JsonUtility.FromJson<ForgePointer>(json));}
 void OldPointer(string json){if(cam==null||state==null||state.ended||swinging)return;var p=JsonUtility.FromJson<ForgePointer>(json);var ray=cam.ViewportPointToRay(new Vector3(p.x,1-p.y));if(p.phase=="down"){Send("gesture");if(Physics.Raycast(ray,out var hit,50)){var tag=hit.collider.GetComponent<ForgeKnifeTag>();if(tag!=null){dragging=tag.id;pointerDown=new Vector2(p.x,p.y);dragMoved=false;dragTarget=bodies[dragging].root.transform.position;Send("select",dragging);return;}}if(carryPlane.Raycast(ray,out var t)){var near=Nearest(ray.GetPoint(t));if(near=="shop"||near=="lantern")Send("spot",0,near);}}
  else if(p.phase=="move"&&dragging>=0){if(Vector2.Distance(pointerDown,new Vector2(p.x,p.y))>.009f)dragMoved=true;if(carryPlane.Raycast(ray,out var t)){dragTarget=ray.GetPoint(t);var spot=Nearest(dragTarget);if(spot!=""){var target=spots[spot];target.y=dragTarget.y;if(Vector3.Distance(target,dragTarget)<.85f)dragTarget=Vector3.Lerp(dragTarget,target,.35f);}Send("hover",dragging,spot);}}
  else if((p.phase=="up"||p.phase=="cancel")&&dragging>=0){int id=dragging;dragging=-1;Send("hover");if(p.phase=="cancel")return;if(dragMoved){if(carryPlane.Raycast(ray,out var t)){var spot=Nearest(ray.GetPoint(t));if(spot!="")Send("drop",id,spot);}}else if(bodies.TryGetValue(id,out var body)&&body.knife.place=="anvil")Send("hit",id);}
 }
 string Nearest(Vector3 at){string best="";float distance=1.45f;foreach(var s in spots){float d=Vector2.Distance(new Vector2(at.x,at.z),new Vector2(s.Value.x,s.Value.z));if(d<distance){distance=d;best=s.Key;}}return best;}
 void Impact(ForgeEvent e){if(!reduced){freeze=.06f;shake=e.outcome=="shatter"?.065f:.026f;flash.intensity=e.outcome=="perfect"?4:2;}
  Burst(new Vector3(0,1.6f,-.8f),e.outcome=="shatter"?45:e.outcome=="perfect"?65:e.outcome=="dull"?10:27,e.outcome);
  if(e.outcome=="good"||e.outcome=="perfect"){ringAge=0;ringMat.SetColor("_Color",new Color(1,.72f,.35f,.6f));}if(bodies.TryGetValue(e.id,out var b))b.velocity+=Vector3.up*(e.outcome=="chip"?1.5f:.6f);
 }
 void BatchRoom(){var objects=new List<GameObject>();foreach(var renderer in FindObjectsByType<MeshRenderer>(FindObjectsSortMode.None)){var t=renderer.transform;if(t.IsChildOf(hammer)||t.IsChildOf(scalePan)||t==fire||t==ring)continue;objects.Add(renderer.gameObject);}StaticBatchingUtility.Combine(objects.ToArray(),gameObject);}
 void Burst(Vector3 at,int count,string type){for(int i=0;i<count&&fragments.Count<160;i++){bool shard=type=="shatter"||type=="chip",coin=type=="coin";float size=shard?UnityEngine.Random.Range(.045f,.14f):coin?.055f:UnityEngine.Random.Range(.016f,.032f);Fragment p;if(fragmentPool.Count>0){p=fragmentPool.Pop();p.root.SetActive(true);}else{var go=Box("Pooled impact fragment",Vector3.zero,Vector3.one,particleHot);p=new Fragment{root=go,renderer=go.GetComponent<Renderer>()};}p.root.transform.position=at;p.root.transform.rotation=UnityEngine.Random.rotation;p.root.transform.localScale=new Vector3(size,coin?size*.14f:shard?size*.2f:size*2.5f,size);p.renderer.sharedMaterial=type=="dull"?particleAsh:shard?particleIron:coin||type=="perfect"?particleGold:particleHot;var vel=UnityEngine.Random.onUnitSphere*UnityEngine.Random.Range(1,3.7f);vel.y=Mathf.Abs(vel.y)+1.1f;p.velocity=vel;p.spin=UnityEngine.Random.insideUnitSphere*430;p.life=UnityEngine.Random.Range(.65f,1.5f);p.maxLife=p.life;p.size=size;p.coin=coin;fragments.Add(p);}}

 void Update(){
  if(cam==null)return;if(Screen.width!=oldWidth||Screen.height!=oldHeight)Resize();float raw=Time.unscaledDeltaTime;frameTotal+=raw;frameCount++;qualityTime+=raw;if(qualityTime>5){float average=frameTotal/Mathf.Max(1,frameCount);Send("stats",fragments.Count,"fps",1/Mathf.Max(.001f,average),bodies.Count);if(average>.028f){QualitySettings.shadows=ShadowQuality.Disable;Send("quality",0,"low");}frameTotal=0;frameCount=0;qualityTime=0;}
  float dt=Mathf.Min(raw,.04f);if(freeze>0){freeze-=raw;return;}elapsed+=dt;UpdateSmith(dt,raw);
  if(swinging){float before=swingTime;swingTime+=raw;float t=swingTime;hammer.position=new Vector3(.6f,1.52f,-.8f);float angle=t<.22f?Mathf.Lerp(-28,-65,t/.22f):t<.32f?Mathf.Lerp(-65,89,(t-.8f)/.1f):t<.46f?Mathf.Lerp(89,53,(t-.32f)/.14f):Mathf.Lerp(53,-58,(t-.46f)/.3f);hammer.rotation=Quaternion.Euler(0,0,angle);if(before<.32f&&t>=.32f)Send("impact");if(t>.78f){swinging=false;hammer.position=new Vector3(1.48f,1.11f,-.8f);hammer.rotation=Quaternion.Euler(0,0,-58);Send("settled");}}
  foreach(var pair in bodies){var b=pair.Value;bool drag=dragging==pair.Key&&dragMoved;var target=carriedId==pair.Key?CarryPoint():drag?dragTarget:b.target;b.velocity+=(target-b.root.transform.position)*dt*105;b.velocity*=Mathf.Exp(-dt*13);b.root.transform.position+=b.velocity*dt;float size=b.knife.place=="anvil"?.85f:.57f;b.root.transform.localScale=Vector3.Lerp(b.root.transform.localScale,Vector3.one*(drag?size*1.16f:size),1-Mathf.Exp(-dt*10));float yaw=carriedId==pair.Key?smith.eulerAngles.y+90:b.knife.place=="rack"?90:0;b.root.transform.rotation=Quaternion.Slerp(b.root.transform.rotation,Quaternion.Euler(drag?b.velocity.z*3:0,yaw,drag?-b.velocity.x*3:0),1-Mathf.Exp(-dt*12));b.heat=Mathf.Max(0,b.heat-dt*.04f);b.evolution=Mathf.Max(0,b.evolution-dt);float lift=b.evolution>0?Mathf.Sin(b.evolution/1.5f*Mathf.PI):0;b.root.transform.position+=Vector3.up*lift*dt*2.4f;b.metal.SetFloat("_Heat",b.heat);b.metal.SetColor("_EmissionColor",Color.white*lift*2+(b.knife.flow>0?new Color(.08f,.25f,.3f):Color.black));if(b.knife.level>=15&&UnityEngine.Random.value<dt*6)Burst(b.root.transform.position+Vector3.right*.7f,1,"perfect");}
  for(int i=fragments.Count-1;i>=0;i--){var p=fragments[i];p.life-=dt;if(p.life<=0){p.root.SetActive(false);fragmentPool.Push(p);fragments.RemoveAt(i);continue;}if(p.coin&&p.life<.55f)p.velocity=Vector3.Lerp(p.velocity,new Vector3(0,6,-4),dt*7);else p.velocity.y-=dt*8;p.root.transform.position+=p.velocity*dt;var pos=p.root.transform.position;if(pos.y<1.06f){pos.y=1.06f;p.root.transform.position=pos;p.velocity.y=Mathf.Abs(p.velocity.y)*.3f;p.velocity.x*=.76f;p.velocity.z*=.76f;}p.root.transform.Rotate(p.spin*dt);if(p.life<.3f)p.root.transform.localScale*=Mathf.Exp(-dt*7);}
  float flicker=reduced?1:1+Mathf.Sin(elapsed*12)*.08f+Mathf.Sin(elapsed*21)*.06f;furnaceLight.intensity=3.2f*flicker;fireMat.SetFloat("_Frame",reduced?0:Mathf.Floor(elapsed*14)%16);flash.intensity*=Mathf.Exp(-dt*12);shake*=Mathf.Exp(-dt*12);UpdateSmithCamera(dt);cam.transform.position=cameraHome+(reduced?Vector3.zero:new Vector3(Mathf.Sin(elapsed*83),Mathf.Cos(elapsed*97),0)*shake);ringAge+=dt;ring.localScale=Vector3.one*(.2f+ringAge*3);var rc=ringMat.GetColor("_Color");rc.a=Mathf.Max(0,.55f-ringAge*.9f);ringMat.SetColor("_Color",rc);scaleAge+=dt;scalePan.localPosition=new Vector3(3.8f,1.57f-Mathf.Sin(Mathf.Clamp01(scaleAge/.8f)*Mathf.PI)*.12f,-.5f);
 }
 static GameObject MeshObject(string name,Mesh mesh,Material mat){var go=new GameObject(name);go.AddComponent<MeshFilter>().sharedMesh=mesh;go.AddComponent<MeshRenderer>().sharedMaterial=mat;return go;}
 static Mesh RoundedBox(){var verts=new List<Vector3>();var tris=new List<int>();var uv=new List<Vector2>();var normals=new List<Vector3>();int steps=3;foreach(var normal in new[]{Vector3.right,Vector3.left,Vector3.up,Vector3.down,Vector3.forward,Vector3.back}){var u=normal.y!=0?Vector3.right:Vector3.up;var v=Vector3.Cross(normal,u);int start=verts.Count;for(int y=0;y<=steps;y++)for(int x=0;x<=steps;x++){var p=normal*.5f+u*(x/(float)steps-.5f)+v*(y/(float)steps-.5f);var inner=new Vector3(Mathf.Clamp(p.x,-.455f,.455f),Mathf.Clamp(p.y,-.455f,.455f),Mathf.Clamp(p.z,-.455f,.455f));var n=(p-inner).normalized;verts.Add(inner+n*.045f);normals.Add(n);uv.Add(new Vector2(x/(float)steps,y/(float)steps));}for(int y=0;y<steps;y++)for(int x=0;x<steps;x++){int a=start+y*(steps+1)+x;tris.AddRange(new[]{a,a+1,a+steps+2,a,a+steps+2,a+steps+1});}}var mesh=new Mesh{name="Beveled box"};mesh.SetVertices(verts);mesh.SetNormals(normals);mesh.SetUVs(0,uv);mesh.SetTriangles(tris,0);mesh.RecalculateBounds();return mesh;}
 static List<int> Triangulate(Vector2[] p){var remaining=new List<int>();float area=0;for(int i=0;i<p.Length;i++)area+=p[i].x*p[(i+1)%p.Length].y-p[(i+1)%p.Length].x*p[i].y;if(area>0)for(int i=0;i<p.Length;i++)remaining.Add(i);else for(int i=p.Length-1;i>=0;i--)remaining.Add(i);var result=new List<int>();int safe=0;while(remaining.Count>2&&safe++<p.Length*p.Length){bool cut=false;for(int i=0;i<remaining.Count;i++){int a=remaining[(i+remaining.Count-1)%remaining.Count],b=remaining[i],c=remaining[(i+1)%remaining.Count];if(Cross(p[b]-p[a],p[c]-p[b])<=.000001f)continue;bool contains=false;foreach(int j in remaining){if(j==a||j==b||j==c)continue;if(Cross(p[b]-p[a],p[j]-p[a])>=0&&Cross(p[c]-p[b],p[j]-p[b])>=0&&Cross(p[a]-p[c],p[j]-p[c])>=0){contains=true;break;}}if(contains)continue;result.AddRange(new[]{a,b,c});remaining.RemoveAt(i);cut=true;break;}if(!cut)break;}return result;}
 static float Cross(Vector2 a,Vector2 b){return a.x*b.y-a.y*b.x;}
 static Mesh Extrude(Vector2[] profile,float depth){int n=profile.Length;var vertices=new List<Vector3>();var tris=new List<int>();var uv=new List<Vector2>();for(int side=0;side<2;side++)foreach(var p in profile){vertices.Add(new Vector3(p.x,p.y,(side==0?-.5f:.5f)*depth));uv.Add(p);}var flat=Triangulate(profile);for(int i=0;i<flat.Count;i+=3){tris.AddRange(new[]{flat[i+2],flat[i+1],flat[i],flat[i]+n,flat[i+1]+n,flat[i+2]+n});}for(int i=0;i<n;i++){int j=(i+1)%n;tris.AddRange(new[]{i,j,j+n,i,j+n,i+n});}var mesh=new Mesh();mesh.SetVertices(vertices);mesh.SetTriangles(tris,0);mesh.SetUVs(0,uv);mesh.RecalculateNormals();mesh.RecalculateBounds();return Flat(mesh);}
 static Mesh Flat(Mesh source){var input=source.vertices;var old=source.triangles;var vertices=new Vector3[old.Length];var triangles=new int[old.Length];for(int i=0;i<old.Length;i++){vertices[i]=input[old[i]];triangles[i]=i;}source.Clear();source.vertices=vertices;source.triangles=triangles;source.RecalculateNormals();source.RecalculateBounds();return source;}
 static Mesh BladeMesh(Vector2[] p,float depth){if(p==null||p.Length<3)p=new[]{new Vector2(0,-.15f),new Vector2(1.6f,-.13f),new Vector2(2,0),new Vector2(1.4f,.2f),new Vector2(0,.22f)};int n=p.Length;var center=Vector2.zero;foreach(var v in p)center+=v;center/=n;var vertices=new List<Vector3>();var triangles=new List<int>();foreach(var v in p){var inside=Vector2.Lerp(v,center,.065f);vertices.Add(new Vector3(inside.x,depth/2,inside.y));}foreach(var v in p){var inside=Vector2.Lerp(v,center,.065f);vertices.Add(new Vector3(inside.x,-depth/2,inside.y));}foreach(var v in p)vertices.Add(new Vector3(v.x,0,v.y));var flat=Triangulate(p);for(int i=0;i<flat.Count;i+=3){triangles.AddRange(new[]{flat[i+2],flat[i+1],flat[i],flat[i]+n,flat[i+1]+n,flat[i+2]+n});}for(int i=0;i<n;i++){int j=(i+1)%n;triangles.AddRange(new[]{i,j+2*n,i+2*n,i,j,j+2*n,i+n,i+2*n,j+2*n,i+n,j+2*n,j+n});}var mesh=new Mesh{name="Procedural beveled blade"};mesh.SetVertices(vertices);mesh.SetTriangles(triangles,0);return Flat(mesh);}

 static Mesh RingMesh(){var v=new List<Vector3>();var t=new List<int>();for(int i=0;i<=64;i++){float a=i*Mathf.PI*2/64;v.Add(new Vector3(Mathf.Cos(a),0,Mathf.Sin(a))*.94f);v.Add(new Vector3(Mathf.Cos(a),0,Mathf.Sin(a)));if(i<64){int n=i*2;t.AddRange(new[]{n,n+2,n+1,n+1,n+2,n+3});}}var m=new Mesh();m.SetVertices(v);m.SetTriangles(t,0);m.RecalculateNormals();return m;}
 void OnDestroy(){foreach(var b in bodies.Values)if(b.metal)Destroy(b.metal);if(environment)Destroy(environment);}
}
