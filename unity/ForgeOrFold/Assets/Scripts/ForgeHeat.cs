using System.Collections.Generic;
using UnityEngine;

// Owner: hot-metal-vfx. Presentation-only knife temperature and the per-frame knife look. Nothing here
// sends engine actions: rules, odds and saves never see these temperatures.
public partial class ForgeWorld {
 /// Per-knife state, stored on Body.heatState. It survives KnifeRefresh (mesh rebuilds in place).
 class HeatState {
  public readonly ForgeHeatModel model=new ForgeHeatModel();
  public readonly ForgeBladeShape shape=new ForgeBladeShape();
  public Mesh mesh; public float[] px=new float[0],pz=new float[0];
  /// dirty: a strike edited the outline (spread, notch); rebuild: the level or place class changed (KnifeRefresh).
  /// Both are applied once, in KnifeVisual, so a strike that also levels up rebuilds the mesh only once.
  public bool finished,dirty,rebuild,logicalFurnace,firstHeat=true; public int level; public BoxCollider collider;
  public float furnaceFor,baseY,liftU,crackSeed;
  // Footprints (u, v, age s, flash gain), dimples (u, v, radius cm, depth mm), whole-blade flash, glint, cracks.
  public readonly Vector4[] hits=new Vector4[4]; public int hitNext;
  public readonly Vector4[] marks=new Vector4[8]; public int markNext;
  public float flashAge=10,flashDur=.32f,flashGain,glint=-1,crack,crackTarget;
  public HeatState(){for(int i=0;i<4;i++)hits[i]=new Vector4(0,0,99,0);for(int i=0;i<8;i++)marks[i]=new Vector4(0,0,0,0);}
 }
 static readonly int HeatA=Shader.PropertyToID("_HeatA"),HeatB=Shader.PropertyToID("_HeatB"),HeatC=Shader.PropertyToID("_HeatC"),OxideId=Shader.PropertyToID("_Oxide"),HitsId=Shader.PropertyToID("_Hits"),MarksId=Shader.PropertyToID("_Marks"),CrackId=Shader.PropertyToID("_Crack"),FlashId=Shader.PropertyToID("_Flash"),GlintId=Shader.PropertyToID("_Glint"),EmissionId=Shader.PropertyToID("_EmissionColor"),DissolveId=Shader.PropertyToID("_Dissolve"),CrackFlashId=Shader.PropertyToID("_CrackFlash"),NotchId=Shader.PropertyToID("_Notch"),SurfaceId=Shader.PropertyToID("_Surface"),EmitId=Shader.PropertyToID("_Emit"),ChromaId=Shader.PropertyToID("_Chroma"),BladeDimsId=Shader.PropertyToID("_BladeDims"),ShardId=Shader.PropertyToID("_Shard");
 static readonly float[] ua=new float[4],ub=new float[4],uc=new float[4];
 /// World-effect delta time: follows Time.timeScale (slow-mo and hit-stop freezes) whatever clock Update passes.
 float WorldDt(float dt)=>Mathf.Min(dt,Time.deltaTime);

 /// Per-frame knife look: temperature, heating in the coals, cooling, oxide, footprints, cracks, evolution lift.
 void KnifeVisual(Body b,float dt){
  var h=b.heatState;if(h==null)return;var t=tuning.metal;float w=WorldDt(dt);var k=b.knife;
  if(h.rebuild){BuildKnifeMesh(b,k);KnifeLook(b,k);}else if(h.dirty)KnifeMeshIfDirty(b);
  // Heating needs the knife in the coals: near its furnace target or inside the firebed box, or long enough logically there.
  bool inFurnace=h.logicalFurnace&&k.place=="furnace";if(inFurnace)h.furnaceFor+=w;else h.furnaceFor=0;
  bool physical=false;if(inFurnace){var p=b.root.transform.position;var fb=ForgeLayout.Firebed;physical=Vector3.Distance(p,b.target)<.16f||(Mathf.Abs(p.x-fb.x)<t.coalsHalfX&&Mathf.Abs(p.z-fb.z)<t.coalsHalfZ&&p.y<fb.y+t.coalsAbove&&p.y>fb.y-.2f);}
  bool inCoals=inFurnace&&(physical||h.furnaceFor>=t.coalsFallbackS);
  // Rack, crate (and anything finished) cool fast but continuously to room temperature.
  if(!inFurnace&&(k.place=="rack"||k.place=="crate"))h.model.CoolTo(t.rackToC,t.rackCoolS,t.rackLeadS,t);
  h.model.Step(w,inCoals,k.place=="anvil",t.Pull(k.metal),h.firstHeat,t);
  if(inCoals&&!h.model.Easing&&h.model.BodyC(t)>=t.Pull(k.metal)-1)h.firstHeat=false;
  b.heat=Mathf.Clamp01(h.model.BodyC(t)/1150);
  // Evolution: lift the blade child 2 cm and back (never b.root), with a capped emission lift and a glint sweep.
  b.evolution=Mathf.Max(0,b.evolution-w);float lift=b.evolution>0?Mathf.Sin(b.evolution/1.5f*Mathf.PI):0;
  h.liftU=lift*t.evolutionLiftCm*10/KnifeUnitMm;b.blade.transform.localPosition=new Vector3(0,h.baseY+h.liftU,0);
  if(h.glint>=0){h.glint+=w/Mathf.Max(.05f,t.glintS);if(h.glint>1.4f)h.glint=-1;}
  // Footprints age; cracks ease toward the risk target; the Perfect flash decays.
  for(int i=0;i<4;i++){var v=h.hits[i];v.z+=w;h.hits[i]=v;}
  h.crack=Mathf.MoveTowards(h.crack,h.crackTarget,w/Mathf.Max(.05f,t.crackEaseS));
  h.flashAge+=w;
  ApplyHeatUniforms(b);
  if(k.level>=15&&UnityEngine.Random.value<w*6)Burst(b.blade.transform.TransformPoint(h.mesh.bounds.center),1,"ember");
 }
 void ApplyHeatUniforms(Body b){
  var h=b.heatState;var t=tuning.metal;var m=b.metal;var k=b.knife;
  h.model.Uniforms(t,ua,ub,uc);m.SetVector(HeatA,new Vector4(ua[0],ua[1],ua[2],ua[3]));m.SetVector(HeatB,new Vector4(ub[0],ub[1],ub[2],ub[3]));m.SetVector(HeatC,new Vector4(uc[0],uc[1],uc[2],uc[3]));
  m.SetVector(OxideId,new Vector4(h.model.Oxide(t),t.oxideDim,t.oxideGrowS,t.footprintRadiusCm));
  m.SetVectorArray(HitsId,h.hits);m.SetVectorArray(MarksId,h.marks);
  m.SetVector(CrackId,new Vector4(h.crack,t.crackGlow,t.crackPerM,t.crackDarkAboveC));
  var sh=h.shape;m.SetVector(NotchId,sh.notchU>=0?new Vector4(sh.U(sh.Station(sh.notchU)),t.notchWidthCm*.5f/Mathf.Max(1,sh.BladeLengthCm),t.notchDepthMm*.1f/Mathf.Max(.5f,sh.BladeWidthCm),1):Vector4.zero);
  float flash=h.flashAge<h.flashDur?(1-h.flashAge/h.flashDur)*h.flashGain:0;
  m.SetVector(FlashId,new Vector4(flash,t.footprintFlashMs/1000,t.footprintFlashGain,0));
  m.SetFloat(GlintId,h.glint);
  float lift=b.evolution>0?Mathf.Sin(b.evolution/1.5f*Mathf.PI):0;
  m.SetColor(EmissionId,Color.white*Mathf.Min(lift,t.evolutionEmissionCap)*.5f+(k.flow>0?new Color(.03f,.10f,.12f):Color.black));
  MetalConstants(m);
 }
 /// Tuning-derived constants of the hot-steel surface and emission (a Tune can arrive after the knives exist).
 void MetalConstants(Material m){var t=tuning.metal;m.SetVector(SurfaceId,new Vector4(t.surfaceFromC,t.surfaceToC,t.hotMetallic,t.hotSmoothness));m.SetVector(EmitId,new Vector4(t.emissionScale,t.emissionK,t.emissionCap,t.whiteMix));m.SetVector(ChromaId,new Vector4(t.chromaStart,t.chromaSlope,1/Mathf.Max(.1f,t.oxideCellCm),t.oxideGapGlow));}
 /// The engine heat event arrived for this knife.
 void KnifeHeated(Body b){var h=b.heatState;if(h==null)return;h.model.Heated(tuning.metal.Pull(b.knife.metal),tuning.metal);h.firstHeat=false;}
 /// The knife's logical place entered (true) or left (false) the furnace. Sync calls it on place changes;
 /// the hearth choreography may call it again at the visual moment, so it is idempotent.
 void KnifeInCoals(Body b,bool inCoals){var h=b.heatState;if(h==null)return;if(inCoals&&!h.logicalFurnace){h.furnaceFor=0;h.firstHeat=!b.knife.heated;if(QaOn("metal-firebed")){b.root.transform.position=b.target;b.velocity=Vector3.zero;}}h.logicalFurnace=inCoals;}
 /// The knife was plunged into the slack tub (keep choreography): 60 C over .8 s, thin parts first, with a steam
 /// plume and a disturbed water surface. The caller sends the quench sfx.
 void KnifeQuench(Body b){
  var h=b.heatState;if(h==null)return;var t=tuning.metal;float c=h.model.MaxC(t);
  h.model.CoolTo(t.quenchToC,t.quenchS,t.quenchLeadS,t);
  QuenchFx(b.blade.transform.TransformPoint(h.mesh.bounds.center),c);
 }
 /// Body temperature in degrees C (the 3 mm body value).
 float KnifeTemperature(Body b)=>b!=null&&b.heatState!=null?b.heatState.model.BodyC(tuning.metal):0;

 // ---- Light and haze outputs for the hottest anvil or carried knife ----
 void MetalGlobals(){
  var t=tuning.metal;Body hot=null;float best=0;
  foreach(var b in bodies.Values){if(b.heatState==null)continue;if(b.knife.place!="anvil"&&carriedId!=b.knife.id)continue;float c=b.heatState.model.MaxC(t);if(c>best){best=c;hot=b;}}
  if(hot==null||best<t.glowMinC){Shader.SetGlobalVector(ForgeContract.Globals.GlowPos,Vector4.zero);Shader.SetGlobalVector(ForgeContract.Globals.GlowColor,Vector4.zero);Shader.SetGlobalVector(ForgeContract.Globals.HazeA,Vector4.zero);return;}
  // The lamp sits glowLiftCm above the blade centre: a point at the centre of a blade lying flat on the face would light
  // the anvil only at grazing incidence, while the real glow on the face comes from the blade's hot sides and its sheen.
  float body=hot.heatState.model.BodyC(t);var mid=hot.blade.transform.TransformPoint(hot.heatState.mesh.bounds.center);var centre=mid+Vector3.up*t.glowLiftCm*.01f;
  ForgeHeatMath.GlowLamp(body,t,out var r,out var g,out var bl);
  Shader.SetGlobalVector(ForgeContract.Globals.GlowPos,new Vector4(centre.x,centre.y,centre.z,body>=t.glowMinC?t.glowRangeM:0));Shader.SetGlobalVector(ForgeContract.Globals.GlowColor,new Vector4(r,g,bl,0));
  if(reduced||cam==null){Shader.SetGlobalVector(ForgeContract.Globals.HazeA,Vector4.zero);return;}
  var vp=cam.WorldToViewportPoint(mid);var ends=hot.heatState.mesh.bounds;var a=cam.WorldToViewportPoint(hot.blade.transform.TransformPoint(ends.min));var z=cam.WorldToViewportPoint(hot.blade.transform.TransformPoint(ends.max));
  float len=new Vector2(z.x-a.x,(z.y-a.y)*cam.pixelHeight/Mathf.Max(1,cam.pixelWidth)).magnitude;
  Shader.SetGlobalVector(ForgeContract.Globals.HazeA,vp.z>0?new Vector4(vp.x,vp.y,t.hazeRadius*len,ForgeHeatMath.Haze(body,t)):Vector4.zero);
 }

 // ---- QA ----
 GameObject swatchRoot;
 /// Qa('swatch'): seven plates of oxide-free hot steel at 600-1200 C at fixed viewport spots in front of the camera,
 /// lit by the room, for calibrating E(T) through the real pipeline (scripts/forge-qa/metal.mjs). Other metal QA modes:
 /// 'metal-quench' quenches the hottest knife now, 'metal-cold' sets every knife to 20 C.
 void MetalQa(string mode){
  if(mode==ForgeContract.QaModes.Swatch)MakeSwatch();
  if(mode=="metal-quench"){Body hot=null;float best=-1;foreach(var b in bodies.Values){float c=KnifeTemperature(b);if(c>best){best=c;hot=b;}}if(hot!=null)KnifeQuench(hot);}
  if(mode=="metal-cold")foreach(var b in bodies.Values)b.heatState?.model.Reset(20);
  if(mode=="metal-hot")foreach(var b in bodies.Values)if(b.knife.place=="anvil")b.heatState?.model.Reset(tuning.metal.Pull(b.knife.metal));
  // 'metal-c1150' / 'metal-c500': the anvil knife at exactly that temperature (blade-light check).
  if(mode=="metal-c1150"||mode=="metal-c500")foreach(var b in bodies.Values)if(b.knife.place=="anvil"&&b.heatState!=null){b.heatState.model.Reset(mode=="metal-c1150"?1150:500);b.heatState.model.OxideAge=0;}
  if(mode=="metal-swatch-off"&&swatchRoot!=null){Destroy(swatchRoot);swatchRoot=null;}
  // 'metal-debug-1' / '-2' / '-3': Blade.shader shows its albedo, its reflected light or its emission only; '-0' is normal.
  if(mode.StartsWith("metal-debug-")&&int.TryParse(mode.Substring(12),out var dbg)){Shader.SetGlobalFloat("_ForgeMetalDebug",dbg);qaModes.Remove(mode);}
  // 'metal-firebed': QA only. Heat at ForgeLayout.Firebed (where the integrated hearth puts the coals) and snap the
  // knife into the coals the moment it is placed, so heating colour is timed from the placement and stays in view.
  if(mode=="metal-firebed"&&spots.ContainsKey("furnace"))spots["furnace"]=ForgeLayout.Firebed+new Vector3(.2f,.03f,.05f);
  // This stream's one-shot modes may be sent again later (other streams' modes stay set).
  if(mode=="metal-quench"||mode=="metal-cold"||mode=="metal-hot"||mode=="metal-swatch-off"||mode=="metal-c1150"||mode=="metal-c500")qaModes.Remove(mode);
 }
 float probeClock;
 /// Qa('metal-probe'): every 30 ms send Send('metal', id, json) with the anvil knife's temperatures, its blade's
 /// viewport box and edge/spine points (at the page's aspect), and particle and shard statistics. QA only.
 void MetalProbe(float raw){
  if(!QaOn("metal-probe")||cam==null)return;probeClock+=raw;if(probeClock<.03f)return;probeClock=0;
  var t=tuning.metal;Body a=null;foreach(var b in bodies.Values)if(b.knife.place=="anvil"){a=b;break;}if(a==null)foreach(var b in bodies.Values)if(b.knife.place=="furnace"){a=b;break;}if(a==null)foreach(var b in bodies.Values){a=b;break;}
  float aspect=view.cssW>0&&view.cssH>0?view.cssW/view.cssH:cam.aspect;cam.aspect=aspect;
  var sb=new System.Text.StringBuilder();var ci=System.Globalization.CultureInfo.InvariantCulture;
  void F(string k,float v){sb.Append('"').Append(k).Append("\":").Append(float.IsNaN(v)||float.IsInfinity(v)?"0":v.ToString("0.#####",ci)).Append(',');}
  void P(string k,Vector3 w){var vp=cam.WorldToViewportPoint(w);sb.Append('"').Append(k).Append("\":[").Append(vp.x.ToString("0.#####",ci)).Append(',').Append(vp.y.ToString("0.#####",ci)).Append(',').Append(vp.z.ToString("0.###",ci)).Append("],");}
  sb.Append('{');F("rt",Time.realtimeSinceStartup);
  if(a!=null&&a.heatState!=null){var h=a.heatState;sb.Append("\"place\":\"").Append(a.knife.place).Append("\",");F("id",a.knife.id);F("level",a.knife.level);F("body",h.model.BodyC(t));F("edge",h.model.TemperatureC(.8f,t));F("spine",h.model.TemperatureC(5,t));F("oxide",h.model.Oxide(t));F("crack",h.crack);F("lenCm",h.shape.LengthCm);F("widthCm",h.shape.BladeWidthCm);
   F("notchMm",h.shape.notchU>=0?h.shape.NotchDepthAt(h.shape.Station(h.shape.notchU)):0);F("inCoals",h.model.InCoalsFor);var bt=a.blade.transform;
   if(h.shape.notchU>=0){int ns=h.shape.Station(h.shape.notchU);h.shape.Point(ns,0,out var nx,out var nz);P("notch",bt.TransformPoint(new Vector3(nx,0,nz)));}
   var bb=h.mesh.bounds;float x0=1,y0=1,x1=0,y1=0;for(int c=0;c<8;c++){var corner=bb.center+Vector3.Scale(bb.extents,new Vector3((c&1)==0?-1:1,(c&2)==0?-1:1,(c&4)==0?-1:1));var vp=cam.WorldToViewportPoint(bt.TransformPoint(corner));x0=Mathf.Min(x0,vp.x);y0=Mathf.Min(y0,vp.y);x1=Mathf.Max(x1,vp.x);y1=Mathf.Max(y1,vp.y);}
   sb.Append("\"vp\":[").Append(x0.ToString("0.#####",ci)).Append(',').Append(y0.ToString("0.#####",ci)).Append(',').Append(x1.ToString("0.#####",ci)).Append(',').Append(y1.ToString("0.#####",ci)).Append("],");
   foreach(var uu in new[]{.3f,.5f,.7f}){int st=h.shape.Station(uu);h.shape.Point(st,.1f,out var ex,out var ez);h.shape.Point(st,.9f,out var sx,out var sz);P("edge"+Mathf.RoundToInt(uu*10),bt.TransformPoint(new Vector3(ex,0,ez)));P("spine"+Mathf.RoundToInt(uu*10),bt.TransformPoint(new Vector3(sx,0,sz)));}}
  int fl=0,sh=0,ch=0,sp=0,fk=0,em=0,landed=0,near=0,lit=0;float rise=-9;
  for(int i=0;i<bitCount;i++){var p=bits[i];switch(p.kind){case KFlake:fl++;break;case KSheet:sh++;break;case KChip:ch++;break;case KSpark:sp++;break;case KFork:fk++;break;case KEmber:em++;break;}
   if(p.kind==KFlake||p.kind==KSheet||p.kind==KChip){rise=Mathf.Max(rise,p.p.y-fxOrigin.y);if(p.landed){landed++;if(new Vector2(p.p.x-fxOrigin.x,p.p.z-fxOrigin.z).magnitude<1)near++;}if(p.dark<0)lit++;}}
  F("flakes",fl);F("sheets",sh);F("chips",ch);F("sparks",sp);F("forks",fk);F("embers",em);F("landed",landed);F("near1m",near);F("glowing",lit);F("rise",rise);
  float maxW=0;int resting=0;foreach(var s2 in shards)if(s2.rest){resting++;maxW=Mathf.Max(maxW,s2.w.magnitude);}F("shards",shards.Count);F("shardsResting",resting);F("shardsMaxW",maxW);F("shardAge",shardAge);F("shardC",shardModel!=null&&shards.Count>0?shardModel.BodyC(t):0);F("shardEdgeC",shardModel!=null&&shards.Count>0?shardModel.TemperatureC(.8f,t):0);F("coins",coins.Count);F("smoke",smokeCount);
  P("contact",fxOrigin!=Vector3.zero?fxOrigin:lastContact);F("bits",bitCount);
  sb.Append("\"burst\":\"").Append(lastBurstOutcome).Append("\",");F("burstId",lastBurstId);F("bFlakes",lastBurstFlakes);F("bSheets",lastBurstSheets);F("bChips",lastBurstChips);F("bSparks",lastBurstSparks);F("landN",landN);F("nearN",nearN);
  sb.Length--;sb.Append('}');cam.ResetAspect();
  Send("metal",a!=null?a.knife.id:0,sb.ToString());
 }
 /// Swatch plate temperatures (C) and viewport x of plate i (y = .5): .29 .. .71.
 public static readonly float[] SwatchC={20,600,700,800,900,1000,1100,1200};
 public static float SwatchX(int i)=>.29f+i*.06f;
 void MakeSwatch(){
  if(swatchRoot!=null||cam==null)return;swatchRoot=new GameObject("QA swatch");
  var quad=new Mesh{name="Swatch plate"};quad.SetVertices(new List<Vector3>{new Vector3(-.5f,-.5f,0),new Vector3(.5f,-.5f,0),new Vector3(-.5f,.5f,0),new Vector3(.5f,.5f,0)});
  quad.SetNormals(new List<Vector3>{Vector3.back,Vector3.back,Vector3.back,Vector3.back});quad.SetUVs(0,new List<Vector2>{new Vector2(.5f,.5f),new Vector2(.5f,.5f),new Vector2(.5f,.5f),new Vector2(.5f,.5f)});
  quad.SetUVs(1,new List<Vector4>{new Vector4(3,0,0,0),new Vector4(3,0,0,0),new Vector4(3,0,0,0),new Vector4(3,0,0,0)});quad.SetTriangles(new[]{0,2,1,1,2,3},0);quad.RecalculateBounds();
  var t=tuning.metal;
  for(int i=0;i<SwatchC.Length;i++){var go=new GameObject("Swatch "+SwatchC[i]+" C");go.transform.SetParent(swatchRoot.transform,false);go.AddComponent<MeshFilter>().sharedMesh=quad;var m=new Material(Shader.Find(ForgeContract.Shaders.Blade));m.color=C("a0acb8");m.SetFloat("_Metallic",.94f);m.SetFloat("_Glossiness",.6f);m.SetFloat("_Worked",1);m.SetFloat("_Swatch",1);
   var model=new ForgeHeatModel();model.Reset(SwatchC[i]);model.Uniforms(t,ua,ub,uc);m.SetVector(HeatA,new Vector4(ua[0],ua[1],ua[2],ua[3]));m.SetVector(HeatB,new Vector4(ub[0],ub[1],ub[2],ub[3]));m.SetVector(HeatC,new Vector4(uc[0],uc[1],uc[2],uc[3]));
   m.SetVector(OxideId,new Vector4(0,t.oxideDim,t.oxideGrowS,t.footprintRadiusCm));MetalConstants(m);m.SetVector(BladeDimsId,new Vector4(20,4,0,KnifeUnitMm));
   go.AddComponent<MeshRenderer>().sharedMaterial=m;}
  UpdateSwatch();
 }
 void UpdateSwatch(){
  if(swatchRoot==null||cam==null)return;const float d=.8f;if(view.cssW>0&&view.cssH>0)cam.aspect=view.cssW/view.cssH;
  for(int i=0;i<swatchRoot.transform.childCount;i++){var c=swatchRoot.transform.GetChild(i);var p=cam.ViewportToWorldPoint(new Vector3(SwatchX(i),.5f,d));c.position=p;c.rotation=cam.transform.rotation;float h=2*d*Mathf.Tan(cam.fieldOfView*.5f*Mathf.Deg2Rad);c.localScale=Vector3.one*h*.045f;}
  cam.ResetAspect();
 }
}
