Shader "Carrot/Storybook" {
 Properties {
  _Color("Tint",Color)=(1,1,1,1) _VertexColorSRGB("Imported vertex colors are sRGB",Float)=0 _AlbedoSaturation("Albedo saturation",Range(0,1))=1 _AlbedoGain("Albedo gain",Range(0,4))=1 _MainTex("Albedo",2D)="white"{}
  _BumpMap("Normal",2D)="bump"{} _BumpScale("Normal strength",Range(0,2))=1
  _Metallic("Metal",Range(0,1))=0 _Glossiness("Smoothness fallback",Range(0,1))=.35
  _RoughnessMap("Roughness",2D)="white"{} _UseRoughnessMap("Use roughness",Float)=0
  _OcclusionMap("Ambient occlusion",2D)="white"{} _OcclusionStrength("Occlusion strength",Range(0,1))=.7 _UseOcclusionMap("Use occlusion",Float)=0
  _EmissionColor("Emission",Color)=(0,0,0,0) _WorldTexture("World texture",Float)=0 _TextureScale("Texture scale",Float)=1
  _ReflectionStrength("Reflection strength",Range(0,2))=.8 _Cutoff("Alpha cutoff",Range(0,1))=0 _Cull("Cull mode",Float)=2 _Wind("Wind motion",Range(0,.1))=0
  _Translucency("Translucency",Range(0,1))=0 _Bend("Grass bend",Float)=0 _Dissolve("Dissolve",Range(0,1))=0 _DissolveEdge("Dissolve edge",Color)=(1,.6,.2,1) _SnowStrength("Snow strength",Range(0,1))=1
  _SuperPulse("Super pulse",Float)=0
  // Blended realism (CarrotSurface.hlsl). Defaults add nothing: an untouched material renders as before.
  _Subsurface("Subsurface wrap",Range(0,.6))=0 _SubsurfaceTint("Subsurface tint",Color)=(1,1,1,1)
  _Sheen("Fuzz sheen",Range(0,1))=0 _SheenTint("Sheen tint",Color)=(1,1,1,1)
  _DetailNormal("Detail normal",2D)="bump"{} _DetailScale("Detail scale",Float)=6 _DetailStrength("Detail strength",Range(0,2))=0
  _HitFlash("Hit flash",Range(0,1))=0 _RimBoost("Rim boost",Range(0,1))=0
  _MoodClass("Boss mood class",Float)=0 // BOSS MOOD
 }
 SubShader { Tags {"RenderType"="Opaque" "RenderPipeline"="UniversalPipeline" "Queue"="Geometry"} Cull [_Cull]
  HLSLINCLUDE
  #include "CarrotCommon.hlsl"
  TEXTURE2D(_MainTex);SAMPLER(sampler_MainTex);TEXTURE2D(_BumpMap);SAMPLER(sampler_BumpMap);TEXTURE2D(_RoughnessMap);SAMPLER(sampler_RoughnessMap);TEXTURE2D(_OcclusionMap);SAMPLER(sampler_OcclusionMap);TEXTURE2D(_DetailNormal);SAMPLER(sampler_DetailNormal);
  CBUFFER_START(UnityPerMaterial)
  float4 _MainTex_ST,_Color,_EmissionColor,_DissolveEdge,_SubsurfaceTint,_SheenTint;
  float _Metallic,_Glossiness,_WorldTexture,_TextureScale,_BumpScale,_UseRoughnessMap,_UseOcclusionMap,_OcclusionStrength,_ReflectionStrength,_Cutoff,_AlbedoSaturation,_AlbedoGain,_Wind,_VertexColorSRGB,_Translucency,_Dissolve,_SnowStrength,_Bend,_SuperPulse,_Subsurface,_Sheen,_DetailScale,_DetailStrength,_HitFlash,_RimBoost;
  float _MoodClass; // BOSS MOOD
  CBUFFER_END
  // Written once per frame by CarrotView: the Super towers' emission pulse (only materials with _SuperPulse read it, so wood and pots never glow).
  float _CarrotSuperPulse;
  struct appdata {float4 vertex:POSITION;float3 normal:NORMAL;float4 tangent:TANGENT;float2 uv:TEXCOORD0;float4 color:COLOR;UNITY_VERTEX_INPUT_INSTANCE_ID};
  float3 CarrotWorld(float4 vertex,float2 uv){float3 w=CarrotWind(TransformObjectToWorld(vertex.xyz),_Wind,uv.y);if(_Bend>0)w=CarrotPush(w,uv.y);return w;}
  void CarrotDissolveClip(float3 world){if(_Dissolve>0)clip(CarrotHash(floor(world*23))-_Dissolve);}
  ENDHLSL
  Pass { Name "Forward" Tags {"LightMode"="UniversalForward"}
   HLSLPROGRAM
   #pragma target 3.0
   #pragma vertex vert
   #pragma fragment frag
   #pragma multi_compile _ _MAIN_LIGHT_SHADOWS _MAIN_LIGHT_SHADOWS_CASCADE
   #pragma multi_compile_fragment _ _SHADOWS_SOFT _SHADOWS_SOFT_LOW _SHADOWS_SOFT_MEDIUM _SHADOWS_SOFT_HIGH
   #pragma multi_compile _ _ADDITIONAL_LIGHTS_VERTEX _ADDITIONAL_LIGHTS
   #pragma multi_compile_fragment _ _LIGHT_COOKIES
   #pragma multi_compile_fragment _ _SCREEN_SPACE_OCCLUSION
   #pragma multi_compile _ FOG_LINEAR
   #pragma multi_compile_instancing
   #include "Packages/com.unity.render-pipelines.universal/ShaderLibrary/Lighting.hlsl"
   #include "CarrotSurface.hlsl"
   #include "CarrotBossMood.hlsl" // BOSS MOOD
   struct v2f {float4 pos:SV_POSITION;float3 world:TEXCOORD0;float3 normal:TEXCOORD1;float2 uv:TEXCOORD2;float4 tangent:TEXCOORD3;float4 color:COLOR;float fog:TEXCOORD4;float3 vertexLight:TEXCOORD5;UNITY_VERTEX_INPUT_INSTANCE_ID};
   v2f vert(appdata v){v2f o;UNITY_SETUP_INSTANCE_ID(v);UNITY_TRANSFER_INSTANCE_ID(v,o);o.world=CarrotWorld(v.vertex,v.uv);o.pos=TransformWorldToHClip(o.world);o.normal=TransformObjectToWorldNormal(v.normal);o.tangent=float4(TransformObjectToWorldDir(v.tangent.xyz),v.tangent.w*GetOddNegativeScale());o.uv=TRANSFORM_TEX(v.uv,_MainTex);o.color=v.color;
    // FBX stores display-encoded colors; textures already receive their own sRGB decode.
    if(_VertexColorSRGB>.5)o.color.rgb=SRGBToLinear(o.color.rgb);
    o.fog=ComputeFogFactor(o.pos.z);
    // Low tier lights lanterns per vertex; High resolves additional lights per pixel below.
    #if defined(_ADDITIONAL_LIGHTS_VERTEX)
    o.vertexLight=VertexLighting(o.world,o.normal);
    #else
    o.vertexLight=0;
    #endif
    return o;}
   float3 normalSample(float2 uv){return SafeUnit(UnpackNormalScale(SAMPLE_TEXTURE2D(_BumpMap,sampler_BumpMap,uv),_BumpScale));}
   float2 worldUV(float2 p){return (frac(p*_TextureScale)*.96+.02)*_MainTex_ST.xy+_MainTex_ST.zw;}
   float4 frag(v2f i):SV_Target{
    UNITY_SETUP_INSTANCE_ID(i);
    float3 geometric=SafeUnit(i.normal),n=geometric;
    float3 tex;float rough,ao;float opacity=1;
    if(_WorldTexture>.5){
     float3 w=pow(abs(geometric),4);w/=max(dot(w,float3(1,1,1)),.001);
     float2 ux=worldUV(i.world.zy),uy=worldUV(i.world.xz),uz=worldUV(i.world.xy);
     tex=SAMPLE_TEXTURE2D(_MainTex,sampler_MainTex,ux).rgb*w.x+SAMPLE_TEXTURE2D(_MainTex,sampler_MainTex,uy).rgb*w.y+SAMPLE_TEXTURE2D(_MainTex,sampler_MainTex,uz).rgb*w.z;
     rough=SAMPLE_TEXTURE2D(_RoughnessMap,sampler_RoughnessMap,ux).r*w.x+SAMPLE_TEXTURE2D(_RoughnessMap,sampler_RoughnessMap,uy).r*w.y+SAMPLE_TEXTURE2D(_RoughnessMap,sampler_RoughnessMap,uz).r*w.z;
     ao=SAMPLE_TEXTURE2D(_OcclusionMap,sampler_OcclusionMap,ux).r*w.x+SAMPLE_TEXTURE2D(_OcclusionMap,sampler_OcclusionMap,uy).r*w.y+SAMPLE_TEXTURE2D(_OcclusionMap,sampler_OcclusionMap,uz).r*w.z;
     float3 nx=normalSample(ux),ny=normalSample(uy),nz=normalSample(uz);
     n=SafeUnit(float3(nx.z*geometric.x,nx.y+geometric.y,nx.x+geometric.z)*w.x+float3(ny.x+geometric.x,ny.z*geometric.y,ny.y+geometric.z)*w.y+float3(nz.x+geometric.x,nz.y+geometric.y,nz.z*geometric.z)*w.z);
    }else{
     float4 surface=SAMPLE_TEXTURE2D(_MainTex,sampler_MainTex,i.uv);tex=surface.rgb;opacity=surface.a;rough=SAMPLE_TEXTURE2D(_RoughnessMap,sampler_RoughnessMap,i.uv).r;ao=SAMPLE_TEXTURE2D(_OcclusionMap,sampler_OcclusionMap,i.uv).r;
     float3 tangent=SafeUnit(i.tangent.xyz),bitangent=SafeUnit(cross(geometric,tangent))*i.tangent.w;
     float3 bump=normalSample(i.uv);
     // Fine pores, plates and fibres on top of the authored relief (whiteout blend; strength 0 skips the sample).
     if(_DetailStrength>0)bump=CarrotWhiteout(bump,SafeUnit(UnpackNormalScale(SAMPLE_TEXTURE2D(_DetailNormal,sampler_DetailNormal,i.uv*_DetailScale),_DetailStrength)));
     if(dot(tangent,tangent)>.5)n=SafeUnit(tangent*bump.x+bitangent*bump.y+geometric*bump.z);
    }
    clip(opacity*_Color.a-_Cutoff);CarrotDissolveClip(i.world);
    rough=clamp(lerp(1-_Glossiness,rough,_UseRoughnessMap),.09,1);ao=lerp(1,ao,_UseOcclusionMap*_OcclusionStrength);
    tex=lerp(dot(tex,float3(.2126,.7152,.0722)),tex,_AlbedoSaturation)*_AlbedoGain;
    float3 albedo=saturate(tex*_Color.rgb*i.color.rgb);float metallic=_Metallic;float smoothness=1-rough;
    // Snow settles on upward faces; wet ground near marsh ponds darkens and glosses.
    float snow=smoothstep(.45,.8,n.y+(CarrotHash(floor(i.world*9))-.5)*.12)*_SnowAmount*_SnowStrength;
    albedo=lerp(albedo,float3(.93,.96,1.0),snow);smoothness=lerp(smoothness,.18,snow);metallic*=1-snow;
    [unroll] for(int wi=0;wi<2;wi++){float wet=saturate(1-distance(i.world.xz,_WetCenters[wi].xy)/max(.01,_WetCenters[wi].z))*_WetCenters[wi].w;albedo*=lerp(1,.72,wet);smoothness=lerp(smoothness,.6,wet);}
    CarrotMoodSurface(albedo,smoothness,i.world,i.pos); // BOSS MOOD
    float3 view=SafeUnit(GetWorldSpaceViewDir(i.world));
    float4 shadowCoord=TransformWorldToShadowCoord(i.world);float2 screenUV=GetNormalizedScreenSpaceUV(i.pos);
    AmbientOcclusionFactor aoFactor;aoFactor.indirectAmbientOcclusion=1;aoFactor.directAmbientOcclusion=1;
    #if defined(_SCREEN_SPACE_OCCLUSION)
    aoFactor=GetScreenSpaceAmbientOcclusion(screenUV);
    #endif
    Light mainLight=GetMainLight(shadowCoord,i.world,half4(1,1,1,1));mainLight.color*=aoFactor.directAmbientOcclusion;
    BRDFData brdf;InitializeBRDFData(albedo,metallic,half3(0,0,0),smoothness,opacity,brdf);
    float3 color=LightingPhysicallyBased(brdf,mainLight,n,view,false);
    float3 sheen=_Sheen*_SheenTint.rgb;
    color+=CarrotSubsurface(n,mainLight,brdf.diffuse,_Subsurface,_SubsurfaceTint.rgb)+CarrotSheen(n,view,mainLight,sheen);
    // Thin leaves, petals and fur glow when the key light is behind them.
    float backlight=pow(saturate(dot(-mainLight.direction,view)),4)*saturate(dot(-geometric,mainLight.direction)*.5+.5);
    color+=mainLight.color*mainLight.distanceAttenuation*mainLight.shadowAttenuation*backlight*_Translucency*ao*albedo;
    #if defined(_ADDITIONAL_LIGHTS)
    uint lightCount=GetAdditionalLightsCount();
    for(uint li=0u;li<lightCount;++li){Light extra=GetAdditionalLight(li,i.world,half4(1,1,1,1));extra.color*=aoFactor.directAmbientOcclusion;color+=LightingPhysicallyBased(brdf,extra,n,view,false)+CarrotSubsurface(n,extra,brdf.diffuse,_Subsurface,_SubsurfaceTint.rgb)+CarrotSheen(n,view,extra,sheen);}
    #endif
    float3 gi=CarrotHemisphere(n,max(SampleSHPixel(half3(0,0,0),n),float3(.02,.02,.025)));float occlusion=ao*aoFactor.indirectAmbientOcclusion;
    float ndv=saturate(dot(n,view));float specAO=saturate(pow(ndv+occlusion,exp2(-16*rough-1))-1+occlusion);
    float3 reflectVector=reflect(-view,n);float fresnelTerm=Pow4(1-ndv);
    float3 indirectSpecular=GlossyEnvironmentReflection(reflectVector,i.world,brdf.perceptualRoughness,1,screenUV)*specAO*_ReflectionStrength*(1-snow*.6);
    color+=EnvironmentBRDF(brdf,gi*occlusion,indirectSpecular,fresnelTerm)+CarrotSheenAmbient(ndv,gi*occlusion,sheen);
    color+=i.vertexLight*albedo;
    color+=_EmissionColor.rgb*(1+_SuperPulse*_CarrotSuperPulse);
    if(_Dissolve>0){float edge=1-saturate((CarrotHash(floor(i.world*23))-_Dissolve)/.06);color+=_DissolveEdge.rgb*edge*edge*2.5;}
    // Night readability rim and the 60 ms impact flash (both driven per renderer through property blocks).
    color+=CarrotRim(ndv,n,gi,mainLight.color,_RimBoost)+_HitFlash*float3(1,.97,.92);
    color=MixFog(color,i.fog);
    return float4(color,1);
   }
   ENDHLSL
  }
  Pass { Name "ShadowCaster" Tags {"LightMode"="ShadowCaster"} ZWrite On ZTest LEqual ColorMask 0 Cull [_Cull]
   HLSLPROGRAM
   #pragma target 3.0
   #pragma vertex vertShadow
   #pragma fragment fragShadow
   #pragma multi_compile_instancing
   #include "Packages/com.unity.render-pipelines.universal/ShaderLibrary/Shadows.hlsl"
   float3 _LightDirection;
   struct shadowVarying {float4 pos:SV_POSITION;float2 uv:TEXCOORD0;float3 world:TEXCOORD1;UNITY_VERTEX_INPUT_INSTANCE_ID};
   shadowVarying vertShadow(appdata v){shadowVarying o;UNITY_SETUP_INSTANCE_ID(v);UNITY_TRANSFER_INSTANCE_ID(v,o);float3 world=CarrotWorld(v.vertex,v.uv);float3 normal=TransformObjectToWorldNormal(v.normal);o.world=world;o.uv=TRANSFORM_TEX(v.uv,_MainTex);float4 pos=TransformWorldToHClip(ApplyShadowBias(world,normal,_LightDirection));o.pos=ApplyShadowClamping(pos);return o;}
   half4 fragShadow(shadowVarying i):SV_Target{UNITY_SETUP_INSTANCE_ID(i);if(_Cutoff>0)clip(SAMPLE_TEXTURE2D(_MainTex,sampler_MainTex,i.uv).a*_Color.a-_Cutoff);CarrotDissolveClip(i.world);return 0;}
   ENDHLSL
  }
  Pass { Name "DepthOnly" Tags {"LightMode"="DepthOnly"} ZWrite On ColorMask R Cull [_Cull]
   HLSLPROGRAM
   #pragma target 3.0
   #pragma vertex vertDepth
   #pragma fragment fragDepth
   #pragma multi_compile_instancing
   struct depthVarying {float4 pos:SV_POSITION;float2 uv:TEXCOORD0;float3 world:TEXCOORD1;UNITY_VERTEX_INPUT_INSTANCE_ID};
   depthVarying vertDepth(appdata v){depthVarying o;UNITY_SETUP_INSTANCE_ID(v);UNITY_TRANSFER_INSTANCE_ID(v,o);o.world=CarrotWorld(v.vertex,v.uv);o.uv=TRANSFORM_TEX(v.uv,_MainTex);o.pos=TransformWorldToHClip(o.world);return o;}
   half4 fragDepth(depthVarying i):SV_Target{UNITY_SETUP_INSTANCE_ID(i);if(_Cutoff>0)clip(SAMPLE_TEXTURE2D(_MainTex,sampler_MainTex,i.uv).a*_Color.a-_Cutoff);CarrotDissolveClip(i.world);return 0;}
   ENDHLSL
  }
 }
}
