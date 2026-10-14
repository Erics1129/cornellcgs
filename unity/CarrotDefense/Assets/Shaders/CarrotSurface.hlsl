#ifndef CARROT_SURFACE_INCLUDED
#define CARROT_SURFACE_INCLUDED
// Blended-realism surface terms for Carrot/Storybook ("living miniatures").
// Every term is additive, or a lerp whose weight is a material property or a global that defaults to 0,
// so a material that leaves the new properties at their defaults renders exactly as it did before.
// No keywords: the variant count and the WarmShaders path are unchanged.
// Include after URP Lighting.hlsl (uses Light and PI).

// Per biome, written by the view (Shader.SetGlobal*). Unset globals read as 0, which disables bounce and sky occlusion.
// Any other include that declares these must define CARROT_GROUND_GLOBALS_DECLARED first.
#ifndef CARROT_GROUND_GLOBALS_DECLARED
#define CARROT_GROUND_GLOBALS_DECLARED
float4 _CarrotGroundColor;
float _CarrotBounce;
#endif

// Subsurface approximation: wrap diffuse (NdotL+w)/(1+w). Only the light gained past the plain Lambert terminator
// is added, tinted, so w=0 adds exactly nothing. Thin skins (carrot, leaves, petals, gel, ice) read as lit from
// within at the shadow edge instead of turning plastic-grey.
float3 CarrotSubsurface(float3 n,Light light,float3 diffuse,float wrap,float3 tint){
 float ndl=dot(n,light.direction);
 float wrapped=saturate((ndl+wrap)/(1+wrap));
 float gained=max(0,wrapped-saturate(ndl));
 return diffuse*light.color*(light.distanceAttenuation*light.shadowAttenuation)*gained*tint;
}

// Fuzz sheen: Charlie distribution (Estevez and Kulla 2017) with the Neubelt visibility term, at a fixed fuzz roughness.
// Fur, felted caps and peach skin catch a soft rim of light at grazing angles.
float CarrotCharlie(float noh){const float inv=2.0;float sin2=max(1-noh*noh,.0078125);return (2+inv)*pow(sin2,inv*.5)/(2*PI);}
float3 CarrotSheen(float3 n,float3 view,Light light,float3 sheen){
 float3 h=SafeUnit(light.direction+view);
 float nol=saturate(dot(n,light.direction)),nov=saturate(dot(n,view))+.0001,noh=saturate(dot(n,h));
 float visibility=saturate(1/(4*(nol+nov-nol*nov)+.0001));
 return sheen*CarrotCharlie(noh)*visibility*nol*light.color*(light.distanceAttenuation*light.shadowAttenuation);
}
// Ambient share of the sheen lobe (environment light skimming the fuzz).
float3 CarrotSheenAmbient(float ndv,float3 gi,float3 sheen){float f=1-ndv;return sheen*gi*(.08+.55*f*f*f);}

// Whiteout blend of a tangent-space detail normal onto the base tangent-space normal.
float3 CarrotWhiteout(float3 base,float3 detail){return SafeUnit(float3(base.xy+detail.xy,base.z*detail.z));}

// Hemispheric sky occlusion and ground bounce, applied to the ambient irradiance before the environment BRDF.
// Faces turned toward the ground see less sky and receive light reflected from the biome floor instead.
// Scaled by the global _CarrotBounce (0 = off, the pre-update look).
float3 CarrotHemisphere(float3 n,float3 gi){
 float k=saturate(_CarrotBounce);
 float down=saturate(.5-.5*n.y);
 float sky=lerp(1,.62+.38*saturate(n.y*.5+.5),k);
 return gi*sky+_CarrotGroundColor.rgb*down*k;
}

// Silhouette rim for night biomes and focus: a cool edge light that keeps dark creatures readable on dark ground.
float3 CarrotRim(float ndv,float3 n,float3 gi,float3 keyColor,float boost){
 float f=1-ndv;float rim=f*f*f;
 return boost*rim*saturate(n.y*.5+.65)*(gi*2.2+keyColor*.18+float3(.10,.13,.18));
}
#endif
