using System.Collections.Generic;
using UnityEngine;
using L = ForgeLayoutData;

// Owner: room-light-post. Room dressing (barrel, bellows, fuel bin, bench clutter, door sconce) and the glow batch:
// every additive soft sprite in the room (hearth embers, dust motes, lamp, sconce and lantern halos and the pool of
// daylight under the door) is one dynamic mesh with one draw call.
public partial class ForgeWorld {
 float emberClock;Transform[] motes;   // motes: kept for compatibility (unused; motes live in the glow batch)
 class Ember {public Vector3 p,v;public float age,life,size,twinkle;}
 readonly List<Ember> embers=new List<Ember>();
 struct GlowSprite {public Vector3 p,right,up;public Color c;public bool billboard;public int flame;}   // flame: 0 halo, 1 sconce flame, 2 lantern flame
 readonly List<GlowSprite> glowSprites=new List<GlowSprite>();
 Mesh glowMesh;Material glowMat;Vector3[] glowV;Color[] glowC;Vector2[] glowUv;System.Random emberRng=new System.Random(5);
 Vector3[] moteHome;float[] motePhase;
 const int GlowMaxQuads=64,MoteCount=18;
 Transform bellowsBeam,bellowsBottom,bellowsLeather,bellowsHandle,bellowsLift;Vector3 bellowsPivot,bellowsAxis,bellowsBottomRest,bellowsHandleRest,bellowsLiftRest;
 int lampHalo=-1,lanternHalo=-1;

 void MakeDressing(){
  // Decorative water barrel in the left back corner.
  var bp=LV(L.Barrel);float br=L.BarrelRadius;var barrel=Group("Water barrel",new Vector3(bp.x,0,bp.z));var rng=new System.Random(9);
  for(int i=0;i<20;i++){float a=i*Mathf.PI*2/20;var stave=RoomBox("Oak barrel stave",new Vector3(Mathf.Cos(a)*(br-.02f),.34f,Mathf.Sin(a)*(br-.02f)),new Vector3(.077f,.68f,.035f),woodUp,.006f,.2f,new Vector3(0,-a*Mathf.Rad2Deg+90,0),RoomFaceAll,barrel);RoomTinted(stave,Color.Lerp(C("a89886"),Color.white,(float)rng.NextDouble()));}
  foreach(var y in new[]{.07f,.33f,.60f})RoomBuild("Barrel hoop",RoomLathe(new[]{y,y+.003f,y+.032f,y+.035f},new[]{br-.004f,br+.004f,br+.004f,br-.004f},24,false,false),sootIron,new Vector3(bp.x,0,bp.z),Quaternion.identity);
  RoomBuild("Barrel water",RoomLathe(new[]{.56f,.565f},new[]{br-.03f,br-.03f},20,true,false),water,new Vector3(bp.x,0,bp.z),Quaternion.identity);
  RoomSolidCylinder("Barrel",new Vector3(bp.x,0,bp.z),br-.03f,.68f);
  // Fuel bin of coal against the left wall.
  var fr=L.FuelFootprint;var fc=new Vector3((fr.x0+fr.x1)/2,0,(fr.z0+fr.z1)/2);float fw=fr.x1-fr.x0,fd=fr.z1-fr.z0,fh=.42f;
  RoomBox("Fuel bin floor",fc+Vector3.up*.02f,new Vector3(fw,.04f,fd),wood,.005f,.15f);
  foreach(var e in new[]{(fc+new Vector3(-fw/2+.015f,fh/2,0),new Vector3(.03f,fh,fd)),(fc+new Vector3(fw/2-.015f,fh/2-.05f,0),new Vector3(.03f,fh-.1f,fd)),(fc+new Vector3(0,fh/2,-fd/2+.015f),new Vector3(fw,fh,.03f)),(fc+new Vector3(0,fh/2,fd/2-.015f),new Vector3(fw,fh,.03f))})RoomBox("Fuel bin board",e.Item1,e.Item2,wood,.005f,.15f);
  RoomSolid("Fuel bin",fc+Vector3.up*fh/2,new Vector3(fw-.02f,fh,fd-.02f));
  var heap=new RoomMesh();for(int i=0;i<90;i++){float u=(float)rng.NextDouble()-.5f,w=(float)rng.NextDouble()-.5f;float d=Mathf.Sqrt(u*u*4+w*w*4);float y=fh-.08f+.07f*(1-Mathf.Min(1,d))+(float)rng.NextDouble()*.01f;float size=.035f*(.7f+.6f*(float)rng.NextDouble());heap.Append(RoomCoalLump(300+i),Matrix4x4.TRS(fc+new Vector3(u*(fw-.06f),y,w*(fd-.06f)),Quaternion.Euler((float)rng.NextDouble()*360,(float)rng.NextDouble()*360,(float)rng.NextDouble()*360),new Vector3(size,size*.7f,size*1.1f)));}
  RoomBox("Coal fill",fc+Vector3.up*(fh-.10f),new Vector3(fw-.05f,.02f,fd-.05f),coal,.004f,.2f);
  roomLumpAo.Add(RoomBuild("Coal in the bin",heap,coal,Vector3.zero,Quaternion.identity));
  var shovel=Group("Coal shovel",fc+new Vector3(fw/2+.06f,.0f,-.08f));RoomBox("Shovel shaft",new Vector3(0,.48f,0),new Vector3(.025f,.85f,.025f),woodUp,.006f,.3f,default,RoomFaceAll,shovel);RoomBox("Shovel blade",new Vector3(0,.04f,0),new Vector3(.02f,.2f,.17f),sootIron,.004f,.3f,default,RoomFaceAll,shovel);shovel.Rotate(0,0,-9);
  // Steel offcuts and clay flux pots on the bench.
  for(int i=0;i<12;i++){float a=i*.77f;RoomBox("Steel offcut",new Vector3(.58f+Mathf.Cos(a)*.18f,L.BenchTopY+.003f,.42f+Mathf.Sin(a)*.14f),new Vector3(.02f,.006f,.08f),iron,.002f,.3f,new Vector3(0,i*43,0));}
  for(int i=0;i<3;i++){var p=new Vector3(.1f+i*.24f,L.BenchTopY,1.55f);RoomBuild("Clay flux pot",RoomLathe(new[]{0,.01f,.05f,.12f,.16f,.175f},new[]{.05f,.062f,.078f,.072f,.056f,.062f},16,false,true),clay,p,Quaternion.identity);RoomBuild("Dark pot contents",RoomLathe(new[]{.165f,.166f},new[]{.054f,.054f},14,true,false),coal,p,Quaternion.identity);RoomSolidCylinder("Pot",p,.06f,.17f,false);}
  MakeBellows();MakeSconce();MakeGlowBatch();
 }
 /// Great bellows on a stand at the hearth's left, worked by a rocking beam whose handle hangs at the hearth's
 /// front-right corner (ForgeLayout.BellowsHandle). Bellows(strength) pumps it; the moving parts stay unmerged.
 void MakeBellows(){
  var c=LV(L.Bellows);var fp=L.BellowsFootprint;float hx=(fp.x1-fp.x0)/2-.03f,hz=(fp.z1-fp.z0)/2-.02f;
  // Board outline: a pear, tapering toward the nozzle (+x, toward the hearth).
  Vector2[] Outline(float scale){var ring=RoomRoundRect(0,0,hx*scale,hz*scale,.12f*scale,5,6,3);for(int i=0;i<ring.Length;i++){float t=Mathf.InverseLerp(-hx*.2f,hx*scale,ring[i].x);ring[i].y*=Mathf.Lerp(1,.32f,Mathf.SmoothStep(0,1,t));}return ring;}
  RoomMesh Plate(Vector2[] o,float y0,float y1){var mb=new RoomMesh();int M=o.Length;foreach(var y in new[]{y0,y1})foreach(var p in o)mb.Add(new Vector3(p.x,y,p.y),Vector3.up);int t0=mb.t.Count;for(int i=0;i<M;i++){int a=i,b=(i+1)%M;mb.Tri(a,M+b,b);mb.Tri(a,M+a,M+b);}mb.Orient(t0,p=>new Vector3(p.x,0,p.z));
   foreach(var top in new[]{false,true}){int s=mb.v.Count;float y=top?y1:y0;int centre=mb.Add(new Vector3(-hx*.1f,y,0),top?Vector3.up:Vector3.down);foreach(var p in o)mb.Add(new Vector3(p.x,y,p.y),top?Vector3.up:Vector3.down);int tt=mb.t.Count;for(int i=0;i<M;i++)mb.Tri(centre,s+1+i,s+1+(i+1)%M);var nn=top?Vector3.up:Vector3.down;mb.Orient(tt,_=>nn);}
   var mesh=mb.Build("plate",true);var outB=new RoomMesh();outB.v.AddRange(mesh.vertices);outB.n.AddRange(mesh.normals);foreach(var _ in mesh.vertices)outB.c.Add(Color.white);outB.t.AddRange(mesh.triangles);Object.Destroy(mesh);return outB;}
  float topBoard=1.13f,bottomBoard=.95f;
  RoomBuild("Bellows top board",Plate(Outline(1),topBoard,topBoard+.025f),wood,c,Quaternion.identity);
  // Stand: four posts carry the top board; the bottom board hangs free and is lifted by the rocker.
  foreach(var x in new[]{-hx+.05f,hx-.12f})foreach(var z in new[]{-hz-.02f,hz+.02f}){RoomBox("Bellows stand post",new Vector3(c.x+x,(topBoard+.025f)/2,c.z+z),new Vector3(.05f,topBoard+.025f,.05f),woodUp,.006f,.2f);RoomSolid("Bellows post",new Vector3(c.x+x,(topBoard+.025f)/2,c.z+z),new Vector3(.045f,topBoard+.025f,.045f));}
  foreach(var z in new[]{-hz-.02f,hz+.02f})RoomBox("Bellows stand rail",new Vector3(c.x-.03f,.25f,c.z+z),new Vector3(2*hx-.1f,.05f,.04f),wood,.005f,.2f);
  RoomBuild("Bellows nozzle",RoomTube(new[]{new Vector3(c.x+hx-.06f,1.0f,c.z),new Vector3(c.x+hx+.03f,.98f,c.z)},new[]{.04f,.032f},12,Vector3.up),sootIron,Vector3.zero,Quaternion.identity);
  bellowsBottomRest=new Vector3(c.x,0,c.z);
  // Pleated leather between the boards (origin under the top board: scaling y draws the bottom up).
  {var mb=new RoomMesh();int rings=7;float h=topBoard-(bottomBoard+.025f);var o=Outline(1);int M=o.Length;for(int r=0;r<rings;r++){float t=r/(float)(rings-1);float pleat=r==0||r==rings-1?.97f:(r%2==1?1.06f:.9f);foreach(var p in o)mb.Add(new Vector3(p.x*pleat,-t*h,p.y*pleat),Vector3.up);}
   int t0=mb.t.Count;for(int r=0;r<rings-1;r++)for(int i=0;i<M;i++){int a=r*M+i,b=r*M+(i+1)%M,cc=(r+1)*M+(i+1)%M,d=(r+1)*M+i;mb.Tri(a,cc,b);mb.Tri(a,d,cc);}mb.Orient(t0,p=>new Vector3(p.x,0,p.z));
   var mesh=mb.Build("Pleated bellows leather",true);var go=MeshObject("Pleated bellows leather",mesh,leather);go.transform.position=new Vector3(c.x,topBoard,c.z);bellowsLeather=go.transform;roomDynamic.Add(go);}
  // Overhead rocker: a beam just under the ceiling, in front of the flue, pivoting on a strap hanger. A chain from its
  // right end ends in the iron handle at the hearth's front-right corner (ForgeLayout.BellowsHandle); a chain from its
  // short left end lifts the bottom board by an arm. Pulling the handle down 12 cm lifts the board 4.5 cm.
  float beamY=CeilingY-.36f,hz2=L.BellowsHandle.z;var B=new Vector3(L.BellowsHandle.x+.035f,beamY,hz2);var A=new Vector3(c.x-.15f,beamY,hz2);
  bellowsPivot=Vector3.Lerp(A,B,.045f/(.045f+.12f));bellowsAxis=Vector3.forward;
  RoomBox("Rocker hanger strap",new Vector3(bellowsPivot.x,(beamY+CeilingY)/2,hz2-.045f),new Vector3(.03f,CeilingY-beamY,.008f),sootIron,.003f,.3f);RoomBox("Rocker hanger strap",new Vector3(bellowsPivot.x,(beamY+CeilingY)/2,hz2+.045f),new Vector3(.03f,CeilingY-beamY,.008f),sootIron,.003f,.3f);
  RoomBox("Rocker pin",bellowsPivot,new Vector3(.02f,.02f,.11f),sootIron,.004f,.3f);
  var beam=new RoomMesh();beam.Append(RoomBoxBuild(new Vector3((B-A).magnitude+.08f,.07f,.06f),.008f,.3f),Matrix4x4.Translate((A+B)/2-bellowsPivot));
  var beamGo=RoomBuild("Bellows rocker beam",beam,wood,bellowsPivot,Quaternion.identity);bellowsBeam=beamGo.transform;roomDynamic.Add(beamGo);
  var link=RoomChainLink(.034f,.019f,.0034f);
  RoomMesh Chain(Vector3 top,float bottomY){var mb=new RoomMesh();int n=Mathf.Max(1,Mathf.FloorToInt((top.y-bottomY)/.026f));for(int k=0;k<n;k++)mb.Append(link,Matrix4x4.TRS(new Vector3(0,-.015f-k*.026f,0),Quaternion.Euler(0,k%2==0?0:90,90),Vector3.one));return mb;}
  var handle=Chain(B,L.BellowsHandle.y+.03f);
  handle.Append(RoomBoxBuild(new Vector3(.13f,.022f,.022f),.006f,.3f),Matrix4x4.Translate(new Vector3(-.035f,L.BellowsHandle.y-B.y,0)));
  foreach(var side in new[]{-1,1})handle.Append(RoomBoxBuild(new Vector3(.01f,.04f,.01f),.003f,.3f),Matrix4x4.Translate(new Vector3(-.035f+side*.06f,L.BellowsHandle.y-B.y+.02f,0)));
  var handleGo=RoomBuild("Bellows chain and handle",handle,sootIron,B,Quaternion.identity);bellowsHandle=handleGo.transform;bellowsHandleRest=B;roomDynamic.Add(handleGo);
  var lift=Chain(A,bottomBoard+.06f);var liftGo=RoomBuild("Bellows lifting chain",lift,sootIron,A,Quaternion.identity);bellowsLift=liftGo.transform;bellowsLiftRest=A;roomDynamic.Add(liftGo);
  // The lifting arm is part of the bottom board (it moves with it).
  var arm=new RoomMesh();arm.Append(Plate(Outline(1),bottomBoard,bottomBoard+.025f),Matrix4x4.identity);
  arm.Append(RoomBoxBuild(new Vector3(.05f,.03f,Mathf.Abs(hz2-c.z)),.006f,.3f),Matrix4x4.Translate(new Vector3(A.x-c.x,bottomBoard+.04f,(hz2-c.z)/2)));
  var bottom=RoomBuild("Bellows bottom board and lifting arm",arm,wood,bellowsBottomRest,Quaternion.identity);bellowsBottom=bottom.transform;roomDynamic.Add(bottom);
 }
 void MakeSconce(){
  var p=new Vector3(1.25f,1.70f,RoomFrontZ);
  RoomBox("Sconce back plate",p+new Vector3(0,.04f,.006f),new Vector3(.08f,.17f,.012f),sootIron,.004f,.2f);
  RoomBox("Sconce arm",p+new Vector3(0,-.02f,.065f),new Vector3(.014f,.014f,.12f),sootIron,.004f,.2f);
  RoomBuild("Sconce drip pan",RoomLathe(new[]{-.03f,-.022f,-.012f},new[]{.03f,.05f,.052f},16,true,true),tarnish,p+new Vector3(0,0,.12f),Quaternion.identity);
  RoomBuild("Sconce candle",RoomLathe(new[]{-.012f,.08f,.09f},new[]{.012f,.012f,.008f},10,true,false),candleWax,p+new Vector3(0,0,.12f),Quaternion.identity);
 }

 // ---------- Glow batch ----------
 void MakeGlowBatch(){
  // Forge/ParticleAdd must be in ForgeBuild's always-included shaders (nothing else references it in a player build).
  var additive=Shader.Find(ForgeContract.Shaders.ParticleAdd);if(additive==null){Debug.LogWarning("FORGE_ROOM "+ForgeContract.Shaders.ParticleAdd+" is not in the build: no embers or flame sprites");return;}
  glowMat=new Material(additive){name="Room glow sprites"};glowMat.SetColor("_Color",Color.white);glowMat.SetFloat("_Intensity",6);glowMat.SetFloat("_Soft",.5f);glowMat.renderQueue=3050;
  glowMesh=new Mesh{name="Room glow sprites"};glowMesh.MarkDynamic();glowV=new Vector3[GlowMaxQuads*4];glowC=new Color[GlowMaxQuads*4];glowUv=new Vector2[GlowMaxQuads*4];var tris=new int[GlowMaxQuads*6];
  for(int q=0;q<GlowMaxQuads;q++){int v=q*4;glowUv[v]=new Vector2(0,0);glowUv[v+1]=new Vector2(1,0);glowUv[v+2]=new Vector2(0,1);glowUv[v+3]=new Vector2(1,1);int t=q*6;tris[t]=v;tris[t+1]=v+2;tris[t+2]=v+1;tris[t+3]=v+1;tris[t+4]=v+2;tris[t+5]=v+3;}
  glowMesh.vertices=glowV;glowMesh.uv=glowUv;glowMesh.colors=glowC;glowMesh.triangles=tris;glowMesh.bounds=new Bounds(new Vector3(0,1.8f,-.9f),new Vector3(8,4,7));
  var go=MeshObject("Room glow sprites",glowMesh,glowMat);go.transform.SetParent(dynamicRoot,false);var r=go.GetComponent<MeshRenderer>();r.shadowCastingMode=UnityEngine.Rendering.ShadowCastingMode.Off;r.receiveShadows=false;
  // Static sprites: halos round the small flames and the warm pool of daylight under the door.
  lampHalo=glowSprites.Count;glowSprites.Add(new GlowSprite{p=LV(L.HangingLamp)+Vector3.up*.02f,right=Vector3.right*.07f,up=Vector3.up*.07f,c=new Color(1,.74f,.42f)*.16f,billboard=true});
  glowSprites.Add(new GlowSprite{p=new Vector3(1.25f,1.83f,RoomFrontZ+.12f),right=Vector3.right*.035f,up=Vector3.up*.05f,c=new Color(1,.72f,.38f)*.20f,billboard=true});
  lanternHalo=glowSprites.Count;glowSprites.Add(new GlowSprite{p=LV(L.Lantern)+Vector3.up*.18f,right=Vector3.right*.06f,up=Vector3.up*.07f,c=new Color(1,.72f,.38f)*.12f,billboard=true});
  // Candle flames: small upright teardrops (the soft disc stretched), bright core, flickering.
  glowSprites.Add(new GlowSprite{p=LV(L.Lantern)+Vector3.up*.178f,right=Vector3.right*.0065f,up=Vector3.up*.016f,c=new Color(1,.78f,.45f)*1.6f,billboard=true,flame=2});
  glowSprites.Add(new GlowSprite{p=new Vector3(1.25f,1.70f+.103f,RoomFrontZ+.12f),right=Vector3.right*.006f,up=Vector3.up*.015f,c=new Color(1,.78f,.45f)*1.5f,billboard=true,flame=1});
  glowSprites.Add(new GlowSprite{p=new Vector3((L.DoorX0+L.DoorX1)/2,.004f,RoomFrontZ-.02f),right=Vector3.right*.62f,up=Vector3.forward*.42f,c=new Color(1,.80f,.55f)*.045f,billboard=false});
  moteHome=new Vector3[MoteCount];motePhase=new float[MoteCount];var rng=new System.Random(31);
  for(int i=0;i<MoteCount;i++){moteHome[i]=new Vector3(-.4f+(float)rng.NextDouble()*1.6f,1.2f+(float)rng.NextDouble()*1.2f,-1.1f+(float)rng.NextDouble()*1.2f);motePhase[i]=(float)rng.NextDouble()*10;}
 }
 void UpdateAtmosphere(float dt){
  if(glowMesh==null||cam==null)return;var room=tuning.room;bool still=reduced||QaOn(ForgeContract.QaModes.Steady);
  // Embers rise from the coals on the plume, wander, and wink out in the hood.
  if(!still){
   float rate=QualityTier>=2?room.embersPerSTier2:room.embersPerS;emberClock+=dt*rate;
   var bed=LV(L.Firebed);var bs=LV(L.FirebedSize);
   while(emberClock>=1){emberClock-=1;if(embers.Count>=room.embersMax)continue;
    embers.Add(new Ember{p=bed+new Vector3(((float)emberRng.NextDouble()-.5f)*bs.x*.8f,.02f,((float)emberRng.NextDouble()-.5f)*bs.z*.8f),v=new Vector3(((float)emberRng.NextDouble()-.5f)*.1f,.2f+(float)emberRng.NextDouble()*.4f,((float)emberRng.NextDouble()-.5f)*.1f),life=1.2f+(float)emberRng.NextDouble()*1.4f,size=.002f+(float)emberRng.NextDouble()*.002f,twinkle=(float)emberRng.NextDouble()*20});}
  }else if(reduced)embers.Clear();
  for(int i=embers.Count-1;i>=0;i--){var e=embers[i];if(!still){e.age+=dt;float n=elapsed*.8f*Mathf.PI*2;var wander=new Vector3(Mathf.Sin(n+e.twinkle)+.5f*Mathf.Sin(2.3f*n+e.twinkle*1.7f),0,Mathf.Cos(.8f*n+e.twinkle*.6f)+.5f*Mathf.Sin(1.9f*n+e.twinkle))*.25f;e.v+=(Vector3.up*.35f+wander*1.6f-e.v*.6f)*dt;e.p+=e.v*dt;}
   if(e.age>=e.life||e.p.y>2.25f)embers.RemoveAt(i);}
  // Assemble the quads.
  var right=cam.transform.right;var up=cam.transform.up;int q=0;
  void Quad(Vector3 p,Vector3 r,Vector3 u,Color c){if(q>=GlowMaxQuads)return;int v=q*4;glowV[v]=p-r-u;glowV[v+1]=p+r-u;glowV[v+2]=p-r+u;glowV[v+3]=p+r+u;glowC[v]=glowC[v+1]=glowC[v+2]=glowC[v+3]=c;q++;}
  for(int i=0;i<glowSprites.Count;i++){var s=glowSprites[i];var c=s.c;if(i==lanternHalo||s.flame==2)c*=lanternLevel;if(i==lampHalo)c*=lampLevel;
   if(s.flame>0){float f=still?1:.86f+.09f*Mathf.Sin(elapsed*11.3f+i*1.7f)+.05f*Mathf.Sin(elapsed*23.1f+i*.6f);c*=f;var tall=up*s.up.magnitude*(still?1:.9f+.1f*f);Quad(s.p+tall*.35f,right*s.right.magnitude,tall,c);continue;}
   if(s.billboard)Quad(s.p,right*s.right.magnitude,up*s.up.magnitude,c);else Quad(s.p,s.right,s.up,c*doorLevel);}
  foreach(var e in embers){float t=e.age/e.life;var c=t<.3f?Color.Lerp(new Color(1,.6f,.2f),new Color(1,.25f,.05f)*.33f,t/.3f):Color.Lerp(new Color(1,.25f,.05f)*.33f,Color.black,(t-.3f)/.7f);if(!still)c*=.75f+.25f*Mathf.Sin(elapsed*23+e.twinkle);Quad(e.p,right*e.size,up*e.size,c);}
  for(int i=0;i<MoteCount;i++){float ph=motePhase[i]+(still?0:elapsed*.11f);var p=moteHome[i]+new Vector3(Mathf.Sin(ph*1.3f)*.25f,Mathf.Repeat(ph*.06f,1)*.6f,Mathf.Cos(ph*.9f)*.2f);float a=Mathf.Sin(Mathf.Repeat(ph*.06f,1)*Mathf.PI);Quad(p,right*.0025f,up*.0025f,new Color(.9f,.71f,.4f)*.03f*a);}
  for(int k=q;k<GlowMaxQuads;k++){int v=k*4;glowV[v]=glowV[v+1]=glowV[v+2]=glowV[v+3]=Vector3.zero;}
  glowMesh.vertices=glowV;glowMesh.colors=glowC;
  // Bellows: the handle follows the hand's stroke (down and back up, ForgeFlicker.HandlePull); the beam rocks on its
  // pin (lever ratio .375), the lifting chain and the bottom board rise, the leather folds.
  if(bellowsBeam!=null){float pull=bellowsUnseen?0:ForgeFlicker.HandlePull(bellowsSince,room)*Mathf.Clamp01(bellowsStrength)*room.bellowsPullCm/100;float lift=pull*.375f;
   float lever=(bellowsHandleRest-bellowsPivot).magnitude;bellowsBeam.localRotation=Quaternion.AngleAxis(-Mathf.Asin(Mathf.Clamp(pull/lever,-1,1))*Mathf.Rad2Deg,bellowsAxis);
   bellowsHandle.localPosition=bellowsHandleRest+Vector3.down*pull;bellowsLift.localPosition=bellowsLiftRest+Vector3.up*lift;
   bellowsBottom.localPosition=bellowsBottomRest+Vector3.up*lift;bellowsLeather.localScale=new Vector3(1,1-lift/.155f,1);}
 }
}
