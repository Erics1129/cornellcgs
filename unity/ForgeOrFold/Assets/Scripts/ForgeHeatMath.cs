using System;

// Owner: hot-metal-vfx. Pure C# (System only): blackbody emission, the presentation-only knife
// temperature model and the flake cooling ODE. Tests/ForgeHeatTests.cs checks them; ForgeHeat.cs and
// Blade.shader mirror ForgeHeatModel.TemperatureK exactly (same uniforms, same formula).
// Temperature is presentation only: nothing here sends engine actions.

/// Hot-metal and particle numbers (ForgeTuning.metal). Defaults are the plan's values with the
/// critique's amendments (Perfect scale-sheet pop with few sparks, chips at blade temperature, local
/// footprint by clearing scale, no global per-level lengthening, coin curve, continuous rack cooling).
[Serializable] public class ForgeMetalTuning {
 // Emission E(T) = emissionScale * exp(emissionK * (1/1373.15 - 1/T_K)), capped; chroma (1, (T-chromaStart)*chromaSlope, 0),
 // mixed toward (1,.72,.42) by whiteMix * smoothstep(1200,1450,T). emissionScale is calibrated through the real
 // pipeline (lit hot surface, bloom, vignette, exposure 1.13 + ACES) with Qa('swatch') (scripts/forge-qa/metal.mjs):
 // the plan's offline scale 3 reads about 1.36x too bright in engine, so 2.2 puts 700-1200 C within dE2000 1.0-3.1 of the
 // targets and 600 C within 4.3 (with hotReflect below). Tests/ForgeHeatTests.cs checks the formula at the reference 3.
 public const float ReferenceEmissionScale=3;
 public float emissionScale=2.2f, emissionK=9592, emissionCap=6, chromaStart=580, chromaSlope=.000227f, whiteMix=.6f;
 // Pull temperatures (C) by metal.
 public float pullIron=1180, pullBronze=820, pullSteel=1150, pullSilver=720, pullDamascus=1150, pullObsidian=950, pullMeteor=1200, pullAuricite=1250;
 // Heating in the coals (smoothstep ease): the body reaches the pull temperature heatFirstS (first heat) or heatReheatS
 // after it is physically in the coals; thin parts lead the spine by heatLeadS. The coals test is a box around the
 // furnace target (half sizes, metres); after coalsFallbackS logically in the furnace the knife heats regardless (.9 s:
 // the hearth choreography has about 2 s in the furnace before the engine's heat event, and a 1.0 s heat still finishes).
 public float heatFirstS=1.0f, heatReheatS=.6f, heatLeadS=.25f, coalsHalfX=.30f, coalsHalfZ=.26f, coalsAbove=.14f, coalsFallbackS=.9f, heatedCatchUpS=.15f;
 // Cooling: T = (T0^-3 + 3 k tau / L)^(-1/3) (kelvin, L = local thickness). coolK is the radiative k (eps .75) raised
 // 12% for still-air convection, so a 3 mm body takes 23 s of tau from 1150 to 815 C (11.5 s on the anvil at 2x).
 public float coolK=1.87e-14f, anvilTauScale=2, floorBodyC=650, floorEdgeC=600, floorEaseS=1, restoredC=950;
 // Quench, rack/crate/sale cooling (fast but continuous, thin parts first) and shatter pieces (tau runs shardTauScale x).
 public float quenchToC=60, quenchS=.8f, quenchLeadS=.15f, rackToC=20, rackCoolS=1.0f, rackLeadS=.2f, shardTauScale=95;
 // Hot-steel surface: metallic and smoothness fall over surfaceFromC..surfaceToC; oxide scale grows as 1-exp(-t/oxideGrowS)
 // while the body is above oxideAboveC and dims emission by up to oxideDim in noise patches.
 public float surfaceFromC=450, surfaceToC=900, hotMetallic=.35f, hotSmoothness=.25f, oxideAboveC=900, oxideGrowS=6, oxideDim=.4f;
 // Kirchhoff: hot oxidised steel emits well and so reflects little; the lit (reflected) part falls to hotReflect over
 // hotReflectFromC..hotReflectToC, which keeps dull red pure instead of mixed with lamp sheen.
 public float hotReflectFromC=300, hotReflectToC=700, hotReflect=.45f;
 // Scale islands: the oxide skin breaks into plates about oxideCellCm across; the gaps between them glow brighter
 // (oxideGapGlow of the dimming removed in the gaps), so mature scale reads as dark plates on bright metal.
 public float oxideCellCm=1.4f, oxideGapGlow=.85f;
 // Contact footprint: scale cleared locally (regrows with oxideGrowS) plus a short flash; Perfect clears it all and
 // flashes the whole blade.
 public float footprintRadiusCm=1.8f, footprintFlashMs=120, footprintFlashGain=1.2f, perfectFlashMs=320, perfectFlashGain=.9f;
 // Per-strike plastic change at the contact: local edge spread (mm) and a permanent dimple (radius cm, depth mm), by outcome.
 public float spreadGoodMm=1.4f, spreadPerfectMm=2.0f, spreadDullMm=.4f, spreadMaxMm=3.0f, spreadSigmaCm=1.4f;
 public float dimpleRadiusCm=1.1f, dimpleGoodMm=.5f, dimplePerfectMm=.7f, dimpleDullMm=.25f, dimpleChipMm=.4f;
 // Draw-out from a rough bar to the stage profile: m = smoothstep(0,1,(level+.5)/drawLevels). drawLevels 5.5 (plan 4.5)
 // keeps a visible length change at every level 0-6 now that the global 1%-per-level morph is gone. The bar is
 // barLength x the profile length, max(barWidth x profile width, barAspect x bar length) wide and barThickMm thick.
 public float drawLevels=5.5f, barLength=.68f, barWidth=.55f, barAspect=.27f, barThickMm=8, spineMm=5, edgeMm=.8f, tipMm=1, tangMm=6, tangLengthCm=6.6f, bevelV=.5f;
 // Flakes, sparks and chips per outcome (desktop counts; phone and tier 2+ multiply by phoneScale).
 public float flakesGood=14, flakesGoodJitter=3, flakesChip=10, flakesPerfect=32, sheetsPerfect=6, flakesEvolution=36, flakesShatter=20, flakesReduced=5;
 public float sparksGood=0, sparksPerfect=3, sparksEvolution=12, sparksShatter=15, chipsChip=4;
 // flakeMinPx / sparkMinPx are CSS pixels (scaled by the canvas's device pixels per CSS pixel, at most 2.5).
 public float phoneScale=.6f, capDesktop=220, capTier2=120, flakeMinPx=2.5f, sparkMinPx=1.6f, flakeStretchMs=80, flakeLandSfxPerS=10;
 // Flake launch: speed (m/s) skewed toward minSpeed (u^speedSkew), elevation (deg), drag (1/s), bounce, friction;
 // drag 2.2/s: a 2 mm x .1 mm wustite flake falls face-on at about 2.8 m/s (g / v_t = 3.5/s) and tumbles, so it slows fast;
 // the drag grows with speed (x (1 + |v| / flakeVt), quadratic air drag), so fast flakes pop out and then stop near the anvil.
 // acrossViewBias of them leave within +/-35 deg of the camera's right axis (across the view, not along it).
 public float flakeMinSpeed=1, flakeMaxSpeed=4, perfectMaxSpeed=5, speedSkew=2.2f, elevMinDeg=8, elevMaxDeg=35, flakeDrag=2.2f, flakeVt=3, flakeBounce=.25f, flakeFriction=.55f, acrossViewBias=.7f;
 public float flakeMinMm=1, flakeMaxMm=4, sheetMinMm=5, sheetMaxMm=10, sheetDrag=5;
 // Flake life: thickness classes (mm) with weights; rest after going dark, fade; dark below flakeDarkC.
 public float flakeThinMm=.05f, flakeMidMm=.10f, flakeThickMm=.30f, flakeThinShare=.30f, flakeMidShare=.50f, flakeRestS=1.5f, flakeFadeS=.3f, flakeDarkC=525;
 // Burning sparks (evolution, shatter, a few on Perfect): HDR (1,.3,.03) x sparkIntensity, life, forks.
 public float sparkIntensity=18, sparkIntensityJitter=6, sparkLifeMin=.25f, sparkLifeMax=.45f, sparkSpeedMin=2.5f, sparkSpeedMax=6, sparkStretchS=.012f, sparkMaxStreakCm=3, sparkForkMin=2, sparkForkMax=3, sparkForkLifeMin=.15f, sparkForkLifeMax=.3f, sparkDrag=2.5f;
 // Chips (Chip outcome): 4-8 mm, leave at the blade temperature, cool like thick scale, grey below 500 C.
 public float chipMinMm=4, chipMaxMm=8, chipThickMm=.35f, chipBounce=.3f;
 // Chip notch (7 mm x 1.8 cm: the plan's 4 mm x 1 cm shows as a 1-2 px dent at the work framing, under a phone's pixel), shatter
 // pieces, risk cracks.
 public float notchDepthMm=7, notchWidthCm=1.8f, shardsMin=10, shardsMax=16, shardDarkS=2, shardRestS=3.4f, shardGoneS=4, shardBounce=.25f, shardFriction=.6f, shardCrackFlashS=.18f, shardSpeed=1.2f;
 // Cracks are drawn dark on bright steel (the cooler lips against a yellow-orange glow: much higher contrast than a
 // light line) and as glowing veins on dull red steel (the crack mouth radiates hotter than the skin, crackGlow brighter),
 // handing over around crackDarkAboveC. Cold, they are dark hairlines with a faint lighter lip.
 public float crackLow=.15f, crackHigh=.6f, crackPerM=40, crackGlow=.6f, crackEaseS=.6f, crackDarkAboveC=900;
 // Evolution: blade lift (cm), emission lift cap, glint sweep (s).
 public float evolutionLiftCm=2, evolutionEmissionCap=.6f, glintS=.5f;
 // Sale coins: clamp(round(coinsBase + coinsLog * log10(amount)), coinsMin, coinsMax); gold dust above coinsDustAt.
 public float coinsBase=2, coinsLog=2.2f, coinsMin=4, coinsMax=14, coinsDustAt=10000, coinBounce=.3f, coinSpinDamp=.3f, coinStaggerS=.07f, coinArcM=.22f, coinRestS=2.5f;
 // Blade glow lamp and heat haze.
 public float glowScale=.5f, glowCap=2.5f, glowRangeM=.8f, glowMinC=600, glowLiftCm=3, hazeStrength=.0025f, hazeFromC=700, hazeToC=1150, hazeRadius=.6f;
 // Quench steam plume and tub disturbance.
 public float steamPuffs=16, steamS=1.2f, quenchRings=3, quenchBubbles=14;

 public void Clamp(){
  emissionScale=ForgeTuning.Fit(emissionScale,0,20,2.2f);emissionK=ForgeTuning.Fit(emissionK,1000,30000,9592);emissionCap=ForgeTuning.Fit(emissionCap,0,20,6);
  chromaSlope=ForgeTuning.Fit(chromaSlope,0,.01f,.000227f);whiteMix=ForgeTuning.Fit(whiteMix,0,1,.6f);
  heatFirstS=ForgeTuning.Fit(heatFirstS,.05f,1.9f,1);heatReheatS=ForgeTuning.Fit(heatReheatS,.05f,1.9f,.6f);heatLeadS=ForgeTuning.Fit(heatLeadS,0,.6f,.25f);coalsFallbackS=ForgeTuning.Fit(coalsFallbackS,0,1.9f,.9f);
  coolK=ForgeTuning.Fit(coolK,1e-16f,1e-12f,1.87e-14f);anvilTauScale=ForgeTuning.Fit(anvilTauScale,0,20,2);floorEaseS=ForgeTuning.Fit(floorEaseS,.05f,10,1);
  floorBodyC=ForgeTuning.Fit(floorBodyC,20,1100,650);floorEdgeC=ForgeTuning.Fit(floorEdgeC,20,floorBodyC,600);
  quenchS=ForgeTuning.Fit(quenchS,.05f,5,.8f);rackCoolS=ForgeTuning.Fit(rackCoolS,.05f,5,1);shardTauScale=ForgeTuning.Fit(shardTauScale,1,1000,95);
  oxideGrowS=ForgeTuning.Fit(oxideGrowS,.1f,120,6);oxideDim=ForgeTuning.Fit(oxideDim,0,1,.4f);oxideCellCm=ForgeTuning.Fit(oxideCellCm,.1f,10,1.4f);oxideGapGlow=ForgeTuning.Fit(oxideGapGlow,0,1,.85f);hotReflect=ForgeTuning.Fit(hotReflect,0,1,.45f);hotReflectFromC=ForgeTuning.Fit(hotReflectFromC,0,1400,300);hotReflectToC=ForgeTuning.Fit(hotReflectToC,hotReflectFromC+1,1500,700);
  drawLevels=ForgeTuning.Fit(drawLevels,.5f,20,5.5f);barLength=ForgeTuning.Fit(barLength,.2f,1,.68f);barWidth=ForgeTuning.Fit(barWidth,.1f,2,.55f);barAspect=ForgeTuning.Fit(barAspect,0,1,.27f);
  barThickMm=ForgeTuning.Fit(barThickMm,1,20,8);spineMm=ForgeTuning.Fit(spineMm,.5f,12,5);edgeMm=ForgeTuning.Fit(edgeMm,.1f,spineMm,.8f);tipMm=ForgeTuning.Fit(tipMm,.1f,spineMm,1);tangMm=ForgeTuning.Fit(tangMm,.5f,12,6);bevelV=ForgeTuning.Fit(bevelV,.1f,1,.5f);
  phoneScale=ForgeTuning.Fit(phoneScale,0,1,.6f);capDesktop=ForgeTuning.Fit(capDesktop,0,220,220);capTier2=ForgeTuning.Fit(capTier2,0,capDesktop,120);
  flakeMinPx=ForgeTuning.Fit(flakeMinPx,0,8,2.5f);sparkMinPx=ForgeTuning.Fit(sparkMinPx,0,8,1.6f);sparkMaxStreakCm=ForgeTuning.Fit(sparkMaxStreakCm,0,8,3);
  flakeMaxSpeed=ForgeTuning.Fit(flakeMaxSpeed,flakeMinSpeed,12,4);perfectMaxSpeed=ForgeTuning.Fit(perfectMaxSpeed,flakeMinSpeed,12,5);elevMaxDeg=ForgeTuning.Fit(elevMaxDeg,0,80,35);
  flakesGood=ForgeTuning.Fit(flakesGood,0,60,14);flakesPerfect=ForgeTuning.Fit(flakesPerfect,0,80,32);flakesEvolution=ForgeTuning.Fit(flakesEvolution,0,80,36);flakesShatter=ForgeTuning.Fit(flakesShatter,0,80,20);
  sparksPerfect=ForgeTuning.Fit(sparksPerfect,0,4,3);sparksGood=ForgeTuning.Fit(sparksGood,0,1,0);sparksEvolution=ForgeTuning.Fit(sparksEvolution,0,30,12);sparksShatter=ForgeTuning.Fit(sparksShatter,0,30,15);
  shardsMin=ForgeTuning.Fit(shardsMin,0,16,10);shardsMax=ForgeTuning.Fit(shardsMax,shardsMin,16,16);shardGoneS=ForgeTuning.Fit(shardGoneS,.5f,4,4);shardRestS=ForgeTuning.Fit(shardRestS,.1f,shardGoneS,3.4f);
  coinsMin=ForgeTuning.Fit(coinsMin,0,14,4);coinsMax=ForgeTuning.Fit(coinsMax,coinsMin,14,14);
  glowCap=ForgeTuning.Fit(glowCap,0,10,2.5f);glowLiftCm=ForgeTuning.Fit(glowLiftCm,0,30,3);glowRangeM=ForgeTuning.Fit(glowRangeM,0,4,.8f);hazeStrength=ForgeTuning.Fit(hazeStrength,0,.02f,.0025f);
  evolutionEmissionCap=ForgeTuning.Fit(evolutionEmissionCap,0,2,.6f);evolutionLiftCm=ForgeTuning.Fit(evolutionLiftCm,0,10,2);
  notchDepthMm=ForgeTuning.Fit(notchDepthMm,0,12,7);notchWidthCm=ForgeTuning.Fit(notchWidthCm,.2f,4,1.8f);spreadMaxMm=ForgeTuning.Fit(spreadMaxMm,0,8,3);
  crackDarkAboveC=ForgeTuning.Fit(crackDarkAboveC,300,1400,900);crackPerM=ForgeTuning.Fit(crackPerM,4,200,40);crackGlow=ForgeTuning.Fit(crackGlow,0,4,.6f);
  steamPuffs=ForgeTuning.Fit(steamPuffs,0,32,16);quenchBubbles=ForgeTuning.Fit(quenchBubbles,0,40,14);quenchRings=ForgeTuning.Fit(quenchRings,0,6,3);
 }
 /// Pull temperature (C) of a metal key from the engine (config.ts METALS).
 public float Pull(string metal){switch(metal){case "bronze":return pullBronze;case "steel":return pullSteel;case "silver":return pullSilver;case "damascus":return pullDamascus;case "obsidian":return pullObsidian;case "meteor":return pullMeteor;case "auricite":return pullAuricite;default:return pullIron;}}
}

/// Blackbody colour, tonemap mirror and small helpers.
public static class ForgeHeatMath {
 public const float ZeroK=273.15f, RefK=1373.15f;
 public static float Sat(float x)=>x<0?0:x>1?1:x;
 public static float Smooth(float a,float b,float x){float t=Sat((x-a)/(b-a));return t*t*(3-2*t);}
 public static float Lerp(float a,float b,float t)=>a+(b-a)*t;
 /// Emission brightness E(T) for a temperature in C (linear, before the white mix), capped.
 public static float Brightness(float c,ForgeMetalTuning t){float k=c+ZeroK;if(k<250)return 0;double e=t.emissionScale*Math.Exp(t.emissionK*(1/(double)RefK-1/(double)k));return (float)Math.Min(e,t.emissionCap);}
 /// Linear HDR emission of incandescent steel at c degrees C: chroma(T) x E(T), mixed toward warm white above 1200 C.
 public static void Emission(float c,ForgeMetalTuning t,out float r,out float g,out float b){
  float e=Brightness(c,t);Chroma(c,t,out r,out g,out b);r*=e;g*=e;b*=e;
 }
 /// Chroma only (max channel 1).
 public static void Chroma(float c,ForgeMetalTuning t,out float r,out float g,out float b){float green=Sat((c-t.chromaStart)*t.chromaSlope);float w=t.whiteMix*Smooth(1200,1450,c);r=1;g=(1-w)*green+w*.72f;b=w*.42f;}
 /// Forge/Finish: c *= 1.13, Narkowicz ACES per channel (the invariant tonemap).
 public static float Tonemap(float x){x*=1.13f;float y=(x*(2.51f*x+.03f))/(x*(2.43f*x+.59f)+.14f);return Sat(y);}
 /// Linear to sRGB-encoded 0..1.
 public static float Encode(float v){v=Sat(v);return v<=.0031308f?12.92f*v:1.055f*(float)Math.Pow(v,1/2.4)-.055f;}
 public static float Decode(float v){v=Sat(v);return v<=.04045f?v/12.92f:(float)Math.Pow((v+.055f)/1.055f,2.4);}
 /// Closed-form radiative cooling of a plate of thickness lMm (mm) from t0K after tau seconds: kelvin.
 /// Written in kilo-kelvin with k3 = 3 k 1e12 so the shader keeps the same numbers in fp32.
 public static float CoolK(float t0K,float tau,float lMm,float k3){double x=Math.Pow(t0K/1000.0,-3)+k3*Math.Max(0,tau)/Math.Max(.01f,lMm);return (float)(1000.0*Math.Pow(x,-1.0/3));}
 public static float K3(ForgeMetalTuning t)=>3*t.coolK*1e12f;
 /// Seconds of tau for a plate of lMm to cool from aC to bC with the closed form.
 public static float CoolSeconds(float aC,float bC,float lMm,ForgeMetalTuning t){double a=Math.Pow((aC+ZeroK)/1000.0,-3),b=Math.Pow((bC+ZeroK)/1000.0,-3);return (float)((b-a)*lMm/K3(t));}
 /// One step of hammer-scale flake cooling (research physics.py flake_glow: wustite rho 5700, cp 750, eps .9,
 /// moving air h 150, both faces). Sub-stepped so any frame dt is stable. Returns the new temperature in C.
 public static float FlakeStep(float c,float dt,float thickMm){
  const double sigma=5.670374e-8,eps=.9,h=150,rho=5700,cp=750,ta=25;double T=c,d=Math.Max(.005,thickMm)*.001;double left=dt;
  if(T<=ta+.5)return c;
  while(left>1e-6){double step=Math.Min(left,.004);double tk=T+273.15,tak=ta+273.15;double q=2*(eps*sigma*(tk*tk*tk*tk-tak*tak*tak*tak)+h*(T-ta));T-=q*step/(rho*cp*d);if(T<ta)T=ta;left-=step;}
  return (float)T;
 }
 /// Seconds for a flake of thickMm to cool from c0 to c1 (FlakeStep, 1 ms steps).
 public static float FlakeSeconds(float c0,float c1,float thickMm){float c=c0,s=0;while(c>c1&&s<60){c=FlakeStep(c,.001f,thickMm);s+=.001f;}return s;}
 /// Number of sale coins for a sale of `amount` gold.
 public static int Coins(float amount,ForgeMetalTuning t){double n=Math.Round(t.coinsBase+t.coinsLog*Math.Log10(Math.Max(1,amount)));return (int)Math.Max(t.coinsMin,Math.Min(t.coinsMax,n));}
 /// Glow lamp radiance for a blade at c degrees C (0 below glowMinC): chroma x min(E x glowScale, glowCap).
 public static void GlowLamp(float c,ForgeMetalTuning t,out float r,out float g,out float b){if(c<t.glowMinC){r=g=b=0;return;}Chroma(c,t,out r,out g,out b);float s=Math.Min(Brightness(c,t)*t.glowScale,t.glowCap);r*=s;g*=s;b*=s;}
 /// Heat-haze strength (UV units) for a blade at c degrees C.
 public static float Haze(float c,ForgeMetalTuning t)=>t.hazeStrength*Smooth(t.hazeFromC,t.hazeToC,c);
}

/// Presentation-only temperature of one knife. A cooling state (T0, tau, floor weight) plus an optional ease
/// toward a target (heating in the coals, quench, rack). Per-pixel temperature depends on the local thickness L:
///   cooling  Tc(L) = CoolK(T0, tau, L), floored: T = Tc + (max(Tc, floor(L)) - Tc) x floorW,
///            floor(L) = lerp(edge floor, body floor, saturate((L - .8) / 2.2))
///   easing   T(L)  = lerp(Tc_from(L), target, curve(saturate((t - lag(L)) / dur))), lag(L) = -lead (3 - clamp(L, .8, 3)) / 2.2
///            (the edge runs `lead` ahead, the body and thicker parts on time), curve = 1 - (1 - p)^3: heating approaches
///            the coal temperature fast then slowly (Newtonian), quench and rack cooling likewise; the uniforms keep a
///            smoothstep flag for compatibility.
/// Blade.shader evaluates exactly this from Uniforms(); ForgeHeatTests checks the numbers.
public sealed class ForgeHeatModel {
 public const float BodyMm=3, EdgeMm=.8f, SpineMm=5, TangMm=6;
 public float T0K=293.15f, Tau, FloorW;
 public bool Easing, EaseHeat, EaseForced, EaseOut; public float FromT0K=293.15f, FromTau, FromFloorW, TargetK=293.15f, EaseT, EaseDur=1, EaseLead;
 public float OxideAge, InCoalsFor;
 public bool HeldAtFloor;

 public ForgeHeatModel Clone()=>(ForgeHeatModel)MemberwiseClone();
 public void Reset(float c){T0K=c+ForgeHeatMath.ZeroK;Tau=0;FloorW=0;Easing=false;EaseHeat=false;EaseForced=false;HeldAtFloor=false;}
 public static float Curve(float p,bool easeOut){p=ForgeHeatMath.Sat(p);return easeOut?1-(1-p)*(1-p)*(1-p):p*p*(3-2*p);}
 /// Thin parts lead: the edge (.8 mm) runs `lead` seconds ahead, the 3 mm body and anything thicker on time.
 public float Lag(float lMm)=>LagFor(EaseLead,lMm);
 public static float LagFor(float lead,float lMm)=>-lead*(BodyMm-Math.Max(EdgeMm,Math.Min(BodyMm,lMm)))/(BodyMm-EdgeMm);
 public static float FloorK(float lMm,ForgeMetalTuning t)=>ForgeHeatMath.Lerp(t.floorEdgeC,t.floorBodyC,ForgeHeatMath.Sat((lMm-EdgeMm)/(BodyMm-EdgeMm)))+ForgeHeatMath.ZeroK;
 public static float Field(float t0K,float tau,float floorW,float lMm,ForgeMetalTuning t){float c=ForgeHeatMath.CoolK(t0K,tau,lMm,ForgeHeatMath.K3(t));float f=FloorK(lMm,t);return c+(Math.Max(c,f)-c)*floorW;}
 /// Temperature in kelvin at local thickness lMm.
 public float TemperatureK(float lMm,ForgeMetalTuning t){
  if(!Easing)return Field(T0K,Tau,FloorW,lMm,t);
  float from=Field(FromT0K,FromTau,FromFloorW,lMm,t);float p=Curve((EaseT-Lag(lMm))/EaseDur,EaseOut);return from+(TargetK-from)*p;
 }
 public float TemperatureC(float lMm,ForgeMetalTuning t)=>TemperatureK(lMm,t)-ForgeHeatMath.ZeroK;
 /// The 3 mm body value (KnifeTemperature).
 public float BodyC(ForgeMetalTuning t)=>TemperatureC(BodyMm,t);
 /// Hottest point (C) of the blade (edge, body, spine and tang sampled).
 public float MaxC(ForgeMetalTuning t)=>Math.Max(Math.Max(TemperatureC(EdgeMm,t),TemperatureC(BodyMm,t)),Math.Max(TemperatureC(SpineMm,t),TemperatureC(TangMm,t)));
 /// Start easing every pixel toward targetC over dur seconds (thin parts lead by `lead`).
 public void Ease(float targetC,float dur,float lead,bool heat,ForgeMetalTuning t,bool forced=false,bool easeOut=false){
  if(Easing)Rebase(t);
  FromT0K=T0K;FromTau=Tau;FromFloorW=FloorW;TargetK=targetC+ForgeHeatMath.ZeroK;EaseT=0;EaseDur=Math.Max(.01f,dur);EaseLead=lead;Easing=true;EaseHeat=heat;EaseForced=forced;EaseOut=easeOut;HeldAtFloor=false;
 }
 /// Collapse an interrupted ease into a uniform cooling state at the current body temperature.
 public void Rebase(ForgeMetalTuning t){float body=TemperatureK(BodyMm,t);float fw=Easing?0:FloorW;Easing=false;EaseHeat=false;EaseForced=false;T0K=body;Tau=0;FloorW=fw;HeldAtFloor=false;}
 float EaseEnd=>EaseDur+.001f;
 public bool EaseDone=>Easing&&EaseT>=EaseEnd;
 /// Ease toward a cold target (quench, rack) unless already there or already easing to it.
 public void CoolTo(float targetC,float dur,float lead,ForgeMetalTuning t){
  float k=targetC+ForgeHeatMath.ZeroK;if(Easing&&!EaseHeat&&Math.Abs(TargetK-k)<.5f)return;
  if(!Easing&&MaxC(t)<=targetC+.5f)return;
  Ease(targetC,dur,lead,false,t,true,true);
 }

 /// One world-time step. inCoals: logically in the furnace and physically in the coals (or long enough).
 public void Step(float dt,bool inCoals,bool onAnvil,float pullC,bool firstHeat,ForgeMetalTuning t){
  if(dt<0)dt=0;
  if(inCoals){
   float pullK=pullC+ForgeHeatMath.ZeroK;
   // The thin-part lead scales with the heat's length (a .6 s reheat leads by .15 s).
   float dur=firstHeat?t.heatFirstS:t.heatReheatS,lead=t.heatLeadS*dur/Math.Max(.01f,t.heatFirstS);
   if(Easing){if(!EaseHeat||Math.Abs(TargetK-pullK)>.5f)Ease(pullC,dur,lead,true,t,false,true);}
   else if(Math.Abs(T0K-pullK)>.5f||Tau>0)Ease(pullC,dur,lead,true,t,false,true);
  }else if(Easing&&EaseHeat&&!EaseForced)Rebase(t);   // pulled out of the coals before the heat finished
  if(Easing){EaseT+=dt;if(EaseDone){T0K=TargetK;Tau=0;FloorW=0;Easing=false;EaseHeat=false;EaseForced=false;}}
  else if(!inCoals){
   // Floors: an anvil knife that arrived hot never drops below dull red while it is being worked.
   float bodyNow=ForgeHeatMath.CoolK(T0K,Tau,BodyMm,ForgeHeatMath.K3(t));float floorBodyK=t.floorBodyC+ForgeHeatMath.ZeroK;
   float wantFloor=onAnvil&&(FloorW>0||bodyNow>floorBodyK+1)?1:0;
   float rate=dt/Math.Max(.01f,t.floorEaseS);if(wantFloor>FloorW)FloorW=Math.Min(1,FloorW+rate);else if(wantFloor<FloorW)FloorW=Math.Max(0,FloorW-rate);
   HeldAtFloor=onAnvil&&FloorW>=1&&bodyNow<=floorBodyK;
   if(!HeldAtFloor)Tau+=dt*(onAnvil?t.anvilTauScale:1);
  }
  if(BodyC(t)>t.oxideAboveC)OxideAge+=dt;
  InCoalsFor=inCoals?InCoalsFor+dt:0;
 }
 /// The engine heat event: make sure the knife reaches the pull temperature very soon, even if it leaves the furnace now.
 public void Heated(float pullC,ForgeMetalTuning t){
  if(BodyC(t)>=pullC-30)return;
  if(Easing&&EaseHeat&&Math.Abs(TargetK-(pullC+ForgeHeatMath.ZeroK))<.5f){float left=EaseEnd-EaseT;if(left<=t.heatedCatchUpS){EaseForced=true;return;}}
  Ease(pullC,t.heatedCatchUpS,.05f,true,t,true,true);
 }
 /// Scale mask amount (0..1) from the time spent above the oxide temperature.
 public float Oxide(ForgeMetalTuning t)=>1-(float)Math.Exp(-OxideAge/Math.Max(.1f,t.oxideGrowS));
 /// Shader uniforms: a = (T0 K, tau, k3, floorW) of the cooling (or ease-from) state, b = (target K, t, dur, lead)
 /// with t = -1000 when idle, c = (body floor K, edge floor K, curve: 0 smoothstep / 1 ease-out, 0).
 public void Uniforms(ForgeMetalTuning t,float[] a,float[] b,float[] c){
  a[2]=ForgeHeatMath.K3(t);
  if(Easing){a[0]=FromT0K;a[1]=FromTau;a[3]=FromFloorW;b[0]=TargetK;b[1]=EaseT;b[2]=EaseDur;b[3]=EaseLead;}
  else{a[0]=T0K;a[1]=Tau;a[3]=FloorW;b[0]=T0K;b[1]=-1000;b[2]=1;b[3]=0;}
  c[0]=t.floorBodyC+ForgeHeatMath.ZeroK;c[1]=t.floorEdgeC+ForgeHeatMath.ZeroK;c[2]=EaseOut?1:0;c[3]=0;
 }
 /// The shader's formula evaluated from the uniform arrays (tests compare it with TemperatureK).
 public static float ShaderK(float[] a,float[] b,float[] c,float lMm){
  float L=Math.Max(.01f,lMm);
  float tc=ForgeHeatMath.CoolK(a[0],a[1],L,a[2]);float f=ForgeHeatMath.Lerp(c[1],c[0],ForgeHeatMath.Sat((L-EdgeMm)/(BodyMm-EdgeMm)));float field=tc+(Math.Max(tc,f)-tc)*a[3];
  if(b[1]<=-999)return field;
  float lag=LagFor(b[3],L);float p=Curve((b[1]-lag)/Math.Max(.01f,b[2]),c[2]>.5f);return field+(b[0]-field)*p;
 }
}
