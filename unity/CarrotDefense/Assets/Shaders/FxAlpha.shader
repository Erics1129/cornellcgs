Shader "Carrot/FxAlpha" {
 Properties {_Color("Tint",Color)=(1,1,1,1) _MainTex("Sheet",2D)="white"{} _UseAtlas("Use sheet",Float)=0 _Translucency("Translucency",Float)=.35 _SoftFade("Depth fade",Float)=.2 _Puff("Puff shading",Float)=1}
 SubShader {Tags {"Queue"="Transparent" "RenderType"="Transparent" "IgnoreProjector"="True" "RenderPipeline"="UniversalPipeline"} Blend SrcAlpha OneMinusSrcAlpha ZWrite Off Cull Off
  Pass { Name "Forward" Tags {"LightMode"="UniversalForward"}
   HLSLPROGRAM
   #pragma vertex vert
   #pragma fragment frag
   #pragma multi_compile _ FOG_LINEAR
   #pragma multi_compile _ _MAIN_LIGHT_SHADOWS _MAIN_LIGHT_SHADOWS_CASCADE
   #pragma multi_compile_fragment _ _SHADOWS_SOFT _SHADOWS_SOFT_LOW _SHADOWS_SOFT_MEDIUM _SHADOWS_SOFT_HIGH
   #include "CarrotCommon.hlsl"
   #include "Packages/com.unity.render-pipelines.universal/ShaderLibrary/Lighting.hlsl"
   #include "Packages/com.unity.render-pipelines.universal/ShaderLibrary/DeclareDepthTexture.hlsl"
   TEXTURE2D(_MainTex);SAMPLER(sampler_MainTex);
   CBUFFER_START(UnityPerMaterial) float4 _Color,_MainTex_ST;float _UseAtlas,_Translucency,_SoftFade,_Puff; CBUFFER_END
   struct a{float4 vertex:POSITION;float4 color:COLOR;float2 uv:TEXCOORD0;};
   struct v{float4 pos:SV_POSITION;float4 color:COLOR;float4 uv:TEXCOORD0;float fog:TEXCOORD1;float4 ndc:TEXCOORD2;float3 world:TEXCOORD3;};
   v vert(a x){v o;VertexPositionInputs p=GetVertexPositionInputs(x.vertex.xyz);o.pos=p.positionCS;o.ndc=p.positionNDC;o.world=p.positionWS;o.color=x.color*_Color;o.uv=float4(TRANSFORM_TEX(x.uv,_MainTex),x.uv);o.fog=ComputeFogFactor(o.pos.z);return o;}
   float4 frag(v i):SV_Target{
    float2 p=(i.uv.zw-.5)*2;float radial=saturate(1-dot(p,p));
    float4 t=lerp(float4(1,1,1,pow(radial,2.2)),SAMPLE_TEXTURE2D(_MainTex,sampler_MainTex,i.uv.xy),_UseAtlas);
    float3 viewNormal=normalize(float3(p*_Puff,sqrt(max(.05,radial))));
    Light light=GetMainLight(TransformWorldToShadowCoord(i.world));
    float3 lightView=normalize(mul((float3x3)UNITY_MATRIX_V,light.direction));
    float diffuse=.32+.68*saturate(dot(viewNormal,lightView)*.6+.4);
    float3 lit=i.color.rgb*(light.color*diffuse*light.shadowAttenuation+SampleSHPixel(half3(0,0,0),half3(0,1,0))*(.8+_Translucency));
    float alpha=t.a*i.color.a;
    if(_CarrotSoftParticles>.5){float2 suv=i.ndc.xy/i.ndc.w;float sceneZ=LinearEyeDepth(SampleSceneDepth(suv),_ZBufferParams);alpha*=saturate((sceneZ-i.ndc.w)/_SoftFade);}
    return float4(MixFog(lit*t.rgb,i.fog),alpha);
   }
   ENDHLSL
  }
 }
}
