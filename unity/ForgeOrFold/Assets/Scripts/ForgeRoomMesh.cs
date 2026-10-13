using System;
using System.Collections.Generic;
using UnityEngine;

// Owner: room-light-post. Procedural meshes for the workshop: subdivided bevelled boxes (fine enough for the
// baked vertex AO), lathes, tubes, the lofted anvil, coal lumps and chain links. All in metres.
public partial class ForgeWorld {
 /// Vertex/normal/colour/triangle accumulator.
 class RoomMesh {
  public readonly List<Vector3> v=new List<Vector3>();public readonly List<Vector3> n=new List<Vector3>();public readonly List<Color> c=new List<Color>();public readonly List<int> t=new List<int>();
  public int Add(Vector3 p,Vector3 nn){v.Add(p);n.Add(nn);c.Add(Color.white);return v.Count-1;}
  public int Add(Vector3 p,Vector3 nn,Color col){v.Add(p);n.Add(nn);c.Add(col);return v.Count-1;}
  public void Tri(int a,int b,int d){t.Add(a);t.Add(b);t.Add(d);}
  /// Flip triangles from `start` whose face normal points against `outward(centroid)`.
  public void Orient(int start,Func<Vector3,Vector3> outward){for(int i=start;i+2<t.Count;i+=3){var a=v[t[i]];var b=v[t[i+1]];var d=v[t[i+2]];if(Vector3.Dot(Vector3.Cross(b-a,d-a),outward((a+b+d)/3))<0){int s=t[i+1];t[i+1]=t[i+2];t[i+2]=s;}}}
  public void Append(RoomMesh o,Matrix4x4 m){int b=v.Count;var nm=m.inverse.transpose;for(int i=0;i<o.v.Count;i++){v.Add(m.MultiplyPoint3x4(o.v[i]));n.Add(nm.MultiplyVector(o.n[i]).normalized);c.Add(o.c[i]);}foreach(var i in o.t)t.Add(i+b);}
  public Mesh Build(string name,bool smooth=false){var m=new Mesh{name=name};if(v.Count>65000)m.indexFormat=UnityEngine.Rendering.IndexFormat.UInt32;m.SetVertices(v);m.SetColors(c);m.SetTriangles(t,0);if(smooth)m.RecalculateNormals();else m.SetNormals(n);m.RecalculateBounds();return m;}
 }
 static readonly Dictionary<string,Mesh> roomMeshCache=new Dictionary<string,Mesh>();
 static List<float> RoomGridLines(float h,float bevel,float cell){var l=new List<float>{-h};float a=-h+bevel,b=h-bevel;if(bevel>0)l.Add(a);int k=Mathf.Max(1,Mathf.CeilToInt((b-a)/Mathf.Max(.002f,cell)-.001f));for(int i=1;i<k;i++)l.Add(Mathf.Lerp(a,b,i/(float)k));if(bevel>0)l.Add(b);l.Add(h);return l;}
 static readonly Vector3[] RoomBoxNormals={Vector3.right,Vector3.left,Vector3.up,Vector3.down,Vector3.forward,Vector3.back};
 /// Faces for SubBox masks: +x 1, -x 2, +y 4, -y 8, +z 16, -z 32.
 const int RoomFaceAll=63,RoomFaceNoBottom=63&~8;
 /// A box centred on the origin with a fixed-radius rounded bevel and faces subdivided into cells of at most
 /// `cell` metres (so baked vertex AO resolves contact shadows). Cached by its parameters.
 static Mesh RoomBoxMesh(Vector3 size,float bevel,float cell,int faces=RoomFaceAll,float vcell=-1){
  string key=$"{size.x:0.####},{size.y:0.####},{size.z:0.####},{bevel:0.####},{cell:0.###},{faces},{vcell:0.###}";
  if(roomMeshCache.TryGetValue(key,out var cached))return cached;
  var mb=RoomBoxBuild(size,bevel,cell,faces,vcell);var mesh=mb.Build("Bevelled box "+key);roomMeshCache[key]=mesh;return mesh;
 }
 /// vcell (default = cell): subdivision along the vertical on the side faces (planks need fine tops, not sides).
 static RoomMesh RoomBoxBuild(Vector3 size,float bevel,float cell,int faces=RoomFaceAll,float vcell=-1){
  if(vcell<=0)vcell=cell;
  var mb=new RoomMesh();var h=size*.5f;bevel=Mathf.Max(0,Mathf.Min(bevel,Mathf.Min(h.x,Mathf.Min(h.y,h.z))*.95f));var inner=h-Vector3.one*bevel;
  for(int f=0;f<6;f++){
   if((faces>>f&1)==0)continue;var nrm=RoomBoxNormals[f];var U=nrm.y!=0?Vector3.right:Vector3.up;var V=Vector3.Cross(nrm,U);
   float hu=Vector3.Scale(h,U).magnitude,hv=Vector3.Scale(h,V).magnitude,hn=Vector3.Scale(h,nrm).magnitude;
   var us=RoomGridLines(hu,bevel,nrm.y!=0?cell:vcell);var vs=RoomGridLines(hv,bevel,cell);int start=mb.v.Count,W=us.Count;
   foreach(var b in vs)foreach(var a in us){var p=nrm*hn+U*a+V*b;var q=new Vector3(Mathf.Clamp(p.x,-inner.x,inner.x),Mathf.Clamp(p.y,-inner.y,inner.y),Mathf.Clamp(p.z,-inner.z,inner.z));var d=p-q;var nn=d.sqrMagnitude>1e-12f?d.normalized:nrm;mb.Add(q+nn*bevel,nn);}
   for(int y=0;y<vs.Count-1;y++)for(int x=0;x<W-1;x++){int i=start+y*W+x;mb.Tri(i,i+1,i+W+1);mb.Tri(i,i+W+1,i+W);}
  }
  return mb;
 }
 /// A static box object with the bevelled, subdivided mesh. `rot` in degrees (world, about the centre).
 GameObject RoomBox(string name,Vector3 center,Vector3 size,Material m,float bevel=.006f,float cell=.25f,Vector3 rot=default,int faces=RoomFaceAll,Transform parent=null,float vcell=-1){
  var go=MeshObject(name,RoomBoxMesh(size,bevel,cell,faces,vcell),m);go.transform.SetParent(parent,false);go.transform.localPosition=center;go.transform.localRotation=Quaternion.Euler(rot);return go;
 }
 /// Surface of revolution around +y: rings at heights ys with radii rs (smooth sides), optional flat caps.
 static RoomMesh RoomLathe(float[] ys,float[] rs,int seg,bool capTop,bool capBottom,Func<int,int,float> radiusJitter=null){
  var mb=new RoomMesh();int R=ys.Length;
  for(int r=0;r<R;r++)for(int s=0;s<seg;s++){float a=s*Mathf.PI*2/seg;float rad=rs[r]*(radiusJitter!=null?radiusJitter(r,s):1);mb.Add(new Vector3(Mathf.Cos(a)*rad,ys[r],Mathf.Sin(a)*rad),Vector3.up);}
  int side=mb.t.Count;
  for(int r=0;r<R-1;r++)for(int s=0;s<seg;s++){int a=r*seg+s,b=r*seg+(s+1)%seg,c=(r+1)*seg+(s+1)%seg,d=(r+1)*seg+s;mb.Tri(a,c,b);mb.Tri(a,d,c);}
  mb.Orient(side,p=>new Vector3(p.x,0,p.z));
  // Smooth side normals from the ring tangents.
  for(int r=0;r<R;r++)for(int s=0;s<seg;s++){int i=r*seg+s;var around=mb.v[r*seg+(s+1)%seg]-mb.v[r*seg+(s+seg-1)%seg];var along=mb.v[Mathf.Min(R-1,r+1)*seg+s]-mb.v[Mathf.Max(0,r-1)*seg+s];var nn=Vector3.Cross(along,around).normalized;var radial=new Vector3(mb.v[i].x,0,mb.v[i].z);if(Vector3.Dot(nn,radial)<0)nn=-nn;mb.n[i]=nn;}
  void Cap(int r,bool up){int start=mb.v.Count;var y=ys[r];int centre=mb.Add(new Vector3(0,y,0),up?Vector3.up:Vector3.down);for(int s=0;s<seg;s++)mb.Add(mb.v[r*seg+s],up?Vector3.up:Vector3.down);int tri=mb.t.Count;for(int s=0;s<seg;s++)mb.Tri(centre,start+1+s,start+1+(s+1)%seg);mb.Orient(tri,_=>up?Vector3.up:Vector3.down);}
  if(capTop)Cap(R-1,true);if(capBottom)Cap(0,false);
  return mb;
 }
 /// A tube along a centreline (points c, radii r), ring frame from `up`; closes to a point when the last radius is 0.
 static RoomMesh RoomTube(Vector3[] c,float[] r,int seg,Vector3 up,float flattenY=1){
  var mb=new RoomMesh();int R=c.Length;
  for(int k=0;k<R;k++){var dir=(c[Mathf.Min(R-1,k+1)]-c[Mathf.Max(0,k-1)]).normalized;var side=Vector3.Cross(up,dir).normalized;var u2=Vector3.Cross(dir,side).normalized;
   for(int s=0;s<seg;s++){float a=s*Mathf.PI*2/seg;var off=(side*Mathf.Cos(a)+u2*Mathf.Sin(a)*flattenY);mb.Add(c[k]+off*r[k],off.normalized);}}
  int tri=mb.t.Count;
  for(int k=0;k<R-1;k++)for(int s=0;s<seg;s++){int a=k*seg+s,b=k*seg+(s+1)%seg,cc=(k+1)*seg+(s+1)%seg,d=(k+1)*seg+s;mb.Tri(a,cc,b);mb.Tri(a,d,cc);}
  mb.Orient(tri,p=>{float best=1e9f;Vector3 o=Vector3.zero;for(int k=0;k<R;k++){float d=(p-c[k]).sqrMagnitude;if(d<best){best=d;o=p-c[k];}}return o;});
  return mb;
 }
 /// Rounded-rectangle ring (centre cx, cz; half extents hx, hz; corner radius cr) with a fixed point count.
 static Vector2[] RoomRoundRect(float cx,float cz,float hx,float hz,float cr,int arc=4,int edgeX=4,int edgeZ=2){
  cr=Mathf.Min(cr,Mathf.Min(hx,hz)*.98f);var pts=new List<Vector2>();
  var corners=new[]{new Vector2(hx-cr,hz-cr),new Vector2(-hx+cr,hz-cr),new Vector2(-hx+cr,-hz+cr),new Vector2(hx-cr,-hz+cr)};
  for(int q=0;q<4;q++){float a0=q*Mathf.PI/2;for(int i=0;i<=arc;i++){float a=a0+i*Mathf.PI/2/arc;pts.Add(new Vector2(cx,cz)+corners[q]+new Vector2(Mathf.Cos(a),Mathf.Sin(a))*cr);}
   var from=corners[q]+new Vector2(Mathf.Cos(a0+Mathf.PI/2),Mathf.Sin(a0+Mathf.PI/2))*cr;var to=corners[(q+1)%4]+new Vector2(Mathf.Cos(a0+Mathf.PI/2),Mathf.Sin(a0+Mathf.PI/2))*cr;int e=q%2==0?edgeX:edgeZ;
   for(int i=1;i<e;i++)pts.Add(new Vector2(cx,cz)+Vector2.Lerp(from,to,i/(float)e));}
  return pts.ToArray();
 }
 /// The anvil: a lofted waisted body on a flared base, a chamfered face plate, a lower step and a conical horn,
 /// in object space with the origin at the centre of the face top (ForgeLayout.AnvilCenter). The face wear,
 /// chipped edges and the hardy and pritchel holes are drawn by Surface _Wear in this same space.
 static Mesh RoomAnvilMesh(){
  var mb=new RoomMesh();
  // Body sections from the base (y -.31, on the stump) to the underside of the face plate: y, x0, x1, half width z, corner radius.
  // Columns: y, x0, x1, half width z, corner radius, then a taper toward the horn: from x = xt the half width
  // narrows to k x (so the throat under the step and horn reads as a waist, not a box).
  float[,] s={{-.310f,-.270f,.255f,.150f,.035f,9,1},{-.288f,-.270f,.255f,.150f,.035f,9,1},{-.262f,-.245f,.232f,.128f,.035f,9,1},{-.225f,-.205f,.190f,.094f,.03f,9,1},{-.185f,-.182f,.168f,.074f,.028f,9,1},
   {-.150f,-.186f,.185f,.074f,.028f,.12f,.85f},{-.118f,-.225f,.300f,.090f,.03f,.15f,.62f},{-.096f,-.300f,.400f,.118f,.03f,.18f,.50f},{-.080f,-.372f,.440f,.142f,.022f,.22f,.45f},{-.074f,-.385f,.445f,.146f,.012f,.24f,.45f}};
  int rows=s.GetLength(0),M=0;var ringStart=new List<int>();
  for(int r=0;r<rows;r++){float y=s[r,0],x0=s[r,1],x1=s[r,2],hz=s[r,3],cr=s[r,4],xt=s[r,5],k=s[r,6];var ring=RoomRoundRect((x0+x1)/2,0,(x1-x0)/2,hz,cr,4,6,3);M=ring.Length;ringStart.Add(mb.v.Count);
   foreach(var p in ring){float z=p.y*(xt<x1?Mathf.Lerp(1,k,Mathf.SmoothStep(0,1,Mathf.InverseLerp(xt,x1,p.x))):1);mb.Add(new Vector3(p.x,y,z),Vector3.up);}}
  int side=mb.t.Count;
  for(int r=0;r<rows-1;r++)for(int i=0;i<M;i++){int a=ringStart[r]+i,b=ringStart[r]+(i+1)%M,c=ringStart[r+1]+(i+1)%M,d=ringStart[r+1]+i;mb.Tri(a,c,b);mb.Tri(a,d,c);}
  mb.Orient(side,p=>new Vector3(p.x-.01f,0,p.z));
  // Base plate underside (sits on the stump; mostly hidden) closes the shell.
  {int start=mb.v.Count;int centre=mb.Add(new Vector3(-.008f,-.310f,0),Vector3.down);for(int i=0;i<M;i++)mb.Add(mb.v[ringStart[0]+i],Vector3.down);int tri=mb.t.Count;for(int i=0;i<M;i++)mb.Tri(centre,start+1+i,start+1+(i+1)%M);mb.Orient(tri,_=>Vector3.down);}
  var body=mb.Build("Anvil body",true);var bodyBuild=new RoomMesh();bodyBuild.v.AddRange(body.vertices);bodyBuild.n.AddRange(body.normals);foreach(var _ in body.vertices)bodyBuild.c.Add(Color.white);bodyBuild.t.AddRange(body.triangles);UnityEngine.Object.Destroy(body);
  var all=new RoomMesh();all.Append(bodyBuild,Matrix4x4.identity);
  // Face plate: x -.39..+.39, 7.5 cm deep, chamfered 6 mm on top. Its bottom is buried in the body.
  all.Append(RoomBoxBuild(new Vector3(.78f,.078f,.30f),.006f,.07f,RoomFaceNoBottom),Matrix4x4.Translate(new Vector3(0,-.039f,0)));
  // Step: 2.5 cm below the face, narrower, between the face and the horn.
  all.Append(RoomBoxBuild(new Vector3(.085f,.085f,.20f),.005f,.1f,RoomFaceNoBottom),Matrix4x4.Translate(new Vector3(.432f,-.0675f,0)));
  // Horn: a round cone from inside the step to a blunt point, its top flush with the step and drooping toward the tip.
  {int K=14;var c=new Vector3[K];var r=new float[K];for(int k=0;k<K;k++){float t=k/(float)(K-1);float x=Mathf.Lerp(.44f,.70f,t);float rad=Mathf.Lerp(.058f,.0045f,Mathf.Pow(t,.85f));if(k==K-1)rad=.0035f;c[k]=new Vector3(x,-.025f-rad-.012f*t*t,0);r[k]=rad;}
   var horn=RoomTube(c,r,18,Vector3.up);all.Append(horn,Matrix4x4.identity);
   // Close the tip.
   int start=all.v.Count;var tip=c[K-1]+Vector3.right*.004f;int ti=all.Add(tip,Vector3.right);int last=start-18;int tri=all.t.Count;for(int s2=0;s2<18;s2++)all.Tri(ti,last+s2,last+(s2+1)%18);all.Orient(tri,_=>Vector3.right);}
  return all.Build("Lofted forged anvil");
 }
 /// A lump of coal: a low-poly displaced sphere, unit size.
 static RoomMesh RoomCoalLump(int seed){
  var rng=new System.Random(seed);var mb=new RoomMesh();int rings=4,seg=6;
  int top=mb.Add(Vector3.up*.5f,Vector3.up);
  for(int r=1;r<rings;r++)for(int s=0;s<seg;s++){float th=r*Mathf.PI/rings,ph=s*Mathf.PI*2/seg+(r%2)*.5f;float k=.38f+(float)rng.NextDouble()*.2f;var p=new Vector3(Mathf.Sin(th)*Mathf.Cos(ph),Mathf.Cos(th),Mathf.Sin(th)*Mathf.Sin(ph))*k;mb.Add(p,p.normalized);}
  int bottom=mb.Add(Vector3.down*.42f,Vector3.down);
  int tri=mb.t.Count;
  for(int s=0;s<seg;s++){mb.Tri(top,1+s,1+(s+1)%seg);}
  for(int r=1;r<rings-1;r++)for(int s=0;s<seg;s++){int a=1+(r-1)*seg+s,b=1+(r-1)*seg+(s+1)%seg,c=1+r*seg+(s+1)%seg,d=1+r*seg+s;mb.Tri(a,c,b);mb.Tri(a,d,c);}
  int lastRing=1+(rings-2)*seg;for(int s=0;s<seg;s++)mb.Tri(bottom,lastRing+s,lastRing+(s+1)%seg);
  mb.Orient(tri,p=>p);
  // Faceted (chipped) look: flat normals per triangle.
  var flat=new RoomMesh();for(int i=0;i<mb.t.Count;i+=3){var a=mb.v[mb.t[i]];var b=mb.v[mb.t[i+1]];var c=mb.v[mb.t[i+2]];var fn=Vector3.Cross(b-a,c-a).normalized;int ia=flat.Add(a,fn),ib=flat.Add(b,fn),ic=flat.Add(c,fn);flat.Tri(ia,ib,ic);}
  return flat;
 }
 /// One oval chain link (torus stretched along x), in metres.
 static RoomMesh RoomChainLink(float length,float width,float wire){
  var mb=new RoomMesh();int seg=10,ring=5;float R=width*.5f-wire;float stretch=(length*.5f-wire)/Mathf.Max(.0001f,R);
  for(int i=0;i<seg;i++){float a=i*Mathf.PI*2/seg;var centre=new Vector3(Mathf.Cos(a)*R*stretch,0,Mathf.Sin(a)*R);var outward=new Vector3(Mathf.Cos(a)/Mathf.Max(.001f,stretch),0,Mathf.Sin(a)).normalized;
   for(int j=0;j<ring;j++){float b=j*Mathf.PI*2/ring;var nn=outward*Mathf.Cos(b)+Vector3.up*Mathf.Sin(b);mb.Add(centre+nn*wire,nn);}}
  int tri=mb.t.Count;
  for(int i=0;i<seg;i++)for(int j=0;j<ring;j++){int a=i*ring+j,b=i*ring+(j+1)%ring,c=((i+1)%seg)*ring+(j+1)%ring,d=((i+1)%seg)*ring+j;mb.Tri(a,b,c);mb.Tri(a,c,d);}
  // Orient each triangle away from the wire centreline.
  var centres=new Vector3[seg];for(int i=0;i<seg;i++){float a=i*Mathf.PI*2/seg;centres[i]=new Vector3(Mathf.Cos(a)*R*stretch,0,Mathf.Sin(a)*R);}
  mb.Orient(tri,p=>{float best=1e9f;Vector3 o=Vector3.zero;foreach(var c in centres){float d=(p-c).sqrMagnitude;if(d<best){best=d;o=p-c;}}return o;});
  return mb;
 }
 /// Bake a RoomMesh into a static object.
 GameObject RoomBuild(string name,RoomMesh mb,Material m,Vector3 position,Quaternion rotation,Transform parent=null){var go=MeshObject(name,mb.Build(name),m);go.transform.SetParent(parent,false);go.transform.localPosition=position;go.transform.localRotation=rotation;return go;}
}
