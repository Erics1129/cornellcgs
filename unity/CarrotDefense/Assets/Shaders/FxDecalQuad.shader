Shader "Carrot/FxDecalQuad" {
 Properties {_Color("Tint",Color)=(1,1,1,1) _MainTex("Sheet",2D)="white"{} _Fade("Fade",Range(0,1))=1 _Erode("Erode",Range(0,1))=0 _Emissive("Emissive",Float)=0}
 SubShader {Tags {"Queue"="Transparent-4" "RenderType"="Transparent" "IgnoreProjector"="True" "RenderPipeline"="UniversalPipeline"} Blend SrcAlpha OneMinusSrcAlpha ZWrite Off Cull Off Offset -1,-1
  Pass { Name "Forward" Tags {"LightMode"="UniversalForward"}
   HLSLPROGRAM
   #pragma vertex vert
   #pragma fragment frag
   #pragma multi_compile _ FOG_LINEAR
   #pragma multi_compile _ _MAIN_LIGHT_SHADOWS _MAIN_LIGHT_SHADOWS_CASCADE
   #include "CarrotCommon.hlsl"
   #include "Packages/com.unity.render-pipelines.universal/ShaderLibrary/Lighting.hlsl"
   TEXTURE2D(_MainTex);SAMPLER(sampler_MainTex);
   CBUFFER_START(UnityPerMaterial) float4 _Color,_MainTex_ST;float _Fade,_Erode,_Emissive; CBUFFER_END
   struct a{float4 vertex:POSITION;float4 color:COLOR;float2 uv:TEXCOORD0;};struct v{float4 pos:SV_POSITION;float4 color:COLOR;float2 uv:TEXCOORD0;float fog:TEXCOORD1;float3 world:TEXCOORD2;};
   v vert(a x){v o;o.world=TransformObjectToWorld(x.vertex.xyz);o.pos=TransformWorldToHClip(o.world);o.uv=TRANSFORM_TEX(x.uv,_MainTex);o.color=x.color*_Color;o.fog=ComputeFogFactor(o.pos.z);return o;}
   float4 frag(v i):SV_Target{
    float4 t=SAMPLE_TEXTURE2D(_MainTex,sampler_MainTex,i.uv);
    float alpha=smoothstep(_Erode,_Erode+.18,t.a)*_Fade*i.color.a;
    Light light=GetMainLight(TransformWorldToShadowCoord(i.world));
    float3 lit=i.color.rgb*t.rgb*lerp(light.color*(.45+.55*light.shadowAttenuation)+SampleSHPixel(half3(0,0,0),half3(0,1,0)),float3(1,1,1),_Emissive);
    return float4(MixFog(lit,i.fog),alpha);
   }
   ENDHLSL
  }
 }
}
