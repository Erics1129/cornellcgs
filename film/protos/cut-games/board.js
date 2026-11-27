import*as t from"three";import{RoundedBoxGeometry as R}from"three/addons/geometries/RoundedBoxGeometry.js";import{GLSL_COMMON as x,GLSL_FRAG as N,lin as b}from"../../kit/actors/core.js";import{CAUSTIC_GLSL as z}from"./caustics.js";const P="#F7F2E8",$="#8A5A33",O="#211F1C",V=`
uniform vec4 uBall; uniform vec3 uWallMin[3]; uniform vec3 uWallMax[3];
float sdBox(vec3 p, vec3 lo, vec3 hi) { vec3 c = (lo + hi) * 0.5, h = (hi - lo) * 0.5; vec3 q = abs(p - c) - h; return length(max(q, 0.0)) + min(max(q.x, max(q.y, q.z)), 0.0); }
float sceneSD(vec3 p, float self) {
  float d = self > 0.5 ? 1e3 : length(p - uBall.xyz) - uBall.w;
  for (int i = 0; i < 3; i++) d = min(d, sdBox(p, uWallMin[i], uWallMax[i]) - 0.004);
  return d;
}
// the sun's light at p past the walls and the ball, with a penumbra that widens with distance
float sunShadow(vec3 p, vec3 L, float self) {
  float res = 1.0, t = 0.006;
  for (int i = 0; i < 12; i++) {
    float h = sceneSD(p + L * t, self);
    res = min(res, 9.0 * h / t);
    t += clamp(h, 0.008, 0.06);
    if (res < 0.0 || t > 0.45) break;
  }
  return smoothstep(0.0, 1.0, clamp(res, 0.0, 1.0));
}
`,q=`
${x}
attribute vec3 aColour; attribute vec4 aWipe; attribute vec4 aState; attribute float aSand;
uniform float uBlock;
varying vec3 vWorld; varying vec3 vN; varying vec3 vLocal; varying vec3 vLocalN; varying vec3 vFaceN;
varying vec3 vColour; varying vec4 vWipe; varying vec4 vState; varying float vSand;
void main() {
  mat4 m = modelMatrix * instanceMatrix;
  vec4 wp = m * vec4(position, 1.0);
  mat3 m3 = mat3(m);
  vec3 sc = vec3(dot(m3[0], m3[0]), dot(m3[1], m3[1]), dot(m3[2], m3[2]));
  vN = normalize(m3 * (normal / max(sc, vec3(1e-12))));
  vec3 an = abs(normal);
  vec3 face = an.x >= an.y && an.x >= an.z ? vec3(sign(normal.x), 0.0, 0.0) : an.y >= an.z ? vec3(0.0, sign(normal.y), 0.0) : vec3(0.0, 0.0, sign(normal.z));
  vFaceN = normalize(m3 * (face / max(sc, vec3(1e-12))));
  vWorld = wp.xyz; vLocal = position / uBlock; vLocalN = normal;
  vColour = aColour; vWipe = aWipe; vState = aState; vSand = aSand;
  gl_Position = projectionMatrix * viewMatrix * wp;
}`,G=`
${x}
${N}
${z}
${V}
uniform vec3 uClay; uniform float uFocusK; uniform float uPreviewA; uniform vec3 uWindow;
varying vec3 vWorld; varying vec3 vN; varying vec3 vLocal; varying vec3 vLocalN; varying vec3 vFaceN;
varying vec3 vColour; varying vec4 vWipe; varying vec4 vState; varying float vSand;
uniform float uClipSand;
// the film (films/take-games): the place is a picture, so the sand no longer hides what of a block is set into it;
// below the sand (the live look's dunes, which the film's sand is under and round the board) the block is not drawn
float sandH(vec2 p) { return -6.0 + 0.30 * sin(0.23 * p.x + 0.9 * sin(0.11 * p.y)) + 0.20 * sin(0.31 * p.y + 0.13 * p.x + 1.7) + 0.10 * sin(0.53 * p.x - 0.41 * p.y + 0.4) + 0.05 * sin(0.9 * p.x + 1.1 * p.y); }
void main() {
  if (uClipSand > 0.5 && vWorld.y < sandH(vWorld.xz) - 0.0015) discard;
  vec3 a = abs(vLocal) * 2.0;
  float mx = max(a.x, max(a.y, a.z)), mn = min(a.x, min(a.y, a.z)), mid = a.x + a.y + a.z - mx - mn;
  vec2 q = vLocal.xz;
  float seed = vState.z;
  // the ink: from the edge the ball came on by, over the top and a little way down the sides, with a wobbly edge
  float down = max(0.0, 0.5 - vLocal.y);
  float d = length(q - vWipe.xy) + down * 1.4;
  float ang = atan(q.y - vWipe.y, q.x - vWipe.x);
  float wob = 0.06 * (vnoise(vec3(ang * 2.2, seed * 13.0, 1.0)) - 0.5) + 0.035 * (vnoise(vec3(q * 18.0, seed * 3.0)) - 0.5);
  float R = vWipe.z;
  float ink = R >= 1.95 ? 1.0 : 1.0 - smoothstep(R - 0.04, R + 0.012, d + wob);
  // the wash: the colour lifts off in soft patches
  float w = vState.x;
  // the wash: the colour thins evenly, the top first, as it lifts away
  float wl = w * 1.25 - down * 0.6 + 0.12 * (vnoise(vec3(q * 4.0, seed * 3.0 + 4.0)) - 0.5);
  ink *= w <= 0.0 ? 1.0 : 1.0 - smoothstep(0.1, 0.95, wl);
  // the soaking front holds a little more colour (as ink does)
  float front = R < 1.95 ? exp(-pow((d + wob - R + 0.04) / 0.035, 2.0)) * ink : 0.0;
  vec3 colour = vColour * (1.0 - 0.25 * front);
  vec3 base = mix(uClay, colour, ink);
  // clay: a faint streak and grain, a little wear on the edges
  float streak = fbm(vec3(q.x * 7.0, q.y * 60.0 + vLocal.y * 30.0, seed * 31.0));
  base *= 0.95 + 0.07 * streak;
  float wear = smoothstep(0.82, 0.97, mid) * smoothstep(0.35, 0.75, fbm(vLocal * 60.0 + seed * 5.0));
  base = mix(base, mix(base, vec3(0.93, 0.89, 0.80), 0.45), wear * ink);
  // the preview of a roll: a small round ink mark on each block it would cross, a ring where it would stop
  if (vLocalN.y > 0.5 && vState.w > 0.5) {
    float r = length(q);
    float mark = vState.w < 1.5 ? 1.0 - smoothstep(0.075, 0.09, r) : 1.0 - smoothstep(0.012, 0.022, abs(r - 0.2));
    base = mix(base, vec3(0.115, 0.105, 0.1), mark * 0.6 * uPreviewA);
  }
  vec3 N = normalize(vN);
  vec3 V = normalize(cameraPosition - vWorld);
  vec3 an = abs(normalize(vLocalN));
  vec3 NL = normalize(mix(N, normalize(vFaceN), 0.85));
  float bevel = 1.0 - smoothstep(0.9, 0.995, max(an.x, max(an.y, an.z)));
  // set in the sand: darker toward the sand line
  float occl = smoothstep(vSand - 0.004, vSand + 0.05, vWorld.y);
  gShade = mix(vec3(1.06, 1.02, 0.93), vec3(1.0), ink);
  vec3 col = lightPlayer(base, N, V, occl, 0.0, 0.5, mix(0.35, 1.0, bevel));
  gShade = vec3(1.0);
  // the place's light: the moving net, and the walls' and the ball's shadows, on what faces the sun
  float lit = smoothstep(-0.05, 0.5, dot(N, uKeyDir));
  float net = causticNet(vWorld, 0.0);
  float sh = sunShadow(vWorld + N * 0.003, uKeyDir, 0.0);
  // the net on a block top is the same as on the sand round it, but read gently (a small top shows it as blotches otherwise)
  col *= mix(1.0, (0.5 + 0.5 * mix(1.0, clamp(net, 0.35, 2.2), 0.6) * sh) / uFocusK, lit);
  // fresh ink is wet: a sheen of the bright surface and a glint of the sun
  float wet = vWipe.w * ink;
  vec3 Rr = reflect(-V, N);
  float fres = 0.04 + 0.96 * pow(1.0 - clamp(dot(N, V), 0.0, 1.0), 5.0);
  col += wet * (uWindow * 0.06 * fres * smoothstep(0.4, 0.9, Rr.y) + uKeyTint * pow(max(dot(Rr, uKeyDir), 0.0), 80.0) * 0.35 * net * sh);
  // pointed at: the edges catch a little more light
  float rimH = vState.y * smoothstep(0.36, 0.49, max(abs(q.x), abs(q.y))) * step(0.5, vLocalN.y);
  col = mix(col, col * 1.18 + vec3(0.035, 0.03, 0.02), rimH);
  col *= 1.0 - 0.08 * smoothstep(0.85, 0.99, mid);
  // the sides a little darker than the top, so each block reads as a block from above; a sheen on the rounded edges
  col *= mix(0.86, 1.0, smoothstep(0.2, 0.85, N.y));
  col += uKeyTint * pow(max(dot(reflect(-uKeyDir, N), V), 0.0), 28.0) * 0.1 * (1.0 - smoothstep(0.92, 0.995, max(an.x, max(an.y, an.z)))) * sh;
  col = haze(shoulder(col), length(cameraPosition - vWorld));
  gl_FragColor = linearToOutputTexel(vec4(col, 1.0));
}`,_=`
${x}
${N}
${z}
${V}
uniform float uFocusK;
varying vec3 vWorld; varying vec3 vN; varying vec3 vLocal; varying vec3 vLocalN; varying vec3 vFaceN;
varying vec3 vColour; varying vec4 vWipe; varying vec4 vState; varying float vSand;
uniform float uClipSand;
// the film (films/take-games): the place is a picture, so the sand no longer hides what of a block is set into it;
// below the sand (the live look's dunes, which the film's sand is under and round the board) the block is not drawn
float sandH(vec2 p) { return -6.0 + 0.30 * sin(0.23 * p.x + 0.9 * sin(0.11 * p.y)) + 0.20 * sin(0.31 * p.y + 0.13 * p.x + 1.7) + 0.10 * sin(0.53 * p.x - 0.41 * p.y + 0.4) + 0.05 * sin(0.9 * p.x + 1.1 * p.y); }
void main() {
  if (uClipSand > 0.5 && vWorld.y < sandH(vWorld.xz) - 0.0015) discard;
  float seed = vState.z;
  vec3 n = abs(vLocalN);
  // walnut: long grain along x, end grain rings on the faces that cut it, darker pores, the top a touch warmer
  vec2 f = n.x > 0.5 ? vLocal.yz : n.y > 0.5 ? vLocal.xz : vLocal.xy;
  float g = fbm(vec3(vLocal.x * 3.0, vLocal.y * 38.0 + fbm(vLocal * 9.0 + seed) * 2.5, vLocal.z * 38.0 + seed * 7.0));
  float rings = n.x > 0.5 ? 0.5 + 0.5 * sin(length(vLocal.yz - vec2(-0.9, 0.7)) * 95.0 + g * 6.0) : 0.5;
  vec3 base = vColour * vec3(1.3, 0.98, 0.78) * (0.84 + 0.26 * g) * mix(0.92, 1.05, rings);   // warmed a little, so the walnut holds its brown in the blue light
  base *= 1.0 - 0.18 * smoothstep(0.62, 0.8, vnoise(vec3(f * 90.0, seed)));
  if (n.y > 0.5) base *= vec3(1.45, 1.28, 1.05);   // the top: the game's lighter walnut (COLORS.wallTop #a46d40)
  vec3 N = normalize(vN);
  vec3 V = normalize(cameraPosition - vWorld);
  vec3 NL = normalize(mix(N, normalize(vFaceN), 0.7));
  vec3 a = abs(vLocal) * 2.0;
  float edge = smoothstep(0.86, 0.985, max(a.x, a.z)) * smoothstep(0.7, 0.98, a.y);
  float occl = smoothstep(vSand - 0.004, vSand + 0.05, vWorld.y);
  vec3 col = lightPlayer(base, N, V, occl, 0.0, 0.5, 0.6 + 0.4 * edge);
  col *= mix(0.82, 1.0, smoothstep(0.3, 0.9, N.y));           // the sides a little darker than the top
  float lit = smoothstep(-0.05, 0.5, dot(N, uKeyDir));
  float net = causticNet(vWorld, 0.0);
  float sh = sunShadow(vWorld + N * 0.004, uKeyDir, 0.0);
  col *= mix(1.0, (0.42 + 0.58 * mix(1.0, net, 0.85) * sh) / uFocusK, lit);
  // the chamfer catches the light: a worn, paler edge
  col = mix(col, col * 1.35 + vec3(0.03, 0.022, 0.012), edge * 0.6 * lit);
  col = haze(shoulder(col), length(cameraPosition - vWorld));
  gl_FragColor = linearToOutputTexel(vec4(col, 1.0));
}`,X=`
varying vec3 vWorld; varying vec3 vN; varying vec3 vObj;
void main() { vec4 w = modelMatrix * vec4(position, 1.0); vWorld = w.xyz; vN = normalize(mat3(modelMatrix) * normal); vObj = normalize(position); gl_Position = projectionMatrix * viewMatrix * w; }`,j=`
${x}
${N}
${z}
uniform vec3 uBase; uniform vec3 uWaterUp; uniform vec3 uWaterHor; uniform vec3 uWindow; uniform float uFocusK; uniform vec4 uBallQ;
varying vec3 vWorld; varying vec3 vN; varying vec3 vObj;
vec3 qrot(vec4 q, vec3 v) { return v + 2.0 * cross(q.xyz, cross(q.xyz, v) + q.w * v); }
void main() {
  vec3 N = normalize(vN), V = normalize(cameraPosition - vWorld), L = uKeyDir;
  // marbled ink: two inks swirled together in the ball's own frame, so the roll shows
  vec3 o = qrot(vec4(-uBallQ.xyz, uBallQ.w), N);
  float m = fbm(o * 2.6 + fbm(o * 4.0) * 1.6);
  vec3 base = mix(uBase, uBase * vec3(1.55, 1.5, 1.85), smoothstep(0.48, 0.66, m));
  float ndl = dot(N, L);
  float w = clamp((ndl + 0.5) / 1.5, 0.0, 1.0); w = w * w * (3.0 - 2.0 * w);
  float net = causticNet(vWorld, 0.5);
  vec3 col = mix(base * uShadeTint * 0.8, base * uKeyTint * (0.5 + 0.7 * net) / uFocusK, w);
  // wet and glossy: the water round it and the bright window of the surface straight up, a sharp sun glint
  vec3 R = reflect(-V, N);
  float fres = 0.05 + 0.95 * pow(1.0 - clamp(dot(N, V), 0.0, 1.0), 4.0);
  vec3 env = R.y > 0.0 ? mix(uWaterHor, uWaterUp, pow(R.y, 0.8)) : uWaterHor * 0.45;
  env = mix(env, uWindow, smoothstep(0.64, 0.74, R.y) * 0.85);
  col += env * mix(0.1, 0.9, fres) * 0.55;
  col += uKeyTint * pow(max(dot(R, L), 0.0), 90.0) * (0.8 + 0.8 * net);
  col += base * uBounce * 0.25 * clamp(-N.y, 0.0, 1.0);
  col = haze(shoulder(col), length(cameraPosition - vWorld));
  gl_FragColor = linearToOutputTexel(vec4(col, 1.0));
}`;function J(L,T,l){const n=l.size,u=l.floorCount,d=l.wallCount,U=l.sink||.13,D=l.wallHeight,r={...L.light,...T.uniforms,uFocusK:{value:1},uBall:{value:new t.Vector4(0,-100,0,.01)},uWallMin:{value:[new t.Vector3,new t.Vector3,new t.Vector3]},uWallMax:{value:[new t.Vector3,new t.Vector3,new t.Vector3]},uWindow:{value:new t.Color(1,.97,.88)},uClipSand:{value:0}},i=new t.InstancedBufferGeometry;{const e=new R(n,n,n,4,n*.24);for(const a of["position","normal"])i.setAttribute(a,e.getAttribute(a));e.getIndex()&&i.setIndex(e.getIndex()),e.dispose()}const k=new t.InstancedBufferAttribute(new Float32Array(u*3),3),w=new t.InstancedBufferAttribute(new Float32Array(u*4),4),c=new t.InstancedBufferAttribute(new Float32Array(u*4),4),p=new t.InstancedBufferAttribute(new Float32Array(u),1);for(const e of[w,c,p])e.setUsage(t.DynamicDrawUsage);i.setAttribute("aColour",k),i.setAttribute("aWipe",w),i.setAttribute("aState",c),i.setAttribute("aSand",p);const W=new t.ShaderMaterial({vertexShader:q,fragmentShader:G,uniforms:{...r,uBlock:{value:n},uClay:{value:b(P)},uPreviewA:{value:1}}}),v=new t.InstancedMesh(i,W,u);v.instanceMatrix.setUsage(t.DynamicDrawUsage),v.frustumCulled=!1,l.colours.forEach((e,a)=>{const o=b(e);k.setXYZ(a,o.r,o.g,o.b)});for(let e=0;e<u;e++)c.setZ(e,e*.6180339%1*10+1);const A=D+U+.08,s=new t.InstancedBufferGeometry;{const e=new R(n*.94,A,n*.94,3,n*.075);for(const a of["position","normal"])s.setAttribute(a,e.getAttribute(a));e.getIndex()&&s.setIndex(e.getIndex()),e.dispose()}const C=new t.InstancedBufferAttribute(new Float32Array(d*3),3),B=new t.InstancedBufferAttribute(new Float32Array(d*4),4),S=new t.InstancedBufferAttribute(new Float32Array(d),1),H=new t.InstancedBufferAttribute(new Float32Array(d*4),4);s.setAttribute("aColour",C),s.setAttribute("aWipe",H),s.setAttribute("aState",B),s.setAttribute("aSand",S);for(let e=0;e<d;e++){const a=b($).multiplyScalar(.94+.12*(e*.37%1));C.setXYZ(e,a.r,a.g,a.b),B.setZ(e,e*3.7+2)}const F=new t.ShaderMaterial({vertexShader:q,fragmentShader:_,uniforms:{...r,uBlock:{value:n}}}),m=new t.InstancedMesh(s,F,d);m.frustumCulled=!1;const M=new t.SphereGeometry(l.ballRadius,56,40),h=new t.ShaderMaterial({vertexShader:X,fragmentShader:j,uniforms:{...r,uBase:{value:b(O)},uWaterUp:{value:new t.Color(.1,.62,.92)},uWaterHor:{value:new t.Color(.02,.2,.36)},uBallQ:{value:new t.Vector4(0,0,0,1)}}}),f=new t.Mesh(M,h);f.frustumCulled=!1;const I=l.scene||L.scene;I.add(v,m,f);const g=new t.Matrix4,K=new t.Matrix4;return{floors:v,walls:m,ball:f,setFloor(e,a){const o=a.sy??1,y=a.sxz??1;g.makeTranslation(a.position[0],a.position[1]+n/2*o,a.position[2]),K.makeScale(y,o,y),v.setMatrixAt(e,g.multiply(K)),w.setXYZW(e,a.origin?a.origin[0]:0,a.origin?a.origin[1]:0,a.soak>=.999?2:a.soak*1.3,a.wet||0),c.setX(e,a.wash||0),c.setY(e,a.hover||0),c.setW(e,a.preview||0),p.setX(e,a.sand)},setWall(e,a,o){g.makeTranslation(a[0],a[1]-A/2,a[2]),m.setMatrixAt(e,g),S.setX(e,o)},setBall(e,a,o){f.position.set(e[0],e[1],e[2]),f.scale.set(a[0],a[1],a[2]),h.uniforms.uBallQ.value.set(o[0],o[1],o[2],o[3]),r.uBall.value.set(e[0],e[1],e[2],l.ballRadius*.98)},setClipSand(e){r.uClipSand.value=e?1:0},setShadowWalls(e){e.forEach((a,o)=>{r.uWallMin.value[o].set(...a.min),r.uWallMax.value[o].set(...a.max)})},setLight({focusK:e=1,waterUp:a,waterHor:o,preview:y=1}){r.uFocusK.value=e,W.uniforms.uPreviewA.value=y,a&&h.uniforms.uWaterUp.value.copy(a),o&&h.uniforms.uWaterHor.value.copy(o)},commit(){v.instanceMatrix.needsUpdate=!0,m.instanceMatrix.needsUpdate=!0,w.needsUpdate=!0,c.needsUpdate=!0,p.needsUpdate=!0,S.needsUpdate=!0},dispose(){I.remove(v,m,f),i.dispose(),s.dispose(),M.dispose(),W.dispose(),F.dispose(),h.dispose()}}}export{O as INK_BALL,$ as WALNUT,J as createBoard};
