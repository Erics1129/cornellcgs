import*as t from"three";import{GLSL_COMMON as ot,GLSL_FRAG as ct,PLAYER_COLOURS as jt,PAPER as Wt,lin as it}from"../../actors/core.js";import{poseFromPath as qt,lookQuaternion as Mt}from"../../actors/paths.js";import{clamp as H,lerp as dt,inOutSine as Rt,outSine as vt,outCubic as Gt,outBack as zt,inBack as Yt,smoothstep as Y,hash01 as j,seeded as At}from"../../ease.js";const T=Math.PI*2,ut=new t.Vector3(0,1,0),_=(n,o=new t.Vector3)=>n==null?o.set(0,0,0):n.isVector3?o.copy(n):Array.isArray(n)?o.fromArray(n):o.copy(n.position||n.p),ft=(n,o=new t.Quaternion)=>n==null?o.identity():n.isQuaternion?o.copy(n):o.fromArray(n),Kt="#E6D8B8",Dt=new WeakMap;function St(n){let o=Dt.get(n);if(o)return o;const e=256,a=new Float32Array(e+1),l=new t.Vector3,r=new t.Vector3;_(n(0),l);for(let s=1;s<=e;s++)_(n(s/e),r),a[s]=a[s-1]+l.distanceTo(r),l.copy(r);return o={S:a,N:e,total:a[e]||1e-6},Dt.set(n,o),o}function Qt(n,o){const{S:e,N:a}=St(n),l=H(o)*a,r=Math.min(a-1,Math.floor(l));return dt(e[r],e[r+1],l-r)+(o>1?(o-1)*(e[a]-e[a-1])*a:o<0?o*(e[1]-e[0])*a:0)}function Lt(n,o){const{S:e,N:a,total:l}=St(n);if(o<=0)return o/Math.max(1e-6,e[1]*a);if(o>=l)return 1+(o-l)/Math.max(1e-6,(e[a]-e[a-1])*a);let r=0,s=a;for(;s-r>1;){const u=r+s>>1;e[u]<o?r=u:s=u}return(r+(o-e[r])/Math.max(1e-9,e[s]-e[r]))/a}const Ut={shallows:{sun:{dir:[.22,.95,.22],color:[1,.97,.9],ambient:[.55,.86,.95]},key:1,bounce:["#E6D8B8",.14],haze:["#4FA9B8",.045],bg:["#8ED6DE","#3D9FB2","#2A8396"],floor:-6},kelp:{sun:{dir:[-.25,.92,.3],color:[1,.93,.74],ambient:[.5,.78,.62]},key:.92,bounce:["#8C9A6C",.08],haze:["#3E7D6E",.06],bg:["#8FB98F","#477F6D","#284F49"],floor:-12},deep:{sun:{dir:[.05,1,.12],color:[.78,.88,1],ambient:[.32,.5,.85]},key:.62,bounce:["#0E2C4C",.03],haze:["#123E66",.055],bg:["#2A6A9A","#123E66","#071C33"],floor:null}};function Se(n,o="shallows"){const e=Ut[o]||Ut.shallows;return n.setSun(e.sun,{key:e.key}),n.setBounce(e.bounce[0],e.bounce[1]),n.setHaze(e.haze[0],e.haze[1]),e}const It=`
vec3 facetNormal(vec3 w, vec3 V) {
  vec3 n = normalize(cross(dFdx(w), dFdy(w)));
  return dot(n, V) < 0.0 ? -n : n;
}`;function te(){const n=[],o=[],e=[0,.01,.5],a=[0,.19,.04],l=[0,-.17,.08],r=[0,.04,-.24],s=[0,-.035,-.24],u=b=>[.085*b,0,.05],c=b=>[.04*b,.015,-.17],z=[0,.2,-.5],h=[0,.02,-.4],x=[0,-.17,-.48],f=(b,p,m,d)=>{n.push(...b,...p,...m),o.push(d,d,d)};for(const b of[1,-1]){const p=u(b),m=c(b),d=(S,y,g,B)=>b>0?f(S,y,g,B):f(S,g,y,B);d(e,a,p,0),d(a,r,m,0),d(a,m,p,0),d(e,p,l,1),d(p,m,s,1),d(p,s,l,1),d(m,r,s,0);const V=[.012*b,z[1],z[2]],W=[.02*b,h[1],h[2]],q=[.012*b,x[1],x[2]];d(r,V,W,1),d(r,W,s,1),d(s,W,q,1);const U=[.08*b,-.03,.06],L=[.06*b,-.05,-.06],k=[.16*b,-.1,-.04];d(U,L,k,1)}f([0,.19,.04],[.006,.26,-.06],[0,.07,-.16],0),f([0,.19,.04],[0,.07,-.16],[-.006,.26,-.06],0);const i=new t.BufferGeometry,w=new Float32Array(n),C=new Float32Array(w.length/3);for(let b=0;b<C.length;b++)C[b]=H((.5-w[b*3+2])/1);return i.setAttribute("position",new t.BufferAttribute(w,3)),i.setAttribute("aPart",new t.BufferAttribute(new Float32Array(o),1)),i.setAttribute("aBack",new t.BufferAttribute(C,1)),i.computeVertexNormals(),i}const ee=`
${ot}
attribute float aPart; attribute float aBack;
attribute vec3 aColour; attribute vec4 aSwim;   // phase (rad), beat amplitude, flash, seed
varying vec3 vWorld; varying float vPart; varying vec3 vColour; varying vec3 vLocal; varying float vFlash;
void main() {
  vec3 p = position;
  float b = aBack;
  // the swimming wave: travels nose to tail, grows toward the tail
  float wv = sin(aSwim.x + p.z * 6.0);
  p.x += aSwim.y * (0.03 * b + 0.30 * b * b * b) * wv;
  // the pectoral flaps paddle a little
  if (abs(p.x) > 0.07 && p.y < -0.02) p.y += 0.04 * aSwim.y * sin(aSwim.x * 1.3 + aSwim.w * 6.0) * (abs(p.x) - 0.07) * 8.0;
  vec4 wp = modelMatrix * instanceMatrix * vec4(p, 1.0);
  vWorld = wp.xyz; vPart = aPart; vColour = aColour; vLocal = position; vFlash = aSwim.z;
  gl_Position = projectionMatrix * viewMatrix * wp;
}`,oe=`
${ot}
${ct}
${It}
uniform vec3 uPaper;
varying vec3 vWorld; varying float vPart; varying vec3 vColour; varying vec3 vLocal; varying float vFlash;
void main() {
  vec3 V = normalize(cameraPosition - vWorld);
  vec3 N = facetNormal(vWorld, V);
  vec3 base = vPart > 0.5 ? vColour : uPaper;
  float grain = fbm(vLocal * 40.0);
  base *= 0.97 + 0.05 * grain;
  vec3 col = lightPlayer(base, N, V, 1.0, 0.8, grain, 1.0);
  // the flash of a turn: the flank catches the light for a moment
  col = mix(col, max(col, vec3(1.0, 0.98, 0.93) * uKeyTint), vFlash * 0.45 * smoothstep(0.2, 0.9, dot(N, uKeyDir) * 0.5 + 0.5));
  col = haze(shoulder(col), length(cameraPosition - vWorld));
  gl_FragColor = linearToOutputTexel(vec4(col, 1.0));
}`;function ne(n,o){const e=At(o*977+13),a=[],l=Math.PI*(3-Math.sqrt(5));for(let r=0;r<n;r++){const s=(r+.5)/n,u=Math.cbrt(s)*(.86+.14*e()),c=1-2*((r*.618034+e()*.15)%1),z=Math.sqrt(Math.max(0,1-c*c)),h=r*l+e()*.4;a.push({x:Math.cos(h)*z*u,y:c*u,z:Math.sin(h)*z*u,seed:e(),phase:e()*T,size:.88+.24*e()})}return a}const Ot={line(n,{curve:o=0}={}){const e=[];for(let a=0;a<n;a++){const l=n<2?0:a/(n-1)-.5;e.push([l,o*(.25-l*l)])}return e},ring(n,{phase:o=0}={}){const e=[];for(let a=0;a<n;a++){const l=o+a/n*T;e.push([.5*Math.cos(l),.5*Math.sin(l)])}return e.ring=!0,e},grid(n,{aspect:o=1.6}={}){const e=Math.max(1,Math.round(Math.sqrt(n*o))),a=Math.ceil(n/e),l=[];for(let r=0;r<n;r++){const s=r%e,u=Math.floor(r/e);l.push([(s+.5)/e-.5,(.5-(u+.5)/a)*(a/e)*1])}return l},mask(n,o,{aspect:e}={}){let a,l=1,r=1;if(typeof n=="function")a=n,l=e||1,r=1;else{const i=n.data?n:n.getContext("2d").getImageData(0,0,n.width,n.height);l=i.width,r=i.height;const w=i.data,C=w[0]+w[1]+w[2],b=w[3]>127;a=(p,m)=>{const d=(Math.min(r-1,Math.floor(m*r))*l+Math.min(l-1,Math.floor(p*l)))*4;return b?Math.abs(w[d]+w[d+1]+w[d+2]-C)>180:w[d+3]>127}}const s=l/r,u=Math.sqrt(s/(o*14)),c=[];for(let i=u/2;i<1;i+=u/1)for(let w=u/(2*s);w<1;w+=u/s)a(w,i)&&c.push([w-.5,(.5-i)/s]);if(!c.length)return Ot.grid(o);const z=c.length,h=new Float32Array(z).fill(1e9),x=[];let f=0;for(let i=1;i<z;i++)c[i][0]<c[f][0]&&(f=i);for(let i=0;i<o;i++){const w=c[f];x.push([w[0],w[1]]);let C=0,b=-1;for(let p=0;p<z;p++){const m=c[p][0]-w[0],d=c[p][1]-w[1],V=m*m+d*d;V<h[p]&&(h[p]=V),h[p]>b&&(b=h[p],C=p)}f=C}return x},text(n,o,{font:e="800 160px Figtree, system-ui, sans-serif"}={}){const a=document.createElement("canvas"),l=a.getContext("2d");l.font=e;const r=l.measureText(n);return a.width=Math.ceil(r.width+40),a.height=220,l.font=e,l.fillStyle="#000",l.textBaseline="middle",l.fillText(n,20,112),Ot.mask(a,o)}};function Ve(n,o={}){const e=o.count||40,a=o.size||.16,l=o.seed||1,r=o.colours||jt,s=Math.cbrt(e)*a*.95,u=o.spread||[s*1.25,s*.62,s*1.05],c=ne(e,l),z=te(),h=new t.InstancedBufferAttribute(new Float32Array(e*3),3),x=new t.InstancedBufferAttribute(new Float32Array(e*4),4);x.setUsage(t.DynamicDrawUsage),z.setAttribute("aColour",h),z.setAttribute("aSwim",x);const f=(M,F)=>{const P=it(F);h.setXYZ(M,P.r,P.g,P.b),h.needsUpdate=!0};for(let M=0;M<e;M++)f(M,r[M%r.length]);const i={...n.light,uPaper:{value:it(Wt)}},w=new t.ShaderMaterial({vertexShader:ee,fragmentShader:oe,uniforms:i,side:t.DoubleSide}),C=new t.InstancedMesh(z,w,e);C.instanceMatrix.setUsage(t.DynamicDrawUsage),C.frustumCulled=!1;const b=c.map(()=>({p:new t.Vector3,q:new t.Quaternion,s:1,phase:0,amp:.6,flash:0,visible:!0}));let p=o.shadow!==!1,m=o.shadowOpacity??.3;const d=new WeakMap,V=new t.Matrix4,W=new t.Vector3,q=new t.Vector3,U=new t.Vector3,L=new t.Quaternion,k=new t.Quaternion,S=new t.Vector3,y=new t.Vector3,g=new t.Vector3,B=new t.Matrix4().makeScale(0,0,0),A=c.map(M=>M.z).slice().sort((M,F)=>F-M),R=c.map(M=>A.indexOf(M.z)/Math.max(1,e-1));function N(M){let F=d.get(M);if(F)return F;const P=Math.min(M.length,e);F=new Int32Array(e).fill(-1);const D=new Uint8Array(e),X=M.slice(0,P).map((E,J)=>[E,J]).sort((E,J)=>E[0][0]-J[0][0]||J[0][1]-E[0][1]);for(const[E,J]of X){let Z=-1,$=1e9;for(let O=0;O<e;O++){if(D[O])continue;const nt=c[O].x*.5-E[0],ht=c[O].y*.5-E[1],at=nt*nt+ht*ht;at<$&&($=at,Z=O)}D[Z]=1,F[Z]=J}return d.set(M,F),F}const I={object:C,count:e,size:a,spread:u,slots:c,setColour(M,F){return f(M,F),I},fish(M){return b[M]},centre(M=new t.Vector3){M.set(0,0,0);let F=0;for(const P of b)P.visible&&(M.add(P.p),F++);return F?M.multiplyScalar(1/F):M},set(M={}){const F=M.path,P=M.u??0,D=M.t??0,X=M.lag??1,E=M.tight??1,J=M.speed??1,Z=F?St(F).total:1,$=M.only??e,O=M.form&&M.form.amount>0?M.form:null,nt=O?N(O.points):null,ht=O?_(O.at,new t.Vector3):null,at=O?ft(O.frame,new t.Quaternion):null,mt=O?O.size??u[0]*2:1,lt=M.part&&M.part.amount>0?M.part:null,_t=lt?_(lt.at,new t.Vector3):null;for(let rt=0;rt<e;rt++){const G=b[rt],K=c[rt];if(G.visible=rt<$,!G.visible)continue;let gt=K.x*u[0]*E,bt=K.y*u[1]*E,yt=K.z*u[2]*E;const Ct=.08*a;gt+=Ct*Math.sin(D*.9+K.phase),bt+=Ct*.6*Math.sin(D*.7+K.phase*1.7);let Ft=P;if(F){const tt=(u[2]*E-yt)*X;Ft=Lt(F,Qt(F,P)-tt);const Q=qt(F,Ft,{bank:M.bank??1.6,maxBank:.7,du:Math.min(.01,.4/Math.max(Z,.1))});S.set(1,0,0).applyQuaternion(Q.quaternion),y.set(0,1,0).applyQuaternion(Q.quaternion),g.set(0,0,1).applyQuaternion(Q.quaternion),G.p.copy(Q.position).addScaledVector(S,gt).addScaledVector(y,bt).addScaledVector(g,(1-X)*yt),G.q.copy(Q.quaternion)}else{const tt=_(M.at,U),Q=ft(M.quaternion,k);G.p.set(gt,bt,yt).applyQuaternion(Q).add(tt),G.q.copy(Q)}if(L.setFromAxisAngle(ut,.12*Math.sin(D*.8+K.phase*2.3)),G.q.multiply(L),G.flash=0,G.amp=.55+.25*K.seed,M.wave>0&&M.wave<1){const tt=H((M.wave*1.6-R[rt]*.6)/1),Q=Math.sin(Math.PI*tt);if(Q>0){const st=K.seed>.5?1:-1;L.setFromAxisAngle(new t.Vector3(0,0,1),st*1.1*Q*Q),G.q.multiply(L),G.p.addScaledVector(q.set(st*.35*a*Q,.1*a*Q,0).applyQuaternion(G.q),1),G.flash=Q*Q,G.amp+=.5*Q}}if(lt){const tt=lt.radius??u[0];g.set(0,0,1).applyQuaternion(G.q),q.subVectors(G.p,_t),q.addScaledVector(g,-q.dot(g));let Q=q.length();Q<1e-4&&(q.set(K.seed-.5,K.phase/T-.5,0).applyQuaternion(G.q),Q=q.length()||1),q.multiplyScalar(1/Q);const st=tt*1.15,pt=lt.amount*Math.max(0,st-Q)*Y(st*1.6,st*.2,Q)+lt.amount*.15*tt*Math.exp(-(Q*Q)/(tt*tt));G.p.addScaledVector(q,pt);const et=H(pt/tt)*.7;U.crossVectors(g,q).normalize(),U.lengthSq()>.5&&(L.setFromAxisAngle(U,-et),G.q.premultiply(L)),G.amp+=et*.8}if(O&&nt[rt]>=0){const tt=nt[rt],Q=O.points[tt],st=O.stagger??.6,pt=R[rt]*.5+tt/Math.max(1,O.points.length)*.5,et=H(O.amount*(1+st)-pt*st),kt=Rt(et),Pt=q.set(Q[0]*mt,Q[1]*mt,0).applyQuaternion(at).add(ht);let wt;if(O.points.ring){const xt=new t.Vector3(-Q[1],Q[0],0).normalize().applyQuaternion(at);wt=Mt(xt,new t.Vector3(0,0,1).applyQuaternion(at))}else wt=Mt(new t.Vector3(1,0,0).applyQuaternion(at),new t.Vector3(0,1,0).applyQuaternion(at));const Nt=G.p.clone(),Zt=G.q.clone();G.p.lerpVectors(Nt,Pt,kt),G.p.addScaledVector(new t.Vector3(0,1,0).applyQuaternion(at),(O.arc??.3)*mt*.25*Math.sin(Math.PI*kt));const Bt=U.subVectors(Pt,Nt);if(Bt.lengthSq()>1e-8&&et>0&&et<1){const xt=Mt(Bt.normalize(),ut),$t=Math.sin(Math.PI*Math.min(1,et*1.25))*(et<.8?1:(1-et)/.2);G.q.copy(Zt).slerp(xt,H($t)).slerp(wt,Y(.55,1,et))}else et>=1&&G.q.copy(wt);G.amp=dt(G.amp,.3,Y(.7,1,et))+.6*Math.sin(Math.PI*et),G.p.y+=Y(.85,1,et)*.05*a*Math.sin(D*1.4+K.phase)}G.s=K.size,G.phase=K.phase+D*T*1.6*J*(.9+.2*K.seed)+G.amp*0}return p=M.shadow??p,I},update(M){for(let F=0;F<e;F++){const P=b[F];if(!P.visible){C.setMatrixAt(F,B);continue}const D=a*P.s;if(V.compose(P.p,P.q,W.set(D,D,D)),C.setMatrixAt(F,V),x.setXYZW(F,P.phase,P.amp,P.flash,c[F].seed),p&&m>0){const X=M.groundHeight(P.p.x,P.p.z),E=P.p.y-X;if(E<3){const J=q.set(.09*D,0,0).applyQuaternion(P.q);J.y=0;const Z=U.set(0,0,.5*D).applyQuaternion(P.q);Z.y=0,J.lengthSq()<1e-10&&J.set(.09*D,0,0),Z.lengthSq()<1e-10&&Z.set(0,0,.5*D),M.shadows.cast(P.p,J.clone(),Z.clone(),{opacity:m*(1-E/3),size:D,base:.15*D,round:1})}}}C.instanceMatrix.needsUpdate=!0,x.needsUpdate=!0},dispose(){z.dispose(),w.dispose()}};return I}function Vt(n,{period:o=3.4,seed:e=0}={}){const a=n/o+e,l=Math.floor(a),r=a-l,s=r<.22?Rt(r/.22):1-Gt((r-.22)/.78)*1,u=5,c=(1-Math.exp(-u*H((r-.06)/.94)))/(1-Math.exp(-u));return{c:H(s),s:l+c,phase:r}}function ae(n,o={}){const e=o.seed??0,a=Vt(n,{period:o.period??3.4,seed:e}),l=o.sway??.25,r=_(o.heading||[.25,1,.1],new t.Vector3).normalize(),s=new t.Quaternion().setFromEuler(new t.Euler(l*Math.sin(n*.11+e*7),0,l*Math.sin(n*.083+e*3+1))),u=r.clone().applyQuaternion(s),c=o.stride??.35,z=_(o.at,new t.Vector3).addScaledVector(r,a.s*c*.5).addScaledVector(u,a.s*c*.5),h=new t.Quaternion().setFromUnitVectors(ut,u);return{position:z,quaternion:h,c:a.c}}const re={rings:14,segs:36};function se(){const{rings:n,segs:o}=re,e=[],a=[],l=[];for(let s=0;s<=n;s++)for(let u=0;u<=o;u++)e.push(0,0,0),a.push(s/n,u/o);for(let s=0;s<n;s++)for(let u=0;u<o;u++){const c=s*(o+1)+u,z=c+1,h=c+o+1,x=h+1;l.push(c,z,h,z,x,h)}const r=new t.BufferGeometry;return r.setAttribute("position",new t.Float32BufferAttribute(e,3)),r.setAttribute("uv",new t.Float32BufferAttribute(a,2)),r.setIndex(l),r}function ie(){const o=[],e=[],a=[],l=[];let r=0;const s=(c,z,h,x)=>{for(let f=0;f<=24;f++)for(const i of[-1,1])o.push(0,0,0),e.push(c,z,h,x),a.push(f/24,i);for(let f=0;f<24;f++){const i=r+f*2;l.push(i,i+1,i+2,i+1,i+3,i+2)}r+=50};for(let c=0;c<4;c++)s(0,(c+.5)*(T/4),1.5+.25*j("arm"+c),j("as"+c));for(let c=0;c<16;c++)s(1,(c+.5)*(T/16),1.35+.75*j("ten"+c),j("ts"+c));const u=new t.BufferGeometry;return u.setAttribute("position",new t.Float32BufferAttribute(o,3)),u.setAttribute("aRib",new t.Float32BufferAttribute(e,4)),u.setAttribute("aVW",new t.Float32BufferAttribute(a,2)),u.setIndex(l),u}const Tt=`
// the bell's surface at (u from the apex 0 to the margin 1, angle th) for contraction c; unit radius
vec3 bellAt(float u, float th, float c, float seed) {
  float r = sin(u * 1.32) / sin(1.32);
  float y = 0.62 * (1.0 - pow(u, 1.75));
  r *= 1.0 - 0.3 * c * u * u - 0.12 * c * smoothstep(0.75, 1.0, u);
  y *= 1.0 + 0.28 * c;
  y -= 0.06 * c * smoothstep(0.7, 1.0, u);
  // eight soft lobes on the margin
  float lobe = cos(8.0 * th + seed * 6.28);
  r *= 1.0 + 0.04 * smoothstep(0.78, 1.0, u) * lobe;
  y += 0.025 * smoothstep(0.85, 1.0, u) * lobe;
  return vec3(r * cos(th), y, r * sin(th));
}`,Et=`
${ot}
${Tt}
attribute vec3 aColour; attribute vec4 aJel;   // contraction, t, glow, seed
varying vec3 vWorld; varying vec3 vN; varying vec2 vUv; varying vec3 vColour; varying vec4 vJel;
void main() {
  float u = uv.x, th = uv.y * 6.2831853;
  float c = aJel.x;
  vec3 p = bellAt(u, th, c, aJel.w);
  vec3 pu = bellAt(min(u + 0.02, 1.02), th, c, aJel.w) - bellAt(max(u - 0.02, 0.0), th, c, aJel.w);
  vec3 pt = bellAt(u, th + 0.03, c, aJel.w) - bellAt(u, th - 0.03, c, aJel.w);
  vec3 n = normalize(cross(pt, pu));
  if (u < 0.02) n = vec3(0.0, 1.0, 0.0);
  if (n.y < -0.9 && u < 0.5) n = -n;
  mat4 m = modelMatrix * instanceMatrix;
  vec4 wp = m * vec4(p, 1.0);
  vN = normalize(mat3(m) * n);
  vWorld = wp.xyz; vUv = vec2(u, th); vColour = aColour; vJel = aJel;
  gl_Position = projectionMatrix * viewMatrix * wp;
}`,Jt=`
${ot}
${ct}
uniform float uSide;   // 0 the inside (drawn first), 1 the outside
uniform float uGlowGain;
varying vec3 vWorld; varying vec3 vN; varying vec2 vUv; varying vec3 vColour; varying vec4 vJel;
void main() {
  vec3 V = normalize(cameraPosition - vWorld);
  vec3 N = normalize(vN);
  if (uSide < 0.5) N = -N;
  float ndv = abs(dot(N, V));
  float fres = pow(1.0 - ndv, 2.2);
  float u = vUv.x, th = vUv.y;
  // the four soft horseshoes inside (where the light lives), and a faint radial canal pattern
  float lobes = pow(0.5 + 0.5 * cos(4.0 * th), 1.5);
  float ring = exp(-pow((u - 0.36 - 0.06 * lobes) / 0.1, 2.0)) * (0.35 + 0.65 * lobes);
  float canals = smoothstep(0.86, 1.0, 0.5 + 0.5 * cos(16.0 * th)) * smoothstep(0.35, 0.9, u) * 0.4;
  float rim = smoothstep(0.86, 1.0, u);
  vec3 body = mix(vec3(0.8, 0.9, 0.96), vColour, 0.5);
  vec3 lit = lightPlayer(body, N, V, 1.0, 0.9, 0.5, 0.8);
  float glow = vJel.z * uGlowGain;
  vec3 gcol = mix(vColour, vec3(1.0), 0.3);
  float a = 0.05 + 0.42 * fres + 0.32 * ring + 0.24 * rim + 0.1 * canals;
  a *= uSide < 0.5 ? 0.55 : 1.0;
  vec3 col = min(lit, vec3(1.1)) * (0.42 + 0.45 * fres);
  col = mix(col, col * mix(vec3(1.0), vColour * 1.6, 0.5), ring * 0.7);
  vec3 emit = gcol * glow * (0.06 + 0.8 * ring + 0.25 * rim + 0.12 * fres + 0.15 * vJel.x);
  float dist = length(cameraPosition - vWorld);
  float k = 1.0 - exp(-uHazeDensity * dist);
  col = haze(shoulder(col), dist);
  a = clamp(a, 0.0, 0.92) * (1.0 - 0.75 * k);
  emit *= 1.0 - 0.7 * k;
  vec3 outc = col * a + emit;
  gl_FragColor = vec4(outc, a);
  gl_FragColor.rgb = linearToOutputTexel(vec4(gl_FragColor.rgb, 1.0)).rgb;
}`,ce=`
${ot}
${Tt}
attribute vec4 aRib; attribute vec2 aVW;
attribute vec3 aColour; attribute vec4 aJel;
varying vec3 vWorld; varying vec2 vVW; varying vec3 vColour; varying vec4 vJel; varying float vKind;
vec3 ribAt(float v) {
  float kind = aRib.x, ang = aRib.y, len = aRib.z, sd = aRib.w;
  float c = aJel.x, t = aJel.y;
  vec3 a0 = kind < 0.5 ? vec3(0.13 * cos(ang), 0.06, 0.13 * sin(ang)) : bellAt(0.985, ang, c, aJel.w) * vec3(0.97, 1.0, 0.97);
  // hang down and trail: the ends lag behind the squeeze (stretch while the bell pulls, then drift)
  float L = len * (1.0 + 0.12 * c);
  vec3 p = a0 + vec3(0.0, -v * L, 0.0);
  float s1 = sin(t * 1.1 - v * 5.0 + sd * 6.28), s2 = cos(t * 0.8 - v * 4.0 + sd * 9.0);
  float sway = (kind < 0.5 ? 0.18 : 0.26) * pow(v, 1.3);
  p.x += sway * s1 + 0.05 * v * cos(ang) * (1.0 - c);
  p.z += sway * s2 + 0.05 * v * sin(ang) * (1.0 - c);
  // arms gather inward under the bell, tentacles spread a little as the bell relaxes
  if (kind < 0.5) { p.x *= 1.0 - 0.4 * v; p.z *= 1.0 - 0.4 * v; }
  else { p.xz *= 1.0 + 0.25 * v * (1.0 - c); }
  return p;
}
void main() {
  float v = aVW.x, w = aVW.y;
  mat4 m = modelMatrix * instanceMatrix;
  vec3 c0 = (m * vec4(ribAt(v), 1.0)).xyz;
  vec3 c1 = (m * vec4(ribAt(v + 0.02), 1.0)).xyz;
  vec3 tg = normalize(c1 - c0 + vec3(1e-5));
  vec3 view = normalize(cameraPosition - c0);
  vec3 side = normalize(cross(tg, view));
  float scale = length(m[0].xyz);
  float wid = aRib.x < 0.5 ? (0.1 * (1.0 - 0.55 * v)) * (1.0 + 0.35 * sin(v * 34.0 + aJel.y * 2.0 + aRib.w * 9.0)) : 0.012 * (1.0 - 0.6 * v);
  vec3 wp = c0 + side * w * wid * scale;
  vWorld = wp; vVW = aVW; vColour = aColour; vJel = aJel; vKind = aRib.x;
  gl_Position = projectionMatrix * viewMatrix * vec4(wp, 1.0);
}`,le=`
${ot}
${ct}
uniform float uGlowGain;
varying vec3 vWorld; varying vec2 vVW; varying vec3 vColour; varying vec4 vJel; varying float vKind;
void main() {
  float v = vVW.x, w = abs(vVW.y);
  float edge = smoothstep(1.0, 0.55, w);
  vec3 body = mix(vec3(0.9, 0.95, 0.98), vColour, vKind < 0.5 ? 0.45 : 0.3);
  vec3 col = body * min(uKeyTint * 0.4 + uShadeTint * 0.4, vec3(1.0));
  float a = (vKind < 0.5 ? 0.42 : 0.5) * edge * (1.0 - smoothstep(0.7, 1.0, v));
  if (vKind < 0.5) a *= 0.7 + 0.3 * smoothstep(0.4, 0.95, w);   // frilly edges read brighter
  float glow = vJel.z * uGlowGain;
  vec3 emit = mix(vColour, vec3(1.0), 0.4) * glow * (vKind < 0.5 ? 0.5 : 0.3) * edge * (1.0 - v);
  float dist = length(cameraPosition - vWorld);
  float k = 1.0 - exp(-uHazeDensity * dist);
  col = haze(col, dist);
  a *= 1.0 - 0.75 * k; emit *= 1.0 - 0.7 * k;
  gl_FragColor = vec4(linearToOutputTexel(vec4(col * a + emit, 1.0)).rgb, a);
}`,ue=`
attribute vec3 aColour; attribute vec4 aJel;
varying vec2 vQ; varying vec3 vColour; varying float vGlow; varying float vDist;
void main() {
  mat4 m = modelMatrix * instanceMatrix;
  vec3 c = (m * vec4(0.0, 0.25, 0.0, 1.0)).xyz;
  float s = length(m[0].xyz) * 3.2;
  vec3 r = vec3(viewMatrix[0][0], viewMatrix[1][0], viewMatrix[2][0]);
  vec3 u = vec3(viewMatrix[0][1], viewMatrix[1][1], viewMatrix[2][1]);
  vec3 wp = c + (r * position.x + u * position.y) * s;
  vQ = position.xy; vColour = aColour; vGlow = aJel.z * (1.0 + 0.25 * aJel.x); vDist = length(cameraPosition - c);
  gl_Position = projectionMatrix * viewMatrix * vec4(wp, 1.0);
}`,de=`
uniform float uHazeDensity; uniform float uGlowGain;
varying vec2 vQ; varying vec3 vColour; varying float vGlow; varying float vDist;
void main() {
  float d = length(vQ);
  float f = exp(-d * d * 7.0) * 0.55 + exp(-d * d * 28.0) * 0.45;
  f *= 1.0 - smoothstep(0.8, 1.0, d);
  vec3 c = mix(vColour, vec3(1.0), 0.3) * f * vGlow * uGlowGain * 0.85 * (1.0 - 0.6 * (1.0 - exp(-uHazeDensity * vDist)));
  gl_FragColor = vec4(linearToOutputTexel(vec4(c, 1.0)).rgb, 0.0);
}`,Xt=.08;function Ce(n,o={}){const e=o.count||3,a=o.colours||["#2FA6A0","#6F5FC7","#E8674C","#3F78D0"],l=o.size||.18;let r=o.world||null;const s={intensity:o.lightIntensity??.3,radius:o.lightRadius??1},u=new t.InstancedBufferAttribute(new Float32Array(e*3),3),c=new t.InstancedBufferAttribute(new Float32Array(e*4),4);c.setUsage(t.DynamicDrawUsage);const z=se(),h=ie(),x=new t.PlaneGeometry(2,2);for(const v of[z,h,x])v.setAttribute("aColour",u),v.setAttribute("aJel",c),v.boundingSphere=new t.Sphere(new t.Vector3,1e5);const f={value:1},i={transparent:!0,depthWrite:!1,blending:t.CustomBlending,blendSrc:t.OneFactor,blendDst:t.OneMinusSrcAlphaFactor,blendSrcAlpha:t.OneFactor,blendDstAlpha:t.OneMinusSrcAlphaFactor},w=new t.ShaderMaterial({vertexShader:Et,fragmentShader:Jt,uniforms:{...n.light,uSide:{value:0},uGlowGain:f},side:t.BackSide,...i}),C=new t.ShaderMaterial({vertexShader:Et,fragmentShader:Jt,uniforms:{...n.light,uSide:{value:1},uGlowGain:f},side:t.FrontSide,...i}),b=new t.ShaderMaterial({vertexShader:ce,fragmentShader:le,uniforms:{...n.light,uGlowGain:f},side:t.DoubleSide,...i}),p={value:f.value*Xt},m=new t.ShaderMaterial({vertexShader:ue,fragmentShader:de,uniforms:{uHazeDensity:n.light.uHazeDensity,uGlowGain:p},transparent:!0,depthWrite:!1,blending:t.CustomBlending,blendSrc:t.OneFactor,blendDst:t.OneFactor,blendSrcAlpha:t.ZeroFactor,blendDstAlpha:t.OneFactor}),d=new t.Group,V=(v,A,R)=>{const N=new t.InstancedMesh(v,A,e);return N.frustumCulled=!1,N.renderOrder=R,N.instanceMatrix.setUsage(t.DynamicDrawUsage),d.add(N),N},W=V(x,m,1),q=V(h,b,2),U=V(z,w,3),L=V(z,C,4);W.visible=o.halo!==!1;const k=[];for(let v=0;v<e;v++){const A=it(a[v%a.length]);u.setXYZ(v,A.r,A.g,A.b),k.push({position:new t.Vector3,quaternion:new t.Quaternion,size:l,t:0,c:null,glow:o.glow??.4,visible:!0,seed:j("jelly"+v),hex:a[v%a.length]})}const S=new t.Matrix4,y=new t.Vector3,g=new t.Matrix4().makeScale(0,0,0),B={object:d,count:e,get(v){return k[v]},set(v,A){const R=k[v];if(!R)return B;A.position&&_(A.position,R.position),A.quaternion&&ft(A.quaternion,R.quaternion);for(const N of["size","t","glow","visible"])A[N]!==void 0&&(R[N]=A[N]);if("c"in A&&(R.c=A.c),A.colour){R.hex=A.colour;const N=it(A.colour);u.setXYZ(v,N.r,N.g,N.b),u.needsUpdate=!0}return A.visible===void 0&&A.position&&(R.visible=!0),B},swim(v,A,R={}){const N=ae(A,{seed:k[v].seed,...R});return B.set(v,{position:N.position,quaternion:N.quaternion,t:A,c:N.c})},hideAll(){for(const v of k)v.visible=!1;return B},lights(){return k.filter(v=>v.visible&&v.glow>.01).slice(0,8).map(v=>{const A=v.c??Vt(v.t,{seed:v.seed}).c;return{p:new t.Vector3(0,.25*v.size,0).applyQuaternion(v.quaternion).add(v.position).toArray(),colour:v.hex,radius:v.size*6*s.radius,intensity:s.intensity*v.glow*(.85+.3*A)}})},setWorld(v){return r=v||null,B},setGlowGain(v){f.value=v,p.value=v*Xt},update(){for(let v=0;v<e;v++){const A=k[v];if(!A.visible){for(const N of[W,q,U,L])N.setMatrixAt(v,g);continue}const R=A.c??Vt(A.t,{seed:A.seed}).c;S.compose(A.position,A.quaternion,y.set(A.size,A.size,A.size));for(const N of[W,q,U,L])N.setMatrixAt(v,S);c.setXYZW(v,R,A.t,A.glow,A.seed)}for(const v of[W,q,U,L])v.instanceMatrix.needsUpdate=!0;c.needsUpdate=!0,r&&typeof r.setGlows=="function"&&r.setGlows(B.lights())},dispose(){for(const v of[z,h,x])v.dispose();for(const v of[w,C,b,m])v.dispose()}};return B}function ve(){const n=[],o=[],e=[],a=[];let l=0;const r=40,s=28,u=(i,w,C)=>Math.pow(Math.sin(Math.PI*H(Math.pow(i,w))),C),c=i=>.078*u(i,.8,.55)*(1-.62*i)+.012,z=i=>.112*u(i,.62,.7)*(1-.7*i)+.012,h=i=>.1*u(i,.62,.6)*(1-.66*i)+.01-.004*Y(.75,1,i);for(let i=0;i<=r;i++){const w=i/r,C=.5-w*.93;for(let b=0;b<=s;b++){const p=b/s*T,m=Math.cos(p),d=Math.sin(p),V=h(w)*m*(d<0?1-.12*d*d:1);let W=d>0?c(w)*d:z(w)*d;d>0&&(W+=.018*Math.exp(-Math.pow((w-.66)/.05,2))*Math.pow(d,6)),n.push(V,W+.012*(1-w),C),o.push(0),e.push(0)}}for(let i=0;i<r;i++)for(let w=0;w<s;w++){const C=i*(s+1)+w,b=C+1,p=C+s+1,m=p+1;a.push(C,p,b,b,p,m)}l=(r+1)*(s+1);const x=(i,w,C,b,p,m,d,V)=>{const U=l;for(let L=0;L<=16;L++){const k=L/16,S=b*(1-.75*k)*(.75+.25*Math.sin(Math.PI*Math.min(1,k*1.3)));for(let y=0;y<=12;y++){const g=y/12*T,B=0,v=Math.cos(g)*S*.5,A=Math.sin(g)*p*(1-.6*k)*.5,R=i*(.07+k*C),N=-.03-d*k+A,I=w-m*k*k+v+(y>12/2?.01*Math.sin(k*18)*k:0);n.push(R+B,N,I),o.push(V),e.push(k)}}for(let L=0;L<16;L++)for(let k=0;k<12;k++){const S=U+L*13+k,y=S+1,g=S+12+1,B=g+1;i>0?a.push(S,g,y,y,g,B):a.push(S,y,g,y,B,g)}l+=221};x(1,.27,.28,.07,.016,.26,.035,1),x(-1,.27,.28,.07,.016,.26,.035,2);{const C=l;for(let b=0;b<=24;b++){const p=b/24*2-1,m=Math.abs(p),d=-.405-.09*Math.pow(m,1.5),V=-.49-.03*m+.03*(1-Y(0,.2,m))-.05*Math.pow(m,3);for(let W=0;W<=8;W++){const q=W/8*T,U=(d+V)/2,L=Math.max(.002,(d-V)/2),k=U+Math.cos(q)*L,S=Math.sin(q)*.008*(1-.7*m);n.push(p*.17,S+.006,k),o.push(3),e.push(m)}}for(let b=0;b<24;b++)for(let p=0;p<8;p++){const m=C+b*9+p,d=m+1,V=m+8+1,W=V+1;a.push(m,V,d,d,V,W)}l+=225}const f=new t.BufferGeometry;return f.setAttribute("position",new t.Float32BufferAttribute(n,3)),f.setAttribute("aPart",new t.Float32BufferAttribute(o,1)),f.setAttribute("aRoot",new t.Float32BufferAttribute(e,1)),f.setIndex(a),f.computeVertexNormals(),f}const fe=`
${ot}
attribute float aPart; attribute float aRoot;
uniform vec4 uBeat;   // phase (rad), amplitude, fin phase, fin amplitude
varying vec3 vWorld; varying vec3 vN; varying vec3 vLocal; varying float vPart; varying float vRoot;
float beatY(float z) {
  float b = clamp((0.15 - z) / 0.65, 0.0, 1.0);
  return uBeat.y * (0.004 * b + 0.07 * b * b * b) * sin(uBeat.x + z * 3.2);
}
void main() {
  vec3 p = position;
  // the slow up-and-down beat, travelling to the fluke; the normal follows the bend
  float y0 = beatY(p.z), y1 = beatY(p.z - 0.01);
  p.y += y0;
  float slope = (y0 - y1) / 0.01;
  vec3 n = normalize(vec3(normal.x, normal.y, normal.z - normal.y * slope));
  if (aPart > 0.5 && aPart < 2.5) p.y += uBeat.w * 0.06 * aRoot * aRoot * sin(uBeat.z + aRoot * 1.5);
  mat4 m = modelMatrix;
  vec4 wp = m * vec4(p, 1.0);
  vN = normalize(mat3(m) * n);
  vWorld = wp.xyz; vLocal = position; vPart = aPart; vRoot = aRoot;
  gl_Position = projectionMatrix * viewMatrix * wp;
}`,he=`
${ot}
${ct}
uniform vec3 uBack; uniform vec3 uBelly; uniform float uFade; uniform float uHazeScale;
varying vec3 vWorld; varying vec3 vN; varying vec3 vLocal; varying float vPart; varying float vRoot;
void main() {
  vec3 V = normalize(cameraPosition - vWorld);
  vec3 N = normalize(vN);
  if (!gl_FrontFacing) N = -N;
  // countershading: a soft slate back, a pale belly; the long fins pale underneath and at the tips
  float belly = smoothstep(0.01, -0.06, vLocal.y + 0.02 * sin(vLocal.z * 20.0) * step(0.0, vLocal.z));
  vec3 base = mix(uBack, uBelly, belly);
  if (vPart > 0.5 && vPart < 2.5) base = mix(uBack, uBelly, clamp(0.35 + 0.6 * smoothstep(0.0, -0.01, N.y) + 0.3 * vRoot, 0.0, 1.0));
  if (vPart > 2.5) base = mix(uBack, uBelly, 0.25 * smoothstep(0.0, -0.5, N.y));
  // throat grooves: soft pale lines under the head (shape, not detail)
  float grooves = smoothstep(0.75, 1.0, 0.5 + 0.5 * sin(vLocal.x * 260.0)) * smoothstep(0.05, 0.42, vLocal.z) * belly * 0.12;
  base = mix(base, base * 0.86, grooves);
  float grain = fbm(vLocal * 30.0);
  base *= 0.96 + 0.06 * grain;
  vec3 col = lightPlayer(base, N, V, 1.0, 0.0, grain, 0.7);
  float dist = length(cameraPosition - vWorld);
  // big and far: it keeps its shape as a soft dark silhouette (lit water in front of a body that
  // blocks the light behind it), then melts into the water
  float k = 1.0 - exp(-uHazeDensity * uHazeScale * dist);
  col = mix(shoulder(col), uHazeColor * 0.74, k);
  col = mix(col, uHazeColor, pow(k, 6.0));
  col = mix(col, uHazeColor * 0.82, uFade);
  gl_FragColor = linearToOutputTexel(vec4(col, 1.0));
}`;function Fe(n,o={}){const e=ve(),a={...n.light,uBeat:{value:new t.Vector4(0,1,0,1)},uBack:{value:it(o.back||"#5E7C9E")},uBelly:{value:it(o.belly||"#DCE4EA")},uFade:{value:0},uHazeScale:{value:o.haze??.45}},l=new t.ShaderMaterial({vertexShader:fe,fragmentShader:he,uniforms:a,side:t.DoubleSide}),r=new t.Mesh(e,l);r.frustumCulled=!1;const s={position:new t.Vector3(0,-8,-60),quaternion:new t.Quaternion,t:0,beat:1,period:7,fade:0,length:o.length||12,visible:!0},u={object:r,get state(){return s},set(c){c.position&&_(c.position,s.position),c.quaternion&&ft(c.quaternion,s.quaternion);for(const z of["t","beat","period","fade","length","visible"])c[z]!==void 0&&(s[z]=c[z]);return u},along(c,z,h,x={}){const f=qt(c,z,{bank:x.bank??.6,maxBank:.35,du:.004}),i=h/(x.period??s.period)*T;return f.position.y+=.012*s.length*Math.sin(i-.6),u.set({position:f.position,quaternion:f.quaternion,t:h,...x})},update(){r.visible=s.visible,r.position.copy(s.position),r.quaternion.copy(s.quaternion),r.scale.setScalar(s.length);const c=s.t/s.period*T;a.uBeat.value.set(c,s.beat,c*.5+1,s.beat),a.uFade.value=s.fade},dispose(){e.dispose(),l.dispose()}};return u}function ke({from:n=[-60,-10,-70],to:o=[60,-6,-80],bow:e=12,rise:a=3}={}){const l=_(n,new t.Vector3),r=_(o,new t.Vector3),s=new t.Vector3().subVectors(r,l).cross(ut).normalize();return u=>new t.Vector3().lerpVectors(l,r,u).addScaledVector(s,e*Math.sin(Math.PI*u)).add(new t.Vector3(0,a*Math.sin(Math.PI*u),0))}const pe=`
attribute vec4 aBub;   // centre xyz, radius
attribute vec4 aWob;   // wobble phase, wobble amount, alpha, seed
varying vec2 vQ; varying float vA; varying vec3 vWorld; varying float vSeed;
void main() {
  vec3 r = vec3(viewMatrix[0][0], viewMatrix[1][0], viewMatrix[2][0]);
  vec3 u = vec3(viewMatrix[0][1], viewMatrix[1][1], viewMatrix[2][1]);
  float w = aWob.y * sin(aWob.x);
  vec3 wp = aBub.xyz + (r * position.x * (1.0 + w) + u * position.y * (1.0 - w * 0.8)) * aBub.w;
  vQ = position.xy; vA = aWob.z; vWorld = aBub.xyz; vSeed = aWob.w;
  gl_Position = projectionMatrix * viewMatrix * vec4(wp, 1.0);
}`,we=`
${ot}
${ct}
varying vec2 vQ; varying float vA; varying vec3 vWorld; varying float vSeed;
void main() {
  float r2 = dot(vQ, vQ);
  if (r2 > 1.0) discard;
  float r = sqrt(r2);
  float nz = sqrt(1.0 - r2);
  float fres = pow(1.0 - nz, 2.0);
  // where the light is, on screen: highlights sit toward it
  vec3 L = uKeyDir;
  vec2 l2 = normalize(vec2(dot(L, vec3(viewMatrix[0][0], viewMatrix[1][0], viewMatrix[2][0])), dot(L, vec3(viewMatrix[0][1], viewMatrix[1][1], viewMatrix[2][1]))) + vec2(1e-4));
  float hi = exp(-dot(vQ - l2 * 0.48, vQ - l2 * 0.48) / 0.028);
  float hi2 = exp(-dot(vQ + l2 * 0.55, vQ + l2 * 0.55) / 0.05) * 0.35;
  float ring = smoothstep(0.72, 0.97, r) * (1.0 - smoothstep(0.97, 1.0, r));
  vec3 water = uHazeColor;
  vec3 sheen = mix(vec3(0.93, 0.98, 1.0), uRimColor, 0.25) * uKeyTint;
  vec3 col = mix(water * 1.5 + sheen * 0.12, sheen, clamp(fres * 1.2 + ring * 0.9, 0.0, 1.0));
  col += sheen * (hi * 1.3 + hi2);
  float a = clamp(0.2 + 0.75 * fres + 0.6 * ring + hi * 0.9 + hi2, 0.0, 1.0);
  a *= smoothstep(1.0, 0.94, r);
  float dist = length(cameraPosition - vWorld);
  float k = 1.0 - exp(-uHazeDensity * dist);
  col = mix(col, uHazeColor, k * 0.8);
  a *= vA * (1.0 - 0.8 * k);
  gl_FragColor = vec4(linearToOutputTexel(vec4(col, 1.0)).rgb * a, a);
}`,me=`
${ot}
attribute vec4 aRing;   // centre xyz, ring radius
attribute vec4 aRing2;  // axis (xyz, unit), tube radius
attribute vec4 aRing3;  // wobble phase, alpha, seed, -
varying vec3 vWorld; varying vec3 vN; varying float vA;
void main() {
  // position: a unit torus (major radius 1, tube 1) in the XZ plane, as (cos th, sin phi, sin th) with normal
  vec3 ax = aRing2.xyz;
  vec3 t1 = normalize(abs(ax.y) < 0.9 ? cross(ax, vec3(0.0, 1.0, 0.0)) : cross(ax, vec3(1.0, 0.0, 0.0)));
  vec3 t2 = cross(ax, t1);
  float th = atan(position.z, position.x);
  float R = aRing.w * (1.0 + 0.06 * sin(3.0 * th + aRing3.x) + 0.04 * sin(5.0 * th - aRing3.x * 1.3 + aRing3.z * 6.0));
  float tube = aRing2.w * (1.0 + 0.25 * sin(4.0 * th + aRing3.x * 0.7 + aRing3.z * 3.0));
  vec3 radial = t1 * cos(th) + t2 * sin(th);
  vec3 n = normal;   // in the torus frame: (cos phi * radial) + sin phi * axis
  vec3 wn = normalize(radial * n.x * cos(th) + radial * n.z * sin(th) + ax * n.y);
  vec3 wp = aRing.xyz + radial * R + wn * tube + ax * 0.08 * R * sin(2.0 * th + aRing3.x);
  vWorld = wp; vN = wn; vA = aRing3.y;
  gl_Position = projectionMatrix * viewMatrix * vec4(wp, 1.0);
}`,ge=`
${ot}
${ct}
varying vec3 vWorld; varying vec3 vN; varying float vA;
void main() {
  vec3 V = normalize(cameraPosition - vWorld);
  vec3 N = normalize(vN);
  float ndv = abs(dot(N, V));
  float fres = pow(1.0 - ndv, 1.6);
  vec3 sheen = mix(vec3(0.93, 0.98, 1.0), uRimColor, 0.25) * uKeyTint;
  float spec = pow(max(dot(reflect(-uKeyDir, N), V), 0.0), 24.0);
  vec3 col = mix(uHazeColor * 1.35, sheen, clamp(fres, 0.0, 1.0)) + sheen * spec;
  float a = clamp(0.22 + 0.75 * fres + spec, 0.0, 1.0);
  float dist = length(cameraPosition - vWorld);
  float k = 1.0 - exp(-uHazeDensity * dist);
  col = mix(col, uHazeColor, k * 0.8);
  a *= vA * (1.0 - 0.8 * k);
  gl_FragColor = vec4(linearToOutputTexel(vec4(col, 1.0)).rgb * a, a);
}`;function Ht(n,o,e,a,l){const r=a*(.75+.5*e),s=2.2*T*(.8+.4*e),u=o*1.6*(1-Math.exp(-n*3));return l.set(u*Math.sin(n*s+e*40),r*n+.04*r*Math.sin(n*s*.5),u*.7*Math.cos(n*s*.8+e*17))}function Pe(n,o={}){const e=o.max||600,a=o.rings||6,l=o.size||.018,r=o.rise||.4,s=new t.InstancedBufferGeometry;s.setAttribute("position",new t.Float32BufferAttribute([-1,-1,0,1,-1,0,1,1,0,-1,1,0],3)),s.setIndex([0,1,2,0,2,3]);const u=new t.InstancedBufferAttribute(new Float32Array(e*4),4),c=new t.InstancedBufferAttribute(new Float32Array(e*4),4);u.setUsage(t.DynamicDrawUsage),c.setUsage(t.DynamicDrawUsage),s.setAttribute("aBub",u),s.setAttribute("aWob",c),s.instanceCount=0,s.boundingSphere=new t.Sphere(new t.Vector3,1e5);const z={transparent:!0,depthWrite:!1,blending:t.CustomBlending,blendSrc:t.OneFactor,blendDst:t.OneMinusSrcAlphaFactor,blendSrcAlpha:t.OneFactor,blendDstAlpha:t.OneMinusSrcAlphaFactor},h=new t.ShaderMaterial({vertexShader:pe,fragmentShader:we,uniforms:{...n.light},...z}),x=new t.Mesh(s,h);x.frustumCulled=!1,x.renderOrder=6;const f=new t.TorusGeometry(1,1,10,48);{const S=f.getAttribute("position"),y=f.getAttribute("normal"),g=new Float32Array(S.count*3),B=new Float32Array(S.count*3);for(let v=0;v<S.count;v++){const A=S.getX(v),R=S.getY(v),N=S.getZ(v),I=Math.atan2(R,A);g.set([Math.cos(I),0,Math.sin(I)],v*3);const M=y.getX(v)*Math.cos(I)+y.getY(v)*Math.sin(I);B.set([M*Math.cos(I),y.getZ(v),M*Math.sin(I)],v*3)}f.setAttribute("position",new t.BufferAttribute(g,3)),f.setAttribute("normal",new t.BufferAttribute(B,3))}const i=new t.InstancedBufferGeometry;i.index=f.index,i.setAttribute("position",f.getAttribute("position")),i.setAttribute("normal",f.getAttribute("normal"));const w=new t.InstancedBufferAttribute(new Float32Array(a*4),4),C=new t.InstancedBufferAttribute(new Float32Array(a*4),4),b=new t.InstancedBufferAttribute(new Float32Array(a*4),4);for(const S of[w,C,b])S.setUsage(t.DynamicDrawUsage);i.setAttribute("aRing",w),i.setAttribute("aRing2",C),i.setAttribute("aRing3",b),i.instanceCount=0,i.boundingSphere=new t.Sphere(new t.Vector3,1e5);const p=new t.ShaderMaterial({vertexShader:me,fragmentShader:ge,uniforms:{...n.light},...z}),m=new t.Mesh(i,p);m.frustumCulled=!1,m.renderOrder=5;const d=new t.Group;d.add(m,x);let V=0,W=0;const q=new t.Vector3,U=new t.Vector3,L=()=>o.surfaceY??0,k={object:d,clear(){return V=0,W=0,k},raw(S,y,g=0,B=.1,v=1,A=0){return V>=e||v<=.003||y<=0||S.y>L()-y||(u.setXYZW(V,S.x,S.y,S.z,y),c.setXYZW(V,g,B,v,A),V++),k},single(S,y,g={}){if(y<0)return k;const B=g.seed??.37,v=g.life??12,A=(g.size??l)*(1+(g.grow??.04)*y)*Math.min(1,y*12+.15);Ht(y,A,B,g.rise??r,U);const R=1-Y(v*.85,v,y);return k.raw(q.copy(_(S,q)).add(U),A,y*13+B*9,.1,R,B)},column(S,y,g={}){const B=g.rate??6,v=g.rise??r,A=g.height??3,R=g.seed??1,N=A/v,I=Math.floor((y-N)*B),M=Math.floor(y*B);for(let F=Math.max(I,-1e6);F<=M;F++){const P=j(R*7919+F),D=y-(F+(g.jitter??.3)*P)/B;D<0||D>N||k.single(S,D,{size:(g.size??l)*(.55+.9*j(R*31+F*3)),rise:v,seed:P,life:N})}return k},burst(S,y,g={}){if(y<=0||y>=1)return k;const B=g.count??16,v=g.seconds??1.8,A=g.spread??.25,R=g.seed??1,N=y*v,I=_(S,new t.Vector3),M=_(g.dir||[0,0,0],new t.Vector3);for(let F=0;F<B;F++){const P=At(R*131+F*17),D=P()*T,X=P()*2-1,E=Math.sqrt(1-X*X),J=new t.Vector3(Math.cos(D)*E,X*.7+.2,Math.sin(D)*E).multiplyScalar(A*(.4+.6*P())).add(M),Z=1-Math.exp(-N*4),$=(g.size??l)*(.4+1.3*P()*P());Ht(N,$,P(),(g.rise??r)*Y(0,.5,N),U);const O=q.copy(I).addScaledVector(J,Z).add(U),nt=Math.min(1,y*10)*(1-Y(.75+.2*P(),1,y));k.raw(O,$*(.5+.5*zt(Math.min(1,y*6))),N*14+F,.12,nt,P())}return k},ring(S,y,g={}){if(y<=0||y>=1)return k;const B=g.radius??.06,v=g.grow??3.5,A=g.rise??1.2,R=g.seconds??3,N=g.seed??1,I=_(g.axis||[0,1,0],new t.Vector3).normalize(),M=vt(y),F=B*(1+(v-1)*(.25*y+.75*M)),P=_(S,new t.Vector3).addScaledVector(I,A*(.15*y+.85*vt(y*.9+.1*y))),D=(g.tube??.32)*B*(1-.5*y)*Math.min(1,y*8),X=Y(.78,1,y);if(W<a&&X<1&&(w.setXYZW(W,P.x,P.y,P.z,F),C.setXYZW(W,I.x,I.y,I.z,D*(1-X)),b.setXYZW(W,y*R*2.2,(1-X)*Math.min(1,y*10),N,0),W++),X>0){const E=new t.Vector3().crossVectors(I,Math.abs(I.y)<.9?ut:new t.Vector3(1,0,0)).normalize(),J=new t.Vector3().crossVectors(I,E),Z=22;for(let $=0;$<Z;$++){const O=$/Z*T+j(N*3+$)*.2,nt=q.copy(P).addScaledVector(E,Math.cos(O)*F).addScaledVector(J,Math.sin(O)*F).addScaledVector(I,X*.1*F*(1+j($+N)));k.raw(nt,D*(.9+.8*j(N*5+$))*(1-.3*X),$,.1,1-Y(.8,1,X),j($))}}return k},trail(S,y,g={}){const B=g.spacing??.045,v=g.count??24,A=g.gap??.1,R=g.seconds??10,N=g.life??2.2,I=Qt(S,y),M=Math.floor((I-A)/B);for(let F=0;F<v;F++){const P=M-F,D=P*B;if(D<0)break;const X=Lt(S,D),E=(y-X)*R;if(E>N)break;const J=j((g.seed??1)*4099+P),Z=_(S(X),new t.Vector3);Z.x+=(J-.5)*B*1.2,Z.z+=(j(P*7+1)-.5)*B*1.2;const $=(g.size??l)*(.45+.9*J*J);k.single(Z,Math.max(0,E),{size:$,rise:g.rise??.16,seed:J,life:N,grow:.06})}return k},update(){s.instanceCount=V,i.instanceCount=W;for(const S of[u,c])S.needsUpdate=!0,S.clearUpdateRanges&&S.clearUpdateRanges(),S.addUpdateRange&&S.addUpdateRange(0,V*4);for(const S of[w,C,b])S.needsUpdate=!0},get count(){return V},dispose(){s.dispose(),h.dispose(),i.dispose(),f.dispose(),p.dispose()}};return k}function Ne(n,o={}){const e=_(o.from||[0,1.5,0],new t.Vector3),a=o.floor??0,l=o.size??.15,r=o.sway??1,s=o.drift??1,u=o.seed??1,c=o.land??.8;n=H(n);const z=At(u*211+5),h=z()*T,x=z()-.5,f=z()-.5,i=H(n/c),w=(i-.18)/.82,C=i<.18?.3*vt(i/.18):.3+.7*w*(1.18-.18*w),b=dt(e.y,a,H(C)),p=(1-Y(.75,1,i))*Math.min(1,i*6),m=.32*r*p*Math.sin(i*T*2.2+h),d=.18*r*p*Math.sin(i*T*1.5+h*1.7),V=new t.Vector3(e.x+s*l*(x*1.5*i+.35*Math.sin(i*T*1.1+h)*p),b,e.z+s*l*(f*1.5*i+.35*Math.cos(i*T*.9+h)*p)),W=H((n-c)/(1-c));let q=1,U=1,L=0;n>=c&&(q=1-.12*(Math.sin(Math.PI*Math.min(1,W/.35))*(1-Math.min(1,W/.35)*.3))*(W<.35?1:0),U=1/Math.sqrt(q),L=.12*r*Math.exp(-W*5)*Math.sin(W*T*2.2+h)*(1-W));const k=(o.turns??.25)*T*vt(i)+(z()-.5),S=new t.Quaternion().setFromEuler(new t.Euler(m,k,d,"YXZ"));S.slerp(new t.Quaternion().setFromAxisAngle(ut,k),Y(c*.82,c,n)),L&&S.multiply(new t.Quaternion().setFromEuler(new t.Euler(L,0,L*.6)));const y=n>=c?H(W/.75):-1;return{position:V,quaternion:S,sy:q,sxz:U,touch:n>=c?1:0,puff:y>=1?-1:y,puffAt:new t.Vector3(V.x,a,V.z),floor:a}}function Be(n,o,e,a={}){if(e<=0||e>=1)return;const l=_(o,new t.Vector3),r=a.size??.15,s=a.seed??1,u=a.colour||Kt,c=7,z=Gt(Math.min(1,e/.55)),h=Math.sin(Math.PI*Math.min(1,e*1.1))**.5*(1-.35*Y(.4,1,e));for(let x=0;x<c;x++){const f=x/c*T+j(s*17+x)*.6,i=r*(.35+.55*z)*(.85+.3*j(x+s*3)),w=r*(.08+.18*vt(Math.min(1,e/.5))*(.6+.4*j(x*5))),C=r*.32*h*(.75+.5*j(x*11+s));C>r*.02&&n.fx.blob(new t.Vector3(l.x+Math.cos(f)*i,l.y+w*.6,l.z+Math.sin(f)*i),C,u,s*10+x,5)}}function We(n,o={}){const e=o.amplitude??.03,a=o.period??3.2,l=o.tilt??.07,r=(o.seed??0)*13.7,s=n/a*T,u=e*(.75*Math.sin(s+r)+.25*Math.sin(s*2.3+r*1.3)),c=new t.Quaternion().setFromEuler(new t.Euler(l*Math.sin(s+.9+r),0,l*.8*Math.sin(s*.77+2.1+r)));return{y:u,quaternion:c}}function qe(n,o=1,{period:e=2.4,angle:a=.22}={}){const l=o*a*Math.sin(n/e*T);return[l,l]}function be(){const n=[],o=[],e=[],a=[],s=h=>.52-.58*Math.pow(h,1.05),u=h=>-.46+.36*Math.pow(h,1.6)+.03*Math.sin(Math.PI*Math.min(1,h/.3))*(h<.3?1:0);for(let h=0;h<=32;h++){const x=h/32*2-1,f=Math.abs(x);for(let i=0;i<=12;i++){const w=i/12,C=dt(u(f),s(f),w),p=.075*(1-Y(.12,.3,f))*Math.pow(Math.sin(Math.PI*H((C+.46)/.98)),.7)+.012*(1-f)*0;n.push(x*.62,p,C),o.push(x),e.push(0)}}for(let h=0;h<32;h++)for(let x=0;x<12;x++){const f=h*13+x,i=f+1,w=f+12+1,C=w+1;a.push(f,i,w,i,C,w)}let c=429;for(const h of[1,-1]){const x=[[.07*h,.03,.5],[.16*h,.015,.44],[.12*h,-.04,.66],[.07*h,-.02,.62]];for(const f of x)n.push(...f),o.push(.2*h),e.push(1);h>0?a.push(c,c+2,c+1,c,c+3,c+2):a.push(c,c+1,c+2,c,c+2,c+3),c+=4}{for(let x=0;x<=10;x++){const f=x/10,i=-.42-f*.55,w=.02*(1-f*.8);n.push(-w,.012,i,w,.012,i),o.push(0,0),e.push(2,2)}for(let x=0;x<10;x++){const f=c+x*2;a.push(f,f+1,f+2,f+1,f+3,f+2)}}const z=new t.BufferGeometry;return z.setAttribute("position",new t.Float32BufferAttribute(n,3)),z.setAttribute("aSpan",new t.Float32BufferAttribute(o,1)),z.setAttribute("aPart",new t.Float32BufferAttribute(e,1)),z.setIndex(a),z}const ye=`
${ot}
attribute float aSpan; attribute float aPart;
attribute vec3 aColour; attribute vec4 aMan;   // phase, swim amount, refold 0..1, seed
varying vec3 vWorld; varying vec3 vLocal; varying vec3 vColour; varying float vPart;
void main() {
  vec3 p = position;
  float a = abs(aSpan), r = aMan.z;
  // refold: 0 = the dart's narrow arrow with the wings swept back and down; 1 = the manta
  float k = clamp(r, 0.0, 1.2);
  p.x *= mix(0.42, 1.0, k);
  p.z -= (1.0 - min(k, 1.0)) * 0.42 * a;
  p.y -= (1.0 - min(k, 1.0)) * 0.22 * a;
  // the swim: the wings beat, a wave running from the leading edge back, growing to the tips
  float sw = aMan.y;
  p.y += sw * 0.26 * pow(a, 1.35) * sin(aMan.x + p.z * 2.6);
  p.y += sw * 0.03 * sin(aMan.x * 1.0 - 0.6) * (1.0 - a);   // the body heaves with it
  if (aPart > 1.5) { float v = clamp((-0.42 - p.z) / 0.75, 0.0, 1.0); p.x += sw * 0.05 * v * v * sin(aMan.x * 1.3 - v * 4.0); p.y += sw * 0.04 * v * sin(aMan.x - v * 3.0); }
  if (aPart > 0.5 && aPart < 1.5) p.y += 0.02 * sw * sin(aMan.x * 2.0 + aSpan * 3.0);
  vec4 wp = modelMatrix * instanceMatrix * vec4(p, 1.0);
  vWorld = wp.xyz; vLocal = position; vColour = aColour; vPart = aPart;
  gl_Position = projectionMatrix * viewMatrix * wp;
}`,xe=`
${ot}
${ct}
${It}
uniform vec3 uPaper;
varying vec3 vWorld; varying vec3 vLocal; varying vec3 vColour; varying float vPart;
void main() {
  vec3 V = normalize(cameraPosition - vWorld);
  vec3 N = facetNormal(vWorld, V);
  // paper on top, the colour underneath (as the plane); the head flaps coloured on both sides
  bool top = gl_FrontFacing;
  vec3 base = top ? uPaper : vColour;
  if (vPart > 0.5 && vPart < 1.5) base = mix(vColour, uPaper, 0.15);
  // a coloured band along the trailing edge on top, like the plane's tail stripe
  if (top && vPart < 0.5) {
    float aa = abs(vLocal.x) / 0.62;
    float te = -0.46 + 0.36 * pow(aa, 1.6);   // the trailing edge
    base = mix(base, vColour, smoothstep(0.045, 0.03, vLocal.z - te) * step(0.2, aa));
  }
  if (vPart > 1.5) base = mix(base, vColour, 0.85);
  float grain = fbm(vLocal * 36.0);
  base *= 0.97 + 0.05 * grain;
  vec3 col = lightPlayer(base, N, V, 1.0, 0.9, grain, 1.0);
  // the fold between body and wing reads as a soft crease
  float crease = 1.0 - smoothstep(0.0, 0.018, abs(abs(vLocal.x) - 0.11));
  col *= 1.0 - 0.07 * crease;
  col = haze(shoulder(col), length(cameraPosition - vWorld));
  gl_FragColor = linearToOutputTexel(vec4(col, 1.0));
}`;function Re(n,o={}){const e=o.count||1,a=o.colours||["#B8372C"],l=o.length||.6,r=be(),s=new t.InstancedBufferAttribute(new Float32Array(e*3),3),u=new t.InstancedBufferAttribute(new Float32Array(e*4),4);u.setUsage(t.DynamicDrawUsage),r.setAttribute("aColour",s),r.setAttribute("aMan",u),r.boundingSphere=new t.Sphere(new t.Vector3,1e5);const c=new t.ShaderMaterial({vertexShader:ye,fragmentShader:xe,uniforms:{...n.light,uPaper:{value:it(Wt)}},side:t.DoubleSide}),z=new t.InstancedMesh(r,c,e);z.instanceMatrix.setUsage(t.DynamicDrawUsage),z.frustumCulled=!1;const h=[];for(let p=0;p<e;p++){const m=it(a[p%a.length]);s.setXYZ(p,m.r,m.g,m.b),h.push({position:new t.Vector3,quaternion:new t.Quaternion,t:0,swim:1,period:2.8,refold:1,scale:1,visible:!0,shadow:o.shadow!==!1,shadowOpacity:o.shadowOpacity??.35,seed:j("manta"+p)})}const x=new t.Matrix4,f=new t.Vector3,i=new t.Matrix4().makeScale(0,0,0),w=new t.Vector3,C=new t.Vector3,b={object:z,count:e,length:l,get(p){return h[p]},set(p,m){const d=h[p];if(!d)return b;m.position&&_(m.position,d.position),m.quaternion&&ft(m.quaternion,d.quaternion);for(const V of["t","swim","period","refold","scale","visible","shadow","shadowOpacity"])m[V]!==void 0&&(d[V]=m[V]);return m.visible===void 0&&m.position&&(d.visible=!0),b},hideAll(){for(const p of h)p.visible=!1;return b},seat(p,m=new t.Vector3){const d=h[p],V=l*d.scale;return m.set(0,.07*V,.02*V).applyQuaternion(d.quaternion).add(d.position)},heave(p){const m=h[p];return m.swim*.03*l*m.scale*Math.sin(m.t/m.period*T-.6+.05)},update(p){for(let m=0;m<e;m++){const d=h[m];if(!d.visible){z.setMatrixAt(m,i);continue}const V=l*d.scale;if(x.compose(d.position,d.quaternion,f.set(V,V,V)),z.setMatrixAt(m,x),u.setXYZW(m,d.t/d.period*T+d.seed*6,d.swim,d.refold,d.seed),d.shadow&&d.shadowOpacity>0){const W=p.groundHeight(d.position.x,d.position.z),q=d.position.y-W;if(q<4){const U=.62*V*dt(.42,1,H(d.refold));w.set(U,0,0).applyQuaternion(d.quaternion),w.y=0,C.set(0,0,.5*V).applyQuaternion(d.quaternion),C.y=0,w.lengthSq()<1e-10&&w.set(U,0,0),C.lengthSq()<1e-10&&C.set(0,0,.5*V),p.shadows.cast(d.position,w.clone(),C.clone(),{opacity:d.shadowOpacity*(1-q/4),size:V,base:.05*V,shape:1,round:.6})}}}z.instanceMatrix.needsUpdate=!0,u.needsUpdate=!0},dispose(){r.dispose(),c.dispose()}};return b}function Ge(n){n=H(n);const o=Yt(H(n/.34),2.2),e=n>.12&&n<.36?.06*Math.sin(n*140)*Math.sin(Math.PI*(n-.12)/.24):0,a=.36,l={visible:n<a,scale:1-.12*Y(.2,a,n),wings:[-.5*o+e,-.5*o-e]},r=H((n-a)/.44),s={visible:n>=a,refold:r<=0?0:zt(r,2),swim:Y(.6,1,n),scale:.9+.1*zt(H((n-a)/.3))},u=n>.28&&n<.28+.5?(n-.28)/.5:-1;return{plane:l,manta:s,burst:u}}export{Qt as arcAt,We as bob,Pe as createBubbles,Ce as createJellies,Re as createMantas,Ve as createSchool,Fe as createWhale,Vt as jellyPulse,ae as jellySwim,Se as oceanLook,Ge as planeToManta,Be as sandPuff,Ot as shapes,Ne as sinkSettle,qe as swimWings,Lt as uAtArc,ke as whalePath};
