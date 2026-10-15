using System;
using System.Collections.Generic;
using UnityEngine;
using UnityEngine.Rendering;
using UnityEngine.Rendering.Universal;
using Cinemachine;
using UnityEngine.Playables;
using UnityEngine.Timeline;
using Unity.Mathematics;
using UnityEngine.Splines;
using UnityEngine.Animations.Rigging;

namespace CarrotTD {
 public sealed class CarrotClickable : MonoBehaviour { public string type; public int id; }

 public sealed partial class CarrotView : MonoBehaviour {
  #if UNITY_WEBGL && !UNITY_EDITOR
  [System.Runtime.InteropServices.DllImport("__Internal")] static extern float Carrot_CanvasCSSWidth();
  [System.Runtime.InteropServices.DllImport("__Internal")] static extern float Carrot_DisplayPeriodMs();
  #else
  static float Carrot_DisplayPeriodMs(){return 0;}
  #endif
  float inputPixelScale=1;
  sealed class Actor {
   public GameObject root;public Transform model,turret,core,barrel,petals,pages,muzzle,shadow;public Animation animation;public string currentClip;public string kind;public int tier;
   public Vector3 modelScale,barrelRest;public Quaternion modelRotation;public Renderer[] renderers;public float lastHitFlash=-1,lastRim=-1,flash=-1,hitRemaining,deadClock,lastShotClock=-9,spawnClock=-9,spin,spinRing,baseSpeed,shadowSize,lastDissolve=-1;public Bounds bounds;
   public Transform ring;public Transform[] bells=new Transform[0];public Vector3 ringRest,jolt,joltVel,lane;public Quaternion turretYaw=Quaternion.identity;public Color tone=Color.white,lastEmission,lastTint;public string hitClip;public bool heavyHit,upgraded;public float stride;public RigBuilder rig;public Transform aimTarget;
   // Super towers (Ring02/Ring03 halo, five bells, the tier-4 fallback glow) and the challenge bosses' pivots, all resolved once in Spawn.
   public Transform ring2,ring3;public bool superFallback;public float moteClock;
   public Transform[] expansionParts;public bool expansionActor;public CarrotModelMetrics metrics;public CarrotAsunaMotion asunaMotion;public float asunaHitAt=-9;
   public Transform[] funnels,debrisRings,tentacles;public Transform upperLid,lowerLid,pupil;public Renderer[] iris;public float blink,dustClock;
  }
  struct Yank{public GameObject root;public float start;public Vector3 position;public Quaternion rotation;}
  struct Mark{public Vector3 position;public float until;}
  public Camera GameCamera;
  CarrotGame game;CarrotEffects effects;CarrotAudio sound;
  readonly Dictionary<int,Actor> towers=new Dictionary<int,Actor>(),enemies=new Dictionary<int,Actor>(),blockers=new Dictionary<int,Actor>();
  readonly Dictionary<int,GameObject> pads=new Dictionary<int,GameObject>();
  readonly Dictionary<string,Material> materials=new Dictionary<string,Material>();
  readonly List<Mesh> createdMeshes=new List<Mesh>();
  readonly Dictionary<Transform,Quaternion> restRotations=new Dictionary<Transform,Quaternion>();readonly Dictionary<Transform,Vector3> restPositions=new Dictionary<Transform,Vector3>(),restScales=new Dictionary<Transform,Vector3>();
  readonly Dictionary<Transform,Vector3> eyeScales=new Dictionary<Transform,Vector3>();
  readonly List<int> removeIds=new List<int>();readonly HashSet<int> seen=new HashSet<int>();
  Transform world,decoration;Actor carrot;int levelId=-1;float clock,carrotHit,zoom=1,targetZoom=1,ambientClock;Vector3 pan,targetPan;
  float carrotHop,lastDim;int lastWave;Vector3 carrotHitDir=Vector3.forward;PlayableDirector director;TimelineAsset bossEntrance;CarrotCinematics receiver;CinemachineVirtualCamera vcamBoss,vcamOrbit,vcamReveal;CinemachineTransposer bossBody,orbitBody,revealBody;Light bossSpot;int pendingBoss=-1;float dipClock=-1,sunBase=2.6f,fogEndBase=70,orbitClock=-1,revealClock=-1,defeatClock=-1,beatClock=-1;int signalsFired;Texture2D cookie;UniversalAdditionalLightData sunData;readonly List<Light> lanterns=new List<Light>();readonly Vector4[] pushers=new Vector4[12];CinemachineBrain brain;CinemachineVirtualCamera vcamPlay;CinemachineTransposer body;CinemachineImpulseSource impulse;Transform rig;float hitStop,slowMo,slowScale=1,viewScale=1,fovPunch;
  Vector2 pointerStart,pointerPrevious;bool pointerDown,dragging,suppressTouchClick,portraitCamera;float pinchDistance;int lastWidth,lastHeight;string previousPhase="";Light sun,fill;Volume grade;Material skyMaterial;float tierClock,tierAccum;int tierFrames;
  LineRenderer selectionRing,rangeRing;MaterialPropertyBlock properties;GameObject[] nature;GameObject treeAutumn,treeOak,treePine,pumpkinPrefab,hayPrefab,cratePrefab;readonly Dictionary<string,GameObject> realNature=new Dictionary<string,GameObject>();Texture2D atlas;
  Vector3 carrotPosition;float bossIntro;Vector3 bossFocus;Vector3 cameraTarget=new Vector3(0,.35f,.2f);Quaternion cameraAngle=Quaternion.Euler(34,-9,0);float fitDistance=25;
  // Blindness overlay (one quad on the camera near plane), uprooted towers mid-yank, live telegraph marks (Super decals dim near them) and the Super merge drag.
  MeshRenderer blindQuad;Material blindMaterial;float blindLevel,blindDim,blindWindup;readonly List<Yank> yanks=new List<Yank>();readonly List<Mark> marks=new List<Mark>();
  int pressTower,mergeSource,mergeTarget;float pressClock,holdLift;bool mergeDrag,holdArmed,pressTouch;GameObject mergeGhost;Renderer[] mergeGhostRenderers;readonly LineRenderer[] partnerRings=new LineRenderer[6];LineRenderer superRing;float snapBack=-1;Vector3 snapFrom;string snapKind;
  GameObject flightGhost;Renderer[] flightRenderers;float flightClock=-1;Vector3 flightFrom,flightTo;bool wasPaused;string flightKind;
  void Awake(){CarrotQuality.Choose();StartCoroutine(WatchFrameWork());{float period=Carrot_DisplayPeriodMs();if(period>=6&&period<=40)tierRefresh=SnapPeriod(period);}
   // Physics is only ever asked for raycasts (SelectAt): nothing steps PhysX, so no catch-up FixedUpdates after a long frame and no per-frame transform sync for the moving colliders; SelectAt syncs transforms itself before the cast.
   Physics.simulationMode=SimulationMode.Script;Time.fixedDeltaTime=1f/30;Time.maximumDeltaTime=.1f;
   Shader.SetGlobalFloat("_CarrotGust",1);game=GetComponent<CarrotGame>();effects=gameObject.AddComponent<CarrotEffects>();sound=gameObject.AddComponent<CarrotAudio>();effects.CameraImpulse=Impulse;effects.HitStop=BeatTime;effects.FovPunch=deg=>{if(!reducedMotion){fovPunch=Mathf.Max(fovPunch,deg/(portraitCamera?1:1.6f));CarrotQa.Count("fovPunch",1);}};effects.IsClone=id=>{foreach(var en in game.enemies)if(en.id==id)return en.clone;return false;};effects.LicensedAnchor=id=>enemies.TryGetValue(id,out var enemyActor)?enemyActor.root.transform:towers.TryGetValue(id,out var towerActor)?towerActor.root.transform:null;effects.Ground=p=>game!=null&&game.level!=null?SurfaceHeight(p):0;properties=new MaterialPropertyBlock();atlas=Resources.Load<Texture2D>("Carrot/Textures/MaterialAtlas");var naturalPrefabs=new List<GameObject>();foreach(var name in new[]{"Rock","RockTall","Pebble","FlowerWhite","FlowerPurple","Bridge","Stump"}){var prefab=Resources.Load<GameObject>("Carrot/Nature/"+name);if(prefab!=null)naturalPrefabs.Add(prefab);}nature=naturalPrefabs.ToArray();treeAutumn=Resources.Load<GameObject>("Carrot/Nature/TreeAutumn");treeOak=Modelled(Resources.Load<GameObject>("Carrot/Nature/TreeOak"));treePine=Modelled(Resources.Load<GameObject>("Carrot/Nature/TreePine"));pumpkinPrefab=Resources.Load<GameObject>("Carrot/Nature/Pumpkin");hayPrefab=Resources.Load<GameObject>("Carrot/Nature/HayBale");cratePrefab=Resources.Load<GameObject>("Carrot/Nature/CrateStack");foreach(var name in new[]{"Fern","Stump","MossRockA","MossRockB","Shrub","FernSmall","StumpSmall","MossRockASmall","MossRockBSmall","ShrubSmall"}){var prefab=Resources.Load<GameObject>("Carrot/RealNature/"+name);if(prefab!=null)realNature[name]=prefab;}CreateCamera();CreateBlindOverlay();CreateCinematics();CreateLighting();worldBars=new CarrotWorldBars(transform);AdvertiseCap("worldBars",CarrotWorldBars.Active);SetupCanvasGestures();selectionRing=CreateRing("Selection",new Color(1,.88f,.44f),.035f);rangeRing=CreateRing("Range",new Color(.75f,.95f,1,.7f),.035f);for(int i=0;i<partnerRings.Length;i++)partnerRings[i]=CreateRing("Partner "+i,new Color(.5f,1,.7f,.9f),.03f);superRing=CreateRing("Super range",new Color(1,.85f,.35f,.8f),.04f);if(game!=null)game.Effect+=OnEffect;}
  /// <summary>
  /// The Blindness screen effect: one quad parented to the game camera at nearClip + 0.05 u, sized to the frustum every frame it is visible,
  /// drawn with Carrot/BlindOverlay (Queue Overlay, ZTest Always) and coloured through a property block. Its renderer is disabled whenever the
  /// alpha is 0. Post-processing runs after it, so black stays black under ACES. Nothing is locked while it is up: input and the simulation go on.
  /// </summary>
  void CreateBlindOverlay(){var shader=Shader.Find("Carrot/BlindOverlay");if(shader==null){Debug.LogWarning("Carrot/BlindOverlay shader missing; blindness has no screen effect");return;}blindMaterial=new Material(shader);materials["blind-overlay"]=blindMaterial;var go=CarrotMeshes.Create(PrimitiveType.Quad,"Blind overlay");go.transform.SetParent(GameCamera.transform,false);go.transform.localPosition=new Vector3(0,0,GameCamera.nearClipPlane+.05f);go.transform.localRotation=Quaternion.identity;blindQuad=go.GetComponent<MeshRenderer>();blindQuad.sharedMaterial=blindMaterial;blindQuad.shadowCastingMode=ShadowCastingMode.Off;blindQuad.receiveShadows=false;blindQuad.enabled=false;}
  /// <summary>
  /// Drives the overlay from the simulation's blind fields: fade in over 0.25 s to blindAlpha, hold while elapsed &lt; blindUntil, fade out over
  /// 0.6 s, never strobing. During a blind/whiteout/dusk windup the overlay pulses 0 to 0.25 at 2 Hz in the ability tint (the lanterns flicker
  /// with it). Tint 1 (Whiteout) is a white edge vignette; the Unknown Eyeball's iris stays visible through a hole at its screen point, and a
  /// faint glow marks the carrot in the dark.
  /// </summary>
  void UpdateBlind(float raw){
   if(blindQuad==null)return;bool dark=game.elapsed<game.blindUntil&&game.phase=="playing";bool fullBlackout=(game.blindKind=="blackout"&&dark)||expansionBlackoutFading;float target=dark?(game.blindKind=="blackout"?1:game.blindAlpha):0;
   if(blindLevel<target)blindLevel=Mathf.Min(target,blindLevel+raw*target/.25f);else if(blindLevel>target)blindLevel=Mathf.Max(target,blindLevel-raw/.6f);
   string windupKind="";Vector3 eye=Vector3.zero;bool eyeball=false;
   foreach(var e in game.enemies){if(string.IsNullOrEmpty(e.boss)||!e.alive)continue;if(e.castRemaining>0&&(e.ability=="blind"||e.ability=="whiteout"||e.ability=="dusk"||e.ability=="blackout"))windupKind=e.ability;if(e.boss=="eyeball"){eyeball=true;eye=e.position;}}
   blindWindup=windupKind!=""&&!game.paused?.125f+.125f*Mathf.Sin(clock*Mathf.PI*4):0;
   float alpha=Mathf.Max(blindLevel,blindWindup);bool white=game.blindTint>=.5f&&(dark||blindLevel>0);
   Color tint=white?new Color(.97f,.99f,1):windupKind=="whiteout"?new Color(.9f,.97f,1):blindLevel>0?new Color(.012f,.01f,.022f):CarrotEffects.Tone(windupKind=="dusk"?"dusk":"blind")*.45f;
   if(blindLevel>0&&windupKind==""&&!white)tint=new Color(.012f,.01f,.022f);
   if(fullBlackout){tint=Color.black;alpha=Mathf.Max(alpha,blindLevel);white=false;}
   blindQuad.enabled=alpha>.002f;
   if(blindQuad.enabled){float z=GameCamera.nearClipPlane+.05f;float h=2*z*Mathf.Tan(GameCamera.fieldOfView*Mathf.Deg2Rad*.5f)*1.02f;var t=blindQuad.transform;t.localPosition=new Vector3(0,0,z);t.localScale=new Vector3(h*GameCamera.aspect,h,1);
    Vector4 hole=new Vector4(.5f,.5f,.12f,0);if(eyeball&&!white&&!fullBlackout){Vector3 v=GameCamera.WorldToViewportPoint(eye+Vector3.up*1.1f);if(v.z>0)hole=new Vector4(v.x,v.y,.12f,blindLevel>0?1:0);}
    properties.Clear();properties.SetColor("_Color",new Color(tint.r,tint.g,tint.b,alpha));properties.SetFloat("_Radial",white?1:0);properties.SetVector("_Hole",hole);blindQuad.SetPropertyBlock(properties);}
   // Sun/fog dip folded into the dipClock envelope (max of both writers) and the carrot's lantern glow.
   blindDim=white?blindLevel*.2f:blindLevel*.7f;effects.CarrotLantern(carrotPosition,white||fullBlackout?0:Mathf.Clamp01(blindLevel*1.2f));
  }
  /// <summary>Uprooted towers: lifted 0.6 u and tilted 25 degrees over 0.45 s, then destroyed (the burst already played at the commit).</summary>
  void UpdateYanks(){for(int i=yanks.Count-1;i>=0;i--){var y=yanks[i];if(y.root==null){yanks.RemoveAt(i);continue;}float t=Mathf.Clamp01((clock-y.start)/.45f);float e=EaseOut(t);y.root.transform.position=y.position+Vector3.up*.6f*e;y.root.transform.rotation=Quaternion.AngleAxis(25*e,Vector3.right)*y.rotation;if(t>=1){Destroy(y.root);yanks.RemoveAt(i);}}}
  /// <summary>The merge burst's kind-4 ghost flying from the source pad to the target over 0.45 s (ease-out cubic, scale to 0.6, alpha fade); the snap-back after a dropped drag reuses it.</summary>
  void UpdateFlight(){if(flightClock<0||flightGhost==null)return;flightClock+=Time.deltaTime>0?Mathf.Min(Time.deltaTime,.05f)*(game.paused?0:1):0;float t=Mathf.Clamp01(flightClock/.45f);float e=EaseOutCubic(t);flightGhost.transform.position=Vector3.Lerp(flightFrom,flightTo,e)+Vector3.up*Mathf.Sin(t*Mathf.PI)*.35f;flightGhost.transform.localScale=Vector3.one*Mathf.Lerp(1,.6f,e)*ActorScale;properties.Clear();properties.SetColor("_Color",new Color(1,.9f,.6f,.7f*(1-t*t)));foreach(var r in flightRenderers)if(r!=null)r.SetPropertyBlock(properties);if(t>=1){flightGhost.SetActive(false);flightGhost=null;flightClock=-1;}}
  /// <summary>
  /// Links every shader program a level can need in the first two rendered frames instead of mid-game: a rig of pin-sized quads parented to the
  /// game camera (0.3 u in front of it, 2 mm wide, a few pixels on screen) carries one material per effect shader (additive and alpha particles,
  /// bolts, decals, contact shadows, the Storybook surface with cutout, wind, dissolve and world textures, water) plus a tiny point light, so the
  /// first frame also links the additional-light variants of the tier. The rig is destroyed after three frames. Measured without it: first-use
  /// links of 40-150 ms mid-game on a desktop (the first shot, the first decal), several times longer on phones. Rendering a separate hidden
  /// frame in Awake was tried first and cost 0.8 s of start-up on top of the links, and riding the real first frame held the HUD back by the
  /// same links (250 ms on a desktop, four times that on a phone), so the rig now starts four frames after the first level build, once the
  /// first state has reached the page and the HUD is on screen, and spreads its quads over three frames.
  /// </summary>
  void WarmShaders(){
   if(GameCamera==null)return;var mats=new List<Material>();warmMaterials=mats;
   try{
    var root=new GameObject("Shader warm-up");root.transform.SetParent(GameCamera.transform,false);root.transform.localPosition=new Vector3(0,0,.3f);root.transform.localRotation=Quaternion.identity;warmRoot=root;warmFrames=0;
    var lightGo=new GameObject("Warm-up light");lightGo.transform.SetParent(root.transform,false);lightGo.transform.localPosition=new Vector3(0,.004f,-.004f);var point=lightGo.AddComponent<Light>();point.type=LightType.Point;point.range=.02f;point.intensity=.5f;point.shadows=LightShadows.None;point.renderMode=LightRenderMode.ForcePixel;
    var sheet=Resources.Load<Texture2D>("Carrot/Textures/VfxSheet");
    Material M(string shader,Action<Material> setup=null){var sh=Shader.Find(shader);if(sh==null)return null;var m=new Material(sh);if(setup!=null)setup(m);mats.Add(m);return m;}
    var list=new List<Material>{
     M("Carrot/FxAdditive",m=>{m.SetTexture("_MainTex",sheet);m.SetFloat("_UseAtlas",1);m.SetFloat("_Soft",0);}),M("Carrot/FxAdditive",m=>{m.SetFloat("_UseAtlas",0);m.SetFloat("_Soft",1);}),
     M("Carrot/FxAlpha",m=>{m.SetTexture("_MainTex",sheet);m.SetFloat("_UseAtlas",1);m.SetFloat("_Puff",.35f);}),M("Carrot/FxAlpha",m=>m.SetFloat("_UseAtlas",0)),
     M("Carrot/PortalAperture"),M("Carrot/FxDecalQuad",m=>m.SetTexture("_MainTex",sheet)),M("Carrot/Contact",m=>m.SetColor("_Color",new Color(.055f,.075f,.085f,.31f))),
     M("Carrot/Storybook"),M("Carrot/Storybook",m=>{m.SetFloat("_Cutoff",.38f);m.SetFloat("_Cull",0);m.SetFloat("_Wind",.012f);m.SetFloat("_Translucency",.5f);}),
     M("Carrot/Storybook",m=>{m.SetFloat("_Dissolve",.4f);m.SetColor("_EmissionColor",new Color(1,.7f,.25f));}),M("Carrot/Storybook",m=>{m.SetFloat("_WorldTexture",1);m.SetFloat("_Bend",1);m.SetFloat("_Cull",0);m.SetTexture("_MainTex",atlas);}),
     M("Carrot/Water",m=>{m.SetColor("_Color",new Color(.018f,.071f,.068f));m.SetColor("_Shallow",new Color(.11f,.24f,.23f));})};
    // Acquired shared materials join the staged link queue, but never the owned-material disposal list.
    var borrowedMaterials=new HashSet<Material>();
    if(PrismStage){var asuna=Resources.Load<GameObject>("Carrot/Models/Bosses/Asuna");if(asuna!=null)foreach(var renderer in asuna.GetComponentsInChildren<Renderer>(true))foreach(var material in renderer.sharedMaterials)if(material!=null&&borrowedMaterials.Add(material))list.Add(material);}
    var licensedLibrary=Resources.Load<CarrotLicensedFxLibrary>("Carrot/LicensedFx/Library");
    if(licensedLibrary!=null&&licensedLibrary.effects!=null)foreach(var effect in licensedLibrary.effects)if(effect!=null&&effect.prefab!=null)foreach(var renderer in effect.prefab.GetComponentsInChildren<Renderer>(true))foreach(var material in renderer.sharedMaterials)if(material!=null&&borrowedMaterials.Add(material))list.Add(material);
    int n=0;warmQuads.Clear();foreach(var m in list){if(m==null)continue;var go=CarrotMeshes.Create(PrimitiveType.Quad,"Warm-up "+m.shader.name);go.transform.SetParent(root.transform,false);go.transform.localPosition=new Vector3((n%4-1.5f)*.003f,(n/4-1)*.003f,0);go.transform.localScale=Vector3.one*.00002f;var r=go.GetComponent<MeshRenderer>();r.sharedMaterial=m;r.shadowCastingMode=m.shader.name=="Carrot/Storybook"?ShadowCastingMode.On:ShadowCastingMode.Off;r.receiveShadows=true;go.SetActive(false);warmQuads.Add(go);n++;}
    if(list[1]!=null){var line=new GameObject("Warm-up bolt");line.transform.SetParent(root.transform,false);var lr=line.AddComponent<LineRenderer>();lr.sharedMaterial=list[1];lr.useWorldSpace=false;lr.positionCount=3;lr.SetPositions(new[]{new Vector3(-.003f,-.005f,0),new Vector3(0,-.004f,0),new Vector3(.003f,-.005f,0)});lr.widthMultiplier=.0005f;lr.shadowCastingMode=ShadowCastingMode.Off;line.SetActive(false);warmQuads.Add(line);}
    Debug.Log("CARROT_WARMUP materials="+n+" tier="+CarrotQuality.Name(CarrotQuality.Tier));
   }catch(Exception error){Debug.LogWarning("Carrot shader warm-up skipped: "+error.Message);EndWarmup();}
  }
  GameObject warmRoot;int warmFrames=-1,warmCountdown;List<Material> warmMaterials;readonly List<GameObject> warmQuads=new List<GameObject>();
  // Four quads (a few program links each) come on per frame, so the links spread over three frames instead of one 250 ms stall; the rig lives three frames past the last batch.
  void StepWarmup(){if(warmFrames<0||warmRoot==null)return;int batch=warmFrames*4;for(int i=batch;i<batch+4&&i<warmQuads.Count;i++)if(warmQuads[i]!=null)warmQuads[i].SetActive(true);warmFrames++;if(batch>=warmQuads.Count+8)EndWarmup();}
  void EndWarmup(){if(warmRoot!=null)Destroy(warmRoot);warmRoot=null;if(warmMaterials!=null)foreach(var m in warmMaterials)if(m!=null)Destroy(m);warmMaterials=null;warmQuads.Clear();warmFrames=-1;}
  void OnDestroy(){if(worldBars!=null){worldBars.Dispose();AdvertiseCap("worldBars",false);}EndWarmup();if(game!=null)game.Effect-=OnEffect;foreach(var m in materials.Values)Destroy(m);foreach(var m in createdMeshes)Destroy(m);CinemachineCore.UniformDeltaTimeOverride=-1;CinemachineCore.CurrentTimeOverride=-1;}
#if UNITY_EDITOR || DEVELOPMENT_BUILD || CARROT_QA
  // Prepare the scene before a review-only spawn emits its entrance and music events.
  public void PrepareReviewLevel(){if(game!=null&&game.level!=null&&levelId!=game.level.id)BuildLevel();}
#endif
  public void SetMuted(bool muted){if(sound!=null)sound.SetMuted(muted);}
  public void UiSound(string kind){if(sound!=null)sound.UiSound(kind);}
  /// <summary>Debug entry (additive, unused by the page): "high"/"medium"/"low" force a tier; "nodof", "nossao", "nofog", "nofogpass", "nobloom", "noaa", "nomsaa", "noopaque", "nocookie" switch one feature off for A/B captures; "scale:0.8" sets the render scale and "interval:2" the frame interval.</summary>
  readonly Dictionary<string,float> qaGains=new Dictionary<string,float>();
  public void Quality(string tier){
   if(tier.StartsWith("no")){var live=grade!=null?grade.profile:null;if(tier=="nodof"&&live!=null&&live.TryGet<DepthOfField>(out var d))d.active=false;else if(tier=="nobloom"&&live!=null&&live.TryGet<Bloom>(out var b))b.active=false;else if(tier=="nofog")Shader.SetGlobalVector("_CarrotHeightFog",Vector4.zero);else if(tier=="noaa")GameCamera.GetUniversalAdditionalCameraData().antialiasing=AntialiasingMode.None;else if(tier=="nomsaa"){var asset=UnityEngine.Rendering.GraphicsSettings.currentRenderPipeline as UniversalRenderPipelineAsset;if(asset!=null)asset.msaaSampleCount=1;}else if(tier=="nossao"){var asset=UnityEngine.Rendering.GraphicsSettings.currentRenderPipeline as UniversalRenderPipelineAsset;var rd=asset!=null?asset.rendererDataList[0] as ScriptableRendererData:null;if(rd!=null)foreach(var f in rd.rendererFeatures)if(f is ScreenSpaceAmbientOcclusion)f.SetActive(false);}else if(tier=="nofogpass"){var asset=UnityEngine.Rendering.GraphicsSettings.currentRenderPipeline as UniversalRenderPipelineAsset;var rd=asset!=null?asset.rendererDataList[0] as ScriptableRendererData:null;if(rd!=null)foreach(var f in rd.rendererFeatures)if(f is FullScreenPassRendererFeature)f.SetActive(false);}else if(tier=="noopaque"){var asset=UnityEngine.Rendering.GraphicsSettings.currentRenderPipeline as UniversalRenderPipelineAsset;if(asset!=null)asset.supportsCameraOpaqueTexture=false;}else if(tier=="nocookie"&&sun!=null)sun.cookie=null;Debug.Log("CarrotQuality debug "+tier);return;}
   if(tier.StartsWith("path:")||tier.StartsWith("ground:")){bool path=tier[0]=='p';float v;if(float.TryParse(tier.Substring(tier.IndexOf(':')+1),System.Globalization.NumberStyles.Float,System.Globalization.CultureInfo.InvariantCulture,out v))foreach(var kv in materials)if(kv.Value!=null&&kv.Key.StartsWith(path?"path-":"ground-")&&!kv.Key.StartsWith("path-edge")&&!kv.Key.StartsWith("path-stone")){if(!kv.Value.HasProperty("_AlbedoGain"))continue;float baseGain=kv.Value.GetFloat("_AlbedoGain");if(!qaGains.ContainsKey(kv.Key))qaGains[kv.Key]=baseGain;kv.Value.SetFloat("_AlbedoGain",qaGains[kv.Key]*v);}Debug.Log("CarrotQuality debug "+tier);return;}
   if(tier.StartsWith("exposure:")||tier.StartsWith("sun:")||tier.StartsWith("ambient:")){int colon=tier.IndexOf(':');float v;if(float.TryParse(tier.Substring(colon+1),System.Globalization.NumberStyles.Float,System.Globalization.CultureInfo.InvariantCulture,out v)){if(tier[0]=='e')debugExposure=v;else if(tier[0]=='s')debugSun=v;else debugAmbient=v;ApplyBiomeLighting();Debug.Log("CarrotQuality debug "+tier);}return;}
   if(tier.StartsWith("scale:")){float scale;if(float.TryParse(tier.Substring(6),System.Globalization.NumberStyles.Float,System.Globalization.CultureInfo.InvariantCulture,out scale))CarrotQuality.SetRenderScale(scale,"debug");return;}
   if(tier.StartsWith("interval:")){int interval;if(int.TryParse(tier.Substring(9),out interval)){OnDemandRendering.renderFrameInterval=Mathf.Clamp(interval,1,4);Debug.Log("CarrotQuality interval="+OnDemandRendering.renderFrameInterval+" reason=debug");}return;}
   CarrotQuality.Force(tier=="high"?CarrotQuality.HighTier:tier=="medium"?CarrotQuality.MediumTier:CarrotQuality.LowTier);OnDemandRendering.renderFrameInterval=1;var data=GameCamera.GetUniversalAdditionalCameraData();data.antialiasing=CarrotQuality.Rich?AntialiasingMode.FastApproximateAntialiasing:AntialiasingMode.None;ApplyBiomeLighting();}
  void Update(){if(game==null||game.level==null)return;CarrotQa.FrameStart();if(levelId!=game.level.id){bool first=levelId<0;BuildLevel();if(first)warmCountdown=4;}if(warmCountdown>0&&--warmCountdown==0)WarmShaders();StepWarmup();float raw=Mathf.Min(Time.deltaTime,.05f);bool frozen=game.paused;float dt=frozen?0:raw*(game.phase=="playing"?Mathf.Clamp(game.speed,1,2):1);
   // Hit-stop and slow motion scale only the presentation clock; the simulation keeps its own dt.
   if(dt>0){if(hitStop>0)hitStop-=raw;if(slowMo>0)slowMo-=raw;}viewScale=hitStop>0?.05f:slowMo>0?slowScale:1;float viewDt=dt*viewScale;
   clock+=viewDt;Shader.SetGlobalFloat("_CarrotTime",clock);Shader.SetGlobalFloat("_CarrotGust",1+.7f*Mathf.Max(0,Mathf.Sin(clock*.23f))*(.5f+.5f*Mathf.PerlinNoise(clock*.4f,3.7f)));Shader.SetGlobalFloat("_CarrotSuperPulse",-.05f+.3f*Mathf.Sin(clock*2.4f));WatchFrameTime();if(sunData!=null&&sun.cookie!=null)sunData.lightCookieOffset+=new Vector2(.04f,.02f)*viewDt;
   // Lanterns flicker through a blind/whiteout/dusk windup (gutter to 15-100 %) and die to a quarter while the screen is dark.
   float lanternBase=game.level.biome=="orchard"?6:game.level.biome=="arena"?6.5f:7;float gutter=blindWindup>0?Mathf.Lerp(.15f,1,Mathf.Abs(Mathf.Sin(clock*21))*Mathf.PerlinNoise(clock*9,2.1f)):1-.75f*Mathf.Clamp01(blindLevel*1.5f);for(int i=0;i<lanterns.Count;i++)if(lanterns[i]!=null)lanterns[i].intensity=lanternBase*(.9f+.2f*Mathf.PerlinNoise(clock*3,i*7.3f))*gutter;CarrotQa.Section("view.start");UpdatePushers();effects.Tick(viewDt);CarrotQa.Section("effects");UpdateExpansionScene(viewDt);sound.Tick(raw,game.paused,game.phase);CarrotQa.Section("sound");UpdateInput();UpdateRig(raw);UpdateRoutePulses(raw);UpdateCamera(raw,viewDt);CarrotQa.Section("input.camera");UpdateActors(viewDt);CarrotQa.Section("actors");UpdateYanks();UpdateFlight();UpdateCarrot(viewDt);UpdateSelection();UpdateBlind(raw);if(game.phase!=previousPhase){if(game.phase=="playing")sound.Unlock();previousPhase=game.phase;}
   CarrotQa.Section("actors.post");UpdateCinematics(viewDt,dt);
   // The play camera keeps following input while the game is paused (pan and zoom work on the pause card); hit-stop and slow motion still slow it.
   CinemachineCore.UniformDeltaTimeOverride=frozen?raw:viewDt;CinemachineCore.CurrentTimeOverride=clock;brain.ManualUpdate();CarrotQa.Section("cinemachine");ApplyShake(raw);UpdateWorldBars(raw);CarrotQa.Section("worldbars");DrawContactShadows();CarrotQa.Section("contactshadows");}
  bool quietBeat;
  void StartBossBeat(Actor bossActor){
   // Reduced motion: the entrance keeps its dust, roar and ring on the clock (and the audio), without the hero-shot camera move.
   // Never move the camera under a finger: a press, a selected pad or tower, or a merge drag also keeps the play camera.
   if(reducedMotion||pointerDown||mergeDrag||game.selectionType=="pad"||game.selectionType=="tower"){quietBeat=true;beatClock=0;signalsFired=0;return;}quietBeat=false;CarrotQa.Count("camera.cinematic",1);
   // Hero shot: a three-quarter view from the carrot side; the camera slides right so the boss stands in the left third, clear of the HUD and the warning card.
   Quaternion rot=Quaternion.Euler(portraitCamera?56:33,cameraAngle.eulerAngles.y+28,0);vcamBoss.Follow=bossActor.root.transform;vcamBoss.transform.rotation=rot;bossBody.m_FollowOffset=-(rot*Vector3.forward)*(portraitCamera?8.5f:10.5f)+Vector3.up*1.1f+rot*Vector3.right*(portraitCamera?.5f:2.2f);vcamBoss.m_Lens.FieldOfView=portraitCamera?34:30;vcamBoss.ForceCameraPosition(bossActor.root.transform.position+bossBody.m_FollowOffset,rot);director.time=0;director.Play(bossEntrance);director.Evaluate();beatClock=0;signalsFired=0;}
  void UpdateCinematics(float viewDt,float dt){
   if(pendingBoss>=0){if(enemies.TryGetValue(pendingBoss,out var bossActor)){pendingBoss=-1;StartBossBeat(bossActor);}else{bool present=false;foreach(var e in game.enemies)if(e.id==pendingBoss)present=true;if(!present)pendingBoss=-1;}}
   if(beatClock>=0&&quietBeat){beatClock+=viewDt;if(signalsFired==0&&beatClock>=.15f){OnSignal("bossDust");signalsFired=1;}if(signalsFired==1&&beatClock>=.4f){OnSignal("bossRoar");signalsFired=2;}if(signalsFired==2&&beatClock>=1.35f){OnSignal("bossRing");signalsFired=3;}if(beatClock>=2.4f){beatClock=-1;quietBeat=false;}}
   else if(beatClock>=0){beatClock+=viewDt;director.time=Math.Min(director.time+viewDt,director.duration);director.Evaluate();
    // Fallback when the signal track does not notify on a manually evaluated graph: fire the three beats from the clock.
    if(signalsFired==0&&beatClock>=.15f){OnSignal("bossDust");signalsFired=1;}if(signalsFired==1&&beatClock>=.4f){OnSignal("bossRoar");signalsFired=2;}if(signalsFired==2&&beatClock>=1.35f){OnSignal("bossRing");signalsFired=3;}
    if(CarrotQuality.Rich&&vcamBoss.Follow!=null){bossSpot.enabled=beatClock>.3f&&beatClock<2.4f;bossSpot.transform.position=vcamBoss.Follow.position+Vector3.up*4.5f;bossSpot.transform.rotation=Quaternion.LookRotation(Vector3.down+Vector3.forward*.05f);}
    if(director.time>=director.duration-.0005f){director.Stop();beatClock=-1;bossSpot.enabled=false;}}
   // One writer for the key-light dip: the roar envelope and the blindness level (max of both), restored once both are gone.
   {float env=0;if(dipClock>=0){dipClock+=viewDt;float t=dipClock;env=t<.4f?t/.4f:t<1.6f?1:t<2f?(2-t)/.4f:0;if(t>=2f)dipClock=-1;}float dim=Mathf.Max(.6f*env,blindDim);if(dim>0||lastDim>0){sun.intensity=sunBase*(1-dim);RenderSettings.fogEndDistance=fogEndBase*(1-.5f*dim);}lastDim=dim;}
   if(revealClock>=0){revealClock+=dt;revealBody.m_FollowOffset=-(vcamReveal.transform.rotation*Vector3.forward)*(fitDistance*1.14f/zoom);if(revealClock>1.3f){revealClock=-1;vcamReveal.Priority=0;}}
   if(game.phase=="won"&&orbitClock<0&&carrot!=null&&!reducedMotion){orbitClock=0;CarrotQa.Count("camera.cinematic",1);vcamOrbit.Follow=carrot.root.transform;vcamOrbit.Priority=15;}
   if(orbitClock>=0){orbitClock+=viewDt;float yaw=cameraAngle.eulerAngles.y+Mathf.Lerp(0,84,Mathf.Clamp01(orbitClock/3));Vector3 offset=Quaternion.Euler(0,yaw,0)*new Vector3(0,2.6f,-5.5f);orbitBody.m_FollowOffset=offset;vcamOrbit.transform.rotation=Quaternion.LookRotation((carrotPosition+Vector3.up*.9f)-(carrotPosition+offset));if(sun!=null&&dipClock<0)sun.intensity=Mathf.Lerp(sun.intensity,sunBase*1.1f,viewDt*2);}
   if(game.phase=="lost"&&defeatClock<0)defeatClock=0;if(defeatClock>=0&&defeatClock<1.5f){defeatClock+=dt;float t=Mathf.Clamp01(defeatClock/1.4f);sun.intensity=sunBase*(1-.3f*t);sun.color=Color.Lerp(sun.color,new Color(.8f,.85f,.95f),dt*2);RenderSettings.fogEndDistance=fogEndBase*(1-.28f*Mathf.Clamp01(defeatClock/1.2f));}
  }
  void UpdatePushers(){int n=0;if(carrot!=null)pushers[n++]=new Vector4(carrotPosition.x,carrotPosition.z,.55f,.28f);foreach(var e in game.enemies){if(n>=12)break;if(!e.alive||e.air||e.hidden)continue;bool boss=!string.IsNullOrEmpty(e.boss);pushers[n++]=new Vector4(e.position.x,e.position.z,boss?.95f:.4f,.28f);}Shader.SetGlobalVectorArray("_CarrotPushers",pushers);Shader.SetGlobalFloat("_CarrotPusherCount",n);}
  void CreateCamera(){if(GameCamera==null){GameCamera=Camera.main;if(GameCamera==null){var go=new GameObject("Carrot camera");GameCamera=go.AddComponent<Camera>();go.tag="MainCamera";}}GameCamera.orthographic=false;GameCamera.fieldOfView=38;GameCamera.nearClipPlane=.1f;GameCamera.farClipPlane=100;GameCamera.clearFlags=CameraClearFlags.Skybox;GameCamera.backgroundColor=new Color(.075f,.13f,.16f);GameCamera.allowHDR=true;GameCamera.allowMSAA=true;GameCamera.depth=0;if(GameCamera.GetComponent<AudioListener>()==null)GameCamera.gameObject.AddComponent<AudioListener>();var data=GameCamera.GetUniversalAdditionalCameraData();data.renderPostProcessing=true;data.antialiasing=CarrotQuality.Rich?AntialiasingMode.FastApproximateAntialiasing:AntialiasingMode.None;data.renderShadows=true;data.requiresDepthOption=CameraOverrideOption.UsePipelineSettings;data.requiresColorOption=CameraOverrideOption.UsePipelineSettings;data.volumeLayerMask=-1;data.dithering=true;data.stopNaN=false;
   // Cinemachine owns the camera transform from here on: FitCamera writes the rig, the brain writes GameCamera.
   brain=GameCamera.GetComponent<CinemachineBrain>();if(brain==null)brain=GameCamera.gameObject.AddComponent<CinemachineBrain>();brain.m_UpdateMethod=CinemachineBrain.UpdateMethod.ManualUpdate;brain.m_BlendUpdateMethod=CinemachineBrain.BrainUpdateMethod.LateUpdate;brain.m_DefaultBlend=new CinemachineBlendDefinition(CinemachineBlendDefinition.Style.EaseInOut,.8f);brain.m_ShowDebugText=false;
   rig=new GameObject("Camera rig").transform;rig.SetParent(transform,false);
   var vcamGo=new GameObject("vcam play");vcamGo.transform.SetParent(transform,false);vcamPlay=vcamGo.AddComponent<CinemachineVirtualCamera>();vcamPlay.Priority=10;vcamPlay.Follow=rig;vcamPlay.m_Lens.FieldOfView=38;vcamPlay.m_Lens.NearClipPlane=.1f;vcamPlay.m_Lens.FarClipPlane=100;
   body=vcamPlay.AddCinemachineComponent<CinemachineTransposer>();body.m_BindingMode=CinemachineTransposer.BindingMode.WorldSpace;body.m_XDamping=.22f;body.m_YDamping=.22f;body.m_ZDamping=.3f;body.m_FollowOffset=-(cameraAngle*Vector3.forward)*fitDistance;
   var listener=vcamGo.AddComponent<CinemachineImpulseListener>();listener.m_Gain=1;listener.m_UseCameraSpace=true;listener.m_Use2DDistance=false;listener.m_ChannelMask=1;listener.m_ApplyAfter=CinemachineCore.Stage.Noise;
   impulse=gameObject.AddComponent<CinemachineImpulseSource>();var def=impulse.m_ImpulseDefinition;def.m_ImpulseChannel=1;def.m_ImpulseType=CinemachineImpulseDefinition.ImpulseTypes.Dissipating;def.m_ImpulseShape=CinemachineImpulseDefinition.ImpulseShapes.Bump;def.m_ImpulseDuration=.3f;def.m_DissipationDistance=14;def.m_DissipationRate=.35f;def.m_ImpactRadius=.5f;def.m_DissipationMode=CinemachineImpulseManager.ImpulseEvent.DissipationMode.ExponentialDecay;}
  CinemachineVirtualCamera Vcam(string name,float fov,float dx,float dy,float dz,out CinemachineTransposer transposer){var go=new GameObject(name);go.transform.SetParent(transform,false);var cam=go.AddComponent<CinemachineVirtualCamera>();cam.Priority=0;cam.m_Lens.FieldOfView=fov;cam.m_Lens.NearClipPlane=.1f;cam.m_Lens.FarClipPlane=100;transposer=cam.AddCinemachineComponent<CinemachineTransposer>();transposer.m_BindingMode=CinemachineTransposer.BindingMode.WorldSpace;transposer.m_XDamping=dx;transposer.m_YDamping=dy;transposer.m_ZDamping=dz;return cam;}
  static CinemachineBlenderSettings.CustomBlend Blend(string from,string to,float seconds){return new CinemachineBlenderSettings.CustomBlend{m_From=from,m_To=to,m_Blend=new CinemachineBlendDefinition(CinemachineBlendDefinition.Style.EaseInOut,seconds)};}
  void CreateCinematics(){
   vcamBoss=Vcam("vcam boss",30,.12f,.12f,.18f,out bossBody);var bossListener=vcamBoss.gameObject.AddComponent<CinemachineImpulseListener>();bossListener.m_Gain=1.6f;bossListener.m_UseCameraSpace=true;bossListener.m_ChannelMask=1;bossListener.m_ApplyAfter=CinemachineCore.Stage.Noise;
   vcamOrbit=Vcam("vcam orbit",34,.3f,.3f,.3f,out orbitBody);vcamReveal=Vcam("vcam reveal",38,.2f,.2f,.2f,out revealBody);
   var blends=ScriptableObject.CreateInstance<CinemachineBlenderSettings>();blends.m_CustomBlends=new[]{Blend("vcam play","vcam boss",.55f),Blend("vcam boss","vcam play",.65f),Blend("vcam play","vcam orbit",.7f),Blend("vcam reveal","vcam play",1.2f)};brain.m_CustomBlends=blends;
   director=gameObject.AddComponent<PlayableDirector>();director.playOnAwake=false;director.timeUpdateMode=DirectorUpdateMode.Manual;director.extrapolationMode=DirectorWrapMode.None;receiver=gameObject.AddComponent<CarrotCinematics>();receiver.Signal=OnSignal;
   bossEntrance=Resources.Load<TimelineAsset>("Carrot/Cinematics/BossEntrance");if(bossEntrance!=null){director.playableAsset=bossEntrance;foreach(var track in bossEntrance.GetOutputTracks())if(track is CinemachineTrack)director.SetGenericBinding(track,brain);director.SetReferenceValue("vcamBoss",vcamBoss);}else Debug.LogWarning("Carrot BossEntrance timeline missing; entrance plays from code");
   var spotGo=new GameObject("Boss spotlight");spotGo.transform.SetParent(transform,false);bossSpot=spotGo.AddComponent<Light>();bossSpot.type=LightType.Spot;bossSpot.range=12;bossSpot.spotAngle=50;bossSpot.innerSpotAngle=30;bossSpot.intensity=45;bossSpot.shadows=LightShadows.None;bossSpot.enabled=false;
  }
  void OnSignal(string name){signalsFired++;Vector3 at=bossFocus;foreach(var e in game.enemies)if(!string.IsNullOrEmpty(e.boss)&&e.alive){at=e.position;break;}effects.Handle(new CarrotEvent("cinematic",name,at,at,0,0,1,0,0));if(name=="bossRoar")dipClock=0;}
  void SnapCamera(){rig.position=cameraTarget+pan;body.m_FollowOffset=-(cameraAngle*Vector3.forward)*(fitDistance/zoom);Vector3 position=rig.position+body.m_FollowOffset;vcamPlay.transform.rotation=cameraAngle;vcamPlay.ForceCameraPosition(position,cameraAngle);GameCamera.transform.SetPositionAndRotation(position,cameraAngle);}
  // ---- Frame-time watcher (giant update): display-period estimate, 120 Hz pacer, render scale, stepwise tiers with hysteresis ----
  // Windows of 2 s (started 5 s after a level build; any frame over 40 ms voids its window). Per window: the median frame interval,
  // its 95th percentile and the measured main-thread work (Update to end of frame). The display period is the page's rAF sample
  // (window.__carrotDisplayPeriod) refined by the median of clean windows, snapped to 144/120/90/60/30 Hz; a faster period is adopted
  // only after three consecutive windows agree (one fast early sample must never latch, the shipped p10 rule did and then paced a
  // 60 Hz WebKit panel down to 30 fps), and a slower steady one with low work after three windows (ProMotion on battery).
  // The 2-frame pacer (renderFrameInterval 2, a steady 60 instead of 8.3/16.7 judder on a GPU-bound 120 Hz panel) is allowed only
  // on a confirmed 8.33 ms panel and is dropped at once if the panel turns out to be 11 ms or slower. GPU-bound windows lower the render
  // scale 0.1 at a time to the floor (0.6 phones, 0.7 desktops) before a tier step; CPU-bound windows (work over 14 ms) step the tier.
  // Hysteresis: at most one tier change per 120 s and no promotion within 60 s of a demotion; one promotion attempt after 20 s of low
  // work, never above the device rule. Every step is logged with its reason and stored locally (CarrotQuality.Remember).
  readonly float[] tierSamples=new float[600];int tierCount;float windowClock,tierRefresh=float.MaxValue,frameStart,workAccum,sessionClock,lastStepAt=-100,lastRaiseAt=-100,pacerTrialAt=-100,pacerLockUntil=-1,lastTierChangeAt=-1000,lastDemoteAt=-1000,lowerCandidate,slowerCandidate;int workFrames,cleanWindows,slowWindows,cpuWindows,lowerHeld,slowerHeld,panelConfirm;bool voidWindow,promoted;
  static readonly float[] StandardPeriods={1000f/144,1000f/120,1000f/90,1000f/60,1000f/30};
  // rAF timing jitters a few ms either way, so an estimate snaps to the nearest standard period within 12%.
  static float SnapPeriod(float period){float best=period,err=float.MaxValue;foreach(var sp in StandardPeriods){float e=Mathf.Abs(period-sp);if(e<sp*.12f&&e<err){err=e;best=sp;}}return best;}
  System.Collections.IEnumerator WatchFrameWork(){var wait=new WaitForEndOfFrame();while(true){yield return wait;if(frameStart>0){workAccum+=Time.realtimeSinceStartup-frameStart;workFrames++;}}}
  static bool IsStandardPeriod(float p){foreach(var sp in StandardPeriods)if(Mathf.Abs(p-sp)<.05f)return true;return false;}
  bool TierChangeAllowed(bool promotion){if(sessionClock-lastTierChangeAt<120)return false;if(promotion&&sessionClock-lastDemoteAt<60)return false;return true;}
  void WatchFrameTime(){
   frameStart=Time.realtimeSinceStartup;float frame=Time.unscaledDeltaTime;sessionClock+=frame;tierClock+=frame;
   if(frame>.04f){voidWindow=true;return;}
   if(tierClock<5||CarrotQuality.Forced)return;
   if(tierCount<tierSamples.Length)tierSamples[tierCount++]=frame;windowClock+=frame;if(windowClock<2f)return;
   int n=tierCount;System.Array.Sort(tierSamples,0,n);float median=tierSamples[n/2]*1000,p95=tierSamples[Mathf.Min(n-1,(int)(n*.95f))]*1000,mean=windowClock/n*1000,work=workFrames>0?workAccum/workFrames*1000:0;
   bool voided=voidWindow;voidWindow=false;tierCount=0;windowClock=0;workAccum=0;workFrames=0;
   if(voided)return;
   int interval=OnDemandRendering.renderFrameInterval;
   // Display period: the frame cadence divided by the pacer interval, snapped; adopt changes only after three agreeing windows.
   float measured=SnapPeriod(median/interval);bool steady=p95<=median*1.2f;
   if(tierRefresh==float.MaxValue)tierRefresh=measured;
   else if(measured<tierRefresh-.4f){if(Mathf.Abs(measured-lowerCandidate)<.4f)lowerHeld++;else{lowerCandidate=measured;lowerHeld=1;}if(lowerHeld>=3&&measured>=6.9f){Debug.Log("CarrotQuality panel="+measured.ToString("F2")+" ms reason=three faster windows (was "+tierRefresh.ToString("F2")+")");tierRefresh=measured;lowerHeld=0;panelConfirm=0;}}
   else lowerHeld=0;
   if(steady&&measured>tierRefresh+.4f&&work<measured*.5f&&IsStandardPeriod(measured)){if(Mathf.Abs(measured-slowerCandidate)<.4f)slowerHeld++;else{slowerCandidate=measured;slowerHeld=1;}if(slowerHeld>=3){Debug.Log("CarrotQuality panel="+measured.ToString("F2")+" ms reason=steady slower cadence (was "+tierRefresh.ToString("F2")+")");tierRefresh=measured;slowerHeld=0;panelConfirm=0;}}
   else slowerHeld=0;
   float panel=tierRefresh;if(Mathf.Abs(measured-panel)<.4f)panelConfirm++;else panelConfirm=0;
   bool hz120=Mathf.Abs(panel-1000f/120)<.3f&&panelConfirm>=3;float paced=panel*interval;
   string why=" (median "+median.ToString("F1")+" ms, p95 "+p95.ToString("F1")+", mean "+mean.ToString("F1")+", panel "+panel.ToString("F2")+", work "+work.ToString("F1")+" ms, interval "+interval+")";
   if(interval>1&&(panel>=11f||!hz120&&panelConfirm>=3)){SetInterval(1,"panel"+why);return;}
   bool steadyAtPanel=steady&&Mathf.Abs(SnapPeriod(median)-paced)<.4f;
   bool slow=mean>paced*1.25f&&!steadyAtPanel;bool gpuBound=slow&&work<mean*.6f;bool cpuBound=work>14f||(slow&&work>mean*.8f);
   float floor=CarrotQuality.Phone||CarrotQuality.WebKit?.6f:.7f;
   if(cpuBound){cpuWindows++;cleanWindows=0;
    if(hz120&&interval==1&&work<=14f){SetInterval(2,"work"+why);cpuWindows=0;return;}
    if(cpuWindows>=2&&sessionClock-lastStepAt>10&&TierChangeAllowed(false)){if(CarrotQuality.Demote("work"+why)){lastStepAt=sessionClock;lastTierChangeAt=lastDemoteAt=sessionClock;cpuWindows=0;OnTierChanged();}}
    return;}
   if(gpuBound){slowWindows++;cleanWindows=0;
    if(hz120&&interval==1&&(mean>10f||sessionClock<pacerLockUntil)){if(slowWindows>=3){SetInterval(2,"gpu"+why);if(sessionClock-pacerTrialAt<12)pacerLockUntil=sessionClock+60;slowWindows=0;}return;}
    if(CarrotQuality.RenderScale>floor+.001f){if(sessionClock-lastStepAt>3){CarrotQuality.SetRenderScale(CarrotQuality.RenderScale-.1f,"gpu"+why);lastStepAt=sessionClock;slowWindows=0;}return;}
    if(slowWindows>=2&&sessionClock-lastStepAt>10&&TierChangeAllowed(false)){if(CarrotQuality.Demote("gpu"+why)){lastStepAt=sessionClock;lastTierChangeAt=lastDemoteAt=sessionClock;slowWindows=0;OnTierChanged();}}
    return;}
   slowWindows=0;cpuWindows=0;cleanWindows++;
   if(cleanWindows>=3&&sessionClock-lastRaiseAt>6&&mean<=paced*1.1f){cleanWindows=0;lastRaiseAt=sessionClock;
    if(interval>1&&work<4f&&sessionClock>pacerLockUntil&&sessionClock-lastStepAt>10){SetInterval(1,"clean"+why);pacerTrialAt=sessionClock;}
    else if(CarrotQuality.RenderScale<.999f)CarrotQuality.SetRenderScale(CarrotQuality.RenderScale+.05f,"clean"+why);
    else if(!promoted&&sessionClock>20&&work<6f&&CarrotQuality.Tier<CarrotQuality.ChosenTier&&TierChangeAllowed(true)){promoted=true;if(CarrotQuality.Promote("clean"+why)){lastTierChangeAt=sessionClock;OnTierChanged();}}}
  }
  void SetInterval(int interval,string why){if(OnDemandRendering.renderFrameInterval==interval)return;OnDemandRendering.renderFrameInterval=interval;lastStepAt=sessionClock;Debug.Log("CarrotQuality interval="+interval+" reason="+why);}
  void OnTierChanged(){var data=GameCamera.GetUniversalAdditionalCameraData();data.antialiasing=CarrotQuality.Rich?AntialiasingMode.FastApproximateAntialiasing:AntialiasingMode.None;ApplyBiomeLighting();}
  void CreateLighting(){foreach(var l in FindObjectsByType<Light>(FindObjectsSortMode.None))if(l.type==LightType.Directional)l.enabled=false;var go=new GameObject("Key light");go.transform.SetParent(transform);sun=go.AddComponent<Light>();sun.type=LightType.Directional;sun.color=new Color(1,.89f,.72f);sun.intensity=2.6f;sun.shadows=LightShadows.Soft;sun.shadowStrength=.92f;go.transform.rotation=Quaternion.Euler(52,-28,0);var fillGo=new GameObject("Sky fill");fillGo.transform.SetParent(transform);fill=fillGo.AddComponent<Light>();fill.type=LightType.Directional;fill.shadows=LightShadows.None;fill.color=new Color(.56f,.70f,.85f);fill.intensity=.3f;fillGo.transform.rotation=Quaternion.Euler(-28,150,0);RenderSettings.ambientMode=AmbientMode.Trilight;RenderSettings.ambientIntensity=1;RenderSettings.fog=true;RenderSettings.fogMode=FogMode.Linear;RenderSettings.fogStartDistance=30;RenderSettings.fogEndDistance=70;skyMaterial=new Material(Shader.Find("Carrot/Sky"));materials["sky"]=skyMaterial;RenderSettings.skybox=skyMaterial;var environment=Resources.Load<Cubemap>("Carrot/Textures/Environment");if(environment!=null){RenderSettings.defaultReflectionMode=DefaultReflectionMode.Custom;RenderSettings.customReflectionTexture=environment;RenderSettings.reflectionIntensity=.9f;}sunData=sun.GetUniversalAdditionalLightData();sunData.lightCookieSize=new Vector2(18,18);
   if(CarrotQuality.High){const int size=128;cookie=new Texture2D(size,size,TextureFormat.RGBA32,false,true);cookie.wrapMode=TextureWrapMode.Repeat;cookie.name="Canopy cookie";var px=new Color32[size*size];
    // Tileable dappled canopy: four offset octave-noise samples blended by position.
    Func<float,float,float> octaves=(x,y)=>{float v=0,amp=.5f,freq=1;for(int o=0;o<3;o++){v+=Mathf.PerlinNoise(x*freq+3.1f,y*freq+7.7f)*amp;amp*=.5f;freq*=2;}return v/.875f;};
    for(int y=0;y<size;y++)for(int x=0;x<size;x++){float fx=x/(float)size,fy=y/(float)size;float u=fx*4.5f,w=fy*4.5f;float v=Mathf.Lerp(Mathf.Lerp(octaves(u,w),octaves(u-4.5f,w),fx),Mathf.Lerp(octaves(u,w-4.5f),octaves(u-4.5f,w-4.5f),fx),fy);v=Mathf.Clamp01((v-.5f)*1.6f+.5f);byte b=(byte)(Mathf.Lerp(.35f,1,v)*255);px[y*size+x]=new Color32(b,b,b,255);}
    cookie.SetPixels32(px);cookie.Apply();}
   var volumeGo=new GameObject("Grade");volumeGo.transform.SetParent(transform);grade=volumeGo.AddComponent<Volume>();grade.isGlobal=true;grade.priority=1;grade.weight=1;}
  void ApplyBiomeLighting(){if(game==null||game.level==null||sun==null)return;string biome=game.level.biome;bool high=CarrotQuality.High,rich=CarrotQuality.Rich;
   // Only Carrot/Water samples the opaque texture, so the full-resolution colour copy is requested for marsh levels alone (never on Low, which has no depth either).
   {var asset=UnityEngine.Rendering.GraphicsSettings.currentRenderPipeline as UniversalRenderPipelineAsset;if(asset!=null)asset.supportsCameraOpaqueTexture=rich&&biome=="marsh";}
   // Values are HDR; ACES in the post volume maps them to the canvas.
   Color zenith,horizon,ground;
   if(biome=="marsh"){sun.transform.rotation=Quaternion.Euler(58,35,0);sun.color=new Color(.76f,.83f,.96f);sun.intensity=1.15f;sun.shadowStrength=.85f;fill.transform.rotation=Quaternion.Euler(-20,-120,0);fill.color=new Color(.18f,.32f,.30f);fill.intensity=.25f;zenith=new Color(.02f,.07f,.14f);horizon=new Color(.09f,.20f,.29f);ground=new Color(.03f,.05f,.04f);RenderSettings.fogColor=new Color(.05f,.12f,.17f);RenderSettings.fogStartDistance=22;RenderSettings.fogEndDistance=58;}
   else if(biome=="frost"){sun.transform.rotation=Quaternion.Euler(36,-50,0);sun.color=new Color(.86f,.92f,1);sun.intensity=1.7f;sun.shadowStrength=.8f;fill.transform.rotation=Quaternion.Euler(-25,130,0);fill.color=new Color(.55f,.68f,.92f);fill.intensity=.45f;zenith=new Color(.36f,.50f,.69f);horizon=new Color(.83f,.88f,.94f);ground=new Color(.70f,.74f,.80f);RenderSettings.fogColor=new Color(.75f,.83f,.92f);RenderSettings.fogStartDistance=30;RenderSettings.fogEndDistance=76;}
   else if(biome=="orchard"){sun.transform.rotation=Quaternion.Euler(24,-62,0);sun.color=new Color(1,.74f,.45f);sun.intensity=2.1f;sun.shadowStrength=.9f;fill.transform.rotation=Quaternion.Euler(-30,140,0);fill.color=new Color(.45f,.40f,.62f);fill.intensity=.3f;zenith=new Color(.36f,.40f,.62f);horizon=new Color(.98f,.72f,.44f);ground=new Color(.26f,.17f,.10f);RenderSettings.fogColor=new Color(.84f,.62f,.42f);RenderSettings.fogStartDistance=26;RenderSettings.fogEndDistance=64;}
   // Arena: a dusk amphitheatre (low warm key, violet fill) with one override per guardian: slate storm light for the Giant Tornado, a green-lit night for the Zombie, a violet dusk with a magenta aurora for the Unknown Eyeball.
   else if(biome=="arena"){string boss=game.level.boss;
    if(boss=="tornado"){sun.transform.rotation=Quaternion.Euler(44,-35,0);sun.color=new Color(.86f,.9f,1);sun.intensity=1.5f;sun.shadowStrength=.8f;fill.transform.rotation=Quaternion.Euler(-24,140,0);fill.color=new Color(.5f,.56f,.7f);fill.intensity=.4f;zenith=new Color(.26f,.3f,.42f);horizon=new Color(.68f,.7f,.76f);ground=new Color(.2f,.19f,.17f);RenderSettings.fogColor=new Color(.6f,.63f,.7f);RenderSettings.fogStartDistance=24;RenderSettings.fogEndDistance=62;}
    else if(boss=="zombie"){sun.transform.rotation=Quaternion.Euler(50,30,0);sun.color=new Color(.55f,.75f,.65f);sun.intensity=.9f;sun.shadowStrength=.85f;fill.transform.rotation=Quaternion.Euler(-20,-120,0);fill.color=new Color(.2f,.4f,.25f);fill.intensity=.3f;zenith=new Color(.015f,.04f,.05f);horizon=new Color(.08f,.2f,.16f);ground=new Color(.03f,.05f,.03f);RenderSettings.fogColor=new Color(.05f,.12f,.1f);RenderSettings.fogStartDistance=20;RenderSettings.fogEndDistance=56;}
    else {sun.transform.rotation=Quaternion.Euler(26,-58,0);sun.color=new Color(1,.68f,.62f);sun.intensity=1.7f;sun.shadowStrength=.88f;fill.transform.rotation=Quaternion.Euler(-30,140,0);fill.color=new Color(.5f,.3f,.7f);fill.intensity=.38f;zenith=new Color(.22f,.08f,.38f);horizon=new Color(.8f,.38f,.6f);ground=new Color(.2f,.12f,.16f);RenderSettings.fogColor=new Color(.5f,.3f,.5f);RenderSettings.fogStartDistance=24;RenderSettings.fogEndDistance=60;}}
   else{sun.transform.rotation=Quaternion.Euler(52,-28,0);sun.color=new Color(1,.89f,.72f);sun.intensity=2.6f;sun.shadowStrength=.92f;fill.transform.rotation=Quaternion.Euler(-28,150,0);fill.color=new Color(.56f,.70f,.85f);fill.intensity=.3f;zenith=new Color(.40f,.62f,.86f);horizon=new Color(.72f,.82f,.90f);ground=new Color(.20f,.26f,.14f);RenderSettings.fogColor=new Color(.70f,.80f,.86f);RenderSettings.fogStartDistance=34;RenderSettings.fogEndDistance=82;}
   skyZenith=zenith;skyHorizon=horizon;RenderSettings.ambientSkyColor=zenith*1.0f;RenderSettings.ambientEquatorColor=horizon*.9f;RenderSettings.ambientGroundColor=ground*.8f;RenderSettings.reflectionIntensity=biome=="frost"?.55f:biome=="marsh"?.6f:biome=="orchard"?.7f:biome=="arena"?.65f:.75f;
   Shader.SetGlobalFloat("_SnowAmount",biome=="frost"?1:0);Shader.SetGlobalVector("_SnowOffset",Vector4.zero);
   var wet=new Vector4[2];if(biome=="marsh"){var ponds=PondCenters();for(int i=0;i<2;i++)wet[i]=new Vector4(ponds[i].x,ponds[i].z,2.4f,1);}Shader.SetGlobalVectorArray("_WetCenters",wet);
   skyMaterial.SetColor("_Zenith",zenith);skyMaterial.SetColor("_Horizon",horizon);skyMaterial.SetColor("_Ground",ground);skyMaterial.SetVector("_CarrotSunDir",-sun.transform.forward);
   skyMaterial.SetColor("_SunColor",biome=="marsh"?new Color(.8f,.86f,1)*1.4f:biome=="frost"?new Color(1,.97f,.9f)*.9f:biome=="orchard"?new Color(1,.78f,.5f)*1.5f:new Color(1,.9f,.7f)*1.3f);skyMaterial.SetFloat("_SunSize",biome=="marsh"?.02f:biome=="orchard"?.045f:.035f);skyMaterial.SetFloat("_SunGlow",biome=="marsh"?.2f:biome=="frost"?.5f:biome=="orchard"?.55f:.35f);
   skyMaterial.SetFloat("_CloudAmount",biome=="frost"?.9f:biome=="marsh"?.3f:biome=="orchard"?.45f:.55f);skyMaterial.SetColor("_CloudColor",biome=="marsh"?new Color(.12f,.2f,.3f):biome=="frost"?new Color(.9f,.93f,.97f):biome=="orchard"?new Color(1,.8f,.62f):new Color(1,.98f,.95f));
   skyMaterial.SetFloat("_Stars",biome=="marsh"?1:biome=="orchard"?.35f:0);skyMaterial.SetFloat("_Aurora",biome=="frost"?.8f:0);skyMaterial.SetColor("_AuroraColor",new Color(.37f,.91f,.63f));
   if(biome=="arena"){string boss=game.level.boss;bool tornado=boss=="tornado",zombie=boss=="zombie";
    skyMaterial.SetColor("_SunColor",tornado?new Color(.9f,.93f,1)*1.1f:zombie?new Color(.7f,.9f,.8f)*.8f:new Color(1,.6f,.6f)*1.5f);skyMaterial.SetFloat("_SunSize",tornado?.03f:zombie?.02f:.05f);skyMaterial.SetFloat("_SunGlow",tornado?.3f:zombie?.15f:.6f);
    skyMaterial.SetFloat("_CloudAmount",tornado?.95f:zombie?.35f:.5f);skyMaterial.SetColor("_CloudColor",tornado?new Color(.5f,.52f,.58f):zombie?new Color(.08f,.16f,.14f):new Color(.9f,.45f,.65f));
    skyMaterial.SetFloat("_Stars",tornado?0:zombie?1:.6f);skyMaterial.SetFloat("_Aurora",tornado?0:zombie?.35f:1);skyMaterial.SetColor("_AuroraColor",zombie?new Color(.35f,.9f,.5f):new Color(.95f,.3f,.75f));}
   ApplyPortalLighting();sunBase=sun.intensity;fogEndBase=RenderSettings.fogEndDistance;if(bossSpot!=null)bossSpot.intensity=biome=="frost"?36:biome=="orchard"?42:biome=="arena"?(game.level.boss=="tornado"?22:game.level.boss=="eyeball"?24:34):45;
   if(sun!=null)sun.cookie=biome!="frost"&&biome!="arena"&&high?cookie:null;
   Vector4 heightFog=biome=="marsh"?new Vector4(.045f,-.3f,2.2f,.1f):biome=="frost"?new Vector4(.026f,-.5f,1.6f,0):biome=="orchard"?new Vector4(.03f,-.5f,1.8f,.05f):biome=="arena"?new Vector4(.034f,-.5f,1.7f,.04f):new Vector4(.015f,-.7f,1.4f,0);if(!rich)heightFog.x=0;Shader.SetGlobalVector("_CarrotHeightFog",heightFog);Shader.SetGlobalColor("_CarrotHeightFogColor",Color.Lerp(RenderSettings.fogColor,horizon,.55f));
   foreach(var lantern in lanterns)if(lantern!=null)lantern.enabled=biome=="marsh"||biome=="orchard"||biome=="arena";
   var profile=Resources.Load<VolumeProfile>("Carrot/Volumes/"+biome);if(profile==null)profile=Resources.Load<VolumeProfile>("Carrot/Volumes/garden");if(profile!=null&&grade!=null){AssignGrade(profile);var live=grade.profile;if(live.TryGet<DepthOfField>(out var dof))dof.active=high;if(live.TryGet<Bloom>(out var bloom)){bloom.highQualityFiltering.value=high;bloom.scatter.value=rich?.6f:.5f;bloom.filter.value=high?BloomFilterMode.Gaussian:BloomFilterMode.Dual;bloom.filter.overrideState=true;bloom.downscale.value=high?BloomDownscaleMode.Half:BloomDownscaleMode.Quarter;bloom.downscale.overrideState=true;bloom.maxIterations.value=high?6:rich?5:4;bloom.maxIterations.overrideState=true;}if(live.TryGet<ShadowsMidtonesHighlights>(out var smh))smh.active=rich;if(live.TryGet<ChromaticAberration>(out var ca))ca.active=rich;}
   ApplyPrismLighting();ApplyGroundedLighting(biome,ground);
  }
  Material Material(string id,Color tint,int texture=-1,float gloss=.25f,float metallic=0,float gain=1){if(materials.TryGetValue(id,out var m))return m;m=new Material(Shader.Find("Carrot/Storybook"));m.name=id;m.color=tint;m.SetFloat("_Glossiness",gloss);m.SetFloat("_Metallic",metallic);m.SetFloat("_AlbedoGain",gain);m.SetFloat("_SnowStrength",texture==1||texture==0?1:.35f);if(texture>=0&&atlas!=null){m.SetTexture("_MainTex",atlas);m.SetTextureScale("_MainTex",new Vector2(1f/3,.5f));m.SetTextureOffset("_MainTex",new Vector2((texture%3)/3f,texture<3?.5f:0));m.SetFloat("_WorldTexture",1);m.SetFloat("_TextureScale",.6f);}if(texture>=0)ApplyPhysicalMaps(m,texture==0?"Soil":texture==1?"Stone":texture==2?"Bark":texture==5?"Metal":null);materials[id]=m;return m;}
  void ApplyPhysicalMaps(Material material,string family){
   if(string.IsNullOrEmpty(family))return;string path="Carrot/Textures/PBR/"+family;
   var albedo=Resources.Load<Texture2D>(path+"Albedo");if(albedo!=null){material.SetTexture("_MainTex",albedo);material.SetTextureScale("_MainTex",Vector2.one);material.SetTextureOffset("_MainTex",Vector2.zero);material.SetFloat("_TextureScale",family=="Soil"?.85f:1.3f);}
   var normal=Resources.Load<Texture2D>(path+"Normal");if(normal!=null){material.SetTexture("_BumpMap",normal);material.SetFloat("_BumpScale",family=="Soil"?1.05f:.8f);}
   var roughness=Resources.Load<Texture2D>(path+"Roughness");if(roughness!=null){material.SetTexture("_RoughnessMap",roughness);material.SetFloat("_UseRoughnessMap",1);}
   var ao=Resources.Load<Texture2D>(path+"AO");if(ao!=null){material.SetTexture("_OcclusionMap",ao);material.SetFloat("_UseOcclusionMap",1);material.SetFloat("_OcclusionStrength",.68f);}
  }
  void BuildLevel(){var sw=System.Diagnostics.Stopwatch.StartNew();long tTerrain=0,tRoads=0,tPads=0,tDecoration=0,tGrass=0,tCombine=0;tierClock=0;voidWindow=true;levelId=game.level.id;if(world!=null)Destroy(world.gameObject);foreach(var m in createdMeshes)Destroy(m);createdMeshes.Clear();world=new GameObject("Storybook diorama "+levelId).transform;world.SetParent(transform,false);decoration=new GameObject("Garden details").transform;decoration.SetParent(world,false);towers.Clear();enemies.Clear();blockers.Clear();pads.Clear();eyeScales.Clear();restRotations.Clear();restPositions.Clear();restScales.Clear();effects.Clear();if(worldBars!=null)worldBars.Clear();lanterns.Clear();yanks.Clear();marks.Clear();CancelMerge(false);flightClock=-1;if(flightGhost!=null){flightGhost.SetActive(false);flightGhost=null;}blindLevel=0;blindDim=0;ResetExpansionScene();prismDashUntil.Clear();prismPressureUntil.Clear();clock=0;carrotHit=0;zoom=targetZoom=1;pan=targetPan=Vector3.zero;pointerDown=dragging=false;pinchDistance=0;string biome=game.level.biome;
   decorLog.Clear();MeasureRouteBounds();followBoss=-1;panNudged=false;trauma=0;safeAreaSelection=-2;ApplyBiomeLighting();effects.Through=biome=="arena"||PrismStage;effects.EntranceBoss="";
   if(game.level.boss=="portal")BuildPortalTerrain();else BuildTerrain();tTerrain=sw.ElapsedMilliseconds;BuildRoads();tRoads=sw.ElapsedMilliseconds;for(int i=0;i<game.level.pads.Length;i++)BuildPad(i,game.level.pads[i]);tPads=sw.ElapsedMilliseconds;if(game.level.boss!="portal")BuildDecoration();if(biome=="arena")BuildArenaRing();tDecoration=sw.ElapsedMilliseconds;if(game.level.boss!="portal")BuildGrass();tGrass=sw.ElapsedMilliseconds;CombineDecoration();BuildRoutePulses();tCombine=sw.ElapsedMilliseconds;Vector3[] route=game.level.routes[0];carrotPosition=route[route.Length-1];effects.CarrotPosition=carrotPosition;carrot=Spawn("Carrot/Models/Carrot",world,"carrot",0);carrot.root.transform.position=carrotPosition+Vector3.up*.02f;carrot.root.transform.rotation=Quaternion.identity;carrot.root.transform.localScale=Vector3.one*1.35f;BuildCarrotNest();effects.Biome=biome;effects.EntranceBossHint=game.level.boss??"";effects.Ambient(game.level.boss=="portal"?"portal":biome);if(PrismStage){PrismBounds(out var ambientMin,out var ambientMax);effects.PrismAmbient((ambientMin+ambientMax)*.5f,ambientMax-ambientMin);}FitCamera();SnapCamera();if(director!=null&&director.state==PlayState.Playing)director.Stop();beatClock=-1;pendingBoss=-1;dipClock=-1;orbitClock=-1;defeatClock=-1;vcamOrbit.Priority=0;vcamBoss.Priority=0;bossSpot.enabled=false;revealClock=reducedMotion?-1:0;vcamReveal.Priority=reducedMotion?0:15;if(!reducedMotion)CarrotQa.Count("camera.reveal",1);Quaternion revealAngle=cameraAngle*Quaternion.Euler(5,0,0);vcamReveal.transform.rotation=revealAngle;revealBody.m_FollowOffset=-(revealAngle*Vector3.forward)*(fitDistance*1.14f);vcamReveal.Follow=rig;vcamReveal.ForceCameraPosition(rig.position+revealBody.m_FollowOffset,revealAngle);GameCamera.transform.SetPositionAndRotation(rig.position+revealBody.m_FollowOffset,revealAngle);sound.SetBiome(biome);SetFace(false,false);Debug.Log("CARROT_BUILD_MS level="+levelId+" terrain="+tTerrain+" roads="+(tRoads-tTerrain)+" pads="+(tPads-tRoads)+" decoration="+(tDecoration-tPads)+" grass="+(tGrass-tDecoration)+" combine="+(tCombine-tGrass)+" rest="+(sw.ElapsedMilliseconds-tCombine)+" total="+sw.ElapsedMilliseconds+" tier="+CarrotQuality.Name(CarrotQuality.Tier));}
  /// <summary>Height of what creatures actually walk on: the trail strip (0.061 u + route offset) where there is a path, the terrain elsewhere. Ground effects anchored here are never buried under the path mesh.</summary>
  float SurfaceHeight(Vector3 p){float h=TerrainHeight(p);return PathDistance(p)<.5f?Mathf.Max(h,.068f):h;}
  float ActorScale{get{return portraitCamera?1.2f:1f;}}
  float PathDistance(Vector3 p){float min=100;foreach(var route in game.level.routes)for(int i=1;i<route.Length;i++)min=Mathf.Min(min,SegmentDistance(p,route[i-1],route[i]));return min;}
  static float SegmentDistance(Vector3 p,Vector3 a,Vector3 b){p.y=a.y=b.y=0;Vector3 d=b-a;float t=Mathf.Clamp01(Vector3.Dot(p-a,d)/Mathf.Max(.001f,d.sqrMagnitude));return Vector3.Distance(p,a+d*t);}
  bool IsFree(Vector3 p,float margin=.9f){if(PathDistance(p)<margin)return false;foreach(var q in game.level.pads)if(Vector3.Distance(p,q)<margin)return false;return true;}
  Vector3[] PondCenters(){float shift=((game.level.id-5)%4)*.38f;return new[]{new Vector3(-3.5f+shift,-.10f,1.4f-shift*.6f),new Vector3(3.4f-shift*.55f,-.10f,-1.9f+shift)};}
  bool Pond(Vector3 p){if(game.level.biome!="marsh")return false;foreach(var center in PondCenters())if(Vector2.Distance(new Vector2(p.x,p.z),new Vector2(center.x,center.z))<1.65f)return true;return false;}
  float TerrainHeight(Vector3 p){
   if(game.level.boss=="portal"||PrismStage)return -.025f;
   float n=Mathf.PerlinNoise(p.x*.55f+20,p.z*.55f+20),path=PathDistance(p);
   float y=-.025f+Mathf.SmoothStep(0,1,Mathf.Clamp01((path-.55f)/.9f))*n*.16f;
   float edge=Mathf.Clamp01(Mathf.Max((Mathf.Abs(p.x)-7.8f)/3.5f,(Mathf.Abs(p.z)-5.8f)/3.2f));
   float hills=Mathf.PerlinNoise(p.x*.16f+8,p.z*.16f+14);
   y+=Mathf.SmoothStep(0,1,edge)*(.25f+hills*(game.level.biome=="frost"?1.9f:game.level.biome=="marsh"?.55f:1.25f));
   return Pond(p)?-.18f:y;
  }
  void BuildTerrain(){if(PrismStage){BuildPrismTerrain();return;}
   const int sx=128,sz=104;var vertices=new Vector3[(sx+1)*(sz+1)];var colors=new Color[vertices.Length];var uv=new Vector2[vertices.Length];var tris=new int[sx*sz*6];string biome=game.level.biome;
   Color soil=biome=="frost"?CapAlbedo(new Color(.83f,.90f,.97f),.72f):biome=="marsh"?new Color(.22f,.36f,.23f):biome=="orchard"?new Color(.38f,.27f,.13f):biome=="arena"?new Color(.32f,.30f,.26f):new Color(.27f,.42f,.11f);int index=0;
   for(int z=0;z<=sz;z++)for(int x=0;x<=sx;x++){
    int k=z*(sx+1)+x;float px=Mathf.Lerp(-24,24,x/(float)sx),pz=Mathf.Lerp(-20,20,z/(float)sz);Vector3 p=new Vector3(px,0,pz);
    float n=Mathf.PerlinNoise(px*.55f+20,pz*.55f+20),broad=Mathf.PerlinNoise(px*.19f+41,pz*.19f+83);vertices[k]=new Vector3(px,TerrainHeight(p),pz);uv[k]=new Vector2(x/(float)sx,z/(float)sz);
    colors[k]=Color.Lerp(soil*(biome=="frost"?.88f:.70f),soil*(biome=="frost"?1.04f:1.12f),n*.6f+broad*.4f);colors[k].a=1;
    if(x<sx&&z<sz){tris[index++]=k;tris[index++]=k+sx+1;tris[index++]=k+1;tris[index++]=k+1;tris[index++]=k+sx+1;tris[index++]=k+sx+2;}
   }
   var mesh=new Mesh{name="Continuous rolling landscape"};mesh.vertices=vertices;mesh.uv=uv;mesh.colors=colors;mesh.triangles=tris;mesh.RecalculateNormals();
   var mat=Material("ground-"+biome,Color.white,biome=="frost"?1:biome=="arena"?1:0);bool orchard=biome=="orchard"||biome=="arena";mat.SetFloat("_AlbedoSaturation",biome=="frost"?0:biome=="arena"?.12f:orchard?.18f:.10f);mat.SetFloat("_AlbedoGain",biome=="frost"?1.0f:biome=="arena"?.95f:orchard?1.0f:biome=="marsh"?1.55f:1.6f);mat.SetFloat("_OcclusionStrength",biome=="frost"?.45f:.55f);mat.SetFloat("_SnowStrength",.6f);mat.SetFloat("_BumpScale",biome=="frost"?.32f:orchard?.7f:.85f);mat.SetFloat("_TextureScale",biome=="frost"?2.3f:orchard?.9f:.85f);mat.SetFloat("_ReflectionStrength",.25f);
   if(biome=="frost")ConfigureSnow(mat,false);
   var go=MeshObject("Terrain",mesh,mat,world);go.GetComponent<MeshRenderer>().shadowCastingMode=ShadowCastingMode.Off;go.AddComponent<MeshCollider>().sharedMesh=mesh;
   if(biome=="marsh"){
    var waterMaterial=WaterMaterial();
    if(materials.TryGetValue("water-runtime",out var oldWater))Destroy(oldWater);materials["water-runtime"]=waterMaterial;
    foreach(var p in PondCenters()){var pool=MeshObject("Sheltered pond",PondMesh(p,1.6f),waterMaterial,world);pool.transform.localPosition=p;}
   }
  }
  void ConfigureSnow(Material mat,bool packed){
   // Snow reflects light from a pale base; dark rock albedo must never tint its grains.
   mat.SetTexture("_MainTex",Texture2D.whiteTexture);mat.SetTextureScale("_MainTex",Vector2.one);mat.SetTextureOffset("_MainTex",Vector2.zero);mat.SetFloat("_AlbedoGain",packed?.9f:1);mat.SetFloat("_AlbedoSaturation",1);
   mat.SetFloat("_WorldTexture",1);mat.SetFloat("_TextureScale",packed?1.7f:1.2f);mat.SetFloat("_Glossiness",packed?.34f:.16f);mat.SetFloat("_UseRoughnessMap",0);mat.SetFloat("_UseOcclusionMap",0);mat.SetFloat("_ReflectionStrength",packed?.25f:.12f);
   var grain=Resources.Load<Texture2D>("Carrot/Textures/PBR/SoilNormal");mat.SetTexture("_BumpMap",grain);mat.SetFloat("_BumpScale",packed?.14f:.095f);
  }
  void BuildRoads(){if(PrismStage){BuildPrismRoads();return;}var mat=Material("path-"+game.level.biome+(game.level.boss=="portal"?"-portal":""),game.level.biome=="frost"?new Color(.58f,.70f,.86f):game.level.biome=="marsh"?new Color(.90f,.84f,.65f):game.level.biome=="orchard"?new Color(1,.80f,.55f):game.level.biome=="arena"?new Color(.95f,.86f,.70f):new Color(1,.86f,.60f),game.level.biome=="frost"?1:game.level.biome=="arena"?1:0,.15f);mat.SetFloat("_AlbedoSaturation",game.level.biome=="frost"?0:game.level.biome=="arena"?.3f:.5f);mat.SetFloat("_AlbedoGain",game.level.biome=="frost"?1.0f:game.level.biome=="orchard"?3.2f:game.level.biome=="arena"?(game.level.boss=="tornado"?3.2f:3.6f):2.4f);mat.SetFloat("_SnowStrength",.15f);if(game.level.biome=="frost"){ConfigureSnow(mat,true);mat.color=Color.white;mat.SetFloat("_Glossiness",.48f);mat.SetFloat("_ReflectionStrength",.4f);mat.SetFloat("_BumpScale",.3f);mat.SetFloat("_Translucency",.25f);mat.SetFloat("_SnowStrength",0);}else if(game.level.biome=="marsh"){mat.SetFloat("_AlbedoGain",2.5f);mat.SetFloat("_OcclusionStrength",.3f);mat.SetFloat("_ReflectionStrength",.3f);}if(game.level.boss=="portal"){mat.color=new Color(.69f,.78f,.87f);mat.SetFloat("_AlbedoSaturation",.1f);mat.SetFloat("_Glossiness",.35f);mat.SetFloat("_AlbedoGain",2.3f);}var edge=Material("path-stone",new Color(1,.96f,.86f),1,.3f,0,1.9f);var visited=new HashSet<string>();int routeIndex=0;
   foreach(var route in game.level.routes){for(int i=1;i<route.Length;i++){Vector3 a=route[i-1],b=route[i];Vector3 delta=b-a;int count=Mathf.Max(1,Mathf.CeilToInt(delta.magnitude/.35f));for(int s=0;s<=count;s++){Vector3 p=Vector3.Lerp(a,b,s/(float)count);string key=Mathf.RoundToInt(p.x*6)+":"+Mathf.RoundToInt(p.z*6);if(!visited.Add(key))continue;Vector3 side=Vector3.Cross(delta.normalized,Vector3.up);if(Pond(p)&&s%2==0){var board=Primitive("Bridge board",PrimitiveType.Cube,p+Vector3.up*.09f,new Vector3(.9f,.10f,.19f),Material("bridgewood",new Color(.67f,.48f,.26f),2),decoration);board.transform.rotation=Quaternion.LookRotation(delta);}}}
    BuildTrailMesh(route,mat,routeIndex);BuildPebbles(route,edge,routeIndex);if(game.level.biome=="orchard"&&CarrotQuality.Rich)BuildLeafLitter(route,routeIndex);BuildPathEdges(route,routeIndex);BuildEntrance(route,routeIndex++);}
  }
  /// <summary>Orchard trails are strewn with flattened fallen leaves (ochre, rust and plum) within 0.9 u of the trail edge; batched with the decoration, shadows off, High tier only.</summary>
  void BuildLeafLitter(Vector3[] route,int routeIndex){var spline=RouteSpline(route);var rng=new System.Random(311+routeIndex*29+levelId*3);Material[] litter={Material("litter-ochre",new Color(.86f,.56f,.18f),-1,.2f),Material("litter-rust",new Color(.72f,.30f,.12f),-1,.2f),Material("litter-plum",new Color(.45f,.22f,.35f),-1,.2f)};int perRoute=Mathf.CeilToInt(60f/Mathf.Max(1,game.level.routes.Length));
   for(int i=0;i<perRoute;i++){float t=(float)rng.NextDouble();float3 q=spline.EvaluatePosition(t);float3 tangent=spline.EvaluateTangent(t);Vector3 side=Vector3.Cross(new Vector3(tangent.x,0,tangent.z).normalized,Vector3.up);float k=rng.NextDouble()<.5?-1:1;Vector3 p=new Vector3(q.x,0,q.z)+side*k*(.5f+(float)rng.NextDouble()*.8f);if(Pond(p))continue;foreach(var pad in game.level.pads)if(Vector3.Distance(p,pad)<.55f){p=Vector3.zero;break;}if(p==Vector3.zero)continue;
    var leaf=Primitive("Fallen leaf",PrimitiveType.Sphere,p+Vector3.up*(TerrainHeight(p)+.018f),new Vector3(.12f,.012f,.08f),litter[i%3],decoration,true);leaf.transform.localRotation=Quaternion.Euler(0,(float)rng.NextDouble()*360,0);leaf.GetComponent<Renderer>().shadowCastingMode=ShadowCastingMode.Off;}}
  static Spline RouteSpline(Vector3[] route){
   // Knots sit 0.45 u before and after every corner (not on it), so the auto-smoothed spline follows the straight legs and only fillets the corner.
   var knots=new List<float3>();for(int i=0;i<route.Length;i++){Vector3 p=route[i];if(i==0||i==route.Length-1){knots.Add(new float3(p.x,0,p.z));continue;}Vector3 a=route[i-1],b=route[i+1];float la=Vector3.Distance(a,p),lb=Vector3.Distance(p,b);float r=Mathf.Min(.45f,la*.45f,lb*.45f);Vector3 before=p+(a-p).normalized*r,after=p+(b-p).normalized*r;knots.Add(new float3(before.x,0,before.z));knots.Add(new float3(after.x,0,after.z));}
   var spline=new Spline(knots,TangentMode.AutoSmooth,false);return spline;}
  void BuildTrailMesh(Vector3[] route,Material material,int routeIndex){
   // The worn trail follows an auto-smoothed spline through the route so corners are rounded and the V coordinate runs continuously.
   var spline=RouteSpline(route);float splineLength=spline.GetLength();int total=Mathf.Max(4,Mathf.CeilToInt(splineLength/.2f));var points=new List<Vector3>();for(int i=0;i<=total;i++){float3 q=spline.EvaluatePosition(i/(float)total);points.Add(new Vector3(q.x,0,q.z));}
   var vertices=new Vector3[points.Count*3];var colors=new Color[vertices.Length];var uv=new Vector2[vertices.Length];var triangles=new int[(points.Count-1)*12];float length=0;bool frost=game.level.biome=="frost";
   for(int i=0;i<points.Count;i++){Vector3 incoming=(points[i]-points[Mathf.Max(0,i-1)]).normalized,outgoing=(points[Mathf.Min(points.Count-1,i+1)]-points[i]).normalized;Vector3 direction=(incoming+outgoing).normalized;if(direction.sqrMagnitude<.1f)direction=i==0?outgoing:incoming;Vector3 side=Vector3.Cross(direction,Vector3.up).normalized;float joint=Mathf.Min(1.35f,1/Mathf.Max(.7f,Vector3.Dot(direction,i==0?outgoing:incoming)));float width=.405f*joint;float wear=Mathf.PerlinNoise(points[i].x*2+43,points[i].z*2+82)*.03f;if(i>0)length+=Vector3.Distance(points[i],points[i-1]);
    float noise=Mathf.PerlinNoise(points[i].x+5,points[i].z+9);
    for(int k=0;k<3;k++){int n=i*3+k;bool edge=k!=1;vertices[n]=points[i]+side*(k-1)*(width+wear)+Vector3.up*(.061f+routeIndex*.0006f);uv[n]=new Vector2(k*.5f,length);
     // Frost: a packed-ice centre with snow pushed to the rim; elsewhere a worn centre with slightly darker, drier edges.
     colors[n]=frost?(edge?new Color(.86f,.91f,1):Color.Lerp(new Color(.12f,.26f,.55f),new Color(.2f,.35f,.63f),noise)):Color.Lerp(new Color(.82f,.78f,.66f),Color.white,noise)*(edge?.86f:1);colors[n].a=1;}
    if(i<points.Count-1){int n=i*12,v=i*3;triangles[n]=v;triangles[n+1]=v+1;triangles[n+2]=v+3;triangles[n+3]=v+1;triangles[n+4]=v+4;triangles[n+5]=v+3;triangles[n+6]=v+1;triangles[n+7]=v+2;triangles[n+8]=v+4;triangles[n+9]=v+2;triangles[n+10]=v+5;triangles[n+11]=v+4;}
   }
   var mesh=new Mesh{name="Continuous worn-earth trail"};mesh.vertices=vertices;mesh.uv=uv;mesh.colors=colors;mesh.triangles=triangles;mesh.RecalculateNormals();MeshObject("Continuous trail",mesh,material,decoration);
  }
  void BuildPebbles(Vector3[] route,Material edge,int routeIndex){var spline=RouteSpline(route);float length=spline.GetLength();var rng=new System.Random(77+routeIndex*13+levelId*5);float t=0;int n=0;
   while(true){float3 q=SplineUtility.GetPointAtLinearDistance(spline,t,1.05f,out float next);if(next>=1f||next<=t)break;t=next;float3 tangent=spline.EvaluateTangent(t);Vector3 side=Vector3.Cross(new Vector3(tangent.x,0,tangent.z).normalized,Vector3.up);n++;for(int k=-1;k<=1;k+=2){if(rng.NextDouble()<.2)continue;Vector3 ep=new Vector3(q.x,0,q.z)+side*(.5f*k+(float)rng.NextDouble()*.08f*k);if(PathDistance(ep)<.36f||Pond(ep))continue;float s=.14f+(float)rng.NextDouble()*.08f;var stone=Primitive("Trail pebble",PrimitiveType.Sphere,ep+Vector3.up*(TerrainHeight(ep)+.05f),new Vector3(s,s*.6f,s*.8f),edge,decoration,true);stone.transform.localRotation=Quaternion.Euler(14,(float)rng.NextDouble()*360,8);}}}
  void BuildPad(int id,Vector3 p){if(PrismStage){BuildPrismPad(id,p);return;}var root=new GameObject("Tower garden "+id);root.transform.SetParent(world,false);p.y=TerrainHeight(p);root.transform.localPosition=p;var click=root.AddComponent<CarrotClickable>();click.type="pad";click.id=id;var collider=root.AddComponent<SphereCollider>();collider.center=new Vector3(0,.12f,0);collider.radius=.47f;var baseMat=Material("padsoil-"+game.level.biome,game.level.biome=="frost"?new Color(.57f,.70f,.82f):new Color(.82f,.72f,.5f),0,.25f,0,game.level.biome=="frost"?1:2.3f);if(game.level.biome=="frost"){ConfigureSnow(baseMat,true);baseMat.SetFloat("_SnowStrength",.3f);}
   // Static pad dressing lives in the batched decoration so a level costs one draw per material, not nine per pad.
   var disk=MeshObject("Planting circle",Disc(.44f,24),baseMat,decoration);disk.transform.localPosition=p+Vector3.up*.045f;var stoneMat=Material("padstones-"+game.level.biome,game.level.biome=="frost"?new Color(.85f,.9f,.95f):new Color(1,.97f,.86f),1,.22f,0,2.6f);var rng=new System.Random(id*131+levelId*7);
   for(int i=0;i<7;i++){float a=i*Mathf.PI*2/7+(float)rng.NextDouble()*.3f;float r=.38f+(float)rng.NextDouble()*.06f;var st=Primitive("Border stone",PrimitiveType.Sphere,p+new Vector3(Mathf.Cos(a)*r,.05f,Mathf.Sin(a)*r),new Vector3(.18f+(float)rng.NextDouble()*.08f,.065f,.12f+(float)rng.NextDouble()*.05f),stoneMat,decoration,true);st.transform.localRotation=Quaternion.Euler((float)rng.NextDouble()*20-10,-a*Mathf.Rad2Deg,(float)rng.NextDouble()*16-8);}
   var markMat=Material("padmark",new Color(1,.93f,.6f),-1,.3f);markMat.SetColor("_EmissionColor",new Color(.32f,.27f,.1f));var marker=MeshObject("Build mark",Disc(.09f,12),markMat,decoration);marker.transform.localPosition=p+Vector3.up*.052f;pads[id]=root;}
  void BuildCarrotNest(){if(PrismStage){BuildPrismNest();return;}var material=Material("carrot-fence",new Color(.68f,.42f,.22f),2);for(int i=0;i<15;i++){float a=i*Mathf.PI*2/15;Vector3 p=carrotPosition+new Vector3(Mathf.Cos(a)*.63f,.22f,Mathf.Sin(a)*.63f);Primitive("Root fence",PrimitiveType.Cylinder,p,new Vector3(.07f,.19f,.07f),material,decoration,true);}for(int i=0;i<6;i++)Flower(carrotPosition+new Vector3(Mathf.Cos(i)*.82f,.02f,Mathf.Sin(i)*.65f),.27f,i%2==0?Color.white:new Color(1,.72f,.22f));}
  void BuildDecoration(){if(PrismStage){BuildPrismDecoration();return;}var rng=new System.Random(9307+levelId*31);string biome=game.level.biome;int shrubs=0;int budget=CarrotQuality.Rich?150:90;for(int i=0;i<150;i++){if(biome=="frost"&&i%3!=0)continue;if(i>=budget)break;Vector3 p=new Vector3((float)rng.NextDouble()*15.7f-7.85f,0,(float)rng.NextDouble()*11.8f-5.9f);if(!IsFree(p,.78f)||Pond(p))continue;float edge=Mathf.Max(Mathf.Abs(p.x)/7.8f,Mathf.Abs(p.z)/5.8f);float size=.2f+(float)rng.NextDouble()*.38f;if(!PropFree(p,size*1.4f))continue;GameObject prefab=null;string token=i%6==0&&edge>.75f?"shrub":i%3==0?"rock":i%3==1?"plant":"bush";foreach(var n in nature){if(n==null)continue;string wanted=token;if(n.name.ToLowerInvariant().Contains(wanted)){prefab=n;if(rng.NextDouble()>.5)break;}}
    // The arena is dressed with rock only (standing stones and loose boulders; no ferns, shrubs or flowers inside the amphitheatre).
    if(biome=="arena"){if(i%2!=0)continue;token="rock";}
    {string scan=biome=="frost"||biome=="arena"?(i%2==0?"MossRockA":"MossRockB"):token=="rock"?(i%2==0?"MossRockA":"MossRockB"):token=="shrub"&&shrubs<(CarrotQuality.Rich?5:0)?"Shrub":"Fern";if(scan=="Shrub")shrubs++;if(scan=="Fern"&&token=="shrub")token="plant";var realistic=Scan(scan,false);if(realistic!=null)prefab=realistic;}
    if(prefab!=null){var obj=Instantiate(prefab,decoration);obj.name="Living "+token;obj.transform.localPosition=p;obj.transform.rotation=Quaternion.Euler(0,(float)rng.NextDouble()*360,0);var bounds=BoundsOf(obj);float h=biome=="frost"?.16f+(float)rng.NextDouble()*.23f:token=="shrub"?.85f+(float)rng.NextDouble()*.7f:token=="rock"?size:.35f+size;obj.transform.localScale*=h/Mathf.Max(.01f,bounds.size.y);GroundScan(obj,p,h);foreach(var col in obj.GetComponentsInChildren<Collider>())Destroy(col);EnsureClearance(obj,p);}
    else if(token=="rock"){var stone=Primitive("Weathered stone",PrimitiveType.Sphere,p+Vector3.up*size*.3f,new Vector3(size,size*.65f,size*.8f),Material("loose-rock-"+biome,biome=="frost"?new Color(.85f,.9f,.94f):new Color(.78f,.8f,.62f),1,.22f,0,1.6f),decoration);stone.transform.localRotation=Quaternion.Euler(22,i*19,13);}
    else Flower(p,size,biome=="frost"?new Color(.63f,.81f,1):i%3==0?new Color(.74f,.48f,.86f):Color.white);
   }
   BuildLandscapeFrames();BuildTreeline();if(biome=="orchard")BuildOrchardProps(rng);if(biome!="frost"&&biome!="arena")for(int i=0;i<20;i++){Vector3 p=new Vector3((float)rng.NextDouble()*15.5f-7.75f,.04f,(float)rng.NextDouble()*11.6f-5.8f);if(IsFree(p,1.0f)&&!Pond(p))Flower(p,.18f+(float)rng.NextDouble()*.11f,biome=="orchard"?(i%3==0?Color.white:new Color(1,.80f,.36f)):i%3==0?new Color(.67f,.39f,.77f):new Color(1,.89f,.59f));}
  }
  // ---- Ember Orchard props: pumpkins, hay bales, crate stacks, a ladder on a border tree and a far scarecrow that foreshadows the boss. All primitives, batched by material. ----
  Material PumpkinMaterial(){return Material("pumpkin",new Color(.93f,.47f,.12f),-1,.32f);}
  static readonly Color GourdTint=new Color(1f,.6f,.32f);
  void Pumpkin(Vector3 p,float scale,Transform parent,float yaw){if(pumpkinPrefab!=null&&parent==decoration){Tint(PlaceNature(pumpkinPrefab,p,scale*.9f,yaw),"gourd",GourdTint);return;}if(pumpkinPrefab!=null){var o=Instantiate(pumpkinPrefab,parent);o.transform.localPosition=p;o.transform.localRotation=Quaternion.Euler(0,yaw,0);var ob=BoundsOf(o);o.transform.localScale*=scale*.9f/Mathf.Max(.01f,ob.size.y);foreach(var c in o.GetComponentsInChildren<Collider>())Destroy(c);Tint(o,"gourd",GourdTint);return;}var skin=PumpkinMaterial();var stem=Material("pumpkin-stem",new Color(.25f,.35f,.12f),2,.2f);var root=new GameObject("Pumpkin");root.transform.SetParent(parent,false);root.transform.localPosition=p;root.transform.localRotation=Quaternion.Euler(0,yaw,0);
   for(int i=0;i<6;i++){float a=i*Mathf.PI*2/6;var lobe=Primitive("Pumpkin lobe",PrimitiveType.Sphere,new Vector3(Mathf.Cos(a)*scale*.34f,scale*.42f,Mathf.Sin(a)*scale*.34f),new Vector3(scale*.62f,scale*.80f,scale*.62f),skin,root.transform,true);lobe.transform.localRotation=Quaternion.Euler(0,a*Mathf.Rad2Deg,0);}
   Primitive("Pumpkin stem",PrimitiveType.Cylinder,new Vector3(0,scale*.86f,0),new Vector3(scale*.11f,scale*.09f,scale*.11f),stem,root.transform,true);}
  void HayBale(Vector3 p,float yaw){if(hayPrefab!=null){PlaceNature(hayPrefab,p,.6f,yaw);return;}var straw=Material("straw",new Color(.80f,.68f,.30f),2,.18f);var bale=Primitive("Hay bale",PrimitiveType.Cylinder,p+Vector3.up*(TerrainHeight(p)+.275f),new Vector3(.55f,.35f,.55f),straw,decoration);bale.transform.localRotation=Quaternion.Euler(0,yaw,90);}
  void CrateStack(Vector3 p,float yaw){if(cratePrefab!=null){PlaceNature(cratePrefab,p,.95f,yaw);return;}var wood=Material("crate-wood",new Color(.55f,.38f,.20f),2,.22f);float y=TerrainHeight(p);var a=Primitive("Crate",PrimitiveType.Cube,p+Vector3.up*(y+.2f),Vector3.one*.4f,wood,decoration);a.transform.localRotation=Quaternion.Euler(0,yaw,0);var b=Primitive("Crate",PrimitiveType.Cube,p+new Vector3(.42f,y+.2f,.08f),Vector3.one*.4f,wood,decoration);b.transform.localRotation=Quaternion.Euler(0,yaw+14,0);var c=Primitive("Crate",PrimitiveType.Cube,p+new Vector3(.2f,y+.6f,.04f),Vector3.one*.38f,wood,decoration);c.transform.localRotation=Quaternion.Euler(0,yaw-9,0);}
  void BuildOrchardProps(System.Random rng){bool high=CarrotQuality.Rich;int pumpkins=high?8+rng.Next(5):6,placed=0;Vector3 goal=game.level.routes[0][game.level.routes[0].Length-1];
   for(int i=0;i<200&&placed<pumpkins;i++){Vector3 p=new Vector3((float)rng.NextDouble()*15.4f-7.7f,0,(float)rng.NextDouble()*11.4f-5.7f);float s=.25f+(float)rng.NextDouble()*.2f;if(!PropFree(p,s*1.4f)||Vector3.Distance(p,goal)<1.6f)continue;LogDecor(p,s*1.4f);p.y=TerrainHeight(p);Pumpkin(p,s,decoration,(float)rng.NextDouble()*360);placed++;}
   for(int i=0,done=0;i<120&&done<3;i++){Vector3 p=new Vector3((float)rng.NextDouble()*16-8,0,(float)rng.NextDouble()*3.2f+5.4f);if(!PropFree(p,.7f))continue;LogDecor(p,.7f);HayBale(p,(float)rng.NextDouble()*360);done++;}
   for(int i=0,done=0;i<120&&done<2;i++){Vector3 p=new Vector3(i%2==0?-8.4f+(float)rng.NextDouble()*1.2f:7.6f+(float)rng.NextDouble()*1.2f,0,(float)rng.NextDouble()*6-3);if(!PropFree(p,.95f))continue;LogDecor(p,.95f);CrateStack(p,(float)rng.NextDouble()*360);done++;}
   // Orchard ladder leaning on a border tree (two rails and six rungs).
   {var wood=Material("ladder-wood",new Color(.62f,.47f,.26f),2,.25f);Vector3 foot=new Vector3(5.6f,0,7.1f);float y=TerrainHeight(foot);var ladder=new GameObject("Orchard ladder");ladder.transform.SetParent(decoration,false);ladder.transform.localPosition=new Vector3(foot.x,y,foot.z);ladder.transform.localRotation=Quaternion.Euler(-22,-30,0);
    for(int r=-1;r<=1;r+=2)Primitive("Ladder rail",PrimitiveType.Cylinder,new Vector3(r*.19f,1.05f,0),new Vector3(.05f,1.05f,.05f),wood,ladder.transform,true);
    for(int k=0;k<6;k++){var rung=Primitive("Ladder rung",PrimitiveType.Cube,new Vector3(0,.3f+k*.32f,0),new Vector3(.4f,.04f,.04f),wood,ladder.transform);}}
   // Scarecrow silhouette on the far border: pole, crossbar, burlap torso, pumpkin head and a brim.
   {var pole=Material("scarecrow-pole",new Color(.42f,.30f,.17f),2,.2f);var burlap=Material("burlap",new Color(.55f,.42f,.25f),2,.15f);Vector3 at=new Vector3(-6.2f,0,7.6f);float y=TerrainHeight(at);var crow=new GameObject("Scarecrow");crow.transform.SetParent(decoration,false);crow.transform.localPosition=new Vector3(at.x,y,at.z);crow.transform.localRotation=Quaternion.Euler(0,160,0);
    Primitive("Scarecrow pole",PrimitiveType.Cylinder,new Vector3(0,1.1f,0),new Vector3(.08f,1.1f,.08f),pole,crow.transform,true);var bar=Primitive("Scarecrow crossbar",PrimitiveType.Cylinder,new Vector3(0,1.62f,0),new Vector3(.06f,.75f,.06f),pole,crow.transform,true);bar.transform.localRotation=Quaternion.Euler(0,0,90);
    Primitive("Scarecrow coat",PrimitiveType.Cube,new Vector3(0,1.25f,0),new Vector3(.62f,.9f,.34f),burlap,crow.transform);var head=Primitive("Scarecrow head",PrimitiveType.Sphere,new Vector3(0,2.0f,0),new Vector3(.46f,.4f,.46f),PumpkinMaterial(),crow.transform);Primitive("Scarecrow brim",PrimitiveType.Cylinder,new Vector3(0,2.22f,0),new Vector3(.62f,.02f,.62f),burlap,crow.transform);Primitive("Scarecrow crown",PrimitiveType.Cylinder,new Vector3(0,2.34f,0),new Vector3(.3f,.12f,.3f),burlap,crow.transform,true);}
  }
  void BuildGrass(){if(PrismStage)return;
   if(game.level.biome=="frost")return;
   var random=new System.Random(4091+game.level.id*83);var vertices=new List<Vector3>();var uv=new List<Vector2>();var colors=new List<Color>();var triangles=new List<int>();
   int patches=CarrotQuality.Rich?1000:500,bladesPer=CarrotQuality.Rich?9:6;for(int patch=0;patch<patches;patch++){
    Vector3 center=new Vector3((float)random.NextDouble()*17-8.5f,0,(float)random.NextDouble()*13-6.5f);if(!IsFree(center,.59f)||Pond(center))continue;
    float density=Mathf.PerlinNoise(center.x*.8f+35,center.z*.8f+22);if(density<.39f)continue;
    for(int blade=0;blade<bladesPer;blade++){
     Vector3 p=center+new Vector3(((float)random.NextDouble()-.5f)*.32f,.045f,((float)random.NextDouble()-.5f)*.32f);if(PathDistance(p)<.45f)continue;p.y=TerrainHeight(p)+.015f;
     float angle=(float)random.NextDouble()*Mathf.PI*2,height=.08f+(float)random.NextDouble()*.24f,width=.013f+(float)random.NextDouble()*.024f;
     Vector3 side=new Vector3(Mathf.Cos(angle),0,Mathf.Sin(angle))*width,lean=new Vector3(Mathf.Sin(angle),0,Mathf.Cos(angle))*height*.34f;
     int k=vertices.Count;vertices.Add(p-side);vertices.Add(p+side);vertices.Add(p+Vector3.up*height*.55f-side*.55f+lean*.35f);vertices.Add(p+Vector3.up*height*.55f+side*.55f+lean*.35f);vertices.Add(p+Vector3.up*height+lean);
     // Ground cover stays darker than the lanes (path-to-ground contrast): drier, deeper orchard straw and a dimmer arena turf.
     bool dry=game.level.biome=="orchard";Color bottom=game.level.biome=="marsh"?new Color(.11f,.28f,.10f):dry?new Color(.26f,.21f,.07f):new Color(.15f,.35f,.055f);Color tip=dry?Color.Lerp(new Color(.50f,.38f,.12f),new Color(.62f,.47f,.16f),(float)random.NextDouble()):Color.Lerp(new Color(.3f,.55f,.095f),new Color(.48f,.63f,.13f),(float)random.NextDouble());if(game.level.biome=="arena"){bottom*=.6f;tip*=.62f;}
     colors.Add(bottom);colors.Add(bottom);colors.Add(Color.Lerp(bottom,tip,.65f));colors.Add(Color.Lerp(bottom,tip,.65f));colors.Add(tip);uv.Add(new Vector2(0,0));uv.Add(new Vector2(1,0));uv.Add(new Vector2(0,.55f));uv.Add(new Vector2(1,.55f));uv.Add(new Vector2(.5f,1));
     triangles.Add(k);triangles.Add(k+2);triangles.Add(k+1);triangles.Add(k+1);triangles.Add(k+2);triangles.Add(k+3);triangles.Add(k+2);triangles.Add(k+4);triangles.Add(k+3);
    }
   }
   var mesh=new Mesh{name="Meadow grass and herbs",indexFormat=IndexFormat.UInt32};mesh.SetVertices(vertices);mesh.SetUVs(0,uv);mesh.SetColors(colors);mesh.SetTriangles(triangles,0);mesh.RecalculateNormals();var material=Material("living-grass",Color.white);material.SetFloat("_Cull",0);material.SetFloat("_Glossiness",.2f);material.SetFloat("_Wind",.028f);material.SetFloat("_Translucency",.5f);material.SetFloat("_Bend",1);var meadow=MeshObject("Living meadow",mesh,material,decoration);meadow.GetComponent<Renderer>().shadowCastingMode=ShadowCastingMode.Off;
  }
  void BuildLandscapeFrames(){
   // Irregular, life-size border plants sit outside every route and leave the front approach open.
   Vector3[] anchors={new Vector3(-8.5f,0,3.7f),new Vector3(8.6f,0,2.7f),new Vector3(-5.3f,0,7.1f),new Vector3(5.2f,0,7.4f),new Vector3(-8.8f,0,-3.4f),new Vector3(8.8f,0,-2.8f),new Vector3(-1.6f,0,8.0f),new Vector3(1.6f,0,8.3f)};
   for(int i=0;i<anchors.Length;i++){
    bool frost=game.level.biome=="frost";string hero=i==0&&!frost?"Stump":i%2==0?"MossRockA":"MossRockB";
    PlaceScanned(hero,anchors[i],frost?1.15f+(i%3)*.35f:i==0?1.1f:.7f+(i%3)*.2f,i*67+levelId*17,true);
    if(!frost&&CarrotQuality.Rich&&i%2==0)PlaceScanned("Shrub",anchors[i]+new Vector3(i%2==0?-.7f:.7f,0,.55f),1.35f+(i%3)*.20f,levelId*37+i*89,true);
    for(int j=0;j<2;j++){float angle=(j*1.7f+i)*Mathf.PI*.65f;Vector3 p=anchors[i]+new Vector3(Mathf.Cos(angle)*.8f,0,Mathf.Sin(angle)*.65f);if(PropFree(p,.5f))PlaceScanned(frost?"MossRockB":"Fern",p,frost?.25f:.45f+j*.06f,j*83+i*41);}
   }
  }
  /// <summary>Taller silhouettes on the border hills: low-poly trees (snow pines in frost), a garden fence line, fallen logs and extra boulders. All static and batched by material.</summary>
  void BuildTreeline(){
   string biome=game.level.biome;var rng=new System.Random(5101+levelId*17);bool high=CarrotQuality.High,rich=CarrotQuality.Rich;
   var bark=Material("tree-bark",new Color(.5f,.36f,.2f),2,.3f);
   var leaf=Material("tree-leaf-"+biome,biome=="frost"?new Color(.17f,.3f,.21f):biome=="marsh"?new Color(.16f,.3f,.17f):biome=="orchard"?new Color(.80f,.45f,.12f):new Color(.19f,.36f,.1f),-1,.18f);leaf.SetFloat("_Translucency",.3f);leaf.SetFloat("_Wind",.008f);leaf.SetFloat("_SnowStrength",1);leaf.SetFloat("_AlbedoSaturation",.8f);
   Material[] canopy=null;if(biome=="orchard"){canopy=new[]{leaf,Material("tree-leaf-orchard-gold",new Color(.92f,.62f,.16f),-1,.18f),Material("tree-leaf-orchard-rust",new Color(.58f,.24f,.14f),-1,.18f)};foreach(var m in canopy){m.SetFloat("_Translucency",.3f);m.SetFloat("_Wind",.008f);m.SetFloat("_AlbedoSaturation",.8f);}}int autumn=0;
   int count=rich?26:16;
   for(int i=0;i<count;i++){
    float a=i/(float)count*Mathf.PI*2+(float)rng.NextDouble()*.2f;float rx=11.2f+(float)rng.NextDouble()*2.8f,rz=8.4f+(float)rng.NextDouble()*2.4f;
    Vector3 p=new Vector3(Mathf.Cos(a)*rx,0,Mathf.Sin(a)*rz);
    if(p.z<-6.8f||(p.z<-3.5f&&Mathf.Abs(p.x)>9.2f))continue;   // the landscape camera looks in from -z: keep the front approach and the bottom corners open
    if(p.x<-9.5f&&p.z<4.5f)p.x-=2.4f;      // the portrait camera looks in from -x: push those crowns out of its frame
    float h=(biome=="frost"?2.3f:2.7f)*(.8f+(float)rng.NextDouble()*.6f);
    // Ember Orchard: three of every five border trees are the licensed Kenney autumn tree; the rest are primitive canopies in the three leaf tones.
    if(biome=="orchard"&&treeAutumn!=null&&(autumn++%5)<3)PlaceNature(treeAutumn,p,2.4f+(float)rng.NextDouble()*.8f,(float)rng.NextDouble()*360);else Tree(p,h,(float)rng.NextDouble()*360,bark,leaf,biome,rng,!high,canopy);
   }
   // A few trees on the inner slopes where there is room, away from pads and routes (never inside the arena's stone ellipse).
   if(biome!="arena")for(int i=0;i<(rich?6:3);i++){Vector3 p=new Vector3((float)rng.NextDouble()*17-8.5f,0,5.9f+(float)rng.NextDouble()*2.4f);if(IsFree(p,1.6f))Tree(p,(biome=="frost"?1.9f:2.2f)*(.85f+(float)rng.NextDouble()*.4f),(float)rng.NextDouble()*360,bark,leaf,biome,rng,!high,canopy);}
   if(biome=="garden"||biome=="orchard"){
    var rail=Material("fence-wood-"+biome,biome=="orchard"?new Color(.52f,.40f,.26f):new Color(.62f,.45f,.26f),2,.3f);
    for(int seg=0;seg<2;seg++){Vector3 start=seg==0?new Vector3(-5.6f,0,7.25f):new Vector3(8.7f,0,-1.8f);Vector3 dir=seg==0?Vector3.right:Vector3.forward;int posts=seg==0?11:5;
     for(int k=0;k<posts;k++){Vector3 p=start+dir*(k*1.1f);float y=TerrainHeight(p);Primitive("Fence post",PrimitiveType.Cylinder,p+Vector3.up*(y+.24f),new Vector3(.09f,.26f,.09f),rail,decoration,true);
      if(biome=="orchard"&&k==(seg==0?5:2)&&lanterns.Count<2){var lamp=Primitive("Fence lantern",PrimitiveType.Sphere,p+Vector3.up*(y+.62f),Vector3.one*.14f,Material("lantern",new Color(1,.76f,.22f),5,.65f,.3f),decoration);lamp.GetComponent<Renderer>().sharedMaterial.SetColor("_EmissionColor",LanternGlow);Primitive("Lantern post",PrimitiveType.Cylinder,p+Vector3.up*(y+.5f),new Vector3(.05f,.1f,.05f),rail,decoration,true);var lightGo=new GameObject("Lantern light");lightGo.transform.SetParent(decoration,false);lightGo.transform.localPosition=p+Vector3.up*(y+.7f);var light=lightGo.AddComponent<Light>();light.type=LightType.Point;light.range=2.6f;light.intensity=6;light.color=new Color(1,.70f,.30f);light.shadows=LightShadows.None;lanterns.Add(light);}
      if(k<posts-1){Vector3 q=start+dir*((k+.5f)*1.1f);float yq=TerrainHeight(q);var r1=Primitive("Fence rail",PrimitiveType.Cube,q+Vector3.up*(yq+.42f),new Vector3(1.1f,.05f,.05f),rail,decoration);r1.transform.localRotation=Quaternion.LookRotation(dir)*Quaternion.Euler(0,90,0);var r2=Primitive("Fence rail",PrimitiveType.Cube,q+Vector3.up*(yq+.26f),new Vector3(1.1f,.05f,.05f),rail,decoration);r2.transform.localRotation=r1.transform.localRotation;}}}
   }
   int logs=biome=="frost"?2:3;for(int i=0;i<logs;i++){Vector3 p=new Vector3((float)rng.NextDouble()*16-8,0,(float)rng.NextDouble()*3+6.2f);if(!PropFree(p,1.5f))continue;LogDecor(p,1.5f);var log=Primitive("Fallen log",PrimitiveType.Cylinder,p+Vector3.up*(TerrainHeight(p)+.14f),new Vector3(.3f,.75f,.3f),bark,decoration);log.transform.localRotation=Quaternion.Euler(0,(float)rng.NextDouble()*360,90);}
   if(biome=="frost")for(int i=0;i<(rich?6:3);i++){float a=(float)rng.NextDouble()*Mathf.PI;Vector3 p=new Vector3(Mathf.Cos(a)*(9.8f+(float)rng.NextDouble()*2),0,6.6f+Mathf.Sin(a)*2.2f);if(p.x<-9.5f)p.x-=2;PlaceScanned(i%2==0?"MossRockA":"MossRockB",p,.9f+(float)rng.NextDouble()*.6f,(float)rng.NextDouble()*360,true);}
  }
  /// <summary>The challenge arena: fourteen MossRock standing stones on a 7.6 x 5.6 u ellipse around the play area and four lantern posts on the lit pads (4-7), existing prefabs and primitives only. The lantern lights are green for the Zombie's night.</summary>
  void BuildArenaRing(){
   if(game.level.boss=="portal"){BuildPortalArena();return;}
   var rng=new System.Random(7001+levelId*13);bool zombie=game.level.boss=="zombie";
   // The landscape camera looks in from -z: the front stones stay low (0.45-0.7 u) so they frame the arena without hiding the lanes; the back and side stones stand tall.
   for(int i=0;i<14;i++){float a=i/14f*Mathf.PI*2+.11f;Vector3 p=new Vector3(Mathf.Cos(a)*7.6f,0,Mathf.Sin(a)*5.6f);if(!IsFree(p,.9f))p+=new Vector3(Mathf.Cos(a),0,Mathf.Sin(a))*.8f;if(!IsFree(p,.8f))continue;bool front=p.z<-2.5f;float h=front?.45f+(float)rng.NextDouble()*.25f:1.2f+(float)rng.NextDouble()*.7f;PlaceScanned(i%2==0?"MossRockA":"MossRockB",p,h,(float)rng.NextDouble()*360,!front);}
   var post=Material("lantern-post",new Color(.28f,.22f,.16f),2,.25f);var glass=Material(zombie?"lantern-green":"lantern",zombie?new Color(.5f,1,.6f):new Color(1,.76f,.22f),5,.65f,.3f);glass.SetColor("_EmissionColor",zombie?new Color(.4f,1.6f,.6f):new Color(1.6f,.75f,.12f));
   foreach(int pad in CarrotData.LitPads(levelId)){if(pad<0||pad>=game.level.pads.Length)continue;Vector3 q=game.level.pads[pad];float y=TerrainHeight(q);Vector3 side=new Vector3(q.x<0?-.62f:.62f,0,q.z<0?-.5f:.5f);Vector3 foot=q+side;
    Primitive("Lantern post",PrimitiveType.Cylinder,foot+Vector3.up*(y+.55f),new Vector3(.07f,.55f,.07f),post,decoration,true);Primitive("Lantern arm",PrimitiveType.Cube,foot+Vector3.up*(y+1.08f),new Vector3(.3f,.05f,.05f),post,decoration);
    var lamp=Primitive("Lantern glass",PrimitiveType.Sphere,foot+Vector3.up*(y+1.0f),Vector3.one*.17f,glass,decoration);lamp.GetComponent<Renderer>().shadowCastingMode=ShadowCastingMode.Off;
    var lightGo=new GameObject("Lantern light");lightGo.transform.SetParent(decoration,false);lightGo.transform.localPosition=foot+Vector3.up*(y+1.05f);var light=lightGo.AddComponent<Light>();light.type=LightType.Point;light.range=2.8f;light.intensity=6.5f;light.color=zombie?new Color(.45f,1,.55f):new Color(1,.72f,.3f);light.shadows=LightShadows.None;lanterns.Add(light);}
  }
  void Tree(Vector3 p,float h,float yaw,Material bark,Material leaf,string biome,System.Random rng,bool small,Material[] canopy=null){
   var model=biome=="frost"?treePine:biome=="orchard"?treeAutumn:treeOak;if(model!=null){var placed=PlaceNature(model,p,h*(biome=="frost"?1.05f:.95f),yaw);Tint(placed,"tree",biome=="marsh"?new Color(.52f,.62f,.55f):biome=="arena"?new Color(.6f,.66f,.6f):biome=="frost"?new Color(.86f,.9f,.92f):biome=="orchard"?new Color(.92f,.86f,.82f):new Color(.78f,.84f,.72f));return;}
   float ground=TerrainHeight(p);var root=new GameObject("Border tree");root.transform.SetParent(decoration,false);root.transform.localPosition=new Vector3(p.x,ground-.05f,p.z);root.transform.localRotation=Quaternion.Euler(0,yaw,0);
   float trunk=h*.42f;Primitive("Trunk",PrimitiveType.Cylinder,new Vector3(0,trunk*.5f,0),new Vector3(h*.085f,trunk*.5f,h*.085f),bark,root.transform,true);
   if(biome=="frost"){for(int t=0;t<3;t++){float y=h*(.4f+t*.19f);float w=h*(.66f-t*.16f);Primitive("Pine tier",PrimitiveType.Sphere,new Vector3(0,y,0),new Vector3(w,h*.24f,w),leaf,root.transform,small);}Primitive("Pine tip",PrimitiveType.Sphere,new Vector3(0,h*.95f,0),new Vector3(h*.18f,h*.16f,h*.18f),leaf,root.transform,small);}
   else{int blobs=4;for(int b=0;b<blobs;b++){float ang=b*1.9f+(float)rng.NextDouble()*1.2f;float r=h*(.12f+(float)rng.NextDouble()*.06f);Vector3 c=new Vector3(Mathf.Cos(ang)*r,h*(.56f+b*.11f),Mathf.Sin(ang)*r);float w=h*(.46f-b*.07f)*(.9f+(float)rng.NextDouble()*.2f);var blob=Primitive("Canopy",PrimitiveType.Sphere,c,new Vector3(w,w*.74f,w),canopy!=null?canopy[b%canopy.Length]:leaf,root.transform,small);blob.transform.localRotation=Quaternion.Euler((float)rng.NextDouble()*30,(float)rng.NextDouble()*360,0);}}
  }
  /// <summary>The full scan for the hero anchors (shadows of its own); the decimated Small prefab (visible mesh without shadows plus a coarser shadows-only caster) for the hundred small placements.</summary>
  GameObject Scan(string kind,bool hero){GameObject prefab;if(!hero&&realNature.TryGetValue(kind+"Small",out prefab))return prefab;return realNature.TryGetValue(kind,out prefab)?prefab:null;}
  void GroundScan(GameObject obj,Vector3 p,float height){var b=BoundsOf(obj);obj.transform.position+=Vector3.up*(TerrainHeight(p)-b.min.y-Mathf.Min(.1f,height*.06f));}
  /// <summary>The characters stream's modelled trees share the Foliage material; the older Kenney meshes under the same names do not and
  /// stay unused (the primitive trees remain until the modelled ones are in the project).</summary>
  static GameObject Modelled(GameObject prefab){if(prefab==null)return null;foreach(var r in prefab.GetComponentsInChildren<Renderer>(true))foreach(var m in r.sharedMaterials)if(m!=null&&m.name.StartsWith("Foliage"))return prefab;return null;}
  GameObject PlaceNature(GameObject prefab,Vector3 p,float height,float rotation){if(prefab==null)return null;var obj=Instantiate(prefab,decoration);obj.transform.localPosition=p;obj.transform.localRotation=Quaternion.Euler(0,rotation,0);var bounds=BoundsOf(obj);obj.transform.localScale*=height/Mathf.Max(.01f,bounds.size.y);GroundScan(obj,p,height);foreach(var c in obj.GetComponentsInChildren<Collider>())Destroy(c);return EnsureClearance(obj,p)?obj:null;}
  /// <summary>Every placed prop keeps 1.0 u between its footprint and every route centreline: measured after scaling, pushed outward
  /// along the distance gradient when it intrudes (twice at most), removed when it still does; logged for the QA clearance check.</summary>
  bool EnsureClearance(GameObject obj,Vector3 p){
   var b=BoundsOf(obj);float half=Mathf.Max(b.size.x,b.size.z)*.5f;Vector3 c=new Vector3(b.center.x,0,b.center.z);
   for(int pass=0;pass<3;pass++){float clear=PathDistance(c)-half;if(clear>=1f){LogDecor(c,half*2);return true;}if(pass==2)break;
    Vector3 g=new Vector3(PathDistance(c+Vector3.right*.1f)-PathDistance(c-Vector3.right*.1f),0,PathDistance(c+Vector3.forward*.1f)-PathDistance(c-Vector3.forward*.1f));if(g.sqrMagnitude<1e-6f)g=c.sqrMagnitude>1e-4f?c:Vector3.right;
    Vector3 move=g.normalized*(1f-clear+.05f);if(move.magnitude>2.5f)break;obj.transform.position+=move;c+=move;GroundScan(obj,c,b.size.y);bool padHit=false;foreach(var q in game.level.pads)if(Vector3.Distance(new Vector3(q.x,0,q.z),c)<.6f+half)padHit=true;if(padHit||Pond(c))break;}
   obj.SetActive(false);Destroy(obj);return false;
  }
  /// <summary>Per-biome copies of a modelled prop's materials with a colour multiplier (the shared foliage and gourd materials are
  /// authored for daylight; night biomes and the frost glare need them darker). Copies are cached, so batching is unchanged.</summary>
  void Tint(GameObject obj,string role,Color multiply){if(obj==null)return;foreach(var r in obj.GetComponentsInChildren<Renderer>(true)){var mats=r.sharedMaterials;for(int i=0;i<mats.Length;i++){var m=mats[i];if(m==null||!m.HasProperty("_Color"))continue;string key="tint-"+role+"-"+m.name+"-"+ColorUtility.ToHtmlStringRGB(multiply);if(!materials.TryGetValue(key,out var copy)){copy=new Material(m){name=m.name+" ("+role+" "+game.level.biome+")"};copy.color=m.color*multiply;materials[key]=copy;}mats[i]=copy;}r.sharedMaterials=mats;}}
  void PlaceScanned(string kind,Vector3 p,float height,float rotation,bool hero=false){var prefab=Scan(kind,hero);if(prefab==null)return;var obj=Instantiate(prefab,decoration);obj.transform.localPosition=p;obj.transform.localRotation=Quaternion.Euler(0,rotation,0);var bounds=BoundsOf(obj);obj.transform.localScale*=height/Mathf.Max(.01f,bounds.size.y);GroundScan(obj,p,height);foreach(var c in obj.GetComponentsInChildren<Collider>())Destroy(c);if(!EnsureClearance(obj,p))return;}
  void Flower(Vector3 p,float height,Color petalColor){p.y=TerrainHeight(p)+.005f;GameObject prefab=null;bool white=petalColor.r>.9f&&petalColor.g>.85f;foreach(var n in nature){if(n==null)continue;if(n.name==(white?"FlowerWhite":"FlowerPurple")){prefab=n;break;}}
   if(prefab==null){var stem=Material("stem",new Color(.25f,.48f,.12f),4);Primitive("Flower stalk",PrimitiveType.Cylinder,p+Vector3.up*height*.5f,new Vector3(.018f,height*.5f,.018f),stem,decoration,true);Primitive("Flower head",PrimitiveType.Sphere,p+Vector3.up*height,new Vector3(.09f,.05f,.09f),Material("petal-"+petalColor.ToString(),petalColor),decoration,true);return;}
   var obj=Instantiate(prefab,decoration);obj.name="Meadow flower";obj.transform.localPosition=p;obj.transform.localRotation=Quaternion.Euler(0,p.x*131+p.z*57,0);var bounds=BoundsOf(obj);obj.transform.localScale*=Mathf.Max(.12f,height*1.15f)/Mathf.Max(.01f,bounds.size.y);foreach(var r in obj.GetComponentsInChildren<Renderer>()){r.shadowCastingMode=ShadowCastingMode.Off;var mats=r.sharedMaterials;for(int i=0;i<mats.Length;i++)if(mats[i]!=null&&mats[i].shader!=null&&mats[i].shader.name!="Carrot/Storybook")mats[i]=Material("flower-"+mats[i].name,mats[i].color,-1,.3f);r.sharedMaterials=mats;}foreach(var c in obj.GetComponentsInChildren<Collider>())Destroy(c);}
  void CombineDecoration(){var groups=new Dictionary<(Material,ShadowCastingMode),List<CombineInstance>>();var remove=new List<GameObject>();
   foreach(var f in decoration.GetComponentsInChildren<MeshFilter>()){var r=f.GetComponent<MeshRenderer>();if(r==null||f.sharedMesh==null||!f.sharedMesh.isReadable)continue;var mats=r.sharedMaterials;
    for(int s=0;s<f.sharedMesh.subMeshCount&&s<mats.Length;s++){if(mats[s]==null)continue;string mn=mats[s].name;
     // Small dressing never casts: pebbles, pad stones and soil, flowers, litter, pad markers; scanned props bring their own mode (full scans On, Small ones Off plus a ShadowsOnly caster child).
     var mode=mn.StartsWith("path-stone")||mn.StartsWith("padstones")||mn.StartsWith("padsoil")||mn.StartsWith("flower-")||mn.StartsWith("petal-")||mn.StartsWith("litter-")||mn=="stem"||mn=="pollen"||mn=="padmark"?ShadowCastingMode.Off:r.shadowCastingMode;
     // Low tier (phones): only the trees still cast into the shadow map; props keep their soft ground contact through the AO and contact quads.
     if(!CarrotQuality.Rich&&!mn.StartsWith("tree-")){if(mode==ShadowCastingMode.ShadowsOnly)continue;mode=ShadowCastingMode.Off;}
     var key=(mats[s],mode);if(!groups.TryGetValue(key,out var list)){list=new List<CombineInstance>();groups[key]=list;}list.Add(new CombineInstance{mesh=f.sharedMesh,subMeshIndex=s,transform=decoration.worldToLocalMatrix*f.transform.localToWorldMatrix});}
    r.enabled=false;remove.Add(f.gameObject);}
   foreach(var pair in groups){var mesh=new Mesh{name="Batched natural details",indexFormat=IndexFormat.UInt32};mesh.CombineMeshes(pair.Value.ToArray(),true,true);var mode=pair.Key.Item2;var batch=MeshObject(mode==ShadowCastingMode.ShadowsOnly?"Natural detail casters":"Natural detail batch",mesh,pair.Key.Item1,decoration);var renderer=batch.GetComponent<Renderer>();renderer.shadowCastingMode=mode;renderer.receiveShadows=mode!=ShadowCastingMode.ShadowsOnly;}foreach(var go in remove){var filter=go.GetComponent<MeshFilter>();var renderer=go.GetComponent<MeshRenderer>();if(filter!=null)Destroy(filter);if(renderer!=null)Destroy(renderer);}}
  Actor Spawn(string path,Transform parent,string kind,int tier){GameObject prefab=Resources.Load<GameObject>(path);var root=new GameObject(kind+" actor");root.transform.SetParent(parent,false);GameObject model;if(prefab!=null)model=Instantiate(prefab,root.transform);else{model=new GameObject("Missing model "+path);model.transform.SetParent(root.transform,false);Debug.LogError("Missing required Carrot model: "+path);}model.transform.localPosition=Vector3.zero;var actor=new Actor{root=root,model=model.transform,modelScale=model.transform.localScale,modelRotation=model.transform.localRotation,kind=kind,tier=tier,renderers=model.GetComponentsInChildren<Renderer>(true),animation=model.GetComponentInChildren<Animation>(true),bounds=BoundsOf(model)};actor.turret=Find(model.transform,"Turret");actor.core=Find(model.transform,"Core");actor.barrel=Find(model.transform,"Barrel");actor.petals=Find(model.transform,"Petals");actor.pages=Find(model.transform,"Pages");actor.muzzle=Find(model.transform,"Muzzle");if(actor.barrel!=null)actor.barrelRest=actor.barrel.localPosition;actor.ring=Find(model.transform,"Ring01");if(actor.ring!=null)actor.ringRest=actor.ring.localPosition;actor.ring2=Find(model.transform,"Ring02");actor.ring3=Find(model.transform,"Ring03");actor.bells=new[]{Find(model.transform,"Bell01"),Find(model.transform,"Bell02"),Find(model.transform,"Bell03"),Find(model.transform,"Bell04"),Find(model.transform,"Bell05")};if(actor.turret!=null)actor.turretYaw=actor.turret.rotation;if(actor.turret!=null&&kind!="carrot"&&path.Contains("Towers/")&&CarrotQuality.Rich)BuildAimRig(actor);ResolveExpansionActor(actor,path);if(kind=="asuna")actor.asunaMotion=model.GetComponentInChildren<CarrotAsunaMotion>(true);
   // Challenge bosses: every animated pivot is resolved here, once (no Find in UpdateActors).
   if(kind=="tornado"){actor.funnels=new Transform[5];for(int i=0;i<5;i++)actor.funnels[i]=Find(model.transform,"FunnelTier"+i);actor.debrisRings=new Transform[3];for(int i=0;i<3;i++)actor.debrisRings[i]=Find(model.transform,"DebrisRing"+i);}
   else if(kind=="eyeball"){actor.upperLid=Find(model.transform,"UpperLid");actor.lowerLid=Find(model.transform,"LowerLid");actor.pupil=Find(model.transform,"Pupil");actor.tentacles=new Transform[6];for(int i=0;i<6;i++)actor.tentacles[i]=Find(model.transform,"Tentacle"+i);var irisRoot=Find(model.transform,"Iris");var irisRing=Find(model.transform,"IrisRing");var list=new List<Renderer>();if(irisRoot!=null)list.AddRange(irisRoot.GetComponentsInChildren<Renderer>(true));if(irisRing!=null)list.AddRange(irisRing.GetComponentsInChildren<Renderer>(true));actor.iris=list.ToArray();}
   bool challengeBoss=path.Contains("Bosses")&&(kind=="tornado"||kind=="zombie"||kind=="eyeball");float diameter=kind=="portal"?2.2f:path.Contains("Minibosses/")?1.4f:kind=="tornado"&&challengeBoss?2.4f:kind=="garden"||kind=="marsh"||kind=="orchard"||kind=="frost"&&path.Contains("Bosses")||challengeBoss?1.65f:kind=="carrot"?1.1f:.9f;if(!path.Contains("Towers/")&&kind!="carrot"&&kind!="tornado"){float foot=Mathf.Max(actor.bounds.size.x,actor.bounds.size.z);if(foot>.05f)diameter=Mathf.Clamp(Mathf.Lerp(diameter,foot*1.15f,.5f),.55f,3f);}actor.shadow=ContactShadow(root.transform,diameter,kind=="tornado"&&challengeBoss?.35f:.31f);actor.shadowSize=diameter;
   // Low tier (phones): creatures and towers keep only their soft contact shadow; the shadow map holds the scenery and the bosses (draw and triangle budget).
   if(!CarrotQuality.Rich&&!path.Contains("Bosses/"))foreach(var r in actor.renderers)if(r!=null)r.shadowCastingMode=ShadowCastingMode.Off;
   return actor;}
  void BuildAimRig(Actor actor){
   // Animation Rigging: the turret yaws and the barrel pitches toward a target transform the view moves through a spring.
   var model=actor.model.gameObject;var animator=model.GetComponent<Animator>();if(animator==null)animator=model.AddComponent<Animator>();
   var rigGo=new GameObject("Aim rig");rigGo.transform.SetParent(actor.model,false);var rig=rigGo.AddComponent<Rig>();
   var target=new GameObject("Aim target");target.transform.SetParent(actor.root.transform,false);target.transform.localPosition=new Vector3(0,.35f,-2);actor.aimTarget=target.transform;
   var yaw=new GameObject("Turret yaw").AddComponent<MultiAimConstraint>();yaw.transform.SetParent(rigGo.transform,false);var yd=yaw.data;yd.constrainedObject=actor.turret;var sources=new WeightedTransformArray();sources.Add(new WeightedTransform(target.transform,1));yd.sourceObjects=sources;yd.aimAxis=MultiAimConstraintData.Axis.Z_NEG;yd.upAxis=MultiAimConstraintData.Axis.Y;yd.worldUpType=MultiAimConstraintData.WorldUpType.SceneUp;yd.constrainedXAxis=false;yd.constrainedYAxis=true;yd.constrainedZAxis=false;yd.limits=new Vector2(-180,180);yaw.data=yd;yaw.weight=1;
   if(actor.barrel!=null){var pitch=new GameObject("Barrel pitch").AddComponent<MultiAimConstraint>();pitch.transform.SetParent(rigGo.transform,false);var pd=pitch.data;pd.constrainedObject=actor.barrel;var sources2=new WeightedTransformArray();sources2.Add(new WeightedTransform(target.transform,1));pd.sourceObjects=sources2;pd.aimAxis=MultiAimConstraintData.Axis.Z_NEG;pd.upAxis=MultiAimConstraintData.Axis.Y;pd.worldUpType=MultiAimConstraintData.WorldUpType.SceneUp;pd.constrainedXAxis=true;pd.constrainedYAxis=false;pd.constrainedZAxis=false;pd.limits=actor.kind=="mortar"?new Vector2(-40,4):new Vector2(-28,6);pitch.data=pd;pitch.weight=1;}
   var builder=model.GetComponent<RigBuilder>();if(builder==null)builder=model.AddComponent<RigBuilder>();builder.layers.Add(new RigLayer(rig,true));if(builder.Build())actor.rig=builder;else Debug.LogWarning("Carrot aim rig failed for "+actor.kind);animator.enabled=false;
  }
  Transform ContactShadow(Transform parent,float diameter,float alpha=.31f){
   string key=alpha==.31f?"contact-shadow":"contact-shadow-"+alpha.ToString("F2",System.Globalization.CultureInfo.InvariantCulture);
   if(!materials.TryGetValue(key,out var m)){m=new Material(Shader.Find("Carrot/Contact"));m.SetColor("_Color",new Color(.055f,.075f,.085f,alpha));materials[key]=m;}
   var go=Primitive("Contact shadow",PrimitiveType.Quad,Vector3.zero,new Vector3(diameter,diameter,.01f),m,parent);go.transform.rotation=Quaternion.Euler(-90,0,0);var r=go.GetComponent<Renderer>();r.shadowCastingMode=ShadowCastingMode.Off;r.receiveShadows=false;
   // Drawn by the per-frame contact-shadow batch (one draw for every actor); the quad keeps only its transform and active state.
   r.enabled=false;contactShadows.Add(go.transform);return go.transform;
  }
  static Transform Find(Transform root,string name){if(root.name==name)return root;foreach(Transform child in root){var match=Find(child,name);if(match!=null)return match;}return null;}
  static Bounds BoundsOf(GameObject obj){var rs=obj.GetComponentsInChildren<Renderer>(true);if(rs.Length==0)return new Bounds(Vector3.zero,Vector3.one);var b=rs[0].bounds;for(int i=1;i<rs.Length;i++)b.Encapsulate(rs[i].bounds);return b;}
  void Clickable(Actor a,string type,int id,float size){var click=a.root.AddComponent<CarrotClickable>();click.type=type;click.id=id;var col=a.root.AddComponent<BoxCollider>();col.center=Vector3.up*size*.5f;col.size=new Vector3(size*.85f,size,size*.85f);}
  /// <summary>Tower actor for a kind and tier; a missing Super prefab (Towers/{kind}-5) falls back to the tier-4 model with a code-driven glow so merges can be shown before the model lands.</summary>
  Actor SpawnTower(string kind,int tier){string path="Carrot/Models/Towers/"+kind+"-"+tier;bool fallback=tier==5&&Resources.Load<GameObject>(path)==null;if(fallback)path="Carrot/Models/Towers/"+kind+"-4";var a=Spawn(path,world,kind,tier);a.superFallback=fallback;if(fallback)Debug.LogWarning("Super model missing (tier-4 fallback with glow): "+kind+"-5");return a;}
  int MarkedNear(Vector3 p,float radius){int n=0;for(int i=marks.Count-1;i>=0;i--){if(marks[i].until<clock){marks.RemoveAt(i);continue;}if(Vector3.Distance(marks[i].position,p)<=radius)n++;}return n;}
  float nightRim;
  void UpdateActors(float dt){seen.Clear();int superSlot=0;bool anyMark=marks.Count>0;string b0=game.level.biome;nightRim=b0=="marsh"||b0=="arena"&&game.level.boss!="tornado"||blindLevel>.05f?.35f:0;bool windupLive=false;
   foreach(var t in game.towers){seen.Add(t.id);if(!towers.TryGetValue(t.id,out var a)||a.tier!=t.tier){bool upgrade=a!=null;if(a!=null){effects.Echo(a.root,a.root.transform.position,a.root.transform.position+Vector3.up*.12f,.3f);Destroy(a.root);}a=SpawnTower(t.kind,t.tier);Clickable(a,"tower",t.id,1.25f);towers[t.id]=a;a.spawnClock=clock;a.upgraded=upgrade;}
    var def=CarrotData.Tower(t.kind);float interval=def!=null?def.interval[Mathf.Clamp(t.tier-1,0,def.interval.Length-1)]:1;float charge=interval>0?Mathf.Clamp01(1-t.cooldown/interval):1;float since=Mathf.Max(0,game.elapsed-t.lastShot);float age=clock-a.spawnClock;
    // Super: pooled emblem decal and thin ring (six slots; the rest keep the shader pulse), dimmed while a telegraph is live within 2 u; High tier idle motes every 0.2 s.
    if(t.tier==5){Color tone=CarrotEffects.Tone(t.kind);if(superSlot<6){effects.SuperMark(superSlot,t.position,t.kind,tone,anyMark&&MarkedNear(t.position,2)>0?.25f:.7f,true);superSlot++;}if(CarrotQuality.High&&dt>0){a.moteClock+=dt;if(a.moteClock>=.2f){a.moteClock=0;effects.SuperIdle(t.position,tone);}}}
    // Build drop and upgrade pop are view-only scale curves; recoil, spin-up and breathing read the simulation clocks.
    float pop=1,drop=0;if(age<.55f){if(a.upgraded)pop=age<.3f?Mathf.Lerp(.6f,1.08f,EaseOut(age/.3f)):Mathf.Lerp(1.08f,1,(age-.3f)/.25f);else{pop=age<.35f?Mathf.Lerp(.3f,1.06f,EaseOut(age/.35f)):Mathf.Lerp(1.06f,1,(age-.35f)/.2f);drop=.5f*(1-Bounce(Mathf.Clamp01(age/.5f)));}}
    float ground=TerrainHeight(t.position);a.root.transform.position=new Vector3(t.position.x,ground+.02f+drop,t.position.z);if(a.shadow!=null)a.shadow.position=new Vector3(t.position.x,ground+.062f,t.position.z);
    bool mortar=t.kind=="mortar";float k=Mathf.Exp(-since*18)*Mathf.Sin(since*26);
    if(a.rig!=null&&a.aimTarget!=null){Vector3 aimPoint=AirPoint(t.aim,-1)+Vector3.up*.35f;if((t.aim-t.position).sqrMagnitude>.01f)a.aimTarget.position=Vector3.Lerp(a.aimTarget.position,aimPoint,1-Mathf.Exp(-dt*14));a.rig.Evaluate(dt);if(a.barrel!=null)a.barrel.localRotation*=Quaternion.Euler(-k*(mortar?12:6),0,0);}
    else if(a.turret!=null){Vector3 aim=t.aim-t.position;aim.y=0;if(aim.sqrMagnitude>.01f)a.turretYaw=Quaternion.Slerp(a.turretYaw,Quaternion.LookRotation(aim)*Quaternion.Euler(0,180,0),1-Mathf.Exp(-dt*14));a.turret.rotation=a.turretYaw*Quaternion.Euler(-k*(mortar?12:6),0,0);}
    if(a.barrel!=null)a.barrel.localPosition=a.barrelRest+Vector3.forward*k*(mortar?.14f:.08f);
    float breathe=1+.012f*Mathf.Sin(clock*1.6f+t.id*1.7f);a.model.localScale=Vector3.Scale(a.modelScale,new Vector3(pop,pop*breathe*(1-.03f*Mathf.Exp(-since*22)),pop))*ActorScale;
    bool spinner=t.kind=="prism"||t.kind=="thunder"||t.kind=="gravity"||t.kind=="starfruit";if(spinner&&a.core!=null){a.spin+=(Mathf.Lerp(18,160,charge*charge)+420*Mathf.Exp(-since*8))*dt;RotatePart(a.core,Quaternion.Euler(0,a.spin*(t.kind=="gravity"?-1:1),0));}
    if(a.ring!=null){a.spinRing-=(Mathf.Lerp(18,120,charge*charge)+300*Mathf.Exp(-since*8))*dt;RotatePart(a.ring,Quaternion.Euler(0,a.spinRing,0));if(t.kind=="thunder")a.ring.localPosition=a.ringRest+Vector3.up*.06f*charge;}
    // Super kit: Ring02 counter-spins slowly, Ring03 (the halo with its three gems) spins -40 deg/s plus charge.
    if(a.ring2!=null)RotatePart(a.ring2,Quaternion.Euler(0,clock*26,0));if(a.ring3!=null)RotatePart(a.ring3,Quaternion.Euler(0,-(40+50*charge)*clock-200*Mathf.Exp(-since*8),0));
    if(a.petals!=null)RotatePart(a.petals,Quaternion.Euler(-14*charge-10*Mathf.Exp(-since*6),Mathf.Sin(clock*1.4f)*3,0));
    if(a.pages!=null)RotatePart(a.pages,Quaternion.Euler(Mathf.Sin(clock*3.1f)*5+Mathf.Sin(clock*44)*22*Mathf.Exp(-since*10),0,0));
    for(int b=0;b<a.bells.Length;b++){var bell=a.bells[b];if(bell!=null)RotatePart(bell,Quaternion.Euler(0,0,8*Mathf.Sin(since*20+b*.7f)*Mathf.Exp(-since*4)));}
    Color glow=Color.black;if(spinner)glow=CarrotEffects.Tone(t.kind)*(.04f+.14f*charge);if(t.disabledFor>0||t.stunnedFor>0)glow+=new Color(.17f,.35f,.5f)*.12f;else if(t.slowFor>0)glow+=new Color(.17f,.35f,.5f)*.04f;if(age<.1f&&a.upgraded)glow+=Color.white*.6f;if(a.superFallback)glow+=CarrotEffects.Tone(t.kind)*(.6f+.25f*Mathf.Sin(clock*2.4f));if(t.stunnedFor>0)glow+=new Color(.5f,.08f,.18f)*(.15f+.1f*Mathf.Sin(clock*6));
    Color towerTint=Color.white;if(mergeDrag&&t.id==mergeSource)towerTint=new Color(.6f,.6f,.6f);
    AnimateExpansionTower(a,t,charge,since,dt,ref glow);
    Surface(a,glow,towerTint,0,Color.black);
    if(pads.TryGetValue(t.pad,out var pad))pad.GetComponent<SphereCollider>().enabled=false;}
   for(int s=superSlot;s<6;s++)effects.SuperMark(s,Vector3.zero,"",Color.white,0,false);
   RemoveMissing(towers,seen);
   seen.Clear();foreach(var e in game.enemies){seen.Add(e.id);if(!enemies.TryGetValue(e.id,out var a)){string path=ExpansionEnemyPath(e);a=Spawn(path,world,e.kind,1);if(e.kind=="fragment"){a.modelScale*=.45f;a.model.localScale=a.modelScale;}Clickable(a,"enemy",e.id,!string.IsNullOrEmpty(e.boss)?2.1f:!string.IsNullOrEmpty(e.miniboss)?1.35f:.85f);enemies[e.id]=a;a.tone=e.kind=="crystal"||e.kind=="fragment"?CarrotEffects.Tone("frost"):e.kind=="shaman"||e.kind=="swarm"?CarrotEffects.Tone("marsh"):new Color(1,.6f,.2f);}
    bool boss=!string.IsNullOrEmpty(e.boss);if(e.alive&&e.castRemaining>0&&(boss||!string.IsNullOrEmpty(e.miniboss)))windupLive=true;if(e.alive&&e.speed>a.baseSpeed&&game.elapsed>=e.slowUntil&&game.elapsed>=e.rushUntil)a.baseSpeed=e.speed;
    bool tornado=e.boss=="tornado",eyeball=e.boss=="eyeball",zombie=e.boss=="zombie";
    // Jolt is a damped spring on a presentation offset; EnemyState is never written.
    a.joltVel+=(-a.jolt*90-a.joltVel*12)*dt;a.jolt+=a.joltVel*dt;
    // View-only lane spread: up to 0.15 u to either side of the lane (hashed from the id, eased through corners) so a packet reads as a crowd, not a queue. Range rings still match the simulation within that margin.
    if(!boss&&string.IsNullOrEmpty(e.miniboss)&&e.alive&&dt>0){Vector3 fwd=e.direction;fwd.y=0;if(fwd.sqrMagnitude>1e-4f){uint h=(uint)e.id*2654435761u;float k=((h>>8)&1023)/1023f*2-1;Vector3 want=Vector3.Cross(Vector3.up,fwd.normalized)*(k*.15f);a.lane=Vector3.Lerp(a.lane,want,1-Mathf.Exp(-dt*5));}}
    Vector3 position=e.position+a.jolt+a.lane;float bob=0;if(tornado)bob=e.air?.6f+Mathf.Sin(e.age*4)*.05f:Mathf.Sin(e.age*2.2f)*.04f;else if(eyeball)bob=.45f+Mathf.Sin(e.age*3)*.08f;else if(e.air)bob=.7f+Mathf.Sin(e.age*6)*.07f;else if(e.kind=="nibble")bob=Mathf.Abs(Mathf.Sin(e.age*6))*.075f;else if(e.kind=="swarm")bob=Mathf.Abs(Mathf.Sin(e.age*7))*.04f;position.y+=bob+.07f;if(e.hidden&&e.boss!="orchard")position.y-=.4f;
    if(tornado){if(e.alive&&dt>0){a.dustClock+=dt;if(a.dustClock>=.35f){a.dustClock=0;effects.TornadoDust(e.position);}}}
    else if(e.alive&&!e.air&&!e.hidden&&e.speed>0&&!eyeball){float strideRate=a.baseSpeed>0?e.speed/a.baseSpeed:1;float period=boss?.9f:e.kind=="dash"?.28f:e.kind=="shell"?.36f:e.kind=="swarm"?.3f:e.kind=="shaman"?.5f:e.kind=="burrow"?.45f:e.kind=="crystal"||e.kind=="fragment"?.4f:.42f;a.stride+=dt*strideRate;if(a.stride>=period){a.stride=0;effects.FootDust(e.position,boss?6:2,boss?.35f:.17f,boss);}}
    if(!e.alive)a.deadClock+=dt;float dead=e.alive?0:Mathf.Max(e.deadFor,a.deadClock);if(!e.alive)position.y-=.10f*dead;
    a.root.transform.position=position;if(a.shadow!=null){a.shadow.position=e.position+a.lane+Vector3.up*.062f;float shadowScale=e.air?Mathf.Clamp01(1-bob/1.2f):1;a.shadow.localScale=new Vector3(a.shadowSize*shadowScale,a.shadowSize*shadowScale,.01f);a.shadow.gameObject.SetActive(e.alive&&!e.hidden);}
    Vector3 direction=e.direction;direction.y=0;if(direction.sqrMagnitude>.0001f&&e.alive)a.root.transform.rotation=Quaternion.Slerp(a.root.transform.rotation,Quaternion.LookRotation(direction)*(a.expansionActor?Quaternion.Euler(0,180,0):Quaternion.identity),dt*10);
    a.hitRemaining=Mathf.Max(0,a.hitRemaining-dt);float hitAge=.35f-a.hitRemaining;bool hitting=a.hitRemaining>0;
    Vector3 stretch=Vector3.one;if(e.kind=="swarm")stretch=new Vector3(1+Mathf.Sin(e.age*7)*.1f,1-Mathf.Sin(e.age*7)*.12f,1+Mathf.Sin(e.age*7)*.1f);
    if(hitting){float squash=Mathf.Exp(-hitAge*9)*Mathf.Sin(hitAge*28);stretch+=(a.heavyHit?new Vector3(.14f,-.18f,.14f):new Vector3(.16f,-.22f,.16f))*squash*(boss?.4f:1);}
    bool frozen=e.alive&&e.speed<=0&&e.castRemaining<=0&&e.biteRemaining<=0&&!e.hidden;if(frozen)stretch=Vector3.Scale(stretch,new Vector3(1,.97f,1));if(e.hidden&&e.boss=="orchard")stretch=Vector3.Scale(stretch,new Vector3(1.3f,.42f,1.3f));
    float scale=1;if(!e.alive){scale=dead<.08f?1+dead/.08f*.15f:dead<.16f?1.15f-(dead-.08f)/.08f*.15f:1;if(e.kind=="crystal"||e.kind=="fragment")scale=dead>.05f?.001f:scale;if(tornado)scale*=Mathf.Max(.001f,1-EaseOutCubic(Mathf.Clamp01(dead/.7f)));else if(eyeball)scale*=Mathf.Lerp(1,.35f,EaseOutCubic(Mathf.Clamp01(dead/.6f)));}
    // Challenge boss idle motion: the funnel yaw-drifts 20 deg/s with its tiers spinning at 540/470/400/330/260 deg/s (alternating) and the debris rings orbiting at 180 deg/s with a bob; the eye hovers, blinks every 3.2 s, swings its tentacles and dilates during Gaze; the zombie walks with a 6 degree forward lean.
    if(tornado){a.model.localRotation=Quaternion.Euler(0,clock*20,0)*Quaternion.Euler(Mathf.Sin(clock*1.3f)*3,0,Mathf.Cos(clock*1.1f)*3)*a.modelRotation;float spinUp=e.alive?1+(e.castRemaining>0?.5f:0)+(!e.alive?2:0):1+dead*3;
     if(a.funnels!=null)for(int f=0;f<a.funnels.Length;f++){var funnel=a.funnels[f];if(funnel==null)continue;float rate=(540-70*f)*(f%2==0?1:-1)*spinUp;RotatePart(funnel,Quaternion.Euler(0,clock*rate,0));}
     if(a.debrisRings!=null)for(int r=0;r<a.debrisRings.Length;r++){var ring=a.debrisRings[r];if(ring==null)continue;RotatePart(ring,Quaternion.Euler(0,clock*180*(r%2==0?1:-1)+r*120,0));if(!restPositions.TryGetValue(ring,out var rest)){rest=ring.localPosition;restPositions[ring]=rest;}ring.localPosition=rest+Vector3.up*(.12f*Mathf.Sin(clock*2.6f+r*2.1f));}}
    else if(eyeball){if(e.alive&&dt>0)a.blink+=dt;float blinkT=a.blink%3.2f;float lid=blinkT<.28f?Mathf.Sin(blinkT/.28f*Mathf.PI):0;if(!e.alive)lid=Mathf.Clamp01(dead*2);float squint=e.castRemaining>0&&e.ability=="blind"?.35f:0;lid=Mathf.Max(lid,squint);
     if(a.upperLid!=null)RotatePart(a.upperLid,Quaternion.Euler(-62*lid,0,0));if(a.lowerLid!=null)RotatePart(a.lowerLid,Quaternion.Euler(48*lid,0,0));
     bool gazing=e.alive&&e.ability=="gaze"&&(e.castRemaining>0||e.abilityRemaining>0);if(a.pupil!=null){if(!restScales.TryGetValue(a.pupil,out var rest)){rest=a.pupil.localScale;restScales[a.pupil]=rest;}a.pupil.localScale=Vector3.Lerp(a.pupil.localScale,rest*(gazing?1.4f:1),dt>0?1-Mathf.Exp(-dt*8):0);}
     if(a.tentacles!=null)for(int k=0;k<a.tentacles.Length;k++){var tt=a.tentacles[k];if(tt==null)continue;RotatePart(tt,Quaternion.Euler(Mathf.Sin(clock*1.7f+k*1.1f)*12,0,Mathf.Cos(clock*1.3f+k*.8f)*9));}
     a.model.localRotation=Quaternion.Euler(Mathf.Sin(e.age*1.6f)*4+(e.castRemaining>0?-6:0),Mathf.Sin(e.age*.9f)*5,Mathf.Cos(e.age*1.2f)*3)*a.modelRotation;}
    else if(zombie){if(!e.alive)a.model.localRotation=Quaternion.Euler(EaseOutCubic(Mathf.Min(1,dead/.5f))*78,0,Mathf.Sin(dead*5)*6)*a.modelRotation;else a.model.localRotation=Quaternion.Euler(6+Mathf.Sin(e.age*4)*1.5f+(e.castRemaining>0?-5*Mathf.Sin(clock*5):0),0,0)*a.modelRotation;}
    else if(e.castRemaining>0){stretch+=new Vector3(-.025f,.045f,-.025f)*Mathf.Sin(clock*5);if(e.boss=="garden")a.model.localRotation=Quaternion.Euler(-Mathf.Sin(clock*4)*5,0,0)*a.modelRotation;else if(e.boss=="frost")a.model.localRotation=Quaternion.Euler(-8,0,0)*a.modelRotation;else if(e.boss=="orchard")a.model.localRotation=Quaternion.Euler(0,Mathf.Sin(clock*3)*6,0)*a.modelRotation;}
    else if(!e.alive)a.model.localRotation=Quaternion.Euler(EaseOutCubic(Mathf.Min(1,dead/.5f))*78,0,Mathf.Sin(dead*5)*6)*a.modelRotation;
    else a.model.localRotation=Quaternion.Euler(Mathf.Sin(e.age*4)*1.2f,0,0)*a.modelRotation;
    a.model.localScale=Vector3.Scale(a.modelScale,stretch)*Mathf.Max(.001f,scale)*ActorScale;
    float factor=a.baseSpeed>0?Mathf.Clamp(e.speed/a.baseSpeed,.25f,1.6f):1;float animSpeed=dt==0?0:frozen?.15f:(e.speed<=0&&e.castRemaining<=0&&e.biteRemaining<=0&&e.alive)?0:game.speed*viewScale*(e.castRemaining>0||e.biteRemaining>0||!e.alive?1:factor);
    if(a.animation!=null&&e.kind!="asuna")Animate(a,!e.alive?"death":e.biteRemaining>0||e.castRemaining>0?"attack":"walk",animSpeed,factor>.85f&&!zombie);
    float flashAmt=hitting?(hitAge<.06f?1:Mathf.Exp(-(hitAge-.06f)*20))*.55f*(boss?.5f:1):0;
    Color emission=new Color(1,.95f,.85f)*flashAmt;if(e.hidden)emission=e.boss=="orchard"?new Color(.08f,.06f,.02f):new Color(.015f,.014f,.01f);if(e.castRemaining>0)emission+=CarrotEffects.Tone(e.ability)*(.025f+.025f*Mathf.Sin(clock*8));
    bool slowed=e.alive&&game.elapsed<e.slowUntil&&e.slowFactor<1;if(slowed)emission+=new Color(.16f,.3f,.5f)*(1-e.slowFactor);
    Color tint=slowed?Color.Lerp(Color.white,new Color(.62f,.82f,1),.6f):Color.white;
    // Bark armour: the boss glows bark-orange for the whole armour window; the mantle shield reads as an icy tint.
    bool armoured=boss&&e.alive&&e.ability=="bark"&&e.abilityRemaining>0&&e.castRemaining<=0;if(armoured){emission+=new Color(.55f,.3f,.08f)*(.22f+.12f*Mathf.Sin(clock*6));tint=Color.Lerp(tint,new Color(1,.8f,.55f),.35f);}
    if(boss&&e.alive&&e.shield>0)tint=Color.Lerp(tint,new Color(.7f,.88f,1),.5f);if(e.hidden&&e.boss=="orchard")tint=new Color(.88f,.72f,.38f);
    if(boss)effects.BossAura(e.position,e.boss,CarrotEffects.Tone(e.boss),e.alive&&!e.hidden,dt);
    float dissolve=!e.alive&&!(e.kind=="crystal"||e.kind=="fragment")?Mathf.Clamp01((dead-.3f)/.5f):0;if(e.hidden&&e.ability=="reincarnate")dissolve=Mathf.Sin(Mathf.Clamp01(1-e.castRemaining/2.2f)*Mathf.PI)*.9f;
    // The tornado's slate and the zombie's grave green are baked into their materials now (characters stream, OKLab dE 0.004 and
    // 0.001 against the old per-frame tints), so only the gameplay glows remain here: Gust's cold glow, the zombie's casting sockets.
    if(tornado){if(e.ability=="gust"&&e.abilityRemaining>0&&e.alive)emission+=new Color(.5f,.6f,.8f)*.15f;}
    else if(zombie){if(e.castRemaining>0)emission+=new Color(.2f,.5f,.2f)*.1f;}
    AnimateExpansionEnemy(a,e,dt,dead,ref tint,ref emission);AnimatePrismEnemy(a,e,dt,dead);
    // 60 ms white hit flash on the victim (Storybook _HitFlash) and a rim lift so creatures separate from night ground.
    float hitFlash=hitting&&hitAge<.06f?.42f*(boss?.5f:1):0;Surface(a,emission,tint,dissolve,a.tone,hitFlash,nightRim);
    // The eye's iris burns crimson three times brighter while the screen is dark (it also stays visible through the overlay's hole).
    if(eyeball&&a.iris!=null){bool dark=game.elapsed<game.blindUntil;properties.Clear();properties.SetColor("_EmissionColor",dark?new Color(2.4f,.5f,.9f):new Color(.8f,.15f,.3f)*(e.castRemaining>0?1.6f:1));properties.SetColor("_Color",tint);properties.SetFloat("_Dissolve",dissolve);properties.SetColor("_DissolveEdge",a.tone);foreach(var r in a.iris)if(r!=null)r.SetPropertyBlock(properties);}
    var col=a.root.GetComponent<Collider>();col.enabled=e.alive&&!e.hidden;}
   effects.RoutineDim=windupLive?.6f:1;RemoveMissing(enemies,seen);bool anyBoss=false;foreach(var e in game.enemies)if(!string.IsNullOrEmpty(e.boss)){anyBoss=true;break;}if(!anyBoss)effects.BossAura(Vector3.zero,"",Color.white,false,0);seen.Clear();foreach(var b in game.blockers){seen.Add(b.id);if(!blockers.TryGetValue(b.id,out var a)){a=CreateBlocker(b);blockers[b.id]=a;}a.root.transform.position=new Vector3(b.position.x,TerrainHeight(b.position)+.015f,b.position.z);}RemoveMissing(blockers,seen);
   foreach(var pair in pads){bool occupied=false;foreach(var t in game.towers)if(t.pad==pair.Key){occupied=true;break;}if(!occupied)foreach(var b in game.blockers)if(b.pad==pair.Key){occupied=true;break;}pair.Value.GetComponent<SphereCollider>().enabled=!occupied;}
  }
  Actor CreateBlocker(BlockerState b){var root=new GameObject("Scenery "+b.kind);root.transform.SetParent(world,false);var material=Material("block-"+b.kind,b.kind=="root"?new Color(.39f,.4f,.18f):game.level.biome=="frost"?new Color(.73f,.84f,.91f):new Color(.52f,.43f,.27f),b.kind=="root"?2:1);if(b.kind=="root"){for(int i=0;i<5;i++){float angle=i*Mathf.PI*2/5;var twig=Primitive("Snare knot",PrimitiveType.Capsule,new Vector3(Mathf.Cos(angle)*.15f,.25f,Mathf.Sin(angle)*.15f),new Vector3(.13f,.32f,.13f),material,root.transform);twig.transform.localRotation=Quaternion.Euler(32,angle*Mathf.Rad2Deg,24);}}
   else if(game.level.biome=="orchard"){
    if(b.kind=="hedge"){var straw=Material("straw",new Color(.80f,.68f,.30f),2,.18f);var bale=Primitive("Hay bale",PrimitiveType.Cylinder,new Vector3(0,.28f,0),new Vector3(.56f,.36f,.56f),straw,root.transform);bale.transform.localRotation=Quaternion.Euler(0,35,90);var top=Primitive("Hay bale",PrimitiveType.Cylinder,new Vector3(.05f,.72f,.05f),new Vector3(.42f,.3f,.42f),straw,root.transform);top.transform.localRotation=Quaternion.Euler(0,120,90);}
    else if(b.kind=="stump"){var wood=Material("crate-wood",new Color(.55f,.38f,.20f),2,.22f);var c1=Primitive("Crate",PrimitiveType.Cube,new Vector3(-.16f,.2f,.04f),Vector3.one*.4f,wood,root.transform);c1.transform.localRotation=Quaternion.Euler(0,12,0);var c2=Primitive("Crate",PrimitiveType.Cube,new Vector3(.2f,.2f,-.06f),Vector3.one*.4f,wood,root.transform);c2.transform.localRotation=Quaternion.Euler(0,-20,0);var c3=Primitive("Crate",PrimitiveType.Cube,new Vector3(0,.58f,0),Vector3.one*.36f,wood,root.transform);c3.transform.localRotation=Quaternion.Euler(0,30,0);}
    else Pumpkin(Vector3.zero,.95f,root.transform,40);
   }else{GameObject prefab=Scan(b.kind.Contains("stump")?"Stump":"MossRockA",false);if(prefab==null)foreach(var n in nature)if(n.name.ToLowerInvariant().Contains(b.kind.Contains("stump")?"stump":"rock")){prefab=n;break;}if(prefab!=null){var model=Instantiate(prefab,root.transform);float h=BoundsOf(model).size.y;model.transform.localScale*=.6f/Mathf.Max(.1f,h);model.transform.position-=Vector3.up*BoundsOf(model).min.y;foreach(var c in model.GetComponentsInChildren<Collider>())Destroy(c);}else{for(int i=0;i<3;i++){var rock=Primitive("Mossy obstacle",PrimitiveType.Sphere,new Vector3((i-1)*.15f,.2f+i*.05f,0),new Vector3(.4f,.45f,.43f),material,root.transform);rock.transform.localRotation=Quaternion.Euler(i*18,i*44,16);}}}var a=new Actor{root=root,model=root.transform,kind=b.kind,modelScale=Vector3.one,renderers=root.GetComponentsInChildren<Renderer>()};if(!CarrotQuality.Rich)foreach(var r in a.renderers){if(r==null)continue;if(r.shadowCastingMode==ShadowCastingMode.ShadowsOnly)r.enabled=false;else r.shadowCastingMode=ShadowCastingMode.Off;}Clickable(a,"blocker",b.id,.75f);return a;}
  void RemoveMissing(Dictionary<int,Actor> actors,HashSet<int> ids){removeIds.Clear();foreach(var item in actors)if(!ids.Contains(item.Key))removeIds.Add(item.Key);foreach(int id in removeIds){Destroy(actors[id].root);actors.Remove(id);}}
  void Flash(Actor actor,Color c){Surface(actor,c,Color.white,0,Color.black);}
  static bool ColorNear(Color a,Color b){return Mathf.Abs(a.r-b.r)+Mathf.Abs(a.g-b.g)+Mathf.Abs(a.b-b.b)<.004f;}
  /// <summary>Per-actor property block: emission, tint, dissolve and, for the characters' Storybook surface, the 60 ms `_HitFlash` and the night `_RimBoost`. Skipped when nothing changed.</summary>
  void Surface(Actor actor,Color emission,Color tint,float dissolve,Color edge,float hitFlash=0,float rim=0){if(actor.lastDissolve==dissolve&&actor.lastHitFlash==hitFlash&&actor.lastRim==rim&&ColorNear(actor.lastEmission,emission)&&ColorNear(actor.lastTint,tint))return;actor.lastEmission=emission;actor.lastTint=tint;actor.lastDissolve=dissolve;actor.lastHitFlash=hitFlash;actor.lastRim=rim;bool plain=emission.maxColorComponent<.001f&&ColorNear(tint,Color.white)&&dissolve<=0&&hitFlash<=0&&rim<=0;properties.Clear();if(!plain){properties.SetColor("_EmissionColor",emission);properties.SetColor("_Color",tint);properties.SetFloat("_Dissolve",dissolve);properties.SetColor("_DissolveEdge",edge);properties.SetFloat("_HitFlash",hitFlash);properties.SetFloat("_RimBoost",rim);}foreach(var r in actor.renderers)if(r!=null)r.SetPropertyBlock(plain?null:properties);}
  static float EaseOut(float t){return 1-(1-t)*(1-t);}
  static float EaseOutCubic(float t){return 1-Mathf.Pow(1-t,3);}
  static float Bounce(float t){const float n1=7.5625f,d1=2.75f;if(t<1/d1)return n1*t*t;if(t<2/d1){t-=1.5f/d1;return n1*t*t+.75f;}if(t<2.5f/d1){t-=2.25f/d1;return n1*t*t+.9375f;}t-=2.625f/d1;return n1*t*t+.984375f;}
  void OnEffect(CarrotEvent e){
   if(e.type=="level"){levelId=-1;return;}
   ExpansionEvent(e);PrismEvent(e);
   // Combat positions lie on the ground; the render event aims at the physical muzzle and airborne body.
   var visual=new CarrotEvent(e.type,e.kind,e.position,e.to,e.id,e.target,e.tier,e.value,e.duration);
   if(e.type=="shot"){
    // Shots leave the physical muzzle; chained hops and bounces leave the previous target's body.
    if(towers.TryGetValue(e.id,out var source)&&Vector3.Distance(source.root.transform.position-Vector3.up*.02f,e.position)<.3f){
     if(source.muzzle!=null)visual.position=source.muzzle.position;
     else visual.position=e.position+Vector3.up*.72f;
     source.lastShotClock=clock;
    }else visual.position=AirPoint(e.position,e.id)+Vector3.up*.3f;
    visual.to=AirPoint(e.to,e.target)+Vector3.up*.28f+LaneOf(e.target);
   }else if(e.type=="hit"||e.type=="impact"){
    Vector3 lane=LaneOf(e.target);visual.position=AirPoint(e.position,e.target)+lane;visual.to=AirPoint(e.to,e.target)+lane;
   }else if(e.type=="ability"&&e.kind=="prismFocus")visual.to=AirPoint(e.to,e.target);
   if(e.type=="bossEnter")effects.EntranceBoss=e.kind;
   // Route pulses: the announced wave (balance contract v2 waveIncoming: kind air|ground|boss|mini, target = route); before that contract, every wave start pulses all lanes.
   if(e.type=="waveIncoming"){sawWaveIncoming=true;StartRoutePulse(e.target,e.kind=="air");}else if(e.type=="wave"&&!sawWaveIncoming)StartRoutePulse(-1,false);
   if(!(e.type=="bossEnter"&&bossEntrance!=null))effects.Handle(visual);sound.Handle(e);
   if(e.type=="ability"&&e.kind=="rewind"&&enemies.TryGetValue(e.target,out var rewinding))effects.Echo(rewinding.root,e.position,e.to,e.duration);
   if(e.type=="bossEnter"){bossIntro=2.6f;bossFocus=e.position;if(bossEntrance!=null)pendingBoss=e.id;}
   if(e.type=="carrotHit"){carrotHit=.6f;carrotHitDir=e.position-carrotPosition;carrotHitDir.y=0;}
   if(e.type=="hit"&&enemies.TryGetValue(e.target,out var a)){a.hitRemaining=.35f;a.heavyHit=e.kind=="mortar"||e.kind=="thunder"||e.kind=="dragonfruit";bool big=a.kind=="garden"||a.kind=="marsh"||a.kind=="frost"||a.kind=="orchard"||a.kind=="tornado"||a.kind=="zombie"||a.kind=="eyeball"||a.kind=="portal"||a.kind=="asuna"||CarrotEffects.ExpansionMini(a.kind);if(towers.TryGetValue(e.id,out var src)){Vector3 d=e.position-src.root.transform.position;d.y=0;if(d.sqrMagnitude>.01f)a.jolt=d.normalized*(big?.025f:.07f);}PlayHit(a);sound.Creature(a.kind,"hit",e.position);}
   // Telegraph marks: Super emblems dim within 2 u of a live telegraph; a blind-type windup cancels an in-progress merge drag.
   if(e.type=="telegraph"||e.type=="telegraphTarget"){marks.Add(new Mark{position=e.to==Vector3.zero?e.position:e.to,until=clock+Mathf.Max(.5f,e.duration)});if(e.type=="telegraph"&&(e.kind=="blind"||e.kind=="whiteout"||e.kind=="dusk"||e.kind=="blackout")&&mergeDrag)CancelMerge(true);}
   if(e.type=="ability"&&(e.kind=="blind"||e.kind=="whiteout"||e.kind=="dusk"||e.kind=="blackout")){sound.Duck(Mathf.Max(1,e.value));if(mergeDrag)CancelMerge(true);}
   // Uproot commit: the removed tower's actor leaves the dictionary before RemoveMissing sees it and is yanked out of the ground (a demoted Super respawns at tier 4 through the tier-change path, its crown pieces flying off in the effects recipe).
   if((e.type=="ability"||e.type=="abilityTarget")&&e.kind=="uproot"&&e.tier<5&&towers.TryGetValue(e.target,out var torn)){towers.Remove(e.target);if(torn.rig!=null)torn.rig.enabled=false;var click=torn.root.GetComponent<CarrotClickable>();if(click!=null)Destroy(click);var collider=torn.root.GetComponent<Collider>();if(collider!=null)collider.enabled=false;if(torn.shadow!=null)torn.shadow.gameObject.SetActive(false);yanks.Add(new Yank{root=torn.root,start=clock,position=torn.root.transform.position,rotation=torn.root.transform.rotation});if(mergeDrag&&(mergeSource==e.target||mergeTarget==e.target))CancelMerge(true);}
   // Super merge: the kind-4 ghost flies from the source pad to the target over 0.45 s; the burst at the target is in CarrotEffects.
   if(e.type=="merge"){if(mergeDrag)CancelMerge(false);StartFlight(e.kind,4,e.to,e.position);}
  }
  void StartFlight(string kind,int tier,Vector3 from,Vector3 to){var g=Ghost(kind,tier);if(g==null)return;if(flightGhost!=null&&flightGhost!=g)flightGhost.SetActive(false);flightGhost=g;flightRenderers=ghostRenderers[kind+"-"+tier];flightFrom=new Vector3(from.x,TerrainHeight(from)+.02f,from.z);flightTo=new Vector3(to.x,TerrainHeight(to)+.02f,to.z);flightClock=0;g.SetActive(true);g.transform.position=flightFrom;}
  Vector3 LaneOf(int id){return enemies.TryGetValue(id,out var a)?a.lane:Vector3.zero;}
  Vector3 AirPoint(Vector3 p,int preferred){
   foreach(var enemy in game.enemies){if(!enemy.air)continue;if(enemy.id!=preferred&&Vector3.Distance(enemy.position,p)>.18f)continue;if(Vector3.Distance(enemy.position,p)>.6f)continue;return p+Vector3.up*(.7f+Mathf.Sin(enemy.age*6)*.07f);}
   return p;
  }
  LineRenderer CreateRing(string name,Color color,float width){var go=new GameObject(name);go.transform.SetParent(transform,false);var line=go.AddComponent<LineRenderer>();line.sharedMaterial=new Material(Shader.Find("Carrot/FxAdditive"));line.sharedMaterial.SetColor("_Color",Color.white);line.startColor=line.endColor=color;line.positionCount=65;line.loop=true;line.useWorldSpace=true;line.widthMultiplier=width;line.shadowCastingMode=ShadowCastingMode.Off;line.receiveShadows=false;line.enabled=false;materials["ring-"+name]=line.sharedMaterial;return line;}
  readonly Dictionary<string,GameObject> ghosts=new Dictionary<string,GameObject>();readonly Dictionary<string,Renderer[]> ghostRenderers=new Dictionary<string,Renderer[]>();GameObject activeGhost;
  /// <summary>A hologram of a tower (tier 1 for the build preview, tier 4 for the merge drag and the merge flight): the prefab with every material swapped for an additive tint. Built once per kind and tier on first use (a UI action, never per frame), keyed "kind-tier".</summary>
  GameObject Ghost(string kind,int tier=1){if(string.IsNullOrEmpty(kind))return null;string key=kind+"-"+tier;if(ghosts.TryGetValue(key,out var g))return g;var prefab=Resources.Load<GameObject>("Carrot/Models/Towers/"+kind+"-"+tier);if(prefab==null){ghosts[key]=null;return null;}if(!materials.TryGetValue("ghost",out var ghostMaterial)){ghostMaterial=new Material(Shader.Find("Carrot/FxAdditive"));ghostMaterial.SetFloat("_UseAtlas",0);ghostMaterial.SetFloat("_Soft",0);materials["ghost"]=ghostMaterial;}g=Instantiate(prefab,transform);g.name="Ghost "+key;foreach(var c in g.GetComponentsInChildren<Collider>(true))Destroy(c);foreach(var c in g.GetComponentsInChildren<Animation>(true))Destroy(c);foreach(var c in g.GetComponentsInChildren<Animator>(true))Destroy(c);var rs=g.GetComponentsInChildren<Renderer>(true);foreach(var r in rs){var mats=r.sharedMaterials;for(int i=0;i<mats.Length;i++)mats[i]=ghostMaterial;r.sharedMaterials=mats;r.shadowCastingMode=ShadowCastingMode.Off;r.receiveShadows=false;}g.SetActive(false);ghosts[key]=g;ghostRenderers[key]=rs;return g;}
  void UpdateSelection(){Vector3 p=Vector3.zero;float range=0,radius=.49f;bool valid=false;TowerDef preview=null;if(game.selectionType=="pad"&&game.selectionId>=0&&game.selectionId<game.level.pads.Length){p=game.level.pads[game.selectionId];preview=CarrotData.Tower(game.PreviewKind);if(preview!=null)range=preview.range[0];valid=true;}else if(game.selectionType=="tower"){foreach(var t in game.towers)if(t.id==game.selectionId){p=t.position;range=CarrotData.Tower(t.kind).range[t.tier-1];valid=true;break;}}else if(game.selectionType=="enemy"){foreach(var e in game.enemies)if(e.id==game.selectionId&&e.alive){p=e.position;radius=string.IsNullOrEmpty(e.boss)?.4f:.85f;valid=true;break;}}else if(game.selectionType=="blocker"){foreach(var b in game.blockers)if(b.id==game.selectionId){p=b.position;valid=true;break;}}selectionRing.enabled=valid;rangeRing.enabled=valid&&range>0;if(valid){PlotRing(selectionRing,p,radius+.015f*Mathf.Sin(clock*4),.16f);if(range>0)PlotRing(rangeRing,p,range,.12f);}
   GameObject wanted=valid&&preview!=null?Ghost(preview.id):null;if(activeGhost!=wanted){if(activeGhost!=null)activeGhost.SetActive(false);activeGhost=wanted;if(activeGhost!=null)activeGhost.SetActive(true);}
   if(activeGhost!=null){activeGhost.transform.position=new Vector3(p.x,TerrainHeight(p)+.02f,p.z);activeGhost.transform.localScale=Vector3.one*ActorScale;bool affordable=game.coins>=preview.cost[0];Color gc=affordable?new Color(.35f,1,.5f,.6f):new Color(1,.35f,.3f,.6f);gc.a*=.8f+.2f*Mathf.Sin(clock*5);properties.Clear();properties.SetColor("_Color",gc);foreach(var r in ghostRenderers[preview.id+"-1"])if(r!=null)r.SetPropertyBlock(properties);}
   UpdateMergeVisuals();}
  // ---- Super merge drag (desktop press-and-drag on a tier-4 tower with a twin; touch: a 0.35 s stationary hold arms it, then the drag) ----
  int Partners(int towerId,out TowerState source){source=null;foreach(var t in game.towers)if(t.id==towerId){source=t;break;}if(source==null||source.tier!=4)return 0;int n=0;foreach(var o in game.towers)if(o.id!=source.id&&o.kind==source.kind&&o.tier==4)n++;return n;}
  bool IsPartner(TowerState source,TowerState other){return other!=null&&source!=null&&other.id!=source.id&&other.kind==source.kind&&other.tier==4;}
  TowerState TowerById(int id){foreach(var t in game.towers)if(t.id==id)return t;return null;}
  CarrotClickable ClickableAt(Vector2 point){Physics.SyncTransforms();Ray ray=GameCamera.ScreenPointToRay(point);var hits=Physics.RaycastAll(ray,100);Array.Sort(hits,(a,b)=>a.distance.CompareTo(b.distance));foreach(var hit in hits){var target=hit.collider.GetComponentInParent<CarrotClickable>();if(target!=null)return target;}return null;}
  void BeginMergeDrag(int sourceId){var source=TowerById(sourceId);if(source==null)return;mergeDrag=true;mergeSource=sourceId;mergeTarget=0;holdArmed=false;holdLift=0;game.Select("",-1);mergeGhost=Ghost(source.kind,4);if(mergeGhost!=null){mergeGhostRenderers=ghostRenderers[source.kind+"-4"];mergeGhost.SetActive(true);}sound.UiSound("open");}
  /// <summary>Ends a merge drag: the ghost snaps back to the source pad over 0.25 s and the source is re-selected (`reselect`), or just vanishes after a merge command.</summary>
  void CancelMerge(bool reselect){if(!mergeDrag){pressTower=0;holdArmed=false;holdLift=0;return;}mergeDrag=false;int src=mergeSource;mergeSource=0;mergeTarget=0;pressTower=0;holdArmed=false;holdLift=0;foreach(var ring in partnerRings)if(ring!=null)ring.enabled=false;if(superRing!=null)superRing.enabled=false;
   if(mergeGhost!=null){var source=TowerById(src);if(reselect&&source!=null&&game!=null){snapFrom=mergeGhost.transform.position;snapBack=0;snapKind=source.kind;flightGhost=mergeGhost;flightRenderers=mergeGhostRenderers;flightFrom=snapFrom;flightTo=new Vector3(source.position.x,TerrainHeight(source.position)+.02f,source.position.z);flightClock=.2f;}else mergeGhost.SetActive(false);mergeGhost=null;}
   if(reselect&&src>0&&game!=null&&TowerById(src)!=null)game.Select("tower",src);}
  void UpdateMergeVisuals(){
   if(!mergeDrag){foreach(var ring in partnerRings)if(ring!=null)ring.enabled=false;if(superRing!=null)superRing.enabled=false;
    // Touch hold cue: the pressed tower rises 0.15 u once the 0.35 s stationary hold arms the drag.
    if(pressTower>0&&towers.TryGetValue(pressTower,out var pressed)){float want=holdArmed?.15f:0;holdLift=Mathf.Lerp(holdLift,want,1-Mathf.Exp(-Time.deltaTime*18));pressed.root.transform.position+=Vector3.up*holdLift;}
    return;}
   var source=TowerById(mergeSource);if(source==null){CancelMerge(false);return;}var def=CarrotData.Tower(source.kind);
   // The source's own range ring in a red fade; pulsing rings on every valid partner (pool of six); the target's Super ring in gold when snapped.
   rangeRing.enabled=true;float fade=.45f+.3f*Mathf.Sin(clock*4);rangeRing.startColor=rangeRing.endColor=new Color(1,.35f,.3f,fade);PlotRing(rangeRing,source.position,def.range[3],.12f);
   int used=0;foreach(var o in game.towers){if(!IsPartner(source,o)||used>=partnerRings.Length)continue;var ring=partnerRings[used++];ring.enabled=true;float r=.62f+.04f*Mathf.Sin(clock*5+o.id);ring.startColor=ring.endColor=o.id==mergeTarget?new Color(1,.85f,.35f,.95f):new Color(.5f,1,.7f,.65f+.3f*Mathf.Sin(clock*5+o.id));PlotRing(ring,o.position,r,.14f);}
   for(int i=used;i<partnerRings.Length;i++)partnerRings[i].enabled=false;
   superRing.enabled=mergeTarget>0;if(mergeTarget>0){var target=TowerById(mergeTarget);if(target!=null)PlotRing(superRing,target.position,def.range[4],.13f);}
   if(mergeGhost!=null){Color gc=mergeTarget>0?new Color(.35f,1,.6f,.7f):new Color(1,1,1,.55f);gc.a*=.85f+.15f*Mathf.Sin(clock*6);properties.Clear();properties.SetColor("_Color",gc);foreach(var r in mergeGhostRenderers)if(r!=null)r.SetPropertyBlock(properties);}
  }
  /// <summary>Moves the merge ghost to the pointer's ground point, snapping to a partner within 0.6 u (0.8 u in portrait); returns the snapped partner id or 0.</summary>
  void DragMergeTo(Vector2 screen){if(!mergeDrag||mergeGhost==null)return;if(!GroundPoint(screen,out var ground))return;var source=TowerById(mergeSource);if(source==null)return;float snap=portraitCamera?.8f:.6f;int best=0;float bestD=snap;foreach(var o in game.towers){if(!IsPartner(source,o))continue;float d=Vector2.Distance(new Vector2(o.position.x,o.position.z),new Vector2(ground.x,ground.z));if(d<bestD){bestD=d;best=o.id;}}
   if(best!=mergeTarget&&best>0)sound.UiSound("click");mergeTarget=best;Vector3 at=best>0?TowerById(best).position:ground;mergeGhost.transform.position=new Vector3(at.x,TerrainHeight(at)+.02f+(best>0?.08f:.2f),at.z);mergeGhost.transform.localScale=Vector3.one*ActorScale;}
  void ReleaseMerge(Vector2 screen){if(!mergeDrag)return;int src=mergeSource;int target=mergeTarget;
   if(target==0){var hit=ClickableAt(screen);if(hit!=null&&hit.type=="tower"&&hit.id!=src)target=hit.id;}   // another tower: merge is still sent and the simulation's notice explains
   if(target>0){CancelMerge(false);game.Command("{\"type\":\"merge\",\"id\":"+src+",\"target\":"+target+"}");}
   else CancelMerge(true);}
  static void PlotRing(LineRenderer l,Vector3 p,float radius,float y){for(int i=0;i<65;i++){float angle=i*Mathf.PI*2/64;l.SetPosition(i,p+new Vector3(Mathf.Cos(angle)*radius,y,Mathf.Sin(angle)*radius));}}
  public void ResetView(string unused){targetZoom=1;targetPan=Vector3.zero;pointerDown=dragging=false;pinchDistance=0;followBoss=-1;panNudged=false;}
  void FitCamera(){
   lastWidth=Screen.width;lastHeight=Screen.height;
   #if UNITY_WEBGL && !UNITY_EDITOR
   float cssWidth=Carrot_CanvasCSSWidth();inputPixelScale=cssWidth>0?Screen.width/cssWidth:1;
   #endif
   bool portrait=GameCamera.aspect<.85f;
   if(portrait!=portraitCamera){zoom=targetZoom=1;pan=targetPan=Vector3.zero;pointerDown=dragging=false;pinchDistance=0;}
   portraitCamera=portrait;if(PrismStage){FitPrismCamera();return;}cameraAngle=portrait?Quaternion.Euler(50,88,0):Quaternion.Euler(34,-9,0);cameraTarget=new Vector3(0,.35f,.2f);fitDistance=0;
   float tangent=Mathf.Tan(GameCamera.fieldOfView*Mathf.Deg2Rad*.5f),aspect=Mathf.Max(.3f,GameCamera.aspect);
   if(portrait){
    // Rotate the long world axis into the tall viewport, then fit actual gameplay rather than scenery.
    Vector3 min=new Vector3(100,0,100),max=new Vector3(-100,0,-100);
    foreach(var route in game.level.routes)foreach(var point in route){min=Vector3.Min(min,point);max=Vector3.Max(max,point);}
    foreach(var point in game.level.pads){min=Vector3.Min(min,point);max=Vector3.Max(max,point);}
    cameraTarget=(min+max)*.5f+Vector3.up*.40f;
    float actorHeight=string.IsNullOrEmpty(game.level.boss)?1.8f:2.65f;
    // A 50 degree tilt keeps the diorama three-dimensional on a phone; the fit is tighter and the overflow is reachable by panning at zoom 1.
    foreach(var route in game.level.routes)foreach(var point in route)FitEnvelope(point,.66f,actorHeight,tangent,aspect,.96f,.86f);
    foreach(var point in game.level.pads)FitEnvelope(point,.57f,1.85f,tangent,aspect,.96f,.86f);
    fitDistance+=.2f;
   }else{
    for(int x=-1;x<=1;x+=2)for(int z=-1;z<=1;z+=2)for(int y=0;y<=1;y++){
     Vector3 local=Quaternion.Inverse(cameraAngle)*(new Vector3(x*7.65f,y*2.25f,z*5.65f)-cameraTarget);
     fitDistance=Mathf.Max(fitDistance,Mathf.Max(Mathf.Abs(local.y)/tangent,Mathf.Abs(local.x)/(tangent*aspect))-local.z);
    }
    fitDistance+=.9f;
   }
  }
  void FitEnvelope(Vector3 point,float radius,float height,float tangent,float aspect,float safeX,float safeY){
   for(int x=-1;x<=1;x+=2)for(int z=-1;z<=1;z+=2)for(int y=0;y<=1;y++){
    Vector3 local=Quaternion.Inverse(cameraAngle)*(point+new Vector3(x*radius,y*height,z*radius)-cameraTarget);
    fitDistance=Mathf.Max(fitDistance,Mathf.Max(Mathf.Abs(local.y)/(tangent*safeY),Mathf.Abs(local.x)/(tangent*aspect*safeX))-local.z);
   }
  }
  void UpdateCamera(float dt,float viewDt){
   if(Screen.width!=lastWidth||Screen.height!=lastHeight){FitCamera();SnapCamera();}zoom=Mathf.Lerp(zoom,targetZoom,1-Mathf.Exp(-dt*10));pan=Vector3.Lerp(pan,targetPan,1-Mathf.Exp(-dt*10));
   fovPunch=reducedMotion?0:Mathf.Max(0,fovPunch-viewDt*4);
   // Gaussian depth of field follows the live camera distance so only the far field softens (the hero shot and orbit sit much closer).
   if(grade!=null&&grade.profile!=null&&grade.profile.TryGet<DepthOfField>(out var dofLive)){float d=Vector3.Distance(GameCamera.transform.position,cameraTarget+pan);dofLive.gaussianStart.value=d+6;dofLive.gaussianEnd.value=d+24;}
   // The play rig: Cinemachine damps toward it every frame and the impulse listener adds shaped shakes.
   rig.position=cameraTarget+pan;float push=defeatClock>=0&&!reducedMotion?Mathf.Lerp(1,.92f,Mathf.Clamp01(defeatClock/1.4f)):1;body.m_FollowOffset=-(cameraAngle*Vector3.forward)*(fitDistance*push/zoom);vcamPlay.transform.rotation=cameraAngle;vcamPlay.m_Lens.FieldOfView=38-fovPunch*(portraitCamera?1:1.6f);
   if(carrot!=null){Vector3 face=GameCamera.transform.position-carrotPosition;face.y=0;if(face.sqrMagnitude>.01f)carrot.root.transform.rotation=Quaternion.Slerp(carrot.root.transform.rotation,Quaternion.LookRotation(face)*Quaternion.Euler(0,180,0),1-Mathf.Exp(-dt*10));}
  }
  bool GroundPoint(Vector2 screen,out Vector3 point){var ray=GameCamera.ScreenPointToRay(screen);var plane=new Plane(Vector3.up,Vector3.zero);if(plane.Raycast(ray,out var distance)){point=ray.GetPoint(distance);return true;}point=Vector3.zero;return false;}
  /// <summary>Pan limits: the route and pad bounds plus 3 u, scaled by how far the view is zoomed in (portrait keeps its extra reach);
  /// at the fitted landscape zoom the view stays centred unless the safe area nudged it (`nudge`).</summary>
  void ClampPan(bool nudge=false){if(PrismStage){ClampPrismPan();return;}if(nudge)panNudged=true;float fraction=Mathf.Max(0,1-1/targetZoom);float extra=portraitCamera?1.7f:0;
   Vector3 centre=(routeMin+routeMax)*.5f-new Vector3(cameraTarget.x,0,cameraTarget.z);float reach=Mathf.Min(1,fraction*2.2f);float hx=(routeMax.x-routeMin.x)*.5f+3,hz=(routeMax.z-routeMin.z)*.5f+3;float lx=hx*reach+extra,lz=hz*reach+extra;if(panNudged){lx=Mathf.Max(lx,2.5f);lz=Mathf.Max(lz,2.5f);}
   targetPan.x=Mathf.Clamp(targetPan.x,centre.x-lx,centre.x+lx);targetPan.z=Mathf.Clamp(targetPan.z,centre.z-lz,centre.z+lz);targetPan.y=0;if(targetZoom<=1.015f&&!portraitCamera&&!panNudged&&followBoss<0)targetPan=Vector3.zero;}
  void UpdateInput(){
   if(Input.touchCount>=2){
    Touch a=Input.GetTouch(0),b=Input.GetTouch(1);float distance=Vector2.Distance(a.position,b.position);Vector2 midpoint=(a.position+b.position)*.5f;
    if(pinchDistance>0){ZoomAt(midpoint,targetZoom*distance/pinchDistance);Vector2 previous=midpoint-(a.deltaPosition+b.deltaPosition)*.5f;if(targetZoom>1.015f&&GroundPoint(previous,out var from)&&GroundPoint(midpoint,out var to)){targetPan+=from-to;followBoss=-1;}ClampPan();}
    pinchDistance=distance;pointerDown=false;dragging=false;suppressTouchClick=true;return;
   }
   pinchDistance=0;if(suppressTouchClick){if(Input.touchCount==0)suppressTouchClick=false;else return;}
   bool down=Input.GetMouseButtonDown(0),held=Input.GetMouseButton(0),up=Input.GetMouseButtonUp(0);Vector2 p=Input.mousePosition;bool touch=Input.touchCount==1;
   if(touch){var t=Input.GetTouch(0);p=t.position;down=t.phase==TouchPhase.Began;held=t.phase==TouchPhase.Moved||t.phase==TouchPhase.Stationary||down;up=t.phase==TouchPhase.Ended;if(t.phase==TouchPhase.Canceled){pointerDown=false;CancelMerge(true);return;}}
   // Merge drag cancels: the button no longer held, a pause or phase change, the source gone, blindness starting (the view never merges in the dark).
   if(mergeDrag&&(!held&&!up||game.paused!=wasPaused||game.phase!="playing"&&game.phase!="ready"||TowerById(mergeSource)==null||game.blindUntil>game.elapsed))CancelMerge(true);wasPaused=game.paused;
   if(Input.GetKeyDown(KeyCode.M)&&game.selectionType=="tower"&&!mergeDrag)game.Command("{\"type\":\"mergeArm\",\"id\":"+game.selectionId+"}");
   if(down){pointerStart=pointerPrevious=p;pointerDown=true;dragging=false;pointerDownAt=Time.unscaledTime;sound.Unlock();pressTower=0;holdArmed=false;pressTouch=touch;
    // A press on a fully grown tower with a twin is a merge-drag candidate; towers without a partner never arm.
    if(game.phase=="playing"||game.phase=="ready"){var hit=ClickableAt(p);if(hit!=null&&hit.type=="tower"&&Partners(hit.id,out _)>0&&game.blindUntil<=game.elapsed){pressTower=hit.id;pressClock=clock;}}}
   float dragThreshold=(portraitCamera?8:10)*inputPixelScale;
   if(held&&pointerDown&&mergeDrag){DragMergeTo(p);pointerPrevious=p;}
   else if(held&&pointerDown){bool moved=(p-pointerStart).sqrMagnitude>dragThreshold*dragThreshold;
    if(pressTower>0&&touch&&!holdArmed&&!dragging&&!moved&&clock-pressClock>=.35f){holdArmed=true;sound.UiSound("click");}   // lift cue: the tower rises 0.15 u (UpdateMergeVisuals) with a tick
    if(pressTower>0&&moved&&(!touch||holdArmed)&&TowerById(pressTower)!=null){int id=pressTower;pressTower=0;BeginMergeDrag(id);DragMergeTo(p);pointerPrevious=p;}
    else{if(moved){dragging=true;if(touch&&!holdArmed)pressTower=0;}if(dragging&&(targetZoom>1.015f||portraitCamera)&&GroundPoint(pointerPrevious,out var from)&&GroundPoint(p,out var to)){targetPan+=from-to;followBoss=-1;panNudged=false;ClampPan();}pointerPrevious=p;}}
   if(up&&pointerDown){pointerDown=false;bool armed=holdArmed;pressTower=0;holdArmed=false;if(mergeDrag)ReleaseMerge(p);else if(!dragging)SelectAt(p);else if(armed)SelectAt(pointerStart);}
   float scroll=Input.mouseScrollDelta.y;if(Mathf.Abs(scroll)>.01f)ZoomAt(Input.mousePosition,targetZoom+scroll*.12f);
  }
  void SelectAt(Vector2 point){
   Physics.SyncTransforms();Ray ray=GameCamera.ScreenPointToRay(point);var hits=Physics.RaycastAll(ray,100);Array.Sort(hits,(a,b)=>a.distance.CompareTo(b.distance));
   foreach(var hit in hits){var target=hit.collider.GetComponentInParent<CarrotClickable>();if(target!=null){
    // Tap-tap merging: with a tower armed (Merge button, key M), tapping a valid twin merges; anything else is an ordinary select, which disarms.
    if(game.mergeArmed>0&&target.type=="tower"&&target.id!=game.mergeArmed&&IsPartner(TowerById(game.mergeArmed),TowerById(target.id))){game.Command("{\"type\":\"merge\",\"id\":"+game.mergeArmed+",\"target\":"+target.id+"}");return;}
    game.Select(target.type,target.id);return;}}
   if(portraitCamera){
    // Screen-space padding makes small clearings finger-sized without overlapping world colliders.
    float best=18*inputPixelScale;best*=best;int nearest=-1;
    foreach(var pair in pads){var collider=pair.Value.GetComponent<SphereCollider>();if(collider==null||!collider.enabled)continue;Vector3 p=GameCamera.WorldToScreenPoint(game.level.pads[pair.Key]+Vector3.up*.12f);if(p.z<=0)continue;float distance=((Vector2)p-point).sqrMagnitude;if(distance<best){best=distance;nearest=pair.Key;}}
    if(nearest>=0){game.Select("pad",nearest);return;}
   }
   game.Select("",-1);
  }
  static GameObject Primitive(string name,PrimitiveType type,Vector3 p,Vector3 scale,Material mat,Transform parent,bool small=false){var go=CarrotMeshes.Create(type,name,small);go.transform.SetParent(parent,false);go.transform.localPosition=p;go.transform.localScale=scale;var collider=go.GetComponent<Collider>();if(collider!=null)Destroy(collider);var renderer=go.GetComponent<Renderer>();renderer.sharedMaterial=mat;renderer.shadowCastingMode=ShadowCastingMode.On;renderer.receiveShadows=true;return go;}
  GameObject MeshObject(string name,Mesh mesh,Material mat,Transform parent){createdMeshes.Add(mesh);var go=new GameObject(name);go.transform.SetParent(parent,false);go.AddComponent<MeshFilter>().sharedMesh=mesh;var renderer=go.AddComponent<MeshRenderer>();renderer.sharedMaterial=mat;renderer.shadowCastingMode=ShadowCastingMode.On;renderer.receiveShadows=true;return go;}
  static Mesh Disc(float radius,int segments){var v=new Vector3[segments+1];var uv=new Vector2[v.Length];var c=new Color[v.Length];var t=new int[segments*3];v[0]=Vector3.zero;uv[0]=Vector2.one*.5f;c[0]=Color.white;for(int i=0;i<segments;i++){float a=i*Mathf.PI*2/segments;v[i+1]=new Vector3(Mathf.Cos(a)*radius,0,Mathf.Sin(a)*radius);uv[i+1]=new Vector2(Mathf.Cos(a),Mathf.Sin(a))*.5f+Vector2.one*.5f;c[i+1]=Color.white;t[i*3]=0;t[i*3+1]=(i+1)%segments+1;t[i*3+2]=i+1;}var m=new Mesh{name="Circular surface"};m.vertices=v;m.uv=uv;m.colors=c;m.triangles=t;m.RecalculateNormals();return m;}
  static Mesh GridPlane(int nx,int nz,float width,float depth){var v=new Vector3[(nx+1)*(nz+1)];var t=new int[nx*nz*6];int n=0;for(int z=0;z<=nz;z++)for(int x=0;x<=nx;x++){int k=z*(nx+1)+x;v[k]=new Vector3((x/(float)nx-.5f)*width,0,(z/(float)nz-.5f)*depth);if(x<nx&&z<nz){t[n++]=k;t[n++]=k+nx+1;t[n++]=k+1;t[n++]=k+1;t[n++]=k+nx+1;t[n++]=k+nx+2;}}var m=new Mesh{name="Water mesh"};m.vertices=v;m.triangles=t;m.RecalculateNormals();return m;}
 }
 public static class CarrotMeshes {
  static readonly Dictionary<PrimitiveType,Mesh> meshes=new Dictionary<PrimitiveType,Mesh>();
  static readonly Dictionary<PrimitiveType,Mesh> smallMeshes=new Dictionary<PrimitiveType,Mesh>();
  public static GameObject Create(PrimitiveType type,string name,bool small=false){var go=new GameObject(name);go.AddComponent<MeshFilter>().sharedMesh=Get(type,small);go.AddComponent<MeshRenderer>();return go;}
  public static Mesh Get(PrimitiveType type,bool small=false){var cache=small?smallMeshes:meshes;if(cache.TryGetValue(type,out var cached))return cached;var vertices=new List<Vector3>();var uv=new List<Vector2>();var triangles=new List<int>();
   if(type==PrimitiveType.Quad){vertices.AddRange(new[]{new Vector3(-.5f,-.5f,0),new Vector3(.5f,-.5f,0),new Vector3(.5f,.5f,0),new Vector3(-.5f,.5f,0)});uv.AddRange(new[]{Vector2.zero,Vector2.right,Vector2.one,Vector2.up});triangles.AddRange(new[]{0,2,1,0,3,2});}
   else if(type==PrimitiveType.Cube){Vector3[] normals={Vector3.forward,Vector3.back,Vector3.right,Vector3.left,Vector3.up,Vector3.down};foreach(var normal in normals){Vector3 side=Vector3.Cross(normal,Mathf.Abs(normal.y)>.5f?Vector3.forward:Vector3.up).normalized*.5f,up=Vector3.Cross(side,normal).normalized*.5f,center=normal*.5f;int k=vertices.Count;vertices.AddRange(new[]{center-side-up,center+side-up,center+side+up,center-side+up});uv.AddRange(new[]{Vector2.zero,Vector2.right,Vector2.one,Vector2.up});triangles.AddRange(new[]{k,k+2,k+1,k,k+3,k+2});}}
   else{
    int sides=small?8:24,rings=small?5:16;bool cylinder=type==PrimitiveType.Cylinder;bool capsule=type==PrimitiveType.Capsule;
    for(int y=0;y<=rings;y++){float t=y/(float)rings,angle=t*Mathf.PI;float radius=cylinder?.5f:Mathf.Sin(angle)*.5f;float height=cylinder?1-t*2:Mathf.Cos(angle)*.5f+(capsule?(t<.5f?.5f:-.5f):0);for(int x=0;x<=sides;x++){float a=x/(float)sides*Mathf.PI*2;vertices.Add(new Vector3(Mathf.Cos(a)*radius,height,Mathf.Sin(a)*radius));uv.Add(new Vector2(x/(float)sides,t));if(y<rings&&x<sides){int k=y*(sides+1)+x;triangles.AddRange(new[]{k,k+1,k+sides+1,k+1,k+sides+2,k+sides+1});}}}
    if(cylinder){for(int cap=0;cap<2;cap++){float y=cap==0?1:-1;int center=vertices.Count;vertices.Add(new Vector3(0,y,0));uv.Add(Vector2.one*.5f);for(int i=0;i<=sides;i++){float a=i*Mathf.PI*2/sides;vertices.Add(new Vector3(Mathf.Cos(a)*.5f,y,Mathf.Sin(a)*.5f));uv.Add(new Vector2(Mathf.Cos(a),Mathf.Sin(a))*.5f+Vector2.one*.5f);if(i<sides){if(cap==0)triangles.AddRange(new[]{center,center+i+2,center+i+1});else triangles.AddRange(new[]{center,center+i+1,center+i+2});}}}}
   }
   var mesh=new Mesh{name="Carrot mesh "+type};mesh.SetVertices(vertices);mesh.SetUVs(0,uv);mesh.SetTriangles(triangles,0);var colors=new Color[vertices.Count];for(int i=0;i<colors.Length;i++)colors[i]=Color.white;mesh.colors=colors;mesh.RecalculateNormals();mesh.RecalculateBounds();cache[type]=mesh;return mesh;
  }
 }

}
