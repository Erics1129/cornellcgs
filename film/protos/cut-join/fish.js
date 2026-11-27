import*as o from"three";import{GLSL_COMMON as G,GLSL_FRAG as j,lin as P}from"../../kit/actors/core.js";function k(){const F=[],b=[],s=[],x=[],n=(a,l,p,d,r=0)=>{F.push(...a,...l,...p),b.push(d,d,d),x.push(r,r,r)},c=[0,0,.5],h=[0,.215,.07],u=[0,-.185,.1],f=[0,.05,-.27],m=[0,-.045,-.27],w=[0,.225,-.5],v=[0,.005,-.385],y=[0,-.19,-.48];for(const a of[1,-1]){const l=[.082*a,.018,.07],p=[.034*a,.012,-.2],d=[.03*a,.006,.36],r=(U,D,N,W,V)=>a>0?n(U,D,N,W,V):n(U,N,D,W,V);r(c,h,d,1),r(d,h,l,1),r(h,p,l,1),r(h,f,p,1),r(c,d,u,.6),r(d,l,u,.6),r(u,l,p,.6),r(u,p,m,.6),r(f,m,p,1);const A=.006*a,C=[A,f[1],f[2]],B=[A,m[1],m[2]],K=[A,w[1],w[2]],z=[A,v[1],v[2]],R=[A,y[1],y[2]];r(C,K,z,1,1),r(C,z,B,1,1),r(B,z,R,1,1);const X=[.078*a,-.022,0],Y=[.068*a,-.035,-.09],_=[.135*a,-.085,-.12];r(X,Y,_,.6,1)}const L=[0,.19,.02],g=[0,.285,-.1],T=[0,.1,-.17];n(L,g,T,.6,1),n(L,T,g,.6,1);const S=[0,-.14,-.1],M=[0,-.21,-.2],t=[0,-.06,-.24];n(S,M,t,1,1),n(S,t,M,1,1);const e=new Float32Array(F);for(let a=0;a<e.length/3;a++)s.push(Math.min(1,Math.max(0,(.5-e[a*3+2])/1)));const i=new o.BufferGeometry;return i.setAttribute("position",new o.BufferAttribute(e,3)),i.setAttribute("aPart",new o.BufferAttribute(new Float32Array(b),1)),i.setAttribute("aBack",new o.BufferAttribute(new Float32Array(s),1)),i.setAttribute("aThin",new o.BufferAttribute(new Float32Array(x),1)),i}const q=`
${G}
attribute float aPart; attribute float aBack; attribute float aThin;
attribute vec3 aColour; attribute vec4 aSwim; attribute vec2 aLight;   // aSwim: phase, beat, flash, seed; aLight: dapple, glow
varying vec3 vWorld; varying float vPart; varying vec3 vColour; varying vec3 vLocal; varying float vFlash; varying float vThin; varying vec2 vLight;
void main() {
  vec3 p = position;
  float b = aBack;
  // the swimming wave, nose to tail, growing toward the tail; the tail lobes lag a little more
  float wv = sin(aSwim.x + p.z * 5.5);
  p.x += aSwim.y * (0.025 * b + 0.26 * b * b * b) * wv;
  // the pectoral flaps paddle; the dorsal fold sways a beat late
  if (aThin > 0.5 && abs(p.x) > 0.07) p.y += 0.05 * aSwim.y * sin(aSwim.x * 1.3 + aSwim.w * 6.0) * (abs(p.x) - 0.07) * 7.0;
  if (aThin > 0.5 && p.y > 0.2) p.x += 0.02 * aSwim.y * sin(aSwim.x - 0.9);
  vec4 wp = modelMatrix * instanceMatrix * vec4(p, 1.0);
  vWorld = wp.xyz; vPart = aPart; vColour = aColour; vLocal = position; vFlash = aSwim.z; vThin = aThin; vLight = aLight;
  gl_Position = projectionMatrix * viewMatrix * wp;
}`,I=`
${G}
${j}
uniform vec3 uPaper; uniform float uTime;
varying vec3 vWorld; varying float vPart; varying vec3 vColour; varying vec3 vLocal; varying float vFlash; varying float vThin; varying vec2 vLight;
void main() {
  vec3 V = normalize(cameraPosition - vWorld);
  vec3 N = normalize(cross(dFdx(vWorld), dFdy(vWorld)));
  if (dot(N, V) < 0.0) N = -N;
  // the colour side of the sheet, a touch richer than the plane's flat player colours; the belly paler
  vec3 rich = max(mix(vec3(dot(vColour, vec3(0.2126, 0.7152, 0.0722))), vColour, 1.22), 0.0);
  vec3 base = vPart < 0.3 ? uPaper : vPart < 0.8 ? mix(rich, uPaper, 0.3) : rich;
  // paper: a faint fibre and the tooth of the sheet
  float grain = fbm(vLocal * 46.0);
  float fibre = vnoise(vec3(vLocal.z * 160.0, vLocal.y * 22.0, vLocal.x * 30.0));
  base *= 0.95 + 0.06 * grain + 0.025 * fibre;
  vec3 col = lightPlayer(base, N, V, 1.0, 0.8, grain, 1.0);
  // form: the belly turned away from the light falls off more (folded paper, not a flat cut-out)
  col *= mix(0.78, 1.04, smoothstep(-0.5, 0.6, dot(N, uKeyDir)));
  // the fold along the flank: a fine lit ridge with a soft crease shadow just under it
  float fy = vLocal.y - (0.012 + 0.006 * smoothstep(-0.2, 0.07, vLocal.z) - 0.006 * smoothstep(0.07, 0.36, vLocal.z));
  float body = step(0.5, 1.0 - vThin) * step(-0.26, vLocal.z) * step(vLocal.z, 0.42);
  col += body * uKeyTint * 0.16 * (1.0 - smoothstep(0.0, 0.01, abs(fy - 0.003)));
  col *= 1.0 - body * 0.14 * smoothstep(0.0, 0.012, -fy) * (1.0 - smoothstep(0.012, 0.05, -fy));
  // the water's moving light: this fish's share of the caustic net, and a soft dapple sliding over the paper
  float dap = 0.5 + 0.5 * sin(dot(vWorld.xz, vec2(5.3, 3.1)) + uTime * 1.7) * sin(dot(vWorld.zy, vec2(4.1, 6.3)) - uTime * 1.3);
  float lit = clamp(dot(N, uKeyDir) * 0.5 + 0.5, 0.0, 1.0);
  col *= mix(1.0, vLight.x * (0.82 + 0.36 * dap * dap), 0.55 * lit);
  // light through the paper: the thin fins and tail glow when the sun is behind them
  float behind = pow(clamp(dot(-V, uKeyDir), 0.0, 1.0), 1.6);
  col += base * uKeyTint * behind * (0.08 + 0.42 * vThin) * vLight.y;
  // the flash of a turn: the flank catches the light for a moment
  col = mix(col, max(col, vec3(1.0, 0.98, 0.93) * uKeyTint), vFlash * 0.32 * smoothstep(0.25, 0.9, lit));
  col = haze(shoulder(col), length(cameraPosition - vWorld));
  gl_FragColor = linearToOutputTexel(vec4(col, 1.0));
}`;function Z(F,b={}){const s=b.count||9,x=b.size||.36,n=k(),c=new o.InstancedBufferAttribute(new Float32Array(s*3),3),h=new o.InstancedBufferAttribute(new Float32Array(s*4),4),u=new o.InstancedBufferAttribute(new Float32Array(s*2),2);h.setUsage(o.DynamicDrawUsage),u.setUsage(o.DynamicDrawUsage),n.setAttribute("aColour",c),n.setAttribute("aSwim",h),n.setAttribute("aLight",u);const f=b.colours||["#3F78D0"];for(let t=0;t<s;t++){const e=P(f[t%f.length]);c.setXYZ(t,e.r,e.g,e.b)}const m={...F.light,uPaper:{value:P("#FBF8F1")},uTime:{value:0}},w=new o.ShaderMaterial({vertexShader:q,fragmentShader:I,uniforms:m,side:o.DoubleSide});w.extensions={derivatives:!0};const v=new o.InstancedMesh(n,w,s);v.instanceMatrix.setUsage(o.DynamicDrawUsage),v.frustumCulled=!1;const y=Array.from({length:s},(t,e)=>({p:new o.Vector3,q:new o.Quaternion,phase:0,beat:.6,flash:0,dapple:1,glow:1,visible:!0,scale:1,seed:e*.618034%1})),L=[];for(let t=0;t<s;t++)L.push(P(f[t%f.length]));const g=new o.Color,T=new o.Matrix4,S=new o.Vector3,M=new o.Matrix4().makeScale(0,0,0);return{object:v,count:s,size:x,set(t,e){const i=y[t];if(!i)return;const{p:a,q:l,...p}=e;Object.assign(i,p),a&&i.p.copy(a),l&&i.q.copy(l)},setColour(t,e,i){const a=L[t];if(!a)return;if(!(i>0)){c.setXYZ(t,a.r,a.g,a.b),c.needsUpdate=!0;return}const l=P(e);g.copy(a).lerp(l,Math.min(1,i)),c.setXYZ(t,g.r,g.g,g.b),c.needsUpdate=!0},get(t){return y[t]},setTime(t){m.uTime.value=t},update(){for(let t=0;t<s;t++){const e=y[t];if(!e.visible||!(e.scale>1e-4)){v.setMatrixAt(t,M);continue}const i=x*e.scale;T.compose(e.p,e.q,S.set(i,i,i)),v.setMatrixAt(t,T),h.setXYZW(t,e.phase,e.beat,e.flash,e.seed),u.setXY(t,e.dapple,e.glow)}v.instanceMatrix.needsUpdate=!0,h.needsUpdate=!0,u.needsUpdate=!0},dispose(){n.dispose(),w.dispose()}}}export{Z as createPaperFish};
