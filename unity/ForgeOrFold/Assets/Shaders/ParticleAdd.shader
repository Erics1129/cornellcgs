// Owner: hot-metal-vfx. Phase-0 stub with FROZEN property names (_MainTex, _Color, _Intensity, _Soft) so
// room-light-post can use it for embers before hot-metal-vfx refines it. Additive, HDR, vertex colour
// (ParticleSystem startColor) times _Color times _Intensity, round soft sprite when _MainTex is white.
Shader "Forge/ParticleAdd" {
 Properties { _MainTex("Sprite",2D)="white"{} _Color("Tint",Color)=(1,.6,.2,1) _Intensity("Intensity",Float)=1 _Soft("Edge softness",Range(.05,1))=.5 }
 SubShader { Tags {"Queue"="Transparent" "RenderType"="Transparent" "IgnoreProjector"="True" "PreviewType"="Plane"}
  Pass { Blend One One ZWrite Off Cull Off
   CGPROGRAM
   #pragma vertex vert
   #pragma fragment frag
   #pragma multi_compile_fog
   #include "UnityCG.cginc"
   sampler2D _MainTex;float4 _MainTex_ST;float4 _Color;float _Intensity,_Soft;
   struct appdata {float4 vertex:POSITION;float4 color:COLOR;float2 uv:TEXCOORD0;};
   struct v2f {float4 pos:SV_POSITION;float4 color:COLOR;float2 uv:TEXCOORD0;UNITY_FOG_COORDS(1)};
   v2f vert(appdata v){v2f o;o.pos=UnityObjectToClipPos(v.vertex);o.color=v.color;o.uv=TRANSFORM_TEX(v.uv,_MainTex);UNITY_TRANSFER_FOG(o,o.pos);return o;}
   float4 frag(v2f i):SV_Target{float2 d=i.uv*2-1;float disc=pow(saturate(1-dot(d,d)),1/_Soft);float4 t=tex2D(_MainTex,i.uv);float3 c=i.color.rgb*_Color.rgb*_Intensity*t.rgb*(disc*t.a*i.color.a);float4 col=float4(c,1);UNITY_APPLY_FOG_COLOR(i.fogCoord,col,float4(0,0,0,0));return col;}
   ENDCG
  }
 } FallBack Off
}
