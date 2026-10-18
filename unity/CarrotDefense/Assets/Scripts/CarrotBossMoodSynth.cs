using System;
using System.Collections;
using UnityEngine;

namespace CarrotTD {
 /// <summary>
 /// BOSS MOOD sound, rendered at level load (no files, 0 bytes of download): the foreboding drones of the six campaign guardian
 /// levels and the mood one-shots (distant crows before Old Hollowhead, the first natural sound after a guardian falls, Asuna's
 /// falling chime cascade). Presentation only: nothing here reads or writes the simulation.
 ///
 /// Rules the recipes keep: no rising pitch, no 20-150 Hz amplitude modulation (roughness
 /// is the alarm channel), no reversed swells and no beat; energy sits at 120-1000 Hz so phone speakers carry it (the low root is
 /// a virtual pitch built from its harmonics); pitched layers are open fifths on pitch classes that every confident key of the
 /// level's playlist contains (TonePitchClasses), and they drop 6 dB under an unconfident track. Every timbre stays outside the
 /// cue banks the rules already speak with (Wood = garden windups, Glass = frost windups, Bell = phase breaks, IncomingGround and
 /// SubThump = the wave call, the boss layers), which is why there are no creaks, bells, drums, cracks or rumbles here.
 ///
 /// Shim-safe (System.Math and Mathf only), so scripts/carrot-sim compiles it for offline analysis. Deterministic: fixed seeds,
 /// fixed recipes. Tone partials sit on multiples of 1/12 Hz, so a 12 s loop is exactly periodic; noise layers get the beds'
 /// 2 s equal-power seam (the two ends are uncorrelated, so equal power keeps the level).
 /// </summary>
 public static class CarrotBossMoodSynth {
  public const int Rate=22050;
  public const float LoopSeconds=12,SeamSeconds=2,TargetRmsDb=-24;
  public static int LoopSamples=>(int)(LoopSeconds*Rate);
  const int Slice=Rate/8,Control=32;
  static readonly string[] Campaign={"brambleback","lantern","winter","brambleback-autumn","hollowhead","hollowhead-finale"};

  /// <summary>Drone layers of a profile: an unpitched "air" layer and a pitched "tone" layer on the six campaign guardian levels;
  /// none on the challenges, whose guardian theme plays from the first wave (a drone there would sit under the score).</summary>
  public static string[] DroneLayers(string profile){return Array.IndexOf(Campaign,profile)>=0?new[]{"air","tone"}:new string[0];}
  /// <summary>Pitch classes (0 = C) of the tone layer. Brambleback: D and A (A minor and B minor both hold them); Lantern Regent,
  /// the autumn Brambleback and Old Hollowhead: C and G (C minor and A minor); Crown of Winter: F and C (A minor and B-flat minor).</summary>
  public static int[] TonePitchClasses(string profile){switch(profile){case "brambleback":return new[]{2,9};case "winter":return new[]{5,0};case "lantern":case "brambleback-autumn":case "hollowhead":case "hollowhead-finale":return new[]{0,7};default:return new int[0];}}
  /// <summary>True when every pitch class lies in the key's scale (key = root 0-11, +12 minor, as Carrot_MusicKey reports it).</summary>
  public static bool KeyFits(int key,int[] pitchClasses){
   if(key<0||pitchClasses==null)return false;int root=key%12;bool minor=key>=12;int[] scale=minor?new[]{0,2,3,5,7,8,10}:new[]{0,2,4,5,7,9,11};
   foreach(int pc in pitchClasses){int d=((pc-root)%12+12)%12;if(Array.IndexOf(scale,d)<0)return false;}return true;
  }
  /// <summary>Relative level of each layer in the drone mix (amplitude; the two are uncorrelated, so their squares sum to 1).</summary>
  public static float LayerMix(string profile,string layer){
   float tone=profile=="winter"?.42f:profile=="lantern"?.55f:profile=="hollowhead-finale"?.66f:.6f;
   return layer=="tone"?tone:(float)Math.Sqrt(1-tone*tone);
  }
  /// <summary>The first natural sound after the guardian falls: a bird, a frog, icicle drips or a cricket (the finale's dawn gets
  /// the garden bird the orchard never had); Asuna's stage gets a falling chime cascade. Null when the level has none.</summary>
  public static string ReleaseCall(string profile){switch(profile){case "brambleback":case "hollowhead-finale":return "bird";case "lantern":return "frog";case "winter":return "drips";case "brambleback-autumn":case "hollowhead":return "cricket";case "asuna":return "cascade";default:return null;}}
  /// <summary>Distant crows before Old Hollowhead (sound only: a scenery crow would be a false creature).</summary>
  public static bool Crows(string profile){return profile=="hollowhead"||profile=="hollowhead-finale";}
  public static readonly string[] OneShots={"crowA","crowB","crowC","bird","frog","cricket","drips","cascade"};

  // ---------------- small deterministic DSP kit ----------------
  sealed class Rng {uint s;public Rng(uint seed){s=seed==0?1u:seed;}public float U(){s^=s<<13;s^=s>>17;s^=s<<5;return (s>>8)*(1f/16777216f);}public float S(){return U()*2-1;}}
  sealed class Pink {float b0,b1,b2;public float Next(float w){b0=.99765f*b0+w*.099046f;b1=.963f*b1+w*.2965164f;b2=.57f*b2+w*1.0526913f;return (b0+b1+b2+w*.1848f)*.25f;}}
  /// <summary>Topology-preserving state-variable filter; coefficients are set at control rate.</summary>
  sealed class Svf {
   float ic1,ic2,a1,a2,a3,k;public float lp,bp,hp;
   public Svf Set(float cut,float q){float g=(float)Math.Tan(Math.PI*Mathf.Clamp(cut,20,Rate*.45f)/Rate);k=1/Mathf.Max(.3f,q);a1=1/(1+g*(g+k));a2=g*a1;a3=g*a2;return this;}
   public void Run(float x){float v3=x-ic2,v1=a1*ic1+a2*v3,v2=ic2+a2*ic1+a3*v3;ic1=2*v1-ic1;ic2=2*v2-ic2;lp=v2;bp=v1;hp=x-k*v1-v2;}
  }
  /// <summary>Exactly periodic sine: frequency rounded to a multiple of 1/12 Hz, advanced by a rotation (no per-sample Sin).</summary>
  sealed class Osc {
   double c,s;readonly double cw,sw;public readonly double f;
   public Osc(double hz,double phase){f=Math.Round(hz*LoopSeconds)/LoopSeconds;double w=2*Math.PI*f/Rate;cw=Math.Cos(w);sw=Math.Sin(w);c=Math.Cos(phase);s=Math.Sin(phase);}
   public float Sin=>(float)s;public float Cos=>(float)c;
   public void Step(){double nc=c*cw-s*sw;s=s*cw+c*sw;c=nc;}
   public void Renorm(){double m=1/Math.Sqrt(c*c+s*s);c*=m;s*=m;}
  }
  static float Lfo(int i,float period,float phase=0){return (float)Math.Sin(2*Math.PI*(i/(double)Rate/period+phase));}
  static uint Seed(string a,string b){uint h=2166136261u;foreach(char c in a+"/"+b){h^=c;h*=16777619u;}return h^0x6D2B79F5u;}
  static float Bell(float f,float centre,float octaves){double d=Math.Log(f/centre,2)/octaves;return (float)Math.Exp(-.5*d*d);}
  static float LowPass(float f,float cut,float order=4){return (float)(1/Math.Sqrt(1+Math.Pow(f/cut,order)));}

  // ---------------- drones ----------------
  /// <summary>Renders one 12 s loop of a profile's drone layer (RMS -24 dBFS, mono, 22.05 kHz); yields every 0.125 s of audio.</summary>
  public static IEnumerator RenderDrone(string profile,string layer,Action<float[]> done){
   int loop=LoopSamples;bool tone=layer=="tone";int total=tone?loop:loop+(int)(SeamSeconds*Rate);
   var x=new float[total];var r=new Rng(Seed(profile,layer));
   if(tone){
    var stack=ToneStack(profile,r);
    for(int start=0;start<total;start+=Slice){stack.Run(x,start,Math.Min(total,start+Slice));yield return null;}
   }else{
    var air=new Air(profile,r);
    for(int start=0;start<total;start+=Slice){air.Run(x,start,Math.Min(total,start+Slice));yield return null;}
   }
   var pcm=tone?x:Seam(x,loop);
   Normalize(pcm,TargetRmsDb);
   done(pcm);
  }
  static float[] Seam(float[] x,int loop){int xf=x.Length-loop;var o=new float[loop];for(int i=0;i<loop;i++){float v=x[i];if(i<xf){double t=i/(double)xf;v=(float)(x[i]*Math.Sin(t*Math.PI*.5)+x[loop+i]*Math.Cos(t*Math.PI*.5));}o[i]=v;}return o;}
  public static float RmsDb(float[] pcm){double s=0;foreach(var v in pcm)s+=v*v;return pcm.Length==0?-120:(float)(20*Math.Log10(Math.Max(1e-9,Math.Sqrt(s/pcm.Length))));}
  static void Normalize(float[] pcm,float db){double s=0;foreach(var v in pcm)s+=v*v;double rms=Math.Sqrt(s/Math.Max(1,pcm.Length));if(rms<=0)return;float g=(float)(Math.Pow(10,db/20)/rms);for(int i=0;i<pcm.Length;i++)pcm[i]*=g;}

  /// <summary>A bank of exactly periodic partials, each with a slow level wander whose period divides the loop, under a
  /// 1/12 Hz breath (3 dB). Optional vibrato (cold strings) is phase modulation from a 4.5 Hz phasor (54 cycles per loop).</summary>
  sealed class Stack {
   readonly Osc[] osc;readonly float[] amp,wanderDepth,wanderPeriod,wanderPhase,vibBeta;readonly Osc vib;readonly float breath;
   public Stack(double[] hz,float[] amps,Rng r,float breathDepth,double vibratoCents=0){
    int n=hz.Length;osc=new Osc[n];amp=amps;wanderDepth=new float[n];wanderPeriod=new float[n];wanderPhase=new float[n];vibBeta=new float[n];breath=breathDepth;
    float[] periods={12,6,4,3};
    for(int i=0;i<n;i++){osc[i]=new Osc(hz[i],r.U()*2*Math.PI);wanderDepth[i]=.12f+.12f*r.U();wanderPeriod[i]=periods[(int)(r.U()*periods.Length)%periods.Length];wanderPhase[i]=r.U();
     // phase deviation for a +-cents vibrato at 4.5 Hz: beta = f*(2^(c/1200)-1)/4.5 radians
     vibBeta[i]=vibratoCents>0?(float)(osc[i].f*(Math.Pow(2,vibratoCents/1200)-1)/4.5):0;}
    vib=vibratoCents>0?new Osc(4.5,0):null;
   }
   float[] g;float b=1;
   public void Run(float[] x,int from,int to){
    int n=osc.Length;if(g==null)g=new float[n];
    for(int i=from;i<to;i++){
     // control points are absolute sample positions, so the render does not depend on how it is sliced
     if(i%Control==0){for(int k=0;k<n;k++)g[k]=amp[k]*(1+wanderDepth[k]*Lfo(i,wanderPeriod[k],wanderPhase[k]));b=1+breath*Lfo(i,LoopSeconds,.25f);}
     float sum=0;
     if(vib==null){for(int k=0;k<n;k++){sum+=osc[k].Sin*g[k];osc[k].Step();}}
     else{float vc=vib.Cos;for(int k=0;k<n;k++){float B=vibBeta[k]*vc,B2=B*B;float sB=B*(1-B2/6*(1-B2/20*(1-B2/42))),cB=1-B2/2*(1-B2/12*(1-B2/30));sum+=(osc[k].Sin*cB+osc[k].Cos*sB)*g[k];osc[k].Step();}vib.Step();}
     x[i]+=sum*b;
     if((i&2047)==0){for(int k=0;k<n;k++)osc[k].Renorm();vib?.Renorm();}
    }
   }
  }
  /// <summary>Partials for a virtual root: harmonic numbers, weights n^-tilt shaped by a formant bump and a low-pass, each with a
  /// detuned twin (beats of 0.3-1.7 Hz: slow life, never roughness).</summary>
  static Stack Harmonics(double root,int[] ns,float tilt,float formant,float formantOct,float lp,float[] twinsCents,float twinLevel,Rng r,float breath){
   var hz=new System.Collections.Generic.List<double>();var a=new System.Collections.Generic.List<float>();
   foreach(int n in ns){double f=root*n;float w=(float)Math.Pow(n,-tilt)*(.3f+.7f*Bell((float)f,formant,formantOct))*LowPass((float)f,lp);hz.Add(f);a.Add(w);
    foreach(float c in twinsCents){hz.Add(f*Math.Pow(2,c/1200));a.Add(w*twinLevel);}}
   return new Stack(hz.ToArray(),a.ToArray(),r,breath);
  }
  static Stack ToneStack(string profile,Rng r){
   switch(profile){
    // Brambleback: low brass on a virtual D1 (36.7 Hz), D and A partials only (110-881 Hz), formant 500 Hz, low-passed at 900 Hz.
    case "brambleback":return Harmonics(36.708,new[]{3,4,6,8,12,16,24},.6f,500,.9f,900,new[]{5f},.7f,r,.18f);
    // The forest followed you: the same brass on a virtual C1 (32.7 Hz), C and G partials (131-785 Hz), formant 450 Hz.
    case "brambleback-autumn":return Harmonics(32.703,new[]{4,6,8,12,16,24},.6f,450,.9f,900,new[]{5f},.7f,r,.18f);
    // Lantern Regent: a drowned hum on C and G under the /u/ formant (F1 300, F2 870 Hz), low-passed at 1.2 kHz like water over it.
    case "lantern":{var s=Harmonics(65.406,new[]{2,3,4,6,8,12},.8f,300,.7f,1200,new[]{4f},.6f,r,.2f);return s;}
    // Crown of Winter: cold high strings, a static open-fifth cluster F5 698 / C6 1047 / F6 1397 Hz, bowed (2nd and 3rd
    // harmonics at -12 and -18 dB), 4.5 Hz vibrato of 3 cents, each string doubled 4 cents sharp so it shimmers without moving.
    case "winter":{
     double[] notes={698.456,1046.502,1396.913};var hz=new System.Collections.Generic.List<double>();var a=new System.Collections.Generic.List<float>();
     foreach(double f in notes)for(int h=1;h<=3;h++){float w=(h==1?1f:h==2?.25f:.125f)*(f>1200?.7f:1f);hz.Add(f*h);a.Add(w);hz.Add(f*h*Math.Pow(2,4/1200.0));a.Add(w*.6f);}
     return new Stack(hz.ToArray(),a.ToArray(),r,.15f,3);}
    // Old Hollowhead: the harvest hum on a virtual C2 (65.4 Hz), C and G partials (131-785 Hz), formant 400 Hz, low-passed at 1 kHz.
    case "hollowhead":return Harmonics(65.406,new[]{2,3,4,6,8,12},.6f,400,.9f,1000,new[]{5f},.7f,r,.18f);
    // The Last Light: the same hum an octave deeper (G2 98 Hz up to G5 785 Hz) and thicker (a second twin), darker (formant 350 Hz).
    case "hollowhead-finale":return Harmonics(32.703,new[]{3,4,6,8,12,16,24},.6f,350,1f,800,new[]{5f,-7f},.55f,r,.2f);
    default:return new Stack(new double[0],new float[0],r,0);
   }
  }
  /// <summary>Unpitched layers: filtered pink noise whose filters move with periodic LFOs (periods that divide the loop).</summary>
  sealed class Air {
   readonly string p;readonly Rng r;readonly Pink p1=new Pink(),p2=new Pink(),p3=new Pink();readonly Svf hp=new Svf(),lp=new Svf(),f1=new Svf(),f2=new Svf(),f3=new Svf(),f4=new Svf(),hi=new Svf(),post=new Svf(),post2=new Svf();
   float rustle,rustleTarget;int rustleHold;float swell,morph;
   public Air(string profile,Rng rng){p=profile;r=rng;float cut=profile=="winter"?950:profile=="lantern"?1000:750;post.Set(cut,.7f);post2.Set(cut,.7f);}
   public void Run(float[] x,int from,int to){
    for(int i=from;i<to;i++){
     if(i%Control==0)Coefficients(i);
     float w=r.S(),n1=p1.Next(w),n2=p2.Next(r.S()),low=0,high=0;
     switch(p){
      case "brambleback":case "brambleback-autumn":{
       // The forest closing in: low canopy wind (pink, 110-560 Hz), a pressing band at 260 Hz, and leaves high and sparse.
       hp.Run(n1);lp.Run(hp.hp);f1.Run(n2);
       if(--rustleHold<=0){rustleHold=(int)(Rate*(.08f+r.U()*.3f));rustleTarget=r.U()<.3f?r.U():0;}
       rustle+=(rustleTarget-rustle)*.0015f;hi.Run(w);
       low=lp.lp*swell+f1.bp*.55f;high=hi.bp*.02f*rustle;
       // autumn: dry leaves in the wind (1.5-4 kHz), swelling with the loop
       if(p=="brambleback-autumn"){f4.Run(p3.Next(r.S()));high+=f4.bp*.02f*(.4f+.6f*swell);}
       break;}
      case "lantern":{
       // Pulled under: breath through two vowel formants morphing /u/ (300, 870 Hz) to /o/ (450, 800 Hz) and back, low-passed at 1.4 kHz.
       f1.Run(n1);f2.Run(n1);float voice=f1.bp+.7f*f2.bp;lp.Run(voice);hp.Run(n2);
       low=lp.lp*swell+hp.lp*.25f;
       break;}
      case "winter":{
       // White-out: blizzard bands at 400 and 900 Hz with gusts, and a thinning choir breath on /a/ (700, 1100 Hz).
       f1.Run(n1);f2.Run(n1);f3.Run(n2);f4.Run(n2);
       low=(f1.bp*.9f+f2.bp*.3f)*swell+(f3.bp+.25f*f4.bp)*.6f*morph;
       break;}
      default:{ // hollowhead, hollowhead-finale
       // A dusk that never ends: low evening wind under dry stalks (1.5-4 kHz); the finale adds a pressing band at 180 Hz.
       hp.Run(n1);lp.Run(hp.hp);f4.Run(p3.Next(r.S()));
       low=lp.lp*(.75f+.25f*swell);high=f4.bp*.03f*swell;
       if(p=="hollowhead-finale"){f1.Run(n2);low+=f1.bp*.45f;}
       break;}
     }
     // A second low-pass keeps the energy in the 120-1000 Hz band phones carry (and the layer under the music, not over it).
     post.Run(low);post2.Run(post.lp);
     x[i]+=post2.lp+high;
    }
   }
   void Coefficients(int i){
    swell=.7f+.3f*Lfo(i,LoopSeconds);
    switch(p){
     case "brambleback":case "brambleback-autumn":hp.Set(110,.7f);lp.Set(560+120*Lfo(i,6,.2f),.7f);f1.Set(260,1.5f);hi.Set(2600,.8f);f4.Set(2800,1.2f);break;
     case "lantern":{float m=.5f-.5f*Lfo(i,LoopSeconds,.25f);f1.Set(300+150*m,6);f2.Set(870-70*m,6);lp.Set(1400,.7f);hp.Set(180,.8f);break;}
     case "winter":{morph=.75f+.25f*Lfo(i,6,.6f);f1.Set(400+40*Lfo(i,4,.1f),5);f2.Set(900+60*Lfo(i,3,.4f),5);f3.Set(700,8);f4.Set(1100,8);swell=.55f+.45f*(float)Math.Max(0,Lfo(i,LoopSeconds,.1f));break;}
     default:hp.Set(110,.7f);lp.Set(480+80*Lfo(i,6,.3f),.7f);f4.Set(2200,.9f);f1.Set(180,1.2f);break;
    }
   }
  }

  // ---------------- one-shots ----------------
  /// <summary>Mood one-shots, peak-normalised to 0.5 (the player sets the level). Deterministic per kind.</summary>
  public static float[] RenderOneShot(string kind){
   var r=new Rng(Seed("oneshot",kind));float[] x;
   switch(kind){
    case "crowA":case "crowB":case "crowC":x=Crow(r,kind=="crowA"?3:2,kind=="crowC"?.9f:1);break;
    case "bird":x=Bird(r);break;
    case "frog":x=Frog(r);break;
    case "cricket":x=Cricket(r);break;
    case "drips":x=Drips(r);break;
    case "cascade":x=Cascade();break;
    default:x=new float[1];break;
   }
   float peak=0;foreach(var v in x)peak=Math.Max(peak,Math.Abs(v));if(peak>0)for(int i=0;i<x.Length;i++)x[i]*=.5f/peak;
   int fade=Math.Min(x.Length,Rate/200);for(int i=0;i<fade;i++)x[x.Length-1-i]*=i/(float)fade;
   return x;
  }
  /// <summary>A distant crow: 2-3 caws, each a harmonic rasp on 600-850 Hz falling a little (partials to 2.5 kHz), softened and
  /// distant (low-passed); the caws slow down, never speed up.</summary>
  static float[] Crow(Rng r,int caws,float pitch){
   float gap=.36f,len=.3f;var x=new float[(int)((caws*gap+.5f)*Rate)];
   for(int c=0;c<caws;c++){
    float f0=(650+180*r.U())*pitch,l=len*(.85f+.3f*r.U());int at=(int)((c*gap*(1+.08f*c)+.02f)*Rate),n=(int)(l*Rate);double ph=0;var bp=new Svf().Set(1500,1.1f);var lpf=new Svf().Set(2600,.7f);
    for(int i=0;i<n&&at+i<x.Length;i++){
     float t=i/(float)Rate,u=t/l,f=f0*(1-.08f*u);ph+=2*Math.PI*f/Rate;
     float env=Mathf.Min(1,t/.012f)*(float)Math.Exp(-u*1.6f)*Mathf.Min(1,(l-t)/.05f);
     float tone=(float)(Math.Sin(ph)+.8*Math.Sin(2*ph)+.55*Math.Sin(3*ph)+.3*Math.Sin(4*ph));
     float rasp=r.S()*.35f;bp.Run(tone*.6f+rasp);lpf.Run(bp.bp+tone*.15f);
     x[at+i]+=lpf.lp*env;
    }
   }
   return x;
  }
  /// <summary>One garden bird: a short phrase of 3-5 chirps on 2.6-4.2 kHz, the beds' recipe.</summary>
  static float[] Bird(Rng r){
   var x=new float[(int)(1.1f*Rate)];float basef=3000+800*r.U(),dir=-1;int chirps=4;
   for(int k=0;k<chirps;k++){float l=.06f+.03f*r.U(),f0=basef*(1+.06f*k*dir),f1=f0*1.3f;float start=.03f+k*(.11f+.03f*r.U());double ph=0;int at=(int)(start*Rate),n=(int)(l*Rate);
    for(int i=0;i<n&&at+i<x.Length;i++){float t=i/(float)Rate,u=t/l,f=Mathf.Lerp(f0,f1,u)*(1+.02f*(float)Math.Sin(2*Math.PI*28*t));ph+=2*Math.PI*f/Rate;x[at+i]+=(float)Math.Sin(ph)*(float)Math.Sin(Math.PI*u)*(float)Math.Exp(-u*1.5f);}}
   return x;
  }
  /// <summary>One frog: a pulsed croak at about 330 Hz, the marsh bed's recipe.</summary>
  static float[] Frog(Rng r){
   float l=.42f,pulse=20,f0=330*(1+.03f*r.S());var x=new float[(int)((l+.05f)*Rate)];double ph=0,pm=0;
   for(int i=0;i<(int)(l*Rate);i++){float t=i/(float)Rate,u=t/l,gate=(float)Math.Pow(Math.Max(0,Math.Sin(Math.PI*pulse*t)),2);pm+=2*Math.PI*f0*1.5f/Rate;ph+=2*Math.PI*f0/Rate+2.2f*Math.Sin(pm)*2*Math.PI*f0*1.5f/Rate*.15f;x[i]=(float)Math.Sin(ph)*gate*(float)Math.Sin(Math.PI*u);}
   return x;
  }
  /// <summary>One cricket: three chirps of four 33 ms pulses at 4.3 kHz.</summary>
  static float[] Cricket(Rng r){
   var x=new float[(int)(1.5f*Rate)];double ph=0;
   for(int c=0;c<3;c++){float at=.02f+c*(.45f+.05f*r.U());for(int i=0;i<(int)(4*.033f*Rate);i++){int j=(int)(at*Rate)+i;if(j>=x.Length)break;float t=i/(float)Rate,p=(t%.033f)/.033f;ph+=2*Math.PI*4300/Rate;x[j]+=(float)Math.Sin(ph)*(p<.5f?(float)Math.Sin(Math.PI*p*2):0);}}
   return x;
  }
  /// <summary>The thaw: six icicle drips over 3 s, short plinks at 2.5-4 kHz that fall a little in pitch.</summary>
  static float[] Drips(Rng r){
   var x=new float[(int)(3.3f*Rate)];
   for(int d=0;d<6;d++){float at=.05f+d*.5f+.15f*r.U(),f0=2500+1500*r.U(),vol=.6f+.4f*r.U();double ph=0;int a=(int)(at*Rate);
    for(int i=0;i<(int)(.25f*Rate)&&a+i<x.Length;i++){float t=i/(float)Rate,f=f0*(1-.04f*Mathf.Min(1,t/.08f));ph+=2*Math.PI*f/Rate;x[a+i]+=(float)Math.Sin(ph)*(float)Math.Exp(-t*28)*Mathf.Min(1,t*2000)*vol;}}
   return x;
  }
  /// <summary>Asuna's fall: a pentatonic cascade falling 3520 to 1760 Hz, 0.2 s apart (the prism riser rises; this only falls).</summary>
  static float[] Cascade(){
   float[] notes={3520,3136,2637,2349.3f,2093,1760};var x=new float[(int)((notes.Length*.2f+1.2f)*Rate)];
   for(int k=0;k<notes.Length;k++){double a=0,b=0;int at=(int)(k*.2f*Rate);float f0=notes[k],vol=1-.08f*k;
    for(int i=0;i<(int)(1.1f*Rate)&&at+i<x.Length;i++){float t=i/(float)Rate;a+=2*Math.PI*f0/Rate;b+=2*Math.PI*f0*2.76f/Rate;x[at+i]+=(float)(Math.Sin(a)+.25*Math.Sin(b)*Math.Exp(-t*8))*(float)Math.Exp(-t*3.2f)*Mathf.Min(1,t*400)*vol;}}
   return x;
  }
 }
}
