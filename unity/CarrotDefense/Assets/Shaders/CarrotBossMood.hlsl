#ifndef CARROT_BOSS_MOOD_INCLUDED
#define CARROT_BOSS_MOOD_INCLUDED
// BOSS MOOD (presentation only): despair in the background value band on the boss levels. Storybook calls CarrotMoodSurface once,
// after the albedo, snow and wet terms; it returns at once unless _CarrotMood.x is on and this material is one of the boss level's
// classified clones (_MoodClass 1 ground, 2 foliage, 3 prop, 4 lane, 5 prism band, 6 the guardian's own body). Lanes keep their
// values (gain/tint 1 by default), pads, towers, creatures, the carrot and every telegraph are never classified. One field sample,
// a uniform branch per class; no keyword, variant or pass.
float4 _CarrotMood;            // x on, y De for the world (held while the restoration front sweeps), z view time, w edge breath
float4 _CarrotMoodGround,_CarrotMoodFoliage,_CarrotMoodProp; // (saturation, gain, hue/wither amount, -) at De = 1
float4 _CarrotMoodLane;        // (gain, tint amount, long-shadow strength on lanes, on ground)
float4 _CarrotMoodBand;        // (saturation, -, -, -) prism bands beyond the focus radius
float4 _CarrotMoodHue,_CarrotMoodWither,_CarrotMoodPropHue,_CarrotMoodLaneTint,_CarrotMoodWake,_CarrotMoodLossColor;
float4 _CarrotMoodBounds;      // route + pad bounds (min x, min z, max x, max z)
float4 _CarrotMoodEdge;        // (gain floor, inward closing (u), mode 0 darken / 1 fade to fog, -)
float4 _CarrotMoodWakeP;       // (kind, gain, smoothness offset, -)
float4 _CarrotMoodFront;       // (front as route-0 progress, soft edge in progress units, -, -)
float4 _CarrotMoodFieldRect;   // (min x, min z, 1/width, 1/depth) of _CarrotMoodField
float4 _CarrotMoodWave;        // restoration front (centre x, z, radius (<0 off), De behind it)
float4 _CarrotMoodFocus;       // Asuna: (x, z, radius, on)
float4 _CarrotMoodShadow,_CarrotMoodShadowP; // the guardian's long shadow: segment (ax, az, bx, bz), (radius, amount, -, -)
float4 _CarrotMoodPool;        // the carrot's warm pool (x, z, radius, strength)
float4 _CarrotMoodBoss;        // the guardian (x, ground y, z, top of the dithered lower body in world y)
float4 _CarrotMoodLoss[16];float _CarrotMoodLossCount;
float4 _CarrotMoodOcc[24];float _CarrotMoodOccCount;
float _CarrotMoodDebug;        // QA only (Quality('mood:debug:<n>')): 1 shows the field (R lane, G progress, B pad), 2 the losses and the wake mask
TEXTURE2D(_CarrotMoodField);SAMPLER(sampler_CarrotMoodField);

float CarrotMoodLuma(float3 c){return dot(c,float3(.2126,.7152,.0722));}
float3 CarrotMoodSat(float3 c,float s){float l=CarrotMoodLuma(c);return lerp(float3(l,l,l),c,s);}
// Luminance-preserving hue blend: the value stays, the hue and chroma move toward the profile colour.
float3 CarrotMoodTint(float3 c,float3 hue,float amount){float l=CarrotMoodLuma(c);float3 t=hue*(l/max(CarrotMoodLuma(hue),.02));return lerp(c,saturate(t),saturate(amount));}
float CarrotMoodNoise(float2 p){float2 i=floor(p),f=frac(p);f=f*f*(3-2*f);float a=CarrotHash(float3(i,7.1)),b=CarrotHash(float3(i+float2(1,0),7.1)),c=CarrotHash(float3(i+float2(0,1),7.1)),d=CarrotHash(float3(i+1,7.1));return lerp(lerp(a,b,f.x),lerp(c,d,f.x),f.y);}
float CarrotMoodBayer(float2 p){int x=(int)fmod(abs(p.x),4),y=(int)fmod(abs(p.y),4);
 float4 r0=float4(0,8,2,10),r1=float4(12,4,14,6),r2=float4(3,11,1,9),r3=float4(15,7,13,5);float4 r=y==0?r0:y==1?r1:y==2?r2:r3;return (x==0?r.x:x==1?r.y:x==2?r.z:r.w)/16+1.0/32;}

void CarrotMoodSurface(inout float3 albedo,inout float smoothness,float3 world,float4 screen){
 if(_CarrotMood.x<.5||_MoodClass<.5)return;
 float cls=_MoodClass;float2 xz=world.xz;
 if(cls>5.5){
  // The guardian drawn larger than its rules body: its lower body draws a 50% screen door wherever it hides a pad, a tower, the
  // carrot or a live telegraph target (the ground point behind this fragment, seen from the camera, lies on one of them).
  if(world.y<_CarrotMoodBoss.w){float3 cam=_WorldSpaceCameraPos;float t=(cam.y-_CarrotMoodBoss.y)/max(cam.y-world.y,.05);float2 g=cam.xz+(xz-cam.xz)*t;float hit=0;
   [loop] for(int i=0;i<24;i++){if(i>=(int)_CarrotMoodOccCount)break;float4 o=_CarrotMoodOcc[i];if(distance(g,o.xy)<o.z)hit=1;}
   if(hit>0)clip(CarrotMoodBayer(screen.xy)-.5);}
  return;}
 float4 f=SAMPLE_TEXTURE2D_LOD(_CarrotMoodField,sampler_CarrotMoodField,(xz-_CarrotMoodFieldRect.xy)*_CarrotMoodFieldRect.zw,0);
 float hold=_CarrotMood.y,de=hold;
 if(_CarrotMoodWave.z>=0)de=lerp(de,_CarrotMoodWave.w,saturate((_CarrotMoodWave.z-distance(xz,_CarrotMoodWave.xy))/1.5));
 float heal=hold>.001?saturate(de/hold):0;
 if(_CarrotMoodDebug>.5&&_CarrotMoodDebug<1.5&&cls<3.5){albedo=f.rgb;return;}
 float lane=f.r*4,prog=f.g,lat=f.a*4;
 float pad=f.b*3;
 // the carrot's warm pool flows around the pads and never reaches one (a warm pool on a pad means "lit" under blindness)
 float pool=0;if(_CarrotMoodPool.w>0)pool=pow(saturate(1-distance(xz,_CarrotMoodPool.xy)/max(_CarrotMoodPool.z,.01)),1.5)*_CarrotMoodPool.w*smoothstep(.15,.55,pad);
 // the long shadow toward the carrot (ground .35, lanes .12; never pads or actors, which are not classified)
 float shade=0;if(_CarrotMoodShadowP.y>0){float2 a=_CarrotMoodShadow.xy,ab=_CarrotMoodShadow.zw-a;float t=saturate(dot(xz-a,ab)/max(dot(ab,ab),1e-4));float d=distance(xz,a+ab*t);shade=(1-smoothstep(_CarrotMoodShadowP.x*.45,_CarrotMoodShadowP.x,d))*(1-.55*t)*_CarrotMoodShadowP.y;}
 if(cls>3.5&&cls<4.5){albedo*=lerp(1,_CarrotMoodLane.x,de);albedo=CarrotMoodTint(albedo,_CarrotMoodLaneTint.rgb,_CarrotMoodLane.y*de);albedo*=1-_CarrotMoodLane.z*shade;return;}
 if(cls>4.5){float keep=_CarrotMoodFocus.w>0?1-smoothstep(_CarrotMoodFocus.z,_CarrotMoodFocus.z+2,distance(xz,_CarrotMoodFocus.xy)):0;albedo=CarrotMoodSat(albedo,lerp(1,_CarrotMoodBand.x,de*(1-keep)));return;}
 de*=1-.75*saturate(pool*1.4);
 float4 cfg=cls<1.5?_CarrotMoodGround:cls<2.5?_CarrotMoodFoliage:_CarrotMoodProp;
 albedo=CarrotMoodSat(albedo,lerp(1,cfg.x,de));
 albedo=CarrotMoodTint(albedo,cls<1.5?_CarrotMoodHue.rgb:cls<2.5?_CarrotMoodWither.rgb:_CarrotMoodPropHue.rgb,cfg.z*de);
 float gain=lerp(1,cfg.y,de);
 if(cls<2.5){
  // the wake: a band .55-1.4 u beside route 0, from the spawn up to the front (how far the boss has come, at a glance)
  float kind=_CarrotMoodWakeP.x;float band_dbg=0;
  if(kind>.5){float band=smoothstep(.45,.65,lat)*(1-smoothstep(1.25,1.5,lat))*smoothstep(.45,.6,lane);float front=saturate((_CarrotMoodFront.x-prog)/max(_CarrotMoodFront.y,1e-4)+.5);
   float n=CarrotMoodNoise(xz*(kind<1.5?2.3:kind<3.5?3.1:kind<4.5?1.7:kind<5.5?5:1.2));
   float m=kind<1.5?.7+.3*(1-smoothstep(.02,.09,abs(n-.5))):kind<2.5?1:kind<3.5?1-smoothstep(.02,.07,abs(n-.5)):kind<4.5?.3+.7*smoothstep(.35,.7,n):kind<5.5?.7+.3*step(.6,n):kind<6.5?1:smoothstep(.3,.8,n);
   float w=band*front*m*saturate(_CarrotMood.y*2.4)*heal;band_dbg=w;
   albedo=CarrotMoodTint(albedo,_CarrotMoodWake.rgb,_CarrotMoodWake.a*w);
   if(kind<2.5||kind>3.5){gain*=lerp(1,_CarrotMoodWakeP.y,w)*(kind<1.5?1-.35*w*(1-smoothstep(.02,.09,abs(n-.5))):1);smoothness=saturate(smoothness+_CarrotMoodWakeP.z*w);if(kind>5.5&&kind<6.5)albedo=CarrotMoodSat(albedo,1-.6*w);}}
  // losses: patches that wither for good (one per wave, one each time the boss passes a landmark); healed by the release
  float lw=0;[loop] for(int i=0;i<16;i++){if(i>=(int)_CarrotMoodLossCount)break;float4 L=_CarrotMoodLoss[i];lw=max(lw,saturate((L.z-distance(xz,L.xy))/.6)*L.w);}
  lw*=heal*(1-saturate(pool*2));
  // dead patches read pale and grey-straw against the dark living ground (value kept, chroma gone, hue to the profile's dead colour)
  if(cls>1.5){albedo=CarrotMoodSat(albedo,1-.75*lw);albedo=CarrotMoodTint(albedo,_CarrotMoodLossColor.rgb,lw);gain*=1+.08*lw;}
  else{albedo=CarrotMoodTint(albedo,_CarrotMoodLossColor.rgb,.6*lw);albedo=CarrotMoodSat(albedo,1-.4*lw);gain*=1-.08*lw;}
  gain*=1-_CarrotMoodLane.w*shade;
  if(_CarrotMoodDebug>1.5){albedo=float3(lw,_CarrotMoodWakeP.x>.5?band_dbg:0,pool);return;}
 }
 // the world beyond the board: the darkness closes in (or, in the white-out, everything fades into the fog), never inside bounds + .5 u
 float2 dd=max(max(_CarrotMoodBounds.xy-xz,xz-_CarrotMoodBounds.zw),0);float outside=length(dd);float margin=max(.5,1.5-_CarrotMoodEdge.y*de);float ramp=saturate((outside-margin)/3);
 if(_CarrotMoodEdge.z<.5)gain*=1-(1-_CarrotMoodEdge.x)*(1+_CarrotMood.w)*ramp*de;
 else albedo=lerp(albedo,saturate(unity_FogColor.rgb),.6*ramp*de);
 albedo*=gain;
 albedo*=lerp(float3(1,1,1),float3(1.35,1.12,.88),pool);
}
#endif
