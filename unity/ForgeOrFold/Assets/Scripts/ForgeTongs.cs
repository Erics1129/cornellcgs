using System.Collections.Generic;
using UnityEngine;
using UnityEngine.Rendering;

// Owner: strike-feel. Flat-jaw tongs in the left hand. A knife on the anvil, in the coals (during the hearth reach) or
// carried is held rigidly in the jaws at its tang (ForgeLayout.TangGripLocal): no free spring. After each strike the
// tongs feed the blade so the blows walk from feedFrom to feedTo of its length, rolling it over every 8 strikes; the
// spine is tilted spineTiltDeg; at high risk the tong hand trembles (blade tip 2 mm at 9 Hz); during a hit-stop the
// blade jitters 3.5 mm sideways, decaying to zero. Tong-local frame: origin at the jaw bite, +x along the reins toward
// the hand (horizontal), y up.
public partial class ForgeWorld {
 Transform tongs;Material tongIron;
 Vector3 jawPos;Quaternion jawRot=Quaternion.identity;bool tongsInit;
 /// Body id in the jaws (-1 = none).
 int heldId=-1;
 /// Knife-in-jaws rotation relative to the tongs (the grip), and the tongs' left-hand point.
 Quaternion gripRel=Quaternion.identity;Vector3 tongHandLocal;
 // Feed and roll of the anvil knife (fraction along the blade under the hammer; roll angle about the blade axis).
 float feedU=-1,feedFromU,feedToU,feedStartAt=-1,rollDeg,rollFromDeg,rollToDeg,rollStartAt=-1,tremorTime;int feedHits=-1;
 // Hit-stop jitter of the struck blade.
 float jitterMs,jitterTotalMs;int jitterSign=1;
 float tongBlend=1;string tongMode="";

 void MakeTongs(){
  var k=K;tongs=Group("Flat jaw tongs",Vector3.zero);tongs.SetParent(dynamicRoot,true);
  // Lighter forged iron, half metallic: near-black .78-metallic 8 mm reins vanished against the brick (critique).
  tongIron=Mat("Forged tongs","5c5f62",.5f,.45f);tongIron.SetFloat("_Sheen",.7f);tongIron.mainTexture=Resources.Load<Texture2D>("Forge/IronV3");tongIron.SetFloat("_Scale",8);tongIron.SetFloat("_ObjectSpace",1);
  var g=MeshObject("Tongs",TongMesh(k),tongIron);g.transform.SetParent(tongs,false);var r=g.GetComponent<Renderer>();r.shadowCastingMode=ShadowCastingMode.Off;r.receiveShadows=false;
  float e=k.tongElevDeg*Mathf.Deg2Rad;tongHandLocal=new Vector3(Mathf.Cos(e),Mathf.Sin(e),0)*k.tongHandM;
  // The grip: the reins leave the tang at tongGripDeg toward the smith (toward -z for a blade along +x).
  var tang=Vector3.left;var rein=Quaternion.Euler(0,-k.tongGripDeg,0)*tang;gripRel=Quaternion.Inverse(TongRotation(rein))*Quaternion.identity;
 }
 static Quaternion TongRotation(Vector3 rein){rein.y=0;if(rein.sqrMagnitude<1e-8f)rein=Vector3.left;rein.Normalize();return Quaternion.LookRotation(Vector3.Cross(rein,Vector3.up),Vector3.up);}
 /// Two 12 x 9 mm reins (42 cm, slightly bowed, a little flattened) from a riveted boss 7 cm behind the jaw tips, 5 cm flat jaws.
 static Mesh TongMesh(ForgeStrikeTuning k){
  var v=new List<Vector3>();var t=new List<int>();
  float e=k.tongElevDeg*Mathf.Deg2Rad;var hand=new Vector3(Mathf.Cos(e),Mathf.Sin(e),0)*k.tongHandM;var boss=new Vector3(.045f,0,0);var dir=(hand-boss).normalized;
  for(int side=-1;side<=1;side+=2){
   // Rein: 12 x 9 mm bar (wider across the bow than it is tall) following a gentle bow, ending 2 cm past the hand.
   var path=new List<Vector3>();for(int i=0;i<=10;i++){float s=i/10f;var p=boss+dir*(.42f*s);float bow=Mathf.Sin(s*Mathf.PI)*.013f+.0065f+s*.004f;path.Add(p+new Vector3(0,0,side*bow));}
   Tube(v,t,path,.006f,8,.0045f);
   // Jaw: a flat bar 5 cm x 1.4 cm x 3 mm above or below the tang, joined to the boss.
   float y=side*.0048f;BoxInto(v,t,new Vector3(-.0255f,y-.0015f,-.007f),new Vector3(.0255f,y+.0015f,.007f));
   BoxInto(v,t,new Vector3(.0255f,Mathf.Min(y,0)-.0025f,-.006f),new Vector3(.047f,Mathf.Max(y,0)+.0025f,.006f));
  }
  // The boss round the pivot and its peened rivet heads.
  {var c=new Vector3(.045f,0,0);Tube(v,t,new List<Vector3>{c+new Vector3(0,0,-.012f),c+new Vector3(0,0,.012f)},.010f,10);
   foreach(float sz in new[]{-1f,1f})Tube(v,t,new List<Vector3>{c+new Vector3(0,0,sz*.0115f),c+new Vector3(0,0,sz*.0150f)},.0055f,8);}
  var m=new Mesh{name="Tongs"};m.SetVertices(v);m.SetTriangles(t,0);m.RecalculateNormals();m.RecalculateBounds();return m;
 }
 /// A tube along path, r across (horizontal) and rb (default r) up.
 static void Tube(List<Vector3> v,List<int> t,List<Vector3> path,float r,int seg,float rb=-1){
  int start=v.Count;if(rb<=0)rb=r;
  for(int i=0;i<path.Count;i++){var fwd=(path[Mathf.Min(i+1,path.Count-1)]-path[Mathf.Max(i-1,0)]).normalized;var up=Mathf.Abs(Vector3.Dot(fwd,Vector3.up))>.9f?Vector3.right:Vector3.up;var a=Vector3.Cross(fwd,up).normalized;var b=Vector3.Cross(a,fwd);
   for(int j=0;j<seg;j++){float ang=j*Mathf.PI*2/seg;v.Add(path[i]+a*(Mathf.Cos(ang)*r)+b*(Mathf.Sin(ang)*rb));}}
  for(int i=0;i+1<path.Count;i++)for(int j=0;j<seg;j++){int a=start+i*seg+j,b=start+i*seg+(j+1)%seg,c=start+(i+1)*seg+(j+1)%seg,d=start+(i+1)*seg+j;t.AddRange(new[]{a,c,b,a,d,c});}
  int e0=v.Count;v.Add(path[0]);for(int j=0;j<seg;j++)t.AddRange(new[]{e0,start+j,start+(j+1)%seg});
  int e1=v.Count;v.Add(path[path.Count-1]);int last=start+(path.Count-1)*seg;for(int j=0;j<seg;j++)t.AddRange(new[]{e1,last+(j+1)%seg,last+j});
 }
 static void BoxInto(List<Vector3> v,List<int> t,Vector3 lo,Vector3 hi){
  var c=new[]{new Vector3(lo.x,lo.y,lo.z),new Vector3(hi.x,lo.y,lo.z),new Vector3(hi.x,hi.y,lo.z),new Vector3(lo.x,hi.y,lo.z),new Vector3(lo.x,lo.y,hi.z),new Vector3(hi.x,lo.y,hi.z),new Vector3(hi.x,hi.y,hi.z),new Vector3(lo.x,hi.y,hi.z)};
  int[][] f={new[]{0,3,2,1},new[]{4,5,6,7},new[]{0,1,5,4},new[]{3,7,6,2},new[]{1,2,6,5},new[]{0,4,7,3}};
  foreach(var q in f){int o=v.Count;foreach(int i in q)v.Add(c[i]);t.AddRange(new[]{o,o+1,o+2,o,o+2,o+3});}
 }

 // ------------------------------------------------------------------ the anvil knife
 /// Blade length (world metres) of the anvil knife: the blade mesh runs along knife-local +x from 0.
 float AnvilBladeLength(){var b=AnvilBody();return b!=null?BladeLength(b):.24f;}
 float BladeLength(Body b){if(b==null||b.blade==null)return .24f;var mf=b.blade.GetComponent<MeshFilter>();if(mf==null||mf.sharedMesh==null)return .24f;return Mathf.Clamp(mf.sharedMesh.bounds.max.x*KnifeRootScale,.05f,.8f);}
 /// After a strike (outcome known): walk the blows to the next feed position, rolling the blade every 8 strikes.
 void FeedAfterStrike(){var k=K;if(state==null)return;int h=state.totalHits;if(h==feedHits)return;feedHits=h;
  float start=strikes.contacted?strikes.contactAt+k.feedStartMs:strikeNow;feedFromU=feedU<0?ForgeFeel.FeedU(k,h):feedU;feedToU=ForgeFeel.FeedU(k,h);feedStartAt=start;
  if(ForgeFeel.FeedRolls(h)){rollFromDeg=rollDeg;rollToDeg=Mathf.Repeat(rollDeg,360)<90?180:0;rollStartAt=start;Send("sfx",0,ForgeContract.Sfx.Tongs,1);}}
 /// The anvil knife's root pose this frame (cached by UpdateAnvilKnife): fed along x, rolled and tilted about its axis,
 /// trembling at risk, jittering in a hit-stop.
 Vector3 anvilPos;Quaternion anvilRot=Quaternion.identity;int anvilPoseId=-1;
 void UpdateAnvilKnife(float dt){
  var k=K;var b=AnvilBody();anvilPoseId=-1;if(b==null){feedU=-1;feedStartAt=rollStartAt=-1;rollDeg=0;return;}
  float L=BladeLength(b);
  if(feedU<0){feedU=ForgeFeel.FeedU(k,state!=null?state.totalHits:0);feedHits=state!=null?state.totalHits:0;}
  if(feedStartAt>=0){float d=Mathf.Max(1,k.feedEndMs-k.feedStartMs);float u=Mathf.Clamp01((strikeNow-feedStartAt)/d);feedU=Mathf.Lerp(feedFromU,feedToU,ForgeFeel.Smooth(u));if(u>=1)feedStartAt=-1;}
  if(rollStartAt>=0){float u=Mathf.Clamp01((strikeNow-rollStartAt)/k.rollMs);rollDeg=Mathf.Lerp(rollFromDeg,rollToDeg,ForgeFeel.Smooth(u));if(u>=1)rollStartAt=-1;}
  float rootX=ForgeFeel.RootX(k,ForgeLayout.StrikePoint.x,feedU,L);
  float tilt=k.spineTiltDeg*Mathf.Cos(rollDeg*Mathf.Deg2Rad);
  var rot=Quaternion.AngleAxis(rollDeg-tilt,Vector3.right);
  var pos=new Vector3(rootX,ForgeLayout.KnifeAnvilRoot.y+Mathf.Sin(Mathf.Abs(tilt)*Mathf.Deg2Rad)*.018f,ForgeLayout.KnifeAnvilRoot.z);
  // Tremor at risk: the blade turns about the jaws so the tip moves tongTremorMm (not in reduced motion).
  float tau=reduced||!AtAnvil()?0:ForgeFeel.Tau(k,currentRisk);tremorTime+=dt;
  if(tau>0){var jaws=pos+rot*(ForgeLayout.TangGripLocal*KnifeRootScale);float tip=Mathf.Max(.05f,L-ForgeLayout.TangGripLocal.x*KnifeRootScale);
   float wob=(.7f*Mathf.Sin(tremorTime*k.tongTremorHz*Mathf.PI*2)+.3f*ForgeFeel.Noise(tremorTime*k.tongTremorHz*1.7f,3))*tau*k.tongTremorMm*.001f/tip*Mathf.Rad2Deg;
   var q=Quaternion.AngleAxis(wob,Vector3.up);pos=jaws+q*(pos-jaws);rot=q*rot;}
  // Hit-stop jitter: 3.5 mm sideways, decaying linearly to zero over the stop (real time: the world is frozen).
  if(jitterMs>0){float a=jitterTotalMs>0?jitterMs/jitterTotalMs:0;jitterSign=-jitterSign;pos+=Vector3.forward*(jitterSign*a*k.hitStopJitterMm*.001f);jitterMs-=dt*1000;}
  anvilPos=pos;anvilRot=rot;anvilPoseId=b.knife.id;
 }
 void StartJitter(float ms){if(reduced||ms<=0)return;jitterMs=jitterTotalMs=ms;}

 // ------------------------------------------------------------------ tongs pose and the held knife
 Body HeldBody()=>heldId>=0&&bodies.TryGetValue(heldId,out var b)?b:null;
 Vector3 JawWorld()=>jawPos;
 Vector3 LeftShoulderWorld()=>smith.position+SmithYaw*ForgeLayout.V(ForgeLayoutData.LeftShoulderLocal);
 /// Tongs on a knife lying at (pos, rot): jaws on the tang, reins toward the left shoulder.
 void TongsOnKnife(Vector3 pos,Quaternion rot,out Vector3 jaws,out Quaternion tRot){
  jaws=pos+rot*(ForgeLayout.TangGripLocal*KnifeRootScale);var tang=rot*Vector3.left;
  var rein=U(ForgeTongModel.ReinDir(K,F(jaws),F(tang),F(LeftShoulderWorld())));
  tRot=TongRotation(rein);
 }
 /// The knife pose held in jaws at (jaws, tRot).
 void KnifeInJaws(Vector3 jaws,Quaternion tRot,out Vector3 pos,out Quaternion rot){rot=tRot*gripRel;pos=jaws-rot*(ForgeLayout.TangGripLocal*KnifeRootScale);}
 /// Carry pose (smith-local): jaws in front at the left, the blade held out across the body.
 void CarryTongs(out Vector3 jaws,out Quaternion tRot){var y=SmithYaw;jaws=smith.position+y*new Vector3(-.17f,.98f,.52f);tRot=y*TongRotation(Quaternion.Euler(0,22,0)*Vector3.back);}
 /// Idle (nothing held): hanging at the left side, out of the work view.
 void IdleTongs(out Vector3 jaws,out Quaternion tRot){var y=SmithYaw;jaws=smith.position+y*new Vector3(-.34f,.60f,.26f);tRot=y*TongRotation(Quaternion.Euler(0,10,0)*Vector3.back)*Quaternion.AngleAxis(-38,Vector3.forward);}

 /// Choose the tongs pose for this frame and place the held knife. Called after the hammer, before KnifeVisual.
 void UpdateTongs(float dt){
  if(tongs==null||smith==null)return;var k=K;
  Vector3 jaws;Quaternion tRot;string mode;int hold=-1;
  if(hearth!=null&&hearth.holding){HearthTongs(out jaws,out tRot);mode="hearth";hold=hearth.knifeId;}
  else if(carriedId>=0&&bodies.ContainsKey(carriedId)){CarryTongs(out jaws,out tRot);mode="carry";hold=carriedId;}
  else{var b=AnvilBody();if(b!=null&&anvilPoseId==b.knife.id&&AtAnvil()&&b.motion.mode!=KnifeMotion.Dissolve){TongsOnKnife(anvilPos,anvilRot,out jaws,out tRot);mode="anvil";hold=b.knife.id;}else{IdleTongs(out jaws,out tRot);mode="idle";}}
  if(mode!=tongMode){tongMode=mode;tongBlend=tongsInit?0:1;}
  tongsInit=true;
  // Blend between modes over ~.2 s; within a mode the pose is exact (rigid on the knife).
  tongBlend=Mathf.Min(1,tongBlend+dt/.2f);float w=ForgeFeel.Smooth(tongBlend);
  if(w<1){jawPos=Vector3.Lerp(jawPos,jaws,ForgeFeel.Ease(16,dt)*(1-w)+w);jawRot=Quaternion.Slerp(jawRot,tRot,ForgeFeel.Ease(16,dt)*(1-w)+w);}else{jawPos=jaws;jawRot=tRot;}
  tongs.position=jawPos;tongs.rotation=jawRot;
  heldId=hold;
  tongHandAlong=Mathf.MoveTowards(tongHandAlong,hearth!=null&&hearth.quench&&hearth.holding?k.quenchHandM:k.tongHandM,dt*.8f);
 }
 /// World point of the left hand on the reins.
 Vector3 TongHandWorld()=>tongs!=null?tongs.TransformPoint(tongHandLocal*(tongHandAlong/Mathf.Max(.01f,K.tongHandM))):Vector3.zero;
 /// How far up the reins the left hand holds (m from the jaws): tongHandM, choked up to quenchHandM over the tub.
 float tongHandAlong=.40f;
}
