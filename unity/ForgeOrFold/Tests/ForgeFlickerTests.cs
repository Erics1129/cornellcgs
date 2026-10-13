// sources: Assets/Scripts/ForgeTuning.cs Assets/Scripts/ForgeFeel.cs Assets/Scripts/ForgeHeatMath.cs Assets/Scripts/ForgeFlicker.cs
// Fire flicker (spectrum, amplitude, no short period, reduced motion), the bellows swell and the quality-tier governor.
using System;
using System.Collections.Generic;

static class ForgeFlickerTests {
 static int failures, checks;
 static void Check(bool ok,string what){checks++;if(!ok){failures++;Console.WriteLine("FAIL ForgeFlickerTests: "+what);}}
 const double Rate=120;
 static double[] Sample(Func<double,double> f,double seconds,double start=0){int n=(int)(seconds*Rate);var v=new double[n];for(int i=0;i<n;i++)v[i]=f(start+i/Rate);return v;}
 /// Frequency (Hz) of the largest DFT magnitude between lo and hi, and that magnitude.
 static (double hz,double mag) Peak(double[] x,double lo,double hi,double step=.02){
  double mean=0;foreach(var v in x)mean+=v;mean/=x.Length;double best=0,bestHz=0;
  for(double f=lo;f<=hi;f+=step){double re=0,im=0;for(int i=0;i<x.Length;i++){double a=2*Math.PI*f*i/Rate;re+=(x[i]-mean)*Math.Cos(a);im+=(x[i]-mean)*Math.Sin(a);}double m=Math.Sqrt(re*re+im*im)/x.Length;if(m>best){best=m;bestHz=f;}}
  return (bestHz,best);
 }
 static double MaxDev(double[] x){double m=0;foreach(var v in x)m=Math.Max(m,Math.Abs(v-1));return m;}
 static double Autocorr(double[] x,int lag){double mean=0;foreach(var v in x)mean+=v;mean/=x.Length;double num=0,den=0;for(int i=0;i<x.Length;i++){den+=(x[i]-mean)*(x[i]-mean);if(i+lag<x.Length)num+=(x[i]-mean)*(x[i+lag]-mean);}return num/den*x.Length/(x.Length-lag);}

 static int Main(){
  var r=new ForgeRoomTuning();r.Clamp();
  // ---- Full flicker: spectral peak 2-4 Hz, +/- 18%, no period shorter than 10 s.
  var fire=Sample(t=>ForgeFlicker.Fire(t,r,false),60);
  var peak=Peak(fire,.1,20);
  Console.WriteLine($"  flicker spectral peak {peak.hz:0.00} Hz, max deviation {MaxDev(fire)*100:0.0}%");
  Check(peak.hz>=2&&peak.hz<=4,"spectral peak between 2 and 4 Hz (got "+peak.hz+")");
  double dev=MaxDev(fire);Check(dev<=r.flickerAmp+r.flicker2Amp+1e-6,"amplitude within +/- (18% + 3% shimmer): "+dev);
  Check(dev>=r.flickerAmp*.9,"the flicker reaches about 18%: "+dev);
  // Every 10 s window swings substantially (the fire never goes still).
  for(int w=0;w+10<=60;w+=5){double lo=9,hi=-9;for(int i=(int)(w*Rate);i<(int)((w+10)*Rate);i++){lo=Math.Min(lo,fire[i]);hi=Math.Max(hi,fire[i]);}Check(hi-lo>=r.flickerAmp*1.3,$"10 s window at {w} s swings {(hi-lo)*100:0.0}%");}
  // Energy concentrated in the band: 2-4 Hz dominates both the slow range and everything above 5 Hz (except the 8 Hz shimmer).
  var slow=Peak(fire,.05,1.5);var high=Peak(fire,5,7.2);var band=Peak(fire,2,4);
  Check(band.mag>4*slow.mag,"band dominates below 1.5 Hz");Check(band.mag>4*high.mag,"band dominates 5-7 Hz");
  // No period shorter than 10 s: the autocorrelation never returns close to 1 for lags of 1 to 10 s.
  double worst=0,worstLag=0;for(int lag=(int)Rate;lag<=10*Rate;lag+=2){double a=Autocorr(fire,lag);if(a>worst){worst=a;worstLag=lag/Rate;}}
  Console.WriteLine($"  largest autocorrelation for 1-10 s lags: {worst:0.00} at {worstLag:0.00} s");
  Check(worst<.6,"no period shorter than 10 s (autocorrelation "+worst+" at "+worstLag+" s)");
  // Deterministic: the same time gives the same value (QA can sample it).
  Check(ForgeFlicker.Fire(12.345,r,false)==ForgeFlicker.Fire(12.345,r,false),"deterministic");
  // ---- Reduced motion: at most 4%, at 1 Hz or less, no shimmer.
  var calm=Sample(t=>ForgeFlicker.Fire(t,r,true),120);
  var calmPeak=Peak(calm,.02,6,.01);double calmDev=MaxDev(calm);
  Console.WriteLine($"  reduced: peak {calmPeak.hz:0.00} Hz, max deviation {calmDev*100:0.0}%");
  Check(calmDev<=.04+1e-6,"reduced flicker at most 4%: "+calmDev);Check(calmPeak.hz<=1,"reduced flicker at 1 Hz or less: "+calmPeak.hz);
  var above=Peak(calm,1.05,6,.01);Check(above.mag<calmPeak.mag*.05,"reduced flicker has no energy above 1 Hz");
  var loud=new ForgeRoomTuning{reducedFlickerAmp=.3f,reducedFlickerHz=5};loud.Clamp();Check(loud.reducedFlickerAmp<=.04f&&loud.reducedFlickerHz<=1,"reduced limits cannot be tuned away");
  // ---- Bellows swell: +25% about .3 s after the stroke, then settles.
  Check(ForgeFlicker.Bellows(.2,1,r)==0,"no swell before the delay");
  float top=0;double topAt=0;for(double s=0;s<3;s+=.01){float b=ForgeFlicker.Bellows(s,1,r);if(b>top){top=b;topAt=s;}}
  Check(Math.Abs(top-r.bellowsBoost)<.005f&&topAt>=.5&&topAt<=.6,$"swell peaks at {top} at {topAt} s");
  Check(ForgeFlicker.Bellows(3,1,r)<.05f*r.bellowsBoost+.02f,"swell settles");Check(ForgeFlicker.Bellows(.6,.5f,r)<ForgeFlicker.Bellows(.6,1,r),"strength scales it");

  // ---- Quality governor.
  // Steady 120 Hz: stays at tier 0 and learns an 8.3 ms budget.
  {var g=new ForgeQualityGovernor(r,0);Run(g,60,8.33f);Check(g.Tier==0&&g.Drops==0,"steady 120 Hz keeps tier 0");Check(Math.Abs(g.BudgetMs-8.333f)<.01f,"120 Hz budget");}
  // Startup hitches inside the ignore window never count.
  {var g=new ForgeQualityGovernor(r,0);Run(g,2.5,40);Run(g,40,8.33f);Check(g.Tier==0,"loading frames are ignored");}
  // A 400 ms hitch never drops the tier (its second is ignored).
  {var g=new ForgeQualityGovernor(r,0);Run(g,10,8.33f);g.Frame(400);Run(g,30,8.33f);for(int i=0;i<20;i++){Run(g,3,8.33f);g.Frame(400);}Check(g.Tier==0&&g.Drops==0,"400 ms hitches never drop the tier");}
  // A sustained throttle drops one tier per window, in order, then recovers once after 30 s (and only once).
  {var g=new ForgeQualityGovernor(r,0);Run(g,10,8.33f);var seen=new List<int>{g.Tier};
   for(int i=0;i<40*60;i++){if(g.Frame(16.7f))seen.Add(g.Tier);}
   Check(seen.Count==4&&seen[1]==1&&seen[2]==2&&seen[3]==3,"throttle drops 0 -> 1 -> 2 -> 3 in order: "+string.Join(",",seen));
   double t=0;int before=g.Tier;while(t<29&&g.Tier==before){g.Frame(8.33f);t+=.00833;}Check(g.Tier==3,"no recovery before 30 s");
   while(t<40&&g.Tier==before){g.Frame(8.33f);t+=.00833;}Check(g.Tier==2&&t>=30&&t<34,$"recovers one tier about 30 s after the throttle ends (t {t:0.0} s)");
   Run(g,300,8.33f);Check(g.Tier==2&&g.Recoveries==1,"at most one recovery per session");}
  // A dip and recovery can never oscillate: after the one recovery a new drop sticks.
  {var g=new ForgeQualityGovernor(r,0);Run(g,10,8.33f);Until(g,10,16.7f);Check(g.Tier==1,"one drop");Run(g,40,8.33f);Check(g.Tier==0,"recovered");Until(g,10,16.7f);Check(g.Tier==1,"dropped again");Run(g,600,8.33f);Check(g.Tier==1,"stays down after the one recovery");}
  // 60 Hz displays: 16.7 ms budget; 19 ms frames (1.14x) do not drop, 22 ms (1.32x) do.
  {var g=new ForgeQualityGovernor(r,0);Run(g,10,16.67f);Run(g,20,19);Check(g.Tier==0&&Math.Abs(g.BudgetMs-16.667f)<.01f,"60 Hz budget, 19 ms frames keep the tier");Run(g,4,22);Check(g.Tier==1,"22 ms frames drop one tier");}
  // Phones start at tier 2 (tunable) and never recover above their start tier.
  {var g=new ForgeQualityGovernor(r,(int)r.phoneStartTier);Check(g.Tier==2,"phones start at tier 2");Run(g,120,8.33f);Check(g.Tier==2,"no climb above the start tier");}
  // Restart during the warm-up (the phone view class arrives after boot): new start tier, clean history.
  {var g=new ForgeQualityGovernor(r,0);Run(g,1,8.33f);Check(g.Seconds>.9&&g.Seconds<1.1,"seconds fed");g.Restart(2);Check(g.Tier==2&&g.StartTier==2&&g.Seconds==0,"restart sets the start tier");Run(g,60,8.33f);Check(g.Tier==2,"restarted governor holds its start tier");}
  // MSAA choice: support, pixel budget, tiers.
  Check(ForgeQualityGovernor.MsaaFor(0,4,1.3f,2.5f)==4,"tier 0 MSAA 4x");Check(ForgeQualityGovernor.MsaaFor(0,4,3.7f,2.5f)==2,"pixel budget caps 4x at 2.5 Mpx");
  Check(ForgeQualityGovernor.MsaaFor(1,8,1,2.5f)==2,"tier 1 MSAA 2x");Check(ForgeQualityGovernor.MsaaFor(0,1,1,2.5f)==1&&ForgeQualityGovernor.MsaaFor(1,1,1,2.5f)==1,"unsupported MSAA falls back to FXAA");
  Check(ForgeQualityGovernor.MsaaFor(2,4,1,2.5f)==1&&ForgeQualityGovernor.MsaaFor(3,4,1,2.5f)==1,"tiers 2 and 3 use FXAA");
  Check(ForgeQualityGovernor.ParticleScale(0)==1&&ForgeQualityGovernor.ParticleScale(2)==.6f&&ForgeQualityGovernor.ParticleScale(3)==.4f,"particle scale by tier");
  var odd=new ForgeRoomTuning{tierRecoverS=1,tierMaxRecoveries=50,phoneStartTier=9};odd.Clamp();Check(odd.tierRecoverS>=10&&odd.tierMaxRecoveries<=3&&odd.phoneStartTier==3,"tier hysteresis limits");

  if(failures>0){Console.WriteLine($"FAIL ForgeFlickerTests: {failures} of {checks} checks failed");return 1;}
  Console.WriteLine($"PASS ForgeFlickerTests ({checks} checks)");return 0;
 }
 static void Run(ForgeQualityGovernor g,double seconds,float ms){int n=(int)(seconds*1000/ms);for(int i=0;i<n;i++)g.Frame(ms);}
 /// Slow frames until the tier changes (a real drop lowers the load at once), at most `seconds`.
 static void Until(ForgeQualityGovernor g,double seconds,float ms){int n=(int)(seconds*1000/ms);for(int i=0;i<n;i++)if(g.Frame(ms))return;}
}
