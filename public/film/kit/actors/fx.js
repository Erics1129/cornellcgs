import*as i from"three";import{GLSL_COMMON as $,GLSL_FRAG as Y,lin as X,OUTLINE_INK as ct,PAPER as it,LINE as xt}from"./core.js";import{clamp as j,outCubic as K,seeded as st}from"../ease.js";const gt=512,ht=2048,pt=1024,bt=256,lt=`
${$}
attribute vec3 aPos;
attribute float aSize;
attribute vec3 aColour;
attribute vec4 aParam;
varying vec2 vQ; varying vec3 vColour; varying vec4 vParam; varying vec3 vWorld; varying float vPxR;
varying vec3 vRight; varying vec3 vUp; varying vec3 vBack;
void main() {
  vQ = position.xy;
  vColour = aColour; vParam = aParam;
  vRight = vec3(viewMatrix[0][0], viewMatrix[1][0], viewMatrix[2][0]);
  vUp = vec3(viewMatrix[0][1], viewMatrix[1][1], viewMatrix[2][1]);
  vBack = vec3(viewMatrix[0][2], viewMatrix[1][2], viewMatrix[2][2]);
  vec3 p = aPos + (vRight * position.x + vUp * position.y) * aSize;
  vWorld = p;
  vec4 mv = viewMatrix * vec4(aPos, 1.0);
  vPxR = aSize / max(1e-5, uPx * -mv.z);
  gl_Position = projectionMatrix * viewMatrix * vec4(p, 1.0);
}`,wt=`
${$}
${Y}
uniform vec3 uOutline;
varying vec2 vQ; varying vec3 vColour; varying vec4 vParam; varying vec3 vWorld; varying float vPxR;
varying vec3 vRight; varying vec3 vUp; varying vec3 vBack;
float h11(float n) { return fract(sin(n * 127.1) * 43758.5453); }
float smin(float a, float b, float k) { float h = clamp(0.5 + 0.5 * (b - a) / k, 0.0, 1.0); return mix(b, a, h) - k * h * (1.0 - h); }
void main() {
  vec2 q = vQ * 1.7;
  float seed = vParam.y;
  int lobes = int(vParam.z + 0.5);
  float d = 1e3; vec2 cBest = vec2(0.0); float rBest = 1.0; float hBest = -1e3;
  for (int i = 0; i < 5; i++) {
    if (i >= lobes) break;
    float a = 6.2832 * (float(i) / float(lobes)) + h11(seed + float(i)) * 1.1;
    float rr = 0.42 + 0.18 * h11(seed * 3.1 + float(i) * 7.0);
    vec2 c = vec2(cos(a), sin(a) * 0.75 + 0.1) * (0.56 + 0.14 * h11(seed + float(i) * 13.0));
    if (i == 0) { c = vec2(0.0, 0.12); rr = 0.6; }
    float di = length(q - c) - rr;
    d = smin(d, di, 0.1);
    float hgt = rr * rr - dot(q - c, q - c);
    if (hgt > hBest) { hBest = hgt; cBest = c; rBest = rr; }
  }
  float px = 1.7 / max(vPxR, 1.0);                     // one pixel in q units
  if (uStyle > 1.5) {
    // paper: a torn edge
    float ang = atan(q.y, q.x);
    d += (fbm(vec3(cos(ang) * 3.0, sin(ang) * 3.0, seed)) - 0.5) * 0.16 + (vnoise(vec3(q * 22.0, seed)) - 0.5) * 0.05;
  }
  float soft = uStyle > 0.5 && uStyle < 1.5 ? max(px * 1.5, 0.09) : px * 1.2;
  float a = 1.0 - smoothstep(-soft, soft * 0.6, d);
  if (a <= 0.0) discard;
  // a gentle dome per lobe, lit by the sun (flat two-tone in ink)
  vec2 l = (q - cBest) / rBest;
  float z = sqrt(max(0.0, 1.0 - dot(l, l)));
  vec3 N = normalize(vRight * l.x + vUp * l.y + vBack * (z + 0.35));
  vec3 V = normalize(cameraPosition - vWorld);
  vec3 col = lightPlayer(vColour, N, V, 1.0, 0.0, 0.5, 0.4);
  if (uStyle < 0.5) {
    float w = (LINE_INNER + 0.6) * uLineScale * px;
    col = mix(col, uOutline, smoothstep(-w - px, -w, d));
  } else if (uStyle > 1.5) {
    col *= 0.94 + 0.08 * fbm(vec3(q * 9.0, seed));
    col = mix(col, col * 0.86, 1.0 - smoothstep(-0.09, -0.02, d));
  }
  col = haze(shoulder(col), length(cameraPosition - vWorld));
  a *= vParam.x;
  gl_FragColor = linearToOutputTexel(vec4(col * a, a));
}`,zt=`
${$}
${Y}
uniform vec3 uOutline;
varying vec2 vQ; varying vec3 vColour; varying vec4 vParam; varying vec3 vWorld; varying float vPxR;
varying vec3 vRight; varying vec3 vUp; varying vec3 vBack;
void main() {
  float r = length(vQ);
  float px = 1.0 / max(vPxR, 1.0);
  float a = 1.0 - smoothstep(1.0 - px * 1.2, 1.0, r);
  if (a <= 0.0) discard;
  vec3 col = vColour * uKeyTint;
  if (uStyle < 0.5) {
    float w = min(0.5, 1.1 * uLineScale * px);
    col = mix(col, uOutline, smoothstep(1.0 - w - px, 1.0 - w, r));
  } else if (uStyle < 1.5) col *= 1.0 - 0.10 * smoothstep(0.2, 1.0, length(vQ - vec2(-0.3, 0.35)));
  else col *= 0.95 + 0.07 * vnoise(vec3(vQ * 6.0, vParam.y));
  col = haze(col, length(cameraPosition - vWorld));
  a *= vParam.x;
  gl_FragColor = linearToOutputTexel(vec4(col * a, a));
}`,Mt=`
${$}
attribute vec3 aA;
attribute vec3 aB;
attribute float aWidth;      // world width
attribute vec3 aColour;
attribute vec4 aParam;       // alpha
varying vec2 vQ; varying vec3 vColour; varying vec4 vParam; varying vec3 vWorld; varying vec2 vLen;
void main() {
  vec4 a = viewMatrix * vec4(aA, 1.0), b = viewMatrix * vec4(aB, 1.0);
  vec2 d = b.xy / max(1e-4, -b.z) - a.xy / max(1e-4, -a.z);
  vec2 dir = length(d) > 1e-6 ? normalize(d) : vec2(1.0, 0.0);
  vec2 perp = vec2(-dir.y, dir.x);
  float hw = aWidth * 0.5;
  float t = position.x * 0.5 + 0.5;           // 0 at A, 1 at B
  vec4 p = mix(a, b, t);
  p.xy += dir * hw * position.x + perp * hw * position.y;
  float len = length(b.xyz - a.xyz);
  vQ = vec2(mix(-hw, len + hw, t), position.y * hw);
  vLen = vec2(len, hw);
  vColour = aColour; vParam = aParam;
  vWorld = (inverse(viewMatrix) * p).xyz;
  gl_Position = projectionMatrix * p;
}`,Pt=`
${$}
${Y}
varying vec2 vQ; varying vec3 vColour; varying vec4 vParam; varying vec3 vWorld; varying vec2 vLen;
void main() {
  vec2 c = vec2(clamp(vQ.x, 0.0, vLen.x), 0.0);
  float d = length(vQ - c) - vLen.y;
  float aa = fwidth(d);
  float a = 1.0 - smoothstep(-aa, aa, d);
  if (a <= 0.0) discard;
  vec3 col = haze(vColour, length(cameraPosition - vWorld));
  a *= vParam.x;
  gl_FragColor = linearToOutputTexel(vec4(col * a, a));
}`,Ft=`
${$}
attribute vec3 aPos;
attribute vec3 aAxisA;
attribute vec3 aAxisB;
attribute vec3 aColour;
attribute vec4 aParam;       // alpha, inner radius (fraction of outer)
varying vec2 vQ; varying vec3 vColour; varying vec4 vParam; varying vec3 vWorld;
void main() {
  vQ = position.xy;
  vec3 p = aPos + aAxisA * position.x + aAxisB * position.y;
  vColour = aColour; vParam = aParam; vWorld = p;
  gl_Position = projectionMatrix * viewMatrix * vec4(p, 1.0);
}`,At=`
${$}
${Y}
varying vec2 vQ; varying vec3 vColour; varying vec4 vParam; varying vec3 vWorld;
void main() {
  float r = length(vQ);
  float aa = fwidth(r);
  float a = (1.0 - smoothstep(1.0 - aa, 1.0, r)) * smoothstep(vParam.y - aa, vParam.y, r);
  if (a <= 0.0) discard;
  vec3 col = haze(vColour * uKeyTint, length(cameraPosition - vWorld));
  a *= vParam.x;
  gl_FragColor = linearToOutputTexel(vec4(col * a, a));
}`,Ct=new Float32Array([-1,-1,0,1,-1,0,1,1,0,-1,1,0]);function Z(w,R,Q,T,U,V){const k=new i.InstancedBufferGeometry;k.setAttribute("position",new i.BufferAttribute(Ct,3)),k.setIndex([0,1,2,0,2,3]);const S={};let D=0;for(const[H,_]of R){const O=new i.InstancedBufferAttribute(new Float32Array(w*_),_);O.setUsage(i.DynamicDrawUsage),k.setAttribute(H,O),S[H]={a:O,n:_,off:D},D+=_}k.instanceCount=0;const E=new i.ShaderMaterial({vertexShader:Q,fragmentShader:T,uniforms:U,defines:{LINE_INNER:xt.inner.toFixed(2)},transparent:!0,depthWrite:!1,depthTest:!0,side:i.DoubleSide,blending:i.CustomBlending,blendSrc:i.OneFactor,blendDst:i.OneMinusSrcAlphaFactor,blendSrcAlpha:i.OneFactor,blendDstAlpha:i.OneMinusSrcAlphaFactor});E.extensions={derivatives:!0};const B=new i.Mesh(k,E);return B.frustumCulled=!1,B.renderOrder=V,{geo:k,mat:E,mesh:B,attrs:S,stride:D,max:w,user:new Float32Array(w*D),act:new Float32Array(w*D),nu:0,na:0}}function Bt(w){const R=w.light,Q=()=>({...R,uOutline:{value:X(ct)}}),T=Z(gt,[["aPos",3],["aSize",1],["aColour",3],["aParam",4]],lt,wt,Q(),6),U=Z(ht,[["aPos",3],["aSize",1],["aColour",3],["aParam",4]],lt,zt,Q(),4),V=Z(pt,[["aA",3],["aB",3],["aWidth",1],["aColour",3],["aParam",4]],Mt,Pt,Q(),5),k=Z(bt,[["aPos",3],["aAxisA",3],["aAxisB",3],["aColour",3],["aParam",4]],Ft,At,Q(),5),S=[T,U,V,k],D=new i.Group;for(const t of S)D.add(t.mesh);let E=!1;function B(t,a){if(t.nu+t.na>=t.max)return;const n=E?t.act:t.user,o=(E?t.na++:t.nu++)*t.stride;for(let e=0;e<a.length;e++)n[o+e]=a[e]}function H(t){const a=Math.min(t.max,t.nu+t.na);for(const{a:n,n:o,off:e}of Object.values(t.attrs)){for(let r=0;r<a;r++){const l=r<t.nu?t.user:t.act,v=(r<t.nu?r:r-t.nu)*t.stride+e;for(let c=0;c<o;c++)n.array[r*o+c]=l[v+c]}n.needsUpdate=!0}t.geo.instanceCount=a}const _=new i.Color,O=(t,a)=>t==null?_.copy(X(a)):_.copy(X(t)),q=t=>t.isVector3?t:new i.Vector3().fromArray(t),ft=t=>{const a=Math.abs(t.y)<.9?new i.Vector3(0,1,0):new i.Vector3(1,0,0),n=new i.Vector3().crossVectors(t,a).normalize();return[n,new i.Vector3().crossVectors(t,n).normalize()]},tt=new i.Vector3,ot=new i.Vector3,et=()=>w.style==="ink"?X(ct):w.style==="paper"?X("#6B5A4C"):X("#FFF6E4");function ut(t){if(t<=0||t>=1)return[0,0];const a=.167,n=.389;if(t<a){const e=t/a;return[1.2*(1-(1-e)**3)*(1+.08*Math.sin(Math.PI*e)),0]}if(t<n){const e=(t-a)/(n-a);return[1.2-.06*e,.08*e]}const o=(t-n)/(1-n);return[1.14*(1-o*o*(3-2*o))**1.15,.08+.92*(1-(1-o)**2)]}const at={object:D,clear(){for(const t of S)t.nu=0},beginActors(){E=!0;for(const t of S)t.na=0},end(){E=!1;for(const t of S)H(t)},puff(t,a,n={}){if(a<=0||a>=1)return;const{size:o=.1,ticks:e=4,colour:r="#FFFDF6",seed:l=1}=n,v=q(n.away||[0,0,-1]).clone().normalize(),c=q(n.up||[0,1,0]).clone().normalize(),s=q(t).clone().addScaledVector(v,o*.7),f=st(l*7919+13),L=n.lobes||4+Math.floor(f()*2),[M,u]=ut(a),P=O(r,"#FFFDF6"),d=s.x+v.x*o*1.6*u+c.x*o*.9*u,y=s.y+v.y*o*1.6*u+c.y*o*.9*u,W=s.z+v.z*o*1.6*u+c.z*o*.9*u;if(M>.001&&B(T,[d,y,W,o*M,P.r,P.g,P.b,1,l*1.37+.5,L,0]),e>0){const h=new i.Vector3().crossVectors(c,v);h.lengthSq()<1e-6&&h.set(1,0,0),h.normalize();const p=et();for(let m=0;m<e;m++){const F=j((a-.04-m*.025)/.5);if(F<=0||F>=1){f(),f();continue}const g=(m/Math.max(1,e-1)-.5)*2*o*(1.1+.3*f()),A=(f()-.35)*o*.9,z=.6+2.2*K(F),C=z+.9*(1-F)*(1-F)+.05;if(o*(C-z)<=o*.02)continue;const N=s.x+h.x*g+c.x*A,x=s.y+h.y*g+c.y*A,b=s.z+h.z*g+c.z*A;B(V,[N+v.x*o*z,x+v.y*o*z,b+v.z*o*z,N+v.x*o*C,x+v.y*o*C,b+v.z*o*C,o*.075,p.r,p.g,p.b,1,0,0,0])}}},ring(t,a,n,o={}){if(n<=0||n>=1)return;const{width:e=.1,colour:r="#FFFDF6",dashes:l=4,seed:v=3}=o,c=q(t),s=q(a).clone().normalize(),[f,L]=ft(s),M=K(n),u=e*(.1+.7*M),P=e*.16*(1-n)**1.4,d=O(r,"#FFFDF6"),y=e*.02;P>e*.004&&B(k,[c.x+s.x*y,c.y+s.y*y,c.z+s.z*y,f.x*u,f.y*u,f.z*u,L.x*u,L.y*u,L.z*u,d.r,d.g,d.b,1,Math.max(0,1-P/u),0,0]);const h=st(v*131+7)()*Math.PI*2,p=j((n-.05)/.8);if(p>0&&p<1)for(let m=0;m<l;m++){const F=h+m/l*Math.PI*2+Math.PI/4,g=e*(.62+.55*K(p)),A=g+e*.3*(1-p),z=Math.cos(F),C=Math.sin(F),G=f.x*z+L.x*C,N=f.y*z+L.y*C,x=f.z*z+L.z*C;B(V,[c.x+G*g+s.x*y,c.y+N*g+s.y*y,c.z+x*g+s.z*y,c.x+G*A+s.x*y,c.y+N*A+s.y*y,c.z+x*A+s.z*y,e*.07*(1-p*.6),d.r,d.g,d.b,1,0,0,0])}},accent(t,a,n={}){if(a<=0||a>=1)return;const{kind:o="ticks",size:e=.1}=n,r=q(t);tt.set(1,0,0).applyQuaternion(w.camera.quaternion),ot.set(0,1,0).applyQuaternion(w.camera.quaternion);const l=n.up?q(n.up).clone().normalize():ot,v=n.colour?O(n.colour).clone():et();if(o==="ring"){const s=new i.Vector3().crossVectors(tt,l).normalize();at.ring(r,s,a,{width:e*2,colour:v,dashes:0});return}const c=new i.Vector3().crossVectors(l,new i.Vector3().crossVectors(tt,l)).normalize();for(let s=-1;s<=1;s++){const f=s*.62,L=l.x*Math.cos(f)+c.x*Math.sin(f),M=l.y*Math.cos(f)+c.y*Math.sin(f),u=l.z*Math.cos(f)+c.z*Math.sin(f),P=K(j(a/.45)),d=j((a-.45)/.55),y=e*(.55+.45*d*d+.1*P),W=e*(.55+.75*P);W-y<e*.03||B(V,[r.x+L*y,r.y+M*y,r.z+u*y,r.x+L*W,r.y+M*W,r.z+u*W,e*.11*(1-d*.5),v.r,v.g,v.b,1,0,0,0])}},dot(t,a,n,o=1){const e=q(t),r=O(n,it);B(U,[e.x,e.y,e.z,a,r.r,r.g,r.b,o,0,0,0])},blob(t,a,n,o=1,e=4){const r=q(t),l=O(n,"#FFFDF6");B(T,[r.x,r.y,r.z,a,l.r,l.g,l.b,1,o*1.37+.5,e,0])},trail(t,a,n={}){const{spacing:o=.06,size:e=.01,count:r=14,gap:l=.05,alpha:v=1}=n,c=O(n.colour,it).clone(),s=(F,g)=>{const A=t(F);return A.isVector3?g.copy(A):g.fromArray(A)},f=Vt(t),M=1/Math.max(1,Math.round(f/(8*o))),u=l+r*o,P=new i.Vector3,d=new i.Vector3;let y=0,W=Math.floor(a/M);const h=24,p=new Float32Array(h+1),m=new Float32Array(h+1);for(let F=0;F<64&&y<u;F++,W--){const g=W*M,A=g+M;s(g,P),p[0]=g,m[0]=0;for(let x=1;x<=h;x++){const b=g+M*x/h;s(b,d),p[x]=b,m[x]=m[x-1]+P.distanceTo(d),P.copy(d)}const z=m[h];if(z<1e-6){if(g<-2)break;continue}let C=z;if(a<A){const x=j((a-g)/M)*h,b=Math.min(h-1,Math.floor(x));C=m[b]+(m[b+1]-m[b])*(x-b)}const G=Math.max(1,Math.round(z/o)),N=z/G;for(let x=G-1;x>=0;x--){const b=x*N;if(b>C)continue;const J=y+(C-b);if(J<l)continue;if(J>u)break;let I=0;for(;I<h-1&&m[I+1]<b;)I++;const dt=(b-m[I])/Math.max(1e-9,m[I+1]-m[I]);s(p[I]+(p[I+1]-p[I])*dt,d);const nt=j((J-l)/(r*o)),yt=j((J-l)/(o*.8)),mt=e*(.45+.55*K(yt))*(1-.6*nt),rt=v*(1-Math.max(0,nt-.55)/.45);rt>.01&&B(U,[d.x,d.y,d.z,mt,c.r,c.g,c.b,rt,x+W*31,0,0])}if(y+=C,g<=0&&a>=0&&W<=0)break}},dispose(){for(const t of S)t.geo.dispose(),t.mat.dispose()}};return at}const vt=new WeakMap;function Vt(w){let R=vt.get(w);if(R===void 0){const Q=new i.Vector3,T=new i.Vector3,U=(V,k)=>{const S=w(V);return S.isVector3?k.copy(S):k.fromArray(S)};R=0,U(0,Q);for(let V=1;V<=64;V++)U(V/64,T),R+=Q.distanceTo(T),Q.copy(T);vt.set(w,R)}return R}export{Bt as createFX};
