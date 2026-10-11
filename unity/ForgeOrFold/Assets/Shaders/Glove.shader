Shader "Forge/Glove" {
 Properties {_MainTex("Leather grain",2D)="white"{} _Color("Leather",Color)=(.38,.25,.16,1)}
 SubShader {Tags {"RenderType"="Opaque"} LOD 220
 CGPROGRAM
 #pragma surface surf Standard noshadow
 #pragma target 3.0
 sampler2D _MainTex;fixed4 _Color;
 struct Input {float3 worldPos;float3 worldNormal;};
 void surf(Input i,inout SurfaceOutputStandard o){
  float3 w=pow(abs(i.worldNormal),4);w/=max(.001,w.x+w.y+w.z);float3 p=i.worldPos*4;
  float3 grain=tex2D(_MainTex,p.zy).rgb*w.x+tex2D(_MainTex,p.xz).rgb*w.y+tex2D(_MainTex,p.xy).rgb*w.z;
  o.Albedo=grain*_Color.rgb;o.Metallic=0;o.Smoothness=.22;o.Occlusion=.92;
 }
 ENDCG
 } FallBack "Diffuse"
}
