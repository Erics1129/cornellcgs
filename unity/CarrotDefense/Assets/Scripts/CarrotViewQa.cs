#if UNITY_EDITOR || CARROT_QA
using System.Globalization;
using System.Text;
using UnityEngine;
using Unity.Mathematics;
using UnityEngine.Splines;
using UnityEngine.Rendering;

namespace CarrotTD {
 /// <summary>
 /// QA-only probes (editor and CARROT_QA builds): SendMessage('CarrotGame','QaDump','') logs one CARROT_QA_DUMP line with the route
 /// centreline and adjacent ground sample points in viewport space (for the path-to-ground luminance ratio), the pond outlines
 /// (water mask), visible idle effect renderers, the decor clearance, the flash governor and every CarrotQa counter.
 /// 'reset' clears the counters first.
 /// </summary>
 public sealed partial class CarrotView {
  /// <summary>Fires every plant family's impact (tier 3) and a death of every creature kind through the effects, one at a time from a
  /// cleared pool, and logs CARROT_QA_FX with the layer count per event, the decal and light peaks when everything fires together,
  /// and the smallest OKLab distance of the boss/creature ability colours to the tower palette.</summary>
  public void QaFxProbe(string unused){
   if(effects==null||game==null||game.level==null)return;var inv=CultureInfo.InvariantCulture;var sb=new StringBuilder(2048);sb.Append("CARROT_QA_FX level=").Append(game.level.id);
   Vector3 p=carrotPosition+new Vector3(-1.5f,0,-1);int minLayers=99;string minKind="";
   string[] kinds={"seed","frost","mortar","prism","storm","blossom","starfruit","gravity","book","thunder","bamboo","chili","lotus","magnet","orchid","mushroom","cactus","clockflower","dragonfruit","moonflower"};
   sb.Append(" impacts=");foreach(var k in kinds){int n=effects.ProbeLayers(new CarrotEvent("impact",k,p,p,0,0,3,40,.5f),out _,out _);sb.Append(k).Append(':').Append(n).Append(',');if(n<minLayers){minLayers=n;minKind=k;}}
   sb.Append(" deaths=");int minDeath=99;foreach(var d in CarrotData.AddedEnemies){int n=effects.ProbeLayers(new CarrotEvent("death",d.id,p,default(Vector3),0,0,1,d.reward,.8f),out _,out _);sb.Append(d.id).Append(':').Append(n).Append(',');minDeath=Mathf.Min(minDeath,n);}
   effects.Clear();foreach(var k in kinds){effects.Handle(new CarrotEvent("impact",k,p+new Vector3(UnityEngine.Random.Range(-2f,2f),0,UnityEngine.Random.Range(-1.5f,1.5f)),p,0,0,5,40,.5f));}foreach(var d in CarrotData.AddedEnemies)effects.Handle(new CarrotEvent("death",d.id,p,default(Vector3),0,0,1,d.reward,.8f));
   effects.ProbeTotals(out int decals,out int lights);effects.Clear();
   float minDe=9;string pair="";foreach(var a in new[]{"root","bark","uproot","mist","summon","blind","tithe","lanternFlood","breath","mantle","shatter","whiteout","rush","flock","heap","dusk","gust","liftoff","raise","gaze","brambleSurge","glacierLance","harvestMoon","cycloneCall","graveMarch","eyeClones","reincarnate","blackout","mossShield","emberCharge","stormLock","venomMist","wither","thornBind","chronoField","coinLeech","rally","mirrorSplit","fieldFreeze","graveCall","ironShell","sentinelRift","prismLances","spectrumRain","prismDash","prismaticAegis","mirrorRush","prismOverdrive"}){float de=CarrotEffects.AllyDistance(a);if(de<minDe){minDe=de;pair=a;}}
   sb.Append(" minImpactLayers=").Append(minLayers).Append('(').Append(minKind).Append(") minDeathLayers=").Append(minDeath).Append(" peakDecals=").Append(decals).Append(" peakLights=").Append(lights).Append(" minAllyDeltaE=").Append(minDe.ToString("F3",inv)).Append('(').Append(pair).Append(')');
   Debug.Log(sb.ToString());
  }
  /// <summary>CARROT_QA_CAMERA: for every route start, whether some pan at maximum zoom (inside the clamp) puts it inside the inner
  /// 90% of the view; and the on-screen height in pixels of the live boss's renderers (the follow-cam framing check).</summary>
  public void QaCameraProbe(string unused){
   if(game==null||game.level==null||GameCamera==null)return;var sb=new StringBuilder(512);sb.Append("CARROT_QA_CAMERA level=").Append(game.level.id);
   float keepZoom=targetZoom;Vector3 keepPan=targetPan;bool keepNudge=panNudged;int follow=followBoss;int reachable=0,starts=0;
   targetZoom=portraitCamera?2.5f:2.1f;
   foreach(var r in game.level.routes){starts++;Vector3 start=r[0];targetPan=new Vector3(start.x-cameraTarget.x,0,start.z-cameraTarget.z);ClampPan();Vector2 v=TargetViewport(start);if(v.x>.05f&&v.x<.95f&&v.y>.05f&&v.y<.95f)reachable++;}
   targetZoom=keepZoom;targetPan=keepPan;panNudged=keepNudge;followBoss=follow;
   sb.Append(" routeStarts=").Append(starts).Append(" reachableAtMaxZoom=").Append(reachable);
   foreach(var e in game.enemies){if(string.IsNullOrEmpty(e.boss)||!e.alive||e.clone||!enemies.TryGetValue(e.id,out var a))continue;
    float top=-1,bottom=float.MaxValue;foreach(var rend in a.renderers){if(rend==null||!rend.enabled)continue;var b=rend.bounds;for(int i=0;i<8;i++){Vector3 c=b.center+Vector3.Scale(b.extents,new Vector3((i&1)==0?-1:1,(i&2)==0?-1:1,(i&4)==0?-1:1));Vector3 s=GameCamera.WorldToScreenPoint(c);if(s.z<=0)continue;top=Mathf.Max(top,s.y);bottom=Mathf.Min(bottom,s.y);}}
    sb.Append(" boss=").Append(e.boss).Append(" bossPixels=").Append(top>bottom?(top-bottom).ToString("F0",CultureInfo.InvariantCulture):"0").Append(" following=").Append(followBoss==e.id?1:0);break;}
   sb.Append(" zoom=").Append(zoom.ToString("F2",CultureInfo.InvariantCulture)).Append(" screen=").Append(Screen.width).Append('x').Append(Screen.height);
   Debug.Log(sb.ToString());
  }
  /// <summary>CARROT_QA_RENDER: visible renderers by group (submesh draws, shadow casters), to attribute the draw budget.</summary>
  public void QaRenderCensus(string unused){
   var groups=new System.Collections.Generic.Dictionary<string,int[]>();
   foreach(var r in FindObjectsByType<Renderer>(FindObjectsSortMode.None)){if(!r.enabled||!r.gameObject.activeInHierarchy||!r.isVisible)continue;
    string g=r.name;var t=r.transform;while(t.parent!=null&&t.parent!=transform&&t.parent!=world){t=t.parent;}g=t.name;if(t.parent==world&&(g.EndsWith(" actor")))g="actor:"+g;
    if(r is ParticleSystemRenderer psr){var ps=r.GetComponent<ParticleSystem>();if(ps!=null&&ps.particleCount==0)continue;g="particles:"+r.name;}
    int subs=r is MeshRenderer mr&&r.GetComponent<MeshFilter>()!=null&&r.GetComponent<MeshFilter>().sharedMesh!=null?r.GetComponent<MeshFilter>().sharedMesh.subMeshCount:r is SkinnedMeshRenderer sk&&sk.sharedMesh!=null?sk.sharedMesh.subMeshCount:1;
    if(!groups.TryGetValue(g,out var v)){v=new int[2];groups[g]=v;}v[0]+=subs;if(r.shadowCastingMode!=ShadowCastingMode.Off)v[1]+=subs;}
   var sb=new StringBuilder(2048);sb.Append("CARROT_QA_RENDER level=").Append(game.level.id).Append(" tier=").Append(CarrotQuality.Name(CarrotQuality.Tier));int total=0,casters=0;
   var keys=new System.Collections.Generic.List<string>(groups.Keys);keys.Sort((a,b)=>groups[b][0].CompareTo(groups[a][0]));
   foreach(var k in keys){total+=groups[k][0];casters+=groups[k][1];}sb.Append(" draws=").Append(total).Append(" casters=").Append(casters).Append(" groups=");
   foreach(var k in keys)sb.Append(k.Replace(' ','_')).Append(':').Append(groups[k][0]).Append('/').Append(groups[k][1]).Append(',');
   Debug.Log(sb.ToString());
  }
  public void QaDump(string what){
   if(what=="reset"){CarrotQa.Reset();CarrotFlashGovernor.Reset();}
   if(game==null||game.level==null||GameCamera==null)return;var inv=CultureInfo.InvariantCulture;var sb=new StringBuilder(4096);
   sb.Append("CARROT_QA_DUMP level=").Append(game.level.id).Append(" phase=").Append(game.phase).Append(" tier=").Append(CarrotQuality.Name(CarrotQuality.Tier));
   var route=new StringBuilder();var ground=new StringBuilder();
   foreach(var r in game.level.routes){var spline=RouteSpline(r);float t=0;
    while(t<1){var q=SplineUtility.GetPointAtLinearDistance(spline,t,.6f,out float next);if(next<=t||next>=1)break;t=next;Vector3 c=new Vector3(q.x,0,q.z);if(Pond(c))continue;
     var tan=spline.EvaluateTangent(t);Vector3 side=Vector3.Cross(new Vector3(tan.x,0,tan.z).normalized,Vector3.up);
     Vector3 g=Vector3.zero;bool found=false;for(int k=-1;k<=1&&!found;k+=2){Vector3 p=c+side*k*1.15f;if(PathDistance(p)>.85f&&!Pond(p)){bool padNear=false;foreach(var pad in game.level.pads)if(Vector3.Distance(pad,p)<.6f)padNear=true;if(!padNear){g=p;found=true;}}}
     if(!found)continue;Vector3 vr=GameCamera.WorldToViewportPoint(new Vector3(c.x,SurfaceHeight(c)+.02f,c.z)),vg=GameCamera.WorldToViewportPoint(new Vector3(g.x,TerrainHeight(g),g.z));if(vr.z<=0||vg.z<=0)continue;
     route.Append(vr.x.ToString("F4",inv)).Append(',').Append(vr.y.ToString("F4",inv)).Append(';');ground.Append(vg.x.ToString("F4",inv)).Append(',').Append(vg.y.ToString("F4",inv)).Append(';');}}
   sb.Append(" route=").Append(route).Append(" ground=").Append(ground);
   if(game.level.biome=="marsh"){sb.Append(" ponds=");foreach(var p in PondCenters()){for(int i=0;i<16;i++){float a=i*Mathf.PI/8;Vector3 v=GameCamera.WorldToViewportPoint(p+new Vector3(Mathf.Cos(a)*1.35f,0,Mathf.Sin(a)*1.35f));sb.Append(v.x.ToString("F4",inv)).Append(',').Append(v.y.ToString("F4",inv)).Append(i==15?"|":";");}}}
   sb.Append(" fxIdleVisible=").Append(effects!=null?effects.IdleVisible(warmRoot):-1).Append(" decorClearance=").Append(DecorClearance().ToString("F2",inv));
   sb.Append(" flashGranted=").Append(CarrotFlashGovernor.Granted).Append(" flashCoalesced=").Append(CarrotFlashGovernor.Coalesced).Append(" timeScaleApi=").Append(SimulationTimeScaleAvailable?1:0);
   sb.Append(" sections=");int frames=Mathf.Max(1,CarrotQa.SectionFrames);foreach(var kv in CarrotQa.sectionTotals)sb.Append(kv.Key).Append(':').Append((kv.Value/frames).ToString("F3",inv)).Append(',');
   sb.Append(" counts=");foreach(var kv in CarrotQa.Counts)sb.Append(kv.Key).Append(':').Append(kv.Value.ToString("0.##",inv)).Append(',');
   Debug.Log(sb.ToString());
  }
 }
 public sealed partial class CarrotEffects {
  /// <summary>Distinct effect layers one event starts from a cleared pool: each particle system that gained particles, each pooled
  /// primitive kind that gained a live item (rings, bolts, shells, decals, lights, delayed and looping recipes, tubes, ghosts, orbits).</summary>
  public int ProbeLayers(CarrotEvent e,out int decals,out int lights){
   Clear();var before=ProbeCounts();Handle(e);var after=ProbeCounts();int n=0;for(int i=0;i<before.Length;i++)if(after[i]>before[i])n++;
   decals=0;lights=0;foreach(var l in live){if(l.k==K.Decal)decals++;if(l.k==K.Light)lights++;}foreach(var l in pendingLive){if(l.k==K.Decal)decals++;if(l.k==K.Light)lights++;}
   return n;
  }
  public void ProbeTotals(out int decals,out int lights){decals=0;lights=0;foreach(var s in pool.decals)if(s.busy)decals++;foreach(var s in pool.lights)if(s.busy)lights++;}
  int[] ProbeCounts(){var c=new int[7+10];c[0]=flash.ps.particleCount;c[1]=sparks.ps.particleCount;c[2]=smoke.ps.particleCount;c[3]=dust.ps.particleCount;c[4]=debris.ps.particleCount;c[5]=embers.ps.particleCount;c[6]=motes.ps.particleCount;
   foreach(var l in live)c[7+(int)l.k]++;foreach(var l in pendingLive)c[7+(int)l.k]++;return c;}
  /// <summary>Effect renderers that are on screen while not in use (the "white atlas quad" defect): pooled slots that are free but
  /// active and visible, licensed slots that are idle but active, and a shader warm-up rig that outlived its frames.</summary>
  public int IdleVisible(GameObject warm){
   int n=0;System.Action<FxPool.Slot[]> scan=slots=>{if(slots==null)return;foreach(var s in slots){if(s==null||s.busy||s.go==null||!s.go.activeInHierarchy)continue;var r=s.go.GetComponent<Renderer>();if(r!=null&&r.enabled&&r.isVisible)n++;}};
   scan(pool.rings);scan(pool.bolts);scan(pool.shells);scan(pool.decals);scan(pool.ghosts);scan(pool.tubes);scan(pool.emblems);scan(pool.superRings);
   if(warm!=null)foreach(var r in warm.GetComponentsInChildren<Renderer>())if(r.enabled&&r.isVisible)n++;
   if(licensedFx!=null)n+=licensedFx.IdleVisible();
   return n;
  }
 }
 public sealed partial class CarrotLicensedFx {
  public int IdleVisible(){int n=0;foreach(var s in slots)if(!s.active&&s.go!=null&&s.go.activeInHierarchy)foreach(var r in s.go.GetComponentsInChildren<Renderer>())if(r.enabled&&r.isVisible)n++;return n;}
 }
}
#endif
