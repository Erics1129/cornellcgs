using UnityEngine;

namespace CarrotTD {
 public sealed partial class CarrotEffects {
  public static bool ExpansionTower(string kind){switch(kind){case "bamboo":case "chili":case "lotus":case "magnet":case "orchid":case "mushroom":case "cactus":case "clockflower":case "dragonfruit":case "moonflower":return true;default:return false;}}
  public static bool ExpansionMini(string kind){switch(kind){case "warDrummer":case "frostHerald":case "witherPriest":case "stormWarden":case "graveCaller":case "mirrorKnight":case "riftStalker":case "mossGolem":case "emberBoar":case "venomQueen":case "ironSnail":case "lanternLeech":case "chronoMoth":case "thornBeast":case "portalSentinel":return true;default:return false;}}
  public static bool ExpansionMob(string kind){switch(kind){case "mite":case "beetle":case "slug":case "wisp":case "bat":case "scarab":case "firefly":case "sporeling":case "tinyZombie":case "riftling":case "shardling":case "mimic":return true;default:return false;}}
  static bool ExpansionTone(string kind,out Color c){
   switch(kind){
    case "bamboo":case "bambooPierce":case "mossGolem":case "mossShield":c=new Color(.68f,.94f,.36f);return true;
    case "chili":case "chiliTrail":case "emberBoar":case "emberCharge":c=new Color(1,.24f,.06f);return true;
    case "lotus":case "lotusCleanse":case "lanternFlood":c=new Color(.35f,.95f,.91f);return true;
    case "magnet":case "magnetShred":case "stormWarden":case "stormLock":c=new Color(.35f,.65f,1);return true;
    case "orchid":case "orchidPoison":case "venomQueen":case "venomMist":case "witherPriest":case "wither":c=new Color(.73f,.38f,.94f);return true;
    case "mushroom":case "dreamSleep":case "dreamBurst":case "sporeling":c=new Color(.63f,.56f,1);return true;
    case "cactus":case "cactusBleed":case "thornBeast":case "thornBind":case "brambleSurge":c=new Color(.49f,.80f,.27f);return true;
    case "clockflower":case "clockAura":case "chronoMoth":case "chronoField":case "scarab":case "coinLeech":case "lanternLeech":c=new Color(1,.79f,.27f);return true;
    case "dragonfruit":case "meteor":case "warDrummer":case "rally":c=new Color(1,.37f,.39f);return true;
    case "moonflower":case "lunarBeam":case "mirrorKnight":case "mirrorSplit":case "harvestMoon":c=new Color(.63f,.77f,1);return true;
    case "glacier":case "frostHerald":case "fieldFreeze":case "glacierLance":case "shardling":c=new Color(.42f,.85f,1);return true;
    case "graveCaller":case "graveCall":case "graveMarch":case "tinyZombie":c=new Color(.52f,.78f,.31f);return true;
    case "ironSnail":case "ironShell":c=new Color(.72f,.77f,.85f);return true;
    case "cycloneCall":c=new Color(.67f,.83f,.91f);return true;
    case "eyeClones":case "reincarnate":case "blackout":c=new Color(1,.23f,.44f);return true;
    case "portal":case "riftStalker":case "riftBlink":case "sentinelRift":case "portalSentinel":case "portalBlink":case "portalShift":case "portalStorm":case "portalSummon":case "riftling":case "wisp":c=new Color(.47f,.57f,1);return true;
    case "firefly":c=new Color(.92f,1,.4f);return true;
    default:c=Color.white;return false;
   }
  }
  // The existing rings are also usable in vertical and tilted planes; no extra renderer pool.
  // One portal is a dark core decal plus counter-rotating ellipse and brief intake/outflow.
  int TakeRing(bool warning){
   int limit=warning?pool.rings.Length:Mathf.Max(1,pool.rings.Length-4);
   for(int i=0;i<limit;i++)if(!pool.rings[i].busy){pool.rings[i].busy=true;pool.rings[i].go.SetActive(true);return i;}
   if(warning&&!ticking){for(int i=0;i<live.Count;i++){var l=live[i];if(l.k!=K.Orbit&&(l.k!=K.Ring||l.i1==1))continue;int slot=l.slot;live.RemoveAt(i);return slot;}}
   return -1;
  }
  void Orbit(Vector3 p,float radius,float life,Color color,Vector3 euler,float rate=80,float squash=1,bool collapse=false){
   int index=TakeRing(false);if(index<0)return;var s=pool.rings[index];s.mf.sharedMesh=pool.ringThin;s.mr.sharedMaterial=pool.additiveSheet;s.t.position=p;s.t.localScale=Vector3.zero;
   Add(new Live{k=K.Orbit,slot=index,a=p,b=euler,life=Mathf.Max(.08f,life),color=Hot(color,1.5f),f0=radius,f1=rate,f2=squash,i0=collapse?1:0});
  }
  void TickOrbit(Live l,float t){var s=pool.rings[l.slot];float envelope=Mathf.Min(1,t*7)*Mathf.Min(1,(1-t)*5);float r=l.f0*(l.i0==1?Mathf.Lerp(1.15f,.08f,t*t):.92f+.08f*Mathf.Sin(t*Mathf.PI));s.t.localScale=new Vector3(r*envelope,r,r*l.f2*envelope);s.t.rotation=Quaternion.Euler(l.b)*Quaternion.Euler(0,l.age*l.f1,0);Color c=l.color;c.a*=envelope;s.block.SetColor("_Color",c);s.mr.SetPropertyBlock(s.block);}
  void Gate(Vector3 p,float size,float duration,bool depart,Color tone){
   Vector3 center=G(p,size*.75f);Orbit(center,size*.66f,duration,tone,new Vector3(90,0,18),depart?-170:150,1.3f,depart);
   Orbit(center,size*.75f,duration*.88f,new Color(.43f,.85f,1,.65f),new Vector3(78,24,-13),-110,1.25f,depart);
   DecalFx(p,FxSheet.Void,size*1.6f,duration,new Color(.14f,.08f,.3f,.8f),true,1,0,true,.45f);
   for(int i=0;i<N(12);i++){float a=i*Mathf.PI*2/N(12);Vector3 radial=new Vector3(Mathf.Cos(a),Mathf.Sin(a)*1.25f,0)*size*.7f;Vector3 velocity=depart?-radial*1.9f:radial*.9f;motes.Frame(FxSheet.StarGlyph);motes.Emit(center+(depart?radial:Vector3.zero),velocity,R(.08f,.16f),duration*.7f,tone,R(0,360),90);}
   LightFx(center,3.5f,2.8f,.35f,tone,.04f);
  }
  void ExpansionShell(string kind,Vector3 from,Vector3 to,float life,int tier){
   int index=FxPool.Take(pool.shells);if(index<0)return;var s=pool.shells[index];Color c=Tone(kind);bool spearKind=kind=="bamboo"||kind=="cactus"||kind=="glacier",meteor=kind=="dragonfruit";
   s.mf.sharedMesh=(kind=="bamboo"||kind=="glacier")?pool.spear:kind=="cactus"?pool.thorn:kind=="lotus"?pool.petal:kind=="moonflower"?pool.crescent:meteor?pool.iron:pool.pod;s.mr.sharedMaterial=pool.botanicalShell;
   s.block.Clear();s.block.SetColor("_Color",meteor?new Color(.20f,.08f,.09f):Color.Lerp(c,Color.white,.16f));s.block.SetColor("_EmissionColor",c*(meteor?.8f:spearKind?.14f:.42f));s.mr.SetPropertyBlock(s.block);
   float size=(spearKind?.62f:meteor?.45f:.32f)*(tier>=5?1.28f:1+.05f*(tier-1));s.t.localScale=Vector3.one*size;s.t.position=from;
   s.trail.widthMultiplier=(spearKind?.055f:meteor?.3f:.14f)*(tier>=5?1.45f:1);s.trail.startColor=new Color(c.r,c.g,c.b,.85f);s.trail.endColor=new Color(c.r,c.g,c.b,0);for(int i=0;i<8;i++)s.trail.SetPosition(i,from);
   s.glow.localScale=Vector3.one*(meteor?1.9f:spearKind?.6f:1.3f);s.glowBlock.SetColor("_Color",Hot(new Color(c.r,c.g,c.b,spearKind?.32f:.65f),1.6f));s.glowRenderer.SetPropertyBlock(s.glowBlock);
   int mode=meteor?7:kind=="chili"?6:kind=="orchid"||kind=="mushroom"?8:kind=="lotus"?9:5;
   Add(new Live{k=K.Shell,slot=index,life=Mathf.Clamp(life,.08f,2.8f),a=from,b=to,f0=spearKind?0:meteor?.1f:.7f,f1=spearKind?90:180,f2=.03f,i0=mode,i1=spearKind?2:0,color=c});
  }
  void ExpansionTrail(ref Live l,Vector3 p,float dt){l.f3+=dt;if(l.f3<.08f)return;l.f3=0;Color c=l.color;
   if(l.i0==7||l.i0==6){Embers(p,N(2),l.i0==7?.22f:.12f,.35f,new Color(1,.44f,.15f),.3f,.1f);if(l.i0==7)Smoke(p,1,.28f,.42f,.55f,new Color(.30f,.20f,.22f,.45f),.2f,.2f);}
   else if(l.i0==8)Motes(p,1,.12f,.6f,new Color(c.r,c.g,c.b,.5f),.3f,Vector3.up*.12f,FxSheet.Pollen,.12f);
   else if(l.i0==9)Motes(p,1,.12f,.4f,new Color(.6f,.95f,1,.7f),.2f,Vector3.down*.2f,FxSheet.GlowSoft,.1f);
  }
  bool HandleExpansion(CarrotEvent e,Color c){
   if(e.type=="shot"&&ExpansionTower(e.kind)){ExpansionShot(e,c);return true;}
   if(e.type=="impact"&&ExpansionTower(e.kind)){ExpansionImpact(e,c);return true;}
   if(e.type=="ability"&&e.kind=="dissolve"){Motes(e.position+Vector3.up*.5f,N(8),.12f,.65f,new Color(.55f,.70f,.9f,.6f),.3f,Vector3.up*.4f,FxSheet.GlowSoft,.3f);return true;}
   if(e.type=="miniEnter"){MiniEntrance(e,c);return true;}
   if(e.type=="bossEnter"&&e.kind=="portal"){PortalEntrance("bossDust",e.position);PortalEntrance("bossRing",e.position);return true;}
   if(e.type=="cinematic"&&EntranceBoss=="portal"){PortalEntrance(e.kind,e.position);return true;}
   if(e.type=="telegraph"||e.type=="telegraphTarget")return ExpansionWarning(e,c,e.type=="telegraphTarget");
   if(e.type=="ability"||e.type=="abilityTarget")return ExpansionAbility(e,c,e.type=="abilityTarget");
   if(e.type=="death"&&(ExpansionMob(e.kind)||ExpansionMini(e.kind)||e.kind=="portal")){ExpansionDeath(e,c);return true;}
   if(e.type=="spawn"&&ExpansionMob(e.kind)){Motes(e.position+Vector3.up*.2f,N(4),.12f,.7f,c,.45f,Vector3.up*.2f);Dust(G(e.position,.05f),N(3),.22f,.5f,new Color(Soil.r,Soil.g,Soil.b,.3f),.4f);return true;}
   return false;
  }
  void ExpansionShot(CarrotEvent e,Color c){Vector3 a=e.position,b=e.to;int tier=Mathf.Clamp(e.tier,1,5);float life=Mathf.Clamp(e.duration,.08f,1.8f);
   switch(e.kind){
    case "bamboo":Flash(a,.35f,.09f,new Color(.92f,1,.64f),FxSheet.Star4);Debris(a,N(3),FxSheet.Leaf,.08f,.13f,.6f,1.3f,.4f,c,180);ExpansionShell(e.kind,a,b,life,tier);break;
    case "magnet":Orbit(a,.24f,.24f,c,new Vector3(82,0,0),220);BoltFx(a,b,.07f,.2f,c,.08f,1,false,.04f,1.8f);break;
    case "clockflower":Glyph(a,FxSheet.Clock,.52f,.35f,c,Vector3.up*.08f,160);BoltFx(a,b,.045f,.2f,c,0,0,true,0,1.4f);break;
    case "moonflower":Orbit(a,.32f,.32f,c,new Vector3(72,0,20),-80);BoltFx(a,b,.16f,.23f,new Color(.45f,.65f,1,.5f),0,0,true,0,1.6f);BoltFx(a,b,.035f,.23f,Color.white,0,0,true,0,2);break;
    case "dragonfruit":Flash(a,.65f,.15f,c,FxSheet.Star6);Embers(a,N(6),.16f,.4f,c,1.2f,.25f);ExpansionShell(e.kind,b+new Vector3(-1.4f,4.2f,-.8f),b,life,tier);DecalFx(b,FxSheet.Crater,.9f,life,new Color(1,.40f,.25f,.7f),false,1,0,true,.6f);break;
    case "lotus":{float reach=CarrotData.Tower(e.kind).range[tier-1];RingFx(a,.15f,reach,.65f,new Color(.5f,.94f,1,.6f),1,1.5f);Orbit(a,.42f,.4f,c,new Vector3(20,0,0),100);Debris(a,N(7),FxSheet.Petal,.08f,.14f,.8f,1.5f,.7f,new Color(.85f,1,1));break;}
    case "chili":Embers(a,N(5),.14f,.35f,new Color(1,.5f,.12f),.9f,.15f);ExpansionShell(e.kind,a,b,life,tier);break;
    case "orchid":case "mushroom":Motes(a,N(5),.16f,.55f,new Color(c.r,c.g,c.b,.65f),.3f,Vector3.up*.22f,FxSheet.Pollen,.2f);ExpansionShell(e.kind,a,b,life,tier);break;
    default:ExpansionShell(e.kind,a,b,life,tier);break;
   }
  }
  void ExpansionImpact(CarrotEvent e,Color c){Vector3 p=e.to;Vector3 body=p+Vector3.up*.3f;float power=e.tier>=5?1.3f:1;
   switch(e.kind){
    case "bamboo":Sparks(body,N(8),1.4f,3.1f,.32f,new Color(.9f,1,.55f));Debris(body,N(5),FxSheet.Husk,.09f,.15f,1,2,.65f,c);Flash(body,.65f*power,.1f,Color.white,FxSheet.Star4);break;
    case "chili":Embers(body,N(10),.18f,.65f,new Color(1,.42f,.08f),1.2f,.4f);Flash(body,.7f,.12f,new Color(1,.8f,.32f),FxSheet.GlowHard);Smoke(body,N(3),.3f,.6f,.9f,new Color(.37f,.19f,.18f,.45f),.3f);Disc(p,.18f,.75f*power,.3f,new Color(1,.3f,.1f,.65f));break;
    case "lotus":for(int i=0;i<2;i++)RingFx(p,.12f,.8f+i*.2f,.5f+i*.12f,new Color(.45f,.92f,1,.75f),0,1.5f,false,.08f+i*.08f);Motes(body,N(10),.14f,.8f,c,.8f,Vector3.up*.6f);break;
    case "magnet":Orbit(body,.46f,.45f,c,new Vector3(90,35,0),250);Debris(body,N(6),FxSheet.Shard,.07f,.12f,.7f,1.5f,.5f,new Color(.55f,.65f,.8f));Sparks(body,N(6),1.5f,2.5f,.25f,c);break;
    case "orchid":Smoke(body,N(3),.35f,.6f,1,new Color(.5f,.23f,.62f,.3f),.1f);Motes(body,N(8),.15f,.9f,new Color(.7f,.9f,.3f,.8f),.35f,Vector3.up*.2f,FxSheet.Pollen,.2f);break;
    case "mushroom":Orbit(body,.32f,.7f,c,new Vector3(25,0,30),-75);Glyph(body,FxSheet.StarGlyph,.38f,.8f,c,Vector3.up*.25f,-70);Motes(body,N(7),.12f,1,c,.3f,Vector3.up*.15f,FxSheet.Pollen,.2f);break;
    case "cactus":Sparks(body,N(5),1.3f,2.2f,.22f,new Color(.9f,1,.6f));Debris(body,N(5),FxSheet.Leaf,.07f,.13f,1,2.2f,.6f,c);Flash(body,.55f,.08f,c,FxSheet.Star4);break;
    case "clockflower":Glyph(body,FxSheet.Clock,.42f,.65f,c,Vector3.up*.2f,-160);Orbit(body,.42f,.55f,c,new Vector3(90,0,0),-220);break;
    case "dragonfruit":MeteorImpact(p,power);break;
    case "moonflower":Flash(body,.68f,.12f,new Color(.88f,.94f,1),FxSheet.Star6);Debris(body,N(5),FxSheet.Shard,.08f,.15f,1.2f,2.5f,.6f,new Color(.66f,.8f,1));Orbit(body,.45f,.32f,c,new Vector3(90,0,0),-180);break;
   }
  }
  void MeteorImpact(Vector3 p,float power){Vector3 q=p+Vector3.up*.25f;Flash(q,1.45f*power,.13f,new Color(1,.87f,.65f),FxSheet.Star6);Embers(q,N(13),.28f,.65f,new Color(1,.36f,.18f),1.4f,.35f);Debris(q,N(9),FxSheet.Shard,.11f,.23f,1.7f,3.6f,.9f,new Color(.85f,.22f,.32f));Dust(G(p,.08f),N(10),.55f,1,new Color(.44f,.30f,.3f,.5f),.8f);RingFx(p,.18f,1.4f*power,.5f,new Color(1,.5f,.3f,.85f),2,1.6f);DecalFx(p,FxSheet.Scorch,1.6f*power,2.8f,new Color(.21f,.08f,.12f,.65f),true);LightFx(q,5f,3f,.2f,new Color(1,.43f,.3f));CameraImpulse?.Invoke(p,.10f,2);}
  static bool ExpansionCast(string kind){switch(kind){
   case "rally":case "fieldFreeze":case "wither":case "stormLock":case "graveCall":case "mirrorSplit":case "riftBlink":case "mossShield":case "emberCharge":case "venomMist":case "ironShell":case "coinLeech":case "chronoField":case "thornBind":case "sentinelRift":
   case "brambleSurge":case "lanternFlood":case "glacierLance":case "harvestMoon":case "cycloneCall":case "graveMarch":case "eyeClones":case "reincarnate":case "blackout":case "portalBlink":case "portalShift":case "portalStorm":case "portalSummon":
   case "bambooPierce":case "chiliTrail":case "lotusCleanse":case "magnetShred":case "orchidPoison":case "dreamSleep":case "dreamBurst":case "cactusBleed":case "clockAura":case "meteor":case "lunarBeam":return true;default:return false;}}
  bool ExpansionWarning(CarrotEvent e,Color c,bool targetOnly){
   if(!ExpansionCast(e.kind))return false;if(e.kind=="meteor"){TargetWarning(e.position,new Color(1,.48f,.28f),Mathf.Max(.3f,e.duration),"meteor");return true;}float duration=Mathf.Max(.3f,e.duration);Vector3 p=targetOnly?e.to:e.position;bool targeted=e.target!=0||(e.to-e.position).sqrMagnitude>.04f;
   // Targets keep a stable outline until resolution. Warnings never flicker or shake the camera.
   if(targetOnly){TargetWarning(p,c,duration,e.kind);return true;}
   Orbit(p+Vector3.up*.75f,.66f,duration,new Color(c.r,c.g,c.b,.55f),new Vector3(65,0,18),-65);
   Glyph(p+Vector3.up*1.85f,ExpansionGlyph(e.kind),.52f,duration,new Color(c.r,c.g,c.b,.95f),Vector3.up*.06f);
   if(e.kind=="blackout"||e.kind=="reincarnate"){Orbit(p+Vector3.up*1.2f,1f,duration,c,new Vector3(90,0,0),-130);Loop(duration,.15f,Op.ExpansionRift,p+Vector3.up*1.1f,Vector3.zero,c,1,0);return true;}
   if(e.kind=="fieldFreeze"||e.kind=="wither"||e.kind=="harvestMoon"){RingFx(p,.65f,4.2f,duration,new Color(c.r,c.g,c.b,.55f),0,.4f,true);for(int i=0;i<6;i++){float a=i*Mathf.PI/3;Glyph(p+new Vector3(Mathf.Cos(a)*1.4f,.12f,Mathf.Sin(a)*1.4f),ExpansionGlyph(e.kind),.32f,duration,c,Vector3.zero);}return true;}
   if(targeted){TargetWarning(e.to,c,duration,e.kind);if(e.kind=="glacierLance"||e.kind=="emberCharge"||e.kind=="brambleSurge"){Vector3 d=e.to-e.position;for(int i=1;i<5;i++)Glyph(G(e.position+d*i/5f,.11f),FxSheet.Chevron,.34f,duration,new Color(c.r,c.g,c.b,.7f),Vector3.zero);}}
   return true;
  }
  int ExpansionGlyph(string kind){switch(kind){case "fieldFreeze":case "glacierLance":return FxSheet.Flake;case "chronoField":case "clockAura":case "reincarnate":return FxSheet.Clock;case "coinLeech":return FxSheet.Coin;case "thornBind":case "brambleSurge":return FxSheet.Root;case "rally":return FxSheet.Note;case "portalBlink":case "portalShift":case "sentinelRift":case "portalSummon":return FxSheet.Star6;default:return FxSheet.Warning;}}
  void TargetWarning(Vector3 p,Color c,float life,string kind){RingFx(p,.58f,.58f,life,Hot(new Color(c.r,c.g,c.b,.8f),1.3f),0,.1f,true,.09f);DecalFx(p,kind=="fieldFreeze"||kind=="glacierLance"?FxSheet.FrostWeb:FxSheet.Pollen,1.1f,life,new Color(c.r,c.g,c.b,.5f),false,.6f,0,true,.4f);Glyph(p+Vector3.up*1.2f,ExpansionGlyph(kind),.32f,life,c,Vector3.down*.08f);}
  bool ExpansionAbility(CarrotEvent e,Color c,bool targetOnly){
   if(!ExpansionCast(e.kind))return false;Vector3 source=e.position,at=targetOnly?e.to:e.position;Vector3 end=e.to;float life=Mathf.Clamp(e.duration,.35f,6f);Vector3 body=at+Vector3.up*.55f;
   // Teleports are emitted per moved actor with authoritative old/new route positions.
   // The primary cast event only winds the source; it must not duplicate departure/arrival.
   if(e.kind=="riftBlink"||e.kind=="portalBlink"||e.kind=="portalShift"){
    if(targetOnly){float gateSize=e.kind=="portalBlink"?1.6f:.9f;Gate(source,gateSize,.5f,true,c);Gate(end,gateSize,.68f,false,c);BoltFx(source+Vector3.up*.08f,end+Vector3.up*.08f,.035f,.22f,new Color(c.r,c.g,c.b,.45f),.04f,0,true);}
    else{Orbit(source+Vector3.up*.9f,.9f,.65f,c,new Vector3(90,25,0),260,1,true);Flash(source+Vector3.up*.9f,1,.18f,c,FxSheet.Star6);}return true;
   }
   if(targetOnly&&e.kind=="reincarnate"){Gate(source,1.1f,.65f,true,c);Gate(end,1.1f,Mathf.Min(2.2f,life),false,c);return true;}
   switch(e.kind){
    case "bambooPierce":{Vector3 d=end-source;if(d.sqrMagnitude<.01f)break;BoltFx(source+Vector3.up*.4f,end+Vector3.up*.35f,.06f,.18f,new Color(.86f,1,.5f,.7f),0,0,true);Sparks(end+Vector3.up*.35f,N(6),1.6f,3.2f,.3f,c,d.normalized,.25f);break;}
    case "chiliTrail":{Vector3 d=end-source;int steps=Mathf.Clamp(Mathf.CeilToInt(d.magnitude/.7f),1,7);for(int i=0;i<steps;i++){Vector3 p=Vector3.Lerp(source,end,(i+.5f)/steps);DecalFx(p,FxSheet.Scorch,.72f,life,new Color(.29f,.08f,.05f,.72f),true);Loop(life,.24f,Op.ExpansionTrail,G(p,.08f),Vector3.zero,c,.5f,1);}break;}
    case "lotusCleanse":{float radius=targetOnly?.7f:2.1f;RingFx(at,.1f,radius,.7f,new Color(.55f,.95f,1,.85f),2,1.5f);Orbit(body,.55f,.8f,c,new Vector3(25,0,35),120);Debris(body,N(targetOnly?4:10),FxSheet.Petal,.09f,.16f,.45f,1.3f,1.1f,new Color(.86f,.98f,1));Motes(body,N(8),.13f,1,c,.4f,Vector3.up*.8f);break;}
    case "magnetShred":{body=end+Vector3.up*.55f;BoltFx(source+Vector3.up*.4f,body,.05f,.18f,c,.1f,1);Orbit(body,.52f,.55f,c,new Vector3(90,45,0),320);for(int i=0;i<3;i++)BoltFx(body,body+Quaternion.Euler(0,i*120,0)*new Vector3(.6f,.1f,0),.035f,.18f,c,.09f);Debris(body,N(6),FxSheet.Shard,.06f,.12f,1.5f,2.4f,.6f,new Color(.56f,.66f,.77f));break;}
    case "orchidPoison":case "venomMist":case "wither":{float radius=e.kind=="wither"?(targetOnly?.7f:2.5f):e.kind=="venomMist"?1.5f:.85f;DecalFx(at,FxSheet.Pollen,radius*2,life,new Color(.4f,.18f,.52f,.48f),true,.8f,radius,false,.35f);Loop(life,.35f,Op.ExpansionTrail,body,Vector3.zero,c,radius,2);if(!targetOnly)RingFx(at,.2f,radius*1.25f,.8f,new Color(c.r,c.g,c.b,.65f));break;}
    case "dreamSleep":Orbit(body,.45f,life,c,new Vector3(15,0,20),-50);Glyph(body+Vector3.up*.4f,FxSheet.StarGlyph,.3f,Mathf.Min(life,1.8f),c,Vector3.up*.18f,-40);Loop(life,.6f,Op.ExpansionTrail,body,Vector3.zero,c,.35f,3);break;
    case "dreamBurst":Flash(body,.95f,.15f,new Color(.91f,.82f,1),FxSheet.Star6);Motes(body,N(14),.14f,.8f,c,1.2f,Vector3.up*.25f,FxSheet.StarGlyph,.1f);RingFx(at,.1f,1.1f,.4f,c,1);break;
    case "cactusBleed":Debris(body,N(4),FxSheet.Leaf,.06f,.11f,.5f,1,.6f,new Color(.45f,.73f,.2f));Glyph(body,FxSheet.Root,.24f,.55f,c,Vector3.up*.3f);break;
    case "clockAura":case "chronoField":{float radius=targetOnly?.7f:1.8f;Orbit(at+Vector3.up*.10f,radius,Mathf.Min(life,2),new Color(c.r,c.g,c.b,.45f),Vector3.zero,e.kind=="chronoField"?-45:45);for(int i=0;i<4;i++){float a=i*Mathf.PI*.5f;Glyph(at+new Vector3(Mathf.Cos(a)*radius,.16f,Mathf.Sin(a)*radius),FxSheet.Clock,.24f,Mathf.Min(life,1.2f),c,Vector3.up*.08f,e.kind=="chronoField"?-90:90);}break;}
    case "meteor":{Vector3 p=end==Vector3.zero?source:end;DecalFx(p,FxSheet.Crater,Mathf.Max(1,e.value)*2,1.5f,new Color(.33f,.12f,.16f,.65f),true);break;}
    case "lunarBeam":{Vector3 a=source+Vector3.up*.85f,b=end+Vector3.up*.4f;BoltFx(a,b,.26f,.35f,new Color(.54f,.7f,1,.55f),0,0,true,0,1.7f);BoltFx(a,b,.055f,.35f,new Color(.95f,.97f,1),0,0,true,0,2.3f);Orbit(b,.5f,.5f,c,new Vector3(90,0,0),-150);break;}
    case "rally":{RingFx(at,.2f,targetOnly?1:3,.75f,new Color(1,.48f,.3f,.75f),2,1.7f);Glyph(body+Vector3.up*.5f,FxSheet.Note,.4f,.9f,c,Vector3.up*.7f);if(!targetOnly)for(int i=0;i<3;i++)Delay(i*.22f,Op.ExpansionPulse,at,Vector3.zero,c,2f+i*.4f,0);break;}
    case "fieldFreeze":{RingFx(at,.1f,targetOnly?.9f:5,.8f,new Color(.65f,.88f,1,.8f),2,1.5f);Motes(body,N(targetOnly?5:24),.17f,1.2f,new Color(.75f,.93f,1,.8f),targetOnly?.4f:1.7f,Vector3.up*.25f,FxSheet.Flake,.4f);if(targetOnly)DecalFx(at,FxSheet.FrostWeb,1.3f,life,new Color(.8f,.94f,1,.75f),false,1,0,true,.3f);break;}
    case "stormLock":case "portalStorm":{Vector3 p=targetOnly?end:(end!=Vector3.zero?end:source);BoltFx(p+Vector3.up*4,p+Vector3.up*.55f,.12f,.26f,new Color(.75f,.87f,1),.2f,1,false,0,2);Flash(p+Vector3.up*.6f,.85f,.12f,c,FxSheet.Star6);Orbit(p+Vector3.up*.6f,.6f,Mathf.Min(life,1.4f),c,new Vector3(25,0,0),180);Sparks(p+Vector3.up*.4f,N(8),1.2f,2.6f,.4f,c);if(!targetOnly)CameraImpulse?.Invoke(p,.09f,2);break;}
    case "graveCall":case "graveMarch":{if(targetOnly){GraveRise(end,c);break;}RingFx(source,.2f,e.kind=="graveMarch"?3:1.7f,.8f,c,1,1.5f);Debris(body,N(10),FxSheet.Bark,.1f,.18f,.9f,2f,.8f,new Color(.32f,.39f,.23f));Glyph(body+Vector3.up*.6f,FxSheet.Root,.55f,1,c,Vector3.up*.15f);break;}
    case "mirrorSplit":case "eyeClones":{if(targetOnly){Gate(end,.6f,.65f,false,c);break;}for(int i=0;i<3;i++)Orbit(body,.55f+i*.18f,.9f,c,new Vector3(70,i*60,0),i%2==0?140:-140);Debris(body,N(12),FxSheet.Shard,.09f,.18f,1.2f,2.8f,1,c,300);Flash(body,1.3f,.2f,new Color(.9f,.94f,1),FxSheet.Star6);break;}
    case "mossShield":case "ironShell":{float size=e.kind=="ironShell"?.65f:.8f;for(int i=0;i<2;i++)Orbit(body,size,life,new Color(c.r,c.g,c.b,.58f),new Vector3(70,i*90,20),i==0?60:-60);Debris(body,N(6),e.kind=="ironShell"?FxSheet.Shard:FxSheet.Leaf,.08f,.14f,.8f,1.4f,.8f,c);break;}
    case "emberCharge":{Vector3 d=end-source;if(d.sqrMagnitude<.01f)d=Vector3.forward;Sparks(body,N(18),1.8f,3.2f,.65f,new Color(1,.62f,.22f),d.normalized,.3f);Loop(Mathf.Min(life,1.4f),.12f,Op.ExpansionTrail,source,end,c,.45f,4);if(targetOnly){RingFx(end,.1f,1f,.4f,c,1);Dust(G(end,.1f),N(8),.4f,.8f,Soil,.8f);}break;}
    case "coinLeech":{Vector3 from=CarrotPosition+Vector3.up*.65f,to=source+Vector3.up*.8f;Vector3 d=to-from;float duration=Mathf.Clamp(d.magnitude/4,.3f,2);for(int i=0;i<N(6);i++)Glyph(from+Vector3.up*i*.04f,FxSheet.Coin,.2f,duration,new Color(1,.85f,.3f),d/duration,180);Orbit(to,.45f,.6f,c,new Vector3(90,0,0),180);break;}
    case "thornBind":case "brambleSurge":{Vector3 p=end==Vector3.zero?source:end;if(targetOnly||e.target!=0){TubeFx(G(source,.05f),G(p,.08f),e.kind=="brambleSurge"?.10f:.065f,life,.35f,false,.35f,.16f);for(int i=0;i<3;i++){float a=i*2.094f;Vector3 foot=p+new Vector3(Mathf.Cos(a)*.4f,.1f,Mathf.Sin(a)*.4f);TubeFx(G(foot,.02f),foot+Vector3.up*.7f,.055f,life,.25f,false,.13f,.03f);}DecalFx(p,FxSheet.Crack,1.4f,life,new Color(.27f,.2f,.11f,.7f),true);}else{Debris(body,N(18),FxSheet.Bark,.1f,.22f,1.5f,3f,1,Soil);RingFx(source,.1f,2.7f,.7f,c,2);}break;}
    case "sentinelRift":case "portalSummon":{if(targetOnly){Gate(end,.75f,.85f,false,c);break;}Orbit(body,.95f,.8f,c,new Vector3(85,0,25),-200);Motes(body,N(14),.14f,1,c,1,Vector3.up*.6f,FxSheet.StarGlyph,.2f);break;}
    case "lanternFlood":{float radius=targetOnly?1:3;RingFx(at,.2f,radius,1,new Color(.3f,.92f,.86f,.75f),2,1.1f);for(int i=0;i<2;i++)Delay(.25f+i*.18f,Op.ExpansionPulse,at,Vector3.zero,new Color(.6f,1,.9f,.5f),radius,1);Motes(body,N(targetOnly?6:18),.15f,1.5f,new Color(.55f,1,.79f,.7f),.5f,Vector3.up*.5f,FxSheet.GlowSoft,.8f);break;}
    case "glacierLance":{Vector3 p=end==Vector3.zero?source:end;if(targetOnly||e.target!=0){ExpansionShell("glacier",source+Vector3.up*.6f,p+Vector3.up*.4f,.16f,3);BoltFx(source+Vector3.up*.2f,p+Vector3.up*.2f,.14f,.35f,new Color(.6f,.86f,1,.8f),0,0,true);Debris(p+Vector3.up*.4f,N(12),FxSheet.Shard,.12f,.25f,1.4f,3f,1,new Color(.75f,.92f,1));DecalFx(p,FxSheet.FrostWeb,1.7f,life,new Color(.75f,.92f,1,.7f),false,1,0,true,.35f);}else RingFx(source,.3f,2.3f,.7f,c,1);break;}
    case "harvestMoon":{Orbit(source+Vector3.up*2.5f,1.1f,1.4f,new Color(1,.76f,.38f,.8f),new Vector3(90,0,0),-45);Debris(body,N(20),FxSheet.Leaf,.10f,.19f,1,2.2f,1.5f,new Color(1,.55f,.18f),300);RingFx(at,.2f,targetOnly?1:3.6f,1,new Color(1,.67f,.25f,.65f),1);break;}
    case "cycloneCall":{if(targetOnly){Gate(end,.7f,.7f,false,new Color(.7f,.85f,.94f));break;}for(int i=0;i<3;i++)Orbit(source+Vector3.up*(.2f+i*.5f),1.4f-i*.25f,1.2f,new Color(.7f,.84f,.95f,.65f),new Vector3(i*8,0,i*12),i%2==0?240:-190);Debris(body,N(18),FxSheet.Leaf,.1f,.2f,1.8f,3.4f,1.2f,Soil,500);break;}
    case "reincarnate":{bool boss=e.value>=2;float size=boss?1.6f:.6f;Gate(source,size,boss?1.5f:.7f,false,c);Flash(body,size*1.25f,.18f,new Color(1,.58f,.67f),FxSheet.Star6);for(int i=0;i<(boss?3:1);i++)Delay(i*.22f,Op.ExpansionPulse,source,Vector3.zero,c,size*.75f+i*.6f,0);Debris(body,N(boss?20:6),FxSheet.Shard,.08f,.18f,1.4f,3.1f,1.1f,new Color(.8f,.23f,.4f));if(boss)CameraImpulse?.Invoke(source,.25f,3);break;}
    case "blackout":Orbit(source+Vector3.up*1.1f,1.1f,.5f,c,new Vector3(90,0,0),-230,1,true);Motes(body,N(20),.16f,.5f,c,.25f,Vector3.down*.25f,FxSheet.GlowSoft,.7f);break;
   }
   return true;
  }
  void GraveRise(Vector3 p,Color c){DecalFx(p,FxSheet.Mud,1.1f,1.5f,new Color(.18f,.24f,.14f,.85f),true,1,0,true);Debris(G(p,.1f),N(7),FxSheet.Pebble,.08f,.15f,.8f,1.8f,.7f,Soil);Motes(p+Vector3.up*.15f,N(6),.14f,1,c,.35f,Vector3.up*.9f);Orbit(p+Vector3.up*.22f,.42f,.65f,c,new Vector3(20,0,0),100);}
  void MiniEntrance(CarrotEvent e,Color c){Vector3 p=e.position;RingFx(p,.1f,1.25f,.7f,new Color(c.r,c.g,c.b,.75f),0,1.5f);Glyph(p+Vector3.up*1.65f,ExpansionGlyph(MiniAbility(e.kind)),.38f,1.1f,c,Vector3.up*.2f);Debris(G(p,.1f),N(6),FxSheet.Pebble,.07f,.15f,.7f,1.5f,.7f,Soil);Motes(p+Vector3.up*.55f,N(8),.12f,.9f,c,.7f,Vector3.up*.3f);}
  static string MiniAbility(string kind){switch(kind){case "warDrummer":return "rally";case "frostHerald":return "fieldFreeze";case "chronoMoth":return "chronoField";case "lanternLeech":return "coinLeech";case "thornBeast":return "thornBind";case "portalSentinel":return "sentinelRift";default:return kind;}}
  void PortalEntrance(string beat,Vector3 p){Color c=Tone("portal");if(beat=="bossDust"){Gate(p,2.2f,2.3f,false,c);DecalFx(p,FxSheet.Void,3.4f,3,new Color(.1f,.1f,.2f,.8f),true);Loop(1.4f,.18f,Op.ExpansionRift,p+Vector3.up*1.2f,Vector3.zero,c,1.8f,1);}else if(beat=="bossRoar"){Orbit(p+Vector3.up*1.2f,1.6f,.8f,c,new Vector3(80,25,0),240);Flash(p+Vector3.up*1.2f,2.3f,.2f,new Color(.65f,.92f,1),FxSheet.Star6);CameraImpulse?.Invoke(p,.35f,3);HitStop?.Invoke(.04f,.55f,.4f);}else if(beat=="bossRing"){RingFx(p,.3f,3.8f,.8f,Hot(new Color(.42f,.83f,1,.8f),1.5f),2,1.5f);Debris(p+Vector3.up*.8f,N(18),FxSheet.Shard,.1f,.25f,1.5f,3.4f,1.2f,new Color(.45f,.72f,.86f));LightFx(p+Vector3.up*1.5f,7,5,.9f,c,.08f);}}
  void ExpansionDeath(CarrotEvent e,Color c){Vector3 p=e.position;bool portal=e.kind=="portal",mini=ExpansionMini(e.kind);int n=mini?16:8;int debrisCell=e.kind=="shardling"||e.kind=="mirrorKnight"||e.kind=="ironSnail"?FxSheet.Shard:e.kind=="tinyZombie"||e.kind=="graveCaller"||e.kind=="mossGolem"?FxSheet.Bark:e.kind=="sporeling"||e.kind=="slug"?FxSheet.Petal:FxSheet.Husk;
   if(portal){Gate(p,2,.9f,true,c);Delay(.5f,Op.ExpansionPulse,p,Vector3.zero,new Color(.55f,.88f,1,.8f),3.2f,2);Debris(p+Vector3.up*1.2f,N(28),FxSheet.Shard,.12f,.28f,1.2f,3f,1.4f,new Color(.32f,.52f,.65f));CameraImpulse?.Invoke(p,.35f,4);HitStop?.Invoke(.065f,1,0);return;}
   if(e.kind=="riftling"||e.kind=="riftStalker"||e.kind=="portalSentinel")Gate(p,mini?.95f:.55f,.5f,true,c);
   else if(e.kind=="wisp"||e.kind=="firefly")Motes(p+Vector3.up*.6f,N(n),.15f,1.1f,c,.8f,Vector3.up*.5f,FxSheet.StarGlyph,.2f);
   else{Debris(p+Vector3.up*.35f,N(n),debrisCell,.07f,mini?.18f:.12f,.9f,mini?2.8f:1.8f,.85f,c,300);Dust(G(p,.08f),N(4),.32f,.65f,new Color(Soil.r,Soil.g,Soil.b,.4f),.45f);}
   Flash(p+Vector3.up*.4f,mini?1:.5f,.11f,Color.Lerp(c,Color.white,.5f),FxSheet.Star4);if(mini)RingFx(p,.15f,1.5f,.6f,new Color(c.r,c.g,c.b,.6f));if(e.value>0)Glyph(p+Vector3.up*.6f,FxSheet.Coin,.26f,.8f,new Color(1,.85f,.35f),Vector3.up*.7f,160);
  }
  bool RunExpansion(Op op,Vector3 a,Vector3 b,Color c,float f,int i,float t){switch(op){
   case Op.ExpansionPulse:RingFx(a,.18f,Mathf.Max(.4f,f),.5f,c,i==2?2:0,1.5f);return true;
   case Op.ExpansionMeteor:MeteorImpact(a,Mathf.Max(.8f,f));return true;
   case Op.ExpansionRift:{float angle=R(0,Mathf.PI*2);Vector3 radial=new Vector3(Mathf.Cos(angle),Mathf.Sin(angle),.12f)*f;motes.Frame(FxSheet.StarGlyph);motes.Emit(a+radial,-radial*1.2f,.11f,.7f,c,R(0,360),120);return true;}
   case Op.ExpansionTrail:
    if(i==1)Embers(a,N(2),.17f,.5f,new Color(1,.42f,.1f),.55f,f);
    else if(i==2){Smoke(a+UnityEngine.Random.insideUnitSphere*f,1,.35f,.7f,1,new Color(c.r,c.g,c.b,.22f),.05f,.2f);Motes(a,N(2),.10f,.8f,new Color(.73f,.88f,.35f,.7f),.25f,Vector3.up*.18f,FxSheet.Pollen,f);}
    else if(i==3)Glyph(a+UnityEngine.Random.insideUnitSphere*.2f,FxSheet.StarGlyph,.14f,.8f,c,Vector3.up*.2f,-45);
    else if(i==4){Vector3 p=Vector3.Lerp(a,b,t);Embers(G(p,.15f),N(3),.18f,.6f,new Color(1,.5f,.13f),.5f,.3f);Dust(G(p,.07f),N(2),.3f,.6f,Soil,.35f);}
    return true;
   default:return false;
  }}
 }
}
