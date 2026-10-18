using UnityEngine;
using UnityEngine.Rendering;

namespace CarrotTD {
 /// <summary>
 /// BOSS MOOD atmosphere (presentation only; driven by CarrotView.BossMoodTick, simulated manually with the view clock so pause and
 /// speed stay exact). Mood motes (seed fluff, ash, embers) are 0.02-0.08 u, alpha .30 or less (never brighter than creatures), fall or
 /// rise mostly vertically (never along a lane), follow CarrotQuality counts and are off under reduced motion. The existing ambient
 /// particles are only modulated (emission, firefly count, the orchard leaf tint) from values captured right after Ambient(), and are
 /// restored exactly by MoodFxOff. Schedules use System.Random(9307 + level*31 + salt).
 /// </summary>
 public sealed partial class CarrotEffects {
  FxSystem moodMotes,moodEmbers;ParticleSystem moodDebris;Material moodDebrisMaterial;
  CarrotMoodProfile moodFx;bool moodFxOn,moodAmbientCaptured;int moodAmbientMax;float moodAmbientRate;Gradient moodAmbientGradient;string moodBiome="";
  Vector3 moodMin,moodMax,moodCarrot;float moodMoteBudget,moodEmberBudget,moodSwellAt,moodSwellClock=-1,moodLeafDe=-1;System.Random moodRng;
  float moodReleaseAt=-1;int moodReleaseLeft;bool moodReleaseReduced;
  float MR(float a,float b){return a+(float)moodRng.NextDouble()*(b-a);}

  public void MoodFxSetup(CarrotMoodProfile p,string biome,int level,Vector3 carrot,Vector3 min,Vector3 max){
   MoodFxOff(false);if(p==null||Spectator)return;
   moodFx=p;moodFxOn=true;moodBiome=biome;moodCarrot=carrot;moodMin=min;moodMax=max;moodRng=new System.Random(9307+level*31+3);moodSwellAt=18+(float)moodRng.NextDouble()*8;moodSwellClock=-1;moodLeafDe=-1;moodReleaseAt=-1;
   if(ambient!=null){var main=ambient.main;moodAmbientMax=main.maxParticles;moodAmbientRate=ambient.emission.rateOverTime.constant;moodAmbientGradient=ambient.colorOverLifetime.color.gradient;moodAmbientCaptured=true;}
   if(moodMotes==null){moodMotes=new FxSystem(transform,"Boss mood motes",pool.alphaSheet,96,noise:true,noiseStrength:.12f,firstFrame:FxSheet.GlowSoft);moodEmbers=new FxSystem(transform,"Boss mood embers",pool.additiveSheet,48,noise:true,noiseStrength:.2f,firstFrame:FxSheet.GlowSoft);}
   if(p.motes==3)MoodDebrisSetup();
  }
  /// <summary>restore: put the captured ambient values back (mood:off on the same build). A new build reconfigures the ambient itself
  /// (Ambient() rewrites every value the mood touches), so a level change only drops the capture.</summary>
  public void MoodFxOff(bool restore){
   if(restore&&moodAmbientCaptured&&ambient!=null){var main=ambient.main;main.maxParticles=moodAmbientMax;var em=ambient.emission;em.rateOverTime=moodAmbientRate;if(moodAmbientGradient!=null){var col=ambient.colorOverLifetime;col.color=moodAmbientGradient;}}
   moodAmbientCaptured=false;moodFxOn=false;moodFx=null;
   if(moodMotes!=null){moodMotes.Clear();moodEmbers.Clear();}
   if(moodDebris!=null){moodDebris.Clear(true);moodDebris.gameObject.SetActive(false);}
  }
  void MoodDebrisSetup(){
   if(moodDebris==null){var go=new GameObject("Boss mood debris orbit");go.transform.SetParent(transform,false);moodDebris=go.AddComponent<ParticleSystem>();moodDebris.Stop(true,ParticleSystemStopBehavior.StopEmittingAndClear);
    var main=moodDebris.main;main.playOnAwake=false;main.loop=true;main.simulationSpace=ParticleSystemSimulationSpace.Local;main.startLifetime=new ParticleSystem.MinMaxCurve(4,7);main.startSpeed=0;main.startSize=new ParticleSystem.MinMaxCurve(.04f,.08f);main.startRotation=new ParticleSystem.MinMaxCurve(0,6.28f);main.gravityModifier=0;
    var shape=moodDebris.shape;shape.enabled=true;shape.shapeType=ParticleSystemShapeType.Circle;shape.radius=6;shape.radiusThickness=.67f;shape.rotation=new Vector3(90,0,0);
    var vel=moodDebris.velocityOverLifetime;vel.enabled=true;vel.space=ParticleSystemSimulationSpace.Local;vel.orbitalY=new ParticleSystem.MinMaxCurve(.25f,.45f);vel.radial=0;vel.y=new ParticleSystem.MinMaxCurve(-.08f,.12f);vel.x=0;vel.z=0;
    var rot=moodDebris.rotationOverLifetime;rot.enabled=true;rot.z=new ParticleSystem.MinMaxCurve(-3,3);
    var sheet=moodDebris.textureSheetAnimation;sheet.enabled=true;sheet.mode=ParticleSystemAnimationMode.Grid;sheet.numTilesX=FxSheet.Tiles;sheet.numTilesY=FxSheet.Tiles;sheet.animation=ParticleSystemAnimationType.WholeSheet;sheet.frameOverTime=new ParticleSystem.MinMaxCurve(0);
    sheet.startFrame=new ParticleSystem.MinMaxCurve(FxSheet.Bark/64f,FxSheet.Shard/64f);
    var col=moodDebris.colorOverLifetime;col.enabled=true;var g=new Gradient();g.SetKeys(new[]{new GradientColorKey(Color.white,0),new GradientColorKey(Color.white,1)},new[]{new GradientAlphaKey(0,0),new GradientAlphaKey(1,.15f),new GradientAlphaKey(1,.8f),new GradientAlphaKey(0,1)});col.color=g;
    var r=go.GetComponent<ParticleSystemRenderer>();r.sharedMaterial=pool.alphaSheet;r.shadowCastingMode=ShadowCastingMode.Off;r.receiveShadows=false;r.sortMode=ParticleSystemSortMode.None;}
   moodDebris.gameObject.SetActive(true);var m=moodDebris.main;var c=moodFx.moteColor;m.startColor=new Color(c.r,c.g,c.b,Mathf.Min(.30f,c.a));m.maxParticles=CarrotQuality.High?moodFx.moteHigh:CarrotQuality.Rich?moodFx.moteMed:moodFx.moteLow;
   var em=moodDebris.emission;em.enabled=true;em.rateOverTime=m.maxParticles/5.5f;moodDebris.Clear(true);
  }
  int MoodCount(int high,int med,int low){return CarrotQuality.High?high:CarrotQuality.Rich?med:low;}

  /// <summary>Per frame. viewDt: the presentation clock (0 while paused); dt: real seconds (0 while paused).</summary>
  public void MoodFxTick(float viewDt,float dt,float de,Vector3 boss,bool bossOn,bool reduced,int wavesLeft,int waves,int stage){
   if(!moodFxOn||moodFx==null)return;var p=moodFx;
   // ---- existing ambient particles: emission scale, fireflies as waves left (the lights go out one by one), blizzard swells, leaf tint
   if(moodAmbientCaptured&&ambient!=null){
    float rate=Mathf.Lerp(1,p.ambientRate,de);
    if(p.blizzard&&!reduced){if(moodSwellClock<0){moodSwellAt-=dt;if(moodSwellAt<=0){moodSwellClock=0;moodSwellAt=18+(float)moodRng.NextDouble()*8;}}else{moodSwellClock+=dt;float s=moodSwellClock<1.5f?moodSwellClock/1.5f:moodSwellClock<5.5f?1:moodSwellClock<7f?(7-moodSwellClock)/1.5f:0;rate*=1+.5f*s*de;if(moodSwellClock>=7)moodSwellClock=-1;}}
    if(stage==4&&p.blizzard)rate=Mathf.Min(rate,.3f+.7f*Mathf.Clamp01(1-de));
    var em=ambient.emission;em.rateOverTime=moodAmbientRate*rate;var main=ambient.main;
    if(p.firefliesAsWavesLeft){int n=Mathf.Max(1,Mathf.CeilToInt(moodAmbientMax*Mathf.Clamp01(wavesLeft/(float)Mathf.Max(1,waves))*Mathf.Lerp(1,.6f,de)));if(stage>=4)n=moodAmbientMax;if(main.maxParticles!=n)main.maxParticles=n;}
    else if(p.ambientRate<=0&&de>.5f){if(main.maxParticles!=Mathf.Max(1,Mathf.RoundToInt(moodAmbientMax*(1-de))))main.maxParticles=Mathf.Max(1,Mathf.RoundToInt(moodAmbientMax*(1-de)));}
    if(p.leafA.a>0&&moodAmbientGradient!=null&&Mathf.Abs(de-moodLeafDe)>.03f){moodLeafDe=de;var g=new Gradient();var a=moodAmbientGradient.colorKeys;var keys=new GradientColorKey[a.Length];for(int i=0;i<a.Length;i++)keys[i]=new GradientColorKey(Color.Lerp(a[i].color,i==0?p.leafA:p.leafB,de),a[i].time);g.SetKeys(keys,moodAmbientGradient.alphaKeys);var col=ambient.colorOverLifetime;col.color=g;}
   }
   // ---- mood motes: seed fluff or ash falling, a few embers rising (Medium/High); off under reduced motion
   if(reduced||viewDt<=0){if(reduced){moodMotes.Clear();moodEmbers.Clear();if(moodDebris!=null&&moodDebris.gameObject.activeSelf)moodDebris.Clear(true);}}
   else{
    Vector3 lo=moodMin-new Vector3(2.5f,0,2.5f),hi=moodMax+new Vector3(2.5f,0,2.5f);
    if(p.motes==1||p.motes==2){int count=MoodCount(p.moteHigh,p.moteMed,p.moteLow);float life=14;moodMoteBudget+=viewDt*count/life*Mathf.Clamp01(de*1.5f);
     moodMotes.Frame(FxSheet.GlowSoft);
     while(moodMoteBudget>=1){moodMoteBudget-=1;Vector3 at=new Vector3(MR(lo.x,hi.x),MR(2.6f,4.4f),MR(lo.z,hi.z));Color c=p.moteColor;c.a=Mathf.Min(.30f,c.a);float fall=p.motes==2?MR(.18f,.24f):MR(.15f,.30f);moodMotes.Emit(at,new Vector3(p.motes==1?MR(.12f,.24f):MR(-.03f,.05f),-fall,MR(-.03f,.03f)),p.motes==2?MR(.025f,.04f):MR(.03f,.05f),life,c,MR(0,360),MR(-40,40));}
     if(p.embers>0&&CarrotQuality.Rich){int ne=CarrotQuality.High?p.embers:Mathf.RoundToInt(p.embers*.67f);moodEmberBudget+=viewDt*ne/9f*Mathf.Clamp01(de*1.5f);
      while(moodEmberBudget>=1){moodEmberBudget-=1;Vector3 at=new Vector3(MR(lo.x,hi.x),MR(.1f,.5f),MR(lo.z,hi.z));moodEmbers.Emit(at,new Vector3(MR(-.02f,.02f),MR(.08f,.12f),MR(-.02f,.02f)),MR(.02f,.035f),9,new Color(.78f,.44f,.23f,.25f));}}}
    moodMotes.Simulate(viewDt);moodEmbers.Simulate(viewDt);
    if(moodDebris!=null&&moodDebris.gameObject.activeSelf){moodDebris.transform.position=new Vector3(boss.x,.3f,boss.z);var em=moodDebris.emission;em.enabled=bossOn&&de>.3f;moodDebris.Simulate(viewDt,true,false,false);}
   }
   // ---- the release: motes carried out from the carrot (fireflies, pollen, embers of gold), a few per frame after the delay
   if(moodReleaseAt>=0){moodReleaseAt-=dt;if(moodReleaseAt<0&&moodReleaseLeft>0&&!moodReleaseReduced){var c=p.releaseColor;motes.Frame(FxSheet.GlowSoft);
     for(int i=0;i<moodReleaseLeft;i++){float a=MR(0,Mathf.PI*2),r=MR(.3f,2.2f);Vector3 at=moodCarrot+new Vector3(Mathf.Cos(a)*r,MR(.2f,.8f),Mathf.Sin(a)*r);motes.Emit(at,new Vector3(Mathf.Cos(a)*MR(.2f,.6f),MR(.25f,.45f),Mathf.Sin(a)*MR(.2f,.6f)),MR(.06f,.11f),MR(2.5f,4.5f),new Color(c.r,c.g,c.b,c.a*.8f));}
     moodReleaseLeft=0;}}
  }
  /// <summary>The guardian fell: the motes leave the carrot when the restoration front starts.</summary>
  public void MoodRelease(Vector3 carrot,CarrotMoodProfile p,float delay,bool reduced){
   if(!moodFxOn||p==null)return;moodCarrot=carrot;moodReleaseAt=delay;moodReleaseLeft=MoodCount(p.releaseMotes,Mathf.RoundToInt(p.releaseMotes*.7f),Mathf.RoundToInt(p.releaseMotes*.35f));moodReleaseReduced=reduced;
   if(moodDebris!=null&&moodDebris.gameObject.activeSelf){var em=moodDebris.emission;em.enabled=false;}
  }
  /// <summary>Wave start (Brambleback): 8/6/4 leaves drift in from beyond the board and fall (the garden gives up a little more).</summary>
  public void MoodLeafBurst(CarrotMoodProfile p,Vector3 min,Vector3 max){
   if(!moodFxOn||p==null||p.leafBurst<=0)return;int n=MoodCount(p.leafBurst,Mathf.RoundToInt(p.leafBurst*.75f),p.leafBurst/2);moodMotes.Frame(FxSheet.Leaf);
   for(int i=0;i<n;i++){bool left=MR(0,1)<.5f;Vector3 at=new Vector3(left?min.x-MR(1.5f,3f):max.x+MR(1.5f,3f),MR(2.5f,3.6f),MR(min.z,max.z));Vector3 v=new Vector3(left?MR(.25f,.45f):-MR(.25f,.45f),-MR(.35f,.5f),MR(-.05f,.05f));
    moodMotes.Emit(at,v,MR(.07f,.1f),7,p.leafBurstColor,MR(0,360),MR(-120,120));}
   moodMotes.Frame(FxSheet.GlowSoft);
  }
 }
}
