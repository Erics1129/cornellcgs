using System.Collections.Generic;
using UnityEngine;
using UnityEngine.Rendering;
using L = ForgeLayoutData;

// Owner: room-light-post. The workshop, built at the frozen ForgeLayoutData stations. All dimensions are metres.
// A closed brick room (four walls at real 225 x 75 mm brick scale, a plank ceiling on five joists, a door and
// a barred window), the anvil on its stump, the hearth beside it with its firepot, hood, flue and slack tub,
// the bench along the back wall, and the station furniture. Static geometry is baked (vertex AO) and merged
// per material in BatchRoom (ForgeRoomBake.cs). Moving parts (bellows) are kept out of the merge.
public partial class ForgeWorld {
 Material mortar,polished;ReflectionProbe workshopProbe;
 Material tarnish,woodUp,ceilingWood,brickWall,flagstone,anvilSteel,sootIron,hoodIron,tin,enamel,hotCoal,water,lampGlass,candleWax,daylight,clay,hearthTop;
 GameObject anvilObject;
 static Vector3 LV(L.F3 v)=>new Vector3(v.x,v.y,v.z);
 /// Room interior: inner wall faces (x -3.425..3.425, z -3.79..2.01), floor 0, ceiling planks underside 3.62.
 const float RoomX=3.425f,RoomBackZ=2.01f,RoomFrontZ=-3.79f,CeilingY=3.62f;
 static readonly Vector3 WindowMin=new Vector3(1.60f,1.66f,0),WindowMax=new Vector3(3.10f,3.06f,0);
 static readonly float[] JoistX={-2.70f,-1.47f,.35f,1.55f,2.75f};

 void MakeMaterials(){
  wood=Mat("Smoked oak","b4b0aa",0,.26f);wood.mainTexture=Resources.Load<Texture2D>("Forge/WoodV3");
  stone=Mat("Soot blackened masonry","a2917e",0,.08f);stone.mainTexture=Resources.Load<Texture2D>("Forge/BrickV3");
  iron=Mat("Forged iron","505c61",.87f,.46f);brass=Mat("Aged brass","b59957",.8f,.57f);tarnish=Mat("Tarnished brass","8a7748",.78f,.40f);tarnish.mainTexture=Resources.Load<Texture2D>("Forge/IronV3");tarnish.SetFloat("_Scale",4.5f);tarnish.SetFloat("_ObjectSpace",1);leather=Mat("Wrapped leather","352b25",0,.29f);coal=Mat("Coal","191c1a",.1f,.1f);
  wood.SetFloat("_Scale",1.6f);stone.SetFloat("_Scale",1.3f);iron.mainTexture=Resources.Load<Texture2D>("Forge/IronV3");iron.SetFloat("_Scale",1.8f);iron.color=C("676d70");iron.SetFloat("_BumpStrength",.0018f);leather.mainTexture=Resources.Load<Texture2D>("Forge/LeatherV3");leather.color=C("b1a394");leather.SetFloat("_Scale",2);wood.SetFloat("_BumpStrength",.0025f);stone.SetFloat("_BumpStrength",.003f);
  coal.mainTexture=Resources.Load<Texture2D>("Forge/IronV3");coal.SetFloat("_Scale",6);
  // The hammer's striking face (strike-feel) uses `polished`, so it exists before MakeHammer.
  polished=Mat("Burnished steel working face","a4a5a2",.96f,.72f);polished.mainTexture=Resources.Load<Texture2D>("Forge/SteelV2");polished.SetFloat("_Scale",2.1f);polished.SetFloat("_BumpStrength",.0008f);
  woodUp=new Material(wood){name="Smoked oak, vertical grain"};woodUp.SetFloat("_GrainUp",1);
  ceilingWood=new Material(wood){name="Smoke-blackened ceiling boards",color=C("9c8a74")};ceilingWood.SetFloat("_Soot",1);ceilingWood.SetFloat("_Scale",1.2f);
  brickWall=Mat("Hand-fired brick in lime mortar","c4beb6",0,.12f);brickWall.mainTexture=Resources.Load<Texture2D>("Forge/BrickV3");brickWall.SetFloat("_Scale",2.4f);brickWall.SetFloat("_Brick",1);brickWall.SetFloat("_Soot",1);brickWall.SetColor("_MortarColor",C("2a2621"));brickWall.SetFloat("_BumpStrength",.0016f);
  // The floor is the brick code laid flat: staggered 70 x 56 cm flagstones, 15 mm grout, each slab at its own slight tilt.
  flagstone=Mat("Worn flagstone","857e74",0,.10f);flagstone.mainTexture=Resources.Load<Texture2D>("Forge/IronV3");flagstone.SetFloat("_Scale",3.1f);flagstone.SetFloat("_BumpStrength",.0025f);
  flagstone.SetFloat("_Brick",1);flagstone.SetVector("_BrickSize",new Vector4(.70f,.56f,.015f,.008f));flagstone.SetFloat("_BrickStagger",.17f);flagstone.SetFloat("_BrickTilt",.022f);flagstone.SetColor("_MortarColor",C("26221e"));
  hearthTop=Mat("Fire-scarred hearth slab","4a4440",0,.12f);hearthTop.mainTexture=Resources.Load<Texture2D>("Forge/IronV3");hearthTop.SetFloat("_Scale",2.2f);hearthTop.SetFloat("_BumpStrength",.002f);
  anvilSteel=Mat("Forged anvil steel","555a5c",.82f,.40f);anvilSteel.mainTexture=Resources.Load<Texture2D>("Forge/IronV3");anvilSteel.SetTexture("_FaceTex",Resources.Load<Texture2D>("Forge/SteelV2"));anvilSteel.SetFloat("_Scale",3.2f);anvilSteel.SetFloat("_ObjectSpace",1);anvilSteel.SetFloat("_Wear",1);anvilSteel.SetVector("_FaceHalf",new Vector4(L.AnvilFaceX*.5f,L.AnvilFaceZ*.5f,0,0));anvilSteel.SetFloat("_BumpStrength",.0011f);
  sootIron=Mat("Sooty sheet iron","4a4744",.5f,.30f);sootIron.mainTexture=Resources.Load<Texture2D>("Forge/IronV3");sootIron.SetFloat("_Scale",1.6f);sootIron.SetFloat("_Soot",.8f);
  // The hood: riveted sheet iron under a matte crust of soot (dark, but its form still reads in the bounce light).
  hoodIron=Mat("Soot-crusted sheet iron hood","a49c92",.25f,.20f);hoodIron.mainTexture=Resources.Load<Texture2D>("Forge/IronV3");hoodIron.SetFloat("_Scale",1.4f);hoodIron.SetFloat("_BumpStrength",.0015f);
  tin=Mat("Sooty tinned lamp shade","4c4945",.7f,.36f);tin.mainTexture=Resources.Load<Texture2D>("Forge/IronV3");tin.SetFloat("_Scale",4);enamel=Mat("Smoke-yellowed enamel shade lining","a8997e",0,.4f);enamel.SetColor("_EmissionColor",C("ffd8a0")*.04f);
  hotCoal=Mat("Incandescent charcoal","2a1c16",.1f,.18f);hotCoal.mainTexture=Resources.Load<Texture2D>("Forge/IronV3");hotCoal.SetFloat("_Scale",9);hotCoal.SetFloat("_Pulse",1);hotCoal.SetColor("_EmissionColor",C("ff4e10")*2.3f);
  water=Mat("Slack tub water","0f1517",0,.94f);
  lampGlass=Mat("Lamp chimney glass","ffd9a6",0,.9f);lampGlass.SetColor("_EmissionColor",C("ffc27a")*3.2f);
  candleWax=Mat("Tallow candle","e6d3a8",0,.35f);candleWax.SetColor("_EmissionColor",C("ffb952")*.30f);
  daylight=Mat("Daylight through the window","1b2630",0,.1f);daylight.SetColor("_EmissionColor",C("9fb6d6")*.22f);
  clay=Mat("Unglazed clay","8a7864",0,.15f);clay.mainTexture=Resources.Load<Texture2D>("Forge/IronV3");clay.SetFloat("_Scale",5);
  mortar=Mat("Recessed lime mortar","282521",0,.05f);
  MakeVfxMaterials();
 }

 // ---------- Room shell ----------
 void MakeRoom(){
  // The flagstone floor itself is laid in RoomFloor (AtmosBuild).
  RoomSolid("Floor",new Vector3(0,-.1f,-.89f),new Vector3(7.2f,.2f,6.2f));
  // Walls: one bevelled panel per wall section, inner face only, subdivided for the corner AO.
  float H=CeilingY;
  // Walls that reach the ceiling run 6 cm on into the ceiling void, so no slit shows between the wall top and the boards.
  void Wall(string name,Vector3 a,Vector3 b,int face){if(b.y>=H-.001f)b.y=H+.06f;var c=(a+b)/2;var s=b-a;s=new Vector3(Mathf.Max(.02f,Mathf.Abs(s.x)),Mathf.Abs(s.y),Mathf.Max(.02f,Mathf.Abs(s.z)));RoomBox(name,c,s,brickWall,0,.22f,default,face);}
  // Back wall (z 2.01) with the window opening.
  Wall("Back wall",new Vector3(-RoomX,0,RoomBackZ),new Vector3(WindowMin.x,H,RoomBackZ+.02f),32);
  Wall("Back wall right of the window",new Vector3(WindowMax.x,0,RoomBackZ),new Vector3(RoomX,H,RoomBackZ+.02f),32);
  Wall("Back wall under the window",new Vector3(WindowMin.x,0,RoomBackZ),new Vector3(WindowMax.x,WindowMin.y,RoomBackZ+.02f),32);
  Wall("Back wall over the window",new Vector3(WindowMin.x,WindowMax.y,RoomBackZ),new Vector3(WindowMax.x,H,RoomBackZ+.02f),32);
  // Window reveal (30 cm deep), the sky behind iron bars, and a stone sill.
  RoomBox("Window reveal left",new Vector3(WindowMin.x-.01f,(WindowMin.y+WindowMax.y)/2,RoomBackZ+.15f),new Vector3(.02f,WindowMax.y-WindowMin.y,.30f),brickWall,0,.2f,default,1);
  RoomBox("Window reveal right",new Vector3(WindowMax.x+.01f,(WindowMin.y+WindowMax.y)/2,RoomBackZ+.15f),new Vector3(.02f,WindowMax.y-WindowMin.y,.30f),brickWall,0,.2f,default,2);
  RoomBox("Window reveal head",new Vector3((WindowMin.x+WindowMax.x)/2,WindowMax.y+.01f,RoomBackZ+.15f),new Vector3(WindowMax.x-WindowMin.x,.02f,.30f),brickWall,0,.2f,default,8);
  RoomBox("Stone window sill",new Vector3((WindowMin.x+WindowMax.x)/2,WindowMin.y-.04f,RoomBackZ+.10f),new Vector3(WindowMax.x-WindowMin.x+.16f,.08f,.44f),hearthTop,.008f,.2f);
  RoomSolid("Window sill",new Vector3((WindowMin.x+WindowMax.x)/2,WindowMin.y-.04f,RoomBackZ+.10f),new Vector3(WindowMax.x-WindowMin.x+.12f,.07f,.42f));
  // The sky overlaps the reveals by 8 cm on every side, so no hairline of the clear colour shows at the joints.
  Box("Sky beyond the window",new Vector3((WindowMin.x+WindowMax.x)/2,(WindowMin.y+WindowMax.y)/2,RoomBackZ+.29f),new Vector3(WindowMax.x-WindowMin.x+.16f,WindowMax.y-WindowMin.y+.16f,.02f),daylight);
  for(int i=0;i<6;i++)RoomBox("Wrought window bar",new Vector3(WindowMin.x+.2f+i*.22f,(WindowMin.y+WindowMax.y)/2,RoomBackZ+.20f),new Vector3(.022f,WindowMax.y-WindowMin.y,.022f),iron,.006f,.5f);
  RoomBox("Window transom",new Vector3((WindowMin.x+WindowMax.x)/2,2.42f,RoomBackZ+.20f),new Vector3(WindowMax.x-WindowMin.x,.03f,.035f),iron,.006f,.5f);
  // A soldier-course brick lintel over the window and the door (real protruding bricks, about 40).
  Lintel(new Vector3((WindowMin.x+WindowMax.x)/2,WindowMax.y,RoomBackZ),WindowMax.x-WindowMin.x+.2f,-1);
  // Front wall (z -3.79) with the door.
  float dx0=L.DoorX0,dx1=L.DoorX1,dy=2.05f;
  Wall("Front wall",new Vector3(-RoomX,0,RoomFrontZ-.02f),new Vector3(dx0,H,RoomFrontZ),16);
  Wall("Front wall right of the door",new Vector3(dx1,0,RoomFrontZ-.02f),new Vector3(RoomX,H,RoomFrontZ),16);
  Wall("Front wall over the door",new Vector3(dx0,dy,RoomFrontZ-.02f),new Vector3(dx1,H,RoomFrontZ),16);
  RoomBox("Door reveal left",new Vector3(dx0-.01f,dy/2,RoomFrontZ-.11f),new Vector3(.02f,dy,.22f),brickWall,0,.2f,default,1);
  RoomBox("Door reveal right",new Vector3(dx1+.01f,dy/2,RoomFrontZ-.11f),new Vector3(.02f,dy,.22f),brickWall,0,.2f,default,2);
  RoomBox("Door reveal head",new Vector3((dx0+dx1)/2,dy+.01f,RoomFrontZ-.11f),new Vector3(dx1-dx0,.02f,.22f),brickWall,0,.2f,default,8);
  Lintel(new Vector3((dx0+dx1)/2,dy,RoomFrontZ),dx1-dx0+.24f,1);
  MakeDoor(dx0,dx1,dy);
  // Side walls.
  Wall("Left wall",new Vector3(-RoomX-.02f,0,RoomFrontZ),new Vector3(-RoomX,H,RoomBackZ),1);
  Wall("Right wall",new Vector3(RoomX,0,RoomFrontZ),new Vector3(RoomX+.02f,H,RoomBackZ),2);
  foreach(var w in new[]{(new Vector3(0,H/2,RoomBackZ+.11f),new Vector3(7.2f,H,.22f)),(new Vector3(0,H/2,RoomFrontZ-.11f),new Vector3(7.2f,H,.22f)),(new Vector3(-RoomX-.11f,H/2,-.89f),new Vector3(.22f,H,6.2f)),(new Vector3(RoomX+.11f,H/2,-.89f),new Vector3(.22f,H,6.2f))})RoomSolid("Wall",w.Item1,w.Item2);
  // Timber frame: corner posts and a wall plate under the joists.
  foreach(var x in new[]{-RoomX+.1f,RoomX-.1f})foreach(var z in new[]{RoomBackZ-.1f,RoomFrontZ+.1f}){RoomBox("Corner post",new Vector3(x,H/2,z),new Vector3(.2f,H,.2f),woodUp,.012f,.4f);RoomSolid("Corner post",new Vector3(x,H/2,z),new Vector3(.18f,H,.18f));}
  foreach(var z in new[]{RoomBackZ-.09f,RoomFrontZ+.09f}){RoomBox("Wall plate",new Vector3(0,H-.1f,z),new Vector3(2*RoomX,.2f,.18f),ceilingWood,.012f,.6f);RoomSolid("Wall plate",new Vector3(0,H-.1f,z),new Vector3(2*RoomX,.19f,.16f));}
  // Ceiling: boards on five 12 x 20 cm joists resting on the wall plates.
  foreach(var x in JoistX){RoomBox("Ceiling joist",new Vector3(x,H-.1f,(RoomBackZ+RoomFrontZ)/2),new Vector3(.12f,.2f,RoomBackZ-RoomFrontZ),ceilingWood,.01f,.5f);RoomSolid("Joist",new Vector3(x,H-.1f,(RoomBackZ+RoomFrontZ)/2),new Vector3(.11f,.19f,RoomBackZ-RoomFrontZ));}
  var rng=new System.Random(7);
  for(float z=RoomFrontZ;z<RoomBackZ-.01f;z+=.206f){float w=Mathf.Min(.198f,RoomBackZ-z);var board=RoomBox("Ceiling board",new Vector3(0,H+.018f,z+w/2),new Vector3(2*RoomX,.035f,w),ceilingWood,.004f,.45f,default,8);RoomTinted(board,Color.Lerp(C("8f8577"),Color.white,(float)rng.NextDouble()));}
  // The floor of the loft above: dark boards seen through the 8 mm gaps between the ceiling boards (no void).
  var backing=RoomBox("Loft floor seen between the ceiling boards",new Vector3(0,H+.04f,(RoomFrontZ+RoomBackZ)/2),new Vector3(2*RoomX,.008f,RoomBackZ-RoomFrontZ),ceilingWood,0,1.2f,default,8);RoomTinted(backing,C("4a4038"));roomNoAo.Add(backing);
  RoomSolid("Ceiling",new Vector3(0,H+.1f,-.89f),new Vector3(7.2f,.2f,6.2f));
  // Tool rail over the back of the bench.
  RoomBox("Tool rail",new Vector3(1.3f,1.78f,RoomBackZ-.05f),new Vector3(2.4f,.07f,.07f),wood,.008f,.5f);
  for(int i=0;i<7;i++){var tool=Group("Hand forged tool",new Vector3(.25f+i*.34f,1.50f,RoomBackZ-.08f));RoomBox("Ash handle",Vector3.zero,new Vector3(.025f,.42f,.028f),woodUp,.006f,.5f,default,RoomFaceAll,tool);RoomBox("Tool head",new Vector3(0,.17f,0),i%3==2?new Vector3(.05f,.12f,.03f):new Vector3(.15f,.06f,.055f),iron,.006f,.5f,default,RoomFaceAll,tool);tool.Rotate(0,0,(i%3-1)*6);}
 }
 /// The floor: one 10 cm grid (fine enough for the baked contact AO under every station) with the procedural flagstones.
 void RoomFloor(){float z0=RoomFrontZ-.14f;RoomBox("Flagstone floor",new Vector3(0,-.01f,(z0+RoomBackZ)/2),new Vector3(2*RoomX,.02f,RoomBackZ-z0),flagstone,0,.1f,default,4);}
 /// A soldier-course lintel of real bricks standing proud of the wall by 12 mm. side: -1 back wall (faces -z), +1 front wall (faces +z).
 void Lintel(Vector3 bottomCentre,float width,int side){
  int n=Mathf.RoundToInt(width/.075f);var rng=new System.Random(11+n);
  for(int i=0;i<n;i++){float x=bottomCentre.x-width/2+(i+.5f)*width/n;var b=RoomBox("Soldier brick",new Vector3(x,bottomCentre.y+.1125f,bottomCentre.z+side*.006f),new Vector3(.065f,.215f,.10f),brickWall,.004f,.2f);RoomTinted(b,Color.Lerp(C("c9b4a0"),Color.white,(float)rng.NextDouble()));}
 }
 void MakeDoor(float x0,float x1,float h){
  float z=RoomFrontZ-.07f;var rng=new System.Random(3);int planks=5;float w=(x1-x0-.01f)/planks;
  for(int i=0;i<planks;i++){var p=RoomBox("Door plank",new Vector3(x0+.005f+(i+.5f)*w,h/2+.006f,z),new Vector3(w-.006f,h-.016f,.04f),woodUp,.006f,.25f);RoomTinted(p,Color.Lerp(C("a59484"),Color.white,(float)rng.NextDouble()));}
  foreach(var y in new[]{.35f,1.65f})RoomBox("Door ledge",new Vector3((x0+x1)/2,y,z+.035f),new Vector3(x1-x0-.05f,.13f,.03f),wood,.006f,.3f);
  RoomBox("Door brace",new Vector3((x0+x1)/2,1.0f,z+.035f),new Vector3(.12f,1.36f,.028f),woodUp,.006f,.3f,new Vector3(0,0,-28));
  foreach(var y in new[]{.35f,1.65f}){RoomBox("Strap hinge",new Vector3(x1-.30f,y,z+.055f),new Vector3(.56f,.035f,.008f),sootIron,.003f,.3f);RoomBox("Hinge pintle",new Vector3(x1-.02f,y,z+.05f),new Vector3(.03f,.07f,.03f),sootIron,.006f,.3f);for(int k=0;k<4;k++)RoomBox("Clench nail",new Vector3(x1-.08f-k*.14f,y,z+.06f),new Vector3(.012f,.012f,.006f),sootIron,.003f,.3f);}
  RoomBox("Door latch bar",new Vector3(x0+.16f,1.05f,z+.058f),new Vector3(.24f,.025f,.01f),sootIron,.003f,.3f);
  RoomBox("Door latch keeper",new Vector3(x0+.05f,1.05f,z+.06f),new Vector3(.03f,.06f,.03f),sootIron,.004f,.3f);
  // Warm daylight leaking under the door: a thin bright gap (the floor pool is a sprite in the glow batch).
  Box("Light under the door",new Vector3((x0+x1)/2,.007f,RoomFrontZ-.075f),new Vector3(x1-x0-.03f,.012f,.03f),daylight);
  RoomSolid("Door",new Vector3((x0+x1)/2,h/2,z),new Vector3(x1-x0,h,.06f));
 }

 // ---------- Bench ----------
 void MakeBench(){
  var b=L.Bench;float top=L.BenchTopY,cx=(b.x0+b.x1)/2,len=b.x1-b.x0,depth=b.z1-b.z0;var rng=new System.Random(5);
  for(int i=0;i<4;i++){float w=depth/4;var plank=RoomBox("Thick scarred oak plank",new Vector3(cx,top-.03f,b.z0+(i+.5f)*w),new Vector3(len,.06f,w-.006f),wood,.008f,.12f);RoomTinted(plank,Color.Lerp(C("b3a593"),Color.white,(float)rng.NextDouble()));}
  RoomSolid("Bench top",new Vector3(cx,top-.03f,(b.z0+b.z1)/2),new Vector3(len,.06f,depth));
  foreach(var x in new[]{b.x0+.1f,cx,b.x1-.1f})foreach(var z in new[]{b.z0+.09f,b.z1-.09f}){RoomBox("Joinery leg",new Vector3(x,(top-.06f)/2,z),new Vector3(.14f,top-.06f,.14f),woodUp,.01f,.12f);RoomSolid("Bench leg",new Vector3(x,(top-.06f)/2,z),new Vector3(.13f,top-.06f,.13f));}
  RoomBox("Workbench front apron",new Vector3(cx,top-.12f,b.z0+.03f),new Vector3(len-.04f,.12f,.04f),wood,.008f,.15f);RoomSolid("Bench apron",new Vector3(cx,top-.12f,b.z0+.03f),new Vector3(len-.04f,.11f,.035f));
  foreach(var z in new[]{b.z0+.09f,b.z1-.09f}){RoomBox("Low stretcher",new Vector3(cx,.16f,z),new Vector3(len-.2f,.08f,.06f),wood,.008f,.2f);RoomSolid("Bench stretcher",new Vector3(cx,.16f,z),new Vector3(len-.2f,.07f,.05f));}
  // A low shelf under the bench with spare stock and a bucket.
  RoomBox("Bench shelf board",new Vector3(cx+.6f,.24f,(b.z0+b.z1)/2+.1f),new Vector3(2.2f,.03f,1.2f),wood,.006f,.2f);RoomSolid("Bench shelf",new Vector3(cx+.6f,.24f,(b.z0+b.z1)/2+.1f),new Vector3(2.2f,.03f,1.2f));
  for(int i=0;i<6;i++)RoomBox("Bar stock",new Vector3(cx+.1f+i*.03f,.27f,(b.z0+b.z1)/2+.1f),new Vector3(1.1f,.018f,.018f),sootIron,.004f,.3f,new Vector3(0,i*4-8,0));
  BenchClutter();RightWallDressing();
 }
 /// What a working bench carries just behind the anvil (the part of the bench the work view sees).
 void BenchClutter(){
  float y=L.BenchTopY;
  // A spare pair of flat-jaw tongs.
  var tg=Group("Spare tongs on the bench",new Vector3(-.28f,y+.006f,.12f));RoomBox("Tong rein",new Vector3(-.2f,0,-.012f),new Vector3(.40f,.009f,.009f),sootIron,.003f,.3f,new Vector3(0,3,0),RoomFaceAll,tg);RoomBox("Tong rein",new Vector3(-.2f,0,.012f),new Vector3(.40f,.009f,.009f),sootIron,.003f,.3f,new Vector3(0,-3,0),RoomFaceAll,tg);RoomBox("Tong jaws",new Vector3(.02f,.002f,0),new Vector3(.07f,.012f,.032f),sootIron,.004f,.3f,default,RoomFaceAll,tg);RoomBox("Tong rivet",new Vector3(-.015f,.006f,0),new Vector3(.016f,.012f,.016f),sootIron,.004f,.3f,default,RoomFaceAll,tg);tg.Rotate(0,24,0);
  // A wire brush, a file, a punch and a short length of bar.
  var brush=Group("Wire brush",new Vector3(.36f,y,.04f));RoomBox("Brush stock",new Vector3(0,.012f,0),new Vector3(.24f,.024f,.045f),wood,.006f,.3f,default,RoomFaceAll,brush);RoomBox("Brush bristles",new Vector3(.04f,-.002f,0),new Vector3(.13f,.012f,.04f),sootIron,.002f,.3f,default,RoomFaceAll,brush);brush.Rotate(0,-18,0);brush.position+=Vector3.up*.012f;
  RoomBox("Flat file",new Vector3(.08f,y+.004f,.28f),new Vector3(.30f,.008f,.022f),iron,.002f,.3f,new Vector3(0,62,0));RoomBox("File tang handle",new Vector3(.01f,y+.012f,.42f),new Vector3(.10f,.024f,.024f),woodUp,.006f,.3f,new Vector3(0,62,0));
  RoomBox("Drift punch",new Vector3(.72f,y+.01f,.18f),new Vector3(.16f,.02f,.02f),iron,.005f,.3f,new Vector3(0,-40,0));
  for(int i=0;i<3;i++)RoomBox("Bar stock",new Vector3(-.05f+i*.035f,y+.008f,.40f),new Vector3(.55f,.016f,.016f),sootIron,.003f,.3f,new Vector3(0,8+i*3,0));
  // A hot-cut hardy waiting by the anvil.
  var hardy=Group("Hot-cut hardy",new Vector3(.95f,y,.02f));RoomBox("Hardy shank",new Vector3(0,.03f,0),new Vector3(.026f,.06f,.026f),sootIron,.004f,.3f,default,RoomFaceAll,hardy);RoomBox("Hardy blade",new Vector3(0,.07f,0),new Vector3(.06f,.03f,.02f),iron,.004f,.3f,default,RoomFaceAll,hardy);hardy.Rotate(0,0,90);hardy.position+=Vector3.up*.013f;
 }
 /// The right wall: a tong rack, a shelf of crocks and a row of horseshoes.
 void RightWallDressing(){
  float x=RoomX-.02f;
  RoomBox("Tong rack bar",new Vector3(x-.05f,1.55f,-1.8f),new Vector3(.03f,.03f,1.3f),sootIron,.005f,.3f);for(int k=0;k<2;k++)RoomBox("Rack bracket",new Vector3(x-.025f,1.55f,-2.4f+k*1.2f),new Vector3(.05f,.03f,.03f),sootIron,.005f,.3f);
  for(int i=0;i<6;i++){var t=Group("Tongs on the rack",new Vector3(x-.06f,1.56f,-2.35f+i*.22f));RoomBox("Tong rein",new Vector3(0,-.21f,-.012f),new Vector3(.009f,.42f,.009f),sootIron,.003f,.3f,new Vector3(2,0,0),RoomFaceAll,t);RoomBox("Tong rein",new Vector3(0,-.21f,.012f),new Vector3(.009f,.42f,.009f),sootIron,.003f,.3f,new Vector3(-2,0,0),RoomFaceAll,t);RoomBox("Tong jaws",new Vector3(0,.03f,0),new Vector3(.014f,.07f,.03f),sootIron,.004f,.3f,default,RoomFaceAll,t);t.Rotate(0,0,(i%3-1)*3);}
  RoomBox("Wall shelf",new Vector3(x-.13f,2.02f,-.6f),new Vector3(.26f,.03f,1.1f),wood,.006f,.3f);foreach(var z in new[]{-1.05f,-.15f})RoomBox("Shelf bracket",new Vector3(x-.06f,1.93f,z),new Vector3(.12f,.16f,.025f),woodUp,.005f,.3f);
  var rng=new System.Random(41);for(int i=0;i<4;i++){var p=new Vector3(x-.13f,2.035f,-1.0f+i*.27f);float h=.13f+(float)rng.NextDouble()*.06f;RoomBuild("Stoneware crock",RoomLathe(new[]{0,.01f,h*.5f,h*.9f,h},new[]{.05f,.06f,.07f,.05f,.052f},14,true,false),clay,p,Quaternion.identity);}
  for(int i=0;i<5;i++){var hs=Group("Horseshoe",new Vector3(x-.012f,2.45f,-2.0f+i*.24f));foreach(var side in new[]{-1,1})RoomBox("Horseshoe branch",new Vector3(0,-.02f,side*.045f),new Vector3(.012f,.11f,.022f),sootIron,.003f,.3f,new Vector3(side*8,0,0),RoomFaceAll,hs);RoomBox("Horseshoe toe",new Vector3(0,.04f,0),new Vector3(.012f,.024f,.08f),sootIron,.003f,.3f,default,RoomFaceAll,hs);}
 }

 // ---------- Anvil ----------
 void MakeAnvil(){
  var c=LV(L.AnvilCenter);float stumpTop=L.StumpTopY,r=L.StumpRadius-.005f;
  // End-grain oak stump with two iron hoops.
  var jitter=new System.Random(17);var noise=new float[28];for(int i=0;i<28;i++)noise[i]=1+((float)jitter.NextDouble()-.5f)*.03f;
  var stump=RoomLathe(new[]{0,.04f,.10f,.25f,.42f,stumpTop-.012f,stumpTop},new[]{r*1.05f,r*1.03f,r,r*.985f,r*.99f,r*.985f,r*.96f},28,true,false,(ring,s)=>noise[s]*(ring==6?1:1+.006f*Mathf.Sin(ring*2.1f+s*.9f)));
  var stumpGo=RoomBuild("End grain oak anvil stump",stump,woodUp,new Vector3(c.x,0,c.z),Quaternion.Euler(0,16,0));
  RoomSolidCylinder("Anvil stump",new Vector3(c.x,0,c.z),r-.01f,stumpTop);
  foreach(var y in new[]{.08f,.43f}){var band=RoomLathe(new[]{y,y+.003f,y+.042f,y+.045f},new[]{r*.995f,r+.006f,r+.006f,r*.995f},28,false,false);RoomBuild("Iron stump hoop",band,sootIron,new Vector3(c.x,0,c.z),Quaternion.identity);
   for(int k=0;k<6;k++){float a=k*Mathf.PI/3+.3f;RoomBox("Hoop rivet",new Vector3(c.x+Mathf.Cos(a)*(r+.008f),y+.022f,c.z+Mathf.Sin(a)*(r+.008f)),new Vector3(.012f,.012f,.012f),sootIron,.005f,.5f);}}
  // The lofted anvil (object space at the face-top centre; Surface _Wear draws the face, chips and holes).
  anvilObject=MeshObject("Lofted forged anvil with horn, step, hardy and pritchel",RoomAnvilMesh(),anvilSteel);anvilObject.transform.position=c;roomSeparate.Add(anvilObject);
  float fx=L.AnvilFaceX,fz=L.AnvilFaceZ;
  RoomSolid("Anvil face",c+new Vector3(0,-.04f,0),new Vector3(fx,.08f,fz));
  RoomSolid("Anvil body",c+new Vector3(-.004f,-.20f,0),new Vector3(.24f,.22f,.10f));
  RoomSolid("Anvil base",c+new Vector3(-.005f,-.295f,0),new Vector3(.37f,.03f,.24f));
  RoomSolid("Anvil horn",c+new Vector3(fx*.5f+L.AnvilStepX+L.AnvilHornX*.5f,-.065f,0),new Vector3(L.AnvilHornX,.08f,.08f),default,true,false);
  // A chain wrapped round the waist (smiths do this to damp the ring), its end lying on the stump by a staple.
  var link=RoomChainLink(.034f,.020f,.0036f);var path=RoomRoundRect(-.004f,0,.122f,.058f,.035f,6,8,4);var chain=new RoomMesh();int count=0;float acc=0;
  for(int i=0;i<path.Length;i++){var a=path[i];var b=path[(i+1)%path.Length];float seg=(b-a).magnitude;for(float s=acc;s<seg;s+=.025f){var p=Vector2.Lerp(a,b,s/seg);var dir=(b-a).normalized;var m=Matrix4x4.TRS(new Vector3(p.x,-.200f,p.y),Quaternion.LookRotation(new Vector3(dir.x,0,dir.y))*Quaternion.Euler(0,90,0)*Quaternion.Euler(count%2==0?0:90,0,0),Vector3.one);chain.Append(link,m);count++;acc=s+.025f-seg;}if(acc<0)acc=0;}
  for(int k=0;k<4;k++){var m=Matrix4x4.TRS(new Vector3(-.128f-.010f*k,-.222f-k*.024f,-.064f-.014f*k),Quaternion.Euler(0,k%2==0?0:90,90),Vector3.one);chain.Append(link,m);}
  roomLumpAo.Add(RoomBuild("Anvil chain",chain,sootIron,c,Quaternion.identity));
  {var d=new Vector3(-.80f,0,-.60f);RoomBox("Chain staple",new Vector3(c.x,stumpTop-.03f,c.z)+d*(r+.004f),new Vector3(.024f,.03f,.016f),sootIron,.005f,.3f,Quaternion.LookRotation(d).eulerAngles);}
 }

 // ---------- Hearth ----------
 void MakeFurnace(){
  var hb=LV(L.HearthBoxCenter);var hs=LV(L.HearthBoxSize);float x0=hb.x-hs.x/2,x1=hb.x+hs.x/2,z0=hb.z-hs.z/2,z1=hb.z+hs.z/2,top=hb.y+hs.y/2;
  var bed=LV(L.Firebed);var bedSize=LV(L.FirebedSize);var tub=LV(L.SlackTub);var tubSize=LV(L.SlackTubSize);
  // Brick body and a fire-scarred stone top with the slack tub let into its front-right corner.
  RoomBox("Hearth masonry",new Vector3(hb.x,(top-.06f)/2,hb.z),new Vector3(hs.x,top-.06f,hs.z),brickWall,.004f,.2f,default,RoomFaceAll&~8);
  RoomSolid("Hearth body",new Vector3(hb.x,(top-.06f)/2,hb.z),new Vector3(hs.x-.01f,top-.06f,hs.z-.01f));
  float tx0=tub.x-tubSize.x/2,tx1=tub.x+tubSize.x/2,tz0=tub.z-tubSize.z/2,tz1=tub.z+tubSize.z/2,o=.015f,ty=top-.03f;
  RoomBox("Hearth slab",new Vector3((x0-o+tx0)/2,ty,hb.z),new Vector3(tx0-x0+o,.06f,hs.z+2*o),hearthTop,.008f,.12f);
  RoomBox("Hearth slab",new Vector3((tx1+x1+o)/2,ty,hb.z),new Vector3(x1+o-tx1,.06f,hs.z+2*o),hearthTop,.008f,.12f);
  RoomBox("Hearth slab",new Vector3((tx0+tx1)/2,ty,(z0-o+tz0)/2),new Vector3(tx1-tx0,.06f,tz0-z0+o),hearthTop,.006f,.12f);
  RoomBox("Hearth slab",new Vector3((tx0+tx1)/2,ty,(tz1+z1+o)/2),new Vector3(tx1-tx0,.06f,z1+o-tz1),hearthTop,.006f,.12f);
  RoomSolid("Hearth top",new Vector3(hb.x,ty,hb.z),new Vector3(hs.x+2*o,.06f,hs.z+2*o));
  // Slack tub: an iron liner, a rolled rim and dark water 2 cm below the top.
  float depth=.16f;
  RoomBox("Slack tub liner",new Vector3(tx0+.004f,top-depth/2,tub.z),new Vector3(.008f,depth,tubSize.z),sootIron,.002f,.1f);RoomBox("Slack tub liner",new Vector3(tx1-.004f,top-depth/2,tub.z),new Vector3(.008f,depth,tubSize.z),sootIron,.002f,.1f);
  RoomBox("Slack tub liner",new Vector3(tub.x,top-depth/2,tz0+.004f),new Vector3(tubSize.x,depth,.008f),sootIron,.002f,.1f);RoomBox("Slack tub liner",new Vector3(tub.x,top-depth/2,tz1-.004f),new Vector3(tubSize.x,depth,.008f),sootIron,.002f,.1f);
  foreach(var e in new[]{(new Vector3(tub.x,top+.004f,tz0),new Vector3(tubSize.x+.02f,.008f,.016f)),(new Vector3(tub.x,top+.004f,tz1),new Vector3(tubSize.x+.02f,.008f,.016f)),(new Vector3(tx0,top+.004f,tub.z),new Vector3(.016f,.008f,tubSize.z+.02f)),(new Vector3(tx1,top+.004f,tub.z),new Vector3(.016f,.008f,tubSize.z+.02f))}){RoomBox("Slack tub rim",e.Item1,e.Item2,sootIron,.003f,.2f);RoomSolid("Tub rim",e.Item1,e.Item2);}
  Box("Slack tub water",new Vector3(tub.x,tub.y-.004f,tub.z),new Vector3(tubSize.x-.016f,.008f,tubSize.z-.016f),water);
  // Cast firepot rim around the coal bed.
  float bx0=bed.x-bedSize.x/2,bx1=bed.x+bedSize.x/2,bz0=bed.z-bedSize.z/2,bz1=bed.z+bedSize.z/2,rimTop=bed.y+.005f,rw=.03f;
  foreach(var e in new[]{(new Vector3(bed.x,(top+rimTop)/2,bz0-rw/2),new Vector3(bedSize.x+2*rw,rimTop-top,rw)),(new Vector3(bed.x,(top+rimTop)/2,bz1+rw/2),new Vector3(bedSize.x+2*rw,rimTop-top,rw)),(new Vector3(bx0-rw/2,(top+rimTop)/2,bed.z),new Vector3(rw,rimTop-top,bedSize.z)),(new Vector3(bx1+rw/2,(top+rimTop)/2,bed.z),new Vector3(rw,rimTop-top,bedSize.z))}){RoomBox("Cast firepot rim",e.Item1,e.Item2,sootIron,.006f,.08f);RoomSolid("Firepot rim",e.Item1,e.Item2);}
  // Coal bed: a mound of glowing fines (vertex r = heat, g = pulse phase) and lumps (+/- 30% size, any rotation).
  var rng=new System.Random(23);var mound=new RoomMesh();int nx=14,nz=11;
  for(int j=0;j<=nz;j++)for(int i=0;i<=nx;i++){float u=i/(float)nx,w=j/(float)nz;float x=Mathf.Lerp(bx0,bx1,u),z=Mathf.Lerp(bz0,bz1,w);float cu=(u-.5f)*2,cw=(w-.5f)*2;float d=Mathf.Clamp01(Mathf.Sqrt(cu*cu+cw*cw));float y=top+.012f+.045f*(1-d*d)+((float)rng.NextDouble()-.5f)*.012f;float heat=Mathf.Clamp01(1.1f-d*1.15f)*(.45f+.55f*(float)rng.NextDouble());mound.Add(new Vector3(x,y,z),Vector3.up,new Color(heat,(float)rng.NextDouble(),0,1));}
  for(int j=0;j<nz;j++)for(int i=0;i<nx;i++){int a=j*(nx+1)+i;mound.Tri(a,a+nx+1,a+1);mound.Tri(a+1,a+nx+1,a+nx+2);}
  mound.Orient(0,_=>Vector3.up);
  var mm=mound.Build("Coal bed");mm.RecalculateNormals();MeshObject("Glowing coal bed",mm,hotCoal);
  var lumpsHot=new RoomMesh();var lumpsDark=new RoomMesh();
  for(int i=0;i<64;i++){float u=(float)rng.NextDouble(),w=(float)rng.NextDouble();float x=Mathf.Lerp(bx0+.02f,bx1-.02f,u),z=Mathf.Lerp(bz0+.02f,bz1-.02f,w);float cu=(u-.5f)*2,cw=(w-.5f)*2;float d=Mathf.Clamp01(Mathf.Sqrt(cu*cu+cw*cw));float size=.036f*(.7f+.6f*(float)rng.NextDouble());
   var lump=RoomCoalLump(i);var heat=Mathf.Clamp01(1.0f-d)*(.25f+.75f*(float)rng.NextDouble());var col=new Color(heat,(float)rng.NextDouble(),0,1);for(int k=0;k<lump.c.Count;k++)lump.c[k]=col;
   var m=Matrix4x4.TRS(new Vector3(x,top+.012f+.045f*(1-d*d)+size*.18f,z),Quaternion.Euler((float)rng.NextDouble()*360,(float)rng.NextDouble()*360,(float)rng.NextDouble()*360),new Vector3(size*(.8f+.4f*(float)rng.NextDouble()),size*(.55f+.3f*(float)rng.NextDouble()),size*(.8f+.4f*(float)rng.NextDouble())));
   (d<.75f&&i%4!=0?lumpsHot:lumpsDark).Append(lump,m);}
  // Unburnt coal banked on the hearth top behind and beside the firepot.
  for(int i=0;i<70;i++){float a=(float)rng.NextDouble()*Mathf.PI*2;float rr=.20f+(float)rng.NextDouble()*.20f;float x=bed.x+Mathf.Cos(a)*rr*1.25f,z=bed.z+.08f+Mathf.Sin(a)*rr;if(x<x0+.04f||x>tx0-.03f||z<z0+.04f||z>z1-.05f)continue;if(x>bx0-.035f&&x<bx1+.035f&&z>bz0-.035f&&z<bz1+.035f)continue;float size=.03f*(.7f+.6f*(float)rng.NextDouble());var m=Matrix4x4.TRS(new Vector3(x,top+size*.25f,z),Quaternion.Euler((float)rng.NextDouble()*360,(float)rng.NextDouble()*360,(float)rng.NextDouble()*360),new Vector3(size,size*.7f,size*1.1f));lumpsDark.Append(RoomCoalLump(100+i),m);}
  RoomBuild("Glowing coals",lumpsHot,hotCoal,Vector3.zero,Quaternion.identity);roomLumpAo.Add(RoomBuild("Banked coal",lumpsDark,coal,Vector3.zero,Quaternion.identity));
  // Flames: two quads crossed at +/- 35 degrees and a camera-facing core, one mesh, one draw call. A fixed quad's
  // TEXCOORD1 carries its horizontal normal (x, z): Forge/Fire fades it as it turns edge-on to the camera.
  var flames=new Mesh{name="Hearth flames"};var fv=new List<Vector3>();var fuv=new List<Vector2>();var fc=new List<Vector2>();var fcol=new List<Color>();var ft=new List<int>();
  void FlameQuad(Vector3 centre,float yaw,float w,float h,float phase,float bright,bool billboard){int s=fv.Count;var right=Quaternion.Euler(0,yaw,0)*Vector3.right;
   var normal=Vector3.Cross(right,Vector3.up);
   for(int k=0;k<4;k++){float u=k%2,v=k/2;var offset=new Vector2((u-.5f)*w,v*h);fv.Add(billboard?centre:centre+right*offset.x+Vector3.up*offset.y);fuv.Add(new Vector2(u,v));fc.Add(billboard?offset:new Vector2(normal.x,normal.z));fcol.Add(new Color(phase,bright,billboard?1:0,1));}
   ft.AddRange(new[]{s,s+2,s+1,s+1,s+2,s+3});}
  var fireBase=new Vector3(bed.x,top+.03f,bed.z);
  FlameQuad(fireBase+new Vector3(.02f,0,-.02f),35,.40f,.36f,0,.85f,false);FlameQuad(fireBase+new Vector3(-.03f,0,.03f),-35,.38f,.32f,.37f,.85f,false);FlameQuad(fireBase+new Vector3(0,0,-.01f),0,.30f,.30f,.71f,.9f,true);
  // The small side flames are camera-facing too: seen from the hearth stance a fixed one is foreshortened to a jagged sliver.
  FlameQuad(fireBase+new Vector3(.12f,0,-.06f),80,.18f,.17f,.19f,.6f,true);FlameQuad(fireBase+new Vector3(-.12f,0,.05f),-60,.16f,.15f,.53f,.55f,true);
  flames.SetVertices(fv);flames.SetUVs(0,fuv);flames.SetUVs(1,fc);flames.SetColors(fcol);flames.SetTriangles(ft,0);flames.bounds=new Bounds(fireBase+Vector3.up*.2f,Vector3.one*.8f);
  fireMat=new Material(Shader.Find("Forge/Fire")){name="Hearth fire"};fireMat.mainTexture=Resources.Load<Texture2D>("Forge/Fire");
  var flame=MeshObject("Animated hearth flames",flames,fireMat);fire=flame.transform;var fr=flame.GetComponent<MeshRenderer>();fr.shadowCastingMode=ShadowCastingMode.Off;fr.receiveShadows=false;
  // Side-blast tuyere from the bellows nozzle to the firepot.
  var nozzle=LV(L.Bellows)+new Vector3(.33f,-.07f,0);
  var tuyere=RoomTube(new[]{nozzle,new Vector3(x0+.05f,nozzle.y-.03f,nozzle.z-.02f),new Vector3(x0+.17f,top+.05f,bed.z+.22f),new Vector3(bx0-.04f,top+.035f,bed.z)},new[]{.032f,.032f,.03f,.028f},12,Vector3.up);
  RoomBuild("Tuyere pipe",tuyere,sootIron,Vector3.zero,Quaternion.identity);
  // Hood and flue: a sheet-iron funnel from a 10 cm skirt at 1.55 m to the brick flue, which runs through the ceiling.
  var hmin=LV(L.HoodMin);var hmax=LV(L.HoodMax);float lip=hmin.y,throat=2.25f;var hc=new Vector3((hmin.x+hmax.x)/2,0,(hmin.z+hmax.z)/2);
  var flueMin=new Vector3(hc.x-.18f,throat,hc.z-.18f);var flueMax=new Vector3(hc.x+.18f,CeilingY+.04f,hc.z+.18f);
  var hood=new RoomMesh();
  Vector3[] Rect(float y,float ax0,float az0,float ax1,float az1)=>new[]{new Vector3(ax0,y,az0),new Vector3(ax1,y,az0),new Vector3(ax1,y,az1),new Vector3(ax0,y,az1)};
  void Band(Vector3[] lo,Vector3[] hi,bool outward){for(int k=0;k<4;k++){var a=lo[k];var b=lo[(k+1)%4];var c2=hi[(k+1)%4];var d=hi[k];var nrm=Vector3.Cross(b-a,d-a).normalized;var mid=(a+b+c2+d)/4;var outDir=new Vector3(mid.x-hc.x,0,mid.z-hc.z);if(Vector3.Dot(nrm,outDir)<0)nrm=-nrm;if(!outward)nrm=-nrm;int s=hood.v.Count;hood.Add(a,nrm);hood.Add(b,nrm);hood.Add(c2,nrm);hood.Add(d,nrm);int t0=hood.t.Count;hood.Tri(s,s+1,s+2);hood.Tri(s,s+2,s+3);var n0=nrm;hood.Orient(t0,_=>n0);}}
  var lipRect=Rect(lip,hmin.x,hmin.z,hmax.x,hmax.z);var skirtTop=Rect(lip+.10f,hmin.x,hmin.z,hmax.x,hmax.z);var throatRect=Rect(throat,flueMin.x,flueMin.z,flueMax.x,flueMax.z);
  Band(lipRect,skirtTop,true);Band(lipRect,skirtTop,false);Band(skirtTop,throatRect,true);Band(skirtTop,throatRect,false);
  RoomBuild("Sheet iron forge hood",hood,hoodIron,Vector3.zero,Quaternion.identity);
  RoomBox("Hood angle-iron lip",new Vector3(hc.x,lip+.012f,hmin.z-.006f),new Vector3(hmax.x-hmin.x+.03f,.025f,.012f),sootIron,.004f,.3f);
  RoomBox("Brick flue",(flueMin+flueMax)/2,flueMax-flueMin,brickWall,.004f,.22f,default,RoomFaceAll&~(4|8));
  RoomSolid("Hood",new Vector3(hc.x,(lip+throat)/2+.05f,hc.z),new Vector3((hmax.x-hmin.x)*.8f,throat-lip,(hmax.z-hmin.z)*.8f),default,false,true);
  RoomSolid("Flue",(flueMin+flueMax)/2,flueMax-flueMin);
  // Fire tools on a hook bar along the hood skirt, and a chain with spare tongs from the joist beside it.
  RoomBox("Hook bar",new Vector3(hmax.x+.03f,lip+.05f,hc.z),new Vector3(.02f,.02f,.9f),sootIron,.005f,.3f);
  for(int i=0;i<3;i++){var t=Group("Fire tool",new Vector3(hmax.x+.035f,lip+.03f,hc.z-.3f+i*.3f));RoomBox("Tool shaft",new Vector3(0,-.36f,0),new Vector3(.018f,.72f,.018f),sootIron,.005f,.3f,default,RoomFaceAll,t);RoomBox("Tool ring",new Vector3(0,.0f,0),new Vector3(.012f,.06f,.04f),sootIron,.004f,.3f,default,RoomFaceAll,t);RoomBox(i==0?"Poker hook":i==1?"Rake":"Shovel",new Vector3(0,-.74f,i==2?.0f:.03f),i==2?new Vector3(.015f,.12f,.11f):new Vector3(.016f,.05f,.07f),sootIron,.004f,.3f,default,RoomFaceAll,t);t.Rotate(0,0,4-i*3);}
  {var hang=new Vector3(JoistX[1],CeilingY-.2f,-.86f);var chain=new RoomMesh();var link=RoomChainLink(.04f,.022f,.0038f);for(int k=0;k<14;k++)chain.Append(link,Matrix4x4.TRS(hang+Vector3.down*(.02f+k*.03f),Quaternion.Euler(0,k%2==0?0:90,90),Vector3.one));roomLumpAo.Add(RoomBuild("Hanging chain",chain,sootIron,Vector3.zero,Quaternion.identity));
   var tg=Group("Spare tongs on the chain",hang+Vector3.down*.47f);RoomBox("Tong rein",new Vector3(-.012f,-.2f,0),new Vector3(.009f,.42f,.009f),sootIron,.003f,.3f,new Vector3(0,0,2),RoomFaceAll,tg);RoomBox("Tong rein",new Vector3(.012f,-.2f,0),new Vector3(.009f,.42f,.009f),sootIron,.003f,.3f,new Vector3(0,0,-2),RoomFaceAll,tg);RoomBox("Tong jaws",new Vector3(0,.02f,0),new Vector3(.03f,.06f,.014f),sootIron,.004f,.3f,default,RoomFaceAll,tg);}
 }

 // ---------- Stations ----------
 void MakeCrate(){
  var p=LV(L.Crate);var s=LV(L.CrateSize);float floorY=p.y-.06f;
  // A low trestle under the crate of blanks.
  RoomBox("Trestle top",new Vector3(p.x,floorY-.035f,p.z),new Vector3(s.x+.08f,.04f,s.z+.06f),wood,.006f,.15f);
  foreach(var x in new[]{-1,1})foreach(var z in new[]{-1,1}){RoomBox("Trestle leg",new Vector3(p.x+x*(s.x/2-.02f),(floorY-.055f)/2,p.z+z*(s.z/2-.02f)),new Vector3(.06f,floorY-.055f,.06f),woodUp,.008f,.12f);RoomSolid("Trestle leg",new Vector3(p.x+x*(s.x/2-.02f),(floorY-.055f)/2,p.z+z*(s.z/2-.02f)),new Vector3(.055f,floorY-.055f,.055f));}
  RoomBox("Trestle rail",new Vector3(p.x,.12f,p.z),new Vector3(s.x-.04f,.05f,.04f),wood,.006f,.2f);
  RoomSolid("Trestle top",new Vector3(p.x,floorY-.035f,p.z),new Vector3(s.x+.08f,.04f,s.z+.06f));
  RoomBox("Blank crate floor",new Vector3(p.x,floorY,p.z),new Vector3(s.x,.03f,s.z),wood,.005f,.15f);
  for(int side=-1;side<=1;side+=2){RoomBox("Crate side",p+new Vector3(side*(s.x/2-.02f),0,0),new Vector3(.03f,s.y,s.z),wood,.005f,.15f);RoomBox("Crate end",p+new Vector3(0,0,side*(s.z/2-.018f)),new Vector3(s.x-.06f,s.y,.03f),wood,.005f,.15f);}
  RoomSolid("Crate",p,new Vector3(s.x,s.y,s.z),default,true,false);
 }
 void MakeRack(){var p=LV(L.Rack);float under=p.y-.07f;
  RoomBox("Knife rack",p,new Vector3(1.1f,.14f,.5f),wood,.008f,.15f);for(int i=0;i<5;i++)RoomBox("Leather rack divider",p+new Vector3(-.5f+i*.25f,.08f,0),new Vector3(.025f,.21f,.48f),leather,.006f,.15f);
  foreach(var x in new[]{-.48f,.48f})RoomBox("Rack riser",new Vector3(p.x+x,(L.BenchTopY+under)/2,p.z),new Vector3(.08f,under-L.BenchTopY,.46f),woodUp,.006f,.15f);
  RoomSolid("Rack",p+new Vector3(0,-.03f,0),new Vector3(1.1f,.2f,.5f));}
 void MakeScale(){var p=LV(L.Scale);float baseY=p.y-.04f-.065f;
  // A turned wooden pedestal carries the brass balance (it stands in front of the bench).
  var post=RoomLathe(new[]{0,.04f,.06f,.12f,baseY-.06f,baseY-.03f,baseY},new[]{.20f,.19f,.075f,.055f,.05f,.16f,.17f},20,true,false);RoomBuild("Turned scale pedestal",post,woodUp,new Vector3(p.x,0,p.z),Quaternion.identity);
  RoomSolidCylinder("Scale pedestal",new Vector3(p.x,0,p.z),.05f,baseY);RoomSolidCylinder("Scale foot",new Vector3(p.x,0,p.z),.18f,.05f);
  // A pan scale in tarnished brass: a turned foot and column, and a 30 cm pan (strike-feel animates the pan's group).
  RoomBuild("Turned brass scale foot",RoomLathe(new[]{baseY,baseY+.012f,baseY+.03f,baseY+.05f,baseY+.07f,p.y+.09f,p.y+.105f},new[]{.15f,.15f,.13f,.06f,.026f,.016f,.03f},28,true,false),tarnish,new Vector3(p.x,0,p.z),Quaternion.identity);
  RoomSolid("Scale",p-Vector3.up*.04f,new Vector3(.30f,.13f,.30f));
  scalePan=Group("Balance pan",p+Vector3.up*.12f);
  var pan=RoomLathe(new[]{-.012f,-.008f,.0f,.006f,.008f},new[]{.02f,.11f,.145f,.152f,.148f},32,true,false);var panGo=RoomBuild("Spun brass scale pan",pan,tarnish,Vector3.zero,Quaternion.identity,scalePan);panGo.transform.localPosition=Vector3.zero;}
 void MakeStall(){var p=LV(L.Shop);float bottom=p.y-.10f;
  RoomBox("Merchant display",p-Vector3.up*.04f,new Vector3(.73f,.12f,.62f),wood,.008f,.15f);for(int i=0;i<6;i++)RoomBox("Trade ingot",p+new Vector3(-.2f+(i%3)*.2f,.045f+(i/3)*.07f,0),new Vector3(.16f,.065f,.28f),i%2==0?brass:iron,.008f,.2f);
  foreach(var z in new[]{-.25f,.25f})RoomBox("Display batten",new Vector3(p.x,(L.BenchTopY+bottom)/2,p.z+z),new Vector3(.70f,bottom-L.BenchTopY,.06f),wood,.004f,.2f);
  RoomSolid("Shop display",p-Vector3.up*.04f,new Vector3(.73f,.12f,.62f));}
 void MakeLantern(){var p=LV(L.Lantern);
  RoomBox("Lantern stand",new Vector3(p.x,(L.BenchTopY+p.y-.0135f)/2,p.z),new Vector3(.2f,p.y-.0135f-L.BenchTopY,.2f),wood,.006f,.15f);
  Box("Lantern base",p,new Vector3(.19f,.027f,.19f),iron);Primitive("Candle",PrimitiveType.Cylinder,p+Vector3.up*.085f,new Vector3(.045f,.075f,.045f),candleWax);for(int x=-1;x<=1;x+=2)for(int z=-1;z<=1;z+=2)Box("Lantern frame",p+new Vector3(x*.08f,.13f,z*.08f),new Vector3(.012f,.25f,.012f),iron);Box("Lantern roof",p+Vector3.up*.26f,new Vector3(.21f,.033f,.21f),iron);
  RoomSolid("Lantern",p+Vector3.up*.1f,new Vector3(.19f,.24f,.19f),default,true,false);
  // The coin dish by the scale (ForgeLayout.CoinDish), turned brass.
  var d=LV(L.CoinDish);float R=L.CoinDishRadius;var dish=RoomLathe(new[]{L.BenchTopY,L.BenchTopY+.004f,d.y-.004f,d.y+.006f},new[]{R*.55f,R*.8f,R,R*.97f},24,true,false);RoomBuild("Brass coin dish",dish,tarnish,new Vector3(d.x,0,d.z),Quaternion.identity);
 }

 // ---------- Lighting rig ----------
 void MakeLighting(){
  RenderSettings.ambientMode=AmbientMode.Trilight;RenderSettings.fog=true;RenderSettings.fogMode=FogMode.ExponentialSquared;
  // Unity Light components light nothing here (every shader is ForwardBase with ForgeLighting.cginc). The two
  // ForgeWorld fields are kept, disabled, for any code that still reads them.
  furnaceLight=new GameObject("Furnace radiance (unused)").AddComponent<Light>();furnaceLight.enabled=false;furnaceLight.transform.position=LV(L.Firebed)+Vector3.up*.24f;
  flash=new GameObject("Hammer contact flash (unused)").AddComponent<Light>();flash.enabled=false;flash.intensity=0;flash.transform.position=LV(L.StrikePoint);
  var ringObj=new GameObject("Evolution heat wave");ring=ringObj.transform;ringObj.AddComponent<MeshFilter>().sharedMesh=RingMesh();ringMat=new Material(Shader.Find("Forge/Glow"));ringMat.SetColor("_Color",new Color(1,.65f,.2f,0));ringObj.AddComponent<MeshRenderer>().sharedMaterial=ringMat;ring.position=new Vector3(0,L.AnvilTopY+.008f,L.AnvilCenter.z);
  MakeHangingLamp();
  QualitySettings.pixelLightCount=0;QualitySettings.shadows=ShadowQuality.Disable;
 }
 /// The key light made visible: an oil lamp under a tin shade, hung on a chain from the joist over the anvil.
 void MakeHangingLamp(){
  var p=LV(L.HangingLamp);float joistBottom=CeilingY-.2f;
  var chain=new RoomMesh();var link=RoomChainLink(.034f,.019f,.0032f);float topY=p.y+.17f;int links=Mathf.CeilToInt((joistBottom-topY)/.026f);for(int k=0;k<links;k++)chain.Append(link,Matrix4x4.TRS(new Vector3(p.x,joistBottom-.015f-k*.026f,p.z),Quaternion.Euler(0,k%2==0?0:90,90),Vector3.one));
  roomLumpAo.Add(RoomBuild("Lamp chain",chain,sootIron,Vector3.zero,Quaternion.identity));RoomBox("Ceiling hook plate",new Vector3(p.x,joistBottom-.006f,p.z),new Vector3(.06f,.012f,.06f),sootIron,.003f,.2f);
  var shadeOuter=RoomLathe(new[]{p.y+.03f,p.y+.05f,p.y+.12f,p.y+.17f},new[]{.185f,.175f,.09f,.05f},24,false,false);RoomBuild("Tin lamp shade",shadeOuter,tin,new Vector3(p.x,0,p.z),Quaternion.identity);
  var shadeInner=RoomLathe(new[]{p.y+.032f,p.y+.05f,p.y+.12f,p.y+.168f},new[]{.18f,.17f,.085f,.046f},24,false,false);for(int i=0;i<shadeInner.n.Count;i++)shadeInner.n[i]=-shadeInner.n[i];for(int i=0;i<shadeInner.t.Count;i+=3){var s=shadeInner.t[i+1];shadeInner.t[i+1]=shadeInner.t[i+2];shadeInner.t[i+2]=s;}
  RoomBuild("Enamel shade lining",shadeInner,enamel,new Vector3(p.x,0,p.z),Quaternion.identity);
  RoomBox("Shade crown",new Vector3(p.x,p.y+.18f,p.z),new Vector3(.05f,.02f,.05f),tin,.006f,.2f);
  var glass=RoomLathe(new[]{p.y-.06f,p.y-.04f,p.y+.01f,p.y+.06f},new[]{.026f,.034f,.03f,.02f},14,true,true);RoomBuild("Lamp chimney",glass,lampGlass,new Vector3(p.x,0,p.z),Quaternion.identity);
  var font=RoomLathe(new[]{p.y-.13f,p.y-.12f,p.y-.09f,p.y-.065f,p.y-.06f},new[]{.03f,.055f,.058f,.04f,.03f},18,true,true);RoomBuild("Brass oil font",font,brass,new Vector3(p.x,0,p.z),Quaternion.identity);
  for(int k=0;k<3;k++){float a=k*Mathf.PI*2/3;var a0=new Vector3(p.x+Mathf.Cos(a)*.05f,p.y-.08f,p.z+Mathf.Sin(a)*.05f);var a1=new Vector3(p.x+Mathf.Cos(a)*.17f,p.y+.04f,p.z+Mathf.Sin(a)*.17f);RoomBuild("Lamp frame wire",RoomTube(new[]{a0,a1},new[]{.0025f,.0025f},5,Vector3.up),sootIron,Vector3.zero,Quaternion.identity);}
 }
 RenderTexture workshopCube;
 void BakeWorkshopReflection(){
  // One room capture at startup, not an expensive capture every frame. The box matches the room interior.
  workshopProbe=new GameObject("Workshop reflection capture").AddComponent<ReflectionProbe>();workshopProbe.transform.position=new Vector3(0,1.35f,-.6f);
  var roomCentre=new Vector3(0,CeilingY/2,(RoomBackZ+RoomFrontZ)/2);workshopProbe.center=roomCentre-workshopProbe.transform.position;workshopProbe.size=new Vector3(2*RoomX,CeilingY,RoomBackZ-RoomFrontZ);
  workshopProbe.resolution=128;workshopProbe.hdr=true;workshopProbe.boxProjection=true;workshopProbe.intensity=.72f;workshopProbe.clearFlags=ReflectionProbeClearFlags.SolidColor;workshopProbe.backgroundColor=C(tuning.room.fogColor);workshopProbe.nearClipPlane=.05f;workshopProbe.farClipPlane=12;
  // Capture the cube with a camera, synchronously, and hand it to a custom probe: the same picture in the Web player
  // and in the editor snapshot loop (a realtime probe only refreshes inside the player's render loop, so the
  // batchmode snapshots showed every metal without reflections). The moving objects are hidden for the capture.
  try{
   workshopCube=new RenderTexture(128,128,16,RenderTextureFormat.DefaultHDR){name="Workshop reflection cube",dimension=TextureDimension.Cube,useMipMap=true,autoGenerateMips=true,filterMode=FilterMode.Trilinear};workshopCube.Create();
   var go=new GameObject("Reflection capture camera");var c=go.AddComponent<Camera>();c.enabled=false;c.transform.position=workshopProbe.transform.position;c.nearClipPlane=.05f;c.farClipPlane=12;c.clearFlags=CameraClearFlags.SolidColor;c.backgroundColor=C(tuning.room.fogColor);c.allowHDR=true;c.allowMSAA=false;
   bool dyn=dynamicRoot!=null&&dynamicRoot.gameObject.activeSelf;if(dyn)dynamicRoot.gameObject.SetActive(false);bool hammerOn=hammer!=null&&hammer.gameObject.activeSelf;if(hammerOn)hammer.gameObject.SetActive(false);
   bool ok=c.RenderToCubemap(workshopCube,63);
   if(dyn)dynamicRoot.gameObject.SetActive(true);if(hammerOn)hammer.gameObject.SetActive(true);Destroy(go);
   if(!ok)throw new System.Exception("RenderToCubemap unsupported");
   workshopProbe.mode=ReflectionProbeMode.Custom;workshopProbe.customBakedTexture=workshopCube;
  }catch(System.Exception e){
   Debug.LogWarning("FORGE_ROOM reflection capture fell back to a realtime probe: "+e.Message);if(workshopCube!=null){workshopCube.Release();workshopCube=null;}
   workshopProbe.mode=ReflectionProbeMode.Realtime;workshopProbe.refreshMode=ReflectionProbeRefreshMode.ViaScripting;workshopProbe.timeSlicingMode=ReflectionProbeTimeSlicingMode.AllFacesAtOnce;workshopProbe.RenderProbe();
  }
 }
 /// Bake contact AO and merge the static room per material (ForgeRoomBake.cs). Skips dynamicRoot, the hammer,
 /// the scale pan, the fire, the ring and the moving bellows.
 void BatchRoom(){RoomBakeAndMerge();}
}
