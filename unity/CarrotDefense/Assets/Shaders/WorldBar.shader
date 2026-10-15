Shader "Carrot/WorldBar" {
 // Screen-space HP bars and blindness glints (CarrotWorldBars). Vertices arrive in NDC (xy) with a flag in uv.x: 0 flat fill,
 // 1 shield hatch (-45 degree stripes every 6 px), 2 soft round glint. Drawn after the blindness overlay (queue 4002) with
 // ZTest Always so bars stay readable over geometry and in the dark.
 Properties {}
 SubShader { Tags {"Queue"="Overlay+2" "RenderType"="Transparent" "IgnoreProjector"="True" "RenderPipeline"="UniversalPipeline"} Blend SrcAlpha OneMinusSrcAlpha ZWrite Off ZTest Always Cull Off
  Pass { Name "Forward" Tags {"LightMode"="UniversalForward"}
   HLSLPROGRAM
   #pragma vertex vert
   #pragma fragment frag
   #include "Packages/com.unity.render-pipelines.universal/ShaderLibrary/Core.hlsl"
   struct a{float4 vertex:POSITION;float4 color:COLOR;float2 uv:TEXCOORD0;float2 local:TEXCOORD1;};
   struct v{float4 pos:SV_POSITION;float4 color:COLOR;float2 uv:TEXCOORD0;float2 local:TEXCOORD1;};
   // _ProjectionParams.x is -1 while the pipeline renders through a flipped projection (an intermediate target on Metal/D3D).
   v vert(a x){v o;o.pos=float4(x.vertex.x,x.vertex.y*_ProjectionParams.x,UNITY_NEAR_CLIP_VALUE*.5+.5,1);o.color=x.color;o.uv=x.uv;o.local=x.local;return o;}
   float4 frag(v i):SV_Target{
    float4 c=i.color;
    if(i.uv.x>1.5){float d=length(i.local*2-1);c.a*=saturate(1-d)*saturate(1-d);}
    else if(i.uv.x>.5){float s=frac((i.pos.x+i.pos.y)/6);c.a*=s<.5?1:.25;}
    return c;
   }
   ENDHLSL
  }
 }
}
