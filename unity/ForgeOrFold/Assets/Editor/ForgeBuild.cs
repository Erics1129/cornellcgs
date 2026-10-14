using UnityEditor;
using UnityEditor.SceneManagement;
using UnityEngine;
using UnityEditor.Build.Reporting;
using System.IO;
using System.Linq;
public static class ForgeBuild {
 public static void Prepare() {
  SmithImport.Prepare();ForgeMaterialImport.Prepare();
  var scene=EditorSceneManager.NewScene(NewSceneSetup.EmptyScene,NewSceneMode.Single);
  new GameObject("Forge").AddComponent<ForgeWorld>();
  // The room is closed and the camera clears to a solid colour, so the default procedural skybox is never seen;
  // dropping it keeps its material and shader out of the data file.
  RenderSettings.skybox=null;
  Directory.CreateDirectory("Assets/Scenes"); EditorSceneManager.SaveScene(scene,"Assets/Scenes/Forge.unity");
  EditorBuildSettings.scenes=new[]{new EditorBuildSettingsScene("Assets/Scenes/Forge.unity",true)};
  PlayerSettings.companyName="Cornell Computational Game Society"; PlayerSettings.productName="Forge or Fold";
  PlayerSettings.colorSpace=ColorSpace.Linear; PlayerSettings.runInBackground=false;
  PlayerSettings.WebGL.compressionFormat=WebGLCompressionFormat.Gzip; PlayerSettings.WebGL.decompressionFallback=true;
  PlayerSettings.WebGL.dataCaching=true; PlayerSettings.WebGL.initialMemorySize=128; PlayerSettings.WebGL.maximumMemorySize=512;
  PlayerSettings.WebGL.nameFilesAsHashes=false; PlayerSettings.WebGL.showDiagnostics=false;
  PlayerSettings.stripEngineCode=true; PlayerSettings.SetManagedStrippingLevel(UnityEditor.Build.NamedBuildTarget.WebGL,ManagedStrippingLevel.Low);
  PlayerSettings.defaultWebScreenWidth=1440; PlayerSettings.defaultWebScreenHeight=900;
  PlayerSettings.WebGL.template="APPLICATION:Minimal";
  // Unity 6 allows the splash to be off on every licence; it held the first frame for about 2 s.
  PlayerSettings.SplashScreen.show=false;PlayerSettings.SplashScreen.showUnityLogo=false;
  PlayerSettings.SetIl2CppCodeGeneration(UnityEditor.Build.NamedBuildTarget.WebGL,UnityEditor.Build.Il2CppCodeGeneration.OptimizeSize);
  // The WebGL 'High' quality level keeps vSyncCount 1 (120 Hz pacing depends on it); the line below only touches the
  // editor's current level. Anti-aliasing is chosen at runtime by the room's AA tiers.
  QualitySettings.antiAliasing=2; QualitySettings.shadows=ShadowQuality.All; QualitySettings.shadowResolution=ShadowResolution.Medium;
  QualitySettings.shadowDistance=24; QualitySettings.vSyncCount=0;
  foreach(var file in new[]{"Fire"}) { var t=(TextureImporter)AssetImporter.GetAtPath("Assets/Resources/Forge/"+file+".png"); if(t!=null){ t.maxTextureSize=1024;t.textureCompression=TextureImporterCompression.Compressed;t.mipmapEnabled=file!="Fire";t.wrapMode=TextureWrapMode.Repeat;t.anisoLevel=4;t.SaveAndReimport();} }
  var graphics=new SerializedObject(AssetDatabase.LoadAllAssetsAtPath("ProjectSettings/GraphicsSettings.asset")[0]);
  var shaders=graphics.FindProperty("m_AlwaysIncludedShaders");
  foreach(var name in new[]{"Standard","Forge/Fire","Forge/Glow","Forge/Blade","Forge/Smith","Forge/Glove","Forge/Surface","Forge/Finish","Forge/Spark","Forge/Smoke",ForgeContract.Shaders.ParticleAdd,ForgeContract.Shaders.ParticleLit,ForgeContract.Shaders.Smear,ForgeContract.Shaders.Shaft}) {var shader=Shader.Find(name);bool found=false;for(int i=0;i<shaders.arraySize;i++)if(shaders.GetArrayElementAtIndex(i).objectReferenceValue==shader)found=true;if(!found&&shader!=null){shaders.InsertArrayElementAtIndex(shaders.arraySize);shaders.GetArrayElementAtIndex(shaders.arraySize-1).objectReferenceValue=shader;}}
  graphics.ApplyModifiedProperties();AssetDatabase.SaveAssets();
 }
 public static void Web() {Prepare();var output=Path.GetFullPath("../../public/unity/forge");Directory.CreateDirectory(output);var report=BuildPipeline.BuildPlayer(new BuildPlayerOptions{scenes=new[]{"Assets/Scenes/Forge.unity"},locationPathName=output,target=BuildTarget.WebGL,options=BuildOptions.None}); if(report.summary.result!=BuildResult.Succeeded)throw new System.Exception("Forge Web build failed: "+report.summary.result);using(var sha=System.Security.Cryptography.SHA256.Create()){var data=File.ReadAllBytes(Path.Combine(output,"Build/forge.data.unityweb")).Concat(File.ReadAllBytes(Path.Combine(output,"Build/forge.wasm.unityweb"))).ToArray();var hash=System.BitConverter.ToString(sha.ComputeHash(data)).Replace("-","").Substring(0,16).ToLowerInvariant();File.WriteAllText(Path.GetFullPath("../../src/minigames/forge/unity-build.json"),"{\"version\":\""+hash+"\"}\n");}Debug.Log("FORGE_BUILD_OK "+report.summary.totalSize);}
}
