using UnityEngine;
[RequireComponent(typeof(Camera))]
public class ForgeFinish:MonoBehaviour {
 Material material;
 void OnRenderImage(RenderTexture source,RenderTexture destination){
  if(material==null){var shader=Shader.Find("Forge/Finish");if(shader==null||!shader.isSupported){Graphics.Blit(source,destination);return;}material=new Material(shader);}
  int w=Mathf.Max(1,source.width/4),h=Mathf.Max(1,source.height/4);
  var glow=RenderTexture.GetTemporary(w,h,0,RenderTextureFormat.DefaultHDR);var blur=RenderTexture.GetTemporary(w,h,0,RenderTextureFormat.DefaultHDR);
  Graphics.Blit(source,glow,material,0);Graphics.Blit(glow,blur,material,1);Graphics.Blit(blur,glow,material,1);
  material.SetTexture("_Bloom",glow);Graphics.Blit(source,destination,material,2);
  RenderTexture.ReleaseTemporary(glow);RenderTexture.ReleaseTemporary(blur);
 }
 void OnDestroy(){if(material)Destroy(material);}
}
