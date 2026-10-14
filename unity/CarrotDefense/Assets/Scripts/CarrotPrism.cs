using System;
using System.Collections.Generic;
using UnityEngine;
namespace CarrotTD {
 // A straight-line endurance duel. Dashes, target locks and reinforcements use game time,
 // so pause and 2x affect the same authoritative timeline as every existing encounter.
 public sealed partial class CarrotGame {
  sealed class PrismState {
   public int id,skill,cohorts;
   public bool defeated;
   public float started,nextDash,nextSkill,nextCohort,overdriveUntil,dashStart,dashEnd,dashFrom,dashTo,warnedDashTo;
   public readonly Dictionary<int,Vector3> locked=new Dictionary<int,Vector3>();
  }
  sealed class PrismImpact {public int source,target;public string kind;public Vector3 from,to;public float at;}
  PrismState prism;
  readonly List<PrismImpact> prismImpacts=new List<PrismImpact>();
  readonly Dictionary<int,float> prismRecovery=new Dictionary<int,float>();
  static readonly string[] PrismSkills={"prismLances","prismaticAegis","spectrumRain","mirrorRush","prismOverdrive"};
  const float PrismDashSeconds=.45f;
  /// <summary>Authored HP-threshold breaks (fractions of max HP); none are armed until the break pass.</summary>
  static readonly float[] PrismBreaks={};
  void ResetPrism(){prism=null;prismImpacts.Clear();prismRecovery.Clear();}
  void InitPrism(EnemyState e){if(e.boss=="asuna")prism=new PrismState{id=e.id,started=elapsed,nextDash=elapsed+9,nextSkill=elapsed+3,nextCohort=elapsed+16};}
  float PrismDashLength(EnemyState e){return e.phase==3?1.6f:1.4f;}
  void MovePrismBoss(EnemyState e,float dt){
   float before=e.distance;
   if(prism!=null&&prism.id==e.id&&prism.dashEnd>0){float fraction=Mathf.Clamp01((elapsed-prism.dashStart)/PrismDashSeconds);e.distance=Mathf.Lerp(prism.dashFrom,prism.dashTo,fraction);if(fraction>=1)prism.dashEnd=0;}
   e.speed=Mathf.Max(0,(e.distance-before)/dt);e.position=CarrotData.RoutePoint(level.routes[e.route],e.distance,out e.direction);
  }
  void SchedulePrismBoss(EnemyState e,Actor a){
   if(prism==null||prism.id!=e.id)return;
   // A dash always takes the next free cast slot. No shield or attack can delay it indefinitely.
   if(elapsed>=prism.nextDash){BeginCast(e,a,"prismDash",1.25f,PrismDashSeconds);return;}
   if(elapsed<prism.nextSkill)return;
   string kind=PrismSkills[prism.skill%PrismSkills.Length];
   BeginCast(e,a,kind,kind=="spectrumRain"?2.1f:kind=="mirrorRush"?1.8f:1.6f,0);
  }
  void PreparePrismCast(EnemyState e,Actor a,string kind){
   if(e.boss!="asuna"||prism==null)return;prism.locked.Clear();
   if(kind=="prismDash"){prism.warnedDashTo=Mathf.Min(e.routeLength,e.distance+PrismDashLength(e));return;}
   if(kind!="prismLances"&&kind!="spectrumRain")return;
   candidates.Clear();foreach(var t in towers)if(FlatDistance(t.position,e.position)<=7.5f)candidates.Add(t);
   candidates.Sort((t,u)=>Nearer(e.position,t,u));
   int count=kind=="spectrumRain"?(e.phase==3?4:3):(e.phase==3?3:2);
   foreach(var t in candidates)if(a.targets.Count<count){a.targets.Add(t.id);prism.locked[t.id]=t.position;}
  }
  bool CommitPrism(EnemyState e,Actor a,string kind,out float duration,out float value,out Vector3 target,out int targetId){
   duration=0;value=0;target=e.position;targetId=0;
   if(e.boss!="asuna"||prism==null)return false;
   switch(kind){
    case "prismDash":{
     prism.dashFrom=e.distance;prism.dashTo=Mathf.Max(e.distance,prism.warnedDashTo);prism.dashStart=elapsed;prism.dashEnd=elapsed+PrismDashSeconds;
     prism.nextDash=elapsed+(e.phase==3?11:13);duration=PrismDashSeconds;value=prism.dashTo-prism.dashFrom;
     Vector3 direction;target=CarrotData.RoutePoint(level.routes[e.route],prism.dashTo,out direction);
     Emit("abilityTarget",kind,e.position,target,e.id,e.id,value:value,duration:duration);return true;
    }
    case "prismLances":case "spectrumRain":{
     int index=0;foreach(int id in a.targets){if(!prism.locked.TryGetValue(id,out Vector3 at))continue;
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
    case "prismOverdrive":duration=1;value=12;prism.overdriveUntil=elapsed+12;prism.nextCohort=Mathf.Min(prism.nextCohort,elapsed+2);Rally(e,8,1.18f,3);break;
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
