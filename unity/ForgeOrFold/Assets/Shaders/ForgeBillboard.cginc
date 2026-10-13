#ifndef FORGE_BILLBOARD_INCLUDED
#define FORGE_BILLBOARD_INCLUDED
// Owner: hot-metal-vfx. Billboard expansion for the CPU particle batches (ForgeVfx.cs, ForgeEffects.cs):
// every vertex carries its particle's centre; the quad is built here in view space. The particle is kept at
// least minPx CSS pixels across (so 1-4 mm scale stays visible at phone resolution) and stretched along its
// screen-space velocity by stretch seconds (head at the particle, tail behind). flat > .5 lays the quad in
// world xz instead (ripples on water). angle rotates a still quad (smoke).
#include "UnityCG.cginc"
float _ForgeMetalCssW;
struct ForgeBB { float4 pos; float3 world; float2 local; float tail; float grow; };
ForgeBB ForgeBillboard(float3 centre,float2 corner,float size,float3 vel,float stretch,float flat,float minPx,float angle){
 ForgeBB o=(ForgeBB)0;
 float3 wc=mul(unity_ObjectToWorld,float4(centre,1)).xyz;
 float3 vc=mul(UNITY_MATRIX_V,float4(wc,1)).xyz;
 float depth=max(-vc.z,.01);
 float pxPerM=abs(UNITY_MATRIX_P[1][1])*.5*_ScreenParams.y/depth;
 // minPx is in CSS pixels: the render target's pixels per CSS pixel of the canvas (_ForgeMetalCssW, 0 = unknown), 1 .. 2.5.
 minPx*=_ForgeMetalCssW>0?clamp(_ScreenParams.x/_ForgeMetalCssW,1,2.5):1;
 float s=max(size,minPx/max(pxPerM,1e-4));
 o.grow=s/max(size,1e-5);
 if(flat>.5){
  float3 w=wc+float3(corner.x,0,corner.y)*s*.5;
  o.world=w;o.pos=mul(UNITY_MATRIX_VP,float4(w,1));o.local=corner;o.tail=0;return o;
 }
 float3 vv=mul((float3x3)UNITY_MATRIX_V,vel);
 float sp=length(vv.xy);
 float streak=sp*stretch;
 float2 ax=sp>1e-4?vv.xy/sp:float2(cos(angle),sin(angle));
 float2 ay=float2(-ax.y,ax.x);
 float h=s*.5;
 float along=corner.x>0?h:-h-streak;
 vc.xy+=ax*along+ay*corner.y*h;
 o.world=mul(UNITY_MATRIX_I_V,float4(vc,1)).xyz;
 o.pos=mul(UNITY_MATRIX_P,float4(vc,1));
 o.local=float2(along/h,corner.y);
 o.tail=streak/h;
 return o;
}
/// Capsule mask along the streak (1 inside, soft edge of width `soft`), and the head-to-tail brightness.
float ForgeCapsule(float2 local,float tail,float soft,out float headness){
 float x=clamp(local.x,-tail,0);
 float d=length(float2(local.x-x,local.y));
 headness=tail>1e-3?saturate((local.x+tail+1)/(tail+1)):1;
 return 1-smoothstep(1-soft,1,d);
}
#endif
