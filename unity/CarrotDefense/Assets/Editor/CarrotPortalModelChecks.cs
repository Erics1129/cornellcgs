using System;
using System.Collections.Generic;
using System.Linq;
using UnityEditor;
using UnityEngine;
namespace CarrotTD {
public static class CarrotPortalModelChecks {
 const string R="Assets/Resources/Carrot/Models/";
 public static void AuditEcho(){
  var go=UnityEngine.Object.Instantiate(AssetDatabase.LoadAssetAtPath<GameObject>(R+"Minibosses/portalSentinel.prefab"));go.transform.position=new Vector3(3,1,4);go.transform.localScale=Vector3.one*1.2f;
  var animation=go.GetComponentInChildren<Animation>();animation.GetClip("Walk").SampleAnimation(animation.gameObject,.25f);
  foreach(bool useScale in new[]{false,true}){
   var b=new Bounds();var corrected=new Bounds();bool has=false;
   foreach(var skin in go.GetComponentsInChildren<SkinnedMeshRenderer>()){
    var mesh=new Mesh();skin.BakeMesh(mesh,useScale);foreach(var v in mesh.vertices){var p=skin.localToWorldMatrix.MultiplyPoint3x4(v);var c=skin.localToWorldMatrix.MultiplyPoint3x4(v*.01f);if(!has){b=new Bounds(p,Vector3.zero);corrected=new Bounds(c,Vector3.zero);has=true;}else{b.Encapsulate(p);corrected.Encapsulate(c);}}UnityEngine.Object.DestroyImmediate(mesh);
   }
   Debug.Log("PORTAL_ECHO_CHECK useScale="+useScale+" raw="+b+" corrected="+corrected);
  }
  UnityEngine.Object.DestroyImmediate(go);
 }
 public static void FinalizeMetrics(){
  CarrotModels.RebuildExpansionMetricsAndAudio();
  foreach(string group in new[]{"Enemies","Minibosses"})foreach(string path in System.IO.Directory.GetFiles(R+group,"*.prefab")){
   var prefab=AssetDatabase.LoadAssetAtPath<GameObject>(path);var metrics=prefab.GetComponent<CarrotModelMetrics>();if(metrics==null)continue;
   if(metrics.healthAnchor.y<.5f||metrics.healthAnchor.y>1.5f)throw new Exception("Invalid expansion UI anchor: "+path);
   Debug.Log("PORTAL_HEALTH_ANCHOR "+prefab.name+"="+metrics.healthAnchor.ToString("F4"));
  }
  Debug.Log("PORTAL_METRICS_AUDIO_CHECK PASS");
 }
 public static void Run(){
  var before=new Dictionary<string,Bounds>();
  string[] kinds={"bamboo","chili","lotus","magnet","orchid","mushroom","cactus","clockflower","dragonfruit","moonflower"};
  foreach(var kind in kinds)for(int tier=1;tier<=5;tier++){string name=kind+"-"+tier;before[name]=BoundsOf(AssetDatabase.LoadAssetAtPath<GameObject>(R+"Towers/"+name+".prefab"));}
  CarrotModels.RebuildExpansionStatic();
  foreach(var kind in kinds)for(int tier=1;tier<=5;tier++){
   string name=kind+"-"+tier;var go=UnityEngine.Object.Instantiate(AssetDatabase.LoadAssetAtPath<GameObject>(R+"Towers/"+name+".prefab"));var after=BoundsOf(go);
   if((after.center-before[name].center).sqrMagnitude>.000001f||(after.size-before[name].size).sqrMagnitude>.000001f)throw new Exception("Geometry moved during pivot normalization: "+name+" before="+before[name]+" after="+after);
   foreach(var p in go.GetComponentsInChildren<Transform>(true).Where(t=>t.name=="Barrel"||t.name=="Spears"||t.name=="Stamen"||t.name=="Orbits"||t.name=="Turret")){
    Vector3 start=p.position;p.localPosition+=Vector3.forward*.035f;float movement=Vector3.Distance(start,p.position);p.localPosition-=Vector3.forward*.035f;
    if(Mathf.Abs(movement-.035f)>.00001f)throw new Exception("Scaled local motion: "+name+"/"+p.name+"="+movement);
   }
   UnityEngine.Object.DestroyImmediate(go);
  }
  Debug.Log("PORTAL_MOTION_CHECK PASS 50 tower geometries preserved; local motion matches authored units");
  AuditSkins();
 }
 public static void AuditSkins(){
  string[] names={"mite","beetle","slug","wisp","bat","scarab","firefly","sporeling","tinyZombie","riftling","shardling","mimic","warDrummer","frostHerald","witherPriest","stormWarden","graveCaller","mirrorKnight","riftStalker","mossGolem","emberBoar","venomQueen","ironSnail","lanternLeech","chronoMoth","thornBeast","portalSentinel"};
  for(int i=0;i<names.Length;i++){
   var go=UnityEngine.Object.Instantiate(AssetDatabase.LoadAssetAtPath<GameObject>(R+(i<12?"Enemies/":"Minibosses/")+names[i]+".prefab"));
   var animation=go.GetComponentInChildren<Animation>();
   foreach(string pose in new[]{"REST","Idle","Walk","Death"}){
   var clip=pose=="REST"?null:animation.GetClip(pose);if(clip!=null)clip.SampleAnimation(animation.gameObject,pose=="Walk"?.25f:pose=="Death"?.7f:0);
   var render=BoundsOf(go);var baked=new Bounds();var weighted=new Bounds();bool has=false,hasWeighted=false;
   foreach(var skin in go.GetComponentsInChildren<SkinnedMeshRenderer>()){
    var original=skin.sharedMesh;var vertices=original.vertices;var weights=original.boneWeights;var poses=original.bindposes;var bones=skin.bones;
    for(int k=0;k<vertices.Length;k++){var w=weights[k];Vector3 q=Vector3.zero;int[] indices={w.boneIndex0,w.boneIndex1,w.boneIndex2,w.boneIndex3};float[] values={w.weight0,w.weight1,w.weight2,w.weight3};for(int j=0;j<4;j++)if(values[j]>0)q+=(bones[indices[j]].localToWorldMatrix*poses[indices[j]]).MultiplyPoint3x4(vertices[k])*values[j];if(!hasWeighted){weighted=new Bounds(q,Vector3.zero);hasWeighted=true;}else weighted.Encapsulate(q);}
    var mesh=new Mesh();skin.BakeMesh(mesh);foreach(var v in mesh.vertices){var q=skin.transform.TransformPoint(v);if(!has){baked=new Bounds(q,Vector3.zero);has=true;}else baked.Encapsulate(q);}UnityEngine.Object.DestroyImmediate(mesh);
   }
   Debug.Log("PORTAL_SKIN_BOUNDS "+names[i]+" pose="+pose+" rendererMin="+render.min.ToString("F4")+" rendererMax="+render.max.ToString("F4")+" bakedMin="+baked.min.ToString("F4")+" bakedMax="+baked.max.ToString("F4")+" weightedMin="+weighted.min.ToString("F4")+" weightedMax="+weighted.max.ToString("F4"));
   }
   UnityEngine.Object.DestroyImmediate(go);
  }
 }
 static Bounds BoundsOf(GameObject go){if(go==null)throw new Exception("Missing prefab");var rs=go.GetComponentsInChildren<Renderer>(true);var b=rs[0].bounds;foreach(var r in rs)b.Encapsulate(r.bounds);return b;}
}
}
