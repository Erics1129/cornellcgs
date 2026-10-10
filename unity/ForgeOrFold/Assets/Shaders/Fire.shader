Shader "Forge/Fire" { Properties { _MainTex("Fire atlas",2D)="black"{} _Frame("Frame",Float)=0 } SubShader { Tags {"Queue"="Transparent" "RenderType"="Transparent"} Blend One One ZWrite Off Cull Off Pass { CGPROGRAM
#pragma vertex vert
#pragma fragment frag
#include "UnityCG.cginc"
sampler2D _MainTex;float _Frame;
struct appdata{float4 vertex:POSITION;float2 uv:TEXCOORD0;};struct v2f{float4 vertex:SV_POSITION;float2 uv:TEXCOORD0;};
v2f vert(appdata v){v2f o;o.vertex=UnityObjectToClipPos(v.vertex);o.uv=v.uv*.25+float2(fmod(_Frame,4)*.25,(3-floor(_Frame/4))*.25);return o;}
fixed4 frag(v2f i):SV_Target{fixed4 c=tex2D(_MainTex,i.uv);return fixed4(c.rgb*1.65,1);}
ENDCG } } }
