import*as o from"three";import{RoundedBoxGeometry as rt}from"three/addons/geometries/RoundedBoxGeometry.js";import{GLSL_COMMON as ve,GLSL_FRAG as We,PALETTE as bt,PENCIL as Mt,OUTLINE_INK as St,INTERIOR as zt,LINE as ze,lin as ae}from"./core.js";import{CELLS as X,PITCH as W}from"./cube-layout.js";import{clamp as N,outCubic as Ne,inOutSine as Ct,spring as At,seeded as nt,hash01 as Ve,smoothstep as Pt}from"../ease.js";const p=X.length/6,V=.925*W,De={ink:.19,soft:.24,paper:.19},Y=3*W+V/2,K=2*Y,H=new Int8Array(p*3),k=new Float32Array(p*3),me=new Float32Array(p*3),Ee=new Float32Array(p),st=new Float32Array(p),it=new Float32Array(p);for(let n=0;n<p;n++){const d=[X[n*6],X[n*6+1],X[n*6+2]];H.set(d,n*3),k.set(d.map(a=>a*W),n*3);const s=d.map(a=>Math.abs(a)===3?Math.sign(a):0),x=Math.hypot(...s);me.set(s.map(a=>a/x),n*3),Ee[n]=X[n*6+3],st[n]=X[n*6+4],it[n]=X[n*6+5]}const Dt=Object.freeze({count:p,pitch:W,block:V,edge:K,radius:De});function Ot(n=["teal","green","yellow","coral","carnelian","violet","blue"]){const d=[];for(let s=0;s<p;s++){const x=k[s*3],a=-k[s*3+2],B=k[s*3+1],C=(.8*x+.6*a)/1.54,v=B/1.095;let O=.5+.34*C-.3*v+(Ve("band"+s)-.5)*.16;O=N(O,0,.9999),d.push(bt[n[Math.floor(O*n.length)]])}return d}function Ft(n="corner"){const d=new Float32Array(p);for(let a=0;a<p;a++){const B=H[a*3]/3,C=H[a*3+1]/3,v=H[a*3+2]/3,O=Ve("rank"+a);if(n==="bottom")d[a]=(C+1)/2*.9+O*.1;else if(n==="top")d[a]=(1-C)/2*.9+O*.1;else if(n==="random")d[a]=O;else if(n==="spiral")d[a]=(C+1)/2*.75+(Math.atan2(v,B)/(2*Math.PI)+.5)*.25;else{const P=n&&n.corner?n.corner:[1,-1,1],U=Math.hypot(...P),pe=Math.hypot(B-P[0]/U*Math.sqrt(3),C-P[1]/U*Math.sqrt(3),v-P[2]/U*Math.sqrt(3));d[a]=pe/(2*Math.sqrt(3))*.92+O*.08}}let s=1/0,x=-1/0;for(const a of d)s=Math.min(s,a),x=Math.max(x,a);for(let a=0;a<p;a++)d[a]=(d[a]-s)/(x-s||1);return d}function Te(n,d=.6){if(n<=0||n>=1)return{y:0,sy:1,sxz:1};let s=0,x=1;if(n<.2){const a=n/.2;x=1-.15*Math.sin(Math.PI/2*a)}else if(n<.3){const a=(n-.2)/.1;x=.85+.3*Ne(a),s=d*.18*a*a}else if(n<.72){const a=(n-.3)/.42;s=d*(.18+.82*Math.sin(Math.PI*a)-.18*a),x=1.15-.17*Math.sin(Math.PI*Math.min(1,a*1.6))+(a>.7?.06*(a-.7)/.3:0),a>.92&&(s=d*.18*(1-(a-.92)/.08)*0+s)}else{const a=(n-.72)/.28;x=1-.15*Math.exp(-5*a)*Math.cos(Math.PI*2.3*a)*(1-a),s=0}return s=Math.max(0,s),n>.62&&n<.72&&(x+=(.85-x)*Pt(.62,.72,n)),{y:s,sy:x,sxz:1/Math.sqrt(x)}}function Qe(n,d=1,s=1){if(n<=0||n>=1)return{sy:1,shear:0};const x=n-.05*d,a=Math.exp(-3.8*Math.max(0,x))*(1-n)*s;return{sy:1+.1*a*Math.sin(Math.PI*2*2.2*x),shear:.12*d*a*Math.sin(Math.PI*2*1.7*x+.5)}}function lt(n){if(n<=0)return{lift:0,sn:1,st:1,spin:0,colour:0,flash:0,ring:0};if(n>=1)return{lift:0,sn:1,st:1,spin:0,colour:1,flash:0,ring:0};let d=0,s=1,x=0,a=0,B=0,C=0;if(n<.13){const v=n/.13;d=-.12*Math.sin(Math.PI/2*v),s=1-.2*Math.sin(Math.PI/2*v)}else if(n<.6){const v=(n-.13)/.47;d=-.12+1.02*Math.sin(Math.PI*v)+.12*v,s=v<.25?.8+.42*Ne(v/.25):1.22-.22*Math.min(1,(v-.25)/.35)+(v>.75?.08*(v-.75)/.25:0),x=Math.PI/2*Ct(v),a=v>.45?1:0,B=v>.45?Math.max(0,1-(v-.45)/.35):0}else{const v=(n-.6)/.4;a=1,s=1-.24*Math.exp(-6*v)*Math.cos(Math.PI*2.4*v)*(1-v),d=-.05*Math.exp(-6*v)*(1-v),C=v}return{lift:d,sn:s,st:1/Math.sqrt(Math.max(.5,s)),spin:x,colour:a,flash:B,ring:C}}const je=`
${ve}
attribute vec3 aColour;
attribute vec4 aState;   // colour mix, flash, detach (0 in place .. 1 flying), seed
uniform float uHull;     // hull width (CSS px at 720p) for inner edges; 0 for the body
uniform float uHullOut;  // hull width where the block's edge is part of the cube's silhouette
uniform float uHullSun;  // extra width on the sun side (covered by the rim hull)
uniform float uBlock;
varying vec3 vWorld; varying vec3 vN; varying vec3 vLocal; varying vec3 vLocalN; varying vec3 vCubeN; varying vec3 vCubeP;
varying vec3 vCentre; varying vec3 vColour; varying vec4 vState; varying float vSun;
void main() {
  mat4 m = modelMatrix * instanceMatrix;
  vec4 wp = m * vec4(position, 1.0);
  vec3 wn = normalize(mat3(m) * normal);
  vSun = 0.0;
  if (uHull > 0.0) {
    float sc = length(m[0].xyz);
    float dist = length(cameraPosition - wp.xyz);
    // outward-facing parts of outer blocks draw the thick silhouette line, inner edges the thin one
    vec3 cn = normalize(mat3(instanceMatrix) * normal);
    vec3 c = instanceMatrix[3].xyz;
    float outward = length(c) > 1e-4 ? smoothstep(0.35, 0.6, dot(cn, normalize(c))) : 0.0;
    outward = max(outward, aState.z);
    float sun = smoothstep(0.05, 0.35, dot(wn, uKeyDir));
    sun *= step(0.5, outward);                    // the rim (and the room for it) only on the cube's own silhouette
    float px = (mix(uHull, uHullOut, outward) + uHullSun * sun) * uLineScale;
    wp.xyz += wn * min(px * uPx * dist, 0.12 * uBlock * sc);
    vSun = sun;
  }
  vWorld = wp.xyz; vN = wn; vLocal = position; vLocalN = normal;
  vCubeN = normalize(mat3(instanceMatrix) * normal);
  vCubeP = (instanceMatrix * vec4(position, 1.0)).xyz;
  vCentre = instanceMatrix[3].xyz;
  vColour = aColour; vState = aState;
  gl_Position = projectionMatrix * viewMatrix * wp;
}`,Lt=`
${ve}
${We}
uniform vec3 uClay; uniform vec3 uPencil; uniform float uBlock;
uniform float uReal; uniform float uHalf; uniform float uFootAO; uniform vec3 uFootTint;
uniform mat4 modelMatrix;
uniform vec4 uGroundPl; uniform float uGrassLine;
// the lawn hides the foot: below a ragged line of grass just above the ground the plate's own lawn
// shows (unshadowed, as grass in front of the box is; on the side away from the sun, in its shadow)
float grassCut(vec3 w) {
  if (uGrassLine <= 0.0) return 0.0;
  float h = dot(w, uGroundPl.xyz) - uGroundPl.w;
  float n = vnoise(vec3(w.x * 2.6 / uGrassLine, 0.0, w.z * 2.6 / uGrassLine)) * 0.6 + vnoise(vec3(w.xz * 0.09 / uGrassLine, 3.0)) * 0.4;
  return h < uGrassLine * (0.35 + 0.9 * n) ? 1.0 : 0.0;
}
vec4 lawnHere(vec3 n) {
  vec2 uv = gl_FragCoord.xy / uResolution * uPlateMap.xy + uPlateMap.zw;
  vec3 c = textureLod(uPlate, clamp(uv, 0.002, 0.998), 0.0).rgb;
  vec2 lh = uKeyDir.xz / max(length(uKeyDir.xz), 1e-4);
  vec2 nh = n.xz / max(length(n.xz), 1e-4);
  float sh = 1.0 - smoothstep(-0.55, -0.05, dot(nh, lh));
  return vec4(c * mix(vec3(1.0), vec3(0.36, 0.42, 0.56), sh), 1.0);
}
varying vec3 vWorld; varying vec3 vN; varying vec3 vLocal; varying vec3 vLocalN; varying vec3 vCubeN; varying vec3 vCubeP;
varying vec3 vCentre; varying vec3 vColour; varying vec4 vState; varying float vSun;
void main() {
  if (grassCut(vWorld) > 0.5) { gl_FragColor = lawnHere(normalize(vN)); return; }
  float hs = uBlock * 0.5;
  vec3 a = abs(vLocal) / hs;
  float mx = max(a.x, max(a.y, a.z)), mn = min(a.x, min(a.y, a.z));
  float mid = a.x + a.y + a.z - mx - mn;                    // near 1 on an edge
  float mixc = vState.x;
  vec3 colour = vColour;
  if (uStyle > 1.5) colour = desat(colour, 0.09);
  vec3 base = mix(uClay, colour, mixc);
  if (uStyle > 1.5) {
    // painted wood: brush streaks along each face, grain under the paint, worn lighter edges
    vec3 n = abs(vLocalN);
    vec2 f = n.x > 0.5 ? vLocal.yz : n.y > 0.5 ? vLocal.xz : vLocal.xy;
    float dir = step(0.5, fract(vState.w * 7.0));
    vec2 g = dir > 0.5 ? f.yx : f;
    float streak = fbm(vec3(g.x * 7.0, g.y * 95.0, vState.w * 31.0));
    float grain = fbm(vec3(g.x * 3.0 + streak, g.y * 40.0, vState.w * 11.0));
    base *= 0.93 + 0.11 * streak + 0.04 * (grain - 0.5);
    float wear = smoothstep(0.82, 0.97, mid) * smoothstep(0.35, 0.75, fbm(vLocal * 60.0 + vState.w * 5.0));
    base = mix(base, mix(base, vec3(0.93, 0.89, 0.80), 0.45), wear * mixc);
  }
  base = mix(base, vec3(1.0, 0.985, 0.95), vState.y * 0.6);
  // occlusion in the gaps: sides that face a neighbour, deeper is darker
  vec3 out_ = length(vCentre) > 1e-4 ? normalize(vCentre) : vec3(0.0, 1.0, 0.0);
  float facing = dot(vCubeN, out_);
  float depth = clamp(0.5 - dot(vCubeP - vCentre, out_) / uBlock, 0.0, 1.0);
  float occl = 1.0 - (1.0 - smoothstep(0.25, 0.75, facing)) * (0.3 + 0.45 * depth) * (1.0 - vState.z);
  vec3 N = normalize(vN);
  vec3 V = normalize(cameraPosition - vWorld);
  // the clay's shade is warmer and lighter than a coloured block's
  gShade = mix(vec3(1.06, 1.02, 0.93), vec3(1.0), mixc);
  gSat = mix(1.0, 1.2, mixc);
  float footH = clamp((vCubeP.y + uHalf) / (2.0 * uHalf), 0.0, 1.0);   // 0 at the cube's foot .. 1 at its top
  vec3 col;
  if (uReal > 0.5) {
    // on a plate: the plate's sun face by face; the warm rim only on the cube's own edges
    vec3 c = vCentre, ac = abs(c);
    float thr = uHalf - uBlock;
    vec3 outer = vec3(step(thr, ac.x) * sign(c.x), step(thr, ac.y) * sign(c.y), step(thr, ac.z) * sign(c.z));
    float edges = abs(outer.x) + abs(outer.y) + abs(outer.z);
    vec3 cn = normalize(vCubeN);
    float rimK = edges > 1.5 ? smoothstep(0.55, 0.8, dot(cn, normalize(outer))) : 0.0;
    // the light is judged by the cube face this part belongs to: the outer face it looks along most
    vec3 face = cn;
    float best = 0.2;
    if (abs(outer.x) > 0.5 && cn.x * outer.x > best) { best = cn.x * outer.x; face = vec3(outer.x, 0.0, 0.0); }
    if (abs(outer.y) > 0.5 && cn.y * outer.y > best) { best = cn.y * outer.y; face = vec3(0.0, outer.y, 0.0); }
    if (abs(outer.z) > 0.5 && cn.z * outer.z > best) { best = cn.z * outer.z; face = vec3(0.0, 0.0, outer.z); }
    vec3 NL = normalize(mix(N, normalize(mat3(modelMatrix) * face), (uStyle < 0.5 ? 0.97 : 0.85) * (1.0 - vState.z)));
    float bounceK = exp(-footH / 0.2) * (1.0 - vState.z);
    col = lightBox(base, N, NL, V, occl, 0.5, rimK, bounceK);
    // the grass and the ground hide the foot from the sky: a short soft gradient on the lowest blocks
    float k = uFootAO * (1.0 - smoothstep(0.0, 0.11, footH)) * (1.0 - vState.z);
    col *= mix(vec3(1.0), uFootTint, k * (1.3 - 0.3 * smoothstep(0.0, 0.05, footH)));
  } else {
    col = lightPlayer(base, N, V, occl, 0.0, 0.5, 1.0);
  }
  gShade = vec3(1.0); gSat = 1.2;
  if (uStyle > 1.5) col *= 1.0 - 0.10 * smoothstep(0.85, 0.99, mid);       // paper: a faint edge darkening
  col = haze(shoulder(col), length(cameraPosition - vWorld));
  gl_FragColor = linearToOutputTexel(vec4(col, 1.0));
}`,ct=`
${ve}
${We}
uniform vec3 uOutline; uniform vec3 uPencil; uniform float uRimMode;
uniform vec4 uGroundPl; uniform float uGrassLine;
varying vec3 vWorld; varying vec4 vState; varying float vSun;
void main() {
  if (uGrassLine > 0.0) {
    float h = dot(vWorld, uGroundPl.xyz) - uGroundPl.w;
    float n = vnoise(vec3(vWorld.x * 2.6 / uGrassLine, 0.0, vWorld.z * 2.6 / uGrassLine)) * 0.6 + vnoise(vec3(vWorld.xz * 0.09 / uGrassLine, 3.0)) * 0.4;
    if (h < uGrassLine * (0.35 + 0.9 * n)) discard;
  }
  vec3 c = mix(uPencil, uOutline, vState.x);
  if (uRimMode > 0.5) { if (vSun < 0.5) discard; c = uRimColor; }
  gl_FragColor = linearToOutputTexel(vec4(haze(c, length(cameraPosition - vWorld)), 1.0));
}`,kt=`
${ve}
attribute vec4 aBlade;   // x, z (object frame, metres), height (m), seed
attribute vec4 aClump;   // width (m), outward direction (radians, object frame), tone, blade count
uniform float uSize;
varying vec2 vQ; varying vec4 vBlade; varying vec4 vClump; varying vec2 vRoot; varying float vSpread; varying float vShade; varying float vPxW;
void main() {
  vec3 base = (modelMatrix * vec4(aBlade.x, 0.0, aBlade.y, 1.0)).xyz;
  vec3 right = normalize(vec3(viewMatrix[0][0], 0.0, viewMatrix[2][0]) + 1e-6);
  float sy = length(modelMatrix[1].xyz);
  vec3 p = base + right * position.x * aClump.x * 0.5 + vec3(0.0, (position.y * 0.5 + 0.5) * aBlade.z * sy, 0.0);
  vQ = vec2(position.x, position.y * 0.5 + 0.5);
  vBlade = aBlade; vClump = aClump;
  vec4 r0 = projectionMatrix * viewMatrix * vec4(base, 1.0);
  vec4 r1 = projectionMatrix * viewMatrix * vec4(base + right * uSize * 0.5, 1.0);
  vec2 s0 = (r0.xy / r0.w * 0.5 + 0.5) * uResolution, s1 = (r1.xy / r1.w * 0.5 + 0.5) * uResolution;
  vRoot = s0; vSpread = length(s1 - s0);
  vPxW = length(s1 - s0) / (uSize * 0.5) * aClump.x;      // the card's width in pixels
  vec3 n = normalize(mat3(modelMatrix) * vec3(sin(aClump.y), 0.0, cos(aClump.y)));
  vec2 lh = uKeyDir.xz / max(length(uKeyDir.xz), 1e-4);
  vShade = 1.0 - smoothstep(-0.55, -0.05, dot(n.xz, lh));   // only the side away from the sun stands in the cube's shadow
  gl_Position = projectionMatrix * viewMatrix * vec4(p, 1.0);
}`,Ht=`
${ve}
${We}
uniform float uBladeW; uniform float uShadowK; uniform vec3 uGrassShade;
varying vec2 vQ; varying vec4 vBlade; varying vec4 vClump; varying vec2 vRoot; varying float vSpread; varying float vShade; varying float vPxW;
float h11(float n) { return fract(sin(n * 127.1) * 43758.5453); }
void main() {
  float a = 0.0, tt = 0.0, sd0 = 0.0;
  float aa = max(fwidth(vQ.x), 1e-4) * 0.75;
  // half-width of a blade at its root, in card units (at least about 0.6 px, so far blades stay whole)
  float hw0 = max(uBladeW / (vClump.x * 0.5), 1.2 / max(vPxW, 1.0));
  for (int i = 0; i < 12; i++) {
    float fi = float(i);
    if (fi >= vClump.w) break;
    float sd = vBlade.w * 17.0 + fi * 3.1;
    float x0 = -0.82 + 1.64 * h11(sd);
    float hgt = 0.42 + 0.58 * h11(sd + 1.0);
    float lean = (h11(sd + 2.0) - 0.5) * 1.5 * (0.5 + hgt);
    float t = vQ.y / hgt;
    if (t > 1.0) continue;
    float x = x0 + lean * t * t;
    float w = hw0 * (0.75 + 0.5 * h11(sd + 4.0)) * pow(1.0 - t, 0.75) + aa * 0.3;
    float ai = 1.0 - smoothstep(w - aa, w + aa, abs(vQ.x - x));
    if (ai > a) { a = ai; tt = t; sd0 = sd; }
  }
  if (a < 0.04) discard;
  vec3 c;
  if (uPlateOn > 0.5) {
    // this blade's own sample of the lawn around the foot (beside and in front of it)
    vec2 off = vec2((h11(sd0 + 5.0) - 0.5) * 2.4, -0.08 - 0.45 * h11(sd0 + 6.0)) * vSpread;
    c = plateAt(vRoot + off, 1.0);
    c = mix(c, plateAt(vRoot + off * vec2(-0.6, 1.3), 2.0), 0.35);
  } else c = uBounce;
  c *= (0.78 + 0.3 * h11(sd0 + 7.0)) * (0.9 + 0.16 * vClump.z);
  c *= mix(0.6, 1.0, smoothstep(0.0, 0.5, tt));                                  // the root, in the clump's own shade
  c = mix(c, c * vec3(1.08, 1.07, 0.9), smoothstep(0.6, 1.0, tt) * 0.45);       // the tip catches the sun
  c = mix(c, c * uGrassShade, vShade * uShadowK);                                // in the cube's shadow
  vec4 o = linearToOutputTexel(vec4(c, 1.0));
  gl_FragColor = vec4(o.rgb * a, a);
}`;function Et(n,d={}){const s=d.size||1,x=s/K,a={},B=e=>{const t=De[e]||De.ink;if(!a[t]){const i=new rt(V,V,V,3,V*t);i.setAttribute("aColour",C),i.setAttribute("aState",v),a[t]=i}return a[t]},C=new o.InstancedBufferAttribute(new Float32Array(p*3),3),v=new o.InstancedBufferAttribute(new Float32Array(p*4),4);v.setUsage(o.DynamicDrawUsage);const O=B(n.style),P={...n.light,uClay:{value:ae("#F7F2E8")},uPencil:{value:ae(Mt)},uOutline:{value:ae(St)},uBlock:{value:V},uHull:{value:0},uHullOut:{value:0},uHullSun:{value:0},uRimMode:{value:0},uGroundPl:{value:new o.Vector4(0,1,0,-1e9)},uGrassLine:{value:0},uReal:{value:0},uHalf:{value:Y},uFootAO:{value:0},uFootTint:{value:new o.Color(.5,.56,.5)}},U=new o.ShaderMaterial({vertexShader:je,fragmentShader:Lt,uniforms:P});U.extensions={derivatives:!0};const pe=new o.ShaderMaterial({vertexShader:je,fragmentShader:ct,uniforms:{...P,uHull:{value:ze.inner},uHullOut:{value:ze.silhouette},uHullSun:{value:ze.rim},uRimMode:{value:0}},side:o.BackSide,polygonOffset:!0,polygonOffsetFactor:3,polygonOffsetUnits:6}),Ke=new o.ShaderMaterial({vertexShader:je,fragmentShader:ct,uniforms:{...P,uHull:{value:.001},uHullOut:{value:ze.rim},uHullSun:{value:0},uRimMode:{value:1}},side:o.BackSide,polygonOffset:!0,polygonOffsetFactor:1.5,polygonOffsetUnits:3}),D=new o.InstancedMesh(O,U,p),Z=new o.InstancedMesh(O,pe,p),re=new o.InstancedMesh(O,Ke,p);Z.instanceMatrix=re.instanceMatrix=D.instanceMatrix,D.instanceMatrix.setUsage(o.DynamicDrawUsage),D.frustumCulled=Z.frustumCulled=re.frustumCulled=!1,Z.renderOrder=re.renderOrder=1;const Ue=new rt(5.6*W,5.6*W,5.6*W,2,.5*W),qe=new o.MeshBasicMaterial({color:ae(zt)}),ne=new o.Mesh(Ue,qe),_e=new o.Matrix4,ut=new o.Vector3(1,1,1),ht=new o.Vector3,ft=new o.Quaternion;let Ce=!1,Ae=!1;for(const e of[ne.position,ne.scale])for(const t of["x","y","z"]){let i=e[t];Object.defineProperty(e,t,{get(){return i},set(h){i=h,Ae=!0},enumerable:!0,configurable:!0})}ne.updateMatrix=function(){if(o.Object3D.prototype.updateMatrix.call(this),!Ce||Ae)return;const e=this.quaternion;e.x===0&&e.y===0&&e.z===0&&e.w===1&&this.matrix.premultiply(_e)};const q=new o.Group,ye=new o.Group,se=new o.Group;q.add(D,re,Z,ne),q.position.y=Y,ye.add(q),se.add(ye),se.scale.setScalar(x);const G=new o.Group;G.add(se);const _=new o.InstancedBufferGeometry;_.setAttribute("position",new o.BufferAttribute(new Float32Array([-1,-1,0,1,-1,0,1,1,0,-1,1,0]),3)),_.setIndex([0,1,2,0,2,3]);const Pe=[];{const e=nt(77),t=s/2,i=56,h=1.2;for(let g=0;g<4;g++){const m=g*Math.PI/2,y=Math.cos(m),f=Math.sin(m);for(let T=0;T<i;T++){const I=-h+2*h*(T+e())/i,ee=g+(I+h)/(2*h);if(Math.sin(ee*4.7+1.3)+.7*Math.sin(ee*11.3+4.2)+(e()-.5)*.9<-1.05)continue;const b=s*(.004+.08*Math.pow(e(),1.7));let w,M,F;if(Math.abs(I)<=1)w=I*t,M=t+b,F=0;else{const te=(Math.abs(I)-1)/(h-1)*(Math.PI/4),$=Math.sign(I),j=b+s*.012;w=$*(t+Math.sin(te)*j),M=t+Math.cos(te)*j,F=$*te}const L=e()<.11,Q=L?s*(.15+.08*e()):s*(.05+.085*Math.pow(e(),1.2)),A=s*(.04+.09*e())*(L?.8:1);Pe.push([w*y+M*f,-w*f+M*y,Q,e()*100,A,F+m,e(),(L?4:7)+Math.floor(e()*6)])}}}const Oe=Pe.length,$e=new Float32Array(Oe*4),Xe=new Float32Array(Oe*4);Pe.forEach((e,t)=>{$e.set(e.slice(0,4),t*4),Xe.set(e.slice(4,8),t*4)}),_.setAttribute("aBlade",new o.InstancedBufferAttribute($e,4)),_.setAttribute("aClump",new o.InstancedBufferAttribute(Xe,4)),_.instanceCount=Oe;const xe=new o.ShaderMaterial({vertexShader:kt,fragmentShader:Ht,uniforms:{...n.light,uSize:{value:s},uBladeW:{value:s*.0075},uShadowK:{value:1},uGrassShade:{value:new o.Color(.2,.24,.36)}},transparent:!0,side:o.DoubleSide,blending:o.CustomBlending,blendSrc:o.OneFactor,blendDst:o.OneMinusSrcAlphaFactor});xe.extensions={derivatives:!0};const ge=new o.Mesh(_,xe);ge.frustumCulled=!1,ge.renderOrder=2,G.add(ge);let ie=d.ground==="grass";const we=(d.colours||Ot()).map(e=>ae(e));we.forEach((e,t)=>C.setXYZ(t,e.r,e.g,e.b));const le=new Float32Array(p),be=new Float32Array(p).fill(-1),Fe=new Float32Array(p),Ye=new Uint8Array(p),Le=new Map;let r;const ke=()=>{r={t:0,breathe:0,hop:0,hopH:.6,wobble:0,wobbleAmt:1,wobbleDir:[.7,0,.7],twists:[],burst:0,burstOpts:{},gather:-1,gatherOpts:{},turn:null},be.fill(-1),Fe.fill(0)};ke();const Ze=new Float32Array(p).map((e,t)=>Ve("seed"+t));for(let e=0;e<p;e++)v.setW(e,Ze[e]);const E=new o.Matrix4,ce=new o.Quaternion,J=new o.Quaternion,ue=new o.Vector3,Me=new o.Vector3,z=new o.Vector3,S=new o.Vector3,He=new o.Vector3,dt=new o.Vector3,he={x:new o.Vector3(1,0,0),y:new o.Vector3(0,1,0),z:new o.Vector3(0,0,1)},Be={x:0,y:1,z:2},fe=new o.Quaternion,de=new o.Vector3,Je=new o.Vector3,Bt=new o.Color(1,1,1),Gt=new o.Color,vt=(()=>{const e=nt(2024),t=[];for(let i=0;i<p;i++){const h=[k[i*3],k[i*3+1],k[i*3+2]],g=h[0]+(e()-.5)*.5,m=h[1]+.7+e()*.6,y=h[2]+(e()-.5)*.5,f=Math.hypot(g,m,y);t.push([g/f,m/f,y/f,.75+e()*.6,e()*2-1,e()*2-1,e()*2-1,(e()*2-1)*5])}return t})(),u={object:G,count:p,size:s,layout:{grid:H,base:k,normal:me},reset(){return ke(),u},pose(e={}){ke(),e.t!==void 0&&u.breathe(e.t,e.breathe??1),e.hop!==void 0&&u.hop(e.hop,e.hopHeight),e.wobble!==void 0&&u.wobble(e.wobble);for(const t of e.twists||[])u.twistLayer(...t);typeof e.colour=="number"?u.setAllColour(e.colour):e.colour&&u.colourFront(e.colour.progress,e.colour.order,e.colour);for(const[t,i]of e.pops||[])u.popBlock(t,i);return e.burst!==void 0&&u.burst(e.burst),e.gather!==void 0&&u.gather(e.gather),e.turn&&u.turnToward(e.turn.direction,e.turn.amount),u},breathe(e,t=1){return r.t=e,r.breathe=t,u},hop(e,t=.6){return r.hop=e,r.hopH=t,u},wobble(e,t=1,i=[.7,0,.7]){return r.wobble=e,r.wobbleAmt=t,r.wobbleDir=i,u},twistLayer(e,t,i){return r.twists.push([e,t,i]),u},popBlock(e,t){return be[e]=t,u},setColour(e,t){return le[e]=t,u},setAllColour(e){return le.fill(e),u},colourFront(e,t="corner",i={}){const{width:h=.14,pop:g=!0}=i,m=t instanceof Float32Array||Array.isArray(t)?t:mt(t);for(let y=0;y<p;y++){const f=N((e*(1+h)-m[y])/h);g?(be[y]=f>0&&f<1?f:-1,le[y]=f>=1?1:f>0?lt(f).colour:0):(le[y]=f*f*(3-2*f),Fe[y]=f>0&&f<1?Math.sin(Math.PI*f)*.5:0)}return u},burst(e,t={}){return r.burst=e,r.burstOpts=t,u},gather(e,t={}){return r.gather=e,r.gatherOpts=t,u},turnToward(e,t=1,i={}){return r.turn={d:Array.isArray(e)?new o.Vector3().fromArray(e):e.clone(),amount:t,...i},u},hideBlock(e,t=!0){return Ye[e]=t?1:0,u},override(e,t){return t?Le.set(e,t.clone()):Le.delete(e),u},layerBlocks(e,t){const i=[],h=new o.Vector3;for(let g=0;g<p;g++)pt(g,h),Math.round(h.getComponent(Be[e]))===t&&i.push(g);return i},blockMatrix(e,t=new o.Matrix4){return D.getMatrixAt(e,t),t.premultiply(q.matrixWorld)},blockPosition(e,t=new o.Vector3){return u.blockMatrix(e,E),t.setFromMatrixPosition(E)},setColours(e){return e.forEach((t,i)=>{const h=ae(t);we[i]=h,C.setXYZ(i,h.r,h.g,h.b)}),C.needsUpdate=!0,u},colourOf(e){return we[e]},shadowOpacity:1,setStyle(e){Z.visible=e==="ink";const t=B(e);D.geometry=Z.geometry=re.geometry=t},setGround(e){return ie=e==="grass",u},update(e){yt(e)},dispose(){for(const e of Object.values(a))e.dispose();U.dispose(),pe.dispose(),Ke.dispose(),Ue.dispose(),qe.dispose(),_.dispose(),xe.dispose()}};let et;Object.defineProperty(u,"hideCore",{get(){return et},set(e){et=e,Ae=!0},enumerable:!0,configurable:!0});const Ge=new Map;function mt(e){const t=typeof e=="string"?e:JSON.stringify(e);return Ge.has(t)||Ge.set(t,Ft(e)),Ge.get(t)}function pt(e,t){t.set(H[e*3],H[e*3+1],H[e*3+2]);for(const[i,h,g]of r.twists)Math.round(t.getComponent(Be[i]))===h&&t.applyAxisAngle(he[i],g);return t}function yt(e){const t=Te(r.hop,r.hopH);se.position.y=t.y*s-(ie?.03*s:0),ge.visible=ie&&!!e.plate;const i=e.plate?1:0,h=1-N(t.y/.06);if(P.uReal.value=i,P.uFootAO.value=i*(ie?.55:.32)*h,xe.uniforms.uShadowK.value=1-N(t.y/.5),i&&ie){G.updateMatrixWorld();const l=G.matrixWorld.elements[12],b=G.matrixWorld.elements[14],w=e.groundHeight(l,b);e.groundNormal(l,b,S),P.uGroundPl.value.set(S.x,S.y,S.z,S.x*l+S.y*w+S.z*b),P.uGrassLine.value=.045*s}else P.uGrassLine.value=0;if(r.turn){G.updateMatrixWorld(),ue.copy(r.turn.d).normalize(),fe.setFromRotationMatrix(G.matrixWorld).invert(),ue.applyQuaternion(fe);const l=Math.atan2(ue.x,ue.z),b=Math.asin(N(ue.y,-1,1)),w=r.turn.maxYaw??.7,M=r.turn.maxPitch??.3;ye.rotation.set(-N(b,-M,M)*r.turn.amount,N(l,-w,w)*r.turn.amount,0,"YXZ")}else ye.rotation.set(0,0,0);ne.visible=!u.hideCore&&r.burst<.04&&(r.gather<0||r.gather>.96);{const l=r.hop>0&&r.hop<1,b=r.wobble>0&&r.wobble<1;let w=1,M=0,F=0;if(l||b){for(let L=0;L<=4;L++){const Q=L/4;let A=1;l&&(A*=Te(r.hop-.025*Q,r.hopH).sy),b&&(A*=Qe(r.wobble,Q,r.wobbleAmt).sy),A<w&&(w=A)}if(b){const L=Qe(r.wobble,.5,r.wobbleAmt).shear*K;M=L*r.wobbleDir[0],F=L*r.wobbleDir[2]}}Ce=w!==1||M!==0||F!==0,Ce&&_e.compose(ht.set(M,-Y*(1-w),F),ft,ut.set(1,w,1))}const g=r.t,m=r.breathe,y=r.burst,f=r.burstOpts,T=r.gather,I=r.gatherOpts,ee=new o.Vector3;G.updateMatrixWorld(!0);for(let l=0;l<p;l++){z.set(k[l*3],k[l*3+1],k[l*3+2]),S.set(me[l*3],me[l*3+1],me[l*3+2]),ce.identity();let b=1,w=1,M=Fe[l],F=0,L=le[l];if(m){const c=.5+.5*Math.sin(g*(Math.PI/2)+Ee[l]),R=.5+.5*Math.sin(g*Math.PI+Ee[l]*1.4);z.addScaledVector(S,m*.42*(Math.max(0,st[l])+it[l]*c+.025*R))}const Q=be[l];if(Q>0&&Q<1){const c=lt(Q);z.addScaledVector(S,c.lift*W),b=c.sn,w=c.st;const R=Math.abs(S.y)>.9?he.x:he.y;Me.crossVectors(S,R).normalize(),ce.setFromAxisAngle(Me,c.spin),M=Math.max(M,c.flash),c.lift>.05&&(F=Math.min(1,c.lift)),c.ring>0&&c.ring<1&&(He.copy(z).addScaledVector(S,V*.5),q.localToWorld(de.copy(He)),Je.copy(S).transformDirection(q.matrixWorld),e.fx.ring(de,Je,c.ring,{width:V*x,colour:we[l],seed:l+1}))}ee.set(H[l*3],H[l*3+1],H[l*3+2]);for(const[c,R,oe]of r.twists)Math.round(ee.getComponent(Be[c]))===R&&(J.setFromAxisAngle(he[c],oe),z.applyQuaternion(J),S.applyQuaternion(J),ce.premultiply(J),ee.applyAxisAngle(he[c],oe));let A=0;if(y>0&&(A=y),T>=0&&T<1){const c=I.stagger??.35,R=Ze[l]*c,oe=N((T-R)/(1-c));A=1-At(oe*1.1,{response:.55,dampingRatio:.55})}else T>=1&&y<=0&&(A=0);if(A!==0){const c=vt[l],R=(f.distance??I.distance??1)*K*c[3],oe=f.gravity??I.gravity??.7,wt=f.spin??I.spin??1,Se=Math.abs(A),at=Math.sign(A),Re=at*Ne(Se)*R;z.x+=c[0]*Re,z.z+=c[2]*Re,z.y+=c[1]*Re-at*oe*K*Se*Se,Me.set(c[4],c[5],c[6]).normalize(),J.setFromAxisAngle(Me,c[7]*wt*A),ce.premultiply(J),F=Math.max(F,Math.min(1,Se*4))}const te=(k[l*3+1]+Y)/K;let $=1,j=1,Ie=0;if(r.hop>0&&r.hop<1){const c=Te(r.hop-.025*te,r.hopH);$*=c.sy,j*=c.sxz}if(r.wobble>0&&r.wobble<1){const c=Qe(r.wobble,te,r.wobbleAmt);$*=c.sy,Ie=c.shear,j*=1/Math.sqrt(c.sy)}const gt=z.y+Y;z.y=-Y+gt*$,z.x*=j,z.z*=j,z.x+=Ie*K*r.wobbleDir[0],z.z+=Ie*K*r.wobbleDir[2];const ot=Le.get(l);if(Ye[l])E.makeScale(0,0,0);else if(ot)E.copy(q.matrixWorld).invert().multiply(ot);else{E.makeRotationFromQuaternion(ce);const c=xt(S,b,w,j,$);E.premultiply(c),E.setPosition(z)}D.setMatrixAt(l,E),v.setXYZ(l,L,M,F)}if(D.instanceMatrix.needsUpdate=!0,v.needsUpdate=!0,u.shadowOpacity>0){const l=r.burst>0?1-N(r.burst*3):1;if(l>.01){de.set(0,0,0),se.localToWorld(de),fe.setFromRotationMatrix(G.matrixWorld);const b=He.set(1,0,0).applyQuaternion(fe).multiplyScalar(s*.5*t.sxz),w=dt.set(0,0,1).applyQuaternion(fe).multiplyScalar(s*.5*t.sxz),M=e.plate?1.5:1;e.shadows.cast(de,b,w,{opacity:u.shadowOpacity*l*M,shape:0,round:.22,size:s,extent:s*t.sy*.92})}}}const tt=new o.Matrix4;function xt(e,t,i,h,g){const m=tt.elements,y=t-i,f=[i+y*e.x*e.x,y*e.x*e.y,y*e.x*e.z,y*e.y*e.x,i+y*e.y*e.y,y*e.y*e.z,y*e.z*e.x,y*e.z*e.y,i+y*e.z*e.z];return m[0]=f[0]*h,m[4]=f[1]*h,m[8]=f[2]*h,m[12]=0,m[1]=f[3]*g,m[5]=f[4]*g,m[9]=f[5]*g,m[13]=0,m[2]=f[6]*h,m[6]=f[7]*h,m[10]=f[8]*h,m[14]=0,m[3]=0,m[7]=0,m[11]=0,m[15]=1,tt}return u}export{Dt as CUBE,Ot as bandColours,Et as createCube,Te as hopShape,Ft as orderRanks,lt as popShape,Qe as wobbleShape};
