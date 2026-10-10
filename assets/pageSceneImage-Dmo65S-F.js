const j=Math.PI*2,he=16e5,fe=1.75,me={"who-we-are":{focusY:.48,drift:.055,pointer:.018,zoom:.16,light:.2,caustic:.1,angle:.6,tint:[1,.94,.82],dust:0},"what-we-do":{focusY:.54,drift:.065,pointer:.02,zoom:.14,light:.24,caustic:.26,angle:-.7,tint:[1,.83,.73],dust:0},"ml-process":{focusY:.5,drift:.055,pointer:.02,zoom:.17,light:.28,caustic:.42,angle:1.1,tint:[.7,.9,1],dust:.055},events:{focusY:.56,drift:.1,pointer:.018,zoom:.12,light:.24,caustic:.3,angle:.2,tint:[1,.88,.73],dust:0},world:{focusY:.49,drift:.07,pointer:.018,zoom:.18,light:.16,caustic:.08,angle:-.4,tint:[.76,1,.96],dust:0},people:{focusY:.48,drift:.058,pointer:.018,zoom:.14,light:.22,caustic:.26,angle:.9,tint:[1,.94,.83],dust:0},advisors:{focusY:.48,drift:.055,pointer:.018,zoom:.17,light:.24,caustic:.4,angle:-.9,tint:[.85,.94,1],dust:0},join:{focusY:.53,drift:.05,pointer:.016,zoom:.22,light:.3,caustic:.1,angle:.4,tint:[1,.96,.8],dust:0},contact:{focusY:.5,drift:.06,pointer:.02,zoom:.16,light:.25,caustic:.4,angle:-.3,tint:[1,.81,.55],dust:.05}},de=`#version 300 es
precision highp float;
out vec2 vUv;
void main() {
  // One oversized triangle, no buffers and no internal diagonal seam.
  vec2 p = vec2(float((gl_VertexID << 1) & 2), float(gl_VertexID & 2));
  vUv = p;
  gl_Position = vec4(p * 2.0 - 1.0, 0.0, 1.0);
}`,ge=(t,i)=>`#version 300 es
#define OPTICAL_DUST ${t?1:0}
#define FIBRE_FLOW ${i==="ml-process"?1:0}
#define LENS_FLOW ${i==="contact"?1:0}
precision highp float;
uniform sampler2D uImage;
uniform vec4 uCrop;
uniform vec2 uImageMetric;
uniform vec4 uLight;
uniform vec3 uTint;
uniform vec4 uCycle;
#if OPTICAL_DUST
uniform vec2 uViewMetric;
uniform vec4 uDust[3];
#endif
in vec2 vUv;
out vec4 outColor;
void main() {
  vec2 uv = (vUv - 0.5) * uCrop.xy + uCrop.zw;
  // Exactly one photograph sample: no second pose, warped UVs or channel splits.
  vec3 photo = texture(uImage, uv).rgb;
  float luma = dot(photo, vec3(0.2126, 0.7152, 0.0722));
  vec2 p = (uv - 0.5) * uImageMetric;
  vec2 spot = (uv - uCycle.xy) * uImageMetric;
  float sweep = 1.0 - smoothstep(0.012, 0.32, dot(spot, spot));
  vec2 direction = uLight.xy;
  // Broad overlapping light lobes, not sharp stripes; no noise/fbm or UV motion.
  float a = 0.5 + 0.5 * sin(dot(p, direction) * 23.0 + uCycle.z);
  float b = 0.5 + 0.5 * sin(dot(p, vec2(-direction.y, direction.x)) * 19.0 - uCycle.w);
  float reflection = a * b;
  reflection *= reflection;
  float highlights = smoothstep(0.22, 0.76, luma);
  float headroom = 1.0 - smoothstep(0.88, 1.0, max(photo.r, max(photo.g, photo.b)));
  float subject = mix(0.55, 1.0, smoothstep(0.015, 0.15, dot(p, p)));
  float exposure = ((sweep - 0.45) * uLight.z + (reflection - 0.22) * uLight.w)
    * highlights * headroom * subject;
  vec3 color = photo * (1.0 + exposure * mix(vec3(1.0), uTint, 0.4));
#if FIBRE_FLOW
  // Signals follow the already photographed blue fibres toward the processor.
  // The colour/brightness mask excludes dark metal and the processor itself.
  float radius = length((uv - vec2(.51, .48)) * uImageMetric);
  float fibre = smoothstep(.012, .15, photo.b - photo.r * .85)
    * smoothstep(.10, .45, luma) * smoothstep(.045, .11, radius);
  float signal = pow(.5 + .5 * sin(radius * 58.0 + uCycle.z * 2.0), 6.0);
  color += vec3(.18, .60, 1.0) * fibre * signal * .42 * (1.0 - photo);
#endif
#if LENS_FLOW
  // A travelling reflection over the existing brass rings, not a drawn overlay.
  float radius = length((uv - vec2(.50, .56)) * uImageMetric);
  float brass = smoothstep(.035, .20, photo.r - photo.b) * smoothstep(.1, .48, luma);
  float signal = pow(.5 + .5 * sin(radius * 65.0 - uCycle.z), 5.0);
  color += vec3(1.0, .58, .15) * brass * signal * .34 * (1.0 - photo);
#endif
#if OPTICAL_DUST
  // Only three soft optical specks, only over dark background, away from center.
  if (luma < 0.30) {
    float dust = 0.0;
    for (int i = 0; i < 3; i++) {
      vec2 q = (vUv - uDust[i].xy) * uViewMetric;
      float mote = 1.0 - smoothstep(0.0, uDust[i].z * uDust[i].z, dot(q, q));
      dust += mote * mote * uDust[i].w;
    }
    float background = (1.0 - smoothstep(0.06, 0.30, luma))
      * smoothstep(0.025, 0.12, dot(vUv - 0.5, vUv - 0.5));
    color += dust * background * uTint;
  }
#endif
  outColor = vec4(color, 1.0);
}`;async function pe(t){const i=new Image;i.decoding="async",await new Promise((d,o)=>{i.onload=()=>{i.onload=i.onerror=null,d()},i.onerror=()=>{i.onload=i.onerror=null,o(new Error(`Unable to load scene photograph: ${t}`))},i.src=t});try{await i.decode()}catch{throw new Error(`Unable to decode scene photograph: ${t}`)}if(!i.naturalWidth||!i.naturalHeight)throw new Error(`Empty scene photograph: ${t}`);return i}async function Ee(t,i,d){const o=me[i];if(!o)throw new Error(`Unknown page scene: ${i}`);const P=await pe(d),u=P.naturalWidth,h=P.naturalHeight,X=t.getContext("webgl2",{alpha:!1,antialias:!1,depth:!1,stencil:!1,premultipliedAlpha:!1,preserveDrawingBuffer:!1,powerPreference:"low-power"});if(!X)throw new Error("WebGL2 is unavailable for the scene photograph");const e=X,w=[];let a=null,f=null,g=null,p=!1,N=0,M=0,x=1,R=1,b=0,L=0,U=0;function O(){if(!p){p=!0,e.useProgram(null),e.bindVertexArray(null),e.bindTexture(e.TEXTURE_2D,null),f&&e.deleteTexture(f),g&&e.deleteVertexArray(g),a&&e.deleteProgram(a);for(const E of w)e.deleteShader(E);w.length=0,f=a=g=null,M=0}}try{let E=function(r,n,s){if(p||e.isContextLost())return;b=Number.isFinite(r)?r:0,L=G(n),U=G(s);const l=(b%20+20)%20/20*j,_=Math.sin(l),T=Math.cos(l),ne=Math.sin(l*2),D=Math.min(1,1/x),A=Math.min(1,x),se=(o.drift*(.8*_+.2*ne)+o.pointer*L)*D,le=(o.drift*(.8*T+.2*Math.cos(l*2))-o.pointer*U)*A,k=1+2*(o.drift+o.pointer)+4/Math.min(u,h)+o.zoom*(.5-.5*T),H=u/h,ce=Math.min(1,x/H),y=Math.min(1,H/x),q=ce/k,K=y/k,ue=y*.5+(1-y)*(1-o.focusY);if(e.useProgram(a),e.bindVertexArray(g),e.activeTexture(e.TEXTURE0),e.bindTexture(e.TEXTURE_2D,f),e.viewport(0,0,t.width,t.height),e.uniform4f(J,q,K,.5+q*se,ue+K*le),e.uniform4f(oe,.5+.28*T,.5+.24*_,l*6+o.angle,l*4-o.angle),Y!==null){for(let m=0;m<3;m++){const C=l+m*j/3,I=m*4;v[I]=V[m*2]+.035*Math.cos(C)*D,v[I+1]=V[m*2+1]+.045*Math.sin(C)*A,v[I+2]=.006+m*.002,v[I+3]=o.dust*(.65+.35*Math.sin(C+.5))}e.uniform2f(re,1/D,1/A),e.uniform4fv(Y,v)}e.drawArrays(e.TRIANGLES,0,3),M=1,N++},z=function(r,n){if(p||e.isContextLost()||!Number.isFinite(r)||!Number.isFinite(n)||r<=0||n<=0)return;x=r/n;const s=t.ownerDocument.defaultView?.devicePixelRatio??1,l=Number.isFinite(s)&&s>0?Math.min(s,fe):1;R=Math.min(l,Math.sqrt(he/r/n),ie/r,ae/n);const _=Math.max(1,Math.floor(r*R)),T=Math.max(1,Math.floor(n*R));t.width!==_&&(t.width=_),t.height!==T&&(t.height=T),E(b,L,U)};const F=(r,n)=>{const s=e.createShader(r);if(!s)throw new Error("Unable to allocate scene image shader");if(w.push(s),e.shaderSource(s,n),e.compileShader(s),!e.getShaderParameter(s,e.COMPILE_STATUS))throw new Error(`Scene image shader: ${e.getShaderInfoLog(s)||"compile failed"}`);return s};if(a=e.createProgram(),!a)throw new Error("Unable to allocate scene image program");if(e.attachShader(a,F(e.VERTEX_SHADER,de)),e.attachShader(a,F(e.FRAGMENT_SHADER,ge(o.dust>0,i))),e.linkProgram(a),!e.getProgramParameter(a,e.LINK_STATUS))throw new Error(`Scene image program: ${e.getProgramInfoLog(a)||"link failed"}`);for(const r of w)e.detachShader(a,r),e.deleteShader(r);w.length=0;const c=r=>{const n=e.getUniformLocation(a,r);if(n===null)throw new Error(`Missing scene image uniform: ${r}`);return n},Z=c("uImage"),J=c("uCrop"),Q=c("uImageMetric"),ee=c("uLight"),te=c("uTint"),oe=c("uCycle"),re=o.dust?c("uViewMetric"):null,Y=o.dust?c("uDust[0]"):null,v=new Float32Array(12),V=[.18,.72,.82,.27,.74,.84],S=e.getParameter(e.MAX_TEXTURE_SIZE);if(u>S||h>S)throw new Error(`Scene photograph exceeds the ${S}px texture limit: ${d}`);const W=e.getParameter(e.MAX_VIEWPORT_DIMS),$=e.getParameter(e.MAX_RENDERBUFFER_SIZE),ie=Math.min(W[0],$),ae=Math.min(W[1],$);if(f=e.createTexture(),g=e.createVertexArray(),!f||!g)throw new Error("Unable to allocate scene image texture/vertex array");e.activeTexture(e.TEXTURE0),e.bindTexture(e.TEXTURE_2D,f),e.pixelStorei(e.UNPACK_FLIP_Y_WEBGL,!0),e.pixelStorei(e.UNPACK_PREMULTIPLY_ALPHA_WEBGL,!1),e.texParameteri(e.TEXTURE_2D,e.TEXTURE_WRAP_S,e.CLAMP_TO_EDGE),e.texParameteri(e.TEXTURE_2D,e.TEXTURE_WRAP_T,e.CLAMP_TO_EDGE),e.texParameteri(e.TEXTURE_2D,e.TEXTURE_MAG_FILTER,e.LINEAR),e.texParameteri(e.TEXTURE_2D,e.TEXTURE_MIN_FILTER,e.LINEAR_MIPMAP_LINEAR),e.texImage2D(e.TEXTURE_2D,0,e.RGBA8,e.RGBA,e.UNSIGNED_BYTE,P),e.generateMipmap(e.TEXTURE_2D);const B=e.getError();if(B!==e.NO_ERROR||e.isContextLost())throw new Error(`Scene image texture setup failed (WebGL ${B}): ${d}`);e.useProgram(a),e.uniform1i(Z,0),e.uniform2f(Q,u/Math.max(u,h),h/Math.max(u,h)),e.uniform4f(ee,Math.cos(o.angle),Math.sin(o.angle),o.light,o.caustic),e.uniform3f(te,...o.tint),e.disable(e.DEPTH_TEST),e.disable(e.STENCIL_TEST),e.disable(e.BLEND),e.disable(e.CULL_FACE),e.disable(e.SCISSOR_TEST),e.disable(e.DITHER);const G=r=>Number.isNaN(r)?0:Math.max(-1,Math.min(1,r));return z(t.clientWidth||t.width||1,t.clientHeight||t.height||1),{draw:E,resize:z,dispose:O,stats:()=>({imageUrl:d,imageWidth:u,imageHeight:h,period:20,calls:M,drawCalls:M,frames:N,width:t.width,height:t.height,pixels:t.width*t.height,pixelRatio:R,textures:p?0:1,disposed:p})}}catch(E){throw O(),E}}export{Ee as createPageSceneImage};
