using System;

/// FROZEN tuning envelope (pure C#, System only). Every feel number lives in one [Serializable]
/// ForgeTuning with compiled-in defaults. The page sends src/minigames/forge/feel-tuning.json through
/// Tune(json) after 'ready'; JsonUtility overwrites only the fields it names, then Clamp() runs, so the
/// JSON holds overrides and a value can be retuned with a web rebuild instead of a Unity build.
/// Sections are owned by one stream each and defined in that stream's pure file:
///   strike -> ForgeStrikeTuning (ForgeFeel.cs, strike-feel)
///   metal  -> ForgeMetalTuning  (ForgeHeatMath.cs, hot-metal-vfx)
///   room   -> ForgeRoomTuning   (ForgeFlicker.cs, room-light-post)
///   web    -> JSON only, read by the page (web-feel)
/// The balance floors below run after the section clamps and cannot be tuned away.
[Serializable] public class ForgeTuning {
 public int version=1;
 public ForgeStrikeTuning strike=new ForgeStrikeTuning();
 public ForgeMetalTuning metal=new ForgeMetalTuning();
 public ForgeRoomTuning room=new ForgeRoomTuning();

 /// Balance (owner decision to change): contacts at least 640 ms apart normally, 585-605 ms in Flow
 /// (595 keeps 7 protected strikes in a 4 s Flow window and 9 in 5 s), never closer than 400 ms.
 public const float MinCycleMs=640, MaxCycleMs=900, MinFlowCycleMs=585, MaxFlowCycleMs=605, MinImpactGapMs=400;

 public void Clamp(){
  if(strike==null)strike=new ForgeStrikeTuning();if(metal==null)metal=new ForgeMetalTuning();if(room==null)room=new ForgeRoomTuning();
  strike.Clamp();metal.Clamp();room.Clamp();
  strike.cycleMs=Fit(strike.cycleMs,MinCycleMs,MaxCycleMs,640);
  strike.flowCycleMs=Fit(strike.flowCycleMs,MinFlowCycleMs,MaxFlowCycleMs,595);
  strike.minImpactGapMs=Fit(strike.minImpactGapMs,MinImpactGapMs,MinFlowCycleMs,MinImpactGapMs);
 }
 /// Clamp to [min, max]; NaN or infinity becomes `fallback`.
 public static float Fit(float v,float min,float max,float fallback)=>float.IsNaN(v)||float.IsInfinity(v)?fallback:Math.Max(min,Math.Min(max,v));
}
