using System;
using System.Collections.Generic;
using UnityEngine;
using UnityEngine.Rendering;
using Unity.Mathematics;
using UnityEngine.Splines;

namespace CarrotTD {
 // Presentation only. Combat and arrival timing remain authoritative in CarrotGame.
 // Every primitive is pooled in Awake; Handle never creates GameObjects or components.
 // Sizes are tuned for the fitted play camera (about 46 px per world unit at 1440x900): an impact covers an enemy body, never a thumbnail.
 public sealed class CarrotEffects : MonoBehaviour {
  enum K:byte{Ring,Bolt,Shell,Decal,Light,Delay,Loop,Ghost,Tube}
  enum Op:byte{MortarFlash2,MortarSmoke,BurnEmbers,ChargeTick,CrackleTick,ThunderBolt2,MistPuff,Fireworks,SkyFlash,PulseRing,ConductiveArc,BarkTick,ThunderAfter}
  struct Live{public K k;public int slot;public float age,life;public Vector3 a,b;public Color color;public float f0,f1,f2,f3;public int i0,i1;}
  readonly List<Live> live=new List<Live>();
  FxPool pool;FxSystem flash,sparks,smoke,dust,debris,embers,motes;Transform groundPlane;Camera cam;ParticleSystem ambient;ParticleSystemRenderer ambientRenderer;Material fireflyMaterial;bool ambientReady;
  FxPool.Slot auraDecal,auraRing;float auraClock;bool auraOn;
  public Action<Vector3,float,int> CameraImpulse;public Action<float,float,float> HitStop;public Func<Vector3,float> Ground=p=>0;public string Biome="garden";
  float clock;readonly Dictionary<int,float> chargedAt=new Dictionary<int,float>();float mortarAt=-9;int mortarKills;readonly Mesh[] ghostMeshes=new Mesh[2];
  public static Color Tone(string kind) {
   switch(kind){case "frost":case "mantle":case "breath":case "shatter":return new Color(.35f,.8f,1f);case "prism":return new Color(.82f,.63f,1f);case "storm":case "thunder":return new Color(.56f,.75f,1f);case "gravity":return new Color(.63f,.28f,1f);case "blossom":case "root":return new Color(.58f,1f,.34f);case "book":case "mist":case "summon":case "marsh":return new Color(.3f,1f,.78f);case "bark":case "garden":return new Color(1f,.62f,.25f);default:return new Color(1f,.68f,.2f);}
  }
  static int N(int desktop){return Mathf.Max(1,Mathf.RoundToInt(desktop*CarrotQuality.ParticleScale));}
  static float R(float a,float b){return UnityEngine.Random.Range(a,b);}
  static Color Hot(Color c,float k){return new Color(c.r*k,c.g*k,c.b*k,c.a);}
  Color Soil{get{return Biome=="frost"?new Color(.88f,.92f,1f):Biome=="marsh"?new Color(.27f,.33f,.22f):new Color(.46f,.32f,.16f);}}
  /// <summary>A point lifted above the walking surface (trail strip or terrain) so ground effects are never buried under the path mesh.</summary>
  Vector3 G(Vector3 p,float lift){return new Vector3(p.x,Ground(p)+lift,p.z);}
  void Awake(){
   var sheet=Resources.Load<Texture2D>("Carrot/Textures/VfxSheet");bool high=CarrotQuality.High;pool=new FxPool(transform,sheet,high);
   var plane=new GameObject("Debris ground");plane.transform.SetParent(transform,false);plane.transform.position=Vector3.zero;plane.transform.rotation=Quaternion.identity;groundPlane=plane.transform;
   flash=new FxSystem(transform,"Flashes",pool.additiveHot,high?64:32);
   sparks=new FxSystem(transform,"Sparks",pool.additiveHot,high?96:48,stretch:true,gravity:1,firstFrame:FxSheet.Spark);
   smoke=new FxSystem(transform,"Smoke",pool.alphaSheet,high?64:32,grow:true,flipbook:true,firstFrame:FxSheet.Smoke,frames:FxSheet.SmokeFrames,noise:true,noiseStrength:.25f);
   dust=new FxSystem(transform,"Dust",pool.alphaPuff,high?160:80,grow:true);
   debris=new FxSystem(transform,"Debris",pool.alphaSheet,high?128:64,gravity:1,groundPlane:groundPlane,firstFrame:FxSheet.Pebble);
   embers=new FxSystem(transform,"Embers",pool.additiveHot,high?96:48,gravity:-.25f,flipbook:true,firstFrame:FxSheet.Ember,frames:FxSheet.EmberFrames,noise:true,noiseStrength:.35f);
   motes=new FxSystem(transform,"Motes",pool.additiveSheet,high?160:80,noise:true,noiseStrength:.3f,firstFrame:FxSheet.GlowSoft);
   var weather=new GameObject("Ambient weather");weather.transform.SetParent(transform,false);ambient=weather.AddComponent<ParticleSystem>();ambient.Stop(true,ParticleSystemStopBehavior.StopEmittingAndClear);ambientRenderer=weather.GetComponent<ParticleSystemRenderer>();ambientRenderer.sharedMaterial=pool.additiveSheet;ambientRenderer.shadowCastingMode=ShadowCastingMode.Off;ambientRenderer.receiveShadows=false;ambientRenderer.sortMode=ParticleSystemSortMode.None;var am=ambient.main;am.playOnAwake=false;am.loop=true;am.simulationSpace=ParticleSystemSimulationSpace.World;var ae=ambient.emission;ae.enabled=false;
   fireflyMaterial=new Material(pool.additiveSheet);fireflyMaterial.SetColor("_Color",new Color(.75f,1,.5f)*3);
   auraDecal=pool.Extra("Boss aura",pool.DecalMesh(FxSheet.Crack),pool.decal);auraRing=pool.Extra("Boss aura ring",pool.ringThin,pool.additiveSheet);
  }
  /// <summary>Per-biome weather: snowfall, fireflies or pollen, manually simulated so pause and speed stay exact. Sizes read at the fitted camera (a 0.03 u flake is one pixel).</summary>
  public void Ambient(string biome){
   bool high=CarrotQuality.High;var main=ambient.main;var emission=ambient.emission;var shape=ambient.shape;var sheet=ambient.textureSheetAnimation;var noise=ambient.noise;var col=ambient.colorOverLifetime;var vel=ambient.velocityOverLifetime;
   ambient.Stop(true,ParticleSystemStopBehavior.StopEmittingAndClear);shape.enabled=true;shape.shapeType=ParticleSystemShapeType.Box;sheet.enabled=true;sheet.mode=ParticleSystemAnimationMode.Grid;sheet.numTilesX=FxSheet.Tiles;sheet.numTilesY=FxSheet.Tiles;sheet.animation=ParticleSystemAnimationType.WholeSheet;sheet.frameOverTime=new ParticleSystem.MinMaxCurve(0);sheet.startFrame=FxSheet.GlowSoft/(float)(FxSheet.Tiles*FxSheet.Tiles);noise.enabled=true;noise.quality=ParticleSystemNoiseQuality.Low;col.enabled=true;vel.enabled=true;vel.space=ParticleSystemSimulationSpace.World;emission.enabled=true;ambientRenderer.sharedMaterial=pool.additiveSheet;main.gravityModifier=0;main.startSpeed=0;main.startRotation=0;
   var g=new Gradient();
   if(biome=="frost"){int count=high?500:220;main.maxParticles=count;main.startLifetime=8;emission.rateOverTime=count/8f;shape.position=new Vector3(0,9,0);shape.scale=new Vector3(26,1,22);main.startSize=new ParticleSystem.MinMaxCurve(.06f,.12f);main.startColor=new Color(.95f,.97f,1,.9f);vel.x=.12f;vel.y=-1.1f;vel.z=0;noise.strength=.4f;noise.frequency=.25f;noise.scrollSpeed=.2f;g.SetKeys(new[]{new GradientColorKey(Color.white,0),new GradientColorKey(Color.white,1)},new[]{new GradientAlphaKey(0,0),new GradientAlphaKey(1,.08f),new GradientAlphaKey(1,.85f),new GradientAlphaKey(0,1)});}
   else if(biome=="marsh"){int count=high?24:12;main.maxParticles=count;main.startLifetime=new ParticleSystem.MinMaxCurve(6,14);emission.rateOverTime=count/10f;shape.position=new Vector3(0,.75f,0);shape.scale=new Vector3(16,.8f,12);main.startSize=.13f;main.startColor=Color.white;vel.x=0;vel.y=.02f;vel.z=0;noise.strength=.6f;noise.frequency=.3f;noise.scrollSpeed=.4f;ambientRenderer.sharedMaterial=fireflyMaterial;g.SetKeys(new[]{new GradientColorKey(Color.white,0),new GradientColorKey(Color.white,1)},new[]{new GradientAlphaKey(0,0),new GradientAlphaKey(1,.15f),new GradientAlphaKey(.05f,.35f),new GradientAlphaKey(1,.55f),new GradientAlphaKey(.05f,.75f),new GradientAlphaKey(.8f,.9f),new GradientAlphaKey(0,1)});}
   else{int count=high?90:40;main.maxParticles=count;main.startLifetime=10;emission.rateOverTime=count/10f;shape.position=new Vector3(0,1.2f,0);shape.scale=new Vector3(18,2.2f,14);main.startSize=new ParticleSystem.MinMaxCurve(.05f,.08f);main.startColor=new Color(1,.95f,.7f,.6f);vel.x=.15f;vel.y=-.03f;vel.z=.05f;noise.strength=.25f;noise.frequency=.2f;noise.scrollSpeed=.3f;g.SetKeys(new[]{new GradientColorKey(Color.white,0),new GradientColorKey(Color.white,1)},new[]{new GradientAlphaKey(0,0),new GradientAlphaKey(1,.15f),new GradientAlphaKey(1,.8f),new GradientAlphaKey(0,1)});}
   col.color=g;ambient.Simulate(12,true,true,false);ambientReady=true;
  }
  public void FootDust(Vector3 p,int count,float size,bool boss){Color c=Biome=="frost"?new Color(.92f,.95f,1,.5f):Biome=="marsh"?new Color(.25f,.32f,.22f,.35f):new Color(.55f,.42f,.27f,.35f);Dust(G(p,.07f),N(count),size*1.5f,.68f,c,.35f);if(boss)RingFx(p,.15f,.55f,.45f,new Color(c.r,c.g,c.b,.6f),1,1.5f);}
  /// <summary>Ground aura under a living boss: cracked earth (garden), a mint rune ring (marsh) or a frost web (frost) plus a slow HDR pulse ring. Called every frame by the view.</summary>
  public void BossAura(Vector3 p,string boss,Color tone,bool active,float dt){
   if(!active){if(auraOn){auraOn=false;auraDecal.go.SetActive(false);auraRing.go.SetActive(false);}return;}
   if(!auraOn){auraOn=true;auraDecal.go.SetActive(true);auraRing.go.SetActive(true);auraDecal.mf.sharedMesh=pool.DecalMesh(boss=="marsh"?FxSheet.Pollen:boss=="frost"?FxSheet.FrostWeb:FxSheet.Crack);auraDecal.t.rotation=Quaternion.identity;auraRing.t.rotation=Quaternion.identity;}
   auraClock+=dt;float pulse=.5f+.5f*Mathf.Sin(auraClock*2.4f);
   auraDecal.t.position=G(p,.02f);auraDecal.t.localScale=new Vector3(2.6f,1,2.6f);auraDecal.t.rotation=Quaternion.Euler(0,boss=="marsh"?auraClock*18:0,0);
   Color dc=boss=="garden"?new Color(.16f,.1f,.06f,.85f):new Color(tone.r,tone.g,tone.b,.7f);auraDecal.block.SetColor("_Color",dc);auraDecal.block.SetFloat("_Fade",.75f+.25f*pulse);auraDecal.block.SetFloat("_Erode",0);auraDecal.block.SetFloat("_Emissive",boss=="garden"?0:1);auraDecal.mr.SetPropertyBlock(auraDecal.block);
   float r=1.05f+.12f*pulse;auraRing.t.position=G(p,.05f);auraRing.t.localScale=new Vector3(r,1,r);auraRing.block.SetColor("_Color",Hot(new Color(tone.r,tone.g,tone.b,.35f+.3f*pulse),1.8f));auraRing.mr.SetPropertyBlock(auraRing.block);
  }
  void OnDestroy(){Clear();if(pool!=null)pool.Dispose();if(fireflyMaterial!=null)Destroy(fireflyMaterial);for(int i=0;i<ghostMeshes.Length;i++)if(ghostMeshes[i]!=null)Destroy(ghostMeshes[i]);}
  public void Clear(){for(int i=0;i<live.Count;i++)Release(live[i]);live.Clear();chargedAt.Clear();clock=0;if(flash!=null){flash.Clear();sparks.Clear();smoke.Clear();dust.Clear();debris.Clear();embers.Clear();motes.Clear();}BossAura(Vector3.zero,"",Color.white,false,0);}
  void Release(Live l){switch(l.k){case K.Ring:FxPool.Free(pool.rings[l.slot]);break;case K.Bolt:FxPool.Free(pool.bolts[l.slot]);break;case K.Shell:FxPool.Free(pool.shells[l.slot]);break;case K.Decal:FxPool.Free(pool.decals[l.slot]);break;case K.Light:pool.lights[l.slot].light.intensity=0;FxPool.Free(pool.lights[l.slot]);break;case K.Ghost:for(int g=0;g<3;g++)FxPool.Free(pool.ghosts[l.slot*3+g]);break;case K.Tube:FxPool.Free(pool.tubes[l.slot]);break;}}
  void Add(Live l){if(live.Count>=CarrotQuality.MaxEffects){int victim=-1;for(int i=0;i<live.Count;i++)if(live[i].k==K.Delay||live[i].k==K.Loop||live[i].k==K.Decal){victim=i;break;}if(victim<0)victim=0;Release(live[victim]);live.RemoveAt(victim);}live.Add(l);}
  public void Tick(float dt){
   if(dt<=0)return;clock+=dt;if(cam==null)cam=Camera.main;
   flash.Simulate(dt);sparks.Simulate(dt);smoke.Simulate(dt);dust.Simulate(dt);debris.Simulate(dt);embers.Simulate(dt);motes.Simulate(dt);if(ambientReady)ambient.Simulate(dt,true,false,false);
   for(int i=live.Count-1;i>=0;i--){
    Live l=live[i];l.age+=dt;float t=Mathf.Clamp01(l.age/Mathf.Max(.0001f,l.life));bool done=l.age>=l.life;
    switch(l.k){
     case K.Ring:{var s=pool.rings[l.slot];float e=1-(1-t)*(1-t);float r=Mathf.Lerp(l.f0,l.f1,e);s.t.localScale=new Vector3(r,1,r);Color c=l.color;c.a*=Mathf.Pow(1-t,l.f2)*(l.i1==1?.7f+.3f*Mathf.Sin(l.age*9):1);s.block.SetColor("_Color",c);s.mr.SetPropertyBlock(s.block);break;}
     case K.Bolt:{var s=pool.bolts[l.slot];if(l.i1==1){l.f3-=dt;if(l.f3<=0){l.f3=l.f2;Jitter(s.line,l.a,l.b,l.f1);}}Color c=l.color;c.a*=(1-t)*(l.i0==1?1:.75f+.25f*Mathf.Sin(l.age*60));s.line.startColor=s.line.endColor=c;s.line.widthMultiplier=l.f0*(l.i0==1?1-t*.4f:1-t*.7f);break;}
     case K.Shell:{var s=pool.shells[l.slot];Vector3 p=Arc(l.a,l.b,l.f0,t);s.t.position=p;if(l.i1==1&&cam!=null)s.t.rotation=cam.transform.rotation*Quaternion.Euler(0,0,l.age*l.f1);else s.t.rotation=Quaternion.Euler(l.age*l.f1,l.age*l.f1*.6f,l.age*l.f1*.3f);
      if(cam!=null)s.glow.rotation=cam.transform.rotation;
      for(int j=0;j<8;j++)s.trail.SetPosition(j,Arc(l.a,l.b,l.f0,Mathf.Clamp01(t-j*l.f2)));
      if(l.i0==1){l.f3+=dt;if(l.f3>.08f){l.f3=0;Smoke(p,1,.3f,.42f,.5f,new Color(.6f,.55f,.5f,.45f),0);embers.Frame(FxSheet.Ember);for(int k=0;k<2;k++)embers.Emit(p,UnityEngine.Random.insideUnitSphere*.5f,.12f,.35f,new Color(1,.5f,.15f));}}
      else if(l.i0==2){l.f3+=dt;if(l.f3>.08f){l.f3=0;motes.Frame(FxSheet.Flake);motes.Emit(p,UnityEngine.Random.insideUnitSphere*.4f,.1f,.55f,new Color(.75f,.9f,1,.8f),R(0,360),200);}}
      else if(l.i0==3){l.f3+=dt;if(l.f3>.06f){l.f3=0;flash.Frame(FxSheet.StarGlyph);flash.Emit(p,Vector3.up*.3f,.18f,.4f,new Color(1,.85f,.4f,.8f),R(0,360),120);}}
      else if(l.i0==0){l.f3+=dt;if(l.f3>.05f){l.f3=0;motes.Frame(FxSheet.GlowSoft);motes.Emit(p,UnityEngine.Random.insideUnitSphere*.15f,.16f,.22f,new Color(1,.8f,.35f,.6f));}}
      break;}
     case K.Decal:{var s=pool.decals[l.slot];float size=Mathf.Lerp(l.f0,l.f1,Mathf.Min(1,l.age/.35f));s.t.localScale=new Vector3(size,1,size);float fade=Mathf.Min(1,l.age/.08f)*(1-Mathf.Pow(t,3));float erode=l.i1==1?Mathf.Max(0,t-.3f)/.7f*.9f:0;s.block.SetColor("_Color",l.color);s.block.SetFloat("_Fade",fade*l.f2);s.block.SetFloat("_Erode",erode);s.block.SetFloat("_Emissive",l.f3);s.mr.SetPropertyBlock(s.block);break;}
     case K.Light:{var s=pool.lights[l.slot];float env=Mathf.Min(1,l.age/Mathf.Max(.001f,l.f2))*(1-t*t);if(l.i1>0)env*=.75f+.25f*Mathf.Sin(l.age*l.i1*6.283f);s.light.intensity=l.f0*env;s.light.range=l.f1;s.light.color=l.color;break;}
     case K.Delay:if(done){Run((Op)l.i0,l.a,l.b,l.color,l.f0,l.i1);}break;
     case K.Loop:{l.f3-=dt;if(l.f3<=0){l.f3+=l.f1;Run((Op)l.i0,l.a,l.b,l.color,l.f0,l.i1,t);}break;}
     case K.Tube:{if(l.age<l.f0||l.f3<0){l.f3-=dt;if(l.f3<=0){l.f3=.05f;float grow=Mathf.Clamp01(l.age/Mathf.Max(.01f,l.f0));float shrink=l.life-l.age<.3f?Mathf.Clamp01((l.life-l.age)/.3f):1;SplineMesh.Extrude(pool.tubeSplines[l.slot],pool.tubeMeshes[l.slot],l.f1*shrink,6,24,true,new float2(0,Mathf.Max(.02f,grow)));}}break;}
     case K.Ghost:{for(int g=0;g<3;g++){var s=pool.ghosts[l.slot*3+g];float trail=Mathf.Clamp01(t-(g+1)*.13f);s.t.position=Vector3.Lerp(l.a,l.b,trail);Color c=l.color;c.a=.24f*(1-g*.2f)*Mathf.Sin(t*Mathf.PI);s.block.SetColor("_Color",c);s.mr.SetPropertyBlock(s.block);}break;}
    }
    if(done){Release(l);int last=live.Count-1;live[i]=live[last];live.RemoveAt(last);}else live[i]=l;
   }
  }
  static Vector3 Arc(Vector3 a,Vector3 b,float height,float t){Vector3 m=(a+b)*.5f+Vector3.up*height;return Vector3.Lerp(Vector3.Lerp(a,m,t),Vector3.Lerp(m,b,t),t);}
  // ---- primitives -------------------------------------------------------------------------------------------
  void Flash(Vector3 p,float size,float life,Color c,int frame=FxSheet.GlowSoft,float rotation=0,float spin=0,Vector3 velocity=default(Vector3)){flash.Frame(frame);flash.Emit(p,velocity,size,life,c,rotation,spin);}
  void Sparks(Vector3 p,int count,float speed0,float speed1,float life,Color c,Vector3 direction=default(Vector3),float cone=1,float size=.09f){for(int i=0;i<count;i++){Vector3 d=direction==Vector3.zero?UnityEngine.Random.onUnitSphere:(direction.normalized+UnityEngine.Random.insideUnitSphere*cone).normalized;if(direction==Vector3.zero&&d.y<0)d.y=-d.y*.6f;sparks.Frame(FxSheet.Spark+(i&7));sparks.Emit(p,d*R(speed0,speed1),size*R(.7f,1.3f),life*R(.7f,1.2f),c);}}
  void Smoke(Vector3 p,int count,float size0,float size1,float life,Color c,float rise,float spread=.5f){for(int i=0;i<count;i++)smoke.Emit(p+UnityEngine.Random.insideUnitSphere*spread*.3f,UnityEngine.Random.insideUnitSphere*spread+Vector3.up*rise,R(size0,size1),life*R(.8f,1.2f),c,R(0,360),R(-40,40));}
  void Dust(Vector3 p,int count,float size,float life,Color c,float speed,Vector3 bias=default(Vector3)){for(int i=0;i<count;i++){Vector3 d=UnityEngine.Random.insideUnitSphere;d.y=Mathf.Abs(d.y)*.5f;dust.Emit(p+d*.08f,d*speed+bias,size*R(.7f,1.3f),life*R(.8f,1.2f),c,R(0,360),R(-30,30));}}
  void Debris(Vector3 p,int count,int cell,float size0,float size1,float speed0,float speed1,float life,Color c,float spin=360,Vector3 bias=default(Vector3)){debris.Frame(cell);for(int i=0;i<count;i++){Vector3 d=UnityEngine.Random.onUnitSphere;d.y=Mathf.Abs(d.y)+.3f;debris.Emit(p,d.normalized*R(speed0,speed1)+bias,R(size0,size1),life*R(.8f,1.25f),c,R(0,360),R(-spin,spin));}}
  void Embers(Vector3 p,int count,float size,float life,Color c,float rise,float spread=.25f){embers.Frame(FxSheet.Ember);for(int i=0;i<count;i++)embers.Emit(p+UnityEngine.Random.insideUnitSphere*spread,UnityEngine.Random.insideUnitSphere*.4f+Vector3.up*rise,size*R(.7f,1.3f),life*R(.7f,1.3f),c,R(0,360),R(-90,90));}
  void Motes(Vector3 p,int count,float size,float life,Color c,float speed,Vector3 bias=default(Vector3),int frame=FxSheet.GlowSoft,float spread=.15f){motes.Frame(frame);for(int i=0;i<count;i++)motes.Emit(p+UnityEngine.Random.insideUnitSphere*spread,UnityEngine.Random.insideUnitSphere*speed+bias,size*R(.6f,1.4f),life*R(.7f,1.3f),c);}
  void Glyph(Vector3 p,int cell,float size,float life,Color c,Vector3 velocity,float spin=0){flash.Frame(cell);flash.Emit(p,velocity,size,life,c,0,spin);}
  public void Burst(Vector3 p,Color color,int count,float size,float life,float speed=1.2f){Motes(p,N(count),size,life,color,speed,Vector3.up*.08f,FxSheet.GlowSoft,.6f);}
  public void Ring(Vector3 p,Color color,float radius,float life,float width=.035f){RingFx(p,radius*.2f,radius,life,color,width>.05f?1:0,2);}
  /// <summary>kind 0 thin ring, 1 thick ring, 2 shockwave band, 3 flat glow disc (radius = scale).</summary>
  void RingFx(Vector3 p,float r0,float r1,float life,Color c,int kind=0,float power=2,bool pulse=false,float y=.045f){int slot=FxPool.Take(pool.rings);if(slot<0)return;var s=pool.rings[slot];s.mf.sharedMesh=kind==0?pool.ringThin:kind==1?pool.ringThick:kind==2?pool.ringShock:pool.glowDisc;s.t.position=G(p,y);s.t.rotation=Quaternion.identity;s.t.localScale=new Vector3(r0,1,r0);Add(new Live{k=K.Ring,slot=slot,life=life,f0=r0,f1=r1,f2=power,color=c,i1=pulse?1:0});}
  /// <summary>Bright ground pool under an impact: the one element that reads from any distance.</summary>
  void Disc(Vector3 p,float r0,float r1,float life,Color c,float hot=1.8f){RingFx(p,r0,r1,life,Hot(c,hot),3,1.5f,false,.035f);}
  void BoltFx(Vector3 a,Vector3 b,float width,float life,Color c,float jitter=.16f,int branches=0,bool beam=false,float crackle=0,float hot=1){int slot=FxPool.Take(pool.bolts);if(slot<0)return;var s=pool.bolts[slot];s.line.positionCount=beam?2:16;if(beam){s.line.SetPosition(0,a);s.line.SetPosition(1,b);}else Jitter(s.line,a,b,jitter);s.line.widthMultiplier=width;s.line.startColor=s.line.endColor=c;s.block.SetColor("_Color",new Color(hot,hot,hot,1));s.line.SetPropertyBlock(s.block);Add(new Live{k=K.Bolt,slot=slot,life=life,a=a,b=b,f0=width,f1=jitter,f2=crackle,f3=crackle,color=c,i0=beam?1:0,i1=crackle>0?1:0});
   for(int j=0;j<branches;j++){Vector3 start=Vector3.Lerp(a,b,.3f+j*.2f);Vector3 axis=Vector3.Cross((b-a).normalized,Vector3.up);if(axis.sqrMagnitude<.01f)axis=Vector3.right;Vector3 end=start+axis*(j%2==0?.7f:-.7f)+Vector3.down*.5f+Vector3.forward*(j==2?.4f:0);BoltFx(start,end,width*.45f,life*.75f,c*.85f,jitter*.6f,0,false,0,hot);}}
  static void Jitter(LineRenderer line,Vector3 a,Vector3 b,float amplitude){int n=line.positionCount;Vector3 axis=Vector3.Cross((b-a).normalized,Vector3.up);if(axis.sqrMagnitude<.01f)axis=Vector3.right;Vector3 axis2=Vector3.Cross(axis,(b-a).normalized);for(int i=0;i<n;i++){float t=i/(float)(n-1);float w=(i==0||i==n-1)?0:Mathf.Sin(t*Mathf.PI)*amplitude;line.SetPosition(i,Vector3.Lerp(a,b,t)+axis*R(-w,w)+axis2*R(-w,w)*.6f);}}
  void ShellFx(string kind,Vector3 from,Vector3 to,float life,int tier){int slot=FxPool.Take(pool.shells);if(slot<0)return;var s=pool.shells[slot];bool sprite=kind=="frost"||kind=="book";float height=kind=="mortar"?1.6f:kind=="book"?.7f:.16f;int mode=kind=="mortar"?1:kind=="frost"?2:kind=="starfruit"?3:kind=="book"?4:0;
   s.mf.sharedMesh=kind=="mortar"?pool.iron:kind=="starfruit"?pool.star:sprite?pool.sprite:pool.husk;s.mr.sharedMaterial=kind=="mortar"?pool.ironShell:kind=="starfruit"?pool.starShell:sprite?pool.additiveSheet:pool.seedShell;
   float scale=kind=="mortar"?.26f+tier*.03f:kind=="starfruit"?.3f:kind=="frost"?.24f:kind=="book"?.26f:.15f;s.t.localScale=Vector3.one*scale;s.t.position=from;
   Color tone=Tone(kind);Color trailColor=kind=="seed"?new Color(1,.8f,.4f,.85f):kind=="mortar"?new Color(.65f,.6f,.55f,.6f):tone;trailColor.a=kind=="mortar"?.6f:.85f;s.trail.widthMultiplier=kind=="mortar"?.24f:kind=="starfruit"?.14f:.1f;s.trail.startColor=trailColor;Color tail=trailColor;tail.a=0;s.trail.endColor=tail;for(int j=0;j<8;j++)s.trail.SetPosition(j,from);
   // Glow sprite: colour and size per shell kind, kept in local scale so it stays camera-facing in Tick.
   Color glow=kind=="mortar"?new Color(1,.45f,.15f,.9f):kind=="frost"?new Color(.6f,.9f,1,.9f):kind=="book"?new Color(.3f,1,.78f,.9f):new Color(1,.85f,.4f,.95f);float glowSize=kind=="mortar"?.7f:kind=="starfruit"?.55f:kind=="frost"?.5f:kind=="book"?.45f:.42f;
   s.glow.localScale=Vector3.one*(glowSize/scale);s.glowBlock.SetColor("_Color",Hot(glow,1.6f));s.glowRenderer.SetPropertyBlock(s.glowBlock);
   Add(new Live{k=K.Shell,slot=slot,life=life,a=from,b=to,f0=height,f1=kind=="seed"?900:kind=="mortar"?200:kind=="frost"?360:kind=="book"?0:420,f2=(kind=="mortar"?.35f:kind=="starfruit"?.2f:.14f)/Mathf.Max(.05f,life)/8,i0=mode,i1=sprite?1:0});
  }
  void DecalFx(Vector3 p,int cell,float size,float life,Color c,bool erode=false,float alpha=1,float grow=0,bool telegraph=false,float emissive=0){if(!CarrotQuality.High&&!telegraph&&cell!=FxSheet.Scorch&&cell!=FxSheet.Ice)return;int slot=FxPool.Take(pool.decals);if(slot<0){float oldest=0;int victim=-1;for(int i=0;i<live.Count;i++)if(live[i].k==K.Decal&&live[i].age>oldest){oldest=live[i].age;victim=i;}if(victim<0)return;slot=live[victim].slot;live.RemoveAt(victim);}
   var s=pool.decals[slot];s.busy=true;s.go.SetActive(true);s.mf.sharedMesh=pool.DecalMesh(cell);s.t.position=G(p,.018f);s.t.rotation=Quaternion.Euler(0,telegraph?0:R(0,360),0);s.t.localScale=Vector3.zero;Add(new Live{k=K.Decal,slot=slot,life=life,f0=grow>0?grow:size,f1=size,f2=alpha,f3=emissive,color=c,i0=cell,i1=erode?1:0});}
  void LightFx(Vector3 p,float intensity,float range,float life,Color c,float attack=.03f,int pulseHz=0){if(pool.lights.Length==0)return;int slot=FxPool.Take(pool.lights);if(slot<0){float dimmest=float.MaxValue;int victim=-1;for(int i=0;i<live.Count;i++)if(live[i].k==K.Light&&pool.lights[live[i].slot].light.intensity<dimmest){dimmest=pool.lights[live[i].slot].light.intensity;victim=i;}if(victim<0||dimmest>intensity)return;slot=live[victim].slot;live.RemoveAt(victim);}var s=pool.lights[slot];s.busy=true;s.go.SetActive(true);s.t.position=p;s.light.intensity=0;Add(new Live{k=K.Light,slot=slot,life=life,f0=intensity,f1=range,f2=attack,color=c,i1=pulseHz});}
  /// <summary>Spline-extruded tube (root snare, rewind ribbon) that grows along its length over `grow` seconds.</summary>
  void TubeFx(Vector3 a,Vector3 b,float radius,float life,float grow,bool mintRibbon,float lift=.3f,float wiggle=.12f){int slot=FxPool.Take(pool.tubes);if(slot<0)return;var s=pool.tubes[slot];s.mr.sharedMaterial=mintRibbon?pool.mint:pool.bark;s.t.position=Vector3.zero;s.t.rotation=Quaternion.identity;s.t.localScale=Vector3.one;
   var knots=new List<float3>();Vector3 side=Vector3.Cross((b-a).normalized,Vector3.up);if(side.sqrMagnitude<.01f)side=Vector3.right;for(int i=0;i<=5;i++){float t=i/5f;Vector3 p=Vector3.Lerp(a,b,t)+Vector3.up*(Mathf.Sin(t*Mathf.PI)*lift+.04f)+side*Mathf.Sin(t*Mathf.PI*2.3f+slot)*wiggle;knots.Add(new float3(p.x,p.y,p.z));}
   pool.tubeSplines[slot]=new Spline(knots,TangentMode.AutoSmooth,false);SplineMesh.Extrude(pool.tubeSplines[slot],pool.tubeMeshes[slot],radius,6,24,true,new float2(0,.02f));
   Add(new Live{k=K.Tube,slot=slot,life=life,f0=grow,f1=radius,f3=0});}
  void Delay(float seconds,Op op,Vector3 a,Vector3 b,Color c,float f=0,int i=0){Add(new Live{k=K.Delay,life=seconds,i0=(int)op,a=a,b=b,color=c,f0=f,i1=i});}
  void Loop(float life,float interval,Op op,Vector3 a,Vector3 b,Color c,float f=0,int i=0){Add(new Live{k=K.Loop,life=life,f1=interval,f3=0,i0=(int)op,a=a,b=b,color=c,f0=f,i1=i});}
  void Run(Op op,Vector3 a,Vector3 b,Color c,float f,int i,float t=0){switch(op){
   case Op.MortarFlash2:Flash(a,1.1f,.12f,new Color(1,.7f,.35f),FxSheet.Star4,R(0,360));break;
   case Op.MortarSmoke:Smoke(a,N(12),1.0f,1.6f,1.8f,new Color(.42f,.38f,.34f,.85f),.7f,.8f);break;
   case Op.BurnEmbers:Embers(a,N(i),.3f,.45f,new Color(1,.45f,.12f),1.2f,f);break;
   case Op.ChargeTick:{float grow=Mathf.Lerp(.5f,1.1f,t);Flash(a,grow*(.8f+.2f*Mathf.Sin(t*50)),.12f,new Color(c.r,c.g,c.b,.55f),FxSheet.GlowSoft);if(R(0,1)<.45f)BoltFx(a+UnityEngine.Random.insideUnitSphere*.3f,a+UnityEngine.Random.insideUnitSphere*.45f,.04f,.1f,new Color(.8f,.9f,1),.1f,0,false,0,2);break;}
   case Op.CrackleTick:BoltFx(a+Vector3.up*f+UnityEngine.Random.insideUnitSphere*.18f,G(a,.02f)+UnityEngine.Random.insideUnitSphere*.2f,.035f,.1f,c,.1f,0,false,0,2);break;
   case Op.ThunderBolt2:BoltFx(a+Vector3.up*4.5f,b,.09f,.14f,new Color(.9f,.95f,1),.3f,1,false,0,2.5f);break;
   case Op.ThunderAfter:Flash(a,.9f,.25f,new Color(.7f,.85f,1,.6f),FxSheet.GlowSoft);Motes(a,N(6),.12f,.6f,new Color(.7f,.85f,1,.7f),.5f,Vector3.up*.4f);break;
   case Op.MistPuff:Smoke(a+UnityEngine.Random.insideUnitSphere*1.2f,1,.9f,1.5f,3.5f,new Color(c.r,c.g,c.b,.3f),.12f,.3f);break;
   case Op.Fireworks:{Color[] tones={new Color(1,.85f,.35f),Color.white,new Color(.6f,1,.45f)};Vector3 p=a+new Vector3(R(-1.2f,1.2f),R(1.5f,2.6f),R(-.8f,.8f));Flash(p,1.3f,.2f,tones[i%3],FxSheet.Star6);Sparks(p,N(40),1.6f,3.2f,1.6f,tones[i%3],Vector3.zero,1,.11f);break;}
   case Op.SkyFlash:Flash(a+Vector3.up*4.6f,6,.08f,new Color(.75f,.85f,1,.35f),FxSheet.GlowSoft);break;
   case Op.PulseRing:RingFx(a,f*.9f,f,.5f,c,1,1.5f);break;
   case Op.ConductiveArc:for(int k=0;k<2;k++)BoltFx(a+Vector3.up*f+UnityEngine.Random.insideUnitSphere*.15f,G(a,.02f)+UnityEngine.Random.insideUnitSphere*.25f,.035f,.09f,c,.12f,0,false,0,2);break;
   case Op.BarkTick:{float ang=R(0,Mathf.PI*2);Vector3 d=new Vector3(Mathf.Cos(ang),0,Mathf.Sin(ang));debris.Frame(FxSheet.Bark);debris.Emit(a+d*.95f+Vector3.up*R(.1f,.9f),Vector3.Cross(d,Vector3.up)*1.8f+Vector3.up*.6f,R(.1f,.16f),.75f,new Color(.5f,.38f,.2f),R(0,360),R(-300,300));break;}
  }}
  public void Echo(GameObject actor,Vector3 from,Vector3 to,float duration){
   int group=-1;for(int g=0;g<2;g++)if(!pool.ghosts[g*3].busy){group=g;break;}if(group<0)return;
   var parts=new List<CombineInstance>();var baked=new List<Mesh>();
   foreach(var r in actor.GetComponentsInChildren<Renderer>()){
    if(!r.enabled||!r.gameObject.activeInHierarchy||r.name=="Contact shadow")continue;Mesh mesh=null;
    if(r is SkinnedMeshRenderer skin){mesh=new Mesh();skin.BakeMesh(mesh);baked.Add(mesh);}
    else{var filter=r.GetComponent<MeshFilter>();if(filter!=null)mesh=filter.sharedMesh;}
    if(mesh==null||!mesh.isReadable)continue;for(int i=0;i<mesh.subMeshCount;i++)parts.Add(new CombineInstance{mesh=mesh,subMeshIndex=i,transform=Matrix4x4.Translate(-from)*r.localToWorldMatrix});
   }
   if(parts.Count==0)return;
   if(ghostMeshes[group]!=null)Destroy(ghostMeshes[group]);var combined=new Mesh{name="Rewind silhouette",indexFormat=IndexFormat.UInt32};combined.CombineMeshes(parts.ToArray(),true,true);foreach(var m in baked)Destroy(m);ghostMeshes[group]=combined;
   for(int g=0;g<3;g++){var s=pool.ghosts[group*3+g];s.busy=true;s.go.SetActive(true);s.mf.sharedMesh=combined;s.t.position=from;s.t.rotation=Quaternion.identity;s.t.localScale=Vector3.one;}
   Add(new Live{k=K.Ghost,slot=group,life=Mathf.Clamp(duration,.5f,1.8f),a=from,b=to,color=new Color(.35f,.9f,.83f,.24f)});
  }
  // ---- recipes -----------------------------------------------------------------------------------------------
  public void Handle(CarrotEvent e){Color c=Tone(e.kind);switch(e.type){
   case "shot":Shot(e,c);break;
   case "impact":Impact(e,c);break;
   case "hit":{Vector3 p=e.position+Vector3.up*.3f;Flash(p,.32f,.08f,new Color(1,.95f,.85f,.9f),FxSheet.GlowHard);Sparks(p,N(3),1,2.2f,.22f,new Color(1,.85f,.5f));break;}
   case "heal":for(int i=0;i<N(6);i++)Glyph(e.position+new Vector3(R(-.25f,.25f),.3f+i*.08f,R(-.25f,.25f)),FxSheet.StarGlyph,.2f,.7f,new Color(.5f,1,.5f,.9f),Vector3.up*.6f);break;
   case "death":Death(e);break;
   case "build":{Vector3 p=e.position;Debris(G(p,.12f),N(8),FxSheet.Pebble,.08f,.14f,1,2.2f,.8f,Soil);Dust(G(p,.12f),N(10),.42f,.7f,new Color(Soil.r,Soil.g,Soil.b,.45f),.9f);RingFx(p,.3f,1.5f,.6f,Hot(new Color(.55f,1,.4f,.8f),1.6f),0,2);DecalFx(p,FxSheet.Crater,1.6f,6,new Color(Soil.r,Soil.g,Soil.b,.7f),true,1,.4f);CameraImpulse?.Invoke(p,.06f,2);break;}
   case "upgrade":{Vector3 p=e.position+Vector3.up*.5f;Sparks(p,N(18),1.2f,2.8f,.7f,new Color(1,.85f,.35f),Vector3.up,.8f,.12f);for(int i=0;i<3;i++)RingFx(e.position,.2f,1.1f+i*.18f,.6f+i*.12f,Hot(new Color(1,.85f,.4f,.9f),1.5f),i==1?1:0,2,false,.1f+i*.25f);Flash(p,1.4f,.12f,new Color(1,1,1,.9f),FxSheet.Star4);LightFx(p,4f+e.tier*.5f,2.6f,.3f,new Color(1,.85f,.45f));CameraImpulse?.Invoke(e.position,.08f,2);break;}
   case "sell":{Vector3 p=e.position+Vector3.up*.25f;for(int i=0;i<N(10);i++)Glyph(p,FxSheet.Coin,.2f,.7f,new Color(1,.85f,.35f),new Vector3(R(-1.2f,-.4f),R(1.2f,2.2f),R(-.3f,.3f)),R(-200,200));Dust(G(e.position,.1f),N(8),.4f,.6f,new Color(Soil.r,Soil.g,Soil.b,.4f),.8f);break;}
   case "clear":{Vector3 p=e.position+Vector3.up*.25f;Debris(p,N(14),e.kind=="root"?FxSheet.Bark:FxSheet.Pebble,.08f,.16f,1.2f,2.8f,.9f,e.kind=="root"?new Color(.5f,.42f,.2f):new Color(.6f,.6f,.55f));Dust(p,N(10),.45f,.8f,new Color(Soil.r,Soil.g,Soil.b,.45f),1);RingFx(e.position,.2f,1.1f,.5f,e.kind=="root"?Tone("root"):new Color(.9f,.8f,.5f,.8f));break;}
   case "carrotHit":{Vector3 p=e.position+Vector3.up*.6f;Debris(p,N(12),FxSheet.Leaf,.07f,.12f,1,2.2f,.8f,new Color(.45f,.8f,.3f));Flash(p,.9f,.12f,new Color(1,.5f,.2f,.9f),FxSheet.Star4);RingFx(e.position,.2f,1.1f,.4f,Hot(new Color(1,.3f,.12f,.9f),1.5f),1,2);DecalFx(e.position,FxSheet.Mud,.5f,.4f,new Color(.4f,.2f,.1f,.8f));CameraImpulse?.Invoke(e.position,.26f,4);break;}
   case "bossEnter":BossEnter(e,c);break;
   case "cinematic":Cinematic(e,c);break;
   case "telegraph":Telegraph(e,c);break;
   case "telegraphTarget":RingFx(e.to,.52f,.62f,Mathf.Max(.35f,e.duration),Hot(new Color(c.r,c.g,c.b,.9f),1.5f),0,.6f,true,.085f);Glyph(e.to+Vector3.up*1.2f,FxSheet.Chevron,.4f,Mathf.Max(.35f,e.duration),c,Vector3.down*.3f);break;
   case "abilityTarget":if(e.kind=="root")Ability(e,c);else if(e.kind=="breath"){RingFx(e.to,.2f,.8f,.65f,Tone("frost"),0,2);Motes(e.to+Vector3.up*.5f,N(12),.14f,.8f,new Color(.56f,.81f,1,.55f),.45f,Vector3.up*.3f,FxSheet.Flake,.3f);}break;
   case "ability":Ability(e,c);break;
   case "victory":{for(int i=0;i<3;i++)Delay(.2f+i*.4f,Op.Fireworks,e.position,Vector3.zero,Color.white,0,i);Debris(e.position+Vector3.up*2.4f,N(60),FxSheet.Petal,.08f,.13f,.2f,.8f,3,new Color(1,.75f,.85f),120);RingFx(e.position,.3f,2.6f,2,Hot(new Color(1,.86f,.4f,.9f),1.4f),2,2);LightFx(e.position+Vector3.up*1.2f,5f,5,2.5f,new Color(1,.85f,.5f),.3f);CameraImpulse?.Invoke(e.position,.08f,2);break;}
   case "defeat":RingFx(e.position,.3f,1.8f,1.2f,new Color(.46f,.53f,.72f,.9f),1,1.2f);Motes(e.position+Vector3.up*.4f,N(20),.12f,2,new Color(.5f,.5f,.55f,.6f),.3f,Vector3.up*.25f,FxSheet.GlowSoft,.5f);break;
   case "spawn":Dust(G(e.position,.1f),N(5),.35f,.6f,new Color(Soil.r,Soil.g,Soil.b,.4f),.6f);Debris(G(e.position,.2f),N(3),FxSheet.Leaf,.07f,.11f,.6f,1.4f,.8f,new Color(.5f,.75f,.3f));break;
   case "wave":RingFx(e.position,.2f,1.3f,.9f,Hot(new Color(1,.8f,.4f,.8f),1.4f),0,2);Motes(e.position+Vector3.up*.5f,N(6),.14f,1.2f,new Color(1,.85f,.5f,.8f),.4f,Vector3.up*.3f);break;
   case "coins":Glyph(e.position+Vector3.up*.9f,FxSheet.Coin,.26f,.8f,new Color(1,.85f,.35f),Vector3.up*.7f,180);break;
   case "bite":{Vector3 p=e.position+Vector3.up*.45f;Glyph(p+Vector3.left*.14f,FxSheet.Chevron,.2f,.3f,new Color(1,.9f,.8f,.9f),Vector3.right*.4f);Glyph(p+Vector3.right*.14f,FxSheet.Chevron,.2f,.3f,new Color(1,.9f,.8f,.9f),Vector3.left*.4f);break;}
   case "start":CameraImpulse?.Invoke(Vector3.zero,.05f,2);break;
  }}
  void Shot(CarrotEvent e,Color c){
   Vector3 from=e.position,to=e.to;int tier=Mathf.Clamp(e.tier,1,4);float life=Mathf.Clamp(e.duration,.08f,1.6f);
   switch(e.kind){
    case "prism":BoltFx(from,to,.05f,.2f,Color.white,0,0,true,0,2.5f);BoltFx(from,to,.3f,.2f,new Color(.82f,.63f,1,.75f),0,0,true,0,1.6f);Flash(from,.4f,.1f,new Color(.9f,.8f,1,.8f),FxSheet.Star4,R(0,360));break;
    case "storm":BoltFx(from,to,.12f,.24f,c,.16f,1,false,0,2.6f);Flash(to,.7f,.12f,new Color(.56f,.75f,1,.9f),FxSheet.Star6);Sparks(to,N(8),1.4f,2.8f,.3f,new Color(.7f,.85f,1));RingFx(to,.15f,.6f,.3f,Hot(c,1.6f),0,2);Flash(from,.35f,.1f,new Color(.7f,.85f,1,.8f),FxSheet.GlowHard);break;
    case "gravity":BoltFx(from,to,.06f,.25f,c,.05f,0,true,0,2.2f);Flash(from,.45f,.14f,new Color(.63f,.28f,1,.8f));break;
    case "thunder":if(!chargedAt.TryGetValue(e.id,out var last)||clock-last>.25f){chargedAt[e.id]=clock;Loop(life,.1f,Op.ChargeTick,from,from,c);}break;
    case "blossom":RingFx(from,.1f,1.6f+tier*.22f,.5f,Hot(new Color(c.r,c.g,c.b,.9f),1.6f),1,1.5f,false,.12f);Debris(from+Vector3.up*.3f,N(24),FxSheet.Petal,.1f,.15f,.6f,1.6f,.9f,new Color(1,.8f,.9f),300);Motes(from+Vector3.up*.4f,N(16),.12f,1.1f,new Color(1,.9f,.5f,.8f),.5f,Vector3.up*.4f,FxSheet.GlowSoft,.3f);DecalFx(from,FxSheet.Pollen,(1.6f+tier*.22f)*2,.8f,new Color(1,.9f,.5f,.6f));LightFx(from+Vector3.up*.5f,4f,3,.25f,new Color(1,.85f,.4f));break;
    case "mortar":Flash(from,.8f,.1f,new Color(1,.8f,.5f,.9f),FxSheet.Star4,R(0,360));Smoke(from,N(10),.6f,1.0f,1.2f,new Color(.55f,.5f,.45f,.7f),.5f,.6f);LightFx(from,4f,2.2f,.1f,new Color(1,.6f,.25f));ShellFx(e.kind,from,to,life,tier);break;
    case "frost":Motes(from,N(8),.3f,.6f,new Color(.75f,.9f,1,.5f),.35f,Vector3.up*.2f,FxSheet.GlowSoft,.2f);Flash(from,.4f,.1f,new Color(.6f,.9f,1,.8f),FxSheet.Flake,R(0,360));ShellFx(e.kind,from,to,life,tier);break;
    case "seed":Flash(from,.38f,.08f,new Color(1,.95f,.8f,.9f),FxSheet.GlowHard);Sparks(from,N(3),1.2f,2.4f,.2f,new Color(1,.8f,.4f),(to-from).normalized,.5f);Dust(from,1,.2f,.4f,new Color(.8f,.75f,.6f,.3f),.3f);ShellFx(e.kind,from,to,life,tier);break;
    case "book":Flash(from,.45f,.12f,new Color(.3f,1,.78f,.8f));ShellFx(e.kind,from,to,life,tier);break;
    case "starfruit":Flash(from,.45f,.1f,new Color(1,.85f,.4f,.9f),FxSheet.Star4);for(int i=0;i<N(5);i++)Glyph(from,FxSheet.StarGlyph,.16f,.4f,new Color(1,.85f,.4f,.9f),UnityEngine.Random.insideUnitSphere*1.5f,R(-300,300));ShellFx(e.kind,from,to,life,tier);break;
    default:ShellFx(e.kind,from,to,life,tier);break;
   }
  }
  void Impact(CarrotEvent e,Color c){
   Vector3 at=e.to==Vector3.zero?e.position:e.to;Vector3 body=at+Vector3.up*.28f;int tier=Mathf.Clamp(e.tier,1,4);
   switch(e.kind){
    case "seed":Flash(body,.6f,.1f,new Color(1,.95f,.8f,.95f),FxSheet.GlowHard);Flash(body,.9f,.08f,new Color(1,.8f,.4f,.5f),FxSheet.Star4,R(0,360));Sparks(body,N(8),2.5f,4,.3f,new Color(1,.75f,.3f));Debris(body,N(4),FxSheet.Husk,.08f,.12f,.8f,1.6f,.6f,new Color(.55f,.38f,.18f));Dust(G(at,.1f),N(3),.4f,.5f,new Color(.7f,.6f,.45f,.35f),.5f);Disc(at,.3f,.55f,.18f,new Color(1,.8f,.4f,.7f));if(tier>=3)RingFx(at,.1f,.6f,.22f,Hot(new Color(1,.8f,.4f,.9f),1.5f),0,2);break;
    case "frost":{Flash(body,.85f,.12f,new Color(.6f,.9f,1,.95f),FxSheet.Star6);Flash(body,.5f,.1f,new Color(.85f,.95f,1,.9f),FxSheet.GlowHard);Debris(body,N(10),FxSheet.Shard,.09f,.15f,1.5f,3,.7f,new Color(.8f,.95f,1),540);Motes(body,N(12),.16f,.9f,new Color(.85f,.95f,1,.85f),.6f,Vector3.up*.2f,FxSheet.Flake,.3f);RingFx(at,.15f,1.0f,.35f,Hot(c,1.7f),1,2);float radius=tier==1?.45f:tier==2?.6f:tier==3?.8f:1f;Disc(at,radius,radius*1.6f,.35f,new Color(.6f,.9f,1,.7f));DecalFx(at,FxSheet.Ice,radius*2.3f,2.6f,new Color(.85f,.95f,1,.9f),false,1,radius*.6f,false,.35f);if(tier>=2)LightFx(body,4f,2.4f,.14f,new Color(.55f,.8f,1));break;}
    case "mortar":{float radius=tier==1?.75f:tier==2?.9f:tier==3?1.05f:1.2f;Vector3 p=at+Vector3.up*.3f;Flash(p,1.7f,.14f,new Color(1,.85f,.5f),FxSheet.GlowHard);Flash(p+Vector3.up*.2f,1.2f,.2f,new Color(1,.6f,.2f,.9f),FxSheet.GlowSoft);Delay(.05f,Op.MortarFlash2,p,Vector3.zero,Color.white);Embers(p,N(8),.75f,.5f,new Color(1,.5f,.15f),1.6f,.35f);Delay(.1f,Op.MortarSmoke,at+Vector3.up*.35f,Vector3.zero,Color.white);Sparks(p,N(20),4,7,.5f,new Color(1,.7f,.3f),Vector3.zero,1,.13f);Debris(p,N(10),FxSheet.Pebble,.1f,.2f,2,5,.9f,Soil);RingFx(at,.3f,radius*1.7f,.4f,Hot(new Color(1,.8f,.5f,.9f),1.6f),2,1.5f);Disc(at,radius*.6f,radius*1.5f,.35f,new Color(1,.55f,.2f,.8f),2.2f);DecalFx(at,FxSheet.Scorch,radius*2.3f,4,new Color(.15f,.1f,.08f,.85f),true,1,radius);Loop(2,.1f,Op.BurnEmbers,G(at,.06f),Vector3.zero,Color.white,radius*.6f,1);LightFx(p,9f,3.6f,.22f,new Color(1,.55f,.2f),.04f);CameraImpulse?.Invoke(at,.2f,3);mortarAt=clock;mortarKills=0;break;}
    case "prism":Flash(body,.6f,.12f,new Color(.9f,.8f,1,.9f),FxSheet.Star4,R(0,360));for(int i=0;i<N(10);i++)Glyph(body,FxSheet.Star4,R(.08f,.15f),.5f,new Color(.9f,.75f,1,.9f),UnityEngine.Random.insideUnitSphere*1.2f,R(-400,400));for(int i=0;i<2;i++){Vector3 d=UnityEngine.Random.insideUnitSphere;d.y=Mathf.Abs(d.y)*.3f;BoltFx(body,body+d.normalized*.8f,.08f,.15f,new Color(.82f,.63f,1,.7f),0,0,true,0,2);}Disc(at,.3f,.6f,.2f,new Color(.82f,.63f,1,.6f));break;
    case "storm":Flash(body,.5f,.1f,new Color(.7f,.85f,1,.9f),FxSheet.Star6);Sparks(body,N(5),1.2f,2.4f,.25f,new Color(.7f,.85f,1));break;
    case "thunder":{Vector3 sky=at+Vector3.up*4.5f;Vector3 foot=at+Vector3.up*.2f;BoltFx(sky,foot,.22f,.28f,Color.white,.35f,3,false,0,2.5f);BoltFx(sky,foot,.7f,.42f,new Color(.56f,.75f,1,.75f),.35f,0,false,0,1.5f);Delay(.06f,Op.ThunderBolt2,at,foot,Color.white);Delay(.3f,Op.ThunderAfter,foot,Vector3.zero,Color.white);Flash(sky,6,.08f,new Color(.75f,.85f,1,.35f));Flash(at+Vector3.up*.2f,1.6f,.14f,new Color(.8f,.9f,1,.95f),FxSheet.Star6);Flash(at+Vector3.up*.2f,1.1f,.3f,new Color(.7f,.85f,1,.8f),FxSheet.GlowSoft);RingFx(at,.5f,2.4f,.35f,Hot(new Color(.7f,.85f,1,.9f),1.8f),2,1.5f);Disc(at,.6f,1.6f,.5f,new Color(.7f,.85f,1,.85f),2.4f);Sparks(body,N(10),3,6,.4f,new Color(.8f,.9f,1),Vector3.zero,1,.13f);Debris(body,N(12),FxSheet.Pebble,.09f,.17f,2,4.5f,.9f,Soil);DecalFx(at,FxSheet.Crack,1.7f,2.5f,new Color(.1f,.1f,.12f,.9f),true);Dust(G(at,.1f),N(8),.5f,.9f,new Color(.37f,.4f,.45f,.5f),.55f);LightFx(at+Vector3.up*.5f,14,5,.16f,new Color(.75f,.85f,1),.01f,12);CameraImpulse?.Invoke(at,.14f,2);HitStop?.Invoke(.06f,1,0);break;}
    case "blossom":Sparks(body,N(4),.8f,1.6f,.4f,new Color(.6f,1,.4f),Vector3.up,.8f);Flash(body,.4f,.1f,new Color(.7f,1,.5f,.8f),FxSheet.GlowSoft);break;
    case "starfruit":Flash(body,.55f,.1f,new Color(1,.85f,.4f,.9f),FxSheet.Star4);for(int i=0;i<N(5);i++)Glyph(body,FxSheet.StarGlyph,.16f,.4f,new Color(1,.85f,.4f,.9f),UnityEngine.Random.insideUnitSphere*1.4f,R(-300,300));break;
    case "book":Flash(body,.55f,.12f,new Color(.3f,1,.78f,.9f));Debris(body,N(6),FxSheet.Page,.12f,.2f,.4f,1.1f,.9f,new Color(.9f,1,.95f),240);break;
    case "gravity":Flash(body,.5f,.12f,new Color(.63f,.28f,1,.8f));break;
    default:Flash(body,.45f,.1f,c);Sparks(body,N(4),1,2,.25f,c);break;
   }
  }
  void Death(CarrotEvent e){
   Vector3 p=e.position+Vector3.up*.3f;if(clock-mortarAt<.12f){mortarKills++;if(mortarKills==2)HitStop?.Invoke(.045f,1,0);}
   Flash(p,.7f,.1f,new Color(1,1,1,.85f),FxSheet.GlowSoft);
   int cell=FxSheet.Leaf;Color tone=new Color(.55f,.8f,.3f);
   switch(e.kind){case "nibble":case "shaman":cell=FxSheet.Acorn;tone=new Color(.85f,.45f,.35f);break;case "shell":cell=FxSheet.Acorn;tone=new Color(.55f,.4f,.2f);break;case "swarm":cell=FxSheet.Pebble;tone=new Color(.4f,.85f,.5f);break;case "moth":cell=FxSheet.Petal;tone=new Color(.9f,.85f,.6f);break;case "burrow":cell=FxSheet.Husk;tone=new Color(.6f,.45f,.3f);break;case "crystal":case "fragment":cell=FxSheet.Shard;tone=new Color(.75f,.92f,1);break;}
   if(cell==FxSheet.Shard){Debris(p,N(12),FxSheet.Shard,.09f,.16f,1.5f,3.2f,.8f,tone,540);RingFx(e.position,.1f,.9f,.4f,Hot(Tone("frost"),1.5f),1,2);}
   else Debris(p,N(14),cell,.08f,.14f,1,2.4f,.9f,tone,300);
   if(e.value>0)Glyph(p+Vector3.up*.2f,FxSheet.Coin,.26f,.75f,new Color(1,.85f,.35f),Vector3.up*.85f,160);
   RingFx(e.position,.1f,.75f,.5f,new Color(Soil.r,Soil.g,Soil.b,.6f),1,1.5f);Dust(G(e.position,.1f),N(6),.4f,.7f,new Color(Soil.r,Soil.g,Soil.b,.4f),.6f);
  }
  void BossEnter(CarrotEvent e,Color c){
   Vector3 p=e.position;Dust(G(p,.16f),N(60),1.1f,2.4f,new Color(.43f,.42f,.38f,.7f),1.1f);Debris(p+Vector3.up*.3f,N(10),FxSheet.Pebble,.12f,.22f,1.5f,3.5f,1.1f,Soil);DecalFx(p,FxSheet.Crack,3f,4,new Color(.12f,.1f,.08f,.85f),true);Debris(p+Vector3.up*.5f,N(30),e.kind=="frost"?FxSheet.Shard:e.kind=="marsh"?FxSheet.Leaf:FxSheet.Bark,.09f,.16f,1.5f,3,1.2f,e.kind=="frost"?new Color(.8f,.95f,1):e.kind=="marsh"?new Color(.3f,.7f,.5f):new Color(.5f,.4f,.22f));
   Delay(.35f,Op.PulseRing,p,Vector3.zero,Hot(new Color(c.r,c.g,c.b,.9f),1.5f),3.5f);RingFx(p,.2f,4f,.6f,Hot(new Color(c.r,c.g,c.b,.9f),1.8f),2,1.5f);Disc(p,.5f,3f,.5f,new Color(c.r,c.g,c.b,.8f),2);LightFx(p+Vector3.up*1.2f,8,7,1.2f,c,.05f);
   CameraImpulse?.Invoke(p,.48f,3);HitStop?.Invoke(0,.35f,CarrotQuality.High?1f:.6f);
  }
  void Cinematic(CarrotEvent e,Color c){
   Vector3 p=e.position;
   if(e.kind=="bossDust"){Dust(G(p,.16f),N(60),1.1f,2.4f,new Color(.43f,.42f,.38f,.7f),1.1f);Debris(p+Vector3.up*.3f,N(10),FxSheet.Pebble,.12f,.22f,1.5f,3.5f,1.1f,Soil);DecalFx(p,FxSheet.Crack,3f,4,new Color(.12f,.1f,.08f,.85f),true);Debris(p+Vector3.up*.5f,N(30),FxSheet.Bark,.09f,.16f,1.5f,3,1.2f,new Color(.5f,.4f,.22f));Disc(p,.4f,2.6f,.5f,new Color(c.r,c.g,c.b,.75f),1.8f);}
   else if(e.kind=="bossRoar"){CameraImpulse?.Invoke(p,.48f,3);HitStop?.Invoke(0,.35f,CarrotQuality.High?1f:.6f);RingFx(p,.2f,2.2f,.5f,Hot(new Color(c.r,c.g,c.b,.9f),1.6f),1,1.5f,false,.9f);Motes(p+Vector3.up*1.2f,N(18),.16f,1.1f,new Color(c.r,c.g,c.b,.8f),1.2f,Vector3.up*.5f,FxSheet.GlowSoft,.5f);}
   else if(e.kind=="bossRing"){RingFx(p,.2f,4f,.6f,Hot(new Color(c.r,c.g,c.b,.9f),1.8f),2,1.5f);Disc(p,.5f,3f,.55f,new Color(c.r,c.g,c.b,.8f),2);LightFx(p+Vector3.up*1.2f,8,7,1.2f,c,.05f);}
  }
  void Telegraph(CarrotEvent e,Color c){
   float duration=Mathf.Max(.6f,e.duration);
   RingFx(e.position,e.kind=="breath"?1.5f:1.1f,e.kind=="breath"?1.5f:1.1f,duration,Hot(new Color(c.r,c.g,c.b,.8f),1.6f),1,.5f,true,.06f);
   Motes(e.position+Vector3.up*.7f,N(13),.2f,duration,new Color(c.r,c.g,c.b,.6f),.3f,Vector3.up*.3f,FxSheet.GlowSoft,.4f);
   if(e.to!=Vector3.zero&&Vector3.Distance(e.position,e.to)>.2f){Vector3 d=(e.to-e.position);int steps=Mathf.Clamp(Mathf.RoundToInt(d.magnitude/.8f),1,5);for(int i=1;i<=steps;i++)Glyph(e.position+d*(i/(float)(steps+1))+Vector3.up*.12f,FxSheet.Chevron,.4f,duration,new Color(c.r,c.g,c.b,.7f),Vector3.zero);}
   if(e.kind=="root"||e.kind=="breath")Handle(new CarrotEvent("telegraphTarget",e.kind,e.position,e.to,e.id,e.target,e.tier,e.value,e.duration));
  }
  void Ability(CarrotEvent e,Color c){switch(e.kind){
   case "gravity":{Vector3 p=e.position;float duration=Mathf.Max(.6f,e.duration),radius=Mathf.Max(.8f,e.value);Flash(p+Vector3.up*.3f,.5f,duration,new Color(.1f,.02f,.2f,.95f),FxSheet.GlowHard);RingFx(p,1.4f,.2f,.6f,Hot(new Color(.63f,.28f,1,.9f),1.6f),1,1.5f);DecalFx(p,FxSheet.Void,radius*2.2f,1.2f,new Color(.35f,.15f,.6f,.9f),false,1,radius*1.4f);LightFx(p+Vector3.up*.3f,4f,2.6f,1.2f,new Color(.63f,.28f,1),.05f,3);
    debris.Frame(FxSheet.Leaf);for(int i=0;i<N(12);i++){Vector3 d=UnityEngine.Random.insideUnitSphere;d.y=0;d=d.normalized*radius;Vector3 start=p+d+Vector3.up*R(.05f,.3f);debris.Emit(start,-d*2,R(.08f,.13f),.55f,new Color(.5f,.6f,.3f),R(0,360),R(-300,300));}
    Motes(p+Vector3.up*.3f,N(14),.16f,duration,new Color(.7f,.4f,1,.7f),.4f,Vector3.zero,FxSheet.GlowSoft,radius*.6f);break;}
   case "rewind":{Color m=new Color(.6f,.98f,.9f);TubeFx(e.position+Vector3.up*.5f,e.to+Vector3.up*.5f,.04f,Mathf.Max(.6f,e.duration),.35f,true,.5f,.08f);RingFx(e.position,.1f,.6f,.6f,m,0,2);Glyph(e.position+Vector3.up*.9f,FxSheet.Clock,.55f,1,m,Vector3.up*.1f,-360);Motes(e.position+Vector3.up*.4f,N(9),.14f,.9f,m,.35f,Vector3.up*.3f,FxSheet.GlowSoft,.3f);break;}
   case "seedBurst":RingFx(e.position,.1f,.9f,.35f,Hot(Tone("seed"),1.5f),0,2);Sparks(e.position+Vector3.up*.3f,N(10),1.5f,3,.3f,new Color(1,.8f,.4f));Debris(e.position+Vector3.up*.3f,N(7),FxSheet.Husk,.08f,.12f,1,2,.6f,new Color(.55f,.38f,.18f));break;
   case "crystallize":case "shieldBreak":{Vector3 p=e.position+Vector3.up*.35f;Flash(p,.8f,.12f,new Color(.7f,.9f,1,.9f),FxSheet.Star6);Debris(p,N(8),FxSheet.Shard,.09f,.15f,1.2f,2.6f,.7f,new Color(.8f,.95f,1),540);RingFx(e.position,.1f,.7f,.45f,Hot(Tone("frost"),1.5f),1,2);DecalFx(e.position,FxSheet.FrostWeb,1.4f,Mathf.Max(.8f,e.duration),new Color(.85f,.95f,1,.8f),false,1,0,false,.3f);break;}
   case "burn":Loop(Mathf.Max(.6f,e.duration),1f/26,Op.BurnEmbers,G(e.position,.06f),Vector3.zero,Color.white,Mathf.Max(.3f,e.value)*.5f,1);DecalFx(e.position,FxSheet.Scorch,Mathf.Max(.5f,e.value)*2.2f,Mathf.Max(.6f,e.duration)+1,new Color(.15f,.1f,.08f,.6f),true);break;
   case "prismFocus":BoltFx(e.position+Vector3.up*1.1f,e.to+Vector3.up*.4f,.3f+Mathf.Clamp01(e.value)*.2f,.25f,new Color(.82f,.63f,1,.75f),0,0,true,0,1.6f);BoltFx(e.position+Vector3.up*1.1f,e.to+Vector3.up*.4f,.06f,.25f,Color.white,0,0,true,0,2.5f);break;
   case "conductive":Loop(Mathf.Min(2.5f,e.duration),.08f,Op.ConductiveArc,e.position,Vector3.zero,new Color(.6f,.8f,1,.8f),.6f);RingFx(e.position,.2f,.45f,.4f,new Color(.44f,.73f,1,.6f),0,2);break;
   case "blossomBuff":RingFx(e.position,.3f,2.6f,1.2f,Hot(new Color(1,.78f,.32f,.6f),1.4f),0,1.5f);Motes(e.position+Vector3.up*.5f,N(12),.16f,1.1f,new Color(1,.81f,.42f,.8f),.4f,Vector3.up*.5f,FxSheet.GlowSoft,.4f);break;
   case "phase":{Vector3 p=e.position+Vector3.up*.8f;RingFx(e.position,.2f,2f,.8f,Hot(new Color(1,.63f,.24f,.9f),1.6f),2,1.5f);Flash(p,2.2f,.18f,new Color(1,1,1,.95f),FxSheet.Star6);Debris(p,N(20),FxSheet.Bark,.09f,.16f,1.5f,3.2f,1,new Color(.5f,.4f,.25f));Disc(e.position,.5f,2,.4f,new Color(1,.63f,.24f,.8f),2);CameraImpulse?.Invoke(e.position,.22f,3);HitStop?.Invoke(.09f,1,0);break;}
   case "burrow":case "emerge":DecalFx(e.position,FxSheet.Mud,1.6f,1.2f,new Color(Soil.r*.7f,Soil.g*.7f,Soil.b*.7f,.85f),true);Debris(G(e.position,.12f),N(10),FxSheet.Pebble,.09f,.16f,1.2f,2.8f,.8f,Soil);RingFx(e.position,.1f,.9f,.5f,new Color(Soil.r,Soil.g,Soil.b,.7f),1,1.5f);Dust(G(e.position,.1f),N(8),.45f,.7f,new Color(Soil.r,Soil.g,Soil.b,.45f),.7f);break;
   case "root":{Vector3 end=e.to==Vector3.zero?e.position:e.to;float duration=Mathf.Clamp(e.duration,.8f,3.5f);for(int v=0;v<2;v++)TubeFx(e.position+Vector3.up*.05f+Vector3.right*(v-.5f)*.3f,end+Vector3.up*.05f,.07f,duration,.45f,false,.35f+v*.15f,.14f);Debris(G(e.position,.12f),N(6),FxSheet.Pebble,.08f,.14f,1,2,.7f,Soil);Debris(end+Vector3.up*.2f,N(8),FxSheet.Leaf,.08f,.13f,.8f,1.8f,.9f,new Color(.45f,.8f,.3f));DecalFx(end,FxSheet.Pollen,1.4f,duration,new Color(.5f,.9f,.3f,.7f));RingFx(end,.1f,.8f,.5f,Hot(c,1.5f),0,2);break;}
   case "mist":Loop(1.2f,.04f,Op.MistPuff,e.position+Vector3.up*.5f,Vector3.zero,new Color(.3f,.86f,.78f));RingFx(e.position,.3f,2f,1.2f,Hot(c,1.4f),1,1.5f);Motes(e.position+Vector3.up*.6f,N(6),.14f,3,new Color(.75f,1,.5f,.9f),.3f,Vector3.zero,FxSheet.GlowSoft,1);break;
   case "summon":for(int i=0;i<3;i++){Vector3 p=e.position+new Vector3((i-1)*.65f,0,.3f);DecalFx(p,FxSheet.Pollen,1.1f,1.4f,new Color(.3f,1,.78f,.8f),false,1,0,false,1);BoltFx(p+Vector3.up*.02f,p+Vector3.up*1.8f,.22f,.45f,new Color(.3f,1,.78f,.7f),0,0,true,0,1.8f);Glyph(p+Vector3.up*.6f,FxSheet.Note,.3f,1,c,Vector3.up*.5f,60);Motes(p+Vector3.up*.2f,N(8),.14f,1,c,.5f,Vector3.up*.6f);}break;
   case "breath":{Vector3 d=(e.to-e.position);if(d.sqrMagnitude<.1f)d=Vector3.forward;d.y=0;d.Normalize();Vector3 p=e.position+Vector3.up*1.4f;Sparks(p,N(70),2.4f,3.6f,1.2f,new Color(.75f,.9f,1,.8f),d,.3f,.22f);Motes(p,N(24),.2f,1.3f,new Color(.6f,.85f,1,.6f),1.2f,d*2.5f,FxSheet.Flake,.3f);DecalFx(e.to,FxSheet.FrostWeb,2.4f,.9f,new Color(.85f,.95f,1,.8f),false,1,0,false,.3f);RingFx(e.to,.2f,1.3f,.7f,Hot(c,1.5f),1,2);break;}
   case "mantle":for(int i=0;i<3;i++)RingFx(e.position,.75f,.75f,1.7f,Hot(c,1.5f),0,1,true,i*.4f+.15f);Motes(e.position+Vector3.up*.9f,N(25),.16f,1.5f,c,.5f,Vector3.zero,FxSheet.Flake,.7f);Flash(e.position+Vector3.up*.9f,1.6f,.3f,new Color(.6f,.85f,1,.6f),FxSheet.Flake);break;
   case "shatter":{Vector3 p=e.position+Vector3.up*1.1f;Debris(p,N(60),FxSheet.Shard,.09f,.18f,2,4.5f,1.3f,new Color(.8f,.95f,1),600);Flash(p,2f,.14f,new Color(.85f,.95f,1,.95f),FxSheet.Star6);RingFx(e.position,.3f,2.6f,.6f,Hot(c,1.7f),2,1.5f);Disc(e.position,.5f,2.2f,.4f,new Color(.6f,.9f,1,.8f),2);LightFx(p,8,5,.3f,c,.02f);CameraImpulse?.Invoke(e.position,.32f,3);HitStop?.Invoke(.06f,1,0);break;}
   // Bark: a whirl of chips orbits the boss for the whole armour window with three pulsing rings; the view tints the boss bark-orange meanwhile.
   case "bark":{float duration=Mathf.Max(1,e.duration);Debris(e.position+Vector3.up*.8f,N(22),FxSheet.Bark,.09f,.16f,1.5f,3.2f,1.1f,new Color(.5f,.38f,.2f),400);RingFx(e.position,.3f,2.4f,.6f,Hot(new Color(.75f,.5f,.25f,.85f),1.5f),2,1.5f);for(int i=0;i<3;i++)RingFx(e.position,.9f,.9f,duration,Hot(new Color(c.r,c.g,c.b,.6f),1.4f),0,1,true,i*.35f+.2f);Loop(duration,.12f,Op.BarkTick,e.position,Vector3.zero,c);break;}
   case "heal":RingFx(e.position,.3f,1.8f,.7f,Hot(Tone("blossom"),1.4f),0,2);for(int i=0;i<N(6);i++)Glyph(e.position+new Vector3(R(-.3f,.3f),.5f,R(-.3f,.3f)),FxSheet.StarGlyph,.22f,.8f,new Color(.5f,1,.5f,.9f),Vector3.up*.5f);break;
   default:RingFx(e.position,.2f,1.2f,.7f,Hot(c,1.4f),0,2);break;
  }}
 }
}
