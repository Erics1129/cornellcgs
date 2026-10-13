using UnityEngine;
using UnityEngine.Rendering;
using L = ForgeLayoutData;

// Owner: room-light-post. Light, fire, flash, quality tiers and the day transition. Every number comes from
// ForgeTuning.room (ForgeFlicker.cs), so feel-tuning.json can retune it without a Unity build.
public partial class ForgeWorld {
 float qualityTime;int frameCount;float frameTotal;float smokeClock;
 ForgeQualityGovernor governor;int appliedMsaa=-1,msaaSupport=-1,sentTier=-1;float perfClock;ForgeFinish finish;
 /// Quality tier 0 (best) to 3. The web maps it to the canvas DPR.
 int QualityTier=>governor!=null?governor.Tier:0;
 /// Particle multiplier for the current tier (1, 1, .6, .4).
 float QualityParticleScale=>ForgeQualityGovernor.ParticleScale(QualityTier);
 ForgeTuning appliedTuning;Color fireBase,bounceBase,rimBase,candleBase;float flashLevel,fireFrame;
 float bellowsSince=99,bellowsStrength;
 // Day transition state (AtmosDay) and the levels it drives.
 float dayClock=-1;bool dayReduced,dawnSent;float fireDay=1,lanternLevel=1,lampLevel=1,doorLevel=1;Color windowNow;
 static readonly Color WindowDay=new Color(.62f,.71f,.84f)*.22f,WindowNight=new Color(.043f,.071f,.094f)*.3f;
 Material daylightLive,candleLive;Renderer ringRenderer;
 static readonly int FireShadowRectId=Shader.PropertyToID("_ForgeFireShadowRect"),FireShadowYId=Shader.PropertyToID("_ForgeFireShadowY"),FireHoodRectId=Shader.PropertyToID("_ForgeFireHoodRect"),
  KeyDirId=Shader.PropertyToID("_ForgeKeyDir"),KeyConeId=Shader.PropertyToID("_ForgeKeyCone"),SconcePosId=Shader.PropertyToID("_ForgeSconcePosition"),SconceColId=Shader.PropertyToID("_ForgeSconceColor"),
  CandlePosId=Shader.PropertyToID("_ForgeCandlePosition"),CandleColId=Shader.PropertyToID("_ForgeCandleColor"),AmbientId=Shader.PropertyToID("_ForgeAmbient"),SootId=Shader.PropertyToID("_ForgeSoot"),SootFlueId=Shader.PropertyToID("_ForgeSootFlue"),
  AoDirectId=Shader.PropertyToID("_ForgeAoDirect"),FireBounceId=Shader.PropertyToID("_ForgeFireBounce"),BounceColorId=Shader.PropertyToID("_ForgeBounceColor"),ShadowZoneId=Shader.PropertyToID("_ForgeShadowZone"),FrameId=Shader.PropertyToID("_Frame"),GlowId=Shader.PropertyToID("_Glow"),EmissionId=Shader.PropertyToID("_EmissionColor");

 /// Called once in Start after MakeDressing and before BatchRoom (static room geometry goes in before batching).
 void AtmosBuild(){
  RoomFloor();
  var hb=LV(L.HearthBoxCenter);var hs=LV(L.HearthBoxSize);
  Shader.SetGlobalVector(FireShadowRectId,new Vector4(hb.x-hs.x/2,hb.z-hs.z/2,hb.x+hs.x/2,hb.z+hs.z/2));
  Shader.SetGlobalVector(FireHoodRectId,new Vector4(L.HoodMin.x,L.HoodMin.z,L.HoodMax.x,L.HoodMax.z));
  Shader.SetGlobalVector(FireShadowYId,new Vector4(hb.y+hs.y/2,L.HoodMin.y,0,0));
  var flue=new Vector2((L.HoodMin.x+L.HoodMax.x)/2,(L.HoodMin.z+L.HoodMax.z)/2);
  Shader.SetGlobalVector(SootId,new Vector4(2.2f,3.4f,flue.x,flue.y));Shader.SetGlobalVector(SootFlueId,new Vector4(1.1f,1.6f,0,0));
  Shader.SetGlobalVector(ShadowZoneId,new Vector4(L.AnvilCenter.x,L.AnvilCenter.y,L.AnvilCenter.z,1.0f));
  Shader.SetGlobalVectorArray(ForgeContract.Globals.Occluders,new Vector4[4]);
  Shader.SetGlobalVector(ForgeContract.Globals.GlowPos,Vector4.zero);Shader.SetGlobalFloat(ForgeContract.Globals.Impact,0);
  Shader.SetGlobalVector(ForgeContract.Globals.ImpactPos,LV(L.StrikePoint));Shader.SetGlobalColor(ForgeContract.Globals.ImpactColor,new Color(1,.58f,.25f)*.32f);
  ApplyRoomTuning();windowNow=WindowDay;
 }
 /// Called once in Start right after the camera exists (clear colour, AA and post settings).
 void AtmosCamera(Camera camera){
  camera.backgroundColor=QaOn(ForgeContract.QaModes.Void)?Color.magenta:C(tuning.room.fogColor);camera.allowMSAA=true;camera.allowHDR=true;
  finish=camera.GetComponent<ForgeFinish>();QualitySettings.shadows=ShadowQuality.Disable;
  governor=new ForgeQualityGovernor(tuning.room,StartTier());ApplyTier();
  if(roomBakedOf.TryGetValue(daylight,out var d))daylightLive=d;else daylightLive=daylight;if(roomBakedOf.TryGetValue(candleWax,out var c))candleLive=c;else candleLive=candleWax;
  ringRenderer=ring!=null?ring.GetComponent<Renderer>():null;
 }
 int StartTier()=>Mathf.RoundToInt(view.Phone?tuning.room.phoneStartTier:tuning.room.desktopStartTier);
 /// Lamp, fire, candle, ambient and fog levels from the tuning (re-run whenever Tune replaces it).
 void ApplyRoomTuning(){
  var r=tuning.room;appliedTuning=tuning;
  Shader.SetGlobalVector(ForgeContract.Globals.KeyPosition,LV(L.HangingLamp));Shader.SetGlobalColor(ForgeContract.Globals.KeyColor,C(r.lampColor).linear*r.lampIntensity);
  float cosO=Mathf.Cos(r.lampConeOuter*Mathf.Deg2Rad),cosI=Mathf.Cos(r.lampConeInner*Mathf.Deg2Rad);
  Shader.SetGlobalVector(KeyDirId,new Vector4(0,-1,0,r.lampUpSpill));Shader.SetGlobalVector(KeyConeId,new Vector4(cosO,1/Mathf.Max(.001f,cosI-cosO),0,0));
  Shader.SetGlobalVector(ForgeContract.Globals.RimPosition,new Vector3((WindowMin.x+WindowMax.x)/2,(WindowMin.y+WindowMax.y)/2,RoomBackZ-.25f));rimBase=C(r.rimColor).linear*r.rimIntensity;
  fireBase=C(r.fireColor).linear*r.fireIntensity*r.fireScale;Shader.SetGlobalVector(ForgeContract.Globals.FirePosition,LV(L.Firebed)+Vector3.up*r.fireLift);
  // The steady level until UpdateLighting runs (the reflection probe is captured in Start, before the first frame).
  Shader.SetGlobalColor(ForgeContract.Globals.FireColor,fireBase);
  // The bounce comes off the lit hearth front and the floor in front of it, toward the anvil.
  var hb=LV(L.HearthBoxCenter);var hs=LV(L.HearthBoxSize);Shader.SetGlobalVector(FireBounceId,new Vector4(hb.x+.12f,.70f,hb.z-hs.z/2-.18f,r.fireBounce>0?1:0));
  bounceBase=C(r.bounceColor).linear*r.fireIntensity*r.fireScale*r.fireBounce;Shader.SetGlobalColor(BounceColorId,bounceBase);
  Shader.SetGlobalVector(SconcePosId,new Vector3(1.25f,1.84f,RoomFrontZ+.13f));var sconce=C(r.sconceColor).linear*r.sconceIntensity;sconce.a=1;Shader.SetGlobalColor(SconceColId,sconce);
  Shader.SetGlobalVector(CandlePosId,LV(L.Lantern)+Vector3.up*.15f);candleBase=sconce*.8f;candleBase.a=1;
  var fill=new Color(.13f,.11f,.09f,1)*r.ambientScale;fill.a=1;Shader.SetGlobalColor(AmbientId,fill);
  RenderSettings.ambientSkyColor=C("8b97a1")*.18f*r.ambientScale;RenderSettings.ambientEquatorColor=C("6b5640")*.18f*r.ambientScale;RenderSettings.ambientGroundColor=C("211c18")*.5f*r.ambientScale;
  RenderSettings.fogColor=C(r.fogColor);RenderSettings.fogDensity=r.fogDensity;
  Shader.SetGlobalFloat(AoDirectId,r.aoDirect);
  if(cam!=null&&!QaOn(ForgeContract.QaModes.Void))cam.backgroundColor=C(r.fogColor);
 }
 /// One bellows stroke of strength 0..1: fire swell, board animation, Send('sfx','bellows').
 void Bellows(float strength){bellowsSince=0;bellowsStrength=Mathf.Clamp01(strength);Send("sfx",0,ForgeContract.Sfx.Bellows,bellowsStrength);}
 /// Called by Sync when snapshot.day changes: the fire banks down, the window goes to night, then dawn
 /// (2.2 s; under reduced motion a .4 s crossfade).
 void AtmosDay(int day){dayClock=0;dayReduced=reduced;dawnSent=false;if(dayReduced){dawnSent=true;Send("sfx",day,ForgeContract.Sfx.Dawn);}}
 void AtmosQa(string mode){if(mode==ForgeContract.QaModes.Void&&cam!=null)cam.backgroundColor=Color.magenta;
#if UNITY_EDITOR
  // Editor QA (scripts/forge-qa/room.mjs snapshot views): 'room-cam:x,y,z,yaw,pitch[,fov]' pins the camera, 'room-cam:off' frees it.
  if(mode.StartsWith("room-cam:")&&cam!=null){var qc=cam.GetComponent<ForgeQaCamera>();if(qc==null)qc=cam.gameObject.AddComponent<ForgeQaCamera>();qc.cam=cam;var a=mode.Substring(9).Split(',');
   if(a.Length>=5){float F(int i)=>float.Parse(a[i],System.Globalization.CultureInfo.InvariantCulture);qc.pos=new Vector3(F(0),F(1),F(2));qc.euler=new Vector3(F(4),F(3),0);qc.fov=a.Length>5?F(5):cam.fieldOfView;qc.on=true;}else qc.on=false;}
#endif
 }
 void UpdateDay(float dt){
  if(dayClock<0){fireDay=1;lanternLevel=1;windowNow=WindowDay;return;}
  dayClock+=dt;float t=dayClock;
  if(dayReduced){float k=Mathf.Clamp01(t/.4f);windowNow=Color.Lerp(WindowNight,WindowDay,k);fireDay=1;lanternLevel=1;if(k>=1)dayClock=-1;return;}
  if(t<.6f){float k=Mathf.SmoothStep(0,1,t/.6f);fireDay=Mathf.Lerp(1,.35f,k);windowNow=Color.Lerp(WindowDay,WindowNight,k);lanternLevel=Mathf.Lerp(1,.45f,k);}
  else if(t<1.4f){fireDay=.35f;windowNow=WindowNight;lanternLevel=.45f;}
  else if(t<2.2f){if(!dawnSent){dawnSent=true;Bellows(1);Send("sfx",state!=null?state.day:0,ForgeContract.Sfx.Dawn);}float k=Mathf.SmoothStep(0,1,(t-1.4f)/.8f);fireDay=Mathf.Lerp(.35f,1,k);windowNow=Color.Lerp(WindowNight,WindowDay*1.3f,k);lanternLevel=Mathf.Lerp(.45f,1,k);}
  else{float k=Mathf.Clamp01((t-2.2f)/3);windowNow=Color.Lerp(WindowDay*1.3f,WindowDay,k);fireDay=1;lanternLevel=1;if(k>=1)dayClock=-1;}
 }
 void UpdateLighting(float dt){
  if(!ReferenceEquals(appliedTuning,tuning))ApplyRoomTuning();
  var r=tuning.room;bool steady=QaOn(ForgeContract.QaModes.Steady);
  UpdateDay(dt);bellowsSince+=dt;
  // The hearth breathes: band-limited flicker (2-4 Hz, +/- 18%), the bellows swell, the night banking.
  float flick=steady?1:ForgeFlicker.Fire(elapsed,r,reduced);float swell=ForgeFlicker.Bellows(bellowsSince,bellowsStrength,r);
  float level=flick*(1+swell)*fireDay;
  Shader.SetGlobalColor(ForgeContract.Globals.FireColor,fireBase*level);Shader.SetGlobalColor(BounceColorId,bounceBase*level);
  if(fireMat!=null){if(!steady)fireFrame+=dt*14*(1+swell*1.5f);fireMat.SetFloat(FrameId,fireFrame);fireMat.SetFloat(GlowId,level);}
  Shader.SetGlobalVector(ForgeContract.Globals.CoalPulse,new Vector4(steady?0:elapsed,(.82f+.18f*flick)*(1+swell*1.4f)*fireDay,reduced?.08f:.3f,0));
  // Window, rim light and the lantern follow the day.
  float windowLevel=windowNow.grayscale/Mathf.Max(.0001f,WindowDay.grayscale);
  Shader.SetGlobalColor(ForgeContract.Globals.RimColor,rimBase*windowLevel);
  if(daylightLive!=null)daylightLive.SetColor(EmissionId,windowNow);doorLevel=windowLevel;
  if(candleLive!=null)candleLive.SetColor(EmissionId,C("ffb952")*.30f*lanternLevel);Shader.SetGlobalColor(CandleColId,candleBase*lanternLevel);
  // Contact flash (written only here and in AtmosImpact).
  flashLevel*=Mathf.Exp(-dt*r.flashDecay);if(flashLevel<.002f)flashLevel=0;Shader.SetGlobalFloat(ForgeContract.Globals.Impact,flashLevel);if(flash!=null)flash.intensity=flashLevel;
  // The evolution ring costs a draw call only while it is visible.
  if(ringRenderer!=null&&ringMat!=null)ringRenderer.enabled=ringMat.GetColor("_Color").a>.002f;
 }
 /// Contact-frame light for a hit (tempC = KnifeTemperature of the struck knife, 0 if it is gone): a local lamp
 /// at the real contact, warm for hot metal and paler for a cold strike. No full-screen flash; none under reduced motion.
 void AtmosImpact(ForgeEvent e,Vector3 contact,float tempC){
  if(reduced)return;var r=tuning.room;
  float k=e.outcome=="dull"?0:e.outcome=="perfect"?r.flashPerfect:e.outcome=="chip"?r.flashChip:e.outcome=="shatter"?r.flashShatter:r.flashGood;if(e.evolution)k=Mathf.Max(k,r.flashEvolution);
  flashLevel=Mathf.Max(flashLevel,k);
  var hot=Color.Lerp(new Color(1,.80f,.62f)*.55f,new Color(1,.58f,.25f),Mathf.SmoothStep(0,1,Mathf.InverseLerp(450,950,tempC)));
  Shader.SetGlobalVector(ForgeContract.Globals.ImpactPos,contact+Vector3.up*.05f);Shader.SetGlobalColor(ForgeContract.Globals.ImpactColor,hot*.32f);
  if(flash!=null)flash.transform.position=contact+Vector3.up*.05f;
 }
 // ---- Quality tiers ----
 void UpdateQuality(float raw){
  if(governor!=null){if(governor.Frame(raw*1000))ApplyTier();
   if(sentTier!=governor.Tier){sentTier=governor.Tier;Send("quality",0,sentTier.ToString());}
   perfClock+=raw;if(perfClock>=1){perfClock=0;Send("perf",governor.Tier,"",governor.P90Ms,governor.MedianMs);}}
  frameTotal+=raw;frameCount++;qualityTime+=raw;if(qualityTime>5){float average=frameTotal/Mathf.Max(1,frameCount);Send("stats",FxParticleCount(),"fps",1/Mathf.Max(.001f,average),bodies.Count);frameTotal=0;frameCount=0;qualityTime=0;}
 }
 /// Resize never changes the tier: it only re-applies AA for the new backing-store size. While the governor is
 /// still warming up, a view class that arrived late (Insets) restarts it at that view's start tier.
 void ResizeQuality(){
  if(governor==null)return;
  if(governor.Seconds<tuning.room.tierIgnoreS){int want=StartTier();if(want!=governor.StartTier){governor.Restart(want);}}
  ApplyTier();
 }
 /// AA, FXAA and the lite shader path for the current tier.
 void ApplyTier(){
  var r=tuning.room;int tier=QualityTier;
  if(msaaSupport<0)msaaSupport=MsaaSupport();
  float mpx=Screen.width*(float)Screen.height/1e6f;int msaa=ForgeQualityGovernor.MsaaFor(tier,msaaSupport,mpx,r.msaaMaxMpx);
  if(msaa!=appliedMsaa){QualitySettings.antiAliasing=msaa>1?msaa:0;appliedMsaa=msaa;}
  if(finish!=null)finish.fxaa=msaa<=1;
  if(tier>=2)Shader.EnableKeyword("FORGE_LITE");else Shader.DisableKeyword("FORGE_LITE");
 }
 /// Highest MSAA sample count (1, 2 or 4) the HDR camera target supports here (WebKit and some Android have none).
 static int MsaaSupport(){
  try{var d=new RenderTextureDescriptor(Mathf.Max(16,Screen.width),Mathf.Max(16,Screen.height),RenderTextureFormat.DefaultHDR,24){msaaSamples=4};return Mathf.Max(1,SystemInfo.GetRenderTextureSupportedMSAASampleCount(d));}
  catch{return 1;}
 }
 /// Hearth smoke (room atmosphere, under this stream's reduced-motion policy): wisps rising into the hood.
 void UpdateHearthSmoke(float dt){
  if(reduced||QaOn(ForgeContract.QaModes.Steady))return;
  smokeClock+=dt;if(smokeClock>tuning.room.smokeEveryS){smokeClock=0;Puff(LV(L.HoodSmokeSource)+new Vector3(Random.Range(-.08f,.08f),0,Random.Range(-.05f,.05f)),1,true);}
 }
}
#if UNITY_EDITOR
/// Editor-only QA camera pin (see AtmosQa 'room-cam:'): runs after ForgeWorld's camera update and before the snapshot rig renders.
[DefaultExecutionOrder(9000)] public class ForgeQaCamera:MonoBehaviour {
 public Camera cam;public bool on;public Vector3 pos,euler;public float fov=60;
 void LateUpdate(){if(on&&cam!=null){cam.transform.SetPositionAndRotation(pos,Quaternion.Euler(euler));cam.fieldOfView=fov;}}
}
#endif
