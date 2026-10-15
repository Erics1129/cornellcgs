using System.IO;
using UnityEditor;
using UnityEngine;

namespace CarrotTD {
 /// <summary>
 /// Import settings for every clip under Resources/Carrot/Audio, recursively, applied on every import so a regenerated
 /// .meta can never ship default settings. All clips are short one-shots: mono, decompressed on load (no first-play decode
 /// hitch), preloaded, Vorbis.
 /// <list type="bullet">
 /// <item>Top level: exactly the rules CarrotModels.ConfigureAudio has always applied. Creature voices (Voice*, EVoice*) get
 /// q0.5 at 32 kHz; foley gets q0.65 at an optimised rate. Both importers agree, so ConfigureAudio, which is
 /// non-recursive, can be retired by its owner without any change.</item>
 /// <item>Synth/ layers: q0.5 at their own 24 kHz.</item>
 /// <item>Variants/ banks and any other subfolder: q0.5 at an optimised rate.</item>
 /// </list>
 /// Music~ (encoder sources, ignored by Unity) and Licenses/ are skipped.
 /// </summary>
 public sealed class CarrotAudioImport : AssetPostprocessor {
  public const string Root="Assets/Resources/Carrot/Audio/";
  public static bool Owned(string path){path=path.Replace('\\','/');if(!path.StartsWith(Root))return false;string rest=path.Substring(Root.Length);return !rest.StartsWith("Music~")&&!rest.StartsWith("Licenses/");}
  void OnPreprocessAudio(){if(Owned(assetPath))Apply((AudioImporter)assetImporter,assetPath);}
  public static bool Apply(AudioImporter importer,string path){
   path=path.Replace('\\','/');string rest=path.Substring(Root.Length),file=Path.GetFileName(path);
   bool top=!rest.Contains("/"),synth=rest.StartsWith("Synth/"),voice=top&&(file.StartsWith("Voice")||file.StartsWith("EVoice"));
   float quality=top&&!voice?.65f:.5f;
   var rate=voice?AudioSampleRateSetting.OverrideSampleRate:synth?AudioSampleRateSetting.PreserveSampleRate:AudioSampleRateSetting.OptimizeSampleRate;
   var s=importer.defaultSampleSettings;
   bool changed=!importer.forceToMono||importer.loadInBackground||s.loadType!=AudioClipLoadType.DecompressOnLoad||!s.preloadAudioData||s.compressionFormat!=AudioCompressionFormat.Vorbis||Mathf.Abs(s.quality-quality)>.001f||s.sampleRateSetting!=rate||(voice&&s.sampleRateOverride!=32000);
   importer.forceToMono=true;importer.loadInBackground=false;
   s.loadType=AudioClipLoadType.DecompressOnLoad;s.preloadAudioData=true;s.compressionFormat=AudioCompressionFormat.Vorbis;s.quality=quality;
   s.sampleRateSetting=rate;s.sampleRateOverride=voice?32000u:synth?24000u:44100u;
   importer.defaultSampleSettings=s;return changed;
  }
  /// <summary>Batch entry (-executeMethod CarrotTD.CarrotAudioImport.Configure): reapplies and reports.</summary>
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
