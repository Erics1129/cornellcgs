using System;
using System.IO;
using UnityEditor;
using UnityEditor.Build;
using UnityEditor.Build.Reporting;
using UnityEngine;

namespace CarrotTD {
 /// <summary>Determinism harness build: the committed scene with the shipped player settings plus CARROT_QA (so the
 /// CarrotDet probe exists) into output/carrot-det. It skips CarrotBuild.Prepare, which refuses to run without the
 /// licensed Asuna and VFX sources; those only change presentation, never the simulation compiled into the player.</summary>
 public static class CarrotDetBuild {
  public static void WebDet(){
   var target=NamedBuildTarget.WebGL;var defines=PlayerSettings.GetScriptingDefineSymbols(target);
   Debug.Log("CARROT_DET_BUILD settings compression="+PlayerSettings.WebGL.compressionFormat+" fallback="+PlayerSettings.WebGL.decompressionFallback+" codegen="+PlayerSettings.GetIl2CppCodeGeneration(target)+" stripping="+PlayerSettings.GetManagedStrippingLevel(target)+" defines="+defines);
   var output=Path.GetFullPath("../../output/carrot-det");Directory.CreateDirectory(output);
   PlayerSettings.SetScriptingDefineSymbols(target,string.IsNullOrEmpty(defines)?"CARROT_QA":defines+";CARROT_QA");
   try {
    var report=BuildPipeline.BuildPlayer(new BuildPlayerOptions{scenes=new[]{"Assets/Scenes/Carrot.unity"},locationPathName=output,target=BuildTarget.WebGL,options=BuildOptions.None});
    if(report.summary.result!=BuildResult.Succeeded)throw new Exception("Carrot determinism Web build failed: "+report.summary.result);
    Debug.Log("CARROT_DET_BUILD_OK "+report.summary.totalSize);
   } finally { PlayerSettings.SetScriptingDefineSymbols(target,defines); }
  }
 }
}
