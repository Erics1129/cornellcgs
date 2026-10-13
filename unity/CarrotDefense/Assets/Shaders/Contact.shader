Shader "Carrot/Contact" {
 Properties {_Color("Shadow tint",Color)=(.14,.19,.22,.3)}
 SubShader {Tags {"Queue"="Transparent-5" "RenderType"="Transparent" "IgnoreProjector"="True" "RenderPipeline"="UniversalPipeline"} Blend SrcAlpha OneMinusSrcAlpha ZWrite Off Cull Off Offset -1,-1
  Pass { Name "Forward" Tags {"LightMode"="UniversalForward"}
   HLSLPROGRAM
   #pragma vertex vert
   #pragma fragment frag
   #include "CarrotCommon.hlsl"
   CBUFFER_START(UnityPerMaterial) float4 _Color; CBUFFER_END
   struct a{float4 vertex:POSITION;float2 uv:TEXCOORD0;};struct v{float4 pos:SV_POSITION;float2 uv:TEXCOORD0;};
   v vert(a i){v o;o.pos=TransformObjectToHClip(i.vertex.xyz);o.uv=i.uv;return o;}
   float4 frag(v i):SV_Target{float d=length((i.uv-.5)*2);float soft=pow(saturate(1-d*d),3);return float4(_Color.rgb,_Color.a*soft);}
   ENDHLSL
  }
 }
}
