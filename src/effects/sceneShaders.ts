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

vec3 eye(){
  // Asymmetric lid contours around a softly lit sphere, rather than a logo.
  float radius=min(u_size.x*.405,u_size.y*.92);
  vec2 p=(v_uv-.5)*u_size/radius;
  if(abs(p.x)>1.06||abs(p.y)>.65)return vec3(0.);
  float span=max(0.,1.-p.x*p.x);
  float arc=pow(span,.66);
  float tilt=.037*p.x+.012;
  float openUpper=.405*arc*(1.-.12*p.x)+tilt+u_pointer.y*.018*arc;
  float openLower=-.285*pow(span,.82)*(1.+.08*p.x)+tilt;
  // The upper lid does most of the closing, rolling toward the lower lid.
  float seam=openLower+.026*arc;
  float upper=mix(openUpper,seam,u_blink);
  float lower=openLower+.024*arc*u_blink;
  float aa=max(.0025,1.25/radius);
  float aperture=smoothstep(lower-aa,lower+aa,p.y)*(1.-smoothstep(upper-aa,upper+aa,p.y));
  float side=1.-smoothstep(.99,1.01,abs(p.x));
  aperture*=side*(1.-smoothstep(.993,1.,u_blink));
  vec2 globe=p*vec2(.71,1.20);
  vec3 normal=normalize(vec3(globe,sqrt(max(.035,1.-dot(globe,globe)))));
  vec3 light=normalize(vec3(-.56,.72,1.2));
  float diffuse=max(0.,dot(normal,light));
  vec3 sclera=mix(vec3(.28,.32,.36),vec3(.90,.93,.95),.22+.72*diffuse);
  float lidShadow=1.-smoothstep(.005,.17,upper-p.y);
  sclera*=1.-.52*lidShadow;
  sclera*=.54+.46*smoothstep(.0,.36,arc);

  vec2 gaze=u_pointer*vec2(.125,.060)+vec2(.018,.039);
  vec2 ip=(p-gaze)/vec2(1.-abs(u_pointer.x)*.08,1.-abs(u_pointer.y)*.035);
  float r=length(ip);
  float ir=u_compact==1?.354:.326;
  float pupilRatio=.55+.012*sin(u_time*.51);
  float nr=r/ir;
  // The generated iris is a flat material. Remapping radii dilates the pupil
  // while keeping the outer fibres and limbal boundary stable.
  float materialR=mix(.345,1.,clamp((nr-pupilRatio)/(1.-pupilRatio),0.,1.));
  vec2 irisUV=.5+ip/max(r,.0001)*materialR*.465;
  vec3 iris=texture(u_image,irisUV).rgb*(.50+.40*diffuse);
  iris=mix(iris,vec3(.027,.042,.052),smoothstep(.93,1.,nr));
  iris*=1.-.40*lidShadow;
  vec3 result=mix(sclera,iris,1.-smoothstep(ir-aa,ir+aa,r));
  float pupil=1.-smoothstep(pupilRatio-.012,pupilRatio+.014,nr);
  result=mix(result,vec3(.006,.010,.014),pupil);

  // Reflection moves across the curved cornea independently of the iris.
  // Keep glyphs readable but let the dark screen blend into the pupil.
  vec2 glass=p-gaze*.83-vec2(-.012,.028);
  vec2 screenUV=rotate(.055)*glass/vec2(.43,.30);
  screenUV*=1.+.21*dot(screenUV,screenUV);
  screenUV.x+=screenUV.y*.045;
  screenUV+=.5;
  float mask=smoothstep(.01,.085,screenUV.x)*(1.-smoothstep(.915,.99,screenUV.x))*smoothstep(.02,.10,screenUV.y)*(1.-smoothstep(.90,.98,screenUV.y));
  mask*=1.-smoothstep(ir*.81,ir*1.02,r);
  vec3 screen=texture(u_screen,clamp(screenUV,0.,1.)).rgb;
  float ink=dot(screen,vec3(.21,.72,.07));
  float reflectionAlpha=mask*(.12+.70*smoothstep(.09,.54,ink));
  result=mix(result,result*.66+screen*vec3(.74,.83,.91),reflectionAlpha);
  // A soft rectangular catchlight suggests the monitor, without neon rings.
  vec2 b=abs(rotate(.23)*(glass-vec2(-.12,.172)))-vec2(.029,.047);
  float boxDistance=length(max(b,0.))+min(max(b.x,b.y),0.);
  float catchlight=1.-smoothstep(-.006,.008,boxDistance);
  result+=vec3(.75,.85,.91)*catchlight*.40;
  result*=aperture;
  // Lit lid edges and a soft upper fold give the blink volume in the dark.
  float upperLine=exp(-abs(p.y-upper)*135.)*arc*side;
  float lowerLine=exp(-abs(p.y-lower)*180.)*arc*side*(1.-u_blink);
  float lidDistance=(p.y-upper-.035*arc)/.045;
  float lid=exp(-lidDistance*lidDistance)*smoothstep(upper,upper+.015,p.y)*arc*side;
  float crease=exp(-abs(p.y-openUpper-.095*arc)*120.)*arc*side*(1.-u_blink*.75);
  result+=vec3(.18,.22,.27)*(upperLine*.52+lowerLine*.23+lid*.20+crease*.06);
  return result;
}
void main(){
  vec3 c=u_mode==0?blackhole():(u_mode==1?earth():eye());
  color=vec4(c,1.);
}
`
