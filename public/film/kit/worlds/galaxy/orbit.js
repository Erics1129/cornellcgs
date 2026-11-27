import*as e from"three";import{BASE as Dt,loadTexture as C,GLSL_FINISH as Lt,FULL_VERT as jt,fullScreenTriangle as Ut,noseQuat as _t,bvToRGB as Kt}from"./common.js";import{orbitShot as Wt}from"./shots/orbit.js";const d=Math.PI/180,h={R:6371,h:400,lat:32.6,lon:-66,heading:100,sunAzimuth:-56,track:8},N={lon0:-108,lon1:-9,lat0:18,lat1:63},Yt=[[0,-1.5],[.16,-.75],[.3,.42],[.38,3.6],[.5,18],[.62,29],[.8,38],[1,44]],Qt=Xt(Yt);function Q(a){return Qt(a<=0?0:a>=1?1:a)}function Xt(a){const r=a.length,i=[],u=[];for(let l=0;l<r-1;l++)i.push((a[l+1][1]-a[l][1])/(a[l+1][0]-a[l][0]));u.push(i[0]);for(let l=1;l<r-1;l++)u.push(i[l-1]*i[l]<=0?0:(i[l-1]+i[l])/2);u.push(i[r-2]);for(let l=0;l<r-1;l++){if(i[l]===0){u[l]=0,u[l+1]=0;continue}const p=u[l]/i[l],f=u[l+1]/i[l],n=p*p+f*f;if(n>9){const M=3/Math.sqrt(n);u[l]=M*p*i[l],u[l+1]=M*f*i[l]}}return l=>{let p=0;for(;p<r-2&&l>a[p+1][0];)p++;const f=a[p+1][0]-a[p][0],n=(l-a[p][0])/f,M=n*n,w=M*n;return(2*w-3*M+1)*a[p][1]+(w-2*M+n)*f*u[p]+(-2*w+3*M)*a[p+1][1]+(w-M)*f*u[p+1]}}function wt(a,r,i){const u=Math.sqrt(a+r);if(i>=0)return u/(u*i+1)*Math.exp(-r);const l=Math.sqrt(Math.max(0,1-i*i))*(a+r);return 2*Math.sqrt(l)*Math.exp(a-l)-u/(1-u*i)*Math.exp(-r)}const Zt=[.005802,.013558,.0331],Jt=.00444,$t=[.0195,.056,.0026];function lt(a,r){const i=r.lat*d,u=r.lon*d,l=r.heading*d,p=new e.Vector3(Math.cos(i)*Math.cos(u),Math.cos(i)*Math.sin(u),Math.sin(i)),f=new e.Vector3(-Math.sin(u),Math.cos(u),0),M=new e.Vector3(-Math.sin(i)*Math.cos(u),-Math.sin(i)*Math.sin(u),Math.cos(i)).clone().multiplyScalar(Math.cos(l)).addScaledVector(f,Math.sin(l)),w=p.clone().multiplyScalar(Math.cos(a)).addScaledVector(M,Math.sin(a)),z=M.clone().multiplyScalar(Math.cos(a)).addScaledVector(p,-Math.sin(a)),P=z.clone().cross(w).normalize();return{m:new e.Matrix3().set(P.x,w.x,-z.x,P.y,w.y,-z.y,P.z,w.z,-z.z),U:w,F:z,R:P}}const F=a=>Math.acos(h.R/(h.R+a))/d;function nt(a,r){const i=(a-r)*d,u=h.sunAzimuth*d;return new e.Vector3(Math.sin(u)*Math.cos(i),Math.sin(i),-Math.cos(u)*Math.cos(i))}async function re(a,r,{quality:i}){let u=i==="low"?10:22;const l=Ut();let p=null,f=null;try{p=await import("./sky.js")}catch{p=null}if(p&&p.createSky)try{f=await p.createSky(a,r,{brightness:.3,stars:0})}catch(t){console.warn("galaxy orbit: no Milky Way",t),f=null}const n={uInvProj:{value:new e.Matrix4},uCamRot:{value:new e.Matrix3},uToEcef:{value:new e.Matrix3},uSun:{value:new e.Vector3(0,0,-1)},uSunCam:{value:new e.Vector3},uSunVis:{value:0},uDay:{value:null},uNight:{value:null},uCloud:{value:null},uDayHi:{value:null},uNightHi:{value:null},uCloudHi:{value:null},uHasLo:{value:0},uHasHi:{value:0},uRegion:{value:new e.Vector4(N.lon0*d,N.lat0*d,(N.lon1-N.lon0)*d,(N.lat1-N.lat0)*d)},uCloudTexel:{value:new e.Vector2(1/1024,1/512)},uExposure:{value:1},uSteps:{value:u},uPx:{value:6e-4},uRH:{value:h.R+h.h},uDip:{value:F(h.h)*d},uStreak:{value:0},...f?f.uniforms:{}},M=new e.RawShaderMaterial({glslVersion:e.GLSL3,vertexShader:jt,fragmentShader:te.replace("/*SKY*/",f?`#define HAS_SKY 1
`+p.SKY_GLSL:""),uniforms:n,depthTest:!1,depthWrite:!1,blending:e.NoBlending}),w=new e.Mesh(l,M);w.frustumCulled=!1;const z=new e.Scene;z.add(w);const P=new e.OrthographicCamera(-1,1,1,-1,0,1),_=await(await fetch(await r.asset(Dt+"bsc5-all.json"))).json(),K=_.length,W=new Float32Array(K*3),st=new Float32Array(K*3),rt=new Float32Array(K);for(let t=0;t<K;t++){const[o,c,s,v]=_[t],g=o*d,m=c*d;W[t*3]=Math.cos(m)*Math.cos(g),W[t*3+1]=Math.cos(m)*Math.sin(g),W[t*3+2]=Math.sin(m);const b=Kt(v);st.set(b,t*3),rt[t]=s}const O=new e.BufferGeometry;O.setAttribute("position",new e.BufferAttribute(W,3)),O.setAttribute("color",new e.BufferAttribute(st,3)),O.setAttribute("mag",new e.BufferAttribute(rt,1));const T={uEciToStage:{value:new e.Matrix3},uView:{value:new e.Matrix3},uProj:{value:new e.Matrix4},uDpr:{value:1},uScale:{value:1},uGain:{value:1},uSun:n.uSun,uRH:n.uRH},ct=new e.RawShaderMaterial({glslVersion:e.GLSL3,vertexShader:ee,fragmentShader:oe,uniforms:T,depthTest:!1,depthWrite:!1,transparent:!0,blending:e.CustomBlending,blendEquation:e.AddEquation,blendSrc:e.OneFactor,blendDst:e.OneFactor,blendSrcAlpha:e.ZeroFactor,blendDstAlpha:e.OneFactor}),it=new e.Points(O,ct);it.frustumCulled=!1;const ut=new e.Scene;ut.add(it);const X={lat:h.lat,lon:h.lon,heading:h.heading};let B={...X},I=0,Z=null,G=lt(0,B),ht=1,S=h.h,D=F(S),dt=Q(0),mt=new e.Matrix3;function ft(){const t=lt(0,B),o=nt(Q(0),F(h.h)).applyMatrix3(t.m),c=Math.asin(Math.max(-1,Math.min(1,o.z))),s=23.44*d,v=Math.PI-Math.asin(Math.max(-1,Math.min(1,Math.sin(c)/Math.sin(s)))),m=Math.atan2(Math.cos(s)*Math.sin(v),Math.cos(v))-Math.atan2(o.y,o.x);mt=new e.Matrix3().set(Math.cos(m),Math.sin(m),0,-Math.sin(m),Math.cos(m),0,0,0,1)}ft();const V={dir:[0,0,-1],color:[1,1,1],ambient:[.32,.4,.62],haze:null},J=(t,o,c=0)=>{const s=t*d,v=o*d,m=new e.Vector3(Math.cos(s)*Math.cos(v),Math.cos(s)*Math.sin(v),Math.sin(s)).clone().applyMatrix3(G.m.clone().transpose());return{p:m.clone().multiplyScalar(h.R+c).add(new e.Vector3(0,-(h.R+S),0)),up:m}},pt={get centre(){return new e.Vector3(0,-(h.R+S),0)},radius:h.R,km:1e3,get altitude(){return S},dirAt(t,o){return J(t,o).p.normalize()},at(t,o,c=0){const{p:s,up:v}=J(t,o,c),g=s.length(),m=s.clone().divideScalar(g);return{p:s,up:v,dir:m,km:g,visible:v.dot(m)<0}},lookAt(t,o){const c=J(t,o).p.normalize(),s=Math.abs(c.y)>.999?new e.Vector3(0,0,-1):new e.Vector3(0,1,0);return new e.Quaternion().setFromRotationMatrix(new e.Matrix4().lookAt(new e.Vector3,c,s))},get under(){const t=new e.Vector3(0,1,0).applyMatrix3(G.m);return{lat:Math.asin(t.z)/d,lon:Math.atan2(t.y,t.x)/d}},get frame(){return G}};function L(){G=lt(h.track*d*I,B),n.uToEcef.value.copy(G.m);const t=Z??Q(I);dt=t;const o=nt(t,D);n.uSun.value.copy(o);const c=G.m.clone().transpose();T.uEciToStage.value.copy(c.multiply(mt)),f&&f.setOrientation(T.uEciToStage.value);const s=h.R+S,v=(t-D)*d,g=Math.sin(v),m=Math.cos(v),b=s*m-h.R,y=A((t+.27)/.54);let x=[0,0,0];if(b>-2){const E=8*wt(h.R/8,S/8,g),Ft=1.2*wt(h.R/1.2,S/1.2,g);x=Zt.map((Ot,It)=>Math.exp(-(Ot*E+Jt*Ft+$t[It]*E/8)))}n.uSunCam.value.set(x[0],x[1],x[2]),n.uSunVis.value=y,n.uStreak.value=A((t+.9)/.8)*(1-A((t-1.2)/2.6));const R=A((t-2)/16);ht=1.45-1.07*R,T.uGain.value=.8*(1-.8*y)*(1-.92*R),f&&f.setBrightness(.13*(1-.75*y)*(1-.95*R));const H=Math.max(x[0],x[1],x[2],1e-4),k=[x[0]/H,x[1]/H,x[2]/H],qt=[1,.62,.42],U=y,Nt=[0,1,2].map(E=>qt[E]*(1-U)+k[E]*U);V.dir=[o.x,Math.max(o.y,-.1),o.z],V.color=Nt;const yt=.14+.91*U,at=.25*yt+.07*R;V.ambient=[.3,.38,.62],a.setSun({dir:V.dir,color:V.color,ambient:V.ambient},{key:yt,rim:1.1+.25*U,hue:.45-.2*U,shade:.25,shadeColor:[.8*at,.92*at,1.3*at]}),a.setBounce([.05,.08,.14].map(E=>E+.3*R),.05+.1*R),a.setHaze([0,0,0],0)}a.setGround(null),a.groundY=-1e6,L();function bt(t,o,c){o.updateMatrixWorld(),n.uInvProj.value.copy(o.projectionMatrixInverse),n.uCamRot.value.setFromMatrix4(o.matrixWorld),n.uPx.value=2*Math.tan(o.fov*d/2)/Math.max(1,c.bh),n.uExposure.value=ht,f&&f.prepare(o,c),t.render(z,P),T.uView.value.setFromMatrix4(o.matrixWorldInverse),T.uProj.value.copy(o.projectionMatrix),T.uDpr.value=c.dpr,T.uScale.value=c.height/720,t.render(ut,P)}const $=[],[tt,et,ot]=await Promise.all([C(r,"earth-day-1024.jpg"),C(r,"earth-night-1024.jpg"),C(r,"earth-cloud-1024.jpg")]);$.push(tt,et,ot),n.uDay.value=tt,n.uNight.value=et,n.uCloud.value=ot,n.uDayHi.value=tt,n.uNightHi.value=et,n.uCloudHi.value=ot,n.uHasLo.value=1;let vt=!1;const St=Promise.all([C(r,"earth-day-2048.jpg"),C(r,"earth-night-2048.jpg"),C(r,"earth-cloud-2048.jpg"),C(r,"earth-day-atl.jpg"),C(r,"earth-night-atl.jpg"),C(r,"earth-cloud-atl.jpg"),f?f.ready:null]).then(([t,o,c,s,v,g])=>{const m=[t,o,c,s,v,g];if(vt){m.forEach(y=>y.dispose());return}for(const y of[s,v,g])y.wrapS=e.ClampToEdgeWrapping;$.push(...m),n.uDay.value=t,n.uNight.value=o,n.uCloud.value=c,n.uDayHi.value=s,n.uNightHi.value=v,n.uCloudHi.value=g,n.uHasHi.value=1,n.uCloudTexel.value.set(1/g.image.width,1/g.image.height);const b=a.renderer;for(const y of m)b.initTexture(y)}).catch(t=>{console.warn("galaxy orbit: full-size textures failed",t)}),gt=40,Rt=4.3,Tt=t=>(-41+6*A(t))*d,Ht=t=>-(F(h.h)-11.5+13*A((t-.22)/.7))*d,kt=t=>(28-7*Math.cos(1.8*Math.PI*t))*d,xt=t=>7*1.8*Math.PI*Math.sin(1.8*Math.PI*t),Mt=t=>-.12-.0072*(xt(t)*.5+xt(t-.04)*.5),Ct=t=>[.655+.014*Math.sin(2*Math.PI*.7*t+.4),.64+.11*A((t-.3)/.25)+.012*Math.sin(2*Math.PI*.9*t+1.1)],zt=new e.Euler(0,0,0,"YXZ");function Pt(t){const o=.12*Mt(t-.05);return new e.Quaternion().setFromEuler(zt.set(Ht(t),-Tt(t),-o))}function ae(t){const o=Pt(t),c=new e.Vector3(0,0,-2.2*t),[s,v]=Ct(t),g=(a.width||16)/(a.height||9),m=Math.tan(gt*d/2),b=new e.Vector3((2*s-1)*g*m,(1-2*v)*m,-1).normalize().applyQuaternion(o),y=c.clone().addScaledVector(b,Rt),R=Math.atan2(b.x,-b.z)-kt(t),H=new e.Vector3(Math.sin(R),-.1,-Math.cos(R)),k=_t(H,Mt(t));return{hero:{p:y.toArray(),q:k.toArray()},camera:{p:c.toArray(),q:o.toArray(),fov:gt,u:t}}}let j=null;function Y(t){const o=(a.width||16)/(a.height||9);(!j||Math.abs(j.aspect-o)>1e-4)&&(j={aspect:o,...Wt({aspect:o})});const c=Math.max(0,Math.min(1,t)),s=j.shot(c);return{hero:{p:s.hero.p,q:s.hero.q},camera:{p:s.p,q:s.q,fov:s.fov,u:j.pass(c)},heroV:s.heroV,kind:s.kind}}const Vt={start:Y(0).hero.p,mid:Y(.5).hero.p,end:Y(1).hero.p,sunrise:nt(0,F(h.h)).multiplyScalar(1e3).toArray(),below:[0,-1e3,0]};let q=null;async function Et(){if(q)return q;const t=await(await fetch(await r.asset("../../kit/props/stars.json"))).json();return q=Array.isArray(t)?t:t.stars,q}Et().catch(()=>{});function At(t){let o,c,s,v;if(typeof t=="number"){const x=_[t];if(!x)return null;[o,c,s]=x,v=String(t)}else{if(!q)return null;const x=String(t).replace(/\s+/g," ").trim().toLowerCase(),R=k=>k.replace(/\s+/g," ").trim().toLowerCase(),H=q.find(k=>k[5]&&(R(k[5])===x||R(k[5].replace(/^\d+/,""))===x));if(!H)return null;[,o,c,s]=H,v=H[5]}const g=o*d,m=c*d,b=new e.Vector3(Math.cos(m)*Math.cos(g),Math.cos(m)*Math.sin(g),Math.sin(m)).applyMatrix3(T.uEciToStage.value).normalize(),y=a.camera.position.clone().addScaledVector(b,1e3);return{dir:b,screen:a.toScreen(y),mag:s,name:v}}function Bt(t){S=t==null?h.h:Math.max(160,Math.min(4e5,+t||h.h)),D=F(S),n.uRH.value=h.R+S,n.uDip.value=D*d,L()}function Gt(){const t=h.R+S,o=398600.4418,c=pt.under;return{altitudeKm:S,earthRadiusKm:h.R,distanceToCentreKm:t,metresPerStageUnit:1,kmPerEarthUnit:1,horizonKm:Math.sqrt(t*t-h.R*h.R),limbBelowHorizontalDeg:D,orbitalSpeedKmS:Math.sqrt(o/t),periodMin:2*Math.PI*Math.sqrt(t*t*t/o)/60,lat:c.lat,lon:c.lon,headingDeg:B.heading,sunAboveLimbDeg:dt,earthAngularDiameterDeg:2*Math.asin(h.R/t)/d}}return{draw:bt,flight:Y,anchors:Vt,ready:St,light:V,earth:pt,starAt:At,setAltitude:Bt,readout:Gt,sky:f,setPass(t){const o=Math.max(0,Math.min(1,t));o!==I&&(I=o,L())},setSunAngle(t){Z=t==null?null:+t,L()},setPlace(t){B=t&&Number.isFinite(+t.lat)&&Number.isFinite(+t.lon)?{lat:+t.lat,lon:+t.lon,heading:Number.isFinite(+t.heading)?+t.heading:X.heading}:{...X},ft(),L()},get place(){return{...B}},get passU(){return I},sunHeight:Q,setTime(){},setQuality(t){u=t==="low"?10:22,n.uSteps.value=u},dispose(){vt=!0;for(const t of $)t.dispose();f&&f.dispose(),l.dispose(),M.dispose(),O.dispose(),ct.dispose()}}}function A(a){const r=Math.max(0,Math.min(1,a));return r*r*(3-2*r)}const te=`
precision highp float;
precision highp int;
in vec2 vNdc;
out vec4 outColor;
uniform mat4 uInvProj;
uniform mat3 uCamRot, uToEcef;
uniform vec3 uSun, uSunCam;
uniform float uSunVis, uExposure, uPx, uHasLo, uHasHi, uRH, uDip, uStreak;
uniform int uSteps;
uniform sampler2D uDay, uNight, uCloud, uDayHi, uNightHi, uCloudHi;
uniform vec4 uRegion;
uniform vec2 uCloudTexel;
const float R = 6371.0, RT = 6466.0, HR = 8.0, HM = 1.2, PI = 3.14159265;
const vec3 BR = vec3(5.802e-3, 13.558e-3, 33.1e-3);
const float BM = 3.996e-3, BME = 4.44e-3;
const vec3 BO = vec3(0.0195, 0.056, 0.0026);
const vec3 ESUN = vec3(1.0, 0.985, 0.96);
${Lt}
/*SKY*/
float chap(float X, float h, float mu) {
  float c = sqrt(X + h);
  if (mu >= 0.0) return c / (c * mu + 1.0) * exp(-h);
  float x0 = sqrt(max(0.0, 1.0 - mu * mu)) * (X + h);
  return 2.0 * sqrt(x0) * exp(X - x0) - c / (1.0 - c * mu) * exp(-h);
}
vec3 sunT(vec3 p, float r) {
  float mu = dot(p, uSun) / r;
  float ht = r * sqrt(max(0.0, 1.0 - mu * mu)) - R;
  float lit = mu < 0.0 ? smoothstep(-2.0, 6.0, ht) : 1.0;
  if (lit <= 0.0) return vec3(0.0);
  float alt = max(r - R, 0.0);
  float tr = HR * chap(R / HR, alt / HR, mu);
  float tm = HM * chap(R / HM, alt / HM, mu);
  return exp(-(BR * tr + BME * tm + BO * tr / HR)) * lit;
}
float beckmann(float nh, float m) {
  float c2 = nh * nh, m2 = m * m;
  return exp((c2 - 1.0) / (m2 * c2)) / (PI * m2 * c2 * c2);
}
float lum(vec3 c) { return dot(c, vec3(0.2126, 0.7152, 0.0722)); }
vec2 llOf(vec3 n) { vec3 e = uToEcef * n; return vec2(atan(e.y, e.x), asin(clamp(e.z, -1.0, 1.0))); }
vec2 uvG(vec2 ll) { return vec2(ll.x / (2.0 * PI) + 0.5, ll.y / PI + 0.5); }
vec2 uvR(vec2 ll) { return vec2((ll.x - uRegion.x) / uRegion.z, (ll.y - uRegion.y) / uRegion.w); }
float wR(vec2 ru) { return uHasHi * smoothstep(0.0, 0.015, min(min(ru.x, 1.0 - ru.x), min(ru.y, 1.0 - ru.y))); }
// the day's picture (VIIRS true colour, 20 July 2023), linear; bias softens it (for the clouds' relief and shadows)
vec4 cubW(float v) {
  vec4 n = vec4(1.0, 2.0, 3.0, 4.0) - v;
  vec4 s = n * n * n;
  float x = s.x, y = s.y - 4.0 * s.x, z = s.z - 4.0 * s.y + 6.0 * s.x;
  return vec4(x, y, z, 6.0 - x - y - z) * (1.0 / 6.0);
}
vec3 cubicHi(vec2 uv) {
  vec2 ts = 1.0 / uCloudTexel;
  vec2 st = uv * ts - 0.5;
  vec2 f = fract(st);
  st -= f;
  vec4 xc = cubW(f.x), yc = cubW(f.y);
  vec4 c = st.xxyy + vec2(-0.5, 1.5).xyxy;
  vec4 s = vec4(xc.xz + xc.yw, yc.xz + yc.yw);
  vec4 o = (c + vec4(xc.yw, yc.yw) / s) * uCloudTexel.xxyy;
  vec3 s0 = texture(uCloudHi, o.xz).rgb, s1 = texture(uCloudHi, o.yz).rgb, s2 = texture(uCloudHi, o.xw).rgb, s3 = texture(uCloudHi, o.yw).rgb;
  float sx = s.x / (s.x + s.y), sy = s.z / (s.z + s.w);
  return mix(mix(s3, s2, sx), mix(s1, s0, sx), sy);
}
vec3 cloudPic(vec2 ll, float bias) {
  vec2 ru = uvR(ll);
  vec3 g = texture(uCloud, uvG(ll), bias).rgb;
  vec3 h = texture(uCloudHi, clamp(ru, 0.0, 1.0), bias).rgb;
  return fromSRGB(mix(g, h, wR(ru)));
}
// a cloud's top above the sea (km) and its cover, from the picture's brightness: thick bright cloud stands tall
float topOf(vec3 V) { return 1.2 + 9.0 * smoothstep(0.12, 0.85, lum(V)); }
float coverOf(vec3 V) { return smoothstep(0.035, 0.30, lum(V)); }
vec3 onSphere(vec3 n, vec3 t, float km) { return normalize(n + t * (km / R)); }
// one size of light points: g in km on the ground, cells of cell km, L the map's light here, foot km per pixel
float cityPts(vec2 g, float cell, float L, float foot) {
  vec2 q = g / cell;
  vec2 c = floor(q), f = fract(q) - 0.5;
  uint hh = pcgH(uint(int(c.x) + 4194304) * 7919u + pcgH(uint(int(c.y) + 4194304) + uint(int(cell * 64.0))));
  float hsh = float(hh & 65535u) / 65535.0;
  vec2 jit = vec2(float((hh >> 16u) & 255u), float(hh >> 24u)) / 255.0 - 0.5;
  float P = clamp(L * 0.9, 0.0, 1.0);
  float sg = clamp(0.55 * foot / cell, 0.08, 0.35);              // about half a pixel, in cell units
  vec2 d = f - 0.6 * jit * (0.5 - sg);
  float pk = exp(-dot(d, d) / (2.0 * sg * sg));
  return step(hsh, P) * pk * L / max(P * 6.2832 * sg * sg, 1e-3);
}
void main() {
  vec4 v4 = uInvProj * vec4(vNdc, 1.0, 1.0);
  vec3 rd = normalize(uCamRot * (v4.xyz / v4.w));
  float RH = uRH;
  vec3 ro = vec3(0.0, RH, 0.0);
  float b = RH * rd.y;
  float cosT = dot(rd, uSun);
  float cT = (RH - RT) * (RH + RT), dT = b * b - cT;
  float cG = (RH - R) * (RH + R), dG = b * b - cG;
  bool hitG = b < 0.0 && dG > 0.0;
  float tG = hitG ? (cG / (-b + sqrt(dG))) : 1e9;           // stable near root
  vec3 L = vec3(0.0);
  vec3 Tv = vec3(1.0);
  if (b < 0.0 && dT > 0.0) {
    float sq = sqrt(dT);
    float t0 = cT / (-b + sq), t1 = min(-b + sq, tG);
    float tc = clamp(-b, t0, t1);
    float f = (tc - t0) / max(t1 - t0, 1e-3);
    float fl = max(f, 1e-4), fr = max(1.0 - f, 1e-4);
    float odR = 0.0, odM = 0.0;
    float phR = 3.0 / (16.0 * PI) * (1.0 + cosT * cosT);
    const float g = 0.76;
    float phM = 3.0 / (8.0 * PI) * (1.0 - g * g) * (1.0 + cosT * cosT) / ((2.0 + g * g) * pow(1.0 + g * g - 2.0 * g * cosT, 1.5));
    float N = float(uSteps);
    for (int i = 0; i < 64; i++) {
      if (i >= uSteps) break;
      float x = (float(i) + 0.5) / N;
      float t, dtdx;
      if (x < f) { float k = (f - x) / fl; t = tc - (tc - t0) * k * k; dtdx = 2.0 * (tc - t0) * k / fl; }
      else { float k = (x - f) / fr; t = tc + (t1 - tc) * k * k; dtdx = 2.0 * (t1 - tc) * k / fr; }
      float ds = dtdx / N;
      vec3 p = ro + rd * t;
      float r = length(p);
      float alt = r - R;
      float dR = exp(-alt / HR), dM = exp(-alt / HM);
      float oR = odR + 0.5 * dR * ds, oM = odM + 0.5 * dM * ds;
      vec3 tv = exp(-(BR * oR + BME * oM + BO * oR / HR));
      vec3 ts = sunT(p, r);
      L += tv * ts * (BR * dR * phR + BM * dM * phM) * ds;
      odR += dR * ds; odM += dM * ds;
    }
    Tv = exp(-(BR * odR + BME * odM + BO * odR / HR));
  }
  vec3 col;
  float skyVis = 0.0;
  if (hitG) {
    vec3 p = ro + rd * tG;
    vec3 nrm = normalize(p);
    float mu = dot(nrm, uSun);
    vec2 ll = llOf(nrm);
    vec2 uv = uvG(ll), ru = uvR(ll);
    float w = wR(ru);
    vec3 day = vec3(0.012, 0.03, 0.07), night = vec3(0.0);
    if (uHasLo > 0.5) { day = texture(uDay, uv).rgb; night = texture(uNight, uv).rgb; }
    vec3 dayH = texture(uDayHi, clamp(ru, 0.0, 1.0)).rgb;
    // the lights: sampled a little sharper, minus their own blurred surround (the map's bloom)
    vec3 n0 = texture(uNightHi, clamp(ru, 0.0, 1.0), -0.6).rgb, nb = texture(uNightHi, clamp(ru, 0.0, 1.0), 2.2).rgb;
    day = mix(day, dayH, w);
    night = mix(night, max(n0 - 0.45 * nb, 0.0) * 1.5, w);
    vec3 alb = fromSRGB(day) * 0.92;
    vec3 nl = fromSRGB(night);
    float ocean = smoothstep(0.45, 0.75, (alb.b - alb.r) / (alb.b + 0.002)) * (1.0 - smoothstep(0.05, 0.12, alb.g));

    // ---- the clouds of the day: cover from the picture against the cloud-free Blue Marble -------------
    vec3 V = cloudPic(ll, 0.4);
    {
      // where the picture is magnified (near the bottom of the frame), a smooth B-spline instead of texel blocks
      vec2 rc = clamp(ru, 0.0, 1.0);
      vec2 dd = fwidth(rc) / uCloudTexel;
      float mag = (1.0 - smoothstep(0.6, 1.2, max(dd.x, dd.y))) * wR(ru);
      if (mag > 0.0) V = mix(V, fromSRGB(cubicHi(rc)), mag);
    }
    float lv = lum(V), lb = lum(alb);
    vec3 sv = sqrt(V);
    float sat = (max(sv.r, max(sv.g, sv.b)) - min(sv.r, min(sv.g, sv.b))) / max(max(sv.r, max(sv.g, sv.b)), 1e-3);
    float a = clamp((lv - lb - 0.010) / max(0.55 - lb, 0.05), 0.0, 1.0) * (1.0 - smoothstep(0.16, 0.36, sat));
    a = smoothstep(0.0, 0.9, pow(a, 0.85));
    vec3 cAlb = clamp((V - alb * (1.0 - a)) / max(a, 0.25), 0.0, 1.0);
    cAlb = vec3(lum(cAlb)) * vec3(0.99, 1.0, 1.02) * 1.05;   // the cloud's own colour: grey-white (the picture's tint is the afternoon's light, not the cloud's)
    // relief: the tops from the softened picture, their slope along the sun and across it
    vec3 T = uSun - nrm * mu;
    float lT = length(T);
    T = lT > 1e-5 ? T / lT : normalize(cross(nrm, vec3(0.0, 0.0, 1.0)));
    vec3 Bt = cross(nrm, T);
    float h0 = topOf(cloudPic(ll, 1.2));
    const float S = 5.0;
    float hT1 = topOf(cloudPic(llOf(onSphere(nrm, T, S)), 1.2)), hT0 = topOf(cloudPic(llOf(onSphere(nrm, T, -S)), 1.2));
    float hB1 = topOf(cloudPic(llOf(onSphere(nrm, Bt, S)), 1.2)), hB0 = topOf(cloudPic(llOf(onSphere(nrm, Bt, -S)), 1.2));
    vec3 nc = normalize(nrm - 0.32 * (((hT1 - hT0) / (2.0 * S)) * T + ((hB1 - hB0) / (2.0 * S)) * Bt));
    // long shadows: march toward the sun over the tops (curvature included) from the ground and from the top
    float cosE = sqrt(max(1.0 - mu * mu, 1e-6));
    float tanE = mu / cosE;
    float occG = 0.0, occC = 0.0;
    if (mu > -0.05) {
      for (int i = 0; i < 8; i++) {
        float s = 3.0 * pow(1.75, float(i));
        vec3 Vi = cloudPic(llOf(onSphere(nrm, T, s)), 1.0);
        float ai = coverOf(Vi), hi = topOf(Vi);
        float rise = s * tanE + s * s / (2.0 * R);
        occG = max(occG, ai * smoothstep(-0.8, 0.8, hi - rise));
        occC = max(occC, ai * smoothstep(-0.8, 0.8, hi - (h0 + rise)));
      }
    }
    vec3 ts = sunT(p * 1.000002, R + 0.01);
    vec3 tsC = sunT(nrm * (R + h0), R + h0);
    tsC = mix(vec3(lum(tsC)), tsC, 0.5);                 // light inside a cloud is scattered many times: a little whiter
    float lam = max(mu, 0.0);
    float dayK = smoothstep(-0.12, 0.2, mu);
    // skylight: the lit air above, blue, reaching a little past the terminator
    vec3 skyCol = vec3(0.10, 0.17, 0.34) * 0.10 * smoothstep(-0.20, 0.25, mu) * (0.45 + 0.55 * smoothstep(-0.05, 0.3, mu));
    vec3 diffuse = alb / PI * ESUN * ts * lam * (1.0 - 0.7 * occG);
    vec3 sky = alb * ESUN * skyCol;
    // the sea: a soft broad glint (wind-roughened water), Fresnel 2 %
    vec3 v = -rd;
    vec3 h = normalize(v + uSun);
    float nh = max(dot(nrm, h), 1e-3), nv = max(dot(nrm, v), 1e-3), vh = max(dot(v, h), 1e-3);
    float F = 0.02 + 0.98 * pow(1.0 - vh, 5.0);
    float G = min(1.0, min(2.0 * nh * nv / vh, 2.0 * nh * lam / vh));
    vec3 spec = lam > 0.0 ? ESUN * ts * F * beckmann(nh, 0.21) * G / (4.0 * nv) : vec3(0.0);
    spec = min(spec, vec3(3.0)) * 0.26 * (1.0 - 0.7 * occG);
    vec3 ground = diffuse + sky + spec * ocean;
    // the cloud: lit tops (wrapped: light goes into a cloud), shaded slopes and shadows filled by the blue sky
    float lc = clamp((dot(nc, uSun) + 0.12) / 1.12, 0.0, 1.0);
    float sunSide = smoothstep(-0.02, 0.06, dot(nrm, uSun) + h0 / 900.0);
    vec3 cloudLit = cAlb / PI * ESUN * tsC * lc * 2.9 * (1.0 - 0.45 * occC) * sunSide;
    vec3 cloudSky = cAlb * ESUN * skyCol * 2.4;
    // looking toward the sun, thin cloud and cloud edges glow with light scattered forward through them (the silver lining)
    float gF = 0.65, hg = (1.0 - gF * gF) / (4.0 * PI * pow(1.0 + gF * gF - 2.0 * gF * cosT, 1.5));
    cloudLit += ESUN * tsC * hg * 0.9 * (1.0 - smoothstep(0.35, 0.95, a)) * sunSide * (1.0 - 0.6 * occC);
    // city lights: the Black Marble map says where light is and how much; it is broken into fine points of
    // light fixed on the ground, each lit with a chance set by the map, about a pixel across at any distance
    // (cells of 0.5 km x 2^n chosen by the pixel's footprint, two sizes blended), so the light keeps its
    // amount and never smears into a blob.
    float lights = max(0.0, nl.r - 1.15 * nl.b);
    lights = pow(lights, 1.6) * 2.6;
    vec2 gkm = vec2(ll.x * R * cos(ll.y), ll.y * R);
    vec2 fwk = fwidth(gkm);
    float foot = max(max(fwk.x, fwk.y), 1e-3);
    float lod = log2(max(foot * 1.3 / 0.5, 1.0));
    float l0 = floor(lod);
    lights = mix(cityPts(gkm, 0.5 * exp2(l0), lights, foot), cityPts(gkm, 0.5 * exp2(l0 + 1.0), lights, foot), lod - l0);
    float dark = 1.0 - smoothstep(-0.10, 0.03, mu);
    vec3 city = mix(vec3(1.0, 0.58, 0.26), vec3(1.0, 0.86, 0.66), smoothstep(0.5, 3.0, lights)) * lights * 0.16 * dark * (1.0 - 0.85 * a);
    vec3 floorN = mix(alb, vec3(0.5), a) * vec3(0.0010, 0.0012, 0.0018);   // starlight and airglow on the night ground: never pure black
    vec3 surf = mix(ground, cloudLit + cloudSky, a) + city + floorN;
    col = L + Tv * surf;
  } else {
    vec3 space = vec3(0.0010, 0.0012, 0.0020);
    float ang = acos(clamp(cosT, -1.0, 1.0));
    float rs = 0.00466;
    float disc = smoothstep(rs + uPx, rs - uPx, ang);
    // limb darkening of the disc
    float ld = 1.0 - 0.45 * (1.0 - sqrt(max(0.0, 1.0 - pow(min(ang / rs, 1.0), 2.0))));
    // the disc through the limb's air: deep orange while the path is long (hue kept, not blown to white), white once clear
    vec3 hue = Tv / max(max(Tv.r, Tv.g), 1e-6);
    float k = 3200.0 * pow(max(Tv.r, 1e-6), 1.6);
    col = L + Tv * space + ESUN * disc * ld * hue * k;
    // night-side airglow: the faint thin green line ~95 km up, seen edge on
    float rt = RH * sqrt(max(0.0, 1.0 - rd.y * rd.y));
    float ht = rt - R;
    vec3 pt = ro + rd * max(-b, 0.0);
    float side = 1.0 - smoothstep(-0.25, 0.05, dot(normalize(pt), uSun));
    col += vec3(0.20, 0.55, 0.26) * 0.0055 * exp(-pow((ht - 95.0) / 5.0, 2.0)) * side * step(b, 0.0);
    skyVis = lum(Tv);
  }
  // the sun's glare: a small hot core, a soft natural halo and a wide faint bloom (no lens ghosts), only while the disc is up
  float ang2 = acos(clamp(cosT, -1.0, 1.0));
  vec3 glare = uSunCam * uSunVis * (0.9 / pow(1.0 + pow(ang2 / 0.0050, 2.0), 1.35) + 0.006 * exp(-ang2 / 0.04) + 0.0012 * exp(-ang2 / 0.22));
  // the short bright streak along the limb beside the sun, while the disc sits on the edge
  float el = asin(clamp(rd.y, -1.0, 1.0)) + uDip;               // height above the limb (radians)
  vec2 hz = normalize(rd.xz + 1e-6), hs = normalize(uSun.xz + 1e-6);
  float daz = acos(clamp(dot(hz, hs), -1.0, 1.0));
  vec3 streak = uSunCam * uStreak * (0.09 * exp(-pow((el - 0.0012) / 0.0024, 2.0)) * exp(-daz / 0.05) + 0.012 * exp(-pow((el - 0.002) / 0.006, 2.0)) * exp(-daz / 0.12));
  col += glare + streak;
  vec3 c = acesFit(col * 7.0 * uExposure / 0.6);
#ifdef HAS_SKY
  // the real Milky Way (a photograph: display-referred), as faint as a dawn exposure keeps it, only where the sky is clear
  c += skyPhoto(rd) * skyVis * (1.0 - smoothstep(0.0, 0.25, lum(c))) * smoothstep(0.02, 0.3, ang2);
#endif
  outColor = vec4(toSRGB(c) + dither(gl_FragCoord.xy), 1.0);
}
`,ee=`
precision highp float;
in vec3 position;
in vec3 color;
in float mag;
uniform mat3 uEciToStage, uView;
uniform mat4 uProj;
uniform float uDpr, uScale, uGain, uRH;
uniform vec3 uSun;
out vec3 vCol;
out float vSize;
const float R = 6371.0;
void main() {
  vec3 d = normalize(uEciToStage * position);
  vec3 vd = uView * d;
  vec4 clip = uProj * vec4(vd, 0.0);
  clip.z = clip.w * 0.99999;
  gl_Position = clip;
  // hidden by Earth, dimmed through the limb's air
  float vis = 1.0;
  if (d.y < 0.0) {
    float ht = uRH * sqrt(max(0.0, 1.0 - d.y * d.y)) - R;
    vis = smoothstep(30.0, 110.0, ht);
  }
  // near the sun the glare hides them
  vis *= smoothstep(0.03, 0.25, acos(clamp(dot(d, uSun), -1.0, 1.0)));
  float flux = pow(10.0, -0.4 * (mag - 1.0));
  float b = pow(flux, 0.45) * 2.3 * uGain * vis;
  // crisp: about 1.6 px across for the faint, a little more for the brightest (at 720p, x dpr)
  float s = (1.5 + 1.6 * clamp(1.5 - mag * 0.35, 0.0, 1.6)) * uDpr * max(0.75, uScale);
  vSize = s;
  gl_PointSize = s * 2.6;
  vCol = color * min(b, 3.0);
  if (b < 0.0025) gl_Position = vec4(2.0, 2.0, 2.0, 1.0);
}
`,oe=`
precision highp float;
in vec3 vCol;
in float vSize;
out vec4 outColor;
void main() {
  vec2 q = (gl_PointCoord - 0.5) * 2.6;
  float r2 = dot(q, q);
  float core = exp(-r2 * 5.5);
  float halo = 0.04 * exp(-r2 * 1.4);
  vec3 c = vCol * (core + halo);
  // display-referred: a gentle shoulder so the brightest stay small and white, not bloated
  c = 1.0 - exp(-c * 1.4);
  outColor = vec4(c, 0.0);
}
`;export{h as EARTH,re as createOrbit};
