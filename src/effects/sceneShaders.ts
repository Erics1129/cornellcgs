import { CINEMATIC_EYE_SHADER } from './cinematicEyeShader'
import { EARTH_SHADER } from './earthShader'

/** Image-generated material, real-time lighting and input-driven deformation. */
export const SCENE_VERTEX = `#version 300 es
in vec2 a_position;
out vec2 v_uv;
void main(){v_uv=a_position*.5+.5;gl_Position=vec4(a_position,0.,1.);}
`

export const SCENE_FRAGMENT = `#version 300 es
precision highp float;
in vec2 v_uv;
out vec4 color;
uniform sampler2D u_image;
uniform sampler2D u_screen;
uniform sampler2D u_lid;
uniform vec2 u_size;
uniform vec2 u_pointer;
uniform float u_progress;
uniform float u_time;
uniform float u_blink;
uniform int u_mode;
uniform int u_compact;
const float PI=3.14159265359;
mat2 rotate(float a){return mat2(cos(a),-sin(a),sin(a),cos(a));}

${EARTH_SHADER}

vec3 blackhole(){
  bool mobile=u_compact==1;
  vec2 center=mobile?vec2(.5,.36):vec2(.69,.5);
  float width=mobile?u_size.x*1.24:min(u_size.x*.96,u_size.y*1.60);
  float zoom=mix(.67,1.07,smoothstep(0.,.8,u_progress));
  vec2 p=(v_uv-center)*u_size/vec2(width,width/1.5)/zoom;
  p-=u_pointer*.013;
  // Plasma flows around the horizon; the image's outer geometry stays stable.
  float r=length(p*vec2(1.,.82));
  float bend=exp(-r*7.)*sin(r*35.-u_progress*16.)*.038;
  vec2 sampleP=rotate(bend)*p;
  sampleP+=vec2(sin(p.y*48.+u_progress*22.),cos(p.x*32.-u_progress*18.))*.0018*exp(-r*4.);
  vec2 uv=sampleP+.5;
  if(any(lessThan(uv,vec2(0.)))||any(greaterThan(uv,vec2(1.))))return vec3(0.);
  vec3 tex=texture(u_image,uv).rgb;
  float edge=smoothstep(0.,.07,uv.x)*(1.-smoothstep(.93,1.,uv.x))*smoothstep(0.,.06,uv.y)*(1.-smoothstep(.94,1.,uv.y));
  float az=atan(p.y,p.x);
  float flow=.92+.10*sin(az*7.-u_progress*30.+r*22.);
  return tex*edge*flow*1.24;
}

${CINEMATIC_EYE_SHADER}
void main(){
  vec3 c=u_mode==0?blackhole():(u_mode==1?earth():eye());
  color=vec4(c,1.);
}
`
