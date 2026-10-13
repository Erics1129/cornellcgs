// Owner: hot-metal-vfx. FROZEN property names (_MainTex, _Color, _Intensity, _Soft): additive, HDR, round soft
// sprite. Two paths:
//  _Billboard = 0 (default, the phase-0 stub behaviour): an ordinary mesh, colour = vertex COLOR x _Color x _Intensity.
//  _Billboard = 1 (ForgeVfx.cs spark batch): CPU particle quads expanded in ForgeBillboard.cginc, linear HDR colour in
//   TEXCOORD2.rgb (burning sparks (1,.3,.03) x 12-25, embers, gold glints), streaked along the velocity, min size in px.
Shader "Forge/ParticleAdd" {
 Properties { _MainTex("Sprite",2D)="white"{} _Color("Tint",Color)=(1,.6,.2,1) _Intensity("Intensity",Float)=1 _Soft("Edge softness",Range(.05,1))=.5 _Billboard("CPU billboard batch",Float)=0 }
 SubShader { Tags {"Queue"="Transparent" "RenderType"="Transparent" "IgnoreProjector"="True" "PreviewType"="Plane"}
  Pass { Blend One One ZWrite Off Cull Off
   CGPROGRAM
   #pragma vertex vert
   #pragma fragment frag
   #pragma target 3.0
   #pragma multi_compile_fog
   #include "UnityCG.cginc"
   #include "ForgeBillboard.cginc"
   sampler2D _MainTex;float4 _MainTex_ST;float4 _Color;float _Intensity,_Soft,_Billboard;
   struct appdata {float4 vertex:POSITION;float4 color:COLOR;float4 uv:TEXCOORD0;float4 uv1:TEXCOORD1;float4 uv2:TEXCOORD2;float4 uv3:TEXCOORD3;};
   struct v2f {float4 pos:SV_POSITION;float4 color:COLOR;float2 uv:TEXCOORD0;float3 local:TEXCOORD1;UNITY_FOG_COORDS(2)};
   v2f vert(appdata v){
    v2f o;
    if(_Billboard>.5){ForgeBB b=ForgeBillboard(v.vertex.xyz,v.uv.xy,v.uv.z,v.uv1.xyz,v.uv1.w,v.uv3.y,v.uv3.w,v.uv3.z*6.2832);o.pos=b.pos;o.color=float4(v.uv2.rgb,1);o.uv=v.uv.xy*.5+.5;o.local=float3(b.local,b.tail);}
    else{o.pos=UnityObjectToClipPos(v.vertex);o.color=v.color;o.uv=TRANSFORM_TEX(v.uv.xy,_MainTex);o.local=float3(0,0,-1);}
    UNITY_TRANSFER_FOG(o,o.pos);return o;
   }
   float4 frag(v2f i):SV_Target{
    float4 t=tex2D(_MainTex,i.uv);float shape;
    if(i.local.z>=0){float head;shape=ForgeCapsule(i.local.xy,i.local.z,_Soft,head)*lerp(.2,1,head*head);}
    else{float2 d=i.uv*2-1;shape=pow(saturate(1-dot(d,d)),1/_Soft);}
    float3 c=i.color.rgb*_Color.rgb*_Intensity*t.rgb*(shape*t.a*i.color.a);
    float4 col=float4(c,1);UNITY_APPLY_FOG_COLOR(i.fogCoord,col,float4(0,0,0,0));return col;
   }
   ENDCG
  }
 } FallBack Off
}
