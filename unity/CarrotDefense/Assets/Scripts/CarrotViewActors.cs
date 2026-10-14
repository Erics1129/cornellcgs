using System.Collections.Generic;
using UnityEngine;

namespace CarrotTD {
 // Per-actor animation and the carrot hero's face and limbs (characters stream; moved out of CarrotView.cs at giant-update T0).
 // Everything here is allocation-free per frame: clip names, AnimationState arrays, gait data and the carrot's parts are cached once.
 public sealed partial class CarrotView {
  /// <summary>Clips and gait of one Animation, resolved once (lower-case matching happens only here).</summary>
  sealed class ActorClips {
   public AnimationState[] states;public string walk,run,fly,attack,death,idleA,idleB,hit;public bool walkIsFlight;
   public float gaitSpeed,runSpeed;public float idleClock,idleSwapAt=5;public bool idleOnB;public int seed;
  }
  readonly Dictionary<Animation,ActorClips> actorClips=new Dictionary<Animation,ActorClips>();
  readonly List<Animation> staleClips=new List<Animation>();
  /// <summary>Foot slide of the last walking actor sampled (fraction of ground speed the clamp could not absorb), for QA.</summary>
  public static float LastFootSlide{get;private set;}
  public static float WorstFootSlide{get;private set;}

  ActorClips Clips(Actor a){
   if(actorClips.TryGetValue(a.animation,out var c))return c;
   if(actorClips.Count>256){staleClips.Clear();foreach(var pair in actorClips)if(pair.Key==null)staleClips.Add(pair.Key);foreach(var key in staleClips)actorClips.Remove(key);}
   c=new ActorClips();var list=new List<AnimationState>();
   foreach(AnimationState state in a.animation){
    list.Add(state);string n=state.name.ToLowerInvariant();
    if(n.Contains("hit")||n.Contains("damage")||(a.kind=="shell"&&n.Contains("jump"))){if(c.hit==null)c.hit=state.name;continue;}
    if(n.Contains("death")||n.Contains("die")){if(c.death==null)c.death=state.name;continue;}
    if(n.Contains("attack")||n.Contains("punch")||n.Contains("bite")||n.Contains("headbutt")){if(c.attack==null)c.attack=state.name;continue;}
    if(n.Contains("fly")&&!n.Contains("idle")){if(c.fly==null)c.fly=state.name;continue;}
    if(n.Contains("run")){if(c.run==null)c.run=state.name;continue;}
    if(n.Contains("walk")){if(c.walk==null)c.walk=state.name;continue;}
    if(n.Contains("idle")&&c.idleA==null)c.idleA=state.name;
   }
   c.states=list.ToArray();
   var gait=a.model.GetComponentInChildren<CarrotGait>(true);
   if(gait!=null){if(!string.IsNullOrEmpty(gait.idleA))c.idleA=gait.idleA;if(!string.IsNullOrEmpty(gait.idleB))c.idleB=gait.idleB;c.gaitSpeed=gait.walkSpeed;c.runSpeed=gait.runSpeed;}
   if(c.fly!=null&&c.walk==null)c.walkIsFlight=true;
   c.seed=a.animation.GetInstanceID()&1023;c.idleSwapAt=4+3*Hash01(c.seed);
   actorClips[a.animation]=c;return c;
  }
  static float Hash01(int n){n=(n<<13)^n;return ((n*(n*n*15731+789221)+1376312589)&0x7fffffff)/2147483647f;}

  void PlayHit(Actor a){if(a.asunaMotion!=null){if(a.heavyHit&&clock-a.asunaHitAt>.9f){a.asunaHitAt=clock;a.asunaMotion.TriggerHit();}return;}if(a.animation==null)return;
   var c=Clips(a);if(a.hitClip==null)a.hitClip=c.hit??"";if(a.hitClip=="")return;
   // Additive flinch weighted by the blow: heavy shells and bolts rock the whole body, routine shots only twitch it; guardians barely flinch.
   bool big=a.kind=="garden"||a.kind=="marsh"||a.kind=="frost"||a.kind=="orchard"||a.kind=="zombie"||CarrotEffects.ExpansionMini(a.kind);
   var s=a.animation[a.hitClip];s.layer=1;s.blendMode=AnimationBlendMode.Additive;s.wrapMode=WrapMode.Once;s.weight=(a.heavyHit?1f:.55f)*(big?.5f:1f);s.speed=a.kind=="shell"?2.2f:1;a.animation.CrossFade(a.hitClip,.05f,PlayMode.StopSameLayer);}

  /// <summary>
  /// Locomotion, attack, death and idle selection with 0.25 s blends. Walks are stride-synced: the playback rate is the creature's
  /// world ground speed over the clip's measured ground speed (CarrotGait, scaled to the actor's size), clamped to 0.6-1.6x, so feet
  /// plant instead of skating. A creature that stops (but is not paused or frozen) settles into its idle and alternates two idle
  /// clips every 4-7 s. Hit flinches stay on layer 1 at the view clock.
  /// </summary>
  void Animate(Actor a,string action,float speed,bool run){
   var c=Clips(a);float viewRate=game.speed*viewScale;bool halted=game.paused||viewRate<=0;
   string requested=null;float rate=speed;
   if(action=="death")requested=c.death;
   else if(action=="attack")requested=c.attack;
   else{
    bool standing=speed<=0&&!halted;
    if(standing&&c.idleA!=null){
     c.idleClock+=Time.deltaTime;if(c.idleClock>=c.idleSwapAt&&c.idleB!=null){c.idleClock=0;c.idleOnB=!c.idleOnB;c.idleSwapAt=(c.idleOnB?2.2f:4f)+3*Hash01(c.seed+(int)(clock*7));}
     requested=c.idleOnB&&c.idleB!=null?c.idleB:c.idleA;rate=viewRate;
    }else{
     requested=c.fly??(run&&c.run!=null?c.run:c.walk)??c.run;
     if(c.fly==null&&speed>0&&viewRate>0&&a.baseSpeed>0&&(c.gaitSpeed>0||c.runSpeed>0)){
      // speed = view rate x clamp(e.speed / baseSpeed); recover the ground speed in world units per game second. CarrotGait measured
      // the clips in prefab-root units; the model's lossy scale carries the actor, phone and squash scales.
      float ground=speed/viewRate*a.baseSpeed,scale=Mathf.Abs(a.model.lossyScale.x);
      float walkIdeal=c.gaitSpeed>0?ground/(c.gaitSpeed*scale):0,runIdeal=c.runSpeed>0?ground/(c.runSpeed*scale):0;
      // Walk or run, whichever needs the playback rate closest to 1x (a slow shaman walks, a sprinting bunny runs).
      // A 0.15 hysteresis keeps an actor near the boundary from flickering between the two clips.
      float runScore=runIdeal>0?Mathf.Abs(Mathf.Log(runIdeal)):99,walkScore=walkIdeal>0?Mathf.Abs(Mathf.Log(walkIdeal)):99;
      bool useRun=runIdeal>0&&(a.currentClip==c.run?runScore<walkScore+.15f:runScore+.15f<walkScore);
      if(useRun||walkIdeal>0){
       requested=useRun?c.run:c.walk;float ideal=useRun?runIdeal:walkIdeal;
       // 0.2-3x: the measured strides put skittering mites near 3x and the slow guardians near 0.2x; feet plant at either end.
       float clamped=Mathf.Clamp(ideal,.2f,3f);
       LastFootSlide=Mathf.Abs(ideal-clamped)/Mathf.Max(.0001f,ideal);if(LastFootSlide>WorstFootSlide)WorstFootSlide=LastFootSlide;
       rate=clamped*viewRate;
      }
     }
    }
   }
   if(requested==null)requested=c.idleA;
   if(requested!=null&&requested!=a.currentClip&&!halted){
    a.currentClip=requested;var st=a.animation[requested];st.wrapMode=action=="death"?WrapMode.ClampForever:WrapMode.Loop;
    a.animation.CrossFade(requested,action=="death"?.2f:.25f,PlayMode.StopSameLayer);
   }
   float layerSpeed=viewRate;if(halted){rate=0;layerSpeed=0;}
   var states=c.states;for(int i=0;i<states.Length;i++){var st=states[i];st.speed=st.layer==1?layerSpeed:rate;}
  }

  #if UNITY_EDITOR || CARROT_QA
  /// <summary>QA only: drives every live enemy's Animate and the carrot face/limbs <paramref name="repeats"/> times and returns the managed bytes allocated (after a warm-up pass).</summary>
  public long QaActorAllocations(int repeats){
   for(int pass=0;pass<2;pass++){
    long before=pass==1?System.GC.GetAllocatedBytesForCurrentThread():0;
    for(int r=0;r<(pass==0?2:repeats);r++){
     foreach(var pair in enemies){var a=pair.Value;if(a.animation==null||a.asunaMotion!=null)continue;Animate(a,(r&3)==3?"attack":"walk",game.speed,false);}
     UpdateCarrot(.016f);
    }
    if(pass==1)return System.GC.GetAllocatedBytesForCurrentThread()-before;
   }
   return -1;
  }
  #endif
  // ---------- carrot hero ----------
  sealed class CarrotParts {public GameObject owner;public Transform leaves,patch,armL,armR,eyeL,eyeR;public GameObject smile,hurt,happy;public Vector3 eyeRestL,eyeRestR;public float blinkAt=2.5f,blinkStart=-9;public int blinkCount;public bool doubleBlink;}
  CarrotParts carrotParts;
  CarrotParts Parts(){
   if(carrotParts!=null&&carrotParts.owner==carrot.root)return carrotParts;
   var p=new CarrotParts{owner=carrot.root};p.leaves=Find(carrot.model,"Leaves");p.patch=Find(carrot.model,"BitePatch");p.armL=Find(carrot.model,"ArmL");p.armR=Find(carrot.model,"ArmR");p.eyeL=Find(carrot.model,"EyeL");p.eyeR=Find(carrot.model,"EyeR");
   var s=Find(carrot.model,"MouthSmile");var h=Find(carrot.model,"MouthHurt");var y=Find(carrot.model,"MouthHappy");p.smile=s!=null?s.gameObject:null;p.hurt=h!=null?h.gameObject:null;p.happy=y!=null?y.gameObject:null;
   if(p.eyeL!=null){if(!eyeScales.TryGetValue(p.eyeL,out p.eyeRestL)){p.eyeRestL=p.eyeL.localScale;eyeScales[p.eyeL]=p.eyeRestL;}}
   if(p.eyeR!=null){if(!eyeScales.TryGetValue(p.eyeR,out p.eyeRestR)){p.eyeRestR=p.eyeR.localScale;eyeScales[p.eyeR]=p.eyeRestR;}}
   carrotParts=p;return p;
  }

  void UpdateCarrot(float dt){if(carrot==null)return;var parts=Parts();carrotHit=Mathf.Max(0,carrotHit-dt);bool hurt=carrotHit>0,lost=game.phase=="lost",won=game.phase=="won";
   if(game.wave!=lastWave){if(lastWave>0&&game.phase=="playing")carrotHop=.3f;lastWave=game.wave;}carrotHop=Mathf.Max(0,carrotHop-dt);float hopT=carrotHop>0?1-carrotHop/.3f:0;float hop=Mathf.Sin(hopT*Mathf.PI)*.08f;
   // Breathing: a slow 4 s inhale/exhale, 1.5 % taller on the in-breath with a volume-preserving narrow; faster and shallower when weak.
   bool weak=game.health<=3&&!lost&&!won;float breathRate=weak?2.6f:1.57f;float breath=Mathf.Sin(clock*breathRate)*(weak?.009f:.015f);
   float t=.6f-carrotHit;float tiltAmount=hurt?14*Mathf.Exp(-t*6)*Mathf.Sin(t*20):0;float dip=hurt?-.04f*Mathf.Exp(-Mathf.Abs(t-.08f)*25):0;float shiver=weak?.015f*Mathf.Sin(clock*42):0;
   SetFace(hurt||lost,won,hurt?(t<.25f?.24f:.6f):lost?.5f:hopT>0&&hopT<.6f?.15f:1);
   carrot.model.localScale=Vector3.Scale(carrot.modelScale,new Vector3(1+shiver-breath*.35f,1+breath-shiver,1+shiver-breath*.35f));
   Vector3 axis=Vector3.Cross(Vector3.up,carrotHitDir);if(axis.sqrMagnitude<.01f)axis=Vector3.right;
   carrot.model.localRotation=Quaternion.AngleAxis(tiltAmount,Quaternion.Inverse(carrot.root.transform.rotation)*axis.normalized)*Quaternion.Euler(lost?-10:0,0,won?Mathf.Sin(clock*9)*5:0)*carrot.modelRotation;
   carrot.root.transform.position=carrotPosition+Vector3.up*(.02f+hop+dip+(won?Mathf.Abs(Mathf.Sin(clock*5))*.14f:0));carrot.root.transform.localScale=Vector3.one*1.35f*ActorScale;if(carrot.shadow!=null)carrot.shadow.position=carrotPosition+Vector3.up*.06f;
   if(parts.leaves!=null)RotatePart(parts.leaves,Quaternion.Euler(Mathf.Sin(clock*2.4f)*4+(hurt?22*Mathf.Exp(-t*4):0)+(weak?-12:0),won?clock*450:0,Mathf.Sin(clock*1.6f)*3));
   if(parts.patch!=null&&parts.patch.gameObject.activeSelf!=(game.health<10))parts.patch.gameObject.SetActive(game.health<10);
   float wave=hopT>0?35*Mathf.Sin(hopT*Mathf.PI):0;
   if(parts.armL!=null)RotatePart(parts.armL,Quaternion.Euler(0,0,won?-45+Mathf.Sin(clock*8)*12:lost?-10:hurt?-22:-wave+Mathf.Sin(clock*2)*3));if(parts.armR!=null)RotatePart(parts.armR,Quaternion.Euler(0,0,won?45-Mathf.Sin(clock*8)*12:lost?10:hurt?22:wave-Mathf.Sin(clock*2)*3));}
  void RotatePart(Transform part,Quaternion offset){if(!restRotations.TryGetValue(part,out var rest)){rest=part.localRotation;restRotations[part]=rest;}part.localRotation=rest*offset;}
  /// <summary>Mouth state and eyelids. The hero blinks on an irregular 3-6 s rhythm (a quick 0.16 s close-open, one in four a double blink).</summary>
  void SetFace(bool hurt,bool happy,float eyeY=1){if(carrot==null)return;var p=Parts();
   bool smile=!hurt&&!happy,happyFace=happy&&!hurt;
   if(p.smile!=null&&p.smile.activeSelf!=smile)p.smile.SetActive(smile);if(p.hurt!=null&&p.hurt.activeSelf!=hurt)p.hurt.SetActive(hurt);if(p.happy!=null&&p.happy.activeSelf!=happyFace)p.happy.SetActive(happyFace);
   if(clock>=p.blinkAt){p.blinkStart=clock;p.blinkCount++;p.doubleBlink=Hash01(p.blinkCount*31+7)<.25f;p.blinkAt=clock+3+3*Hash01(p.blinkCount*17+3);}
   // A level rebuild resets the view clock: re-arm the rhythm instead of waiting out the old schedule.
   if(clock<p.blinkStart-.01f||p.blinkAt-clock>7){p.blinkStart=-9;p.blinkAt=clock+3;}
   float since=clock-p.blinkStart,blink=0;
   if(since>=0&&since<.16f)blink=Mathf.Sin(since/.16f*Mathf.PI);else if(p.doubleBlink&&since>=.24f&&since<.40f)blink=Mathf.Sin((since-.24f)/.16f*Mathf.PI);
   float y=hurt?eyeY:Mathf.Min(eyeY,1-blink*.9f);
   if(p.eyeL!=null)p.eyeL.localScale=new Vector3(p.eyeRestL.x,p.eyeRestL.y*y,p.eyeRestL.z);if(p.eyeR!=null)p.eyeR.localScale=new Vector3(p.eyeRestR.x,p.eyeRestR.y*y,p.eyeRestR.z);}
 }
}
