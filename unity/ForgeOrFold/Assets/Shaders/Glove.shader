Shader "Forge/Glove" {
 // Owner: room-light-post. Leather gauntlets and sleeves, lit by the shared workshop model (ForgeLighting.cginc):
 // the flickering hearth, the hanging lamp's cone, the contact flash, the hot-blade glow and the occluder AO.
 // A soft wrap keeps the close-up forearms readable on their shadow side, as the old private lamp() did.
 // Vertex alpha is the upper-arm share of the skin (ForgeSmith.CreateSmith): those fragments closer to the camera than
 // _NearCull (0 = off; ForgeSmith sets it during the hearth reach) are not drawn, so the sleeve right beside the eye never
 // fills a corner of the view while the arm reaches into the hearth.
 Properties {_MainTex("Leather grain",2D)="white"{} _Color("Leather",Color)=(.38,.25,.16,1) _Gain("Albedo gain",Float)=2.6 _Wrap("Wrap fill",Range(0,1))=.22 _NearCull("Upper-arm near cull (m)",Float)=0}
 SubShader {Tags {"RenderType"="Opaque"} LOD 220
  // A single lighting pass keeps animated close-up hands stable on WebGL.
  Pass {Tags {"LightMode"="ForwardBase"}
   CGPROGRAM
   #pragma vertex vert
   #pragma fragment frag
   #pragma target 3.0
   #pragma multi_compile_fog
   #include "ForgeLighting.cginc"
   sampler2D _MainTex;float4 _Color;float _Gain,_Wrap,_NearCull;
   struct appdata {float4 vertex:POSITION;float3 normal:NORMAL;float4 color:COLOR;};
   struct v2f {float4 pos:SV_POSITION;float3 worldPos:TEXCOORD0;float3 normal:TEXCOORD1;float upper:TEXCOORD3;UNITY_FOG_COORDS(2)};
   v2f vert(appdata v){v2f o;o.pos=UnityObjectToClipPos(v.vertex);o.worldPos=mul(unity_ObjectToWorld,v.vertex).xyz;o.normal=UnityObjectToWorldNormal(v.normal);o.upper=v.color.a;UNITY_TRANSFER_FOG(o,o.pos);return o;}
   float4 frag(v2f i):SV_Target {
    float3 toEye=_WorldSpaceCameraPos-i.worldPos;clip(i.upper<.5||dot(toEye,toEye)>_NearCull*_NearCull?1:-1);
    float3 n=ForgeSafeNormal(i.normal),view=ForgeSafeNormal(_WorldSpaceCameraPos-i.worldPos);
    float3 w=pow(abs(n),4);w/=max(.001,w.x+w.y+w.z);float3 p=i.worldPos*4;
    float3 grain=tex2D(_MainTex,p.zy).rgb*w.x+tex2D(_MainTex,p.xz).rgb*w.y+tex2D(_MainTex,p.xy).rgb*w.z;
    float3 base=saturate(grain*_Color.rgb*_Gain);
    float3 lit=ForgeLit(base,0,.34,i.worldPos,n,view);
    // Wrap: a little of the key and fire reaches round the forearm (leather scatters, the room bounces).
    float3 wrap=(_ForgeKeyColor.rgb/(1+.4*dot(_ForgeKeyPosition.xyz-i.worldPos,_ForgeKeyPosition.xyz-i.worldPos))+_ForgeFireColor.rgb/(1+.4*dot(_ForgeFirePosition.xyz-i.worldPos,_ForgeFirePosition.xyz-i.worldPos)))*base/UNITY_PI*_Wrap;
    float4 color=float4(lit+wrap,1);UNITY_APPLY_FOG(i.fogCoord,color);return color;
   }
   ENDCG
  }
 } FallBack Off
}
