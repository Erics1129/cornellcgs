Shader "Forge/Surface" {
 Properties { _MainTex("Generated surface scan",2D)="white"{} _Color("Tint",Color)=(1,1,1,1) _Metallic("Metalness",Range(0,1))=0 _Glossiness("Smoothness",Range(0,1))=.3 _Scale("World tiling",Float)=.5 _BumpStrength("Surface relief",Range(0,.05))=.012 _EmissionColor("Emission",Color)=(0,0,0,0) }
 SubShader { Tags {"RenderType"="Opaque"} LOD 300
  // Explicit full-precision, single-pass lighting avoids close-up WebGL surface-pass artifacts.
  Pass { Tags {"LightMode"="ForwardBase"}
   CGPROGRAM
   #pragma vertex vert
   #pragma fragment frag
   #pragma target 3.0
   #pragma multi_compile_fog
   #include "ForgeLighting.cginc"
   sampler2D _MainTex;float4 _Color,_EmissionColor;float _Metallic,_Glossiness,_Scale;
   struct appdata {float4 vertex:POSITION;float3 normal:NORMAL;};
   struct v2f {float4 pos:SV_POSITION;float3 worldPos:TEXCOORD0;float3 normal:TEXCOORD1;UNITY_FOG_COORDS(2)};
   v2f vert(appdata v){v2f o;o.pos=UnityObjectToClipPos(v.vertex);o.worldPos=mul(unity_ObjectToWorld,v.vertex).xyz;o.normal=UnityObjectToWorldNormal(v.normal);UNITY_TRANSFER_FOG(o,o.pos);return o;}
   float4 frag(v2f i):SV_Target {
    float3 n=ForgeSafeNormal(i.normal),view=ForgeSafeNormal(_WorldSpaceCameraPos-i.worldPos);
    float3 w=pow(abs(n),4);w/=max(.001,w.x+w.y+w.z);float3 p=i.worldPos*_Scale;
    float3 tex=tex2D(_MainTex,p.zy).rgb*w.x+tex2D(_MainTex,p.xz).rgb*w.y+tex2D(_MainTex,p.xy).rgb*w.z;
    float height=dot(tex,float3(.3,.59,.11));
    float4 color=float4(ForgeLit(tex*_Color.rgb,_Metallic,_Glossiness*(.62+.38*height),i.worldPos,n,view)+_EmissionColor.rgb,1);
    UNITY_APPLY_FOG(i.fogCoord,color);return color;
   }
   ENDCG
  }
 } FallBack Off
}
