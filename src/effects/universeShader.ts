/** Pure scroll coordinates: camera position never integrates elapsed time. */
export function universeRoute(progress: number) {
  const p = Math.max(0, Math.min(1, progress))
  const ease = p * p * p * (p * (p * 6 - 15) + 10)
  return { travel: 156 * ease, envelope: 16 * p * p * (1 - p) * (1 - p) }
}

export const UNIVERSE_VERTEX = `#version 300 es
in vec2 a_corner;
out vec2 v_uv;
void main() {
  v_uv = a_corner * .5 + .5;
  gl_Position = vec4(a_corner, 0., 1.);
}`

export const UNIVERSE_FRAGMENT = `#version 300 es
precision highp float;
in vec2 v_uv;
out vec4 outColor;
uniform vec2 u_size;
uniform float u_progress;
uniform float u_hasImage;
uniform float u_imageAspect;
uniform sampler2D u_image;
float hash(vec2 p) { return fract(sin(dot(p, vec2(127.1, 311.7))) * 43758.5453); }
float noise(vec2 p) {
  vec2 i = floor(p), f = fract(p); f = f*f*(3.-2.*f);
  return mix(mix(hash(i),hash(i+vec2(1,0)),f.x),mix(hash(i+vec2(0,1)),hash(i+1.),f.x),f.y);
}
void main() {
  float aspect = u_size.x / u_size.y;
  vec2 screen = (v_uv - .5) * vec2(aspect, 1.);
  float approach = smoothstep(.13, 1., u_progress);
  // A plane approached in perspective: almost a point, then beyond the frame.
  float size = .045 + 2.15 * pow(approach, 4.);
  vec2 center = vec2(.035 * sin(u_progress * 3.14159), .025);
  vec2 q = (screen - center) / size;
  vec2 uv = q / vec2(u_imageAspect, 1.) + .5;
  vec2 edge = 1.-smoothstep(vec2(.44), vec2(.5), abs(uv-.5));
  float inside = edge.x * edge.y;
  vec3 galaxy;
  if (u_hasImage > .5) {
    galaxy = texture(u_image, clamp(uv, 0., 1.)).rgb * inside;
  } else {
    // A quiet procedural spiral is also a useful missing-image fallback.
    vec2 s = mat2(.86,-.51,.51,.86) * q;
    s.y *= 1.9;
    float r = length(s), angle = atan(s.y,s.x);
    float arms = pow(.5+.5*cos(2.*angle-5.*log(r+.055)),5.);
    float dust = .45 + .55*noise(s*36.);
    galaxy = vec3(.35,.5,.8)*arms*exp(-r*3.8)*dust*.8;
    galaxy += vec3(.75,.82,1.)*exp(-r*16.)*.85;
  }
  vec3 color = galaxy * mix(.65, 1.05, approach);
  float haze = noise(screen*2.4+vec2(.2,u_progress*.14)) * noise(screen*5.);
  color += vec3(.009,.016,.034)*haze*(1.-smoothstep(.65,1.,u_progress));
  float vignette = 1.-smoothstep(.32,1.05,length(v_uv-.5));
  color *= vignette;
  outColor = vec4(color,1.);
}`

export const STAR_VERTEX = `#version 300 es
precision highp float;
in vec2 a_corner;
in vec4 a_seed;
uniform vec2 u_size;
uniform float u_travel;
uniform float u_speed;
uniform float u_direction;
uniform float u_progress;
uniform float u_pixelRatio;
out vec2 v_corner;
out vec3 v_color;
out float v_alpha;
float hash(float n) { return fract(sin(n)*43758.5453); }
vec2 project(vec2 xy, float z) {
  return u_size*.5 + xy/max(z,.4)*u_size.y*.78;
}
void main() {
  const float depth = 32.;
  float clock = a_seed.z*depth + u_travel;
  float cycle = floor(clock/depth);
  float z = depth-mod(clock,depth);
  float id = a_seed.x*7919. + cycle*127.1;
  vec2 xy = vec2(hash(id+13.),hash(id+91.)) * vec2(42.,28.) - vec2(21.,14.);
  vec2 head = project(xy,z);
  float distance = 12.*u_speed;
  vec2 tail = project(xy,clamp(z+u_direction*distance,.4,depth));
  vec2 delta = head-tail;
  float len = length(delta);
  vec2 along = len>.001 ? delta/len : vec2(0.,1.);
  float halfWidth = (.6+.85*a_seed.w)*u_pixelRatio*(1.+.22*u_speed);
  float streakLength = min(len,u_size.y*.36);
  vec2 midpoint = head-along*streakLength*.5;
  vec2 normal = vec2(-along.y,along.x);
  vec2 pixel = midpoint + along*a_corner.x*(streakLength*.5+halfWidth) + normal*a_corner.y*halfWidth;
  gl_Position = vec4(pixel/u_size*2.-1.,0.,1.);
  v_corner = a_corner;
  float fade = smoothstep(.6,2.4,z)*(1.-smoothstep(24.,32.,z));
  float arrival = 1.-smoothstep(.8,1.,u_progress)*.78;
  v_alpha = fade*arrival*(.35+.5*a_seed.w)*(.65+u_speed*.35);
  v_color = mix(vec3(.51,.48,1.),vec3(.76,.9,1.),a_seed.y);
}`

export const STAR_FRAGMENT = `#version 300 es
precision highp float;
in vec2 v_corner;
in vec3 v_color;
in float v_alpha;
out vec4 outColor;
void main() {
  float width = 1.-smoothstep(.12,1.,abs(v_corner.y));
  float ends = 1.-smoothstep(.75,1.,abs(v_corner.x));
  float alpha = width*ends*v_alpha;
  outColor = vec4(v_color*alpha,alpha);
}`
