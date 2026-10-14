using System;
using System.IO;
using System.Linq;
using System.Collections.Generic;
using UnityEditor;
using UnityEditor.SceneManagement;
using UnityEngine;
using UnityEngine.Rendering;
using UnityEngine.Rendering.Universal;
using UnityEngine.SceneManagement;

namespace CarrotTD {
/// <summary>Renders the acquired official character directly, without image generation or source-art export.</summary>
public static class CarrotAsunaPreview {
 public static void AuditBake(GameObject character) {
  var lines=new List<string>{"Official character runtime bake audit: compare world-space extents under each overload."};
  long triangles=0;int vertices=0;var unique=new HashSet<Mesh>();
  foreach(var skin in character.GetComponentsInChildren<SkinnedMeshRenderer>()) {
   unique.Add(skin.sharedMesh);
   var a=new Mesh();var b=new Mesh();skin.BakeMesh(a,false);skin.BakeMesh(b,true);
   var cpu=SkinWorldBounds(skin);var plain=WorldBounds(a,skin.transform);var scaled=WorldBounds(b,skin.transform);
   lines.Add("BAKE "+skin.name+" scale="+skin.transform.lossyScale+" CPU="+cpu+" false="+plain+" true="+scaled);
   UnityEngine.Object.DestroyImmediate(a);UnityEngine.Object.DestroyImmediate(b);
  }
  foreach(var filter in character.GetComponentsInChildren<MeshFilter>())if(filter.sharedMesh!=null)unique.Add(filter.sharedMesh);
  foreach(var mesh in unique){vertices+=mesh.vertexCount;for(int i=0;i<mesh.subMeshCount;i++)if(mesh.GetTopology(i)==MeshTopology.Triangles)triangles+=(long)mesh.GetIndexCount(i)/3;}
  lines.Add("RUNTIME_GEOMETRY vertices="+vertices+" triangles="+triangles+" renderers="+character.GetComponentsInChildren<Renderer>().Length);
  File.WriteAllLines(CarrotAsunaAssets.PrivateRoot+"/bake-audit.txt",lines);Debug.Log(string.Join("\n",lines));
 }
 static Bounds WorldBounds(Mesh mesh,Transform transform) {
  var points=mesh.vertices;var bounds=new Bounds(transform.TransformPoint(points[0]),Vector3.zero);foreach(var p in points)bounds.Encapsulate(transform.TransformPoint(p));return bounds;
 }
 static Bounds SkinWorldBounds(SkinnedMeshRenderer skin) {
  var mesh=skin.sharedMesh;var points=mesh.vertices;var deltas=new Vector3[points.Length];
  // Imported corrective shapes have one authored frame. Include their current weights for a fair comparison.
  for(int shape=0;shape<mesh.blendShapeCount;shape++) {float weight=skin.GetBlendShapeWeight(shape);if(Mathf.Abs(weight)<.001f)continue;int last=mesh.GetBlendShapeFrameCount(shape)-1;mesh.GetBlendShapeFrameVertices(shape,last,deltas,null,null);float f=weight/mesh.GetBlendShapeFrameWeight(shape,last);for(int i=0;i<points.Length;i++)points[i]+=deltas[i]*f;}
  var bones=skin.bones;var bind=mesh.bindposes;var matrices=new Matrix4x4[bones.Length];for(int i=0;i<bones.Length;i++)matrices[i]=bones[i].localToWorldMatrix*bind[i];
  var counts=mesh.GetBonesPerVertex();var weights=mesh.GetAllBoneWeights();int index=0;var bounds=new Bounds();
  try {for(int i=0;i<points.Length;i++){var p=Vector3.zero;for(int j=0;j<counts[i];j++){var w=weights[index++];p+=matrices[w.boneIndex].MultiplyPoint3x4(points[i])*w.weight;}if(i==0)bounds=new Bounds(p,Vector3.zero);else bounds.Encapsulate(p);}}finally{counts.Dispose();weights.Dispose();}return bounds;
 }
 [MenuItem("Carrot/Asuna/Render official portrait")]
 public static void RenderPortrait() {
  CarrotAsunaAssets.RequirePrepared();
  var previous=SceneManager.GetActiveScene();var scene=EditorSceneManager.NewScene(NewSceneSetup.EmptyScene,Application.isBatchMode?NewSceneMode.Single:NewSceneMode.Additive);
  SceneManager.SetActiveScene(scene);
  RenderTexture target=null;Texture2D pixels=null;Material floorMaterial=null,skyMaterial=null;
  try {
   RenderSettings.ambientMode=AmbientMode.Trilight;RenderSettings.ambientSkyColor=new Color(.75f,.84f,.96f);RenderSettings.ambientEquatorColor=new Color(.52f,.61f,.72f);RenderSettings.ambientGroundColor=new Color(.35f,.34f,.32f);RenderSettings.ambientIntensity=1;
   RenderSettings.fog=false;
   skyMaterial=new Material(Shader.Find("Skybox/Procedural"));skyMaterial.SetColor("_SkyTint",new Color(.45f,.65f,.82f));skyMaterial.SetFloat("_Exposure",1.1f);skyMaterial.SetFloat("_AtmosphereThickness",.65f);RenderSettings.skybox=skyMaterial;
   var key=new GameObject("Portrait sunlight").AddComponent<Light>();key.type=LightType.Directional;key.color=new Color(1,.94f,.85f);key.intensity=2.1f;key.transform.rotation=Quaternion.Euler(35,-30,0);key.shadows=LightShadows.Soft;RenderSettings.sun=key;
   var fill=new GameObject("Portrait sky fill").AddComponent<Light>();fill.type=LightType.Directional;fill.color=new Color(.58f,.77f,1);fill.intensity=.6f;fill.transform.rotation=Quaternion.Euler(20,145,0);
   var character=UnityEngine.Object.Instantiate(AssetDatabase.LoadAssetAtPath<GameObject>(CarrotAsunaAssets.PrefabPath));
   var motion=character.GetComponent<CarrotAsunaMotion>();motion.enabled=false;var animator=motion.animator;animator.Rebind();animator.Update(0);animator.Play("Base Layer.Idle",0,.28f);animator.Update(0);
   AuditBake(character);
   var floor=GameObject.CreatePrimitive(PrimitiveType.Plane);floor.transform.localScale=Vector3.one*20;floor.transform.position=new Vector3(0,-.015f,0);floorMaterial=new Material(Shader.Find("Universal Render Pipeline/Lit"));floorMaterial.SetColor("_BaseColor",new Color(.72f,.78f,.82f));floorMaterial.SetFloat("_Smoothness",.22f);floor.GetComponent<Renderer>().sharedMaterial=floorMaterial;
   var camera=new GameObject("Official character portrait").AddComponent<Camera>();camera.transform.position=new Vector3(.65f,1.52f,4.2f);camera.transform.LookAt(new Vector3(0,1.08f,0));camera.fieldOfView=31;camera.nearClipPlane=.05f;camera.farClipPlane=150;camera.clearFlags=CameraClearFlags.Skybox;camera.allowHDR=true;
   var additional=camera.GetUniversalAdditionalCameraData();additional.renderPostProcessing=false;additional.antialiasing=AntialiasingMode.FastApproximateAntialiasing;additional.renderShadows=true;additional.requiresDepthTexture=true;
   target=new RenderTexture(1024,1280,24,RenderTextureFormat.ARGB32,RenderTextureReadWrite.sRGB);target.Create();camera.targetTexture=target;
   RenderPipeline.SubmitRenderRequest(camera,new UniversalRenderPipeline.SingleCameraRequest{destination=target});
   var old=RenderTexture.active;RenderTexture.active=target;pixels=new Texture2D(target.width,target.height,TextureFormat.RGBA32,false);pixels.ReadPixels(new Rect(0,0,target.width,target.height),0,0);pixels.Apply();RenderTexture.active=old;
   string path=Path.GetFullPath("../../output/asuna-editor-diagnostic.png");Directory.CreateDirectory(Path.GetDirectoryName(path));File.WriteAllBytes(path,pixels.EncodeToPNG());
   Debug.Log("ASUNA_EDITOR_DIAGNOSTIC "+path);
  } finally {
   if(target!=null){target.Release();UnityEngine.Object.DestroyImmediate(target);}if(pixels!=null)UnityEngine.Object.DestroyImmediate(pixels);
   if(Application.isBatchMode){foreach(var item in scene.GetRootGameObjects())UnityEngine.Object.DestroyImmediate(item);}else EditorSceneManager.CloseScene(scene,true);
   if(previous.IsValid()&&previous.isLoaded)SceneManager.SetActiveScene(previous);
   if(floorMaterial!=null)UnityEngine.Object.DestroyImmediate(floorMaterial);if(skyMaterial!=null)UnityEngine.Object.DestroyImmediate(skyMaterial);
  }
 }
}

}
