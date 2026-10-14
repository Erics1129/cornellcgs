Shader "Carrot/PortalAperture" {
 Properties { _Color("Rim",Color)=(.15,.72,1,1) _DepthColor("Void",Color)=(.003,.008,.022,1) _Phase("Clock",Float)=0 _Power("Power",Float)=1 }
 SubShader { Tags { "RenderPipeline"="UniversalPipeline" "Queue"="Transparent-20" "RenderType"="Transparent" } Cull Off ZWrite Off Blend SrcAlpha OneMinusSrcAlpha
  Pass { Name "Forward" Tags {"LightMode"="UniversalForward"}
   HLSLPROGRAM
   #pragma vertex vert
   #pragma fragment frag
   #include "Packages/com.unity.render-pipelines.universal/ShaderLibrary/Core.hlsl"
   CBUFFER_START(UnityPerMaterial) half4 _Color,_DepthColor; float _Phase,_Power; CBUFFER_END
   struct Attr {float4 positionOS:POSITION;float2 uv:TEXCOORD0;};struct Vary {float4 positionCS:SV_POSITION;float2 uv:TEXCOORD0;};
   Vary vert(Attr v){Vary o;o.positionCS=TransformObjectToHClip(v.positionOS.xyz);o.uv=v.uv;return o;}
   float hash(float2 p){return frac(sin(dot(p,float2(127.1,311.7)))*43758.5453);}
   float noise(float2 p){float2 i=floor(p),f=frac(p);f=f*f*(3-2*f);return lerp(lerp(hash(i),hash(i+float2(1,0)),f.x),lerp(hash(i+float2(0,1)),hash(i+1),f.x),f.y);}
   half4 frag(Vary i):SV_Target {float2 p=(i.uv-.5)*2;float r=length(p);float a=atan2(p.y,p.x);float t=_Phase*.28;
    float distortion=noise(p*5+float2(t,-t))*.35;float spiral=a*3.5+r*15-t*3+distortion;float w=pow(saturate(.5+.5*sin(spiral)),9);
    float wisps=pow(saturate(.5+.5*sin(a*7-r*26+t*2+noise(p*13)*1.7)),14);float rim=exp(-abs(r-.83)*36);float edge=exp(-abs(r-.78)*13);
    float threads=(w*.35+wisps*.16)*smoothstep(.12,.45,r)*(1-smoothstep(.75,.93,r));
    float2 starUV=floor((p+float2(t*.02,-t*.01))*55);float star=step(.996,hash(starUV))*pow(saturate(1-length(frac(p*55)-.5)*2),6)*(1-smoothstep(.1,.75,r));
    half3 col=_DepthColor.rgb+_Color.rgb*(rim*1.6+edge*.13+threads)*_Power+half3(.3,.17,.58)*w*.12+star*.7;
    float alpha=(1-smoothstep(.88,.98,r))*_Color.a;return half4(col,alpha);
   }
   ENDHLSL
  }
 }
}
