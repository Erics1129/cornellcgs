using UnityEngine;

namespace CarrotTD {
 /// <summary>
 /// BOSS MOOD: one immutable presentation profile per boss level. Every value is the target at De = 1 (De = D x the level's intensity
 /// from CarrotBossMoodCurve) relative to the level's own rig; the view scales colour/world by De, light by De^1.3.
 /// Rules the values follow (the review's amendments):
 ///  - Despair lives in the background: ground, foliage, props, sky, fog and the world beyond the board carry the drain. Lanes, pads,
 ///    towers, creatures, the boss, the carrot and every telegraph keep their values, so the screen grade stays nearly neutral
 ///    (saturation >= -4, contrast <= +6, |temperature| <= 6, exposure >= -.04 EV, no colour filter).
 ///  - The shadow-casting sun drops 8 degrees at most and never below 18; the sky's own sun disk (seen only in the entrance shot and the
 ///    victory orbit) may sink to the horizon.
 ///  - Phones (Low tier) take .6 of every luminance delta (exposure, key, ambient, ground gain, edge floor).
 ///  - The dose ladder: each guardian adds one device and keeps the earlier ones (L4 the wake, L8 the lights going out, L12 isolation,
 ///    L16 recurrence, L20 the carrot's full fear and the endless dusk, L24 all of it and the last light). Each boss also owns one
 ///    signature device no other boss uses.
 /// </summary>
 public sealed class CarrotMoodProfile {
  public string id="";
  /// <summary>Luminance budget: every luminance delta (ground/foliage/prop gain, edge floor, key, fill, ambient, exposure) is scaled by
  /// this, calibrated per level so mean frame luminance at De = 1 stays at or above .70x the level's own (.80x on phones).</summary>
  public float lum=1;
  /// <summary>Chroma drain of the light colours (key, fill, fog, ambient) at De=1, and the fog's value floor (x the biome's).</summary>
  public float chromaDrain=0,fogFloor=.55f;
  // ---- screen grade (the mood Volume; small by design) ----
  public float exposure,contrast,saturation,temperature,tint;
  /// <summary>Vignette: absolute intensity at De=1 (negative: keep the biome's), and its colour (alpha 0: keep).</summary>
  public float vignette=-1;public Color vignetteColor=new Color(0,0,0,0);public float vignetteBreath;
  /// <summary>Rich tiers only: split-tone shadows/highlights at De=1 (w unused; zero vector: keep the biome's).</summary>
  public Vector4 smhShadows,smhHighlights;
  /// <summary>High only: depth of field starting just beyond the board (0: off).</summary>
  public bool dofBeyondBoard;
  // ---- light ----
  /// <summary>Shadow-casting sun pitch at De=1 (degrees; clamped to >= max(18, base-8)), and the sky disk's own pitch (shots only).</summary>
  public float sunPitch=-1,skySunPitch=-1;
  /// <summary>Flat-ground key irradiance at De=1 relative to now (the key intensity compensates the lower sun), and its clamp.</summary>
  public float kFlat=1,keyCap=1.25f;public Color key=new Color(0,0,0,0);
  public float fillMul=1;public Color fill=new Color(0,0,0,0);public float fillYawSwing;
  public float ambMul=1;public Color ambTint=new Color(0,0,0,0);public float shadowDelta;
  /// <summary>Lane class: gain and a luminance-preserving tint (alpha = amount). 1 / none by default (lanes keep their values).</summary>
  public float laneGain=1;public Color laneTint=new Color(0,0,0,0);
  // ---- fog and sky ----
  public Color fog=new Color(0,0,0,0);public float fogEnd=-1;
  public Color zenith=new Color(0,0,0,0),horizon=new Color(0,0,0,0),ground=new Color(0,0,0,0),sunColor=new Color(0,0,0,0),cloudColor=new Color(0,0,0,0);
  public float sunSize=-1,sunGlow=-1,clouds=-1,stars=-1,aurora=-1;
  // ---- world materials (classes 1 ground, 2 foliage, 3 prop, 5 prism band) ----
  public float groundSat=1,groundGain=1,foliageSat=1,foliageGain=1,propSat=1,propGain=1,bandSat=1,bandEmission=1;
  /// <summary>Luminance-preserving hue blends (alpha = amount at De=1): ground toward its shadow hue, foliage withering.</summary>
  public Color groundHue=new Color(0,0,0,0),wither=new Color(0,0,0,0),propHue=new Color(0,0,0,0);
  /// <summary>World edge beyond the route+pad bounds: gain floor, how far the darkness closes in (u), mode 0 darken / 1 fade to fog.</summary>
  public float edgeFloor=1,edgeInward=0,edgeBreath;public int edgeMode;
  /// <summary>Wake beside the boss's route (.55-1.4 u from the lane): kind 0 none, 1 cracked scars, 2 drowned (wet), 3 frost veins (cold tint,
  /// no luminance change), 4 mottled rot, 5 turned soil, 6 scoured, 7 gaze-burn. Gain, colour (alpha = amount), smoothness offset.</summary>
  public int wake;public float wakeGain=1,wakeSmooth;public Color wakeColor=new Color(0,0,0,0);
  /// <summary>Losses: patches that wither for good, one per wave before the boss and one each time the boss passes a landmark.</summary>
  public int bossLosses=4;public Color lossColor=new Color(0,0,0,0);
  /// <summary>The boss's long shadow toward the carrot (multiply on ground .35, lanes .12; length grows with D).</summary>
  public float longShadow=1;public bool shadowReachesCarrot;
  /// <summary>Warm pool around the carrot (the last light): strength 0..1 at De=1.</summary>
  public float hopePool=.8f;
  // ---- boss and camera ----
  public float bossScale=1.25f;
  /// <summary>Entrance: 0 low hero shot from the carrot side, 1 water-skimming low shot, 2 high distant shot, 3 locked-off centred push.</summary>
  public int shot;public float back=7.5f,height=1.3f,look=.6f,fovStart=34,fovEnd=28,rollStart,rollEnd,damping=1.6f,shotPitch=12;
  // ---- atmosphere ----
  /// <summary>Falling or drifting motes: kind 0 none, 1 seed fluff, 2 ash (+ embers when embers>0), 3 debris orbit; counts High/Medium/Low.</summary>
  public int motes;public Color moteColor=new Color(.8f,.8f,.75f,.3f);public int moteHigh=48,moteMed=32,moteLow=16;public int embers;
  /// <summary>Existing ambient particles: emission scale at De=1 (pollen, snow, leaves, motes), fireflies as waves left.</summary>
  public float ambientRate=1;public bool firefliesAsWavesLeft;public bool blizzard;public Color leafA=new Color(0,0,0,0),leafB=new Color(0,0,0,0);
  public bool mist;public Color mistColor=new Color(.3f,.45f,.42f,.10f);
  public bool thorns,fragments;public int leafBurst;public Color leafBurstColor=new Color(.42f,.40f,.20f,.9f);
  public float gust;
  // ---- carrot and release ----
  public float fear=1;public float trembleAt=.7f,leafDroop=-5;
  public int releaseMotes=24;public Color releaseColor=new Color(1,.85f,.5f,.7f);public float releaseSpeed=15;public bool overshoot=true,dawn;
  /// <summary>Only Asuna: band drain stays at full colour within this radius of her (u).</summary>
  public float focusRadius;

  static Color C(float r,float g,float b,float a=1){return new Color(r,g,b,a);}
  static Color H(string hex,float a){ColorUtility.TryParseHtmlString(hex,out var c);c.a=a;return c;}

  static CarrotMoodProfile[] all;
  public static CarrotMoodProfile Get(string id){if(all==null)all=Build();foreach(var p in all)if(p.id==id)return p;return null;}
  static CarrotMoodProfile[] Build(){
   var list=new System.Collections.Generic.List<CarrotMoodProfile>();
   // L4 Hollow Oak, Brambleback: "the forest closes in". Device: the bramble wake. Signature: thorn silhouettes rising beyond the board.
   list.Add(new CarrotMoodProfile{id="brambleback",lum=0.4f,chromaDrain=0.45f,fogFloor=0.55f,exposure=-.03f,contrast=4,saturation=-3,temperature=3,tint=-2,vignette=.17f,vignetteColor=C(.03f,.06f,.04f),
    smhShadows=new Vector4(.95f,1f,.96f,0),smhHighlights=new Vector4(1.01f,.98f,.93f,0),
    sunPitch=44,skySunPitch=14,kFlat=.86f,key=C(1,.76f,.50f),fillMul=.65f,fill=C(.40f,.55f,.50f),ambMul=.82f,ambTint=C(.10f,.16f,.10f),shadowDelta=-.08f,
    fog=C(.29f,.35f,.28f),fogEnd=64,zenith=C(.12f,.20f,.15f),horizon=C(.42f,.42f,.29f),ground=C(.08f,.12f,.07f),sunColor=C(.8f,.58f,.34f),sunGlow=.5f,clouds=.75f,cloudColor=C(.45f,.48f,.40f),
    groundSat=.50f,groundGain=.82f,groundHue=H("#13261A",.25f),foliageSat=.55f,foliageGain=.80f,wither=H("#6B6A3A",.40f),propSat=.60f,propGain=.85f,
    edgeFloor=.55f,edgeInward=1.5f,wake=1,wakeGain=.62f,wakeColor=H("#2A2214",.5f),lossColor=H("#6B6A3A",1),
    bossScale=1.25f,shot=0,back=7.5f,height=1.3f,look=.6f,fovStart=34,fovEnd=28,damping=1.6f,
    motes=1,moteColor=H("#C9CCBE",.30f),ambientRate=.2f,thorns=true,leafBurst=8,leafBurstColor=C(.42f,.40f,.20f,.9f),
    fear=.6f,releaseMotes=24,releaseColor=C(1,.92f,.55f,.75f),hopePool=.6f});
   // L8 Moonwell, Lantern Regent: "pulled under". Device: the lights go out. Signature: one firefly per wave left.
   list.Add(new CarrotMoodProfile{id="lantern",lum=0.8f,chromaDrain=0.2f,fogFloor=0.55f,exposure=-.03f,contrast=5,saturation=-3,temperature=-5,tint=4,vignette=.17f,vignetteColor=C(.01f,.05f,.05f),
    smhShadows=new Vector4(.92f,1.02f,1f,0),smhHighlights=new Vector4(.97f,1.02f,.95f,0),
    sunPitch=50,kFlat=.86f,key=C(.62f,.82f,.80f),fillMul=.55f,fill=C(.10f,.30f,.26f),ambMul=.80f,ambTint=C(.03f,.10f,.09f),shadowDelta=-.07f,
    fog=C(.04f,.14f,.13f),fogEnd=46,zenith=C(.01f,.05f,.06f),horizon=C(.05f,.16f,.15f),ground=C(.02f,.04f,.04f),sunColor=C(.74f,1.03f,.98f),sunGlow=.35f,clouds=.55f,cloudColor=C(.06f,.14f,.13f),stars=.4f,
    groundSat=.55f,groundGain=.80f,groundHue=H("#0C2A2C",.30f),foliageSat=.50f,foliageGain=.80f,wither=H("#3E5A3A",.35f),propSat=.60f,propGain=.85f,
    edgeFloor=.50f,edgeInward=1.5f,wake=2,wakeGain=.65f,wakeColor=H("#0C2A2C",.5f),wakeSmooth=.25f,lossColor=H("#3E5A3A",1),
    bossScale=1.25f,shot=1,back=7f,height=.9f,look=.55f,fovStart=34,fovEnd=28,damping=1.8f,
    firefliesAsWavesLeft=true,mist=true,mistColor=C(.12f,.20f,.19f,.08f),
    fear=.7f,releaseMotes=32,releaseColor=C(.75f,1,.5f,.8f),hopePool=.7f});
   // L12 Last Harvest, Crown of Winter: "white-out isolation". Device: the fog island (the world beyond the board fades to white).
   // Signature: the horizon line disappears (fog, sky and the far ground converge). The snow keeps its gain (the Crown, whiteout and the
   // frost telegraphs are white and ice-blue: the white-out lives at the horizon, never under the boss's feet).
   list.Add(new CarrotMoodProfile{id="winter",lum=0.45f,chromaDrain=0.2f,fogFloor=0.8f,exposure=0,contrast=3,saturation=-4,temperature=0,vignette=.17f,vignetteColor=C(.10f,.11f,.13f),
    dofBeyondBoard=true,
    sunPitch=30,skySunPitch=8,kFlat=.95f,key=C(.88f,.91f,.97f),fillMul=.80f,fill=C(.62f,.68f,.85f),ambMul=.92f,ambTint=C(.80f,.82f,.86f),shadowDelta=-.06f,
    fog=C(.86f,.89f,.94f),fogEnd=44,zenith=C(.82f,.86f,.91f),horizon=C(.86f,.89f,.94f),ground=C(.86f,.89f,.94f),sunColor=C(.57f,.58f,.6f),sunGlow=.8f,clouds=1f,cloudColor=C(.93f,.95f,.98f),aurora=0,
    groundSat=.55f,groundGain=1,foliageSat=.50f,foliageGain=.80f,wither=H("#5E6B78",.30f),propSat=.60f,propGain=.90f,
    edgeFloor=.40f,edgeInward=2f,edgeMode=1,wake=3,wakeColor=H("#9DB8E0",.6f),lossColor=H("#5E6B78",1),
    bossScale=1.25f,shot=2,back=15f,height=9f,look=.55f,fovStart=30,fovEnd=28,damping=1.8f,shotPitch=46,
    ambientRate=1.4f,blizzard=true,
    fear=.8f,trembleAt=.6f,releaseMotes=20,releaseColor=C(1,.9f,.7f,.7f),hopePool=.8f});
   // L16 Cider Gate, Brambleback returning on the orchard: "the forest followed you". Device: recurrence (L4's scars and thorns return in
   // autumn colours; the gold orchard turns green-black).
   list.Add(new CarrotMoodProfile{id="brambleback-autumn",lum=0.38f,chromaDrain=0.5f,fogFloor=0.55f,exposure=-.03f,contrast=5,saturation=-3,temperature=3,tint=-3,vignetteColor=C(.04f,.06f,.03f),
    smhShadows=new Vector4(.95f,1f,.92f,0),smhHighlights=new Vector4(1.02f,.96f,.88f,0),
    sunPitch=18,skySunPitch=6,kFlat=.86f,key=C(1,.66f,.38f),fillMul=.55f,fill=C(.30f,.40f,.30f),ambMul=.80f,ambTint=C(.10f,.12f,.07f),shadowDelta=-.10f,
    fog=C(.36f,.33f,.22f),fogEnd=48,zenith=C(.16f,.20f,.16f),horizon=C(.55f,.42f,.24f),ground=C(.12f,.10f,.06f),sunColor=C(.9f,.7f,.45f),clouds=.70f,cloudColor=C(.40f,.36f,.28f),stars=.2f,
    groundSat=.50f,groundGain=.82f,groundHue=H("#1F2A18",.25f),foliageSat=.50f,foliageGain=.80f,wither=H("#5A4A2A",.40f),propSat=.60f,propGain=.85f,
    edgeFloor=.55f,edgeInward=1.2f,wake=1,wakeGain=.62f,wakeColor=H("#3A2414",.5f),lossColor=H("#5A4A2A",1),
    bossScale=1.25f,shot=0,back=7.5f,height=1.3f,look=.6f,fovStart=34,fovEnd=28,damping=1.6f,
    motes=1,moteColor=H("#BDB8A6",.30f),moteHigh=32,moteMed=24,moteLow=12,ambientRate=1.6f,leafA=C(.55f,.42f,.20f),leafB=C(.35f,.24f,.12f),thorns=true,leafBurst=8,leafBurstColor=C(.55f,.30f,.14f,.9f),
    fear=.85f,releaseMotes=24,releaseColor=C(1,.8f,.4f,.75f),hopePool=.8f});
   // L20 Scarecrow Field, Old Hollowhead: "a dusk that never ends". Device: the carrot's full fear and the endless dusk. Signature: ash.
   // Ambient never below .6x (Dusk, the phase-three mechanic, stays a categorical drop); the lanterns are never touched.
   list.Add(new CarrotMoodProfile{id="hollowhead",lum=0.38f,chromaDrain=0.5f,fogFloor=0.6f,exposure=-.03f,contrast=6,saturation=-3,temperature=5,tint=3,vignetteColor=C(.07f,.03f,.06f),
    smhShadows=new Vector4(1f,.93f,1.06f,0),smhHighlights=new Vector4(1.02f,.92f,.84f,0),
    sunPitch=18,skySunPitch=5,kFlat=.80f,key=C(1,.55f,.35f),fillMul=.55f,fill=C(.42f,.30f,.52f),ambMul=.74f,ambTint=C(.14f,.09f,.13f),shadowDelta=-.12f,
    fog=C(.36f,.22f,.30f),fogEnd=46,zenith=C(.23f,.14f,.25f),horizon=C(.88f,.44f,.23f),ground=C(.14f,.09f,.12f),sunColor=C(1.3f,.65f,.39f),sunSize=.06f,sunGlow=.7f,clouds=.55f,cloudColor=C(.42f,.26f,.30f),stars=.6f,
    groundSat=.50f,groundGain=.82f,groundHue=H("#24161F",.25f),foliageSat=.40f,foliageGain=.82f,wither=H("#7A6E5A",.45f),propSat=.55f,propGain=.84f,
    edgeFloor=.50f,edgeInward=1.5f,wake=4,wakeGain=.62f,wakeColor=H("#24161F",.5f),lossColor=H("#7A6E5A",1),
    bossScale=1.25f,shot=0,back=7.5f,height=1.4f,look=.62f,fovStart=34,fovEnd=28,damping=1.6f,
    motes=2,moteColor=H("#6E6266",.30f),embers=24,ambientRate=1.4f,
    fear=1f,releaseMotes=28,releaseColor=C(1,.82f,.42f,.8f),hopePool=1f});
   // L24 The Last Light, Old Hollowhead (finale): all of the above, and the carrot's warm pool is the last light. Signature: the boss's
   // shadow reaches the pool at its closest approach. The fall is a dawn (the sun climbs to 30 degrees in gold).
   list.Add(new CarrotMoodProfile{id="hollowhead-finale",lum=0.3f,chromaDrain=0.55f,fogFloor=0.6f,exposure=-.04f,contrast=6,saturation=-4,temperature=6,tint=4,vignetteColor=C(.06f,.02f,.05f),
    smhShadows=new Vector4(1f,.91f,1.08f,0),smhHighlights=new Vector4(1f,.90f,.80f,0),
    sunPitch=18,skySunPitch=1,kFlat=.76f,keyCap=1.40f,key=C(1,.50f,.32f),fillMul=.50f,fill=C(.40f,.26f,.50f),ambMul=.70f,ambTint=C(.12f,.07f,.12f),shadowDelta=-.14f,
    fog=C(.28f,.16f,.24f),fogEnd=42,zenith=C(.18f,.10f,.20f),horizon=C(.70f,.28f,.16f),ground=C(.10f,.06f,.09f),sunColor=C(1.2f,.5f,.29f),sunSize=.075f,sunGlow=.8f,clouds=.6f,cloudColor=C(.36f,.20f,.26f),stars=.8f,
    groundSat=.45f,groundGain=.78f,groundHue=H("#24161F",.30f),foliageSat=.35f,foliageGain=.80f,wither=H("#7A6E5A",.50f),propSat=.50f,propGain=.82f,
    edgeFloor=.42f,edgeInward=2f,wake=4,wakeGain=.58f,wakeColor=H("#24161F",.55f),lossColor=H("#7A6E5A",1),shadowReachesCarrot=true,
    bossScale=1.30f,shot=0,back=8f,height=1.2f,look=.65f,fovStart=34,fovEnd=27,damping=2f,
    motes=2,moteColor=H("#6E6266",.30f),embers=24,ambientRate=1.4f,
    fear=1f,leafDroop=-7,releaseMotes=40,releaseColor=C(1,.86f,.5f,.85f),dawn=true,hopePool=1f});
   // L25 Giant Tornado: "nothing to hold on to". Signature: the debris orbit (it always shows where the funnel is). A committed one-time
   // roll in the entrance (never a static tilt); the fill light and sky swing, never the shadow-casting sun.
   list.Add(new CarrotMoodProfile{id="tornado",lum=0.7f,chromaDrain=0.3f,fogFloor=0.6f,exposure=-.03f,contrast=5,saturation=-4,temperature=-5,vignette=.20f,vignetteColor=C(.03f,.04f,.06f),
    smhShadows=new Vector4(.95f,.98f,1.06f,0),smhHighlights=new Vector4(1f,1f,1f,0),
    sunPitch=36,kFlat=.86f,key=C(.78f,.84f,.95f),fillMul=.65f,fillYawSwing=3,ambMul=.80f,ambTint=C(.15f,.17f,.22f),shadowDelta=-.06f,
    fog=C(.40f,.44f,.52f),fogEnd=46,zenith=C(.15f,.18f,.24f),horizon=C(.40f,.44f,.50f),ground=C(.12f,.12f,.12f),sunColor=C(.54f,.56f,.6f),clouds=1f,cloudColor=C(.31f,.36f,.42f),
    groundSat=.45f,groundGain=.82f,groundHue=H("#4F5B6B",.25f),foliageSat=.45f,foliageGain=.80f,wither=H("#5A5A4A",.40f),propSat=.60f,propGain=.85f,
    edgeFloor=.55f,edgeInward=1f,wake=6,wakeGain=.72f,wakeColor=H("#4F5B6B",.35f),lossColor=H("#5A5A4A",1),
    bossScale=1.15f,shot=0,back=8.5f,height=1.2f,look=.55f,fovStart=34,fovEnd=28,rollStart=0,rollEnd=9,damping=1.5f,
    motes=3,moteColor=H("#6B6257",.30f),moteHigh=40,moteMed=28,moteLow=14,gust=1,
    fear=1f,releaseMotes=20,releaseColor=C(.85f,.92f,1,.6f),hopePool=.8f});
   // L26 Zombie: "the ground gives up its dead". Signature: knee-high mist between the lanes (never on them or on pads). Flat soil only:
   // no mounds or headstones anywhere (Raise's grave blockers are gameplay).
   list.Add(new CarrotMoodProfile{id="zombie",lum=0.8f,chromaDrain=0.2f,fogFloor=0.55f,exposure=0,contrast=5,saturation=-4,temperature=-3,tint=5,vignette=.20f,vignetteColor=C(.02f,.05f,.03f),
    smhShadows=new Vector4(.94f,1.02f,.96f,0),smhHighlights=new Vector4(.98f,1.04f,.94f,0),
    sunPitch=42,kFlat=.88f,key=C(.50f,.78f,.62f),fillMul=.65f,fill=C(.15f,.35f,.20f),ambMul=.85f,shadowDelta=-.04f,
    fog=C(.06f,.10f,.07f),fogEnd=42,zenith=C(.01f,.03f,.03f),horizon=C(.07f,.14f,.10f),ground=C(.02f,.03f,.02f),sunColor=C(.56f,.77f,.59f),sunSize=.03f,stars=.5f,aurora=.12f,cloudColor=C(.06f,.10f,.08f),
    groundSat=.50f,groundGain=.85f,groundHue=H("#3B2E22",.35f),foliageSat=.50f,foliageGain=.80f,wither=H("#4A5A40",.40f),propSat=.60f,propGain=.85f,
    edgeFloor=.45f,edgeInward=1.5f,wake=5,wakeGain=.66f,wakeColor=H("#3B2E22",.6f),lossColor=H("#4A5A40",1),
    bossScale=1.20f,shot=0,back=7.5f,height=1.1f,look=.6f,fovStart=34,fovEnd=28,damping=1.8f,
    ambientRate=.3f,mist=true,mistColor=C(.20f,.26f,.22f,.09f),
    fear=1f,releaseMotes=20,releaseColor=C(.8f,1,.7f,.6f),hopePool=.8f});
   // L27 Unknown Eyeball: "being watched". Signature: dead-level, centred framing and total stillness (nothing moves; the world-space
   // edge breathes at .1 Hz). The warm arena lane turns grey-violet at equal luminance; the iris is the only warm light.
   list.Add(new CarrotMoodProfile{id="eyeball",lum=0.42f,chromaDrain=0.65f,fogFloor=0.6f,exposure=-.03f,contrast=6,saturation=-4,temperature=-6,tint=3,vignette=.20f,vignetteColor=C(.05f,.02f,.08f),vignetteBreath=.01f,
    smhShadows=new Vector4(.97f,.90f,1.12f,0),smhHighlights=new Vector4(1f,.96f,1.04f,0),
    sunPitch=22,kFlat=.88f,key=C(.70f,.62f,.95f),fillMul=.65f,ambMul=.80f,ambTint=C(.10f,.06f,.16f),shadowDelta=-.06f,laneTint=C(.86f,.86f,1f,.6f),
    fog=C(.14f,.09f,.20f),fogEnd=44,zenith=C(.10f,.05f,.16f),horizon=C(.30f,.20f,.42f),ground=C(.06f,.04f,.08f),sunColor=C(.48f,.4f,.72f),stars=.2f,aurora=.25f,cloudColor=C(.30f,.22f,.40f),
    groundSat=.45f,groundGain=.80f,groundHue=H("#2A1B3D",.30f),foliageSat=.45f,foliageGain=.80f,wither=H("#3A2E48",.30f),propSat=.55f,propGain=.85f,
    edgeFloor=.40f,edgeInward=2f,edgeBreath=.08f,wake=7,wakeGain=.62f,wakeColor=H("#1A1024",.5f),lossColor=H("#3A2E48",1),
    bossScale=1.15f,shot=3,back=7f,height=1f,look=.5f,fovStart=34,fovEnd=28,damping=2f,
    ambientRate=0,
    fear=1f,releaseMotes=20,releaseColor=C(1,.8f,.6f,.6f),hopePool=.9f});
   // L28 Portal: "the floor is leaving, the stars go out". Signature: pieces of the platform's outer skirt break off and fall into the
   // void. The platform is darker than its lanes, so draining it raises lane contrast; nothing is drawn over the platform.
   list.Add(new CarrotMoodProfile{id="portal",lum=0.8f,chromaDrain=0.4f,fogFloor=0.55f,exposure=0,contrast=4,saturation=-2,temperature=-5,vignette=.20f,vignetteColor=C(.02f,.03f,.07f),
    smhShadows=new Vector4(.94f,.95f,1.10f,0),
    sunPitch=38,kFlat=.92f,fillMul=.75f,ambMul=.88f,
    fog=C(.04f,.06f,.11f),fogEnd=50,zenith=C(.006f,.012f,.035f),horizon=C(.02f,.04f,.08f),ground=C(.01f,.015f,.035f),stars=.25f,aurora=.2f,sunGlow=.15f,
    groundSat=.70f,groundGain=.88f,propSat=.70f,propGain=.90f,
    edgeFloor=.65f,edgeInward=.5f,lossColor=new Color(0,0,0,0),bossLosses=0,
    bossScale=1.12f,shot=0,back=8f,height=1.4f,look=.55f,fovStart=34,fovEnd=29,damping=1.6f,
    ambientRate=.4f,fragments=true,
    fear=.9f,releaseMotes=28,releaseColor=C(.5f,.8f,1,.7f),hopePool=.7f});
   // L29 Asuna, Prism Vanguard: "the light belongs to her". Signature: the spectrum drains out of the runway into her (prism bands grey
   // out except within 4 u of Asuna). The bright ground is never darkened (inverted polarity: it would lower lane contrast).
   list.Add(new CarrotMoodProfile{id="asuna",lum=0.45f,chromaDrain=0.3f,fogFloor=0.85f,exposure=-.02f,contrast=4,saturation=-4,temperature=-5,vignette=.17f,vignetteColor=C(.06f,.05f,.09f),
    smhHighlights=new Vector4(.98f,.98f,1.04f,0),
    sunPitch=40,kFlat=.94f,key=C(.86f,.84f,.95f),fillMul=.70f,ambMul=.88f,ambTint=C(.50f,.50f,.60f),
    fog=C(.56f,.55f,.64f),fogEnd=90,zenith=C(.42f,.40f,.52f),horizon=C(.70f,.69f,.76f),ground=C(.55f,.54f,.64f),
    groundSat=.60f,groundGain=1,bandSat=.40f,bandEmission=.55f,focusRadius=4,bossLosses=0,
    bossScale=1.10f,shot=0,back=8f,height=1.5f,look=.62f,fovStart=34,fovEnd=29,damping=1.6f,
    ambientRate=.4f,longShadow=0,
    fear=1f,releaseMotes=40,releaseColor=C(.9f,.8f,1,.8f),releaseSpeed=10,hopePool=.5f});
   return list.ToArray();
  }
 }
}
