using System;
using System.Collections.Generic;
using UnityEngine;

// Owner: hot-metal-vfx. Knife meshes: one mesh, one submesh and one Forge/Blade material per knife
// (was a blade plus up to about 25 box renderers). The geometry comes from the pure ForgeBladeShape:
// a rough 8 mm bar that draws out to the family profile over levels 0-5, a flat-spine bevel (5 mm spine to
// .8 mm edge, 1 mm tip; the Dagger gets a centre ridge) with per-vertex thickness for the cooling shader,
// a bare tang while it is a blank or being forged, and a bolster, guard and handle once it is finished.
// Strikes edit it locally (edge spread, the chip notch) in normalized blade coordinates.
public partial class ForgeWorld {
 /// Mesh rebuild key: the level and the place class (blank, forging, finished) change the mesh.
 string KnifeSignature(ForgeKnife k)=>k.metal+":"+k.family+":"+k.level+":"+KnifePlaceClass(k);
 /// The signature of a live body: a kept blade still in the tongs (HeatState.quenchHold) stays 'forging' until it has
 /// dissolved out after the quench, so the handle never appears in the jaws.
 string KnifeSignature(ForgeKnife k,Body b)=>b!=null&&b.heatState!=null&&b.heatState.quenchHold?k.metal+":"+k.family+":"+k.level+":forging":KnifeSignature(k);
 /// A Keep (anvil to rack) starts the hold; EndQuenchHold ends it once the blade is out of sight.
 static bool BeginsKeep(Body b,ForgeKnife next)=>b.knife!=null&&b.knife.place=="anvil"&&next.place=="rack";
 void EndQuenchHold(Body b){var h=b.heatState;if(h==null||!h.quenchHold)return;h.quenchHold=false;h.quenched=false;var sig=KnifeSignature(b.knife);if(b.signature!=sig){KnifeRefresh(b,b.knife);b.signature=sig;}}
 static string KnifePlaceClass(ForgeKnife k)=>k.place=="rack"?"finished":k.place=="crate"?(k.level==0?"blank":"finished"):"forging";
 /// Uniform scale of a knife root (b.root): profile units to metres. strike-feel's motion code reads it.
 float KnifeRootScale=>ForgeLayout.KnifeScale;
 const float KnifeUnitMm=ForgeLayout.KnifeScale*1000;
 /// Rebuild an existing knife in place when its signature changes. The Body, its Material and HeatState
 /// (temperature, marks, footprints, notch, spread, oxide) survive; a level gain clears the chip notch.
 /// The rebuild itself runs once in the next KnifeVisual (Sync sets b.knife = k right after this call), so
 /// a strike that edits the outline and levels up in the same Sync costs one mesh build, not two.
 void KnifeRefresh(Body b,ForgeKnife k){
  var h=b.heatState;if(h==null){h=b.heatState=new HeatState();h.mesh=new Mesh{name="Forged blade "+k.id};h.mesh.MarkDynamic();b.blade.GetComponent<MeshFilter>().sharedMesh=h.mesh;BuildKnifeMesh(b,k);KnifeLook(b,k);return;}
  if(b.knife!=null&&k.level>b.knife.level)h.shape.notchU=-1;
  h.rebuild=true;
 }
 Body MakeKnife(ForgeKnife k){
  var root=new GameObject("Knife "+k.id);if(dynamicRoot!=null)root.transform.SetParent(dynamicRoot,false);root.transform.localScale=Vector3.one*KnifeRootScale;
  var metal=new Material(Shader.Find(ForgeContract.Shaders.Blade)){name=k.metal+" blade"};metal.SetTexture("_MainTex",Resources.Load<Texture2D>("Forge/SteelV2"));
  var blade=new GameObject("Forged blade");blade.transform.SetParent(root.transform,false);blade.AddComponent<MeshFilter>();var renderer=blade.AddComponent<MeshRenderer>();renderer.sharedMaterial=metal;
  var b=new Body{root=root,blade=blade,bladeRenderer=renderer,metal=metal,knife=k,heatState=new HeatState()};
  var h=b.heatState;h.mesh=new Mesh{name="Forged blade "+k.id};h.mesh.MarkDynamic();blade.GetComponent<MeshFilter>().sharedMesh=h.mesh;
  // Restored on reload: a heated knife on the anvil starts at 950 C, one in the furnace at its pull temperature.
  float pull=tuning.metal.Pull(k.metal);
  h.model.Reset(k.heated&&k.place=="anvil"?tuning.metal.restoredC:k.heated&&k.place=="furnace"?pull:20);
  h.firstHeat=!k.heated;h.crackSeed=(k.id*.6180339f)%1;
  // Pointer picking (ForgeKnifeTag + a box around the mesh), as before the one-mesh knives.
  h.collider=root.AddComponent<BoxCollider>();root.AddComponent<ForgeKnifeTag>().id=k.id;
  BuildKnifeMesh(b,k);KnifeLook(b,k);
  return b;
 }
 // Scratch lists for mesh uploads (shared by every knife; rebuilt on the main thread only).
 static readonly List<Vector3> meshV=new List<Vector3>(4096),meshN=new List<Vector3>(4096);static readonly List<Vector2> meshUv0=new List<Vector2>(4096);static readonly List<Vector4> meshUv1=new List<Vector4>(4096);static readonly List<Color32> meshC=new List<Color32>(4096);
 static readonly ForgeMeshBuffer knifeBuffer=new ForgeMeshBuffer();
 static void Upload(Mesh mesh,ForgeMeshBuffer o,bool dynamicIndices=true){
  meshV.Clear();meshN.Clear();meshUv0.Clear();meshUv1.Clear();meshC.Clear();
  for(int i=0;i<o.count;i++){meshV.Add(new Vector3(o.pos[i*3],o.pos[i*3+1],o.pos[i*3+2]));meshN.Add(new Vector3(o.nrm[i*3],o.nrm[i*3+1],o.nrm[i*3+2]));meshUv0.Add(new Vector2(o.uv0[i*2],o.uv0[i*2+1]));meshUv1.Add(new Vector4(o.uv1[i*4],o.uv1[i*4+1],o.uv1[i*4+2],o.uv1[i*4+3]));meshC.Add(new Color32(o.col[i*4],o.col[i*4+1],o.col[i*4+2],o.col[i*4+3]));}
  // Clear frees the GPU buffers, and the next Set* allocates new ones (in WebKit a new buffer in its GPU process on
  // every strike). A rebuild with the same vertex count, the common case, updates the buffers in place.
  if(mesh.vertexCount!=o.count)mesh.Clear();mesh.SetVertices(meshV);mesh.SetNormals(meshN);mesh.SetUVs(0,meshUv0);mesh.SetUVs(1,meshUv1);mesh.SetColors(meshC);mesh.SetTriangles(o.tris,0,true);
 }
 static byte[] Rgb(string hex,string fallback){var c=C(string.IsNullOrEmpty(hex)?fallback:hex);return new[]{(byte)(c.r*255),(byte)(c.g*255),(byte)(c.b*255)};}
 static readonly byte[] Walnut={84,54,32},Leather={58,44,36},Ebony={38,31,28};
 /// Rebuild the mesh from the knife's profile, level and place class plus the per-strike edits.
 void BuildKnifeMesh(Body b,ForgeKnife k){
  var h=b.heatState;var t=tuning.metal;var p=k.profile;int n=p!=null?p.Length:0;
  if(h.px.Length<n){h.px=new float[n];h.pz=new float[n];}for(int i=0;i<n;i++){h.px[i]=p[i].x;h.pz[i]=p[i].y;}
  h.shape.Build(n>=3?h.px:null,n>=3?h.pz:null,n,k.level,k.family,t,KnifeUnitMm);
  h.finished=!h.quenchHold&&KnifePlaceClass(k)=="finished";int stage=Stage(k.level);
  var handle=k.metal=="iron"||k.metal=="bronze"?Walnut:k.metal=="steel"||k.metal=="silver"?Leather:Ebony;
  h.shape.Mesh(knifeBuffer,t,h.finished,stage,handle,Rgb(k.glow,"ffa263"));
  Upload(h.mesh,knifeBuffer);h.mesh.RecalculateBounds();h.dirty=false;h.rebuild=false;h.level=k.level;
  // The underside sits 6 mm below the knife root, so a knife root at ForgeLayout.KnifeAnvilRoot lies on the face.
  float maxHalf=0;for(int i=0;i<ForgeBladeShape.S;i+=4)maxHalf=Mathf.Max(maxHalf,h.shape.Thickness(i,1,t)*.5f);h.baseY=(maxHalf-6)/KnifeUnitMm;
  b.blade.transform.localPosition=new Vector3(0,h.baseY+h.liftU,0);
  if(h.collider!=null){var bb=h.mesh.bounds;h.collider.center=bb.center+new Vector3(0,h.baseY,0);h.collider.size=bb.size+new Vector3(.08f,.25f,.08f);}
 }
 /// Rebuild only if a strike edited the outline (called on the contact frame and from KnifeVisual).
 void KnifeMeshIfDirty(Body b){var h=b.heatState;if(h==null||!h.dirty)return;h.shape.ApplyEdits(tuning.metal);h.shape.Mesh(knifeBuffer,tuning.metal,h.finished,Stage(b.knife.level),b.knife.metal=="iron"||b.knife.metal=="bronze"?Walnut:b.knife.metal=="steel"||b.knife.metal=="silver"?Leather:Ebony,Rgb(b.knife.glow,"ffa263"));Upload(h.mesh,knifeBuffer);h.mesh.RecalculateBounds();h.dirty=false;}
 static readonly int[] Evolutions={0,3,6,9,12,15};
 static int Stage(int level){int s=0;foreach(var e in Evolutions)if(level>=e)s++;return s-1;}
 /// Material look that only changes with the knife (metal, stage, finished or still being forged).
 void KnifeLook(Body b,ForgeKnife k){
  var m=b.metal;var h=b.heatState;
  m.color=C(string.IsNullOrEmpty(k.color)?"b7c5ca":k.color);
  m.SetFloat("_Metallic",k.metal=="obsidian"?.25f:k.metal=="bronze"?.85f:.94f);m.SetFloat("_Glossiness",1-Mathf.Clamp(k.rough,.05f,.85f));
  m.SetFloat("_Kind",Array.IndexOf(new[]{"iron","bronze","steel","silver","damascus","obsidian","meteor","auricite"},k.metal));m.SetFloat("_Stage",Stage(k.level));
  m.SetColor("_GlowColor",C(string.IsNullOrEmpty(k.glow)?"ffa263":k.glow));
  m.SetFloat("_Worked",h.finished?0:1);
  m.SetVector("_BladeDims",new Vector4(Mathf.Max(1,h.shape.BladeLengthCm),Mathf.Max(.5f,h.shape.BladeWidthCm),h.crackSeed,KnifeUnitMm));
 }
 /// A forging-state blade mesh for a raw profile (kept for callers of the old helper).
 static Mesh BladeMesh(Vector2[] p,float depth){
  var shape=new ForgeBladeShape();int n=p!=null?p.Length:0;var px=new float[n];var pz=new float[n];for(int i=0;i<n;i++){px[i]=p[i].x;pz[i]=p[i].y;}
  var t=new ForgeMetalTuning();shape.Build(n>=3?px:null,n>=3?pz:null,n,9,0,t,KnifeUnitMm);var o=new ForgeMeshBuffer();shape.Mesh(o,t,false,0,null,null);var mesh=new Mesh{name="Procedural beveled blade"};Upload(mesh,o);mesh.RecalculateBounds();return mesh;
 }
}
