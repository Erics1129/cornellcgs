using System;
using System.Collections.Generic;
using UnityEngine;

namespace CarrotTD {
 // Cue design: layered plant signatures, kills, bites, risers, judgements, deadlines, coins, heartbeat and ducks.
 public sealed partial class CarrotAudio {
  public static readonly string[] SynthLayers={"SigSeed","SigMortar","SigFrost","SigPrism","SigStorm","SigThunder","SigBook","SigGravity","SigBlossom","SigStarfruit","SigBamboo","SigChili","SigLotus","SigMagnet","SigOrchid","SigMushroom","SigCactus","SigClockflower","SigDragonfruit","SigMoonflower","SubThump","ImpactBoom","KillPop","KillPopB","EliteBurst","SuperForge","PhaseBreak","BossFall","AlarmDeadline75","AlarmDeadline90","WaveHorn","Heartbeat","HealChime","CoinTick","TornadoWind","ZombieGroan","EyeballShriek","HoldDown","HoldUp","IncomingAir","IncomingGround"};
  // Plant family signature: a recorded transient (bank or clip) under a synthesised body/tail.
  struct Sig {public string bank,clip,body;public float tp,tv,bp,bv,gap;}
  static Sig S(string bank,float tp,float tv,string body,float bv,float gap,string clip=null,float bp=1){return new Sig{bank=bank,clip=clip,tp=tp,tv=tv,body=body,bp=bp,bv=bv,gap=gap};}
  public static readonly string[] PlantFamilies={"seed","mortar","frost","prism","storm","thunder","book","gravity","blossom","starfruit","bamboo","chili","lotus","magnet","orchid","mushroom","cactus","clockflower","dragonfruit","moonflower"};
  static readonly Dictionary<string,Sig> ShotSigs=new Dictionary<string,Sig>{
   {"seed",S("Grass",1.55f,.045f,"SigSeed",.05f,.085f)},
   {"mortar",S("Wood",.66f,.09f,"SigMortar",.1f,.18f)},
   {"frost",S("Snow",1.25f,.06f,"SigFrost",.05f,.13f)},
   {"prism",S("GlassLight",1.35f,.04f,"SigPrism",.045f,.15f)},
   {"storm",S("Slice",1.25f,.05f,"SigStorm",.06f,.15f)},
   {"thunder",S("Slice",.7f,.06f,"SigStorm",.07f,.3f,bp:.62f)},
   {"book",S(null,1,.08f,"SigBook",.06f,.2f,clip:"Page")},
   {"gravity",S(null,.57f,.05f,"SigGravity",.08f,.3f,clip:"BookOpen")},
   {"blossom",S("Grass",.75f,.07f,"SigBlossom",.05f,.25f)},
   {"starfruit",S("Slice",1.5f,.05f,"SigStarfruit",.05f,.15f)},
   {"bamboo",S("Wood",1.45f,.05f,"SigBamboo",.07f,.16f)},
   {"chili",S(null,.66f,.05f,"SigChili",.06f,.16f,clip:"Chop")},
   {"lotus",S(null,1,.035f,"SigLotus",.055f,.16f,clip:"LotusDrop")},
   {"magnet",S("Metal",1.45f,.045f,"SigMagnet",.05f,.16f)},
   {"orchid",S("Snow",.71f,.04f,"SigOrchid",.05f,.16f)},
   {"mushroom",S("Soft",1.3f,.05f,"SigMushroom",.055f,.16f)},
   {"cactus",S("Grass",1.7f,.045f,"SigCactus",.05f,.16f)},
   {"clockflower",S(null,1,.035f,"SigClockflower",.05f,.2f,clip:"ClockChime")},
   {"dragonfruit",S("Wood",.65f,.08f,"SigDragonfruit",.07f,.2f)},
   {"moonflower",S(null,1,.04f,"SigMoonflower",.05f,.2f,clip:"MoonChime")},
  };
  static readonly HashSet<string> BossKinds=new HashSet<string>{"garden","marsh","frost","orchard","tornado","zombie","eyeball","portal","asuna"};
  readonly List<float> killTimes=new List<float>();float lastCascade=-9,lastPhaseBreak=-9,lastSuper=-9,heartbeatUntil,nextBeat,heartbeatBpm=72;int heartbeatHealth;
  bool judgementSeen,speedHold;readonly HashSet<string> deadlinePlayed=new HashSet<string>();
  struct RiserRequest {public int id;public string kind;public float windup;public bool mini;}
  readonly List<RiserRequest> risers=new List<RiserRequest>();
  struct DuckEnv {public float start,attackEnd,holdEnd,releaseEnd,gain;}
  readonly List<DuckEnv> ducks=new List<DuckEnv>();
  readonly Dictionary<string,AudioClip> riserCache=new Dictionary<string,AudioClip>();readonly List<string> riserOrder=new List<string>();
  readonly Dictionary<string,AudioClip> judgementCache=new Dictionary<string,AudioClip>();

  void ResetRun(){heartbeatUntil=0;deadlinePlayed.Clear();speedHold=false;killTimes.Clear();ducks.Clear();}

  // ---------------- ducks ----------------
  /// <summary>Music duck on the bus (dB depth, attack, hold, release) plus a C# mirror of its envelope for the ambience bed.</summary>
  void DuckMusic(float db,float attack,float hold,float release){
   Carrot_BusDuck(db,attack,hold,release);
   ducks.Add(new DuckEnv{start=soundClock,attackEnd=soundClock+attack,holdEnd=soundClock+attack+hold,releaseEnd=soundClock+attack+hold+release,gain=Mathf.Pow(10,db/20)});
   if(ducks.Count>16)ducks.RemoveAt(0);
  }
  float DuckGain(){float g=1;for(int i=ducks.Count-1;i>=0;i--){var d=ducks[i];if(soundClock>=d.releaseEnd){ducks.RemoveAt(i);continue;}float v=soundClock<d.attackEnd?Mathf.Lerp(1,d.gain,(soundClock-d.start)/Mathf.Max(.001f,d.attackEnd-d.start)):soundClock<d.holdEnd?d.gain:Mathf.Lerp(d.gain,1,(soundClock-d.holdEnd)/Mathf.Max(.001f,d.releaseEnd-d.holdEnd));g=Mathf.Min(g,v);}return g;}

  // ---------------- contract v2 events (balance stream); unknown types fall through untouched ----------------
  bool HandleContract(CarrotEvent e){
   switch(e.type){
    case "telegraph":QueueRiser(e);return false;
    case "judgement":judgementSeen=true;Judgement(e.kind);return true;
    case "bossDeadline":Deadline(e.value,e.id);return true;
    case "speedHold":{bool on=e.value>.5f;if(on!=speedHold){speedHold=on;Play(on?"HoldDown":"HoldUp",.07f,1,"speedhold",.25f,priority:PSignature);Cue("speedHold",on?1:0);}return true;}
    case "waveIncoming":Incoming(e.kind,e.value);return true;
   }
   return false;
  }
  void Judgement(string kind){
   Cue("judgement:"+kind,0);
   int key=Carrot_MusicKey();
   switch(kind){
    case "leak":PlayBank("SoftHeavy",.13f,.72f,PThreat,"judge-leak",.5f);if(key>=0)PlayJudgementChord(kind,key,.12f,false);else Play("KillPop",.06f,.6f,"judge-leakpop",.5f,priority:PThreat);return;
    case "phaseBreak":if(soundClock-lastPhaseBreak>.6f)PhaseBreakSound(null);if(key>=0)PlayJudgementChord(kind,key,.16f,true);return;
    case "superForged":if(soundClock-lastSuper>.8f){Play("SuperForge",.26f,1,"judge-super",.8f,priority:PBoss);lastSuper=soundClock;}if(key>=0)PlayJudgementChord(kind,key,.12f,true);else Quantized(()=>PlayBank("Bell",.08f,1.2f,PSignature,"judge-bell",.4f));return;
    default:
     if(key>=0)PlayJudgementChord(kind,key,kind=="flawless"?.2f:kind=="saved"?.14f:.13f,true);
     else Quantized(()=>{PlayBank("Bell",kind=="flawless"?.1f:.07f,kind=="flawless"?1:1.25f,PSignature,"judge-bell",.4f);if(kind=="flawless")Play("EliteBurst",.1f,1.1f,"judge-burst",.5f,priority:PSignature);else Play("CoinTick",.06f,1,"judge-tick",.3f,priority:PSignature);});
     return;
   }
  }
  /// <summary>Celebration cues land on the next beat when the playing track has a stable tempo (at most one beat and 500 ms late); otherwise at once.</summary>
  void Quantized(Action play){float delay=Carrot_MusicBeatDelay();if(delay>0&&delay<=.5f)StartCoroutine(After(delay,play));else play();}
  System.Collections.IEnumerator After(float seconds,Action play){float until=soundClock+seconds;while(soundClock<until)yield return null;play();}
  /// <summary>Judgement chords from the orchestral Stinger palette, in the key of the playing track (root 0-11, +12 minor).</summary>
  void PlayJudgementChord(string kind,int key,float volume,bool quantize){
   string id=kind+":"+key;
   if(!judgementCache.TryGetValue(id,out var clip)){var notes=JudgementNotes(kind,key);if(notes==null)return;clip=Stinger("Judgement "+id,notes,kind=="flawless"?1.3f:kind=="leak"?.6f:kind=="phaseBreak"?1.1f:.85f,kind=="leak"?4:kind=="phaseBreak"?0:kind=="clear"?2:3);judgementCache[id]=clip;}
   if(quantize)Quantized(()=>PlayClip(clip,volume,1,PSignature,null,false,"judge-"+kind,.4f));else PlayClip(clip,volume,1,PThreat,null,false,"judge-"+kind,.4f);
  }
  public static float[] JudgementNotes(string kind,int key){
   int root=key%12;bool minor=key>=12;float tonic=261.63f*Mathf.Pow(2,root/12f);if(root>=7)tonic*=.5f;
   float third=minor?3:4;Func<float,float> n=s=>tonic*Mathf.Pow(2,s/12f);
   switch(kind){
    case "flawless":return new[]{n(0),n(third),n(7),n(12),n(14)};
    case "clear":return new[]{n(7),n(12),n(19)};
    case "leak":return new[]{n(-5),n(-6)};
    case "phaseBreak":return new[]{n(-12),n(-5),n(0)};
    case "superForged":return new[]{n(12),n(12+third),n(19),n(24)};
    case "saved":return new[]{n(0),n(5),n(7),n(third+12)};
    default:return null;
   }
  }
  /// <summary>Semitone shift from the A-based SFX palette to the playing track's tonic (-6..+5), 0 when unknown.</summary>
  public static int KeyShift(int key){if(key<0)return 0;int s=((key%12)-9+12)%12;return s>5?s-12:s;}
  void Deadline(float value,int id){
   string mark=value>=.89f?"90":value>=.74f?"75":value>=.49f?"50":null;if(mark==null||!deadlinePlayed.Add(id+":"+mark))return;
   if(mark=="90")Play("AlarmDeadline90",.24f,1,"deadline90",.5f,priority:PThreat);else if(mark=="75")Play("AlarmDeadline75",.2f,1,"deadline75",.5f,priority:PThreat);else Play("IncomingGround",.14f,.8f,"deadline50",.5f,priority:PThreat);
   DuckMusic(-4,.05f,.5f,.6f);Cue("deadline",value);
  }
  void Incoming(string kind,float count){
   switch(kind){
    case "air":Play("IncomingAir",.11f,1,"incoming-air",2,priority:PSignature);break;
    case "boss":Play("IncomingGround",.14f,.75f,"incoming-boss",2,priority:PSignature);Play("SubThump",.1f,.8f,"incoming-bosssub",2,priority:PSignature);break;
    case "mini":Play("IncomingGround",.1f,.9f,"incoming-mini",2,priority:PSignature);break;
    default:if(count>=12)Play("IncomingGround",.06f,1.05f,"incoming-ground",3,priority:PSignature);break;
   }
   Cue("incoming:"+kind,count);
  }

  // ---------------- telegraph risers ----------------
  /// <summary>The immediate windup cue (same frame as the telegraph): the caster's growl plus a material hit; the riser follows in Tick.</summary>
  void Telegraph(CarrotEvent e){
   string bossKind=e.kind=="breath"||e.kind=="mantle"||e.kind=="shatter"||e.kind=="whiteout"?"frost":e.kind=="root"||e.kind=="bark"?"garden":e.kind=="mist"||e.kind=="summon"||e.kind=="tithe"?"marsh":e.kind=="rush"||e.kind=="heap"||e.kind=="flock"||e.kind=="dusk"?"orchard":e.kind=="gust"||e.kind=="liftoff"?"tornado":e.kind=="raise"?"zombie":e.kind=="gaze"?"eyeball":"";
   // Blind and uproot are shared casts: the growl comes from whichever boss is alive (the view passes the boss through Creature on the enemy actor); here only the windup cue plays.
   if(bossKind!="")Creature(bossKind,"growl",e.position);
   if(e.kind=="meteor"||e.kind=="heal"||e.kind=="burrow")return;
   bool woody=e.kind=="root"||e.kind=="bark"||e.kind=="rush"||e.kind=="heap"||e.kind=="uproot"||e.kind=="raise",glassy=e.kind=="breath"||e.kind=="mantle"||e.kind=="whiteout"||e.kind=="gaze";
   float pitch=e.kind=="uproot"?.55f:e.kind=="blind"||e.kind=="dusk"?.5f:.63f;
   if(glassy||woody)PlayBank(glassy?"Glass":"Wood",.17f,pitch,PThreat,"bosswindup",.5f,e.position);else Play("BookOpen",.17f,pitch,"bosswindup",.5f,false,PThreat,e.position);
   if(e.kind=="uproot")Later(.3f,"Chop",.1f,.6f,"rootcreak",.4f,PThreat);
  }
  void QueueRiser(CarrotEvent e){
   if(e.kind=="meteor"||e.kind=="heal"||e.kind=="burrow")return;
   var enemy=FindEnemy(e.id);if(enemy==null)return;
   bool boss=!string.IsNullOrEmpty(enemy.boss)||BossKinds.Contains(enemy.kind),mini=!boss&&(CarrotData.IsMini(enemy.kind)||!string.IsNullOrEmpty(enemy.miniboss));
   if(!boss&&!mini)return;
   risers.Add(new RiserRequest{id=e.id,kind=e.kind,windup=Mathf.Max(.2f,e.duration),mini=mini});
   Cue("telegraph:"+e.kind,e.duration);
  }
  EnemyState FindEnemy(int id){if(game==null||game.enemies==null)return null;foreach(var x in game.enemies)if(x!=null&&x.id==id)return x;return null;}
  /// <summary>Real seconds per game second right now: 2x play halves a windup unless the simulation holds 1x for it.</summary>
  float EffectiveSpeed(){float s=game!=null?game.speed:1;return speedHold?1:Mathf.Max(.25f,s);}
  void TickCues(float dt){
   // Telegraphs queued this frame: the riser is sized to the real windup once every event of the frame (speedHold) is in.
   for(int i=0;i<risers.Count;i++){
    var r=risers[i];var enemy=FindEnemy(r.id);if(enemy==null||!enemy.alive)continue;
    float real=Mathf.Clamp(r.windup/EffectiveSpeed(),.35f,6f);
    var clip=Riser(RiserElement(r.kind),real);
    var v=PlayClip(clip,r.mini?.11f:.24f,1,PThreat,enemy.position,false,"riser-"+r.id,.25f);
    if(v!=null)v.owner=r.id;
    DuckMusic(r.mini?-3:-6,.08f,Mathf.Max(0,real-.08f),.6f);
    Cue("riser:"+r.kind,real);
   }
   risers.Clear();
   // A cancelled or committed cast stops its riser at once.
   foreach(var v in voices){if(v.owner==0||!Busy(v)||v.fadeTo>=0)continue;var enemy=FindEnemy(v.owner);if(enemy==null||!enemy.alive||enemy.castRemaining<=0){v.fadeTo=0;v.owner=0;}}
   // Heartbeat: 8 s after a bite that leaves 3 hearts or fewer, 72 -> 96 bpm as hearts fall; it fades and re-arms on the next bite.
   if(heartbeatUntil>soundClock&&soundClock>=nextBeat&&game!=null&&game.phase=="playing"){
    float left=heartbeatUntil-soundClock,fade=Mathf.Clamp01(left/2f);
    Play("Heartbeat",.24f*fade+.04f,1,"heartbeat",.2f,priority:PThreat);Cue("heartbeat",heartbeatHealth);
    nextBeat=soundClock+60f/heartbeatBpm;
   }
   if(killTimes.Count>0&&soundClock-killTimes[0]>.3f)killTimes.RemoveAt(0);
  }
  public static string RiserElement(string kind){
   switch(kind){
    case "root":case "bark":case "uproot":case "rush":case "heap":case "raise":case "graveCall":case "brambleSurge":case "thornBind":case "rally":case "graveMarch":case "harvestMoon":case "mossShield":case "emberCharge":return "earth";
    case "breath":case "mantle":case "shatter":case "whiteout":case "fieldFreeze":case "glacierLance":return "ice";
    case "blind":case "dusk":case "mist":case "summon":case "blackout":case "eyeClones":case "gaze":case "reincarnate":case "wither":case "venomMist":case "lanternFlood":return "dark";
    case "gust":case "liftoff":case "stormLock":case "portalStorm":case "cycloneCall":case "flock":return "storm";
    case "portalBlink":case "portalShift":case "portalSummon":case "sentinelRift":case "riftBlink":case "chronoField":case "mirrorSplit":return "rift";
    case "prismDash":case "prismLances":case "prismaticAegis":case "spectrumRain":case "mirrorRush":case "prismOverdrive":return "prism";
    case "tithe":case "coinLeech":return "coin";
    default:return "threat";
   }
  }
  /// <summary>Windup riser rendered to the exact real windup (50 ms grid), cached; peaks on the commit.</summary>
  AudioClip Riser(string element,float seconds){
   string id=element+":"+Mathf.RoundToInt(seconds*20);
   if(riserCache.TryGetValue(id,out var cached))return cached;
   var pcm=RenderRiser(element,Mathf.RoundToInt(seconds*20)/20f,22050);
   var clip=AudioClip.Create("Riser "+id,pcm.Length,1,22050,false);clip.SetData(pcm,0);
   riserCache[id]=clip;riserOrder.Add(id);
   if(riserOrder.Count>24){string old=riserOrder[0];riserOrder.RemoveAt(0);if(riserCache.TryGetValue(old,out var c)){riserCache.Remove(old);foreach(var v in voices)if(v.clip==c)StopVoice(v);Destroy(c);}}
   return clip;
  }
  /// <summary>Procedural windup: a band-passed noise sweep plus a rising tone cluster with accelerating tremolo, coloured per element; deterministic.</summary>
  public static float[] RenderRiser(string element,float seconds,int rate){
   int n=Mathf.Max(1,Mathf.RoundToInt(seconds*rate));var x=new float[n];uint s=0x2545F491u;foreach(char c in element){s^=c;s*=16777619u;}
   float f0=280,f1=3200,q=2.4f,glideSt=5,tremA=4,tremB=16;float[] cluster={-12,-11,-5};
   switch(element){
    case "earth":f0=120;f1=1400;q=1.6f;glideSt=4;cluster=new float[]{-24,-23,-17};break;
    case "ice":f0=900;f1=7000;q=3;glideSt=7;cluster=new float[]{7,8,14};break;
    case "dark":f0=200;f1=1800;q=2;glideSt=3;tremA=3;tremB=11;cluster=new float[]{-19,-18,-12};break;
    case "storm":f0=400;f1=5000;q=1.2f;glideSt=6;tremA=6;tremB=22;cluster=new float[]{-12,-6,0};break;
    case "rift":f0=300;f1=2600;q=4;glideSt=5;cluster=new float[]{-12,-9,-5};break;
    case "prism":f0=1200;f1=6500;q=2.2f;glideSt=12;tremA=8;tremB=24;cluster=new float[]{0,7,12};break;
    case "coin":f0=1500;f1=7000;q=2;glideSt=7;tremA=10;tremB=30;cluster=new float[]{12,16,19};break;
   }
   float ic1=0,ic2=0,b0=0,b1=0,b2=0,lp=0;double[] ph=new double[cluster.Length];double sub=0;
   for(int i=0;i<n;i++){
    float t=i/(float)rate,u=t/seconds;
    s^=s<<13;s^=s>>17;s^=s<<5;float w=(s>>8)*(1f/16777216f)*2-1;
    b0=.99765f*b0+w*.099046f;b1=.963f*b1+w*.2965164f;b2=.57f*b2+w*1.0526913f;float pink=(b0+b1+b2+w*.1848f)*.25f;
    float cut=f0*Mathf.Pow(f1/f0,u),g=Mathf.Tan(Mathf.PI*Mathf.Min(cut,rate*.45f)/rate),k=1/q,a1=1/(1+g*(g+k)),a2=g*a1,a3=g*a2;
    float v3=pink-ic2,v1=a1*ic1+a2*v3,v2=ic2+a2*ic1+a3*v3;ic1=2*v1-ic1;ic2=2*v2-ic2;
    float noise=v1*Mathf.Pow(u,1.6f)*1.4f;
    float trem=.65f+.35f*Mathf.Sin(2*Mathf.PI*Mathf.Lerp(tremA,tremB,u)*t),tone=0;
    for(int c=0;c<cluster.Length;c++){float f=440*Mathf.Pow(2,(cluster[c]+glideSt*Mathf.Pow(u,1.5f))/12f);ph[c]+=2*Math.PI*f/rate;float p=(float)ph[c];tone+=Mathf.Sin(p)+.3f*Mathf.Sin(2*p)+.12f*Mathf.Sin(3*p);}
    tone*=Mathf.Pow(u,1.3f)*trem*.2f;
    float extra=0;
    if(element=="earth"||element=="dark"){float fs=element=="earth"?50+20*u:45+10*u;sub+=2*Math.PI*fs/rate;extra=Mathf.Sin((float)sub)*Mathf.Pow(u,1.2f)*.35f;}
    if(element=="storm"&&(s&1023)<(uint)(2+60*u*u)){extra=w*.6f*u;}
    if(element=="ice"||element=="prism"||element=="coin"){lp+=(w-lp)*.5f;extra=(w-lp)*.12f*u*(element=="coin"?(.5f+.5f*Mathf.Sign(Mathf.Sin(2*Mathf.PI*Mathf.Lerp(6,24,u)*t))):1);}
    x[i]=noise+tone+extra;
   }
   float peak=0;foreach(var v in x)peak=Mathf.Max(peak,Mathf.Abs(v));float gain=peak>0?.9f/peak:1;
   int fadeIn=Mathf.Min(n,rate/50),fadeOut=Mathf.Min(n,rate/160);
   for(int i=0;i<n;i++){float v=x[i]*gain;if(i<fadeIn)v*=i/(float)fadeIn;if(i>n-fadeOut)v*=(n-i)/(float)fadeOut;x[i]=v;}
   return x;
  }

  // ---------------- plants ----------------
  void Shot(CarrotEvent e){
   if(!ShotSigs.TryGetValue(e.kind??"",out var sig))return;
   int tier=Mathf.Clamp(e.tier,1,5);bool super=tier>=5;
   float vt=(1+.07f*(tier-1))*(super?1.2f:1),pt=(1-.025f*(tier-1))*(super?.9f:1);
   string throttle="shot-"+e.kind;
   if(!unlocked||muted||paused)return;
   if(lastSound.TryGetValue(throttle,out var last)&&soundClock-last<sig.gap)return;
   lastSound[throttle]=soundClock;
   if(sig.bank!=null){var clip=bank!=null?bank.Next(sig.bank):null;PlayClip(clip,sig.tv*vt*(bank!=null?bank.Volume():1),sig.tp*pt*(bank!=null?bank.Pitch():1),PRoutine,e.position,false,null,0);}
   else if(clips.TryGetValue(sig.clip,out var c))PlayClip(c,sig.tv*vt,sig.tp*pt*(bank!=null?bank.Pitch():1),PRoutine,e.position,false,null,0);
   if(clips.TryGetValue(sig.body,out var body))PlayClip(body,sig.bv*vt,sig.bp*pt*(bank!=null?Mathf.Lerp(1,bank.Pitch(),.5f):1),PRoutine,e.position,false,null,0);
   if(super)Play("SubThump",.05f,1.3f,"supershot",.25f,priority:PSignature);
  }
  void Impact(CarrotEvent e){
   string k=e.kind??"";Vector3 at=e.position;
   switch(k){
    case "mortar":PlayBank("Wood",.13f,.7f,PKill,"blast",.14f,at);Play("ImpactBoom",.12f,1,"blastboom",.18f,false,PKill,at);if(e.tier>=3)Play("SubThump",.08f,1.1f,"blastsub",.25f,false,PKill,at);LaterBank(.08f,"SoftHeavy",.1f,.5f,PRoutine,"blastsoft",.14f);break;
    case "dragonfruit":PlayBank("Metal",.1f,.58f,PSignature,"meteor",.25f,at);Play("ImpactBoom",.14f,.9f,"meteorboom",.25f,false,PSignature,at);LaterBank(.06f,"Wood",.065f,.67f,PRoutine,"meteordebris",.25f);break;
    case "thunder":Play("SigThunder",.2f,bank!=null?bank.Pitch():1,"thundercrack",.3f,false,PSignature,at);LaterBank(.03f,"Metal",.1f,.6f,PSignature,"thunder",.3f);PlayBank("Slice",.06f,1.25f,PKill,"thunderslice",.3f,at);break;
    case "frost":PlayBank("Glass",.06f,1.2f,PRoutine,"glasshit",.14f,at);PlayBank("Snow",.05f,1.4f,PRoutine,"frostimpact",.12f,at);break;
    case "prism":PlayBank("GlassLight",.06f,1.2f,PRoutine,"glasshit",.14f,at);break;
    case "storm":PlayBank("Metal",.03f,1.6f,PRoutine,"stormhit",.12f,at);break;
    case "bamboo":case "cactus":Play("Chop",.045f,1.3f*(bank!=null?bank.Pitch():1),"impact-"+k,.17f,false,PRoutine,at);break;
    case "chili":PlayBank("Wood",.065f,.7f,PRoutine,"impact-chili",.17f,at);break;
    case "lotus":case "mushroom":Play("LotusDrop",.045f,.84f,"impact-"+k,.17f,false,PRoutine,at);break;
    case "magnet":PlayBank("Metal",.045f,1.5f,PRoutine,"impact-magnet",.17f,at);break;
    case "orchid":PlayBank("Grass",.045f,.65f,PRoutine,"impact-orchid",.17f,at);break;
    case "clockflower":Play("ClockChime",.045f,1.25f,"impact-clock",.17f,false,PRoutine,at);break;
    case "moonflower":PlayBank("Glass",.045f,1.25f,PRoutine,"impact-moon",.17f,at);break;
    default:PlayBank("Soft",.05f,1,PRoutine,"softimpact",.075f,at);break;
   }
  }

  // ---------------- kills, bites and big beats ----------------
  void Death(CarrotEvent e){
   string k=e.kind??"";
   if(BossKinds.Contains(k)){
    Play("BossFall",.3f,1,"bossfall",1,false,PThreat,e.position);PlayBank("Mining",.16f,.8f,PThreat,"bossmining",1,e.position);Play("SubThump",.2f,.7f,"bosssub",1,false,PThreat,e.position);
    Coins(8,1,"boss");DuckMusic(-9,.3f,.6f,1.4f);Cue("bossDeath:"+k,0);
    if(game!=null&&game.phase=="playing")BossDefeatedMidLevel();
    Creature(k,"death",e.position);return;
   }
   if(CarrotData.IsMini(k)){Play("EliteBurst",.16f,1,"elite",.3f,false,PElite,e.position);PlayBank("Punch",.1f,.85f,PElite,"elitepunch",.3f,e.position);Coins(3,1.1f,"elite");Creature(k,"death",e.position);Cue("eliteDeath:"+k,0);return;}
   Creature(k,"death",e.position);
   // Kill pop: bigger creatures pop lower; three kills inside 300 ms become one coin cascade instead of a ticker.
   var def=CarrotData.Enemy(k);float hp=def!=null?def.hp:40,pitch=Mathf.Clamp(1.35f-.12f*Mathf.Log(Mathf.Max(1,hp),2)/3f,.75f,1.35f);
   var clip=bank!=null?bank.Next("KillPop"):null;
   if(clip!=null)PlayClip(clip,.07f*bank.Volume(),pitch*bank.Pitch(),PKill,e.position,false,"killpop",.045f);
   PlayBank("Punch",.035f,1.2f*pitch,PRoutine,"killpunch",.09f,e.position);
   killTimes.Add(soundClock);
   if(killTimes.Count>=3&&soundClock-killTimes[killTimes.Count-3]<=.3f&&soundClock-lastCascade>.5f){lastCascade=soundClock;Coins(4,1.15f,"cascade");}
  }
  void Bite(CarrotEvent e){
   int health=Mathf.RoundToInt(e.value);
   Play("Chop",.23f,1.35f,"bite",.12f,false,PThreat,e.position);PlayBank("SoftHeavy",.14f,.8f,PThreat,"bitebody",.12f,e.position);Play("SubThump",.16f,.9f,"bitesub",.12f,false,PThreat,e.position);
   DuckMusic(-4,.04f,0,.4f);Cue("bite",health);
   if(health>0&&health<=3){heartbeatHealth=health;heartbeatBpm=health>=3?72:health==2?84:96;if(heartbeatUntil<=soundClock)nextBeat=soundClock+.35f;heartbeatUntil=soundClock+8;}
  }
  void WaveStart(CarrotEvent e){
   // Horn and drum, moved onto the playing track's tonic when its key is known; it plays at once (within the same frame).
   float pitch=Mathf.Pow(2,KeyShift(Carrot_MusicKey())/12f);
   Play("WaveHorn",.22f,pitch,"wavehorn",1,false,PBoss,null);Cue("wave",e.value);
  }
  void PhaseBreakSound(CarrotEvent e){
   lastPhaseBreak=soundClock;Vector3? at=e!=null?e.position:(Vector3?)null;
   Play("PhaseBreak",.26f,1,"phasebreak",.6f,false,PBoss,at);PlayBank("Mining",.14f,1,PBoss,"phasemining",.6f,at);PlayBank("Bell",.07f,.8f,PBoss,"phasebell",.6f,at);
   DuckMusic(-6,.05f,.3f,.8f);Cue("phaseBreak",e!=null?e.value:0);
  }
  void SuperForged(CarrotEvent e){
   lastSuper=soundClock;
   Play("SuperForge",.3f,1,"superforge",.5f,false,PBoss,e.position);Later(.25f,"SuperForge",.2f,1,"superchord",.5f,PBoss);LaterBank(.33f,"Bell",.07f,1.12f,PBoss,"superbell",.5f);Later(.08f,"Build",.2f,.9f,"forgebuild",.1f,PBoss);
   DuckMusic(-6,.25f,.35f,.8f);Cue("super",e.tier);
  }
  // Coin ticks: one per 60 ms, rising a semitone each within the burst; only stipends, scenery, elites, bosses and cascades.
  void Coins(int count,float pitch,string reason){
   if(!clips.TryGetValue("CoinTick",out var tick))return;
   for(int i=0;i<count;i++)LaterClip(i*.06f,tick,.075f*(1-.05f*i),pitch*Mathf.Pow(1.0594631f,i),"cointick",.05f,PSignature);
   PlayBank("Coin",.07f,pitch,PSignature,"coinbag",.25f);Cue("coins:"+reason,count);
  }
  void CoinsDown(){if(!clips.TryGetValue("CoinTick",out var tick))return;for(int i=0;i<3;i++)LaterClip(i*.07f,tick,.06f,.9f*Mathf.Pow(.94387f,i),"cointick",.05f,PSignature);}
  void LegacyClear(){
   // Simulations without the judgement contract: the stipend (paid when a wave resolves) carries a quiet clear chord.
   int key=Carrot_MusicKey();if(key>=0)PlayJudgementChord("clear",key,.08f,true);else Quantized(()=>PlayBank("Bell",.05f,1.25f,PSignature,"judge-bell",.4f));Cue("clear:legacy",0);
  }
 }
}
