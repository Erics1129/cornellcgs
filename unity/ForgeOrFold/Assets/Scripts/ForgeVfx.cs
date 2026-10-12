using System.Collections.Generic;
using UnityEngine;
using UnityEngine.Rendering;

// Owner: hot-metal-vfx. Strike particles, shards and coins. Moved verbatim from ForgeWorld.cs.
// Burst(at, count, type) and Puff(at, count, hot) are frozen signatures: other streams call them.
public partial class ForgeWorld {
 class Fragment {public GameObject root;public Renderer renderer;public Vector3 velocity,spin;public float life,maxLife,size;public bool coin;public Mesh mesh;public TrailRenderer trail;}
 readonly List<Fragment> fragments=new List<Fragment>();
 readonly Stack<Fragment> fragmentPool=new Stack<Fragment>();
 Material particleGold,particleIron,particleAsh,particleHot,sparkTrail;
 void MakeVfxMaterials(){
  sparkTrail=new Material(Shader.Find("Forge/Spark"));sparkTrail.SetColor("_Color",new Color(1,.68f,.23f,1));
  particleGold=Mat("Golden impact","fbc987",.75f,.7f);particleIron=Mat("Metal shards","9ba5ac",.9f,.6f);particleAsh=Mat("Dust","878778",0,.1f);particleHot=Mat("White orange embers","ffc680",.45f,.6f);
  foreach(var m in new[]{particleGold,particleHot}){m.EnableKeyword("_EMISSION");m.SetColor("_EmissionColor",m.color*2);}
 }
 void Burst(Vector3 at,int count,string type){for(int i=0;i<count&&fragments.Count<220;i++){bool shard=type=="shatter"||type=="chip",coin=type=="coin";float size=shard?UnityEngine.Random.Range(.016f,.065f):coin?.055f:UnityEngine.Random.Range(.003f,.009f);Fragment p;if(fragmentPool.Count>0){p=fragmentPool.Pop();p.root.SetActive(true);}else{var go=Box("Pooled impact fragment",Vector3.zero,Vector3.one,particleHot);p=new Fragment{root=go,renderer=go.GetComponent<Renderer>()};p.renderer.shadowCastingMode=ShadowCastingMode.Off;p.renderer.receiveShadows=false;p.trail=go.AddComponent<TrailRenderer>();p.trail.sharedMaterial=sparkTrail;p.trail.time=.16f;p.trail.minVertexDistance=.045f;p.trail.startWidth=.008f;p.trail.endWidth=0;p.trail.shadowCastingMode=ShadowCastingMode.Off;p.trail.receiveShadows=false;}p.trail.emitting=false;p.trail.Clear();p.renderer.SetPropertyBlock(null);p.root.GetComponent<MeshFilter>().sharedMesh=coin?CoinMesh():boxMesh;p.root.transform.position=at;p.trail.emitting=!reduced&&!shard&&!coin&&type!="dull";p.root.transform.rotation=UnityEngine.Random.rotation;p.root.transform.localScale=new Vector3(size,coin?size*.14f:shard?size*.2f:size*2.5f,size);p.renderer.sharedMaterial=type=="dull"?particleAsh:shard?particleIron:coin?brass:type=="perfect"?particleGold:particleHot;var vel=UnityEngine.Random.onUnitSphere*UnityEngine.Random.Range(.5f,2.7f);vel.y=Mathf.Abs(vel.y)+.25f;p.velocity=vel;p.spin=UnityEngine.Random.insideUnitSphere*430;p.life=UnityEngine.Random.Range(.65f,1.5f);p.maxLife=p.life;p.size=size;p.coin=coin;fragments.Add(p);}}
 void UpdateFragments(float dt){
  for(int i=fragments.Count-1;i>=0;i--){var p=fragments[i];p.life-=dt;if(p.life<=0){if(p.mesh){Destroy(p.mesh);p.mesh=null;}p.trail.emitting=false;p.trail.Clear();p.root.SetActive(false);fragmentPool.Push(p);fragments.RemoveAt(i);continue;}if(p.coin&&p.life<.65f){var goal=cam.ViewportToWorldPoint(new Vector3(.58f,.95f,.7f));p.velocity=Vector3.Lerp(p.velocity,(goal-p.root.transform.position)*10,1-Mathf.Exp(-dt*12));}else p.velocity.y-=dt*8;p.root.transform.position+=p.velocity*dt;var pos=p.root.transform.position;float ground=Mathf.Abs(pos.x)<.7f&&Mathf.Abs(pos.z+.4f)<.32f?1.025f:(pos.z>-.65f?.91f:.015f);if(pos.y<ground){pos.y=ground;p.root.transform.position=pos;p.velocity.y=Mathf.Abs(p.velocity.y)*.3f;p.velocity.x*=.76f;p.velocity.z*=.76f;}p.root.transform.Rotate(p.spin*dt);if(p.life<.3f)p.root.transform.localScale*=Mathf.Exp(-dt*7);}
 }
 /// Contact-frame effects for a hit. b is null when the knife is gone (Shatter).
 void ImpactFx(ForgeEvent e,Body b,Vector3 contact){
  Burst(contact,reduced?5:e.outcome=="shatter"?12:e.outcome=="perfect"?110:e.outcome=="dull"?0:e.outcome=="chip"?6:56,e.outcome);
  if(e.outcome=="chip")Burst(contact,18,"good");Puff(contact,e.outcome=="dull"?6:e.outcome=="shatter"?9:3,e.outcome=="perfect"||e.outcome=="good");
  if(b!=null)b.heat=Mathf.Max(b.heat,e.outcome=="perfect"?.62f:.32f);
 }
 /// A level gain crossed an evolution stage.
 void EvolutionFx(Body b){b.evolution=1.5f;Burst(b.target,65,"perfect");}
 /// Called on every Sync for each knife: risk = next-hit shatter probability (anvil knife), else 0.
 void TensionFx(Body b,float risk){}
 /// Called by Sync when snapshot.day changes.
 void DayFx(int day){}
 /// Live particles plus shards.
 int FxParticleCount()=>fragments.Count;
}
