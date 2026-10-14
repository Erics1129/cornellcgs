using System;
using System.Collections.Generic;
using UnityEngine;

namespace CarrotTD {
 [Serializable] public class TowerDef {
  public string id,name,role; public int unlock; public bool air; public string superName,superTrait;
  public int[] cost; public float[] damage,interval,range;
 }
 [Serializable] public class LevelDef {
  public int id,startingGold,waves; public string name,biome,boss;
  public Vector3[][] routes; public Vector3[] pads; public BlockerSeed[] blockers;
 }
 [Serializable] public class BlockerSeed {public int pad; public string kind;}
 [Serializable] public class TowerState {
  public int id,pad,tier,spent,mergedSpent; public string kind; public Vector3 position;
  public float cooldown,slowFor,disabledFor,stunnedFor,lastShot,buff,builtAt; public Vector3 aim;
 }
 [Serializable] public class EnemyState {
  public int id,route,phase; public string kind,boss,ability;
  public Vector3 position,direction;
  public float hp,maxHp,shield,maxShield,distance,routeLength,speed,hitAt,slowUntil,slowFactor,rushUntil,age;
  public float castRemaining,abilityRemaining,biteRemaining,deadFor;
  public bool alive=true,air,hidden,summoned; public int reward;
 }
 [Serializable] public class BlockerState {public int id,pad,reward,ownerEnemy;public string kind;public Vector3 position;public float hp,maxHp;}
 public class CarrotEvent {
  public string type,kind; public int id,target,tier; public Vector3 position,to;public float value,duration;
  public CarrotEvent(string type,string kind,Vector3 position,Vector3 to=default(Vector3),int id=0,int target=0,int tier=1,float value=0,float duration=0){this.type=type;this.kind=kind;this.position=position;this.to=to;this.id=id;this.target=target;this.tier=tier;this.value=value;this.duration=duration;}
 }
}
