Shader "Forge/Finish" { Properties {_MainTex("Source",2D)="white"{} _Bloom("Bloom",2D)="black"{}} SubShader {Cull Off ZWrite Off ZTest Always
 CGINCLUDE
 #include "UnityCG.cginc"
 sampler2D _MainTex,_Bloom;float4 _MainTex_TexelSize;
 half4 threshold(v2f_img i):SV_Target{half3 c=tex2D(_MainTex,i.uv).rgb;half l=max(c.r,max(c.g,c.b));return half4(c*saturate((l-.75)/max(l,.001)),1);}
 half4 blur(v2f_img i):SV_Target{float2 d=_MainTex_TexelSize.xy*1.6;return (tex2D(_MainTex,i.uv+d)+tex2D(_MainTex,i.uv-d)+tex2D(_MainTex,i.uv+float2(d.x,-d.y))+tex2D(_MainTex,i.uv+float2(-d.x,d.y)))*.25;}
 half4 finish(v2f_img i):SV_Target{half3 c=tex2D(_MainTex,i.uv).rgb+tex2D(_Bloom,i.uv).rgb*.3;c*=1.13;c=(c*(2.51*c+.03))/(c*(2.43*c+.59)+.14);float2 edge=i.uv*(1-i.uv);c*=.79+.21*pow(saturate(edge.x*edge.y*16),.3);return half4(c,1);}
 ENDCG
 Pass {CGPROGRAM
 #pragma vertex vert_img
 #pragma fragment threshold
 ENDCG}
 Pass {CGPROGRAM
 #pragma vertex vert_img
 #pragma fragment blur
 ENDCG}
 Pass {CGPROGRAM
 #pragma vertex vert_img
 #pragma fragment finish
 ENDCG}
 } }
