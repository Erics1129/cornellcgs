const e={aspect:1.5,anchorX:.52,anchorY:.48,irisX:.577,irisY:.425,desktopWidth:1.1,desktopHeight:2.45,compactWidth:1.31},a=["center","left","right","up","down","quarter","half","threequarter","closed"],s=[[.577,.425],[.467,.438],[.623,.43],[.571,.369],[.57,.525]],r={exposure:1,slope:[1.045,1,.95],offset:[.0015,8e-4,0],power:[1,1,1],sat:.93,tone:2},l={exposure:1,slope:[1,1,1],offset:[0,0,0],power:[1,1,1],sat:1,tone:2};function o(t){return`
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
${t===300?`vec3 mipGlow(sampler2D tex, vec2 uv, float lod0, float lod1) {
  return 0.6 * textureLod(tex, uv, lod0).rgb + 0.4 * textureLod(tex, uv, lod1).rgb;
}`:`vec3 mipGlow(sampler2D tex, vec2 uv, float lod0, float lod1) {
  return 0.6 * texture2D(tex, uv, lod0).rgb + 0.4 * texture2D(tex, uv, lod1).rgb;
}`}
/* Scene light in, display colour out. Always the last thing a scene's final pass does. */
vec3 film(vec3 sceneLinear) {
  vec3 c = max(sceneLinear, 0.0) * u_fExposure;
  if (u_fTone < 0.5) c = tonemapAgX(c);
  else if (u_fTone < 1.5) c = tonemapNeutral(c);
  else c = min(c, 1.0);
  c = cdl(c, u_fSlope, u_fOffset, u_fPower, u_fSat);
  return ditherTri(linearToSrgb(c), gl_FragCoord.xy, u_fSeed);
}
`}const p=`#version 300 es
in vec2 a_position;
out vec2 v_uv;
void main() { v_uv = a_position * .5 + .5; gl_Position = vec4(a_position, 0., 1.); }
`,n=`#version 300 es
precision highp float;
precision highp sampler2DArray;
in vec2 v_uv;
out vec4 color;
uniform sampler2DArray u_poses;
uniform sampler2D u_code;
uniform vec2 u_size;
uniform vec2 u_gaze;
uniform vec2 u_pupils[5];
uniform int u_layers[9];
uniform int u_compact;
uniform float u_blink;
uniform vec2 u_viewIris;
uniform vec2 u_viewShift;
uniform float u_viewZoom;
${o(300)}

vec3 pose(vec2 p, int layer) {
  return texture(u_poses, vec3(clamp(p, 0., 1.), float(u_layers[layer]))).rgb;
}

// All five lid silhouettes are traced independently. A Catmull-Rom curve
// avoids moving a straight horizontal bar over the spherical eye.
float lid(float x, int frame, bool bottom) {
  float a[55] = float[55](
    .605,.548,.474,.400,.345,.300,.280,.285,.324,.378,.486,
    .605,.551,.481,.423,.382,.353,.344,.362,.392,.419,.486,
    .605,.564,.518,.458,.428,.417,.419,.437,.457,.469,.486,
    .605,.585,.560,.536,.522,.511,.514,.520,.525,.525,.486,
    .615,.620,.622,.622,.617,.608,.598,.585,.563,.532,.486
  );
  float b[55] = float[55](
    .621,.645,.665,.679,.685,.684,.676,.659,.633,.579,.490,
    .621,.645,.665,.679,.685,.684,.676,.659,.633,.579,.490,
    .621,.639,.652,.663,.665,.662,.652,.634,.610,.565,.490,
    .621,.635,.639,.637,.628,.614,.606,.591,.574,.540,.490,
    .615,.620,.622,.622,.617,.608,.598,.585,.563,.532,.486
  );
  float t = clamp((x - .19) / .62, 0., 1.) * 10.;
  int i = min(9, int(floor(t)));
  float f = t - float(i);
  int o = frame * 11;
  vec4 p = bottom ? vec4(b[o+max(0,i-1)],b[o+i],b[o+i+1],b[o+min(10,i+2)])
    : vec4(a[o+max(0,i-1)],a[o+i],a[o+i+1],a[o+min(10,i+2)]);
  return .5 * (2.*p.y + (-p.x+p.z)*f + (2.*p.x-5.*p.y+4.*p.z-p.w)*f*f
    + (-p.x+3.*p.y-3.*p.z+p.w)*f*f*f);
}
int blinkLayer(int frame) { return frame == 0 ? 0 : frame + 4; }

vec2 highlight(int layer) {
  vec2 centers[5] = vec2[5](vec2(.53568,.36540),vec2(.43559,.38707),
    vec2(.58435,.36399),vec2(.53636,.32197),vec2(.52966,.45954));
  return centers[u_layers[layer]];
}

// The inverse map pins the outer face, while matching each source lid edge
// to the interpolated edge. Skin/lashes interpolate at the same position.
vec3 lidMaterial(vec2 q, int frame, float upper, float lower) {
  int layer = blinkLayer(frame);
  int source = u_layers[layer] == 0 ? 0 : frame;
  float top = lid(q.x, source, false);
  float low = lid(q.x, source, true);
  vec2 p = q;
  if (q.y < upper) {
    p.y += (top-upper) * smoothstep(.055, upper, q.y);
  } else if (q.y > lower) {
    p.y += (low-lower) * (1.-smoothstep(lower, .88, q.y));
  } else {
    // Register both sides of the rim within the feathered aperture. Leaving
    // the inner lower band unregistered ghosts the tear line mid-blink.
    // This material never supplies the iris itself.
    p.y += (top-upper)*(1.-smoothstep(upper,upper+.055,q.y))
      + (low-lower)*smoothstep(lower-.055,lower,q.y);
  }
  return pose(p, layer);
}

// Move source pupils into one shared intermediate position before blending.
// The warp is local to the eyeball: the socket never pans with the gaze.
vec4 alignedPose(vec2 q, int layer, vec2 pupil, vec2 glint) {
  vec2 d = q-pupil;
  float falloff = 1.-smoothstep(.95, 2.05, length(d/vec2(.133,.209)));
  // Translate the iris rigidly. Multiplying this offset by the destination
  // lid mask squashes the iris and drags the source tear line into the globe.
  vec2 uv = q + (u_pupils[layer]-pupil) * falloff;
  // Register the photographed catchlight as well as the pupil. Its offset
  // differs slightly between poses; a raw dissolve makes two white glints.
  float specular = 1.-smoothstep(.55,1.65,length((q-glint)/vec2(.019,.028)));
  uv += (highlight(layer)-u_pupils[layer]-(glint-pupil))*specular;
  float top = lid(uv.x,0,false), bottom = lid(uv.x,0,true);
  // A turned pose cannot supply pixels hidden behind its photographed lid.
  // Reject those samples and let the other aligned pose fill the exposure.
  float valid = smoothstep(top+.014,top+.038,uv.y)
    * (1.-smoothstep(bottom-.044,bottom-.022,uv.y));
  return vec4(pose(uv,layer)*valid,valid);
}

void main() {
  bool compact = u_compact == 1;
  float width = compact ? u_size.x*${e.compactWidth} : min(u_size.x*${e.desktopWidth}, u_size.y*${e.desktopHeight});
  // [port] The view (eye.setView): identity unless set, then the art is scaled about its iris and the
  // iris moved. Exactly the old mapping when zoom is 1 and the shift is 0 (the branch is skipped).
  vec2 s = (v_uv-.5)*u_size;
  if (u_viewZoom != 1. || u_viewShift != vec2(0.)) s = u_viewIris + (s-u_viewIris-u_viewShift)/u_viewZoom;
  vec2 q = s/vec2(width,width/${e.aspect});
  q.y = -q.y;
  q += vec2(${e.anchorX},${e.anchorY});
  if (any(lessThan(q,vec2(0.))) || any(greaterThan(q,vec2(1.)))) { color=vec4(0.,0.,0.,1.); return; }

  float blink = clamp(u_blink,0.,1.);
  float phase = blink*4.;
  int lo = min(3,int(floor(phase)));
  int hi = lo+1;
  float f = phase-float(lo);
  float upper = mix(lid(q.x,lo,false),lid(q.x,hi,false),f);
  float lower = mix(lid(q.x,lo,true),lid(q.x,hi,true),f);
  float openUpper = lid(q.x,0,false), openLower = lid(q.x,0,true);
  float horizontal = smoothstep(.185,.203,q.x)*(1.-smoothstep(.797,.822,q.x));
  float aa = max(.001,1.15/(width*u_viewZoom/1.5));
  // Leave the photographed rim and lash roots intact. The interior blend
  // reaches full opacity away from the lid instead of cutting a hard matte.
  float aperture = smoothstep(upper+aa,upper+.042,q.y)*(1.-smoothstep(lower-.038,lower-aa,q.y));
  aperture *= horizontal*(1.-smoothstep(.98,1.,blink));
  float inner = smoothstep(openUpper+.004,openUpper+.022,q.y)
    * (1.-smoothstep(openLower-.026,openLower-.004,q.y))*horizontal;

  int horizontalPose = u_gaze.x < 0. ? 1 : 2;
  int verticalPose = u_gaze.y > 0. ? 3 : 4;
  vec2 weight = abs(u_gaze);
  weight /= max(1.,weight.x+weight.y);
  vec2 blendedPupil = u_pupils[0]*(1.-weight.x-weight.y)
    + u_pupils[horizontalPose]*weight.x + u_pupils[verticalPose]*weight.y;
  // Texture weights live in a triangle; gaze lives in a circular range.
  // Using those weights for position freezes the outer 29% of a diagonal.
  vec2 pupil = u_pupils[0] + (u_pupils[horizontalPose]-u_pupils[0])*abs(u_gaze.x)
    + (u_pupils[verticalPose]-u_pupils[0])*abs(u_gaze.y);
  vec2 glint = highlight(0)*(1.-weight.x-weight.y)
    + highlight(horizontalPose)*weight.x + highlight(verticalPose)*weight.y + pupil-blendedPupil;
  vec4 aligned = alignedPose(q,0,pupil,glint)*(1.-weight.x-weight.y)
    + alignedPose(q,horizontalPose,pupil,glint)*weight.x
    + alignedPose(q,verticalPose,pupil,glint)*weight.y;
  vec3 rim = pose(q,0)*(1.-weight.x-weight.y)
    + pose(q,horizontalPose)*weight.x + pose(q,verticalPose)*weight.y;
  vec3 sphere = mix(rim,aligned.rgb/max(.0001,aligned.a),inner*smoothstep(0.,.08,aligned.a));

  // The editor is actual TypeScript painted each 40ms, mapped to the cornea.
  // Small curvature retains readable glyphs. Its center follows the pupil.
  vec2 glass = q-pupil-vec2(0.,.030);
  vec2 screen = glass/(compact?vec2(.244,.175):vec2(.201,.145));
  screen.x += screen.y*.025 + screen.y*screen.y*.025;
  vec2 uv = screen+.5;
  float windowMask = smoothstep(.01,.06,uv.x)*(1.-smoothstep(.94,.99,uv.x))
    * smoothstep(.01,.055,uv.y)*(1.-smoothstep(.94,.99,uv.y));
  windowMask *= 1.-smoothstep(.84,1.08,length((q-pupil)/vec2(.123,.193)));
  windowMask *= aperture;
  vec3 code = texture(u_code,clamp(uv,0.,1.)).rgb;
  float ink = smoothstep(.09,.6,dot(code,vec3(.21,.72,.07)));
  sphere = mix(sphere,sphere*.68+code*vec3(.78,.91,1.),windowMask*(.13+.80*ink));
  sphere *= 1.-(1.-smoothstep(.0,.035,q.y-upper))*.28*blink;

  vec3 skinA = lidMaterial(q,lo,upper,lower);
  vec3 skinB = lidMaterial(q,hi,upper,lower);
  vec3 skin = mix(skinA,skinB,f);
  // Preserve generated eyelashes where they project over the aperture.
  float lashBand = smoothstep(-.004,.004,q.y-upper)*(1.-smoothstep(.020,.051,q.y-upper));
  float lash = (1.-smoothstep(.018,.065,max(skin.r,max(skin.g,skin.b))))*lashBand;
  sphere = mix(sphere,skin,lash*smoothstep(0.,.20,blink));
  // At full opening the generated gaze photo owns the entire ocular region.
  // A center-pose matte here leaves its old iris beside a turned pupil. Only
  // introduce the aligned lid material as the blink actually starts closing.
  float ocular = smoothstep(.15,.21,q.x)*(1.-smoothstep(.835,.89,q.x))
    * smoothstep(.13,.225,q.y)*(1.-smoothstep(.71,.775,q.y));
  vec3 openEye = mix(pose(q,0),sphere,ocular);
  vec3 result = mix(openEye,mix(skin,sphere,aperture),smoothstep(0.,.20,blink));
  float movingRegion = smoothstep(.15,.23,q.x)*(1.-smoothstep(.92,.99,q.x))
    * smoothstep(.025,.095,q.y)*(1.-smoothstep(.78,.90,q.y));
  result = mix(pose(q,0),result,movingRegion);
  float edge = smoothstep(0.,.045,v_uv.x)*(1.-smoothstep(.955,1.,v_uv.x))
    * smoothstep(0.,.065,v_uv.y)*(1.-smoothstep(.935,1.,v_uv.y));
  color = vec4(film(srgbToLinear(result*edge)),1.);
}
`;export{e as EYE_ART,r as EYE_GRADE,a as EYE_POSES,s as EYE_PUPILS,n as EYE_SEQUENCE_FRAGMENT,p as EYE_SEQUENCE_VERTEX,l as NEUTRAL_GRADE,o as filmChunk};
