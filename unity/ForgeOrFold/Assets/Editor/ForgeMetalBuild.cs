using UnityEditor;
using UnityEditor.Build;
using UnityEditor.Build.Reporting;
using UnityEngine;

// Owner: hot-metal-vfx. The particle shaders (Forge/ParticleAdd, Forge/ParticleLit) are only ever created at runtime
// with Shader.Find, so a player build strips them unless they are in GraphicsSettings' always-included list.
// ForgeBuild.Prepare's list predates them; this pre-build step adds them to every player build (idempotent), so the
// scale flakes and sparks cannot silently vanish if the integrator's list is not updated. Folding these names into
// ForgeBuild's list at integration makes this file redundant but harmless.
public class ForgeMetalBuild:IPreprocessBuildWithReport {
 public int callbackOrder=>0;
 public void OnPreprocessBuild(BuildReport report){Include(ForgeContract.Shaders.ParticleAdd,ForgeContract.Shaders.ParticleLit);}
 public static void Include(params string[] names){
  var graphics=new SerializedObject(AssetDatabase.LoadAllAssetsAtPath("ProjectSettings/GraphicsSettings.asset")[0]);
  var shaders=graphics.FindProperty("m_AlwaysIncludedShaders");bool changed=false;
  foreach(var name in names){
   var shader=Shader.Find(name);if(shader==null){Debug.LogWarning("ForgeMetalBuild: shader "+name+" not found");continue;}
   bool found=false;for(int i=0;i<shaders.arraySize;i++)if(shaders.GetArrayElementAtIndex(i).objectReferenceValue==shader)found=true;
   if(!found){shaders.InsertArrayElementAtIndex(shaders.arraySize);shaders.GetArrayElementAtIndex(shaders.arraySize-1).objectReferenceValue=shader;changed=true;}
  }
  if(changed){graphics.ApplyModifiedProperties();AssetDatabase.SaveAssets();Debug.Log("ForgeMetalBuild: always-included "+string.Join(", ",names));}
 }
}
