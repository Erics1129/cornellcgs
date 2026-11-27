import*as o from"three";const a=Object.freeze({blue:"#3F78D0",violet:"#6F5FC7",teal:"#2FA6A0",green:"#4C9B63",yellow:"#EDB43C",coral:"#E8674C",carnelian:"#B8372C"}),h=Object.freeze([a.blue,a.coral,a.teal,a.yellow,a.violet,a.green,a.carnelian]),m="#EFE9DC",f="#FBF8F1",d="#211F1C",p="#3B2E26",v="#8A857C",x="#4A3F36",s="#FFE7BE",y="#B9A88F",w=[.5,.55,.66],c=Object.freeze(["ink","soft","paper"]),g=e=>Math.max(0,c.indexOf(e)),b=Object.freeze({silhouette:2.75,inner:1.35,rim:1.5}),u=e=>e&&e.isColor?e.clone():Array.isArray(e)?new o.Color(e[0],e[1],e[2]):new o.Color(e);function S(){return{uKeyDir:{value:new o.Vector3(-.55,.62,.56).normalize()},uKeyTint:{value:new o.Color(.985,.955,.885)},uShadeTint:{value:new o.Color(.74,.76,.9)},uRimColor:{value:u(s)},uBounce:{value:new o.Color(.3,.45,.18)},uBounceAmt:{value:0},uHazeColor:{value:new o.Color(.8,.78,.74)},uHazeDensity:{value:0},uStyle:{value:0},uPx:{value:1},uLineScale:{value:1},uPlate:{value:null},uPlateOn:{value:0},uPlateMap:{value:new o.Vector4(1,1,0,0)},uResolution:{value:new o.Vector2(1,1)}}}const L=`
uniform vec3 uKeyDir;
uniform vec3 uKeyTint;
uniform vec3 uShadeTint;
uniform vec3 uRimColor;
uniform vec3 uBounce;
uniform float uBounceAmt;
uniform vec3 uHazeColor;
uniform float uHazeDensity;
uniform float uStyle;
uniform float uPx;
uniform float uLineScale;
uniform sampler2D uPlate;
uniform float uPlateOn;
uniform vec4 uPlateMap;
uniform vec2 uResolution;

float hash13(vec3 p) { p = fract(p * 0.1031); p += dot(p, p.zyx + 31.32); return fract((p.x + p.y) * p.z); }
float vnoise(vec3 p) {
  vec3 i = floor(p), f = fract(p); f = f * f * (3.0 - 2.0 * f);
  float a = mix(mix(hash13(i), hash13(i + vec3(1,0,0)), f.x), mix(hash13(i + vec3(0,1,0)), hash13(i + vec3(1,1,0)), f.x), f.y);
  float b = mix(mix(hash13(i + vec3(0,0,1)), hash13(i + vec3(1,0,1)), f.x), mix(hash13(i + vec3(0,1,1)), hash13(i + vec3(1,1,1)), f.x), f.y);
  return mix(a, b, f.z);
}
float fbm(vec3 p) { return 0.55 * vnoise(p) + 0.3 * vnoise(p * 2.03 + 7.1) + 0.15 * vnoise(p * 4.1 + 3.7); }
`,k=`
vec3 shoulder(vec3 c) {
  vec3 k = max(c - 0.86, 0.0);
  return min(c, 0.86) + 0.14 * (1.0 - exp(-k / 0.14));
}
vec3 srgbToLin(vec3 c) { return pow(max(c, 0.0), vec3(2.2)); }
vec3 plateAt(vec2 fc, float lod) {
  vec2 uv = fc / uResolution * uPlateMap.xy + uPlateMap.zw;
  return srgbToLin(textureLod(uPlate, clamp(uv, 0.002, 0.998), lod).rgb);
}
// A per-call adjustment of the shade colour (the cube's clay sets it warmer).
vec3 gShade = vec3(1.0);
// How far lightBox pushes the shade's saturation (clay stays near neutral, colours stay vivid).
float gSat = 1.2;
// Lower saturation (paper style: matte paint).
vec3 desat(vec3 c, float k) { float l = dot(c, vec3(0.2126, 0.7152, 0.0722)); return mix(c, vec3(l), k); }

// base: albedo (linear). N, V: world normal and direction to the eye. occl: 0..1 ambient
// occlusion (1 open). trans: light through thin paper. grain: 0..1 surface texture.
// rimK: how much warm rim this surface takes (0..1).
vec3 lightPlayer(vec3 base, vec3 N, vec3 V, float occl, float trans, float grain, float rimK) {
  vec3 L = uKeyDir;
  float ndl = dot(N, L);
  float ndv = clamp(dot(N, V), 0.0, 1.0);
  vec3 lit = base * uKeyTint;
  vec3 shade = base * uShadeTint * gShade;
  float d;
  vec3 col;
  if (uStyle < 0.5) {
    // ink: a hard step, a thin soft edge only to keep it from aliasing
    d = smoothstep(0.0, 0.045, ndl + 0.04);
    shade *= mix(0.86, 1.0, occl);
    col = mix(shade, lit, d * mix(0.6, 1.0, occl));
  } else if (uStyle < 1.5) {
    // soft: wrapped and smooth, a little warmth at the terminator, soft occlusion
    float w = clamp((ndl + 0.5) / 1.5, 0.0, 1.0);
    d = w * w * (3.0 - 2.0 * w);
    col = mix(shade, lit, d);
    col += base * uKeyTint * vec3(0.05, 0.02, -0.01) * smoothstep(0.15, 0.45, d) * (1.0 - smoothstep(0.45, 0.8, d));
    col *= mix(0.72, 1.0, occl);
  } else {
    // paper: matte, a low-contrast step, a little tooth
    d = smoothstep(-0.35, 0.55, ndl);
    col = mix(shade * 1.04, lit * 0.985, d);
    col *= mix(0.8, 1.0, occl) * (0.955 + 0.075 * grain);
  }
  // bounce from the ground below (a lawn tints the undersides green)
  col += base * uBounce * uBounceAmt * clamp(-N.y * 0.8 + 0.2, 0.0, 1.0);
  // light through thin paper when the sun is behind it
  col += base * uKeyTint * trans * max(-ndl, 0.0) * 0.12;
  // the warm sun rim: grazing surfaces that face the sun
  float rimS = uStyle < 0.5 ? 0.75 : uStyle < 1.5 ? 1.0 : 0.45;
  float g = smoothstep(uStyle < 1.5 ? 0.5 : 0.62, 0.92, 1.0 - ndv);   // grazing only: an edge, not a face
  float rim = g * smoothstep(0.05, 0.55, ndl) * rimK * rimS;
  col = mix(col, max(col, uRimColor * mix(0.92, 1.05, d)), clamp(rim, 0.0, 1.0));
  return col;
}
// The cube on a plate: the plate's sun, face by face (the director's notes for a box on a lawn).
// The face that looks most into the sun is the brightest; the top takes the sky (a touch cooler);
// the shade side is about a third darker than the lit side and cooler, but kept saturated; the
// lower rows pick up the lawn (bounceK: 0..1, high near the ground); the warm rim only where rimK
// says (the cube's own edges toward the sun). ink keeps its two-tone step, soft and paper wrap.
// NL: the normal the light is judged by (the cube's own face, so a whole face is lit or shaded,
// bevels included); N: the surface's own normal (for the rim).
vec3 lightBox(vec3 base, vec3 N, vec3 NL, vec3 V, float occl, float grain, float rimK, float bounceK) {
  vec3 L = uKeyDir;
  float ndl = dot(NL, L);
  float ndv = clamp(dot(N, V), 0.0, 1.0);
  float lum0 = dot(uShadeTint, vec3(0.2126, 0.7152, 0.0722));
  vec3 sky = uShadeTint / max(lum0, 1e-3);                     // the sky's hue at unit luminance
  float facing = smoothstep(0.12, 0.88, ndl);                  // how squarely a lit face meets the sun
  float top = smoothstep(0.55, 0.95, NL.y);
  vec3 lit = base * uKeyTint * mix(0.80, 1.0, facing);
  lit = mix(lit, lit * mix(vec3(1.0), sky, 0.45), top * (1.0 - 0.5 * facing));
  vec3 shade = base * uShadeTint * gShade * 0.64;               // about half the lit light (a third darker to the eye)
  shade *= mix(1.0, 1.10, top);                                // a shaded top still sees the whole sky
  float sl = dot(shade, vec3(0.2126, 0.7152, 0.0722));
  shade = max(mix(vec3(sl), shade, gSat), vec3(0.0));           // cooler and darker, never grey
  float d;
  vec3 col;
  if (uStyle < 0.5) {
    d = smoothstep(0.0, 0.045, ndl + 0.04);
    shade *= mix(0.86, 1.0, occl);
    col = mix(shade, lit, d * mix(0.6, 1.0, occl));
  } else if (uStyle < 1.5) {
    float w = clamp((ndl + 0.5) / 1.5, 0.0, 1.0);
    d = w * w * (3.0 - 2.0 * w);
    col = mix(shade, lit, d);
    col += base * uKeyTint * vec3(0.05, 0.02, -0.01) * smoothstep(0.15, 0.45, d) * (1.0 - smoothstep(0.45, 0.8, d));
    col *= mix(0.72, 1.0, occl);
  } else {
    d = smoothstep(-0.4, 0.6, ndl);
    col = mix(shade * 1.04, lit * 0.985, d);
    col *= mix(0.8, 1.0, occl) * (0.955 + 0.075 * grain);
  }
  // the lawn's light from below, on the lower rows (more in shade, where the sun does not drown it)
  vec3 bounce = uBounce / max(dot(uBounce, vec3(0.2126, 0.7152, 0.0722)), 1e-3);
  float side = 1.0 - abs(NL.y);
  col += base * bounce * (0.05 + 0.10 * (1.0 - d)) * bounceK * side;
  // the warm sun rim: grazing surfaces that face the sun, only on the edges the caller allows
  float rimS = uStyle < 0.5 ? 0.75 : uStyle < 1.5 ? 1.0 : 0.45;
  float g = smoothstep(uStyle < 1.5 ? 0.5 : 0.62, 0.92, 1.0 - ndv);
  float rim = g * smoothstep(0.05, 0.55, dot(N, L)) * rimK * rimS;
  col = mix(col, max(col, uRimColor * mix(0.92, 1.05, d)), clamp(rim, 0.0, 1.0));
  return col;
}
vec3 haze(vec3 col, float dist) {
  float k = 1.0 - exp(-uHazeDensity * dist);
  if (k <= 0.0) return col;
  vec3 hc = uPlateOn > 0.5 ? mix(uHazeColor, plateAt(gl_FragCoord.xy, 6.0), 0.85) : uHazeColor;
  return mix(col, hc, k);
}
`;function C(e,t){const r=e.fov*Math.PI/180,l=e.zoom||1,i=e.view&&e.view.enabled?t*e.view.fullHeight/e.view.height:t;return 2*Math.tan(r/2)/l/i}function T(e){e.traverse(t=>{t.geometry&&t.geometry.dispose();const r=Array.isArray(t.material)?t.material:t.material?[t.material]:[];for(const l of r){for(const i in l.uniforms||{}){const n=l.uniforms[i]&&l.uniforms[i].value;n&&n.isTexture&&i!=="uPlate"&&n.dispose()}l.dispose()}})}export{L as GLSL_COMMON,k as GLSL_FRAG,d as INK,x as INTERIOR,b as LINE,p as OUTLINE_INK,a as PALETTE,f as PAPER,v as PENCIL,h as PLAYER_COLOURS,s as RIM,w as SHADOW_FILM,y as SHADOW_PAPER,c as STYLES,m as UNCOLOURED,T as disposeTree,u as lin,S as makeLightUniforms,C as pxScale,g as styleIndex};
