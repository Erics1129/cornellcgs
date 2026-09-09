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
uniform float u_travel;
uniform float u_hasImage;
uniform float u_hasSecondImage;
uniform float u_imageAspect;
uniform float u_secondImageAspect;
uniform sampler2D u_image;
uniform sampler2D u_secondImage;
float hash(vec2 p) { return fract(sin(dot(p,vec2(127.1,311.7)))*43758.5453); }
float noise(vec2 p) {
  vec2 i=floor(p), f=fract(p); f=f*f*(3.-2.*f);
  return mix(mix(hash(i),hash(i+vec2(1,0)),f.x),mix(hash(i+vec2(0,1)),hash(i+1.),f.x),f.y);
}
mat2 turn(float a) { float c=cos(a), s=sin(a); return mat2(c,-s,s,c); }
vec3 spiral(vec2 q, float violet) {
  vec2 s=turn(mix(.52,-.38,violet))*q;
  s.y*=mix(1.9,1.3,violet);
  float r=length(s), angle=atan(s.y,s.x);
  float arms=pow(.5+.5*cos(mix(2.,3.,violet)*angle-5.*log(r+.055)),5.);
  float dust=.5+.5*noise(s*36.);
  vec3 tint=mix(vec3(.23,.43,.8),vec3(.52,.23,.85),violet);
  return tint*arms*exp(-r*3.8)*dust + mix(vec3(.48,.64,.86),vec3(.55,.42,.82),violet)*exp(-r*16.)*.7;
}
vec3 galaxy(sampler2D image, vec2 q, float aspect, float loaded, float violet) {
  if(loaded<.5) return spiral(q,violet);
  vec2 uv=q/vec2(aspect,1.)+.5;
  vec2 edge=1.-smoothstep(vec2(.44),vec2(.5),abs(uv-.5));
  return texture(image,clamp(uv,0.,1.)).rgb*edge.x*edge.y;
}
void main() {
  float p=u_progress;
  float aspect=u_size.x/u_size.y;
  vec2 screen=(v_uv-.5)*vec2(aspect,1.);
  vec3 color=vec3(0.);

  // A physical flypast, deliberately beside the core: size and lateral
  // displacement share the same perspective denominator. No white-out.
  float pass=smoothstep(.035,.385,p);
  float firstDepth=mix(28.,.42,pass);
  float firstSize=1.8/firstDepth;
  vec2 firstCenter=vec2(-.95,-.12)/firstDepth;
  float firstFade=1.-smoothstep(.335,.405,p);
  if(firstFade>.001) color+=galaxy(u_image,(screen-firstCenter)/firstSize,u_imageAspect,u_hasImage,0.)*firstFade*.86;

  float tunnel=smoothstep(.30,.42,p)*(1.-smoothstep(.665,.765,p));
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
    // Bounded radiance, no postprocessing bloom or bright central flash.
    color+=(1.-exp(-corridor))*tunnel*aperture*.9;
  }

  // A distinct horizon emerges through the last rings before the final coast.
  float reveal=smoothstep(.655,.745,p);
  float arrival=smoothstep(.71,1.,p);
  float secondSize=.034+2.12*pow(arrival,3.3);
  vec2 secondCenter=vec2(.075*(1.-arrival),.022);
  if(reveal>.001) color+=galaxy(u_secondImage,(screen-secondCenter)/secondSize,u_secondImageAspect,u_hasSecondImage,1.)*reveal*.93;
  color=min(color,vec3(.9));
  color*=1.-smoothstep(.32,1.05,length(v_uv-.5));
  outColor=vec4(color,1.);
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
vec2 project(vec2 xy,float z) { return u_size*.5+xy/max(z,.4)*u_size.y*.78; }
void main() {
  const float depth=32.;
  float clock=a_seed.z*depth+u_travel;
  float cycle=floor(clock/depth);
  float z=depth-mod(clock,depth);
  float id=a_seed.x*7919.+cycle*127.1;
  vec2 xy=vec2(hash(id+13.),hash(id+91.))*vec2(42.,28.)-vec2(21.,14.);
  float tunnel=smoothstep(.30,.42,u_progress)*(1.-smoothstep(.665,.765,u_progress));
  float bank=tunnel*.12*sin(u_travel*.014);
  xy=mat2(cos(bank),-sin(bank),sin(bank),cos(bank))*xy;
  vec2 head=project(xy,z);
  vec2 tail=project(xy,clamp(z+u_direction*12.*u_speed,.4,depth));
  vec2 delta=head-tail;
  float len=length(delta);
  vec2 along=len>.001?delta/len:vec2(0.,1.);
  float halfWidth=(.6+.85*a_seed.w)*u_pixelRatio*(1.+.22*u_speed);
  float streakLength=min(len,u_size.y*.36);
  vec2 midpoint=head-along*streakLength*.5;
  vec2 normal=vec2(-along.y,along.x);
  vec2 pixel=midpoint+along*a_corner.x*(streakLength*.5+halfWidth)+normal*a_corner.y*halfWidth;
  gl_Position=vec4(pixel/u_size*2.-1.,0.,1.);
  v_corner=a_corner;
  float fade=smoothstep(.6,2.4,z)*(1.-smoothstep(24.,32.,z));
  float arrival=1.-smoothstep(.88,1.,u_progress)*.78;
  v_alpha=fade*arrival*(.35+.5*a_seed.w)*(.65+u_speed*.35)*(1.-tunnel*.74);
  v_color=mix(vec3(.51,.48,1.),vec3(.76,.9,1.),a_seed.y);
}`

export const STAR_FRAGMENT = `#version 300 es
precision highp float;
in vec2 v_corner;
in vec3 v_color;
in float v_alpha;
out vec4 outColor;
void main() {
  float width=1.-smoothstep(.12,1.,abs(v_corner.y));
  float ends=1.-smoothstep(.75,1.,abs(v_corner.x));
  float alpha=width*ends*v_alpha;
  outColor=vec4(v_color*alpha,alpha);
}`
