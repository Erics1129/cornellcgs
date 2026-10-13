using UnityEngine;
// Owner: room-light-post. The camera's post chain: quarter-resolution bloom, then the finish pass (exposure 1.13 and
// the Narkowicz ACES fit, invariant), then FXAA 3.11 when the quality tier runs without MSAA (ForgeAtmosphere sets fxaa).
[RequireComponent(typeof(Camera))]
public class ForgeFinish:MonoBehaviour {
 Material material;
 /// Run the FXAA pass after the finish (quality tiers 2-3, or MSAA unsupported).
 public bool fxaa;
 static readonly int BloomId=Shader.PropertyToID("_Bloom"),LumaAlphaId=Shader.PropertyToID("_LumaAlpha");
 void OnRenderImage(RenderTexture source,RenderTexture destination){
  if(material==null){var shader=Shader.Find("Forge/Finish");if(shader==null||!shader.isSupported){Graphics.Blit(source,destination);return;}material=new Material(shader);}
  int w=Mathf.Max(1,source.width/4),h=Mathf.Max(1,source.height/4);
  var glow=RenderTexture.GetTemporary(w,h,0,RenderTextureFormat.DefaultHDR);var blur=RenderTexture.GetTemporary(w,h,0,RenderTextureFormat.DefaultHDR);
  Graphics.Blit(source,glow,material,0);Graphics.Blit(glow,blur,material,1);Graphics.Blit(blur,glow,material,1);
  material.SetTexture(BloomId,glow);
  if(fxaa&&material.passCount>3){
   var ldr=RenderTexture.GetTemporary(source.width,source.height,0,RenderTextureFormat.ARGB32,RenderTextureReadWrite.sRGB);ldr.filterMode=FilterMode.Bilinear;
   material.SetFloat(LumaAlphaId,1);Graphics.Blit(source,ldr,material,2);material.SetFloat(LumaAlphaId,0);
   Graphics.Blit(ldr,destination,material,3);RenderTexture.ReleaseTemporary(ldr);
  }else Graphics.Blit(source,destination,material,2);
  RenderTexture.ReleaseTemporary(glow);RenderTexture.ReleaseTemporary(blur);
 }
 void OnDestroy(){if(material)Destroy(material);}
}
