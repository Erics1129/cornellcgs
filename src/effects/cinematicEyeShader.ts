import { EYE_ART } from './eyeGaze'

/** The artwork is a material: skin and lashes move with the lid while the
 * cornea underneath keeps its shape. Coordinates below trace the source eye. */
export const CINEMATIC_EYE_SHADER = `
float eyeCurve(float x, int mode){
  float top[11]=float[11](.605,.548,.474,.400,.345,.310,.289,.294,.324,.378,.486);
  float low[11]=float[11](.621,.645,.665,.679,.685,.684,.676,.659,.633,.579,.490);
  float shut[11]=float[11](.605,.566,.553,.562,.581,.595,.601,.593,.568,.528,.486);
  float t=clamp((x-.19)/.62,0.,1.)*10.;
  int i=min(9,int(floor(t)));
  float f=t-float(i);
  float a=mode==2?shut[max(0,i-1)]:(mode==1?low[max(0,i-1)]:top[max(0,i-1)]);
  float b=mode==2?shut[i]:(mode==1?low[i]:top[i]);
  float c=mode==2?shut[i+1]:(mode==1?low[i+1]:top[i+1]);
  float d=mode==2?shut[min(10,i+2)]:(mode==1?low[min(10,i+2)]:top[min(10,i+2)]);
  return .5*((2.*b)+(-a+c)*f+(2.*a-5.*b+4.*c-d)*f*f+(-a+3.*b-3.*c+d)*f*f*f);
}
vec3 eyeMaterial(vec2 uv){
  return texture(u_image,vec2(clamp(uv.x,0.,1.),1.-clamp(uv.y,0.,1.))).rgb;
}
vec3 eye(){
  bool compact=u_compact==1;
  float width=compact?u_size.x*${EYE_ART.compactWidth}:min(u_size.x*${EYE_ART.desktopWidth},u_size.y*${EYE_ART.desktopHeight});
  vec2 q=(v_uv-.5)*u_size/vec2(width,width/${EYE_ART.aspect});
  q.y=-q.y;
  q+=vec2(${EYE_ART.anchorX},${EYE_ART.anchorY});
  if(any(lessThan(q,vec2(0.)))||any(greaterThan(q,vec2(1.))))return vec3(0.);
  float openUpper=eyeCurve(q.x,0);
  float openLower=eyeCurve(q.x,1);
  float horizontal=smoothstep(.185,.197,q.x)*(1.-smoothstep(.798,.818,q.x));
  float gap=max(0.,openLower-openUpper);
  float closure=u_blink*horizontal;
  float closed=eyeCurve(q.x,2);
  float upper=mix(openUpper,closed,closure);
  float lower=mix(openLower,closed,closure);
  float aa=max(.0011,1.1/(width/1.5));
  float aperture=smoothstep(upper-aa,upper+aa,q.y)*(1.-smoothstep(lower-aa,lower+aa,q.y))*horizontal;
  aperture*=1.-smoothstep(.992,1.,u_blink);

  // Inverse deformation: the lid's material, rim and lashes follow its edge.
  // The upper face stays anchored, so blinking cannot squash the eyeball.
  vec2 skinUV=q;
  if(q.y<upper){
    float anchor=max(0.,openUpper-.31);
    float lift=smoothstep(anchor,upper,q.y);
    skinUV.y-=(upper-openUpper)*lift;
  }else if(q.y>lower){
    skinUV.y+=(openLower-lower)*(1.-smoothstep(lower,openLower+.18,q.y));
  }
  vec3 skin=eyeMaterial(skinUV);
  vec2 closedUV=q;
  if(q.y<upper) closedUV.y+=(closed-upper)*smoothstep(max(0.,openUpper-.31),upper,q.y);
  else if(q.y>lower) closedUV.y+=(closed-lower)*(1.-smoothstep(lower,openLower+.18,q.y));
  vec3 closedSkin=texture(u_lid,vec2(clamp(closedUV.x,0.,1.),1.-clamp(closedUV.y,0.,1.))).rgb;
  skin=mix(skin,closedSkin,smoothstep(.08,.98,u_blink));

  vec2 irisCenter=vec2(${EYE_ART.irisX},${EYE_ART.irisY});
  vec2 irisAxes=vec2(.119,.191);
  float inner=smoothstep(openUpper+.009,openUpper+.055,q.y)*(1.-smoothstep(openLower-.045,openLower-.006,q.y))*horizontal;
  // Rotate the central material into the look, tapering through the sclera
  // to fixed corners. The skin and lid silhouettes never translate with it.
  float follow=1.-smoothstep(1.05,2.6,length((q-irisCenter)/irisAxes));
  vec2 gaze=vec2(u_pointer.x*.031,-u_pointer.y*.022)*inner*follow;
  vec2 ip=(q-irisCenter-gaze)/irisAxes;
  float r=length(ip);
  // A slightly dilated pupil gives the reflected editor room, while the
  // surrounding iris fibres remain anchored at the limbal boundary.
  float pupil=.54+.008*sin(u_time*.47);
  float sourceR=r<pupil?r*.43/pupil:mix(.43,1.,clamp((r-pupil)/(1.-pupil),0.,1.));
  vec2 irisUV=irisCenter+ip/max(r,.0001)*sourceR*irisAxes;
  vec2 eyeUV=mix(q-gaze,irisUV,1.-smoothstep(.86,1.04,r));
  vec3 sphere=eyeMaterial(eyeUV);
  float lidShadow=1.-smoothstep(.001,.048,q.y-upper);
  sphere*=1.-lidShadow*.55*closure;

  // Live source code sits on a softly curved corneal reflection. Upright,
  // readable glyphs are drawn by CodeReflection, never baked into the image.
  vec2 glass=q-irisCenter-gaze*.62-vec2(.0,.018);
  vec2 screen=glass/vec2(compact?.242:.186,compact?.171:.139);
  screen=rotate(-.045)*screen;
  screen.x+=screen.y*screen.y*.085;
  screen.y+=screen.x*screen.x*.065;
  vec2 uv=screen+.5;
  float windowMask=smoothstep(.012,.055,uv.x)*(1.-smoothstep(.945,.988,uv.x))*smoothstep(.018,.07,uv.y)*(1.-smoothstep(.93,.982,uv.y));
  windowMask*=1.-smoothstep(.77,1.,r);
  vec3 code=texture(u_screen,vec2(clamp(uv.x,0.,1.),1.-clamp(uv.y,0.,1.))).rgb;
  float luminance=dot(code,vec3(.21,.72,.07));
  float reflection=windowMask*(.12+.76*smoothstep(.08,.62,luminance));
  sphere=mix(sphere,sphere*.72+code*vec3(.78,.91,1.),reflection);
  // Preserve the photographed lash silhouettes over the moving aperture.
  // Dark strands are keyed locally from the closed material; the narrow band
  // follows the lid edge rather than stretching hairs across the whole face.
  vec2 lashUV=vec2(q.x,q.y+closed-upper);
  vec3 lashes=texture(u_lid,vec2(clamp(lashUV.x,0.,1.),1.-clamp(lashUV.y,0.,1.))).rgb;
  float lashTone=max(lashes.r,max(lashes.g,lashes.b));
  float lashBand=smoothstep(-.007,.006,q.y-upper)*(1.-smoothstep(.038,.085,q.y-upper));
  float lashAlpha=(1.-smoothstep(.025,.135,lashTone))*lashBand*horizontal*smoothstep(.12,.68,u_blink);
  sphere=mix(sphere,lashes,lashAlpha*.92);
  vec3 result=mix(skin,sphere,aperture);
  // Dark contact line closes fully, without an emissive slit at contact.
  float rim=exp(-abs(q.y-upper)*700.)*horizontal*closure;
  result*=1.-rim*.48;
  float edge=smoothstep(0.,.09,v_uv.y)*(1.-smoothstep(.91,1.,v_uv.y));
  edge*=smoothstep(0.,.045,v_uv.x)*(1.-smoothstep(.955,1.,v_uv.x));
  return result*edge;
}
`
