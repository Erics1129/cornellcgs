using UnityEngine;

namespace CarrotTD {
 // Music direction: each biome has a playlist (its own track alternating with a calm partner), so a 6-10 minute level never
 // loops one short track more than twice in a row; intensity (a high shelf and a level trim on the music bus) rises with
 // the wave count; bosses restart their own theme from the top with the arrival stinger and alternate with a related
 // battle track; challenges play their guardian's theme from the first wave; the lobby and menus keep MusicExplore.
 public sealed partial class CarrotAudio {
  string[] pool={"MusicExplore"};int poolIndex,trackLoops;string levelBiome="",levelBoss="";bool bossActive,lowpassOn;float intensitySent=-1;
  public const float PlaylistCrossfade=2.5f,LongTrackSeconds=150;
  /// <summary>Tracks per biome before any boss arrives; arena challenges start on their guardian's theme.</summary>
  public static string[] LevelPool(string biome,string boss){
   switch(biome){
    case "garden":return new[]{"MusicGarden","MusicExplore"};
    case "marsh":return new[]{"MusicMarsh","MusicExplore"};
    case "frost":return new[]{"MusicFrost","MusicExplore"};
    case "orchard":return new[]{"MusicOrchard","MusicExplore"};
    // The Portal keeps its old score until the boss is out; its arrival then starts the owner's theme at the drop.
    case "arena":{if(boss=="portal")return new[]{"MusicPortal",BossPartner("MusicPortal")};string theme="Music"+BossTheme(string.IsNullOrEmpty(boss)?"tornado":boss);return new[]{theme,BossPartner(theme)};}
    case "prism":return new[]{"MusicExplore"};
    default:return new[]{"MusicExplore"};
   }
  }
  /// <summary>A related battle track that takes over after the boss theme has looped twice (moods matched by the
  /// analysis in music-provenance.json: tempo, brightness and key family).</summary>
  public static string BossPartner(string theme){
   switch(theme){
    case "MusicGarden":return "MusicTornado";case "MusicTornado":return "MusicGarden";
    case "MusicMarsh":return "MusicEyeball";case "MusicEyeball":return "MusicMarsh";
    case "MusicFrost":return "MusicPortal";case "MusicPortal":return "MusicFrost";
    case "MusicOrchard":return "MusicZombie";case "MusicZombie":return "MusicOrchard";
    // The owner-supplied boss themes alternate with the tracks those bosses used before.
    case "MusicBossOrchard":return "MusicOrchard";case "MusicBossTornado":return "MusicTornado";
    default:return null;
   }
  }
  /// <summary>Loops allowed before the playlist moves on: twice for short tracks, once for long ones.</summary>
  public static int MaxLoops(float seconds){return seconds>=LongTrackSeconds?1:2;}
  /// <summary>Seconds of playback after which the playlist starts its crossfade to the next entry.</summary>
  public static float SwitchAt(float seconds){return Mathf.Max(seconds*.5f,seconds*MaxLoops(seconds)-PlaylistCrossfade);}
  static string[] Compact(params string[] tracks){var list=new System.Collections.Generic.List<string>();foreach(var t in tracks)if(!string.IsNullOrEmpty(t)&&!list.Contains(t))list.Add(t);return list.ToArray();}

  void BeginLevelMusic(string biome){
   levelBiome=biome??"";levelBoss=game!=null&&game.level!=null?game.level.boss??"":"";bossActive=false;intensitySent=-1;
   if(levelBiome=="prism")EnsureMusic("MusicAsuna");
   pool=Compact(LevelPool(levelBiome,levelBoss));poolIndex=0;
   desired=pool[0];playing="";
   if(unlocked)Transition(desired,1.7f);else EnsureMusic(desired);
   SendIntensity(.3f);if(lowpassOn){lowpassOn=false;Carrot_BusLowpass(0);}
  }
  void BossMusic(string kind){
   string theme="Music"+BossTheme(kind);
   if(kind=="asuna"||levelBiome=="prism"){bossActive=true;pool=new[]{theme};poolIndex=0;Transition(theme,1.8f);return;}
   bool arena=levelBiome=="arena";bossActive=true;
   pool=Compact(theme,BossPartner(theme));poolIndex=0;
   // A campaign boss restarts its theme from the top (the arrival); a challenge guardian already owns the score.
   Transition(theme,1.8f,restart:!arena&&playing==theme);
   SendIntensity(1);
  }
  void EndLevelMusic(){bossActive=false;pool=new[]{"MusicExplore"};poolIndex=0;Transition("MusicExplore",3f);}
  void BossDefeatedMidLevel(){if(!bossActive||levelBiome=="prism")return;bossActive=false;pool=Compact(LevelPool(levelBiome,levelBoss));poolIndex=0;Transition(pool[0],3f);}
  string BossThemeOfLevel(){return string.IsNullOrEmpty(levelBoss)?null:"Music"+BossTheme(levelBoss);}
  /// <summary>Decoded buffers worth keeping after their slot fades out: the next playlist entry and, late in a boss level, the boss theme.</summary>
  bool Wanted(string track){
   if(pool!=null&&pool.Length>1&&pool[(poolIndex+1)%pool.Length]==track&&NearSwitch())return true;
   return track==BossThemeOfLevel()&&BossSoon();
  }
  // The Portal opens on wave 4 of 12, so its theme is decoded from the start: the drop must land on the arrival, not after a download.
  bool BossSoon(){return game!=null&&game.level!=null&&!string.IsNullOrEmpty(levelBoss)&&!bossActive&&(levelBoss=="portal"||game.wave>=game.level.waves-1)&&game.phase=="playing";}
  bool NearSwitch(){int slot=targetA?0:1;if(slotTrack[slot]!=playing||string.IsNullOrEmpty(playing))return false;float len=Carrot_MusicSeconds(playing);return len>1&&Carrot_MusicElapsed(slot)>=SwitchAt(len)-25;}

  void TickMusic(float dt,string phase){
   if(game!=null){
    bool blind=game.elapsed<game.blindUntil&&game.phase=="playing";
    if(blind!=lowpassOn){lowpassOn=blind;Carrot_BusLowpass(blind?1:0);Cue("lowpass",blind?1:0);}
   }
   SendIntensity(Intensity(phase));
   if(!unlocked||string.IsNullOrEmpty(playing)||prismMusicTail)return;
   if(BossSoon())EnsureMusic(BossThemeOfLevel());
   int slot=targetA?0:1;if(slotTrack[slot]!=playing||pool==null||pool.Length<2||blend<1)return;
   float len=Carrot_MusicSeconds(playing);if(len<=1)return;
   float elapsed=Carrot_MusicElapsed(slot),at=SwitchAt(len);
   trackLoops=Mathf.FloorToInt(elapsed/len);
   string next=pool[(poolIndex+1)%pool.Length];
   if(elapsed>=at-25)EnsureMusic(next);
   if(elapsed>=at&&musicReady.Contains(next)){poolIndex=(poolIndex+1)%pool.Length;Transition(next,PlaylistCrossfade);}
  }
  float Intensity(string phase){
   if(bossActive)return 1;
   if(game==null||game.level==null)return .5f;
   if(phase=="ready")return .3f;
   if(phase!="playing")return .55f;
   int waves=Mathf.Max(1,game.level.waves);float progress=waves>1?Mathf.Clamp01((game.wave-1)/(float)(waves-1)):1;
   int alive=EnemiesAlive();float value=.4f+.5f*progress+(alive>12?.1f:0)-(alive==0?.1f:0);
   return Mathf.Clamp01(value);
  }
  void SendIntensity(float value){if(Mathf.Abs(value-intensitySent)<.02f)return;intensitySent=value;Carrot_MusicIntensity(value);}
 }
}
