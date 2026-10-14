#if UNITY_EDITOR
using System;
using System.Collections.Generic;
using UnityEngine;
namespace CarrotTD {
 public sealed partial class CarrotAudio {
  static Func<int,string,float,int> musicTestPlay;
  static Action<int> musicTestStop;
  static Action<string> musicTestUnload;
  /// <summary>Exercises the production Transition/ReleaseSlot methods with a browser-buffer ownership fake.</summary>
  public static void MusicTransitionRegression() {
   var go=new GameObject("CarrotMusicTransitionTest");go.SetActive(false);
   var audio=go.AddComponent<CarrotAudio>();
   var decoded=new HashSet<string>{"MusicExplore","MusicAsuna","MusicGarden"};
   var browserSlots=new string[]{"MusicExplore","MusicAsuna"};
   var unloaded=new List<string>();bool refusePlay=false;
   musicTestPlay=(slot,name,gain)=>{if(refusePlay||!decoded.Contains(name))return 0;browserSlots[slot]=name;return 1;};
   musicTestStop=slot=>browserSlots[slot]=null;
   musicTestUnload=name=>{if(Array.IndexOf(browserSlots,name)>=0)throw new Exception("Unloading a live music buffer: "+name);decoded.Remove(name);unloaded.Add(name);};
   Action<bool,string> check=(condition,message)=>{if(!condition)throw new Exception("CARROT MUSIC TEST: "+message);};
   try {
    audio.unlocked=true;audio.targetA=false;audio.playing="MusicAsuna";
    audio.slotTrack[0]="MusicExplore";audio.slotTrack[1]="MusicAsuna";
    foreach(string name in decoded)audio.musicReady.Add(name);
    audio.Transition("MusicExplore",1.7f);
    check(audio.playing=="MusicExplore"&&audio.targetA&&browserSlots[0]=="MusicExplore","quick retry starts the decoded track already in the destination slot");
    check(decoded.Contains("MusicExplore")&&audio.musicReady.Contains("MusicExplore")&&!unloaded.Contains("MusicExplore"),"retry preserves requested buffer ownership");
    check(browserSlots[1]=="MusicAsuna","crossfade keeps the current track until its fade ends");
    audio.ReleaseSlot(1);
    check(!decoded.Contains("MusicAsuna")&&!audio.musicReady.Contains("MusicAsuna"),"the completed old fade releases both caches");

    // Failed playback must not switch the fade target to an empty destination.
    refusePlay=true;audio.blend=.8f;audio.Transition("MusicGarden",2);
    check(audio.targetA&&audio.playing=="MusicExplore"&&audio.blend==.8f&&browserSlots[0]=="MusicExplore","failed start leaves the playing track and fade target intact");
    check(audio.slotTrack[1]==null,"failed start does not claim an active slot");
    refusePlay=false;audio.Transition("MusicGarden",2);
    check(!audio.targetA&&audio.playing=="MusicGarden"&&browserSlots[1]=="MusicGarden"&&audio.blend==0,"failed start can retry successfully");
    audio.ReleaseSlot(0);
    check(!decoded.Contains("MusicExplore")&&!audio.musicReady.Contains("MusicExplore"),"normal release does not pin the retry buffer forever");

    // A track shared by both slots is retained until the second reference goes away.
    audio.slotTrack[0]="MusicGarden";browserSlots[0]="MusicGarden";
    audio.ReleaseSlot(0);check(decoded.Contains("MusicGarden"),"shared track survives the first release");
    audio.ReleaseSlot(1);check(!decoded.Contains("MusicGarden")&&!audio.musicReady.Contains("MusicGarden"),"last slot release unloads the shared buffer");
    Debug.Log("CARROT_MUSIC_TRANSITION_OK quick retry, failed-start recovery and shared-buffer cleanup");
   } finally {
    musicTestPlay=null;musicTestStop=null;musicTestUnload=null;
    UnityEngine.Object.DestroyImmediate(go);
   }
  }
 }
}
#endif
