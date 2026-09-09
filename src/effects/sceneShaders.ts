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
  // One sculpted almond, softly lit like a cel-animated glass object.
  float radius=min(u_size.x*.46,u_size.y*.96);
  vec2 p=(v_uv-.5)*u_size/radius;
  p.y-=.022*sin(u_time*.47);
  if(abs(p.x)>1.04||abs(p.y)>.57)return vec3(0.);
  float arc=pow(max(0.,1.-p.x*p.x),.72);
  float seam=.025*arc-.018;
  float upper=mix(.435*arc,seam,u_blink);
  float lower=mix(-.355*arc,seam,u_blink);
  float aa=max(.0025,1.25/radius);
  float aperture=smoothstep(lower-aa,lower+aa,p.y)*(1.-smoothstep(upper-aa,upper+aa,p.y));
  float side=1.-smoothstep(.99,1.01,abs(p.x));
  aperture*=side;
  // Smooth pearl sclera without skin or photo-cutout lids.
  float shade=clamp(.64+.35*arc-.23*p.y,.0,1.);
  vec3 sclera=mix(vec3(.28,.40,.56),vec3(.89,.95,1.),shade);
  float lidShadow=1.-smoothstep(.0,.16,upper-p.y);
  sclera*=1.-.37*lidShadow;
  vec2 ip=p-u_pointer*vec2(.10,.047);
  float r=length(ip);
  float ir=(u_compact==1?.40:.345)+.005*sin(u_time*.65);
  float a=atan(ip.y,ip.x);
  float rays=.5+.5*sin(a*24.+r*18.);
  float glassBand=exp(-abs(r-ir*.82)*34.);
  vec3 iris=mix(vec3(.028,.12,.24),vec3(.17,.48,.68),glassBand*.65+rays*.10);
  iris+=vec3(.12,.30,.45)*exp(-abs(r-ir*.87)*105.);
  iris*=.50+.50*(1.-smoothstep(ir-.035,ir,r));
  vec3 result=mix(sclera,iris,1.-smoothstep(ir-aa,ir+aa,r));
  float pupil=1.-smoothstep(.22,.24,r);
  result=mix(result,vec3(.006,.019,.038),pupil);
  // Barrel distortion follows a curved cornea. The dark editor has no pasted
  // white rectangle; its illuminated glyphs dissolve into the blue iris.
  vec2 glass=ip-u_pointer*vec2(.012,.006);
  vec2 screenUV=glass/vec2(.53,.37);
  screenUV*=1.+.30*dot(screenUV,screenUV);
  screenUV+=.5;
  float mask=smoothstep(.02,.13,screenUV.x)*(1.-smoothstep(.87,.98,screenUV.x))*smoothstep(.02,.13,screenUV.y)*(1.-smoothstep(.87,.98,screenUV.y));
  mask*=1.-smoothstep(.23,.29,r);
  vec3 screen=texture(u_screen,clamp(screenUV,0.,1.)).rgb;
  result=mix(result,result*.3+screen*.92,mask*.91);
  // Broad curved highlight and small catchlight give animated glass depth.
  float crescent=exp(-abs(length(ip-vec2(.035,-.025))-.286)*180.);
  crescent*=smoothstep(.03,.21,ip.y)*(1.-smoothstep(-.02,.22,ip.x));
  result+=vec3(.54,.82,1.)*crescent*.38;
  float shine=exp(-dot((ip-vec2(-.123,.20))*vec2(1.,1.8),(ip-vec2(-.123,.20))*vec2(1.,1.8))*2600.);
  result+=vec3(.82,.95,1.)*shine*.65;
  result*=aperture;
  // Eyelid contour remains a gentle curved stroke during the full close.
  float upperLine=exp(-abs(p.y-upper)*200.)*arc*side;
  float lowerLine=exp(-abs(p.y-lower)*220.)*arc*side*(1.-u_blink);
  result+=vec3(.18,.34,.51)*(upperLine*.52+lowerLine*.26);
  return result;
}
void main(){
  vec3 c=u_mode==0?blackhole():(u_mode==1?earth():eye());
  color=vec4(c,1.);
}
`
