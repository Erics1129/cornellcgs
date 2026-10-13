// sources: Assets/Scripts/ForgeFeel.cs Assets/Scripts/ForgeTime.cs Assets/Scripts/ForgeTuning.cs Assets/Scripts/ForgeHeatMath.cs Assets/Scripts/ForgeFlicker.cs Assets/Scripts/ForgeLayoutData.cs
// strike-feel: swing timing, the strike state machine (spacing, buffering, one contact per accepted press), the
// hammer arc (flat face, reach, speed, frustum, work occlusion), tong reach, camera springs and the hearth timeline.
using System;
using System.Collections.Generic;
using L=ForgeLayoutData;

static class ForgeFeelTests {
 static int failures, checks;
 static void Check(bool ok,string what){checks++;if(!ok){failures++;Console.WriteLine("FAIL ForgeFeelTests: "+what);}}
 static FV V(L.F3 v)=>new FV(v.x,v.y,v.z);
 static readonly FV Stance=V(L.SmithAnvilStance), Contact=V(L.StrikePoint);

 // ---------- the camera of the work view ----------
 struct View { public string name; public float cssW,cssH,top,bottom,fov,aspect,shiftX,shiftY; }
 static View MakeView(string name,float w,float h,float top,float bottom,ForgeStrikeTuning t){
  var v=new View{name=name,cssW=w,cssH=h,top=top,bottom=bottom,aspect=w/h};
  ForgeFraming.BandSize(w,h,top,0,bottom,0,out float bh,out float bw);ForgeFraming.BandCentre(w,h,top,0,bottom,0,out v.shiftX,out v.shiftY);
  float dist=(Look(t)-V(L.WorkEye)).Length;
  v.fov=ForgeFraming.FitFov(t.frameTargetW,t.frameTargetH,dist,v.aspect,bh,bw,t.frameFill,t.frameWidthFill,t.fovMin,t.fovMax);return v;
 }
 static ForgeStrikeTuning tk;
 static FV Look(ForgeStrikeTuning t)=>V(L.WorkLook)+new FV(t.frameShiftX,0,0);
 static FQ WorkRot()=>FQ.LookRotation(Look(tk)-V(L.WorkEye),FV.Up);
 static bool Project(View v,FV world,out float x,out float y){var c=ForgeFraming.ToCamera(world,V(L.WorkEye),WorkRot());return ForgeFraming.Viewport(c,v.fov,v.aspect,v.shiftX,v.shiftY,out x,out y);}
 struct Box2 { public float x0,y0,x1,y1; public float Area=>Math.Max(0,x1-x0)*Math.Max(0,y1-y0); }
 static Box2 ScreenBox(View v,IEnumerable<FV> pts){var b=new Box2{x0=9,y0=9,x1=-9,y1=-9};foreach(var p in pts){if(!Project(v,p,out float x,out float y))continue;b.x0=Math.Min(b.x0,x);b.y0=Math.Min(b.y0,y);b.x1=Math.Max(b.x1,x);b.y1=Math.Max(b.y1,y);}return b;}
 static float Overlap(Box2 a,Box2 b){var i=new Box2{x0=Math.Max(a.x0,b.x0),y0=Math.Max(a.y0,b.y0),x1=Math.Min(a.x1,b.x1),y1=Math.Min(a.y1,b.y1)};return b.Area>0?i.Area/b.Area:0;}
 /// World corners of the hammer head for a pose given in smith-local metres.
 static IEnumerable<FV> HeadCorners(ForgeHammerArc arc,ForgeHammerPose p){foreach(float x in new[]{-.045f,.07f})foreach(float y in new[]{-.016f,.016f})foreach(float z in new[]{-.016f,.016f})yield return Stance+p.grip+p.rot*(arc.HeadLocal+arc.Hang*new FV(x,y,z));}
 static IEnumerable<FV> BladeCorners(float rootX){foreach(float x in new[]{rootX,rootX+.24f})foreach(float z in new[]{-.018f,.026f})foreach(float y in new[]{-.003f,.003f})yield return new FV(x,L.StrikePoint.y+y,L.StrikePoint.z+z);}
 static ForgeHammerArc Arc(ForgeStrikeTuning t,FV contactWorld){var a=new ForgeHammerArc{tuning=t};a.Solve(contactWorld-Stance);return a;}

 static int Main(){
  var t=new ForgeTuning();t.Clamp();var k=t.strike;tk=k;
  // ---------- 1. Swing timing ----------
  var sched=new ForgeSwingScheduler{tuning=k};
  var p=sched.Plan(1,0,false,0,0);Check(Math.Abs(p.contact-190)<=5,"contact from ready at "+p.contact+" ms (190 +/- 5)");
  var pr=sched.Plan(1,0,false,0,1);Check(pr.contact<=k.firstContactBudgetMs&&pr.contact>=190,"contact from rest at "+pr.contact+" ms (<= 225)");
  var pf=sched.Plan(1,0,true,0,0);Check(Math.Abs(pf.contact-125)<=5,"Flow contact at "+pf.contact+" ms (125 +/- 5)");
  Check(p.down>=60&&p.down<=80&&pf.down>=55&&pf.down<=80,"downstroke "+p.down+" / "+pf.down+" ms");
  Console.WriteLine($"  contact {p.contact} ms (rest {pr.contact}, Flow {pf.contact}); settle {p.settle} / Flow {pf.settle}");
  // Risk holds the apex: p = .5 adds 40 + 20 = 60 ms; capped at 80; none in Flow.
  Check(Math.Abs(sched.Plan(1,0,false,.5f,0).hold-(k.apexHoldMs+60))<.01f&&sched.Plan(1,0,false,.95f,0).hold<=k.apexHoldMs+80.01f&&sched.Plan(1,0,true,.9f,0).hold==0,"risk apex hold");

  // ---------- 2. Hammer arc ----------
  var arc=Arc(k,Contact);
  var c0=arc.Arc(0,0);var apex=arc.Arc(1,1);
  float faceDot=FV.Dot(arc.FaceNormal(c0),new FV(0,-1,0));Check(faceDot>=MathF.Cos(3*ForgeFeel.Deg),"face flat at contact: dot "+faceDot.ToString("0.0000"));
  var faceAt=Stance+arc.Face(c0);Check(FV.Distance(faceAt,Contact)<.002f,"face centre on the contact point ("+faceAt+")");
  var apexOff=arc.Head(apex)-arc.Head(c0);float apexFace=MathF.Acos(ForgeFeel.Clamp(-arc.FaceNormal(apex).y,-1,1))/ForgeFeel.Deg;
  Console.WriteLine($"  apex head offset from contact {apexOff} (plan (+.07,+.28,-.14)); face pitched {apexFace:0} deg; elbow-to-head radius {(arc.Head(c0)-arc.elbow0).Length:0.000} m");
  Check(apexOff.y>=.22f&&apexOff.y<=.42f,"apex height "+apexOff.y.ToString("0.000"));
  float rHead=(arc.Head(c0)-arc.elbow0).Length;Check(rHead>=.52f&&rHead<=.64f,"elbow-to-head radius "+rHead.ToString("0.000")+" (critique .55-.60)");
  // Reach: the grip is reachable with a bent elbow at contact, apex, ready and park.
  foreach(var (name,pose) in new[]{("contact",c0),("apex",apex),("ready",arc.Ready())}){float d=(pose.grip-arc.shoulder).Length,b=ForgeTongModel.Bend(arc.shoulder,pose.grip);Console.WriteLine($"  right shoulder to grip at {name}: {d:0.000} m, bend {b:0.0} deg");Check(d<=.60f&&b>=15,"right arm reach at "+name);}
  // Downstroke speed: the head accelerates to 6-10 m/s at contact; the wrist snaps in the last 30%.
  float peak=0,atContact=0;var prev=arc.Head(apex);int n=200;
  for(int i=1;i<=n;i++){float u=i/(float)n;var hp=arc.Head(arc.Arc(1-ForgeFeel.DownElbow(u,k.elbowPower),1-ForgeFeel.DownWrist(u,k.wristSnapFrom,k.wristPower)));float v=(hp-prev).Length/(k.downstrokeMs/1000f/n);peak=Math.Max(peak,v);if(i==n)atContact=v;prev=hp;}
  Console.WriteLine($"  downstroke peak head speed {peak:0.0} m/s (at contact {atContact:0.0})");Check(peak>=6&&peak<=10,"peak head speed "+peak.ToString("0.0")+" m/s");
  // At least 35% of the lift within the first 16.7 ms frame (from ready and from rest).
  foreach(var (from,label,w) in new[]{(arc.Ready(),"ready",k.windupMs),(arc.Park(Contact-Stance+new FV(k.parkRight,.017f,-k.parkBack)),"park",k.firstWindupMs)}){
   float y0=arc.Head(from).y,y1=arc.Head(apex).y;var f=ForgeHammerPose.Blend(from,apex,ForgeFeel.WindupEase(16.7f/w,w));float frac=(arc.Head(f).y-y0)/(y1-y0);
   Console.WriteLine($"  lift in the first 16.7 ms from {label} ({w} ms windup): {frac*100:0}%");Check(frac>=.35f,"first-frame lift from "+label+" "+frac.ToString("0.00"));}
  // Rebound heights.
  foreach(var o in new[]{"dull","good","chip","perfect","shatter"}){float h=ForgeFeel.ReboundM(k,o,false);var rb=arc.Rebound(h,0,0);float rise=arc.Head(rb).y-arc.Head(c0).y;Check(Math.Abs(rise-h)<.006f,"rebound "+o+" rises "+rise.ToString("0.000")+" (want "+h+")");}

  // ---------- 3. Frustum and occlusion on every view ----------
  var views=new[]{MakeView("desktop",1440,900,70,150,k),MakeView("desktop-nohud",1440,900,0,0,k),MakeView("phone-portrait",390,844,150,230,k),MakeView("phone-landscape",844,390,56,92,k)};
  foreach(var v in views){
   Console.WriteLine($"  {v.name}: fov {v.fov:0.0} deg, shift ({v.shiftX:0.00},{v.shiftY:0.00})");
   float minX=1,maxX=0,minY=1,maxY=0;
   // Press to contact: from park (first strike) and from ready, through windup, hold and downstroke, at several feed positions.
   foreach(float u in new[]{k.feedFrom,.5f,k.feedTo}){
    float L0=.24f,rootX=ForgeFeel.RootX(k,L.StrikePoint.x,u,L0);float cx=ForgeFeel.ContactX(k,L.StrikePoint.x,u,L0);
    var a=Arc(k,new FV(cx,Contact.y,Contact.z));
    var park=a.Park(new FV(cx,Contact.y,Contact.z)-Stance+new FV(k.parkRight,.017f,-k.parkBack));
    foreach(var from in new[]{a.Ready(),park})for(int i=0;i<=40;i++){float s=i/40f;ForgeHammerPose pose=s<.5f?ForgeHammerPose.Blend(from,a.Arc(1,1),ForgeFeel.WindupEase(s*2,k.windupMs)):a.Arc(1-ForgeFeel.DownElbow((s-.5f)*2,k.elbowPower),1-ForgeFeel.DownWrist((s-.5f)*2,k.wristSnapFrom,k.wristPower));
     if(Project(v,Stance+a.Head(pose),out float x,out float y)){minX=Math.Min(minX,x);maxX=Math.Max(maxX,x);minY=Math.Min(minY,y);maxY=Math.Max(maxY,y);}else{minX=-1;}}
    var blade=ScreenBox(v,BladeCorners(rootX));
    float ovReady=Overlap(ScreenBox(v,HeadCorners(a,a.Ready())),blade),ovPark=Overlap(ScreenBox(v,HeadCorners(a,park)),blade);
    Check(ovReady<=.10f,$"{v.name} u {u:0.00}: ready head covers {ovReady*100:0}% of the blade box");Check(ovPark<=.10f,$"{v.name} u {u:0.00}: parked head covers {ovPark*100:0}% of the blade box");
    if(u==.5f)Console.WriteLine($"    ready covers {ovReady*100:0.0}% / park {ovPark*100:0.0}% of the blade box; blade box {blade.x0:0.00}-{blade.x1:0.00} x {blade.y0:0.00}-{blade.y1:0.00}");
   }
   Console.WriteLine($"    head viewport x {minX:0.00}-{maxX:0.00}, y {minY:0.00}-{maxY:0.00}");
   Check(minX>=.02f&&maxX<=.98f&&minY>=.02f&&maxY<=.98f,v.name+" head leaves the frustum between press and contact");
   // The strike point sits in the free band.
   Project(v,Contact,out float sx,out float sy);float bandLo=v.bottom/v.cssH,bandHi=1-v.top/v.cssH;Check(sy>bandLo&&sy<bandHi,v.name+" strike point outside the free band");
  }
  Check(Math.Abs(views[0].fov-42)<=4&&Math.Abs(views[2].fov-62)<=6&&Math.Abs(views[3].fov-46)<=6,"fitted FOVs near the plan's 42 / 62 / 46");

  // ---------- 4. The strike machine: spacing, buffering, exactly one contact per accepted press ----------
  var rng=new Random(20261012);var ev=new List<ForgeStrikeEvent>();int schedules=10000,bad=0;float minNormal=1e9f,minFlow=1e9f;
  for(int sIdx=0;sIdx<schedules;sIdx++){
   var m=new ForgeStrikeMachine{tuning=k};bool flowRun=rng.NextDouble()<.5;float dt=1000f/(new[]{30f,60f,120f,144f}[rng.Next(4)]);
   var presses=new List<float>();float tp=(float)rng.NextDouble()*200;int count=4+rng.Next(10);for(int i=0;i<count;i++){presses.Add(tp);tp+=(float)rng.NextDouble()*2000*(rng.NextDouble()<.5?.3f:1);}
   var accepted=new HashSet<int>();var contacts=new Dictionary<int,int>();var settles=new Dictionary<int,int>();var cancelled=new HashSet<int>();float lastC=float.NegativeInfinity;bool lastFlow=false;
   int pi=0,seq=0;for(float now=0;now<tp+3000;now+=dt){
    while(pi<presses.Count&&presses[pi]<=now){seq++;bool flow=flowRun&&rng.NextDouble()<.85;var r=m.Press(seq,now,flow,(float)rng.NextDouble()*.7f,(float)rng.NextDouble(),float.NegativeInfinity,out _);if(r!=ForgeStrikeAccept.Refused)accepted.Add(seq);
     // A press after contact + 150 ms with nothing queued is always accepted.
     if(m.contacted&&r==ForgeStrikeAccept.Refused&&now>=m.contactAt+k.scheduleAfterContactMs&&m.hasQueued==false){bad++;}
     pi++;}
    ev.Clear();m.Step(now,ev);
    foreach(var e in ev){if(e.kind==ForgeStrikeEventKind.Contact){contacts[e.seq]=contacts.TryGetValue(e.seq,out int c)?c+1:1;float gap=e.at-lastC;if(!float.IsNegativeInfinity(lastC)){float need=e.flow?k.flowCycleMs:k.cycleMs;if(gap<need-1e-3f||gap<k.minImpactGapMs)bad++;if(e.flow)minFlow=Math.Min(minFlow,gap);else minNormal=Math.Min(minNormal,gap);}lastC=e.at;lastFlow=e.flow;}
     else if(e.kind==ForgeStrikeEventKind.Settled)settles[e.seq]=settles.TryGetValue(e.seq,out int c2)?c2+1:1;else cancelled.Add(e.seq);}
    if(rng.NextDouble()<.0005){ev.Clear();m.Cancel(now,ev);foreach(var e in ev)cancelled.Add(e.seq);}
   }
   foreach(var a in accepted){bool c=contacts.TryGetValue(a,out int cn)&&cn==1&&settles.TryGetValue(a,out int sn)&&sn==1;if(!(c||cancelled.Contains(a)&&!contacts.ContainsKey(a)))bad++;}
   foreach(var c in contacts.Keys)if(!accepted.Contains(c))bad++;
  }
  Console.WriteLine($"  {schedules} random schedules: closest contacts {minNormal:0.0} ms normal, {minFlow:0.0} ms Flow; violations {bad}");
  Check(bad==0,"strike machine violations: "+bad);Check(minNormal>=640-1e-3f&&minFlow>=595-1e-3f,"contact spacing");

  // ---------- 5. Rhythm cases ----------
  {// A second press 150-450 ms after an impact yields exactly one more impact 640-660 ms after the first (Flow 595-615).
   foreach(bool flow in new[]{false,true})foreach(float after in new[]{150f,250f,350f,450f}){var m=new ForgeStrikeMachine{tuning=k};m.Press(1,0,flow,0,0,float.NegativeInfinity,out _);var cs=new List<float>();bool pressed=false;
    for(float now=0;now<2000;now+=1000/120f){ev.Clear();m.Step(now,ev);foreach(var e in ev)if(e.kind==ForgeStrikeEventKind.Contact)cs.Add(e.at);if(!pressed&&cs.Count==1&&now>=cs[0]+after){pressed=true;Check(m.Press(2,now,flow,0,0,float.NegativeInfinity,out _)!=ForgeStrikeAccept.Refused,"press "+after+" ms after impact accepted");}}
    float gap=cs.Count==2?cs[1]-cs[0]:-1;float lo=flow?595:640;Check(cs.Count==2&&gap>=lo&&gap<=lo+20,(flow?"Flow ":"")+"second impact "+gap+" ms after the first (press "+after+" ms after)");}
   // A press 0-140 ms after an impact yields none.
   foreach(float after in new[]{0f,60f,140f}){var m=new ForgeStrikeMachine{tuning=k};m.Press(1,0,false,0,0,float.NegativeInfinity,out _);bool refused=false,pressed=false;for(float now=0;now<1500;now+=1000/120f){ev.Clear();m.Step(now,ev);if(!pressed&&m.contacted&&now>=m.contactAt+after){pressed=true;refused=m.Press(2,now,false,0,0,float.NegativeInfinity,out _)==ForgeStrikeAccept.Refused;}}Check(refused,"press "+after+" ms after impact refused");}
   // Ten strikes with immediate re-presses (a press every frame) take at most 6.1 s; 25 presses in 3 s give 5 +/- 1 (Flow 6 +/- 1).
   {var m=new ForgeStrikeMachine{tuning=k};int seq=0,contactsN=0;float tenth=0;for(float now=0;now<8000&&contactsN<10;now+=1000/60f){seq++;m.Press(seq,now,false,0,0,float.NegativeInfinity,out _);ev.Clear();m.Step(now,ev);foreach(var e in ev)if(e.kind==ForgeStrikeEventKind.Contact){contactsN++;tenth=e.at;}}
    Console.WriteLine($"  ten mashed strikes: tenth contact at {tenth:0} ms");Check(contactsN==10&&tenth<=6100,"ten strikes in "+tenth+" ms");}
   foreach(bool flow in new[]{false,true}){var m=new ForgeStrikeMachine{tuning=k};int seq=0,cn=0;for(float now=0;now<3000;now+=1000/120f){if(seq<25&&now>=seq*120){seq++;m.Press(seq,now,flow,0,0,float.NegativeInfinity,out _);}ev.Clear();m.Step(now,ev);foreach(var e in ev)if(e.kind==ForgeStrikeEventKind.Contact)cn++;}
    Console.WriteLine($"  25 presses in 3 s: {cn} impacts{(flow?" (Flow)":"")}");Check(flow?Math.Abs(cn-6)<=1:Math.Abs(cn-5)<=1,"25 presses in 3 s gave "+cn);}
   // The seated wait delays the first windup by at most seatWaitMs.
   {var m=new ForgeStrikeMachine{tuning=k};m.Press(1,100,false,0,0,100+k.seatWaitMs,out var sp);Check(Math.Abs(sp.start-(100+k.seatWaitMs))<.01f,"seat wait");}
  }

  // ---------- 6. Camera springs and trauma ----------
  {float x=1,v=0;float tt=0;for(int i=0;i<160;i++){ForgeFeel.SpringStep(ref x,ref v,0,k.kickOmega,.001f);tt+=.001f;}Check(Math.Abs(x)<=.05f,"kick spring has "+(x*100).ToString("0.0")+"% left at 160 ms");
   float closed=ForgeFeel.Spring(1,0,k.kickOmega,.16f);Check(Math.Abs(closed-x)<.002f,"spring step matches the closed form");
   float tr=.55f;float ms=0;while(tr>0&&ms<1000){tr=ForgeFeel.Decay(tr,k.traumaDecayPerS,.001f);ms++;}Check(ms<=221,"trauma .55 reaches 0 after "+ms+" ms");
   // Hit-stop table, Flow halving, reduced motion.
   Check(ForgeFeel.HitStopMs(k,"dull",false,false,false,false)==16&&ForgeFeel.HitStopMs(k,"good",false,false,false,false)==45&&ForgeFeel.HitStopMs(k,"chip",false,false,false,false)==65&&ForgeFeel.HitStopMs(k,"perfect",false,false,false,false)==85&&ForgeFeel.HitStopMs(k,"good",true,false,false,false)==110&&ForgeFeel.HitStopMs(k,"shatter",false,false,false,false)==130,"hit-stop table");
   Check(ForgeFeel.HitStopMs(k,"perfect",false,false,true,false)==42.5f&&ForgeFeel.HitStopMs(k,"shatter",false,false,false,true)==0,"Flow halves, reduced removes");
   Check(k.hitStopShatter+k.shatterSlowMs+k.shatterRampMs<ForgeTime.WatchdogSeconds*1000,"shatter stop plus slow-mo under the watchdog");
   ForgeFeel.Kick(k,"chip",false,false,out float kp,out float kd,out float kr);Check(kp==.8f&&kd==3.5f&&kr==.4f,"chip kick");
   Check(ForgeFeel.Trauma(k,"good",false)==0&&ForgeFeel.Trauma(k,"perfect",false)==0&&ForgeFeel.Trauma(k,"shatter",false)>.5f,"trauma only for evolution and shatter");
  }

  // ---------- 7. Tongs: the left hand reaches the reins at the anvil (every feed) and at the firebed ----------
  {var ls=Stance+V(L.LeftShoulderLocal);
   foreach(float u in new[]{k.feedFrom,.5f,k.feedTo}){float rootX=ForgeFeel.RootX(k,L.StrikePoint.x,u,.24f);var jaws=new FV(rootX+L.TangGripLocal.x*L.KnifeScale,L.StrikePoint.y,L.StrikePoint.z);var rein=ForgeTongModel.ReinDir(k,jaws,new FV(-1,0,0),ls);var hand=ForgeTongModel.Hand(k,jaws,rein);float d=(hand-ls).Length,b=ForgeTongModel.Bend(ls,hand);
    Console.WriteLine($"  tongs at the anvil (u {u:0.00}): left shoulder to hand {d:0.000} m, bend {b:0.0} deg, hand {hand}");Check(d<=.60f&&b>=15,"tong reach at the anvil, u "+u);}
   var hs=V(L.HearthStance);var lh=hs+(FQ.AngleAxis(L.HearthYawDeg,FV.Up)*V(L.LeftShoulderLocal));var fire=V(L.Firebed);
   var reinH=(lh-fire);reinH.y=0;reinH=reinH.Normalized;var handH=ForgeTongModel.Hand(k,fire,reinH);float dh=(handH-lh).Length,bh=ForgeTongModel.Bend(lh,handH);
   Console.WriteLine($"  tongs at the firebed: left shoulder to hand {dh:0.000} m, bend {bh:0.0} deg");Check(dh<=.60f&&bh>=15,"tong reach at the firebed");
   var rh=hs+(FQ.AngleAxis(L.HearthYawDeg,FV.Up)*V(L.RightShoulderLocal));var bell=V(L.BellowsHandle);float db=(bell-rh).Length,db2=(bell-new FV(0,.01f*k.bellowsPullCm,0)-rh).Length;Check(db<=.60f&&db2<=.62f,"bellows handle and its pulled position within the right hand's reach ("+db.ToString("0.000")+", "+db2.ToString("0.000")+")");
  }

  // ---------- 8. Hearth timeline ----------
  {float step=(V(L.HearthStance)-Stance).Length;float peakV=0;float prevS=0;for(float tt=0;tt<=2.4f;tt+=.001f){float s=ForgeHearth.Step(k,tt);peakV=Math.Max(peakV,MathF.Abs(s-prevS)*step/.001f);prevS=s;}
   Console.WriteLine($"  hearth step {step:0.000} m in {k.hearthStepS} s, peak {peakV:0.00} m/s; back at the anvil at {ForgeHearth.BackAt(k):0.00} s");
   Check(k.hearthStepS>=.5f&&peakV<=1.6f,"comfortable hearth step");
   float lookOn=0;for(float tt=0;tt<2;tt+=.001f)if(ForgeHearth.Look(k,tt)>.85f)lookOn+=.001f;Console.WriteLine($"  camera on the firebed {lookOn:0.00} s of the 2.0 s heat");Check(lookOn>=1.2f,"firebed in view for "+lookOn.ToString("0.00")+" s");
   float heat=2.0f,seatAt=Math.Max(heat,ForgeHearth.BackAt(k));float seated=seatAt+k.seatS;Check(seated-heat<=.25f,"seated "+((seated-heat)*1000).ToString("0")+" ms after the heat event");
   Check(ForgeHearth.Plunge(k,.3f)==0&&ForgeHearth.Plunge(k,1.0f)==1&&ForgeHearth.Plunge(k,k.hearthPullS+k.hearthPullDurS+.01f)==0,"plunge in and out");
   Check(ForgeHearth.Bellows(k,k.bellowsPull1S)>.95f&&ForgeHearth.Bellows(k,k.bellowsPull2S)>.95f&&ForgeHearth.Bellows(k,.2f)==0,"two bellows strokes");
   Check(ForgeHearth.At(k,.1f,2)==ForgeHearth.Phase.StepOut&&ForgeHearth.At(k,1,2)==ForgeHearth.Phase.Heat&&ForgeHearth.At(k,2.03f,2.1f)==ForgeHearth.Phase.StepBack||ForgeHearth.At(k,2.03f,2.1f)==ForgeHearth.Phase.Hover,"hearth phases");
  }

  // ---------- 9. Feed, walk bob, quaternion sanity ----------
  {Check(Math.Abs(ForgeFeel.FeedU(k,0)-k.feedFrom)<1e-5f&&Math.Abs(ForgeFeel.FeedU(k,7)-k.feedTo)<1e-5f&&ForgeFeel.FeedRolls(8)&&!ForgeFeel.FeedRolls(7),"feed walks 20%-76% and rolls every 8");
   float span=(k.feedTo-k.feedFrom)*.24f;Console.WriteLine($"  contact walks {span*100:0.0} cm along the blade over 8 strikes");Check(span>=.12f,"contact walk span");
   Check(ForgeWalkBob.Steps(0,1)==2&&ForgeWalkBob.Steps(.2f,.3f)==1,"two footfalls per stride");
   var q=FQ.Euler(30,40,10);var v=q*new FV(0,0,1);var lr=FQ.LookRotation(v,FV.Up);Check(FV.Distance(lr*new FV(0,0,1),v.Normalized)<1e-4f,"look rotation");
   Check(FV.Distance(FQ.AngleAxis(90,FV.Right)*new FV(0,0,1),new FV(0,-1,0))<1e-5f,"Unity rotation convention");
  }
  if(failures>0){Console.WriteLine($"FAIL ForgeFeelTests: {failures} of {checks} checks failed");return 1;}
  Console.WriteLine($"PASS ForgeFeelTests ({checks} checks)");return 0;
 }
}
