using System;
using System.IO;
using System.Reflection;
using UnityEditor;
using UnityEngine;
using UnityEngine.Rendering;
using UnityEngine.Rendering.Universal;

namespace CarrotTD {
/// <summary>Deterministic URP assets: three quality tiers, their renderers and the per-biome grading profiles.</summary>
public static class CarrotPipeline {
 public const string Folder="Assets/Resources/Carrot/Settings";
 public const bool UseSsao=false;
 public const string Volumes="Assets/Resources/Carrot/Volumes";
 public static void Prepare() {
  Directory.CreateDirectory(Folder);Directory.CreateDirectory(Volumes);AssetDatabase.Refresh();
  var high=Pipeline("CarrotURP-High",CarrotQuality.HighTier);var medium=Pipeline("CarrotURP-Medium",CarrotQuality.MediumTier);var low=Pipeline("CarrotURP-Low",CarrotQuality.LowTier);
  GraphicsSettings.defaultRenderPipeline=high;
  int levels=QualitySettings.names.Length;int current=QualitySettings.GetQualityLevel();
  // Quality level 0 carries the Low asset and level 1 the Medium asset so their shader variants survive prefiltering; the rest use the default (High).
  for(int i=0;i<levels;i++){QualitySettings.SetQualityLevel(i,false);QualitySettings.renderPipeline=i==0?low:i==1?medium:null;}
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
  foreach(var biome in new[]{"garden","marsh","frost","orchard"})Profile(biome);
  AssetDatabase.SaveAssets();AssetDatabase.Refresh();
  Debug.Log("CARROT_PIPELINE_READY high="+AssetDatabase.GetAssetPath(high)+" medium="+AssetDatabase.GetAssetPath(medium)+" low="+AssetDatabase.GetAssetPath(low));
 }
 /// <summary>
 /// High (tier 2): depth texture copied after opaques (one fullscreen blit; the forced DepthOnly prepass drew every opaque object twice),
 /// one 1536 shadow cascade over the whole diorama, soft shadows Medium, per-pixel point lights, light cookies, height fog.
 /// Medium (tier 1): the same scene with one 1024 cascade, soft shadows Low, per-vertex point lights, no cookies, height fog, FXAA.
 /// Low (tier 0): no depth texture at all, MSAA 2, one 768 cascade, per-vertex lights, no post features beyond the grading volume.
 /// The opaque texture is never requested here: CarrotView switches it on at runtime for marsh levels only (Carrot/Water samples it).
 /// The after-opaques depth copy needs MSAA 1 on WebGL2 (an MSAA depth copy fails there and the depth of field blurs the whole frame),
 /// so High and Medium assert MSAA 1.
 /// </summary>
 static UniversalRenderPipelineAsset Pipeline(string name,int tier) {
  bool high=tier==CarrotQuality.HighTier,rich=tier>=CarrotQuality.MediumTier;int msaa=rich?1:2;
  if(rich&&msaa!=1)throw new InvalidOperationException("High and Medium copy depth after opaques, which needs MSAA 1 on WebGL2.");
  string path=Folder+"/"+name+".asset",rendererPath=Folder+"/"+name+"-Renderer.asset";
  AssetDatabase.DeleteAsset(path);AssetDatabase.DeleteAsset(rendererPath);
  var renderer=ScriptableObject.CreateInstance<UniversalRendererData>();renderer.name=name+"-Renderer";
  var defaultData=typeof(PostProcessData).GetMethod("GetDefaultPostProcessData",BindingFlags.NonPublic|BindingFlags.Static);
  renderer.postProcessData=defaultData!=null?defaultData.Invoke(null,null) as PostProcessData:null;
  renderer.renderingMode=RenderingMode.Forward;renderer.depthPrimingMode=DepthPrimingMode.Disabled;renderer.copyDepthMode=CopyDepthMode.AfterOpaques;renderer.shadowTransparentReceive=true;
  AssetDatabase.CreateAsset(renderer,rendererPath);ResourceReloader.ReloadAllNullIn(renderer,UniversalRenderPipelineAsset.packagePath);
  if(renderer.postProcessData==null)throw new InvalidOperationException("URP post-process data could not be resolved.");
  if(rich){
   var ssao=ScriptableObject.CreateInstance<ScreenSpaceAmbientOcclusion>();ssao.name="Contact occlusion";AssetDatabase.AddObjectToAsset(ssao,renderer);
   var so=new SerializedObject(ssao);var s=so.FindProperty("m_Settings");
   s.FindPropertyRelative("AOMethod").enumValueIndex=1;s.FindPropertyRelative("Downsample").boolValue=false;s.FindPropertyRelative("AfterOpaque").boolValue=false; // applied inside Carrot/Storybook via _SCREEN_SPACE_OCCLUSION; the after-opaque composite blurred the colour on WebGL2
   s.FindPropertyRelative("Source").intValue=1;s.FindPropertyRelative("NormalSamples").enumValueIndex=1;s.FindPropertyRelative("Intensity").floatValue=1.1f;
   s.FindPropertyRelative("DirectLightingStrength").floatValue=.25f;s.FindPropertyRelative("Radius").floatValue=.32f;s.FindPropertyRelative("Samples").enumValueIndex=1;
   s.FindPropertyRelative("BlurQuality").enumValueIndex=1;s.FindPropertyRelative("Falloff").floatValue=60;so.ApplyModifiedPropertiesWithoutUndo();
   // Height fog: a fullscreen pass over the opaque scene (hand-written HLSL on Blit.hlsl), High and Medium.
   var fog=ScriptableObject.CreateInstance<FullScreenPassRendererFeature>();fog.name="Height fog";fog.injectionPoint=FullScreenPassRendererFeature.InjectionPoint.BeforeRenderingTransparents;fog.requirements=ScriptableRenderPassInput.Depth;fog.fetchColorBuffer=true;fog.passIndex=0;fog.passMaterial=FogMaterial();AssetDatabase.AddObjectToAsset(fog,renderer);
   AssetDatabase.SaveAssets();AssetDatabase.ImportAsset(rendererPath);
   var rso=new SerializedObject(renderer);var list=rso.FindProperty("m_RendererFeatures");var map=rso.FindProperty("m_RendererFeatureMap");
   // SSAO is left out of the build: on WebGL2 every mode of the URP 17 SSAO pass (after-opaque, before-opaque, downsampled or full-res) blurred the whole colour target; contact darkening comes from the AO maps and the contact quads.
   var features=UseSsao?new ScriptableRendererFeature[]{ssao,fog}:new ScriptableRendererFeature[]{fog};list.arraySize=features.Length;map.arraySize=features.Length;
   for(int f=0;f<features.Length;f++){list.GetArrayElementAtIndex(f).objectReferenceValue=features[f];if(AssetDatabase.TryGetGUIDAndLocalFileIdentifier(features[f],out _,out long localId))map.GetArrayElementAtIndex(f).longValue=localId;}
   rso.ApplyModifiedPropertiesWithoutUndo();
  }
  var asset=UniversalRenderPipelineAsset.Create(renderer);asset.name=name;AssetDatabase.CreateAsset(asset,path);
  var o=new SerializedObject(asset);
  Set(o,"m_RendererDataList",renderer);
  o.FindProperty("m_RequireDepthTexture").boolValue=rich;o.FindProperty("m_RequireOpaqueTexture").boolValue=false;o.FindProperty("m_OpaqueDownsampling").enumValueIndex=0;
  o.FindProperty("m_SupportsTerrainHoles").boolValue=false;o.FindProperty("m_SupportsHDR").boolValue=true;o.FindProperty("m_HDRColorBufferPrecision").enumValueIndex=0; // _32Bits: R11G11B10 colour targets (measured on the WebGL2 context)
  o.FindProperty("m_MSAA").intValue=msaa;o.FindProperty("m_RenderScale").floatValue=1;
  o.FindProperty("m_MainLightRenderingMode").intValue=1;o.FindProperty("m_MainLightShadowsSupported").boolValue=true;o.FindProperty("m_MainLightShadowmapResolution").intValue=high?1536:rich?1024:768;
  o.FindProperty("m_AdditionalLightsRenderingMode").intValue=high?1:2;o.FindProperty("m_AdditionalLightsPerObjectLimit").intValue=high?4:2;o.FindProperty("m_AdditionalLightShadowsSupported").boolValue=false;
  o.FindProperty("m_ReflectionProbeBlending").boolValue=false;o.FindProperty("m_ReflectionProbeBoxProjection").boolValue=false;o.FindProperty("m_ReflectionProbeAtlas").boolValue=false;
  // One cascade: the play area is 15x11 units seen from about 26 units, so a single map over the fit distance plus the scene depth is
  // sharper than two cascades whose first split (0-12 u) never held anything.
  o.FindProperty("m_ShadowDistance").floatValue=rich?36:28;o.FindProperty("m_ShadowCascadeCount").intValue=1;o.FindProperty("m_Cascade2Split").floatValue=.3f;o.FindProperty("m_CascadeBorder").floatValue=.15f;
  o.FindProperty("m_ShadowDepthBias").floatValue=1;o.FindProperty("m_ShadowNormalBias").floatValue=.6f;o.FindProperty("m_SoftShadowsSupported").boolValue=true;o.FindProperty("m_SoftShadowQuality").intValue=high?2:1;
  o.FindProperty("m_SupportsLightCookies").boolValue=high;o.FindProperty("m_AdditionalLightsCookieResolution").intValue=1024;o.FindProperty("m_AdditionalLightsCookieFormat").enumValueIndex=1;
  o.FindProperty("m_UseSRPBatcher").boolValue=true;o.FindProperty("m_SupportsDynamicBatching").boolValue=false;o.FindProperty("m_MixedLightingSupported").boolValue=false;o.FindProperty("m_SupportsLightLayers").boolValue=false;
  o.FindProperty("m_ColorGradingMode").enumValueIndex=0;o.FindProperty("m_ColorGradingLutSize").intValue=32;o.FindProperty("m_UseFastSRGBLinearConversion").boolValue=false;
  o.FindProperty("m_SupportDataDrivenLensFlare").boolValue=false;o.FindProperty("m_SupportScreenSpaceLensFlare").boolValue=false;o.FindProperty("m_UseAdaptivePerformance").boolValue=false;
  o.FindProperty("m_EnableLODCrossFade").boolValue=false;o.FindProperty("m_ShadowType").enumValueIndex=2;
  o.ApplyModifiedPropertiesWithoutUndo();EditorUtility.SetDirty(asset);EditorUtility.SetDirty(renderer);
  return asset;
 }
 static Material FogMaterial(){string path=Folder+"/HeightFog.mat";var shader=Shader.Find("Carrot/HeightFog");if(shader==null)throw new InvalidOperationException("Carrot/HeightFog shader missing");var m=AssetDatabase.LoadAssetAtPath<Material>(path);if(m==null){m=new Material(shader);AssetDatabase.CreateAsset(m,path);}m.shader=shader;EditorUtility.SetDirty(m);return m;}
 static void Set(SerializedObject o,string listName,UnityEngine.Object value){var p=o.FindProperty(listName);p.arraySize=1;p.GetArrayElementAtIndex(0).objectReferenceValue=value;}
 static void Profile(string biome) {
  string path=Volumes+"/"+biome+".asset";AssetDatabase.DeleteAsset(path);
  var profile=ScriptableObject.CreateInstance<VolumeProfile>();profile.name=biome;AssetDatabase.CreateAsset(profile,path);
  T Add<T>() where T:VolumeComponent{var c=profile.Add<T>(true);c.name=typeof(T).Name;AssetDatabase.AddObjectToAsset(c,profile);return c;}
  var tone=Add<Tonemapping>();tone.mode.value=TonemappingMode.ACES;
  var bloom=Add<Bloom>();bloom.threshold.value=.9f;bloom.intensity.value=.35f;bloom.scatter.value=.6f;bloom.clamp.value=8;bloom.highQualityFiltering.value=true;
  var adjust=Add<ColorAdjustments>();adjust.postExposure.value=biome=="garden"?.35f:biome=="marsh"?.15f:biome=="orchard"?.25f:-.05f;adjust.contrast.value=biome=="garden"?8:biome=="marsh"?10:biome=="orchard"?9:6;adjust.saturation.value=biome=="garden"?3:biome=="marsh"?2:biome=="orchard"?6:0;
  // The garden read with a yellow-green cast: pull its green channel toward neutral in the midtones and highlights.
  adjust.colorFilter.value=biome=="garden"?new Color(1,.975f,1):biome=="orchard"?new Color(1,.97f,.92f):Color.white;
  var vignette=Add<Vignette>();vignette.intensity.value=biome=="orchard"?.18f:.15f;vignette.smoothness.value=.5f;vignette.color.value=biome=="marsh"?new Color(.02f,.04f,.08f):biome=="orchard"?new Color(.08f,.04f,.03f):new Color(.05f,.05f,.08f);
  var dof=Add<DepthOfField>();dof.mode.value=DepthOfFieldMode.Gaussian;dof.gaussianStart.value=24;dof.gaussianEnd.value=44;dof.gaussianMaxRadius.value=1;dof.highQualitySampling.value=false;
  var smh=Add<ShadowsMidtonesHighlights>();
  smh.shadows.value=biome=="garden"?new Vector4(.98f,.99f,1.05f,0):biome=="marsh"?new Vector4(.92f,.98f,1.12f,0):biome=="orchard"?new Vector4(1.02f,.98f,.95f,0):new Vector4(.94f,.97f,1.08f,0);
  smh.highlights.value=biome=="garden"?new Vector4(1.04f,.99f,.96f,0):biome=="marsh"?new Vector4(.9f,1,1.1f,0):biome=="orchard"?new Vector4(1.06f,.98f,.92f,0):new Vector4(1,1,1.02f,0);
  var chroma=Add<ChromaticAberration>();chroma.intensity.value=0;
  EditorUtility.SetDirty(profile);
 }
}
}
