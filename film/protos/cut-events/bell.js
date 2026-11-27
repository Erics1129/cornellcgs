import*as i from"three";import{GLSL_COMMON as W,GLSL_FRAG as L}from"../../kit/actors/core.js";const O=[[0,0],[.07,0],[.105,-.008],[.128,-.022],[.14,-.04],[.146,-.056],[.151,-.06],[.152,-.066],[.148,-.07],[.15,-.1],[.156,-.16],[.163,-.22],[.17,-.27],[.182,-.318],[.19,-.328],[.191,-.335],[.188,-.34],[.198,-.37],[.212,-.395],[.22,-.41],[.222,-.418],[.214,-.421],[.196,-.414],[.178,-.39],[.16,-.34],[.145,-.25],[.132,-.15],[.118,-.08],[.09,-.045],[0,-.035]];function _(l){const a=document.createElement("style");a.textContent=`
.ec-bell{position:absolute;z-index:6;left:0;top:0;width:44px;height:44px;margin:0;padding:0;border:0;border-radius:50%;background:transparent;cursor:pointer;
  -webkit-tap-highlight-color:transparent;outline:none;transform:translate(-50%,-50%)}
.ec-bell::after{content:'';position:absolute;inset:-6px;border-radius:50%;box-shadow:0 0 0 2px rgba(251,248,241,0);transition:box-shadow .18s}
.ec-bell:focus-visible::after{box-shadow:0 0 0 2px rgba(251,248,241,.92),0 0 0 5px rgba(184,55,44,.55)}
.ec-bell .ec-sr{position:absolute;width:1px;height:1px;overflow:hidden;clip:rect(0 0 0 0);white-space:nowrap}
`,l.append(a);const e=document.createElement("button");e.type="button",e.className="ec-bell",e.setAttribute("aria-label","Ring the bell"),e.innerHTML='<span class="ec-sr">Ring the bell</span>',l.append(e);let h=null,m=!1;const w=o=>{o.stopPropagation(),h&&h(o)},r=o=>{(o.key==="Enter"||o.key===" ")&&(o.stopPropagation(),o.preventDefault(),o.repeat||h&&h(o))};let g=!1;const c=o=>{o.stopPropagation(),g=!0},d=()=>{g=!1},N=()=>{m=!0},x=()=>{m=!1,g=!1};return e.addEventListener("click",w),e.addEventListener("keydown",r),e.addEventListener("pointerdown",c),e.addEventListener("pointerenter",N),e.addEventListener("pointerleave",x),e.addEventListener("pointerup",d),e.addEventListener("pointercancel",d),{get hovered(){return m},get pressed(){return g},onRing(o){h=o},pulse(){},place(o,u,p,P,T){const M=o.x,y=(o.y+p.y)/2,n=Math.max(44,u*2.5),f=Math.max(44,Math.abs(p.y-o.y)+u*2.4);e.style.left=M.toFixed(1)+"px",e.style.top=y.toFixed(1)+"px",e.style.width=n.toFixed(1)+"px",e.style.height=f.toFixed(1)+"px",e.style.borderRadius="50%",e.style.visibility=M>-n&&M<P+n&&y>-f&&y<T+f?"visible":"hidden"},destroy(){e.removeEventListener("click",w),e.removeEventListener("keydown",r),e.removeEventListener("pointerdown",c),e.removeEventListener("pointerenter",N),e.removeEventListener("pointerleave",x),e.removeEventListener("pointerup",d),e.removeEventListener("pointercancel",d)}}}function j(l,a){return new i.ShaderMaterial({uniforms:{...l.light,...a},side:i.DoubleSide,vertexShader:`
varying vec3 vWorld; varying vec3 vN; varying vec3 vObj; varying vec3 vT;
void main() {
  vec4 wp = modelMatrix * vec4(position, 1.0);
  vWorld = wp.xyz; vObj = position;
  vN = normalize(mat3(modelMatrix) * normal);
  vec3 t = vec3(-position.z, 0.0, position.x);
  vT = normalize(mat3(modelMatrix) * (length(t) > 1e-5 ? t : vec3(1.0, 0.0, 0.0)));
  gl_Position = projectionMatrix * viewMatrix * wp;
}`,fragmentShader:`${W}
${L}
uniform vec3 uGlowP[6]; uniform vec3 uGlowC[6]; uniform float uGlint; uniform float uHover; uniform float uPress;
varying vec3 vWorld; varying vec3 vN; varying vec3 vObj; varying vec3 vT;
void main() {
  vec3 N = normalize(vN);
  bool inside = !gl_FrontFacing;
  if (inside) N = -N;
  vec3 V = normalize(cameraPosition - vWorld);
  vec3 T = normalize(vT - N * dot(vT, N));
  vec3 B = normalize(cross(N, T));
  float y = vObj.y;
  // patina: in the recesses beside the raised bands, under the shoulder, inside, and in soft blotches
  float n = fbm(vObj * 34.0 + 3.0), n2 = fbm(vObj * 140.0);
  float rec = exp(-pow((y + 0.072) / 0.008, 2.0)) + exp(-pow((y + 0.343) / 0.008, 2.0)) * 0.8 + exp(-pow((y + 0.018) / 0.01, 2.0)) * 0.6;
  float pat;
  vec3 brass = vec3(0.72, 0.47, 0.07) * (0.9 + 0.2 * n2);
  vec3 patC = vec3(0.075, 0.09, 0.05);
  pat = clamp(0.42 * smoothstep(0.6, 0.82, n) + 0.55 * rec + (inside ? 0.45 : 0.0), 0.0, 1.0);
  vec3 alb = mix(brass, patC, pat * 0.75);
  float rough = mix(0.24, 0.75, pat) + 0.05 * sin(y * 1100.0 + n2 * 3.0);   // the turning marks
  vec3 L = normalize(uKeyDir);
  vec3 Hh = normalize(L + V);
  float ndl = max(dot(N, L), 0.0), ndv = max(dot(N, V), 0.02);
  // a cast toy-bell: the players' soft light gives it its body, kept warm (the brief: the bell lit warm against
  // the blue), and metal on top of that
  vec3 col = lightPlayer(alb, N, V, 1.0, 0.0, 0.5, 0.9) * 0.45 + alb * vec3(1.0, 0.86, 0.6) * (0.16 + 0.34 * smoothstep(-0.3, 0.9, dot(N, L)));
  float ax = 0.07 + 0.25 * rough, ay = 0.32 + 0.3 * rough;      // the highlight drawn up and down the bell
  float hx = dot(Hh, T) / ax, hy = dot(Hh, B) / ay, hn = max(dot(Hh, N), 0.02);
  float spec = ndl * exp(-2.0 * (hx * hx + hy * hy) / (1.0 + hn)) / (12.57 * ax * ay * sqrt(max(ndl * ndv, 1e-3)));
  vec3 F0 = mix(vec3(1.0, 0.76, 0.36), vec3(0.04), pat);
  vec3 F = F0 + (1.0 - F0) * pow(1.0 - max(dot(Hh, V), 0.0), 5.0);
  col += (uKeyTint * 0.6 + vec3(0.4, 0.3, 0.15)) * F * min(spec, 6.0) * 0.32;
  // the water mirrored in it: pale toward the light above, the blue at the horizon, the deep below
  vec3 R = reflect(-V, N);
  vec3 hor = uHazeColor * 1.1, upc = uHazeColor * 2.4 + uKeyTint * 0.15, dn = uHazeColor * 0.3;
  vec3 env = R.y > 0.0 ? mix(hor, upc, pow(R.y, 0.7)) : mix(hor, dn, pow(-R.y, 0.6));
  vec3 Fv = F0 + (1.0 - F0) * pow(1.0 - ndv, 5.0);
  col += env * Fv * mix(0.55, 0.2, rough);
  // the jellies' light: warm on the near side, a bright streak where it reflects
  for (int i = 0; i < 6; i++) {
    vec3 d = uGlowP[i] - vWorld;
    float r2 = dot(d, d);
    vec3 l = d * inversesqrt(max(r2, 1e-4));
    float att = 1.0 / (1.0 + r2 * 3.0);
    vec3 h = normalize(l + V);
    float s = pow(max(dot(N, h), 0.0), 36.0);
    col += uGlowC[i] * att * (alb * max(dot(N, l), 0.0) * 1.2 + F0 * s * 3.0 + alb * pow(1.0 - ndv, 3.0) * 0.5);
  }
  // the glint of the knock, and a faint lift under the pointer
  col += uGlint * vec3(1.0, 0.86, 0.6) * (pow(max(dot(N, Hh), 0.0), 18.0) * 1.6 + 0.12);
  col *= (1.0 + 0.14 * uHover) * (1.0 - 0.1 * uPress);
  { float l = dot(col, vec3(0.2126, 0.7152, 0.0722)); col = max(mix(vec3(l), col, 1.3), 0.0); }   // brass, not stone
  if (inside) col *= 0.32;
  col = haze(shoulder(col), length(cameraPosition - vWorld));
  gl_FragColor = linearToOutputTexel(vec4(col, 1.0));
}`})}function B(l,a){return new i.ShaderMaterial({uniforms:{...l.light,...a},vertexShader:`
varying vec3 vWorld; varying vec3 vN; varying vec2 vUv;
void main() { vec4 wp = modelMatrix * vec4(position, 1.0); vWorld = wp.xyz; vN = normalize(mat3(modelMatrix) * normal); vUv = uv; gl_Position = projectionMatrix * viewMatrix * wp; }`,fragmentShader:`${W}
${L}
uniform vec3 uTint; uniform vec3 uGlowP[6]; uniform vec3 uGlowC[6];
varying vec3 vWorld; varying vec3 vN; varying vec2 vUv;
void main() {
  vec3 N = normalize(vN); if (!gl_FrontFacing) N = -N;
  vec3 V = normalize(cameraPosition - vWorld);
  float twist = 0.85 + 0.15 * sin((vUv.x * 3.0 + vWorld.y * 160.0) * 6.2832);
  vec3 col = lightPlayer(uTint * twist, N, V, 1.0, 0.2, 0.5, 0.6);
  for (int i = 0; i < 6; i++) { vec3 d = uGlowP[i] - vWorld; float r2 = dot(d, d); col += uGlowC[i] * uTint * max(dot(N, normalize(d)), 0.0) / (1.0 + r2 * 3.0) * 0.8; }
  col = haze(shoulder(col), length(cameraPosition - vWorld));
  gl_FragColor = linearToOutputTexel(vec4(col, 1.0));
}`})}function $(l,a){const r=new i.Shape;r.moveTo(-.34/2+.04,0),r.lineTo(.34/2-.04,0),r.lineTo(.34/2,-.04),r.lineTo(.34/2,-.165),r.lineTo(-.34/2,-.165),r.lineTo(-.34/2,-.04),r.closePath();const g=new i.Path;g.absarc(0,-.026,.009,0,Math.PI*2,!0),r.holes.push(g);const c=new i.ExtrudeGeometry(r,{depth:.0024,bevelEnabled:!1,curveSegments:18});c.translate(0,0,-.0012);const d=c.getAttribute("position"),N=c.getAttribute("normal"),x=new Float32Array(d.count*2),o=new Float32Array(d.count);for(let n=0;n<d.count;n++){x[n*2]=(d.getX(n)+.34/2)/.34,x[n*2+1]=(d.getY(n)+.165)/.165;const f=N.getZ(n);o[n]=f>.5?1:f<-.5?2:0}c.setAttribute("uv",new i.BufferAttribute(x,2)),c.setAttribute("aFace",new i.BufferAttribute(o,1));const u=document.createElement("canvas");u.width=1024,u.height=512;const p=new i.CanvasTexture(u);p.colorSpace=i.SRGBColorSpace,p.anisotropy=8,p.generateMipmaps=!0,p.minFilter=i.LinearMipmapLinearFilter;const P={...l.light,uMap:{value:p},uGlowP:{value:a.p},uGlowC:{value:a.c}},T=new i.ShaderMaterial({uniforms:P,vertexShader:`
attribute float aFace; varying vec3 vWorld; varying vec3 vN; varying vec2 vUv; varying float vFace;
void main() { vec4 wp = modelMatrix * vec4(position, 1.0); vWorld = wp.xyz; vN = normalize(mat3(modelMatrix) * normal); vUv = uv; vFace = aFace; gl_Position = projectionMatrix * viewMatrix * wp; }`,fragmentShader:`${W}
${L}
uniform sampler2D uMap; uniform vec3 uGlowP[6]; uniform vec3 uGlowC[6];
varying vec3 vWorld; varying vec3 vN; varying vec2 vUv; varying float vFace;
void main() {
  vec3 N = normalize(vN); if (!gl_FrontFacing) N = -N;
  vec3 V = normalize(cameraPosition - vWorld);
  vec3 paper = vec3(0.80, 0.70, 0.49);
  vec3 alb = vFace > 0.5 && vFace < 1.5 ? srgbToLin(texture2D(uMap, vUv).rgb) : paper * (vFace > 1.5 ? 0.96 : 0.82);
  vec3 col = lightPlayer(alb, N, V, 1.0, 0.35, 0.5, 0.5);
  // keep the face legible in the blue: it is lit a little from the front, as paper catches the water's light
  col += alb * uShadeTint * 0.18 * max(dot(N, V), 0.0);
  for (int i = 0; i < 6; i++) { vec3 d = uGlowP[i] - vWorld; float r2 = dot(d, d); col += uGlowC[i] * alb * max(dot(N, normalize(d)), 0.0) / (1.0 + r2 * 3.0) * 0.9; }
  col = haze(shoulder(col), length(cameraPosition - vWorld));
  gl_FragColor = linearToOutputTexel(vec4(col, 1.0));
}`}),M=new i.Mesh(c,T);function y(n="Time TBA",f=!1){const t=u.getContext("2d"),s=u.width,v=u.height;t.fillStyle="#EADFC4",t.fillRect(0,0,s,v);let S=7;const b=()=>(S=S*16807%2147483647,S/2147483647);for(let G=0;G<2600;G++){const k=b()*s,A=b()*v,H=3+b()*14,U=b()*Math.PI;t.strokeStyle=b()<.5?"rgba(150,120,70,0.10)":"rgba(255,250,235,0.16)",t.lineWidth=.6+b()*1.1,t.beginPath(),t.moveTo(k,A),t.lineTo(k+Math.cos(U)*H,A+Math.sin(U)*H),t.stroke()}const z=t.createRadialGradient(s/2,v*.55,v*.3,s/2,v*.55,s*.62);z.addColorStop(0,"rgba(0,0,0,0)"),z.addColorStop(1,"rgba(110,80,40,0.16)"),t.fillStyle=z,t.fillRect(0,0,s,v);const C=s/2,E=.026/.165*v;t.fillStyle="#D6C59D",t.beginPath(),t.arc(C,E,.022/.34*s,0,Math.PI*2),t.fill(),t.strokeStyle="rgba(120,95,55,0.35)",t.lineWidth=2,t.beginPath(),t.arc(C,E,.022/.34*s,0,Math.PI*2),t.stroke();let F=260;t.font=`700 ${F}px Figtree, system-ui, sans-serif`;const R=t.measureText(n).width;F=Math.floor(F*Math.min(1,s*.84/R)),t.font=`700 ${F}px Figtree, system-ui, sans-serif`,t.fillStyle="#1E1C1A",t.textAlign="center",t.textBaseline="alphabetic","letterSpacing"in t&&(t.letterSpacing=`${(F*.01).toFixed(1)}px`),t.fillText(n,s/2,v*.86),f&&(t.font=`700 ${Math.round(v*.12)}px Figtree, system-ui, sans-serif`,"letterSpacing"in t&&(t.letterSpacing=`${Math.round(v*.02)}px`),t.fillStyle="#B8372C",t.fillText("EXAMPLE",s/2,v*.36)),p.needsUpdate=!0}return y(),{mesh:M,draw:y,setLights(){},dispose(){c.dispose(),T.dispose(),p.dispose()}}}function D(){const l=new i.PlaneGeometry(1,1),a=new i.ShaderMaterial({uniforms:{uA:{value:0}},transparent:!0,depthWrite:!1,depthTest:!1,blending:i.AdditiveBlending,vertexShader:"varying vec2 vUv; void main() { vUv = uv * 2.0 - 1.0; gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0); }",fragmentShader:`uniform float uA; varying vec2 vUv;
void main() {
  vec2 q = abs(vUv);
  float core = exp(-dot(vUv, vUv) * 18.0);
  float star = exp(-q.x * 30.0) * exp(-q.y * 3.2) + exp(-q.y * 30.0) * exp(-q.x * 3.2);
  float a = uA * (core * 0.9 + star * 0.5);
  gl_FragColor = vec4(vec3(1.0, 0.86, 0.62) * a, 1.0);
}`}),e=new i.Mesh(l,a);return e.frustumCulled=!1,e.renderOrder=20,{mesh:e,set(h,m,w){a.uniforms.uA.value=m,e.visible=m>.01,e.position.copy(h),e.lookAt(w);const r=.14+.1*m;e.scale.set(r,r,r)},dispose(){l.dispose(),a.dispose()}}}function q(l){const a=new i.Vector3(0,0,1).applyQuaternion(l);return Math.atan2(a.x,a.z)}export{O as PROFILE,q as angleY,j as brassMaterial,D as makeGlint,$ as makeTag,_ as mountBellButton,B as ropeMaterial};
