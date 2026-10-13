Shader "Forge/Fire" {
 // Owner: room-light-post. Hearth flames from the 4x4 atlas. Frames N and N+1 are blended (no 14 fps steps),
 // each quad runs at its own phase (vertex colour r = frame offset / 16, g = brightness), and quads whose
 // vertex colour b is 1 are cylindrical billboards around their centre (TEXCOORD1.xy = corner offset in metres).
 // _Frame advances continuously; _Glow scales the light (flicker, bellows, night banking).
 Properties { _MainTex("Fire atlas",2D)="black"{} _Frame("Frame",Float)=0 _Glow("Glow",Float)=1 }
 SubShader { Tags {"Queue"="Transparent" "RenderType"="Transparent" "IgnoreProjector"="True"} Blend One One ZWrite Off Cull Off
  Pass { CGPROGRAM
   #pragma vertex vert
   #pragma fragment frag
   #include "UnityCG.cginc"
   sampler2D _MainTex;float _Frame,_Glow;
   struct appdata{float4 vertex:POSITION;float2 uv:TEXCOORD0;float2 corner:TEXCOORD1;float4 color:COLOR;};
   struct v2f{float4 vertex:SV_POSITION;float4 uv:TEXCOORD0;float2 local:TEXCOORD1;float2 blend:TEXCOORD2;};
   float2 Cell(float frame,float2 uv){frame=fmod(frame,16);return uv*.25+float2(fmod(frame,4)*.25,(3-floor(frame/4))*.25);}
   v2f vert(appdata v){v2f o;
    float4 world=mul(unity_ObjectToWorld,v.vertex);
    if(v.color.b>.5){float3 toCam=_WorldSpaceCameraPos-world.xyz;toCam.y=0;float3 right=normalize(cross(float3(0,1,0),toCam+float3(.0001,0,0)));world.xyz+=right*v.corner.x+float3(0,1,0)*v.corner.y;}
    o.vertex=mul(UNITY_MATRIX_VP,world);
    float frame=_Frame+v.color.r*16;float f0=floor(frame);
    o.uv=float4(Cell(f0,v.uv),Cell(f0+1,v.uv));o.blend=float2(frame-f0,v.color.g);o.local=v.uv;return o;}
   fixed4 frag(v2f i):SV_Target{
    float3 a=tex2D(_MainTex,i.uv.xy).rgb,b=tex2D(_MainTex,i.uv.zw).rgb;float3 c=lerp(a,b,i.blend.x);
    // Soft sides and base so the quads never show an edge against the hood or the coals.
    float edge=smoothstep(0,.18,i.local.x)*smoothstep(0,.18,1-i.local.x)*smoothstep(0,.12,i.local.y);
    return fixed4(c*1.65*_Glow*i.blend.y*edge,1);}
  ENDCG } } }
