using System.IO;
using UnityEditor;
using UnityEngine;
using UnityEngine.Timeline;

namespace CarrotTD {
/// <summary>Authors the boss-entrance Timeline deterministically so the beat is editable in the Timeline window and versioned as an asset.</summary>
public static class CarrotCinematicsAuthoring {
 const string Folder="Assets/Resources/Carrot/Cinematics";
 public static void Prepare(){
  Directory.CreateDirectory(Folder);AssetDatabase.Refresh();
  var dust=Signal("bossDust");var roar=Signal("bossRoar");var ring=Signal("bossRing");
  string path=Folder+"/BossEntrance.playable";AssetDatabase.DeleteAsset(path);
  var timeline=ScriptableObject.CreateInstance<TimelineAsset>();timeline.name="BossEntrance";AssetDatabase.CreateAsset(timeline,path);
  timeline.durationMode=TimelineAsset.DurationMode.FixedLength;timeline.fixedDuration=2.4;
  var camera=timeline.CreateTrack<CinemachineTrack>(null,"Boss hero shot");var clip=camera.CreateClip<CinemachineShot>();clip.start=0;clip.duration=2.4;clip.displayName="Hero shot";
  var shot=(CinemachineShot)clip.asset;shot.VirtualCamera.exposedName="vcamBoss";EditorUtility.SetDirty(shot);
  var beats=timeline.CreateTrack<SignalTrack>(null,"Beats");Emit(beats,dust,.10);Emit(beats,roar,.35);Emit(beats,ring,1.30);
  EditorUtility.SetDirty(timeline);AssetDatabase.SaveAssets();AssetDatabase.Refresh();
  Debug.Log("CARROT_CINEMATICS BossEntrance.playable 2.4 s, 3 signals");
 }
 static SignalAsset Signal(string name){string path=Folder+"/"+name+".signal";var asset=AssetDatabase.LoadAssetAtPath<SignalAsset>(path);if(asset==null){asset=ScriptableObject.CreateInstance<SignalAsset>();asset.name=name;AssetDatabase.CreateAsset(asset,path);}return asset;}
 static void Emit(SignalTrack track,SignalAsset asset,double time){var marker=track.CreateMarker<SignalEmitter>(time);marker.asset=asset;marker.retroactive=false;marker.emitOnce=false;marker.name=asset.name;}
}
}
