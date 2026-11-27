import*as s from"three";import{RoundedBoxGeometry as D}from"three/addons/geometries/RoundedBoxGeometry.js";import{mergeGeometries as oe}from"three/addons/utils/BufferGeometryUtils.js";import{GLSL_COMMON as Q,GLSL_FRAG as ae,lin as U,PAPER as Y,INK as Z}from"../../kit/actors/core.js";import{CHIP as K,LEG_Z as re}from"./story.js";const se=`
${Q}
uniform float uSplay;      // legs turned out about their roots (radians), on a squash
uniform float uRootX;      // where the legs leave the body (local x, metres)
uniform float uRootY;
varying vec3 vWorld; varying vec3 vN; varying vec2 vUv; varying vec3 vLocal;
void main() {
  vec3 p = position, n = normal;
#ifdef LEGS
  // turn each leg out about its root (mirrored to the east side, turned, mirrored back): the feet slide outward
  float s = p.x < 0.0 ? -1.0 : 1.0;
  vec2 r = vec2(s * p.x - uRootX, p.y - uRootY);
  float c = cos(uSplay), sn = sin(uSplay);
  vec2 rr = vec2(c * r.x - sn * r.y, sn * r.x + c * r.y);
  p.x = s * (uRootX + rr.x); p.y = uRootY + rr.y;
  vec2 nm = vec2(s * n.x, n.y);
  vec2 nn = vec2(c * nm.x - sn * nm.y, sn * nm.x + c * nm.y);
  n.x = s * nn.x; n.y = nn.y;
#endif
  vec4 wp = modelMatrix * vec4(p, 1.0);
  mat3 m3 = mat3(modelMatrix);
  vec3 sc = vec3(dot(m3[0], m3[0]), dot(m3[1], m3[1]), dot(m3[2], m3[2]));
  vN = normalize(m3 * (n / max(sc, vec3(1e-12))));
  vWorld = wp.xyz; vUv = uv; vLocal = p;
  gl_Position = projectionMatrix * viewMatrix * wp;
}`,ne=`
${Q}
${ae}
uniform vec3 uBase;        // linear albedo
uniform float uGloss, uRimK, uMetal, uGlow;
uniform vec3 uGlowColour;
uniform sampler2D uMap;    // the label (paper and ink), when LABEL
uniform float uHover;      // a faint lift of the light on hover
uniform float uFade;       // cut-who's seam in: 1 = not there yet (the out-of-focus lights are all you see)
uniform float uWhite;      // cut-who's seam out: the light that fills the frame (kit/seams.js WHITE), 0..1
uniform vec2 uRes;         // the drawing buffer, px
varying vec3 vWorld; varying vec3 vN; varying vec2 vUv; varying vec3 vLocal;
void main() {
  vec3 N = normalize(vN);
  vec3 V = normalize(cameraPosition - vWorld);
  if (dot(N, V) < -0.2) N = -N;
  vec3 base = uBase;
  float occl = 1.0;
#ifdef LABEL
  vec4 t = texture2D(uMap, vUv);
  if (t.a < 0.5) discard;
  base = srgbToLin(t.rgb);
#endif
#ifdef BODY
  // soft occlusion low on the sides, where the body meets its own shadow
  occl = mix(0.82, 1.0, smoothstep(0.0, 0.06, vLocal.y + 0.05));
#endif
  vec3 col = lightPlayer(base, N, V, occl, 0.0, 0.5, uRimK);
  vec3 H = normalize(uKeyDir + V);
  float nh = max(dot(N, H), 0.0);
  float sp = pow(nh, mix(16.0, 34.0, uMetal)) * smoothstep(-0.05, 0.35, dot(N, uKeyDir));
  col += mix(uKeyTint, base * 1.7 + 0.06, uMetal) * sp * uGloss * mix(0.14, 0.6, uMetal);
  col += base * uShadeTint * uMetal * 0.16 * clamp(N.y, 0.0, 1.0);
  col *= 1.0 + 0.07 * uHover;
  // the warm flash at the joints (legs only): the metal becomes the light for a moment
  col = mix(col, uGlowColour * (1.1 + 0.4 * clamp(dot(N, V), 0.0, 1.0)), clamp(uGlow, 0.0, 1.0));
  col = haze(shoulder(col), length(cameraPosition - vWorld));
  gl_FragColor = linearToOutputTexel(vec4(col, 1.0));
  if (uWhite > 0.0) {   // the same warm white the seam draws behind it, so the chip goes into the light with the board
    vec2 q = gl_FragCoord.xy / uRes; q.y = 1.0 - q.y;
    float r = length((q - vec2(0.5, 0.46)) * uRes) / (length(uRes) * 0.62);
    vec3 w = mix(vec3(0.9569, 0.9373, 0.9020), vec3(0.9216, 0.8941, 0.8471), clamp(r, 0.0, 1.0));
    gl_FragColor.rgb = mix(gl_FragColor.rgb, w, uWhite);
  }
  gl_FragColor.a = 1.0 - uFade;
}`;function le(e,o,f,L,x,{title:R,small:p,index:n,fontsOk:w}){const A=w?'Figtree, "Helvetica Neue", Arial, sans-serif':'"Helvetica Neue", Arial, sans-serif';e.clearRect(0,0,o,f);const d=o*.035;e.save(),e.beginPath(),e.moveTo(d,0),e.lineTo(o-d,0),e.quadraticCurveTo(o,0,o,d),e.lineTo(o,f-d),e.quadraticCurveTo(o,f,o-d,f),e.lineTo(d,f),e.quadraticCurveTo(0,f,0,f-d),e.lineTo(0,d),e.quadraticCurveTo(0,0,d,0),e.closePath(),e.clip(),e.fillStyle=Y,e.fillRect(0,0,o,f);let l=(2166136261^n*977)>>>0;const b=()=>(l=Math.imul(l^l>>>15,2246822507)>>>0,l=Math.imul(l^l>>>13,3266489909)>>>0,((l^l>>>16)>>>0)/4294967296);for(let y=0;y<3200;y++){const t=b()*o,c=b()*f,G=.7+b()*1.8;e.fillStyle=b()<.55?"rgba(120,100,70,0.06)":"rgba(255,255,255,0.2)",e.fillRect(t,c,G,G)}e.fillStyle="rgba(90,75,55,0.10)",e.fillRect(0,L-o*.004,o,o*.006);const m=o*.05;e.fillStyle=Z,e.beginPath(),e.arc(m+o*.04,m*.7+o*.04,o*.018,0,Math.PI*2),e.fill(),e.strokeStyle="rgba(33,31,28,0.3)",e.lineWidth=o*.0035,e.strokeRect(m,m*.7,o-2*m,x-m*1.4-m*.3),e.textAlign="left",e.textBaseline="alphabetic";const S=o*.043;e.font=`600 ${S}px ${A}`;try{e.letterSpacing=`${(.04*S).toFixed(2)}px`}catch{}e.fillStyle="rgba(33,31,28,0.76)";const v=p.split(" · "),F=e.measureText(p).width>o-2*m-o*.06&&v.length>1?[v.slice(0,Math.ceil(v.length/2)).join(" · ")+" ·",v.slice(Math.ceil(v.length/2)).join(" · ")]:[p];F.forEach((y,t)=>e.fillText(y,m+o*.03,x-m*.6-(F.length-1-t)*S*1.3));const M=f-L;let g=M*.78;e.font=`700 ${g}px ${A}`;try{e.letterSpacing=`${(-.006*g).toFixed(2)}px`}catch{}const T=o-2*m;for(;e.measureText(R).width>T&&g>M*.3;)g*=.97,e.font=`700 ${g}px ${A}`;e.fillStyle=Z,e.textAlign="center",e.fillText(R,o/2,L+M*.5+g*.36);try{e.letterSpacing="0px"}catch{}e.restore()}function ie(e,o,f){const L=e-.075,x=.0016,R=-.035,p=.017,n=[],w=3,A=8,d=3;for(let t=0;t<=w;t++)n.push([R+(e/2-f-R)*(t/w),o+x,0,1]);for(let t=1;t<=A;t++){const c=Math.PI/2*(1-t/A);n.push([e/2-f+(f+x)*Math.cos(c),o-f+(f+x)*Math.sin(c),Math.cos(c),Math.sin(c)])}for(let t=1;t<=d;t++)n.push([e/2+x,o-f-(o-f-p)*(t/d),1,0]);const l=[0];for(let t=1;t<n.length;t++)l.push(l[t-1]+Math.hypot(n[t][0]-n[t-1][0],n[t][1]-n[t-1][1]));const b=l[l.length-1],m=l[w+A]/b,S=l[w]/b,v=2,F=[],M=[],g=[],T=[];for(let t=0;t<n.length;t++)for(let c=0;c<=v;c++){const G=-L/2+L*(c/v);F.push(G,n[t][1],n[t][0]),M.push(0,n[t][3],n[t][2]),g.push(c/v,1-l[t]/b)}for(let t=0;t<n.length-1;t++)for(let c=0;c<v;c++){const G=t*(v+1)+c,V=G+1,N=G+v+1,z=N+1;T.push(G,N,V,V,N,z)}const y=new s.BufferGeometry;return y.setAttribute("position",new s.Float32BufferAttribute(F,3)),y.setAttribute("normal",new s.Float32BufferAttribute(M,3)),y.setAttribute("uv",new s.Float32BufferAttribute(g,2)),y.setIndex(T),{geometry:y,width:L,length:b,frontAt:m,edgeAt:S}}function pe(e,{colours:o,titles:f,small:L,renderer:x}){const R=new s.Group;R.name="project-chips";const p=K.w,n=K.h,w=K.foot,A=.016,d=new D(p,n,p,4,A);d.translate(0,n/2,0);const l=ie(p,n,A),b=l.geometry,m=n*.42,S=.014,v=.044,F=r=>{const i=m+w-S/2,a=new D(.03,S,v,2,.005);a.translate(p/2+.013,m,r);const h=new D(S,i,v,2,.005);h.translate(p/2+.028,m-i/2,r);const C=new D(.05,S,v,2,.005);return C.translate(p/2+.05,m-i,r),[a,h,C]},M=[];for(const r of re){for(const i of F(r))M.push(i);for(const i of F(r))i.scale(-1,1,1),M.push(i)}const g=oe(M.map(r=>r.index?r.toNonIndexed():r));g.computeVertexNormals(),M.forEach(r=>r.dispose());const T=(r,i,{gloss:a=.5,rim:h=1,metal:C=0}={})=>new s.ShaderMaterial({vertexShader:se,fragmentShader:ne,defines:r,uniforms:{...e.light,uBase:{value:U(i)},uGloss:{value:a},uRimK:{value:h},uMetal:{value:C},uGlow:{value:0},uGlowColour:{value:U("#FFB45C").multiplyScalar(1.6)},uMap:{value:null},uHover:{value:0},uFade:{value:0},uWhite:{value:0},uRes:{value:new s.Vector2(1280,720)},uSplay:{value:0},uRootX:{value:p/2},uRootY:{value:m}}}),y=[],t=[],c=o.map((r,i)=>{const a=new s.Group,h=new s.Group;h.position.y=w,a.add(h);const C=T({BODY:1},r,{gloss:.55,rim:.9}),j=T({LABEL:1},Y,{gloss:.18,rim:.5}),q=T({LEGS:1},"#D9A845",{gloss:.85,rim:.9,metal:1}),k=document.createElement("canvas");k.width=1024,k.height=Math.round(1024*l.length/l.width);const B=new s.CanvasTexture(k);B.colorSpace=s.NoColorSpace,B.anisotropy=x?x.capabilities.getMaxAnisotropy():8,B.generateMipmaps=!0,B.minFilter=s.LinearMipmapLinearFilter,j.uniforms.uMap.value=B,y.push(k),t.push(B);const H=new s.Mesh(d,C),J=new s.Mesh(b,j),W=new s.Mesh(g,q);for(const E of[H,J,W])E.frustumCulled=!1,h.add(E);R.add(a);const u={x:0,z:0,lift:0,tilt:0,tiltZ:0,pivot:0,sy:1,splay:0,glow:0,hover:0,shadow:1,visible:!0,fade:0,white:0},_=new s.Quaternion,O=new s.Quaternion,I=new s.Vector3,ee=new s.Vector3(0,0,1),te=new s.Vector3(1,0,0);return{group:a,body:h,mats:[C,j,q],state:u,set(E){Object.assign(u,E),_.setFromAxisAngle(ee,u.tilt),O.setFromAxisAngle(te,-u.tiltZ),_.multiply(O),I.set(u.pivot,w,0);const P=I.clone().sub(I.clone().applyQuaternion(_));a.quaternion.copy(_),a.position.set(u.x+P.x,u.lift+P.y,u.z+P.z),h.scale.set(1+.5*(1-u.sy),u.sy,1+.5*(1-u.sy)),h.position.y=w*(.4+.6*u.sy),q.uniforms.uSplay.value=u.splay,q.uniforms.uGlow.value=u.glow;for(const $ of[C,j,q])$.uniforms.uHover.value=u.hover,$.uniforms.uFade.value=u.fade,$.uniforms.uWhite.value=u.white,$.transparent=u.fade>.001,$.depthWrite=u.fade<.5;a.visible=u.visible&&u.fade<.999,a.updateMatrixWorld(!0)},top(){return h.position.y+n*u.sy+.0016},toWorld(E,P=new s.Vector3){return a.updateMatrixWorld(!0),P.copy(E).applyMatrix4(a.matrixWorld)}}});function G(r,i){for(const a of c)for(const h of a.mats)h.uniforms.uRes.value.set(r,i)}function V(r){c.forEach((i,a)=>{const h=y[a];le(h.getContext("2d"),h.width,h.height,h.height*l.frontAt,h.height*l.edgeAt,{title:f[a],small:L[a],index:a,fontsOk:r}),t[a].needsUpdate=!0})}V(!1);const N=new s.Vector3,z=new s.Vector3,X=new s.Vector3;return{object:R,chips:c,redraw:V,setRes:G,setStyle(){},update(r){for(const i of c){const a=i.state;!a.visible||a.shadow<=0||a.fade>=.999||(i.group.updateMatrixWorld(!0),X.set(0,0,0).applyMatrix4(i.group.matrixWorld),N.set(p/2+.05,0,0).applyQuaternion(i.group.quaternion),z.set(0,0,p/2+.02).applyQuaternion(i.group.quaternion),r.shadows.cast(X,N,z,{opacity:1.1*a.shadow,round:.32,size:p,extent:(w+n)*a.sy*.9}))}},dispose(){d.dispose(),b.dispose(),g.dispose();for(const r of c)for(const i of r.mats)i.dispose();for(const r of t)r.dispose()}}}export{pe as createProjectChips};
