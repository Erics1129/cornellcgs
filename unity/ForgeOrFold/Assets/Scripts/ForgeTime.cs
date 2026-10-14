using System;

/// FROZEN time policy (pure C#, System only; tested by Tests/ForgeTimeTests.cs).
/// The strike timeline, camera, input, telemetry and quality run on unscaled time. Hit-stop pauses the
/// strike timeline explicitly (Paused); world effects (particles, physics, Animator, fire, knife jitter)
/// follow Time.timeScale, which ForgeWorld.Update sets from Scale and nobody else writes.
/// A watchdog returns the scale to 1 when it has stayed below 1 for more than 600 ms of real time.
public sealed class ForgeTime {
 public const float WatchdogSeconds=.6f;
 /// QA override for the frame's unscaled delta (ForgeSnapshots steps at a fixed dt). 0 = real time.
 public static float FixedDelta;
 public static float Raw(float unscaledDeltaTime)=>FixedDelta>0?FixedDelta:unscaledDeltaTime;

 float pause,freeze,slowLeft,slowScale=1,ramp,rampLeft,below;
 /// The strike timeline is paused this frame (hit-stop).
 public bool Paused=>pause>0;
 public float PauseLeft=>pause;
 /// Time.timeScale the world should run at this frame (1 = normal, 0 = frozen by a hit-stop).
 public float Scale{get;private set;}=1;

 /// Pause the strike timeline for `seconds` of real time. freezeWorld also holds Scale at 0 for that time.
 public void HitStop(float seconds,bool freezeWorld=false){if(seconds>pause)pause=seconds;if(freezeWorld&&seconds>freeze)freeze=seconds;}
 /// Run the world at `scale` for `seconds` of real time, then ramp back to 1 over `rampSeconds`.
 public void SlowMo(float scale,float seconds,float rampSeconds){slowScale=Math.Max(0,Math.Min(1,scale));slowLeft=Math.Max(0,seconds);ramp=Math.Max(0,rampSeconds);rampLeft=ramp;}
 /// Clear every stop (focus loss, pause, watchdog).
 public void Reset(){pause=0;freeze=0;slowLeft=0;rampLeft=0;slowScale=1;below=0;Scale=1;}

 /// Advance one frame of unscaled time. Returns true while the strike timeline is paused; the pause is
 /// tested before it is consumed, exactly like the original `if(freeze>0){freeze-=raw;return;}`.
 public bool Step(float raw){
  bool paused=pause>0;if(paused)pause-=raw;
  if(freeze>0){freeze-=raw;Scale=0;}
  else if(slowLeft>0){slowLeft-=raw;Scale=slowScale;}
  else if(rampLeft>0){rampLeft-=raw;float k=ramp>0?1-Math.Max(0,rampLeft)/ramp:1;Scale=slowScale+(1-slowScale)*k;}
  else Scale=1;
  return paused;
 }
 /// Watchdog over the scale actually applied (Time.timeScale). Returns the scale to apply: `current`,
 /// or 1 (after Reset) once it has been below 1 for more than WatchdogSeconds of real time.
 public float Watch(float raw,float current){if(current<1){below+=raw;if(below>WatchdogSeconds){Reset();return 1;}}else below=0;return current;}
}
