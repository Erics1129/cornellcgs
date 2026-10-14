using System;
using System.Collections.Generic;
using UnityEngine;
using UnityEngine.Rendering;
using Unity.Mathematics;
using UnityEngine.Splines;

namespace CarrotTD {
 /// <summary>Cell indices of VfxSheet.png (8x8 cells of 128 px, row 0 at the top). Colour always comes from tint.</summary>
 public static class FxSheet {
  public const int Tiles=8;
  public const int GlowHard=0,GlowSoft=1,Star4=2,Star6=3,RingThin=4,RingThick=5,Shockwave=6,Flake=7;
  public const int Smoke=8,SmokeFrames=16,Spark=24,Ember=32,EmberFrames=8;
  public const int Bark=40,Pebble=41,Leaf=42,Petal=43,Husk=44,Shard=45,Acorn=46,Page=47;
  public const int Scorch=48,Crater=49,Ice=50,Pollen=51,Crack=52,Mud=53,FrostWeb=54,Void=55;
  public const int Bolt=56,Clock=57,StarGlyph=58,Chevron=59,Warning=60,Root=61,Note=62,Coin=63;
  public static Rect Cell(int i){int x=i%Tiles,y=i/Tiles;return new Rect(x/(float)Tiles,1-(y+1)/(float)Tiles,1f/Tiles,1f/Tiles);}
 }

 /// <summary>One pooled, manually simulated particle system. Modules are configured once; emission goes through Emit.</summary>
 public sealed class FxSystem {
  public readonly ParticleSystem ps;ParticleSystem.TextureSheetAnimationModule sheet;int frame=-1;ParticleSystem.EmitParams p;
  public FxSystem(Transform parent,string name,Material material,int maxParticles,bool stretch=false,float gravity=0,Transform groundPlane=null,bool grow=false,bool flipbook=false,int firstFrame=0,int frames=1,bool noise=false,float noiseStrength=0){
   var go=new GameObject(name);go.transform.SetParent(parent,false);ps=go.AddComponent<ParticleSystem>();ps.Stop(true,ParticleSystemStopBehavior.StopEmittingAndClear);
   var main=ps.main;main.loop=true;main.playOnAwake=false;main.duration=10;main.maxParticles=maxParticles;main.simulationSpace=ParticleSystemSimulationSpace.World;main.gravityModifier=gravity;main.startSize=.1f;main.startLifetime=1;main.startSpeed=0;main.scalingMode=ParticleSystemScalingMode.Hierarchy;
   var emission=ps.emission;emission.enabled=false;var shape=ps.shape;shape.enabled=false;
   sheet=ps.textureSheetAnimation;sheet.enabled=true;sheet.mode=ParticleSystemAnimationMode.Grid;sheet.numTilesX=FxSheet.Tiles;sheet.numTilesY=FxSheet.Tiles;sheet.animation=ParticleSystemAnimationType.WholeSheet;sheet.cycleCount=1;
   sheet.frameOverTime=flipbook?new ParticleSystem.MinMaxCurve(1,AnimationCurve.Linear(0,0,1,(frames-.01f)/(FxSheet.Tiles*FxSheet.Tiles))):new ParticleSystem.MinMaxCurve(0);
   sheet.startFrame=firstFrame/(float)(FxSheet.Tiles*FxSheet.Tiles);frame=firstFrame;
   var color=ps.colorOverLifetime;color.enabled=true;var g=new Gradient();g.SetKeys(new[]{new GradientColorKey(Color.white,0),new GradientColorKey(Color.white,1)},new[]{new GradientAlphaKey(0,0),new GradientAlphaKey(1,.1f),new GradientAlphaKey(.85f,.6f),new GradientAlphaKey(0,1)});color.color=g;
   var size=ps.sizeOverLifetime;size.enabled=true;size.size=grow?new ParticleSystem.MinMaxCurve(1,new AnimationCurve(new Keyframe(0,.55f),new Keyframe(.35f,1),new Keyframe(1,1.8f))):new ParticleSystem.MinMaxCurve(1,new AnimationCurve(new Keyframe(0,.5f),new Keyframe(.15f,1),new Keyframe(1,.3f)));
   if(noise){var n=ps.noise;n.enabled=true;n.strength=noiseStrength;n.frequency=.45f;n.scrollSpeed=.3f;n.quality=ParticleSystemNoiseQuality.Medium;}
   if(groundPlane!=null){var collision=ps.collision;collision.enabled=true;collision.type=ParticleSystemCollisionType.Planes;collision.AddPlane(groundPlane);collision.bounce=.35f;collision.dampen=.45f;collision.lifetimeLoss=0;collision.radiusScale=.5f;}
   var r=ps.GetComponent<ParticleSystemRenderer>();r.sharedMaterial=material;r.renderMode=stretch?ParticleSystemRenderMode.Stretch:ParticleSystemRenderMode.Billboard;if(stretch){r.lengthScale=1.4f;r.velocityScale=.045f;}r.shadowCastingMode=ShadowCastingMode.Off;r.receiveShadows=false;r.alignment=ParticleSystemRenderSpace.View;r.sortMode=ParticleSystemSortMode.None;r.minParticleSize=0;r.maxParticleSize=2;
   p=new ParticleSystem.EmitParams();
  }
  // Unity stores the start frame normalised over the whole sheet; the inspector only displays it in frames.
  public void Frame(int f){if(frame==f)return;frame=f;sheet.startFrame=f/(float)(FxSheet.Tiles*FxSheet.Tiles);}
  public void Emit(Vector3 position,Vector3 velocity,float size,float life,Color color,float rotation=0,float spin=0){p.position=position;p.velocity=velocity;p.startSize=size;p.startLifetime=life;p.startColor=color;p.rotation=rotation;p.angularVelocity=spin;ps.Emit(p,1);}
  public void Simulate(float dt){if(ps.particleCount>0)ps.Simulate(dt,true,false,false);}
  public void Clear(){ps.Clear(true);}
 }

 /// <summary>Pooled renderers for every non-particle effect primitive. Nothing here allocates after Awake.</summary>
 public sealed partial class FxPool {
  public sealed class Slot{public GameObject go;public Transform t;public MeshRenderer mr;public MeshFilter mf;public LineRenderer line;public Light light;public LineRenderer trail;public Transform glow;public MeshRenderer glowRenderer;public MaterialPropertyBlock glowBlock;public bool busy;public MaterialPropertyBlock block;}
  public readonly Slot[] rings,bolts,shells,decals,lights,ghosts,tubes;public readonly Mesh[] tubeMeshes=new Mesh[4];public readonly Spline[] tubeSplines=new Spline[4];public readonly Material bark,mint;
  public readonly Mesh ringThin,ringThick,ringShock,glowDisc,husk,iron,star,sprite,glowQuad;readonly Mesh[] decalMeshes=new Mesh[8];
  public readonly Material additiveSheet,additiveHot,alphaSheet,alphaPuff,bolt,decal,seedShell,ironShell,starShell;
  // Super towers: six emblem decals and six thin rings allocated here (never lazily; a seventh Super gets the shader pulse only). The emblem
  // texture is Carrot/Textures/SuperEmblems (5x2 cells: seed, frost, mortar, prism, storm / blossom, starfruit, gravity, book, thunder); the
  // FxSheet Star6 cell stands in when it is missing. `additiveTop` is the ZTest-Always FxAdditive for arena telegraph rings; `overlayGlow` draws
  // after the blind overlay (render queue 4001) for the faint lantern glow at the carrot while the screen is dark.
  public readonly Slot[] emblems,superRings;public readonly Material emblem,additiveTop,overlayGlow;public readonly bool emblemTexture;readonly Mesh[] emblemMeshes=new Mesh[10];
  public static readonly string[] SuperOrder={"seed","frost","mortar","prism","storm","blossom","starfruit","gravity","book","thunder"};
  public Mesh EmblemMesh(string kind){int i=System.Array.IndexOf(SuperOrder,kind);return i>=0?emblemMeshes[i]:ExpansionEmblem(kind);}
  readonly List<Mesh> owned=new List<Mesh>();readonly List<Material> ownedMaterials=new List<Material>();
  public FxPool(Transform parent,Texture2D sheet,bool high){
   additiveSheet=Mat("Carrot/FxAdditive");additiveSheet.SetTexture("_MainTex",sheet);additiveSheet.SetFloat("_UseAtlas",1);additiveSheet.SetFloat("_Soft",0);
   // Impact cores and sparks are HDR (x2.4) so the bloom threshold catches them; particle vertex colours are Color32 and cannot carry HDR.
   additiveHot=Mat("Carrot/FxAdditive");additiveHot.SetTexture("_MainTex",sheet);additiveHot.SetFloat("_UseAtlas",1);additiveHot.SetFloat("_Soft",0);additiveHot.SetColor("_Color",new Color(2.4f,2.4f,2.4f,1));
   alphaSheet=Mat("Carrot/FxAlpha");alphaSheet.SetTexture("_MainTex",sheet);alphaSheet.SetFloat("_UseAtlas",1);alphaSheet.SetFloat("_Puff",.35f);
   alphaPuff=Mat("Carrot/FxAlpha");alphaPuff.SetFloat("_UseAtlas",0);
   bolt=Mat("Carrot/FxAdditive");bolt.SetFloat("_UseAtlas",0);bolt.SetFloat("_Soft",0);
   decal=Mat("Carrot/FxDecalQuad");decal.SetTexture("_MainTex",sheet);
   seedShell=Mat("Carrot/Storybook");seedShell.color=new Color(.6f,.38f,.12f);seedShell.SetFloat("_Glossiness",.4f);seedShell.SetColor("_EmissionColor",new Color(1,.7f,.25f)*1.1f);
   ironShell=Mat("Carrot/Storybook");ironShell.color=new Color(.22f,.2f,.19f);ironShell.SetFloat("_Glossiness",.45f);ironShell.SetFloat("_Metallic",.35f);ironShell.SetColor("_EmissionColor",new Color(1,.35f,.08f)*.9f);
   starShell=Mat("Carrot/Storybook");starShell.color=new Color(1,.8f,.3f);starShell.SetColor("_EmissionColor",new Color(1,.8f,.3f)*1.6f);starShell.SetFloat("_Cull",0);
   ringThin=Annulus(.88f);ringThick=Annulus(.62f);ringShock=Annulus(.76f);glowDisc=FlatQuad(FxSheet.Cell(FxSheet.GlowSoft),2);husk=Ellipsoid();iron=CarrotMeshes.Get(PrimitiveType.Sphere,true);star=StarMesh();sprite=Quad(FxSheet.Cell(FxSheet.Flake));glowQuad=Quad(FxSheet.Cell(FxSheet.GlowSoft));
   for(int i=0;i<8;i++)decalMeshes[i]=FlatQuad(FxSheet.Cell(FxSheet.Scorch+i));
   BuildExpansionMeshes();
   var root=new GameObject("Effect pools").transform;root.SetParent(parent,false);
   rings=new Slot[16];for(int i=0;i<rings.Length;i++)rings[i]=MeshSlot(root,"Ring",ringThin,additiveSheet);
   bolts=new Slot[12];for(int i=0;i<bolts.Length;i++)bolts[i]=LineSlot(root,"Bolt",16);
   shells=new Slot[24];for(int i=0;i<shells.Length;i++){var s=MeshSlot(root,"Shell",husk,seedShell);var trail=LineSlot(s.t,"Trail",8);trail.line.widthMultiplier=.05f;trail.line.enabled=true;trail.go.SetActive(true);s.trail=trail.line;
    // Every shell carries a camera-facing glow sprite so a 0.1 u pellet still reads at the fitted play distance.
    var glow=MeshSlot(s.t,"Shell glow",glowQuad,additiveSheet);glow.go.SetActive(true);glow.busy=true;s.glow=glow.t;s.glowRenderer=glow.mr;s.glowBlock=glow.block;shells[i]=s;}
   decals=new Slot[high?24:8];for(int i=0;i<decals.Length;i++)decals[i]=MeshSlot(root,"Decal",decalMeshes[0],decal);
   lights=new Slot[high?2:0];for(int i=0;i<lights.Length;i++){var go=new GameObject("Effect light");go.transform.SetParent(root,false);var l=go.AddComponent<Light>();l.type=LightType.Point;l.shadows=LightShadows.None;l.renderMode=LightRenderMode.ForcePixel;l.intensity=0;l.range=2;go.SetActive(false);lights[i]=new Slot{go=go,t=go.transform,light=l};}
   ghosts=new Slot[6];for(int i=0;i<ghosts.Length;i++)ghosts[i]=MeshSlot(root,"Echo",null,additiveSheet);
   bark=Mat("Carrot/Storybook");bark.color=new Color(.42f,.3f,.16f);bark.SetFloat("_Glossiness",.3f);mint=Mat("Carrot/Storybook");mint.color=new Color(.5f,1,.85f);mint.SetColor("_EmissionColor",new Color(.3f,1,.78f)*1.4f);
   tubes=new Slot[4];for(int i=0;i<tubes.Length;i++){tubeMeshes[i]=new Mesh{name="Spline tube"};owned.Add(tubeMeshes[i]);tubes[i]=MeshSlot(root,"Tube",tubeMeshes[i],bark);tubes[i].mr.shadowCastingMode=ShadowCastingMode.On;}
   var emblemTex=Resources.Load<Texture2D>("Carrot/Textures/SuperEmblems");emblemTexture=emblemTex!=null;
   emblem=Mat("Carrot/FxDecalQuad");emblem.SetTexture("_MainTex",emblemTexture?emblemTex:sheet);emblem.SetFloat("_Emissive",1);
   for(int i=0;i<10;i++)emblemMeshes[i]=emblemTexture?FlatQuad(new Rect((i%5)/5f,1-(i/5+1)/2f,1/5f,1/2f)):FlatQuad(FxSheet.Cell(FxSheet.Star6));
   emblems=new Slot[6];for(int i=0;i<emblems.Length;i++)emblems[i]=MeshSlot(root,"Super emblem",emblemMeshes[0],emblem);
   superRings=new Slot[6];for(int i=0;i<superRings.Length;i++)superRings[i]=MeshSlot(root,"Super ring",ringThin,additiveSheet);
   additiveTop=Mat("Carrot/FxAdditive");additiveTop.SetTexture("_MainTex",sheet);additiveTop.SetFloat("_UseAtlas",1);additiveTop.SetFloat("_Soft",0);additiveTop.SetFloat("_ZTest",8);
   overlayGlow=Mat("Carrot/FxAdditive");overlayGlow.SetTexture("_MainTex",sheet);overlayGlow.SetFloat("_UseAtlas",1);overlayGlow.SetFloat("_Soft",0);overlayGlow.SetFloat("_ZTest",8);overlayGlow.renderQueue=4001;
  }
  Material Mat(string shader){var m=new Material(Shader.Find(shader));ownedMaterials.Add(m);return m;}
  Slot MeshSlot(Transform root,string name,Mesh mesh,Material material){var go=new GameObject(name);go.transform.SetParent(root,false);var s=new Slot{go=go,t=go.transform,mf=go.AddComponent<MeshFilter>(),mr=go.AddComponent<MeshRenderer>(),block=new MaterialPropertyBlock()};s.mf.sharedMesh=mesh;s.mr.sharedMaterial=material;s.mr.shadowCastingMode=ShadowCastingMode.Off;s.mr.receiveShadows=false;go.SetActive(false);return s;}
  Slot LineSlot(Transform root,string name,int points){var go=new GameObject(name);go.transform.SetParent(root,false);var l=go.AddComponent<LineRenderer>();l.sharedMaterial=bolt;l.useWorldSpace=true;l.positionCount=points;l.numCapVertices=2;l.numCornerVertices=1;l.shadowCastingMode=ShadowCastingMode.Off;l.receiveShadows=false;l.textureMode=LineTextureMode.Stretch;go.SetActive(false);return new Slot{go=go,t=go.transform,line=l,block=new MaterialPropertyBlock()};}
  public Mesh DecalMesh(int cell){return decalMeshes[Mathf.Clamp(cell-FxSheet.Scorch,0,7)];}
  /// <summary>A dedicated (unpooled) renderer slot, e.g. the boss ground aura.</summary>
  public Slot Extra(string name,Mesh mesh,Material material){var s=MeshSlot(tubes[0].t.parent,name,mesh,material);return s;}
  Mesh Annulus(float inner){const int n=48;var v=new Vector3[(n+1)*2];var uv=new Vector2[v.Length];var c=new Color[v.Length];var t=new int[n*6];Rect cell=FxSheet.Cell(FxSheet.Shockwave);float mid=cell.y+cell.height*.5f;
   for(int i=0;i<=n;i++){float a=i*Mathf.PI*2/n;Vector3 d=new Vector3(Mathf.Cos(a),0,Mathf.Sin(a));v[i*2]=d*inner;v[i*2+1]=d;uv[i*2]=new Vector2(cell.x+cell.width*.02f,mid);uv[i*2+1]=new Vector2(cell.x+cell.width*.98f,mid);c[i*2]=c[i*2+1]=Color.white;if(i<n){int k=i*6,b=i*2;t[k]=b;t[k+1]=b+2;t[k+2]=b+1;t[k+3]=b+1;t[k+4]=b+2;t[k+5]=b+3;}}
   var m=new Mesh{name="Effect ring"};m.vertices=v;m.uv=uv;m.colors=c;m.triangles=t;m.RecalculateNormals();m.RecalculateBounds();owned.Add(m);return m;}
  Mesh Ellipsoid(){var source=CarrotMeshes.Get(PrimitiveType.Sphere,true);var m=UnityEngine.Object.Instantiate(source);var v=m.vertices;for(int i=0;i<v.Length;i++)v[i]=new Vector3(v[i].x*.8f,v[i].y*.75f,v[i].z*1.25f);m.vertices=v;m.RecalculateNormals();m.RecalculateBounds();m.name="Seed husk";owned.Add(m);return m;}
  Mesh StarMesh(){var v=new List<Vector3>();var uv=new List<Vector2>();var tri=new List<int>();var c=new List<Color>();for(int side=0;side<2;side++){int center=v.Count;v.Add(new Vector3(0,side==0?.012f:-.012f,0));uv.Add(Vector2.one*.5f);c.Add(Color.white);for(int i=0;i<10;i++){float a=i*Mathf.PI/5;float r=i%2==0?1:.42f;v.Add(new Vector3(Mathf.Cos(a)*r,0,Mathf.Sin(a)*r));uv.Add(new Vector2(Mathf.Cos(a),Mathf.Sin(a))*.5f+Vector2.one*.5f);c.Add(Color.white);}for(int i=0;i<10;i++){int a=center+1+i,b=center+1+(i+1)%10;if(side==0){tri.Add(center);tri.Add(b);tri.Add(a);}else{tri.Add(center);tri.Add(a);tri.Add(b);}}}var m=new Mesh{name="Star shell"};m.SetVertices(v);m.SetUVs(0,uv);m.SetColors(c);m.SetTriangles(tri,0);m.RecalculateNormals();m.RecalculateBounds();owned.Add(m);return m;}
  Mesh Quad(Rect cell){var m=new Mesh{name="Sprite shell"};m.vertices=new[]{new Vector3(-.5f,-.5f,0),new Vector3(.5f,-.5f,0),new Vector3(.5f,.5f,0),new Vector3(-.5f,.5f,0)};m.uv=new[]{new Vector2(cell.x,cell.y),new Vector2(cell.xMax,cell.y),new Vector2(cell.xMax,cell.yMax),new Vector2(cell.x,cell.yMax)};m.colors=new[]{Color.white,Color.white,Color.white,Color.white};m.triangles=new[]{0,2,1,0,3,2,0,1,2,0,2,3};m.RecalculateNormals();m.RecalculateBounds();owned.Add(m);return m;}
  Mesh FlatQuad(Rect cell,float size=1){var m=new Mesh{name="Ground decal"};float h=size*.5f;m.vertices=new[]{new Vector3(-h,0,-h),new Vector3(h,0,-h),new Vector3(h,0,h),new Vector3(-h,0,h)};m.uv=new[]{new Vector2(cell.x,cell.y),new Vector2(cell.xMax,cell.y),new Vector2(cell.xMax,cell.yMax),new Vector2(cell.x,cell.yMax)};m.colors=new[]{Color.white,Color.white,Color.white,Color.white};m.normals=new[]{Vector3.up,Vector3.up,Vector3.up,Vector3.up};m.triangles=new[]{0,2,1,0,3,2};m.RecalculateBounds();owned.Add(m);return m;}
  public static int Take(Slot[] slots){for(int i=0;i<slots.Length;i++)if(!slots[i].busy){slots[i].busy=true;slots[i].go.SetActive(true);return i;}return -1;}
  public static void Free(Slot s){s.busy=false;s.go.SetActive(false);}
  public void Dispose(){foreach(var m in owned)UnityEngine.Object.Destroy(m);foreach(var m in ownedMaterials)UnityEngine.Object.Destroy(m);}
 }
}
