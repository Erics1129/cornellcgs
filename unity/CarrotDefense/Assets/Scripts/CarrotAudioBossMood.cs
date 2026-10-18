using System;
using System.Collections;
using System.Collections.Generic;
using UnityEngine;

namespace CarrotTD {
 // BOSS MOOD, sound (presentation only). Reads the CarrotBossMood bus that the view writes
 // and the game state, never writes either. Never touches the music path (Transition, BossMusic, Carrot_Music*, the bossEnter
 // theme map): the only music call is the held-breath Duck(2.5), the same duck blindness uses.
 //
 //  - Privation: on boss levels a bare copy of the biome bed (its wind without the birds, frogs, creaks, crickets or pings) plays
 //    under the bed, offset half a loop so the two winds are uncorrelated, and an equal-power crossfade takes the life out: a
 //    little after every wave, all of it over the 3 s held breath before the guardian, none of it back until the guardian falls.
 //  - Foreboding drone (campaign guardians only): an unpitched air layer and an open-fifth tone layer, rising with the mood
 //    before the guardian (-33 dBFS at De .25 up to -28 at De 1, De^.7), then 12 dB down over 3 s from the arrival so the
 //    guardian's theme carries the fight. The tone layer plays only over a playing track whose confident key holds both its
 //    pitch classes, 6 dB down over an unconfident track. Under every boss or miniboss windup and under the heartbeat it
 //    sits 6 dB lower; it follows the music ducks like the bed. Challenges get no drone: their guardian theme plays from wave 1.
 //  - Held breath: Duck(2.5) once, when the real seconds left in the breather before the guardian cross 2.5 s. When the guardian
 //    wave is called early instead (send now, the bus's SendNowAge), the bed and the drone go silent over 0.3 s until it arrives.
 //  - Breath: a phase break (or Asuna's prism break, once its cast resolves) dips the bed and the drone 3 dB for 6 s; the
 //    world does not brighten (the guardian just got stronger).
 //  - Distant crows before Old Hollowhead (S0 only): at most one call per wave, never within 4 s of a wave call, never within
 //    1.5 s of a windup, never near the end of a wave (three or more creatures on the board).
 //  - Release (the real guardian falls): 0.8 s of wind only, the first natural sound at +1.2 s, the bed whole again by +4 s;
 //    the drone falls a fourth while it fades 18 dB, and is gone by +2.5 s. Challenges with waves left keep the bed bare.
 public sealed partial class CarrotAudio {
  AudioSource moodAir,moodTone,moodBare;
  AudioClip moodAirClip,moodToneClip,moodBareClip;readonly List<AudioClip> moodMade=new List<AudioClip>();
  int moodBuild=int.MinValue,moodLevel=-1,moodWork;bool moodOn,moodBareReady,moodDroneReady,moodDroneStopped;string moodProfile="",moodBareBiome="";
  int moodArrivals,moodPhases,moodReleases,moodLastWave,moodBossWave,moodCrowWave=-1,moodDawnSeen;
  bool moodHeld,moodSendNow,moodPrismCasting,moodChallenge,moodArrived,moodPausedNow;float moodPLogged=-1,moodSendSeen=-1,moodQaClock;
  readonly List<AudioSource> moodHeldPaused=new List<AudioSource>();
  float moodP,moodBedLevel,moodCut=1,moodArrivalFade=1,moodCastGain=1,moodKeyGain=.5f,moodDroneGain,moodGlide=1;
  float moodReleaseAt=-1,moodBreathAt=-99,moodLastCast=-99,moodLastWaveAt=-99,moodSendAt=-99,moodCrowAt=-1;
  bool moodFirstPlayed,moodBedBackLogged,moodResolvedLogged;
  System.Random moodRng;
  const float MoodBreathSeconds=6,MoodHeldDuck=2.5f,MoodSendCut=.3f,MoodFirstCall=1.2f,MoodBedBack=4,MoodResolve=2.5f;

  /// <summary>BOSS MOOD hook (CarrotAudio.Tick, after the ambience). dt is real seconds.</summary>
  void TickBossMood(float dt,bool isPaused){
   int gate=MoodGate();
   if(gate<0){if(moodOn||(ambience!=null&&ambience.MoodGain!=1))MoodOff();return;}
   // a boss level the view has not reached yet (the bus still describes the previous level for a frame): stop, keep the clips
   if(gate==0){if(moodOn&&moodLevel!=game.level.id){MoodStopSources(true);moodBuild=int.MinValue;}return;}
   if(CarrotBossMood.Build!=moodBuild)MoodBegin();
   MoodPause(isPaused);
   if(isPaused)return;
   int stage=CarrotBossMood.Stage;float De=Mathf.Clamp01(CarrotBossMood.De);
   // ---- events (counters on the bus; each increments once per event) ----
   if(CarrotBossMood.ArrivalCount!=moodArrivals){moodArrivals=CarrotBossMood.ArrivalCount;MoodArrival();}
   if(CarrotBossMood.PhaseCount!=moodPhases){moodPhases=CarrotBossMood.PhaseCount;MoodBreath("phase");}
   if(CarrotBossMood.ReleaseCount!=moodReleases){moodReleases=CarrotBossMood.ReleaseCount;MoodRelease();}
   if(game.wave!=moodLastWave){MoodWaveStart(game.wave);moodLastWave=game.wave;}
   // Send now: the view reports the guardian wave called while its breather still ran (SendNowAge restarts at 0); the bed and the
   // drone go silent at once instead of the held breath.
   float sna=CarrotBossMood.SendNowAge;if(sna>=0&&(moodSendSeen<0||sna<moodSendSeen-.001f)){moodHeld=true;moodSendNow=true;moodSendAt=soundClock;Cue("mood:sendnow",game.wave);}moodSendSeen=sna;
   bool casting=MoodCasting();if(casting)moodLastCast=soundClock;
   MoodPrismBreak();
   // ---- held breath: one duck when the real breather seconds before the guardian cross 2.5 s (or at once when the breather is
   //      shorter, at 2x), held until the wave call: Duck(2.5), or the seconds left, at least 1 ----
   float real=game.nextWave/EffectiveSpeed();
   if(!moodHeld&&moodBossWave>=2&&game.phase=="playing"&&game.wave==moodBossWave-1&&game.nextWave>0&&real<=MoodHeldDuck+.02f){moodHeld=true;Duck(Mathf.Clamp(real,1,MoodHeldDuck));Cue("mood:held",real);}
   // ---- privation target ----
   float target=MoodPrivation(stage);
   float rate=stage==1?1/3f:moodReleaseAt>=0&&soundClock-moodReleaseAt<MoodBedBack?1/(MoodBedBack-MoodFirstCall):.35f;
   if(moodReleaseAt>=0&&soundClock-moodReleaseAt<MoodFirstCall)target=Mathf.Max(target,moodP); // wind only until the first call
   moodP=Mathf.MoveTowards(moodP,target,dt*rate);
   // ---- send now: silence until the guardian arrives (at most 2 s), back over 0.8 s ----
   bool hush=moodSendNow&&soundClock-moodSendAt<2;
   moodCut=Mathf.MoveTowards(moodCut,hush?0:1,dt/(hush?MoodSendCut:.8f));
   if(moodSendNow&&!hush)moodSendNow=false;
   float breath=MoodBreathGain();
   // ---- bed: full and bare, equal power (the two winds are uncorrelated) ----
   float bedTarget=CarrotAmbience.PlayGain*(EnemiesAlive()>0?.5f:1)*Mathf.Clamp01(DuckGain())*Mathf.Clamp01(muted?0:sfxPref);
   moodBedLevel=Mathf.MoveTowards(moodBedLevel,bedTarget,dt*(bedTarget<moodBedLevel?.9f:.25f));
   float a=moodBareReady?Mathf.Cos(moodP*Mathf.PI*.5f):1,b=moodBareReady?Mathf.Sin(moodP*Mathf.PI*.5f):0;
   if(ambience!=null)ambience.MoodGain=a*moodCut*breath;
   if(moodBare!=null)moodBare.volume=Mathf.Clamp(moodBedLevel*b*moodCut*breath,0,1);
   // ---- drone ----
   if(moodDroneReady&&!moodDroneStopped)MoodDrone(dt,De,stage,casting,breath);
   MoodOneShots(stage);
   MoodMilestones();
#if UNITY_EDITOR||DEVELOPMENT_BUILD||CARROT_QA
   moodQaClock+=dt;if(moodQaClock>=1){moodQaClock=0;var inv=System.Globalization.CultureInfo.InvariantCulture;
    float drone=moodDroneGain>1e-5f?20*Mathf.Log10(moodDroneGain)+CarrotBossMoodSynth.TargetRmsDb:-120;
    Debug.Log("CARROT_MOOD_SOUND level="+game.level.id+" stage="+stage+" De="+De.ToString("F3",inv)+" p="+moodP.ToString("F2",inv)+" drone="+drone.ToString("F1",inv)+"dBFS key="+moodKeyGain.ToString("F2",inv)+" track="+playing+" bed="+(ambience!=null?ambience.MoodGain:1).ToString("F2",inv)+" bare="+(moodBare!=null?moodBare.volume:0).ToString("F3",inv)+" cut="+moodCut.ToString("F2",inv)+" breath="+breath.ToString("F2",inv));}
#endif
   // QA: privation in tenths, logged on change only (the cue log is a 512-entry ring shared with the music).
   float tenth=Mathf.Round(moodP*10)/10;if(tenth!=moodPLogged){moodPLogged=tenth;Cue("mood:p",tenth);}
  }

  /// <summary>-1: no mood here (a non-boss level, duo, endless, or the view switched it off for this level); 0: a boss level the bus
  /// has not caught up with yet; 1: active.</summary>
  int MoodGate(){
   if(game==null||game.level==null||string.IsNullOrEmpty(game.level.boss)||CarrotBossMoodCurve.Profile(game.level.id)=="")return -1;
   if(game.Mode!="normal"&&game.Mode!="veteran")return -1;
   if(CarrotBossMood.Level!=game.level.id)return 0;
   return CarrotBossMood.Active&&!string.IsNullOrEmpty(CarrotBossMood.Profile)?1:-1;
  }

  void MoodBegin(){
   MoodStopSources(false);
   moodBuild=CarrotBossMood.Build;moodLevel=game.level.id;moodOn=true;
   string profile=CarrotBossMood.Profile;bool sameDrone=profile==moodProfile&&moodAirClip!=null&&moodToneClip!=null;
   moodProfile=profile;moodChallenge=CarrotBossMoodCurve.Challenge(game.level.id);moodBossWave=CarrotBossMoodCurve.BossWave(game.level.id);
   moodArrivals=CarrotBossMood.ArrivalCount;moodPhases=CarrotBossMood.PhaseCount;moodReleases=CarrotBossMood.ReleaseCount;moodLastWave=game.wave;
   moodHeld=false;moodSendNow=false;moodPrismCasting=false;moodP=0;moodBedLevel=0;moodCut=1;moodArrivalFade=1;moodCastGain=1;moodDroneGain=0;moodGlide=1;moodKeyGain=.5f;
   moodReleaseAt=-1;moodBreathAt=-99;moodLastCast=-99;moodLastWaveAt=soundClock;moodSendAt=-99;moodCrowAt=-1;moodCrowWave=-1;moodDroneStopped=false;
   moodFirstPlayed=moodBedBackLogged=moodResolvedLogged=false;moodArrived=false;moodPLogged=-1;moodPausedNow=false;moodSendSeen=CarrotBossMood.SendNowAge;moodHeldPaused.Clear();
   moodRng=new System.Random(9307+game.level.id*31+1);
   if(!sameDrone){FreeMoodClip(ref moodAirClip);FreeMoodClip(ref moodToneClip);}
   string biome=ambience!=null?ambience.Biome:CarrotAmbience.Normalize(game.level.biome);
   bool life=biome!="arena";
   if(!life||moodBareBiome!=biome)FreeMoodClip(ref moodBareClip);
   moodBareReady=false;moodDroneReady=false;
   if(moodAir==null){moodAir=MoodSource("Mood air");moodTone=MoodSource("Mood tone");moodBare=MoodSource("Mood bare bed");}
   Cue("mood:build",game.level.id);
   StartCoroutine(MoodRender(moodBuild,profile,biome,life));
  }
  AudioSource MoodSource(string name){var s=Source(name);s.loop=true;s.priority=190;s.volume=0;return s;}
  void FreeMoodClip(ref AudioClip clip){if(clip==null)return;foreach(var s in new[]{moodAir,moodTone,moodBare})if(s!=null&&s.clip==clip){s.Stop();s.clip=null;}moodMade.Remove(clip);Destroy(clip);clip=null;}

  /// <summary>Renders the bare bed, the drone layers and the profile's one-shots, time-sliced (about 0.25 s of audio per frame).</summary>
  IEnumerator MoodRender(int build,string profile,string biome,bool life){
   var sw=System.Diagnostics.Stopwatch.StartNew();sw.Stop();long bytes=0;float worst=0;
   if(life&&moodBareClip==null){
    float[] pcm=null;var e=CarrotAmbience.Render(biome,d=>pcm=d,false);
    while(true){sw.Start();var t0=sw.Elapsed.TotalMilliseconds;bool more=e.MoveNext();worst=Mathf.Max(worst,(float)(sw.Elapsed.TotalMilliseconds-t0));sw.Stop();if(!more)break;if(build!=moodBuild)yield break;yield return null;}
    if(build!=moodBuild)yield break;
    moodBareClip=AudioClip.Create("Mood bare "+biome,pcm.Length,1,CarrotAmbience.Rate,false);moodBareClip.SetData(pcm,0);moodMade.Add(moodBareClip);moodBareBiome=biome;bytes+=pcm.Length*4L;
   }
   if(build!=moodBuild)yield break;
   if(moodBareClip!=null&&moodBare!=null){moodBare.clip=moodBareClip;moodBare.volume=0;moodBare.time=CarrotAmbience.LoopSeconds*.5f;moodBare.Play();if(paused)moodBare.Pause();moodBareReady=true;}
   var layers=CarrotBossMoodSynth.DroneLayers(profile);
   foreach(var layer in layers){
    bool tone=layer=="tone";if((tone?moodToneClip:moodAirClip)!=null)continue;
    float[] pcm=null;var e=CarrotBossMoodSynth.RenderDrone(profile,layer,d=>pcm=d);
    while(true){sw.Start();var t0=sw.Elapsed.TotalMilliseconds;bool more=e.MoveNext();worst=Mathf.Max(worst,(float)(sw.Elapsed.TotalMilliseconds-t0));sw.Stop();if(!more)break;if(build!=moodBuild)yield break;yield return null;}
    if(build!=moodBuild)yield break;
    var clip=AudioClip.Create("Mood "+layer+" "+profile,pcm.Length,1,CarrotBossMoodSynth.Rate,false);clip.SetData(pcm,0);moodMade.Add(clip);bytes+=pcm.Length*4L;
    if(tone)moodToneClip=clip;else moodAirClip=clip;
   }
   if(build!=moodBuild)yield break;
   foreach(var kind in MoodOneShotKinds(profile)){
    string name="Mood"+kind;if(clips.ContainsKey(name))continue;
    sw.Start();var pcm=CarrotBossMoodSynth.RenderOneShot(kind);sw.Stop();
    var clip=AudioClip.Create(name,pcm.Length,1,CarrotBossMoodSynth.Rate,false);clip.SetData(pcm,0);moodMade.Add(clip);clips[name]=clip;bytes+=pcm.Length*4L;yield return null;
   }
   if(layers.Length>0&&moodAirClip!=null&&moodToneClip!=null){
    moodAir.clip=moodAirClip;moodTone.clip=moodToneClip;moodAir.volume=moodTone.volume=0;moodAir.pitch=moodTone.pitch=1;moodAir.Play();moodTone.Play();if(paused){moodAir.Pause();moodTone.Pause();}moodDroneReady=true;
   }
   moodWork=(int)sw.ElapsedMilliseconds;
   Debug.Log("CARROT_MOOD_AUDIO level="+(game!=null&&game.level!=null?game.level.id:0)+" profile="+profile+" bare="+(moodBareClip!=null?1:0)+" layers="+layers.Length+" ms="+moodWork+" slice="+worst.ToString("F2")+" pcm="+(MoodBytes()/1024)+"KiB new="+(bytes/1024)+"KiB");
   Cue("mood:ready",moodWork);
  }
  static IEnumerable<string> MoodOneShotKinds(string profile){
   if(CarrotBossMoodSynth.Crows(profile)){yield return "crowA";yield return "crowB";yield return "crowC";}
   var call=CarrotBossMoodSynth.ReleaseCall(profile);if(call!=null)yield return call;
  }
  long MoodBytes(){long n=0;foreach(var c in moodMade)if(c!=null)n+=c.samples*4L*c.channels;return n;}

  /// <summary>The mood sources pause with the game (the bed does the same) and resume where they were.</summary>
  void MoodPause(bool isPaused){
   if(isPaused==moodPausedNow)return;moodPausedNow=isPaused;
   if(isPaused){moodHeldPaused.Clear();foreach(var s in new[]{moodAir,moodTone,moodBare})if(s!=null&&s.isPlaying){s.Pause();moodHeldPaused.Add(s);}}
   else{foreach(var s in moodHeldPaused)if(s!=null)s.UnPause();moodHeldPaused.Clear();}
  }
  void MoodStopSources(bool resetBed){foreach(var s in new[]{moodAir,moodTone,moodBare})if(s!=null){s.Stop();s.volume=0;s.pitch=1;}if(resetBed&&ambience!=null)ambience.MoodGain=1;}
  /// <summary>Non-boss level (or duo/endless): every mood source stops, the bed is whole, and the mood PCM is freed.</summary>
  void MoodOff(){
   MoodStopSources(true);
   FreeMoodClip(ref moodAirClip);FreeMoodClip(ref moodToneClip);FreeMoodClip(ref moodBareClip);
   foreach(var kind in CarrotBossMoodSynth.OneShots){string name="Mood"+kind;if(clips.TryGetValue(name,out var c)){foreach(var v in voices)if(v.clip==c)StopVoice(v);clips.Remove(name);moodMade.Remove(c);Destroy(c);}}
   foreach(var c in moodMade)if(c!=null)Destroy(c);moodMade.Clear();
   moodOn=false;moodBuild=int.MinValue;moodLevel=-1;moodProfile="";moodBareBiome="";moodBareReady=moodDroneReady=false;
   Cue("mood:off",0);
  }

  // ---------------- the arc ----------------
  /// <summary>Privation 0 (the whole bed) .. 1 (wind only).</summary>
  float MoodPrivation(int stage){
   float fear=CarrotBossMoodCurve.Fear(game!=null?game.health:10);
   switch(stage){
    case 0:{if(moodBossWave<=1)return fear;
     // after the held breath (or a send-now) the garden stays silent through the guardian wave's first spawn
     if(moodHeld&&moodReleaseAt<0||moodBossWave>=2&&game.wave>=moodBossWave)return 1;
     float step=Mathf.Clamp01((Mathf.Max(game.wave,1)-1)/(float)Mathf.Max(1,moodBossWave-2));return Mathf.Clamp01(.667f*step+fear);}
    case 1:case 2:case 3:return 1;
    case 4:case 5:{ // release, and a challenge's post-guardian waves: the life comes back only where there is no aftershock
     if(moodChallenge&&CarrotBossMood.WavesLeft)return 1;return moodReleaseAt>=0&&soundClock-moodReleaseAt<MoodFirstCall?1:0;}
    case 6:return 0;
    case 7:return moodP; // lost: the bed stays as it was
    default:return moodP;
   }
  }
  void MoodWaveStart(int wave){
   if(wave<=0)return;moodLastWaveAt=soundClock;
  }
  void MoodArrival(){moodArrived=true;moodSendAt=Mathf.Min(moodSendAt,soundClock-2);Cue("mood:arrival",0);}
  void MoodBreath(string why){moodBreathAt=soundClock;Cue("mood:breath",why=="prism"?1:0);}
  float MoodBreathGain(){float t=soundClock-moodBreathAt;if(t<0||t>MoodBreathSeconds)return 1;return 1-(1-.708f)*Mathf.Sin(Mathf.PI*t/MoodBreathSeconds);}
  /// <summary>Asuna's prism breaks are casts: the breath follows the cast once it resolves.</summary>
  void MoodPrismBreak(){
   if(game.level==null||game.level.boss!="asuna")return;bool now=false;
   foreach(var x in game.enemies)if(x!=null&&x.alive&&!x.clone&&x.boss=="asuna"&&x.ability=="prismBreak"&&x.castRemaining>0){now=true;break;}
   if(moodPrismCasting&&!now)MoodBreath("prism");moodPrismCasting=now;
  }
  void MoodRelease(){moodReleaseAt=soundClock;moodFirstPlayed=moodBedBackLogged=moodResolvedLogged=false;Cue("mood:release",0);}
  bool MoodCasting(){
   if(game==null||game.enemies==null)return false;
   foreach(var x in game.enemies)if(x!=null&&x.alive&&x.castRemaining>0&&(!string.IsNullOrEmpty(x.boss)||!string.IsNullOrEmpty(x.miniboss)||CarrotData.IsMini(x.kind)))return true;
   return false;
  }

  void MoodDrone(float dt,float De,int stage,bool casting,float breath){
   float x=Mathf.Pow(De,.7f);
   float db=x<=.379f?-33+20*Mathf.Log10(Mathf.Max(x,1e-3f)/.379f):-33+5*(x-.379f)/.621f;
   float amp=Mathf.Pow(10,(db-CarrotBossMoodSynth.TargetRmsDb)/20);
   // From the arrival the guardian's theme carries the fight: 12 dB down over 3 s.
   bool arrived=stage==2||stage==3||moodArrived&&CarrotBossMood.BossAlive;
   moodArrivalFade=Mathf.MoveTowards(moodArrivalFade,arrived?.251f:1,dt*(.749f/3));
   bool under=casting||heartbeatUntil>soundClock;
   moodCastGain=Mathf.MoveTowards(moodCastGain,under?.5f:1,dt*(under?6.25f:.83f));
   int key=Carrot_MusicKey();float keyTarget=key<0?.5f:CarrotBossMoodSynth.KeyFits(key,CarrotBossMoodSynth.TonePitchClasses(moodProfile))?1:0;
   moodKeyGain=Mathf.MoveTowards(moodKeyGain,keyTarget,dt/1.5f);
   float level=amp*moodArrivalFade*moodCastGain*breath*moodCut*Mathf.Clamp01(DuckGain())*Mathf.Clamp01(muted?0:sfxPref);
   // Release: the drone falls a fourth while it fades 18 dB, then stops (+2.5 s). A defeat fades it over 3 s.
   if(moodReleaseAt>=0){float t=soundClock-moodReleaseAt;moodGlide=Mathf.Lerp(1,.749f,Mathf.SmoothStep(0,1,t/2));level*=Mathf.Lerp(1,.126f,Mathf.Clamp01(t/2));if(t>=MoodResolve){level=0;}}
   if(stage==7)level=0;
   // The inputs are ramped already; a short follower removes zipper steps (a defeat takes about 3 s to fall away).
   moodDroneGain+=(level-moodDroneGain)*(1-Mathf.Exp(-dt/(stage==7?1f:.15f)));
   moodAir.volume=Mathf.Clamp01(moodDroneGain*CarrotBossMoodSynth.LayerMix(moodProfile,"air"));
   moodTone.volume=Mathf.Clamp01(moodDroneGain*CarrotBossMoodSynth.LayerMix(moodProfile,"tone")*moodKeyGain);
   moodAir.pitch=moodTone.pitch=moodGlide;
   if(moodReleaseAt>=0&&soundClock-moodReleaseAt>=MoodResolve&&moodDroneGain<=.0005f){moodAir.Stop();moodTone.Stop();moodDroneStopped=true;}
  }

  /// <summary>Distant crows before Old Hollowhead: at most one call per wave interval, only in the foreboding stage, never within
  /// 4 s of a wave call, never within 1.5 s of a windup, never near a wave's end; one in the ready phase.</summary>
  void MoodOneShots(int stage){
   if(!CarrotBossMoodSynth.Crows(moodProfile)||stage!=0||moodRng==null)return;
   bool ready=game.phase=="ready";int slot=ready?0:game.wave;
   if(slot!=moodCrowWave){moodCrowWave=slot;moodCrowAt=moodRng.NextDouble()<(ready?1:.65)?soundClock+(ready?6:5)+(float)moodRng.NextDouble()*(ready?6:9):-1;}
   if(moodCrowAt<0||soundClock<moodCrowAt)return;
   bool clear=soundClock-moodLastCast>=1.5f&&!MoodCasting()&&soundClock-moodLastWaveAt>=4&&(ready||(game.phase=="playing"&&game.nextWave<=0&&EnemiesAlive()>=3));
   if(!clear){moodCrowAt=soundClock+.5f;return;}
   string kind=moodRng.NextDouble()<.4?"crowA":moodRng.NextDouble()<.5?"crowB":"crowC";
   float pan=(float)(moodRng.NextDouble()*2-1)*.5f;
   eventPosition=new Vector3(ListenerX+pan/PanScale,0,0);Play("Mood"+kind,.05f,.97f+.06f*(float)moodRng.NextDouble(),"mood-crow",8,false,PRoutine);eventPosition=null;
   Cue("mood:crow",slot);moodCrowAt=-1;
  }
  void MoodMilestones(){
   if(moodReleaseAt<0)return;float t=soundClock-moodReleaseAt;
   string call=CarrotBossMoodSynth.ReleaseCall(moodProfile);
   float at=call=="cascade"?.6f:MoodFirstCall;
   bool natural=!(moodChallenge&&CarrotBossMood.WavesLeft);
   if(!moodFirstPlayed&&t>=at){moodFirstPlayed=true;if(call!=null&&natural){Play("Mood"+call,call=="cascade"?.07f:call=="drips"?.06f:.075f,1,"mood-first",2,false,PKill);Cue("mood:first",t);}}
   if(!moodResolvedLogged&&t>=MoodResolve){moodResolvedLogged=true;if(moodDroneReady)Cue("mood:resolved",t);}
   if(!moodBedBackLogged&&t>=MoodBedBack&&moodP<=.02f){moodBedBackLogged=true;Cue("mood:bed",t);}
  }
 }
}
