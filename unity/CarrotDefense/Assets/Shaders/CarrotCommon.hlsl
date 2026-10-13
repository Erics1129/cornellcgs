#ifndef CARROT_COMMON_INCLUDED
#define CARROT_COMMON_INCLUDED
#include "Packages/com.unity.render-pipelines.universal/ShaderLibrary/Core.hlsl"
#include "Packages/com.unity.render-pipelines.core/ShaderLibrary/Color.hlsl"
// Globals written by CarrotView every frame (never per material).
float _CarrotTime,_CarrotGust,_SnowAmount,_CarrotSoftParticles;
float4 _SnowOffset;
float4 _WetCenters[2];
float4 _CarrotPushers[12];
float3 CarrotWind(float3 world,float wind,float uvY){world.x+=sin(world.z*2.8+world.x*1.7+_CarrotTime*1.5)*wind*_CarrotGust*uvY;world.z+=cos(world.x*2.1+_CarrotTime*1.1)*wind*.5*_CarrotGust*uvY;return world;}
float CarrotHash(float3 p){p=frac(p*.3183099+.1);p*=17;return frac(p.x*p.y*p.z*(p.x+p.y+p.z));}
float3 SafeUnit(float3 p){return p*rsqrt(max(dot(p,p),.00001));}
#endif
