using System;
using System.Collections.Generic;
using System.Globalization;
using System.Runtime.InteropServices;
using UnityEngine;

namespace CarrotTD {
 // Authoritative simulation. Presentation listens to Effect; it never resolves combat.
 public sealed class CarrotGame : MonoBehaviour {
  public LevelDef level;
  public List<TowerState> towers=new List<TowerState>();
  public List<EnemyState> enemies=new List<EnemyState>();
  public List<BlockerState> blockers=new List<BlockerState>();
  public int coins,health,wave;
  public float elapsed,progress,nextWave,speed=1;
  public bool paused,AutoTick=true,EnableBridge=true;
  public string phase="ready",selectionType="",notice="";
  public int selectionId=-1;
  public event Action<CarrotEvent> Effect;
  public string LastSnapshot {get;private set;}
  public string PreviewKind {get;private set;}="seed";
  public int ResolvedEnemies {get;private set;}
  public int TotalEarned {get;private set;}
  public int CarrotContacts {get;private set;}
  public int PendingSummons {get{return pendingSummons;}}
  const float Step=1f/30f;
  float accumulator,bridgeClock,noticeUntil;
  int nextId=1,pendingSummons,unresolvedContacts,totalWork,resolvedWork;
  bool backgrounded,muted;
  int[] waveLiving,wavePending;
  bool[] waveStarted,wavePaid;
  readonly List<SpawnJob> spawns=new List<SpawnJob>();
  readonly List<Projectile> projectiles=new List<Projectile>();
  readonly List<BurnZone> burns=new List<BurnZone>();
  readonly Dictionary<int,FocusState> focusStates=new Dictionary<int,FocusState>();
  readonly Dictionary<int,Aura> auras=new Dictionary<int,Aura>();
  readonly Dictionary<int,Actor> actors=new Dictionary<int,Actor>();
  readonly List<int> removeIds=new List<int>();
  [DllImport("__Internal")] static extern void CarrotSend(string json);

  class SpawnJob {public float at;public string kind;public int route,wave;}
  class Projectile {public string kind;public int source,target,tier;public float damage,remaining;public Vector3 position,to;public bool returning;}
  class BurnZone {public int source,tier;public Vector3 position;public float radius,dps,remaining,tick;}
  class FocusState {public int target,hits;}
  class Aura {public float until,strength;}
  class Actor {
   public int wave,phase=1,bogCalls,mantles,shatters,reserved,seedMarks;
   public float seedBurstAt,freezeAt,conductiveUntil,rewindUntil,rewindReady,gravityReady,pullUntil;
   public Vector3 pullCenter;
   public float baseSpeed,armor,armorUntil,veilUntil,shieldUntil,healAt,burrowAt,emergeAt,abilityA=6,abilityB=11,abilityC=12,castEnd,activeUntil,stunUntil,contactEnd;
   public bool contactApplied,work=true;
   public string cast="";
   public Vector3 castDirection;
   public List<int> targets=new List<int>();
  }
  [Serializable] class InputCommand {public string type,kind,selectionType;public int id,level;public float value;}

  void Awake(){LoadLevel(1);}
  void Update(){
   float real=Mathf.Min(Time.unscaledDeltaTime,.1f);
   if(AutoTick&&!backgrounded&&!paused&&phase=="playing"){
    accumulator+=real*speed;
    while(accumulator>=Step){Tick(Step);accumulator-=Step;if(phase!="playing")break;}
   }
   bridgeClock+=real;if(bridgeClock>=.1f){bridgeClock=0;Publish();}
  }
  void OnApplicationFocus(bool focused){backgrounded=!focused;accumulator=0;}
  void OnApplicationPause(bool value){backgrounded=value;accumulator=0;}

  public void LoadLevel(int id){
   var def=CarrotData.Level(id);if(def==null)return;
   level=def;towers.Clear();enemies.Clear();blockers.Clear();spawns.Clear();projectiles.Clear();actors.Clear();burns.Clear();focusStates.Clear();auras.Clear();PreviewKind="seed";
   coins=def.startingGold;health=10;wave=0;elapsed=0;progress=0;nextWave=0;paused=false;speed=1;phase="ready";
   nextId=1;pendingSummons=0;unresolvedContacts=0;resolvedWork=0;totalWork=0;ResolvedEnemies=0;TotalEarned=coins;CarrotContacts=0;
   selectionType="";selectionId=-1;accumulator=0;notice="Choose a place";noticeUntil=4;
   waveLiving=new int[level.waves+1];wavePending=new int[level.waves+1];waveStarted=new bool[level.waves+1];wavePaid=new bool[level.waves+1];
   for(int w=0;w<level.waves;w++)foreach(string part in CarrotData.Waves[level.id-1][w].Split(',')){
    string[] bits=part.Split(':');int n=int.Parse(bits[1],CultureInfo.InvariantCulture);totalWork+=n*(bits[0]=="boss"?8:1);wavePending[w+1]+=n;
   }
   float hpScale=level.biome=="garden"?1:level.biome=="marsh"?1.5f:2;
   foreach(var seed in level.blockers){
    int rank=seed.kind=="hedge"?0:seed.kind=="stump"?1:2;float hp=(rank==0?70:rank==1?160:300)*hpScale;
    blockers.Add(new BlockerState{id=nextId++,pad=seed.pad,kind=seed.kind,position=level.pads[seed.pad],hp=hp,maxHp=hp,reward=rank==0?15:rank==1?30:50});
   }
   Emit("level",level.biome,Vector3.zero);Publish();
  }
  public void Command(string json){
   InputCommand c;try{c=JsonUtility.FromJson<InputCommand>(json);}catch{ return; }
   if(c==null||string.IsNullOrEmpty(c.type))return;
   switch(c.type){
    case "load":LoadLevel(c.level);break;
    case "start":if(phase=="ready"){phase="playing";SetNotice("Defend the carrot",2);BeginWave();Emit("start",level.biome,Vector3.zero);}break;
    case "next":if(phase=="playing"&&!paused&&wave<level.waves&&nextWave>0&&CurrentWaveResolved()){int bonus=Mathf.Min(6,Mathf.FloorToInt(nextWave));coins+=bonus;TotalEarned+=bonus;BeginWave();}break;
    case "preview":if(CarrotData.Tower(c.kind)!=null){PreviewKind=c.kind;Emit("preview",c.kind,Vector3.zero);}break;
    case "buy":Buy(c.kind);break;
    case "upgrade":Upgrade();break;
    case "sell":Sell();break;
    case "pause":if(phase=="playing"){paused=!paused;accumulator=0;Emit("pause",paused?"on":"off",Vector3.zero);}break;
    case "speed":speed=c.value>=1.5f?2:1;break;
    case "select":Select(c.selectionType,c.id);break;
    case "clear":Select("",-1);break;
    case "mute":muted=c.value>0;var view=GetComponent<CarrotView>();if(view!=null)view.SetMuted(muted);break;
   }
   Publish();
  }
  public void Select(string type,int id){
   if(type=="pad"){
    if(id<0||id>=level.pads.Length)return;
    var t=towers.Find(x=>x.pad==id);if(t!=null){type="tower";id=t.id;}
    else {var b=blockers.Find(x=>x.pad==id);if(b!=null){type="blocker";id=b.id;}}
   }
   if(type=="tower"&&towers.Find(x=>x.id==id)==null)return;
   if(type=="enemy"&&enemies.Find(x=>x.id==id&&x.alive)==null)return;
   if(type=="blocker"&&blockers.Find(x=>x.id==id)==null)return;
   if(type!="pad"&&type!="tower"&&type!="enemy"&&type!="blocker"){type="";id=-1;}
   if((type=="enemy"||type=="blocker")&&selectionType==type&&selectionId==id){selectionType="";selectionId=-1;}else{selectionType=type;selectionId=id;}
   Publish();
  }
  bool CanManage(){return phase=="ready"||phase=="playing";}
  void Buy(string kind){
   var d=CarrotData.Tower(kind);if(!CanManage()||selectionType!="pad"||d==null||d.unlock>level.id)return;
   int p=selectionId;if(p<0||p>=level.pads.Length||towers.Exists(x=>x.pad==p)||blockers.Exists(x=>x.pad==p))return;
   if(coins<d.cost[0]){SetNotice("More coins needed",1.6f);return;}
   coins-=d.cost[0];var t=new TowerState{id=nextId++,kind=kind,pad=p,tier=1,spent=d.cost[0],position=level.pads[p],cooldown=.15f,lastShot=-20};
   towers.Add(t);selectionType="tower";selectionId=t.id;Emit("build",kind,t.position,id:t.id,tier:1,duration:.7f);
  }
  void Upgrade(){
   if(!CanManage()||selectionType!="tower")return;var t=towers.Find(x=>x.id==selectionId);if(t==null||t.tier>=4)return;
   var d=CarrotData.Tower(t.kind);int cost=d.cost[t.tier];if(coins<cost){SetNotice("More coins needed",1.6f);return;}
   coins-=cost;t.spent+=cost;t.tier++;Emit("upgrade",t.kind,t.position,id:t.id,tier:t.tier,duration:.7f);
  }
  void Sell(){if(!CanManage()||selectionType!="tower")return;var t=towers.Find(x=>x.id==selectionId);if(t==null)return;coins+=Mathf.FloorToInt(t.spent*.7f);towers.Remove(t);Emit("sell",t.kind,t.position,id:t.id,tier:t.tier);selectionType="pad";selectionId=t.pad;}
  void SetNotice(string value,float duration){notice=value;noticeUntil=elapsed+duration;}
  void Emit(string type,string kind,Vector3 at,Vector3 to=default(Vector3),int id=0,int target=0,int tier=1,float value=0,float duration=0){Effect?.Invoke(new CarrotEvent(type,kind,at,to,id,target,tier,value,duration));}

  void BeginWave(){
   if(wave>=level.waves)return;wave++;nextWave=0;waveStarted[wave]=true;SetNotice(wave==level.waves?"Final wave":"Wave "+wave,2);
   string[] packets=CarrotData.Waves[level.id-1][wave-1].Split(',');float at=elapsed+.65f;int packetIndex=0,firstRoute=-1;
   foreach(string packet in packets){
    var bits=packet.Split(':');string kind=bits[0];int count=int.Parse(bits[1],CultureInfo.InvariantCulture);
    for(int i=0;i<count;i++){
     int route=kind=="boss"?0:(wave+packetIndex+i/Mathf.Max(2,count/level.routes.Length))%level.routes.Length;
     if(firstRoute<0)firstRoute=route;
     float gap=kind=="swarm"?.24f:kind=="boss"?1.8f:.78f;
     spawns.Add(new SpawnJob{at=at+i*gap,kind=kind,route=route,wave=wave});
    }
    at+=Mathf.Max(2,count*(kind=="swarm"?.24f:.78f))+.8f;packetIndex++;
   }
   Emit("wave",level.biome,level.routes[Mathf.Max(0,firstRoute)][0],value:wave,duration:2);Publish();
  }
  bool CurrentWaveResolved(){return wave>0&&wavePending[wave]==0&&waveLiving[wave]==0&&pendingSummons==0&&unresolvedContacts==0;}

  // Public deterministic stepping lets Editor tests exercise exactly the shipped simulation.
  public void StepSimulation(float seconds){
   if(paused||phase!="playing")return;
   for(float left=seconds;left>0.00001f&&phase=="playing";){float dt=Mathf.Min(Step,left);Tick(dt);left-=dt;}
  }
  void Tick(float dt){
   elapsed+=dt;if(elapsed>=noticeUntil)notice="";
   for(int i=spawns.Count-1;i>=0;i--)if(spawns[i].at<=elapsed){var s=spawns[i];spawns.RemoveAt(i);wavePending[s.wave]--;Spawn(s.kind,s.route,s.wave,false,0);}
   // Walk a snapshot because boss summons can extend the authoritative enemy collection.
   var active=enemies.ToArray();foreach(var e in active)TickEnemy(e,dt);
   foreach(var b in blockers.ToArray())if(b.ownerEnemy>0){var owner=enemies.Find(x=>x.id==b.ownerEnemy&&x.alive);if(owner==null||elapsed>=actors[b.ownerEnemy].activeUntil)ClearBlocker(b,false);else b.position=owner.position;}
   for(int i=projectiles.Count-1;i>=0;i--){var p=projectiles[i];p.remaining-=dt;if(p.remaining<=0){projectiles.RemoveAt(i);ResolveProjectile(p);}}
   for(int i=burns.Count-1;i>=0;i--){var zone=burns[i];float alive=Mathf.Min(zone.remaining,dt);zone.remaining-=dt;zone.tick+=alive;
    if(zone.tick>=.25f||zone.remaining<=0){foreach(var e in enemies.ToArray())if(Eligible(e,false)&&FlatDistance(e.position,zone.position)<=zone.radius)Damage(e,zone.dps*zone.tick,true,"burn",zone.source);zone.tick=0;}
    if(zone.remaining<=0)burns.RemoveAt(i);
   }
   foreach(var t in towers)TickTower(t,dt);
   for(int i=enemies.Count-1;i>=0;i--){var e=enemies[i];if(e.alive)continue;e.deadFor+=dt;
    if(actors.TryGetValue(e.id,out var a)&&a.contactEnd>0&&elapsed>=a.contactEnd){a.contactEnd=0;unresolvedContacts=Mathf.Max(0,unresolvedContacts-1);}
    if(e.deadFor>=.8f){enemies.RemoveAt(i);actors.Remove(e.id);}
   }
   for(int w=1;w<=wave;w++)if(waveStarted[w]&&!wavePaid[w]&&wavePending[w]==0&&waveLiving[w]==0){wavePaid[w]=true;int pay=level.biome=="garden"?15:level.biome=="marsh"?20:25;coins+=pay;TotalEarned+=pay;Emit("coins","wave",level.routes[0][level.routes[0].Length-1],value:pay);}
   if(phase!="playing")return;
   if(CurrentWaveResolved()){
    if(wave==level.waves){SetOutcome(true);}
    else {if(nextWave<=0)nextWave=5;else {nextWave-=dt;if(nextWave<=0)BeginWave();}}
   }
   UpdateProgress();
  }
  EnemyState Spawn(string kind,int route,int fromWave,bool summoned,float distance){
   bool boss=kind=="boss";string id=boss?level.boss:kind;float hp=55,velocity=.9f;int reward=8;float armor=0,shield=0;
   switch(id){
    case "dash":hp=38;velocity=1.65f;reward=9;break;
    case "shell":hp=125;velocity=.62f;reward=15;armor=.4f;break;
    case "swarm":hp=24;velocity=1.08f;reward=4;break;
    case "moth":hp=65;velocity=1.1f;reward=11;break;
    case "shaman":hp=130;velocity=.7f;reward=18;break;
    case "burrow":hp=80;velocity=.9f;reward=12;break;
    case "crystal":hp=110;shield=70;velocity=.7f;reward=17;break;
    case "fragment":hp=90;velocity=.75f;reward=0;break;
    case "garden":hp=1800;velocity=.36f;reward=120;break;
    case "marsh":hp=3400;velocity=.32f;reward=180;break;
    case "frost":hp=5600;velocity=.3f;reward=250;break;
   }
   if(!boss&&id!="fragment"){hp*=CarrotData.HPScale(level.id);shield*=CarrotData.HPScale(level.id);}
   route=Mathf.Clamp(route,0,level.routes.Length-1);
   var e=new EnemyState{id=nextId++,kind=id,boss=boss?id:"",route=route,hp=hp,maxHp=hp,shield=shield,maxShield=shield,speed=velocity,distance=distance,routeLength=CarrotData.RouteLength(level.routes[route]),air=id=="moth",summoned=summoned,reward=summoned?0:reward,hitAt=-10,phase=1,slowFactor=1};
   e.position=CarrotData.RoutePoint(level.routes[route],distance,out e.direction);enemies.Add(e);waveLiving[fromWave]++;
   actors[e.id]=new Actor{wave=fromWave,baseSpeed=velocity,armor=armor,work=!summoned,healAt=elapsed+7,burrowAt=elapsed+7,abilityA=elapsed+(id=="marsh"?7:6),abilityB=elapsed+(id=="marsh"?12:11),abilityC=elapsed+12};
   if(boss){SetNotice(CarrotData.BossName(id),4);Emit("bossEnter",id,e.position,id:e.id,value:hp,duration:3);}
   else Emit("spawn",id,e.position,id:e.id);
   return e;
  }
  void TickEnemy(EnemyState e,float dt){
   if(!e.alive)return;var a=actors[e.id];e.age+=dt;
   if(e.hp<=0){ResolveEnemy(e,true);return;}
   if(e.biteRemaining>0){e.biteRemaining-=dt;if(!a.contactApplied&&e.biteRemaining<=.32f){a.contactApplied=true;health=Mathf.Max(0,health-(string.IsNullOrEmpty(e.boss)?1:3));CarrotContacts++;Emit("carrotHit",e.kind,e.position,id:e.id,value:health,duration:.45f);ResolveEnemy(e,false);if(health==0)SetOutcome(false);}return;}
   if(!string.IsNullOrEmpty(e.boss))TickBoss(e,a,dt);
   if(!e.alive||phase!="playing")return;
   if(e.kind=="shaman"&&elapsed>=a.healAt){
    if(a.cast!="heal"){a.cast="heal";a.castEnd=elapsed+1;e.ability="heal";Emit("telegraph","heal",e.position,id:e.id,duration:1);}
    else if(elapsed>=a.castEnd){foreach(var ally in enemies)if(ally.id!=e.id&&ally.alive&&string.IsNullOrEmpty(ally.boss)&&!ally.hidden&&FlatDistance(e.position,ally.position)<=1.7f){float amount=Mathf.Min(ally.maxHp-ally.hp,ally.maxHp*.08f);ally.hp+=amount;if(amount>0)Emit("heal",ally.kind,ally.position,id:e.id,target:ally.id,value:amount,duration:.5f);}a.cast="";e.ability="";a.healAt=elapsed+7;}
   }
   if(e.kind=="burrow"){
    if(e.hidden&&elapsed>=a.emergeAt){e.hidden=false;e.ability="";a.burrowAt=elapsed+7;Emit("ability","emerge",e.position,id:e.id,duration:.3f);}
    if(!e.hidden&&e.routeLength-e.distance>4&&elapsed>=a.burrowAt){
     if(a.cast!="burrow"){a.cast="burrow";a.castEnd=elapsed+.7f;e.ability="burrow";Emit("telegraph","burrow",e.position,id:e.id,duration:.7f);}
     else if(elapsed>=a.castEnd){a.cast="";e.hidden=true;a.emergeAt=elapsed+1.8f;Emit("ability","burrow",e.position,id:e.id,duration:1.8f);}
    }
    if(e.routeLength-e.distance<=2)e.hidden=false;
   }
   float slow=elapsed<e.slowUntil?e.slowFactor:1;e.speed=a.baseSpeed*slow;
   if(elapsed<a.stunUntil)e.speed=0;
   bool rewind=elapsed<a.rewindUntil&&string.IsNullOrEmpty(e.boss);
   e.distance=Mathf.Clamp(e.distance+e.speed*dt*(rewind?-1:1),0,e.routeLength);e.position=CarrotData.RoutePoint(level.routes[e.route],e.distance,out e.direction);if(rewind)e.direction=-e.direction;
   if(elapsed<a.pullUntil){float blend=Mathf.Sin(Mathf.Clamp01((a.pullUntil-elapsed)/.65f)*Mathf.PI);Vector3 offset=a.pullCenter-e.position;e.position+=Vector3.ClampMagnitude(offset,1.1f)*blend*.75f;}
   if(e.distance>=e.routeLength){e.hidden=false;e.biteRemaining=.65f;e.ability="bite";unresolvedContacts++;a.contactEnd=elapsed+.65f;CancelCast(e,a);Emit("bite",e.kind,e.position,id:e.id,value:string.IsNullOrEmpty(e.boss)?1:3,duration:.65f);}
  }
  void ResolveEnemy(EnemyState e,bool killed){
   if(!e.alive)return;e.alive=false;e.deadFor=0;var a=actors[e.id];CancelCast(e,a);
   waveLiving[a.wave]=Mathf.Max(0,waveLiving[a.wave]-1);ResolvedEnemies++;if(a.work)resolvedWork+=string.IsNullOrEmpty(e.boss)?1:8;
   if(killed){coins+=e.reward;TotalEarned+=e.reward;Emit("death",e.kind,e.position,id:e.id,value:e.reward,duration:.8f);}
   if(selectionType=="enemy"&&selectionId==e.id){selectionType="";selectionId=-1;}
   for(int i=blockers.Count-1;i>=0;i--)if(blockers[i].ownerEnemy==e.id)ClearBlocker(blockers[i],false);
   UpdateProgress();
  }
  void TickBoss(EnemyState e,Actor a,float dt){
   float fraction=e.hp/e.maxHp;int newPhase=e.boss=="garden"?(fraction<=.25f?3:fraction<=.6f?2:1):e.boss=="marsh"?(fraction<=.25f?3:fraction<=.55f?2:1):(fraction<=.3f?3:fraction<=.65f?2:1);
   if(newPhase>a.phase){
    a.phase=newPhase;e.phase=newPhase;Emit("ability","phase",e.position,id:e.id,value:newPhase,duration:.9f);
    if(newPhase==3){
     a.baseSpeed=e.boss=="garden"?.48f:e.boss=="marsh"?.46f:.42f;
     if(e.boss=="garden"){a.armorUntil=0;if(a.cast=="bark")CancelCast(e,a);}
     if(e.boss=="marsh"&&a.cast=="summon")CancelCast(e,a);
     if(e.boss=="frost"){e.shield=0;a.shieldUntil=0;if(a.cast=="mantle")CancelCast(e,a);a.abilityC=elapsed+3;}
    }
   }
   if(a.shieldUntil>0&&elapsed>=a.shieldUntil){e.shield=0;a.shieldUntil=0;}
   e.abilityRemaining=Mathf.Max(0,a.activeUntil-elapsed);
   if(!string.IsNullOrEmpty(a.cast)){
    e.castRemaining=Mathf.Max(0,a.castEnd-elapsed);
    if(elapsed>=a.castEnd)CommitAbility(e,a);
    return;
   }
   e.castRemaining=0;if(elapsed<a.activeUntil)return;e.ability="";
   if(e.boss=="garden"){
    if(a.phase>=2&&elapsed>=a.abilityB&&towers.Count>0)BeginCast(e,a,"root",1.3f,3.5f);
    else if(a.phase<3&&elapsed>=a.abilityA)BeginCast(e,a,"bark",1.2f,5);
   }else if(e.boss=="marsh"){
    if(a.phase==2&&elapsed>=a.abilityB&&a.bogCalls<3&&e.routeLength-e.distance>4)BeginCast(e,a,"summon",1.5f,0);
    else if(elapsed>=a.abilityA)BeginCast(e,a,"mist",1.4f,a.phase==3?3:5);
   }else{
    if(a.phase==3&&elapsed>=a.abilityC&&a.shatters<2&&e.routeLength-e.distance>4)BeginCast(e,a,"shatter",1.2f,0);
    else if(a.phase>=2&&elapsed>=a.abilityB&&towers.Count>0)BeginCast(e,a,"breath",1.5f,4);
    else if(a.phase<3&&elapsed>=a.abilityA&&a.mantles<3&&e.shield<=0)BeginCast(e,a,"mantle",1.5f,7);
   }
  }
  void BeginCast(EnemyState e,Actor a,string kind,float windup,float duration){
   a.cast=kind;a.castEnd=elapsed+windup;e.ability=kind;e.castRemaining=windup;a.targets.Clear();
   if(kind=="root"||kind=="breath"){
    var candidates=new List<TowerState>(towers);candidates.Sort((x,y)=>FlatDistance(e.position,x.position).CompareTo(FlatDistance(e.position,y.position)));
    if(kind=="root"){foreach(var t in candidates)if(FlatDistance(e.position,t.position)<=4&&a.targets.Count<2)a.targets.Add(t.id);}
    else if(candidates.Count>0){a.castDirection=(candidates[0].position-e.position).normalized;foreach(var t in candidates){Vector3 delta=t.position-e.position;if(delta.magnitude<=3&&Vector3.Dot(a.castDirection,delta.normalized)>.72f&&a.targets.Count<3)a.targets.Add(t.id);}}
   }
   if(kind=="summon"||kind=="shatter"){a.reserved=3;pendingSummons+=3;}
   Vector3 target=e.position;int targetId=0;if(a.targets.Count>0){var t=towers.Find(x=>x.id==a.targets[0]);if(t!=null){target=t.position;targetId=t.id;}}
   Emit("telegraph",kind,e.position,target,e.id,targetId,duration:windup,value:duration);
   // Secondary target events add warnings without replaying the cast's source burst or audio.
   for(int i=1;i<a.targets.Count;i++){var t=towers.Find(x=>x.id==a.targets[i]);if(t!=null)Emit("telegraphTarget",kind,e.position,t.position,e.id,t.id,duration:windup,value:duration);}
  }
  void CancelCast(EnemyState e,Actor a){if(a.reserved>0){pendingSummons=Mathf.Max(0,pendingSummons-a.reserved);a.reserved=0;}a.cast="";e.castRemaining=0;}
  void CommitAbility(EnemyState e,Actor a){
   string kind=a.cast;a.cast="";e.castRemaining=0;float duration=0;Vector3 target=e.position;int targetId=0;
   switch(kind){
    case "bark":duration=5;a.armorUntil=elapsed+duration;a.abilityA=elapsed+duration+14;break;
    case "root":
     duration=3.5f;foreach(int id in a.targets){var t=towers.Find(x=>x.id==id);if(t!=null){t.slowFor=Mathf.Max(t.slowFor,duration);if(targetId==0){target=t.position;targetId=t.id;}}}
     if(a.targets.Count>0)blockers.Add(new BlockerState{id=nextId++,pad=-1,kind="root",position=e.position,hp=70,maxHp=70,ownerEnemy=e.id});
     a.abilityB=elapsed+duration+(a.phase==3?10:13);break;
    case "mist":duration=a.phase==3?3:5;a.veilUntil=elapsed+duration;a.abilityA=elapsed+duration+(a.phase>=2?14:16);break;
    case "summon":
     a.bogCalls++;for(int i=0;i<3;i++)Spawn("nibble",e.route,a.wave,true,Mathf.Min(e.distance,Mathf.Max(0,e.routeLength-4)));
     pendingSummons=Mathf.Max(0,pendingSummons-a.reserved);a.reserved=0;a.abilityB=elapsed+17;break;
    case "mantle":duration=7;a.mantles++;e.shield=360;e.maxShield=360;a.shieldUntil=elapsed+duration;a.abilityA=elapsed+duration+18;break;
    case "breath":
     duration=4;foreach(int id in a.targets){var t=towers.Find(x=>x.id==id);if(t!=null){t.disabledFor=Mathf.Max(t.disabledFor,duration);if(targetId==0){target=t.position;targetId=t.id;}}}
     a.abilityB=elapsed+duration+15;break;
    case "shatter":
     a.shatters++;for(int i=0;i<3;i++)Spawn("fragment",e.route,a.wave,true,Mathf.Min(e.distance+.4f+i*.35f,Mathf.Max(0,e.routeLength-3)));
     pendingSummons=Mathf.Max(0,pendingSummons-a.reserved);a.reserved=0;a.abilityC=elapsed+12;break;
   }
   a.activeUntil=elapsed+duration;e.ability=kind;e.abilityRemaining=duration;
   Emit("ability",kind,e.position,target,e.id,targetId,duration:Mathf.Max(.6f,duration));
   if(kind=="root"||kind=="breath")foreach(int id in a.targets)if(id!=targetId){var t=towers.Find(x=>x.id==id);if(t!=null)Emit("abilityTarget",kind,e.position,t.position,e.id,t.id,duration:duration);}
  }
  void TickTower(TowerState t,float dt){
   t.slowFor=Mathf.Max(0,t.slowFor-dt);t.disabledFor=Mathf.Max(0,t.disabledFor-dt);t.buff=0;
   if(auras.TryGetValue(t.id,out var aura)&&elapsed<aura.until)t.buff=aura.strength;
   float rate=(t.disabledFor>0?.5f:t.slowFor>0?.6f:1)*(1+t.buff);t.cooldown-=dt*rate;if(t.cooldown>0)return;
   var d=CarrotData.Tower(t.kind);int tier=t.tier-1;float range=d.range[tier];EnemyState target=null;BlockerState obstacle=null;
   if(selectionType=="enemy"){var focused=enemies.Find(x=>x.id==selectionId);if(Eligible(focused,d.air)&&FlatDistance(t.position,focused.position)<=range)target=focused;}
   if(selectionType=="blocker"){var focused=blockers.Find(x=>x.id==selectionId);if(focused!=null&&FlatDistance(t.position,focused.position)<=range)obstacle=focused;}
   if(target==null&&obstacle==null){
    float best=-1;foreach(var e in enemies)if(Eligible(e,d.air)&&FlatDistance(t.position,e.position)<=range){float score=e.distance/Mathf.Max(1,e.routeLength);if(score>best){best=score;target=e;}}
   }
   if(target==null&&obstacle==null)return;
   Vector3 point=target!=null?target.position:obstacle.position;t.aim=point;t.lastShot=elapsed;t.cooldown=d.interval[tier];
   if(t.kind=="starfruit"&&target!=null){
    var hits=new List<EnemyState>();foreach(var e in enemies)if(Eligible(e,true)&&FlatDistance(t.position,e.position)<=range)hits.Add(e);
    SortTargets(hits,selectionType=="enemy"?target.id:-1);
    int cap=3+tier;for(int i=0;i<Mathf.Min(cap,hits.Count);i++)Launch(t,hits[i].id,hits[i].position,d.damage[tier],false);
   }else if(t.kind=="thunder"&&target!=null){
    var targets=new List<EnemyState>();foreach(var e in enemies)if(Eligible(e,true)&&FlatDistance(t.position,e.position)<=range)targets.Add(e);SortTargets(targets,selectionType=="enemy"?target.id:-1);
    for(int i=0;i<Mathf.Min(3,targets.Count);i++)Launch(t,targets[i].id,targets[i].position,d.damage[tier],false);
   }else{
    float amount=d.damage[tier];if(t.kind=="prism"&&target!=null){if(!focusStates.TryGetValue(t.id,out var focus)){focus=new FocusState();focusStates[t.id]=focus;}if(focus.target!=target.id){focus.target=target.id;focus.hits=0;}float ramp=Mathf.Min(.5f,focus.hits*(.1f+tier*.025f));amount*=1+ramp;focus.hits++;Emit("ability","prismFocus",t.position,target.position,t.id,target.id,t.tier,ramp,.2f);}
    Launch(t,target!=null?target.id:-obstacle.id,point,amount,false);
   }
  }
  static bool Eligible(EnemyState e,bool air){return e!=null&&e.alive&&!e.hidden&&e.biteRemaining<=0&&(!e.air||air);}
  static void SortTargets(List<EnemyState> targets,int focusedId){targets.Sort((a,b)=>a.id==b.id?0:a.id==focusedId?-1:b.id==focusedId?1:(b.distance/b.routeLength).CompareTo(a.distance/a.routeLength));}
  static float FlatDistance(Vector3 a,Vector3 b){float x=a.x-b.x,z=a.z-b.z;return Mathf.Sqrt(x*x+z*z);}
  void Launch(TowerState t,int target,Vector3 to,float damage,bool returning){
   float travel=t.kind=="prism"?.16f:t.kind=="storm"?.14f:t.kind=="blossom"?.2f:t.kind=="thunder"?.7f:Mathf.Clamp(FlatDistance(t.position,to)/10,.18f,.7f);
   if(t.kind=="mortar")travel=.65f;
   projectiles.Add(new Projectile{kind=t.kind,source=t.id,target=target,tier=t.tier,damage=damage,remaining=travel,position=t.position,to=to,returning=returning});
   Emit("shot",t.kind,t.position,to,t.id,target,t.tier,damage,travel);
  }
  void ResolveProjectile(Projectile p){
   var target=p.target>0?enemies.Find(x=>x.id==p.target):null;
   var obstacle=p.target<0?blockers.Find(x=>x.id==-p.target):null;
   int tier=p.tier-1;var def=CarrotData.Tower(p.kind);
   if(p.kind=="mortar"){
    float radius=new float[]{.75f,.9f,1.05f,1.2f}[tier];
    foreach(var e in enemies.ToArray())if(Eligible(e,false)){float d=FlatDistance(e.position,p.to);if(d<=radius)Damage(e,p.damage*(d<=radius*.5f?1:.65f),false,p.kind,p.source);}
    if(obstacle!=null)DamageBlocker(obstacle,p.damage,p.kind,p.source);
    burns.Add(new BurnZone{source=p.source,tier=p.tier,position=p.to,radius=radius,dps=p.damage*(.1f+tier*.02f),remaining=2});
    Emit("ability","burn",p.to,p.to,p.source,p.target,p.tier,radius,2);
    Emit("impact",p.kind,p.to,p.to,p.source,p.target,p.tier,p.damage,.65f);return;
   }
   if(p.kind=="blossom"){
    foreach(var e in enemies.ToArray())if(Eligible(e,false)&&FlatDistance(e.position,p.position)<=def.range[tier])Damage(e,p.damage,true,p.kind,p.source);
    foreach(var b in blockers.ToArray())if(FlatDistance(b.position,p.position)<=def.range[tier])DamageBlocker(b,p.damage*.5f,p.kind,p.source);
    float strength=.1f+tier/3f*.1f;foreach(var t in towers)if(t.id!=p.source&&FlatDistance(t.position,p.position)<=def.range[tier]+.8f){if(!auras.TryGetValue(t.id,out var aura)){aura=new Aura();auras[t.id]=aura;}if(aura.until<elapsed||strength>=aura.strength){aura.strength=strength;aura.until=elapsed+3;}}
    Emit("ability","blossomBuff",p.position,p.position,p.source,tier:p.tier,value:strength,duration:3);
    Emit("impact",p.kind,p.position,p.position,p.source,p.target,p.tier,def.range[tier],.55f);return;
   }
   if(obstacle!=null){DamageBlocker(obstacle,p.damage*(p.kind=="frost"?.25f:1),p.kind,p.source);Emit("impact",p.kind,p.to,p.to,p.source,p.target,p.tier,p.damage,.35f);return;}
   if(!Eligible(target,def.air))return;
   Vector3 hit=target.position;
   if(p.kind=="storm"){
    var struck=new HashSet<int>();EnemyState current=target;float damage=p.damage;int count=tier<2?3:tier+2;
    for(int hop=0;hop<count&&current!=null;hop++){
     Vector3 at=current.position;struck.Add(current.id);Damage(current,damage,true,p.kind,p.source);actors[current.id].conductiveUntil=elapsed+2.5f+tier*.5f;Emit("ability","conductive",at,at,p.source,current.id,p.tier,.15f,2.5f+tier*.5f);
     Emit("impact",p.kind,at,at,p.source,current.id,p.tier,damage,.3f);
     EnemyState next=null;float best=1.5f+tier*.1f;foreach(var e in enemies)if(Eligible(e,true)&&!struck.Contains(e.id)){float d=FlatDistance(e.position,at);if(d<best){best=d;next=e;}}
     if(next!=null)Emit("shot",p.kind,at,next.position,p.source,next.id,p.tier,damage*.8f,.12f);
     current=next;damage*=.8f;
    }
    return;
   }
   if(p.kind=="gravity"){
    float radius=1.1f+tier*.2f;foreach(var e in enemies.ToArray())if(Eligible(e,false)&&FlatDistance(e.position,hit)<=radius){Damage(e,p.damage,true,p.kind,p.source);ApplySlow(e,.3f+tier*.05f,2.2f);var actor=actors[e.id];if(e.alive&&string.IsNullOrEmpty(e.boss)&&elapsed>=actor.gravityReady){e.distance=Mathf.Max(0,e.distance-(.35f+tier*.15f));actor.gravityReady=elapsed+4;actor.pullCenter=hit;actor.pullUntil=elapsed+.65f;}}
    Emit("ability","gravity",hit,hit,p.source,p.target,p.tier,radius,1.2f);
   }else if(p.kind=="thunder"){
    Damage(target,p.damage,true,p.kind,p.source);
    if(string.IsNullOrEmpty(target.boss)&&target.alive)actors[target.id].stunUntil=elapsed+.2f;
   }else if(p.kind=="frost"){
    float radius=tier==0?0:new float[]{0,.45f,.6f,.8f}[tier];
    foreach(var e in enemies.ToArray())if(Eligible(e,false)&&(e.id==target.id||(radius>0&&FlatDistance(e.position,hit)<=radius))){Damage(e,p.damage,true,p.kind,p.source);ApplySlow(e,new float[]{.3f,.36f,.42f,.48f}[tier],1.6f+tier*.2f);var actor=actors[e.id];if(e.alive&&string.IsNullOrEmpty(e.boss)&&elapsed>=actor.freezeAt){float hold=.4f+tier*.08f;actor.stunUntil=Mathf.Max(actor.stunUntil,elapsed+hold);actor.freezeAt=elapsed+4.5f;Emit("ability","crystallize",e.position,e.position,p.source,e.id,p.tier,0,hold);}}
   }else{
    Damage(target,p.damage,p.kind=="prism"||p.kind=="book",p.kind,p.source);
    if(p.kind=="seed"&&target.alive){var a=actors[target.id];a.seedMarks++;if(a.seedMarks>=3&&elapsed>=a.seedBurstAt){a.seedMarks=0;a.seedBurstAt=elapsed+1.2f;Damage(target,p.damage*(.45f+tier*.1f),false,"seedBurst",p.source);EnemyState bounce=null;float best=1.7f+tier*.1f;foreach(var e in enemies)if(e.id!=target.id&&Eligible(e,true)){float distance=FlatDistance(hit,e.position);if(distance<best){best=distance;bounce=e;}}if(bounce!=null){Damage(bounce,p.damage*.5f,false,"seedBurst",p.source);Emit("shot","seed",hit,bounce.position,p.source,bounce.id,p.tier,p.damage*.5f,.16f);}Emit("ability","seedBurst",hit,hit,p.source,target.id,p.tier,0,.4f);}}
    if(p.kind=="book"&&target.alive){var a=actors[target.id];if(string.IsNullOrEmpty(target.boss)&&elapsed>=a.rewindReady){a.rewindUntil=elapsed+1;a.rewindReady=elapsed+6;Vector3 direction;Vector3 end=CarrotData.RoutePoint(level.routes[target.route],Mathf.Max(0,target.distance-a.baseSpeed),out direction);Emit("ability","rewind",target.position,end,p.source,target.id,p.tier,1,1);}else if(!string.IsNullOrEmpty(target.boss))ApplySlow(target,.1f,.8f);}
    if(p.kind=="starfruit"&&!p.returning&&target.alive){
     projectiles.Add(new Projectile{kind=p.kind,source=p.source,target=p.target,tier=p.tier,damage=p.damage*.5f,remaining=.3f,position=p.position,to=hit,returning=true});
     Emit("shot",p.kind,hit,p.position,p.source,p.target,p.tier,p.damage*.5f,.3f);
    }
   }
   Emit("impact",p.kind,hit,hit,p.source,p.target,p.tier,p.damage,.45f);
  }
  void ApplySlow(EnemyState e,float amount,float duration){
   if(!e.alive)return;amount=Mathf.Min(amount,string.IsNullOrEmpty(e.boss)?.5f:.2f);float factor=1-amount;
   if(elapsed>=e.slowUntil){e.slowFactor=factor;e.slowUntil=elapsed+duration;}
   else if(factor<e.slowFactor){e.slowFactor=factor;e.slowUntil=elapsed+duration;}
   else if(Mathf.Abs(factor-e.slowFactor)<.001f)e.slowUntil=Mathf.Max(e.slowUntil,elapsed+duration);
  }
  void Damage(EnemyState e,float amount,bool elemental,string kind,int source){
   if(!e.alive||e.hidden||e.biteRemaining>0)return;var a=actors[e.id];
   if(elemental&&(kind=="storm"||kind=="thunder")&&elapsed<a.conductiveUntil)amount*=1.15f;
   if(!elemental){float armor=a.armor;if(elapsed<a.armorUntil)armor=Mathf.Max(armor,.35f);amount*=1-armor;}
   if(string.IsNullOrEmpty(e.boss))foreach(var boss in enemies)if(boss.alive&&boss.boss=="marsh"&&actors[boss.id].veilUntil>elapsed&&FlatDistance(e.position,boss.position)<=1.7f){amount*=.7f;break;}
   float oldShield=e.shield,hpDamage=amount;
   if(oldShield>0){float absorbed=Mathf.Min(oldShield,amount);e.shield-=absorbed;hpDamage=amount-absorbed;if(kind=="prism")hpDamage+=amount*.25f;}
   e.hp=Mathf.Max(0,e.hp-hpDamage);e.hitAt=elapsed;
   Emit("hit",kind,e.position,e.position,source,e.id,value:amount,duration:.16f);
   if(oldShield>0&&e.shield<=0){Emit("ability","shieldBreak",e.position,id:e.id,duration:.45f);if(e.kind=="crystal"){a.baseSpeed=1.2f;a.stunUntil=elapsed+.35f;}}
   if(e.hp<=0)ResolveEnemy(e,true);
  }
  void DamageBlocker(BlockerState b,float damage,string kind,int source){
   if(b==null||b.hp<=0)return;b.hp=Mathf.Max(0,b.hp-damage);Emit("hit",kind,b.position,b.position,source,-b.id,value:damage,duration:.12f);if(b.hp<=0)ClearBlocker(b,true);
  }
  void ClearBlocker(BlockerState b,bool reward){
   if(!blockers.Remove(b))return;if(reward){coins+=b.reward;TotalEarned+=b.reward;}
   if(b.ownerEnemy>0)foreach(var t in towers)t.slowFor=0;
   if(selectionType=="blocker"&&selectionId==b.id){selectionType="";selectionId=-1;}
   Emit("clear",b.kind,b.position,id:b.id,value:reward?b.reward:0,duration:.6f);
  }
  void UpdateProgress(){
   float done=resolvedWork;foreach(var e in enemies)if(e.alive&&!string.IsNullOrEmpty(e.boss)&&actors[e.id].work)done+=8*(1-e.hp/e.maxHp);
   progress=phase=="won"?1:Mathf.Clamp(done/Mathf.Max(1,totalWork),0,.99f);
  }
  void SetOutcome(bool won){
   if(phase!="playing")return;phase=won?"won":"lost";paused=false;nextWave=0;progress=won?1:progress;selectionType="";selectionId=-1;
   foreach(var e in enemies)if(e.alive)CancelCast(e,actors[e.id]);
   notice=won?"Garden protected":"Try again";noticeUntil=float.MaxValue;
   Emit(won?"victory":"defeat",level.biome,level.routes[0][level.routes[0].Length-1],value:health,duration:1.4f);Publish();
  }

  [Serializable] class SelectionDTO {public string type="",kind="";public int id=-1,tier,refund;public float hp,maxHp,x=.5f,y=.5f;}
  [Serializable] class MonsterDTO {public int id;public string kind;public float hp,maxHp,shield,maxShield,x,y;public bool visible;}
  [Serializable] class BossDTO {public int id,phase;public string kind,name,ability;public float hp,maxHp,shield,maxShield,castRemaining;}
  [Serializable] class StateDTO {public int level,wave,waves,coins,health,enemyCount,blockersRemaining,towerCount,cleared;public string name,biome,phase,notice;public float progress,speed,nextWave;public bool paused,muted;public SelectionDTO selection;public MonsterDTO[] monsters;}
  Vector2 ScreenPoint(Vector3 p){
   var view=GetComponent<CarrotView>();Camera cam=view!=null?view.GameCamera:null;
   if(cam==null)return new Vector2(Mathf.Clamp01((p.x+8)/16f),Mathf.Clamp01((p.z+6)/12f));
   var q=cam.WorldToViewportPoint(p);return new Vector2(q.x,1-q.y);
  }
  public string Snapshot(){
   var s=new SelectionDTO{type=selectionType,id=selectionId};Vector3 at=Vector3.zero;
   if(selectionType=="pad"&&selectionId>=0&&selectionId<level.pads.Length){at=level.pads[selectionId];s.kind="pad";}
   else if(selectionType=="tower") {var t=towers.Find(x=>x.id==selectionId);if(t!=null){at=t.position;s.kind=t.kind;s.tier=t.tier;s.refund=Mathf.FloorToInt(t.spent*.7f);}}
   else if(selectionType=="enemy"){var e=enemies.Find(x=>x.id==selectionId);if(e!=null){at=e.position;s.kind=e.kind;s.hp=e.hp;s.maxHp=e.maxHp;}}
   else if(selectionType=="blocker"){var b=blockers.Find(x=>x.id==selectionId);if(b!=null){at=b.position;s.kind=b.kind;s.hp=b.hp;s.maxHp=b.maxHp;}}
   var point=ScreenPoint(at+Vector3.up*.4f);s.x=point.x;s.y=point.y;
   var monsters=new List<MonsterDTO>();BossDTO boss=null;int alive=0;
   foreach(var e in enemies)if(e.alive){
    alive++;Vector2 p=ScreenPoint(e.position+Vector3.up*(string.IsNullOrEmpty(e.boss)?1.2f:2.1f));
    if(!string.IsNullOrEmpty(e.boss))boss=new BossDTO{id=e.id,kind=e.boss,name=CarrotData.BossName(e.boss),hp=e.hp,maxHp=e.maxHp,shield=e.shield,maxShield=e.maxShield,phase=e.phase,ability=e.ability??"",castRemaining=e.castRemaining};
    else monsters.Add(new MonsterDTO{id=e.id,kind=e.kind,hp=e.hp,maxHp=e.maxHp,shield=e.shield,maxShield=e.maxShield,x=p.x,y=p.y,visible=!e.hidden&&p.x>=0&&p.x<=1&&p.y>=0&&p.y<=1});
   }
   var state=new StateDTO{level=level.id,name=level.name,biome=level.biome,wave=wave,waves=level.waves,coins=coins,health=health,progress=progress,phase=phase,paused=paused,speed=speed,nextWave=nextWave,enemyCount=alive,selection=s,monsters=monsters.ToArray(),notice=notice,muted=muted,towerCount=towers.Count,cleared=level.blockers.Length-blockers.FindAll(b=>b.ownerEnemy==0).Count,blockersRemaining=blockers.FindAll(b=>b.ownerEnemy==0).Count};
   string json=JsonUtility.ToJson(state);return json.Substring(0,json.Length-1)+",\"boss\":"+(boss==null?"null":JsonUtility.ToJson(boss))+"}";
  }
  void Publish(){if(level==null)return;LastSnapshot=Snapshot();
#if UNITY_WEBGL && !UNITY_EDITOR
   if(EnableBridge)CarrotSend(LastSnapshot);
#endif
  }
#if UNITY_EDITOR
  public EnemyState TestSpawn(string kind,int route=0,float distance=0,bool boss=false){if(wave==0){wave=1;waveStarted[1]=true;}return Spawn(boss?"boss":kind,route,wave,false,distance);}
  public void TestDamage(int id,float amount,string kind="prism"){var e=enemies.Find(x=>x.id==id);if(e!=null)Damage(e,amount,true,kind,0);}
  public void TestFire(string kind,int tier,int target,Vector3 from){var e=enemies.Find(x=>x.id==target);if(e!=null)ResolveProjectile(new Projectile{kind=kind,tier=tier,target=target,source=999,position=from,to=e.position,damage=CarrotData.Tower(kind).damage[tier-1]});}
  public void TestDamageScenery(int id,float amount){var b=blockers.Find(x=>x.id==id);if(b!=null)DamageBlocker(b,amount,"prism",0);}
  public void TestClearScheduled(){spawns.Clear();for(int i=1;i<wavePending.Length;i++)wavePending[i]=0;wave=level.waves;waveStarted[wave]=true;}
#endif
 }
}
