using System;
using UnityEngine;
using UnityEngine.Playables;
using UnityEngine.Timeline;

namespace CarrotTD {
 /// <summary>Receives Timeline signal markers from the view's PlayableDirector and hands their names to the view.</summary>
 public sealed class CarrotCinematics : MonoBehaviour, INotificationReceiver {
  public Action<string> Signal;
  public void OnNotify(Playable origin,INotification notification,object context){var emitter=notification as SignalEmitter;if(emitter!=null&&emitter.asset!=null)Signal?.Invoke(emitter.asset.name);}
 }
}
