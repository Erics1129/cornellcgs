Shader "Carrot/Water" {
 Properties {_Color("Deep water",Color)=(.018,.071,.068,1) _Shallow("Shallow water",Color)=(.11,.24,.23,1)}
 SubShader {Tags {"RenderType"="Opaque"} Pass {CGPROGRAM
  #pragma target 3.0
  #pragma vertex vert
  #pragma fragment frag
  #pragma multi_compile_fog
  #include "UnityCG.cginc"
  #include "Lighting.cginc"
  float4 _Color,_Shallow;float _CarrotTime;
  struct a{float4 vertex:POSITION;};struct v{float4 pos:SV_POSITION;float3 world:TEXCOORD0;UNITY_FOG_COORDS(1)};
  float noise(float2 p){float2 i=floor(p),f=frac(p);f=f*f*(3-2*f);float4 q=frac(sin(float4(dot(i,float2(127.1,311.7)),dot(i+float2(1,0),float2(127.1,311.7)),dot(i+float2(0,1),float2(127.1,311.7)),dot(i+1,float2(127.1,311.7))))*43758.5453);return lerp(lerp(q.x,q.y,f.x),lerp(q.z,q.w,f.x),f.y);}
  float ripple(float2 p){return noise(p*2.3+float2(_CarrotTime*.12,-_CarrotTime*.085))*.018+noise(p*7.1+float2(-_CarrotTime*.08,_CarrotTime*.11))*.006;}
  v vert(a x){v o;float3 w=mul(unity_ObjectToWorld,x.vertex).xyz;w.y+=sin(w.x*1.7+w.z*.63+_CarrotTime*.55)*.008;o.world=w;o.pos=mul(UNITY_MATRIX_VP,float4(w,1));UNITY_TRANSFER_FOG(o,o.pos);return o;}
  float4 frag(v i):SV_Target{
   float2 p=i.world.xz;float r=ripple(p);float3 n=normalize(float3((r-ripple(p+float2(.06,0)))/.06,1,(r-ripple(p+float2(0,.06)))/.06));
   float3 view=normalize(_WorldSpaceCameraPos-i.world);float fres=pow(1-saturate(dot(n,view)),5);
   float3 direction=reflect(-view,n);half4 encoded=UNITY_SAMPLE_TEXCUBE_LOD(unity_SpecCube0,direction,2.5);float3 environment=DecodeHDR(encoded,unity_SpecCube0_HDR);
   float3 halfVector=normalize(normalize(_WorldSpaceLightPos0.xyz)+view);float spec=pow(saturate(dot(n,halfVector)),96)*.10;
   float shade=noise(p*.65)*.07;float3 rgb=lerp(_Color.rgb,_Shallow.rgb,.17+shade)+environment*(.025+fres*.22)+_LightColor0.rgb*spec;
   float4 c=float4(rgb/(1+rgb),1);UNITY_APPLY_FOG(i.fogCoord,c);return c;
  }
  ENDCG}}
}
