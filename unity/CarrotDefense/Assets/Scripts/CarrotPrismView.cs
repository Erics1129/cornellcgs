using System.Collections.Generic;
using UnityEngine;
using UnityEngine.Rendering;
using UnityEngine.Rendering.Universal;

namespace CarrotTD {
 public sealed partial class CarrotView {
  bool reducedMotion;
  bool PrismStage=>game!=null&&game.level!=null&&game.level.biome=="prism";
  readonly Dictionary<int,float> prismDashUntil=new Dictionary<int,float>(),prismPressureUntil=new Dictionary<int,float>();
  public void SetReducedMotion(string value){reducedMotion=value=="1"||value=="true";if(effects!=null)effects.ReducedMotion=reducedMotion;}
  void PrismBounds(out Vector3 min,out Vector3 max){min=new Vector3(float.MaxValue,0,float.MaxValue);max=new Vector3(float.MinValue,0,float.MinValue);foreach(var route in game.level.routes)foreach(var p in route){min=Vector3.Min(min,p);max=Vector3.Max(max,p);}foreach(var p in game.level.pads){min=Vector3.Min(min,p);max=Vector3.Max(max,p);}}
  void ApplyPrismLighting(){if(!PrismStage)return;
   sun.transform.rotation=Quaternion.Euler(47,-28,0);sun.color=new Color(1,.94f,.87f);sun.intensity=1.85f;sun.shadowStrength=.82f;sun.cookie=null;
   fill.color=new Color(.51f,.73f,1);fill.intensity=.38f;RenderSettings.ambientSkyColor=new Color(.49f,.67f,.84f);RenderSettings.ambientEquatorColor=new Color(.64f,.76f,.82f);RenderSettings.ambientGroundColor=new Color(.25f,.34f,.37f);RenderSettings.reflectionIntensity=.8f;
   RenderSettings.fogColor=new Color(.68f,.81f,.91f);RenderSettings.fogStartDistance=65;RenderSettings.fogEndDistance=160;
   skyMaterial.SetColor("_Zenith",new Color(.16f,.47f,.79f));skyMaterial.SetColor("_Horizon",new Color(.82f,.91f,.97f));skyMaterial.SetColor("_Ground",new Color(.53f,.71f,.84f));skyMaterial.SetVector("_CarrotSunDir",-sun.transform.forward);skyMaterial.SetColor("_SunColor",new Color(1,.94f,.82f));skyMaterial.SetFloat("_SunSize",.025f);skyMaterial.SetFloat("_SunGlow",.24f);skyMaterial.SetFloat("_Stars",0);skyMaterial.SetFloat("_Aurora",0);skyMaterial.SetFloat("_CloudAmount",.37f);skyMaterial.SetColor("_CloudColor",new Color(.94f,.97f,1));
   Shader.SetGlobalVector("_CarrotHeightFog",new Vector4(CarrotQuality.Rich?.012f:0,-2,1.5f,0));Shader.SetGlobalColor("_CarrotHeightFogColor",RenderSettings.fogColor);sunBase=sun.intensity;fogEndBase=RenderSettings.fogEndDistance;if(bossSpot!=null)bossSpot.intensity=16;
  }
  Material PrismCeramic(string id,Color color,float gloss=.65f,float metal=.16f){var m=Material("prism-"+id,color,-1,gloss,metal);m.SetFloat("_SnowStrength",0);m.SetFloat("_ReflectionStrength",.52f);return m;}
  Material PrismInlay(int band){Color c=CarrotEffects.Spectrum(band/7f);var m=PrismCeramic("inlay-"+band,c,.76f,.35f);m.SetColor("_EmissionColor",c*.24f);return m;}
  // Eight-sided extruded architectural profile: bevelled edges, separate face normals and proper end caps.
  Mesh PrismBeamMesh(float length,float width,float depth,float bevel){
   float x=length*.5f,z=width*.5f,b=Mathf.Min(bevel,Mathf.Min(width,depth)*.4f);var section=new[]{new Vector2(-z+b,0),new Vector2(z-b,0),new Vector2(z,-b),new Vector2(z,-depth+b),new Vector2(z-b,-depth),new Vector2(-z+b,-depth),new Vector2(-z,-depth+b),new Vector2(-z,-b)};
   var v=new List<Vector3>();var uv=new List<Vector2>();var c=new List<Color>();var t=new List<int>();
   for(int j=0;j<8;j++){int k=v.Count,n=(j+1)%8;v.Add(new Vector3(-x,section[j].y,section[j].x));v.Add(new Vector3(x,section[j].y,section[j].x));v.Add(new Vector3(x,section[n].y,section[n].x));v.Add(new Vector3(-x,section[n].y,section[n].x));uv.AddRange(new[]{Vector2.zero,new Vector2(length,0),new Vector2(length,.3f),new Vector2(0,.3f)});for(int i=0;i<4;i++)c.Add(Color.white);t.AddRange(new[]{k,k+2,k+1,k,k+3,k+2});}
   for(int end=0;end<2;end++){int k=v.Count;float xx=end==0?-x:x;v.Add(new Vector3(xx,-depth*.5f,0));uv.Add(Vector2.one*.5f);c.Add(Color.white);for(int j=0;j<8;j++){v.Add(new Vector3(xx,section[j].y,section[j].x));uv.Add(new Vector2(section[j].x/width+.5f,section[j].y/depth+1));c.Add(Color.white);}for(int j=0;j<8;j++){int a=k+1+j,bb=k+1+(j+1)%8;t.AddRange(end==0?new[]{k,bb,a}:new[]{k,a,bb});}}
   var mesh=new Mesh{name="Bevelled runway architecture"};mesh.SetVertices(v);mesh.SetUVs(0,uv);mesh.SetColors(c);mesh.SetTriangles(t,0);mesh.RecalculateNormals();mesh.RecalculateBounds();return mesh;
  }
  GameObject PrismBeam(string name,Vector3 position,float length,float width,float depth,Material mat,float bevel=.06f){var go=MeshObject(name,PrismBeamMesh(length,width,depth,bevel),mat,decoration);go.transform.position=position;return go;}
  void BuildPrismTerrain(){PrismBounds(out var min,out var max);float middle=(min.x+max.x)*.5f,length=max.x-min.x+3.4f;float depth=Mathf.Max(10.8f,max.z-min.z+2.8f);
   var pearl=PrismCeramic("pearl",new Color(.70f,.80f,.83f),.61f,.20f);var edge=PrismCeramic("titanium",new Color(.15f,.24f,.32f),.72f,.7f);var ivory=PrismCeramic("ivory",new Color(.86f,.87f,.81f),.57f,.1f);
   var baseObject=PrismBeam("Floating sky garden chassis",new Vector3(middle,-.025f,0),length,depth,.78f,pearl,.18f);baseObject.AddComponent<MeshCollider>().sharedMesh=baseObject.GetComponent<MeshFilter>().sharedMesh;
   PrismBeam("Undercut titanium keel",new Vector3(middle,-.69f,0),length-.4f,depth-.4f,.38f,edge,.12f);
   for(int side=-1;side<=1;side+=2){PrismBeam("White cantilever edge",new Vector3(middle,.025f,side*(depth*.5f-.16f)),length-.3f,.27f,.23f,ivory);for(int i=0;i<7;i++)PrismBeam("Spectral edge inlay",new Vector3(middle,.032f,side*(depth*.5f-.34f-i*.025f)),length-.7f,.016f,.015f,PrismInlay(i),.003f);}
   for(float x=min.x-.8f;x<max.x+1;x+=4){PrismBeam("Inset terrace expansion joint",new Vector3(x,-.014f,0),.025f,depth-.5f,.012f,edge,.003f);for(int side=-1;side<=1;side+=2)PrismBeam("Tapered underside rib",new Vector3(x,-.60f,side*3.5f),.25f,3.3f,.62f,ivory,.09f);}
  }
  void BuildPrismRoads(){PrismBounds(out var min,out var max);float center=(min.x+max.x)*.5f,length=max.x-min.x+.8f;
   var runway=PrismCeramic("runway",new Color(.20f,.35f,.43f),.63f,.28f);var seam=PrismCeramic("seam",new Color(.63f,.83f,.88f),.72f,.42f);
   PrismBeam("Continuous polished approach",new Vector3(center,.061f,0),length,1.34f,.085f,runway,.04f);
   for(int side=-1;side<=1;side+=2){PrismBeam("Runway silver edge",new Vector3(center,.074f,side*.67f),length,.055f,.035f,seam,.009f);for(int i=0;i<7;i++)PrismBeam("Seven colour runway inlay",new Vector3(center,.076f,side*(.57f-i*.032f)),length,.021f,.012f,PrismInlay(i),.002f);}
   for(float x=min.x+.2f;x<max.x;x+=1.2f)PrismBeam("Runway luminous seam",new Vector3(x,.078f,0),.018f,.58f,.01f,seam,.002f);
  }
  void BuildPrismPad(int id,Vector3 p){var root=new GameObject("Prism planting socket "+id);root.transform.SetParent(world,false);root.transform.position=new Vector3(p.x,-.025f,p.z);var click=root.AddComponent<CarrotClickable>();click.type="pad";click.id=id;var collider=root.AddComponent<SphereCollider>();collider.center=new Vector3(0,.12f,0);collider.radius=.50f;pads[id]=root;
   var plinth=PrismCeramic("socket",new Color(.43f,.59f,.63f),.6f,.26f);var interior=PrismCeramic("substrate",new Color(.12f,.25f,.23f),.25f,.04f);PrismBeam("Inset planting foundation",p+Vector3.up*.014f,1.17f,1.17f,.09f,plinth,.055f);PrismBeam("Dark living substrate",p+Vector3.up*.02f,.93f,.93f,.025f,interior,.008f);
   for(int side=-1;side<=1;side+=2)PrismBeam("Socket readiness light",p+new Vector3(0,.034f,side*.48f),.53f,.025f,.012f,PrismInlay(id%7),.003f);
  }
  void BuildPrismDecoration(){PrismBounds(out var min,out var max);var white=PrismCeramic("arch",new Color(.78f,.87f,.89f),.73f,.24f);var soil=Material("prism-bed-soil",new Color(.23f,.32f,.16f),0,.25f,0,1.5f);var gold=PrismCeramic("gold",new Color(.77f,.55f,.19f),.73f,.75f);
   int index=0;for(float x=min.x+1.8f;x<max.x;x+=3.5f){for(int side=-1;side<=1;side+=2){Vector3 p=new Vector3(x,0,side*4.9f);PrismBeam("Floating botanical bed",p,2.25f,.87f,.14f,white);PrismBeam("Botanical soil",p+Vector3.up*.008f,2.03f,.65f,.035f,soil,.01f);PlaceScanned(index%3==0?"Shrub":"Fern",p+new Vector3(-.35f,0,.03f),index%3==0?.76f:.49f,index*33);if(CarrotQuality.Rich)PlaceScanned("Fern",p+new Vector3(.58f,0,-.08f),.34f,index*51);Flower(p+new Vector3(.74f,0,side*.14f),.22f,index%2==0?new Color(1,.48f,.65f):new Color(1,.83f,.39f));}index++;}
   // Open sculptures frame the far edge. No arch crosses the enemy lane or covers a build socket.
   for(float x=min.x+3;x<max.x;x+=8){var arch=MeshObject("Open white orbital sculpture",PortalTorus(1.55f,.085f,64,7),white,decoration);arch.transform.position=new Vector3(x,1.17f,5.9f);arch.transform.rotation=Quaternion.Euler(0,18,-24);arch.transform.localScale=new Vector3(1,1.35f,1);var ring=MeshObject("Suspended champagne band",PortalTorus(1.28f,.018f,64,5),gold,decoration);ring.transform.position=arch.transform.position;ring.transform.rotation=Quaternion.Euler(0,-12,24);ring.transform.localScale=new Vector3(1,1.35f,1);}
   for(int i=0;i<4;i++){float x=Mathf.Lerp(min.x,max.x,(i+.5f)/4);var far=PrismBeam("Distant sky garden",new Vector3(x,-4-i*.4f,12+i%2*4),5+i*.6f,2.4f,.45f,white,.12f);far.transform.rotation=Quaternion.Euler(0,i*11-15,0);}
  }
  void BuildPrismNest(){var gold=PrismCeramic("refuge",new Color(.83f,.64f,.26f),.72f,.65f);PrismBeam("Golden carrot refuge",carrotPosition+new Vector3(.15f,.018f,0),2.05f,2.1f,.13f,gold,.06f);for(int s=-1;s<=1;s+=2){var arc=MeshObject("Refuge light arc",PortalTorus(.82f,.025f,48,5),PrismInlay(s<0?1:4),decoration);arc.transform.position=carrotPosition+new Vector3(.1f,.035f,s*.10f);arc.transform.rotation=Quaternion.Euler(90,s*18,0);}Flower(carrotPosition+new Vector3(.7f,0,.68f),.3f,Color.white);Flower(carrotPosition+new Vector3(.6f,0,-.7f),.3f,new Color(1,.68f,.32f));}
  void FitPrismCamera(){PrismBounds(out var min,out var max);cameraAngle=portraitCamera?Quaternion.Euler(53,90,0):Quaternion.Euler(39,-2,0);cameraTarget=(min+max)*.5f+Vector3.up*.5f;fitDistance=0;float tangent=Mathf.Tan(38*Mathf.Deg2Rad*.5f),aspect=Mathf.Max(.3f,GameCamera.aspect);foreach(var route in game.level.routes)foreach(var p in route)FitEnvelope(p,.78f,2.75f,tangent,aspect,.96f,portraitCamera?.89f:.91f);foreach(var p in game.level.pads)FitEnvelope(p,.62f,1.85f,tangent,aspect,.96f,portraitCamera?.89f:.91f);fitDistance+=.3f;GameCamera.farClipPlane=Mathf.Max(GameCamera.farClipPlane,220);}
  void ClampPrismPan(){PrismBounds(out var min,out var max);float fraction=Mathf.Max(0,1-1/targetZoom),extra=portraitCamera?.8f:0;targetPan.x=Mathf.Clamp(targetPan.x,-(max.x-min.x)*.5f*fraction-extra,(max.x-min.x)*.5f*fraction+extra);targetPan.z=Mathf.Clamp(targetPan.z,-(max.z-min.z)*.5f*fraction-extra,(max.z-min.z)*.5f*fraction+extra);targetPan.y=0;if(targetZoom<=1.015f&&!portraitCamera)targetPan=Vector3.zero;}
  void PrismEvent(CarrotEvent e){if(e.type=="ability"&&e.kind=="prismOverdrive")prismPressureUntil[e.id]=clock+e.value;if(e.type=="abilityTarget"&&e.kind=="prismDash"){prismDashUntil[e.id]=clock+e.duration;if(!reducedMotion&&CarrotQuality.Rich&&enemies.TryGetValue(e.id,out var a))effects.Echo(a.root,e.position,e.to,e.duration+.25f,new Color(.9f,.42f,1,.20f));}}
  void AnimatePrismEnemy(Actor a,EnemyState e,float dt,float dead){if(e.kind!="asuna")return;a.model.localRotation=a.modelRotation;a.model.localScale=a.modelScale*ActorScale*(e.clone?.76f:1);if(e.alive&&dt>0&&prismPressureUntil.TryGetValue(e.id,out var pressureUntil)&&clock<pressureUntil){a.moteClock+=dt;if(a.moteClock>(CarrotQuality.Rich?.4f:.7f)){a.moteClock=0;effects.PrismPressure(a.root.transform.position,e.phase);}}if(a.asunaMotion==null)return;bool dash=prismDashUntil.TryGetValue(e.id,out var until)&&clock<until;string state=!e.alive?"Death":dash?"Dash":e.castRemaining>0||e.biteRemaining>0?"Attack":e.speed>.01f?"Walk":"Idle";a.asunaMotion.SetMotion(state,dt>0?game.speed*viewScale:0);}
 }
}
