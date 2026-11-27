import*as a from"three";import{GLSL_COMMON as C,GLSL_FRAG as H,lin as D}from"../../kit/actors/core.js";import{hash01 as T}from"../../kit/ease.js";const pt=Math.PI*2,d=[{depth:.96,lap:0,lapL:0,canals:72,stripes:0,warts:0,arm:[.42,.1],tent:[44,.6,2.4,.005],delay:.18},{depth:.86,lap:32,lapL:.07,canals:16,stripes:1,warts:1,arm:[3.4,.24],tent:[24,2.4,4.2,.007],delay:.16},{depth:.56,lap:8,lapL:.02,canals:16,stripes:0,warts:.2,arm:[.5,.18],tent:[64,.05,.13,.004],delay:.08}],$=40,S=160,R=1.08;function rt(){const n=[],c=[],m=[];for(let l=0;l<=$;l++)for(let r=0;r<=S;r++)n.push(0,0,0),c.push(l/$*R,r/S);for(let l=0;l<$;l++)for(let r=0;r<S;r++){const u=l*(S+1)+r,o=u+1,v=u+S+1,w=v+1;m.push(u,o,v,o,w,v)}const s=new a.BufferGeometry;return s.setAttribute("position",new a.Float32BufferAttribute(n,3)),s.setAttribute("uv",new a.Float32BufferAttribute(c,2)),s.setIndex(m),s}function st(){const n=[],c=[],m=[],s=[];let l=0;const r=(o,v,w)=>{for(let h=0;h<=w;h++)for(const p of[-1,1])n.push(0,0,0),c.push(o,v,T("len"+o+v),T("sd"+o+v)),m.push(h/w,p);for(let h=0;h<w;h++){const p=l+h*2;s.push(p,p+1,p+2,p+1,p+3,p+2)}l+=(w+1)*2};for(let o=0;o<4;o++)r(0,o,64);for(let o=0;o<64;o++)r(1,o,40);const u=new a.BufferGeometry;return u.setAttribute("position",new a.Float32BufferAttribute(n,3)),u.setAttribute("aRib",new a.Float32BufferAttribute(c,4)),u.setAttribute("aVW",new a.Float32BufferAttribute(m,2)),u.setIndex(s),u}const ct=`
float pulseC(float t, float period, float phase) {
  float x = t / period + phase;
  float f = x - floor(x);
  if (f < 0.22) { float u = f / 0.22; return u * u * (3.0 - 2.0 * u); }
  float u = (f - 0.22) / 0.78; float k = 1.0 - u; return k * k * k * (1.0 + 3.0 * u);
}`,I=`
${ct}
// the bell's surface at (u: apex 0, margin 1, lappet tips past 1; angle th) for contraction c and late flick cl
vec3 bellAt(float u, float th, float c, float cl, vec4 sp, float seed) {
  float depth = sp.y;
  float uu = min(u, 1.0);
  float r = sin(uu * 1.42) / sin(1.42);
  float y = depth * (1.0 - pow(uu, 1.75));
  r *= 1.0 - 0.2 * c * uu * uu - 0.08 * c * smoothstep(0.75, 1.0, uu);
  y *= 1.0 + 0.16 * c;
  y -= 0.06 * c * smoothstep(0.7, 1.0, uu);
  r *= 1.0 + 0.022 * uu * sin(2.0 * th + seed * 6.283) + 0.012 * uu * sin(3.0 * th + seed * 17.0);
  // a shallow furrow above each cleft between lappets
  if (sp.z > 0.5) r *= 1.0 - 0.012 * smoothstep(0.7, 1.0, uu) * pow(0.5 + 0.5 * cos(th * sp.z), 6.0);
  // the lappets hang on past the margin and flick inward late in the stroke
  float lap = max(u - 1.0, 0.0);
  r -= lap * (0.9 + 2.6 * cl);
  y -= lap * 2.4;
  return vec3(r * cos(th), y, r * sin(th));
}`,j=`
attribute vec3 aColour; attribute vec3 aGlowC; attribute vec4 aJel;   // contraction, t, glow, seed
attribute vec4 aSp;    // kind, depth, lappets, lappet length
attribute vec4 aSp2;   // canals, stripes, warts, veil
attribute vec3 aTc;    // strand colour
attribute vec4 aPul;   // period, phase, size (m), far (0 near .. 1 a far one)
`,X=`
${C}
${I}
${j}
varying vec3 vWorld; varying vec3 vN; varying vec2 vUv; varying vec3 vColour; varying vec3 vGlowC; varying vec4 vJel; varying vec4 vSp; varying vec4 vSp2; varying vec3 vLocal;
void main() {
  float u = uv.x, th = uv.y * 6.2831853;
  float c = aJel.x;
  float cl = pulseC(aJel.y - 0.12 * aPul.x, aPul.x, aPul.y);
  vec3 p = bellAt(u, th, c, cl, aSp, aJel.w);
  vec3 pu = bellAt(min(u + 0.015, ${R.toFixed(2)}), th, c, cl, aSp, aJel.w) - bellAt(max(u - 0.015, 0.0), th, c, cl, aSp, aJel.w);
  vec3 pt = bellAt(u, th + 0.02, c, cl, aSp, aJel.w) - bellAt(u, th - 0.02, c, cl, aSp, aJel.w);
  vec3 n = normalize(cross(pt, pu));
  if (u < 0.015) n = vec3(0.0, 1.0, 0.0);
  if (n.y < -0.9 && u < 0.5) n = -n;
  mat4 m = modelMatrix * instanceMatrix;
  vec4 wp = m * vec4(p, 1.0);
  vN = normalize(mat3(m) * n);
  vWorld = wp.xyz; vUv = vec2(u, th); vColour = aColour; vGlowC = aGlowC; vJel = aJel; vSp = aSp; vSp2 = aSp2; vLocal = p;
  gl_Position = projectionMatrix * viewMatrix * wp;
}`,Y=`
${C}
${H}
uniform float uSide;   // 0 the inside (drawn first), 1 the outside
uniform float uGlowGain;
varying vec3 vWorld; varying vec3 vN; varying vec2 vUv; varying vec3 vColour; varying vec3 vGlowC; varying vec4 vJel; varying vec4 vSp; varying vec4 vSp2; varying vec3 vLocal;
float line(float x, float w) {          // a thin line at the integers of x, w wide (in x), anti-aliased
  float d = abs(fract(x + 0.5) - 0.5);
  float fw = max(fwidth(x), 1e-4);
  float ww = max(w * 0.5, fw * 0.5);
  return (1.0 - smoothstep(ww - fw * 0.5, ww + fw * 0.5, d)) * min(1.0, w * 0.5 / ww);
}
void main() {
  vec3 V = normalize(cameraPosition - vWorld);
  vec3 N = normalize(vN);
  if (uSide < 0.5) N = -N;
  float ndv = abs(dot(N, V));
  float fres = pow(1.0 - ndv, 2.2);
  float u = vUv.x, th = vUv.y;
  float kind = vSp.x;
  float isCry = 1.0 - step(0.5, kind), isNet = step(0.5, kind) * (1.0 - step(1.5, kind)), isMoon = step(1.5, kind);
  // the scalloped margin: each lappet a rounded flap, a cleft between two (none on the crystal's smooth velum)
  float cut = 1.0;
  if (u > 1.0) {
    float s = vSp.z > 0.5 ? fract(th * vSp.z / 6.2831853) - 0.5 : 0.5;
    float len = vSp.w * sqrt(max(0.0, 1.0 - 4.0 * s * s));
    float e = (u - 1.0) - len;
    float fw = fwidth(u) + 1e-4;
    cut = 1.0 - smoothstep(-fw, fw, e);
  }
  if (cut < 0.01) discard;
  float rim = smoothstep(0.8, 1.0, u);
  float hem = smoothstep(0.93, 1.0, u);
  float cN = vSp2.x;
  float at = th * cN / 6.2831853;
  // radial canals: fine lines from the stomach to the margin (crystal: many, glassy; moon: branching, white)
  float canal = line(at, 0.06) * smoothstep(0.18, 0.4, u);
  if (isMoon > 0.5) canal = max(canal, line(at * 2.0 + 0.5, 0.05) * smoothstep(0.55, 0.75, u) * 0.8);
  float ringc = exp(-pow((u - 0.975) / 0.012, 2.0));
  // sea nettle: sixteen soft darker bands from crown to margin, a granular skin of stinging-cell warts
  float band = isNet * vSp2.y * smoothstep(0.35, 1.0, 0.5 + 0.5 * cos(th * 16.0 + 0.4)) * smoothstep(0.12, 0.5, u);
  float wn = vnoise(vec3(u * 70.0, th * 46.0, vJel.w * 13.0));
  float wfade = 1.0 - smoothstep(0.25, 0.6, fwidth(u * 70.0));
  float warts = vSp2.z * smoothstep(0.74, 0.9, wn) * wfade * (1.0 - hem) * uSide;
  // gonads: crystal - thin bright cream along the outer canals; nettle - four frilly cream curtains seen through;
  // moon - four horseshoes
  float lobes = 0.5 + 0.5 * cos(4.0 * th);
  float shoeMoon = exp(-pow((u - 0.44 - 0.09 * pow(lobes, 1.5)) / 0.05, 2.0)) * smoothstep(0.1, 0.6, lobes) * (1.0 - 0.35 * smoothstep(0.85, 1.0, lobes));
  float frill = 0.75 + 0.25 * sin(u * 140.0 + th * 3.0);
  float shoeNet = exp(-pow((u - 0.42) / 0.12, 2.0)) * pow(lobes, 2.0) * frill * (1.0 - uSide * 0.6);
  float shoeCry = canal * smoothstep(0.5, 0.7, u) * (1.0 - smoothstep(0.88, 0.95, u)) * 0.7;
  float shoe = isMoon * shoeMoon + isNet * shoeNet + isCry * shoeCry;
  // inside the bell near the margin: the ring of swimming muscle, fine circular striations
  float stri = (1.0 - uSide) * smoothstep(0.62, 0.8, u) * (1.0 - smoothstep(0.95, 1.0, u)) * (0.5 + 0.5 * sin(u * 260.0)) * (1.0 - smoothstep(0.3, 0.8, fwidth(u * 260.0)));
  float mott = fbm(vec3(u * 9.0, th * 3.0, vJel.w * 7.0));
  float glow = vJel.z * uGlowGain;
  float thick = 1.0 - smoothstep(0.0, 0.95, u);     // the jelly is thick at the crown and thins to nothing at the hem
  // the skin: jelly tinted by its kind, more saturated where it is thick; lit by its own lamp from inside and a
  // little by the water's light from above (a wet sheen on the top)
  vec3 tint = vColour * mix(1.0, 0.42, band);
  tint = mix(tint, tint * vec3(1.06, 0.82, 0.7), isNet * smoothstep(0.55, 1.0, u));   // rust toward the margin
  vec3 lit = lightPlayer(tint, N, V, 1.0, 0.95, 0.5, 0.5);
  vec3 lampN = vGlowC / max(max(vGlowC.r, vGlowC.g), max(vGlowC.b, 1e-3));
  vec3 self = tint * mix(vec3(1.0), lampN, 0.45 - 0.3 * isCry) * (0.22 + 0.5 * glow) * (0.55 + 0.45 * thick + 0.6 * fres) * (1.0 - 0.55 * isCry);
  vec3 col = mix(self, min(lit, vec3(1.0)), 0.18);
  vec3 H = normalize(V + uKeyDir);
  float spec = pow(max(dot(N, H), 0.0), 60.0) * uSide * (0.35 + 0.65 * wfade);
  col += uKeyTint * (spec * 0.55 + warts * 0.35) + uKeyTint * pow(max(dot(N, H), 0.0), 10.0) * 0.07 * uSide;
  col += lampN * warts * (0.18 + 0.25 * glow);   // the warts catch pin-points of the lamp's light
  col += vec3(0.95, 0.9, 0.82) * shoe * (0.12 + 0.2 * glow) * (isNet + 0.5 * isMoon);
  col = mix(col, col * 0.9 + vec3(0.03, 0.04, 0.05), stri * 0.5);
  float a = 0.07 + 0.42 * fres + 0.16 * thick * (1.0 - isCry * 0.6) + 0.26 * rim + 0.42 * hem * (1.0 - isCry * 0.5) + 0.42 * shoe + 0.18 * canal + 0.3 * ringc + 0.22 * band + 0.3 * warts + 0.05 * (mott - 0.5) + 0.12 * stri;
  a *= uSide < 0.5 ? 0.6 : 1.0;
  a *= mix(vSp2.w, 1.0, clamp(0.6 * fres + rim + shoe, 0.0, 1.0));   // thinner where the eye looks straight through to the toy
  a *= cut;
  // its own light: the crystal's ring of green points where each canal meets the margin; the nettle's amber
  // margin and gonads; the moon's horseshoes and canals. It swells with the squeeze of a stroke.
  vec3 g = vGlowC;
  float points = canal * exp(-pow((u - 0.965) / 0.018, 2.0));
  float own = isCry * (0.1 * ringc + 0.06 * canal) + isNet * (0.5 * shoe + 0.35 * hem + 0.12 * ringc) + isMoon * (0.75 * shoe + 0.22 * canal + 0.3 * ringc);
  vec3 emit = g * glow * (0.05 + own + 0.08 * fres) * (0.8 + 0.35 * vJel.x);
  // the crystal jelly's own light is green fluorescence in points round the margin, one at each canal's end
  emit += isCry * vec3(0.12, 1.0, 0.32) * glow * 2.6 * points * (0.8 + 0.35 * vJel.x);
  emit += g * glow * 0.04 * thick;
  float dist = length(cameraPosition - vWorld);
  float k = 1.0 - exp(-uHazeDensity * dist);
  col = haze(shoulder(col), dist);
  a = clamp(a, 0.0, 0.92) * (1.0 - 0.75 * k);
  emit *= 1.0 - 0.7 * k;
  gl_FragColor = vec4(col * a + emit, a);
  gl_FragColor.rgb = linearToOutputTexel(vec4(gl_FragColor.rgb, 1.0)).rgb;
}`,vt=`
${C}
${I}
${j}
attribute vec4 aRib; attribute vec2 aVW;
varying vec3 vWorld; varying vec2 vVW; varying vec3 vTc; varying vec3 vGlowC; varying vec4 vJel; varying float vKind; varying float vCov; varying float vSeed; varying float vSpK;
uniform float uFlow;
// a strand's centre line at v (0 root .. 1 tip), in the bell's frame (radii)
vec3 strandAt(float v, out float wid) {
  float kind = aRib.x, i = aRib.y, h = aRib.z, sd = aRib.w;
  int sk = int(aSp.x + 0.5);
  float armL = sk == 0 ? ${d[0].arm[0].toFixed(2)} : sk == 1 ? ${d[1].arm[0].toFixed(2)} : ${d[2].arm[0].toFixed(2)};
  float armW = sk == 0 ? ${d[0].arm[1].toFixed(2)} : sk == 1 ? ${d[1].arm[1].toFixed(2)} : ${d[2].arm[1].toFixed(2)};
  vec4 tent = sk == 0 ? vec4(${d[0].tent.map(n=>n.toFixed(4)).join(", ")}) : sk == 1 ? vec4(${d[1].tent.map(n=>n.toFixed(4)).join(", ")}) : vec4(${d[2].tent.map(n=>n.toFixed(4)).join(", ")});
  float delay = sk == 0 ? ${d[0].delay.toFixed(3)} : sk == 1 ? ${d[1].delay.toFixed(3)} : ${d[2].delay.toFixed(3)};
  float t = aJel.y, period = aPul.x, phase = aPul.y;
  if (kind < 0.5) {
    // an oral arm: from round the mouth, hanging, spiralling slowly about the others, the pulse a beat late down it
    float L = armL * (0.85 + 0.3 * h);
    float d = v * L;
    float cd = pulseC(t - d * delay * 2.4, period, phase);
    float ang = (i + 0.25) * 1.5708 + 0.35 * v * L + 0.05 * t + sd;
    float rr = 0.1 + 0.05 * v + 0.06 * sin(t * 0.21 + d * 1.3 + sd * 6.0) * v;
    vec3 p = vec3(rr * cos(ang), -0.02 - d * (1.0 - 0.06 * cd), rr * sin(ang));
    p.x += 0.12 * v * v * sin(t * 0.17 + d * 0.8 + sd * 9.0) + uFlow * d * d * 0.05;
    p.z += 0.12 * v * v * cos(t * 0.13 + d * 0.7 + sd * 4.0);
    wid = armW * (1.0 - 0.75 * v) * (0.7 + 0.3 * sin(v * L * 9.0 + sd * 20.0 + t * 0.4));
    return p;
  }
  // a tentacle: from the margin (in a cleft), hanging with its own slack; the bell's squeeze reaches it late and
  // travels down it; two slow waves of sway, growing toward the tip; some partly coiled
  if (i > tent.x - 0.5) { wid = 0.0; return vec3(0.0); }
  float ang = (i + 0.5) / tent.x * 6.2831853 + (sk == 1 ? 3.14159 / 32.0 : 0.0);
  float L = mix(tent.y, tent.z, h);
  float d = v * L;
  float cd = pulseC(t - d * delay, period, phase);
  vec3 root = bellAt(1.0, ang, cd, cd, aSp, aJel.w) * vec3(0.985, 1.0, 0.985);
  vec2 out2 = vec2(cos(ang), sin(ang));
  vec3 p = root + vec3(0.0, -d, 0.0);
  float flare = (0.16 * (1.0 - cd) - 0.05) * min(d, 1.2);
  p.xz += out2 * flare;
  float s1 = sin(t * 0.5 - d * 1.9 + sd * 6.283), s2 = cos(t * 0.37 - d * 1.4 + sd * 9.0);
  float sway = 0.12 * pow(d, 1.25) * (sk == 2 ? 0.3 : 1.0);
  p.x += sway * s1 + uFlow * 0.04 * d * d; p.z += sway * s2;
  if (sd > 0.72 && sk != 2) { float cw = 22.0 + 10.0 * sd; p.xz += 0.025 * smoothstep(0.2, 0.6, v) * vec2(cos(d * cw), sin(d * cw)); }
  if (sk == 2) p.xz += out2 * 0.05 * d * sin(t * 6.0 + i * 1.7) * 0.4;   // the moon's short fringe trembles
  wid = tent.w * (1.0 - 0.6 * v);
  return p;
}
void main() {
  float v = aVW.x, w = aVW.y;
  mat4 m = modelMatrix * instanceMatrix;
  float wid0, wid1;
  vec3 l0 = strandAt(v, wid0);
  vec3 l1 = strandAt(min(v + 0.02, 1.0), wid1);
  vec3 c0 = (m * vec4(l0, 1.0)).xyz;
  vec3 c1 = (m * vec4(l1, 1.0)).xyz;
  vec3 tg = normalize(c1 - c0 + vec3(1e-6, 1e-5, 1e-6));
  vec3 view = normalize(cameraPosition - c0);
  vec3 side = normalize(cross(tg, view) + vec3(1e-6));
  float scale = length(m[0].xyz);
  float dist = length(cameraPosition - c0);
  float want = wid0 * scale;
  float px = uPx * dist * 0.75;                     // never thinner than most of a pixel: coverage carries the rest
  float got = max(want, px);
  vec3 wp = c0 + side * w * got;
  vWorld = wp; vVW = aVW; vTc = aTc; vGlowC = aGlowC; vJel = aJel; vKind = aRib.x; vSeed = aRib.w; vSpK = aSp.x;
  vCov = want > 0.0 ? want / got : 0.0;
  gl_Position = wid0 <= 0.0 ? vec4(2.0, 2.0, 2.0, 1.0) : projectionMatrix * viewMatrix * vec4(wp, 1.0);
}`,ut=`
${C}
${H}
uniform float uGlowGain;
varying vec3 vWorld; varying vec2 vVW; varying vec3 vTc; varying vec3 vGlowC; varying vec4 vJel; varying float vKind; varying float vCov; varying float vSeed; varying float vSpK;
void main() {
  float v = vVW.x, w = abs(vVW.y);
  float glow = vJel.z * uGlowGain;
  vec3 col; float a; vec3 emit;
  if (vKind < 0.5) {
    // an oral arm: wet silk, translucent cream, its ruffled margins catching more light than its middle
    float edge = smoothstep(0.35, 0.95, w);
    float fold = 0.5 + 0.5 * sin(v * 160.0 + w * 4.0 + vSeed * 30.0);
    col = vTc * (0.35 + 0.65 * uKeyTint * 0.6) * (0.75 + 0.35 * fold);
    a = (0.1 + 0.28 * edge + 0.08 * fold) * smoothstep(1.0, 0.82, w) * (1.0 - smoothstep(0.7, 1.0, v)) * (vSpK > 1.5 ? 0.55 : 1.0);
    emit = vGlowC * glow * (0.05 + 0.12 * edge) * (1.0 - v);
  } else {
    // a tentacle: a thread, beaded with batteries of stinging cells that catch the light as tiny points
    float beads = smoothstep(0.7, 1.0, 0.5 + 0.5 * sin(v * 220.0 + vSeed * 40.0));
    col = vTc * (0.5 + 0.5 * uKeyTint) * (0.8 + 0.5 * beads);
    float wt = vSpK < 0.5 ? 0.38 : vSpK < 1.5 ? 0.7 : 0.32;
    a = wt * (0.75 + 0.4 * beads) * smoothstep(1.0, 0.4, w) * vCov * (1.0 - smoothstep(0.45 + 0.2 * vSeed, 1.0, v));
    emit = vGlowC * glow * (vSpK < 0.5 ? 0.12 : 0.16) * (1.0 - v) * (1.0 - v) * vCov;
  }
  float dist = length(cameraPosition - vWorld);
  float k = 1.0 - exp(-uHazeDensity * dist);
  col = haze(col, dist);
  a *= 1.0 - 0.75 * k; emit *= 1.0 - 0.7 * k;
  gl_FragColor = vec4(linearToOutputTexel(vec4(col * a + emit, 1.0)).rgb, a);
}`,Z=`
attribute vec3 aGlowC; attribute vec4 aJel; attribute vec4 aPul; attribute vec4 aSp;
uniform float uScale; uniform float uLift; uniform float uBack;
varying vec2 vQ; varying vec3 vColour; varying float vGlow; varying float vDist;
void main() {
  mat4 m = modelMatrix * instanceMatrix;
  vec3 c = (m * vec4(0.0, uLift, 0.0, 1.0)).xyz;
  c += normalize(c - cameraPosition) * uBack * length(m[0].xyz);
  float s = length(m[0].xyz) * uScale;
  vec3 r = vec3(viewMatrix[0][0], viewMatrix[1][0], viewMatrix[2][0]);
  vec3 u = vec3(viewMatrix[0][1], viewMatrix[1][1], viewMatrix[2][1]);
  vec3 wp = c + (r * position.x + u * position.y) * s;
  vQ = position.xy; vColour = aGlowC; vGlow = aJel.z * (0.85 + 0.35 * aJel.x) * (1.0 - 0.5 * aPul.w) * (aSp.x < 0.5 ? 0.6 : 1.0);   // the crystal jelly is clear glass: a softer lamp vDist = length(cameraPosition - c);
  gl_Position = projectionMatrix * viewMatrix * vec4(wp, 1.0);
}`,Q=`
uniform float uHazeDensity; uniform float uGlowGain; uniform float uAmount; uniform float uCore; uniform float uOcc;
varying vec2 vQ; varying vec3 vColour; varying float vGlow; varying float vDist;
void main() {
  float d = length(vQ);
  float f = exp(-d * d * 4.5) * (1.0 - uCore) + exp(-d * d * 16.0) * uCore;
  f *= 1.0 - smoothstep(0.75, 1.0, d);
  float k = f * vGlow * uGlowGain * uAmount * (1.0 - 0.6 * (1.0 - exp(-uHazeDensity * vDist)));
  float a = clamp(k * uOcc, 0.0, 0.75);
  vec3 c = linearToOutputTexel(vec4(vColour * 1.3, 1.0)).rgb * k;
  gl_FragColor = vec4(c, a);
}`;function ht(n,c={}){const m=c.kinds||[0,1,2],s=m.length,l=c.colours||["#DCEBE6","#E8A24A","#D6E2F2"],r=c.glows||l,u=c.strands||["#CFE3DA","#7A1F2A","#E7EEF6"],o=t=>{const e=new a.InstancedBufferAttribute(new Float32Array(s*t),t);return e.setUsage(a.DynamicDrawUsage),e},v=o(3),w=o(3),h=o(4),p=o(4),k=o(4),A=o(3),z=o(4),G=rt(),M=st(),F=new a.PlaneGeometry(2,2),L=new a.PlaneGeometry(2,2);for(const t of[G,M,F,L])t.setAttribute("aColour",v),t.setAttribute("aGlowC",w),t.setAttribute("aJel",h),t.setAttribute("aSp",p),t.setAttribute("aSp2",k),t.setAttribute("aTc",A),t.setAttribute("aPul",z),t.boundingSphere=new a.Sphere(new a.Vector3,1e5);const g={value:1},V={value:.4},y={transparent:!0,depthWrite:!1,blending:a.CustomBlending,blendSrc:a.OneFactor,blendDst:a.OneMinusSrcAlphaFactor,blendSrcAlpha:a.OneFactor,blendDstAlpha:a.OneMinusSrcAlphaFactor},K=new a.ShaderMaterial({vertexShader:X,fragmentShader:Y,uniforms:{...n.light,uSide:{value:0},uGlowGain:g},side:a.BackSide,...y}),B=new a.ShaderMaterial({vertexShader:X,fragmentShader:Y,uniforms:{...n.light,uSide:{value:1},uGlowGain:g},side:a.FrontSide,...y}),U=new a.ShaderMaterial({vertexShader:vt,fragmentShader:ut,uniforms:{...n.light,uGlowGain:g,uFlow:V},side:a.DoubleSide,...y}),O=new a.ShaderMaterial({vertexShader:Z,fragmentShader:Q,uniforms:{uHazeDensity:n.light.uHazeDensity,uGlowGain:g,uScale:{value:1.35},uLift:{value:.42},uBack:{value:0},uAmount:{value:.3},uCore:{value:.35},uOcc:{value:.5}},...y,depthTest:!0}),E=new a.ShaderMaterial({vertexShader:Z,fragmentShader:Q,uniforms:{uHazeDensity:n.light.uHazeDensity,uGlowGain:g,uScale:{value:.72},uLift:{value:.32},uBack:{value:.6},uAmount:{value:.34},uCore:{value:.6},uOcc:{value:.3}},...y,depthTest:!0}),_=new a.Group,x=(t,e,i)=>{const f=new a.InstancedMesh(t,e,s);return f.frustumCulled=!1,f.renderOrder=i,f.instanceMatrix.setUsage(a.DynamicDrawUsage),_.add(f),f},tt=x(F,O,1),et=x(M,U,2),at=x(L,E,2.5),ot=x(G,K,3),it=x(G,B,4),J=[tt,et,at,ot,it],b=[];for(let t=0;t<s;t++){const e=m[t],i=d[e],f=D(l[t%l.length]);v.setXYZ(t,f.r,f.g,f.b);const P=D(r[t%r.length]);w.setXYZ(t,P.r,P.g,P.b);const W=D(u[t%u.length]);A.setXYZ(t,W.r,W.g,W.b),p.setXYZW(t,e,i.depth,i.lap,i.lapL),k.setXYZW(t,i.canals,i.stripes,i.warts,(c.veils||[])[t]??1),b.push({kind:e,position:new a.Vector3,quaternion:new a.Quaternion,size:(c.sizes||[])[t]||c.size||.45,t:0,c:0,glow:.8,visible:!0,seed:T("lantern"+t),hex:r[t%r.length],period:3.8,phase:0,far:0})}for(const t of[v,w,A,p,k])t.needsUpdate=!0;const q=new a.Matrix4,lt=new a.Vector3,nt=new a.Matrix4().makeScale(0,0,0),N={object:_,count:s,get(t){return b[t]},set(t,e){const i=b[t];if(!i)return N;e.position&&(Array.isArray(e.position)?i.position.fromArray(e.position):i.position.copy(e.position)),e.quaternion&&(Array.isArray(e.quaternion)?i.quaternion.fromArray(e.quaternion):i.quaternion.copy(e.quaternion));for(const f of["size","t","c","glow","visible","period","phase","far"])e[f]!==void 0&&(i[f]=e[f]);return N},lights(t=1,e=s){return b.slice(0,e).filter(i=>i.visible).map(i=>({p:new a.Vector3(0,.45*i.size,0).applyQuaternion(i.quaternion).add(i.position).toArray(),colour:i.hex,radius:i.size*5.5,intensity:t*.42*i.glow*(.85+.3*i.c)}))},setGlowGain(t){g.value=t},setFlow(t){V.value=t},update(){for(let t=0;t<s;t++){const e=b[t];if(!e.visible){for(const i of J)i.setMatrixAt(t,nt);continue}q.compose(e.position,e.quaternion,lt.set(e.size,e.size,e.size));for(const i of J)i.setMatrixAt(t,q);h.setXYZW(t,e.c,e.t,e.glow,e.seed),z.setXYZW(t,e.period,e.phase,e.size,e.far)}for(const t of J)t.instanceMatrix.needsUpdate=!0;h.needsUpdate=!0,z.needsUpdate=!0},dispose(){for(const t of[G,M,F,L])t.dispose();for(const t of[K,B,U,O,E])t.dispose()}};return N}function mt(n,c=3.8,m=0){const s=n/c+m,l=s-Math.floor(s);let r;if(l<.22){const o=l/.22;r=o*o*(3-2*o)}else{const o=(l-.22)/.78,v=1-o;r=v*v*v*(1+3*o)}const u=.035*Math.sin(2*Math.PI*(l-.12));return{c:r,lift:u,phase:l}}export{d as KINDS,ht as createLanterns,mt as lanternPulse};
