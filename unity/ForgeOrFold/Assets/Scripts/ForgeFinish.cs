using UnityEngine;
// Owner: room-light-post. The camera's post chain: a dual-filter bloom (prefilter with a soft-knee threshold at 1/2
// resolution, then down to 1/32 and back up, 5 levels; ForgeAtmosphere passes 4 at tier 2 and 3 at tier 3), the
// finish pass (heat haze, exposure 1.13 and the Narkowicz ACES fit, invariant), then FXAA 3.11 when the tier runs
// without MSAA. bloomLevels 0 restores the pre-upgrade quarter-resolution halo (a Tune JSON safety valve).
[RequireComponent(typeof(Camera))]
public class ForgeFinish:MonoBehaviour {
 Material material;
 /// Run the FXAA pass after the finish (quality tiers 2-3, or MSAA unsupported).
 public bool fxaa;
 /// Bloom: levels (0 = the legacy halo), threshold and soft knee in linear HDR radiance before exposure, intensity.
 public int bloomLevels=5;public float bloomThreshold=1.1f,bloomKnee=.6f,bloomIntensity=.18f;
 /// Heat haze in the finish pass (off at tier 3; the strengths come from the _ForgeHazeA/_ForgeHazeB globals).
 public bool haze=true;
 static readonly int BloomId=Shader.PropertyToID("_Bloom"),LumaAlphaId=Shader.PropertyToID("_LumaAlpha"),BloomScaleId=Shader.PropertyToID("_BloomScale"),
  ThresholdId=Shader.PropertyToID("_Threshold"),LowId=Shader.PropertyToID("_Low"),HazeOnId=Shader.PropertyToID("_HazeOn");
 const int PassThreshold=0,PassBlur=1,PassFinish=2,PassFxaa=3,PassPrefilter=4,PassDown=5,PassUp=6;
 readonly RenderTexture[] down=new RenderTexture[6];readonly System.Collections.Generic.List<RenderTexture> release=new System.Collections.Generic.List<RenderTexture>();
 /// Above this many backing-store pixels the chain starts at 1/4 resolution (same level count, one octave lower).
 public float halfResMaxMpx=2.5f;
 void OnRenderImage(RenderTexture source,RenderTexture destination){
  if(material==null){var shader=Shader.Find("Forge/Finish");if(shader==null||!shader.isSupported){Graphics.Blit(source,destination);return;}material=new Material(shader);}
  RenderTexture bloom;release.Clear();
  if(bloomLevels<=0||material.passCount<=PassUp){
   // Legacy: quarter-resolution threshold and two 4-tap blurs, added x.3.
   int w=Mathf.Max(1,source.width/4),h=Mathf.Max(1,source.height/4);
   var glow=RenderTexture.GetTemporary(w,h,0,RenderTextureFormat.DefaultHDR);var blur=RenderTexture.GetTemporary(w,h,0,RenderTextureFormat.DefaultHDR);
   Graphics.Blit(source,glow,material,PassThreshold);Graphics.Blit(glow,blur,material,PassBlur);Graphics.Blit(blur,glow,material,PassBlur);
   bloom=glow;release.Add(glow);release.Add(blur);material.SetFloat(BloomScaleId,.3f);
  }else{
   // Dual filter: prefilter + 1/2, then 1/4 .. 1/32; back up, each level adding the blurred level below it.
   float knee=Mathf.Max(1e-4f,bloomKnee);material.SetVector(ThresholdId,new Vector4(bloomThreshold,bloomThreshold-knee,2*knee,.25f/knee));
   int div=source.width*(float)source.height>halfResMaxMpx*1e6f?4:2;int w=Mathf.Max(1,source.width/div),h=Mathf.Max(1,source.height/div),n=0;
   down[0]=RenderTexture.GetTemporary(w,h,0,RenderTextureFormat.DefaultHDR);down[0].filterMode=FilterMode.Bilinear;Graphics.Blit(source,down[0],material,PassPrefilter);n=1;
   while(n<Mathf.Min(bloomLevels,down.Length)&&w>4&&h>4){w/=2;h/=2;down[n]=RenderTexture.GetTemporary(w,h,0,RenderTextureFormat.DefaultHDR);down[n].filterMode=FilterMode.Bilinear;Graphics.Blit(down[n-1],down[n],material,PassDown);n++;}
   var low=down[n-1];
   for(int i=n-2;i>=0;i--){var up=RenderTexture.GetTemporary(down[i].width,down[i].height,0,RenderTextureFormat.DefaultHDR);up.filterMode=FilterMode.Bilinear;material.SetTexture(LowId,low);Graphics.Blit(down[i],up,material,PassUp);if(low!=down[n-1])release.Add(low);low=up;}
   bloom=low;if(low!=down[n-1])release.Add(low);for(int i=0;i<n;i++){release.Add(down[i]);down[i]=null;}
   material.SetFloat(BloomScaleId,bloomIntensity);
  }
  material.SetTexture(BloomId,bloom);material.SetFloat(HazeOnId,haze?1:0);
  if(fxaa&&material.passCount>PassFxaa){
   var ldr=RenderTexture.GetTemporary(source.width,source.height,0,RenderTextureFormat.ARGB32,RenderTextureReadWrite.sRGB);ldr.filterMode=FilterMode.Bilinear;
   material.SetFloat(LumaAlphaId,1);Graphics.Blit(source,ldr,material,PassFinish);material.SetFloat(LumaAlphaId,0);
   Graphics.Blit(ldr,destination,material,PassFxaa);RenderTexture.ReleaseTemporary(ldr);
  }else Graphics.Blit(source,destination,material,PassFinish);
  foreach(var rt in release)RenderTexture.ReleaseTemporary(rt);
 }
 void OnDestroy(){if(material)Destroy(material);}
}
