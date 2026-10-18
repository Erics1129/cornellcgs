using System;
using System.Collections;
using System.Collections.Generic;
using UnityEngine;

namespace CarrotTD {
 /// <summary>
 /// Procedural, seamless 24 s ambience beds, one per biome, synthesised at level load (no audio files, 0 bytes of
 /// download): garden wind and birds, marsh frogs and insects, frost band-passed wind howl, orchard crickets, arena low
 /// drone and prism shimmer. Each loop is rendered 2 s long and its tail is equal-power crossfaded into its head, then
 /// RMS-normalised to -24 dBFS and played at -6 dB (about -30 dBFS before the master bus). The bed sits 6 dB lower while
 /// enemies are alive and follows the music ducks, so it fills breathers without masking combat. Rendering is
 /// time-sliced (one second of audio per frame) so a level load never hitches.
 /// </summary>
 public sealed class CarrotAmbience {
  public const int Rate=22050;
  public const float LoopSeconds=24,Crossfade=2,TargetRmsDb=-24,PlayGain=.5f;
  public static readonly string[] Biomes={"garden","marsh","frost","orchard","arena","prism"};
  readonly AudioSource source;readonly List<AudioClip> made=new List<AudioClip>();
  readonly Dictionary<string,AudioClip> cache=new Dictionary<string,AudioClip>();
  string biome="";float level,target;int buildId;
  public string Biome=>biome;
  /// <summary>BOSS MOOD: the boss-mood privation gain on the bed's output (1 everywhere else; CarrotAudioBossMood owns it).</summary>
  public float MoodGain=1;
  public bool Ready=>source!=null&&source.clip!=null&&cache.ContainsKey(biome);
  public float LastBuildMs {get;private set;}
  public CarrotAmbience(AudioSource source){this.source=source;if(source!=null){source.loop=true;source.volume=0;source.priority=200;}}

  /// <summary>Starts building (or reuses) the bed for the biome; run the enumerator as a coroutine.</summary>
  public IEnumerator Use(string next){
   next=Normalize(next);int id=++buildId;
   if(next==biome&&Ready)yield break;
   biome=next;level=0;if(source!=null){source.Stop();source.clip=null;}
   if(!cache.TryGetValue(next,out var clip)){
    float[] pcm=null;var sw=System.Diagnostics.Stopwatch.StartNew();long work=0;
    var build=Render(next,data=>pcm=data);
    while(true){sw.Start();bool more=build.MoveNext();sw.Stop();work=sw.ElapsedMilliseconds;if(!more)break;if(id!=buildId)yield break;yield return null;}
    LastBuildMs=work;
    clip=AudioClip.Create("Ambience "+next,pcm.Length,1,Rate,false);clip.SetData(pcm,0);cache[next]=clip;made.Add(clip);
    Debug.Log("CARROT_AMBIENCE "+next+" ms="+work+" rms="+RmsDb(pcm).ToString("F1"));
   }
   if(id!=buildId||source==null)yield break;
   source.clip=clip;source.time=0;source.Play();
  }
  public static string Normalize(string b){return b=="marsh"||b=="frost"||b=="orchard"||b=="arena"||b=="prism"?b:"garden";}
  /// <summary>combat: enemies alive; duck: the music-duck gain mirror (0..1); volume: SFX preference x mute.</summary>
  public void Tick(float dt,bool combat,float duck,float volume,bool paused){
   if(source==null||source.clip==null)return;
   target=PlayGain*(combat?.5f:1)*Mathf.Clamp01(duck)*Mathf.Clamp01(volume);
   level=Mathf.MoveTowards(level,target,dt*(target<level?.9f:.25f));
   source.volume=level*Mathf.Clamp01(MoodGain); // BOSS MOOD
   if(paused&&source.isPlaying)source.Pause();else if(!paused&&!source.isPlaying&&level>0)source.UnPause();
  }
  public void Stop(){buildId++;if(source!=null){source.Stop();source.clip=null;}biome="";}
  public void Dispose(){Stop();foreach(var c in made)if(c!=null)UnityEngine.Object.Destroy(c);made.Clear();cache.Clear();}

  // ---------------- synthesis ----------------
  /// <summary>Renders the loop; yields once per second of audio rendered. Deterministic per biome. BOSS MOOD: life=false renders the
  /// bare bed (the wind without its birds, frogs, creaks, crickets or pings) with the full bed's RNG draws, gain and ceiling.</summary>
  public static IEnumerator Render(string biome,Action<float[]> done,bool life=true){
   biome=Normalize(biome);
   int loop=(int)(LoopSeconds*Rate),total=loop+(int)(Crossfade*Rate);
   var x=new float[total];uint h=2166136261u;foreach(char c in biome){h^=c;h*=16777619u;}var r=new Rng(h^0xA511E9B3u);
   // Pre-scheduled events (birds, croaks, chirps, creaks, pings) are short and rendered whole.
   var ev=life?x:new float[total]; // BOSS MOOD: the bare bed renders its events into a scratch buffer
   switch(biome){
    case "garden":Birds(ev,r);break;
    case "marsh":Frogs(ev,r);break;
    case "frost":Creaks(ev,r);break;
    case "orchard":Crickets(ev,r);break;
    case "prism":Pings(ev,r);break;
   }
   yield return null;
   var bed=new Bed(biome,r);
   int slice=life?Rate:Rate/8; // BOSS MOOD: the bare bed renders in finer slices (the default render keeps one second per frame)
   for(int start=0;start<total;start+=slice){int end=Math.Min(total,start+slice);for(int i=start;i<end;i++)x[i]+=bed.Next(i/(float)Rate);yield return null;}
   // BOSS MOOD: the bare bed takes the full bed's gain and ceiling (BareBed), so its wind matches the full bed's sample for sample.
   if(!life){float[] bare=null;var finish=BareBed(x,ev,loop,d=>bare=d);while(finish.MoveNext())yield return null;done(bare);yield break;}
   // Seamless loop: the 2 s tail fades into the head (equal power), then the tail is dropped.
   int xf=total-loop;var outPcm=new float[loop];
   for(int i=0;i<loop;i++){float v=x[i];if(i<xf){float t=i/(float)xf;v=x[i]*Mathf.Sin(t*Mathf.PI*.5f)+x[loop+i]*Mathf.Cos(t*Mathf.PI*.5f);}outPcm[i]=v;}
   double sum=0;for(int i=0;i<loop;i++)sum+=outPcm[i]*outPcm[i];
   float rms=(float)Math.Sqrt(sum/loop),gain=rms>0?Mathf.Pow(10,TargetRmsDb/20)/rms:1;
   float peak=0;for(int i=0;i<loop;i++){outPcm[i]*=gain;peak=Mathf.Max(peak,Mathf.Abs(outPcm[i]));}
   // A gentle ceiling (rare bird peaks): soft-clip above 0.5 so a loud call never pokes out of the bed.
   if(peak>.5f)for(int i=0;i<loop;i++){float v=outPcm[i];outPcm[i]=Mathf.Abs(v)<.35f?v:Mathf.Sign(v)*(.35f+.15f*(float)Math.Tanh((Mathf.Abs(v)-.35f)/.15f));}
   done(outPcm);
  }
  /// <summary>BOSS MOOD: the bare bed. The full mix (events + wind, summed exactly as the default render sums them) sets the gain
  /// and the soft-clip decision; the wind alone is shaped with them.</summary>
  static IEnumerator BareBed(float[] wind,float[] ev,int loop,Action<float[]> done){
   int total=wind.Length,xf=total-loop,chunk=Rate*2;var full=new float[loop];var bare=new float[loop];
   for(int s0=0;s0<loop;s0+=chunk){int s1=Math.Min(loop,s0+chunk);for(int i=s0;i<s1;i++){float v=ev[i]+wind[i],w=wind[i];if(i<xf){float t=i/(float)xf,a=Mathf.Sin(t*Mathf.PI*.5f),b=Mathf.Cos(t*Mathf.PI*.5f);v=v*a+(ev[loop+i]+wind[loop+i])*b;w=w*a+wind[loop+i]*b;}full[i]=v;bare[i]=w;}yield return null;}
   double sum=0;for(int i=0;i<loop;i++)sum+=full[i]*full[i];
   yield return null;
   float rms=(float)Math.Sqrt(sum/loop),gain=rms>0?Mathf.Pow(10,TargetRmsDb/20)/rms:1;
   float peak=0;for(int s0=0;s0<loop;s0+=chunk){int s1=Math.Min(loop,s0+chunk);for(int i=s0;i<s1;i++){peak=Mathf.Max(peak,Mathf.Abs(full[i]*gain));bare[i]*=gain;}yield return null;}
   if(peak>.5f)for(int i=0;i<loop;i++){float v=bare[i];bare[i]=Mathf.Abs(v)<.35f?v:Mathf.Sign(v)*(.35f+.15f*(float)Math.Tanh((Mathf.Abs(v)-.35f)/.15f));}
   done(bare);
  }
  public static float RmsDb(float[] pcm){double s=0;foreach(var v in pcm)s+=v*v;return pcm.Length==0?-120:20*Mathf.Log10(Mathf.Max(1e-9f,(float)Math.Sqrt(s/pcm.Length)));}

  sealed class Rng {uint s;public Rng(uint seed){s=seed==0?1u:seed;}public float U(){s^=s<<13;s^=s>>17;s^=s<<5;return (s>>8)*(1f/16777216f);}public float S(){return U()*2-1;}}
  // Topology-preserving state-variable filter (stable under modulation).
  sealed class Svf {float ic1,ic2;public float lp,bp,hp;public void Run(float x,float cut,float q){float g=Mathf.Tan(Mathf.PI*Mathf.Clamp(cut,20,Rate*.45f)/Rate),k=1/Mathf.Max(.3f,q),a1=1/(1+g*(g+k)),a2=g*a1,a3=g*a2;float v3=x-ic2,v1=a1*ic1+a2*v3,v2=ic2+a2*ic1+a3*v3;ic1=2*v1-ic1;ic2=2*v2-ic2;lp=v2;bp=v1;hp=x-k*v1-v2;}}
  sealed class Pink {float b0,b1,b2;public float Next(float w){b0=.99765f*b0+w*.099046f;b1=.963f*b1+w*.2965164f;b2=.57f*b2+w*1.0526913f;return (b0+b1+b2+w*.1848f)*.25f;}}

  // Continuous beds: a few slow LFOs (periods that divide the 26 s render so motion feels unhurried).
  sealed class Bed {
   readonly string biome;readonly Rng r;readonly Pink p1=new Pink(),p2=new Pink();readonly Svf f1=new Svf(),f2=new Svf(),f3=new Svf();
   float ph1,ph2,ph3;float rustle,rustleTarget;int rustleHold;
   public Bed(string biome,Rng r){this.biome=biome;this.r=r;}
   static float Lfo(float t,float period,float phase=0){return Mathf.Sin(2*Mathf.PI*(t/period+phase));}
   public float Next(float t){
    float w=r.S();
    switch(biome){
     case "garden":{
      // Wind through grass: pink noise, low-passed 380-900 Hz, with a gust swell every ~9 s; leaf rustle on top.
      float gust=.55f+.3f*Lfo(t,8.7f)+.15f*Lfo(t,3.1f,.3f);f1.Run(p1.Next(w),380+520*Mathf.Max(0,gust),.6f);
      if(--rustleHold<=0){rustleHold=(int)(Rate*(.05f+r.U()*.2f));rustleTarget=r.U()<.35f?r.U():0;}
      rustle+=(rustleTarget-rustle)*.002f;f2.Run(w,3200,.7f);
      return f1.lp*1.6f*gust+f2.hp*.05f*rustle;}
     case "marsh":{
      // Still water and a reed bed: low pink noise plus a high insect drone pulsing at 70 Hz, fading in and out.
      f1.Run(p1.Next(w),260,.7f);ph1+=2*Mathf.PI*6100/Rate;ph2+=2*Mathf.PI*70/Rate;float swell=Mathf.Max(0,Lfo(t,13f,.1f));
      float insect=Mathf.Sin(ph1+.6f*Mathf.Sin(ph2*.5f))*Mathf.Pow(.5f+.5f*Mathf.Sin(ph2),3)*swell;
      return f1.lp*1.1f+insect*.05f;}
     case "frost":{
      // Wind howl: two resonant band-passes sweeping 300-1100 Hz over pink noise, plus a low rumble.
      float n=p1.Next(w);float c1=650+380*Lfo(t,6.5f)+120*Lfo(t,2.3f,.2f),c2=900+260*Lfo(t,8.67f,.5f);
      f1.Run(n,c1,6);f2.Run(n,c2,8);f3.Run(p2.Next(r.S()),150,.7f);float gust=.5f+.5f*Mathf.Max(0,Lfo(t,13f,.25f));
      return (f1.bp*.9f+f2.bp*.6f)*gust+f3.lp*.9f;}
     case "orchard":{
      // Warm evening breeze under the crickets.
      f1.Run(p1.Next(w),420+120*Lfo(t,6.5f),.6f);return f1.lp*1.1f*(.7f+.3f*Lfo(t,13f));}
     case "arena":{
      // Low drone: A1 and its fifth with slow beating, through a soft low-pass, over filtered pink noise.
      ph1+=2*Mathf.PI*55/Rate;ph2+=2*Mathf.PI*82.6f/Rate;ph3+=2*Mathf.PI*110.25f/Rate;
      float tone=Mathf.Sin(ph1)+.55f*Mathf.Sin(ph2)+.35f*Mathf.Sin(ph3)*(.6f+.4f*Lfo(t,6.5f));
      f1.Run(tone,380,.7f);f2.Run(p1.Next(w),200,.7f);return f1.lp*.35f*(.8f+.2f*Lfo(t,13f))+f2.lp*.6f;}
     default:{ // prism
      // Shimmer: four high partials with slowly wandering levels and airy noise.
      ph1+=2*Mathf.PI*1760/Rate;ph2+=2*Mathf.PI*2637/Rate;ph3+=2*Mathf.PI*3520/Rate;
      float s=Mathf.Sin(ph1)*(.5f+.5f*Lfo(t,6.5f))+Mathf.Sin(ph2)*(.5f+.5f*Lfo(t,8.67f,.3f))*.7f+Mathf.Sin(ph3)*(.5f+.5f*Lfo(t,4.33f,.6f))*.5f+Mathf.Sin(ph1*2.5f)*(.5f+.5f*Lfo(t,13f,.8f))*.3f;
      f1.Run(w,6000,.7f);return s*.08f+f1.hp*.04f;}
    }
   }
  }
  // Short events, rendered whole.
  static void Add(float[] x,int at,int n,Func<float,float> f){for(int i=0;i<n&&at+i<x.Length;i++)if(at+i>=0)x[at+i]+=f(i/(float)Rate);}
  static void Birds(float[] x,Rng r){
   int calls=9;for(int c=0;c<calls;c++){
    float at=(c+.2f+.6f*r.U())*(LoopSeconds/calls),basef=2600+1600*r.U(),dir=r.U()<.5f?1:-1,vol=.12f+.12f*r.U();int chirps=2+(int)(r.U()*4);bool whistle=r.U()<.3f;
    for(int k=0;k<chirps;k++){float len=whistle?.18f:.05f+.04f*r.U(),f0=basef*(1+.06f*k*dir),f1=f0*(whistle?.85f:1.35f);double ph=0;float start=at+k*(whistle?.24f:.09f+.03f*r.U());
     Add(x,(int)(start*Rate),(int)(len*Rate),t=>{float u=t/len,f=Mathf.Lerp(f0,f1,u)*(1+.02f*Mathf.Sin(2*Mathf.PI*28*t));ph+=2*Mathf.PI*f/Rate;float env=Mathf.Sin(Mathf.PI*Mathf.Clamp01(u))*Mathf.Exp(-u*1.5f);return (float)Math.Sin(ph)*env*vol;});}
   }
  }
  static void Frogs(float[] x,Rng r){
   float[] pitch={240,330,410};
   for(int c=0;c<14;c++){
    int frog=(int)(r.U()*3);float at=r.U()*LoopSeconds,len=.25f+.25f*r.U(),pulse=18+6*r.U(),f0=pitch[frog]*(1+.03f*r.S()),vol=.2f+.15f*r.U();double ph=0,pm=0;
    Add(x,(int)(at*Rate),(int)(len*Rate),t=>{float u=t/len,gate=Mathf.Pow(Mathf.Max(0,Mathf.Sin(Mathf.PI*pulse*t)),2);pm+=2*Mathf.PI*f0*1.5f/Rate;ph+=2*Mathf.PI*f0/Rate+2.2f*Math.Sin(pm)*2*Mathf.PI*f0*1.5f/Rate*.15f;return (float)Math.Sin(ph)*gate*Mathf.Sin(Mathf.PI*u)*vol;});
   }
   for(int c=0;c<6;c++){float at=r.U()*LoopSeconds,f0=300+200*r.U();double ph=0;Add(x,(int)(at*Rate),(int)(.05f*Rate),t=>{ph+=2*Mathf.PI*(f0+f0*t/.05f)/Rate;return (float)Math.Sin(ph)*Mathf.Exp(-t*60)*.15f;});}
  }
  static void Creaks(float[] x,Rng r){
   for(int c=0;c<4;c++){float at=(c+.3f+.4f*r.U())*LoopSeconds/4,len=.4f+.3f*r.U(),f0=90+60*r.U();double ph=0;var f=new Svf();
    Add(x,(int)(at*Rate),(int)(len*Rate),t=>{float u=t/len,fr=f0*(1+.4f*u)+12*Mathf.Sin(2*Mathf.PI*23*t);ph+=2*Mathf.PI*fr/Rate;float saw=(float)((ph/(2*Mathf.PI))%1)*2-1;f.Run(saw,1600,3);return f.bp*Mathf.Sin(Mathf.PI*u)*.12f;});}
  }
  static void Crickets(float[] x,Rng r){
   float[] carrier={4300,4650,4950};
   for(int k=0;k<3;k++){float t0=r.U()*.5f,interval=.42f+.25f*r.U(),vol=.12f+.06f*k;double ph=0;
    for(float at=t0;at<LoopSeconds+Crossfade-.2f;at+=interval*(.9f+.2f*r.U())){if(r.U()<.12f)continue;int pulses=3+(int)(r.U()*2);float level=vol*(.7f+.3f*r.U());float f0=carrier[k];
     Add(x,(int)(at*Rate),(int)(pulses*.033f*Rate),t=>{ph+=2*Mathf.PI*f0/Rate;float p=(t%.033f)/.033f;float env=p<.5f?Mathf.Sin(Mathf.PI*p*2):0;return (float)Math.Sin(ph)*env*level;});}
   }
  }
  static void Pings(float[] x,Rng r){
   float[] notes={1760,2093.0f,2349.3f,2637,3136,3520};
   for(int c=0;c<10;c++){float at=r.U()*LoopSeconds,f0=notes[(int)(r.U()*notes.Length)],vol=.05f+.05f*r.U();double a=0,b=0;
    Add(x,(int)(at*Rate),(int)(1.2f*Rate),t=>{a+=2*Mathf.PI*f0/Rate;b+=2*Mathf.PI*f0*2.76f/Rate;return ((float)Math.Sin(a)+.25f*(float)Math.Sin(b)*Mathf.Exp(-t*8))*Mathf.Exp(-t*3)*Mathf.Min(1,t*400)*vol;});}
  }
 }
}
