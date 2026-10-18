using System;
using System.Collections.Generic;
using UnityEngine;
using UnityEngine.Rendering;

namespace CarrotTD {
 /// <summary>
 /// Duo boss fights and two-player endless in the view (maps-and-view stream). The simulation never sees any of this: it is the
 /// presentation of a duo half, of the partner's replica half and of the Twin Gates map, configured through CarrotNetHooks.
 ///
 ///  - Configuration. <see cref="ConfigureDuo"/> takes the contract's DuoViewConfig before the view builds anything. The player's own view
 ///    (the CarrotView on 'CarrotGame') is the host: it keeps the camera, lights, sky, audio and input, builds its own half (or the whole
 ///    endless map) and the shared dressing (the divider, the arena-wide stone ring). A spectator view (the CarrotView the hook adds to the
 ///    inactive 'CarrotPartner' replica) builds and animates only the partner's half: no camera, Cinemachine, lights, Volume, sky, quality
 ///    watcher, music, ambience or AudioSources, no blind overlay or boss-entrance timeline, no input, colliders or CarrotClickables, no
 ///    time-scale requests and no Shader-global or RenderSettings writes. It borrows the host's materials and camera.
 ///  - Frames. Every map is authored on the solo grid, so a duo half is the solo level mapped by x-8 / 8-x (z+5 / -(z+5) on L29), and
 ///    Twin Gates is two solo-sized wings mirrored about x=0. The decoration builders keep the solo code and its random streams and map
 ///    each placement through the active frame (<see cref="FW"/>): identity in solo, so solo levels are built bit for bit as before.
 ///    Placements on the seam side are cut (<see cref="FCut"/>), so the 1-unit wall strip stays clear. The terrain height is one global
 ///    function in duo (both halves' paths near the seam, hills only at the arena's outer edges), so the two half meshes meet exactly.
 ///  - Camera. Landscape duo frames the own half like solo (the same fit, yaw mirrored for the mirrored half) with the partner's half past
 ///    the divider; drag pans at zoom 1 across the arena; "Both" zooms out to fit the arena; "Watch" glides to the partner's half. Portrait
 ///    yaws +-90 degrees with the own half nearest; on L29 the north player looks from the north (yaw +180). Reduced motion cuts.
 ///  - The wall. A tap on the partner's half changes nothing: it clears the own selection, shimmers the divider and raises the
 ///    view event "partnerTap". Range rings are clipped at the wall.
 ///  - Endless: the partner's presence ring, ghost sprouts for the local seat's pending ops (dissolving on reject) and a builder tint.
 ///  - Lag. The spectator goes dormant when the partner's half covers under 10% of the screen (actors at 4 Hz, no effects), filters the
 ///    partner's events to a cheap set (shots from a 40-mote pool, death puffs, builds, telegraphs, the carrot and the outcome), runs no
 ///    crowd separation or aim rigs, casts no actor shadows below High, and dresses each half at 60% of the solo budget. The level's
 ///    whole roster is instantiated off-screen once during the lobby and the side reveal, so no creature's first appearance links a
 ///    shader mid-wave.
 /// </summary>
 public sealed partial class CarrotView {
  // ---- configuration -----------------------------------------------------------------------------------------------------------
  DuoViewConfig duoCfg;bool duoOn;LevelDef duoOther;
  static CarrotView hostView;
  /// <summary>True for the partner's replica view.</summary>
  public bool Spectator=>duoOn&&duoCfg.spectator;
  /// <summary>True while this view draws a duo half or the endless map.</summary>
  public bool DuoActive=>duoOn;
  public string DuoLayout=>duoOn?duoCfg.layout:"";
  bool DuoHalves=>duoOn&&duoCfg.layout=="duo";
  bool EndlessMap=>duoOn&&duoCfg.layout=="endless";
  bool DuoHost=>duoOn&&!duoCfg.spectator;
  bool AxisZ=>DuoHalves&&game!=null&&game.level!=null&&CarrotDuoMaps.SideLayout(game.level.id)==DuoAxis.Z;
  CarrotView HostOf=>duoCfg.host!=null?duoCfg.host:hostView;
  /// <summary>The spectator animates at the match's speed and pause (the host's), not the replica's own fields.</summary>
  CarrotGame ClockGame{get{if(Spectator){var h=HostOf;if(h!=null&&h.game!=null)return h.game;}return game;}}
  float ViewGameSpeed=>ClockGame.speed;
  bool ViewGamePaused=>ClockGame.paused;
  static readonly Color DefaultTeam=new Color(1f,.78f,.3f),DefaultPartnerTeam=new Color(.32f,.86f,.8f);
  // The bridge's convention: `team` is the colour of the half this view draws (gold on the host, teal on the spectator) and
  // `partnerTeam` the other half's. Local-player cues (the shimmer, builder rings of the own seat) use the host's own colour.
  /// <summary>The colour of the half this view draws.</summary>
  Color HalfColour=>duoCfg.team.a>.01f?duoCfg.team:Spectator?DefaultPartnerTeam:DefaultTeam;
  Color OtherColour=>duoCfg.partnerTeam.a>.01f?duoCfg.partnerTeam:Spectator?DefaultTeam:DefaultPartnerTeam;
  /// <summary>The local player's colour (warm gold by default) and the partner's (teal).</summary>
  Color LocalColour=>Spectator?OtherColour:HalfColour;
  Color PartnerColour=>Spectator?HalfColour:OtherColour;

  [RuntimeInitializeOnLoadMethod(RuntimeInitializeLoadType.SubsystemRegistration)] static void ResetDuoStatics(){hostView=null;}
  /// <summary>Registers the view side of CarrotNetHooks (the bridge calls them; every hook is optional).</summary>
  [RuntimeInitializeOnLoadMethod(RuntimeInitializeLoadType.BeforeSceneLoad)] static void RegisterNetHooks(){
   CarrotNetHooks.AttachPartnerView=AttachPartnerView;
   CarrotNetHooks.ConfigureHostView=cfg=>{var h=FindHost();if(h==null)return;cfg.spectator=false;h.ConfigureDuo(cfg);};
   CarrotNetHooks.Camera=mode=>{var h=FindHost();if(h!=null)h.NetCamera(mode);};
   CarrotNetHooks.Presence=(seat,pad,tower)=>{var h=FindHost();if(h!=null)h.NetPresence(seat,pad,tower);};
  }
  static CarrotView FindHost(){if(hostView!=null)return hostView;var go=GameObject.Find("CarrotGame");return go!=null?go.GetComponent<CarrotView>():null;}
  /// <summary>Adds a spectator CarrotView to the partner's replica object. The object must not be 'CarrotGame'; it is (re)activated
  /// only after the view is configured, so its Awake already knows it is a spectator.</summary>
  public static void AttachPartnerView(GameObject go,DuoViewConfig cfg){
   if(go==null)return;if(go.name=="CarrotGame"){Debug.LogError("CarrotDuoView: the replica object must not be named CarrotGame");return;}
   cfg.spectator=true;if(cfg.host==null)cfg.host=FindHost();if(string.IsNullOrEmpty(cfg.layout))cfg.layout="duo";
   bool wasActive=go.activeSelf;if(wasActive)go.SetActive(false);
   var v=go.GetComponent<CarrotView>();if(v==null)v=go.AddComponent<CarrotView>();v.ConfigureDuo(cfg);
   if(wasActive)go.SetActive(true);
  }
  /// <summary>Configures this view for a duo half ("duo"), the endless map ("endless") or, with an empty layout, single player again.
  /// The next frame rebuilds the level. The host keeps its own camera rig; a spectator must be configured before its Awake.</summary>
  public void ConfigureDuo(DuoViewConfig cfg){
   bool on=!string.IsNullOrEmpty(cfg.layout);
   if(!on){if(duoOn&&!duoCfg.spectator)LeaveDuo();duoOn=false;duoCfg=default(DuoViewConfig);duoBuilt=false;levelId=-1;return;}
   if(cfg.spectator&&cfg.host==null)cfg.host=FindHost();
   duoCfg=cfg;duoOn=true;duoBuilt=false;levelId=-1;netCameraMode="own";bothZoom=1;
   if(!cfg.spectator){targetZoom=1;targetPan=Vector3.zero;followBoss=-1;}
   CarrotQa.Count(cfg.spectator?"duo.configure.spectator":"duo.configure.host",1);
  }
  /// <summary>Host only: back to single player (fog, shadow distance, audio pan and the weather box are restored on the next build).</summary>
  void LeaveDuo(){netCameraMode="own";bothZoom=1;presenceSeat=-1;ClearPendingGhosts();if(presenceRing!=null)presenceRing.enabled=false;if(sound!=null)sound.ListenerX=0;}

  // ---- frames -----------------------------------------------------------------------------------------------------------------
  /// <summary>A solo-grid frame: world = origin + (sx * local.x, local.y, sz * local.z), sx and sz +-1. The seam (wall or the endless
  /// centre line) is local +x = seamAt on axis X frames and local -z = seamAt on the L29 stack.</summary>
  struct DuoFrame {public Vector3 origin;public float sx,sz,seamAt,budget;public bool seamX,seamZ;public int seed;}
  readonly List<DuoFrame> duoFrames=new List<DuoFrame>();DuoFrame fr;bool framing;
  /// <summary>TerrainHeight's outer-edge line (|x| beyond it rises into hills) and the terrain mesh extent in x (solo: 7.8 and +-24).</summary>
  float terrainHalfX=7.8f,terrainMinX=-24,terrainMaxX=24;
  Vector3 FW(Vector3 local){return framing?new Vector3(fr.origin.x+fr.sx*local.x,fr.origin.y+local.y,fr.origin.z+fr.sz*local.z):local;}
  Vector3 FDir(Vector3 d){return framing?new Vector3(fr.sx*d.x,d.y,fr.sz*d.z):d;}
  float FYaw(float yaw){return framing&&fr.sx*fr.sz<0?-yaw:yaw;}
  /// <summary>Mirrored orientation for a mirror-symmetric prop: M R M (x mirror: (x,-y,-z); z mirror: (-x,-y,z)).</summary>
  Quaternion FRot(float x,float y,float z){if(!framing||fr.sx*fr.sz>0)return Quaternion.Euler(x,y,z);return fr.sx<0?Quaternion.Euler(x,-y,-z):Quaternion.Euler(-x,-y,z);}
  /// <summary>True when a local placement would reach the seam strip (or the partner's side) of a framed pass.</summary>
  bool FCut(Vector3 local,float margin=.7f){if(!framing)return false;if(fr.seamX&&local.x>fr.seamAt-margin)return true;if(fr.seamZ&&local.z<fr.seamAt+margin)return true;return false;}
  int FSeed=>framing?fr.seed:0;
  float FBudget=>framing?fr.budget:1;
  /// <summary>Runs a solo decoration builder once per frame of this view (once, unmapped, in solo).</summary>
  void ForFrames(Action build){if(!duoOn||duoFrames.Count==0){build();return;}for(int i=0;i<duoFrames.Count;i++){fr=duoFrames[i];framing=true;try{build();}finally{framing=false;}}}
  /// <summary>World to solo-grid coordinates of this view's own (first) frame, outside a framed pass (ponds, prism bounds).</summary>
  Vector3 OwnLocal(Vector3 w){if(!duoOn||duoFrames.Count==0)return w;var f=duoFrames[0];return new Vector3((w.x-f.origin.x)*f.sx,w.y-f.origin.y,(w.z-f.origin.z)*f.sz);}
  Vector3 OwnWorld(Vector3 l){if(!duoOn||duoFrames.Count==0)return l;var f=duoFrames[0];return new Vector3(f.origin.x+f.sx*l.x,f.origin.y+l.y,f.origin.z+f.sz*l.z);}
  bool duoBuilt;
  void PrepareDuoFrames(){
   // Safety net for the end of a match: once a duo build happened, a solo LevelDef loaded with NetMode back to None means the
   // session is over (the bridge configures the host view at the start only), so the view returns to single player by itself.
   if(duoOn&&!Spectator&&duoBuilt&&game!=null&&game.level!=null&&game.NetMode==NetMode.None&&game.level.id!=CarrotDuoMaps.EndlessId&&game.level==CarrotData.Level(game.level.id)&&!QaHoldsDuo()){CarrotQa.Count("duo.autoClear",1);LeaveDuo();duoOn=false;duoCfg=default(DuoViewConfig);duoBuilt=false;}
   duoFrames.Clear();duoOther=null;terrainHalfX=7.8f;terrainMinX=-24;terrainMaxX=24;netCameraMode="own";
   if(!duoOn||game==null||game.level==null)return;int id=game.level.id;duoBuilt=true;
   if(Spectator&&HostOf!=null){skyZenith=HostOf.skyZenith;skyHorizon=HostOf.skyHorizon;}
   if(DuoHalves&&CarrotDuoMaps.IsDuoLevel(id)){
    bool z=CarrotDuoMaps.SideLayout(id)==DuoAxis.Z;int side=duoCfg.side==1?1:0;
    Vector3 o=CarrotDuoMaps.MapPoint(Vector3.zero,z,side),ax=CarrotDuoMaps.MapPoint(Vector3.right,z,side)-o,az=CarrotDuoMaps.MapPoint(Vector3.forward,z,side)-o;
    duoFrames.Add(new DuoFrame{origin=o,sx=Mathf.Sign(ax.x),sz=Mathf.Sign(az.z),seamX=!z,seamZ=z,seamAt=z?-CarrotDuoMaps.StackOffset:CarrotDuoMaps.Offset,budget=.6f});
    duoOther=CarrotDuoMaps.Half(id,1-side);
    if(!z){terrainHalfX=CarrotDuoMaps.Offset+7.8f;terrainMinX=side==0?-32:0;terrainMaxX=side==0?0:32;}
   }else if(EndlessMap){
    for(int w=0;w<2;w++)duoFrames.Add(new DuoFrame{origin=new Vector3(w==0?-7:7,0,0),sx=w==0?1:-1,sz=1,seamX=true,seamAt=7,seed=w*7919,budget=.6f});
    terrainHalfX=14.8f;terrainMinX=-31;terrainMaxX=31;
   }
  }
  /// <summary>Path distance for the terrain height: in duo the other half's paths count within 1.6 u of the wall, so both half meshes
  /// evaluate one function along the seam and meet without a step or a lighting crease.</summary>
  float TerrainPathDistance(Vector3 p){
   float d=PathDistance(p);if(duoOther==null)return d;
   if(Mathf.Abs(p.x)<1.6f)foreach(var route in duoOther.routes)for(int i=1;i<route.Length;i++)d=Mathf.Min(d,SegmentDistance(p,route[i-1],route[i]));
   return d;
  }
  /// <summary>Duo: a prop whose footprint reaches the 1-unit wall strip (EnsureClearance may push a prop away from a seam gate's path
  /// and toward the wall) is dropped, so the strip only ever holds the divider.</summary>
  bool DuoSeamHit(Vector3 c,float half){if(!DuoHalves||duoFrames.Count==0)return false;return (duoFrames[0].seamZ?Mathf.Abs(c.z):Mathf.Abs(c.x))-half<.5f;}
  /// <summary>Both halves' free-space test (the arena-wide stone ring).</summary>
  bool FreeBothHalves(Vector3 p,float margin){
   if(!IsFree(p,margin))return false;if(duoOther==null)return true;
   foreach(var route in duoOther.routes)for(int i=1;i<route.Length;i++)if(SegmentDistance(p,route[i-1],route[i])<margin)return false;
   foreach(var q in duoOther.pads)if(Vector3.Distance(p,q)<margin)return false;return true;
  }
  /// <summary>Seam-column normals from the shared height function (central differences), so the two half meshes shade as one.</summary>
  void SeamNormals(Vector3[] vertices,Vector3[] normals,int columns,int rows,int column){
   for(int zz=0;zz<=rows;zz++){int k=zz*(columns+1)+column;Vector3 p=vertices[k];const float e=.2f;
    float hx=TerrainHeight(p+Vector3.right*e)-TerrainHeight(p-Vector3.right*e),hz=TerrainHeight(p+Vector3.forward*e)-TerrainHeight(p-Vector3.forward*e);
    normals[k]=new Vector3(-hx/(2*e),1,-hz/(2*e)).normalized;}
  }

  // ---- spectator lifecycle ----------------------------------------------------------------------------------------------------
  readonly HashSet<Material> borrowedMaterials=new HashSet<Material>();
  /// <summary>A spectator reuses the host's material for an id (same shader, same settings), so both halves batch alike.</summary>
  bool BorrowMaterial(string id,out Material m){m=null;var h=HostOf;if(h==null||h==this||!h.materials.TryGetValue(id,out m)||m==null)return false;materials[id]=m;borrowedMaterials.Add(m);return true;}
  /// <summary>The spectator's Awake: only what drawing the partner's half needs.</summary>
  bool SpectatorAwake(){
   if(!Spectator)return false;spectatorView=this;
   game=GetComponent<CarrotGame>();properties=new MaterialPropertyBlock();var h=HostOf;
   GameCamera=h!=null&&h.GameCamera!=null?h.GameCamera:Camera.main;
   if(h!=null){atlas=h.atlas;nature=h.nature;treeAutumn=h.treeAutumn;treeOak=h.treeOak;treePine=h.treePine;pumpkinPrefab=h.pumpkinPrefab;hayPrefab=h.hayPrefab;cratePrefab=h.cratePrefab;foreach(var kv in h.realNature)realNature[kv.Key]=kv.Value;reducedMotion=h.reducedMotion;}
   else{atlas=Resources.Load<Texture2D>("Carrot/Textures/MaterialAtlas");nature=new GameObject[0];}
   CarrotEffects.NextSpectator=true;try{effects=gameObject.AddComponent<CarrotEffects>();}finally{CarrotEffects.NextSpectator=false;}
   effects.IsClone=id=>{foreach(var en in game.enemies)if(en.id==id)return en.clone;return false;};effects.LicensedAnchor=id=>null;effects.Ground=p=>game!=null&&game.level!=null?SurfaceHeight(p):0;effects.ReducedMotion=reducedMotion;
   if(game!=null)game.Effect+=OnEffect;
   CarrotQa.Count("spectator.awake",1);return true;
  }
  float dormantClock;bool dormant;public bool SpectatorDormant=>dormant;
  /// <summary>QA only (perf experiments): the spectator skips its whole frame.</summary>
  [NonSerialized] internal bool qaFreeze;
  /// <summary>The spectator's actor count and the replica's enemies + towers, both read at the end of its last frame (QA).</summary>
  [NonSerialized] internal int lastActors=-1,lastExpected=-1;
  /// <summary>The spectator's frame: no clocks shared with the page, no globals, the partner's actors and a filtered effect set.</summary>
  void SpectatorUpdate(){
   CarrotQa.Section("spectator.gap");if(qaFreeze)return;
   var h=HostOf;if(h!=null){if(GameCamera==null)GameCamera=h.GameCamera;portraitCamera=h.portraitCamera;if(reducedMotion!=h.reducedMotion){reducedMotion=h.reducedMotion;effects.ReducedMotion=reducedMotion;}}
   if(levelId!=game.level.id)BuildLevel();
   float raw=Mathf.Min(Time.deltaTime,.05f);bool frozen=ViewGamePaused;float dt=frozen?0:raw*(game.phase=="playing"?Mathf.Clamp(ViewGameSpeed,1,2):1);
   viewScale=1;clock+=dt;
   bool sleep=SpectatorShouldSleep();
   if(sleep&&!dormant){dormant=true;effects.Clear();CarrotQa.Count("spectator.sleep",1);}
   else if(!sleep&&dormant){dormant=false;dormantClock=0;CarrotQa.Count("spectator.wake",1);}
   if(!dormant){effects.Tick(dt);UpdateExpansionScene(dt);CarrotQa.Section("spectator.effects");UpdateActors(dt);CarrotQa.Section("spectator.actors");UpdateYanks();UpdateFlight();UpdateRoutePulses(raw);}
   else{dormantClock+=raw;if(dormantClock>=.25f){dormantClock=0;UpdateActors(0);}CarrotQa.Section("spectator.dormant");}
   if(!dormant){UpdateCarrot(dt);if(carrot!=null&&GameCamera!=null){Vector3 face=GameCamera.transform.position-carrotPosition;face.y=0;if(face.sqrMagnitude>.01f)carrot.root.transform.rotation=Quaternion.Slerp(carrot.root.transform.rotation,Quaternion.LookRotation(face)*Quaternion.Euler(0,180,0),1-Mathf.Exp(-raw*10));}DrawContactShadows();}
   else if(dormantClock==0)DrawContactShadows();
   CarrotQa.Section("spectator.post");
   int actors=enemies.Count+towers.Count,expect=game.enemies.Count+game.towers.Count;CarrotQa.Max("spectator.actorMismatch",dormant?0:Mathf.Abs(actors-expect));lastActors=actors;lastExpected=expect;
  }
  /// <summary>The partner's actors are watched, not played: no shadow casting (the contact blob stays), no secondary-motion springs,
  /// animation only while a renderer is visible, two bone influences and one mesh LOD coarser than the tier picks. Bosses keep their
  /// shadow and full skinning (they are the partner's headline).</summary>
  void SpectatorDiet(Actor a,bool boss){
   if(a==null||a.model==null)return;
   foreach(var m in a.model.GetComponentsInChildren<CarrotSecondaryMotion>(true))m.enabled=false;
   if(a.animation!=null)a.animation.cullingType=AnimationCullingType.BasedOnRenderers;
   if(!boss){foreach(var r in a.renderers)if(r!=null)r.shadowCastingMode=ShadowCastingMode.Off;foreach(var s in a.model.GetComponentsInChildren<SkinnedMeshRenderer>(true))s.quality=SkinQuality.Bone2;
    foreach(var lod in a.model.GetComponentsInChildren<CarrotTierLod>(true)){lod.high=Mathf.Min(2,lod.high+1);lod.medium=Mathf.Min(2,lod.medium+1);lod.low=Mathf.Min(2,lod.low+1);if(lod.enabled){lod.enabled=false;lod.enabled=true;}}}
   CarrotQa.Count("spectator.diet",1);
  }
  /// <summary>Nothing on the partner's half casts into the shadow map (the host's key light draws its shadow pass once per caster): the
  /// combined batches are made shadowless in CombineDecoration, and the scanned props and trees the batcher cannot combine here.</summary>
  void SpectatorDecorationShadows(List<GameObject> combined){
   foreach(var r in decoration.GetComponentsInChildren<Renderer>(true)){if(r==null||!r.enabled||combined.Contains(r.gameObject))continue;if(r.shadowCastingMode==ShadowCastingMode.ShadowsOnly)r.enabled=false;else r.shadowCastingMode=ShadowCastingMode.Off;}
  }
  /// <summary>Under 10% of the screen (the half's rectangle projected through the host camera and clipped to the viewport) sleeps.</summary>
  bool SpectatorShouldSleep(){
   if(GameCamera==null||game.phase=="won"||game.phase=="lost")return false;
   var r=duoCfg.own;if(r.width<=0||r.height<=0)return false;
   return ViewCoverage(r)<.10f;
  }
  /// <summary>Viewport fraction covered by a ground rectangle (bounding box of its projected corners, clipped; a corner behind the camera counts as covering).</summary>
  float ViewCoverage(Rect r){
   float x0=1,y0=1,x1=0,y1=0;
   for(int i=0;i<4;i++){Vector3 c=new Vector3((i&1)==0?r.xMin:r.xMax,0,(i&2)==0?r.yMin:r.yMax);Vector3 v=GameCamera.WorldToViewportPoint(c);if(v.z<=0)return 1;x0=Mathf.Min(x0,v.x);x1=Mathf.Max(x1,v.x);y0=Mathf.Min(y0,v.y);y1=Mathf.Max(y1,v.y);}
   float w=Mathf.Clamp01(x1)-Mathf.Clamp01(x0),hh=Mathf.Clamp01(y1)-Mathf.Clamp01(y0);return Mathf.Max(0,w)*Mathf.Max(0,hh);
  }
  /// <summary>The partner's events, filtered: builds, upgrades, sells and merges, a cheap death puff, the boss entrance, telegraphs,
  /// carrot bites and the outcome; shots become motes from a 40-slot pool; hit flinches stay (view state only).</summary>
  void SpectatorEvent(CarrotEvent e){
   if(e.type=="level"){levelId=-1;return;}
   if(dormant){CarrotQa.Count("spectator.eventsDropped",1);return;}
   switch(e.type){
    case "shot":{Vector3 from=e.position+Vector3.up*.72f;if(towers.TryGetValue(e.id,out var src)&&src.muzzle!=null)from=src.muzzle.position;effects.CheapShot(from,AirPoint(e.to,e.target)+Vector3.up*.28f+LaneOf(e.target),CarrotEffects.Tone(e.kind),Mathf.Clamp(e.duration>0?e.duration:.3f,.12f,.8f));break;}
    case "hit":if(enemies.TryGetValue(e.target,out var a)){a.hitRemaining=.35f;a.heavyHit=e.kind=="mortar"||e.kind=="thunder"||e.kind=="dragonfruit";}break;
    case "death":effects.DeathPuff(AirPoint(e.position,e.id),CarrotEffects.Tone(e.kind));break;
    case "build":case "upgrade":case "sell":case "clear":case "telegraph":case "telegraphTarget":case "victory":case "defeat":case "bossEnter":effects.Handle(e);break;
    case "carrotHit":effects.Handle(e);carrotHit=.6f;carrotHitDir=e.position-carrotPosition;carrotHitDir.y=0;break;
    case "merge":effects.Handle(e);StartFlight(e.kind,4,e.to,e.position);break;
    default:CarrotQa.Count("spectator.eventsDropped",1);return;
   }
   CarrotQa.Count("spectator.events",1);
  }

  // ---- host per-frame ---------------------------------------------------------------------------------------------------------
  float fogStartBase=30;
  /// <summary>Host duo/endless upkeep after the camera: fog and shadow reach follow the zoomed-out distance, the audio pan follows the
  /// camera, the wall shimmer, the presence ring, the pending-op ghosts and the builder tint.</summary>
  void UpdateDuoHost(float raw){
   if(!DuoHost||GameCamera==null)return;
   float distance=fitDistance/Mathf.Max(.05f,zoom),scale=Mathf.Max(1,distance/Mathf.Max(1,soloFitReference));
   if(defeatClock<0&&lastDim<=0&&Mathf.Abs(RenderSettings.fogEndDistance-fogEndBase*scale)>.05f){RenderSettings.fogStartDistance=fogStartBase*scale;RenderSettings.fogEndDistance=fogEndBase*scale;}
   var asset=GraphicsSettings.currentRenderPipeline as UnityEngine.Rendering.Universal.UniversalRenderPipelineAsset;float shadow=Mathf.Clamp(distance+(PrismStage?26:14),24,PrismStage?96:80);if(asset!=null&&Mathf.Abs(asset.shadowDistance-shadow)>.25f)asset.shadowDistance=shadow;
   if(sound!=null)sound.ListenerX=(cameraTarget+pan).x;
   ClampHeightFog();UpdateShimmer(raw);UpdatePresence();UpdatePendingGhosts(raw);
  }
  Vector4 heightFogAuthored,heightFogWritten=new Vector4(-1,0,0,0);
  /// <summary>Carrot/HeightFog integrates exp(falloff * height) in closed form, which overflows a float once the camera stands more than
  /// ~59 u above the fog base at falloff 1.5 (the screen turns to solid fog). Solo cameras never get that high; the zoomed-out duo and
  /// endless views can, so the host lowers the falloff just enough to stay under the limit (identical fog wherever it was valid).</summary>
  void ClampHeightFog(){
   var current=Shader.GetGlobalVector("_CarrotHeightFog");if(current!=heightFogWritten)heightFogAuthored=current;
   var fog=heightFogAuthored;if(fog.x<=0||fog.z<=0||GameCamera==null){heightFogWritten=current;return;}
   float above=GameCamera.transform.position.y-fog.y;if(above*fog.z>80)fog.z=80/above;
   if(fog!=current)Shader.SetGlobalVector("_CarrotHeightFog",fog);heightFogWritten=fog;
  }

  // ---- camera -----------------------------------------------------------------------------------------------------------------
  string netCameraMode="own";float bothZoom=1,soloFitReference=25;Vector3 bothTarget,partnerTarget;
  public string NetCameraMode=>netCameraMode;public float BothZoom=>bothZoom;public float FitDistanceValue=>fitDistance;
  public Vector3 PanValue=>pan;public float ZoomValue=>zoom;public Vector3 CameraTargetValue=>cameraTarget;public Quaternion CameraAngleValue=>cameraAngle;
  float MinZoom=>DuoHost?Mathf.Min(1,bothZoom):1;
  /// <summary>Net camera modes from the HUD: "own" (My side), "partner" (Watch name), "both". A glide, or one-frame cut with reduced motion.</summary>
  public void NetCamera(string mode){
   if(!DuoHost)return;mode=mode=="partner"||mode=="both"?mode:"own";netCameraMode=mode;followBoss=-1;panNudged=false;
   if(mode=="own"){targetZoom=1;targetPan=Vector3.zero;}
   else if(mode=="partner"){targetZoom=1;targetPan=Flat(partnerTarget-cameraTarget);}
   else{targetZoom=bothZoom;targetPan=Flat(bothTarget-cameraTarget);}
   ClampPan();CarrotQa.Count("camera.net."+mode,1);
   if(reducedMotion){zoom=targetZoom;pan=targetPan;SnapCamera();}
  }
  static Vector3 Flat(Vector3 v){v.y=0;return v;}
  /// <summary>Duo and endless framing (host). Returns false in solo. Sets cameraAngle, cameraTarget, fitDistance, the partner's and the
  /// arena's targets and the "Both" zoom.</summary>
  bool FitDuoCamera(bool portrait,float tangent,float aspect){
   if(!DuoHost||game==null||game.level==null)return false;
   soloFitReference=SoloBoxFit(tangent,aspect);
   if(DuoHalves&&!CarrotDuoMaps.IsDuoLevel(game.level.id))return false;
   if(!FitDuoFrame(portrait,tangent,aspect))return false;
   // Fog and shadow reach scale with how far the view is beyond what solo frames: the own half's fit in duo, a solo map's in endless.
   if(DuoHalves)soloFitReference=fitDistance;
   // A resize or rotation refits: "Both" and "Watch" keep their framing for the new aspect (a glide, never a jump to the own half).
   if(netCameraMode!="own"){var mode=netCameraMode;bool keep=reducedMotion;reducedMotion=false;NetCamera(mode);reducedMotion=keep;}
   return true;
  }
  bool FitDuoFrame(bool portrait,float tangent,float aspect){
   var points=new List<Vector3>();var all=new List<Vector3>();
   foreach(var route in game.level.routes)foreach(var p in route){points.Add(p);all.Add(p);}foreach(var p in game.level.pads){points.Add(p);all.Add(p);}
   if(duoOther!=null){foreach(var route in duoOther.routes)foreach(var p in route)all.Add(p);foreach(var p in duoOther.pads)all.Add(p);}
   if(EndlessMap){var home=CarrotDuoMaps.EndlessHomeRect(duoCfg.seat);points.Clear();foreach(var p in all)if(p.x>=home.xMin&&p.x<=home.xMax)points.Add(p);}
   // "Both" frames the whole arena: its four corners join the envelope (inset by the fit's own corner radius).
   {var a=duoCfg.arena;if(a.width<=0)a=EndlessMap?CarrotDuoMaps.EndlessRect:CarrotDuoMaps.ArenaRect(game.level.id);for(int i=0;i<4;i++)all.Add(new Vector3((i&1)==0?a.xMin+.6f:a.xMax-.6f,0,(i&2)==0?a.yMin+.6f:a.yMax-.6f));}
   int side=duoCfg.side==1?1:0,seat=duoCfg.seat==1?1:0;
   if(AxisZ){
    // L29: the lanes stack in z. South (mirrored) looks from the south like solo's mirror; north looks from the north (yaw +180).
    bool north=side==0;cameraAngle=portrait?Quaternion.Euler(53,90,0):Quaternion.Euler(47,north?173:7,0);
    EnvelopeFit(points,.78f,2.75f,tangent,aspect,.96f,portrait?.89f:.91f,.3f,.5f,out cameraTarget,out fitDistance);
    EnvelopeFit(all,.78f,2.75f,tangent,aspect,.96f,portrait?.89f:.91f,.3f,.5f,out bothTarget,out float both);bothZoom=Mathf.Clamp(fitDistance/both,.3f,1);
    partnerTarget=new Vector3(cameraTarget.x,cameraTarget.y,-cameraTarget.z);GameCamera.farClipPlane=Mathf.Max(GameCamera.farClipPlane,220);return true;
   }
   bool mirrored=EndlessMap?seat==1:side==1;
   if(portrait){
    cameraAngle=Quaternion.Euler(50,mirrored?-88:88,0);float actor=string.IsNullOrEmpty(game.level.boss)?1.8f:2.65f;
    EnvelopeFit(points,.66f,actor,tangent,aspect,.96f,.86f,.2f,.40f,out cameraTarget,out fitDistance);
    EnvelopeFit(all,.66f,actor,tangent,aspect,.96f,.86f,.2f,.40f,out bothTarget,out float both);bothZoom=Mathf.Clamp(fitDistance/both,.3f,1);endlessBothFit=both;
   }else{
    cameraAngle=Quaternion.Euler(34,mirrored?9:-9,0);
    if(EndlessMap){
     var home=CarrotDuoMaps.EndlessHomeRect(seat);float cssWidth=Screen.width/Mathf.Max(.01f,inputPixelScale);bool wide=aspect>=1.6f&&cssWidth>=1200;
     BoxFit(new Vector3(0,0,0),14.65f,6.4f,tangent,aspect,out bothTarget,out float both);endlessBothFit=both;
     if(wide){cameraTarget=bothTarget;fitDistance=both;bothZoom=1;points.Clear();}
     else{BoxFit(new Vector3(home.center.x,0,0),home.width*.5f-.35f,6.4f,tangent,aspect,out cameraTarget,out fitDistance);bothZoom=Mathf.Clamp(fitDistance/both,.3f,1);}
    }else{
     BoxFit(OwnWorld(Vector3.zero),7.65f,5.65f,tangent,aspect,out cameraTarget,out fitDistance);
     BoxFit(Vector3.zero,7.65f+CarrotDuoMaps.Offset,5.65f,tangent,aspect,out bothTarget,out float both);bothZoom=Mathf.Clamp(fitDistance/both,.3f,1);
    }
   }
   partnerTarget=new Vector3(-cameraTarget.x,cameraTarget.y,cameraTarget.z);
   if(!EndlessMap)bothTarget=new Vector3(0,cameraTarget.y,cameraTarget.z);
   else{
    // Twin Gates is wider and deeper than a solo map: every default framing keeps the farthest pad at 18 px of radius or more (a
    // fingertip target on a 390 px phone), so the camera comes closer than the home-rect fit when needed and the rest is a drag away.
    float floor=PadFloorDistance(points,cameraTarget,tangent);if(floor<fitDistance){fitDistance=floor;bothZoom=Mathf.Clamp(fitDistance/Mathf.Max(1,BothFitDistance(tangent,aspect,portrait)),.3f,1);CarrotQa.Count("duo.padFloor",1);}
   }
   return true;
  }
  /// <summary>Largest camera distance at which every pad of `points` shows a radius of at least 18.5 CSS px.</summary>
  float PadFloorDistance(List<Vector3> points,Vector3 target,float tangent){
   float cssHeight=Screen.height/Mathf.Max(.01f,inputPixelScale);float zmax=.47f*cssHeight/(2*18.5f*tangent);Vector3 forward=cameraAngle*Vector3.forward;float ahead=0;
   foreach(var p in game.level.pads){if(points.Count>0&&!points.Contains(p))continue;ahead=Mathf.Max(ahead,Vector3.Dot(new Vector3(p.x,.12f,p.z)-target,forward));}
   return Mathf.Max(6,zmax-ahead);
  }
  float endlessBothFit;
  float BothFitDistance(float tangent,float aspect,bool portrait){return endlessBothFit;}
  /// <summary>The solo landscape fit (the +-7.65 x +-5.65 box at the solo target), the fog and distance reference.</summary>
  float SoloBoxFit(float tangent,float aspect){var keep=cameraAngle;cameraAngle=Quaternion.Euler(34,-9,0);BoxFit(Vector3.zero,7.65f,5.65f,tangent,aspect,out _,out float d);cameraAngle=keep;return d;}
  /// <summary>Solo's landscape box fit around `centre` (target = centre + (0, .35, .2)).</summary>
  void BoxFit(Vector3 centre,float hx,float hz,float tangent,float aspect,out Vector3 target,out float distance){
   target=new Vector3(centre.x,.35f,centre.z+.2f);distance=0;
   for(int x=-1;x<=1;x+=2)for(int z=-1;z<=1;z+=2)for(int y=0;y<=1;y++){Vector3 local=Quaternion.Inverse(cameraAngle)*(new Vector3(centre.x+x*hx,y*2.25f,centre.z+z*hz)-target);distance=Mathf.Max(distance,Mathf.Max(Mathf.Abs(local.y)/tangent,Mathf.Abs(local.x)/(tangent*aspect))-local.z);}
   distance+=.9f;
  }
  /// <summary>Solo's portrait/prism envelope fit over a point set (target = bounds centre + lift).</summary>
  void EnvelopeFit(List<Vector3> points,float radius,float height,float tangent,float aspect,float safeX,float safeY,float pad,float lift,out Vector3 target,out float distance){
   Vector3 min=new Vector3(1000,0,1000),max=new Vector3(-1000,0,-1000);foreach(var p in points){min=Vector3.Min(min,p);max=Vector3.Max(max,p);}min.y=max.y=0;
   Vector3 t=(min+max)*.5f+Vector3.up*lift;float d=0;var inv=Quaternion.Inverse(cameraAngle);
   // FitEnvelope's corner test with a local target (no fields touched, so the outputs may alias cameraTarget and fitDistance).
   foreach(var p in points)for(int x=-1;x<=1;x+=2)for(int z=-1;z<=1;z+=2)for(int y=0;y<=1;y++){Vector3 local=inv*(p+new Vector3(x*radius,y*height,z*radius)-t);d=Mathf.Max(d,Mathf.Max(Mathf.Abs(local.y)/(tangent*safeY),Mathf.Abs(local.x)/(tangent*aspect*safeX))-local.z);}
   target=t;distance=d+pad;
  }
  /// <summary>Duo/endless pan clamp: the camera centre may travel over the span of the own, partner and arena targets at zoom 1 (so the
  /// partner's half is a drag away), plus solo's zoomed-in reach; zoomed out to "Both" the span still holds. Never recentres by itself.</summary>
  void ClampDuoPan(){
   Vector3 lo=Vector3.Min(Vector3.Min(cameraTarget,partnerTarget),bothTarget),hi=Vector3.Max(Vector3.Max(cameraTarget,partnerTarget),bothTarget);
   // Twin Gates' default view can be closer than the map (the pad-size floor): the centre may then roam the whole map at zoom 1.
   if(EndlessMap){var m=CarrotDuoMaps.EndlessRect;lo.x=Mathf.Min(lo.x,m.xMin+5);hi.x=Mathf.Max(hi.x,m.xMax-5);lo.z=Mathf.Min(lo.z,m.yMin+3);hi.z=Mathf.Max(hi.z,m.yMax-3);}
   float fraction=Mathf.Max(0,1-1/Mathf.Max(.01f,targetZoom)),reach=Mathf.Min(1,fraction*2.2f),extra=portraitCamera?1.7f:0;
   float hx=(routeMax.x-routeMin.x)*.5f+3,hz=(routeMax.z-routeMin.z)*.5f+3;float lx=hx*reach+extra,lz=hz*reach+extra;
   Vector3 c=cameraTarget+targetPan;c.x=Mathf.Clamp(c.x,lo.x-lx,hi.x+lx);c.z=Mathf.Clamp(c.z,lo.z-lz,hi.z+lz);targetPan=Flat(c-cameraTarget);
  }

  // ---- input ------------------------------------------------------------------------------------------------------------------
  /// <summary>Duo: a tap that lands on the partner's half (or the wall strip) changes nothing in the simulation: the own selection
  /// clears, the divider shimmers and "partnerTap" goes to the page (which shows "That's name's side"). True when handled.</summary>
  bool DuoPartnerTap(Vector2 screen){
   if(!DuoHalves||Spectator||game==null||game.level==null||!GroundPoint(screen,out var ground))return false;
   int half=CarrotDuoMaps.HalfAt(game.level.id,ground);int own=duoCfg.side==1?1:0;if(half==own)return false;
   if(game.selectionType!=""||game.selectionId>=0)game.Select("",-1);
   Shimmer(.5f);if(half>=0){CarrotNetHooks.RaiseViewEvent("partnerTap");CarrotQa.Count("duo.partnerTap",1);}else CarrotQa.Count("duo.wallTap",1);
   return true;
  }
  /// <summary>Range rings stop at the wall: points past it are pulled onto the own side of the strip (a flattened "D").</summary>
  void ClipRingAtWall(LineRenderer ring){
   if(!DuoHalves||ring==null||!ring.enabled||game==null||game.level==null)return;bool z=AxisZ;int own=duoCfg.side==1?1:0;
   // Axis X: half 0 is x < 0; axis Z: half 0 (north) is z > 0.
   float limit=.5f,sign=z?(own==0?1:-1):(own==0?-1:1);bool crossed=false;
   for(int i=0;i<ring.positionCount;i++){Vector3 p=ring.GetPosition(i);float c=z?p.z:p.x;if(c*sign<limit){if(z)p.z=sign*limit;else p.x=sign*limit;ring.SetPosition(i,p);crossed=true;}}
   if(crossed)Shimmer(.16f);
  }

  // ---- the divider and its shimmer --------------------------------------------------------------------------------------------
  MeshRenderer shimmerRenderer;float shimmerLevel,shimmerHold,shimmerTarget;MaterialPropertyBlock shimmerBlock;
  /// <summary>Raises the wall shimmer to at least `level` (0..1): fade in 0.25 s, hold 0.35 s, fade out 0.6 s. Never pulses.</summary>
  void Shimmer(float level){shimmerTarget=Mathf.Max(shimmerTarget,level);shimmerHold=Mathf.Max(shimmerHold,.35f);}
  void UpdateShimmer(float raw){
   if(shimmerRenderer==null)return;
   if(shimmerTarget>0&&shimmerLevel<shimmerTarget)shimmerLevel=Mathf.Min(shimmerTarget,shimmerLevel+raw/.25f);
   else if(shimmerHold>0){shimmerHold-=raw;if(shimmerHold<=0)shimmerTarget=0;}
   else shimmerLevel=Mathf.Max(0,shimmerLevel-raw/.6f);
   shimmerRenderer.enabled=shimmerLevel>.004f;if(!shimmerRenderer.enabled)return;
   if(shimmerBlock==null)shimmerBlock=new MaterialPropertyBlock();Color c=Color.Lerp(LocalColour,Color.white,.55f);shimmerBlock.SetColor("_Color",new Color(c.r*1.4f,c.g*1.4f,c.b*1.4f,shimmerLevel*.55f));shimmerRenderer.SetPropertyBlock(shimmerBlock);
  }
  /// <summary>The wall, drawn once by the host: a low dry-stone divider along x = 0 with openings where the seam gates face each other
  /// (each half's own gate arch frames them), or a crystal brook along z = 0 on L29; and a hidden shimmer curtain over it.</summary>
  void BuildDivider(){
   if(!DuoHalves||Spectator||game==null||game.level==null||!CarrotDuoMaps.IsDuoLevel(game.level.id))return;
   CarrotDuoMaps.Wall(game.level.id,out var a,out var b);bool z=AxisZ;var rng=new System.Random(4421+game.level.id*7);
   if(z)BuildPrismBrook(a,b);
   else if(game.level.boss=="portal"){
    // The observatory floats over the void: the wall is a row of carved pylons with teal lamps instead of dry stone.
    var gates=new List<float>();foreach(var route in game.level.routes){var s=route[0];if(Mathf.Abs(s.x)<1.6f)gates.Add(s.z);}
    var obsidian=Material("portal-carved-stone",new Color(.29f,.34f,.41f),1,.28f,.12f,1.7f);var teal=Material("portal-inlay",new Color(.14f,.7f,.72f),5,.6f,.4f,1);teal.SetColor("_EmissionColor",new Color(.05f,.55f,.64f));
    for(float t=a.z+.4f;t<=b.z-.3f;t+=1.15f){bool gap=false;foreach(var g in gates)if(Mathf.Abs(t-g)<.9f)gap=true;if(gap)continue;Primitive("Divider pylon",PrimitiveType.Cylinder,new Vector3(0,-.3f,t),new Vector3(.18f,.62f,.18f),obsidian,decoration);Primitive("Divider lamp",PrimitiveType.Sphere,new Vector3(0,.4f,t),Vector3.one*.15f,teal,decoration,true);}
   }
   else{
    var gates=new List<float>();foreach(var route in game.level.routes){var s=route[0];if(Mathf.Abs(s.x)<1.6f)gates.Add(s.z);}
    var stone=Material("entry-stone",new Color(.86f,.9f,.8f),1,.25f,0,1.8f);var cap=Material("duo-wall-cap",game.level.biome=="frost"?new Color(.9f,.94f,1):new Color(.82f,.8f,.7f),1,.3f,0,1.6f);
    for(float t=a.z+.2f;t<=b.z-.15f;t+=.46f){bool gap=false;foreach(var g in gates)if(Mathf.Abs(t-g)<.85f)gap=true;if(gap)continue;
     float h=.3f+(float)rng.NextDouble()*.12f;Vector3 p=new Vector3(((float)rng.NextDouble()-.5f)*.06f,0,t);float ground=TerrainHeight(p);
     var block=Primitive("Divider stone",PrimitiveType.Cube,new Vector3(p.x,ground+h*.5f-.02f,t),new Vector3(.36f,h,.44f),stone,decoration);block.transform.localRotation=Quaternion.Euler(((float)rng.NextDouble()-.5f)*6,((float)rng.NextDouble()-.5f)*14,((float)rng.NextDouble()-.5f)*5);
     if(rng.NextDouble()<.55)Primitive("Divider cap",PrimitiveType.Sphere,new Vector3(p.x,ground+h+.03f,t),new Vector3(.3f,.1f,.36f),cap,decoration,true);}
    // Gate posts: two short pillars either side of every opening, so the opening reads as a passage through the wall.
    foreach(var g in gates)for(int s=-1;s<=1;s+=2){Vector3 p=new Vector3(0,0,g+s*.95f);float ground=TerrainHeight(p);Primitive("Divider gate post",PrimitiveType.Cylinder,new Vector3(0,ground+.34f,p.z),new Vector3(.3f,.34f,.3f),stone,decoration);Primitive("Divider post cap",PrimitiveType.Sphere,new Vector3(0,ground+.72f,p.z),new Vector3(.34f,.16f,.34f),cap,decoration,true);}
   }
   // The shimmer curtain: a vertical strip along the wall, additive, faded to the top and the ends by vertex alpha.
   {const int n=48;float height=z?.9f:1.3f;var v=new List<Vector3>();var c=new List<Color>();var tri=new List<int>();Vector3 d=b-a;
    for(int i=0;i<=n;i++){float t=i/(float)n;Vector3 p=a+d*t;float end=Mathf.Clamp01(Mathf.Min(t,1-t)*8);float ground=z?-.02f:TerrainHeight(p);v.Add(new Vector3(p.x,ground+.02f,p.z));v.Add(new Vector3(p.x,ground+height,p.z));c.Add(new Color(1,1,1,end));c.Add(new Color(1,1,1,0));if(i<n){int k=i*2;tri.AddRange(new[]{k,k+1,k+2,k+1,k+3,k+2});}}
    var mesh=new Mesh{name="Duo wall shimmer"};mesh.SetVertices(v);mesh.SetColors(c);mesh.SetTriangles(tri,0);mesh.RecalculateBounds();
    if(!materials.TryGetValue("duo-shimmer",out var m)){m=new Material(Shader.Find("Carrot/FxAdditive")){name="Duo wall shimmer"};m.SetFloat("_UseAtlas",0);m.SetFloat("_Soft",0);materials["duo-shimmer"]=m;}
    var go=MeshObject("Duo wall shimmer",mesh,m,world);shimmerRenderer=go.GetComponent<MeshRenderer>();shimmerRenderer.shadowCastingMode=ShadowCastingMode.Off;shimmerRenderer.receiveShadows=false;shimmerRenderer.enabled=false;shimmerLevel=shimmerTarget=shimmerHold=0;}
   LogDecor((a+b)*.5f,0,false);
  }
  /// <summary>L29's seam: a shallow crystal brook along z = 0 between the two sky gardens, with a spectral inlay.</summary>
  void BuildPrismBrook(Vector3 a,Vector3 b){
   float length=Mathf.Abs(b.x-a.x),cx=(a.x+b.x)*.5f;var bed=PrismCeramic("brook-bed",new Color(.10f,.19f,.30f),.82f,.3f);bed.SetColor("_EmissionColor",new Color(.06f,.12f,.22f));
   PrismBeam("Crystal brook bed",new Vector3(cx,-.09f,0),length,.86f,.16f,bed,.04f);SpectrumStrip("Crystal brook light",new Vector3(cx,-.006f,0),length-.4f,.32f);
   var shard=PrismCeramic("crystal",new Color(.78f,.9f,1),.86f,.08f);for(float x=a.x+2;x<b.x-1;x+=3.4f)PrismCrystalCluster(new Vector3(x,-.04f,0),.42f,(int)(x*31)+game.level.id,false);
  }
  /// <summary>Duo L25-L27: the arena's standing stones on one ellipse around both halves (the host draws it once), none in the wall strip.</summary>
  void BuildDuoArenaStones(){
   var rng=new System.Random(7001+levelId*13);float rx=7.6f+CarrotDuoMaps.Offset,rz=5.6f;int count=26;
   for(int i=0;i<count;i++){float a=i/(float)count*Mathf.PI*2+.07f;Vector3 p=new Vector3(Mathf.Cos(a)*rx,0,Mathf.Sin(a)*rz);if(Mathf.Abs(p.x)<1.4f)continue;
    if(!FreeBothHalves(p,.9f))p+=new Vector3(Mathf.Cos(a),0,Mathf.Sin(a))*.8f;if(!FreeBothHalves(p,.8f))continue;bool front=p.z<-2.5f;float h=front?.45f+(float)rng.NextDouble()*.25f:1.2f+(float)rng.NextDouble()*.7f;PlaceScanned(i%2==0?"MossRockA":"MossRockB",p,h,(float)rng.NextDouble()*360,!front);}
  }
  /// <summary>Each carrot's banner in its half's colour (warm gold for the local player, teal for the partner) beside the nest.</summary>
  void BuildTeamBanner(){
   if(!DuoHalves)return;Color team=HalfColour;bool z=AxisZ;Vector3 foot=z?carrotPosition+new Vector3(-.95f,0,Mathf.Sign(carrotPosition.z)*.7f):OwnWorld(OwnLocal(carrotPosition)+new Vector3(-.75f,0,.75f));
   float y=TerrainHeight(foot);if(z)y=-.025f;var pole=Material("banner-pole-light",new Color(.86f,.8f,.68f),2,.3f);Primitive("Team banner pole",PrimitiveType.Cylinder,foot+Vector3.up*(y+.8f),new Vector3(.055f,.8f,.055f),pole,decoration,true);
   Primitive("Team banner finial",PrimitiveType.Sphere,foot+Vector3.up*(y+1.64f),Vector3.one*.11f,pole,decoration,true);
   var cloth=Material("banner-"+ColorUtility.ToHtmlStringRGB(team),team*.85f,-1,.2f);cloth.SetColor("_EmissionColor",team*.75f);cloth.SetFloat("_Cull",0);cloth.SetFloat("_SnowStrength",0);
   // The flag hangs from a yawed arm so it reads face-on from the landscape cameras (looking along z) and still shows from the
   // portrait ones (looking along x); it flies away from the carrot, mirrored with the half.
   var arm=new GameObject("Team banner arm").transform;arm.SetParent(decoration,false);arm.position=foot+Vector3.up*(y+1.3f);
   float away=Mathf.Sign(OwnWorld(new Vector3(-1,0,0)).x-OwnWorld(Vector3.zero).x);if(z)away=1;arm.rotation=Quaternion.Euler(0,away>0?-35:35,0);
   var flag=Primitive("Team banner",PrimitiveType.Cube,new Vector3(away*.32f,0,0),new Vector3(.62f,.42f,.02f),cloth,arm);flag.GetComponent<Renderer>().shadowCastingMode=ShadowCastingMode.Off;
  }

  // ---- endless: presence, pending ghosts, builder tint ------------------------------------------------------------------------
  LineRenderer presenceRing;int presenceSeat=-1,presencePad=-1,presenceTower=-1;
  /// <summary>The partner's selection (presentation only, at most 5 Hz from the page): a ring in their colour on the pad or tower.</summary>
  public void NetPresence(int seat,int pad,int tower){if(!DuoHost)return;presenceSeat=seat;presencePad=pad;presenceTower=tower;CarrotQa.Count("duo.presence",1);}
  void UpdatePresence(){
   if(!EndlessMap||presenceSeat<0||presenceSeat==duoCfg.seat||game==null||game.level==null){if(presenceRing!=null)presenceRing.enabled=false;return;}
   if(presenceRing==null){presenceRing=CreateRing("Partner presence",PartnerColour,.045f);}
   Vector3 p=Vector3.zero;bool on=false;if(presenceTower>=0)foreach(var t in game.towers)if(t.id==presenceTower){p=t.position;on=true;break;}
   if(!on&&presencePad>=0&&presencePad<game.level.pads.Length){p=game.level.pads[presencePad];on=true;}
   presenceRing.enabled=on;if(!on)return;Color c=PartnerColour;c.a=.85f;presenceRing.startColor=presenceRing.endColor=c;PlotRing(presenceRing,p,.56f+(reducedMotion?0:.03f*Mathf.Sin(clock*3)),.15f);
  }
  sealed class PendingGhost {public GameObject go;public Renderer[] renderers;public int seq,pad;public float fade=-1;public string kind;}
  readonly Dictionary<int,PendingGhost> pendingGhosts=new Dictionary<int,PendingGhost>();readonly List<int> pendingGone=new List<int>();readonly HashSet<int> pendingSeen=new HashSet<int>();
  public int PendingGhostCount{get{int n=0;foreach(var g in pendingGhosts.Values)if(g.go!=null&&g.go.activeSelf)n++;return n;}}
  /// <summary>Ghost sprouts for the local seat's lockstep intents (game.PendingOps buys): a pale hologram on the pad until the op executes;
  /// a confirmed build simply hands over to the real tower, a rejected one dissolves over 0.4 s.</summary>
  void UpdatePendingGhosts(float raw){
   if(!EndlessMap||game==null||game.level==null){if(pendingGhosts.Count>0)ClearPendingGhosts();return;}
   pendingSeen.Clear();
   foreach(var op in game.PendingOps){if(op==null||op.op!="buy"||op.pad<0||op.pad>=game.level.pads.Length)continue;pendingSeen.Add(op.s);
    if(!pendingGhosts.TryGetValue(op.s,out var g)){var template=Ghost(op.kind,1);if(template==null)continue;var go=Instantiate(template,transform);go.name="Pending sprout "+op.s;go.SetActive(true);g=new PendingGhost{go=go,renderers=go.GetComponentsInChildren<Renderer>(true),seq=op.s,pad=op.pad,kind=op.kind};pendingGhosts[op.s]=g;CarrotQa.Count("duo.pendingGhost",1);}
    g.fade=-1;Vector3 p=game.level.pads[op.pad];g.go.transform.position=new Vector3(p.x,TerrainHeight(p)+.02f,p.z);g.go.transform.localScale=Vector3.one*ActorScale*.92f;Paint(g,new Color(.75f,1,.8f,.45f+(reducedMotion?0:.1f*Mathf.Sin(clock*5))));}
   pendingGone.Clear();
   foreach(var kv in pendingGhosts){var g=kv.Value;if(pendingSeen.Contains(kv.Key))continue;if(g.go==null){pendingGone.Add(kv.Key);continue;}
    if(g.fade<0){bool built=false;foreach(var tw in game.towers)if(tw.pad==g.pad){built=true;break;}if(built){Destroy(g.go);pendingGone.Add(kv.Key);continue;}g.fade=0;CarrotQa.Count("duo.pendingReject",1);}
    g.fade+=raw;float t=Mathf.Clamp01(g.fade/.4f);if(t>=1){Destroy(g.go);pendingGone.Add(kv.Key);continue;}
    Paint(g,new Color(1,.45f,.4f,.5f*(1-t)));if(!reducedMotion)g.go.transform.position+=Vector3.down*raw*.5f;}
   foreach(int k in pendingGone)pendingGhosts.Remove(k);
  }
  void Paint(PendingGhost g,Color c){properties.Clear();properties.SetColor("_Color",c);foreach(var r in g.renderers)if(r!=null)r.SetPropertyBlock(properties);}
  void ClearPendingGhosts(){foreach(var g in pendingGhosts.Values)if(g.go!=null)Destroy(g.go);pendingGhosts.Clear();}
  readonly Dictionary<int,GameObject> builderMarks=new Dictionary<int,GameObject>();
  /// <summary>Endless: a thin ring in the builder's colour under each tower (TowerState.builder; the page labels "Built by name").</summary>
  void BuilderTint(Actor a,TowerState t){
   if(!EndlessMap||t.builder<0||a==null||a.root==null)return;
   if(a.builderMark!=null)return;Color c=t.builder==duoCfg.seat?LocalColour:PartnerColour;
   var mat=Material("builder-ring-"+ColorUtility.ToHtmlStringRGB(c),c*.9f,-1,.3f);mat.SetColor("_EmissionColor",c*.85f);mat.SetFloat("_SnowStrength",0);mat.SetFloat("_Cull",0);
   var ring=MeshObject("Builder ring",BuilderRingMesh(),mat,a.root.transform);ring.transform.localPosition=new Vector3(0,.05f,0);var r=ring.GetComponent<Renderer>();r.shadowCastingMode=ShadowCastingMode.Off;r.receiveShadows=false;a.builderMark=ring;CarrotQa.Count("duo.builderTint",1);
  }
  static Mesh builderRing;
  static Mesh BuilderRingMesh(){if(builderRing!=null)return builderRing;const int n=40;float inner=.47f,outer=.6f;var v=new Vector3[(n+1)*2];var c=new Color[v.Length];var t=new int[n*6];for(int i=0;i<=n;i++){float a=i*Mathf.PI*2/n;var d=new Vector3(Mathf.Cos(a),0,Mathf.Sin(a));v[i*2]=d*inner;v[i*2+1]=d*outer;c[i*2]=c[i*2+1]=Color.white;if(i<n){int k=i*6,b=i*2;t[k]=b;t[k+1]=b+1;t[k+2]=b+2;t[k+3]=b+1;t[k+4]=b+3;t[k+5]=b+2;}}builderRing=new Mesh{name="Builder ring"};builderRing.vertices=v;builderRing.colors=c;builderRing.triangles=t;builderRing.RecalculateNormals();builderRing.RecalculateBounds();return builderRing;}

  // ---- roster warm-up ---------------------------------------------------------------------------------------------------------
  readonly HashSet<string> qaFirstSeen=new HashSet<string>();
  /// <summary>QA builds: logs each creature model's first appearance in this level (perf.mjs reads the frame around it).</summary>
  /// <summary>True while the QA loopback scaffold (CarrotDuoViewQa) owns the duo configuration.</summary>
  bool QaHoldsDuo(){bool held=false;QaHolds(ref held);return held;}
  partial void QaHolds(ref bool held);
  [System.Diagnostics.Conditional("CARROT_QA")] void QaFirstSpawn(string path){if(levelId!=qaFirstLevel){qaFirstSeen.Clear();qaFirstLevel=levelId;}if(qaFirstSeen.Add(path))Debug.Log("CARROT_DUO_QA first {\"path\":\""+path+"\",\"spectator\":"+(Spectator?1:0)+",\"level\":"+levelId+"}");}
  int qaFirstLevel=-1;
  readonly Queue<string> rosterQueue=new Queue<string>();readonly List<GameObject> rosterLive=new List<GameObject>();GameObject rosterRig;int rosterFrames;
  /// <summary>Queues every creature model the match can bring (duo: this level's waves, boss and minibosses; endless: the whole roster
  /// except Asuna). StepRosterWarm instantiates two per frame on a pin-sized rig in front of the camera (a few pixels), renders them
  /// once and drops them two frames later: shader variants, meshes and skins are uploaded during the lobby and the side reveal.</summary>
  void QueueRosterWarm(){
   rosterQueue.Clear();if(!DuoHost||game==null||game.level==null)return;var paths=new HashSet<string>();
   if(EndlessMap){foreach(var d in CarrotData.AddedEnemies)paths.Add((d.mini?"Carrot/Models/Minibosses/":"Carrot/Models/Enemies/")+d.id);foreach(var b in new[]{"garden","marsh","frost","orchard","tornado","zombie","eyeball","portal"})paths.Add("Carrot/Models/Bosses/"+b);foreach(var k in new[]{"nibble","dash","swarm","shell","shaman","wisp","bat","burrow","moth","crystal"})paths.Add("Carrot/Models/Enemies/"+k);}
   else{int id=game.level.id;if(id>=1&&id<=CarrotData.Waves.Length)foreach(var w in CarrotData.Waves[id-1])foreach(var part in w.Split(',')){var kind=part.Split(':')[0].Split('@')[0];if(kind=="boss"){if(!string.IsNullOrEmpty(game.level.boss)&&game.level.boss!="asuna")paths.Add("Carrot/Models/Bosses/"+game.level.boss);}else paths.Add((CarrotData.IsMini(kind)?"Carrot/Models/Minibosses/":"Carrot/Models/Enemies/")+(kind=="fragment"?"crystal":kind));}}
   foreach(var p in paths)rosterQueue.Enqueue(p);rosterFrames=0;CarrotQa.Count("duo.rosterQueued",paths.Count);
  }
  void StepRosterWarm(){
   if(rosterQueue.Count==0&&rosterLive.Count==0){if(rosterRig!=null){Destroy(rosterRig);rosterRig=null;}return;}
   if(warmFrames>=0||GameCamera==null)return;rosterFrames++;
   if(rosterRig==null){rosterRig=new GameObject("Roster warm-up");rosterRig.transform.SetParent(GameCamera.transform,false);rosterRig.transform.localPosition=new Vector3(0,0,.35f);rosterRig.transform.localRotation=Quaternion.identity;}
   if(rosterFrames%3==0)foreach(var g in rosterLive)if(g!=null)Destroy(g);if(rosterFrames%3==0)rosterLive.Clear();
   for(int i=0;i<2&&rosterQueue.Count>0;i++){var prefab=Resources.Load<GameObject>(rosterQueue.Dequeue());if(prefab==null)continue;var g=Instantiate(prefab,rosterRig.transform);g.transform.localPosition=new Vector3((rosterLive.Count%4-1.5f)*.004f,-.004f,0);var b=BoundsOf(g);g.transform.localScale*=.003f/Mathf.Max(.01f,b.size.y);foreach(var c in g.GetComponentsInChildren<Collider>(true))Destroy(c);foreach(var r in g.GetComponentsInChildren<Renderer>(true))r.shadowCastingMode=ShadowCastingMode.Off;rosterLive.Add(g);CarrotQa.Count("duo.rosterWarmed",1);}
  }

  // ---- shared upkeep: partner pushers, the weather box, the spectator reference ----------------------------------------------
  static CarrotView spectatorView;
  /// <summary>Host: the partner's creatures also part the grass of their half (the pusher array is a Shader global the host owns).</summary>
  int PartnerPushers(int n){
   var s=spectatorView;if(!DuoHalves||Spectator||s==null||s.game==null||s.dormant)return n;
   foreach(var e in s.game.enemies){if(n>=12)break;if(!e.alive||e.air||e.hidden)continue;bool boss=!string.IsNullOrEmpty(e.boss);pushers[n++]=new Vector4(e.position.x,e.position.z,boss?.95f:.4f,.28f);}
   return n;
  }
  /// <summary>Host: the weather and fog-card boxes cover the whole duo arena or Twin Gates (solo keeps the authored box).</summary>
  void DuoWeatherArea(){
   if(!DuoHost){effects.ResetAmbientArea();return;}
   Rect r=duoCfg.arena;if(r.width<=0)r=EndlessMap?CarrotDuoMaps.EndlessRect:DuoHalves&&game!=null&&game.level!=null?CarrotDuoMaps.ArenaRect(game.level.id):new Rect(-7.8f,-5.8f,15.6f,11.6f);
   effects.AmbientArea(new Vector3(r.center.x,0,r.center.y),new Vector3(Mathf.Max(1,r.width/15.6f),1,Mathf.Max(1,r.height/11.6f)));
  }

  // ---- L29 duo: the sky garden of one stacked half --------------------------------------------------------------------------
  // The solo prism builders, in the half's solo-grid frame (OwnWorld), with the seam side (local -z) trimmed at the wall strip and
  // no rim, bed or crystal on that side; L29's brook is built by the host's divider.
  bool OwnMirrored=>duoFrames.Count>0&&duoFrames[0].sx*duoFrames[0].sz<0;
  float PYaw(float yaw){return OwnMirrored?-yaw:yaw;}
  Quaternion PRot(float x,float y,float z){return OwnMirrored?Quaternion.Euler(-x,-y,z):Quaternion.Euler(x,y,z);}
  void PrismLocalBounds(out Vector3 min,out Vector3 max){min=new Vector3(float.MaxValue,0,float.MaxValue);max=new Vector3(float.MinValue,0,float.MinValue);foreach(var route in game.level.routes)foreach(var p in route){var l=OwnLocal(p);min=Vector3.Min(min,l);max=Vector3.Max(max,l);}foreach(var p in game.level.pads){var l=OwnLocal(p);min=Vector3.Min(min,l);max=Vector3.Max(max,l);}min.y=max.y=0;}
  float PrismSeamZ=>(duoFrames.Count>0?duoFrames[0].seamAt:-5)+.55f;
  void BuildDuoPrismTerrain(){PrismLocalBounds(out var min,out var max);float middle=(min.x+max.x)*.5f,length=max.x-min.x+3.4f;float depth=Mathf.Max(10.8f,max.z-min.z+2.8f);
   float z0=Mathf.Max(-depth*.5f,PrismSeamZ),z1=depth*.5f,zc=(z0+z1)*.5f,d=z1-z0;
   var pearl=PrismTiles("pearl-tiles",new Color(.80f,.86f,.90f),.68f,.12f);var edge=PrismCeramic("titanium",new Color(.15f,.24f,.32f),.72f,.7f);var ivory=PrismTiles("ivory-tiles",new Color(.92f,.92f,.88f),.6f,.08f,.6f);var seamGlow=PrismSeamGlow();
   var baseObject=PrismBeam("Floating sky garden chassis",OwnWorld(new Vector3(middle,-.025f,zc)),length,d,.78f,pearl,.18f);if(!Spectator)baseObject.AddComponent<MeshCollider>().sharedMesh=baseObject.GetComponent<MeshFilter>().sharedMesh;
   PrismBeam("Undercut titanium keel",OwnWorld(new Vector3(middle,-.69f,zc)),length-.4f,d-.4f,.38f,edge,.12f);
   for(int side=-1;side<=1;side+=2){float ze=side<0?z0+.16f:z1-.16f,zi=side<0?z0+.415f:z1-.415f;PrismBeam("White cantilever edge",OwnWorld(new Vector3(middle,.025f,ze)),length-.3f,.27f,.23f,ivory);SpectrumStrip("Spectral edge inlay",OwnWorld(new Vector3(middle,.036f,zi)),length-.7f,.175f);}
   for(float x=min.x-.8f;x<max.x+1;x+=4){PrismBeam("Inset terrace expansion joint (violet glow)",OwnWorld(new Vector3(x,-.012f,zc)),.04f,d-.5f,.012f,seamGlow,.003f);for(int side=-1;side<=1;side+=2)PrismBeam("Tapered underside rib",OwnWorld(new Vector3(x,-.60f,side*3.2f+zc*.3f)),.25f,3f,.62f,ivory,.09f);}
   for(int side=-1;side<=1;side+=2)PrismBeam("Longitudinal violet seam",OwnWorld(new Vector3(middle,-.012f,side*2.55f)),length-1,.035f,.012f,seamGlow,.003f);
   SpectrumRim("Rainbow rim (far side)",OwnWorld(new Vector3(middle,-.06f,z1+.012f)),length,.62f,PYaw(180));
   for(int side=-1;side<=1;side+=2)SpectrumRim("Rainbow rim (end)",OwnWorld(new Vector3(middle+side*(length*.5f+.012f),-.06f,zc)),d,.62f,side<0?90:-90);
  }
  void BuildDuoPrismRoads(){PrismLocalBounds(out var min,out var max);float center=(min.x+max.x)*.5f,length=max.x-min.x+.8f;
   var runway=PrismTiles("runway-tiles",new Color(.24f,.36f,.47f),.7f,.25f,.67f);var seam=PrismCeramic("seam",new Color(.70f,.80f,.96f),.72f,.42f);seam.SetColor("_EmissionColor",new Color(.45f,.36f,.75f)*.35f);
   PrismBeam("Continuous polished approach",OwnWorld(new Vector3(center,.061f,0)),length,1.34f,.085f,runway,.04f);
   for(int side=-1;side<=1;side+=2){PrismBeam("Runway silver edge",OwnWorld(new Vector3(center,.074f,side*.67f)),length,.055f,.035f,seam,.009f);SpectrumStrip("Seven colour runway inlay",OwnWorld(new Vector3(center,.08f,side*.474f)),length,.22f);}
   for(float x=min.x+.2f;x<max.x;x+=1.2f)PrismBeam("Runway luminous seam",OwnWorld(new Vector3(x,.078f,0)),.018f,.58f,.01f,seam,.002f);
  }
  void BuildDuoPrismDecoration(){PrismLocalBounds(out var min,out var max);var white=PrismCeramic("arch",new Color(.78f,.87f,.89f),.73f,.24f);var soil=Material("prism-bed-soil",new Color(.23f,.32f,.16f),0,.25f,0,1.5f);var gold=PrismCeramic("gold",new Color(.77f,.55f,.19f),.73f,.75f);
   float budget=FBudget;int index=0;
   for(float x=min.x+1.8f;x<max.x;x+=3.5f){Vector3 p=new Vector3(x,0,4.9f);var w=OwnWorld(p);PrismBeam("Floating botanical bed",w,2.25f,.87f,.14f,white);PrismBeam("Botanical soil",w+Vector3.up*.008f,2.03f,.65f,.035f,soil,.01f);PlaceScanned(index%3==0?"Shrub":"Fern",OwnWorld(p+new Vector3(-.35f,0,.03f)),index%3==0?.76f:.49f,PYaw(index*33));if(CarrotQuality.Rich&&budget>.99f)PlaceScanned("Fern",OwnWorld(p+new Vector3(.58f,0,-.08f)),.34f,PYaw(index*51));Flower(OwnWorld(p+new Vector3(.74f,0,.14f)),.22f,index%2==0?new Color(1,.48f,.65f):new Color(1,.83f,.39f));index++;}
   for(float x=min.x+3;x<max.x;x+=8){var arch=MeshObject("Open white orbital sculpture",PortalTorus(1.55f,.085f,64,7),white,decoration);arch.transform.position=OwnWorld(new Vector3(x,1.17f,5.9f));arch.transform.rotation=PRot(0,18,-24);arch.transform.localScale=new Vector3(1,1.35f,1);var ring=MeshObject("Suspended champagne band",PortalTorus(1.28f,.018f,64,5),gold,decoration);ring.transform.position=arch.transform.position;ring.transform.rotation=PRot(0,-12,24);ring.transform.localScale=new Vector3(1,1.35f,1);}
   int cluster=0;for(float x=min.x+1.8f;x<max.x;x+=3.5f){if(cluster++%2==0)PrismCrystalCluster(OwnWorld(new Vector3(x+1.05f,.07f,4.9f)),.7f,cluster*97+levelId);}
   for(float x=min.x+5;x<max.x;x+=8)PrismCrystalCluster(OwnWorld(new Vector3(x,.03f,5.35f)),1.1f,(int)(x*13));
   var srng=new System.Random(2913+levelId);for(int i=0;i<14;i++){float t=(i+.5f)/14;float x=Mathf.Lerp(min.x-6,max.x+6,t)+(float)(srng.NextDouble()-.5)*3;bool below=i%3!=0;
    Vector3 at=below?new Vector3(x,-3.2f-(float)srng.NextDouble()*6,(float)(srng.NextDouble()*2-1)*9-3):new Vector3(x,(float)srng.NextDouble()*3-1,13+(float)srng.NextDouble()*10);float size=1.2f+(float)srng.NextDouble()*2.2f;
    if(at.z<PrismSeamZ+1.5f||i%5==4&&budget<1)continue;PrismCrystalCluster(OwnWorld(at),size,i*53+levelId*7,false);}
   for(int i=0;i<4;i++){float x=Mathf.Lerp(min.x,max.x,(i+.5f)/4);var far=PrismBeam("Distant sky garden",OwnWorld(new Vector3(x,-4-i*.4f,12+i%2*4)),5+i*.6f,2.4f,.45f,white,.12f);far.transform.rotation=Quaternion.Euler(0,PYaw(i*11-15),0);PrismCrystalCluster(far.transform.position+Vector3.up*.25f,2.2f,i*31+7);}
  }
 }
}
