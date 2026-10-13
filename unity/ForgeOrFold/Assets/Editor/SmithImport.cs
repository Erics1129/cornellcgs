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
  // Normal.tif and Albedo.tif now live in Assets/ArtSource/Unused/Smith: the smith renders with Forge/Glove and
  // LeatherV3, so they only added about 1 MB to the Web data file from Resources.
  var path=root+"Smith.controller";var controller=AssetDatabase.LoadAssetAtPath<AnimatorController>(path);if(controller!=null)AssetDatabase.DeleteAsset(path);{controller=AnimatorController.CreateAnimatorControllerAtPath(path);controller.AddParameter("Speed",AnimatorControllerParameterType.Float);var state=controller.layers[0].stateMachine.AddState("Locomotion");var tree=new BlendTree{name="Locomotion",blendParameter="Speed",useAutomaticThresholds=false,blendType=BlendTreeType.Simple1D};AssetDatabase.AddObjectToAsset(tree,controller);int n=0;foreach(var name in new[]{"Idle","Walk","Run"}){var clip=AssetDatabase.LoadAllAssetsAtPath(root+name+".fbx").OfType<AnimationClip>().First(c=>!c.name.StartsWith("__"));tree.AddChild(clip,n++);}state.motion=tree;var layers=controller.layers;layers[0].iKPass=true;controller.layers=layers;}
  // A humanoid finger layer curls each digit around the tool, independently of arm IK.
  var grip=new AnimationClip{name="Tool grip",frameRate=30};
  foreach(var side in new[]{"Left","Right"})foreach(var digit in new[]{"Thumb","Index","Middle","Ring","Little"})for(int joint=1;joint<=3;joint++){
   string binding=side+"Hand."+digit+"."+joint+" Stretched";
   AnimationUtility.SetEditorCurve(grip,EditorCurveBinding.FloatCurve("",typeof(Animator),binding),AnimationCurve.Constant(0,1,digit=="Thumb"?-.25f:joint==1?-.55f:-.8f));
  }
  var mask=new AvatarMask{name="Fingers only"};for(int i=0;i<(int)AvatarMaskBodyPart.LastBodyPart;i++)mask.SetHumanoidBodyPartActive((AvatarMaskBodyPart)i,false);mask.SetHumanoidBodyPartActive(AvatarMaskBodyPart.LeftFingers,true);mask.SetHumanoidBodyPartActive(AvatarMaskBodyPart.RightFingers,true);
  AssetDatabase.AddObjectToAsset(grip,controller);AssetDatabase.AddObjectToAsset(mask,controller);controller.AddLayer("Tool grip");var gripLayers=controller.layers;var layer=gripLayers[1];layer.defaultWeight=1;layer.avatarMask=mask;layer.stateMachine.AddState("Closed grip").motion=grip;controller.layers=gripLayers;
  AssetDatabase.SaveAssets();Debug.Log("SMITH_IMPORT_OK human="+avatar.isHuman+" valid="+avatar.isValid);
 }
}
