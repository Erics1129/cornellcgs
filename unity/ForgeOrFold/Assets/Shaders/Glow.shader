Shader "Forge/Glow" { Properties { _Color("Glow",Color)=(1,.7,.3,.5) } SubShader { Tags {"Queue"="Transparent"} Blend SrcAlpha One ZWrite Off Cull Off Pass { CGPROGRAM
#pragma vertex vert
#pragma fragment frag
#include "UnityCG.cginc"
fixed4 _Color;struct v2f{float4 vertex:SV_POSITION;};v2f vert(float4 vertex:POSITION){v2f o;o.vertex=UnityObjectToClipPos(vertex);return o;}fixed4 frag(v2f i):SV_Target{return _Color;}
ENDCG } } }
