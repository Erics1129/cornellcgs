using System;
using System.Collections.Generic;
using UnityEngine;

namespace CarrotTD {
 // Presentation only. Combat and arrival timing remain authoritative in CarrotGame.
 public sealed class CarrotEffects : MonoBehaviour {
  sealed class Fx { public GameObject root; public float age,life; public Action<float> update; public ParticleSystem particles; public Mesh mesh; }
  readonly List<Fx> active=new List<Fx>();
  readonly Dictionary<string,Material> materials=new Dictionary<string,Material>();
  public Action<float> CameraImpulse;
  Texture2D atlas;float clock;readonly Dictionary<int,float> chargedAt=new Dictionary<int,float>();
  public static Color Tone(string kind) {
   switch(kind){case "frost":case "mantle":case "breath":case "shatter":return new Color(.35f,.8f,1f);case "prism":return new Color(.82f,.63f,1f);case "storm":case "thunder":return new Color(.56f,.75f,1f);case "gravity":return new Color(.63f,.28f,1f);case "blossom":case "root":return new Color(.58f,1f,.34f);case "book":case "mist":case "summon":case "marsh":return new Color(.3f,1f,.78f);default:return new Color(1f,.68f,.2f);}
  }
  void Awake(){atlas=Resources.Load<Texture2D>("Carrot/Textures/VfxAtlas");}
  Material Mat(Color color,bool soft=false,bool flipbook=false){string key=color.ToString()+soft+flipbook;if(materials.TryGetValue(key,out var m))return m;m=new Material(Shader.Find("Carrot/Glow"));m.SetColor("_Color",color);m.SetFloat("_Soft",soft?1:0);if(flipbook&&atlas!=null){m.SetTexture("_MainTex",atlas);m.SetFloat("_UseAtlas",1);m.SetFloat("_Soft",0);}materials[key]=m;return m;}
  public void Clear(){foreach(var f in active){if(f.root!=null)Destroy(f.root);if(f.mesh!=null)Destroy(f.mesh);}active.Clear();chargedAt.Clear();clock=0;}
  void OnDestroy(){Clear();foreach(var m in materials.Values)Destroy(m);materials.Clear();}
  public void Tick(float dt){if(dt<=0)return;clock+=dt;for(int i=active.Count-1;i>=0;i--){Fx f=active[i];f.age+=dt;if(f.root==null||f.age>=f.life){if(f.root!=null)Destroy(f.root);if(f.mesh!=null)Destroy(f.mesh);active.RemoveAt(i);continue;}if(f.particles!=null)f.particles.Simulate(dt,true,false,true);f.update?.Invoke(f.age/f.life);}}
  GameObject Root(string name,Vector3 p){var go=new GameObject(name);go.transform.SetParent(transform,false);go.transform.position=p;return go;}
  void Keep(GameObject go,float life,Action<float> update=null,ParticleSystem particles=null,Mesh mesh=null){if(active.Count>180){var oldest=active[0];if(oldest.root!=null)Destroy(oldest.root);if(oldest.mesh!=null)Destroy(oldest.mesh);active.RemoveAt(0);}active.Add(new Fx{root=go,life=life,update=update,particles=particles,mesh=mesh});}
  LineRenderer Line(GameObject go,Color color,float width,bool loop=false){var l=go.AddComponent<LineRenderer>();l.sharedMaterial=Mat(Color.white);l.startColor=l.endColor=color;l.useWorldSpace=true;l.widthMultiplier=width;l.numCapVertices=3;l.numCornerVertices=2;l.loop=loop;l.shadowCastingMode=UnityEngine.Rendering.ShadowCastingMode.Off;l.receiveShadows=false;return l;}
  public void Ring(Vector3 p,Color color,float radius,float life,float width=.035f){var go=Root("Ripple",p);var l=Line(go,color,width,true);l.positionCount=65;Keep(go,life,t=>{float r=radius*(.2f+.8f*t);for(int i=0;i<65;i++){float a=i*Mathf.PI*2/64;l.SetPosition(i,p+new Vector3(Mathf.Cos(a)*r,.04f,Mathf.Sin(a)*r));}Color c=color;c.a=(1-t)*(1-t);l.startColor=l.endColor=c;l.widthMultiplier=width*(1-.65f*t);});}
  public void Burst(Vector3 p,Color color,int count,float size,float life,float speed=1.2f,int row=-1,Vector3 direction=default(Vector3),bool dust=false){
   var go=Root("Impact motes",p);var ps=go.AddComponent<ParticleSystem>();ps.Stop(true,ParticleSystemStopBehavior.StopEmittingAndClear);var main=ps.main;main.loop=false;main.playOnAwake=false;main.duration=life;main.startLifetime=new ParticleSystem.MinMaxCurve(life*.48f,life);main.startSpeed=new ParticleSystem.MinMaxCurve(speed*.35f,speed);main.startSize=new ParticleSystem.MinMaxCurve(size*.45f,size);main.startColor=color;main.gravityModifier=direction==Vector3.zero?.25f:0;main.simulationSpace=ParticleSystemSimulationSpace.World;main.maxParticles=Mathf.Min(count,90);var emission=ps.emission;emission.enabled=false;var shape=ps.shape;shape.enabled=true;shape.shapeType=direction==Vector3.zero?ParticleSystemShapeType.Sphere:ParticleSystemShapeType.Cone;shape.radius=.04f;shape.angle=15;if(direction!=Vector3.zero)go.transform.rotation=Quaternion.LookRotation(direction);
   var colorLife=ps.colorOverLifetime;colorLife.enabled=true;var g=new Gradient();g.SetKeys(new[]{new GradientColorKey(Color.white,0),new GradientColorKey(Color.white,1)},new[]{new GradientAlphaKey(0,0),new GradientAlphaKey(1,.12f),new GradientAlphaKey(.75f,.55f),new GradientAlphaKey(0,1)});colorLife.color=g;
   var sizeLife=ps.sizeOverLifetime;sizeLife.enabled=true;sizeLife.size=new ParticleSystem.MinMaxCurve(1,new AnimationCurve(new Keyframe(0,.35f),new Keyframe(.18f,1),new Keyframe(1,.15f)));
   var r=ps.GetComponent<ParticleSystemRenderer>();r.sharedMaterial=dust?DustMaterial():Mat(Color.white,true,row>=0);r.renderMode=ParticleSystemRenderMode.Billboard;r.shadowCastingMode=UnityEngine.Rendering.ShadowCastingMode.Off;
   if(row>=0&&atlas!=null){var sheet=ps.textureSheetAnimation;sheet.enabled=true;sheet.numTilesX=4;sheet.numTilesY=4;sheet.animation=ParticleSystemAnimationType.SingleRow;sheet.rowMode=ParticleSystemAnimationRowMode.Custom;sheet.rowIndex=Mathf.Clamp(row,0,3);sheet.frameOverTime=new ParticleSystem.MinMaxCurve(1,AnimationCurve.Linear(0,0,1,1));}
   ps.Emit(count);ps.Pause();Keep(go,life+.08f,null,ps);
  }
  Material DustMaterial(){if(materials.TryGetValue("lit-dust",out var material))return material;material=new Material(Shader.Find("Carrot/Dust"));materials["lit-dust"]=material;return material;}
  Material Surface(string key,Color color){if(materials.TryGetValue("surface-"+key,out var material))return material;material=new Material(Shader.Find("Carrot/Storybook"));material.color=color;material.SetFloat("_Glossiness",.4f);material.SetFloat("_Metallic",key=="mortar"?.3f:0);materials["surface-"+key]=material;return material;}
  void After(float delay,Action action){bool done=false;var go=Root("Effect timing",Vector3.zero);Keep(go,delay+.08f,t=>{if(!done&&t*(delay+.08f)>=delay){done=true;action();}});}
  void Charge(Vector3 from,Color color,float duration){var go=Root("Storm charge",from);var sphere=CarrotMeshes.Create(PrimitiveType.Sphere,"Effect body");Destroy(sphere.GetComponent<Collider>());sphere.transform.SetParent(go.transform,false);sphere.GetComponent<Renderer>().sharedMaterial=Mat(color);Keep(go,duration,t=>{sphere.transform.localScale=Vector3.one*(.055f+Mathf.Pow(t,2)*.22f);});Burst(from,color,5,.07f,duration,.14f);}
  void Bolt(Vector3 from,Vector3 to,Color color,float width,float life,int branches=0){var go=Root("Lightning",Vector3.zero);var line=Line(go,color,width);int n=12;line.positionCount=n;var points=new Vector3[n];Vector3 axis=Vector3.Cross((to-from).normalized,Vector3.up);if(axis.sqrMagnitude<.01f)axis=Vector3.right;for(int i=0;i<n;i++){float t=i/(float)(n-1);float wiggle=(i==0||i==n-1)?0:Mathf.Sin(i*13.29f+from.x*5)*.16f;points[i]=Vector3.Lerp(from,to,t)+axis*wiggle+Vector3.up*Mathf.Sin(i*7.3f)*Mathf.Sin(t*Mathf.PI)*.08f;}line.SetPositions(points);Keep(go,life,t=>{Color c=color;c.a=(1-t)*(.75f+.25f*Mathf.Sin(t*60));line.startColor=line.endColor=c;line.widthMultiplier=width*(1-t*.7f);});if(branches>0){for(int j=0;j<branches;j++){Vector3 start=points[3+j*2];Vector3 end=start+axis*(j%2==0?.35f:-.35f)+Vector3.down*.2f;Bolt(start,end,color*.8f,width*.5f,life*.75f);}}}
  public void Projectile(string kind,Vector3 from,Vector3 to,int tier,float life){Color c=Tone(kind);tier=Mathf.Clamp(tier,1,4);life=Mathf.Clamp(life,.08f,1.6f);
   if(kind=="prism"){Bolt(from,to,c,.025f+tier*.01f,.22f);return;}if(kind=="thunder"){Charge(from,c,life);return;}if(kind=="storm"){Bolt(from,to,c,.034f+tier*.008f,.22f,1);return;}
   if(kind=="blossom"){Ring(from-new Vector3(0,from.y-.12f,0),c,1.6f+tier*.22f,.48f,.055f);Burst(from,c,9+tier*3,.15f,.5f,1,2);return;}
   if(kind=="gravity"){Bolt(from,to,c,.028f,.23f);return;}
   var go=Root("Projectile "+kind,from);var orb=CarrotMeshes.Create(PrimitiveType.Sphere,"Effect body");Destroy(orb.GetComponent<Collider>());orb.transform.SetParent(go.transform,false);float radius=kind=="mortar"?.13f+tier*.025f:kind=="starfruit"?.12f:.055f+tier*.008f;orb.transform.localScale=Vector3.one*radius;orb.GetComponent<Renderer>().sharedMaterial=kind=="seed"?Surface("seed",new Color(.45f,.27f,.09f)):kind=="mortar"?Surface("mortar",new Color(.24f,.19f,.10f)):Mat(c);if(kind=="mortar")Burst(from,new Color(.5f,.43f,.32f,.35f),6,.21f,.5f,.4f,dust:true);var trailObj=new GameObject("Comet trail");trailObj.transform.SetParent(go.transform,false);var trail=Line(trailObj,c,kind=="mortar"?.095f:.035f+tier*.006f);trail.positionCount=7;
   Vector3 middle=(from+to)*.5f+Vector3.up*(kind=="mortar"?1.6f:kind=="book"?.7f:.12f);
   Func<float,Vector3> point=t=>Vector3.Lerp(Vector3.Lerp(from,middle,t),Vector3.Lerp(middle,to,t),t);
   Keep(go,life,t=>{go.transform.position=point(t);orb.transform.localRotation=Quaternion.Euler(t*580,t*380,t*270);for(int j=0;j<7;j++)trail.SetPosition(j,point(Mathf.Clamp01(t-j*.025f)));Color tail=c;tail.a=0;trail.startColor=c;trail.endColor=tail;});
   if(kind=="starfruit"){orb.transform.localScale=new Vector3(radius*2,.025f,radius*2);var arms=new GameObject("Five star rays");arms.transform.SetParent(go.transform,false);var l=Line(arms,c,.025f);l.useWorldSpace=false;l.loop=true;l.positionCount=10;for(int n=0;n<10;n++){float a=n*Mathf.PI/5;float r=n%2==0?.18f:.075f;l.SetPosition(n,new Vector3(Mathf.Cos(a)*r,0,Mathf.Sin(a)*r));}}
  }
  void Gravity(Vector3 p,int tier,float duration=1.2f,float radius=1.2f){var go=Root("Gravity lens",p+Vector3.up*.28f);var core=CarrotMeshes.Create(PrimitiveType.Sphere,"Effect body");Destroy(core.GetComponent<Collider>());core.transform.SetParent(go.transform,false);if(!materials.TryGetValue("black-core",out var dark)){dark=new Material(Shader.Find("Carrot/Storybook"));dark.color=new Color(.004f,.002f,.008f);dark.SetFloat("_Metallic",0);dark.SetFloat("_Glossiness",0);materials["black-core"]=dark;}core.GetComponent<Renderer>().sharedMaterial=dark;core.transform.localScale=Vector3.one*.22f;var ringObj=new GameObject("Accretion ring");ringObj.transform.SetParent(go.transform,false);var ring=Line(ringObj,Tone("gravity"),.06f,true);ring.positionCount=48;var spirals=new LineRenderer[3];for(int s=0;s<3;s++){var sp=new GameObject("Inward spiral");sp.transform.SetParent(go.transform,false);spirals[s]=Line(sp,new Color(.7f,.4f,1,.65f),.025f);spirals[s].positionCount=30;}Keep(go,duration,t=>{float scale=Mathf.Min(1,t*7)*Mathf.Min(1,(1-t)*7);core.transform.localScale=Vector3.one*(.25f+tier*.045f)*scale;for(int n=0;n<48;n++){float a=n*Mathf.PI*2/48+t*9;ring.SetPosition(n,go.transform.position+new Vector3(Mathf.Cos(a)*.55f,Mathf.Sin(a*3+t*5)*.06f,Mathf.Sin(a)*.28f)*scale);}for(int s=0;s<3;s++)for(int n=0;n<30;n++){float f=n/29f,a=f*Mathf.PI*4-t*12+s*Mathf.PI*2/3;float r=radius*(1-f)*scale;spirals[s].SetPosition(n,go.transform.position+new Vector3(Mathf.Cos(a)*r,.08f+f*.2f,Mathf.Sin(a)*r));}Color c=Tone("gravity");c.a=scale;ring.startColor=ring.endColor=c;});Burst(p,Tone("gravity"),14,.12f,duration,.25f,3);}
  void Rewind(Vector3 from,Vector3 to,float duration){Color c=new Color(.6f,.98f,.9f);Bolt(from+Vector3.up*.6f,to+Vector3.up*.6f,c,.045f,duration);for(int i=0;i<3;i++)Ring(Vector3.Lerp(from,to,i*.5f),c,.38f,duration,.027f);var go=Root("Clock rewind",from+Vector3.up*.8f);var clock=Line(go,c,.027f,true);clock.positionCount=41;var handGo=new GameObject("Clock hands");handGo.transform.SetParent(go.transform,false);var hand=Line(handGo,c,.035f);hand.positionCount=3;Keep(go,duration,t=>{Vector3 center=Vector3.Lerp(from,to,t)+Vector3.up*.8f;for(int i=0;i<41;i++){float a=i*Mathf.PI*2/40;clock.SetPosition(i,center+new Vector3(Mathf.Cos(a)*.24f,Mathf.Sin(a)*.24f,0));}float angle=-t*Mathf.PI*5;hand.SetPosition(0,center+new Vector3(Mathf.Cos(angle)*.19f,Mathf.Sin(angle)*.19f,0));hand.SetPosition(1,center);hand.SetPosition(2,center+new Vector3(Mathf.Cos(angle*.5f)*.12f,Mathf.Sin(angle*.5f)*.12f,0));Color faded=c;faded.a=Mathf.Min(1,(1-t)*3);clock.startColor=clock.endColor=hand.startColor=hand.endColor=faded;});Burst(from+Vector3.up*.4f,c,9,.18f,duration,.35f,3);}
  public void Echo(GameObject actor,Vector3 from,Vector3 to,float duration){
   var parts=new List<CombineInstance>();var baked=new List<Mesh>();
   foreach(var r in actor.GetComponentsInChildren<Renderer>()){
    if(!r.enabled||!r.gameObject.activeInHierarchy||r.name=="Contact shadow")continue;Mesh mesh=null;
    if(r is SkinnedMeshRenderer skin){mesh=new Mesh();skin.BakeMesh(mesh);baked.Add(mesh);}
    else{var filter=r.GetComponent<MeshFilter>();if(filter!=null)mesh=filter.sharedMesh;}
    if(mesh==null||!mesh.isReadable)continue;for(int i=0;i<mesh.subMeshCount;i++)parts.Add(new CombineInstance{mesh=mesh,subMeshIndex=i,transform=Matrix4x4.Translate(-from)*r.localToWorldMatrix});
   }
   if(parts.Count==0)return;
   var combined=new Mesh{name="Rewind silhouette",indexFormat=UnityEngine.Rendering.IndexFormat.UInt32};combined.CombineMeshes(parts.ToArray(),true,true);foreach(var m in baked)Destroy(m);
   var go=Root("Rewinding echoes",from);var ghosts=new Renderer[3];var states=new MaterialPropertyBlock[3];
   for(int i=0;i<3;i++){var ghost=new GameObject("Time echo");ghost.transform.SetParent(go.transform,false);ghost.AddComponent<MeshFilter>().sharedMesh=combined;ghosts[i]=ghost.AddComponent<MeshRenderer>();ghosts[i].sharedMaterial=Mat(Color.white);ghosts[i].shadowCastingMode=UnityEngine.Rendering.ShadowCastingMode.Off;ghosts[i].receiveShadows=false;states[i]=new MaterialPropertyBlock();}
   Keep(go,Mathf.Clamp(duration,.5f,1.8f),t=>{for(int i=0;i<3;i++){float trail=Mathf.Clamp01(t-(i+1)*.13f);ghosts[i].transform.position=Vector3.Lerp(from,to,trail);Color c=new Color(.35f,.9f,.83f,.24f*(1-i*.2f)*Mathf.Sin(t*Mathf.PI));states[i].SetColor("_Color",c);ghosts[i].SetPropertyBlock(states[i]);}},mesh:combined);
  }
  public void Handle(CarrotEvent e){Color c=Tone(e.kind);switch(e.type){
   case "shot":if(e.kind!="thunder"||!chargedAt.TryGetValue(e.id,out var lastCharge)||clock-lastCharge>.25f){if(e.kind=="thunder")chargedAt[e.id]=clock;Projectile(e.kind,e.position+Vector3.up*.72f,e.to+Vector3.up*.28f,e.tier,e.duration);}break;
   case "impact":{
    Vector3 at=e.to==Vector3.zero?e.position:e.to;
    int row=e.kind=="frost"?1:e.kind=="blossom"?2:e.kind=="gravity"||e.kind=="book"?3:0;
    Burst(at+Vector3.up*.18f,c,5+e.tier*2,e.kind=="mortar"?.19f:.12f,e.kind=="mortar"?.6f:.32f,e.kind=="mortar"?1.7f:.9f,row);
    if(e.kind=="thunder"){Bolt(at+Vector3.up*4.5f,at+Vector3.up*.2f,c,.075f+e.tier*.015f,.3f,3);Bolt(at+Vector3.up*4.5f,at+Vector3.up*.2f,new Color(.86f,.94f,1),.025f,.16f);Ring(at,c,.56f,.32f,.025f);Burst(at+Vector3.up*.1f,new Color(.37f,.4f,.45f,.5f),8,.34f,.9f,.55f,dust:true);CameraImpulse?.Invoke(.025f);}
    else if(e.kind=="mortar"){Ring(at,c,.65f+e.tier*.12f,.4f,.035f);Burst(at+Vector3.up*.25f,new Color(1,.94f,.69f),5,.18f,.15f,.45f);Burst(at+Vector3.up*.15f,new Color(.49f,.39f,.27f,.62f),15,.54f,1.4f,.7f,dust:true);After(.12f,()=>Burst(at+Vector3.up*.22f,new Color(1,.42f,.09f,.8f),13,.065f,1.0f,1.2f));CameraImpulse?.Invoke(.035f);}
    else if(e.kind=="seed"||e.kind=="starfruit")Burst(at+Vector3.up*.18f,new Color(.6f,.48f,.25f,.42f),4,.17f,.55f,.55f,dust:true);
    break;}

   case "hit":Burst(e.position+Vector3.up*.35f,new Color(1,.86f,.6f),3,.08f,.24f,.6f);break;
   case "heal":Burst(e.position+Vector3.up*.55f,Tone("blossom"),7,.16f,.65f,.5f,2,Vector3.up);break;
   case "death":Burst(e.position+Vector3.up*.12f,new Color(.55f,.46f,.32f,.45f),8,.32f,.95f,.5f,dust:true);Burst(e.position+Vector3.up*.25f,e.kind=="crystal"?Tone("frost"):new Color(1,.8f,.35f),10,.13f,.65f,1.1f,e.kind=="crystal"?1:0);break;
   case "build":case "upgrade":Ring(e.position,new Color(1,.81f,.32f),.8f,1.1f,.045f);Burst(e.position+Vector3.up*.4f,new Color(1,.84f,.43f),24,.14f,1.2f,1.3f,0,Vector3.up);break;
   case "sell":Burst(e.position+Vector3.up*.2f,new Color(1,.85f,.37f),12,.12f,.7f,1);break;
   case "clear":Burst(e.position+Vector3.up*.22f,e.kind=="root"?Tone("root"):new Color(.8f,.68f,.38f),17,.14f,.75f,1.3f);break;
   case "carrotHit":Burst(e.position+Vector3.up*.6f,new Color(1,.48f,.14f),9,.12f,.5f,.9f);Ring(e.position,new Color(1,.28f,.12f),.7f,.35f);CameraImpulse?.Invoke(.065f);break;
   case "bossEnter":Burst(e.position+Vector3.up*.14f,new Color(.43f,.42f,.38f,.65f),25,.65f,2,.8f,dust:true);Ring(e.position,Tone(e.kind),2,1.8f,.085f);Burst(e.position+Vector3.up*.6f,Tone(e.kind),30,.25f,1.8f,1.4f,e.kind=="frost"?1:e.kind=="marsh"?3:2,Vector3.up);CameraImpulse?.Invoke(.12f);break;
   case "telegraph":Telegraph(e);break;
   case "telegraphTarget":TargetWarning(e);break;
   case "abilityTarget":TargetAbility(e);break;
   case "ability":Ability(e);break;
   case "victory":Ring(e.position,new Color(1,.86f,.4f),2.4f,2,.065f);Burst(e.position+Vector3.up*.7f,new Color(1,.87f,.5f),65,.2f,2.8f,2.4f,0,Vector3.up);break;
   case "defeat":Ring(e.position,new Color(.46f,.53f,.72f),1.5f,1.2f);break;
  }}
  void TargetWarning(CarrotEvent e){
   // Each locked tower gets its own countdown; the boss source cue plays once.
   Color color=Tone(e.kind);float duration=Mathf.Max(.35f,e.duration);var go=Root("Locked tower warning",e.to);var line=Line(go,color,.028f,true);line.positionCount=49;
   Keep(go,duration,t=>{float radius=.47f+.09f*(1-t);for(int i=0;i<49;i++){float angle=i*Mathf.PI*2/48;line.SetPosition(i,e.to+new Vector3(Mathf.Cos(angle)*radius,.085f,Mathf.Sin(angle)*radius));}Color c=color;c.a=.25f+.45f*t;line.startColor=line.endColor=c;});
  }
  void TargetAbility(CarrotEvent e){
   if(e.kind=="root")Ability(e);
   else if(e.kind=="breath"){Ring(e.to,Tone("frost"),.60f,.65f,.026f);Burst(e.to+Vector3.up*.5f,new Color(.56f,.81f,1,.55f),12,.20f,.8f,.45f,1,Vector3.up);}
  }
  void Telegraph(CarrotEvent e){if(e.kind=="root"||e.kind=="breath")TargetWarning(e);Color c=Tone(e.kind);float duration=Mathf.Max(.6f,e.duration);Ring(e.position,c,e.kind=="breath"?1.3f:.9f,duration,.035f);Burst(e.position+Vector3.up*.7f,c,13,.14f,duration,.3f,e.kind=="breath"||e.kind=="mantle"?1:3,Vector3.up);if(e.to!=Vector3.zero&&Vector3.Distance(e.position,e.to)>.2f){var go=Root("Ability direction",Vector3.zero);var l=Line(go,c,.028f);l.positionCount=2;l.SetPosition(0,e.position+Vector3.up*.06f);l.SetPosition(1,e.to+Vector3.up*.06f);Keep(go,duration,t=>{Color color=c;color.a=.25f+.45f*t;l.startColor=l.endColor=color;});}}
  void Ability(CarrotEvent e){Color c=Tone(e.kind);switch(e.kind){
   case "gravity":Gravity(e.position,e.tier,Mathf.Max(.6f,e.duration),Mathf.Max(.8f,e.value));break;
   case "rewind":Rewind(e.position,e.to,Mathf.Max(.5f,e.duration));break;
   case "seedBurst":Ring(e.position,Tone("seed"),.65f,.35f,.05f);Burst(e.position+Vector3.up*.35f,Tone("seed"),17,.16f,.5f,1.5f,0);break;
   case "crystallize":case "shieldBreak":for(int i=0;i<3;i++)Ring(e.position+Vector3.up*(.15f+i*.2f),Tone("frost"),.32f,Mathf.Max(.4f,e.duration),.03f);Burst(e.position+Vector3.up*.4f,Tone("frost"),12,.2f,.5f,.45f,1);break;
   case "burn":Ring(e.position,new Color(1,.35f,.07f,.45f),Mathf.Max(.5f,e.value),Mathf.Max(.6f,e.duration),.04f);Burst(e.position+Vector3.up*.12f,new Color(1,.43f,.1f,.6f),22,.17f,Mathf.Max(.7f,e.duration),.25f,0,Vector3.up);break;
   case "prismFocus":Bolt(e.position+Vector3.up*1.1f,e.to+Vector3.up*.4f,new Color(.8f,.65f,1),.022f+Mathf.Clamp01(e.value)*.06f,.25f);break;
   case "conductive":Ring(e.position,new Color(.44f,.73f,1,.5f),.35f,Mathf.Min(1.1f,e.duration),.025f);break;
   case "blossomBuff":Ring(e.position,new Color(1,.78f,.32f,.55f),2.6f,1.2f,.03f);Burst(e.position+Vector3.up*.5f,new Color(1,.81f,.42f),12,.15f,1.1f,.55f,2,Vector3.up);break;
   case "phase":Ring(e.position,new Color(1,.63f,.24f),1.5f,.8f,.06f);CameraImpulse?.Invoke(.055f);break;
   case "burrow":case "emerge":Burst(e.position+Vector3.up*.1f,new Color(.64f,.46f,.24f),12,.10f,.5f,1);break;
   case "root":{Vector3 end=e.to==Vector3.zero?e.position:e.to;for(int v=0;v<3;v++){var go=Root("Root snare",Vector3.zero);var l=Line(go,new Color(.43f,.85f,.21f),.045f);l.positionCount=25;int strand=v;Keep(go,Mathf.Clamp(e.duration,.8f,3.5f),t=>{for(int n=0;n<25;n++){float f=n/24f;float angle=f*Mathf.PI*5+strand*2.1f;l.SetPosition(n,Vector3.Lerp(e.position,end,f)+new Vector3(Mathf.Sin(angle)*.1f,Mathf.Sin(f*Mathf.PI)*.16f+.07f,Mathf.Cos(angle)*.1f));}Color col=c;col.a=Mathf.Min(1,(1-t)*4);l.startColor=l.endColor=col;});}Burst(end+Vector3.up*.2f,c,20,.18f,.8f,.8f,2);break;}
   case "mist":Burst(e.position+Vector3.up*.5f,new Color(.3f,.86f,.78f,.38f),30,.75f,3.5f,.35f,3);Ring(e.position,c,1.7f,1.2f,.04f);break;
   case "summon":for(int i=0;i<3;i++){Vector3 p=e.position+new Vector3((i-1)*.65f,0,.3f);Ring(p,c,.45f,1.4f,.05f);Burst(p,c,10,.2f,1.1f,1,3,Vector3.up);}break;
   case "breath":{Vector3 d=(e.to-e.position);if(d.sqrMagnitude<.1f)d=Vector3.forward;d.y=0;Burst(e.position+Vector3.up*1.4f,new Color(.54f,.84f,1,.85f),65,.32f,1.4f,3.2f,1,d.normalized);Ring(e.to,c,1.1f,.7f);break;}
   case "mantle":for(int i=0;i<3;i++)Ring(e.position+Vector3.up*(i*.4f+.15f),c,.65f,1.7f,.055f);Burst(e.position+Vector3.up*.9f,c,25,.22f,1.5f,.7f,1);break;
   case "shatter":Burst(e.position+Vector3.up*1.2f,c,55,.3f,1.3f,2.3f,1);Ring(e.position,c,2,1,.07f);CameraImpulse?.Invoke(.08f);break;
   case "bark":Burst(e.position+Vector3.up*.8f,new Color(.67f,.83f,.32f),22,.13f,1.1f,.9f,2);break;
   case "heal":Ring(e.position,Tone("blossom"),1.5f,.7f);Burst(e.position+Vector3.up*.65f,Tone("blossom"),12,.17f,.8f,.4f,2,Vector3.up);break;
   default:Ring(e.position,c,1,.7f);break;
  }}
 }
}
