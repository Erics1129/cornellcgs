using UnityEngine;

/// Rebuilds the off-axis projection right before each render (the snapshot rig changes the aspect per
/// render), so the strike point sits in the middle of the HUD-free band and FOV changes stay live.
[RequireComponent(typeof(Camera))]
public class ForgeCameraRig:MonoBehaviour {
 public ForgeWorld forge;
 void OnPreCull(){if(forge!=null)forge.ApplyProjection(GetComponent<Camera>());}
}

// Owner: strike-feel. The first-person camera: work framing (frame-to-fit FOV from Insets, band-centred
// projection), the directional kick, FOV punch and trauma shake on impacts, the head dip on the downstroke,
// step-locked walk bob, drag-look smoothing, the hearth glance, risk push-in and the anvil label re-send.
public partial class ForgeWorld {
 float camFov=42,camFovV,kickPitch,kickPitchV,kickDrop,kickDropV,kickRoll,kickRollV,fovPunch,fovPunchV,trauma,riskPush,headDip;
 float bobPhase,bobAmount,labelClock,settleClock,shakeTime;Vector3 lastCamPos;Quaternion lastCamRot=Quaternion.identity,camBaseRot=Quaternion.identity;
 bool labelsDirty=true,camInit;float shiftX,shiftY,appliedFov;
 /// 0..1: how far the body leans into the work (PoseSmith pitches the body by spineLeanDeg times this).
 float workLean;
 /// The camera pose before kick, shake and dip (for the label positions and QA).
 Vector3 camBasePos;
 ForgeStrikeTuning K=>tuning.strike;
 /// The work view looks at the strike point, shifted frameShiftX along the anvil (toward the tongs) so the whole knife,
 /// from the jaws to the tip, and the hammer sit inside a narrow (portrait) frame.
 Vector3 WorkLookAt=>ForgeLayout.WorkLook+Vector3.right*K.frameShiftX;

 /// Vertical FOV of the work view: frame the work (blade, hammer apex, jaws) into the HUD-free band.
 float WorkFov(){var k=K;float dist=Vector3.Distance(ForgeLayout.WorkEye,WorkLookAt);float aspect=Mathf.Max(.2f,(float)Screen.width/Mathf.Max(1,Screen.height));
  if(view.cssW>0&&view.cssH>0){aspect=view.cssW/view.cssH;ForgeFraming.BandSize(view.cssW,view.cssH,view.top,view.right,view.bottom,view.left,out float bh,out float bw);return ForgeFraming.FitFov(k.frameTargetW,k.frameTargetH,dist,aspect,bh,bw,k.frameFill,k.frameWidthFill,k.fovMin,k.fovMax);}
  return view.Portrait?k.fovPortrait:view.Landscape?k.fovLandscape:Narrow?(aspect<1?k.fovPortrait:k.fovLandscape):k.fovDesktop;}
 float WalkFov(){var k=K;return view.Portrait?k.fovPortraitWalk:view.Landscape?k.fovLandscapeWalk:Narrow?k.fovPortraitWalk:k.fovDesktopWalk;}
 /// The work view eye for the smith standing at `stance` with yaw `yaw`.
 Vector3 WorkEyeAt(Vector3 stance,float yaw)=>stance+Quaternion.Euler(0,yaw,0)*(Vector3.up*ForgeLayout.EyeHeight+ForgeLayout.WorkLean);

 /// Contact-frame camera response. Reduced motion: no trauma, no FOV punch, kick at 25%; Motion 'off': no kick either.
 void CameraImpact(string outcome,bool evolution,bool guarded){
  var k=K;ForgeFeel.Kick(k,outcome,evolution,guarded,out float pitch,out float drop,out float roll);
  float scale=motionOff?0:reduced?k.reducedKickScale:1;
  // Applied on the contact frame as a displacement: the critically damped spring returns it (<= 5% left after 160 ms).
  kickPitch=pitch*scale;kickPitchV=0;kickDrop=.001f*drop*scale;kickDropV=0;kickRoll=roll*scale*(ForgeFeel.Hash(state!=null?state.totalHits:0,5)>0?1:-1);kickRollV=0;
  if(!reduced){fovPunch=ForgeFeel.FovPunch(k,outcome,evolution);fovPunchV=0;trauma=Mathf.Min(1,trauma+ForgeFeel.Trauma(k,outcome,evolution));}
 }

 void UpdateSmithCamera(float dt){
  if(smith==null||cam==null)return;var k=K;
  if(!camInit){camInit=true;camFov=WorkFov();lastCamPos=cam.transform.position;lastCamRot=cam.transform.rotation;}
  bool atWork=workFocus&&route==null&&AtAnvil();
  workLean=Mathf.MoveTowards(workLean,atWork||hearth!=null&&!hearth.fade?1:0,dt/.35f);
  // ---- base pose ----
  Vector3 eye;Quaternion rot;float fovTarget;
  if(hearth!=null&&!hearth.fade){
   // Hearth reach: the eye rides the step; the view turns from the work to the firebed and back.
   var yaw=smith.eulerAngles.y;eye=WorkEyeAt(smith.position,yaw);
   float look=ForgeHearth.Look(k,hearth.t);var target=Vector3.Lerp(WorkLookAt,ForgeLayout.Firebed+new Vector3(0,.02f,.02f),look);
   rot=Quaternion.LookRotation(target-eye);fovTarget=Mathf.Lerp(WorkFov(),WorkFov()+4,look);
   var e=rot.eulerAngles;orbitYaw=e.y;orbitPitch=e.x>180?e.x-360:e.x;
  }else if(atWork){
   eye=WorkEyeAt(smith.position,smith.eulerAngles.y);var want=Quaternion.LookRotation(WorkLookAt-eye);
   float ease=reduced?1:ForgeFeel.Ease(k.workEase,dt);rot=Quaternion.Slerp(camBaseRot,want,ease);fovTarget=WorkFov();
   var e=rot.eulerAngles;orbitYaw=e.y;orbitPitch=e.x>180?e.x-360:e.x;
  }else{
   eye=smith.position+Vector3.up*ForgeLayout.EyeHeight;
   var want=Quaternion.Euler(orbitPitch,orbitYaw,0);rot=reduced?want:Quaternion.Slerp(camBaseRot,want,ForgeFeel.Ease(k.lookEase,dt));fovTarget=workFocus?WorkFov():WalkFov();
  }
  // Ease the eye between the work lean and the standing eye (no snap when work focus toggles).
  camBasePos=Vector3.Lerp(camBasePos==Vector3.zero?eye:camBasePos,eye,reduced?1:ForgeFeel.Ease(k.workEase,dt));camBaseRot=rot;
  // ---- walk bob locked to steps (sfx 'step' on each footfall) ----
  var flat=new Vector3(smith.position.x-lastSmith.x,0,smith.position.z-lastSmith.z);float moved=flat.magnitude;lastSmith=smith.position;
  bobAmount=Mathf.Lerp(bobAmount,moved>1e-5f&&dt>0?Mathf.Clamp01(moved/dt/1.6f):0,ForgeFeel.Ease(10,dt));
  if(moved>1e-5f&&moved<.5f){float before=bobPhase;bobPhase+=moved/k.strideM;if(ForgeWalkBob.Steps(before,bobPhase)>0)Send("sfx",0,ForgeContract.Sfx.Step,Mathf.Clamp01(moved/Mathf.Max(dt,1e-4f)/2.5f));}
  float bobUp=0,bobSide=0,bobRoll=0;if(!reduced)ForgeWalkBob.Sample(k,bobPhase,bobAmount,out bobUp,out bobSide,out bobRoll);
  // ---- impact springs, trauma shake, downstroke dip ----
  ForgeFeel.SpringStep(ref kickPitch,ref kickPitchV,0,k.kickOmega,dt);ForgeFeel.SpringStep(ref kickDrop,ref kickDropV,0,k.kickOmega,dt);ForgeFeel.SpringStep(ref kickRoll,ref kickRollV,0,k.kickOmega,dt);
  ForgeFeel.SpringStep(ref fovPunch,ref fovPunchV,0,k.fovOmega,dt);trauma=ForgeFeel.Decay(trauma,k.traumaDecayPerS,dt);shakeTime+=dt;
  float dipTarget=reduced?0:DownstrokeDip();headDip=Mathf.Lerp(headDip,dipTarget,ForgeFeel.Ease(40,dt));
  float shakeAmount=reduced?0:trauma*trauma*(state!=null?state.shake:1);
  float sp=shakeAmount*k.shakeMaxDeg*ForgeFeel.Noise(shakeTime*k.shakeHz,11),sy=shakeAmount*k.shakeMaxDeg*ForgeFeel.Noise(shakeTime*k.shakeHz,23),sr=shakeAmount*k.shakeRollDeg*ForgeFeel.Noise(shakeTime*k.shakeHz,37);
  var shakePos=new Vector3(ForgeFeel.Noise(shakeTime*k.shakeHz,41),ForgeFeel.Noise(shakeTime*k.shakeHz,43),0)*(.001f*k.shakeMm*shakeAmount);
  var finalRot=camBaseRot*Quaternion.Euler(kickPitch+headDip+sp,sy,kickRoll+sr+bobRoll);
  cam.transform.position=camBasePos+finalRot*(new Vector3(bobSide,bobUp,0)+shakePos)+Vector3.down*kickDrop;cam.transform.rotation=finalRot;
  cameraHome=camBasePos;
  // ---- FOV: eased 0.3 s, plus the punch, minus the risk push-in ----
  float fovOmega=4.75f/Mathf.Max(.02f,k.fovEaseS);if(reduced){camFov=fovTarget;camFovV=0;}else ForgeFeel.SpringStep(ref camFov,ref camFovV,fovTarget,fovOmega,dt);
  float tau=atWork&&!motionOff?ForgeFeel.Tau(k,currentRisk):0;riskPush=Mathf.Lerp(riskPush,reduced?0:tau*k.riskPushInDeg,ForgeFeel.Ease(3,dt));
  appliedFov=Mathf.Clamp(camFov+fovPunch-riskPush,15,100);cam.fieldOfView=appliedFov;
  ForgeFraming.BandCentre(view.cssW,view.cssH,view.top,view.right,view.bottom,view.left,out shiftX,out shiftY);
  ApplyProjection(cam);
  // ---- the anvil label follows the settled work view (<= labelHz) ----
  float motion=Vector3.Distance(camBasePos,lastCamPos)+Quaternion.Angle(camBaseRot,lastCamRot)*.01f;lastCamPos=camBasePos;lastCamRot=camBaseRot;
  if(motion>.0005f)settleClock=0;else settleClock+=dt;if(settleClock>.15f&&settleClock-dt<=.15f)labelsDirty=true;
  labelClock+=dt;if(labelsDirty&&labelClock>=1/Mathf.Max(.5f,k.labelHz)){labelClock=0;labelsDirty=false;SendLabels();}
 }
 Vector3 lastSmith;
 /// The head dips toward the work through the downstroke.
 float DownstrokeDip(){if(!strikes.hasCurrent||strikes.contacted)return 0;var s=ForgeSwing.Sample(strikes.current,strikeNow,K);return s.phase==ForgeSwingPhase.Down?K.headDipDeg*s.u:0;}
 /// Off-axis projection: the camera axis lands in the middle of the HUD-free band. Rebuilt per render from the live FOV.
 public void ApplyProjection(Camera c){
  if(c==null)return;
  if(Mathf.Abs(shiftX)<1e-4f&&Mathf.Abs(shiftY)<1e-4f){c.ResetProjectionMatrix();return;}
  var m=Matrix4x4.Perspective(c.fieldOfView,c.aspect,c.nearClipPlane,c.farClipPlane);m[0,2]=-shiftX;m[1,2]=-shiftY;c.projectionMatrix=m;
 }
}
