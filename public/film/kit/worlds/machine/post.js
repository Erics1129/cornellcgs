import*as e from"three";const P="out vec2 vUv; void main() { vUv = position.xy * 0.5 + 0.5; gl_Position = vec4(position.xy, 0.0, 1.0); }",_=`
precision highp float;
in vec2 vUv; out vec4 outColor;
uniform sampler2D uColor; uniform sampler2D uDepth; uniform vec2 uSrcTexel;
uniform float uNear, uFar, uFocus, uAperture, uMaxCoc, uEdge;
float linz(float d) { float z = d * 2.0 - 1.0; return 2.0 * uNear * uFar / (uFar + uNear - z * (uFar - uNear)); }
void main() {
  // 4 taps (a 2x2 box), clamped so one bright texel cannot blow a whole disc
  vec3 c = vec3(0.0); float zmin = 1e9; float zs = 0.0; float ws = 0.0; float zw = 0.0;
  for (int i = 0; i < 4; i++) {
    vec2 o = vec2(float(i % 2), float(i / 2)) - 0.5;
    vec2 uv = vUv + o * uSrcTexel;
    vec3 s = texture(uColor, uv).rgb;
    float z = linz(texture(uDepth, uv).r);
    // uEdge: taps that are themselves sharp count little in the half picture the blur is made from
    float w = mix(1.0, 0.04 + min(abs(uAperture * (z - uFocus) / max(z, 1e-3)), 4.0), uEdge);
    c += min(s, vec3(64.0)) * w; ws += w; zw += z * w;
    zmin = min(zmin, z); zs += z;
  }
  c /= ws; float z = mix(zs * 0.25, zw / ws, uEdge);
  float coc = uAperture * (z - uFocus) / max(z, 1e-3);       // thin lens: grows toward the aperture far away, fast near
  coc = clamp(coc, -uMaxCoc, uMaxCoc);
  outColor = vec4(c, coc);
}`,W=`
precision highp float;
in vec2 vUv; out vec4 outColor;
uniform sampler2D uSrc; uniform vec2 uTexel; uniform float uMaxCoc; uniform int uTaps;
float ign(vec2 p) { return fract(52.9829189 * fract(dot(p, vec2(0.06711056, 0.00583715)))); }
void main() {
  vec4 C = texture(uSrc, vUv);
  float cc = abs(C.a);
  float R = uMaxCoc;
  float rot = ign(gl_FragCoord.xy) * 6.2831853;
  vec3 acc = C.rgb / max(cc * cc, 1.0); float wsum = 1.0 / max(cc * cc, 1.0);
  float nearCov = 0.0, nearN = 0.0;
  for (int i = 0; i < 96; i++) {
    if (i >= uTaps) break;
    float fi = float(i) + 0.5;
    float r = sqrt(fi / float(uTaps)) * R;
    float a = fi * 2.39996323 + rot;
    vec2 o = vec2(cos(a), sin(a)) * r;
    vec4 S = texture(uSrc, vUv + o * uTexel);
    float sc = abs(S.a);
    // a tap behind us (farther, positive and larger) may not spread over us more than our own blur
    float cov = S.a > C.a ? min(sc, max(cc, 0.0) + 0.0) : sc;
    if (S.a < 0.0) cov = sc;                      // near field spreads over everything behind it
    float w = clamp(cov - r + 1.0, 0.0, 1.0) / max(sc * sc, 1.0);
    acc += S.rgb * w; wsum += w;
    if (S.a < -1.0) { nearCov += clamp(sc - r + 1.0, 0.0, 1.0); }
    nearN += 1.0;
  }
  outColor = vec4(acc / wsum, clamp(nearCov / max(nearN, 1.0) * 2.5, 0.0, 1.0));
}`,q=`
precision highp float;
in vec2 vUv; out vec4 outColor;
uniform sampler2D uSrc; uniform vec2 uTexel; uniform float uSpread;
void main() {
  vec4 s = vec4(0.0); float w = 0.0;
  for (int y = -1; y <= 1; y++) for (int x = -1; x <= 1; x++) {
    float k = (2.0 - abs(float(x))) * (2.0 - abs(float(y)));
    s += texture(uSrc, vUv + vec2(float(x), float(y)) * uTexel * uSpread) * k; w += k;
  }
  outColor = s / w;
}`,O=`
precision highp float;
in vec2 vUv; out vec4 outColor;
uniform sampler2D uSrc; uniform vec2 uTexel; uniform float uThreshold;
void main() {
  vec3 a = texture(uSrc, vUv + uTexel * vec2(-1, -1)).rgb, b = texture(uSrc, vUv + uTexel * vec2(1, -1)).rgb;
  vec3 c = texture(uSrc, vUv + uTexel * vec2(-1, 1)).rgb, d = texture(uSrc, vUv + uTexel * vec2(1, 1)).rgb;
  vec3 e = texture(uSrc, vUv).rgb;
  vec3 s = (a + b + c + d) * 0.125 + e * 0.5;
  s = min(s, vec3(48.0));
  if (uThreshold > 0.0) { float l = max(s.r, max(s.g, s.b)); s *= max(l - uThreshold, 0.0) / max(l, 1e-4); }
  outColor = vec4(s, 1.0);
}`,H=`
precision highp float;
in vec2 vUv; out vec4 outColor;
uniform sampler2D uSrc; uniform vec2 uTexel;
void main() {
  vec3 s = texture(uSrc, vUv).rgb * 4.0;
  s += texture(uSrc, vUv + uTexel * vec2(1, 0)).rgb * 2.0 + texture(uSrc, vUv - uTexel * vec2(1, 0)).rgb * 2.0;
  s += texture(uSrc, vUv + uTexel * vec2(0, 1)).rgb * 2.0 + texture(uSrc, vUv - uTexel * vec2(0, 1)).rgb * 2.0;
  s += texture(uSrc, vUv + uTexel).rgb + texture(uSrc, vUv - uTexel).rgb + texture(uSrc, vUv + uTexel * vec2(1, -1)).rgb + texture(uSrc, vUv + uTexel * vec2(-1, 1)).rgb;
  outColor = vec4(s / 16.0, 1.0);
}`,j=`
precision highp float;
in vec2 vUv; out vec4 outColor;
uniform sampler2D uColor; uniform sampler2D uDepth; uniform sampler2D uBlur; uniform sampler2D uVeil;
uniform float uNear, uFar, uFocus, uAperture, uMaxCoc, uDof, uExposure, uVeilAmt, uVignette, uSat, uLift, uShoulder, uCa;
uniform vec3 uTint; uniform vec2 uPx;
float linz(float d) { float z = d * 2.0 - 1.0; return 2.0 * uNear * uFar / (uFar + uNear - z * (uFar - uNear)); }
float ign(vec2 p) { return fract(52.9829189 * fract(dot(p, vec2(0.06711056, 0.00583715)))); }
vec3 agxContrast(vec3 x) {
  vec3 x2 = x * x; vec3 x4 = x2 * x2;
  return 15.5 * x4 * x2 - 40.14 * x4 * x + 31.96 * x4 - 6.868 * x2 * x + 0.4298 * x2 + 0.1191 * x - 0.00232;
}
vec3 agx(vec3 v) {
  const mat3 m = mat3(0.842479062253094, 0.0423282422610123, 0.0423756549057051,
                      0.0784335999999992, 0.878468636469772, 0.0784336,
                      0.0792237451477643, 0.0791661274605434, 0.879142973793104);
  const mat3 mi = mat3(1.19687900512017, -0.0528968517574562, -0.0529716355144438,
                       -0.0980208811401368, 1.15190312990417, -0.0980434501171241,
                       -0.0990297440797205, -0.0989611768448433, 1.15107367264116);
  const float lo = -12.47393, hi = 4.026069;
  v = m * max(v, vec3(1e-10));
  v = clamp(log2(v), lo, hi);
  v = (v - lo) / (hi - lo);
  v = agxContrast(v);
  v = mi * v;
  return clamp(v, 0.0, 1.0);
}
vec3 sceneAt(vec2 uv) {
  vec3 c = texture(uColor, uv).rgb;
  if (uDof > 0.5) {
    float z = linz(texture(uDepth, uv).r);
    float coc = abs(clamp(uAperture * (z - uFocus) / max(z, 1e-3), -uMaxCoc, uMaxCoc));
    vec4 b = texture(uBlur, uv);
    float m = max(smoothstep(0.35, 1.6, coc), b.a);
    c = mix(c, b.rgb, m);
  }
  return c;
}
void main() {
  float d = texture(uDepth, vUv).r;
  vec3 c = sceneAt(vUv);
  if (uCa > 0.0) {
    // lateral chromatic aberration of a real lens: red and blue a fraction of a pixel apart, growing to the corners
    vec2 off = (vUv - 0.5) * 2.0 * uCa * uPx;
    c = vec3(sceneAt(vUv + off).r, c.g, sceneAt(vUv - off).b);
  }
  c += texture(uVeil, vUv).rgb * uVeilAmt;
  c *= uExposure * uTint;
  if (uShoulder > 0.0) {
    // highlight roll-off: above the knee the brightness is compressed smoothly (hue kept), so a hot
    // reflection on solder stays a soft bright grey-white with shape, never a flat clipped patch
    float pk = max(c.r, max(c.g, c.b));
    float knee = uShoulder;
    if (pk > knee) { float np = knee + (1.0 - exp(-(pk - knee) / (2.0 * knee))) * 2.0 * knee; c *= np / pk; }
  }
  vec3 t = agx(c);
  float l = dot(t, vec3(0.2126, 0.7152, 0.0722));
  t = mix(vec3(l), t, uSat);
  t = t * (1.0 - uLift) + uLift;                 // the darkest parts are never pure black
  vec2 q = vUv - 0.5; q.x *= 1.25;
  t *= 1.0 - uVignette * smoothstep(0.25, 0.85, dot(q, q) * 2.2);
  t += (ign(gl_FragCoord.xy) - 0.5) / 255.0;
  outColor = vec4(clamp(t, 0.0, 1.0), 1.0);
  gl_FragDepth = d;
}`;function I(u,{quality:S="high"}={}){const D=new e.BufferGeometry;D.setAttribute("position",new e.BufferAttribute(new Float32Array([-1,-1,0,3,-1,0,-1,3,0]),3));const R=new e.OrthographicCamera(-1,1,1,-1,0,1),i=(s,p,C={})=>new e.ShaderMaterial({glslVersion:e.GLSL3,vertexShader:P,fragmentShader:s,uniforms:p,depthTest:!1,depthWrite:!1,blending:e.NoBlending,...C}),k={uNear:{value:.05},uFar:{value:4e3},uFocus:{value:1},uAperture:{value:0},uMaxCoc:{value:8}},v=i(_,{...k,uColor:{value:null},uDepth:{value:null},uSrcTexel:{value:new e.Vector2},uEdge:{value:0}}),m=i(W,{uSrc:{value:null},uTexel:{value:new e.Vector2},uMaxCoc:{value:8},uTaps:{value:S==="low"?32:64}}),l=i(q,{uSrc:{value:null},uTexel:{value:new e.Vector2},uSpread:{value:1.2}}),c=i(O,{uSrc:{value:null},uTexel:{value:new e.Vector2},uThreshold:{value:0}}),h=i(H,{uSrc:{value:null},uTexel:{value:new e.Vector2}},{blending:e.AdditiveBlending,transparent:!0}),f=i(j,{...k,uColor:{value:null},uDepth:{value:null},uBlur:{value:null},uVeil:{value:null},uDof:{value:0},uExposure:{value:1},uVeilAmt:{value:.05},uVignette:{value:.22},uSat:{value:1.08},uLift:{value:.012},uShoulder:{value:0},uCa:{value:0},uPx:{value:new e.Vector2},uTint:{value:new e.Vector3(1,1,1)}},{depthTest:!0,depthWrite:!0,depthFunc:e.AlwaysDepth}),V=new e.Mesh(D,f);V.frustumCulled=!1;const E=new e.Scene;E.add(V);let o=null,d=null,x=null,g=null,n=[];const G=e.HalfFloatType;function B(s,p){const C=S==="low"?.5:1,b=Math.max(2,Math.round(s*C)),M=Math.max(2,Math.round(p*C));if(o&&o.width===b&&o.height===M)return;L(),o=new e.WebGLRenderTarget(b,M,{type:G,samples:S==="low"?0:4,depthTexture:new e.DepthTexture(b,M)}),o.depthTexture.minFilter=o.depthTexture.magFilter=e.NearestFilter;const F=Math.ceil(b/2),U=Math.ceil(M/2),A={type:G,depthBuffer:!1,minFilter:e.LinearFilter,magFilter:e.LinearFilter};d=new e.WebGLRenderTarget(F,U,A),x=new e.WebGLRenderTarget(F,U,A),g=new e.WebGLRenderTarget(F,U,A);let y=F,T=U;for(let z=0;z<4;z++)y=Math.max(1,Math.ceil(y/2)),T=Math.max(1,Math.ceil(T/2)),n.push(new e.WebGLRenderTarget(y,T,A))}function L(){o&&(o.depthTexture.dispose(),o.dispose(),d.dispose(),x.dispose(),g.dispose());for(const s of n)s.dispose();n=[],o=null}function w(s,p){V.material=s,u.setRenderTarget(p),u.render(E,R)}const t={focus:1.2,aperture:0,maxCoc:18,exposure:1,veil:.05,vignette:.22,sat:1.08,lift:.012,tint:[1,1,1],clear:0,shoulder:0,edge:0};return{lens:t,draw(s,p,C){const b=C.bw,M=C.bh;B(b,M);const F=u.toneMapping,U=u.autoClear,A=u.getClearColor(new e.Color),y=u.getClearAlpha();u.toneMapping=e.NoToneMapping,u.autoClear=!1,u.setRenderTarget(o),u.setClearColor(t.clear,1),u.clear(!0,!0,!0),u.render(s,p);const T=o.height/720*.5,z=t.aperture>.01;for(const a of[v.uniforms,f.uniforms])a.uNear.value=p.near,a.uFar.value=p.far,a.uFocus.value=t.focus,a.uAperture.value=t.aperture*T,a.uMaxCoc.value=Math.max(1,t.maxCoc*T);v.uniforms.uColor.value=o.texture,v.uniforms.uDepth.value=o.depthTexture,v.uniforms.uEdge.value=t.edge||0,v.uniforms.uSrcTexel.value.set(1/o.width,1/o.height),w(v,d),z&&(m.uniforms.uSrc.value=d.texture,m.uniforms.uTexel.value.set(1/d.width,1/d.height),m.uniforms.uMaxCoc.value=Math.max(1,t.maxCoc*T),t.taps&&(m.uniforms.uTaps.value=Math.min(96,S==="low"?Math.round(t.taps/2):t.taps)),w(m,x),l.uniforms.uSrc.value=x.texture,l.uniforms.uTexel.value.set(1/x.width,1/x.height),l.uniforms.uSpread.value=1.2,w(l,g),t.smooth&&(l.uniforms.uSrc.value=g.texture,l.uniforms.uSpread.value=1.2+t.smooth,w(l,x),l.uniforms.uSrc.value=x.texture,l.uniforms.uSpread.value=1.2,w(l,g)));let N=z?g:d;c.uniforms.uThreshold.value=.9;for(let a=0;a<n.length;a++)c.uniforms.uSrc.value=N.texture,c.uniforms.uTexel.value.set(1/N.width,1/N.height),w(c,n[a]),N=n[a],c.uniforms.uThreshold.value=0;for(let a=n.length-1;a>0;a--)h.uniforms.uSrc.value=n[a].texture,h.uniforms.uTexel.value.set(1/n[a].width,1/n[a].height),w(h,n[a-1]);const r=f.uniforms;r.uColor.value=o.texture,r.uDepth.value=o.depthTexture,r.uBlur.value=g.texture,r.uVeil.value=n[0].texture,r.uDof.value=z?1:0,r.uExposure.value=t.exposure,r.uVeilAmt.value=t.veil,r.uVignette.value=t.vignette,r.uSat.value=t.sat,r.uLift.value=t.lift,r.uTint.value.fromArray(t.tint),r.uShoulder.value=t.shoulder||0,r.uCa.value=t.ca||0,r.uPx.value.set(1/o.width,1/o.height),V.material=f,u.setRenderTarget(null),u.render(E,R),u.setClearColor(A,y),u.toneMapping=F,u.autoClear=U,u.setRenderTarget(null)},stats(){return{passes:4+(t.aperture>.01?2+(t.smooth?2:0):0)+n.length*2-1}},dispose(){L(),D.dispose();for(const s of[v,m,l,c,h,f])s.dispose()}}}function J(u,S,{background:D=328707,size:R=256}={}){const i=new e.Scene;i.background=new e.Color(D);const k=new e.PlaneGeometry(1,1),v=[];for(const c of S){const h=new e.MeshBasicMaterial({color:new e.Color(...c.color),side:e.DoubleSide});v.push(h);const f=new e.Mesh(k,h);f.position.fromArray(c.p),f.scale.set(c.size[0],c.size[1],1),f.lookAt(0,0,0),i.add(f)}const m=new e.PMREMGenerator(u),l=m.fromScene(i,.02,.1,100,{size:R});m.dispose(),k.dispose();for(const c of v)c.dispose();return l}export{I as createPost,J as studioEnvironment};
