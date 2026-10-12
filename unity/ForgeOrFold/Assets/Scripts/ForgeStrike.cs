using UnityEngine;

// Owner: strike-feel. The hammer, the swing and the strike plumbing. MakeHammer and
// UpdateFirstPersonHammer moved verbatim from ForgeWorkshop.cs (plus the seq and view edits).
public partial class ForgeWorld {
 /// Strike sequence id of the swing in flight or scheduled (0 when a pre-contract page sent Strike('')).
 int strikeSeq;
 /// Parent for per-frame objects (knives, particles, hammer, tongs). Created first in Start; BatchRoom skips it.
 Transform dynamicRoot;
 /// The real contact point of the last hit, and the snapshot's next-hit shatter risk.
 Vector3 lastContact;float currentRisk;
 /// View class and HUD bands from the page (ForgeView); re-frames the camera.
 public void Insets(string json){var next=JsonUtility.FromJson<ForgeView>(json);if(next==null)return;view=next;if(cam!=null)Resize();}
 void StrikeQa(string mode){}
 /// Hammer head centre in world space (telemetry and snapshots).
 public Vector3 QaHeadPosition=>hammer!=null?hammer.TransformPoint(new Vector3(0,.29f,0)):Vector3.zero;
 void MakeHammer(){hammer=Group("Held smithing hammer",Vector3.zero);Box("Shaped hickory handle",new Vector3(0,.12f,0),new Vector3(.035f,.35f,.043f),wood,hammer);Box("Forged cross peen head",new Vector3(0,.29f,0),new Vector3(.20f,.085f,.084f),iron,hammer);Box("Polished striking face",new Vector3(-.103f,.29f,0),new Vector3(.012f,.082f,.079f),polished,hammer);Box("Handle wedge",new Vector3(0,.335f,0),new Vector3(.024f,.003f,.033f),wood,hammer);}
 void UpdateFirstPersonHammer(float raw){
  if(smith==null)return;
  var yaw=Quaternion.Euler(0,orbitYaw,0);var rest=smith.position+yaw*new Vector3(Narrow?.12f:.28f,1.11f,Narrow?.57f:.43f);var restRotation=yaw*Quaternion.Euler(-9,0,-24);
  if(swinging){float before=swingTime;swingTime+=raw*swingSpeed;float t=swingTime;var impact=new Vector3(.42f,1.085f,-.4f);var raised=smith.position+new Vector3(.34f,1.48f,.36f);float angle;
   if(t<.24f){float q=Mathf.SmoothStep(0,1,t/.24f);hammer.position=Vector3.Lerp(rest,raised,q);angle=Mathf.Lerp(-24,-65,q);}
   else if(t<.34f){float q=(t-.24f)/.1f;hammer.position=Vector3.Lerp(raised,impact,q*q);angle=Mathf.Lerp(-65,74,q*q);}
   else {float q=Mathf.Clamp01((t-.34f)/.4f);hammer.position=Vector3.Lerp(impact,rest,Mathf.SmoothStep(0,1,q))+Vector3.up*Mathf.Sin(q*Mathf.PI)*.12f;angle=Mathf.Lerp(74,-24,Mathf.Sqrt(q));}
   hammer.rotation=Quaternion.Euler(0,0,angle);if(before<.34f&&t>=.34f)Send("impact",strikeSeq);if(t>.76f){swinging=false;Send("settled",strikeSeq);}
  }else{hammer.position=Vector3.Lerp(hammer.position,rest,1-Mathf.Exp(-raw*16));hammer.rotation=Quaternion.Slerp(hammer.rotation,restRotation,1-Mathf.Exp(-raw*16));}
 }
 /// Telemetry for strike events (ev: press, swing, contact, settled), only after Qa('telemetry').
 void StrikeTelemetry(string type,int seq,float x){if(!QaOn(ForgeContract.QaModes.Telemetry))return;string ev=type=="impact"?"contact":type;if(ev!="press"&&ev!="swing"&&ev!="contact"&&ev!="settled")return;
  var f=new ForgeTelemetry{t=Time.realtimeSinceStartup*1000,ev=ev,seq=seq,ms=ev=="contact"?swingTime/Mathf.Max(.01f,swingSpeed)*1000:x,fov=cam!=null?cam.fieldOfView:0,risk=currentRisk,tier=QualityTier,particles=FxParticleCount(),timeScale=Time.timeScale,view=view.view};
  if(cam!=null){f.pitch=cam.transform.eulerAngles.x;if(f.pitch>180)f.pitch-=360;var vp=cam.WorldToViewportPoint(QaHeadPosition);f.headVp[0]=vp.x;f.headVp[1]=vp.y;}
  if(hammer!=null){f.faceDot=Vector3.Dot(hammer.rotation*Vector3.left,Vector3.down);if(rightHand!=null)f.handToHandle=Vector3.Distance(rightHand.position,hammer.TransformPoint(new Vector3(.075f,-.025f,0)));}
  foreach(var b in bodies.Values)if(b.knife!=null&&b.knife.place=="anvil")f.tempC=KnifeTemperature(b);
  Send("telemetry",seq,JsonUtility.ToJson(f));
 }
#if UNITY_EDITOR
 /// Snapshot QA: hold the camera at a yaw and pitch (degrees; positive pitch looks down).
 public void QaLook(float yaw,float pitch){workFocus=false;route=null;orbitYaw=yaw;orbitPitch=Mathf.Clamp(pitch,-65,78);}
 /// Snapshot QA: look at a station spot from the current eye.
 public void QaLookAt(string spot){if(cam==null||!spots.ContainsKey(spot))return;var d=spots[spot]-cam.transform.position;QaLook(Mathf.Atan2(d.x,d.z)*Mathf.Rad2Deg,-Mathf.Atan2(d.y,new Vector2(d.x,d.z).magnitude)*Mathf.Rad2Deg);}
#endif
}
