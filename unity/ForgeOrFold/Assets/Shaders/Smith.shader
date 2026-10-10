Shader "Forge/Smith" { Properties { _MainTex("Cloth detail",2D)="white"{} _BumpMap("Normal",2D)="bump"{} }
SubShader { Tags {"RenderType"="Opaque"} LOD 220
CGPROGRAM
#pragma surface surf Standard fullforwardshadows
#pragma target 3.0
sampler2D _MainTex,_BumpMap;struct Input{float2 uv_MainTex;float2 uv_BumpMap;float4 color:COLOR;};
void surf(Input i,inout SurfaceOutputStandard o){float detail=dot(tex2D(_MainTex,i.uv_MainTex).rgb,float3(.3,.59,.11));o.Albedo=i.color.rgb*(.75+detail*.65);o.Normal=UnpackNormal(tex2D(_BumpMap,i.uv_BumpMap));o.Metallic=0;o.Smoothness=lerp(.17,.32,i.color.a);}
ENDCG
} FallBack "Standard" }
