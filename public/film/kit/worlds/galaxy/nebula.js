import*as e from"three";import{loadTexture as W,GLSL_FINISH as ot,FULL_VERT as at,fullScreenTriangle as rt,noseQuat as st}from"./common.js";import{flight as nt}from"./shots/nebula.js";const u={D0:150,width:340,aspect:14575/8441,near:72,ridge:96,far:460,stars:82,back:138},w={ridge:[.4481,.6224],big:[.406,.8035],upper:[.3645,.8902],right:[.8713,.758],low:[.2114,.1762],mid:[.757,.6867]},j=(i,M,D)=>{const d=Math.min(1,Math.max(0,(D-i)/(M-i)));return d*d*(3-2*d)},B=Math.PI/180;async function gt(i,M,{quality:D}){const d=rt(),v={uInvProj:{value:new e.Matrix4},uCamRot:{value:new e.Matrix3},uCamPos:{value:new e.Vector3},uImg:{value:null},uSize:{value:new e.Vector2(u.width,u.width/u.aspect)},uD:{value:new e.Vector4(u.near,u.ridge,u.far,u.stars)},uBack:{value:u.back},uD0:{value:u.D0},uIter:{value:D==="low"?3:6},uLift:{value:0}},V=new e.RawShaderMaterial({glslVersion:e.GLSL3,vertexShader:at,fragmentShader:vt,uniforms:v,depthTest:!1,depthWrite:!1,blending:e.NoBlending}),F=new e.Mesh(d,V);F.frustumCulled=!1;const S=new e.Scene;S.add(F);const T=new e.OrthographicCamera(-1,1,1,-1,0,1),I=[],b=await W(M,"cosmic-cliffs-1024.jpg");b.wrapS=e.ClampToEdgeWrapping,I.push(b),v.uImg.value=b;let L=!1;const C=W(M,"cosmic-cliffs-4096.jpg").then(t=>{if(L){t.dispose();return}t.wrapS=e.ClampToEdgeWrapping,I.push(t),i.renderer.initTexture(t),v.uImg.value=t}).catch(t=>console.warn("galaxy nebula: full-size image failed",t));function k(t,s,n){s.updateMatrixWorld(),v.uInvProj.value.copy(s.projectionMatrixInverse),v.uCamRot.value.setFromMatrix4(s.matrixWorld),v.uCamPos.value.copy(s.position),t.render(S,T)}const A=(t,s,n=u.D0)=>new e.Vector3((t-.5)*u.width,(s-.5)*u.width/u.aspect,-u.D0).multiplyScalar(n/u.D0),o=14,l=2,a=240,r=t=>(11-22*j(.22,.78,t))*B,h=[];{let t=0,s=l;for(let n=0;n<=a;n++){const f=n/a;h.push([t,s]);const c=r(f+.5/a);t-=Math.sin(c)*o/a,s-=Math.cos(c)*o/a}}const x=t=>{const s=Math.min(a,Math.max(0,t*a)),n=Math.min(a-1,Math.floor(s)),f=s-n,c=h[n],R=h[n+1],G=t<0?t*a:t>1?(t-1)*a:0,y=r(Math.min(1,Math.max(0,t)));return[c[0]+(R[0]-c[0])*f-Math.sin(y)*o/a*G,c[1]+(R[1]-c[1])*f-Math.cos(y)*o/a*G]},p=t=>{const[s,n]=x(t);return new e.Vector3(s+.35,-.45+.8*t+.05*Math.sin(2*Math.PI*1.1*t+.4),n)},g=t=>{const n=(r(t+.01)-r(t-.01))/.02;return Math.max(-.62,Math.min(.62,n*.95))+.04*Math.sin(2*Math.PI*.9*t)},z=t=>{const s=r(t),n=new e.Vector3(-Math.sin(s),Math.tan(11*B),-Math.cos(s));return st(n,g(t))},m=40,O=3.3,_=17*B,Q=t=>{const n=p(t-.03),f=r(t-.03),c=(-24+46*j(.08,.92,t))*B,R=new e.Vector3(Math.sin(f),0,Math.cos(f)),G=new e.Vector3(Math.cos(f),0,-Math.sin(f)),y=R.multiplyScalar(Math.cos(c)).add(G.multiplyScalar(Math.sin(c))).multiplyScalar(O*Math.cos(_));return n.add(y).add(new e.Vector3(0,O*Math.sin(_),0))},H=new e.Euler(0,0,0,"YXZ");function ht(t,s,n,f=16/9){const c=n.clone().sub(s),R=Math.atan2(-c.x,-c.z),G=Math.atan2(c.y,Math.hypot(c.x,c.z)),y=Math.tan(m*B/2),J=y*f,K=1-2*j(.2,.8,t),tt=R+Math.atan(J/3)*K*.92,et=G+Math.atan(y/3);return new e.Quaternion().setFromEuler(H.set(et,tt,-g(t-.02)*.14))}function E(t){return nt(t,(i.width||16)/(i.height||9))}const Z={start:E(0).hero.p,mid:E(.5).hero.p,end:E(1).hero.p,ridge:A(.46,.66,u.ridge).toArray(),cavity:A(.55,.85,u.far).toArray(),star:A(w.ridge[0],w.ridge[1],u.stars).toArray()},X=p(.5),U=A(w.ridge[0],w.ridge[1],u.stars).sub(X).normalize();U.y+=.42,U.normalize();const N={dir:U.toArray(),color:[1,.92,.82],ambient:[.3,.36,.62],haze:null};i.setSun({dir:N.dir,color:N.color,ambient:N.ambient},{key:.8,rim:1.6,hue:.34,shadeColor:[.36,.42,.64]}),i.setBounce([1,.5,.15],.62),i.setHaze([0,0,0],0),i.setGround(null),i.groundY=-1e6;const P=ut(v.uImg,{heroAt:p,camAt:Q}),Y=i.add({object:P.group,dispose:()=>P.dispose()});let q=1;function $(t){q=t===!1?0:t===!0?1:Math.max(0,Math.min(1,Number(t)||0)),P.setAmount(q)}return{draw:k,flight:E,anchors:Z,ready:C,light:N,setForeground:$,setTime(){},setQuality(t){v.uIter.value=t==="low"?3:6},dispose(){L=!0,i.remove(Y),P.dispose();for(const t of I)t.dispose();d.dispose(),V.dispose()}}}function ut(i,{heroAt:M,camAt:D}){const d=new e.Group;d.renderOrder=10;const v=new e.PlaneGeometry(1,1),V=[],F={value:1},S=(o,l,a)=>{const r=new e.RawShaderMaterial({glslVersion:e.GLSL3,vertexShader:ct,fragmentShader:it+o,uniforms:{uImg:i,uAmount:F,uScale:{value:new e.Vector2(1,1)},uRect:{value:new e.Vector4},uLod:{value:1},uGain:{value:1},uNear:{value:new e.Vector2(.9,1.7)},...l},transparent:!0,depthWrite:!1,depthTest:!0,...a});return V.push(r),r},T={blending:e.AdditiveBlending},I={blending:e.CustomBlending,blendSrc:e.OneFactor,blendDst:e.OneMinusSrcAlphaFactor,blendSrcAlpha:e.OneFactor,blendDstAlpha:e.OneMinusSrcAlphaFactor},b=(o,l,a)=>{const r=new e.Mesh(v,o);return r.position.copy(l),r.frustumCulled=!1,r.renderOrder=a,d.add(r),r},L=(o,l,a,r)=>{const h=D(o),x=M(o),p=x.clone().sub(h).normalize(),g=new e.Vector3().crossVectors(p,new e.Vector3(0,1,0)).normalize(),z=new e.Vector3().crossVectors(g,p);return h.clone().add(x.sub(h).multiplyScalar(l)).add(g.multiplyScalar(a)).add(z.multiplyScalar(r))},C=14575/8441,k=[[w.big,.1,.62,-1.05,.62,.3,1.4,1.25],[w.right,.3,.55,1.15,.8,.24,1.6,1.1],[w.upper,.52,.6,-1.2,.95,.28,1.5,1.2],[w.low,.7,.5,1,-.55,.22,1.8,1],[w.big,.86,.58,-.95,.7,.26,1.5,1.15],[w.mid,.98,.7,1.3,.55,.2,1.4,1]];for(const[o,l,a,r,h,x,p,g]of k){const m=S(lt,{},T);m.uniforms.uRect.value.set(o[0],o[1],.034,.034*C),m.uniforms.uScale.value.set(x,x),m.uniforms.uLod.value=p,m.uniforms.uGain.value=g,b(m,L(l,a,r,h),12)}const A=[[.33,.5,.07,.16,.82,.15,.05,1.4,.85],[.56,.47,.08,.5,.8,-.25,.1,1.6,.8],[.8,.55,.07,.68,.85,.2,.05,1.4,.85],[.25,.62,.06,.92,.82,-.15,.2,1.4,.75]];for(const[o,l,a,r,h,x,p,g,z]of A){const m=S(mt,{},I);m.uniforms.uRect.value.set(o,l,a,a*C),m.uniforms.uScale.value.set(g,g),m.uniforms.uLod.value=2.6,m.uniforms.uGain.value=z,m.uniforms.uNear.value.set(.6,1.5),b(m,L(r,h,x,p),11)}{const o=S(dt,{},I),l=.085;o.uniforms.uRect.value.set(.745,.585,l,l*C),o.uniforms.uScale.value.set(1.5,1.5),o.uniforms.uLod.value=2.2,o.uniforms.uGain.value=1,o.uniforms.uNear.value.set(1.5,2.3),b(o,L(.36,.8,-.25,-.4),13)}return{group:d,setAmount(o){F.value=o,d.visible=o>0},dispose(){v.dispose();for(const o of V)o.dispose()}}}const ct=`
in vec3 position;
in vec2 uv;
uniform mat4 modelViewMatrix;
uniform mat4 projectionMatrix;
uniform vec2 uScale;
uniform vec2 uNear;
out vec2 vUv;
out float vFade;
void main() {
  vUv = uv;
  vec4 mv = modelViewMatrix * vec4(0.0, 0.0, 0.0, 1.0);
  vFade = smoothstep(uNear.x, uNear.y, -mv.z);
  mv.xy += position.xy * 2.0 * uScale;
  gl_Position = projectionMatrix * mv;
}
`,it=`
precision highp float;
in vec2 vUv;
in float vFade;
out vec4 outColor;
uniform sampler2D uImg;
uniform vec4 uRect;
uniform float uLod;
uniform float uGain;
uniform float uAmount;
vec2 cropUv() { return uRect.xy + (vUv * 2.0 - 1.0) * uRect.zw; }
`,lt=`
void main() {
  vec2 q = vUv * 2.0 - 1.0;
  vec2 uv = cropUv();
  vec3 a = textureLod(uImg, uv, uLod).rgb;
  vec3 b = textureLod(uImg, uv, uLod + 3.2).rgb;
  vec3 h = textureLod(uImg, uv, uLod + 1.6).rgb;
  vec3 hp = max(a - b * 1.08, 0.0);
  vec3 halo = max(h - b * 1.02, 0.0);
  float r = length(q);
  float m = 1.0 - smoothstep(0.45, 0.98, r);
  vec3 c = hp * 1.9 + halo * 1.4 * exp(-r * r * 9.0);
  c = mix(vec3(dot(c, vec3(0.3, 0.55, 0.15))), c, 0.75);        // starlight, less of the nebula's tint
  outColor = vec4(c * m * uGain * vFade * uAmount, 1.0);
}
`,mt=`
void main() {
  vec2 q = vUv * 2.0 - 1.0;
  vec2 uv = cropUv();
  vec3 a = textureLod(uImg, uv, uLod).rgb;
  vec3 b = textureLod(uImg, uv, uLod + 2.5).rgb;
  float y = dot(a, vec3(0.3, 0.55, 0.15)), yb = dot(b, vec3(0.3, 0.55, 0.15));
  float wisp = smoothstep(0.015, 0.13, y - yb * 0.95);
  vec3 big = textureLod(uImg, uRect.xy + (vUv.yx * 2.0 - 1.0) * uRect.zw * 1.7, 5.0).rgb;
  wisp *= smoothstep(0.18, 0.5, dot(big, vec3(0.3, 0.55, 0.15)));
  float r = length(q * vec2(0.7, 1.6));
  float edge = 1.0 - smoothstep(0.1, 0.9, r);
  wisp *= wisp;
  float al = clamp(wisp, 0.0, 1.0) * edge * uGain * vFade * uAmount;
  outColor = vec4(a * 1.05 * al, al);
}
`,dt=`
void main() {
  vec2 q = vUv * 2.0 - 1.0;
  vec2 uv = cropUv();
  vec3 a = textureLod(uImg, uv, uLod).rgb;
  vec3 c = textureLod(uImg, uv, uLod + 1.5).rgb;
  float dust = (c.r - c.b) * 2.6 + 0.12;
  float al = smoothstep(0.18, 0.55, dust);
  float side = 1.0 - smoothstep(0.35, 0.95, abs(q.x));
  float bottom = smoothstep(-1.0, -0.45, q.y);
  al *= side * bottom * vFade * uAmount;
  vec3 col = a * mix(0.42, 0.75, smoothstep(0.35, 0.75, dot(a, vec3(0.3, 0.55, 0.15))));
  outColor = vec4(col * al, al);
}
`,vt=`
precision highp float;
in vec2 vNdc;
out vec4 outColor;
uniform mat4 uInvProj;
uniform mat3 uCamRot;
uniform vec3 uCamPos;
uniform sampler2D uImg;
uniform vec2 uSize;
uniform vec4 uD;
uniform float uBack;
uniform float uD0;
uniform int uIter;
${ot}
vec2 uvAt(vec3 rd, float d) {
  float t = (uCamPos.z + d) / max(-rd.z, 1e-3);
  vec2 x = uCamPos.xy + rd.xy * t;
  return x * (uD0 / d) / uSize + 0.5;
}
// layers: the cavity far (uD.z), the dark dust deep in the wall (uBack), the lit dust forward of it (uD.y),
// the foot of the cliffs nearest (uD.x)
float depthAt(vec2 uv) {
  vec3 c = fromSRGB(textureLod(uImg, uv, 6.5).rgb);
  vec3 c2 = fromSRGB(textureLod(uImg, uv, 3.5).rgb);
  float dust = clamp((c.r - c.b) * 3.0 + 0.35, 0.0, 1.0);
  float lit = clamp(dot(c2, vec3(0.3, 0.55, 0.15)) * 3.0, 0.0, 1.0);
  float low = smoothstep(0.60, 0.10, uv.y);
  float dd = mix(uBack, uD.y, lit);
  dd = mix(dd, uD.x, low * 0.9);
  return mix(uD.z, dd, smoothstep(0.15, 0.75, dust));
}
void main() {
  vec4 v4 = uInvProj * vec4(vNdc, 1.0, 1.0);
  vec3 rd = normalize(uCamRot * (v4.xyz / v4.w));
  float d = uD0;
  vec2 uv = uvAt(rd, d);
  for (int i = 0; i < 8; i++) {
    if (i >= uIter) break;
    float dn = depthAt(uv);
    d = mix(d, dn, 0.7);
    uv = uvAt(rd, d);
  }
  vec3 base = fromSRGB(texture(uImg, uv).rgb);
  vec3 low = fromSRGB(textureLod(uImg, uv, 2.2).rgb);
  // the stars: what stands far above its own neighbourhood. Lift them off the wall, onto the near layer
  vec3 hp = max(base - low * 1.12, 0.0);
  float sm = smoothstep(0.05, 0.22, dot(hp, vec3(0.3, 0.5, 0.2)));
  vec3 wall = base - hp * sm;
  // the lens: the far blue field the slightest bit softer than the near crest
  float farness = smoothstep(160.0, 420.0, d);
  vec3 soft = fromSRGB(textureLod(uImg, uv, 1.6).rgb);
  wall = mix(wall, soft - max(soft - low * 1.12, 0.0) * sm, farness * 0.75);
  vec2 us = uvAt(rd, uD.w);
  vec3 bs = fromSRGB(texture(uImg, us).rgb);
  vec3 ls = fromSRGB(textureLod(uImg, us, 2.2).rgb);
  vec3 hs = max(bs - ls * 1.12, 0.0);
  float ss = smoothstep(0.05, 0.22, dot(hs, vec3(0.3, 0.5, 0.2)));
  // a gentle bloom round the brightest stars (as the photograph's own optics have)
  vec3 g1 = fromSRGB(textureLod(uImg, us, 4.2).rgb), g2 = fromSRGB(textureLod(uImg, us, 6.8).rgb);
  vec3 glow = max(g1 - g2 * 1.15, 0.0);
  vec3 col = wall + hs * ss + glow * 0.22;
  // outside the photograph: the deep blue of its own sky
  vec2 m = smoothstep(vec2(0.0), vec2(0.01), uv) * smoothstep(vec2(0.0), vec2(0.01), 1.0 - uv);
  col = mix(vec3(0.004, 0.008, 0.02), col, m.x * m.y);
  // the photograph is display-referred already: a gentle filmic lift, no clipping, no pure black
  col = max(col, vec3(0.0012, 0.0016, 0.0035));
  vec3 outc = toSRGB(col / (1.0 + col * 0.06) * 1.03) + dither(gl_FragCoord.xy);
  outColor = vec4(outc, 1.0);
}
`;export{u as NEB,gt as createNebula};
