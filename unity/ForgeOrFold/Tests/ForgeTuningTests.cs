// sources: Assets/Scripts/ForgeTuning.cs Assets/Scripts/ForgeFeel.cs Assets/Scripts/ForgeHeatMath.cs Assets/Scripts/ForgeFlicker.cs
// Tune JSON envelope: compiled-in defaults, and balance floors that no override can break.
using System;

static class ForgeTuningTests {
 static int failures, checks;
 static void Check(bool ok,string what){checks++;if(!ok){failures++;Console.WriteLine("FAIL ForgeTuningTests: "+what);}}
 /// Protected Flow strikes in a window of `windowMs` at a cycle of `cycleMs` (first strike starts the window).
 static int FlowStrikes(float windowMs,float cycleMs)=>(int)Math.Floor((windowMs-.001f)/cycleMs)+1;
 static int Main(){
  var t=new ForgeTuning();t.Clamp();
  Check(t.strike.cycleMs==640&&t.strike.flowCycleMs==595&&t.strike.minImpactGapMs==400,"defaults");
  Check(t.strike.windupMs+t.strike.apexHoldMs+t.strike.downstrokeMs==190,"normal contact at 190 ms");
  Check(t.strike.flowWindupMs+t.strike.flowDownstrokeMs==125,"Flow contact at 125 ms");
  Check(t.strike.traumaEvolution>0&&t.strike.traumaShatter>0,"trauma only for evolution and shatter");
  Check(t.room.reducedFlickerAmp<=.04f,"reduced flicker at most 4%");
  // Balance floors: a JSON override can slow strikes down but never speed them past the balance values.
  var fast=new ForgeTuning();fast.strike.cycleMs=200;fast.strike.flowCycleMs=300;fast.strike.minImpactGapMs=100;fast.Clamp();
  Check(fast.strike.cycleMs==ForgeTuning.MinCycleMs,"normal cycle floor");Check(fast.strike.flowCycleMs==ForgeTuning.MinFlowCycleMs,"Flow cycle floor");Check(fast.strike.minImpactGapMs==ForgeTuning.MinImpactGapMs,"impact gap floor");
  var slow=new ForgeTuning();slow.strike.flowCycleMs=900;slow.strike.cycleMs=5000;slow.Clamp();Check(slow.strike.flowCycleMs==ForgeTuning.MaxFlowCycleMs&&slow.strike.cycleMs==ForgeTuning.MaxCycleMs,"cycle ceilings");
  var bad=new ForgeTuning();bad.strike.cycleMs=float.NaN;bad.strike.flowCycleMs=float.PositiveInfinity;bad.strike.windupMs=-5;bad.room.reducedFlickerAmp=.5f;bad.strike=bad.strike;bad.Clamp();
  Check(bad.strike.cycleMs==640&&bad.strike.flowCycleMs==595&&bad.strike.windupMs==105&&bad.room.reducedFlickerAmp<=.04f,"NaN, infinity and negatives fall back");
  var none=new ForgeTuning{strike=null,metal=null,room=null};none.Clamp();Check(none.strike!=null&&none.metal!=null&&none.room!=null&&none.strike.flowCycleMs==595,"missing sections get defaults");
  // Flow balance: anywhere in the clamp range keeps the live 7 protected strikes in 4 s and 9 in Quiet tide's 5 s.
  for(float c=ForgeTuning.MinFlowCycleMs;c<=ForgeTuning.MaxFlowCycleMs;c+=.5f){Check(FlowStrikes(4000,c)==7,"4 s Flow window at "+c+" ms");Check(FlowStrikes(5000,c)==9,"5 s Flow window at "+c+" ms");}
  Check(ForgeTuning.MinImpactGapMs>=350,"above the engine replay floor (RULES.replayMinHitMs 350)");
  // Every hit-stop stays below a Flow cycle.
  var h=new ForgeTuning();h.strike.hitStopShatter=10000;h.Clamp();Check(h.strike.hitStopShatter<=250,"hit-stop cap");
  if(failures>0){Console.WriteLine($"FAIL ForgeTuningTests: {failures} of {checks} checks failed");return 1;}
  Console.WriteLine($"PASS ForgeTuningTests ({checks} checks)");return 0;
 }
}
