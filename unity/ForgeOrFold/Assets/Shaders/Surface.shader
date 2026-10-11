Shader "Forge/Surface" {
 Properties { _MainTex("Generated surface scan",2D)="white"{} _Color("Tint",Color)=(1,1,1,1) _Metallic("Metalness",Range(0,1))=0 _Glossiness("Smoothness",Range(0,1))=.3 _Scale("World tiling",Float)=.5 _BumpStrength("Surface relief",Range(0,.05))=.012 _EmissionColor("Emission",Color)=(0,0,0,0) }
 SubShader { Tags {"RenderType"="Opaque"} LOD 300
 CGPROGRAM
 #pragma surface surf Standard fullforwardshadows vertex:vert
 #pragma target 3.0
 sampler2D _MainTex;fixed4 _Color,_EmissionColor;half _Metallic,_Glossiness,_Scale,_BumpStrength;
 struct Input {float3 worldPos;float3 worldNormal;INTERNAL_DATA};
 void vert(inout appdata_full v){float3 axis=abs(v.normal.y)>.9?float3(1,0,0):float3(0,1,0);v.tangent=float4(normalize(cross(axis,v.normal)),1);}
 void surf(Input i,inout SurfaceOutputStandard o){
  float3 n=normalize(WorldNormalVector(i,float3(0,0,1)));float3 w=pow(abs(n),4);w/=max(.0001,w.x+w.y+w.z);float3 p=i.worldPos*_Scale;
  float3 tex=tex2D(_MainTex,p.zy).rgb*w.x+tex2D(_MainTex,p.xz).rgb*w.y+tex2D(_MainTex,p.xy).rgb*w.z;
  float height=dot(tex,float3(.3,.59,.11));float3 dx=ddx(i.worldPos),dy=ddy(i.worldPos);float3 r1=cross(dy,n),r2=cross(n,dx);float det=dot(dx,r1);
  float3 relief=normalize(abs(det)*n-sign(det)*_BumpStrength*(ddx(height)*r1+ddy(height)*r2)+n*1e-9);
  o.Normal=float3(dot(relief,WorldNormalVector(i,float3(1,0,0))),dot(relief,WorldNormalVector(i,float3(0,1,0))),dot(relief,WorldNormalVector(i,float3(0,0,1))));
  o.Albedo=tex*_Color.rgb;o.Metallic=_Metallic;o.Smoothness=_Glossiness*(.62+.38*height);o.Occlusion=lerp(.7,1,saturate(height*2));o.Emission=_EmissionColor.rgb;
 }
 ENDCG
 } FallBack "Standard"
}
