using UnityEngine;

/// How a knife root is moving (strike-feel writes every b.root of a live body).
class KnifeMotion {
 public const int Rest=0, Dissolve=1, Tween=2;
 public int mode;public float t,dur;
 public Vector3 from;public Quaternion fromRot=Quaternion.identity;
 /// Rotation while resting at the place (the furnace keeps the pose it was laid in).
 public Quaternion restRot=Quaternion.identity;public bool hasRestRot;
 /// Dissolve: fade out over dur at (from, fromRot), then in over dur at the target. inOnly: start at the target.
 public bool inOnly;public float inDur;
 /// Send 'seated' once this knife has landed on the anvil, heated.
 public bool seatPending;
 public bool wasHeld;
}

/// The hearth reach: one choreography at a time (the arbiter is `hearth`: a new request cuts the current one).
class HearthChoreo {
 public int knifeId;public float t;public bool fade,holding=true,inCoals,pulled,seating,seated,appeared;public float seatT=-1;
 public Vector3 stanceFrom;public float yawFrom;public int strokes;public bool stepOutSfx,stepBackSfx;
 public Vector3 jawStart;public Quaternion jawStartRot;public bool jawStartSet;
 public float fadeIn=-1,appearT;
}

// Owner: strike-feel. Choreography: the hearth reach (step to the hearth, blank in the jaws, plunge, two bellows
// pulls with the right hand while the hammer lies on the anvil, pull out, step back, hover until the engine shows the
// knife heated on the anvil, lay it down, Send('seated')); Motion 'reduced'/'off' or prefers-reduced-motion: no step or
// turn, the glowing blank fades onto the anvil in 150 ms. Knife moves no choreography covers dissolve out in 120 ms
// and appear at the destination (no telekinetic flights); carried knives travel in the jaws.
public partial class ForgeWorld {
 HearthChoreo hearth;
 bool syncedOnce;

 // ------------------------------------------------------------------ place changes (called by Sync for each knife)
 void KnifeMoved(Body b,string was,bool fresh,ForgeEvent effect){
  var k=b.knife;var m=b.motion;string place=k.place;
  if(!syncedOnce){PlaceNow(b);return;}
  if(fresh){DissolveIn(b,K.dissolveS);if(place=="anvil"&&k.heated)m.seatPending=true;return;}
  if(was==place)return;
  if(hearth!=null&&hearth.knifeId==k.id){
   if(place=="anvil"){if(hearth.fade){KnifeInCoals(b,false);hearth.fadeIn=0;DissolveIn(b,K.fadeInS);m.seatPending=true;}return;}
   AbortHearth(false);
  }
  if(place=="furnace"&&!k.heated&&carriedId!=k.id&&AtAnvil()&&state!=null&&!state.ended){StartHearth(b,reduced);return;}
  if(was=="furnace")KnifeInCoals(b,false);if(place=="furnace")KnifeInCoals(b,true);
  if(m.wasHeld||carriedId==k.id)TweenTo(b,K.abortTweenS);else Dissolve(b,K.dissolveS);
  if(place=="anvil"&&k.heated)m.seatPending=true;
 }
 void PlaceNow(Body b){var m=b.motion;m.mode=KnifeMotion.Rest;TargetPose(b,out var p,out var r);b.root.transform.SetPositionAndRotation(p,r);b.root.transform.localScale=Vector3.one*KnifeRootScale;b.velocity=Vector3.zero;}
 void Dissolve(Body b,float d){var m=b.motion;m.mode=KnifeMotion.Dissolve;m.t=0;m.dur=d;m.inDur=d;m.inOnly=false;m.from=b.root.transform.position;m.fromRot=b.root.transform.rotation;}
 void DissolveIn(Body b,float d){var m=b.motion;m.mode=KnifeMotion.Dissolve;m.t=0;m.dur=0;m.inDur=d;m.inOnly=true;b.root.transform.localScale=Vector3.zero;}
 void TweenTo(Body b,float d){var m=b.motion;m.mode=KnifeMotion.Tween;m.t=0;m.dur=d;m.from=b.root.transform.position;m.fromRot=b.root.transform.rotation;}

 /// Where a knife rests at its logical place.
 void TargetPose(Body b,out Vector3 pos,out Quaternion rot){
  var k=b.knife;pos=b.target;rot=Quaternion.identity;
  if(k.place=="anvil"&&anvilPoseId==k.id){pos=anvilPos;rot=anvilRot;return;}
  if(k.place=="rack")rot=Quaternion.Euler(0,90,0);
  if(k.place=="furnace")rot=b.motion.hasRestRot?b.motion.restRot:Quaternion.Euler(0,-118,0);
 }
 /// Logical place targets (stacked in the crate, slots on the rack, in the coals, on the anvil).
 Vector3 PlaceTarget(ForgeKnife k,ref int crateIndex,ref int rackIndex){
  var t=spots.ContainsKey(k.place)?spots[k.place]:ForgeLayout.Spot("crate");
  if(k.place=="crate"){t+=new Vector3(-.2f,.02f+(crateIndex/3)*.035f,-.18f+(crateIndex%3)*.15f);crateIndex++;}
  if(k.place=="rack"){t+=new Vector3(-.36f+rackIndex*.24f,.04f,-.08f);rackIndex++;}
  if(k.place=="anvil")t=ForgeLayout.KnifeAnvilRoot;
  if(k.place=="furnace")t=ForgeLayout.Firebed+new Vector3(.10f,-.012f,-.02f);
  return t;
 }

 /// Place every live knife this frame (after the hammer and tongs; KnifeVisual runs after this).
 void UpdateKnives(float dt){
  foreach(var pair in bodies){var b=pair.Value;if(b.root==null)continue;var m=b.motion;
   TargetPose(b,out var pos,out var rot);float scale=1;
   bool inJaws=heldId==b.knife.id&&(tongMode=="carry"||tongMode=="hearth");
   if(inJaws){KnifeInJaws(jawPos,jawRot,out pos,out rot);if(hearth!=null&&hearth.knifeId==b.knife.id)scale=hearth.appeared?ForgeFeel.Smooth(hearth.appearT/K.dissolveS):0;}
   if(m.mode==KnifeMotion.Dissolve){m.t+=dt;
    if(!m.inOnly&&m.t<m.dur){pos=m.from;rot=m.fromRot;scale*=1-ForgeFeel.Smooth(m.t/m.dur);}
    else{float tin=m.t-(m.inOnly?0:m.dur);scale*=ForgeFeel.Smooth(m.inDur>0?tin/m.inDur:1);if(tin>=m.inDur)m.mode=KnifeMotion.Rest;}
    b.velocity=Vector3.zero;}
   else if(m.mode==KnifeMotion.Tween){m.t+=dt;float u=ForgeFeel.Smooth(m.dur>0?m.t/m.dur:1);pos=Vector3.Lerp(m.from,pos,u);rot=Quaternion.Slerp(m.fromRot,rot,u);if(m.t>=m.dur)m.mode=KnifeMotion.Rest;b.velocity=Vector3.zero;}
   else if(!inJaws&&!(b.knife.place=="anvil"&&anvilPoseId==b.knife.id)){
    // Small target shifts (the crate re-stacking): a critically damped spring (k 105, damping 20.5), no overshoot.
    var cur=b.root.transform.position;if((pos-cur).sqrMagnitude>.25f){cur=pos;b.velocity=Vector3.zero;}
    b.velocity+=(pos-cur)*dt*105;b.velocity*=Mathf.Exp(-dt*20.5f);pos=cur+b.velocity*dt;rot=Quaternion.Slerp(b.root.transform.rotation,rot,ForgeFeel.Ease(14,dt));
   }
   // A knife that just left the jaws without a place change (carry ended) goes back in .15 s.
   if(m.wasHeld&&!inJaws&&m.mode==KnifeMotion.Rest&&!(b.knife.place=="anvil"&&AtAnvil())&&(hearth==null||hearth.knifeId!=b.knife.id)){m.wasHeld=false;TweenTo(b,K.abortTweenS);continue;}
   m.wasHeld=inJaws;
   if(b.knife.place=="furnace"&&inJaws){m.restRot=rot;m.hasRestRot=true;}
   b.root.transform.SetPositionAndRotation(pos,rot);b.root.transform.localScale=Vector3.one*(KnifeRootScale*scale);
   if(m.seatPending&&m.mode==KnifeMotion.Rest&&b.knife.place=="anvil"&&b.knife.heated&&(hearth==null||hearth.knifeId!=b.knife.id)){m.seatPending=false;Seated(b);}
  }
 }
 void Seated(Body b){Send("seated",b.knife.id);Send("sfx",b.knife.id,ForgeContract.Sfx.Place,0);StrikeTelemetry("seated",b.knife.id,0);labelsDirty=true;}

 // ------------------------------------------------------------------ the hearth reach
 void StartHearth(Body b,bool fade){
  if(hearth!=null)AbortHearth(false);
  var h=new HearthChoreo{knifeId=b.knife.id,fade=fade,stanceFrom=smith.position,yawFrom=smith.eulerAngles.y};hearth=h;
  workFocus=true;route=null;destination="";
  if(fade){h.holding=false;Dissolve(b,K.dissolveS);KnifeInCoals(b,true);h.inCoals=true;return;}
  // The blank vanishes from the crate (off screen) and appears in the jaws during the turn.
  b.motion.mode=KnifeMotion.Rest;b.motion.wasHeld=true;
 }
 /// End the reach early (walking, dragging, the knife moved elsewhere): the knife tweens to its logical place.
 void AbortHearth(bool fromInput){
  var h=hearth;if(h==null)return;hearth=null;ReleaseHammer(false);handOnHammer=1;rightIk=1;
  if(bodies.TryGetValue(h.knifeId,out var b)){
   bool coals=b.knife.place=="furnace";KnifeInCoals(b,coals);
   if(b.knife.place=="anvil"&&b.knife.heated)b.motion.seatPending=true;
   TweenTo(b,K.abortTweenS);
  }
  if(fromInput)labelsDirty=true;
 }
 void UpdateChoreo(float dt){
  var h=hearth;if(h==null)return;var k=K;
  if(!bodies.TryGetValue(h.knifeId,out var b)){AbortHearth(false);return;}
  h.t+=dt;
  if(h.fade){
   // Reduced motion: the blank heats off screen; the anvil Sync starts a 150 ms fade-in (KnifeMoved), then 'seated'.
   if(h.fadeIn>=0){h.fadeIn+=dt;if(h.fadeIn>=k.fadeInS)hearth=null;}
   else if(h.t>8)hearth=null;
   return;
  }
  float back=ForgeHearth.BackAt(k);
  // Step out and back: the smith's stance and yaw (the camera rides it in UpdateSmithCamera).
  float step=ForgeHearth.Step(k,h.t);var hearthYaw=ForgeLayoutData.HearthYawDeg;
  smith.position=Vector3.Lerp(h.stanceFrom,ForgeLayout.HearthStance,step);smith.rotation=Quaternion.Euler(0,Mathf.LerpAngle(h.yawFrom,hearthYaw,step),0);
  if(!h.stepOutSfx&&h.t>=k.hearthStepS*.85f){h.stepOutSfx=true;Send("sfx",0,ForgeContract.Sfx.Step,.6f);}
  if(!h.stepBackSfx&&h.t>=k.hearthBackS+k.hearthStepS*.85f){h.stepBackSfx=true;Send("sfx",0,ForgeContract.Sfx.Step,.6f);}
  // The hammer is laid on the anvil for the reach; the right hand works the bellows.
  if(h.t>=.22f&&h.t<back-.12f)ReleaseHammer(true);else if(h.t>=back-.12f&&hammerReleased)ReleaseHammer(false);
  // The right hand: on the hammer while it is laid down, on the bellows chain for the two pulls, then it lets the chain
  // go and drops out of the view (IK weight 0) during the turn back, and reaches the lying hammer as the step lands.
  float release=k.bellowsPull2S+k.bellowsStrokeS*.5f+.04f,reach=back-.38f;
  if(h.t<.22f){handOnHammer=1;rightIk=1;}
  else if(h.t<release){handOnHammer=Mathf.MoveTowards(handOnHammer,0,dt/.18f);rightIk=1;}
  else if(h.t<reach){rightIk=Mathf.MoveTowards(rightIk,0,dt/.2f);if(rightIk<=0)handOnHammer=1;}
  else{handOnHammer=1;rightIk=Mathf.MoveTowards(rightIk,1,dt/.26f);}
  float pull=ForgeHearth.Bellows(k,h.t);
  foreach(var at in new[]{k.bellowsPull1S,k.bellowsPull2S}){int i=at==k.bellowsPull1S?0:1;if((h.strokes&(1<<i))==0&&h.t>=at-k.bellowsStrokeS*.5f){h.strokes|=1<<i;Bellows(1);}}
  bellowsPull=pull;
  // Blank appears in the jaws while they are low and out of view; plunge, heat, pull out.
  if(!h.appeared&&h.t>=.06f&&(h.t>=.30f||!InView(jawPos,.04f))){h.appeared=true;h.appearT=0;Send("sfx",h.knifeId,ForgeContract.Sfx.Tongs,.8f);}
  if(h.appeared)h.appearT+=dt;
  float plunge=ForgeHearth.Plunge(k,h.t);
  if(!h.inCoals&&plunge>.6f){h.inCoals=true;KnifeInCoals(b,true);Send("sfx",h.knifeId,ForgeContract.Sfx.CoalsIn,1);}
  if(h.inCoals&&!h.pulled&&h.t>=k.hearthPullS&&plunge<.4f){h.pulled=true;KnifeInCoals(b,false);Send("sfx",h.knifeId,ForgeContract.Sfx.CoalsOut,1);}
  // Lay the blade down once back at the anvil and the engine shows it heated on the anvil.
  if(!h.seating&&h.t>=back&&b.knife.place=="anvil"&&b.knife.heated){h.seating=true;h.seatT=0;}
  if(h.seating){h.seatT+=dt;if(h.seatT>=k.seatS){hearth=null;b.motion.mode=KnifeMotion.Rest;b.motion.wasHeld=false;b.motion.seatPending=false;Seated(b);idleTime=0;return;}}
  if(h.t>6){AbortHearth(false);return;}
 }
 float bellowsPull;
 /// Right-hand IK weight (1 = on the hammer or the chain; 0 = the arm hangs at the side, out of the view).
 float rightIk=1;
 /// A world point is inside the camera's view (with a viewport margin).
 bool InView(Vector3 p,float margin){if(cam==null)return true;var v=cam.WorldToViewportPoint(p);return v.z>0&&v.x>-margin&&v.x<1+margin&&v.y>-margin&&v.y<1+margin;}
 /// The tong pose of the reach: from wherever they were, low through the turn, over the coals, buried, out, back over the anvil.
 void HearthTongs(out Vector3 jaws,out Quaternion tRot){
  var h=hearth;var k=K;
  if(!h.jawStartSet){h.jawStartSet=true;h.jawStart=jawPos;h.jawStartRot=jawRot;}
  HearthOverCoals(out var overJaws,out var overRot);
  var below=Vector3.down*(.01f*k.hearthBuryCm+.075f*(1-ForgeHearth.Plunge(k,h.t)))+Vector3.up*.075f;   // .075 above the coals .. buried hearthBuryCm
  float back=ForgeHearth.BackAt(k);
  if(h.t<k.hearthPlungeAtS){float u=ForgeFeel.Smooth(h.t/k.hearthPlungeAtS);jaws=Vector3.Lerp(h.jawStart,overJaws+Vector3.up*.075f,u)+Vector3.down*(.16f*Mathf.Sin(u*Mathf.PI));tRot=Quaternion.Slerp(h.jawStartRot,overRot,u);}
  else if(h.t<k.hearthBackS){jaws=overJaws+below;float wig=h.t<k.hearthPullS?Mathf.Sin(h.t*7)*1.5f:0;tRot=overRot*Quaternion.Euler(0,wig,0);}
  else{
   // Back over the anvil, hovering hoverMm above the face until it is laid down.
   var b=HeldBody();Vector3 anvilP;Quaternion anvilR;if(anvilPoseId>=0&&b!=null&&anvilPoseId==b.knife.id){anvilP=anvilPos;anvilR=anvilRot;}else NominalAnvilPose(b,out anvilP,out anvilR);
   TongsOnKnife(anvilP+Vector3.up*(k.hoverMm*.001f),anvilR,out var hoverJaws,out var hoverRot);
   if(h.seating){float u=ForgeFeel.Smooth(h.seatT/k.seatS);hoverJaws+=Vector3.down*(k.hoverMm*.001f*u);}
   float u2=ForgeFeel.Smooth(Mathf.Clamp01((h.t-k.hearthBackS)/k.hearthStepS));
   jaws=Vector3.Lerp(overJaws+Vector3.up*.075f,hoverJaws,u2)+Vector3.up*(.10f*Mathf.Sin(u2*Mathf.PI));tRot=Quaternion.Slerp(overRot,hoverRot,u2);
   if(h.t>back)tRot=hoverRot;
  }
 }
 /// Where a knife will lie on the anvil before the engine has moved it there (the feed for the next strike, no roll).
 void NominalAnvilPose(Body b,out Vector3 pos,out Quaternion rot){var k=K;float L=b!=null?BladeLength(b):.24f;float u=ForgeFeel.FeedU(k,state!=null?state.totalHits:0);
  rot=Quaternion.AngleAxis(-k.spineTiltDeg,Vector3.right);pos=new Vector3(ForgeFeel.RootX(k,ForgeLayout.StrikePoint.x,u,L),ForgeLayout.KnifeAnvilRoot.y+Mathf.Sin(k.spineTiltDeg*Mathf.Deg2Rad)*.018f,ForgeLayout.KnifeAnvilRoot.z);}
 /// Tongs with the blade centred over the firebed and the reins toward the left shoulder at the hearth stance.
 void HearthOverCoals(out Vector3 jaws,out Quaternion tRot){
  var k=K;var b=HeldBody();float L=b!=null?BladeLength(b):.24f;var fire=ForgeLayout.Firebed;
  var stance=ForgeLayout.HearthStance;var shoulder=stance+ForgeLayout.HearthYaw*ForgeLayout.V(ForgeLayoutData.LeftShoulderLocal);
  var rein=shoulder-fire;rein.y=0;rein=(Quaternion.Euler(0,k.tongHearthYawDeg,0)*rein).normalized;tRot=TongRotation(rein);
  var knifeRot=tRot*gripRel;var mid=knifeRot*new Vector3(L*.5f-ForgeLayout.TangGripLocal.x*KnifeRootScale,0,0);
  jaws=fire-mid;
 }
 /// The earliest windup start (strike ms) for a press now: a blank still being laid down waits for it, at most seatWaitMs.
 float SeatNotBefore(){
  var k=K;float cap=strikeNow+k.seatWaitMs;
  if(hearth!=null){
   if(hearth.fade){if(hearth.fadeIn>=0)return Mathf.Min(cap,strikeNow+(k.fadeInS-hearth.fadeIn)*1000);return cap;}
   if(hearth.seating)return Mathf.Min(cap,strikeNow+(k.seatS-hearth.seatT)*1000);
   float back=ForgeHearth.BackAt(k);return Mathf.Min(cap,strikeNow+Mathf.Max(0,back-hearth.t+k.seatS)*1000);
  }
  var b=AnvilBody();if(b!=null&&(b.motion.mode!=KnifeMotion.Rest||b.motion.seatPending)){float left=b.motion.mode==KnifeMotion.Rest?0:(b.motion.inOnly?b.motion.inDur:b.motion.dur+b.motion.inDur)-b.motion.t;return Mathf.Min(cap,strikeNow+Mathf.Max(0,left)*1000);}
  return float.NegativeInfinity;
 }
}
