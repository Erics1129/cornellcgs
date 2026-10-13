using UnityEngine;
using UnityEngine.Rendering;

// Owner: integration. WebGL links a shader program on its first draw, and ANGLE (Chromium and Safari) builds the Metal
// pipeline then too. The startup reflection capture draws the static room, but the knife (Forge/Blade), the tongs, the
// hammer, the particles, the smear and the smoke were first drawn on the first Start forging or strike, which showed as
// a 35-90 ms stall on the first hearth step. WarmShaders runs once in Start, behind the loading screen.
public partial class ForgeWorld {
 void WarmShaders(){
  float t0=Time.realtimeSinceStartup;int added=0;
  try{
   var svc=new ShaderVariantCollection();
   string[] lit={ForgeContract.Shaders.Blade,ForgeContract.Shaders.Surface,ForgeContract.Shaders.Glove,ForgeContract.Shaders.ParticleLit,ForgeContract.Shaders.Smear,ForgeContract.Shaders.Smith};
   string[] unlit={ForgeContract.Shaders.ParticleAdd,ForgeContract.Shaders.Smoke,ForgeContract.Shaders.Fire,ForgeContract.Shaders.Glow,ForgeContract.Shaders.Spark};
   // The player may hold only the keywordless variants (fog variants are stripped when the build scene has no fog),
   // so each candidate is tried on its own and a missing one is skipped.
   // FORGE_LITE (room's tiers 2-3) only when the starting tier uses it.
   string[][] sets=Shader.IsKeywordEnabled("FORGE_LITE")?new[]{new[]{"FORGE_LITE"},new[]{"FOG_EXP2","FORGE_LITE"},new string[0],new[]{"FOG_EXP2"}}:new[]{new string[0],new[]{"FOG_EXP2"}};
   void Try(Shader s,PassType pass){foreach(var k in sets){try{if(svc.Add(new ShaderVariantCollection.ShaderVariant(s,pass,k)))added++;}catch(System.Exception){}}}
   foreach(var n in lit){var s=Shader.Find(n);if(s!=null){Try(s,PassType.ForwardBase);Try(s,PassType.Normal);}}
   foreach(var n in unlit){var s=Shader.Find(n);if(s!=null)Try(s,PassType.Normal);}
   svc.WarmUp();
  }catch(System.Exception e){Debug.LogWarning("FORGE_WARMUP variants skipped: "+e.Message);}
  // One small off-screen frame of the hearth with the dynamic objects shown, into a target like the camera's own
  // (HDR, same MSAA), so the hearth's pipelines exist before the first Start forging turns the view there.
  RenderTexture rt=null;GameObject go=null;
  try{
   rt=new RenderTexture(96,64,24,RenderTextureFormat.DefaultHDR){antiAliasing=Mathf.Max(1,QualitySettings.antiAliasing),name="Forge warm-up"};rt.Create();
   go=new GameObject("Forge warm-up camera");var c=go.AddComponent<Camera>();c.CopyFrom(cam);c.enabled=false;c.targetTexture=rt;
   var eye=ForgeLayout.HearthStance+Vector3.up*ForgeLayout.EyeHeight;
   foreach(var target in new[]{ForgeLayout.Firebed,ForgeLayout.StrikePoint}){c.transform.position=target==ForgeLayout.Firebed?eye:cameraHome;c.transform.rotation=Quaternion.LookRotation(target-c.transform.position,Vector3.up);c.Render();}
  }catch(System.Exception e){Debug.LogWarning("FORGE_WARMUP render skipped: "+e.Message);}
  finally{if(go!=null)Destroy(go);if(rt!=null){rt.Release();Destroy(rt);}}
  Debug.Log("FORGE_WARMUP "+added+" variants in "+Mathf.RoundToInt((Time.realtimeSinceStartup-t0)*1000)+" ms");
 }
}
