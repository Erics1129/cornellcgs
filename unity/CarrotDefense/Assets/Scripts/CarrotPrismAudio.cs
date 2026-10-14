using UnityEngine;

namespace CarrotTD {
 public sealed partial class CarrotAudio {
  bool prismMusicTail;
  void PreparePrismAudio(){
   clips["AsunaArrival"]=Stinger("Prismatic overture",new[]{293.66f,440f,587.33f,880f},1.7f,2);
   clips["PrismWindup"]=Stinger("Spectral charge",new[]{440f,554.37f,659.25f},.8f,1);
   clips["PrismDash"]=Stinger("Rainbow refraction",new[]{293.66f,440f,659.25f,987.77f},.55f,3);
   clips["PrismLances"]=Stinger("Chromatic lances",new[]{880f,1174.66f,1318.51f},.48f,2);
   clips["PrismAegis"]=Stinger("Sevenfold shield",new[]{329.63f,493.88f,659.25f},1.05f,2);
   clips["PrismRain"]=Stinger("Spectrum rain",new[]{1174.66f,987.77f,783.99f,587.33f},.85f,3);
   clips["PrismMirror"]=Stinger("Mirror procession",new[]{392f,554.37f,783.99f},.72f,1);
   clips["PrismOverdrive"]=Stinger("Solar overdrive",new[]{146.83f,220f,440f,880f},1.35f,0);
  }
  bool FinishPrismScore(){
   if(desired!="MusicAsuna"&&playing!="MusicAsuna")return false;
   prismMusicTail=true;
   for(int i=0;i<slotTrack.Length;i++)if(slotTrack[i]=="MusicAsuna")Carrot_MusicTail(i);
   return true;
  }
  void TickPrismMusic(){
   if(!prismMusicTail||playing!="MusicAsuna")return;
   int slot=targetA?0:1;
   if(Carrot_MusicFinished(slot)==1){prismMusicTail=false;pool=new[]{"MusicExplore"};poolIndex=0;Transition("MusicExplore",1.6f);}
  }
  bool PrismSound(CarrotEvent e,float variant){
   // One cue at the caster. Recipient events remain silent even during dense reinforcements.
   if(e.type=="abilityTarget"){
    // The dash has one authoritative arrival; its landing accent follows the
    // actual travel duration instead of sounding at takeoff.
    if(e.kind=="prismDash"){LaterBank(e.duration,"GlassLight",.08f,1.4f,PBoss,"prism-land",.5f);Later(e.duration,"SubThump",.08f,1.2f,"prism-landsub",.5f,PBoss);}
    return false;
   }
   if(e.type=="ability"&&e.kind=="prismReinforce"){Play("MoonChime",.04f,.85f,"prism-reinforce",2,priority:PSignature);return true;}
   string clip=null;switch(e.kind){
    case "prismDash":clip="PrismDash";break;
    case "prismLances":clip="PrismLances";break;
    case "prismaticAegis":clip="PrismAegis";break;
    case "spectrumRain":clip="PrismRain";break;
    case "mirrorRush":clip="PrismMirror";break;
    case "prismOverdrive":clip="PrismOverdrive";break;
   }
   if(clip==null)return false;
   if(e.type=="telegraph"){
    Play("PrismWindup",.105f,e.kind=="prismOverdrive"?.72f:1,"prism-warning",.65f,priority:PThreat);
    LaterBank(.16f,"GlassLight",.045f,1.35f,PThreat,"prism-charge-glass",.65f);return true;
   }
   if(e.type!="ability")return false;
   Play(clip,.16f,1,K("prism-",e.kind),.35f,priority:PBoss);
   if(e.kind=="prismDash")PlayBank("Slice",.11f,.72f,PBoss,"prism-air",.5f,e.position);
   if(e.kind=="prismLances"||e.kind=="spectrumRain"){LaterBank(.08f,"Metal",.055f,1.2f,PBoss,"prism-strike",.5f);Later(.08f,"SubThump",.07f,1.3f,"prism-strikesub",.5f,PBoss);}
   if(e.kind=="prismaticAegis")LaterBank(.1f,"Bell",.06f,1.5f,PBoss,"prism-aegisbell",1);
   if(e.kind=="prismOverdrive"){Later(.16f,"RiftUnfold",.075f,1.4f,"prism-overdrive",1,PBoss);Play("SubThump",.14f,.8f,"prism-overdrivesub",1,priority:PBoss);DuckMusic(-6,.1f,1.2f,.8f);}
   return true;
  }
 }
}
