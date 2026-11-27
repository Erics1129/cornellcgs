const e=14,t=`
uniform vec3 uSigma;            // extinction per channel, 1/m (red first)
uniform vec3 uWUp, uWHor, uWDown; // water radiance seen looking up / level / down from the camera (linear)
uniform vec3 uSunW;             // sun direction in the water (toward the sun, refracted)
uniform vec3 uSunE;             // sun light just under the surface (linear)
uniform vec3 uSkyE;             // the sky's diffuse light just under the surface
uniform float uLobe;            // forward scatter toward the sun in the water colour
uniform float uTime;
uniform vec3 uCam;
uniform sampler2D uCau;         // r,g: surface slope; b: the floor's caustic (sharp); a: soft
uniform float uTile;            // metres per caustic tile
uniform float uFloorD;          // the depth the caustic is focused at (the floor)
uniform float uCauGain;         // how strongly the net shows (1)
uniform float uCauLod;          // extra blur of the net (deeper looks)
uniform sampler2D uCanopy; uniform vec4 uCanopyMap; uniform float uCanopyOn;
uniform vec4 uSurge;            // the slow surge: displacement xz (m), velocity xz (m/s); zero where there is none
uniform vec4 uCaster; uniform vec4 uCasterDir;  // a player's shadow on the floor: centre, size (m); heading xz, on
uniform float uHorSoft;         // 0: the old water gradient; 1: no crease at the level (open water)

float hash12(vec2 p) { vec3 p3 = fract(vec3(p.xyx) * 0.1031); p3 += dot(p3, p3.yzx + 33.33); return fract((p3.x + p3.y) * p3.z); }
float vnoise2(vec2 p) { vec2 i = floor(p), f = fract(p); f = f * f * (3.0 - 2.0 * f);
  return mix(mix(hash12(i), hash12(i + vec2(1, 0)), f.x), mix(hash12(i + vec2(0, 1)), hash12(i + vec2(1, 1)), f.x), f.y); }
// where the sun's ray through p crossed the surface
vec2 surfPoint(vec3 p) { return p.xz + uSunW.xz / uSunW.y * (-p.y); }
float canopyAt(vec2 s) {
  if (uCanopyOn < 0.5) return 0.0;
  vec2 uv = (s - uCanopyMap.xy) / uCanopyMap.zw;
  if (uv.x < 0.0 || uv.y < 0.0 || uv.x > 1.0 || uv.y > 1.0) return 0.0;
  return texture2D(uCanopy, uv).r;
}
// the light that gets down to p: the sun through the water (and through the canopy where there is one)
vec3 sunAt(vec3 p) {
  float d = max(-p.y, 0.0);
  float c = canopyAt(surfPoint(p));
  return uSunE * exp(-uSigma * d / uSunW.y) * (1.0 - 0.9 * c);
}
vec3 skyAt(vec3 p) { return uSkyE * exp(-uSigma * max(-p.y, 0.0) * 1.2); }
// how much of the sun a player above p leaves (1 = none taken): the sun's ray from p up to the player's
// height, against a soft ellipse along its heading, the penumbra widening with the height
float casterAt(vec3 p) {
  if (uCasterDir.z < 0.5) return 1.0;
  float h = uCaster.y - p.y;
  if (h <= 0.0) return 1.0;
  vec2 q = p.xz + uSunW.xz / uSunW.y * h - uCaster.xz;
  vec2 f = uCasterDir.xy, s = vec2(-f.y, f.x);
  // the dart seen from the sun: a triangle, nose ahead, the rider's square on its back (units of the half length)
  float A = dot(q, f) / uCaster.w, B = abs(dot(q, s)) / uCaster.w;
  float dart = max(-0.75 - A, (B - 0.78 * (1.0 - A) / 1.75) * 0.9);
  float cube = max(abs(A + 0.15), B) - 0.3;
  float d = min(dart, cube);
  float soft = 0.06 + 0.07 * h;
  return 1.0 - uCasterDir.w * 0.9 * (1.0 - smoothstep(-soft, soft, d)) / (1.0 + 0.1 * h);
}
// the caustic net at p (1 = the average light); sharp on the floor, softer above it
float causticAt(vec3 p, float bias) {
  vec2 s = (surfPoint(p) + uSurge.xy) / uTile;
  float depthK = clamp(-p.y / uFloorD, 0.0, 1.2);
#ifdef IN_VERTEX
  vec4 c = textureLod(uCau, s, 2.0 + bias + uCauLod);
#else
  vec4 c = texture2D(uCau, s, bias + uCauLod);
#endif
  float big = 0.75 + 0.5 * vnoise2(surfPoint(p) * 0.09 + 3.1);   // a slow large-scale swell of light
  float net = mix(c.a, c.b, smoothstep(0.55, 0.95, depthK));
  return max(0.0, 1.0 + (net * big - 1.0) * uCauGain * smoothstep(0.0, 0.5, depthK));
}
// the water's own colour along a view direction (what everything fades into)
vec3 waterRad(vec3 dir) {
  float y = dir.y;
  vec3 c = y > 0.0 ? mix(uWHor, uWUp, pow(y, mix(0.75, 1.25, uHorSoft))) : mix(uWHor, uWDown, pow(-y, mix(0.7, 1.15, uHorSoft)));
  float mu = max(dot(dir, uSunW), 0.0);
  c += uWHor * uLobe * (pow(mu, 8.0) * 0.8 + pow(mu, 48.0) * 1.2);
  return c;
}
vec3 fogW(vec3 col, float dist, vec3 dir) {
  vec3 T = exp(-uSigma * dist);
  return col * T + waterRad(dir) * (1.0 - T);
}
`,o=`
uniform vec2 uWk[14];
uniform vec3 uWa[14];        // amplitude, angular speed, phase
uniform float uTime, uTile, uF, uNorm, uNormSoft, uSharp, uSoft;
varying vec2 vUv;
void main() {
  vec2 x = vUv * uTile;
  float hx = 0.0, hz = 0.0, hxx = 0.0, hzz = 0.0, hxz = 0.0;
  for (int i = 0; i < 14; i++) {
    vec2 k = uWk[i]; vec3 w = uWa[i];
    float th = dot(k, x) - w.y * uTime + w.z;
    float s = sin(th), c = cos(th);
    hx += w.x * k.x * c; hz += w.x * k.y * c;
    hxx -= w.x * k.x * k.x * s; hzz -= w.x * k.y * k.y * s; hxz -= w.x * k.x * k.y * s;
  }
  // the refracted light lands displaced by F * slope; the light gathers where the map folds
  float F = uF;
  float det = (1.0 + F * hxx) * (1.0 + F * hzz) - F * F * hxz * hxz;
  float sharp = 1.0 / sqrt(det * det + uSharp * uSharp);
  float F2 = F * 0.6;
  float det2 = (1.0 + F2 * hxx) * (1.0 + F2 * hzz) - F2 * F2 * hxz * hxz;
  float soft = 1.0 / sqrt(det2 * det2 + uSoft * uSoft);
  gl_FragColor = vec4(hx, hz, sharp * uNorm, soft * uNormSoft);
}`,a=`
varying vec2 vUv;
void main() { vUv = position.xy * 0.5 + 0.5; gl_Position = vec4(position.xy, 0.0, 1.0); }`,r=`
uniform mat4 uInvProj, uCamWorld;
vec3 rayDir(vec2 uv) {
  vec4 v = uInvProj * vec4(uv * 2.0 - 1.0, 1.0, 1.0);
  v.xyz /= v.w;
  return normalize((uCamWorld * vec4(v.xyz, 0.0)).xyz);
}`,i=`
uniform vec3 uSunA;              // the sun in the air
uniform vec3 uSkyZen, uSkyHor;   // the sky (linear)
uniform float uSlopeGain, uSurfOn, uFloorY, uFloorOn, uCap, uSwell, uNearM, uSunGlit;
uniform vec3 uFloorAlb;
uniform vec3 uCanopyCol;
varying vec2 vUv;
void main() {
  vec3 dir = rayDir(vUv);
  vec3 col = waterRad(dir);
  if (uSurfOn > 0.5 && dir.y > 0.0) {
    float t = -uCam.y / dir.y;
    vec3 hit = uCam + dir * t;
    vec4 cs = texture2D(uCau, hit.xz / uTile, 0.0);
    // far off the short waves average out (and would only alias): their slope fades with distance
    float near = exp(-t / uNearM);
    vec2 sl = cs.rg * uSlopeGain * near * 0.6;
    // a slow long swell on top of the short waves
    sl += uSwell * 0.035 * vec2(sin(hit.x * 0.31 + uTime * 0.7 + 1.3 * sin(hit.z * 0.17)), cos(hit.z * 0.27 - uTime * 0.55)) * mix(0.4, 1.0, near);
    // fine capillary ripples: the same waves, smaller and turned, so the window's rim crinkles
    vec2 h2 = mat2(0.6, -0.8, 0.8, 0.6) * hit.xz / (uTile * 0.23);
    sl += (texture2D(uCau, h2).rg * 1.3 * near + texture2D(uCau, h2 * 2.7 + 0.31).rg * 0.9 * near) * uCap;
    vec3 N = normalize(vec3(-sl.x, 1.0, -sl.y));      // the surface's normal (up)
    vec3 r = refract(dir, -N, 1.333);
    float cosi = clamp(dot(dir, N), 0.0, 1.0);
    vec3 surf;
    if (dot(r, r) > 0.0) {
      // inside the window: the sky, squeezed into a cone, the sun broken into glitter
      float ct = clamp(r.y, 0.0, 1.0);
      float R0 = 0.02;
      float cosT = sqrt(max(0.0, 1.0 - 1.777 * (1.0 - cosi * cosi)));
      float Fr = R0 + (1.0 - R0) * pow(1.0 - cosT, 5.0);
      vec3 sky = mix(uSkyHor, uSkyZen, pow(ct, mix(0.6, 1.3, float(uCap < 0.99))));
      float mu = max(dot(r, uSunA), 0.0);
      if (uSunGlit < 0.999 || uSunGlit > 1.001) {
        // the sun broken into glitter: a finer surface for the sun alone, so it dances in many small points
        vec2 hf = mat2(0.8, 0.6, -0.6, 0.8) * hit.xz / (uTile * 0.09) + vec2(uTime * 0.05, 0.0);
        vec2 sf = sl + (texture2D(uCau, hf).rg * 2.2 + texture2D(uCau, hf * 2.3 + 0.17).rg * 1.6) * near;
        vec3 rg = refract(dir, -normalize(vec3(-sf.x, 1.0, -sf.y)), 1.333);
        float mg = max(dot(rg, uSunA), 0.0);
        sky += uSkyHor * (pow(mu, 30.0) * 0.5 + pow(mu, 300.0) * 2.0 + pow(mg, 900.0) * 30.0 + pow(mg, 9000.0) * 260.0) * uSunGlit;
      } else {
        sky += uSkyHor * (pow(mu, 40.0) * 2.5 + pow(mu, 600.0) * 18.0 + pow(mu, 6000.0) * 160.0);
      }
      vec3 mirror = mix(uWDown, uFloorAlb, uFloorOn);
      surf = sky * (1.0 - Fr) + mirror * Fr;
    } else {
      // outside it: the underside of the surface is a mirror of the water below (and the floor)
      vec3 rf = reflect(dir, -N);
      vec3 m = waterRad(rf);
      if (uFloorOn > 0.5) {
        float t2 = uFloorY / min(rf.y, -0.02);
        m = mix(m, uFloorAlb, exp(-uSigma.g * t2) * mix(0.85, 0.45, float(uCap < 0.99)) * smoothstep(-0.02, -0.25, rf.y));
      }
      surf = m;
    }
    // the canopy (kelp) lies on the surface and darkens it, glowing a little where the sun comes through
    float can = canopyAt(hit.xz);
    surf = mix(surf, uCanopyCol * (0.6 + 0.8 * vnoise2(hit.xz * 1.7)), can);
    col = fogW(surf, t, dir);
  }
  gl_FragColor = vec4(col, 1.0);
}`,u=`
uniform float uKind;
varying vec3 vW;
FLOOR_H
void main() {
  vec3 p = (modelMatrix * vec4(position, 1.0)).xyz;
  p.y = floorH(p.xz);
  vW = p;
  gl_Position = projectionMatrix * viewMatrix * vec4(p, 1.0);
}`,s=`
uniform sampler2D uAlb, uNor;
uniform float uKind, uTexScale;
uniform vec3 uTint;
uniform float uRipple;
varying vec3 vW;
FLOOR_H
float ripH(vec2 xz) {
  float w = 0.16;
  vec2 d = normalize(vec2(0.92, 0.38));
  float ph = (dot(xz, d) + 0.22 * sin(xz.x * 0.61 + 0.4 * xz.y) + 0.18 * sin(xz.y * 0.83 - 0.3 * xz.x)) / w;
  float s = sin(ph * 6.2831853);
  return 0.011 * (s * 0.8 + 0.2 * sin(ph * 12.566 + 1.0)) * (0.6 + 0.4 * vnoise2(xz * 0.7));
}
vec3 texN(vec2 uv) { vec3 n = texture2D(uNor, uv).xyz * 2.0 - 1.0; return vec3(n.x, n.z, -n.y); }
void main() {
  vec3 p = vW;
  float dist = length(p - uCam);
  vec3 V = (p - uCam) / dist;
  // the dune normal
  float e = 0.08;
  float hX = floorH(p.xz + vec2(e, 0.0)) - floorH(p.xz - vec2(e, 0.0));
  float hZ = floorH(p.xz + vec2(0.0, e)) - floorH(p.xz - vec2(0.0, e));
  // ripples, fading where they get finer than a pixel
  float rf = uRipple * (1.0 - smoothstep(4.0, 22.0, dist));
  if (rf > 0.0) {
    float er = 0.012;
    hX += rf * (ripH(p.xz + vec2(er, 0.0)) - ripH(p.xz - vec2(er, 0.0))) * (e / er);
    hZ += rf * (ripH(p.xz + vec2(0.0, er)) - ripH(p.xz - vec2(0.0, er))) * (e / er);
  }
  vec3 N = normalize(vec3(-hX, 2.0 * e, -hZ));
  // texture at two scales and angles, mixed by a slow noise, so it never tiles
  vec2 uv1 = p.xz / uTexScale;
  vec2 uv2 = mat2(0.80, -0.60, 0.60, 0.80) * p.xz / (uTexScale * 2.9) + 0.37;
  float m = smoothstep(0.3, 0.7, vnoise2(p.xz * 0.11));
  vec3 a1 = texture2D(uAlb, uv1).rgb, a2 = texture2D(uAlb, uv2).rgb;
  vec3 alb = mix(a1, a2, m);
  vec3 tn = normalize(mix(texN(uv1), texN(uv2), m));
  float tk = 1.0 - smoothstep(3.0, 18.0, dist);
  N = normalize(N + vec3(tn.x, 0.0, tn.z) * 0.55 * tk);
  alb = alb * uTint;
  // patches: slightly darker sand and a few greener algae films
  float patchN = vnoise2(p.xz * 0.23 + 7.0) * 0.6 + vnoise2(p.xz * 0.9) * 0.4;
  alb *= mix(0.86, 1.08, patchN);
  if (uKind > 0.5) alb = mix(alb, alb * vec3(0.75, 0.95, 0.55), smoothstep(0.45, 0.8, vnoise2(p.xz * 0.35 + 2.0)));
#ifdef SHALLOWS
  // the ripple troughs hold a little shade and finer, darker grains; the sand round a boulder is shaded by it
  alb *= 1.0 + rf * ripH(p.xz) * 9.0;
  alb *= boulderAO(p.xz);
#endif
  float ndl = max(dot(N, uSunW), 0.0);
  float cau = mix(causticAt(p, 0.0), 1.0, smoothstep(9.0, 32.0, dist) * 0.55);
  float cs = casterAt(p);
  vec3 light = sunAt(p) * cau * ndl * cs + skyAt(p) * (0.55 + 0.45 * N.y) * mix(0.72, 1.0, cs);
  vec3 col = alb * light;
  gl_FragColor = vec4(fogW(col, dist, V), 1.0);
}`,l=`
attribute float aAO;
varying vec3 vW, vN; varying float vAO;
void main() {
  vAO = aAO;
  vec4 w = modelMatrix * vec4(position, 1.0);
  vW = w.xyz; vN = normalize(mat3(modelMatrix) * normal);
  gl_Position = projectionMatrix * viewMatrix * w;
}`,c=`
uniform sampler2D uAlb;
uniform vec3 uTint, uMoss;
uniform float uFloorY;
varying vec3 vW, vN; varying float vAO;
void main() {
  vec3 p = vW; vec3 N = normalize(vN);
  float dist = length(p - uCam); vec3 V = (p - uCam) / dist;
  vec3 b = pow(abs(N), vec3(4.0)); b /= b.x + b.y + b.z;
  float s = 0.9;
  vec3 alb = texture2D(uAlb, p.zy / s).rgb * b.x + texture2D(uAlb, p.xz / s).rgb * b.y + texture2D(uAlb, p.xy / s).rgb * b.z;
  alb *= uTint;
  float top = smoothstep(0.25, 0.85, N.y) * smoothstep(0.35, 0.65, vnoise2(p.xz * 2.3));
  alb = mix(alb, uMoss, top * 0.65);
  float ao = mix(0.45, 1.0, smoothstep(0.0, 0.6, p.y - uFloorY)) * vAO;
  alb *= mix(0.7, 1.0, vAO);
  float ndl = max(dot(N, uSunW), 0.0);
  vec3 light = sunAt(p) * causticAt(p, 0.0) * ndl + skyAt(p) * (0.5 + 0.5 * N.y) * ao;
  gl_FragColor = vec4(fogW(alb * light, dist, V), 1.0);
}`,n=`
attribute vec4 aK;        // x: height on the stipe (m), y: kind (0 stipe, 1 blade, 2 float), z: along the blade 0..1, w: seed
attribute vec4 iP;        // holdfast x, y, z, yaw
attribute vec2 iS;        // height scale, phase
uniform vec2 uCurrent;    // the current's direction
varying vec3 vW, vN; varying vec4 vK;
vec3 sway(float h, vec3 hold, float ph) {
  float k = clamp(h / 12.0, 0.0, 1.2);
  float wave = sin(uTime * 0.55 - dot(hold.xz, uCurrent) * 0.18 - h * 0.22 + ph);
  float side = sin(uTime * 0.37 - hold.x * 0.11 + h * 0.15 + ph * 1.7);
  vec3 c = vec3(uCurrent.x, 0.0, uCurrent.y);
  vec3 s = vec3(-uCurrent.y, 0.0, uCurrent.x);
  return (c * (0.35 + 0.55 * wave) + s * 0.25 * side) * pow(k, 1.5) * 1.6;
}
void main() {
  float cy = cos(iP.w), sy = sin(iP.w);
  mat3 R = mat3(cy, 0.0, -sy, 0.0, 1.0, 0.0, sy, 0.0, cy);
  vec3 lp = position; lp.y *= iS.x;
  float h = aK.x * iS.x;
  vec3 p = iP.xyz + R * lp;
  p += sway(h, iP.xyz, iS.y);
  vec3 n = R * normal;
  if (aK.y > 0.5 && aK.y < 1.5) {
    // the blade flutters, more toward its tip
    float f = aK.z * aK.z * 0.07 * sin(uTime * 1.6 + h * 1.9 + aK.w * 6.28 + iS.y);
    p += n * f;
  }
  vW = p; vN = n; vK = aK;
  gl_Position = projectionMatrix * viewMatrix * vec4(p, 1.0);
}`,v=`
uniform vec3 uAlb, uTrans;
varying vec3 vW, vN; varying vec4 vK;
void main() {
  vec3 p = vW;
  float dist = length(p - uCam); vec3 V = (p - uCam) / dist;
  vec3 N = normalize(vN); if (dot(N, V) > 0.0) N = -N;
  vec3 alb = uAlb * (0.8 + 0.4 * fract(vK.w * 17.3));
  if (vK.y > 1.5) alb = uAlb * vec3(1.5, 1.3, 0.7);
  float ndl = max(dot(N, uSunW) * 0.7 + 0.3, 0.0);
  vec3 sun = sunAt(p) * causticAt(p, 1.5);
  // thin blades let the sun through: they glow yellow-green when it is behind them
  float back = pow(max(dot(V, uSunW), 0.0), 2.0);
  float thin = vK.y > 0.5 && vK.y < 1.5 ? 1.0 : 0.35;
  vec3 col = alb * (sun * ndl + skyAt(p) * 0.6) + uTrans * sun * (back * 0.9 + 0.12) * thin;
  // the stipe darker low down, in the forest's own shade
  col *= mix(0.55, 1.0, smoothstep(0.0, 6.0, vK.x));
  gl_FragColor = vec4(fogW(col, dist, V), 1.0);
}`,f=`
attribute vec4 iF;        // offset in the school (x, y, z), seed
uniform vec3 uSchool, uSchoolV;
varying vec3 vW; varying float vShade;
void main() {
  vec3 fw = normalize(uSchoolV);
  vec3 rt = normalize(cross(fw, vec3(0.0, 1.0, 0.0)));
  vec3 up = cross(rt, fw);
  float s = iF.w;
  vec3 o = iF.xyz + 0.35 * vec3(sin(uTime * 0.5 + s * 31.0), 0.4 * sin(uTime * 0.7 + s * 17.0), cos(uTime * 0.45 + s * 23.0));
  vec3 lp = position * (0.8 + 0.4 * fract(s * 7.13));
  lp.z += sin(uTime * 7.0 + s * 40.0 + lp.x * 9.0) * 0.02 * smoothstep(0.0, -0.1, lp.x);
  vec3 p = uSchool + o + fw * lp.x + up * lp.y + rt * lp.z;
  vW = p; vShade = lp.y;
  gl_Position = projectionMatrix * viewMatrix * vec4(p, 1.0);
}`,p=`
uniform vec3 uFishCol;
varying vec3 vW; varying float vShade;
void main() {
  float dist = length(vW - uCam); vec3 V = (vW - uCam) / dist;
  vec3 col = uFishCol * (sunAt(vW) * (0.25 + 4.0 * max(vShade, 0.0)) + skyAt(vW) * 0.5);
  gl_FragColor = vec4(fogW(col, dist, V), 1.0);
}`,h=`
attribute vec4 aSeed;
uniform float uBox, uPx, uFocus, uAperture, uMaxPt, uSize, uBright;
uniform vec3 uDrift;
uniform vec4 uGlowP[20]; uniform vec4 uGlowC[20]; uniform int uGlowN;
varying vec3 vCol; varying float vBig;
void main() {
  float s = aSeed.w;
  vec3 base = aSeed.xyz * uBox;
  vec3 wob = 0.12 * vec3(sin(uTime * 0.31 + s * 41.0), sin(uTime * 0.23 + s * 13.0), cos(uTime * 0.27 + s * 29.0));
  vec3 q = mod(base + uDrift * uTime * (0.7 + 0.6 * s) + wob + vec3(uSurge.x, 0.0, uSurge.y) * (0.75 + 0.5 * s) - uCam + 0.5 * uBox, uBox) - 0.5 * uBox;
  vec3 wp = uCam + q;
  vec4 mv = viewMatrix * vec4(wp, 1.0);
  float z = -mv.z;
  gl_Position = projectionMatrix * mv;
  float r = uSize * (0.4 + 1.2 * s * s);
  float rpx = r * uPx / max(z, 0.02);
  float coc = uAperture * abs(1.0 - uFocus / max(z, 0.02));
  float size = clamp(max(2.0 * rpx, coc) + 1.2, 1.0, uMaxPt);
  float energy = max(4.0 * rpx * rpx, 1.0);
  float edge = 1.0 - smoothstep(0.38, 0.5, max(max(abs(q.x), abs(q.y)), abs(q.z)) / uBox);
  float nearF = smoothstep(0.12, 0.45, z);
  vec3 V = normalize(q);
  float fwd = pow(max(dot(V, uSunW), 0.0), 4.0);
  vec3 L = sunAt(wp) * causticAt(wp, 2.0) * (0.35 + 2.0 * fwd) + skyAt(wp) * 0.5;
  vec3 Lg = vec3(0.0);
  for (int i = 0; i < 20; i++) {
    if (i >= uGlowN) break;
    // a living light lights the specks within a metre or two of it, falling off fast
    vec3 d = uGlowP[i].xyz - wp;
    float rr = uGlowP[i].w;
    float q2 = dot(d, d) / (rr * rr);
    Lg += uGlowC[i].rgb * uGlowC[i].a * (exp(-q2 * 3.0) * 16.0 + 0.8 / (1.0 + q2 * 12.0));
  }
  vCol = (L * exp(-uSigma * z) + Lg * exp(-uSigma * z * 0.3)) * uBright * edge * nearF * energy / (size * size);
  vBig = smoothstep(3.0, 9.0, size);
  gl_PointSize = size;
}`,x=`
varying vec3 vCol; varying float vBig;
void main() {
  vec2 c = gl_PointCoord * 2.0 - 1.0;
  float r = length(c);
  if (r > 1.0) discard;
  float small = exp(-r * r * 3.2) * 1.9;
  float disc = (1.0 - smoothstep(0.82, 1.0, r)) * (0.85 + 0.25 * smoothstep(0.5, 0.95, r));
  float k = mix(small, disc, vBig);
  gl_FragColor = vec4(vCol * k, 0.0);
}`,m=`
uniform sampler2D uDepth;
uniform float uNear, uFar, uMaxD, uShaftK, uShaftLod, uSteps, uFrame, uShaftUp, uShaftMix, uShaftFixed;
uniform vec3 uFwd;
uniform vec2 uRes;
varying vec2 vUv;
float ign(vec2 p) { return fract(52.9829189 * fract(dot(p, vec2(0.06711056, 0.00583715)))); }
void main() {
  vec3 dir = rayDir(vUv);
  float d = texture2D(uDepth, vUv).r;
  float dist = uMaxD;
  if (d < 0.99999) { float z = uNear * uFar / (uFar - d * (uFar - uNear)); dist = min(dist, z / max(dot(dir, uFwd), 0.05)); }
  if (dir.y > 0.0) dist = min(dist, -uCam.y / dir.y);
  // jitter: a fixed interleaved-gradient (blue-noise-like) pattern that the composite's upsample removes
  float j = mix(hash12(gl_FragCoord.xy * 1.37 + vec2(uFrame * 17.31, uFrame * 3.71)), ign(gl_FragCoord.xy), uShaftFixed);
  vec3 acc = vec3(0.0);
  float prev = 0.0;
  for (int i = 0; i < 48; i++) {
    if (float(i) >= uSteps) break;
    // denser near the lens, where a shaft is seen as a ray
    float f = (float(i) + j) / uSteps;
    float s = dist * f * f;
    float ds = dist * (2.0 * f + 1.0 / uSteps) / uSteps;
    vec3 p = uCam + dir * s;
    vec2 sp = (surfPoint(p) + uSurge.xy) / uTile;
    float depthK = clamp(-p.y / uFloorD, 0.0, 1.0);
    float net = textureLod(uCau, sp, uShaftLod).b;
    // shafts of different widths: the same net, finer and turned, mixed in
    if (uShaftMix > 0.0) net = mix(net, textureLod(uCau, mat2(0.8, -0.6, 0.6, 0.8) * sp * 1.9 + 0.37, uShaftLod - 0.6).b, uShaftMix);
    float I = max(net - 1.0, -0.3) * smoothstep(0.0, 0.3, depthK);
    acc += sunAt(p) * exp(-uSigma * s) * I * ds;
  }
  float mu = dot(dir, uSunW);
  float g = 0.7;
  float hg = (1.0 - g * g) / pow(1.0 + g * g - 2.0 * g * mu, 1.5);
  acc *= uShaftK * (0.2 + min(hg, 8.0) * 0.1) * mix(1.0, smoothstep(0.05, 0.8, dir.y), uShaftUp);
  acc = clamp(acc, vec3(-4.0), vec3(40.0));
  gl_FragColor = vec4(acc, 1.0);
}`,d=`
uniform sampler2D uColor, uShafts, uDepth;
uniform float uNear, uFar, uExposure, uVignette, uFrame, uShaftUp4, uGlowTight;
uniform vec4 uDof;               // the world's own lens (kelp): focus (m), near px, far px, max px; w = 0: off
uniform vec3 uFwd, uWB;
float linZ(float d) { return uNear * uFar / (uFar - d * (uFar - uNear)); }
uniform vec4 uGlowP[20]; uniform vec4 uGlowC[20]; uniform int uGlowN;
uniform vec2 uRes;
varying vec2 vUv;
vec3 toSrgb(vec3 c) { return mix(c * 12.92, 1.055 * pow(max(c, 0.0), vec3(1.0 / 2.4)) - 0.055, step(0.0031308, c)); }
// a filmic curve (ACES fit by K. Narkowicz): a soft toe, a long shoulder, nothing clips flat
vec3 filmic(vec3 x) { return clamp((x * (2.51 * x + 0.03)) / (x * (2.43 * x + 0.59) + 0.14), 0.0, 1.0); }
float hashF(vec2 p) { vec3 p3 = fract(vec3(p.xyx) * 0.1031); p3 += dot(p3, p3.yzx + 33.33); return fract((p3.x + p3.y) * p3.z); }
// the world's own depth of field (the players stay sharp: they are drawn after). A blurred near thing spreads
// over what is behind it; a sharp near thing is not smeared by what is blurred behind it.
float dofCoc(float z) { return z < uDof.x ? min(uDof.y * (uDof.x / z - 1.0), uDof.w) : min(uDof.z * (1.0 - uDof.x / z), uDof.w); }
vec3 dofGather(vec2 uv, float d) {
  vec3 acc = texture2D(uColor, uv).rgb;
  float z0 = linZ(d), k0 = dofCoc(z0), ws = 1.0;
  float rot = hashF(gl_FragCoord.xy) * 6.2831853;
  for (int i = 0; i < 40; i++) {
    float fi = float(i) + 0.5;
    float r = sqrt(fi / 40.0) * uDof.w;
    float a = fi * 2.39996323 + rot;
    vec2 tuv = uv + vec2(cos(a), sin(a)) * r / uRes;
    float zt = linZ(texture2D(uDepth, tuv).r);
    float kt = zt < z0 ? dofCoc(zt) : min(dofCoc(zt), k0);
    float w = clamp(kt - r + 1.0, 0.0, 1.0);
    acc += texture2D(uColor, tuv).rgb * w; ws += w;
  }
  return acc / ws;
}
void main() {
  vec2 uv = vUv;
  float d = texture2D(uDepth, uv).r;
  vec2 px = 2.0 / uRes;
  vec3 sh;
  if (uShaftUp4 > 0.5) {
    // edge-aware upsample: a 3x3 of half-resolution texels weighted by how close their depth is to ours
    float zc = linZ(d);
    vec3 acc = vec3(0.0); float ws = 0.0;
    for (int y = -1; y <= 1; y++) for (int x = -1; x <= 1; x++) {
      vec2 o = vec2(float(x), float(y)) * px * 1.25;
      float zs = linZ(texture2D(uDepth, uv + o).r);
      float w = exp(-0.55 * float(x * x + y * y)) * exp(-abs(zs - zc) / (0.04 * zc + 0.05));
      acc += texture2D(uShafts, uv + o).rgb * w; ws += w;
    }
    sh = acc / max(ws, 1e-4);
  } else {
    sh = texture2D(uShafts, uv).rgb * 0.36 + (texture2D(uShafts, uv + vec2(px.x, px.y)).rgb + texture2D(uShafts, uv - vec2(px.x, px.y)).rgb
    + texture2D(uShafts, uv + vec2(px.x, -px.y)).rgb + texture2D(uShafts, uv + vec2(-px.x, px.y)).rgb) * 0.16;
  }
  vec3 c = (uDof.w > 0.0 ? dofGather(uv, d) : texture2D(uColor, uv).rgb) + sh;
  c = clamp(c, vec3(0.0), vec3(6e4));
  if (!(c.r == c.r) || !(c.g == c.g) || !(c.b == c.b)) c = vec3(0.0);
  if (uGlowN > 0) {
    vec3 dir = rayDir(uv);
    float S = 200.0;
    if (d < 0.99999) { float z = uNear * uFar / (uFar - d * (uFar - uNear)); S = z / max(dot(dir, uFwd), 0.05); }
    for (int i = 0; i < 20; i++) {
      if (i >= uGlowN) break;
      vec3 oc = uGlowP[i].xyz - uCam;
      float r = uGlowP[i].w;
      float s0 = dot(oc, dir);
      vec3 T = exp(-uSigma * length(oc) * mix(1.0, 0.3, uGlowTight));   // tight (living) lights keep more of their colour: a choice, not physics
      if (uGlowTight > 0.5) {
        // tight: the light the water scatters right round the body, gone within a few body widths
        float h2 = max(dot(oc, oc) - s0 * s0, 0.0);
        float rc = r * 0.11;
        float vis = smoothstep(-0.3 * r, 0.05 * r, S - s0) * step(0.0, s0);
        float g = exp(-h2 / (rc * rc)) * 0.9 + rc * rc / (h2 + rc * rc) * 0.035;
        c += uGlowC[i].rgb * uGlowC[i].a * g * T * vis;
      } else {
        float h2 = max(dot(oc, oc) - s0 * s0, 0.0) + 0.08 * r * r;
        float h = sqrt(h2);
        // light scattered toward the eye by the water round a small soft source (closed form)
        float a = (atan((S - s0) / h) - atan(-s0 / h)) / h;
        c += uGlowC[i].rgb * uGlowC[i].a * r * a * T * 0.03;
      }
    }
  }
  c *= uExposure * uWB;
  // a housing's soft vignette
  vec2 q = uv - 0.5; q.x *= uRes.x / uRes.y;
  c *= 1.0 - uVignette * smoothstep(0.25, 1.05, dot(q, q) * 2.2);
  c = toSrgb(filmic(c));
  float n = hashF(gl_FragCoord.xy + uFrame * 7.13) + hashF(gl_FragCoord.yx * 1.37 + 11.0 + uFrame) - 1.0;
  c += n / 255.0;
  gl_FragColor = vec4(c, 1.0);
  gl_FragDepth = d;
}`,g=`
attribute float aAO;
varying vec3 vW, vN; varying float vAO;
void main() {
  vAO = aAO;
  vec4 w = modelMatrix * vec4(position, 1.0);
  vW = w.xyz; vN = normalize(mat3(modelMatrix) * normal);
  gl_Position = projectionMatrix * viewMatrix * w;
}`,y=`
uniform sampler2D uAlb, uNor;
uniform vec3 uMoss;
varying vec3 vW, vN; varying float vAO;
FLOOR_H
vec3 tri(sampler2D t, vec3 p, vec3 b, float s) { return texture2D(t, p.zy / s).rgb * b.x + texture2D(t, p.xz / s).rgb * b.y + texture2D(t, p.xy / s).rgb * b.z; }
void main() {
  vec3 p = vW; vec3 N0 = normalize(vN);
  float dist = length(p - uCam); vec3 V = (p - uCam) / dist;
  vec3 b = pow(abs(N0), vec3(4.0)); b /= b.x + b.y + b.z;
  float s = 0.75;
  vec3 tx = texture2D(uNor, p.zy / s).xyz * 2.0 - 1.0, ty = texture2D(uNor, p.xz / s).xyz * 2.0 - 1.0, tz = texture2D(uNor, p.xy / s).xyz * 2.0 - 1.0;
  vec3 N = normalize(N0 + (vec3(0.0, tx.y, tx.x) * b.x + vec3(ty.x, 0.0, ty.y) * b.y + vec3(tz.x, tz.y, 0.0) * b.z) * 0.8);
  vec3 tex = tri(uAlb, p, b, s);
  float lum = dot(tex, vec3(0.33));
  vec3 alb = pow(tex, vec3(1.35)) * vec3(1.25, 1.2, 1.08);
  float cav = smoothstep(0.12, 0.42, lum);
  // growth: a short olive turf on what faces up, broken by the stone's own relief
  float up = smoothstep(0.15, 0.7, N0.y);
  float g = up * smoothstep(0.38, 0.62, vnoise2(p.xz * 2.7 + p.y) * 0.55 + vnoise2(p.xz * 11.0 - p.y * 3.0) * 0.3 + (lum - 0.45) * 0.6 + 0.12);
  vec3 moss = uMoss * (0.7 + 0.8 * vnoise2(p.xz * 23.0 + p.y * 7.0)) * (0.9 + 0.6 * lum);
  alb = mix(alb, moss, g * 0.9);
  // pale speckle: encrusting things and barnacle scars on the sides
  vec3 cp = floor(p * 38.0);
  float sp = step(0.93, hash12(cp.xy + cp.z * 7.13)) * smoothstep(0.35, 0.65, vnoise2(p.xz * 3.0 + p.y));
  alb = mix(alb, vec3(0.6, 0.58, 0.53), sp * (1.0 - g) * 0.6);
  // a dusting of sand where it sits, and the shade of the sand line
  float hs = p.y - floorH(p.xz);
  alb = mix(alb, vec3(0.55, 0.5, 0.42), smoothstep(0.16, 0.0, hs) * 0.55 + smoothstep(0.75, 0.95, N0.y) * 0.25);
  float ao = mix(0.35, 1.0, smoothstep(0.0, 0.45, hs)) * mix(0.6, 1.0, vAO) * mix(0.55, 1.0, cav);
  float ndl = max(dot(N, uSunW), 0.0);
  vec3 light = sunAt(p) * causticAt(p, 0.0) * ndl * mix(0.75, 1.0, vAO) + skyAt(p) * (0.5 + 0.5 * N.y) * ao;
  gl_FragColor = vec4(fogW(alb * light, dist, V), 1.0);
}`,w=`
attribute vec2 aB;        // along the blade 0..1, side -1..1
attribute vec4 iG;        // root x, z, length, seed
uniform float uGrassK;
varying vec3 vW, vN; varying vec2 vB; varying float vSeed;
FLOOR_H
void main() {
  float s = iG.w, v = aB.x, L = iG.z;
  float yaw = s * 61.0;
  vec2 f = vec2(cos(yaw), sin(yaw));
  vec3 root = vec3(iG.x, floorH(iG.xy) - 0.02, iG.y);
  // the lean: a set toward the shore, the surge's velocity, and a small flutter of each blade
  vec2 lean = vec2(0.16, 0.08) + uSurge.zw * uGrassK * (0.75 + 0.5 * fract(s * 7.31))
    + 0.05 * vec2(sin(uTime * 1.9 + s * 37.0 + v * 2.0), cos(uTime * 1.5 + s * 23.0));
  float bend = v * v;
  vec3 p = root + vec3(0.0, v * L, 0.0) + vec3(lean.x, 0.0, lean.y) * bend * L * 1.4;
  p.y -= dot(lean, lean) * bend * L * 0.6;
  float w = 0.0075 * (1.0 - 0.5 * v * v) * (0.8 + 0.4 * fract(s * 3.7));
  p.xz += vec2(-f.y, f.x) * aB.y * w;
  vW = p; vN = normalize(vec3(f.x, 0.25, f.y)); vB = aB; vSeed = s;
  gl_Position = projectionMatrix * viewMatrix * vec4(p, 1.0);
}`,b=`
varying vec3 vW, vN; varying vec2 vB; varying float vSeed;
void main() {
  vec3 p = vW;
  float dist = length(p - uCam); vec3 V = (p - uCam) / dist;
  vec3 N = normalize(vN); if (dot(N, V) > 0.0) N = -N;
  float v = vB.x;
  vec3 base = mix(vec3(0.025, 0.07, 0.012), vec3(0.05, 0.09, 0.015), fract(vSeed * 13.1));
  vec3 tip = vec3(0.13, 0.11, 0.035);
  vec3 alb = mix(base, tip, smoothstep(0.55, 1.0, v) * (0.5 + 0.5 * fract(vSeed * 5.3)));
  // epiphytes: pale flecks on the older blades
  alb = mix(alb, vec3(0.32, 0.30, 0.24), smoothstep(0.72, 0.8, vnoise2(vec2(v * 40.0, vSeed * 91.0))) * 0.6);
  float ndl = abs(dot(N, uSunW)) * 0.6 + 0.4;
  float back = pow(max(dot(V, uSunW), 0.0), 2.0);
  vec3 sun = sunAt(p) * causticAt(p, 0.5);
  vec3 col = alb * (sun * ndl + skyAt(p) * 0.45) + vec3(0.10, 0.16, 0.02) * sun * back * 0.45;
  col *= mix(0.3, 1.0, smoothstep(0.0, 0.45, v));
  gl_FragColor = vec4(fogW(col, dist, V), 1.0);
}`,z=`
attribute vec3 aCol;
varying vec3 vW, vN, vCol;
void main() {
  vec4 w = modelMatrix * vec4(position, 1.0);
  vW = w.xyz; vN = normalize(mat3(modelMatrix) * normal); vCol = aCol;
  gl_Position = projectionMatrix * viewMatrix * w;
}`,S=`
varying vec3 vW, vN, vCol;
void main() {
  vec3 p = vW; vec3 N = normalize(vN);
  float dist = length(p - uCam); vec3 V = (p - uCam) / dist;
  vec3 alb = vCol * (0.85 + 0.3 * vnoise2(p.xz * 140.0));
  float ndl = max(dot(N, uSunW), 0.0);
  vec3 light = sunAt(p) * causticAt(p, 0.0) * ndl + skyAt(p) * (0.5 + 0.5 * N.y);
  gl_FragColor = vec4(fogW(alb * light, dist, V), 1.0);
}`;export{i as BACK_FRAG,y as BOULDER_FRAG,g as BOULDER_VERT,o as CAUSTIC_FRAG,d as COMP_FRAG,p as FISH_FRAG,f as FISH_VERT,s as FLOOR_FRAG,u as FLOOR_VERT,a as FULL_VERT,b as GRASS_FRAG,w as GRASS_VERT,v as KELP_FRAG,n as KELP_VERT,e as NW,S as PROP_FRAG,z as PROP_VERT,r as RAY,c as ROCK_FRAG,l as ROCK_VERT,m as SHAFT_FRAG,x as SPECK_FRAG,h as SPECK_VERT,t as WATER};
