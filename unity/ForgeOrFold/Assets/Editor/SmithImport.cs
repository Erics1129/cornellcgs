using UnityEditor;
using UnityEditor.Animations;
using UnityEngine;
using System.Linq;
public static class SmithImport {
 public static void Prepare(){
  const string root="Assets/Resources/Smith/";
  var model=(ModelImporter)AssetImporter.GetAtPath(root+"Model.fbx");model.animationType=ModelImporterAnimationType.Human;model.avatarSetup=ModelImporterAvatarSetup.CreateFromThisModel;model.optimizeGameObjects=false;model.isReadable=true;model.materialImportMode=ModelImporterMaterialImportMode.None;model.SaveAndReimport();
  var avatar=AssetDatabase.LoadAllAssetsAtPath(root+"Model.fbx").OfType<Avatar>().First();
  foreach(var name in new[]{"Idle","Walk","Run"}){var importer=(ModelImporter)AssetImporter.GetAtPath(root+name+".fbx");importer.animationType=ModelImporterAnimationType.Human;importer.avatarSetup=ModelImporterAvatarSetup.CreateFromThisModel;importer.sourceAvatar=null;importer.importAnimation=true;importer.materialImportMode=ModelImporterMaterialImportMode.None;var clips=importer.defaultClipAnimations;foreach(var c in clips){c.name=name;c.loopTime=true;c.loopPose=true;c.lockRootRotation=true;c.lockRootHeightY=true;c.lockRootPositionXZ=true;c.keepOriginalPositionY=true;}importer.clipAnimations=clips;importer.SaveAndReimport();}
  var normal=(TextureImporter)AssetImporter.GetAtPath(root+"Normal.tif");normal.textureType=TextureImporterType.NormalMap;normal.maxTextureSize=1024;normal.SaveAndReimport();
  var albedo=(TextureImporter)AssetImporter.GetAtPath(root+"Albedo.tif");albedo.maxTextureSize=1024;albedo.SaveAndReimport();
  var path=root+"Smith.controller";var controller=AssetDatabase.LoadAssetAtPath<AnimatorController>(path);if(controller!=null)AssetDatabase.DeleteAsset(path);{controller=AnimatorController.CreateAnimatorControllerAtPath(path);controller.AddParameter("Speed",AnimatorControllerParameterType.Float);var state=controller.layers[0].stateMachine.AddState("Locomotion");var tree=new BlendTree{name="Locomotion",blendParameter="Speed",useAutomaticThresholds=false,blendType=BlendTreeType.Simple1D};AssetDatabase.AddObjectToAsset(tree,controller);int n=0;foreach(var name in new[]{"Idle","Walk","Run"}){var clip=AssetDatabase.LoadAllAssetsAtPath(root+name+".fbx").OfType<AnimationClip>().First(c=>!c.name.StartsWith("__"));tree.AddChild(clip,n++);}state.motion=tree;var layers=controller.layers;layers[0].iKPass=true;controller.layers=layers;}
  AssetDatabase.SaveAssets();Debug.Log("SMITH_IMPORT_OK human="+avatar.isHuman+" valid="+avatar.isValid);
 }
}
