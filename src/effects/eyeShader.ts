/**
 * The eye — GLSL for FutureEye. One full-screen triangle; every pixel casts
 * a ray into a scene that exists only in this shader:
 *
 *   light    one monitor, below-left of her face: cool blue, strong; a dim
 *            cool fill from above-left; nothing else — the room is black
 *   face     a ray-marched sculpt: the ball's socket, both lids as shells
 *            over the eyeball with rounded margins and an almond aperture,
 *            the hood above the crease, the brow ridge, cheek, bridge of
 *            the nose, temple; wrapped diffuse, faint subsurface, oily
 *            specular, ambient occlusion, soft shadows; pores in the normal
 *   eyeball  analytic sphere with a corneal bulge; turns with u_gaze (the
 *            cursor) inside the still face; cornea refracts onto the iris
 *   cornea   Fresnel reflection of the monitor (u_screen, mirrored) — small
 *            and bright over the black pupil, the way it is in a photograph
 *   iris     pale blue: fibres, spokes, crypts, furrows, collarette, limbal
 *            ring, ruff, a breathing pupil, the far-side caustic
 *   sclera   blue-white under the screen light, veins toward the corners,
 *            wet specular, the lid's shadow, tear meniscus
 *   brow     110 hair strokes along the ridge, inner ones up, tail ones out
 *   lashes   112 upper in 16 clumps, curling up; 30 lower; a dark lash line
 *   head     the whole face drifts with u_head, like someone at a desk
 */

export const EYE_VERT = `#version 300 es
in vec2 a_pos;
void main() { gl_Position = vec4(a_pos, 0.0, 1.0); }
`

export const EYE_FRAG = `#version 300 es
precision highp float;
out vec4 fragColor;

uniform vec2 u_res;
uniform float u_time;
uniform float u_blink;      // 0 open → 1 closed
uniform vec2 u_gaze;        // yaw (+ = camera left), pitch (+ = up)
uniform vec2 u_head;        // the head's drift, eye units
uniform float u_pupil;      // pupil radius / iris radius
uniform float u_seed;
uniform sampler2D u_screen; // the editor
uniform vec3 u_screenTint;  // its average colour — brightens the screen light
uniform float u_vignette;
uniform float u_debug;      // 1 = paint ray misses magenta

#define SRGB(c) ((c)*(c))
#define SQ(x) ((x)*(x))

// ---------------------------------------------------------------- noise
float hash21(vec2 p) {
  vec3 p3 = fract(vec3(p.xyx) * vec3(0.1031, 0.1030, 0.0973));
  p3 += dot(p3, p3.yzx + 33.33);
  return fract((p3.x + p3.y) * p3.z);
}
float vnoise(vec2 p) {
  vec2 i = floor(p), f = fract(p);
  vec2 u = f * f * (3.0 - 2.0 * f);
  return mix(mix(hash21(i), hash21(i + vec2(1, 0)), u.x), mix(hash21(i + vec2(0, 1)), hash21(i + vec2(1, 1)), u.x), u.y);
}
float fbm(vec2 p) {
  float v = 0.0, a = 0.5;
  mat2 m = mat2(1.6, 1.2, -1.2, 1.6);
  for (int i = 0; i < 5; i++) { v += a * vnoise(p); p = m * p; a *= 0.5; }
  return v;
}
float fbm3(vec2 p) {
  float v = 0.0, a = 0.5;
  mat2 m = mat2(1.6, 1.2, -1.2, 1.6);
  for (int i = 0; i < 3; i++) { v += a * vnoise(p); p = m * p; a *= 0.5; }
  return v;
}

// ---------------------------------------------------------------- scene
const vec3 CAM = vec3(0.0, 0.05, -5.0);
const float FOCAL = 2.0;
const float R_COR = 0.66;
const float BULGE = 0.075;
const float IRIS_R = 0.42;
const float IRIS_DEPTH = 0.26;
const float IOR = 1.336;
const vec3 L_SCREEN = normalize(vec3(-0.4, 0.3, -1.0));   // the monitor, above-left
const vec3 C_SCREEN = vec3(0.46, 0.70, 1.10);
const vec3 L_FILL = normalize(vec3(-0.6, 0.8, -0.35));
const vec3 C_FILL = vec3(0.18, 0.26, 0.42);
const float SCREEN_Z = -4.2;
const vec2 SCREEN_C = vec2(-0.8, 0.7);   // camera-left, where its light comes from
const vec2 SCREEN_H = vec2(2.6, 1.1);
const float LID_R = 1.13;

float sphere(vec3 ro, vec3 rd, vec3 c, float r) {
  vec3 oc = ro - c;
  float b = dot(oc, rd);
  float h = b * b - (dot(oc, oc) - r * r);
  if (h < 0.0) return -1.0;
  return -b - sqrt(h);
}
float sdEllipsoid(vec3 p, vec3 r) {
  float k0 = length(p / r);
  float k1 = length(p / (r * r));
  return k0 * (k0 - 1.0) / k1;
}
float smin(float a, float b, float k) {
  float h = clamp(0.5 + 0.5 * (b - a) / k, 0.0, 1.0);
  return mix(b, a, h) - k * h * (1.0 - h);
}
float smax(float a, float b, float k) { return -smin(-a, -b, k); }
mat3 gazeMat(vec2 g) {
  float cy = cos(g.x), sy = sin(g.x), cp = cos(g.y), sp = sin(g.y);
  mat3 Ry = mat3(cy, 0.0, -sy, 0.0, 1.0, 0.0, sy, 0.0, cy);
  mat3 Rx = mat3(1.0, 0.0, 0.0, 0.0, cp, sp, 0.0, -sp, cp);
  return Ry * Rx;
}

// the lid margins, in eye units across x (front of the ball)
float edgeU(float x) {
  float u = clamp((x + 0.07) / 1.02, -1.0, 1.0);
  float open = 0.285 * pow(max(0.0, 1.0 - u * u), 0.6) + 0.07 * u_gaze.y;
  float closedLine = -0.05 - 0.08 * sqrt(max(0.0, 1.0 - u * u));
  return mix(0.02 + open, closedLine, u_blink) + 0.045 * x;
}
float edgeL(float x) {
  float u = clamp((x + 0.03) / 1.02, -1.0, 1.0);
  float open = 0.30 * pow(max(0.0, 1.0 - u * u), 0.7);
  return -open * (1.0 - 0.35 * u_blink) + 0.03 * x + 0.02 * u_gaze.y;
}

float mapFace(vec3 p) {
  float shell = abs(length(p) - LID_R) - 0.06;
  float yU = edgeU(p.x);
  float yL = edgeL(p.x);
  float lidUp = smax(shell, (yU - p.y) - 0.012, 0.03);
  float lidLo = smax(shell, (p.y - yL) - 0.012, 0.03);
  float lids = min(lidUp, lidLo);
  lids = mix(lids, shell, smoothstep(0.96, 1.05, abs(p.x + 0.03)));   // closed past the corners
  lids = max(lids, p.z - 0.75);
  float hood = sdEllipsoid(p - vec3(0.05, 0.66, -0.96), vec3(1.3, 0.24, 0.34));
  float brow = sdEllipsoid(p - vec3(0.15, 1.1, -1.02), vec3(1.75, 0.38, 0.6));
  float cheek = sdEllipsoid(p - vec3(0.5, -1.3, -0.82), vec3(1.7, 0.95, 0.8));
  float nose = sdEllipsoid(p - vec3(-1.8, -0.2, -0.9), vec3(0.6, 1.9, 0.75));
  float temple = sdEllipsoid(p - vec3(1.95, 0.1, -0.45), vec3(0.85, 2.0, 0.95));
  float head = sdEllipsoid(p - vec3(-0.5, -0.5, 7.5), vec3(8.0, 9.0, 8.0));
  float socket = sdEllipsoid(p - vec3(0.0, 0.0, -0.1), vec3(1.1, 0.95, 0.75));   // inside the lids' reach: never through the skin
  float face = smax(head, -socket, 0.5);
  face = smin(face, lids, 0.12);
  face = smin(face, hood, 0.22);
  face = smin(face, brow, 0.35);
  face = smin(face, cheek, 0.5);
  face = smin(face, nose, 0.75);
  face = smin(face, temple, 0.5);
  // the conjunctival fold just behind the ball's edge, and a backstop deep inside the head
  face = min(face, max(length(p) - 1.035, -p.z - 0.2));
  face = min(face, 1.5 - p.z);
  return face;
}
vec3 faceNormal(vec3 p) {
  const vec2 e = vec2(0.003, 0.0);
  return normalize(vec3(
    mapFace(p + e.xyy) - mapFace(p - e.xyy),
    mapFace(p + e.yxy) - mapFace(p - e.yxy),
    mapFace(p + e.yyx) - mapFace(p - e.yyx)));
}
float faceAO(vec3 p, vec3 n) {
  float occ = 0.0, sca = 1.0;
  for (int i = 1; i <= 4; i++) {
    float h = 0.02 + 0.08 * float(i);
    occ += (h - mapFace(p + n * h)) * sca;
    sca *= 0.7;
  }
  return clamp(1.0 - 2.4 * occ, 0.0, 1.0);
}
float shadow(vec3 ro, vec3 rd) {
  float res = 1.0, t = 0.03;
  for (int i = 0; i < 12; i++) {
    vec3 q = ro + rd * t;
    float d = min(mapFace(q), length(q) - 1.0);
    if (d < 0.001) return 0.0;
    res = min(res, 9.0 * d / t);
    t += clamp(d, 0.02, 0.2);
    if (t > 2.4) break;
  }
  return clamp(res, 0.0, 1.0);
}

vec3 env(vec3 pos, vec3 r) {
  vec3 col = vec3(0.004, 0.006, 0.012) * (0.6 + 0.4 * r.y);
  float kd = max(dot(r, L_FILL), 0.0);
  col += C_FILL * (pow(kd, 900.0) * 0.8 + pow(kd, 60.0) * 0.06);
  if (r.z < -0.001) {
    float t = (SCREEN_Z - pos.z) / r.z;
    if (t > 0.0) {
      vec2 q = pos.xy + t * r.xy;
      vec2 uv = (q - SCREEN_C) / (2.0 * SCREEN_H) + 0.5;
      uv.x = 1.0 - uv.x;
      vec2 e = abs(uv - 0.5);
      float inside = step(max(e.x, e.y), 0.5);
      float bezel = step(max(e.x, e.y), 0.53) - inside;
      // explicit LODs: this lookup sits inside a branch, where derivatives are undefined
      float lod = log2(max(1.0, 5800.0 / u_res.y));
      vec3 tex = textureLod(u_screen, uv, lod).rgb;
      vec3 halo = textureLod(u_screen, clamp(uv, 0.02, 0.98), lod + 3.0).rgb;
      float near = smoothstep(0.62, 0.5, max(e.x, e.y));
      col += inside * SRGB(tex) * vec3(0.85, 0.95, 1.15) * 2.2 + near * SRGB(halo) * 0.5 + bezel * vec3(0.02, 0.025, 0.035);
    }
  }
  return col;
}

vec3 irisColor(vec2 q, float pupil) {
  float r = length(q) / IRIS_R;
  float a = dot(q, q) < 1e-12 ? 0.0 : atan(q.y, q.x);
  // polar noise has a seam at ±π: blend a second evaluation across it
  float seamW = smoothstep(2.6, 3.14159, abs(a));
  float a2 = a - 6.2831853 * sign(a + 1e-6);
  float warp = mix(fbm(vec2(a * 2.0, r * 3.0) + u_seed), fbm(vec2(a2 * 2.0, r * 3.0) + u_seed), seamW) * 2.0;
  float fib = mix(fbm(vec2(a * 11.0 + warp, r * 4.5 + u_seed)), fbm(vec2(a2 * 11.0 + warp, r * 4.5 + u_seed)), seamW);
  float spokes = mix(fbm(vec2(a * 26.0 + warp * 0.5, r * 2.0 + u_seed + 4.0)), fbm(vec2(a2 * 26.0 + warp * 0.5, r * 2.0 + u_seed + 4.0)), seamW);
  float fine = mix(vnoise(vec2(a * 90.0, r * 16.0 + u_seed)), vnoise(vec2(a2 * 90.0, r * 16.0 + u_seed)), seamW);
  float crypt = smoothstep(0.58, 0.8, mix(fbm(vec2(a * 4.0 + 7.0, r * 5.5 + u_seed)), fbm(vec2(a2 * 4.0 + 7.0, r * 5.5 + u_seed)), seamW));
  float furrow = 0.5 + 0.5 * sin(r * 48.0 + mix(fbm(vec2(a * 6.0, r * 2.0)), fbm(vec2(a2 * 6.0, r * 2.0)), seamW) * 5.0);
  vec3 inner = SRGB(vec3(0.66, 0.74, 0.88));
  vec3 outer = SRGB(vec3(0.34, 0.54, 0.86));
  vec3 col = mix(inner, outer, smoothstep(0.2, 0.62, r + (fib - 0.5) * 0.25));
  col *= 0.3 + 1.25 * fib;
  col *= 0.55 + 0.85 * spokes;
  col *= 0.86 + 0.28 * fine;
  col = mix(col, col * 0.4, crypt * smoothstep(0.66, 0.34, r));
  col *= 1.0 - 0.16 * furrow * smoothstep(0.5, 0.9, r);
  col *= 1.0 + 0.45 * exp(-SQ((r - 0.40) / 0.05));
  col = mix(col, SRGB(vec3(0.08, 0.10, 0.15)), smoothstep(0.70, 1.0, r));
  col = mix(col, SRGB(vec3(0.24, 0.2, 0.2)), smoothstep(pupil + 0.11, pupil, r) * 0.5);
  col = mix(col, vec3(0.0), smoothstep(pupil + 0.012, pupil - 0.004, r));
  return col;
}

vec3 scleraColor(vec3 nl, float theta) {
  float phi = dot(nl.xy, nl.xy) < 1e-12 ? 0.0 : atan(nl.y, nl.x);
  float seamW = smoothstep(2.6, 3.14159, abs(phi));
  float phi2 = phi - 6.2831853 * sign(phi + 1e-6);
  vec3 base = mix(SRGB(vec3(0.84, 0.88, 0.96)), SRGB(vec3(0.66, 0.60, 0.66)), smoothstep(0.7, 1.5, theta));
  float v1 = mix(fbm(vec2(phi * 2.2, theta * 5.0) + u_seed * 3.0), fbm(vec2(phi2 * 2.2, theta * 5.0) + u_seed * 3.0), seamW);
  float l1 = smoothstep(0.012, 0.0, abs(v1 - 0.5)) * smoothstep(0.35, 0.65, mix(fbm(vec2(phi * 5.0, theta * 3.0) + 9.0), fbm(vec2(phi2 * 5.0, theta * 3.0) + 9.0), seamW));
  float v2 = mix(fbm(vec2(phi * 5.0 + 3.1, theta * 11.0) + u_seed), fbm(vec2(phi2 * 5.0 + 3.1, theta * 11.0) + u_seed), seamW);
  float l2 = smoothstep(0.007, 0.0, abs(v2 - 0.5)) * smoothstep(0.4, 0.7, mix(fbm(vec2(phi * 3.0 + 1.0, theta * 4.0)), fbm(vec2(phi2 * 3.0 + 1.0, theta * 4.0)), seamW));
  float veins = l1 * 0.55 * smoothstep(0.55, 1.2, theta) + l2 * 0.35 * smoothstep(0.5, 1.1, theta);
  base = mix(base, SRGB(vec3(0.70, 0.22, 0.24)), veins);
  base *= 0.97 + 0.06 * mix(vnoise(vec2(phi * 40.0, theta * 40.0)), vnoise(vec2(phi2 * 40.0, theta * 40.0)), seamW);
  return base;
}

// eye-space → screen, with the head's drift
vec2 project(vec3 q) { return (q.xy - (CAM.xy + u_head)) * FOCAL / (q.z - CAM.z); }
// screen → eye-space x/y on the plane z (the inverse, for overlays)
vec2 unproject(vec2 sp, float z) { return sp * (z - CAM.z) / FOCAL + CAM.xy + u_head; }

float segDist(vec2 p, vec2 a, vec2 b, out float t) {
  vec2 pa = p - a, ba = b - a;
  t = clamp(dot(pa, ba) / dot(ba, ba), 0.0, 1.0);
  return length(pa - ba * t);
}
// a hair: quadratic curve from base along dir, bending by curl, tapered
float hair(vec2 p, vec2 base, vec2 dir, float len, float curl, float rootW, float aa) {
  float ext = len * (1.0 + abs(curl)) + rootW + 2.0 * aa;
  if (abs(p.x - base.x) > ext || abs(p.y - base.y) > ext) return 0.0;
  vec2 n = vec2(-dir.y, dir.x) * curl;
  vec2 p0 = base, p1 = base + dir * len * 0.55 + n * len * 0.3, p2 = base + dir * len + n * len;
  float best = 1e9, bt = 0.0;
  vec2 prev = p0;
  for (int i = 1; i <= 5; i++) {
    float s = float(i) / 5.0;
    vec2 pt = mix(mix(p0, p1, s), mix(p1, p2, s), s);
    float t;
    float d = segDist(p, prev, pt, t);
    if (d < best) { best = d; bt = (float(i) - 1.0 + t) / 5.0; }
    prev = pt;
  }
  float w = mix(rootW, rootW * 0.12, bt);
  return smoothstep(aa * 1.2, -aa * 0.6, best - w);
}

void main() {
  // the frame's unit: the height, unless the frame is narrow (a phone) — then the eye fits the width
  float unit = min(u_res.y, u_res.x / 1.25);
  vec2 p = (gl_FragCoord.xy - 0.5 * u_res) / unit;
  float aa = 1.4 / unit;
  mat3 G = gazeMat(u_gaze);
  mat3 Gi = transpose(G);
  vec3 axis = G * vec3(0.0, 0.0, -1.0);
  vec3 ro = CAM + vec3(u_head, 0.0);
  vec3 cScreen = C_SCREEN * (0.8 + 0.6 * dot(u_screenTint, vec3(0.3, 0.59, 0.11)));
  vec3 rd = normalize(vec3(p, FOCAL));
  vec3 V = -rd;

  // ---------------------------------------------------------------- the ball
  vec3 cc = axis * (1.0 + BULGE - R_COR);
  float limitCos = (1.0 + dot(cc, cc) - R_COR * R_COR) / (2.0 * length(cc));
  float tE = sphere(ro, rd, vec3(0.0), 1.0);
  float tC = sphere(ro, rd, cc, R_COR);
  bool cornea = false;
  float tBall = -1.0;
  vec3 nBall = vec3(0.0);
  if (tC > 0.0) {
    vec3 posC = ro + rd * tC;
    if (dot(normalize(posC), axis) > limitCos) { cornea = true; tBall = tC; nBall = normalize(posC - cc); }
  }
  if (!cornea && tE > 0.0) { tBall = tE; nBall = normalize(ro + rd * tE); }

  // ---------------------------------------------------------------- the face
  float tF = -1.0;
  {
    // stop at the ball (nothing behind it matters); keep the closest approach
    // so a starved march at a grazing lid margin still lands on the lid
    float t = 2.4, tMax = tBall > 0.0 ? tBall : 9.0, dMin = 1e9, tMin = t;
    for (int i = 0; i < 110; i++) {
      float d = mapFace(ro + rd * t);
      if (d < dMin) { dMin = d; tMin = t; }
      if (d < 0.0012) { tF = t; break; }
      t += d * 0.85;
      if (t > tMax) break;
      if (i == 109) tF = t;
    }
    if (tF < 0.0 && dMin < 0.01) tF = tMin;
  }

  vec3 col = vec3(0.0);
  bool ballWins = tBall > 0.0 && (tF < 0.0 || tBall < tF);
  if (u_debug > 0.5 && !ballWins && tF < 0.0) col = vec3(1.0, 0.0, 1.0);

  if (ballWins) {
    vec3 pos = ro + rd * tBall;
    vec3 n = nBall;
    vec3 nl = Gi * normalize(pos);
    float theta = acos(clamp(-nl.z, -1.0, 1.0));
    float sh = shadow(pos + n * 0.01, L_SCREEN);
    float yL = edgeL(pos.x);
    if (cornea) {
      vec3 rr = refract(rd, n, 1.0 / IOR);
      vec3 planeP = axis * (1.0 + BULGE - IRIS_DEPTH);
      float t = dot(planeP - pos, axis) / dot(rr, axis);
      vec3 hit = pos + rr * t;
      vec3 hl = Gi * (hit - planeP);
      vec2 q = hl.xy;
      float r2 = length(q) / IRIS_R;
      vec3 iris = irisColor(q, u_pupil);
      vec3 lS = Gi * L_SCREEN;
      vec3 lF = Gi * L_FILL;
      float dS = max(dot(vec3(0.0, 0.0, -1.0), lS), 0.0) * (0.35 + 0.65 * sh);
      float dF = max(dot(vec3(0.0, 0.0, -1.0), lF), 0.0);
      float caustic = 0.45 * smoothstep(-0.1, 1.0, dot(normalize(q + 1e-4), -normalize(lS.xy + vec2(1e-3, 0.0)))) * (1.0 - smoothstep(0.7, 1.0, r2)) * (0.4 + 0.6 * sh) * smoothstep(0.0, 0.05, length(lS.xy));
      vec3 lit = iris * (cScreen * (dS * 1.35 + caustic) + C_FILL * dF * 0.5 + 0.04);
      lit *= 0.7 + 0.3 * smoothstep(1.0, 0.7, r2);
      float F = 0.025 + 0.975 * pow(1.0 - max(dot(V, n), 0.0), 5.0);
      vec3 refl = reflect(rd, n);
      float overPupil = smoothstep(u_pupil + 0.1, u_pupil - 0.02, r2);
      col = lit * (1.0 - F) + env(pos, refl) * (0.5 + 0.5 * F) * (0.5 + 0.8 * overPupil);
      float limb = smoothstep(limitCos, limitCos + 0.03, dot(normalize(pos), axis));
      col = mix(SRGB(vec3(0.4, 0.46, 0.58)) * 0.5, col, limb);
    } else {
      vec3 sc = scleraColor(nl, theta);
      float dS = max(dot(n, L_SCREEN), 0.0) * (0.3 + 0.7 * sh);
      float dF = max(dot(n, L_FILL), 0.0);
      vec3 lit = sc * (cScreen * dS * 0.85 + C_FILL * dF * 0.4 + 0.02);
      // the upper lid's shadow lies across the top of the white
      lit *= 1.0 - 0.45 * smoothstep(0.16, 0.0, edgeU(pos.x) - pos.y);
      vec3 refl = reflect(rd, n);
      float F = 0.02 + 0.98 * pow(1.0 - max(dot(V, n), 0.0), 5.0);
      lit += env(pos, refl) * (0.2 + 0.8 * F) * 0.9;
      lit *= 0.45 + 0.55 * smoothstep(1.7, 0.4, theta);
      col = lit;
    }
    float men = exp(-SQ((pos.y - (yL + 0.02)) / 0.016)) * (1.0 - u_blink) * smoothstep(1.0, 0.4, abs(pos.x));
    col += cScreen * men * 0.35 * (0.5 + 0.5 * sh);
    col *= 1.0 - 0.12 * exp(-SQ((pos.y - (yL + 0.05)) / 0.02));
    // the inner corner in shadow, the caruncle's dark pink
    float car = smoothstep(0.22, 0.05, length((pos.xy - vec2(-1.0, -0.01)) * vec2(1.0, 1.5)));
    col = mix(col, SRGB(vec3(0.5, 0.3, 0.3)) * (C_SCREEN * 0.7 + 0.05), car * 0.7);
  } else if (tF > 0.0) {
    vec3 pos = ro + rd * tF;
    vec3 n = faceNormal(pos);
    vec2 sp = pos.xy + pos.z * 0.35;
    float b1 = vnoise(sp * 260.0), b2 = vnoise(sp * 70.0 + 3.0), b3 = vnoise(sp * 260.0 + 11.0), b4 = vnoise(sp * 520.0 + 5.0);
    n = normalize(n + vec3((b1 - 0.5) * 0.10 + (b2 - 0.5) * 0.06 + (b4 - 0.5) * 0.05, (b3 - 0.5) * 0.10 + (vnoise(sp * 520.0 + 9.0) - 0.5) * 0.05, 0.0));
    float ao = faceAO(pos, n);
    float sh = shadow(pos + n * 0.015, L_SCREEN);
    vec3 skin = SRGB(vec3(0.38, 0.31, 0.30));
    float onLid = smoothstep(1.4, 1.12, length(pos)) * step(pos.z, 0.0);
    skin = mix(skin, SRGB(vec3(0.66, 0.42, 0.40)), 0.35 * onLid);
    skin *= 0.9 + 0.1 * vnoise(sp * 110.0) + 0.06 * fbm3(sp * 12.0);
    skin = mix(skin, SRGB(vec3(0.56, 0.38, 0.36)), 0.2 * smoothstep(0.5, 0.8, fbm3(sp * 6.0 + 2.0)));
    // the fine lines under the eye
    float lines = smoothstep(0.7, 0.95, vnoise(vec2(sp.x * 9.0 + sp.y * 40.0, sp.y * 6.0))) * smoothstep(-0.2, -0.7, pos.y) * smoothstep(-1.2, -0.7, pos.y);
    skin *= 1.0 - 0.18 * lines;
    // lid margin: darker where the lashes root
    float margin = smoothstep(0.05, 0.012, abs(pos.y - edgeU(pos.x))) * onLid;
    skin = mix(skin, SRGB(vec3(0.3, 0.17, 0.16)), margin * 0.65);
    // the lower lid's wet rim catches the screen
    float rimL = smoothstep(0.035, 0.006, abs(pos.y - edgeL(pos.x) + 0.01)) * onLid * smoothstep(1.05, 0.5, abs(pos.x));
    float wS = clamp((dot(n, L_SCREEN) + 0.12) / 1.12, 0.0, 1.0) * (0.2 + 0.8 * sh);
    float wF = clamp((dot(n, L_FILL) + 0.2) / 1.2, 0.0, 1.0);
    vec3 diff = skin * (cScreen * wS * 1.1 + C_FILL * wF * 0.5);
    vec3 sss = SRGB(vec3(0.9, 0.35, 0.3)) * skin * SQ(clamp(dot(n, L_SCREEN) + 0.5, 0.0, 1.0)) * 0.06;
    vec3 H = normalize(L_SCREEN + V);
    float spec = (pow(max(dot(n, H), 0.0), 70.0) * 0.35 + pow(max(dot(n, H), 0.0), 9.0) * 0.05) * (0.3 + 0.7 * sh) * mix(1.0, 2.5, margin);
    vec3 rim = C_FILL * pow(1.0 - max(dot(n, V), 0.0), 4.0) * 0.1;
    col = (diff + sss * 0.6) * (0.12 + 0.88 * ao) + cScreen * spec * 1.0 + rim + skin * 0.006;
    col += cScreen * rimL * (0.35 + 0.6 * sh);
  }

  // ---------------------------------------------------------------- brow
  // region gates: hair setup is the cost, so whole loops skip where no hair can reach
  vec2 c0 = project(vec3(0.0, 0.0, -1.05));
  float hairs = 0.0;
  if (p.y > c0.y + 0.14 && p.y < c0.y + 0.62) for (int i = 0; i < 300; i++) {
    float fi = float(i);
    float h = hash21(vec2(fi * 0.71, u_seed + 5.0));
    float h2 = hash21(vec2(fi * 1.93, u_seed + 6.0));
    float h3 = hash21(vec2(fi * 3.31, u_seed + 8.0));
    float tt = (fi + 0.5 + (h - 0.5) * 0.9) / 300.0;          // 0 inner → 1 tail
    float x = mix(-1.0, 1.55, tt);
    float thick = sin(clamp(tt * 1.15, 0.0, 1.0) * 3.14159);
    float y = 0.92 - 0.22 * SQ((x - 0.2) / 1.1) + (h2 - 0.5) * (0.05 + 0.20 * thick);
    vec2 base = project(vec3(x, y, -1.2 + 0.12 * abs(x - 0.2)));
    float ang = mix(1.05, -0.25, smoothstep(0.0, 1.0, tt)) + (h3 - 0.5) * 0.25;
    vec2 dir = vec2(cos(ang), sin(ang));
    float len = (0.028 + 0.034 * thick) * (0.6 + 0.8 * h2);
    hairs = max(hairs, hair(p, base, dir, len, 0.15 + (h - 0.5) * 0.3, 0.0015 + 0.0007 * h, aa) * (0.4 + 0.4 * h3));
  }
  // the brow's own shadow and fuzz beneath the hairs
  {
    float bx = unproject(p, -1.2).x;
    vec2 b0 = project(vec3(bx, 0.92 - 0.22 * SQ((bx - 0.2) / 1.1), -1.2));
    float band = smoothstep(0.06, 0.0, abs(p.y - b0.y + 0.01)) * smoothstep(0.75, 0.55, abs(p.x - 0.1)) * (0.6 + 0.4 * fbm3(p * 40.0));
    col *= 1.0 - 0.62 * band;
  }
  vec3 browCol = SRGB(vec3(0.14, 0.10, 0.09)) * (0.5 + 0.5 * vnoise(p * 260.0)) + C_SCREEN * 0.03;
  col = mix(col, browCol, hairs * 0.7);

  // ---------------------------------------------------------------- lashes
  float lashes = 0.0;
  if (p.y > c0.y - 0.16 && p.y < c0.y + 0.42) for (int i = 0; i < 112; i++) {
    float fi = float(i);
    float clump = floor(fi / 7.0);   // 16 clumps
    float hc = hash21(vec2(clump * 1.7, u_seed));
    float h = hash21(vec2(fi * 0.37, u_seed + 1.0));
    float h2 = hash21(vec2(fi * 2.13, u_seed + 2.0));
    float cx = -0.95 + 1.9 * (clump + 0.5 + (hc - 0.5) * 0.5) / 16.0;
    float x = cx + (h - 0.5) * 0.07;
    float row = step(0.55, h2);
    float y = edgeU(x) - 0.006 - row * 0.014;
    float z = -sqrt(max(0.0, LID_R * LID_R + 0.03 - x * x - y * y));
    vec2 base = project(vec3(x, y, z));
    float slope = (edgeU(x + 0.02) - edgeU(x - 0.02)) / 0.04;
    vec2 nrm = normalize(vec2(-slope, 1.0));
    float outerness = smoothstep(-0.6, 0.95, x);
    vec2 dir = normalize(nrm + vec2(0.1 + 0.75 * outerness + (h2 - 0.5) * 0.3, 0.0));
    float ang = atan(dir.y, dir.x) - u_blink * 1.3;
    dir = vec2(cos(ang), sin(ang));
    float lenC = 0.085 + 0.11 * outerness * (0.6 + 0.8 * hc);
    float len = lenC * (0.6 + 0.6 * h) * (1.0 - 0.25 * row);
    float curl = 0.7 + 0.7 * hc + (h2 - 0.5) * 0.25;
    lashes = max(lashes, hair(p, base, dir, len, curl, 0.0046 - 0.0014 * row, aa));
  }
  if (p.y > c0.y - 0.36 && p.y < c0.y + 0.02) for (int i = 0; i < 30; i++) {
    float fi = float(i);
    float h = hash21(vec2(fi + 100.0, u_seed));
    float h2 = hash21(vec2(fi * 5.1 + 7.0, u_seed));
    float x = -0.85 + 1.72 * (fi + 0.5 + (h - 0.5) * 0.9) / 30.0;
    float y = edgeL(x) + 0.004;
    float z = -sqrt(max(0.0, LID_R * LID_R + 0.03 - x * x - y * y));
    vec2 base = project(vec3(x, y, z));
    float slope = (edgeL(x + 0.02) - edgeL(x - 0.02)) / 0.04;
    vec2 nrm = -normalize(vec2(-slope, 1.0));
    vec2 dir = normalize(nrm + vec2(0.1 + 0.5 * smoothstep(-0.5, 0.9, x), 0.0));
    float len = (0.026 + 0.04 * smoothstep(-0.6, 0.9, x)) * (0.6 + 0.7 * h2);
    lashes = max(lashes, hair(p, base, dir, len, -0.35 - 0.3 * h, 0.0026, aa));
  }
  // the lash line: the dark fuzz where they root
  {
    float x0 = unproject(p, -1.05).x;
    vec2 m = project(vec3(x0, edgeU(x0), -1.05));
    float cx0 = project(vec3(0.0, 0.0, -1.05)).x;
    float line = smoothstep(0.014, 0.0, abs(p.y - m.y)) * smoothstep(0.55, 0.45, abs(p.x - cx0)) * (0.5 + 0.5 * vnoise(p * 400.0));
    col *= 1.0 - 0.6 * line;
  }
  vec3 lashCol = SRGB(vec3(0.10, 0.07, 0.06)) * (0.4 + 0.6 * vnoise(p * 300.0)) + C_SCREEN * 0.015;
  col = mix(col, lashCol, lashes * 0.97);

  // ---------------------------------------------------------------- the dark
  float vig = smoothstep(0.82, 0.2, length((p - vec2(-0.05, 0.02)) * vec2(1.0, 1.55)));
  col *= mix(1.0, vig, u_vignette);
  // the grade: a cool, quiet image with the eye as the one bright thing
  col = mix(col, vec3(dot(col, vec3(0.3, 0.59, 0.11))), 0.18) * vec3(0.78, 0.9, 1.15) * 0.92;

  col = col / (1.0 + col * 0.12);
  col = pow(max(col, 0.0), vec3(1.0 / 2.2));
  fragColor = vec4(col, 1.0);
}
`
