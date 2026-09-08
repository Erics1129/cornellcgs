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
uniform vec2 u_size;
uniform vec2 u_pointer;
uniform float u_progress;
uniform float u_time;
uniform float u_blink;
uniform float u_focus;
uniform int u_mode;
uniform int u_compact;
const float PI=3.14159265359;
mat2 rotate(float a){return mat2(cos(a),-sin(a),sin(a),cos(a));}

vec3 earth(){
  bool mobile=u_compact==1;
  vec2 center=mobile?vec2(.5,.32):vec2(.69,.50);
  float birth=mix(.16,1.,smoothstep(0.,.34,u_progress));
  float radius=(mobile?min(u_size.x*.55,u_size.y*.31):u_size.y*.47)*birth;
  vec2 p=(v_uv-center)*u_size/radius-u_pointer*.035;
  float r=length(p);
  if(r>1.12)return vec3(0.);
  vec3 glow=vec3(.12,.42,.87)*exp(-max(0.,r-1.)*46.)*.35;
  if(r>=1.)return glow*(1.-smoothstep(1.,1.12,r));
  vec3 n=vec3(p,sqrt(max(0.,1.-dot(p,p))));
  vec3 light=normalize(vec3(-.8,.38,.9));
  float diffuse=max(0.,dot(n,light));
  vec3 nn=n;
  nn.xz=rotate(u_progress*PI*1.4+.7+u_pointer.x*.10)*nn.xz;
  nn.yz=rotate(-.14+u_pointer.y*.06)*nn.yz;
  vec2 uv=vec2(atan(nn.x,nn.z)/(2.*PI)+.5,asin(clamp(nn.y,-1.,1.))/PI+.5);
  vec3 albedo=texture(u_image,uv).rgb;
  vec3 surface=albedo*(.075+1.08*diffuse);
  float fresnel=pow(1.-n.z,3.5);
  vec3 atmosphere=vec3(.11,.40,.86)*fresnel*(.4+.6*diffuse);
  float sea=1.-smoothstep(.03,.12,albedo.r);
  float spec=pow(max(0.,dot(reflect(-light,n),vec3(0.,0.,1.))),65.)*.25*sea;
  return (surface+atmosphere+spec)*(1.-smoothstep(.995,1.,r));
}

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

vec3 eye(){
  float width=min(u_size.x*1.03,u_size.y*1.68)*(1.+u_focus*1.15);
  vec2 q=(v_uv-.5)*u_size/vec2(width,width/1.5)+.5;
  if(any(lessThan(q,vec2(0.)))||any(greaterThan(q,vec2(1.))))return vec3(0.);
  vec2 center=vec2(.495,.551);
  vec2 gaze=u_pointer*vec2(.018,.010);
  vec2 delta=q-center;
  float iris=length(delta*vec2(1.5,1.));
  float weight=1.-smoothstep(.21,.34,iris);
  vec2 source=q-gaze*weight;
  // Texture pixels give lashes, vessels and iris fibres. Only the cornea moves.
  vec3 tex=texture(u_image,source).rgb;
  float x=(q.x-.50)/.49;
  float almond=sqrt(max(0.,1.-x*x));
  float upper=.545+.225*almond-u_blink*.245*almond;
  float lower=.500-.207*almond+u_blink*.199*almond;
  float aperture=smoothstep(lower-.012,lower+.003,q.y)*(1.-smoothstep(upper-.003,upper+.012,q.y));
  vec3 result=tex*aperture;
  // A readable editor is reflected across the enlarged pupil and inner iris.
  vec2 rp=(q-center-gaze)*vec2(1.5,1.);
  float pupil=1.-smoothstep(.145,.172,length(rp));
  vec2 screenUV=rp/vec2(.32,.205)+.5;
  screenUV+=rp*dot(rp,rp)*2.;
  float rect=smoothstep(0.,.03,screenUV.x)*(1.-smoothstep(.97,1.,screenUV.x))*smoothstep(0.,.04,screenUV.y)*(1.-smoothstep(.96,1.,screenUV.y));
  vec3 screen=texture(u_screen,clamp(screenUV,0.,1.)).rgb;
  result=mix(result,screen*.81,pupil*rect*aperture*.89);
  float shine=exp(-length((rp-vec2(-.074,.12))*vec2(1.,1.8))*85.);
  result+=vec3(.55,.75,1.)*shine*aperture*.15;
  return result;
}
void main(){
  vec3 c=u_mode==0?blackhole():(u_mode==1?earth():eye());
  color=vec4(c,1.);
}
`
