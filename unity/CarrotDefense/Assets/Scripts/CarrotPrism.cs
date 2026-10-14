using System;
using System.Collections.Generic;
using UnityEngine;
namespace CarrotTD {
 // A straight-line endurance duel. Dashes, target locks and reinforcements use game time,
 // so pause and 2x affect the same authoritative timeline as every existing encounter.
 public sealed partial class CarrotGame {
  sealed class PrismState {
   public int id,skill,cohorts,breaks,escorts;
   public bool defeated;
   public float started,nextDash,nextSkill,nextCohort,nextEscort,overdriveUntil,dashStart,dashEnd,dashFrom,dashTo,warnedDashTo;
   public readonly Dictionary<int,Vector3> locked=new Dictionary<int,Vector3>();
  }
  sealed class PrismImpact {public int source,target;public string kind;public Vector3 from,to;public float at;}
  PrismState prism;
  readonly List<PrismImpact> prismImpacts=new List<PrismImpact>();
  readonly Dictionary<int,float> prismRecovery=new Dictionary<int,float>();
  static readonly string[] PrismSkills={"prismLances","prismaticAegis","spectrumRain","mirrorRush","prismOverdrive"};
  const float PrismDashSeconds=.45f;
  /// <summary>Authored HP-threshold breaks (fractions of max HP): crossing one queues a guaranteed Prism Break, a dash plus
  /// a spectrum rain behind an actionable 2.5 s warning held at 1x. They answer the player's progress at fixed, visible
  /// marks (ticks on the boss bar), never the player's damage rate.</summary>
  public static readonly float[] PrismBreaks={.66f,.33f};
  /// <summary>Opening escort cohorts from the lane's start (announced by waveIncoming). Measured and left empty: even three
  /// nibbles behind her let both the expert policy and the stack leak (balance-results.md); the timed reinforcements remain.</summary>
  static readonly float[] PrismEscortAt={};
  static readonly string[][] PrismEscorts={};
  void ResetPrism(){prism=null;prismImpacts.Clear();prismRecovery.Clear();}
  void InitPrism(EnemyState e){if(e.boss=="asuna")prism=new PrismState{id=e.id,started=elapsed,nextDash=elapsed+9,nextSkill=elapsed+3,nextCohort=elapsed+16,nextEscort=PrismEscortAt.Length>0?elapsed+PrismEscortAt[0]:float.MaxValue};}
  float PrismDashLength(EnemyState e){return e.phase==3?2.2f:1.8f;}
  void MovePrismBoss(EnemyState e,float dt){
   float before=e.distance;
   if(prism!=null&&prism.id==e.id&&prism.dashEnd>0){float fraction=Mathf.Clamp01((elapsed-prism.dashStart)/PrismDashSeconds);e.distance=Mathf.Lerp(prism.dashFrom,prism.dashTo,fraction);if(fraction>=1)prism.dashEnd=0;}
   e.speed=Mathf.Max(0,(e.distance-before)/dt);e.position=CarrotData.RoutePoint(level.routes[e.route],e.distance,out e.direction);
  }
  void SchedulePrismBoss(EnemyState e,Actor a){
   if(prism==null||prism.id!=e.id)return;
   // A crossed HP break takes the next free cast slot, ahead of the dash.
   // Marks crossed together (one burst of damage) share a single break.
   bool crossed=false;for(int i=0;i<PrismBreaks.Length;i++)if((prism.breaks&(1<<i))==0&&e.hp<=e.maxHp*PrismBreaks[i]){prism.breaks|=1<<i;crossed=true;}
   if(crossed){BeginCast(e,a,"prismBreak",ActionableWindup,PrismDashSeconds);return;}
   // A dash always takes the next free cast slot. No shield or attack can delay it indefinitely.
   if(elapsed>=prism.nextDash){BeginCast(e,a,"prismDash",1.25f,PrismDashSeconds);return;}
   if(elapsed<prism.nextSkill)return;
   string kind=PrismSkills[prism.skill%PrismSkills.Length];
   BeginCast(e,a,kind,kind=="spectrumRain"?2.1f:kind=="mirrorRush"?1.8f:1.6f,0);
  }
  void PreparePrismCast(EnemyState e,Actor a,string kind){
   if(e.boss!="asuna"||prism==null)return;prism.locked.Clear();
   if(kind=="prismDash"||kind=="prismBreak")prism.warnedDashTo=Mathf.Min(e.routeLength,e.distance+PrismDashLength(e));
   if(kind=="prismDash")return;
   if(kind!="prismLances"&&kind!="spectrumRain"&&kind!="prismBreak")return;
   candidates.Clear();foreach(var t in towers)if(FlatDistance(t.position,e.position)<=7.5f)candidates.Add(t);
   candidates.Sort((t,u)=>Nearer(e.position,t,u));
   int count=kind=="spectrumRain"||kind=="prismBreak"?(e.phase==3?4:3):(e.phase==3?3:2);
   foreach(var t in candidates)if(a.targets.Count<count){a.targets.Add(t.id);prism.locked[t.id]=t.position;}
  }
  bool CommitPrism(EnemyState e,Actor a,string kind,out float duration,out float value,out Vector3 target,out int targetId){
   duration=0;value=0;target=e.position;targetId=0;
   if(e.boss!="asuna"||prism==null)return false;
   switch(kind){
    case "prismDash":{
     prism.dashFrom=e.distance;prism.dashTo=muting?e.distance:Mathf.Max(e.distance,prism.warnedDashTo);prism.dashStart=elapsed;prism.dashEnd=elapsed+PrismDashSeconds;
     prism.nextDash=elapsed+(e.phase==3?11:13);duration=PrismDashSeconds;value=prism.dashTo-prism.dashFrom;
     Vector3 direction;target=CarrotData.RoutePoint(level.routes[e.route],prism.dashTo,out direction);
     Emit("abilityTarget",kind,e.position,target,e.id,e.id,value:value,duration:duration);return true;
    }
    case "prismBreak":{
     // The dash and the rain of a break land together; the regular dash clock restarts from it.
     prism.dashFrom=e.distance;prism.dashTo=muting?e.distance:Mathf.Max(e.distance,prism.warnedDashTo);prism.dashStart=elapsed;prism.dashEnd=elapsed+PrismDashSeconds;prism.nextDash=elapsed+(e.phase==3?11:13);
     Vector3 direction;var arrive=CarrotData.RoutePoint(level.routes[e.route],prism.dashTo,out direction);Emit("abilityTarget","prismBreak",e.position,arrive,e.id,e.id,value:prism.dashTo-prism.dashFrom,duration:PrismDashSeconds);
     int index=0;foreach(int id in a.targets){if(muting||!prism.locked.TryGetValue(id,out Vector3 at))continue;prismImpacts.Add(new PrismImpact{source=e.id,target=id,kind="spectrumRain",from=e.position,to=at,at=elapsed+.2f+index*.22f});if(index++==0){target=at;targetId=id;}}
     value=index;duration=1.1f;return true;
    }
    case "prismLances":case "spectrumRain":{
     int index=0;foreach(int id in a.targets){if(muting||!prism.locked.TryGetValue(id,out Vector3 at))continue;
      // Spears land at commit; rain has a short stagger after its complete, visible warning.
      prismImpacts.Add(new PrismImpact{source=e.id,target=id,kind=kind,from=e.position,to=at,at=elapsed+(kind=="spectrumRain"?.2f+index*.22f:0)});
      if(index++==0){target=at;targetId=id;}
     }
     value=index;duration=kind=="spectrumRain"?1.1f:.55f;break;
    }
    case "prismaticAegis":duration=4;value=Mathf.Min(2600,e.maxHp*.075f);GrantShield(e,value,duration);break;
    case "mirrorRush":{
     int alive=0;foreach(var add in enemies)if(add.alive&&add.clone&&Extra(add).owner==e.id)alive++;foreach(var add in extraSpawns)if(add.clone&&add.owner==e.id)alive++;
     int count=Mathf.Max(0,2-alive);QueueExtra("asuna",e,count,.8f,true,14);value=count;duration=.8f;break;
    }
    case "prismOverdrive":duration=1;value=12;if(!muting){prism.overdriveUntil=elapsed+12;prism.nextCohort=Mathf.Min(prism.nextCohort,elapsed+2);}Rally(e,8,1.18f,3);break;
    default:return false;
   }
   prism.skill++;prism.nextSkill=elapsed+(e.phase==3?5.5f:7);return true;
  }
  void TickPrism(){
   if(prism==null)return;var boss=enemies.Find(e=>e.id==prism.id&&e.alive);
   for(int i=prismImpacts.Count-1;i>=0;i--){var hit=prismImpacts[i];if(elapsed<hit.at)continue;prismImpacts.RemoveAt(i);if(boss==null)continue;
    var t=towers.Find(p=>p.id==hit.target);float hold=hit.kind=="prismLances"?(boss.phase==3?1.8f:1.3f):.65f;
    if(t!=null&&(!prismRecovery.TryGetValue(t.id,out float ready)||elapsed>=ready)){
     LockTower(t,hold);if(hit.kind=="spectrumRain")Weaken(t,.72f,3);prismRecovery[t.id]=elapsed+7;
    }
    Emit("abilityTarget",hit.kind,hit.from,hit.to,hit.source,hit.target,value:hold,duration:hold);
   }
   // Opening escorts: two small cohorts from the lane's start, announced like a wave.
   if(boss!=null&&prism.escorts<PrismEscortAt.Length&&elapsed>=prism.nextEscort&&boss.biteRemaining<=0){
    var group=PrismEscorts[prism.escorts];for(int i=0;i<group.Length;i++){extraSpawns.Add(new ExtraSpawn{kind=group[i],route=0,wave=wave>0?wave:1,owner=boss.id,distance=0,scale=.55f,clone=false,life=120,at=elapsed+.2f+i*.55f});pendingSummons++;}
    int air=0;foreach(var k in group)if(CarrotData.Traits(k).air)air++;if(air>0)Emit("waveIncoming","air",level.routes[0][0],target:0,tier:1,value:air);if(group.Length>air)Emit("waveIncoming","ground",level.routes[0][0],target:0,tier:1,value:group.Length-air);
    prism.escorts++;prism.nextEscort=prism.escorts<PrismEscortAt.Length?prism.started+PrismEscortAt[prism.escorts]:float.MaxValue;
   }
   if(boss==null||elapsed<prism.nextCohort||boss.biteRemaining>0)return;
   // At most 48 timed cohorts plus existing explicit casts. Their small bounties are
   // earned by killing real enemies; the forward-only boss puts an end to farming.
   if(prism.cohorts>=48)return;
   int pressure=Mathf.Clamp((int)(boss.age/85),0,4),count=2+pressure;
   string[] kinds={"nibble","beetle","moth","scarab","riftling","mimic","crystal","shaman"};
   string kind=kinds[(prism.cohorts+pressure)%kinds.Length];
   int pendingBefore=pendingSummons;QueueExtra(kind,boss,count,.55f+pressure*.05f,false,65);
   prism.cohorts++;float gap=Mathf.Max(7,16-pressure*2);if(elapsed<prism.overdriveUntil)gap*=.72f;prism.nextCohort=elapsed+gap;
   int actual=pendingSummons-pendingBefore;if(actual>0)Emit("ability","prismReinforce",boss.position,boss.position,boss.id,value:actual,duration:1);
  }
  void ResolvePrism(EnemyState e,bool killed){
   if(e.boss!="asuna"||prism==null)return;
   prism.defeated=killed;prismImpacts.Clear();
   for(int i=extraSpawns.Count-1;i>=0;i--)if(extraSpawns[i].owner==e.id){extraSpawns.RemoveAt(i);pendingSummons=Mathf.Max(0,pendingSummons-1);}
  }
 }
}
