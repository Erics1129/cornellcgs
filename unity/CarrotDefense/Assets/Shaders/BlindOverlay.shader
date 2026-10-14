Shader "Carrot/BlindOverlay" {
 // One quad on the camera near plane: the Blindness screen effect. uGUI's UI/Default is stripped by CarrotShaderStripper, so this is a world
 // quad drawn after every transparent (Queue Overlay) and before post-processing, which keeps black black under ACES.
 // _Radial 0 = flat colour, 1 = edge vignette (Whiteout). _Hole = screen uv x, y, radius, strength: keeps the Unknown Eyeball's iris visible.
 Properties {_Color("Color",Color)=(0,0,0,0) _Radial("Radial",Float)=0 _Hole("Hole",Vector)=(.5,.5,.12,0)}
 SubShader { Tags {"Queue"="Overlay" "RenderType"="Transparent" "IgnoreProjector"="True" "RenderPipeline"="UniversalPipeline"} Blend SrcAlpha OneMinusSrcAlpha ZWrite Off ZTest Always Cull Off
  Pass { Name "Forward" Tags {"LightMode"="UniversalForward"}
   HLSLPROGRAM
   #pragma vertex vert
   #pragma fragment frag
   #include "Packages/com.unity.render-pipelines.universal/ShaderLibrary/Core.hlsl"
   CBUFFER_START(UnityPerMaterial) float4 _Color,_Hole;float _Radial; CBUFFER_END
   struct a{float4 vertex:POSITION;float2 uv:TEXCOORD0;};
   struct v{float4 pos:SV_POSITION;float2 uv:TEXCOORD0;};
   v vert(a x){v o;o.pos=TransformObjectToHClip(x.vertex.xyz);o.uv=x.uv;return o;}
   float4 frag(v i):SV_Target{
    float2 d=i.uv-.5;float r=length(d)*2;
    float radial=lerp(1,smoothstep(.5,1.12,r),_Radial);
    float aspect=_ScreenParams.x/max(1,_ScreenParams.y);
    float2 hd=i.uv-_Hole.xy;hd.x*=aspect;
    float hole=1-_Hole.w*(1-smoothstep(_Hole.z*.45,_Hole.z,length(hd)));
    return float4(_Color.rgb,saturate(_Color.a*radial*hole));
   }
   ENDHLSL
  }
 }
}
