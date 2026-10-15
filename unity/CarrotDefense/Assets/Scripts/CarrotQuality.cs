using System.Text.RegularExpressions;
using UnityEngine;
using UnityEngine.Rendering;
using UnityEngine.Rendering.Universal;

namespace CarrotTD {
 /// <summary>
 /// Chooses the presentation tier (High, Medium or Low), binds the matching URP asset and owns the render scale. Gameplay never reads it.
 /// High is the full render path (depth of field, canopy cookie, per-pixel point lights, HQ bloom, soft shadows Medium, 1536 shadow map).
 /// Medium is High minus the full-resolution extras: the same scene content, one 1024 cascade, per-vertex point lights, no depth of field,
 /// bloom without HQ filtering. It is what a DPR2 desktop, Safari or a tablet starts on, and the first demotion step from High.
 /// Low is the phone tier: half the particles, fewer decorations, no depth texture, MSAA 2, per-vertex lights.
 /// </summary>
 public static class CarrotQuality {
  public const int HighTier=2,MediumTier=1,LowTier=0;
  public const string PrefsKey="carrot.quality";
  public static int Tier{get;private set;}=HighTier;
  /// <summary>Full render path gates: depth of field, light cookie, per-pixel lights, HQ bloom.</summary>
  public static bool High=>Tier==HighTier;
  /// <summary>High-class scene content gates (decoration budget, grass, trees, effect pools, soft particles, height fog): High and Medium.</summary>
  public static bool Rich=>Tier>=MediumTier;
  public static float RenderScale{get;private set;}=1;
  public static string Reason{get;private set;}="";
  /// <summary>The tier Choose picked for this device before any demotion; a promotion never goes above it.</summary>
  public static int ChosenTier{get;private set;}=HighTier;
  public static bool Forced=>forced;
  public static bool Phone{get;private set;}
  public static bool WebKit{get;private set;}
  static bool chosen,forced;
  public static float ParticleScale=>Tier==HighTier?1:Tier==MediumTier?.75f:.5f;
  public static int MaxEffects=>Tier==HighTier?160:Tier==MediumTier?120:80;
  /// <summary>A per-tier particle cap: the High count, three quarters of it on Medium, half on Low.</summary>
  public static int Cap(int high){return Tier==HighTier?high:Tier==MediumTier?Mathf.RoundToInt(high*.75f):high/2;}
  public static string Name(int tier){return tier==HighTier?"High":tier==MediumTier?"Medium":"Low";}
  #if UNITY_WEBGL && !UNITY_EDITOR
  [System.Runtime.InteropServices.DllImport("__Internal")] static extern int Carrot_IsWebKit();
  #else
  static int Carrot_IsWebKit(){return 0;}
  #endif
  /// <summary>
  /// Low only for real phones (the page caps a phone at DPR 1.25, so 390x844 is at most 488x1055 device pixels) and known low-end GPU
  /// families. Medium for tablets, for any canvas above 2.6 M device pixels (a DPR2 or DPR1.5 desktop: the High path's full-resolution
  /// depth copy, fog, FXAA and soft shadows are what a 4 Mpx canvas pays for) and for WebKit, where the High path measured 40 ms a frame
  /// on an Apple GPU while Low ran at 17. "Apple GPU" is what Safari reports on every Apple-silicon Mac, so it is a WebKit marker, not a
  /// low-end one. A stored choice from an earlier session (PlayerPrefs, local only) can start lower than the device rule but never higher;
  /// the frame-time watcher in CarrotView then lowers the render scale and the tier from measured frames, and may promote back once.
  /// </summary>
  public static void Choose(){
   if(chosen)return;chosen=true;
   bool mobile=Application.isMobilePlatform||SystemInfo.deviceType==DeviceType.Handheld;string gpu=SystemInfo.graphicsDeviceName??"";
   int shortSide=Mathf.Min(Screen.width,Screen.height);long pixels=(long)Screen.width*Screen.height;
   WebKit=Carrot_IsWebKit()==1||gpu=="Apple GPU";
   int tier=HighTier;string reason="";
   if(mobile&&shortSide<600){tier=LowTier;reason="platform";Phone=true;}
   else if(shortSide<600){tier=LowTier;reason="viewport "+Screen.width+"x"+Screen.height;Phone=true;}
   else if(Regex.IsMatch(gpu,"Mali|Adreno|PowerVR|Intel\\(R\\) (U)?HD|Iris")){tier=LowTier;reason="gpu "+gpu;}
   else if(mobile){tier=MediumTier;reason="tablet";}
   else if(WebKit){tier=MediumTier;reason="webkit";}
   else if(pixels>2600000){tier=MediumTier;reason="pixels "+Screen.width+"x"+Screen.height;}
   ChosenTier=tier;float scale=1;
   string stored=null;try{stored=PlayerPrefs.GetString(PrefsKey,"");}catch(System.Exception){stored=null;}
   if(!string.IsNullOrEmpty(stored)){var parts=stored.Split(':');int storedTier;float storedScale;
    if(parts.Length>=2&&int.TryParse(parts[0],out storedTier)&&float.TryParse(parts[1],System.Globalization.NumberStyles.Float,System.Globalization.CultureInfo.InvariantCulture,out storedScale)&&storedTier>=LowTier&&storedTier<=HighTier){
     if(storedTier<tier){tier=storedTier;reason="stored (device rule "+Name(ChosenTier)+(string.IsNullOrEmpty(reason)?"":" "+reason)+")";}
     if(storedTier<=tier)scale=Mathf.Clamp(storedScale,.6f,1);}}
   RenderScale=scale;Reason=reason;
   if(tier==LowTier)QualitySettings.globalTextureMipmapLimit=1;   // phones: drop the top mip of every texture before anything is uploaded
   Apply(tier);
  }
  public static void Force(int tier){forced=true;chosen=true;RenderScale=1;Reason="forced";Apply(Mathf.Clamp(tier,LowTier,HighTier));}
  /// <summary>One tier down (High to Medium to Low). Returns false when already Low or when a debug command pinned the tier. Desktop
  /// WebKit stops at Medium: its Low path (MSAA 2) measured slower than Medium there; the render scale carries the rest.</summary>
  public static bool Demote(string why){if(forced||Tier<=LowTier)return false;if(WebKit&&!Phone&&Tier<=MediumTier)return false;Reason=why;Apply(Tier-1);Remember();return true;}
  /// <summary>One tier up, never above the device rule's choice.</summary>
  public static bool Promote(string why){if(forced||Tier>=ChosenTier)return false;Reason=why;Apply(Tier+1);Remember();return true;}
  /// <summary>Render scale only (the DOM HUD stays crisp); URP reallocates its targets, nothing else changes.</summary>
  public static void SetRenderScale(float scale,string why){scale=Mathf.Clamp(Mathf.Round(scale*100)/100,.6f,1);if(Mathf.Abs(scale-RenderScale)<.001f)return;RenderScale=scale;var asset=GraphicsSettings.currentRenderPipeline as UniversalRenderPipelineAsset;if(asset!=null)asset.renderScale=scale;Debug.Log("CarrotQuality renderScale="+scale.ToString("F2")+" reason="+why+" tier="+Name(Tier));Remember();}
  static void Remember(){try{PlayerPrefs.SetString(PrefsKey,Tier+":"+RenderScale.ToString("F2",System.Globalization.CultureInfo.InvariantCulture));PlayerPrefs.Save();}catch(System.Exception){}}
  static void Apply(int tier){
   Tier=tier;var asset=Resources.Load<UniversalRenderPipelineAsset>("Carrot/Settings/CarrotURP-"+Name(tier));
   if(asset!=null){QualitySettings.renderPipeline=asset;asset.renderScale=RenderScale;}else Debug.LogWarning("Carrot URP asset missing for tier "+Name(tier));
   Shader.SetGlobalFloat("_CarrotSoftParticles",tier>=MediumTier?1:0);Application.targetFrameRate=-1;
   Debug.Log("CarrotQuality tier="+Name(tier)+(string.IsNullOrEmpty(Reason)?"":" reason="+Reason)+" scale="+RenderScale.ToString("F2")+" gpu="+SystemInfo.graphicsDeviceName+" screen="+Screen.width+"x"+Screen.height+(WebKit?" webkit":""));
  }
 }
}
