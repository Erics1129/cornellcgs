Shader "Carrot/Water" {
 Properties {_Color("Deep water",Color)=(.02,.07,.07,1) _Shallow("Shallow water",Color)=(.11,.26,.24,1) _Foam("Foam",Color)=(.85,.92,.88,1) _Reflection("Reflection",Float)=.55}
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
   CBUFFER_START(UnityPerMaterial) float4 _Color,_Shallow,_Foam;float _Reflection; CBUFFER_END
   struct a{float4 vertex:POSITION;float4 color:COLOR;};struct v{float4 pos:SV_POSITION;float3 world:TEXCOORD0;float fog:TEXCOORD1;float4 ndc:TEXCOORD2;float4 color:COLOR;};
   float noise(float2 p){float2 i=floor(p),f=frac(p);f=f*f*(3-2*f);float4 q=frac(sin(float4(dot(i,float2(127.1,311.7)),dot(i+float2(1,0),float2(127.1,311.7)),dot(i+float2(0,1),float2(127.1,311.7)),dot(i+1,float2(127.1,311.7))))*43758.5453);return lerp(lerp(q.x,q.y,f.x),lerp(q.z,q.w,f.x),f.y);}
   float ripple(float2 p){return noise(p*2.3+float2(_CarrotTime*.12,-_CarrotTime*.085))*.018+noise(p*7.1+float2(-_CarrotTime*.08,_CarrotTime*.11))*.006;}
   v vert(a x){v o;float3 w=TransformObjectToWorld(x.vertex.xyz);w.y+=sin(w.x*1.7+w.z*.63+_CarrotTime*.55)*.008;o.world=w;o.pos=TransformWorldToHClip(w);o.ndc=GetVertexPositionInputs(x.vertex.xyz).positionNDC;o.color=x.color;o.fog=ComputeFogFactor(o.pos.z);return o;}
   float4 frag(v i):SV_Target{
    float2 p=i.world.xz;float r=ripple(p);float3 n=normalize(float3((r-ripple(p+float2(.06,0)))/.06,1,(r-ripple(p+float2(0,.06)))/.06));
    float3 view=SafeUnit(GetWorldSpaceViewDir(i.world));float fres=pow(1-saturate(dot(n,view)),5);
    float depthDiff=.35;float2 suv=i.ndc.xy/i.ndc.w;
    if(_CarrotSoftParticles>.5){float sceneZ=LinearEyeDepth(SampleSceneDepth(suv),_ZBufferParams);depthDiff=max(0,sceneZ-i.ndc.w);}
    else depthDiff=i.color.r*.5;
    float3 body=lerp(_Shallow.rgb,_Color.rgb,saturate(depthDiff*1.8));
    if(_CarrotSoftParticles>.5){float3 refracted=SampleSceneColor(suv+n.xz*.035*saturate(depthDiff));body=lerp(refracted*body*2.2,body,saturate(depthDiff*1.2));}
    float foam=(1-smoothstep(0,.18,depthDiff))*noise(p*9+_CarrotTime*.3);
    float3 reflectDir=reflect(-view,n);float3 environment=GlossyEnvironmentReflection(reflectDir,i.world,.08,1,suv);
    Light light=GetMainLight(TransformWorldToShadowCoord(i.world));
    float3 halfVector=normalize(light.direction+view);float spec=pow(saturate(dot(n,halfVector)),240)*.9;
    float3 rgb=body+environment*(.04+fres*_Reflection)+light.color*spec*light.shadowAttenuation+_Foam.rgb*foam*.8;
    return float4(MixFog(rgb,i.fog),1);
   }
   ENDHLSL
  }
 }
}
