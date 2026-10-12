using System;
using System.Collections.Generic;
using UnityEngine;

// Owner: hot-metal-vfx. Knife meshes. MakeKnife and BladeMesh moved verbatim from ForgeWorld.cs.
public partial class ForgeWorld {
 /// Mesh rebuild key. Sync calls KnifeRefresh when it changes (today: metal:family:min(5,level/3)).
 string KnifeSignature(ForgeKnife k)=>k.metal+":"+k.family+":"+Mathf.Min(5,k.level/3);
 /// Uniform scale of a knife root (b.root). strike-feel's motion code reads it; hot-metal-vfx sets it (ForgeLayout.KnifeScale).
 float KnifeRootScale=>.28f;
 /// Rebuild an existing knife in place when its signature changes: the Body (and HeatState, marks, notch
 /// or anything else stored on it) survives. Today's behaviour: new mesh and material, position and heat kept,
 /// velocity and evolution reset, rotation and scale back to the MakeKnife defaults.
 void KnifeRefresh(Body b,ForgeKnife k){var pos=b.root.transform.position;DisposeBody(b);var n=MakeKnife(k);b.root=n.root;b.blade=n.blade;b.bladeRenderer=n.bladeRenderer;b.metal=n.metal;b.knife=k;b.root.transform.position=pos;b.velocity=Vector3.zero;b.evolution=0;}
 Body MakeKnife(ForgeKnife k){int stage=Mathf.Min(5,k.level/3);var root=new GameObject("Knife "+k.id);root.transform.localScale=Vector3.one*.28f;var profile=k.profile;var metal=new Material(Shader.Find("Forge/Blade")){name=k.metal+" blade",color=C(string.IsNullOrEmpty(k.color)?"b7c5ca":k.color)};metal.SetTexture("_MainTex",Resources.Load<Texture2D>("Forge/SteelV2"));metal.SetFloat("_Metallic",k.metal=="obsidian"?.25f:.94f);metal.SetFloat("_Glossiness",1-Mathf.Clamp(k.rough,.05f,.85f));metal.SetFloat("_Kind",Array.IndexOf(new[]{"iron","bronze","steel","silver","damascus","obsidian","meteor","auricite"},k.metal));metal.SetFloat("_Stage",stage);metal.SetColor("_GlowColor",C(k.glow));
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
 static Mesh BladeMesh(Vector2[] p,float depth){if(p==null||p.Length<3)p=new[]{new Vector2(0,-.15f),new Vector2(1.6f,-.13f),new Vector2(2,0),new Vector2(1.4f,.2f),new Vector2(0,.22f)};int n=p.Length;var center=Vector2.zero;foreach(var v in p)center+=v;center/=n;var vertices=new List<Vector3>();var triangles=new List<int>();foreach(var v in p){var inside=Vector2.Lerp(v,center,.065f);vertices.Add(new Vector3(inside.x,depth/2,inside.y));}foreach(var v in p){var inside=Vector2.Lerp(v,center,.065f);vertices.Add(new Vector3(inside.x,-depth/2,inside.y));}foreach(var v in p)vertices.Add(new Vector3(v.x,0,v.y));var flat=Triangulate(p);for(int i=0;i<flat.Count;i+=3){triangles.AddRange(new[]{flat[i+2],flat[i+1],flat[i],flat[i]+n,flat[i+1]+n,flat[i+2]+n});}for(int i=0;i<n;i++){int j=(i+1)%n;triangles.AddRange(new[]{i,j+2*n,i+2*n,i,j,j+2*n,i+n,i+2*n,j+2*n,i+n,j+2*n,j+n});}var mesh=new Mesh{name="Procedural beveled blade"};mesh.SetVertices(vertices);mesh.SetTriangles(triangles,0);return Flat(mesh);}
}
