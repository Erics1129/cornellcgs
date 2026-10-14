using System;
using UnityEngine;

namespace CarrotTD {
 /// <summary>Private, audited mappings to licensed URP prefabs. An absent library is intentionally a no-op.</summary>
 [CreateAssetMenu(fileName="Library",menuName="Carrot/Licensed effect library")]
 public sealed class CarrotLicensedFxLibrary : ScriptableObject {
  [Serializable] public sealed class Binding {
   public string eventType="impact",kind="";
   public bool atTarget=true,followSource,faceTravel;
   public Vector3 offset;
   public bool useEventDuration;
  }
  [Serializable] public sealed class Effect {
   public string id,sourcePack;
   public GameObject prefab;
   [Range(1,3)]public int instances=1;
   [Range(.1f,8)]public float lifetime=.75f;
   [Range(.05f,2)]public float cooldown=.12f;
   [Range(.05f,5)]public float scale=1;
   [Range(16,512)]public int particleLimit=192;
   public bool allowLowQuality=true,allowReducedMotion;
   public Binding[] bindings=Array.Empty<Binding>();
  }
  public Effect[] effects=Array.Empty<Effect>();
 }
}
