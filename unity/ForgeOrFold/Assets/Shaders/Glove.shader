Shader "Forge/Glove" {
 Properties {_MainTex("Leather grain",2D)="white"{} _Color("Leather",Color)=(.38,.25,.16,1)}
 SubShader {Tags {"RenderType"="Opaque"} LOD 220
  // A single lighting pass keeps animated close-up hands stable on WebGL.
  Pass {Tags {"LightMode"="ForwardBase"}
   CGPROGRAM
   #pragma vertex vert
   #pragma fragment frag
   #pragma target 3.0
   #pragma multi_compile_fog
   #include "UnityCG.cginc"
   sampler2D _MainTex;float4 _Color;
   float4 _ForgeKeyPosition,_ForgeKeyColor,_ForgeRimPosition,_ForgeRimColor,_ForgeFirePosition,_ForgeFireColor;
   float _ForgeImpact;
   struct appdata {float4 vertex:POSITION;float3 normal:NORMAL;};
   struct v2f {float4 pos:SV_POSITION;float3 worldPos:TEXCOORD0;float3 normal:TEXCOORD1;UNITY_FOG_COORDS(2)};
   v2f vert(appdata v){v2f o;o.pos=UnityObjectToClipPos(v.vertex);o.worldPos=mul(unity_ObjectToWorld,v.vertex).xyz;o.normal=UnityObjectToWorldNormal(v.normal);UNITY_TRANSFER_FOG(o,o.pos);return o;}
   float3 lamp(float3 at,float3 color,float3 p,float3 n,float3 view){float3 delta=at-p;float d2=max(.01,dot(delta,delta));float3 l=delta*rsqrt(d2);float diffuse=saturate(dot(n,l)*.75+.25);float spec=pow(saturate(dot(n,normalize(l+view))),28)*.04;return color*(diffuse+spec)/(1+d2*.55);}
   float4 frag(v2f i):SV_Target {
    float3 n=normalize(i.normal),view=normalize(_WorldSpaceCameraPos-i.worldPos);
    float3 w=pow(abs(n),4);w/=max(.001,w.x+w.y+w.z);float3 p=i.worldPos*4;
    float3 grain=tex2D(_MainTex,p.zy).rgb*w.x+tex2D(_MainTex,p.xz).rgb*w.y+tex2D(_MainTex,p.xy).rgb*w.z;
    float3 light=max(float3(.16,.135,.11),ShadeSH9(float4(n,1)));
    light+=lamp(_ForgeKeyPosition.xyz,_ForgeKeyColor.rgb,i.worldPos,n,view);
    light+=lamp(_ForgeRimPosition.xyz,_ForgeRimColor.rgb,i.worldPos,n,view);
    light+=lamp(_ForgeFirePosition.xyz,_ForgeFireColor.rgb,i.worldPos,n,view);
    light+=lamp(float3(.12,1.12,-.4),float3(1,.58,.25)*_ForgeImpact*.18,i.worldPos,n,view);
    float4 color=float4(grain*_Color.rgb*light*3.2,1);UNITY_APPLY_FOG(i.fogCoord,color);return color;
   }
   ENDCG
  }
 } FallBack Off
}
