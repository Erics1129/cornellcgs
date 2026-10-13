Shader "Forge/Finish" {
 // Owner: room-light-post. Passes: 0 legacy bloom threshold, 1 legacy 4-tap blur, 2 finish (heat haze, bloom, exposure
 // 1.13, Narkowicz ACES, vignette; INVARIANT: the blackbody heat ramp is calibrated through it), 3 FXAA 3.11 (low
 // preset) for quality tiers without MSAA, 4 bloom prefilter (soft-knee threshold) + downsample, 5 dual-filter
 // downsample, 6 dual-filter upsample (adds the blurred level below). With _LumaAlpha 1 the finish pass writes
 // perceptual luma to alpha for FXAA.
 Properties {_MainTex("Source",2D)="white"{} _Bloom("Bloom",2D)="black"{} _Low("Lower bloom level",2D)="black"{} _LumaAlpha("Luma in alpha",Float)=0 _BloomScale("Bloom",Float)=.3 _HazeOn("Haze",Float)=1}
 SubShader {Cull Off ZWrite Off ZTest Always
 CGINCLUDE
 #include "UnityCG.cginc"
 sampler2D _MainTex,_Bloom,_Low;float4 _MainTex_TexelSize,_Low_TexelSize,_Threshold;float _LumaAlpha,_BloomScale,_HazeOn;
 // Heat haze (FROZEN globals): xy viewport position (y up), z radius in viewport-width units, w UV strength (0 = off).
 // _ForgeHazeA = the hottest blade (hot-metal-vfx), _ForgeHazeB = the hearth mouth (room-light-post).
 float4 _ForgeHazeA,_ForgeHazeB;float _ForgeHazeClock;
 half4 threshold(v2f_img i):SV_Target{half3 c=tex2D(_MainTex,i.uv).rgb;half l=max(c.r,max(c.g,c.b));return half4(c*saturate((l-.75)/max(l,.001)),1);}
 half4 blur(v2f_img i):SV_Target{float2 d=_MainTex_TexelSize.xy*1.6;return (tex2D(_MainTex,i.uv+d)+tex2D(_MainTex,i.uv-d)+tex2D(_MainTex,i.uv+float2(d.x,-d.y))+tex2D(_MainTex,i.uv+float2(-d.x,d.y)))*.25;}
 // Dual filtering (M. Bjorge, 2015): 5-tap down, 8-tap tent up.
 half3 Down5(float2 uv){float2 h=_MainTex_TexelSize.xy*.5;return (tex2D(_MainTex,uv).rgb*4+tex2D(_MainTex,uv-h).rgb+tex2D(_MainTex,uv+h).rgb+tex2D(_MainTex,uv+float2(h.x,-h.y)).rgb+tex2D(_MainTex,uv-float2(h.x,-h.y)).rgb)*.125;}
 half4 prefilter(v2f_img i):SV_Target{half3 c=min(Down5(i.uv),64);half br=max(c.r,max(c.g,c.b));half rq=clamp(br-_Threshold.y,0,_Threshold.z);rq=_Threshold.w*rq*rq;return half4(c*max(rq,br-_Threshold.x)/max(br,.0001),1);}
 half4 down(v2f_img i):SV_Target{return half4(Down5(i.uv),1);}
 half4 up(v2f_img i):SV_Target{float2 h=_Low_TexelSize.xy*.5;float2 uv=i.uv;
  half3 s=tex2D(_Low,uv+float2(-h.x*2,0)).rgb+tex2D(_Low,uv+float2(-h.x,h.y)).rgb*2+tex2D(_Low,uv+float2(0,h.y*2)).rgb+tex2D(_Low,uv+float2(h.x,h.y)).rgb*2
   +tex2D(_Low,uv+float2(h.x*2,0)).rgb+tex2D(_Low,uv+float2(h.x,-h.y)).rgb*2+tex2D(_Low,uv+float2(0,-h.y*2)).rgb+tex2D(_Low,uv+float2(-h.x,-h.y)).rgb*2;
  return half4(tex2D(_MainTex,uv).rgb+s/12,1);}
 float HazeHash(float2 p){float3 p3=frac(p.xyx*.1031);p3+=dot(p3,p3.yzx+33.33);return frac((p3.x+p3.y)*p3.z);}
 float HazeNoise(float2 p){float2 i=floor(p),f=frac(p);f=f*f*(3-2*f);return lerp(lerp(HazeHash(i),HazeHash(i+float2(1,0)),f.x),lerp(HazeHash(i+float2(0,1)),HazeHash(i+1),f.x),f.y);}
 /// UV offset from one haze source at viewport point vp: an ellipse that sits above the source (heat rises), noise
 /// at scale 18 scrolling up at .35 viewport-heights per second.
 float2 HazeOne(float4 h,float2 vp,float hw){
  if(h.w<=0||h.z<=0)return 0;
  float2 d=float2(vp.x-h.x,(vp.y-h.y)*hw)/h.z;d.y-=.35;d.y*=1.6;float m=saturate(1-dot(d,d));m*=m;
  float2 q=float2(vp.x,vp.y*hw)*18-float2(0,_ForgeHazeClock*.35*18);
  return (float2(HazeNoise(q),HazeNoise(q+17.3))-.5)*2*h.w*m;
 }
 half4 finish(v2f_img i):SV_Target{
  float2 uv=i.uv;
  if(_HazeOn>.5){float2 vp=i.uv;
#if UNITY_UV_STARTS_AT_TOP
   if(_MainTex_TexelSize.y<0)vp.y=1-vp.y;
#endif
   float hw=_MainTex_TexelSize.z/max(1,_MainTex_TexelSize.w);hw=1/max(.0001,hw);   // height / width
   uv+=HazeOne(_ForgeHazeA,vp,hw)+HazeOne(_ForgeHazeB,vp,hw);}
  half3 c=tex2D(_MainTex,uv).rgb+tex2D(_Bloom,i.uv).rgb*_BloomScale;c*=1.13;c=(c*(2.51*c+.03))/(c*(2.43*c+.59)+.14);float2 edge=i.uv*(1-i.uv);c*=.79+.21*pow(saturate(edge.x*edge.y*16),.3);
  return half4(c,_LumaAlpha>.5?sqrt(saturate(dot(c,half3(.299,.587,.114)))):1);}
 ENDCG
 Pass {CGPROGRAM
 #pragma vertex vert_img
 #pragma fragment threshold
 ENDCG}
 Pass {CGPROGRAM
 #pragma vertex vert_img
 #pragma fragment blur
 ENDCG}
 Pass {CGPROGRAM
 #pragma vertex vert_img
 #pragma fragment finish
 ENDCG}
 // FXAA 3.11 quality, preset 10 (3 search steps: 1.5, 3, 12), after T. Lottes. Reads luma from alpha.
 Pass {CGPROGRAM
 #pragma vertex vert_img
 #pragma fragment fxaa
 #pragma target 3.0
 float L(float2 p){return tex2Dlod(_MainTex,float4(p,0,0)).a;}
 half4 fxaa(v2f_img i):SV_Target{
  float2 rcp=_MainTex_TexelSize.xy;float2 pos=i.uv;
  float4 M=tex2Dlod(_MainTex,float4(pos,0,0));float lumaM=M.a;
  float lumaS=L(pos+float2(0,rcp.y)),lumaE=L(pos+float2(rcp.x,0)),lumaN=L(pos-float2(0,rcp.y)),lumaW=L(pos-float2(rcp.x,0));
  float rangeMax=max(max(lumaN,lumaW),max(lumaE,max(lumaS,lumaM))),rangeMin=min(min(lumaN,lumaW),min(lumaE,min(lumaS,lumaM)));
  float range=rangeMax-rangeMin;
  if(range<max(.0833,rangeMax*.166))return half4(M.rgb,1);
  float lumaNW=L(pos+float2(-rcp.x,-rcp.y)),lumaSE=L(pos+rcp),lumaNE=L(pos+float2(rcp.x,-rcp.y)),lumaSW=L(pos+float2(-rcp.x,rcp.y));
  float lumaNS=lumaN+lumaS,lumaWE=lumaW+lumaE;float subpixRcpRange=1/range;float subpixNSWE=lumaNS+lumaWE;
  float edgeHorz1=-2*lumaM+lumaNS,edgeVert1=-2*lumaM+lumaWE;
  float lumaNESE=lumaNE+lumaSE,lumaNWNE=lumaNW+lumaNE;float edgeHorz2=-2*lumaE+lumaNESE,edgeVert2=-2*lumaN+lumaNWNE;
  float lumaNWSW=lumaNW+lumaSW,lumaSWSE=lumaSW+lumaSE;
  float edgeHorz4=abs(edgeHorz1)*2+abs(edgeHorz2),edgeVert4=abs(edgeVert1)*2+abs(edgeVert2);
  float edgeHorz3=-2*lumaW+lumaNWSW,edgeVert3=-2*lumaS+lumaSWSE;
  float edgeHorz=abs(edgeHorz3)+edgeHorz4,edgeVert=abs(edgeVert3)+edgeVert4;
  float subpixNWSWNESE=lumaNWSW+lumaNESE;float lengthSign=rcp.x;bool horzSpan=edgeHorz>=edgeVert;
  float subpixA=subpixNSWE*2+subpixNWSWNESE;
  if(!horzSpan){lumaN=lumaW;lumaS=lumaE;}else lengthSign=rcp.y;
  float subpixB=subpixA*(1.0/12.0)-lumaM;
  float gradientN=lumaN-lumaM,gradientS=lumaS-lumaM;float lumaNN=lumaN+lumaM,lumaSS=lumaS+lumaM;
  bool pairN=abs(gradientN)>=abs(gradientS);float gradient=max(abs(gradientN),abs(gradientS));if(pairN)lengthSign=-lengthSign;
  float subpixC=saturate(abs(subpixB)*subpixRcpRange);
  float2 posB=pos;float2 offNP=float2(horzSpan?rcp.x:0,horzSpan?0:rcp.y);
  if(!horzSpan)posB.x+=lengthSign*.5;else posB.y+=lengthSign*.5;
  float2 posN=posB-offNP*1.5,posP=posB+offNP*1.5;
  float subpixD=-2*subpixC+3;float lumaEndN=L(posN);float subpixE=subpixC*subpixC;float lumaEndP=L(posP);
  if(!pairN)lumaNN=lumaSS;float gradientScaled=gradient*.25;float lumaMM=lumaM-lumaNN*.5;float subpixF=subpixD*subpixE;bool lumaMLTZero=lumaMM<0;
  lumaEndN-=lumaNN*.5;lumaEndP-=lumaNN*.5;
  bool doneN=abs(lumaEndN)>=gradientScaled,doneP=abs(lumaEndP)>=gradientScaled;
  if(!doneN)posN-=offNP*3;if(!doneP)posP+=offNP*3;
  if(!doneN||!doneP){
   if(!doneN)lumaEndN=L(posN)-lumaNN*.5;if(!doneP)lumaEndP=L(posP)-lumaNN*.5;
   doneN=abs(lumaEndN)>=gradientScaled;doneP=abs(lumaEndP)>=gradientScaled;
   if(!doneN)posN-=offNP*12;if(!doneP)posP+=offNP*12;
  }
  float dstN=horzSpan?pos.x-posN.x:pos.y-posN.y,dstP=horzSpan?posP.x-pos.x:posP.y-pos.y;
  bool goodSpanN=(lumaEndN<0)!=lumaMLTZero,goodSpanP=(lumaEndP<0)!=lumaMLTZero;
  float spanLength=dstP+dstN;bool directionN=dstN<dstP;float dst=min(dstN,dstP);bool goodSpan=directionN?goodSpanN:goodSpanP;
  float subpixG=subpixF*subpixF;float pixelOffset=dst*(-1/spanLength)+.5;float subpixH=subpixG*.75;
  float pixelOffsetSubpix=max(goodSpan?pixelOffset:0,subpixH);
  if(!horzSpan)pos.x+=pixelOffsetSubpix*lengthSign;else pos.y+=pixelOffsetSubpix*lengthSign;
  return half4(tex2Dlod(_MainTex,float4(pos,0,0)).rgb,1);
 }
 ENDCG}
 Pass {CGPROGRAM
 #pragma vertex vert_img
 #pragma fragment prefilter
 ENDCG}
 Pass {CGPROGRAM
 #pragma vertex vert_img
 #pragma fragment down
 ENDCG}
 Pass {CGPROGRAM
 #pragma vertex vert_img
 #pragma fragment up
 ENDCG}
 } }
