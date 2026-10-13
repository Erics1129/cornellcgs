using System;
using System.Collections.Generic;
using UnityEngine;
public class SmithPose:MonoBehaviour {
 public ForgeWorld forge;
 void OnAnimatorIK(int layer){if(forge==null)return;var a=GetComponent<Animator>();forge.PoseSmith(a);}
}
public partial class ForgeWorld {
 Transform smith;Animator smithAnimator;Transform leftHand,rightHand,leftMiddle,rightMiddle,spine;int carriedId=-1,shopIndex;Vector2 movement,touchOrigin,touchLast;readonly HashSet<string> heldKeys=new HashSet<string>();float pointerStarted,walkSpeed,orbitYaw,orbitPitch=24,contextClock,endHold,reachTime;bool touchMoving,workFocus=true;string nearby="",lastContext="";Vector3[] route;int routeIndex;string destination="",destinationAction="interact";
 /// Approaches (where the smith stands to use a station) from the frozen layout.
 readonly Dictionary<string,Vector3> approaches=Stations(ForgeLayout.Approach);
 /// A power grip on a round handle, in the humanoid IK goal frame of the Smith model (measured with Qa('strike-bones'):
 /// fingers along goal +z, palm toward goal -y, thumb toward goal -x on the right hand and +x on the left).
 /// grasp: a point on the handle axis where the fist closes; axis: the handle direction toward the thumb end (the hammer
 /// head, the tong jaws); palm: from the hand toward the handle; oblique: the handle lies across the palm from the heel
 /// toward the index knuckle (a power grip, not a square one). Returns the wrist (hand bone) goal and its rotation.
 static void PowerGrip(Vector3 grasp,Vector3 axis,Vector3 palm,bool right,float obliqueDeg,float palmOff,float along,out Vector3 wrist,out Quaternion rot){
  axis.Normalize();palm=Vector3.ProjectOnPlane(palm,axis);if(palm.sqrMagnitude<1e-8f)palm=Vector3.Cross(axis,Vector3.up);palm.Normalize();
  var f0=right?Vector3.Cross(axis,palm):Vector3.Cross(palm,axis);float b=obliqueDeg*Mathf.Deg2Rad;
  var fingers=axis*Mathf.Sin(b)+f0*Mathf.Cos(b);
  rot=Quaternion.LookRotation(fingers,-palm);wrist=grasp-palm*palmOff-fingers*along;
 }
 /// Finger bones (thumb, index, middle, ring, little x proximal, intermediate, distal) and their rest local rotations.
 Transform[][] fingerBones=new Transform[2][];Quaternion[][] fingerRest=new Quaternion[2][];
 void FindFingers(){for(int s=0;s<2;s++){int first=s==0?(int)HumanBodyBones.LeftThumbProximal:(int)HumanBodyBones.RightThumbProximal;fingerBones[s]=new Transform[15];fingerRest[s]=new Quaternion[15];for(int i=0;i<15;i++){var t=smithAnimator.GetBoneTransform((HumanBodyBones)(first+i));fingerBones[s][i]=t;if(t!=null)fingerRest[s][i]=t.localRotation;}}}
 /// Close a hand around its tool after the Animator and IK (LateUpdate): each joint turns about the goal frame's x axis
 /// (positive curls toward the palm), the thumb about the finger axis. From the rest pose every frame, so nothing accumulates.
 void CurlFingers(int side,Quaternion goal,float amount){
  var bones=fingerBones[side];if(bones==null)return;var k=K;var across=goal*Vector3.right;var along=goal*Vector3.forward;
  for(int f=0;f<5;f++)for(int j=0;j<3;j++){var t=bones[f*3+j];if(t==null)continue;t.localRotation=fingerRest[side][f*3+j];
   float deg=f==0?k.thumbCurlDeg*(j==0?.6f:1)*(side==0?-1:1):(j==0?k.fingerCurlProxDeg:j==1?k.fingerCurlMidDeg:k.fingerCurlTipDeg)*(1+.06f*(f-1));
   if(amount<1)deg*=amount;t.rotation=Quaternion.AngleAxis(deg,f==0?along:across)*t.rotation;}
 }

 void CreateSmith(){
  var model=Resources.Load<GameObject>("Smith/Model");var go=Instantiate(model,ForgeLayout.SmithAnvilStance,Quaternion.identity);go.name="The blacksmith";smith=go.transform;smith.localScale=Vector3.one;lastSmith=smith.position;
  smithAnimator=go.GetComponent<Animator>();if(smithAnimator==null)smithAnimator=go.AddComponent<Animator>();smithAnimator.runtimeAnimatorController=Resources.Load<RuntimeAnimatorController>("Smith/Smith");smithAnimator.applyRootMotion=false;smithAnimator.cullingMode=AnimatorCullingMode.AlwaysAnimate;go.AddComponent<SmithPose>().forge=this;
  var cloth=new Material(Shader.Find("Forge/Glove")){name="Leather forging gauntlets",color=C("927d68")};cloth.mainTexture=Resources.Load<Texture2D>("Forge/LeatherV3");foreach(var r in go.GetComponentsInChildren<SkinnedMeshRenderer>(true)){var materials=new Material[r.sharedMaterials.Length];for(int i=0;i<materials.Length;i++)materials[i]=cloth;r.sharedMaterials=materials;r.updateWhenOffscreen=true;r.receiveShadows=false;r.shadowCastingMode=UnityEngine.Rendering.ShadowCastingMode.Off;var mesh=Instantiate(r.sharedMesh);var colors=new Color[mesh.vertexCount];var weights=mesh.boneWeights;for(int v=0;v<colors.Length;v++){var w=weights[v];int index=w.boneIndex0;string bone=index<r.bones.Length?r.bones[index].name:"";bool skin=bone.Contains("Head")||bone.Contains("Neck")||bone.Contains("Jaw");bool boot=bone.Contains("Foot")||bone.Contains("Toes");bool glove=bone.Contains("Hand")||bone.Contains("Finger")||bone.Contains("Thumb")||bone.Contains("Index")||bone.Contains("Middle")||bone.Contains("Ring")||bone.Contains("Pinky");var color=skin?C("b78360"):boot?C("30291f"):glove?C("735136"):bone.Contains("Leg")?C("39403b"):C("535c53");color.a=skin?1:0;colors[v]=color.linear;}mesh.colors=colors;
   // Render the animated arms only: the first-person camera cannot see inside a head or torso.
   bool IsArm(int v){var bw=weights[v];return ArmBone(r.bones[bw.boneIndex0].name)||bw.weight1>.2f&&ArmBone(r.bones[bw.boneIndex1].name);}
   for(int sub=0;sub<mesh.subMeshCount;sub++){var old=mesh.GetTriangles(sub);var kept=new List<int>();for(int j=0;j<old.Length;j+=3)if(IsArm(old[j])&&IsArm(old[j+1])&&IsArm(old[j+2]))kept.AddRange(new[]{old[j],old[j+1],old[j+2]});mesh.SetTriangles(kept,sub);}
   r.sharedMesh=mesh;
  }
  leftHand=smithAnimator.GetBoneTransform(HumanBodyBones.LeftHand);rightHand=smithAnimator.GetBoneTransform(HumanBodyBones.RightHand);spine=smithAnimator.GetBoneTransform(HumanBodyBones.Chest);
  leftMiddle=smithAnimator.GetBoneTransform(HumanBodyBones.LeftMiddleProximal);rightMiddle=smithAnimator.GetBoneTransform(HumanBodyBones.RightMiddleProximal);FindFingers();
 }
 static bool ArmBone(string name){return name.Contains("Arm")||name.Contains("Hand")||name.Contains("Finger")||name.Contains("Thumb")||name.Contains("Index")||name.Contains("Middle")||name.Contains("Ring")||name.Contains("Pinky");}
 public void Control(string json){var input=JsonUtility.FromJson<ForgeControl>(json);
  if(input.key=="clear"){if(destinationAction=="begin"&&route!=null&&pendingBegin!=0){if(pendingBegin>0)Send("settled",pendingBegin,"",-1);pendingBegin=0;}CancelQueuedStrike();heldKeys.Clear();movement=Vector2.zero;touchMoving=false;route=null;destination="";return;}
  if(input.down)heldKeys.Add(input.key);else heldKeys.Remove(input.key);if(!input.down)return;
  if(input.key=="KeyE")Interact();if(input.key=="Space")TryStrike();if(input.key=="KeyQ")Cycle(-1);if(input.key=="KeyR")Cycle(1);if(input.key=="KeyF"&&state!=null){var k=SelectedKnife();if(k!=null)Send("command",k.id,"flow");}if(input.key.StartsWith("Digit")){int n;if(int.TryParse(input.key.Substring(5),out n)&&n>=1&&n<=4)Send("command",SelectedKnife()?.id??0,new[]{"guard","rewind","whetstone","stamina"}[n-1]);}
 }
 /// A scheduled strike that has not started is dropped (settled x = -1) when the smith walks off or the page clears input.
 void CancelQueuedStrike(){if(strikes.hasQueued){Send("settled",strikes.queued.seq,"",-1);strikes.hasQueued=false;}}
 ForgeKnife SelectedKnife(){if(state==null)return null;foreach(var k in state.knives)if(k.id==carriedId||k.id==state.selected)return k;return state.knives.Length>0?state.knives[0]:null;}
 void Cycle(int direction){if(state==null)return;if(nearby=="shop"&&state.offers!=null&&state.offers.Length>0){shopIndex=(shopIndex+direction+state.offers.Length)%state.offers.Length;lastContext="";return;}var local=new List<ForgeKnife>();foreach(var k in state.knives)if(k.place==nearby)local.Add(k);if(local.Count>0){int current=local.FindIndex(k=>k.id==state.selected);var next=local[(current+direction+local.Count)%local.Count];Send("select",next.id);}}
 public void Quick(string command){if(smith==null)return;if(command=="focus"){carriedId=-1;workFocus=true;if(hearth==null)GoTo("anvil","focus");}}
 void TryStrike(){if(state==null||state.ended)return;workFocus=true;Send("hit");}
 void Interact(){if(state==null||state.ended||Swinging||hearth!=null)return;if(nearby=="")return;if(Vector3.Distance(smith.position,approaches[nearby])>.27f){GoTo(nearby);return;}reachTime=.6f;FaceStation(nearby);
  if(nearby=="lantern")return;
  if(nearby=="shop"){Send("spot",0,"shop");return;}
  if(carriedId>=0){if(!bodies.TryGetValue(carriedId,out var carried)){carriedId=-1;return;}if(nearby=="anvil"&&!carried.knife.heated){Send("notice",0,"This blank needs the furnace first.");return;}if(nearby=="sell"||nearby=="crate"||nearby=="rack"||nearby=="furnace"||nearby=="anvil"){int id=carriedId;Send("drop",id,nearby);if(!bodies.ContainsKey(id)||bodies[id].knife.place==nearby)carriedId=-1;lastContext="";}return;}
  ForgeKnife pick=null;foreach(var k in state.knives)if(k.place==nearby){if(pick==null||k.id==state.selected)pick=k;if(k.id==state.selected)break;}
  if(pick!=null){if(pick.place=="furnace"&&!pick.heated){Send("notice",0,"Give the metal two seconds to heat.");return;}carriedId=pick.id;if(bodies.TryGetValue(pick.id,out var picked))TweenTo(picked,K.abortTweenS);Send("select",pick.id);Send("gesture");Send("sfx",pick.id,ForgeContract.Sfx.Tongs,1);lastContext="";}
 }
 void FaceStation(string spot){if(!spots.ContainsKey(spot))return;var direction=spots[spot]-smith.position;direction.y=0;if(direction.sqrMagnitude>.01f)smith.rotation=Quaternion.LookRotation(direction);}
 /// The smith stands at the anvil stance (work position).
 bool AtAnvil()=>smith!=null&&Vector3.Distance(smith.position,approaches["anvil"])<.35f;
 float hammerElbow=.45f,elbowRise;Quaternion rightGoalRot=Quaternion.identity,leftGoalRot=Quaternion.identity;Vector3 rightGoalPos,leftGoalPos;
 public void PoseSmith(Animator a){if(smith==null||hammer==null)return;
  var y=SmithYaw;var k=K;
  // Lean into the work (the eye leans WorkLean with it): the body pitches forward about the hips.
  if(workLean>1e-3f)a.bodyRotation=Quaternion.AngleAxis(k.spineLeanDeg*workLean,y*Vector3.right)*a.bodyRotation;
  // Left hand closed on the reins of the tongs, from above and outside, thumb toward the jaws.
  if(tongs!=null){var rein=tongs.rotation*new Vector3(Mathf.Cos(k.tongElevDeg*Mathf.Deg2Rad),Mathf.Sin(k.tongElevDeg*Mathf.Deg2Rad),0);var upPerp=Vector3.ProjectOnPlane(tongs.rotation*Vector3.up,rein).normalized;var inward=tongs.rotation*Vector3.forward;
   float pd=k.tongPalmDownDeg*Mathf.Deg2Rad;var palm=inward*Mathf.Cos(pd)-upPerp*Mathf.Sin(pd);
   PowerGrip(TongHandWorld(),-rein,palm,false,k.tongObliqueDeg,.01f*k.tongPalmCm,.01f*k.gripAlongCm,out var lh,out var lhRot);
   a.SetIKPositionWeight(AvatarIKGoal.LeftHand,1);a.SetIKRotationWeight(AvatarIKGoal.LeftHand,1);a.SetIKPosition(AvatarIKGoal.LeftHand,lh);a.SetIKRotation(AvatarIKGoal.LeftHand,lhRot);leftGoalRot=lhRot;leftGoalPos=lh;
   a.SetIKHintPositionWeight(AvatarIKHint.LeftElbow,1);a.SetIKHintPosition(AvatarIKHint.LeftElbow,smith.position+y*new Vector3(-.46f,.98f,.05f));}
  // Right hand closed on the hammer grip (palm toward the body's midline, knuckles toward the face), or on the
  // bellows chain ring during the hearth reach.
  PowerGrip(hammer.position,hammer.up,-hammer.forward,true,k.gripObliqueDeg,.01f*k.gripPalmCm,.01f*k.gripAlongCm,out var grip,out var gripRot);
  // Overhand on the bar: palm down, fingers wrapping it from behind, thumb toward -x.
  if(handOnHammer<1){PowerGrip(BellowsGrip(),Vector3.left,Vector3.down,true,10,.01f*k.gripPalmCm*.8f,.01f*k.gripAlongCm,out var pull,out var pullRot);float w=ForgeFeel.Smooth(handOnHammer);grip=Vector3.Lerp(pull,grip,w);gripRot=Quaternion.Slerp(pullRot,gripRot,w);}
  float rw=ForgeFeel.Smooth(rightIk);a.SetIKPositionWeight(AvatarIKGoal.RightHand,rw);a.SetIKRotationWeight(AvatarIKGoal.RightHand,rw);a.SetIKPosition(AvatarIKGoal.RightHand,grip);a.SetIKRotation(AvatarIKGoal.RightHand,gripRot);rightGoalRot=gripRot;rightGoalPos=grip;
  // Right elbow: out and down from the arc's elbow, rising elbowHintRiseCm through the windup and dropping at contact.
  var elbow=U(arc.ElbowAt(hammerElbow))+new Vector3(.18f,-.10f,-.06f)+Vector3.up*(.01f*K.elbowHintRiseCm*elbowRise);
  a.SetIKHintPositionWeight(AvatarIKHint.RightElbow,1);a.SetIKHintPosition(AvatarIKHint.RightElbow,smith.position+y*elbow);
 }
 bool Walkable(Vector3 p){return ForgeLayout.Walkable(p);}
 void UpdateSmith(float dt,float raw){if(smith==null)return;dt=Mathf.Min(raw,.1f);reachTime=Mathf.Max(0,reachTime-dt);movement=new Vector2((heldKeys.Contains("KeyD")||heldKeys.Contains("ArrowRight")?1:0)-(heldKeys.Contains("KeyA")||heldKeys.Contains("ArrowLeft")?1:0),(heldKeys.Contains("KeyW")||heldKeys.Contains("ArrowUp")?1:0)-(heldKeys.Contains("KeyS")||heldKeys.Contains("ArrowDown")?1:0));if(touchMoving)movement=Vector2.ClampMagnitude((touchLast-touchOrigin)*5,1)*new Vector2(1,-1);
  if(movement.sqrMagnitude>.01f){CancelQueuedStrike();if(hearth!=null)AbortHearth(true);}
  if(movement.sqrMagnitude>.01f&&!Swinging){workFocus=false;if(destinationAction=="begin"&&route!=null&&pendingBegin!=0){if(pendingBegin>0)Send("settled",pendingBegin,"",-1);pendingBegin=0;}route=null;destination="";}
  if(hearth!=null&&!hearth.fade){walkSpeed=Mathf.Lerp(walkSpeed,0,ForgeFeel.Ease(10,dt));smithAnimator.SetFloat("Speed",walkSpeed);contextClock+=dt;if(contextClock>.12f){contextClock=0;UpdateContext();}return;}
  Vector3 direction;if(route!=null&&routeIndex<route.Length){direction=route[routeIndex]-smith.position;direction.y=0;if(direction.magnitude<.14f){routeIndex++;if(routeIndex>=route.Length){route=null;Nearby();if(destination!=""){nearby=destination;var action=destinationAction;destination="";if(action=="begin")BeginSwing();else if(action=="focus")FaceStation("anvil");else if(action=="strike")TryStrike();else if(action=="approach")FaceStation(nearby);else Interact();}}direction=Vector3.zero;}else direction.Normalize();}else{var forward=Quaternion.Euler(0,orbitYaw,0)*Vector3.forward;direction=forward*movement.y+Vector3.Cross(Vector3.up,forward)*movement.x;direction=Vector3.ClampMagnitude(direction,1);}
  if(Swinging||state?.ended==true)direction=Vector3.zero;float speed=heldKeys.Contains("ShiftLeft")?2.5f:1.6f;var next=smith.position+direction*speed*dt;var px=new Vector3(next.x,0,smith.position.z);if(Walkable(px))smith.position=px;var pz=new Vector3(smith.position.x,0,next.z);if(Walkable(pz))smith.position=pz;
  // At the anvil in work focus the body keeps facing the anvil (the arm frame stays put); otherwise it follows the view.
  bool work=workFocus&&route==null&&AtAnvil();var faceYaw=work?Quaternion.LookRotation(new Vector3(spots["anvil"].x-smith.position.x,0,spots["anvil"].z-smith.position.z)):Quaternion.Euler(0,orbitYaw,0);
  smith.rotation=Quaternion.Slerp(smith.rotation,faceYaw,1-Mathf.Exp(-dt*16));walkSpeed=Mathf.Lerp(walkSpeed,direction.magnitude*(speed>2?2:1),1-Mathf.Exp(-dt*10));smithAnimator.SetFloat("Speed",walkSpeed);Nearby();
  if(nearby=="lantern"&&Vector3.Distance(smith.position,approaches["lantern"])<.4f&&heldKeys.Contains("KeyE")){endHold+=raw;if(endHold>=1.2f){endHold=0;heldKeys.Remove("KeyE");Send("command",0,"end");}}else endHold=0;
  contextClock+=dt;if(contextClock>.12f){contextClock=0;UpdateContext();}
 }
 void Nearby(){float best=1.4f;string current="";foreach(var a in approaches){float d=Vector3.Distance(smith.position,a.Value);if(d<best){best=d;current=a.Key;}}if(current!=nearby){nearby=current;Send("near",0,nearby);lastContext="";}}
 void UpdateContext(){string hint="WASD to walk · Drag to look · Walk up to a station";if(state?.ended==true)hint="Seven days. Your masterwork is ready.";else if(nearby=="shop"&&state?.offers!=null&&state.offers.Length>0){shopIndex%=state.offers.Length;var offer=state.offers[shopIndex];hint="E  Open Trade";}else if(nearby=="lantern")hint=state?.day==7?"Hold E to finish your seventh day":"Only rack knives stay overnight · Hold E to end day";else if(nearby!=""){if(carriedId>=0)hint=nearby=="furnace"?"E  Place the blank in the fire":nearby=="anvil"?"E  Lay the knife on the anvil":nearby=="rack"?"E  Keep this knife overnight":nearby=="sell"?"E  Sell the knife on the scale":"E  Put down the knife";else{bool has=false;if(state!=null)foreach(var k in state.knives)if(k.place==nearby)has=true;hint=nearby=="anvil"&&has?"SPACE  Swing the hammer · E  Pick up · F  Flow":has?"E  Pick up a knife · Q / R  Choose another":"No knife here. Find a blank in the crate.";}}if(carriedId>=0&&bodies.TryGetValue(carriedId,out var held)){if(nearby=="sell")hint="E  Sell for "+held.knife.saleValue+" gold · Removes knife from your score";hint=held.knife.displayName+" · "+hint;}if(Narrow){hint=hint.Replace("WASD to walk · Drag to look · Walk up to a station","Hold the pad to walk · Drag right to look").Replace("SPACE  Swing the hammer · E  Pick up · F  Flow","Hammer to strike · Handle to pick up · Flow").Replace("E  ","Handle: ").Replace("Hold E to end day","Hold Handle to end day").Replace("Hold E to finish your seventh day","Hold Handle to finish your seventh day").Replace("Q / R  Choose another", "Hold to pick up");}if(hint!=lastContext){lastContext=hint;Send("context",carriedId,hint);}Send("position",carriedId,nearby,smith.position.x,smith.position.z);}
 /// Tap-to-strike: on the blade's projected box plus a margin, never in the d-pad reveal zone (lower-left).
 bool InStrikeZone(float x,float yDown){if(x<.30f&&yDown>.70f)return false;var b=AnvilBody();
  if(b==null||b.bladeRenderer==null||cam==null)return x>.16f&&x<.84f&&yDown>.3f&&yDown<.77f;
  var r=ScreenRect(b.bladeRenderer.bounds);float vy=1-yDown;return x>r.xMin-.09f&&x<r.xMax+.09f&&vy>r.yMin-.12f&&vy<r.yMax+.14f;}
 void PlayerPointer(ForgePointer p){if(smith==null||state?.ended==true)return;if(p.phase=="down"){pointerStarted=Time.unscaledTime;touchOrigin=touchLast=new Vector2(p.x,p.y);touchMoving=false;Send("gesture");}else if(p.phase=="move"){var at=new Vector2(p.x,p.y);if(Vector2.Distance(at,touchOrigin)>.015f){{if(hearth!=null)AbortHearth(true);workFocus=false;orbitYaw+=(at.x-touchLast.x)*190;orbitPitch=Mathf.Clamp(orbitPitch+(at.y-touchLast.y)*100,K.pitchMinDeg,K.pitchMaxDeg);touchLast=at;touchMoving=false;}}}else if(p.phase=="up"){bool tap=Vector2.Distance(new Vector2(p.x,p.y),touchOrigin)<.015f;touchMoving=false;movement=Vector2.zero;if(tap&&workFocus&&InStrikeZone(p.x,p.y)){TryStrike();return;}if(tap){var ray=cam.ViewportPointToRay(new Vector3(p.x,1-p.y));string best="";float score=.95f;foreach(var spot in spots){var along=Vector3.Dot(spot.Value-ray.origin,ray.direction);if(along<0)continue;float d=Vector3.Distance(ray.GetPoint(along),spot.Value);if(d<score){score=d;best=spot.Key;}}if(best!=""){if(best=="shop"||best=="lantern"){GoTo(best,"approach");Send("notice",0,best=="shop"?"Trade · T or Handle":"Rest · hold Handle or E");return;}if(nearby==best){if(best=="anvil"&&carriedId<0&&Time.unscaledTime-pointerStarted<.45f)TryStrike();else if(best=="lantern"){Send("spot",0,"lantern");}else Interact();}else GoTo(best);}}}else if(p.phase=="cancel"){touchMoving=false;movement=Vector2.zero;}}
 void GoTo(string station,string action="interact"){destinationAction=action;var goal=approaches[station];var start=smith.position;var path=new List<Vector3>();bool crosses=false;for(int i=1;i<=20;i++)if(!Walkable(Vector3.Lerp(start,goal,i/20f))){crosses=true;break;}if(crosses){float side=Mathf.Clamp(start.x,-3.2f,3.2f);float fromZ=-1.5f;float toZ=-1.5f;path.Add(new Vector3(start.x,0,fromZ));path.Add(new Vector3(side,0,fromZ));path.Add(new Vector3(side,0,toZ));path.Add(new Vector3(goal.x,0,toZ));}path.Add(goal);route=path.ToArray();routeIndex=0;destination=station;}
}
