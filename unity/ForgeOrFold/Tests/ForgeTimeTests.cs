// sources: Assets/Scripts/ForgeTime.cs
// The frozen time policy: hit-stop pause semantics, slow-mo ramp, watchdog, reset.
using System;

static class ForgeTimeTests {
 static int failures, checks;
 static void Check(bool ok,string what){checks++;if(!ok){failures++;Console.WriteLine("FAIL ForgeTimeTests: "+what);}}
 static int Main(){
  // The pause behaves exactly like the original `if(freeze>0){freeze-=raw;return;}`.
  foreach(float raw in new[]{1/120f,1/60f,1/144f,.033f}){
   var t=new ForgeTime();t.HitStop(.06f);float legacy=.06f;int frames=0,legacyFrames=0;
   for(int i=0;i<40;i++){bool held=t.Step(raw);if(held)frames++;bool old=legacy>0;if(old){legacy-=raw;legacyFrames++;}Check(held==old,$"frame {i} at dt {raw}: pause differs from the original freeze");}
   Check(frames==legacyFrames&&frames>0,"pause frame count");Check(t.Scale==1,"a strike-only hit-stop leaves the world scale at 1");
  }
  // A world-freezing hit-stop holds Scale at 0 for its length, then returns to 1.
  {var t=new ForgeTime();t.HitStop(.05f,true);float ms=0;while(t.Step(.001f)){Check(t.Scale==0,"world frozen during the hit-stop");ms++;}Check(ms>=49&&ms<=51,"hit-stop length "+ms);t.Step(.001f);Check(t.Scale==1,"scale back to 1");}
  // Shatter slow-mo: .35 for 250 ms, then a 120 ms ramp to 1.
  {var t=new ForgeTime();t.SlowMo(.35f,.25f,.12f);float time=0;float last=0;bool rampSeen=false;
   while(time<.5f){t.Step(.004f);time+=.004f;if(time<.249f)Check(Math.Abs(t.Scale-.35f)<1e-5f,"slow-mo scale");if(time>.254f&&time<.366f){Check(t.Scale>=last-1e-5f&&t.Scale<=1,"ramp rises");rampSeen=true;}last=t.Scale;}
   Check(rampSeen&&t.Scale==1,"slow-mo ends at 1");}
  // Watchdog: a scale stuck below 1 for more than 600 ms of real time is forced back to 1.
  {var t=new ForgeTime();float applied=0,time=0;while(time<.59f){applied=t.Watch(.01f,0);time+=.01f;}Check(applied==0,"watchdog waits 600 ms");for(int i=0;i<3;i++)applied=t.Watch(.01f,applied);Check(applied==1,"watchdog forces 1 after 600 ms");
   Check(t.Watch(.5f,.5f)==.5f&&t.Watch(.05f,1)==1&&t.Watch(.5f,.5f)==.5f,"watchdog resets when the scale returns to 1");}
  {var t=new ForgeTime();t.HitStop(5,true);t.SlowMo(.2f,5,1);float time=0,scale=0;for(int i=0;i<100;i++){t.Step(.01f);scale=t.Watch(.01f,t.Scale);time+=.01f;if(scale==1)break;}Check(scale==1&&time<=.62f,"a runaway stop is cut by the watchdog");Check(!t.Paused,"watchdog clears the pause");}
  // Reset (focus loss, pause) clears every stop.
  {var t=new ForgeTime();t.HitStop(1,true);t.SlowMo(.3f,1,1);t.Reset();Check(!t.Paused&&t.Scale==1,"reset");t.Step(.01f);Check(t.Scale==1,"reset stays at 1");}
  // QA fixed delta.
  Check(ForgeTime.Raw(.02f)==.02f,"real delta by default");ForgeTime.FixedDelta=1/120f;Check(ForgeTime.Raw(.5f)==1/120f,"fixed delta override");ForgeTime.FixedDelta=0;
  if(failures>0){Console.WriteLine($"FAIL ForgeTimeTests: {failures} of {checks} checks failed");return 1;}
  Console.WriteLine($"PASS ForgeTimeTests ({checks} checks)");return 0;
 }
}
