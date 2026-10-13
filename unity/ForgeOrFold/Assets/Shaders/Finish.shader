Shader "Forge/Finish" {
 // Owner: room-light-post. Passes: 0 bloom threshold, 1 4-tap blur, 2 finish (bloom, exposure 1.13, Narkowicz
 // ACES, vignette; INVARIANT: the blackbody heat ramp is calibrated through it), 3 FXAA 3.11 (low preset) for
 // quality tiers without MSAA. With _LumaAlpha 1 the finish pass writes perceptual luma to alpha for FXAA.
 Properties {_MainTex("Source",2D)="white"{} _Bloom("Bloom",2D)="black"{} _LumaAlpha("Luma in alpha",Float)=0}
 SubShader {Cull Off ZWrite Off ZTest Always
 CGINCLUDE
 #include "UnityCG.cginc"
 sampler2D _MainTex,_Bloom;float4 _MainTex_TexelSize;float _LumaAlpha;
 half4 threshold(v2f_img i):SV_Target{half3 c=tex2D(_MainTex,i.uv).rgb;half l=max(c.r,max(c.g,c.b));return half4(c*saturate((l-.75)/max(l,.001)),1);}
 half4 blur(v2f_img i):SV_Target{float2 d=_MainTex_TexelSize.xy*1.6;return (tex2D(_MainTex,i.uv+d)+tex2D(_MainTex,i.uv-d)+tex2D(_MainTex,i.uv+float2(d.x,-d.y))+tex2D(_MainTex,i.uv+float2(-d.x,d.y)))*.25;}
 half4 finish(v2f_img i):SV_Target{half3 c=tex2D(_MainTex,i.uv).rgb+tex2D(_Bloom,i.uv).rgb*.3;c*=1.13;c=(c*(2.51*c+.03))/(c*(2.43*c+.59)+.14);float2 edge=i.uv*(1-i.uv);c*=.79+.21*pow(saturate(edge.x*edge.y*16),.3);
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
 } }
