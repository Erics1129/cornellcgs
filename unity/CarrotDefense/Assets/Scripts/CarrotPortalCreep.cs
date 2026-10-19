using UnityEngine;
using UnityEngine.Rendering;
using UnityEngine.Rendering.Universal;

namespace CarrotTD {
 // Portal challenge only (owner request, 2026-10-18): a near-black sky with a dark blue blink, and a creepy grade over the
 // whole frame that keeps the board readable (the map stays dark, the light does not). Presentation only. LateUpdate runs after the boss mood has written the sky, so these values win.
 public sealed partial class CarrotView {
  Volume creepVolume;

  void LateUpdate(){
   bool portal=game!=null&&game.level!=null&&game.level.boss=="portal";
   if(creepVolume!=null)creepVolume.enabled=portal;
   if(!portal)return;
   if(creepVolume==null)BuildCreepVolume();
   float t=Time.unscaledTime;
   // A slow dark blue pulse, plus a short flicker every 4.7 s. Both stay near black.
   float blink=Mathf.Clamp01(Mathf.Pow(.5f+.5f*Mathf.Sin(t*2.6f),8)*.8f+(Mathf.Repeat(t,4.7f)<.09f?.6f:0));
   Color black=new Color(.004f,.005f,.009f),blue=new Color(0,.025f,.11f),sky=Color.Lerp(black,blue,blink);
   if(skyMaterial!=null){
    skyMaterial.SetColor("_Zenith",sky*.6f);skyMaterial.SetColor("_Horizon",sky);skyMaterial.SetColor("_Ground",black);
    skyMaterial.SetFloat("_Stars",0);skyMaterial.SetFloat("_Aurora",0);skyMaterial.SetFloat("_CloudAmount",0);skyMaterial.SetFloat("_SunGlow",0);skyMaterial.SetFloat("_SunSize",0);
   }
   RenderSettings.fogColor=Color.Lerp(black,blue*.6f,blink);
  }

  void BuildCreepVolume(){
   var go=new GameObject("Portal creep grade");go.transform.SetParent(transform,false);
   creepVolume=go.AddComponent<Volume>();creepVolume.isGlobal=true;creepVolume.priority=5;creepVolume.weight=1;
   var profile=ScriptableObject.CreateInstance<VolumeProfile>();creepVolume.profile=profile;
   var adjust=profile.Add<ColorAdjustments>(true);adjust.saturation.Override(-40);adjust.contrast.Override(15);adjust.postExposure.Override(.25f);adjust.colorFilter.Override(new Color(.78f,.9f,.86f));
   var balance=profile.Add<WhiteBalance>(true);balance.temperature.Override(-20);balance.tint.Override(-8);
   var vignette=profile.Add<Vignette>(true);vignette.intensity.Override(.3f);vignette.smoothness.Override(.5f);vignette.color.Override(Color.black);
   var grain=profile.Add<FilmGrain>(true);grain.type.Override(FilmGrainLookup.Medium3);grain.intensity.Override(.35f);grain.response.Override(.6f);
   var aberration=profile.Add<ChromaticAberration>(true);aberration.intensity.Override(.2f);
  }
 }
}
