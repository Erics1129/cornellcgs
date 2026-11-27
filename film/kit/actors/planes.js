import*as t from"three";import{GLSL_COMMON as X,GLSL_FRAG as ne,PLAYER_COLOURS as le,PAPER as ie,INK as de,OUTLINE_INK as re,LINE as D,lin as k}from"./core.js";import{SLIP as P,HINGES as se,FINAL as me,FOLDED as f,STRIPE as ce,ROOT as g,PANEL_LOCAL as Y,SLIP_BOX as pe,buildSlabs as ge}from"./fold.js";import{createNameAtlas as we}from"./labels.js";import{clamp as y,outSine as xe}from"../ease.js";const Z=P.L,H=[[0,.29],[.24,.53],[.48,.77],[.71,1]];function ye(i,l=[0,0,0,0]){i=y(i);for(let r=0;r<4;r++)l[r]=y((i-H[r][0])/(H[r][1]-H[r][0]));return l}function Fe(i,l=[0,0,0,0,0]){i=y(i);let r=0;for(let s=0;s<4;s++){const[F,h]=H[s],u=y((i-F)/(h-F)),c=me[s];let d;const w=.13;if(u<=0)d=0;else if(u<.2)d=c*w*xe(u/.2);else if(u<.3)d=c*w;else if(u<.56){const m=(u-.3)/.26;d=c*(w+(1-w)*m*m*(1.4-.4*m))}else{const m=(u-.56)/.44,S=Math.exp(-4.2*m)*(1-m);d=s<2?c*(1-.085*S*Math.abs(Math.sin(Math.PI*2.1*m+.35))):c*(1+.16*S*Math.sin(Math.PI*2.4*m))}l[s]=d,u>.42&&u<.86&&(r+=.11*Math.sin(Math.PI*(u-.42)/.44))}return l[4]=r,l}function Ae(i,{mode:l="flap",amount:r=.42,cycles:s=2.5}={}){if(i<=0||i>=1)return[0,0];const F=Math.sin(Math.PI*i)**.7*(1-i*.4),h=r*F*Math.sin(Math.PI*2*s*i);return l==="rock"?[h,-h]:[h,h]}const be=(()=>{let i=0,l=0;for(const r of Y)i+=r[0],l+=r[1];return i/=Y.length,l/=Y.length,[g.R0[0]+g.e1[0]*i+g.e2[0]*l,g.R0[1]+g.e1[1]*i+g.e2[1]*l]})(),$=`
${X}
attribute vec4 aHull;      // outline push direction, face (+1 front, -1 back, 0 edge wall)
attribute vec4 aFlags;
attribute vec4 aGeom;      // post-F2 coordinates (u2, v2), the sheet point it shrinks to
attribute vec4 aEdge;
attribute vec4 aFold;      // the four fold angles
attribute vec4 aPhase;     // the fold value f (the four phases are computed from it), then the turned name's [X0, Y0, scale]
attribute vec4 aExtra;     // wing right, wing left, name wing (+1 right, -1 left, 2 both, 0 none), lift
attribute vec4 aName;      // atlas cell [u0, vTop], the plane's colour packed (sRGB 8:8:8), slip scale
attribute vec4 aWingFit;   // the name cell in the wing's name frame [X0, Y0, scale] (px -> model units)
uniform vec3 uH1P, uH1D, uH2P, uH2D, uH3P, uH3D, uH4P, uH4D;
uniform float uZC;
uniform float uHull;       // hull width in CSS px at 720p (0 for the body)
uniform float uHullSun;    // extra hull width on the sun side (px), covered by the rim hull
uniform vec2 uRootA, uRootB; // the wing crease in post-F2 coordinates (tail end, nose)
uniform float uCurl;       // tip curl (radians)
uniform vec2 uCellUV;      // an atlas cell's size in uv
uniform float uT;          // paper thickness
uniform vec2 uCellPx;      // an atlas cell's size in px
uniform float uSlipV;      // the slip name's centre (v)
varying vec3 vWorld; varying vec3 vN; varying vec2 vSheet; varying vec2 vFlat2; varying float vFace;
varying vec4 vFlags; varying vec3 vColour; varying vec4 vName; varying vec4 vWingFit; varying vec4 vSlipFit;
varying float vNameWing; varying vec4 vPhase; varying vec4 vEdge; varying vec3 vOut; varying vec3 vTx; varying vec3 vTz;
varying float vHullN; varying float vGate; flat varying float vCat; varying float vFlipN;
vec3 rot(vec3 q, vec3 P, vec3 D, float a) {
  vec3 x = q - P; float c = cos(a), s = sin(a);
  return P + x * c + cross(D, x) * s + D * dot(D, x) * (1.0 - c);
}
vec3 rotV(vec3 x, vec3 D, float a) { float c = cos(a), s = sin(a); return x * c + cross(D, x) * s + D * dot(D, x) * (1.0 - c); }
uniform vec4 uWinA, uWinB;   // the four folds' windows in f
float s2l(float c) { c /= 255.0; return c <= 0.04045 ? c / 12.92 : pow((c + 0.055) / 1.055, 2.4); }
void main() {
  float s = aFlags.w;
  float aFace = aHull.w;
  vec4 aPh = clamp((vec4(aPhase.x) - uWinA) / (uWinB - uWinA), 0.0, 1.0);
  vec2 aFlat2 = aGeom.xy, aCollapse = aGeom.zw;
  // trims: paper outside the dart's outline shrinks onto it while the edges fold in (F2)
  float k = smoothstep(0.32, 0.78, aPh.y);
  vec2 uv = mix(vec2(position.x * s, position.z), vec2(aCollapse.x * s, aCollapse.y), k);
  vec3 p = vec3(uv.x, position.y * (1.0 - 0.7 * k * step(0.0005, distance(aCollapse, position.xz))), uv.y - uZC);
  vec3 o = vec3(aEdge.y * s, 0.0, aEdge.z);
  // the flat-state normal: up or down for the faces; the cut edge's walls bend up and down
  vec3 n = aFace > 0.5 ? vec3(0.0, 1.0, 0.0) : aFace < -0.5 ? vec3(0.0, -1.0, 0.0) : normalize(vec3(o.x * 0.75, position.y > 0.0 ? 0.66 : -0.66, o.z * 0.75));
  float cat = mod(aEdge.w, 10.0), end = floor(aEdge.w / 10.0 + 0.01);
  // is this edge a real edge yet? (cut edges always; the trimmed outline once trimmed; folds once made)
  float gate = cat < 0.5 ? 0.0 : cat < 1.5 ? 1.0 : cat < 2.5 ? k : cat < 3.5 ? 0.0 : cat < 4.5 ? smoothstep(0.5, 0.8, aPh.y) : cat < 5.5 ? smoothstep(0.5, 0.8, aPh.z) : 0.0;
  // only the bottom sheet carries the outline once the flaps lie on it (its outline is the dart's);
  // a flap is outlined while it is part of the flat slip and while it is in the air
  float hullOn = 1.0;
  if (aFlags.y > 0.5) hullOn = 1.0 - smoothstep(0.8, 0.98, aPh.y);
  else if (aFlags.x > 0.5) hullOn = 1.0 - smoothstep(0.8, 0.98, aPh.x);
  // the hull pushes an edge out along its normal, and stretches it at both ends so corners close
  vec3 h = end < 0.5 ? vec3(0.0) : o + vec3(-o.z, 0.0, o.x) * (end < 1.5 ? -1.0 : 1.0);
  vec3 tx = vec3(1.0, 0.0, 0.0), tz = vec3(0.0, 0.0, 1.0);
  if (aFlags.x > 0.5) { p = rot(p, uH1P, uH1D, aFold.x); n = rotV(n, uH1D, aFold.x); h = rotV(h, uH1D, aFold.x); o = rotV(o, uH1D, aFold.x); }
  if (aFlags.y > 0.5) { p = rot(p, uH2P, uH2D, aFold.y); n = rotV(n, uH2D, aFold.y); h = rotV(h, uH2D, aFold.y); o = rotV(o, uH2D, aFold.y); }
  // post-F2 frame: where the F1 flap is not under it, the strip settles onto the sheet (no gap)
  if (aFlags.y > 0.5 && aFlags.x < 0.5) {
    vec2 q = vec2(abs(aFlat2.x), uZC * 2.0 - aFlat2.y);       // from the nose
    float ang = atan(q.x, max(1e-4, q.y));
    float cover = (1.0 - smoothstep(0.34, 0.42, ang)) * (1.0 - smoothstep(0.85, 1.05, length(q)));
    p.y -= uT * (1.0 - cover) * smoothstep(0.6, 1.0, aPh.y);
  }
  // post-F2 frame: the wing tips curl up a little (outer 40 % of the wing), once the wings are down
  if (aFlags.z > 0.5) {
    vec2 q = vec2(abs(aFlat2.x), aFlat2.y);
    vec2 e = normalize(uRootB - uRootA);
    float across = (q.x - uRootA.x) * e.y - (q.y - uRootA.y) * e.x;    // distance out from the crease
    float wingW = 1.0 - uRootA.x;
    float t0 = 0.6 * wingW, over = max(0.0, across - t0);
    float lift = over * over / (2.0 * max(1e-3, (wingW - t0) / tan(uCurl))) * smoothstep(0.5, 1.0, aPh.w);
    p.y += lift;
  }
  if (aFlags.z > 0.5) { float w = aFold.w + (s > 0.0 ? aExtra.x : aExtra.y); p = rot(p, uH4P, uH4D, w); n = rotV(n, uH4D, w); h = rotV(h, uH4D, w); o = rotV(o, uH4D, w); tx = rotV(tx, uH4D, w); tz = rotV(tz, uH4D, w); }
  p = rot(p, uH3P, uH3D, aFold.z); n = rotV(n, uH3D, aFold.z); h = rotV(h, uH3D, aFold.z); o = rotV(o, uH3D, aFold.z); tx = rotV(tx, uH3D, aFold.z); tz = rotV(tz, uH3D, aFold.z);
  p.x *= s; n.x *= s; h.x *= s; o.x *= s; tx.x *= s; tz.x *= s;
  p.y -= aExtra.w;
  mat4 m = modelMatrix * instanceMatrix;
  vec4 wp = m * vec4(p, 1.0);
  mat3 m3 = mat3(m);
  vec3 wn = normalize(m3 * n);
  vHullN = 0.0;
  if (uHull > 0.0 && gate > 0.0 && end > 0.5) {
    float sc = length(m[0].xyz);
    float dist = length(cameraPosition - wp.xyz);
    vec3 hw = m3 * h;
    float sun = smoothstep(0.05, 0.35, dot(normalize(m3 * o), uKeyDir));
    float px = (uHull + uHullSun * sun) * uLineScale * gate * hullOn;
    wp.xyz += hw / max(1e-6, length(m3 * o)) * min(px * uPx * dist, 0.05 * sc);
    vHullN = sun;
  }
  vGate = gate; vCat = cat;
  vWorld = wp.xyz; vN = wn;
  vOut = normalize(m3 * o + 1e-6); vTx = normalize(m3 * tx); vTz = normalize(m3 * tz);
  vSheet = position.xz; vFlat2 = aFlat2; vFace = aFace; vFlags = aFlags;
  float pc = aName.z;
  vColour = vec3(s2l(floor(pc / 65536.0)), s2l(mod(floor(pc / 256.0), 256.0)), s2l(mod(pc, 256.0)));
  vName = vec4(aName.xy, aName.xy + uCellUV); vSlipFit = vec4(-0.5 * uCellPx.x * aName.w, uSlipV - 0.5 * uCellPx.y * aName.w, uCellPx * aName.w); float flipN = step(5.5, aExtra.z); vNameWing = aExtra.z - 8.0 * flipN; vFlipN = flipN; vWingFit = flipN > 0.5 ? vec4(aPhase.yz, uCellPx * aPhase.w) : vec4(aWingFit.xy, uCellPx * aWingFit.z); vPhase = aPh; vEdge = aEdge;
  gl_Position = projectionMatrix * viewMatrix * wp;
}`,Ne=`
${X}
${ne}
uniform sampler2D uNames;
uniform vec2 uAtlas;          // atlas size in px
uniform vec3 uPaper; uniform vec3 uInk; uniform vec3 uLine;
uniform vec2 uStripe;
uniform vec2 uRootA, uRootB; uniform vec2 uRootE1, uRootE2;
uniform vec2 uPanelC;
uniform float uT;             // paper thickness (sheet units)
varying vec3 vWorld; varying vec3 vN; varying vec2 vSheet; varying vec2 vFlat2; varying float vFace;
varying vec4 vFlags; varying vec3 vColour; varying vec4 vName; varying vec4 vWingFit; varying vec4 vSlipFit;
varying float vNameWing; varying vec4 vPhase; varying vec4 vEdge; varying vec3 vOut; varying vec3 vTx; varying vec3 vTz;
varying float vHullN; varying float vGate; flat varying float vCat; varying float vFlipN;
// ink of the name cell at frame point q, with the cell's rectangle fit = [X0, Y0, W, H]
float nameInk(vec2 q, vec4 fit) {
  // sample unconditionally (keeps the mip selection smooth), then mask to the cell
  vec2 t = (q - fit.xy) / max(fit.zw, vec2(1e-6));
  vec2 uv = vec2(mix(vName.x, vName.z, t.x), mix(vName.w, vName.y, t.y));
  vec2 lo = vec2(vName.x, vName.y) + 1.5 / uAtlas, hi = vec2(vName.z, vName.w) - 1.5 / uAtlas;
  float v = texture2D(uNames, clamp(uv, lo, hi)).r;
  float inside = step(0.0, t.x) * step(t.x, 1.0) * step(0.0, t.y) * step(t.y, 1.0) * step(1e-6, fit.z);
  return v * inside;
}
float lineAt(float d, float widthPx) {
  float w = fwidth(d);
  return 1.0 - smoothstep(widthPx * 0.5 * w - w * 0.5, widthPx * 0.5 * w + w * 0.5, abs(d));
}
float band(float x, float a, float b) { float aa = fwidth(x) * 0.8; return smoothstep(a - aa, a + aa, x) * (1.0 - smoothstep(b - aa, b + aa, x)); }
void main() {
  bool front = vFace > 0.5, back = vFace < -0.5, wall = !front && !back;
  float m1 = vFlags.x, m2 = vFlags.y, m4 = vFlags.z;
  float moved = max(m1, m2);
  float side = vFlags.w;                                  // +1 right half, -1 left half
  float upF2 = vFace * (m1 > 0.5 ? -1.0 : 1.0) * (m2 > 0.5 ? -1.0 : 1.0);
  vec3 colour = vColour;
  if (uStyle > 1.5) colour = desat(colour, 0.09);
  vec3 base = uPaper;
  // the coloured back: the underside and keel; a flap's back too until its fold turns it up (then
  // the cartoon dart is paper white on top, as the brief draws it)
  float flipped = m2 > 0.5 ? vPhase.y : m1 > 0.5 ? vPhase.x : 0.0;
  if (back && smoothstep(0.42, 0.5, flipped) < 0.5) base = colour;
  // paper style: the cut edge of the coloured layer shows a white core, slightly uneven
  if (uStyle > 1.5 && back && moved < 0.5 && vGate > 0.5) {
    float rag = 0.55 + 0.9 * fbm(vec3(vSheet * 40.0, 2.0));
    base = mix(base, uPaper, 1.0 - smoothstep(0.0, uT * rag, vEdge.x));
  }
  // the tail stripe: on the flat slip's front, and across the tail of whatever faces up when folded
  float st = 0.0;
  if (front) st = band(vSheet.y, uStripe.x, uStripe.y);
  if (upF2 > 0.5 && !wall) st = max(st, band(vFlat2.y, uStripe.x, uStripe.y) * step(0.5, m2));
  base = mix(base, colour, st);
  // names
  float ink = 0.0, white = 0.0;
  if (front) ink = nameInk(vec2(-vSheet.x, vSheet.y), vSlipFit) * (1.0 - smoothstep(0.2, 0.9, vPhase.z));
  vec2 q = vFlat2;
  bool right = q.x > 0.0;
  bool wantR = vNameWing > 1.5 || vNameWing > 0.5, wantL = vNameWing > 1.5 || (vNameWing < -0.5);
  // the top of the wing: the F2 flap (moved by F2 only), its back face up
  if (m4 > 0.5 && m2 > 0.5 && m1 < 0.5 && back) {
    bool want = (right && (vNameWing > 1.5 || vNameWing > 0.5)) || (!right && (vNameWing > 1.5 || vNameWing < -0.5));
    if (want) {
      vec2 qq = vec2(abs(q.x), q.y) - uRootA;
      vec2 nq = vec2(dot(qq, uRootE1), dot(qq, uRootE2)) * (vFlipN > 0.5 ? -1.0 : 1.0);
      ink = max(ink, nameInk(nq, vWingFit) * smoothstep(0.45, 0.75, vPhase.y));
    }
  }
  // the underside of the other wing: paper white on the colour, reading upright from below
  if (m4 > 0.5 && moved < 0.5 && back) {
    bool want = (!right && (vNameWing > 1.5 || vNameWing > 0.5)) || (right && (vNameWing > 1.5 || vNameWing < -0.5));
    if (want) {
      vec2 qq = vec2(abs(q.x), q.y) - uRootA;
      vec2 nq = vec2(dot(qq, uRootE1), dot(qq, uRootE2)) * (vFlipN > 0.5 ? -1.0 : 1.0);
      white = nameInk(nq, vWingFit) * smoothstep(0.3, 0.7, vPhase.z);
    }
  }
  base = mix(base, uInk, ink * 0.95);
  base = mix(base, uPaper, white * 0.97);
  // normal: the face, a rounded cut edge, and a gentle bulge once folded
  vec3 N = normalize(vN) * (gl_FrontFacing ? 1.0 : -1.0);
  if (!wall && vGate > 0.01) {
    float bw = uT * (uStyle > 0.5 && uStyle < 1.5 ? 2.2 : 1.3);
    float e = 1.0 - smoothstep(0.0, bw, vEdge.x);
    N = normalize(mix(N, vOut, e * 0.75 * vGate));
  }
  float folded = smoothstep(0.6, 1.0, vPhase.w);
  if (!wall && folded > 0.0) {
    vec2 c = m4 > 0.5 ? uPanelC : vec2(uRootA.x * 0.5, 0.45);
    vec2 d = vec2(abs(q.x), q.y) - c;
    vec3 tilt = vTx * (d.x * side) + vTz * d.y;
    N = normalize(N + tilt * 0.11 * folded * (gl_FrontFacing ? 1.0 : -1.0) * sign(vFace));
  }
  vec3 V = normalize(cameraPosition - vWorld);
  // occlusion: the valley between wing and keel, the inside of the keel
  float occl = 1.0;
  {
    vec2 qq = vec2(abs(q.x), q.y) - uRootA;
    float dRoot = abs(dot(qq, uRootE2));
    occl = mix(1.0, smoothstep(0.0, 0.16, dRoot) * 0.35 + 0.65, smoothstep(0.4, 1.0, vPhase.w) * step(0.5, upF2) );
    if (wall) occl = 0.92;
  }
  float grain = fbm(vec3(vSheet * 26.0, vFace * 3.0));
  float trans = back ? 0.2 : 0.45;
  // the coloured underside goes navy in shade (about #274B80 for the blue), paper stays light
  float colourBack = back && smoothstep(0.42, 0.5, flipped) < 0.5 ? 1.0 - white : 0.0;
  gShade = mix(vec3(1.0), vec3(0.56, 0.52, 0.42), colourBack);
  vec3 col = lightPlayer(base, N, V, occl, trans, grain, wall ? 1.0 : 0.22 + 0.78 * (vGate > 0.01 ? 1.0 - smoothstep(0.0, uT * 2.0, vEdge.x) : 0.0));
  gShade = vec3(1.0);
  if (wall) col = max(col, uPaper * uKeyTint * 0.9);     // the cut edge: a bright white core
  // creases, drawn only as they are made: the centre fold and the wing fold (ink lines); none in soft
  float ln = 0.0;
  {
    vec2 qq = vec2(abs(q.x), q.y) - uRootA;
    float dRoot = dot(qq, uRootE2);
    float wf = lineAt(dRoot, LINE_INNER * uLineScale) * smoothstep(0.55, 0.85, vPhase.w) * step(0.5, upF2) * (1.0 - step(0.5, float(wall)));
    float cf = lineAt(q.x, LINE_INNER * uLineScale) * smoothstep(0.55, 0.85, vPhase.z) * (back ? 1.0 : 0.0);
    ln = max(wf, cf);
  }
  if (uStyle < 0.5) col = mix(col, uLine, ln);
  else if (uStyle > 1.5) col *= 1.0 - 0.14 * ln;
  if (uStyle > 1.5) {
    // paper fibre, half again as strong as before, and long soft streaks
    float fib = fbm(vec3(vSheet * vec2(95.0, 140.0), 1.0 + vFace));
    float streak = fbm(vec3(vSheet.x * 220.0, vSheet.y * 18.0, 4.0));
    col *= 0.935 + 0.09 * fib + 0.03 * (streak - 0.5);
  }
  col = haze(shoulder(col), length(cameraPosition - vWorld));
  gl_FragColor = linearToOutputTexel(vec4(col, 1.0));
}`,ue=`
${X}
${ne}
uniform vec3 uOutline;
uniform float uRimMode;
varying vec3 vWorld; varying float vHullN;
void main() {
  vec3 c = uOutline;
  if (uRimMode > 0.5) {
    if (vHullN < 0.5) discard;
    c = uRimColor * (uStyle > 1.5 ? 0.94 : 1.0);
  }
  gl_FragColor = linearToOutputTexel(vec4(haze(c, length(cameraPosition - vWorld)), 1.0));
}`;function We(i,l={}){const r=l.names&&l.names.length?l.names:[""],s=l.count||r.length,F=l.length||.3,h=F/f.length,u=ge(),c=new t.InstancedBufferGeometry;c.setAttribute("position",new t.BufferAttribute(u.sheet,3)),c.setAttribute("aHull",new t.BufferAttribute(u.hull,4)),c.setAttribute("aFlags",new t.BufferAttribute(u.flags,4)),c.setAttribute("aGeom",new t.BufferAttribute(u.geom,4)),c.setAttribute("aEdge",new t.BufferAttribute(u.edge,4)),c.setIndex(new t.BufferAttribute(u.index,1));const d=e=>{const o=new t.InstancedBufferAttribute(new Float32Array(s*e),e);return o.setUsage(t.DynamicDrawUsage),o},w=d(4),m=d(4),S=d(4),M=d(4),I=d(4);for(const[e,o]of Object.entries({aFold:w,aPhase:m,aExtra:S,aName:M,aWingFit:I}))c.setAttribute(e,o);c.boundingSphere=new t.Sphere(new t.Vector3,1e5);const v=we(r,{family:l.family,weight:l.weight,renderer:i.renderer}),A={...i.light,uNames:{value:v.texture},uAtlas:{value:new t.Vector2(...v.size)},uCellUV:{value:new t.Vector2(v.cellSize[0]/v.size[0],v.cellSize[1]/v.size[1])},uCellPx:{value:new t.Vector2(...v.cellSize)},uSlipV:{value:pe.c[1]},uWinA:{value:new t.Vector4(...H.map(e=>e[0]))},uWinB:{value:new t.Vector4(...H.map(e=>e[1]))},uPaper:{value:k(ie)},uInk:{value:k(de)},uLine:{value:k(re)},uStripe:{value:new t.Vector2(ce.v0,ce.v1)},uZC:{value:Z/2},uHull:{value:0},uHullSun:{value:0},uRimMode:{value:0},uOutline:{value:k(re)},uRootA:{value:new t.Vector2(...g.R0)},uRootB:{value:new t.Vector2(0,P.L)},uRootE1:{value:new t.Vector2(...g.e1)},uRootE2:{value:new t.Vector2(...g.e2)},uPanelC:{value:new t.Vector2(...be)},uCurl:{value:P.curl*Math.PI/180},uT:{value:P.t}};for(const e of["h1","h2","h3","h4"])A[`uH${e[1]}P`]={value:new t.Vector3(...se[e].P)},A[`uH${e[1]}D`]={value:new t.Vector3(...se[e].D)};const O={LINE_INNER:D.inner.toFixed(2)},L=new t.ShaderMaterial({vertexShader:$,fragmentShader:Ne,uniforms:A,defines:O,side:t.DoubleSide});L.extensions={derivatives:!0};const Q=new t.ShaderMaterial({vertexShader:$,fragmentShader:ue,defines:O,uniforms:{...A,uHull:{value:D.silhouette},uHullSun:{value:D.rim},uRimMode:{value:0}},side:t.BackSide,polygonOffset:!0,polygonOffsetFactor:3,polygonOffsetUnits:6}),K=new t.ShaderMaterial({vertexShader:$,fragmentShader:ue,defines:O,uniforms:{...A,uHull:{value:D.rim},uHullSun:{value:0},uRimMode:{value:1}},side:t.BackSide,polygonOffset:!0,polygonOffsetFactor:1.5,polygonOffsetUnits:3}),x=new t.InstancedMesh(c,L,s),z=new t.InstancedMesh(c,Q,s),W=new t.InstancedMesh(c,K,s);z.instanceMatrix=W.instanceMatrix=x.instanceMatrix,x.instanceMatrix.setUsage(t.DynamicDrawUsage),x.frustumCulled=z.frustumCulled=W.frustumCulled=!1,z.renderOrder=1,W.renderOrder=1;const j=new t.Group;j.add(x,W,z);const p=[];for(let e=0;e<s;e++){const o=l.colours&&l.colours[e%l.colours.length]||le[e%le.length],a=k(o);p.push({position:new t.Vector3,quaternion:new t.Quaternion,scale:1,fold:1,wings:[0,0],air:1,visible:!0,shadow:!0,shadowOpacity:.5,nameWing:l.nameWing??1,nameFlip:!1,colour:a,hex:o,name:r[e%r.length],trail:null})}const E=[];function J(){for(let e=0;e<s;e++){const o=v.rect(e),a=new t.Color(p[e].hex).getHex();M.setXYZW(e,o[0],o[1],a,v.slip(e));const n=v.wing(e),R=v.wingFlip(e);I.setXYZW(e,n[0],n[1],n[2]/v.cellSize[0],0),E[e]=[R[0],R[1],R[2]/v.cellSize[0]]}M.needsUpdate=I.needsUpdate=!0}J();const q=[0,0,0,0,0],T=[0,0,0,0],ee=new t.Matrix4,ve=new t.Vector3,te=new t.Vector3,ae=new t.Vector3,B=new t.Vector3,G=new t.Vector3,Pe=new t.Vector3,fe=new t.Matrix4().makeScale(0,0,0),U=new t.Color;return{object:j,count:s,atlas:v,length:F,size:{span:f.span*h,length:f.length*h,slipWidth:2*h,slipLength:Z*h},get(e){return p[e]},set(e,o){const a=p[e];if(a){o.position&&(Array.isArray(o.position)?a.position.fromArray(o.position):a.position.copy(o.position)),o.quaternion&&(Array.isArray(o.quaternion)?a.quaternion.fromArray(o.quaternion):a.quaternion.copy(o.quaternion));for(const n of["scale","fold","air","visible","shadow","shadowOpacity","nameWing","nameFlip"])o[n]!==void 0&&(a[n]=o[n]);o.wings&&(a.wings=o.wings)}},hideAll(){for(const e of p)e.visible=!1,e.trail=null},trail(e,o,a,n={}){p[e].trail=o?{path:o,u:a,o:n}:null},redrawNames(){v.redraw(),J()},nameInfo(e){return v.info(e)},setStyle(e){z.visible=e==="ink"},worldPoint(e,o,a=new t.Vector3){const n=p[e];return a.set(o[0],o[1],o[2]).multiplyScalar(h*n.scale).applyQuaternion(n.quaternion).add(n.position)},tailPoint(e,o=new t.Vector3){const a=p[e],n=a.air*f.centre[1];return o.set(0,f.centre[1]-n+(1-a.air)*P.t,f.min[2]).multiplyScalar(h*a.scale).applyQuaternion(a.quaternion).add(a.position)},update(e){for(let o=0;o<s;o++){const a=p[o];if(!a.visible){x.setMatrixAt(o,fe);continue}Fe(a.fold,q),ye(a.fold,T);const n=h*a.scale,R=-(f.min[1]*y((a.fold-.7)/.3))+P.t*.5,oe=a.air*f.centre[1]-(1-a.air)*(q[4]+R);if(w.setXYZW(o,q[0],q[1],q[2],q[3]),m.setXYZW(o,y(a.fold),E[o][0],E[o][1],E[o][2]),S.setXYZW(o,a.wings[0],a.wings[1],a.nameWing+(a.nameFlip?8:0),oe),ee.compose(a.position,a.quaternion,ve.set(n,n,n)),x.setMatrixAt(o,ee),a.shadow&&a.shadowOpacity>0){const b=y((T[2]-.3)/.6),N=y((T[1]-.3)/.6),_=(1-N)*1+N*(1-b)*.86+b*f.span*.5,V=(1-N)*Z*.5+N*f.length*.5;te.set(1,0,0).applyQuaternion(a.quaternion).multiplyScalar(_*n),ae.set(0,0,1).applyQuaternion(a.quaternion).multiplyScalar(V*n),B.set(0,1,0).applyQuaternion(a.quaternion),G.copy(a.position).addScaledVector(B,(f.centre[1]*b-oe)*n);const C=(f.centre[1]-f.min[1])*b*n;G.addScaledVector(B,-C);const he=e.plate?Math.min(1.2,a.shadowOpacity*1.7):a.shadowOpacity;e.shadows.cast(G,te,ae,{opacity:he,shape:N*.85,round:.05,size:V*n*2,extent:C*1.6,core:[.12+.88*(1-b),.95]})}if(a.trail){const{path:b,u:N,o:_}=a.trail,V=f.span*n,C=e.style==="ink";U.copy(k(ie)),C||U.lerp(a.colour,.6),e.fx.trail(b,N,{spacing:V*.45,size:V*.035,count:14,colour:U,gap:f.length*n*.75,..._})}}x.count=z.count=W.count=s,x.instanceMatrix.needsUpdate=!0;for(const o of[w,m,S])o.needsUpdate=!0},dispose(){c.dispose(),L.dispose(),Q.dispose(),K.dispose(),v.dispose()}}}export{f as FOLDED,P as SLIP,We as createPlanes,Fe as foldAngles,ye as foldPhases,Ae as waggle};
