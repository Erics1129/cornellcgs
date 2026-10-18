using System;
using System.IO;
using UnityEditor;
using UnityEditor.Build;
using UnityEditor.Build.Reporting;
using UnityEngine;

namespace CarrotTD {
 /// <summary>
 /// Duo/endless presentation QA player: the committed scene (Assets/Scenes/Carrot.unity, never re-saved) with the shipped player
 /// settings plus the CARROT_QA define (extraScriptingDefines, so PlayerSettings are never written), into output/carrot-qa so the dev page's ?carrot-qa loads it (player name carrot-qa) and
 /// scripts/carrot-duo-qa/harness.html can drive CarrotView.DuoQa. CarrotBuild.Prepare is skipped: it refuses to run without the
 /// licensed Asuna and effect sources (git-ignored, absent in this workspace); those only change presentation of L29 and the
 /// licensed effect layer. ProjectSettings are only read and logged (compression stays gzip with the decompression fallback).
 /// CARROT_DUO_QA_OUT (a folder name under output/) builds a second player, e.g. the pre-change baseline "carrot-qa-base".
 /// </summary>
 public static class CarrotDuoBuild {
  public static void WebQaDuo(){
   var target=NamedBuildTarget.WebGL;var defines=PlayerSettings.GetScriptingDefineSymbols(target);
   string folder=Environment.GetEnvironmentVariable("CARROT_DUO_QA_OUT");if(string.IsNullOrEmpty(folder)||folder.IndexOfAny(new[]{'/','\\','.'})>=0)folder="carrot-qa";
   Debug.Log("CARROT_DUO_QA_BUILD settings compression="+PlayerSettings.WebGL.compressionFormat+" fallback="+PlayerSettings.WebGL.decompressionFallback+" runInBackground="+PlayerSettings.runInBackground+" maxMemory="+PlayerSettings.WebGL.maximumMemorySize+" defines="+defines+" out="+folder);
   if(PlayerSettings.WebGL.compressionFormat!=WebGLCompressionFormat.Gzip||!PlayerSettings.WebGL.decompressionFallback)throw new Exception("Carrot duo QA build: ProjectSettings must keep gzip with the decompression fallback");
   var output=Path.GetFullPath("../../output/"+folder);Directory.CreateDirectory(output);
   // extraScriptingDefines adds CARROT_QA to this player build only: PlayerSettings (and ProjectSettings.asset) are never written.
   var report=BuildPipeline.BuildPlayer(new BuildPlayerOptions{scenes=new[]{"Assets/Scenes/Carrot.unity"},locationPathName=output,target=BuildTarget.WebGL,options=BuildOptions.None,extraScriptingDefines=new[]{"CARROT_QA"}});
   if(report.summary.result!=BuildResult.Succeeded)throw new Exception("Carrot duo QA Web build failed: "+report.summary.result);
   CarrotBuild.WriteReport(report,"duo-qa");
   Debug.Log("CARROT_DUO_QA_BUILD_OK "+report.summary.totalSize+" "+output);
  }
 }
}
