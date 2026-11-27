import*as o from"three";import{RoundedBoxGeometry as E0}from"three/addons/geometries/RoundedBoxGeometry.js";import{mergeGeometries as O}from"three/addons/utils/BufferGeometryUtils.js";import{GLSL_COMMON as c0,GLSL_FRAG as b0,lin as O0}from"../../kit/actors/core.js";import{BAYS as Q,BAY_W as W,POST as _,PITCH as D0,LEN as Y,GLASS as v,RAIL_LO as G,HEAD as q,CAP as F,DEPTH as S,CARD as h,CARD_Y as i0,bayX as K}from"./measures.js";const Q0=`
${c0}
varying vec3 vWorld; varying vec3 vN; varying vec3 vLocal; varying vec2 vUv;
void main() {
  vec4 wp = modelMatrix * vec4(position, 1.0);
  vWorld = wp.xyz; vLocal = position; vUv = uv;
  vN = normalize(mat3(modelMatrix) * normal);
  gl_Position = projectionMatrix * viewMatrix * wp;
}`,_0=`
uniform vec3 uSkyTop; uniform vec3 uDeck;
vec3 skyAt(vec3 R) {
  float y = R.y;
  vec3 hor = uHazeColor;
  vec3 mid = mix(hor, uSkyTop, 0.55);
  vec3 up = y < 0.12 ? mix(hor, mid, smoothstep(0.0, 0.12, y)) : mix(mid, uSkyTop, smoothstep(0.12, 0.6, y));
  vec3 down = mix(hor, uDeck, smoothstep(0.0, -0.06, y));
  vec3 c = y >= 0.0 ? up : down;
  // the far towers standing on the horizon: dark slabs in the warm band
  float az = atan(R.x, -R.z);
  float tw = step(0.64, vnoise(vec3(az * 11.0, 0.5, 0.5))) * (1.0 - smoothstep(0.015, 0.07 + 0.05 * vnoise(vec3(az * 7.0, 2.0, 0.0)), y)) * step(-0.004, y);
  c = mix(c, c * vec3(0.45, 0.5, 0.62), tw * 0.8);
  float s = max(dot(R, uKeyDir), 0.0);
  c += uKeyTint * (0.5 * pow(s, 8.0) + 3.0 * pow(s, 90.0));
  return c;
}
// what a surface at P reflects along R: the terrace tower's glass facade behind the viewer (south), with its
// planted strip and benches, the stone floor below, else the sky
vec3 envAt(vec3 R, vec3 P) {
  if (R.z > 0.08) {
    float t = (-548.0 - P.z) / R.z;
    float hy = P.y + R.y * t - 124.0;
    float hx = P.x + R.x * t;
    if (hy > 0.62 && hy < 140.0) {
      vec3 g = mix(uSkyTop * 0.75 + uHazeColor * 0.12, uHazeColor * 0.55, smoothstep(30.0, 0.0, hy));
      float band = 1.0 - smoothstep(0.0, 0.18, abs(fract(hy / 4.0) - 0.04) * 4.0);
      float mull = 1.0 - smoothstep(0.0, 0.05, abs(fract(hx / 1.5) - 0.5) * 1.5 - 0.7);
      g = mix(g, uHazeColor * 0.9, band * 0.6);
      g *= 1.0 - 0.25 * mull;
      return g;
    }
    if (hy > 0.0 && hy <= 0.62) return mix(vec3(0.05, 0.06, 0.035), uDeck * 0.35, step(0.58, hy));
  }
  return skyAt(R);
}`,W0=`
${c0}
${b0}
${_0}
uniform vec3 uBase; uniform sampler2D uMap; uniform float uHasMap; uniform float uAlong; uniform float uWorn;
varying vec3 vWorld; varying vec3 vN; varying vec3 vLocal; varying vec2 vUv;
void main() {
  vec3 N = normalize(vN); vec3 V = normalize(cameraPosition - vWorld);
  vec3 p = vLocal;
  vec3 q = uAlong < 0.5 ? vec3(p.x * 4.0, p.y * 520.0, p.z * 520.0) : vec3(p.x * 520.0, p.y * 4.0, p.z * 520.0);
  float brush = vnoise(q) * 0.6 + vnoise(q * 2.7 + 4.0) * 0.4;
  float cloud = fbm(vWorld * 23.0) * 0.7 + fbm(vWorld * 61.0) * 0.3;
  float hgt = vWorld.y - 124.0;
  float tarn = smoothstep(0.58, 0.9, cloud + 0.2 * (1.0 - smoothstep(0.7, 1.2, hgt))) * uWorn;
  vec3 F0 = uBase * (0.95 + 0.08 * brush);
  F0 = mix(F0, F0 * vec3(0.6, 0.56, 0.44), tarn * 0.45);
  float rough = 0.18 + 0.45 * tarn + 0.08 * brush;
  float fp = smoothstep(0.64, 0.82, vnoise(vWorld * vec3(30.0, 24.0, 30.0) + 3.0)) * smoothstep(1.15, 1.4, hgt) * (1.0 - smoothstep(1.75, 2.0, hgt));
  rough = mix(rough, 0.7, fp * 0.5);
  float cut = 0.0, lip = 0.0;
  if (uHasMap > 0.5) { vec4 m = texture2D(uMap, vUv); cut = m.r; lip = m.g * (1.0 - m.r); }
  float ndv = max(dot(N, V), 0.0);
  vec3 F = F0 + (1.0 - F0) * pow(1.0 - ndv, 5.0);
  vec3 R = reflect(-V, N);
  vec3 Rr = normalize(mix(R, N, rough * 0.4));
  vec3 col = envAt(Rr, vWorld) * F * 0.9;
  // a dull fill: the rough part of the metal sees the whole sky
  col += F0 * (uShadeTint * 0.07 + uBounce * 0.05);
  float ndl = dot(N, uKeyDir);
  vec3 H = normalize(uKeyDir + V);
  float ndh = max(dot(N, H), 0.0);
  float spec = (pow(ndh, mix(420.0, 50.0, rough)) * mix(10.0, 1.0, rough) + pow(ndh, 16.0) * 0.18) * smoothstep(-0.05, 0.2, ndl);
  col += uKeyTint * mix(F0, vec3(1.0, 0.9, 0.7), 0.4) * spec;
  // the sun behind it: edges that turn toward the light burn gold
  float back = max(dot(-V, uKeyDir), 0.0);
  float rim = pow(1.0 - ndv, 3.0) * smoothstep(-0.1, 0.4, ndl) * (0.4 + 1.6 * back * back);
  col += uKeyTint * F0 * rim * 1.6;
  col = mix(col, vec3(0.016, 0.011, 0.007) + col * 0.06, cut * 0.94);
  col += uKeyTint * F0 * lip * 0.45;
  col = haze(shoulder(col), length(cameraPosition - vWorld));
  gl_FragColor = linearToOutputTexel(vec4(col, 1.0));
}`,Z0=`
${c0}
${b0}
${_0}
uniform float uDust; uniform float uFrostTop; uniform float uFloorY;
varying vec3 vWorld; varying vec3 vN; varying vec3 vLocal; varying vec2 vUv;
void main() {
  vec3 N = normalize(vN); vec3 V = normalize(cameraPosition - vWorld);
  if (dot(N, V) < 0.0) N = -N;
  float hgt0 = vWorld.y - uFloorY;
  // the back pane is etched (sandblasted) from the bottom rail up to uFrostTop: it hides what stands behind the
  // case and glows with the low sun behind it; a double etched line finishes its top edge
  if (vLocal.z < 0.0 && hgt0 < uFrostTop) {
    float g = vnoise(vec3(vWorld.x * 900.0, vWorld.y * 900.0, 3.0)) * 0.6 + vnoise(vec3(vWorld.x * 140.0, vWorld.y * 140.0, 7.0)) * 0.4;
    float backF = pow(max(dot(-V, uKeyDir), 0.0), 2.0);
    float up = smoothstep(uFrostTop - 0.5, uFrostTop, hgt0);
    vec3 fc = mix(vec3(0.52, 0.47, 0.36), uHazeColor * vec3(1.02, 0.96, 0.86), 0.45 + 0.35 * up) * (0.9 + 0.12 * g);
    fc += uKeyTint * vec3(1.0, 0.82, 0.58) * (0.08 + 0.55 * backF) * (0.85 + 0.2 * g);
    float edge = 1.0 - smoothstep(0.0, 0.0025, abs(hgt0 - (uFrostTop - 0.012)));
    float fa = 0.86 * smoothstep(uFrostTop + 0.0012, uFrostTop - 0.0012, hgt0);
    fa = max(fa, edge * 0.7);
    fc = mix(fc, fc * 1.12, edge);
    fc = haze(fc, length(cameraPosition - vWorld));
    gl_FragColor = linearToOutputTexel(vec4(fc, fa));
    return;
  }
  float ndv = max(dot(N, V), 0.0);
  float F = 0.04 + 0.96 * pow(1.0 - ndv, 5.0);
  vec3 R = reflect(-V, N);
  vec3 col = envAt(R, vWorld) * F;
  float a = F;
  // the sun's streak on the pane
  vec3 H = normalize(uKeyDir + V);
  float sp = pow(max(dot(N, H), 0.0), 900.0) * 14.0;
  col += uKeyTint * sp; a += sp * 0.6;
  // dust and dried rain: invisible against the light, glowing when the sun is behind the pane
  vec2 w = vWorld.xy * vec2(1.0, 1.0) + vWorld.zz * 0.0;
  // a film of dust thicker toward the bottom of the pane, a few dried rain runs, a smudge at hand height
  float hgt = vWorld.y - 124.0;
  float film = fbm(vec3(vWorld.x * 6.0, vWorld.y * 14.0, vWorld.z * 6.0)) * (0.35 + 0.65 * (1.0 - smoothstep(0.9, 1.7, hgt)));
  float drip = smoothstep(0.88, 0.97, vnoise(vec3(vWorld.x * 70.0, vWorld.y * 5.0, vWorld.z * 70.0))) * (1.0 - smoothstep(1.0, 1.8, hgt));
  float smudge = smoothstep(0.66, 0.85, vnoise(vec3(vWorld.x * 11.0, vWorld.y * 9.0, vWorld.z * 11.0))) * smoothstep(1.2, 1.45, hgt) * (1.0 - smoothstep(1.6, 1.8, hgt));
  float back = pow(max(dot(-V, uKeyDir), 0.0), 4.0);
  float glow = (smoothstep(0.45, 0.8, film) * 0.22 + drip * 0.18 + smudge * 0.25) * uDust;
  col += uKeyTint * vec3(1.0, 0.86, 0.66) * glow * (0.05 + 0.9 * back);
  a += glow * (0.02 + 0.22 * back);
  // a faint green where the light runs through the glass's edge
  col += vec3(0.02, 0.05, 0.035) * pow(1.0 - ndv, 2.0);
  a = clamp(a, 0.0, 0.92);
  col = haze(col, length(cameraPosition - vWorld));
  gl_FragColor = linearToOutputTexel(vec4(col / max(a, 1e-3), a));
}`,ee=`
${c0}
${b0}
uniform sampler2D uMap; uniform sampler2D uWords; uniform float uWordsK; uniform vec3 uPaper; uniform float uFlip;
varying vec3 vWorld; varying vec3 vN; varying vec3 vLocal; varying vec2 vUv;
void main() {
  vec3 N = normalize(vN); vec3 V = normalize(cameraPosition - vWorld);
  bool front = dot(N, V) >= 0.0;
  if (!front) N = -N;
  vec2 uv = front ? vUv : vec2(1.0 - vUv.x, vUv.y);
  vec4 gfx = texture2D(uMap, uv), wd = texture2D(uWords, uv);
  float wa = wd.a * uWordsK;
  vec4 print = vec4(mix(gfx.rgb * gfx.a, wd.rgb, wa) / max(1e-3, max(gfx.a, wa)), max(gfx.a, wa));
  vec3 ink = pow(print.rgb, vec3(2.2));
  float fibre = 0.6 * vnoise(vec3(vUv * vec2(900.0, 1260.0), 1.0)) + 0.4 * vnoise(vec3(vUv * vec2(140.0, 196.0), 4.0));
  vec3 base = uPaper * (0.965 + 0.06 * fibre);
  // the back of the card is blank; the print shows through faintly, mirrored
  vec3 surf = front ? mix(base, ink, print.a) : mix(base, base * 0.93, print.a * 0.25);
  vec3 col = lightPlayer(surf, N, V, 1.0, 0.0, fibre, 0.4);
  // the sun through the card from behind: a warm glow, the ink (seen from either side) blocks it
  float through = max(-dot(N, uKeyDir), 0.0);
  float block = print.a * (front ? 0.85 : 0.75);
  vec3 glow = uKeyTint * vec3(1.0, 0.78, 0.5) * (0.55 + 0.25 * fibre) * (1.0 - block) * through;
  col += glow * 0.9;
  col = haze(shoulder(col), length(cameraPosition - vWorld));
  gl_FragColor = linearToOutputTexel(vec4(col, 1.0));
}`,te=`
${c0}
${b0}
uniform vec3 uBase;
varying vec3 vWorld; varying vec3 vN; varying vec3 vLocal; varying vec2 vUv;
void main() {
  vec3 N = normalize(vN); vec3 V = normalize(cameraPosition - vWorld);
  vec3 col = uBase * (0.6 + 0.4 * max(dot(N, uKeyDir), 0.0)) + uBase * uShadeTint * 0.3;
  col = haze(col, length(cameraPosition - vWorld));
  gl_FragColor = linearToOutputTexel(vec4(col, 1.0));
}`,oe="Fraunces, Georgia, serif",Y0="Figtree, system-ui, sans-serif",ce=["#3F78D0","#EDB43C","#2FA6A0","#E8674C"];function ie(d,z,g){const r=z.split(" "),n=[];let f="";for(const c of r){const i=f?f+" "+c:c;d.measureText(i).width>g&&f?(n.push(f),f=c):f=i}return f&&n.push(f),n}function ae(d,z,g){const r=g.getBoundingClientRect();if(!r.width||!r.height)return!1;const n=d.width/r.width,f=d.height/r.height,c=d.getContext("2d"),i=z.getContext("2d");c.clearRect(0,0,d.width,d.height),i.clearRect(0,0,z.width,z.height);const u=x=>{const p=x.getBoundingClientRect();return{x:(p.left-r.left)*n,y:(p.top-r.top)*f,w:p.width*n,h:p.height*f}};for(const x of g.querySelectorAll("[data-g]")){const p=u(x),w=getComputedStyle(x);x.dataset.g==="dash"?(c.strokeStyle="rgba(33,31,28,.7)",c.lineWidth=Math.max(2,.06*parseFloat(w.fontSize)*n),c.setLineDash([16*n/3,11*n/3]),c.strokeRect(p.x+c.lineWidth/2,p.y+c.lineWidth/2,p.w-c.lineWidth,p.h-c.lineWidth),c.setLineDash([])):(c.fillStyle=w.backgroundColor,c.fillRect(p.x,p.y,p.w,p.h))}const Z=document.createTreeWalker(g,NodeFilter.SHOW_TEXT),C=document.createRange();for(let x=Z.nextNode();x;x=Z.nextNode()){const p=x.parentElement,w=getComputedStyle(p);if(p.closest('[aria-hidden="true"]'))continue;const N=parseFloat(w.fontSize);i.font=`${w.fontStyle} ${w.fontWeight} ${N*n}px ${w.fontFamily}`,i.fillStyle=w.color,i.textBaseline="alphabetic";const l=i.measureText("Hg"),e0=(l.fontBoundingBoxAscent??N*n*.9)/n,t0=(l.fontBoundingBoxDescent??N*n*.25)/n,u0=w.textTransform==="uppercase",h0=w.letterSpacing&&w.letterSpacing!=="normal"&&parseFloat(w.letterSpacing)!==0,M=x.textContent,d0=h0?/\S/g:/\S+/g;let A;for(;A=d0.exec(M);){C.setStart(x,A.index),C.setEnd(x,A.index+A[0].length);const o0=C.getClientRects();if(!o0.length)continue;const I=o0[0],v0=I.top+(I.height-(e0+t0))/2+e0;i.fillText(u0?A[0].toUpperCase():A[0],(I.left-r.left)*n,(v0-r.top)*f)}}return C.detach&&C.detach(),!0}function q0(d,z,{font:g=oe,weight:r=560,size:n=.56,track:f=0}={}){const c=d.width,i=d.height,u=d.getContext("2d");u.fillStyle="#000",u.fillRect(0,0,c,i),u.font=`${r} ${Math.round(i*n)}px ${g}`,u.textAlign="center",u.textBaseline="middle",u.letterSpacing=`${f}px`,u.globalCompositeOperation="lighter",u.fillStyle="#00ff00",u.fillText(z,c/2,i/2+Math.max(1,i*.035)),u.fillStyle="#ff0000",u.fillText(z,c/2,i/2),u.globalCompositeOperation="source-over",u.letterSpacing="0px"}function S0(d,z){const g=document.createElement("canvas");return g.width=d,g.height=z,g}function ue(d,{at:z,plates:g}){const r=new o.Group;r.position.fromArray(z);const n=[],f=[],c=[],i=(e,t,a={})=>{const s=new o.ShaderMaterial({vertexShader:Q0,fragmentShader:e,uniforms:{...d.light,uSkyTop:u.top,uDeck:u.deck,...t},...a});return f.push(s),s},u={top:{value:new o.Color(.045,.1,.26)},deck:{value:new o.Color(.72,.6,.47)}},Z=new o.Color(.78,.56,.26),C=i(W0,{uBase:{value:Z},uMap:{value:null},uHasMap:{value:0},uAlong:{value:0},uWorn:{value:1}}),x=i(W0,{uBase:{value:Z},uMap:{value:null},uHasMap:{value:0},uAlong:{value:1},uWorn:{value:1}}),p=i(Z0,{uDust:{value:1},uFrostTop:{value:1.36},uFloorY:{value:z[1]}},{transparent:!0,depthWrite:!1,side:o.DoubleSide}),w=i(te,{uBase:{value:O0("#14100c")}}),N=e=>e.index?e.toNonIndexed():e,l=(e,t,a,s,y,k,R=.004)=>{const b=new E0(e,t,a,2,Math.min(R,e/2.2,t/2.2,a/2.2));return b.translate(s,y,k),b},e0=[],t0=[];for(let e=0;e<=Q;e++){const t=-Y/2+_/2+e*D0;e0.push(l(_,F[0],_,t,F[0]/2,0,.005)),t0.push(l(.13,.012,.13,t,.006,0,.003));for(const[a,s]of[[-1,-1],[1,-1],[-1,1],[1,1]]){const y=new o.CylinderGeometry(.0075,.0085,.008,12);y.translate(t+a*.045,.016,s*.045),t0.push(y)}}const u0=O(e0.map(N));n.push(u0);const h0=O(t0.map(N));n.push(h0),r.add(new o.Mesh(u0,x),new o.Mesh(h0,C));const M=[];M.push(l(Y,G[1]-G[0],.09,0,(G[0]+G[1])/2,0,.006)),M.push(l(Y,q[1]-q[0],.09,0,(q[0]+q[1])/2,0,.008)),M.push(l(Y+.06,F[1]-F[0],.13,0,(F[0]+F[1])/2,0,.006));for(let e=0;e<Q;e++){const t=K(e),a=.013;for(const s of[S/2+.004])M.push(l(W,a,.008,t,v[1]-a/2,s,.002)),M.push(l(W,a,.008,t,v[0]+a/2,s,.002)),M.push(l(a,v[1]-v[0],.008,t-W/2+a/2,(v[0]+v[1])/2,s,.002)),M.push(l(a,v[1]-v[0],.008,t+W/2-a/2,(v[0]+v[1])/2,s,.002));M.push(l(h.w+.05,.008,.006,t,F[1]+.004,.006,.002)),M.push(l(h.w+.05,.008,.006,t,F[1]+.004,-.006,.002)),M.push(l(.018,.03,.012,t-h.w/2+.03,i0+h.h-.005,0,.003)),M.push(l(.018,.03,.012,t+h.w/2-.03,i0+h.h-.005,0,.003))}const d0=O(M.map(N));n.push(d0),r.add(new o.Mesh(d0,C));const A=[];for(let e=0;e<Q;e++)A.push(l(h.w+.02,.003,.006,K(e),F[1]+5e-4,0,.001));const o0=O(A.map(N));n.push(o0),r.add(new o.Mesh(o0,w));const I=[];for(let e=0;e<Q;e++)for(const t of[S/2,-S/2]){if(e===3&&t>0)continue;const a=new o.PlaneGeometry(W-.004,v[1]-v[0]-.004);a.translate(K(e),(v[0]+v[1])/2,t),I.push(a)}const v0=O(I);n.push(v0);const P0=new o.Mesh(v0,p);P0.renderOrder=10,r.add(P0);const A0=[];function M0(e,t,a,s,y,k,R={}){const E=Math.max(48,Math.round(1536*a/t)),V=S0(1536,E);q0(V,e,R);const m=new o.CanvasTexture(V);m.anisotropy=8,m.colorSpace=o.NoColorSpace,c.push(m);const D=i(W0,{uBase:{value:new o.Color(.84,.64,.32)},uMap:{value:m},uHasMap:{value:1},uAlong:{value:0},uWorn:{value:.6}}),P=l(t,a,.004,s,y,k,.0016);n.push(P),r.add(new o.Mesh(P,C));const L=new o.PlaneGeometry(t-.003,a-.003);L.translate(s,y,k+.00205),n.push(L);const $=new o.Mesh(L,D);return r.add($),A0.push({cv:V,tex:m,text:e,o:R}),$}M0(g.header,.66,.085,0,(q[0]+q[1])/2,.045+.002,{size:.6}),M0(g.empty,1.2,.04,(K(1)+K(2))/2,(G[0]+G[1])/2,.045+.002,{font:Y0,weight:600,size:.5,track:3});const T=K(3),p0=v[0],T0=v[1],a0=(p0+T0)/2,U=T0-p0,B0=l(W,U,.006,T,a0,S/2,.002);n.push(B0),r.add(new o.Mesh(B0,x));const f0=S0(640,Math.round(640*U/W));{const e=f0.getContext("2d"),t=f0.width,a=f0.height,s=t/W;e.fillStyle="#000",e.fillRect(0,0,t,a);const y=(m,D,P,L,$)=>{e.strokeStyle="#ff0000",e.lineWidth=$,e.strokeRect(m,D,P,L),e.strokeStyle="#00ff00",e.lineWidth=$*.6,e.strokeRect(m,D+$,P,L)};e.globalCompositeOperation="lighter";const k=.07*s,R=.082*s;y(k,k,t-2*k,a-2*k,2.2),y(R,R,t-2*R,a-2*R,1.2);const b=.022*s,E=t/2,V=a*(1-(1.53-p0)/U);for(let m=0;m<4;m++){const D=E-b-.002*s+m%2*(b+.004*s),P=V-b-.002*s+Math.floor(m/2)*(b+.004*s);e.fillStyle="#ff0000",e.fillRect(D,P,b,b),e.fillStyle="#00ff00",e.fillRect(D,P+b,b,1.5)}e.globalCompositeOperation="source-over"}const m0=new o.CanvasTexture(f0);m0.colorSpace=o.NoColorSpace,m0.anisotropy=8,c.push(m0);const I0=i(W0,{uBase:{value:new o.Color(.76,.55,.26)},uMap:{value:m0},uHasMap:{value:1},uAlong:{value:1},uWorn:{value:.45}}),z0=new o.PlaneGeometry(W-.004,U-.004);z0.translate(T,a0,S/2+.0032),n.push(z0),r.add(new o.Mesh(z0,I0));const X=[],H=.045,g0=.014,x0=S/2+.0045;X.push(l(W-2*H,g0,.004,T,T0-H,x0,.0015)),X.push(l(W-2*H,g0,.004,T,p0+H,x0,.0015)),X.push(l(g0,U-2*H,.004,T-W/2+H,a0,x0,.0015)),X.push(l(g0,U-2*H,.004,T+W/2-H,a0,x0,.0015));for(const[e,t]of[[-1,-1],[1,-1],[-1,1],[1,1]]){const a=new o.SphereGeometry(.0065,14,8);a.scale(1,1,.45),a.translate(T+e*(W/2-.022),a0+t*(U/2-.022),S/2+.004),X.push(a)}const V0=O(X.map(N));n.push(V0),r.add(new o.Mesh(V0,C)),M0(g.inbox,.52,.052,T,1.66,S/2+.005,{font:Y0,weight:600,size:.44,track:1});const j=1.4,K0=l(.36,.034,.004,T,j,S/2+.002,.002);n.push(K0),r.add(new o.Mesh(K0,w));const n0=[];n0.push(l(.4,.012,.01,T,j+.023,S/2+.006,.003)),n0.push(l(.4,.012,.01,T,j-.023,S/2+.006,.003)),n0.push(l(.012,.058,.01,T-.194,j,S/2+.006,.003)),n0.push(l(.012,.058,.01,T+.194,j,S/2+.006,.003));const H0=O(n0.map(N));n.push(H0),r.add(new o.Mesh(H0,C));const s0=new o.Group;s0.position.set(T,j+.017,S/2+.012);const C0=new E0(.37,.036,.004,2,.0015);C0.translate(0,-.018,0),n.push(C0);const L0=new o.Mesh(C0,C);s0.add(L0);const w0=new o.SphereGeometry(.007,16,10);w0.scale(1.6,1,.8),w0.translate(0,-.03,.005),n.push(w0),s0.add(new o.Mesh(w0,C)),r.add(s0);const $0=S0(1024,Math.round(1024*h.h/h.w)),G0=S0(1024,Math.round(1024*h.h/h.w)),F0=new o.CanvasTexture($0),k0=new o.CanvasTexture(G0);for(const e of[F0,k0])e.anisotropy=8,e.colorSpace=o.NoColorSpace,c.push(e);const U0=i(ee,{uMap:{value:F0},uWords:{value:k0},uWordsK:{value:1},uPaper:{value:O0("#F3EBDC")},uFlip:{value:0}},{side:o.DoubleSide}),R0=new o.PlaneGeometry(h.w,h.h,1,8);R0.translate(0,h.h/2,0),n.push(R0);const B=new o.Mesh(R0,U0),r0=new o.Vector3(K(0),i0,0);B.position.copy(r0),r.add(B),r.traverse(e=>{e.frustumCulled=!1}),d.scene.add(r);const N0=new o.Vector3,X0=new o.Vector3,j0=new o.Vector3,J=new o.Vector3,y0=(e,t,a,s=new o.Vector3)=>s.set(e,t,a).add(r.position);return{object:r,card:B,cardHome:r0,flapMesh:L0,cardSlide(e,{tilt:t=0,lift:a=0}={}){const s=F[1]+.01-i0;B.position.set(r0.x,r0.y+s*(1-e)+a,r0.z),B.rotation.set(0,0,t)},bayWorld(e,t=(v[0]+v[1])/2,a=.05,s=new o.Vector3){return y0(K(e),t,a,s)},world(e,t,a,s){return y0(e,t,a,s)},flap(e){s0.rotation.x=-e*1.1},castShadows(e=1){const t=d.shadows;if(!t)return;for(let l0=0;l0<=Q;l0++){const J0=-Y/2+_/2+l0*D0;y0(J0,0,0,N0),t.cast(N0,X0.set(_/2,0,0),j0.set(0,0,_/2),{opacity:.85*e,shape:0,round:.1,size:.3,extent:F[0]})}J.copy(d.light.uKeyDir.value);const a=Math.max(.1,J.y),s=Math.hypot(J.x,J.z),y=[-J.x/s,-J.z/s],k=G[0],R=F[1],b=l0=>Math.min(10,l0*s/a),E=b(k),V=b(R),m=y0(0,0,0,N0),D=(E+V)/2,P=new o.Vector3(m.x+y[0]*D,m.y,m.z+y[1]*D),L=new o.Vector3(Y/2,0,0),$=new o.Vector3(y[0]*(V-E)/2,0,y[1]*(V-E)/2);t.add(P,L,$,.5,.42*e,0,.3)},print(e){ae($0,G0,e)&&(F0.needsUpdate=!0,k0.needsUpdate=!0)},setWords(e){U0.uniforms.uWordsK.value=e},cardCorners(e,t,a){B.updateMatrixWorld(!0),e.set(-h.w/2,h.h,0).applyMatrix4(B.matrixWorld),t.set(h.w/2,h.h,0).applyMatrix4(B.matrixWorld),a.set(-h.w/2,0,0).applyMatrix4(B.matrixWorld)},redraw(){for(const e of A0)q0(e.cv,e.text,e.o),e.tex.needsUpdate=!0},setSky(e,t){e&&u.top.value.copy(e),t&&u.deck.value.copy(t)},dispose(){d.scene.remove(r);for(const e of n)e.dispose();for(const e of f)e.dispose();for(const e of c)e.dispose()}}}export{Q as BAYS,W as BAY_W,F as CAP,h as CARD,i0 as CARD_Y,S as DEPTH,v as GLASS,q as HEAD,Y as LEN,D0 as PITCH,_ as POST,G as RAIL_LO,K as bayX,ue as createBoard,ae as drawCardFromDom,q0 as drawPlate};
