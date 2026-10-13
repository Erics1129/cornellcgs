using System;

// Owner: room-light-post. Pure C# (System only): the band-limited fire flicker, the bellows swell and
// the quality-tier governor, with their tests (Tests/ForgeFlickerTests.cs). ForgeAtmosphere.cs uses them.

/// Room, light and post numbers (ForgeTuning.room). Defaults are the plan's values with the critique's
/// amendments (no film grain, grade or shaft; tier hysteresis; MSAA pixel budget). Colours are hex.
[Serializable] public class ForgeRoomTuning {
 // Fire flicker on _ForgeFireColor: band-limited noise around flickerHz plus a faster component.
 public float flickerAmp=.18f, flickerHz=3, flicker2Amp=.03f, flicker2Hz=8, reducedFlickerAmp=.04f, reducedFlickerHz=1;
 public float fireScale=1.25f, ambientScale=.6f, bellowsBoost=.25f, bellowsDelayS=.3f, coalPulseC=950;
 // Bellows handle stroke from a Bellows() call: down and back up as sin(pi t / bellowsStrokeS), bellowsPullCm deep.
 // Keep equal to strike.bellowsStrokeS / strike.bellowsPullCm (strike-feel's right hand follows the same curve).
 public float bellowsStrokeS=.42f, bellowsPullCm=9;
 // All intensities are final linear radiance in the shared ForgeLighting.cginc lamp model (falloff 1 / (1 + .4 d^2)).
 // Hearth light (the dominant warm source): colour, radiance before fireScale, and where it sits above the firebed.
 // The light's centre sits .32 m over the coals (the bed plus its flames). Lamp 3.2 / fire 4.6 put about half of the
 // light on the work on the fire, so the work breathes with it (room.mjs 'flicker': face 8.9%, bench 18%, floor 26%
 // peak to peak, linear luminance) while the total stays within +/- 15% of the pre-upgrade rig (room.mjs 'lamp': x1.06).
 public string fireColor="ff8a3a"; public float fireIntensity=4.6f, fireLift=.32f;
 // Hearth bounce: the fire's light thrown back by the hearth front and floor, as a warm wrapped fill in the ambient
 // term (a fraction of the fire radiance; it flickers with the fire, so the whole room breathes).
 public float fireBounce=.32f; public string bounceColor="ffc093";
 // Hanging oil lamp (the key): colour, radiance, shade cone (inner and outer half-angles, degrees).
 public string lampColor="ffd29a"; public float lampIntensity=3.2f, lampConeInner=38, lampConeOuter=72, lampUpSpill=.12f;
 // The reflection capture is static, but most of what it shows is lit by the hearth: this share of it breathes
 // with the fire's flicker (so polished steel flickers with the room instead of holding still).
 public float envFireShare=.45f;
 // Cool window spill (rim) and the dim door sconce.
 public string rimColor="a4b8d2"; public float rimIntensity=3.2f;
 public string sconceColor="ffb45e"; public float sconceIntensity=.9f;
 // Contact flash at the real contact point (strike-feel passes it; AtmosImpact is the only writer).
 public float flashGood=3.8f, flashPerfect=7, flashChip=3.0f, flashShatter=6, flashEvolution=7.5f, flashDecay=12;
 // Static contact shading baked per vertex at startup (0 = off, 1 = full).
 public float aoStrength=.85f, aoDirect=.55f;
 // Embers at the firebed (CPU batch, one draw call).
 public float embersPerS=6, embersPerSTier2=3, embersMax=30;
 // Hearth smoke wisps rising into the hood (seconds between puffs).
 public float smokeEveryS=.55f;
 // Bloom and haze (exposure 1.13 and the ACES fit are invariant and not tunable).
 public float bloomThreshold=1.1f, bloomKnee=.6f, bloomIntensity=.18f, bloomLevels=5, hazeHearth=.0015f;
 // Fog.
 public float fogDensity=.07f; public string fogColor="15110e";
 // Quality tiers: ignore the first seconds, drop above budget, recover rarely (hysteresis). A vsync-paced frame
 // never runs under its budget, so recovery means the p90 is back within tierRecoverRatio x budget.
 public float tierIgnoreS=3, tierDropRatio=1.25f, tierRecoverRatio=1.1f, tierRecoverS=30, tierMaxRecoveries=1, msaaMaxMpx=2.5f;
 // Start tiers (phones start at 2 until a real-device run passes: critique, integration-deploy #43), the
 // p90 window, and the frame that marks a hitch window as ignored.
 public float desktopStartTier=0, phoneStartTier=2, tierWindowS=3, hitchMs=250;

 public void Clamp(){
  flickerAmp=ForgeTuning.Fit(flickerAmp,0,.5f,.18f);flickerHz=ForgeTuning.Fit(flickerHz,.2f,12,3);flicker2Amp=ForgeTuning.Fit(flicker2Amp,0,.2f,.03f);flicker2Hz=ForgeTuning.Fit(flicker2Hz,.2f,20,8);
  // Reduced motion: flicker at most 4% (WCAG / invariant), at 1 Hz or slower.
  reducedFlickerAmp=ForgeTuning.Fit(reducedFlickerAmp,0,.04f,.04f);reducedFlickerHz=ForgeTuning.Fit(reducedFlickerHz,.05f,1,1);
  fireScale=ForgeTuning.Fit(fireScale,0,4,1.25f);ambientScale=ForgeTuning.Fit(ambientScale,0,3,.6f);bellowsBoost=ForgeTuning.Fit(bellowsBoost,0,1,.25f);bellowsDelayS=ForgeTuning.Fit(bellowsDelayS,0,2,.3f);bellowsStrokeS=ForgeTuning.Fit(bellowsStrokeS,.1f,1,.42f);bellowsPullCm=ForgeTuning.Fit(bellowsPullCm,0,30,9);
  fireIntensity=ForgeTuning.Fit(fireIntensity,0,40,4.6f);fireBounce=ForgeTuning.Fit(fireBounce,0,1,.32f);fireLift=ForgeTuning.Fit(fireLift,0,1,.32f);lampIntensity=ForgeTuning.Fit(lampIntensity,0,40,3.2f);envFireShare=ForgeTuning.Fit(envFireShare,0,1,.45f);rimIntensity=ForgeTuning.Fit(rimIntensity,0,40,3.2f);sconceIntensity=ForgeTuning.Fit(sconceIntensity,0,10,.9f);
  lampConeInner=ForgeTuning.Fit(lampConeInner,1,89,38);lampConeOuter=ForgeTuning.Fit(lampConeOuter,lampConeInner+1,90,72);lampUpSpill=ForgeTuning.Fit(lampUpSpill,0,1,.12f);
  flashDecay=ForgeTuning.Fit(flashDecay,1,60,12);aoStrength=ForgeTuning.Fit(aoStrength,0,1,.85f);aoDirect=ForgeTuning.Fit(aoDirect,0,1,.55f);
  embersMax=ForgeTuning.Fit(embersMax,0,30,30);embersPerS=ForgeTuning.Fit(embersPerS,0,30,6);embersPerSTier2=ForgeTuning.Fit(embersPerSTier2,0,embersPerS,3);smokeEveryS=ForgeTuning.Fit(smokeEveryS,.1f,10,.55f);
  bloomLevels=ForgeTuning.Fit(bloomLevels,1,5,5);fogDensity=ForgeTuning.Fit(fogDensity,0,.2f,.07f);
  tierIgnoreS=ForgeTuning.Fit(tierIgnoreS,0,30,3);tierDropRatio=ForgeTuning.Fit(tierDropRatio,1.05f,4,1.25f);tierRecoverRatio=ForgeTuning.Fit(tierRecoverRatio,.5f,1.2f,1.1f);
  tierRecoverS=ForgeTuning.Fit(tierRecoverS,10,600,30);tierMaxRecoveries=ForgeTuning.Fit(tierMaxRecoveries,0,3,1);msaaMaxMpx=ForgeTuning.Fit(msaaMaxMpx,0,40,2.5f);
  desktopStartTier=(float)Math.Round(ForgeTuning.Fit(desktopStartTier,0,3,0));phoneStartTier=(float)Math.Round(ForgeTuning.Fit(phoneStartTier,0,3,2));tierWindowS=ForgeTuning.Fit(tierWindowS,1,10,3);hitchMs=ForgeTuning.Fit(hitchMs,50,2000,250);
 }
}

/// The hearth's light level over time: 1 + band-limited noise (flickerAmp around flickerHz, plus
/// flicker2Amp around flicker2Hz) + the bellows swell. Deterministic in t, so QA can sample it.
public static class ForgeFlicker {
 // Frequency ratios (times flickerHz) of the main band: irregularly spaced over -17%..+24%, each with a slow
 // phase wobble, so the sum never settles into a repeating beat (autocorrelation < .3 for 1-10 s lags) and
 // the spectrum peaks inside the band. Phases are fixed: the signal is deterministic in t.
 static readonly double[] BandRatio={.832,.866,.904,.936,.987,1.039,1.079,1.145,1.240}, BandPhase={1.51,1.79,4.05,2.05,.64,.61,5.69,2.24,1.34}, BandGain={.68,.80,.90,.95,1,.98,.93,.77,.50};
 // Wobble rates relative to the band centre (about .05 Hz at a 3 Hz centre) and their phases.
 static readonly double[] WobbleRatio={.0143,.0203,.0123,.0237,.0177,.0097,.0223,.0157,.0197}, WobblePhase={.3,2.1,4.4,1.2,5.5,3.3,.9,2.7,4.9};
 const double WobbleDepth=1.5;
 static readonly double[] FastRatio={.87,.98,1.11,1.19}, FastPhase={1.7,4.6,.9,3.3};
 // Slow breathing of the band amplitude (the fire roars and settles), well below the band.
 static readonly double[] SlowHz={.071,.113,.187}, SlowPhase={.6,2.4,4.1};
 const double TwoPi=Math.PI*2;
 static double bandRms=-1,bandSum=-1;

 /// Raw band sum at unit time u = t x centre frequency.
 static double BandSum(double u){double v=0;for(int i=0;i<BandRatio.Length;i++)v+=BandGain[i]*Math.Sin(TwoPi*BandRatio[i]*u+BandPhase[i]+WobbleDepth*Math.Sin(TwoPi*WobbleRatio[i]*u+WobblePhase[i]));return v;}
 static void Norms(){if(bandRms>=0)return;double s=0,a=0;foreach(var g in BandGain){s+=g*g;a+=g;}bandRms=Math.Sqrt(s/2);bandSum=a;}
 /// Band noise in [-1, 1] centred on `hz`, with slow breathing, soft-clipped so its peaks use the full range.
 public static double Band(double t,double hz){
  Norms();double breath=0;for(int i=0;i<SlowHz.Length;i++)breath+=Math.Sin(TwoPi*SlowHz[i]*t+SlowPhase[i]);
  double env=.78+.22*(breath/SlowHz.Length);
  return Clamp1(Math.Tanh(1.25*env*BandSum(t*hz)/bandRms)/Math.Tanh(1.25*1.6));
 }
 /// The same band, linear (no soft clip, so no harmonics), with every component at or below `topHz`.
 public static double CalmBand(double t,double topHz){Norms();double top=0;for(int i=0;i<BandRatio.Length;i++)top=Math.Max(top,BandRatio[i]+WobbleDepth*WobbleRatio[i]);return BandSum(t*topHz/top)/bandSum;}
 static double Fast(double t,double hz){double v=0;for(int i=0;i<FastRatio.Length;i++)v+=Math.Sin(TwoPi*hz*FastRatio[i]*t+FastPhase[i]);return v/FastRatio.Length;}

 /// Fire level multiplier (about 1) at time t. Reduced motion: at most reducedFlickerAmp, at reducedFlickerHz or slower.
 public static float Fire(double t,ForgeRoomTuning r,bool reduced){
  double v=reduced?r.reducedFlickerAmp*CalmBand(t,r.reducedFlickerHz):r.flickerAmp*Band(t,r.flickerHz)+r.flicker2Amp*Fast(t,r.flicker2Hz);
  return (float)(1+v);
 }
 static double Clamp1(double v)=>v>1?1:v<-1?-1:v;

 /// Bellows handle pull (0..1) `since` seconds after a stroke began: one sin(pi t / bellowsStrokeS) arch.
 public static float HandlePull(double since,ForgeRoomTuning r){if(since<0||since>r.bellowsStrokeS)return 0;return (float)Math.Sin(since/r.bellowsStrokeS*Math.PI);}
 /// Bellows swell (0..bellowsBoost x strength) `since` seconds after a stroke: delayed bellowsDelayS,
 /// a .25 s rise, then a 1.1 s exponential settle. Zero before the delay.
 public static float Bellows(double since,float strength,ForgeRoomTuning r){
  double s=since-r.bellowsDelayS;if(s<=0||strength<=0)return 0;
  double rise=s<.25?Math.Sin(s/.25*Math.PI/2):1;double fall=s<.25?1:Math.Exp(-(s-.25)/1.1);
  return (float)(r.bellowsBoost*Math.Min(1,strength)*rise*fall);
 }
}

/// Quality tiers 0 (best) to 3 with hysteresis. Tier 0: MSAA 4x; 1: MSAA 2x; 2: FXAA, particles x.6;
/// 3: FXAA, particles x.4. Feed it unscaled frame times; it ignores the first tierIgnoreS seconds and any
/// 1-s window that contains a hitch (a frame over hitchMs), learns the frame budget (8.3 or 16.7 ms) from
/// the first 2 s, drops one tier when the tierWindowS p90 exceeds tierDropRatio x budget, and recovers at
/// most tierMaxRecoveries times, each after tierRecoverS (doubling every time) with the p90 within tierRecoverRatio x budget.
/// Resizing never changes the tier (the caller just keeps feeding frames).
public sealed class ForgeQualityGovernor {
 public int Tier{get;private set;}
 public int Drops{get;private set;}
 public int Recoveries{get;private set;}
 public float BudgetMs{get;private set;}
 /// QA: a pinned governor keeps measuring (P90Ms, MedianMs) but never changes the tier.
 public bool Pinned;
 /// The most recent p90 and median over the window (ms), for the 1 Hz perf message.
 public float P90Ms{get;private set;}
 public float MedianMs{get;private set;}
 readonly ForgeRoomTuning r;int startTier;
 double time,secondClock,recoverClock,lastChange;
 /// Seconds of frames fed so far, and the tier the governor started at (and never climbs above).
 public double Seconds=>time;
 public int StartTier=>startTier;
 readonly System.Collections.Generic.List<float> second=new System.Collections.Generic.List<float>();
 readonly System.Collections.Generic.List<float[]> windows=new System.Collections.Generic.List<float[]>();
 readonly System.Collections.Generic.List<float> learn=new System.Collections.Generic.List<float>();
 bool secondHitch;

 public ForgeQualityGovernor(ForgeRoomTuning tuning,int start){r=tuning;Restart(start);}
 /// Start over at `start` (the view class arrived during the warm-up): forgets the budget, windows and history.
 public void Restart(int start){startTier=Math.Max(0,Math.Min(3,start));Tier=startTier;BudgetMs=0;Drops=0;Recoveries=0;P90Ms=0;MedianMs=0;time=secondClock=recoverClock=lastChange=0;second.Clear();windows.Clear();learn.Clear();secondHitch=false;}

 /// Advance one frame of `dtMs` real milliseconds. Returns true when the tier changed this frame.
 public bool Frame(float dtMs){
  if(float.IsNaN(dtMs)||dtMs<=0)return false;
  time+=dtMs/1000;
  if(time<r.tierIgnoreS)return false;
  // Learn the display budget from the first 2 s after the ignore window: 120 Hz or 60 Hz pacing.
  if(BudgetMs<=0){if(dtMs<r.hitchMs)learn.Add(dtMs);if(time>=r.tierIgnoreS+2&&learn.Count>0){BudgetMs=Median(learn)<12?1000/120f:1000/60f;learn.Clear();}return false;}
  if(dtMs>r.hitchMs)secondHitch=true;
  second.Add(dtMs);secondClock+=dtMs/1000;
  bool changed=false;
  if(secondClock>=1){
   if(!secondHitch)windows.Add(second.ToArray());   // a hitch voids the whole second
   second.Clear();secondClock=0;secondHitch=false;
   int keep=(int)Math.Round(r.tierWindowS);while(windows.Count>keep)windows.RemoveAt(0);
   if(windows.Count>0){var all=new System.Collections.Generic.List<float>();foreach(var w in windows)all.AddRange(w);P90Ms=Percentile(all,.9f);MedianMs=Median(all);}
   if(windows.Count>=keep&&!Pinned){
    if(P90Ms>r.tierDropRatio*BudgetMs&&Tier<3){Tier++;Drops++;changed=true;windows.Clear();recoverClock=0;lastChange=time;}
    else if(P90Ms<r.tierRecoverRatio*BudgetMs&&Tier>startTier&&Recoveries<r.tierMaxRecoveries){
     recoverClock+=1;double need=r.tierRecoverS*Math.Pow(2,Recoveries);
     if(recoverClock>=need){Tier--;Recoveries++;changed=true;windows.Clear();recoverClock=0;lastChange=time;}
    }else recoverClock=0;
   }
  }
  return changed;
 }
 /// MSAA samples for a tier given runtime support (max samples for an HDR target) and the backing-store size.
 public static int MsaaFor(int tier,int supported,float megapixels,float maxMpx){
  int want=tier<=0?4:tier==1?2:1;if(want==4&&megapixels>maxMpx)want=2;
  while(want>1&&want>supported)want/=2;return want;
 }
 /// Particle multiplier for a tier (hot-metal-vfx and the embers read it).
 public static float ParticleScale(int tier)=>tier<=1?1:tier==2?.6f:.4f;
 static float Median(System.Collections.Generic.List<float> v)=>Percentile(v,.5f);
 static float Percentile(System.Collections.Generic.List<float> v,float p){var a=v.ToArray();Array.Sort(a);if(a.Length==0)return 0;int i=(int)Math.Min(a.Length-1,Math.Max(0,Math.Ceiling(p*a.Length)-1));return a[i];}
}
