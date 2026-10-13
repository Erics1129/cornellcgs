using System;
using System.IO;
using System.Reflection;
using UnityEditor;
using UnityEngine;
using UnityEngine.Rendering;
using UnityEngine.Rendering.Universal;

namespace CarrotTD {
/// <summary>Deterministic URP assets: two quality tiers, their renderers and the per-biome grading profiles.</summary>
public static class CarrotPipeline {
 public const string Folder="Assets/Resources/Carrot/Settings";
 public const string Volumes="Assets/Resources/Carrot/Volumes";
 public static void Prepare() {
  Directory.CreateDirectory(Folder);Directory.CreateDirectory(Volumes);AssetDatabase.Refresh();
  var high=Pipeline("CarrotURP-High",true);var low=Pipeline("CarrotURP-Low",false);
  GraphicsSettings.defaultRenderPipeline=high;
  int levels=QualitySettings.names.Length;int current=QualitySettings.GetQualityLevel();
  for(int i=0;i<levels;i++){QualitySettings.SetQualityLevel(i,false);QualitySettings.renderPipeline=null;}
  QualitySettings.SetQualityLevel(current,false);
  var globalType=typeof(UniversalRenderPipeline).Assembly.GetType("UnityEngine.Rendering.Universal.UniversalRenderPipelineGlobalSettings");
  var ensure=globalType!=null?globalType.GetMethod("Ensure",BindingFlags.Public|BindingFlags.NonPublic|BindingFlags.Static):null;
  if(ensure!=null){var parameters=ensure.GetParameters();var values=new object[parameters.Length];for(int i=0;i<parameters.Length;i++)values[i]=parameters[i].HasDefaultValue?parameters[i].DefaultValue:null;ensure.Invoke(null,values);}
  var strip=GraphicsSettings.GetRenderPipelineSettings<URPShaderStrippingSetting>();
  if(strip!=null){strip.stripUnusedVariants=true;strip.stripUnusedPostProcessingVariants=true;strip.stripScreenCoordOverrideVariants=true;}
  var core=GraphicsSettings.GetRenderPipelineSettings<ShaderStrippingSetting>();
  if(core!=null){core.stripRuntimeDebugShaders=true;core.exportShaderVariants=false;}
  var global=GraphicsSettings.GetSettingsForRenderPipeline<UniversalRenderPipeline>();
  if(global!=null)EditorUtility.SetDirty(global);
  foreach(var biome in new[]{"garden","marsh","frost"})Profile(biome);
  AssetDatabase.SaveAssets();AssetDatabase.Refresh();
  Debug.Log("CARROT_PIPELINE_READY high="+AssetDatabase.GetAssetPath(high)+" low="+AssetDatabase.GetAssetPath(low));
 }
 static UniversalRenderPipelineAsset Pipeline(string name,bool high) {
  string path=Folder+"/"+name+".asset",rendererPath=Folder+"/"+name+"-Renderer.asset";
  AssetDatabase.DeleteAsset(path);AssetDatabase.DeleteAsset(rendererPath);
  var renderer=ScriptableObject.CreateInstance<UniversalRendererData>();renderer.name=name+"-Renderer";
  var defaultData=typeof(PostProcessData).GetMethod("GetDefaultPostProcessData",BindingFlags.NonPublic|BindingFlags.Static);
  renderer.postProcessData=defaultData!=null?defaultData.Invoke(null,null) as PostProcessData:null;
  renderer.renderingMode=RenderingMode.Forward;renderer.depthPrimingMode=DepthPrimingMode.Disabled;renderer.copyDepthMode=CopyDepthMode.AfterOpaques;renderer.shadowTransparentReceive=true;
  AssetDatabase.CreateAsset(renderer,rendererPath);ResourceReloader.ReloadAllNullIn(renderer,UniversalRenderPipelineAsset.packagePath);
  if(renderer.postProcessData==null)throw new InvalidOperationException("URP post-process data could not be resolved.");
  if(high){
   var ssao=ScriptableObject.CreateInstance<ScreenSpaceAmbientOcclusion>();ssao.name="Contact occlusion";AssetDatabase.AddObjectToAsset(ssao,renderer);
   var so=new SerializedObject(ssao);var s=so.FindProperty("m_Settings");
   s.FindPropertyRelative("AOMethod").enumValueIndex=1;s.FindPropertyRelative("Downsample").boolValue=true;s.FindPropertyRelative("AfterOpaque").boolValue=true;
   s.FindPropertyRelative("Source").enumValueIndex=0;s.FindPropertyRelative("NormalSamples").enumValueIndex=1;s.FindPropertyRelative("Intensity").floatValue=1.1f;
   s.FindPropertyRelative("DirectLightingStrength").floatValue=.25f;s.FindPropertyRelative("Radius").floatValue=.32f;s.FindPropertyRelative("Samples").enumValueIndex=1;
   s.FindPropertyRelative("BlurQuality").enumValueIndex=1;s.FindPropertyRelative("Falloff").floatValue=60;so.ApplyModifiedPropertiesWithoutUndo();
   AssetDatabase.SaveAssets();AssetDatabase.ImportAsset(rendererPath);
   var rso=new SerializedObject(renderer);var list=rso.FindProperty("m_RendererFeatures");var map=rso.FindProperty("m_RendererFeatureMap");
   list.arraySize=1;list.GetArrayElementAtIndex(0).objectReferenceValue=ssao;map.arraySize=1;
   if(AssetDatabase.TryGetGUIDAndLocalFileIdentifier(ssao,out _,out long localId))map.GetArrayElementAtIndex(0).longValue=localId;
   rso.ApplyModifiedPropertiesWithoutUndo();
  }
  var asset=UniversalRenderPipelineAsset.Create(renderer);asset.name=name;AssetDatabase.CreateAsset(asset,path);
  var o=new SerializedObject(asset);
  Set(o,"m_RendererDataList",renderer);
  o.FindProperty("m_RequireDepthTexture").boolValue=high;o.FindProperty("m_RequireOpaqueTexture").boolValue=high;o.FindProperty("m_OpaqueDownsampling").enumValueIndex=0;
  o.FindProperty("m_SupportsTerrainHoles").boolValue=false;o.FindProperty("m_SupportsHDR").boolValue=true;o.FindProperty("m_HDRColorBufferPrecision").enumValueIndex=0;
  o.FindProperty("m_MSAA").intValue=high?1:2;o.FindProperty("m_RenderScale").floatValue=1;
  o.FindProperty("m_MainLightRenderingMode").enumValueIndex=1;o.FindProperty("m_MainLightShadowsSupported").boolValue=true;o.FindProperty("m_MainLightShadowmapResolution").intValue=high?2048:1024;
  o.FindProperty("m_AdditionalLightsRenderingMode").enumValueIndex=high?2:1;o.FindProperty("m_AdditionalLightsPerObjectLimit").intValue=high?4:2;o.FindProperty("m_AdditionalLightShadowsSupported").boolValue=false;
  o.FindProperty("m_ReflectionProbeBlending").boolValue=false;o.FindProperty("m_ReflectionProbeBoxProjection").boolValue=false;o.FindProperty("m_ReflectionProbeAtlas").boolValue=false;
  o.FindProperty("m_ShadowDistance").floatValue=high?40:28;o.FindProperty("m_ShadowCascadeCount").intValue=high?2:1;o.FindProperty("m_Cascade2Split").floatValue=.3f;o.FindProperty("m_CascadeBorder").floatValue=.15f;
  o.FindProperty("m_ShadowDepthBias").floatValue=1;o.FindProperty("m_ShadowNormalBias").floatValue=.6f;o.FindProperty("m_SoftShadowsSupported").boolValue=true;o.FindProperty("m_SoftShadowQuality").enumValueIndex=high?1:0;
  o.FindProperty("m_SupportsLightCookies").boolValue=high;o.FindProperty("m_AdditionalLightsCookieResolution").intValue=1024;o.FindProperty("m_AdditionalLightsCookieFormat").enumValueIndex=1;
  o.FindProperty("m_UseSRPBatcher").boolValue=true;o.FindProperty("m_SupportsDynamicBatching").boolValue=false;o.FindProperty("m_MixedLightingSupported").boolValue=false;o.FindProperty("m_SupportsLightLayers").boolValue=false;
  o.FindProperty("m_ColorGradingMode").enumValueIndex=0;o.FindProperty("m_ColorGradingLutSize").intValue=32;o.FindProperty("m_UseFastSRGBLinearConversion").boolValue=false;
  o.FindProperty("m_SupportDataDrivenLensFlare").boolValue=false;o.FindProperty("m_SupportScreenSpaceLensFlare").boolValue=false;o.FindProperty("m_UseAdaptivePerformance").boolValue=false;
  o.FindProperty("m_EnableLODCrossFade").boolValue=false;o.FindProperty("m_ShadowType").enumValueIndex=2;
  o.ApplyModifiedPropertiesWithoutUndo();EditorUtility.SetDirty(asset);EditorUtility.SetDirty(renderer);
  return asset;
 }
 static void Set(SerializedObject o,string listName,UnityEngine.Object value){var p=o.FindProperty(listName);p.arraySize=1;p.GetArrayElementAtIndex(0).objectReferenceValue=value;}
 static void Profile(string biome) {
  string path=Volumes+"/"+biome+".asset";AssetDatabase.DeleteAsset(path);
  var profile=ScriptableObject.CreateInstance<VolumeProfile>();profile.name=biome;AssetDatabase.CreateAsset(profile,path);
  T Add<T>() where T:VolumeComponent{var c=profile.Add<T>(true);c.name=typeof(T).Name;AssetDatabase.AddObjectToAsset(c,profile);return c;}
  var tone=Add<Tonemapping>();tone.mode.value=TonemappingMode.ACES;
  var bloom=Add<Bloom>();bloom.threshold.value=.9f;bloom.intensity.value=.35f;bloom.scatter.value=.6f;bloom.clamp.value=8;bloom.highQualityFiltering.value=true;
  var adjust=Add<ColorAdjustments>();adjust.postExposure.value=biome=="garden"?.35f:biome=="marsh"?.15f:-.05f;adjust.contrast.value=biome=="garden"?8:biome=="marsh"?10:6;adjust.saturation.value=biome=="garden"?6:biome=="marsh"?2:0;
  var vignette=Add<Vignette>();vignette.intensity.value=.22f;vignette.smoothness.value=.45f;vignette.color.value=biome=="marsh"?new Color(.02f,.04f,.08f):new Color(.05f,.05f,.08f);
  var dof=Add<DepthOfField>();dof.mode.value=DepthOfFieldMode.Gaussian;dof.gaussianStart.value=24;dof.gaussianEnd.value=44;dof.gaussianMaxRadius.value=1;dof.highQualitySampling.value=false;
  var smh=Add<ShadowsMidtonesHighlights>();
  smh.shadows.value=biome=="garden"?new Vector4(.98f,.99f,1.05f,0):biome=="marsh"?new Vector4(.92f,.98f,1.12f,0):new Vector4(.94f,.97f,1.08f,0);
  smh.highlights.value=biome=="garden"?new Vector4(1.04f,1,.94f,0):biome=="marsh"?new Vector4(.9f,1,1.1f,0):new Vector4(1,1,1.02f,0);
  var chroma=Add<ChromaticAberration>();chroma.intensity.value=0;
  EditorUtility.SetDirty(profile);
 }
}
}
