using UnityEngine;

namespace CarrotTD {
 // ==== BOSS MOOD: the frozen contract shared by the visual (CarrotView partials) and sound/HUD (CarrotAudio partial, bossMood.ts) streams ====
 // Presentation only. Nothing here reads or writes CarrotGame; the view builds a CarrotMoodInput from read-only game state each frame.
 // Shim-safe: only Mathf.Exp/Clamp01/Min/Max/Pow, so the file also compiles into scripts/carrot-sim through CARROT_SIM_EXTRA.
 // The web mirror (src/minigames/carrot/bossMood.ts) implements Target, TargetLight, Step and Fear with the same table and the same
 // fixture (SelfTest below; JSON copy in scratchpad/carrot-despair/visual/contract/fixture.json), matched to 1e-4.

 /// <summary>One frame of read-only state for the despair curve. boss: 0 none, 1 alive, 2 hidden, 3 dead, 4 leaked.</summary>
 public struct CarrotMoodInput {
  public int level,wave,waves,hearts,boss;
  public string phase;
  /// <summary>nextWave: the breather countdown (game.nextWave). route: the guardian's route fraction 0..1 (the last alive value while hidden).
  /// reliefAge: seconds since the last phase break (sound only; never lifts D). dawnAge: seconds since the Eyeball's reincarnate began
  /// (the false dawn). held: D at the moment of defeat (kept while lost).</summary>
  public float nextWave,route,reliefAge,dawnAge,held;
  /// <summary>rebirths: Eyeball re-formations so far. minis: miniboss arrivals since the guardian fell. deathWave: the wave on which it fell.</summary>
  public int rebirths,minis,deathWave;
  public static CarrotMoodInput Make(int level){var i=new CarrotMoodInput();i.level=level;i.waves=CarrotBossMoodCurve.Waves(level);i.hearts=10;i.phase="ready";i.reliefAge=1e9f;i.dawnAge=1e9f;return i;}
 }

 public static class CarrotBossMoodCurve {
  // Level, profile, boss wave, total waves, challenge, intensity I (checked against CarrotData.Waves by CheckData).
  static readonly int[] Ids={4,8,12,16,20,24,25,26,27,28,29};
  static readonly string[] Profiles={"brambleback","lantern","winter","brambleback-autumn","hollowhead","hollowhead-finale","tornado","zombie","eyeball","portal","asuna"};
  static readonly int[] BossWaves={8,10,12,12,14,16,4,6,7,4,1};
  static readonly int[] WaveCounts={8,10,12,12,14,16,6,9,11,12,1};
  static readonly float[] Intensities={.75f,.85f,.9f,.85f,.9f,1f,.9f,.95f,1f,.8f,.9f};
  static int Index(int level){for(int i=0;i<Ids.Length;i++)if(Ids[i]==level)return i;return -1;}
  /// <summary>Profile id for a level, "" for every non-boss level (the gate: mood is active only when this is non-empty, the level has a
  /// boss, and the mode is normal or veteran).</summary>
  public static string Profile(int level){int i=Index(level);return i<0?"":Profiles[i];}
  public static int BossWave(int level){int i=Index(level);return i<0?0:BossWaves[i];}
  public static int Waves(int level){int i=Index(level);return i<0?0:WaveCounts[i];}
  public static bool Challenge(int level){return level>=25&&level<=29;}
  public static float Intensity(int level){int i=Index(level);return i<0?0:Intensities[i];}
  /// <summary>Despair a wave before the guardian: De reaches at least .30 there (D = max(.30, .30/I), capped at .45).</summary>
  public static float Top(int level){float I=Intensity(level);return I<=0?.30f:Mathf.Min(.45f,Mathf.Max(.30f,.30f/I));}
  static float S(float x){float t=Mathf.Clamp01((x-.10f)/.80f);return t*t*(3-2*t);}

  /// <summary>Target D for colour, world and sound (first matching case wins).</summary>
  public static float Target(CarrotMoodInput i){return Eval(i,false);}
  /// <summary>Target D for the light channel (sun, fill, ambient, fog distance): no false dawn, and a flat .15 after a challenge guardian falls.</summary>
  public static float TargetLight(CarrotMoodInput i){return Eval(i,true);}
  static float Eval(CarrotMoodInput i,bool light){
   int k=Index(i.level);if(k<0)return 0;bool challenge=Challenge(i.level);int bw=BossWaves[k];
   if(i.phase=="lost")return Mathf.Clamp01(i.held);
   if(i.phase=="won")return 0;
   if(i.boss==3){if(!challenge)return 0;if(light)return .15f;int dw=i.deathWave>0?i.deathWave:bw;return Mathf.Min(.45f,.15f+.25f*Mathf.Clamp01((i.wave-dw)/(float)Mathf.Max(1,i.waves-dw))+.04f*i.minis);}
   if(i.boss==4)return .45f;
   if(i.boss==1||i.boss==2){
    float t=.55f+.30f*S(i.route)+.05f*i.rebirths;
    if(challenge){if(i.route>=.5f)t+=.03f;if(i.route>=.75f)t+=.03f;if(i.route>=.9f)t+=.03f;}
    if(!light&&i.dawnAge<2.2f)t-=.20f;else if(!light&&i.dawnAge<3.0f)t=Mathf.Max(t,.9f);
    return Mathf.Clamp01(t);
   }
   float top=Top(i.level);
   if(bw>=2&&i.wave==bw-1&&i.nextWave>0)return Mathf.Clamp01(top+.05f);
   if(bw<=1)return .20f;
   return Mathf.Clamp01(.08f+(top-.08f)*Mathf.Clamp01((Mathf.Max(i.wave,1)-1)/(float)Mathf.Max(1,bw-2)));
  }
  /// <summary>Exponential follower: tau .8 s rising inside the entrance window, 2.5 s rising otherwise, 1.5 s falling; outside the
  /// entrance and release windows the change is limited to .11 per second (about 4% mean luminance per second at most).
  /// dt is real seconds capped at .05 by the caller and 0 while paused.</summary>
  public static float Step(float d,float target,float dt,bool entrance,bool release){
   float tau=target>d?(entrance?.8f:2.5f):1.5f;float n=d+(target-d)*(1-Mathf.Exp(-dt/tau));
   if(!entrance&&!release){float m=.11f*dt;n=Mathf.Max(d-m,Mathf.Min(d+m,n));}
   return n;
  }
  /// <summary>Health-tied fear, at most .08: feeds only the carrot's fear and the sound privation, never light or colour.</summary>
  public static float Fear(int hearts){return .08f*Mathf.Clamp01(1-hearts/10f);}
  /// <summary>Channel exponents: colour and world De^1, light De^1.3, sound De^.7.</summary>
  public static float Light(float de){return Mathf.Pow(Mathf.Clamp01(de),1.3f);}
  public static float Sound(float de){return Mathf.Pow(Mathf.Clamp01(de),.7f);}

  /// <summary>The table against the wave data: returns "" when every boss wave and wave count matches, else a CARROT_MOOD_WARN text.</summary>
  public static string CheckData(){
   var sb=new System.Text.StringBuilder();
   for(int k=0;k<Ids.Length;k++){int level=Ids[k];if(level-1>=CarrotData.Waves.Length)continue;var waves=CarrotData.Waves[level-1];int bw=0;for(int w=0;w<waves.Length;w++)if(waves[w].Contains("boss:")){bw=w+1;break;}
    var def=CarrotData.Level(level);int count=def!=null?def.waves:waves.Length;
    if(bw!=BossWaves[k]||count!=WaveCounts[k]||def==null||string.IsNullOrEmpty(def.boss))sb.Append(" L").Append(level).Append(" table=").Append(BossWaves[k]).Append('/').Append(WaveCounts[k]).Append(" data=").Append(bw).Append('/').Append(count);}
   return sb.Length==0?"":"CARROT_MOOD_WARN"+sb;
  }

  // ---- fixture (identical to visual/contract/fixture.json and bossMood.ts) ----------------------------------------------------
  static CarrotMoodInput C(int level,string phase,int wave,int boss,float route=0,int hearts=10,float next=0,float relief=1e9f,float dawn=1e9f,float held=0,int rebirths=0,int minis=0,int deathWave=0){
   var i=CarrotMoodInput.Make(level);i.phase=phase;i.wave=wave;i.boss=boss;i.route=route;i.hearts=hearts;i.nextWave=next;i.reliefAge=relief;i.dawnAge=dawn;i.held=held;i.rebirths=rebirths;i.minis=minis;i.deathWave=deathWave;return i;}
  /// <summary>Runs fixture A-X (target and light) and the five Step cases; returns the failure count and a report line.</summary>
  public static int SelfTest(out string report){
   var cases=new (string id,CarrotMoodInput input,float target,float light)[]{
    ("A",C(4,"ready",0,0),.0800f,.0800f),("B",C(4,"playing",4,0),.2400f,.2400f),("C",C(4,"playing",7,0,next:5),.4500f,.4500f),("D",C(4,"playing",7,0),.4000f,.4000f),
    ("E",C(4,"playing",8,1,0),.5500f,.5500f),("F",C(4,"playing",8,1,.5f),.7000f,.7000f),("G",C(4,"playing",8,1,.9f,4),.8500f,.8500f),("H",C(4,"playing",8,1,.5f,relief:0),.7000f,.7000f),
    ("I",C(20,"playing",14,1,.3f,7,relief:3),.5969f,.5969f),("J",C(4,"playing",8,3),0f,0f),("K",C(25,"playing",4,1,.8f),.8971f,.8971f),("L",C(25,"playing",4,3),.1500f,.1500f),
    ("M",C(29,"ready",0,0),.2000f,.2000f),("N",C(28,"playing",2,0),.2275f,.2275f),("O",C(8,"playing",9,0,next:3),.4029f,.4029f),("P",C(27,"playing",7,1,1,0),.9400f,.9400f),
    ("Q",C(27,"playing",7,2,.6f,dawn:0),.5851f,.7851f),("R",C(24,"won",16,3),0f,0f),("S",C(16,"playing",12,4),.4500f,.4500f),("T",C(12,"lost",12,1,.95f,0,held:.83f),.8300f,.8300f),
    ("U",C(28,"playing",8,3,minis:1),.3150f,.1500f),("V",C(27,"playing",7,1,.6f,dawn:2.5f,rebirths:1),.9000f,.8351f),("W",C(27,"playing",7,1,.6f,rebirths:2),.8851f,.8851f),("X",C(26,"playing",9,3,deathWave:6),.4000f,.1500f)};
   int fail=0;var sb=new System.Text.StringBuilder("CARROT_MOOD_SELFTEST");
   foreach(var c in cases){float t=Target(c.input),l=TargetLight(c.input);bool ok=Mathf.Abs(t-c.target)<1e-4f&&Mathf.Abs(l-c.light)<1e-4f;if(!ok){fail++;sb.Append(' ').Append(c.id).Append('=').Append(t.ToString("F4",System.Globalization.CultureInfo.InvariantCulture)).Append('/').Append(l.ToString("F4",System.Globalization.CultureInfo.InvariantCulture));}}
   var steps=new (string id,float d,float t,float dt,bool e,bool r,float want)[]{("rise",.30f,.55f,.1f,false,false,.30980f),("entrance",.30f,.55f,.1f,true,false,.32938f),("fall",.70f,.58f,.1f,false,false,.69226f),("clamp",.20f,.90f,.5f,false,false,.25500f),("release",.70f,0,.5f,false,true,.50157f)};
   foreach(var s in steps){float n=Step(s.d,s.t,s.dt,s.e,s.r);if(Mathf.Abs(n-s.want)>1e-4f){fail++;sb.Append(" step:").Append(s.id).Append('=').Append(n.ToString("F5",System.Globalization.CultureInfo.InvariantCulture));}}
   if(Mathf.Abs(Fear(4)-.048f)>1e-4f){fail++;sb.Append(" fear4");}
   string data=CheckData();if(data!=""){fail++;sb.Append(' ').Append(data);}
   sb.Append(fail==0?" ok":" failures=").Append(fail==0?"":fail.ToString());report=sb.ToString();return fail;
  }
 }

 /// <summary>
 /// Read-only reader of the game for the curve: follows the real guardian (bossEnter id; clones and minions never count) through the
 /// game's Effect events and its public lists, and builds one CarrotMoodInput per frame. It never writes the game: the standalone sim
 /// proof (visual/tools/MoodProof.cs) runs it on every tick of the boss-level replays and the replay hashes stay identical.
 /// Ages are game seconds (game.elapsed), so pause and speed follow the simulation.
 /// </summary>
 public sealed class CarrotMoodTracker {
  public int BossId=-1,State,Rebirths,Minis,DeathWave,Arrivals,Phases,Dawns,Releases;public float Route,DawnAt=-1e9f,ReliefAt=-1e9f,DeathAt=-1e9f,ArrivalAt=-1e9f,ReformAt=-1e9f;
  public string BossKind="";
  readonly System.Collections.Generic.HashSet<int> minis=new System.Collections.Generic.HashSet<int>();
  CarrotGame game;
  public void Reset(CarrotGame g){game=g;BossId=-1;State=0;Rebirths=Minis=DeathWave=0;Route=0;DawnAt=ReliefAt=DeathAt=ArrivalAt=ReformAt=-1e9f;BossKind="";minis.Clear();}
  public void OnEvent(CarrotEvent e){
   if(game==null||e==null)return;float now=game.elapsed;
   if(e.type=="bossEnter"){if(BossId<0||State>=3){BossId=e.id;BossKind=e.kind??"";State=1;ArrivalAt=now;Arrivals++;}return;}
   if(e.id!=BossId||BossId<0)return;
   if(e.type=="ability"&&e.kind=="phase"){ReliefAt=now;Phases++;}
   else if(e.type=="abilityTarget"&&e.kind=="reincarnate"){DawnAt=now;Dawns++;}
   else if(e.type=="ability"&&e.kind=="reincarnate"&&DawnAt>-1e8f){Rebirths++;ReformAt=now;}
   else if(e.type=="death"&&State!=3){State=3;DeathAt=now;DeathWave=game.wave;Releases++;minis.Clear();}
  }
  /// <summary>One input for this frame. held is the D to keep when the run is lost. A guardian that stops being alive without its death
  /// event (the kill emits death synchronously, inside the same tick) bit the carrot: leaked.</summary>
  public CarrotMoodInput Build(float held){
   var g=game;var i=CarrotMoodInput.Make(g.level!=null?g.level.id:0);i.wave=g.wave;i.hearts=g.health;i.phase=g.phase;i.nextWave=g.nextWave;i.held=held;
   if(BossId>=0&&State!=3&&State!=4){EnemyState b=null;foreach(var e in g.enemies)if(e.id==BossId){b=e;break;}
    if(b==null||!b.alive)State=4;
    else{State=b.hidden?2:1;if(!b.hidden&&b.routeLength>0)Route=Mathf.Clamp01(b.distance/b.routeLength);}}
   if(State==3)foreach(var e in g.enemies)if(e.alive&&!string.IsNullOrEmpty(e.miniboss)&&!e.clone&&minis.Add(e.id))Minis=minis.Count;
   i.boss=State;i.route=Route;i.rebirths=Rebirths;i.minis=Minis;i.deathWave=DeathWave;
   i.reliefAge=ReliefAt>-1e8f?g.elapsed-ReliefAt:1e9f;
   // The dawn window ends at the re-formation (ability reincarnate) when it comes before 2.2 s; the snap window then runs .8 s.
   i.dawnAge=ReformAt>=DawnAt&&ReformAt>-1e8f?2.2f+(g.elapsed-ReformAt):DawnAt>-1e8f?g.elapsed-DawnAt:1e9f;
   return i;
  }
 }

 /// <summary>
 /// The mood bus: written only by CarrotView.BossMoodTick (once per frame), read by CarrotAudio and QA. CarrotGame and CarrotContract
 /// never read it. Stage: 0 foreboding, 1 held breath, 2 arrival (2.6 s from bossEnter), 3 advance, 4 release (from the real
 /// guardian's death), 5 post (challenge waves after the guardian), 6 won, 7 lost.
 /// </summary>
 public static class CarrotBossMood {
  public static bool Active;public static string Profile="";
  public static int Level,Build,Stage,Hearts;
  public static int ArrivalCount,PhaseCount,DawnCount,ReleaseCount,RebirthCount,MiniCount;
  /// <summary>D: colour/world/sound despair 0..1; De = D x the level's intensity; DLight: the light channel's own D (no false dawn, no aftershock).
  /// Fear: the hearts term (sound privation and carrot fear only). Route: the guardian's route fraction. StageClock: seconds in Stage.</summary>
  public static float D,De,DLight,Fear,Route,StageClock;
  /// <summary>Seconds since the last phase break (sound-only breath) and since the send-now that skipped a held breath (-1 none).</summary>
  public static float PhaseAge=1e9f,SendNowAge=-1;
  public static bool BossAlive,Reduced,Paused,WavesLeft,Challenge;
  public static void Off(){Active=false;Profile="";Stage=0;D=De=DLight=Fear=Route=StageClock=0;BossAlive=false;WavesLeft=false;Challenge=false;PhaseAge=1e9f;SendNowAge=-1;}
 }
}
