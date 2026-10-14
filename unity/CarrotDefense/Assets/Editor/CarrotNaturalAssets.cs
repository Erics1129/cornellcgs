#if UNITY_EDITOR
using System;
using System.IO;
using UnityEngine;
using UnityEditor;
namespace CarrotTD {
 // Converts verified, reduced CC0 scans into reusable static runtime prefabs.
 // Each scan yields two prefabs: <Name> (the full scan, cast shadows, for the eight hero anchors of a level) and <Name>Small
 // (the decimated level of detail from Tools/decimate_carrot_scans.py, no shadows of its own, plus a coarser shadows-only
 // caster child), which the view places about a hundred times per level at 18-40 px on screen.
 public static class CarrotNaturalAssets {
  const string Root="Assets/Resources/Carrot/RealNature";
  static readonly string[] Scans={"Fern","Stump","MossRockA","MossRockB","Shrub"};
  [MenuItem("Carrot/Prepare scanned nature")]
  public static void Prepare(){
   Directory.CreateDirectory(Root+"/Materials");AssetDatabase.Refresh();
   foreach(string file in Directory.GetFiles(Root+"/Textures","*.png")){
    string path=file.Replace('\\','/');var importer=AssetImporter.GetAtPath(path) as TextureImporter;if(importer==null)throw new Exception("Missing nature texture importer: "+path);
    bool normal=path.Contains("Normal"),albedo=path.Contains("Albedo");importer.textureType=normal?TextureImporterType.NormalMap:TextureImporterType.Default;importer.sRGBTexture=albedo;importer.maxTextureSize=1024;importer.mipmapEnabled=true;importer.wrapMode=TextureWrapMode.Repeat;importer.filterMode=FilterMode.Trilinear;importer.anisoLevel=4;importer.alphaSource=TextureImporterAlphaSource.FromInput;importer.alphaIsTransparency=(path.Contains("FernAlbedo")||path.Contains("ShrubAlbedo"));bool detail=path.Contains("AO")||path.Contains("Roughness");importer.maxTextureSize=detail?256:512;importer.anisoLevel=2;CarrotBuild.WebTexture(importer,detail?256:512,normal?85:70);importer.SaveAndReimport();
   }
   foreach(string name in Scans){
    foreach(string suffix in new[]{"","Small","Caster"})ImportScan(name+suffix);
    var material=MakeMaterial(name.StartsWith("MossRock")?"MossRock":name);
    BuildPrefab(name,name,null,material);
    BuildPrefab(name+"Small",name+"Small",name+"Caster",material);
   }
   AssetDatabase.SaveAssets();AssetDatabase.Refresh();Debug.Log("CARROT_SCANNED_NATURE_READY 10 prefabs (5 full, 5 small with casters) / 4 CC0 source assets");
  }
  static void ImportScan(string file){
   string path=Root+"/Source/"+file+".fbx";var importer=AssetImporter.GetAtPath(path) as ModelImporter;if(importer==null)throw new Exception("Missing scan mesh: "+path);
   importer.globalScale=1;importer.useFileScale=true;importer.bakeAxisConversion=true;importer.importAnimation=false;importer.importBlendShapes=false;importer.importCameras=false;importer.importLights=false;importer.materialImportMode=ModelImporterMaterialImportMode.None;importer.importNormals=ModelImporterNormals.Import;importer.importTangents=ModelImporterTangents.CalculateMikk;importer.meshCompression=ModelImporterMeshCompression.Medium;importer.isReadable=true;importer.addCollider=false;importer.SaveAndReimport();
  }
  /// <summary>Instantiates a scan under an identity root, grounds and centres it, and returns the mesh child and the combined bounds.</summary>
  static GameObject Place(string file,Transform root,string label,out Bounds bounds){
   string path=Root+"/Source/"+file+".fbx";var source=AssetDatabase.LoadAssetAtPath<GameObject>(path);if(source==null)throw new Exception("Scan failed to import: "+path);
   // Keep Unity's imported axis transform inside an identity gameplay root.
   // The FBX export is Y-up; replacing its conversion rotation laid the scans flat.
   var mesh=UnityEngine.Object.Instantiate(source,root);mesh.name=label;
   var renderers=mesh.GetComponentsInChildren<Renderer>();if(renderers.Length==0)throw new Exception("Scan has no renderer: "+file);
   bounds=renderers[0].bounds;foreach(var r in renderers)bounds.Encapsulate(r.bounds);
   mesh.transform.localPosition-=new Vector3(bounds.center.x,bounds.min.y,bounds.center.z);
   bounds=renderers[0].bounds;foreach(var r in renderers)bounds.Encapsulate(r.bounds);
   return mesh;
  }
  static void BuildPrefab(string prefabName,string visibleFile,string casterFile,Material material){
   var obj=new GameObject(prefabName);Bounds bounds;var mesh=Place(visibleFile,obj.transform,visibleFile+" scan",out bounds);
   int triangleCount=0;foreach(var filter in obj.GetComponentsInChildren<MeshFilter>()){if(filter.sharedMesh==null)continue;triangleCount+=filter.sharedMesh.triangles.Length/3;}
   if(triangleCount>=(prefabName.StartsWith("Shrub")?20000:10000))throw new Exception("Scanned prop exceeds triangle budget: "+prefabName+" "+triangleCount);
   bool small=casterFile!=null;
   foreach(var r in mesh.GetComponentsInChildren<Renderer>()){var materials=new Material[r.sharedMaterials.Length];for(int i=0;i<materials.Length;i++)materials[i]=material;r.sharedMaterials=materials;r.shadowCastingMode=small?UnityEngine.Rendering.ShadowCastingMode.Off:UnityEngine.Rendering.ShadowCastingMode.On;r.receiveShadows=true;}
   int casterTriangles=0;
   if(small){
    // The caster shares the visible mesh's normalized placement (same source pivot), so the two line up to within the decimation's own drift.
    Bounds casterBounds;var caster=Place(casterFile,obj.transform,casterFile+" shadow",out casterBounds);caster.transform.localPosition=mesh.transform.localPosition;caster.transform.localRotation=mesh.transform.localRotation;caster.transform.localScale=mesh.transform.localScale;
    foreach(var r in caster.GetComponentsInChildren<Renderer>()){var materials=new Material[r.sharedMaterials.Length];for(int i=0;i<materials.Length;i++)materials[i]=material;r.sharedMaterials=materials;r.shadowCastingMode=UnityEngine.Rendering.ShadowCastingMode.ShadowsOnly;r.receiveShadows=false;}
    foreach(var filter in caster.GetComponentsInChildren<MeshFilter>())if(filter.sharedMesh!=null)casterTriangles+=filter.sharedMesh.triangles.Length/3;
   }
   foreach(var c in obj.GetComponentsInChildren<Collider>())UnityEngine.Object.DestroyImmediate(c);
   Debug.Log("CARROT_SCAN_BOUNDS "+prefabName+" min="+bounds.min.ToString("F3")+" max="+bounds.max.ToString("F3")+" size="+bounds.size.ToString("F3")+" importedRotation="+mesh.transform.localEulerAngles.ToString("F3")+" importedScale="+mesh.transform.localScale.ToString("F3"));
   if(Mathf.Abs(bounds.min.y)>.001f||Mathf.Abs(bounds.center.x)>.001f||Mathf.Abs(bounds.center.z)>.001f)throw new Exception("Scan pivot normalization failed: "+prefabName);
   PrefabUtility.SaveAsPrefabAsset(obj,Root+"/"+prefabName+".prefab");UnityEngine.Object.DestroyImmediate(obj);Debug.Log("CARROT_SCAN "+prefabName+" triangles="+triangleCount+" caster="+casterTriangles+" material="+material.name);
  }
  static Material MakeMaterial(string name){
   string path=Root+"/Materials/"+name+".mat";var m=AssetDatabase.LoadAssetAtPath<Material>(path);var shader=Shader.Find("Carrot/Storybook");if(shader==null)throw new Exception("Carrot/Storybook shader missing");if(m==null){m=new Material(shader);AssetDatabase.CreateAsset(m,path);}m.shader=shader;m.color=Color.white;m.SetTexture("_MainTex",Texture(name,"Albedo"));m.SetTexture("_BumpMap",Texture(name,"Normal"));m.SetFloat("_BumpScale",.8f);m.SetTexture("_RoughnessMap",Texture(name,"Roughness"));m.SetFloat("_UseRoughnessMap",1);m.SetTexture("_OcclusionMap",Texture(name,"AO"));m.SetFloat("_UseOcclusionMap",1);m.SetFloat("_OcclusionStrength",.7f);m.SetFloat("_Metallic",0);m.SetFloat("_Glossiness",name=="MossRock"?.22f:name=="Stump"?.3f:.4f);m.SetFloat("_Translucency",(name=="Fern"||name=="Shrub")?.55f:0);m.SetFloat("_SnowStrength",name=="MossRock"?1:.5f);m.SetFloat("_WorldTexture",0);m.SetFloat("_ReflectionStrength",.6f);m.SetColor("_EmissionColor",Color.black);
   bool fern=name=="Fern"||name=="Shrub";m.SetFloat("_Cutoff",fern?.38f:0);m.SetFloat("_Cull",fern?0:2);m.SetFloat("_Wind",fern?.012f:0);m.renderQueue=fern?2450:2000;m.enableInstancing=false;
   // Living-miniature response (Storybook T0): fronds scatter light past the terminator, stumps get fine bark grain; rocks stay as scanned.
   m.SetFloat("_Subsurface",fern?.35f:0);m.SetColor("_SubsurfaceTint",new Color(.62f,1f,.30f));m.SetFloat("_Sheen",0);m.SetColor("_SheenTint",Color.white);
   var grain=name=="Stump"?AssetDatabase.LoadAssetAtPath<Texture2D>("Assets/Resources/Carrot/Textures/PBR/BarkNormal.png"):null;m.SetTexture("_DetailNormal",grain);m.SetFloat("_DetailScale",3);m.SetFloat("_DetailStrength",grain!=null?.4f:0);
   m.SetFloat("_HitFlash",0);m.SetFloat("_RimBoost",0);
   EditorUtility.SetDirty(m);return m;
  }
  static Texture2D Texture(string name,string map){var t=AssetDatabase.LoadAssetAtPath<Texture2D>(Root+"/Textures/"+name+map+".png");if(t==null)throw new Exception("Missing scan texture "+name+map);return t;}
 }
}
#endif
