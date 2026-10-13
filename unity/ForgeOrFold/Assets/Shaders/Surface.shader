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
  _ObjectSpace("Object-space mapping",Float)=0 _GrainUp("Vertical grain",Float)=0 _VertexAO("Baked vertex AO",Float)=0 _Brick("Procedural brick",Float)=0 _BrickSize("Brick module, joint, bevel (m)",Vector)=(.225,.075,.010,.002) _BrickStagger("Row offset (fraction of a module)",Float)=.5 _BrickTilt("Per-unit tilt (flagstones)",Float)=0 _MortarColor("Mortar",Color)=(.165,.149,.129,1) _Soot("Soot",Range(0,1))=0 _Wear("Anvil wear",Float)=0 _Pulse("Coal pulse",Float)=0 }
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
   sampler2D _MainTex;float4 _Color,_EmissionColor,_BrickSize,_MortarColor;float _Metallic,_Glossiness,_Scale,_BumpStrength,_ObjectSpace,_GrainUp,_VertexAO,_Brick,_BrickStagger,_BrickTilt,_Soot,_Wear,_Pulse;
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
   static const float3 Lum=float3(.3,.59,.11);
   float4 frag(v2f i):SV_Target {
    float3 geo=ForgeSafeNormal(i.normal),n=geo,view=ForgeSafeNormal(_WorldSpaceCameraPos-i.worldPos);
    float3 mn=ForgeSafeNormal(i.mapNormal);
    float3 w=pow(abs(mn),4);w/=max(.001,w.x+w.y+w.z);float3 p=i.mapPos*_Scale;
    float2 px=_GrainUp>.5?p.yz:p.zy,pz=_GrainUp>.5?p.yx:p.xy;
    float3 tex=tex2D(_MainTex,px).rgb*w.x+tex2D(_MainTex,p.xz).rgb*w.y+tex2D(_MainTex,pz).rgb*w.z;
    float height=dot(tex,Lum);
    float3 base=tex*_Color.rgb;float metal=_Metallic,smooth=_Glossiness*(.62+.38*height);float3 emission=_EmissionColor.rgb;
    float ao=i.color.a;if(_Pulse<.5)base*=i.color.rgb;
#ifndef FORGE_LITE
    // Relief: the dominant projection's height gradient tilts the normal (3 extra taps).
    if(_BumpStrength>0){
     float2 uv;float3 T,B;
     if(w.x>=w.y&&w.x>=w.z){uv=px;T=_GrainUp>.5?float3(0,1,0):float3(0,0,1);B=_GrainUp>.5?float3(0,0,1):float3(0,1,0);}
     else if(w.y>=w.z){uv=p.xz;T=float3(1,0,0);B=float3(0,0,1);}
     else{uv=pz;T=_GrainUp>.5?float3(0,1,0):float3(1,0,0);B=_GrainUp>.5?float3(1,0,0):float3(0,1,0);}
     if(_ObjectSpace>.5){T=UnityObjectToWorldDir(T);B=UnityObjectToWorldDir(B);}
     const float e=1.0/256;float h0=dot(tex2D(_MainTex,uv).rgb,Lum),hu=dot(tex2D(_MainTex,uv+float2(e,0)).rgb,Lum),hv=dot(tex2D(_MainTex,uv+float2(0,e)).rgb,Lum);
     float k=_BumpStrength*_Scale/e;float3 g=(hu-h0)*k*T+(hv-h0)*k*B;n=ForgeSafeNormal(n-(g-dot(g,n)*n));
    }
#endif
    // Procedural running-bond brick in the wall plane, with recessed mortar and per-brick jitter.
    if(_Brick>.5){
     float3 wp=i.worldPos;float3 an=abs(geo);float2 bc;float3 T,B;
     if(an.y>an.x&&an.y>an.z){bc=wp.xz;T=float3(1,0,0);B=float3(0,0,1);}else if(an.x>an.z){bc=wp.zy;T=float3(0,0,1);B=float3(0,1,0);}else{bc=wp.xy;T=float3(1,0,0);B=float3(0,1,0);}
     float rowF=bc.y/_BrickSize.y;float row=floor(rowF);float u=bc.x/_BrickSize.x+_BrickStagger*fmod(abs(row),2);float cell=floor(u);
     float2 f=float2(frac(u),frac(rowF));float2 dist=min(f,1-f)*_BrickSize.xy;
     float chip=0;
#ifndef FORGE_LITE
     chip=smoothstep(.62,.95,Noise(bc*55+cell*3.1))*.004+smoothstep(.7,1,Noise(bc*170))*.0015;   // edge chips up to 5 mm
#endif
     float2 edge=dist-_BrickSize.z*.5-chip;float e=min(edge.x,edge.y);
     float mortar=1-smoothstep(0,max(.0005,_BrickSize.w),e);
     float r=Hash(float2(cell,row)*1.37+.5),r2=Hash(float2(row,cell)*2.11+3.7);
     // Per-brick value and hue jitter of about +/- 8%, the odd burnt clinker.
     float3 brick=base*(1+(r-.5)*.16)*lerp(float3(1,1,1),float3(1.06,.97,.92),(r2-.5)*1.6);
     brick*=r2>.93?.62:1;
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
    // Anvil face wear (object space, metres from the face-top centre): a soft polished zone where the hammer works,
    // dark oxide toward the edges, faint scale dust, chipped edges and the hardy (square) and pritchel (round) holes.
    if(_Wear>.5){
     float3 op=i.mapPos;float top=smoothstep(.8,.95,mn.y)*step(-.009,op.y);
     float2 q=float2(op.x/.37,op.z/.135);float d=length(q);
     float blob=Noise(op.xz*9+3.1)*.65+Noise(op.xz*23+1.7)*.35;
     float polish=top*(1-smoothstep(.30,1.05,d+(blob-.5)*.55));
     float3 oxide=float3(.16,.15,.14)*(.75+.5*height),bright=float3(.45,.46,.47)*(.88+.24*height);
     base=lerp(base,lerp(oxide,bright,polish),top);metal=lerp(metal,lerp(.70,.94,polish),top);smooth=lerp(smooth,lerp(.34,.72,polish)*(.9+.1*height),top);
     // Fine scratches across the working face and a few soft hammer dings.
     float scratch=smoothstep(.9,1,Noise(float2(op.x*7,op.z*300)+Noise(op.xz*5)*3))*polish;smooth-=scratch*.15;base+=scratch*.025;
     float ding=smoothstep(.78,.95,Noise(op.xz*60+11.3))*polish*.5;smooth-=ding*.18;
     // Scale dust settles off the striking zone: low-frequency, dark, faint.
     float dust=top*(1-polish)*smoothstep(.5,.85,Noise(op.xz*31+7.3))*.55;
     base=lerp(base,float3(.05,.045,.04),dust);smooth=lerp(smooth,.15,dust);metal=lerp(metal,.3,dust);
     // Chipped face edges: shallow notches along the long edges and the heel, rough and dark, tilted outward.
     float edgeZ=.15-abs(op.z),edgeX=.39+op.x;float edgeD=min(edgeZ,edgeX);
     float along=edgeZ<edgeX?op.x*31+(op.z>0?17:0):op.z*31+53;
     float chipDepth=.0095*smoothstep(.62,.9,Noise(float2(along,1.7)))*(.6+.4*Noise(float2(along*3.1,5.3)));
     float chipped=top*(1-smoothstep(chipDepth*.55,chipDepth,edgeD))*step(.0012,chipDepth);
     base=lerp(base,base*.45,chipped);smooth=lerp(smooth,.18,chipped);metal=lerp(metal,.6,chipped);
     float3 outward=edgeZ<edgeX?float3(0,0,op.z>0?1:-1):float3(-1,0,0);
     n=ForgeSafeNormal(lerp(n,ForgeSafeNormal(n+UnityObjectToWorldDir(outward)*.9),chipped));
     // Hardy (25 mm square) and pritchel (16 mm round) holes: dark shafts with a worn bright lip.
     float hardy=max(abs(op.x+.30),abs(op.z))-.0125,pritchel=length(op.xz-float2(-.215,0))-.008;
     float hole=min(hardy,pritchel);
     float inside=top*(1-smoothstep(-.0006,.0006,hole));float lip=top*(1-smoothstep(0,.0025,abs(hole)))*(1-inside);
     base=lerp(base,float3(.012,.011,.01),inside);smooth=lerp(smooth,.2,inside);metal=lerp(metal,.3,inside);ao*=1-inside*.9;
     base=lerp(base,bright*1.1,lip*.5);smooth=lerp(smooth,.65,lip*.5);
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
