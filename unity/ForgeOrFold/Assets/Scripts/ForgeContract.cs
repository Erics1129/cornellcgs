using System;
using System.Collections.Generic;
using UnityEngine;

// FROZEN at "forge-feel: contract + seams". Every feel stream codes against this file; a change
// here needs all of them (and integration) to agree. Owner after hand-off: integration only.
//
// Web <-> Unity protocol (version ForgeContract.Protocol = 2)
//  web -> Unity SendMessage('Forge', method, string):
//   Sync(snapshot json)   ForgeSnapshot below. effect = the engine GameEvent of that transition.
//   Strike(seq)           seq = decimal strike sequence id (> 0). '' from a pre-contract page means 0.
//   Insets(json)          ForgeView below, on boot and whenever the canvas or HUD bands change.
//   Tune(json)            src/minigames/forge/feel-tuning.json, once after 'ready'. See ForgeTuning.
//   Qa(mode)              'telemetry' | 'steady' | 'void' | 'swatch', from ?forge-telemetry=1 / ?forge-unity-qa=.
//   Control, Pointer, Quick: unchanged.
//  Unity -> web Send(type, id, spot, x, y) (ForgeMessage):
//   ready (x = Protocol; pre-contract builds send 0)
//   swing (id = seq, x = ms from now to contact)        impact (id = seq)
//   settled (id = seq, x = -1 when the strike was refused or cancelled without an impact, else 0)
//   seated (id = knife)    sfx (id, spot = name, x, y; names in ForgeContract.Sfx)
//   telemetry (spot = ForgeTelemetry json, only after Qa('telemetry'))
//   perf (id = tier, x = p90 ms, y = median ms, 1 Hz)   quality (spot = tier '0'..'3')
//   tuned (spot = effective ForgeTuning json, after Tune)
//   unchanged: settled/context/near/position/command/purchase/notice/select/drop/hit/spot/gesture/hover/stats/label
//  A pre-contract page sends Strike('') and ignores ids: impact and settled then carry seq 0.
//
// Time policy (ForgeTime): the strike timeline, camera, input, telemetry and quality run on unscaled
// time, and hit-stop pauses the strike timeline explicitly. Only world effects (particles, physics,
// Animator, fire, knife jitter) follow Time.timeScale, and only ForgeWorld.Update writes
// Time.timeScale, from ForgeTime.Scale. A watchdog forces 1 after 600 ms below 1, and on focus loss
// or pause. ForgeTime.Raw(Time.unscaledDeltaTime) is the frame's unscaled delta (fixed in QA).
//
// Tonemap invariant: Finish exposure 1.13 with the Narkowicz ACES fit never changes; the blackbody
// ramp is calibrated through it.

[Serializable] public class ForgeKnife { public int id,level,family,pips;public float flow; public string metal,place,displayName;public int saleValue,heldValue; public bool heated,guard,sharpened; public string color,glow; public float rough; public Vector2[] profile; }
// JsonUtility never yields null for these class fields: a Shatter's missing 'after' arrives as an
// empty ForgeKnife. Branch on outcome, never on after == null. guarded = before.guard && !after.guard.
[Serializable] public class ForgeEvent { public string kind,outcome; public int id; public bool evolution,flowStarted; public ForgeKnife before,after; public int amount; public string text; }
// risk: next-hit shatter probability of the anvil knife, Flow and Guard included (0 with no anvil knife).
// totalHits: run.totalHits. shake: camera-shake multiplier 1 / .5 / 0. motion: 'full' | 'reduced' | 'off'
// (the HUD Motion setting). reduced: prefers-reduced-motion, or motion != 'full' once the setting exists.
[Serializable] public class ForgeSnapshot { public int flowNeed=10;public float flowSpeed=1.5f; public ForgeKnife[] knives; public int selected,day; public bool ended,reduced; public ForgeEvent effect; public ForgeOffer[] offers; public float risk; public int totalHits; public float shake=1; public string motion="full"; }
[Serializable] public class ForgePointer { public float x,y; public string phase; }
[Serializable] public class ForgeMessage { public string type,spot; public int id; public float x,y; }
[Serializable] public class ForgeOffer { public string key,label;public int price,stock; }
[Serializable] public class ForgeControl {public string key;public bool down;}

/// The page's view class and HUD bands, sent by the web in Insets. Lengths are CSS pixels of the
/// Unity canvas; top/right/bottom/left are the HUD-covered bands at each canvas edge; goldX/goldY
/// is the gold counter centre from the canvas top-left; panel = a tray or dialog is open.
/// view: 'desktop' | 'phone-portrait' | 'phone-landscape' (src/minigames/forge/bridge.ts viewClass).
[Serializable] public class ForgeView {
 public string view="desktop"; public float cssW,cssH,dpr=1; public bool touch;
 public float top,right,bottom,left,goldX,goldY; public bool panel;
 public bool Phone=>view=="phone-portrait"||view=="phone-landscape";
 public bool Portrait=>view=="phone-portrait";
 public bool Landscape=>view=="phone-landscape";
 /// Today's 'Screen.width < 700' layout switch, measured in CSS pixels so DPR cannot flip it.
 public bool Narrow(int screenWidth)=>cssW>0?cssW<700:screenWidth<700;
}

/// One telemetry frame (Send('telemetry', 0, json) after Qa('telemetry')). Field names are frozen;
/// streams fill what they own and leave the rest at the defaults.
[Serializable] public class ForgeTelemetry {
 public float t;            // realtime ms since startup
 public string ev;          // press | swing | apex | down | contact | settled | seated | hitstop | hearth
 public int seq;            // strike sequence id
 public float ms;           // event-specific: swing = ms to contact, contact = ms since swing start, hitstop = length
 public float pitch,fov,faceDot,kick,trauma,tempC,risk,timeScale;
 public float[] headVp=new float[2];   // hammer head viewport position (x, y from the bottom)
 public float handToHandle=-1,jawToTang=-1,headCoverBlade=-1;  // metres, metres, screen fraction; -1 = n/a
 public int tier,particles;
 public string view;
}

public static class ForgeContract {
 public const int Protocol=2;
 /// Engine replay floor is 350 ms (RULES.replayMinHitMs); Unity never sends two impacts closer than this.
 public const float MinImpactGapSeconds=.40f;
 public const int StaticLayer=8;
 /// Unity -> web sfx names (Send('sfx', id, name, x, y)).
 public static class Sfx {
  public const string Swing="swing";          // x = ms to contact
  public const string Whoosh="whoosh";        // x = head m/s
  public const string Step="step", Tongs="tongs", CoalsIn="coals-in", CoalsOut="coals-out", Bellows="bellows";
  public const string Place="place";          // x: 0 anvil, 1 rack, 2 scale, 3 crate
  public const string Quench="quench";        // x = deg C
  public const string FlakeLand="flake-land", ChipLand="chip-land";
  public const string ShardLand="shard-land"; // x = impulse, y = index
  public const string CoinLand="coin-land";   // x = index, y = total
  public const string Dawn="dawn";
 }
 /// Shader globals (Shader.SetGlobal*). _ForgeOccluders is always a float4[4]: xyz centre, w radius, 0 = off.
 /// _ForgeHazeA/_ForgeHazeB: viewport x, viewport y, radius, strength. _ForgeGlowPos.w = range.
 public static class Globals {
  public static readonly int KeyPosition=Shader.PropertyToID("_ForgeKeyPosition"), KeyColor=Shader.PropertyToID("_ForgeKeyColor");
  public static readonly int RimPosition=Shader.PropertyToID("_ForgeRimPosition"), RimColor=Shader.PropertyToID("_ForgeRimColor");
  public static readonly int FirePosition=Shader.PropertyToID("_ForgeFirePosition"), FireColor=Shader.PropertyToID("_ForgeFireColor");
  public static readonly int Impact=Shader.PropertyToID("_ForgeImpact"), ImpactPos=Shader.PropertyToID("_ForgeImpactPos"), ImpactColor=Shader.PropertyToID("_ForgeImpactColor");
  public static readonly int GlowPos=Shader.PropertyToID("_ForgeGlowPos"), GlowColor=Shader.PropertyToID("_ForgeGlowColor");
  public static readonly int Occluders=Shader.PropertyToID("_ForgeOccluders");
  public static readonly int HazeA=Shader.PropertyToID("_ForgeHazeA"), HazeB=Shader.PropertyToID("_ForgeHazeB");
  public static readonly int CoalPulse=Shader.PropertyToID("_ForgeCoalPulse");
 }
 /// Shader names. New ones must be added to ForgeBuild's always-included list at integration.
 /// Blade.shader defines FORGE_NO_GLOW_LAMP before including ForgeLighting.cginc: the glow lamp (and an
 /// impact lamp that sits inside the mesh) skips emissive receivers.
 public static class Shaders {
  public const string Surface="Forge/Surface", Blade="Forge/Blade", Glove="Forge/Glove", Smith="Forge/Smith", Fire="Forge/Fire", Glow="Forge/Glow", Finish="Forge/Finish", Spark="Forge/Spark", Smoke="Forge/Smoke";
  public const string ParticleAdd="Forge/ParticleAdd", ParticleLit="Forge/ParticleLit";   // hot-metal-vfx
  public const string Smear="Forge/Smear";                                                 // strike-feel
  public const string Shaft="Forge/Shaft";                                                 // room-light-post
 }
 /// QA modes accepted by Qa(mode).
 public static class QaModes { public const string Telemetry="telemetry", Steady="steady", Void="void", Swatch="swatch"; }
}

// Frozen ForgeWorld seams shared by every stream: view class, QA modes, tuning and time.
public partial class ForgeWorld {
 ForgeView view=new ForgeView();
 /// Replaces every 'Screen.width < 700' test. Prefer view.Phone / view.Portrait / view.Landscape in new code.
 bool Narrow=>view.Narrow(Screen.width);
 readonly HashSet<string> qaModes=new HashSet<string>();
 bool QaOn(string mode)=>qaModes.Contains(mode);
 /// QA switches from the page (?forge-telemetry=1, ?forge-unity-qa=steady,void,swatch). Each stream reacts in its own hook.
 public void Qa(string mode){if(string.IsNullOrEmpty(mode))return;qaModes.Add(mode);if(mode==ForgeContract.QaModes.Steady)UnityEngine.Random.InitState(20261012);StrikeQa(mode);MetalQa(mode);AtmosQa(mode);}
 ForgeTuning tuning=new ForgeTuning();
 /// Feel numbers from src/minigames/forge/feel-tuning.json: overrides on top of the compiled-in defaults,
 /// clamped (strike intervals never drop below the balance values). Echoes the effective values as 'tuned'.
 public void Tune(string json){var next=new ForgeTuning();try{if(!string.IsNullOrEmpty(json))JsonUtility.FromJsonOverwrite(json,next);}catch(Exception e){Debug.LogWarning("Forge tuning ignored: "+e.Message);next=new ForgeTuning();}next.Clamp();tuning=next;Send("tuned",0,JsonUtility.ToJson(tuning));}
 readonly ForgeTime clock=new ForgeTime();
 void OnApplicationFocus(bool focused){if(!focused){clock.Reset();Time.timeScale=1;}}
 void OnApplicationPause(bool paused){if(paused){clock.Reset();Time.timeScale=1;}}
#if UNITY_EDITOR
 /// Editor QA hook (ForgeSnapshots): every Send() message, as the JSON the web would receive.
 public static Action<string> QaSend;
 public Camera QaCamera=>cam;
 public Transform QaHammer=>hammer;
#endif
}
