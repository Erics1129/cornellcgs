import*as i from"three";import{mergeVertices as gt}from"three/addons/utils/BufferGeometryUtils.js";const D=(o=0,t=0,s=0)=>new i.Vector3(o,t,s),z=(o,t=0,s=1)=>Math.min(s,Math.max(t,o)),_=(o,t,s)=>{const a=z((s-o)/(t-o));return a*a*(3-2*a)},tt=(o,t,s)=>o+(t-o)*s;function Y(o){return()=>{o|=0,o=o+1831565813|0;let t=Math.imul(o^o>>>15,1|o);return t=t+Math.imul(t^t>>>7,61|t)^t,((t^t>>>14)>>>0)/4294967296}}const Z=[.94,-.34],ct=Math.hypot(Z[0],Z[1]),L=[Z[0]/ct,Z[1]/ct];function xt(o,t){const s=(90-o)*Math.PI/180,a=D(Math.sin(t),0,-Math.cos(t)),l=a.clone().multiplyScalar(Math.sin(s)).setY(Math.cos(s)).normalize(),r=Math.asin(Math.sin(s)/1.333),n=a.clone().multiplyScalar(Math.sin(r)).setY(Math.cos(r)).normalize();return{air:l,water:n}}const E=[[-.2,-10.5,6.2],[.36,-9.4,4.3],[-.34,-8.1,2.35],[.32,-6.8,.4],[-.3,-5.5,-1.5],[.14,-4.3,-3.4],[0,-3.6,-4.8]],lt=[[-1.75,1.45,26],[1.8,-.55,26]],yt=[[-2.85,3.9,14],[2.3,5.6,12],[-2.6,-5.2,13],[-2.9,6.4,10],[3.1,-8.6,12],[-3.6,-10.8,10],[3.4,.9,9],[-.6,-13.5,12]],G=new i.CatmullRomCurve3(E.map(o=>D(...o)),!1,"centripetal"),J=new i.Matrix4,$=new i.Quaternion,et=D(0,1,0),At=G.getLength(),bt=D(E[E.length-1][0]-E[0][0],0,E[E.length-1][2]-E[0][2]).normalize();function ut(o){const t=z(o,0,1),s=G.getPointAt(t),a=G.getTangentAt(t).normalize(),l=.02,r=G.getTangentAt(z(t-l)),n=G.getTangentAt(z(t+l)),u=(r.x*n.z-r.z*n.x)/(2*l*At);return{p:s,t:a,turn:u}}const Mt=[[0,.62,.1,2.45,.3,-.5,62],[.4,.46,.12,2.4,.27,-.52,62],[.66,-.3,.12,2.4,-.26,-.54,62],[1,-.62,.12,2.45,-.3,-.5,62]];function Ct(o){const t=Mt,s=t.length;if(o<=t[0][0])return t[0].slice(1);if(o>=t[s-1][0])return t[s-1].slice(1);let a=0;for(;o>t[a+1][0];)a++;const l=t[a+1][0]-t[a][0],r=(o-t[a][0])/l,n=r*r,u=n*r,h=2*u-3*n+1,c=u-2*n+r,M=-2*u+3*n,w=u-n,T=(x,y)=>{if(x<=0||x>=s-1)return 0;const A=(t[x][y]-t[x-1][y])/(t[x][0]-t[x-1][0]),S=(t[x+1][y]-t[x][y])/(t[x+1][0]-t[x][0]);return A*S<=0?0:Math.sign(A)*Math.min(Math.abs(A),Math.abs(S),Math.abs((t[x+1][y]-t[x-1][y])/(t[x+1][0]-t[x-1][0])))};return t[a].slice(1).map((x,y)=>{const A=y+1;return h*t[a][A]+c*l*T(a,A)+M*t[a+1][A]+w*l*T(a+1,A)})}function Tt(o){o=z(Number(o)||0);const t=ut(o);J.lookAt(t.p,t.p.clone().add(t.t),et);const s=new i.Quaternion().setFromRotationMatrix(J),a=z(t.turn*1.1,-.3,.3);s.multiply($.setFromAxisAngle(D(0,0,1),-a));const[l,r,n,u,h,c]=Ct(o),M=ut(o-.03),w=D();for(let R=-4;R<=4;R++)w.add(G.getPointAt(z(o-.025+R*.03)));w.multiplyScalar(1/9);const y=bt.clone().negate().applyAxisAngle(et,-l).multiplyScalar(Math.cos(r)).setY(Math.sin(r)).normalize().multiplyScalar(n),A=w.add(y);J.lookAt(A,t.p,et);const S=new i.Quaternion().setFromRotationMatrix(J),B=Math.tan(c*Math.PI/360),H=B*(16/9);return S.multiply($.setFromAxisAngle(D(0,1,0),Math.atan(u*H))),S.multiply($.setFromAxisAngle(D(1,0,0),Math.atan(-h*B))),S.multiply($.setFromAxisAngle(D(0,0,1),z(-M.turn*.7,-.07,.07))),{hero:{p:t.p.toArray(),q:s.toArray()},camera:{p:A.toArray(),q:S.toArray(),fov:c}}}const St=xt(50,.12),qt={sigma:[.2,.07,.108],wUp:[.045,.42,.31],wHor:[.004,.084,.078],wDown:[.0015,.021,.026],lobe:2,sunE:[3.6,3.25,2.55],skyE:[.42,.7,.78],skyZen:[.35,.75,1.3],skyHor:[1.5,1.75,1.85],sun:St,cauF:2.4,cauGain:.34,cauLod:2,slopeGain:1.1,hazeK:.42,surface:{cap:.03,swell:.9,nearM:6,glit:1.4},shaftK:.07,shaftLod:3.2,shaftMix:.3,maxD:32,exposure:1.05,wb:[1.22,1,.98],vignette:.4,specks:4200,speckSize:.001,speckBright:.55,box:8,drift:[.06,-.004,-.02],rockCount:26,rockDetail:3,floorSegs:150,rockTint:[.5,.4,.35],moss:[.08,.055,.03],tint:[.42,.27,.2],hero:E,cam:[[0,2.1,.1,.6,.6,58],[1,2.1,.1,-.5,.6,60]],trunks:lt.map(([o,t])=>[o,t]),anchors:{start:E[0],gap:[.05,-6.9,.5],trunk:[-2.55,-8.6,1.6],canopy:[.5,-1.5,-8],floor:[.9,null,6.6],end:E[E.length-1]},focus:2.1,aperture:22,dof:{focus:2.6,near:12,far:1.5,max:20},hue:.34,key:.75,flight:Tt},Ft=`
uniform vec2 uCurrent;
float softplus(float x) { return x > 14.0 ? x : log(1.0 + exp(x)); }
// hold: holdfast xyz, plant phase; st: helix angle, helix radius, twist (rad/m), stipe seed
vec3 stipeAt(float s, vec4 hold, vec4 st) {
  float seed = st.w;
  float H = -hold.y - 0.42 - 0.5 * seed;                 // it rises to just under the surface
  float k = 0.75;
  float rise = s - k * softplus((s - H) / k);            // = s low down, then flat at H
  float run = max(s - rise, 0.0);                        // the length lying along the surface
  float hk = clamp(rise / H, 0.0, 1.0);
  vec3 c = vec3(uCurrent.x, 0.0, uCurrent.y), side = vec3(-uCurrent.y, 0.0, uCurrent.x);
  float sa = (seed - 0.5) * 1.5;
  vec3 runDir = c * cos(sa) + side * sin(sa);
  // the stipes twist loosely round each other, gathered at the holdfast, spreading toward the top
  float r = st.y * mix(0.5, 1.0, smoothstep(0.0, 1.6, s)) * (1.0 + 0.8 * hk);
  float a = st.x + s * st.z;
  vec3 p = hold.xyz + vec3(cos(a) * r, rise, sin(a) * r);
  // each stipe wanders a little on its own, so the bundle is never a set of parallel rods
  p += (side * sin(s * 0.83 + seed * 23.0 + uTime * 0.21) + c * sin(s * 0.61 + seed * 41.0)) * 0.09 * smoothstep(0.5, 2.5, s);
  // the column leans downstream, more toward the top, and curves with its own slow bend
  p += c * (hk * hk) * H * 0.11 + side * sin(hk * 2.6 + hold.w * 3.0) * 0.35 * hk;
  // one slow travelling wave of the current through the whole forest
  float wave = sin(uTime * 0.38 - dot(hold.xz, uCurrent) * 0.15 - rise * 0.21 + hold.w);
  float sw = sin(uTime * 0.27 - hold.x * 0.08 + rise * 0.12 + hold.w * 1.7);
  p += (c * (0.2 + 0.5 * wave) + side * 0.32 * sw) * pow(hk, 1.4) * 1.35;
  // the canopy: along the surface downstream, rocking a little with the swell
  p += runDir * run;
  p.y -= 0.05 * run * (0.5 + 0.5 * sin(run * 0.8 + uTime * 0.6 + seed * 9.0));
  return p;
}
vec3 stipeTan(float s, vec4 hold, vec4 st) { return normalize(stipeAt(s + 0.07, hold, st) - stipeAt(s - 0.07, hold, st)); }
`,zt=`
attribute vec2 aUV;              // x: along the blade 0..1, y: across -1..1
attribute vec4 iHold, iSt, iB;   // iB: s on the stipe, angle round it, length, width
attribute float iSeed;
varying vec3 vW, vN; varying vec2 vUv; varying float vSeed, vShade;
void main() {
  float s = iB.x;
  vec3 B = stipeAt(s, iHold, iSt);
  vec3 T = stipeTan(s, iHold, iSt);
  vec3 ref = abs(T.y) < 0.92 ? vec3(0.0, 1.0, 0.0) : vec3(1.0, 0.0, 0.0);
  vec3 o1 = normalize(cross(T, ref)), o2 = cross(T, o1);
  vec3 outD = o1 * cos(iB.y) + o2 * sin(iB.y);
  vec3 c = vec3(uCurrent.x, 0.0, uCurrent.y);
  float surf = smoothstep(-1.6, -0.7, B.y);
  float fl = sin(uTime * 1.15 + s * 1.9 + iSeed * 6.28 + iHold.w);
  float fl2 = sin(uTime * 0.71 + s * 0.7 + iSeed * 11.0);
  // every blade streams downstream, a little up the stipe and out from it
  float j1 = fract(iSeed * 7.13), j2 = fract(iSeed * 3.71), j3 = fract(iSeed * 5.37);
  // in the canopy the blades lie flat on the water, they do not stand up from the floating stipe
  outD.y *= mix(1.0, 0.12, surf); outD = normalize(outD);
  vec3 D = normalize(c * (0.5 + 0.55 * j1 + 0.25 * fl2) + T * mix(0.2 + 0.5 * j2, 0.05, surf) + outD * (0.4 + 0.7 * j3));
  vec3 sideD = normalize(cross(D, vec3(0.0, 1.0, 0.0)) + vec3(1e-4));
  float L = iB.z;
  vec3 bend = (vec3(0.0, -(0.14 + 0.62 * j2 * j2) * (1.0 - surf) - 0.04, 0.0) + sideD * (0.18 * fl + 0.45 * (j3 - 0.5)) + c * 0.1) * L;
  float u = aUV.x;
  vec3 C = B + outD * 0.03 + D * (L * u) + bend * (u * u);
  vec3 Tu = normalize(D * L + 2.0 * bend * u);
  vec3 w0 = normalize(cross(Tu, outD) + vec3(1e-4)), n0 = cross(w0, Tu);
  float tw = (iSeed - 0.5) * 2.4 + u * 1.3 * fl;
  vec3 W = w0 * cos(tw) + n0 * sin(tw);
  vec3 N = cross(W, Tu);
  float v = aUV.y, hw = iB.w * 0.5;
  // the ruffled margin waves out of the blade's plane; the blade folds a little along its centre
  float ruf = v * v * hw * 0.55 * sin(u * 31.0 + iSeed * 20.0 + uTime * 1.3 + iHold.w) * smoothstep(0.04, 0.25, u);
  float crease = -abs(v) * hw * 0.22;
  vec3 p = C + W * (v * hw) + N * (ruf + crease);
  vN = normalize(N + W * (v * 0.6) + N * 0.0);
  vW = p; vUv = vec2(u, v); vSeed = iSeed;
  // the column's own shade: low down and deep inside a thick plant it is darker
  float hk = clamp((B.y - iHold.y) / max(-iHold.y, 1.0), 0.0, 1.0);
  vShade = mix(0.45, 1.0, smoothstep(0.0, 0.55, hk)) * (0.62 + 0.6 * fract(iSeed * 13.7)) * mix(0.55, 1.0, smoothstep(0.0, 0.55, u));
  gl_Position = projectionMatrix * viewMatrix * vec4(p, 1.0);
}`,Bt=`
uniform sampler2D uBlade;
uniform vec3 uAlb, uTrans;
uniform float uCover;
varying vec3 vW, vN; varying vec2 vUv; varying float vSeed, vShade;
void main() {
  vec4 tx = texture2D(uBlade, vec2(vUv.y * 0.5 + 0.5, vUv.x));
  float a = uCover > 0.5 ? clamp((tx.a - 0.5) / max(fwidth(tx.a), 0.02) + 0.5, 0.0, 1.0) : step(0.5, tx.a);
  if (a < 0.02) discard;
  vec3 p = vW;
  float dist = length(p - uCam); vec3 V = (p - uCam) / dist;
  vec3 N = normalize(vN); if (dot(N, V) > 0.0) N = -N;
  // wrinkles across the blade bend its normal
  float wr = sin(vUv.x * 46.0 + vSeed * 30.0 + sin(vUv.y * 3.0) * 1.5) * (1.0 - smoothstep(2.0, 6.0, length(vW - uCam)));
  vec3 sun = sunAt(p) * causticAt(p, 1.0);
  float ndl = max(dot(N, uSunW) + 0.07 * wr, 0.0);
  float through = max(-dot(N, uSunW), 0.0);              // the sun on the blade's far side
  float fwd = pow(max(dot(V, uSunW), 0.0), 2.4);          // looking toward the sun through the blade
  vec3 alb = uAlb * tx.rgb;
  float thin = 0.75 + 0.5 * smoothstep(0.55, 0.95, tx.a) * (1.0 - tx.g);
  vec3 col = alb * (sun * ndl * 0.85 + skyAt(p) * (0.32 + 0.22 * N.y));
  // near the surface the light is still white and the glow would go rust: keep it amber
  vec3 tcol = uTrans * mix(vec3(0.6, 1.2, 1.0), vec3(1.0), smoothstep(-0.6, -4.5, p.y));
  col += tcol * tx.rgb * sun * (through * 0.42 + fwd * 1.45 + 0.035) * thin;
  col *= vShade;
  gl_FragColor = vec4(fogW(col, dist, V), a);
}`,Ht=`
attribute vec2 aR;               // x: 0..1 along, y: angle round
attribute vec4 iHold, iSt;
attribute vec2 iLen;             // length (m), radius (m)
varying vec3 vW, vN; varying float vH;
void main() {
  float s = aR.x * iLen.x;
  vec3 C = stipeAt(s, iHold, iSt);
  vec3 T = stipeTan(s, iHold, iSt);
  vec3 ref = abs(T.y) < 0.92 ? vec3(0.0, 1.0, 0.0) : vec3(1.0, 0.0, 0.0);
  vec3 o1 = normalize(cross(T, ref)), o2 = cross(T, o1);
  vec3 n = o1 * cos(aR.y) + o2 * sin(aR.y);
  float r = iLen.y * mix(1.6, 0.7, smoothstep(0.0, 0.4, aR.x));
  vec3 p = C + n * r;
  vW = p; vN = n; vH = clamp((C.y - iHold.y) / max(-iHold.y, 1.0), 0.0, 1.0);
  gl_Position = projectionMatrix * viewMatrix * vec4(p, 1.0);
}`,Nt=`
uniform vec3 uAlb, uTrans;
varying vec3 vW, vN; varying float vH;
void main() {
  vec3 p = vW; float dist = length(p - uCam); vec3 V = (p - uCam) / dist;
  vec3 N = normalize(vN);
  vec3 sun = sunAt(p) * causticAt(p, 1.0);
  float fwd = pow(max(dot(V, uSunW), 0.0), 3.0);
  vec3 col = uAlb * 0.8 * (sun * max(dot(N, uSunW) * 0.7 + 0.3, 0.0) + skyAt(p) * 0.45) + uTrans * 0.45 * sun * fwd;
  col *= mix(0.45, 1.0, smoothstep(0.0, 0.5, vH));
  gl_FragColor = vec4(fogW(col, dist, V), 1.0);
}`,Vt=`
attribute vec2 aUV;              // x: 0..1 along, y: -1..1 across
attribute vec4 iHold, iSt;
attribute vec2 iLen;             // length, half width
varying vec3 vW; varying vec2 vUv; varying float vH;
void main() {
  float s = aUV.x * iLen.x;
  vec3 C = stipeAt(s, iHold, iSt);
  vec3 T = stipeTan(s, iHold, iSt);
  vec3 toC = normalize(C - uCam);
  vec3 sd = normalize(cross(T, toC) + vec3(1e-4));
  float hw = iLen.y * smoothstep(0.0, 0.12, aUV.x) * (1.0 - smoothstep(-2.2, -1.2, C.y));   // the canopy is in the surface's map
  // the blades stream downstream: the curtain's centre sits a little down-current of the stipes
  vec3 c = vec3(uCurrent.x, 0.0, uCurrent.y);
  vec3 p = C + sd * (aUV.y * hw) + c * hw * 0.35;
  vW = p; vUv = vec2(aUV.y * 0.5 + 0.5, s / (iLen.y * 4.2) + iHold.w); vH = clamp((C.y - iHold.y) / max(-iHold.y, 1.0), 0.0, 1.0);
  gl_Position = projectionMatrix * viewMatrix * vec4(p, 1.0);
}`,kt=`
uniform sampler2D uCurtain;
uniform vec3 uAlb, uTrans;
uniform float uCover;
varying vec3 vW; varying vec2 vUv; varying float vH;
void main() {
  vec4 tx = texture2D(uCurtain, vUv);
  float a = uCover > 0.5 ? clamp((tx.a - 0.5) / max(fwidth(tx.a), 0.02) + 0.5, 0.0, 1.0) : step(0.5, tx.a);
  if (a < 0.02) discard;
  vec3 p = vW; float dist = length(p - uCam); vec3 V = (p - uCam) / dist;
  vec3 sun = sunAt(p) * causticAt(p, 2.0);
  float fwd = pow(max(dot(V, uSunW), 0.0), 3.0);
  vec3 col = uAlb * tx.rgb * (sun * 0.3 + skyAt(p) * 0.32) + uTrans * tx.rgb * sun * (fwd * 0.8 + 0.06);
  col *= mix(0.4, 1.0, smoothstep(0.0, 0.5, vH));
  gl_FragColor = vec4(fogW(col, dist, V), a);
}`,Rt=`
attribute vec4 iP;               // x, y, z, scale
varying vec3 vW, vN;
void main() {
  vec3 p = iP.xyz + position * iP.w;
  vW = p; vN = normal;
  gl_Position = projectionMatrix * viewMatrix * vec4(p, 1.0);
}`,It=`
uniform vec3 uAlb;
varying vec3 vW, vN;
void main() {
  vec3 p = vW; float dist = length(p - uCam); vec3 V = (p - uCam) / dist;
  vec3 N = normalize(vN);
  float strands = 0.6 + 0.4 * sin(atan(p.z, p.x) * 23.0 + p.y * 9.0);
  vec3 col = uAlb * strands * (sunAt(p) * causticAt(p, 0.0) * max(dot(N, uSunW), 0.0) + skyAt(p) * (0.4 + 0.4 * N.y));
  gl_FragColor = vec4(fogW(col, dist, V), 1.0);
}`,Et=`
attribute vec4 iF;               // loop centre x, y, z, seed
attribute vec4 iG;               // loop radius, speed (rad/s), size, kind (0 blacksmith, 1 garibaldi)
varying vec3 vW; varying float vKind, vShade;
void main() {
  float a = uTime * iG.y + iF.w * 6.2831853;
  vec3 o = vec3(cos(a) * iG.x, 0.35 * sin(a * 0.6 + iF.w * 9.0), sin(a) * iG.x * 0.55);
  vec3 vel = normalize(vec3(-sin(a) * iG.x, 0.21 * cos(a * 0.6 + iF.w * 9.0), cos(a) * iG.x * 0.55) * sign(iG.y) + vec3(1e-4));
  vec3 rt = normalize(cross(vel, vec3(0.0, 1.0, 0.0)));
  vec3 up = cross(rt, vel);
  vec3 lp = position * iG.z;
  lp.z += sin(uTime * 8.0 + iF.w * 40.0 + lp.x * 14.0 / iG.z) * 0.12 * iG.z * smoothstep(0.0, -0.4, position.x);
  vec3 p = iF.xyz + o + vel * lp.x + up * lp.y + rt * lp.z;
  vW = p; vKind = iG.w; vShade = position.y;
  gl_Position = projectionMatrix * viewMatrix * vec4(p, 1.0);
}`,Ut=`
varying vec3 vW; varying float vKind, vShade;
void main() {
  float dist = length(vW - uCam); vec3 V = (vW - uCam) / dist;
  vec3 alb = vKind > 0.5 ? vec3(0.62, 0.16, 0.012) : vec3(0.025, 0.03, 0.04);
  vec3 col = alb * (sunAt(vW) * (0.3 + 1.6 * smoothstep(-0.1, 0.4, vShade)) + skyAt(vW) * 0.5);
  gl_FragColor = vec4(fogW(col, dist, V), 1.0);
}`;function X(o){const t=Y(o),s=new Float32Array(1024);for(let l=0;l<1024;l++)s[l]=t();const a=(l,r)=>s[(l*73856093^r*19349663)&1023];return(l,r)=>{const n=Math.floor(l),u=Math.floor(r);let h=l-n,c=r-u;return h=h*h*(3-2*h),c=c*c*(3-2*c),tt(tt(a(n,u),a(n+1,u),h),tt(a(n,u+1),a(n+1,u+1),h),c)}}function Dt(o=128,t=512){const s=X(4),a=X(9),l=new Uint8ClampedArray(o*t*4);for(let r=0;r<t;r++){const n=(r+.5)/t;let u=.5*Math.pow(_(0,.2,n),.7)*Math.sqrt(Math.max(0,1-Math.pow(n,3.5)))*(.86+.14*Math.sin(n*Math.PI));const h=(n-.045)/.045,c=Math.abs(h)<1?.22*Math.sqrt(1-h*h):0;u=Math.max(u*_(.09,.13,n),c,n<.13?.035:0),u*=1+.045*Math.sin(n*23+1.3)+.03*Math.sin(n*57);const M=.012*Math.pow(Math.abs(Math.sin(n*140)),12)*_(.08,.2,n),w=(u+M)*o*.98;for(let T=0;T<o;T++){const x=Math.abs(T+.5-o/2),y=z(w-x+.5),A=(r*o+T)*4,S=z((w-x)/Math.max(3,w*.35)),B=.72+.42*s(T*.05,r*.018)*(.6+.4*a(T*.17,r*.05)),H=.94+.07*Math.sin(r*.16+Math.sin(T*.07)*1.8)*a(T*.08,r*.02),R=1+.12*Math.exp(-Math.pow(x/2.2,2))*_(.06,.2,n)*(1-n),P=n<.095?1.12+.25*(1-Math.abs((n-.045)/.045)):.62+.38*_(.1,.24,n),W=1+.32*(1-S),N=B*H*R*P*W;l[A]=z(.62*N*(1+.1*(1-S)))*255,l[A+1]=z(.4*N*(.96+.06*a(T*.3,r*.1)))*255,l[A+2]=z(.12*N)*255,l[A+3]=y*255}}return l}function Wt(o=128,t=512){const s=Y(31),a=new Float32Array(o*t),l=new Float32Array(o*t),r=X(12),n=(h,c,M,w,T,x)=>{const y=Math.cos(M),A=Math.sin(M),S=Math.ceil(w*1.5);for(let B=0;B<=S;B++){const H=B/S,R=T*Math.sin(Math.min(1,H*1.2+.1)*Math.PI)*(1-.4*H),P=h+y*w*H-A*H*H*w*.18,W=c+A*w*H+H*H*w*.25;for(let N=-R;N<=R;N+=.7){const U=Math.round(P-A*N),j=Math.round(W+y*N);for(const K of[j,j-t,j+t]){if(U<0||U>=o||K<0||K>=t)continue;const F=K*o+U;a[F]=1,l[F]=Math.max(l[F],x*(.8+.2*(1-Math.abs(N)/(R+.01))))}}}};for(let h=0;h<230;h++){const c=s()*t,M=o/2+Math.sin(c*.03)*6+(s()-.5)*18,w=s()<.72?1:-1,T=(w>0?0:Math.PI)+(s()-.5)*.9+.35*w;n(M,c,T,24+s()*34,2.2+s()*2.6,.6+.6*s())}const u=new Uint8ClampedArray(o*t*4);for(let h=0;h<o*t;h++){const c=h%o,M=h/o|0,w=l[h]*(.75+.5*r(c*.06,M*.03));u[h*4]=z(.66*w)*255,u[h*4+1]=z(.46*w)*255,u[h*4+2]=z(.17*w)*255,u[h*4+3]=a[h]*255}return u}function ht(o,t,s,a,l=!0){const r=o(new i.DataTexture(t,s,a,i.RGBAFormat));return r.colorSpace=l?i.SRGBColorSpace:i.NoColorSpace,r.wrapS=i.ClampToEdgeWrapping,r.wrapT=i.RepeatWrapping,r.generateMipmaps=!0,r.minFilter=i.LinearMipmapLinearFilter,r.magFilter=i.LinearFilter,r.anisotropy=8,r.flipY=!1,r.needsUpdate=!0,r}function vt(o,t){const s=[],a=[],l=[];for(let n=0;n<=o;n++)for(let u=0;u<=t;u++)s.push(0,0,0),a.push(n/o,u/t*2-1);for(let n=0;n<o;n++)for(let u=0;u<t;u++){const h=n*(t+1)+u,c=h+1,M=h+t+1,w=M+1;l.push(h,M,c,c,M,w)}const r=new i.InstancedBufferGeometry;return r.setAttribute("position",new i.Float32BufferAttribute(s,3)),r.setAttribute("aUV",new i.Float32BufferAttribute(a,2)),r.setIndex(l),r}function _t(o,t){const s=[],a=[],l=[];for(let n=0;n<=o;n++)for(let u=0;u<t;u++)s.push(0,0,0),a.push(Math.pow(n/o,1.15),u/t*Math.PI*2);for(let n=0;n<o;n++)for(let u=0;u<t;u++){const h=n*t+u,c=n*t+(u+1)%t,M=h+t,w=c+t;l.push(h,M,c,c,M,w)}const r=new i.InstancedBufferGeometry;return r.setAttribute("position",new i.Float32BufferAttribute(s,3)),r.setAttribute("aR",new i.Float32BufferAttribute(a,2)),r.setIndex(l),r}function Lt(){const o=X(21);let t=new i.IcosahedronGeometry(1,3);t.deleteAttribute("normal"),t.deleteAttribute("uv"),t=gt(t);const s=t.attributes.position;for(let l=0;l<s.count;l++){let r=s.getX(l),n=s.getY(l),u=s.getZ(l);const h=Math.atan2(u,r),c=1+.22*Math.sin(h*7+n*3)+.18*(o(r*3+5,u*3+n*2)-.5);n=n<0?n*.15:n*(.55+.15*Math.sin(h*5)),s.setXYZ(l,r*c,n-.05,u*c)}t.computeVertexNormals();const a=new i.InstancedBufferGeometry;return a.setAttribute("position",t.attributes.position),a.setAttribute("normal",t.attributes.normal),a.setIndex(t.index),a}function Gt(){const o=[.5,0,0,.2,.2,0,.18,-.17,0,-.18,.12,0,-.18,-.1,0,-.32,.03,0,-.32,-.02,0,-.5,.16,0,-.5,-.15,0,.05,0,.06,.05,0,-.06],t=[0,1,9,0,9,2,1,3,9,9,3,4,9,4,2,3,5,6,3,6,4,5,7,8,5,8,6,0,10,1,0,2,10,1,10,3,10,4,3,10,2,4],s=new i.InstancedBufferGeometry;return s.setAttribute("position",new i.Float32BufferAttribute(o,3)),s.setIndex(t),s}const Pt=Array.from({length:80},(o,t)=>G.getPointAt(t/79));function jt(o,t){let s=1e9;for(const a of Pt)s=Math.min(s,Math.hypot(a.x-o,a.z-t));return s}function Ot(o){const{U:t,mat:s,keep:a,WATER:l,floorJs:r,HI:n}=o,u=`#define IN_VERTEX
`+l+Ft,h=l,c=Y(5),M={value:new i.Vector2(L[0],L[1])},w={value:n?1:0},T={value:new i.Vector3(.7,.46,.34)},x={value:new i.Vector3(1.9,1.05,.5)},y=[];for(const[e,v,f]of lt)y.push({x:e,z:v,lod:0,stipes:f});for(const[e,v,f]of yt)y.push({x:e,z:v,lod:1,stipes:f});const A=3.6;for(let e=24;e>-52;e-=A)for(let v=-34;v<34;v+=A){const f=v+(c()-.5)*A*.95,p=e+(c()-.5)*A*.95,m=jt(f,p);m<2.6||y.some(C=>Math.hypot(C.x-f,C.z-p)<2.4)||y.push({x:f,z:p,lod:m<7.5?2:3,stipes:0})}const S=[];let B=0,H=0;const R=[],P=[],W=[],N=[],U=[];y.forEach((e,v)=>{const f=r(e.x,e.z),p=c()*6.28,m=[e.x,f,e.z,p];if(e.lod<=2&&U.push([e.x,f,e.z,(e.lod===0?.7:e.lod===1?.55:.42)*(.85+.3*c())]),e.lod===3){N.push([...m,c()*6.28,0,0,c(),-f+.5,.5+.3*c()]);return}const C=e.lod===2?7:e.stipes,b=e.lod===2?.34:.19;for(let d=0;d<C;d++){const g=[c()*6.28,.025+.05*c(),(c()<.5?-1:1)*(.5+.6*c()),c()],k=(-f-.42-.5*g[3])*(.55+.45*Math.sqrt(c()))+(c()<.7?1.5+c()*(e.lod===0?5:3.5):0);e.lod<=1&&W.push([...m,...g,k,.008+.003*c()]);let V=0;for(let O=.25+c()*.35;O<k-.15;O+=b*(.8+.4*c())){const it=_(k-.15,k-2.2,O)*(.55+.45*_(.25,2,O)),pt=(e.lod===2?.85:.66)*(.75+.5*c())*(.35+.65*it),mt=(e.lod===2?.19:.15)*(.8+.4*c())*(.5+.5*it),wt=V++*2.39996+g[0]+(c()-.5)*.6;(e.lod===2?P:R).push([...m,...g,O,wt,pt,mt,c()])}}});const j=s(u+zt,h+Bt,{uCurrent:M,uBlade:{value:ht(a,Dt(),128,512)},uAlb:T,uTrans:x,uCover:w},{side:i.DoubleSide,alphaToCoverage:!!n,transparent:!1});j.extensions={derivatives:!0};function K(e,v,f){if(!e.length)return;const p=a(vt(v,f)),m=e.length,C=new Float32Array(m*4),b=new Float32Array(m*4),d=new Float32Array(m*4),g=new Float32Array(m);e.forEach((k,V)=>{C.set(k.slice(0,4),V*4),b.set(k.slice(4,8),V*4),d.set(k.slice(8,12),V*4),g[V]=k[12]}),p.setAttribute("iHold",new i.InstancedBufferAttribute(C,4)),p.setAttribute("iSt",new i.InstancedBufferAttribute(b,4)),p.setAttribute("iB",new i.InstancedBufferAttribute(d,4)),p.setAttribute("iSeed",new i.InstancedBufferAttribute(g,1)),p.instanceCount=m;const I=new i.Mesh(p,j);I.frustumCulled=!1,S.push(I),B+=p.index.count/3*m,H+=m}if(K(R,n?6:4,2),K(P,2,1),W.length){const e=a(_t(n?34:20,5)),v=W.length,f=new Float32Array(v*4),p=new Float32Array(v*4),m=new Float32Array(v*2);W.forEach((b,d)=>{f.set(b.slice(0,4),d*4),p.set(b.slice(4,8),d*4),m.set(b.slice(8,10),d*2)}),e.setAttribute("iHold",new i.InstancedBufferAttribute(f,4)),e.setAttribute("iSt",new i.InstancedBufferAttribute(p,4)),e.setAttribute("iLen",new i.InstancedBufferAttribute(m,2)),e.instanceCount=v;const C=new i.Mesh(e,s(u+Ht,h+Nt,{uCurrent:M,uAlb:{value:new i.Vector3(.2,.055,.006)},uTrans:{value:new i.Vector3(.6,.2,.03)}}));C.frustumCulled=!1,S.push(C),B+=e.index.count/3*v}if(N.length){const e=a(vt(26,1)),v=N.length,f=new Float32Array(v*4),p=new Float32Array(v*4),m=new Float32Array(v*2);N.forEach((d,g)=>{f.set(d.slice(0,4),g*4),p.set(d.slice(4,8),g*4),m.set(d.slice(8,10),g*2)}),e.setAttribute("iHold",new i.InstancedBufferAttribute(f,4)),e.setAttribute("iSt",new i.InstancedBufferAttribute(p,4)),e.setAttribute("iLen",new i.InstancedBufferAttribute(m,2)),e.instanceCount=v;const C=s(u+Vt,h+kt,{uCurrent:M,uCurtain:{value:ht(a,Wt(),128,512)},uAlb:T,uTrans:x,uCover:w},{side:i.DoubleSide,alphaToCoverage:!!n});C.extensions={derivatives:!0};const b=new i.Mesh(e,C);b.frustumCulled=!1,S.push(b),B+=e.index.count/3*v}if(U.length){const e=a(Lt()),v=new Float32Array(U.length*4);U.forEach((p,m)=>v.set(p,m*4)),e.setAttribute("iP",new i.InstancedBufferAttribute(v,4)),e.instanceCount=U.length;const f=new i.Mesh(e,s(`#define IN_VERTEX
`+l+Rt,h+It,{uAlb:{value:new i.Vector3(.16,.1,.035)}}));f.frustumCulled=!1,S.push(f),B+=e.index.count/3*U.length}{const e=Y(9),v=[],f=[[-4.6,-5.6,-9.5,14],[4.4,-4.4,-12,12],[-3.2,-8.2,-4.5,9],[6.2,-7,-3.5,10],[1.5,-3.2,-16,12]];for(const[d,g,I,k]of f)for(let V=0;V<k;V++)v.push([d+(e()-.5)*3,g+(e()-.5)*2,I+(e()-.5)*3,e(),1.2+e()*1.5,(.07+.03*e())*(e()<.5?1:-1),.17+.05*e(),0]);for(const[d,g,I]of[[-2.6,-9.4,.5],[3.6,-7.2,-6.5],[-1.8,-5.4,-11]])v.push([d,g,I,e(),1.4+e(),.1,.27,1]);const p=a(Gt()),m=new Float32Array(v.length*4),C=new Float32Array(v.length*4);v.forEach((d,g)=>{m.set(d.slice(0,4),g*4),C.set(d.slice(4,8),g*4)}),p.setAttribute("iF",new i.InstancedBufferAttribute(m,4)),p.setAttribute("iG",new i.InstancedBufferAttribute(C,4)),p.instanceCount=v.length;const b=new i.Mesh(p,s(`#define IN_VERTEX
`+l+Et,h+Ut,{},{side:i.DoubleSide}));b.frustumCulled=!1,S.push(b),B+=p.index.count/3*v.length}const F=256,ot=-50,nt=-64,q=110,st=new Float32Array(F*F),ft=(e,v,f,p)=>{const m=(e-ot)/q*F,C=(v-nt)/q*F,b=p/q*F;for(let d=Math.floor(C-b*2);d<=C+b*2;d++)for(let g=Math.floor(m-b*2);g<=m+b*2;g++){if(g<0||d<0||g>=F||d>=F)continue;const I=((g-m)**2+(d-C)**2)/(b*b);st[d*F+g]+=f*Math.exp(-I)}},at=Y(17);for(const e of y){const v=r(e.x,e.z),f=-v-.6,p=e.x+L[0]*f*.11,m=e.z+L[1]*f*.11,C=e.lod===0?9:e.lod===1?6:4;for(let b=0;b<C;b++){const d=(at()-.5)*1.5,g=1.5+at()*5,I=L[0]*Math.cos(d)-L[1]*Math.sin(d),k=L[1]*Math.cos(d)+L[0]*Math.sin(d);for(let V=0;V<g;V+=.45)ft(p+I*V,m+k*V,.32,.75)}}const dt=X(3),rt=new Uint8Array(F*F);for(let e=0;e<F;e++)for(let v=0;v<F;v++){const f=st[e*F+v]*(.6+.8*dt(v*.15,e*.15));rt[e*F+v]=Math.round(255*_(.15,1.3,f)*.92)}const Q=a(new i.DataTexture(rt,F,F,i.RedFormat));return Q.magFilter=Q.minFilter=i.LinearFilter,Q.needsUpdate=!0,{objects:S,canopy:{texture:Q,map:[ot,nt,q,q]},canopyCol:[.075,.06,.014],stats:{plants:y.length,near:y.filter(e=>e.lod<=1).length,mid:y.filter(e=>e.lod===2).length,far:N.length,blades:H,triangles:Math.round(B)}}}export{qt as KELP_LOOK,Ot as createKelpForest,Tt as kelpFlight};
