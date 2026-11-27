import*as f from"three";import{buildTake as K,planeHero as H,planeV as O,C as z}from"./shot.js";const j=`
uniform vec3 uSun, uCol, uLens;
uniform float uVis, uGain, uFocus, uK, uPx, uMaxPx, uTime;
attribute vec4 aN;          // facet normal (xyz), brightness (w)
attribute vec3 aSpin;       // tumble axis (xyz, length = rate)
varying vec3 vCol;
varying float vR;
vec3 rot(vec3 v, vec3 ax, float a) { float c = cos(a), s = sin(a); return v * c + cross(ax, v) * s + ax * dot(ax, v) * (1.0 - c); }
void main() {
  vec4 mv = modelViewMatrix * vec4(position, 1.0);
  float d = -mv.z;
  vec3 v = normalize(position - uLens);                 // from the lens to the crystal
  float c = max(dot(v, uSun), 0.0);                     // 1: the crystal is in front of the sun (forward scatter)
  float phase = 0.8 + 0.9 * c * c * c + 7.0 * pow(c, 18.0);
  float sl = length(aSpin);
  vec3 n = sl > 0.0 ? rot(aN.xyz, aSpin / sl, sl * uTime) : aN.xyz;
  vec3 h = normalize(uSun - v);
  float glint = 6.0 * pow(abs(dot(n, h)), 40.0);         // the facet catching the sun for this view
  float flux = aN.w * (phase + glint) * uVis * uGain / max(d * d, 0.06);
  float r = clamp(uK * abs(1.0 / max(d, 0.05) - 1.0 / uFocus), 0.75, uMaxPx / uPx) * uPx;   // the circle of confusion, px
  float near = smoothstep(0.22, 0.45, d);               // nothing sits on the glass
  float far = 1.0 - smoothstep(4.0, 6.5, d);
  vR = r;
  float I = flux * near * far / (3.14159 * max(pow(r, 1.6), 1.0));
  vCol = uCol * 1.25 * (1.0 - exp(-I));                 // saturates gold, never to a flat white
  gl_PointSize = 2.0 * r + 3.0;
  gl_Position = projectionMatrix * mv;
  if (d < 0.05 || flux * near * far < 1e-5) gl_Position = vec4(2.0, 2.0, 2.0, 1.0);
}`,U=`
varying vec3 vCol;
varying float vR;
void main() {
  float s = vR + 1.5;
  float rr = length(gl_PointCoord * 2.0 - 1.0) * s;     // px from the centre
  float a;
  if (vR < 2.5) a = exp(-rr * rr / max(0.6, 0.55 * vR * vR));
  else {
    float e = max(1.0, 0.22 * vR);
    float disc = 1.0 - smoothstep(vR - e, vR + 0.6 * e, rr);
    float rim = 0.72 + 0.4 * smoothstep(0.45 * vR, 0.95 * vR, rr);   // a bokeh disc: a touch brighter toward its rim
    a = disc * rim;
  }
  if (a < 0.002) discard;
  gl_FragColor = vec4(vCol * a, 1.0);
}`;function W(M){let s=M>>>0;return()=>{s=s+1831565813>>>0;let i=Math.imul(s^s>>>15,1|s);return i=i+Math.imul(i^i>>>7,61|i)^i,((i^i>>>14)>>>0)/4294967296}}function D(M,{count:s=1050,seed:i=1962,until:A=.42,radius:C=2.2,round:V=120,close:B=220}={}){const P=K({aspect:1.7777777777777777}),g=[],p=[];for(let t=0;t<=160;t++){const e=P.shot(A*t/160);g.push(e.p),p.push(e.hero.p)}for(let t=1;t<=80;t++)p.push(P.hero(P.heroAt(A)+(1-P.heroAt(A))*t/80).p);for(let t=0;t<=120;t++)p.push(H(O(t/120)).p);for(let t=0;t<12;t++)p.push([z[0]+.5*Math.cos(t*.52),z[1],z[2]+.5*Math.sin(t*.52)]);const l=[1e9,1e9,1e9],d=[-1e9,-1e9,-1e9];for(const t of g)for(let e=0;e<3;e++)l[e]=Math.min(l[e],t[e]-C),d[e]=Math.max(d[e],t[e]+C);for(const t of p.slice(0,161))for(let e=0;e<3;e++)l[e]=Math.min(l[e],t[e]-1.5),d[e]=Math.max(d[e],t[e]+1.5);const E=(t,e)=>(t[0]-e[0])**2+(t[1]-e[1])**2+(t[2]-e[2])**2,F=(t,e)=>{let o=1e18;for(const a of e)o=Math.min(o,E(t,a));return Math.sqrt(o)},k=t=>{let e=1e18;for(let o=0;o<g.length;o++){const a=g[o],u=p[o],r=[u[0]-a[0],u[1]-a[1],u[2]-a[2]],c=[t[0]-a[0],t[1]-a[1],t[2]-a[2]],m=Math.max(0,Math.min(1,(r[0]*c[0]+r[1]*c[1]+r[2]*c[2])/(r[0]**2+r[1]**2+r[2]**2)));e=Math.min(e,(c[0]-r[0]*m)**2+(c[1]-r[1]*m)**2+(c[2]-r[2]*m)**2)}return Math.sqrt(e)},h=W(i),T=new Float32Array(s*3),G=new Float32Array(s*4),_=new Float32Array(s*3);let n=0,q=0;for(;n<s&&q++<s*400;){const t=[l[0]+h()*(d[0]-l[0]),l[1]+h()*(d[1]-l[1]),l[2]+h()*(d[2]-l[2])],e=F(t,g),o=F(t,p);if(e<.36||o<.45||(n<B?e>1.3:n<s-V?e>C:o>1.5)||k(t)<.4)continue;T.set(t,n*3);const a=h()*2-1,u=h()*Math.PI*2,r=Math.sqrt(1-a*a),c=.25+1.75*Math.pow(h(),3);G.set([r*Math.cos(u),r*Math.sin(u),a,c],n*4);const m=h()*2-1,y=h()*Math.PI*2,R=Math.sqrt(1-m*m),x=.15+.5*h();_.set([R*Math.cos(y)*x,R*Math.sin(y)*x,m*x],n*3),n++}const w=new f.BufferGeometry;w.setAttribute("position",new f.BufferAttribute(T.subarray(0,n*3),3)),w.setAttribute("aN",new f.BufferAttribute(G.subarray(0,n*4),4)),w.setAttribute("aSpin",new f.BufferAttribute(_.subarray(0,n*3),3));const I=M.renderer.getContext(),L=Math.min(120,(I.getParameter(I.ALIASED_POINT_SIZE_RANGE)||[1,64])[1]||64),v={uSun:{value:new f.Vector3(0,0,-1)},uCol:{value:new f.Color(1,.8,.6)},uLens:{value:new f.Vector3},uVis:{value:0},uGain:{value:1},uFocus:{value:3},uK:{value:34},uPx:{value:1},uMaxPx:{value:(L-4)/2},uTime:{value:0}},N=new f.ShaderMaterial({vertexShader:j,fragmentShader:U,uniforms:v,transparent:!0,depthWrite:!1,depthTest:!0,blending:f.AdditiveBlending}),b=new f.Points(w,N);b.frustumCulled=!1,b.renderOrder=5,M.scene.add(b);const S=t=>{const e=Math.min(1,Math.max(0,t));return e*e*(3-2*e)};return{count:n,update({lens:t,focus:e,sunDir:o,colour:a,sunV:u,time:r=0,height:c=720,dpr:m=1}){const y=S((u+.27)/.54),R=S((u-2)/16);v.uLens.value.set(t[0],t[1],t[2]),v.uSun.value.set(o[0],o[1],o[2]).normalize();const x=.5*(1-S((u-3)/14));v.uCol.value.setRGB(a[0]+(1-a[0])*x,a[1]+(.82-a[1])*x,a[2]+(.6-a[2])*x),v.uVis.value=y,v.uGain.value=52*(1-.8*R),v.uFocus.value=Math.max(.5,e),v.uPx.value=c/720*m,v.uTime.value=r,b.visible=y>1e-4},dispose(){M.scene.remove(b),w.dispose(),N.dispose()}}}export{D as createCrystals};
