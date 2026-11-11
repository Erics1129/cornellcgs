import{a as L,j as ue}from"./global-4Uv8Ox8Z.js";import{E as _,f as Be,b as Ce,d as Ne,S as Ye,e as Le,s as Fe,g as Ge,h as Oe}from"./main-sOIdrgIS.js";const N=["center","left","right","up","down","quarter","half","threequarter","closed"],ie=[[.577,.425],[.467,.438],[.623,.43],[.571,.369],[.57,.525]],$e=`#version 300 es
in vec2 a_position;
out vec2 v_uv;
void main() { v_uv = a_position * .5 + .5; gl_Position = vec4(a_position, 0., 1.); }
`,We=`#version 300 es
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
${Be(300)}

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
  float width = compact ? u_size.x*${_.compactWidth} : min(u_size.x*${_.desktopWidth}, u_size.y*${_.desktopHeight});
  vec2 q = (v_uv-.5)*u_size/vec2(width,width/${_.aspect});
  q.y = -q.y;
  q += vec2(${_.anchorX},${_.anchorY});
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
  color = vec4(film(srgbToLinear(result*edge)),1.);
}
`,Pe="/assets/sequences/eye-v5/",je=(m,w=0)=>Number.isFinite(m)?m:w,He=(m,w,P)=>Math.max(w,Math.min(P,je(m))),Ve=m=>{const w=(m%13.7+13.7)%13.7;return Math.max(...[1.5,5.6,10.8].map(P=>Oe(w-P)))};function Je({paused:m=!1}){const w=L.useRef(null),P=L.useRef(null),K=L.useRef(m),[ze,Se]=L.useState(!1),[pe,oe]=L.useState(!1);return K.current=m,L.useEffect(()=>{const o=w.current,l=P.current;let z=!0,Q=!1,v=!1,Y=!1,u=!1,S=!1,F=0,G=0,g=0,M=!1,i=null,n=null,O=null,he=null,U=null,I=null,q=null,ae=-1/0,de=!1,r=null,p=!1,$=0,W=0,re=-1/0,D=!1,J=-1/0,j={x:0,y:0},H={x:0,y:0},V={x:0,y:0,vx:0,vy:0},h={time:0,gaze:{x:0,y:0},blink:0},ne=[],X=null;const fe=new Int32Array(N.length),se=new Float32Array(ie.flat()),E={},x=matchMedia("(prefers-reduced-motion: reduce)"),T=matchMedia("(max-width:1023px), (orientation:portrait)"),Me=matchMedia("(pointer:coarse)");function b(){o.dataset.renderer=u?"webgl2":S?"lost":Y?"loading":"still",o.dataset.playback=document.hidden?"hidden":v?x.matches?"reduced":K.current?"paused":M?"manual":u?"playing":"loading":"offscreen"}function B(){cancelAnimationFrame(F),F=0,G=0}function me(){return z&&u&&v&&!document.hidden&&!x.matches&&!K.current&&!M&&!S}function R(){x.matches&&!M&&u&&v&&!document.hidden&&(h.time!==1.8||h.gaze.x!==0||h.gaze.y!==0||h.blink!==0)&&k({time:1.8,gaze:{x:0,y:0},blink:0},!0),b(),me()&&!F&&(F=requestAnimationFrame(Ie))}function Z(){if(!Q)return;r=o.getBoundingClientRect();const t=T.matches?r.width*_.compactWidth:Math.min(r.width*_.desktopWidth,r.height*_.desktopHeight);o.style.setProperty("--eye-art-width",`${t}px`);const e=Me.matches?1152:1680,c=Math.min(devicePixelRatio||1,1.6,e/Math.max(1,r.width)),a=Math.max(1,Math.round(r.width*c)),d=Math.max(1,Math.round(r.height*c));(l.width!==a||l.height!==d)&&(l.width=a,l.height=d,u&&v&&!document.hidden&&k(h))}function k(t,e=!1){!z||!u||!i||i.isContextLost()||!q||(x.matches&&!M&&(t={time:1.8,gaze:{x:0,y:0},blink:0}),h={time:t.time,gaze:{x:t.gaze.x,y:t.gaze.y},blink:t.blink},(e||Math.abs(t.time-ae)>=.04||T.matches!==de)&&(q.paint(t.time*1e3,T.matches),i.activeTexture(i.TEXTURE1),i.bindTexture(i.TEXTURE_2D,I),i.texSubImage2D(i.TEXTURE_2D,0,0,0,i.RGBA,i.UNSIGNED_BYTE,q.canvas),ae=t.time,de=T.matches),i.useProgram(n),i.activeTexture(i.TEXTURE0),i.bindTexture(i.TEXTURE_2D_ARRAY,U),i.viewport(0,0,l.width,l.height),i.uniform2f(E.u_size,l.width,l.height),i.uniform2f(E.u_gaze,t.gaze.x,t.gaze.y),i.uniform1f(E.u_blink,t.blink),i.uniform1i(E.u_compact,T.matches?1:0),he?.(Ye.eye,0),i.drawArrays(i.TRIANGLES,0,3))}function Ue(){return!r||$<r.left||$>r.right||W<r.top||W>r.bottom?(p=!1,Le(g)):Ge($,W,r,T.matches)}function Ie(t){if(F=0,!me()){G=0,R();return}const e=G?Math.min(.05,Math.max(0,(t-G)/1e3)):0;G=t,g+=e;const c=p?Ue():null,a=p&&g-re<2.6;if(D&&!a&&(J=g,j={x:V.x,y:V.y}),D=a,H=D&&c?c:Le(g),!D&&g-J<.85){const d=He((g-J)/.85,0,1),A=d*d*(3-2*d);H={x:j.x+(H.x-j.x)*A,y:j.y+(H.y-j.y)*A}}Fe(V,H,e,D),k({time:g,gaze:V,blink:Ve(g)}),R()}function le(){i&&(i.deleteTexture(U),i.deleteTexture(I),i.deleteBuffer(O),i.deleteProgram(n),U=I=null,n=null,O=null,u=!1)}function De(t){if(!z||!i||S||!t[0])return;const e=i;le();const c=[];try{const a=(s,y)=>{const f=e.createShader(s);if(c.push(f),e.shaderSource(f,y),e.compileShader(f),!e.getShaderParameter(f,e.COMPILE_STATUS))throw new Error(e.getShaderInfoLog(f)||"Eye shader failed");return f},d=a(e.VERTEX_SHADER,$e),A=a(e.FRAGMENT_SHADER,We);if(n=e.createProgram(),e.attachShader(n,d),e.attachShader(n,A),e.linkProgram(n),!e.getProgramParameter(n,e.LINK_STATUS))throw new Error(e.getProgramInfoLog(n)||"Eye program failed");e.useProgram(n),O=e.createBuffer(),e.bindBuffer(e.ARRAY_BUFFER,O),e.bufferData(e.ARRAY_BUFFER,new Float32Array([-1,-1,3,-1,-1,3]),e.STATIC_DRAW);const ke=e.getAttribLocation(n,"a_position");e.enableVertexAttribArray(ke),e.vertexAttribPointer(ke,2,e.FLOAT,!1,0,0);for(const s of["u_poses","u_code","u_size","u_gaze","u_pupils[0]","u_layers[0]","u_compact","u_blink"])E[s]=e.getUniformLocation(n,s);he=Ce(e,n);const Ae=s=>{e.texParameteri(s,e.TEXTURE_MIN_FILTER,e.LINEAR),e.texParameteri(s,e.TEXTURE_MAG_FILTER,e.LINEAR),e.texParameteri(s,e.TEXTURE_WRAP_S,e.CLAMP_TO_EDGE),e.texParameteri(s,e.TEXTURE_WRAP_T,e.CLAMP_TO_EDGE)};e.pixelStorei(e.UNPACK_FLIP_Y_WEBGL,!1),U=e.createTexture(),e.activeTexture(e.TEXTURE0),e.bindTexture(e.TEXTURE_2D_ARRAY,U),Ae(e.TEXTURE_2D_ARRAY);const C=t[0];if(e.texStorage3D(e.TEXTURE_2D_ARRAY,1,e.RGBA8,C.width,C.height,N.length),t.forEach((s,y)=>{const f=s&&s.width===C.width&&s.height===C.height;fe[y]=f?y:0,f&&e.texSubImage3D(e.TEXTURE_2D_ARRAY,0,0,0,y,C.width,C.height,1,e.RGBA,e.UNSIGNED_BYTE,s),y<ie.length&&(se[y*2]=ie[f?y:0][0],se[y*2+1]=ie[f?y:0][1])}),q??=new Ne,I=e.createTexture(),e.activeTexture(e.TEXTURE1),e.bindTexture(e.TEXTURE_2D,I),Ae(e.TEXTURE_2D),e.texStorage2D(e.TEXTURE_2D,1,e.RGBA8,q.canvas.width,q.canvas.height),e.uniform1i(E.u_poses,0),e.uniform1i(E.u_code,1),e.uniform1iv(E["u_layers[0]"],fe),e.uniform2fv(E["u_pupils[0]"],se),e.getError()!==e.NO_ERROR)throw new Error("Eye texture upload failed");u=!0,ae=-1/0,Z(),v&&!document.hidden&&k(x.matches?{time:1.8,gaze:{x:0,y:0},blink:0}:h,!0),oe(!0),b(),R()}catch(a){le(),oe(!1),console.warn("Eye sequence uses its center still:",a)}finally{c.forEach(a=>e.deleteShader(a))}}async function ce(){if(!z||Y||u||S||!Q||document.hidden)return;if(i??=l.getContext("webgl2",{alpha:!1,antialias:!1,powerPreference:"low-power"}),!i){b();return}Y=!0,b();const t=new AbortController;X=t;const e=Array(N.length).fill(null);ne=N.map(()=>"loading");try{let c=0;await Promise.all(Array.from({length:3},async()=>{for(;c<N.length&&!t.signal.aborted;){const a=c++;try{const d=await fetch(`${Pe}${N[a]}.webp`,{signal:t.signal});if(!d.ok)throw new Error("Pose unavailable");const A=await createImageBitmap(await d.blob());if(t.signal.aborted||!z){A.close();break}e[a]=A,ne[a]="ready"}catch{ne[a]="center-fallback"}}})),t.signal.aborted||De(e)}finally{e.forEach(c=>c?.close()),X===t&&(Y=!1,X=null,b())}}const ve=new IntersectionObserver(([t])=>{Q=t.isIntersecting,Q&&(Se(!0),Z(),ce())},{rootMargin:"300px 0px"}),ge=new IntersectionObserver(([t])=>{v=t.isIntersecting&&t.intersectionRect.height>0,B(),v?(r=o.getBoundingClientRect(),u&&!document.hidden&&k(h),R()):(p=!1,b())},{threshold:0}),ee=t=>{t.pointerType==="touch"||x.matches||K.current||M||((!p||Math.hypot(t.clientX-$,t.clientY-W)>.25)&&(re=g),p=!0,$=t.clientX,W=t.clientY,r=o.getBoundingClientRect(),R())},te=t=>{t.pointerType!=="touch"&&(p=!1)},ye=()=>{p=!1},we=()=>{v&&p&&(r=o.getBoundingClientRect())},Ee=()=>{B(),R()},xe=()=>{B(),document.hidden?(p=!1,b()):(ce(),R())},be=()=>{B(),x.matches&&(p=!1,M=!1,D=!1,J=re=-1/0,V={x:0,y:0,vx:0,vy:0},h={time:1.8,gaze:{x:0,y:0},blink:0},v&&!document.hidden&&k(h,!0)),R()},_e=()=>{Z(),u&&v&&!document.hidden&&k(h,!0)},Te=t=>{t.preventDefault(),S=!0,u=!1,X?.abort(),B(),oe(!1),b()},Re=()=>{S=!1,Y=!1,X=null,n=null,O=null,U=I=null,ce()},qe=new ResizeObserver(Z);ve.observe(o),ge.observe(o),qe.observe(o),o.addEventListener("pointerenter",ee,{passive:!0}),o.addEventListener("pointermove",ee,{passive:!0}),o.addEventListener("pointerleave",te),o.addEventListener("pointercancel",te),o.addEventListener("scene-playback",Ee),window.addEventListener("scroll",we,{passive:!0}),window.addEventListener("blur",ye),document.addEventListener("visibilitychange",xe),x.addEventListener("change",be),T.addEventListener("change",_e),l.addEventListener("webglcontextlost",Te),l.addEventListener("webglcontextrestored",Re);const Xe={};return b(),()=>{z=!1,B(),X?.abort(),ve.disconnect(),ge.disconnect(),qe.disconnect(),o.removeEventListener("pointerenter",ee),o.removeEventListener("pointermove",ee),o.removeEventListener("pointerleave",te),o.removeEventListener("pointercancel",te),o.removeEventListener("scene-playback",Ee),window.removeEventListener("scroll",we),document.removeEventListener("visibilitychange",xe),window.removeEventListener("blur",ye),x.removeEventListener("change",be),T.removeEventListener("change",_e),l.removeEventListener("webglcontextlost",Te),l.removeEventListener("webglcontextrestored",Re),le(),q=null,window.__eyeSequence===Xe&&delete window.__eyeSequence}},[]),L.useEffect(()=>{w.current?.dispatchEvent(new Event("scene-playback"))},[m]),ue.jsxs("div",{ref:w,className:"scene-canvas scene-canvas--eye eye-sequence","aria-hidden":"true",children:[ze&&ue.jsx("img",{className:"eye-sequence__still",src:`${Pe}center.webp`,alt:"",decoding:"async",style:{opacity:pe?0:1}}),ue.jsx("canvas",{ref:P,"data-scene":"eye",style:{opacity:pe?1:0}})]})}export{Je as default};
