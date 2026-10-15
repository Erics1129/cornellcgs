using UnityEngine;
using UnityEngine.Rendering;
using UnityEngine.Rendering.Universal;

namespace CarrotTD {
 /// <summary>
 /// Grounded lighting and exposure (giant update). Every biome is brought into the same ready-frame brightness band (mean relative
 /// luminance 0.08-0.25, brightest to darkest biome at most 3x, where the shipped build swung 75x between the frost glare and the
 /// arena night): a per-level exposure on the live grade, a stronger moon and sky ambient for the night biomes, frost albedo capped
 /// at 0.75, a key-to-fill ratio of at least 3:1, ground bounce for the characters' Storybook surface, shadow distance tied to the
 /// fitted camera, and the prism stage's own grade.
 ///
 /// It also fixes the grade itself: Volume.profile instantiates a private copy of the shared profile once and ignores every later
 /// sharedProfile assignment, so after the first level of a session every map kept the first map's grade. The copy is now dropped
 /// (and destroyed) whenever the biome's profile is assigned.
 /// </summary>
 public sealed partial class CarrotView {
  // QA tuning knobs (Quality("exposure:+0.4"), "sun:1.2", "ambient:1.3"); zero/one in normal play.
  static float debugExposure,debugSun=1,debugAmbient=1;
  /// <summary>Exposure (EV) added to the biome grade for this level's lighting rig, measured on ready frames (see render-vfx.md).</summary>
  float LevelExposure(){
   string biome=game.level.biome,boss=game.level.boss;
   switch(biome){
    case "garden":return .6f;case "marsh":return 1.95f;case "frost":return -1.75f;case "orchard":return 1.2f;case "prism":return -1.25f;
    case "arena":return boss=="tornado"?1.45f:boss=="zombie"?2.35f:boss=="eyeball"?1.8f:boss=="portal"?1.55f:1.6f;
   }
   return 0;
  }
  void AssignGrade(VolumeProfile profile){
   if(grade==null||profile==null)return;
   if(grade.HasInstantiatedProfile()){var old=grade.profile;grade.profile=null;if(old!=null){foreach(var c in old.components)if(c!=null)Destroy(c);Destroy(old);}}
   grade.sharedProfile=profile;
  }
  /// <summary>Runs last in ApplyBiomeLighting (after the portal and prism rigs).</summary>
  void ApplyGroundedLighting(string biome,Color ground){
   if(sun==null||game==null||game.level==null)return;
   bool night=NightBiome||game.level.boss=="portal";
   // Night biomes: a brighter moon and sky so creatures and lanes read without lifting the black point; the fill stays a third of the key.
   if(night){sun.intensity*=1.45f;RenderSettings.ambientSkyColor*=1.35f;RenderSettings.ambientEquatorColor*=1.3f;}
   sun.intensity*=debugSun;RenderSettings.ambientSkyColor*=debugAmbient;RenderSettings.ambientEquatorColor*=debugAmbient;RenderSettings.ambientGroundColor*=debugAmbient;
   if(fill!=null)fill.intensity=Mathf.Min(fill.intensity,sun.intensity/3f);
   sunBase=sun.intensity;
   // Ground bounce for the Storybook surface (characters' T0 globals): the soil albedo lit by the key, strength by biome.
   Color bounce=ground*sun.color*Mathf.Clamp(sun.intensity*.35f,.2f,1);Shader.SetGlobalColor("_CarrotGroundColor",new Color(bounce.r,bounce.g,bounce.b,1));
   Shader.SetGlobalFloat("_CarrotBounce",biome=="frost"?.3f:night?.12f:biome=="prism"?.2f:.22f);
   // Shadows reach the far edge of the fitted diorama and no further (sharper texels).
   var asset=GraphicsSettings.currentRenderPipeline as UniversalRenderPipelineAsset;if(asset!=null)asset.shadowDistance=Mathf.Clamp(fitDistance+(PrismStage?26:14),24,PrismStage?80:44);
   if(grade!=null&&grade.profile!=null&&grade.profile.TryGet<ColorAdjustments>(out var adjust)){
    var shared=grade.sharedProfile!=null&&grade.sharedProfile.TryGet<ColorAdjustments>(out var baseAdjust)?baseAdjust.postExposure.value:adjust.postExposure.value;
    // Tier parity: High's canopy cookie dapples about a third of the key away in garden, marsh and orchard; without it (Medium, Low)
    // the same exposure read 1.3-1.5x brighter. The portal level loses its height fog on Low and needs the lift back.
    float tierEv=0;string b=game.level.biome;bool cookieBiome=b=="garden"||b=="marsh"||b=="orchard";
    if(cookieBiome&&sun.cookie==null)tierEv=b=="orchard"?-.25f:-.5f;if(!CarrotQuality.Rich&&game.level.boss=="portal")tierEv+=.65f;
    adjust.postExposure.value=shared+LevelExposure()+tierEv+debugExposure;adjust.postExposure.overrideState=true;
   }
   if(grade!=null&&grade.profile!=null&&grade.profile.TryGet<Bloom>(out var bloom)){bloom.clamp.value=4;bloom.clamp.overrideState=true;if(biome=="marsh"){bloom.threshold.value=1.1f;bloom.threshold.overrideState=true;}}
  }
  /// <summary>Frost snow and ice albedo is capped at 0.75 (the frost frames read 0.60 mean luminance, a glare).</summary>
  static Color CapAlbedo(Color c,float max){float m=c.maxColorComponent;return m>max?c*(max/m):c;}
 }
}
