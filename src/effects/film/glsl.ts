/**
 * film/glsl.ts — the shared look, as GLSL. Every scene shader ends in film():
 * exposure, tone map, grade (ASC CDL), sRGB curve, 1 LSB triangular dither.
 *
 * Rules that go with it (SPEC.md 4.2 and its amendments):
 * - film() returns rgb only. The scene keeps its own alpha and premultiplies itself.
 * - film() runs once, in the scene's final full-screen pass, never per blended sprite.
 * - No vignette and no grain in here: the lens (FilmLens.tsx) owns both, in viewport space.
 * - u_fTone 0 = AgX (synthetic scenes in linear light), 1 = Khronos PBR Neutral,
 *   2 = none (photographs and rendered plates are already display referred:
 *   a second tone curve would only dull their whites).
 *
 * tonemapAgX and tonemapNeutral: constants and structure follow three.js
 * (src/renderers/shaders/ShaderChunk/tonemapping_pars_fragment.glsl.js),
 * which is MIT licensed, Copyright (c) 2010-2025 three.js authors. AgX is
 * Benjamin Wrensch's minimal fit of Troy Sobotka's AgX; Neutral is the
 * Khronos PBR Neutral tone mapper.
 */
export function filmChunk(version: 100 | 300): string {
  const glow =
    version === 300
      ? `vec3 mipGlow(sampler2D tex, vec2 uv, float lod0, float lod1) {
  return 0.6 * textureLod(tex, uv, lod0).rgb + 0.4 * textureLod(tex, uv, lod1).rgb;
}`
      : `vec3 mipGlow(sampler2D tex, vec2 uv, float lod0, float lod1) {
  return 0.6 * texture2D(tex, uv, lod0).rgb + 0.4 * texture2D(tex, uv, lod1).rgb;
}`
  return `
uniform float u_fExposure;
uniform vec3 u_fSlope;
uniform vec3 u_fOffset;
uniform vec3 u_fPower;
uniform float u_fSat;
uniform float u_fTone;
uniform float u_fSeed;

vec3 srgbToLinear(vec3 c) {
  return mix(c / 12.92, pow((max(c, 0.0) + 0.055) / 1.055, vec3(2.4)), step(0.04045, c));
}
vec3 linearToSrgb(vec3 c) {
  c = max(c, 0.0);
  return mix(c * 12.92, 1.055 * pow(c, vec3(1.0 / 2.4)) - 0.055, step(0.0031308, c));
}
float luma(vec3 c) { return dot(c, vec3(0.2126, 0.7152, 0.0722)); }

vec3 agxCurve(vec3 x) {
  vec3 x2 = x * x;
  vec3 x4 = x2 * x2;
  return 15.5 * x4 * x2 - 40.14 * x4 * x + 31.96 * x4 - 6.868 * x2 * x + 0.4298 * x2 + 0.1191 * x - 0.00232;
}
vec3 tonemapAgX(vec3 c) {
  const mat3 TO2020 = mat3(0.6274, 0.0691, 0.0164, 0.3293, 0.9195, 0.0880, 0.0433, 0.0113, 0.8956);
  const mat3 FROM2020 = mat3(1.6605, -0.1246, -0.0182, -0.5876, 1.1329, -0.1006, -0.0728, -0.0083, 1.1187);
  const mat3 INSET = mat3(0.856627153315983, 0.137318972929847, 0.11189821299995, 0.0951212405381588, 0.761241990602591, 0.0767994186031903, 0.0482516061458583, 0.101439036467562, 0.811302368396859);
  const mat3 OUTSET = mat3(1.1271005818144368, -0.1413297634984383, -0.14132976349843826, -0.11060664309660323, 1.157823702216272, -0.11060664309660294, -0.016493938717834573, -0.016493938717834257, 1.2519364065950405);
  c = INSET * (TO2020 * c);
  c = clamp((log2(max(c, 1e-10)) + 12.47393) / (4.026069 + 12.47393), 0.0, 1.0);
  c = OUTSET * agxCurve(c);
  c = pow(max(vec3(0.0), c), vec3(2.2));
  return clamp(FROM2020 * c, 0.0, 1.0);
}
vec3 tonemapNeutral(vec3 c) {
  const float startCompression = 0.8 - 0.04;
  const float desaturation = 0.15;
  float x = min(c.r, min(c.g, c.b));
  float offset = x < 0.08 ? x - 6.25 * x * x : 0.04;
  c -= offset;
  float peak = max(c.r, max(c.g, c.b));
  if (peak < startCompression) return c;
  float d = 1.0 - startCompression;
  float newPeak = 1.0 - d * d / (peak + d - startCompression);
  c *= newPeak / peak;
  float g = 1.0 - 1.0 / (desaturation * (peak - newPeak) + 1.0);
  return mix(c, vec3(newPeak), g);
}
/* ASC CDL: slope, offset, power per channel, then saturation around luma. */
vec3 cdl(vec3 c, vec3 slope, vec3 offset, vec3 power, float sat) {
  c = pow(max(c * slope + offset, 0.0), power);
  return max(mix(vec3(luma(c)), c, sat), 0.0);
}
/* Interleaved gradient noise (Jimenez 2014). */
float ign(vec2 p) {
  return fract(52.9829189 * fract(0.06711056 * p.x + 0.00583715 * p.y));
}
/* Triangular dither, plus or minus one 8 bit step: hides banding in dark gradients. */
vec3 ditherTri(vec3 c, vec2 fragCoord, float seed) {
  vec2 p = fragCoord + 5.588238 * seed;
  float t = ign(p) + ign(p.yx + 31.7) - 1.0;
  return c + t / 255.0;
}
${glow}
/* Scene light in, display colour out. Always the last thing a scene's final pass does. */
vec3 film(vec3 sceneLinear) {
  vec3 c = max(sceneLinear, 0.0) * u_fExposure;
  if (u_fTone < 0.5) c = tonemapAgX(c);
  else if (u_fTone < 1.5) c = tonemapNeutral(c);
  else c = min(c, 1.0);
  c = cdl(c, u_fSlope, u_fOffset, u_fPower, u_fSat);
  return ditherTri(linearToSrgb(c), gl_FragCoord.xy, u_fSeed);
}
`
}
