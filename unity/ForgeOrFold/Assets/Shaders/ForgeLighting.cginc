#ifndef FORGE_LIGHTING_INCLUDED
#define FORGE_LIGHTING_INCLUDED
#include "UnityCG.cginc"
// Owner: room-light-post. The workshop's single lighting model (ForwardBase only: Unity Light components
// light nothing). Every global below is FINAL radiance (linear, before the Finish exposure), set from
// ForgeTuning.room by ForgeAtmosphere.cs:
//  key    hanging oil lamp over the anvil, under a tin shade (cone _ForgeKeyDir/_ForgeKeyCone)
//  rim    cool window spill
//  fire   hearth fire, the dominant warm source; _ForgeFireColor flickers every frame (ForgeFlicker.cs)
//         and the hearth box hides its own fire from anything below its top (_ForgeFireShadow*)
//  bounce the fire's light thrown back by the hearth front, floor and walls: a soft warm fill in the
//         ambient term (_ForgeFireBounce), so the whole room breathes with the flicker
//  sconce dim candle by the door, candle = bench lantern (diffuse only; off in FORGE_LITE)
//  impact contact flash at the real contact point (_ForgeImpactPos/_ForgeImpactColor x _ForgeImpact)
//  glow   hottest blade (_ForgeGlowPos/_ForgeGlowColor, attenuation 1 / (1 + d^2 / .16), range in .w)
// Soft shadows and sphere AO from the four _ForgeOccluders apply only near the anvil (_ForgeShadowZone);
// static contact shading arrives as a baked per-vertex AO term (ForgeLitAO). FORGE_LITE (quality tiers 2-3)
// drops the occluders and the candles.
float4 _ForgeKeyPosition,_ForgeKeyColor,_ForgeRimPosition,_ForgeRimColor,_ForgeFirePosition,_ForgeFireColor;
float _ForgeImpact;
// Contact flash: xyz = position (just above the real contact), rgb = colour; intensity is _ForgeImpact.
float4 _ForgeImpactPos,_ForgeImpactColor;
// Blade glow lamp (FROZEN names; room-light-post owns the lighting): _ForgeGlowPos.xyz = hottest knife centre,
// .w = range (0 = off); _ForgeGlowColor.rgb = radiance. Emissive receivers define FORGE_NO_GLOW_LAMP before
// including this file so a lamp inside their own mesh cannot light them (Blade.shader does).
float4 _ForgeGlowPos,_ForgeGlowColor;
// Key lamp shade: xyz = cone axis (unit, out of the shade), w = fraction that spills upward through the vent
// (only above the shade; the tin shade itself darkens everything between the cone and the vent).
// _ForgeKeyCone: x = cos(outer half-angle), y = 1 / (cos inner - cos outer).
float4 _ForgeKeyDir,_ForgeKeyCone;
// Hearth self-shadow for the fire lamp: the hearth top rectangle (x0, z0, x1, z1) and its height (_ForgeFireShadowY.x);
// the hood lip rectangle (_ForgeFireHoodRect) at height _ForgeFireShadowY.y hides the fire from the ceiling and upper walls.
float4 _ForgeFireShadowRect,_ForgeFireShadowY,_ForgeFireHoodRect;
// Door sconce and bench lantern (diffuse only): xyz position; rgb radiance, a > 0 = on.
float4 _ForgeSconcePosition,_ForgeSconceColor,_ForgeCandlePosition,_ForgeCandleColor;
// Room fill floor (rgb; a > 0 = set): the trilight SH is far below it, so this is the ambient level.
float4 _ForgeAmbient;
// Hearth bounce: xyz = centre of the lit hearth front, w > 0 = on; _ForgeBounceColor = its radiance, set every frame
// with the fire's flicker (a less saturated amber than the fire itself: it has bounced off brick, stone and wood).
float4 _ForgeFireBounce,_ForgeBounceColor;
// Moving occluders (strike-feel: hammer head, hands, anvil knife): xyz centre, w radius, 0 = off.
float4 _ForgeOccluders[4];
// Where occluder shadows apply: xyz centre (the anvil), w radius (about 1 m). w = 0 turns them off.
float4 _ForgeShadowZone;

float3 ForgeSafeNormal(float3 v){return v*rsqrt(max(dot(v,v),.000001));}
/// Cook-Torrance lamp without distance falloff (callers apply their own).
float3 ForgeLampCore(float3 light,float3 radiance,float3 n,float3 view,float3 base,float metal,float rough){
 float nl=saturate(dot(n,light)),nv=max(.04,saturate(dot(n,view)));
 float3 h=ForgeSafeNormal(light+view);float nh=saturate(dot(n,h)),vh=saturate(dot(view,h));
 float a2=max(.006,rough*rough*rough*rough),den=nh*nh*(a2-1)+1;
 float distribution=a2/max(.0001,UNITY_PI*den*den);
 float k=(rough+1)*(rough+1)*.125;
 float visibility=(nl/max(.001,nl*(1-k)+k))*(nv/max(.001,nv*(1-k)+k));
 float3 f0=lerp(float3(.04,.04,.04),base,metal),f=f0+(1-f0)*pow(1-vh,5);
 float3 spec=distribution*visibility*f/max(.001,4*nl*nv);
 return ((1-f)*(1-metal)*base/UNITY_PI+spec)*radiance*nl;
}
/// Omni lamp with the workshop falloff 1 / (1 + .4 d^2).
float3 ForgeLamp(float3 position,float3 radiance,float3 p,float3 n,float3 view,float3 base,float metal,float rough){
 float3 delta=position-p;float d2=max(.01,dot(delta,delta));
 return ForgeLampCore(delta*rsqrt(d2),radiance,n,view,base,metal,rough)/(1+d2*.4);
}
/// Penumbra shadow of a sphere (centre c relative to the receiver, radius r) toward a light at offset `toLight`:
/// h = distance of the centre from the receiver-to-light segment, t = distance along it; shadow = smoothstep(.6r, 1.6r + .04t, h).
float ForgeSphereShadow(float3 c,float r,float3 toLight){float len=length(toLight);float3 d=toLight/max(len,.0001);float along=dot(c,d);float t=clamp(along,0,len);float h=length(c-d*t);
 // Only a sphere between the receiver and the light casts: the receiver's own occluder (centre behind it) does not.
 return lerp(1,smoothstep(.6*r,1.6*r+.04*t,h),saturate(along/r));}
/// Soft shadow of the moving occluder spheres toward the key, fire and glow lamps (xyz, 1 = lit), and their sphere AO (w).
float4 ForgeOccluderShadow(float3 p,float3 n,float3 key,float3 fire,float3 glow){
 float4 s=float4(1,1,1,1);
#ifndef FORGE_LITE
 float3 dz=p-_ForgeShadowZone.xyz;
 if(_ForgeShadowZone.w>0&&dot(dz,dz)<_ForgeShadowZone.w*_ForgeShadowZone.w){
  for(int i=0;i<4;i++){
   float4 o=_ForgeOccluders[i];if(o.w<=0)continue;
   float3 c=o.xyz-p;float cl=length(c);
   // Sphere AO (cheap form): occlusion grows with the solid angle and how much the sphere faces the normal.
   s.w*=1-saturate(dot(n,c/max(cl,.0001)))*saturate(o.w*o.w/max(cl*cl,.0001))*.85;
   s.x*=ForgeSphereShadow(c,o.w,key-p);s.y*=ForgeSphereShadow(c,o.w,fire-p);s.z*=ForgeSphereShadow(c,o.w,glow-p);
  }
 }
#endif
 return s;
}
/// Fire lamp visibility: the hearth box hides its own fire from anything below its top that looks through it, and
/// the hood hides it from anything above the hood lip outside the hood (the light goes up the flue instead).
float ForgeFireVisibility(float3 p,float3 fire){
 float vis=1;
 float top=_ForgeFireShadowY.x;
 if(p.y<top&&fire.y>top&&_ForgeFireShadowRect.z>_ForgeFireShadowRect.x){
  float s=(top-p.y)/(fire.y-p.y);float2 q=lerp(p.xz,fire.xz,s);
  float2 inside=min(q-_ForgeFireShadowRect.xy,_ForgeFireShadowRect.zw-q);float d=min(inside.x,inside.y);   // > 0 inside the rect
  // Penumbra widens with the distance from the receiver to the hearth edge (the fire is a .4 m bed, not a point).
  float pen=.02+.18*saturate(length(q-p.xz)/1.5);
  vis=1-smoothstep(-pen,pen,d);
 }
 float lip=_ForgeFireShadowY.y;
 if(lip>0&&p.y>lip&&fire.y<lip){
  float2 inHood=min(p.xz-_ForgeFireHoodRect.xy,_ForgeFireHoodRect.zw-p.xz);
  if(min(inHood.x,inHood.y)<0){
   float s=(lip-fire.y)/(p.y-fire.y);float2 q=lerp(fire.xz,p.xz,s);
   float2 inside=min(q-_ForgeFireHoodRect.xy,_ForgeFireHoodRect.zw-q);float d=min(inside.x,inside.y);
   vis*=1-smoothstep(-.06,.10,d);
  }
 }
 return vis;
}
/// Warm fill from the fire's bounce light: wrapped (no hard terminator), no visibility test, a broad falloff.
float3 ForgeFireBounce(float3 p,float3 n){
 if(_ForgeFireBounce.w<=0)return 0;float3 delta=_ForgeFireBounce.xyz-p;float d2=dot(delta,delta);
 float wrap=saturate(dot(n,delta*rsqrt(max(d2,.0001)))*.5+.5);
 return _ForgeBounceColor.rgb*wrap*wrap/(1+d2*.22);
}
/// Diffuse-only candle with a short falloff.
float3 ForgeCandle(float4 position,float4 radiance,float3 p,float3 n,float3 base,float metal){
 if(radiance.a<=0)return 0;float3 delta=position.xyz-p;float d2=max(.01,dot(delta,delta));
 return base*(1-metal)/UNITY_PI*radiance.rgb*saturate(dot(n,delta*rsqrt(d2)))/(1+d2*.9);
}
/// Workshop lighting with a static ambient-occlusion term (1 = open, 0 = fully occluded). `aoDirect` is how
/// much of that AO also darkens the direct lamps (contact shading without shadow maps).
float3 ForgeLitAO(float3 base,float metal,float smooth,float3 p,float3 n,float3 view,float ao,float aoDirect){
 float rough=max(.14,1-smooth);
 float3 fill=_ForgeAmbient.a>0?_ForgeAmbient.rgb:float3(.13,.11,.09);
 float3 ambient=max(fill,ShadeSH9(float4(n,1)))+ForgeFireBounce(p,n);
 // A restrained room fill keeps dark metal readable when a close-up probe direction is black.
 float3 color=base*ambient*(1-metal*.22)*ao;
 float direct=lerp(1,ao,aoDirect);
 float3 glowPos=_ForgeGlowPos.w>0?_ForgeGlowPos.xyz:p+n;
 float4 occ=ForgeOccluderShadow(p,n,_ForgeKeyPosition.xyz,_ForgeFirePosition.xyz,glowPos);
 color*=occ.w;
 // Hanging oil lamp under a tin shade: a soft cone downward plus a little spill through the top vent.
 {float3 delta=_ForgeKeyPosition.xyz-p;float d2=max(.01,dot(delta,delta));float3 l=delta*rsqrt(d2);
  float ca=dot(-l,_ForgeKeyDir.xyz);float cone=saturate((ca-_ForgeKeyCone.x)*_ForgeKeyCone.y);cone=cone*cone*(3-2*cone);cone=max(cone,_ForgeKeyDir.w*saturate(-ca*2.5-.25));
  color+=ForgeLampCore(l,_ForgeKeyColor.rgb,n,view,base,metal,rough)*cone*occ.x*direct/(1+d2*.4);}
 color+=ForgeLamp(_ForgeRimPosition.xyz,_ForgeRimColor.rgb,p,n,view,base,metal,rough)*direct;
 {float3 delta=_ForgeFirePosition.xyz-p;float d2=max(.01,dot(delta,delta));
  float vis=ForgeFireVisibility(p,_ForgeFirePosition.xyz)*occ.y;
  color+=ForgeLampCore(delta*rsqrt(d2),_ForgeFireColor.rgb,n,view,base,metal,rough)*vis*direct/(1+d2*.4);}
#ifndef FORGE_LITE
 color+=(ForgeCandle(_ForgeSconcePosition,_ForgeSconceColor,p,n,base,metal)+ForgeCandle(_ForgeCandlePosition,_ForgeCandleColor,p,n,base,metal))*direct;
#endif
 if(_ForgeImpact>0)color+=ForgeLamp(_ForgeImpactPos.xyz,_ForgeImpactColor.rgb*_ForgeImpact,p,n,view,base,metal,rough);
#ifndef FORGE_NO_GLOW_LAMP
 // Hot blade: attenuation 1 / (1 + d^2 / .16), fading to 0 at the range.
 if(_ForgeGlowPos.w>0){float3 delta=_ForgeGlowPos.xyz-p;float d2=max(.0004,dot(delta,delta));float fade=saturate(1-d2/(_ForgeGlowPos.w*_ForgeGlowPos.w));
  color+=ForgeLampCore(delta*rsqrt(d2),_ForgeGlowColor.rgb,n,view,base,metal,rough)*occ.z*fade/(1+d2/.16);}
#endif
 float3 reflected=reflect(-view,n);
 float4 env=UNITY_SAMPLE_TEXCUBE_LOD(unity_SpecCube0,reflected,rough*6);
 float3 fresnel=lerp(float3(.04,.04,.04),base,metal);
 fresnel+=(1-fresnel)*pow(1-saturate(dot(n,view)),5);
 color+=DecodeHDR(env,unity_SpecCube0_HDR)*fresnel*(.5+.5*smooth)*ao;
 return max(0,color);
}
/// FROZEN signature: lighting with no static AO.
float3 ForgeLit(float3 base,float metal,float smooth,float3 p,float3 n,float3 view){return ForgeLitAO(base,metal,smooth,p,n,view,1,0);}
#endif
