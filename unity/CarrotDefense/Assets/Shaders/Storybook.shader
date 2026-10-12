Shader "Carrot/Storybook" {
 Properties {
  _Color("Tint",Color)=(1,1,1,1) _AlbedoSaturation("Albedo saturation",Range(0,1))=1 _AlbedoGain("Albedo gain",Range(0,4))=1 _MainTex("Albedo",2D)="white"{}
  _BumpMap("Normal",2D)="bump"{} _BumpScale("Normal strength",Range(0,2))=1
  _Metallic("Metal",Range(0,1))=0 _Glossiness("Smoothness fallback",Range(0,1))=.35
  _RoughnessMap("Roughness",2D)="white"{} _UseRoughnessMap("Use roughness",Float)=0
  _OcclusionMap("Ambient occlusion",2D)="white"{} _OcclusionStrength("Occlusion strength",Range(0,1))=.7 _UseOcclusionMap("Use occlusion",Float)=0
  _EmissionColor("Emission",Color)=(0,0,0,0) _WorldTexture("World texture",Float)=0 _TextureScale("Texture scale",Float)=1
  _ReflectionStrength("Reflection strength",Range(0,2))=.8 _Cutoff("Alpha cutoff",Range(0,1))=0 _Cull("Cull mode",Float)=2 _Wind("Wind motion",Range(0,.1))=0
 }
 SubShader { Tags {"RenderType"="Opaque"} LOD 250 Cull [_Cull]
  Pass { Tags {"LightMode"="ForwardBase"}
   CGPROGRAM
   #pragma target 3.0
   #pragma vertex vert
   #pragma fragment frag
   #pragma multi_compile_fwdbase
   #pragma multi_compile_fog
   #include "UnityCG.cginc"
   #include "Lighting.cginc"
   #include "AutoLight.cginc"
   sampler2D _MainTex,_BumpMap,_RoughnessMap,_OcclusionMap;
   float4 _MainTex_ST,_Color,_EmissionColor;
   float _Metallic,_Glossiness,_WorldTexture,_TextureScale,_BumpScale,_UseRoughnessMap,_UseOcclusionMap,_OcclusionStrength,_ReflectionStrength,_Cutoff,_AlbedoSaturation,_AlbedoGain,_Wind,_CarrotTime;
   struct appdata {float4 vertex:POSITION;float3 normal:NORMAL;float4 tangent:TANGENT;float2 uv:TEXCOORD0;float4 color:COLOR;};
   struct v2f {float4 pos:SV_POSITION;float3 world:TEXCOORD0;float3 normal:TEXCOORD1;float2 uv:TEXCOORD2;float4 tangent:TEXCOORD3;float4 color:COLOR;SHADOW_COORDS(4) UNITY_FOG_COORDS(5)};
   v2f vert(appdata v){v2f o;o.world=mul(unity_ObjectToWorld,v.vertex).xyz;o.world.x+=sin(o.world.z*2.8+o.world.x*1.7+_CarrotTime*1.5)*_Wind*v.uv.y;o.pos=mul(UNITY_MATRIX_VP,float4(o.world,1));o.normal=UnityObjectToWorldNormal(v.normal);o.tangent=float4(UnityObjectToWorldDir(v.tangent.xyz),v.tangent.w*unity_WorldTransformParams.w);o.uv=TRANSFORM_TEX(v.uv,_MainTex);o.color=v.color;TRANSFER_SHADOW(o);UNITY_TRANSFER_FOG(o,o.pos);return o;}
   float3 safeUnit(float3 p){return p*rsqrt(max(dot(p,p),.00001));}
   float3 normalSample(float2 uv){float3 n=UnpackNormal(tex2D(_BumpMap,uv));n.xy*=_BumpScale;return safeUnit(n);}
   float2 worldUV(float2 p){return (frac(p*_TextureScale)*.96+.02)*_MainTex_ST.xy+_MainTex_ST.zw;}
   float4 frag(v2f i):SV_Target{
    float3 geometric=safeUnit(i.normal),n=geometric;
    float3 tex;float rough,ao;float opacity=1;
    if(_WorldTexture>.5){
     float3 w=pow(abs(geometric),4);w/=max(dot(w,float3(1,1,1)),.001);
     float2 ux=worldUV(i.world.zy),uy=worldUV(i.world.xz),uz=worldUV(i.world.xy);
     tex=tex2D(_MainTex,ux).rgb*w.x+tex2D(_MainTex,uy).rgb*w.y+tex2D(_MainTex,uz).rgb*w.z;
     rough=tex2D(_RoughnessMap,ux).r*w.x+tex2D(_RoughnessMap,uy).r*w.y+tex2D(_RoughnessMap,uz).r*w.z;
     ao=tex2D(_OcclusionMap,ux).r*w.x+tex2D(_OcclusionMap,uy).r*w.y+tex2D(_OcclusionMap,uz).r*w.z;
     float3 nx=normalSample(ux),ny=normalSample(uy),nz=normalSample(uz);
     n=safeUnit(float3(nx.z*geometric.x,nx.y+geometric.y,nx.x+geometric.z)*w.x+float3(ny.x+geometric.x,ny.z*geometric.y,ny.y+geometric.z)*w.y+float3(nz.x+geometric.x,nz.y+geometric.y,nz.z*geometric.z)*w.z);
    }else{
     float4 surface=tex2D(_MainTex,i.uv);tex=surface.rgb;opacity=surface.a;rough=tex2D(_RoughnessMap,i.uv).r;ao=tex2D(_OcclusionMap,i.uv).r;
     float3 tangent=safeUnit(i.tangent.xyz),bitangent=safeUnit(cross(geometric,tangent))*i.tangent.w;
     float3 bump=normalSample(i.uv);if(dot(tangent,tangent)>.5)n=safeUnit(tangent*bump.x+bitangent*bump.y+geometric*bump.z);
    }
    clip(opacity*_Color.a-_Cutoff);
    rough=clamp(lerp(1-_Glossiness,rough,_UseRoughnessMap),.09,1);ao=lerp(1,ao,_UseOcclusionMap*_OcclusionStrength);
    tex=lerp(dot(tex,float3(.2126,.7152,.0722)),tex,_AlbedoSaturation)*_AlbedoGain;
    float3 albedo=saturate(tex*_Color.rgb*i.color.rgb),view=safeUnit(_WorldSpaceCameraPos-i.world),light=safeUnit(_WorldSpaceLightPos0.xyz),h=safeUnit(light+view);
    float ndl=saturate(dot(n,light)),ndh=saturate(dot(n,h)),ndv=max(.045,saturate(dot(n,view))),vdh=saturate(dot(view,h));
    UNITY_LIGHT_ATTENUATION(shadow,i,i.world);
    float a=rough*rough,a2=a*a,d=ndh*ndh*(a2-1)+1,D=a2/max(.0001,UNITY_PI*d*d);
    float k=(rough+1)*(rough+1)*.125,G=(ndv/(ndv*(1-k)+k))*(ndl/(ndl*(1-k)+k+.001));
    float3 F0=lerp(float3(.04,.04,.04),albedo,_Metallic),F=F0+(1-F0)*pow(1-vdh,5);
    float3 spec=D*G*F/max(.008,4*ndv*ndl),diffuse=(1-F)*(1-_Metallic)*albedo/UNITY_PI;
    float3 direct=(diffuse+min(spec,8))*_LightColor0.rgb*ndl*shadow;
    float3 ambient=max(ShadeSH9(float4(n,1)),float3(.025,.025,.03))*albedo*(1-_Metallic)*ao;
    float3 reflection=reflect(-view,n);
    half4 encoded=UNITY_SAMPLE_TEXCUBE_LOD(unity_SpecCube0,reflection,rough*(1.7-.7*rough)*6);
    float3 environment=DecodeHDR(encoded,unity_SpecCube0_HDR);
    // Split-sum approximation retains rough-metal reflections without sharp mirror artifacts.
    float4 r=rough*float4(-1,-.0275,-.572,.022)+float4(1,.0425,1.04,-.04);
    float a004=min(r.x*r.x,exp2(-9.28*ndv))*r.x+r.y;
    float2 brdf=float2(-1.04,1.04)*a004+r.zw;
    float specAO=saturate(pow(ndv+ao,exp2(-16*rough-1))-1+ao);
    float3 indirect=environment*(F0*brdf.x+brdf.y)*specAO*_ReflectionStrength;
    float3 rgb=direct+ambient+indirect+_EmissionColor.rgb;
    // Filmic shoulder preserves snow, skin and metal detail in the LDR browser canvas.
    // Compress luminance together so saturated foliage and warm creature hues do not bleach.
    float luminance=max(dot(rgb,float3(.2126,.7152,.0722)),.00001);
    float exposed=luminance*.78;
    float mapped=(exposed*(2.51*exposed+.03))/(exposed*(2.43*exposed+.59)+.14);
    rgb=saturate(rgb*(mapped/luminance));
    float4 c=float4(rgb,1);UNITY_APPLY_FOG(i.fogCoord,c);return c;
   }
   ENDCG
  }
  Pass {Name "ShadowCaster" Tags {"LightMode"="ShadowCaster"} ZWrite On
   CGPROGRAM
   #pragma vertex vertShadow
   #pragma fragment fragShadow
   #pragma multi_compile_shadowcaster
   #include "UnityCG.cginc"
   sampler2D _MainTex;float4 _MainTex_ST,_Color;float _Cutoff;
   struct shadowVarying {V2F_SHADOW_CASTER;float2 uv:TEXCOORD1;};
   shadowVarying vertShadow(appdata_base v){shadowVarying o;o.uv=TRANSFORM_TEX(v.texcoord,_MainTex);TRANSFER_SHADOW_CASTER_NORMALOFFSET(o);return o;}
   float4 fragShadow(shadowVarying i):SV_Target{clip(tex2D(_MainTex,i.uv).a*_Color.a-_Cutoff);SHADOW_CASTER_FRAGMENT(i)}
   ENDCG
  }
 }
 Fallback "Diffuse"
}
