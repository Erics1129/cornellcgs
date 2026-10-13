#if UNITY_EDITOR
using System;
using System.IO;
using UnityEngine;
using UnityEditor;
namespace CarrotTD {
 // Converts verified, reduced CC0 scans into reusable static runtime prefabs.
 public static class CarrotNaturalAssets {
  const string Root="Assets/Resources/Carrot/RealNature";
  [MenuItem("Carrot/Prepare scanned nature")]
  public static void Prepare(){
   Directory.CreateDirectory(Root+"/Materials");AssetDatabase.Refresh();
   foreach(string file in Directory.GetFiles(Root+"/Textures","*.png")){
    string path=file.Replace('\\','/');var importer=AssetImporter.GetAtPath(path) as TextureImporter;if(importer==null)throw new Exception("Missing nature texture importer: "+path);
    bool normal=path.Contains("Normal"),albedo=path.Contains("Albedo");importer.textureType=normal?TextureImporterType.NormalMap:TextureImporterType.Default;importer.sRGBTexture=albedo;importer.maxTextureSize=1024;importer.mipmapEnabled=true;importer.wrapMode=TextureWrapMode.Repeat;importer.filterMode=FilterMode.Trilinear;importer.anisoLevel=4;importer.alphaSource=TextureImporterAlphaSource.FromInput;importer.alphaIsTransparency=(path.Contains("FernAlbedo")||path.Contains("ShrubAlbedo"));bool detail=path.Contains("AO")||path.Contains("Roughness");importer.maxTextureSize=detail?512:1024;importer.anisoLevel=2;CarrotBuild.WebTexture(importer,detail?512:1024,normal?85:70);importer.SaveAndReimport();
   }
   foreach(string name in new[]{"Fern","Stump","MossRockA","MossRockB","Shrub"}){
    string path=Root+"/Source/"+name+".fbx";var importer=AssetImporter.GetAtPath(path) as ModelImporter;if(importer==null)throw new Exception("Missing scan mesh: "+path);
    importer.globalScale=1;importer.useFileScale=true;importer.bakeAxisConversion=true;importer.importAnimation=false;importer.importBlendShapes=false;importer.importCameras=false;importer.importLights=false;importer.materialImportMode=ModelImporterMaterialImportMode.None;importer.importNormals=ModelImporterNormals.Import;importer.importTangents=ModelImporterTangents.CalculateMikk;importer.meshCompression=ModelImporterMeshCompression.Medium;importer.isReadable=true;importer.addCollider=false;importer.SaveAndReimport();
    var source=AssetDatabase.LoadAssetAtPath<GameObject>(path);if(source==null)throw new Exception("Scan failed to import: "+path);
    // Keep Unity's imported axis transform inside an identity gameplay root.
    // The FBX export is Y-up; replacing its conversion rotation laid the scans flat.
    var obj=new GameObject(name);var mesh=UnityEngine.Object.Instantiate(source,obj.transform);mesh.name=name+" scan";
    var renderers=obj.GetComponentsInChildren<Renderer>();if(renderers.Length==0)throw new Exception("Scan has no renderer: "+name);
    var bounds=renderers[0].bounds;foreach(var r in renderers)bounds.Encapsulate(r.bounds);
    mesh.transform.localPosition-=new Vector3(bounds.center.x,bounds.min.y,bounds.center.z);
    var material=MakeMaterial(name.StartsWith("MossRock")?"MossRock":name);
    int triangleCount=0;foreach(var filter in obj.GetComponentsInChildren<MeshFilter>()){if(filter.sharedMesh==null)continue;triangleCount+=filter.sharedMesh.triangles.Length/3;}
    if(triangleCount>=(name=="Shrub"?20000:10000))throw new Exception("Scanned prop exceeds triangle budget: "+name+" "+triangleCount);
    foreach(var r in obj.GetComponentsInChildren<Renderer>()){var materials=new Material[r.sharedMaterials.Length];for(int i=0;i<materials.Length;i++)materials[i]=material;r.sharedMaterials=materials;r.shadowCastingMode=UnityEngine.Rendering.ShadowCastingMode.On;r.receiveShadows=true;}
    foreach(var c in obj.GetComponentsInChildren<Collider>())UnityEngine.Object.DestroyImmediate(c);
    bounds=renderers[0].bounds;foreach(var r in renderers)bounds.Encapsulate(r.bounds);
    Debug.Log("CARROT_SCAN_BOUNDS "+name+" min="+bounds.min.ToString("F3")+" max="+bounds.max.ToString("F3")+" size="+bounds.size.ToString("F3")+" importedRotation="+mesh.transform.localEulerAngles.ToString("F3")+" importedScale="+mesh.transform.localScale.ToString("F3"));
    if(Mathf.Abs(bounds.min.y)>.001f||Mathf.Abs(bounds.center.x)>.001f||Mathf.Abs(bounds.center.z)>.001f)throw new Exception("Scan pivot normalization failed: "+name);
    PrefabUtility.SaveAsPrefabAsset(obj,Root+"/"+name+".prefab");UnityEngine.Object.DestroyImmediate(obj);Debug.Log("CARROT_SCAN "+name+" triangles="+triangleCount+" material="+material.name);
   }
   AssetDatabase.SaveAssets();AssetDatabase.Refresh();Debug.Log("CARROT_SCANNED_NATURE_READY 5 prefabs / 4 CC0 source assets");
  }
  static Material MakeMaterial(string name){
   string path=Root+"/Materials/"+name+".mat";var m=AssetDatabase.LoadAssetAtPath<Material>(path);var shader=Shader.Find("Carrot/Storybook");if(shader==null)throw new Exception("Carrot/Storybook shader missing");if(m==null){m=new Material(shader);AssetDatabase.CreateAsset(m,path);}m.shader=shader;m.color=Color.white;m.SetTexture("_MainTex",Texture(name,"Albedo"));m.SetTexture("_BumpMap",Texture(name,"Normal"));m.SetFloat("_BumpScale",.8f);m.SetTexture("_RoughnessMap",Texture(name,"Roughness"));m.SetFloat("_UseRoughnessMap",1);m.SetTexture("_OcclusionMap",Texture(name,"AO"));m.SetFloat("_UseOcclusionMap",1);m.SetFloat("_OcclusionStrength",.7f);m.SetFloat("_Metallic",0);m.SetFloat("_Glossiness",name=="MossRock"?.22f:name=="Stump"?.3f:.4f);m.SetFloat("_Translucency",(name=="Fern"||name=="Shrub")?.55f:0);m.SetFloat("_SnowStrength",name=="MossRock"?1:.5f);m.SetFloat("_WorldTexture",0);m.SetFloat("_ReflectionStrength",.6f);m.SetColor("_EmissionColor",Color.black);
   bool fern=name=="Fern"||name=="Shrub";m.SetFloat("_Cutoff",fern?.38f:0);m.SetFloat("_Cull",fern?0:2);m.SetFloat("_Wind",fern?.012f:0);m.renderQueue=fern?2450:2000;m.enableInstancing=true;EditorUtility.SetDirty(m);return m;
  }
  static Texture2D Texture(string name,string map){var t=AssetDatabase.LoadAssetAtPath<Texture2D>(Root+"/Textures/"+name+map+".png");if(t==null)throw new Exception("Missing scan texture "+name+map);return t;}
 }
}
#endif
