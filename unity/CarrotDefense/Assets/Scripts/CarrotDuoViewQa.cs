#if UNITY_EDITOR || CARROT_QA
using System;
using System.Collections.Generic;
using System.Globalization;
using System.Text;
using UnityEngine;
using Cinemachine;

namespace CarrotTD {
 /// <summary>
 /// QA-only loopback scaffold of the duo and endless presentation (editor and CARROT_QA builds; SendMessage('CarrotGame','DuoQa',json)).
 /// It builds a duo pair or Twin Gates with no network and no net seam: the own half is the player's CarrotGame loaded with
 /// CarrotDuoMaps.Half (by swapping CarrotData.Levels[id-1] for the load, the ProtoMirror trick), and the partner's half is a second
 /// CarrotGame on 'CarrotPartner' (AutoTick off, no bridge) that a reference bot's commands drive exactly three ticks behind, so the
 /// replica is the mirrored match. Twin Gates loads the Endless LevelDef under level 19's tables (orchard, 13 waves, two routes) until
 /// the simulation stream's endless mode lands. At integration the lead swaps these loads for CarrotNet (LoadLevel(id,"duo",side)).
 /// Commands: {t:'duo',level,side} {t:'endless',seat} {t:'solo'} {t:'bot',on,coins} {t:'warp',ticks|wave} {t:'camera',mode}
 /// {t:'presence',seat,pad,tower} {t:'pending',demo} {t:'builders'} {t:'probe',what:'view'|'pads'|'partnerPoints'|'digest'|'counts'}.
 /// Every probe logs one line: CARROT_DUO_QA <what> {json}.
 /// </summary>
 public sealed partial class CarrotView {
  [Serializable] class DuoQaCommand {public string t="",what="",mode="";public int level,side,seat,on=-1,pad=-1,tower=-1,ticks,wave,demo,count=200,reset;public float coins,value,x,z,zoom;}
  sealed class DuoQaLoop {
   public string layout="";public int levelId,side,seat;public GameObject partner;public CarrotGame replica;public CarrotView view;
   public readonly List<KeyValuePair<int,string>> mirror=new List<KeyValuePair<int,string>>();public int mirrorRead,delay=3;
   public bool bot,warping;public int botNext,warpLeft,warpWave,warpPeak=-1,kindCursor,lastWave,waveCoins;public int[] padOrder;public float coins;
  }
  DuoQaLoop duoQa;
  partial void QaHolds(ref bool held){held=duoQa!=null;}
  static readonly CultureInfo Inv=CultureInfo.InvariantCulture;
  #if CARROT_QA && !UNITY_EDITOR
  [RuntimeInitializeOnLoadMethod(RuntimeInitializeLoadType.AfterSceneLoad)] static void DuoQaBoot(){
   var go=GameObject.Find("CarrotGame");if(go!=null){CarrotQaTelemetry.Enable(go.GetComponent<CarrotGame>());if(go.GetComponent<CarrotDuoQaDriver>()==null)go.AddComponent<CarrotDuoQaDriver>();}
   CarrotNetHooks.ViewEvent+=kind=>Debug.Log("CARROT_DUO_QA view {\"kind\":\""+kind+"\",\"t\":"+Time.realtimeSinceStartup.ToString("F3",Inv)+"}");
  }
  #endif
  public void DuoQa(string json){
   DuoQaCommand c;try{c=JsonUtility.FromJson<DuoQaCommand>(json);}catch(Exception){return;}if(c==null)return;
   if(GetComponent<CarrotDuoQaDriver>()==null)gameObject.AddComponent<CarrotDuoQaDriver>();
   switch(c.t){
    case "duo":DuoQaSetup(c.level,c.side==1?1:0);break;
    case "endless":DuoQaEndless(c.seat==1?1:0);break;
    case "solo":DuoQaTeardown();if(c.level>0){game.LoadLevel(c.level);duoQa=new DuoQaLoop{layout="solo",levelId=c.level,padOrder=QaPadOrder(game.level)};}else game.LoadLevel(1);break;
    case "bot":if(duoQa!=null){duoQa.bot=c.on!=0;if(duoQa.bot&&c.coins>0){duoQa.coins=c.coins;duoQa.waveCoins=Mathf.RoundToInt(c.coins/8);QaIssue("{\"type\":\"debugCoins\",\"value\":"+c.coins.ToString(Inv)+"}");}}break;
    case "warp":if(duoQa!=null&&!duoQa.warping){duoQa.warping=true;duoQa.warpLeft=c.ticks>0?c.ticks:200000;duoQa.warpWave=c.wave;duoQa.warpPeak=-1;game.AutoTick=false;game.Effect-=OnEffect;if(duoQa.view!=null&&duoQa.replica!=null)duoQa.replica.Effect-=duoQa.view.OnEffect;}break;
    case "partnerRender":if(duoQa!=null&&duoQa.partner!=null){foreach(var r in duoQa.partner.GetComponentsInChildren<Renderer>(true)){if(c.on==0)r.enabled=false;else if(c.on==1)r.enabled=true;if(c.demo==1)r.shadowCastingMode=UnityEngine.Rendering.ShadowCastingMode.Off;}if(c.wave>0&&duoQa.view!=null)duoQa.view.qaFreeze=c.wave==2;}break;
    case "look":{targetPan=new Vector3(c.x-cameraTarget.x,0,c.z-cameraTarget.z);if(c.zoom>0)targetZoom=Mathf.Clamp(c.zoom,MinZoom,portraitCamera?2.5f:2.1f);followBoss=-1;zoom=targetZoom;pan=targetPan;SnapCamera();break;}
    case "zoom":targetZoom=Mathf.Clamp(c.value,MinZoom,portraitCamera?2.5f:2.1f);followBoss=-1;ClampPan();break;
    case "camera":if(CarrotNetHooks.Camera!=null)CarrotNetHooks.Camera(c.mode);else NetCamera(c.mode);break;
    case "presence":if(CarrotNetHooks.Presence!=null)CarrotNetHooks.Presence(c.seat,c.pad,c.tower);else NetPresence(c.seat,c.pad,c.tower);break;
    case "pending":QaPending(c.demo!=0);break;
    case "builders":{int k=0;foreach(var t in game.towers)t.builder=k++%2;foreach(var a in towers.Values)if(a.builderMark!=null){Destroy(a.builderMark);a.builderMark=null;}break;}
    case "probe":DuoQaProbe(c);break;
   }
  }
  void QaLoadDef(CarrotGame g,int id,LevelDef def){var keep=CarrotData.Levels[id-1];CarrotData.Levels[id-1]=def;try{g.LoadLevel(id);}finally{CarrotData.Levels[id-1]=keep;}}
  DuoViewConfig QaConfig(int level,int side,bool spectator){
   var cfg=new DuoViewConfig{spectator=spectator,layout="duo",arena=CarrotDuoMaps.ArenaRect(level),own=CarrotDuoMaps.HalfRect(level,side),partner=CarrotDuoMaps.HalfRect(level,1-side),side=side,seat=0,team=spectator?new Color(.28f,.82f,.78f):new Color(1,.78f,.32f),partnerTeam=spectator?new Color(1,.78f,.32f):new Color(.28f,.82f,.78f),host=this};
   CarrotDuoMaps.Wall(level,out cfg.wallA,out cfg.wallB);return cfg;
  }
  void DuoQaSetup(int level,int side){
   DuoQaTeardown();if(!CarrotDuoMaps.IsDuoLevel(level)){Debug.LogWarning("CARROT_DUO_QA not a duo level "+level);return;}
   var q=duoQa=new DuoQaLoop{layout="duo",levelId=level,side=side};
   var own=CarrotDuoMaps.Half(level,side);var other=CarrotDuoMaps.Half(level,1-side);
   QaLoadDef(game,level,own);
   var go=new GameObject("CarrotPartner");go.SetActive(false);var rep=go.AddComponent<CarrotGame>();rep.AutoTick=false;rep.EnableBridge=false;
   var partnerCfg=QaConfig(level,1-side,true);if(CarrotNetHooks.AttachPartnerView!=null)CarrotNetHooks.AttachPartnerView(go,partnerCfg);else AttachPartnerView(go,partnerCfg);
   go.SetActive(true);QaLoadDef(rep,level,other);
   // The real bridge's replica has SnapshotEnabled=false; here the component simply never updates (the driver steps it), so the
   // loopback measures no snapshot JSON the shipped replica never builds.
   rep.enabled=false;
   q.partner=go;q.replica=rep;q.view=go.GetComponent<CarrotView>();
   var hostCfg=QaConfig(level,side,false);if(CarrotNetHooks.ConfigureHostView!=null)CarrotNetHooks.ConfigureHostView(hostCfg);else ConfigureDuo(hostCfg);
   q.padOrder=QaPadOrder(own);Debug.Log("CARROT_DUO_QA setup {\"layout\":\"duo\",\"level\":"+level+",\"side\":"+side+"}");
  }
  void DuoQaEndless(int seat){
   DuoQaTeardown();var q=duoQa=new DuoQaLoop{layout="endless",levelId=19,seat=seat};var src=CarrotDuoMaps.Endless;var solo=CarrotData.Level(19);
   var def=new LevelDef{id=19,name=src.name,biome=src.biome,boss="",startingGold=src.startingGold,waves=solo.waves,routes=src.routes,pads=src.pads,blockers=src.blockers};
   QaLoadDef(game,19,def);
   var cfg=new DuoViewConfig{spectator=false,layout="endless",arena=CarrotDuoMaps.EndlessRect,own=CarrotDuoMaps.EndlessHomeRect(seat),partner=CarrotDuoMaps.EndlessHomeRect(1-seat),side=0,seat=seat,team=new Color(1,.78f,.3f),partnerTeam=new Color(.32f,.86f,.8f),host=this};
   if(CarrotNetHooks.ConfigureHostView!=null)CarrotNetHooks.ConfigureHostView(cfg);else ConfigureDuo(cfg);
   q.padOrder=QaPadOrder(def);Debug.Log("CARROT_DUO_QA setup {\"layout\":\"endless\",\"seat\":"+seat+"}");
  }
  void DuoQaTeardown(){
   if(duoQa!=null){if(duoQa.warping){game.Effect+=OnEffect;game.AutoTick=true;}if(duoQa.partner!=null)Destroy(duoQa.partner);}
   duoQa=null;game.AutoTick=true;game.PendingOps.Clear();ConfigureDuo(default(DuoViewConfig));
  }
  static int[] QaPadOrder(LevelDef def){
   var order=new List<int>();for(int i=0;i<def.pads.Length;i++)order.Add(i);
   float D(int i){float best=99;foreach(var r in def.routes)for(int k=1;k<r.Length;k++)best=Mathf.Min(best,SegmentDistance(def.pads[i],r[k-1],r[k]));return best;}
   order.Sort((a,b)=>D(a).CompareTo(D(b))!=0?D(a).CompareTo(D(b)):a.CompareTo(b));return order.ToArray();
  }
  int QaOwnTicks=>Mathf.RoundToInt(game.elapsed*30f);
  /// <summary>Applies a command to the own half now and records it for the replica at the own tick it was issued after.</summary>
  void QaIssue(string json){game.Command(json);if(duoQa!=null&&duoQa.replica!=null)duoQa.mirror.Add(new KeyValuePair<int,string>(QaOwnTicks,json));}
  /// <summary>Per frame (CarrotDuoQaDriver, after the simulation): the bot, the silent warp and the replica three ticks behind.</summary>
  public void DuoQaTick(){
   var q=duoQa;if(q==null)return;
   if(q.warping){var sw=System.Diagnostics.Stopwatch.StartNew();
    while(sw.ElapsedMilliseconds<120&&q.warpLeft>0){if(q.bot)QaBot(true);if(game.phase!="playing"){if(game.phase=="ready"){QaIssue("{\"type\":\"start\"}");continue;}q.warpLeft=0;break;}game.StepSimulation(1f/30);QaReplica();q.warpLeft--;if(q.warpWave>0&&game.wave>=q.warpWave){if(q.warpPeak<0)q.warpPeak=QaOwnTicks;int alive=0;foreach(var en in game.enemies)if(en.alive)alive++;if(alive>=18||QaOwnTicks-q.warpPeak>=450)q.warpLeft=0;}}
    if(q.warpLeft<=0){q.warping=false;game.AutoTick=true;game.Effect+=OnEffect;if(q.view!=null&&q.replica!=null)q.replica.Effect+=q.view.OnEffect;Debug.Log("CARROT_DUO_QA warp {\"tick\":"+QaOwnTicks+",\"wave\":"+game.wave+",\"phase\":\""+game.phase+"\",\"alive\":"+game.enemies.Count+",\"towers\":"+game.towers.Count+"}");}
    return;}
   if(q.bot)QaBot(false);QaReplica();
  }
  void QaReplica(){
   var q=duoQa;if(q==null||q.replica==null)return;int target=Mathf.Max(0,QaOwnTicks-q.delay);var r=q.replica;
   for(int guard=0;guard<400;guard++){int rt=Mathf.RoundToInt(r.elapsed*30f);
    while(q.mirrorRead<q.mirror.Count&&q.mirror[q.mirrorRead].Key<=rt){r.Command(q.mirror[q.mirrorRead].Value);q.mirrorRead++;}
    if(rt>=target||r.phase!="playing"||r.paused)break;r.StepSimulation(1f/30);}
  }
  static readonly string[] QaKinds={"bamboo","mortar","seed","frost","prism","chili","cactus","starfruit","storm","thunder","magnet","orchid","book","lotus","blossom","gravity","mushroom","clockflower","dragonfruit","moonflower"};
  void QaBot(bool warp){
   var q=duoQa;var g=game;if(g.phase=="ready"){QaIssue("{\"type\":\"start\"}");return;}if(g.phase!="playing")return;
   if(g.wave!=q.lastWave){q.lastWave=g.wave;if(q.waveCoins>0)QaIssue("{\"type\":\"debugCoins\",\"value\":"+q.waveCoins+"}");}
   int t=QaOwnTicks;if(t<q.botNext)return;q.botNext=t+(warp?6:12);
   foreach(int pad in q.padOrder){bool used=false;foreach(var tw in g.towers)if(tw.pad==pad){used=true;break;}if(!used)foreach(var b in g.blockers)if(b.pad==pad){used=true;break;}if(used)continue;
    for(int k=0;k<QaKinds.Length;k++){var d=CarrotData.Tower(QaKinds[(q.kindCursor+k)%QaKinds.Length]);if(d==null||d.unlock>g.level.id||g.coins<d.cost[0])continue;q.kindCursor=(q.kindCursor+k+1)%QaKinds.Length;
     QaIssue("{\"type\":\"select\",\"selectionType\":\"pad\",\"id\":"+pad+"}");QaIssue("{\"type\":\"buy\",\"kind\":\""+d.id+"\"}");QaIssue("{\"type\":\"clear\"}");return;}
    break;}
   TowerState low=null;foreach(var tw in g.towers)if(tw.tier<4&&(low==null||tw.tier<low.tier))low=tw;
   if(low!=null){var d=CarrotData.Tower(low.kind);if(d!=null&&g.coins>=d.cost[low.tier]){QaIssue("{\"type\":\"select\",\"selectionType\":\"tower\",\"id\":"+low.id+"}");QaIssue("{\"type\":\"upgrade\"}");QaIssue("{\"type\":\"clear\"}");}}
  }
  void QaPending(bool demo){
   game.PendingOps.Clear();if(!demo)return;int s=1;
   foreach(int pad in duoQa!=null&&duoQa.padOrder!=null?duoQa.padOrder:new int[0]){bool used=false;foreach(var tw in game.towers)if(tw.pad==pad){used=true;break;}foreach(var b in game.blockers)if(b.pad==pad)used=true;if(used)continue;game.PendingOps.Add(new NetOp{s=s,k=game.NetTick+4,seat=duoCfg.seat,op="buy",pad=pad,kind=s%2==0?"frost":"seed"});if(++s>2)break;}
  }

  // ---- probes ---------------------------------------------------------------------------------------------------------------
  static string F(float v){return v.ToString("F3",Inv);}
  static string V(Vector3 v){return "["+F(v.x)+","+F(v.y)+","+F(v.z)+"]";}
  Vector2 CssPoint(Vector3 world,out bool front){Vector3 s=GameCamera.WorldToScreenPoint(world);front=s.z>0;float k=Mathf.Max(.01f,inputPixelScale);return new Vector2(s.x/k,(Screen.height-s.y)/k);}
  void DuoQaProbe(DuoQaCommand c){
   var sb=new StringBuilder(2048);string what=string.IsNullOrEmpty(c.what)?"view":c.what;sb.Append("CARROT_DUO_QA ").Append(what).Append(' ');
   if(what=="digest"){sb.Append("{\"digest\":\"").Append(game.Digest().ToString("x16")).Append("\",\"discrete\":\"").Append(game.DiscreteDigest().ToString("x16")).Append("\",\"selection\":\"").Append(game.selectionType).Append("\",\"selectionId\":").Append(game.selectionId).Append(",\"coins\":").Append(game.coins).Append(",\"towers\":").Append(game.towers.Count).Append(",\"tick\":").Append(QaOwnTicks).Append(",\"paused\":").Append(game.paused?1:0).Append('}');}
   else if(what=="sections"){if(c.reset!=0){CarrotQa.Reset();sb.Append("{\"reset\":1}");}else{int frames=Mathf.Max(1,CarrotQa.SectionFrames);double view=0,spectator=0,qa=0;sb.Append("{\"frames\":").Append(frames).Append(",\"sections\":{");bool first=true;
     foreach(var kv in CarrotQa.sectionTotals){double ms=kv.Value/frames;if(kv.Key.StartsWith("qa.")||kv.Key=="spectator.gap")qa+=ms;else if(kv.Key.StartsWith("spectator."))spectator+=ms;else view+=ms;if(!first)sb.Append(',');first=false;sb.Append('"').Append(kv.Key).Append("\":").Append(ms.ToString("F4",Inv));}
     sb.Append("},\"viewMs\":").Append(view.ToString("F4",Inv)).Append(",\"spectatorMs\":").Append(spectator.ToString("F4",Inv)).Append(",\"qaMs\":").Append(qa.ToString("F4",Inv)).Append(",\"alive\":").Append(game.enemies.Count);
     if(duoQa!=null&&duoQa.replica!=null)sb.Append(",\"partnerAlive\":").Append(duoQa.replica.enemies.Count).Append(",\"partnerDormant\":").Append(duoQa.view!=null&&duoQa.view.dormant?1:0);sb.Append('}');}}
   else if(what=="pads"){
    float min=999;int selectable=0;sb.Append("{\"pads\":[");Vector3 right=GameCamera.transform.right;right.y=0;right.Normalize();
    for(int i=0;i<game.level.pads.Length;i++){Vector3 p=game.level.pads[i];p.y=TerrainHeight(p)+.12f;var a=CssPoint(p,out bool fa);var b=CssPoint(p+right*.47f,out bool fb);float r=(b-a).magnitude;bool on=fa&&a.x>=0&&a.y>=0&&a.x<=Screen.width/inputPixelScale&&a.y<=Screen.height/inputPixelScale;
     Vector3 sp=GameCamera.WorldToScreenPoint(p);var hit=ClickableAt(new Vector2(sp.x,sp.y));bool ok=hit!=null&&(hit.type=="pad"&&hit.id==i||hit.type=="tower"&&TowerOnPad(hit.id)==i||hit.type=="blocker"&&BlockerOnPad(hit.id)==i);if(ok)selectable++;if(on)min=Mathf.Min(min,r);
     if(i>0)sb.Append(',');sb.Append("[").Append(F(a.x)).Append(',').Append(F(a.y)).Append(',').Append(F(r)).Append(',').Append(on?1:0).Append(',').Append(ok?1:0).Append(']');}
    sb.Append("],\"minRadiusPx\":").Append(F(min)).Append(",\"selectable\":").Append(selectable).Append(",\"count\":").Append(game.level.pads.Length).Append('}');}
   else if(what=="partnerPoints"){
    var r=duoCfg.partner;var rng=new System.Random(c.seat*7+31);int made=0;sb.Append("{\"points\":[");float w=Screen.width/inputPixelScale,h=Screen.height/inputPixelScale;
    for(int i=0;i<c.count*20&&made<c.count&&r.width>0;i++){Vector3 g=new Vector3(Mathf.Lerp(r.xMin+.8f,r.xMax-.8f,(float)rng.NextDouble()),0,Mathf.Lerp(r.yMin+.8f,r.yMax-.8f,(float)rng.NextDouble()));var a=CssPoint(g,out bool front);if(!front||a.x<30||a.y<30||a.x>w-30||a.y>h-30)continue;Vector3 sp=GameCamera.WorldToScreenPoint(g);if(ClickableAt(new Vector2(sp.x,sp.y))!=null)continue;if(made++>0)sb.Append(',');sb.Append('[').Append(F(a.x)).Append(',').Append(F(a.y)).Append(']');}
    sb.Append("]}");}
   else if(what=="visible"){
    // Renderers drawn last frame under each top-level object, by the name of their actor or decoration parent (perf triage).
    var groups=new Dictionary<string,int>();foreach(var root in new[]{gameObject,duoQa!=null?duoQa.partner:null}){if(root==null)continue;foreach(var r in root.GetComponentsInChildren<Renderer>(false)){if(!r.enabled||!r.isVisible)continue;var t=r.transform;string key=root.name+"/";var p=t;while(p.parent!=null&&p.parent!=root.transform&&p.parent.parent!=root.transform)p=p.parent;key+=p.name.Length>28?p.name.Substring(0,28):p.name;if(r.shadowCastingMode!=UnityEngine.Rendering.ShadowCastingMode.Off)key+=" [cast]";groups.TryGetValue(key,out var n);groups[key]=n+1;}}
    sb.Append('{');bool first=true;foreach(var kv in groups){if(!first)sb.Append(',');first=false;sb.Append('"').Append(kv.Key.Replace("\"","'")).Append("\":").Append(kv.Value);}sb.Append('}');}
   else if(what=="counts"){sb.Append('{');bool first=true;foreach(var kv in CarrotQa.Counts){if(!first)sb.Append(',');first=false;sb.Append('"').Append(kv.Key).Append("\":").Append(kv.Value.ToString("R",Inv));}sb.Append('}');}
   else ProbeView(sb);
   Debug.Log(sb.ToString());
  }
  int TowerOnPad(int id){foreach(var t in game.towers)if(t.id==id)return t.pad;return -1;}
  int BlockerOnPad(int id){foreach(var b in game.blockers)if(b.id==id)return b.pad;return -1;}
  /// <summary>Camera, framing and the spectator invariants (counted on the partner object, so a spectator that never spawned fails the actor check).</summary>
  void ProbeView(StringBuilder sb){
   float tangent=Mathf.Tan(GameCamera.fieldOfView*Mathf.Deg2Rad*.5f),aspect=Mathf.Max(.3f,GameCamera.aspect);float soloFit=SoloFitFor(portraitCamera,tangent,aspect);
   sb.Append("{\"level\":").Append(game.level.id).Append(",\"layout\":\"").Append(DuoLayout).Append("\",\"side\":").Append(duoCfg.side).Append(",\"seat\":").Append(duoCfg.seat).Append(",\"mode\":\"").Append(netCameraMode).Append('"');
   sb.Append(",\"portrait\":").Append(portraitCamera?1:0).Append(",\"fit\":").Append(F(fitDistance)).Append(",\"soloFit\":").Append(F(soloFit)).Append(",\"fitRatio\":").Append(F(soloFit>0?fitDistance/soloFit:0));
   sb.Append(",\"zoom\":").Append(F(zoom)).Append(",\"targetZoom\":").Append(F(targetZoom)).Append(",\"bothZoom\":").Append(F(bothZoom)).Append(",\"pan\":").Append(V(pan)).Append(",\"targetPan\":").Append(V(targetPan));
   sb.Append(",\"angle\":").Append(V(cameraAngle.eulerAngles)).Append(",\"target\":").Append(V(cameraTarget)).Append(",\"settled\":").Append(Mathf.Abs(zoom-targetZoom)<.002f&&(pan-targetPan).magnitude<.01f?1:0);
   int inView=0;var arena=duoCfg.arena;if(arena.width>0)for(int i=0;i<4;i++){Vector3 v=GameCamera.WorldToViewportPoint(new Vector3((i&1)==0?arena.xMin:arena.xMax,0,(i&2)==0?arena.yMin:arena.yMax));if(v.z>0&&v.x>=0&&v.x<=1&&v.y>=0&&v.y<=1)inView++;}
   Vector3 ov=GameCamera.WorldToViewportPoint(new Vector3(duoCfg.own.center.x,0,duoCfg.own.center.y)),pv=GameCamera.WorldToViewportPoint(new Vector3(duoCfg.partner.center.x,0,duoCfg.partner.center.y));
   sb.Append(",\"partnerCoverage\":").Append(F(duoCfg.partner.width>0?ViewCoverage(duoCfg.partner):0)).Append(",\"fog\":[").Append(F(RenderSettings.fogStartDistance)).Append(',').Append(F(RenderSettings.fogEndDistance)).Append("],\"heightFog\":").Append(V(Shader.GetGlobalVector("_CarrotHeightFog")));
   sb.Append(",\"arenaCornersInView\":").Append(inView).Append(",\"ownVp\":").Append(V(ov)).Append(",\"partnerVp\":").Append(V(pv)).Append(",\"ownNearer\":").Append(ov.y<pv.y?1:0);
   sb.Append(",\"hostSun\":").Append(sun!=null&&sun.enabled&&sun.gameObject.activeInHierarchy?1:0).Append(",\"digest\":\"").Append(game.Digest().ToString("x16")).Append('"');
   // Props must stay out of the wall strip (|x| < .5 on axis X, |z| < .5 on L29).
   float strip=99;bool zAxis=AxisZ;foreach(var d in decorLog){if(d.w<.5f)continue;float c=zAxis?Mathf.Abs(d.y):Mathf.Abs(d.x);strip=Mathf.Min(strip,c-d.z*.5f);}if(!DuoHalves)strip=-1;sb.Append(",\"propWallClearance\":").Append(F(strip));
   var q=duoQa;var partner=q!=null?q.partner:GameObject.Find("CarrotPartner");
   if(partner!=null){var v=partner.GetComponent<CarrotView>();var rg=partner.GetComponent<CarrotGame>();int playing=0;var sources=partner.GetComponentsInChildren<AudioSource>(true);foreach(var s in sources)if(s.isPlaying)playing++;
    // Both counts as of the end of the spectator's last frame: the replica may have ticked since (the driver runs after it).
    int expected=v!=null&&v.lastExpected>=0?v.lastExpected:rg!=null?rg.enemies.Count+rg.towers.Count:-1,actors=v!=null&&v.lastActors>=0?v.lastActors:v!=null?v.enemies.Count+v.towers.Count:-1;
    sb.Append(",\"partner\":{\"view\":").Append(v!=null&&v.Spectator?1:0).Append(",\"dormant\":").Append(v!=null&&v.dormant?1:0).Append(",\"actors\":").Append(actors).Append(",\"expected\":").Append(expected).Append(",\"tick\":").Append(rg!=null?Mathf.RoundToInt(rg.elapsed*30f):-1);
    sb.Append(",\"audioSources\":").Append(sources.Length).Append(",\"audioPlaying\":").Append(playing).Append(",\"cinemachine\":").Append(partner.GetComponentsInChildren<CinemachineVirtualCameraBase>(true).Length).Append(",\"lights\":").Append(partner.GetComponentsInChildren<Light>(true).Length);
    sb.Append(",\"cameras\":").Append(partner.GetComponentsInChildren<Camera>(true).Length).Append(",\"colliders\":").Append(partner.GetComponentsInChildren<Collider>(true).Length).Append(",\"clickables\":").Append(partner.GetComponentsInChildren<CarrotClickable>(true).Length);
    sb.Append(",\"volumes\":").Append(partner.GetComponentsInChildren<UnityEngine.Rendering.Volume>(true).Length).Append(",\"timeScale\":").Append(Count("spectator.timeScale")).Append(",\"timeScaleRequests\":").Append(rg!=null?rg.TimeScaleRequestCount:-1).Append(",\"actorMismatchMax\":").Append(Count("spectator.actorMismatch")).Append(",\"events\":").Append(Count("spectator.events")).Append(",\"dropped\":").Append(Count("spectator.eventsDropped")).Append('}');}
   sb.Append(",\"counts\":{\"partnerTap\":").Append(Count("duo.partnerTap")).Append(",\"wallTap\":").Append(Count("duo.wallTap")).Append(",\"pendingGhosts\":").Append(PendingGhostCount).Append(",\"presence\":").Append(presenceRing!=null&&presenceRing.enabled?1:0).Append(",\"builderTint\":").Append(Count("duo.builderTint")).Append(",\"rosterQueued\":").Append(Count("duo.rosterQueued")).Append(",\"rosterWarmed\":").Append(Count("duo.rosterWarmed")).Append(",\"timeScaleRefused\":").Append(Count("duo.timeScaleRefused")).Append('}');
   sb.Append(",\"phase\":\"").Append(game.phase).Append("\",\"wave\":").Append(game.wave).Append(",\"alive\":").Append(game.enemies.Count).Append(",\"towers\":").Append(game.towers.Count).Append('}');
  }
  static double Count(string key){return CarrotQa.Counts.TryGetValue(key,out var v)?v:0;}
  /// <summary>The fit solo uses for this level at this aspect (the "within 3% of the solo fit" reference).</summary>
  float SoloFitFor(bool portrait,float tangent,float aspect){
   var solo=CarrotData.Level(game.level.id);if(solo==null)return 0;var pts=new List<Vector3>();foreach(var r in solo.routes)pts.AddRange(r);pts.AddRange(solo.pads);var keep=cameraAngle;float d;
   if(solo.biome=="prism"){cameraAngle=portrait?Quaternion.Euler(53,90,0):Quaternion.Euler(47,-7,0);EnvelopeFit(pts,.78f,2.75f,tangent,aspect,.96f,portrait?.89f:.91f,.3f,.5f,out _,out d);}
   else if(portrait){cameraAngle=Quaternion.Euler(50,88,0);EnvelopeFit(pts,.66f,string.IsNullOrEmpty(solo.boss)?1.8f:2.65f,tangent,aspect,.96f,.86f,.2f,.4f,out _,out d);}
   else d=SoloBoxFit(tangent,aspect);
   cameraAngle=keep;return d;
  }
 }
 /// <summary>QA-only: runs the duo loopback after the player's simulation each frame.</summary>
 [DefaultExecutionOrder(50)]
 public sealed class CarrotDuoQaDriver : MonoBehaviour {
  CarrotView view;
  void Update(){if(view==null)view=GetComponent<CarrotView>();if(view!=null){CarrotQa.Section("qa.gap");view.DuoQaTick();CarrotQa.Section("qa.replica");}}
 }
}
#endif
