// Owner: hot-metal-vfx. Dust, hearth smoke and quench steam. _Billboard = 1: the ForgeEffects.cs smoke batch
// (one mesh; COLOR = sRGB colour and opacity, TEXCOORD0 = corner, size, spin angle; TEXCOORD3.y = how much the
// workshop lamps light the puff (0 = the colour as given, the hearth smoke; 1 = lit, steam and dust), .z = seed,
// .x = wisp (1 = quench steam: a soft core instead of thresholded noise).
// Lit puffs scatter the key, rim and fire lamps plus the room ambient isotropically, so steam in a dim forge reads
// as warm translucent vapour instead of a white glow. _Billboard = 0: an ordinary quad tinted by _Color.
Shader "Forge/Smoke" {
 Properties { _Color("Smoke",Color)=(.55,.47,.37,.3) _Billboard("CPU billboard batch",Float)=0 }
 SubShader {
  Tags { "Queue"="Transparent" "RenderType"="Transparent" }
  Blend SrcAlpha OneMinusSrcAlpha ZWrite Off Cull Off
  Pass {
   CGPROGRAM
   #pragma vertex vert
   #pragma fragment frag
   #pragma target 3.0
   #include "ForgeLighting.cginc"
   #include "ForgeBillboard.cginc"
   struct appdata {float4 vertex:POSITION;float4 uv:TEXCOORD0;float4 uv3:TEXCOORD3;float4 color:COLOR;};
   struct v2f {float4 pos:SV_POSITION;float2 uv:TEXCOORD0;float4 color:TEXCOORD1;float2 seed:TEXCOORD2;};
   fixed4 _Color;float _Billboard;
   float3 Scatter(float3 lampPos,float3 radiance,float3 p){float3 d=lampPos-p;return radiance/(1+dot(d,d)*.4);}
   v2f vert(appdata v){
    v2f o;
    if(_Billboard>.5){
     ForgeBB b=ForgeBillboard(v.vertex.xyz,v.uv.xy,v.uv.z,float3(0,0,0),0,0,0,v.uv.w);o.pos=b.pos;o.uv=v.uv.xy*.5+.5;
     float3 albedo=GammaToLinearSpace(v.color.rgb);
     float3 light=max(float3(.13,.11,.09),ShadeSH9(float4(0,1,0,1)))+(Scatter(_ForgeKeyPosition.xyz,_ForgeKeyColor.rgb*3.3,b.world)+Scatter(_ForgeRimPosition.xyz,_ForgeRimColor.rgb*3.3,b.world)+Scatter(_ForgeFirePosition.xyz,_ForgeFireColor.rgb*2.8,b.world))*.25;
     if(_ForgeGlowPos.w>0)light+=Scatter(_ForgeGlowPos.xyz,_ForgeGlowColor.rgb,b.world)*.25;
     o.color=float4(lerp(albedo,albedo*light,saturate(v.uv3.y)),v.color.a);o.seed=float2(v.uv3.z,v.uv3.x);
    }
    else{o.pos=UnityObjectToClipPos(v.vertex);o.uv=v.uv.xy;o.color=_Color;o.seed=0;}
    return o;
   }
   float hash(float2 p){return frac(sin(dot(p,float2(127.1,311.7)))*43758.5453);}
   float noise(float2 p){float2 i=floor(p),f=frac(p);f=f*f*(3-2*f);return lerp(lerp(hash(i),hash(i+float2(1,0)),f.x),lerp(hash(i+float2(0,1)),hash(i+1),f.x),f.y);}
   fixed4 frag(v2f i):SV_Target {
    float2 uv=i.uv-.5;float2 s=float2(i.seed.x*17.3,i.seed.x*9.1);
    float n=noise(i.uv*5+s+float2(_Time.y*.14,-_Time.y*.1));
    n+=noise(i.uv*11+s*1.7+float2(0,-_Time.y*.16))*.45;
    float edge=saturate(1-length(uv)*2);
    // Wisps (quench steam, seed.y = 1): a soft core with gentle noise, never the hollow rings that thresholded noise
    // makes on a small puff.
    float mask=lerp(smoothstep(0,.6,edge)*saturate(n-.25),edge*edge*saturate(n*.55+.3),i.seed.y);
    return fixed4(i.color.rgb,i.color.a*mask);
   }
   ENDCG
  }
 }
}
