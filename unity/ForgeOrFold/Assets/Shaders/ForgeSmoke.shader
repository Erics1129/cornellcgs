Shader "Forge/Smoke" {
 Properties { _Color("Smoke",Color)=(.55,.47,.37,.3) }
 SubShader {
  Tags { "Queue"="Transparent" "RenderType"="Transparent" }
  Blend SrcAlpha OneMinusSrcAlpha ZWrite Off Cull Off
  Pass {
   CGPROGRAM
   #pragma vertex vert
   #pragma fragment frag
   #include "UnityCG.cginc"
   struct appdata {float4 vertex:POSITION;float2 uv:TEXCOORD0;};
   struct v2f {float4 pos:SV_POSITION;float2 uv:TEXCOORD0;};
   fixed4 _Color;
   v2f vert(appdata v){v2f o;o.pos=UnityObjectToClipPos(v.vertex);o.uv=v.uv;return o;}
   float hash(float2 p){return frac(sin(dot(p,float2(127.1,311.7)))*43758.5453);}
   float noise(float2 p){float2 i=floor(p),f=frac(p);f=f*f*(3-2*f);return lerp(lerp(hash(i),hash(i+float2(1,0)),f.x),lerp(hash(i+float2(0,1)),hash(i+1),f.x),f.y);}
   fixed4 frag(v2f i):SV_Target {
    float2 uv=i.uv-.5;
    float n=noise(i.uv*5+float2(_Time.y*.14,-_Time.y*.1));
    n+=noise(i.uv*11+float2(0,-_Time.y*.16))*.45;
    float edge=saturate(1-length(uv)*2);
    return fixed4(_Color.rgb,_Color.a*smoothstep(0,.6,edge)*saturate(n-.25));
   }
   ENDCG
  }
 }
}
