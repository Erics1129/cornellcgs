using System;
using System.Collections.Generic;
using UnityEngine;

namespace CarrotTD {
 // Multiplayer contract (frozen with the duo/endless streams; additive only). Owned by the simulation stream.
 //  - NetMode: None (solo, every existing mode), DuoOwn (this device's own duo half, authoritative), Replica (the partner's duo
 //    half rebuilt from their tick-stamped ops; no bridge, no snapshot, no input), Lockstep (two-player endless, one shared state).
 //  - NetOp: the one op vocabulary of the C# sim, the bridge JSON and the wire. JSON {s, k, seat, op, pad?, kind?, id?, target?, type?, v?}:
 //      buy {pad, kind} 1 | upgrade {id, v=fromTier} 2 | sell {id, v=tier} 3 | merge {id=src, target=dst} 4 | mergeUndo {id=merge target} 5
 //      next 6 | speed {v 1|2} 7 (lockstep) | start 9 | focus {type 'enemy'|'blocker'|'', id} 11
 //    Reserved, never executed by the sim: 8 pause (a control), 10 mapPing, 12 presence.
 //    upgrade/sell carry a precondition tier (v; 0 = none) and mergeUndo the merge's target id, so two players acting on the same tower in
 //    the same tick can never double-upgrade or sell a tower that changed under them: the op is rejected instead.
 //    Within one netTick, ops apply seat 0 first on even ticks and seat 1 first on odd ticks, then by seq (s).
 //  - DuoViewConfig / CarrotNetHooks: the seam the presentation stream implements (the sim never references view types beyond these).
 public enum NetMode {None,DuoOwn,Replica,Lockstep}

 public static class NetOpCode {
  public const int Buy=1,Upgrade=2,Sell=3,Merge=4,MergeUndo=5,Next=6,Speed=7,Pause=8,Start=9,MapPing=10,Focus=11,Presence=12;
  static readonly string[] Names={"","buy","upgrade","sell","merge","mergeUndo","next","speed","pause","start","mapPing","focus","presence"};
  public static string Name(int code){return code>0&&code<Names.Length?Names[code]:"";}
  public static int Code(string op){if(string.IsNullOrEmpty(op))return 0;for(int i=1;i<Names.Length;i++)if(Names[i]==op)return i;return 0;}
  /// <summary>Ops the simulation executes (pause, mapPing and presence are controls or presentation and never reach it).</summary>
  public static bool Executable(int code){return code==Buy||code==Upgrade||code==Sell||code==Merge||code==MergeUndo||code==Next||code==Speed||code==Start||code==Focus;}
 }

 /// <summary>One tick-stamped input. s = the issuing seat's sequence number, k = the netTick it applies before, seat = 0|1.
 /// cost is filled only on PendingOps (the lockstep preview purse) and never travels.</summary>
 [Serializable] public class NetOp {
  public int s,k,seat;public string op="";public int pad=-1;public string kind="";public int id,target;public string type="";public int v;
  [NonSerialized] public int cost;
  public NetOp Clone(){return (NetOp)MemberwiseClone();}
 }

 /// <summary>What the view needs to build a duo half or the endless map (set through CarrotNetHooks before the view's Awake builds anything).</summary>
 public struct DuoViewConfig {
  /// <summary>True for the partner's replica view: no camera, audio, lights, input, colliders or time-scale requests.</summary>
  public bool spectator;
  /// <summary>"duo" or "endless".</summary>
  public string layout;
  /// <summary>World x/z rectangles (Rect.x = world x, Rect.y = world z): the whole map, this view's half (endless: the seat's home rect), the other half.</summary>
  public Rect arena,own,partner;
  /// <summary>The invisible wall segment (duo); both zero in endless.</summary>
  public Vector3 wallA,wallB;
  /// <summary>Duo half (0|1) this view draws; seat (0|1) of the local player.</summary>
  public int side,seat;
  public Color team,partnerTeam;
  /// <summary>The player's own (host) view: a spectator reuses its materials, mesh caches and camera.</summary>
  public CarrotView host;
 }

 /// <summary>Static seam between the simulation/bridge and the presentation. The view registers the handlers in a
 /// RuntimeInitializeOnLoadMethod; the bridge (CarrotNet) calls them. Every hook may be null (sim-only builds and tests).</summary>
 public static class CarrotNetHooks {
  /// <summary>Add a spectator CarrotView to the inactive 'CarrotPartner' object (the replica sim), before it is activated.</summary>
  public static Action<GameObject,DuoViewConfig> AttachPartnerView;
  /// <summary>Reconfigure the player's own view for a duo half or the endless map (bounds, wall, team colours, camera).</summary>
  public static Action<DuoViewConfig> ConfigureHostView;
  /// <summary>Net camera modes: "own", "partner", "both".</summary>
  public static Action<string> Camera;
  /// <summary>The partner's presentation-only presence: (seat, pad or -1, tower id or -1).</summary>
  public static Action<int,int,int> Presence;
  /// <summary>View-originated events the bridge forwards to the page as {t:'view', kind} (e.g. "partnerTap").</summary>
  public static event Action<string> ViewEvent;
  public static void RaiseViewEvent(string kind){if(!string.IsNullOrEmpty(kind))ViewEvent?.Invoke(kind);}
 }

 public sealed partial class CarrotGame {
  /// <summary>None in every single-player mode.</summary>
  public NetMode NetMode {get;private set;}
  /// <summary>The local player's seat (0|1); in a duo replica, the partner's seat.</summary>
  public int NetSeat {get;private set;}
  /// <summary>Fixed 1/30 s steps of the match clock executed so far (advances in prep too; ops stamped T apply before tick T).</summary>
  public int NetTick {get;private set;}
  /// <summary>Duo: this half cleared its final wave and boss and is frozen, waiting for the partner's half.</summary>
  public bool DuoHold {get;private set;}
  /// <summary>Focus fire target ("enemy" | "blocker" | "") and id: what towers prefer. Solo mirrors the selection into it.</summary>
  public string FocusType {get{return focusType;}}
  public int FocusId {get{return focusId;}}
  string focusType="";int focusId=-1;
  /// <summary>Lockstep: the local seat's intents sent but not yet executed (ghost sprouts and the provisional purse).</summary>
  public readonly List<NetOp> PendingOps=new List<NetOp>();
 }
}
