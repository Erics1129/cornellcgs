// Owner: hot-metal-vfx. Hammer scale, sheets, chips, quench bubbles and ripples (ForgeVfx.cs lit batch).
// Lit by the workshop lamps with a tumbling normal (the CPU passes how much the flake faces the camera),
// plus its own blackbody emission (TEXCOORD2.rgb, linear HDR) while hot. Billboards from ForgeBillboard.cginc.
// Vertex data: POSITION centre; TEXCOORD0 corner.xy, size m, facing; TEXCOORD1 velocity xyz, stretch s;
// TEXCOORD2 emission rgb, alpha; TEXCOORD3 shape (0 disc, 1 flake polygon, 2 ring), flat, seed, min px;
// COLOR albedo (sRGB).
Shader "Forge/ParticleLit" {
 Properties { _MainTex("Sprite",2D)="white"{} _Color("Tint",Color)=(1,1,1,1) _Intensity("Intensity",Float)=1 _Soft("Edge softness",Range(.05,1))=.35 }
 SubShader { Tags {"Queue"="Transparent" "RenderType"="Transparent" "IgnoreProjector"="True" "PreviewType"="Plane"}
  Pass { Tags {"LightMode"="ForwardBase"} Blend SrcAlpha OneMinusSrcAlpha ZWrite Off Cull Off
   CGPROGRAM
   #pragma vertex vert
   #pragma fragment frag
   #pragma target 3.0
   #pragma multi_compile_fog
   #include "ForgeLighting.cginc"
   #include "ForgeBillboard.cginc"
   float4 _Color;float _Intensity,_Soft;
   struct appdata {float4 vertex:POSITION;float4 uv0:TEXCOORD0;float4 uv1:TEXCOORD1;float4 uv2:TEXCOORD2;float4 uv3:TEXCOORD3;float4 color:COLOR;};
   struct v2f {float4 pos:SV_POSITION;float3 world:TEXCOORD0;float4 local:TEXCOORD1;float4 emission:TEXCOORD2;float4 shape:TEXCOORD3;float3 albedo:TEXCOORD4;UNITY_FOG_COORDS(5)};
   v2f vert(appdata v){
    v2f o;ForgeBB b=ForgeBillboard(v.vertex.xyz,v.uv0.xy,v.uv0.z,v.uv1.xyz,v.uv1.w,v.uv3.y,v.uv3.w,v.uv3.z*6.2832);
    o.pos=b.pos;o.world=b.world;o.local=float4(b.local,b.tail,v.uv0.w);o.emission=v.uv2;o.shape=v.uv3;o.albedo=GammaToLinearSpace(v.color.rgb);
    UNITY_TRANSFER_FOG(o,o.pos);return o;
   }
   float4 frag(v2f i):SV_Target{
    float head;float mask;float2 l=i.local.xy;
    if(i.shape.x>1.5){float d=length(l);mask=smoothstep(.7,.82,d)*(1-smoothstep(.9,1,d));head=1;}
    else if(i.shape.x>.5){float a=i.shape.z*6.2832;float2 q=float2(l.x*cos(a)-l.y*sin(a),l.x*sin(a)+l.y*cos(a));float d=max(abs(q.x)*.85+abs(q.y)*.45,abs(q.y)*1.08);mask=1-smoothstep(.86,1,d);head=1;if(i.local.z>0)mask=max(mask,ForgeCapsule(l,i.local.z,_Soft,head));}
    else mask=ForgeCapsule(l,i.local.z,_Soft,head);
    float alpha=mask*i.emission.a;clip(alpha-.004);
    float3 view=ForgeSafeNormal(_WorldSpaceCameraPos-i.world);float facing=i.local.w;
    float3 n=ForgeSafeNormal(view*facing+float3(0,1,0)*(1-facing)+float3(.001,0,0));
    float3 c=ForgeLit(i.albedo*_Color.rgb,.45,.45,i.world,n,view)+i.emission.rgb*_Intensity*lerp(.3,1,head);
    float4 col=float4(c,alpha);UNITY_APPLY_FOG(i.fogCoord,col);return col;
   }
   ENDCG
  }
 } FallBack Off
}
