// sources: Assets/Scripts/ForgeTuning.cs Assets/Scripts/ForgeFeel.cs Assets/Scripts/ForgeHeatMath.cs Assets/Scripts/ForgeFlicker.cs Assets/Scripts/ForgeBladeMath.cs
// hot-metal-vfx: blackbody colour through the invariant tonemap, the presentation-only temperature model,
// flake cooling, the knife shape (draw-out, notch, fittings) and the shatter pieces.
using System;
using System.Collections.Generic;

static class ForgeHeatTests {
 static int failures, checks;
 static void Check(bool ok,string what){checks++;if(!ok){failures++;Console.WriteLine("FAIL ForgeHeatTests: "+what);}}
 static void Info(string s)=>Console.WriteLine("  "+s);

 // knives.ts PROFILES and profile(): x * (1 + stage * .065), y * (1 + stage * .085).
 static readonly float[][] Profiles={
  new float[]{0,-.14f,.85f,-.13f,1.75f,.02f,1.35f,.26f,0,.21f},
  new float[]{0,-.25f,.8f,-.26f,1.3f,-.23f,1.8f,-.18f,2.3f,-.08f,2.02f,.16f,1.7f,.34f,1.3f,.46f,.6f,.53f,0,.5f},
  new float[]{0,-.18f,1.8f,-.18f,1.92f,.58f,.15f,.63f,0,.47f},
  new float[]{0,-.18f,.7f,-.18f,1.3f,-.13f,1.72f,-.01f,2.15f,.14f,1.83f,.29f,1.55f,.37f,1.15f,.42f,.6f,.43f,0,.4f},
  new float[]{0,0,.6f,-.28f,2.5f,.03f,.6f,.32f,0,.07f},
  new float[]{0,-.15f,1.75f,-.15f,2.12f,.19f,1.8f,.34f,0,.29f},
  new float[]{0,-.14f,.4f,-.06f,.7f,-.06f,1,-.2f,1.25f,-.32f,1.65f,-.3f,2.1f,-.14f,2.06f,.12f,1.87f,.32f,1.5f,.5f,1.2f,.53f,.82f,.45f,.52f,.33f,0,.2f},
  new float[]{0,-.13f,.45f,-.08f,.75f,-.14f,1.03f,-.29f,1.27f,-.53f,1.5f,-.87f,1.58f,-1.05f,1.59f,-.65f,1.5f,-.29f,1.35f,.04f,1.12f,.28f,.83f,.4f,.45f,.34f,0,.18f},
 };
 static readonly int[] Evolutions={0,3,6,9,12,15};
 static int Stage(int level){int s=0;foreach(var e in Evolutions)if(level>=e)s++;return s-1;}
 static void Profile(int family,int level,out float[] x,out float[] z){var p=Profiles[family];int n=p.Length/2,st=Stage(level);x=new float[n];z=new float[n];for(int i=0;i<n;i++){x[i]=p[i*2]*(1+st*.065f);z[i]=p[i*2+1]*(1+st*.085f);}}

 // sRGB (0..1 encoded) -> CIE Lab (D65), and CIEDE2000.
 static void Lab(float r,float g,float b,out double L,out double A,out double B){
  double R=ForgeHeatMath.Decode(r),G=ForgeHeatMath.Decode(g),Bl=ForgeHeatMath.Decode(b);
  double X=.4124*R+.3576*G+.1805*Bl,Y=.2126*R+.7152*G+.0722*Bl,Z=.0193*R+.1192*G+.9505*Bl;X/=.95047;Z/=1.08883;
  Func<double,double> f=t=>t>.008856?Math.Pow(t,1/3.0):7.787*t+16/116.0;double fx=f(X),fy=f(Y),fz=f(Z);L=116*fy-16;A=500*(fx-fy);B=200*(fy-fz);
 }
 static double DeltaE2000(double L1,double a1,double b1,double L2,double a2,double b2){
  double C1=Math.Sqrt(a1*a1+b1*b1),C2=Math.Sqrt(a2*a2+b2*b2),Cb=(C1+C2)/2,G=.5*(1-Math.Sqrt(Math.Pow(Cb,7)/(Math.Pow(Cb,7)+Math.Pow(25,7))));
  double a1p=(1+G)*a1,a2p=(1+G)*a2,C1p=Math.Sqrt(a1p*a1p+b1*b1),C2p=Math.Sqrt(a2p*a2p+b2*b2);
  double h1p=Math.Atan2(b1,a1p)*180/Math.PI;if(h1p<0)h1p+=360;double h2p=Math.Atan2(b2,a2p)*180/Math.PI;if(h2p<0)h2p+=360;
  double dLp=L2-L1,dCp=C2p-C1p,dhp=0;if(C1p*C2p!=0){dhp=h2p-h1p;if(dhp>180)dhp-=360;else if(dhp<-180)dhp+=360;}
  double dHp=2*Math.Sqrt(C1p*C2p)*Math.Sin(dhp*Math.PI/360);
  double Lbp=(L1+L2)/2,Cbp=(C1p+C2p)/2,hbp=h1p+h2p;if(C1p*C2p!=0){if(Math.Abs(h1p-h2p)>180)hbp+=hbp<360?360:-360;hbp/=2;}
  double T=1-.17*Math.Cos((hbp-30)*Math.PI/180)+.24*Math.Cos(2*hbp*Math.PI/180)+.32*Math.Cos((3*hbp+6)*Math.PI/180)-.2*Math.Cos((4*hbp-63)*Math.PI/180);
  double dTh=30*Math.Exp(-Math.Pow((hbp-275)/25,2)),Rc=2*Math.Sqrt(Math.Pow(Cbp,7)/(Math.Pow(Cbp,7)+Math.Pow(25,7)));
  double Sl=1+.015*Math.Pow(Lbp-50,2)/Math.Sqrt(20+Math.Pow(Lbp-50,2)),Sc=1+.045*Cbp,Sh=1+.015*Cbp*T,Rt=-Math.Sin(2*dTh*Math.PI/180)*Rc;
  return Math.Sqrt(Math.Pow(dLp/Sl,2)+Math.Pow(dCp/Sc,2)+Math.Pow(dHp/Sh,2)+Rt*(dCp/Sc)*(dHp/Sh));
 }
 static void Hex(string h,out float r,out float g,out float b){r=Convert.ToInt32(h.Substring(1,2),16)/255f;g=Convert.ToInt32(h.Substring(3,2),16)/255f;b=Convert.ToInt32(h.Substring(5,2),16)/255f;}
 /// Displayed sRGB of the emission at c degrees C on black (exposure 1.13 + ACES, then sRGB encode).
 static void Display(float c,ForgeMetalTuning t,out float r,out float g,out float b){ForgeHeatMath.Emission(c,t,out r,out g,out b);r=ForgeHeatMath.Encode(ForgeHeatMath.Tonemap(r));g=ForgeHeatMath.Encode(ForgeHeatMath.Tonemap(g));b=ForgeHeatMath.Encode(ForgeHeatMath.Tonemap(b));}
 /// Area (knife units squared, projected on xz) of the upward-facing triangles of a part (0 = blade).
 static double TopArea(ForgeMeshBuffer o,int part){double sum=0;for(int i=0;i<o.tris.Count;i+=3){int a=o.tris[i],b=o.tris[i+1],c=o.tris[i+2];if(o.uv1[a*4+1]!=part)continue;
   double ux=o.pos[b*3]-o.pos[a*3],uy=o.pos[b*3+1]-o.pos[a*3+1],uz=o.pos[b*3+2]-o.pos[a*3+2],vx=o.pos[c*3]-o.pos[a*3],vy=o.pos[c*3+1]-o.pos[a*3+1],vz=o.pos[c*3+2]-o.pos[a*3+2];
   double nx=uy*vz-uz*vy,ny=uz*vx-ux*vz,nz=ux*vy-uy*vx,l=Math.Sqrt(nx*nx+ny*ny+nz*nz);if(l<1e-12||ny/l<.7)continue;sum+=Math.Abs(ny)*.5;}return sum;}
 static float Luma(float c,ForgeMetalTuning t){ForgeHeatMath.Emission(c,t,out var r,out var g,out var b);return .2126f*ForgeHeatMath.Tonemap(r)+.7152f*ForgeHeatMath.Tonemap(g)+.0722f*ForgeHeatMath.Tonemap(b);}

 static int Main(){
  var t=new ForgeTuning().metal;t.Clamp();
  // 1. Blackbody colour through the invariant tonemap (the plan's targets) at the offline reference scale; the shipped
  //    emissionScale is that scale calibrated through the real pipeline (lighting and bloom add about 36%).
  var reference=new ForgeMetalTuning();reference.emissionScale=ForgeMetalTuning.ReferenceEmissionScale;reference.Clamp();
  Check(t.emissionScale>=2&&t.emissionScale<=ForgeMetalTuning.ReferenceEmissionScale,"shipped emissionScale is the in-engine calibration ("+t.emissionScale+")");
  var targets=new[]{(600,"#460000"),(700,"#920400"),(800,"#cc1c00"),(900,"#e84c00"),(1000,"#f58c00"),(1100,"#fbc000"),(1200,"#fedf00")};
  double worst=0;foreach(var (c,hex) in targets){Display(c,reference,out var r,out var g,out var b);Hex(hex,out var tr,out var tg,out var tb);Lab(r,g,b,out var L1,out var A1,out var B1);Lab(tr,tg,tb,out var L2,out var A2,out var B2);double d=DeltaE2000(L1,A1,B1,L2,A2,B2);worst=Math.Max(worst,d);Check(d<=4,$"{c} C displays #{(int)Math.Round(r*255):x2}{(int)Math.Round(g*255):x2}{(int)Math.Round(b*255):x2}, target {hex}, dE2000 {d:0.00}");}
  Info($"blackbody ramp worst dE2000 {worst:0.00} (reference emissionScale {reference.emissionScale}; shipped {t.emissionScale})");
  Check(ForgeHeatMath.Brightness(3000,t)<=t.emissionCap+1e-4f,"emission cap");
  Check(ForgeHeatMath.Brightness(20,t)<.001f,"cold steel does not glow");
  // Monotonic luminance with temperature.
  float last=-1;bool mono=true;for(int c=450;c<=1450;c+=10){float l=Luma(c,t);if(l<last-1e-5f)mono=false;last=l;}Check(mono,"luminance rises with temperature");

  // 2. Closed-form cooling with tau in real seconds.
  float body=ForgeHeatMath.CoolSeconds(1150,815,3,t),edge=ForgeHeatMath.CoolSeconds(1150,815,.8f,t),spine=ForgeHeatMath.CoolSeconds(1150,815,5,t);
  Info($"1150 -> 815 C: body 3 mm {body:0.00} s, edge .8 mm {edge:0.00} s, spine 5 mm {spine:0.00} s (tau; on the anvil x{t.anvilTauScale} faster)");
  Check(Math.Abs(body-23)<=1.5f,"3 mm body 1150 -> 815 C in 23 +/- 1.5 s");
  Check(Math.Abs(edge-6.2f)<=.5f,".8 mm edge 1150 -> 815 C in 6.2 +/- .5 s");
  Check(Math.Abs(body/t.anvilTauScale-11.5f)<=1,"on the anvil the body takes about 11.5 s");

  // 3. Heating in the coals reaches the pull temperature at 1.0 s; thin parts lead the spine by .2-.3 s.
  {var m=new ForgeHeatModel();m.Reset(20);float pull=t.Pull("iron"),dt=1/240f,te=-1,ts=-1,at1=0;
   for(float s=0;s<1.6f;s+=dt){m.Step(dt,true,false,pull,true,t);float now=s+dt;if(te<0&&m.TemperatureC(.8f,t)>=800)te=now;if(ts<0&&m.TemperatureC(5,t)>=800)ts=now;if(Math.Abs(now-1)<dt*.5f)at1=m.BodyC(t);}
   Info($"heating: body at 1.0 s {at1:0} C (pull {pull}), edge reaches 800 C at {te:0.000} s, spine at {ts:0.000} s");
   Check(Math.Abs(at1-pull)<=2,"body at the pull temperature at 1.0 s");Check(ts-te>=.18f&&ts-te<=.32f,"edge leads the spine by .2-.3 s");
   // Thin parts lead, thick ones do not lag: the 8 mm bar of a fresh blank heats like the 3 mm body.
   {var bar=new ForgeHeatModel();bar.Reset(20);for(int i=0;i<120;i++)bar.Step(dt,true,false,pull,true,t);Check(Math.Abs(bar.TemperatureC(8,t)-bar.BodyC(t))<1&&bar.TemperatureC(.8f,t)>bar.BodyC(t)+20,"bar (8 mm) heats with the body, the edge ahead");}
   // Front-loaded (Newtonian) heating: orange half way through, still dark after .1 s.
   {var f=new ForgeHeatModel();f.Reset(20);float at01=0,at05=0;for(float s=0;s<1.2f;s+=dt){f.Step(dt,true,false,pull,true,t);float now=s+dt;if(Math.Abs(now-.1f)<dt*.5f)at01=f.BodyC(t);if(Math.Abs(now-.5f)<dt*.5f)at05=f.BodyC(t);}
    Info($"heating body: {at01:0} C at .1 s, {at05:0} C at .5 s");Check(at01<450&&at05>=900&&at05<=1100,"body dark at .1 s, orange (900-1100 C) at .5 s");}
   // Reheat is faster.
   var r=new ForgeHeatModel();r.Reset(500);float at6=0;for(float s=0;s<1;s+=dt){r.Step(dt,true,false,pull,false,t);if(Math.Abs(s+dt-.6f)<dt*.5f)at6=r.BodyC(t);}Check(Math.Abs(at6-pull)<=2,"reheat reaches the pull temperature at .6 s");
   // Pulled out early: no jump, continues cooling from where it was.
   var q=new ForgeHeatModel();q.Reset(20);for(int i=0;i<120;i++)q.Step(dt,true,false,pull,true,t);float mid=q.BodyC(t);q.Step(dt,false,false,pull,true,t);Check(Math.Abs(q.BodyC(t)-mid)<5,"pulling out mid-heat does not jump");
   // The engine heat event catches up even if the knife leaves the furnace in the same frame.
   var h=new ForgeHeatModel();h.Reset(20);h.Heated(pull,t);for(int i=0;i<60;i++)h.Step(dt,false,true,pull,true,t);Check(h.BodyC(t)>pull-40,"heat event catch-up survives the move to the anvil");
  }

  // 4. Anvil: no reheat on strikes, edge cools first, floors hold dull red while worked.
  {var m=new ForgeHeatModel();m.Reset(1150);float dt=1/120f;for(float s=0;s<8;s+=dt)m.Step(dt,false,true,1150,true,t);
   float le=Luma(m.TemperatureC(.8f,t),t),ls=Luma(m.TemperatureC(5,t),t);Info($"after 8 s on the anvil: edge {m.TemperatureC(.8f,t):0} C, body {m.BodyC(t):0} C, spine {m.TemperatureC(5,t):0} C, edge/spine luma {le/Math.Max(1e-6f,ls):0.000}");
   Check(le/Math.Max(1e-6f,ls)<=.6f,"edge-to-spine luminance ratio at most .6 after 8 s");
   for(float s=0;s<120;s+=dt)m.Step(dt,false,true,1150,true,t);Check(m.BodyC(t)>=t.floorBodyC-2&&m.TemperatureC(.8f,t)>=t.floorEdgeC-2,"floors: body 650 C, edge 600 C on the anvil");
   Info($"after 128 s on the anvil: edge {m.TemperatureC(.8f,t):0} C, body {m.BodyC(t):0} C");
   // Off the anvil the floor releases.
   for(float s=0;s<30;s+=dt)m.Step(dt,false,false,1150,true,t);Check(m.BodyC(t)<t.floorBodyC-20,"floor releases off the anvil");
  }
  // 5. Quench and rack cooling are fast but continuous.
  {var m=new ForgeHeatModel();m.Reset(900);float dt=1/120f;m.CoolTo(t.quenchToC,t.quenchS,t.quenchLeadS,t);float prev=m.MaxC(t),jump=0,at=0;
   for(float s=0;s<1.2f;s+=dt){m.Step(dt,false,false,1150,true,t);float c=m.MaxC(t);jump=Math.Max(jump,prev-c);prev=c;if(Math.Abs(s+dt-.8f-.1f)<dt*.5f)at=m.BodyC(t);}
   Check(m.BodyC(t)<=t.quenchToC+1,"quench reaches 60 C");Check(jump<120,"quench has no single-frame snap ("+jump.ToString("0")+" C/frame)");
   var r=new ForgeHeatModel();r.Reset(700);r.CoolTo(t.rackToC,t.rackCoolS,t.rackLeadS,t);float rp=r.MaxC(t),rj=0;for(float s=0;s<1.4f;s+=dt){r.Step(dt,false,false,1150,true,t);float c=r.MaxC(t);rj=Math.Max(rj,rp-c);rp=c;}
   Check(r.MaxC(t)<=t.rackToC+1,"rack cools to 20 C in about 1 s");Check(rj<80,"rack cooling is continuous");
  }
  // 6. The shader formula equals the model for cooling, floors and both ease curves.
  {var rnd=new Random(7);float[] a=new float[4],b=new float[4],c=new float[4];float worstK=0;
   for(int n=0;n<400;n++){var m=new ForgeHeatModel();m.Reset(20+(float)rnd.NextDouble()*1200);float dt=1/60f;int steps=rnd.Next(0,600);bool coals=rnd.Next(3)==0,anvil=rnd.Next(2)==0;
    if(rnd.Next(3)==0)m.CoolTo(20,1,.2f,t);for(int i=0;i<steps;i++){m.Step(dt,coals&&i<steps/2,anvil,1150,rnd.Next(2)==0,t);}
    m.Uniforms(t,a,b,c);foreach(var L in new[]{.8f,1,3,5,6}){float d=Math.Abs(ForgeHeatModel.ShaderK(a,b,c,L)-m.TemperatureK(L,t));worstK=Math.Max(worstK,d);}}
   Check(worstK<.5f,"shader formula matches the model (worst "+worstK.ToString("0.000")+" K)");
  }

  // 7. Flakes go dark (525 C) at .37 / .74 / 2.2 s for .05 / .10 / .30 mm.
  foreach(var (mm,want) in new[]{(t.flakeThinMm,.37f),(t.flakeMidMm,.74f),(t.flakeThickMm,2.2f)}){float s=ForgeHeatMath.FlakeSeconds(1150,t.flakeDarkC,mm);Info($"flake {mm} mm dark at {s:0.000} s");Check(Math.Abs(s-want)<=want*.1f,$"flake {mm} mm dark at {want} s +/- 10%");}
  // Frame-size steps agree with fine steps.
  {float c=1150;for(int i=0;i<30;i++)c=ForgeHeatMath.FlakeStep(c,1/30f,.1f);float f=1150;for(int i=0;i<1000;i++)f=ForgeHeatMath.FlakeStep(f,.001f,.1f);Check(Math.Abs(c-f)<3,"flake step is stable at 30 fps");}

  // 8. Coins: clamp(round(2 + 2.2 log10(amount)), 4, 14).
  Check(ForgeHeatMath.Coins(100,t)==6&&ForgeHeatMath.Coins(1000,t)==9&&ForgeHeatMath.Coins(10000,t)==11&&ForgeHeatMath.Coins(100000,t)==13,"coin counts 6 / 9 / 11 / 13");
  Check(ForgeHeatMath.Coins(1,t)==4&&ForgeHeatMath.Coins(1e9f,t)==14,"coin count clamps");

  // 9. Shape: draw-out, stage lengths, bar, notch, fittings, shatter.
  {var shape=new ForgeBladeShape();var buf=new ForgeMeshBuffer();var pieces=new List<ForgeShardPiece>();var rnd=new Random(3);
   var full=new ForgeMetalTuning();full.drawLevels=.0001f;full.Clamp();full.drawLevels=.0001f;
   for(int f=0;f<8;f++){
    Profile(f,0,out var x0,out var z0);shape.Build(x0,z0,x0.Length,0,f,full);float stage0=shape.LengthCm;Check(stage0>=19-.05f&&stage0<=30.5f,$"family {f}: stage-0 blade {stage0:0.0} cm in 19-30 cm");
    float prev=-1;for(int lv=0;lv<=6;lv++){Profile(f,lv,out var x,out var z);Array.Clear(shape.spread,0,ForgeBladeShape.S);shape.notchU=-1;shape.Build(x,z,x.Length,lv,f,t);float len=shape.lengthU;
     if(prev>0)Check(len/prev-1>=.01f,$"family {f}: level {lv - 1} -> {lv} lengthens by {(len/prev-1)*100:0.0}% (>= 1%)");prev=len;
     if(lv==0){float w=shape.Width(ForgeBladeShape.S/2),tipW=0;for(int i=0;i<ForgeBladeShape.S;i++){shape.Point(i,.5f,out var mx,out var mz);if(mx>=.9f*len){tipW=shape.Width(i);break;}}Check(w/len>=.25f,$"family {f}: level-0 bar width/length {w/len:0.00} >= .25");Check(tipW>=.4f*w,$"family {f}: level-0 bar has no tip ({tipW/w:0.00})");
      Check(Math.Abs(shape.Thickness(ForgeBladeShape.S/2,.5f,t)-t.barThickMm)<1,$"family {f}: level-0 bar about 8 mm thick");}
     shape.Mesh(buf,t,false,0,null,null);bool tang=false,fit=false;for(int i=0;i<buf.count;i++){if(buf.uv1[i*4+1]==1)tang=true;if(buf.uv1[i*4+1]==2)fit=true;}Check(tang&&!fit,$"family {f} level {lv}: forging mesh has a bare tang and no fittings");
     Check(buf.count<65000,"vertex count fits 16-bit indices");
    }
    // Finished knives get a handle of clamp(.55 x blade, 9, 13) cm.
    Profile(f,6,out var xf,out var zf);shape.Build(xf,zf,xf.Length,6,f,t);shape.Mesh(buf,t,true,2,new byte[]{74,46,30},new byte[]{200,150,255});float hx=0;bool anyFit=false;for(int i=0;i<buf.count;i++)if(buf.uv1[i*4+1]==2){anyFit=true;hx=Math.Min(hx,buf.pos[i*3]);}
    float handleCm=-hx*12;Check(anyFit&&handleCm>=9&&handleCm<=16,$"family {f}: finished knife has bolster and handle ({handleCm:0.0} cm behind the heel)");
    // Notch: at least 3 mm deep where the chip lands.
    Profile(f,4,out var xn,out var zn);shape.notchU=-1;Array.Clear(shape.spread,0,ForgeBladeShape.S);shape.Build(xn,zn,xn.Length,4,f,t);shape.notchU=.5f;shape.ApplyEdits(t);float depth=shape.NotchDepthAt(shape.Station(.5f));Check(depth>=3,$"family {f}: notch {depth:0.0} mm deep (>= 3)");
    // Spread: 1-2 mm at the contact, capped.
    shape.notchU=-1;for(int k=0;k<10;k++)shape.AddSpread(.4f,t.spreadGoodMm,t);shape.ApplyEdits(t);float sp=shape.spread[shape.Station(.4f)];Check(sp<=t.spreadMaxMm+1e-4f&&sp>=t.spreadGoodMm,$"family {f}: spread capped at {t.spreadMaxMm} mm");
    // Shatter: 10-16 pieces at every level that can shatter.
    for(int lv=1;lv<=15;lv+=2){Profile(f,lv,out var xs,out var zs);Array.Clear(shape.spread,0,ForgeBladeShape.S);shape.Build(xs,zs,xs.Length,lv,f,t);int n=shape.Shatter(pieces,t,()=>(float)rnd.NextDouble());
     Check(n>=10&&n<=16,$"family {f} level {lv}: {n} shatter pieces (10-16)");bool ok=true;foreach(var p in pieces)if(p.mesh.count<8||p.mesh.tris.Count<12||p.sizeU<=0)ok=false;Check(ok,$"family {f} level {lv}: every piece has a solid mesh");}
   }
   // Fracture faces: every blade piece has a fresh fracture face (distance 0) and interior points away from it.
   {Profile(2,7,out var xs,out var zs);Array.Clear(shape.spread,0,ForgeBladeShape.S);shape.notchU=-1;shape.Build(xs,zs,xs.Length,7,2,t);shape.Shatter(pieces,t,()=>(float)rnd.NextDouble());bool frac=true;
    for(int k=0;k<pieces.Count-1;k++){var m=pieces[k].mesh;bool zero=false,far=false;for(int i=0;i<m.count;i++){float d=m.uv1[i*4+2];if(d<=.001f)zero=true;if(d>=1)far=true;}if(!zero||!far)frac=false;}
    Check(frac,"every shatter piece has a fracture face (distance 0) and points away from it");}
   // The blade outline test (flakes rest on the blade): the middle is inside, beyond the tip and the heel is not.
   {Profile(0,6,out var xi,out var zi);shape.notchU=-1;Array.Clear(shape.spread,0,ForgeBladeShape.S);shape.Build(xi,zi,xi.Length,6,0,t);shape.Point(ForgeBladeShape.S/2,.5f,out var mx,out var mz);
    Check(shape.Inside(mx,mz)&&!shape.Inside(shape.lengthU*1.05f,mz)&&!shape.Inside(-.1f,mz)&&!shape.Inside(mx,mz+2),"Inside: blade middle in, past the tip / heel / spine out");}
   // Normalized coordinates: a mark keeps its (u, v) while the blade draws out (Locate inverts Point).
   Profile(0,2,out var xl,out var zl);shape.Build(xl,zl,xl.Length,2,0,t);shape.Point(40,.3f,out var px,out var pz);shape.Locate(px,pz,out var lu,out var lvv);Check(Math.Abs(lu-shape.U(40))<.011f&&Math.Abs(lvv-.3f)<.02f,"Locate inverts Point");
  }

  // 10. Jagged shatter pieces tile the blade: their upward faces add up to the blade's top area (no gaps, no overlaps).
  {var shape=new ForgeBladeShape();var buf=new ForgeMeshBuffer();var pieces=new List<ForgeShardPiece>();var rnd=new Random(11);float worstGap=0;
   for(int f=0;f<8;f++)foreach(int lv in new[]{3,7,13}){
    Profile(f,lv,out var xs,out var zs);Array.Clear(shape.spread,0,ForgeBladeShape.S);shape.notchU=-1;shape.Build(xs,zs,xs.Length,lv,f,t);
    shape.Mesh(buf,t,false,0,null,null);double blade=TopArea(buf,0);shape.Shatter(pieces,t,()=>(float)rnd.NextDouble());double sum=0;
    for(int k=0;k<pieces.Count-1;k++)sum+=TopArea(pieces[k].mesh,0);
    float gap=(float)Math.Abs(sum/blade-1);worstGap=Math.Max(worstGap,gap);Check(gap<.03f,$"family {f} level {lv}: shatter pieces cover the blade ({sum/blade*100:0.0}% of its top area)");}
   Info($"shatter pieces vs blade top area: worst {worstGap*100:0.0}%");
  }
  // 11. Tuning clamps: a hostile feel-tuning.json cannot break the look.
  {var bad=new ForgeMetalTuning{notchDepthMm=100,oxideCellCm=0,crackDarkAboveC=float.NaN,glowLiftCm=-5,capDesktop=5000,shardsMax=99,sparksPerfect=40,emissionScale=float.PositiveInfinity};bad.Clamp();
   Check(bad.notchDepthMm<=12&&bad.oxideCellCm>=.1f&&!float.IsNaN(bad.crackDarkAboveC)&&bad.glowLiftCm>=0&&bad.capDesktop<=220&&bad.shardsMax<=16&&bad.sparksPerfect<=4&&bad.emissionScale==2.2f,"metal tuning clamps hostile values (cap 220, 16 pieces, at most 4 Perfect sparks)");}

  if(failures>0){Console.WriteLine($"FAIL ForgeHeatTests: {failures} of {checks} checks failed");return 1;}
  Console.WriteLine($"PASS ForgeHeatTests ({checks} checks)");return 0;
 }
}
