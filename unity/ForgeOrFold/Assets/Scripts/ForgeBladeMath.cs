using System;
using System.Collections.Generic;

// Owner: hot-metal-vfx. Pure blade geometry (System only; Tests/ForgeHeatTests.cs checks it).
// Knife-local units: 1 unit = KnifeScale metres (.12 m). x runs from the heel (0) to the tip, y is the
// thickness axis (up when the knife lies on the anvil), z is the profile's y (the edge is the lower
// boundary, z < spine). Every per-knife mark (dimples, footprints, the chip notch, crack cells) is stored in
// normalized blade coordinates u = station / (S - 1) along the blade and v = 0 at the edge .. 1 at the
// spine, so it stays put while the mesh draws out from a bar and grows at every stage.

/// Growable vertex buffer shared by the blade, fittings and shatter pieces (one submesh).
public sealed class ForgeMeshBuffer {
 public float[] pos=new float[0], nrm=new float[0], uv0=new float[0], uv1=new float[0]; public byte[] col=new byte[0];
 public int count; public readonly List<int> tris=new List<int>();
 public const float FarMm=99;
 public void Clear(){count=0;tris.Clear();}
 void Grow(int n){if(n<=pos.Length/3)return;int c=Math.Max(n,Math.Max(64,pos.Length/3*2));Array.Resize(ref pos,c*3);Array.Resize(ref nrm,c*3);Array.Resize(ref uv0,c*2);Array.Resize(ref uv1,c*4);Array.Resize(ref col,c*4);}
 /// Add a vertex: position, normalized blade coords (u, v), thickness mm, part (0 blade, 1 tang, 2 fitting), colour + material code.
 /// uv1.z is the distance (mm) to a fracture line (shatter pieces set it; FarMm elsewhere).
 public int Add(float x,float y,float z,float u,float v,float thickMm,float part,byte r=255,byte g=255,byte b=255,byte a=0){
  Grow(count+1);int i=count++;pos[i*3]=x;pos[i*3+1]=y;pos[i*3+2]=z;nrm[i*3]=nrm[i*3+1]=nrm[i*3+2]=0;uv0[i*2]=u;uv0[i*2+1]=v;uv1[i*4]=thickMm;uv1[i*4+1]=part;uv1[i*4+2]=FarMm;uv1[i*4+3]=0;col[i*4]=r;col[i*4+1]=g;col[i*4+2]=b;col[i*4+3]=a;return i;
 }
 public void Tri(int a,int b,int c){tris.Add(a);tris.Add(b);tris.Add(c);}
 public void Quad(int a,int b,int c,int d){Tri(a,b,c);Tri(c,b,d);}   // a b / c d with a-b along one side, c-d along the other
 /// Area-weighted smooth normals over shared indices (separate vertex sets keep hard edges).
 public void Normals(int from=0){
  for(int i=from;i<count;i++)nrm[i*3]=nrm[i*3+1]=nrm[i*3+2]=0;
  for(int t=0;t<tris.Count;t+=3){int a=tris[t],b=tris[t+1],c=tris[t+2];if(a<from||b<from||c<from)continue;
   float ux=pos[b*3]-pos[a*3],uy=pos[b*3+1]-pos[a*3+1],uz=pos[b*3+2]-pos[a*3+2],vx=pos[c*3]-pos[a*3],vy=pos[c*3+1]-pos[a*3+1],vz=pos[c*3+2]-pos[a*3+2];
   float nx=uy*vz-uz*vy,ny=uz*vx-ux*vz,nz=ux*vy-uy*vx;nrm[a*3]+=nx;nrm[a*3+1]+=ny;nrm[a*3+2]+=nz;nrm[b*3]+=nx;nrm[b*3+1]+=ny;nrm[b*3+2]+=nz;nrm[c*3]+=nx;nrm[c*3+1]+=ny;nrm[c*3+2]+=nz;}
  for(int i=from;i<count;i++){float l=(float)Math.Sqrt(nrm[i*3]*nrm[i*3]+nrm[i*3+1]*nrm[i*3+1]+nrm[i*3+2]*nrm[i*3+2]);if(l>1e-12f){nrm[i*3]/=l;nrm[i*3+1]/=l;nrm[i*3+2]/=l;}else nrm[i*3+1]=1;}
 }
 public void Bounds(out float x0,out float y0,out float z0,out float x1,out float y1,out float z1){x0=y0=z0=float.MaxValue;x1=y1=z1=float.MinValue;for(int i=0;i<count;i++){float x=pos[i*3],y=pos[i*3+1],z=pos[i*3+2];if(x<x0)x0=x;if(x>x1)x1=x;if(y<y0)y0=y;if(y>y1)y1=y;if(z<z0)z0=z;if(z>z1)z1=z;}if(count==0)x0=y0=z0=x1=y1=z1=0;}
}

/// One shatter piece: its mesh around its own centroid (knife-local units), the centroid, and 8 hull corners.
public sealed class ForgeShardPiece { public readonly ForgeMeshBuffer mesh=new ForgeMeshBuffer(); public float cx,cy,cz,sizeU; public readonly float[] hull=new float[24]; public int index; }

/// The outline, cross-section and per-strike changes of one blade.
public sealed class ForgeBladeShape {
 public const int S=96;
 public static readonly float[] V={0,.12f,.28f,.5f,.72f,.88f,1};
 public float unitMm=120;
 public readonly float[] ex=new float[S],ez=new float[S],sx=new float[S],sz=new float[S];
 /// Accumulated local edge spread per station (mm) from strikes; survives rebuilds and stage changes.
 public readonly float[] spread=new float[S];
 /// Chip notch centre (u), or -1. Cleared on the next level gain.
 public float notchU=-1;
 public float m, heelMid, heelHalf, lengthU, widthU, edgeArcU; public bool dagger; public int level=-1, family;
 readonly float[] arc=new float[S];
 // Scratch for resampling.
 static readonly List<float> lx=new List<float>(),lz=new List<float>(),ux=new List<float>(),uz=new List<float>();
 static readonly float[] px0=new float[S],pz0=new float[S],px1=new float[S],pz1=new float[S],bx0=new float[S],bz0=new float[S],bx1=new float[S],bz1=new float[S];
 static readonly float[] DefaultX={0,1.6f,2,1.4f,0},DefaultZ={-.15f,-.13f,0,.2f,.22f};

 public float U(int i)=>i/(float)(S-1);
 static float Smooth(float a,float b,float x)=>ForgeHeatMath.Smooth(a,b,x);
 static float Lerp(float a,float b,float t)=>a+(b-a)*t;

 /// Draw-out amount for a level (0 = rough bar, 1 = the stage profile).
 public static float DrawOut(int level,ForgeMetalTuning t)=>Smooth(0,1,(level+.5f)/t.drawLevels);

 /// Rebuild the outline from the engine profile (knife-local x, z; the stage scale is already in it).
 public void Build(float[] px,float[] pz,int n,int level,int family,ForgeMetalTuning t,float unitMm=120){
  this.unitMm=unitMm;this.level=level;this.family=family;dagger=family==4;
  if(px==null||pz==null||n<3){px=DefaultX;pz=DefaultZ;n=DefaultX.Length;}
  // Orientation: the lower chain (heel bottom -> tip) must be the edge; make the outline counter-clockwise in (x, z).
  float area=0;for(int i=0;i<n;i++){int j=(i+1)%n;area+=px[i]*pz[j]-px[j]*pz[i];}
  bool ccw=area>=0;
  float hb=ccw?pz[0]:pz[n-1],ht=ccw?pz[n-1]:pz[0];heelMid=(hb+ht)*.5f;heelHalf=Math.Abs(ht-hb)*.5f;
  int tip=0;float best=-1;for(int i=0;i<n;i++){float d=(px[i]*px[i])+(pz[i]-heelMid)*(pz[i]-heelMid);if(d>best){best=d;tip=i;}}
  lx.Clear();lz.Clear();ux.Clear();uz.Clear();
  if(ccw){for(int i=0;i<=tip;i++){lx.Add(px[i]);lz.Add(pz[i]);}for(int i=n-1;i>=tip;i--){ux.Add(px[i]);uz.Add(pz[i]);}}
  else{for(int i=n-1;i>=tip;i--){lx.Add(px[i]);lz.Add(pz[i]);}for(int i=0;i<=tip;i++){ux.Add(px[i]);uz.Add(pz[i]);}}
  Resample(lx,lz,px0,pz0);Resample(ux,uz,px1,pz1);
  // The stage profile's length and typical width (middle stations, so a hooked karambit is not counted as wide).
  float lp=0,wsum=0;int wn=0;for(int i=0;i<S;i++){lp=Math.Max(lp,Math.Max(px0[i],px1[i]));if(i>S/5&&i<S*4/5){wsum+=Dist(px0[i],pz0[i],px1[i],pz1[i]);wn++;}}
  float wp=wn>0?wsum/wn:.4f;
  // The rough bar: barLength x as long, max(barWidth x as wide, barAspect x its length), with a chamfered end and no tip.
  float lb=t.barLength*lp,wb=Math.Max(t.barWidth*wp,t.barAspect*lb),c=Math.Min(.25f*wb,.08f*lb),z0=heelMid-wb*.5f,z1=heelMid+wb*.5f;
  lx.Clear();lz.Clear();ux.Clear();uz.Clear();
  lx.Add(0);lz.Add(z0);lx.Add(lb-c);lz.Add(z0);lx.Add(lb);lz.Add(z0+c);lx.Add(lb);lz.Add(heelMid);
  ux.Add(0);uz.Add(z1);ux.Add(lb-c);uz.Add(z1);ux.Add(lb);uz.Add(z1-c);ux.Add(lb);uz.Add(heelMid);
  Resample(lx,lz,bx0,bz0);Resample(ux,uz,bx1,bz1);
  m=DrawOut(level,t);
  for(int i=0;i<S;i++){bex[i]=Lerp(bx0[i],px0[i],m);bez[i]=Lerp(bz0[i],pz0[i],m);sx[i]=Lerp(bx1[i],px1[i],m);sz[i]=Lerp(bz1[i],pz1[i],m);}
  ApplyEdits(t);
 }
 // The drawn-out edge before edits, and after the spread (before the notch).
 readonly float[] bex=new float[S],bez=new float[S],sex=new float[S],sez=new float[S];
 /// Spread and notch on top of the drawn-out outline (call after changing spread or notchU).
 public void ApplyEdits(ForgeMetalTuning t){
  for(int i=0;i<S;i++){ex[i]=bex[i];ez[i]=bez[i];}
  for(int i=2;i<S-3;i++){float s=spread[i];if(s<=0)continue;float dx=ex[i]-sx[i],dz=ez[i]-sz[i],l=(float)Math.Sqrt(dx*dx+dz*dz);if(l<1e-6f)continue;float k=s/unitMm/l;ex[i]+=dx*k;ez[i]+=dz*k;}
  arc[0]=0;for(int i=1;i<S;i++)arc[i]=arc[i-1]+Dist(ex[i-1],ez[i-1],ex[i],ez[i]);edgeArcU=arc[S-1];
  for(int i=0;i<S;i++){sex[i]=ex[i];sez[i]=ez[i];}
  if(notchU>=0){
   int ni=Station(notchU);float half=t.notchWidthCm*10/unitMm*.5f;
   for(int i=1;i<S-1;i++){float d=Math.Abs(arc[i]-arc[ni]);if(d>=half)continue;float dx=sx[i]-ex[i],dz=sz[i]-ez[i],l=(float)Math.Sqrt(dx*dx+dz*dz);if(l<1e-6f)continue;
    float depth=Math.Min(t.notchDepthMm/unitMm*(1-d/half),.6f*l);ex[i]+=dx/l*depth;ez[i]+=dz/l*depth;}
  }
  lengthU=0;float wsum=0;for(int i=0;i<S;i++){lengthU=Math.Max(lengthU,Math.Max(ex[i],sx[i]));wsum+=Width(i);}widthU=wsum/S;
 }
 public int Station(float u)=>Math.Max(0,Math.Min(S-1,(int)Math.Round(u*(S-1))));
 public float Width(int i)=>Dist(ex[i],ez[i],sx[i],sz[i]);
 public float Arc(int i)=>arc[i];
 static float Dist(float ax,float az,float bx,float bz){float dx=bx-ax,dz=bz-az;return (float)Math.Sqrt(dx*dx+dz*dz);}
 static void Resample(List<float> x,List<float> z,float[] ox,float[] oz){
  int n=x.Count;float total=0;for(int i=1;i<n;i++)total+=Dist(x[i-1],z[i-1],x[i],z[i]);
  if(total<1e-6f){for(int i=0;i<S;i++){ox[i]=x[0];oz[i]=z[0];}return;}
  int seg=1;float acc=0,segLen=n>1?Dist(x[0],z[0],x[1],z[1]):0;
  for(int i=0;i<S;i++){float want=total*i/(S-1);while(seg<n-1&&acc+segLen<want){acc+=segLen;seg++;segLen=Dist(x[seg-1],z[seg-1],x[seg],z[seg]);}
   float f=segLen>1e-9f?ForgeHeatMath.Sat((want-acc)/segLen):0;ox[i]=Lerp(x[seg-1],x[seg],f);oz[i]=Lerp(z[seg-1],z[seg],f);}
 }

 /// Local thickness in mm at fractional station s and across position v.
 public float Thickness(float s,float v,ForgeMetalTuning t){
  float u=ForgeHeatMath.Sat(s/(S-1));v=ForgeHeatMath.Sat(v);
  float ts=Lerp(t.spineMm,t.tipMm,Smooth(.55f,1,u)),te=Lerp(t.edgeMm,t.tipMm,Smooth(.86f,1,u));
  float shape=dagger?1-Math.Abs(2*v-1):(v>=t.bevelV?1:v/t.bevelV);
  float blade=Lerp(te,ts,shape);
  float round=.7f+.3f*Smooth(0,.2f,Math.Min(v,1-v));round*=.7f+.3f*Smooth(0,.05f,1-u);
  float bar=t.barThickMm*round;
  return Lerp(bar,blade,m);
 }
 /// Point (x, z) at fractional station s and across position v.
 public void Point(float s,float v,out float x,out float z){
  s=Math.Max(0,Math.Min(S-1,s));int i=Math.Min(S-2,(int)s);float f=s-i;
  float exs=Lerp(ex[i],ex[i+1],f),ezs=Lerp(ez[i],ez[i+1],f),sxs=Lerp(sx[i],sx[i+1],f),szs=Lerp(sz[i],sz[i+1],f);
  x=Lerp(exs,sxs,v);z=Lerp(ezs,szs,v);
 }
 /// Is a knife-local point (x, z) inside the blade outline (edge chain out to the tip, spine chain back)? Even-odd test.
 public bool Inside(float x,float z){bool inside=false;int n=2*S;for(int k=0,j=n-1;k<n;j=k++){OutlinePoint(k,out var xi,out var zi);OutlinePoint(j,out var xj,out var zj);if((zi>z)!=(zj>z)&&x<(xj-xi)*(z-zi)/(zj-zi+1e-12f)+xi)inside=!inside;}return inside;}
 void OutlinePoint(int k,out float x,out float z){if(k<S){x=ex[k];z=ez[k];}else{int i=2*S-1-k;x=sx[i];z=sz[i];}}
 /// Normalized blade coordinates (u, v) of a knife-local point (nearest station segment).
 public void Locate(float x,float z,out float u,out float v){
  float best=float.MaxValue;u=.5f;v=.5f;
  for(int i=0;i<S;i++){float dx=sx[i]-ex[i],dz=sz[i]-ez[i],l2=dx*dx+dz*dz;float p=l2>1e-12f?ForgeHeatMath.Sat(((x-ex[i])*dx+(z-ez[i])*dz)/l2):0;float qx=ex[i]+dx*p-x,qz=ez[i]+dz*p-z,d=qx*qx+qz*qz;if(d<best){best=d;u=U(i);v=p;}}
 }
 /// Add a local edge spread (mm) centred at u with a gaussian of sigmaCm, capped at spreadMaxMm.
 public void AddSpread(float u,float mm,ForgeMetalTuning t){
  if(mm<=0)return;int c=Station(u);float sig=Math.Max(.05f,t.spreadSigmaCm*10/unitMm);
  for(int i=0;i<S;i++){float d=arc[i]-arc[c];float g=(float)Math.Exp(-d*d/(2*sig*sig));if(g<.01f)continue;spread[i]=Math.Min(t.spreadMaxMm,spread[i]+mm*g);}
 }
 /// Depth (mm) by which the edge at station i sits inside the unnotched outline (tests).
 public float NotchDepthAt(int i){float dx=ex[i]-sex[i],dz=ez[i]-sez[i];return (float)Math.Sqrt(dx*dx+dz*dz)*unitMm;}
 /// Edge arc length (cm): the u coordinate runs along it.
 public float BladeLengthCm=>edgeArcU*unitMm/10;
 /// Heel-to-tip length along x (cm).
 public float LengthCm=>lengthU*unitMm/10;
 public float BladeWidthCm=>widthU*unitMm/10;

 // ---------------------------------------------------------------- mesh
 /// The whole knife as one submesh: blade grid (top, bottom, edge and spine walls, heel cap), a bare tang
 /// (blank and forging) or bolster, guard, handle and pommel (finished, stage >= 1 adds the guard and pommel).
 /// yOffsetU moves the blade so its underside sits 6 mm below the knife root (the anvil face).
 public void Mesh(ForgeMeshBuffer o,ForgeMetalTuning t,bool finished,int stage,byte[] handleRgb,byte[] gemRgb){
  o.Clear();int J=V.Length;
  // Blade grid, top and bottom.
  int top=o.count;for(int i=0;i<S;i++)for(int j=0;j<J;j++){Point(i,V[j],out var x,out var z);float th=Thickness(i,V[j],t);o.Add(x,th*.5f/unitMm,z,U(i),V[j],th,0);}
  int bot=o.count;for(int i=0;i<S;i++)for(int j=0;j<J;j++){Point(i,V[j],out var x,out var z);float th=Thickness(i,V[j],t);o.Add(x,-th*.5f/unitMm,z,U(i),V[j],th,0);}
  for(int i=0;i<S-1;i++)for(int j=0;j<J-1;j++){int a=top+i*J+j,b=a+1,c=a+J,d=c+1;o.Tri(a,b,c);o.Tri(c,b,d);int a2=bot+i*J+j,b2=a2+1,c2=a2+J,d2=c2+1;o.Tri(a2,c2,b2);o.Tri(c2,d2,b2);}
  // Edge wall (v = 0) and spine wall (v = 1).
  for(int w=0;w<2;w++){int j=w==0?0:J-1;int start=o.count;for(int i=0;i<S;i++){int ti=top+i*J+j,bi=bot+i*J+j;o.Add(o.pos[ti*3],o.pos[ti*3+1],o.pos[ti*3+2],U(i),V[j],o.uv1[ti*4],0);o.Add(o.pos[bi*3],o.pos[bi*3+1],o.pos[bi*3+2],U(i),V[j],o.uv1[bi*4],0);}
   for(int i=0;i<S-1;i++){int a=start+i*2,b=a+2,c=a+1,d=a+3;if(w==0){o.Tri(a,b,c);o.Tri(c,b,d);}else{o.Tri(a,c,b);o.Tri(c,d,b);}}}
  // Heel cap (u = 0).
  {int start=o.count;for(int j=0;j<J;j++){int ti=top+j,bi=bot+j;o.Add(o.pos[ti*3],o.pos[ti*3+1],o.pos[ti*3+2],0,V[j],o.uv1[ti*4],0);o.Add(o.pos[bi*3],o.pos[bi*3+1],o.pos[bi*3+2],0,V[j],o.uv1[bi*4],0);}
   for(int j=0;j<J-1;j++){int a=start+j*2,b=a+1,c=a+2,d=a+3;o.Tri(a,b,c);o.Tri(c,b,d);}}
  float heelW=Width(0);
  if(!finished){
   // Bare tang: a tapered bar from the heel back to -tangLength, centred on the heel.
   float len=t.tangLengthCm*10/unitMm,w0=Math.Min(heelW*.5f,14/unitMm),w1=w0*.72f,th=Lerp(t.barThickMm,t.tangMm,m),h=th*.5f/unitMm;
   float zc=Lerp(ez[0],sz[0],.5f);
   BoxPart(o,0,-len,zc,w0*.5f,w1*.5f,h,h*.9f,th,1,255,255,255,0,0);
  }else{
   float bl=8/unitMm,bh=heelW*.53f,bt=Math.Max(t.spineMm*1.9f,7)*.5f/unitMm,zc=Lerp(ez[0],sz[0],.5f);
   // Brass bolster, then a guard from stage 1.
   BoxPart(o,0,-bl,zc,bh,bh*.96f,bt,bt*.96f,0,2,181,153,87,128,0);
   if(stage>=1){float gw=bh+(14+stage*4)/unitMm,gt=bt*1.25f,gx=-bl;BoxPart(o,gx,gx-6/unitMm,zc,gw,gw,gt,gt,0,2,190,160,92,128,0);bl+=6/unitMm;}
   // Handle: clamp(.55 x blade length, 9, 13) cm, an elliptical loft with a palm swell.
   float hl=Math.Max(90,Math.Min(130,.55f*LengthCm*10))/unitMm,ha=Math.Max(bh*.92f,11/unitMm),hb=Math.Max(bt*1.05f,8.5f/unitMm);
   Loft(o,-bl,-bl-hl,zc,ha,hb,handleRgb,stage);
   if(stage>=1){float px=-bl-hl;BoxPart(o,px,px-7/unitMm,zc,ha*1.05f,ha*.8f,hb*1.1f,hb*.9f,0,2,181,153,87,128,0);}
   if(stage>=3&&gemRgb!=null){float gx=-bl+3/unitMm,gy=bt*1.25f+3/unitMm;Gem(o,gx,gy,zc,4.5f/unitMm,gemRgb);}
  }
  o.Normals();
 }
 /// A box from x0 to x1 (x0 > x1 going back), half widths w0/w1 (z), half thickness h0/h1 (y).
 static void BoxPart(ForgeMeshBuffer o,float x0,float x1,float zc,float w0,float w1,float h0,float h1,float thickMm,float part,byte r,byte g,byte b,byte a,float u0){
  // 8 corners, 6 faces with their own vertices (hard edges).
  float[] cx={x0,x0,x0,x0,x1,x1,x1,x1},cy={-h0,h0,h0,-h0,-h1,h1,h1,-h1},cz={zc-w0,zc-w0,zc+w0,zc+w0,zc-w1,zc-w1,zc+w1,zc+w1};
  int[][] faces={new[]{0,1,2,3},new[]{7,6,5,4},new[]{1,5,6,2},new[]{0,3,7,4},new[]{0,4,5,1},new[]{3,2,6,7}};
  foreach(var f in faces){int s=o.count;for(int k=0;k<4;k++){int c=f[k];float u=part==1?-(x0-cx[c])/Math.Max(1e-4f,x0-x1)*.25f:u0;o.Add(cx[c],cy[c],cz[c],u,(cz[c]-(zc-w0))/(2*w0),thickMm,part,r,g,b,a);}o.Tri(s,s+1,s+2);o.Tri(s,s+2,s+3);}
 }
 static void Loft(ForgeMeshBuffer o,float x0,float x1,float zc,float a,float b,byte[] rgb,int stage){
  const int K=10,R=14;int start=o.count;byte hr=rgb!=null?rgb[0]:(byte)74,hg=rgb!=null?rgb[1]:(byte)46,hb=rgb!=null?rgb[2]:(byte)30;
  for(int k=0;k<=K;k++){float f=k/(float)K,x=Lerp(x0,x1,f),swell=1+.09f*(float)Math.Sin(Math.PI*Math.Min(1,f*1.15f))-.06f*f;bool ring=stage>=2&&(k==1||k==K-1);
   for(int r=0;r<=R;r++){float ang=(float)(2*Math.PI*r/R);float y=(float)Math.Cos(ang)*b*swell,z=zc+(float)Math.Sin(ang)*a*swell;o.Add(x,y,z,0,0,0,2,ring?(byte)181:hr,ring?(byte)153:hg,ring?(byte)87:hb,ring?(byte)128:(byte)0);}}
  for(int k=0;k<K;k++)for(int r=0;r<R;r++){int p=start+k*(R+1)+r,q=p+R+1;o.Tri(p,q,p+1);o.Tri(q,q+1,p+1);}
  // Butt cap (a fan, facing -x).
  int c=o.count;o.Add(x1,0,zc,0,0,0,2,hr,hg,hb,0);int ring0=o.count;
  for(int r=0;r<=R;r++){int src=start+K*(R+1)+r;o.Add(o.pos[src*3],o.pos[src*3+1],o.pos[src*3+2],0,0,0,2,hr,hg,hb,0);}
  for(int r=0;r<R;r++)o.Tri(c,ring0+r+1,ring0+r);
 }
 static void Gem(ForgeMeshBuffer o,float x,float y,float z,float s,byte[] rgb){
  float[][] p={new[]{x,y+s,z},new[]{x+s,y,z},new[]{x,y,z+s},new[]{x-s,y,z},new[]{x,y,z-s},new[]{x,y-s*.4f,z}};
  int[][] f={new[]{0,2,1},new[]{0,3,2},new[]{0,4,3},new[]{0,1,4},new[]{5,1,2},new[]{5,2,3},new[]{5,3,4},new[]{5,4,1}};
  foreach(var tri in f){int s0=o.count;foreach(int k in tri)o.Add(p[k][0],p[k][1],p[k][2],0,0,0,2,rgb[0],rgb[1],rgb[2],255);o.Tri(s0,s0+1,s0+2);}
 }

 // ---------------------------------------------------------------- shatter
 /// Cut the blade into chunky pieces across its length at irregular angles, most split again along a jagged
 /// line near the middle of the width, plus the tang. rnd returns 0..1. Count is within [shardsMin, shardsMax].
 public int Shatter(List<ForgeShardPiece> pieces,ForgeMetalTuning t,Func<float> rnd){
  pieces.Clear();float lcm=LengthCm;
  // About one cross cut per 3.2 cm, each piece split in two, plus the tang: target pieces within [shardsMin, shardsMax].
  int target=Math.Max((int)t.shardsMin,Math.Min((int)t.shardsMax,2*(int)Math.Round(lcm/3.2f)+1));int cross=Math.Max(1,(target-1+1)/2);
  // Cut positions in station units at v = 0 and v = 1 (angled), irregularly spaced, each with its own jagged profile.
  var cuts=new float[cross+1,2];cuts[0,0]=cuts[0,1]=0;cuts[cross,0]=cuts[cross,1]=S-1;var cutJag=new Jag[cross+1];
  for(int k=1;k<cross;k++){float c=(S-1)*(k+(rnd()-.5f)*.55f)/cross;float tilt=(rnd()-.5f)*(S-1)*.09f;cuts[k,0]=Math.Max(1,Math.Min(S-2,c-tilt));cuts[k,1]=Math.Max(1,Math.Min(S-2,c+tilt));
   cutJag[k]=new Jag(Math.Min(1.7f,.22f*(S-1)/cross),1.2f+rnd(),3.1f+rnd()*1.5f,rnd()*6.283f,rnd()*6.283f);}
  int splits=Math.Max(0,target-cross-1);   // the tang is one piece
  for(int k=0;k<cross;k++){
   bool split=splits>0&&(k<cross-1||splits>=cross-k);if(split)splits--;
   float vs0=.38f+rnd()*.24f,vs1=.38f+rnd()*.24f;var sj=new Jag(.07f,1.1f+rnd(),2.7f+rnd()*1.5f,rnd()*6.283f,rnd()*6.283f);
   var cut=new Cut{l0=cuts[k,0],l1=cuts[k,1],r0=cuts[k+1,0],r1=cuts[k+1,1],jl=cutJag[k],jr=cutJag[k+1]};
   if(split){Patch(pieces,t,cut,0,0,default,vs0,vs1,sj);Patch(pieces,t,cut,vs0,vs1,sj,1,1,default);}
   else Patch(pieces,t,cut,0,0,default,1,1,default);
  }
  // The tang (with the heel stub).
  {var p=new ForgeShardPiece{index=pieces.Count};float len=t.tangLengthCm*10/unitMm,w=Math.Min(Width(0)*.5f,14/unitMm)*.5f,th=Lerp(t.barThickMm,t.tangMm,m),h=th*.5f/unitMm,zc=Lerp(ez[0],sz[0],.5f);
   BoxPart(p.mesh,0,-len,zc,w,w*.72f,h,h*.9f,th,1,255,255,255,0,0);p.mesh.Normals();Center(p,true);pieces.Add(p);}
  return pieces.Count;
 }
 /// A jagged fracture profile: an offset of amplitude a (two sines) along the line's own parameter x in 0..1.
 struct Jag { public float a,f1,f2,p1,p2; public Jag(float a,float f1,float f2,float p1,float p2){this.a=a;this.f1=f1;this.f2=f2;this.p1=p1;this.p2=p2;}
  public float At(float x)=>a==0?0:a*(.65f*(float)Math.Sin(6.2832f*f1*x+p1)+.35f*(float)Math.Sin(6.2832f*f2*x+p2)); }
 /// The two cross cuts bounding a column of pieces: station positions at v = 0 and 1, and their jagged profiles (in v).
 struct Cut { public float l0,l1,r0,r1; public Jag jl,jr; }
 void Patch(List<ForgeShardPiece> pieces,ForgeMetalTuning t,Cut cut,float lo0,float lo1,Jag jlo,float hi0,float hi1,Jag jhi){
  const int K=8,R=6;var p=new ForgeShardPiece{index=pieces.Count};var o=p.mesh;
  int top=o.count;for(int a=0;a<=K;a++)for(int b=0;b<=R;b++)Vertex(o,t,a/(float)K,b/(float)R,cut,lo0,lo1,jlo,hi0,hi1,jhi,1);
  int bot=o.count;for(int a=0;a<=K;a++)for(int b=0;b<=R;b++)Vertex(o,t,a/(float)K,b/(float)R,cut,lo0,lo1,jlo,hi0,hi1,jhi,-1);
  float l0=cut.l0,l1=cut.l1,r0=cut.r0,r1=cut.r1;
  int N=R+1;for(int a=0;a<K;a++)for(int b=0;b<R;b++){int i=top+a*N+b,j=i+1,k=i+N,l=k+1;o.Tri(i,j,k);o.Tri(k,j,l);int i2=bot+a*N+b,j2=i2+1,k2=i2+N,l2=k2+1;o.Tri(i2,k2,j2);o.Tri(k2,l2,j2);}
  // Which sides are fresh fractures: the cuts (not the heel or the tip) and the split along the width (not the
  // blade's own edge and spine). Each grid vertex stores its distance (mm, along the grid) to the nearest one.
  bool fl=!(l0<=0&&l1<=0),fr=!(r0>=S-1&&r1>=S-1),fb=lo0>0||lo1>0,ft=hi0<1||hi1<1;
  for(int a=0;a<=K;a++)for(int b=0;b<=R;b++){
   float dl=0,dr=0,db=0,dt=0;for(int q=0;q<a;q++)dl+=Seg(o,top+q*N+b,top+(q+1)*N+b);for(int q=a;q<K;q++)dr+=Seg(o,top+q*N+b,top+(q+1)*N+b);
   for(int q=0;q<b;q++)db+=Seg(o,top+a*N+q,top+a*N+q+1);for(int q=b;q<R;q++)dt+=Seg(o,top+a*N+q,top+a*N+q+1);
   float d=ForgeMeshBuffer.FarMm;if(fl)d=Math.Min(d,dl*unitMm);if(fr)d=Math.Min(d,dr*unitMm);if(fb)d=Math.Min(d,db*unitMm);if(ft)d=Math.Min(d,dt*unitMm);
   o.uv1[(top+a*N+b)*4+2]=d;o.uv1[(bot+a*N+b)*4+2]=d;
  }
  // Side walls around the perimeter: bottom chain (b = 0), right cut (a = K), top chain (b = R), left cut (a = 0).
  var ring=new List<int>();for(int a=0;a<=K;a++)ring.Add(a*N);for(int b=1;b<=R;b++)ring.Add(K*N+b);for(int a=K-1;a>=0;a--)ring.Add(a*N+R);for(int b=R-1;b>=1;b--)ring.Add(b);
  for(int q=0;q<ring.Count;q++){int c0=ring[q],c1=ring[(q+1)%ring.Count];int s=o.count;
   // Segment q lies on the bottom chain (q < K), the right cut, the top chain or the left cut: a fracture face glows whole.
   bool frac=q<K?fb:q<K+R?fr:q<2*K+R?ft:fl;
   foreach(int c in new[]{top+c0,top+c1,bot+c0,bot+c1}){int nv=o.Add(o.pos[c*3],o.pos[c*3+1],o.pos[c*3+2],o.uv0[c*2],o.uv0[c*2+1],o.uv1[c*4],o.uv1[c*4+1]);o.uv1[nv*4+2]=frac?0:ForgeMeshBuffer.FarMm;}
   o.Tri(s,s+1,s+2);o.Tri(s+2,s+1,s+3);}
  o.Normals();Center(p,false);
  // Hull: the 4 patch corners, top and bottom (already relative to the centroid).
  int[] corners={0,R,K*N,K*N+R};for(int c=0;c<4;c++){int ti=top+corners[c],bi=bot+corners[c];p.hull[c*6]=o.pos[ti*3];p.hull[c*6+1]=o.pos[ti*3+1];p.hull[c*6+2]=o.pos[ti*3+2];p.hull[c*6+3]=o.pos[bi*3];p.hull[c*6+4]=o.pos[bi*3+1];p.hull[c*6+5]=o.pos[bi*3+2];}
  pieces.Add(p);
 }
 static float Seg(ForgeMeshBuffer o,int i,int j){float dx=o.pos[j*3]-o.pos[i*3],dy=o.pos[j*3+1]-o.pos[i*3+1],dz=o.pos[j*3+2]-o.pos[i*3+2];return (float)Math.Sqrt(dx*dx+dy*dy+dz*dz);}
 void Vertex(ForgeMeshBuffer o,ForgeMetalTuning t,float a,float b,Cut c,float lo0,float lo1,Jag jlo,float hi0,float hi1,Jag jhi,float side){
  float lo=Lerp(lo0,lo1,a)+jlo.At(a),hi=Lerp(hi0,hi1,a)+jhi.At(a);float v=ForgeHeatMath.Sat(Lerp(lo,hi,b));
  float s=Lerp(Lerp(c.l0,c.l1,v)+c.jl.At(v),Lerp(c.r0,c.r1,v)+c.jr.At(v),a);s=Math.Max(0,Math.Min(S-1,s));
  Point(s,v,out var x,out var z);float th=Thickness(s,v,t);o.Add(x,side*th*.5f/unitMm,z,s/(S-1),v,th,0);
 }
 /// Move a piece's vertices around its centroid (cx, cy, cz), measure its size and (for boxes) set the hull to its bounds.
 static void Center(ForgeShardPiece p,bool boundsHull){
  var o=p.mesh;double x=0,y=0,z=0;for(int i=0;i<o.count;i++){x+=o.pos[i*3];y+=o.pos[i*3+1];z+=o.pos[i*3+2];}
  if(o.count>0){x/=o.count;y/=o.count;z/=o.count;}p.cx=(float)x;p.cy=(float)y;p.cz=(float)z;
  float r=0;for(int i=0;i<o.count;i++){o.pos[i*3]-=p.cx;o.pos[i*3+1]-=p.cy;o.pos[i*3+2]-=p.cz;r=Math.Max(r,Math.Abs(o.pos[i*3])+Math.Abs(o.pos[i*3+2]));}
  p.sizeU=r;
  if(boundsHull){o.Bounds(out var x0,out var y0,out var z0,out var x1,out var y1,out var z1);float[] h={x0,y0,z0,x1,y0,z0,x0,y1,z0,x1,y1,z0,x0,y0,z1,x1,y0,z1,x0,y1,z1,x1,y1,z1};Array.Copy(h,p.hull,24);}
 }
}
