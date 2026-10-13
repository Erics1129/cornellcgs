using System.Text.RegularExpressions;
using UnityEngine;
using UnityEngine.Rendering;
using UnityEngine.Rendering.Universal;

namespace CarrotTD {
 /// <summary>Chooses the presentation tier once and binds the matching URP asset. Gameplay never reads it.</summary>
 public static class CarrotQuality {
  public static bool High{get;private set;}=true;
  public static string Reason{get;private set;}="";
  static bool chosen,forced;
  public static float ParticleScale=>High?1:.5f;
  public static int MaxEffects=>High?160:80;
  public static void Choose(){if(chosen)return;chosen=true;bool low=Application.isMobilePlatform||SystemInfo.deviceType==DeviceType.Handheld;string gpu=SystemInfo.graphicsDeviceName??"";Reason=low?"platform":"";if(!low&&Mathf.Min(Screen.width,Screen.height)<900){low=true;Reason="viewport "+Screen.width+"x"+Screen.height;}if(!low&&Regex.IsMatch(gpu,"Mali|Adreno|PowerVR|Apple GPU|Intel\\(R\\) (U)?HD|Iris")){low=true;Reason="gpu "+gpu;}Apply(!low);}
  public static void Force(bool high){forced=true;chosen=true;Apply(high);}
  public static void Demote(string why){if(forced||!High)return;Reason=why;Apply(false);}
  static void Apply(bool high){High=high;var asset=Resources.Load<UniversalRenderPipelineAsset>("Carrot/Settings/CarrotURP-"+(high?"High":"Low"));if(asset!=null){QualitySettings.renderPipeline=asset;if(!high)asset.renderScale=Reason.StartsWith("frame")?.85f:1f;}else Debug.LogWarning("Carrot URP asset missing for tier "+(high?"High":"Low"));Shader.SetGlobalFloat("_CarrotSoftParticles",high?1:0);Application.targetFrameRate=-1;Debug.Log("CarrotQuality tier="+(high?"High":"Low")+(string.IsNullOrEmpty(Reason)?"":" reason="+Reason)+" gpu="+SystemInfo.graphicsDeviceName+" screen="+Screen.width+"x"+Screen.height);}
 }
}
