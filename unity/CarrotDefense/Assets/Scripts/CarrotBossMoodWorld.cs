using System.Collections.Generic;
using System.Globalization;
using UnityEngine;
using UnityEngine.Rendering;
using UnityEngine.Splines;
using Unity.Mathematics;
using Cinemachine;

namespace CarrotTD {
 /// <summary>
 /// BOSS MOOD world: per-build material clones (class 1 ground, 2 foliage, 3 prop, 4 lane, 5 prism band; actors, pads, path edges,
 /// lanterns, the carrot, telegraph and FX materials are never classified), the _CarrotMoodField distance texture, the losses, the
 /// wake front, the long shadow, the hope pool, the boss dither occluders, mist between the lanes, thorn silhouettes beyond the board,
 /// the portal skirt fragments, the boss's head click volume and the entrance shot. Asset materials and the cached biome materials
 /// that non-boss levels reuse are never written: every change goes into this build's clones, destroyed at the next build.
 /// </summary>
 public sealed partial class CarrotView {
  readonly Dictionary<Material,Material> moodClones=new Dictionary<Material,Material>();
  readonly Dictionary<Material,Material> moodBossClones=new Dictionary<Material,Material>();
  readonly List<Object> moodOwned=new List<Object>();
  readonly HashSet<int> moodBossDressed=new HashSet<int>();
  Texture2D moodField;Vector4 moodFieldRect;Vector4 moodBounds;Color32[] moodFieldPx;int moodFieldW,moodFieldH,moodFieldRow=-1;Vector2 moodFieldOrigin;float moodFieldTexel=.45f,moodFieldMs;
  readonly List<GameObject> moodObjects=new List<GameObject>();
  readonly List<Vector3> moodLane=new List<Vector3>();readonly List<int> moodLaneBreaks=new List<int>();
  readonly List<Vector3> moodWake=new List<Vector3>();readonly List<float> moodWakeCum=new List<float>();float moodWakeLength=1;
  float moodFront;int moodLossCount;
  readonly Vector4[] moodLoss=new Vector4[16];readonly float[] moodLossAmount=new float[16];readonly float[] moodLossGate=new float[16];readonly int[] moodLossWave=new int[16];
  readonly Vector4[] moodOcc=new Vector4[24];
  // mist, thorns, fragments
  readonly List<Material> moodMistMaterials=new List<Material>();
  Mesh moodThornMesh;Vector3[] moodThornBase;float[] moodThornH,moodThornLean,moodThornYaw,moodThornDelay;float moodThornGrowth=-1;Material moodThornMaterial;
  Mesh moodFragMesh;Vector3[] moodFragPos,moodFragVel;float[] moodFragLife,moodFragSize,moodFragSpin;System.Random moodFragRng;float moodFragClock;Material moodFragMaterial;
  bool moodShotOn;CinemachineVirtualCamera moodShotCam;float moodShotFovStart,moodShotFovEnd,moodShotRollStart,moodShotRollEnd;

  // ---------------------------------------------------------------- classification
  /// <summary>Class of a world material by its id (the name Material(id) gives it, before any " (" suffix a Tint copy adds).</summary>
  static int MoodClass(string name){
   if(string.IsNullOrEmpty(name))return 0;string n=name.ToLowerInvariant();int paren=n.IndexOf(" (");if(paren>0)n=n.Substring(0,paren);
   // never: lane edges, pads, blockers, lanterns, the carrot, entry stones, the portal refuge light, water, the sky and every FX/UI material
   if(n.StartsWith("path-edge")||n.StartsWith("path-stone")||n.StartsWith("padstones")||n.StartsWith("padsoil")||n.StartsWith("padmark")||n.StartsWith("block-")||n.StartsWith("lantern")||n.StartsWith("carrot")||n.StartsWith("entry-stone")||n.StartsWith("portal-refuge")||n.StartsWith("water")||n.StartsWith("sky")||n.StartsWith("contact")||n.StartsWith("ring-")||n.StartsWith("ghost")||n.StartsWith("blind")||n.StartsWith("duo-")||n.StartsWith("banner")||n.StartsWith("builder")||n.StartsWith("prism-socket")||n.StartsWith("prism-refuge")||n.StartsWith("prism-titanium"))return 0;
   if(n.StartsWith("path-"))return 4;
   if(n.StartsWith("ground-")||n=="prism-bed-soil"||n.StartsWith("portal-platform")||n.StartsWith("portal-foundation")||n.StartsWith("portal-carved-stone")||n.StartsWith("prism-substrate")||n.StartsWith("terrain"))return 1;
   if(n.StartsWith("prism-inlay")||n.StartsWith("prism-violet-seam")||n.StartsWith("prism-seam")||n.StartsWith("prism-crystal"))return 5;
   if(n.StartsWith("living-grass")||n.StartsWith("tree-leaf")||n.StartsWith("flower")||n.StartsWith("petal")||n.StartsWith("litter")||n=="stem"||n.StartsWith("foliage")||n.StartsWith("fern")||n.StartsWith("shrub")||n.StartsWith("leaf")||n.StartsWith("leaves")||n.StartsWith("grass")||n.StartsWith("bush")||n.StartsWith("plant"))return 2;
   if(n.StartsWith("tree-bark")||n.StartsWith("bark")||n.StartsWith("trunk")||n.StartsWith("loose-rock")||n.StartsWith("rock")||n.StartsWith("mossrock")||n.StartsWith("moss")||n.StartsWith("stump")||n.StartsWith("wood")||n.StartsWith("fence")||n.StartsWith("pumpkin")||n.StartsWith("gourd")||n.StartsWith("straw")||n.StartsWith("hay")||n.StartsWith("burlap")||n.StartsWith("scarecrow")||n.StartsWith("crate")||n.StartsWith("bridge")||n.StartsWith("ladder")||n.StartsWith("portal-inlay")||n.StartsWith("portal-oxidized")||n.StartsWith("pebble")||n.StartsWith("stone")||n.StartsWith("prism-arch")||n.StartsWith("prism-gold")||n.StartsWith("dirt")||n.StartsWith("soil"))return 3;
   return 0;
  }
  bool UnderActor(Transform t){while(t!=null&&t!=world){if(t.name.EndsWith(" actor"))return true;t=t.parent;}return false;}

  void BossMoodDisposeWorld(){
   foreach(var o in moodObjects)if(o!=null)Destroy(o);moodObjects.Clear();foreach(var o in moodOwned)if(o!=null)Destroy(o);moodOwned.Clear();moodFieldRow=-1;moodFieldPx=null;moodClones.Clear();moodBossClones.Clear();moodBossDressed.Clear();moodBossHeight.Clear();moodMistMaterials.Clear();
   moodField=null;moodThornMesh=null;moodThornMaterial=null;moodFragMesh=null;moodFragMaterial=null;moodThornGrowth=-1;moodLossCount=0;moodFront=0;moodShotOn=false;
  }

  void BossMoodWorldBuild(){
   var inv=CultureInfo.InvariantCulture;var p=mood;
   // ---- bounds (route + pads) and the dense lane polylines (the trail follows the route splines)
   moodBounds=new Vector4(routeMin.x,routeMin.z,routeMax.x,routeMax.z);
   moodLane.Clear();moodLaneBreaks.Clear();moodWake.Clear();moodWakeCum.Clear();moodDepthSamples.Clear();
   for(int r=0;r<game.level.routes.Length;r++){var spline=RouteSpline(game.level.routes[r]);float len=spline.GetLength();int n=Mathf.Clamp(Mathf.CeilToInt(len/.35f),2,400);
    for(int i=0;i<=n;i++){float3 q=spline.EvaluatePosition(i/(float)n);var v=new Vector3(q.x,0,q.z);moodLane.Add(v);if(r==0)moodWake.Add(v);if(i%3==0)moodDepthSamples.Add(new Vector3(v.x,.1f,v.z));}moodLaneBreaks.Add(moodLane.Count);}
   float cum=0;for(int i=0;i<moodWake.Count;i++){if(i>0)cum+=Vector3.Distance(moodWake[i-1],moodWake[i]);moodWakeCum.Add(cum);}moodWakeLength=Mathf.Max(1,cum);
   foreach(var q in game.level.pads)moodDepthSamples.Add(new Vector3(q.x,.4f,q.z));
   // ---- the field texture: R lane distance /4, G route-0 progress, B pad-edge distance /3, A lateral distance to route 0 /4.
   // Filled row by row within a 3 ms budget per frame (BossMoodFieldStep); until it is complete the texture reads "far from every
   // lane" (no wake, no mist), so the first frames only lack the wake. The CPU copy feeds the mist and thorn placement.
   const float texel=.45f;float minX=moodBounds.x-6,minZ=moodBounds.y-6,maxX=moodBounds.z+6,maxZ=moodBounds.w+6;moodFieldW=Mathf.Clamp(Mathf.CeilToInt((maxX-minX)/texel)+1,8,128);moodFieldH=Mathf.Clamp(Mathf.CeilToInt((maxZ-minZ)/texel)+1,8,128);
   moodField=new Texture2D(moodFieldW,moodFieldH,TextureFormat.RGBA32,false,true){name="Boss mood field",wrapMode=TextureWrapMode.Clamp,filterMode=FilterMode.Bilinear};moodOwned.Add(moodField);
   moodFieldPx=new Color32[moodFieldW*moodFieldH];for(int i=0;i<moodFieldPx.Length;i++)moodFieldPx[i]=new Color32(255,0,255,255);moodField.SetPixels32(moodFieldPx);moodField.Apply(false,false);
   moodFieldOrigin=new Vector2(minX,minZ);moodFieldTexel=texel;moodFieldRow=0;moodFieldMs=0;
   moodFieldRect=new Vector4(minX-texel*.5f,minZ-texel*.5f,1f/(moodFieldW*texel),1f/(moodFieldH*texel));
   // ---- material clones
   var counts=new int[6];var classified=new System.Text.StringBuilder();var skipped=new HashSet<string>();var named=new HashSet<string>();
   var shader=Shader.Find("Carrot/Storybook");
   foreach(var r in world.GetComponentsInChildren<Renderer>(true)){
    if(r is ParticleSystemRenderer||r is LineRenderer||r is TrailRenderer||UnderActor(r.transform))continue;
    var mats=r.sharedMaterials;bool changed=false;
    for(int i=0;i<mats.Length;i++){var m=mats[i];if(m==null)continue;int cls=MoodClass(m.name);
     if(cls==0||m.shader!=shader){if(skipped.Add(m.name)){}continue;}
     if(!moodClones.TryGetValue(m,out var clone)){clone=new Material(m){name=m.name+" (mood)"};clone.SetFloat("_MoodClass",cls);if(cls==5&&clone.HasProperty("_EmissionColor"))clone.SetColor("_EmissionColor",m.GetColor("_EmissionColor"));moodClones[m]=clone;moodOwned.Add(clone);counts[cls]++;if(named.Add(m.name))classified.Append(m.name.Replace(' ','_')).Append(':').Append(cls).Append(',');}
     mats[i]=clone;changed=true;}
    if(changed)r.sharedMaterials=mats;}
   var skip=new System.Text.StringBuilder();foreach(var s in skipped)skip.Append(s.Replace(' ','_')).Append(',');
   Debug.Log("CARROT_MOOD_CLASS level="+game.level.id+" profile="+p.id+" ground="+counts[1]+" foliage="+counts[2]+" prop="+counts[3]+" lane="+counts[4]+" band="+counts[5]+" classified="+classified+" never="+skip);
   // ---- losses: one per wave before the boss (from the second wave), and the boss's own as it passes landmarks beside route 0
   BossMoodLosses();
   // ---- mist, thorns, fragments
   if(p.fragments)BossMoodFragments();
  }

  /// <summary>Continues the field fill (3 ms per frame); on completion uploads it and builds what depends on it (mist, thorns).</summary>
  void BossMoodFieldStep(){
   if(moodFieldRow<0||moodFieldPx==null)return;var sw=System.Diagnostics.Stopwatch.StartNew();
   while(moodFieldRow<moodFieldH&&sw.Elapsed.TotalMilliseconds<3){int y=moodFieldRow++;
    for(int x=0;x<moodFieldW;x++){Vector3 c=new Vector3(moodFieldOrigin.x+x*moodFieldTexel,0,moodFieldOrigin.y+y*moodFieldTexel);
     float lane=LaneDistance(c,out _,out _);float lat=WakeDistance(c,out float prog);float pad=PadDistance(c);
     moodFieldPx[y*moodFieldW+x]=new Color32((byte)Mathf.RoundToInt(Mathf.Clamp01(lane/4)*255),(byte)Mathf.RoundToInt(Mathf.Clamp01(prog)*255),(byte)Mathf.RoundToInt(Mathf.Clamp01(pad/3)*255),(byte)Mathf.RoundToInt(Mathf.Clamp01(lat/4)*255));}}
   moodFieldMs+=(float)sw.Elapsed.TotalMilliseconds;
   if(moodFieldRow<moodFieldH)return;
   moodField.SetPixels32(moodFieldPx);moodField.Apply(false,false);moodFieldRow=-1;
   var p=mood;if(p!=null){if(p.mist&&CarrotQuality.Rich)BossMoodMist();if(p.thorns)BossMoodThorns();}
   Debug.Log("CARROT_MOOD_FIELD level="+game.level.id+" size="+moodFieldW+"x"+moodFieldH+" ms="+moodFieldMs.ToString("F1",CultureInfo.InvariantCulture)+" losses="+moodLossCount+" lanes="+moodLane.Count+" mist="+moodMistMaterials.Count+" thorns="+(moodThornBase!=null?moodThornBase.Length:0)+" fragments="+(moodFragPos!=null?moodFragPos.Length:0));
  }
  /// <summary>Bilinear CPU lookup of the field (u): lane distance, route-0 progress, pad-edge distance, lateral distance to route 0.</summary>
  void FieldAt(Vector3 c,out float lane,out float prog,out float pad,out float lat){
   lane=4;prog=0;pad=3;lat=4;if(moodFieldPx==null)return;float fx=(c.x-moodFieldOrigin.x)/moodFieldTexel,fz=(c.z-moodFieldOrigin.y)/moodFieldTexel;
   int x0=Mathf.Clamp(Mathf.FloorToInt(fx),0,moodFieldW-1),z0=Mathf.Clamp(Mathf.FloorToInt(fz),0,moodFieldH-1),x1=Mathf.Min(x0+1,moodFieldW-1),z1=Mathf.Min(z0+1,moodFieldH-1);float tx=Mathf.Clamp01(fx-x0),tz=Mathf.Clamp01(fz-z0);
   Color32 a=moodFieldPx[z0*moodFieldW+x0],b=moodFieldPx[z0*moodFieldW+x1],d=moodFieldPx[z1*moodFieldW+x0],e=moodFieldPx[z1*moodFieldW+x1];
   float L(byte p,byte q,byte r,byte s_){return Mathf.Lerp(Mathf.Lerp(p,q,tx),Mathf.Lerp(r,s_,tx),tz)/255f;}
   lane=L(a.r,b.r,d.r,e.r)*4;prog=L(a.g,b.g,d.g,e.g);pad=L(a.b,b.b,d.b,e.b)*3;lat=L(a.a,b.a,d.a,e.a)*4;
  }
  /// <summary>QA: CPU-side values the shader receives (Quality('mood:debug:n') logs this).</summary>
  void BossMoodProbe(){
   var inv=CultureInfo.InvariantCulture;var sb=new System.Text.StringBuilder("CARROT_MOOD_PROBE level=");sb.Append(game!=null&&game.level!=null?game.level.id:0).Append(" fieldRow=").Append(moodFieldRow).Append(" field=").Append(moodFieldW).Append('x').Append(moodFieldH).Append(" front=").Append(moodFront.ToString("F3",inv)).Append(" losses=").Append(moodLossCount);
   for(int i=0;i<moodLossCount;i++)sb.Append(" L").Append(i).Append('=').Append(moodLoss[i].ToString("F2"));
   foreach(var n in new[]{"_CarrotMood","_CarrotMoodWakeP","_CarrotMoodFront","_CarrotMoodFieldRect","_CarrotMoodPool","_CarrotMoodBounds","_CarrotMoodShadowP"})sb.Append(' ').Append(n).Append('=').Append(Shader.GetGlobalVector(n).ToString("F3"));
   if(moodWake.Count>2){var w=WakePoint(.2f,out var side);var c=w+side*1f;FieldAt(c,out float lane,out float prog,out float pad,out float lat);sb.Append(" sample(.2,+1u)=lane:").Append(lane.ToString("F2",inv)).Append(",prog:").Append(prog.ToString("F2",inv)).Append(",pad:").Append(pad.ToString("F2",inv)).Append(",lat:").Append(lat.ToString("F2",inv));}
   Debug.Log(sb.ToString());
  }
  float LaneDistance(Vector3 c,out int index,out float t){float best=1e9f;index=0;t=0;int start=0;
   foreach(int end in moodLaneBreaks){for(int i=start+1;i<end;i++){Vector3 a=moodLane[i-1],b=moodLane[i];Vector3 d=b-a;float k=Mathf.Clamp01(Vector3.Dot(c-a,d)/Mathf.Max(1e-5f,d.sqrMagnitude));float dist=(c-(a+d*k)).sqrMagnitude;if(dist<best){best=dist;index=i;t=k;}}start=end;}
   return Mathf.Sqrt(best);}
  float WakeDistance(Vector3 c,out float progress){float best=1e9f;progress=0;
   for(int i=1;i<moodWake.Count;i++){Vector3 a=moodWake[i-1],b=moodWake[i];Vector3 d=b-a;float k=Mathf.Clamp01(Vector3.Dot(c-a,d)/Mathf.Max(1e-5f,d.sqrMagnitude));float dist=(c-(a+d*k)).sqrMagnitude;if(dist<best){best=dist;progress=(moodWakeCum[i-1]+k*Vector3.Distance(a,b))/moodWakeLength;}}
   return Mathf.Sqrt(best);}
  float PadDistance(Vector3 c){float pad=100;foreach(var q in game.level.pads){float d=new Vector2(c.x-q.x,c.z-q.z).magnitude-.5f;if(d<pad)pad=d;}return pad;}
  Vector3 WakePoint(float progress,out Vector3 side){float want=Mathf.Clamp01(progress)*moodWakeLength;side=Vector3.right;
   for(int i=1;i<moodWake.Count;i++){if(moodWakeCum[i]>=want||i==moodWake.Count-1){Vector3 a=moodWake[i-1],b=moodWake[i];float seg=Mathf.Max(1e-4f,moodWakeCum[i]-moodWakeCum[i-1]);Vector3 d=(b-a).normalized;side=Vector3.Cross(Vector3.up,d);return Vector3.Lerp(a,b,Mathf.Clamp01((want-moodWakeCum[i-1])/seg));}}
   return moodWake.Count>0?moodWake[moodWake.Count-1]:Vector3.zero;}

  void BossMoodLosses(){
   moodLossCount=0;var p=mood;if(p.lossColor.a<=0)return;int bw=CarrotBossMoodCurve.BossWave(game.level.id);var rng=new System.Random(9307+game.level.id*31+11);
   var picked=new List<Vector3>();
   bool Free(Vector3 c,float minLane){if(LaneDistance(c,out _,out _)<minLane||PadDistance(c)<1.1f||Vector3.Distance(c,carrotPosition)<2.6f)return false;foreach(var q in picked)if(Vector3.Distance(q,c)<2.4f)return false;return true;}
   // wave losses: patches across the board's outer band (the meadow visibly gives up, one patch per wave)
   int waveLosses=Mathf.Min(11,Mathf.Max(0,bw-2));
   for(int k=0;k<waveLosses&&moodLossCount<16;k++){Vector3 best=Vector3.zero;bool ok=false;
    for(int tries=0;tries<60&&!ok;tries++){float x=Mathf.Lerp(moodBounds.x-1.5f,moodBounds.z+1.5f,(float)rng.NextDouble()),z=Mathf.Lerp(moodBounds.y-1.5f,moodBounds.w+1.5f,(float)rng.NextDouble());var c=new Vector3(x,0,z);if(Free(c,1.6f)&&!Pond(c)){best=c;ok=true;}}
    if(!ok)continue;picked.Add(best);float rad=1.0f+(float)rng.NextDouble()*.35f;moodLoss[moodLossCount]=new Vector4(best.x,best.z,rad,0);moodLossWave[moodLossCount]=k+2;moodLossGate[moodLossCount]=-1;moodLossAmount[moodLossCount]=0;moodLossCount++;}
   // boss losses: landmarks beside route 0 that wither as the boss passes them
   for(int k=0;k<p.bossLosses&&moodLossCount<16;k++){float prog=(k+1)/(float)(p.bossLosses+1);bool ok=false;
    foreach(float lateral in new[]{2.0f,-2.0f,2.6f,-2.6f}){var c=WakePoint(prog,out var side)+side*(lateral*((k&1)==0?1:-1));if(Free(c,1.55f)&&!Pond(c)){picked.Add(c);moodLoss[moodLossCount]=new Vector4(c.x,c.z,1.15f,0);moodLossWave[moodLossCount]=-1;moodLossGate[moodLossCount]=prog;moodLossAmount[moodLossCount]=0;moodLossCount++;ok=true;break;}}}
   for(int i=moodLossCount;i<16;i++)moodLoss[i]=Vector4.zero;
  }
  /// <summary>Wave start: the S0 loss for this wave begins (a 1 s step), the garden drops leaves.</summary>
  void BossMoodWaveStart(int wave){
   if(mood==null)return;int bw=CarrotBossMoodCurve.BossWave(game.level.id);
   if(wave>=1&&wave<=bw&&mood.leafBurst>0&&!reducedMotion)effects.MoodLeafBurst(mood,routeMin,routeMax);
  }

  // ---------------------------------------------------------------- per frame
  void BossMoodWorldTick(CarrotMoodInput input,float dt){
   if(moodFieldRow>=0)BossMoodFieldStep();
   var p=mood;float de=moodDe;int bw=CarrotBossMoodCurve.BossWave(game.level.id);
   // wake front: the creep before the boss, then the boss's own route fraction; it never retreats (losses do not heal until the release)
   float creep=bw>1?.35f*Mathf.Clamp01((Mathf.Max(game.wave,1)-1)/(float)Mathf.Max(1,bw-1)):0;
   float frontWant=Mathf.Max(creep,input.boss==1||input.boss==2||input.boss==4?input.route:0);moodFront=Mathf.Max(moodFront,frontWant);if(input.boss==1||input.boss==2)moodBossRoute=Mathf.Max(moodBossRoute,input.route);
   for(int i=0;i<moodLossCount;i++){bool on=moodLossWave[i]>0?game.wave>=moodLossWave[i]:moodLossGate[i]>=0&&moodBossRoute>=moodLossGate[i];
    if(moodForce>=0&&moodForce>.5f&&moodLossWave[i]>0)on=true;
    float target=on?1:0;moodLossAmount[i]=reducedMotion?target:Mathf.MoveTowards(moodLossAmount[i],target,dt);var L=moodLoss[i];L.w=moodLossAmount[i];moodLoss[i]=L;}
   // world De: held during the release while the restoration front sweeps out from the carrot
   float world=de,post=de,radius=-1;
   if(moodRelease>=0){float t=moodRelease-moodReleaseDelay;
    if(reducedMotion){radius=-1;world=Mathf.Lerp(moodReleaseHold,de,Mathf.Clamp01(t/1.5f));}
    else if(t<0){world=moodReleaseHold;}
    else{radius=t*moodReleaseSpeed;if(radius<moodReleaseMax){world=moodReleaseHold;post=de;}else radius=-1;}}
   float breath=reducedMotion?0:p.edgeBreath*Mathf.Sin(moodClock*Mathf.PI*2*.1f);
   Shader.SetGlobalVector("_CarrotMood",new Vector4(1,world,clock,breath));
   Shader.SetGlobalVector("_CarrotMoodWave",new Vector4(carrotPosition.x,carrotPosition.z,radius,post));
   float low=moodLow;
   Shader.SetGlobalVector("_CarrotMoodGround",new Vector4(p.groundSat,1-(1-p.groundGain)*low,p.groundHue.a,0));
   Shader.SetGlobalVector("_CarrotMoodFoliage",new Vector4(p.foliageSat,1-(1-p.foliageGain)*low,p.wither.a,0));
   Shader.SetGlobalVector("_CarrotMoodProp",new Vector4(p.propSat,1-(1-p.propGain)*low,p.propHue.a,0));
   Shader.SetGlobalVector("_CarrotMoodLane",new Vector4(p.laneGain,p.laneTint.a,.12f*p.longShadow,.35f*p.longShadow));
   Shader.SetGlobalVector("_CarrotMoodBand",new Vector4(p.bandSat,p.bandEmission,0,0));
   Shader.SetGlobalColor("_CarrotMoodHue",p.groundHue);Shader.SetGlobalColor("_CarrotMoodWither",p.wither);Shader.SetGlobalColor("_CarrotMoodPropHue",p.propHue);Shader.SetGlobalColor("_CarrotMoodLaneTint",p.laneTint);
   Shader.SetGlobalColor("_CarrotMoodWake",p.wakeColor);Shader.SetGlobalColor("_CarrotMoodLossColor",p.lossColor);
   Shader.SetGlobalVector("_CarrotMoodBounds",moodBounds);
   Shader.SetGlobalVector("_CarrotMoodEdge",new Vector4(1-(1-p.edgeFloor)*low,p.edgeInward,p.edgeMode,0));
   Shader.SetGlobalVector("_CarrotMoodWakeP",new Vector4(p.wake,1-(1-p.wakeGain)*Mathf.Max(low,.8f),p.wakeSmooth,0));
   Shader.SetGlobalVector("_CarrotMoodFront",new Vector4(moodFront,.6f/moodWakeLength,0,0));
   if(moodField!=null)Shader.SetGlobalTexture("_CarrotMoodField",moodField);Shader.SetGlobalVector("_CarrotMoodFieldRect",moodFieldRect);
   Shader.SetGlobalVectorArray("_CarrotMoodLoss",moodLoss);Shader.SetGlobalFloat("_CarrotMoodLossCount",moodLossCount);
   // the guardian: Asuna's drain focus, the long shadow toward the carrot, the dither occluders
   EnemyState boss=null;foreach(var e in game.enemies)if(e.id==moodTracker.BossId&&e.alive){boss=e;break;}
   Vector4 focus=Vector4.zero,shadowA=Vector4.zero,shadowP=Vector4.zero,bossV=new Vector4(0,0,0,-100);
   if(boss!=null){
    if(p.focusRadius>0)focus=new Vector4(boss.position.x,boss.position.z,p.focusRadius,1);
    if(p.longShadow>0&&!boss.hidden){Vector3 to=carrotPosition-boss.position;to.y=0;float dist=to.magnitude;float len=Mathf.Lerp(3,5,de);if(p.shadowReachesCarrot&&input.route>.6f)len=Mathf.Max(len,Mathf.Min(dist-.4f,Mathf.Lerp(len,dist,Mathf.InverseLerp(.6f,.9f,input.route))));len=Mathf.Min(len,Mathf.Max(0,dist-.2f));
     if(dist>.1f){Vector3 b=boss.position+to/dist*len;shadowA=new Vector4(boss.position.x,boss.position.z,b.x,b.z);shadowP=new Vector4(1.0f*moodBossK,Mathf.Clamp01(de*1.2f),0,0);}}
    if(enemies.TryGetValue(boss.id,out var ba)){float top=BossMoodHeight(ba,boss)*moodBossK;bossV=new Vector4(boss.position.x,SurfaceHeight(boss.position),boss.position.z,ba.root.transform.position.y+top*.55f);}
   }
   Shader.SetGlobalVector("_CarrotMoodFocus",focus);Shader.SetGlobalVector("_CarrotMoodShadow",shadowA);Shader.SetGlobalVector("_CarrotMoodShadowP",shadowP);Shader.SetGlobalVector("_CarrotMoodBoss",bossV);
   int occ=0;foreach(var q in game.level.pads){if(occ>=20)break;moodOcc[occ++]=new Vector4(q.x,q.z,.72f,0);}moodOcc[occ++]=new Vector4(carrotPosition.x,carrotPosition.z,.85f,0);
   for(int i=marks.Count-1;i>=0&&occ<24;i--){if(marks[i].until<clock)continue;moodOcc[occ++]=new Vector4(marks[i].position.x,marks[i].position.z,.9f,0);}
   for(int i=occ;i<24;i++)moodOcc[i]=Vector4.zero;Shader.SetGlobalVectorArray("_CarrotMoodOcc",moodOcc);Shader.SetGlobalFloat("_CarrotMoodOccCount",occ);
   // the hope pool: a warm albedo lift at the carrot that never reaches a pad (pad pools mean "lit" under blindness); off while blind
   float poolR=1.6f;
   Shader.SetGlobalVector("_CarrotMoodPool",new Vector4(carrotPosition.x,carrotPosition.z,poolR,blindLevel>0?0:p.hopePool*Mathf.Clamp01(de*1.4f)));
   // prism band emission drains globally (the spatial drain is the shader's saturation focus)
   if(p.bandEmission<1)foreach(var kv in moodClones){if(kv.Value.GetFloat("_MoodClass")<4.5f||!kv.Key.HasProperty("_EmissionColor"))continue;kv.Value.SetColor("_EmissionColor",kv.Key.GetColor("_EmissionColor")*Mathf.Lerp(1,p.bandEmission,de));}
   // mist (between the lanes), thorns (beyond the board), fragments (falling off the skirt)
   foreach(var m in moodMistMaterials)if(m!=null){var c=p.mistColor;m.SetColor("_Color",new Color(c.r,c.g,c.b,c.a*Mathf.Clamp01(de*1.3f)*(moodRelease>=0?Mathf.Clamp01(1-(moodRelease-moodReleaseDelay)/3):1)));}
   if(moodThornMesh!=null){float g=reducedMotion?Mathf.Round(de*10)/10:de;if(Mathf.Abs(g-moodThornGrowth)>.01f){moodThornGrowth=g;BossMoodThornMesh(g);}}
   if(moodFragMesh!=null)BossMoodFragmentTick(dt,de);
  }

  // ---------------------------------------------------------------- the boss's drawn body: dither clones and the head click volume
  readonly Dictionary<int,float> moodBossHeight=new Dictionary<int,float>();
  static float BossMoodHeightFallback(string boss){switch(boss){case "garden":return 2.8f;case "marsh":return 2.8f;case "frost":return 2.6f;case "orchard":return 2.9f;case "tornado":return 3.3f;case "zombie":return 2.8f;case "eyeball":return 2.4f;case "portal":return 2.5f;case "asuna":return 2.0f;}return 2.6f;}
  /// <summary>The guardian's drawn height above its root at k = 1 (u, ActorScale included), measured once per actor from its renderers
  /// (helper renderers taller than 8 u are ignored) and clamped to a sane range; the per-boss table is the fallback.</summary>
  float BossMoodHeight(Actor a,EnemyState e){
   if(moodBossHeight.TryGetValue(e.id,out float h))return h;float top=-1;float rootY=a.root.transform.position.y;
   foreach(var r in a.renderers){if(r==null||!r.enabled||r is ParticleSystemRenderer||r is LineRenderer||r is TrailRenderer)continue;var b=r.bounds;if(b.size.y<=0||b.size.y>8)continue;top=Mathf.Max(top,b.max.y-rootY);}
   float fb=BossMoodHeightFallback(e.boss)*ActorScale;h=top>1.2f*ActorScale&&top<5f*ActorScale?top:fb;moodBossHeight[e.id]=h;return h;}
  void BossMoodDress(Actor a){
   var shader=Shader.Find("Carrot/Storybook");
   foreach(var r in a.renderers){if(r==null)continue;var mats=r.sharedMaterials;bool changed=false;
    for(int i=0;i<mats.Length;i++){var m=mats[i];if(m==null||m.shader!=shader)continue;if(!moodBossClones.TryGetValue(m,out var c)){c=new Material(m){name=m.name+" (mood boss)"};c.SetFloat("_MoodClass",6);moodBossClones[m]=c;moodOwned.Add(c);}mats[i]=c;changed=true;}
    if(changed)r.sharedMaterials=mats;}
  }
  /// <summary>Taps on the drawn head select the boss (focus fire), exactly like taps on its body: a view-only box from the top of the
  /// 2.1 u root box to the drawn top, at most 1.15x its footprint. The root box itself (the rules-sized click target) is untouched.</summary>
  void BossMoodHead(Actor a,EnemyState e){
   if(!moodBossDressed.Contains(e.id)){moodBossDressed.Add(e.id);BossMoodDress(a);}
   if(Spectator||a.root==null)return;
   var t=a.root.transform.Find("Mood head click");float top=BossMoodHeight(a,e)*moodBossK;bool want=top>2.25f&&e.alive&&!e.hidden&&moodBossK>1.001f;
   if(t==null){if(!want)return;var go=new GameObject("Mood head click");go.transform.SetParent(a.root.transform,false);var click=go.AddComponent<CarrotClickable>();click.type="enemy";click.id=e.id;go.AddComponent<BoxCollider>();t=go.transform;}
   var box=t.GetComponent<BoxCollider>();box.enabled=want;
   if(want){float wide=1.785f*1.15f;box.center=new Vector3(0,(2.1f+top)*.5f,0);box.size=new Vector3(wide,top-2.1f,wide);}
  }

  // ---------------------------------------------------------------- hook 4: UpdateCinematics, right after the entrance beat may start
  void BossMoodShot(){
   if(moodShotOn&&(beatClock<0||quietBeat||!moodActive)){moodShotOn=false;bossBody.m_XDamping=.12f;bossBody.m_YDamping=.12f;bossBody.m_ZDamping=.18f;vcamBoss.m_Lens.Dutch=0;return;}
   if(!moodActive||mood==null||beatClock<0||quietBeat||vcamBoss.Follow==null)return;
   var p=mood;
   if(!moodShotOn&&beatClock<=0.0001f){
    var follow=vcamBoss.Follow;Actor actor=null;EnemyState e=null;foreach(var kv in enemies)if(kv.Value.root!=null&&kv.Value.root.transform==follow){actor=kv.Value;foreach(var s in game.enemies)if(s.id==kv.Key)e=s;break;}
    if(actor==null||e==null)return;
    float drawn=BossMoodHeight(actor,e)*p.bossScale;Vector3 root=follow.position;var route=game.level.routes[Mathf.Clamp(e.route,0,game.level.routes.Length-1)];float len=CarrotData.RouteLength(route);
    float back=p.back*(portraitCamera?.85f:1)*Mathf.Max(1,p.bossScale*.8f),h=p.height+(portraitCamera?.3f:0);Vector3 look=root+Vector3.up*(drawn*p.look);Vector3 cam;
    Vector3 toCarrot=carrotPosition-root;toCarrot.y=0;if(toCarrot.sqrMagnitude<.01f)toCarrot=Vector3.back;toCarrot.Normalize();
    bool found=false;
    if(p.shot==2){cam=root+toCarrot*back+Vector3.up*(back*Mathf.Tan(p.shotPitch*Mathf.Deg2Rad));found=true;}
    else{
     // From the carrot's side, a straight-line `back` from the boss (routes snake; a point along the route can sit beside it). The
     // first candidate (0, +-25, +-45 degrees around that bearing) with a clear view of the whole body and nothing of the garden
     // within 1.6 u of the lens wins; otherwise the original shot stays.
     cam=root;foreach(float turn in new[]{0f,25f,-25f,45f,-45f}){Vector3 dir=Quaternion.Euler(0,turn,0)*toCarrot;Vector3 ground=root+dir*back;ground.y=SurfaceHeight(ground);
      Vector3 c=ground+Vector3.up*(p.shot==3?Mathf.Max(h,drawn*p.look):h);Vector3 lk=p.shot==3?new Vector3(look.x,c.y,look.z):look;
      if(ShotClear(c,root,drawn,lk)){cam=c;look=lk;found=true;break;}}}
    if(!found)return;
    Quaternion rot=Quaternion.LookRotation(look-cam);
    // Composition (landscape): the guardian stands in the left third, clear of the warning card; the locked-off Eyeball shot stays centred.
    if(!portraitCamera&&p.shot!=3){float aspect=GameCamera!=null?GameCamera.aspect:1.6f;float yaw=Mathf.Atan(.34f*Mathf.Tan(p.fovEnd*.5f*Mathf.Deg2Rad)*aspect)*Mathf.Rad2Deg;rot=rot*Quaternion.Euler(0,yaw,0);}
    vcamBoss.transform.rotation=rot;bossBody.m_FollowOffset=cam-root;bossBody.m_XDamping=bossBody.m_YDamping=bossBody.m_ZDamping=p.damping;
    moodShotFovStart=p.fovStart+(portraitCamera?2:0);moodShotFovEnd=p.fovEnd+(portraitCamera?2:0);moodShotRollStart=p.rollStart;moodShotRollEnd=p.rollEnd;
    vcamBoss.m_Lens.FieldOfView=moodShotFovStart;vcamBoss.m_Lens.Dutch=moodShotRollStart;vcamBoss.ForceCameraPosition(cam,rot);moodShotOn=true;CarrotQa.Count("mood.shot",1);
    #if UNITY_EDITOR||DEVELOPMENT_BUILD||CARROT_QA
    var inv=CultureInfo.InvariantCulture;float elev=Mathf.Asin(Mathf.Clamp((cam.y-look.y)/Mathf.Max(.01f,(cam-look).magnitude),-1,1))*Mathf.Rad2Deg;
    Debug.Log("CARROT_MOOD_SHOT level="+game.level.id+" shot="+p.shot+" cam="+cam.x.ToString("F2",inv)+","+cam.y.ToString("F2",inv)+","+cam.z.ToString("F2",inv)+" elevation="+elev.ToString("F1",inv)+" fov="+moodShotFovStart.ToString("F0",inv)+"->"+moodShotFovEnd.ToString("F0",inv)+" drawn="+drawn.ToString("F2",inv));
    #endif
   }
   if(moodShotOn){float t=Mathf.Clamp01(beatClock/2.4f),ease=.5f-.5f*Mathf.Cos(t*Mathf.PI);vcamBoss.m_Lens.FieldOfView=Mathf.Lerp(moodShotFovStart,moodShotFovEnd,ease);vcamBoss.m_Lens.Dutch=Mathf.Lerp(moodShotRollStart,moodShotRollEnd,ease);}
  }
  bool ShotClear(Vector3 cam,Vector3 root,float drawn,Vector3 look){
   foreach(var q in game.level.pads)if(new Vector2(q.x-cam.x,q.z-cam.z).magnitude<1.6f)return false;
   if(Vector2.Distance(new Vector2(carrotPosition.x,carrotPosition.z),new Vector2(cam.x,cam.z))<1.4f)return false;
   if(Mathf.Abs(cam.x)>terrainHalfX+2.5f||Mathf.Abs(cam.z)>8.5f)return false;
   foreach(float f in new[]{.15f,.5f,.85f})if(Blocked(cam,root+Vector3.up*drawn*f))return false;
   return !Blocked(cam,look);}
  bool Blocked(Vector3 from,Vector3 to){Physics.SyncTransforms();var d=to-from;foreach(var hit in Physics.RaycastAll(from,d.normalized,d.magnitude)){var c=hit.collider.GetComponentInParent<CarrotClickable>();if(c!=null&&(c.type=="pad"||c.type=="tower"||c.type=="blocker"))return true;}return false;}

  // ---------------------------------------------------------------- mist between the lanes (marsh, zombie; Medium and High)
  void BossMoodMist(){
   var fx=Shader.Find("Carrot/FxAlpha");if(fx==null)return;float minX=moodBounds.x-2.5f,minZ=moodBounds.y-2.5f,maxX=moodBounds.z+2.5f,maxZ=moodBounds.w+2.5f;const float step=.28f;
   int nx=Mathf.CeilToInt((maxX-minX)/step),nz=Mathf.CeilToInt((maxZ-minZ)/step);
   foreach(float layer in new[]{.12f,.20f}){
    var v=new List<Vector3>();var col=new List<Color>();var uv=new List<Vector2>();var tri=new List<int>();
    for(int z=0;z<=nz;z++)for(int x=0;x<=nx;x++){var c=new Vector3(minX+x*step,0,minZ+z*step);FieldAt(c,out float lane,out _,out float pad,out _);
     // exactly 0 within .55 u of a lane centre and .4 u of a pad edge (and after interpolation: the ramps start beyond one grid step)
     float a=Mathf.SmoothStep(0,1,Mathf.InverseLerp(.55f+step,1.25f,lane))*Mathf.SmoothStep(0,1,Mathf.InverseLerp(.4f+step,.95f,pad));
     float outside=new Vector2(Mathf.Max(0,Mathf.Max(moodBounds.x-c.x,c.x-moodBounds.z)),Mathf.Max(0,Mathf.Max(moodBounds.y-c.z,c.z-moodBounds.w))).magnitude;float edge=1-Mathf.Clamp01(outside/1.2f);a*=edge*(.55f+.45f*Mathf.PerlinNoise(c.x*.6f+layer*13,c.z*.6f+3));if(Pond(c))a*=.5f;
     c.y=TerrainHeight(c)+layer;v.Add(c);col.Add(new Color(1,1,1,a));uv.Add(new Vector2(.5f,.5f));
     if(x<nx&&z<nz){int k=z*(nx+1)+x;tri.Add(k);tri.Add(k+nx+1);tri.Add(k+1);tri.Add(k+1);tri.Add(k+nx+1);tri.Add(k+nx+2);}}
    var mesh=new Mesh{name="Boss mood mist",indexFormat=IndexFormat.UInt32};mesh.SetVertices(v);mesh.SetColors(col);mesh.SetUVs(0,uv);mesh.SetTriangles(tri,0);mesh.RecalculateNormals();mesh.RecalculateBounds();moodOwned.Add(mesh);
    var m=new Material(fx){name="boss-mood-mist"};m.SetFloat("_UseAtlas",0);m.SetFloat("_SoftFade",.06f);m.SetFloat("_Puff",0);m.SetFloat("_Translucency",.15f);m.SetColor("_Color",new Color(1,1,1,0));m.renderQueue=3000;moodOwned.Add(m);moodMistMaterials.Add(m);
    var go=new GameObject("Boss mood mist "+layer.ToString("F2",CultureInfo.InvariantCulture));moodObjects.Add(go);go.transform.SetParent(world,false);go.AddComponent<MeshFilter>().sharedMesh=mesh;var r=go.AddComponent<MeshRenderer>();r.sharedMaterial=m;r.shadowCastingMode=ShadowCastingMode.Off;r.receiveShadows=false;
   }
  }

  // ---------------------------------------------------------------- thorn silhouettes rising beyond the board (Brambleback)
  void BossMoodThorns(){
   var rng=new System.Random(9307+game.level.id*31+5);var spots=new List<Vector3>();var cam=GameCamera;
   Vector3 center=new Vector3((moodBounds.x+moodBounds.z)*.5f,0,(moodBounds.y+moodBounds.w)*.5f);Vector3 camF=cam!=null?cam.transform.forward:Vector3.forward;camF.y=0;camF.Normalize();
   var screenPts=new List<Vector2>();if(cam!=null){foreach(var q in moodDepthSamples){var s=cam.WorldToViewportPoint(q);if(s.z>0)screenPts.Add(new Vector2(s.x,s.y));}}
   for(int tries=0;tries<400&&spots.Count<44;tries++){
    float ang=(float)rng.NextDouble()*Mathf.PI*2;float out_=1.8f+(float)rng.NextDouble()*2.4f;Vector3 dir=new Vector3(Mathf.Cos(ang),0,Mathf.Sin(ang));
    // a point outside the bounds + 1.5 u along this direction (rectangle expanded)
    float hx=(moodBounds.z-moodBounds.x)*.5f+out_,hz=(moodBounds.w-moodBounds.y)*.5f+out_;float s=Mathf.Min(hx/Mathf.Max(.001f,Mathf.Abs(dir.x)),hz/Mathf.Max(.001f,Mathf.Abs(dir.z)));Vector3 c=center+dir*s;
    if(Vector3.Dot(c-center,camF)<-(moodBounds.w-moodBounds.y)*.25f)continue; // never on the camera's side (it would stand in front of the board)
    FieldAt(c,out float laneD,out _,out float padD,out _);if(laneD<2.2f||padD<2f)continue;
    float h=1.1f+(float)rng.NextDouble()*1.3f;
    if(cam!=null){var a=cam.WorldToViewportPoint(c);var b=cam.WorldToViewportPoint(c+Vector3.up*h);if(a.z<=0)continue;float minx=Mathf.Min(a.x,b.x)-.03f,maxx=Mathf.Max(a.x,b.x)+.03f,miny=Mathf.Min(a.y,b.y)-.01f,maxy=Mathf.Max(a.y,b.y)+.02f;bool hides=false;foreach(var q in screenPts)if(q.x>minx&&q.x<maxx&&q.y>miny&&q.y<maxy){hides=true;break;}if(hides)continue;}
    bool near=false;foreach(var q in spots)if(Vector3.Distance(q,c)<1.6f)near=true;if(near)continue;int stalks=3+rng.Next(2);for(int k=0;k<stalks;k++){float a2=(float)rng.NextDouble()*6.283f,r2=.15f+(float)rng.NextDouble()*.35f;var q2=c+new Vector3(Mathf.Cos(a2)*r2,0,Mathf.Sin(a2)*r2);spots.Add(new Vector3(q2.x,TerrainHeight(q2)-.05f,q2.z));}}
   int n=spots.Count;if(n==0)return;moodThornBase=spots.ToArray();moodThornH=new float[n];moodThornLean=new float[n];moodThornYaw=new float[n];moodThornDelay=new float[n];
   for(int i=0;i<n;i++){moodThornH[i]=.8f+(float)rng.NextDouble()*1.4f;moodThornLean[i]=.2f+(float)rng.NextDouble()*.55f;moodThornYaw[i]=(float)rng.NextDouble()*360;moodThornDelay[i]=(float)rng.NextDouble()*.45f;}
   moodThornMesh=new Mesh{name="Boss mood thorns"};moodThornMesh.MarkDynamic();moodOwned.Add(moodThornMesh);
   moodThornMaterial=new Material(Shader.Find("Carrot/Storybook")){name="boss-mood-thorns"};moodThornMaterial.color=game.level.biome=="orchard"?new Color(.13f,.12f,.07f):new Color(.10f,.11f,.07f);moodThornMaterial.SetFloat("_Glossiness",.18f);moodThornMaterial.SetFloat("_SnowStrength",0);moodThornMaterial.SetFloat("_Wind",.004f);moodThornMaterial.SetFloat("_Cull",0);moodOwned.Add(moodThornMaterial);
   var go=new GameObject("Boss mood thorns");moodObjects.Add(go);go.transform.SetParent(world,false);go.AddComponent<MeshFilter>().sharedMesh=moodThornMesh;var r=go.AddComponent<MeshRenderer>();r.sharedMaterial=moodThornMaterial;r.shadowCastingMode=CarrotQuality.Rich?ShadowCastingMode.On:ShadowCastingMode.Off;r.receiveShadows=true;
   moodThornGrowth=-1;
  }
  readonly List<Vector3> thornV=new List<Vector3>();readonly List<int> thornT=new List<int>();readonly List<Vector2> thornUv=new List<Vector2>();
  void BossMoodThornMesh(float growth){
   thornV.Clear();thornT.Clear();thornUv.Clear();
   for(int i=0;i<moodThornBase.Length;i++){float g=Mathf.Clamp01((growth*1.25f-moodThornDelay[i])/(1-moodThornDelay[i]*.8f));if(g<=.01f)continue;float h=moodThornH[i]*g*g*(3-2*g);
    Quaternion yaw=Quaternion.Euler(0,moodThornYaw[i],0);Vector3 b=moodThornBase[i];const int segs=6;float baseR=.06f+.045f*moodThornH[i];
    // a tapering, curving stalk (square section) with three hooked side thorns
    for(int s=0;s<segs;s++){float t0=s/(float)segs,t1=(s+1)/(float)segs;Vector3 p0=b+yaw*new Vector3(moodThornLean[i]*t0*t0*h,t0*h,0),p1=b+yaw*new Vector3(moodThornLean[i]*t1*t1*h,t1*h,0);float r0=baseR*(1-t0*.92f),r1=baseR*(1-t1*.92f);
     int k=thornV.Count;for(int c=0;c<4;c++){float a=c*Mathf.PI*.5f+.785f;Vector3 o=yaw*new Vector3(Mathf.Cos(a),0,Mathf.Sin(a));thornV.Add(p0+o*r0);thornV.Add(p1+o*r1);thornUv.Add(new Vector2(c/4f,t0));thornUv.Add(new Vector2(c/4f,t1));}
     for(int c=0;c<4;c++){int a0=k+c*2,a1=a0+1,b0=k+((c+1)%4)*2,b1=b0+1;thornT.Add(a0);thornT.Add(a1);thornT.Add(b0);thornT.Add(b0);thornT.Add(a1);thornT.Add(b1);}
     if(s==1||s==3||s==4){Vector3 mid=(p0+p1)*.5f;Vector3 outDir=yaw*Quaternion.Euler(0,s*97,0)*new Vector3(1,.35f,0);int q=thornV.Count;thornV.Add(mid+yaw*new Vector3(0,r0*.6f,0));thornV.Add(mid+yaw*new Vector3(0,-r0*.6f,0));thornV.Add(mid+outDir.normalized*(r0*3.2f+.06f));thornUv.Add(Vector2.zero);thornUv.Add(Vector2.zero);thornUv.Add(Vector2.one);thornT.Add(q);thornT.Add(q+1);thornT.Add(q+2);thornT.Add(q+2);thornT.Add(q+1);thornT.Add(q);}}
   }
   moodThornMesh.Clear();moodThornMesh.SetVertices(thornV);moodThornMesh.SetUVs(0,thornUv);moodThornMesh.SetTriangles(thornT,0);moodThornMesh.RecalculateNormals();moodThornMesh.RecalculateBounds();
  }

  // ---------------------------------------------------------------- the portal skirt: pieces break off and fall into the void
  void BossMoodFragments(){
   int n=CarrotQuality.Tier==CarrotQuality.LowTier?6:12;moodFragRng=new System.Random(9307+game.level.id*31+7);
   moodFragPos=new Vector3[n];moodFragVel=new Vector3[n];moodFragLife=new float[n];moodFragSize=new float[n];moodFragSpin=new float[n];for(int i=0;i<n;i++)moodFragLife[i]=-(float)moodFragRng.NextDouble()*3;
   moodFragMesh=new Mesh{name="Boss mood fragments"};moodFragMesh.MarkDynamic();moodOwned.Add(moodFragMesh);
   Material source=null;materials.TryGetValue("portal-foundation",out source);moodFragMaterial=source!=null?new Material(source){name="boss-mood-fragments"}:new Material(Shader.Find("Carrot/Storybook")){name="boss-mood-fragments"};moodFragMaterial.SetFloat("_Cull",0);moodOwned.Add(moodFragMaterial);
   var go=new GameObject("Boss mood fragments");moodObjects.Add(go);go.transform.SetParent(world,false);go.AddComponent<MeshFilter>().sharedMesh=moodFragMesh;var r=go.AddComponent<MeshRenderer>();r.sharedMaterial=moodFragMaterial;r.shadowCastingMode=ShadowCastingMode.Off;r.receiveShadows=true;
  }
  readonly List<Vector3> fragV=new List<Vector3>();readonly List<int> fragT=new List<int>();readonly List<Vector3> fragN=new List<Vector3>();
  void BossMoodFragmentTick(float dt,float de){
   moodFragClock+=dt;fragV.Clear();fragT.Clear();fragN.Clear();
   bool spawn=!reducedMotion&&de>.12f&&!(moodRelease>=0);
   for(int i=0;i<moodFragPos.Length;i++){
    if(moodFragLife[i]<0){moodFragLife[i]+=dt*(.4f+de);if(moodFragLife[i]>=0){if(!spawn){moodFragLife[i]=-1;continue;}
      float ang=(float)moodFragRng.NextDouble()*Mathf.PI*2;Vector3 center=new Vector3((moodBounds.x+moodBounds.z)*.5f,0,(moodBounds.y+moodBounds.w)*.5f);float hx=(moodBounds.z-moodBounds.x)*.5f+1.6f+(float)moodFragRng.NextDouble()*2.2f,hz=(moodBounds.w-moodBounds.y)*.5f+1.6f+(float)moodFragRng.NextDouble()*2.2f;
      Vector3 dir=new Vector3(Mathf.Cos(ang),0,Mathf.Sin(ang));float s=Mathf.Min(hx/Mathf.Max(.001f,Mathf.Abs(dir.x)),hz/Mathf.Max(.001f,Mathf.Abs(dir.z)));
      moodFragPos[i]=center+dir*s+Vector3.down*.15f;moodFragVel[i]=dir*.15f;moodFragSize[i]=.2f+(float)moodFragRng.NextDouble()*.2f;moodFragSpin[i]=(float)moodFragRng.NextDouble()*90-45;}
     else continue;}
    moodFragLife[i]+=dt;moodFragVel[i]+=Vector3.down*2*dt;moodFragPos[i]+=moodFragVel[i]*dt;
    if(moodFragPos[i].y<-9){moodFragLife[i]=-(1.5f+(float)moodFragRng.NextDouble()*1.5f);continue;}
    float sz=moodFragSize[i];Quaternion q=Quaternion.Euler(moodFragLife[i]*moodFragSpin[i],moodFragLife[i]*moodFragSpin[i]*.7f,0);int k=fragV.Count;
    for(int f=0;f<6;f++){Vector3 nrm=f==0?Vector3.up:f==1?Vector3.down:f==2?Vector3.right:f==3?Vector3.left:f==4?Vector3.forward:Vector3.back;Vector3 u=Mathf.Abs(nrm.y)>.5f?Vector3.right:Vector3.up;Vector3 w=Vector3.Cross(nrm,u);
     for(int c=0;c<4;c++){Vector3 corner=(nrm+u*((c&1)==0?-1:1)+w*((c&2)==0?-1:1))*.5f;fragV.Add(moodFragPos[i]+q*Vector3.Scale(corner,new Vector3(sz,sz*.55f,sz*.8f)));fragN.Add(q*nrm);}
     int b=k+f*4;fragT.Add(b);fragT.Add(b+1);fragT.Add(b+2);fragT.Add(b+2);fragT.Add(b+1);fragT.Add(b+3);}}
   moodFragMesh.Clear();if(fragV.Count>0){moodFragMesh.SetVertices(fragV);moodFragMesh.SetNormals(fragN);moodFragMesh.SetTriangles(fragT,0);moodFragMesh.RecalculateBounds();}
  }
 }
}
