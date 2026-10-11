Shader "Forge/Blade" {
 Properties { _MainTex("Generated steel",2D)="white"{} _Color("Metal",Color)=(.7,.75,.8,1) _Metallic("Metalness",Range(0,1))=.95 _Glossiness("Smoothness",Range(0,1))=.65 _Heat("Heat",Range(0,1))=0 _EmissionColor("Evolution",Color)=(0,0,0,0) _GlowColor("Aura",Color)=(.5,.8,1,1) _Kind("Metal kind",Float)=0 _Stage("Evolution stage",Float)=0 }
 SubShader { Tags {"RenderType"="Opaque"} LOD 250
 CGPROGRAM
 #pragma surface surf Standard fullforwardshadows vertex:vert
 #pragma target 3.0
 sampler2D _MainTex;fixed4 _Color,_EmissionColor,_GlowColor;half _Metallic,_Glossiness,_Heat,_Kind,_Stage;
 struct Input {float3 local;float3 worldPos;float3 viewDir;};
 void vert(inout appdata_full v,out Input o){UNITY_INITIALIZE_OUTPUT(Input,o);o.local=v.vertex.xyz;}
 void surf(Input i,inout SurfaceOutputStandard o){
  float grain=tex2D(_MainTex,i.worldPos.xz*.72).r;fixed3 color=_Color.rgb*(.48+grain*.75);
  if(_Kind==4){float folds=sin(i.local.x*75+sin(i.local.z*60)*1.8+sin(i.local.x*14)*3);color*=.72+folds*.13;}
  if(_Kind==7){float grazing=1-abs(normalize(i.viewDir).y);float3 film=.68+.32*cos(float3(0,2.1,4.2)+grazing*7+i.local.x*1.1);color=lerp(color,film,.6);}
  o.Albedo=color;o.Metallic=_Metallic;o.Smoothness=_Glossiness*(.64+grain*.3);
  float heat=_Heat*smoothstep(-.1,2.3,i.local.x);float3 hot=lerp(float3(.9,.025,0),float3(1,.72,.27),heat);
  float pulse=(.7+.3*sin(_Time.y*2.5+i.local.x*4))*step(4,_Stage)*.2;
  o.Emission=hot*heat*2.7+_EmissionColor.rgb+_GlowColor.rgb*pulse;
 }
 ENDCG
 } FallBack "Standard"
}
