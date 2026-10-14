using System.IO;
using UnityEditor;
using UnityEngine;

namespace CarrotTD {
 /// <summary>
 /// Import settings for the audio stream's subfolders of Resources/Carrot/Audio (Synth/ layers, Variants/ banks and any
 /// future subfolder), applied on every import so a regenerated .meta can never ship default settings. The top-level clips
 /// keep their existing settings (CarrotModels.ConfigureAudio is non-recursive and owns them). Everything here is a short
 /// one-shot: mono, decompressed on load (no first-play decode hitch), Vorbis q0.5; synth layers keep their 24 kHz rate.
 /// </summary>
 public sealed class CarrotAudioImport : AssetPostprocessor {
  public const string Root="Assets/Resources/Carrot/Audio/";
  public static bool Owned(string path){path=path.Replace('\\','/');if(!path.StartsWith(Root))return false;string rest=path.Substring(Root.Length);return rest.Contains("/")&&!rest.StartsWith("Music~")&&!rest.StartsWith("Licenses/");}
  void OnPreprocessAudio(){if(Owned(assetPath))Apply((AudioImporter)assetImporter,assetPath);}
  public static bool Apply(AudioImporter importer,string path){
   bool synth=path.Replace('\\','/').Contains("/Synth/");
   var s=importer.defaultSampleSettings;
   bool changed=!importer.forceToMono||importer.loadInBackground||s.loadType!=AudioClipLoadType.DecompressOnLoad||!s.preloadAudioData||s.compressionFormat!=AudioCompressionFormat.Vorbis||Mathf.Abs(s.quality-.5f)>.001f||s.sampleRateSetting!=(synth?AudioSampleRateSetting.PreserveSampleRate:AudioSampleRateSetting.OptimizeSampleRate);
   importer.forceToMono=true;importer.loadInBackground=false;
   s.loadType=AudioClipLoadType.DecompressOnLoad;s.preloadAudioData=true;s.compressionFormat=AudioCompressionFormat.Vorbis;s.quality=.5f;
   s.sampleRateSetting=synth?AudioSampleRateSetting.PreserveSampleRate:AudioSampleRateSetting.OptimizeSampleRate;
   importer.defaultSampleSettings=s;return changed;
  }
  /// <summary>Batch entry (carrot-unity-build --method CarrotTD.CarrotAudioImport.Configure): reapplies and reports.</summary>
  [MenuItem("Carrot/Audio/Reapply audio import settings")]
  public static void Configure(){
   int count=0,changed=0;
   foreach(var file in Directory.GetFiles(Root.TrimEnd('/'),"*.*",SearchOption.AllDirectories)){
    var path=file.Replace('\\','/');if(!Owned(path)||path.EndsWith(".meta"))continue;
    if(!(AssetImporter.GetAtPath(path) is AudioImporter importer))continue;count++;
    if(Apply(importer,path)){changed++;importer.SaveAndReimport();}
   }
   Debug.Log("CARROT_AUDIO_IMPORT files="+count+" changed="+changed);
  }
 }
}
