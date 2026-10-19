#if UNITY_EDITOR
using System;
using System.Collections.Generic;
using System.IO;
using UnityEngine;
namespace CarrotTD {
 public sealed partial class CarrotAudio {
  static Func<int,string,float,int> musicTestPlay;
  static Action<int> musicTestStop;
  static Action<string> musicTestUnload;
  static int audioAssertions;
  static void AudioCheck(bool condition,string message){audioAssertions++;if(!condition)throw new Exception("CARROT AUDIO TEST: "+message);}
  /// <summary>Exercises the production Transition/ReleaseSlot methods with a browser-buffer ownership fake, then the
  /// rest of the audio system (AudioSystemRegression). Called from CarrotSimulationTests.Units, so it runs in both the
  /// quick and the full carrot:test.</summary>
  public static void MusicTransitionRegression() {
   var go=new GameObject("CarrotMusicTransitionTest");go.SetActive(false);
   var audio=go.AddComponent<CarrotAudio>();
   var decoded=new HashSet<string>{"MusicExplore","MusicAsuna","MusicGarden"};
   var browserSlots=new string[]{"MusicExplore","MusicAsuna"};
   var unloaded=new List<string>();bool refusePlay=false;
   musicTestPlay=(slot,name,gain)=>{if(refusePlay||!decoded.Contains(name))return 0;browserSlots[slot]=name;return 1;};
   musicTestStop=slot=>browserSlots[slot]=null;
   musicTestUnload=name=>{if(Array.IndexOf(browserSlots,name)>=0)throw new Exception("Unloading a live music buffer: "+name);decoded.Remove(name);unloaded.Add(name);};
   Action<bool,string> check=(condition,message)=>{if(!condition)throw new Exception("CARROT MUSIC TEST: "+message);};
   try {
    audio.unlocked=true;audio.targetA=false;audio.playing="MusicAsuna";
    audio.slotTrack[0]="MusicExplore";audio.slotTrack[1]="MusicAsuna";
    foreach(string name in decoded)audio.musicReady.Add(name);
    audio.Transition("MusicExplore",1.7f);
    check(audio.playing=="MusicExplore"&&audio.targetA&&browserSlots[0]=="MusicExplore","quick retry starts the decoded track already in the destination slot");
    check(decoded.Contains("MusicExplore")&&audio.musicReady.Contains("MusicExplore")&&!unloaded.Contains("MusicExplore"),"retry preserves requested buffer ownership");
    check(browserSlots[1]=="MusicAsuna","crossfade keeps the current track until its fade ends");
    audio.ReleaseSlot(1);
    check(!decoded.Contains("MusicAsuna")&&!audio.musicReady.Contains("MusicAsuna"),"the completed old fade releases both caches");

    // Failed playback must not switch the fade target to an empty destination.
    refusePlay=true;audio.blend=.8f;audio.Transition("MusicGarden",2);
    check(audio.targetA&&audio.playing=="MusicExplore"&&audio.blend==.8f&&browserSlots[0]=="MusicExplore","failed start leaves the playing track and fade target intact");
    check(audio.slotTrack[1]==null,"failed start does not claim an active slot");
    refusePlay=false;audio.Transition("MusicGarden",2);
    check(!audio.targetA&&audio.playing=="MusicGarden"&&browserSlots[1]=="MusicGarden"&&audio.blend==0,"failed start can retry successfully");
    audio.ReleaseSlot(0);
    check(!decoded.Contains("MusicExplore")&&!audio.musicReady.Contains("MusicExplore"),"normal release does not pin the retry buffer forever");

    // A track shared by both slots is retained until the second reference goes away.
    audio.slotTrack[0]="MusicGarden";browserSlots[0]="MusicGarden";
    audio.ReleaseSlot(0);check(decoded.Contains("MusicGarden"),"shared track survives the first release");
    audio.ReleaseSlot(1);check(!decoded.Contains("MusicGarden")&&!audio.musicReady.Contains("MusicGarden"),"last slot release unloads the shared buffer");

    // A campaign boss restarts its theme even when the same file is already playing (the arrival), in the other slot.
    decoded.Add("MusicGarden");audio.musicReady.Add("MusicGarden");audio.slotTrack[0]=null;audio.slotTrack[1]=null;browserSlots[0]=browserSlots[1]=null;
    audio.targetA=true;audio.playing="";audio.Transition("MusicGarden",1);int first=audio.targetA?0:1;
    audio.Transition("MusicGarden",1.8f,restart:true);
    check(audio.playing=="MusicGarden"&&(audio.targetA?0:1)!=first&&browserSlots[0]=="MusicGarden"&&browserSlots[1]=="MusicGarden","restart crossfades a fresh copy of the same theme");
    audio.ReleaseSlot(first);check(decoded.Contains("MusicGarden"),"the fresh copy keeps the shared buffer alive");
    Debug.Log("CARROT_MUSIC_TRANSITION_OK quick retry, failed-start recovery, shared-buffer cleanup and boss restart");
   } finally {
    musicTestPlay=null;musicTestStop=null;musicTestUnload=null;
    UnityEngine.Object.DestroyImmediate(go);
   }
   AudioSystemRegression();
  }

  /// <summary>Banks, synth layers, risers, ambience, playlists, keys, voice priorities, heartbeat, deadlines, contract
  /// events, volume preferences and ducks. Deterministic; no audio device needed (voice bookkeeping is clock based).</summary>
  public static void AudioSystemRegression(){
   audioAssertions=0;
   // ---- banks: shuffled bags never repeat a clip back to back and deal every clip evenly ----
   for(int size=2;size<=5;size++){
    var b=new CarrotSfxBank((uint)(17+size));var set=new AudioClip[size];for(int i=0;i<size;i++)set[i]=AudioClip.Create("bank-test-"+i,32,1,24000,false);
    b.Set("T",set);var counts=new int[size];AudioClip prev=null;
    for(int i=0;i<1000;i++){var c=b.Next("T");AudioCheck(c!=prev,"bank of "+size+" never repeats immediately");prev=c;counts[Array.IndexOf(set,c)]++;}
    foreach(var n in counts)AudioCheck(Mathf.Abs(n-1000f/size)<=1000f/size*.1f+1,"bank of "+size+" deals evenly ("+string.Join(",",counts)+")");
    for(int i=0;i<200;i++){float p=b.Pitch(),v=b.Volume();AudioCheck(p>=1/CarrotSfxBank.PitchSpread-1e-4f&&p<=CarrotSfxBank.PitchSpread+1e-4f,"pitch within one semitone");AudioCheck(v>=Mathf.Pow(10,-1.5f/20)-1e-4f&&v<=Mathf.Pow(10,1.5f/20)+1e-4f,"level within 1.5 dB");}
    foreach(var c in set)UnityEngine.Object.DestroyImmediate(c);
   }
   // ---- shipped assets: every bank path, synth layer and streamed track exists ----
   int bankClips=0;
   foreach(var pair in CarrotSfxBank.Banks)foreach(var path in pair.Value){var clip=Resources.Load<AudioClip>("Carrot/Audio/"+path);AudioCheck(clip!=null,"bank clip loads: "+path);bankClips++;}
   foreach(var name in SynthLayers){var clip=Resources.Load<AudioClip>("Carrot/Audio/Synth/"+name);AudioCheck(clip!=null&&clip.length>.05f&&clip.length<2,"synth layer loads: "+name);}
   string streaming=Path.Combine(Application.dataPath,"StreamingAssets/Carrot");
   var tracks=new HashSet<string>();
   foreach(var biome in new[]{"garden","marsh","frost","orchard","arena","prism"})foreach(var boss in new[]{"","garden","marsh","frost","orchard","tornado","zombie","eyeball","portal","asuna"})foreach(var t in Compact(LevelPool(biome,boss)))tracks.Add(t);
   foreach(var kind in new[]{"garden","marsh","frost","orchard","tornado","zombie","eyeball","portal","asuna"}){string theme="Music"+BossTheme(kind);tracks.Add(theme);var partner=BossPartner(theme);if(partner!=null)tracks.Add(partner);}
   foreach(var t in tracks){AudioCheck(File.Exists(Path.Combine(streaming,t+".ogg"))&&File.Exists(Path.Combine(streaming,t+".mp3")),"streamed track exists in Ogg and MP3: "+t);AudioCheck(TrackGain(t)>.3f&&TrackGain(t)<=1,"track gain set: "+t);}
   // ---- plant signatures: all twenty families have a transient and a synthesised body ----
   AudioCheck(PlantFamilies.Length==20,"twenty plant families");
   foreach(var family in PlantFamilies){AudioCheck(ShotSigs.TryGetValue(family,out var sig),"signature for "+family);AudioCheck(sig.bank==null||CarrotSfxBank.Banks.ContainsKey(sig.bank),"signature bank exists: "+family);AudioCheck(Array.IndexOf(SynthLayers,sig.body)>=0,"signature body exists: "+family);}
   foreach(var tower in CarrotData.Towers)AudioCheck(ShotSigs.ContainsKey(tower.id),"every tower in the game data has a signature: "+tower.id);
   // ---- risers: exact length, deterministic, peaking at the commit ----
   foreach(var element in new[]{"threat","earth","ice","dark","storm","rift","prism","coin"})foreach(var seconds in new[]{.6f,1.25f,2.5f}){
    var a=RenderRiser(element,seconds,22050);var b=RenderRiser(element,seconds,22050);
    AudioCheck(a.Length==Mathf.RoundToInt(seconds*22050),"riser length matches the windup: "+element+" "+seconds);
    bool same=true;for(int i=0;i<a.Length;i++)if(a[i]!=b[i]){same=false;break;}AudioCheck(same,"riser deterministic: "+element);
    float early=Rms(a,0,a.Length/4),late=Rms(a,a.Length*3/4,a.Length);AudioCheck(late>early*2.5f,"riser rises to the commit: "+element+" "+early+" -> "+late);
    float peak=0;foreach(var v in a)peak=Mathf.Max(peak,Mathf.Abs(v));AudioCheck(peak<=.91f&&peak>.5f,"riser normalised: "+element);
   }
   foreach(var kind in new[]{"uproot","tithe","gaze","breath","gust","portalBlink","prismDash","blind"})AudioCheck(RiserElement(kind)!="threat","ability "+kind+" has a coloured riser");
   // ---- ambience: 24 s seamless loops near -24 dBFS for every biome, deterministic ----
   foreach(var biome in CarrotAmbience.Biomes){
    float[] pcm=null;var e=CarrotAmbience.Render(biome,d=>pcm=d);while(e.MoveNext()){}
    AudioCheck(pcm!=null&&pcm.Length==(int)(CarrotAmbience.LoopSeconds*CarrotAmbience.Rate),"ambience loop length: "+biome);
    float db=CarrotAmbience.RmsDb(pcm);AudioCheck(Mathf.Abs(db-CarrotAmbience.TargetRmsDb)<1.5f,"ambience level "+biome+" "+db);
    float seam=Mathf.Abs(pcm[pcm.Length-1]-pcm[0]),typical=Mathf.Pow(10,CarrotAmbience.TargetRmsDb/20)*1.5f;
    AudioCheck(seam<typical,"ambience loop seam is continuous: "+biome+" "+seam);
    float[] again=null;var e2=CarrotAmbience.Render(biome,d=>again=d);while(e2.MoveNext()){}
    AudioCheck(again[1234]==pcm[1234]&&again[pcm.Length/2]==pcm[pcm.Length/2],"ambience deterministic: "+biome);
   }
   // ---- playlists: a 10-minute level never loops one short track more than twice in a row ----
   var seconds2=new Dictionary<string,float>{{"MusicExplore",191.7f},{"MusicFrost",186.2f},{"MusicGarden",69.6f},{"MusicMarsh",108f},{"MusicEyeball",180f},{"MusicOrchard",116.1f},{"MusicPortal",123.4f},{"MusicTornado",95.9f},{"MusicZombie",71.9f},{"MusicAsuna",216.5f},{"MusicBossTornado",136.3f},{"MusicBossOrchard",98.9f},{"MusicBossPortal",98.9f}};
   foreach(var biome in new[]{"garden","marsh","frost","orchard","arena"})foreach(var boss in new[]{"","tornado","zombie","eyeball","portal"}){
    if(biome!="arena"&&boss!="")continue;if(biome=="arena"&&boss=="")continue;
    var list=Compact(LevelPool(biome,boss));AudioCheck(list.Length>=2,"playlist has an alternative: "+biome+"/"+boss);
    float t=0;int index=0;while(t<600){string track=list[index];float len=seconds2[track];float play=SwitchAt(len)+PlaylistCrossfade;AudioCheck(play/len<=2.001f,"at most two loops of "+track);t+=play-PlaylistCrossfade;index=(index+1)%list.Length;}
   }
   AudioCheck(Mathf.Abs(SwitchAt(69.6f)-136.7f)<.01f&&MaxLoops(191.7f)==1&&MaxLoops(95.9f)==2,"switch points");
   foreach(var level in CarrotData.Levels){var p=Compact(LevelPool(level.biome,level.boss));AudioCheck(p.Length>0&&p[0].StartsWith("Music"),"level "+level.id+" has music");if(!string.IsNullOrEmpty(level.boss))AudioCheck(seconds2.ContainsKey("Music"+BossTheme(level.boss)),"boss theme for level "+level.id);}
   // ---- keys: the stinger tonic shift stays within a tritone; every judgement has a chord ----
   for(int key=0;key<24;key++){int s=KeyShift(key);AudioCheck(s>=-6&&s<=5,"key shift range");foreach(var kind in new[]{"flawless","clear","leak","phaseBreak","superForged","saved"}){var notes=JudgementNotes(kind,key);AudioCheck(notes!=null&&notes.Length>=2,"judgement chord "+kind);foreach(var f in notes)AudioCheck(f>60&&f<1700,"chord note range "+kind+" "+f);}}
   AudioCheck(KeyShift(9)==0&&KeyShift(0)==3&&KeyShift(-1)==0,"A is the palette's home key; C is up three semitones");

   // ---- live component: voices, priorities, heartbeat, deadlines, contract events, preferences, ducks ----
   var go=new GameObject("CarrotAudioSystemTest");var game=go.AddComponent<CarrotGame>();game.AutoTick=false;game.EnableBridge=false;game.LoadLevel(8);
   // Edit-mode batch tests do not run Awake for plain MonoBehaviours: initialise exactly as the player does.
   var audio=go.AddComponent<CarrotAudio>();audio.Awake();var cues=new List<KeyValuePair<string,float>>();var duckCalls=new List<float[]>();var lowpass=new List<int>();
   cueTest=(n,v)=>cues.Add(new KeyValuePair<string,float>(n,v));busTestDuck=(db,a,h,r)=>duckCalls.Add(new[]{db,a,h,r});busTestLowpass=on=>lowpass.Add(on);
   try{
    AudioCheck(audio.voices.Count==VoiceCount&&audio.bank!=null&&audio.bank.Loaded==bankClips&&audio.bank.Missing==0,"component loads 20 voices and every bank clip ("+audio.bank.Loaded+"/"+bankClips+")");
    foreach(var name in SynthLayers)AudioCheck(audio.clips.ContainsKey(name),"component loads synth layer "+name);
    foreach(var name in new[]{"UiClick","UiOpen","UiClose","UiHover"})AudioCheck(audio.clips.TryGetValue(name,out var ui)&&ui.length>.01f&&ui.length<.3f,"interface chirp "+name);
    audio.unlocked=true;
    var probe=AudioClip.Create("voice-probe",24000,1,24000,false);var other=AudioClip.Create("voice-other",24000,1,24000,false);
    // Debounce: the same clip twice inside 20 ms plays once; per-clip concurrency is capped at six.
    AudioCheck(audio.PlayClip(probe,.05f,1,PRoutine,null,false,null,0)!=null,"first routine voice plays");
    AudioCheck(audio.PlayClip(probe,.05f,1,PRoutine,null,false,null,0)==null,"20 ms debounce drops an immediate duplicate");
    for(int i=0;i<8;i++){audio.soundClock+=.03f;audio.PlayClip(probe,.02f,1,PKill,null,false,null,0);}
    int same=0;foreach(var v in audio.voices)if(audio.Busy(v)&&v.clip==probe)same++;AudioCheck(same<=PerClipConcurrency,"per-clip concurrency "+same);
    // Fill every voice with routine fire: a further routine shot is dropped, a telegraph steals.
    foreach(var v in audio.voices){v.clip=other;v.priority=PRoutine;v.start=audio.soundClock;v.end=audio.soundClock+5;v.volume=.01f;}
    AudioCheck(audio.Allocate(probe,PRoutine,false)==null,"routine fire is dropped first when the pool is full");
    var stolen=audio.Allocate(probe,PThreat,false);AudioCheck(stolen!=null&&stolen.priority==PRoutine,"a telegraph steals a routine voice");
    foreach(var v in audio.voices){v.priority=PThreat;}AudioCheck(audio.Allocate(probe,PKill,false)==null,"a kill never steals a telegraph");
    foreach(var v in audio.voices)audio.StopVoice(v);
    // Creature voices are capped at five.
    int creatures=0;for(int i=0;i<8;i++){var c=AudioClip.Create("creature-"+i,24000,1,24000,false);if(audio.PlayClip(c,.05f,1,PKill,null,true,null,0)!=null)creatures++;}
    AudioCheck(creatures==CreatureVoiceLimit,"creature voices capped at five ("+creatures+")");
    foreach(var v in audio.voices)audio.StopVoice(v);
    // Hierarchy: a crowd of routine fire cannot squeeze a boss beat, and routine fire yields -4 dB under it.
    for(int i=0;i<12;i++){var c=AudioClip.Create("crowd-"+i,48000,1,24000,false);audio.soundClock+=.001f;audio.PlayClip(c,.3f,1,PRoutine,null,false,null,0);}
    var beat=AudioClip.Create("beat",24000,1,24000,false);var big=audio.PlayClip(beat,.25f,1,PBoss,null,false,null,0);
    AudioCheck(big!=null&&big.volume>=.25f*SfxGain*.99f,"a boss beat keeps its full level over routine fire ("+(big!=null?big.volume:0)+")");
    var after=AudioClip.Create("after",24000,1,24000,false);audio.soundClock+=.05f;foreach(var v in audio.voices)if(v!=big)audio.StopVoice(v);
    var small=audio.PlayClip(after,.05f,1,PRoutine,null,false,null,0);AudioCheck(small!=null&&Mathf.Abs(small.volume-.05f*SfxGain*.63f)<.002f,"routine fire yields -4 dB under the beat");
    audio.soundClock+=.5f;var later=AudioClip.Create("later",24000,1,24000,false);var normal=audio.PlayClip(later,.05f,1,PRoutine,null,false,null,0);
    AudioCheck(normal!=null&&Mathf.Abs(normal.volume-.05f*SfxGain)<.002f,"and returns 400 ms later");
    foreach(var v in audio.voices)audio.StopVoice(v);
    // Heartbeat: only after a bite that leaves three hearts or fewer, for eight seconds, faster as hearts fall.
    game.phase="playing";cues.Clear();
    audio.Handle(new CarrotEvent("carrotHit","nibble",Vector3.zero,value:5));for(int i=0;i<200;i++)audio.Tick(.05f,false,"playing");
    AudioCheck(cues.FindAll(c=>c.Key=="heartbeat").Count==0,"no heartbeat at five hearts");
    audio.Handle(new CarrotEvent("carrotHit","nibble",Vector3.zero,value:3));var beatTimes=new List<float>();
    for(int i=0;i<240;i++){int before=cues.Count;audio.Tick(.05f,false,"playing");for(int k=before;k<cues.Count;k++)if(cues[k].Key=="heartbeat"){beatTimes.Add(audio.soundClock);AudioCheck(cues[k].Value<=3,"heartbeat only at three hearts or fewer");}}
    AudioCheck(beatTimes.Count>=8&&beatTimes.Count<=11,"heartbeat runs about eight seconds at 72 bpm ("+beatTimes.Count+")");
    AudioCheck(beatTimes[beatTimes.Count-1]-beatTimes[0]<=8.05f,"heartbeat stops after eight seconds");
    audio.Handle(new CarrotEvent("carrotHit","nibble",Vector3.zero,value:1));beatTimes.Clear();
    for(int i=0;i<100;i++){int before=cues.Count;audio.Tick(.05f,false,"playing");for(int k=before;k<cues.Count;k++)if(cues[k].Key=="heartbeat")beatTimes.Add(audio.soundClock);}
    AudioCheck(beatTimes.Count>=2&&Mathf.Abs((beatTimes[1]-beatTimes[0])-60f/96)<.06f,"one heart beats at 96 bpm");
    AudioCheck(duckCalls.Exists(d=>Mathf.Approximately(d[0],-4)&&Mathf.Approximately(d[1],.04f)&&Mathf.Approximately(d[3],.4f)),"a bite ducks the music -4 dB (40/400 ms)");
    // Guardian deadline alarms: each threshold once per boss.
    cues.Clear();foreach(var v in new[]{.5f,.75f,.75f,.9f,.9f,.5f})audio.Handle(new CarrotEvent("bossDeadline","tornado",Vector3.zero,id:77,value:v));
    AudioCheck(cues.FindAll(c=>c.Key=="deadline").Count==3,"each deadline threshold plays once");
    // Contract events are consumed (never fall into legacy cues) and set their state.
    cues.Clear();audio.Handle(new CarrotEvent("judgement","flawless",Vector3.zero,value:1));audio.Handle(new CarrotEvent("speedHold","",Vector3.zero,value:1));audio.Handle(new CarrotEvent("waveIncoming","air",Vector3.zero,value:6,target:1));
    AudioCheck(audio.judgementSeen&&audio.speedHold&&cues.Exists(c=>c.Key=="judgement:flawless")&&cues.Exists(c=>c.Key=="speedHold")&&cues.Exists(c=>c.Key=="incoming:air"),"contract v2 events handled");
    game.speed=2;AudioCheck(Mathf.Approximately(audio.EffectiveSpeed(),1),"speedHold keeps windups at 1x");audio.Handle(new CarrotEvent("speedHold","",Vector3.zero,value:0));AudioCheck(Mathf.Approximately(audio.EffectiveSpeed(),2),"2x windups are half as long in real time");game.speed=1;
    // Telegraph risers: sized to the real windup and fading when the cast ends.
    var boss=game.TestSpawn("garden",boss:true);boss.castRemaining=2.5f;cues.Clear();duckCalls.Clear();
    audio.Handle(new CarrotEvent("telegraph","uproot",boss.position,id:boss.id,duration:2.5f));
    AudioCheck(cues.Exists(c=>c.Key=="telegraph:uproot"),"telegraph cue logged in the event frame");
    audio.Tick(.016f,false,"playing");
    var riser=cues.Find(c=>c.Key=="riser:uproot");AudioCheck(Mathf.Abs(riser.Value-2.5f)<.01f,"riser sized to the windup ("+riser.Value+")");
    AudioCheck(duckCalls.Exists(d=>Mathf.Approximately(d[0],-6)&&Mathf.Approximately(d[1],.08f)&&Mathf.Approximately(d[3],.6f)),"a boss telegraph ducks the music -6 dB (80/600 ms)");
    Voice owned=null;foreach(var v in audio.voices)if(v.owner==boss.id)owned=v;AudioCheck(owned!=null,"riser voice owned by the caster");
    boss.castRemaining=0;audio.Tick(.016f,false,"playing");AudioCheck(owned.fadeTo==0,"committed or cancelled cast fades its riser");
    // Blindness sweeps the music low-pass down and back.
    lowpass.Clear();game.blindUntil=game.elapsed+3;audio.Tick(.016f,false,"playing");game.blindUntil=0;audio.Tick(.016f,false,"playing");
    AudioCheck(lowpass.Count==2&&lowpass[0]==1&&lowpass[1]==0,"blind low-pass on and off");
    // Preferences: partial JSON keeps the other channels; junk is ignored; values clamp.
    audio.SetVolumes("{\"music\":0.5}");AudioCheck(Mathf.Approximately(audio.musicPref,.5f)&&audio.sfxPref==1&&audio.uiPref==1,"partial volume update");
    audio.SetVolumes("{\"sfx\":2,\"ui\":-1}");AudioCheck(audio.sfxPref==1&&audio.uiPref==0&&Mathf.Approximately(audio.musicPref,.5f),"volumes clamp to 0..1");
    audio.SetVolumes("not json");AudioCheck(Mathf.Approximately(audio.musicPref,.5f),"invalid volume JSON is ignored");
    // Duck mirror (ambience) follows the bus envelope: -6 dB at the end of the attack, back to unity after the release.
    audio.ducks.Clear();audio.DuckMusic(-6,.08f,1,.6f);float start=audio.soundClock;
    audio.soundClock=start+.08f;AudioCheck(Mathf.Abs(audio.DuckGain()-.501f)<.01f,"duck depth after attack");audio.soundClock=start+1.7f;AudioCheck(audio.DuckGain()>.999f,"duck released");
    // A boss decoy (clone) dies like an elite: no boss fall, no -9 dB duck, no coin shower.
    var decoy=game.TestSpawn("nibble",clone:true);cues.Clear();audio.Handle(new CarrotEvent("death","asuna",Vector3.zero,id:decoy.id,value:0));
    AudioCheck(!cues.Exists(c=>c.Key.StartsWith("bossDeath")),"a decoy is not a boss death");
    var real=game.TestSpawn("garden",boss:true);cues.Clear();audio.Handle(new CarrotEvent("death",real.kind,Vector3.zero,id:real.id,value:100));
    AudioCheck(cues.Exists(c=>c.Key.StartsWith("bossDeath")),"the real boss death plays its fall ("+real.kind+")");
    // Kill cascade: three kills inside 300 ms become one coin cascade.
    cues.Clear();for(int i=0;i<3;i++){audio.soundClock+=.05f;audio.Handle(new CarrotEvent("death","nibble",Vector3.zero,value:2));}
    AudioCheck(cues.FindAll(c=>c.Key=="coins:cascade").Count==1,"multi-kill coin cascade");
    // Music direction per level: the biome's own track from the start, the boss theme after bossEnter (a campaign boss
    // restarts it from the top), the guardian's theme from the first wave in challenges, MusicExplore after the result.
    var played=new List<string>();musicTestPlay=(slot,name,gain)=>{played.Add(name);return 1;};musicTestStop=slot=>{};musicTestUnload=name=>{};
    foreach(var level in CarrotData.Levels){
     // Every track counts as decoded (the browser side is faked); releases between levels would otherwise unload them.
     foreach(var t in seconds2.Keys)audio.musicReady.Add(t);
     game.LoadLevel(level.id);audio.SetBiome(level.biome);var pool=Compact(LevelPool(level.biome,level.boss));
     AudioCheck(audio.desired==pool[0]&&audio.playing==pool[0],"level "+level.id+" ("+level.biome+") opens on "+pool[0]+", got "+audio.playing);
     if(level.biome=="garden")AudioCheck(audio.playing=="MusicGarden","garden plays MusicGarden");
     if(level.biome=="marsh")AudioCheck(audio.playing=="MusicMarsh","marsh plays MusicMarsh");
     if(level.biome=="frost")AudioCheck(audio.playing=="MusicFrost","frost plays MusicFrost");
     if(level.biome=="orchard")AudioCheck(audio.playing=="MusicOrchard","orchard plays MusicOrchard");
     if(level.biome=="arena")AudioCheck(audio.playing=="Music"+BossTheme(level.boss),"challenge "+level.id+" plays its guardian's theme from the start");
     if(!string.IsNullOrEmpty(level.boss)){
      foreach(var t in seconds2.Keys)audio.musicReady.Add(t);
      int before=played.Count;audio.Handle(new CarrotEvent("bossEnter",level.boss,Vector3.zero,id:999));
      string theme="Music"+BossTheme(level.boss);AudioCheck(audio.playing==theme,"level "+level.id+" switches to "+theme+" on bossEnter");
      if(level.biome!="arena"&&level.biome!="prism")AudioCheck(played.Count>before&&played[played.Count-1]==theme,"a campaign boss starts its theme fresh");
      audio.Handle(new CarrotEvent("victory",level.biome,Vector3.zero,value:10));
      if(level.biome!="prism")AudioCheck(audio.desired=="MusicExplore","the result returns to MusicExplore");
     }
    }
    musicTestPlay=null;musicTestStop=null;musicTestUnload=null;game.LoadLevel(8);
    // Music level never exceeds the hard max.
    AudioCheck(MusicLevel<=MusicMax&&MusicMax<=.8f,"music hard max");
    UnityEngine.Object.DestroyImmediate(probe);UnityEngine.Object.DestroyImmediate(other);
   }finally{cueTest=null;busTestDuck=null;busTestLowpass=null;UnityEngine.Object.DestroyImmediate(go);}
   Debug.Log("CARROT_AUDIO_OK "+audioAssertions+" assertions: banks, "+SynthLayers.Length+" synth layers, risers, six ambience beds, playlists, keys, voices, heartbeat, deadlines, contract events, preferences and ducks");
  }
  static float Rms(float[] x,int a,int b){double s=0;for(int i=a;i<b;i++)s+=x[i]*x[i];return (float)Math.Sqrt(s/Math.Max(1,b-a));}
 }
}
#endif
