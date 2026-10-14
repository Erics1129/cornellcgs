using System;
using System.Collections.Generic;
using System.IO;
using System.Linq;
using UnityEditor;
using UnityEditor.Animations;
using UnityEngine;
using UnityEngine.Rendering;

namespace CarrotTD {
/// <summary>Private, explicit integration of the official Asset Store character. No source fallback.</summary>
public static class CarrotAsunaAssets {
 public const string PrivateRoot="Assets/Licensed/Asuna";
 public const string ConfigPath=PrivateRoot+"/CarrotIntegration.json";
 public const string RuntimeRoot="Assets/Resources/Carrot/AsunaRuntime";
 public const string PrefabPath="Assets/Resources/Carrot/Models/Bosses/Asuna.prefab";
 static readonly string[] RequiredStates={"Idle","Walk","Attack","Dash","Hit","Death"};
 [Serializable] public sealed class ClipBinding {public string state,path,clip;}
 [Serializable] public sealed class TextureBinding {public string path;public string kind="color";public int maxSize=1024;}
 [Serializable] public sealed class Config {
  public string sourcePrefab="",animatorPath="",avatarPath="",chargeBonePath="",trailBonePath="";
  public string sourceVersion="",sourceSha256="",avatarMaskPath="";
  public string[] excludeObjectNames=new string[0];
  public Vector3 correctionEuler=Vector3.zero;
  public float targetHeight=2.1f;
  public ClipBinding[] clips=new ClipBinding[0];
  public TextureBinding[] textures=new TextureBinding[0];
 }
 public static bool IsPrepared => File.Exists(PrefabPath);
 [MenuItem("Carrot/Asuna/Inventory downloaded source")]
 public static void InventorySource() {
  if(!Directory.Exists(PrivateRoot))throw new InvalidOperationException("Official Asuna source has not been placed in "+PrivateRoot);
  var lines=new List<string>{"Official Asuna private source inventory. Names below are measured from imported assets, not assumed mappings."};
  foreach(string path in AssetDatabase.FindAssets("",new[]{PrivateRoot}).Select(AssetDatabase.GUIDToAssetPath).OrderBy(p=>p)) {
   if(AssetDatabase.IsValidFolder(path))continue;
   if(AssetImporter.GetAtPath(path) is ModelImporter model) {
    lines.Add("MODEL "+path+" | rig="+model.animationType+" | scale="+model.globalScale+" | readable="+model.isReadable);
    foreach(var asset in AssetDatabase.LoadAllAssetsAtPath(path)) {
     if(asset is AnimationClip clip&&!clip.name.StartsWith("__preview__"))lines.Add("  CLIP "+clip.name+" | seconds="+clip.length.ToString("F3")+" | humanoid="+clip.humanMotion+" | legacy="+clip.legacy);
     if(asset is Avatar avatar)lines.Add("  AVATAR "+avatar.name+" | humanoid="+avatar.isHuman+" | valid="+avatar.isValid);
    }
   } else if(path.EndsWith(".prefab",StringComparison.OrdinalIgnoreCase))lines.Add("PREFAB "+path);
   else if(AssetDatabase.LoadAssetAtPath<Material>(path) is Material material)lines.Add("MATERIAL "+path+" | shader="+(material.shader?material.shader.name:"MISSING"));
   else if(AssetImporter.GetAtPath(path) is TextureImporter texture)lines.Add("TEXTURE "+path+" | kind="+texture.textureType+" | sRGB="+texture.sRGBTexture+" | max="+texture.maxTextureSize);
  }
  File.WriteAllLines(PrivateRoot+"/CarrotInventory.txt",lines);Debug.Log("ASUNA_INVENTORY "+PrivateRoot+"/CarrotInventory.txt | entries="+lines.Count);
 }
 public static void RequirePrepared() {
  if(!IsPrepared)throw new InvalidOperationException("Official Asuna boss is not prepared. Acquire the licensed source and run CarrotAsunaAssets.Prepare; no substitute character is generated.");
  var config=ReadConfig();ValidateBindings(config);
  string receipt=PrivateRoot+"/CarrotPrepared.sha256";
  if(!File.Exists(receipt)||File.ReadAllText(receipt).Trim()!=ConfigHash())throw new InvalidOperationException("Asuna mapping changed or preparation is incomplete. Re-run CarrotAsunaAssets.Prepare.");
  var prefab=AssetDatabase.LoadAssetAtPath<GameObject>(PrefabPath);
  var motion=prefab?prefab.GetComponent<CarrotAsunaMotion>():null;
  if(motion==null||motion.animator==null||motion.animator.avatar==null||!motion.animator.avatar.isHuman||!motion.animator.avatar.isValid)
   throw new InvalidOperationException("Asuna prefab is missing its official Humanoid rig or motion adapter.");
  var controller=motion.animator.runtimeAnimatorController as AnimatorController;
  if(controller==null||controller.layers.Length!=1)throw new InvalidOperationException("Asuna runtime controller is missing or invalid.");
  foreach(string state in RequiredStates) {
   var matches=controller.layers[0].stateMachine.states.Where(s=>s.state.name==state).ToArray();
   if(matches.Length!=1||!(matches[0].state.motion is AnimationClip clip)||!clip.humanMotion||clip.length<=0)
    throw new InvalidOperationException("Asuna has no playable audited animation for "+state);
  }
  var metrics=prefab.GetComponent<CarrotModelMetrics>();
  if(metrics==null||Mathf.Abs(metrics.healthAnchor.y-config.targetHeight)>.05f)throw new InvalidOperationException("Asuna's measured height/HP anchor does not match the prepared configuration.");
  var meshes=Meshes(prefab).ToArray();
  if(meshes.Length==0||meshes.Any(m=>!InsidePrivate(AssetDatabase.GetAssetPath(m))))throw new InvalidOperationException("Asuna geometry must reference the official private source meshes.");
  foreach(var renderer in prefab.GetComponentsInChildren<Renderer>(true))
   if(renderer.sharedMaterials.Length==0||renderer.sharedMaterials.Any(m=>m==null||m.shader==null||m.shader.name=="Hidden/InternalErrorShader"))
    throw new InvalidOperationException("Asuna's prepared renderers contain missing materials/shaders.");
 }
 [MenuItem("Carrot/Asuna/Audit official source")]
 public static void AuditSource() {
  var config=ReadConfig();
  var source=Source<GameObject>(config.sourcePrefab);
  string[] deps=AssetDatabase.GetDependencies(config.sourcePrefab,true);
  foreach(string path in deps) {
   if(path.StartsWith("Assets/",StringComparison.Ordinal)&&!InsidePrivate(path))
    throw new InvalidOperationException("Source dependency is outside the private Asuna subtree: "+path);
   if(path.IndexOf("/Resources/",StringComparison.Ordinal)>=0)
    throw new InvalidOperationException("Move the official source out of Resources before building; only the selected runtime assets belong there: "+path);
  }
  var texturePaths=deps.Where(p=>AssetDatabase.LoadAssetAtPath<Texture2D>(p)!=null).ToArray();
  foreach(string path in texturePaths)if(config.textures==null||config.textures.Count(t=>t.path==path)!=1)
   throw new InvalidOperationException("Exactly one explicit color-space/size mapping is required for source texture: "+path);
  var instance=UnityEngine.Object.Instantiate(source);
  try {
   var animator=FindAnimator(instance,config);
   var avatar=ResolveAvatar(animator,config);
   if(!avatar.isValid||!avatar.isHuman)throw new InvalidOperationException("The official Asuna Avatar must be a valid Humanoid avatar.");
   long triangles=0;int vertices=0;
   foreach(var mesh in Meshes(instance).Distinct()) {
    vertices+=mesh.vertexCount;
    for(int i=0;i<mesh.subMeshCount;i++)if(mesh.GetTopology(i)==MeshTopology.Triangles)triangles+=(long)mesh.GetIndexCount(i)/3;
   }
   var b=MeasuredBounds(instance);
   var materials=instance.GetComponentsInChildren<Renderer>(true).SelectMany(r=>r.sharedMaterials).Where(m=>m!=null).Distinct().ToArray();
   var report=new List<string>{"ASUNA SOURCE AUDIT", "Version: "+config.sourceVersion,"Archive SHA256: "+config.sourceSha256,
    "Prefab: "+config.sourcePrefab,"Vertices: "+vertices,"Triangles: "+triangles,"Measured bounds: "+b,"Avatar: "+avatar.name,
    "Materials: "+materials.Length,"Source scripts: "+string.Join(", ",instance.GetComponentsInChildren<MonoBehaviour>(true).Where(m=>m!=null).Select(m=>m.GetType().FullName).Distinct())};
   foreach(var material in materials)report.Add("Material: "+AssetDatabase.GetAssetPath(material)+" | "+(material.shader?material.shader.name:"MISSING SHADER"));
   foreach(var binding in config.clips)report.Add("Clip: "+binding.state+" <- "+binding.path+" :: "+binding.clip);
   foreach(var path in deps)if(AssetDatabase.LoadAssetAtPath<Texture2D>(path) is Texture2D texture)report.Add("Texture: "+path+" | "+texture.width+"x"+texture.height+" | "+texture.format);
   Directory.CreateDirectory(PrivateRoot);File.WriteAllLines(PrivateRoot+"/source-audit.txt",report);
   Debug.Log(string.Join("\n",report));
  } finally {UnityEngine.Object.DestroyImmediate(instance);}
 }
 [MenuItem("Carrot/Asuna/Prepare audited character")]
 public static void Prepare() {
  var config=ReadConfig();ValidateBindings(config);AuditSource();
  Directory.CreateDirectory(RuntimeRoot);Directory.CreateDirectory(Path.GetDirectoryName(PrefabPath));AssetDatabase.Refresh();
  var source=Source<GameObject>(config.sourcePrefab);
  var instance=new GameObject("Asuna");
  try {
   var geometry=UnityEngine.Object.Instantiate(source,instance.transform);geometry.name="OfficialCharacter";
   var animator=FindAnimator(geometry,config);var avatar=ResolveAvatar(animator,config);
   // The published master includes demo firearms/holsters. Remove only explicitly audited equipment roots.
   foreach(var node in geometry.GetComponentsInChildren<Transform>(true).Where(t=>config.excludeObjectNames.Contains(t.name)).ToArray())if(node!=null)UnityEngine.Object.DestroyImmediate(node.gameObject);
   // Preserve the authored mesh, bone hierarchy, material assignments and facial blend shapes.
   // The game's simulation owns movement and collisions; vendor demo behaviours are not used.
   foreach(var component in geometry.GetComponentsInChildren<MonoBehaviour>(true))if(component!=null)UnityEngine.Object.DestroyImmediate(component);
   foreach(var component in geometry.GetComponentsInChildren<Collider>(true))UnityEngine.Object.DestroyImmediate(component);
   foreach(var component in geometry.GetComponentsInChildren<Rigidbody>(true))UnityEngine.Object.DestroyImmediate(component);
   foreach(var component in geometry.GetComponentsInChildren<Cloth>(true))UnityEngine.Object.DestroyImmediate(component);
   foreach(var component in geometry.GetComponentsInChildren<AudioSource>(true))UnityEngine.Object.DestroyImmediate(component);
   foreach(var component in geometry.GetComponentsInChildren<Camera>(true))UnityEngine.Object.DestroyImmediate(component);
   foreach(var component in geometry.GetComponentsInChildren<Light>(true))UnityEngine.Object.DestroyImmediate(component);
   foreach(var other in geometry.GetComponentsInChildren<Animator>(true))if(other!=animator)UnityEngine.Object.DestroyImmediate(other);
   foreach(var legacy in geometry.GetComponentsInChildren<Animation>(true))UnityEngine.Object.DestroyImmediate(legacy);
   geometry.transform.localRotation=Quaternion.Euler(config.correctionEuler)*geometry.transform.localRotation;
   var bounds=MeasuredBounds(instance);
   if(bounds.size.y<.01f||bounds.size.y>1000)throw new InvalidOperationException("Invalid official source geometry height: "+bounds);
   geometry.transform.localScale*=config.targetHeight/bounds.size.y;
   bounds=MeasuredBounds(instance);geometry.transform.localPosition-=new Vector3(bounds.center.x,bounds.min.y,bounds.center.z);
   ConfigureTextures(config);
   var controller=MakeController(config,avatar);
   animator.avatar=avatar;animator.runtimeAnimatorController=controller;animator.applyRootMotion=false;
   animator.cullingMode=AnimatorCullingMode.AlwaysAnimate;animator.updateMode=AnimatorUpdateMode.Normal;
   foreach(var renderer in geometry.GetComponentsInChildren<Renderer>(true)) {
    renderer.shadowCastingMode=ShadowCastingMode.On;renderer.receiveShadows=true;
    foreach(var material in renderer.sharedMaterials)if(material==null||material.shader==null||material.shader.name=="Hidden/InternalErrorShader")throw new InvalidOperationException("Asuna has a missing material or shader: "+renderer.name);
   }
   bounds=MeasuredBounds(instance);
   var metrics=instance.AddComponent<CarrotModelMetrics>();metrics.healthAnchor=new Vector3(0,bounds.max.y,0);
   var motion=instance.AddComponent<CarrotAsunaMotion>();motion.animator=animator;
   motion.chargeAnchor=Attachment(geometry,config.chargeBonePath,"ChargeAnchor",animator.GetBoneTransform(HumanBodyBones.RightHand));
   motion.trailAnchor=Attachment(geometry,config.trailBonePath,"TrailAnchor",animator.GetBoneTransform(HumanBodyBones.LeftHand));
   PrefabUtility.SaveAsPrefabAsset(instance,PrefabPath);AssetDatabase.SaveAssets();
   File.WriteAllText(PrivateRoot+"/CarrotPrepared.sha256",ConfigHash()+"\n");
   WriteRuntimeAudit(instance);
   RequirePrepared();
   Debug.Log("ASUNA_PREPARED "+PrefabPath+" height="+bounds.size.y.ToString("F3")+" forward=+Z; official Avatar and source materials preserved.");
  } finally {UnityEngine.Object.DestroyImmediate(instance);}
 }
 static void WriteRuntimeAudit(GameObject root) {
  var lines=new List<string>{"Prepared official character: source artwork remains private.","Bounds: "+MeasuredBounds(root)};
  foreach(var skin in root.GetComponentsInChildren<SkinnedMeshRenderer>(true))lines.Add("SKIN "+skin.name+" | vertices="+skin.sharedMesh.vertexCount+" | bones="+skin.bones.Length+" | shapes="+skin.sharedMesh.blendShapeCount+" | lossyScale="+skin.transform.lossyScale+" | bounds="+skin.bounds);
  foreach(var renderer in root.GetComponentsInChildren<Renderer>(true))lines.Add("DRAW "+renderer.name+" | "+string.Join(",",renderer.sharedMaterials.Select(m=>m.name+":"+m.shader.name)));
  foreach(var bone in new[]{HumanBodyBones.Head,HumanBodyBones.LeftHand,HumanBodyBones.RightHand})lines.Add("BONE "+bone+" "+root.transform.InverseTransformPoint(root.GetComponent<CarrotAsunaMotion>().animator.GetBoneTransform(bone).position));
  File.WriteAllLines(PrivateRoot+"/runtime-audit.txt",lines);Debug.Log(string.Join("\n",lines));
 }
 static Config ReadConfig() {
  if(!File.Exists(ConfigPath))throw new InvalidOperationException("Asuna has not been acquired/configured. Private mapping required at "+ConfigPath);
  var config=JsonUtility.FromJson<Config>(File.ReadAllText(ConfigPath));
  if(config==null||config.targetHeight<.5f||config.targetHeight>5)throw new InvalidOperationException("Invalid Asuna configuration/target height.");
  if(string.IsNullOrEmpty(config.sourceVersion)||config.sourceSha256==null||config.sourceSha256.Length!=64)throw new InvalidOperationException("Record the actual acquired package version and SHA256 before import.");
  return config;
 }
 static string ConfigHash(){using(var sha=System.Security.Cryptography.SHA256.Create())return BitConverter.ToString(sha.ComputeHash(File.ReadAllBytes(ConfigPath))).Replace("-","").ToLowerInvariant();}
 static void ValidateBindings(Config config) {
  foreach(string state in RequiredStates)if(config.clips==null||config.clips.Count(c=>c.state==state)!=1)throw new InvalidOperationException("Exactly one audited clip must map to Asuna state "+state);
  if(config.clips.Any(c=>!RequiredStates.Contains(c.state)))throw new InvalidOperationException("Unknown Asuna animation state.");
  foreach(var binding in config.clips){CheckPrivate(binding.path);if(string.IsNullOrEmpty(binding.clip))throw new InvalidOperationException("An exact source clip name is required for "+binding.state);}
 }
 static Animator FindAnimator(GameObject source,Config config) {
  Transform node=string.IsNullOrEmpty(config.animatorPath)?source.transform:source.transform.Find(config.animatorPath);
  if(node==null)throw new InvalidOperationException("Configured Animator path is missing: "+config.animatorPath);
  var animator=node.GetComponent<Animator>();
  if(animator==null)throw new InvalidOperationException("Explicit Animator node has no Animator: "+config.animatorPath);
  return animator;
 }
 static Avatar ResolveAvatar(Animator animator,Config config) {
  if(string.IsNullOrEmpty(config.avatarPath)){if(animator.avatar==null)throw new InvalidOperationException("Official prefab has no Avatar; configure its exact asset path.");return animator.avatar;}
  CheckPrivate(config.avatarPath);var avatars=AssetDatabase.LoadAllAssetsAtPath(config.avatarPath).OfType<Avatar>().ToArray();
  if(avatars.Length!=1)throw new InvalidOperationException("Expected exactly one official Avatar at "+config.avatarPath);return avatars[0];
 }
 static AnimatorController MakeController(Config config,Avatar avatar) {
  string path=RuntimeRoot+"/Asuna.controller";
  // Controller files are private derived assets. Rebuild in place to preserve references.
  var controller=AssetDatabase.LoadAssetAtPath<AnimatorController>(path);
  if(controller==null)controller=AnimatorController.CreateAnimatorControllerAtPath(path);
  var machine=controller.layers[0].stateMachine;
  foreach(var child in machine.states)machine.RemoveState(child.state);
  foreach(var binding in config.clips) {
   if(AssetImporter.GetAtPath(binding.path) is ModelImporter importer) {
    importer.animationType=ModelImporterAnimationType.Human;
    if(AssetDatabase.GetAssetPath(avatar)!=binding.path){importer.avatarSetup=ModelImporterAvatarSetup.CopyFromOther;importer.sourceAvatar=avatar;}
    importer.importAnimation=true;importer.animationCompression=ModelImporterAnimationCompression.Optimal;
    importer.importCameras=false;importer.importLights=false;
    var takes=importer.clipAnimations.Length>0?importer.clipAnimations:importer.defaultClipAnimations;
    foreach(var take in takes){take.lockRootRotation=true;take.lockRootPositionXZ=true;take.lockRootHeightY=true;
     // The official Run file references an obsolete GUID; retain the shipped complete extra-bone mask explicitly.
     if(!string.IsNullOrEmpty(config.avatarMaskPath)){take.maskType=ClipAnimationMaskType.CopyFromOther;take.maskSource=Source<AvatarMask>(config.avatarMaskPath);}
    }
    importer.clipAnimations=takes;importer.SaveAndReimport();
   }
   var choices=AssetDatabase.LoadAllAssetsAtPath(binding.path).OfType<AnimationClip>().Where(c=>c.name==binding.clip).ToArray();
   if(choices.Length!=1||choices[0].legacy||!choices[0].humanMotion)throw new InvalidOperationException("Missing or non-Humanoid source clip: "+binding.path+" :: "+binding.clip);
   string clipPath=RuntimeRoot+"/"+binding.state+".anim";
   var clip=AssetDatabase.LoadAssetAtPath<AnimationClip>(clipPath);
   if(clip==null){clip=UnityEngine.Object.Instantiate(choices[0]);AssetDatabase.CreateAsset(clip,clipPath);}else EditorUtility.CopySerialized(choices[0],clip);
   clip.name=binding.state;var settings=AnimationUtility.GetAnimationClipSettings(clip);settings.loopTime=binding.state=="Idle"||binding.state=="Walk";AnimationUtility.SetAnimationClipSettings(clip,settings);
   var state=machine.AddState(binding.state);state.motion=clip;state.writeDefaultValues=false;state.iKOnFeet=binding.state=="Idle"||binding.state=="Walk";if(binding.state=="Idle")machine.defaultState=state;
   EditorUtility.SetDirty(clip);
  }
  EditorUtility.SetDirty(controller);return controller;
 }
 static void ConfigureTextures(Config config) {
  foreach(var binding in config.textures??new TextureBinding[0]) {
   CheckPrivate(binding.path);var importer=AssetImporter.GetAtPath(binding.path) as TextureImporter;
   if(importer==null)throw new InvalidOperationException("Mapped Asuna texture missing: "+binding.path);
   if(binding.kind!="color"&&binding.kind!="normal"&&binding.kind!="linear")throw new InvalidOperationException("Texture kind must be color/normal/linear: "+binding.path);
   if(binding.maxSize!=512&&binding.maxSize!=1024&&binding.maxSize!=2048)throw new InvalidOperationException("Texture cap must be 512, 1024 or 2048: "+binding.path);
   importer.textureType=binding.kind=="normal"?TextureImporterType.NormalMap:TextureImporterType.Default;importer.sRGBTexture=binding.kind=="color";
   importer.maxTextureSize=binding.maxSize;importer.convertToNormalmap=false;importer.isReadable=false;importer.mipmapEnabled=true;importer.anisoLevel=2;
   CarrotBuild.WebTexture(importer,binding.maxSize,binding.kind=="normal"?90:85,false);importer.SaveAndReimport();
  }
 }
 static Transform Attachment(GameObject geometry,string path,string name,Transform humanoidBone) {
  var bone=string.IsNullOrEmpty(path)?humanoidBone:geometry.transform.Find(path);if(bone==null)throw new InvalidOperationException("Configured attachment bone is absent: "+path);
  var anchor=new GameObject(name).transform;anchor.SetParent(bone,false);return anchor;
 }
 static IEnumerable<Mesh> Meshes(GameObject instance) {
  foreach(var skin in instance.GetComponentsInChildren<SkinnedMeshRenderer>(true))if(skin.sharedMesh!=null)yield return skin.sharedMesh;
  foreach(var filter in instance.GetComponentsInChildren<MeshFilter>(true))if(filter.sharedMesh!=null)yield return filter.sharedMesh;
 }
 static Bounds MeasuredBounds(GameObject instance) {
  var bounds=new Bounds();bool any=false;var inverse=instance.transform.worldToLocalMatrix;
  Action<Vector3> add=p=>{if(!any){bounds=new Bounds(p,Vector3.zero);any=true;}else bounds.Encapsulate(p);};
  foreach(var skin in instance.GetComponentsInChildren<SkinnedMeshRenderer>(true)) {
   if(!skin.gameObject.activeInHierarchy||skin.sharedMesh==null)continue;
   var mesh=skin.sharedMesh;var vertices=mesh.vertices;var bind=mesh.bindposes;var bones=skin.bones;
   if(bones.Length==0){foreach(var p in vertices)add(inverse.MultiplyPoint3x4(skin.transform.TransformPoint(p)));continue;}
   var matrices=new Matrix4x4[bones.Length];for(int i=0;i<bones.Length;i++)matrices[i]=inverse*bones[i].localToWorldMatrix*bind[i];
   var counts=mesh.GetBonesPerVertex();var weights=mesh.GetAllBoneWeights();int weightIndex=0;
   try {for(int i=0;i<vertices.Length;i++){Vector3 p=Vector3.zero;for(int j=0;j<counts[i];j++){var weight=weights[weightIndex++];p+=matrices[weight.boneIndex].MultiplyPoint3x4(vertices[i])*weight.weight;}add(p);}}
   finally {counts.Dispose();weights.Dispose();}
  }
  foreach(var filter in instance.GetComponentsInChildren<MeshFilter>(true))if(filter.gameObject.activeInHierarchy&&filter.sharedMesh!=null)foreach(var p in filter.sharedMesh.vertices)add(inverse.MultiplyPoint3x4(filter.transform.TransformPoint(p)));
  if(!any)throw new InvalidOperationException("Official character contains no active measurable mesh.");return bounds;
 }
 static T Source<T>(string path) where T:UnityEngine.Object {CheckPrivate(path);var result=AssetDatabase.LoadAssetAtPath<T>(path);if(result==null)throw new InvalidOperationException("Official source asset is absent: "+path);return result;}
 static bool InsidePrivate(string path)=>!string.IsNullOrEmpty(path)&&path.StartsWith(PrivateRoot+"/",StringComparison.Ordinal)&&!path.Contains("..")&&!path.Contains('\\');
 static void CheckPrivate(string path){if(!InsidePrivate(path))throw new InvalidOperationException("Licensed asset path must remain inside "+PrivateRoot+": "+path);}
}
}
