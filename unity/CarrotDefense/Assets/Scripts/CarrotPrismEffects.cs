using UnityEngine;

namespace CarrotTD {
 public sealed partial class CarrotEffects {
  public bool ReducedMotion;
  CarrotLicensedFx licensedFx;public System.Func<int,Transform> LicensedAnchor{set{if(licensedFx!=null)licensedFx.ResolveAnchor=value;}}
  float detailWindow;int detailCount;
  public static Color Spectrum(float t){return Color.HSVToRGB(Mathf.Repeat(t,.9999f),.72f,1);}
  static bool PrismTone(string kind,out Color tone){switch(kind){case "asuna":case "prismDash":tone=new Color(.4f,.9f,1);return true;case "prismLances":tone=new Color(1,.43f,.75f);return true;case "prismaticAegis":tone=new Color(.46f,1,.8f);return true;case "spectrumRain":tone=new Color(.72f,.54f,1);return true;case "mirrorRush":tone=new Color(.6f,.76f,1);return true;case "prismOverdrive":tone=new Color(1,.72f,.32f);return true;case "prismReinforce":tone=new Color(.6f,.85f,1);return true;default:tone=Color.white;return false;}}
  public void PrismAmbient(Vector3 center,Vector3 size){var shape=ambient.shape;shape.position=center+Vector3.up*1.6f;shape.scale=new Vector3(size.x+2,2.6f,size.z+1);var main=ambient.main;main.maxParticles=CarrotQuality.Rich?42:20;main.startLifetime=8;main.startSize=new ParticleSystem.MinMaxCurve(.045f,.09f);var emission=ambient.emission;emission.rateOverTime=main.maxParticles/8f;var c=ambient.colorOverLifetime;var gradient=new Gradient();gradient.SetKeys(new[]{new GradientColorKey(new Color(.3f,.85f,1),0),new GradientColorKey(new Color(1,.55f,.8f),.5f),new GradientColorKey(new Color(1,.9f,.5f),1)},new[]{new GradientAlphaKey(0,0),new GradientAlphaKey(.5f,.2f),new GradientAlphaKey(.4f,.7f),new GradientAlphaKey(0,1)});c.color=gradient;ambient.Simulate(9,true,true,false);}
  void ClearPrism(){if(licensedFx!=null)licensedFx.Clear();detailWindow=0;detailCount=0;if(pool==null||pool.prismRibbons==null)return;foreach(var r in pool.prismRibbons)if(r.slot.busy)FxPool.Free(r.slot);}
  // At most three reusable meshes. Positions/colors are reused in-place; no particle-count-dependent geometry allocation.
  void PrismRibbon(Vector3 from,Vector3 to,float life,float width=.22f,float lift=.3f,float travel=0){if(ReducedMotion)return;FxPool.PrismRibbon chosen=null;foreach(var r in pool.prismRibbons)if(!r.slot.busy){chosen=r;break;}if(chosen==null){float oldest=-1;foreach(var r in pool.prismRibbons)if(r.age/Mathf.Max(.01f,r.life)>oldest){chosen=r;oldest=r.age/r.life;}}chosen.from=from;chosen.to=to;chosen.age=0;chosen.life=Mathf.Clamp(life,.18f,1.25f);chosen.width=width;chosen.lift=lift;chosen.travel=travel>0?Mathf.Min(travel,chosen.life):chosen.life*.35f;chosen.slot.busy=true;chosen.slot.go.SetActive(true);chosen.slot.t.position=Vector3.zero;chosen.slot.t.rotation=Quaternion.identity;chosen.slot.t.localScale=Vector3.one;UpdatePrismRibbon(chosen);}
  void TickPrism(float dt){foreach(var r in pool.prismRibbons){if(!r.slot.busy)continue;r.age+=dt;if(r.age>=r.life){FxPool.Free(r.slot);continue;}UpdatePrismRibbon(r);}}
  void UpdatePrismRibbon(FxPool.PrismRibbon r){float t=Mathf.Clamp01(r.age/r.life),fade=Mathf.Clamp01((1-t)/.5f),head=Mathf.Min(1,r.age/Mathf.Max(.01f,r.travel)),tail=Mathf.Clamp01((r.age-r.travel)/Mathf.Max(.01f,r.life-r.travel));Vector3 forward=(r.to-r.from).normalized;if(forward.sqrMagnitude<.1f)forward=Vector3.right;Vector3 right=Vector3.Cross(forward,Vector3.up).normalized;if(right.sqrMagnitude<.1f)right=Vector3.right;
   for(int strand=0;strand<FxPool.RibbonStrands;strand++)for(int i=0;i<=FxPool.RibbonSegments;i++){float u=i/(float)FxPool.RibbonSegments,s=Mathf.Lerp(tail,Mathf.Max(tail,head),u),phase=s*Mathf.PI*2+strand*2.094f;Vector3 p=Vector3.Lerp(r.from,r.to,s)+Vector3.up*(Mathf.Sin(s*Mathf.PI)*r.lift+Mathf.Sin(phase)*r.width*.55f)+right*Mathf.Cos(phase)*r.width*.8f;Vector3 axis=cam!=null?Vector3.Cross(forward,(cam.transform.position-p).normalized).normalized:Vector3.up;float width=r.width*.38f*Mathf.Sin(u*Mathf.PI);int k=(strand*(FxPool.RibbonSegments+1)+i)*2;r.vertices[k]=p-axis*width;r.vertices[k+1]=p+axis*width;Color c=Spectrum(s*.74f+strand*.21f+t*.12f);c.a=.68f*fade*Mathf.Sin(u*Mathf.PI);r.colors[k]=r.colors[k+1]=c;}
   r.mesh.vertices=r.vertices;r.mesh.colors=r.colors;r.mesh.RecalculateBounds();
  }
  bool HandlePrism(CarrotEvent e,Color c){
   if(e.type=="cinematic"&&EntranceBoss=="asuna"){PrismEntrance(e.kind,e.position);return true;}
   if(e.type=="bossEnter"&&e.kind=="asuna"){PrismEntrance("bossRing",e.position);return true;}
   if((e.type=="spawn"||e.type=="dissolve")&&e.kind=="asuna"){Motes(e.position+Vector3.up*.8f,N(7),.13f,.7f,new Color(.65f,.78f,1,.65f),.5f,Vector3.up*.3f,FxSheet.Shard,.35f);return true;}
   if(e.type=="death"&&e.kind=="asuna"){PrismEntrance("defeat",e.position);return true;}
   if(!PrismTone(e.kind,out c))return false;
   if(e.type=="telegraph"||e.type=="telegraphTarget"){PrismWarning(e,c,e.type=="telegraphTarget");return true;}
   if(e.type=="abilityTarget"){PrismContact(e,c);return true;}
   if(e.type=="ability"){PrismRelease(e,c);return true;}
   return false;
  }
  void PrismWarning(CarrotEvent e,Color c,bool targetOnly){float life=Mathf.Max(.2f,e.duration);bool contact=e.kind=="prismLances"||e.kind=="spectrumRain";Vector3 target=contact?e.to:e.position;
   // Rings are exact locked tower contacts, not a fictitious area attack. Warning slots have reserved pool capacity.
   RingFx(target,.60f,.60f,life,new Color(c.r,c.g,c.b,.85f),0,1,true);if(contact){Glyph(G(target,.45f),FxSheet.Warning,.36f,life,new Color(1,.7f,.35f,.85f),Vector3.zero);if(e.kind=="spectrumRain")BoltFx(G(target,.10f),G(target,2.6f),.018f,life,new Color(c.r,c.g,c.b,.38f),0,0,true);}
   if(targetOnly)return;
   if(e.kind=="prismDash"){Vector3 toward=e.to-e.position;toward.y=0;if(toward.sqrMagnitude<.1f)toward=Vector3.right;else toward.Normalize();for(int i=0;i<3;i++)Glyph(G(e.position+toward*(.45f+i*.43f),.12f),FxSheet.Chevron,.30f,life,new Color(.55f,.9f,1,.8f),Vector3.zero);}
   else if(e.kind=="prismaticAegis"){Orbit(e.position+Vector3.up,1.05f,life,new Color(c.r,c.g,c.b,.65f),new Vector3(83,0,25),ReducedMotion?0:70);}
   else if(e.kind=="mirrorRush"){for(int side=-1;side<=1;side+=2)RingFx(e.position+Vector3.forward*side*.7f,.28f,.28f,life,new Color(.7f,.7f,1,.65f),0,1,true);}
   else if(e.kind=="prismOverdrive"){Orbit(e.position+Vector3.up*1.05f,1.35f,life,new Color(1,.7f,.35f,.6f),new Vector3(78,0,0),ReducedMotion?0:90);Motes(e.position+Vector3.up*.5f,N(12),.12f,life,new Color(1,.8f,.45f,.65f),.2f,Vector3.up*.4f,FxSheet.Star4,.7f);}
   if(!ReducedMotion)Motes(e.position+Vector3.up*.85f,N(6),.10f,life,new Color(c.r,c.g,c.b,.5f),.08f,Vector3.up*.12f,FxSheet.GlowSoft,.3f);
  }
  void PrismRelease(CarrotEvent e,Color c){Vector3 p=e.position,body=p+Vector3.up*.95f;
   switch(e.kind){
    case "prismReinforce":Motes(p+Vector3.up*.3f,N(5),.10f,.65f,new Color(.5f,.85f,1,.5f),.25f,Vector3.up*.3f);return;
    case "prismDash":Flash(body,.65f,.12f,Color.white,FxSheet.Star4);return; // Actual movement comes exclusively from abilityTarget.
    case "prismLances":Flash(body,1.15f,.16f,new Color(1,.65f,.9f),FxSheet.Star6);Orbit(body,.75f,.45f,c,new Vector3(70,0,0),ReducedMotion?0:180);break;
    case "spectrumRain":for(int i=0;i<5;i++){float a=i*Mathf.PI*2/5;Vector3 q=body+new Vector3(Mathf.Cos(a)*.8f,.6f,Mathf.Sin(a)*.8f);Glyph(q,FxSheet.Star4,.28f,.65f,Spectrum(i/5f),Vector3.up*.8f);}break;
    case "prismaticAegis":for(int i=0;i<3;i++)Orbit(body,1.05f,Mathf.Max(.1f,e.duration),new Color(Spectrum(i/3f).r,Spectrum(i/3f).g,Spectrum(i/3f).b,.38f),new Vector3(80,i*60,25),ReducedMotion?0:40*(i%2==0?1:-1));RingFx(p,1.15f,1.15f,e.duration,new Color(.45f,1,.8f,.48f),0,1);break;
    case "mirrorRush":for(int i=0;i<2;i++)PrismRibbon(body,body+new Vector3(-.8f,.1f,(i==0?-1:1)*.8f),.65f,.24f,.25f);Flash(body,1.25f,.16f,new Color(.8f,.8f,1,.7f),FxSheet.Star6);break;
    case "prismOverdrive":for(int i=0;i<3;i++){Color tone=Spectrum(i/3f);RingFx(p,.4f,1.65f+i*.3f,.55f+i*.12f,new Color(tone.r,tone.g,tone.b,.58f),0,1.8f,false,.06f+i*.18f);}Sparks(body,N(22),1.5f,3,.65f,new Color(1,.8f,.5f),Vector3.up,.9f);if(!ReducedMotion)CameraImpulse?.Invoke(p,.13f,2);break;
   }
   LightFx(body,2.4f,3,.22f,c,.02f);
  }
  void PrismContact(CarrotEvent e,Color c){if(e.kind=="prismDash"){PrismRibbon(e.position+Vector3.up*.75f,e.to+Vector3.up*.75f,e.duration+.32f,.40f,.16f,e.duration);RingFx(e.position,.12f,.55f,.38f,new Color(.3f,.85f,1,.5f));Delay(e.duration,Op.PrismDashLand,e.to,Vector3.zero,c);return;}
   if(e.kind!="prismLances"&&e.kind!="spectrumRain")return;Vector3 body=e.to+Vector3.up*.65f;
   if(e.kind=="prismLances"){Vector3 origin=e.position+Vector3.up*1.1f;BoltFx(origin,body,.11f,.16f,c,0,0,true,0,1.8f);BoltFx(origin,body,.023f,.18f,Color.white,0,0,true,0,1.5f);if(!ReducedMotion)PrismRibbon(origin,body,.36f,.16f,.13f);}
   else{Vector3 start=body+new Vector3(-.25f,4.8f,.12f);BoltFx(start,body,.17f,.17f,c,0,0,true,0,1.8f);if(!ReducedMotion)PrismRibbon(start,body,.40f,.25f,0);}
   Flash(body,.85f,.12f,new Color(1,.95f,1,.9f),FxSheet.Star4);RingFx(e.to,.18f,.61f,.36f,new Color(c.r,c.g,c.b,.72f),0,1.7f);Debris(body,N(7),FxSheet.Shard,.08f,.17f,1,2.2f,.65f,c,180);Motes(body,N(4),.10f,.8f,new Color(c.r,c.g,c.b,.6f),.15f,Vector3.up*.35f); // No audio or shake per target.
  }
  bool RunPrism(Op op,Vector3 a,Vector3 b,Color c,float f,int i,float t){if(op!=Op.PrismDashLand)return false;RingFx(a,.1f,.66f,.4f,new Color(1,.4f,.8f,.55f));Sparks(a+Vector3.up*.35f,N(10),.8f,1.8f,.45f,c);return true;}
  public void PrismPressure(Vector3 p,float strength){Motes(p+Vector3.up*.8f,N(2),.10f,.6f,new Color(1,.65f,.30f,.55f),.18f,Vector3.up*.38f,FxSheet.Star4,.32f);if(CarrotQuality.Rich&&!ReducedMotion)Glyph(p+Vector3.up*1.3f,FxSheet.Star4,.15f+strength*.04f,.4f,new Color(.6f,.9f,1,.6f),Vector3.up*.2f,80);}
  void PrismEntrance(string beat,Vector3 p){if(beat=="bossDust"){for(int i=0;i<3;i++)Orbit(p+Vector3.up*.95f,.8f+i*.22f,1.2f,Spectrum(i/3f),new Vector3(80,i*55,0),ReducedMotion?0:75);return;}float radius=beat=="bossRing"?2.4f:beat=="defeat"?2:1.6f;for(int i=0;i<3;i++){Color c=Spectrum(i/3f);RingFx(p,.2f,radius+i*.25f,.65f+i*.1f,new Color(c.r,c.g,c.b,.6f),0,1.7f,false,.06f+i*.15f);}Motes(p+Vector3.up,N(20),.13f,1.25f,new Color(.7f,.85f,1,.8f),1.1f,Vector3.up*.45f,FxSheet.Star4,.3f);if(beat=="bossRoar"&&!ReducedMotion)CameraImpulse?.Invoke(p,.15f,2);}
  // An additive detail layer for every plant family. Existing recipes still run unchanged afterwards.
  // A shared rate budget prevents 20 fast towers from multiplying particle load or masking reserved warnings.
  void PlantImpactDetail(CarrotEvent e){if(e.type!="impact")return;float window=CarrotQuality.Rich?.12f:.16f;if(clock-detailWindow>=window){detailWindow=clock;detailCount=0;}if(detailCount>=(CarrotQuality.Rich?4:2))return;int tier=Mathf.Clamp(e.tier,1,5);float power=.78f+tier*.13f;Color c=Tone(e.kind);Vector3 p=e.to,body=p+Vector3.up*.34f;int n=N(tier>=4?4:2);bool handled=true;
   switch(e.kind){
    case "seed":Debris(body,n,FxSheet.Husk,.06f,.11f,1.2f,2.2f,.46f,new Color(.9f,.67f,.31f),220);Glyph(body,FxSheet.Star4,.35f*power,.15f,new Color(1,.87f,.56f),Vector3.zero,25);break;
    case "frost":Glyph(body,FxSheet.Flake,.43f*power,.44f,new Color(.7f,.94f,1),Vector3.up*.18f,ReducedMotion?0:80);Debris(body,n,FxSheet.Shard,.06f,.12f,.5f,1.3f,.55f,c,120);break;
    case "mortar":Dust(G(p,.08f),n,.24f*power,.68f,new Color(Soil.r,Soil.g,Soil.b,.35f),.6f);Embers(body,n,.09f,.7f,new Color(1,.55f,.15f),.55f);break;
    case "prism":for(int i=0;i<2;i++){Color hue=Spectrum(.47f+i*.23f);BoltFx(body+new Vector3(-.3f,.15f*i,-.12f),body+new Vector3(.3f,.3f-.15f*i,.12f),.035f*power,.2f,hue,0,0,true);}break;
    case "storm":BoltFx(body,body+new Vector3(.30f,.4f,.18f),.025f*power,.18f,new Color(.65f,.84f,1),.07f,1);Glyph(body,FxSheet.Note,.24f,.5f,c,Vector3.up*.4f);break;
    case "blossom":Debris(body,n+1,FxSheet.Petal,.08f,.15f,.35f,.9f,.85f,new Color(1,.62f,.78f),80,Vector3.up*.15f);Glyph(body,FxSheet.Star4,.28f,.45f,new Color(.8f,1,.45f),Vector3.up*.3f);break;
    case "starfruit":for(int i=0;i<3;i++){float a=i*2.094f;Glyph(body,FxSheet.Star4,.22f*power,.5f,new Color(1,.85f,.4f),new Vector3(Mathf.Cos(a),.2f,Mathf.Sin(a))*.8f,ReducedMotion?0:160);}break;
    case "gravity":Motes(body,n+1,.12f,.45f,new Color(.8f,.4f,1,.75f),.08f,Vector3.up*.1f,FxSheet.GlowSoft,.3f);Orbit(body,.3f*power,.3f,new Color(.6f,.3f,1,.45f),new Vector3(75,0,30),ReducedMotion?0:-200,collapse:true);break;
    case "book":Debris(body,n,FxSheet.Page,.09f,.16f,.35f,.8f,.75f,new Color(.8f,1,.9f),70);Glyph(body,FxSheet.Clock,.24f*power,.45f,c,Vector3.up*.2f,ReducedMotion?0:-150);break;
    case "thunder":for(int i=0;i<2;i++)BoltFx(body,body+new Vector3(i==0?-.38f:.38f,.5f,.1f),.035f*power,.14f,new Color(.7f,.8f,1),.09f,1);break;
    case "bamboo":Debris(body,n,FxSheet.Leaf,.06f,.12f,1,1.8f,.5f,new Color(.55f,.9f,.33f),140);BoltFx(body-Vector3.right*.22f,body+Vector3.right*.26f,.025f*power,.12f,new Color(.9f,1,.65f),0,0,true);break;
    case "chili":Embers(body,n,.12f*power,.68f,new Color(1,.28f,.08f),.8f,.18f);Glyph(body,FxSheet.Spark,.32f,.16f,new Color(1,.88f,.4f),Vector3.up*.45f);break;
    case "lotus":Debris(body,n,FxSheet.Petal,.11f,.18f,.3f,.7f,.9f,new Color(.8f,1,1,.7f),45,Vector3.up*.15f);Glyph(body,FxSheet.Star4,.3f,.6f,c,Vector3.up*.3f);break;
    case "magnet":for(int i=0;i<2;i++)BoltFx(body+Vector3.right*(i==0?-.3f:.3f),body,.025f*power,.22f,new Color(.55f,.8f,1),.08f,0);Debris(body,n,FxSheet.Shard,.05f,.09f,.2f,.7f,.4f,new Color(.65f,.74f,.8f),220);break;
    case "orchid":Debris(body,n,FxSheet.Petal,.08f,.14f,.2f,.5f,.9f,new Color(.74f,.4f,.85f,.7f),70);Motes(body,n,.1f,.9f,new Color(.8f,1,.32f,.7f),.18f,Vector3.up*.22f,FxSheet.Pollen);Sparks(body,N(2),.8f,1.6f,.25f,new Color(.85f,.55f,1),Vector3.up,.8f,.06f);break;
    case "mushroom":for(int i=0;i<2;i++)Glyph(body+Vector3.right*(i-.5f)*.22f,FxSheet.Star4,.20f*power,.9f,new Color(.65f,.6f,1,.7f),Vector3.up*(.25f+i*.15f),ReducedMotion?0:60);Motes(body,n,.09f,.8f,new Color(.7f,.65f,1,.7f),.2f,Vector3.up*.18f,FxSheet.Pollen,.2f);Dust(G(p,.08f),N(2),.28f,.5f,new Color(.6f,.55f,.85f,.25f),.25f);break;
    case "cactus":Debris(body,n+1,FxSheet.Husk,.035f,.075f,1.5f,2.8f,.4f,new Color(.87f,.91f,.55f),240);Glyph(body,FxSheet.Star4,.28f*power,.1f,new Color(.8f,1,.6f),Vector3.zero);Sparks(body,N(3),1.4f,2.6f,.2f,new Color(.9f,1,.6f),Vector3.zero,1,.06f);RingFx(p,.1f,.42f,.2f,new Color(.8f,1,.55f,.5f),0,2);break;
    case "clockflower":for(int i=0;i<3;i++){float a=i*2.094f;Glyph(body+new Vector3(Mathf.Cos(a),.2f,Mathf.Sin(a))*.25f,FxSheet.Chevron,.14f*power,.45f,new Color(1,.83f,.35f,.75f),Vector3.up*.15f,ReducedMotion?0:-120);}Motes(body,n,.09f,.6f,new Color(1,.85f,.45f,.75f),.25f,Vector3.up*.15f);RingFx(p,.12f,.5f,.25f,new Color(1,.83f,.35f,.55f),0,2);Sparks(body,N(2),1,2,.2f,new Color(1,.9f,.55f),Vector3.up,.7f,.06f);break;
    case "dragonfruit":Debris(body,n,FxSheet.Shard,.08f,.16f,1.2f,2.1f,.65f,new Color(1,.3f,.56f),210);Embers(body,n,.13f,.75f,new Color(1,.66f,.24f),.6f);break;
    case "moonflower":Glyph(body,FxSheet.Star6,.4f*power,.3f,new Color(.75f,.9f,1,.8f),Vector3.up*.15f,ReducedMotion?0:45);Motes(body,n,.09f,.75f,new Color(.6f,.75f,1,.65f),.25f,Vector3.up*.2f,FxSheet.Star4);break;
    default:handled=false;break;
   }
   if(!handled)return;detailCount++;if(tier>=5){Color tip=Color.Lerp(c,Color.white,.35f);Sparks(body,N(3),.8f,1.6f,.35f,tip,Vector3.up,.75f,.08f);if(!ReducedMotion&&detailCount==1)RingFx(p,.14f,.54f,.28f,new Color(c.r,c.g,c.b,.32f),0,1.8f);}
  }
 }
}
