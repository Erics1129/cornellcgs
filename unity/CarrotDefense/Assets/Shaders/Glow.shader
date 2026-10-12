Shader "Carrot/Glow" {
 Properties {_Color("Color",Color)=(1,1,1,1) _Soft("Soft particle",Float)=0 _MainTex("Atlas",2D)="white"{} _UseAtlas("Use atlas",Float)=0}
 SubShader { Tags {"Queue"="Transparent" "RenderType"="Transparent" "IgnoreProjector"="True"} Blend SrcAlpha One ZWrite Off Cull Off
  Pass {CGPROGRAM
   #pragma vertex vert
   #pragma fragment frag
   #include "UnityCG.cginc"
   float4 _Color;float _Soft,_UseAtlas;sampler2D _MainTex;
   struct a{float4 vertex:POSITION;float4 color:COLOR;float2 uv:TEXCOORD0;};struct v{float4 pos:SV_POSITION;float4 color:COLOR;float2 uv:TEXCOORD0;};
   v vert(a x){v o;o.pos=UnityObjectToClipPos(x.vertex);o.color=x.color*_Color;o.uv=x.uv;return o;}
   float4 frag(v i):SV_Target{float alpha=lerp(1,pow(saturate(1-length(i.uv-.5)*2),2),_Soft);float4 t=lerp(float4(1,1,1,1),tex2D(_MainTex,i.uv),_UseAtlas);return float4(i.color.rgb*t.rgb,i.color.a*alpha*t.a);}
   ENDCG}
 }
}
