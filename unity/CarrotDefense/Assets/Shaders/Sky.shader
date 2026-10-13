Shader "Carrot/Sky" {
 Properties {_Zenith("Zenith",Color)=(.43,.65,.84,1) _Horizon("Horizon",Color)=(.85,.9,.9,1) _Ground("Ground",Color)=(.2,.26,.14,1) _SunColor("Sun",Color)=(1,.9,.7,1) _SunSize("Sun size",Float)=.03 _SunGlow("Sun glow",Float)=.3 _CloudAmount("Clouds",Float)=.5 _CloudColor("Cloud color",Color)=(1,1,1,1) _Stars("Stars",Float)=0 _Aurora("Aurora",Float)=0 _AuroraColor("Aurora color",Color)=(.37,.91,.63,1) _CarrotSunDir("Sun direction",Vector)=(0,1,0,0)}
 SubShader {Tags {"Queue"="Background" "RenderType"="Background" "PreviewType"="Skybox" "RenderPipeline"="UniversalPipeline"} Cull Off ZWrite Off
  Pass {
   HLSLPROGRAM
   #pragma vertex vert
   #pragma fragment frag
   #include "CarrotCommon.hlsl"
   CBUFFER_START(UnityPerMaterial) float4 _Zenith,_Horizon,_Ground,_SunColor,_CloudColor,_AuroraColor,_CarrotSunDir;float _SunSize,_SunGlow,_CloudAmount,_Stars,_Aurora; CBUFFER_END
   struct a{float4 vertex:POSITION;};struct v{float4 pos:SV_POSITION;float3 dir:TEXCOORD0;};
   v vert(a x){v o;o.pos=TransformObjectToHClip(x.vertex.xyz);o.dir=TransformObjectToWorld(x.vertex.xyz)-GetCameraPositionWS();return o;}
   float vnoise(float2 p){float2 i=floor(p),f=frac(p);f=f*f*(3-2*f);float4 q=frac(sin(float4(dot(i,float2(127.1,311.7)),dot(i+float2(1,0),float2(127.1,311.7)),dot(i+float2(0,1),float2(127.1,311.7)),dot(i+1,float2(127.1,311.7))))*43758.5453);return lerp(lerp(q.x,q.y,f.x),lerp(q.z,q.w,f.x),f.y);}
   float4 frag(v i):SV_Target{
    float3 d=normalize(i.dir);float t=d.y;
    float3 col=t>0?lerp(_Horizon.rgb,_Zenith.rgb,pow(saturate(t),.55)):lerp(_Horizon.rgb,_Ground.rgb,pow(saturate(-t),.45));
    float3 sun=normalize(_CarrotSunDir.xyz);float sd=dot(d,sun);
    col+=_SunColor.rgb*(smoothstep(1-_SunSize,1-_SunSize*.35,sd)*2+pow(saturate(sd),10)*_SunGlow);
    float2 cp=d.xz/(abs(d.y)+.18);float cloud=vnoise(cp*.9+_CarrotTime*.01)*.65+vnoise(cp*2.3-_CarrotTime*.016)*.35;cloud=smoothstep(.62-_CloudAmount*.25,.78,cloud)*saturate(d.y*3.5)*_CloudAmount;
    col=lerp(col,_CloudColor.rgb*(.75+.25*saturate(sd)),cloud*.85);
    if(_Stars>0){float3 cell=floor(d*140);float h=CarrotHash(cell);float star=step(.9965,h)*(.5+.5*sin(_CarrotTime*2+h*60))*saturate(d.y*2);col+=star*_Stars*1.6;}
    if(_Aurora>0){float band=smoothstep(.08,.22,d.y)*(1-smoothstep(.38,.62,d.y));float wave=sin(d.x*7+_CarrotTime*.35+sin(d.z*5+_CarrotTime*.2)*1.5)*.5+.5;float ribbon=band*wave*vnoise(float2(d.x*3+_CarrotTime*.05,d.y*9));col+=_AuroraColor.rgb*ribbon*_Aurora*1.5;}
    return float4(col,1);
   }
   ENDHLSL
  }
 }
}
