using System;

// Owner: room-light-post. Pure C# (System only). The band-limited fire flicker and its tests
// (Tests/ForgeFlickerTests.cs) go here; ForgeAtmosphere.cs uses them.

/// Room, light and post numbers (ForgeTuning.room). Defaults are the plan's values with the critique's
/// amendments (no film grain, grade or shaft; tier hysteresis; MSAA pixel budget).
[Serializable] public class ForgeRoomTuning {
 // Fire flicker on _ForgeFireColor: band-limited noise around flickerHz plus a faster component.
 public float flickerAmp=.18f, flickerHz=3, flicker2Amp=.03f, flicker2Hz=8, reducedFlickerAmp=.04f, reducedFlickerHz=1;
 public float fireScale=1.25f, ambientScale=.8f, bellowsBoost=.25f, bellowsDelayS=.3f, coalPulseC=950;
 public string lampColor="ffd29a"; public float lampIntensity=3.0f;
 // Embers at the firebed.
 public float embersPerS=6, embersPerSTier2=3, embersMax=30;
 // Bloom and haze (exposure 1.13 and the ACES fit are invariant and not tunable).
 public float bloomThreshold=1.1f, bloomKnee=.6f, bloomIntensity=.18f, bloomLevels=5, hazeHearth=.0015f;
 // Fog.
 public float fogDensity=.07f; public string fogColor="15110e";
 // Quality tiers: ignore the first seconds, drop above budget, recover rarely (hysteresis).
 public float tierIgnoreS=3, tierDropRatio=1.25f, tierRecoverRatio=.8f, tierRecoverS=30, tierMaxRecoveries=1, msaaMaxMpx=2.5f;

 public void Clamp(){
  flickerAmp=ForgeTuning.Fit(flickerAmp,0,.5f,.18f);
  // Reduced motion: flicker at most 4% (WCAG / invariant), at 1 Hz or slower.
  reducedFlickerAmp=ForgeTuning.Fit(reducedFlickerAmp,0,.04f,.04f);reducedFlickerHz=ForgeTuning.Fit(reducedFlickerHz,0,1,1);
  embersMax=ForgeTuning.Fit(embersMax,0,30,30);bloomLevels=ForgeTuning.Fit(bloomLevels,1,5,5);fogDensity=ForgeTuning.Fit(fogDensity,0,.2f,.07f);
  tierRecoverS=ForgeTuning.Fit(tierRecoverS,10,600,30);tierMaxRecoveries=ForgeTuning.Fit(tierMaxRecoveries,0,3,1);
 }
}
