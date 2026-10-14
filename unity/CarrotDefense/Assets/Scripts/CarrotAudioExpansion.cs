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
  // RMS-matched new scores: Portal's dense orchestra is deliberately attenuated most.
  static float TrackGain(string track){switch(track){case "MusicAsuna":return .5f;case "MusicEyeball":return .76f;case "MusicOrchard":return .93f;case "MusicZombie":return .98f;case "MusicPortal":return .43f;case "MusicTornado":return .73f;default:return 1;}}
  static string BossTheme(string kind){switch(kind){case "garden":return "Garden";case "marsh":return "Marsh";case "frost":return "Frost";case "orchard":return "Orchard";case "tornado":return "Tornado";case "zombie":return "Zombie";case "eyeball":return "Eyeball";case "portal":return "Portal";case "asuna":return "Asuna";default:return "Garden";}}
  bool ExpansionCreature(string kind,string action,Vector3 at){
   if(!expansionVoices.Contains(kind))return false;
   bool small=smallVoices.Contains(kind),major=action=="roar"||action=="growl";
   if(!major&&lastSound.TryGetValue("creature-global",out var last)&&soundClock-last<.16f)return true;
   string suffix=action=="spawn"||action=="roar"?"Call":action=="attack"||action=="growl"?"Attack":"Hit";
   float volume=major?.19f:action=="attack"?.09f:action=="spawn"?(small?.038f:.085f):small?.045f:.067f;
   Play("EVoice"+kind+suffix,volume,1+Mathf.Sin(soundClock*13+kind.Length)*.025f,"creature-"+kind+action,major?1.25f:action=="spawn"?1.6f:.32f,true,major?4:small?0:1,at);
   lastSound["creature-global"]=soundClock;return true;
  }
  bool ExpansionSound(CarrotEvent e,float variant){
   if(PrismSound(e,variant))return true;
   if(e.type=="miniEnter"){
    Unlock();Creature(e.kind,"roar",e.position);Play("ImpactWood",.07f,.78f,"minientry",.8f,priority:2);return true;
   }
   if(e.type=="shot")return ExpansionShot(e,variant);
   if(e.type=="impact")return ExpansionImpact(e);
   // Recipient visual events are deliberately silent: one cast produces one sound, not N overlapping sounds.
   if(e.type=="abilityTarget")return true;
   if(e.type=="telegraph"){
    switch(e.kind){
     case "portalBlink":case "portalShift":case "portalStorm":case "portalSummon":case "sentinelRift":
      Play("RiftFold",.13f,e.kind=="portalStorm"?1.3f:1,"riftwindup",.65f,priority:3);return true;
     case "blackout":case "eyeClones":case "reincarnate":
      Play("LanternSnuff",.17f,.75f,"eyewindup",.6f,priority:3);Later(.17f,"ImpactGlass",.07f,.6f,"eyeglass",.6f);return true;
     case "fieldFreeze":case "glacierLance":
      Play("ImpactGlass",.15f,.65f,"deepicewindup",.6f,priority:3);Later(.14f,"FootstepSnow",.08f,.65f,"snowwindup",.6f);return true;
    }return false;
   }
   if(e.type!="ability")return false;
   string clip=null,layer=null;float volume=.12f,pitch=1,gap=.28f;bool major=false;
   switch(e.kind){
    case "bambooPierce":clip="Slice";layer="FootstepGrass";pitch=1.45f;volume=.065f;break;
    case "chiliBurn":case "chiliExpose":case "chiliTrail":clip="ImpactWood";layer="Chop";pitch=.68f;volume=.07f;break;
    case "lotusCleanse":clip="LotusDrop";layer="FootstepSnow";volume=.10f;break;
    case "magnetStrip":case "magnetShred":clip="ImpactMetal";layer="Slice";pitch=1.3f;volume=.065f;break;
    case "orchidPoison":clip="FootstepGrass";layer="FootstepSnow";pitch=.67f;volume=.05f;break;
    case "dreamSleep":case "dreamBurst":clip="BookOpen";layer="LotusDrop";pitch=1.23f;volume=.07f;break;
    case "cactusBleed":clip="Slice";pitch=1.7f;volume=.055f;break;
    case "clockAura":case "clockSlow":clip="ClockChime";pitch=1.15f;volume=.06f;gap=.6f;break;
    case "dragonMeteor":case "meteor":clip="Slice";pitch=.65f;volume=.055f;break;
    case "moonBeam":case "lunarBeam":clip="MoonChime";layer="ImpactGlass";pitch=1.1f;volume=.065f;break;
    case "rally":case "graveMarch":clip="ImpactWood";layer="RootSnap";pitch=.7f;major=true;break;
    case "fieldFreeze":case "glacierLance":clip="ImpactGlass";layer="FootstepSnow";pitch=.68f;major=true;break;
    case "wither":case "venomMist":clip="LanternSnuff";layer="FootstepGrass";pitch=.8f;break;
    case "stormLock":case "portalStorm":clip="Slice";layer="ImpactMetal";pitch=.66f;major=true;break;
    case "graveCall":case "brambleSurge":case "thornBind":clip="RootSnap";layer="Chop";pitch=.9f;break;
    case "mirrorSplit":case "eyeClones":clip="ImpactGlass";layer="MoonChime";pitch=1.16f;break;
    case "riftBlink":case "portalBlink":case "portalShift":clip="RiftFold";layer="RiftUnfold";major=true;break;
    case "mossShield":case "ironShell":clip="ImpactMetal";layer="Build";pitch=.73f;break;
    case "emberCharge":clip="Chop";layer="ImpactWood";pitch=.74f;break;
    case "coinLeech":clip="Coin";layer="TitheJingle";pitch=.8f;break;
    case "chronoField":clip="ClockChime";layer="Page";pitch=.66f;break;
    case "sentinelRift":case "portalSummon":clip="RiftUnfold";layer="ImpactMetal";major=true;break;
    case "lanternFlood":clip="LanternSnuff";layer="LotusDrop";pitch=.72f;major=true;break;
    case "harvestMoon":clip="RootSnap";layer="MoonChime";pitch=.7f;major=true;break;
    case "cycloneCall":clip="Slice";layer="FootstepSnow";pitch=.55f;major=true;break;
    case "blackout":clip="LanternSnuff";layer="RiftFold";pitch=.7f;major=true;Duck(Mathf.Min(4,e.duration));break;
    case "dissolve":clip="FootstepSnow";pitch=1.5f;volume=.035f;gap=.5f;break;
    case "reincarnate":clip="RiftUnfold";layer="ImpactGlass";pitch=.73f;major=true;break;
   }
   if(clip==null)return false;
   Play(clip,major?.18f:volume,pitch,"expansion-"+e.kind,gap,priority:major?3:1);
   if(layer!=null)Later(.07f,layer,major?.085f:volume*.48f,Mathf.Clamp(pitch*1.1f,.6f,1.7f),"expansion-layer-"+e.kind,gap,major?2:0);
   return true;
  }
  bool ExpansionShot(CarrotEvent e,float variant){
   string clip=null;float volume=.065f,pitch=1;switch(e.kind){
    case "bamboo":clip="Slice";pitch=1.45f;break;case "chili":clip="Chop";pitch=.66f;break;
    case "lotus":clip="LotusDrop";volume=.05f;break;case "magnet":clip="ImpactMetal";pitch=1.45f;break;
    case "orchid":clip="FootstepSnow";pitch=.71f;break;case "mushroom":clip="BookOpen";pitch=1.37f;volume=.05f;break;
    case "cactus":clip="FootstepGrass";pitch=1.7f;break;case "clockflower":clip="ClockChime";volume=.045f;break;
    case "dragonfruit":clip="ImpactWood";pitch=.65f;volume=.115f;break;case "moonflower":clip="MoonChime";volume=.055f;break;
   }if(clip==null)return false;
   Play(clip,volume*(e.tier>=5?1.12f:1),pitch*variant*(e.tier>=5?.92f:1),"shot-"+e.kind,.16f);return true;
  }
  bool ExpansionImpact(CarrotEvent e){
   string clip=null;float volume=.045f,pitch=1;switch(e.kind){
    case "bamboo":case "cactus":clip="Chop";pitch=1.3f;break;
    case "chili":clip="ImpactWood";pitch=.7f;volume=.065f;break;
    case "lotus":case "mushroom":clip="LotusDrop";pitch=.84f;break;
    case "magnet":clip="ImpactMetal";pitch=1.5f;break;
    case "orchid":clip="FootstepGrass";pitch=.65f;break;
    case "clockflower":clip="ClockChime";pitch=1.25f;break;
    case "dragonfruit":clip="ImpactMetal";pitch=.58f;volume=.11f;Later(.06f,"ImpactWood",.065f,.67f,"meteordebris",.25f);break;
    case "moonflower":clip="ImpactGlass";pitch=1.25f;break;
   }if(clip==null)return false;Play(clip,volume,pitch,"impact-"+e.kind,.17f);return true;
  }
 }
}
