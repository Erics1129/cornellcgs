import { EYE_ART } from './eyeGaze'

// Source-image coordinates, measured on the generated 1152 × 768 keyframes.
// Layer numbers stay stable when an unavailable pose falls back to center.
export const EYE_POSES = ['center', 'left', 'right', 'up', 'down', 'quarter', 'half', 'threequarter', 'closed'] as const
export const EYE_PUPILS = [[.577, .425], [.467, .438], [.623, .430], [.571, .369], [.570, .525]] as const

export const EYE_SEQUENCE_VERTEX = `#version 300 es
in vec2 a_position;
out vec2 v_uv;
void main() { v_uv = a_position * .5 + .5; gl_Position = vec4(a_position, 0., 1.); }
`

export const EYE_SEQUENCE_FRAGMENT = `#version 300 es
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
  float width = compact ? u_size.x*${EYE_ART.compactWidth} : min(u_size.x*${EYE_ART.desktopWidth}, u_size.y*${EYE_ART.desktopHeight});
  vec2 q = (v_uv-.5)*u_size/vec2(width,width/${EYE_ART.aspect});
  q.y = -q.y;
  q += vec2(${EYE_ART.anchorX},${EYE_ART.anchorY});
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
  float aa = max(.001,1.15/(width/1.5));
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
  color = vec4(result*edge,1.);
}
`
