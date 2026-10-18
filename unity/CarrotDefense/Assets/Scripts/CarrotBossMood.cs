using System.Collections.Generic;
using System.Globalization;
using UnityEngine;
using UnityEngine.Rendering;
using UnityEngine.Rendering.Universal;

namespace CarrotTD {
 /// <summary>
 /// BOSS MOOD (presentation only): despair on the eleven boss levels. Reads the game, never writes it (no game.* assignment, no
 /// command, no RequestTimeScale, no UnityEngine.Random; view schedules use System.Random(9307 + level*31 + salt)).
 /// Every frame it writes lights, fog, sky, the mood Volume, world-material globals, the boss's drawn scale and the carrot's fear from
 /// baselines captured at the end of ApplyBiomeLighting, so nothing accumulates and every other writer (roar dip, blindness dim,
 /// victory orbit, defeat) composes through sunBase/fogEndBase. Non-boss levels, duo, endless and spectator views only switch it off.
 /// Hooks into existing code (each one line, marked BOSS MOOD): Update (BossMoodTick), ApplyBiomeLighting (BossMoodCapture),
 /// UpdateCinematics (BossMoodShot), Quality (BossMoodQuality), UpdateActors (bossMoodRim).
 /// </summary>
 public sealed partial class CarrotView {
  // ---------------------------------------------------------------- state
  CarrotMoodProfile mood;bool moodActive,moodDisabled;float moodForce=-1;Transform moodWorld;int moodBuilds;
  float moodD,moodDL,moodDe,moodDeL,moodI=1,moodLow=1,moodClock,moodLogClock;
  readonly CarrotMoodTracker moodTracker=new CarrotMoodTracker();CarrotGame moodTrackedGame;
  int moodStage,moodReleaseSeen,moodArrivalSeen,moodPhaseSeen,moodDawnSeen,moodRebirthSeen;float moodStageClock,moodArrival=-1,moodRelease=-1,moodReleaseHold,moodReleaseDelay=.6f,moodReleaseSpeed=6,moodReleaseTau=.8f,moodReleaseMax=20;bool moodReleaseFull;
  float moodPrevNext,moodSendNow=-1,moodPhaseAge=1e9f;int moodPrevWave;string moodPrevPhase="";
  float bossMoodRim,moodBossK=1,moodDmax,moodBossRoute;bool moodThroughBase;float moodDawnClock=-1;
  // ---------------------------------------------------------------- baselines (captured at the end of ApplyBiomeLighting)
  struct MoodBase{public bool valid;public Quaternion sunRot,fillRot;public Color sunColor,fillColor,ambSky,ambEq,ambGround,fog,zenith,horizon,ground,skySun,cloudColor;
   public float sunRaw,sunShadow,fillIntensity,fogStart,fogEnd,sunSize,sunGlow,clouds,stars,aurora;
   public float exposure,contrast,saturation,vignette,dofStart,dofEnd;public Color vignetteColor;public Vector4 smhShadows,smhHighlights;public bool hasSmh,hasDof;}
  MoodBase mb;
  Volume moodVolume;VolumeProfile moodVolumeProfile;ColorAdjustments moodCA;WhiteBalance moodWB;Vignette moodVig;ShadowsMidtonesHighlights moodSMH;DepthOfField moodDoF;

  bool BossMoodEligible(){
   if(Spectator||duoOn||game==null||game.level==null||moodDisabled)return false;
   if(string.IsNullOrEmpty(game.level.boss)||CarrotBossMoodCurve.Profile(game.level.id)=="")return false;
   return game.Mode=="normal"||game.Mode=="veteran";
  }
  static float MoodSin(float d){return Mathf.Sin(Mathf.Clamp(d,1,89)*Mathf.Deg2Rad);}

  // ---------------------------------------------------------------- hook 2: end of ApplyBiomeLighting
  void BossMoodCapture(){
   mb.valid=false;
   if(!BossMoodEligible()){BossMoodNeutral();return;}
   mb.sunRot=sun.transform.rotation;mb.sunColor=sun.color;mb.sunRaw=sunBase;mb.sunShadow=sun.shadowStrength;
   if(fill!=null){mb.fillRot=fill.transform.rotation;mb.fillColor=fill.color;mb.fillIntensity=fill.intensity;}
   mb.ambSky=RenderSettings.ambientSkyColor;mb.ambEq=RenderSettings.ambientEquatorColor;mb.ambGround=RenderSettings.ambientGroundColor;
   mb.fog=RenderSettings.fogColor;mb.fogStart=RenderSettings.fogStartDistance;mb.fogEnd=fogEndBase;
   if(skyMaterial!=null){mb.zenith=skyMaterial.GetColor("_Zenith");mb.horizon=skyMaterial.GetColor("_Horizon");mb.ground=skyMaterial.GetColor("_Ground");mb.skySun=skyMaterial.GetColor("_SunColor");mb.cloudColor=skyMaterial.GetColor("_CloudColor");
    mb.sunSize=skyMaterial.GetFloat("_SunSize");mb.sunGlow=skyMaterial.GetFloat("_SunGlow");mb.clouds=skyMaterial.GetFloat("_CloudAmount");mb.stars=skyMaterial.GetFloat("_Stars");mb.aurora=skyMaterial.GetFloat("_Aurora");}
   var live=grade!=null?grade.profile:null;mb.hasSmh=false;mb.hasDof=false;mb.vignette=.15f;mb.vignetteColor=Color.black;mb.exposure=0;mb.contrast=0;mb.saturation=0;
   if(live!=null){
    if(live.TryGet<ColorAdjustments>(out var ca)){mb.exposure=ca.postExposure.value;mb.contrast=ca.contrast.value;mb.saturation=ca.saturation.value;}
    if(live.TryGet<Vignette>(out var vg)){mb.vignette=vg.intensity.value;mb.vignetteColor=vg.color.value;}
    if(live.TryGet<ShadowsMidtonesHighlights>(out var smh)&&smh.active){mb.hasSmh=true;mb.smhShadows=smh.shadows.value;mb.smhHighlights=smh.highlights.value;}
    if(live.TryGet<DepthOfField>(out var dof)&&dof.active){mb.hasDof=true;mb.dofStart=dof.gaussianStart.value;mb.dofEnd=dof.gaussianEnd.value;}
   }
   mb.valid=true;
   mood=CarrotMoodProfile.Get(CarrotBossMoodCurve.Profile(game.level.id));moodI=CarrotBossMoodCurve.Intensity(game.level.id);
   moodLow=(CarrotQuality.Tier==CarrotQuality.LowTier||CarrotQuality.Phone?.6f:1f)*(mood!=null?mood.lum:1);
   BossMoodVolume();
  }
  /// <summary>Off: the only writes a non-boss level ever sees from this system (shader global, Volume, bus, FX).</summary>
  void BossMoodNeutral(bool restoreAmbient=false){
   Shader.SetGlobalVector("_CarrotMood",Vector4.zero);
   if(moodVolume!=null){moodVolume.weight=0;moodVolume.enabled=false;}
   if(moodActive||CarrotBossMood.Active){CarrotBossMood.Off();}
   if(moodActive&&effects!=null){effects.MoodFxOff(restoreAmbient);}
   moodActive=false;mood=null;bossMoodRim=0;
  }
  void BossMoodVolume(){
   if(moodVolume==null){var go=new GameObject("Boss mood grade");go.transform.SetParent(transform,false);moodVolume=go.AddComponent<Volume>();moodVolume.isGlobal=true;moodVolume.priority=2;moodVolume.weight=0;
    moodVolumeProfile=ScriptableObject.CreateInstance<VolumeProfile>();moodVolumeProfile.name="Boss mood (runtime)";
    moodCA=moodVolumeProfile.Add<ColorAdjustments>(false);moodWB=moodVolumeProfile.Add<WhiteBalance>(false);moodVig=moodVolumeProfile.Add<Vignette>(false);moodSMH=moodVolumeProfile.Add<ShadowsMidtonesHighlights>(false);moodDoF=moodVolumeProfile.Add<DepthOfField>(false);
    // sharedProfile, never .profile (that would instantiate a private copy).
    moodVolume.sharedProfile=moodVolumeProfile;}
   moodCA.postExposure.overrideState=true;moodCA.contrast.overrideState=true;moodCA.saturation.overrideState=true;
   moodWB.temperature.overrideState=true;moodWB.tint.overrideState=true;
   moodVig.intensity.overrideState=true;moodVig.color.overrideState=mood!=null&&mood.vignetteColor.a>0;
   bool smh=mb.hasSmh&&CarrotQuality.Rich&&mood!=null&&(mood.smhShadows!=Vector4.zero||mood.smhHighlights!=Vector4.zero);moodSMH.active=smh;moodSMH.shadows.overrideState=smh&&mood.smhShadows!=Vector4.zero;moodSMH.highlights.overrideState=smh&&mood.smhHighlights!=Vector4.zero;
   bool dof=mb.hasDof&&CarrotQuality.High&&mood!=null&&mood.dofBeyondBoard;moodDoF.active=dof;moodDoF.gaussianStart.overrideState=dof;moodDoF.gaussianEnd.overrideState=dof;
  }

  // ---------------------------------------------------------------- per build (lazily, on the first tick after BuildLevel)
  void BossMoodBuild(){
   moodBuilds++;BossMoodDisposeWorld();
   if(!mb.valid||!BossMoodEligible()){BossMoodNeutral();return;}
   moodActive=true;
   if(moodTrackedGame!=game){if(moodTrackedGame!=null)moodTrackedGame.Effect-=moodTracker.OnEvent;game.Effect+=moodTracker.OnEvent;moodTrackedGame=game;}
   moodTracker.Reset(game);moodReleaseSeen=moodTracker.Releases;moodArrivalSeen=moodTracker.Arrivals;moodPhaseSeen=moodTracker.Phases;moodDawnSeen=moodTracker.Dawns;moodRebirthSeen=moodTracker.Rebirths;moodBossRoute=0;moodArrival=moodRelease=-1;moodStage=0;moodStageClock=0;moodBossK=1;moodDawnClock=-1;moodSendNow=-1;moodPhaseAge=1e9f;moodPrevWave=game.wave;moodPrevNext=game.nextWave;
   moodThroughBase=effects.Through;moodClock=0;moodPrevPhase=game.phase;
   moodTracker.Adopt();
   var input=moodTracker.Build(0);moodD=CarrotBossMoodCurve.Target(input);moodDL=CarrotBossMoodCurve.TargetLight(input);
   var sw=System.Diagnostics.Stopwatch.StartNew();
   BossMoodWorldBuild();
   long ms=sw.ElapsedMilliseconds;
   effects.MoodFxSetup(mood,game.level.biome,game.level.id,carrotPosition,routeMin,routeMax);
   string check=CarrotBossMoodCurve.CheckData();if(check!="")Debug.LogWarning(check);
   #if UNITY_EDITOR||DEVELOPMENT_BUILD||CARROT_QA
   {CarrotBossMoodCurve.SelfTest(out var report);Debug.Log(report);}
   #endif
   Debug.Log("CARROT_MOOD_BUILD level="+game.level.id+" profile="+mood.id+" mode="+game.Mode+" intensity="+moodI.ToString("F2",CultureInfo.InvariantCulture)+" low="+moodLow.ToString("F1",CultureInfo.InvariantCulture)+" worldMs="+ms+" tier="+CarrotQuality.Name(CarrotQuality.Tier));
   BossMoodTickCore(0,0);
  }

  // ---------------------------------------------------------------- hook 1: Update, after UpdateBlind
  void BossMoodTick(float raw,float viewDt){
   if(Spectator)return;
   if(world!=moodWorld){moodWorld=world;BossMoodBuild();return;}
   if(!moodActive)return;
   BossMoodTickCore(game.paused?0:raw,viewDt);
  }
  void BossMoodTickCore(float dt,float viewDt){
   if(mood==null||!mb.valid)return;
   var inv=CultureInfo.InvariantCulture;moodClock+=dt;moodStageClock+=dt;
   // --- events through the tracker (read-only) ---
   if(moodTracker.Arrivals!=moodArrivalSeen){moodArrivalSeen=moodTracker.Arrivals;moodArrival=0;BossMoodArrival();}
   if(moodTracker.Phases!=moodPhaseSeen){moodPhaseSeen=moodTracker.Phases;moodPhaseAge=0;}
   if(moodTracker.Dawns!=moodDawnSeen){moodDawnSeen=moodTracker.Dawns;moodDawnClock=0;}
   if(moodTracker.Rebirths!=moodRebirthSeen){moodRebirthSeen=moodTracker.Rebirths;}
   if(moodTracker.Releases!=moodReleaseSeen){moodReleaseSeen=moodTracker.Releases;BossMoodReleaseStart(false);}
   // A challenge's full release waits for the victory (the guardian's fall there is an aftershock, not the end).
   if(game.phase=="won"&&moodPrevPhase!="won"&&(moodRelease<0||!moodReleaseFull))BossMoodReleaseStart(true);moodPrevPhase=game.phase;
   if(moodArrival>=0)moodArrival+=dt;if(moodRelease>=0)moodRelease+=dt;moodPhaseAge+=dt;if(moodDawnClock>=0)moodDawnClock+=dt;if(moodSendNow>=0)moodSendNow+=dt;
   // Held breath skipped by an early call: the wave before the boss ends while its breather still runs (sound uses SendNowAge).
   int bw=CarrotBossMoodCurve.BossWave(game.level.id);
   if(game.wave!=moodPrevWave){if(game.wave==bw&&moodPrevWave==bw-1&&moodPrevNext>2.5f)moodSendNow=0;BossMoodWaveStart(game.wave);moodPrevWave=game.wave;}
   moodPrevNext=game.nextWave;
   // --- the curve ---
   var input=moodTracker.Build(moodD);
   float t=CarrotBossMoodCurve.Target(input),tl=CarrotBossMoodCurve.TargetLight(input);
   bool entrance=moodArrival>=0&&moodArrival<2.6f||input.dawnAge>=2.2f&&input.dawnAge<3f;
   bool dawnWindow=input.dawnAge<2.2f;bool release=moodRelease>=0&&moodRelease<9f;
   if(moodForce>=0){t=tl=moodForce;entrance=true;}
   if(release&&moodForce<0){
    // Release: colour runs back out from the carrot with the restoration front (shader), the global D follows fast, the light with
    // tau .4 s (front-loaded campaign win) or .8 s; monotonic within any second.
    float k=1-Mathf.Exp(-dt/.6f),kl=1-Mathf.Exp(-dt/moodReleaseTau);
    if(moodRelease>=moodReleaseDelay){moodD+=(t-moodD)*k;moodDL+=(tl-moodDL)*kl;}
   }else{
    moodD=CarrotBossMoodCurve.Step(moodD,t,dt,entrance,dawnWindow);
    moodDL=CarrotBossMoodCurve.Step(moodDL,tl,dt,entrance,false);
   }
   moodDe=moodD*moodI;moodDeL=moodDL*moodI;
   // --- stage ---
   int stage=game.phase=="won"?6:game.phase=="lost"?7:release?4:input.boss==3?(CarrotBossMoodCurve.Challenge(game.level.id)?5:4):input.boss==1||input.boss==2?(moodArrival>=0&&moodArrival<2.6f?2:3):input.boss==4?3:(bw>=2&&game.wave==bw-1&&game.nextWave>0?1:0);
   if(stage!=moodStage){moodStage=stage;moodStageClock=0;}
   // --- bus ---
   CarrotBossMood.Active=true;CarrotBossMood.Profile=mood.id;CarrotBossMood.Level=game.level.id;CarrotBossMood.Build=moodBuilds;CarrotBossMood.Stage=moodStage;CarrotBossMood.Hearts=game.health;
   CarrotBossMood.ArrivalCount=moodTracker.Arrivals;CarrotBossMood.PhaseCount=moodTracker.Phases;CarrotBossMood.DawnCount=moodTracker.Dawns;CarrotBossMood.ReleaseCount=moodTracker.Releases;CarrotBossMood.RebirthCount=moodTracker.Rebirths;CarrotBossMood.MiniCount=moodTracker.Minis;
   CarrotBossMood.D=moodD;CarrotBossMood.De=moodDe;CarrotBossMood.DLight=moodDL;CarrotBossMood.Fear=CarrotBossMoodCurve.Fear(game.health);CarrotBossMood.Route=input.route;CarrotBossMood.StageClock=moodStageClock;
   CarrotBossMood.PhaseAge=moodPhaseAge;CarrotBossMood.SendNowAge=moodSendNow;CarrotBossMood.BossAlive=input.boss==1||input.boss==2;CarrotBossMood.Reduced=reducedMotion;CarrotBossMood.Paused=game.paused;
   CarrotBossMood.WavesLeft=game.wave<game.level.waves;CarrotBossMood.Challenge=CarrotBossMoodCurve.Challenge(game.level.id);
   // --- channels ---
   BossMoodLight(input);
   BossMoodGrade();
   BossMoodWorldTick(input,dt);
   BossMoodBoss(input,dt);
   BossMoodCarrot(input,viewDt);
   bossMoodRim=.25f*moodDe;
   effects.Through=moodThroughBase||input.boss==1||input.boss==2;
   if(mood.gust>0&&!reducedMotion)Shader.SetGlobalFloat("_CarrotGust",Shader.GetGlobalFloat("_CarrotGust")*(1+mood.gust*moodDe));
   Vector3 bossPos=Vector3.zero;bool bossOn=false;foreach(var e in game.enemies)if(e.id==moodTracker.BossId&&e.alive){bossPos=e.position;bossOn=!e.hidden;break;}
   effects.MoodFxTick(viewDt,dt,moodDe,bossPos,bossOn,reducedMotion,game.level.waves-game.wave+1,game.level.waves,moodStage);
   #if UNITY_EDITOR||DEVELOPMENT_BUILD||CARROT_QA
   moodLogClock+=dt;if(moodLogClock>=1){moodLogClock=0;Debug.Log("CARROT_MOOD level="+game.level.id+" profile="+mood.id+" active=1 stage="+moodStage+" D="+moodD.ToString("F3",inv)+" De="+moodDe.ToString("F3",inv)+" DL="+moodDL.ToString("F3",inv)+" route="+input.route.ToString("F3",inv)+" boss="+input.boss+" front="+moodFront.ToString("F3",inv)+" losses="+moodLossCount+" k="+moodBossK.ToString("F3",inv)+" fogEnd="+RenderSettings.fogEndDistance.ToString("F1",inv)+" dmax="+moodDmax.ToString("F1",inv)+" sun="+sun.intensity.ToString("F3",inv)+" pitch="+sun.transform.eulerAngles.x.ToString("F1",inv)+(moodForce>=0?" forced="+moodForce.ToString("F2",inv):""));}
   #endif
  }

  // ---------------------------------------------------------------- light, fog, sky
  void BossMoodLight(CarrotMoodInput input){
   float L=CarrotBossMoodCurve.Light(moodDeL),C=moodDe;var p=mood;
   Vector3 e0=mb.sunRot.eulerAngles;float pitch0=e0.x>180?e0.x-360:e0.x;
   float pitchEnd=p.sunPitch<0?pitch0:Mathf.Max(p.sunPitch,Mathf.Max(18,pitch0-8));if(pitchEnd>pitch0)pitchEnd=pitch0;
   float pitch=Mathf.Lerp(pitch0,pitchEnd,L);
   // L24's dawn: after the guardian falls the sun climbs to 30 degrees in gold over 8 s, then settles back to 24 over 8 s.
   float dawn=0;if(p.dawn&&moodRelease>=moodReleaseDelay){float t=moodRelease-moodReleaseDelay;dawn=t<8?Smooth01(t/8):t<16?1-Smooth01((t-8)/8):0;pitch=Mathf.Lerp(pitch,30,dawn);}
   sun.transform.rotation=Quaternion.Euler(pitch,e0.y,e0.z);
   float kFlat=1-(1-p.kFlat)*moodLow;float keyMul=Mathf.Clamp(Mathf.Lerp(1,kFlat,L)*MoodSin(pitch0)/MoodSin(pitch),.70f,p.keyCap);
   if(dawn>0)keyMul=Mathf.Lerp(keyMul,1.08f,dawn);
   sunBase=mb.sunRaw*keyMul;
   bool free=dipClock<0&&lastDim<=0&&orbitClock<0&&defeatClock<0;
   if(free)sun.intensity=sunBase;
   float CD=p.chromaDrain*C;
   if(defeatClock<0){Color key=p.key.a>0?Color.Lerp(mb.sunColor,SameLuma(new Color(p.key.r,p.key.g,p.key.b),mb.sunColor),L):mb.sunColor;key=Desat(key,CD);if(dawn>0)key=Color.Lerp(key,new Color(1,.86f,.6f),dawn);sun.color=key;}
   sun.shadowStrength=Mathf.Clamp01(mb.sunShadow+p.shadowDelta*L);
   if(fill!=null){float fm=1-(1-p.fillMul)*moodLow;fill.intensity=Mathf.Min(mb.fillIntensity*Mathf.Lerp(1,fm,L),sunBase/3f);fill.color=Desat(p.fill.a>0?Color.Lerp(mb.fillColor,SameLuma(new Color(p.fill.r,p.fill.g,p.fill.b),mb.fillColor),L):mb.fillColor,CD);
    float swing=p.fillYawSwing>0&&!reducedMotion?p.fillYawSwing*Mathf.Sin(moodClock*Mathf.PI*2*.06f)*L:0;fill.transform.rotation=mb.fillRot*Quaternion.Euler(0,swing,0);}
   float am=Mathf.Lerp(1,1-(1-p.ambMul)*moodLow,L);float at=p.ambTint.a>0?.22f*C:0;Color tint=new Color(p.ambTint.r,p.ambTint.g,p.ambTint.b);
   RenderSettings.ambientSkyColor=Desat(Color.Lerp(mb.ambSky*am,tint,at),CD);RenderSettings.ambientEquatorColor=Desat(Color.Lerp(mb.ambEq*am,tint,at),CD);RenderSettings.ambientGroundColor=Desat(Color.Lerp(mb.ambGround*Mathf.Lerp(1,am,.7f),tint*.6f,at),CD);
   // Fog: colour toward the profile; the end closes in, but never so far that fog at any route or pad sample rises by more than .03.
   RenderSettings.fogColor=Desat(p.fog.a>0?Color.Lerp(mb.fog,FloorLuma(new Color(p.fog.r,p.fog.g,p.fog.b),mb.fog,p.fogFloor+(1-p.fogFloor)*(1-moodLow)),C):mb.fog,CD);
   float start=mb.fogStart,end=p.fogEnd>0?Mathf.Lerp(mb.fogEnd,p.fogEnd,C):mb.fogEnd;
   moodDmax=BossMoodDmax();float endMin=start+6;
   if(moodDmax>start){float f0=Mathf.Clamp01((moodDmax-start)/Mathf.Max(.01f,mb.fogEnd-start));endMin=Mathf.Max(endMin,start+(moodDmax-start)/Mathf.Min(1,f0+.03f));}
   fogEndBase=Mathf.Max(end,endMin);if(free)RenderSettings.fogEndDistance=fogEndBase;
   // Sky (visible in the entrance shot and the victory orbit only): its sun disk is decoupled from the shadow-casting light.
   if(skyMaterial!=null){
    float SC=Mathf.Clamp01(C*1.6f);
    float sp=p.skySunPitch>=0?Mathf.Lerp(pitch0,p.skySunPitch,L):pitch;if(dawn>0)sp=Mathf.Lerp(sp,30,dawn);float swing=p.fillYawSwing>0&&!reducedMotion?p.fillYawSwing*Mathf.Sin(moodClock*Mathf.PI*2*.06f)*L:0;
    skyMaterial.SetVector("_CarrotSunDir",-(Quaternion.Euler(sp,e0.y+swing,0)*Vector3.forward));
    skyMaterial.SetColor("_Zenith",Mix(mb.zenith,p.zenith,SC));skyMaterial.SetColor("_Horizon",Mix(mb.horizon,p.horizon,SC));skyMaterial.SetColor("_Ground",Mix(mb.ground,p.ground,SC));
    Color sunSky=Mix(mb.skySun,p.sunColor,SC);if(dawn>0)sunSky=Color.Lerp(sunSky,new Color(1,.86f,.6f)*1.5f,dawn);skyMaterial.SetColor("_SunColor",sunSky);skyMaterial.SetColor("_CloudColor",Mix(mb.cloudColor,p.cloudColor,SC));
    skyMaterial.SetFloat("_SunSize",p.sunSize>=0?Mathf.Lerp(mb.sunSize,p.sunSize,C):mb.sunSize);skyMaterial.SetFloat("_SunGlow",p.sunGlow>=0?Mathf.Lerp(mb.sunGlow,p.sunGlow,C):mb.sunGlow);
    skyMaterial.SetFloat("_CloudAmount",p.clouds>=0?Mathf.Lerp(mb.clouds,p.clouds,C):mb.clouds);skyMaterial.SetFloat("_Stars",p.stars>=0?Mathf.Lerp(mb.stars,p.stars,C):mb.stars);
    float aurora=p.aurora>=0?Mathf.Lerp(mb.aurora,p.aurora,C):mb.aurora;if(moodRelease>=moodReleaseDelay&&moodReleaseFull&&mb.aurora>0)aurora=Mathf.Max(aurora,mb.aurora*(1+.3f*Bump(moodRelease-moodReleaseDelay,4)));skyMaterial.SetFloat("_Aurora",aurora);
   }
  }
  static Color Desat(Color c,float k){if(k<=0)return c;float l=Luma(c);return Color.Lerp(c,new Color(l,l,l,c.a),Mathf.Clamp01(k));}
  static float Luma(Color c){return .2126f*c.r+.7152f*c.g+.0722f*c.b;}
  /// <summary>c with the luminance of `like` (hue and chroma of c).</summary>
  static Color SameLuma(Color c,Color like){float l=Luma(c);return l>1e-4f?c*(Luma(like)/l):like;}
  /// <summary>c, lifted (hue kept) so its luminance is at least `floor` x that of `like`.</summary>
  static Color FloorLuma(Color c,Color like,float floor){float l=Luma(c),want=Luma(like)*floor;return l>1e-4f&&l<want?c*(want/l):c;}
  static Color Mix(Color a,Color b,float t){return b.a>0?Color.Lerp(a,new Color(b.r,b.g,b.b,a.a),t):a;}
  static float Smooth01(float t){t=Mathf.Clamp01(t);return t*t*(3-2*t);}
  /// <summary>0 -> 1 over the first second, held, back to 0 by `length` seconds (smooth).</summary>
  static float Bump(float t,float length){return t<0?0:t<1?Smooth01(t):t<length?1-Smooth01((t-1)/Mathf.Max(.01f,length-1)):0;}
  readonly List<Vector3> moodDepthSamples=new List<Vector3>();
  /// <summary>Deepest eye depth among the level's route and pad samples under the play camera (fog must not rise there).</summary>
  float BossMoodDmax(){
   var cam=GameCamera;if(cam==null)return 0;Vector3 c,f;
   if(vcamPlay!=null){var st=vcamPlay.State;c=st.FinalPosition;f=st.FinalOrientation*Vector3.forward;}else{c=cam.transform.position;f=cam.transform.forward;}
   float max=0;foreach(var p in moodDepthSamples){float d=Vector3.Dot(p-c,f);if(d>max)max=d;}return max;
  }

  // ---------------------------------------------------------------- screen grade (nearly neutral; the world carries the drain)
  void BossMoodGrade(){
   if(moodVolume==null)return;var p=mood;float C=moodDe;
   moodVolume.enabled=true;moodVolume.weight=1;
   float over=0,overEv=0;
   if(moodReleaseFull&&p.overshoot&&moodRelease>=moodReleaseDelay){float o=Bump(moodRelease-moodReleaseDelay,9);over=(p.dawn?8:6)*o;overEv=(p.dawn?.12f:.10f)*o;}
   moodCA.postExposure.value=mb.exposure+Mathf.Max(-.04f,p.exposure)*C*moodLow+overEv;
   moodCA.contrast.value=mb.contrast+Mathf.Min(4,p.contrast)*C;
   moodCA.saturation.value=mb.saturation+Mathf.Max(-4,p.saturation)*C+over;
   moodWB.temperature.value=Mathf.Clamp(p.temperature,-6,6)*C;moodWB.tint.value=Mathf.Clamp(p.tint,-6,6)*C;
   float vig=p.vignette>=0?Mathf.Lerp(mb.vignette,Mathf.Min(p.vignette,mb.vignette+.03f),C):mb.vignette;
   if(p.vignetteBreath>0&&!reducedMotion)vig+=p.vignetteBreath*C*Mathf.Sin(moodClock*Mathf.PI*2*.1f);
   moodVig.intensity.value=vig;if(p.vignetteColor.a>0)moodVig.color.value=Color.Lerp(mb.vignetteColor,new Color(p.vignetteColor.r,p.vignetteColor.g,p.vignetteColor.b,1),C);
   if(moodSMH.active){if(p.smhShadows!=Vector4.zero)moodSMH.shadows.value=Vector4.Lerp(mb.smhShadows,p.smhShadows,C);if(p.smhHighlights!=Vector4.zero)moodSMH.highlights.value=Vector4.Lerp(mb.smhHighlights,p.smhHighlights,C);}
   if(moodDoF.active){float s=Mathf.Lerp(mb.dofStart,Mathf.Max(24,moodDmax+1),C);moodDoF.gaussianStart.value=s;moodDoF.gaussianEnd.value=Mathf.Max(s+10,Mathf.Lerp(mb.dofEnd,s+10,C));}
  }

  // ---------------------------------------------------------------- the boss: drawn scale, head click volume, long shadow
  void BossMoodArrival(){
   CarrotQa.Count("mood.arrival",1);
  }
  void BossMoodBoss(CarrotMoodInput input,float dt){
   float target=mood.bossScale;if(moodArrival<0&&input.boss!=1&&input.boss!=2)target=1;
   if(moodArrival>=0){float t=reducedMotion?1:Mathf.Clamp01(moodArrival/2.2f);moodBossK=Mathf.Lerp(1,target,1-Mathf.Pow(1-t,3));}else moodBossK=1;
   if(moodForce>=0&&(input.boss==1||input.boss==2))moodBossK=mood.bossScale;
   string boss=game.level.boss;
   foreach(var e in game.enemies){if(e.boss!=boss)continue;if(!enemies.TryGetValue(e.id,out var a)||a.model==null)continue;
    BossMoodHeight(a,e);a.model.localScale*=moodBossK;BossMoodHead(a,e);}
   #if UNITY_EDITOR||DEVELOPMENT_BUILD||CARROT_QA
   if(moodArrival>=0&&moodArrival-dt<2.4f&&moodArrival>=2.4f)BossMoodLogBoss();
   #endif
  }
  #if UNITY_EDITOR||DEVELOPMENT_BUILD||CARROT_QA
  void BossMoodLogBoss(){
   var inv=CultureInfo.InvariantCulture;var sb=new System.Text.StringBuilder("CARROT_MOOD_BOSS level=");sb.Append(game.level.id).Append(" profile=").Append(mood.id);
   foreach(var e in game.enemies){if(e.boss!=game.level.boss||!enemies.TryGetValue(e.id,out var a))continue;var box=a.root.GetComponent<BoxCollider>();
    Vector3 expect=e.position+a.jolt+a.lane;Vector3 root=a.root.transform.position;
    sb.Append(" id=").Append(e.id).Append(e.clone?"(clone)":"").Append(" collider=").Append(box!=null?box.size.x.ToString("F3",inv)+"x"+box.size.y.ToString("F3",inv)+"x"+box.size.z.ToString("F3",inv):"none")
     .Append(" modelScaleK=").Append(moodBossK.ToString("F3",inv)).Append(" rootVsSim=").Append(new Vector2(root.x-expect.x,root.z-expect.z).magnitude.ToString("F4",inv))
     .Append(" head=").Append(a.root.transform.Find("Mood head click")!=null?1:0).Append(" drawnTop=").Append((BossMoodHeight(a,e)*moodBossK).ToString("F2",inv));}
   Debug.Log(sb.ToString());
  }
  #endif

  // ---------------------------------------------------------------- the carrot's fear
  float moodBreath,moodGaze,moodLookUp=-1;
  void BossMoodCarrot(CarrotMoodInput input,float viewDt){
   if(carrot==null)return;var parts=Parts();
   bool lost=game.phase=="lost",won=game.phase=="won",weak=game.health<=3&&!lost&&!won,hurt=carrotHit>0;
   if(moodLookUp>=0){moodLookUp+=viewDt;if(moodLookUp>.8f)moodLookUp=-1;}
   if(weak||hurt||lost||won)return;
   float F=Mathf.Clamp01((moodDe-.25f)/.75f)*mood.fear;float fearH=CarrotBossMoodCurve.Fear(game.health)/.08f; // 0..1 as hearts fall to 0
   F=Mathf.Clamp01(F+.25f*fearH*mood.fear);
   // Breath: 4.0 s down to 2.6 s as hearts fall from 10 to 4 (health-tied fear lives on the carrot), amplitude 1.5% -> 1.2%.
   float period=Mathf.Lerp(4f,2.6f,Mathf.Clamp01((10-game.health)/6f))*Mathf.Lerp(1,.9f,F);moodBreath+=viewDt*Mathf.PI*2/period;
   float amp=Mathf.Lerp(.015f,.012f,F);float b=Mathf.Sin(moodBreath)*amp;float tremble=0;
   bool bossNear=false;foreach(var e in game.enemies)if(e.id==moodTracker.BossId&&e.alive&&!e.hidden&&Vector3.Distance(e.position,carrotPosition)<6){bossNear=true;break;}
   if(!reducedMotion&&moodDe>mood.trembleAt&&bossNear)tremble=.005f*Mathf.Sin(clock*44);
   carrot.model.localScale=Vector3.Scale(carrot.modelScale,new Vector3(1+tremble-b*.35f,1+b-tremble,1+tremble-b*.35f));
   // Gaze: the carrot turns toward the real guardian (a reflexive attention cue that points at the threat).
   float want=0;foreach(var e in game.enemies)if(e.id==moodTracker.BossId&&e.alive&&!e.hidden){Vector3 toBoss=e.position-carrotPosition;toBoss.y=0;Vector3 toCam=(vcamPlay!=null?vcamPlay.State.FinalPosition:GameCamera.transform.position)-carrotPosition;toCam.y=0;if(toBoss.sqrMagnitude>.01f&&toCam.sqrMagnitude>.01f)want=Mathf.Clamp(Vector3.SignedAngle(toCam,toBoss,Vector3.up),-20,20)*F;break;}
   if(reducedMotion){if(Mathf.Abs(want-moodGaze)>4&&Mathf.Repeat(moodClock,2)<viewDt+.0001f)moodGaze=want;}else moodGaze=Mathf.Lerp(moodGaze,want,1-Mathf.Exp(-viewDt/.5f));
   float up=moodLookUp>=0?-10*Mathf.Sin(Mathf.Clamp01(moodLookUp/.8f)*Mathf.PI):0;
   carrot.model.localRotation=Quaternion.Euler(0,moodGaze,0)*carrot.model.localRotation*Quaternion.Euler(up,0,0);
   if(parts.eyeL!=null){var s=parts.eyeL.localScale;s.y*=1+.10f*F;parts.eyeL.localScale=s;}if(parts.eyeR!=null){var s=parts.eyeR.localScale;s.y*=1+.10f*F;parts.eyeR.localScale=s;}
   float droop=mood.leafDroop<-5&&moodDe>.85f?mood.leafDroop:-5;if(parts.leaves!=null)parts.leaves.localRotation*=Quaternion.Euler(droop*F,0,0);
   if(parts.armL!=null)parts.armL.localRotation*=Quaternion.Euler(0,0,6*F);if(parts.armR!=null)parts.armR.localRotation*=Quaternion.Euler(0,0,-6*F);
  }

  // ---------------------------------------------------------------- release of hope
  void BossMoodReleaseStart(bool victory){
   bool challenge=CarrotBossMoodCurve.Challenge(game.level.id);bool last=true;foreach(var e in game.enemies)if(e.alive&&e.id!=moodTracker.BossId&&!e.clone){last=false;break;}
   moodReleaseFull=victory||!challenge||game.wave>=game.level.waves&&last;if(victory)last=true;
   // Front-loaded when the guardian was the last enemy alive on a campaign win: the board is restored before the results card lands.
   bool front=(!challenge||victory)&&last;moodReleaseDelay=front?.15f:.6f;moodReleaseSpeed=front?Mathf.Max(15,mood.releaseSpeed):Mathf.Min(6,mood.releaseSpeed)*(mood.id=="asuna"?1.67f:1);moodReleaseTau=front?.4f:.8f;
   moodRelease=0;moodReleaseHold=moodDe;moodLookUp=0;
   Vector3 far=carrotPosition;foreach(var r in game.level.routes)foreach(var q in r)if((q-carrotPosition).sqrMagnitude>(far-carrotPosition).sqrMagnitude)far=q;moodReleaseMax=Vector3.Distance(far,carrotPosition)+6;
   effects.MoodRelease(carrotPosition,mood,moodReleaseDelay,reducedMotion);
   CarrotQa.Count("mood.release",1);
  }

  // ---------------------------------------------------------------- hook 5: Quality('mood:<0..1>' | 'mood:auto' | 'mood:off')
  bool BossMoodQuality(string tier){
   if(tier==null||!tier.StartsWith("mood:"))return false;string v=tier.Substring(5);
   if(v.StartsWith("debug:")){float d;float.TryParse(v.Substring(6),NumberStyles.Float,CultureInfo.InvariantCulture,out d);Shader.SetGlobalFloat("_CarrotMoodDebug",d);BossMoodProbe();Debug.Log("CarrotQuality debug "+tier);return true;}
   if(v=="off"){moodDisabled=true;BossMoodRestoreBase();BossMoodNeutral(true);foreach(var o in moodObjects)if(o!=null)o.SetActive(false);}
   else if(v=="auto"){moodForce=-1;BossMoodResume();}
   else if(float.TryParse(v,NumberStyles.Float,CultureInfo.InvariantCulture,out float f)){moodForce=Mathf.Clamp01(f);BossMoodResume();}
   Debug.Log("CarrotQuality debug "+tier);return true;
  }
  void BossMoodResume(){
   if(!moodDisabled)return;moodDisabled=false;ApplyBiomeLighting();
   if(moodWorld==world&&moodField!=null&&mb.valid&&BossMoodEligible()){moodActive=true;foreach(var o in moodObjects)if(o!=null)o.SetActive(true);effects.MoodFxSetup(mood,game.level.biome,game.level.id,carrotPosition,routeMin,routeMax);BossMoodTickCore(0,0);}
   else moodWorld=null;
  }
  /// <summary>'mood:off': every light, fog and sky value back to the captured baseline (as the biome rig set it).</summary>
  void BossMoodRestoreBase(){
   if(!mb.valid)return;sun.transform.rotation=mb.sunRot;sun.color=mb.sunColor;sun.shadowStrength=mb.sunShadow;sunBase=mb.sunRaw;if(dipClock<0&&lastDim<=0&&orbitClock<0&&defeatClock<0)sun.intensity=sunBase;
   if(fill!=null){fill.transform.rotation=mb.fillRot;fill.color=mb.fillColor;fill.intensity=mb.fillIntensity;}
   RenderSettings.ambientSkyColor=mb.ambSky;RenderSettings.ambientEquatorColor=mb.ambEq;RenderSettings.ambientGroundColor=mb.ambGround;RenderSettings.fogColor=mb.fog;fogEndBase=mb.fogEnd;RenderSettings.fogEndDistance=mb.fogEnd;
   if(skyMaterial!=null){skyMaterial.SetVector("_CarrotSunDir",-sun.transform.forward);skyMaterial.SetColor("_Zenith",mb.zenith);skyMaterial.SetColor("_Horizon",mb.horizon);skyMaterial.SetColor("_Ground",mb.ground);skyMaterial.SetColor("_SunColor",mb.skySun);skyMaterial.SetColor("_CloudColor",mb.cloudColor);
    skyMaterial.SetFloat("_SunSize",mb.sunSize);skyMaterial.SetFloat("_SunGlow",mb.sunGlow);skyMaterial.SetFloat("_CloudAmount",mb.clouds);skyMaterial.SetFloat("_Stars",mb.stars);skyMaterial.SetFloat("_Aurora",mb.aurora);}
   effects.Through=moodThroughBase;
   foreach(var a in enemies.Values){var head=a.root!=null?a.root.transform.Find("Mood head click"):null;if(head!=null)Destroy(head.gameObject);}
  }
 }
}
