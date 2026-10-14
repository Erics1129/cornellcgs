using System;
using System.Collections.Generic;
using UnityEngine;
namespace CarrotTD {
 // Additive content and status rules. Existing tower/boss kits stay in CarrotGame.cs.
 public sealed partial class CarrotGame {
#if UNITY_EDITOR || DEVELOPMENT_BUILD || CARROT_QA
  // Review harness is compiled out of the production player, just like debugCoins.
  void DebugStage(){spawns.Clear();extraSpawns.Clear();pendingSummons=0;for(int i=0;i<wavePending.Length;i++)wavePending[i]=0;wave=level.waves;waveStarted[wave]=true;phase="playing";paused=false;nextWave=0;}
  void PrepareReviewView(){var view=GetComponent<CarrotView>();if(view!=null)view.PrepareReviewLevel();}
  void DebugEncounter(string kind){if(string.IsNullOrEmpty(CarrotData.BossName(kind)))return;LoadLevel(CarrotData.BossHome(kind));PrepareReviewView();DebugStage();Spawn("boss",0,wave,false,0);}
  void DebugMini(string kind,int route){if(!CarrotData.IsMini(kind))return;if(phase=="won"||phase=="lost")LoadLevel(level.id);PrepareReviewView();if(phase!="playing")DebugStage();totalWork+=4;Spawn(kind,route,wave,false,0);}
  void DebugGarden(int group,int tier){
   if(!CanManage())return;PrepareReviewView();foreach(var t in towers.ToArray())RemoveTower(t);projectiles.Clear();burns.Clear();clouds.Clear();controlWard.Clear();focusStates.Clear();auras.Clear();lastMerge=null;mergeArmed=0;selectionType="";selectionId=-1;
   tier=Mathf.Clamp(tier,1,5);int index=Mathf.Clamp(group,0,1)*10;
   for(int pad=0;pad<level.pads.Length&&index<(group==0?10:20);pad++){if(blockers.Exists(b=>b.pad==pad))continue;var d=CarrotData.Towers[index++];int spent=0;for(int i=0;i<Mathf.Min(tier,4);i++)spent+=d.cost[i];int partner=tier==5?spent:0;
    var t=new TowerState{id=nextId++,kind=d.id,pad=pad,tier=tier,spent=spent+partner,mergedSpent=partner,position=level.pads[pad],cooldown=.15f,lastShot=-20,builtAt=elapsed};towers.Add(t);Emit("build",t.kind,t.position,id:t.id,tier:tier,duration:.7f);
   }
  }
  void DebugBossDamage(float amount){if(float.IsNaN(amount)||float.IsInfinity(amount)||amount<=0)return;var e=enemies.Find(x=>x.alive&&!string.IsNullOrEmpty(x.boss));if(e!=null)Damage(e,Mathf.Min(amount,10000000),true,"review",0);}
  void DebugCast(int id,string kind){
   var e=enemies.Find(x=>x.id==id&&x.alive);if(e==null||e.biteRemaining>0)return;string allowed="";
   if(!string.IsNullOrEmpty(e.miniboss))allowed=CarrotData.Enemy(e.kind).trait;
   else switch(e.boss){
    case "garden":allowed="bark,root,uproot,brambleSurge";break;
    case "marsh":allowed="mist,summon,blind,tithe,lanternFlood";break;
    case "frost":allowed="mantle,breath,shatter,whiteout,glacierLance";break;
    case "orchard":allowed="rush,flock,heap,uproot,dusk,harvestMoon";break;
    case "tornado":allowed="gust,liftoff,cycloneCall";break;
    case "zombie":allowed="raise,uproot,graveMarch";break;
    case "eyeball":allowed="blind,gaze,eyeClones,blackout";break;
    case "portal":allowed="portalSummon,portalStorm,portalBlink,portalShift";break;
    case "asuna":allowed="prismDash,prismLances,prismaticAegis,spectrumRain,mirrorRush,prismOverdrive";break;
   }
   if(Array.IndexOf(allowed.Split(','),kind)<0||string.IsNullOrEmpty(kind))return;float hold=0;
   switch(kind){case "bark":hold=5;break;case "root":hold=3.5f;break;case "mist":hold=5;break;case "blind":hold=3;break;case "mantle":hold=7;break;case "breath":hold=4;break;case "whiteout":hold=2.5f;break;case "rush":hold=2.5f;break;case "heap":hold=2;break;case "dusk":hold=3;break;case "gust":hold=2.5f;break;case "liftoff":hold=4;break;case "gaze":hold=5;break;}
   var a=actors[e.id];CancelCast(e,a);BeginCast(e,a,kind,kind=="blackout"?2.2f:1.8f,hold);
  }
#endif
  class ExtraEnemy {
   public int casts,stolen,poisonStacks,poisonCap,owner,rebirths; public bool clone;
   public float next,lifeUntil,poisonUntil,poisonDps,poisonTick,bleedUntil,bleedDps,bleedTick,shredUntil,shred,exposedUntil,exposed,sleepUntil,sleepReady,wakeDamage,regenAt,formUntil,grantedShield,grantUntil,shieldMaxBefore;
  }
  class SporeCloud {public int source,tier;public Vector3 position;public float until,tick,damage,radius;public readonly HashSet<int> touched=new HashSet<int>();}
  readonly List<SporeCloud> clouds=new List<SporeCloud>();
  class ExtraSpawn {public string kind;public int route,wave,owner;public float distance,scale,at,life;public bool clone;}
  readonly Dictionary<int,ExtraEnemy> extras=new Dictionary<int,ExtraEnemy>();
  readonly List<ExtraSpawn> extraSpawns=new List<ExtraSpawn>();
  readonly Dictionary<int,float> controlWard=new Dictionary<int,float>();
  float blackoutReady,freezeReady;
  ExtraEnemy Extra(EnemyState e){if(!extras.TryGetValue(e.id,out var x)){x=new ExtraEnemy{next=elapsed+6,regenAt=elapsed+3};extras[e.id]=x;}return x;}
  void ExpireGrantedShield(EnemyState e){var x=Extra(e);if(x.grantUntil<=0||elapsed<x.grantUntil)return;e.shield=Mathf.Max(0,e.shield-x.grantedShield);e.maxShield=Mathf.Max(x.shieldMaxBefore,e.shield);x.grantedShield=0;x.grantUntil=0;}
  void GrantShield(EnemyState e,float amount,float duration){if(muting)return;
   ExpireGrantedShield(e);var x=Extra(e);float increase=Mathf.Max(0,amount-e.shield);if(increase<=0&&x.grantedShield<=0)return;
   if(x.grantUntil<=0)x.shieldMaxBefore=e.maxShield;x.grantedShield+=increase;e.shield+=increase;e.maxShield=Mathf.Max(e.maxShield,e.shield);x.grantUntil=Mathf.Max(x.grantUntil,elapsed+duration);
  }
  void ConsumeGrantedShield(EnemyState e,float amount){var x=Extra(e);x.grantedShield=Mathf.Max(0,x.grantedShield-amount);}
  void ClearGrantedShield(EnemyState e){var x=Extra(e);if(x.grantUntil>0)e.maxShield=x.shieldMaxBefore;x.grantedShield=0;x.grantUntil=0;}
  void ExpireNativeShield(EnemyState e,Actor a){if(a.shieldUntil<=0||elapsed<a.shieldUntil)return;e.shield=Mathf.Min(e.shield,Extra(e).grantedShield);a.shieldUntil=0;}
  void ResetExpansion(){extras.Clear();extraSpawns.Clear();clouds.Clear();controlWard.Clear();blackoutReady=0;freezeReady=0;ResetPrism();}
  void InitExpansion(EnemyState e,bool clone,int owner){
   var def=CarrotData.Enemy(e.kind);e.miniboss=def!=null&&def.mini&&!clone?e.kind:"";e.clone=clone;
   var x=Extra(e);x.clone=clone;x.owner=owner;
   x.next=elapsed+(!string.IsNullOrEmpty(e.boss)?(e.boss=="portal"?5:24):def!=null&&def.mini?5:7);
   if(clone)x.lifeUntil=elapsed+18;
   if(!string.IsNullOrEmpty(e.miniboss)){SetNotice(def.name,2);Emit("miniEnter",e.kind,e.position,id:e.id,value:e.hp,duration:1);}
  }
  void QueueExtra(string kind,EnemyState source,int count,float hpScale=1,bool clone=false,float life=35){
   if(muting)return;
   // Every promised summon reserves completion work immediately; source death cannot orphan a reservation.
   int alive=0;foreach(var e in enemies)if(e.alive&&e.summoned)alive++;int available=Mathf.Max(0,22-alive-extraSpawns.Count);
   for(int i=0;i<Mathf.Min(count,available);i++){
    extraSpawns.Add(new ExtraSpawn{kind=kind,route=source.route,wave=wave>0?wave:1,owner=source.id,distance=Mathf.Min(source.distance+i*.25f,Mathf.Max(0,source.routeLength-6)),scale=hpScale,clone=clone,life=life,at=elapsed+.16f+i*.12f});pendingSummons++;
   }
  }
  void TickExpansion(){
   TickPrism();
   for(int i=clouds.Count-1;i>=0;i--){var c=clouds[i];if(elapsed>=c.until){clouds.RemoveAt(i);continue;}if(elapsed<c.tick)continue;c.tick=elapsed+.4f;
    foreach(var e in enemies)if(Eligible(e,true)&&FlatDistance(c.position,e.position)<=c.radius&&c.touched.Add(e.id)){var x=Extra(e);x.poisonCap=Mathf.Max(x.poisonCap,c.tier==5?6:4);x.poisonStacks=Mathf.Min(x.poisonCap,x.poisonStacks+1);x.poisonDps=Mathf.Max(x.poisonDps,c.damage*.16f*x.poisonStacks);x.poisonUntil=Mathf.Max(x.poisonUntil,elapsed+2.5f);Emit("ability","orchidPoison",e.position,e.position,c.source,e.id,c.tier,0,.6f);}
   }
   for(int i=extraSpawns.Count-1;i>=0;i--){var s=extraSpawns[i];if(s.at>elapsed)continue;extraSpawns.RemoveAt(i);pendingSummons=Mathf.Max(0,pendingSummons-1);
    var e=Spawn(s.kind,s.route,s.wave,true,s.distance,s.clone,s.owner);e.hp*=s.scale;e.maxHp=e.hp;e.shield*=s.scale;e.maxShield=e.shield;Extra(e).lifeUntil=elapsed+s.life;
   }
  }
  bool ExpansionDeath(EnemyState e,bool killed){
   var x=Extra(e);
   if(killed&&e.boss=="eyeball"&&e.stage<3){
    CancelCast(e,actors[e.id]);Vector3 fallen=e.position;e.distance=Mathf.Max(0,e.distance-2.4f);e.position=CarrotData.RoutePoint(level.routes[e.route],e.distance,out e.direction);Emit("abilityTarget","reincarnate",fallen,e.position,e.id,e.id,duration:2.2f);e.stage++;x.rebirths++;e.maxHp=CarrotData.BossBaseHp("eyeball")*(e.stage==2?.42f:.22f);e.hp=e.maxHp;e.shield=0;e.hidden=true;x.formUntil=elapsed+2.2f;x.next=elapsed+5;
    ClearGrantedShield(e);actors[e.id].phase=1;actors[e.id].baseSpeed=.22f*CarrotData.MovementScale;e.speed=0;e.phase=1;e.ability="reincarnate";e.castRemaining=2.2f;actors[e.id].stunUntil=elapsed+2.2f;
    Emit("telegraph","reincarnate",e.position,id:e.id,value:e.stage,duration:2.2f);return true;
   }
   if(killed&&e.kind=="tinyZombie"&&!e.summoned&&x.rebirths==0){x.rebirths=1;e.hp=e.maxHp*.35f;actors[e.id].stunUntil=elapsed+.7f;Emit("ability","reincarnate",e.position,id:e.id,value:1,duration:.7f);return true;}
   if(killed&&e.kind=="warDrummer"&&!e.clone){Rally(e,3.4f,1.35f,3.2f);Emit("ability","rally",e.position,id:e.id,value:3.4f,duration:3.2f);}
   if(killed&&x.stolen>0){coins+=x.stolen;TotalEarned+=x.stolen;Emit("coins","coinLeech",e.position,id:e.id,value:x.stolen);x.stolen=0;}
   if(killed&&e.kind=="shardling"&&!e.summoned)QueueExtra("mite",e,2,.6f,false,18);
   if(killed&&e.kind=="sporeling"){foreach(var t in towers)if(FlatDistance(t.position,e.position)<1.8f)Weaken(t,.82f,2);Emit("ability","venomMist",e.position,id:e.id,value:1.8f,duration:2);}
   return false;
  }
  bool TickEnemyExpansion(EnemyState e,Actor a,float dt){
   var x=Extra(e);ExpireGrantedShield(e);
   if(x.lifeUntil>0&&elapsed>=x.lifeUntil){ResolveEnemy(e,false);Emit("ability","dissolve",e.position,id:e.id,duration:.6f);return false;}
   if(x.formUntil>0){e.castRemaining=Mathf.Max(0,x.formUntil-elapsed);if(elapsed<x.formUntil)return false;x.formUntil=0;e.hidden=false;e.ability="";Emit("ability","reincarnate",e.position,id:e.id,value:e.stage,duration:.8f);}
   if(x.poisonUntil>elapsed){x.poisonTick+=dt;if(x.poisonTick>=.5f){Damage(e,x.poisonDps*x.poisonTick,true,"orchidPoison",0);x.poisonTick=0;}}else{x.poisonStacks=0;x.poisonCap=0;x.poisonDps=0;x.poisonTick=0;}
   if(!e.alive||elapsed<x.formUntil)return false;
   if(x.bleedUntil>elapsed){x.bleedTick+=dt;if(x.bleedTick>=.5f){Damage(e,x.bleedDps*x.bleedTick,false,"cactusBleed",0);x.bleedTick=0;}}else x.bleedTick=0;
   if(!e.alive||elapsed<x.formUntil)return false;
   if(x.sleepUntil>0&&elapsed>=x.sleepUntil){x.sleepUntil=0;float burst=x.wakeDamage;x.wakeDamage=0;Damage(e,burst,true,"dreamBurst",0);Emit("ability","dreamBurst",e.position,id:e.id,value:burst,duration:.5f);if(!e.alive)return false;}
   if(e.kind=="slug"&&elapsed>=x.regenAt){float hp=Mathf.Min(e.maxHp-e.hp,e.maxHp*.025f);e.hp+=hp;x.regenAt=elapsed+3;if(hp>0)Emit("heal",e.kind,e.position,id:e.id,value:hp,duration:.5f);}
   if(e.kind=="firefly"&&elapsed>=x.regenAt){x.regenAt=elapsed+5;foreach(var ally in enemies)if(ally.alive&&ally.id!=e.id&&FlatDistance(ally.position,e.position)<1.4f){float hp=Mathf.Min(ally.maxHp-ally.hp,ally.maxHp*.04f);ally.hp+=hp;if(hp>0)Emit("heal",e.kind,ally.position,id:e.id,target:ally.id,value:hp,duration:.45f);}}
   if(e.kind=="mimic"&&elapsed>=x.next&&x.casts<1){x.casts++;x.next=elapsed+100;e.rushUntil=elapsed+2.2f;a.rushMult=1.75f;Emit("ability","emberCharge",e.position,id:e.id,duration:2.2f);}
   if(e.kind=="riftling"&&elapsed>=x.next&&x.casts<2){x.casts++;x.next=elapsed+10;Blink(e,.7f,"riftBlink");}
   if(e.kind=="wisp"&&elapsed>=x.next){x.next=elapsed+8;ApplySlow(e,.15f,.9f);float nativeMax=x.grantUntil>0?x.shieldMaxBefore:e.maxShield;e.shield=Mathf.Max(e.shield,x.grantedShield+nativeMax*.5f);Emit("ability","mossShield",e.position,id:e.id,duration:.9f);}
   if(!string.IsNullOrEmpty(e.miniboss)){
    e.abilityRemaining=Mathf.Max(0,a.activeUntil-elapsed);if(a.cast==""&&e.abilityRemaining<=0)e.ability="";
    e.phase=e.hp/e.maxHp<.45f?2:1;
    if(a.cast!=""){e.castRemaining=Mathf.Max(0,a.castEnd-elapsed);if(elapsed>=a.castEnd)CommitAbility(e,a);}
    else if(elapsed>=x.next&&x.casts<4){string ability=CarrotData.Enemy(e.kind).trait;if(ability=="fieldFreeze"&&elapsed<freezeReady){x.next=freezeReady;return true;}BeginCast(e,a,ability,ability=="fieldFreeze"?1.8f:1.25f,0);}
   }
   return true;
  }
  void Rally(EnemyState e,float radius,float factor,float duration){if(muting)return;foreach(var ally in enemies)if(ally.alive&&ally.id!=e.id&&FlatDistance(e.position,ally.position)<=radius){ally.rushUntil=Mathf.Max(ally.rushUntil,elapsed+duration);actors[ally.id].rushMult=factor;}}
  bool Ward(TowerState t){return controlWard.TryGetValue(t.id,out float until)&&until>elapsed;}
  void Weaken(TowerState t,float factor,float duration){if(Ward(t)||muting)return;t.weakenFactor=t.weakenUntil>elapsed?Mathf.Min(t.weakenFactor,factor):factor;t.weakenUntil=Mathf.Max(t.weakenUntil,elapsed+duration);}
  void LockTower(TowerState t,float seconds){if(!Ward(t)&&!muting)t.stunnedFor=Mathf.Max(t.stunnedFor,seconds);}
  bool ScheduleExpansionBoss(EnemyState e,Actor a){
   var x=Extra(e);if(elapsed<x.next)return false;bool far=e.routeLength-e.distance>8;
   string kind="";float windup=1.6f;
   switch(e.boss){
    case "garden":if(x.casts<3)kind="brambleSurge";break;
    case "marsh":if(x.casts<3)kind="lanternFlood";break;
    case "frost":if(x.casts<3)kind="glacierLance";break;
    case "orchard":if(x.casts<3)kind="harvestMoon";break;
    case "tornado":if(x.casts<4&&far&&ActiveMiniSummons(e.id)<2)kind="cycloneCall";break;
    case "zombie":if(x.casts<4&&far)kind="graveMarch";break;
    case "eyeball":if(x.casts<7){kind=(e.stage>=2&&x.casts%2==1&&elapsed>=blackoutReady)?"blackout":"eyeClones";windup=kind=="blackout"?2.2f:1.6f;}break;
    case "portal":if(x.casts<16){string[] kit={"portalSummon","portalStorm","portalBlink","portalShift"};kind=kit[x.casts%4];windup=kind=="portalShift"?2.1f:1.7f;if(!far&&(kind=="portalBlink"||kind=="portalShift"))kind="portalStorm";}break;
   }
   if(kind==""){x.next=elapsed+4;return false;}BeginCast(e,a,kind,windup,0);return true;
  }
  int ActiveMiniSummons(int owner){int n=0;foreach(var e in enemies)if(e.alive&&e.summoned&&!string.IsNullOrEmpty(e.miniboss)&&Extra(e).owner==owner)n++;foreach(var s in extraSpawns)if(s.owner==owner&&CarrotData.IsMini(s.kind))n++;return n;}
  void PrepareExpansionCast(EnemyState e,Actor a,string kind){
   if(kind=="stormLock"||kind=="thornBind"||kind=="glacierLance"||kind=="portalStorm"){
    candidates.Clear();foreach(var t in towers)if(FlatDistance(t.position,e.position)<=5.5f)candidates.Add(t);
    candidates.Sort((t,u)=>Nearer(e.position,t,u));
    int cap=kind=="portalStorm"?3:2;foreach(var t in candidates)if(a.targets.Count<cap)a.targets.Add(t.id);
   }
  }
  // True when the additive dispatcher owns this ability. A primary event is emitted by CommitAbility.
  bool CommitExpansion(EnemyState e,Actor a,string kind,out float duration,out float value,out Vector3 target,out int targetId){
   duration=0;value=0;target=e.position;targetId=0;var x=Extra(e);bool handled=true;
   switch(kind){
    case "rally":duration=3;Rally(e,3.2f,1.3f,duration);value=3.2f;break;
    case "fieldFreeze":duration=.8f;freezeReady=elapsed+5;foreach(var t in towers)LockTower(t,duration);break;
    case "wither":duration=3.2f;foreach(var t in towers)Weaken(t,.78f,duration);break;
    case "stormLock":case "thornBind":case "glacierLance":case "portalStorm":
     duration=kind=="portalStorm"?2.1f:kind=="glacierLance"?1.7f:1.35f;
     foreach(int id in a.targets){var t=towers.Find(p=>p.id==id);if(t==null)continue;if(kind=="thornBind"){if(!Ward(t)&&!muting)t.slowFor=Mathf.Max(t.slowFor,3.5f);}else LockTower(t,duration);
      if(targetId==0){targetId=t.id;target=t.position;}else Emit("abilityTarget",kind,e.position,t.position,e.id,t.id,duration:duration);}
     break;
    case "graveCall":QueueExtra("tinyZombie",e,3,.6f,false,26);duration=.7f;break;
    case "mirrorSplit":if(!e.clone)QueueExtra(e.kind,e,2,.23f,true,12);duration=.7f;break;
    case "riftBlink":Blink(e,1.2f,kind);duration=.6f;break;
    case "mossShield":duration=4;foreach(var ally in enemies)if(ally.alive&&FlatDistance(e.position,ally.position)<2.4f){float shield=Mathf.Min(ally.maxHp*.16f,130*CarrotData.HPScale(level.id));GrantShield(ally,shield,duration);}break;
    case "emberCharge":duration=2.2f;if(!muting){e.rushUntil=elapsed+duration;a.rushMult=1.85f;}foreach(var t in towers)if(!muting&&FlatDistance(t.position,e.position)<2.7f&&!Ward(t))t.slowFor=Mathf.Max(t.slowFor,2.2f);break;
    case "venomMist":duration=3.5f;foreach(var t in towers)if(FlatDistance(t.position,e.position)<3.1f)Weaken(t,.72f,duration);value=3.1f;break;
    case "ironShell":duration=3.2f;if(!muting)a.armorUntil=elapsed+duration;x.exposedUntil=elapsed+duration+3;x.exposed=.25f;break;
    case "coinLeech":value=muting?0:Mathf.Min(coins,Mathf.Min(60,Mathf.Max(15,Mathf.FloorToInt(coins*.1f))));coins-=(int)value;x.stolen+=(int)value;duration=.7f;break;
    case "chronoField":duration=3;foreach(var t in towers)if(!muting&&FlatDistance(t.position,e.position)<3&&!Ward(t))t.slowFor=Mathf.Max(t.slowFor,duration);value=3;break;
    case "sentinelRift":Blink(e,.9f,"riftBlink");GrantShield(e,e.maxHp*.12f,3);if(x.casts<2)QueueExtra("riftling",e,2,.55f,false,22);duration=1;break;
    case "brambleSurge":duration=3.5f;Rally(e,3.5f,1.22f,duration);QueueExtra("beetle",e,2,.8f,false,28);foreach(var t in towers)if(!muting&&FlatDistance(t.position,e.position)<3.2f&&!Ward(t))t.slowFor=Mathf.Max(t.slowFor,2);value=3.5f;break;
    case "lanternFlood":duration=3;foreach(var ally in enemies)if(ally.alive&&FlatDistance(e.position,ally.position)<3)GrantShield(ally,ally.maxHp*.12f,duration);QueueExtra("wisp",e,2,.75f,false,25);value=3;break;
    case "harvestMoon":duration=3;Rally(e,4,1.3f,duration);QueueExtra("mimic",e,2,.65f,false,27);value=4;break;
    case "cycloneCall":if(ActiveMiniSummons(e.id)<2){var pool=Array.FindAll(CarrotData.AddedEnemies,p=>p.mini&&p.id!="portalSentinel");QueueExtra(pool[NextInt(pool.Length)].id,e,1,.58f,false,32);}duration=.8f;break;
    case "graveMarch":QueueExtra("tinyZombie",e,4,.7f,false,28);Rally(e,3.5f,1.35f,3);duration=3;value=3.5f;break;
    case "eyeClones":if(x.casts<5)QueueExtra("eyeball",e,2,1,true,14);duration=.8f;break;
    case "blackout":duration=1.25f;StartBlind(duration,0,1,.65f);blindKind="blackout";blackoutReady=elapsed+18;value=duration;break;
    case "portalBlink":Blink(e,1.3f,kind);duration=.7f;break;
    case "portalShift":{
     int count=0;foreach(var ally in enemies)if(ally.alive&&ally.id!=e.id&&string.IsNullOrEmpty(ally.boss)&&FlatDistance(ally.position,e.position)<4&&count<4){Blink(ally,1.1f,"portalShift");count++;}duration=.75f;value=count;break;}
    case "portalSummon":if(ActiveMiniSummons(e.id)<2)QueueExtra("portalSentinel",e,Mathf.Min(2-ActiveMiniSummons(e.id),a.phase>=2?2:1),.65f,false,35);QueueExtra("riftling",e,2,.65f,false,26);duration=.9f;break;
    default:handled=false;break;
   }
   if(handled){x.casts++;x.next=elapsed+(!string.IsNullOrEmpty(e.boss)?e.boss=="portal"?7:e.boss=="eyeball"?12:20:kind=="fieldFreeze"?15:12);a.activeUntil=elapsed+duration;}
   return handled;
  }
  void Blink(EnemyState e,float amount,string kind){if(muting)return;Vector3 before=e.position;float limit=Mathf.Max(0,e.routeLength-6);if(e.distance>=limit)return;e.distance=Mathf.Min(limit,e.distance+amount);e.position=CarrotData.RoutePoint(level.routes[e.route],e.distance,out e.direction);Emit("abilityTarget",kind,before,e.position,e.id,e.id,duration:.45f,value:amount);}
  bool IsNewTower(string kind){return kind=="bamboo"||kind=="chili"||kind=="lotus"||kind=="magnet"||kind=="orchid"||kind=="mushroom"||kind=="cactus"||kind=="clockflower"||kind=="dragonfruit"||kind=="moonflower";}
  // Sanctuary has a wall-clock (game time) cooldown independent of being stunned: it can actually counter disables.
  void TickTowerExpansion(TowerState t){
   if(t.kind!="lotus"||elapsed<t.cleanseAt)return;bool needed=false;float reach=CarrotData.Tower(t.kind).range[t.tier-1]+(t.tier==5?1:.4f);
   foreach(var ally in towers)if(FlatDistance(t.position,ally.position)<=reach&&(ally.stunnedFor>0||ally.disabledFor>0||ally.slowFor>0||ally.weakenUntil>elapsed)){needed=true;break;}
   if(!needed)return;t.cleanseAt=elapsed+(t.tier==5?7:11);
   foreach(var ally in towers)if(FlatDistance(t.position,ally.position)<=reach){ally.stunnedFor=ally.disabledFor=ally.slowFor=0;ally.weakenUntil=0;if(t.tier==5)controlWard[ally.id]=elapsed+1.2f;}
   Emit("ability","lotusCleanse",t.position,t.position,t.id,tier:t.tier,value:reach,duration:1.2f);
  }
  bool FireExpansion(TowerState t,EnemyState target,float range,float damage){
   if(target==null||!IsNewTower(t.kind))return false;
   if(t.kind=="dragonfruit"||t.kind=="moonflower"&&t.tier==5){
    var hits=new List<EnemyState>();foreach(var e in enemies)if(Eligible(e,CarrotData.Tower(t.kind).air)&&FlatDistance(e.position,t.position)<=range)hits.Add(e);SortTargets(hits,target.id);
    int cap=t.kind=="dragonfruit"?(t.tier==5?4:2+(t.tier>=3?1:0)):2;
    for(int i=0;i<Mathf.Min(cap,hits.Count);i++)Launch(t,hits[i].id,hits[i].position,damage*(t.kind=="moonflower"&&i>0?.78f:1),false);return true;
   }
   Launch(t,target.id,target.position,damage,false);return true;
  }
  void StripShield(EnemyState e,float amount){float before=e.shield;e.shield=Mathf.Max(0,e.shield-amount);ConsumeGrantedShield(e,before-e.shield);if(before>0&&e.shield<=0){Emit("ability","shieldBreak",e.position,id:e.id,duration:.45f);if(e.kind=="crystal"){actors[e.id].baseSpeed=1.2f*CarrotData.MovementScale;actors[e.id].stunUntil=elapsed+.35f;}}}
  bool ResolveExpansionProjectile(Projectile p,EnemyState target,BlockerState obstacle){
   if(!IsNewTower(p.kind))return false;int k=p.tier-1;float radius=1.05f+k*.13f;Vector3 hit=p.kind=="dragonfruit"?p.to:target!=null?target.position:p.to;
   if(obstacle!=null){DamageBlocker(obstacle,p.damage,p.kind,p.source);Emit("impact",p.kind,p.to,p.to,p.source,p.target,p.tier,p.damage,.5f);return true;}
   if(p.kind=="dragonfruit"){
    radius=1.0f+k*.12f;foreach(var e in enemies)if(Eligible(e,false)&&FlatDistance(e.position,p.to)<=radius)Damage(e,p.damage*(FlatDistance(e.position,p.to)<radius*.5f?1:.65f),false,p.kind,p.source);
    Emit("ability","meteor",p.to,p.to,p.source,p.target,p.tier,radius,.85f);
   }else if(p.kind=="lotus"||p.kind=="clockflower"){
    float range=CarrotData.Tower(p.kind).range[k];foreach(var e in enemies)if(Eligible(e,true)&&FlatDistance(e.position,p.position)<=range){Damage(e,p.damage,true,p.kind,p.source);if(p.kind=="clockflower")ApplySlow(e,.15f+k*.035f,1.8f);}
    if(p.kind=="clockflower"){float strength=p.tier==5?.3f:.12f+k*.035f,hold=p.tier==5?4.5f:3;foreach(var t in towers)if(FlatDistance(t.position,p.position)<=range){if(!auras.TryGetValue(t.id,out var aura)){aura=new Aura();auras[t.id]=aura;}if(aura.until<elapsed||strength>=aura.strength){aura.strength=Mathf.Min(.3f,strength);aura.until=elapsed+hold;}}Emit("ability","clockAura",p.position,p.position,p.source,tier:p.tier,value:strength,duration:hold);}
   }else {
    if(!Eligible(target,CarrotData.Tower(p.kind).air))return true;
    if(p.kind=="bamboo"){
     Vector3 line=(hit-p.position).normalized;float length=CarrotData.Tower(p.kind).range[k]+.5f;var hits=new List<EnemyState>();foreach(var e in enemies)if(Eligible(e,true)){Vector3 delta=e.position-p.position;float along=Vector3.Dot(delta,line);if(e.id==target.id||(along>=0&&along<=length&&(delta-line*along).magnitude<.4f+k*.06f))hits.Add(e);}SortTargets(hits,target.id);for(int i=0;i<Mathf.Min(p.tier==5?5:2+k,hits.Count);i++)Damage(hits[i],p.damage*(i==0?1:.8f),false,p.kind,p.source);Emit("ability","bambooPierce",p.position,p.position+line*length,p.source,p.target,p.tier,length,.3f);
    }else if(p.kind=="chili"){
     foreach(var e in enemies)if(Eligible(e,false)&&CarrotData.DistanceToRoute(e.position,new[]{p.position,hit})<.65f+k*.1f){Damage(e,p.damage,true,p.kind,p.source);var x=Extra(e);x.exposed=Mathf.Max(x.exposed,.1f+k*.025f);x.exposedUntil=elapsed+3;}
     for(int i=1;i<=3;i++){Vector3 at=Vector3.Lerp(p.position,hit,i/3f);burns.Add(new BurnZone{source=p.source,tier=p.tier,position=at,radius=.5f+k*.08f,dps=p.damage*.09f,remaining=p.tier==5?3.5f:2.5f});}Emit("ability","chiliTrail",p.position,hit,p.source,p.target,p.tier,.65f+k*.1f,p.tier==5?3.5f:2.5f);
    }else if(p.kind=="magnet"||p.kind=="cactus"){
     var used=new HashSet<int>();EnemyState current=target;Vector3 from=p.position;int cap=p.tier==5?5:2+(k>=2?1:0);
     for(int hop=0;hop<cap&&current!=null;hop++){used.Add(current.id);Vector3 at=current.position;var x=Extra(current);
      if(p.kind=="magnet"){x.shred=Mathf.Max(x.shred,.18f+k*.06f);x.shredUntil=elapsed+3.5f;StripShield(current,p.damage*.45f);Emit("ability","magnetShred",from,at,p.source,current.id,p.tier,x.shred,3.5f);}
      else {x.bleedDps=Mathf.Max(x.bleedDps,p.damage*.14f);x.bleedUntil=elapsed+(p.tier==5?4:3);Emit("ability","cactusBleed",at,at,p.source,current.id,p.tier,x.bleedDps,3);}
      Damage(current,p.damage*(float)Math.Pow(.78,hop),p.kind=="magnet",p.kind,p.source);EnemyState next=null;float best=1.5f+k*.12f;foreach(var e in enemies)if(Eligible(e,true)&&!used.Contains(e.id)){float d=FlatDistance(at,e.position);if(d<best){best=d;next=e;}}if(next!=null)Emit("shot",p.kind,at,next.position,p.source,next.id,p.tier,p.damage,.13f);current=next;from=at;
     }
    }else if(p.kind=="orchid"){
     radius=.65f+k*.15f;foreach(var e in enemies)if(Eligible(e,true)&&FlatDistance(hit,e.position)<=radius){Damage(e,p.damage*.6f,true,p.kind,p.source);var x=Extra(e);x.poisonCap=Mathf.Max(x.poisonCap,p.tier==5?6:4);x.poisonStacks=Mathf.Min(x.poisonCap,x.poisonStacks+1);x.poisonDps=Mathf.Max(x.poisonDps,p.damage*.16f*x.poisonStacks);x.poisonUntil=elapsed+(p.tier==5?5:3.5f);}if(clouds.Count>=48)clouds.RemoveAt(0);var cloud=new SporeCloud{source=p.source,tier=p.tier,position=hit,until=elapsed+2.5f,tick=elapsed+.4f,damage=p.damage,radius=radius};foreach(var e in enemies)if(FlatDistance(hit,e.position)<=radius)cloud.touched.Add(e.id);clouds.Add(cloud);Emit("ability","orchidPoison",hit,hit,p.source,p.target,p.tier,radius,2.5f);
    }else if(p.kind=="mushroom"){
     radius=.8f+k*.17f;foreach(var e in enemies)if(Eligible(e,false)&&FlatDistance(hit,e.position)<=radius){Damage(e,p.damage,true,p.kind,p.source);var x=Extra(e);if(!string.IsNullOrEmpty(e.boss)||!string.IsNullOrEmpty(e.miniboss))ApplySlow(e,.2f,1.2f);else if(elapsed>=x.sleepReady){float hold=p.tier==5?1.1f:.55f+k*.1f;x.sleepUntil=elapsed+hold;x.sleepReady=elapsed+6;x.wakeDamage=p.damage*(p.tier==5?.8f:.55f);actors[e.id].stunUntil=Mathf.Max(actors[e.id].stunUntil,elapsed+hold);Emit("ability","dreamSleep",e.position,e.position,p.source,e.id,p.tier,0,hold);}}
    }else if(p.kind=="moonflower"){
     float bonus=target.clone?1.8f:1;StripShield(target,p.damage*.45f);Damage(target,p.damage*bonus,true,p.kind,p.source);Emit("ability","lunarBeam",p.position,hit,p.source,p.target,p.tier,bonus,.35f);
    }
   }
   Emit("impact",p.kind,hit,hit,p.source,p.target,p.tier,p.damage,.55f);return true;
  }
 }
}
