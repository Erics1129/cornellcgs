using UnityEngine;

namespace CarrotTD {
 /// <summary>
 /// WCAG 2.3.1 (three flashes): at most three large-luminance events in any rolling real-time second. Large means anything that can
 /// change the luminance of a big part of the frame: a scene-lighting point light (intensity 6+), a sky flash, a screen-sized glow
 /// (2.5 u or more), the Super forge's white core, a boss death burst. A request over the budget is not drawn; the caller instead
 /// extends the flash already on screen (one longer flash instead of a strobe). Real time (unscaled) is used, so game speed and
 /// slow motion never let flashes bunch up. Small sprites, sparks and rings are never governed.
 /// </summary>
 public static class CarrotFlashGovernor {
  public const int PerSecond=3;
  static readonly float[] times=new float[PerSecond];static int head;
  public static int Granted{get;private set;}
  public static int Coalesced{get;private set;}
  /// <summary>True when a large flash may start now; records it. False means coalesce into the current one.</summary>
  public static bool Allow(){
   float now=Time.unscaledTime;
   // times[] is a ring of the last three grants; the oldest must be at least a second old for a fourth.
   float oldest=times[head];if(Granted>=PerSecond&&now-oldest<1f){Coalesced++;CarrotQa.Count("flash.coalesced",1);return false;}
   times[head]=now;head=(head+1)%PerSecond;Granted++;CarrotQa.Count("flash.granted",1);return true;
  }
  /// <summary>Large flashes granted within the last real second (for telemetry and tests).</summary>
  public static int Recent(){float now=Time.unscaledTime;int n=0;for(int i=0;i<PerSecond;i++)if(Granted>i&&now-times[i]<1f)n++;return n;}
  public static void Reset(){for(int i=0;i<PerSecond;i++)times[i]=-10;head=0;Granted=0;Coalesced=0;}
 }
}
