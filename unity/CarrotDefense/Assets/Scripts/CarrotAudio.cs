using System;
using System.Collections.Generic;
using UnityEngine;
using System.Runtime.InteropServices;

namespace CarrotTD {
 // Sound for Carrot Defense: CC0 orchestral music streamed from StreamingAssets (decoded by the browser through
 // CarrotMusic.jslib, never part of the data file), a master bus there (compressor, limiter, ducks, blind low-pass),
 // recorded CC0 foley dealt round-robin from CarrotSfxBank, seeded procedural layers (Tools/synth_carrot_sfx.mjs),
 // runtime windup risers sized to each telegraph, biome ambience beds (CarrotAmbience) and authored orchestral stingers.
 //
 // Hierarchy: routine shots and impacts are short and quiet and are the first sounds dropped; kills pop; telegraphs,
 // bites, Supers, phase breaks and boss deaths are rare, loud and duck the music. A 20-voice pool with priorities,
 // per-clip concurrency (6) and a 20 ms debounce keeps 110-enemy waves readable; the limiter keeps them from clipping.
 public sealed partial class CarrotAudio : MonoBehaviour {
  readonly Dictionary<string,AudioClip> clips=new Dictionary<string,AudioClip>();
  readonly Dictionary<string,float> lastSound=new Dictionary<string,float>();
#if UNITY_WEBGL && !UNITY_EDITOR
  [DllImport("__Internal")] static extern void Carrot_MusicLoad(string name,string url);
  [DllImport("__Internal")] static extern int Carrot_MusicState(string name);
  [DllImport("__Internal")] static extern int Carrot_MusicRunning();
  [DllImport("__Internal")] static extern float Carrot_MusicSeconds(string name);
  [DllImport("__Internal")] static extern void Carrot_MusicUnload(string name);
  [DllImport("__Internal")] static extern int Carrot_MusicPlay(int slot,string name,float volume);
  [DllImport("__Internal")] static extern void Carrot_MusicVolume(int slot,float volume);
  [DllImport("__Internal")] static extern void Carrot_MusicPause(int slot,int paused);
  [DllImport("__Internal")] static extern void Carrot_MusicStop(int slot);
  [DllImport("__Internal")] static extern void Carrot_MusicTail(int slot);
  [DllImport("__Internal")] static extern int Carrot_MusicFinished(int slot);
  [DllImport("__Internal")] static extern float Carrot_MusicElapsed(int slot);
  [DllImport("__Internal")] static extern int Carrot_BusInstall();
  [DllImport("__Internal")] static extern void Carrot_BusDuck(float db,float attack,float hold,float release);
  [DllImport("__Internal")] static extern void Carrot_BusLowpass(int on);
  [DllImport("__Internal")] static extern void Carrot_BusGains(float makeupDb,float outputDb);
  [DllImport("__Internal")] static extern void Carrot_MusicIntensity(float value);
  [DllImport("__Internal")] static extern void Carrot_MusicMetaLoad(string url);
  [DllImport("__Internal")] static extern float Carrot_MusicBeatDelay();
  [DllImport("__Internal")] static extern int Carrot_MusicKey();
  [DllImport("__Internal")] static extern void Carrot_AudioCue(string name,float value);
#else
  static void Carrot_MusicLoad(string name,string url){}
  static int Carrot_MusicState(string name){return -2;}
  static int Carrot_MusicRunning(){return 0;}
  static float Carrot_MusicSeconds(string name){return musicTestSeconds!=null?musicTestSeconds(name):0;}
#if UNITY_EDITOR
  static void Carrot_MusicUnload(string name){musicTestUnload?.Invoke(name);}
  static int Carrot_MusicPlay(int slot,string name,float volume){return musicTestPlay?.Invoke(slot,name,volume)??0;}
  static void Carrot_MusicStop(int slot){musicTestStop?.Invoke(slot);}
#else
  static void Carrot_MusicUnload(string name){}
  static int Carrot_MusicPlay(int slot,string name,float volume){return 0;}
  static void Carrot_MusicStop(int slot){}
#endif
  static void Carrot_MusicVolume(int slot,float volume){}
  static void Carrot_MusicPause(int slot,int paused){}
  static void Carrot_MusicTail(int slot){}
  static int Carrot_MusicFinished(int slot){return 0;}
  static float Carrot_MusicElapsed(int slot){return musicTestElapsed!=null?musicTestElapsed(slot):0;}
  static int Carrot_BusInstall(){return 0;}
  static void Carrot_BusDuck(float db,float attack,float hold,float release){busTestDuck?.Invoke(db,attack,hold,release);}
  static void Carrot_BusLowpass(int on){busTestLowpass?.Invoke(on);}
  static void Carrot_BusGains(float makeupDb,float outputDb){}
  static void Carrot_MusicIntensity(float value){}
  static void Carrot_MusicMetaLoad(string url){}
  static float Carrot_MusicBeatDelay(){return musicTestBeat;}
  static int Carrot_MusicKey(){return musicTestKey;}
  static void Carrot_AudioCue(string name,float value){cueTest?.Invoke(name,value);}
  static Func<string,float> musicTestSeconds;static Func<int,float> musicTestElapsed;static Action<float,float,float,float> busTestDuck;static Action<int> busTestLowpass;static Action<string,float> cueTest;static float musicTestBeat=-1;static int musicTestKey=-1;
#endif
  // Priorities (spec event_intensity): telegraph/bite 10 > boss 8 > signature 6 > elite 5 > kill 3 > routine 2.
  public const int PRoutine=2,PKill=3,PElite=5,PSignature=6,PBoss=8,PThreat=10;
  /// <summary>World x the stereo pan is centred on: 0 in solo; the camera centre in duo and endless, where the map spans 32 units.</summary>
  public float ListenerX;
  public const int VoiceCount=20,CreatureVoiceLimit=5,PerClipConcurrency=6;
  public const float Debounce=.02f,MusicLevel=.40f,MusicMax=.8f,FoleyBudget=.85f,RoutineBudget=.6f,SfxGain=2.1f,PanScale=.07f,PanLimit=.6f;
  // Music slots 0 (A) and 1 (B) live in the browser: slotTrack is the track each slot plays, slotVolume the last gain sent, musicReady the decoded tracks.
  readonly string[] slotTrack=new string[2];readonly float[] slotVolume={-1,-1};readonly HashSet<string> musicReady=new HashSet<string>();
  sealed class Voice {public AudioSource source;public AudioClip clip;public int priority;public float start,end,volume,fadeTo=-1;public bool creature;public int owner;}
  AudioSource interfaceVoice;readonly List<Voice> voices=new List<Voice>();readonly List<AudioClip> authored=new List<AudioClip>();
  struct Pending{public float at,volume,pitch,gap;public string name,throttle;public AudioClip clip;public int priority;public Vector3? position;}readonly List<Pending> pending=new List<Pending>();
  readonly HashSet<string> loading=new HashSet<string>();float pendingFade=1.7f;bool unlocked,muted,paused;string desired="MusicExplore",playing="";float blend=1,fadeSeconds=2.2f;bool targetA=true;float soundClock;Vector3? eventPosition;
  float musicPref=1,sfxPref=1,uiPref=1,routineYieldUntil;
  CarrotGame game;CarrotSfxBank bank;CarrotAmbience ambience;bool busInstalled;
  [Serializable] class VolumeDTO {public float music=1,sfx=1,ui=1;}

  void Awake(){
   // The bus exists before any AudioSource can play, so every Unity channel and both music slots reach it.
   busInstalled=Carrot_BusInstall()==1;
   game=GetComponent<CarrotGame>();
   interfaceVoice=Source("Interface");interfaceVoice.priority=8;
   for(int i=0;i<VoiceCount;i++)voices.Add(new Voice{source=Source("Foley "+i)});
   foreach(var name in new[]{"ImpactSoft","ImpactGlass","ImpactWood","ImpactMetal","FootstepGrass","FootstepSnow","Coin","Build","Page","BookOpen","Chop","Slice"}){var clip=Resources.Load<AudioClip>("Carrot/Audio/"+name);if(clip!=null)clips[name]=clip;else Debug.LogWarning("Carrot audio missing: "+name);}
   foreach(var family in new[]{"Nibble","Dash","Shell","Swarm","Moth","Shaman","Burrow","Crystal"})foreach(var action in new[]{"Call","Hit","Attack"})LoadVoice("Voice"+family+action);
   foreach(var family in new[]{"Garden","Marsh","Frost"})foreach(var action in new[]{"Roar","Growl","Hit"})LoadVoice("Voice"+family+action);
   bank=new CarrotSfxBank(0xC0FFEEu);bank.Load(path=>Resources.Load<AudioClip>("Carrot/Audio/"+path));
   if(bank.Missing>0)Debug.LogWarning("Carrot audio variants missing: "+string.Join(", ",bank.MissingNames));
   foreach(var name in SynthLayers){var clip=Resources.Load<AudioClip>("Carrot/Audio/Synth/"+name);if(clip!=null){clips[name]=clip;if(clip.loadState==AudioDataLoadState.Unloaded)clip.LoadAudioData();}else Debug.LogWarning("Carrot synth layer missing: "+name);}
   clips["GardenArrival"]=Stinger("Brambleback arrival",new[]{98f,146.83f,196f},1.6f,0);clips["MarshArrival"]=Stinger("Lantern Regent arrival",new[]{164.81f,246.94f,293.66f},1.8f,1);clips["FrostArrival"]=Stinger("Crown of Winter arrival",new[]{261.63f,392f,523.25f},2.1f,2);clips["OrchardArrival"]=Stinger("Old Hollowhead arrival",new[]{110f,164.81f,207.65f},1.9f,0);clips["Victory"]=Stinger("Harvest celebration",new[]{261.63f,329.63f,392f,523.25f},2f,3);clips["Defeat"]=Stinger("A quiet retry",new[]{220f,174.61f,146.83f},1.6f,4);clips["Upgrade"]=Stinger("Blossoming upgrade",new[]{523.25f,659.25f,783.99f},.7f,3);
   // Difficulty pass cues (procedural, no new recordings): blindness, uproot, tithe, the Super merge and the three challenge-boss arrivals.
   clips["LanternSnuff"]=Stinger("Lantern snuff",new[]{392f,311.13f,233.08f},1.2f,1);clips["RootSnap"]=Stinger("Root snap",new[]{110f,82.41f},.5f,0);clips["TitheJingle"]=Stinger("Tithe jingle",new[]{783.99f,987.77f,1174.66f},.8f,3);
   clips["SuperForge"]=Stinger("Super forge",new[]{196f,293.66f,392f,587.33f},1.4f,2);clips["TornadoArrival"]=Stinger("Giant Tornado arrival",new[]{146.83f,220f,293.66f},1.8f,2);clips["ZombieArrival"]=Stinger("Zombie arrival",new[]{82.41f,123.47f,155.56f},2.2f,0);clips["EyeballArrival"]=Stinger("Unknown Eyeball arrival",new[]{233.08f,349.23f,466.16f,622.25f},2.4f,1);
   // Interface chirps (match src/minigames/carrot/uiAudio.ts).
   clips["UiClick"]=Chirp("UI click",new[]{new[]{1200f,1800f,.03f,.002f,.06f,.12f,0}});
   clips["UiOpen"]=Chirp("UI open",new[]{new[]{880f,990f,.04f,.002f,.08f,.1f,0},new[]{1320f,1480f,.04f,.002f,.11f,.1f,.055f}});
   clips["UiClose"]=Chirp("UI close",new[]{new[]{1320f,1180f,.04f,.002f,.07f,.09f,0},new[]{880f,780f,.04f,.002f,.09f,.08f,.05f}});
   clips["UiHover"]=Chirp("UI hover",new[]{new[]{2400f,2300f,.01f,.001f,.015f,.035f,0}});
   PrepareExpansionAudio();PreparePrismAudio();
   ambience=new CarrotAmbience(Source("Ambience"));
   Carrot_MusicMetaLoad(Application.streamingAssetsPath+"/Carrot/music-provenance.json");
   Debug.Log("CARROT_AUDIO bus="+(busInstalled?1:0)+" clips="+clips.Count+" variants="+bank.Loaded+" voices="+VoiceCount);
  }
  void LoadVoice(string name){var clip=Resources.Load<AudioClip>("Carrot/Audio/"+name);if(clip!=null){clips[name]=clip;if(clip.loadState==AudioDataLoadState.Unloaded)clip.LoadAudioData();}else Debug.LogWarning("Carrot voice missing: "+name);}
  AudioSource Source(string name){var go=new GameObject(name);go.transform.SetParent(transform,false);var s=go.AddComponent<AudioSource>();s.playOnAwake=false;s.spatialBlend=0;s.dopplerLevel=0;s.priority=name.StartsWith("Orchestra")?32:128;s.volume=0;return s;}

  // ---------------- page entry points (SendMessage to the CarrotGame object reaches this component) ----------------
  /// <summary>{music, sfx, ui} in 0..1 from the page's audio preferences (cgs-carrot-audio-v1). The campaign `sound` flag stays the master mute.</summary>
  public void SetVolumes(string json){
   var v=new VolumeDTO{music=musicPref,sfx=sfxPref,ui=uiPref};
   try{JsonUtility.FromJsonOverwrite(json??"{}",v);}catch(Exception){return;}
   musicPref=Clean(v.music);sfxPref=Clean(v.sfx);uiPref=Clean(v.ui);ApplyVolumes();Cue("volumes",musicPref*100+sfxPref*10+uiPref);
  }
  static float Clean(float v){return float.IsNaN(v)||float.IsInfinity(v)?1:Mathf.Clamp01(v);}
  /// <summary>QA calibration: master-bus makeup and output trims in dB ("6,-1").</summary>
  public void SetBusGains(string csv){var p=(csv??"").Split(',');if(p.Length==2&&float.TryParse(p[0],System.Globalization.NumberStyles.Float,System.Globalization.CultureInfo.InvariantCulture,out var a)&&float.TryParse(p[1],System.Globalization.NumberStyles.Float,System.Globalization.CultureInfo.InvariantCulture,out var b))Carrot_BusGains(a,b);}
  public void SetBiome(string biome){prismMusicTail=false;pending.Clear();lastSound.Clear();foreach(var v in voices)StopVoice(v);risers.Clear();ResetRun();BeginLevelMusic(biome);if(ambience!=null)StartCoroutine(ambience.Use(biome));}
  public void Unlock(){if(unlocked)return;unlocked=true;Transition(desired,.8f);}
  public void SetMuted(bool value){muted=value;ApplyVolumes();if(muted){foreach(var v in voices)StopVoice(v);if(interfaceVoice!=null)interfaceVoice.Stop();}}
  /// <summary>Legacy duck from the view. Blindness (1 s or more) ducks -6 dB for its hold; the short hit-stop calls
  /// (0.6 s, fired on routine thunder strikes and mortar double kills) are ignored, because routine fire never ducks and
  /// the big beats (Super, phase break, boss death, bites, telegraphs) schedule their own ducks.</summary>
  public void Duck(float seconds){if(seconds>=1)DuckMusic(-6,.08f,Mathf.Clamp(seconds,0,6),.6f);}
  void Later(float delay,string name,float volume,float pitch,string throttle,float gap,int priority=PRoutine){if(pending.Count>=96)return;pending.Add(new Pending{at=soundClock+delay,name=name,volume=volume,pitch=pitch,throttle=throttle,gap=gap,priority=priority,position=eventPosition});}
  void LaterClip(float delay,AudioClip clip,float volume,float pitch,string throttle,float gap,int priority){if(clip==null||pending.Count>=96)return;pending.Add(new Pending{at=soundClock+delay,clip=clip,volume=volume,pitch=pitch,throttle=throttle,gap=gap,priority=priority,position=eventPosition});}

  public void Tick(float dt,bool isPaused,string phase){
   if(isPaused!=paused){paused=isPaused;foreach(var v in voices){if(v.source==null)continue;if(paused)v.source.Pause();else v.source.UnPause();}for(int slot=0;slot<2;slot++)if(slotTrack[slot]!=null)Carrot_MusicPause(slot,paused?1:0);}
   if(ambience!=null)ambience.Tick(dt,EnemiesAlive()>0,DuckGain(),muted?0:sfxPref,paused);
   if(paused)return;
   soundClock+=dt;
   for(int i=pending.Count-1;i>=0;i--){if(soundClock<pending[i].at)continue;var p=pending[i];pending.RemoveAt(i);eventPosition=p.position;if(p.clip!=null)PlayClip(p.clip,p.volume,p.pitch,p.priority,p.position,false,p.throttle,p.gap);else Play(p.name,p.volume,p.pitch,p.throttle,p.gap,false,p.priority,p.position);eventPosition=null;}
   TickVoices();TickCues(dt);TickPrismMusic();TickMusic(dt,phase);
   blend=Mathf.Min(1,blend+dt/Mathf.Max(.1f,fadeSeconds));ApplyVolumes();if(blend>=1){int old=targetA?1:0;if(slotTrack[old]!=null)ReleaseSlot(old);}
  }
  void ApplyVolumes(){float level=muted?0:Mathf.Min(MusicMax,MusicLevel*musicPref);float inVolume=Mathf.Sin(blend*Mathf.PI*.5f)*level,outVolume=Mathf.Cos(blend*Mathf.PI*.5f)*level;SetSlotVolume(0,targetA?inVolume:outVolume);SetSlotVolume(1,targetA?outVolume:inVolume);}
  void SetSlotVolume(int slot,float volume){if(slotTrack[slot]==null||Mathf.Abs(slotVolume[slot]-volume)<.0005f)return;slotVolume[slot]=volume;Carrot_MusicVolume(slot,volume*TrackGain(slotTrack[slot]));}
  /// <summary>Music tracks live in StreamingAssets (Ogg Vorbis, MP3 for WebKit; about 8 MB the data file no longer carries). The first request for a track asks the browser (CarrotMusic.jslib) to fetch and decode it; the transition starts once the decode is in. Unity's own DownloadHandlerAudioClip is not used: on the Web player it rejects Ogg before the browser sees it and hands WebKit an empty clip after the MP3 decodes.</summary>
  void EnsureMusic(string name){if(string.IsNullOrEmpty(name)||musicReady.Contains(name)||loading.Contains(name))return;loading.Add(name);StartCoroutine(LoadMusic(name));}
  System.Collections.IEnumerator LoadMusic(string name){bool mp3=CarrotQuality.WebKit;string url=Application.streamingAssetsPath+"/Carrot/"+name+(mp3?".mp3":".ogg");Carrot_MusicLoad(name,url);
   // The browser downloads and decodes off the main thread; the transition waits for the buffer (up to 45 s) so the first play is not lost.
   float waited=0;int state;while((state=Carrot_MusicState(name))==0&&waited<45){waited+=Time.unscaledDeltaTime;yield return null;}
   loading.Remove(name);
   if(state!=1){if(state!=-2)Debug.LogWarning("Carrot music unavailable: "+name+(state==0?" (timed out)":" (download or decode failed)"));yield break;}
   musicReady.Add(name);Debug.Log("CARROT_MUSIC_LOADED "+name+" seconds="+Carrot_MusicSeconds(name).ToString("F0")+" after="+waited.ToString("F1"));
   // The page's own Play click already resumed the audio context, so the first track starts as soon as it is decoded rather than waiting for a tap in the garden.
   if(!unlocked&&Carrot_MusicRunning()==1){Unlock();yield break;}
   if(desired==name&&playing!=name)Transition(name,pendingFade);}
  void Transition(string name,float duration,bool restart=false){desired=name;if(!unlocked||(name==playing&&!restart))return;if(!musicReady.Contains(name)){pendingFade=duration;EnsureMusic(name);return;}int slot=targetA?1:0;ReleaseSlot(slot,name);if(Carrot_MusicPlay(slot,name,0)==0){Debug.LogWarning("Carrot music could not start: "+name);return;}targetA=slot==0;slotTrack[slot]=name;slotVolume[slot]=0;if(name=="MusicAsuna"&&prismMusicTail)Carrot_MusicTail(slot);if(paused)Carrot_MusicPause(slot,1);playing=name;blend=0;fadeSeconds=duration;trackLoops=0;Cue("music:"+name,duration);}
  // A quick retry may restart the same track that is fading out in this slot.
  // Keep that decoded buffer until Play consumes it; normal releases still unload it.
  void ReleaseSlot(int slot,string retain=null){string old=slotTrack[slot];Carrot_MusicStop(slot);slotTrack[slot]=null;slotVolume[slot]=-1;if(old!=null&&old!=retain&&slotTrack[1-slot]!=old&&!Wanted(old)){musicReady.Remove(old);Carrot_MusicUnload(old);}}

  // ---------------- voices ----------------
  void Play(string name,float volume,float pitch=1,string throttle=null,float minGap=0,bool creature=false,int priority=PRoutine,Vector3? at=null){if(!clips.TryGetValue(name,out var clip))return;PlayClip(clip,volume,pitch,priority,at,creature,throttle??name,minGap);}
  /// <summary>Plays a clip from a bank with the bank's per-pick pitch and level jitter.</summary>
  void PlayBank(string bankName,float volume,float pitch,int priority,string throttle,float gap,Vector3? at=null){if(bank==null)return;var clip=bank.Next(bankName);if(clip==null)return;PlayClip(clip,volume*bank.Volume(),pitch*bank.Pitch(),priority,at,false,throttle??bankName,gap);}
  void LaterBank(float delay,string bankName,float volume,float pitch,int priority,string throttle,float gap){if(bank==null)return;LaterClip(delay,bank.Next(bankName),volume*bank.Volume(),pitch*bank.Pitch(),throttle??bankName,gap,priority);}
  /// <summary>Returns the voice used, or null when the sound was dropped (muted, throttled, debounced, over budget or outranked).</summary>
  Voice PlayClip(AudioClip clip,float volume,float pitch,int priority,Vector3? at,bool creature,string throttle,float minGap){
   if(!unlocked||muted||paused||clip==null)return null;
   if(clip.loadState!=AudioDataLoadState.Loaded){if(clip.loadState==AudioDataLoadState.Unloaded)clip.LoadAudioData();return null;}
   at=at??eventPosition;
   if(throttle!=null&&minGap>0&&lastSound.TryGetValue(throttle,out float last)&&soundClock-last<minGap)return null;
   var voice=Allocate(clip,priority,creature);if(voice==null)return null;
   // Headroom: each class competes only with its own class and the classes above it, so a crowd of routine fire can
   // never squeeze a telegraph, a bite or a boss beat; the limiter catches the sum.
   int floor=priority>=PSignature?PSignature:priority>=PKill?PKill:0;
   float aggregate=0;foreach(var v in voices)if(v!=voice&&Busy(v)&&v.priority>=floor)aggregate+=v.volume*Remaining(v);
   float budget=priority>=PSignature?FoleyBudget:priority>=PKill?FoleyBudget*.8f:RoutineBudget;
   volume*=SfxGain*sfxPref;
   // Routine fire steps back (-4 dB) for 400 ms under every threat or boss cue, so the important sound reads.
   if(priority>=PBoss)routineYieldUntil=soundClock+.4f;else if(priority<=PRoutine&&soundClock<routineYieldUntil)volume*=.63f;
   volume=Mathf.Min(volume,Mathf.Max(0,budget-aggregate));
   if(volume<.006f)return null;
   if(throttle!=null)lastSound[throttle]=soundClock;
   var s=voice.source;s.Stop();s.clip=clip;s.volume=Mathf.Clamp(volume,0,.9f);s.pitch=Mathf.Clamp(pitch,.5f,2f);
   s.spatialBlend=at.HasValue?.2f:0;s.minDistance=18;s.maxDistance=42;s.rolloffMode=AudioRolloffMode.Linear;s.transform.position=at??transform.position;
   s.panStereo=at.HasValue?Mathf.Clamp((at.Value.x-ListenerX)*PanScale,-PanLimit,PanLimit):0;s.priority=priority>=PSignature?16:creature?100:128;s.Play();
   voice.clip=clip;voice.priority=priority;voice.creature=creature;voice.start=soundClock;voice.end=soundClock+clip.length/Mathf.Max(.5f,s.pitch);voice.volume=s.volume;voice.fadeTo=-1;voice.owner=0;
   return voice;
  }
  bool Busy(Voice v){return v.clip!=null&&soundClock<v.end;}
  float Remaining(Voice v){float len=Mathf.Max(.01f,v.end-v.start);return Mathf.Clamp01((v.end-soundClock)/len);}
  /// <summary>Free voice, else steal: within a clip over its concurrency limit, the oldest of that clip; else the
  /// lowest-priority, most-decayed voice strictly below the request. Routine requests never steal, so routine fire
  /// is what drops first. Creature voices are capped so calls cannot crowd out combat.</summary>
  Voice Allocate(AudioClip clip,int priority,bool creature){
   int same=0,creatures=0;Voice oldestSame=null,free=null;
   foreach(var v in voices){
    if(!Busy(v)){if(free==null)free=v;continue;}
    if(v.creature)creatures++;
    if(v.clip==clip){same++;if(soundClock-v.start<Debounce&&priority<PThreat)return null;if(oldestSame==null||v.start<oldestSame.start)oldestSame=v;}
   }
   if(same>=PerClipConcurrency)return oldestSame!=null&&oldestSame.priority<=priority?oldestSame:null;
   if(creature&&creatures>=CreatureVoiceLimit&&priority<PBoss)return null;
   if(free!=null)return free;
   if(priority<=PRoutine)return null;
   Voice best=null;float bestScore=float.MaxValue;
   foreach(var v in voices){if(v.priority>=priority)continue;float score=v.priority*10+Remaining(v);if(score<bestScore){bestScore=score;best=v;}}
   return best;
  }
  void StopVoice(Voice v){if(v.source!=null)v.source.Stop();v.clip=null;v.end=0;v.owner=0;v.fadeTo=-1;}
  void TickVoices(){foreach(var v in voices){if(v.fadeTo<0||v.source==null)continue;v.source.volume=Mathf.MoveTowards(v.source.volume,v.fadeTo,Time.unscaledDeltaTime*8);if(v.source.volume<=.001f){StopVoice(v);}}}
  /// <summary>In-game interface sounds: the same synthesised chirps as the page's menus (uiAudio.ts), so a click sounds
  /// identical before and after Unity loads. Scaled by the interface preference; never part of the foley pool.</summary>
  public void UiSound(string kind){eventPosition=null;Unlock();if(muted||uiPref<=0)return;if(lastSound.TryGetValue("ui",out var last)&&soundClock-last<.045f)return;string key=kind=="open"?"UiOpen":kind=="close"?"UiClose":kind=="hover"?"UiHover":"UiClick";if(!clips.TryGetValue(key,out var clip))return;lastSound["ui"]=soundClock;interfaceVoice.Stop();interfaceVoice.clip=clip;interfaceVoice.volume=uiPref;interfaceVoice.pitch=1;interfaceVoice.Play();}
  /// <summary>Sine chirps: each voice is {from Hz, to Hz, glide s, attack s, decay s, peak, delay s}, exponential glide and decay (uiAudio.ts recipes).</summary>
  AudioClip Chirp(string name,float[][] parts){const int rate=24000;float length=0;foreach(var p in parts)length=Mathf.Max(length,p[6]+p[3]+p[4]+.02f);int n=Mathf.CeilToInt(length*rate);var pcm=new float[n];
   foreach(var p in parts){double ph=0;int start=Mathf.RoundToInt(p[6]*rate);for(int i=start;i<n;i++){float t=(i-start)/(float)rate;float f=t>=p[2]?p[1]:p[0]*Mathf.Pow(p[1]/p[0],t/p[2]);ph+=2*Math.PI*f/rate;float env=t<p[3]?t/p[3]:p[5]*Mathf.Pow(.0001f/p[5],(t-p[3])/p[4]);if(t<p[3])env*=p[5];if(t>p[3]+p[4])break;pcm[i]+=(float)Math.Sin(ph)*env;}}
   var clip=AudioClip.Create(name,n,1,rate,false);clip.SetData(pcm,0);authored.Add(clip);return clip;}

  // ---------------- creatures ----------------
  public void Creature(string kind,string action,Vector3 at){
   if(ExpansionCreature(kind,action,at))return;
   if(kind=="fragment")kind="crystal";bool boss=kind=="garden"||kind=="marsh"||kind=="frost"||kind=="orchard"||kind=="tornado"||kind=="zombie"||kind=="eyeball";
   if(boss&&action=="spawn")return;
   // The challenge bosses borrow a recorded family at a shifted pitch (the tornado howls low in the Frost voice, the zombie groans in Garden's, the eyeball shrieks high in Marsh's), each with its own procedural layer on major calls.
   string family;switch(kind){case "nibble":family="Nibble";break;case "dash":family="Dash";break;case "shell":family="Shell";break;case "swarm":family="Swarm";break;case "moth":family="Moth";break;case "shaman":family="Shaman";break;case "burrow":family="Burrow";break;case "crystal":family="Crystal";break;case "garden":family="Garden";break;case "marsh":family="Marsh";break;case "frost":family="Frost";break;case "orchard":family="Garden";break;case "tornado":family="Frost";break;case "zombie":family="Garden";break;case "eyeball":family="Marsh";break;default:return;}
   string suffix=boss?(action=="roar"?"Roar":action=="attack"||action=="growl"?"Growl":"Hit"):(action=="spawn"?"Call":action=="attack"?"Attack":"Hit");
   bool major=boss&&(action=="roar"||action=="growl");int priority=major?PBoss:action=="attack"?PKill:action=="death"?PKill:PRoutine;
   if(!major&&lastSound.TryGetValue("creature-global",out var global)&&soundClock-global<.13f)return;
   float volume=major?(action=="roar"?.27f:.19f):boss?.11f:action=="spawn"?.045f:action=="attack"?.105f:action=="death"?.08f:.055f;
   float basePitch=boss?(kind=="garden"?.9f:kind=="marsh"?.94f:kind=="orchard"?.78f:kind=="tornado"?.58f:kind=="zombie"?.70f:kind=="eyeball"?1.12f:.88f):kind=="moth"?1.07f:kind=="dash"?1.04f:1;
   float variation=bank!=null?Mathf.Lerp(1,bank.Pitch(),action=="hit"?1:.35f):1;float gap=action=="spawn"?1.8f:major?1.25f:action=="hit"?.40f:.30f;
   Play(K("Voice",family,suffix),volume,basePitch*variation,K("creature-",kind,action),gap,true,priority,at);lastSound["creature-global"]=soundClock;
   if(major)BossLayer(kind,action=="roar"?.16f:.1f,at);
  }
  void BossLayer(string kind,float volume,Vector3 at){string layer=kind=="tornado"?"TornadoWind":kind=="zombie"?"ZombieGroan":kind=="eyeball"?"EyeballShriek":null;if(layer!=null)Play(layer,volume,1,K("bosslayer-",kind),1.2f,false,PBoss,at);}

  // ---------------- events ----------------
  public void Handle(CarrotEvent e){eventPosition=e.position;if(e.type=="build"||e.type=="upgrade"||e.type=="bossEnter"||e.type=="victory")Unlock();float variant=bank!=null?bank.Pitch():1;
   if(HandleContract(e)){eventPosition=null;return;}
   if(ExpansionSound(e,variant)){eventPosition=null;return;}
   switch(e.type){
   case "build":Play("Build",.28f,variant,"build",.05f,priority:PSignature);PlayBank("Coin",.09f,1.3f,PKill,"buildcoin",.08f);PlayBank("Grass",.1f,.8f,PKill,"buildplant",.08f);break;
   case "upgrade":Play("Upgrade",.25f,1,"upgrade",.1f,priority:PSignature);Play("Build",.15f,1.15f,"upgradebuild",.05f,priority:PSignature);if(e.tier>=4)PlayBank("Bell",.08f,1.5f,PSignature,"upgradebell",.3f);break;
   case "sell":Coins(3,.9f,"sell");PlayBank("Coin",.2f,variant,PSignature,"reward",.08f);break;
   case "clear":PlayBank("Coin",.2f,variant,PSignature,"reward",.08f);Play("Chop",.1f,.82f,"clearchop",.1f,priority:PKill);if(e.value>0)Coins(4,1,"scenery");break;
   case "coins":if(e.kind=="wave"){Coins(Mathf.Clamp(Mathf.RoundToInt(e.value/6f),3,6),1.05f,"stipend");if(!judgementSeen)LegacyClear();}else if(e.kind=="coinLeech"){CoinsDown();Play("TitheJingle",.12f,.8f,"leech",.6f,priority:PSignature);}break;
   case "shot":Shot(e);break;
   case "impact":Impact(e);break;
   case "spawn":Creature(e.kind,"spawn",e.position);break;
   case "death":Death(e);break;
   case "bite":Creature(e.kind,"attack",e.position);break;
   case "heal":Play("HealChime",.09f,bank!=null?bank.Pitch():1,"heal",.6f,priority:PSignature);break;
   case "carrotHit":Bite(e);break;
   case "wave":WaveStart(e);break;
   // Every encounter boss has its own streamed composition; minibosses never interrupt the score.
   case "bossEnter":{BossMusic(e.kind);string theme=BossTheme(e.kind);string arrival=e.kind=="orchard"?"OrchardArrival":e.kind=="tornado"?"TornadoArrival":e.kind=="zombie"?"ZombieArrival":e.kind=="eyeball"?"EyeballArrival":e.kind=="portal"?"PortalArrival":theme+"Arrival";Play(arrival,.28f,1,"arrival",1,priority:PBoss);Play("SubThump",.2f,.8f,"arrivalsub",1,priority:PBoss);Creature(e.kind,"roar",e.position);DuckMusic(-4,.15f,1.2f,1.2f);Cue("bossEnter:"+e.kind,0);break;}
   case "telegraph":Telegraph(e);break;
   case "ability":if(SignatureSound(e))break;
    if(e.kind=="phase"){PhaseBreakSound(e);break;}
    if(e.kind=="blind"||e.kind=="dusk"){Play("LanternSnuff",.3f,e.kind=="dusk"?.8f:1,"blindability",.4f,priority:PBoss);DuckMusic(-6,.08f,Mathf.Max(1,e.value),.6f);}
    else if(e.kind=="whiteout"){PlayBank("Glass",.26f,.5f,PBoss,"iceability",.4f);Play("LanternSnuff",.18f,1.5f,"whiteout",.4f,priority:PBoss);DuckMusic(-6,.08f,2.5f,.6f);}
    else if(e.kind=="uproot"){Play("RootSnap",.3f,e.tier>=5?1.3f:1,"uprootability",.3f,priority:PBoss);LaterBank(.06f,"Wood",.22f,.55f,PBoss,"rootability",.3f);Later(.12f,"Chop",.14f,.9f,"uprootchop",.3f,PBoss);Play("SubThump",.18f,.9f,"uprootsub",.3f,priority:PBoss);}
    else if(e.kind=="tithe"){Play("TitheJingle",.24f,1,"tithe",.4f,priority:PBoss);PlayBank("Coin",.14f,1.2f,PBoss,"tithecoin",.3f);CoinsDown();}
    else if(e.kind=="gust"){PlayBank("Snow",.2f,.6f,PBoss,"gust",.4f);PlayBank("Slice",.1f,.7f,PBoss,"gustslice",.4f);BossLayer("tornado",.14f,e.position);}
    else if(e.kind=="liftoff"){PlayBank("Slice",.18f,.55f,PBoss,"liftoff",.4f);LaterBank(.15f,"Snow",.14f,.5f,PBoss,"liftdust",.4f);BossLayer("tornado",.12f,e.position);}
    else if(e.kind=="raise"){Play("BookOpen",.24f,.45f,"raise",.4f,priority:PBoss);LaterBank(.1f,"Wood",.16f,.5f,PBoss,"raisewood",.4f);BossLayer("zombie",.14f,e.position);}
    else if(e.kind=="gaze"){PlayBank("Glass",.22f,.9f,PBoss,"gaze",.4f);PlayBank("Slice",.1f,1.6f,PBoss,"gazeslice",.4f);BossLayer("eyeball",.12f,e.position);}
    else if(e.kind=="breath"||e.kind=="shatter"){PlayBank("Glass",.25f,.73f,PBoss,"iceability",.4f);PlayBank("Slice",.12f,.8f,PBoss,"iceslice",.3f);if(e.kind=="shatter")PlayBank("Mining",.14f,1.2f,PBoss,"shattermining",.4f);}
    else if(e.kind=="root"||e.kind=="bark"||e.kind=="rush"||e.kind=="heap"){PlayBank("Wood",.26f,.61f,PBoss,"rootability",.35f);Play("SubThump",.14f,1,"rootsub",.35f,priority:PBoss);}
    else if(e.kind=="burrow"||e.kind=="emerge"){PlayBank("Grass",.08f,.6f,PKill,K("burrow-",e.kind),.4f);}
    else{Play("Page",.2f,.6f,"spellability",.4f,priority:PSignature);PlayBank("SoftHeavy",.15f,.65f,PSignature,"spellsoft",.3f);}break;
   case "merge":SuperForged(e);break;
   case "mergeUndo":Play("Page",.16f,.7f,"mergeundo",.3f,priority:PSignature);PlayBank("Coin",.1f,1.1f,PSignature,"undocoin",.2f);break;
   case "victory":Play("Victory",.32f,1,"victory",1,priority:PThreat);DuckMusic(-9,.3f,1.4f,1.2f);Cue("victory",e.value);if(!FinishPrismScore())EndLevelMusic();break;
   case "defeat":Play("Defeat",.28f,1,"defeat",1,priority:PThreat);DuckMusic(-6,.3f,1.2f,1.2f);Cue("defeat",e.value);if(!FinishPrismScore())EndLevelMusic();break;
  }eventPosition=null;}
  bool SignatureSound(CarrotEvent e){string clip=null,bankName=null;float pitch=1,volume=.08f;switch(e.kind){case "seedBurst":bankName="Grass";pitch=1.4f;break;case "crystallize":case "shieldBreak":bankName="GlassLight";pitch=1.3f;break;case "burn":bankName="Wood";pitch=.68f;break;case "prismFocus":bankName="Slice";pitch=1.7f;volume=.035f;break;case "conductive":bankName="Metal";pitch=1.7f;volume=.04f;break;case "blossomBuff":clip="Upgrade";pitch=.78f;volume=.055f;break;case "gravity":clip="SigGravity";pitch=.8f;volume=.1f;break;case "rewind":clip="Page";pitch=.65f;volume=.12f;break;}
   if(clip==null&&bankName==null)return false;
   if(bankName!=null)PlayBank(bankName,volume,pitch,PSignature,K("signature-",e.kind),.23f,e.position);else Play(clip,volume,pitch,K("signature-",e.kind),.23f,false,PSignature,e.position);
   if(e.kind=="shieldBreak")Play("SubThump",.08f,1.4f,"shieldsub",.3f,priority:PSignature);
   return true;}
  AudioClip Stinger(string name,float[] notes,float duration,int timbre){const int rate=24000;int samples=Mathf.CeilToInt(duration*rate);float[] pcm=new float[samples];for(int i=0;i<samples;i++){float t=i/(float)rate;float value=0;for(int n=0;n<notes.Length;n++){float start=n*(timbre==3?.105f:.045f),u=t-start;if(u<0)continue;float env=(1-Mathf.Exp(-u*90))*Mathf.Exp(-u*(timbre==0?2.8f:3.8f));float phase=u*notes[n]*Mathf.PI*2;float tone=Mathf.Sin(phase)+Mathf.Sin(phase*2.003f)*.27f+Mathf.Sin(phase*3.99f)*.12f;if(timbre==2||timbre==1)tone+=Mathf.Sin(phase*5.41f)*.13f;if(timbre==0)tone+=Mathf.Sin(phase*.5f)*.35f;value+=tone*env;}pcm[i]=(float)Math.Tanh(value*.24f)*Mathf.Clamp01((duration-t)*7);}var clip=AudioClip.Create(name,samples,1,rate,false);clip.SetData(pcm,0);authored.Add(clip);return clip;}
  int EnemiesAlive(){if(game==null||game.enemies==null)return 0;int n=0;foreach(var x in game.enemies)if(x!=null&&x.alive&&!x.hidden)n++;return n;}
  void Cue(string name,float value){Carrot_AudioCue(name,value);}
  // Interned "prefix+kind" keys: combat events (shots, hits, voices) allocate no strings after the first of each kind.
  readonly Dictionary<(string,string),string> keys=new Dictionary<(string,string),string>();
  string K(string a,string b){var id=(a,b??"");if(!keys.TryGetValue(id,out var k)){k=a+(b??"");keys[id]=k;}return k;}
  string K(string a,string b,string c){return K(K(a,b),c);}
  void OnDestroy(){for(int slot=0;slot<2;slot++)Carrot_MusicStop(slot);foreach(var clip in authored)if(clip!=null)Destroy(clip);if(ambience!=null)ambience.Dispose();}
 }
}
