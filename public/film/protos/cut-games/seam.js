import*as e from"three";import{SPECK_GROUND as U,SPECKS as Z}from"../../kit/seams.js";import{GLSL_COMMON as X,GLSL_FRAG as Y}from"../../kit/actors/core.js";const Q="void main() { gl_Position = vec4(position.xy, 0.0, 1.0); }",ee=`
uniform sampler2D uTex; uniform vec2 uRes; uniform vec4 uMap; uniform float uK; uniform float uSharp; uniform float uBias;
void main() {
  vec2 uv = gl_FragCoord.xy / uRes * uMap.xy + uMap.zw;
  vec3 sharp = texture2D(uTex, uv).rgb;
  vec3 c = uSharp >= 0.999 ? sharp : mix(texture2D(uTex, uv, uBias).rgb, sharp, uSharp);
  gl_FragColor = vec4(c, uK);
}`,j=1.03;function ie(u,{groundScene:d,poster:o}){const n=u.renderer,s=new e.BufferGeometry;s.setAttribute("position",new e.BufferAttribute(new Float32Array([-1,-1,0,3,-1,0,-1,3,0]),3));const r=new e.OrthographicCamera(-1,1,1,-1,0,1),x={transparent:!1,depthTest:!1,depthWrite:!1,blending:e.CustomBlending,blendSrc:e.SrcAlphaFactor,blendDst:e.OneMinusSrcAlphaFactor,blendSrcAlpha:e.ZeroFactor,blendDstAlpha:e.OneFactor},c=()=>{const t=new e.ShaderMaterial({vertexShader:Q,fragmentShader:ee,uniforms:{uTex:{value:null},uRes:{value:new e.Vector2(1,1)},uMap:{value:new e.Vector4(1,1,0,0)},uK:{value:0},uSharp:{value:1},uBias:{value:5}},...x}),a=new e.Mesh(s,t);a.frustumCulled=!1;const i=new e.Scene;return i.add(a),{m:t,scene:i}},l=c(),S=c(),b=`
uniform sampler2D uTex; uniform vec2 uRes; uniform vec4 uMap; uniform float uK; uniform float uGain;
void main() {
  vec2 uv = gl_FragCoord.xy / uRes * uMap.xy + uMap.zw;
  vec3 deep = texture2D(uTex, uv, 5.5).rgb;
  gl_FragColor = vec4(mix(vec3(1.0), min(vec3(1.0), deep * uGain), uK), 1.0);
}`,D=new e.ShaderMaterial({vertexShader:Q,fragmentShader:b,uniforms:{uTex:{value:null},uRes:{value:new e.Vector2(1,1)},uMap:{value:new e.Vector4(1,1,0,0)},uK:{value:0},uGain:{value:2.4}},transparent:!1,depthTest:!1,depthWrite:!1,blending:e.CustomBlending,blendSrc:e.DstColorFactor,blendDst:e.ZeroFactor,blendSrcAlpha:e.ZeroFactor,blendDstAlpha:e.OneFactor}),P=new e.Mesh(s,D);P.frustumCulled=!1;const f={m:D,scene:new e.Scene};f.scene.add(P);const y=document.createElement("canvas"),C=new e.CanvasTexture(y);C.colorSpace=e.NoColorSpace,C.generateMipmaps=!1,C.minFilter=C.magFilter=e.LinearFilter,l.m.uniforms.uTex.value=C;function A(){if(y.width===4)return;const t=4,a=1024;y.width=t,y.height=a;const i=y.getContext("2d"),m=i.createLinearGradient(0,0,0,a);m.addColorStop(0,U.top),m.addColorStop(1,U.bottom),i.fillStyle=m,i.fillRect(0,0,t,a);const z=i.createLinearGradient(0,a*.62,0,a);z.addColorStop(0,"rgba(232,170,96,0)"),z.addColorStop(1,U.sand),i.fillStyle=z,i.fillRect(0,a*.62,t,a*.38),C.needsUpdate=!0}const p=new e.Texture;p.colorSpace=e.NoColorSpace,p.generateMipmaps=!0,p.minFilter=e.LinearMipmapLinearFilter,p.magFilter=e.LinearFilter,p.wrapS=p.wrapT=e.ClampToEdgeWrapping;let F=!1;const R=new e.Color(0,.05,.15);o&&o.decode().then(()=>{p.image=o,p.needsUpdate=!0,F=!0;try{const t=document.createElement("canvas");t.width=64,t.height=36;const a=t.getContext("2d");a.drawImage(o,0,0,64,36);const i=a.getImageData(0,0,64,36).data,m=32,z=36*(.5+.12/j),O=36*.14;let B=0,_=0,q=0,V=0;for(let W=0;W<36;W++)for(let k=0;k<64;k++){if(Math.hypot(k+.5-m,W+.5-z)>O)continue;const N=(W*64+k)*4;B+=Math.pow(i[N]/255,2.2),_+=Math.pow(i[N+1]/255,2.2),q+=Math.pow(i[N+2]/255,2.2),V++}V&&R.setRGB(B/V,_/V,q/V),t.width=t.height=1}catch{}}).catch(()=>{}),S.m.uniforms.uTex.value=p,f.m.uniforms.uTex.value=p;function h(t,a,i){const m=t/a,z=16/9;let O=1,B=1;return m>z?B=z/m:O=m/z,O/=j,B/=j,i.set(O,B,(1-O)/2,(1-B)/2)}let v=0,g=0,w=0,T=1,L=null;function G(t,a,i){v>=.9999||g>=.9999&&T>=.9999&&F?(t.setRenderTarget(null),t.setClearColor(0,1),t.clear(!0,!0,!0)):(L(t,a,i),t.setRenderTarget(null),t.autoClear=!1,d&&t.render(d,a)),I(t,i),t.setRenderTarget(null),t.autoClear=!1}function I(t,a){const i=a.bw,m=a.bh;v>0&&(A(),l.m.uniforms.uRes.value.set(i,m),l.m.uniforms.uK.value=v,t.render(l.scene,r)),(g>0||w>0)&&F&&(f.m.uniforms.uRes.value.set(i,m),h(a.width,a.height,f.m.uniforms.uMap.value),f.m.uniforms.uK.value=w,w>0&&t.render(f.scene,r),S.m.uniforms.uRes.value.set(i,m),h(a.width,a.height,S.m.uniforms.uMap.value),S.m.uniforms.uK.value=g,S.m.uniforms.uSharp.value=T,g>0&&t.render(S.scene,r))}let M=null;const K=new e.Vector2;function $(t){if(M)return;const a=new e.BufferGeometry;a.setAttribute("position",new e.BufferAttribute(new Float32Array(9),3));const i=new e.MeshBasicMaterial({colorWrite:!1,depthWrite:!1,depthTest:!1});M=new e.Mesh(a,i),M.frustumCulled=!1,M.renderOrder=-1e6,M.onBeforeRender=(m,z,O)=>{t&&t(),m.getDrawingBufferSize(K);const B={width:K.x,height:K.y,bw:K.x,bh:K.y},_=m.autoClear;m.autoClear=!1,d&&v<.9999&&!(g>=.9999&&T>=.9999&&F)&&m.render(d,O),I(m,B),m.autoClear=_},u.shadows.object.parent.add(M)}function J(){u.backdrop!==G&&(L=u.backdrop,u.setBackdrop(G))}let E=1;const H=u.shadows.cast;return u.shadows.cast=function(t,a,i,m={}){if(!(E<=.001))return H.call(this,t,a,i,{...m,opacity:(m.opacity??1)*E})},{install:J,outTex:p,plateMean:R,get outReady(){return F},set(t,a,i=1,m=0){v=Math.max(0,Math.min(1,t)),g=Math.max(0,Math.min(1,a)),T=Math.max(0,Math.min(1,i)),w=Math.max(0,Math.min(1,m)),E=(1-v)*(1-g)},plateMap(t,a,i){return h(t,a,i)},installFilm:$,uninstallFilm(){M&&(M.removeFromParent(),M.geometry.dispose(),M.material.dispose(),M=null)},dispose(){M&&(M.removeFromParent(),M.geometry.dispose(),M.material.dispose(),M=null),u.backdrop===G&&L&&u.setBackdrop(L),u.shadows.cast=H,s.dispose(),l.m.dispose(),S.m.dispose(),D.dispose(),C.dispose(),p.dispose(),y.width=y.height=1}}}const te=`
attribute vec4 aSpeck;   // r (fraction of the window height), a, warm, depth at p = 0
attribute vec3 aDrift;   // sink speed (m/s), sway phase, sway amount
uniform float uT, uH, uDpr, uP0, uK, uSettle;
varying float vA; varying float vWarm;
void main() {
  float t = uT;
  float sink = aDrift.x * (1.0 - exp(-t / 1.6)) * 1.6;          // settling: quick at first, then slow
  vec3 p = position + vec3(0.06 * (sin(t * 0.8 + aDrift.y) - sin(aDrift.y)) * aDrift.z, -sink, 0.04 * (sin(t * 0.6 + aDrift.y * 1.7) - sin(aDrift.y * 1.7)) * aDrift.z);   // exactly in place at p = 0
  vec4 mv = modelViewMatrix * vec4(p, 1.0);
  float d = max(0.05, -mv.z);
  float R = max(0.7, aSpeck.x * uH);                            // the shared frame's radius, CSS px
  float scale = (projectionMatrix[1][1] / uP0) * (aSpeck.w / d);
  gl_PointSize = max(1.0, 2.0 * 2.4 * R * scale * uDpr);
  gl_Position = projectionMatrix * mv;
  vA = aSpeck.y * uK * mix(1.0, 0.55, uSettle);
  vWarm = aSpeck.z;
}`,re=`
varying float vA; varying float vWarm;
void main() {
  float r = length(gl_PointCoord - 0.5) * 2.0;
  if (r >= 1.0) discard;
  vec3 c0 = vWarm > 0.5 ? vec3(255.0, 236.0, 200.0) / 255.0 : vec3(236.0, 250.0, 255.0) / 255.0;
  vec3 c1 = vWarm > 0.5 ? vec3(255.0, 220.0, 170.0) / 255.0 : vec3(210.0, 240.0, 255.0) / 255.0;
  vec3 c = r < 0.4 ? mix(c0, c1, r / 0.4) : mix(c1, vec3(1.0), (r - 0.4) / 0.6);
  float a = r < 0.4 ? mix(1.0, 0.5, r / 0.4) : mix(0.5, 0.0, (r - 0.4) / 0.6);
  gl_FragColor = vec4(c * a * vA, 1.0);
}`;function ue(u,{pose:d,fov:o,aspect:n,heightAt:s}){const r=Z.length,x=new Float32Array(r*3),c=new Float32Array(r*4),l=new Float32Array(r*3),S=new e.Quaternion().fromArray(d.q),b=new e.Vector3().fromArray(d.p),D=Math.tan(o*Math.PI/360),P=new e.Vector3,f=new e.Vector3,y=(h,v)=>{const g=Math.sin(h*127.1+v*311.7)*43758.5453;return g-Math.floor(g)};Z.forEach((h,v)=>{let w=.9+(1-Math.min(1,(h.r-.0016)/.0052))*5.2+y(v,1)*1.4;P.set((2*h.x-1)*D*n,(1-2*h.y)*D,-1).applyQuaternion(S);for(let T=1;T<=40;T++){const L=w*T/40;f.copy(b).addScaledVector(P,L);const G=s(f.x,f.z);if(G!=null&&f.y<G+.08){w=Math.max(.6,L*.85);break}}f.copy(b).addScaledVector(P,w),x.set([f.x,f.y,f.z],v*3),c.set([h.r,h.a,h.warm?1:0,w],v*4),l.set([.05+.12*y(v,2),y(v,3)*6.283,.4+.6*y(v,4)],v*3)});const C=new e.BufferGeometry;C.setAttribute("position",new e.BufferAttribute(x,3)),C.setAttribute("aSpeck",new e.BufferAttribute(c,4)),C.setAttribute("aDrift",new e.BufferAttribute(l,3));const A={uT:{value:0},uH:{value:720},uDpr:{value:1},uP0:{value:1/D},uK:{value:1},uSettle:{value:0}},p=new e.ShaderMaterial({vertexShader:te,fragmentShader:re,uniforms:A,transparent:!0,depthWrite:!1,depthTest:!0,blending:e.CustomBlending,blendSrc:e.OneFactor,blendDst:e.OneFactor,blendSrcAlpha:e.ZeroFactor,blendDstAlpha:e.OneFactor}),F=new e.Points(C,p);F.frustumCulled=!1,F.renderOrder=4;const R=u.add({object:F,dispose(){}});return{set({t:h,H:v,dpr:g,k:w,settle:T}){A.uT.value=h,A.uH.value=v,A.uDpr.value=g,A.uK.value=w,A.uSettle.value=T,F.visible=w>.001},dispose(){u.remove(R),C.dispose(),p.dispose()}}}function le(u,{off:d,count:o=520,size:n=5,radius:s=[.0012,.0036],drift:r=.035,seed:x=23}){let c=x>>>0;const l=()=>(c=c*1664525+1013904223>>>0)/4294967296,S=new Float32Array(o*4),b=new Float32Array(o*4),D=new Float32Array(o*3);for(let A=0;A<o;A++){S.set([l(),l(),l(),l()],A*4);const p=l()*Math.PI*2;b.set([.03+Math.cos(p)*r*(.2+.4*l()),-.008-.012*l(),.012+Math.sin(p)*r*(.2+.4*l()),s[0]+(s[1]-s[0])*l()**2],A*4)}const P=new e.BufferGeometry;P.setAttribute("position",new e.BufferAttribute(D,3)),P.setAttribute("aSeed",new e.BufferAttribute(S,4)),P.setAttribute("aMove",new e.BufferAttribute(b,4)),P.boundingSphere=new e.Sphere(new e.Vector3,1e9);const f=new e.ShaderMaterial({uniforms:{uTime:{value:0},uL:{value:n},uRes:u.light.uResolution,uSun:{value:new e.Vector3(0,1,0)},uSunCol:{value:new e.Color(1,1,1)},uAmb:{value:new e.Color(.4,.42,.48)},uOff:{value:new e.Vector3(d[0],d[1],d[2])},uK:{value:0}},vertexShader:`
      attribute vec4 aSeed; attribute vec4 aMove;
      uniform float uTime, uL; uniform vec2 uRes; uniform vec3 uSun; uniform vec3 uOff;
      varying float vA; varying float vPhase; varying float vSoft;
      void main() {
        float ph = aSeed.w * 6.2832;
        vec3 q = aSeed.xyz * uL + aMove.xyz * uTime + 0.025 * vec3(sin(uTime * 0.61 + ph), sin(uTime * 0.47 + ph * 1.7), cos(uTime * 0.53 + ph * 2.3));
        vec3 fwd = -vec3(viewMatrix[0][2], viewMatrix[1][2], viewMatrix[2][2]);
        vec3 centre = (cameraPosition - uOff) + fwd * (0.42 * uL);
        vec3 rel = mod(q - centre + 0.5 * uL, uL) - 0.5 * uL;
        vec3 wp = centre + rel + uOff;
        vec4 mv = viewMatrix * vec4(wp, 1.0);
        float d = max(1e-3, -mv.z);
        float px = 2.0 * aMove.w / d * projectionMatrix[1][1] * 0.5 * uRes.y;
        float edge = 1.0 - smoothstep(0.3, 0.48, max(abs(rel.x), max(abs(rel.y), abs(rel.z))) / uL);
        vA = edge * smoothstep(0.12, 0.45, d) * min(1.0, px * px / 2.25);
        vSoft = clamp((px - 2.0) / 10.0, 0.0, 1.0);
        vPhase = 0.7 + 1.6 * pow(max(dot(normalize(wp - cameraPosition), uSun), 0.0), 5.0);
        gl_PointSize = max(1.5, px) + 1.0;
        gl_Position = projectionMatrix * mv;
      }`,fragmentShader:`
      uniform vec3 uSunCol, uAmb; uniform float uK;
      varying float vA; varying float vPhase; varying float vSoft;
      void main() {
        float r = length(gl_PointCoord - 0.5) * 2.0;
        float disc = 1.0 - smoothstep(mix(0.45, 0.05, vSoft), 1.0, r);
        vec3 c = (uSunCol * vPhase * 0.55 + uAmb * 0.5) * vec3(0.75, 0.88, 1.0);
        float a = vA * disc * mix(0.6, 0.22, vSoft) * uK;
        if (a < 0.002) discard;
        gl_FragColor = vec4(c * a, a);
      }`,transparent:!0,depthWrite:!1,depthTest:!0,blending:e.CustomBlending,blendSrc:e.OneFactor,blendDst:e.OneMinusSrcAlphaFactor}),y=new e.Points(P,f);y.frustumCulled=!1,y.renderOrder=3;const C=u.add({object:y,dispose(){}});return{set({t:A,k:p,light:F,off:R}){if(f.uniforms.uTime.value=A,f.uniforms.uK.value=p,y.visible=p>.001,R&&f.uniforms.uOff.value.set(R[0],R[1],R[2]),F){f.uniforms.uSun.value.fromArray(F.dir).normalize();const h=F.color,v=Math.max(h[0],h[1],h[2],.001),g=Math.min(1,v);f.uniforms.uSunCol.value.setRGB(h[0]/v*g,h[1]/v*g,h[2]/v*g);const w=F.ambient,T=Math.max(w[0],w[1],w[2],.001);f.uniforms.uAmb.value.setRGB(w[0]/T,w[1]/T,w[2]/T)}},dispose(){u.remove(C),P.dispose(),f.dispose()}}}const ae=new Set(["uPlate","uPlateOn","uPlateMap","uResolution","uPx","uLineScale","uStyle"]);function se(u){const d={};for(const[o,n]of Object.entries(u.light)){if(ae.has(o))continue;const s=n&&n.value;d[o]=s&&typeof s.clone=="function"?s.clone():s}return d}function ce(u,d,o,n){for(const[s,r]of Object.entries(d)){const x=u.light[s],c=o[s];x&&(r&&typeof r.lerpColors=="function"&&c?x.value.lerpColors(r,c,n):r&&r.isVector3&&c||r&&r.isVector2&&c||r&&r.isVector4&&c?x.value.lerpVectors(r,c,n):typeof r=="number"&&typeof c=="number"&&(x.value=r+(c-r)*n))}}function me(u,d){const o=d.look||{},n=Array.isArray(d.sun)?d.sun[0]:d.sun,s=(l,S)=>n&&n[l]!=null?n[l]:o[l]!=null?o[l]:S;u.setSun({dir:n.dir,color:n.color,ambient:n.ambient},{key:s("key",1),rim:s("rim",1),hue:s("hue",.22),shade:s("shade",.76),shadeColor:s("shadeColor",null)});const r=o.haze?Array.isArray(o.haze)?{color:o.haze[0],density:o.haze[1]}:o.haze:null,x=n.hazeColor||r&&r.color||null,c=n.hazeDensity!=null?n.hazeDensity:r&&r.density||0;if((r||n.hazeColor||n.hazeDensity!=null)&&u.setHaze(x,c),o.bounce){const l=Array.isArray(o.bounce)?{color:o.bounce[0],amount:o.bounce[1]}:o.bounce;u.setBounce(l.color,l.amount??.08)}return{dir:n.dir,color:n.color,ambient:n.ambient}}function fe(u,{off:d,bell:o=[0,-42.8,-2]}){const n=new e.Color("#D8CDB4"),s=Array.from({length:6},()=>new e.Vector3),r=new e.ShaderMaterial({uniforms:{...u.light,uTint:{value:n},uGlowP:{value:s.map(b=>b.clone().set(0,-100,0))},uGlowC:{value:s},uK:{value:0}},vertexShader:`
varying vec3 vWorld; varying vec3 vN; varying vec2 vUv;
void main() { vec4 wp = modelMatrix * vec4(position, 1.0); vWorld = wp.xyz; vN = normalize(mat3(modelMatrix) * normal); vUv = uv; gl_Position = projectionMatrix * viewMatrix * wp; }`,fragmentShader:`${X}
${Y}
uniform vec3 uTint; uniform vec3 uGlowP[6]; uniform vec3 uGlowC[6]; uniform float uK;
varying vec3 vWorld; varying vec3 vN; varying vec2 vUv;
void main() {
  vec3 N = normalize(vN); if (!gl_FrontFacing) N = -N;
  vec3 V = normalize(cameraPosition - vWorld);
  float twist = 0.85 + 0.15 * sin((vUv.x * 3.0 + vWorld.y * 160.0) * 6.2832);
  vec3 col = lightPlayer(uTint * twist, N, V, 1.0, 0.2, 0.5, 0.6);
  for (int i = 0; i < 6; i++) { vec3 d = uGlowP[i] - vWorld; float r2 = dot(d, d); col += uGlowC[i] * uTint * max(dot(N, normalize(d)), 0.0) / (1.0 + r2 * 3.0) * 0.8; }
  col = haze(shoulder(col), length(cameraPosition - vWorld));
  gl_FragColor = linearToOutputTexel(vec4(col, 1.0));
  gl_FragColor.a = uK;
}`,transparent:!0,depthWrite:!1}),x=new e.CylinderGeometry(.0055,.0055,44,8,1).translate(0,22,0),c=new e.Mesh(x,r),l=b=>c.position.set(o[0]+b[0],o[1]+.06+b[1],o[2]+b[2]);l(d);const S=u.add({object:c,dispose(){}});return{set({k:b,off:D}){r.uniforms.uK.value=b,c.visible=b>.001,D&&l(D)},dispose(){u.remove(S),x.dispose(),r.dispose()}}}export{fe as createDeepLine,le as createDeepSnow,ie as createSeams,ue as createSpecks,me as deepLight,se as snapLight,ce as writeLight};
