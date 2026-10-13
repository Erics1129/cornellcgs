using System;
using System.IO;
using System.Linq;
using UnityEditor;
using UnityEditor.Build;
using UnityEditor.Build.Reporting;
using UnityEditor.SceneManagement;
using UnityEngine;

namespace CarrotTD {
public static class CarrotBuild {
 const string ScenePath="Assets/Scenes/Carrot.unity";
 public static void Prepare() {
  CarrotPipeline.Prepare();
  CarrotVfxSheet.Prepare();
  CarrotCinematicsAuthoring.Prepare();
  PreparePhysicalTextures();
  CarrotModels.Prepare();
  CarrotNaturalAssets.Prepare();
  var scene=EditorSceneManager.NewScene(NewSceneSetup.EmptyScene,NewSceneMode.Single);
  var game=new GameObject("CarrotGame");game.AddComponent<CarrotGame>();game.AddComponent<CarrotView>();
  Directory.CreateDirectory("Assets/Scenes");EditorSceneManager.SaveScene(scene,ScenePath);
  EditorBuildSettings.scenes=new[]{new EditorBuildSettingsScene(ScenePath,true)};
  PlayerSettings.companyName="Cornell Computational Game Society";PlayerSettings.productName="Carrot Defense 3D";
  PlayerSettings.bundleVersion="1.0";PlayerSettings.colorSpace=ColorSpace.Linear;PlayerSettings.runInBackground=false;
  PlayerSettings.WebGL.compressionFormat=WebGLCompressionFormat.Gzip;PlayerSettings.WebGL.decompressionFallback=true;
  PlayerSettings.WebGL.dataCaching=true;PlayerSettings.WebGL.initialMemorySize=160;PlayerSettings.SetIl2CppCodeGeneration(NamedBuildTarget.WebGL,Il2CppCodeGeneration.OptimizeSize);PlayerSettings.WebGL.maximumMemorySize=512;
  PlayerSettings.WebGL.nameFilesAsHashes=false;PlayerSettings.WebGL.showDiagnostics=false;PlayerSettings.WebGL.template="APPLICATION:Minimal";
  PlayerSettings.stripEngineCode=true;PlayerSettings.SetManagedStrippingLevel(NamedBuildTarget.WebGL,ManagedStrippingLevel.Medium);
  PlayerSettings.defaultWebScreenWidth=1440;PlayerSettings.defaultWebScreenHeight=900;
  PlayerSettings.gpuSkinning=true;PlayerSettings.SplashScreen.show=false;PlayerSettings.SplashScreen.showUnityLogo=false;
  PlayerSettings.SetGraphicsAPIs(BuildTarget.WebGL,new[]{UnityEngine.Rendering.GraphicsDeviceType.OpenGLES3});
  QualitySettings.vSyncCount=0;
  var settings=AssetDatabase.LoadAllAssetsAtPath("ProjectSettings/GraphicsSettings.asset");
  if(settings.Length==0)throw new InvalidOperationException("Graphics settings were not created by Unity.");
  var graphics=new SerializedObject(settings[0]);var shaders=graphics.FindProperty("m_AlwaysIncludedShaders");
  var standard=Shader.Find("Standard");
  for(int i=shaders.arraySize-1;i>=0;i--)if(shaders.GetArrayElementAtIndex(i).objectReferenceValue==standard)shaders.DeleteArrayElementAtIndex(i);
  foreach(var name in new[]{"Carrot/Storybook","Carrot/FxAdditive","Carrot/FxAlpha","Carrot/Water","Carrot/Contact","Carrot/FxDecalQuad","Carrot/Sky","Carrot/HeightFog"}) {
   var shader=Shader.Find(name);if(!shader)throw new InvalidOperationException("Missing shader "+name);
   bool found=false;for(int i=0;i<shaders.arraySize;i++)if(shaders.GetArrayElementAtIndex(i).objectReferenceValue==shader)found=true;
   if(!found){shaders.InsertArrayElementAtIndex(shaders.arraySize);shaders.GetArrayElementAtIndex(shaders.arraySize-1).objectReferenceValue=shader;}
  }
  graphics.ApplyModifiedProperties();AssetDatabase.SaveAssets();
 }
 /// <summary>Crunched DXT for the web target; the data file is dominated by textures.</summary>
 public static void WebTexture(TextureImporter importer,int maxSize,int quality,bool crunch=true) {
  var settings=importer.GetPlatformTextureSettings("WebGL");settings.overridden=true;settings.maxTextureSize=maxSize;settings.format=TextureImporterFormat.Automatic;
  settings.textureCompression=TextureImporterCompression.Compressed;settings.crunchedCompression=crunch;settings.compressionQuality=quality;importer.SetPlatformTextureSettings(settings);
  importer.textureCompression=TextureImporterCompression.Compressed;importer.crunchedCompression=crunch;importer.compressionQuality=quality;
 }
 static void PreparePhysicalTextures() {
  AssetDatabase.Refresh();
  const string root="Assets/Resources/Carrot/Textures";
  foreach(var path in Directory.GetFiles(root+"/PBR").Where(p=>p.EndsWith(".png")||p.EndsWith(".jpg"))) {
   var importer=AssetImporter.GetAtPath(path.Replace('\\','/')) as TextureImporter;if(importer==null)continue;
   bool normal=path.Contains("Normal"),linear=normal||path.Contains("Roughness")||path.Contains("AO");
   importer.textureType=normal?TextureImporterType.NormalMap:TextureImporterType.Default;
   importer.sRGBTexture=!linear;importer.isReadable=false;importer.mipmapEnabled=true;
   bool detail=path.Contains("AO")||path.Contains("Roughness");
   // 512 px albedo and normal, 256 px AO and roughness: at 46-97 px per world unit with TextureScale 0.85-1.3 the 1024 mip is never sampled, so this is lossless on screen and halves the texture download.
   importer.maxTextureSize=detail?256:512;importer.anisoLevel=path.Contains("Soil")?4:2;importer.wrapMode=TextureWrapMode.Repeat;
   WebTexture(importer,detail?256:512,normal?85:70);importer.SaveAndReimport();
  }
  var environment=AssetImporter.GetAtPath(root+"/Environment.hdr") as TextureImporter;
  if(environment!=null) {
   environment.textureType=TextureImporterType.Default;environment.textureShape=TextureImporterShape.TextureCube;
   environment.generateCubemap=TextureImporterGenerateCubemap.AutoCubemap;
   var settings=new TextureImporterSettings();environment.ReadTextureSettings(settings);settings.cubemapConvolution=TextureImporterCubemapConvolution.Specular;environment.SetTextureSettings(settings);
   environment.sRGBTexture=false;environment.isReadable=false;environment.maxTextureSize=256;
   environment.mipmapEnabled=true;WebTexture(environment,128,70,false);environment.SaveAndReimport();
  }
 }
 public static void Web() {
  Prepare();
  var output=Path.GetFullPath("../../public/unity/carrot");Directory.CreateDirectory(output);
  var report=BuildPipeline.BuildPlayer(new BuildPlayerOptions{scenes=new[]{ScenePath},locationPathName=output,target=BuildTarget.WebGL,options=BuildOptions.None});
  if(report.summary.result!=BuildResult.Succeeded)throw new Exception("Carrot Web build failed: "+report.summary.result);
  using(var sha=System.Security.Cryptography.SHA256.Create()) {
   var files=new[]{"carrot.data.unityweb","carrot.wasm.unityweb","carrot.framework.js.unityweb"};
   var bytes=files.SelectMany(f=>File.ReadAllBytes(Path.Combine(output,"Build",f))).ToArray();
   var hash=BitConverter.ToString(sha.ComputeHash(bytes)).Replace("-","").Substring(0,16).ToLowerInvariant();
   File.WriteAllText(Path.GetFullPath("../../src/minigames/carrot/unity-build.json"),"{\"version\":\""+hash+"\"}\n");
  }
  Debug.Log("CARROT_BUILD_OK "+report.summary.totalSize);
 }
}
}
