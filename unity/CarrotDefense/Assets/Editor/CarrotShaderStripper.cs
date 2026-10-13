using System.Collections.Generic;
using UnityEditor;
using UnityEditor.Build;
using UnityEditor.Rendering;
using UnityEngine;
using UnityEngine.Rendering;

namespace CarrotTD {
/// <summary>Drops URP surface shaders the diorama never draws and lighting features the two pipeline tiers never enable.</summary>
public sealed class CarrotShaderStripper : IPreprocessShaders {
 public int callbackOrder => 50;
 static readonly string[] DroppedShaderPrefixes={"Universal Render Pipeline/","Standard","Legacy Shaders/","Nature/","Mobile/","Particles/","Unlit/","Sprites/","UI/","Hidden/Universal Render Pipeline/Debug","Hidden/Universal Render Pipeline/Terrain","Hidden/Nature","Hidden/TerrainEngine","Skybox/","VR/","AR/","Autodesk","Hidden/Universal Render Pipeline/XR","Hidden/Universal Render Pipeline/HDRDebugView","Hidden/Universal Render Pipeline/LensFlare","Hidden/Universal Render Pipeline/ProbeVolume","Hidden/Universal Render Pipeline/STP","Hidden/Universal Render Pipeline/FSR","Hidden/Universal Render Pipeline/TemporalAA","Hidden/Universal Render Pipeline/MotionBlur","Hidden/Universal Render Pipeline/Decal","Hidden/Universal Render Pipeline/LutBuilderHdr","Hidden/Universal Render Pipeline/PaniniProjection","Hidden/Universal Render Pipeline/CameraMotionVectors","Hidden/Universal Render Pipeline/ObjectMotionVectors","Hidden/Universal Render Pipeline/Edge Adaptive Spatial Upsampling","Hidden/Universal Render Pipeline/BokehDepthOfField","Hidden/Universal Render Pipeline/SubpixelMorphologicalAntialiasing","Hidden/Universal Render Pipeline/ScalingSetup"};
 static readonly HashSet<string> DroppedKeywords=new HashSet<string>{"FOG_EXP","FOG_EXP2","LIGHTMAP_ON","DIRLIGHTMAP_COMBINED","DYNAMICLIGHTMAP_ON","_ADDITIONAL_LIGHT_SHADOWS","_LIGHT_LAYERS","_CLUSTER_LIGHT_LOOP","_FORWARD_PLUS","DEBUG_DISPLAY","_REFLECTION_PROBE_BLENDING","_REFLECTION_PROBE_BOX_PROJECTION","_DBUFFER_MRT1","_DBUFFER_MRT2","_DBUFFER_MRT3","PROBE_VOLUMES_L1","PROBE_VOLUMES_L2","SHADOWS_SHADOWMASK","LIGHTMAP_SHADOW_MIXING","_WRITE_RENDERING_LAYERS","USE_LEGACY_LIGHTMAPS","LOD_FADE_CROSSFADE","_CASTING_PUNCTUAL_LIGHT_SHADOW","_SHADOWS_SOFT_HIGH"};
 static int kept,dropped;
 public void OnProcessShader(Shader shader,ShaderSnippetData snippet,IList<ShaderCompilerData> data) {
  string name=shader.name;
  foreach(var prefix in DroppedShaderPrefixes)if(name.StartsWith(prefix)&&!name.StartsWith("Carrot/")){dropped+=data.Count;data.Clear();Report();return;}
  for(int i=data.Count-1;i>=0;i--){
   bool drop=false;foreach(var keyword in data[i].shaderKeywordSet.GetShaderKeywords()){if(DroppedKeywords.Contains(keyword.name)){drop=true;break;}}
   if(drop){data.RemoveAt(i);dropped++;}else kept++;
  }
  Report();
 }
 static void Report(){if((kept+dropped)%500==0)Debug.Log("CARROT_SHADER_STRIP kept="+kept+" dropped="+dropped);}
}
}
