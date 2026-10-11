Shader "Forge/Surface" {
 Properties { _MainTex("Generated material",2D)="white"{} _Color("Tint",Color)=(1,1,1,1) _Metallic("Metalness",Range(0,1))=0 _Glossiness("Smoothness",Range(0,1))=.3 _Scale("World tiling",Float)=.5 _EmissionColor("Emission",Color)=(0,0,0,0) }
 SubShader { Tags {"RenderType"="Opaque"} LOD 250
 CGPROGRAM
 #pragma surface surf Standard fullforwardshadows
 #pragma target 3.0
 sampler2D _MainTex;fixed4 _Color,_EmissionColor;half _Metallic,_Glossiness,_Scale;
 struct Input {float3 worldPos;float3 worldNormal;};
 void surf(Input i,inout SurfaceOutputStandard o){
  float3 w=pow(abs(i.worldNormal),4);w/=max(.0001,w.x+w.y+w.z);float3 p=i.worldPos*_Scale;
  float3 tex=tex2D(_MainTex,p.zy).rgb*w.x+tex2D(_MainTex,p.xz).rgb*w.y+tex2D(_MainTex,p.xy).rgb*w.z;
  o.Albedo=tex*_Color.rgb;o.Metallic=_Metallic;o.Smoothness=_Glossiness*(.78+.22*tex.r);o.Emission=_EmissionColor.rgb;
 }
 ENDCG
 } FallBack "Standard"
}
