using System.Collections.Generic;
using UnityEngine;

// Owner: room-light-post. Static contact shading and the draw-call merge.
// 1. RoomSolid()/RoomSolidCylinder() register layer-8 colliders (shards and flakes collide with them) and the same
//    shapes as analytic AO occluders.
// 2. BatchRoom (ForgeWorkshop.cs) bakes per-vertex AO into every static Forge/Surface renderer: 12 cosine-
//    weighted 55 cm rays per vertex (5 for small details, none for glowing parts) against the occluder boxes and
//    cylinders (analytic, no PhysX; candidates from a 40 cm grid), so objects
//    sit on the floor, the floor darkens under the bench and stump, and corners darken. AO goes in vertex alpha.
// 3. It merges the static renderers into one mesh per material (with a "_VertexAO" clone of the material):
//    the room costs one draw call per material instead of one per object.
public partial class ForgeWorld {
 struct RoomOccluder { public Vector3 center; public Quaternion inv; public Vector3 half; public bool cylinder, aligned; public float radius, bound; }
 // Plain arrays and parallel lists rather than generic collections of structs: each value-type generic instantiation
 // costs IL2CPP code in the Web build (the wasm budget is tight).
 RoomOccluder[] roomOccluders=new RoomOccluder[96];int roomOccluderCount;
 void RoomAddOccluder(RoomOccluder o){if(roomOccluderCount==roomOccluders.Length){var grown=new RoomOccluder[roomOccluders.Length*2];System.Array.Copy(roomOccluders,grown,roomOccluderCount);roomOccluders=grown;}roomOccluders[roomOccluderCount++]=o;}
 Transform roomColliders;
 /// Static renderers that move (bellows, lamp parts): never merged or baked.
 readonly HashSet<GameObject> roomDynamic=new HashSet<GameObject>();
 /// Static renderers that stay separate (object-space materials such as the anvil) but still get baked AO.
 readonly HashSet<GameObject> roomSeparate=new HashSet<GameObject>();
 /// Per-object vertex tint used by the merge (rgb, multiplies the material colour).
 readonly List<GameObject> roomTintObject=new List<GameObject>();readonly List<Color> roomTintColor=new List<Color>();
 /// AO detail per renderer: none (emissive or glowing parts) or cheap (small details: 5 rays). Everything else gets 12.
 /// Lumpy renderers (coal heaps, chains: many tiny pieces) share one 5-ray sample per 3 cm cell, facing up.
 readonly HashSet<GameObject> roomNoAo=new HashSet<GameObject>(),roomCheapAo=new HashSet<GameObject>(),roomLumpAo=new HashSet<GameObject>();
 int[] roomLumpKeys;float[] roomLumpValues;   // open-addressing cache, key 0 = empty
 /// Source material -> its merged "_VertexAO" clone (animated emissives are driven through the clone).
 readonly Dictionary<Material,Material> roomBakedOf=new Dictionary<Material,Material>();
 int roomMergedRenderers,roomMergedMeshes,roomBakedVertices;float roomBakeMs;

 Transform RoomColliderRoot(){if(roomColliders==null){roomColliders=new GameObject("Workshop colliders (layer 8)").transform;}return roomColliders;}
 /// A static layer-8 box collider and AO occluder. rot in degrees.
 void RoomSolid(string name,Vector3 center,Vector3 size,Vector3 rot=default,bool collider=true,bool occluder=true){
  var q=Quaternion.Euler(rot);
  if(collider){var go=new GameObject(name);go.layer=ForgeLayoutData.StaticLayer;go.transform.SetParent(RoomColliderRoot(),false);go.transform.position=center;go.transform.rotation=q;go.AddComponent<BoxCollider>().size=size;}
  if(occluder)RoomAddOccluder(new RoomOccluder{center=center,inv=Quaternion.Inverse(q),half=size*.5f,bound=(size*.5f).magnitude,aligned=rot==Vector3.zero});
 }
 /// A vertical cylinder (base centre, radius, height): a box collider inscribed in it, and an exact AO occluder.
 void RoomSolidCylinder(string name,Vector3 baseCenter,float radius,float height,bool collider=true){
  var c=baseCenter+Vector3.up*height*.5f;
  if(collider){var go=new GameObject(name);go.layer=ForgeLayoutData.StaticLayer;go.transform.SetParent(RoomColliderRoot(),false);go.transform.position=c;go.AddComponent<BoxCollider>().size=new Vector3(radius*1.6f,height,radius*1.6f);}
  RoomAddOccluder(new RoomOccluder{center=c,inv=Quaternion.identity,half=new Vector3(radius,height*.5f,radius),cylinder=true,aligned=true,radius=radius,bound=new Vector2(radius,height*.5f).magnitude});
 }
 void RoomTinted(GameObject go,Color c){roomTintObject.Add(go);roomTintColor.Add(c);}

 // ---- AO ----
 /// Ray sets (cosine-weighted hemisphere, z = up in tangent space): 12 for surfaces, 5 for small details.
 static Vector3[] roomAoDirs,roomAoDirsCheap;
 static Vector3[] RoomAoSet(int K){var d=new Vector3[K];for(int i=0;i<K;i++){float u=(i+.5f)/K;float v=Mathf.Repeat(i*.618034f+.11f,1);float r=Mathf.Sqrt(u),phi=2*Mathf.PI*v;d[i]=new Vector3(r*Mathf.Cos(phi),r*Mathf.Sin(phi),Mathf.Sqrt(Mathf.Max(0,1-u)));}return d;}
 static void RoomAoDirections(){if(roomAoDirs!=null)return;roomAoDirs=RoomAoSet(12);roomAoDirsCheap=RoomAoSet(5);}
 /// Distance along the ray to an occluder, or -1 (a ray starting inside an occluder ignores it: no self-shadow).
 static float RoomRayHit(in RoomOccluder o,Vector3 origin,Vector3 dir,float maxT){
  Vector3 lo=origin-o.center,ld=dir;if(!o.aligned){lo=o.inv*lo;ld=o.inv*dir;}
  if(o.cylinder){
   float r=o.radius,hy=o.half.y;if(lo.x*lo.x+lo.z*lo.z<r*r&&lo.y<hy&&lo.y>-hy)return -1;
   float best=-1;float a=ld.x*ld.x+ld.z*ld.z;
   if(a>1e-8f){float b=2*(lo.x*ld.x+lo.z*ld.z),c=lo.x*lo.x+lo.z*lo.z-r*r;float disc=b*b-4*a*c;if(disc>=0){float t=(-b-Mathf.Sqrt(disc))/(2*a);if(t>0&&t<maxT){float y=lo.y+ld.y*t;if(y<=hy&&y>=-hy)best=t;}}}
   if(ld.y>1e-6f||ld.y<-1e-6f){float cap=ld.y<0?hy:-hy;float t=(cap-lo.y)/ld.y;if(t>0&&t<maxT&&(best<0||t<best)){float qx=lo.x+ld.x*t,qz=lo.z+ld.z*t;if(qx*qx+qz*qz<=r*r)best=t;}}
   return best;
  }
  var h=o.half;if(lo.x<h.x&&lo.x>-h.x&&lo.y<h.y&&lo.y>-h.y&&lo.z<h.z&&lo.z>-h.z)return -1;
  float t0=0,t1=maxT;
  if(!Slab(lo.x,ld.x,h.x,ref t0,ref t1)||!Slab(lo.y,ld.y,h.y,ref t0,ref t1)||!Slab(lo.z,ld.z,h.z,ref t0,ref t1))return -1;
  return t0>0?t0:-1;
 }
 static bool Slab(float o,float d,float h,ref float t0,ref float t1){if(d<1e-8f&&d>-1e-8f)return o>=-h&&o<=h;float inv=1/d;float ta=(-h-o)*inv,tb=(h-o)*inv;if(ta>tb){var s=ta;ta=tb;tb=s;}if(ta>t0)t0=ta;if(tb<t1)t1=tb;return t0<=t1;}
 /// Distance from a point to an occluder's surface region (0 inside), for the candidate filter.
 static float RoomOccluderDistance(in RoomOccluder o,Vector3 p){
  var lo=p-o.center;if(!o.aligned)lo=o.inv*lo;
  if(o.cylinder){float rr=Mathf.Max(0,new Vector2(lo.x,lo.z).magnitude-o.radius);float dy=Mathf.Max(0,Mathf.Abs(lo.y)-o.half.y);return Mathf.Sqrt(rr*rr+dy*dy);}
  var d=new Vector3(Mathf.Max(0,Mathf.Abs(lo.x)-o.half.x),Mathf.Max(0,Mathf.Abs(lo.y)-o.half.y),Mathf.Max(0,Mathf.Abs(lo.z)-o.half.z));return d.magnitude;
 }
 // Uniform grid of candidate occluders (cells of RoomAoCell metres over the room).
 const float RoomAoCell=.4f;static readonly Vector3 RoomAoMin=new Vector3(-3.8f,-.4f,-4.2f);const int RoomAoNx=19,RoomAoNy=11,RoomAoNz=17;
 List<int>[] roomAoGrid;
 void RoomAoBuildGrid(float reach){
  roomAoGrid=new List<int>[RoomAoNx*RoomAoNy*RoomAoNz];
  for(int i=0;i<roomOccluderCount;i++){var o=roomOccluders[i];
   // World AABB of the occluder grown by the reach (and half a cell diagonal, so a cell test is conservative).
   Vector3 ext=o.half;if(!o.aligned){var q=Quaternion.Inverse(o.inv);ext=Vector3.zero;foreach(var ax in new[]{Vector3.right*o.half.x,Vector3.up*o.half.y,Vector3.forward*o.half.z}){var w=q*ax;ext+=new Vector3(Mathf.Abs(w.x),Mathf.Abs(w.y),Mathf.Abs(w.z));}}
   var lo=o.center-ext-Vector3.one*reach;var hi=o.center+ext+Vector3.one*reach;
   int x0=Mathf.Clamp(Mathf.FloorToInt((lo.x-RoomAoMin.x)/RoomAoCell),0,RoomAoNx-1),x1=Mathf.Clamp(Mathf.FloorToInt((hi.x-RoomAoMin.x)/RoomAoCell),0,RoomAoNx-1);
   int y0=Mathf.Clamp(Mathf.FloorToInt((lo.y-RoomAoMin.y)/RoomAoCell),0,RoomAoNy-1),y1=Mathf.Clamp(Mathf.FloorToInt((hi.y-RoomAoMin.y)/RoomAoCell),0,RoomAoNy-1);
   int z0=Mathf.Clamp(Mathf.FloorToInt((lo.z-RoomAoMin.z)/RoomAoCell),0,RoomAoNz-1),z1=Mathf.Clamp(Mathf.FloorToInt((hi.z-RoomAoMin.z)/RoomAoCell),0,RoomAoNz-1);
   for(int x=x0;x<=x1;x++)for(int y=y0;y<=y1;y++)for(int z=z0;z<=z1;z++){int k=(x*RoomAoNy+y)*RoomAoNz+z;(roomAoGrid[k]??=new List<int>()).Add(i);}
  }
 }
 readonly List<int> roomAoCandidates=new List<int>();
 /// Ambient occlusion (1 = open) at a world point with a world normal, from rays of length `reach`.
 float RoomAo(Vector3 p,Vector3 n,float reach,Vector3[] dirs){
  roomAoCandidates.Clear();
  int gx=Mathf.FloorToInt((p.x-RoomAoMin.x)/RoomAoCell),gy=Mathf.FloorToInt((p.y-RoomAoMin.y)/RoomAoCell),gz=Mathf.FloorToInt((p.z-RoomAoMin.z)/RoomAoCell);
  if(gx<0||gy<0||gz<0||gx>=RoomAoNx||gy>=RoomAoNy||gz>=RoomAoNz)return 1;
  var cell=roomAoGrid[(gx*RoomAoNy+gy)*RoomAoNz+gz];if(cell==null)return 1;
  foreach(var i in cell)if(RoomOccluderDistance(roomOccluders[i],p)<reach)roomAoCandidates.Add(i);
  if(roomAoCandidates.Count==0)return 1;
  var t=Mathf.Abs(n.y)<.9f?Vector3.Cross(n,Vector3.up).normalized:Vector3.Cross(n,Vector3.right).normalized;var b=Vector3.Cross(n,t);
  var origin=p+n*.006f;float occ=0;
  foreach(var d0 in dirs){var d=t*d0.x+b*d0.y+n*d0.z;float hit=-1;foreach(var i in roomAoCandidates){float h=RoomRayHit(roomOccluders[i],origin,d,hit<0?reach:hit);if(h>=0&&(hit<0||h<hit))hit=h;}if(hit>=0){float x=hit/reach;occ+=(1-x)*(1-x);}}
  return 1-occ/dirs.Length;
 }

 // ---- Merge ----
 /// Bake AO into every static Forge/Surface renderer and merge them by material. Called by BatchRoom.
 void RoomBakeAndMerge(){
  var started=Time.realtimeSinceStartup;RoomAoDirections();RoomAoBuildGrid(.55f);
  var surface=Shader.Find("Forge/Surface");var room=tuning.room;float reach=.55f;
  var groups=new Dictionary<Material,List<MeshRenderer>>();var order=new List<Material>();
  foreach(var renderer in FindObjectsByType<MeshRenderer>(FindObjectsSortMode.None)){
   var t=renderer.transform;var go=renderer.gameObject;
   if(!renderer.enabled||!go.activeInHierarchy||roomDynamic.Contains(go))continue;
   if(t.IsChildOf(dynamicRoot)||(hammer!=null&&t.IsChildOf(hammer))||(scalePan!=null&&t.IsChildOf(scalePan))||t==fire||t==ring)continue;
   var m=renderer.sharedMaterial;if(m==null||m.shader!=surface||renderer.sharedMaterials.Length!=1)continue;
   var filter=renderer.GetComponent<MeshFilter>();if(filter==null||filter.sharedMesh==null)continue;
   if(roomSeparate.Contains(go)){RoomBakeSeparate(renderer,filter,reach);continue;}
   if(!groups.TryGetValue(m,out var list)){list=new List<MeshRenderer>();groups[m]=list;order.Add(m);}list.Add(renderer);
  }
  var merged=new GameObject("Workshop (merged static geometry)").transform;
#if UNITY_EDITOR
  foreach(var m in order){int tri=0;var top=new List<(int,string)>();foreach(var r in groups[m]){var mesh=r.GetComponent<MeshFilter>().sharedMesh;int n=(int)(mesh.GetIndexCount(0)/3);tri+=n;top.Add((n,r.name+" "+r.bounds.center.ToString("0.00")+" "+r.bounds.size.ToString("0.00")));}top.Sort((a,b)=>b.Item1.CompareTo(a.Item1));
   Debug.Log("FORGE_TRIS "+m.name+" "+tri+" tris in "+groups[m].Count+" renderers; top: "+string.Join(" | ",top.GetRange(0,Mathf.Min(8,top.Count)).ConvertAll(x=>x.Item1+" "+x.Item2)));}
#endif
  foreach(var m in order){
   var baked=new Material(m){name=m.name+" (baked AO)"};baked.SetFloat("_VertexAO",1);roomBakedOf[m]=baked;bool pulse=m.GetFloat("_Pulse")>.5f;
   // One mesh per material and spatial cell (RoomCell: 2.3 x 2.0 m columns, split at 1.9 m height), cut per triangle
   // at its centroid, so frustum culling drops what the work view cannot see (the ceiling, the walls behind the
   // smith, the upper chains) instead of drawing the whole room every frame.
   var cells=new Dictionary<int,RoomMesh>();var parts=new Dictionary<int,int>();var maps=new Dictionary<int,int[]>();
   void FlushCell(int key){if(!cells.TryGetValue(key,out var cm)||cm.v.Count==0)return;parts.TryGetValue(key,out int part);parts[key]=part+1;
    var go=MeshObject(m.name+" · cell "+key+(part>0?"."+part:""),cm.Build(m.name+" merged"),baked);go.transform.SetParent(merged,false);var r=go.GetComponent<MeshRenderer>();r.shadowCastingMode=UnityEngine.Rendering.ShadowCastingMode.Off;r.receiveShadows=false;roomMergedMeshes++;cells[key]=new RoomMesh();if(maps.TryGetValue(key,out var map))System.Array.Fill(map,-1);}
   foreach(var renderer in groups[m]){
    var filter=renderer.GetComponent<MeshFilter>();var mesh=filter.sharedMesh;var verts=mesh.vertices;var normals=mesh.normals;var colors=mesh.colors;var tris=mesh.triangles;
    var go=renderer.gameObject;bool noAo=roomNoAo.Contains(go)||m.GetColor("_EmissionColor").maxColorComponent>.05f;var size=renderer.bounds.size;bool lumpy=roomLumpAo.Contains(go);
    var dirs=roomCheapAo.Contains(go)||Mathf.Max(size.x,Mathf.Max(size.y,size.z))<.3f?roomAoDirsCheap:roomAoDirs;
    var l2w=renderer.transform.localToWorldMatrix;var nm=l2w.inverse.transpose;
    int tintAt=roomTintObject.IndexOf(renderer.gameObject);var tint=tintAt>=0?roomTintColor[tintAt]:Color.white;
    var pw=new Vector3[verts.Length];var nw=new Vector3[verts.Length];var cw=new Color[verts.Length];
    for(int i=0;i<verts.Length;i++){
     var p=l2w.MultiplyPoint3x4(verts[i]);var n=normals.Length==verts.Length?nm.MultiplyVector(normals[i]).normalized:Vector3.up;
     float ao=noAo?1:Mathf.Lerp(1,lumpy?RoomLumpAo(p,reach):RoomAo(p,n,reach,dirs),room.aoStrength);
     var col=pulse&&colors.Length==verts.Length?colors[i]:tint;col.a=ao;pw[i]=p;nw[i]=n;cw[i]=col;
    }
    maps.Clear();
    bool flip=l2w.determinant<0;
    for(int i=0;i<tris.Length;i+=3){
     int a=tris[i],b=tris[flip?i+2:i+1],d=tris[flip?i+1:i+2];int key=RoomCell((pw[a]+pw[b]+pw[d])/3);
     if(!cells.TryGetValue(key,out var cm)){cm=new RoomMesh();cells[key]=cm;}
     if(cm.v.Count+3>60000){FlushCell(key);cm=cells[key];}
     if(!maps.TryGetValue(key,out var map)){map=new int[verts.Length];System.Array.Fill(map,-1);maps[key]=map;}
     for(int c=0;c<3;c++){int k=c==0?a:c==1?b:d;if(map[k]<0){map[k]=cm.v.Count;cm.v.Add(pw[k]);cm.n.Add(nw[k]);cm.c.Add(cw[k]);}cm.t.Add(map[k]);}
    }
    roomBakedVertices+=verts.Length;roomMergedRenderers++;
    Destroy(renderer);Destroy(filter);
   }
   var keys=new List<int>(cells.Keys);keys.Sort();foreach(var key in keys)FlushCell(key);
  }
  roomBakeMs=(Time.realtimeSinceStartup-started)*1000;
  Debug.Log($"FORGE_ROOM merged {roomMergedRenderers} renderers into {roomMergedMeshes} meshes ({order.Count} materials), baked AO on {roomBakedVertices} vertices against {roomOccluderCount} occluders in {roomBakeMs:0} ms");
 }
 /// Merge cell of a world point: three columns across (x), three deep (z), below and above 1.9 m.
 static int RoomCell(Vector3 p){int x=Mathf.Clamp(Mathf.FloorToInt((p.x+3.5f)/2.3f),0,2),z=Mathf.Clamp(Mathf.FloorToInt((p.z+3.9f)/2.0f),0,2),y=p.y<1.9f?0:1;return x+3*z+9*y;}
 /// Shared AO for tiny pieces: one upward 5-ray sample per 3 cm cell (a coal lump or chain link reads as one tone).
 float RoomLumpAo(Vector3 p,float reach){
  int x=Mathf.FloorToInt(p.x/.03f),y=Mathf.FloorToInt(p.y/.03f),z=Mathf.FloorToInt(p.z/.03f);int key=((x+512)&1023)|(((y+512)&1023)<<10)|(((z+512)&1023)<<20)|(1<<30);
  if(roomLumpKeys==null){roomLumpKeys=new int[1<<15];roomLumpValues=new float[1<<15];}
  int mask=roomLumpKeys.Length-1,slot=(key*-1640531535)&mask;
  for(int probe=0;probe<=mask;probe++,slot=(slot+1)&mask){
   if(roomLumpKeys[slot]==key)return roomLumpValues[slot];
   if(roomLumpKeys[slot]==0){float ao=RoomAo(new Vector3((x+.5f)*.03f,(y+.5f)*.03f,(z+.5f)*.03f),Vector3.up,reach,roomAoDirsCheap);roomLumpKeys[slot]=key;roomLumpValues[slot]=ao;return ao;}
  }
  return RoomAo(p,Vector3.up,reach,roomAoDirsCheap);
 }
 /// AO for a renderer that keeps its own transform and material (object-space mapping): bake into a mesh copy.
 void RoomBakeSeparate(MeshRenderer renderer,MeshFilter filter,float reach){
  var mesh=Instantiate(filter.sharedMesh);mesh.name=filter.sharedMesh.name+" (baked AO)";var verts=mesh.vertices;var normals=mesh.normals;var colors=new Color[verts.Length];var l2w=renderer.transform.localToWorldMatrix;var nm=l2w.inverse.transpose;
  float strength=tuning.room.aoStrength;
  for(int i=0;i<verts.Length;i++){var p=l2w.MultiplyPoint3x4(verts[i]);var n=nm.MultiplyVector(normals[i]).normalized;colors[i]=new Color(1,1,1,Mathf.Lerp(1,RoomAo(p,n,reach,roomAoDirs),strength));}
  mesh.colors=colors;filter.sharedMesh=mesh;var m=new Material(renderer.sharedMaterial){name=renderer.sharedMaterial.name+" (baked AO)"};m.SetFloat("_VertexAO",1);renderer.sharedMaterial=m;roomBakedVertices+=verts.Length;
 }
}
