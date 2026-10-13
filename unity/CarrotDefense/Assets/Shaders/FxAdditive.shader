Shader "Carrot/FxAdditive" {
 Properties {_Color("Color",Color)=(1,1,1,1) _Soft("Soft disc",Float)=0 _MainTex("Sheet",2D)="white"{} _UseAtlas("Use sheet",Float)=0 _SoftFade("Depth fade",Float)=.12}
 SubShader { Tags {"Queue"="Transparent" "RenderType"="Transparent" "IgnoreProjector"="True" "RenderPipeline"="UniversalPipeline"} Blend SrcAlpha One ZWrite Off Cull Off
  Pass { Name "Forward" Tags {"LightMode"="UniversalForward"}
   HLSLPROGRAM
   #pragma vertex vert
   #pragma fragment frag
   #pragma multi_compile _ FOG_LINEAR
   #include "CarrotCommon.hlsl"
   #include "Packages/com.unity.render-pipelines.universal/ShaderLibrary/DeclareDepthTexture.hlsl"
   TEXTURE2D(_MainTex);SAMPLER(sampler_MainTex);
   CBUFFER_START(UnityPerMaterial) float4 _Color,_MainTex_ST;float _Soft,_UseAtlas,_SoftFade; CBUFFER_END
   struct a{float4 vertex:POSITION;float4 color:COLOR;float2 uv:TEXCOORD0;};
   struct v{float4 pos:SV_POSITION;float4 color:COLOR;float4 uv:TEXCOORD0;float fog:TEXCOORD1;float4 ndc:TEXCOORD2;};
   v vert(a x){v o;VertexPositionInputs p=GetVertexPositionInputs(x.vertex.xyz);o.pos=p.positionCS;o.ndc=p.positionNDC;o.color=x.color*_Color;o.uv=float4(TRANSFORM_TEX(x.uv,_MainTex),x.uv);o.fog=ComputeFogFactor(o.pos.z);return o;}
   float4 frag(v i):SV_Target{
    float alpha=lerp(1,pow(saturate(1-length(i.uv.zw-.5)*2),2),_Soft);
    float4 t=lerp(float4(1,1,1,1),SAMPLE_TEXTURE2D(_MainTex,sampler_MainTex,i.uv.xy),_UseAtlas);
    if(_CarrotSoftParticles>.5){float2 suv=i.ndc.xy/i.ndc.w;float sceneZ=LinearEyeDepth(SampleSceneDepth(suv),_ZBufferParams);alpha*=saturate((sceneZ-i.ndc.w)/_SoftFade);}
    float3 rgb=MixFogColor(i.color.rgb*t.rgb,float3(0,0,0),i.fog);
    return float4(rgb,i.color.a*alpha*t.a);
   }
   ENDHLSL
  }
 }
}
