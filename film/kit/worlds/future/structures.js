import*as y from"three";const J=`
precision highp float; precision highp int; precision highp sampler2D;
uniform sampler2D uPlate; uniform vec2 uResolution;           // the stage's plate (sRGB values) and buffer size
uniform sampler2D uDepth; uniform vec2 uTile; uniform vec2 uGrid; uniform float uSMax; uniform float uOcc;
uniform mat4 uViewK; uniform vec4 uSrcK;                        // the camera of the nearest film frame (world -> view, lens)
uniform vec3 uSunDir; uniform vec3 uSunCol; uniform vec3 uSunHi; uniform vec3 uAmb; uniform float uSunEl;
uniform vec3 uSkyHor; uniform vec3 uSkyZen; uniform vec3 uGround;  // linear: the film's sky near the city's horizon, high up, the land/cloud below
uniform float uExposure; uniform float uHaze; uniform float uFog; uniform float uDeck; uniform float uDeckSoft;
uniform float uWindows; uniform float uTime; uniform float uShadeY; uniform float uLowFog; uniform float uLowY;
uniform float uLocalDeck; uniform vec4 uSkyUV; uniform float uSkyPlate;
vec3 gHor, gZen;
void initSky() {
  gHor = uSkyHor; gZen = uSkyZen;
  if (uSkyPlate > 0.5) {
    vec3 h = pow(max(texture(uPlate, uSkyUV.xy).rgb, 0.0), vec3(2.2)), z = pow(max(texture(uPlate, uSkyUV.zw).rgb, 0.0), vec3(2.2));
    if (h.r + h.g + h.b > 0.02) { gHor = h; gZen = z; }
  }
}
float hash12(vec2 p) { vec3 p3 = fract(vec3(p.xyx) * .1031); p3 += dot(p3, p3.yzx + 33.33); return fract((p3.x + p3.y) * p3.z); }
float vnoise(vec2 p) { vec2 i = floor(p), f = fract(p); f = f * f * (3.0 - 2.0 * f);
  return mix(mix(hash12(i), hash12(i + vec2(1, 0)), f.x), mix(hash12(i + vec2(0, 1)), hash12(i + vec2(1, 1)), f.x), f.y); }
float filmS(ivec2 c) {
  ivec2 k = clamp(c, ivec2(0), ivec2(uGrid) - 1);
  vec4 t = texelFetch(uDepth, ivec2(uTile) + k, 0);
  float g = floor(t.g * 255.0 + 0.5);
  float grown = mod(g, 2.0);
  float s = (floor(t.r * 255.0 + 0.5) * 256.0 + g - grown) / 65535.0 * uSMax;
  return grown > 0.5 ? 0.0 : s;                 // a halo sample: the true surface there is farther
}
// the film's 1/planar depth seen through world point wp (bilinear), and that point's planar depth in K; -1 off frame
vec2 filmAt(vec3 wp) {
  vec4 v = uViewK * vec4(wp, 1.0);
  float z = -v.z; if (z <= 0.0) return vec2(-1.0);
  vec2 ndc = vec2(v.x / (z * uSrcK.x) - uSrcK.z, v.y / (z * uSrcK.y) - uSrcK.w);
  vec2 uv = vec2(ndc.x * 0.5 + 0.5, 0.5 - ndc.y * 0.5);
  if (uv.x < 0.0 || uv.y < 0.0 || uv.x > 1.0 || uv.y > 1.0) return vec2(-1.0);
  vec2 g = uv * uGrid - 0.5; vec2 i0 = floor(g); vec2 fr = g - i0; ivec2 c = ivec2(i0);
  float s = mix(mix(filmS(c), filmS(c + ivec2(1, 0)), fr.x), mix(filmS(c + ivec2(0, 1)), filmS(c + ivec2(1, 1)), fr.x), fr.y);
  return vec2(s, z);
}
// 1 where the film shows nothing nearer than this world point, 0 where it does (soft over a grid texel)
float filmVisible(vec3 wp) {
  if (uOcc < 0.5) return 1.0;
  vec2 sz = filmAt(wp);
  if (sz.x < 0.0) return 1.0;
  return 1.0 - smoothstep(0.985, 1.06, sz.x * sz.y);
}
vec3 plateAt() { return texture(uPlate, gl_FragCoord.xy / uResolution).rgb; }
vec3 toLin(vec3 c) { return pow(max(c, 0.0), vec3(2.2)); }
// a soft shoulder: identity up to 0.78, then rolls off (keeps the film's own sky values where the glass mirrors them)
vec3 shoulder(vec3 x) { x *= uExposure; vec3 k = vec3(0.78); return mix(x, k + (1.0 - k) * (1.0 - exp(-(x - k) / (1.0 - k))), step(k, x)); }
vec3 toSRGB(vec3 c) { c = clamp(c, 0.0, 1.0); return mix(c * 12.92, 1.055 * pow(c, vec3(1.0 / 2.4)) - 0.055, step(0.0031308, c)); }
// how much sun reaches height y (m): after sunset only the tops, above the Earth's shadow; low sun:
// the valley lies in the far ridges' shade
float sunReach(float y) {
  float e = radians(uSunEl);
  float h = e < 0.0 ? 6371000.0 * e * e * 0.5 : 0.0;
  h = max(h, uShadeY);
  return smoothstep(h - 0.12 * h - 30.0, h + 0.12 * h + 30.0, y);
}
float dither() { return (hash12(gl_FragCoord.xy + fract(uTime) * 61.0) - 0.5) / 255.0; }
// the sky a facade mirrors along R (linear): the film's horizon and zenith, the land below, the sun's aureole
vec3 skyRefl(vec3 R, vec3 L, float sunK) {
  vec3 s = R.y >= 0.0 ? mix(gHor, gZen, smoothstep(0.0, 0.75, R.y)) : mix(gHor * 0.9, uGround, smoothstep(0.0, -0.18, R.y));
  float c = max(dot(R, L), 0.0);
  s += uSunHi * sunK * (0.35 * pow(c, 4.0) + 0.9 * pow(c, 60.0) + 4.0 * pow(c, 1200.0));
  return s;
}
`,Q=`
in vec3 position; in vec3 normal; in vec4 attr;    // attr: zone, tower id, s (m along the facade), the form's top y
uniform mat4 modelMatrix, viewMatrix, projectionMatrix;
out vec3 vWorld; out vec3 vNormal; out vec4 vAttr;
void main() {
  vec4 w = modelMatrix * vec4(position, 1.0);
  vWorld = w.xyz; vNormal = normalize(mat3(modelMatrix) * normal); vAttr = attr;
  gl_Position = projectionMatrix * viewMatrix * w;
}`,$=`
in vec3 vWorld; in vec3 vNormal; in vec4 vAttr;
uniform vec3 cameraPosition;
out vec4 outColor;
// coverage of thin lines of width w (fraction of a period) along coordinate x with period 1, antialiased;
// where a period is under about a pixel it becomes the mean tone w
float lines(float x, float w, float fw) {
  float d = abs(fract(x) - 0.5);                 // 0.5 at the line, 0 halfway between
  float a = smoothstep(0.5 - w * 0.5 - fw, 0.5 - w * 0.5 + fw, d);
  return mix(a, w, smoothstep(0.18, 0.55, fw));
}
void main() {
  initSky();
  float vis = filmVisible(vWorld);
  float zone = vAttr.x, tid = vAttr.y, s = vAttr.z, top = vAttr.w;
  float y = vWorld.y;
  float fwY = max(fwidth(y), 1e-3);
  // the cloud laps round: below the deck the form dissolves into the cloud, a soft noisy moving edge
  float n = vnoise(vWorld.xz / 46.0 + vec2(uTime * 0.035, 0.0)) * 0.6 + vnoise(vWorld.xz / 13.0 + vec2(3.1, uTime * 0.05)) * 0.4;
  float deckY = uDeck;
  if (uLocalDeck > 0.5) {
    // the cloud surface behind this point, from the film's own depth (its true height here)
    vec2 sz = filmAt(vWorld);
    if (sz.x > 1e-6 && sz.x * sz.y < 1.0) {
      vec3 dirV = vWorld - cameraPosition;
      float dB = 1.0 / sz.x;                      // planar depth of the film behind, in K's frame
      vec3 pb = cameraPosition + dirV * (dB / sz.y);
      deckY = max(deckY - 40.0, min(deckY + 60.0, pb.y));
    }
  }
  float deckEdge = deckY + (n - 0.5) * uDeckSoft * 1.2 + uDeckSoft * 0.35;
  float above = smoothstep(deckEdge - uDeckSoft * 0.5, deckEdge + uDeckSoft * 0.5, y);
  vis *= above;
  // the very top of each form melts into the sky over a pixel or so
  vis *= smoothstep(0.0, 1.4 * fwY, top - y + 0.25 * fwY);
  if (vis < 0.004) discard;
  vec3 N = normalize(vNormal);
  vec3 V = normalize(cameraPosition - vWorld);
  if (dot(N, V) < 0.0 && zone > 1.5 && zone < 2.5) N = -N;
  vec3 L = normalize(uSunDir);
  float sun = sunReach(y);
  vec3 sunC = mix(uSunCol, uSunHi, 1.0 - step(0.0, uSunEl) * (1.0 - smoothstep(-0.5, 0.0, -uSunEl)));
  float ndl = max(dot(N, L), 0.0) * sun;
  float tv = hash12(vec2(tid, 7.13)), tv2 = hash12(vec2(tid * 1.7, 2.9));
  // sky fill: the film's sky from above and the side, a little warm bounce from below; shade is cool, never black
  vec3 fill = mix(gHor, gZen, clamp(0.45 + 0.5 * N.y, 0.0, 1.0)) * vec3(0.94, 0.98, 1.06) * (0.46 + 0.3 * max(N.y, 0.0)) + uGround * 0.22 * max(0.0, -N.y);
  vec3 col;
  float fwS = max(fwidth(s), 1e-3);
  if (zone < 0.5 || zone > 4.5) {                       // pale ceramic (5: ceramic with floor reveals)
    vec3 alb = vec3(0.80, 0.79, 0.76) * (0.95 + 0.05 * vnoise(vec2(y / 7.0, s / 5.0 + tid * 3.0)));
    if (zone > 4.5) alb *= 1.0 - 0.22 * lines(y / 4.0, 0.12, fwY / 4.0);
    col = alb * (sunC * 2.2 * ndl + fill * 1.0);
  } else if (zone < 1.5) {                               // the curtain wall
    float fl = y / 4.0, fwF = fwY / 4.0;
    // glass between pale vertical fins (each tower its own rhythm), dark floor lines, a bolder band every 12 floors
    float finSp = mix(1.6, 3.2, tv), finW = mix(0.16, 0.42, tv2);
    float fin = lines(s / finSp, finW, fwS / finSp);
    float band = lines(fl / 12.0 + tid * 0.37, 0.075, fwF / 12.0);
    float slab = lines(fl, 0.16, fwF);                       // the floor's edge (a pale spandrel line)
    float lobby = smoothstep(0.0, 1.5 * fwY + 0.5, 7.5 - mod(y + tid * 41.0, 128.0)) * step(60.0, top - y) * step(90.0, y - uDeck);
    vec3 R = reflect(-V, N);
    float ndv = max(dot(N, V), 0.0);
    float F = 0.34 + 0.66 * pow(1.0 - ndv, 4.0);
    // the glass: the sky it mirrors (slightly rippled from pane to pane), a dark interior behind
    float pane = hash12(vec2(floor(fl), floor(s / finSp) + tid * 13.0));
    vec3 Rr = normalize(R + vec3((hash12(vec2(pane, 3.1)) - 0.5) * 0.08, (pane - 0.5) * 0.16, 0.0));
    vec3 tint = mix(vec3(0.80, 0.90, 1.0), vec3(0.92, 0.95, 0.96), tv2) * (0.9 + 0.2 * pane);
    vec3 interior = vec3(0.025, 0.03, 0.036) + fill * 0.05;
    vec3 glass = mix(interior, skyRefl(Rr, L, sun) * tint, F);
    // lit windows at dusk: warm, small, irregular, grouped by floor (averaged where a floor is under a pixel)
    float grp = hash12(vec2(floor(fl / 3.0), tid * 5.1));
    float on = hash12(vec2(floor(fl), floor(s / (finSp * 2.0)) + tid * 31.0));
    float lit = step(1.0 - uWindows * mix(0.25, 0.85, grp), on);
    lit = mix(lit, uWindows * 0.55 * mix(0.25, 0.85, grp), smoothstep(0.25, 0.7, fwF));
    glass += lit * (1.0 - lobby) * vec3(1.0, 0.66, 0.36) * 0.9;
    vec3 pale = vec3(0.74, 0.735, 0.71) * (sunC * 2.2 * ndl + fill);
    col = mix(glass, pale, clamp(fin * 0.8 + band * 0.75 + slab * 0.3, 0.0, 1.0));
    col = mix(col, interior * 0.8 + glass * 0.45, lobby * 0.6);
  } else if (zone < 2.5) {                               // planting: terraces and trees, dark mixed greens
    float g = vnoise(vWorld.xz / 3.5 + tid + y * 0.2) * 0.6 + vnoise(vWorld.xz / 1.3 + y) * 0.4;
    vec3 alb = mix(vec3(0.028, 0.045, 0.025), vec3(0.075, 0.105, 0.045), g);
    col = alb * (sunC * 2.4 * ndl + fill * 0.9);
  } else if (zone < 3.5) {                               // brushed metal and under-structure
    col = vec3(0.30, 0.31, 0.32) * (sunC * 2.0 * ndl + fill * 0.9);
  } else {                                               // 4: a glazed sky-bridge's side: mullions, a row of windows
    vec3 R = reflect(-V, N);
    float ndv = max(dot(N, V), 0.0);
    float F = 0.3 + 0.7 * pow(1.0 - ndv, 4.0);
    float mull = lines(s / 2.4, 0.14, fwS / 2.4);
    vec3 glass = mix(vec3(0.03, 0.035, 0.04) + fill * 0.06, skyRefl(R, L, sun), F);
    vec3 pale = vec3(0.78, 0.775, 0.75) * (sunC * 2.2 * ndl + fill);
    col = mix(glass, pale, mull);
  }
  vec3 c = toSRGB(shoulder(col));
  // aerial perspective toward the film's own colour behind this pixel; denser low over the far shore
  float d = length(vWorld - cameraPosition);
  float h = 1.0 - exp(-d * uHaze);
  h = max(h, uLowFog * (1.0 - smoothstep(uLowY, uLowY + 240.0, y)) * smoothstep(1500.0, 4500.0, d));
  h = max(h, uFog);
  vec3 bg = plateAt();
  c = mix(c, bg, h);
  // a whisper of mist where the cloud touches the form
  float mist = 1.0 - smoothstep(deckEdge, deckEdge + uDeckSoft * 2.5, y);
  c = mix(c, bg, mist * 0.5);
  c = mix(bg, c, vis);
  outColor = vec4(c + dither(), 1.0);
}`,ee=`
in vec3 position; in vec4 iPos; in vec4 iCol;          // iPos: world xyz, size (core sigma, px at 720p); iCol: rgb, intensity
uniform mat4 viewMatrix, projectionMatrix; uniform vec2 uResolution;
out vec2 vOff; out vec4 vCol; out vec3 vWorld; out float vSig;
void main() {
  vec4 c = projectionMatrix * viewMatrix * vec4(iPos.xyz, 1.0);
  float px = iPos.w * uResolution.y / 720.0;            // core sigma in buffer pixels
  float R = px * 7.0 + 2.0;
  vOff = position.xy * R; vSig = px; vCol = iCol; vWorld = iPos.xyz;
  c.xy += position.xy * R * 2.0 / uResolution * c.w;
  gl_Position = c;
}`,te=`
in vec2 vOff; in vec4 vCol; in vec3 vWorld; in float vSig;
uniform vec3 cameraPosition;
out vec4 outColor;
void main() {
  float vis = filmVisible(vWorld);
  float r2 = dot(vOff, vOff);
  float core = exp(-r2 / (2.0 * vSig * vSig));
  float halo = 0.05 * exp(-r2 / (2.0 * 12.0 * vSig * vSig));     // a thin halo, not a fat glow
  float d = length(vWorld - cameraPosition);
  float t = exp(-d * uHaze * 0.6) * (1.0 - uFog * 0.9);
  vec3 c = vCol.rgb * vCol.a * (core + halo) * t * vis;
  if (max(c.r, max(c.g, c.b)) < 0.0015) discard;
  outColor = vec4(c, 1.0);
}`,oe=`
in vec3 position; in vec3 prev; in vec3 next; in vec4 rib;       // rib: side (-1/1), world width (m; px at 720p for the ring), u along (0..1), kind
uniform mat4 viewMatrix, projectionMatrix; uniform vec2 uResolution; uniform vec3 cameraPosition;
out vec3 vWorld; out float vSide; out float vU; out float vAlpha; out float vKind; out vec3 vDir;
vec3 place(vec3 p, float kind) { return kind > 1.5 ? cameraPosition + normalize(p) * 90000.0 : p; }
vec2 scr(vec4 c) { return c.xy / max(c.w, 1e-4) * uResolution * 0.5; }
void main() {
  float kind = rib.w;
  vec3 a = place(position, kind), pv = place(prev, kind), nx = place(next, kind);
  vec4 ca = projectionMatrix * viewMatrix * vec4(a, 1.0);
  vec4 cp = projectionMatrix * viewMatrix * vec4(pv, 1.0);
  vec4 cn = projectionMatrix * viewMatrix * vec4(nx, 1.0);
  // a point behind the lens slides along its segment to just in front of it (no wild triangles)
  const float WN = 0.2;
  if (ca.w < WN) {
    vec4 cq = cn.w > WN ? cn : cp; vec3 q = cn.w > WN ? nx : pv;
    if (cq.w < WN) { gl_Position = vec4(0.0, 0.0, 2.0, 1.0); vAlpha = 0.0; vSide = 0.0; vWorld = a; vU = 0.0; vKind = kind; vDir = vec3(0.0, 1.0, 0.0); return; }
    float t = (WN - ca.w) / (cq.w - ca.w);
    a = mix(a, q, t); ca = projectionMatrix * viewMatrix * vec4(a, 1.0);
  }
  if (cp.w < WN) cp = ca + (ca - cn);
  if (cn.w < WN) cn = ca + (ca - cp);
  vec2 d1 = scr(ca) - scr(cp), d2 = scr(cn) - scr(ca);
  vec2 dir = normalize((length(d1) > 1e-4 ? normalize(d1) : vec2(0.0)) + (length(d2) > 1e-4 ? normalize(d2) : vec2(0.0)) + vec2(1e-6, 0.0));
  vec2 nrm = vec2(-dir.y, dir.x);
  float pxPerM = projectionMatrix[1][1] * uResolution.y * 0.5 / max(ca.w, 1e-3);
  float truePx = kind > 1.5 ? rib.y * uResolution.y / 720.0 : rib.y * pxPerM;
  float drawPx = max(truePx, 1.1 * max(1.0, uResolution.y / 1080.0));
  vAlpha = min(1.0, truePx / drawPx);
  ca.xy += nrm * rib.x * (drawPx * 0.5 + 1.0) * 2.0 / uResolution * ca.w;
  vSide = rib.x * (drawPx * 0.5 + 1.0) / (drawPx * 0.5);
  vWorld = a; vU = rib.z; vKind = kind; vDir = normalize(position);
  gl_Position = ca;
}`,ne=`
in vec3 vWorld; in float vSide; in float vU; in float vAlpha; in float vKind; in vec3 vDir;
uniform vec3 cameraPosition; uniform float uLineFade; uniform float uRing; uniform float uTether;
out vec4 outColor;
void main() {
  initSky();
  float edge = clamp(1.0 - (abs(vSide) - 1.0) * 1.0, 0.0, 1.0);   // 1 inside, falls over the margin
  edge = smoothstep(0.0, 1.0, edge);
  vec3 L = normalize(uSunDir);
  vec3 bg = plateAt();
  if (vKind > 1.5) {
    // the orbital ring: sunlit thread at infinity. Brightest toward the sun; the Earth's shadow cuts it.
    vec3 P = vDir * 1.2e7;                                // the ring's real distance scale (m), observer at the origin
    vec3 C = vec3(0.0, -6371000.0, 0.0);
    vec3 v = P - C; float along = dot(v, L); float perp = length(v - along * L);
    float lit = 1.0 - (1.0 - smoothstep(6371000.0 * 0.995, 6371000.0 * 1.04, perp)) * (1.0 - smoothstep(-2e5, 2e5, along));
    float el = vDir.y;
    float horizon = smoothstep(0.004, 0.03, el);          // behind the far land and the cloud floor
    float fwd = pow(max(dot(normalize(vDir), L), 0.0), 6.0);
    vec3 sunW = vec3(1.0, 0.95, 0.88);
    float k = uRing * (0.55 + 2.2 * fwd) * lit * horizon * edge * vAlpha * (1.0 - uFog);
    float vis = filmVisible(cameraPosition + vDir * 2.0e5);
    outColor = vec4(sunW * k * 0.075 * vis, 0.0);
    return;
  }
  float vis = filmVisible(vWorld);
  float d = length(vWorld - cameraPosition);
  float a = edge * vAlpha * vis;
  vec3 c;
  if (vKind > 0.5) {
    // the tether: faint against the sky; one bright stretch where the cable mirrors the sun (where the
    // view's elevation matches the sun's); lit above the Earth's shadow; thins away with height
    vec3 V = normalize(vWorld - cameraPosition);
    float elV = degrees(asin(clamp(V.y, -1.0, 1.0)));
    float glint = exp(-pow((elV - uSunEl) / 1.6, 2.0)) * sunReach(vWorld.y);
    float lit = sunReach(vWorld.y);
    float foot = smoothstep(400.0, 2600.0, vWorld.y);
    float thin = 1.0 - smoothstep(8.0, 42.0, elV);
    vec3 base = mix(bg * 0.94, mix(bg, vec3(1.0, 0.93, 0.84), 0.22), lit);
    c = base + uSunHi / max(max(uSunHi.r, max(uSunHi.g, uSunHi.b)), 0.05) * glint * 0.55;
    a *= foot * thin * uLineFade * uTether;
    c = mix(c, bg, 1.0 - exp(-d * uHaze * 0.25));
  } else {
    // a cable: pale, lit by the sun from its side, hazed with distance
    float sun = sunReach(vWorld.y);
    vec3 col = vec3(0.5) * (uSunCol * 1.1 * sun + mix(gHor, gZen, 0.5) * 0.8);
    c = toSRGB(shoulder(col));
    float h = max(1.0 - exp(-d * uHaze), uFog);
    c = mix(c, bg, h);
    a *= 0.92;
    // close to the lens a cable is no longer a line: at its true width it crosses the frame as a flat pale
    // band (the west film passes 0.7 m from the sky-tram cable's anchor). So it fades out as the lens comes
    // within 8 m of it and is gone at 6.5 m. d is the distance from the lens to the cable's centre line here,
    // so turning or zooming the lens changes nothing, and beyond 8 m the factor is exactly 1: the west film's
    // first frame, 8.7 m from the anchor, is drawn as before, and the cable is never seen much wider than there.
    a *= smoothstep(6.5, 8.0, d);
  }
  if (a < 0.003) discard;
  outColor = vec4(c * a, a);
}`,ie=`
in vec3 position;
uniform mat4 uCamWorld; uniform mat4 uInvProj;
out vec3 vRay;
void main() {
  vec4 v = uInvProj * vec4(position.xy, 1.0, 1.0);
  vRay = (uCamWorld * vec4(v.xyz / v.w, 0.0)).xyz;
  gl_Position = vec4(position.xy, 0.0, 1.0);
}`,ae=`
in vec3 vRay;
uniform vec3 cameraPosition; uniform vec4 uTw[12]; uniform float uTwBase[12]; uniform int uTwN; uniform float uShadow;
out vec4 outColor;
void main() {
  vec3 dir = normalize(vRay);
  vec2 sz = filmAt(cameraPosition + dir * 1000.0);
  vec3 P;
  if (sz.x <= 1e-6) {
    // no surface in the film's depth: the cloud deck (a volume) or the sky; meet the deck's top
    if (dir.y > -0.004) discard;
    P = cameraPosition + dir * ((uDeck + 25.0 - cameraPosition.y) / dir.y);
  } else P = cameraPosition + dir * 1000.0 * (1.0 / sz.x) / sz.y;
  vec3 L = normalize(uSunDir);
  float sh = 0.0, ao = 0.0;
  vec2 Lh = L.xz; float Lh2 = max(dot(Lh, Lh), 1e-4);
  for (int i = 0; i < 12; i++) {
    if (i >= uTwN) break;
    vec4 T = uTw[i];                                    // x, z, radius, top y
    vec2 rel = T.xy - P.xz;
    float t = dot(rel, Lh) / Lh2;                       // along the sun ray (3D units of L)
    float hy = P.y + t * L.y;
    float dist = length(P.xz + Lh * t - T.xy);
    float pen = T.z * 0.25 + t * 0.035;
    float s = (1.0 - smoothstep(T.z - pen, T.z + pen, dist)) * step(0.0, t) * smoothstep(T.w + 8.0, T.w - 30.0, hy) * smoothstep(uTwBase[i] - 30.0, uTwBase[i] + 10.0, hy);
    sh = max(sh, s * (1.0 - smoothstep(600.0, 2600.0, t)));
    float r = length(rel);
    ao = max(ao, (1.0 - smoothstep(T.z * 0.8, T.z + 110.0, r)) * (1.0 - smoothstep(0.0, 70.0, P.y - uTwBase[i])));
  }
  float d = length(P - cameraPosition);
  float k = uShadow * (1.0 - smoothstep(4000.0, 9000.0, d));
  vec3 m = mix(vec3(1.0), vec3(0.78, 0.84, 0.94), sh * k);
  m *= mix(1.0, 0.86, ao * k);
  outColor = vec4(m, 1.0);
}`;function le(o){return{uPlate:o.light.uPlate,uResolution:o.light.uResolution,uDepth:{value:null},uTile:{value:new y.Vector2},uGrid:{value:new y.Vector2(160,90)},uSMax:{value:0},uOcc:{value:0},uViewK:{value:new y.Matrix4},uSrcK:{value:new y.Vector4(1,1,0,0)},uSunDir:{value:new y.Vector3(0,1,0)},uSunCol:{value:new y.Vector3(1,1,1)},uSunHi:{value:new y.Vector3(1,.9,.8)},uAmb:{value:new y.Vector3(.4,.42,.5)},uSkyHor:{value:new y.Vector3(.7,.68,.62)},uSkyZen:{value:new y.Vector3(.35,.45,.6)},uGround:{value:new y.Vector3(.2,.2,.18)},uSunEl:{value:10},uExposure:{value:1},uHaze:{value:1e-4},uFog:{value:0},uDeck:{value:-1e5},uDeckSoft:{value:30},uWindows:{value:0},uTime:{value:0},uShadeY:{value:0},uLowFog:{value:0},uLowY:{value:0},uLocalDeck:{value:0},uSkyUV:{value:new y.Vector4(.5,.6,.5,.95)},uSkyPlate:{value:1}}}function q(o,e,t,s={}){return new y.RawShaderMaterial({glslVersion:y.GLSL3,uniforms:o,vertexShader:e,fragmentShader:J+t,...s})}const ce=o=>q(o,Q,$,{side:y.DoubleSide}),ue=o=>q(o,ee,te,{transparent:!0,depthWrite:!1,blending:y.AdditiveBlending}),fe=(o,e={})=>q({...o,uLineFade:{value:1},uRing:{value:1},uTether:{value:1},...e},oe,ne,{transparent:!0,depthWrite:!1,blending:y.CustomBlending,blendSrc:y.OneFactor,blendDst:y.OneMinusSrcAlphaFactor,side:y.DoubleSide}),ve=(o,e={})=>q({...o,uCamWorld:{value:new y.Matrix4},uInvProj:{value:new y.Matrix4},uTw:{value:Array.from({length:12},()=>new y.Vector4)},uTwBase:{value:new Array(12).fill(0)},uTwN:{value:0},uShadow:{value:1},...e},ie,ae,{transparent:!0,depthTest:!1,depthWrite:!1,blending:y.CustomBlending,blendSrc:y.DstColorFactor,blendDst:y.ZeroFactor});function he(){const o=new y.BufferGeometry;return o.setAttribute("position",new y.Float32BufferAttribute([-1,-1,0,3,-1,0,-1,3,0],3)),o}function re(o){let e=o*2654435761>>>0;return()=>{e=e+1831565813>>>0;let t=e;return t=Math.imul(t^t>>>15,t|1),t^=t+Math.imul(t^t>>>7,t|61),((t^t>>>14)>>>0)/4294967296}}class pe{constructor(){this.P=[],this.N=[],this.A=[]}v(e,t,s){this.P.push(e[0],e[1],e[2]),this.N.push(t[0],t[1],t[2]),this.A.push(s[0],s[1],s[2],s[3])}tri(e,t,s,n,m,a,c,b,x){this.v(e,n,c),this.v(t,m,b),this.v(s,a,x)}loft(e,{ox:t=0,oz:s=0,oy:n=0,yaw:m=0,zone:a=1,smooth:c=!1,id:b=0,top:x=null,capZone:S=0,capBottom:z=-1}={}){const M=Math.cos(m),P=Math.sin(m),g=e.map(v=>v.pts.map(([w,l])=>[t+w*M+l*P,n+v.y,s-w*P+l*M])),r=e[0].pts.length,u=x??n+e[e.length-1].y,f=g.map(v=>{let w=0,l=0;for(const h of v)w+=h[0],l+=h[2];return[w/r,l/r]}),d=typeof a=="function"?a:()=>a;for(let v=0;v+1<g.length;v++){const w=g[v],l=g[v+1],h=d(v);if(h<0)continue;let R=0;const A=[0];for(let D=0;D<r;D++){const F=w[D],W=w[(D+1)%r];R+=Math.hypot(W[0]-F[0],W[2]-F[2]),A.push(R)}for(let D=0;D<r;D++){const F=(D+1)%r,W=w[D],p=w[F],k=l[F],T=l[D];let L;{const B=[p[0]-W[0],p[1]-W[1],p[2]-W[2]],V=[T[0]-W[0],T[1]-W[1],T[2]-W[2]];L=[B[1]*V[2]-B[2]*V[1],B[2]*V[0]-B[0]*V[2],B[0]*V[1]-B[1]*V[0]];const Z=(W[0]+p[0])/2-f[v][0],H=(W[2]+p[2])/2-f[v][1];L[0]*Z+L[2]*H<0&&(L=L.map(Y=>-Y));const E=Math.hypot(...L)||1;L=L.map(Y=>Y/E)}const G=(B,V)=>{const Z=B[0]-f[V][0],H=B[2]-f[V][1],E=Math.hypot(Z,H)||1;return[Z/E,L[1],H/E]},_=c?G(W,v):L,U=c?G(p,v):L,O=c?G(k,v+1):L,X=c?G(T,v+1):L,I=[h,b,A[D],u],K=[h,b,A[D+1],u];this.tri(W,p,k,_,U,O,I,K,K),this.tri(W,k,T,_,O,X,I,K,I)}}const i=(v,w,l,h)=>{const R=[f[w][0],v[0][1],f[w][1]],A=h?[0,1,0]:[0,-1,0];for(let D=0;D<r;D++){const F=[l,b,0,u];this.tri(R,v[D],v[(D+1)%r],A,A,A,F,F,F)}};return S>=0&&i(g[g.length-1],g.length-1,S,!0),z>=0&&i(g[0],0,z,!1),this}box(e,t,s,n,m,a,c=0,b=0,x=0){const S=[[-n/2,-a/2],[n/2,-a/2],[n/2,a/2],[-n/2,a/2]];return this.loft([{y:-m/2,pts:S},{y:m/2,pts:S}],{ox:e,oy:t,oz:s,yaw:c,zone:b,id:x,capZone:b,capBottom:b,top:t+m/2+1e4})}tree(e,t,s,n,m,a=0){const b=[[0,0],[.75,.18],[1,.5],[.78,.8],[0,1]],x=[2,a,0,t+m+1e4],S=a*.37%1,z=g=>{const[r,u]=b[g],f=[];for(let d=0;d<8;d++){const i=(d+S)/8*Math.PI*2;f.push([e+Math.cos(i)*n*r,t+m*u,s+Math.sin(i)*n*r])}return f},M=(g,r)=>{const[u,f]=b[r],d=g[0]-e,i=g[2]-s,v=Math.hypot(d,i)||1,w=(f-.5)*2,l=[d/v*(1-Math.abs(w)*.6),w,i/v*(1-Math.abs(w)*.6)],h=Math.hypot(...l)||1;return l.map(R=>R/h)},P=b.map((g,r)=>z(r));for(let g=0;g+1<b.length;g++)for(let r=0;r<8;r++){const u=(r+1)%8,f=P[g][r],d=P[g][u],i=P[g+1][u],v=P[g+1][r];this.tri(f,d,i,M(f,g),M(d,g),M(i,g+1),x,x,x),this.tri(f,i,v,M(f,g),M(i,g+1),M(v,g+1),x,x,x)}return this}geometry(){const e=new y.BufferGeometry;return e.setAttribute("position",new y.Float32BufferAttribute(this.P,3)),e.setAttribute("normal",new y.Float32BufferAttribute(this.N,3)),e.setAttribute("attr",new y.Float32BufferAttribute(this.A,4)),e.computeBoundingSphere(),e}}function N(o,e,t=.2,s=2){const n=t*Math.min(o,e),m=[],a=[[o/2-n,e/2-n,0],[-o/2+n,e/2-n,1],[-o/2+n,-e/2+n,2],[o/2-n,-e/2+n,3]];for(const[c,b,x]of a)for(let S=0;S<=s;S++){const z=(x+S/s)*Math.PI/2;m.push([c+Math.cos(z)*n,b+Math.sin(z)*n])}return m}function se(o,e=20){const t=[];for(let s=0;s<e;s++){const n=s/e*Math.PI*2;t.push([Math.cos(n)*o,Math.sin(n)*o])}return t}const C=(o,e=1,t=0,s=0,n=0,m=e)=>{const a=Math.cos(t),c=Math.sin(t);return o.map(([b,x])=>[s+(b*a-x*c)*e,n+(b*c+x*a)*m])};function j(o,e,t,s,n,m,a,c,b=1,x=1){const S=Math.cos(m),z=Math.sin(m),M=e.length;for(let P=0;P<M;P++){const[g,r]=e[P],[u,f]=e[(P+1)%M],d=Math.hypot(u-g,f-r),i=Math.floor(d/8*b);for(let v=0;v<i;v++){if(c()<.22)continue;const w=(v+.5+(c()-.5)*.8)/i,l=.8+c()*.12,h=(g+(u-g)*w)*l,R=(r+(f-r)*w)*l;o.tree(t+h*S+R*z,s,n-h*z+R*S,(3.4+c()*2.2)*x,(6+c()*6)*x,a+v)}}}function me(o,e){const t=re(e.seed||1),s=e.seed||1,n=e.base??0,m=e.h,a=e.w,c=e.yaw||0,x=-(e.bury??120),S=n+m,z={ox:e.x,oz:e.z,oy:n,yaw:c,id:s},M=(r,u)=>u.map(f=>({y:f,pts:r(f)})),P=(r,u,f)=>{const d=[];for(let i=r;i<u;i+=f)d.push(i);return d.push(u),d};let g=S;if(e.type==="twist"){const r=(.7+t()*.45)*(t()<.5?-1:1),u=.62+t()*.1,f=.84+t()*.14,d=m*.9,i=l=>1-(1-u)*Math.pow(l,1.15),v=l=>{const h=Math.max(0,l)/m;return C(N(a,a*f,.14,2),i(h),r*h)};o.loft(M(v,P(x,d,20)),{...z,zone:1,capZone:-1});const w=[];for(let l=0;l<=4;l++){const h=d+(m-d)*(l/4),R=h/m;w.push({y:h,pts:C(N(a,a*f,.14+l*.05,2),i(R)*(1-.28*Math.pow(l/4,1.6)),r*R)})}o.loft(w,{...z,zone:l=>l<3?1:0,capZone:0,top:S})}else if(e.type==="stepped"){const r=3+(t()<.5?1:0),u=.82+t()*.15;let f=x,d=1,i=[],v=m;for(let w=0;w<r;w++){const l=w===r-1?1:.34+t()*.12-w*.04;i.push(v*l),v-=v*l}for(let w=0;w<r;w++){const l=w===0?x:f,h=(w===0?0:f)+i[w],R=C(N(a,a*u,.16,2),d,w*.04);o.loft(M(()=>R,P(l,h,40)),{...z,zone:(w%2,1),capZone:2,top:n+h+2}),o.loft([{y:h-2.2,pts:C(R,1.012)},{y:h+1,pts:C(R,1.012)}],{...z,zone:0,capZone:-1,top:n+h+2}),w<r-1&&j(o,R,e.x,n+h,e.z,c,s,t,1),f=h,d*=.76-t()*.06}g=n+f,j(o,C(N(a,a*u,.16,2),d/.73,.04*(r-1)),e.x,n+f,e.z,c,s,t,.6)}else if(e.type==="slab"){const r=a*(.3+t()*.08),u=m*(.5+t()*.12),f=u+m*(.16+t()*.06),d=a*(.3+t()*.1),i=N(a,r,.3,2);o.loft(M(()=>i,P(x,u,40)),{...z,zone:1,capZone:2});const v=(a-d)/2;for(const h of[-1,1]){const R=C(N(v,r,.3,2),1,0,h*(d/2+v/2),0);o.loft(M(()=>R,P(u,f,30)),{...z,zone:1,capZone:-1})}o.loft(M(()=>i,P(f,m-6,40)),{...z,zone:1,capZone:-1,capBottom:3}),o.loft([{y:m-6,pts:C(i,.985)},{y:m,pts:C(i,.985)}],{...z,zone:0,capZone:2,top:S});const w=Math.cos(c),l=Math.sin(c);for(let h=0;h<4;h++){const R=(t()-.5)*d*.8,A=(t()-.5)*r*.6;o.tree(e.x+R*w+A*l,n+u,e.z-R*l+A*w,4+t()*2,9+t()*6,s)}j(o,i,e.x,S,e.z,c,s,t,.7)}else if(e.type==="bundle"){const r=3+(t()<.6?1:0),u=a*.3,f=r===3?[[-.55,-.3],[.55,-.3],[0,.6]]:[[-.5,-.5],[.5,-.5],[.5,.5],[-.5,.5]],d=f.map((i,v)=>m*(v===0?1:.62+t()*.3));f.forEach(([i,v],w)=>{const l=u*(.85+t()*.3),h=d[w],R=se(l,18),A=i*u*1.25,D=v*u*1.25,F=C(R,1,0,A,D);o.loft(M(()=>F,P(x,h-l*.5,30)),{...z,zone:1,smooth:!0,capZone:-1,top:n+h});const W=[];for(let p=0;p<=4;p++){const k=p/4*Math.PI/2;W.push({y:h-l*.5+Math.sin(k)*l*.5,pts:C(R,Math.cos(k)*.98+.02,0,A,D)})}o.loft(W,{...z,zone:0,smooth:!0,capZone:0,top:n+h})})}else if(e.type==="diagonal"){const r=a*(.72+t()*.15),u=m*(.12+t()*.06),f=t()<.5?-1:1,d=m-u,i=N(a,r,.12,1);o.loft(M(()=>i,P(x,d,30)),{...z,zone:1,capZone:-1});const v=i.length,w=i.map(([p,k])=>[p,k]),l=[];for(const[p,k]of w)l.push(d+u*(.5+f*p/a));const h=Math.cos(c),R=Math.sin(c),A=(p,k,T)=>[e.x+p*h+T*R,n+k,e.z-p*R+T*h];let D=0;for(let p=0;p<v;p++){const k=(p+1)%v,T=A(i[p][0],d,i[p][1]),L=A(i[k][0],d,i[k][1]),G=A(i[k][0],l[k],i[k][1]),_=A(i[p][0],l[p],i[p][1]),U=(i[p][0]+i[k][0])/2,O=(i[p][1]+i[k][1])/2,X=Math.hypot(U,O)||1,I=i[k][0]-i[p][0],K=i[k][1]-i[p][1],B=Math.hypot(I,K)||1;let V=K/B,Z=-I/B;V*U+Z*O<0&&(V=-V,Z=-Z);const H=[V*h+Z*R,0,-V*R+Z*h],E=[1,s,D,S],Y=[1,s,D+B,S];o.tri(T,L,G,H,H,H,E,Y,Y),o.tri(T,G,_,H,H,H,E,Y,E),D+=B}const F=(()=>{const p=-f*u/a,k=Math.hypot(p,1);return[p/k*h,1/k,-p/k*R]})(),W=A(0,d+u*.5,0);for(let p=0;p<v;p++){const k=(p+1)%v,T=[0,s,0,S];o.tri(W,A(i[p][0],l[p],i[p][1]),A(i[k][0],l[k],i[k][1]),F,F,F,T,T,T)}}else{const r=a*(.6+t()*.15),u=m*.68,f=N(a,r,.2,2),d=C(N(a*.62,r*.8,.25,2),1,0,a*.12,0);o.loft(M(()=>f,P(x,u,30)),{...z,zone:1,capZone:2,top:n+u+2}),o.loft([{y:u-2,pts:C(f,1.01)},{y:u+1.2,pts:C(f,1.01)}],{...z,zone:0,capZone:-1,top:n+u+2}),j(o,f,e.x,n+u,e.z,c,s,t,1.3),j(o,C(f,.75),e.x,n+u,e.z,c,s,t,.8),o.loft(M(()=>d,P(u,m,30)),{...z,zone:1,capZone:2}),j(o,d,e.x,S,e.z,c,s,t,1)}return{top:S,crownY:g,r:a*.5,crown:[e.x,S,e.z]}}function de(o,e,t,{width:s=10,depth:n=8,arch:m=.02,id:a=0}={}){const c=t[0]-e[0],b=t[2]-e[2],x=Math.hypot(c,b),S=Math.atan2(-b,c),z=10,M=Math.cos(S),P=Math.sin(S),g=u=>[e[0]+c*u,e[1]+(t[1]-e[1])*u+m*x*4*u*(1-u),e[2]+b*u],r=[[-1.6,0,s,0],[0,n,s*.92,4],[n,n+1.1,s,0]];for(const[u,f,d,i]of r){let v=0;for(let w=0;w<z;w++){const l=g(w/z),h=g((w+1)/z),R=x/z;for(const A of[-1,1]){const D=P*A*d/2,F=M*A*d/2,W=[P*A,0,M*A],p=(L,G)=>[L[0]+D,L[1]+G,L[2]+F],k=[i,a,v,1e5],T=[i,a,v+R,1e5];o.tri(p(l,u),p(h,u),p(h,f),W,W,W,k,T,T),o.tri(p(l,u),p(h,f),p(l,f),W,W,W,k,T,k)}for(const[A,D]of[[f,1],[u,-1]]){const F=[0,D,0],W=[i===4?0:i,a,0,1e5],p=[l[0]+P*d/2,l[1]+A,l[2]+M*d/2],k=[l[0]-P*d/2,l[1]+A,l[2]-M*d/2],T=[h[0]+P*d/2,h[1]+A,h[2]+M*d/2],L=[h[0]-P*d/2,h[1]+A,h[2]-M*d/2];o.tri(p,k,L,F,F,F,W,W,W),o.tri(p,L,T,F,F,F,W,W,W)}v+=x/z}}return{mid:g(.5),at:g}}function xe(o,e,t,s,n,m=0,a=0,c=6){const b=Math.max(1.2,n*.05),x=b*.5;return o.loft([{y:-c,pts:N(b,b,.3,1)},{y:n,pts:N(x,x,.3,1)}],{ox:e,oy:t,oz:s,yaw:m,zone:0,id:a,capZone:0,top:t+n+1e4}),o.loft([{y:n,pts:N(x*1.5,x*4.2,.45,2)},{y:n+x*1.1,pts:N(x*1.2,x*3.6,.45,2)}],{ox:e,oy:t,oz:s,yaw:m+Math.PI/2,zone:0,id:a,capZone:0,top:t+n+1e4}),[e,t+n+x*1.2,s]}function we(o,e){const t=new y.InstancedBufferGeometry;t.setAttribute("position",new y.Float32BufferAttribute([-1,-1,0,1,-1,0,1,1,0,-1,-1,0,1,1,0,-1,1,0],3));const s=new y.InstancedBufferAttribute(new Float32Array(e*4),4),n=new y.InstancedBufferAttribute(new Float32Array(e*4),4);s.setUsage(y.DynamicDrawUsage),n.setUsage(y.DynamicDrawUsage),t.setAttribute("iPos",s),t.setAttribute("iCol",n),t.instanceCount=e;const m=new y.Mesh(t,o);return m.frustumCulled=!1,m.renderOrder=3,{mesh:m,n:e,set(a,c,b,x,S){a>=e||(s.setXYZW(a,c[0],c[1],c[2],b),n.setXYZW(a,x[0],x[1],x[2],S),s.needsUpdate=n.needsUpdate=!0)}}}function ye(o){const e=[],t=[],s=[],n=[],m=[];let a=0;for(const b of o){const x=b.pts,S=x.length;for(let z=0;z<S;z++){const M=x[z],P=x[Math.max(0,z-1)],g=x[Math.min(S-1,z+1)];for(const r of[-1,1])e.push(M[0],M[1],M[2]),t.push(P[0],P[1],P[2]),s.push(g[0],g[1],g[2]),n.push(r,b.width,z/(S-1),b.kind);if(z+1<S){const r=a+z*2;m.push(r,r+1,r+3,r,r+3,r+2)}}a+=S*2}const c=new y.BufferGeometry;return c.setAttribute("position",new y.Float32BufferAttribute(e,3)),c.setAttribute("prev",new y.Float32BufferAttribute(t,3)),c.setAttribute("next",new y.Float32BufferAttribute(s,3)),c.setAttribute("rib",new y.Float32BufferAttribute(n,4)),c.setIndex(m),c.boundingSphere=new y.Sphere(new y.Vector3,1e9),c}function ge(o,e,t=.03,s=24){const n=Math.hypot(e[0]-o[0],e[2]-o[2]),m=[];for(let a=0;a<=s;a++){const c=a/s;m.push([o[0]+(e[0]-o[0])*c,o[1]+(e[1]-o[1])*c-4*t*n*c*(1-c),o[2]+(e[2]-o[2])*c])}return m}export{pe as Builder,xe as addPylon,de as addSkyBridge,me as addTower,ge as catenary,se as circle,he as fullScreenGeometry,ue as lightMaterial,we as lightsMesh,le as makeShared,ye as ribbonGeometry,fe as ribbonMaterial,re as rng,N as rrect,ve as shadowMaterial,ce as solidMaterial};
