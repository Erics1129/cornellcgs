using System;
using System.Collections.Generic;
using UnityEngine;
using UnityEngine.Rendering;
using UnityEngine.Rendering.Universal;

namespace CarrotTD {
 public sealed class CarrotClickable : MonoBehaviour { public string type; public int id; }

 public sealed class CarrotView : MonoBehaviour {
  #if UNITY_WEBGL && !UNITY_EDITOR
  [System.Runtime.InteropServices.DllImport("__Internal")] static extern float Carrot_CanvasCSSWidth();
  #endif
  float inputPixelScale=1;
  sealed class Actor {
   public GameObject root;public Transform model,turret,core,barrel,petals,pages,muzzle,shadow;public Animation animation;public string currentClip;public string kind;public int tier;
   public Vector3 modelScale,barrelRest;public Quaternion modelRotation;public Renderer[] renderers;public float flash=-1,hitRemaining,deadClock;public Bounds bounds;
  }
  public Camera GameCamera;
  CarrotGame game;CarrotEffects effects;CarrotAudio sound;
  readonly Dictionary<int,Actor> towers=new Dictionary<int,Actor>(),enemies=new Dictionary<int,Actor>(),blockers=new Dictionary<int,Actor>();
  readonly Dictionary<int,GameObject> pads=new Dictionary<int,GameObject>();
  readonly Dictionary<string,Material> materials=new Dictionary<string,Material>();
  readonly List<Mesh> createdMeshes=new List<Mesh>();
  readonly Dictionary<Transform,Quaternion> restRotations=new Dictionary<Transform,Quaternion>();
  readonly Dictionary<Transform,Vector3> eyeScales=new Dictionary<Transform,Vector3>();
  readonly List<int> removeIds=new List<int>();readonly HashSet<int> seen=new HashSet<int>();
  Transform world,decoration;Actor carrot;int levelId=-1;float clock,carrotHit,shake,zoom=1,targetZoom=1,ambientClock;Vector3 pan,targetPan;
  Vector2 pointerStart,pointerPrevious;bool pointerDown,dragging,suppressTouchClick,portraitCamera;float pinchDistance;int lastWidth,lastHeight;string previousPhase="";Light sun,fill;Volume grade;Material skyMaterial;float tierClock,tierAccum;int tierFrames;
  LineRenderer selectionRing,rangeRing;MaterialPropertyBlock properties;GameObject[] nature;readonly Dictionary<string,GameObject> realNature=new Dictionary<string,GameObject>();Texture2D atlas;
  Vector3 carrotPosition;float bossIntro;Vector3 bossFocus;Vector3 cameraTarget=new Vector3(0,.35f,.2f);Quaternion cameraAngle=Quaternion.Euler(34,-9,0);float fitDistance=25;
  void Awake(){CarrotQuality.Choose();Shader.SetGlobalFloat("_CarrotGust",1);game=GetComponent<CarrotGame>();effects=gameObject.AddComponent<CarrotEffects>();sound=gameObject.AddComponent<CarrotAudio>();effects.CameraImpulse=a=>shake=Mathf.Max(shake,a);properties=new MaterialPropertyBlock();atlas=Resources.Load<Texture2D>("Carrot/Textures/MaterialAtlas");var naturalPrefabs=new List<GameObject>();foreach(var name in new[]{"Rock","RockTall","Pebble","FlowerWhite","FlowerPurple","Bridge","Stump"}){var prefab=Resources.Load<GameObject>("Carrot/Nature/"+name);if(prefab!=null)naturalPrefabs.Add(prefab);}nature=naturalPrefabs.ToArray();foreach(var name in new[]{"Fern","Stump","MossRockA","MossRockB","Shrub"}){var prefab=Resources.Load<GameObject>("Carrot/RealNature/"+name);if(prefab!=null)realNature[name]=prefab;}CreateCamera();CreateLighting();selectionRing=CreateRing("Selection",new Color(1,.88f,.44f),.035f);rangeRing=CreateRing("Range",new Color(.65f,.9f,1,.42f),.02f);if(game!=null)game.Effect+=OnEffect;}
  void OnDestroy(){if(game!=null)game.Effect-=OnEffect;foreach(var m in materials.Values)Destroy(m);foreach(var m in createdMeshes)Destroy(m);}
  public void SetMuted(bool muted){if(sound!=null)sound.SetMuted(muted);}
  public void UiSound(string kind){if(sound!=null)sound.UiSound(kind);}
  public void Quality(string tier){CarrotQuality.Force(tier=="high");var data=GameCamera.GetUniversalAdditionalCameraData();data.antialiasing=CarrotQuality.High?AntialiasingMode.FastApproximateAntialiasing:AntialiasingMode.None;ApplyBiomeLighting();}
  void Update(){if(game==null||game.level==null)return;if(levelId!=game.level.id)BuildLevel();float raw=Mathf.Min(Time.deltaTime,.05f);bool frozen=game.paused;float dt=frozen?0:raw*(game.phase=="playing"?Mathf.Clamp(game.speed,1,2):1);clock+=dt;Shader.SetGlobalFloat("_CarrotTime",clock);Shader.SetGlobalFloat("_CarrotGust",1+.7f*Mathf.Max(0,Mathf.Sin(clock*.23f))*(.5f+.5f*Mathf.PerlinNoise(clock*.4f,3.7f)));WatchFrameTime();effects.Tick(dt);sound.Tick(raw,game.paused,game.phase);UpdateInput();UpdateCamera(raw);UpdateActors(dt);UpdateCarrot(dt);UpdateSelection();if(game.phase!=previousPhase){if(game.phase=="playing")sound.Unlock();previousPhase=game.phase;}ambientClock+=dt;if(ambientClock>2.5f){ambientClock=0;Vector3 p=new Vector3(Mathf.Sin(clock*.31f)*5,.6f,Mathf.Cos(clock*.27f)*3);effects.Burst(p,game.level.biome=="frost"?new Color(.75f,.89f,1,.45f):new Color(.9f,1,.6f,.35f),4,.075f,2.4f,.13f);}}
  void CreateCamera(){if(GameCamera==null){GameCamera=Camera.main;if(GameCamera==null){var go=new GameObject("Carrot camera");GameCamera=go.AddComponent<Camera>();go.tag="MainCamera";}}GameCamera.orthographic=false;GameCamera.fieldOfView=38;GameCamera.nearClipPlane=.1f;GameCamera.farClipPlane=100;GameCamera.clearFlags=CameraClearFlags.Skybox;GameCamera.backgroundColor=new Color(.075f,.13f,.16f);GameCamera.allowHDR=true;GameCamera.allowMSAA=true;GameCamera.depth=0;if(GameCamera.GetComponent<AudioListener>()==null)GameCamera.gameObject.AddComponent<AudioListener>();var data=GameCamera.GetUniversalAdditionalCameraData();data.renderPostProcessing=true;data.antialiasing=CarrotQuality.High?AntialiasingMode.FastApproximateAntialiasing:AntialiasingMode.None;data.renderShadows=true;data.requiresDepthOption=CameraOverrideOption.UsePipelineSettings;data.requiresColorOption=CameraOverrideOption.UsePipelineSettings;data.volumeLayerMask=-1;data.dithering=true;data.stopNaN=false;}
  void WatchFrameTime(){if(!CarrotQuality.High)return;tierClock+=Time.unscaledDeltaTime;if(tierClock<3)return;tierAccum+=Time.unscaledDeltaTime;tierFrames++;if(tierFrames<120)return;float mean=tierAccum/tierFrames*1000;tierAccum=0;tierFrames=0;if(mean>15.5f){CarrotQuality.Demote("frame mean "+mean.ToString("F1")+" ms");var data=GameCamera.GetUniversalAdditionalCameraData();data.antialiasing=AntialiasingMode.None;ApplyBiomeLighting();}}
  void CreateLighting(){foreach(var l in FindObjectsByType<Light>(FindObjectsSortMode.None))if(l.type==LightType.Directional)l.enabled=false;var go=new GameObject("Key light");go.transform.SetParent(transform);sun=go.AddComponent<Light>();sun.type=LightType.Directional;sun.color=new Color(1,.89f,.72f);sun.intensity=2.6f;sun.shadows=LightShadows.Soft;sun.shadowStrength=.92f;go.transform.rotation=Quaternion.Euler(52,-28,0);var fillGo=new GameObject("Sky fill");fillGo.transform.SetParent(transform);fill=fillGo.AddComponent<Light>();fill.type=LightType.Directional;fill.shadows=LightShadows.None;fill.color=new Color(.56f,.70f,.85f);fill.intensity=.3f;fillGo.transform.rotation=Quaternion.Euler(-28,150,0);RenderSettings.ambientMode=AmbientMode.Trilight;RenderSettings.ambientIntensity=1;RenderSettings.fog=true;RenderSettings.fogMode=FogMode.Linear;RenderSettings.fogStartDistance=30;RenderSettings.fogEndDistance=70;skyMaterial=new Material(Shader.Find("Carrot/Sky"));materials["sky"]=skyMaterial;RenderSettings.skybox=skyMaterial;var environment=Resources.Load<Cubemap>("Carrot/Textures/Environment");if(environment!=null){RenderSettings.defaultReflectionMode=DefaultReflectionMode.Custom;RenderSettings.customReflectionTexture=environment;RenderSettings.reflectionIntensity=.9f;}var volumeGo=new GameObject("Grade");volumeGo.transform.SetParent(transform);grade=volumeGo.AddComponent<Volume>();grade.isGlobal=true;grade.priority=1;grade.weight=1;}
  void ApplyBiomeLighting(){if(game==null||game.level==null||sun==null)return;string biome=game.level.biome;bool high=CarrotQuality.High;
   // Values are HDR; ACES in the post volume maps them to the canvas.
   Color zenith,horizon,ground;
   if(biome=="marsh"){sun.transform.rotation=Quaternion.Euler(58,35,0);sun.color=new Color(.66f,.78f,1);sun.intensity=1.15f;sun.shadowStrength=.85f;fill.transform.rotation=Quaternion.Euler(-20,-120,0);fill.color=new Color(.18f,.32f,.30f);fill.intensity=.25f;zenith=new Color(.02f,.07f,.14f);horizon=new Color(.09f,.20f,.29f);ground=new Color(.03f,.05f,.04f);RenderSettings.fogColor=new Color(.05f,.12f,.17f);RenderSettings.fogStartDistance=22;RenderSettings.fogEndDistance=58;}
   else if(biome=="frost"){sun.transform.rotation=Quaternion.Euler(36,-50,0);sun.color=new Color(.86f,.92f,1);sun.intensity=1.7f;sun.shadowStrength=.8f;fill.transform.rotation=Quaternion.Euler(-25,130,0);fill.color=new Color(.55f,.68f,.92f);fill.intensity=.45f;zenith=new Color(.36f,.50f,.69f);horizon=new Color(.83f,.88f,.94f);ground=new Color(.70f,.74f,.80f);RenderSettings.fogColor=new Color(.75f,.83f,.92f);RenderSettings.fogStartDistance=30;RenderSettings.fogEndDistance=76;}
   else{sun.transform.rotation=Quaternion.Euler(52,-28,0);sun.color=new Color(1,.89f,.72f);sun.intensity=2.6f;sun.shadowStrength=.92f;fill.transform.rotation=Quaternion.Euler(-28,150,0);fill.color=new Color(.56f,.70f,.85f);fill.intensity=.3f;zenith=new Color(.40f,.62f,.86f);horizon=new Color(.72f,.82f,.90f);ground=new Color(.20f,.26f,.14f);RenderSettings.fogColor=new Color(.70f,.80f,.86f);RenderSettings.fogStartDistance=34;RenderSettings.fogEndDistance=82;}
   RenderSettings.ambientSkyColor=zenith*1.0f;RenderSettings.ambientEquatorColor=horizon*.9f;RenderSettings.ambientGroundColor=ground*.8f;RenderSettings.reflectionIntensity=biome=="frost"?.55f:biome=="marsh"?.6f:.75f;
   Shader.SetGlobalFloat("_SnowAmount",biome=="frost"?1:0);Shader.SetGlobalVector("_SnowOffset",Vector4.zero);
   var wet=new Vector4[2];if(biome=="marsh"){var ponds=PondCenters();for(int i=0;i<2;i++)wet[i]=new Vector4(ponds[i].x,ponds[i].z,2.4f,1);}Shader.SetGlobalVectorArray("_WetCenters",wet);
   skyMaterial.SetColor("_Zenith",zenith);skyMaterial.SetColor("_Horizon",horizon);skyMaterial.SetColor("_Ground",ground);skyMaterial.SetVector("_CarrotSunDir",-sun.transform.forward);
   skyMaterial.SetColor("_SunColor",biome=="marsh"?new Color(.8f,.86f,1)*1.4f:biome=="frost"?new Color(1,.97f,.9f)*.9f:new Color(1,.9f,.7f)*1.3f);skyMaterial.SetFloat("_SunSize",biome=="marsh"?.02f:.035f);skyMaterial.SetFloat("_SunGlow",biome=="marsh"?.2f:biome=="frost"?.5f:.35f);
   skyMaterial.SetFloat("_CloudAmount",biome=="frost"?.9f:biome=="marsh"?.3f:.55f);skyMaterial.SetColor("_CloudColor",biome=="marsh"?new Color(.12f,.2f,.3f):biome=="frost"?new Color(.9f,.93f,.97f):new Color(1,.98f,.95f));
   skyMaterial.SetFloat("_Stars",biome=="marsh"?1:0);skyMaterial.SetFloat("_Aurora",biome=="frost"?.8f:0);skyMaterial.SetColor("_AuroraColor",new Color(.37f,.91f,.63f));
   var profile=Resources.Load<VolumeProfile>("Carrot/Volumes/"+biome);if(profile!=null&&grade!=null){grade.sharedProfile=profile;var live=grade.profile;if(live.TryGet<DepthOfField>(out var dof))dof.active=high;if(live.TryGet<Bloom>(out var bloom)){bloom.highQualityFiltering.value=high;bloom.scatter.value=high?.6f:.5f;}if(live.TryGet<ShadowsMidtonesHighlights>(out var smh))smh.active=high;if(live.TryGet<ChromaticAberration>(out var ca))ca.active=high;}
  }
  Material Material(string id,Color tint,int texture=-1,float gloss=.25f,float metallic=0,float gain=1){if(materials.TryGetValue(id,out var m))return m;m=new Material(Shader.Find("Carrot/Storybook"));m.name=id;m.color=tint;m.SetFloat("_Glossiness",gloss);m.SetFloat("_Metallic",metallic);m.SetFloat("_AlbedoGain",gain);m.SetFloat("_SnowStrength",texture==1||texture==0?1:.35f);if(texture>=0&&atlas!=null){m.SetTexture("_MainTex",atlas);m.SetTextureScale("_MainTex",new Vector2(1f/3,.5f));m.SetTextureOffset("_MainTex",new Vector2((texture%3)/3f,texture<3?.5f:0));m.SetFloat("_WorldTexture",1);m.SetFloat("_TextureScale",.6f);}if(texture>=0)ApplyPhysicalMaps(m,texture==0?"Soil":texture==1?"Stone":texture==2?"Bark":texture==5?"Metal":null);materials[id]=m;return m;}
  void ApplyPhysicalMaps(Material material,string family){
   if(string.IsNullOrEmpty(family))return;string path="Carrot/Textures/PBR/"+family;
   var albedo=Resources.Load<Texture2D>(path+"Albedo");if(albedo!=null){material.SetTexture("_MainTex",albedo);material.SetTextureScale("_MainTex",Vector2.one);material.SetTextureOffset("_MainTex",Vector2.zero);material.SetFloat("_TextureScale",family=="Soil"?.85f:1.3f);}
   var normal=Resources.Load<Texture2D>(path+"Normal");if(normal!=null){material.SetTexture("_BumpMap",normal);material.SetFloat("_BumpScale",family=="Soil"?1.05f:.8f);}
   var roughness=Resources.Load<Texture2D>(path+"Roughness");if(roughness!=null){material.SetTexture("_RoughnessMap",roughness);material.SetFloat("_UseRoughnessMap",1);}
   var ao=Resources.Load<Texture2D>(path+"AO");if(ao!=null){material.SetTexture("_OcclusionMap",ao);material.SetFloat("_UseOcclusionMap",1);material.SetFloat("_OcclusionStrength",.68f);}
  }
  void BuildLevel(){levelId=game.level.id;if(world!=null)Destroy(world.gameObject);foreach(var m in createdMeshes)Destroy(m);createdMeshes.Clear();world=new GameObject("Storybook diorama "+levelId).transform;world.SetParent(transform,false);decoration=new GameObject("Garden details").transform;decoration.SetParent(world,false);towers.Clear();enemies.Clear();blockers.Clear();pads.Clear();eyeScales.Clear();restRotations.Clear();effects.Clear();clock=0;carrotHit=0;zoom=targetZoom=1;pan=targetPan=Vector3.zero;pointerDown=dragging=false;pinchDistance=0;string biome=game.level.biome;
   ApplyBiomeLighting();
   BuildTerrain();BuildRoads();for(int i=0;i<game.level.pads.Length;i++)BuildPad(i,game.level.pads[i]);BuildDecoration();BuildGrass();CombineDecoration();Vector3[] route=game.level.routes[0];carrotPosition=route[route.Length-1];carrot=Spawn("Carrot/Models/Carrot",world,"carrot",0);carrot.root.transform.position=carrotPosition+Vector3.up*.02f;carrot.root.transform.rotation=Quaternion.identity;carrot.root.transform.localScale=Vector3.one*1.35f;BuildCarrotNest();FitCamera();sound.SetBiome(biome);SetFace(false,false);}
  float PathDistance(Vector3 p){float min=100;foreach(var route in game.level.routes)for(int i=1;i<route.Length;i++)min=Mathf.Min(min,SegmentDistance(p,route[i-1],route[i]));return min;}
  static float SegmentDistance(Vector3 p,Vector3 a,Vector3 b){p.y=a.y=b.y=0;Vector3 d=b-a;float t=Mathf.Clamp01(Vector3.Dot(p-a,d)/Mathf.Max(.001f,d.sqrMagnitude));return Vector3.Distance(p,a+d*t);}
  bool IsFree(Vector3 p,float margin=.9f){if(PathDistance(p)<margin)return false;foreach(var q in game.level.pads)if(Vector3.Distance(p,q)<margin)return false;return true;}
  Vector3[] PondCenters(){float shift=(game.level.id-5)*.38f;return new[]{new Vector3(-3.5f+shift,-.10f,1.4f-shift*.6f),new Vector3(3.4f-shift*.55f,-.10f,-1.9f+shift)};}
  bool Pond(Vector3 p){if(game.level.biome!="marsh")return false;foreach(var center in PondCenters())if(Vector2.Distance(new Vector2(p.x,p.z),new Vector2(center.x,center.z))<1.65f)return true;return false;}
  float TerrainHeight(Vector3 p){
   float n=Mathf.PerlinNoise(p.x*.55f+20,p.z*.55f+20),path=PathDistance(p);
   float y=-.025f+Mathf.SmoothStep(0,1,Mathf.Clamp01((path-.55f)/.9f))*n*.16f;
   float edge=Mathf.Clamp01(Mathf.Max((Mathf.Abs(p.x)-7.8f)/3.5f,(Mathf.Abs(p.z)-5.8f)/3.2f));
   float hills=Mathf.PerlinNoise(p.x*.16f+8,p.z*.16f+14);
   y+=Mathf.SmoothStep(0,1,edge)*(.25f+hills*(game.level.biome=="frost"?1.9f:game.level.biome=="marsh"?.55f:1.25f));
   return Pond(p)?-.18f:y;
  }
  void BuildTerrain(){
   const int sx=128,sz=104;var vertices=new Vector3[(sx+1)*(sz+1)];var colors=new Color[vertices.Length];var uv=new Vector2[vertices.Length];var tris=new int[sx*sz*6];string biome=game.level.biome;
   Color soil=biome=="frost"?new Color(.83f,.90f,.97f):biome=="marsh"?new Color(.22f,.36f,.23f):new Color(.27f,.42f,.11f);int index=0;
   for(int z=0;z<=sz;z++)for(int x=0;x<=sx;x++){
    int k=z*(sx+1)+x;float px=Mathf.Lerp(-24,24,x/(float)sx),pz=Mathf.Lerp(-20,20,z/(float)sz);Vector3 p=new Vector3(px,0,pz);
    float n=Mathf.PerlinNoise(px*.55f+20,pz*.55f+20),broad=Mathf.PerlinNoise(px*.19f+41,pz*.19f+83);vertices[k]=new Vector3(px,TerrainHeight(p),pz);uv[k]=new Vector2(x/(float)sx,z/(float)sz);
    colors[k]=Color.Lerp(soil*(biome=="frost"?.88f:.70f),soil*(biome=="frost"?1.04f:1.12f),n*.6f+broad*.4f);colors[k].a=1;
    if(x<sx&&z<sz){tris[index++]=k;tris[index++]=k+sx+1;tris[index++]=k+1;tris[index++]=k+1;tris[index++]=k+sx+1;tris[index++]=k+sx+2;}
   }
   var mesh=new Mesh{name="Continuous rolling landscape"};mesh.vertices=vertices;mesh.uv=uv;mesh.colors=colors;mesh.triangles=tris;mesh.RecalculateNormals();
   var mat=Material("ground-"+biome,Color.white,biome=="frost"?1:0);mat.SetFloat("_AlbedoSaturation",biome=="frost"?0:.10f);mat.SetFloat("_AlbedoGain",biome=="frost"?1.0f:1.9f);mat.SetFloat("_OcclusionStrength",biome=="frost"?.45f:.55f);mat.SetFloat("_SnowStrength",.6f);mat.SetFloat("_BumpScale",biome=="frost"?.32f:.85f);mat.SetFloat("_TextureScale",biome=="frost"?2.3f:.85f);mat.SetFloat("_ReflectionStrength",.25f);
   if(biome=="frost")ConfigureSnow(mat,false);
   var go=MeshObject("Terrain",mesh,mat,world);go.AddComponent<MeshCollider>().sharedMesh=mesh;
   if(biome=="marsh"){
    var waterMaterial=new Material(Shader.Find("Carrot/Water"));waterMaterial.SetColor("_Color",new Color(.018f,.071f,.068f));waterMaterial.SetColor("_Shallow",new Color(.11f,.24f,.23f));
    if(materials.TryGetValue("water-runtime",out var oldWater))Destroy(oldWater);materials["water-runtime"]=waterMaterial;
    foreach(var p in PondCenters()){var pool=MeshObject("Sheltered pond",Disc(1.65f,64),waterMaterial,world);pool.transform.localPosition=p;}
   }
  }
  void ConfigureSnow(Material mat,bool packed){
   // Snow reflects light from a pale base; dark rock albedo must never tint its grains.
   mat.SetTexture("_MainTex",Texture2D.whiteTexture);mat.SetTextureScale("_MainTex",Vector2.one);mat.SetTextureOffset("_MainTex",Vector2.zero);mat.SetFloat("_AlbedoGain",packed?.9f:1);mat.SetFloat("_AlbedoSaturation",1);
   mat.SetFloat("_WorldTexture",1);mat.SetFloat("_TextureScale",packed?1.7f:1.2f);mat.SetFloat("_Glossiness",packed?.34f:.16f);mat.SetFloat("_UseRoughnessMap",0);mat.SetFloat("_UseOcclusionMap",0);mat.SetFloat("_ReflectionStrength",packed?.25f:.12f);
   var grain=Resources.Load<Texture2D>("Carrot/Textures/PBR/SoilNormal");mat.SetTexture("_BumpMap",grain);mat.SetFloat("_BumpScale",packed?.14f:.095f);
  }
  void BuildRoads(){var mat=Material("path-"+game.level.biome,game.level.biome=="frost"?new Color(.58f,.70f,.86f):game.level.biome=="marsh"?new Color(.90f,.84f,.65f):new Color(1,.86f,.60f),game.level.biome=="frost"?1:0,.15f);mat.SetFloat("_AlbedoSaturation",game.level.biome=="frost"?0:.5f);mat.SetFloat("_AlbedoGain",game.level.biome=="frost"?1.0f:1.7f);mat.SetFloat("_SnowStrength",.15f);if(game.level.biome=="frost")ConfigureSnow(mat,true);else if(game.level.biome=="marsh"){mat.SetFloat("_AlbedoGain",1.7f);mat.SetFloat("_OcclusionStrength",.3f);mat.SetFloat("_ReflectionStrength",.3f);}var edge=Material("path-stone",new Color(1,.96f,.86f),1,.3f,0,1.9f);var visited=new HashSet<string>();int routeIndex=0;
   foreach(var route in game.level.routes){for(int i=1;i<route.Length;i++){Vector3 a=route[i-1],b=route[i];Vector3 delta=b-a;int count=Mathf.Max(1,Mathf.CeilToInt(delta.magnitude/.35f));for(int s=0;s<=count;s++){Vector3 p=Vector3.Lerp(a,b,s/(float)count);string key=Mathf.RoundToInt(p.x*6)+":"+Mathf.RoundToInt(p.z*6);if(!visited.Add(key))continue;Vector3 side=Vector3.Cross(delta.normalized,Vector3.up);if(s%3==0){for(int k=-1;k<=1;k+=2){Vector3 ep=p+side*(.45f*k);if(PathDistance(ep)<.36f)continue;var stone=Primitive("Trail pebble",PrimitiveType.Sphere,ep+Vector3.up*.05f,new Vector3(.18f,.12f,.14f),edge,decoration,true);stone.transform.localRotation=Quaternion.Euler(14,s*37,8);}}if(Pond(p)&&s%2==0){var board=Primitive("Bridge board",PrimitiveType.Cube,p+Vector3.up*.09f,new Vector3(.9f,.10f,.19f),Material("bridgewood",new Color(.67f,.48f,.26f),2),decoration);board.transform.rotation=Quaternion.LookRotation(delta);}}}
    BuildTrailMesh(route,mat,routeIndex);Vector3 entrance=route[0];BuildEntrance(entrance,routeIndex++);}
  }
  void BuildTrailMesh(Vector3[] route,Material material,int routeIndex){
   var points=new List<Vector3>();for(int segment=1;segment<route.Length;segment++){int steps=Mathf.Max(1,Mathf.CeilToInt(Vector3.Distance(route[segment-1],route[segment])/.25f));for(int i=0;i<steps;i++)points.Add(Vector3.Lerp(route[segment-1],route[segment],i/(float)steps));}points.Add(route[route.Length-1]);
   var vertices=new Vector3[points.Count*2];var colors=new Color[vertices.Length];var uv=new Vector2[vertices.Length];var triangles=new int[(points.Count-1)*6];float length=0;
   for(int i=0;i<points.Count;i++){Vector3 incoming=(points[i]-points[Mathf.Max(0,i-1)]).normalized,outgoing=(points[Mathf.Min(points.Count-1,i+1)]-points[i]).normalized;Vector3 direction=(incoming+outgoing).normalized;if(direction.sqrMagnitude<.1f)direction=i==0?outgoing:incoming;Vector3 side=Vector3.Cross(direction,Vector3.up).normalized;float joint=Mathf.Min(1.35f,1/Mathf.Max(.7f,Vector3.Dot(direction,i==0?outgoing:incoming)));float width=.405f*joint;float wear=Mathf.PerlinNoise(points[i].x*2+43,points[i].z*2+82)*.03f;if(i>0)length+=Vector3.Distance(points[i],points[i-1]);
    for(int k=0;k<2;k++){int n=i*2+k;vertices[n]=points[i]+side*(k==0?-1:1)*(width+wear)+Vector3.up*(.061f+routeIndex*.0006f);uv[n]=new Vector2(k,length);colors[n]=Color.Lerp(game.level.biome=="frost"?new Color(.75f,.88f,1):new Color(.82f,.78f,.66f),Color.white,Mathf.PerlinNoise(points[i].x+5,points[i].z+9));}
    if(i<points.Count-1){int n=i*6,v=i*2;triangles[n]=v;triangles[n+1]=v+1;triangles[n+2]=v+2;triangles[n+3]=v+1;triangles[n+4]=v+3;triangles[n+5]=v+2;}
   }
   var mesh=new Mesh{name="Continuous worn-earth trail"};mesh.vertices=vertices;mesh.uv=uv;mesh.colors=colors;mesh.triangles=triangles;mesh.RecalculateNormals();MeshObject("Continuous trail",mesh,material,decoration);
  }
  void BuildEntrance(Vector3 p,int routeIndex){var rock=Material("entry-stone",new Color(.86f,.9f,.8f),1,.25f,0,1.8f);for(int i=0;i<7;i++){float a=Mathf.PI*i/6;Vector3 pos=p+new Vector3(Mathf.Cos(a)*.66f,.24f+Mathf.Sin(a)*.75f,-.16f);var s=Primitive("Moss arch",PrimitiveType.Sphere,pos,new Vector3(.46f,.44f,.4f),rock,decoration);s.transform.localRotation=Quaternion.Euler(i*12,i*23,0);}var lamp=Primitive("Entrance lantern",PrimitiveType.Sphere,p+new Vector3(0,1.02f,-.15f),Vector3.one*.13f,Material("lantern",new Color(1,.76f,.22f),5,.65f,.3f),decoration);lamp.GetComponent<Renderer>().sharedMaterial.SetColor("_EmissionColor",new Color(1.6f,.75f,.12f));}
  void BuildPad(int id,Vector3 p){var root=new GameObject("Tower garden "+id);root.transform.SetParent(world,false);root.transform.localPosition=p;var click=root.AddComponent<CarrotClickable>();click.type="pad";click.id=id;var collider=root.AddComponent<SphereCollider>();collider.center=new Vector3(0,.12f,0);collider.radius=.47f;var baseMat=Material("padsoil-"+game.level.biome,game.level.biome=="frost"?new Color(.57f,.70f,.82f):new Color(.65f,.57f,.37f),0,.25f,0,game.level.biome=="frost"?1:1.6f);if(game.level.biome=="frost"){ConfigureSnow(baseMat,true);baseMat.SetFloat("_SnowStrength",.3f);}
   // Static pad dressing lives in the batched decoration so a level costs one draw per material, not nine per pad.
   var disk=MeshObject("Planting circle",Disc(.44f,24),baseMat,decoration);disk.transform.localPosition=p+Vector3.up*.045f;var stoneMat=Material("padstones-"+game.level.biome,game.level.biome=="frost"?new Color(.8f,.88f,.94f):new Color(.95f,.92f,.78f),1,.22f,0,1.7f);var rng=new System.Random(id*131+levelId*7);
   for(int i=0;i<7;i++){float a=i*Mathf.PI*2/7+(float)rng.NextDouble()*.3f;float r=.38f+(float)rng.NextDouble()*.06f;var st=Primitive("Border stone",PrimitiveType.Sphere,p+new Vector3(Mathf.Cos(a)*r,.05f,Mathf.Sin(a)*r),new Vector3(.22f+(float)rng.NextDouble()*.1f,.08f,.15f+(float)rng.NextDouble()*.06f),stoneMat,decoration,true);st.transform.localRotation=Quaternion.Euler((float)rng.NextDouble()*20-10,-a*Mathf.Rad2Deg,(float)rng.NextDouble()*16-8);}
   var marker=MeshObject("Build mark",Disc(.11f,12),Material("padmark",new Color(.82f,.74f,.42f),-1,.3f),root.transform);marker.transform.localPosition=Vector3.up*.052f;pads[id]=root;}
  void BuildCarrotNest(){var material=Material("carrot-fence",new Color(.68f,.42f,.22f),2);for(int i=0;i<15;i++){float a=i*Mathf.PI*2/15;Vector3 p=carrotPosition+new Vector3(Mathf.Cos(a)*.63f,.22f,Mathf.Sin(a)*.63f);Primitive("Root fence",PrimitiveType.Cylinder,p,new Vector3(.07f,.19f,.07f),material,decoration,true);}for(int i=0;i<6;i++)Flower(carrotPosition+new Vector3(Mathf.Cos(i)*.82f,.02f,Mathf.Sin(i)*.65f),.27f,i%2==0?Color.white:new Color(1,.72f,.22f));}
  void BuildDecoration(){var rng=new System.Random(9307+levelId*31);string biome=game.level.biome;int shrubs=0;int budget=CarrotQuality.High?150:90;for(int i=0;i<150;i++){if(biome=="frost"&&i%3!=0)continue;if(i>=budget)break;Vector3 p=new Vector3((float)rng.NextDouble()*15.7f-7.85f,0,(float)rng.NextDouble()*11.8f-5.9f);if(!IsFree(p,.78f)||Pond(p))continue;float edge=Mathf.Max(Mathf.Abs(p.x)/7.8f,Mathf.Abs(p.z)/5.8f);float size=.2f+(float)rng.NextDouble()*.38f;GameObject prefab=null;string token=i%6==0&&edge>.75f?"shrub":i%3==0?"rock":i%3==1?"plant":"bush";foreach(var n in nature){if(n==null)continue;string wanted=token;if(n.name.ToLowerInvariant().Contains(wanted)){prefab=n;if(rng.NextDouble()>.5)break;}}
    {string scan=biome=="frost"?(i%2==0?"MossRockA":"MossRockB"):token=="rock"?(i%2==0?"MossRockA":"MossRockB"):token=="shrub"&&shrubs<(CarrotQuality.High?5:0)?"Shrub":"Fern";if(scan=="Shrub")shrubs++;if(scan=="Fern"&&token=="shrub")token="plant";if(realNature.TryGetValue(scan,out var realistic))prefab=realistic;}
    if(prefab!=null){var obj=Instantiate(prefab,decoration);obj.name="Living "+token;obj.transform.localPosition=p;obj.transform.rotation=Quaternion.Euler(0,(float)rng.NextDouble()*360,0);var bounds=BoundsOf(obj);float h=biome=="frost"?.16f+(float)rng.NextDouble()*.23f:token=="shrub"?.85f+(float)rng.NextDouble()*.7f:token=="rock"?size:.35f+size;obj.transform.localScale*=h/Mathf.Max(.01f,bounds.size.y);GroundScan(obj,p,h);foreach(var col in obj.GetComponentsInChildren<Collider>())Destroy(col);}
    else if(token=="rock"){var stone=Primitive("Weathered stone",PrimitiveType.Sphere,p+Vector3.up*size*.3f,new Vector3(size,size*.65f,size*.8f),Material("loose-rock-"+biome,biome=="frost"?new Color(.85f,.9f,.94f):new Color(.78f,.8f,.62f),1,.22f,0,1.6f),decoration);stone.transform.localRotation=Quaternion.Euler(22,i*19,13);}
    else Flower(p,size,biome=="frost"?new Color(.63f,.81f,1):i%3==0?new Color(.74f,.48f,.86f):Color.white);
   }
   BuildLandscapeFrames();if(biome!="frost")for(int i=0;i<20;i++){Vector3 p=new Vector3((float)rng.NextDouble()*15.5f-7.75f,.04f,(float)rng.NextDouble()*11.6f-5.8f);if(IsFree(p,.82f)&&!Pond(p))Flower(p,.18f+(float)rng.NextDouble()*.11f,i%3==0?new Color(.67f,.39f,.77f):new Color(1,.89f,.59f));}
  }
  void BuildGrass(){
   if(game.level.biome=="frost")return;
   var random=new System.Random(4091+game.level.id*83);var vertices=new List<Vector3>();var uv=new List<Vector2>();var colors=new List<Color>();var triangles=new List<int>();
   int patches=CarrotQuality.High?1000:500,bladesPer=CarrotQuality.High?9:6;for(int patch=0;patch<patches;patch++){
    Vector3 center=new Vector3((float)random.NextDouble()*17-8.5f,0,(float)random.NextDouble()*13-6.5f);if(!IsFree(center,.59f)||Pond(center))continue;
    float density=Mathf.PerlinNoise(center.x*.8f+35,center.z*.8f+22);if(density<.39f)continue;
    for(int blade=0;blade<bladesPer;blade++){
     Vector3 p=center+new Vector3(((float)random.NextDouble()-.5f)*.32f,.045f,((float)random.NextDouble()-.5f)*.32f);if(PathDistance(p)<.45f)continue;p.y=TerrainHeight(p)+.015f;
     float angle=(float)random.NextDouble()*Mathf.PI*2,height=.08f+(float)random.NextDouble()*.24f,width=.013f+(float)random.NextDouble()*.024f;
     Vector3 side=new Vector3(Mathf.Cos(angle),0,Mathf.Sin(angle))*width,lean=new Vector3(Mathf.Sin(angle),0,Mathf.Cos(angle))*height*.34f;
     int k=vertices.Count;vertices.Add(p-side);vertices.Add(p+side);vertices.Add(p+Vector3.up*height*.55f-side*.55f+lean*.35f);vertices.Add(p+Vector3.up*height*.55f+side*.55f+lean*.35f);vertices.Add(p+Vector3.up*height+lean);
     Color bottom=game.level.biome=="marsh"?new Color(.11f,.28f,.10f):new Color(.15f,.35f,.055f);Color tip=Color.Lerp(new Color(.3f,.55f,.095f),new Color(.48f,.63f,.13f),(float)random.NextDouble());
     colors.Add(bottom);colors.Add(bottom);colors.Add(Color.Lerp(bottom,tip,.65f));colors.Add(Color.Lerp(bottom,tip,.65f));colors.Add(tip);uv.Add(new Vector2(0,0));uv.Add(new Vector2(1,0));uv.Add(new Vector2(0,.55f));uv.Add(new Vector2(1,.55f));uv.Add(new Vector2(.5f,1));
     triangles.Add(k);triangles.Add(k+2);triangles.Add(k+1);triangles.Add(k+1);triangles.Add(k+2);triangles.Add(k+3);triangles.Add(k+2);triangles.Add(k+4);triangles.Add(k+3);
    }
   }
   var mesh=new Mesh{name="Meadow grass and herbs",indexFormat=IndexFormat.UInt32};mesh.SetVertices(vertices);mesh.SetUVs(0,uv);mesh.SetColors(colors);mesh.SetTriangles(triangles,0);mesh.RecalculateNormals();var material=Material("living-grass",Color.white);material.SetFloat("_Cull",0);material.SetFloat("_Glossiness",.2f);material.SetFloat("_Wind",.028f);material.SetFloat("_Translucency",.5f);var meadow=MeshObject("Living meadow",mesh,material,decoration);meadow.GetComponent<Renderer>().shadowCastingMode=ShadowCastingMode.Off;
  }
  void BuildLandscapeFrames(){
   // Irregular, life-size border plants sit outside every route and leave the front approach open.
   Vector3[] anchors={new Vector3(-8.5f,0,3.7f),new Vector3(8.6f,0,2.7f),new Vector3(-5.3f,0,7.1f),new Vector3(5.2f,0,7.4f),new Vector3(-8.8f,0,-3.4f),new Vector3(8.8f,0,-2.8f),new Vector3(-1.6f,0,8.0f),new Vector3(1.6f,0,8.3f)};
   for(int i=0;i<anchors.Length;i++){
    bool frost=game.level.biome=="frost";string hero=i==0&&!frost?"Stump":i%2==0?"MossRockA":"MossRockB";
    PlaceScanned(hero,anchors[i],frost?1.15f+(i%3)*.35f:i==0?1.1f:.7f+(i%3)*.2f,i*67+levelId*17);
    if(!frost&&CarrotQuality.High&&i%2==0)PlaceScanned("Shrub",anchors[i]+new Vector3(i%2==0?-.7f:.7f,0,.55f),1.35f+(i%3)*.20f,levelId*37+i*89);
    for(int j=0;j<2;j++){float angle=(j*1.7f+i)*Mathf.PI*.65f;Vector3 p=anchors[i]+new Vector3(Mathf.Cos(angle)*.8f,0,Mathf.Sin(angle)*.65f);if(IsFree(p,.85f))PlaceScanned(frost?"MossRockB":"Fern",p,frost?.25f:.45f+j*.06f,j*83+i*41);}
   }
  }
  void GroundScan(GameObject obj,Vector3 p,float height){var b=BoundsOf(obj);obj.transform.position+=Vector3.up*(TerrainHeight(p)-b.min.y-Mathf.Min(.1f,height*.06f));}
  void PlaceScanned(string kind,Vector3 p,float height,float rotation){if(!realNature.TryGetValue(kind,out var prefab))return;var obj=Instantiate(prefab,decoration);obj.transform.localPosition=p;obj.transform.localRotation=Quaternion.Euler(0,rotation,0);var bounds=BoundsOf(obj);obj.transform.localScale*=height/Mathf.Max(.01f,bounds.size.y);GroundScan(obj,p,height);foreach(var c in obj.GetComponentsInChildren<Collider>())Destroy(c);}
  void Flower(Vector3 p,float height,Color petalColor){p.y=TerrainHeight(p)+.005f;GameObject prefab=null;bool white=petalColor.r>.9f&&petalColor.g>.85f;foreach(var n in nature){if(n==null)continue;if(n.name==(white?"FlowerWhite":"FlowerPurple")){prefab=n;break;}}
   if(prefab==null){var stem=Material("stem",new Color(.25f,.48f,.12f),4);Primitive("Flower stalk",PrimitiveType.Cylinder,p+Vector3.up*height*.5f,new Vector3(.018f,height*.5f,.018f),stem,decoration,true);Primitive("Flower head",PrimitiveType.Sphere,p+Vector3.up*height,new Vector3(.09f,.05f,.09f),Material("petal-"+petalColor.ToString(),petalColor),decoration,true);return;}
   var obj=Instantiate(prefab,decoration);obj.name="Meadow flower";obj.transform.localPosition=p;obj.transform.localRotation=Quaternion.Euler(0,p.x*131+p.z*57,0);var bounds=BoundsOf(obj);obj.transform.localScale*=Mathf.Max(.12f,height*1.15f)/Mathf.Max(.01f,bounds.size.y);foreach(var r in obj.GetComponentsInChildren<Renderer>()){r.shadowCastingMode=ShadowCastingMode.Off;var mats=r.sharedMaterials;for(int i=0;i<mats.Length;i++)if(mats[i]!=null&&mats[i].shader!=null&&mats[i].shader.name!="Carrot/Storybook")mats[i]=Material("flower-"+mats[i].name,mats[i].color,-1,.3f);r.sharedMaterials=mats;}foreach(var c in obj.GetComponentsInChildren<Collider>())Destroy(c);}
  void CombineDecoration(){var groups=new Dictionary<Material,List<CombineInstance>>();var remove=new List<GameObject>();foreach(var f in decoration.GetComponentsInChildren<MeshFilter>()){var r=f.GetComponent<MeshRenderer>();if(r==null||f.sharedMesh==null||!f.sharedMesh.isReadable)continue;var mats=r.sharedMaterials;for(int s=0;s<f.sharedMesh.subMeshCount&&s<mats.Length;s++){if(mats[s]==null)continue;if(!groups.TryGetValue(mats[s],out var list)){list=new List<CombineInstance>();groups[mats[s]]=list;}list.Add(new CombineInstance{mesh=f.sharedMesh,subMeshIndex=s,transform=decoration.worldToLocalMatrix*f.transform.localToWorldMatrix});}r.enabled=false;remove.Add(f.gameObject);}foreach(var pair in groups){var mesh=new Mesh{name="Batched natural details",indexFormat=IndexFormat.UInt32};mesh.CombineMeshes(pair.Value.ToArray(),true,true);var batch=MeshObject("Natural detail batch",mesh,pair.Key,decoration);string mn=pair.Key.name;if(mn.StartsWith("path-stone")||mn.StartsWith("padstones")||mn.StartsWith("padsoil")||mn.StartsWith("flower-")||mn.StartsWith("petal-")||mn=="stem"||mn=="pollen")batch.GetComponent<Renderer>().shadowCastingMode=ShadowCastingMode.Off;}foreach(var go in remove){var filter=go.GetComponent<MeshFilter>();var renderer=go.GetComponent<MeshRenderer>();if(filter!=null)Destroy(filter);if(renderer!=null)Destroy(renderer);}}
  Actor Spawn(string path,Transform parent,string kind,int tier){GameObject prefab=Resources.Load<GameObject>(path);var root=new GameObject(kind+" actor");root.transform.SetParent(parent,false);GameObject model;if(prefab!=null)model=Instantiate(prefab,root.transform);else{model=new GameObject("Missing model "+path);model.transform.SetParent(root.transform,false);Debug.LogError("Missing required Carrot model: "+path);}model.transform.localPosition=Vector3.zero;var actor=new Actor{root=root,model=model.transform,modelScale=model.transform.localScale,modelRotation=model.transform.localRotation,kind=kind,tier=tier,renderers=model.GetComponentsInChildren<Renderer>(true),animation=model.GetComponentInChildren<Animation>(true),bounds=BoundsOf(model)};actor.turret=Find(model.transform,"Turret");actor.core=Find(model.transform,"Core");actor.barrel=Find(model.transform,"Barrel");actor.petals=Find(model.transform,"Petals");actor.pages=Find(model.transform,"Pages");actor.muzzle=Find(model.transform,"Muzzle");if(actor.barrel!=null)actor.barrelRest=actor.barrel.localPosition;actor.shadow=ContactShadow(root.transform,kind=="garden"||kind=="marsh"||kind=="frost"&&path.Contains("Bosses")?1.65f:kind=="carrot"?1.1f:.9f);return actor;}
  Transform ContactShadow(Transform parent,float diameter){
   if(!materials.TryGetValue("contact-shadow",out var m)){m=new Material(Shader.Find("Carrot/Contact"));m.SetColor("_Color",new Color(.055f,.075f,.085f,.31f));materials["contact-shadow"]=m;}
   var go=Primitive("Contact shadow",PrimitiveType.Quad,Vector3.zero,new Vector3(diameter,diameter,.01f),m,parent);go.transform.rotation=Quaternion.Euler(-90,0,0);var r=go.GetComponent<Renderer>();r.shadowCastingMode=ShadowCastingMode.Off;r.receiveShadows=false;return go.transform;
  }
  static Transform Find(Transform root,string name){if(root.name==name)return root;foreach(Transform child in root){var match=Find(child,name);if(match!=null)return match;}return null;}
  static Bounds BoundsOf(GameObject obj){var rs=obj.GetComponentsInChildren<Renderer>(true);if(rs.Length==0)return new Bounds(Vector3.zero,Vector3.one);var b=rs[0].bounds;for(int i=1;i<rs.Length;i++)b.Encapsulate(rs[i].bounds);return b;}
  void Clickable(Actor a,string type,int id,float size){var click=a.root.AddComponent<CarrotClickable>();click.type=type;click.id=id;var col=a.root.AddComponent<BoxCollider>();col.center=Vector3.up*size*.5f;col.size=new Vector3(size*.85f,size,size*.85f);}
  void UpdateActors(float dt){seen.Clear();foreach(var t in game.towers){seen.Add(t.id);if(!towers.TryGetValue(t.id,out var a)||a.tier!=t.tier){if(a!=null)Destroy(a.root);a=Spawn("Carrot/Models/Towers/"+t.kind+"-"+t.tier,world,t.kind,t.tier);Clickable(a,"tower",t.id,1.25f);towers[t.id]=a;}a.root.transform.position=t.position+Vector3.up*.02f;if(a.shadow!=null)a.shadow.position=t.position+Vector3.up*.06f;if(a.turret!=null){Vector3 aim=t.aim-t.position;aim.y=0;if(aim.sqrMagnitude>.01f)a.turret.rotation=Quaternion.Slerp(a.turret.rotation,Quaternion.LookRotation(aim)*Quaternion.Euler(0,180,0),dt*12);}float since=Mathf.Max(0,game.elapsed-t.lastShot);float kick=Mathf.Exp(-since*20)*Mathf.Sin(since*24);if(a.barrel!=null)a.barrel.localPosition=a.barrelRest+Vector3.forward*kick*.08f;if(a.core!=null&&(t.kind=="prism"||t.kind=="gravity"||t.kind=="starfruit"))RotatePart(a.core,Quaternion.Euler(0,clock*(t.kind=="gravity"?45:18),0));if(a.petals!=null)RotatePart(a.petals,Quaternion.Euler(0,Mathf.Sin(clock*1.4f)*3,0));if(a.pages!=null)RotatePart(a.pages,Quaternion.Euler(Mathf.Sin(clock*3.1f)*5,0,0));float status=t.disabledFor>0?.12f:t.slowFor>0?.04f:0;Flash(a,status>0?new Color(.17f,.35f,.5f)*status:Color.black);if(pads.TryGetValue(t.pad,out var pad))pad.GetComponent<SphereCollider>().enabled=false;}RemoveMissing(towers,seen);
   seen.Clear();foreach(var e in game.enemies){seen.Add(e.id);if(!enemies.TryGetValue(e.id,out var a)){string path=string.IsNullOrEmpty(e.boss)?"Carrot/Models/Enemies/"+(e.kind=="fragment"?"crystal":e.kind):"Carrot/Models/Bosses/"+e.boss;a=Spawn(path,world,e.kind,1);if(e.kind=="fragment"){a.modelScale*=.45f;a.model.localScale=a.modelScale;}Clickable(a,"enemy",e.id,string.IsNullOrEmpty(e.boss)?.85f:2.1f);enemies[e.id]=a;}bool boss=!string.IsNullOrEmpty(e.boss);Vector3 position=e.position;float bob=0;if(e.air)bob=.7f+Mathf.Sin(e.age*6)*.07f;else if(e.kind=="nibble")bob=Mathf.Abs(Mathf.Sin(e.age*6))*.075f;else if(e.kind=="swarm")bob=Mathf.Abs(Mathf.Sin(e.age*7))*.04f;position.y+=bob+.03f;if(e.hidden)position.y-=.4f;a.root.transform.position=position;if(a.shadow!=null){a.shadow.position=e.position+Vector3.up*.062f;a.shadow.gameObject.SetActive(e.alive&&!e.hidden);}Vector3 direction=e.direction;direction.y=0;if(direction.sqrMagnitude>.0001f)a.root.transform.rotation=Quaternion.Slerp(a.root.transform.rotation,Quaternion.LookRotation(direction),dt*10);a.hitRemaining=Mathf.Max(0,a.hitRemaining-dt);float hit=a.hitRemaining/.2f;if(!e.alive)a.deadClock+=dt;float scale=e.alive?1:Mathf.Clamp01(1-Mathf.Max(e.deadFor,a.deadClock)/.8f);Vector3 stretch=Vector3.one;if(e.kind=="swarm")stretch=new Vector3(1+Mathf.Sin(e.age*7)*.1f,1-Mathf.Sin(e.age*7)*.12f,1+Mathf.Sin(e.age*7)*.1f);if(hit>0)stretch+=new Vector3(.07f,-.10f,.07f)*hit;if(e.castRemaining>0){stretch+=new Vector3(-.025f,.045f,-.025f)*Mathf.Sin(clock*5);if(e.boss=="garden")a.model.localRotation=Quaternion.Euler(-Mathf.Sin(clock*4)*5,0,0)*a.modelRotation;else if(e.boss=="frost")a.model.localRotation=Quaternion.Euler(-8,0,0)*a.modelRotation;}else a.model.localRotation=Quaternion.Euler(e.alive?Mathf.Sin(e.age*4)*1.2f:Mathf.Lerp(0,65,1-scale),0,0)*a.modelRotation;a.model.localScale=Vector3.Scale(a.modelScale,stretch)*Mathf.Max(.001f,scale);if(a.animation!=null)Animate(a,!e.alive?"death":a.hitRemaining>0?"hit":e.biteRemaining>0||e.castRemaining>0?"attack":"walk",dt==0||e.speed<=0&&e.castRemaining<=0?0:game.speed);float flash=Mathf.Max(0,hit)*.16f;Color emission=new Color(flash,flash*.65f,flash*.3f);if(e.hidden)emission=new Color(.015f,.014f,.01f);if(e.castRemaining>0)emission+=CarrotEffects.Tone(e.ability)*(.025f+.025f*Mathf.Sin(clock*8));Flash(a,emission);var col=a.root.GetComponent<Collider>();col.enabled=e.alive&&!e.hidden;}
   RemoveMissing(enemies,seen);seen.Clear();foreach(var b in game.blockers){seen.Add(b.id);if(!blockers.TryGetValue(b.id,out var a)){a=CreateBlocker(b);blockers[b.id]=a;}a.root.transform.position=b.position+Vector3.up*.015f;}RemoveMissing(blockers,seen);
   foreach(var pair in pads){bool occupied=false;foreach(var t in game.towers)if(t.pad==pair.Key){occupied=true;break;}if(!occupied)foreach(var b in game.blockers)if(b.pad==pair.Key){occupied=true;break;}pair.Value.GetComponent<SphereCollider>().enabled=!occupied;}
  }
  Actor CreateBlocker(BlockerState b){var root=new GameObject("Scenery "+b.kind);root.transform.SetParent(world,false);var material=Material("block-"+b.kind,b.kind=="root"?new Color(.39f,.4f,.18f):game.level.biome=="frost"?new Color(.73f,.84f,.91f):new Color(.52f,.43f,.27f),b.kind=="root"?2:1);if(b.kind=="root"){for(int i=0;i<5;i++){float angle=i*Mathf.PI*2/5;var twig=Primitive("Snare knot",PrimitiveType.Capsule,new Vector3(Mathf.Cos(angle)*.15f,.25f,Mathf.Sin(angle)*.15f),new Vector3(.13f,.32f,.13f),material,root.transform);twig.transform.localRotation=Quaternion.Euler(32,angle*Mathf.Rad2Deg,24);}}else{GameObject prefab=null;if(!realNature.TryGetValue(b.kind.Contains("stump")?"Stump":"MossRockA",out prefab))foreach(var n in nature)if(n.name.ToLowerInvariant().Contains(b.kind.Contains("stump")?"stump":"rock")){prefab=n;break;}if(prefab!=null){var model=Instantiate(prefab,root.transform);float h=BoundsOf(model).size.y;model.transform.localScale*=.6f/Mathf.Max(.1f,h);model.transform.position-=Vector3.up*BoundsOf(model).min.y;foreach(var c in model.GetComponentsInChildren<Collider>())Destroy(c);}else{for(int i=0;i<3;i++){var rock=Primitive("Mossy obstacle",PrimitiveType.Sphere,new Vector3((i-1)*.15f,.2f+i*.05f,0),new Vector3(.4f,.45f,.43f),material,root.transform);rock.transform.localRotation=Quaternion.Euler(i*18,i*44,16);}}}var a=new Actor{root=root,model=root.transform,kind=b.kind,modelScale=Vector3.one,renderers=root.GetComponentsInChildren<Renderer>()};Clickable(a,"blocker",b.id,.75f);return a;}
  void RemoveMissing(Dictionary<int,Actor> actors,HashSet<int> ids){removeIds.Clear();foreach(var item in actors)if(!ids.Contains(item.Key))removeIds.Add(item.Key);foreach(int id in removeIds){Destroy(actors[id].root);actors.Remove(id);}}
  void Flash(Actor actor,Color c){float value=c.maxColorComponent;if(Mathf.Abs(actor.flash-value)<.003f)return;actor.flash=value;properties.Clear();properties.SetColor("_EmissionColor",c);foreach(var r in actor.renderers)if(r!=null)r.SetPropertyBlock(value<.001f?null:properties);}
  void Animate(Actor a,string action,float speed){string requested=null;foreach(AnimationState state in a.animation){string n=state.name.ToLowerInvariant();bool match=action=="walk"?(n.Contains("walk")||n.Contains("run")||n.Contains("fly")):action=="hit"?(n.Contains("hit")||n.Contains("damage")):action=="death"?(n.Contains("death")||n.Contains("die")):(n.Contains("attack")||n.Contains("punch")||n.Contains("bite")||n.Contains("headbutt"));if(match){requested=state.name;break;}}if(requested==null)foreach(AnimationState state in a.animation){if(state.name.ToLowerInvariant().Contains("idle")){requested=state.name;break;}}if(requested!=null&&requested!=a.currentClip){a.currentClip=requested;a.animation[requested].wrapMode=action=="death"?WrapMode.ClampForever:WrapMode.Loop;a.animation.CrossFade(requested,.12f);}foreach(AnimationState state in a.animation)state.speed=speed;}
  void UpdateCarrot(float dt){if(carrot==null)return;carrotHit=Mathf.Max(0,carrotHit-dt);bool hurt=carrotHit>0,lost=game.phase=="lost",won=game.phase=="won";SetFace(hurt||lost,won);float idle=Mathf.Sin(clock*2)*.012f;float hit=Mathf.Clamp01(carrotHit/.55f);carrot.model.localScale=Vector3.Scale(carrot.modelScale,new Vector3(1+hit*.13f,1-hit*.16f+idle,1+hit*.13f));carrot.model.localRotation=Quaternion.Euler(hit*-8,0,Mathf.Sin(hit*17)*hit*12+(won?Mathf.Sin(clock*9)*5:0))*carrot.modelRotation;carrot.root.transform.position=carrotPosition+Vector3.up*(.02f+(won?Mathf.Abs(Mathf.Sin(clock*5))*.14f:0));if(carrot.shadow!=null)carrot.shadow.position=carrotPosition+Vector3.up*.06f;var leaves=Find(carrot.model,"Leaves");if(leaves!=null)RotatePart(leaves,Quaternion.Euler(Mathf.Sin(clock*2.4f)*4+hit*16,0,Mathf.Sin(clock*1.6f)*3));var patch=Find(carrot.model,"BitePatch");if(patch!=null)patch.gameObject.SetActive(game.health<10);var left=Find(carrot.model,"ArmL");var right=Find(carrot.model,"ArmR");if(left!=null)RotatePart(left,Quaternion.Euler(0,0,won?-45+Mathf.Sin(clock*8)*12:hurt?-22:Mathf.Sin(clock*2)*3));if(right!=null)RotatePart(right,Quaternion.Euler(0,0,won?45-Mathf.Sin(clock*8)*12:hurt?22:-Mathf.Sin(clock*2)*3));}
  void RotatePart(Transform part,Quaternion offset){if(!restRotations.TryGetValue(part,out var rest)){rest=part.localRotation;restRotations[part]=rest;}part.localRotation=rest*offset;}
  void SetFace(bool hurt,bool happy){if(carrot==null)return;foreach(var name in new[]{"MouthSmile","MouthHurt","MouthHappy"}){var part=Find(carrot.model,name);if(part!=null)part.gameObject.SetActive(name=="MouthHurt"?hurt:name=="MouthHappy"?happy&&!hurt:!hurt&&!happy);}float blink=Mathf.Pow(Mathf.Max(0,Mathf.Sin(clock*.8f)),35);foreach(var name in new[]{"EyeL","EyeR"}){var eye=Find(carrot.model,name);if(eye!=null){if(!eyeScales.TryGetValue(eye,out var rest)){rest=eye.localScale;eyeScales[eye]=rest;}eye.localScale=Vector3.Scale(rest,new Vector3(1,hurt?.24f:1-blink*.85f,1));}}}
  void OnEffect(CarrotEvent e){
   if(e.type=="level"){levelId=-1;return;}
   // Combat positions lie on the ground; the render event aims at the physical muzzle and airborne body.
   var visual=new CarrotEvent(e.type,e.kind,e.position,e.to,e.id,e.target,e.tier,e.value,e.duration);
   if(e.type=="shot"){
    if(towers.TryGetValue(e.id,out var source)&&Vector3.Distance(source.root.transform.position-Vector3.up*.02f,e.position)<.3f){
     if(source.muzzle!=null)visual.position=source.muzzle.position-Vector3.up*.72f;
     else visual.position=e.position+Vector3.up*.25f;
    }else visual.position=AirPoint(e.position,e.id);
    visual.to=AirPoint(e.to,e.target);
   }else if(e.type=="hit"||e.type=="impact"){
    visual.position=AirPoint(e.position,e.target);visual.to=AirPoint(e.to,e.target);
   }else if(e.type=="ability"&&e.kind=="prismFocus")visual.to=AirPoint(e.to,e.target);
   effects.Handle(visual);sound.Handle(e);
   if(e.type=="ability"&&e.kind=="rewind"&&enemies.TryGetValue(e.target,out var rewinding))effects.Echo(rewinding.root,e.position,e.to,e.duration);
   if(e.type=="bossEnter"){bossIntro=2.6f;bossFocus=e.position;}
   if(e.type=="carrotHit")carrotHit=.6f;
   if(e.type=="hit"&&enemies.TryGetValue(e.target,out var a)){a.hitRemaining=.2f;sound.Creature(a.kind,"hit",e.position);}
  }
  Vector3 AirPoint(Vector3 p,int preferred){
   foreach(var enemy in game.enemies){if(!enemy.air)continue;if(enemy.id!=preferred&&Vector3.Distance(enemy.position,p)>.18f)continue;if(Vector3.Distance(enemy.position,p)>.6f)continue;return p+Vector3.up*(.7f+Mathf.Sin(enemy.age*6)*.07f);}
   return p;
  }
  LineRenderer CreateRing(string name,Color color,float width){var go=new GameObject(name);go.transform.SetParent(transform,false);var line=go.AddComponent<LineRenderer>();line.sharedMaterial=new Material(Shader.Find("Carrot/FxAdditive"));line.sharedMaterial.SetColor("_Color",Color.white);line.startColor=line.endColor=color;line.positionCount=65;line.loop=true;line.useWorldSpace=true;line.widthMultiplier=width;line.shadowCastingMode=ShadowCastingMode.Off;line.receiveShadows=false;line.enabled=false;materials["ring-"+name]=line.sharedMaterial;return line;}
  void UpdateSelection(){Vector3 p=Vector3.zero;float range=0,radius=.49f;bool valid=false;if(game.selectionType=="pad"&&game.selectionId>=0&&game.selectionId<game.level.pads.Length){p=game.level.pads[game.selectionId];var preview=CarrotData.Tower(game.PreviewKind);if(preview!=null)range=preview.range[0];valid=true;}else if(game.selectionType=="tower"){foreach(var t in game.towers)if(t.id==game.selectionId){p=t.position;range=CarrotData.Tower(t.kind).range[t.tier-1];valid=true;break;}}else if(game.selectionType=="enemy"){foreach(var e in game.enemies)if(e.id==game.selectionId&&e.alive){p=e.position;radius=string.IsNullOrEmpty(e.boss)?.4f:.85f;valid=true;break;}}else if(game.selectionType=="blocker"){foreach(var b in game.blockers)if(b.id==game.selectionId){p=b.position;valid=true;break;}}selectionRing.enabled=valid;rangeRing.enabled=valid&&range>0;if(valid){PlotRing(selectionRing,p,radius+.015f*Mathf.Sin(clock*4),.16f);if(range>0)PlotRing(rangeRing,p,range,.12f);}}
  static void PlotRing(LineRenderer l,Vector3 p,float radius,float y){for(int i=0;i<65;i++){float angle=i*Mathf.PI*2/64;l.SetPosition(i,p+new Vector3(Mathf.Cos(angle)*radius,y,Mathf.Sin(angle)*radius));}}
  public void ResetView(string unused){targetZoom=1;targetPan=Vector3.zero;pointerDown=dragging=false;pinchDistance=0;}
  void FitCamera(){
   lastWidth=Screen.width;lastHeight=Screen.height;
   #if UNITY_WEBGL && !UNITY_EDITOR
   float cssWidth=Carrot_CanvasCSSWidth();inputPixelScale=cssWidth>0?Screen.width/cssWidth:1;
   #endif
   bool portrait=GameCamera.aspect<.85f;
   if(portrait!=portraitCamera){zoom=targetZoom=1;pan=targetPan=Vector3.zero;pointerDown=dragging=false;pinchDistance=0;}
   portraitCamera=portrait;cameraAngle=portrait?Quaternion.Euler(62,88,0):Quaternion.Euler(34,-9,0);cameraTarget=new Vector3(0,.35f,.2f);fitDistance=0;
   float tangent=Mathf.Tan(GameCamera.fieldOfView*Mathf.Deg2Rad*.5f),aspect=Mathf.Max(.3f,GameCamera.aspect);
   if(portrait){
    // Rotate the long world axis into the tall viewport, then fit actual gameplay rather than scenery.
    Vector3 min=new Vector3(100,0,100),max=new Vector3(-100,0,-100);
    foreach(var route in game.level.routes)foreach(var point in route){min=Vector3.Min(min,point);max=Vector3.Max(max,point);}
    foreach(var point in game.level.pads){min=Vector3.Min(min,point);max=Vector3.Max(max,point);}
    cameraTarget=(min+max)*.5f+Vector3.up*.40f;
    float actorHeight=string.IsNullOrEmpty(game.level.boss)?1.8f:2.65f;
    foreach(var route in game.level.routes)foreach(var point in route)FitEnvelope(point,.66f,actorHeight,tangent,aspect,.94f,.72f);
    foreach(var point in game.level.pads)FitEnvelope(point,.57f,1.85f,tangent,aspect,.94f,.72f);
    fitDistance+=.2f;
   }else{
    for(int x=-1;x<=1;x+=2)for(int z=-1;z<=1;z+=2)for(int y=0;y<=1;y++){
     Vector3 local=Quaternion.Inverse(cameraAngle)*(new Vector3(x*7.65f,y*2.25f,z*5.65f)-cameraTarget);
     fitDistance=Mathf.Max(fitDistance,Mathf.Max(Mathf.Abs(local.y)/tangent,Mathf.Abs(local.x)/(tangent*aspect))-local.z);
    }
    fitDistance+=.9f;
   }
  }
  void FitEnvelope(Vector3 point,float radius,float height,float tangent,float aspect,float safeX,float safeY){
   for(int x=-1;x<=1;x+=2)for(int z=-1;z<=1;z+=2)for(int y=0;y<=1;y++){
    Vector3 local=Quaternion.Inverse(cameraAngle)*(point+new Vector3(x*radius,y*height,z*radius)-cameraTarget);
    fitDistance=Mathf.Max(fitDistance,Mathf.Max(Mathf.Abs(local.y)/(tangent*safeY),Mathf.Abs(local.x)/(tangent*aspect*safeX))-local.z);
   }
  }
  void UpdateCamera(float dt){
   if(Screen.width!=lastWidth||Screen.height!=lastHeight)FitCamera();zoom=Mathf.Lerp(zoom,targetZoom,1-Mathf.Exp(-dt*10));pan=Vector3.Lerp(pan,targetPan,1-Mathf.Exp(-dt*10));
   if(!game.paused){shake=Mathf.Max(0,shake-dt*.6f);bossIntro=Mathf.Max(0,bossIntro-dt);}float intro=Mathf.Sin((bossIntro/2.6f)*Mathf.PI);
   Vector3 offset=new Vector3(Mathf.Sin(clock*67),Mathf.Cos(clock*83),0)*shake;
   GameCamera.transform.rotation=cameraAngle;GameCamera.transform.position=cameraTarget+pan-(cameraAngle*Vector3.forward)*(fitDistance/(zoom*(1+intro*.035f)))+offset+new Vector3(bossFocus.x,0,bossFocus.z)*intro*.025f;
   if(carrot!=null){Vector3 face=GameCamera.transform.position-carrotPosition;face.y=0;if(face.sqrMagnitude>.01f)carrot.root.transform.rotation=Quaternion.Slerp(carrot.root.transform.rotation,Quaternion.LookRotation(face)*Quaternion.Euler(0,180,0),1-Mathf.Exp(-dt*10));}
  }
  bool GroundPoint(Vector2 screen,out Vector3 point){var ray=GameCamera.ScreenPointToRay(screen);var plane=new Plane(Vector3.up,Vector3.zero);if(plane.Raycast(ray,out var distance)){point=ray.GetPoint(distance);return true;}point=Vector3.zero;return false;}
  void ClampPan(){float fraction=Mathf.Max(0,1-1/targetZoom);targetPan.x=Mathf.Clamp(targetPan.x,-7.5f*fraction,7.5f*fraction);targetPan.z=Mathf.Clamp(targetPan.z,-5.5f*fraction,5.5f*fraction);targetPan.y=0;if(targetZoom<=1.015f)targetPan=Vector3.zero;}
  void UpdateInput(){
   if(Input.touchCount>=2){
    Touch a=Input.GetTouch(0),b=Input.GetTouch(1);float distance=Vector2.Distance(a.position,b.position);Vector2 midpoint=(a.position+b.position)*.5f;
    if(pinchDistance>0){targetZoom=Mathf.Clamp(targetZoom*distance/pinchDistance,1,portraitCamera?2.5f:2.1f);Vector2 previous=midpoint-(a.deltaPosition+b.deltaPosition)*.5f;if(targetZoom>1.015f&&GroundPoint(previous,out var from)&&GroundPoint(midpoint,out var to))targetPan+=from-to;ClampPan();}
    pinchDistance=distance;pointerDown=false;dragging=false;suppressTouchClick=true;return;
   }
   pinchDistance=0;if(suppressTouchClick){if(Input.touchCount==0)suppressTouchClick=false;else return;}
   bool down=Input.GetMouseButtonDown(0),held=Input.GetMouseButton(0),up=Input.GetMouseButtonUp(0);Vector2 p=Input.mousePosition;
   if(Input.touchCount==1){var touch=Input.GetTouch(0);p=touch.position;down=touch.phase==TouchPhase.Began;held=touch.phase==TouchPhase.Moved||touch.phase==TouchPhase.Stationary||down;up=touch.phase==TouchPhase.Ended;if(touch.phase==TouchPhase.Canceled){pointerDown=false;return;}}
   if(down){pointerStart=pointerPrevious=p;pointerDown=true;dragging=false;sound.Unlock();}
   float dragThreshold=(portraitCamera?8:10)*inputPixelScale;
   if(held&&pointerDown){if((p-pointerStart).sqrMagnitude>dragThreshold*dragThreshold)dragging=true;if(dragging&&targetZoom>1.015f&&GroundPoint(pointerPrevious,out var from)&&GroundPoint(p,out var to)){targetPan+=from-to;ClampPan();}pointerPrevious=p;}
   if(up&&pointerDown){pointerDown=false;if(!dragging)SelectAt(p);}
   float scroll=Input.mouseScrollDelta.y;if(Mathf.Abs(scroll)>.01f){targetZoom=Mathf.Clamp(targetZoom+scroll*.12f,1,portraitCamera?2.5f:2.1f);ClampPan();}
  }
  void SelectAt(Vector2 point){
   Ray ray=GameCamera.ScreenPointToRay(point);var hits=Physics.RaycastAll(ray,100);Array.Sort(hits,(a,b)=>a.distance.CompareTo(b.distance));
   foreach(var hit in hits){var target=hit.collider.GetComponentInParent<CarrotClickable>();if(target!=null){game.Select(target.type,target.id);return;}}
   if(portraitCamera){
    // Screen-space padding makes small clearings finger-sized without overlapping world colliders.
    float best=18*inputPixelScale;best*=best;int nearest=-1;
    foreach(var pair in pads){var collider=pair.Value.GetComponent<SphereCollider>();if(collider==null||!collider.enabled)continue;Vector3 p=GameCamera.WorldToScreenPoint(game.level.pads[pair.Key]+Vector3.up*.12f);if(p.z<=0)continue;float distance=((Vector2)p-point).sqrMagnitude;if(distance<best){best=distance;nearest=pair.Key;}}
    if(nearest>=0){game.Select("pad",nearest);return;}
   }
   game.Select("",-1);
  }
  static GameObject Primitive(string name,PrimitiveType type,Vector3 p,Vector3 scale,Material mat,Transform parent,bool small=false){var go=CarrotMeshes.Create(type,name,small);go.transform.SetParent(parent,false);go.transform.localPosition=p;go.transform.localScale=scale;var collider=go.GetComponent<Collider>();if(collider!=null)Destroy(collider);var renderer=go.GetComponent<Renderer>();renderer.sharedMaterial=mat;renderer.shadowCastingMode=ShadowCastingMode.On;renderer.receiveShadows=true;return go;}
  GameObject MeshObject(string name,Mesh mesh,Material mat,Transform parent){createdMeshes.Add(mesh);var go=new GameObject(name);go.transform.SetParent(parent,false);go.AddComponent<MeshFilter>().sharedMesh=mesh;var renderer=go.AddComponent<MeshRenderer>();renderer.sharedMaterial=mat;renderer.shadowCastingMode=ShadowCastingMode.On;renderer.receiveShadows=true;return go;}
  static Mesh Disc(float radius,int segments){var v=new Vector3[segments+1];var uv=new Vector2[v.Length];var c=new Color[v.Length];var t=new int[segments*3];v[0]=Vector3.zero;uv[0]=Vector2.one*.5f;c[0]=Color.white;for(int i=0;i<segments;i++){float a=i*Mathf.PI*2/segments;v[i+1]=new Vector3(Mathf.Cos(a)*radius,0,Mathf.Sin(a)*radius);uv[i+1]=new Vector2(Mathf.Cos(a),Mathf.Sin(a))*.5f+Vector2.one*.5f;c[i+1]=Color.white;t[i*3]=0;t[i*3+1]=(i+1)%segments+1;t[i*3+2]=i+1;}var m=new Mesh{name="Circular surface"};m.vertices=v;m.uv=uv;m.colors=c;m.triangles=t;m.RecalculateNormals();return m;}
  static Mesh GridPlane(int nx,int nz,float width,float depth){var v=new Vector3[(nx+1)*(nz+1)];var t=new int[nx*nz*6];int n=0;for(int z=0;z<=nz;z++)for(int x=0;x<=nx;x++){int k=z*(nx+1)+x;v[k]=new Vector3((x/(float)nx-.5f)*width,0,(z/(float)nz-.5f)*depth);if(x<nx&&z<nz){t[n++]=k;t[n++]=k+nx+1;t[n++]=k+1;t[n++]=k+1;t[n++]=k+nx+1;t[n++]=k+nx+2;}}var m=new Mesh{name="Water mesh"};m.vertices=v;m.triangles=t;m.RecalculateNormals();return m;}
 }
 public static class CarrotMeshes {
  static readonly Dictionary<PrimitiveType,Mesh> meshes=new Dictionary<PrimitiveType,Mesh>();
  static readonly Dictionary<PrimitiveType,Mesh> smallMeshes=new Dictionary<PrimitiveType,Mesh>();
  public static GameObject Create(PrimitiveType type,string name,bool small=false){var go=new GameObject(name);go.AddComponent<MeshFilter>().sharedMesh=Get(type,small);go.AddComponent<MeshRenderer>();return go;}
  public static Mesh Get(PrimitiveType type,bool small=false){var cache=small?smallMeshes:meshes;if(cache.TryGetValue(type,out var cached))return cached;var vertices=new List<Vector3>();var uv=new List<Vector2>();var triangles=new List<int>();
   if(type==PrimitiveType.Quad){vertices.AddRange(new[]{new Vector3(-.5f,-.5f,0),new Vector3(.5f,-.5f,0),new Vector3(.5f,.5f,0),new Vector3(-.5f,.5f,0)});uv.AddRange(new[]{Vector2.zero,Vector2.right,Vector2.one,Vector2.up});triangles.AddRange(new[]{0,2,1,0,3,2});}
   else if(type==PrimitiveType.Cube){Vector3[] normals={Vector3.forward,Vector3.back,Vector3.right,Vector3.left,Vector3.up,Vector3.down};foreach(var normal in normals){Vector3 side=Vector3.Cross(normal,Mathf.Abs(normal.y)>.5f?Vector3.forward:Vector3.up).normalized*.5f,up=Vector3.Cross(side,normal).normalized*.5f,center=normal*.5f;int k=vertices.Count;vertices.AddRange(new[]{center-side-up,center+side-up,center+side+up,center-side+up});uv.AddRange(new[]{Vector2.zero,Vector2.right,Vector2.one,Vector2.up});triangles.AddRange(new[]{k,k+2,k+1,k,k+3,k+2});}}
   else{
    int sides=small?8:24,rings=small?5:16;bool cylinder=type==PrimitiveType.Cylinder;bool capsule=type==PrimitiveType.Capsule;
    for(int y=0;y<=rings;y++){float t=y/(float)rings,angle=t*Mathf.PI;float radius=cylinder?.5f:Mathf.Sin(angle)*.5f;float height=cylinder?1-t*2:Mathf.Cos(angle)*.5f+(capsule?(t<.5f?.5f:-.5f):0);for(int x=0;x<=sides;x++){float a=x/(float)sides*Mathf.PI*2;vertices.Add(new Vector3(Mathf.Cos(a)*radius,height,Mathf.Sin(a)*radius));uv.Add(new Vector2(x/(float)sides,t));if(y<rings&&x<sides){int k=y*(sides+1)+x;triangles.AddRange(new[]{k,k+1,k+sides+1,k+1,k+sides+2,k+sides+1});}}}
    if(cylinder){for(int cap=0;cap<2;cap++){float y=cap==0?1:-1;int center=vertices.Count;vertices.Add(new Vector3(0,y,0));uv.Add(Vector2.one*.5f);for(int i=0;i<=sides;i++){float a=i*Mathf.PI*2/sides;vertices.Add(new Vector3(Mathf.Cos(a)*.5f,y,Mathf.Sin(a)*.5f));uv.Add(new Vector2(Mathf.Cos(a),Mathf.Sin(a))*.5f+Vector2.one*.5f);if(i<sides){if(cap==0)triangles.AddRange(new[]{center,center+i+2,center+i+1});else triangles.AddRange(new[]{center,center+i+1,center+i+2});}}}}
   }
   var mesh=new Mesh{name="Carrot mesh "+type};mesh.SetVertices(vertices);mesh.SetUVs(0,uv);mesh.SetTriangles(triangles,0);var colors=new Color[vertices.Count];for(int i=0;i<colors.Length;i++)colors[i]=Color.white;mesh.colors=colors;mesh.RecalculateNormals();mesh.RecalculateBounds();cache[type]=mesh;return mesh;
  }
 }

}
