// Owner: strike-feel. Motion smear for the hammer head: translucent copies of the head lit like the steel
// (ForgeLit), drawn on the downstroke frames behind the real head. _Alpha per ghost via a property block.
Shader "Forge/Smear" {
 Properties { _Color("Steel",Color)=(.42,.44,.46,1) _Metallic("Metalness",Range(0,1))=.85 _Glossiness("Smoothness",Range(0,1))=.45 _Alpha("Ghost alpha",Range(0,1))=.3 }
 SubShader { Tags {"Queue"="Transparent" "RenderType"="Transparent" "IgnoreProjector"="True"} LOD 200
  Pass { Tags {"LightMode"="ForwardBase"} Blend SrcAlpha OneMinusSrcAlpha ZWrite Off Cull Back
   CGPROGRAM
   #pragma vertex vert
   #pragma fragment frag
   #pragma target 3.0
   #pragma multi_compile_fog
   #include "ForgeLighting.cginc"
   float4 _Color;float _Metallic,_Glossiness,_Alpha;
   struct appdata {float4 vertex:POSITION;float3 normal:NORMAL;};
   struct v2f {float4 pos:SV_POSITION;float3 worldPos:TEXCOORD0;float3 normal:TEXCOORD1;UNITY_FOG_COORDS(2)};
   v2f vert(appdata v){v2f o;o.pos=UnityObjectToClipPos(v.vertex);o.worldPos=mul(unity_ObjectToWorld,v.vertex).xyz;o.normal=UnityObjectToWorldNormal(v.normal);UNITY_TRANSFER_FOG(o,o.pos);return o;}
   float4 frag(v2f i):SV_Target {
    float3 n=ForgeSafeNormal(i.normal),view=ForgeSafeNormal(_WorldSpaceCameraPos-i.worldPos);
    float3 lit=ForgeLit(_Color.rgb,_Metallic,_Glossiness,i.worldPos,n,view);
    // Edges facing away fade first, so a ghost reads as a blur of the silhouette rather than a second head.
    float facing=saturate(dot(n,view));float4 color=float4(lit,_Alpha*(.45+.55*facing));
    UNITY_APPLY_FOG(i.fogCoord,color);return color;
   }
   ENDCG
  }
 } FallBack Off
}
