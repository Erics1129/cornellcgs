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
 /// <summary>
 /// Giant-update character checks (characters.md): nibble eyes visible from the 34 degree game camera, spider normals continuous
 /// below the 60 degree smoothing angle, a spring chain on every rigged actor, gait data on every animated actor, and the crowd
 /// Mesh LODs present. Throws on failure; prints CHARACTER_CHECKS PASS.
 /// </summary>
 public static void GiantUpdate(){
  var fails=new List<string>();
  // 1. Nibble pupils: rays toward the camera (front +Z, camera 34 degrees above) must not hit the model.
  {var go=UnityEngine.Object.Instantiate(AssetDatabase.LoadAssetAtPath<GameObject>(R+"Enemies/nibble.prefab"));var anim=go.GetComponentInChildren<Animation>();var idle=anim.GetClip("Idle");if(idle!=null)idle.SampleAnimation(anim.gameObject,0);
   var skin=go.GetComponentInChildren<SkinnedMeshRenderer>();var baked=new Mesh();skin.BakeMesh(baked,true);var m=skin.transform.localToWorldMatrix;
   var verts=baked.vertices.Select(v=>m.MultiplyPoint3x4(v)).ToArray();var colors=skin.sharedMesh.colors;if(colors.Length!=verts.Length)colors=baked.colors;var tris=baked.triangles;
   Debug.Log("NIBBLE_MESH verts="+verts.Length+" colors="+colors.Length+" shared="+skin.sharedMesh.vertexCount+" readable="+skin.sharedMesh.isReadable+" darkest="+(colors.Length>0?colors.Min(c=>c.r+c.g+c.b):-1)+" distinct="+string.Join(" ",colors.Select(c=>((Color32)c).ToString()).Distinct().Take(10)));
   var toCamera=new Vector3(0,Mathf.Sin(34*Mathf.Deg2Rad),Mathf.Cos(34*Mathf.Deg2Rad));int pupils=0,hidden=0;
   for(int i=0;i<verts.Length;i++){var c=colors.Length==verts.Length?colors[i]:Color.white;if(c.r+c.g+c.b>.4f)continue;pupils++;var o=verts[i]+toCamera*.004f;
    for(int t=0;t<tris.Length;t+=3){if(RayHits(o,toCamera,verts[tris[t]],verts[tris[t+1]],verts[tris[t+2]])){hidden++;break;}}}
   float share=pupils>0?hidden/(float)pupils:1;Debug.Log("NIBBLE_EYES pupils="+pupils+" occluded="+hidden+" share="+share.ToString("F3"));if(pupils==0||share>.05f)fails.Add("nibble eyes occluded "+share);
   UnityEngine.Object.DestroyImmediate(baked);UnityEngine.Object.DestroyImmediate(go);}
  // 2. Spider normals: split vertices may differ by more than 30 degrees only where their faces meet at a hard (>60 degree) crease.
  {var mesh=AssetDatabase.LoadAllAssetsAtPath("Assets/Resources/Carrot/Models/Source/shell.fbx").OfType<Mesh>().OrderByDescending(x=>x.vertexCount).First();var v=mesh.vertices;var n=mesh.normals;var tri=mesh.triangles;
   var faceNormals=new Dictionary<Vector3Int,List<Vector3>>();var vertexNormals=new Dictionary<Vector3Int,List<Vector3>>();float quantum=mesh.bounds.size.magnitude/20000f;Vector3Int Key(Vector3 p)=>new Vector3Int(Mathf.RoundToInt(p.x/quantum),Mathf.RoundToInt(p.y/quantum),Mathf.RoundToInt(p.z/quantum));
   for(int t=0;t<tri.Length;t+=3){var fn=Vector3.Cross(v[tri[t+1]]-v[tri[t]],v[tri[t+2]]-v[tri[t]]);if(fn.sqrMagnitude<1e-14f)continue;fn.Normalize();for(int k=0;k<3;k++){var key=Key(v[tri[t+k]]);if(!faceNormals.TryGetValue(key,out var l))faceNormals[key]=l=new List<Vector3>();l.Add(fn);}}
   for(int i=0;i<v.Length;i++){var key=Key(v[i]);if(!vertexNormals.TryGetValue(key,out var l))vertexNormals[key]=l=new List<Vector3>();l.Add(n[i]);}
   int seams=0,bad=0;foreach(var pair in vertexNormals){var l=pair.Value;float worst=0;for(int a=0;a<l.Count;a++)for(int b=a+1;b<l.Count;b++)worst=Mathf.Max(worst,Vector3.Angle(l[a],l[b]));if(worst<=30)continue;seams++;
    float crease=0;if(faceNormals.TryGetValue(pair.Key,out var f))for(int a=0;a<f.Count;a++)for(int b=a+1;b<f.Count;b++)crease=Mathf.Max(crease,Vector3.Angle(f[a],f[b]));if(crease<=60)bad++;}
   Debug.Log("SHELL_NORMALS positions="+vertexNormals.Count+" splits>30deg="+seams+" withoutHardCrease="+bad);if(bad>0)fails.Add("shell normal discontinuities "+bad);}
  // 3-5. Springs, gait and Mesh LODs on every rigged actor.
  foreach(string group in new[]{"Enemies","Minibosses","Bosses"})foreach(string path in System.IO.Directory.GetFiles(R+group,"*.prefab")){
   var prefab=AssetDatabase.LoadAssetAtPath<GameObject>(path);if(prefab.GetComponentInChildren<SkinnedMeshRenderer>(true)==null)continue;
   var motion=prefab.GetComponent<CarrotSecondaryMotion>();if(motion==null||motion.links.Length==0||motion.links.Any(l=>l.bone==null))fails.Add("no spring chain: "+prefab.name);
   if(prefab.GetComponent<CarrotGait>()==null)fails.Add("no gait: "+prefab.name);
   if(group!="Bosses"&&prefab.GetComponent<CarrotTierLod>()==null)fails.Add("no tier LOD: "+prefab.name);
   foreach(var l in motion!=null?motion.links:new CarrotSecondaryMotion.Link[0])if(l.maxDegrees>10)fails.Add("spring over 10 deg: "+prefab.name+"/"+l.bone.name);
  }
  if(fails.Count>0)throw new Exception("CHARACTER_CHECKS FAIL\n"+string.Join("\n",fails));
  Debug.Log("CHARACTER_CHECKS PASS");
 }
 static bool RayHits(Vector3 o,Vector3 d,Vector3 a,Vector3 b,Vector3 c){
  // Moller-Trumbore, forward hits only.
  var e1=b-a;var e2=c-a;var p=Vector3.Cross(d,e2);float det=Vector3.Dot(e1,p);if(Mathf.Abs(det)<1e-9f)return false;float inv=1/det;var t=o-a;float u=Vector3.Dot(t,p)*inv;if(u<0||u>1)return false;var q=Vector3.Cross(t,e1);float v=Vector3.Dot(d,q)*inv;if(v<0||u+v>1)return false;return Vector3.Dot(e2,q)*inv>1e-5f;
 }
 static Bounds BoundsOf(GameObject go){if(go==null)throw new Exception("Missing prefab");var rs=go.GetComponentsInChildren<Renderer>(true);var b=rs[0].bounds;foreach(var r in rs)b.Encapsulate(r.bounds);return b;}
}
}
