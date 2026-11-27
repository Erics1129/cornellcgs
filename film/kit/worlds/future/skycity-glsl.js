const e=`
precision highp float; precision highp int; precision highp sampler2D; precision highp sampler3D;
uniform sampler2D uSky;          // sky-view table: x = angle from the sun's azimuth / pi, y = sqrt((el + 10) / 100)
uniform vec3 uSunDir;            // toward the sun
uniform vec3 uSunE;              // the sun's light at the deck (linear, after the air)
uniform float uSkyK;             // the sky table's scale
uniform vec3 uAmbUp;             // sky light on an up-facing surface
uniform vec3 uDeckCol;           // the deck's mean colour seen at a grazing angle (for mirrors and the far deck)
uniform float uTime;
uniform vec3 uWind;
uniform vec4 uTurrets[12];
uniform vec4 uTowers[16];        // x, z, radius, top
uniform int uNTowers;
const float U32 = 1.0 / 4294967296.0;
const float PI = 3.14159265;
uint h2(ivec2 p) {
  uint h = (uint(p.x) * 0x8da6b343u) ^ (uint(p.y) * 0xd8163841u);
  h ^= h >> 16; h *= 0x7feb352du; h ^= h >> 15; h *= 0x846ca68bu; h ^= h >> 16;
  return h;
}
float vn(vec2 p) {
  vec2 i = floor(p); vec2 f = p - i;
  f = f * f * f * (f * (f * 6.0 - 15.0) + 10.0);
  ivec2 c = ivec2(i);
  float a = float(h2(c)) * U32, b = float(h2(c + ivec2(1, 0))) * U32, cc = float(h2(c + ivec2(0, 1))) * U32, d = float(h2(c + ivec2(1, 1))) * U32;
  float x0 = a + (b - a) * f.x;
  return x0 + ((cc + (d - cc) * f.x) - x0) * f.y;
}
float hash12(vec2 p) { vec3 p3 = fract(vec3(p.xyx) * .1031); p3 += dot(p3, p3.yzx + 33.33); return fract((p3.x + p3.y) * p3.z); }
float ign(vec2 p) { return fract(52.9829189 * fract(dot(p, vec2(0.06711056, 0.00583715)))); }
const vec2 R1 = vec2(0.76484219, 0.64421769), R2 = vec2(-0.32328957, 0.94630009), R3 = vec2(-0.94222234, 0.33498815);
float deckH(vec2 xz) {
  float x = xz.x, z = xz.y;
  float h = 30.0 * (vn(vec2(x / 1100.0 + 17.3, z / 1100.0 - 4.1)) - 0.5) * 2.0;
  { vec2 q = vec2(R1.x * x - R1.y * z, R1.y * x + R1.x * z) / 380.0; h += 24.0 * abs(vn(q) * 2.0 - 1.0) - 8.0; }
  { vec2 q = vec2(R2.x * x - R2.y * z, R2.y * x + R2.x * z) / 150.0; h += 11.0 * abs(vn(q + vec2(3.7, 0.0)) * 2.0 - 1.0) - 3.0; }
  { vec2 q = vec2(R3.x * x - R3.y * z, R3.y * x + R3.x * z) / 62.0; h += 4.5 * (vn(q + vec2(0.0, 9.2)) - 0.5) * 2.0; }
  for (int i = 0; i < 12; i++) {
    vec4 t = uTurrets[i];
    vec2 d = xz - t.xy;
    float d2 = dot(d, d) / (t.z * t.z);
    if (d2 < 1.0) {
      float k = 1.0 - d2, lump = 0.8 + 0.4 * vn(vec2((x - t.x) / 90.0 + t.x * 0.01, (z - t.y) / 90.0));
      float pr = k * (2.0 - k);
      h += t.w * pr * lump;
    }
  }
  return h;
}
// the sky (linear) in a direction, from the table; below the horizon the table's own lowest rows
vec3 skyAt(vec3 d) {
  vec2 a = normalize(d.xz + vec2(1e-6, 0.0)), s = normalize(uSunDir.xz);
  float phi = acos(clamp(dot(a, s), -1.0, 1.0)) / PI;
  float el = degrees(asin(clamp(d.y, -1.0, 1.0)));
  float v = sqrt(clamp((el + 10.0) / 100.0, 0.0, 1.0));
  vec3 c = texture(uSky, vec2(phi, v)).rgb * uSkyK;
  // multiple scattering whitens the low sky a little (single scattering leaves it yellow-green)
  float lum = dot(c, vec3(0.2126, 0.7152, 0.0722));
  return mix(c, vec3(lum) * vec3(1.02, 1.0, 1.03), 0.22 * exp(-max(el, 0.0) / 6.0)) * vec3(1.0, 0.985, 1.04);
}
vec3 horizonAt(vec3 d) { return skyAt(normalize(vec3(d.x, 0.012, d.z))); }
// soft shadow of the towers (vertical cylinders) along the sun from p; skip = a tower's own seed index
float towerShadow(vec3 p, float soft, int skip) {
  float sh = 1.0;
  vec2 l = uSunDir.xz; float ll = dot(l, l);
  for (int i = 0; i < 16; i++) {
    if (i >= uNTowers) break;
    if (i == skip) continue;
    vec4 t = uTowers[i];
    vec2 o = p.xz - t.xy;
    float s = -dot(o, l) / ll;
    if (s <= 0.0) continue;
    float y = p.y + uSunDir.y * s;
    vec2 c = o + l * s;
    float dist = length(c);
    float pw = soft + s * 0.012;
    float k = smoothstep(t.z - pw, t.z + pw, dist);
    k = max(k, smoothstep(t.w - pw * 0.5, t.w + pw * 0.5, y));
    sh *= k;
  }
  return sh;
}
vec3 toSRGB(vec3 c) { c = clamp(c, 0.0, 1.0); return mix(c * 12.92, 1.055 * pow(c, vec3(1.0 / 2.4)) - 0.055, step(0.0031308, c)); }
`,t=`
in vec3 position; out vec2 vUv;
void main() { vUv = position.xy * 0.5 + 0.5; gl_Position = vec4(position.xy, 0.0, 1.0); }`,o=`
in vec2 vUv;
uniform mat4 uInvProj, uCamWorld;
uniform vec4 uTrail;            // contrail: head angle, length (rad), age scale, strength
uniform vec3 uTrailN, uTrailE1, uTrailE2;
out vec4 outColor;
void main() {
  vec4 v = uInvProj * vec4(vUv * 2.0 - 1.0, 1.0, 1.0);
  vec3 d = normalize(mat3(uCamWorld) * normalize(v.xyz / v.w));
  vec3 c = skyAt(d);
  // the contrail: a thin line along a great circle high in the sky, spreading and fading behind its head
  {
    float side = dot(d, uTrailN);
    vec3 dp = d - uTrailN * side;
    float a = atan(dot(dp, uTrailE2), dot(dp, uTrailE1));
    float age = (uTrail.x - a) / max(uTrail.y, 1e-4);           // 0 at the head .. 1 at the tail
    if (age > -0.002 && age < 1.0 && d.y > 0.0) {
      float w = 0.00045 + 0.0055 * age * age + 0.0012 * age;     // radians: thin at the head, wider behind
      float wob = 0.0007 * sin(a * 140.0 + uTime * 0.05) * age;
      float prof = exp(-pow((side - wob) / w, 2.0)) * (1.0 - smoothstep(0.55, 1.0, age)) * smoothstep(-0.002, 0.004, age);
      float strength = uTrail.w * prof * (0.55 / (1.0 + 6.0 * age));
      vec3 lit = uSunE * 0.032 * (1.0 + 2.0 * pow(max(dot(d, uSunDir), 0.0), 8.0)) + uAmbUp * 0.05;
      c = mix(c, lit + c * 0.6, clamp(strength, 0.0, 0.85));
      // the aircraft at its head: a tiny glint
      float head = exp(-pow(length(vec2(side, (a - uTrail.x) * 1.0)) / 0.00035, 2.0));
      c += uSunE * head * 0.9;
    }
  }
  // the sun: a bright disc with a darkened limb
  float r = atan(length(cross(d, uSunDir)), dot(d, uSunDir)) / 0.00465;
  if (r < 1.25) {
    float limb = sqrt(max(0.0, 1.0 - min(r, 1.0) * min(r, 1.0)));
    float disc = (1.0 - smoothstep(0.92, 1.08, r)) * (0.45 + 0.55 * limb);
    c += uSunE * disc * 2400.0;
  }
  outColor = vec4(c, 1.0);
}`,a=`
in vec3 position; in vec3 normal; in vec4 attr;
uniform mat4 modelMatrix, viewMatrix, projectionMatrix;
out vec3 vWorld; out vec3 vNormal; out vec4 vAttr;
void main() {
  vec4 w = modelMatrix * vec4(position, 1.0);
  vWorld = w.xyz; vNormal = normalize(mat3(modelMatrix) * normal); vAttr = attr;
  gl_Position = projectionMatrix * viewMatrix * w;
}`,i=`
in vec3 vWorld; in vec3 vNormal; in vec4 vAttr;
uniform vec3 uCam;
uniform float uWindows;
uniform float uTowerSeeds[16];
out vec4 outColor;
float lines(float x, float w, float fw) {
  float d = abs(fract(x) - 0.5);
  float a = smoothstep(0.5 - w * 0.5 - fw, 0.5 - w * 0.5 + fw, d);
  return mix(a, w, smoothstep(0.18, 0.55, fw));
}
// what a mirror sees along R: the sky above, the sunlit deck below (brighter toward the sun), the sun
vec3 envAt(vec3 R, float rough) {
  vec3 sk = skyAt(vec3(R.x, max(R.y, 0.0), R.z));
  float toward = pow(max(dot(normalize(R.xz + 1e-5), normalize(uSunDir.xz)), 0.0), 3.0);
  vec3 dk = uDeckCol * (0.82 + 0.5 * toward) * (1.0 - 0.25 * smoothstep(0.0, -0.6, R.y));
  dk = mix(dk, horizonAt(R), exp(min(R.y, 0.0) * 14.0) * 0.6);
  vec3 s = mix(dk, sk, smoothstep(-0.035, 0.02, R.y));
  float c = max(dot(R, uSunDir), 0.0);
  s += uSunE * (0.6 * pow(c, 18.0 / rough) + 14.0 * pow(c, 900.0 / rough) / rough);
  return s;
}
void main() {
  float zone = vAttr.x, tid = vAttr.y, s = vAttr.z, top = vAttr.w;
  vec3 N = normalize(vNormal);
  vec3 V = normalize(uCam - vWorld);
  if (dot(N, V) < 0.0 && (zone > 1.5 && zone < 2.5 || zone > 3.5 && zone < 4.5)) N = -N;
  float y = vWorld.y;
  float fwY = max(fwidth(y), 1e-3), fwS = max(fwidth(s), 1e-3);
  // which tower casts no shadow on itself
  int self = -1;
  for (int i = 0; i < 16; i++) { if (i < uNTowers && abs(uTowerSeeds[i] - tid) < 0.5) self = i; }
  float sh = towerShadow(vWorld, 2.0, self);
  // sun light, sky fill from above and the side, warm bounce from the sunlit deck below
  vec3 L = uSunDir;
  float ndl = max(dot(N, L), 0.0) * sh;
  float deckGlow = exp(-max(y, 0.0) / 260.0);
  vec3 fill = uAmbUp * (0.55 + 0.45 * N.y) * 1.25 + uDeckCol * (0.30 + 0.25 * deckGlow) * max(0.0, 0.55 - 0.45 * N.y);
  float tv = hash12(vec2(tid, 7.13)), tv2 = hash12(vec2(tid * 1.7, 2.9));
  vec3 col;
  if (zone < 0.5 || (zone > 4.5 && zone < 5.5)) {          // pale ceramic: warm white, faint panel joints
    vec3 alb = vec3(0.80, 0.78, 0.74) * (0.94 + 0.08 * vn(vec2(y / 5.0, s / 4.0 + tid * 3.0)));
    float j = lines(y / 4.0, 0.05, fwY / 4.0) * 0.12 + lines(s / 3.0, 0.04, fwS / 3.0) * 0.08;
    alb *= 1.0 - j;
    col = alb * (uSunE * ndl + fill);
  } else if (zone < 1.5) {                                  // the curtain wall
    // two families: (a) a sheer reflective glass skin with fine mullions and a dark spandrel band per
    // floor; (b) glass behind pale ceramic fins. Every tower its own rhythm.
    float fl = y / 4.0, fwF = fwY / 4.0;
    bool fins = tv > 0.55;
    float modW = fins ? mix(1.4, 2.1, tv2) : mix(1.5, 1.8, tv2);
    float mull = lines(s / modW, fins ? 0.20 : 0.035, fwS / modW);
    float spand = lines(fl + 0.5, fins ? 0.20 : 0.24, fwF);
    float band = lines(fl / 12.0 + tid * 0.37, 0.045, fwF / 12.0) * 0.7;
    float ndv = max(dot(N, V), 0.0);
    float F0 = fins ? 0.10 : 0.16;
    float F = F0 + (1.0 - F0) * pow(1.0 - ndv, 5.0);
    // each pane sits a hair off true (oil-canning): its reflection breaks a little from pane to pane
    vec2 cell = vec2(floor(fl), floor(s / modW) + tid * 13.0);
    float pane = hash12(cell), pane2 = hash12(cell + 7.7);
    vec3 Np = normalize(N + vec3((pane - 0.5) * 0.008, (pane2 - 0.5) * 0.012, (pane2 - 0.5) * 0.005));
    vec3 R = reflect(-V, Np);
    vec3 tint = mix(vec3(0.62, 0.76, 0.84), vec3(0.80, 0.84, 0.82), tv2) * (0.97 + 0.06 * pane);
    vec3 interior = vec3(0.012, 0.016, 0.022) * (0.9 + 0.2 * hash12(cell + 3.3)) + fill * 0.025;
    // a few rooms lit warm, grouped by floor; under a pixel it becomes their mean glow
    float grp = hash12(vec2(floor(fl / 3.0), tid * 5.1));
    float on = hash12(vec2(floor(fl), floor(s / (modW * 4.0)) + tid * 31.0));
    float lit = step(1.0 - uWindows * 0.6 * mix(0.2, 1.0, grp), on) * (1.0 - mull);
    lit = mix(lit, uWindows * 0.6 * mix(0.2, 1.0, grp), smoothstep(0.25, 0.7, fwF));
    interior += lit * vec3(1.0, 0.70, 0.42) * 0.07 * (0.6 + 0.8 * hash12(cell + 9.1));
    vec3 env = envAt(R, 1.0);
    vec3 glass = interior * (1.0 - F) + env * tint * F * mix(0.62, 1.0, sh);
    // spandrel: the same glass with an opaque dark back (a little less deep), fins and bands pale ceramic
    vec3 spandC = vec3(0.03, 0.035, 0.04) * (1.0 - F) + env * tint * F * 1.05;
    vec3 pale = vec3(0.50, 0.49, 0.46) * (uSunE * ndl + fill * 0.7);
    vec3 dark = vec3(0.05, 0.055, 0.06) * (uSunE * ndl + fill) + env * 0.05;
    col = mix(glass, spandC, spand);
    col = mix(col, fins ? pale : dark, mull);
    col = mix(col, pale, band);
  } else if (zone < 2.5) {                                  // planting
    // leaves: a fine clumpy pattern; gaps between clumps dark; a few warmer, drier tips
    // triplanar, so the leaf pattern never streaks down the sides
    vec3 an = abs(N) / (abs(N).x + abs(N).y + abs(N).z);
    vec3 wp = vWorld * 24.0;
    float l1 = vn(wp.zy) * an.x + vn(wp.xz) * an.y + vn(wp.xy) * an.z;
    float l2 = vn(wp.zy * 2.3 + 4.1) * an.x + vn(wp.xz * 2.3 + 4.1) * an.y + vn(wp.xy * 2.3 + 4.1) * an.z;
    vec2 lp = wp.xz;
    float leaf = l1 * 0.55 + l2 * 0.3 + vn(vWorld.xz * 1.3 + y) * 0.15;
    float gap = smoothstep(0.12, 0.46, leaf);
    float kind = hash12(vec2(tid, 3.7));
    vec3 lo = mix(vec3(0.016, 0.030, 0.016), vec3(0.030, 0.034, 0.020), kind), hi = mix(vec3(0.050, 0.080, 0.036), vec3(0.095, 0.098, 0.060), kind);
    vec3 alb = mix(lo, hi, leaf);
    float fl = step(0.93, vn(wp.xz * 1.7 + wp.y)) * step(0.55, kind) * step(0.6, N.y);
    alb = mix(alb, vec3(0.55, 0.30, 0.16), fl * 0.6);
    alb = mix(alb, vec3(0.13, 0.11, 0.05), smoothstep(0.78, 0.95, vn(lp * 0.5 + tid)) * 0.4);
    float lightK = (0.35 + 0.65 * ndl) * mix(0.55, 1.0, gap);
    col = alb * (uSunE * lightK * sh + fill * mix(0.55, 0.9, gap));
  } else if (zone < 3.5) {                                  // metal: brushed, pale
    float ndv = max(dot(N, V), 0.0);
    vec3 R = reflect(-V, N);
    col = vec3(0.42, 0.43, 0.44) * (uSunE * ndl + fill) * 0.8 + envAt(R, 4.0) * 0.18 * (0.3 + 0.7 * pow(1.0 - ndv, 3.0));
  } else if (zone < 4.5) {                                  // glazing: the bridge's windows, the rail
    vec3 R = reflect(-V, N);
    float ndv = max(dot(N, V), 0.0);
    float F = 0.07 + 0.93 * pow(1.0 - ndv, 5.0);
    float mull = lines(s / 2.4, 0.05, fwS / 2.4) * 0.8;
    vec3 inside = vec3(0.05, 0.045, 0.04) + vec3(1.0, 0.75, 0.5) * 0.05 * (0.4 + uWindows) + fill * 0.12;
    // the twins' sky-bridge (floor at y 128, 9 m of glass): a deep warm room behind the glass, a strip of
    // ceiling light, planters along the floor, the far wall's own windows showing the sky through it
    if (vWorld.y > 127.5 && vWorld.y < 138.0) {
      float h = (vWorld.y - 128.0) / 9.0;
      vec3 room = mix(vec3(0.035, 0.03, 0.026), vec3(0.11, 0.09, 0.07), smoothstep(0.1, 0.8, h));
      room += vec3(1.0, 0.82, 0.6) * 0.5 * exp(-pow((h - 0.9) / 0.035, 2.0));
      float plant = smoothstep(0.2, 0.1, h + 0.06 * vn(vec2(s * 0.8, 1.0)));
      room = mix(room, vec3(0.02, 0.035, 0.018) * (0.6 + 0.8 * vn(vec2(s * 3.0, h * 9.0))), plant);
      vec3 through = skyAt(normalize(vec3(-V.x, max(-V.y, 0.02), -V.z)));
      room = mix(room, through * 0.55, smoothstep(0.32, 0.4, h) * smoothstep(0.86, 0.78, h) * 0.55);
      inside = room;
      mull = max(mull, lines(h * 3.0 + 0.5, 0.025, fwidth(h) * 3.0) * 0.7);
    }
    vec3 glass = inside * (1.0 - F) + envAt(R, 1.0) * F;
    vec3 pale = vec3(0.78, 0.77, 0.74) * (uSunE * ndl + fill);
    col = mix(glass, pale, mull);
  } else if (zone < 6.5) {                                  // paving: pale stone with joints
    vec3 alb = vec3(0.70, 0.68, 0.63) * (0.93 + 0.1 * hash12(floor(vWorld.xz / 1.2)));
    float fwx = max(fwidth(vWorld.x), 1e-3) / 1.2, fwz = max(fwidth(vWorld.z), 1e-3) / 1.2;
    float j = max(lines(vWorld.x / 1.2, 0.03, fwx), lines(vWorld.z / 0.6, 0.03, fwz));
    alb *= 1.0 - 0.22 * j;
    col = alb * (uSunE * ndl + fill);
    // honed stone: a faint sheen that mirrors the sky and the low sun, broken by the joints
    float ndv = max(dot(N, V), 0.0);
    float F = (0.02 + 0.5 * pow(1.0 - ndv, 5.0)) * (1.0 - j);
    vec3 R = reflect(-V, normalize(N + vec3(vn(vWorld.xz * 3.0) - 0.5, 0.0, vn(vWorld.xz * 3.0 + 7.0) - 0.5) * 0.04));
    col = mix(col, envAt(R, 6.0), F);
  } else {                                                  // bark, soil, timber
    vec3 alb = vec3(0.16, 0.11, 0.075) * (0.85 + 0.3 * vn(vWorld.xz * 4.0 + y * 7.0));
    col = alb * (uSunE * ndl + fill);
  }
  outColor = vec4(col, 1.0);
}`,l=`
in vec3 position; in vec4 iPos; in vec4 iCol;
uniform mat4 viewMatrix, projectionMatrix;
uniform vec2 uRes; uniform float uTime;
out vec2 vQ; out vec4 vCol;
void main() {
  vec4 c = projectionMatrix * viewMatrix * vec4(iPos.xyz, 1.0);
  float px = iPos.w * (uRes.y / 1080.0) * 3.0;
  c.xy += position.xy * px * 2.0 / uRes * c.w;
  vQ = position.xy;
  // breathing / blinking: iCol.a's integer part is the kind, the fraction the phase
  float kind = floor(iCol.a), ph = fract(iCol.a);
  float k = 1.0;
  if (kind < 0.5) { float x = fract(uTime / 3.0 + ph); k = 0.18 + 0.82 * exp(-pow((x - 0.5) / 0.16, 2.0)); }        // nav: a slow breath
  else if (kind < 1.5) k = 1.0;                                                                               // steady
  else { float x = fract(uTime / 1.3 + ph); k = 0.08 + 1.6 * exp(-pow(x / 0.03, 2.0)) + 1.6 * exp(-pow((x - 1.0) / 0.03, 2.0)); }   // strobe
  vCol = vec4(iCol.rgb * k, 1.0);
  gl_Position = c;
}`,n=`
in vec2 vQ; in vec4 vCol;
out vec4 outColor;
void main() {
  float r2 = dot(vQ, vQ);
  float a = (exp(-r2 * 9.0) + 0.05 * exp(-r2 * 2.5)) * smoothstep(1.0, 0.55, r2);
  outColor = vec4(vCol.rgb * a, 1.0);
}`,r=`
in vec3 position; in vec4 iOff;
uniform mat4 viewMatrix, projectionMatrix;
uniform vec3 uFlockP, uFlockF; uniform float uTime;
out float vShade;
void main() {
  vec3 f = normalize(uFlockF), r = normalize(cross(f, vec3(0.0, 1.0, 0.0))), u = cross(r, f);
  float ph = iOff.w * 6.2831853;
  float burst = smoothstep(0.35, 0.65, 0.5 + 0.5 * sin(uTime * 0.55 + ph * 0.7));        // flap a while, then glide
  float flap = sin(uTime * 6.5 + ph) * 0.55 * burst + 0.08;
  vec3 lp = position;                                   // x across the wing (-1..1), z along the body
  lp.y += abs(lp.x) * flap;
  vec3 c = uFlockP + r * iOff.x + u * (iOff.y + 0.6 * sin(uTime * 0.4 + ph)) - f * iOff.z;
  vec3 w = c + r * lp.x * 0.8 + u * lp.y * 0.8 + f * lp.z * 0.8;
  vShade = 0.5 + 0.5 * flap;
  gl_Position = projectionMatrix * viewMatrix * vec4(w, 1.0);
}`,s=`
in float vShade;
out vec4 outColor;
void main() { outColor = vec4((vec3(0.035, 0.032, 0.03) + uSunE * 0.012 * vShade + uAmbUp * 0.05), 1.0); }`,c=`
in vec2 vUv;
uniform sampler3D uNoise;
uniform sampler2D uDepth;
uniform mat4 uInvProj, uCamWorld;
uniform vec3 uCam; uniform float uNear, uFar;
uniform float uSigma, uSteps, uLSteps, uMS, uFarMax;
uniform vec2 uLowRes;
layout(location = 0) out vec4 oCol;
layout(location = 1) out vec4 oDep;
const float TOP = 260.0, BASE = -420.0;
float linz(float d) { float z = d * 2.0 - 1.0; return 2.0 * uNear * uFar / (uFar + uNear - z * (uFar - uNear)); }
float cloudS(vec3 p, out float above) {
  above = p.y - deckH(p.xz - uWind.xz * uTime * 0.55);
  if (above > 70.0) return -above;
  vec3 q = p - uWind * uTime;
  float n1 = texture(uNoise, q / 520.0).r;
  float n2 = texture(uNoise, q / 150.0 + vec3(0.31, 0.0, 0.0)).g;
  float n5 = texture(uNoise, q / 72.0 + vec3(0.6, 0.0, 0.2)).r;
  float rise = clamp((p.y - above) / 70.0, 0.0, 1.6);   // where the deck towers up, its puffs grow with it
  return -above + (n1 - 0.45) * 40.0 + (n2 - 0.45) * 26.0 + (n5 - 0.42) * 16.0 * (1.0 + rise);
}
float gRamp = 7.0, gFine = 1.0;
float densityFrom(float s, vec3 p) {
  if (s < -6.0) return 0.0;
  vec3 q = p - uWind * uTime * 1.4;
  float n3 = texture(uNoise, q / 41.0 + vec3(0.0, 0.17, 0.53)).b;
  float n4 = texture(uNoise, q / 13.0).b;
  // fine detail only carves (never floats loose bits beyond the surface): crisp rounded edges
  s -= (max(n3 - 0.35, 0.0) * 10.0 + max(n4 - 0.4, 0.0) * 4.0) * gFine;
  return uSigma * smoothstep(0.0, gRamp, s) * mix(1.0, 0.3 + 1.1 * n3, smoothstep(8.0, 36.0, s));
}
float density(vec3 p) { float a; float s = cloudS(p, a); return densityFrom(s, p); }
float hg(float c, float g) { float g2 = g * g; return (1.0 - g2) / (4.0 * PI * pow(1.0 + g2 - 2.0 * g * c, 1.5)); }
// long shadows of the deck's own swells and turrets along the low sun (over the height field)
float deckShadow(vec3 p, float jit) {
  float occ = 0.0;
  float d = 22.0 * (1.0 + 0.25 * jit);
  for (int k = 0; k < 9; k++) {
    d *= 1.55;
    vec3 q = p + uSunDir * d;
    float a = q.y - deckH(q.xz - uWind.xz * uTime * 0.55);
    occ = max(occ, smoothstep(10.0, -18.0, a) * (1.0 - float(k) * 0.05));
  }
  return 1.0 - occ * 0.92;
}
void main() {
  vec4 v = uInvProj * vec4(vUv * 2.0 - 1.0, 1.0, 1.0);
  vec3 dv = normalize(v.xyz / v.w);
  vec3 dir = normalize(mat3(uCamWorld) * dv);
  float fwd = max(-dv.z, 1e-4);
  float dz = texture(uDepth, vUv).r;
  float dScene = dz >= 0.99999 ? 1e6 : linz(dz) / fwd;
  float tMin = 0.0, tMax = min(dScene, uFarMax);
  if (uCam.y > TOP) { if (dir.y >= -1e-4) { oCol = vec4(0.0, 0.0, 0.0, 1.0); oDep = vec4(1e5, dScene, 1e5, 0.0); return; } tMin = (uCam.y - TOP) / -dir.y; }
  if (dir.y < 0.0) tMax = min(tMax, (uCam.y - BASE) / -dir.y);
  else if (dir.y > 0.0) tMax = min(tMax, max(0.0, (TOP - uCam.y) / dir.y));
  float T = 1.0; vec3 S = vec3(0.0); float hitD = 1e5, firstD = 1e5;
  float cosT = dot(dir, uSunDir);
  float ph = mix(hg(cosT, 0.72), hg(cosT, -0.15), 0.4) + 0.6 * hg(cosT, 0.92) * 0.25;
  float phIso = 1.0 / (4.0 * PI);
  float jit = hash12(gl_FragCoord.xy * 1.37 + 0.5);
  float t = tMin + jit * 3.0;
  float sh = 1.0;
  bool hit = false; bool wasOut = true; float lastTau = 0.0; float tOut = tMin;
  int N = int(uSteps);
  for (int i = 0; i < 160; i++) {
    if (i >= N || t > tMax || T < 0.025) break;
    vec3 p = uCam + dir * t;
    float above;
    float s = cloudS(p, above);
    if (s < -8.0) {
      float slope = 0.05 + 0.7 * exp(-t / 1400.0);
      float dt = max(2.0 + t * 0.004, (-s - 6.0) / (max(-dir.y, 0.0) + slope));
      tOut = t;
      t += min(dt, 260.0 + t * 0.05);
      wasOut = true;
      continue;
    }
    float dt = 1.5 + t * 0.0035;
    gRamp = 4.0 + dt * 0.9;
    gFine = 0.35 + 0.65 * exp(-t / 900.0);
    if (wasOut) {
      // a skip may land deep in a steep wall: find the true entry between the last outside point and here
      wasOut = false;
      float a0 = tOut, b0 = t, ab;
      for (int k = 0; k < 4; k++) { float m = 0.5 * (a0 + b0); if (cloudS(uCam + dir * m, ab) < -6.0) a0 = m; else b0 = m; }
      t = max(tOut, b0 - dt * jit); p = uCam + dir * t; s = cloudS(p, above);
    }
    float sig = densityFrom(s, p);
    if (sig > 1e-5) {
      if (!hit) { hit = true; firstD = t; sh = deckShadow(p, jit) * towerShadow(p, 4.0, -1); }
      // a short march toward the sun
      // once the ray is mostly opaque, what lies behind adds little: reuse the last march, deepened
      float tau;
      if (T > 0.4) {
        tau = 0.0; float ds = 3.0 * (0.9 + 0.2 * jit), dd = 0.0;
        for (int j = 0; j < 6; j++) {
          if (float(j) >= uLSteps) break;
          dd += ds; tau += density(p + uSunDir * (dd - ds * 0.5)) * ds; ds *= 2.1;
        }
        lastTau = tau;
      } else { lastTau += sig * dt * 0.6; tau = lastTau; }
      float sunVis = exp(-tau) * ph + 0.42 * exp(-tau * 0.3) * mix(hg(cosT, 0.45), phIso, 0.5) + 0.2 * exp(-tau * 0.08) * phIso;
      float powder = mix(0.6 + 0.4 * (1.0 - exp(-sig * 30.0 / uSigma * 0.06)), 1.0, 0.5 + 0.5 * cosT);
      float inside = max(s, 0.0);
      vec3 amb = uAmbUp * (0.75 * exp(-inside / 34.0) + 0.12) * (0.62 + 0.38 * smoothstep(-55.0, 25.0, above));
      // deep inside, light has scattered many times: a soft white that dims slowly with depth
      vec3 deep = (uSunE * 0.055 + uAmbUp * 0.55) * exp(-inside / 240.0) * smoothstep(4.0, 40.0, inside);
      vec3 Ls = uSunE * sunVis * sh * powder * uMS + amb * 1.4 + deep;
      float Ti = exp(-sig * dt);
      S += T * Ls * (1.0 - Ti);
      T *= Ti;
      if (T < 0.4 && hitD > 9e4) hitD = t;
    }
    t += dt;
  }
  // past the march: the far deck, if the ray goes down and nothing is in front
  if (T > 0.015 && dir.y < 0.0 && t < tMax) {
    float tP = (uCam.y - 6.0) / -dir.y;
    if (tP < tMax && tP > t * 0.9) {
      vec3 p = uCam + dir * tP;
      float h = deckH(p.xz - uWind.xz * uTime * 0.55);
      float crest = smoothstep(-25.0, 30.0, h);
      vec3 c = uDeckCol * mix(0.7, 1.12, crest) * (0.92 + 0.16 * pow(max(cosT, 0.0), 6.0));
      S += T * c; T = 0.0; if (hitD > 9e4) hitD = tP; if (firstD > 9e4) firstD = tP;
    }
  }
  oCol = vec4(S, T);
  oDep = vec4(hitD, dScene, firstD, 1.0);
}`,f=`
in vec2 vUv;
uniform sampler2D uColor, uDepth, uCloud, uCloudD;
uniform mat4 uInvProj, uCamWorld;
uniform vec3 uCam; uniform float uNear, uFar;
uniform vec2 uLowRes, uRes;
uniform float uExposure, uHazeD, uVignette, uWhite;
uniform vec4 uSunUV;             // the sun on screen (uv), in front (1/0), its visible share (computed here)
uniform vec3 uGlare;
out vec4 outColor;
float linz(float d) { float z = d * 2.0 - 1.0; return 2.0 * uNear * uFar / (uFar + uNear - z * (uFar - uNear)); }
vec3 aces(vec3 x) { return clamp((x * (2.51 * x + 0.03)) / (x * (2.43 * x + 0.59) + 0.14), 0.0, 1.0); }
void main() {
  vec4 v = uInvProj * vec4(vUv * 2.0 - 1.0, 1.0, 1.0);
  vec3 dv = normalize(v.xyz / v.w);
  vec3 dir = normalize(mat3(uCamWorld) * dv);
  float fwd = max(-dv.z, 1e-4);
  float dz = texture(uDepth, vUv).r;
  bool sky = dz >= 0.99999;
  float dS = sky ? 1e6 : linz(dz) / fwd;
  vec3 scene = texture(uColor, vUv).rgb;
  // the cloud, upsampled: 3x3 low-res taps weighted by distance and by how well their scene depth matches ours
  vec2 lp = vUv * uLowRes - 0.5; vec2 i0 = floor(lp); vec2 f = lp - i0;
  vec4 acc = vec4(0.0); vec2 accD = vec2(0.0); float wsum = 0.0;
  for (int y = -1; y <= 2; y++) for (int x = -1; x <= 2; x++) {
    vec2 cell = i0 + vec2(float(x), float(y));
    vec2 uv = (cell + 0.5) / uLowRes;
    vec2 dd = vec2(float(x), float(y)) - f;
    float wb = max(0.0, 1.0 - abs(dd.x) * 0.5) * max(0.0, 1.0 - abs(dd.y) * 0.5);
    vec4 cd = texture(uCloudD, uv);
    float ds = cd.y;
    float rel = abs(min(ds, 1e5) - min(dS, 1e5)) / max(min(dS, 1e5), 1.0);
    float wd = 1.0 / (1e-3 + rel * rel * 400.0);
    float w = wb * wb * wd;
    acc += texture(uCloud, uv) * w; accD += cd.xz * w; wsum += w;
  }
  vec4 cl = acc / max(wsum, 1e-8);
  vec2 cdep = accD / max(wsum, 1e-8);
  float T = clamp(cl.a, 0.0, 1.0);
  // the air: everything fades toward the horizon's colour in its own direction
  vec3 hz = horizonAt(dir);
  if (!sky) { float a = exp(-dS / uHazeD); scene = mix(hz, scene, a); }
  float dC = min(cdep.y, 1e5);
  float aC = exp(-dC / uHazeD);
  vec3 cloudL = cl.rgb * aC + hz * (1.0 - T) * (1.0 - aC);
  vec3 c = scene * T + cloudL;
  // the sun's glare: a soft halo where the sun is in view and not hidden
  if (uSunUV.z > 0.5) {
    float vis = 0.0;
    for (int k = 0; k < 5; k++) {
      vec2 o = k == 0 ? vec2(0.0) : vec2(cos(float(k) * 1.5708), sin(float(k) * 1.5708)) * 0.004;
      vec2 uv = uSunUV.xy + o;
      if (uv.x < 0.0 || uv.y < 0.0 || uv.x > 1.0 || uv.y > 1.0) continue;
      float sd = texture(uDepth, uv).r;
      vis += (sd >= 0.99999 ? 1.0 : 0.0) * texture(uCloud, uv).a;
    }
    vis *= 0.2;
    float th = acos(clamp(dot(dir, uSunDir), -1.0, 1.0));
    c += uGlare * vis * (0.9 * exp(-th / 0.012) + 0.30 * exp(-th / 0.05) + 0.10 * exp(-th / 0.22));
  }
  // exposure, filmic curve, a gentle warm print, vignette, sRGB, dither
  vec2 q = vUv - 0.5;
  c *= uExposure * (1.0 - uVignette * dot(q, q) * 1.6);
  c = aces(c / uWhite) ;
  c = toSRGB(c);
  c += (ign(gl_FragCoord.xy) - 0.5) / 255.0;
  outColor = vec4(c, 1.0);
  // depth for the players: the nearer of the city and the cloud's surface
  float dW = min(dS, min(cdep.x, 1e5));
  if (dW > 9e4) gl_FragDepth = 1.0;
  else {
    float z = dW * fwd;
    float ndc = (uFar + uNear) / (uFar - uNear) - 2.0 * uFar * uNear / ((uFar - uNear) * z);
    gl_FragDepth = clamp(ndc * 0.5 + 0.5, 0.0, 1.0);
  }
}`;export{s as BIRD_FRAG,r as BIRD_VERT,c as CLOUD_FRAG,e as COMMON,f as COMP_FRAG,t as FULL_VERT,n as LIGHT_FRAG,l as LIGHT_VERT,o as SKY_FRAG,i as SOLID_FRAG,a as SOLID_VERT};
