Shader "Forge/Blade" {
 Properties { _MainTex("Generated steel",2D)="white"{} _Color("Metal",Color)=(.7,.75,.8,1) _Metallic("Metalness",Range(0,1))=.95 _Glossiness("Smoothness",Range(0,1))=.65 _Heat("Heat",Range(0,1))=0 _EmissionColor("Evolution",Color)=(0,0,0,0) _GlowColor("Aura",Color)=(.5,.8,1,1) _Kind("Metal kind",Float)=0 _Stage("Evolution stage",Float)=0 }
 SubShader { Tags {"RenderType"="Opaque"} LOD 250
  Pass { Tags {"LightMode"="ForwardBase"}
   CGPROGRAM
   #pragma vertex vert
   #pragma fragment frag
   #pragma target 3.0
   #pragma multi_compile_fog
   #define FORGE_NO_GLOW_LAMP
   #include "ForgeLighting.cginc"
   sampler2D _MainTex;float4 _Color,_EmissionColor,_GlowColor;float _Metallic,_Glossiness,_Heat,_Kind,_Stage;
   struct appdata {float4 vertex:POSITION;float3 normal:NORMAL;};
   struct v2f {float4 pos:SV_POSITION;float3 worldPos:TEXCOORD0;float3 normal:TEXCOORD1;float3 local:TEXCOORD2;UNITY_FOG_COORDS(3)};
   v2f vert(appdata v){v2f o;o.pos=UnityObjectToClipPos(v.vertex);o.worldPos=mul(unity_ObjectToWorld,v.vertex).xyz;o.local=v.vertex.xyz;o.normal=UnityObjectToWorldNormal(v.normal);UNITY_TRANSFER_FOG(o,o.pos);return o;}
   float4 frag(v2f i):SV_Target {
    float3 n=ForgeSafeNormal(i.normal),view=ForgeSafeNormal(_WorldSpaceCameraPos-i.worldPos);
    float grain=tex2D(_MainTex,i.worldPos.xz*.72).r;float3 base=_Color.rgb*(.48+grain*.75);
    if(_Kind==4){float folds=sin(i.local.x*75+sin(i.local.z*60)*1.8+sin(i.local.x*14)*3);base*=.72+folds*.13;}
    if(_Kind==7){float grazing=1-abs(dot(n,view));float3 film=.68+.32*cos(float3(0,2.1,4.2)+grazing*7+i.local.x*1.1);base=lerp(base,film,.6);}
    float heat=_Heat*smoothstep(-.1,2.3,i.local.x);float3 hot=lerp(float3(.9,.025,0),float3(1,.72,.27),heat);
    float pulse=(.7+.3*sin(_Time.y*2.5+i.local.x*4))*step(4,_Stage)*.2;
    float4 color=float4(ForgeLit(base,_Metallic,_Glossiness*(.64+grain*.3),i.worldPos,n,view)+hot*heat*2.7+_EmissionColor.rgb+_GlowColor.rgb*pulse,1);
    UNITY_APPLY_FOG(i.fogCoord,color);return color;
   }
   ENDCG
  }
 } FallBack Off
}
