const unit = (value: number) => Math.max(0, Math.min(1, value))
const ease = (p: number) => p*p*p*(p*(p*6-15)+10)
const pulse = (p: number) => 16*p*p*(1-p)*(1-p)

/** Three overlapping camera legs. No elapsed time or accumulated simulation. */
export function universeRoute(progress: number) {
  const p = unit(progress)
  const first = unit(p/.37)
  const passage = unit((p-.32)/.41)
  const arrival = unit((p-.69)/.31)
  return {
    travel: 136*ease(first) + 180*ease(passage) + 128*ease(arrival),
    envelope: Math.min(1,.9*pulse(first)+pulse(passage)+.8*pulse(arrival)),
  }
}

import { filmChunk } from './film/glsl'

/**
 * The scene works in linear light. With an HDR target (the normal path) the
 * backdrop and the stars accumulate into a float buffer, a bloom chain or the
 * target's own mipmaps add glow, and UNIVERSE_COMPOSITE ends in film().
 * Without float targets (`direct`), the backdrop ends in film() itself and
 * the stars are added in display space, as before.
 */
export const UNIVERSE_VERTEX = `#version 300 es
in vec2 a_corner;
out vec2 v_uv;
void main() {
  v_uv = a_corner * .5 + .5;
  gl_Position = vec4(a_corner, 0., 1.);
}`

export const universeFragment = (direct: boolean) => `#version 300 es
precision highp float;
in vec2 v_uv;
out vec4 outColor;
uniform vec2 u_size;
uniform float u_progress;
uniform float u_travel;
uniform float u_hasImage;
uniform float u_hasSecondImage;
uniform float u_imageAspect;
uniform float u_secondImageAspect;
uniform sampler2D u_image;
uniform sampler2D u_secondImage;
${filmChunk(300)}
float hash(vec2 p) { return fract(sin(dot(p,vec2(127.1,311.7)))*43758.5453); }
vec2 hash2(vec2 p) { return fract(sin(vec2(dot(p,vec2(127.1,311.7)),dot(p,vec2(269.5,183.3))))*43758.5453); }
float noise(vec2 p) {
  vec2 i=floor(p), f=fract(p); f=f*f*(3.-2.*f);
  return mix(mix(hash(i),hash(i+vec2(1,0)),f.x),mix(hash(i+vec2(0,1)),hash(i+1.),f.x),f.y);
}
float fbm(vec2 p) {
  float v=0., a=.5;
  for(int i=0;i<4;i++) { v+=a*noise(p); p=mat2(1.6,1.2,-1.2,1.6)*p+7.3; a*=.5; }
  return v;
}
mat2 turn(float a) { float c=cos(a), s=sin(a); return mat2(c,-s,s,c); }
// Colour temperature, cool blue-white through white to warm orange (linear light)
vec3 starTint(float t) {
  return t<.5 ? mix(vec3(.62,.74,1.),vec3(1.,.97,.92),t*2.) : mix(vec3(1.,.97,.92),vec3(1.,.72,.44),t*2.-1.);
}
// Distant stars that never streak: one jittered point per cell, round and soft.
// This is the floor of the picture: it is there at every progress.
vec3 deepField(vec2 q, float scale, float seed) {
  vec2 g=q*scale+seed, cell=floor(g);
  vec2 rnd=hash2(cell+seed*1.7);
  vec2 d=fract(g)-(.18+.64*rnd);
  float mag=hash(cell+seed+3.1);
  float bright=pow(mag,11.)*3.4+.012;
  float radius=mix(.02,.06,pow(mag,8.));
  float core=exp(-dot(d,d)/(radius*radius));
  return starTint(hash(cell+seed+9.7))*core*bright;
}
vec3 spiral(vec2 q, float violet) {
  vec2 s=turn(mix(.52,-.38,violet))*q;
  s.y*=mix(1.9,1.3,violet);
  float r=length(s), angle=atan(s.y,s.x);
  float arms=pow(.5+.5*cos(mix(2.,3.,violet)*angle-5.*log(r+.055)),5.);
  float dust=.5+.5*noise(s*36.);
  vec3 tint=mix(vec3(.23,.43,.8),vec3(.52,.23,.85),violet);
  return srgbToLinear(tint*arms*exp(-r*3.8)*dust + mix(vec3(.48,.64,.86),vec3(.55,.42,.82),violet)*exp(-r*16.)*.7);
}
// A galaxy plate. The photograph is display referred: linearise it, then open
// its highlights back up so the core is brighter than white and can bloom.
vec3 galaxy(sampler2D image, vec2 q, float aspect, float loaded, float violet) {
  if(loaded<.5) return spiral(q,violet);
  vec2 uv=q/vec2(aspect,1.)+.5;
  vec2 edge=1.-smoothstep(vec2(.4),vec2(.5),abs(uv-.5));
  // bitmaps are uploaded top row first: flip v here instead of at upload
  vec3 c=srgbToLinear(texture(image,clamp(vec2(uv.x,1.-uv.y),0.,1.)).rgb);
  float l=luma(c);
  c*=1.+2.6*l*l;
  return c*edge.x*edge.y;
}
void main() {
  float p=u_progress;
  float aspect=u_size.x/u_size.y;
  vec2 screen=(v_uv-.5)*vec2(aspect,1.);
  vec3 color=vec3(0.);

  float tunnel=smoothstep(.30,.42,p)*(1.-smoothstep(.69,.80,p));

  // The floor: two layers of fixed stars and thin interstellar dust that
  // drift a little with travel. Never zero, so no resting frame is empty.
  vec2 drift=vec2(.0016,-.0007)*u_travel;
  vec2 sky=turn(.21)*screen;
  float quiet=1.-.72*tunnel;
  vec3 field=deepField(sky+drift,23.,11.)+deepField(sky*1.9+drift*1.8,31.,47.)*.4;
  color+=field*quiet;
  float dust=fbm(sky*1.7+drift*9.+vec2(3.1,1.7));
  float lanes=fbm(sky*4.3-drift*14.+dust*1.6);
  float band=exp(-pow((sky.y+.12*sin(sky.x*1.3+.6))*1.55,2.));
  vec3 dustHue=mix(vec3(.05,.085,.19),vec3(.17,.075,.15),smoothstep(.3,.75,lanes));
  float legGlow=mix(1.,.55,smoothstep(.3,.5,p))*mix(1.,1.5,smoothstep(.68,.8,p)*(1.-smoothstep(.86,1.,p)));
  color+=dustHue*(.03+.3*band*smoothstep(.36,.82,dust))*legGlow*quiet;
  // A warm ember of far light low on the left ties deep space to the table's lamp
  color+=vec3(.12,.06,.03)*exp(-dot(screen-vec2(-.62*aspect,-.5),screen-vec2(-.62*aspect,-.5))*1.4)*.11*quiet;

  // A physical flypast, deliberately beside the core: size and lateral
  // displacement share the same perspective denominator. No white-out.
  float pass=smoothstep(.0,.385,p);
  float firstDepth=mix(10.5,.42,pass*pass*(3.-2.*pass));
  float firstSize=1.8/firstDepth;
  vec2 firstCenter=vec2(-.95,-.12)/firstDepth+vec2(.1,.02)*(1.-pass);
  float firstFade=1.-smoothstep(.335,.405,p);
  if(firstFade>.001) color+=galaxy(u_image,(screen-firstCenter)/firstSize,u_imageAspect,u_hasImage,0.)*firstFade*.9;

  if(tunnel>.001) {
    float phase=u_travel*.014;
    vec2 axis=vec2(sin(phase)*.032,cos(phase)*.018);
    vec2 wall=screen-axis;
    float r=length(wall);
    float depth=-log(r+.045);
    float angle=atan(wall.y,wall.x);
    float twist=angle+depth*.72+phase*.23;
    // Continuous, low-frequency sheets join the depth planes. Polar flow
    // folds smoothly around the aperture; only three noise reads per pixel.
    vec2 flow=vec2(cos(twist),sin(twist))*(2.1+depth*.35);
    float cloud=noise(flow*1.6+vec2(depth*1.4,phase*.38));
    float wisp=noise(flow*3.8-vec2(phase*.3,depth*2.1));
    float veil=noise(wall*4.+vec2(cloud,phase*.12));
    float fold=twist+cloud*.42;
    float sheet=pow(.5+.5*sin(fold*3.+depth*.5),3.);
    float trail=pow(.5+.5*sin(fold*11.-depth*.7+wisp*.6),12.);
    float aperture=smoothstep(.045,.17,r);
    float wallFade=1.-smoothstep(.65,1.4,r);
    vec3 wallHue=mix(vec3(.12,.38,.82),vec3(.48,.18,.72),.5+.5*sin(twist+.6));
    vec3 corridor=wallHue*(.075+sheet*.64+trail*.15)*(.55+cloud*.45)*wallFade;
    corridor+=mix(vec3(.045,.11,.23),vec3(.15,.055,.24),veil)*(.2+cloud*.55)*wallFade;

    // Eight soft shells supply perspective occlusion, with restrained rims.
    // Their widths scale with depth, so there are no empty wireframe gaps.
    float bank=.12*sin(phase);
    for(int i=0;i<8;i++) {
      float z=.8+mod(float(i)*4.75-u_travel*.39,38.);
      float radius=2.35/z;
      vec2 bend=axis+vec2(sin(z*.11+phase),cos(z*.14+phase))*.045;
      vec2 q=screen-bend;
      q.y*=1.06;
      // Reuse the continuous wall angle instead of eight more atan calls.
      float theta=angle+bank+z*.008;
      float ripple=1.+.075*sin(3.*theta+z*.19+phase);
      float edge=abs(length(q)-radius*ripple);
      float aa=max(fwidth(edge),1.1/u_size.y);
      float line=1.-smoothstep(aa,aa*2.3,edge);
      float width=radius*.24+.012;
      float offset=edge/width;
      float surface=exp(-offset*offset);
      float depthFade=smoothstep(.8,2.,z)*(1.-smoothstep(24.,38.,z));
      float arc=.2+.8*pow(.5+.5*cos(theta*2.+z*.15+phase*.3),2.);
      vec3 hue=mix(vec3(.16,.4,.85),vec3(.47,.2,.76),.5+.5*sin(z*.09+theta));
      corridor+=hue*(line*.11+surface*.3)*depthFade*arc;
    }
    // Bounded radiance, authored for the display: linearise it, then let the
    // rims run a little hot so they catch the bloom.
    vec3 lit=srgbToLinear((1.-exp(-corridor))*.92);
    color+=lit*(1.+1.4*luma(lit))*tunnel*aperture;
  }

  // The second galaxy is already a real object while the last rings pass,
  // so the hand-over from tunnel to arrival never leaves an empty frame.
  float reveal=smoothstep(.62,.72,p);
  float arrival=smoothstep(.66,1.,p);
  float secondSize=.11+2.05*pow(arrival,2.6);
  vec2 secondCenter=vec2(.075*(1.-arrival),.022);
  if(reveal>.001) color+=galaxy(u_secondImage,(screen-secondCenter)/secondSize,u_secondImageAspect,u_hasSecondImage,1.)*reveal*.95;

  ${direct ? 'outColor=vec4(film(color),1.);' : 'outColor=vec4(color,1.);'}
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
uniform float u_gain;
out vec2 v_corner;
out vec3 v_color;
out float v_alpha;
out float v_round;
float hash(float n) { return fract(sin(n)*43758.5453); }
vec2 project(vec2 xy,float z) { return u_size*.5+xy/max(z,.4)*u_size.y*.78; }
void main() {
  const float depth=32.;
  float clock=a_seed.z*depth+u_travel;
  float cycle=floor(clock/depth);
  float z=depth-mod(clock,depth);
  float id=a_seed.x*7919.+cycle*127.1;
  vec2 xy=vec2(hash(id+13.),hash(id+91.))*vec2(42.,28.)-vec2(21.,14.);
  float tunnel=smoothstep(.30,.42,u_progress)*(1.-smoothstep(.69,.80,u_progress));
  float bank=tunnel*.12*sin(u_travel*.014);
  xy=mat2(cos(bank),-sin(bank),sin(bank),cos(bank))*xy;
  vec2 head=project(xy,z);
  vec2 tail=project(xy,clamp(z+u_direction*12.*u_speed,.4,depth));
  vec2 delta=head-tail;
  float len=length(delta);
  vec2 along=len>.001?delta/len:vec2(0.,1.);
  // Size follows a power law: many pinpoints, a few large soft stars. Nearer is larger.
  float mag=pow(a_seed.w,5.);
  float near=1.-smoothstep(1.,14.,z);
  float halfWidth=(.8+1.6*mag+.8*near*near)*u_pixelRatio*(1.+.22*u_speed);
  float streakLength=min(len,u_size.y*.36);
  vec2 midpoint=head-along*streakLength*.5;
  vec2 normal=vec2(-along.y,along.x);
  vec2 pixel=midpoint+along*a_corner.x*(streakLength*.5+halfWidth)+normal*a_corner.y*halfWidth;
  gl_Position=vec4(pixel/u_size*2.-1.,0.,1.);
  v_corner=a_corner;
  // how much of the quad's length is the round cap (1 = a still, round star)
  v_round=halfWidth/(streakLength*.5+halfWidth);
  float fade=smoothstep(.6,2.4,z)*(1.-smoothstep(24.,32.,z));
  float arrival=1.-smoothstep(.88,1.,u_progress)*.7;
  v_alpha=fade*arrival*(.3+.7*a_seed.w)*(.7+u_speed*.3)*(1.-tunnel*.7)*(.35+2.4*mag)*u_gain;
  // colour temperature: mostly white, some blue-white, a few warm
  float t=hash(a_seed.y*91.7+3.);
  v_color=t<.5 ? mix(vec3(.6,.72,1.),vec3(1.,.97,.92),t*2.) : mix(vec3(1.,.97,.92),vec3(1.,.74,.48),(t*2.-1.)*(t*2.-1.));
}`

export const STAR_FRAGMENT = `#version 300 es
precision highp float;
in vec2 v_corner;
in vec3 v_color;
in float v_alpha;
in float v_round;
out vec4 outColor;
void main() {
  // distance to the streak's spine, in units of the half width: round caps, soft edge
  float along=max(0.,abs(v_corner.x)-(1.-v_round))/max(v_round,1e-4);
  float d2=along*along+v_corner.y*v_corner.y;
  float core=exp(-d2*5.5);
  float halo=exp(-d2*1.7)*.22;
  float alpha=(core+halo)*(1.-smoothstep(.82,1.,d2))*v_alpha;
  outColor=vec4(v_color*alpha,alpha);
}`

/** Final pass: scene light plus glow, then the shared film(). */
export const UNIVERSE_COMPOSITE = `#version 300 es
precision highp float;
in vec2 v_uv;
out vec4 outColor;
uniform sampler2D u_scene;
uniform sampler2D u_bloom;
/* 0 = none, 1 = chain (u_bloom, summed levels), 2 = the scene target's own mipmaps */
uniform float u_glowMode;
uniform float u_glowLevels;
uniform float u_glow;
${filmChunk(300)}
void main() {
  vec3 c=texture(u_scene,v_uv).rgb;
  if(u_glowMode>1.5) c=mix(c,mipGlow(u_scene,v_uv,3.,5.),u_glow);
  else if(u_glowMode>.5) c=mix(c,texture(u_bloom,v_uv).rgb/u_glowLevels,u_glow);
  // soft falloff toward the corners, in scene light (the lens adds the vignette every chapter shares)
  vec2 d=v_uv-.5;
  c*=1.-.3*smoothstep(.2,.78,dot(d,d)*2.);
  outColor=vec4(film(c),1.);
}`
