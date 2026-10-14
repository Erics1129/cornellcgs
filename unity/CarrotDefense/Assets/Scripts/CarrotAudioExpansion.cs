using System.Collections.Generic;
using UnityEngine;

namespace CarrotTD {
 public sealed partial class CarrotAudio {
  static readonly HashSet<string> expansionVoices=new HashSet<string>{"mite","beetle","slug","wisp","bat","scarab","firefly","sporeling","tinyZombie","riftling","shardling","mimic","warDrummer","frostHerald","witherPriest","stormWarden","graveCaller","mirrorKnight","riftStalker","mossGolem","emberBoar","venomQueen","ironSnail","lanternLeech","chronoMoth","thornBeast","portalSentinel","portal"};
  static readonly HashSet<string> smallVoices=new HashSet<string>{"mite","beetle","slug","wisp","bat","scarab","firefly","sporeling","tinyZombie","riftling","shardling","mimic"};
  void PrepareExpansionAudio(){
   foreach(var kind in expansionVoices)foreach(var action in new[]{"Call","Hit","Attack"})LoadVoice("EVoice"+kind+action);
   clips["PortalArrival"]=Stinger("The observatory fractures",new[]{65.406f,98f,138.59f,196f},2.4f,1);
   clips["RiftFold"]=Stinger("Rift folds",new[]{369.99f,277.18f,185f,92.5f},.65f,1);
   clips["RiftUnfold"]=Stinger("Rift unfolds",new[]{92.5f,185f,277.18f,369.99f},.65f,2);
   clips["MoonChime"]=Stinger("Lunar filament",new[]{587.33f,880f,1174.66f},.6f,2);
   clips["LotusDrop"]=Stinger("Water pearl",new[]{659.25f,987.77f},.42f,1);
   clips["ClockChime"]=Stinger("Brass escapement",new[]{440f,554.37f},.32f,0);
  }
  // The same boss never switches score just because it changes phase or reincarnates.
  // Loudness-matched scores: gains bring each file's measured RMS (Tools/analyze_carrot_music.mjs, Ogg rows) to about
  // -17 dBFS before the music level, so a playlist crossfade never jumps in level. Portal's dense orchestra is cut most.
  public static float TrackGain(string track){switch(track){case "MusicAsuna":return .62f;case "MusicEyeball":return .70f;case "MusicOrchard":return .84f;case "MusicZombie":return .85f;case "MusicPortal":return .38f;case "MusicTornado":return .64f;case "MusicGarden":return .65f;case "MusicMarsh":return .79f;case "MusicFrost":return 1f;case "MusicExplore":return 1f;default:return 1;}}
  static string BossTheme(string kind){switch(kind){case "garden":return "Garden";case "marsh":return "Marsh";case "frost":return "Frost";case "orchard":return "Orchard";case "tornado":return "Tornado";case "zombie":return "Zombie";case "eyeball":return "Eyeball";case "portal":return "Portal";case "asuna":return "Asuna";default:return "Garden";}}
  bool ExpansionCreature(string kind,string action,Vector3 at){
   if(!expansionVoices.Contains(kind))return false;
   bool small=smallVoices.Contains(kind),major=action=="roar"||action=="growl";
   if(!major&&lastSound.TryGetValue("creature-global",out var last)&&soundClock-last<.16f)return true;
   string suffix=action=="spawn"||action=="roar"?"Call":action=="attack"||action=="growl"?"Attack":"Hit";
   float volume=major?.19f:action=="attack"?.09f:action=="spawn"?(small?.038f:.085f):small?.045f:.067f;
   float pitch=bank!=null?Mathf.Lerp(1,bank.Pitch(),.4f):1;
   Play(K("EVoice",kind,suffix),volume,pitch,K("creature-",kind,action),major?1.25f:action=="spawn"?1.6f:.32f,true,major?PBoss:small?PRoutine:PKill,at);
   lastSound["creature-global"]=soundClock;return true;
  }
  bool ExpansionSound(CarrotEvent e,float variant){
   if(PrismSound(e,variant))return true;
   if(e.type=="miniEnter"){
    Unlock();Creature(e.kind,"roar",e.position);PlayBank("Wood",.07f,.78f,PElite,"minientry",.8f,e.position);Play("IncomingGround",.08f,.9f,"minientrydrum",.8f,false,PElite,e.position);Cue("miniEnter:"+e.kind,0);return true;
   }
   // Recipient visual events are deliberately silent: one cast produces one sound, not N overlapping sounds.
   if(e.type=="abilityTarget")return true;
   if(e.type=="telegraph"){
    switch(e.kind){
     case "portalBlink":case "portalShift":case "portalStorm":case "portalSummon":case "sentinelRift":
      Play("RiftFold",.13f,e.kind=="portalStorm"?1.3f:1,"riftwindup",.65f,priority:PThreat);return true;
     case "blackout":case "eyeClones":case "reincarnate":
      Play("LanternSnuff",.17f,.75f,"eyewindup",.6f,priority:PThreat);LaterBank(.17f,"Glass",.07f,.6f,PThreat,"eyeglass",.6f);if(e.kind!="reincarnate")BossLayer("eyeball",.1f,e.position);return true;
     case "fieldFreeze":case "glacierLance":
      PlayBank("Glass",.15f,.65f,PThreat,"deepicewindup",.6f,e.position);LaterBank(.14f,"Snow",.08f,.65f,PThreat,"snowwindup",.6f);return true;
    }return false;
   }
   if(e.type!="ability")return false;
   string clip=null,layer=null,bankName=null,layerBank=null;float volume=.12f,pitch=1,gap=.28f;bool major=false;
   switch(e.kind){
    case "bambooPierce":bankName="Slice";layerBank="Grass";pitch=1.45f;volume=.065f;break;
    case "chiliBurn":case "chiliExpose":case "chiliTrail":bankName="Wood";clip=null;layer="Chop";pitch=.68f;volume=.07f;break;
    case "lotusCleanse":clip="LotusDrop";layerBank="Snow";volume=.10f;break;
    case "magnetStrip":case "magnetShred":bankName="Metal";layerBank="Slice";pitch=1.3f;volume=.065f;break;
    case "orchidPoison":bankName="Grass";layerBank="Snow";pitch=.67f;volume=.05f;break;
    case "dreamSleep":case "dreamBurst":clip="BookOpen";layer="LotusDrop";pitch=1.23f;volume=.07f;break;
    case "cactusBleed":bankName="Slice";pitch=1.7f;volume=.055f;break;
    case "clockAura":case "clockSlow":clip="ClockChime";pitch=1.15f;volume=.06f;gap=.6f;break;
    case "dragonMeteor":case "meteor":bankName="Slice";pitch=.65f;volume=.055f;break;
    case "moonBeam":case "lunarBeam":clip="MoonChime";layerBank="Glass";pitch=1.1f;volume=.065f;break;
    case "rally":case "graveMarch":bankName="Wood";layer="RootSnap";pitch=.7f;major=true;break;
    case "fieldFreeze":case "glacierLance":bankName="Glass";layerBank="Snow";pitch=.68f;major=true;break;
    case "wither":case "venomMist":clip="LanternSnuff";layerBank="Grass";pitch=.8f;break;
    case "stormLock":case "portalStorm":bankName="Slice";layerBank="Metal";pitch=.66f;major=true;break;
    case "graveCall":case "brambleSurge":case "thornBind":clip="RootSnap";layer="Chop";pitch=.9f;break;
    case "mirrorSplit":case "eyeClones":bankName="Glass";layer="MoonChime";pitch=1.16f;break;
    case "riftBlink":case "portalBlink":case "portalShift":clip="RiftFold";layer="RiftUnfold";major=true;break;
    case "mossShield":case "ironShell":bankName="Plate";layer="Build";pitch=.73f;break;
    case "emberCharge":clip="Chop";layerBank="Wood";pitch=.74f;break;
    case "coinLeech":bankName="Coin";layer="TitheJingle";pitch=.8f;break;
    case "chronoField":clip="ClockChime";layer="Page";pitch=.66f;break;
    case "sentinelRift":case "portalSummon":clip="RiftUnfold";layerBank="Metal";major=true;break;
    case "lanternFlood":clip="LanternSnuff";layer="LotusDrop";pitch=.72f;major=true;break;
    case "harvestMoon":clip="RootSnap";layer="MoonChime";pitch=.7f;major=true;break;
    case "cycloneCall":bankName="Slice";layerBank="Snow";pitch=.55f;major=true;break;
    case "blackout":clip="LanternSnuff";layer="RiftFold";pitch=.7f;major=true;DuckMusic(-6,.08f,Mathf.Min(4,e.duration),.6f);break;
    case "dissolve":bankName="Snow";pitch=1.5f;volume=.035f;gap=.5f;break;
    case "reincarnate":clip="RiftUnfold";layerBank="Glass";pitch=.73f;major=true;break;
   }
   if(clip==null&&bankName==null)return false;
   int priority=major?PBoss:PSignature;
   if(bankName!=null)PlayBank(bankName,major?.18f:volume,pitch,priority,K("expansion-",e.kind),gap,e.position);else Play(clip,major?.18f:volume,pitch,K("expansion-",e.kind),gap,false,priority,e.position);
   float lv=major?.085f:volume*.48f,lp=Mathf.Clamp(pitch*1.1f,.6f,1.7f);
   if(layer!=null)Later(.07f,layer,lv,lp,K("expansion-layer-",e.kind),gap,major?PBoss:PRoutine);
   else if(layerBank!=null)LaterBank(.07f,layerBank,lv,lp,major?PBoss:PRoutine,K("expansion-layer-",e.kind),gap);
   if(major)Play("SubThump",.1f,.9f,"expansion-sub",.4f,false,PBoss,e.position);
   return true;
  }
 }
}
