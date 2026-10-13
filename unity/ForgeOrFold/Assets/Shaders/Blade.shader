// Owner: hot-metal-vfx. Knives, their fittings and the shatter pieces.
// Per pixel: temperature from the local thickness (TEXCOORD1.x, mm) with ForgeHeatModel's closed form
// (ForgeHeatMath.cs; _HeatA/_HeatB/_HeatC are its uniforms), blackbody emission chroma(T) x E(T), the hot-steel
// surface (matte above 450-900 C), oxide scale that grows into dark plates with brighter gaps and is knocked off at
// each contact (_Hits) or all at once by a Perfect (_Flash), permanent hammer dimples (_Marks), the chip notch's fresh
// steel (_Notch), risk cracks (_Crack: jagged hairlines running in from the edge and the tip, dark on bright steel and
// glowing on dull red steel), the fuller groove from stage 2. Every mark lives in normalized blade coordinates
// (TEXCOORD0: u along the edge, v edge -> spine) scaled to centimetres by _BladeDims, so nothing slides when the blade
// draws out. TEXCOORD1.y is the part: 0 blade, 1 tang, 2 fitting (COLOR = sRGB albedo, alpha = material: 0 wood or
// leather, .5 brass, 1 gem). TEXCOORD1.z is the distance (mm) to a fracture line on shatter pieces (99 elsewhere):
// fresh fracture faces carry no scale and flash through the hit-stop.
// QA: the global _ForgeMetalDebug shows 1 = albedo, 2 = reflected light only, 3 = emission only (Qa('metal-debug-N')).
Shader "Forge/Blade" {
 Properties {
  _MainTex("Generated steel",2D)="white"{} _Color("Metal",Color)=(.7,.75,.8,1) _Metallic("Metalness",Range(0,1))=.95 _Glossiness("Smoothness",Range(0,1))=.65
  _Heat("Heat (legacy, unused)",Range(0,1))=0 _EmissionColor("Evolution",Color)=(0,0,0,0) _GlowColor("Aura",Color)=(.5,.8,1,1) _Kind("Metal kind",Float)=0 _Stage("Evolution stage",Float)=0
  _Worked("Being forged",Float)=1 _Swatch("QA swatch",Float)=0 _Shard("Shatter piece",Float)=0 _Dissolve("Dissolve",Range(0,1))=0 _CrackFlash("Crack flash",Float)=0 _Glint("Glint sweep",Float)=-1
  _HeatA("Cooling T0 K, tau, k3, floor",Vector)=(293.15,0,.0561,0) _HeatB("Ease target K, t, dur, lead",Vector)=(293.15,-1000,1,0) _HeatC("Floors K, curve",Vector)=(923.15,873.15,0,0)
  _Emit("Emission scale, K, cap, white",Vector)=(3,9592,6,.6) _Chroma("Chroma start, slope, 1/scale cell cm, gap glow",Vector)=(580,.000227,1.33,.85) _Surface("Hot surface",Vector)=(450,900,.35,.25) _Surface2("Hot reflectance from C, to C, left",Vector)=(300,700,.45,0)
  _Oxide("Oxide amount, dim, regrow s, footprint cm",Vector)=(0,.4,6,1.8) _Crack("Crack amount, glow, per m, dark above C",Vector)=(0,.6,40,900) _Flash("Flash, footprint s, gain",Vector)=(0,.12,1.2,0)
  _BladeDims("Length cm, width cm, seed, unit mm",Vector)=(20,4,0,120) _Notch("Notch u, half width u, depth v, on",Vector)=(0,.02,.1,0)
 }
 SubShader { Tags {"RenderType"="Opaque"} LOD 250
  Pass { Tags {"LightMode"="ForwardBase"}
   CGPROGRAM
   #pragma vertex vert
   #pragma fragment frag
   #pragma target 3.0
   #pragma multi_compile_fog
   #define FORGE_NO_GLOW_LAMP
   #include "ForgeLighting.cginc"
   sampler2D _MainTex;float4 _Color,_EmissionColor,_GlowColor;float _Metallic,_Glossiness,_Kind,_Stage,_Worked,_Swatch,_Shard,_Dissolve,_CrackFlash,_Glint;
   float4 _HeatA,_HeatB,_HeatC,_Emit,_Chroma,_Surface,_Surface2,_Oxide,_Crack,_Flash,_BladeDims,_Notch;
   float4 _Hits[4];float4 _Marks[8];float _ForgeMetalDebug;
   struct appdata {float4 vertex:POSITION;float3 normal:NORMAL;float2 uv:TEXCOORD0;float4 data:TEXCOORD1;float4 color:COLOR;};
   struct v2f {float4 pos:SV_POSITION;float3 worldPos:TEXCOORD0;float3 normal:TEXCOORD1;float3 local:TEXCOORD2;float2 uv:TEXCOORD3;float4 data:TEXCOORD4;float4 color:TEXCOORD5;UNITY_FOG_COORDS(6)};
   v2f vert(appdata v){v2f o;o.pos=UnityObjectToClipPos(v.vertex);o.worldPos=mul(unity_ObjectToWorld,v.vertex).xyz;o.local=v.vertex.xyz;o.normal=UnityObjectToWorldNormal(v.normal);o.uv=v.uv;o.data=v.data;o.color=v.color;UNITY_TRANSFER_FOG(o,o.pos);return o;}

   float hash1(float2 p){return frac(sin(dot(p,float2(127.1,311.7)))*43758.5453);}
   float2 hash2(float2 p){return frac(sin(float2(dot(p,float2(127.1,311.7)),dot(p,float2(269.5,183.3))))*43758.5453);}
   float vnoise(float2 p){float2 i=floor(p),f=frac(p);f=f*f*(3-2*f);return lerp(lerp(hash1(i),hash1(i+float2(1,0)),f.x),lerp(hash1(i+float2(0,1)),hash1(i+1),f.x),f.y);}
   /// Cellular noise: x = F2 - F1 (0 on the border between two cells), y = the nearest cell's random id.
   float2 Cells(float2 p){
    float2 n=floor(p),f=frac(p);float d1=8,d2=8,id=0;
    for(int j=-1;j<=1;j++)for(int k=-1;k<=1;k++){float2 g=float2(k,j);float2 r=g+.15+.7*hash2(n+g)-f;float d=dot(r,r);if(d<d1){d2=d1;d1=d;id=hash1(n+g+.37);}else if(d<d2)d2=d;}
    return float2(sqrt(d2)-sqrt(d1),id);
   }
   /// ForgeHeatModel.TemperatureK for local thickness L (mm).
   float HeatK(float L){
    L=max(L,.01);float a=_HeatA.x/1000;float x=1/(a*a*a)+_HeatA.z*max(_HeatA.y,0)/L;float tc=1000*pow(x,-1.0/3.0);
    float f=lerp(_HeatC.y,_HeatC.x,saturate((L-.8)/2.2));float field=tc+(max(tc,f)-tc)*_HeatA.w;
    if(_HeatB.y<=-999)return field;
    float lag=-_HeatB.w*(3-clamp(L,.8,3))/2.2;float p=saturate((_HeatB.y-lag)/max(.01,_HeatB.z));p=_HeatC.z>.5?1-(1-p)*(1-p)*(1-p):p*p*(3-2*p);
    return field+(_HeatB.x-field)*p;
   }
   /// ForgeHeatMath.Emission: chroma(T) x E(T), capped, mixed toward warm white above 1200 C.
   float3 Blackbody(float c){
    float k=c+273.15;if(k<250)return 0;float e=min(_Emit.x*exp(_Emit.y*(1/1373.15-1/k)),_Emit.z);
    float green=saturate((c-_Chroma.x)*_Chroma.y);float w=_Emit.w*smoothstep(1200,1450,c);
    return e*float3(1,(1-w)*green+w*.72,w*.42);
   }
   /// Risk cracks: hairlines that open at the edge (v = 0) and run inward on a meandering path, about _Crack.z per metre
   /// of edge. A crack appears once `amount` passes its own threshold and lengthens as the risk climbs; deeper ones fork.
   /// Near the tip the blade is narrow, so the same cracks cut almost across it. Width tapers from the mouth; anti-aliased
   /// with fwidth, never thinner than about a pixel (thinner ones fade instead of shimmering). x = core, y = soft halo.
   float2 EdgeCracks(float u,float v,float amount){
    float lenCm=max(1,_BladeDims.x),widCm=max(.3,_BladeDims.y),slots=max(4,lenCm*_Crack.z*.01);
    float s=u*slots,i0=floor(s),vCm=v*widCm;float core=0,halo=0;
    for(int k=-1;k<=1;k++){
     float id=i0+k;float seed=_BladeDims.z*17.13;
     float h1=hash1(float2(id,seed+1.7)),h2=hash1(float2(id*1.37,seed+4.1)),h3=hash1(float2(id*.71,seed+9.2)),h4=hash1(float2(id*2.11,seed+2.3));
     float uc=(id+.2+.6*h2)/slots;
     float threshold=.08+.8*h1;float grow=saturate((amount-threshold)/.32);
     float on=step(.04,uc)*step(uc,.975)*step(.001,grow);
     float tip=smoothstep(.84,.97,uc);
     float depth=widCm*((.22+.38*h3)*(.35+.65*grow)+tip*.45);
     // Meandering centreline (cm along the blade) as the crack runs inward, with a slight slant.
     float wig=(vnoise(float2(vCm*3.3,id*3.17+seed))-.5)*.30+(vnoise(float2(vCm*9.1,id*7.73))-.5)*.09+vCm*(h2-.5)*.45;
     float dx=(u-uc)*lenCm-wig;
     float run=saturate(vCm/max(.05,depth));
     float w=lerp(.05,.014,run);
     float fw=max(fwidth(dx),1e-4);float wpx=max(w,fw*1.1);
     float along=(1-smoothstep(.82,1,run))*on;
     float c=(1-smoothstep(wpx*.5,wpx,abs(dx)))*saturate(w/fw*1.6+.45)*along;
     float hl=(1-smoothstep(wpx,wpx*4,abs(dx)))*along*(1-run*.6);
     // A fork from 35-60% of the way in, off to one side.
     float fv=depth*(.35+.25*h4);float side=h4>.5?1:-1;float bdx=dx-(vCm-fv)*.75*side;float brun=saturate((vCm-fv)/max(.05,depth*.45));
     float fork=step(.42,h4)*step(fv,vCm)*(1-smoothstep(.75,1,brun))*on*smoothstep(.25,.6,grow);
     float bw=max(lerp(.03,.012,brun),fw*1.1);
     c=max(c,(1-smoothstep(bw*.5,bw,abs(bdx)))*saturate(.03/fw*1.6+.45)*fork);
     core=max(core,c);halo=max(halo,hl);
    }
    return float2(core,halo);
   }

   float4 frag(v2f i):SV_Target {
    float3 n=ForgeSafeNormal(i.normal),view=ForgeSafeNormal(_WorldSpaceCameraPos-i.worldPos);
    float part=i.data.y;
    if(part>1.5){
     // Fittings: bolster, guard, pommel (brass), handle (wood or leather), gem.
     float3 albedo=GammaToLinearSpace(i.color.rgb);float code=i.color.a;float brass=code>.25&&code<.75?1:0;float gem=code>.75?1:0;
     float grainF=tex2D(_MainTex,i.local.xz*1.7+i.local.y*3).r;albedo*=lerp(.85+.3*grainF,1,brass);
     float3 c=ForgeLit(albedo,brass*.85+gem*.2,lerp(.32,.62,brass)+gem*.3,i.worldPos,n,view)+albedo*gem*(.5+.3*sin(_Time.y*2.2));
     float4 fc=float4(c,1);UNITY_APPLY_FOG(i.fogCoord,fc);return fc;
    }
    float u=i.uv.x,v=i.uv.y;float2 cm=float2(u*_BladeDims.x,v*_BladeDims.y);if(part>.5)cm=float2(i.local.x,i.local.z)*_BladeDims.w*.1;
    float swatch=_Swatch>.5?1:0;
    // Dissolve (shatter pieces fading out): a screen-space stipple, which reads as a fade rather than as blotches.
    if(_Dissolve>0){float2 sp=floor(i.pos.xy);float ign=frac(52.9829189*frac(dot(sp,float2(.06711056,.00583715))));clip(ign-_Dissolve*1.02);}
    // ---- temperature
    float thick=max(.1,i.data.x);float TC=HeatK(thick)-273.15;
    float hot=smoothstep(_Surface.x,_Surface.y,TC);
    // ---- fresh steel: fracture faces of shatter pieces and the chip notch carry no scale; at forging heat a fresh face
    //      oxidises within a fraction of a second, so it shows as bright grey metal only once it has cooled
    float fracture=_Shard>.5?1-smoothstep(.35,1.3,i.data.z):0;
    float notch=0;
    if(_Notch.w>.5){float du=abs(u-_Notch.x)/max(.002,_Notch.y);notch=(1-smoothstep(.75,1.25,du))*(1-smoothstep(_Notch.z*1.2,_Notch.z*2.2+.04,v));}
    float fresh=max(fracture,notch);float freshLook=fresh*(1-smoothstep(250,500,TC));
    // ---- oxide scale: a film that, as it matures, breaks into plates about 1/_Chroma.z cm across with brighter gaps
    //      between them; patchy at large scale; knocked off at footprints and regrowing. Plates too small to resolve
    //      (under about 4 px) fade to their average so the pattern never shimmers.
    // Patchy at the centimetre scale (thicker and thinner scale), readable at any distance.
    float mott=vnoise(cm*.55+_BladeDims.z*13)*.6+vnoise(cm*1.7+3.1)*.28+vnoise(cm*5.3)*.12;
    float patches=.45+.55*smoothstep(.28,.72,mott);
    float2 cp=cm*_Chroma.z+_BladeDims.z*7.31;float2 cell=Cells(cp);
    float cellPerPx=max(fwidth(cp.x),fwidth(cp.y));float detail=saturate((1/max(cellPerPx,1e-3)-2.5)/2.5);
    float gapW=max(.07,cellPerPx*1.5);float plate=lerp(.8,smoothstep(gapW*.5,gapW*1.6,cell.x),detail);
    float mature=_Chroma.w*smoothstep(.3,.8,_Oxide.x);
    // Young scale is a continuous patchy film; mature scale covers fully on the plates and barely in the gaps.
    float cover=lerp(patches,lerp(.12,1,plate)*(.7+.3*patches)*(.85+.15*lerp(.5,cell.y,detail)),mature);
    float scale=_Oxide.x*cover*(1-swatch)*(1-fresh);float flash=0;
    for(int h=0;h<4;h++){float4 hit=_Hits[h];float2 d=float2((u-hit.x)*_BladeDims.x,(v-hit.y)*_BladeDims.y);float r=_Oxide.w;float inside=1-smoothstep(r*.55,r,length(d));
     float regrow=1-exp(-hit.z/max(.1,_Oxide.z));scale*=lerp(1,regrow,inside);flash+=inside*hit.w*saturate(1-hit.z/max(.01,_Flash.y));}
    flash*=1-swatch;
    // ---- dimples (permanent hammer marks): a shallow bowl in the normal, greyer metal in the worked state
    float dimple=0;float3 tilt=0;
    for(int m=0;m<8;m++){float4 mk=_Marks[m];if(mk.w<=0)continue;float2 d=float2((u-mk.x)*_BladeDims.x,(v-mk.y)*_BladeDims.y);float r=max(.2,mk.z);float q=saturate(1-dot(d,d)/(r*r));dimple=max(dimple,q*mk.w);
     float2 g=-d/r*q*mk.w*.9;tilt+=float3(g.x,0,g.y);}
    dimple*=1-swatch;
    // Fuller groove from stage 2 (finished and forged blades alike).
    float fuller=_Stage>=2&&part<.5&&_Kind!=4?smoothstep(.06,.12,u)*(1-smoothstep(.62,.72,u))*(1-smoothstep(.055,.075,abs(v-.66))):0;
    if(fuller>0){float side=sign(v-.66);tilt+=float3(0,0,side*.35*fuller*(abs(v-.66)<.065?1:0));}
    float3 up=mul((float3x3)unity_ObjectToWorld,float3(0,1,0));
    float3 wn=ForgeSafeNormal(n+mul((float3x3)unity_ObjectToWorld,tilt)*sign(dot(n,up)));
    n=ForgeSafeNormal(lerp(n,wn,1-hot*.6));
    // ---- risk cracks (not on shatter pieces: their fracture faces are the cracks)
    float2 crack=_Shard<.5&&_Crack.x>.001?EdgeCracks(u,v,_Crack.x)*(1-swatch):float2(0,0);
    // ---- surface
    float2 gp=i.local.xz*.9;float grain=tex2D(_MainTex,gp).r;
    float3 polished=_Color.rgb*(.48+grain*.75);
    if(_Kind==4){float folds=sin(cm.x*4.2+sin(cm.y*3.1)*1.8+sin(cm.x*.8)*3);polished*=.72+folds*.13;}
    if(_Kind==7){float grazing=1-abs(dot(n,view));float3 film=.68+.32*cos(float3(0,2.1,4.2)+grazing*7+cm.x*.5);polished=lerp(polished,film,.6);}
    // Cold scale: near-black oxide, the plates a touch darker than the hairline gaps between them.
    float3 oxideCol=float3(.0242,.0252,.0273)*(.75+.5*grain)*(1+.35*patches*_Worked)*lerp(1,lerp(1.25,.9,plate),mature*(1-swatch));
    float3 bare=lerp(oxideCol,polished*.55,saturate(dimple*1.2+fuller*.25+freshLook*.9));   // hammered and fresh spots show greyer metal
    float worked=swatch>.5?1:_Worked;
    float3 base=lerp(polished,bare,worked);
    float metal=lerp(_Metallic,.45,worked);float smooth=lerp(_Glossiness*(.64+grain*.3),.35+.15*dimple+.25*freshLook,worked);
    metal=lerp(metal,_Surface.z,hot);smooth=lerp(smooth,_Surface.w,hot);
    // A cold crack is a dark hairline with a faint lighter lip.
    base=lerp(base,base*.15,crack.x*(1-hot));base+=polished*.05*crack.y*(1-crack.x)*(1-hot)*worked;
    float3 lit=ForgeLit(base,metal,smooth,i.worldPos,n,view);
    // Kirchhoff: oxidised steel at forging heat is a near-black body (emissivity about .85), so it reflects little of the
    // room; the glow, not the lamp sheen, carries its colour. _Surface2: from C, to C, reflectance left when hot.
    lit*=lerp(1,_Surface2.z,smoothstep(_Surface2.x,_Surface2.y,TC));
    // Faint blue temper sheen on cold worked oxide.
    lit+=float3(.006,.010,.022)*pow(1-saturate(dot(n,view)),3)*worked*(1-hot);
    // ---- emission: scale plates dim it (their gaps much less), clean footprints and a Perfect flash brighten it
    float3 E=Blackbody(TC);
    float emis=(1-_Oxide.y*scale)*(1+_Flash.x+flash*_Flash.z*.5);
    float3 glow=E*emis;
    // Hot cracks: on bright (yellow-orange) steel the cooler lips read as dark jagged lines; on dull red steel above
    // about 600 C the crack's mouth glows hotter than the skin around it (a cavity radiates more), so it shows as a
    // bright vein. _Crack.w is the temperature where one look hands over to the other.
    float crackHot=smoothstep(560,700,TC),bright=1-smoothstep(_Crack.w-80,_Crack.w+80,TC);
    float3 vein=Blackbody(TC+260)*(1+_Crack.y)+float3(.35,.12,.02)*_Crack.y;
    glow=lerp(glow,glow*.12,saturate(crack.x+crack.y*.35)*crackHot*(1-bright));
    glow=lerp(glow,max(glow,vein),crack.x*crackHot*bright);
    lit*=1-crack.x*crackHot*.8;
    float3 color=lit+glow;
    // Shatter: fracture faces flash white-hot through the hit-stop.
    color+=float3(1,.86,.6)*fracture*_CrackFlash*(4+E.r);
    // Evolution glint sweep, the luminous spine from stage 4, the evolution lift and Flow tint.
    if(_Glint>=0&&_Glint<=1.4){float band=exp(-pow((u-(_Glint*1.2-.1))/.05,2));color+=float3(1,.95,.85)*1.6*band;}
    float pulse=(.7+.3*sin(_Time.y*2.5+u*8))*step(4,_Stage)*.35*smoothstep(.82,.98,v)*(1-_Shard);
    color+=_EmissionColor.rgb+_GlowColor.rgb*pulse;
    if(_ForgeMetalDebug>.5)color=_ForgeMetalDebug<1.5?base:_ForgeMetalDebug<2.5?lit:_ForgeMetalDebug<3.5?glow:float3(fresh,dimple,worked)*.5;
    float4 col=float4(max(0,color),1);UNITY_APPLY_FOG(i.fogCoord,col);return col;
   }
   ENDCG
  }
 } FallBack Off
}
