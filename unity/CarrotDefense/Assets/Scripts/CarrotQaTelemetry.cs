#if UNITY_EDITOR || CARROT_QA
using System;
using System.Globalization;
using System.Text;
using UnityEngine;
using UnityEngine.Profiling;
using UnityEngine.Rendering;

namespace CarrotTD {
 /// <summary>
 /// QA-only observer. Attach explicitly to CarrotGame; there is no automatic startup,
 /// command handler, browser hook, or gameplay/quality mutation. These are Unity Update
 /// frame intervals, not a GPU timer; renderInterval reports any rendering decimation.
 /// </summary>
 [DisallowMultipleComponent]
 [AddComponentMenu("Carrot/QA Frame Telemetry")]
 public sealed class CarrotQaTelemetry : MonoBehaviour {
  const double WarmupSeconds=10,WindowSeconds=5;
  static readonly CultureInfo Invariant=CultureInfo.InvariantCulture;
  CarrotGame game;
  float[] samples=new float[2048],ordered=new float[2048];
  int count,level=-1,configurationChanges,firstTier,firstInterval,lastTier,lastInterval;
  float firstScale,lastScale;
  double warmup,windowSeconds,sumSeconds;
  bool focused=true,backgrounded,skipNext=true,subscribed;

  /// <summary>Call from QA scene setup after creating CarrotGame. Idempotent; production has no such type.</summary>
  public static CarrotQaTelemetry Enable(CarrotGame target=null){
   if(target==null)target=UnityEngine.Object.FindFirstObjectByType<CarrotGame>();
   if(target==null){Debug.LogWarning("CARROT_QA_PERF unavailable: no CarrotGame");return null;}
   var observer=target.GetComponent<CarrotQaTelemetry>();
   if(observer==null)observer=target.gameObject.AddComponent<CarrotQaTelemetry>();
   observer.enabled=true;return observer;
  }
  void OnEnable(){
   game=GetComponent<CarrotGame>();focused=Application.isFocused;
   if(game!=null){game.Effect+=Observe;subscribed=true;}
   ResetSession();
  }
  void OnDisable(){if(subscribed&&game!=null)game.Effect-=Observe;subscribed=false;DiscardWindow();}
  void Observe(CarrotEvent e){if(e.type=="level")ResetSession();}
  void ResetSession(){level=game!=null&&game.level!=null?game.level.id:-1;warmup=0;DiscardWindow();}
  void DiscardWindow(){count=0;windowSeconds=0;sumSeconds=0;configurationChanges=0;skipNext=true;}
  void OnApplicationFocus(bool value){focused=value;DiscardWindow();}
  void OnApplicationPause(bool value){backgrounded=value;DiscardWindow();}

  void Update(){
   if(game==null||game.level==null)return;
   if(level!=game.level.id)ResetSession();
   // Unity focus/pause callbacks and the page's pause command suppress hidden time.
   // Ignore the first resumed interval too: it may span the entire hidden period.
   // A real hitch while focused is retained, rather than silently improving the sample.
   if(!focused||backgrounded||!Application.isFocused||game.paused){DiscardWindow();return;}
   if(skipNext){skipNext=false;return;}
   float dt=Time.unscaledDeltaTime;
   if(float.IsNaN(dt)||float.IsInfinity(dt)||dt<=0){DiscardWindow();return;}
   if(warmup<WarmupSeconds){warmup+=dt;return;}
   int tier=CarrotQuality.Tier,interval=OnDemandRendering.renderFrameInterval;float scale=CarrotQuality.RenderScale;
   if(count==0){firstTier=lastTier=tier;firstScale=lastScale=scale;firstInterval=lastInterval=interval;}
   else if(tier!=lastTier||Math.Abs(scale-lastScale)>.0001f||interval!=lastInterval){configurationChanges++;lastTier=tier;lastScale=scale;lastInterval=interval;}
   if(count==samples.Length)Array.Resize(ref samples,samples.Length*2);
   samples[count++]=dt;sumSeconds+=dt;windowSeconds+=dt;
   if(windowSeconds>=WindowSeconds)Report();
  }
  void Report(){
   if(count==0)return;
   if(ordered.Length<count)Array.Resize(ref ordered,samples.Length);
   Array.Copy(samples,ordered,count);Array.Sort(ordered,0,count);
   double meanMs=sumSeconds/count*1000,p95Ms=ordered[Math.Max(0,(int)Math.Ceiling(count*.95)-1)]*1000,maxMs=ordered[count-1]*1000;
   int alive=0;foreach(var enemy in game.enemies)if(enemy.alive)alive++;
   string allocated="na";
   try{long bytes=Profiler.GetTotalAllocatedMemoryLong();if(bytes>0)allocated=(bytes/(1024d*1024d)).ToString("F1",Invariant);}catch(Exception){/* The platform may not expose Unity allocator totals. */}
   var line=new StringBuilder(400).Append("CARROT_QA_PERF level=").Append(level).Append(" phase=").Append(game.phase)
    .Append(" seconds=").Append(windowSeconds.ToString("F2",Invariant)).Append(" frames=").Append(count)
    .Append(" meanMs=").Append(meanMs.ToString("F2",Invariant)).Append(" p95Ms=").Append(p95Ms.ToString("F2",Invariant))
    .Append(" maxMs=").Append(maxMs.ToString("F2",Invariant)).Append(" minFps=").Append((1000/maxMs).ToString("F1",Invariant))
    .Append(" meanFps=").Append((1000/meanMs).ToString("F1",Invariant)).Append(" alive=").Append(alive).Append(" towers=").Append(game.towers.Count)
    .Append(" quality=").Append(CarrotQuality.Name(lastTier)).Append(" renderScale=").Append(lastScale.ToString("F2",Invariant))
    .Append(" renderInterval=").Append(lastInterval).Append(" unityAllocatedMiB=").Append(allocated).Append(" configChanges=").Append(configurationChanges);
   if(configurationChanges>0)line.Append(" startQuality=").Append(CarrotQuality.Name(firstTier)).Append(" startScale=").Append(firstScale.ToString("F2",Invariant)).Append(" startInterval=").Append(firstInterval);
   Debug.Log(line.ToString());
   count=0;windowSeconds=0;sumSeconds=0;configurationChanges=0;
  }
 }
}
#endif
