import*as r from"three";import{clamp as k}from"../ease.js";const d=Math.PI/180;async function V(n,f="../../kit/props/stars.json"){return(await fetch(await n.asset(f))).json()}const R=n=>n.getTime()/864e5+24405875e-1;function F(n,f,s,i=new r.Matrix3,{precess:o=!0}={}){const e=R(s),a=(e-2451545)/36525,h=t=>t/3600*d,M=h(2306.2181*a+.30188*a*a+.017998*a**3),c=h(2306.2181*a+1.09468*a*a+.018203*a**3),u=h(2004.3109*a-.42665*a*a-.041833*a**3),g=t=>new r.Matrix3().set(Math.cos(t),-Math.sin(t),0,Math.sin(t),Math.cos(t),0,0,0,1),y=t=>new r.Matrix3().set(Math.cos(t),0,-Math.sin(t),0,1,0,Math.sin(t),0,Math.cos(t)),z=o?g(c).multiply(y(u)).multiply(g(M)):new r.Matrix3,x=((280.46061837+360.98564736629*(e-2451545)+387933e-9*a*a-a**3/3871e4+f)%360+360)%360*d,T=new r.Matrix3().set(Math.cos(x),Math.sin(x),0,-Math.sin(x),Math.cos(x),0,0,0,1),v=n*d,b=new r.Matrix3().set(0,1,0,Math.cos(v),0,Math.sin(v),Math.sin(v),0,-Math.cos(v));return i.copy(b.multiply(T).multiply(z))}function _(n,f,s,i=new r.Vector3){const o=R(s)-2451545,e=(280.46+.9856474*o)*d,a=(357.528+.9856003*o)*d,h=e+(1.915*Math.sin(a)+.02*Math.sin(2*a))*d,M=(23.439-4e-7*o)*d,c=Math.atan2(Math.cos(M)*Math.sin(h),Math.cos(h)),u=Math.asin(Math.sin(M)*Math.sin(h)),g=new r.Vector3(Math.cos(u)*Math.cos(c),Math.cos(u)*Math.sin(c),Math.sin(u));return i.copy(g.applyMatrix3(F(n,f,s,new r.Matrix3,{precess:!1}))).normalize()}function B(n){(n==null||!isFinite(n))&&(n=.6),n=k(n,-.4,2);const s=4600*(1/(.92*n+1.7)+1/(.92*n+.62))/100;let i,o,e;return s<=66?(i=255,o=99.4708025861*Math.log(s)-161.1195681661,e=s<=19?0:138.5177312231*Math.log(s-10)-305.0447927307):(i=329.698727446*(s-60)**-.1332047592,o=288.1221695283*(s-60)**-.0755148492,e=255),[k(i/255),k(o/255),k(e/255)]}const D=`
attribute vec4 aStar;     // magnitude, rank (0 brightest .. 1), twinkle phase, twinkle rate
attribute vec3 aColour;
uniform mat3 uSky;
uniform float uTime, uReveal, uTwinkle, uBright, uSize, uPx, uHorizon, uMaxMag, uDistance;
varying vec3 vColour; varying float vAlpha; varying float vSigma;
void main() {
  vec3 dir = normalize(uSky * position);
  float alt = asin(clamp(dir.y, -1.0, 1.0));
  vec3 wp = cameraPosition + dir * uDistance;
  vec4 clip = projectionMatrix * viewMatrix * vec4(wp, 1.0);
  clip.z = clip.w * 0.99999;                     // at the very back: everything else is in front
  gl_Position = clip;
  float m = aStar.x;
  // the come-out order: brightest first; each star fades in with a small swell
  float at = pow(aStar.y, 0.55) * 0.92;
  float on = smoothstep(at, at + 0.06, uReveal);
  float swell = 1.0 + 0.35 * smoothstep(at, at + 0.03, uReveal) * (1.0 - smoothstep(at + 0.03, at + 0.09, uReveal));
  // brightness: a compressed version of the true flux (100x from 0 to 5 mag would leave the faint ones invisible)
  float s = clamp((uMaxMag + 0.6 - m) / 6.0, 0.0, 1.25);
  // low stars dim (the air) and fade out at the horizon
  float low = smoothstep(uHorizon * 0.0174533, uHorizon * 0.0174533 + 0.07, alt);
  float air = mix(0.55, 1.0, smoothstep(0.0, 0.35, alt));
  // the twinkle: two slow sines per star, stronger near the horizon (pure in time)
  float tw = uTwinkle * (0.07 + 0.2 * pow(1.0 - clamp(dir.y, 0.0, 1.0), 2.0));
  float flick = 1.0 + tw * (0.65 * sin(uTime * aStar.w + aStar.z) + 0.35 * sin(uTime * aStar.w * 2.31 + aStar.z * 1.7));
  vAlpha = clamp((0.42 + 0.9 * pow(s, 0.8)) * uBright, 0.0, 1.8) * on * low * air * flick;
  float sigma = (0.62 + 1.15 * pow(s, 1.25)) * uSize * swell;   // px (gaussian), at 720p, times uPx
  vSigma = sigma * uPx;
  gl_PointSize = vSigma * 6.0 + 2.0;
  vColour = aColour;
  if (dir.y < -0.05) { gl_PointSize = 0.0; vAlpha = 0.0; }
}`,j=`
varying vec3 vColour; varying float vAlpha; varying float vSigma;
void main() {
  vec2 q = (gl_PointCoord - 0.5) * (vSigma * 6.0 + 2.0);
  float r2 = dot(q, q);
  float core = exp(-r2 / (2.0 * vSigma * vSigma));
  float halo = 0.08 * exp(-r2 / (2.0 * 9.0 * vSigma * vSigma));
  float a = clamp((core + halo) * vAlpha, 0.0, 1.0);
  if (a < 0.002) discard;
  // the core goes toward white where it is brightest
  vec3 c = mix(vColour, vec3(1.0), core * 0.3);
  gl_FragColor = vec4(c * a, a);
}`;function I(n,f={}){const s=f.table;if(!s||!s.stars)throw new Error("createStars: pass { table } (await loadStarTable(env))");const i={latitude:42.45,longitude:-76.48,date:new Date("2026-09-04T01:00:00Z"),maxMag:5,size:1,brightness:1,twinkle:1,tint:.6,horizon:0,...f},o=s.stars.filter(t=>t[3]<=i.maxMag),e=o.length,a=new Float32Array(e*3),h=new Float32Array(e*4),M=new Float32Array(e*3);o.forEach((t,l)=>{const m=t[1]*d,S=t[2]*d;a.set([Math.cos(S)*Math.cos(m),Math.cos(S)*Math.sin(m),Math.sin(S)],l*3);const p=t[0]*.6180339887%1,A=t[0]*.7548776662%1;h.set([t[3],l/Math.max(1,e-1),p*6.2832,2.2+3.4*A],l*4);const w=B(t[4]).map(C=>1-i.tint+i.tint*C);M.set(w,l*3)});const c=new r.BufferGeometry;c.setAttribute("position",new r.BufferAttribute(a,3)),c.setAttribute("aStar",new r.BufferAttribute(h,4)),c.setAttribute("aColour",new r.BufferAttribute(M,3)),c.boundingSphere=new r.Sphere(new r.Vector3,1e9);const u={uSky:{value:new r.Matrix3},uTime:{value:0},uReveal:{value:1},uTwinkle:{value:i.twinkle},uBright:{value:i.brightness},uSize:{value:i.size},uPx:{value:1},uHorizon:{value:i.horizon},uMaxMag:{value:i.maxMag},uDistance:{value:1e3}},g=new r.ShaderMaterial({vertexShader:D,fragmentShader:j,uniforms:u,transparent:!0,depthWrite:!1,depthTest:!0,blending:r.CustomBlending,blendSrc:r.OneFactor,blendDst:r.OneMinusSrcAlphaFactor}),y=new r.Points(c,g);y.frustumCulled=!1,y.renderOrder=-10;let z=i.date,P=i.latitude,x=i.longitude;const T=()=>F(P,x,z,u.uSky.value);T();const v=new r.Vector3,b={object:y,count:e,table:o,set(t){let l=!1;return t.date&&(z=t.date,l=!0),t.latitude!==void 0&&(P=t.latitude,l=!0),t.longitude!==void 0&&(x=t.longitude,l=!0),l&&T(),t.time!==void 0&&(u.uTime.value=t.time),t.reveal!==void 0&&(u.uReveal.value=k(t.reveal)),t.brightness!==void 0&&(u.uBright.value=t.brightness),t.size!==void 0&&(u.uSize.value=t.size),t.twinkle!==void 0&&(u.uTwinkle.value=t.twinkle),t.horizon!==void 0&&(u.uHorizon.value=t.horizon),b},get date(){return z},direction(t,l=new r.Vector3){return l.fromArray(a,t*3).applyMatrix3(u.uSky.value).normalize()},find(t){if(typeof t=="number")return o.findIndex(m=>m[0]===t);const l=String(t).replace(/\s+/g," ").trim();return o.findIndex(m=>m[5]===l||m[5].replace(/^\d+/,"").trim()===l)},onScreen({maxMag:t=i.maxMag,margin:l=0}={}){const m=[],S=n.camera;for(let p=0;p<e;p++){if(o[p][3]>t||(b.direction(p,v),v.y<0))continue;const A=v.clone().multiplyScalar(1e3).add(S.position),w=n.toScreen(A);w.behind||w.x<-l||w.y<-l||w.x>n.width+l||w.y>n.height+l||A.clone().applyMatrix4(S.matrixWorldInverse).z>0||m.push({index:p,hr:o[p][0],name:o[p][5],mag:o[p][3],x:w.x,y:w.y,alt:Math.asin(v.y)/d})}return m},setStyle(){},update(t){u.uPx.value=t.height/720*Math.min(2,t.renderer.getPixelRatio()),u.uDistance.value=Math.min(1e3,t.camera.far*.5)},dispose(){c.dispose(),g.dispose()}};return b}function q(n=1600,f=7){let s=f>>>0||1;const i=()=>{s=s+1831565813>>>0;let e=s;return e=Math.imul(e^e>>>15,e|1),e^=e+Math.imul(e^e>>>7,e|61),((e^e>>>14)>>>0)/4294967296},o=[];for(let e=0;e<n;e++){const a=i()*2-1,h=i()*360,M=Math.asin(a)/d,c=5-6.5*(1-Math.pow(i(),.18));o.push([e+1,h,M,+c.toFixed(2),+(i()*1.6-.2).toFixed(2),""])}return o.sort((e,a)=>e[3]-a[3]),{source:"seeded random field (not a true sky)",stars:o}}export{I as createStars,R as julianDay,V as loadStarTable,q as randomTable,F as skyMatrix,_ as sunDirection};
