using System;
using System.Collections.Generic;
using System.IO;
using UnityEditor;
using UnityEngine;

namespace CarrotTD {
/// <summary>Private, posed geometry handoff to the offline portrait renderer. Never exported to the website.</summary>
public static class CarrotAsunaPoseExport {
 [Serializable] sealed class MaterialRow {public string name,baseMap,normalMap,metallicMap,emissionMap;public Color color,emission;public float metallic,smoothness,normalScale,cutoff;public bool transparent,cutout;}
 [Serializable] sealed class Part {public string name;public Vector3[] vertices,normals;public Vector2[] uv;public List<Submesh> submeshes=new List<Submesh>();}
 [Serializable] sealed class Submesh {public int material;public int[] triangles;}
 [Serializable] sealed class Document {public string source="Official acquired Asuna runtime prefab, sampled Idle1 pose; private licensed intermediate.";public List<Part> parts=new List<Part>();public List<MaterialRow> materials=new List<MaterialRow>();}
 public static void Export() {
  CarrotAsunaAssets.RequirePrepared();var root=UnityEngine.Object.Instantiate(AssetDatabase.LoadAssetAtPath<GameObject>(CarrotAsunaAssets.PrefabPath));
  try {
   var motion=root.GetComponent<CarrotAsunaMotion>();motion.enabled=false;motion.animator.Rebind();motion.animator.Update(0);motion.animator.Play("Base Layer.Idle",0,.28f);motion.animator.Update(0);
   var document=new Document();var materials=new Dictionary<Material,int>();
   foreach(var renderer in root.GetComponentsInChildren<Renderer>()) {
    Mesh mesh;bool baked=renderer is SkinnedMeshRenderer;
    if(baked){mesh=new Mesh();((SkinnedMeshRenderer)renderer).BakeMesh(mesh,true);}else {var filter=renderer.GetComponent<MeshFilter>();if(filter==null||filter.sharedMesh==null)continue;mesh=filter.sharedMesh;}
    var part=new Part{name=renderer.name,vertices=mesh.vertices,normals=mesh.normals,uv=mesh.uv};
    var normalMatrix=renderer.localToWorldMatrix.inverse.transpose;
    for(int i=0;i<part.vertices.Length;i++){part.vertices[i]=renderer.localToWorldMatrix.MultiplyPoint3x4(part.vertices[i]);if(i<part.normals.Length)part.normals[i]=normalMatrix.MultiplyVector(part.normals[i]).normalized;}
    for(int sub=0;sub<mesh.subMeshCount;sub++) {
     var material=renderer.sharedMaterials[sub];if(!materials.TryGetValue(material,out int index)) {
      index=document.materials.Count;materials[material]=index;
      document.materials.Add(new MaterialRow{name=material.name,baseMap=Texture(material,"_BaseMap"),normalMap=Texture(material,"_BumpMap"),metallicMap=Texture(material,"_MetallicGlossMap"),emissionMap=Texture(material,"_EmissionMap"),color=material.GetColor("_BaseColor"),emission=material.GetColor("_EmissionColor"),metallic=material.GetFloat("_Metallic"),smoothness=material.GetFloat("_Smoothness"),normalScale=material.GetFloat("_BumpScale"),cutoff=material.GetFloat("_Cutoff"),transparent=material.GetFloat("_Surface")>0,cutout=material.GetFloat("_AlphaClip")>0});
     }
     part.submeshes.Add(new Submesh{material=index,triangles=mesh.GetTriangles(sub)});
    }
    document.parts.Add(part);if(baked)UnityEngine.Object.DestroyImmediate(mesh);
   }
   string path=Path.GetFullPath("../../private-assets/Asuna/portrait-pose.json");Directory.CreateDirectory(Path.GetDirectoryName(path));File.WriteAllText(path,JsonUtility.ToJson(document));Debug.Log("ASUNA_PRIVATE_POSE_EXPORTED "+path+" parts="+document.parts.Count);
  }finally{UnityEngine.Object.DestroyImmediate(root);}
 }
 static string Texture(Material material,string property){var texture=material.GetTexture(property);return texture==null?"":Path.GetFullPath(AssetDatabase.GetAssetPath(texture));}
}
}
