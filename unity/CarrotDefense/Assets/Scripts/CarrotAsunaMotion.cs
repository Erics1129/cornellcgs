using System.Collections.Generic;
using UnityEngine;

namespace CarrotTD {
 /// <summary>Drives the official Humanoid rig through explicitly audited controller states.</summary>
 public sealed class CarrotAsunaMotion : MonoBehaviour {
  public Animator animator;
  public Transform chargeAnchor, trailAnchor;
  readonly HashSet<string> warned = new HashSet<string>();
  string requested = "Idle", playing = "";
  bool hit;float nextHit;
  void Awake() {
   if(animator==null)animator=GetComponentInChildren<Animator>();
   if(animator!=null)animator.applyRootMotion=false;
  }
  public void SetMotion(string state,float speed=1) {
   if(animator==null||animator.runtimeAnimatorController==null)return;
   animator.speed=Mathf.Max(0,speed);
   if(playing=="Death"&&state!="Death")return;
   requested=state;
   if(state=="Death"||state=="Dash")hit=false;
   if(!hit)Play(state);
  }
  public void TriggerHit() {
   if(animator==null||animator.speed<=0||playing=="Death"||playing=="Dash"||requested=="Dash"||hit||Time.unscaledTime<nextHit||!HasState("Hit"))return;
   nextHit=Time.unscaledTime+.45f;hit=true;Play("Hit");
  }
  void Update() {
   if(!hit||animator==null||animator.speed<=0||animator.IsInTransition(0))return;
   var state=animator.GetCurrentAnimatorStateInfo(0);
   if(state.IsName("Base Layer.Hit")&&state.normalizedTime>=1){hit=false;Play(requested);}
  }
  bool HasState(string state) {
   bool present=animator!=null&&animator.HasState(0,Animator.StringToHash("Base Layer."+state));
   if(!present&&warned.Add(state))Debug.LogWarning("Asuna animation state is unavailable: "+state,this);
   return present;
  }
  void Play(string state) {
   if(state==playing||!HasState(state))return;
   animator.CrossFadeInFixedTime(Animator.StringToHash("Base Layer."+state),state=="Hit"?.045f:state=="Death"?.12f:.10f,0,0);
   playing=state;
  }
 }
}
