using UnityEngine;
using UnityEngine.Rendering;

public partial class ForgeWorld {
 // All workshop dimensions are metres. The camera stays at the smith's eyes.
 Material mortar,polished;ReflectionProbe workshopProbe;
 void MakeRoom(){
  mortar=Mat("Recessed lime mortar","282521",0,.05f);
  Box("Workshop foundation",new Vector3(0,-.1f,-.4f),new Vector3(7.6f,.2f,8),mortar);
  var flagstone=new Material(stone);flagstone.color=C("655f53");flagstone.SetFloat("_Scale",2);
  for(int z=0;z<12;z++)for(int x=0;x<11;x++){var tile=Box("Uneven worn floor slab",new Vector3(-3.5f+x*.7f+(z%2)*.12f,-.015f,-4+z*.56f),new Vector3(.682f,.045f,.545f),flagstone);tile.transform.Rotate(0,(x*7+z*13)%3-1,0);}
  Box("Back wall mortar",new Vector3(0,1.85f,2.25f),new Vector3(7.5f,3.8f,.23f),mortar);
  Box("Left wall mortar",new Vector3(-3.65f,1.85f,-.7f),new Vector3(.23f,3.8f,6),mortar);
  Box("Right wall mortar",new Vector3(3.65f,1.85f,-.7f),new Vector3(.23f,3.8f,6),mortar);
  var brickMats=new Material[5];for(int i=0;i<5;i++){brickMats[i]=new Material(stone);brickMats[i].color=Color.Lerp(C("65513e"),C("a69071"),i/4f);}
  for(int row=0;row<13;row++)for(int col=0;col<13;col++){
   float x=-3.65f+col*.59f+(row%2)*.295f,y=.14f+row*.282f;
   if(x<3.6f){var brick=Box("Hand fired brick",new Vector3(x,y,2.095f),new Vector3(.573f,.264f,.17f),brickMats[(col*7+row*11)%5]);brick.transform.Rotate(0,0,((row*3+col)%5-2)*.17f);}
   if(col<10)for(int side=-1;side<=1;side+=2)Box("Side brick",new Vector3(side*3.51f,y,-3.4f+col*.59f+(row%2)*.295f),new Vector3(.17f,.264f,.573f),brickMats[(col*3+row)%5]);
  }
  Box("Smoke darkened ceiling",new Vector3(0,3.67f,-.6f),new Vector3(7.5f,.14f,6),wood);
  for(int i=-1;i<=1;i++){Box("Heavy crossbeam",new Vector3(0,3.48f,i*2.5f),new Vector3(7.3f,.27f,.24f),wood);Box("Vertical timber",new Vector3(i*3.3f,1.75f,1.94f),new Vector3(.2f,3.5f,.22f),wood);}
  // A cold barred window is the counterpoint to the amber hearth, kept off the central working face.
  var night=Mat("Night behind iron bars","131c23",0,.1f);night.SetColor("_EmissionColor",C("192a36")*.5f);
  Box("Window recess",new Vector3(2.35f,2.36f,1.97f),new Vector3(1.5f,1.4f,.1f),coal);
  Box("Night window",new Vector3(2.35f,2.36f,1.90f),new Vector3(1.33f,1.23f,.025f),night);
  for(int i=0;i<5;i++)Box("Wrought window bar",new Vector3(1.8f+i*.275f,2.36f,1.85f),new Vector3(.022f,1.25f,.025f),iron);
  Box("Window transom",new Vector3(2.35f,2.4f,1.84f),new Vector3(1.4f,.035f,.03f),iron);
  Box("Stone sill",new Vector3(2.35f,1.66f,1.83f),new Vector3(1.58f,.1f,.38f),stone);
  Box("Tool rail",new Vector3(.05f,1.78f,1.86f),new Vector3(2.15f,.07f,.09f),wood);
  for(int i=0;i<6;i++){var tool=Group("Hand forged tools",new Vector3(-.85f+i*.34f,1.49f,1.76f));Box("Ash handle",Vector3.zero,new Vector3(.025f,.45f,.028f),wood,tool);Box("Tool head",new Vector3(0,.16f,0),new Vector3(.17f,.07f,.065f),iron,tool);tool.Rotate(0,0,(i%3-1)*8);}
 }
 void MakeBench(){
  for(int i=0;i<4;i++)Box("Thick scarred oak plank",new Vector3(0,.85f,.12f+i*.46f),new Vector3(6.4f,.13f,.447f),wood);
  for(int side=-1;side<=1;side+=2)for(int z=0;z<2;z++){Box("Joinery leg",new Vector3(side*2.88f,.4f,.03f+z*1.46f),new Vector3(.17f,.8f,.17f),wood);Box("Iron foot strap",new Vector3(side*2.88f,.2f,.03f+z*1.46f),new Vector3(.18f,.045f,.18f),iron);}
  Box("Workbench front apron",new Vector3(0,.71f,-.135f),new Vector3(6.35f,.23f,.08f),wood);
  for(int i=-6;i<=6;i++)Primitive("Hammered nail",PrimitiveType.Sphere,new Vector3(i*.47f,.74f,-.18f),new Vector3(.012f,.012f,.008f),iron);
 }
 void MakeAnvil(){
  var stump=Primitive("End grain oak anvil stump",PrimitiveType.Cylinder,new Vector3(0,.35f,-.4f),new Vector3(.57f,.35f,.5f),wood);stump.transform.Rotate(0,16,0);
  for(int y=0;y<2;y++){var band=MeshObject("Iron stump hoop",RingMesh(),iron);band.transform.position=new Vector3(0,.12f+y*.44f,-.4f);band.transform.localScale=new Vector3(.3f,1,.263f);}
  var silhouette=new[]{new Vector2(-.37f,0),new Vector2(.31f,0),new Vector2(.31f,.055f),new Vector2(.17f,.08f),new Vector2(.135f,.18f),new Vector2(.27f,.24f),new Vector2(.43f,.267f),new Vector2(.69f,.276f),new Vector2(.48f,.31f),new Vector2(-.4f,.31f),new Vector2(-.4f,.237f),new Vector2(-.19f,.208f),new Vector2(-.13f,.15f),new Vector2(-.16f,.074f),new Vector2(-.37f,.05f)};
  var a=MeshObject("Solid forged anvil with tapered horn",Extrude(silhouette,.29f),iron);a.transform.position=new Vector3(0,.7f,-.4f);
  polished=Mat("Burnished steel working face","a4a5a2",.96f,.72f);polished.mainTexture=Resources.Load<Texture2D>("Forge/SteelV2");polished.SetFloat("_Scale",2.1f);polished.SetFloat("_BumpStrength",.0008f);
  Box("Worn beveled working face",new Vector3(-.01f,1.015f,-.4f),new Vector3(.78f,.019f,.302f),polished);
  Box("Hardy socket",new Vector3(-.31f,1.026f,-.33f),new Vector3(.035f,.001f,.035f),coal);
  for(int i=0;i<12;i++){var scar=Box("Hammer scar",new Vector3(-.25f+(i%4)*.14f,1.026f,-.48f+(i/4)*.068f),new Vector3(.035f,.0006f,.0008f),iron);scar.transform.Rotate(0,i*31,0);}
  for(int i=0;i<24;i++){float a0=i*Mathf.PI*2/24;var link=MeshObject("Anvil securing chain",RingMesh(),iron);link.transform.position=new Vector3(Mathf.Sin(a0)*.286f,.58f,-.4f+Mathf.Cos(a0)*.25f);link.transform.rotation=Quaternion.Euler(90,a0*Mathf.Rad2Deg,i%2*65);link.transform.localScale=new Vector3(.025f,.025f,.038f);}
 }
 void MakeFurnace(){
  var p=spots["furnace"];
  Box("Hearth base",new Vector3(p.x,.62f,p.z+.2f),new Vector3(1.23f,1.22f,1.22f),stone);
  Box("Recessed black fire chamber",new Vector3(p.x,1.27f,p.z+.38f),new Vector3(1.15f,.56f,.14f),coal);
  for(int side=-1;side<=1;side+=2)Box("Hearth jamb",new Vector3(p.x+side*.52f,1.31f,p.z+.14f),new Vector3(.22f,.57f,.95f),stone);
  for(int i=0;i<11;i++){float a=i*Mathf.PI/10;var brick=Box("Hearth arch voussoir",new Vector3(p.x+Mathf.Cos(a)*.53f,1.48f+Mathf.Sin(a)*.36f,p.z-.29f),new Vector3(.17f,.21f,.22f),stone);brick.transform.rotation=Quaternion.Euler(0,0,a*Mathf.Rad2Deg-90);}
  Box("Soot stained flue",new Vector3(p.x,2.5f,p.z+.25f),new Vector3(.93f,1.68f,.65f),stone);
  var embers=Mat("Incandescent charcoal","c3390d",.15f,.25f);embers.SetColor("_EmissionColor",C("ff5812")*2.8f);
  for(int i=0;i<36;i++)Primitive("Live coal",PrimitiveType.Sphere,new Vector3(p.x-.41f+(i%9)*.099f,1.0f+(i%3)*.012f,p.z-.24f+(i/9)*.12f),new Vector3(.1f,.067f,.09f),i%4==0?coal:embers);
  var flame=Primitive("Animated generated fire",PrimitiveType.Quad,new Vector3(p.x,1.29f,p.z-.31f),new Vector3(.91f,.64f,1),coal);fire=flame.transform;fireMat=new Material(Shader.Find("Forge/Fire"));fireMat.mainTexture=Resources.Load<Texture2D>("Forge/Fire");flame.GetComponent<Renderer>().sharedMaterial=fireMat;
  for(int i=0;i<7;i++)Box("Iron grate",new Vector3(p.x-.43f+i*.145f,1.04f,p.z-.36f),new Vector3(.018f,.17f,.025f),iron);
 }
 void MakeCrate(){var p=spots["crate"];Box("Blank crate floor",p-Vector3.up*.06f,new Vector3(.87f,.08f,.6f),wood);for(int side=-1;side<=1;side+=2){Box("Crate side",p+new Vector3(side*.43f,0,0),new Vector3(.045f,.18f,.6f),wood);Box("Crate end",p+new Vector3(0,0,side*.3f),new Vector3(.87f,.18f,.04f),wood);}}
 void MakeRack(){var p=spots["rack"];Box("Knife rack",p,new Vector3(1.1f,.14f,.5f),wood);for(int i=0;i<5;i++)Box("Leather rack divider",p+new Vector3(-.5f+i*.25f,.08f,0),new Vector3(.025f,.21f,.48f),leather);}
 void MakeScale(){var p=spots["sell"];Primitive("Scale base",PrimitiveType.Cylinder,p-Vector3.up*.04f,new Vector3(.38f,.065f,.32f),brass);Box("Scale stem",p+new Vector3(0,.035f,.12f),new Vector3(.025f,.24f,.025f),brass);scalePan=Group("Balance pan",p+Vector3.up*.12f);Primitive("Scale dish",PrimitiveType.Cylinder,Vector3.zero,new Vector3(.65f,.014f,.42f),brass,scalePan);}
 void MakeStall(){var p=spots["shop"];Box("Merchant display",p-Vector3.up*.04f,new Vector3(.73f,.12f,.62f),wood);for(int i=0;i<6;i++)Box("Trade ingot",p+new Vector3(-.2f+(i%3)*.2f,.045f+(i/3)*.07f,0),new Vector3(.16f,.065f,.28f),i%2==0?brass:iron);}
 void MakeLantern(){var p=spots["lantern"];Box("Lantern base",p,new Vector3(.19f,.027f,.19f),iron);var glow=Mat("Lantern candle","e9b767");glow.SetColor("_EmissionColor",C("ffb952")*2.4f);Primitive("Candle",PrimitiveType.Cylinder,p+Vector3.up*.085f,new Vector3(.045f,.075f,.045f),glow);for(int x=-1;x<=1;x+=2)for(int z=-1;z<=1;z+=2)Box("Lantern frame",p+new Vector3(x*.08f,.13f,z*.08f),new Vector3(.012f,.25f,.012f),iron);Box("Lantern roof",p+Vector3.up*.26f,new Vector3(.21f,.033f,.21f),iron);var light=new GameObject("Candle bounce").AddComponent<Light>();light.type=LightType.Point;light.color=C("ffd098");light.intensity=1.15f;light.range=3;light.transform.position=p+Vector3.up*.22f;}
 void MakeHammer(){hammer=Group("Held smithing hammer",Vector3.zero);Box("Shaped hickory handle",new Vector3(0,.12f,0),new Vector3(.035f,.35f,.043f),wood,hammer);Box("Forged cross peen head",new Vector3(0,.29f,0),new Vector3(.20f,.085f,.084f),iron,hammer);Box("Polished striking face",new Vector3(-.103f,.29f,0),new Vector3(.012f,.082f,.079f),polished,hammer);Box("Handle wedge",new Vector3(0,.335f,0),new Vector3(.024f,.003f,.033f),wood,hammer);}
 void MakeLighting(){
  RenderSettings.ambientMode=AmbientMode.Trilight;RenderSettings.ambientSkyColor=C("8b97a1")*.18f;RenderSettings.ambientEquatorColor=C("6b5640")*.18f;RenderSettings.ambientGroundColor=C("211c18")*.5f;
  RenderSettings.fog=true;RenderSettings.fogMode=FogMode.ExponentialSquared;RenderSettings.fogDensity=.042f;RenderSettings.fogColor=C("151210");
  var key=new GameObject("Warm work light").AddComponent<Light>();key.type=LightType.Spot;key.color=C("ffe0af");key.intensity=3.0f;key.range=7;key.spotAngle=95;key.transform.position=new Vector3(-.65f,2.8f,-1.15f);key.transform.LookAt(new Vector3(0,1,-.3f));key.shadows=LightShadows.Soft;key.shadowStrength=.85f;key.shadowBias=.12f;key.shadowNormalBias=.22f;key.renderMode=LightRenderMode.ForcePixel;
  var rim=new GameObject("Cool window spill").AddComponent<Light>();rim.type=LightType.Spot;rim.color=C("a4b8d2");rim.intensity=2.2f;rim.range=6;rim.spotAngle=90;rim.transform.position=new Vector3(2.3f,2.35f,1.65f);rim.transform.LookAt(new Vector3(.2f,.9f,-.5f));rim.renderMode=LightRenderMode.ForcePixel;
  furnaceLight=new GameObject("Furnace radiance").AddComponent<Light>();furnaceLight.type=LightType.Point;furnaceLight.color=C("ff9a48");furnaceLight.intensity=2.6f;furnaceLight.range=4.3f;furnaceLight.transform.position=spots["furnace"]+new Vector3(0,.2f,-.4f);furnaceLight.renderMode=LightRenderMode.ForcePixel;
  flash=new GameObject("Hammer contact flash").AddComponent<Light>();flash.type=LightType.Point;flash.color=C("ffd4a1");flash.range=2;flash.intensity=0;flash.renderMode=LightRenderMode.ForceVertex;flash.shadows=LightShadows.None;flash.transform.position=new Vector3(.12f,1.12f,-.4f);
  var ringObj=new GameObject("Evolution heat wave");ring=ringObj.transform;ringObj.AddComponent<MeshFilter>().sharedMesh=RingMesh();ringMat=new Material(Shader.Find("Forge/Glow"));ringMat.SetColor("_Color",new Color(1,.65f,.2f,0));ringObj.AddComponent<MeshRenderer>().sharedMaterial=ringMat;ring.position=new Vector3(0,1.04f,-.4f);
  Shader.SetGlobalVector("_ForgeKeyPosition",key.transform.position);Shader.SetGlobalColor("_ForgeKeyColor",key.color.linear*key.intensity*.7f);
  Shader.SetGlobalVector("_ForgeRimPosition",rim.transform.position);Shader.SetGlobalColor("_ForgeRimColor",rim.color.linear*rim.intensity*.7f);
  Shader.SetGlobalVector("_ForgeFirePosition",furnaceLight.transform.position);Shader.SetGlobalColor("_ForgeFireColor",furnaceLight.color.linear*furnaceLight.intensity*.55f);
  QualitySettings.pixelLightCount=4;QualitySettings.shadowDistance=12;
 }
 void BakeWorkshopReflection(){
  // One room capture at startup, not an expensive capture every frame.
  workshopProbe=new GameObject("Workshop reflection capture").AddComponent<ReflectionProbe>();workshopProbe.transform.position=new Vector3(0,1.35f,-.3f);workshopProbe.size=new Vector3(7,4,7);workshopProbe.mode=ReflectionProbeMode.Realtime;workshopProbe.refreshMode=ReflectionProbeRefreshMode.ViaScripting;workshopProbe.timeSlicingMode=ReflectionProbeTimeSlicingMode.AllFacesAtOnce;workshopProbe.resolution=128;workshopProbe.hdr=true;workshopProbe.boxProjection=true;workshopProbe.intensity=.72f;workshopProbe.clearFlags=ReflectionProbeClearFlags.SolidColor;workshopProbe.backgroundColor=C("241d18");workshopProbe.nearClipPlane=.05f;workshopProbe.farClipPlane=12;workshopProbe.RenderProbe();
 }
 void UpdateFirstPersonHammer(float raw){
  if(smith==null)return;
  var yaw=Quaternion.Euler(0,orbitYaw,0);var rest=smith.position+yaw*new Vector3(Screen.width<700?.12f:.28f,1.11f,Screen.width<700?.57f:.43f);var restRotation=yaw*Quaternion.Euler(-9,0,-24);
  if(swinging){float before=swingTime;swingTime+=raw*swingSpeed;float t=swingTime;var impact=new Vector3(.42f,1.085f,-.4f);var raised=smith.position+new Vector3(.34f,1.48f,.36f);float angle;
   if(t<.24f){float q=Mathf.SmoothStep(0,1,t/.24f);hammer.position=Vector3.Lerp(rest,raised,q);angle=Mathf.Lerp(-24,-65,q);}
   else if(t<.34f){float q=(t-.24f)/.1f;hammer.position=Vector3.Lerp(raised,impact,q*q);angle=Mathf.Lerp(-65,74,q*q);}
   else {float q=Mathf.Clamp01((t-.34f)/.4f);hammer.position=Vector3.Lerp(impact,rest,Mathf.SmoothStep(0,1,q))+Vector3.up*Mathf.Sin(q*Mathf.PI)*.12f;angle=Mathf.Lerp(74,-24,Mathf.Sqrt(q));}
   hammer.rotation=Quaternion.Euler(0,0,angle);if(before<.34f&&t>=.34f)Send("impact");if(t>.76f){swinging=false;Send("settled");}
  }else{hammer.position=Vector3.Lerp(hammer.position,rest,1-Mathf.Exp(-raw*16));hammer.rotation=Quaternion.Slerp(hammer.rotation,restRotation,1-Mathf.Exp(-raw*16));}
 }
}
