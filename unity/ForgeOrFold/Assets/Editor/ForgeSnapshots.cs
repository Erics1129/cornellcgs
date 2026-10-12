using System;
using System.Globalization;
using System.IO;
using UnityEditor;
using UnityEditor.SceneManagement;
using UnityEngine;

// Fast visual loop. Batchmode WITH graphics (Metal; no -nographics, no WebGL or IL2CPP build):
//  Unity -batchmode -projectPath <p> -executeMethod ForgeSnapshots.Capture -forgeOut <dir> -forgeFixtures <json> [-logFile <log>]
// Builds the scene in memory (an empty scene plus ForgeWorld, as ForgeBuild does, without saving it or
// touching project settings), enters play mode, steps the real game at the fixture's fixed dt through its
// steps (ForgeSnapshotRig) and writes PNGs plus index.json to -forgeOut, then exits (0 = ok).
// scripts/forge-snapshots.mjs generates the fixtures from the real engine and runs this. Owner: integration.
[InitializeOnLoad]
public static class ForgeSnapshots {
 const string JobKey="ForgeSnapshots.job", DeadlineKey="ForgeSnapshots.deadline";
 static ForgeSnapshots(){
  EditorApplication.playModeStateChanged+=OnPlayMode;
  EditorApplication.update+=Watchdog;
  if(EditorApplication.isPlaying&&SessionState.GetString(JobKey,"")!="")EditorApplication.delayCall+=Begin;
 }
 static string Arg(string name){var a=Environment.GetCommandLineArgs();for(int i=0;i<a.Length-1;i++)if(a[i]==name)return a[i+1];return null;}
 public static void Capture(){
  try{
   string outDir=Arg("-forgeOut"),fixtures=Arg("-forgeFixtures");
   if(string.IsNullOrEmpty(outDir)||string.IsNullOrEmpty(fixtures)||!File.Exists(fixtures))throw new Exception("usage: -forgeOut <dir> -forgeFixtures <fixtures.json>");
   var job=JsonUtility.FromJson<ForgeSnapshotJob>(File.ReadAllText(fixtures));if(job==null||job.steps==null||job.steps.Length==0)throw new Exception("no steps in "+fixtures);
   job.outDir=Path.GetFullPath(outDir);Directory.CreateDirectory(job.outDir);
   SessionState.SetString(JobKey,JsonUtility.ToJson(job));
   SessionState.SetString(DeadlineKey,(EditorApplication.timeSinceStartup+Math.Max(60,job.timeout)+120).ToString(CultureInfo.InvariantCulture));
   EditorSceneManager.NewScene(NewSceneSetup.EmptyScene,NewSceneMode.Single);
   new GameObject("Forge").AddComponent<ForgeWorld>();
   Debug.Log("FORGE_SNAPSHOTS entering play mode: "+job.steps.Length+" steps, "+job.width+"x"+job.height+" at dt "+job.dt);
   EditorApplication.EnterPlaymode();
  }catch(Exception e){Debug.LogError("FORGE_SNAPSHOTS FAILED "+e);EditorApplication.Exit(2);}
 }
 static void OnPlayMode(PlayModeStateChange state){if(state==PlayModeStateChange.EnteredPlayMode&&SessionState.GetString(JobKey,"")!="")Begin();}
 static void Begin(){
  var json=SessionState.GetString(JobKey,"");if(json=="")return;SessionState.EraseString(JobKey);
  var job=JsonUtility.FromJson<ForgeSnapshotJob>(json);
  var world=UnityEngine.Object.FindFirstObjectByType<ForgeWorld>();
  if(world==null){Debug.LogError("FORGE_SNAPSHOTS FAILED no ForgeWorld in play mode");EditorApplication.Exit(3);return;}
  ForgeTime.FixedDelta=job.dt;Time.captureDeltaTime=job.dt;
  var rig=new GameObject("Snapshot rig").AddComponent<ForgeSnapshotRig>();rig.job=job;rig.world=world;
  rig.done=ok=>{Debug.Log("FORGE_SNAPSHOTS "+(ok?"OK ":"FAILED ")+job.outDir);SessionState.EraseString(DeadlineKey);ForgeTime.FixedDelta=0;Time.captureDeltaTime=0;EditorApplication.Exit(ok?0:1);};
 }
 static void Watchdog(){
  var s=SessionState.GetString(DeadlineKey,"");if(s=="")return;
  if(double.TryParse(s,NumberStyles.Float,CultureInfo.InvariantCulture,out var deadline)&&EditorApplication.timeSinceStartup>deadline){SessionState.EraseString(DeadlineKey);Debug.LogError("FORGE_SNAPSHOTS FAILED wall-clock timeout");EditorApplication.Exit(4);}
 }
}
