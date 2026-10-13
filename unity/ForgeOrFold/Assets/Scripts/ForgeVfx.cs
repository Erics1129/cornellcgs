using System.Collections.Generic;
using UnityEngine;
using UnityEngine.Rendering;

// Owner: hot-metal-vfx. Strike particles as a CPU particle batcher: every live particle is one quad of a
// single dynamic mesh per material (lit scale/chips, additive sparks/embers), expanded to camera-facing
// billboards in the vertex shader with a minimum on-screen size and a short velocity streak. No
// GameObject per particle, no TrailRenderer (the laser-trail bug is gone with them), no ParticleSystem
// (keeps the stripped wasm small). Collisions are plane tests (anvil face, stump, bench, hearth top, floor).
// Burst(at, count, type) and Puff(at, count, hot) are frozen signatures: other streams call them.
public partial class ForgeWorld {
 const byte KFlake=1,KSheet=2,KChip=3,KSpark=4,KFork=5,KEmber=6,KGlint=7,KBubble=8,KRing=9,KDust=10;
 struct Bit { public Vector3 p,v; public float age,life,size,temp,thick,seed,spin,dark,intensity,drag,bounce; public byte kind; public bool landed,rest,sfx,onBlade; public Color32 albedo; }
 const int MaxBits=256;
 readonly Bit[] bits=new Bit[MaxBits]; int bitCount;
 /// Flake-land sfx: send times of the last flakeLandSfxPerS sounds (a sliding one-second window).
 readonly float[] flakeSfxTimes=new float[16];int flakeSfxNext;float fxClock;
 /// What the last ImpactFx threw (QA probe): outcome, flakes, sheets, chips, sparks.
 string lastBurstOutcome="";int lastBurstFlakes,lastBurstSheets,lastBurstChips,lastBurstSparks,lastBurstId,landN,nearN;
 /// Where the last strike's debris came from (StrikeOrigin), and the shatter's break point.
 Vector3 fxOrigin;
 /// Particle materials. particleGold/Iron/Ash/Hot stay for any caller of the old names; the batches use litMaterial and addMaterial.
 Material particleGold,particleIron,particleAsh,particleHot,sparkTrail,litMaterial,addMaterial;
 class Batch { public GameObject go; public Mesh mesh; public MeshRenderer renderer; public int capacity, used; public readonly List<Vector3> v=new List<Vector3>(); public readonly List<Vector4> a=new List<Vector4>(),b=new List<Vector4>(),c=new List<Vector4>(),d=new List<Vector4>(); public readonly List<Color32> col=new List<Color32>(); }
 Batch litBatch,addBatch;
 void MakeVfxMaterials(){
  particleGold=Mat("Golden impact","fbc987",.75f,.7f);particleIron=Mat("Metal shards","9ba5ac",.9f,.6f);particleAsh=Mat("Dust","878778",0,.1f);particleHot=Mat("White orange embers","ffc680",.45f,.6f);
  foreach(var m in new[]{particleGold,particleHot}){m.EnableKeyword("_EMISSION");m.SetColor("_EmissionColor",m.color*2);}
  // Both particle shaders must be in ForgeBuild's always-included list. If one is missing from a player build the
  // particles fall back to an always-included shader and draw nothing (the quads are collapsed), instead of throwing.
  var lit=Shader.Find(ForgeContract.Shaders.ParticleLit);var add=Shader.Find(ForgeContract.Shaders.ParticleAdd);var safe=Shader.Find(ForgeContract.Shaders.Spark)??Shader.Find(ForgeContract.Shaders.Glow);
  if(lit==null||add==null)Debug.LogWarning("Forge: particle shader missing from the build (add Forge/ParticleLit and Forge/ParticleAdd to ForgeBuild's always-included list)");
  litMaterial=new Material(lit??add??safe){name="Hammer scale"};addMaterial=new Material(add??safe){name="Burning sparks"};
  addMaterial.SetFloat("_Billboard",1);addMaterial.SetFloat("_Intensity",1);addMaterial.SetColor("_Color",Color.white);addMaterial.SetFloat("_Soft",.6f);
  sparkTrail=addMaterial;
 }
 Batch MakeBatch(string name,Material m,int capacity,int queue){
  var go=new GameObject(name);if(dynamicRoot!=null)go.transform.SetParent(dynamicRoot,false);var mesh=new Mesh{name=name};mesh.MarkDynamic();
  var b=new Batch{go=go,mesh=mesh,capacity=capacity};
  for(int i=0;i<capacity*4;i++){b.v.Add(Vector3.zero);b.a.Add(Vector4.zero);b.b.Add(Vector4.zero);b.c.Add(Vector4.zero);b.d.Add(Vector4.zero);b.col.Add(new Color32(0,0,0,0));}
  var idx=new int[capacity*6];for(int q=0;q<capacity;q++){idx[q*6]=q*4;idx[q*6+1]=q*4+2;idx[q*6+2]=q*4+1;idx[q*6+3]=q*4+1;idx[q*6+4]=q*4+2;idx[q*6+5]=q*4+3;}
  mesh.SetVertices(b.v);mesh.SetUVs(0,b.a);mesh.SetUVs(1,b.b);mesh.SetUVs(2,b.c);mesh.SetUVs(3,b.d);mesh.SetColors(b.col);mesh.SetTriangles(idx,0,false);mesh.bounds=new Bounds(new Vector3(0,1.5f,-1),new Vector3(14,6,12));
  go.AddComponent<MeshFilter>().sharedMesh=mesh;b.renderer=go.AddComponent<MeshRenderer>();b.renderer.sharedMaterial=m;b.renderer.shadowCastingMode=ShadowCastingMode.Off;b.renderer.receiveShadows=false;b.renderer.lightProbeUsage=LightProbeUsage.Off;b.renderer.reflectionProbeUsage=ReflectionProbeUsage.Off;
  m.renderQueue=queue;b.renderer.enabled=false;return b;
 }
 int ParticleCap=>(int)(QualityTier>=2?tuning.metal.capTier2:tuning.metal.capDesktop);
 float ParticleScale=>view.Phone||QualityTier>=2?tuning.metal.phoneScale:1;
 static readonly Color32 Oxide=new Color32(43,44,46,255),ColdChip=new Color32(92,94,96,255),Water=new Color32(196,206,210,255);

 /// Spawn one particle; false when the cap is reached.
 bool Spawn(byte kind,Vector3 p,Vector3 v,float size,float temp,float thick,float life,Color32 albedo,float intensity=1){
  if(bitCount>=MaxBits||bitCount+shards.Count>=ParticleCap)return false;
  bits[bitCount++]=new Bit{kind=kind,p=p,v=v,size=size,temp=temp,thick=thick,life=life,albedo=albedo,intensity=intensity,seed=Random.value,spin=Random.Range(6.3f,15.7f)*(Random.value<.5f?-1:1),drag=kind==KSheet?tuning.metal.sheetDrag:kind==KSpark||kind==KFork?tuning.metal.sparkDrag:kind==KEmber?1.2f:kind==KGlint?2:tuning.metal.flakeDrag,bounce=kind==KChip?tuning.metal.chipBounce:tuning.metal.flakeBounce,dark=-1};
  return true;
 }
 /// Frozen entry point. type: good | perfect | chip | dull | shatter | evolution (strike debris around `at`),
 /// ember (hearth embers), coin-dust (gold glints), coin (legacy: gold glints). A lone legacy 'good' ember call
 /// (count 1, the hearth's UpdateAtmosphere) is treated as an ember.
 void Burst(Vector3 at,int count,string type){
  if(type=="good"&&count==1&&Vector3.Distance(at,lastContact)>.6f)type="ember";
  var t=tuning.metal;
  switch(type){
   case "ember":for(int i=0;i<count;i++)Spawn(KEmber,at+Random.insideUnitSphere*.05f,new Vector3(Random.Range(-.08f,.08f),Random.Range(.25f,.6f),Random.Range(-.08f,.08f)),Random.Range(.0015f,.003f),900,0,Random.Range(1.1f,2.2f),Oxide,Random.Range(1.5f,3.2f));return;
   case "coin":case "coin-dust":for(int i=0;i<count;i++)Spawn(KGlint,at+Random.insideUnitSphere*.04f,Random.insideUnitSphere*.5f+Vector3.up*.6f,Random.Range(.002f,.004f),0,0,Random.Range(.5f,1.1f),Oxide,Random.Range(1.2f,2.4f));return;
   default:{bool burning=type=="perfect"||type=="evolution"||type=="shatter";Debris(at,type,count,burning?count/6:0,0,0,type=="perfect"?t.perfectMaxSpeed:t.flakeMaxSpeed,KnifeTemperatureAt(at));return;}
  }
 }
 /// Temperature (C) of the anvil knife near a point (its body value), 20 when there is none.
 float KnifeTemperatureAt(Vector3 at){foreach(var b in bodies.Values)if(b.knife.place=="anvil")return KnifeTemperature(b);return 20;}
 /// Camera right in the horizontal plane (flakes leave across the view, not along it).
 Vector3 AcrossView(){if(cam==null)return Vector3.right;var r=cam.transform.right;r.y=0;return r.sqrMagnitude>1e-4f?r.normalized:Vector3.right;}
 /// Scale flakes, sheets, sparks and chips from a contact at blade temperature tempC.
 void Debris(Vector3 at,string type,int flakes,int sparks,int sheets,int chips,float maxSpeed,float tempC){
  var t=tuning.metal;var right=AcrossView();var fwd=Vector3.Cross(right,Vector3.up);
  for(int i=0;i<flakes;i++){
   float az=Random.value<t.acrossViewBias?(Random.value<.5f?0:180)+Random.Range(-35f,35f):Random.Range(0,360f);float el=Random.Range(t.elevMinDeg,t.elevMaxDeg)*Mathf.Deg2Rad;
   var dir=Quaternion.AngleAxis(az,Vector3.up)*right;float speed=Mathf.Lerp(t.flakeMinSpeed,maxSpeed,Mathf.Pow(Random.value,t.speedSkew));
   var v=(dir*Mathf.Cos(el)+Vector3.up*Mathf.Sin(el))*speed;float r=Random.value,thick=r<t.flakeThinShare?t.flakeThinMm:r<t.flakeThinShare+t.flakeMidShare?t.flakeMidMm:t.flakeThickMm;
   var p=at+dir*Random.Range(.004f,.015f)+Vector3.up*.004f;
   if(!Spawn(KFlake,p,v,Random.Range(t.flakeMinMm,t.flakeMaxMm)*.001f,tempC,thick,30,Oxide))break;
  }
  for(int i=0;i<sheets;i++){
   var dir=Quaternion.AngleAxis(Random.Range(0,360f),Vector3.up)*right;float el=Random.Range(15f,50f)*Mathf.Deg2Rad;var v=(dir*Mathf.Cos(el)+Vector3.up*Mathf.Sin(el))*Random.Range(1f,2.6f);
   if(!Spawn(KSheet,at+dir*.01f+Vector3.up*.005f,v,Random.Range(t.sheetMinMm,t.sheetMaxMm)*.001f,tempC,Random.Range(.12f,.3f),30,Oxide))break;
  }
  for(int i=0;i<chips;i++){
   var dir=Quaternion.AngleAxis(Random.Range(-60f,60f)+(Random.value<.5f?0:180),Vector3.up)*right;var v=(dir*.8f+Vector3.up*Random.Range(.3f,.9f)-fwd*.3f).normalized*Random.Range(1.4f,3f);
   Spawn(KChip,at+dir*.01f,v,Random.Range(t.chipMinMm,t.chipMaxMm)*.001f,tempC,t.chipThickMm,30,ColdChip);
  }
  for(int i=0;i<sparks;i++){
   var dir=Random.onUnitSphere;dir.y=Mathf.Abs(dir.y)*.8f+.15f;dir.Normalize();
   Spawn(KSpark,at+Vector3.up*.006f,dir*Random.Range(t.sparkSpeedMin,t.sparkSpeedMax),Random.Range(.0012f,.0022f),1700,0,Random.Range(t.sparkLifeMin,t.sparkLifeMax),Oxide,t.sparkIntensity+Random.Range(-t.sparkIntensityJitter,t.sparkIntensityJitter));
  }
 }
 /// Where a strike's scale comes from: the struck knife's top surface under the hammer. The contact is projected onto
 /// the blade when it lands within 8 cm of the outline (the hammer face is wider than a bar's end), so flakes, the
 /// footprint and the dimple always sit on the metal. u, v: normalized blade coordinates of that point.
 Vector3 StrikeOrigin(Body b,Vector3 contact,out float u,out float v)=>StrikeOrigin(b.heatState.shape,b.blade.transform.localToWorldMatrix,contact,out u,out v);
 Vector3 StrikeOrigin(ForgeBladeShape shape,Matrix4x4 toWorld,Vector3 contact,out float u,out float v){
  var local=toWorld.inverse.MultiplyPoint3x4(contact);shape.Locate(local.x,local.z,out u,out v);
  bool inside=shape.Inside(local.x,local.z);if(!inside){u=Mathf.Clamp(u,.04f,.96f);v=Mathf.Clamp(v,.15f,.85f);}
  float st=u*(ForgeBladeShape.S-1);float x=local.x,z=local.z;if(!inside)shape.Point(st,v,out x,out z);
  var top=toWorld.MultiplyPoint3x4(new Vector3(x,shape.Thickness(st,v,tuning.metal)*.5f/KnifeUnitMm,z));
  return inside||Vector3.Distance(new Vector3(top.x,contact.y,top.z),contact)<.08f?top:contact;
 }
 /// Contact-frame effects for a hit. b is null when the knife is gone (Shatter).
 void ImpactFx(ForgeEvent e,Body b,Vector3 contact){
  var t=tuning.metal;string o=e.outcome;float s=ParticleScale;float tempC=b!=null?KnifeTemperature(b):breakTempC;
  float u=.5f,v=.5f;bool onBlade=b!=null&&b.heatState!=null&&b.blade!=null;
  // QA 'metal-strikepoint': strike where the integrated layout will (ForgeLayout.StrikePoint relative to KnifeAnvilRoot),
  // whatever this checkout's hammer does, so snapshots show footprints, notches and debris where players will see them.
  if(QaOn("metal-strikepoint")){var knife=onBlade?b:null;if(knife==null)foreach(var kb in bodies.Values)if(kb.knife.place=="anvil")knife=kb;var root=knife!=null?knife.root.transform.position:breakToWorld.MultiplyPoint3x4(Vector3.zero);contact=root+(ForgeLayout.StrikePoint-ForgeLayout.KnifeAnvilRoot);}
  var origin=onBlade?StrikeOrigin(b,contact,out u,out v):contact;
  // Shatter: the body is gone, BreakBlade kept its outline and pose; launch the pieces away from the real contact.
  if(!onBlade&&o=="shatter"&&breakShape!=null&&shards.Count>0&&shardAge<=0){origin=StrikeOrigin(breakShape,breakToWorld,contact,out u,out v);LaunchShards(origin);}
  fxOrigin=origin;
  int flakes=0,sparks=0,sheets=0,chips=0;float speed=t.flakeMaxSpeed;
  switch(o){
   case "good":flakes=Mathf.RoundToInt(t.flakesGood+Random.Range(-t.flakesGoodJitter,t.flakesGoodJitter));sparks=Random.value<t.sparksGood?1:0;break;
   case "perfect":flakes=(int)t.flakesPerfect;sheets=(int)t.sheetsPerfect;sparks=(int)t.sparksPerfect;speed=t.perfectMaxSpeed;break;
   case "chip":flakes=(int)t.flakesChip;chips=(int)t.chipsChip;break;
   case "shatter":flakes=(int)t.flakesShatter;sparks=(int)t.sparksShatter;break;
  }
  if(e.evolution){flakes=0;sheets=0;sparks=0;}   // EvolutionFx (called right after) throws the evolution burst
  flakes=Mathf.RoundToInt(flakes*s);sheets=Mathf.RoundToInt(sheets*s);sparks=Mathf.RoundToInt(sparks*s);
  if(reduced){flakes=o=="dull"?0:(int)t.flakesReduced;sheets=0;sparks=0;chips=Mathf.Min(chips,2);}
  Debris(origin,o,flakes,sparks,sheets,chips,speed,tempC);
  lastBurstOutcome=o;lastBurstFlakes=flakes;lastBurstSheets=sheets;lastBurstChips=chips;lastBurstSparks=sparks;lastBurstId++;landN=nearN=0;
  if(o=="dull")Puff(origin,6,false);
  if(!onBlade)return;
  // Marks on the blade, in normalized blade coordinates under the hammer.
  var h=b.heatState;u=Mathf.Clamp(u,.06f,.94f);
  float gain=o=="perfect"?t.footprintFlashGain*1.3f:o=="dull"?t.footprintFlashGain*.4f:t.footprintFlashGain;
  h.hits[h.hitNext]=new Vector4(u,v,0,gain);h.hitNext=(h.hitNext+1)%h.hits.Length;
  float dimple=o=="perfect"?t.dimplePerfectMm:o=="good"?t.dimpleGoodMm:o=="chip"?t.dimpleChipMm:t.dimpleDullMm;
  h.marks[h.markNext]=new Vector4(u,v,t.dimpleRadiusCm*Random.Range(.85f,1.15f),dimple);h.markNext=(h.markNext+1)%h.marks.Length;
  float spread=o=="perfect"?t.spreadPerfectMm:o=="good"?t.spreadGoodMm:o=="dull"?t.spreadDullMm:0;
  if(spread>0){h.shape.AddSpread(u,spread,t);h.dirty=true;}
  if(o=="chip"){h.shape.notchU=u;h.dirty=true;}
  if(o=="perfect"){h.model.OxideAge=0;h.flashAge=0;h.flashDur=t.perfectFlashMs/1000;h.flashGain=t.perfectFlashGain;}
  ApplyHeatUniforms(b);   // the footprint flash shows on the contact frame; the outline edit is rebuilt once in KnifeVisual
 }
 /// A level gain crossed an evolution stage: a 2 cm lift with a glint sweep, scale and burning sparks.
 void EvolutionFx(Body b){
  var t=tuning.metal;b.evolution=1.5f;if(b.heatState!=null){b.heatState.glint=0;b.heatState.model.OxideAge=0;}
  var at=b.heatState!=null?b.blade.transform.TransformPoint(b.heatState.mesh.bounds.center):b.root.transform.position;
  float s=ParticleScale;int flakes=Mathf.RoundToInt(t.flakesEvolution*s),sparks=Mathf.RoundToInt(t.sparksEvolution*s);
  if(reduced){flakes=(int)t.flakesReduced;sparks=0;}
  Debris(fxOrigin!=Vector3.zero&&Vector3.Distance(fxOrigin,at)<.4f?fxOrigin:at,"evolution",flakes,sparks,0,0,t.perfectMaxSpeed,KnifeTemperature(b));
 }
 /// Called on every Sync for each knife: risk = next-hit shatter probability (anvil knife), else 0.
 /// Hairline cracks near the edge and tip grow with smoothstep(crackLow, crackHigh, risk).
 void TensionFx(Body b,float risk){if(b.heatState==null)return;var t=tuning.metal;b.heatState.crackTarget=ForgeHeatMath.Smooth(t.crackLow,t.crackHigh,risk);}
 /// Called by Sync when snapshot.day changes: nothing glows overnight.
 void DayFx(int day){foreach(var b in bodies.Values)if(b.heatState!=null){b.heatState.model.Reset(20);b.heatState.model.OxideAge=0;}bitCount=0;}
 /// Live particles plus shards.
 int FxParticleCount()=>bitCount+shards.Count;

 /// Particle physics, cooling, sfx and the two batch meshes. Also the per-frame metal globals.
 void UpdateFragments(float dt){
  float w=WorldDt(dt);var t=tuning.metal;
  MetalGlobals();UpdateSwatch();MetalProbe(dt);
  fxClock+=w;
  float faceY=ForgeLayout.AnvilTopY;landKnife=null;foreach(var b in bodies.Values)if(b.knife.place=="anvil"){faceY=b.root.transform.position.y-.006f;landKnife=b;break;}
  if(landKnife!=null&&(landKnife.bladeRenderer==null||landKnife.heatState==null))landKnife=null;
  if(landKnife!=null){landBlade=landKnife.bladeRenderer.bounds;landBladeId=landKnife.knife.id;}else landBladeId=-1;
  for(int i=bitCount-1;i>=0;i--){
   ref var p=ref bits[i];p.age+=w;bool dead=false;
   switch(p.kind){
    case KFlake:case KSheet:case KChip:{
     var prev=p.p;p.v.y-=9.81f*w;p.v*=Mathf.Exp(-p.drag*(p.kind==KSheet?1:1+p.v.magnitude/Mathf.Max(.5f,t.flakeVt))*w);if(p.kind==KSheet)p.v+=new Vector3(Mathf.Sin(p.age*9+p.seed*20),0,Mathf.Cos(p.age*7+p.seed*13))*.9f*w;
     // A flake resting on the blade falls off when the knife leaves the anvil.
     if(p.rest&&p.onBlade&&(landBladeId<0||p.p.y>landBlade.max.y+.003f||!InXZ(landBlade,p.p))){p.rest=false;p.onBlade=false;}
     if(!p.rest)p.p+=p.v*w;else p.v=Vector3.zero;
     if(!p.rest&&Land(ref p,prev,faceY)){if(!p.sfx){p.sfx=true;landN++;if(new Vector2(p.p.x-fxOrigin.x,p.p.z-fxOrigin.z).magnitude<1)nearN++;if(p.kind==KChip)Send("sfx",0,ForgeContract.Sfx.ChipLand,p.v.magnitude+1,p.temp);else if(FlakeSfxAllowed()){Send("sfx",0,ForgeContract.Sfx.FlakeLand,p.v.magnitude,p.temp);}}}
     if(p.temp>25)p.temp=ForgeHeatMath.FlakeStep(p.temp,w,p.thick);
     if(p.dark<0&&p.temp<(p.kind==KChip?500:t.flakeDarkC))p.dark=p.age;
     if(p.dark>=0&&p.age-p.dark>t.flakeRestS+t.flakeFadeS&&(p.rest||p.p.y<.01f||p.age>8))dead=true;
     if(p.p.y<-.5f||p.age>12)dead=true;break;}
    case KSpark:case KFork:{
     var prev=p.p;p.v.y-=9.81f*.6f*w;p.v*=Mathf.Exp(-p.drag*w);p.p+=p.v*w;Land(ref p,prev,faceY);
     if(p.age>=p.life){dead=true;if(p.kind==KSpark&&!reduced){int n=Random.Range((int)t.sparkForkMin,(int)t.sparkForkMax+1);var at=p.p;var v0=p.v;float inten=p.intensity;for(int f=0;f<n;f++)Spawn(KFork,at,Vector3.Lerp(v0*.6f,Random.onUnitSphere*v0.magnitude*.6f,.55f),p.size*.8f,1700,0,Random.Range(t.sparkForkLifeMin,t.sparkForkLifeMax),Oxide,inten*.8f);}}
     break;}
    case KEmber:{p.v+=new Vector3(Mathf.Sin(p.age*3+p.seed*9)*.12f,.25f,Mathf.Cos(p.age*2.3f+p.seed*7)*.08f)*w;p.v*=Mathf.Exp(-p.drag*w);p.p+=p.v*w;if(p.age>=p.life)dead=true;break;}
    case KGlint:{p.v.y-=2.5f*w;p.v*=Mathf.Exp(-p.drag*w);p.p+=p.v*w;if(p.age>=p.life)dead=true;break;}
    case KBubble:{p.p+=p.v*w;p.v*=Mathf.Exp(-3*w);if(p.age>=p.life)dead=true;break;}
    case KRing:{p.size+=w*.09f;if(p.age>=p.life)dead=true;break;}
    default:dead=true;break;
   }
   if(dead){bits[i]=bits[--bitCount];}
  }
  UpdateShards(w);UpdateCoins(w);
  DrawBits();
 }
 /// At most flakeLandSfxPerS flake-land sounds in any one-second window.
 bool FlakeSfxAllowed(){int n=Mathf.Clamp((int)tuning.metal.flakeLandSfxPerS,0,flakeSfxTimes.Length),recent=0;foreach(var at in flakeSfxTimes)if(at>0&&fxClock-at<1)recent++;if(recent>=n)return false;flakeSfxTimes[flakeSfxNext]=fxClock>0?fxClock:1e-4f;flakeSfxNext=(flakeSfxNext+1)%flakeSfxTimes.Length;return true;}
 /// Plane collisions (anvil face at faceY, stump, bench, hearth top, floor). True on a landing this frame.
 bool Land(ref Bit p,Vector3 prev,float faceY){
  float y;if(!Floor(p.p,prev,faceY,out y))return false;
  p.p.y=y+.0005f;var t=tuning.metal;p.onBlade=landBladeId>=0&&y>faceY+.0005f&&y<=landBlade.max.y+.0001f&&InXZ(landBlade,p.p);
  if(Mathf.Abs(p.v.y)<.35f||p.kind==KSpark||p.kind==KFork){p.v.y=0;var hv=new Vector3(p.v.x,0,p.v.z)*(1-t.flakeFriction);p.v=hv;if(hv.magnitude<.08f||p.kind==KSpark||p.kind==KFork)p.rest=p.kind!=KSpark&&p.kind!=KFork;}
  else{p.v.y=-p.v.y*p.bounce;p.v.x*=1-t.flakeFriction*.5f;p.v.z*=1-t.flakeFriction*.5f;}
  bool first=!p.landed;p.landed=true;return first;
 }
 Body landKnife;Bounds landBlade;int landBladeId=-1;
 static bool InXZ(Bounds b,Vector3 p)=>p.x>=b.min.x&&p.x<=b.max.x&&p.z>=b.min.z&&p.z<=b.max.z;
 /// The highest collision plane crossed between prev and p (y out). Planes: the top of the knife on the anvil (inside
 /// its outline), ForgeLayout stations (anvil face at faceY, stump, bench, hearth top) and the floor.
 bool Floor(Vector3 p,Vector3 prev,float faceY,out float y){
  y=0;float best=float.MinValue;
  void Try(float h,bool inside){if(inside&&prev.y>=h-.002f&&p.y<h&&h>best)best=h;}
  if(landBladeId>=0){float top=landBlade.max.y-.0008f;if(prev.y>=top-.002f&&p.y<top&&InXZ(landBlade,p)&&OnBlade(p))best=top;}
  var face=ForgeLayoutData.AnvilFace;Try(faceY,p.x>face.x0-.01f&&p.x<face.x1+.01f&&p.z>face.z0-.01f&&p.z<face.z1+.01f);
  var c=ForgeLayout.AnvilCenter;Try(ForgeLayoutData.StumpTopY,(new Vector2(p.x-c.x,p.z-c.z)).magnitude<ForgeLayoutData.StumpRadius);
  var bench=ForgeLayoutData.Bench;Try(ForgeLayoutData.BenchTopY,p.x>bench.x0&&p.x<bench.x1&&p.z>bench.z0&&p.z<bench.z1);
  var hearth=ForgeLayoutData.HearthFootprint;Try(ForgeLayoutData.HearthBoxCenter.y+ForgeLayoutData.HearthBoxSize.y*.5f,p.x>hearth.x0&&p.x<hearth.x1&&p.z>hearth.z0&&p.z<hearth.z1);
  Try(0,true);
  if(best==float.MinValue)return false;y=best;return true;
 }
 /// Is a world point over the anvil knife's blade outline (not just its bounding box)?
 bool OnBlade(Vector3 p){var b=landKnife;if(b==null)return false;var l=b.blade.transform.InverseTransformPoint(p);return b.heatState.shape.Inside(l.x,l.z);}
 /// Fill the lit and additive batches from the live particles.
 void DrawBits(){
  if(litBatch==null){litBatch=MakeBatch("Hammer scale batch",litMaterial,MaxBits,3010);addBatch=MakeBatch("Spark batch",addMaterial,MaxBits,3020);}
  var t=tuning.metal;int nl=0,na=0;float time=Time.time;
  for(int i=0;i<bitCount;i++){
   ref var p=ref bits[i];
   switch(p.kind){
    case KFlake:case KSheet:case KChip:case KBubble:case KRing:{
     float facing=p.kind==KChip||p.rest?.85f:.35f+.65f*Mathf.Abs(Mathf.Cos(p.age*p.spin+p.seed*6.283f));
     float er,eg,eb;if(p.kind==KBubble||p.kind==KRing){er=eg=eb=0;}else{ForgeHeatMath.Emission(p.temp,t,out er,out eg,out eb);float k=p.kind==KChip?1:facing;er*=k;eg*=k;eb*=k;}
     float alpha=p.kind==KRing?Mathf.Clamp01(1-p.age/p.life)*.6f:p.kind==KBubble?.75f:1;
     if(p.dark>=0){float fade=Mathf.Clamp01((p.age-p.dark-t.flakeRestS)/Mathf.Max(.01f,t.flakeFadeS));alpha*=1-fade;}
     float stretch=p.landed||p.kind==KRing||p.kind==KBubble?0:.011f*Mathf.Max(0,1-p.age/Mathf.Max(.001f,t.flakeStretchMs/1000));
     float shape=p.kind==KSheet||p.kind==KChip?1:p.kind==KRing?2:0;
     Quad(litBatch,nl++,p.p,p.size,facing,p.v,stretch,er,eg,eb,alpha,shape,p.kind==KRing?1:0,p.seed,p.kind==KRing||p.kind==KBubble?0:t.flakeMinPx,p.kind==KChip&&p.temp<500?ColdChip:p.albedo);break;}
    default:{
     float fade=Mathf.Clamp01(1-p.age/Mathf.Max(.01f,p.life));float r,g,b;
     if(p.kind==KEmber){float fl=.65f+.35f*Mathf.Sin(time*23+p.seed*40);r=1;g=.32f;b=.05f;float k=p.intensity*fl*Mathf.Sqrt(fade)*Mathf.Min(1,p.age*4);r*=k;g*=k;b*=k;}
     else if(p.kind==KGlint){float tw=.5f+.5f*Mathf.Abs(Mathf.Sin(time*18+p.seed*30));r=1;g=.78f;b=.38f;float k=p.intensity*tw*fade;r*=k;g*=k;b*=k;}
     else{float k=p.intensity*Mathf.Sqrt(fade);r=1*k;g=.3f*k;b=.03f*k;}
     float stretch=p.kind==KSpark||p.kind==KFork?Mathf.Min(t.sparkStretchS,t.sparkMaxStreakCm*.01f/Mathf.Max(.01f,p.v.magnitude)):0;
     Quad(addBatch,na++,p.p,p.size,1,p.v,stretch,r,g,b,1,0,0,p.seed,t.sparkMinPx,p.albedo);break;}
   }
  }
  Flush(litBatch,nl);Flush(addBatch,na);
 }
 static readonly Vector2[] Corners={new Vector2(-1,-1),new Vector2(1,-1),new Vector2(-1,1),new Vector2(1,1)};
 static void Quad(Batch b,int q,Vector3 p,float size,float facing,Vector3 v,float stretch,float r,float g,float bl,float alpha,float shape,float flat,float seed,float minPx,Color32 albedo){
  if(q>=b.capacity)return;
  for(int k=0;k<4;k++){int i=q*4+k;b.v[i]=p;b.a[i]=new Vector4(Corners[k].x,Corners[k].y,size,facing);b.b[i]=new Vector4(v.x,v.y,v.z,stretch);b.c[i]=new Vector4(r,g,bl,alpha);b.d[i]=new Vector4(shape,flat,seed,minPx);b.col[i]=albedo;}
 }
 static void Flush(Batch b,int n){
  for(int q=n;q<b.used;q++)for(int k=0;k<4;k++){int i=q*4+k;b.a[i]=Vector4.zero;b.c[i]=Vector4.zero;b.d[i]=Vector4.zero;}
  bool any=n>0||b.used>0;b.used=n;b.renderer.enabled=n>0;if(!any)return;
  // Fixed, generous bounds (set in MakeBatch): billboards extend past their centres, so never recompute them.
  const MeshUpdateFlags keep=MeshUpdateFlags.DontRecalculateBounds|MeshUpdateFlags.DontValidateIndices|MeshUpdateFlags.DontNotifyMeshUsers;int count=b.v.Count;
  b.mesh.SetVertices(b.v,0,count,keep);b.mesh.SetUVs(0,b.a,0,count,keep);b.mesh.SetUVs(1,b.b,0,count,keep);b.mesh.SetUVs(2,b.c,0,count,keep);b.mesh.SetUVs(3,b.d,0,count,keep);b.mesh.SetColors(b.col,0,count,keep);
 }
 /// Quench: a steam plume from the blade, rings and bubbles on the slack-tub surface.
 void QuenchFx(Vector3 blade,float tempC){
  var t=tuning.metal;if(tempC<120)return;float strength=Mathf.Clamp01((tempC-100)/700);
  var tub=ForgeLayout.SlackTub;var surface=new Vector3(blade.x,tub.y-.012f,blade.z);if(new Vector2(blade.x-tub.x,blade.z-tub.z).magnitude>.35f)surface=new Vector3(tub.x,tub.y-.012f,tub.z);
  SteamPuff(surface+Vector3.up*.01f,Mathf.RoundToInt(t.steamPuffs*Mathf.Lerp(.4f,1,strength)),t.steamS);
  for(int i=0;i<t.quenchRings;i++)Spawn(KRing,surface+new Vector3(Random.Range(-.04f,.04f),0,Random.Range(-.03f,.03f)),Vector3.zero,.02f+i*.012f,0,0,.6f+i*.25f,Water);
  int bubbles=Mathf.RoundToInt(t.quenchBubbles*strength);for(int i=0;i<bubbles;i++)Spawn(KBubble,surface+new Vector3(Random.Range(-.06f,.06f),.002f,Random.Range(-.05f,.05f)),new Vector3(0,Random.Range(.02f,.08f),0),Random.Range(.002f,.005f),0,0,Random.Range(.25f,.9f),Water);
 }
}
