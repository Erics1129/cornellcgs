Shader "Carrot/Water" {
 // Sheltered ponds (marsh). Vertex colour r is the normalized distance to the bank (0 at the bank, 1 in the middle): it drives the
 // shallow-to-deep gradient and the shore band where foam may appear. _WaterTex is the view's self-made 256 px tile (rg = ripple
 // normal, b = foam cells), scrolled in two directions. Reflection uses the biome's own sky colours, never the daytime environment
 // cubemap (which turned night water grey-white). Scene depth refines the gradient when the pipeline has a depth copy; without one
 // the shore mask alone sets the depth, never less than 0.3.
 Properties {_Color("Deep water",Color)=(.02,.07,.07,1) _Shallow("Shallow water",Color)=(.11,.26,.24,1) _Foam("Foam",Color)=(.78,.86,.82,1) _Reflection("Reflection",Float)=.55
  _WaterTex("Ripple and foam tile",2D)="bump"{} _SkyZenith("Sky zenith",Color)=(.05,.1,.16,1) _SkyHorizon("Sky horizon",Color)=(.12,.2,.26,1) _ShoreWidth("Shore band",Float)=.36}
 SubShader {Tags {"Queue"="Transparent-50" "RenderType"="Transparent" "RenderPipeline"="UniversalPipeline"} ZWrite On Blend SrcAlpha OneMinusSrcAlpha
  Pass { Name "Forward" Tags {"LightMode"="UniversalForward"}
   HLSLPROGRAM
   #pragma target 3.0
   #pragma vertex vert
   #pragma fragment frag
   #pragma multi_compile _ FOG_LINEAR
   #pragma multi_compile _ _MAIN_LIGHT_SHADOWS _MAIN_LIGHT_SHADOWS_CASCADE
   #include "CarrotCommon.hlsl"
   #include "Packages/com.unity.render-pipelines.universal/ShaderLibrary/Lighting.hlsl"
   #include "Packages/com.unity.render-pipelines.universal/ShaderLibrary/DeclareDepthTexture.hlsl"
   #include "Packages/com.unity.render-pipelines.universal/ShaderLibrary/DeclareOpaqueTexture.hlsl"
   TEXTURE2D(_WaterTex);SAMPLER(sampler_WaterTex);
   CBUFFER_START(UnityPerMaterial) float4 _Color,_Shallow,_Foam,_SkyZenith,_SkyHorizon,_WaterTex_ST;float _Reflection,_ShoreWidth; CBUFFER_END
   struct a{float4 vertex:POSITION;float4 color:COLOR;};struct v{float4 pos:SV_POSITION;float3 world:TEXCOORD0;float fog:TEXCOORD1;float4 ndc:TEXCOORD2;float4 color:COLOR;};
   v vert(a x){v o;float3 w=TransformObjectToWorld(x.vertex.xyz);w.y+=sin(w.x*1.7+w.z*.63+_CarrotTime*.55)*.006*x.color.r;o.world=w;o.pos=TransformWorldToHClip(w);o.ndc=GetVertexPositionInputs(x.vertex.xyz).positionNDC;o.color=x.color;o.fog=ComputeFogFactor(o.pos.z);return o;}
   float4 frag(v i):SV_Target{
    float2 p=i.world.xz;
    float4 t1=SAMPLE_TEXTURE2D(_WaterTex,sampler_WaterTex,p*.42+float2(_CarrotTime*.021,-_CarrotTime*.014));
    float4 t2=SAMPLE_TEXTURE2D(_WaterTex,sampler_WaterTex,p*.71+float2(-_CarrotTime*.017,_CarrotTime*.026));
    float2 ripple=(t1.rg+t2.rg-1)*.42;float3 n=normalize(float3(ripple.x,1,ripple.y));
    float3 view=SafeUnit(GetWorldSpaceViewDir(i.world));float fres=pow(1-saturate(dot(n,view)),5);
    float inner=saturate(i.color.r);
    // Depth: the shore mask everywhere (never below 0.3), refined by the scene depth copy where it exists.
    float depthDiff=max(.3,.3+inner*.9);float2 suv=i.ndc.xy/i.ndc.w;
    if(_CarrotSoftParticles>.5){float sceneZ=LinearEyeDepth(SampleSceneDepth(suv),_ZBufferParams);float measured=sceneZ-i.ndc.w;if(measured>.02&&measured<20)depthDiff=max(.3,lerp(depthDiff,measured*2.2,.5));}
    float3 body=lerp(_Shallow.rgb,_Color.rgb,saturate((depthDiff-.3)*1.1));
    if(_CarrotSoftParticles>.5){float3 behind=SampleSceneColor(suv+n.xz*.02*inner);body=lerp(behind*.55+body*.45,body,saturate(inner*1.4));}
    // Foam: only inside the shore band (vertex distance to the bank), broken up by the tile's foam cells.
    float shore=saturate(1-inner/_ShoreWidth);float cells=saturate((t1.b*.6+t2.b*.4-.45)*3.2);float foam=shore*shore*cells;
    // Sky reflection in the biome's own colours (night marsh stays night).
    float3 reflectDir=reflect(-view,n);float3 sky=lerp(_SkyHorizon.rgb,_SkyZenith.rgb,saturate(reflectDir.y*1.4));
    Light light=GetMainLight(TransformWorldToShadowCoord(i.world));
    float3 halfVector=normalize(light.direction+view);float spec=pow(saturate(dot(n,halfVector)),220)*.75;
    float3 rgb=body+sky*(.06+fres*_Reflection)+light.color*spec*light.shadowAttenuation+_Foam.rgb*foam*.55*(.35+.65*light.shadowAttenuation);
    return float4(MixFog(rgb,i.fog),1);
   }
   ENDHLSL
  }
 }
}
