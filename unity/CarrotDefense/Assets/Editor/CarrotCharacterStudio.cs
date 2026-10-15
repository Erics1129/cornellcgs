#if UNITY_EDITOR
using System;
using System.Collections.Generic;
using System.Globalization;
using System.IO;
using System.Linq;
using System.Text;
using UnityEditor;
using UnityEditor.SceneManagement;
using UnityEngine;
using UnityEngine.Rendering;
using UnityEngine.Rendering.Universal;
using UnityEngine.SceneManagement;

namespace CarrotTD {
/// <summary>
/// Character stream review tools, run with graphics (no -nographics) through carrot-unity-build.mjs --render.
/// Models(): every actor prefab rendered alone under the garden key/fill/ambient at the game camera pitch (review sheets).
/// Portraits(): every tower tier, creature, miniboss and boss rendered with the real Storybook shader under one 3/4 key light on a transparent background.
/// Play(): enters play mode on the shipped scene, runs a scripted shot list against the real CarrotGame/CarrotView and saves frames.
/// Inventory(): bone names, clip names, triangle counts and material categories per prefab (characters.md).
/// Output directory comes from -studioOut; the shot list for Play() from -studioPlan. Nothing here ships: it is Editor-only.
/// </summary>
[InitializeOnLoad]
public static class CarrotCharacterStudio {
 const string Root="Assets/Resources/Carrot/";
 const string PlanKey="CarrotStudio.Plan",OutKey="CarrotStudio.Out",IndexKey="CarrotStudio.Index",WaitKey="CarrotStudio.Wait";
 public static readonly string[] Towers={"seed","frost","mortar","prism","storm","blossom","starfruit","gravity","book","thunder","bamboo","chili","lotus","magnet","orchid","mushroom","cactus","clockflower","dragonfruit","moonflower"};
 public static readonly string[] Creatures={"nibble","dash","shell","swarm","moth","shaman","burrow","crystal","mite","beetle","slug","wisp","bat","scarab","firefly","sporeling","tinyZombie","riftling","shardling","mimic"};
 public static readonly string[] Minibosses={"warDrummer","frostHerald","witherPriest","stormWarden","graveCaller","mirrorKnight","riftStalker","mossGolem","emberBoar","venomQueen","ironSnail","lanternLeech","chronoMoth","thornBeast","portalSentinel"};
 public static readonly string[] Bosses={"garden","marsh","frost","orchard","tornado","zombie","eyeball","portal"};
 // Fronts: the original creatures and guardians face +Z (the view yaws them along their path); the Portal-era creatures, minibosses and towers face -Z.
 static readonly HashSet<string> PlusZ=new HashSet<string>{"nibble","dash","shell","swarm","moth","shaman","burrow","crystal","garden","marsh","frost","orchard","zombie"};
 static float FrontYaw(string group,string name,float turn){return group=="tower"||group=="hero"?-turn:PlusZ.Contains(name)&&group!="tower"?180-turn:-turn;}

 static string Arg(string name,string fallback=null){var args=Environment.GetCommandLineArgs();for(int i=0;i<args.Length-1;i++)if(args[i]==name)return args[i+1];return fallback;}
 static string OutDir(){string dir=Arg("-studioOut",Path.GetFullPath("../../output/carrot-studio"));Directory.CreateDirectory(dir);return dir;}

 // ---------- shared scene helpers ----------
 sealed class Stage:IDisposable {
  public Scene scene;public Camera camera;public Light key,fill;public readonly List<UnityEngine.Object> owned=new List<UnityEngine.Object>();public Volume volume;
  public void Dispose(){foreach(var o in owned)if(o!=null)UnityEngine.Object.DestroyImmediate(o);foreach(var go in scene.GetRootGameObjects())UnityEngine.Object.DestroyImmediate(go);}
 }
 static Stage NewStage(bool portrait){
  var s=new Stage();s.scene=EditorSceneManager.NewScene(NewSceneSetup.EmptyScene,NewSceneMode.Single);
  RenderSettings.ambientMode=AmbientMode.Trilight;RenderSettings.ambientIntensity=1;RenderSettings.fog=false;
  RenderSettings.ambientSkyColor=new Color(.40f,.62f,.86f);RenderSettings.ambientEquatorColor=new Color(.72f,.82f,.90f)*.9f;RenderSettings.ambientGroundColor=new Color(.20f,.26f,.14f)*.8f;
  var environment=Resources.Load<Cubemap>("Carrot/Textures/Environment");if(environment!=null){RenderSettings.defaultReflectionMode=DefaultReflectionMode.Custom;RenderSettings.customReflectionTexture=environment;RenderSettings.reflectionIntensity=.75f;}
  Shader.SetGlobalFloat("_SnowAmount",0);Shader.SetGlobalVectorArray("_WetCenters",new Vector4[2]);Shader.SetGlobalFloat("_CarrotGust",1);Shader.SetGlobalFloat("_CarrotTime",0);Shader.SetGlobalFloat("_CarrotPusherCount",0);
  Shader.SetGlobalVector("_CarrotHeightFog",Vector4.zero);
  s.key=new GameObject("Key").AddComponent<Light>();s.key.type=LightType.Directional;s.key.shadows=LightShadows.Soft;s.key.shadowStrength=.92f;
  s.fill=new GameObject("Fill").AddComponent<Light>();s.fill.type=LightType.Directional;s.fill.shadows=LightShadows.None;
  if(portrait){
   // One consistent 3/4 key from camera-left above, a cool sky fill from behind-right, so every portrait shares a light rig.
   s.key.color=new Color(1,.93f,.82f);s.key.intensity=2.4f;s.key.transform.rotation=Quaternion.Euler(38,-42,0);
   s.fill.color=new Color(.58f,.72f,.92f);s.fill.intensity=.55f;s.fill.transform.rotation=Quaternion.Euler(-10,140,0);
  }else{
   // The garden biome rig from CarrotView.ApplyBiomeLighting.
   s.key.color=new Color(1,.89f,.72f);s.key.intensity=2.6f;s.key.transform.rotation=Quaternion.Euler(52,-28,0);
   s.fill.color=new Color(.56f,.70f,.85f);s.fill.intensity=.3f;s.fill.transform.rotation=Quaternion.Euler(-28,150,0);
  }
  RenderSettings.sun=s.key;
  var profile=Resources.Load<VolumeProfile>("Carrot/Volumes/garden");
  if(profile!=null){var vgo=new GameObject("Grade");s.volume=vgo.AddComponent<Volume>();s.volume.isGlobal=true;s.volume.sharedProfile=profile;var live=s.volume.profile;s.owned.Add(live);if(live.TryGet<DepthOfField>(out var dof))dof.active=false;if(live.TryGet<Vignette>(out var vig))vig.active=false;}
  s.camera=new GameObject("Studio camera").AddComponent<Camera>();s.camera.fieldOfView=portrait?24:22;s.camera.nearClipPlane=.03f;s.camera.farClipPlane=60;s.camera.allowHDR=true;s.camera.allowMSAA=false;
  s.camera.clearFlags=CameraClearFlags.SolidColor;s.camera.backgroundColor=portrait?new Color(0,0,0,0):new Color(.075f,.10f,.11f,1);
  var data=s.camera.GetUniversalAdditionalCameraData();data.renderPostProcessing=!portrait;data.antialiasing=AntialiasingMode.None;data.renderShadows=true;data.volumeLayerMask=-1;data.dithering=false;
  return s;
 }
 public static Bounds VisibleBounds(GameObject go){
  // Skinned culling AABBs keep the FBX 100x scale on some rigs, so measure deformed vertices instead.
  bool has=false;var b=new Bounds();
  foreach(var r in go.GetComponentsInChildren<Renderer>()){
   if(!r.enabled||!r.gameObject.activeInHierarchy)continue;
   if(r is SkinnedMeshRenderer skin&&skin.sharedMesh!=null){
    var mesh=skin.sharedMesh;var vertices=mesh.vertices;var weights=mesh.boneWeights;var bind=mesh.bindposes;var bones=skin.bones;
    if(bones==null||bones.Length==0||weights.Length!=vertices.Length){var m=new Mesh();skin.BakeMesh(m,true);foreach(var v in m.vertices){var p=skin.transform.TransformPoint(v);if(!has){b=new Bounds(p,Vector3.zero);has=true;}else b.Encapsulate(p);}UnityEngine.Object.DestroyImmediate(m);continue;}
    var mats=new Matrix4x4[bones.Length];for(int i=0;i<bones.Length;i++)mats[i]=bones[i]!=null?bones[i].localToWorldMatrix*bind[i]:skin.transform.localToWorldMatrix;
    for(int i=0;i<vertices.Length;i+=Math.Max(1,vertices.Length/4000)){var w=weights[i];var v=vertices[i];Vector3 p=Vector3.zero;
     if(w.weight0>0)p+=mats[w.boneIndex0].MultiplyPoint3x4(v)*w.weight0;if(w.weight1>0)p+=mats[w.boneIndex1].MultiplyPoint3x4(v)*w.weight1;if(w.weight2>0)p+=mats[w.boneIndex2].MultiplyPoint3x4(v)*w.weight2;if(w.weight3>0)p+=mats[w.boneIndex3].MultiplyPoint3x4(v)*w.weight3;
     if(!has){b=new Bounds(p,Vector3.zero);has=true;}else b.Encapsulate(p);}
   }else if(r is MeshRenderer){if(!has){b=r.bounds;has=true;}else b.Encapsulate(r.bounds);}
  }
  return has?b:new Bounds(go.transform.position,Vector3.one);
 }
 static void PoseIdle(GameObject go,float t=.35f){
  var animation=go.GetComponentInChildren<Animation>();if(animation==null)return;
  AnimationClip idle=null;foreach(AnimationState s in animation){if(s.name.ToLowerInvariant().Contains("idle")){idle=s.clip;break;}}
  if(idle==null&&animation.clip!=null)idle=animation.clip;if(idle!=null)idle.SampleAnimation(animation.gameObject,Mathf.Min(t,idle.length*.5f));
 }
 static Texture2D Render(Stage s,int w,int h){
  var rt=new RenderTexture(w,h,24,RenderTextureFormat.ARGBHalf,RenderTextureReadWrite.Linear){antiAliasing=1};rt.Create();
  var ldr=new RenderTexture(w,h,0,RenderTextureFormat.ARGB32,RenderTextureReadWrite.sRGB);ldr.Create();
  s.camera.targetTexture=rt;s.camera.aspect=w/(float)h;
  RenderPipeline.SubmitRenderRequest(s.camera,new UniversalRenderPipeline.SingleCameraRequest{destination=rt});
  Graphics.Blit(rt,ldr);
  var old=RenderTexture.active;RenderTexture.active=ldr;var tex=new Texture2D(w,h,TextureFormat.RGBA32,false);tex.ReadPixels(new Rect(0,0,w,h),0,0);tex.Apply();RenderTexture.active=old;
  s.camera.targetTexture=null;rt.Release();ldr.Release();UnityEngine.Object.DestroyImmediate(rt);UnityEngine.Object.DestroyImmediate(ldr);
  return tex;
 }
 static IEnumerable<(string group,string name,string path)> Roster(bool allTiers){
  yield return ("hero","Carrot",Root+"Models/Carrot.prefab");
  foreach(var k in Towers)for(int t=1;t<=5;t++){if(!allTiers&&t!=1&&t!=4&&t!=5)continue;string p=Root+"Models/Towers/"+k+"-"+t+".prefab";if(File.Exists(p))yield return ("tower",k+"-"+t,p);}
  foreach(var k in Creatures)yield return ("creature",k,Root+"Models/Enemies/"+k+".prefab");
  foreach(var k in Minibosses)yield return ("miniboss",k,Root+"Models/Minibosses/"+k+".prefab");
  foreach(var k in Bosses)yield return ("boss",k,Root+"Models/Bosses/"+k+".prefab");
 }

 /// <summary>Review sheets: one PNG per actor at the game camera pitch (34 degrees), garden light, 3/4 yaw.</summary>
 public static void Models(){
  string dir=Path.Combine(OutDir(),"models");Directory.CreateDirectory(dir);string only=Arg("-studioOnly","");
  using(var s=NewStage(false)){
   var ground=GameObject.CreatePrimitive(PrimitiveType.Plane);ground.transform.localScale=Vector3.one*4;var gm=new Material(Shader.Find("Carrot/Storybook"));gm.SetColor("_Color",new Color(.16f,.19f,.12f));gm.SetFloat("_Glossiness",.1f);ground.GetComponent<Renderer>().sharedMaterial=gm;s.owned.Add(gm);
   foreach(var item in Roster(true)){
    if(only!=""&&!only.Split(',').Contains(item.name))continue;
    var prefab=AssetDatabase.LoadAssetAtPath<GameObject>(item.path);if(prefab==null){Debug.LogWarning("STUDIO_MISSING "+item.path);continue;}
    var go=UnityEngine.Object.Instantiate(prefab);go.transform.rotation=Quaternion.Euler(0,FrontYaw(item.group,item.name,float.Parse(Arg("-studioTurn","24"),CultureInfo.InvariantCulture)),0);PoseIdle(go);
    var b=VisibleBounds(go);go.transform.position-=new Vector3(b.center.x,b.min.y,b.center.z);b=VisibleBounds(go);
    float radius=Mathf.Max(b.extents.magnitude,.25f);var dirv=Quaternion.Euler(float.Parse(Arg("-studioPitch","34"),CultureInfo.InvariantCulture),-9,0)*Vector3.forward;
    float dist=radius/Mathf.Sin(s.camera.fieldOfView*.5f*Mathf.Deg2Rad)*1.02f;s.camera.transform.position=b.center-dirv*dist;s.camera.transform.rotation=Quaternion.LookRotation(dirv);
    s.key.shadowNearPlane=.1f;int px=int.Parse(Arg("-studioSize","640"),CultureInfo.InvariantCulture);var tex=Render(s,px,px);File.WriteAllBytes(Path.Combine(dir,item.group+"-"+item.name+".png"),tex.EncodeToPNG());UnityEngine.Object.DestroyImmediate(tex);
    UnityEngine.Object.DestroyImmediate(go);
   }
  }
  Debug.Log("CARROT_STUDIO_MODELS_OK "+dir);
 }

 /// <summary>
 /// Portraits: every id the field guide, build menu and wave track need, rendered with the real Storybook materials under one 3/4 key,
 /// a cool fill and a rim light, on a transparent background. Frames are written as raw linear half floats (&lt;group&gt;-&lt;name&gt;.rgbah,
 /// -studioSize square) so Tools/pack_carrot_portraits.py can tonemap (ACES), downsample and pack them into WebP sheets with exact alpha.
 /// The five tiers of a tower share one camera so growth across tiers reads; every other actor fills its own cell.
 /// </summary>
 public static void Portraits(){
  string dir=Path.Combine(OutDir(),"portraits-raw");Directory.CreateDirectory(dir);string only=Arg("-studioOnly","");int size=int.Parse(Arg("-studioSize","512"),CultureInfo.InvariantCulture);
  var index=new StringBuilder("{\n");bool first=true;
  using(var s=NewStage(true)){
   RenderSettings.ambientIntensity=.72f;
   var rim=new GameObject("Rim").AddComponent<Light>();rim.type=LightType.Directional;rim.color=new Color(.80f,.88f,1f);rim.intensity=.85f;rim.shadows=LightShadows.None;rim.transform.rotation=Quaternion.Euler(24,168,0);
   var dirv=Quaternion.Euler(16,-6,0)*Vector3.forward;var look=Quaternion.LookRotation(dirv);var inv=Quaternion.Inverse(look);float tan=Mathf.Tan(s.camera.fieldOfView*.5f*Mathf.Deg2Rad);
   GameObject Place(string group,string name,string path){var prefab=AssetDatabase.LoadAssetAtPath<GameObject>(path);if(prefab==null){Debug.LogWarning("STUDIO_MISSING "+path);return null;}
    var go=UnityEngine.Object.Instantiate(prefab);go.transform.rotation=Quaternion.Euler(0,FrontYaw(group,name,name=="tornado"||name=="eyeball"||name=="portal"?18:26),0);PoseIdle(go,.4f);
    foreach(var lod in go.GetComponentsInChildren<CarrotTierLod>(true))lod.enabled=false;foreach(var r in go.GetComponentsInChildren<Renderer>(true))r.forceMeshLod=0;
    // Wind shells are drawn over the board in game; on a transparent card they need more coverage to read as a funnel.
    var block=new MaterialPropertyBlock();foreach(var r in go.GetComponentsInChildren<Renderer>(true))if(r.sharedMaterial!=null&&r.sharedMaterial.shader.name=="Carrot/FxAlpha"){block.Clear();block.SetColor("_Color",new Color(1,1,1,1.9f));r.SetPropertyBlock(block);}
    var b=VisibleBounds(go);go.transform.position-=new Vector3(b.center.x,b.min.y,b.center.z);return go;}
   float Fit(Bounds b){float fit=0;for(int x=-1;x<=1;x+=2)for(int y=-1;y<=1;y+=2)for(int z=-1;z<=1;z+=2){var c=inv*(b.center+new Vector3(x*b.extents.x,y*b.extents.y,z*b.extents.z)-b.center);fit=Mathf.Max(fit,Mathf.Max(Mathf.Abs(c.x),Mathf.Abs(c.y))/tan-c.z);}return fit;}
   void Shoot(string group,string name,string path,GameObject go,Bounds frame){
    s.camera.transform.position=frame.center-dirv*Fit(frame)*1.08f;s.camera.transform.rotation=look;
    // Two passes, over black and over white: coverage = 1 - (white - black), so translucent wind shells keep their true alpha
    // (FxAlpha blends its alpha channel with SrcAlpha, which would square the coverage on a transparent target).
    foreach(bool white in new[]{false,true}){
     s.camera.backgroundColor=white?new Color(1,1,1,1):new Color(0,0,0,0);
     var rt=new RenderTexture(size,size,24,RenderTextureFormat.ARGBHalf,RenderTextureReadWrite.Linear){antiAliasing=1};rt.Create();s.camera.targetTexture=rt;s.camera.aspect=1;
     RenderPipeline.SubmitRenderRequest(s.camera,new UniversalRenderPipeline.SingleCameraRequest{destination=rt});
     var old=RenderTexture.active;RenderTexture.active=rt;var tex=new Texture2D(size,size,TextureFormat.RGBAHalf,false,true);tex.ReadPixels(new Rect(0,0,size,size),0,0);tex.Apply();RenderTexture.active=old;s.camera.targetTexture=null;
     File.WriteAllBytes(Path.Combine(dir,group+"-"+name+(white?".w":"")+".rgbah"),tex.GetRawTextureData());UnityEngine.Object.DestroyImmediate(tex);rt.Release();UnityEngine.Object.DestroyImmediate(rt);
    }
    s.camera.backgroundColor=new Color(0,0,0,0);
    index.Append((first?"":",\n")+" \""+group+"-"+name+"\": {\"path\": \""+path+"\", \"size\": "+size+"}");first=false;
   }
   var items=Roster(true).Where(i=>only==""||only.Split(',').Contains(i.name)||only.Split(',').Contains(i.name.Split('-')[0])).ToList();
   // Towers: tiers I-IV share one frame (the union) so growth reads; the Super, with its plinth and halo, gets its own.
   foreach(var kind in items.Where(i=>i.group=="tower").GroupBy(i=>i.name.Substring(0,i.name.LastIndexOf('-')))){
    Bounds frame=new Bounds();bool has=false;
    foreach(var item in kind){if(item.name.EndsWith("-5",StringComparison.Ordinal))continue;var go=Place(item.group,item.name,item.path);if(go==null)continue;var b=VisibleBounds(go);if(!has){frame=b;has=true;}else frame.Encapsulate(b);UnityEngine.Object.DestroyImmediate(go);}
    foreach(var item in kind){var go=Place(item.group,item.name,item.path);if(go==null)continue;Shoot(item.group,item.name,item.path,go,item.name.EndsWith("-5",StringComparison.Ordinal)||!has?VisibleBounds(go):frame);UnityEngine.Object.DestroyImmediate(go);}
   }
   foreach(var item in items.Where(i=>i.group!="tower")){var go=Place(item.group,item.name,item.path);if(go==null)continue;Shoot(item.group,item.name,item.path,go,VisibleBounds(go));UnityEngine.Object.DestroyImmediate(go);}
  }
  File.WriteAllText(Path.Combine(dir,"index.json"),index+"\n}\n");
  Debug.Log("CARROT_STUDIO_PORTRAITS_OK "+dir);
 }

 /// <summary>Per prefab: renderers, triangles, materials, bone names and clip names (one JSON line each).</summary>
 public static void Inventory(){
  string path=Path.Combine(OutDir(),"inventory.jsonl");var lines=new List<string>();
  foreach(var item in Roster(true)){
   var prefab=AssetDatabase.LoadAssetAtPath<GameObject>(item.path);if(prefab==null)continue;
   long tris=0;var meshes=new HashSet<Mesh>();var materials=new SortedSet<string>();var meshNames=new List<string>();
   foreach(var r in prefab.GetComponentsInChildren<Renderer>(true)){Mesh m=r is SkinnedMeshRenderer sk?sk.sharedMesh:r.GetComponent<MeshFilter>()?.sharedMesh;if(m!=null&&meshes.Add(m)){for(int i=0;i<m.subMeshCount;i++)tris+=m.GetIndexCount(i)/3;meshNames.Add(r.name+(r is SkinnedMeshRenderer?"*":""));}foreach(var mat in r.sharedMaterials)if(mat!=null)materials.Add(mat.name);}
   var bones=new SortedSet<string>();foreach(var sk in prefab.GetComponentsInChildren<SkinnedMeshRenderer>(true))if(sk.bones!=null)foreach(var bn in sk.bones)if(bn!=null)bones.Add(bn.name);
   var clips=new List<string>();var anim=prefab.GetComponentInChildren<Animation>(true);if(anim!=null)foreach(AnimationState st in anim)clips.Add(st.name+":"+st.length.ToString("F2",CultureInfo.InvariantCulture));
   string Q(IEnumerable<string> xs)=>"["+string.Join(",",xs.Select(x=>"\""+x.Replace("\"","'")+"\""))+"]";
   var inst=UnityEngine.Object.Instantiate(prefab);var vb=VisibleBounds(inst);UnityEngine.Object.DestroyImmediate(inst);
   string B(Vector3 v)=>"["+v.x.ToString("F4",CultureInfo.InvariantCulture)+","+v.y.ToString("F4",CultureInfo.InvariantCulture)+","+v.z.ToString("F4",CultureInfo.InvariantCulture)+"]";
   lines.Add("{\"group\":\""+item.group+"\",\"name\":\""+item.name+"\",\"min\":"+B(vb.min)+",\"max\":"+B(vb.max)+",\"triangles\":"+tris+",\"materials\":"+Q(materials)+",\"meshes\":"+Q(meshNames)+",\"bones\":"+Q(bones)+",\"clips\":"+Q(clips)+"}");
  }
  File.WriteAllLines(path,lines);Debug.Log("CARROT_STUDIO_INVENTORY_OK "+path+" "+lines.Count);
 }

 /// <summary>Compiles Storybook for the active platform and reports errors plus the variant count (internal ShaderUtil API, read by reflection).</summary>
 public static void ShaderCheck(){
  AssetDatabase.ImportAsset("Assets/Shaders/Storybook.shader",ImportAssetOptions.ForceUpdate);
  var shader=AssetDatabase.LoadAssetAtPath<Shader>("Assets/Shaders/Storybook.shader");
  var messages=ShaderUtil.GetShaderMessages(shader);int errors=0;foreach(var m in messages){Debug.Log("SHADER_MSG "+m.severity+" "+m.message+" line "+m.line+" "+m.platform);if(m.severity==UnityEditor.Rendering.ShaderCompilerMessageSeverity.Error)errors++;}
  ulong variants=0;var method=typeof(ShaderUtil).GetMethod("GetVariantCount",System.Reflection.BindingFlags.NonPublic|System.Reflection.BindingFlags.Static);
  if(method!=null)variants=(ulong)method.Invoke(null,new object[]{shader,false});
  int props=shader.GetPropertyCount();
  // WebGL 2 (GLES3x) compile of the Forward pass under the keyword sets the three quality tiers use.
  var data=ShaderUtil.GetShaderData(shader);var sub=data.GetSubshader(0);
  string[][] sets={new string[0],new[]{"_MAIN_LIGHT_SHADOWS","_SHADOWS_SOFT","_ADDITIONAL_LIGHTS","FOG_LINEAR"},new[]{"_MAIN_LIGHT_SHADOWS","_ADDITIONAL_LIGHTS_VERTEX","FOG_LINEAR"},new[]{"_MAIN_LIGHT_SHADOWS_CASCADE","_SHADOWS_SOFT_HIGH","_ADDITIONAL_LIGHTS","_LIGHT_COOKIES","_SCREEN_SPACE_OCCLUSION","FOG_LINEAR","INSTANCING_ON"}};
  for(int p=0;p<sub.PassCount;p++){var pass=sub.GetPass(p);foreach(var set in sets)foreach(var stage in new[]{UnityEditor.Rendering.ShaderType.Vertex,UnityEditor.Rendering.ShaderType.Fragment}){
   var r=pass.CompileVariant(stage,set,UnityEditor.Rendering.ShaderCompilerPlatform.GLES3x,BuildTarget.WebGL);
   if(!r.Success){errors++;foreach(var m in r.Messages)Debug.Log("SHADER_GLES3 "+pass.Name+" "+stage+" ["+string.Join(" ",set)+"] "+m.severity+" "+m.message+" line "+m.line);}}
   Debug.Log("SHADER_GLES3_PASS "+pass.Name+" ok");}
  Debug.Log("CARROT_STUDIO_SHADER errors="+errors+" hasError="+ShaderUtil.ShaderHasError(shader)+" variants="+variants+" properties="+props+" keywords="+string.Join(",",shader.keywordSpace.keywordNames));
  if(errors>0||ShaderUtil.ShaderHasError(shader))EditorApplication.Exit(4);
 }

 /// <summary>Download-size ledger for this stream: Mesh LOD index overhead per group and the storage size of every texture the stream added.</summary>
 public static void SizeLedger(){
  long lodBytes=0,meshBytes=0;var seen=new HashSet<Mesh>();var byGroup=new Dictionary<string,long>();
  foreach(var item in Roster(true)){var prefab=AssetDatabase.LoadAssetAtPath<GameObject>(item.path);if(prefab==null)continue;
   foreach(var r in prefab.GetComponentsInChildren<Renderer>(true)){Mesh m=r is SkinnedMeshRenderer sk?sk.sharedMesh:r.GetComponent<MeshFilter>()?.sharedMesh;if(m==null||!seen.Add(m))continue;
    meshBytes+=UnityEngine.Profiling.Profiler.GetRuntimeMemorySizeLong(m);int bytes=m.indexFormat==IndexFormat.UInt16?2:4;long extra=0;
    for(int s=0;s<m.subMeshCount;s++)for(int l=1;l<m.lodCount;l++)extra+=m.GetLod(s,l).indexCount*(long)bytes;
    lodBytes+=extra;byGroup[item.group]=(byGroup.TryGetValue(item.group,out var g)?g:0)+extra;}}
  var getSize=Type.GetType("UnityEditor.TextureUtil, UnityEditor")?.GetMethod("GetStorageMemorySizeLong",System.Reflection.BindingFlags.Static|System.Reflection.BindingFlags.Public|System.Reflection.BindingFlags.NonPublic);
  long texBytes=0;var lines=new List<string>();
  foreach(var name in new[]{"MushroomPoreDetail","ChitinPlateDetail","GelRippleDetail","IceFacetDetail","SkinPoreDetail","FurStrandDetail","LeafClusterDetail","FoliageDetail","TornadoStreaks","ZombieHideTint"}){
   var tex=AssetDatabase.LoadAssetAtPath<Texture2D>(Root+"Models/Materials/"+name+".png");if(tex==null)continue;long b=getSize!=null?(long)getSize.Invoke(null,new object[]{tex}):0;texBytes+=b;
   var file=new FileInfo(Root+"Models/Materials/"+name+".png");lines.Add(name+" "+tex.width+"x"+tex.height+" "+tex.format+" storage="+b+" png="+file.Length);}
  // Per-prefab vertex data (stride x vertices, before build-time compression) for the mesh budget.
  var rows=new List<(string,long,int,int)>();var counted=new HashSet<Mesh>();
  foreach(var item in Roster(true)){var prefab=AssetDatabase.LoadAssetAtPath<GameObject>(item.path);if(prefab==null)continue;long bytes=0;int verts=0,tris=0;
   foreach(var r in prefab.GetComponentsInChildren<Renderer>(true)){Mesh m=r is SkinnedMeshRenderer sk?sk.sharedMesh:r.GetComponent<MeshFilter>()?.sharedMesh;if(m==null||!counted.Add(m))continue;int stride=0;for(int st=0;st<4;st++)stride+=m.GetVertexBufferStride(st);bytes+=(long)stride*m.vertexCount;verts+=m.vertexCount;for(int sm=0;sm<m.subMeshCount;sm++)tris+=(int)(m.GetIndexCount(sm)/3);}
   rows.Add((item.group+"-"+item.name,bytes,verts,tris));}
  var mesh0=AssetDatabase.LoadAssetAtPath<GameObject>(Root+"Models/Towers/lotus-4.prefab").GetComponentInChildren<MeshFilter>().sharedMesh;
  Debug.Log("SIZE_VERTEX_LAYOUT lotus-4 "+string.Join(",",mesh0.GetVertexAttributes().Select(a=>a.attribute+":"+a.format+"x"+a.dimension)));
  Debug.Log("SIZE_VERTICES total="+rows.Sum(r=>r.Item2)+" byGroup "+string.Join(" ",rows.GroupBy(r=>r.Item1.Split('-')[0]).Select(g=>g.Key+"="+g.Sum(r=>r.Item2)))+"\nTOP "+string.Join("\n",rows.OrderByDescending(r=>r.Item2).Take(25).Select(r=>r.Item1+" bytes="+r.Item2+" verts="+r.Item3+" tris="+r.Item4)));
  Debug.Log("SIZE_LEDGER lodIndexBytes="+lodBytes+" ("+string.Join(", ",byGroup.Select(kv=>kv.Key+"="+kv.Value))+") meshRuntimeBytes="+meshBytes+" newTextureStorageBytes="+texBytes+"\n"+string.Join("\n",lines));
 }
 /// <summary>Lists the Mesh LOD API surface of this editor (reflection), for characters.md.</summary>
 public static void LodProbe(){
  foreach(var t in new[]{typeof(ModelImporter),typeof(Mesh),typeof(Renderer),typeof(SkinnedMeshRenderer),typeof(MeshRenderer),typeof(QualitySettings)})
   foreach(var m in t.GetMembers(System.Reflection.BindingFlags.Public|System.Reflection.BindingFlags.Instance|System.Reflection.BindingFlags.Static|System.Reflection.BindingFlags.DeclaredOnly))
    if(m.Name.IndexOf("lod",StringComparison.OrdinalIgnoreCase)>=0)Debug.Log("LOD_API "+t.Name+"."+m.Name+" "+m.MemberType+" "+m);
 }
 // ---------- play-mode shot list ----------
 static CarrotCharacterStudio(){if(!string.IsNullOrEmpty(SessionState.GetString(PlanKey,""))){EditorApplication.update-=Tick;EditorApplication.update+=Tick;}}
 /// <summary>Plan file: one step per line. load N | cmd {json} | wait FRAMES | step SECONDS | quality high|medium|low | shot NAME [W H] | spawn KIND ROUTE DISTANCE [boss] | cam x y z pitch yaw fov | gamecam | exit.</summary>
 public static void Play(){
  string plan=Arg("-studioPlan");if(plan==null||!File.Exists(plan))throw new Exception("-studioPlan missing");
  EditorSceneManager.OpenScene("Assets/Scenes/Carrot.unity",OpenSceneMode.Single);
  SessionState.SetString(PlanKey,File.ReadAllText(plan));SessionState.SetString(OutKey,OutDir());SessionState.SetInt(IndexKey,0);SessionState.SetInt(WaitKey,0);
  EditorApplication.update-=Tick;EditorApplication.update+=Tick;
  Time.captureFramerate=30;EditorApplication.EnterPlaymode();
 }
 static RenderTexture screen;static Camera studioCam;static int frameGuard;static string lastLook;
 static void Finish(int code){SessionState.EraseString(PlanKey);EditorApplication.update-=Tick;Debug.Log("CARROT_STUDIO_PLAY_DONE "+code);EditorApplication.Exit(code);}
 static void Tick(){
  if(!EditorApplication.isPlaying){if(++frameGuard>20000)Finish(3);return;}
  try{
   Time.captureFramerate=30;
   var game=UnityEngine.Object.FindFirstObjectByType<CarrotGame>();var view=game!=null?game.GetComponent<CarrotView>():null;if(game==null||view==null||view.GameCamera==null)return;
   if(screen==null){screen=new RenderTexture(1440,900,24,RenderTextureFormat.ARGB32,RenderTextureReadWrite.sRGB);screen.Create();view.GameCamera.targetTexture=screen;}
   int wait=SessionState.GetInt(WaitKey,0);if(wait>0){SessionState.SetInt(WaitKey,wait-1);return;}
   var steps=SessionState.GetString(PlanKey,"").Split('\n').Select(l=>l.Trim()).Where(l=>l.Length>0&&!l.StartsWith("#")).ToArray();
   int index=SessionState.GetInt(IndexKey,0);if(index>=steps.Length){Finish(0);return;}
   SessionState.SetInt(IndexKey,index+1);string step=steps[index];var parts=step.Split(' ');string op=parts[0];
   Debug.Log("STUDIO_STEP "+step);
   switch(op){
    case "load":game.Command("{\"type\":\"load\",\"level\":"+parts[1]+"}");break;
    case "cmd":game.Command(step.Substring(4));break;
    case "wait":SessionState.SetInt(WaitKey,int.Parse(parts[1],CultureInfo.InvariantCulture));break;
    case "step":game.StepSimulation(float.Parse(parts[1],CultureInfo.InvariantCulture));break;
    case "quality":view.Quality(parts[1]);break;
    case "spawn":game.TestSpawn(parts[1],int.Parse(parts[2],CultureInfo.InvariantCulture),float.Parse(parts[3],CultureInfo.InvariantCulture),parts.Length>4&&parts[4]=="boss");break;
    case "cam":{if(studioCam==null){studioCam=new GameObject("Studio camera").AddComponent<Camera>();studioCam.CopyFrom(view.GameCamera);var d=studioCam.GetUniversalAdditionalCameraData();var g=view.GameCamera.GetUniversalAdditionalCameraData();d.renderPostProcessing=true;d.antialiasing=g.antialiasing;d.renderShadows=true;d.volumeLayerMask=-1;d.dithering=true;studioCam.enabled=false;}
     float F(int i)=>float.Parse(parts[i],CultureInfo.InvariantCulture);studioCam.transform.position=new Vector3(F(1),F(2),F(3));studioCam.transform.rotation=Quaternion.Euler(F(4),F(5),0);studioCam.fieldOfView=F(6);break;}
    case "look":{lastLook=step;
     // look enemy|tower|carrot|point KIND|x,y,z DIST PITCH YAW FOV [LIFT]: frame a live actor in the real level light.
     float F(int i)=>float.Parse(parts[i],CultureInfo.InvariantCulture);Vector3 target=Vector3.zero;bool found=false;
     float yawOffset=0;
     if(parts[1]=="enemy"||parts[1]=="along"){foreach(var e in game.enemies)if(e.kind==parts[2]||e.boss==parts[2]||e.miniboss==parts[2]){target=e.position;found=true;if(parts[1]=="along"&&e.direction.sqrMagnitude>.0001f)yawOffset=Mathf.Atan2(e.direction.x,e.direction.z)*Mathf.Rad2Deg;break;}}
     else if(parts[1]=="tower"){foreach(var t in game.towers)if(t.kind==parts[2]||t.kind+"-"+t.tier==parts[2]){target=t.position;found=true;break;}}
     else if(parts[1]=="carrot"){var r=game.level.routes[0];target=r[r.Length-1];found=true;}
     else{var xyz=parts[2].Split(',');target=new Vector3(float.Parse(xyz[0],CultureInfo.InvariantCulture),float.Parse(xyz[1],CultureInfo.InvariantCulture),float.Parse(xyz[2],CultureInfo.InvariantCulture));found=true;}
     if(!found){Debug.LogWarning("STUDIO_LOOK_MISSING "+step);break;}
     target+=Vector3.up*(parts.Length>7?F(7):.4f);
     if(studioCam==null){studioCam=new GameObject("Studio camera").AddComponent<Camera>();studioCam.CopyFrom(view.GameCamera);studioCam.targetTexture=null;var d=studioCam.GetUniversalAdditionalCameraData();var g=view.GameCamera.GetUniversalAdditionalCameraData();d.renderPostProcessing=true;d.antialiasing=g.antialiasing;d.renderShadows=true;d.volumeLayerMask=-1;d.dithering=true;studioCam.enabled=false;}
     var rot=Quaternion.Euler(F(4),F(5)+yawOffset,0);studioCam.transform.rotation=rot;studioCam.transform.position=target-rot*Vector3.forward*F(3);studioCam.fieldOfView=F(6);break;}
    case "stats":{
     // stats NAME: visible triangles and renderers, secondary-motion cost, foot slide and actor animation allocations, appended to stats.jsonl.
     long tris=0,actorTris=0,skinnedTris=0;int renderers=0;var byKind=new Dictionary<string,long>();
     foreach(var r in UnityEngine.Object.FindObjectsByType<Renderer>(FindObjectsSortMode.None)){if(!r.enabled||!r.gameObject.activeInHierarchy||!r.isVisible)continue;Mesh m=r is SkinnedMeshRenderer sk?sk.sharedMesh:(r.GetComponent<MeshFilter>()!=null?r.GetComponent<MeshFilter>().sharedMesh:null);if(m==null)continue;renderers++;long t=0;int level=r.forceMeshLod>=0&&m.lodCount>1?Mathf.Min(r.forceMeshLod,m.lodCount-1):0;for(int i=0;i<m.subMeshCount;i++)t+=m.lodCount>1?m.GetLod(i,level).indexCount/3:m.GetIndexCount(i)/3;tris+=t;if(r is SkinnedMeshRenderer)skinnedTris+=t;
      string owner="scene:"+m.name;for(var p=r.transform;p!=null;p=p.parent)if(p.name.EndsWith(" actor",StringComparison.Ordinal)){owner=p.name.Substring(0,p.name.Length-6);actorTris+=t;break;}
      byKind[owner]=(byKind.TryGetValue(owner,out var v)?v:0)+t;}
     Debug.Log("STUDIO_TRIS "+string.Join(" ",byKind.OrderByDescending(kv=>kv.Value).Take(30).Select(kv=>kv.Key+"="+kv.Value)));
     long alloc=-1;var hook=typeof(CarrotView).GetMethod("QaActorAllocations");if(hook!=null)alloc=(long)hook.Invoke(view,new object[]{100});
     int springs=UnityEngine.Object.FindObjectsByType<CarrotSecondaryMotion>(FindObjectsSortMode.None).Length;
     string line="{\"name\":\""+parts[1]+"\",\"level\":"+game.level.id+",\"tier\":\""+CarrotQuality.Name(CarrotQuality.Tier)+"\",\"enemies\":"+game.enemies.Count+",\"towers\":"+game.towers.Count+",\"visibleTriangles\":"+tris+",\"actorTriangles\":"+actorTris+",\"skinnedTriangles\":"+skinnedTris+",\"visibleRenderers\":"+renderers
      +",\"springActors\":"+springs+",\"springLinks\":"+CarrotSecondaryMotion.LastFrameLinks+",\"springMs\":"+CarrotSecondaryMotion.LastFrameMs.ToString("F3",CultureInfo.InvariantCulture)+",\"springMaxDeg\":"+CarrotSecondaryMotion.LastFrameMaxDegrees.ToString("F2",CultureInfo.InvariantCulture)+",\"springMeanMs\":"+CarrotSecondaryMotion.MeanMs.ToString("F3",CultureInfo.InvariantCulture)+",\"springWorstMs\":"+CarrotSecondaryMotion.WorstMs.ToString("F3",CultureInfo.InvariantCulture)+",\"springWorstDeg\":"+CarrotSecondaryMotion.WorstDegrees.ToString("F2",CultureInfo.InvariantCulture)+",\"springFrames\":"+CarrotSecondaryMotion.StatFrames
      +",\"worstFootSlide\":"+CarrotView.WorstFootSlide.ToString("F3",CultureInfo.InvariantCulture)+",\"actorAllocBytesPer100\":"+alloc+"}";
     File.AppendAllText(Path.Combine(SessionState.GetString(OutKey,OutDir()),"stats.jsonl"),line+"\n");Debug.Log("STUDIO_STATS "+line);break;}
    case "lod":{
     // lod N | lod tier: force every crowd actor to Mesh LOD N, or hand control back to CarrotTierLod.
     foreach(var t in UnityEngine.Object.FindObjectsByType<CarrotTierLod>(FindObjectsSortMode.None)){if(parts[1]=="tier"){t.enabled=false;t.enabled=true;continue;}short n=short.Parse(parts[1],CultureInfo.InvariantCulture);foreach(var r in t.GetComponentsInChildren<Renderer>(true))r.forceMeshLod=n;}
     break;}
    case "resetstats":CarrotSecondaryMotion.ResetStats();break;
    case "gamecam":if(studioCam!=null){UnityEngine.Object.Destroy(studioCam.gameObject);studioCam=null;}break;
    case "shot":{int w=parts.Length>3?int.Parse(parts[2],CultureInfo.InvariantCulture):1440,h=parts.Length>3?int.Parse(parts[3],CultureInfo.InvariantCulture):900;var cam=studioCam!=null?studioCam:view.GameCamera;
     var rt=new RenderTexture(w,h,24,RenderTextureFormat.ARGB32,RenderTextureReadWrite.sRGB);rt.Create();var previous=cam.targetTexture;cam.targetTexture=rt;
     RenderPipeline.SubmitRenderRequest(cam,new UniversalRenderPipeline.SingleCameraRequest{destination=rt});
     var old=RenderTexture.active;RenderTexture.active=rt;var tex=new Texture2D(w,h,TextureFormat.RGB24,false);tex.ReadPixels(new Rect(0,0,w,h),0,0);tex.Apply();RenderTexture.active=old;cam.targetTexture=previous;
     string file=Path.Combine(SessionState.GetString(OutKey,OutDir()),parts[1]+".png");File.WriteAllBytes(file,tex.EncodeToPNG());UnityEngine.Object.Destroy(tex);rt.Release();UnityEngine.Object.Destroy(rt);Debug.Log("STUDIO_SHOT "+file);break;}
    case "burst":{
     // burst NAME COUNT EVERY [W H]: COUNT shots EVERY frames apart (re-framed by the last look), named NAME-00..; used for motion strips.
     int count=int.Parse(parts[2],CultureInfo.InvariantCulture),every=int.Parse(parts[3],CultureInfo.InvariantCulture);int done=SessionState.GetInt("CarrotStudio.Burst",0);
     string size=parts.Length>5?" "+parts[4]+" "+parts[5]:"";
     var rest=new List<string>(steps);int at=index+1;
     rest.Insert(at,"shot "+parts[1]+"-"+done.ToString("00",CultureInfo.InvariantCulture)+size);
     if(done+1<count){rest.Insert(at+1,"wait "+every);if(lastLook!=null)rest.Insert(at+2,lastLook);rest.Insert(at+(lastLook!=null?3:2),step);SessionState.SetInt("CarrotStudio.Burst",done+1);}else SessionState.SetInt("CarrotStudio.Burst",0);
     SessionState.SetString(PlanKey,string.Join("\n",rest));SessionState.SetInt(IndexKey,at);break;}
    case "exit":Finish(0);break;
    default:Debug.LogError("STUDIO_UNKNOWN "+step);break;
   }
  }catch(Exception e){Debug.LogException(e);Finish(2);}
 }
}
}
#endif
