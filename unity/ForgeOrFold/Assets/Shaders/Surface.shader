Shader "Forge/Surface" {
 // Owner: room-light-post. Triplanar workshop surface. Switches (uniform branches, no extra variants):
 //  _ObjectSpace 1: map in metric object space (moving objects: hammer, tongs, coins, pan; the anvil).
 //  _GrainUp 1: wood grain runs vertically on the side faces (posts, legs, staves, the stump, door planks).
 //  _VertexAO 1: vertex colour a = baked contact AO, rgb = tint (or, with _Pulse, r = coal heat, g = phase).
 //  _Brick 1: procedural running-bond brick in the wall plane (_BrickSize: module x, y, joint, bevel in metres;
 //  _BrickStagger: row offset; _BrickTilt: per-unit normal tilt, so the same code lays the flagstone floor).
 //  _Soot: soot darkening above 2.2 m and around the flue (_ForgeSoot globals).
 //  _Wear 1: anvil face wear in object space (polished centre, oxidised edges, scale dust, chips, hardy and pritchel holes).
 //  _Pulse 1: coal glow through _ForgeCoalPulse (x = time, y = fire level, z = pulse depth).
 //  _BumpStrength > 0: height-derived relief from the texture (3 extra taps). FORGE_LITE (tiers 2-3) skips
 //  the relief, the brick bevel and chips, and the occluder shadows: the only two variants are full and lite.
 Properties { _MainTex("Generated surface scan",2D)="white"{} _Color("Tint",Color)=(1,1,1,1) _Metallic("Metalness",Range(0,1))=0 _Glossiness("Smoothness",Range(0,1))=.3 _Scale("World tiling",Float)=.5 _BumpStrength("Surface relief (m)",Range(0,.05))=0 _EmissionColor("Emission",Color)=(0,0,0,0)
  _ObjectSpace("Object-space mapping",Float)=0 _GrainUp("Vertical grain",Float)=0 _VertexAO("Baked vertex AO",Float)=0 _Brick("Procedural brick",Float)=0 _BrickSize("Brick module, joint, bevel (m)",Vector)=(.225,.075,.010,.002) _BrickStagger("Row offset (fraction of a module)",Float)=.5 _BrickTilt("Per-unit tilt (flagstones)",Float)=0 _MortarColor("Mortar",Color)=(.165,.149,.129,1) _Soot("Soot",Range(0,1))=0 _Wear("Anvil wear",Float)=0 _FaceTex("Anvil face detail",2D)="grey"{} _Pulse("Coal pulse",Float)=0 }
 SubShader { Tags {"RenderType"="Opaque"} LOD 300
  // Explicit full-precision, single-pass lighting avoids close-up WebGL surface-pass artifacts.
  Pass { Tags {"LightMode"="ForwardBase"}
   CGPROGRAM
   #pragma vertex vert
   #pragma fragment frag
   #pragma target 3.0
   #pragma multi_compile_fog
   #pragma multi_compile _ FORGE_LITE
   #include "ForgeLighting.cginc"
   sampler2D _MainTex,_FaceTex;float4 _Color,_EmissionColor,_BrickSize,_MortarColor;float _Metallic,_Glossiness,_Scale,_BumpStrength,_ObjectSpace,_GrainUp,_VertexAO,_Brick,_BrickStagger,_BrickTilt,_Soot,_Wear,_Pulse;
   // Soot: x = start height, y = full height, zw = flue centre (x, z); _ForgeSootFlue: x = radius, y = start height.
   float4 _ForgeSoot,_ForgeSootFlue,_ForgeCoalPulse;float _ForgeAoDirect;
   struct appdata {float4 vertex:POSITION;float3 normal:NORMAL;float4 color:COLOR;};
   struct v2f {float4 pos:SV_POSITION;float3 worldPos:TEXCOORD0;float3 normal:TEXCOORD1;float3 mapPos:TEXCOORD2;float3 mapNormal:TEXCOORD3;float4 color:TEXCOORD4;UNITY_FOG_COORDS(5)};
   v2f vert(appdata v){v2f o;o.pos=UnityObjectToClipPos(v.vertex);o.worldPos=mul(unity_ObjectToWorld,v.vertex).xyz;o.normal=UnityObjectToWorldNormal(v.normal);
    float3 scale=float3(length(unity_ObjectToWorld._m00_m10_m20),length(unity_ObjectToWorld._m01_m11_m21),length(unity_ObjectToWorld._m02_m12_m22));
    bool obj=_ObjectSpace>.5;o.mapPos=obj?v.vertex.xyz*scale:o.worldPos;o.mapNormal=obj?v.normal:o.normal;
    o.color=_VertexAO>.5?v.color:float4(1,1,1,1);UNITY_TRANSFER_FOG(o,o.pos);return o;}
   float Hash(float2 p){float3 p3=frac(p.xyx*.1031);p3+=dot(p3,p3.yzx+33.33);return frac((p3.x+p3.y)*p3.z);}
   float Noise(float2 p){float2 i=floor(p),f=frac(p);f=f*f*(3-2*f);return lerp(lerp(Hash(i),Hash(i+float2(1,0)),f.x),lerp(Hash(i+float2(0,1)),Hash(i+1),f.x),f.y);}
   float Fbm(float2 p){return Noise(p)*.5+Noise(p*2.03+float2(17.1,3.3))*.3+Noise(p*4.07+float2(5.7,11.9))*.2;}
   static const float3 Lum=float3(.3,.59,.11);
   float4 frag(v2f i):SV_Target {
    float3 geo=ForgeSafeNormal(i.normal),n=geo,view=ForgeSafeNormal(_WorldSpaceCameraPos-i.worldPos);
    float3 mn=ForgeSafeNormal(i.mapNormal);
    float3 w=pow(abs(mn),4);w/=max(.001,w.x+w.y+w.z);float3 p=i.mapPos*_Scale;
    // Brick and flagstone units (procedural bond in the dominant wall plane). Each unit samples the scan at its own
    // offset so the texture never repeats from brick to brick or slab to slab; the gradients come from the unshifted
    // coordinates, so the jump at a joint never picks a wrong mip.
    float2 bc=0,bf=0;float3 bT=0,bB=0;float bRow=0,bCell=0;float3 shift=0;
    if(_Brick>.5){
     float3 wp=i.worldPos;float3 an=abs(geo);
     if(an.y>an.x&&an.y>an.z){bc=wp.xz;bT=float3(1,0,0);bB=float3(0,0,1);}else if(an.x>an.z){bc=wp.zy;bT=float3(0,0,1);bB=float3(0,1,0);}else{bc=wp.xy;bT=float3(1,0,0);bB=float3(0,1,0);}
     float rowF=bc.y/_BrickSize.y;bRow=floor(rowF);float u=bc.x/_BrickSize.x+_BrickStagger*fmod(abs(bRow),2);bCell=floor(u);bf=float2(frac(u),frac(rowF));
     shift=float3(Hash(float2(bCell,bRow)+.31),Hash(float2(bRow,bCell)+.77),Hash(float2(bCell*.7,bRow*1.3)+.13))*7.31;
    }
    float2 px=_GrainUp>.5?p.yz:p.zy,py=p.xz,pz=_GrainUp>.5?p.yx:p.xy;
    float2 sx=_GrainUp>.5?shift.yz:shift.zy,sz=_GrainUp>.5?shift.yx:shift.xy;
    float2 dxx=ddx(px),dyx=ddy(px),dxy=ddx(py),dyy=ddy(py),dxz=ddx(pz),dyz=ddy(pz);
    float3 tex=tex2Dgrad(_MainTex,px+sx,dxx,dyx).rgb*w.x+tex2Dgrad(_MainTex,py+shift.xz,dxy,dyy).rgb*w.y+tex2Dgrad(_MainTex,pz+sz,dxz,dyz).rgb*w.z;
    float height=dot(tex,Lum);
    float3 base=tex*_Color.rgb;float metal=_Metallic,smooth=_Glossiness*(.62+.38*height);float3 emission=_EmissionColor.rgb;
    float ao=i.color.a;if(_Pulse<.5)base*=i.color.rgb;
#ifndef FORGE_LITE
    // Relief: the dominant projection's height gradient tilts the normal (3 extra taps).
    if(_BumpStrength>0){
     float2 uv,gx,gy;float3 T,B;
     if(w.x>=w.y&&w.x>=w.z){uv=px+sx;gx=dxx;gy=dyx;T=_GrainUp>.5?float3(0,1,0):float3(0,0,1);B=_GrainUp>.5?float3(0,0,1):float3(0,1,0);}
     else if(w.y>=w.z){uv=py+shift.xz;gx=dxy;gy=dyy;T=float3(1,0,0);B=float3(0,0,1);}
     else{uv=pz+sz;gx=dxz;gy=dyz;T=_GrainUp>.5?float3(0,1,0):float3(1,0,0);B=_GrainUp>.5?float3(1,0,0):float3(0,1,0);}
     if(_ObjectSpace>.5){T=UnityObjectToWorldDir(T);B=UnityObjectToWorldDir(B);}
     const float e=1.0/256;float h0=dot(tex2Dgrad(_MainTex,uv,gx,gy).rgb,Lum),hu=dot(tex2Dgrad(_MainTex,uv+float2(e,0),gx,gy).rgb,Lum),hv=dot(tex2Dgrad(_MainTex,uv+float2(0,e),gx,gy).rgb,Lum);
     float k=_BumpStrength*_Scale/e;float3 g=(hu-h0)*k*T+(hv-h0)*k*B;n=ForgeSafeNormal(n-(g-dot(g,n)*n));
    }
#endif
    // Procedural running-bond brick, with recessed mortar and per-unit value and hue jitter.
    if(_Brick>.5){
     float2 f=bf;float2 dist=min(f,1-f)*_BrickSize.xy;float3 T=bT,B=bB;float row=bRow,cell=bCell;
     float chip=0;
#ifndef FORGE_LITE
     chip=smoothstep(.62,.95,Noise(bc*55+cell*3.1))*.004+smoothstep(.7,1,Noise(bc*170))*.0015;   // edge chips up to 5 mm
#endif
     float2 edge=dist-_BrickSize.z*.5-chip;float e=min(edge.x,edge.y);
     float mortar=1-smoothstep(0,max(.0005,_BrickSize.w),e);
     float r=Hash(float2(cell,row)*1.37+.5),r2=Hash(float2(row,cell)*2.11+3.7),r3=Hash(float2(cell+row*7.1,row)*.73+1.9);
     // Per-unit value (+/- 12%) and hue jitter (red-brown to grey-brown), a few dark clinkers and pale salmon bricks,
     // and a soft fired-face gradient across each unit.
     // The scan is a strongly orange fired face; mute it so warm light, not the albedo, gives the colour.
     float3 brick=lerp(dot(base,Lum).xxx*float3(1.2,.97,.85),base,.35)*(1+(r-.5)*.24)*lerp(float3(1,1,1),float3(1.07,.96,.90),(r2-.5)*1.8);
     brick=lerp(brick,dot(brick,Lum)*float3(1.02,1,.97),saturate((r3-.55)*1.6)*.5);
     brick*=r2>.93?.58:r2<.05?1.22:1;
     brick*=.92+.16*Noise(bc*float2(9,19)+r*13);
     base=lerp(brick,_MortarColor.rgb*(.75+.5*height),mortar);smooth=lerp(smooth,.06,mortar);ao*=1-mortar*.45;
#ifndef FORGE_LITE
     // The 2 mm bevel slopes down into the joint: tilt the normal toward the nearest joint.
     float bevel=(1-saturate(e/max(.0005,_BrickSize.w)))*(1-mortar);
     float3 toward=edge.x<edge.y?T*(f.x<.5?-1:1):B*(f.y<.5?-1:1);
     n=ForgeSafeNormal(n+toward*bevel*.7);
     // Flagstones: each slab lies at its own slight angle.
     if(_BrickTilt>0){float2 tilt=(float2(r,r2)-.5)*2*_BrickTilt*(1-mortar);n=ForgeSafeNormal(n+T*tilt.x+B*tilt.y);}
#endif
    }
    if(_Soot>0){
     float2 fd=i.worldPos.xz-_ForgeSoot.zw;
     float flue=saturate(1-length(fd)/max(.01,_ForgeSootFlue.x))*smoothstep(_ForgeSootFlue.y,_ForgeSoot.y,i.worldPos.y);
     float soot=saturate(smoothstep(_ForgeSoot.x,_ForgeSoot.y,i.worldPos.y)*.75+flue)*_Soot*(.7+.3*Noise(i.worldPos.xy*3.7+i.worldPos.z*2.3));
     base*=1-soot*.82;smooth*=1-soot*.7;
    }
    // Anvil (object space, metres from the face-top centre; +x toward the horn). The body is black forge scale over
    // iron (satin, near-black, rust in a few hollows); the face is hardened tool steel: a ground working zone over most
    // of its length (brushed and scratched, a few hammer dings), dark oxide toward the margins and round the holes,
    // scale dust where flakes settle, chipped long edges, worn bright edge radii, and the hardy (square) and pritchel
    // (round) holes at the heel. The horn's crown and the step are burnished where stock is bent over them.
    if(_Wear>.5){
     float3 op=i.mapPos;float top=smoothstep(.8,.95,mn.y)*step(-.009,op.y);
     // Worn edge radius: the bevel and the top 6 mm of the face plate's sides.
     float rim=(1-top)*step(-.006,op.y)*step(abs(op.x),.392)*step(abs(op.z),.152);
     float mottle=Noise(op.xy*14+op.z*9)*.6+Noise(op.yz*41+op.x*17)*.4;
     float rust=smoothstep(.72,.95,Fbm(op.xz*7+op.y*11+5.1))*.4;
     float3 scale=float3(.024,.024,.026)*(.7+.6*height)*(.8+.4*mottle);
     base=lerp(scale,float3(.055,.032,.02)*(.75+.5*height),rust);metal=lerp(.72,.2,rust);smooth=lerp(.46,.18,rust)*(.8+.4*height);
     float3 steel=float3(.40,.40,.41)*(.85+.3*height);
     float crown=smoothstep(.80,.97,mn.y)*step(.395,op.x)*(1-top)*(.6+.4*Noise(op.xz*19+4.2));
     base=lerp(base,steel*.55,crown);metal=lerp(metal,.9,crown);smooth=lerp(smooth,.5,crown);
     base=lerp(base,steel*.85,rim);metal=lerp(metal,.92,rim);smooth=lerp(smooth,.55,rim);
     // Ground and scratched tool steel from the scan, one tile over the whole face (no seam; uniform control flow).
     float detail=dot(tex2D(_FaceTex,op.xz*1.2+.5).rgb,Lum)/.055;
     if(top>0){
      // Working zone: a rounded rectangle over most of the face, its edge broken up by noise.
      float2 warp=float2(Fbm(op.xz*3.1+7.7),Fbm(op.xz*3.1+1.3))-.5;
      float2 qd=abs(op.xz-float2(.03,0))-float2(.29,.085);float sd=length(max(qd,0))+min(max(qd.x,qd.y),0)-.03;
      float polish=(1-smoothstep(-.02,.035,sd+warp.x*.05+(Fbm(op.xz*9+3.1)-.5)*.03))*(.8+.2*Fbm(op.xz*14+9.1));
      float brush=Noise(float2(op.x*9,op.z*420))*.5+Noise(float2(op.x*3+7,op.z*170))*.5;
      float3 oxide=float3(.045,.043,.041)*(.7+.6*height)*(.85+.3*Fbm(op.xz*6+2));
      float3 face=lerp(oxide,steel*clamp(.75+.25*detail,.5,1.15)*(.94+.1*brush),polish);
      // Rust bloom and a brown temper tint in the oxide margin.
      face=lerp(face,float3(.07,.045,.03)*(.7+.6*Fbm(op.xz*5)),(1-polish)*smoothstep(.55,.85,Noise(op.xz*16+2.3))*.5);
      float fm=lerp(.6,.96,polish),fs=lerp(.32,clamp(.6+.05*brush-.05*detail,.45,.66),polish);
      // Fine scratches across the working zone and soft hammer dings.
      float2 sr=float2(op.x*.94+op.z*.34,op.z*.94-op.x*.34);
      float scratch=smoothstep(.88,1,Noise(float2(sr.x*6,sr.y*340)+Noise(op.xz*5)*3))*polish;fs-=scratch*.12;face+=scratch*.025;
      float ding=smoothstep(.76,.95,Noise(op.xz*60+11.3))*polish;fs-=ding*.1;face*=1-ding*.15;
      // Scale dust settles off the striking zone: fine dark flecks.
      float dust=(1-polish)*smoothstep(.55,.85,Noise(op.xz*31+7.3))*.6+(1-polish*.7)*smoothstep(.86,.97,Noise(op.xz*140+2.9))*.5;
      face=lerp(face,float3(.022,.02,.019),saturate(dust));fs=lerp(fs,.14,saturate(dust));fm=lerp(fm,.3,saturate(dust));
      base=lerp(base,face,top);metal=lerp(metal,fm,top);smooth=lerp(smooth,fs,top);
      // The scan's blotches are colour, not height: the ground face stays flat (no texture relief).
      n=ForgeSafeNormal(lerp(n,geo,top));
#ifndef FORGE_LITE
      // A ground face is flat; a faint long-wave unevenness (a few mrad) keeps the lamp's sheen from looking like glass.
      const float ek=.01;float h0=Noise(op.xz*11+.5),hx=Noise((op.xz+float2(ek,0))*11+.5),hz=Noise((op.xz+float2(0,ek))*11+.5);
      float3 tilt=float3(hx-h0,0,hz-h0)*.12*top;n=ForgeSafeNormal(n-mul((float3x3)unity_ObjectToWorld,tilt));   // not UnityObjectToWorldDir: it normalizes
#endif
      // Chipped long edges and heel: shallow notches, rough and dark, tilted outward.
      float edgeZ=.15-abs(op.z),edgeX=.39+op.x;float edgeN=min(edgeZ,edgeX);
      float along=edgeZ<edgeX?op.x*31+(op.z>0?17:0):op.z*31+53;
      float chipDepth=.0095*smoothstep(.62,.9,Noise(float2(along,1.7)))*(.6+.4*Noise(float2(along*3.1,5.3)));
      float chipped=top*(1-smoothstep(chipDepth*.55,chipDepth,edgeN))*step(.0012,chipDepth);
      base=lerp(base,scale*.8,chipped);smooth=lerp(smooth,.18,chipped);metal=lerp(metal,.5,chipped);
      float3 outward=edgeZ<edgeX?float3(0,0,op.z>0?1:-1):float3(-1,0,0);
      n=ForgeSafeNormal(lerp(n,ForgeSafeNormal(n+UnityObjectToWorldDir(outward)*.9),chipped));
      // Hardy (25 mm square) and pritchel (16 mm round) holes: dark shafts with a worn bright lip.
      float hardy=max(abs(op.x+.30),abs(op.z))-.0125,pritchel=length(op.xz-float2(-.215,0))-.008;
      float hole=min(hardy,pritchel);
      float inside=top*(1-smoothstep(-.0006,.0006,hole));float lip=top*(1-smoothstep(0,.003,abs(hole)))*(1-inside);
      base=lerp(base,float3(.004,.004,.004),inside);smooth=lerp(smooth,.2,inside);metal=lerp(metal,.3,inside);ao*=1-inside*.9;
      base=lerp(base,steel*.9,lip*.5);smooth=lerp(smooth,.58,lip*.5);metal=lerp(metal,.92,lip*.5);
     }
    }
    if(_Pulse>.5){
     float heat=i.color.r,phase=i.color.g;
     float wave=.5+.5*sin(_ForgeCoalPulse.x*(1.1+phase*1.6)+phase*6.283);
     float level=_ForgeCoalPulse.y*(1-_ForgeCoalPulse.z+_ForgeCoalPulse.z*2*wave);
     // Glow lives in the cracks: dark crust on the high points of the texture.
     float crack=saturate(1.35-height*1.5);
     emission*=heat*level*(.25+.75*crack);base*=1-heat*.55;
    }
    float4 color=float4(ForgeLitAO(base,metal,smooth,i.worldPos,n,view,ao,_ForgeAoDirect)+emission,1);
    UNITY_APPLY_FOG(i.fogCoord,color);return color;
   }
   ENDCG
  }
 } FallBack Off
}
