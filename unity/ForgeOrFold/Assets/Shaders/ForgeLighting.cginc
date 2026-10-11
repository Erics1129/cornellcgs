#ifndef FORGE_LIGHTING_INCLUDED
#define FORGE_LIGHTING_INCLUDED
#include "UnityCG.cginc"
float4 _ForgeKeyPosition,_ForgeKeyColor,_ForgeRimPosition,_ForgeRimColor,_ForgeFirePosition,_ForgeFireColor;
float _ForgeImpact;
float3 ForgeSafeNormal(float3 v){return v*rsqrt(max(dot(v,v),.000001));}
float3 ForgeLamp(float3 position,float3 radiance,float3 p,float3 n,float3 view,float3 base,float metal,float rough){
 float3 delta=position-p;float d2=max(.01,dot(delta,delta));float3 light=delta*rsqrt(d2);
 float nl=saturate(dot(n,light)),nv=max(.04,saturate(dot(n,view)));
 float3 h=ForgeSafeNormal(light+view);float nh=saturate(dot(n,h)),vh=saturate(dot(view,h));
 float a2=max(.006,rough*rough*rough*rough),den=nh*nh*(a2-1)+1;
 float distribution=a2/max(.0001,UNITY_PI*den*den);
 float k=(rough+1)*(rough+1)*.125;
 float visibility=(nl/max(.001,nl*(1-k)+k))*(nv/max(.001,nv*(1-k)+k));
 float3 f0=lerp(float3(.04,.04,.04),base,metal),f=f0+(1-f0)*pow(1-vh,5);
 float3 spec=distribution*visibility*f/max(.001,4*nl*nv);
 return ((1-f)*(1-metal)*base/UNITY_PI+spec)*radiance*nl/(1+d2*.4);
}
float3 ForgeLit(float3 base,float metal,float smooth,float3 p,float3 n,float3 view){
 float rough=max(.14,1-smooth);
 float3 ambient=max(float3(.13,.11,.09),ShadeSH9(float4(n,1)));
 // A restrained room fill keeps dark metal readable when a close-up probe direction is black.
 float3 color=base*ambient*(1-metal*.22);
 color+=ForgeLamp(_ForgeKeyPosition.xyz,_ForgeKeyColor.rgb*3.3,p,n,view,base,metal,rough);
 color+=ForgeLamp(_ForgeRimPosition.xyz,_ForgeRimColor.rgb*3.3,p,n,view,base,metal,rough);
 color+=ForgeLamp(_ForgeFirePosition.xyz,_ForgeFireColor.rgb*2.8,p,n,view,base,metal,rough);
 color+=ForgeLamp(float3(.12,1.12,-.4),float3(1,.58,.25)*_ForgeImpact*.32,p,n,view,base,metal,rough);
 float3 reflected=reflect(-view,n);
 float4 env=UNITY_SAMPLE_TEXCUBE_LOD(unity_SpecCube0,reflected,rough*6);
 float3 fresnel=lerp(float3(.04,.04,.04),base,metal);
 fresnel+=(1-fresnel)*pow(1-saturate(dot(n,view)),5);
 color+=DecodeHDR(env,unity_SpecCube0_HDR)*fresnel*(.5+.5*smooth);
 return max(0,color);
}
#endif
