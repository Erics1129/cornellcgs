import*as a from"three";import{GLSL_COMMON as g,GLSL_FRAG as F}from"../../kit/actors/core.js";const i=(()=>{const m=[.94,-.34],v=Math.hypot(m[0],m[1]);return[m[0]/v,m[1]/v]})(),U=`
uniform float uTime; uniform vec3 uRoot; uniform vec2 uCur; uniform float uLen; uniform float uAppear;
// the stipe's centre at arc length s (m from its root): it rises, leans a little downstream, and sways on the
// forest's slow travelling wave (the same 9 s period), more toward the top
vec3 stipeAt(float s) {
  float k = s / uLen;
  float wave = sin(uTime * 0.7 - s * 0.21 + 0.9) * 0.16 * k * k + sin(uTime * 0.37 + s * 0.13) * 0.07 * k;
  vec3 p = uRoot + vec3(0.0, s, 0.0);
  p.xz += uCur * (0.22 * k * k + wave);
  p.xz += vec2(-uCur.y, uCur.x) * 0.05 * sin(s * 0.6 + uTime * 0.31) * k;
  // a young stipe is never straight: a slow S along its length
  p.xz += vec2(-uCur.y, uCur.x) * 0.09 * sin(s * 0.75 + 0.6) + uCur * 0.05 * sin(s * 1.3 + 2.0);
  return p;
}
`;function J(m,v={}){const w=new a.Vector3(...v.root),f=v.length||9,G=v.from??4.5,I=v.to??f,d=[];{let e=G,t=7;const o=()=>(t=t*16807%2147483647,(t-1)/2147483646);for(;e<I&&d.length<40;)d.push({s:e,side:d.length%2?1:-1,len:.42+.26*o(),w:.07+.03*o(),tw:o(),r:.014+.005*o()}),e+=.2+.09*o()}const p=d.length,b={...m.light,uAppear:{value:1},uTime:{value:0},uRoot:{value:w},uCur:{value:new a.Vector2(...i)},uLen:{value:f}},B=90,y=8,W=[],E=[];for(let e=0;e<=B;e++)for(let t=0;t<=y;t++)W.push(e/B*f,t/y*Math.PI*2,0),E.push(e/B);const k=[];for(let e=0;e<B;e++)for(let t=0;t<y;t++){const o=e*(y+1)+t,r=o+y+1;k.push(o,r,o+1,o+1,r,r+1)}const h=new a.BufferGeometry;h.setAttribute("position",new a.Float32BufferAttribute(W,3)),h.setIndex(k),h.boundingSphere=new a.Sphere(w.clone().add(new a.Vector3(0,f/2,0)),f);const O=`${g}${U}
  varying vec3 vW; varying vec3 vN; varying float vS;
  void main() {
    float s = position.x, a = position.y;
    vec3 c = stipeAt(s), t = normalize(stipeAt(s + 0.05) - stipeAt(s - 0.05));
    vec3 b1 = normalize(cross(t, vec3(0.0, 0.0, 1.0))), b2 = cross(t, b1);
    float r = mix(0.011, 0.006, s / uLen) * (1.0 + 0.12 * sin(s * 9.0)) * uAppear;
    vN = cos(a) * b1 + sin(a) * b2;
    vec3 p = c + vN * r;
    vW = p; vS = s;
    gl_Position = projectionMatrix * viewMatrix * vec4(p, 1.0);
  }`,R=`${g}${F}
  varying vec3 vW; varying vec3 vN; varying float vS;
  void main() {
    vec3 V = normalize(cameraPosition - vW), N = normalize(vN);
    // olive brown, darker in old bands, a faint sheen of wet down one side
    vec3 base = vec3(0.11, 0.07, 0.022) * (0.8 + 0.4 * vnoise(vec3(vS * 14.0, 0.0, 0.0)));
    vec3 col = lightPlayer(base, N, V, 1.0, 0.4, 0.5, 0.08);
    col += base * uKeyTint * pow(clamp(dot(-V, uKeyDir), 0.0, 1.0), 2.0) * 0.9;
    col += uKeyTint * 0.05 * pow(clamp(dot(N, normalize(uKeyDir + V)), 0.0, 1.0), 24.0);
    col = haze(shoulder(col), length(cameraPosition - vW));
    gl_FragColor = linearToOutputTexel(vec4(col, 1.0));
  }`,V=new a.ShaderMaterial({vertexShader:O,fragmentShader:R,uniforms:b}),P=new a.Mesh(h,V);P.frustumCulled=!1;const z=new a.SphereGeometry(1,18,12),c=new a.InstancedBufferGeometry;c.index=z.index,c.setAttribute("position",z.getAttribute("position")),c.setAttribute("normal",z.getAttribute("normal"));const x=new a.InstancedBufferAttribute(new Float32Array(p*4),4);x.setUsage(a.DynamicDrawUsage),c.setAttribute("aF",x),c.instanceCount=p,c.boundingSphere=h.boundingSphere;const j=`${g}${U}
  attribute vec4 aF; varying vec3 vW; varying vec3 vN; varying float vK;
  void main() {
    float s = aF.x, side = aF.y, r = aF.z * aF.w;
    vec3 c = stipeAt(s), t = normalize(stipeAt(s + 0.05) - stipeAt(s - 0.05));
    vec3 out_ = normalize(vec3(uCur.x, 0.0, uCur.y) * 0.8 + vec3(-uCur.y, 0.0, uCur.x) * side * 0.6);
    // a bulb just off the stipe, a little pear-shaped along the stipe, its stalk toward the stipe
    vec3 o = c + out_ * (0.012 + r * 0.9) + t * r * 0.3;
    vec3 n = normal;
    vec3 p = position * vec3(r, r * 1.25, r);
    vW = o + p; vN = n; vK = aF.w;
    gl_Position = projectionMatrix * viewMatrix * vec4(vW, 1.0);
  }`,Y=`${g}${F}
  varying vec3 vW; varying vec3 vN; varying float vK;
  void main() {
    vec3 V = normalize(cameraPosition - vW), N = normalize(vN);
    // gas inside a thin golden skin: light passes through it (brightest at the rim and toward the sun), a wet highlight
    vec3 skin = vec3(0.55, 0.34, 0.08);
    float rim = pow(1.0 - clamp(dot(N, V), 0.0, 1.0), 2.2);
    float back = pow(clamp(dot(-V, uKeyDir), 0.0, 1.0), 1.4);
    vec3 col = lightPlayer(skin, N, V, 1.0, 1.0, 0.5, 0.8) * 0.7;
    col += skin * uKeyTint * (0.35 + 1.2 * back) * (0.4 + rim);
    vec3 H = normalize(uKeyDir + V);
    col += uKeyTint * pow(clamp(dot(N, H), 0.0, 1.0), 60.0) * 0.9;
    col = haze(shoulder(col), length(cameraPosition - vW));
    gl_FragColor = linearToOutputTexel(vec4(col, 1.0));
  }`,_=new a.ShaderMaterial({vertexShader:j,fragmentShader:Y,uniforms:b}),D=new a.Mesh(c,_);D.frustumCulled=!1;const C=16,K=[];for(let e=0;e<=C;e++)for(const t of[-1,1])K.push(e/C,t,0);const L=[];for(let e=0;e<C;e++){const t=e*2;L.push(t,t+2,t+1,t+1,t+2,t+3)}const A=new a.BufferGeometry;A.setAttribute("position",new a.Float32BufferAttribute(K,3)),A.setIndex(L);const l=new a.InstancedBufferGeometry;l.index=A.index,l.setAttribute("position",A.getAttribute("position"));const N=new a.InstancedBufferAttribute(new Float32Array(p*4),4),S=new a.InstancedBufferAttribute(new Float32Array(p*4),4);N.setUsage(a.DynamicDrawUsage),S.setUsage(a.DynamicDrawUsage),l.setAttribute("aB",N),l.setAttribute("aB2",S),l.instanceCount=p,l.boundingSphere=h.boundingSphere;const Z=`${g}${U}
  attribute vec4 aB; attribute vec4 aB2; varying vec3 vW; varying vec3 vN; varying vec2 vUv; varying float vSeed;
  void main() {
    float s = aB.x, side = aB.y, len = aB.z * aB2.z, w = aB.w * min(1.0, aB2.z * 1.2);
    float u = position.x, v = position.y;
    vec3 c = stipeAt(s), t = normalize(stipeAt(s + 0.05) - stipeAt(s - 0.05));
    vec3 cur = vec3(uCur.x, 0.0, uCur.y), acr = vec3(-uCur.y, 0.0, uCur.x) * side;
    // the blade leaves its float out to the side, streams downstream and a little up, flutters
    float fl = sin(uTime * 1.3 + u * 5.0 + aB2.y * 6.28) * 0.06 * u;
    vec3 dir = normalize(cur * 0.8 + acr * 0.35 + t * (0.45 - 0.25 * u) + vec3(0.0, fl, 0.0));
    vec3 o = c + (cur * 0.8 + acr * 0.6) * 0.03;
    vec3 along = o + dir * (u * len) + (acr * (0.05 * u * u) + t * (0.04 * sin(u * 3.0 + aB2.y * 4.0))) * aB2.z;
    vec3 n0 = normalize(cross(dir, t + vec3(0.0001)));
    // the width: narrow at the base, widest past the middle, a rounded tip; turned along its length
    float hw = w * 0.5 * smoothstep(0.0, 0.22, u) * (1.0 - smoothstep(0.82, 1.0, u) * 0.85);
    float tw = aB2.x * 1.2 * u + sin(uTime * 0.9 + aB2.y * 9.0 + u * 3.0) * 0.25 * u;
    vec3 wd = normalize(cos(tw) * t + sin(tw) * n0);
    // the ruffled margin: a ripple along the edge only
    vec3 nn = normalize(cross(dir, wd));
    float ruf = v * v * hw * 0.5 * sin(u * 34.0 + aB2.y * 20.0 + uTime * 1.4) * smoothstep(0.05, 0.3, u);
    vec3 p = along + wd * (v * hw) + nn * ruf;
    vW = p; vN = nn; vUv = vec2(u, v); vSeed = aB2.y;
    gl_Position = projectionMatrix * viewMatrix * vec4(p, 1.0);
  }`,H=`${g}${F}
  varying vec3 vW; varying vec3 vN; varying vec2 vUv; varying float vSeed;
  void main() {
    vec3 V = normalize(cameraPosition - vW), N = normalize(vN);
    if (dot(N, V) < 0.0) N = -N;
    // golden brown, olive toward the base, blotched; a faint midrib; corrugations across
    float bl = fbm(vec3(vUv.x * 9.0, vUv.y * 2.5, vSeed * 13.0));
    vec3 base = mix(vec3(0.24, 0.13, 0.025), vec3(0.42, 0.25, 0.05), smoothstep(0.0, 0.7, vUv.x)) * (0.78 + 0.44 * bl);
    float corr = 0.5 + 0.5 * sin(vUv.x * 70.0 + vUv.y * 2.0);
    base *= 0.92 + 0.12 * corr;
    base *= 1.0 - 0.18 * (1.0 - smoothstep(0.0, 0.12, abs(vUv.y)));
    vec3 col = lightPlayer(base, N, V, 1.0, 1.0, bl, 0.5);
    // light through the blade: amber where the sun is behind it (the forest's gold)
    float back = pow(clamp(dot(-V, uKeyDir), 0.0, 1.0), 1.3);
    col += vec3(1.0, 0.58, 0.12) * uKeyTint * (0.18 + back) * (0.35 + 0.65 * bl) * 0.8;
    // the thin margin lets more light through
    col += vec3(0.9, 0.6, 0.2) * uKeyTint * back * smoothstep(0.7, 1.0, abs(vUv.y)) * 0.25;
    col = haze(shoulder(col), length(cameraPosition - vW));
    gl_FragColor = linearToOutputTexel(vec4(col, 1.0));
  }`,T=new a.ShaderMaterial({vertexShader:Z,fragmentShader:H,uniforms:b,side:a.DoubleSide});T.extensions={derivatives:!0};const $=new a.Mesh(l,T);$.frustumCulled=!1;const M=new a.Group;M.add(P,D,$),d.forEach((e,t)=>{x.setXYZW(t,e.s,e.side,e.r,1),N.setXYZW(t,e.s,e.side,e.len,e.w),S.setXYZW(t,(e.tw-.5)*2,e.tw,1,0)});const X=(e,t)=>{const o=e/f,r=Math.sin(t*.7-e*.21+.9)*.16*o*o+Math.sin(t*.37+e*.13)*.07*o,s=[w.x,w.y+e,w.z];s[0]+=i[0]*(.22*o*o+r),s[2]+=i[1]*(.22*o*o+r);const n=.05*Math.sin(e*.6+t*.31)*o+.09*Math.sin(e*.75+.6);s[0]+=-i[1]*n,s[2]+=i[0]*n;const u=.05*Math.sin(e*1.3+2);return s[0]+=i[0]*u,s[2]+=i[1]*u,s};return{object:M,count:p,floats:d,set({t:e=0,formed:t=null,blades:o=1,visible:r=!0,appear:s=1}={}){M.visible=r&&s>.001,b.uTime.value=e,b.uAppear.value=s;for(let n=0;n<p;n++){const u=t?t[n]:1;x.setW(n,Math.max(0,u)),S.setZ(n,Math.max(.001,o*Math.min(1,u*1.4)))}x.needsUpdate=!0,S.needsUpdate=!0},floatAt(e,t){const o=d[e],r=o.s,s=X(r,t),n=[i[0]*.8+-i[1]*o.side*.6,0,i[1]*.8+i[0]*o.side*.6],u=Math.hypot(n[0],n[2]);return[s[0]+n[0]/u*(.012+o.r*.9),s[1]+o.r*.3,s[2]+n[2]/u*(.012+o.r*.9)]},update(){},dispose(){h.dispose(),z.dispose(),c.dispose(),A.dispose(),l.dispose(),V.dispose(),_.dispose(),T.dispose()}}}export{J as createYoungKelp};
