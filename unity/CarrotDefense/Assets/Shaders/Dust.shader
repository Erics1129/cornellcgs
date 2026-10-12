Shader "Carrot/Dust" {
 Properties {_Color("Tint",Color)=(1,1,1,1)}
 SubShader {Tags {"Queue"="Transparent" "RenderType"="Transparent" "IgnoreProjector"="True"} Blend SrcAlpha OneMinusSrcAlpha ZWrite Off Cull Off
  Pass {CGPROGRAM
   #pragma vertex vert
   #pragma fragment frag
   #pragma multi_compile_fog
   #include "UnityCG.cginc"
   #include "Lighting.cginc"
   float4 _Color;
   struct a{float4 vertex:POSITION;float4 color:COLOR;float2 uv:TEXCOORD0;};
   struct v{float4 pos:SV_POSITION;float4 color:COLOR;float2 uv:TEXCOORD0;UNITY_FOG_COORDS(1)};
   v vert(a x){v o;o.pos=UnityObjectToClipPos(x.vertex);o.color=x.color*_Color;o.uv=x.uv;UNITY_TRANSFER_FOG(o,o.pos);return o;}
   float4 frag(v i):SV_Target{float2 p=(i.uv-.5)*2;float radial=saturate(1-dot(p,p));float3 viewNormal=normalize(float3(p,sqrt(radial)));float3 light=normalize(mul((float3x3)UNITY_MATRIX_V,_WorldSpaceLightPos0.xyz));float diffuse=.36+.64*saturate(dot(viewNormal,light));float alpha=pow(radial,2.2)*i.color.a;float4 c=float4(i.color.rgb*diffuse,alpha);UNITY_APPLY_FOG(i.fogCoord,c);return c;}
   ENDCG}
 }
}
