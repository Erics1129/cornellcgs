import*as o from"three";import{RoundedBoxGeometry as J}from"three/addons/geometries/RoundedBoxGeometry.js";import{GLSL_COMMON as ee,GLSL_FRAG as ve,lin as oe}from"../../kit/actors/core.js";import{contactShadows as Qe}from"../../kit/props/contact.js";import{landShape as Xe,STONE as ye}from"../../kit/props/stones.js";import{clamp as me,lerp as C,hash01 as Ye}from"../../kit/ease.js";const v=Object.freeze({shell:"#F2EDE4",plate:"#E4DCCF",joint:"#CFC7BA",foot:"#2F2A26",pad:"#B3A99B",band:"#B8372C",cable:"#4A423C",steel:"#B8B0A4",kaya:"#DDBD8C",slate:"#34312F",shellStone:"#ECE5D7"}),Ze=l=>l?l.isVector3?l.clone():new o.Vector3().fromArray(l):new o.Vector3,Je=l=>(l=(l+Math.PI)%(2*Math.PI),l<0&&(l+=2*Math.PI),l-Math.PI),Oe=`
${ee}
varying vec3 vWorld; varying vec3 vN; varying vec3 vLocal;
void main() {
  vec4 wp = modelMatrix * vec4(position, 1.0);
  mat3 m3 = mat3(modelMatrix);
  vec3 sc = vec3(dot(m3[0], m3[0]), dot(m3[1], m3[1]), dot(m3[2], m3[2]));
  vN = normalize(m3 * (normal / max(sc, vec3(1e-12))));
  vWorld = wp.xyz; vLocal = position;
  gl_Position = projectionMatrix * viewMatrix * wp;
}`,eo=`
${ee}
${ve}
uniform vec4 uTint;   // linear albedo, glow
uniform vec4 uMat;    // gloss, rim, occlusion, peel
uniform float uMetal; uniform float uUnder;
varying vec3 vWorld; varying vec3 vN; varying vec3 vLocal;
void main() {
  vec3 N = normalize(vN);
  vec3 V = normalize(cameraPosition - vWorld);
  if (dot(N, V) < -0.2) N = -N;
  vec3 base = uTint.rgb;
  // moulded plastic: a faint orange-peel and a hair of tone variation (only seen leaning in)
  float peel = uMat.w;
  if (peel > 0.0) {
    float n1 = vnoise(vLocal * 900.0), n2 = vnoise(vLocal * 140.0 + 3.1);
    base *= 1.0 + peel * (0.035 * (n1 - 0.5) + 0.03 * (n2 - 0.5));
  }
  float occl = uMat.z;
  vec3 col = lightPlayer(base, N, V, occl, 0.0, 0.5, uMat.y);
  vec3 H = normalize(uKeyDir + V);
  float sp = pow(max(dot(N, H), 0.0), mix(16.0, 34.0, uMetal)) * smoothstep(-0.05, 0.35, dot(N, uKeyDir));
  col += mix(uKeyTint, base * 1.6 + 0.08, uMetal) * sp * uMat.x * mix(0.16, 0.55, uMetal);
  // the sheet of light below: a broad glossy reflection on faces that look down at it
  float down = clamp(-N.y, 0.0, 1.0);
  float fres = pow(1.0 - clamp(dot(N, V), 0.0, 1.0), 3.0);
  col += uBounce * uBounceAmt * uUnder * (0.10 * down + 0.10 * fres * smoothstep(-0.2, 0.3, -N.y)) * mix(1.0, 0.5, uMetal);
  col += base * uShadeTint * uMetal * 0.12 * clamp(N.y, 0.0, 1.0);
  float glow = uTint.a;
  if (glow > 0.0) {
    float ndv = clamp(dot(N, V), 0.0, 1.0);
    vec3 hot = base * (1.0 + 0.5 * ndv) + vec3(1.0, 0.93, 0.8) * (0.04 + 0.14 * ndv * ndv) * glow;
    col = mix(col, hot, clamp(glow, 0.0, 1.0));
  }
  col = haze(shoulder(col), length(cameraPosition - vWorld));
  gl_FragColor = linearToOutputTexel(vec4(col, 1.0));
}`;function ge(l,c,{colour:s=v.shell,glow:a=0,gloss:p=.5,rim:f=1,occl:m=1,peel:u=1,metal:n=0,under:r=1}={}){const w=oe(s),y={...l.light,uTint:{value:new o.Vector4(w.r,w.g,w.b,a)},uMat:{value:new o.Vector4(p,f,m,u)},uMetal:{value:n},uUnder:{value:r}},z=new o.ShaderMaterial({vertexShader:Oe,fragmentShader:eo,uniforms:y}),A=new o.Mesh(c,z);return A.frustumCulled=!1,A.setTint=(G,x=y.uTint.value.w)=>{const I=oe(G);y.uTint.value.set(I.r,I.g,I.b,x)},A.setGlow=G=>{y.uTint.value.w=G},A}function te(l,c,s,{segments:a=48,dome:p=0,bottomRound:f=s}={}){const m=[new o.Vector2(0,0)],u=(n,r,w,y,z,A=6)=>{for(let G=0;G<=A;G++){const x=y+(z-y)*(G/A);m.push(new o.Vector2(n+w*Math.cos(x),r+w*Math.sin(x)))}};if(u(l-f,f,f,-Math.PI/2,0),u(l-s,c-s,s,0,Math.PI/2),p>0)for(let n=1;n<=8;n++){const r=(l-s)*(1-n/8);m.push(new o.Vector2(r,c+p*Math.sin(Math.PI/2*(n/8))))}else m.push(new o.Vector2(0,c));return new o.LatheGeometry(m,a)}function se(l,c,s){const a=te(l,c,Math.min(l,c)*s,{segments:40});return a.translate(0,-c/2,0),a.rotateZ(Math.PI/2),a}function oo(l){const c=new o.SphereGeometry(l,14,6,0,Math.PI*2,0,Math.PI/2);return c.scale(1,.5,1),c.rotateX(Math.PI/2),c}const _e=(l,c,s,a)=>{const p=new J(l,c,s,4,a);return p.translate(0,0,s/2),p};function fo(l,c={}){const s=c.L1||.3,a=c.L2||.29,p={base:.55,limb:.09,extent:0,...c.shadow||{}},f=.09,m=.004,u=.026,n=.058,r=.014,w=u+r+.062,y=.03,z=.013,A=y+z,G=.026,x=new o.Group;x.name="arm";const I=[],S=[],d=(e,t)=>{S.push(e);const h=ge(l,e,t);return I.push(h),h},ae=d(te(f*.985,m+.002,.0018,{segments:56}),{colour:v.foot,gloss:.15,rim:.4,peel:.6});x.add(ae);const q=d(te(f,u-m,.009,{dome:.003,bottomRound:.002,segments:64}),{colour:v.shell,gloss:.45});q.position.y=m,x.add(q);const H=new o.TorusGeometry(.067,9e-4,6,72);H.rotateX(Math.PI/2);const k=d(H,{colour:"#8E857A",gloss:.1,rim:.2,peel:0});k.position.y=u+9e-4,x.add(k);const U=oo(.0036),D=new o.BoxGeometry(.0052,9e-4,.0011);S.push(D);const N={colour:v.steel,gloss:.9,metal:1,rim:.5,peel:0},g={colour:"#2A2622",gloss:0,rim:0,peel:0,under:0},i=(e,t,h,P,b,L)=>{const W=ge(l,U,N);I.push(W);const V=ge(l,D,g);I.push(V);const O=new o.Group;O.position.set(t,h,P),b==="y"?O.rotation.x=-Math.PI/2:b==="x"&&(O.rotation.y=Math.PI/2*Math.sign(t||1)),W.rotation.z=L,V.rotation.z=L,V.position.z=.0017,O.add(W,V),e.add(O)};S.push(U);for(let e=0;e<4;e++){const t=Math.PI/4+e*Math.PI/2;i(x,Math.sin(t)*.078,u+2e-4,Math.cos(t)*.078,"y",e*1.1+.3)}{const e=[[0,.012,-.07],[.001,.0062,-.094],[.004,.0045,-.11],[.008,.0118,-.126],[.012,.0118,-.168],[.014,-.004,-.19],[.015,-.16,-.198]],t=new o.CatmullRomCurve3(e.map(P=>new o.Vector3(...P))),h=new o.TubeGeometry(t,40,.0042,8);x.add(d(h,{colour:v.cable,gloss:.5,rim:.6,peel:.3}))}const M=d(new o.SphereGeometry(.0046,16,8,0,Math.PI*2,0,Math.PI/2),{colour:"#E9A24A",glow:0,gloss:1,rim:.4,peel:0});M.position.set(.024,u+8e-4,.073),M.scale.set(1,.55,1),x.add(M);const $=new o.TorusGeometry(.0052,.0011,6,24);$.rotateX(Math.PI/2);const Q=d($,{colour:"#4A433D",gloss:.3,rim:.3,peel:0});Q.position.copy(M.position),x.add(Q);const xe=(()=>{const e=document.createElement("canvas");e.width=128,e.height=64;const t=e.getContext("2d");t.fillStyle="rgba(70,62,54,0.9)",t.font="700 38px Figtree, system-ui, sans-serif",t.textAlign="center",t.textBaseline="middle",t.fillText("VAC",64,34);const h=new o.CanvasTexture(e);return h.colorSpace=o.SRGBColorSpace,h.anisotropy=4,h})(),Me=new o.MeshBasicMaterial({map:xe,transparent:!0,depthWrite:!1,toneMapped:!1,opacity:.85}),be=new o.PlaneGeometry(.016,.008);S.push(be);const re=new o.Mesh(be,Me);re.rotation.x=-Math.PI/2,re.position.set(.0055,u+5e-4,.073),re.frustumCulled=!1,x.add(re);const _=new o.Group;x.add(_);const Se=d(te(n,r,.004,{segments:56}),{colour:v.joint,gloss:.4});Se.position.y=u,_.add(Se);const Ve=d(new o.TorusGeometry(n+5e-4,.0016,8,64).rotateX(Math.PI/2),{colour:v.band,gloss:.45,peel:.4});Ve.position.y=u+.0035,_.add(Ve);const ze=new J(.02,.094,.088,4,.009);for(const e of[-1,1]){const t=d(ze,{colour:v.shell,gloss:.5});S.pop(),t.position.set(e*.048,u+r+.044,0),_.add(t),i(_,e*.0582,u+r+.018,.026,"x",.4+e),i(_,e*.0582,u+r+.018,-.026,"x",1.7-e)}S.push(ze);const T=new o.Group;T.position.y=w,_.add(T),T.add(d(se(.036,.076,.3),{colour:v.joint,gloss:.35}));for(const e of[-1,1]){const t=d(se(.024,.006,.4),{colour:v.band,gloss:.5,peel:.5});t.position.x=e*.0612,T.add(t)}const Fe=d(_e(.064,.056,s,.024),{colour:v.shell,gloss:.5});T.add(Fe);const Ge=new J(.003,.034,s-.12,2,.0012);for(const e of[-1,1]){const t=d(Ge,{colour:v.plate,gloss:.4});S.pop(),t.position.set(e*.0326,0,s/2),T.add(t),i(T,e*.0342,0,.072,"x",.2*e+.9),i(T,e*.0342,0,s-.072,"x",2.1-e)}S.push(Ge);const Ne=(e,t,h,P,b)=>{const L=new o.CatmullRomCurve3([new o.Vector3(.006,P-.004,t),new o.Vector3(.004,P+b*.6,C(t,h,.3)),new o.Vector3(.003,P+b,C(t,h,.65)),new o.Vector3(.004,P-.002,h)]);e.add(d(new o.TubeGeometry(L,24,.0036,8),{colour:v.cable,gloss:.55,rim:.6,peel:.3}))};Ne(T,.03,s-.03,.0315,.005);const fe=new J(.022,.012,.01,2,.0035);for(const e of[.11,.2]){const t=d(fe,{colour:v.joint,gloss:.4});S.pop(),t.position.set(.004,.032,e),T.add(t)}const B=new o.Group;B.position.z=s,T.add(B),B.add(d(se(.034,.07,.32),{colour:v.joint,gloss:.35}));for(const e of[-1,1]){const t=d(se(.021,.004,.4),{colour:v.shell,gloss:.5});t.position.x=e*.037,B.add(t),i(B,e*.0392,0,0,"x",.7+e)}const E=d(_e(.052,.046,a,.02),{colour:v.shell,gloss:.5});B.add(E);const Pe=new J(.0026,.027,a-.11,2,.001);for(const e of[-1,1]){const t=d(Pe,{colour:v.plate,gloss:.4});S.pop(),t.position.set(e*.0266,0,a/2),E.add(t),i(E,e*.028,0,.064,"x",1.3*e),i(E,e*.028,0,a-.064,"x",.5-e)}S.push(Pe),Ne(E,.02,a-.03,.0265,.004);{const e=d(fe,{colour:v.joint,gloss:.4});S.pop(),e.position.set(.004,.027,a*.5),e.scale.set(.9,.9,1),E.add(e)}S.push(fe);const R=new o.Group;R.position.z=a,B.add(R),R.add(d(se(.026,.056,.34),{colour:v.joint,gloss:.35}));const X=new o.Group;R.add(X);const Ae=te(.0165,y,.006,{segments:32});Ae.rotateX(Math.PI/2),X.add(d(Ae,{colour:v.shell,gloss:.55}));const Te=d(new o.TorusGeometry(.0168,.0014,6,32),{colour:v.band,gloss:.4,peel:.3});Te.position.z=y*.55,X.add(Te);const j=new o.Group;j.position.z=A,X.add(j);const De=(()=>{const e=[new o.Vector2(0,0)],t=10,h=.0045;for(let b=0;b<=t;b++){const L=b/t*(Math.PI/2);e.push(new o.Vector2(G-h+h*Math.sin(L),h-h*Math.cos(L)))}e.push(new o.Vector2(.015,z),new o.Vector2(0,z));const P=new o.LatheGeometry(e.reverse(),40);return P.rotateX(-Math.PI/2),P})(),le=d(De,{colour:v.pad,gloss:.25,rim:.6,peel:.2});j.add(le);const Ee=new o.CircleGeometry(G-.0042,40),Le=d(Ee,{colour:"#9E9486",gloss:.15,rim:.3,peel:.4});Le.position.z=4e-4,le.add(Le);const Re=new o.RingGeometry(.0026,.0047,24),Ie=d(Re,{colour:"#3B3530",gloss:.1,rim:0,peel:0,under:0});Ie.position.z=8e-4,le.add(Ie);const F={yaw:0,r:.3,y:.15,phi:-Math.PI/2+.2,roll:0,press:0,stretch:1};let ie=0;const Ce=new o.Matrix4,K=new o.Vector3;function Y(e){_.rotation.y=e.yaw;const t=me(e.press||0),h=A-.3*z*t,P=Math.cos(e.phi),b=Math.sin(e.phi);let L=e.r-h*P,W=e.y-h*b-w,V=Math.hypot(L,W);const O=(s+a)*.998,Z=Math.abs(s-a)+.06;V>O&&(L*=O/V,W*=O/V,V=O),V<Z&&(V<1e-6?(L=Z,W=0):(L*=Z/V,W*=Z/V),V=Z);const qe=Math.atan2(W,L),He=Math.acos(me((s*s+V*V-a*a)/(2*s*V),-1,1)),ue=qe+He,Ue=s*Math.cos(ue),$e=s*Math.sin(ue),We=Math.atan2(W-$e,L-Ue);T.rotation.x=-ue,B.rotation.x=-(We-ue);const de=e.stretch||1;E.scale.set(1/Math.sqrt(de),1/Math.sqrt(de),de),R.position.z=a*de,R.rotation.x=-(e.phi-We),X.rotation.z=e.roll||0,j.position.z=h,le.scale.set(1+.14*t,1+.14*t,1-.3*t),x.updateMatrixWorld(!0)}function ke(e){return x.updateMatrixWorld(!0),Ce.copy(x.matrixWorld).invert(),K.copy(Ze(e)).applyMatrix4(Ce),{yaw:Math.atan2(K.x,K.z),r:Math.hypot(K.x,K.z),y:K.y}}const je=(e,t,h)=>({yaw:e.yaw+Je(t.yaw-e.yaw)*h,r:C(e.r,t.r,h),y:C(e.y,t.y,h),phi:C(e.phi,t.phi,h),roll:C(e.roll||0,t.roll||0,h),press:C(e.press||0,t.press||0,h),stretch:C(e.stretch||1,t.stretch||1,h)}),ce=new o.Vector3,pe=new o.Vector3,he=new o.Vector3,Ke=new o.Vector3;function Be(e,t,h,P){const b=e.matrixWorld.elements;pe.set(b[0],b[1],b[2]).normalize().multiplyScalar(h),he.set(b[8],b[9],b[10]).normalize().multiplyScalar(t/2+h*.6),ce.set(0,0,t/2).applyMatrix4(e.matrixWorld),l.shadows.cast(ce,pe,he,{opacity:P,round:1,size:t})}const we={object:x,L1:s,L2:a,HS:w,LT:A,BASE_R:f,BASE_H:u,set(e){return Object.assign(F,e),we},get pose(){return{...F}},mixPose:je,local:ke,padMatrix(e=F,t=new o.Matrix4){return Y(e),t.copy(j.matrixWorld),Y(F),t},setVac(e){return ie=me(e),we},joints(){return Y(F),[x,T,B,R,j].map((e,t)=>t===0?Ke.set(0,u,0).applyMatrix4(e.matrixWorld).clone():new o.Vector3().setFromMatrixPosition(e.matrixWorld))},setStyle(){},update(e){Y(F),M.setGlow(ie*1.1),M.setTint(ie>.02?"#F3B04E":"#A9773C",ie*1.1);const t=x.matrixWorld.elements;pe.set(t[0],t[1],t[2]).normalize().multiplyScalar(f*1.02),he.set(t[8],t[9],t[10]).normalize().multiplyScalar(f*1.02),ce.setFromMatrixPosition(x.matrixWorld),e.shadows.cast(ce,pe,he,{opacity:p.base,round:1,size:2*f,core:[.97,.97],extent:p.extent}),Be(T,s,.032,p.limb),Be(B,a*(F.stretch||1),.026,p.limb*.9)},dispose(){for(const e of I)e.material.dispose();for(const e of S)e.dispose();for(const e of I)S.includes(e.geometry)||e.geometry.dispose();xe.dispose(),Me.dispose()}};return Y(F),we}const to=Oe,so=`
${ee}
${ve}
uniform vec3 uWood; uniform float uSeed; uniform float uInner;
varying vec3 vWorld; varying vec3 vN; varying vec3 vLocal;
void main() {
  vec3 N = normalize(vN);
  vec3 V = normalize(cameraPosition - vWorld);
  if (dot(N, V) < -0.2) N = -N;
  // kaya turned across the grain: growth lines as long flat arcs, a few darker bands, fine pores
  vec3 p = vLocal * 90.0;
  float w = vnoise(vec3(p.x * 0.35, p.y * 0.8, p.z * 0.35) + uSeed) * 1.4;
  float ring = fract((p.y * 0.55 + (p.x * p.x + p.z * p.z) * 0.0016 * 90.0 + w) * 0.9);
  float line = smoothstep(0.0, 0.08, ring) * smoothstep(0.34, 0.1, ring);
  float band = vnoise(vec3(0.0, p.y * 0.22, 0.0) + uSeed * 3.0);
  vec3 base = uWood * (0.9 + 0.14 * band) * (1.0 - 0.26 * line);
  base = mix(base, base * vec3(0.86, 0.8, 0.74), 0.35 * smoothstep(0.55, 0.85, vnoise(vec3(p.x * 0.2, p.y * 1.3, p.z * 0.2) + uSeed)));
  base *= 0.96 + 0.06 * vnoise(vLocal * 2600.0);
  // the inside, out of the light, a touch deeper and warmer
  vec2 rp = vLocal.xz; float rl = length(rp);
  float inside = rl > 1e-4 ? smoothstep(0.05, -0.35, dot(normalize(N.xz + 1e-6), rp / rl)) * smoothstep(0.004, 0.012, vLocal.y) : 1.0;
  inside *= 1.0 - uInner;
  base *= mix(1.0, 0.86, inside);
  vec3 col = lightPlayer(base, N, V, mix(1.0, 0.82, inside), 0.0, 0.5, 0.8);
  // a satin oil finish: a soft broad sheen of the lamp, and the table's light on the lower belly
  vec3 H = normalize(uKeyDir + V);
  col += uKeyTint * pow(max(dot(N, H), 0.0), 22.0) * 0.12 * smoothstep(-0.05, 0.35, dot(N, uKeyDir));
  float fres = pow(1.0 - clamp(dot(N, V), 0.0, 1.0), 3.0);
  col += uBounce * uBounceAmt * (0.03 * clamp(-N.y, 0.0, 1.0) + 0.03 * fres) * (1.0 - inside);
  col = haze(shoulder(col), length(cameraPosition - vWorld));
  gl_FragColor = linearToOutputTexel(vec4(col, 1.0));
}`,ne={r:.074,h:.043,inner:.061,floor:.011};function no(){const{r:l,h:c,inner:s,floor:a}=ne,p=[];p.push([0,5e-4],[.043,5e-4],[.0465,.0014],[.048,.0038]);for(let n=0;n<=12;n++){const r=n/12;p.push([C(.0495,l,Math.sin(r*Math.PI/2)),C(.0048,c*.62,r)])}for(let n=1;n<=5;n++){const r=n/5;p.push([l-.003*r*r,C(c*.62,c-.003,r)])}const f=(l-.003+s)/2,m=(l-.003-s)/2;for(let n=1;n<=9;n++){const r=n/10*Math.PI;p.push([f+m*Math.cos(r),c-.003+m*Math.sin(r)])}for(let n=0;n<=14;n++){const r=s*(1-n/14);p.push([r,ao(r)])}const u=new o.LatheGeometry(p.map(([n,r])=>new o.Vector2(Math.max(0,n),r)),72);return u.computeVertexNormals(),u}function ao(l){const{inner:c,floor:s,h:a}=ne,p=me(l/c);return s+(a-.003-s)*Math.pow(p,2.1)}function wo(l,c){const s=no(),a=new o.Group;a.name="bowls";const p=c.map((n,r)=>{const w=new o.ShaderMaterial({vertexShader:to,fragmentShader:so,uniforms:{...l.light,uWood:{value:oe(v.kaya)},uSeed:{value:r*7.3+1.1},uInner:{value:0}}});w.onBeforeCompile=()=>{};const y=new o.Mesh(s,w);return y.frustumCulled=!1,y.position.set(...n),a.add(y),{mesh:y,at:new o.Vector3(...n),tick:0,jitter:0,seed:r}}),f=new o.Vector3,m=new o.Vector3,u=new o.Vector3;return{object:a,bowls:p,set(n,{tick:r=0,hover:w=0}={}){p[n].tick=r,p[n].hover=w},setStyle(){},update(n){for(const r of p){const w=r.tick||0,y=1+.03*w;r.mesh.scale.set(1/Math.sqrt(y),y,1/Math.sqrt(y)),r.mesh.position.y=r.at.y+.0012*Math.max(0,w),f.copy(r.at),f.y+=.02,m.set(ne.r*1.02,0,0),u.set(0,0,ne.r*1.02),n.shadows.cast(f,m,u,{opacity:.5,round:1,size:2*ne.r,core:[.92,.92]})}},dispose(){s.dispose();for(const n of p)n.mesh.material.dispose()}}}function ro(){const c=ye.thickness/2,s=[],a=24;for(let m=0;m<=a;m++){const u=Math.PI/2-m/a*Math.PI,n=Math.cos(u),r=Math.sin(u),w=.5*Math.sign(n)*Math.abs(n)**.78,y=c*Math.sign(r)*Math.abs(r)**1.12;s.push(new o.Vector2(Math.max(0,w),y+c))}s[0].x=0,s[a].x=0;const p=new o.LatheGeometry(s.reverse(),56);p.computeVertexNormals();const f=new o.InstancedBufferGeometry;for(const m of["position","normal","uv"])f.setAttribute(m,p.getAttribute(m));return f.setIndex(p.getIndex()),p.dispose(),f}const lo=`
${ee}
attribute vec4 aStone;    // white, seed, glint (hover), height of the foot above the glass (m)
varying vec3 vWorld; varying vec3 vN; varying vec3 vLocal; varying vec4 vStone;
void main() {
  mat4 m = modelMatrix * instanceMatrix;
  vec4 wp = m * vec4(position, 1.0);
  mat3 m3 = mat3(m);
  vec3 sc = vec3(dot(m3[0], m3[0]), dot(m3[1], m3[1]), dot(m3[2], m3[2]));
  vN = normalize(m3 * (normal / max(sc, vec3(1e-12))));
  vLocal = position; vStone = aStone; vWorld = wp.xyz;
  gl_Position = projectionMatrix * viewMatrix * wp;
}`,io=`
${ee}
${ve}
uniform vec3 uSlate; uniform vec3 uShell; uniform float uGlass;
varying vec3 vWorld; varying vec3 vN; varying vec3 vLocal; varying vec4 vStone;
void main() {
  float white = vStone.x;
  vec3 base = mix(uSlate, uShell, white);
  // shell: fine growth lines across the stone; slate: a faint mottle and a few pale specks
  float lines = sin((vLocal.x + vLocal.z * 0.2 + 0.03 * sin(vLocal.z * 9.0 + vStone.y * 20.0)) * 120.0 + vStone.y * 40.0);
  float mott = fbm(vLocal * 7.0 + vStone.y * 13.0);
  base *= mix(1.0 + 0.03 * (mott - 0.5) + 0.05 * step(0.985, vnoise(vLocal * 90.0 + vStone.y * 31.0)), 1.0 - 0.022 * smoothstep(0.3, 1.0, lines), white);
  vec3 N = normalize(vN);
  vec3 V = normalize(cameraPosition - vWorld);
  float yl = vLocal.y / ${ye.thickness.toFixed(3)};
  float occl = mix(0.84, 1.0, smoothstep(0.0, 0.25, yl));
  vec3 col = lightPlayer(base, N, V, occl, 0.0, 0.5, 1.0);
  vec3 H = normalize(uKeyDir + V);
  float sp = pow(max(dot(N, H), 0.0), mix(18.0, 30.0, white)) * smoothstep(-0.1, 0.4, dot(N, uKeyDir));
  col += uKeyTint * sp * mix(0.2, 0.16, white);
  // the shell's shoulder turns away from the lamp before the glass below can reach it: a soft darker ring
  float shoulderK = smoothstep(0.15, 0.45, N.y) * smoothstep(0.85, 0.5, N.y);
  col *= 1.0 - white * 0.11 * shoulderK;
  // the glass below, how near (light falls off fast as a stone is lifted)
  float shadeK = clamp(-vStone.z, 0.0, 1.0);
  float near = uGlass * exp(-vStone.w * 28.0) * (1.0 - shadeK);
  vec3 sheet = uBounce * uBounceAmt;
  // shell lit from below: light comes through the thin rim and the lower bevel (translucent edge glow)
  float edge = pow(1.0 - abs(N.y), 2.2);
  float low = smoothstep(0.75, 0.0, yl);
  col += white * sheet * near * (0.34 * edge * (0.5 + 0.5 * low) + 0.1 * low);
  // slate mirrors the bright glass along its lower bevel: a thin line of light that outlines the silhouette
  float fres = pow(1.0 - clamp(dot(N, V), 0.0, 1.0), 4.0);
  col += (1.0 - white) * sheet * near * fres * smoothstep(0.1, -0.6, N.y) * 0.55;
  col += uShadeTint * mix(0.05, 0.0, white) * clamp(N.y, 0.0, 1.0);
  // a hovered stone catches a little more of the lamp
  col += uKeyTint * max(vStone.z, 0.0) * 0.08 * (0.4 + 0.6 * clamp(N.y, 0.0, 1.0));
  // down in a bowl the wood keeps the table's light off them: darker the deeper they lie
  col *= 1.0 - 0.42 * shadeK * (0.6 + 0.4 * (1.0 - clamp(N.y, 0.0, 1.0)));
  col = haze(shoulder(col), length(cameraPosition - vWorld));
  gl_FragColor = linearToOutputTexel(vec4(col, 1.0));
}`;function vo(l,c={}){const s=c.count||1,a=c.diameter||.046,p=c.glass??.806,f=ro(),m=new o.InstancedBufferAttribute(new Float32Array(s*4),4);m.setUsage(o.DynamicDrawUsage),f.setAttribute("aStone",m),f.boundingSphere=new o.Sphere(new o.Vector3,1e5);const u=new o.ShaderMaterial({vertexShader:lo,fragmentShader:io,uniforms:{...l.light,uSlate:{value:oe(v.slate)},uShell:{value:oe(v.shellStone)},uGlass:{value:1}}}),n=new o.InstancedMesh(f,u,s);n.instanceMatrix.setUsage(o.DynamicDrawUsage),n.frustumCulled=!1;const r=Qe(l);r.reserve(s*3);const w=[];for(let N=0;N<s;N++)w.push({position:new o.Vector3,quaternion:new o.Quaternion,white:0,land:1,height:1.6,floor:void 0,visible:!1,shadowOpacity:1,ring:!0,ringColour:null,glint:0,shade:0,seed:Ye("desk-stone"+N)});const y=new o.Matrix4,z=new o.Quaternion,A=new o.Quaternion,G=new o.Vector3,x=new o.Vector3,I=new o.Vector3,S=new o.Matrix4().makeScale(0,0,0),d=new o.Vector3,ae=new o.Vector3,q=new o.Vector3,H=new o.Vector3,k=new o.Vector3(0,1,0),U=new o.Color,D={object:n,count:s,diameter:a,get(N){return w[N]},set(N,g){const i=w[N];if(!i)return D;g.position&&(Array.isArray(g.position)?i.position.fromArray(g.position):i.position.copy(g.position)),g.quaternion&&(Array.isArray(g.quaternion)?i.quaternion.fromArray(g.quaternion):i.quaternion.copy(g.quaternion)),g.colour!==void 0&&(i.white=g.colour==="white"||g.colour===1?1:0);for(const M of["land","height","visible","shadowOpacity","ring","ringColour","glint","shade"])g[M]!==void 0&&(i[M]=g[M]);return"floor"in g&&(i.floor=g.floor),D},hideAll(){for(const N of w)N.visible=!1,N.glint=0,N.shade=0;return D},setStyle(){},update(N){for(let g=0;g<s;g++){const i=w[g];if(!i.visible||i.land<=0){n.setMatrixAt(g,S);continue}const M=Xe(i.land,{height:i.height}),$=i.seed*Math.PI*2;if(I.set(Math.cos($),0,Math.sin($)),A.setFromAxisAngle(I,M.tilt),z.copy(A).multiply(i.quaternion),G.copy(i.position).addScaledVector(k.set(0,1,0),M.y*a),y.compose(G,z,x.set(a*M.sxz,a*M.sy,a*M.sxz)),n.setMatrixAt(g,y),m.setXYZW(g,i.white,i.seed,i.shade>0?-i.shade:i.glint,Math.max(0,G.y-p)),i.shadowOpacity>0){const Q=ye.thickness*a*M.sy;H.copy(G).addScaledVector(k.set(0,1,0).applyQuaternion(z),Q/2),d.set(a*M.sxz*.5,0,0).applyQuaternion(z),ae.set(0,0,a*M.sxz*.5).applyQuaternion(z),q.set(0,Q/2,0).applyQuaternion(z),r.cast(H,d,ae,q,{floor:i.floor??p,size:a,opacity:i.shadowOpacity,round:a*.5*M.sxz,lift:a*.003})}i.ring&&M.ring>0&&M.ring<1&&(U.set(i.ringColour||"#FFE7C2"),N.fx.ring(i.position,k.set(0,1,0),.4+.58*M.ring,{width:a*1.5,colour:U,dashes:0,seed:g+1}))}m.needsUpdate=!0,n.instanceMatrix.needsUpdate=!0},dispose(){f.dispose(),u.dispose()}};return D}export{ne as BOWL,v as COLOURS,ao as bowlFloor,fo as createArm,wo as createBowls,vo as createDeskStones};
