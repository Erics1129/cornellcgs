using UnityEngine;
using UnityEngine.Rendering;

// Owner: integration. WebGL links a shader program on its first draw, and ANGLE (Chromium and Safari) builds the Metal
// pipeline then too, per vertex layout, blend state and target format. The startup reflection capture draws the static
// room, but the knife (Forge/Blade), the tongs, the hammer, the particles, the smear and the smoke were first drawn on
// the first Start forging or strike, which showed as a 35-90 ms stall on the first hearth step and a 25-50 ms stall on
// the frame after the first impact of each outcome (flakes, sparks, scale pop, shatter pieces, smear, contact flash).
// WarmShaders runs once in Start, behind the loading screen: it compiles the variants, then renders off-screen frames
// of the hearth and of the anvil with every impact path alive at once (a throw-away hot knife with a chip notch, a
// footprint and a Perfect flash, one quad of every particle kind with velocity stretch, a shatter piece set, the
// smear ghosts, a coin, the evolution ring, the contact flash and the glow lamp), then puts everything back.
public partial class ForgeWorld {
 void WarmShaders(){
  float t0=Time.realtimeSinceStartup;int added=WarmVariants(),paths=WarmFrames();
  Debug.Log("FORGE_WARMUP "+added+" variants, "+paths+" impact paths in "+Mathf.RoundToInt((Time.realtimeSinceStartup-t0)*1000)+" ms");
 }
 /// The pipelines depend on the target's MSAA and on FORGE_LITE. Start warms with the desktop tier; the page's Insets
 /// then put a phone on its start tier (no MSAA, the lite variants), so the warm-up runs once more for that state on the
 /// next frame (only during the boot handshake: a later tier drop is not worth another stall).
 int warmedMsaa=-1,rewarms;bool warmedLite;float warmedAt;
 void RewarmIfNeeded(){
  if(warmedMsaa<0||rewarms>=2||Time.realtimeSinceStartup-warmedAt>8)return;
  if(Mathf.Max(1,QualitySettings.antiAliasing)==warmedMsaa&&Shader.IsKeywordEnabled("FORGE_LITE")==warmedLite)return;
  rewarms++;float t0=Time.realtimeSinceStartup;int added=WarmVariants(),paths=WarmFrames();
  Debug.Log("FORGE_WARMUP again for MSAA "+warmedMsaa+(warmedLite?" lite":"")+": "+added+" variants, "+paths+" impact paths in "+Mathf.RoundToInt((Time.realtimeSinceStartup-t0)*1000)+" ms");
 }
 int WarmVariants(){
  int added=0;
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
  return added;
 }
 /// Off-screen frames into a target like the camera's own (HDR, same MSAA), so the pipelines exist before the first
 /// Start forging turns the view to the hearth and before the first impact of each outcome. Returns the impact paths drawn.
 int WarmFrames(){
  warmedMsaa=Mathf.Max(1,QualitySettings.antiAliasing);warmedLite=Shader.IsKeywordEnabled("FORGE_LITE");warmedAt=Time.realtimeSinceStartup;
  RenderTexture rt=null;GameObject go=null;Body warm=null;int paths=0;
  try{
   rt=new RenderTexture(96,64,24,RenderTextureFormat.DefaultHDR){antiAliasing=warmedMsaa,name="Forge warm-up"};rt.Create();
   go=new GameObject("Forge warm-up camera");var c=go.AddComponent<Camera>();c.CopyFrom(cam);c.enabled=false;c.targetTexture=rt;
   var eye=ForgeLayout.HearthStance+Vector3.up*ForgeLayout.EyeHeight;
   foreach(var target in new[]{ForgeLayout.Firebed,ForgeLayout.StrikePoint}){c.transform.position=target==ForgeLayout.Firebed?eye:cameraHome;c.transform.rotation=Quaternion.LookRotation(target-c.transform.position,Vector3.up);c.Render();}
   warm=WarmImpactScene(out paths);
   c.transform.position=cameraHome;c.transform.rotation=Quaternion.LookRotation(ForgeLayout.StrikePoint-cameraHome,Vector3.up);c.Render();
   // The same scene from the hearth (the quench and the carried blade are seen from there).
   c.transform.position=eye;c.transform.rotation=Quaternion.LookRotation(ForgeLayout.StrikePoint-eye,Vector3.up);c.Render();
  }catch(System.Exception e){Debug.LogWarning("FORGE_WARMUP render skipped: "+e.Message);}
  finally{
   try{WarmImpactCleanup(warm);}catch(System.Exception e){Debug.LogWarning("FORGE_WARMUP cleanup: "+e.Message);}
   if(go!=null)Destroy(go);if(rt!=null){rt.Release();Destroy(rt);}
  }
  return paths;
 }
 static readonly Vector2[] WarmProfile={new Vector2(0,-.25f),new Vector2(.8f,-.26f),new Vector2(1.3f,-.23f),new Vector2(1.8f,-.18f),new Vector2(2.3f,-.08f),new Vector2(2.02f,.16f),new Vector2(1.7f,.34f),new Vector2(1.3f,.46f),new Vector2(.6f,.53f),new Vector2(0,.5f)};
 GameObject warmCoin;bool warmSmear;
 /// Everything the first impacts draw, alive for one frame. Returns the throw-away knife (WarmImpactCleanup removes it).
 Body WarmImpactScene(out int paths){
  paths=0;var t=tuning.metal;
  var k=new ForgeKnife{id=-9001,level=4,family=1,metal="iron",place="anvil",heated=true,color="",glow="",rough=.3f,profile=WarmProfile,displayName="warm-up"};
  var b=MakeKnife(k);b.root.transform.SetPositionAndRotation(ForgeLayout.KnifeAnvilRoot,Quaternion.identity);
  var h=b.heatState;h.model.Reset(1100);paths++;
  // Chip notch and a strike's spread (a KnifeRefresh-sized rebuild), a footprint, a dimple and the Perfect flash.
  h.shape.notchU=.55f;h.shape.AddSpread(.4f,1.5f,t);h.dirty=true;KnifeMeshIfDirty(b);
  h.hits[0]=new Vector4(.5f,.5f,0,1);h.marks[0]=new Vector4(.5f,.5f,1,.5f);h.flashAge=0;h.flashDur=.3f;h.flashGain=1;h.crack=.5f;h.glint=.3f;b.evolution=.75f;ApplyHeatUniforms(b);paths+=2;
  var at=ForgeLayout.StrikePoint+Vector3.up*.01f;
  // One of every particle kind, with velocity (the stretched billboards): flakes, sheets, chips, sparks, forks, embers,
  // glints, quench rings and bubbles; dust, hearth smoke and steam in the smoke batch.
  int before=bitCount;
  Debris(at,"perfect",4,2,2,2,t.perfectMaxSpeed,1100);
  Spawn(KFork,at,Vector3.up*2,.002f,1700,0,.2f,Oxide,10);Spawn(KEmber,at,Vector3.up*.3f,.002f,900,0,1,Oxide,2);Spawn(KGlint,at,Vector3.up*.5f,.003f,0,0,1,Oxide,2);
  Spawn(KRing,at,Vector3.zero,.03f,0,0,1,Water);Spawn(KBubble,at,Vector3.up*.05f,.004f,0,0,1,Water);
  for(int i=before;i<bitCount;i++){bits[i].age=.02f;if(bits[i].kind==KFlake||bits[i].kind==KSheet)bits[i].v=new Vector3(2,1,0);}
  DrawBits();paths+=2;
  bool wasReduced=reduced;reduced=false;Puff(at,1,true);ScaleDust(at,1);SteamPuff(at,1,.5f);reduced=wasReduced;
  for(int i=0;i<smokeCount;i++)smoke[i].age=Mathf.Max(smoke[i].age,.05f);DrawSmoke();paths++;
  // A shatter piece set from the same knife (its own material copy and dynamic mesh).
  BreakBlade(b);if(shardObject!=null)shardObject.SetActive(true);paths++;
  // Smear ghosts on the downstroke, a sale coin, the evolution ring.
  if(smear!=null){warmSmear=true;foreach(var g in smear){g.position=at+Vector3.up*.08f;g.rotation=Quaternion.identity;g.localScale=new Vector3(1.4f,1,1);g.gameObject.SetActive(true);}paths++;}
  warmCoin=coinPool.Count>0?coinPool.Pop():MakeCoin();warmCoin.SetActive(true);warmCoin.transform.position=at+Vector3.right*.05f;warmCoin.transform.localScale=new Vector3(.024f,.0022f,.024f);paths++;
  if(ringRenderer!=null&&ringMat!=null){ringRenderer.enabled=true;ringMat.SetColor("_Color",new Color(1,.65f,.2f,.2f));ring.position=at;ring.localScale=Vector3.one*.3f;paths++;}
  // The contact flash and the glow lamp.
  Shader.SetGlobalFloat(ForgeContract.Globals.Impact,4);Shader.SetGlobalVector(ForgeContract.Globals.ImpactPos,at+Vector3.up*.03f);
  Shader.SetGlobalVector(ForgeContract.Globals.GlowPos,new Vector4(at.x,at.y+.03f,at.z,t.glowRangeM));Shader.SetGlobalVector(ForgeContract.Globals.GlowColor,new Vector4(1,.4f,.1f,0));paths++;
  return b;
 }
 /// Put back everything WarmImpactScene changed: no particles, no shards, no ghosts, no coin, flash and glow off.
 void WarmImpactCleanup(Body b){
  bitCount=0;smokeCount=0;if(litBatch!=null){DrawBits();}if(smokeBatch!=null)DrawSmoke();
  ClearShards();breakShape=null;
  if(warmSmear&&smear!=null){foreach(var g in smear)g.gameObject.SetActive(false);warmSmear=false;}
  if(warmCoin!=null){warmCoin.SetActive(false);coinPool.Push(warmCoin);warmCoin=null;}
  if(ringRenderer!=null&&ringMat!=null){ringMat.SetColor("_Color",new Color(1,.65f,.2f,0));ringRenderer.enabled=false;}
  Shader.SetGlobalFloat(ForgeContract.Globals.Impact,0);Shader.SetGlobalVector(ForgeContract.Globals.ImpactPos,ForgeLayout.StrikePoint);
  Shader.SetGlobalVector(ForgeContract.Globals.GlowPos,Vector4.zero);Shader.SetGlobalVector(ForgeContract.Globals.GlowColor,Vector4.zero);
  if(b!=null)DisposeBody(b);
 }
}
