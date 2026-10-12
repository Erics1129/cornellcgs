using System;

// Owner: hot-metal-vfx. Pure C# (System only). Blackbody emission, the temperature model and their
// tests (Tests/ForgeHeatTests.cs) go here; ForgeHeat.cs and Blade.shader use them.

/// Hot-metal and particle numbers (ForgeTuning.metal). Defaults are the plan's values with the
/// critique's amendments (Perfect scale-sheet pop, few sparks, coin curve, continuous rack cooling).
[Serializable] public class ForgeMetalTuning {
 // Emission E(T) = emissionScale * exp(emissionK * (1/1373.15 - 1/T_K)), capped; chroma from chromaStart.
 // Calibrate emissionScale through the real pipeline with Qa('swatch').
 public float emissionScale=3, emissionK=9592, emissionCap=6, chromaStart=580, chromaSlope=.000227f;
 // Pull temperatures (C) by metal.
 public float pullIron=1180, pullBronze=820, pullSteel=1150, pullSilver=720, pullDamascus=1150, pullObsidian=950, pullMeteor=1200, pullAuricite=1250;
 // Heating and cooling (presentation only; no reheat dip).
 public float heatFirstS=1.0f, heatReheatS=.6f, coolK=1.67e-14f, anvilTauScale=2, floorBodyC=650, floorEdgeC=600, restoredC=950;
 public float quenchToC=60, quenchS=.8f, rackCoolS=1.0f;
 // Flakes, sparks and chips per outcome (desktop counts; phone and tier 2+ multiply by phoneScale).
 public float flakesGood=14, flakesChip=10, flakesPerfect=35, flakesEvolution=36, flakesShatter=20, flakesReduced=5;
 public float sparksGood=0, sparksPerfect=3, sparksEvolution=12, sparksShatter=15, chipsChip=4;
 public float phoneScale=.6f, capDesktop=220, capTier2=120, flakeMinPx=2.5f, flakeStretchMs=80;
 // Contact footprint: scale cleared locally plus a short flash; Perfect clears the whole mask.
 public float footprintRadiusCm=1.8f, footprintFlashMs=120, perfectFlashMs=320;
 // Chip notch, shatter pieces, risk cracks.
 public float notchDepthMm=4, notchWidthCm=1, shardsMin=10, shardsMax=16, shardDarkS=2, shardGoneS=4, crackLow=.15f, crackHigh=.6f;
 // Sale coins: clamp(round(coinsBase + coinsLog * log10(amount)), coinsMin, coinsMax).
 public float coinsBase=2, coinsLog=2.2f, coinsMin=4, coinsMax=14;
 // Blade glow lamp and heat haze.
 public float glowScale=.5f, glowCap=2.5f, glowRangeM=.8f, glowMinC=600, hazeStrength=.0025f;

 public void Clamp(){
  emissionScale=ForgeTuning.Fit(emissionScale,0,20,3);emissionCap=ForgeTuning.Fit(emissionCap,0,20,6);
  phoneScale=ForgeTuning.Fit(phoneScale,0,1,.6f);capDesktop=ForgeTuning.Fit(capDesktop,0,220,220);capTier2=ForgeTuning.Fit(capTier2,0,capDesktop,120);
  shardsMin=ForgeTuning.Fit(shardsMin,0,16,10);shardsMax=ForgeTuning.Fit(shardsMax,shardsMin,16,16);
  coinsMin=ForgeTuning.Fit(coinsMin,0,14,4);coinsMax=ForgeTuning.Fit(coinsMax,coinsMin,14,14);
 }
}
