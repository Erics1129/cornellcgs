using System;
using System.Runtime.InteropServices;
using UnityEngine;

namespace CarrotTD {
 /// <summary>
 /// Hosts CarrotNetSession on the 'CarrotGame' object (attached at runtime, so the scene and the build files are untouched)
 /// and moves the bytes: SendMessage('CarrotGame', 'Net', json) in, one CarrotNetOut call per frame out (LateUpdate), which the
 /// jslib dispatches as window 'carrot-net' events. It owns the Unity-only parts: the inactive 'CarrotPartner' replica object
 /// and its spectator view hook, the host view configuration, and Application.runInBackground for the match.
 /// Unity glue only: the simulation build (carrot-sim) never compiles this file.
 /// </summary>
 [DefaultExecutionOrder(100)]
 public sealed class CarrotNet : MonoBehaviour {
  CarrotGame game;CarrotNetSession session;GameObject partnerObject;bool savedBackground,backgroundSet;
  public static CarrotNet Instance {get;private set;}
  public CarrotNetSession Session {get{return session;}}
#if UNITY_WEBGL && !UNITY_EDITOR
  [DllImport("__Internal")] static extern void CarrotNetOut(string json);
#endif
  [RuntimeInitializeOnLoadMethod(RuntimeInitializeLoadType.AfterSceneLoad)]
  static void Install(){
   var go=GameObject.Find("CarrotGame");if(go==null||go.GetComponent<CarrotGame>()==null)return;
   if(go.GetComponent<CarrotNet>()==null)go.AddComponent<CarrotNet>();
  }
  void Awake(){
   Instance=this;game=GetComponent<CarrotGame>();
   session=new CarrotNetSession(game){CreateReplica=CreateReplica,DestroyReplica=DestroyReplica,ReplicaReady=ReplicaReady};
  }
  void OnDestroy(){if(session!=null)session.Dispose();RestoreBackground();if(Instance==this)Instance=null;}
  /// <summary>JS -> Unity: every net message of the bridge contract ({t:'session'|'clock'|'go'|'replica'|...}).</summary>
  public void Net(string json){
   if(session==null)return;bool was=session.Active;session.Receive(json);
   if(session.Active&&!was)Started();else if(!session.Active&&was)RestoreBackground();
  }
  void Started(){
   // A window losing focus (a second monitor, devtools, a notification) must never freeze the match: only a hidden tab pauses it.
   if(!backgroundSet){savedBackground=Application.runInBackground;backgroundSet=true;}Application.runInBackground=true;
   CarrotNetHooks.ConfigureHostView?.Invoke(Config(false));
  }
  void RestoreBackground(){if(backgroundSet){Application.runInBackground=savedBackground;backgroundSet=false;}}
  void Update(){if(session!=null)session.Frame(Mathf.Min(Time.unscaledDeltaTime,.1f));}
  void LateUpdate(){
   if(session==null)return;var json=session.Flush();if(json==null)return;
#if UNITY_WEBGL && !UNITY_EDITOR
   CarrotNetOut(json);
#else
   if(Debug.isDebugBuild)Debug.Log("CARROT_NET_OUT "+(json.Length>400?json.Substring(0,400)+"...":json));
#endif
  }
  CarrotGame CreateReplica(){
   DestroyReplica(null);
   partnerObject=new GameObject("CarrotPartner");partnerObject.SetActive(false);
   var g=partnerObject.AddComponent<CarrotGame>();g.AwakeLevel=0;g.AutoTick=false;g.EnableBridge=false;g.SnapshotEnabled=false;return g;
  }
  void ReplicaReady(CarrotGame replica){
   if(partnerObject==null)return;
   CarrotNetHooks.AttachPartnerView?.Invoke(partnerObject,Config(true));
   partnerObject.SetActive(true);
  }
  void DestroyReplica(CarrotGame replica){if(partnerObject!=null){Destroy(partnerObject);partnerObject=null;}}
  static readonly Color Gold=new Color(1f,.78f,.32f,1f),Teal=new Color(.28f,.82f,.78f,1f);
  DuoViewConfig Config(bool spectator){
   var c=new DuoViewConfig{spectator=spectator,layout=session.mode,seat=session.seat,team=spectator?Teal:Gold,partnerTeam=spectator?Gold:Teal,host=game.GetComponent<CarrotView>()};
   if(session.mode=="duo"){
    int mine=spectator?1-session.side:session.side;c.side=mine;c.arena=CarrotDuoMaps.ArenaRect(session.level);
    c.own=CarrotDuoMaps.HalfRect(session.level,mine);c.partner=CarrotDuoMaps.HalfRect(session.level,1-mine);CarrotDuoMaps.Wall(session.level,out c.wallA,out c.wallB);
   } else {
    c.side=-1;c.arena=CarrotDuoMaps.EndlessRect;c.own=CarrotDuoMaps.EndlessHomeRect(session.seat);c.partner=CarrotDuoMaps.EndlessHomeRect(1-session.seat);
   }
   return c;
  }
 }
}
