using System;

// Owner: strike-feel. Pure C# (System only). The swing timeline model and its property tests
// (Tests/ForgeFeelTests.cs) go here; ForgeStrike.cs samples it.

/// Strike feel numbers (ForgeTuning.strike). Defaults are the plan's values with the critique's
/// amendments. cycleMs, flowCycleMs and minImpactGapMs are also clamped by ForgeTuning's balance floors.
[Serializable] public class ForgeStrikeTuning {
 // Swing timeline (ms). Contact = windup + apex hold + downstroke.
 public float windupMs=105, firstWindupMs=130, apexHoldMs=10, downstrokeMs=75, reboundMs=90, settleAfterContactMs=260, firstContactBudgetMs=225;
 public float flowWindupMs=65, flowDownstrokeMs=60, flowSettleAfterContactMs=180;
 // Contact spacing: normal and Flow cycles, and the hard realtime floor between impacts.
 public float cycleMs=640, flowCycleMs=595, minImpactGapMs=400;
 public float scheduleAfterContactMs=150;     // a Strike after contact + this is scheduled, not refused
 // Hit-stop (wall-clock ms) by outcome; Flow multiplies by flowHitStopScale. Shatter slow-mo afterwards.
 public float hitStopDull=16, hitStopGood=45, hitStopChip=65, hitStopPerfect=85, hitStopEvolution=110, hitStopShatter=130, flowHitStopScale=.5f;
 public float shatterSlowScale=.35f, shatterSlowMs=250, shatterRampMs=120;
 // Directional camera kick on the contact frame (pitch deg / drop mm), spring omega.
 public float kickDull=.25f, kickGood=.6f, kickChip=.8f, kickPerfect=1.0f, kickEvolution=1.1f, kickShatter=1.6f;
 public float dropDull=1.5f, dropGood=3, dropChip=3.5f, dropPerfect=4, dropEvolution=4.5f, dropShatter=6, chipRollDeg=.4f, kickOmega=30, reducedKickScale=.25f;
 // FOV punch (deg) and spring omega.
 public float fovPunchPerfect=-1.2f, fovPunchEvolution=-1.5f, fovPunchShatter=1.5f, fovOmega=20;
 // Trauma shake only for evolution and Shatter; the kick carries the other outcomes.
 public float traumaEvolution=.6f, traumaShatter=.75f, shakeMaxDeg=1.0f, shakeRollDeg=.6f, shakeMm=5, shakeHz=22, traumaDecayPerS=2.5f;
 // Blade jitter during hit-stop and the tong tremor at risk (mm at the blade tip).
 public float hitStopJitterMm=3.5f, tongTremorMm=2.0f, tongTremorHz=9;
 // Rebound height (cm) by outcome.
 public float reboundDull=3, reboundGood=5, reboundChip=4, reboundPerfect=7, reboundEvolution=7, reboundShatter=9;
 // Swing arc about the elbow and the wrist snap in the last 30% of the downstroke.
 public float elbowArcM=.58f, wristSnapDeg=30;
 // Work framing: FOV fallbacks by view, frame-to-fit band fill and clamps, eases.
 public float fovDesktop=42, fovDesktopWalk=62, fovPortrait=62, fovPortraitWalk=74, fovLandscape=46, fovLandscapeWalk=60;
 public float frameFillMin=.55f, frameFillMax=.65f, fovMin=34, fovMax=70, fovEaseS=.3f, lookEase=28;
 // Walk bob locked to steps.
 public float strideM=.72f, bobMm=7, bobLateralMm=4, bobRollDeg=.25f;
 // Hearth reach: step duration each way (or a short step), bellows pull times. Gated by the Motion setting.
 public float hearthStepS=.5f, bellowsPull1S=.60f, bellowsPull2S=1.15f, seatWaitMs=400;
 // Risk cues from snapshot.risk p (tau = smoothstep(riskLow, riskHigh, p)).
 public float riskLow=.15f, riskHigh=.6f, riskPushInDeg=3, riskApexHoldFrom=.3f, riskApexHoldMs=40, riskApexHoldPerRisk=100, riskApexHoldMaxMs=80;
 // Rest: after this idle time the head is laid on the anvil face.
 public float restIdleS=1.2f;

 public void Clamp(){
  windupMs=Pos(windupMs,105);firstWindupMs=Pos(firstWindupMs,130);apexHoldMs=Pos(apexHoldMs,10);downstrokeMs=Pos(downstrokeMs,75);reboundMs=Pos(reboundMs,90);settleAfterContactMs=Pos(settleAfterContactMs,260);firstContactBudgetMs=Pos(firstContactBudgetMs,225);
  flowWindupMs=Pos(flowWindupMs,65);flowDownstrokeMs=Pos(flowDownstrokeMs,60);flowSettleAfterContactMs=Pos(flowSettleAfterContactMs,180);
  hitStopDull=Pos(hitStopDull,16);hitStopGood=Pos(hitStopGood,45);hitStopChip=Pos(hitStopChip,65);hitStopPerfect=Pos(hitStopPerfect,85);hitStopEvolution=Pos(hitStopEvolution,110);hitStopShatter=Pos(hitStopShatter,130);
  flowHitStopScale=ForgeTuning.Fit(flowHitStopScale,0,1,.5f);shatterSlowScale=ForgeTuning.Fit(shatterSlowScale,0,1,.35f);reducedKickScale=ForgeTuning.Fit(reducedKickScale,0,1,.25f);
  // No single hit-stop may exceed 250 ms or swallow a Flow cycle.
  hitStopShatter=Math.Min(hitStopShatter,250);hitStopEvolution=Math.Min(hitStopEvolution,250);hitStopPerfect=Math.Min(hitStopPerfect,250);hitStopChip=Math.Min(hitStopChip,250);hitStopGood=Math.Min(hitStopGood,250);hitStopDull=Math.Min(hitStopDull,250);
  fovMin=ForgeTuning.Fit(fovMin,20,90,34);fovMax=ForgeTuning.Fit(fovMax,fovMin,100,70);
 }
 static float Pos(float v,float fallback)=>float.IsNaN(v)||float.IsInfinity(v)||v<0?fallback:v;
}
