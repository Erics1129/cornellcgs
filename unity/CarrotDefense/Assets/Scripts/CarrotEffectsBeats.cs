using UnityEngine;

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
  /// <summary>Boss death: a radial burst, a shockwave, a coin shower and 0.6 s at 0.3 speed (presentation and simulation). The
  /// challenge bosses, the Portal and Asuna add their own recipes on top; the campaign guardians had only the generic death before.</summary>
  void BossDeathBeat(CarrotEvent e){
   Vector3 p=e.position;Color tone=Tone(e.kind);Vector3 core=p+Vector3.up*1.1f;
   Flash(core,3.2f,.22f,new Color(1,.97f,.9f,.95f),FxSheet.Star6,R(0,360));Flash(core,2.4f,.6f,new Color(tone.r,tone.g,tone.b,.6f),FxSheet.GlowSoft);
   RingFx(p,.3f,4.6f,.9f,Hot(new Color(1,.9f,.65f,.9f),1.8f),2,1.4f);RingFx(p,.2f,3.2f,.7f,Hot(new Color(tone.r,tone.g,tone.b,.8f),1.6f),1,1.5f,false,.12f);Disc(p,.6f,3f,.7f,new Color(1,.85f,.5f,.8f),1.8f);
   Sparks(core,N(36),2.2f,4.6f,1.1f,new Color(1,.85f,.45f),Vector3.zero,1,.13f);Debris(core,N(26),FxSheet.Shard,.09f,.17f,1.6f,3.6f,1.4f,new Color(1,.86f,.5f),500);
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
  /// <summary>Boss, miniboss and creature effect colours keep their element hue but are pushed (in OKLab, toward the threat pink) until
  /// they sit at least 0.09 from every tower family's colour, so a boss's frost never reads as the player's Frost.</summary>
  static Color Separated(string kind,Color c){
   if(string.IsNullOrEmpty(kind)||System.Array.IndexOf(AllyKinds,kind)>=0||kind=="merge"||kind=="mergeUndo"||kind=="super")return c;
   if(separated.TryGetValue(kind,out var cached))return cached;
   if(allyLab==null){allyLab=new Vector3[AllyKinds.Length];for(int i=0;i<AllyKinds.Length;i++)allyLab[i]=OkLab(ToneRaw(AllyKinds[i]));}
   Vector3 lab=OkLab(c),threat=OkLab(Threat);Color result=c;
   if(MinAllyDistance(lab)<.09f){float lo=0,hi=1;for(int it=0;it<14;it++){float mid=(lo+hi)*.5f;if(MinAllyDistance(Vector3.Lerp(lab,threat,mid))>=.095f)hi=mid;else lo=mid;}result=FromOkLab(Vector3.Lerp(lab,threat,hi),c.a);}
   separated[kind]=result;return result;
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
  bool RunBeat(Op op,Vector3 a,Vector3 b,Color c,float f,int i,float t){
   switch(op){case Op.SuperCore:SuperCore(a,c);return true;default:return false;}
  }
 }
}
