using UnityEngine;
namespace CarrotTD {
 /// <summary>
 /// Gait data measured from the authored clips when CarrotModels.Prepare builds a rigged prefab (prefab-root units, front +Z for
 /// the original actors, -Z for the Portal-era ones). The view reads it to sync walk playback to ground speed and to pick idle variants.
 /// </summary>
 public sealed class CarrotGait : MonoBehaviour {
  [Tooltip("Locomotion clip the stride was measured on.")] public string walkClip;
  [Tooltip("Seconds per authored locomotion cycle.")] public float walkCycle;
  [Tooltip("Ground speed the clip implies at 1x playback, prefab-root units per second (0 = unmeasured).")] public float walkSpeed;
  [Tooltip("Ground speed of the run clip at 1x (0 = none or unmeasured).")] public float runSpeed;
  [Tooltip("Foot or limb transform the stride was measured on (empty for legless hoppers).")] public string strideBone;
  [Tooltip("Primary and secondary idle clips (the second may be empty).")] public string idleA,idleB;
 }
}
