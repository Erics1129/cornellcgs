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

 public sealed class CarrotView : MonoBehaviour {
  #if UNITY_WEBGL && !UNITY_EDITOR
  [System.Runtime.InteropServices.DllImport("__Internal")] static extern float Carrot_CanvasCSSWidth();
  #endif
  float inputPixelScale=1;
  sealed class Actor {
   public GameObject root;public Transform model,turret,core,barrel,petals,pages,muzzle,shadow;public Animation animation;public string currentClip;public string kind;public int tier;
   public Vector3 modelScale,barrelRest;public Quaternion modelRotation;public Renderer[] renderers;public float flash=-1,hitRemaining,deadClock,lastShotClock=-9,spawnClock=-9,spin,spinRing,baseSpeed,shadowSize,lastDissolve=-1;public Bounds bounds;
   public Transform ring;public Transform[] bells=new Transform[0];public Vector3 ringRest,jolt,joltVel;public Quaternion turretYaw=Quaternion.identity;public Color tone=Color.white,lastEmission,lastTint;public string hitClip;public bool heavyHit,upgraded;public float stride;public RigBuilder rig;public Transform aimTarget;
  }
  public Camera GameCamera;
  CarrotGame game;CarrotEffects effects;CarrotAudio sound;
  readonly Dictionary<int,Actor> towers=new Dictionary<int,Actor>(),enemies=new Dictionary<int,Actor>(),blockers=new Dictionary<int,Actor>();
  readonly Dictionary<int,GameObject> pads=new Dictionary<int,GameObject>();
  readonly Dictionary<string,Material> materials=new Dictionary<string,Material>();
  readonly List<Mesh> createdMeshes=new List<Mesh>();
  readonly Dictionary<Transform,Quaternion> restRotations=new Dictionary<Transform,Quaternion>();
  readonly Dictionary<Transform,Vector3> eyeScales=new Dictionary<Transform,Vector3>();
  readonly List<int> removeIds=new List<int>();readonly HashSet<int> seen=new HashSet<int>();
  Transform world,decoration;Actor carrot;int levelId=-1;float clock,carrotHit,zoom=1,targetZoom=1,ambientClock;Vector3 pan,targetPan;
  float carrotHop;int lastWave;Vector3 carrotHitDir=Vector3.forward;PlayableDirector director;TimelineAsset bossEntrance;CarrotCinematics receiver;CinemachineVirtualCamera vcamBoss,vcamOrbit,vcamReveal;CinemachineTransposer bossBody,orbitBody,revealBody;Light bossSpot;int pendingBoss=-1;float dipClock=-1,sunBase=2.6f,fogEndBase=70,orbitClock=-1,revealClock=-1,defeatClock=-1,beatClock=-1;int signalsFired;Texture2D cookie;UniversalAdditionalLightData sunData;readonly List<Light> lanterns=new List<Light>();readonly Vector4[] pushers=new Vector4[12];CinemachineBrain brain;CinemachineVirtualCamera vcamPlay;CinemachineTransposer body;CinemachineImpulseSource impulse;Transform rig;float hitStop,slowMo,slowScale=1,viewScale=1,fovPunch;
  Vector2 pointerStart,pointerPrevious;bool pointerDown,dragging,suppressTouchClick,portraitCamera;float pinchDistance;int lastWidth,lastHeight;string previousPhase="";Light sun,fill;Volume grade;Material skyMaterial;float tierClock,tierAccum;int tierFrames;
  LineRenderer selectionRing,rangeRing;MaterialPropertyBlock properties;GameObject[] nature;readonly Dictionary<string,GameObject> realNature=new Dictionary<string,GameObject>();Texture2D atlas;
  Vector3 carrotPosition;float bossIntro;Vector3 bossFocus;Vector3 cameraTarget=new Vector3(0,.35f,.2f);Quaternion cameraAngle=Quaternion.Euler(34,-9,0);float fitDistance=25;
  void Awake(){CarrotQuality.Choose();StartCoroutine(WatchFrameWork());Shader.SetGlobalFloat("_CarrotGust",1);game=GetComponent<CarrotGame>();effects=gameObject.AddComponent<CarrotEffects>();sound=gameObject.AddComponent<CarrotAudio>();effects.CameraImpulse=Impulse;effects.HitStop=(stop,scale,slow)=>{hitStop=Mathf.Max(hitStop,CarrotQuality.High?stop:Mathf.Min(stop,.045f));if(slow>0){slowMo=Mathf.Max(slowMo,slow);slowScale=scale;}if(stop>0)sound.Duck(.6f);};effects.Ground=p=>game!=null&&game.level!=null?SurfaceHeight(p):0;properties=new MaterialPropertyBlock();atlas=Resources.Load<Texture2D>("Carrot/Textures/MaterialAtlas");var naturalPrefabs=new List<GameObject>();foreach(var name in new[]{"Rock","RockTall","Pebble","FlowerWhite","FlowerPurple","Bridge","Stump"}){var prefab=Resources.Load<GameObject>("Carrot/Nature/"+name);if(prefab!=null)naturalPrefabs.Add(prefab);}nature=naturalPrefabs.ToArray();foreach(var name in new[]{"Fern","Stump","MossRockA","MossRockB","Shrub"}){var prefab=Resources.Load<GameObject>("Carrot/RealNature/"+name);if(prefab!=null)realNature[name]=prefab;}CreateCamera();CreateCinematics();CreateLighting();selectionRing=CreateRing("Selection",new Color(1,.88f,.44f),.035f);rangeRing=CreateRing("Range",new Color(.75f,.95f,1,.7f),.035f);if(game!=null)game.Effect+=OnEffect;}
  void OnDestroy(){if(game!=null)game.Effect-=OnEffect;foreach(var m in materials.Values)Destroy(m);foreach(var m in createdMeshes)Destroy(m);CinemachineCore.UniformDeltaTimeOverride=-1;CinemachineCore.CurrentTimeOverride=-1;}
  public void SetMuted(bool muted){if(sound!=null)sound.SetMuted(muted);}
  public void UiSound(string kind){if(sound!=null)sound.UiSound(kind);}
  /// <summary>Debug entry (additive, unused by the page): "high"/"low" force a tier; "nodof", "nossao", "nofog", "nobloom", "noaa", "nomsaa" switch one High feature off for A/B captures.</summary>
  public void Quality(string tier){
   if(tier.StartsWith("no")){var live=grade!=null?grade.profile:null;if(tier=="nodof"&&live!=null&&live.TryGet<DepthOfField>(out var d))d.active=false;else if(tier=="nobloom"&&live!=null&&live.TryGet<Bloom>(out var b))b.active=false;else if(tier=="nofog")Shader.SetGlobalVector("_CarrotHeightFog",Vector4.zero);else if(tier=="noaa")GameCamera.GetUniversalAdditionalCameraData().antialiasing=AntialiasingMode.None;else if(tier=="nomsaa"){var asset=UnityEngine.Rendering.GraphicsSettings.currentRenderPipeline as UniversalRenderPipelineAsset;if(asset!=null)asset.msaaSampleCount=1;}else if(tier=="nossao"){var asset=UnityEngine.Rendering.GraphicsSettings.currentRenderPipeline as UniversalRenderPipelineAsset;var rd=asset!=null?asset.rendererDataList[0] as ScriptableRendererData:null;if(rd!=null)foreach(var f in rd.rendererFeatures)if(f is ScreenSpaceAmbientOcclusion)f.SetActive(false);}else if(tier=="nofogpass"){var asset=UnityEngine.Rendering.GraphicsSettings.currentRenderPipeline as UniversalRenderPipelineAsset;var rd=asset!=null?asset.rendererDataList[0] as ScriptableRendererData:null;if(rd!=null)foreach(var f in rd.rendererFeatures)if(f is FullScreenPassRendererFeature)f.SetActive(false);}Debug.Log("CarrotQuality debug "+tier);return;}
   CarrotQuality.Force(tier=="high");var data=GameCamera.GetUniversalAdditionalCameraData();data.antialiasing=CarrotQuality.High?AntialiasingMode.FastApproximateAntialiasing:AntialiasingMode.None;ApplyBiomeLighting();}
  void Update(){if(game==null||game.level==null)return;if(levelId!=game.level.id)BuildLevel();float raw=Mathf.Min(Time.deltaTime,.05f);bool frozen=game.paused;float dt=frozen?0:raw*(game.phase=="playing"?Mathf.Clamp(game.speed,1,2):1);
   // Hit-stop and slow motion scale only the presentation clock; the simulation keeps its own dt.
   if(dt>0){if(hitStop>0)hitStop-=raw;if(slowMo>0)slowMo-=raw;}viewScale=hitStop>0?.05f:slowMo>0?slowScale:1;float viewDt=dt*viewScale;
   clock+=viewDt;Shader.SetGlobalFloat("_CarrotTime",clock);Shader.SetGlobalFloat("_CarrotGust",1+.7f*Mathf.Max(0,Mathf.Sin(clock*.23f))*(.5f+.5f*Mathf.PerlinNoise(clock*.4f,3.7f)));WatchFrameTime();if(sunData!=null&&sun.cookie!=null)sunData.lightCookieOffset+=new Vector2(.04f,.02f)*viewDt;for(int i=0;i<lanterns.Count;i++)if(lanterns[i]!=null)lanterns[i].intensity=7*(.9f+.2f*Mathf.PerlinNoise(clock*3,i*7.3f));UpdatePushers();effects.Tick(viewDt);sound.Tick(raw,game.paused,game.phase);UpdateInput();UpdateCamera(raw,viewDt);UpdateActors(viewDt);UpdateCarrot(viewDt);UpdateSelection();if(game.phase!=previousPhase){if(game.phase=="playing")sound.Unlock();previousPhase=game.phase;}
   UpdateCinematics(viewDt,dt);CinemachineCore.UniformDeltaTimeOverride=viewDt;CinemachineCore.CurrentTimeOverride=clock;brain.ManualUpdate();}
  void StartBossBeat(Actor bossActor){
   // Hero shot: a three-quarter view from the carrot side; the camera slides right so the boss stands in the left third, clear of the HUD and the warning card.
   Quaternion rot=Quaternion.Euler(portraitCamera?56:33,cameraAngle.eulerAngles.y+28,0);vcamBoss.Follow=bossActor.root.transform;vcamBoss.transform.rotation=rot;bossBody.m_FollowOffset=-(rot*Vector3.forward)*(portraitCamera?8.5f:10.5f)+Vector3.up*1.1f+rot*Vector3.right*(portraitCamera?.5f:2.2f);vcamBoss.m_Lens.FieldOfView=portraitCamera?34:30;vcamBoss.ForceCameraPosition(bossActor.root.transform.position+bossBody.m_FollowOffset,rot);director.time=0;director.Play(bossEntrance);director.Evaluate();beatClock=0;signalsFired=0;}
  void UpdateCinematics(float viewDt,float dt){
   if(pendingBoss>=0){if(enemies.TryGetValue(pendingBoss,out var bossActor)){pendingBoss=-1;StartBossBeat(bossActor);}else{bool present=false;foreach(var e in game.enemies)if(e.id==pendingBoss)present=true;if(!present)pendingBoss=-1;}}
   if(beatClock>=0){beatClock+=viewDt;director.time=Math.Min(director.time+viewDt,director.duration);director.Evaluate();
    // Fallback when the signal track does not notify on a manually evaluated graph: fire the three beats from the clock.
    if(signalsFired==0&&beatClock>=.15f){OnSignal("bossDust");signalsFired=1;}if(signalsFired==1&&beatClock>=.4f){OnSignal("bossRoar");signalsFired=2;}if(signalsFired==2&&beatClock>=1.35f){OnSignal("bossRing");signalsFired=3;}
    if(CarrotQuality.High&&vcamBoss.Follow!=null){bossSpot.enabled=beatClock>.3f&&beatClock<2.4f;bossSpot.transform.position=vcamBoss.Follow.position+Vector3.up*4.5f;bossSpot.transform.rotation=Quaternion.LookRotation(Vector3.down+Vector3.forward*.05f);}
    if(director.time>=director.duration-.0005f){director.Stop();beatClock=-1;bossSpot.enabled=false;}}
   if(dipClock>=0){dipClock+=viewDt;float t=dipClock;float env=t<.4f?t/.4f:t<1.6f?1:t<2f?(2-t)/.4f:0;sun.intensity=sunBase*(1-.6f*env);RenderSettings.fogEndDistance=fogEndBase*(1-.3f*env);if(t>=2f)dipClock=-1;}
   if(revealClock>=0){revealClock+=dt;revealBody.m_FollowOffset=-(vcamReveal.transform.rotation*Vector3.forward)*(fitDistance*1.14f/zoom);if(revealClock>1.3f){revealClock=-1;vcamReveal.Priority=0;}}
   if(game.phase=="won"&&orbitClock<0&&carrot!=null){orbitClock=0;vcamOrbit.Follow=carrot.root.transform;vcamOrbit.Priority=15;}
   if(orbitClock>=0){orbitClock+=viewDt;float yaw=cameraAngle.eulerAngles.y+Mathf.Lerp(0,84,Mathf.Clamp01(orbitClock/3));Vector3 offset=Quaternion.Euler(0,yaw,0)*new Vector3(0,2.6f,-5.5f);orbitBody.m_FollowOffset=offset;vcamOrbit.transform.rotation=Quaternion.LookRotation((carrotPosition+Vector3.up*.9f)-(carrotPosition+offset));if(sun!=null&&dipClock<0)sun.intensity=Mathf.Lerp(sun.intensity,sunBase*1.1f,viewDt*2);}
   if(game.phase=="lost"&&defeatClock<0)defeatClock=0;if(defeatClock>=0&&defeatClock<1.5f){defeatClock+=dt;float t=Mathf.Clamp01(defeatClock/1.4f);sun.intensity=sunBase*(1-.3f*t);sun.color=Color.Lerp(sun.color,new Color(.8f,.85f,.95f),dt*2);RenderSettings.fogEndDistance=fogEndBase*(1-.28f*Mathf.Clamp01(defeatClock/1.2f));}
  }
  void UpdatePushers(){int n=0;if(carrot!=null)pushers[n++]=new Vector4(carrotPosition.x,carrotPosition.z,.55f,.28f);foreach(var e in game.enemies){if(n>=12)break;if(!e.alive||e.air||e.hidden)continue;bool boss=!string.IsNullOrEmpty(e.boss);pushers[n++]=new Vector4(e.position.x,e.position.z,boss?.95f:.4f,.28f);}Shader.SetGlobalVectorArray("_CarrotPushers",pushers);Shader.SetGlobalFloat("_CarrotPusherCount",n);}
  void Impulse(Vector3 at,float force,int shape){if(impulse==null)return;impulse.m_ImpulseDefinition.m_ImpulseShape=(CinemachineImpulseDefinition.ImpulseShapes)Mathf.Clamp(shape,1,4);impulse.GenerateImpulseAtPositionWithVelocity(at,Vector3.down*force);}
  void CreateCamera(){if(GameCamera==null){GameCamera=Camera.main;if(GameCamera==null){var go=new GameObject("Carrot camera");GameCamera=go.AddComponent<Camera>();go.tag="MainCamera";}}GameCamera.orthographic=false;GameCamera.fieldOfView=38;GameCamera.nearClipPlane=.1f;GameCamera.farClipPlane=100;GameCamera.clearFlags=CameraClearFlags.Skybox;GameCamera.backgroundColor=new Color(.075f,.13f,.16f);GameCamera.allowHDR=true;GameCamera.allowMSAA=true;GameCamera.depth=0;if(GameCamera.GetComponent<AudioListener>()==null)GameCamera.gameObject.AddComponent<AudioListener>();var data=GameCamera.GetUniversalAdditionalCameraData();data.renderPostProcessing=true;data.antialiasing=CarrotQuality.High?AntialiasingMode.FastApproximateAntialiasing:AntialiasingMode.None;data.renderShadows=true;data.requiresDepthOption=CameraOverrideOption.UsePipelineSettings;data.requiresColorOption=CameraOverrideOption.UsePipelineSettings;data.volumeLayerMask=-1;data.dithering=true;data.stopNaN=false;
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
  int slowWindows;
  // Frame-interval means are only evidence of slowness relative to the display's own cadence: a 60 Hz monitor paces every frame at 16.7 ms and
  // a dimmed ProMotion panel or a throttled headless browser at 33 ms with 3 ms of work. A window (120 frames, 40 ms+ stalls excluded) counts
  // as slow when its mean is above 22 ms AND either the frames are irregular (mean above 1.35x the smallest 10th-percentile interval seen so far,
  // i.e. dropped frames rather than steady vsync) or the measured main-thread work (Update to end of frame) averages above 14 ms. Three
  // consecutive slow windows demote once; never promoted back.
  readonly float[] tierSamples=new float[120];float tierRefresh=float.MaxValue,frameStart,workAccum;int workFrames;
  System.Collections.IEnumerator WatchFrameWork(){var wait=new WaitForEndOfFrame();while(true){yield return wait;if(frameStart>0){workAccum+=Time.realtimeSinceStartup-frameStart;workFrames++;}}}
  void WatchFrameTime(){frameStart=Time.realtimeSinceStartup;if(!CarrotQuality.High)return;tierClock+=Time.unscaledDeltaTime;if(tierClock<3)return;float frame=Time.unscaledDeltaTime;if(frame>.04f)return;tierSamples[tierFrames]=frame;tierAccum+=frame;tierFrames++;if(tierFrames<120)return;
   System.Array.Sort(tierSamples);float p10=tierSamples[12]*1000,mean=tierAccum/tierFrames*1000,work=workFrames>0?workAccum/workFrames*1000:0;tierRefresh=Mathf.Min(tierRefresh,p10);tierAccum=0;tierFrames=0;workAccum=0;workFrames=0;
   bool slow=mean>22f&&(mean>tierRefresh*1.35f||work>14f);slowWindows=slow?slowWindows+1:0;if(slowWindows>=3){CarrotQuality.Demote("frame mean "+mean.ToString("F1")+" ms, refresh "+tierRefresh.ToString("F1")+" ms, work "+work.ToString("F1")+" ms");var data=GameCamera.GetUniversalAdditionalCameraData();data.antialiasing=AntialiasingMode.None;ApplyBiomeLighting();}}
  void CreateLighting(){foreach(var l in FindObjectsByType<Light>(FindObjectsSortMode.None))if(l.type==LightType.Directional)l.enabled=false;var go=new GameObject("Key light");go.transform.SetParent(transform);sun=go.AddComponent<Light>();sun.type=LightType.Directional;sun.color=new Color(1,.89f,.72f);sun.intensity=2.6f;sun.shadows=LightShadows.Soft;sun.shadowStrength=.92f;go.transform.rotation=Quaternion.Euler(52,-28,0);var fillGo=new GameObject("Sky fill");fillGo.transform.SetParent(transform);fill=fillGo.AddComponent<Light>();fill.type=LightType.Directional;fill.shadows=LightShadows.None;fill.color=new Color(.56f,.70f,.85f);fill.intensity=.3f;fillGo.transform.rotation=Quaternion.Euler(-28,150,0);RenderSettings.ambientMode=AmbientMode.Trilight;RenderSettings.ambientIntensity=1;RenderSettings.fog=true;RenderSettings.fogMode=FogMode.Linear;RenderSettings.fogStartDistance=30;RenderSettings.fogEndDistance=70;skyMaterial=new Material(Shader.Find("Carrot/Sky"));materials["sky"]=skyMaterial;RenderSettings.skybox=skyMaterial;var environment=Resources.Load<Cubemap>("Carrot/Textures/Environment");if(environment!=null){RenderSettings.defaultReflectionMode=DefaultReflectionMode.Custom;RenderSettings.customReflectionTexture=environment;RenderSettings.reflectionIntensity=.9f;}sunData=sun.GetUniversalAdditionalLightData();sunData.lightCookieSize=new Vector2(18,18);
   if(CarrotQuality.High){const int size=128;cookie=new Texture2D(size,size,TextureFormat.RGBA32,false,true);cookie.wrapMode=TextureWrapMode.Repeat;cookie.name="Canopy cookie";var px=new Color32[size*size];
    // Tileable dappled canopy: four offset octave-noise samples blended by position.
    Func<float,float,float> octaves=(x,y)=>{float v=0,amp=.5f,freq=1;for(int o=0;o<3;o++){v+=Mathf.PerlinNoise(x*freq+3.1f,y*freq+7.7f)*amp;amp*=.5f;freq*=2;}return v/.875f;};
    for(int y=0;y<size;y++)for(int x=0;x<size;x++){float fx=x/(float)size,fy=y/(float)size;float u=fx*4.5f,w=fy*4.5f;float v=Mathf.Lerp(Mathf.Lerp(octaves(u,w),octaves(u-4.5f,w),fx),Mathf.Lerp(octaves(u,w-4.5f),octaves(u-4.5f,w-4.5f),fx),fy);v=Mathf.Clamp01((v-.5f)*1.6f+.5f);byte b=(byte)(Mathf.Lerp(.35f,1,v)*255);px[y*size+x]=new Color32(b,b,b,255);}
    cookie.SetPixels32(px);cookie.Apply();}
   var volumeGo=new GameObject("Grade");volumeGo.transform.SetParent(transform);grade=volumeGo.AddComponent<Volume>();grade.isGlobal=true;grade.priority=1;grade.weight=1;}
  void ApplyBiomeLighting(){if(game==null||game.level==null||sun==null)return;string biome=game.level.biome;bool high=CarrotQuality.High;
   // Values are HDR; ACES in the post volume maps them to the canvas.
   Color zenith,horizon,ground;
   if(biome=="marsh"){sun.transform.rotation=Quaternion.Euler(58,35,0);sun.color=new Color(.66f,.78f,1);sun.intensity=1.15f;sun.shadowStrength=.85f;fill.transform.rotation=Quaternion.Euler(-20,-120,0);fill.color=new Color(.18f,.32f,.30f);fill.intensity=.25f;zenith=new Color(.02f,.07f,.14f);horizon=new Color(.09f,.20f,.29f);ground=new Color(.03f,.05f,.04f);RenderSettings.fogColor=new Color(.05f,.12f,.17f);RenderSettings.fogStartDistance=22;RenderSettings.fogEndDistance=58;}
   else if(biome=="frost"){sun.transform.rotation=Quaternion.Euler(36,-50,0);sun.color=new Color(.86f,.92f,1);sun.intensity=1.7f;sun.shadowStrength=.8f;fill.transform.rotation=Quaternion.Euler(-25,130,0);fill.color=new Color(.55f,.68f,.92f);fill.intensity=.45f;zenith=new Color(.36f,.50f,.69f);horizon=new Color(.83f,.88f,.94f);ground=new Color(.70f,.74f,.80f);RenderSettings.fogColor=new Color(.75f,.83f,.92f);RenderSettings.fogStartDistance=30;RenderSettings.fogEndDistance=76;}
   else{sun.transform.rotation=Quaternion.Euler(52,-28,0);sun.color=new Color(1,.89f,.72f);sun.intensity=2.6f;sun.shadowStrength=.92f;fill.transform.rotation=Quaternion.Euler(-28,150,0);fill.color=new Color(.56f,.70f,.85f);fill.intensity=.3f;zenith=new Color(.40f,.62f,.86f);horizon=new Color(.72f,.82f,.90f);ground=new Color(.20f,.26f,.14f);RenderSettings.fogColor=new Color(.70f,.80f,.86f);RenderSettings.fogStartDistance=34;RenderSettings.fogEndDistance=82;}
   RenderSettings.ambientSkyColor=zenith*1.0f;RenderSettings.ambientEquatorColor=horizon*.9f;RenderSettings.ambientGroundColor=ground*.8f;RenderSettings.reflectionIntensity=biome=="frost"?.55f:biome=="marsh"?.6f:.75f;
   Shader.SetGlobalFloat("_SnowAmount",biome=="frost"?1:0);Shader.SetGlobalVector("_SnowOffset",Vector4.zero);
   var wet=new Vector4[2];if(biome=="marsh"){var ponds=PondCenters();for(int i=0;i<2;i++)wet[i]=new Vector4(ponds[i].x,ponds[i].z,2.4f,1);}Shader.SetGlobalVectorArray("_WetCenters",wet);
   skyMaterial.SetColor("_Zenith",zenith);skyMaterial.SetColor("_Horizon",horizon);skyMaterial.SetColor("_Ground",ground);skyMaterial.SetVector("_CarrotSunDir",-sun.transform.forward);
   skyMaterial.SetColor("_SunColor",biome=="marsh"?new Color(.8f,.86f,1)*1.4f:biome=="frost"?new Color(1,.97f,.9f)*.9f:new Color(1,.9f,.7f)*1.3f);skyMaterial.SetFloat("_SunSize",biome=="marsh"?.02f:.035f);skyMaterial.SetFloat("_SunGlow",biome=="marsh"?.2f:biome=="frost"?.5f:.35f);
   skyMaterial.SetFloat("_CloudAmount",biome=="frost"?.9f:biome=="marsh"?.3f:.55f);skyMaterial.SetColor("_CloudColor",biome=="marsh"?new Color(.12f,.2f,.3f):biome=="frost"?new Color(.9f,.93f,.97f):new Color(1,.98f,.95f));
   skyMaterial.SetFloat("_Stars",biome=="marsh"?1:0);skyMaterial.SetFloat("_Aurora",biome=="frost"?.8f:0);skyMaterial.SetColor("_AuroraColor",new Color(.37f,.91f,.63f));
   sunBase=sun.intensity;fogEndBase=RenderSettings.fogEndDistance;if(bossSpot!=null)bossSpot.intensity=biome=="frost"?36:45;
   if(sun!=null)sun.cookie=biome!="frost"&&high?cookie:null;
   Vector4 heightFog=biome=="marsh"?new Vector4(.045f,-.3f,2.2f,.1f):biome=="frost"?new Vector4(.026f,-.5f,1.6f,0):new Vector4(.015f,-.7f,1.4f,0);if(!high)heightFog.x=0;Shader.SetGlobalVector("_CarrotHeightFog",heightFog);Shader.SetGlobalColor("_CarrotHeightFogColor",Color.Lerp(RenderSettings.fogColor,horizon,.55f));
   foreach(var lantern in lanterns)if(lantern!=null)lantern.enabled=biome=="marsh";
   var profile=Resources.Load<VolumeProfile>("Carrot/Volumes/"+biome);if(profile!=null&&grade!=null){grade.sharedProfile=profile;var live=grade.profile;if(live.TryGet<DepthOfField>(out var dof))dof.active=high;if(live.TryGet<Bloom>(out var bloom)){bloom.highQualityFiltering.value=high;bloom.scatter.value=high?.6f:.5f;}if(live.TryGet<ShadowsMidtonesHighlights>(out var smh))smh.active=high;if(live.TryGet<ChromaticAberration>(out var ca))ca.active=high;}
  }
  Material Material(string id,Color tint,int texture=-1,float gloss=.25f,float metallic=0,float gain=1){if(materials.TryGetValue(id,out var m))return m;m=new Material(Shader.Find("Carrot/Storybook"));m.name=id;m.color=tint;m.SetFloat("_Glossiness",gloss);m.SetFloat("_Metallic",metallic);m.SetFloat("_AlbedoGain",gain);m.SetFloat("_SnowStrength",texture==1||texture==0?1:.35f);if(texture>=0&&atlas!=null){m.SetTexture("_MainTex",atlas);m.SetTextureScale("_MainTex",new Vector2(1f/3,.5f));m.SetTextureOffset("_MainTex",new Vector2((texture%3)/3f,texture<3?.5f:0));m.SetFloat("_WorldTexture",1);m.SetFloat("_TextureScale",.6f);}if(texture>=0)ApplyPhysicalMaps(m,texture==0?"Soil":texture==1?"Stone":texture==2?"Bark":texture==5?"Metal":null);materials[id]=m;return m;}
  void ApplyPhysicalMaps(Material material,string family){
   if(string.IsNullOrEmpty(family))return;string path="Carrot/Textures/PBR/"+family;
   var albedo=Resources.Load<Texture2D>(path+"Albedo");if(albedo!=null){material.SetTexture("_MainTex",albedo);material.SetTextureScale("_MainTex",Vector2.one);material.SetTextureOffset("_MainTex",Vector2.zero);material.SetFloat("_TextureScale",family=="Soil"?.85f:1.3f);}
   var normal=Resources.Load<Texture2D>(path+"Normal");if(normal!=null){material.SetTexture("_BumpMap",normal);material.SetFloat("_BumpScale",family=="Soil"?1.05f:.8f);}
   var roughness=Resources.Load<Texture2D>(path+"Roughness");if(roughness!=null){material.SetTexture("_RoughnessMap",roughness);material.SetFloat("_UseRoughnessMap",1);}
   var ao=Resources.Load<Texture2D>(path+"AO");if(ao!=null){material.SetTexture("_OcclusionMap",ao);material.SetFloat("_UseOcclusionMap",1);material.SetFloat("_OcclusionStrength",.68f);}
  }
  void BuildLevel(){levelId=game.level.id;if(world!=null)Destroy(world.gameObject);foreach(var m in createdMeshes)Destroy(m);createdMeshes.Clear();world=new GameObject("Storybook diorama "+levelId).transform;world.SetParent(transform,false);decoration=new GameObject("Garden details").transform;decoration.SetParent(world,false);towers.Clear();enemies.Clear();blockers.Clear();pads.Clear();eyeScales.Clear();restRotations.Clear();effects.Clear();lanterns.Clear();clock=0;carrotHit=0;zoom=targetZoom=1;pan=targetPan=Vector3.zero;pointerDown=dragging=false;pinchDistance=0;string biome=game.level.biome;
   ApplyBiomeLighting();
   BuildTerrain();BuildRoads();for(int i=0;i<game.level.pads.Length;i++)BuildPad(i,game.level.pads[i]);BuildDecoration();BuildGrass();CombineDecoration();Vector3[] route=game.level.routes[0];carrotPosition=route[route.Length-1];carrot=Spawn("Carrot/Models/Carrot",world,"carrot",0);carrot.root.transform.position=carrotPosition+Vector3.up*.02f;carrot.root.transform.rotation=Quaternion.identity;carrot.root.transform.localScale=Vector3.one*1.35f;BuildCarrotNest();effects.Biome=biome;effects.Ambient(biome);FitCamera();SnapCamera();if(director!=null&&director.state==PlayState.Playing)director.Stop();beatClock=-1;pendingBoss=-1;dipClock=-1;orbitClock=-1;defeatClock=-1;vcamOrbit.Priority=0;vcamBoss.Priority=0;bossSpot.enabled=false;revealClock=0;vcamReveal.Priority=15;Quaternion revealAngle=cameraAngle*Quaternion.Euler(5,0,0);vcamReveal.transform.rotation=revealAngle;revealBody.m_FollowOffset=-(revealAngle*Vector3.forward)*(fitDistance*1.14f);vcamReveal.Follow=rig;vcamReveal.ForceCameraPosition(rig.position+revealBody.m_FollowOffset,revealAngle);GameCamera.transform.SetPositionAndRotation(rig.position+revealBody.m_FollowOffset,revealAngle);sound.SetBiome(biome);SetFace(false,false);}
  /// <summary>Height of what creatures actually walk on: the trail strip (0.061 u + route offset) where there is a path, the terrain elsewhere. Ground effects anchored here are never buried under the path mesh.</summary>
  float SurfaceHeight(Vector3 p){float h=TerrainHeight(p);return PathDistance(p)<.5f?Mathf.Max(h,.068f):h;}
  float ActorScale{get{return portraitCamera?1.2f:1f;}}
  float PathDistance(Vector3 p){float min=100;foreach(var route in game.level.routes)for(int i=1;i<route.Length;i++)min=Mathf.Min(min,SegmentDistance(p,route[i-1],route[i]));return min;}
  static float SegmentDistance(Vector3 p,Vector3 a,Vector3 b){p.y=a.y=b.y=0;Vector3 d=b-a;float t=Mathf.Clamp01(Vector3.Dot(p-a,d)/Mathf.Max(.001f,d.sqrMagnitude));return Vector3.Distance(p,a+d*t);}
  bool IsFree(Vector3 p,float margin=.9f){if(PathDistance(p)<margin)return false;foreach(var q in game.level.pads)if(Vector3.Distance(p,q)<margin)return false;return true;}
  Vector3[] PondCenters(){float shift=(game.level.id-5)*.38f;return new[]{new Vector3(-3.5f+shift,-.10f,1.4f-shift*.6f),new Vector3(3.4f-shift*.55f,-.10f,-1.9f+shift)};}
  bool Pond(Vector3 p){if(game.level.biome!="marsh")return false;foreach(var center in PondCenters())if(Vector2.Distance(new Vector2(p.x,p.z),new Vector2(center.x,center.z))<1.65f)return true;return false;}
  float TerrainHeight(Vector3 p){
   float n=Mathf.PerlinNoise(p.x*.55f+20,p.z*.55f+20),path=PathDistance(p);
   float y=-.025f+Mathf.SmoothStep(0,1,Mathf.Clamp01((path-.55f)/.9f))*n*.16f;
   float edge=Mathf.Clamp01(Mathf.Max((Mathf.Abs(p.x)-7.8f)/3.5f,(Mathf.Abs(p.z)-5.8f)/3.2f));
   float hills=Mathf.PerlinNoise(p.x*.16f+8,p.z*.16f+14);
   y+=Mathf.SmoothStep(0,1,edge)*(.25f+hills*(game.level.biome=="frost"?1.9f:game.level.biome=="marsh"?.55f:1.25f));
   return Pond(p)?-.18f:y;
  }
  void BuildTerrain(){
   const int sx=128,sz=104;var vertices=new Vector3[(sx+1)*(sz+1)];var colors=new Color[vertices.Length];var uv=new Vector2[vertices.Length];var tris=new int[sx*sz*6];string biome=game.level.biome;
   Color soil=biome=="frost"?new Color(.83f,.90f,.97f):biome=="marsh"?new Color(.22f,.36f,.23f):new Color(.27f,.42f,.11f);int index=0;
   for(int z=0;z<=sz;z++)for(int x=0;x<=sx;x++){
    int k=z*(sx+1)+x;float px=Mathf.Lerp(-24,24,x/(float)sx),pz=Mathf.Lerp(-20,20,z/(float)sz);Vector3 p=new Vector3(px,0,pz);
    float n=Mathf.PerlinNoise(px*.55f+20,pz*.55f+20),broad=Mathf.PerlinNoise(px*.19f+41,pz*.19f+83);vertices[k]=new Vector3(px,TerrainHeight(p),pz);uv[k]=new Vector2(x/(float)sx,z/(float)sz);
    colors[k]=Color.Lerp(soil*(biome=="frost"?.88f:.70f),soil*(biome=="frost"?1.04f:1.12f),n*.6f+broad*.4f);colors[k].a=1;
    if(x<sx&&z<sz){tris[index++]=k;tris[index++]=k+sx+1;tris[index++]=k+1;tris[index++]=k+1;tris[index++]=k+sx+1;tris[index++]=k+sx+2;}
   }
   var mesh=new Mesh{name="Continuous rolling landscape"};mesh.vertices=vertices;mesh.uv=uv;mesh.colors=colors;mesh.triangles=tris;mesh.RecalculateNormals();
   var mat=Material("ground-"+biome,Color.white,biome=="frost"?1:0);mat.SetFloat("_AlbedoSaturation",biome=="frost"?0:.10f);mat.SetFloat("_AlbedoGain",biome=="frost"?1.0f:1.9f);mat.SetFloat("_OcclusionStrength",biome=="frost"?.45f:.55f);mat.SetFloat("_SnowStrength",.6f);mat.SetFloat("_BumpScale",biome=="frost"?.32f:.85f);mat.SetFloat("_TextureScale",biome=="frost"?2.3f:.85f);mat.SetFloat("_ReflectionStrength",.25f);
   if(biome=="frost")ConfigureSnow(mat,false);
   var go=MeshObject("Terrain",mesh,mat,world);go.AddComponent<MeshCollider>().sharedMesh=mesh;
   if(biome=="marsh"){
    var waterMaterial=new Material(Shader.Find("Carrot/Water"));waterMaterial.SetColor("_Color",new Color(.018f,.071f,.068f));waterMaterial.SetColor("_Shallow",new Color(.11f,.24f,.23f));
    if(materials.TryGetValue("water-runtime",out var oldWater))Destroy(oldWater);materials["water-runtime"]=waterMaterial;
    foreach(var p in PondCenters()){var pool=MeshObject("Sheltered pond",Disc(1.65f,64),waterMaterial,world);pool.transform.localPosition=p;}
   }
  }
  void ConfigureSnow(Material mat,bool packed){
   // Snow reflects light from a pale base; dark rock albedo must never tint its grains.
   mat.SetTexture("_MainTex",Texture2D.whiteTexture);mat.SetTextureScale("_MainTex",Vector2.one);mat.SetTextureOffset("_MainTex",Vector2.zero);mat.SetFloat("_AlbedoGain",packed?.9f:1);mat.SetFloat("_AlbedoSaturation",1);
   mat.SetFloat("_WorldTexture",1);mat.SetFloat("_TextureScale",packed?1.7f:1.2f);mat.SetFloat("_Glossiness",packed?.34f:.16f);mat.SetFloat("_UseRoughnessMap",0);mat.SetFloat("_UseOcclusionMap",0);mat.SetFloat("_ReflectionStrength",packed?.25f:.12f);
   var grain=Resources.Load<Texture2D>("Carrot/Textures/PBR/SoilNormal");mat.SetTexture("_BumpMap",grain);mat.SetFloat("_BumpScale",packed?.14f:.095f);
  }
  void BuildRoads(){var mat=Material("path-"+game.level.biome,game.level.biome=="frost"?new Color(.58f,.70f,.86f):game.level.biome=="marsh"?new Color(.90f,.84f,.65f):new Color(1,.86f,.60f),game.level.biome=="frost"?1:0,.15f);mat.SetFloat("_AlbedoSaturation",game.level.biome=="frost"?0:.5f);mat.SetFloat("_AlbedoGain",game.level.biome=="frost"?1.0f:1.7f);mat.SetFloat("_SnowStrength",.15f);if(game.level.biome=="frost"){ConfigureSnow(mat,true);mat.color=Color.white;mat.SetFloat("_Glossiness",.48f);mat.SetFloat("_ReflectionStrength",.4f);mat.SetFloat("_BumpScale",.3f);mat.SetFloat("_Translucency",.25f);mat.SetFloat("_SnowStrength",0);}else if(game.level.biome=="marsh"){mat.SetFloat("_AlbedoGain",1.7f);mat.SetFloat("_OcclusionStrength",.3f);mat.SetFloat("_ReflectionStrength",.3f);}var edge=Material("path-stone",new Color(1,.96f,.86f),1,.3f,0,1.9f);var visited=new HashSet<string>();int routeIndex=0;
   foreach(var route in game.level.routes){for(int i=1;i<route.Length;i++){Vector3 a=route[i-1],b=route[i];Vector3 delta=b-a;int count=Mathf.Max(1,Mathf.CeilToInt(delta.magnitude/.35f));for(int s=0;s<=count;s++){Vector3 p=Vector3.Lerp(a,b,s/(float)count);string key=Mathf.RoundToInt(p.x*6)+":"+Mathf.RoundToInt(p.z*6);if(!visited.Add(key))continue;Vector3 side=Vector3.Cross(delta.normalized,Vector3.up);if(Pond(p)&&s%2==0){var board=Primitive("Bridge board",PrimitiveType.Cube,p+Vector3.up*.09f,new Vector3(.9f,.10f,.19f),Material("bridgewood",new Color(.67f,.48f,.26f),2),decoration);board.transform.rotation=Quaternion.LookRotation(delta);}}}
    BuildTrailMesh(route,mat,routeIndex);BuildPebbles(route,edge,routeIndex);Vector3 entrance=route[0];BuildEntrance(entrance,routeIndex++);}
  }
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
     colors[n]=frost?(edge?new Color(.86f,.91f,1):Color.Lerp(new Color(.2f,.38f,.66f),new Color(.3f,.48f,.74f),noise)):Color.Lerp(new Color(.82f,.78f,.66f),Color.white,noise)*(edge?.86f:1);colors[n].a=1;}
    if(i<points.Count-1){int n=i*12,v=i*3;triangles[n]=v;triangles[n+1]=v+1;triangles[n+2]=v+3;triangles[n+3]=v+1;triangles[n+4]=v+4;triangles[n+5]=v+3;triangles[n+6]=v+1;triangles[n+7]=v+2;triangles[n+8]=v+4;triangles[n+9]=v+2;triangles[n+10]=v+5;triangles[n+11]=v+4;}
   }
   var mesh=new Mesh{name="Continuous worn-earth trail"};mesh.vertices=vertices;mesh.uv=uv;mesh.colors=colors;mesh.triangles=triangles;mesh.RecalculateNormals();MeshObject("Continuous trail",mesh,material,decoration);
  }
  void BuildPebbles(Vector3[] route,Material edge,int routeIndex){var spline=RouteSpline(route);float length=spline.GetLength();var rng=new System.Random(77+routeIndex*13+levelId*5);float t=0;int n=0;
   while(true){float3 q=SplineUtility.GetPointAtLinearDistance(spline,t,1.05f,out float next);if(next>=1f||next<=t)break;t=next;float3 tangent=spline.EvaluateTangent(t);Vector3 side=Vector3.Cross(new Vector3(tangent.x,0,tangent.z).normalized,Vector3.up);n++;for(int k=-1;k<=1;k+=2){if(rng.NextDouble()<.2)continue;Vector3 ep=new Vector3(q.x,0,q.z)+side*(.5f*k+(float)rng.NextDouble()*.08f*k);if(PathDistance(ep)<.36f||Pond(ep))continue;float s=.14f+(float)rng.NextDouble()*.08f;var stone=Primitive("Trail pebble",PrimitiveType.Sphere,ep+Vector3.up*(TerrainHeight(ep)+.05f),new Vector3(s,s*.6f,s*.8f),edge,decoration,true);stone.transform.localRotation=Quaternion.Euler(14,(float)rng.NextDouble()*360,8);}}}
  void BuildEntrance(Vector3 p,int routeIndex){var rock=Material("entry-stone",new Color(.86f,.9f,.8f),1,.25f,0,1.8f);for(int i=0;i<7;i++){float a=Mathf.PI*i/6;Vector3 pos=p+new Vector3(Mathf.Cos(a)*.66f,.24f+Mathf.Sin(a)*.75f,-.16f);var s=Primitive("Moss arch",PrimitiveType.Sphere,pos,new Vector3(.46f,.44f,.4f),rock,decoration);s.transform.localRotation=Quaternion.Euler(i*12,i*23,0);}var lamp=Primitive("Entrance lantern",PrimitiveType.Sphere,p+new Vector3(0,1.02f,-.15f),Vector3.one*.13f,Material("lantern",new Color(1,.76f,.22f),5,.65f,.3f),decoration);lamp.GetComponent<Renderer>().sharedMaterial.SetColor("_EmissionColor",new Color(1.6f,.75f,.12f));
   if(game.level.biome=="marsh"&&lanterns.Count<2){var lightGo=new GameObject("Lantern light");lightGo.transform.SetParent(decoration,false);lightGo.transform.localPosition=p+new Vector3(0,1.1f,-.15f);var light=lightGo.AddComponent<Light>();light.type=LightType.Point;light.range=2.6f;light.intensity=7;light.color=new Color(1,.7f,.28f);light.shadows=LightShadows.None;lanterns.Add(light);}}
  void BuildPad(int id,Vector3 p){var root=new GameObject("Tower garden "+id);root.transform.SetParent(world,false);p.y=TerrainHeight(p);root.transform.localPosition=p;var click=root.AddComponent<CarrotClickable>();click.type="pad";click.id=id;var collider=root.AddComponent<SphereCollider>();collider.center=new Vector3(0,.12f,0);collider.radius=.47f;var baseMat=Material("padsoil-"+game.level.biome,game.level.biome=="frost"?new Color(.57f,.70f,.82f):new Color(.82f,.72f,.5f),0,.25f,0,game.level.biome=="frost"?1:2.3f);if(game.level.biome=="frost"){ConfigureSnow(baseMat,true);baseMat.SetFloat("_SnowStrength",.3f);}
   // Static pad dressing lives in the batched decoration so a level costs one draw per material, not nine per pad.
   var disk=MeshObject("Planting circle",Disc(.44f,24),baseMat,decoration);disk.transform.localPosition=p+Vector3.up*.045f;var stoneMat=Material("padstones-"+game.level.biome,game.level.biome=="frost"?new Color(.85f,.9f,.95f):new Color(1,.97f,.86f),1,.22f,0,2.6f);var rng=new System.Random(id*131+levelId*7);
   for(int i=0;i<7;i++){float a=i*Mathf.PI*2/7+(float)rng.NextDouble()*.3f;float r=.38f+(float)rng.NextDouble()*.06f;var st=Primitive("Border stone",PrimitiveType.Sphere,p+new Vector3(Mathf.Cos(a)*r,.05f,Mathf.Sin(a)*r),new Vector3(.18f+(float)rng.NextDouble()*.08f,.065f,.12f+(float)rng.NextDouble()*.05f),stoneMat,decoration,true);st.transform.localRotation=Quaternion.Euler((float)rng.NextDouble()*20-10,-a*Mathf.Rad2Deg,(float)rng.NextDouble()*16-8);}
   var markMat=Material("padmark",new Color(1,.93f,.6f),-1,.3f);markMat.SetColor("_EmissionColor",new Color(.32f,.27f,.1f));var marker=MeshObject("Build mark",Disc(.09f,12),markMat,root.transform);marker.transform.localPosition=Vector3.up*.052f;pads[id]=root;}
  void BuildCarrotNest(){var material=Material("carrot-fence",new Color(.68f,.42f,.22f),2);for(int i=0;i<15;i++){float a=i*Mathf.PI*2/15;Vector3 p=carrotPosition+new Vector3(Mathf.Cos(a)*.63f,.22f,Mathf.Sin(a)*.63f);Primitive("Root fence",PrimitiveType.Cylinder,p,new Vector3(.07f,.19f,.07f),material,decoration,true);}for(int i=0;i<6;i++)Flower(carrotPosition+new Vector3(Mathf.Cos(i)*.82f,.02f,Mathf.Sin(i)*.65f),.27f,i%2==0?Color.white:new Color(1,.72f,.22f));}
  void BuildDecoration(){var rng=new System.Random(9307+levelId*31);string biome=game.level.biome;int shrubs=0;int budget=CarrotQuality.High?150:90;for(int i=0;i<150;i++){if(biome=="frost"&&i%3!=0)continue;if(i>=budget)break;Vector3 p=new Vector3((float)rng.NextDouble()*15.7f-7.85f,0,(float)rng.NextDouble()*11.8f-5.9f);if(!IsFree(p,.78f)||Pond(p))continue;float edge=Mathf.Max(Mathf.Abs(p.x)/7.8f,Mathf.Abs(p.z)/5.8f);float size=.2f+(float)rng.NextDouble()*.38f;GameObject prefab=null;string token=i%6==0&&edge>.75f?"shrub":i%3==0?"rock":i%3==1?"plant":"bush";foreach(var n in nature){if(n==null)continue;string wanted=token;if(n.name.ToLowerInvariant().Contains(wanted)){prefab=n;if(rng.NextDouble()>.5)break;}}
    {string scan=biome=="frost"?(i%2==0?"MossRockA":"MossRockB"):token=="rock"?(i%2==0?"MossRockA":"MossRockB"):token=="shrub"&&shrubs<(CarrotQuality.High?5:0)?"Shrub":"Fern";if(scan=="Shrub")shrubs++;if(scan=="Fern"&&token=="shrub")token="plant";if(realNature.TryGetValue(scan,out var realistic))prefab=realistic;}
    if(prefab!=null){var obj=Instantiate(prefab,decoration);obj.name="Living "+token;obj.transform.localPosition=p;obj.transform.rotation=Quaternion.Euler(0,(float)rng.NextDouble()*360,0);var bounds=BoundsOf(obj);float h=biome=="frost"?.16f+(float)rng.NextDouble()*.23f:token=="shrub"?.85f+(float)rng.NextDouble()*.7f:token=="rock"?size:.35f+size;obj.transform.localScale*=h/Mathf.Max(.01f,bounds.size.y);GroundScan(obj,p,h);foreach(var col in obj.GetComponentsInChildren<Collider>())Destroy(col);}
    else if(token=="rock"){var stone=Primitive("Weathered stone",PrimitiveType.Sphere,p+Vector3.up*size*.3f,new Vector3(size,size*.65f,size*.8f),Material("loose-rock-"+biome,biome=="frost"?new Color(.85f,.9f,.94f):new Color(.78f,.8f,.62f),1,.22f,0,1.6f),decoration);stone.transform.localRotation=Quaternion.Euler(22,i*19,13);}
    else Flower(p,size,biome=="frost"?new Color(.63f,.81f,1):i%3==0?new Color(.74f,.48f,.86f):Color.white);
   }
   BuildLandscapeFrames();BuildTreeline();if(biome!="frost")for(int i=0;i<20;i++){Vector3 p=new Vector3((float)rng.NextDouble()*15.5f-7.75f,.04f,(float)rng.NextDouble()*11.6f-5.8f);if(IsFree(p,.82f)&&!Pond(p))Flower(p,.18f+(float)rng.NextDouble()*.11f,i%3==0?new Color(.67f,.39f,.77f):new Color(1,.89f,.59f));}
  }
  void BuildGrass(){
   if(game.level.biome=="frost")return;
   var random=new System.Random(4091+game.level.id*83);var vertices=new List<Vector3>();var uv=new List<Vector2>();var colors=new List<Color>();var triangles=new List<int>();
   int patches=CarrotQuality.High?1000:500,bladesPer=CarrotQuality.High?9:6;for(int patch=0;patch<patches;patch++){
    Vector3 center=new Vector3((float)random.NextDouble()*17-8.5f,0,(float)random.NextDouble()*13-6.5f);if(!IsFree(center,.59f)||Pond(center))continue;
    float density=Mathf.PerlinNoise(center.x*.8f+35,center.z*.8f+22);if(density<.39f)continue;
    for(int blade=0;blade<bladesPer;blade++){
     Vector3 p=center+new Vector3(((float)random.NextDouble()-.5f)*.32f,.045f,((float)random.NextDouble()-.5f)*.32f);if(PathDistance(p)<.45f)continue;p.y=TerrainHeight(p)+.015f;
     float angle=(float)random.NextDouble()*Mathf.PI*2,height=.08f+(float)random.NextDouble()*.24f,width=.013f+(float)random.NextDouble()*.024f;
     Vector3 side=new Vector3(Mathf.Cos(angle),0,Mathf.Sin(angle))*width,lean=new Vector3(Mathf.Sin(angle),0,Mathf.Cos(angle))*height*.34f;
     int k=vertices.Count;vertices.Add(p-side);vertices.Add(p+side);vertices.Add(p+Vector3.up*height*.55f-side*.55f+lean*.35f);vertices.Add(p+Vector3.up*height*.55f+side*.55f+lean*.35f);vertices.Add(p+Vector3.up*height+lean);
     Color bottom=game.level.biome=="marsh"?new Color(.11f,.28f,.10f):new Color(.15f,.35f,.055f);Color tip=Color.Lerp(new Color(.3f,.55f,.095f),new Color(.48f,.63f,.13f),(float)random.NextDouble());
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
    PlaceScanned(hero,anchors[i],frost?1.15f+(i%3)*.35f:i==0?1.1f:.7f+(i%3)*.2f,i*67+levelId*17);
    if(!frost&&CarrotQuality.High&&i%2==0)PlaceScanned("Shrub",anchors[i]+new Vector3(i%2==0?-.7f:.7f,0,.55f),1.35f+(i%3)*.20f,levelId*37+i*89);
    for(int j=0;j<2;j++){float angle=(j*1.7f+i)*Mathf.PI*.65f;Vector3 p=anchors[i]+new Vector3(Mathf.Cos(angle)*.8f,0,Mathf.Sin(angle)*.65f);if(IsFree(p,.85f))PlaceScanned(frost?"MossRockB":"Fern",p,frost?.25f:.45f+j*.06f,j*83+i*41);}
   }
  }
  /// <summary>Taller silhouettes on the border hills: low-poly trees (snow pines in frost), a garden fence line, fallen logs and extra boulders. All static and batched by material.</summary>
  void BuildTreeline(){
   string biome=game.level.biome;var rng=new System.Random(5101+levelId*17);bool high=CarrotQuality.High;
   var bark=Material("tree-bark",new Color(.5f,.36f,.2f),2,.3f);
   var leaf=Material("tree-leaf-"+biome,biome=="frost"?new Color(.17f,.3f,.21f):biome=="marsh"?new Color(.16f,.3f,.17f):new Color(.19f,.36f,.1f),-1,.18f);leaf.SetFloat("_Translucency",.3f);leaf.SetFloat("_Wind",.008f);leaf.SetFloat("_SnowStrength",1);leaf.SetFloat("_AlbedoSaturation",.8f);
   int count=high?26:16;
   for(int i=0;i<count;i++){
    float a=i/(float)count*Mathf.PI*2+(float)rng.NextDouble()*.2f;float rx=11.2f+(float)rng.NextDouble()*2.8f,rz=8.4f+(float)rng.NextDouble()*2.4f;
    Vector3 p=new Vector3(Mathf.Cos(a)*rx,0,Mathf.Sin(a)*rz);
    if(p.z<-6.8f||(p.z<-3.5f&&Mathf.Abs(p.x)>9.2f))continue;   // the landscape camera looks in from -z: keep the front approach and the bottom corners open
    if(p.x<-9.5f&&p.z<4.5f)p.x-=2.4f;      // the portrait camera looks in from -x: push those crowns out of its frame
    float h=(biome=="frost"?2.3f:2.7f)*(.8f+(float)rng.NextDouble()*.6f);Tree(p,h,(float)rng.NextDouble()*360,bark,leaf,biome,rng,!high);
   }
   // A few trees on the inner slopes where there is room, away from pads and routes.
   for(int i=0;i<(high?6:3);i++){Vector3 p=new Vector3((float)rng.NextDouble()*17-8.5f,0,5.9f+(float)rng.NextDouble()*2.4f);if(IsFree(p,1.6f))Tree(p,(biome=="frost"?1.9f:2.2f)*(.85f+(float)rng.NextDouble()*.4f),(float)rng.NextDouble()*360,bark,leaf,biome,rng,!high);}
   if(biome=="garden"){
    var rail=Material("fence-wood",new Color(.62f,.45f,.26f),2,.3f);
    for(int seg=0;seg<2;seg++){Vector3 start=seg==0?new Vector3(-5.6f,0,7.25f):new Vector3(8.7f,0,-1.8f);Vector3 dir=seg==0?Vector3.right:Vector3.forward;int posts=seg==0?11:5;
     for(int k=0;k<posts;k++){Vector3 p=start+dir*(k*1.1f);float y=TerrainHeight(p);Primitive("Fence post",PrimitiveType.Cylinder,p+Vector3.up*(y+.24f),new Vector3(.09f,.26f,.09f),rail,decoration,true);
      if(k<posts-1){Vector3 q=start+dir*((k+.5f)*1.1f);float yq=TerrainHeight(q);var r1=Primitive("Fence rail",PrimitiveType.Cube,q+Vector3.up*(yq+.42f),new Vector3(1.1f,.05f,.05f),rail,decoration);r1.transform.localRotation=Quaternion.LookRotation(dir)*Quaternion.Euler(0,90,0);var r2=Primitive("Fence rail",PrimitiveType.Cube,q+Vector3.up*(yq+.26f),new Vector3(1.1f,.05f,.05f),rail,decoration);r2.transform.localRotation=r1.transform.localRotation;}}}
   }
   int logs=biome=="frost"?2:3;for(int i=0;i<logs;i++){Vector3 p=new Vector3((float)rng.NextDouble()*16-8,0,(float)rng.NextDouble()*3+6.2f);if(!IsFree(p,1.2f))continue;var log=Primitive("Fallen log",PrimitiveType.Cylinder,p+Vector3.up*(TerrainHeight(p)+.14f),new Vector3(.3f,.75f,.3f),bark,decoration);log.transform.localRotation=Quaternion.Euler(0,(float)rng.NextDouble()*360,90);}
   if(biome=="frost")for(int i=0;i<(high?6:3);i++){float a=(float)rng.NextDouble()*Mathf.PI;Vector3 p=new Vector3(Mathf.Cos(a)*(9.8f+(float)rng.NextDouble()*2),0,6.6f+Mathf.Sin(a)*2.2f);if(p.x<-9.5f)p.x-=2;PlaceScanned(i%2==0?"MossRockA":"MossRockB",p,.9f+(float)rng.NextDouble()*.6f,(float)rng.NextDouble()*360);}
  }
  void Tree(Vector3 p,float h,float yaw,Material bark,Material leaf,string biome,System.Random rng,bool small){
   float ground=TerrainHeight(p);var root=new GameObject("Border tree");root.transform.SetParent(decoration,false);root.transform.localPosition=new Vector3(p.x,ground-.05f,p.z);root.transform.localRotation=Quaternion.Euler(0,yaw,0);
   float trunk=h*.42f;Primitive("Trunk",PrimitiveType.Cylinder,new Vector3(0,trunk*.5f,0),new Vector3(h*.085f,trunk*.5f,h*.085f),bark,root.transform,true);
   if(biome=="frost"){for(int t=0;t<3;t++){float y=h*(.4f+t*.19f);float w=h*(.66f-t*.16f);Primitive("Pine tier",PrimitiveType.Sphere,new Vector3(0,y,0),new Vector3(w,h*.24f,w),leaf,root.transform,small);}Primitive("Pine tip",PrimitiveType.Sphere,new Vector3(0,h*.95f,0),new Vector3(h*.18f,h*.16f,h*.18f),leaf,root.transform,small);}
   else{int blobs=4;for(int b=0;b<blobs;b++){float ang=b*1.9f+(float)rng.NextDouble()*1.2f;float r=h*(.12f+(float)rng.NextDouble()*.06f);Vector3 c=new Vector3(Mathf.Cos(ang)*r,h*(.56f+b*.11f),Mathf.Sin(ang)*r);float w=h*(.46f-b*.07f)*(.9f+(float)rng.NextDouble()*.2f);var blob=Primitive("Canopy",PrimitiveType.Sphere,c,new Vector3(w,w*.74f,w),leaf,root.transform,small);blob.transform.localRotation=Quaternion.Euler((float)rng.NextDouble()*30,(float)rng.NextDouble()*360,0);}}
  }
  void GroundScan(GameObject obj,Vector3 p,float height){var b=BoundsOf(obj);obj.transform.position+=Vector3.up*(TerrainHeight(p)-b.min.y-Mathf.Min(.1f,height*.06f));}
  void PlaceScanned(string kind,Vector3 p,float height,float rotation){if(!realNature.TryGetValue(kind,out var prefab))return;var obj=Instantiate(prefab,decoration);obj.transform.localPosition=p;obj.transform.localRotation=Quaternion.Euler(0,rotation,0);var bounds=BoundsOf(obj);obj.transform.localScale*=height/Mathf.Max(.01f,bounds.size.y);GroundScan(obj,p,height);foreach(var c in obj.GetComponentsInChildren<Collider>())Destroy(c);}
  void Flower(Vector3 p,float height,Color petalColor){p.y=TerrainHeight(p)+.005f;GameObject prefab=null;bool white=petalColor.r>.9f&&petalColor.g>.85f;foreach(var n in nature){if(n==null)continue;if(n.name==(white?"FlowerWhite":"FlowerPurple")){prefab=n;break;}}
   if(prefab==null){var stem=Material("stem",new Color(.25f,.48f,.12f),4);Primitive("Flower stalk",PrimitiveType.Cylinder,p+Vector3.up*height*.5f,new Vector3(.018f,height*.5f,.018f),stem,decoration,true);Primitive("Flower head",PrimitiveType.Sphere,p+Vector3.up*height,new Vector3(.09f,.05f,.09f),Material("petal-"+petalColor.ToString(),petalColor),decoration,true);return;}
   var obj=Instantiate(prefab,decoration);obj.name="Meadow flower";obj.transform.localPosition=p;obj.transform.localRotation=Quaternion.Euler(0,p.x*131+p.z*57,0);var bounds=BoundsOf(obj);obj.transform.localScale*=Mathf.Max(.12f,height*1.15f)/Mathf.Max(.01f,bounds.size.y);foreach(var r in obj.GetComponentsInChildren<Renderer>()){r.shadowCastingMode=ShadowCastingMode.Off;var mats=r.sharedMaterials;for(int i=0;i<mats.Length;i++)if(mats[i]!=null&&mats[i].shader!=null&&mats[i].shader.name!="Carrot/Storybook")mats[i]=Material("flower-"+mats[i].name,mats[i].color,-1,.3f);r.sharedMaterials=mats;}foreach(var c in obj.GetComponentsInChildren<Collider>())Destroy(c);}
  void CombineDecoration(){var groups=new Dictionary<Material,List<CombineInstance>>();var remove=new List<GameObject>();foreach(var f in decoration.GetComponentsInChildren<MeshFilter>()){var r=f.GetComponent<MeshRenderer>();if(r==null||f.sharedMesh==null||!f.sharedMesh.isReadable)continue;var mats=r.sharedMaterials;for(int s=0;s<f.sharedMesh.subMeshCount&&s<mats.Length;s++){if(mats[s]==null)continue;if(!groups.TryGetValue(mats[s],out var list)){list=new List<CombineInstance>();groups[mats[s]]=list;}list.Add(new CombineInstance{mesh=f.sharedMesh,subMeshIndex=s,transform=decoration.worldToLocalMatrix*f.transform.localToWorldMatrix});}r.enabled=false;remove.Add(f.gameObject);}foreach(var pair in groups){var mesh=new Mesh{name="Batched natural details",indexFormat=IndexFormat.UInt32};mesh.CombineMeshes(pair.Value.ToArray(),true,true);var batch=MeshObject("Natural detail batch",mesh,pair.Key,decoration);string mn=pair.Key.name;if(mn.StartsWith("path-stone")||mn.StartsWith("padstones")||mn.StartsWith("padsoil")||mn.StartsWith("flower-")||mn.StartsWith("petal-")||mn=="stem"||mn=="pollen")batch.GetComponent<Renderer>().shadowCastingMode=ShadowCastingMode.Off;}foreach(var go in remove){var filter=go.GetComponent<MeshFilter>();var renderer=go.GetComponent<MeshRenderer>();if(filter!=null)Destroy(filter);if(renderer!=null)Destroy(renderer);}}
  Actor Spawn(string path,Transform parent,string kind,int tier){GameObject prefab=Resources.Load<GameObject>(path);var root=new GameObject(kind+" actor");root.transform.SetParent(parent,false);GameObject model;if(prefab!=null)model=Instantiate(prefab,root.transform);else{model=new GameObject("Missing model "+path);model.transform.SetParent(root.transform,false);Debug.LogError("Missing required Carrot model: "+path);}model.transform.localPosition=Vector3.zero;var actor=new Actor{root=root,model=model.transform,modelScale=model.transform.localScale,modelRotation=model.transform.localRotation,kind=kind,tier=tier,renderers=model.GetComponentsInChildren<Renderer>(true),animation=model.GetComponentInChildren<Animation>(true),bounds=BoundsOf(model)};actor.turret=Find(model.transform,"Turret");actor.core=Find(model.transform,"Core");actor.barrel=Find(model.transform,"Barrel");actor.petals=Find(model.transform,"Petals");actor.pages=Find(model.transform,"Pages");actor.muzzle=Find(model.transform,"Muzzle");if(actor.barrel!=null)actor.barrelRest=actor.barrel.localPosition;actor.ring=Find(model.transform,"Ring01");if(actor.ring!=null)actor.ringRest=actor.ring.localPosition;actor.bells=new[]{Find(model.transform,"Bell01"),Find(model.transform,"Bell02"),Find(model.transform,"Bell03")};if(actor.turret!=null)actor.turretYaw=actor.turret.rotation;if(actor.turret!=null&&kind!="carrot")BuildAimRig(actor);float diameter=kind=="garden"||kind=="marsh"||kind=="frost"&&path.Contains("Bosses")?1.65f:kind=="carrot"?1.1f:.9f;actor.shadow=ContactShadow(root.transform,diameter);actor.shadowSize=diameter;return actor;}
  void BuildAimRig(Actor actor){
   // Animation Rigging: the turret yaws and the barrel pitches toward a target transform the view moves through a spring.
   var model=actor.model.gameObject;var animator=model.GetComponent<Animator>();if(animator==null)animator=model.AddComponent<Animator>();
   var rigGo=new GameObject("Aim rig");rigGo.transform.SetParent(actor.model,false);var rig=rigGo.AddComponent<Rig>();
   var target=new GameObject("Aim target");target.transform.SetParent(actor.root.transform,false);target.transform.localPosition=new Vector3(0,.35f,-2);actor.aimTarget=target.transform;
   var yaw=new GameObject("Turret yaw").AddComponent<MultiAimConstraint>();yaw.transform.SetParent(rigGo.transform,false);var yd=yaw.data;yd.constrainedObject=actor.turret;var sources=new WeightedTransformArray();sources.Add(new WeightedTransform(target.transform,1));yd.sourceObjects=sources;yd.aimAxis=MultiAimConstraintData.Axis.Z_NEG;yd.upAxis=MultiAimConstraintData.Axis.Y;yd.worldUpType=MultiAimConstraintData.WorldUpType.SceneUp;yd.constrainedXAxis=false;yd.constrainedYAxis=true;yd.constrainedZAxis=false;yd.limits=new Vector2(-180,180);yaw.data=yd;yaw.weight=1;
   if(actor.barrel!=null){var pitch=new GameObject("Barrel pitch").AddComponent<MultiAimConstraint>();pitch.transform.SetParent(rigGo.transform,false);var pd=pitch.data;pd.constrainedObject=actor.barrel;var sources2=new WeightedTransformArray();sources2.Add(new WeightedTransform(target.transform,1));pd.sourceObjects=sources2;pd.aimAxis=MultiAimConstraintData.Axis.Z_NEG;pd.upAxis=MultiAimConstraintData.Axis.Y;pd.worldUpType=MultiAimConstraintData.WorldUpType.SceneUp;pd.constrainedXAxis=true;pd.constrainedYAxis=false;pd.constrainedZAxis=false;pd.limits=actor.kind=="mortar"?new Vector2(-40,4):new Vector2(-28,6);pitch.data=pd;pitch.weight=1;}
   var builder=model.GetComponent<RigBuilder>();if(builder==null)builder=model.AddComponent<RigBuilder>();builder.layers.Add(new RigLayer(rig,true));if(builder.Build())actor.rig=builder;else Debug.LogWarning("Carrot aim rig failed for "+actor.kind);animator.enabled=false;
  }
  Transform ContactShadow(Transform parent,float diameter){
   if(!materials.TryGetValue("contact-shadow",out var m)){m=new Material(Shader.Find("Carrot/Contact"));m.SetColor("_Color",new Color(.055f,.075f,.085f,.31f));materials["contact-shadow"]=m;}
   var go=Primitive("Contact shadow",PrimitiveType.Quad,Vector3.zero,new Vector3(diameter,diameter,.01f),m,parent);go.transform.rotation=Quaternion.Euler(-90,0,0);var r=go.GetComponent<Renderer>();r.shadowCastingMode=ShadowCastingMode.Off;r.receiveShadows=false;return go.transform;
  }
  static Transform Find(Transform root,string name){if(root.name==name)return root;foreach(Transform child in root){var match=Find(child,name);if(match!=null)return match;}return null;}
  static Bounds BoundsOf(GameObject obj){var rs=obj.GetComponentsInChildren<Renderer>(true);if(rs.Length==0)return new Bounds(Vector3.zero,Vector3.one);var b=rs[0].bounds;for(int i=1;i<rs.Length;i++)b.Encapsulate(rs[i].bounds);return b;}
  void Clickable(Actor a,string type,int id,float size){var click=a.root.AddComponent<CarrotClickable>();click.type=type;click.id=id;var col=a.root.AddComponent<BoxCollider>();col.center=Vector3.up*size*.5f;col.size=new Vector3(size*.85f,size,size*.85f);}
  void UpdateActors(float dt){seen.Clear();
   foreach(var t in game.towers){seen.Add(t.id);if(!towers.TryGetValue(t.id,out var a)||a.tier!=t.tier){bool upgrade=a!=null;if(a!=null){effects.Echo(a.root,a.root.transform.position,a.root.transform.position+Vector3.up*.12f,.3f);Destroy(a.root);}a=Spawn("Carrot/Models/Towers/"+t.kind+"-"+t.tier,world,t.kind,t.tier);Clickable(a,"tower",t.id,1.25f);towers[t.id]=a;a.spawnClock=clock;a.upgraded=upgrade;}
    var def=CarrotData.Tower(t.kind);float interval=def!=null?def.interval[Mathf.Clamp(t.tier-1,0,def.interval.Length-1)]:1;float charge=interval>0?Mathf.Clamp01(1-t.cooldown/interval):1;float since=Mathf.Max(0,game.elapsed-t.lastShot);float age=clock-a.spawnClock;
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
    if(a.petals!=null)RotatePart(a.petals,Quaternion.Euler(-14*charge-10*Mathf.Exp(-since*6),Mathf.Sin(clock*1.4f)*3,0));
    if(a.pages!=null)RotatePart(a.pages,Quaternion.Euler(Mathf.Sin(clock*3.1f)*5+Mathf.Sin(clock*44)*22*Mathf.Exp(-since*10),0,0));
    foreach(var bell in a.bells)if(bell!=null)RotatePart(bell,Quaternion.Euler(0,0,8*Mathf.Sin(since*20)*Mathf.Exp(-since*4)));
    Color glow=Color.black;if(spinner)glow=CarrotEffects.Tone(t.kind)*(.04f+.14f*charge);if(t.disabledFor>0)glow+=new Color(.17f,.35f,.5f)*.12f;else if(t.slowFor>0)glow+=new Color(.17f,.35f,.5f)*.04f;if(age<.1f&&a.upgraded)glow+=Color.white*.6f;Flash(a,glow);
    if(pads.TryGetValue(t.pad,out var pad))pad.GetComponent<SphereCollider>().enabled=false;}
   RemoveMissing(towers,seen);
   seen.Clear();foreach(var e in game.enemies){seen.Add(e.id);if(!enemies.TryGetValue(e.id,out var a)){string path=string.IsNullOrEmpty(e.boss)?"Carrot/Models/Enemies/"+(e.kind=="fragment"?"crystal":e.kind):"Carrot/Models/Bosses/"+e.boss;a=Spawn(path,world,e.kind,1);if(e.kind=="fragment"){a.modelScale*=.45f;a.model.localScale=a.modelScale;}Clickable(a,"enemy",e.id,string.IsNullOrEmpty(e.boss)?.85f:2.1f);enemies[e.id]=a;a.tone=e.kind=="crystal"||e.kind=="fragment"?CarrotEffects.Tone("frost"):e.kind=="shaman"||e.kind=="swarm"?CarrotEffects.Tone("marsh"):new Color(1,.6f,.2f);}
    bool boss=!string.IsNullOrEmpty(e.boss);if(e.alive&&e.speed>a.baseSpeed&&game.elapsed>=e.slowUntil)a.baseSpeed=e.speed;
    // Jolt is a damped spring on a presentation offset; EnemyState is never written.
    a.joltVel+=(-a.jolt*90-a.joltVel*12)*dt;a.jolt+=a.joltVel*dt;
    Vector3 position=e.position+a.jolt;float bob=0;if(e.air)bob=.7f+Mathf.Sin(e.age*6)*.07f;else if(e.kind=="nibble")bob=Mathf.Abs(Mathf.Sin(e.age*6))*.075f;else if(e.kind=="swarm")bob=Mathf.Abs(Mathf.Sin(e.age*7))*.04f;position.y+=bob+.07f;if(e.hidden)position.y-=.4f;
    if(e.alive&&!e.air&&!e.hidden&&e.speed>0){float strideRate=a.baseSpeed>0?e.speed/a.baseSpeed:1;float period=boss?.9f:e.kind=="dash"?.28f:e.kind=="shell"?.36f:e.kind=="swarm"?.3f:e.kind=="shaman"?.5f:e.kind=="burrow"?.45f:e.kind=="crystal"||e.kind=="fragment"?.4f:.42f;a.stride+=dt*strideRate;if(a.stride>=period){a.stride=0;effects.FootDust(e.position,boss?6:2,boss?.35f:.17f,boss);}}
    if(!e.alive)a.deadClock+=dt;float dead=e.alive?0:Mathf.Max(e.deadFor,a.deadClock);if(!e.alive)position.y-=.10f*dead;
    a.root.transform.position=position;if(a.shadow!=null){a.shadow.position=e.position+Vector3.up*.062f;float shadowScale=e.air?Mathf.Clamp01(1-bob/1.2f):1;a.shadow.localScale=new Vector3(a.shadowSize*shadowScale,a.shadowSize*shadowScale,.01f);a.shadow.gameObject.SetActive(e.alive&&!e.hidden);}
    Vector3 direction=e.direction;direction.y=0;if(direction.sqrMagnitude>.0001f&&e.alive)a.root.transform.rotation=Quaternion.Slerp(a.root.transform.rotation,Quaternion.LookRotation(direction),dt*10);
    a.hitRemaining=Mathf.Max(0,a.hitRemaining-dt);float hitAge=.35f-a.hitRemaining;bool hitting=a.hitRemaining>0;
    Vector3 stretch=Vector3.one;if(e.kind=="swarm")stretch=new Vector3(1+Mathf.Sin(e.age*7)*.1f,1-Mathf.Sin(e.age*7)*.12f,1+Mathf.Sin(e.age*7)*.1f);
    if(hitting){float squash=Mathf.Exp(-hitAge*9)*Mathf.Sin(hitAge*28);stretch+=(a.heavyHit?new Vector3(.14f,-.18f,.14f):new Vector3(.16f,-.22f,.16f))*squash*(boss?.4f:1);}
    bool frozen=e.alive&&e.speed<=0&&e.castRemaining<=0&&e.biteRemaining<=0&&!e.hidden;if(frozen)stretch=Vector3.Scale(stretch,new Vector3(1,.97f,1));
    float scale=1;if(!e.alive){scale=dead<.08f?1+dead/.08f*.15f:dead<.16f?1.15f-(dead-.08f)/.08f*.15f:1;if(e.kind=="crystal"||e.kind=="fragment")scale=dead>.05f?.001f:scale;}
    if(e.castRemaining>0){stretch+=new Vector3(-.025f,.045f,-.025f)*Mathf.Sin(clock*5);if(e.boss=="garden")a.model.localRotation=Quaternion.Euler(-Mathf.Sin(clock*4)*5,0,0)*a.modelRotation;else if(e.boss=="frost")a.model.localRotation=Quaternion.Euler(-8,0,0)*a.modelRotation;}
    else if(!e.alive)a.model.localRotation=Quaternion.Euler(EaseOutCubic(Mathf.Min(1,dead/.5f))*78,0,Mathf.Sin(dead*5)*6)*a.modelRotation;
    else a.model.localRotation=Quaternion.Euler(Mathf.Sin(e.age*4)*1.2f,0,0)*a.modelRotation;
    a.model.localScale=Vector3.Scale(a.modelScale,stretch)*Mathf.Max(.001f,scale)*ActorScale;
    float factor=a.baseSpeed>0?Mathf.Clamp(e.speed/a.baseSpeed,.25f,1.6f):1;float animSpeed=dt==0?0:frozen?.15f:(e.speed<=0&&e.castRemaining<=0&&e.biteRemaining<=0&&e.alive)?0:game.speed*viewScale*(e.castRemaining>0||e.biteRemaining>0||!e.alive?1:factor);
    if(a.animation!=null)Animate(a,!e.alive?"death":e.biteRemaining>0||e.castRemaining>0?"attack":"walk",animSpeed,factor>.85f);
    float flashAmt=hitting?(hitAge<.06f?1:Mathf.Exp(-(hitAge-.06f)*20))*.55f*(boss?.5f:1):0;
    Color emission=new Color(1,.95f,.85f)*flashAmt;if(e.hidden)emission=new Color(.015f,.014f,.01f);if(e.castRemaining>0)emission+=CarrotEffects.Tone(e.ability)*(.025f+.025f*Mathf.Sin(clock*8));
    bool slowed=e.alive&&game.elapsed<e.slowUntil&&e.slowFactor<1;if(slowed)emission+=new Color(.16f,.3f,.5f)*(1-e.slowFactor);
    Color tint=slowed?Color.Lerp(Color.white,new Color(.62f,.82f,1),.6f):Color.white;
    // Bark armour: the boss glows bark-orange for the whole armour window; the mantle shield reads as an icy tint.
    bool armoured=boss&&e.alive&&e.ability=="bark"&&e.abilityRemaining>0&&e.castRemaining<=0;if(armoured){emission+=new Color(.55f,.3f,.08f)*(.22f+.12f*Mathf.Sin(clock*6));tint=Color.Lerp(tint,new Color(1,.8f,.55f),.35f);}
    if(boss&&e.alive&&e.shield>0)tint=Color.Lerp(tint,new Color(.7f,.88f,1),.5f);
    if(boss)effects.BossAura(e.position,e.boss,CarrotEffects.Tone(e.boss),e.alive&&!e.hidden,dt);
    float dissolve=!e.alive&&!(e.kind=="crystal"||e.kind=="fragment")?Mathf.Clamp01((dead-.3f)/.5f):0;
    Surface(a,emission,tint,dissolve,a.tone);
    var col=a.root.GetComponent<Collider>();col.enabled=e.alive&&!e.hidden;}
   RemoveMissing(enemies,seen);bool anyBoss=false;foreach(var e in game.enemies)if(!string.IsNullOrEmpty(e.boss)){anyBoss=true;break;}if(!anyBoss)effects.BossAura(Vector3.zero,"",Color.white,false,0);seen.Clear();foreach(var b in game.blockers){seen.Add(b.id);if(!blockers.TryGetValue(b.id,out var a)){a=CreateBlocker(b);blockers[b.id]=a;}a.root.transform.position=new Vector3(b.position.x,TerrainHeight(b.position)+.015f,b.position.z);}RemoveMissing(blockers,seen);
   foreach(var pair in pads){bool occupied=false;foreach(var t in game.towers)if(t.pad==pair.Key){occupied=true;break;}if(!occupied)foreach(var b in game.blockers)if(b.pad==pair.Key){occupied=true;break;}pair.Value.GetComponent<SphereCollider>().enabled=!occupied;}
  }
  Actor CreateBlocker(BlockerState b){var root=new GameObject("Scenery "+b.kind);root.transform.SetParent(world,false);var material=Material("block-"+b.kind,b.kind=="root"?new Color(.39f,.4f,.18f):game.level.biome=="frost"?new Color(.73f,.84f,.91f):new Color(.52f,.43f,.27f),b.kind=="root"?2:1);if(b.kind=="root"){for(int i=0;i<5;i++){float angle=i*Mathf.PI*2/5;var twig=Primitive("Snare knot",PrimitiveType.Capsule,new Vector3(Mathf.Cos(angle)*.15f,.25f,Mathf.Sin(angle)*.15f),new Vector3(.13f,.32f,.13f),material,root.transform);twig.transform.localRotation=Quaternion.Euler(32,angle*Mathf.Rad2Deg,24);}}else{GameObject prefab=null;if(!realNature.TryGetValue(b.kind.Contains("stump")?"Stump":"MossRockA",out prefab))foreach(var n in nature)if(n.name.ToLowerInvariant().Contains(b.kind.Contains("stump")?"stump":"rock")){prefab=n;break;}if(prefab!=null){var model=Instantiate(prefab,root.transform);float h=BoundsOf(model).size.y;model.transform.localScale*=.6f/Mathf.Max(.1f,h);model.transform.position-=Vector3.up*BoundsOf(model).min.y;foreach(var c in model.GetComponentsInChildren<Collider>())Destroy(c);}else{for(int i=0;i<3;i++){var rock=Primitive("Mossy obstacle",PrimitiveType.Sphere,new Vector3((i-1)*.15f,.2f+i*.05f,0),new Vector3(.4f,.45f,.43f),material,root.transform);rock.transform.localRotation=Quaternion.Euler(i*18,i*44,16);}}}var a=new Actor{root=root,model=root.transform,kind=b.kind,modelScale=Vector3.one,renderers=root.GetComponentsInChildren<Renderer>()};Clickable(a,"blocker",b.id,.75f);return a;}
  void RemoveMissing(Dictionary<int,Actor> actors,HashSet<int> ids){removeIds.Clear();foreach(var item in actors)if(!ids.Contains(item.Key))removeIds.Add(item.Key);foreach(int id in removeIds){Destroy(actors[id].root);actors.Remove(id);}}
  void Flash(Actor actor,Color c){Surface(actor,c,Color.white,0,Color.black);}
  static bool ColorNear(Color a,Color b){return Mathf.Abs(a.r-b.r)+Mathf.Abs(a.g-b.g)+Mathf.Abs(a.b-b.b)<.004f;}
  void Surface(Actor actor,Color emission,Color tint,float dissolve,Color edge){if(actor.lastDissolve==dissolve&&ColorNear(actor.lastEmission,emission)&&ColorNear(actor.lastTint,tint))return;actor.lastEmission=emission;actor.lastTint=tint;actor.lastDissolve=dissolve;bool plain=emission.maxColorComponent<.001f&&ColorNear(tint,Color.white)&&dissolve<=0;properties.Clear();if(!plain){properties.SetColor("_EmissionColor",emission);properties.SetColor("_Color",tint);properties.SetFloat("_Dissolve",dissolve);properties.SetColor("_DissolveEdge",edge);}foreach(var r in actor.renderers)if(r!=null)r.SetPropertyBlock(plain?null:properties);}
  static float EaseOut(float t){return 1-(1-t)*(1-t);}
  static float EaseOutCubic(float t){return 1-Mathf.Pow(1-t,3);}
  static float Bounce(float t){const float n1=7.5625f,d1=2.75f;if(t<1/d1)return n1*t*t;if(t<2/d1){t-=1.5f/d1;return n1*t*t+.75f;}if(t<2.5f/d1){t-=2.25f/d1;return n1*t*t+.9375f;}t-=2.625f/d1;return n1*t*t+.984375f;}
  void PlayHit(Actor a){if(a.animation==null)return;if(a.hitClip==null){a.hitClip="";foreach(AnimationState state in a.animation){string n=state.name.ToLowerInvariant();if(n.Contains("hit")||n.Contains("damage")||(a.kind=="shell"&&n.Contains("jump"))){a.hitClip=state.name;break;}}}if(a.hitClip=="")return;var s=a.animation[a.hitClip];s.layer=1;s.blendMode=AnimationBlendMode.Additive;s.wrapMode=WrapMode.Once;s.weight=1;s.speed=a.kind=="shell"?2.2f:1;a.animation.CrossFade(a.hitClip,.05f,PlayMode.StopSameLayer);}
  void Animate(Actor a,string action,float speed,bool run){string requested=null,fallback=null;foreach(AnimationState state in a.animation){if(state.layer==1)continue;string n=state.name.ToLowerInvariant();bool match=false;if(action=="walk"){if(n.Contains("fly")||(run?n.Contains("run"):n.Contains("walk")))match=true;else if(n.Contains("walk")||n.Contains("run"))fallback=state.name;}else if(action=="death")match=n.Contains("death")||n.Contains("die");else match=n.Contains("attack")||n.Contains("punch")||n.Contains("bite")||n.Contains("headbutt");if(match){requested=state.name;break;}}if(requested==null)requested=fallback;if(requested==null)foreach(AnimationState state in a.animation){if(state.layer==0&&state.name.ToLowerInvariant().Contains("idle")){requested=state.name;break;}}if(requested!=null&&requested!=a.currentClip){a.currentClip=requested;a.animation[requested].wrapMode=action=="death"?WrapMode.ClampForever:WrapMode.Loop;a.animation.CrossFade(requested,action=="death"?.2f:.18f,PlayMode.StopSameLayer);}float layerSpeed=speed==0?0:game.speed*viewScale;foreach(AnimationState state in a.animation)state.speed=state.layer==1?layerSpeed:speed;}
  void UpdateCarrot(float dt){if(carrot==null)return;carrotHit=Mathf.Max(0,carrotHit-dt);bool hurt=carrotHit>0,lost=game.phase=="lost",won=game.phase=="won";
   if(game.wave!=lastWave){if(lastWave>0&&game.phase=="playing")carrotHop=.3f;lastWave=game.wave;}carrotHop=Mathf.Max(0,carrotHop-dt);float hopT=carrotHop>0?1-carrotHop/.3f:0;float hop=Mathf.Sin(hopT*Mathf.PI)*.08f;
   float t=.6f-carrotHit;float idle=Mathf.Sin(clock*2)*.012f;float tiltAmount=hurt?14*Mathf.Exp(-t*6)*Mathf.Sin(t*20):0;float dip=hurt?-.04f*Mathf.Exp(-Mathf.Abs(t-.08f)*25):0;bool weak=game.health<=3&&!lost&&!won;float shiver=weak?.015f*Mathf.Sin(clock*42):0;
   SetFace(hurt||lost,won,hurt?(t<.25f?.24f:.6f):lost?.5f:hopT>0&&hopT<.6f?.15f:1);
   carrot.model.localScale=Vector3.Scale(carrot.modelScale,new Vector3(1+shiver,1+idle-shiver,1+shiver));
   Vector3 axis=Vector3.Cross(Vector3.up,carrotHitDir);if(axis.sqrMagnitude<.01f)axis=Vector3.right;
   carrot.model.localRotation=Quaternion.AngleAxis(tiltAmount,Quaternion.Inverse(carrot.root.transform.rotation)*axis.normalized)*Quaternion.Euler(lost?-10:0,0,won?Mathf.Sin(clock*9)*5:0)*carrot.modelRotation;
   carrot.root.transform.position=carrotPosition+Vector3.up*(.02f+hop+dip+(won?Mathf.Abs(Mathf.Sin(clock*5))*.14f:0));carrot.root.transform.localScale=Vector3.one*1.35f*ActorScale;if(carrot.shadow!=null)carrot.shadow.position=carrotPosition+Vector3.up*.06f;
   var leaves=Find(carrot.model,"Leaves");if(leaves!=null)RotatePart(leaves,Quaternion.Euler(Mathf.Sin(clock*2.4f)*4+(hurt?22*Mathf.Exp(-t*4):0)+(weak?-12:0),won?clock*450:0,Mathf.Sin(clock*1.6f)*3));
   var patch=Find(carrot.model,"BitePatch");if(patch!=null)patch.gameObject.SetActive(game.health<10);
   float wave=hopT>0?35*Mathf.Sin(hopT*Mathf.PI):0;var left=Find(carrot.model,"ArmL");var right=Find(carrot.model,"ArmR");
   if(left!=null)RotatePart(left,Quaternion.Euler(0,0,won?-45+Mathf.Sin(clock*8)*12:lost?-10:hurt?-22:-wave+Mathf.Sin(clock*2)*3));if(right!=null)RotatePart(right,Quaternion.Euler(0,0,won?45-Mathf.Sin(clock*8)*12:lost?10:hurt?22:wave-Mathf.Sin(clock*2)*3));}
  void RotatePart(Transform part,Quaternion offset){if(!restRotations.TryGetValue(part,out var rest)){rest=part.localRotation;restRotations[part]=rest;}part.localRotation=rest*offset;}
  void SetFace(bool hurt,bool happy,float eyeY=1){if(carrot==null)return;foreach(var name in new[]{"MouthSmile","MouthHurt","MouthHappy"}){var part=Find(carrot.model,name);if(part!=null)part.gameObject.SetActive(name=="MouthHurt"?hurt:name=="MouthHappy"?happy&&!hurt:!hurt&&!happy);}float blink=Mathf.Pow(Mathf.Max(0,Mathf.Sin(clock*.8f)),35);foreach(var name in new[]{"EyeL","EyeR"}){var eye=Find(carrot.model,name);if(eye!=null){if(!eyeScales.TryGetValue(eye,out var rest)){rest=eye.localScale;eyeScales[eye]=rest;}eye.localScale=Vector3.Scale(rest,new Vector3(1,hurt?eyeY:Mathf.Min(eyeY,1-blink*.85f),1));}}}
  void OnEffect(CarrotEvent e){
   if(e.type=="level"){levelId=-1;return;}
   // Combat positions lie on the ground; the render event aims at the physical muzzle and airborne body.
   var visual=new CarrotEvent(e.type,e.kind,e.position,e.to,e.id,e.target,e.tier,e.value,e.duration);
   if(e.type=="shot"){
    // Shots leave the physical muzzle; chained hops and bounces leave the previous target's body.
    if(towers.TryGetValue(e.id,out var source)&&Vector3.Distance(source.root.transform.position-Vector3.up*.02f,e.position)<.3f){
     if(source.muzzle!=null)visual.position=source.muzzle.position;
     else visual.position=e.position+Vector3.up*.72f;
     source.lastShotClock=clock;
    }else visual.position=AirPoint(e.position,e.id)+Vector3.up*.3f;
    visual.to=AirPoint(e.to,e.target)+Vector3.up*.28f;
   }else if(e.type=="hit"||e.type=="impact"){
    visual.position=AirPoint(e.position,e.target);visual.to=AirPoint(e.to,e.target);
   }else if(e.type=="ability"&&e.kind=="prismFocus")visual.to=AirPoint(e.to,e.target);
   if(!(e.type=="bossEnter"&&bossEntrance!=null))effects.Handle(visual);sound.Handle(e);
   if(e.type=="ability"&&e.kind=="rewind"&&enemies.TryGetValue(e.target,out var rewinding))effects.Echo(rewinding.root,e.position,e.to,e.duration);
   if(e.type=="bossEnter"){bossIntro=2.6f;bossFocus=e.position;if(bossEntrance!=null)pendingBoss=e.id;}
   if(e.type=="carrotHit"){carrotHit=.6f;carrotHitDir=e.position-carrotPosition;carrotHitDir.y=0;fovPunch=1;}
   if(e.type=="hit"&&enemies.TryGetValue(e.target,out var a)){a.hitRemaining=.35f;a.heavyHit=e.kind=="mortar"||e.kind=="thunder";bool big=a.kind=="garden"||a.kind=="marsh"||a.kind=="frost";if(towers.TryGetValue(e.id,out var src)){Vector3 d=e.position-src.root.transform.position;d.y=0;if(d.sqrMagnitude>.01f)a.jolt=d.normalized*(big?.025f:.07f);}PlayHit(a);sound.Creature(a.kind,"hit",e.position);}
  }
  Vector3 AirPoint(Vector3 p,int preferred){
   foreach(var enemy in game.enemies){if(!enemy.air)continue;if(enemy.id!=preferred&&Vector3.Distance(enemy.position,p)>.18f)continue;if(Vector3.Distance(enemy.position,p)>.6f)continue;return p+Vector3.up*(.7f+Mathf.Sin(enemy.age*6)*.07f);}
   return p;
  }
  LineRenderer CreateRing(string name,Color color,float width){var go=new GameObject(name);go.transform.SetParent(transform,false);var line=go.AddComponent<LineRenderer>();line.sharedMaterial=new Material(Shader.Find("Carrot/FxAdditive"));line.sharedMaterial.SetColor("_Color",Color.white);line.startColor=line.endColor=color;line.positionCount=65;line.loop=true;line.useWorldSpace=true;line.widthMultiplier=width;line.shadowCastingMode=ShadowCastingMode.Off;line.receiveShadows=false;line.enabled=false;materials["ring-"+name]=line.sharedMaterial;return line;}
  readonly Dictionary<string,GameObject> ghosts=new Dictionary<string,GameObject>();readonly Dictionary<string,Renderer[]> ghostRenderers=new Dictionary<string,Renderer[]>();GameObject activeGhost;
  /// <summary>A hologram of the tier-1 tower for the build preview: the prefab with every material swapped for an additive tint. Built once per kind on first use (a UI action, never per frame).</summary>
  GameObject Ghost(string kind){if(string.IsNullOrEmpty(kind))return null;if(ghosts.TryGetValue(kind,out var g))return g;var prefab=Resources.Load<GameObject>("Carrot/Models/Towers/"+kind+"-1");if(prefab==null){ghosts[kind]=null;return null;}if(!materials.TryGetValue("ghost",out var ghostMaterial)){ghostMaterial=new Material(Shader.Find("Carrot/FxAdditive"));ghostMaterial.SetFloat("_UseAtlas",0);ghostMaterial.SetFloat("_Soft",0);materials["ghost"]=ghostMaterial;}g=Instantiate(prefab,transform);g.name="Build ghost "+kind;foreach(var c in g.GetComponentsInChildren<Collider>(true))Destroy(c);foreach(var c in g.GetComponentsInChildren<Animation>(true))Destroy(c);foreach(var c in g.GetComponentsInChildren<Animator>(true))Destroy(c);var rs=g.GetComponentsInChildren<Renderer>(true);foreach(var r in rs){var mats=r.sharedMaterials;for(int i=0;i<mats.Length;i++)mats[i]=ghostMaterial;r.sharedMaterials=mats;r.shadowCastingMode=ShadowCastingMode.Off;r.receiveShadows=false;}g.SetActive(false);ghosts[kind]=g;ghostRenderers[kind]=rs;return g;}
  void UpdateSelection(){Vector3 p=Vector3.zero;float range=0,radius=.49f;bool valid=false;TowerDef preview=null;if(game.selectionType=="pad"&&game.selectionId>=0&&game.selectionId<game.level.pads.Length){p=game.level.pads[game.selectionId];preview=CarrotData.Tower(game.PreviewKind);if(preview!=null)range=preview.range[0];valid=true;}else if(game.selectionType=="tower"){foreach(var t in game.towers)if(t.id==game.selectionId){p=t.position;range=CarrotData.Tower(t.kind).range[t.tier-1];valid=true;break;}}else if(game.selectionType=="enemy"){foreach(var e in game.enemies)if(e.id==game.selectionId&&e.alive){p=e.position;radius=string.IsNullOrEmpty(e.boss)?.4f:.85f;valid=true;break;}}else if(game.selectionType=="blocker"){foreach(var b in game.blockers)if(b.id==game.selectionId){p=b.position;valid=true;break;}}selectionRing.enabled=valid;rangeRing.enabled=valid&&range>0;if(valid){PlotRing(selectionRing,p,radius+.015f*Mathf.Sin(clock*4),.16f);if(range>0)PlotRing(rangeRing,p,range,.12f);}
   GameObject wanted=valid&&preview!=null?Ghost(preview.id):null;if(activeGhost!=wanted){if(activeGhost!=null)activeGhost.SetActive(false);activeGhost=wanted;if(activeGhost!=null)activeGhost.SetActive(true);}
   if(activeGhost!=null){activeGhost.transform.position=new Vector3(p.x,TerrainHeight(p)+.02f,p.z);activeGhost.transform.localScale=Vector3.one*ActorScale;bool affordable=game.coins>=preview.cost[0];Color gc=affordable?new Color(.35f,1,.5f,.6f):new Color(1,.35f,.3f,.6f);gc.a*=.8f+.2f*Mathf.Sin(clock*5);properties.Clear();properties.SetColor("_Color",gc);foreach(var r in ghostRenderers[preview.id])if(r!=null)r.SetPropertyBlock(properties);}}
  static void PlotRing(LineRenderer l,Vector3 p,float radius,float y){for(int i=0;i<65;i++){float angle=i*Mathf.PI*2/64;l.SetPosition(i,p+new Vector3(Mathf.Cos(angle)*radius,y,Mathf.Sin(angle)*radius));}}
  public void ResetView(string unused){targetZoom=1;targetPan=Vector3.zero;pointerDown=dragging=false;pinchDistance=0;}
  void FitCamera(){
   lastWidth=Screen.width;lastHeight=Screen.height;
   #if UNITY_WEBGL && !UNITY_EDITOR
   float cssWidth=Carrot_CanvasCSSWidth();inputPixelScale=cssWidth>0?Screen.width/cssWidth:1;
   #endif
   bool portrait=GameCamera.aspect<.85f;
   if(portrait!=portraitCamera){zoom=targetZoom=1;pan=targetPan=Vector3.zero;pointerDown=dragging=false;pinchDistance=0;}
   portraitCamera=portrait;cameraAngle=portrait?Quaternion.Euler(50,88,0):Quaternion.Euler(34,-9,0);cameraTarget=new Vector3(0,.35f,.2f);fitDistance=0;
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
   fovPunch=Mathf.Max(0,fovPunch-viewDt*4);
   // Gaussian depth of field follows the live camera distance so only the far field softens (the hero shot and orbit sit much closer).
   if(grade!=null&&grade.profile!=null&&grade.profile.TryGet<DepthOfField>(out var dofLive)){float d=Vector3.Distance(GameCamera.transform.position,cameraTarget+pan);dofLive.gaussianStart.value=d+6;dofLive.gaussianEnd.value=d+24;}
   // The play rig: Cinemachine damps toward it every frame and the impulse listener adds shaped shakes.
   rig.position=cameraTarget+pan;float push=defeatClock>=0?Mathf.Lerp(1,.92f,Mathf.Clamp01(defeatClock/1.4f)):1;body.m_FollowOffset=-(cameraAngle*Vector3.forward)*(fitDistance*push/zoom);vcamPlay.transform.rotation=cameraAngle;vcamPlay.m_Lens.FieldOfView=38-fovPunch*(portraitCamera?1:1.6f);
   if(carrot!=null){Vector3 face=GameCamera.transform.position-carrotPosition;face.y=0;if(face.sqrMagnitude>.01f)carrot.root.transform.rotation=Quaternion.Slerp(carrot.root.transform.rotation,Quaternion.LookRotation(face)*Quaternion.Euler(0,180,0),1-Mathf.Exp(-dt*10));}
  }
  bool GroundPoint(Vector2 screen,out Vector3 point){var ray=GameCamera.ScreenPointToRay(screen);var plane=new Plane(Vector3.up,Vector3.zero);if(plane.Raycast(ray,out var distance)){point=ray.GetPoint(distance);return true;}point=Vector3.zero;return false;}
  void ClampPan(){float fraction=Mathf.Max(0,1-1/targetZoom);float extra=portraitCamera?1.7f:0;targetPan.x=Mathf.Clamp(targetPan.x,-7.5f*fraction-extra,7.5f*fraction+extra);targetPan.z=Mathf.Clamp(targetPan.z,-5.5f*fraction-extra,5.5f*fraction+extra);targetPan.y=0;if(targetZoom<=1.015f&&!portraitCamera)targetPan=Vector3.zero;}
  void UpdateInput(){
   if(Input.touchCount>=2){
    Touch a=Input.GetTouch(0),b=Input.GetTouch(1);float distance=Vector2.Distance(a.position,b.position);Vector2 midpoint=(a.position+b.position)*.5f;
    if(pinchDistance>0){targetZoom=Mathf.Clamp(targetZoom*distance/pinchDistance,1,portraitCamera?2.5f:2.1f);Vector2 previous=midpoint-(a.deltaPosition+b.deltaPosition)*.5f;if(targetZoom>1.015f&&GroundPoint(previous,out var from)&&GroundPoint(midpoint,out var to))targetPan+=from-to;ClampPan();}
    pinchDistance=distance;pointerDown=false;dragging=false;suppressTouchClick=true;return;
   }
   pinchDistance=0;if(suppressTouchClick){if(Input.touchCount==0)suppressTouchClick=false;else return;}
   bool down=Input.GetMouseButtonDown(0),held=Input.GetMouseButton(0),up=Input.GetMouseButtonUp(0);Vector2 p=Input.mousePosition;
   if(Input.touchCount==1){var touch=Input.GetTouch(0);p=touch.position;down=touch.phase==TouchPhase.Began;held=touch.phase==TouchPhase.Moved||touch.phase==TouchPhase.Stationary||down;up=touch.phase==TouchPhase.Ended;if(touch.phase==TouchPhase.Canceled){pointerDown=false;return;}}
   if(down){pointerStart=pointerPrevious=p;pointerDown=true;dragging=false;sound.Unlock();}
   float dragThreshold=(portraitCamera?8:10)*inputPixelScale;
   if(held&&pointerDown){if((p-pointerStart).sqrMagnitude>dragThreshold*dragThreshold)dragging=true;if(dragging&&(targetZoom>1.015f||portraitCamera)&&GroundPoint(pointerPrevious,out var from)&&GroundPoint(p,out var to)){targetPan+=from-to;ClampPan();}pointerPrevious=p;}
   if(up&&pointerDown){pointerDown=false;if(!dragging)SelectAt(p);}
   float scroll=Input.mouseScrollDelta.y;if(Mathf.Abs(scroll)>.01f){targetZoom=Mathf.Clamp(targetZoom+scroll*.12f,1,portraitCamera?2.5f:2.1f);ClampPan();}
  }
  void SelectAt(Vector2 point){
   Ray ray=GameCamera.ScreenPointToRay(point);var hits=Physics.RaycastAll(ray,100);Array.Sort(hits,(a,b)=>a.distance.CompareTo(b.distance));
   foreach(var hit in hits){var target=hit.collider.GetComponentInParent<CarrotClickable>();if(target!=null){game.Select(target.type,target.id);return;}}
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
