using System;
using System.Collections.Generic;

// Owner: strike-feel. Pure C# (System only, System.MathF). The swing timeline, the strike state machine,
// the hammer arc kinematics, the impact tables, the camera springs, the hearth timeline, the tong reach
// and the framing maths live here so Tests/ForgeFeelTests.cs can check them outside Unity. ForgeStrike.cs,
// ForgeCamera.cs, ForgeTongs.cs and ForgeChoreo.cs sample them. All times are milliseconds of real
// (unscaled) time unless a name says otherwise; lengths are metres, angles degrees.

/// Strike feel numbers (ForgeTuning.strike, overridable from feel-tuning.json "strike"). Defaults are the
/// plan's values with the critique's amendments. cycleMs, flowCycleMs and minImpactGapMs are also clamped by
/// ForgeTuning's balance floors.
[Serializable] public class ForgeStrikeTuning {
 // Swing timeline (ms). Contact = windup + apex hold + downstroke: 105 + 10 + 75 = 190 (from rest 130: 215).
 public float windupMs=105, firstWindupMs=130, apexHoldMs=10, downstrokeMs=75, reboundMs=90, settleAfterContactMs=260, firstContactBudgetMs=225;
 public float flowWindupMs=65, flowDownstrokeMs=60, flowSettleAfterContactMs=180;
 public float windupMaxMs=250, flowWindupMaxMs=200;   // a scheduled windup stretches up to this; the rest is held at the apex
 // Contact spacing: normal and Flow cycles, and the hard realtime floor between impacts.
 public float cycleMs=640, flowCycleMs=595, minImpactGapMs=400;
 public float scheduleAfterContactMs=150;     // a Strike after contact + this is scheduled; earlier ones are refused
 // Hit-stop (wall-clock ms) by outcome; Flow multiplies by flowHitStopScale. Shatter slow-mo afterwards.
 public float hitStopDull=16, hitStopGood=45, hitStopChip=65, hitStopPerfect=85, hitStopEvolution=110, hitStopShatter=130, hitStopGuarded=100, flowHitStopScale=.5f;
 public float shatterSlowScale=.35f, shatterSlowMs=250, shatterRampMs=120;
 // Directional camera kick on the contact frame (pitch deg / drop mm), spring omega (rad/s).
 public float kickDull=.25f, kickGood=.6f, kickChip=.8f, kickPerfect=1.0f, kickEvolution=1.1f, kickShatter=1.6f, kickGuarded=1.3f;
 public float dropDull=1.5f, dropGood=3, dropChip=3.5f, dropPerfect=4, dropEvolution=4.5f, dropShatter=6, dropGuarded=5, chipRollDeg=.4f, kickOmega=30, reducedKickScale=.25f;
 // FOV punch (deg) and spring omega.
 public float fovPunchPerfect=-1.2f, fovPunchEvolution=-1.5f, fovPunchShatter=1.5f, fovOmega=20;
 // Trauma shake only for evolution and Shatter (critique: trauma^2 is invisible below .5); the kick carries the rest.
 public float traumaEvolution=.6f, traumaShatter=.75f, shakeMaxDeg=1.0f, shakeRollDeg=.6f, shakeMm=5, shakeHz=22, traumaDecayPerS=2.5f;
 // Blade jitter during hit-stop (mm, decaying linearly) and the tong tremor at risk (mm at the blade tip, Hz).
 public float hitStopJitterMm=3.5f, tongTremorMm=2.0f, tongTremorHz=9;
 // Rebound height (cm) by outcome, the chip's sideways skew (cm) and the shatter face tilt (deg).
 public float reboundDull=3, reboundGood=5, reboundChip=4, reboundPerfect=7, reboundEvolution=7, reboundShatter=9, chipSkewCm=2, shatterTiltDeg=10;
 // Swing arc: the elbow turns elbowSwingDeg (and the elbow rises elbowLiftCm and draws back elbowBackCm) contact to apex; the wrist cocks wristSnapDeg and
 // snaps back over the last (1 - wristSnapFrom) of the downstroke. The head swings on a ~.6 m radius about the elbow.
 public float wristSnapDeg=26, elbowSwingDeg=14, elbowLiftCm=4, elbowBackCm=9, wristSnapFrom=.68f, wristPower=1f, elbowPower=1.7f, contactHandleDeg=12, headHangDeg=12, headDipDeg=.6f;
 // Hammer poses relative to the contact point in the smith's yaw frame: ready (part way up the arc) between strikes,
 // parked on the anvil face after restIdleS of idle work, hung at the side while walking.
 public float readyElbow=.45f, readyWrist=.55f, readyRight=.06f, readyBack=.02f;
 public float restRight=.26f, restUp=-.10f, restBack=.30f, parkRight=.16f, parkBack=.125f, parkS=.45f, restIdleS=1.2f;
 // Work framing: FOV fallbacks by view, frame-to-fit band fill and clamps, eases.
 public float fovDesktop=42, fovDesktopWalk=62, fovPortrait=62, fovPortraitWalk=74, fovLandscape=46, fovLandscapeWalk=60;
 public float frameFill=.60f, frameFillMin=.55f, frameFillMax=.65f, frameTargetW=.45f, frameTargetH=.35f, frameWidthFill=.85f, fovMin=34, fovMax=70, fovEaseS=.3f, lookEase=28, workEase=14;
 // Walk bob locked to steps.
 public float strideM=.72f, bobMm=7, bobLateralMm=4, bobRollDeg=.25f;
 // Hearth reach (s from the trigger): step out, plunge, heat with two bellows pulls, pull out, step back, lay down.
 public float hearthStepS=.5f, hearthPlungeAtS=.42f, hearthPlungeS=.22f, bellowsPull1S=.60f, bellowsPull2S=1.15f, bellowsStrokeS=.42f, bellowsPullCm=9;
 public float hearthPullS=1.45f, hearthPullDurS=.14f, hearthBackS=1.58f, hoverMm=6, seatWaitMs=400, seatS=.12f, dissolveS=.12f, abortTweenS=.15f, fadeInS=.15f, glanceDeg=35, glanceS=.3f;
 // Tongs: grip angle between the reins and the blade's tang direction, hand distance from the jaws, rein rise.
 public float tongGripDeg=58, tongHandM=.40f, tongElevDeg=25, tongHearthYawDeg=-20;
 // Tong feed along the blade after each strike, the roll every 8 strikes, the spine tilt, the hammer's share of the walk.
 public float feedFrom=.20f, feedTo=.76f, feedStartMs=100, feedEndMs=260, rollMs=220, spineTiltDeg=6, contactJitterCm=1, feedHammerShare=.35f;
 // Elbow hints: the right elbow rises this far in the windup and drops at contact.
 public float elbowHintRiseCm=8;
 // Risk cues from snapshot.risk p (tau = smoothstep(riskLow, riskHigh, p)).
 public float riskLow=.15f, riskHigh=.6f, riskPushInDeg=3, riskApexHoldFrom=.3f, riskApexHoldMs=40, riskApexHoldPerRisk=100, riskApexHoldMaxMs=80;
 // Smear: stretched ghost copies of the head on the downstroke frames (spacing ms, first alpha).
 public int smearGhosts=3; public float smearSpacingMs=7, smearAlpha=.32f, smearStretch=1.6f;
 // Evolution ring alpha (Flow no longer triggers the world ring) and the label re-send rate.
 public float ringAlpha=.25f, labelHz=4;

 public void Clamp(){
  windupMs=Pos(windupMs,105);firstWindupMs=Pos(firstWindupMs,130);apexHoldMs=Pos(apexHoldMs,10);downstrokeMs=Pos(downstrokeMs,75);reboundMs=Pos(reboundMs,90);settleAfterContactMs=Pos(settleAfterContactMs,260);firstContactBudgetMs=Pos(firstContactBudgetMs,225);
  flowWindupMs=Pos(flowWindupMs,65);flowDownstrokeMs=Pos(flowDownstrokeMs,60);flowSettleAfterContactMs=Pos(flowSettleAfterContactMs,180);
  // A swing must fit: windups and downstrokes stay positive and short enough to keep the cycle.
  windupMs=Math.Max(30,Math.Min(windupMs,300));firstWindupMs=Math.Max(windupMs,Math.Min(firstWindupMs,350));downstrokeMs=Math.Max(30,Math.Min(downstrokeMs,200));flowWindupMs=Math.Max(30,Math.Min(flowWindupMs,250));flowDownstrokeMs=Math.Max(30,Math.Min(flowDownstrokeMs,150));
  apexHoldMs=Math.Min(apexHoldMs,150);
  windupMaxMs=Math.Max(windupMs,Math.Min(Pos(windupMaxMs,250),400));flowWindupMaxMs=Math.Max(flowWindupMs,Math.Min(Pos(flowWindupMaxMs,200),400));
  reboundMs=Math.Max(10,Math.Min(reboundMs,200));settleAfterContactMs=Math.Max(reboundMs,Math.Min(settleAfterContactMs,600));flowSettleAfterContactMs=Math.Max(Math.Min(reboundMs,flowSettleAfterContactMs),Math.Min(flowSettleAfterContactMs,600));
  scheduleAfterContactMs=ForgeTuning.Fit(scheduleAfterContactMs,0,400,150);
  hitStopDull=Pos(hitStopDull,16);hitStopGood=Pos(hitStopGood,45);hitStopChip=Pos(hitStopChip,65);hitStopPerfect=Pos(hitStopPerfect,85);hitStopEvolution=Pos(hitStopEvolution,110);hitStopShatter=Pos(hitStopShatter,130);hitStopGuarded=Pos(hitStopGuarded,100);
  flowHitStopScale=ForgeTuning.Fit(flowHitStopScale,0,1,.5f);shatterSlowScale=ForgeTuning.Fit(shatterSlowScale,0,1,.35f);reducedKickScale=ForgeTuning.Fit(reducedKickScale,0,1,.25f);
  // No single hit-stop may exceed 250 ms or swallow a Flow cycle.
  hitStopShatter=Math.Min(hitStopShatter,250);hitStopEvolution=Math.Min(hitStopEvolution,250);hitStopPerfect=Math.Min(hitStopPerfect,250);hitStopChip=Math.Min(hitStopChip,250);hitStopGood=Math.Min(hitStopGood,250);hitStopDull=Math.Min(hitStopDull,250);hitStopGuarded=Math.Min(hitStopGuarded,250);
  // The shatter slow-mo (plus its hit-stop) stays under the 600 ms timeScale watchdog.
  shatterSlowMs=ForgeTuning.Fit(shatterSlowMs,0,300,250);shatterRampMs=ForgeTuning.Fit(shatterRampMs,0,150,120);
  kickOmega=ForgeTuning.Fit(kickOmega,8,80,30);fovOmega=ForgeTuning.Fit(fovOmega,6,80,20);traumaDecayPerS=ForgeTuning.Fit(traumaDecayPerS,.5f,20,2.5f);
  traumaEvolution=ForgeTuning.Fit(traumaEvolution,0,1,.6f);traumaShatter=ForgeTuning.Fit(traumaShatter,0,1,.75f);shakeMaxDeg=ForgeTuning.Fit(shakeMaxDeg,0,3,1);shakeRollDeg=ForgeTuning.Fit(shakeRollDeg,0,3,.6f);shakeMm=ForgeTuning.Fit(shakeMm,0,15,5);shakeHz=ForgeTuning.Fit(shakeHz,1,60,22);
  kickDull=ForgeTuning.Fit(kickDull,0,4,.25f);kickGood=ForgeTuning.Fit(kickGood,0,4,.6f);kickChip=ForgeTuning.Fit(kickChip,0,4,.8f);kickPerfect=ForgeTuning.Fit(kickPerfect,0,4,1);kickEvolution=ForgeTuning.Fit(kickEvolution,0,4,1.1f);kickShatter=ForgeTuning.Fit(kickShatter,0,4,1.6f);kickGuarded=ForgeTuning.Fit(kickGuarded,0,4,1.3f);
  hitStopJitterMm=ForgeTuning.Fit(hitStopJitterMm,0,10,3.5f);tongTremorMm=ForgeTuning.Fit(tongTremorMm,0,6,2);tongTremorHz=ForgeTuning.Fit(tongTremorHz,1,20,9);
  wristSnapFrom=ForgeTuning.Fit(wristSnapFrom,.3f,.95f,.68f);elbowSwingDeg=ForgeTuning.Fit(elbowSwingDeg,0,60,14);wristSnapDeg=ForgeTuning.Fit(wristSnapDeg,0,50,26);wristPower=ForgeTuning.Fit(wristPower,.5f,3,1);elbowPower=ForgeTuning.Fit(elbowPower,1,4,1.7f);elbowLiftCm=ForgeTuning.Fit(elbowLiftCm,0,15,4);elbowBackCm=ForgeTuning.Fit(elbowBackCm,-10,20,9);
  contactHandleDeg=ForgeTuning.Fit(contactHandleDeg,-10,40,12);headHangDeg=ForgeTuning.Fit(headHangDeg,-10,40,12);
  readyElbow=ForgeTuning.Fit(readyElbow,0,1,.45f);readyWrist=ForgeTuning.Fit(readyWrist,0,1,.55f);parkS=ForgeTuning.Fit(parkS,.05f,3,.45f);restIdleS=ForgeTuning.Fit(restIdleS,.2f,30,1.2f);
  fovMin=ForgeTuning.Fit(fovMin,20,90,34);fovMax=ForgeTuning.Fit(fovMax,fovMin,100,70);frameFillMin=ForgeTuning.Fit(frameFillMin,.2f,.95f,.55f);frameFillMax=ForgeTuning.Fit(frameFillMax,frameFillMin,.95f,.65f);frameFill=ForgeTuning.Fit(frameFill,frameFillMin,frameFillMax,.6f);
  frameTargetW=ForgeTuning.Fit(frameTargetW,.1f,2,.45f);frameTargetH=ForgeTuning.Fit(frameTargetH,.1f,2,.35f);frameWidthFill=ForgeTuning.Fit(frameWidthFill,.3f,1,.85f);fovEaseS=ForgeTuning.Fit(fovEaseS,.02f,2,.3f);
  fovDesktop=ForgeTuning.Fit(fovDesktop,fovMin,fovMax,42);fovPortrait=ForgeTuning.Fit(fovPortrait,fovMin,fovMax,62);fovLandscape=ForgeTuning.Fit(fovLandscape,fovMin,fovMax,46);
  fovDesktopWalk=ForgeTuning.Fit(fovDesktopWalk,20,100,62);fovPortraitWalk=ForgeTuning.Fit(fovPortraitWalk,20,100,74);fovLandscapeWalk=ForgeTuning.Fit(fovLandscapeWalk,20,100,60);
  lookEase=ForgeTuning.Fit(lookEase,1,120,28);workEase=ForgeTuning.Fit(workEase,1,120,14);strideM=ForgeTuning.Fit(strideM,.3f,2,.72f);bobMm=ForgeTuning.Fit(bobMm,0,20,7);bobLateralMm=ForgeTuning.Fit(bobLateralMm,0,20,4);bobRollDeg=ForgeTuning.Fit(bobRollDeg,0,2,.25f);
  // Hearth: the step takes at least .5 s each way (critique: comfortable), the phases stay in order.
  hearthStepS=ForgeTuning.Fit(hearthStepS,.5f,1.2f,.5f);hearthPlungeS=ForgeTuning.Fit(hearthPlungeS,.05f,.6f,.22f);hearthPlungeAtS=ForgeTuning.Fit(hearthPlungeAtS,.1f,hearthStepS+.3f,.42f);
  hearthPullS=ForgeTuning.Fit(hearthPullS,hearthPlungeAtS+hearthPlungeS+.2f,3,1.45f);hearthPullDurS=ForgeTuning.Fit(hearthPullDurS,.05f,.4f,.14f);hearthBackS=ForgeTuning.Fit(hearthBackS,hearthPullS+hearthPullDurS*.5f,3.5f,1.58f);
  bellowsPull1S=ForgeTuning.Fit(bellowsPull1S,0,3,.6f);bellowsPull2S=ForgeTuning.Fit(bellowsPull2S,0,3,1.15f);bellowsStrokeS=ForgeTuning.Fit(bellowsStrokeS,.1f,1,.42f);bellowsPullCm=ForgeTuning.Fit(bellowsPullCm,0,30,9);
  seatWaitMs=ForgeTuning.Fit(seatWaitMs,0,1000,400);seatS=ForgeTuning.Fit(seatS,.02f,.5f,.12f);dissolveS=ForgeTuning.Fit(dissolveS,.02f,.5f,.12f);abortTweenS=ForgeTuning.Fit(abortTweenS,.02f,.6f,.15f);fadeInS=ForgeTuning.Fit(fadeInS,.02f,.6f,.15f);hoverMm=ForgeTuning.Fit(hoverMm,0,40,6);
  tongGripDeg=ForgeTuning.Fit(tongGripDeg,0,90,58);tongHandM=ForgeTuning.Fit(tongHandM,.2f,.5f,.40f);tongElevDeg=ForgeTuning.Fit(tongElevDeg,0,60,25);
  feedFrom=ForgeTuning.Fit(feedFrom,0,1,.2f);feedTo=ForgeTuning.Fit(feedTo,feedFrom,1,.76f);feedHammerShare=ForgeTuning.Fit(feedHammerShare,0,1,.35f);feedStartMs=ForgeTuning.Fit(feedStartMs,0,400,100);feedEndMs=ForgeTuning.Fit(feedEndMs,feedStartMs+10,600,260);rollMs=ForgeTuning.Fit(rollMs,50,800,220);
  spineTiltDeg=ForgeTuning.Fit(spineTiltDeg,0,25,6);contactJitterCm=ForgeTuning.Fit(contactJitterCm,0,4,1);elbowHintRiseCm=ForgeTuning.Fit(elbowHintRiseCm,0,25,8);
  riskLow=ForgeTuning.Fit(riskLow,0,1,.15f);riskHigh=ForgeTuning.Fit(riskHigh,riskLow+.01f,1.01f,.6f);riskPushInDeg=ForgeTuning.Fit(riskPushInDeg,0,8,3);riskApexHoldMaxMs=ForgeTuning.Fit(riskApexHoldMaxMs,0,150,80);riskApexHoldMs=ForgeTuning.Fit(riskApexHoldMs,0,riskApexHoldMaxMs,40);
  smearGhosts=Math.Max(0,Math.Min(4,smearGhosts));smearSpacingMs=ForgeTuning.Fit(smearSpacingMs,1,30,7);smearAlpha=ForgeTuning.Fit(smearAlpha,0,1,.32f);smearStretch=ForgeTuning.Fit(smearStretch,1,4,1.6f);
  ringAlpha=ForgeTuning.Fit(ringAlpha,0,1,.25f);labelHz=ForgeTuning.Fit(labelHz,.5f,4,4);
 }
 static float Pos(float v,float fallback)=>float.IsNaN(v)||float.IsInfinity(v)||v<0?fallback:v;
}

/// Minimal pure vector (Unity conventions: left-handed, y up, z forward).
[Serializable] public struct FV {
 public float x,y,z; public FV(float x,float y,float z){this.x=x;this.y=y;this.z=z;}
 public static FV operator+(FV a,FV b)=>new FV(a.x+b.x,a.y+b.y,a.z+b.z);
 public static FV operator-(FV a,FV b)=>new FV(a.x-b.x,a.y-b.y,a.z-b.z);
 public static FV operator-(FV a)=>new FV(-a.x,-a.y,-a.z);
 public static FV operator*(FV a,float s)=>new FV(a.x*s,a.y*s,a.z*s);
 public static FV operator*(float s,FV a)=>new FV(a.x*s,a.y*s,a.z*s);
 public static float Dot(FV a,FV b)=>a.x*b.x+a.y*b.y+a.z*b.z;
 public static FV Cross(FV a,FV b)=>new FV(a.y*b.z-a.z*b.y,a.z*b.x-a.x*b.z,a.x*b.y-a.y*b.x);
 public float Length=>MathF.Sqrt(x*x+y*y+z*z);
 public FV Normalized{get{float l=Length;return l>1e-9f?this*(1/l):new FV(0,0,0);}}
 public static FV Lerp(FV a,FV b,float t)=>a+(b-a)*t;
 public static float Distance(FV a,FV b)=>(a-b).Length;
 public static readonly FV Zero=new FV(0,0,0), Up=new FV(0,1,0), Right=new FV(1,0,0), Forward=new FV(0,0,1);
 public override string ToString()=>$"({x:0.###},{y:0.###},{z:0.###})";
}
/// Minimal pure quaternion with Unity's Quaternion formulas (AngleAxis, Euler order z-x-y, LookRotation).
[Serializable] public struct FQ {
 public float x,y,z,w; public FQ(float x,float y,float z,float w){this.x=x;this.y=y;this.z=z;this.w=w;}
 public static readonly FQ Identity=new FQ(0,0,0,1);
 public static FQ AngleAxis(float deg,FV axis){var a=axis.Normalized;float h=deg*MathF.PI/360;float s=MathF.Sin(h);return new FQ(a.x*s,a.y*s,a.z*s,MathF.Cos(h));}
 /// Unity's Quaternion.Euler(x, y, z): z, then x, then y.
 public static FQ Euler(float x,float y,float z)=>AngleAxis(y,FV.Up)*AngleAxis(x,FV.Right)*AngleAxis(z,FV.Forward);
 public static FQ operator*(FQ a,FQ b)=>new FQ(a.w*b.x+a.x*b.w+a.y*b.z-a.z*b.y,a.w*b.y-a.x*b.z+a.y*b.w+a.z*b.x,a.w*b.z+a.x*b.y-a.y*b.x+a.z*b.w,a.w*b.w-a.x*b.x-a.y*b.y-a.z*b.z);
 public static FV operator*(FQ q,FV v){var u=new FV(q.x,q.y,q.z);var t=2*FV.Cross(u,v);return v+q.w*t+FV.Cross(u,t);}
 public FQ Inverse=>new FQ(-x,-y,-z,w);
 public static float Dot(FQ a,FQ b)=>a.x*b.x+a.y*b.y+a.z*b.z+a.w*b.w;
 public static float Angle(FQ a,FQ b){float d=MathF.Min(1,MathF.Abs(Dot(a,b)));return 2*MathF.Acos(d)*180/MathF.PI;}
 /// Spherical interpolation along the shorter arc.
 public static FQ Slerp(FQ a,FQ b,float t){float d=Dot(a,b);if(d<0){b=new FQ(-b.x,-b.y,-b.z,-b.w);d=-d;}if(d>.9995f){var r=new FQ(a.x+(b.x-a.x)*t,a.y+(b.y-a.y)*t,a.z+(b.z-a.z)*t,a.w+(b.w-a.w)*t);float l=MathF.Sqrt(Dot(r,r));return new FQ(r.x/l,r.y/l,r.z/l,r.w/l);}float th=MathF.Acos(d),s=MathF.Sin(th);float wa=MathF.Sin((1-t)*th)/s,wb=MathF.Sin(t*th)/s;return new FQ(a.x*wa+b.x*wb,a.y*wa+b.y*wb,a.z*wa+b.z*wb,a.w*wa+b.w*wb);}
 /// Rotation whose +z looks along `forward` with +y as close to `up` as possible (Quaternion.LookRotation).
 public static FQ LookRotation(FV forward,FV up){var f=forward.Normalized;var r=FV.Cross(up,f).Normalized;if(r.Length<1e-6f)r=FV.Cross(FV.Forward,f).Normalized;if(r.Length<1e-6f)r=FV.Right;var u=FV.Cross(f,r);
  float m00=r.x,m01=u.x,m02=f.x,m10=r.y,m11=u.y,m12=f.y,m20=r.z,m21=u.z,m22=f.z;float tr=m00+m11+m22;
  if(tr>0){float s=MathF.Sqrt(tr+1)*2;return new FQ((m21-m12)/s,(m02-m20)/s,(m10-m01)/s,.25f*s);}
  if(m00>m11&&m00>m22){float s=MathF.Sqrt(1+m00-m11-m22)*2;return new FQ(.25f*s,(m01+m10)/s,(m02+m20)/s,(m21-m12)/s);}
  if(m11>m22){float s=MathF.Sqrt(1+m11-m00-m22)*2;return new FQ((m01+m10)/s,.25f*s,(m12+m21)/s,(m02-m20)/s);}
  {float s=MathF.Sqrt(1+m22-m00-m11)*2;return new FQ((m02+m20)/s,(m12+m21)/s,.25f*s,(m10-m01)/s);}
 }
 /// Smallest rotation turning a into b (about `fallback` when they are opposite).
 public static FQ FromTo(FV a,FV b,FV fallback){a=a.Normalized;b=b.Normalized;float d=FV.Dot(a,b);if(d>.999999f)return Identity;if(d<-.99999f)return AngleAxis(180,fallback);var c=FV.Cross(a,b);float s=MathF.Sqrt((1+d)*2);return new FQ(c.x/s,c.y/s,c.z/s,s*.5f);}
}

/// Small shared maths and the per-outcome tables.
public static class ForgeFeel {
 public const float Deg=MathF.PI/180;
 public static float Clamp01(float x)=>x<0?0:x>1?1:x;
 public static float Clamp(float x,float a,float b)=>x<a?a:x>b?b:x;
 public static float Lerp(float a,float b,float t)=>a+(b-a)*t;
 public static float Smooth(float u){u=Clamp01(u);return u*u*(3-2*u);}
 public static float Smoothstep(float a,float b,float x)=>b==a?(x>=b?1:0):Smooth((x-a)/(b-a));
 /// Ease-out with exponent n: 1 - (1-u)^n.
 public static float EaseOut(float u,float n)=>1-MathF.Pow(1-Clamp01(u),n);
 /// Windup ease: cubic ease-out, steepened for short windups so at least 35% of the lift shows in the first
 /// 16.7 ms frame (for windups up to 150 ms; longer, scheduled windups are allowed to be gentler).
 public static float WindupEase(float u,float windupMs){float n=3;if(windupMs>16.7f&&windupMs<=150){float need=MathF.Log(.62f)/MathF.Log(1-16.7f/windupMs);if(need>n)n=need;}return EaseOut(u,n);}
 /// Elbow progress through the downstroke (0 at the apex, 1 at contact): it accelerates all the way (u^power).
 public static float DownElbow(float u,float power=2){u=Clamp01(u);return MathF.Pow(u,power);}
 /// Wrist snap progress: held cocked until `from`, then snapping on an accelerating curve.
 public static float DownWrist(float u,float from,float power){u=Clamp01(u);if(u<=from)return 0;return MathF.Pow((u-from)/(1-from),power);}

 /// tau = smoothstep(riskLow, riskHigh, risk): the strength of every risk cue.
 public static float Tau(ForgeStrikeTuning t,float risk)=>Smoothstep(t.riskLow,t.riskHigh,risk);
 /// Extra apex hold at high risk (not in Flow): 40 + 100 (p - .3) ms from p = .3, capped at 80.
 public static float RiskHoldMs(ForgeStrikeTuning t,float risk,bool flow)=>flow||risk<t.riskApexHoldFrom?0:Math.Min(t.riskApexHoldMaxMs,t.riskApexHoldMs+t.riskApexHoldPerRisk*(risk-t.riskApexHoldFrom));

 /// Hit-stop length (ms of wall clock) for an outcome; Flow halves it, reduced motion removes it.
 public static float HitStopMs(ForgeStrikeTuning t,string outcome,bool evolution,bool guarded,bool flow,bool reduced){
  if(reduced)return 0;float ms=outcome=="shatter"?t.hitStopShatter:evolution?t.hitStopEvolution:guarded?t.hitStopGuarded:outcome=="perfect"?t.hitStopPerfect:outcome=="chip"?t.hitStopChip:outcome=="dull"?t.hitStopDull:t.hitStopGood;
  return flow?ms*t.flowHitStopScale:ms;
 }
 /// Directional kick (pitch down in degrees, drop in mm, roll in degrees) for an outcome.
 public static void Kick(ForgeStrikeTuning t,string outcome,bool evolution,bool guarded,out float pitchDeg,out float dropMm,out float rollDeg){
  rollDeg=0;
  if(outcome=="shatter"){pitchDeg=t.kickShatter;dropMm=t.dropShatter;}
  else if(evolution){pitchDeg=t.kickEvolution;dropMm=t.dropEvolution;}
  else if(guarded){pitchDeg=t.kickGuarded;dropMm=t.dropGuarded;rollDeg=t.chipRollDeg;}
  else if(outcome=="perfect"){pitchDeg=t.kickPerfect;dropMm=t.dropPerfect;}
  else if(outcome=="chip"){pitchDeg=t.kickChip;dropMm=t.dropChip;rollDeg=t.chipRollDeg;}
  else if(outcome=="dull"){pitchDeg=t.kickDull;dropMm=t.dropDull;}
  else{pitchDeg=t.kickGood;dropMm=t.dropGood;}
 }
 public static float FovPunch(ForgeStrikeTuning t,string outcome,bool evolution)=>outcome=="shatter"?t.fovPunchShatter:evolution?t.fovPunchEvolution:outcome=="perfect"?t.fovPunchPerfect:0;
 public static float Trauma(ForgeStrikeTuning t,string outcome,bool evolution)=>outcome=="shatter"?t.traumaShatter:evolution?t.traumaEvolution:0;
 /// Rebound height (m) off the work after contact.
 public static float ReboundM(ForgeStrikeTuning t,string outcome,bool evolution)=>.01f*(outcome=="shatter"?t.reboundShatter:evolution?t.reboundEvolution:outcome=="perfect"?t.reboundPerfect:outcome=="chip"?t.reboundChip:outcome=="dull"?t.reboundDull:t.reboundGood);

 /// Critically damped spring displacement at time t (s) from x0 with velocity v0.
 public static float Spring(float x0,float v0,float omega,float t)=>(x0+(v0+omega*x0)*t)*MathF.Exp(-omega*t);
 /// Exact critically damped step toward `target` (frame-rate independent).
 public static void SpringStep(ref float x,ref float v,float target,float omega,float dt){float d=x-target;float e=MathF.Exp(-omega*dt);float nx=(d+(v+omega*d)*dt)*e;float nv=(v-omega*(v+omega*d)*dt)*e;x=target+nx;v=nv;}
 /// Linear trauma decay.
 public static float Decay(float trauma,float perSecond,float dt)=>Math.Max(0,trauma-perSecond*dt);
 /// Exponential ease factor for a rate (1/s) over dt (s).
 public static float Ease(float rate,float dt)=>1-MathF.Exp(-rate*dt);

 /// Smooth 1D value noise in [-1, 1] (deterministic, for shake and tremor).
 public static float Noise(float t,int seed){int i=(int)MathF.Floor(t);float f=t-i;float a=Hash(i,seed),b=Hash(i+1,seed);float s=f*f*(3-2*f);return a+(b-a)*s;}
 public static float Hash(int i,int seed){unchecked{uint h=(uint)(i*374761393+seed*668265263);h=(h^(h>>13))*1274126177u;h^=h>>16;return (h&0xFFFFFF)/(float)0x7FFFFF-1;}}

 /// Where along the blade (0 = heel of the blade, 1 = tip) the hammer lands after `totalHits` strikes:
 /// the blows walk from feedFrom to feedTo over h = totalHits mod 8.
 public static float FeedU(ForgeStrikeTuning t,int totalHits){int h=((totalHits%8)+8)%8;return t.feedFrom+(t.feedTo-t.feedFrom)*h/7f;}
 /// Every 8 strikes (h = 0) the tongs roll the blade over.
 public static bool FeedRolls(int totalHits)=>totalHits>0&&totalHits%8==0;
 /// Contact x jitter (m), deterministic per strike, within contactJitterCm.
 public static float ContactJitter(ForgeStrikeTuning t,int totalHits)=>.01f*t.contactJitterCm*Hash(totalHits,77);
}

/// One swing on the realtime strike timeline (ms).
public struct ForgeSwingPlan {
 public int seq; public bool flow;
 public float press,start,windup,hold,down,contact,settle;
 /// 0 = from the ready pose, 1 = from rest or parked (the first strike of a sequence).
 public float fromRest;
 public float ApexAt=>start+windup;
 public float DownAt=>start+windup+hold;
}

/// Plans swings so contacts keep their spacing. Pure; ForgeStrikeMachine drives it.
public sealed class ForgeSwingScheduler {
 public ForgeStrikeTuning tuning=new ForgeStrikeTuning();
 /// Realtime ms of the previous contact (-inf before the first).
 public float lastContact=float.NegativeInfinity;
 public bool HasContact=>!float.IsNegativeInfinity(lastContact);
 public float Cycle(bool flow)=>Math.Max(flow?tuning.flowCycleMs:tuning.cycleMs,tuning.minImpactGapMs);
 public float Settle(bool flow)=>flow?tuning.flowSettleAfterContactMs:tuning.settleAfterContactMs;
 /// Plan a swing for a press at `press`. The windup starts at max(press, notBefore) (notBefore = the ready time of
 /// the swing before, or the seating of a fresh blank), stretches to fit the cycle (up to windupMax) and holds any
 /// time left at the apex, so the contact is never earlier than lastContact + cycle (and minImpactGap).
 /// rest01: how far the hammer is from ready toward rest or parked (a longer, 130 ms windup from rest).
 public ForgeSwingPlan Plan(int seq,float press,bool flow,float risk,float rest01,float notBefore=float.NegativeInfinity){
  var t=tuning;var p=new ForgeSwingPlan{seq=seq,flow=flow,press=press,fromRest=ForgeFeel.Clamp01(rest01)};
  float w0=flow?ForgeFeel.Lerp(t.flowWindupMs,Math.Max(t.flowWindupMs,t.firstWindupMs*.75f),p.fromRest):ForgeFeel.Lerp(t.windupMs,t.firstWindupMs,p.fromRest);
  float wmax=Math.Max(w0,flow?t.flowWindupMaxMs:t.windupMaxMs);
  p.hold=(flow?0:t.apexHoldMs)+ForgeFeel.RiskHoldMs(t,risk,flow);p.down=flow?t.flowDownstrokeMs:t.downstrokeMs;
  p.start=Math.Max(press,notBefore);
  float allowed=HasContact?lastContact+Cycle(flow):float.NegativeInfinity;
  float fit=allowed-p.hold-p.down-p.start;
  p.windup=float.IsNegativeInfinity(allowed)?w0:ForgeFeel.Clamp(fit,w0,wmax);
  float contact=p.start+p.windup+p.hold+p.down;
  if(contact<allowed){p.hold+=allowed-contact;contact=allowed;}
  p.contact=contact;p.settle=contact+Settle(flow);
  return p;
 }
 public void Contact(float at){lastContact=at;}
 public void Reset(){lastContact=float.NegativeInfinity;}
}

public enum ForgeStrikeEventKind { Contact, Settled, Cancelled }
public struct ForgeStrikeEvent { public ForgeStrikeEventKind kind; public int seq; public float at; public bool flow; }
public enum ForgeStrikeAccept { Started, Queued, Refused }

/// The strike state machine: one swing in flight plus at most one scheduled (buffered) strike. Every accepted
/// Strike yields exactly one Contact and then one Settled; a cancelled one yields one Cancelled (settled x = -1).
/// Pure, realtime ms; ForgeStrike.cs feeds it presses and frame times and turns its events into messages.
public sealed class ForgeStrikeMachine {
 public readonly ForgeSwingScheduler scheduler=new ForgeSwingScheduler();
 public ForgeStrikeTuning tuning{get=>scheduler.tuning;set=>scheduler.tuning=value;}
 public bool hasCurrent,contacted,hasQueued;
 public ForgeSwingPlan current,queued;
 /// Actual contact time of the current swing, and the hit-stop that followed it (set when the outcome is known).
 public float contactAt=float.NegativeInfinity,hitStopMs;
 public float lastImpactAt=float.NegativeInfinity,lastSettleAt=float.NegativeInfinity;
 public bool Busy=>hasCurrent;
 public float SettleAt=>contactAt+scheduler.Settle(current.flow);

 /// A Strike arrived at `now`. notBefore: the earliest windup start (a blank still being seated).
 public ForgeStrikeAccept Press(int seq,float now,bool flow,float risk,float rest01,float notBefore,out ForgeSwingPlan plan){
  plan=default;
  if(!hasCurrent){plan=scheduler.Plan(seq,now,flow,risk,rest01,notBefore);current=plan;hasCurrent=true;contacted=false;hitStopMs=0;return ForgeStrikeAccept.Started;}
  if(!contacted||now<contactAt+tuning.scheduleAfterContactMs||hasQueued)return ForgeStrikeAccept.Refused;
  plan=scheduler.Plan(seq,now,flow,risk,0,Math.Max(notBefore,SettleAt));queued=plan;hasQueued=true;return ForgeStrikeAccept.Queued;
 }
 /// The outcome of the current contact is known: its hit-stop holds the hammer on the work.
 public void ResolveHitStop(float ms){if(hasCurrent&&contacted)hitStopMs=Math.Max(0,ms);}
 /// Advance to `now`, appending Contact and Settled events in order.
 public void Step(float now,List<ForgeStrikeEvent> events){
  for(int guard=0;guard<6&&hasCurrent;guard++){
   if(!contacted){
    float at=Math.Max(current.contact,lastImpactAt+tuning.minImpactGapMs);
    if(now<at)return;
    contacted=true;contactAt=now;lastImpactAt=now;hitStopMs=0;scheduler.Contact(now);
    events.Add(new ForgeStrikeEvent{kind=ForgeStrikeEventKind.Contact,seq=current.seq,at=now,flow=current.flow});
    continue;
   }
   if(now<SettleAt)return;
   events.Add(new ForgeStrikeEvent{kind=ForgeStrikeEventKind.Settled,seq=current.seq,at=now,flow=current.flow});lastSettleAt=now;
   if(hasQueued){current=queued;hasQueued=false;contacted=false;hitStopMs=0;}else hasCurrent=false;
  }
 }
 /// Cancel every strike that has not reached its contact (walking away, clear, the knife left the anvil).
 public void Cancel(float now,List<ForgeStrikeEvent> events){
  if(hasQueued){events.Add(new ForgeStrikeEvent{kind=ForgeStrikeEventKind.Cancelled,seq=queued.seq,at=now});hasQueued=false;}
  if(hasCurrent&&!contacted){events.Add(new ForgeStrikeEvent{kind=ForgeStrikeEventKind.Cancelled,seq=current.seq,at=now});hasCurrent=false;}
 }
 public void Reset(){hasCurrent=hasQueued=contacted=false;contactAt=lastImpactAt=lastSettleAt=float.NegativeInfinity;hitStopMs=0;scheduler.Reset();}
}

public enum ForgeSwingPhase { Wait, Windup, Hold, Down, Contact }
/// Where a planned swing is at time `now`: the phase and the arc parameters (elbow 1 = apex, wrist 1 = cocked).
public struct ForgeSwingSample { public ForgeSwingPhase phase; public float u, elbow, wrist, blend; }

public static class ForgeSwing {
 /// Sample a plan. blend is the windup progress (0..1) from the captured start pose to the apex.
 public static ForgeSwingSample Sample(in ForgeSwingPlan p,float now,ForgeStrikeTuning t){
  var s=new ForgeSwingSample();
  if(now<p.start){s.phase=ForgeSwingPhase.Wait;return s;}
  float a=now-p.start;
  if(a<p.windup){s.phase=ForgeSwingPhase.Windup;s.u=a/p.windup;s.blend=ForgeFeel.WindupEase(s.u,p.windup);s.elbow=1;s.wrist=1;return s;}
  a-=p.windup;s.blend=1;
  if(a<p.hold){s.phase=ForgeSwingPhase.Hold;s.u=p.hold>0?a/p.hold:1;s.elbow=1;s.wrist=1;return s;}
  a-=p.hold;
  if(a<p.down){s.phase=ForgeSwingPhase.Down;s.u=a/p.down;s.elbow=1-ForgeFeel.DownElbow(s.u,t.elbowPower);s.wrist=1-ForgeFeel.DownWrist(s.u,t.wristSnapFrom,t.wristPower);return s;}
  s.phase=ForgeSwingPhase.Contact;s.u=1;s.elbow=0;s.wrist=0;return s;
 }
 /// After contact: the hammer holds on the work for the hit-stop, rebounds (0..1 of the rebound height) and returns
 /// to ready (0..1) by the settle time. sinceContact is realtime ms since the contact frame.
 public static void Recover(float sinceContact,float hitStopMs,float settleMs,ForgeStrikeTuning t,out float rebound,out float toReady){
  float tau=sinceContact-hitStopMs;rebound=0;toReady=0;if(tau<=0)return;
  float avail=Math.Max(1,settleMs-hitStopMs);float rb=Math.Min(t.reboundMs,avail*.45f);
  if(tau<rb){rebound=ForgeFeel.EaseOut(tau/rb,2.2f);return;}
  float v=avail>rb?(tau-rb)/(avail-rb):1;toReady=ForgeFeel.Smooth(v);rebound=1-toReady;
 }
}

/// A hammer pose: the grip (hammer origin, where the right hand holds) and the hammer orientation.
public struct ForgeHammerPose {
 public FV grip; public FQ rot;
 public ForgeHammerPose(FV grip,FQ rot){this.grip=grip;this.rot=rot;}
 public static ForgeHammerPose Blend(ForgeHammerPose a,ForgeHammerPose b,float t)=>new ForgeHammerPose(FV.Lerp(a.grip,b.grip,t),FQ.Slerp(a.rot,b.rot,t));
}

/// The hammer arc: a two-joint swing (elbow + wrist) in the smith's yaw frame, anchored at the contact point.
/// Contact: the face sits flat on the work, the handle rising contactHandleDeg toward the hand (the head is hung
/// headHangDeg on the handle so the face lands flat). Apex: the elbow has turned elbowSwingDeg about the forearm's
/// swing axis (and risen elbowLiftCm), the wrist has cocked wristSnapDeg. The head swings on a radius of about
/// .6 m about the elbow (forearm plus grip-to-head), so the blow reads as an arm blow, not a wrist flick.
/// Hammer-local frame: origin at the grip, +y along the handle toward the head (head eye at gripToHead), the head's
/// long axis along x with the face toward -x, hung headHangDeg about z.
public sealed class ForgeHammerArc {
 public ForgeStrikeTuning tuning=new ForgeStrikeTuning();
 // Arm model in smith-local metres (yaw frame, origin at the stance on the floor): ForgeLayoutData's numbers.
 public FV shoulder=new FV(.20f,1.42f,.05f);public float upperArm=.29f,forearmToGrip=.35f,gripToHead=.28f,faceToAxis=.04f;
 public FV elbowHint=new FV(.30f,-.30f,-.05f);   // relative to the shoulder: down, out and slightly back
 // Solved by Solve(contact): the contact head axis point, grip, elbow, swing axis and orientation (smith-local).
 public FV contact,head0,grip0,elbow0,axis;public FQ rot0;

 public FQ Hang=>FQ.AngleAxis(-tuning.headHangDeg,FV.Forward);
 public FV FaceNormalLocal=>Hang*new FV(-1,0,0);
 public FV HeadLocal=>new FV(0,gripToHead,0);
 public FV FaceLocal=>HeadLocal+FaceNormalLocal*faceToAxis;

 /// Rotation taking hammer-local +y to `handle` (grip toward head) with the face normal as close to `faceNormal` as possible.
 public FQ Orient(FV handle,FV faceNormal){
  var y=handle.Normalized;var want=(faceNormal-y*FV.Dot(faceNormal,y)).Normalized;if(want.Length<1e-6f)want=FV.Cross(y,FV.Forward).Normalized;
  // The face normal lies in the hammer's local x-y plane; build the frame from y and the projected local face normal.
  var nl=FaceNormalLocal;var nlp=(nl-new FV(0,1,0)*nl.y).Normalized;          // = (-1,0,0) in local
  var zl=FV.Cross(new FV(0,1,0),nlp);                                          // local z direction
  var z=FV.Cross(y,want).Normalized;
  // Local frame (x, y, z) -> world: local y -> y; local -x (nlp) -> want; local z -> z(sign matched).
  var q=FQ.LookRotation(z*(zl.z>=0?1:-1),y);
  var now=q*nlp;return FQ.FromTo(now,want,y)*q;
 }
 public void Solve(FV contactLocal){
  contact=contactLocal;var t=tuning;
  head0=contactLocal+FV.Up*faceToAxis;
  var h=shoulder-head0;h.y=0;h=h.Normalized;if(h.Length<1e-6f)h=new FV(0,0,-1);float e=t.contactHandleDeg*ForgeFeel.Deg;
  var d=new FV(h.x*MathF.Cos(e),MathF.Sin(e),h.z*MathF.Cos(e));   // from the head toward the hand
  rot0=Orient(-d,new FV(0,-1,0));
  // The hang makes the face exactly flat only when it equals the handle elevation; correct any residual about the swing.
  var n=rot0*FaceNormalLocal;var side=FV.Cross(FV.Up,new FV(h.x,0,h.z)).Normalized;rot0=FQ.FromTo(n,new FV(0,-1,0),side)*rot0;
  grip0=head0-rot0*HeadLocal;
  elbow0=Elbow(shoulder,grip0,shoulder+elbowHint);
  var f=grip0-elbow0;f.y=0;f=f.Normalized;if(f.Length<1e-6f)f=FV.Forward;axis=FV.Cross(FV.Up,f).Normalized;
 }
 /// Two-bone elbow position for a shoulder-hand pair, bending toward `hint`.
 public FV Elbow(FV s,FV g,FV hint){float dd=(g-s).Length,u=upperArm,f=forearmToGrip;dd=Math.Min(dd,u+f-1e-4f);float a=(u*u-f*f+dd*dd)/(2*dd),r=MathF.Sqrt(Math.Max(0,u*u-a*a));var ex=(g-s).Normalized;var c=s+ex*a;var w=hint-c;w=w-ex*FV.Dot(w,ex);if(w.Length<1e-6f)w=new FV(0,-1,0);return c+w.Normalized*r;}
 /// Swing rotation (about the elbow's swing axis) by `deg`; positive lifts the head.
 public FQ Lift(float deg)=>FQ.AngleAxis(-deg,axis);
 /// Arc pose: elbow 0..1 (1 = apex turn), wrist 0..1 (1 = cocked).
 public ForgeHammerPose Arc(float elbow,float wrist){
  var t=tuning;float pe=t.elbowSwingDeg*elbow,pw=t.wristSnapDeg*wrist;
  var pivot=ElbowAt(elbow);
  var g=pivot+Lift(pe)*(grip0-elbow0);
  // The wrist turns the head about the grip, so the grip stays on the forearm's arc.
  return new ForgeHammerPose(g,Lift(pe+pw)*rot0);
 }
 /// The elbow (pivot) position for an arc parameter: drives the right elbow IK hint.
 public FV ElbowAt(float elbow)=>elbow0+(FV.Up*tuning.elbowLiftCm+Toward()*tuning.elbowBackCm)*(.01f*elbow);
 public FV Head(ForgeHammerPose p)=>p.grip+p.rot*HeadLocal;
 public FV Face(ForgeHammerPose p)=>p.grip+p.rot*FaceLocal;
 public FV FaceNormal(ForgeHammerPose p)=>p.rot*FaceNormalLocal;
 /// The ready pose between strikes: part of the way up the arc, nudged right and back off the work.
 public ForgeHammerPose Ready(){var t=tuning;var p=Arc(t.readyElbow,t.readyWrist);p.grip=p.grip+Side()*t.readyRight+Toward()*t.readyBack;return p;}
 /// Rebound off the work: the head rises `lift` metres (mostly at the wrist), skews `skew` metres sideways and the
 /// face tilts `tiltDeg` about the handle.
 public ForgeHammerPose Rebound(float lift,float skew,float tiltDeg){
  // Mostly wrist (the hammer bounces off the face), a little elbow; solve the scale for the head rise.
  float k=0;if(lift>0){float per=Head(Arc(.25f,.75f)).y-head0.y;k=per>1e-4f?lift/per:0;for(int i=0;i<2&&k>0;i++){float rise=Head(Arc(.25f*k,.75f*k)).y-head0.y;if(rise>1e-5f)k*=lift/rise;}k=ForgeFeel.Clamp(k,0,1.2f);}
  var p=Arc(.25f*k,.75f*k);p.grip=p.grip+Side()*skew;
  if(tiltDeg!=0){var head=Head(p);var handle=(head-p.grip).Normalized;p.rot=FQ.AngleAxis(tiltDeg,handle)*p.rot;p.grip=head-p.rot*HeadLocal;}
  return p;
 }
 /// Hung at the right side from a relaxed hand while walking (off the work), relative to a nominal contact.
 public ForgeHammerPose Rest(FV nominalContact){var t=tuning;var head=nominalContact+new FV(t.restRight,t.restUp+faceToAxis,-t.restBack);
  var rot=Orient(new FV(.10f,-1,.25f),new FV(0,.2f,1));return new ForgeHammerPose(head-rot*HeadLocal,rot);}
 /// Laid on the anvil face after an idle spell (what smiths do): the head rests on the face to the right of the work,
 /// the face toward the work, the handle rising back to the hand.
 public ForgeHammerPose Park(FV headOnFace){
  var hand=headOnFace+new FV(.03f,.10f,-.26f);var handle=(headOnFace-hand).Normalized;
  var rot=Orient(handle,new FV(-1,0,0));return new ForgeHammerPose(headOnFace-rot*HeadLocal,rot);
 }
 /// Unit vector to the smith's right in the swing plane (perpendicular to the forearm direction).
 public FV Side()=>axis;
 /// Unit horizontal vector from the head toward the smith.
 public FV Toward(){var h=shoulder-head0;h.y=0;return h.Normalized;}
}

/// Tong geometry: where the left hand holds the reins for jaws at a point, and how the knife hangs in the jaws.
public static class ForgeTongModel {
 /// Horizontal unit direction of the reins (from the jaws toward the hand) for a knife whose tang points along
 /// `tangDir` (from the blade toward the tang) and a left shoulder at `shoulder`: the reins leave the tang at
 /// tongGripDeg, turned toward the shoulder.
 public static FV ReinDir(ForgeStrikeTuning t,FV jaws,FV tangDir,FV shoulder){
  var a=new FV(tangDir.x,0,tangDir.z).Normalized;var s=shoulder-jaws;s.y=0;s=s.Normalized;
  // Rotate the tang direction toward the shoulder by tongGripDeg (or less when the shoulder is closer than that).
  float full=MathF.Acos(ForgeFeel.Clamp(FV.Dot(a,s),-1,1))/ForgeFeel.Deg;if(full<1e-3f)return a;
  float k=Math.Min(1,t.tongGripDeg/full);var axis=FV.Cross(a,s).Normalized;if(axis.Length<1e-6f)axis=FV.Up;
  return (FQ.AngleAxis(full*k,axis)*a).Normalized;
 }
 /// The left hand on the reins for jaws at `jaws` with the reins along horizontal `rein`, rising tongElevDeg.
 public static FV Hand(ForgeStrikeTuning t,FV jaws,FV rein){float e=t.tongElevDeg*ForgeFeel.Deg;return jaws+new FV(rein.x*MathF.Cos(e),MathF.Sin(e),rein.z*MathF.Cos(e))*t.tongHandM;}
 /// Elbow bend in degrees (0 = straight) for a two-bone arm reaching from shoulder to hand; -1 when out of reach.
 public static float Bend(FV shoulder,FV hand,float upper=.29f,float fore=.35f){float d=(shoulder-hand).Length;if(d>=upper+fore)return -1;float c=(upper*upper+fore*fore-d*d)/(2*upper*fore);return 180-MathF.Acos(ForgeFeel.Clamp(c,-1,1))/ForgeFeel.Deg;}
}

/// The hearth reach in seconds from the trigger (pure timings; ForgeChoreo.cs plays them).
public static class ForgeHearth {
 public enum Phase { StepOut, Plunge, Heat, Pull, StepBack, Hover, Seat, Done }
 /// Phase at time t; seatAt = when the lay-down may begin (the engine shows the knife heated on the anvil).
 public static Phase At(ForgeStrikeTuning k,float t,float seatAt){
  if(t<k.hearthPlungeAtS)return Phase.StepOut;
  if(t<k.hearthPlungeAtS+k.hearthPlungeS)return Phase.Plunge;
  if(t<k.hearthPullS)return Phase.Heat;
  if(t<k.hearthBackS)return Phase.Pull;
  if(t<k.hearthBackS+k.hearthStepS)return Phase.StepBack;
  if(t<seatAt)return Phase.Hover;
  if(t<seatAt+k.seatS)return Phase.Seat;
  return Phase.Done;
 }
 /// When the smith is back at the anvil.
 public static float BackAt(ForgeStrikeTuning k)=>k.hearthBackS+k.hearthStepS;
 /// Step progress (0 at the anvil stance, 1 at the hearth stance) at time t: smoothstep out and back, each way
 /// taking hearthStepS (at least .5 s, so the .51 m step averages at most about 1 m/s).
 public static float Step(ForgeStrikeTuning k,float t){
  if(t<k.hearthStepS)return ForgeFeel.Smooth(t/k.hearthStepS);
  if(t<k.hearthBackS)return 1;
  return 1-ForgeFeel.Smooth((t-k.hearthBackS)/k.hearthStepS);
 }
 /// Plunge depth (0 = in the jaws above the coals, 1 = buried) at time t.
 public static float Plunge(ForgeStrikeTuning k,float t){
  if(t<k.hearthPlungeAtS)return 0;if(t<k.hearthPlungeAtS+k.hearthPlungeS)return ForgeFeel.Smooth((t-k.hearthPlungeAtS)/k.hearthPlungeS);
  if(t<k.hearthPullS)return 1;return 1-ForgeFeel.Smooth((t-k.hearthPullS)/k.hearthPullDurS);
 }
 /// Bellows handle pull (0..1) at time t: two strokes centred on bellowsPull1S and bellowsPull2S.
 public static float Bellows(ForgeStrikeTuning k,float t){float h=k.bellowsStrokeS*.5f;return Math.Max(Stroke((t-k.bellowsPull1S+h)/k.bellowsStrokeS),Stroke((t-k.bellowsPull2S+h)/k.bellowsStrokeS));}
 static float Stroke(float u){if(u<0||u>1)return 0;return MathF.Sin(u*MathF.PI);}
 /// How much the camera looks at the firebed (0 = the work view, 1 = the firebed) at time t.
 public static float Look(ForgeStrikeTuning k,float t){
  if(t<k.hearthBackS)return ForgeFeel.Smooth(t/(k.hearthStepS*.8f));
  return 1-ForgeFeel.Smooth((t-k.hearthBackS)/(k.hearthStepS*.9f));
 }
}

/// Work framing: frame-to-fit FOV from the HUD-free band, and the projection shift that centres it.
public static class ForgeFraming {
 /// Vertical FOV (deg) that makes a target of targetW x targetH metres at `dist` fill `fill` of the free band
 /// height and at most widthFill of the free band width, clamped to [min, max].
 public static float FitFov(float targetW,float targetH,float dist,float aspect,float bandH,float bandW,float fill,float widthFill,float min,float max){
  bandH=ForgeFeel.Clamp(bandH,.15f,1);bandW=ForgeFeel.Clamp(bandW,.15f,1);dist=Math.Max(.1f,dist);aspect=Math.Max(.2f,aspect);
  float tv=targetH*.5f/dist/(fill*bandH);float tw=targetW*.5f/dist/(widthFill*bandW*aspect);
  float fov=2*MathF.Atan(Math.Max(tv,tw))/ForgeFeel.Deg;return ForgeFeel.Clamp(fov,min,max);
 }
 /// NDC centre of the HUD-free band (x right, y up), from CSS-pixel bands of a cssW x cssH canvas.
 public static void BandCentre(float cssW,float cssH,float top,float right,float bottom,float left,out float x,out float y){
  if(cssW<=0||cssH<=0){x=0;y=0;return;}
  x=ForgeFeel.Clamp((left-right)/cssW,-.6f,.6f);y=ForgeFeel.Clamp((bottom-top)/cssH,-.6f,.6f);
 }
 /// The free band's height and width as fractions of the canvas.
 public static void BandSize(float cssW,float cssH,float top,float right,float bottom,float left,out float h,out float w){
  if(cssW<=0||cssH<=0){h=w=1;return;}h=ForgeFeel.Clamp(1-(top+bottom)/cssH,.15f,1);w=ForgeFeel.Clamp(1-(left+right)/cssW,.15f,1);
 }
 /// Viewport position (0..1, y up) of a point in camera space (x right, y up, z forward) for a vertical FOV, an
 /// aspect and an NDC centre shift; false behind the camera.
 public static bool Viewport(FV cameraSpace,float fov,float aspect,float shiftX,float shiftY,out float vx,out float vy){
  vx=vy=0;if(cameraSpace.z<=1e-4f)return false;float t=MathF.Tan(fov*.5f*ForgeFeel.Deg);
  float nx=cameraSpace.x/(cameraSpace.z*t*aspect)+shiftX,ny=cameraSpace.y/(cameraSpace.z*t)+shiftY;vx=.5f+.5f*nx;vy=.5f+.5f*ny;return true;
 }
 /// A camera (eye, rotation) as a pure transform for the tests and the overlap checks.
 public static FV ToCamera(FV p,FV eye,FQ rot)=>rot.Inverse*(p-eye);
}

/// Walk bob locked to steps: vertical bob at the step rate, sway at the stride rate, a trough (footfall) per step.
public static class ForgeWalkBob {
 /// phase = distance walked / stride (1 = one stride = two steps). Returns the offsets (m, m, deg).
 public static void Sample(ForgeStrikeTuning t,float phase,float amount,out float up,out float side,out float roll){
  float a=2*MathF.PI*phase;up=.0005f*t.bobMm*MathF.Cos(2*a)*amount;side=.0005f*t.bobLateralMm*MathF.Sin(a)*amount;roll=t.bobRollDeg*MathF.Sin(a)*amount;
 }
 /// Number of footfalls (troughs of the vertical bob, at phase .25 and .75 of each stride) between two phases.
 public static int Steps(float from,float to)=>(int)MathF.Floor(to*2-.5f)-(int)MathF.Floor(from*2-.5f);
}
