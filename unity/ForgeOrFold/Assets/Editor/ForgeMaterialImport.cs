using UnityEditor;
using UnityEngine;
using System.IO;
// Split the generated atlas reproducibly as part of the game's asset pipeline.
public static class ForgeMaterialImport {
 public static void Prepare(){
  string source="Assets/ArtSource/MaterialsV2.png";if(!File.Exists(source))return;
  var atlas=new Texture2D(2,2,TextureFormat.RGBA32,false);atlas.LoadImage(File.ReadAllBytes(source));int size=atlas.width/2;
  string[] names={"SteelV2","LeatherV2","WoodV2","StoneV2"};
  for(int i=0;i<4;i++){
   string path="Assets/Resources/Forge/"+names[i]+".png";
   if(!File.Exists(path)||File.GetLastWriteTimeUtc(source)>File.GetLastWriteTimeUtc(path)){
    var tile=new Texture2D(size,size,TextureFormat.RGB24,false);tile.SetPixels(atlas.GetPixels(i%2*size,i/2*size,size,size));tile.Apply();File.WriteAllBytes(path,tile.EncodeToPNG());Object.DestroyImmediate(tile);
   }
   AssetDatabase.ImportAsset(path);var t=(TextureImporter)AssetImporter.GetAtPath(path);t.maxTextureSize=1024;t.textureCompression=TextureImporterCompression.Compressed;t.mipmapEnabled=true;t.wrapMode=TextureWrapMode.Repeat;t.anisoLevel=4;t.SaveAndReimport();
  }
  Object.DestroyImmediate(atlas);
 }
}
