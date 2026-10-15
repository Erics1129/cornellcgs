using UnityEngine;
using UnityEngine.Rendering;

namespace CarrotTD {
 /// <summary>
 /// The effect hierarchy of the giant update. Routine shots and impacts stay small (and dim by 40% inside a live boss windup);
 /// kills pop; elite kills pop harder; the Super forge, a boss phase break and a boss death are rare, enormous beats with true
 /// time-stops (through the view's simulation time-scale request), a shockwave, a coin shower and the light budget of the flash
 /// governor. Every boss telegraph carries a threat frame: an outer #FF66AA rim pulsing at 2 Hz between 40 and 90% alpha,
 /// inward chevrons and a 30% fill in the ability's own hue, so threat never shares a channel with a tower's colour.
 /// </summary>
 public sealed partial class CarrotEffects {
  /// <summary>Threat channel colour (osu! #FF66AA): reserved for boss telegraphs and route warnings.</summary>
  public static readonly Color Threat=new Color(1f,.4f,.667f);
  /// <summary>Super channel colour (#AA88FF).</summary>
  public static readonly Color SuperTone=new Color(.667f,.533f,1f);
  /// <summary>Set by the view every frame: 0.6 while a boss windup is live, else 1. Applied to routine shots and impacts only.</summary>
  public float RoutineDim=1;
  /// <summary>The view's FOV punch (degrees); zero under reduced motion.</summary>
  public System.Action<float> FovPunch;
  /// <summary>Set by the view: true for decoys and clones (their deaths never play the boss beat).</summary>
  public System.Func<int,bool> IsClone;
  float emitDim=1;
  static bool BossKind(string kind){switch(kind){case "garden":case "marsh":case "frost":case "orchard":case "tornado":case "zombie":case "eyeball":case "portal":case "asuna":return true;default:return false;}}
  static bool OriginalMini(string kind){return false;}

  /// <summary>Kill pop shared by every ordinary and elite death (the family's own debris follows in Death/ExpansionDeath):
  /// a 1.6x core, a short spark crown, one lit smoke puff and a coin burst; elites add a shockwave ring and a light kick.</summary>
  void KillPop(CarrotEvent e){
   if(BossKind(e.kind)&&!(IsClone!=null&&IsClone(e.id))){BossDeathBeat(e);return;}
   bool elite=ExpansionMini(e.kind);float k=elite?1.5f:1;Vector3 p=e.position+Vector3.up*.35f;Color warm=new Color(1,.88f,.62f);
   Flash(p,.88f*k,.09f,new Color(1,1,1,.9f),FxSheet.GlowHard);Flash(p,1.15f*k,.16f,new Color(warm.r,warm.g,warm.b,.55f),FxSheet.Star4,R(0,360));
   Sparks(p,N(elite?14:6),1.6f,3.4f,.34f,warm,Vector3.up,.9f,.1f);Smoke(p,N(elite?3:1),.35f,.6f,.9f,new Color(.55f,.52f,.48f,.45f),.35f,.4f);
   if(e.value>0){int coins=elite?5:Mathf.Clamp(Mathf.RoundToInt(e.value/6f),1,3);for(int i=0;i<N(coins);i++)Glyph(p+Vector3.up*.15f,FxSheet.Coin,.24f,.8f,new Color(1,.85f,.35f),new Vector3(R(-.6f,.6f),R(1.1f,1.9f),R(-.4f,.4f)),R(-200,200));}
   if(elite){RingFx(e.position,.25f,1.7f,.45f,Hot(new Color(1,.86f,.55f,.85f),1.5f),2,1.5f);Disc(e.position,.3f,1.1f,.3f,new Color(1,.8f,.45f,.7f),1.6f);LightFx(p,5,3,.18f,warm,.02f);CameraImpulse?.Invoke(e.position,.1f,2);}
  }
  /// <summary>Boss death: streaks, shards and rings around a brief tinted core, a shockwave, a coin shower and 0.6 s at 0.3 speed. The
  /// challenge bosses, the Portal and Asuna add their own recipes on top; the campaign guardians had only the generic death before.</summary>
  void BossDeathBeat(CarrotEvent e){
   Vector3 p=e.position;Color tone=Tone(e.kind);Vector3 core=p+Vector3.up*1.1f;
   // Polish: the burst used to open with a 3.2 u near-white star over a 2.4 u glow, which bloom saturated into one flat opaque disc.
   // Now a tinted core lives under 80 ms and stays smaller than the first ring; spinning streaks, shards and rings carry the moment.
   Color hot=Color.Lerp(tone,new Color(1,.95f,.85f),.35f);
   Flash(core,1.25f,.07f,new Color(hot.r,hot.g,hot.b,.6f),FxSheet.GlowHard);
   Flash(core,2.6f,.34f,new Color(hot.r,hot.g,hot.b,.7f),FxSheet.Star6,R(0,360),R(-50,50));Flash(core,1.9f,.46f,new Color(tone.r,tone.g,tone.b,.55f),FxSheet.Star4,R(0,360),R(-80,80));
   Flash(core,1.5f,.5f,new Color(tone.r,tone.g,tone.b,.28f),FxSheet.GlowSoft);
   RingFx(p,.3f,4.6f,.9f,Hot(new Color(1,.9f,.65f,.85f),1.6f),2,1.4f);RingFx(p,.2f,3.2f,.7f,Hot(new Color(tone.r,tone.g,tone.b,.8f),1.6f),1,1.5f,false,.12f);RingFx(p,.4f,2.3f,.55f,Hot(new Color(hot.r,hot.g,hot.b,.6f),1.4f),0,2,false,1.1f);
   Disc(p,.6f,2.4f,.6f,new Color(tone.r,tone.g,tone.b,.42f),1.3f);
   Sparks(core,N(44),2.2f,4.8f,1.1f,new Color(1,.85f,.45f),Vector3.zero,1,.13f);Debris(core,N(34),FxSheet.Shard,.09f,.18f,1.8f,4f,1.5f,Color.Lerp(new Color(1,.86f,.5f),tone,.3f),560);
   int coins=N(18);for(int i=0;i<coins;i++){float a=i/(float)coins*Mathf.PI*2;Glyph(core,FxSheet.Coin,.28f,1.3f,new Color(1,.86f,.36f),new Vector3(Mathf.Cos(a)*R(.8f,1.6f),R(2,3.2f),Mathf.Sin(a)*R(.8f,1.6f)),R(-260,260));}
   LightFx(core,10,6,.7f,new Color(1,.85f,.55f),.03f);
   if(e.kind=="garden"||e.kind=="marsh"||e.kind=="frost"||e.kind=="orchard"){CameraImpulse?.Invoke(p,.5f,3);HitStop?.Invoke(0,.3f,.6f);}
  }
  /// <summary>Super forge: 0.3 s of motes converging on the crown while the ghost flies in, then a 50 ms white core, a shockwave,
  /// petals, a 2 degree FOV punch, an 80 ms true pause and a one-second aura recoloured toward the Super channel (#AA88FF).</summary>
  public void MergeBurst(Vector3 p,Color tone){
   Vector3 top=p+Vector3.up*.9f;Color super=Color.Lerp(tone,SuperTone,.55f);motes.Frame(FxSheet.GlowSoft);
   for(int i=0;i<N(22);i++){Vector3 d=Random.onUnitSphere;d.y=Mathf.Abs(d.y)*.6f;d*=R(1.1f,1.7f);motes.Emit(top+d,-d/.32f,R(.12f,.2f),.32f,new Color(super.r,super.g,super.b,.85f));}
   RingFx(p,1.6f,.25f,.42f,Hot(new Color(super.r,super.g,super.b,.75f),1.5f),0,1);
   Delay(.42f,Op.SuperCore,p,Vector3.zero,super);
  }
  void SuperCore(Vector3 p,Color super){
   Vector3 top=p+Vector3.up*.9f;
   Flash(top,2.6f,.05f,new Color(1,1,1,1),FxSheet.GlowHard);Flash(top,2.2f,.18f,new Color(1,1,1,.9f),FxSheet.Star6,R(0,360));Flash(top,1.5f,.35f,new Color(super.r,super.g,super.b,.8f),FxSheet.GlowSoft);
   RingFx(p,.2f,3.2f,.55f,Hot(new Color(1,.92f,.75f,.95f),1.9f),2,1.5f);for(int i=0;i<3;i++)RingFx(p,.2f,1.3f+i*.35f,.55f+i*.15f,Hot(new Color(super.r,super.g,super.b,.9f),1.6f),i==1?1:0,2,false,.08f+i*.3f);
   Sparks(top,N(34),1.8f,3.8f,.85f,new Color(1,.88f,.45f),Vector3.up,.9f,.13f);Debris(top,N(22),FxSheet.Petal,.09f,.15f,.8f,2.2f,1.3f,new Color(1,.8f,.9f),320);
   Motes(p+Vector3.up*.5f,N(24),.16f,1.3f,new Color(super.r,super.g,super.b,.85f),.6f,Vector3.up*.6f,FxSheet.GlowSoft,.5f);
   Disc(p,.4f,1.6f,.45f,new Color(super.r,super.g,super.b,.8f),2);LightFx(top,7f,3.4f,.5f,new Color(1,.85f,.75f),.02f);
   // A pillar of light from the plinth to the sky: the moment reads from anywhere on the board.
   BoltFx(p+Vector3.up*.1f,p+Vector3.up*7.5f,.55f,.6f,new Color(super.r,super.g,super.b,.75f),0,0,true,0,1.8f);BoltFx(p+Vector3.up*.1f,p+Vector3.up*7.5f,.16f,.45f,new Color(1,1,1,.95f),0,0,true,0,2.4f);
   Loop(1f,.25f,Op.PulseRing,p,Vector3.zero,Hot(new Color(super.r,super.g,super.b,.7f),1.5f),.95f);
   CameraImpulse?.Invoke(p,.25f,3);FovPunch?.Invoke(2);HitStop?.Invoke(.08f,1,0);
  }
  /// <summary>Boss phase break: a shard ring on top of the phase recipe (the 100 ms true pause is in Ability "phase").</summary>
  void PhaseShatter(Vector3 p,Color c){
   RingFx(p,.4f,3.6f,.6f,Hot(new Color(.92f,.97f,1,.9f),1.8f),2,1.4f);Debris(p+Vector3.up*.9f,N(28),FxSheet.Shard,.1f,.2f,2,4.4f,1.2f,new Color(.9f,.95f,1),600);
   for(int i=0;i<N(12);i++){float a=i/(float)N(12)*Mathf.PI*2;Vector3 d=new Vector3(Mathf.Cos(a),0,Mathf.Sin(a));Sparks(p+d*.6f+Vector3.up*.4f,1,2.6f,3.6f,.6f,new Color(1,.9f,.7f),d+Vector3.up*.2f,.12f,.14f);}
  }
  /// <summary>Threat frame of a telegraph area (see the class summary).</summary>
  void ThreatFrame(Vector3 p,float radius,float duration,Color element){
   RingFx(p,radius+.2f,radius+.2f,duration,Hot(new Color(Threat.r,Threat.g,Threat.b,1),1.4f),0,0,true,.07f,2);
   RingFx(p,radius,radius,duration,new Color(element.r,element.g,element.b,.3f),3,0,false,.04f);
   int n=radius>1.2f?6:4;for(int i=0;i<n;i++){float a=i/(float)n*Mathf.PI*2+.4f;Vector3 d=new Vector3(Mathf.Cos(a),0,Mathf.Sin(a));Glyph(p+d*(radius+.32f)+Vector3.up*.16f,FxSheet.Chevron,.3f,duration,new Color(Threat.r,Threat.g,Threat.b,.85f),-d*.12f);}
  }
  // ---- ally / threat colour separation (OKLab) -----------------------------------------------------------------------------------
  static readonly string[] AllyKinds={"seed","frost","mortar","prism","storm","blossom","starfruit","gravity","book","thunder","bamboo","chili","lotus","magnet","orchid","mushroom","cactus","clockflower","dragonfruit","moonflower"};
  static readonly System.Collections.Generic.Dictionary<string,Color> separated=new System.Collections.Generic.Dictionary<string,Color>();
  static Vector3[] allyLab;
  /// <summary>Boss, miniboss and creature effect colours keep their element hue family but move to the nearest in-gamut colour that
  /// sits at least 0.095 (OKLab) from every tower family's colour, so a boss's frost never reads as the player's Frost. Searched over
  /// the sRGB cube (coarse 12^3 grid, then a 9^3 refinement around the best) because pushing in OKLab alone leaves the gamut for the
  /// vivid reds and cyans and the clamp pulls them straight back onto the tower colour. Lightness changes weigh 1.5x and lost chroma
  /// 2x, so the answer is a hue shift (frost casts go teal, ember casts hot pink-red) rather than a washed-out pastel.</summary>
  static Color Separated(string kind,Color c){
   if(string.IsNullOrEmpty(kind)||System.Array.IndexOf(AllyKinds,kind)>=0||kind=="merge"||kind=="mergeUndo"||kind=="super")return c;
   if(separated.TryGetValue(kind,out var cached))return cached;
   if(allyLab==null){allyLab=new Vector3[AllyKinds.Length];for(int i=0;i<AllyKinds.Length;i++)allyLab[i]=OkLab(ToneRaw(AllyKinds[i]));}
   Vector3 o=OkLab(c);Color result=c;
   if(MinAllyDistance(o)<SeparationMargin){
    float c0=Mathf.Sqrt(o.y*o.y+o.z*o.z),lMin=Mathf.Min(o.x,.45f),bestScore=9;Color best=c;bool found=false;
    const int n=12;const float step=1f/(n-1);
    for(int i=0;i<n;i++)for(int j=0;j<n;j++)for(int k=0;k<n;k++)Candidate(new Color(i*step,j*step,k*step,c.a),o,c0,lMin,ref best,ref bestScore,ref found);
    if(found){Color b0=best;const int f=4;for(int i=-f;i<=f;i++)for(int j=-f;j<=f;j++)for(int k=-f;k<=f;k++){float r=b0.r+i*step/f,g=b0.g+j*step/f,b=b0.b+k*step/f;if(r<0||g<0||b<0||r>1||g>1||b>1)continue;Candidate(new Color(r,g,b,c.a),o,c0,lMin,ref best,ref bestScore,ref found);}result=best;}
   }
   separated[kind]=result;return result;
  }
  const float SeparationMargin=.095f;
  static void Candidate(Color rgb,Vector3 o,float c0,float lMin,ref Color best,ref float bestScore,ref bool found){
   Vector3 p=OkLab(rgb);if(p.x<lMin||MinAllyDistance(p)<SeparationMargin)return;
   float dl=1.5f*(p.x-o.x),da=p.y-o.y,db=p.z-o.z,score=Mathf.Sqrt(dl*dl+da*da+db*db)+2*Mathf.Max(0,c0-Mathf.Sqrt(p.y*p.y+p.z*p.z));
   if(score<bestScore){bestScore=score;best=rgb;found=true;}
  }
  static float MinAllyDistance(Vector3 lab){float m=9;foreach(var a in allyLab)m=Mathf.Min(m,Vector3.Distance(a,lab));return m;}
  /// <summary>Smallest OKLab distance between a (separated) tone and the tower palette (tests and the QA probe).</summary>
  public static float AllyDistance(string kind){Tone("seed");if(allyLab==null){allyLab=new Vector3[AllyKinds.Length];for(int i=0;i<AllyKinds.Length;i++)allyLab[i]=OkLab(ToneRaw(AllyKinds[i]));}return MinAllyDistance(OkLab(Tone(kind)));}
  static float ToLinear(float c){return c<=.04045f?c/12.92f:Mathf.Pow((c+.055f)/1.055f,2.4f);}
  static float ToSrgb(float c){c=Mathf.Clamp01(c);return c<=.0031308f?c*12.92f:1.055f*Mathf.Pow(c,1/2.4f)-.055f;}
  public static Vector3 OkLab(Color c){float r=ToLinear(Mathf.Clamp01(c.r)),g=ToLinear(Mathf.Clamp01(c.g)),b=ToLinear(Mathf.Clamp01(c.b));
   float l=Mathf.Pow(.4122214708f*r+.5363325363f*g+.0514459929f*b,1/3f),m=Mathf.Pow(.2119034982f*r+.6806995451f*g+.1073969566f*b,1/3f),s=Mathf.Pow(.0883024619f*r+.2817188376f*g+.6299787005f*b,1/3f);
   return new Vector3(.2104542553f*l+.7936177850f*m-.0040720468f*s,1.9779984951f*l-2.4285922050f*m+.4505937099f*s,.0259040371f*l+.7827717662f*m-.8086757660f*s);}
  static Color FromOkLab(Vector3 lab,float alpha){float l=lab.x+.3963377774f*lab.y+.2158037573f*lab.z,m=lab.x-.1055613458f*lab.y-.0638541728f*lab.z,s=lab.x-.0894841775f*lab.y-1.2914855480f*lab.z;l*=l*l;m*=m*m;s*=s*s;
   return new Color(ToSrgb(4.0767416621f*l-3.3077115913f*m+.2309699292f*s),ToSrgb(-1.2684380046f*l+2.6097574011f*m-.3413193965f*s),ToSrgb(-.0041960863f*l-.7034186147f*m+1.7076147010f*s),alpha);}
  // ---- atmosphere: drifting low fog cards (High and Medium) ----------------------------------------------------------------------
  ParticleSystem fogCards;bool fogReady;
  /// <summary>A few very large, very faint lit puffs drifting low over the board in the night and cold biomes (marsh mist, frost
  /// drift, the zombie and eyeball arenas): depth without a full-screen pass. Off on Low (overdraw on phones).</summary>
  void FogCards(string biome){
   if(fogCards==null){var go=new GameObject("Fog cards");go.transform.SetParent(transform,false);fogCards=go.AddComponent<ParticleSystem>();fogCards.Stop(true,ParticleSystemStopBehavior.StopEmittingAndClear);var r=go.GetComponent<ParticleSystemRenderer>();r.sharedMaterial=pool.alphaPuff;r.shadowCastingMode=ShadowCastingMode.Off;r.receiveShadows=false;r.sortMode=ParticleSystemSortMode.Distance;var m=fogCards.main;m.playOnAwake=false;m.loop=true;m.simulationSpace=ParticleSystemSimulationSpace.World;var sh=fogCards.shape;sh.enabled=true;sh.shapeType=ParticleSystemShapeType.Box;}
   fogCards.Stop(true,ParticleSystemStopBehavior.StopEmittingAndClear);fogReady=false;
   // Not the portal void: its dark floor lost a third of the path-to-ground contrast under the cards (QA 2.19 -> 1.84 on High).
   bool night=biome=="marsh"||biome=="arena"&&(EntranceBossHint=="zombie"||EntranceBossHint=="eyeball"),cold=biome=="frost";
   if(!CarrotQuality.Rich||!(night||cold)){fogCards.gameObject.SetActive(false);return;}
   fogCards.gameObject.SetActive(true);var main=fogCards.main;int count=CarrotQuality.High?10:7;main.maxParticles=count;main.startLifetime=26;main.startSize=new ParticleSystem.MinMaxCurve(4.5f,7.5f);main.startSpeed=0;main.startRotation=new ParticleSystem.MinMaxCurve(0,6.28f);
   // Half the first pass's alpha: at .08-.09 the cards veiled the marsh paths to 1.92:1 (QA path-to-ground floor is 2:1).
   Color c=biome=="marsh"?new Color(.55f,.7f,.68f,.045f):cold?new Color(.9f,.94f,1,.04f):new Color(.5f,.62f,.55f,.04f);main.startColor=c;
   var em=fogCards.emission;em.enabled=true;em.rateOverTime=count/26f;var shape=fogCards.shape;shape.position=new Vector3(0,.55f,0);shape.scale=new Vector3(20,.4f,15);
   var vel=fogCards.velocityOverLifetime;vel.enabled=true;vel.space=ParticleSystemSimulationSpace.World;vel.x=.12f;vel.y=0;vel.z=.04f;
   var col=fogCards.colorOverLifetime;col.enabled=true;var g=new Gradient();g.SetKeys(new[]{new GradientColorKey(Color.white,0),new GradientColorKey(Color.white,1)},new[]{new GradientAlphaKey(0,0),new GradientAlphaKey(1,.25f),new GradientAlphaKey(1,.75f),new GradientAlphaKey(0,1)});col.color=g;
   fogCards.Simulate(20,true,true,false);fogReady=true;
  }
  /// <summary>Set by the view before Ambient: the level's boss id (picks the arena fog).</summary>
  public string EntranceBossHint="";
  bool RunBeat(Op op,Vector3 a,Vector3 b,Color c,float f,int i,float t){
   switch(op){case Op.SuperCore:SuperCore(a,c);return true;default:return false;}
  }
 }
}
