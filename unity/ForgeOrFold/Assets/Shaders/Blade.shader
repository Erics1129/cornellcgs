// Owner: hot-metal-vfx. Knives, their fittings and the shatter pieces.
// Per pixel: temperature from the local thickness (TEXCOORD1.x, mm) with ForgeHeatModel's closed form
// (ForgeHeatMath.cs; _HeatA/_HeatB/_HeatC are its uniforms), blackbody emission chroma(T) x E(T), the hot-steel
// surface (matte above 450-900 C), mottled oxide scale that dims emission and is knocked off at each contact
// (_Hits) or all at once by a Perfect (_Flash), permanent hammer dimples (_Marks), the chip notch's fresh steel
// (_Notch), risk cracks (_Crack: jagged hairlines running in from the edge and the tip), the fuller groove from
// stage 2. Every mark lives in normalized blade coordinates (TEXCOORD0: u along the edge, v edge -> spine) scaled to
// centimetres by _BladeDims, so nothing slides when the blade draws out. TEXCOORD1.y is the part: 0 blade, 1 tang,
// 2 fitting (COLOR = sRGB albedo, alpha = material: 0 wood/leather, .5 brass, 1 gem). TEXCOORD1.z is the distance
// (mm) to a fracture line on shatter pieces (99 elsewhere): fresh fracture faces carry no scale and flash through
// the hit-stop.
Shader "Forge/Blade" {
 Properties {
  _MainTex("Generated steel",2D)="white"{} _Color("Metal",Color)=(.7,.75,.8,1) _Metallic("Metalness",Range(0,1))=.95 _Glossiness("Smoothness",Range(0,1))=.65
  _Heat("Heat (legacy, unused)",Range(0,1))=0 _EmissionColor("Evolution",Color)=(0,0,0,0) _GlowColor("Aura",Color)=(.5,.8,1,1) _Kind("Metal kind",Float)=0 _Stage("Evolution stage",Float)=0
  _Worked("Being forged",Float)=1 _Swatch("QA swatch",Float)=0 _Shard("Shatter piece",Float)=0 _Dissolve("Dissolve",Range(0,1))=0 _CrackFlash("Crack flash",Float)=0 _Glint("Glint sweep",Float)=-1
  _HeatA("Cooling T0 K, tau, k3, floor",Vector)=(293.15,0,.0561,0) _HeatB("Ease target K, t, dur, lead",Vector)=(293.15,-1000,1,0) _HeatC("Floors K, curve",Vector)=(923.15,873.15,0,0)
  _Emit("Emission scale, K, cap, white",Vector)=(3,9592,6,.6) _Chroma("Chroma start, slope",Vector)=(580,.000227,0,0) _Surface("Hot surface",Vector)=(450,900,.35,.25)
  _Oxide("Oxide amount, dim, regrow s, footprint cm",Vector)=(0,.4,6,1.8) _Crack("Crack amount, glow, per m, dark when hot",Vector)=(0,.6,40,1) _Flash("Flash, footprint s, gain",Vector)=(0,.12,1.2,0)
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
   float4 _HeatA,_HeatB,_HeatC,_Emit,_Chroma,_Surface,_Oxide,_Crack,_Flash,_BladeDims,_Notch;
   float4 _Hits[4];float4 _Marks[8];
   struct appdata {float4 vertex:POSITION;float3 normal:NORMAL;float2 uv:TEXCOORD0;float4 data:TEXCOORD1;float4 color:COLOR;};
   struct v2f {float4 pos:SV_POSITION;float3 worldPos:TEXCOORD0;float3 normal:TEXCOORD1;float3 local:TEXCOORD2;float2 uv:TEXCOORD3;float4 data:TEXCOORD4;float4 color:TEXCOORD5;UNITY_FOG_COORDS(6)};
   v2f vert(appdata v){v2f o;o.pos=UnityObjectToClipPos(v.vertex);o.worldPos=mul(unity_ObjectToWorld,v.vertex).xyz;o.local=v.vertex.xyz;o.normal=UnityObjectToWorldNormal(v.normal);o.uv=v.uv;o.data=v.data;o.color=v.color;UNITY_TRANSFER_FOG(o,o.pos);return o;}

   float hash1(float2 p){return frac(sin(dot(p,float2(127.1,311.7)))*43758.5453);}
   float vnoise(float2 p){float2 i=floor(p),f=frac(p);f=f*f*(3-2*f);return lerp(lerp(hash1(i),hash1(i+float2(1,0)),f.x),lerp(hash1(i+float2(0,1)),hash1(i+1),f.x),f.y);}
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
   /// Risk cracks: one jagged hairline per slot along the edge (_Crack.z slots per metre), each running in from the
   /// edge (v = 0) to a random depth; the share of slots that crack grows with `amount`. Near the tip the blade is
   /// narrow, so the same cracks cut almost across it. Anti-aliased with fwidth and at least about 1 px wide.
   float EdgeCracks(float u,float v,float amount){
    float lenCm=max(1,_BladeDims.x),widCm=max(.3,_BladeDims.y),slots=max(3,lenCm*_Crack.z*.01);
    float s=u*slots,i0=floor(s),vCm=v*widCm,acc=0;
    for(int k=-1;k<=1;k++){
     float id=i0+k;float h1=hash1(float2(id,_BladeDims.z*17.13+1.7)),h2=hash1(float2(id*1.37,_BladeDims.z*5.31+4.1)),h3=hash1(float2(id*.71,9.2));
     float uc=(id+.25+.5*h2)/slots;
     float on=step(h1,amount)*step(.07,uc)*step(uc,.985);
     // Depth (cm): deeper at higher risk; the tip cracks reach across.
     float depth=widCm*(.16+.34*h3)*(.5+.5*amount)+smoothstep(.86,.98,uc)*widCm*.5;
     // Jagged centreline: offset along the blade (cm) as the crack runs inward, plus a slight slant.
     float wig=(vnoise(float2(vCm*2.6,id*3.17))-.5)*.24+(vnoise(float2(vCm*7.5,id*7.73))-.5)*.07+vCm*(h2-.5)*.5;
     float dx=(u-uc)*lenCm-wig;
     float fw=max(fwidth(dx),1e-4);float w=.032*(1-.55*saturate(vCm/max(.05,depth)));float wpx=max(w,fw*.9);
     float ln=(1-smoothstep(wpx*.5,wpx,abs(dx)))*saturate(w/fw*1.8+.35);
     ln*=1-smoothstep(depth*.7,depth,vCm);
     acc=max(acc,ln*on);
    }
    return acc;
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
    if(_Dissolve>0){float dn=vnoise(cm*2.3+_BladeDims.z*31);clip(dn-_Dissolve*1.02);}
    // ---- temperature
    float thick=max(.1,i.data.x);float TC=HeatK(thick)-273.15;
    float hot=smoothstep(_Surface.x,_Surface.y,TC);
    // ---- fresh steel: fracture faces of shatter pieces and the chip notch carry no scale
    float fracture=_Shard>.5?1-smoothstep(.35,1.3,i.data.z):0;
    float notch=0;
    if(_Notch.w>.5){float du=abs(u-_Notch.x)/max(.002,_Notch.y);notch=(1-smoothstep(.75,1.25,du))*(1-smoothstep(_Notch.z*1.2,_Notch.z*2.2+.04,v));}
    float fresh=max(fracture,notch);
    // ---- oxide scale: mottled patches and flecks, knocked off at footprints, regrowing
    float mott=vnoise(cm*1.3+_BladeDims.z*13)*.55+vnoise(cm*4.7+3.1)*.3+vnoise(cm*13.0)*.15;
    float patches=.2+.8*smoothstep(.34,.72,mott);
    float scale=_Oxide.x*patches*(1-swatch)*(1-fresh);float flash=0;
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
    float3 wn=ForgeSafeNormal(n+mul((float3x3)unity_ObjectToWorld,tilt)*sign(dot(n,mul((float3x3)unity_ObjectToWorld,float3(0,1,0)))));
    n=ForgeSafeNormal(lerp(n,wn,1-hot*.6));
    // ---- risk cracks (not on shatter pieces: their fracture faces are the cracks)
    float crackLine=_Shard<.5&&_Crack.x>.001?EdgeCracks(u,v,_Crack.x)*(1-swatch):0;
    // ---- surface
    float2 gp=i.local.xz*.9;float grain=tex2D(_MainTex,gp).r;
    float3 polished=_Color.rgb*(.48+grain*.75);
    if(_Kind==4){float folds=sin(cm.x*4.2+sin(cm.y*3.1)*1.8+sin(cm.x*.8)*3);polished*=.72+folds*.13;}
    if(_Kind==7){float grazing=1-abs(dot(n,view));float3 film=.68+.32*cos(float3(0,2.1,4.2)+grazing*7+cm.x*.5);polished=lerp(polished,film,.6);}
    float3 oxideCol=float3(.0242,.0252,.0273)*(.75+.5*grain)*(1+.35*patches*_Worked);
    float3 bare=lerp(oxideCol,polished*.55,saturate(dimple*1.2+fuller*.25+fresh*.9));   // hammered and fresh spots show greyer metal
    float worked=swatch>.5?1:_Worked;
    float3 base=lerp(polished,bare,worked);
    float metal=lerp(_Metallic,.45,worked);float smooth=lerp(_Glossiness*(.64+grain*.3),.35+.15*dimple+.25*fresh,worked);
    metal=lerp(metal,_Surface.z,hot);smooth=lerp(smooth,_Surface.w,hot);
    // A cold crack shows a lighter hairline of fresh metal on the oxide; on finished (polished) steel a dark one.
    base=lerp(base,lerp(base*.3,polished*.6,worked),crackLine*(1-hot));
    float3 lit=ForgeLit(base,metal,smooth,i.worldPos,n,view);
    // Faint blue temper sheen on cold worked oxide.
    lit+=float3(.006,.010,.022)*pow(1-saturate(dot(n,view)),3)*worked*(1-hot);
    // ---- emission
    float3 E=Blackbody(TC);
    float emis=(1-_Oxide.y*scale)*(1+_Flash.x+flash*_Flash.z*.5);
    float3 color=lit+E*emis;
    // Hot cracks: the lips of a crack run cooler than the surface around them, so they read as dark jagged lines on
    // the glow (_Crack.w = 1); _Crack.w = 0 draws them glowing warm white instead.
    float crackHot=smoothstep(560,820,TC);
    color=lerp(color,color*.22,crackLine*crackHot*_Crack.w*saturate(_Crack.y*1.6));
    color+=float3(1,.85,.62)*crackLine*crackHot*(1-_Crack.w)*_Crack.y*(1+E.g);
    // Shatter: fracture faces flash white-hot through the hit-stop.
    color+=float3(1,.86,.6)*fracture*_CrackFlash*(4+E.r);
    // Evolution glint sweep, the luminous spine from stage 4, the evolution lift and Flow tint.
    if(_Glint>=0&&_Glint<=1.4){float band=exp(-pow((u-(_Glint*1.2-.1))/.05,2));color+=float3(1,.95,.85)*1.6*band;}
    float pulse=(.7+.3*sin(_Time.y*2.5+u*8))*step(4,_Stage)*.35*smoothstep(.82,.98,v);
    color+=_EmissionColor.rgb+_GlowColor.rgb*pulse;
    float4 col=float4(max(0,color),1);UNITY_APPLY_FOG(i.fogCoord,col);return col;
   }
   ENDCG
  }
 } FallBack Off
}
