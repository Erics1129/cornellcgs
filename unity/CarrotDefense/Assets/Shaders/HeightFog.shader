Shader "Carrot/HeightFog" {
 // Fullscreen pass (URP FullScreenPassRendererFeature, before transparents, High tier only): analytic exponential height fog over the opaque scene.
 SubShader { Tags {"RenderType"="Opaque" "RenderPipeline"="UniversalPipeline"} ZWrite Off Cull Off ZTest Always
  Pass { Name "HeightFog"
   HLSLPROGRAM
   #pragma vertex Vert
   #pragma fragment Frag
   #include "Packages/com.unity.render-pipelines.universal/ShaderLibrary/Core.hlsl"
   #include "Packages/com.unity.render-pipelines.core/Runtime/Utilities/Blit.hlsl"
   #include "Packages/com.unity.render-pipelines.universal/ShaderLibrary/DeclareDepthTexture.hlsl"
   float4 _CarrotHeightFog;   // density, base height, falloff, noise amount
   float4 _CarrotHeightFogColor;
   float _CarrotTime;
   float4 Frag(Varyings i):SV_Target{
    float2 uv=i.texcoord;float4 color=SAMPLE_TEXTURE2D_X(_BlitTexture,sampler_PointClamp,uv);
    float density=_CarrotHeightFog.x;if(density<=0)return color;
    float raw=SampleSceneDepth(uv);
    #if !UNITY_REVERSED_Z
    raw=lerp(UNITY_NEAR_CLIP_VALUE,1,raw);
    #endif
    float3 world=ComputeWorldSpacePosition(uv,raw,UNITY_MATRIX_I_VP);
    float eye=LinearEyeDepth(SampleSceneDepth(uv),_ZBufferParams);
    float3 cam=GetCameraPositionWS();float3 ray=world-cam;float dist=length(ray);
    float base=_CarrotHeightFog.y,falloff=_CarrotHeightFog.z;
    // Integral of exp(-falloff*(y-base)) along the view ray, closed form.
    float dy=world.y-cam.y;float top=exp(-falloff*max(cam.y-base,0));
    float integral=abs(dy)>.01?top*(1-exp(-falloff*dy))/(falloff*dy):top;
    integral=min(integral,8);
    float fog=1-exp(-density*dist*integral);
    if(_CarrotHeightFog.w>0)fog*=1+_CarrotHeightFog.w*sin(_CarrotTime*.63+world.x*.9+world.z*.5)*sin(_CarrotTime*.41+world.z*1.3);
    // The skybox keeps its gradient; only the horizon band takes a haze.
    bool sky=eye>_ProjectionParams.z*.9;if(sky)fog=saturate(1-uv.y*1.6)*.25*density*40;
    return float4(lerp(color.rgb,_CarrotHeightFogColor.rgb,saturate(fog)),color.a);
   }
   ENDHLSL
  }
 }
}
