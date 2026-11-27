import*as e from"three";import{RoundedBoxGeometry as O}from"three/addons/geometries/RoundedBoxGeometry.js";import{GLSL_COMMON as U,GLSL_FRAG as te,lin as k}from"../../kit/actors/core.js";import{buildShell as ae}from"./shell.js";const le="#EEE5D5",n=2,I=`
${U}
attribute vec4 aBlock;      // tone, hue, seed, floor (1 = a crater's floor)
uniform vec4 uHit;          // the pointer's point on this moon (moon-local, m) and how much it lifts
uniform float uTime;
uniform float uB;
uniform float uCore;
varying vec3 vWorld; varying vec3 vN; varying vec3 vLocal; varying vec3 vMoon; varying vec3 vNM; varying vec4 vBlock; varying vec3 vSph; varying float vRaise;
void main() {
  vec3 c = vec3(instanceMatrix[3]) + normalize(position) * 1e-4;
  vec3 rd = normalize(c);
  // the pointer: the few blocks round it rise (0.42 of a block at the middle), the rest stay
  float dh = length(c - uHit.xyz);
  float raise = uHit.w * (1.0 - smoothstep(0.8 * uB, 4.2 * uB, dh));
  float lift = raise * 0.8 * uB;
  vRaise = raise;
  // one block in about forty breathes, very slowly and very little: the clay is still settling
  float br = step(0.975, fract(aBlock.z * 37.0));
  lift += br * 0.035 * uB * (0.5 + 0.5 * sin(uTime * 0.7 + aBlock.z * 61.0));
  vec4 lp = instanceMatrix * vec4(position, 1.0);
  lp.xyz += rd * lift * (1.0 - uCore);
  vMoon = lp.xyz;
  vec4 wp = modelMatrix * lp;
  vWorld = wp.xyz;
  vNM = normalize(mat3(instanceMatrix) * normal);
  vN = normalize(mat3(modelMatrix) * vNM);
  vSph = normalize(mat3(modelMatrix) * lp.xyz);
  vLocal = position;
  vBlock = aBlock;
  gl_Position = projectionMatrix * viewMatrix * wp;
}`,Y=`
precision highp sampler3D;
${U}
${te}
uniform sampler3D uOcc;
uniform float uGridM;        // the occupancy map's edge, m (it is centred on the moon)
uniform float uB;
uniform vec3 uSunW;          // toward the sun, world
uniform vec3 uSunM;          // toward the sun, moon-local
uniform vec3 uSunCol;        // the sun on the clay (linear, with its intensity)
uniform vec3 uFillUp;        // the cavity's cool light from above-behind
uniform vec3 uFillDown;      // the cliffs' warm light from below-behind
uniform vec3 uFillCam;       // (unused)
uniform vec3 uKeyTintM;      // the sun on clay (the stage's key tint for this light)
uniform vec3 uShadeTintM;    // the shade on clay
uniform vec3 uClay;
uniform vec4 uCubeP;         // the cube's centre (world) and half edge (0: none)
uniform vec4 uPlaneP;        // the plane's centre (world) and half length (0: none)
uniform vec4 uPlaneQ;        // the plane's rotation (nose +Z, up +Y)
uniform float uLit;          // 0..1 the pointer's warmth on this moon's plan (a faint lift of the clay)
uniform float uCore;         // 1: the moon's dark core (what shows through the gaps between blocks)
uniform float uBlockPx;      // how big one block is on screen (px): small blocks shade as one smooth round
uniform float uStone;        // 0..1 how much of the stone's smooth face is left (the match in)
uniform vec3 uSeamW;         // toward the terrace's sun (world): the stone's light
uniform float uSeamK;        // its strength 0..1 (it fades as the nebula comes up)
uniform float uKeyK;         // the cluster's strength 0..1
uniform float uFill;         // the nebula's fill 0..1 (how far it has come up)
uniform vec3 uStoneHi;       // the stone, lit (linear)
uniform vec3 uStoneLo;       // the stone, its cooler side (linear)
uniform vec3 uStoneCam;      // the lens's right (x) and up (y) in world, packed as the up-left direction on screen
uniform float uWater;        // 0..1 the match out: into the water's colour
uniform vec3 uWaterTop;      // the water's colour at the top of the frame (linear)
uniform vec3 uWaterBot;      // and at the bottom
uniform vec2 uRes;           // the drawing buffer, px
varying vec3 vWorld; varying vec3 vN; varying vec3 vLocal; varying vec3 vMoon; varying vec3 vNM; varying vec4 vBlock; varying vec3 vSph; varying float vRaise;

float occAt(vec3 pm) {
  vec3 uvw = pm / uGridM + 0.5;
  if (any(lessThan(uvw, vec3(0.0))) || any(greaterThan(uvw, vec3(1.0)))) return 0.0;
  return texture(uOcc, uvw).r;
}
float sunShadow(vec3 pm, vec3 nm) {
  vec3 p = pm + nm * uB * 0.2 + uSunM * uB * 0.3;
  float T = 1.0;
  float st = uB * 0.3;
  for (int i = 0; i < 22; i++) {
    float o = occAt(p);
    T *= 1.0 - smoothstep(0.5, 0.9, o);
    if (T < 0.01) break;
    p += uSunM * st;
    st *= 1.09;
  }
  return T;
}
vec3 qinv(vec4 q, vec3 v) { vec3 u = -q.xyz; vec3 t = 2.0 * cross(u, v); return v + q.w * t + cross(u, t); }
// soft shadows of the heroes on the clay: the cube a rounded blob, the plane a thin ellipsoid
float heroShadow(vec3 ro, vec3 rd) {
  float s = 1.0;
  if (uCubeP.w > 0.0) {
    vec3 oc = uCubeP.xyz - ro; float t = dot(oc, rd);
    if (t > 0.0) { float d = length(oc - rd * t); s *= mix(0.12, 1.0, smoothstep(uCubeP.w * 0.95, uCubeP.w * 1.75, d)); }
  }
  if (uPlaneP.w > 0.0) {
    vec3 o = qinv(uPlaneQ, ro - uPlaneP.xyz), d = qinv(uPlaneQ, rd);
    vec3 k = vec3(1.0 / (uPlaneP.w * 0.95), 1.0 / (uPlaneP.w * 0.09), 1.0 / uPlaneP.w);
    o *= k; d *= k;
    float dl = length(d); d /= dl;
    float t = -dot(o, d);
    if (t > 0.0) { float m = length(o + d * t); s *= mix(0.18, 1.0, smoothstep(0.7, 1.25, m)); }
  }
  return s;
}
void main() {
  vec3 N = normalize(vN);
  vec3 NM = normalize(vNM);
  vec3 V = normalize(cameraPosition - vWorld);
  float hs = uB * 0.5;
  vec3 a = abs(vLocal) / hs;
  // which way this block points out of the moon (its own local +Y): how high on the block this fragment is
  float footH = clamp(vLocal.y / uB + 0.5, 0.0, 1.0);
  bool side = uCore < 0.5 && abs(normalize(vLocal).y) < 0.7;
  // clay: a per-block tone (hand-pressed, never two alike), a faint warm or cool cast, fine grain and the
  // smudge of a thumb across some faces
  vec3 base = uClay * (0.93 + 0.1 * vBlock.x);
  base *= mix(vec3(1.02, 0.995, 0.96), vec3(0.975, 0.99, 1.025), vBlock.y);
  float grain = fbm((uCore > 0.5 ? vMoon : vLocal) / uB * 9.0 + vBlock.z * 17.0);
  float thumb = smoothstep(0.55, 0.8, fbm(vLocal / uB * 2.3 + vBlock.z * 5.0)) * step(0.6, fract(vBlock.z * 7.0));
  base *= 0.965 + 0.06 * grain - 0.035 * thumb;
  // close to the lens (a block tens of pixels across) the clay shows what it is: a coarser grain, the smear of a
  // thumb drawn across the face, tiny pits where air was pressed out, and a little dust settled in the hollows
  float close = smoothstep(22.0, 70.0, uBlockPx) * (1.0 - uCore);
  float pits = 0.0;
  if (close > 0.001) {
    float g2 = fbm(vLocal / uB * 23.0 + vBlock.z * 31.0);
    vec2 sm = vLocal.xz / uB * vec2(2.2, 6.5) + vBlock.z * 9.0;
    float smear = smoothstep(0.35, 0.75, fbm(vec3(sm, vBlock.x * 4.0)));
    pits = smoothstep(0.72, 0.86, fbm(vLocal / uB * 41.0 + vBlock.y * 13.0));
    base *= 1.0 + close * (0.075 * (g2 - 0.5) - 0.035 * smear - 0.12 * pits);
  }
  base *= mix(1.0, 0.9, vBlock.w);   // a crater's floor: older, a little darker
  // occlusion: the neighbours (from the map) and the crevice at each block's foot
  float res = smoothstep(1.8, 6.0, uBlockPx);   // 1: the blocks are resolved; 0: they are finer than the pixels
  float ao = 1.0 - 0.5 * occAt(vMoon + NM * uB * 0.55) - 0.22 * occAt(vMoon + NM * uB * 1.15);
  ao = mix(0.9, ao, res);
  if (uCore > 0.5) { ao = mix(0.86, 0.32, res); base *= mix(0.97, 0.8, res); }
  if (side) ao *= mix(0.3, 1.0, smoothstep(0.05, 0.8, footH));
  ao = clamp(ao, 0.0, 1.0);
  // the sun. Each fragment is lit by a blend of the moon's own round normal and its block face's normal (as the
  // kit's lightBox lights the cube): the moon's terminator reads at once, and every block still shows a lit face
  // and a shaded face. On top: the real shadows of the blocks on each other, marched through the map, which
  // lengthen toward the terminator.
  vec3 rdM = normalize(vMoon);
  vec3 sph = normalize(vSph);
  vec3 Nd = normalize(mix(sph, N, 0.36 * res));
  if (close > 0.001) {
    vec3 q = vLocal / uB * 17.0 + vBlock.z * 7.0;
    vec3 gq = vec3(fbm(q + vec3(0.7, 0.0, 0.0)) - fbm(q - vec3(0.7, 0.0, 0.0)), fbm(q + vec3(0.0, 0.7, 0.0)) - fbm(q - vec3(0.0, 0.7, 0.0)), fbm(q + vec3(0.0, 0.0, 0.7)) - fbm(q - vec3(0.0, 0.0, 0.7)));
    Nd = normalize(Nd + normalize(gq + 1e-5) * 0.09 * close * length(gq));
  }
  float ndl = dot(Nd, uSunW);
  float ndlF = dot(N, uSunW);
  float diff = smoothstep(-0.03, 0.5, ndl) * uKeyK;
  float T = diff > 0.001 ? mix(1.0, sunShadow(vMoon, NM), res) : 0.0;
  T *= heroShadow(vWorld + N * 0.004, uSunW);
  float lit = diff * mix(0.35, 1.0, T) * mix(mix(1.0, 0.72, res), 1.0, smoothstep(-0.2, 0.4, ndlF));
  vec3 litC = base * vec3(1.05, 1.0, 0.9) * uKeyTintM * 1.1;
  // the shade: deep dusk blue, darker toward the moon's belly, its crevices darker still
  float belly = clamp(0.5 - 0.5 * dot(sph, uSunW), 0.0, 1.0);
  vec3 shadeC = base * uShadeTintM * mix(0.44, 0.22, belly) * mix(0.5, 1.0, ao);
  vec3 col = mix(shadeC, litC, lit);
  // warmth just inside the terminator, where the light grazes
  col += base * uKeyTintM * vec3(0.07, 0.025, -0.01) * smoothstep(0.1, 0.35, lit) * (1.0 - smoothstep(0.4, 0.75, lit));
  // the nebula behind lights the limb on the dark side: warm from the cliffs below, cool from the cavity above
  float ndv = clamp(dot(N, V), 0.0, 1.0);
  float limb = pow(1.0 - clamp(dot(sph, V), 0.0, 1.0), 1.7);
  float hi = clamp(0.5 + 0.5 * sph.y, 0.0, 1.0);
  col += base * mix(uFillDown, uFillUp, smoothstep(0.3, 0.8, hi)) * limb * mix(0.6, 1.0, ao) * (1.0 - lit) * 2.2 * uFill;
  // the terrace's low sun (the stone's light), on the round of the moon and the faces of its blocks
  if (uSeamK > 0.001) {
    float sd = dot(normalize(mix(sph, N, 0.3)), uSeamW);
    col += base * uStoneHi * 0.95 * smoothstep(-0.1, 0.6, sd) * uSeamK * mix(0.75, 1.0, ao);
  }
  // the warm rim where the sun grazes the limb
  col = mix(col, max(col, uRimColor * 0.95), clamp(limb * smoothstep(0.05, 0.5, ndl) * T, 0.0, 1.0) * 0.7);
  // a soft broad sheen on clay
  vec3 H = normalize(uSunW + V);
  col += uKeyTintM * 0.04 * pow(max(dot(N, H), 0.0), 16.0) * lit * (0.7 + 0.6 * grain);
  col *= 1.0 + 0.1 * uLit + 0.28 * clamp(vRaise, 0.0, 1.3);   // a lifted block catches a little more light
  col = shoulder(col);
  // the stone: one smooth pale face, warm where the light falls (upper left), cooler across to the lower right
  if (uStone > 0.001) {
    float g = clamp(0.5 + 0.62 * dot(sph, uStoneCam), 0.0, 1.0);
    vec3 st = mix(uStoneLo, uStoneHi, smoothstep(0.0, 1.0, g));
    st *= 1.0 + 0.035 * smoothstep(0.55, 0.95, dot(sph, normalize(uStoneCam + normalize(cameraPosition - vWorld) * 1.4)));
    col = mix(col, st, uStone);
  }
  // the water: far things take the water's colour
  if (uWater > 0.001) {
    float fy = gl_FragCoord.y / uRes.y;
    col = mix(col, mix(uWaterBot, uWaterTop, fy), uWater);
  }
  gl_FragColor = linearToOutputTexel(vec4(col, 1.0));
}`;function ue(B,_,{block:$=.06}={}){const u=$,q=new O(u*.93,u*.93,u*.93,2,u*.93*.22),N=new O(u*.93,u*.93,u*.93,1,u*.93*.2),A=new e.Matrix4,C=new e.Quaternion,V=new e.Quaternion,z=new e.Vector3,X=new e.Vector3,Z=new e.Euler,J=new e.Vector3(0,1,0),a={uSunW:{value:new e.Vector3(0,.2,-1).normalize()},uSunCol:{value:new e.Color(1.15,1.07,.96)},uFillUp:{value:new e.Color(.1,.12,.2)},uFillDown:{value:new e.Color(.17,.085,.035)},uFillCam:{value:new e.Color(.02,.022,.03)},uKeyTintM:{value:new e.Color(1,.95,.88)},uShadeTintM:{value:new e.Color(.36,.42,.64)},uCubeP:{value:new e.Vector4},uPlaneP:{value:new e.Vector4},uPlaneQ:{value:new e.Vector4(0,0,0,1)},uClay:{value:k(le)},uB:{value:u},uTime:{value:0},uSeamW:{value:new e.Vector3(0,0,1)},uSeamK:{value:0},uKeyK:{value:1},uFill:{value:1},uStoneHi:{value:k("#f6e8d9")},uStoneLo:{value:k("#e1d6d4")},uStoneCam:{value:new e.Vector3(-.7,.7,0)},uWater:{value:0},uWaterTop:{value:k("#2E9FC2")},uWaterBot:{value:k("#184F8E")},uRes:{value:new e.Vector2(1280,720)}},g=_.map((o,r)=>{const i=ae(o.r,o.seed,{craters:o.craters??6}),{blocks:d}=i,c=d.length,p=new e.InstancedBufferAttribute(new Float32Array(c*4),4),m=(o.lod==="low"?N:q).clone();m.setAttribute("aBlock",p);const l=2*(i.n+2)+1,h=l*n,G=new Uint8Array(h*h*h),w=(l-1)/2,E=(t,v,s)=>{t>=0&&v>=0&&s>=0&&t<h&&v<h&&s<h&&(G[t+h*(v+h*s)]=255)};for(let t=0;t<l;t++)for(let v=0;v<l;v++)for(let s=0;s<l;s++)if(Math.hypot(t-w,v-w,s-w)<=o.r-1.5)for(let b=0;b<n;b++)for(let x=0;x<n;x++)for(let S=0;S<n;S++)E(t*n+b,v*n+x,s*n+S);const y=new e.InstancedMesh(m,null,c);d.forEach((t,v)=>{C.setFromUnitVectors(J,z.fromArray(t.up)),V.setFromEuler(Z.set(t.j[0]*.09,t.j[1]*.5,t.j[2]*.09)),C.multiply(V);const s=.97+.06*t.seed,b=(t.d+t.lift)*u;z.fromArray(t.up).multiplyScalar(b),A.compose(z,C,X.set(s,s,s)),y.setMatrixAt(v,A),p.setXYZW(v,t.tone,t.hue,t.seed,t.floor);const x=(t.up[0]*(t.d+t.lift)+w)*n+n/2,S=(t.up[1]*(t.d+t.lift)+w)*n+n/2,oe=(t.up[2]*(t.d+t.lift)+w)*n+n/2;for(let F=0;F<n;F++)for(let W=0;W<n;W++)for(let L=0;L<n;L++)E(Math.round(x-n/2+F),Math.round(S-n/2+W),Math.round(oe-n/2+L))}),y.instanceMatrix.needsUpdate=!0;const f=new e.Data3DTexture(G,h,h,h);f.format=e.RedFormat,f.type=e.UnsignedByteType,f.minFilter=e.LinearFilter,f.magFilter=e.LinearFilter,f.wrapS=f.wrapT=f.wrapR=e.ClampToEdgeWrapping,f.unpackAlignment=1,f.needsUpdate=!0;const P={...B.light,...a,uOcc:{value:f},uGridM:{value:l*u},uSunM:{value:new e.Vector3(0,0,-1)},uHit:{value:new e.Vector4(0,0,0,0)},uLit:{value:0},uStone:{value:0},uBlockPx:{value:8}},Q=new e.ShaderMaterial({vertexShader:I,fragmentShader:Y,uniforms:{...P,uCore:{value:0}}});y.material=Q,y.frustumCulled=!1;const j=new e.IcosahedronGeometry((o.r-.62)*u,4),ee=new e.InstancedBufferAttribute(new Float32Array([.35,.5,.123,1]),4);j.setAttribute("aBlock",ee);const D=new e.ShaderMaterial({vertexShader:I,fragmentShader:Y,uniforms:{...P,uCore:{value:1}}}),M=new e.InstancedMesh(j,D,1);M.setMatrixAt(0,new e.Matrix4),M.frustumCulled=!1;const T=new e.Group;return T.position.fromArray(o.c),T.add(y,M),{group:T,mesh:y,mat:Q,core:M,cmat:D,tex:f,uniforms:P,centre:new e.Vector3().fromArray(o.c),radius:(o.r+.5)*u,rBlocks:o.r,blocks:d,count:c,shell:i}}),K=new e.Group;for(const o of g)K.add(o.group);const R=B.add({object:K,dispose(){q.dispose(),N.dispose();for(const o of g)o.mesh.geometry.dispose(),o.mat.dispose(),o.core.geometry.dispose(),o.cmat.dispose(),o.tex.dispose()}}),H=new e.Quaternion;return{moons:g,block:u,set(o,{q:r,hit:i=null,hitAmt:d=0,lit:c=0,stone:p=0,blockPx:m=8}={}){const l=g[o];l.uniforms.uStone.value=p,l.uniforms.uBlockPx.value=m,l.core.scale.setScalar(1+((l.rBlocks+1)/(l.rBlocks-.62)-1)*Math.min(1,p*1.6)),r&&l.group.quaternion.copy(r),l.uniforms.uSunM.value.copy(a.uSunW.value).applyQuaternion(H.copy(l.group.quaternion).invert()),i?l.uniforms.uHit.value.set(i.x,i.y,i.z,d):l.uniforms.uHit.value.w=0,l.uniforms.uLit.value=c},light({sunW:o,sunCol:r,fillUp:i,fillDown:d,fillCam:c,key:p,shade:m}){p&&a.uKeyTintM.value.copy(p),m&&a.uShadeTintM.value.copy(m),o&&a.uSunW.value.fromArray(o).normalize(),r&&a.uSunCol.value.setRGB(r[0],r[1],r[2]),i&&a.uFillUp.value.setRGB(...i),d&&a.uFillDown.value.setRGB(...d),c&&a.uFillCam.value.setRGB(...c);for(const l of g)l.uniforms.uSunM.value.copy(a.uSunW.value).applyQuaternion(H.copy(l.group.quaternion).invert())},seam({seamW:o,seamK:r=0,keyK:i=1,fill:d=1,stoneCam:c,water:p=0,res:m}){o&&a.uSeamW.value.fromArray(o).normalize(),a.uSeamK.value=r,a.uKeyK.value=i,a.uFill.value=d,c&&a.uStoneCam.value.fromArray(c),a.uWater.value=p,m&&a.uRes.value.set(m[0],m[1])},heroes({cube:o=null,plane:r=null,time:i=0}={}){o?a.uCubeP.value.set(o.p.x,o.p.y,o.p.z,o.half):a.uCubeP.value.w=0,r?(a.uPlaneP.value.set(r.p.x,r.p.y,r.p.z,r.half),a.uPlaneQ.value.set(r.q.x,r.q.y,r.q.z,r.q.w)):a.uPlaneP.value.w=0,a.uTime.value=i},dispose(){B.remove(R),R.dispose()}}}export{ue as createMoonSet};
