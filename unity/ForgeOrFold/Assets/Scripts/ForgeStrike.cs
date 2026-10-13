using System.Collections.Generic;
using UnityEngine;
using UnityEngine.Rendering;

// Owner: strike-feel. The hammer, the swing and the strike plumbing: Strike(seq) -> ForgeStrikeMachine (pure,
// ForgeFeel.cs) -> swing / impact / settled; the procedural 1 kg cross-peen; the hammer poses (ready, park, rest,
// rebound) in the smith's yaw frame; the downstroke smear; telemetry sampled after the Animator (LateUpdate).
public partial class ForgeWorld {
 /// Strike sequence id of the latest accepted strike (0 when a pre-contract page sent Strike('')).
 int strikeSeq;
 /// Parent for per-frame objects (knives, particles, hammer, tongs). Created first in Start; BatchRoom skips it.
 Transform dynamicRoot;
 /// The real contact point of the last hit, and the snapshot's next-hit shatter risk.
 Vector3 lastContact;float currentRisk;
 /// Fallback for one build: the pre-feel box-hammer pose path and its 340 ms timing.
 const bool LegacyHammer=false;

 readonly ForgeStrikeMachine strikes=new ForgeStrikeMachine();
 readonly ForgeHammerArc arc=new ForgeHammerArc();
 readonly List<ForgeStrikeEvent> strikeEvents=new List<ForgeStrikeEvent>();
 /// Realtime strike clock (ms, unscaled; fixed-step under QA), advanced every frame including hit-stops.
 float strikeNow;
 ForgeHammerPose hammerLocal,windupFrom,idlePose;bool hammerInit;int windupSeq=-1,apexSeq=-1,downSeq=-1,pendingBegin;
 float idleTime,parkBlend,reboundLift,reboundSkew,reboundTilt;int framesSinceContact=9;
 /// The hammer lies on the anvil face (released) while the right hand works the bellows.
 bool hammerReleased;Vector3 releasedPos;Quaternion releasedRot;float handOnHammer=1;
 Renderer hammerHead;Mesh hammerHeadMesh;Transform[] smear;MaterialPropertyBlock smearProps;Material smearMat;
 Material hammerSteel,hammerFace,hammerWood;

 /// View class and HUD bands from the page (ForgeView); re-frames the camera and re-sends the labels.
 public void Insets(string json){ForgeView next=null;try{next=JsonUtility.FromJson<ForgeView>(json);}catch{}if(next==null)return;view=next;labelsDirty=true;if(cam!=null)Resize();}
 /// Hammer head centre in world space (telemetry and snapshots).
 public Vector3 QaHeadPosition=>hammer!=null?hammer.TransformPoint(U(arc.HeadLocal)):Vector3.zero;
 Quaternion SmithYaw=>smith!=null?Quaternion.Euler(0,smith.eulerAngles.y,0):Quaternion.identity;
 Vector3 ToSmith(Vector3 world)=>Quaternion.Inverse(SmithYaw)*(world-smith.position);
 static FV F(Vector3 v)=>new FV(v.x,v.y,v.z);
 static Vector3 U(FV v)=>new Vector3(v.x,v.y,v.z);
 static FQ Fq(Quaternion q)=>new FQ(q.x,q.y,q.z,q.w);
 static Quaternion U(FQ q)=>new Quaternion(q.x,q.y,q.z,q.w);

 // ------------------------------------------------------------------ strikes
 bool FlowSwing(){if(state==null)return false;foreach(var k in state.knives)if(k.place=="anvil"&&(k.flow>0||k.pips>=state.flowNeed))return true;return false;}
 /// How far the hammer is from ready toward rest or parked (a longer, 130 ms windup from there).
 float HammerRest01()=>hammerReleased||!AtAnvil()?1:ForgeFeel.Clamp01(parkBlend);
 /// Accept a strike at the anvil: plan it, answer 'swing' with the time to contact.
 void AcceptStrike(int seq){
  float notBefore=SeatNotBefore();
  var r=strikes.Press(seq,strikeNow,FlowSwing(),currentRisk,HammerRest01(),notBefore,out var plan);
  if(r==ForgeStrikeAccept.Refused){if(seq>0)Send("settled",seq,"",-1);return;}
  strikeSeq=seq;FaceStation("anvil");Send("swing",seq,"",Mathf.Max(0,plan.contact-strikeNow));
 }
 /// The machine's events this frame become messages; Send('impact') resolves the hit on the page (re-entrant Sync).
 void StepStrikes(){
  strikeEvents.Clear();strikes.Step(strikeNow,strikeEvents);if(strikeEvents.Count==0)return;
  // Send('impact') re-enters Sync, which can cancel strikes (a Shatter empties the anvil): iterate a copy.
  var events=strikeEvents.ToArray();strikeEvents.Clear();
  foreach(var e in events){
   if(e.kind==ForgeStrikeEventKind.Contact){framesSinceContact=0;reboundLift=ForgeFeel.ReboundM(K,"good",false);reboundSkew=reboundTilt=0;lastContact=lastContactPlanned=NextContactWorld();Send("impact",e.seq);}
   else if(e.kind==ForgeStrikeEventKind.Settled){idleTime=0;Send("settled",e.seq,"",0);}
   else Send("settled",e.seq,"",-1);
  }
 }
 /// Cancel scheduled strikes that have not reached their contact (walking away, clear, knife gone).
 readonly List<ForgeStrikeEvent> cancelEvents=new List<ForgeStrikeEvent>();
 void CancelStrikes(){cancelEvents.Clear();strikes.Cancel(strikeNow,cancelEvents);var events=cancelEvents.ToArray();cancelEvents.Clear();foreach(var e in events)Send("settled",e.seq,"",-1);if(pendingBegin!=0){if(pendingBegin>0)Send("settled",pendingBegin,"",-1);pendingBegin=0;}}

 // ------------------------------------------------------------------ contact point
 Body AnvilBody(){foreach(var b in bodies.Values)if(b.knife!=null&&b.knife.place=="anvil"&&b.root!=null)return b;return null;}
 /// Where the next blow lands (world): the strike point walked along x by the hammer's share of the feed, plus a
 /// per-strike jitter, on top of the blade.
 Vector3 NextContactWorld(){var k=K;int h=state!=null?state.totalHits:0;float L=AnvilBladeLength();
  float x=ForgeFeel.ContactX(k,ForgeLayout.StrikePoint.x,ForgeFeel.FeedU(k,h),L)+ForgeFeel.ContactJitter(k,h);
  var b=AnvilBody();float y=b!=null&&b.bladeRenderer!=null?Mathf.Clamp(b.bladeRenderer.bounds.max.y-.0005f,ForgeLayout.AnvilTopY,ForgeLayout.AnvilTopY+.02f):ForgeLayout.StrikePoint.y;
  return new Vector3(x,y,ForgeLayout.StrikePoint.z);}

 // ------------------------------------------------------------------ hammer pose
 void UpdateFirstPersonHammer(float dt){
  if(smith==null||hammer==null)return;
  if(LegacyHammer){UpdateLegacyHammer(dt);return;}
  var k=K;arc.tuning=k;strikes.tuning=k;if(!ReferenceEquals(toolTuning,k)){toolTuning=k;RebuildTools();}StepStrikes();framesSinceContact++;
  arc.Solve(F(ToSmith(NextContactWorldForArc())));
  bool atWork=AtAnvil()&&workFocus;
  // Idle target: ready between strikes, laid on the anvil after restIdleS, hung at the side away from the anvil.
  // The hearth reach lays the hammer down on the face first (quickly); otherwise it is parked after restIdleS idle at work.
  bool layDown=hearth!=null&&!hearth.fade&&!hammerReleased;
  if(!strikes.Busy){idleTime+=dt;parkBlend=layDown?Mathf.MoveTowards(parkBlend,1,dt/.2f):Mathf.MoveTowards(parkBlend,atWork&&idleTime>k.restIdleS?1:0,dt/k.parkS);}else parkBlend=0;
  var park=arc.Park(F(ToSmith(ParkHeadWorld())));
  ForgeHammerPose target=atWork||hearth!=null?ForgeHammerPose.Blend(arc.Ready(),park,ForgeFeel.Smooth(parkBlend)):arc.Rest(F(ForgeLayout.StrikePoint-ForgeLayout.SmithAnvilStance));
  if(!hammerInit){hammerInit=true;idlePose=target;hammerLocal=target;}
  idlePose=ForgeHammerPose.Blend(idlePose,target,ForgeFeel.Ease(hearth!=null?14:9,dt));
  ForgeHammerPose pose=idlePose;
  if(strikes.hasCurrent){
   if(!strikes.contacted){
    var s=ForgeSwing.Sample(strikes.current,strikeNow,k);int seq=strikes.current.seq;
    if(s.phase==ForgeSwingPhase.Wait){pose=idlePose;}
    else{
     if(windupSeq!=seq){windupSeq=seq;windupFrom=hammerReleased?new ForgeHammerPose(F(ToSmith(hammer.position)),Fq(Quaternion.Inverse(SmithYaw)*hammer.rotation)):hammerLocal;hammerReleased=false;handOnHammer=1;rightIk=1;Send("sfx",seq,ForgeContract.Sfx.Swing,Mathf.Max(0,strikes.current.contact-strikeNow));StrikeTelemetry("windup",seq,strikes.current.contact-strikeNow);}
     if(s.phase==ForgeSwingPhase.Windup){pose=ForgeHammerPose.Blend(windupFrom,arc.Arc(1,1),s.blend);hammerElbow=Mathf.Lerp(k.readyElbow,1,s.blend);elbowRise=s.blend;}
     else if(s.phase==ForgeSwingPhase.Hold){pose=arc.Arc(1,1);hammerElbow=1;elbowRise=1;if(apexSeq!=seq){apexSeq=seq;StrikeTelemetry("apex",seq,strikes.current.contact-strikeNow);}}
     else{pose=arc.Arc(s.elbow,s.wrist);hammerElbow=s.elbow;elbowRise=s.elbow;if(downSeq!=seq){downSeq=seq;Send("sfx",seq,ForgeContract.Sfx.Whoosh,8.8f*k.downstrokeMs/Mathf.Max(30,strikes.current.down));StrikeTelemetry("down",seq,strikes.current.contact-strikeNow);}}
    }
    hammerReleased=false;
   }else{
    ForgeSwing.Recover(strikeNow-strikes.contactAt,strikes.hitStopMs,strikes.SettleAt-strikes.contactAt,k,out float rb,out float toReady);
    var bounce=arc.Rebound(reboundLift*rb,reboundSkew*rb,reboundTilt*rb);pose=ForgeHammerPose.Blend(bounce,arc.Ready(),toReady);idlePose=pose;hammerElbow=k.readyElbow*toReady;elbowRise=0;
   }
  }
  if(!strikes.hasCurrent){hammerElbow=Mathf.Lerp(hammerElbow,k.readyElbow*(1-ForgeFeel.Smooth(parkBlend)),ForgeFeel.Ease(9,dt));elbowRise=Mathf.Lerp(elbowRise,0,ForgeFeel.Ease(9,dt));}
  hammerLocal=pose;
  if(hammerReleased){releaseT+=dt;float u=ForgeFeel.Smooth(releaseT/.1f);hammer.position=Vector3.Lerp(releaseFromPos,releasedPos,u);hammer.rotation=Quaternion.Slerp(releaseFromRot,releasedRot,u);}
  else{hammer.position=smith.position+SmithYaw*U(pose.grip);hammer.rotation=SmithYaw*U(pose.rot);}
  UpdateSmear();
 }
 /// The arc is anchored on the next contact while idle and on the planned one through a swing.
 Vector3 NextContactWorldForArc()=>strikes.hasCurrent&&strikes.contacted?lastContactPlanned:NextContactWorld();
 Vector3 lastContactPlanned;
 /// Where the head lies when the hammer is parked: the near-right corner of the face, clear of the blade.
 Vector3 ParkHeadWorld(){var k=K;var c=ForgeLayout.StrikePoint;var b=AnvilBody();float tip=float.NegativeInfinity;
  // Clear of the blade's tip: the knife on the anvil, or the blank being heated (laid down where it will lie).
  if(b!=null&&anvilPoseId==b.knife.id)tip=anvilPos.x+BladeLength(b);else if(hearth!=null&&bodies.TryGetValue(hearth.knifeId,out var hb)){NominalAnvilPose(hb,out var np,out _);tip=np.x+BladeLength(hb);}
  return new Vector3(ForgeFeel.ParkX(k,c.x,tip,ForgeLayout.AnvilCenter.x+ForgeLayoutData.AnvilFaceX*.5f),ForgeLayout.AnvilTopY+.017f,c.z-k.parkBack);}
 /// Release the hammer where it lies (parked on the face) or take it back into the hand.
 /// Released: the hammer settles (100 ms) onto the exact parked pose on the face and stays there in world space while the
 /// smith works the hearth. Taken back: the hand pose starts from where it lies (no pop) and stays parked until a strike.
 void ReleaseHammer(bool release){if(release==hammerReleased||hammer==null||smith==null)return;hammerReleased=release;
  if(release){releaseFromPos=hammer.position;releaseFromRot=hammer.rotation;releaseT=0;var p=arc.Park(F(ToSmith(ParkHeadWorld())));releasedPos=smith.position+SmithYaw*U(p.grip);releasedRot=SmithYaw*U(p.rot);}
  else{idlePose=hammerLocal=new ForgeHammerPose(F(ToSmith(hammer.position)),Fq(Quaternion.Inverse(SmithYaw)*hammer.rotation));parkBlend=1;idleTime=K.restIdleS+.01f;}}
 Vector3 releaseFromPos;Quaternion releaseFromRot=Quaternion.identity;float releaseT;

 // ------------------------------------------------------------------ smear: stretched ghosts of the head on the downstroke
 // Ghost i spans the head's path from (now - i spacing) to (now - (i+1) spacing): centred between the two head positions,
 // turned like the head there and stretched along the head axis (the head travels face first) to cover the gap, its
 // alpha fading with age. Only on downstroke frames (not on the contact frame, where the flash would light them up).
 const float GhostCentreX=.012f,GhostLength=.1172f;
 void UpdateSmear(){
  if(smear==null)return;var k=K;bool on=k.smearGhosts>0&&strikes.hasCurrent&&!strikes.contacted&&!hammerReleased&&!reduced&&ForgeSwing.Sample(strikes.current,strikeNow,k).phase==ForgeSwingPhase.Down;
  for(int i=0;i<smear.Length;i++){
   bool show=on&&i<k.smearGhosts;
   if(show){var a=SmearPose(strikeNow-i*k.smearSpacingMs,out bool okA);var b=SmearPose(strikeNow-(i+1)*k.smearSpacingMs,out bool okB);show=okA&&okB;
    if(show){var off=arc.HeadLocal+arc.Hang*new FV(GhostCentreX,0,0);var ca=a.grip+a.rot*off;var cb=b.grip+b.rot*off;float gap=FV.Distance(ca,cb);
     var g=smear[i];g.position=smith.position+SmithYaw*U((ca+cb)*.5f);g.rotation=SmithYaw*U(FQ.Slerp(a.rot,b.rot,.5f)*arc.Hang);
     g.localScale=new Vector3(Mathf.Clamp(1+gap/GhostLength,1,k.smearMaxStretch),1,1);
     smearProps.SetFloat("_Alpha",k.smearAlpha*(1-i/(float)Mathf.Max(1,k.smearGhosts)));g.GetComponent<Renderer>().SetPropertyBlock(smearProps);}}
   if(smear[i].gameObject.activeSelf!=show)smear[i].gameObject.SetActive(show);
  }
 }
 /// The swing's hammer pose at strike time t (false before the apex).
 ForgeHammerPose SmearPose(float t,out bool ok){var s=ForgeSwing.Sample(strikes.current,t,K);ok=s.phase==ForgeSwingPhase.Down||s.phase==ForgeSwingPhase.Hold;return s.phase==ForgeSwingPhase.Down?arc.Arc(s.elbow,s.wrist):arc.Arc(1,1);}

 // ------------------------------------------------------------------ the procedural hammer: a 1.0 kg cross-peen
 // 11.5 cm head (face to peen), octagonal 3.8 cm crowned face with a 2 mm chamfer and a polished ring, 3.2 cm square
 // cheeks, a 6 mm-radius cross peen; a 36 cm hickory handle, oval 2.8 x 2.0 cm at the grip tapering to 2.4 x 1.6 at the
 // neck, a 3.0 x 2.2 knob and a steel wedge. Hammer-local: origin at the grip, +y up the handle, face toward -x.
 void MakeHammer(){
  hammer=Group("Held smithing hammer",Vector3.zero);hammer.SetParent(dynamicRoot,true);
  hammerSteel=Mat("Forged hammer head","646a6c",.86f,.44f);hammerSteel.mainTexture=Resources.Load<Texture2D>("Forge/IronV3");hammerSteel.SetFloat("_Scale",7);hammerSteel.SetFloat("_ObjectSpace",1);hammerSteel.SetFloat("_BumpStrength",.0012f);
  hammerFace=Mat("Polished hammer face","c8cac6",.97f,.80f);hammerFace.mainTexture=Resources.Load<Texture2D>("Forge/SteelV2");hammerFace.SetFloat("_Scale",9);hammerFace.SetFloat("_ObjectSpace",1);hammerFace.SetFloat("_BumpStrength",.0004f);
  hammerWood=Mat("Hickory handle","b48e62",0,.42f);hammerWood.mainTexture=Resources.Load<Texture2D>("Forge/WoodV3");hammerWood.SetFloat("_Scale",9);hammerWood.SetFloat("_ObjectSpace",1);hammerWood.SetFloat("_BumpStrength",.0015f);
  hammerHeadMesh=HammerHeadMesh(arc);var head=MeshObject("Cross peen hammer head",hammerHeadMesh,hammerSteel);head.transform.SetParent(hammer,false);
  hammerHead=head.GetComponent<Renderer>();hammerHead.sharedMaterials=new[]{hammerSteel,hammerFace};
  var handle=MeshObject("Hickory hammer handle",HammerHandleMesh(),hammerWood);handle.transform.SetParent(hammer,false);
  foreach(var r in hammer.GetComponentsInChildren<Renderer>()){r.shadowCastingMode=ShadowCastingMode.Off;r.receiveShadows=false;}
  // Smear ghosts share the head mesh with a translucent lit steel (Forge/Smear).
  var smearShader=Shader.Find(ForgeContract.Shaders.Smear);
  if(smearShader!=null){smearMat=new Material(smearShader){name="Hammer smear"};smearMat.SetColor("_Color",C("4c5255"));smearMat.SetFloat("_Metallic",.7f);smearMat.SetFloat("_Glossiness",.36f);smearProps=new MaterialPropertyBlock();smear=new Transform[4];ghostMesh=HammerGhostMesh();
   for(int i=0;i<smear.Length;i++){var g=MeshObject("Hammer smear ghost",ghostMesh,smearMat);g.transform.SetParent(dynamicRoot,false);var r=g.GetComponent<Renderer>();r.sharedMaterials=new[]{smearMat,smearMat};r.shadowCastingMode=ShadowCastingMode.Off;r.receiveShadows=false;g.SetActive(false);smear[i]=g.transform;}}
 }
 ForgeStrikeTuning toolTuning;
 /// Tune can change the hang and the tong geometry: rebuild the meshes (cheap; once per Tune).
 void RebuildTools(){if(hammerHead!=null){var old=hammerHeadMesh;hammerHeadMesh=HammerHeadMesh(arc);hammerHead.GetComponent<MeshFilter>().sharedMesh=hammerHeadMesh;if(old)Destroy(old);}
  if(tongs!=null){var mf=tongs.GetComponentInChildren<MeshFilter>();if(mf!=null){var old=mf.sharedMesh;mf.sharedMesh=TongMesh(K);if(old)Destroy(old);}float e=K.tongElevDeg*Mathf.Deg2Rad;tongHandLocal=new Vector3(Mathf.Cos(e),Mathf.Sin(e),0)*K.tongHandM;var rein=Quaternion.Euler(0,-K.tongGripDeg,0)*Vector3.left;gripRel=Quaternion.Inverse(TongRotation(rein));}}
 /// Octagonal section (y along the handle, z across) with half sizes a (y), b (z) and corner chamfer c.
 static Vector2[] Octagon(float a,float b,float c){c=Mathf.Min(c,Mathf.Min(a,b)*.95f);return new[]{new Vector2(a,b-c),new Vector2(a-c,b),new Vector2(-(a-c),b),new Vector2(-a,b-c),new Vector2(-a,-(b-c)),new Vector2(-(a-c),-b),new Vector2(a-c,-b),new Vector2(a,-(b-c))};}
 Mesh ghostMesh;
 /// The head alone, unhung, centred on the head's middle (x = GhostCentreX): the smear ghosts stretch it along x.
 static Mesh HammerGhostMesh(){HeadSections(out var v,out var steel,out var face);for(int i=0;i<v.Count;i++)v[i]-=new Vector3(GhostCentreX,0,0);return Faceted(v,steel,face,"Hammer ghost");}
 static Mesh HammerHeadMesh(ForgeHammerArc arc){
  HeadSections(out var v,out var steel,out var face);
  return HeadMesh(arc,v,steel,face);
 }
 /// Head vertices in head-local metres (x along the head, face at -x) and the steel and polished-face triangles.
 static void HeadSections(out List<Vector3> v,out List<int> steel,out List<int> face){
  // Sections along the head axis x: (x, half y, half z, chamfer). Face at -x, cross peen at +x.
  float[,] s={{-.0450f,.0170f,.0170f,.0098f},{-.0432f,.0190f,.0190f,.0110f},{-.0350f,.0186f,.0186f,.0107f},{-.0280f,.0165f,.0165f,.0040f},{-.0240f,.0160f,.0160f,.0030f},{.0250f,.0160f,.0160f,.0030f},
   {.0330f,.0146f,.0160f,.0030f},{.0480f,.0102f,.0160f,.0026f},{.0610f,.0058f,.0158f,.0018f},{.0680f,.0030f,.0155f,.0012f},{.0700f,.0012f,.0150f,.0006f}};
  v=new List<Vector3>();steel=new List<int>();face=new List<int>();int n=s.GetLength(0);var rings=new List<Vector2[]>();
  for(int i=0;i<n;i++)rings.Add(Octagon(s[i,1],s[i,2],s[i,3]));
  // Side quads (flat-shaded: forged facets).
  for(int i=0;i+1<n;i++)for(int j=0;j<8;j++){int j2=(j+1)%8;var a=rings[i][j];var b=rings[i][j2];var c=rings[i+1][j2];var d=rings[i+1][j];int o=v.Count;
   v.Add(new Vector3(s[i,0],a.x,a.y));v.Add(new Vector3(s[i,0],b.x,b.y));v.Add(new Vector3(s[i+1,0],c.x,c.y));v.Add(new Vector3(s[i+1,0],d.x,d.y));
   var list=i==0?face:steel;list.AddRange(new[]{o,o+2,o+1,o,o+3,o+2});}
  // Crowned face (polished) and the peen tip cap.
  {int o=v.Count;v.Add(new Vector3(-.0466f,0,0));for(int j=0;j<8;j++){var a=rings[0][j];v.Add(new Vector3(s[0,0],a.x,a.y));}for(int j=0;j<8;j++)face.AddRange(new[]{o,o+1+j,o+1+(j+1)%8});}
  {int o=v.Count;v.Add(new Vector3(.0706f,0,0));for(int j=0;j<8;j++){var a=rings[n-1][j];v.Add(new Vector3(s[n-1,0],a.x,a.y));}for(int j=0;j<8;j++)steel.AddRange(new[]{o,o+1+(j+1)%8,o+1+j});}
 }
 static Mesh HeadMesh(ForgeHammerArc arc,List<Vector3> v,List<int> steel,List<int> face){
  // Hang the head on the handle and set it on the eye.
  var hang=U(arc.Hang);for(int i=0;i<v.Count;i++)v[i]=new Vector3(0,arc.gripToHead,0)+hang*v[i];
  // Steel wedge in the top of the handle (not hung: it sits in the handle end).
  {float y=arc.gripToHead+.0205f;var w0=v.Count;var lo=new Vector3(-.0105f,y-.0015f,-.0022f);var hi=new Vector3(.0105f,y+.0012f,.0022f);
   var c=new[]{new Vector3(lo.x,lo.y,lo.z),new Vector3(hi.x,lo.y,lo.z),new Vector3(hi.x,hi.y,lo.z),new Vector3(lo.x,hi.y,lo.z),new Vector3(lo.x,lo.y,hi.z),new Vector3(hi.x,lo.y,hi.z),new Vector3(hi.x,hi.y,hi.z),new Vector3(lo.x,hi.y,hi.z)};
   int[][] f={new[]{0,3,2,1},new[]{4,5,6,7},new[]{0,1,5,4},new[]{3,7,6,2},new[]{1,2,6,5},new[]{0,4,7,3}};
   foreach(var q in f){int o=v.Count;foreach(int idx in q)v.Add(c[idx]);steel.AddRange(new[]{o,o+1,o+2,o,o+2,o+3});}}
  return Faceted(v,steel,face,"Cross peen head");
 }
 /// Flat-shaded two-submesh mesh: every triangle gets its own vertices.
 static Mesh Faceted(List<Vector3> v,List<int> a,List<int> b,string name){
  var verts=new List<Vector3>();var ta=new List<int>();var tb=new List<int>();
  foreach(var (src,dst) in new[]{(a,ta),(b,tb)})for(int i=0;i+2<src.Count;i+=3){int o=verts.Count;verts.Add(v[src[i]]);verts.Add(v[src[i+1]]);verts.Add(v[src[i+2]]);dst.AddRange(new[]{o,o+1,o+2});}
  var m=new Mesh{name=name};m.SetVertices(verts);m.subMeshCount=2;m.SetTriangles(ta,0);m.SetTriangles(tb,1);m.RecalculateNormals();m.RecalculateBounds();return m;
 }
 static Mesh HammerHandleMesh(){
  // Sections along y: (y, half x in the swing plane, half z across). Knob at the end, oval grip, slimmer neck.
  float[,] s={{-.0760f,.0105f,.0075f},{-.0735f,.0145f,.0105f},{-.0680f,.0150f,.0110f},{-.0580f,.0134f,.0097f},{-.0440f,.0140f,.0100f},{.0700f,.0140f,.0100f},{.1800f,.0124f,.0084f},{.2400f,.0120f,.0080f},{.2650f,.0122f,.0082f},{.3000f,.0118f,.0079f}};
  const int seg=12;var v=new List<Vector3>();var t=new List<int>();int n=s.GetLength(0);
  for(int i=0;i<n;i++)for(int j=0;j<seg;j++){float a=j*Mathf.PI*2/seg;v.Add(new Vector3(Mathf.Cos(a)*s[i,1],s[i,0],Mathf.Sin(a)*s[i,2]));}
  for(int i=0;i+1<n;i++)for(int j=0;j<seg;j++){int a=i*seg+j,b=i*seg+(j+1)%seg,c=(i+1)*seg+(j+1)%seg,d=(i+1)*seg+j;t.AddRange(new[]{a,b,c,a,c,d});}
  int e0=v.Count;v.Add(new Vector3(0,s[0,0]-.0012f,0));for(int j=0;j<seg;j++)t.AddRange(new[]{e0,(j+1)%seg,j});
  int e1=v.Count;v.Add(new Vector3(0,s[n-1,0],0));for(int j=0;j<seg;j++)t.AddRange(new[]{e1,(n-1)*seg+j,(n-1)*seg+(j+1)%seg});
  var m=new Mesh{name="Hickory handle"};m.SetVertices(v);m.SetTriangles(t,0);m.RecalculateNormals();m.RecalculateBounds();return m;
 }

 // ------------------------------------------------------------------ legacy pose path (one build, LegacyHammer)
 void UpdateLegacyHammer(float raw){
  var yaw=Quaternion.Euler(0,orbitYaw,0);var rest=smith.position+yaw*new Vector3(Narrow?.12f:.28f,1.11f,Narrow?.57f:.43f);var restRotation=yaw*Quaternion.Euler(-9,0,-24);
  if(swinging){float before=swingTime;swingTime+=raw*swingSpeed;float t=swingTime;var impact=ForgeLayout.StrikePoint+new Vector3(.37f,.02f,0);var raised=smith.position+new Vector3(.34f,1.30f,.36f);float angle;
   if(t<.24f){float q=Mathf.SmoothStep(0,1,t/.24f);hammer.position=Vector3.Lerp(rest,raised,q);angle=Mathf.Lerp(-24,-65,q);}
   else if(t<.34f){float q=(t-.24f)/.1f;hammer.position=Vector3.Lerp(raised,impact,q*q);angle=Mathf.Lerp(-65,74,q*q);}
   else {float q=Mathf.Clamp01((t-.34f)/.4f);hammer.position=Vector3.Lerp(impact,rest,Mathf.SmoothStep(0,1,q))+Vector3.up*Mathf.Sin(q*Mathf.PI)*.12f;angle=Mathf.Lerp(74,-24,Mathf.Sqrt(q));}
   hammer.rotation=Quaternion.Euler(0,0,angle);if(before<.34f&&t>=.34f){lastContact=ForgeLayout.StrikePoint;Send("impact",strikeSeq);}if(t>.76f){swinging=false;Send("settled",strikeSeq);}
  }else{hammer.position=Vector3.Lerp(hammer.position,rest,1-Mathf.Exp(-raw*16));hammer.rotation=Quaternion.Slerp(hammer.rotation,restRotation,1-Mathf.Exp(-raw*16));}
 }
 void BeginLegacySwing(){FaceStation("anvil");swinging=true;swingTime=0;swingSpeed=FlowSwing()&&state!=null?state.flowSpeed:1;Send("swing",strikeSeq,"",.34f/swingSpeed*1000);}

 // ------------------------------------------------------------------ telemetry (after Qa('telemetry')), sampled after the Animator
 readonly List<(string ev,int seq,float ms)> telemetryQueue=new List<(string,int,float)>();
 float hearthTelemetryClock;
 /// Queue a telemetry frame for an event (ev: press, swing, windup, apex, down, contact, settled, seated, hitstop, hearth).
 void StrikeTelemetry(string type,int seq,float x){if(!QaOn(ForgeContract.QaModes.Telemetry))return;string ev=type=="impact"?"contact":type;
  if(ev!="press"&&ev!="swing"&&ev!="windup"&&ev!="apex"&&ev!="down"&&ev!="contact"&&ev!="settled"&&ev!="seated"&&ev!="hitstop"&&ev!="hearth")return;telemetryQueue.Add((ev,seq,x));}
 void LateUpdate(){
  if(cam==null)return;
  // Close the hands on the hammer and the reins (after the Animator and IK).
  if(smithAnimator!=null){CurlFingers(1,rightGoalRot,ForgeFeel.Smooth(rightIk));if(tongs!=null)CurlFingers(0,leftGoalRot,1);}
  UpdateOccluders();
  if(!QaOn(ForgeContract.QaModes.Telemetry)){telemetryQueue.Clear();return;}
  if(hearth!=null){hearthTelemetryClock+=ForgeTime.Raw(Time.unscaledDeltaTime);if(hearthTelemetryClock>=.1f){hearthTelemetryClock=0;telemetryQueue.Add(("hearth",hearth.knifeId,hearth.t*1000));}}
  if(telemetryQueue.Count==0)return;var q=telemetryQueue.ToArray();telemetryQueue.Clear();
  foreach(var (ev,seq,ms) in q)SendTelemetry(ev,seq,ms);
 }
 void SendTelemetry(string ev,int seq,float ms){
  var f=new ForgeTelemetry{t=Time.realtimeSinceStartup*1000,ev=ev,seq=seq,ms=ev=="contact"&&strikes.hasCurrent?strikeNow-strikes.current.start:ms,fov=cam.fieldOfView,risk=currentRisk,tier=QualityTier,particles=FxParticleCount(),timeScale=Time.timeScale,view=view.view,kick=kickPitch,trauma=trauma};
  f.pitch=cam.transform.eulerAngles.x;if(f.pitch>180)f.pitch-=360;
  if(hammer!=null){var vp=cam.WorldToViewportPoint(QaHeadPosition);f.headVp[0]=vp.x;f.headVp[1]=vp.y;f.faceDot=Vector3.Dot(hammer.rotation*U(arc.FaceNormalLocal),Vector3.down);f.handToHandle=HandToHandle();}
  var b=AnvilBody();if(b!=null){f.tempC=KnifeTemperature(b);f.headCoverBlade=HeadCoversBlade(b);}
  // Jaw to tang in world metres; -1 while the knife is hidden (scale 0 before the blank appears in the jaws).
  var held=HeldBody();f.jawToTang=held!=null&&held.root.transform.localScale.x>KnifeRootScale*.5f?Vector3.Distance(JawWorld(),held.root.transform.TransformPoint(ForgeLayout.TangGripLocal)):-1;
  Send("telemetry",seq,JsonUtility.ToJson(f));
 }
 /// Measured from the posed bones (after IK and the finger curl), not from the IK goal: where the closed fist's hole is
 /// (in front of the palm, under the proximal phalanges), and its distance to the hammer handle's axis. 0 = the glove
 /// closes on the handle; more means the hand has come off it.
 float HandToHandle(){if(rightHand==null||rightMiddle==null||hammer==null||handOnHammer<.5f)return -1;var fist=FistCentre(true);
  var a=hammer.TransformPoint(new Vector3(0,-.07f,0));var b=hammer.TransformPoint(new Vector3(0,.22f,0));var ab=b-a;float u=Mathf.Clamp01(Vector3.Dot(fist-a,ab)/ab.sqrMagnitude);return Vector3.Distance(fist,a+ab*u);}
 /// The fist's grasp centre from the hand, middle, index and little proximal bones.
 Vector3 FistCentre(bool right){var hand=right?rightHand:leftHand;var mid=right?rightMiddle:leftMiddle;var bones=fingerBones[right?1:0];if(hand==null||mid==null)return Vector3.zero;
  var fingers=(mid.position-hand.position);float len=fingers.magnitude;fingers/=Mathf.Max(1e-4f,len);var ix=bones!=null?bones[3]:null;var li=bones!=null?bones[12]:null;
  var thumbSide=ix!=null&&li!=null?(ix.position-li.position).normalized:Vector3.up;var palm=right?Vector3.Cross(fingers,thumbSide):Vector3.Cross(thumbSide,fingers);
  return hand.position+fingers*(K.gripAlongCm*.01f)+palm.normalized*(K.gripPalmCm*.01f);}
 /// Screen fraction of the blade's box covered by the hammer head's box.
 float HeadCoversBlade(Body b){if(hammerHead==null||b.bladeRenderer==null)return -1;var hb=ScreenRect(hammerHead.bounds);var bb=ScreenRect(b.bladeRenderer.bounds);float area=bb.width*bb.height;if(area<=1e-6f)return -1;
  float ix=Mathf.Max(0,Mathf.Min(hb.xMax,bb.xMax)-Mathf.Max(hb.xMin,bb.xMin)),iy=Mathf.Max(0,Mathf.Min(hb.yMax,bb.yMax)-Mathf.Max(hb.yMin,bb.yMin));return ix*iy/area;}
 Rect ScreenRect(Bounds bounds){float x0=9,y0=9,x1=-9,y1=-9;for(int i=0;i<8;i++){var c=bounds.center+Vector3.Scale(bounds.extents,new Vector3((i&1)==0?-1:1,(i&2)==0?-1:1,(i&4)==0?-1:1));var p=cam.WorldToViewportPoint(c);if(p.z<=0)continue;x0=Mathf.Min(x0,p.x);y0=Mathf.Min(y0,p.y);x1=Mathf.Max(x1,p.x);y1=Mathf.Max(y1,p.y);}return x1<x0?new Rect():Rect.MinMaxRect(x0,y0,x1,y1);}
 /// _ForgeOccluders: hammer head .05, right hand .06, left hand .06, anvil-knife centre .04 (radius 0 = off).
 readonly Vector4[] occluders=new Vector4[4];
 void UpdateOccluders(){
  if(hammer!=null){var h=QaHeadPosition;occluders[0]=new Vector4(h.x,h.y,h.z,.05f);}else occluders[0]=Vector4.zero;
  occluders[1]=rightHand!=null?new Vector4(rightHand.position.x,rightHand.position.y,rightHand.position.z,.06f):Vector4.zero;
  occluders[2]=leftHand!=null?new Vector4(leftHand.position.x,leftHand.position.y,leftHand.position.z,.06f):Vector4.zero;
  var b=AnvilBody();if(b!=null&&b.bladeRenderer!=null&&b.root.activeInHierarchy){var c=b.bladeRenderer.bounds.center;occluders[3]=new Vector4(c.x,c.y,c.z,.04f);}else occluders[3]=Vector4.zero;
  Shader.SetGlobalVectorArray(ForgeContract.Globals.Occluders,occluders);
 }

 // ------------------------------------------------------------------ QA
 void StrikeQa(string mode){
#if UNITY_EDITOR
  if(mode.StartsWith("strike-cam=")){var a=mode.Substring(11).Split(',');if(a.Length>=7){var f=new float[7];for(int i=0;i<7;i++)float.TryParse(a[i],System.Globalization.NumberStyles.Float,System.Globalization.CultureInfo.InvariantCulture,out f[i]);qaCam=true;qaEye=new Vector3(f[0],f[1],f[2]);qaAt=new Vector3(f[3],f[4],f[5]);qaFov=f[6];}else qaCam=false;}
  if(mode=="strike-bones")LogBones();
  if(mode.StartsWith("strike-press="))Strike(mode.Substring(13));
#endif
 }
#if UNITY_EDITOR
 bool qaCam;Vector3 qaEye,qaAt;float qaFov=40;
 /// Editor QA camera override (Qa('strike-cam=ex,ey,ez,tx,ty,tz,fov') / 'strike-cam=off'), applied after the game camera.
 void QaCameraOverride(){if(!qaCam||cam==null)return;cam.transform.position=qaEye;cam.transform.rotation=Quaternion.LookRotation(qaAt-qaEye);cam.fieldOfView=qaFov;shiftX=shiftY=0;cam.ResetProjectionMatrix();}
 void LogBones(){if(smithAnimator==null)return;var names=new[]{HumanBodyBones.RightShoulder,HumanBodyBones.RightUpperArm,HumanBodyBones.RightLowerArm,HumanBodyBones.RightHand,HumanBodyBones.RightMiddleProximal,HumanBodyBones.LeftUpperArm,HumanBodyBones.LeftLowerArm,HumanBodyBones.LeftHand,HumanBodyBones.LeftMiddleProximal,HumanBodyBones.Chest,HumanBodyBones.Head};
  var sb=new System.Text.StringBuilder("FORGE_BONES ");foreach(var n in names){var t=smithAnimator.GetBoneTransform(n);if(t!=null)sb.Append(n).Append(' ').Append(ToSmith(t.position).ToString("F3")).Append(" rot ").Append((Quaternion.Inverse(SmithYaw)*t.rotation).eulerAngles.ToString("F1")).Append("; ");}
  foreach(var (side,goalRot,goalPos,hand,mid,thumb,index,little) in new[]{("R",rightGoalRot,rightGoalPos,HumanBodyBones.RightHand,HumanBodyBones.RightMiddleProximal,HumanBodyBones.RightThumbProximal,HumanBodyBones.RightIndexProximal,HumanBodyBones.RightLittleProximal),("L",leftGoalRot,leftGoalPos,HumanBodyBones.LeftHand,HumanBodyBones.LeftMiddleProximal,HumanBodyBones.LeftThumbProximal,HumanBodyBones.LeftIndexProximal,HumanBodyBones.LeftLittleProximal)}){
   var h=smithAnimator.GetBoneTransform(hand);var m=smithAnimator.GetBoneTransform(mid);var th=smithAnimator.GetBoneTransform(thumb);var ix=smithAnimator.GetBoneTransform(index);var li=smithAnimator.GetBoneTransform(little);if(h==null||m==null)continue;var inv=Quaternion.Inverse(goalRot);
   sb.Append(side).Append("goal F ").Append((inv*(m.position-h.position)).ToString("F4")).Append(" T ").Append(th!=null?(inv*(th.position-h.position)).ToString("F4"):"-").Append(" I ").Append(ix!=null?(inv*(ix.position-h.position)).ToString("F4"):"-").Append(" Li ").Append(li!=null?(inv*(li.position-h.position)).ToString("F4"):"-")
     .Append(" boneErr ").Append(Quaternion.Angle(goalRot,h.rotation).ToString("F1")).Append(" posErr ").Append(Vector3.Distance(goalPos,h.position).ToString("F3")).Append(" rotOff ").Append((inv*h.rotation).eulerAngles.ToString("F1")).Append("; ");}
  if(hammer!=null)sb.Append("hammer grip ").Append(ToSmith(hammer.position).ToString("F3")).Append(" fist ").Append(rightHand!=null?ToSmith(FistCentre(true)).ToString("F3"):"-").Append(" handToHandle ").Append(HandToHandle().ToString("F3"));
  Debug.Log(sb.ToString());}
 /// Snapshot QA: hold the camera at a yaw and pitch (degrees; positive pitch looks down).
 public void QaLook(float yaw,float pitch){workFocus=false;route=null;orbitYaw=yaw;orbitPitch=Mathf.Clamp(pitch,K.pitchMinDeg,K.pitchMaxDeg);}
 /// Snapshot QA: look at a station spot from the current eye.
 public void QaLookAt(string spot){if(cam==null||!spots.ContainsKey(spot))return;var d=spots[spot]-cam.transform.position;QaLook(Mathf.Atan2(d.x,d.z)*Mathf.Rad2Deg,-Mathf.Atan2(d.y,new Vector2(d.x,d.z).magnitude)*Mathf.Rad2Deg);}
#endif
}
