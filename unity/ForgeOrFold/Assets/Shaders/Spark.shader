Shader "Forge/Spark" {Properties {_Color("Tint",Color)=(1,.6,.2,1)} SubShader {Tags {"Queue"="Transparent" "RenderType"="Transparent"} Blend SrcAlpha One ZWrite Off Cull Off Pass {CGPROGRAM
#pragma vertex vert
#pragma fragment frag
#include "UnityCG.cginc"
fixed4 _Color;struct a{float4 vertex:POSITION;fixed4 color:COLOR;float2 uv:TEXCOORD0;};struct v{float4 vertex:SV_POSITION;fixed4 color:COLOR;float2 uv:TEXCOORD0;};v vert(a i){v o;o.vertex=UnityObjectToClipPos(i.vertex);o.color=i.color*_Color;o.uv=i.uv;return o;}half4 frag(v i):SV_Target{float core=pow(saturate(1-abs(i.uv.y*2-1)),1.3);return half4(i.color.rgb*2,i.color.a*core);}
ENDCG}}}
