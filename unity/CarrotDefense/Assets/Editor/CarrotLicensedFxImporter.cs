#if UNITY_EDITOR
using System;
using System.Collections.Generic;
using System.IO;
using CarrotTD;
using UnityEditor;
using UnityEngine;

/// <summary>Builds private playback copies only from a reviewed manifest and acquired original prefabs.</summary>
public static class CarrotLicensedFxImporter {
 const string PrivateRoot="Assets/Private/CarrotLicensedVFX/";
 const string Manifest=PrivateRoot+"config.json";
 const string LibraryPath="Assets/Resources/Carrot/LicensedFx/Library.asset";
 [Serializable] sealed class Config {public Entry[] effects;}
 [Serializable] sealed class Entry {
  public string id,sourcePack,sourcePrefab;
  public string[] allowedRemovedScripts;
  public int instances=1,particleLimit=192;
  public float lifetime=.75f,cooldown=.12f,scale=1;
  public bool allowLowQuality=true,allowReducedMotion,loop;
  public CarrotLicensedFxLibrary.Binding[] bindings;
 }
 static readonly HashSet<string> ApprovedPacks=new HashSet<string>{"MagicEffectsFree-247933","QuickEffectsVol1-304424","BuffLoopFX-34104","CartoonFXRemasterFree-109565"};
 [Serializable] sealed class AuditReport {public List<AuditPrefab> prefabs=new List<AuditPrefab>();}
 [Serializable] sealed class AuditPrefab {public string path;public Vector3 rootScale;public string[] scripts;public int systems,capacity,animators,nativeTrails,audio;public List<AuditMaterial> materials=new List<AuditMaterial>();public List<AuditParticle> particles=new List<AuditParticle>();}
 [Serializable] sealed class AuditMaterial {public string path,shader,pipeline,texture;public Color color;}
 [Serializable] sealed class AuditParticle {public string name;public float duration,size,lifetime;public bool loop;public int capacity;}
 public static void AuditSource(){var report=new AuditReport();foreach(var path in Directory.GetFiles(PrivateRoot+"Source","*.prefab",SearchOption.AllDirectories)){var prefab=AssetDatabase.LoadAssetAtPath<GameObject>(path);if(prefab==null)throw new InvalidOperationException("Cannot import acquired prefab: "+path);var row=new AuditPrefab{path=path,rootScale=prefab.transform.localScale,animators=prefab.GetComponentsInChildren<Animator>(true).Length,nativeTrails=prefab.GetComponentsInChildren<TrailRenderer>(true).Length,audio=prefab.GetComponentsInChildren<AudioSource>(true).Length};var scripts=new List<string>();foreach(var script in prefab.GetComponentsInChildren<MonoBehaviour>(true)){if(script==null)scripts.Add("MISSING");else{scripts.Add(script.GetType().FullName);Debug.Log("CARROT_LICENSED_SCRIPT "+path+" "+script.GetType().FullName+" "+EditorJsonUtility.ToJson(script));}}row.scripts=scripts.ToArray();foreach(var ps in prefab.GetComponentsInChildren<ParticleSystem>(true)){var main=ps.main;row.systems++;row.capacity+=main.maxParticles;row.particles.Add(new AuditParticle{name=ps.name,duration=main.duration,size=main.startSize.constantMax,lifetime=main.startLifetime.constantMax,loop=main.loop,capacity=main.maxParticles});}var seen=new HashSet<Material>();foreach(var renderer in prefab.GetComponentsInChildren<Renderer>(true))foreach(var mat in renderer.sharedMaterials)if(mat!=null&&seen.Add(mat))row.materials.Add(new AuditMaterial{path=AssetDatabase.GetAssetPath(mat),shader=mat.shader!=null?mat.shader.name:"MISSING",pipeline=mat.GetTag("RenderPipeline",false),texture=mat.mainTexture!=null?mat.mainTexture.name:"",color=mat.HasProperty("_TintColor")?mat.GetColor("_TintColor"):mat.HasProperty("_BaseColor")?mat.GetColor("_BaseColor"):mat.HasProperty("_Color")?mat.color:Color.white});report.prefabs.Add(row);Debug.Log("CARROT_LICENSED_SOURCE "+path+" systems="+row.systems+" scripts="+string.Join(",",row.scripts));}Directory.CreateDirectory("../../output");File.WriteAllText("../../output/carrot-licensed-fx-audit.json",JsonUtility.ToJson(report,true));Debug.Log("CARROT_LICENSED_AUDIT "+report.prefabs.Count+" acquired prefabs");}
 [MenuItem("Carrot/Prepare acquired licensed effects")]
 public static void Prepare(){
  // Missing originals/manifest are not a cue to fabricate replacements or mark packs integrated.
  if(!File.Exists(Manifest)){Debug.Log("CARROT_LICENSED_FX inactive: no reviewed private manifest");return;}
  Config config=JsonUtility.FromJson<Config>(File.ReadAllText(Manifest));if(config==null||config.effects==null||config.effects.Length==0)throw new InvalidOperationException("Licensed FX manifest has no audited mappings.");
  ForceCartoonUrp();CompressSourceTextures();
  var ids=new HashSet<string>();var converted=new Dictionary<Material,Material>();var outputs=new List<CarrotLicensedFxLibrary.Effect>();var usedPacks=new HashSet<string>();
  Directory.CreateDirectory(PrivateRoot+"Playback");Directory.CreateDirectory(PrivateRoot+"Playback/Materials");Directory.CreateDirectory(Path.GetDirectoryName(LibraryPath));AssetDatabase.Refresh();
  foreach(var entry in config.effects){
   if(entry==null||string.IsNullOrEmpty(entry.id)||!ids.Add(entry.id)||entry.id.IndexOfAny(Path.GetInvalidFileNameChars())>=0||entry.id.Contains("/")||entry.id.Contains("\\"))throw new InvalidOperationException("Licensed effect id must be unique and a simple filename.");
   if(!ApprovedPacks.Contains(entry.sourcePack??""))throw new InvalidOperationException("Unapproved or unidentified source pack: "+entry.sourcePack);
   if(string.IsNullOrEmpty(entry.sourcePrefab)||!entry.sourcePrefab.StartsWith(PrivateRoot,StringComparison.Ordinal)||!entry.sourcePrefab.EndsWith(".prefab",StringComparison.OrdinalIgnoreCase)||entry.sourcePrefab.Contains(".."))throw new InvalidOperationException("An acquired private source prefab is required for "+entry.id);
   if(entry.bindings==null||entry.bindings.Length==0)throw new InvalidOperationException("No reviewed event binding for "+entry.id);
   if(AssetDatabase.LoadAssetAtPath<GameObject>(entry.sourcePrefab)==null)throw new FileNotFoundException("Acquired prefab is missing",entry.sourcePrefab);
   GameObject contents=PrefabUtility.LoadPrefabContents(entry.sourcePrefab);try{
    if(contents.GetComponentsInChildren<Animator>(true).Length>0||contents.GetComponentsInChildren<Animation>(true).Length>0||contents.GetComponentsInChildren<TrailRenderer>(true).Length>0)throw new InvalidOperationException(entry.id+" uses time-driven animation/native trails; author a reviewed particle-only copy first.");
    var removable=new HashSet<string>(entry.allowedRemovedScripts??Array.Empty<string>());
    foreach(var script in contents.GetComponentsInChildren<MonoBehaviour>(true)){
     if(script==null)throw new InvalidOperationException(entry.id+" has a missing script.");string name=script.GetType().FullName;
     if(!removable.Contains(name))throw new InvalidOperationException(entry.id+" has unaudited behaviour: "+name);UnityEngine.Object.DestroyImmediate(script);
    }
    foreach(var source in contents.GetComponentsInChildren<AudioSource>(true))UnityEngine.Object.DestroyImmediate(source);
    foreach(var light in contents.GetComponentsInChildren<Light>(true))light.enabled=false;
    var systems=contents.GetComponentsInChildren<ParticleSystem>(true);if(systems.Length==0)throw new InvalidOperationException(entry.id+" has no particle systems.");
    int perSystem=Mathf.Max(1,Mathf.Clamp(entry.particleLimit,16,512)/systems.Length);
    foreach(var ps in systems){ps.Stop(false,ParticleSystemStopBehavior.StopEmittingAndClear);var main=ps.main;main.playOnAwake=false;main.stopAction=ParticleSystemStopAction.None;main.useUnscaledTime=false;main.loop=entry.loop;main.scalingMode=ParticleSystemScalingMode.Hierarchy;main.maxParticles=Mathf.Min(main.maxParticles,perSystem);
     if(main.customSimulationSpace!=null&&!main.customSimulationSpace.IsChildOf(contents.transform))throw new InvalidOperationException(entry.id+" references an external simulation transform.");
     var children=ps.subEmitters;for(int i=0;i<children.subEmittersCount;i++){var child=children.GetSubEmitterSystem(i);if(child!=null&&!child.transform.IsChildOf(contents.transform))throw new InvalidOperationException(entry.id+" references an external sub-emitter.");}
     ps.Stop(false,ParticleSystemStopBehavior.StopEmittingAndClear);
    }
    foreach(var renderer in contents.GetComponentsInChildren<Renderer>(true)){
     var materials=renderer.sharedMaterials;for(int m=0;m<materials.Length;m++){if(materials[m]==null){if(UnusedTrailSlot(renderer,m,materials.Length))continue;throw new InvalidOperationException(entry.id+" has a missing active material on "+renderer.name+" slot "+m);}materials[m]=ConvertMaterial(materials[m],converted);}renderer.sharedMaterials=materials;
     renderer.shadowCastingMode=UnityEngine.Rendering.ShadowCastingMode.Off;renderer.receiveShadows=false;
     // Built-in standard and legacy particle streams share position/color/UV with URP Unlit.
     // Keep Cartoon's richer vendor streams, including dissolve and flipbook channels, unchanged.
     var particleRenderer=renderer as ParticleSystemRenderer;
     if(particleRenderer!=null&&materials.Length>0&&materials[0].shader.name==ParticleShader)particleRenderer.SetActiveVertexStreams(new List<ParticleSystemVertexStream>{ParticleSystemVertexStream.Position,ParticleSystemVertexStream.Color,ParticleSystemVertexStream.UV});
    }
    string target=PrivateRoot+"Playback/"+entry.id+".prefab";contents.name=entry.id;var prefab=PrefabUtility.SaveAsPrefabAsset(contents,target);
    outputs.Add(new CarrotLicensedFxLibrary.Effect{id=entry.id,sourcePack=entry.sourcePack,prefab=prefab,instances=Mathf.Clamp(entry.instances,1,3),lifetime=Mathf.Clamp(entry.lifetime,.1f,8),cooldown=Mathf.Clamp(entry.cooldown,.05f,2),scale=Mathf.Clamp(entry.scale,.05f,5),particleLimit=Mathf.Clamp(entry.particleLimit,16,512),allowLowQuality=entry.allowLowQuality,allowReducedMotion=entry.allowReducedMotion,bindings=entry.bindings});usedPacks.Add(entry.sourcePack);
   }finally{PrefabUtility.UnloadPrefabContents(contents);}
  }
  var library=AssetDatabase.LoadAssetAtPath<CarrotLicensedFxLibrary>(LibraryPath);if(library==null){library=ScriptableObject.CreateInstance<CarrotLicensedFxLibrary>();AssetDatabase.CreateAsset(library,LibraryPath);}library.effects=outputs.ToArray();EditorUtility.SetDirty(library);AssetDatabase.SaveAssets();RequirePrepared();Debug.Log("CARROT_LICENSED_FX prepared "+outputs.Count+" audited mappings from "+usedPacks.Count+" acquired packs");
 }
 /// <summary>Every acquired effect texture ships crunched at 512 px or less (quality 70). Particle sprites cover a small part of the
 /// screen and the packs ship 1-4K sheets; this keeps the licensed layer from dominating the web data file.</summary>
 static void CompressSourceTextures(){
  int n=0;foreach(var path in Directory.GetFiles(PrivateRoot+"Source","*.*",SearchOption.AllDirectories)){
   string lower=path.ToLowerInvariant();if(!(lower.EndsWith(".png")||lower.EndsWith(".tga")||lower.EndsWith(".psd")||lower.EndsWith(".jpg")||lower.EndsWith(".exr")))continue;
   var importer=AssetImporter.GetAtPath(path.Replace('\\','/')) as TextureImporter;if(importer==null)continue;
   var web=importer.GetPlatformTextureSettings("WebGL");if(web.overridden&&web.maxTextureSize<=512&&web.crunchedCompression&&web.compressionQuality==70&&importer.maxTextureSize<=512)continue;
   importer.maxTextureSize=Mathf.Min(importer.maxTextureSize,512);CarrotBuild.WebTexture(importer,512,70,true);importer.SaveAndReimport();n++;}
  Debug.Log("CARROT_LICENSED_FX textures crunched="+n);
 }
 const string ParticleShader="Universal Render Pipeline/Particles/Unlit";
 const string CartoonShader="Cartoon FX/Remaster/Particle Ubershader";
 static void ForceCartoonUrp(){
  // The official scripted importer supports a forced URP mode; do not rewrite vendor shader source.
  foreach(var path in Directory.GetFiles(PrivateRoot+"Source/CartoonFXRemasterFree-109565","*.cfxrshader",SearchOption.AllDirectories)){
   var importer=AssetImporter.GetAtPath(path);if(importer==null)throw new InvalidOperationException("Cartoon shader importer missing: "+path);
   var serialized=new SerializedObject(importer);var pipeline=serialized.FindProperty("renderPipelineDetection");
   if(pipeline==null)throw new InvalidOperationException("Official Cartoon shader importer has changed: "+path);
   if(pipeline.intValue!=2){pipeline.intValue=2;serialized.ApplyModifiedPropertiesWithoutUndo();importer.SaveAndReimport();}
  }
 }
 // Unity serializes the second ParticleSystemRenderer material as its trail material even when trails are disabled.
 // The acquired Cartoon originals explicitly have that unused slot null; a null main/active-trail material still fails.
 static bool UnusedTrailSlot(Renderer renderer,int index,int count){var particles=renderer as ParticleSystemRenderer;var ps=particles!=null?particles.GetComponent<ParticleSystem>():null;return index==1&&count==2&&ps!=null&&!ps.trails.enabled;}
 static bool DeclaresPipeline(Shader shader){var data=ShaderUtil.GetShaderData(shader);if(data==null)return false;for(int i=0;i<shader.subshaderCount;i++){var sub=data.GetSerializedSubshader(i);if(sub!=null&&sub.FindTagValue(new UnityEngine.Rendering.ShaderTagId("RenderPipeline")).name=="UniversalPipeline")return true;}return false;}
 static bool DeclaresUrpPass(Shader shader){var data=ShaderUtil.GetShaderData(shader);if(data==null)return false;for(int i=0;i<shader.subshaderCount;i++){var sub=data.GetSerializedSubshader(i);if(sub==null)continue;for(int j=0;j<sub.PassCount;j++)if(sub.GetPass(j).Name=="BASE_URP")return true;}return false;}
 static string MaterialInfo(Material mat){if(mat==null)return "missing";var sh=mat.shader;return mat.name+" shader="+(sh!=null?sh.name:"missing")+" asset="+(sh!=null?AssetDatabase.GetAssetPath(sh):"")+" activePipelineTag="+mat.GetTag("RenderPipeline",false)+" supported="+(sh!=null&&sh.isSupported)+" serializedURP="+(sh!=null&&DeclaresPipeline(sh))+" serializedCartoonURP="+(sh!=null&&DeclaresUrpPass(sh));}
 static bool Compatible(Material mat){if(mat==null||mat.shader==null)return false;var shader=mat.shader;return (shader.name==ParticleShader&&DeclaresPipeline(shader))||(shader.name==CartoonShader&&DeclaresUrpPass(shader));}
 static Material ConvertMaterial(Material source,Dictionary<Material,Material> converted){
  if(Compatible(source))return source;if(converted.TryGetValue(source,out var existing))return existing;
  string shaderName=source.shader!=null?source.shader.name:"MISSING";
  bool standard=shaderName=="Particles/Standard Unlit",additive=shaderName=="Legacy Shaders/Particles/Additive",premultiply=shaderName=="Legacy Shaders/Particles/Alpha Blended Premultiply";
  if(!standard&&!additive&&!premultiply)throw new InvalidOperationException("Unreviewed licensed shader: "+shaderName+" on "+source.name);
  if(standard&&((source.HasProperty("_ColorMode")&&source.GetFloat("_ColorMode")!=0)||(source.HasProperty("_FlipbookMode")&&source.GetFloat("_FlipbookMode")!=0)||(source.HasProperty("_DistortionEnabled")&&source.GetFloat("_DistortionEnabled")!=0)||(source.HasProperty("_EmissionEnabled")&&source.GetFloat("_EmissionEnabled")!=0)))throw new InvalidOperationException("Particle material needs additional feature audit: "+source.name);
  var shader=Shader.Find(ParticleShader);if(shader==null)throw new InvalidOperationException("URP particle shader missing");
  AssetDatabase.TryGetGUIDAndLocalFileIdentifier(source,out string guid,out long localId);string path=PrivateRoot+"Playback/Materials/"+guid+"-"+localId+".mat";
  var mat=AssetDatabase.LoadAssetAtPath<Material>(path);if(mat==null){mat=new Material(shader);AssetDatabase.CreateAsset(mat,path);}else{mat.shader=shader;mat.shaderKeywords=Array.Empty<string>();}
  mat.name=source.name+" (Carrot URP)";mat.SetTexture("_BaseMap",source.mainTexture);
  mat.SetTextureScale("_BaseMap",source.mainTextureScale);mat.SetTextureOffset("_BaseMap",source.mainTextureOffset);
  Color tint=source.HasProperty("_TintColor")?source.GetColor("_TintColor"):source.HasProperty("_Color")?source.GetColor("_Color"):Color.white;
  // Legacy additive's documented shader equation multiplies the particle and tint by two.
  if(additive){tint*=2;tint.a=Mathf.Clamp01(tint.a);}mat.SetColor("_BaseColor",tint);
  int src=additive?(int)UnityEngine.Rendering.BlendMode.SrcAlpha:premultiply?(int)UnityEngine.Rendering.BlendMode.One:(int)source.GetFloat("_SrcBlend");
  int dst=additive?(int)UnityEngine.Rendering.BlendMode.One:premultiply?(int)UnityEngine.Rendering.BlendMode.OneMinusSrcAlpha:(int)source.GetFloat("_DstBlend");
  mat.SetFloat("_Surface",1);mat.SetFloat("_Blend",additive?2:premultiply?1:0);mat.SetFloat("_Cull",0);mat.SetFloat("_ZWrite",0);mat.SetFloat("_AlphaClip",0);mat.SetFloat("_BlendOp",0);
  mat.SetFloat("_SrcBlend",src);mat.SetFloat("_DstBlend",dst);mat.SetFloat("_SrcBlendAlpha",1);mat.SetFloat("_DstBlendAlpha",(int)UnityEngine.Rendering.BlendMode.OneMinusSrcAlpha);
  mat.SetFloat("_ColorMode",0);mat.SetFloat("_FlipbookBlending",0);mat.SetFloat("_SoftParticlesEnabled",0);mat.SetFloat("_CameraFadingEnabled",0);mat.SetFloat("_DistortionEnabled",0);
  mat.EnableKeyword("_SURFACE_TYPE_TRANSPARENT");if(premultiply)mat.EnableKeyword("_ALPHAPREMULTIPLY_ON");
  mat.SetOverrideTag("RenderType","Transparent");mat.renderQueue=3000;mat.SetShaderPassEnabled("ShadowCaster",false);mat.SetShaderPassEnabled("DepthOnly",false);mat.SetShaderPassEnabled("DepthNormalsOnly",false);
  EditorUtility.SetDirty(mat);converted.Add(source,mat);Debug.Log("CARROT_LICENSED_MATERIAL "+AssetDatabase.GetAssetPath(source)+" => "+path+" ["+shaderName+" / "+src+","+dst+"]");return mat;
 }
 public static void RequirePrepared(){
  if(!File.Exists(Manifest))throw new InvalidOperationException("The four acquired effect packs need their private reviewed manifest before release.");
  var config=JsonUtility.FromJson<Config>(File.ReadAllText(Manifest));var library=AssetDatabase.LoadAssetAtPath<CarrotLicensedFxLibrary>(LibraryPath);
  if(config?.effects==null||library?.effects==null||config.effects.Length!=library.effects.Length||library.effects.Length<4)throw new InvalidOperationException("The complete acquired effect library has not been prepared.");
  var used=new HashSet<string>();var ids=new HashSet<string>();var reviewedMaterials=new HashSet<Material>();
  foreach(var effect in library.effects){
   if(effect==null||!ids.Add(effect.id??"")||!ApprovedPacks.Contains(effect.sourcePack??"")||effect.prefab==null)throw new InvalidOperationException("Licensed effect identity/source is missing.");
   Entry entry=Array.Find(config.effects,item=>item!=null&&item.id==effect.id&&item.sourcePack==effect.sourcePack);
   if(entry==null||AssetDatabase.LoadAssetAtPath<GameObject>(entry.sourcePrefab)==null)throw new InvalidOperationException("Acquired original is missing for "+effect.id);
   if(!AssetDatabase.GetAssetPath(effect.prefab).StartsWith(PrivateRoot+"Playback/",StringComparison.Ordinal))throw new InvalidOperationException("Unaudited playback prefab: "+effect.id);
   if(effect.instances<1||effect.instances>3||effect.particleLimit<16||effect.particleLimit>512||effect.lifetime<.1f||effect.lifetime>8||effect.cooldown<.05f||effect.cooldown>2||effect.scale<.05f||effect.scale>5||!effect.allowLowQuality)throw new InvalidOperationException("Playback budget/phone coverage invalid: "+effect.id);
   if(effect.bindings==null||effect.bindings.Length==0)throw new InvalidOperationException("No real event bindings: "+effect.id);
   foreach(var b in effect.bindings)if(b==null||string.IsNullOrEmpty(b.eventType)||string.IsNullOrEmpty(b.kind))throw new InvalidOperationException("Incomplete event binding: "+effect.id);
   var prefab=effect.prefab;if(prefab.GetComponentsInChildren<MonoBehaviour>(true).Length>0||prefab.GetComponentsInChildren<Animator>(true).Length>0||prefab.GetComponentsInChildren<Animation>(true).Length>0||prefab.GetComponentsInChildren<AudioSource>(true).Length>0||prefab.GetComponentsInChildren<TrailRenderer>(true).Length>0)throw new InvalidOperationException("Unmanaged effect lifecycle: "+effect.id);
   int count=0;var systems=prefab.GetComponentsInChildren<ParticleSystem>(true);if(systems.Length==0)throw new InvalidOperationException("No licensed particles: "+effect.id);
   foreach(var ps in systems){var main=ps.main;count+=main.maxParticles;if(main.playOnAwake||main.stopAction!=ParticleSystemStopAction.None||main.useUnscaledTime)throw new InvalidOperationException("Uncontrolled particle playback: "+effect.id);}
   if(count>effect.particleLimit)throw new InvalidOperationException("Particle capacity exceeds effect budget: "+effect.id);
   foreach(var renderer in prefab.GetComponentsInChildren<Renderer>(true)){var materials=renderer.sharedMaterials;for(int i=0;i<materials.Length;i++){var mat=materials[i];if(mat==null&&UnusedTrailSlot(renderer,i,materials.Length))continue;if(reviewedMaterials.Add(mat))Debug.Log("CARROT_LICENSED_MATERIAL_VERIFY "+MaterialInfo(mat));if(!Compatible(mat))throw new InvalidOperationException("Unsupported licensed material on "+effect.id+": "+MaterialInfo(mat));}}
   foreach(var light in prefab.GetComponentsInChildren<Light>(true))if(light.enabled)throw new InvalidOperationException("Unbounded licensed light: "+effect.id);
   used.Add(effect.sourcePack);
  }
  if(!used.SetEquals(ApprovedPacks))throw new InvalidOperationException("Release must include actual mappings from all four approved effect packs.");
  Debug.Log("CARROT_LICENSED_FX_REQUIRED_OK effects="+library.effects.Length+" packs="+string.Join(",",used));
 }

}
#endif
