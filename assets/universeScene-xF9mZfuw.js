import{f as fe,i as S,t as O,o as _e,b as xe,S as ne}from"./main-sOIdrgIS.js";import"./global-4Uv8Ox8Z.js";const V=e=>Math.max(0,Math.min(1,e)),H=e=>e*e*e*(e*(e*6-15)+10),Y=e=>16*e*e*(1-e)*(1-e);function Ee(e){const o=V(e),d=V(o/.37),s=V((o-.32)/.41),a=V((o-.69)/.31);return{travel:136*H(d)+180*H(s)+128*H(a),envelope:Math.min(1,.9*Y(d)+Y(s)+.8*Y(a))}}const le=`#version 300 es
in vec2 a_corner;
out vec2 v_uv;
void main() {
  v_uv = a_corner * .5 + .5;
  gl_Position = vec4(a_corner, 0., 1.);
}`,ge=e=>`#version 300 es
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
${fe(300)}
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

  ${e?"outColor=vec4(film(color),1.);":"outColor=vec4(color,1.);"}
}`,be=`#version 300 es
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
}`,Te=`#version 300 es
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
}`,we=`#version 300 es
precision highp float;
in vec2 v_uv;
out vec4 outColor;
uniform sampler2D u_scene;
uniform sampler2D u_bloom;
/* 0 = none, 1 = chain (u_bloom, summed levels), 2 = the scene target's own mipmaps */
uniform float u_glowMode;
uniform float u_glowLevels;
uniform float u_glow;
${fe(300)}
void main() {
  vec3 c=texture(u_scene,v_uv).rgb;
  if(u_glowMode>1.5) c=mix(c,mipGlow(u_scene,v_uv,3.,5.),u_glow);
  else if(u_glowMode>.5) c=mix(c,texture(u_bloom,v_uv).rgb/u_glowLevels,u_glow);
  // soft falloff toward the corners, in scene light (the lens adds the vignette every chapter shares)
  vec2 d=v_uv-.5;
  c*=1.-.3*smoothstep(.2,.78,dot(d,d)*2.);
  outColor=vec4(film(c),1.);
}`,ue=`#version 300 es
in vec2 a_corner;
out vec2 v_uv;
void main() {
  v_uv = a_corner * .5 + .5;
  gl_Position = vec4(a_corner, 0., 1.);
}`,Re=`#version 300 es
precision highp float;
in vec2 v_uv;
out vec4 o;
uniform sampler2D u_src;
uniform vec2 u_texel;
uniform int u_first;
float karis(vec3 c) { return 1. / (1. + dot(c, vec3(.2126, .7152, .0722))); }
void main() {
  vec2 x = vec2(u_texel.x, 0.), y = vec2(0., u_texel.y), uv = v_uv;
  vec3 a = texture(u_src, uv - 2. * x + 2. * y).rgb, b = texture(u_src, uv + 2. * y).rgb, c = texture(u_src, uv + 2. * x + 2. * y).rgb;
  vec3 d = texture(u_src, uv - 2. * x).rgb, e = texture(u_src, uv).rgb, f = texture(u_src, uv + 2. * x).rgb;
  vec3 g = texture(u_src, uv - 2. * x - 2. * y).rgb, h = texture(u_src, uv - 2. * y).rgb, i = texture(u_src, uv + 2. * x - 2. * y).rgb;
  vec3 j = texture(u_src, uv - x + y).rgb, k = texture(u_src, uv + x + y).rgb, l = texture(u_src, uv - x - y).rgb, m = texture(u_src, uv + x - y).rgb;
  vec3 r;
  if (u_first == 1) {
    vec3 g0 = (a + b + d + e) * .25, g1 = (b + c + e + f) * .25, g2 = (d + e + g + h) * .25, g3 = (e + f + h + i) * .25, g4 = (j + k + l + m) * .25;
    float w0 = karis(g0), w1 = karis(g1), w2 = karis(g2), w3 = karis(g3), w4 = karis(g4);
    r = (g0 * w0 * .125 + g1 * w1 * .125 + g2 * w2 * .125 + g3 * w3 * .125 + g4 * w4 * .5) / (w0 * .125 + w1 * .125 + w2 * .125 + w3 * .125 + w4 * .5);
  } else {
    r = e * .125 + (a + c + g + i) * .03125 + (b + d + f + h) * .0625 + (j + k + l + m) * .125;
  }
  o = vec4(max(r, vec3(0.)), 1.);
}`,ye=`#version 300 es
precision highp float;
in vec2 v_uv;
out vec4 o;
uniform sampler2D u_src;
uniform vec2 u_radius;
void main() {
  vec2 x = vec2(u_radius.x, 0.), y = vec2(0., u_radius.y), uv = v_uv;
  vec3 r = texture(u_src, uv).rgb * 4.
    + (texture(u_src, uv - x).rgb + texture(u_src, uv + x).rgb + texture(u_src, uv - y).rgb + texture(u_src, uv + y).rgb) * 2.
    + texture(u_src, uv - x - y).rgb + texture(u_src, uv + x - y).rgb + texture(u_src, uv - x + y).rgb + texture(u_src, uv + x + y).rgb;
  o = vec4(r / 16., 1.);
}`;function Ae(e){return!!e.getExtension("EXT_color_buffer_float")}function K(e,o,d,s=!1){const a=e.createTexture(),m=e.createFramebuffer();if(!a||!m)return null;e.bindTexture(e.TEXTURE_2D,a),e.texImage2D(e.TEXTURE_2D,0,e.R11F_G11F_B10F,o,d,0,e.RGB,e.HALF_FLOAT,null),e.texParameteri(e.TEXTURE_2D,e.TEXTURE_MIN_FILTER,s?e.LINEAR_MIPMAP_LINEAR:e.LINEAR),e.texParameteri(e.TEXTURE_2D,e.TEXTURE_MAG_FILTER,e.LINEAR),e.texParameteri(e.TEXTURE_2D,e.TEXTURE_WRAP_S,e.CLAMP_TO_EDGE),e.texParameteri(e.TEXTURE_2D,e.TEXTURE_WRAP_T,e.CLAMP_TO_EDGE),e.bindFramebuffer(e.FRAMEBUFFER,m),e.framebufferTexture2D(e.FRAMEBUFFER,e.COLOR_ATTACHMENT0,e.TEXTURE_2D,a,0);const i=e.checkFramebufferStatus(e.FRAMEBUFFER)===e.FRAMEBUFFER_COMPLETE;return e.bindFramebuffer(e.FRAMEBUFFER,null),i?{tex:a,fbo:m,w:o,h:d}:(e.deleteTexture(a),e.deleteFramebuffer(m),null)}function J(e,o){o&&(e.deleteTexture(o.tex),e.deleteFramebuffer(o.fbo))}function Fe(e){const o=S(e,ue,Re,{a_corner:0}),d=S(e,ue,ye,{a_corner:0});if(!o||!d)return null;let s=!1,a={},m={},i=[],g=[];const R=()=>s?!0:!o.finish()||!d.finish()?!1:(a={src:e.getUniformLocation(o.program,"u_src"),texel:e.getUniformLocation(o.program,"u_texel"),first:e.getUniformLocation(o.program,"u_first")},m={src:e.getUniformLocation(d.program,"u_src"),radius:e.getUniformLocation(d.program,"u_radius")},s=!0,!0),y=()=>{for(const l of i)J(e,l);for(const l of g)J(e,l);i=[],g=[]};return{get levels(){return i.length},resize(l,p,T){y();let n=l,u=p;for(let f=0;f<T;f++){n=Math.max(1,n>>1),u=Math.max(1,u>>1);const h=K(e,n,u);if(!h)return y(),!1;i.push(h)}for(let f=0;f<T-1;f++){const h=K(e,i[f].w,i[f].h);if(!h)return y(),!1;g.push(h)}return R()},render(l){if(!i.length||!R())return l.tex;e.disable(e.BLEND),e.activeTexture(e.TEXTURE0),e.useProgram(o.program),e.uniform1i(a.src,0);let p=l;for(let n=0;n<i.length;n++){const u=i[n];e.bindFramebuffer(e.FRAMEBUFFER,u.fbo),e.viewport(0,0,u.w,u.h),e.bindTexture(e.TEXTURE_2D,p.tex),e.uniform2f(a.texel,1/p.w,1/p.h),e.uniform1i(a.first,n===0?1:0),e.drawArrays(e.TRIANGLES,0,6),p=u}e.useProgram(d.program),e.uniform1i(m.src,0);let T=i[i.length-1];for(let n=g.length-1;n>=0;n--){const u=g[n];e.bindFramebuffer(e.FRAMEBUFFER,u.fbo),e.viewport(0,0,u.w,u.h),e.disable(e.BLEND),e.bindTexture(e.TEXTURE_2D,i[n].tex),e.uniform2f(m.radius,0,0),e.drawArrays(e.TRIANGLES,0,6),e.enable(e.BLEND),e.blendFunc(e.ONE,e.ONE),e.bindTexture(e.TEXTURE_2D,T.tex),e.uniform2f(m.radius,1/T.w,1/T.h),e.drawArrays(e.TRIANGLES,0,6),T=u}return e.disable(e.BLEND),e.bindFramebuffer(e.FRAMEBUFFER,null),T.tex},pixels(){let l=0;for(const p of i)l+=p.w*p.h;for(const p of g)l+=p.w*p.h;return l},release:y,dispose(){y(),e.deleteProgram(o.program),e.deleteProgram(d.program)}}}const Ue=["/assets/scenes/galaxy.webp","/assets/scenes/galaxy-violet.webp"],Le=.62,ce=e=>Math.max(0,Math.min(1,e)),$=(e,o,d)=>Object.fromEntries(d.map(s=>[s,e.getUniformLocation(o,s)]));function Ie(e){const{section:o,viewport:d,surface:s}=e;let a=null,m=!1,i=!1,g=null,R=!1,y=0,l=0,p=1,T=0,n=null,u=null,f=null,h={},A={},L={},I=null,P=null,C=null,D=null,z=null;const M=[null,null],U=[!1,!1],W=[1.5,1.5];let x=null,w=null,X=!0,F="none",k=0,j=O().stars,G=1,B=!0;const Q=()=>{a&&(J(a,x),x=null,w?.release())},Z=()=>{if(a){Q(),w?.dispose(),w=null,a.deleteVertexArray(D),a.deleteVertexArray(z),a.deleteBuffer(P),a.deleteBuffer(C),M.forEach((t,c)=>{a.deleteTexture(t),M[c]=null,U[c]=!1});for(const t of[n,u,f])t&&a.deleteProgram(t.program);n=u=f=null,D=z=null,P=C=null,I=null,i=!1}},ee=()=>{if(!a)return;B=!1;const t=O(),c=d.clientWidth,v=d.clientHeight;if(!c||!v)return;G=Math.min(window.devicePixelRatio||1,t.dprCap,Math.sqrt(t.pixelCap*Le/(c*v)))*t.scale;const r=Math.max(1,Math.round(c*G)),E=Math.max(1,Math.round(v*G));if((s.width!==r||s.height!==E)&&(s.width=r,s.height=E),Q(),F="none",k=0,!X){const _=t.bloom;x=K(a,r,E,_==="mip"),x&&_.startsWith("chain")&&w?(k=Number(_.slice(5)),F=w.resize(r,E,k)?"chain":"none"):x&&_==="mip"&&(F="mip")}},te=async()=>{if(!a){try{a=s.getContext("webgl2",{alpha:!1,antialias:!1,depth:!1,stencil:!1,powerPreference:"high-performance"})}catch{}if(!a)return e.unavailable()}const t=a;X=!Ae(t)||O().bloom==="off",n=S(t,le,ge(X),{a_corner:0}),u=S(t,be,Te,{a_corner:0,a_seed:1}),f=X?null:S(t,le,we,{a_corner:0}),w=X?null:Fe(t);const c=await Promise.all([n?.ready,u?.ready,f?f.ready:!0]);if(m||t.isContextLost())return;if(!n||!u||c.includes(!1)||c.includes(void 0))return e.unavailable();h=$(t,n.program,["u_size","u_progress","u_travel","u_hasImage","u_hasSecondImage","u_imageAspect","u_secondImageAspect","u_image","u_secondImage"]),A=$(t,u.program,["u_size","u_travel","u_speed","u_direction","u_progress","u_pixelRatio","u_gain"]),f&&(L=$(t,f.program,["u_scene","u_bloom","u_glowMode","u_glowLevels","u_glow"])),I=xe(t,(f??n).program),P=t.createBuffer(),t.bindBuffer(t.ARRAY_BUFFER,P),t.bufferData(t.ARRAY_BUFFER,new Float32Array([-1,-1,1,-1,-1,1,-1,1,1,-1,1,1]),t.STATIC_DRAW);const v=()=>{t.bindBuffer(t.ARRAY_BUFFER,P),t.enableVertexAttribArray(0),t.vertexAttribPointer(0,2,t.FLOAT,!1,0,0)};D=t.createVertexArray(),t.bindVertexArray(D),v(),z=t.createVertexArray(),t.bindVertexArray(z),v(),j=O().stars;const r=new Float32Array(2e3*4);let E=73129;for(let _=0;_<r.length;_++)E=Math.imul(E,1664525)+1013904223>>>0,r[_]=E/4294967296;C=t.createBuffer(),t.bindBuffer(t.ARRAY_BUFFER,C),t.bufferData(t.ARRAY_BUFFER,r,t.STATIC_DRAW),t.enableVertexAttribArray(1),t.vertexAttribPointer(1,4,t.FLOAT,!1,0,0),t.vertexAttribDivisor(1,1),t.bindVertexArray(null),t.disable(t.DEPTH_TEST),ee(),i=!0,o.dataset.renderer="webgl2",e.handle()?.invalidate(),Ue.forEach(async(_,b)=>{try{const q=await(await fetch(_)).blob(),N=await createImageBitmap(q);if(m||t.isContextLost()||!i)return N.close();const ie=t.createTexture();t.activeTexture(t.TEXTURE0+b),t.bindTexture(t.TEXTURE_2D,ie),t.pixelStorei(t.UNPACK_FLIP_Y_WEBGL,!1),t.texImage2D(t.TEXTURE_2D,0,t.RGBA,t.RGBA,t.UNSIGNED_BYTE,N),t.generateMipmap(t.TEXTURE_2D),t.texParameteri(t.TEXTURE_2D,t.TEXTURE_MIN_FILTER,t.LINEAR_MIPMAP_LINEAR),t.texParameteri(t.TEXTURE_2D,t.TEXTURE_MAG_FILTER,t.LINEAR),t.texParameteri(t.TEXTURE_2D,t.TEXTURE_WRAP_S,t.CLAMP_TO_EDGE),t.texParameteri(t.TEXTURE_2D,t.TEXTURE_WRAP_T,t.CLAMP_TO_EDGE),W[b]=N.width/N.height,N.close(),M[b]=ie,U[b]=!0,o.dataset[b?"secondTexture":"texture"]="ready",e.handle()?.invalidate()}catch{o.dataset[b?"secondTexture":"texture"]="procedural"}})},re=(t,c,v)=>{const r=a,E=Ee(t),_=s.width,b=s.height;if(r.bindFramebuffer(r.FRAMEBUFFER,x?x.fbo:null),r.viewport(0,0,_,b),r.disable(r.BLEND),r.useProgram(n.program),r.bindVertexArray(D),r.uniform2f(h.u_size,_,b),r.uniform1f(h.u_progress,t),r.uniform1f(h.u_travel,E.travel),r.uniform1f(h.u_hasImage,U[0]?1:0),r.uniform1f(h.u_hasSecondImage,U[1]?1:0),r.uniform1f(h.u_imageAspect,W[0]),r.uniform1f(h.u_secondImageAspect,W[1]),r.uniform1i(h.u_image,0),r.uniform1i(h.u_secondImage,1),r.activeTexture(r.TEXTURE0),r.bindTexture(r.TEXTURE_2D,M[0]),r.activeTexture(r.TEXTURE1),r.bindTexture(r.TEXTURE_2D,M[1]),x||I(ne.universe,v),r.drawArrays(r.TRIANGLES,0,6),r.enable(r.BLEND),r.blendFunc(r.ONE,r.ONE),r.useProgram(u.program),r.bindVertexArray(z),r.uniform2f(A.u_size,_,b),r.uniform1f(A.u_travel,E.travel),r.uniform1f(A.u_speed,E.envelope*Math.sqrt(c)),r.uniform1f(A.u_direction,p),r.uniform1f(A.u_progress,t),r.uniform1f(A.u_pixelRatio,G),r.uniform1f(A.u_gain,x?1.5:.7),r.drawArraysInstanced(r.TRIANGLES,0,6,Math.min(j,2e3)),r.disable(r.BLEND),x&&f){r.bindVertexArray(D);let q=null;F==="chain"&&w&&(q=w.render(x)),r.activeTexture(r.TEXTURE2),r.bindTexture(r.TEXTURE_2D,x.tex),F==="mip"&&r.generateMipmap(r.TEXTURE_2D),r.activeTexture(r.TEXTURE3),r.bindTexture(r.TEXTURE_2D,q??x.tex),r.bindFramebuffer(r.FRAMEBUFFER,null),r.viewport(0,0,_,b),r.useProgram(f.program),r.uniform1i(L.u_scene,2),r.uniform1i(L.u_bloom,3),r.uniform1f(L.u_glowMode,F==="chain"?1:F==="mip"?2:0),r.uniform1f(L.u_glowLevels,Math.max(1,k)),r.uniform1f(L.u_glow,F==="chain"?.3:.1),I(ne.universe,v),r.drawArrays(r.TRIANGLES,0,6),r.activeTexture(r.TEXTURE0)}r.bindVertexArray(null)},de=()=>{if(!(i||m))return g??=te().finally(()=>{g=null})},ve=(t,c)=>{if(!i||!a||a.isContextLost()||!c.chapter)return!1;const v=c.frame;y=ce(c.chapter.vrun),p=v.direction;const r=c.settle||v.idle?0:ce(Math.abs(v.velocity)/Math.max(1,v.vh*1.6));return l=c.settle?0:l+(r-l)*(1-Math.exp(-Math.max(c.dt,.001)/.085)),l<.001&&r===0&&(l=0),B&&(v.idle||!R)&&ee(),s.width?(re(y,l,l?++T%64:0),o.dataset.motion=l?"flying":"idle",R||(R=!0,requestAnimationFrame(()=>{!m&&i&&e.handle()?.ready()})),l>0||r>0):!1},me=()=>{!a||!i||(Z(),s.width=s.height=0,R=!1,e.handle()?.lost(),o.dataset.renderer="pending")},he=t=>{j=t.stars,B=!0,e.handle()?.invalidate()},ae=new ResizeObserver(()=>{B=!0,e.handle()?.invalidate()});ae.observe(d);const pe=_e(()=>{B&&e.handle()?.invalidate()}),oe=t=>{t.preventDefault(),i=!1,R=!1,n=u=f=null,w=null,x=null,I=null,M.fill(null),U.fill(!1),o.dataset.renderer="lost",e.handle()?.lost()},se=()=>{m||(g=te().finally(()=>{g=null}))};return s.addEventListener("webglcontextlost",oe),s.addEventListener("webglcontextrestored",se),{prepare:de,draw:ve,release:me,resize:he,capture(t,c="image/webp",v=.8){return i?(re(t,0,0),s.toDataURL(c,v)):null},ready:()=>i&&U[0]&&U[1],dispose(){m=!0,pe(),ae.disconnect(),s.removeEventListener("webglcontextlost",oe),s.removeEventListener("webglcontextrestored",se),Z()}}}export{Ie as createUniverse};
