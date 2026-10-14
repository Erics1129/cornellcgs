using System;
using System.Collections.Generic;
using UnityEngine;

namespace CarrotTD {
 /// <summary>
 /// Optional licensed particle layer. Original Carrot effects are always authoritative and always retained.
 /// Only an audited private Library.asset enables it; no vendor asset is assumed or substituted.
 /// Source scripts/animators/audio/trail renderers are rejected, not run and then destroyed.
 /// </summary>
 public sealed partial class CarrotLicensedFx : MonoBehaviour {
  sealed class Slot {
   public GameObject go;public Transform transform,follow;public ParticleSystem[] roots,systems;
   public CarrotLicensedFxLibrary.Effect effect;public float age,life;public int particles;public bool active;
   public Vector3 offset;public Quaternion restRotation;
  }
  readonly List<Slot> slots=new List<Slot>(16);
  readonly Dictionary<CarrotLicensedFxLibrary.Effect,float> nextAt=new Dictionary<CarrotLicensedFxLibrary.Effect,float>();
  CarrotLicensedFxLibrary library;Camera viewCamera;float clock;int activeParticles,activeCount;
  public Func<int,Transform> ResolveAnchor;
  public bool ReducedMotion;
  int VoiceLimit=>CarrotQuality.High?12:CarrotQuality.Rich?8:4;
  int ParticleBudget=>CarrotQuality.High?1536:CarrotQuality.Rich?960:384;
  void Awake(){
   viewCamera=Camera.main;library=Resources.Load<CarrotLicensedFxLibrary>("Carrot/LicensedFx/Library");if(library==null||library.effects==null)return;
   int slotLimit=CarrotQuality.High?16:CarrotQuality.Rich?12:8;
   // Give every acquired effect one slot before adding duplicates, including on phones.
   var eligible=new List<CarrotLicensedFxLibrary.Effect>();
   foreach(var effect in library.effects)if(effect!=null&&effect.prefab!=null&&effect.bindings!=null&&effect.bindings.Length>0&&(CarrotQuality.Rich||effect.allowLowQuality)&&SafePrefab(effect))eligible.Add(effect);
   for(int copy=0;copy<3&&slots.Count<slotLimit;copy++)foreach(var effect in eligible){if(copy>=Mathf.Clamp(effect.instances,1,3)||slots.Count>=slotLimit)continue;CreateSlot(effect);}
  }
  void CreateSlot(CarrotLicensedFxLibrary.Effect effect){
   var go=Instantiate(effect.prefab,transform);go.name="Licensed effect: "+effect.id;go.SetActive(false);var systems=go.GetComponentsInChildren<ParticleSystem>(true);if(systems.Length==0){Destroy(go);return;}
   var roots=new List<ParticleSystem>();int capacity=0,limit=Mathf.Clamp(Mathf.RoundToInt(effect.particleLimit*CarrotQuality.ParticleScale),16,512),perSystem=Mathf.Max(1,limit/systems.Length);
   foreach(var ps in systems){ps.Stop(true,ParticleSystemStopBehavior.StopEmittingAndClear);var main=ps.main;main.playOnAwake=false;main.stopAction=ParticleSystemStopAction.None;main.cullingMode=ParticleSystemCullingMode.AlwaysSimulate;main.useUnscaledTime=false;main.maxParticles=Mathf.Min(main.maxParticles,perSystem);capacity+=main.maxParticles;var parent=ps.transform.parent;bool nested=false;while(parent!=null&&parent!=go.transform.parent){if(parent.GetComponent<ParticleSystem>()!=null){nested=true;break;}parent=parent.parent;}if(!nested)roots.Add(ps);}
   foreach(var light in go.GetComponentsInChildren<Light>(true))light.enabled=false;
   foreach(var r in go.GetComponentsInChildren<Renderer>(true)){r.shadowCastingMode=UnityEngine.Rendering.ShadowCastingMode.Off;r.receiveShadows=false;}
   slots.Add(new Slot{go=go,transform=go.transform,restRotation=go.transform.localRotation,systems=systems,roots=roots.ToArray(),effect=effect,particles=capacity});
  }
  static bool SafePrefab(CarrotLicensedFxLibrary.Effect effect){var prefab=effect.prefab;
   if(prefab.GetComponentsInChildren<MonoBehaviour>(true).Length>0||prefab.GetComponentsInChildren<Animator>(true).Length>0||prefab.GetComponentsInChildren<Animation>(true).Length>0||prefab.GetComponentsInChildren<AudioSource>(true).Length>0||prefab.GetComponentsInChildren<TrailRenderer>(true).Length>0){Debug.LogWarning("Licensed effect skipped until a clean particle-only playback prefab is audited: "+effect.id);return false;}
   return true;
  }
  public void Handle(CarrotEvent e){if(viewCamera==null)viewCamera=Camera.main;if(library==null||library.effects==null||activeCount>=VoiceLimit)return;
   foreach(var effect in library.effects){if(effect==null||effect.prefab==null||effect.bindings==null||ReducedMotion&&!effect.allowReducedMotion||!CarrotQuality.Rich&&!effect.allowLowQuality)continue;if(nextAt.TryGetValue(effect,out var next)&&clock<next)continue;
    CarrotLicensedFxLibrary.Binding binding=null;foreach(var b in effect.bindings)if(b!=null&&b.eventType==e.type&&(b.kind==e.kind||b.kind=="*")){binding=b;break;}if(binding==null)continue;
    Slot available=null;foreach(var s in slots)if(s.effect==effect&&!s.active){available=s;break;}if(available==null||activeParticles+available.particles>ParticleBudget)continue;
    Vector3 p=binding.atTarget?e.to:e.position;if(viewCamera!=null){var viewport=viewCamera.WorldToViewportPoint(p);if(viewport.z<=0||viewport.x<-.15f||viewport.x>1.15f||viewport.y<-.15f||viewport.y>1.15f)continue;}Transform follow=binding.followSource?ResolveAnchor?.Invoke(e.id):null;
    available.follow=follow;available.offset=binding.offset;available.transform.position=follow!=null?follow.TransformPoint(binding.offset):p+binding.offset;available.transform.rotation=(binding.followSource&&follow!=null?follow.rotation:binding.faceTravel&&(e.to-e.position).sqrMagnitude>.0001f?Quaternion.LookRotation((e.to-e.position).normalized):Quaternion.identity)*available.restRotation;available.transform.localScale=Vector3.one*Mathf.Clamp(effect.scale,.05f,5);available.life=Mathf.Clamp(binding.useEventDuration&&e.duration>0?e.duration:effect.lifetime,.1f,8);available.age=0;available.active=true;available.go.SetActive(true);
    foreach(var ps in available.roots){ps.Simulate(0,true,true,false);ps.Pause(true);}activeParticles+=available.particles;activeCount++;nextAt[effect]=clock+Mathf.Max(.05f,effect.cooldown);
    return; // One licensed accent per event; native layered effects still handle the entire family.
   }
  }
  public void Tick(float dt){if(dt<=0)return;clock+=dt;foreach(var s in slots){if(!s.active)continue;s.age+=dt;if(s.age>=s.life){Release(s);continue;}if(s.follow!=null)s.transform.position=s.follow.TransformPoint(s.offset);foreach(var ps in s.roots){ps.Simulate(dt,true,false,false);ps.Pause(true);}}}
  void Release(Slot s){foreach(var ps in s.roots)ps.Stop(true,ParticleSystemStopBehavior.StopEmittingAndClear);s.go.SetActive(false);s.active=false;s.follow=null;activeCount--;activeParticles-=s.particles;}
  public void Clear(){foreach(var s in slots)if(s.active)Release(s);activeCount=activeParticles=0;clock=0;nextAt.Clear();}
  void OnDisable(){Clear();}
 }
}
